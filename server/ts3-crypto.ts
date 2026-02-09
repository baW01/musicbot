import crypto from "crypto";

const FAKE_KEY = Buffer.from("c:\\windows\\syste", "ascii");
const FAKE_NONCE = Buffer.from("m\\firewall32.cpl", "ascii");

function aesEncryptBlock(key: Buffer, block: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function generateSubkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const zero = Buffer.alloc(16, 0);
  const l = aesEncryptBlock(key, zero);

  const k1 = Buffer.alloc(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    const tmp = (l[i] << 1) | carry;
    k1[i] = tmp & 0xff;
    carry = l[i] >> 7;
  }
  if (l[0] & 0x80) k1[15] ^= 0x87;

  const k2 = Buffer.alloc(16);
  carry = 0;
  for (let i = 15; i >= 0; i--) {
    const tmp = (k1[i] << 1) | carry;
    k2[i] = tmp & 0xff;
    carry = k1[i] >> 7;
  }
  if (k1[0] & 0x80) k2[15] ^= 0x87;

  return { k1, k2 };
}

function cmac(key: Buffer, message: Buffer): Buffer {
  const { k1, k2 } = generateSubkeys(key);
  const numBlocks = message.length === 0 ? 1 : Math.ceil(message.length / 16);
  const lastBlockComplete = message.length > 0 && message.length % 16 === 0;

  const padded = Buffer.alloc(numBlocks * 16, 0);
  message.copy(padded);

  if (!lastBlockComplete) {
    if (message.length < padded.length) {
      padded[message.length] = 0x80;
    }
    for (let i = 0; i < 16; i++) {
      padded[(numBlocks - 1) * 16 + i] ^= k2[i];
    }
  } else {
    for (let i = 0; i < 16; i++) {
      padded[(numBlocks - 1) * 16 + i] ^= k1[i];
    }
  }

  let x = Buffer.alloc(16, 0);
  for (let i = 0; i < numBlocks; i++) {
    const block = padded.subarray(i * 16, (i + 1) * 16);
    const y = Buffer.alloc(16);
    for (let j = 0; j < 16; j++) y[j] = x[j] ^ block[j];
    x = aesEncryptBlock(key, y);
  }

  return x;
}

function omac(key: Buffer, tweak: number, data: Buffer): Buffer {
  const tweakBlock = Buffer.alloc(16, 0);
  tweakBlock[15] = tweak;

  const msg = Buffer.concat([tweakBlock, data]);
  return cmac(key, msg);
}

export function eaxEncrypt(
  key: Buffer,
  nonce: Buffer,
  header: Buffer,
  plaintext: Buffer,
  tagLen: number = 8
): { ciphertext: Buffer; tag: Buffer } {
  const n = omac(key, 0, nonce);
  const h = omac(key, 1, header);

  const iv = n.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-128-ctr", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const c = omac(key, 2, ciphertext);

  const fullTag = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) fullTag[i] = n[i] ^ h[i] ^ c[i];

  return { ciphertext, tag: fullTag.subarray(0, tagLen) };
}

export function eaxDecrypt(
  key: Buffer,
  nonce: Buffer,
  header: Buffer,
  ciphertext: Buffer,
  tag: Buffer
): Buffer | null {
  const n = omac(key, 0, nonce);
  const h = omac(key, 1, header);
  const c = omac(key, 2, ciphertext);

  const computedTag = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) computedTag[i] = n[i] ^ h[i] ^ c[i];

  for (let i = 0; i < tag.length; i++) {
    if (computedTag[i] !== tag[i]) return null;
  }

  const iv = n.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-128-ctr", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function createKeyNonce(
  pType: number,
  clientId: number | null,
  packetId: number,
  generationId: number,
  sharedIv: Buffer
): { key: Buffer; nonce: Buffer } {
  const temp = Buffer.alloc(70);
  temp[0] = clientId !== null ? 0x31 : 0x30;
  temp[1] = pType;
  temp.writeUInt32BE(generationId, 2);
  sharedIv.copy(temp, 6, 0, 64);

  const hash = crypto.createHash("sha256").update(temp).digest();
  const key = Buffer.from(hash.subarray(0, 16));
  const nonce = Buffer.from(hash.subarray(16, 32));

  key[0] ^= (packetId >> 8) & 0xff;
  key[1] ^= packetId & 0xff;

  return { key, nonce };
}

