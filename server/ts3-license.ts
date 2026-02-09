import crypto from "crypto";

let ed25519Module: any = null;

async function getEd25519() {
  if (!ed25519Module) {
    ed25519Module = await import("@noble/curves/ed25519.js");
  }
  return ed25519Module.ed25519;
}

const ROOT_KEY = Buffer.from([
  0xcd, 0x0d, 0xe2, 0xae, 0xd4, 0x63, 0x45, 0x50,
  0x9a, 0x7e, 0x3c, 0xfd, 0x8f, 0x68, 0xb3, 0xdc,
  0x75, 0x55, 0xb2, 0x9d, 0xcc, 0xec, 0x73, 0xcd,
  0x18, 0x75, 0x0f, 0x99, 0x38, 0x12, 0x40, 0x8a,
]);

const BLOCK_MIN_LEN = 42;

interface LicenseBlock {
  len: number;
  keyBytes: Buffer;
  hashData: Buffer;
}

function parseLicenseBlocks(data: Buffer): LicenseBlock[] {
  const blocks: LicenseBlock[] = [];
  let offset = 1;

  while (offset < data.length && blocks.length < 8) {
    if (data.length - offset < BLOCK_MIN_LEN) break;

    const keyBytes = data.subarray(offset, offset + 32);
    const blockType = data[offset + 33];

    let blockLen = BLOCK_MIN_LEN;

    if (blockType === 0 || blockType === 2 || blockType === 8) {
      let strEnd = offset + BLOCK_MIN_LEN;
      while (strEnd < data.length && data[strEnd] !== 0) strEnd++;
      if (strEnd < data.length) strEnd++;
      blockLen = strEnd - offset;
    } else if (blockType === 32) {
      blockLen = BLOCK_MIN_LEN;
    } else {
      let strEnd = offset + BLOCK_MIN_LEN;
      while (strEnd < data.length && data[strEnd] !== 0) strEnd++;
      if (strEnd < data.length) strEnd++;
      blockLen = strEnd - offset;
    }

    if (offset + blockLen > data.length) {
      blockLen = data.length - offset;
    }

    const hashData = data.subarray(offset + 32, offset + blockLen);

    blocks.push({ len: blockLen, keyBytes, hashData });
    offset += blockLen;
  }

  return blocks;
}

function computeHashScalar(hashData: Buffer): bigint {
  const hash = crypto.createHash("sha512").update(hashData).digest();

  hash[0] &= 0xf8;
  hash[31] &= 0x3f;
  hash[31] |= 0x40;

  let scalar = 0n;
  for (let i = 0; i < 32; i++) {
    scalar |= BigInt(hash[i]) << BigInt(i * 8);
  }
  scalar = scalar % ED25519_ORDER;
  if (scalar === 0n) scalar = 1n;
  return scalar;
}

export async function deriveLicenseKey(licenseData: Buffer): Promise<Buffer> {
  const ed = await getEd25519();
  const blocks = parseLicenseBlocks(licenseData);

  let currentPoint = ed.Point.fromHex(
    Buffer.from(ROOT_KEY).toString("hex")
  );

  for (const block of blocks) {
    const hashScalar = computeHashScalar(block.hashData);

    let blockPubPoint;
    try {
      blockPubPoint = ed.Point.fromHex(
        Buffer.from(block.keyBytes).toString("hex")
      );
    } catch {
      continue;
    }

    try {
      const scaledPoint = blockPubPoint.multiply(hashScalar);
      currentPoint = scaledPoint.add(currentPoint);
    } catch {
      continue;
    }
  }

  const resultHex = currentPoint.toHex();
  return Buffer.from(resultHex, "hex");
}

const ED25519_ORDER = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;

function bufToScalarMod(buf: Buffer): bigint {
  let scalar = 0n;
  for (let i = 0; i < buf.length && i < 32; i++) {
    scalar |= BigInt(buf[i]) << BigInt(i * 8);
  }
  scalar = scalar % ED25519_ORDER;
  if (scalar === 0n) scalar = 1n;
  return scalar;
}

export async function ed25519DH(clampedPriv: Buffer, publicKeyBytes: Buffer): Promise<Buffer> {
  const ed = await getEd25519();
  const scalar = bufToScalarMod(clampedPriv);

  const pubPoint = ed.Point.fromHex(
    Buffer.from(publicKeyBytes).toString("hex")
  );
  const sharedPoint = pubPoint.multiply(scalar);
  const sharedHex = sharedPoint.toHex();
  return Buffer.from(sharedHex, "hex");
}

export async function generateEd25519KeyPairFull(): Promise<{ publicKey: Buffer; privateKey: Buffer; rawPriv: Buffer }> {
  const ed = await getEd25519();
  const rawPriv = crypto.randomBytes(32);

  const pubBytes = ed.getPublicKey(new Uint8Array(rawPriv));
  const pubKey = Buffer.from(pubBytes);

  const hash = crypto.createHash("sha512").update(rawPriv).digest();
  hash[0] &= 0xf8;
  hash[31] &= 0x7f;
  hash[31] |= 0x40;
  const clampedPriv = Buffer.from(hash.subarray(0, 32));

  return { publicKey: pubKey, privateKey: clampedPriv, rawPriv };
}

export async function signWithEd25519(rawPriv: Buffer, message: Buffer): Promise<Buffer> {
  const ed = await getEd25519();
  const sig = ed.sign(
    new Uint8Array(message),
    new Uint8Array(rawPriv)
  );
  return Buffer.from(sig);
}