export function encryptPacket(
  data: Buffer,
  headerLen: number,
  pType: number,
  clientId: number | null,
  packetId: number,
  generationId: number,
  sharedIv: Buffer
): Buffer {
  const { key, nonce } = createKeyNonce(pType, clientId, packetId, generationId, sharedIv);
  const header = data.subarray(8, headerLen);
  const content = data.subarray(headerLen);
  const { ciphertext, tag } = eaxEncrypt(key, nonce, header, content, 8);
  const result = Buffer.alloc(data.length);
  tag.copy(result, 0);
  data.copy(result, 8, 8, headerLen);
  ciphertext.copy(result, headerLen);
  return result;
}

export function decryptPacket(
  data: Buffer,
  headerLen: number,
  pType: number,
  clientId: number | null,
  packetId: number,
  generationId: number,
  sharedIv: Buffer
): Buffer | null {
  const { key, nonce } = createKeyNonce(pType, clientId, packetId, generationId, sharedIv);
  const mac = data.subarray(0, 8);
  const header = data.subarray(8, headerLen);
  const ciphertext = data.subarray(headerLen);
  return eaxDecrypt(key, nonce, header, ciphertext, mac);
}

export function decryptFake(data: Buffer, headerLen: number): Buffer | null {
  const mac = data.subarray(0, 8);
  const header = data.subarray(8, headerLen);
  const ciphertext = data.subarray(headerLen);
  return eaxDecrypt(FAKE_KEY, FAKE_NONCE, header, ciphertext, mac);
}

export function encryptFake(headerData: Buffer, content: Buffer): { encrypted: Buffer; mac: Buffer } {
  const { ciphertext, tag } = eaxEncrypt(FAKE_KEY, FAKE_NONCE, headerData, content, 8);
  return { encrypted: ciphertext, mac: tag };
}

export function computeSharedIv(
  alpha: Buffer,
  beta: Buffer,
  sharedSecret: Buffer
): { sharedIv: Buffer; sharedMac: Buffer } {
  const ivHash = crypto.createHash("sha512").update(sharedSecret).digest();
  const sharedIv = Buffer.from(ivHash);

  for (let i = 0; i < alpha.length && i < 64; i++) {
    sharedIv[i] ^= alpha[i];
  }
  for (let i = 0; i < beta.length && i < 54; i++) {
    sharedIv[i + 10] ^= beta[i];
  }

  const macHash = crypto.createHash("sha1").update(sharedIv).digest();
  const sharedMac = Buffer.from(macHash.subarray(0, 8));

  return { sharedIv, sharedMac };
}

export function solveRsaPuzzle(x: Buffer, n: Buffer, level: number): Buffer {
  let xBig = BigInt("0x" + x.toString("hex"));
  const nBig = BigInt("0x" + n.toString("hex"));

  for (let i = 0; i < level; i++) {
    xBig = (xBig * xBig) % nBig;
  }

  const hex = xBig.toString(16).padStart(128, "0");
  return Buffer.from(hex, "hex");
}

export function hashCash(omega: string, level: number): bigint {
  let offset = 0n;
  while (offset < BigInt("0xFFFFFFFFFFFFFFFF")) {
    const data = `${omega}${offset}`;
    const hash = crypto.createHash("sha1").update(data).digest();
    let bits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        bits += 8;
      } else {
        let b = byte;
        while ((b & 1) === 0) {
          bits++;
          b >>= 1;
        }
        break;
      }
    }
    if (bits >= level) return offset;
    offset++;
  }
  return 0n;
}
