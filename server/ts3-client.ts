import dgram from "dgram";
import crypto from "crypto";
import { EventEmitter } from "events";
import WebSocket from "ws";
import {
  eaxEncrypt,
  eaxDecrypt,
  decryptFake,
  encryptFake,
  computeSharedIv,
  solveRsaPuzzle,
  createKeyNonce,
} from "./ts3-crypto";
import { deriveLicenseKey, ed25519DH } from "./ts3-license";

const C2S_HEADER_LEN = 13;
const S2C_HEADER_LEN = 11;

const PACKET_MAC_OFFSET = 0;
const PACKET_MAC_LEN = 8;
const PACKET_ID_OFFSET = 8;
const PACKET_CLIENT_ID_OFFSET = 10;

enum PacketType {
  Voice = 0,
  VoiceWhisper = 1,
  Command = 2,
  CommandLow = 3,
  Ping = 4,
  Pong = 5,
  Ack = 6,
  AckLow = 7,
  Init = 8,
}

const FLAGS_UNENCRYPTED = 0x80;
const FLAGS_COMPRESSED = 0x40;
const FLAGS_NEWPROTOCOL = 0x20;
const FLAGS_FRAGMENTED = 0x10;

interface TS3ClientConfig {
  host: string;
  port: number;
  nickname: string;
  identity?: string;
  defaultChannel?: string;
  serverPassword?: string;
  hwid?: string;
  proxyUrl?: string;
  proxyToken?: string;
}

interface ParsedCommand {
  name: string;
  params: Map<string, string>;
  items: Map<string, string>[];
}

type TS3ClientEvents = {
  connected: [];
  disconnected: [reason: string];
  error: [error: Error];
  textmessage: [targetmode: number, msg: string, invokerName: string, invokerId: string];
  channellist: [channels: ParsedCommand[]];
  clientlist: [clients: ParsedCommand[]];
};

export class TS3Client extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private ws: WebSocket | null = null;
  private useProxy = false;
  private config: TS3ClientConfig;
  private connected = false;
  private closing = false;

  private ecdhKey: crypto.ECDH;
  private omega: string = "";

  private sharedIv: Buffer | null = null;
  private sharedMac: Buffer | null = null;
  private alpha: Buffer;
  private clientId = 0;

  private outPacketId: Map<number, number> = new Map();
  private inPacketId: Map<number, number> = new Map();
  private generationId = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;

  private initStep = 0;
  private initRandom0: Buffer;
  private initTimestamp: number;

  private serverName = "";
  private currentChannelId = 0;
  private ownClientId = 0;
  private channels: Map<number, string> = new Map();
  private clientList: Map<number, string> = new Map();

  private fragmentBuffer: Buffer | null = null;
  private fragmentType: PacketType | null = null;
  private ackCallbacks: Map<number, () => void> = new Map();

  constructor(config: TS3ClientConfig) {
    super();
    this.config = config;

    this.ecdhKey = crypto.createECDH("prime256v1");
    this.ecdhKey.generateKeys();

    const pubKeyDer = this.ecdhKey.getPublicKey();
    this.omega = pubKeyDer.toString("base64");

    this.alpha = crypto.randomBytes(10);
    this.initRandom0 = crypto.randomBytes(4);
    this.initTimestamp = Math.floor(Date.now() / 1000);

    for (let i = 0; i <= 8; i++) {
      this.outPacketId.set(i, 0);
      this.inPacketId.set(i, 0);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.closing = false;
      this.useProxy = !!(this.config.proxyUrl && this.config.proxyToken);

      this.connectTimeout = setTimeout(() => {
        if (!this.connected) {
          this.disconnect();
          reject(new Error("Connection timeout (15s)"));
        }
      }, 15000);

      this.once("connected", () => {
        if (this.connectTimeout) clearTimeout(this.connectTimeout);
        resolve();
      });

      this.once("error", (err) => {
        if (!this.connected) reject(err);
      });

      if (this.useProxy) {
        this.connectViaProxy(reject);
      } else {
        this.connectDirect(reject);
      }
    });
  }

  private connectDirect(reject: (err: Error) => void): void {
    this.socket = dgram.createSocket("udp4");

    this.socket.on("error", (err) => {
      this.emit("error", err);
      if (!this.connected) reject(err);
    });

    this.socket.on("message", (msg) => {
      try {
        this.handlePacket(msg);
      } catch (e: any) {
        console.error("[TS3] Packet error:", e.message);
      }
    });

    this.socket.on("close", () => {
      this.cleanup();
      this.emit("disconnected", "socket closed");
    });

    this.socket.bind(0, () => {
      this.sendInit0();
    });
  }

  private connectViaProxy(reject: (err: Error) => void): void {
    const proxyUrl = this.config.proxyUrl!;
    const token = this.config.proxyToken!;
    const host = this.config.host;
    const port = this.config.port;

    const separator = proxyUrl.includes("?") ? "&" : "?";
    const wsUrl = `${proxyUrl}${separator}token=${encodeURIComponent(token)}&host=${encodeURIComponent(host)}&port=${port}`;

    console.log(`[TS3] Connecting via proxy: ${proxyUrl} -> ${host}:${port}`);

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = "nodebuffer";

    this.ws.on("open", () => {
      console.log("[TS3] Proxy WebSocket connected");
      this.sendInit0();
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        this.handlePacket(Buffer.from(data));
      } catch (e: any) {
        console.error("[TS3] Packet error:", e.message);
      }
    });

    this.ws.on("close", () => {
      if (!this.closing) {
        this.cleanup();
        this.emit("disconnected", "proxy connection closed");
      }
    });

    this.ws.on("error", (err) => {
      console.error("[TS3] Proxy WS error:", err.message);
      this.emit("error", err);
      if (!this.connected) reject(err);
    });
  }

  disconnect(): void {
    this.closing = true;
    if (this.connected) {
      try {
        this.sendCommand("clientdisconnect", {
          reasonid: "8",
          reasonmsg: "leaving",
        });
      } catch {}
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.connected = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerName(): string {
    return this.serverName;
  }

  getChannelName(): string {
    return this.channels.get(this.currentChannelId) || "";
  }

  getClientCount(): number {
    return this.clientList.size;
  }

  private send(data: Buffer): void {
    if (this.closing) return;
    if (this.useProxy) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(data);
    } else {
      if (!this.socket) return;
      this.socket.send(data, 0, data.length, this.config.port, this.config.host);
    }
  }

  private buildC2SHeader(pType: PacketType, flags: number, packetId: number): Buffer {
    const header = Buffer.alloc(C2S_HEADER_LEN);
    header.writeUInt16BE(packetId, PACKET_ID_OFFSET);
    header.writeUInt16BE(this.clientId, PACKET_CLIENT_ID_OFFSET);
    header[C2S_HEADER_LEN - 1] = (flags & 0xf0) | (pType & 0x0f);
    return header;
  }

  private getNextPacketId(pType: PacketType): number {
    const id = this.outPacketId.get(pType) || 0;
    this.outPacketId.set(pType, (id + 1) & 0xffff);
    return id;
  }

  private sendInit0(): void {
    this.initStep = 0;
    const CLIENT_VERSION_OFFSET = 1356998400;
    const CLIENT_VERSION = 1560592083;
    const versionField = CLIENT_VERSION - CLIENT_VERSION_OFFSET;

    const content = Buffer.alloc(21);
    content.writeUInt32BE(versionField, 0);
    content[4] = 0;
    content.writeUInt32BE(this.initTimestamp, 5);
    this.initRandom0.copy(content, 9);

    const packet = Buffer.alloc(C2S_HEADER_LEN + content.length);
    Buffer.from("TS3INIT1").copy(packet, 0);
    packet.writeUInt16BE(0x65, PACKET_ID_OFFSET);
    packet.writeUInt16BE(0, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = FLAGS_UNENCRYPTED | PacketType.Init;
    content.copy(packet, C2S_HEADER_LEN);

    this.send(packet);
  }

  private sendInit2(random1: Buffer, random0_r: Buffer): void {
    this.initStep = 2;
    const CLIENT_VERSION_OFFSET = 1356998400;
    const CLIENT_VERSION = 1560592083;
    const versionField = CLIENT_VERSION - CLIENT_VERSION_OFFSET;

    const content = Buffer.alloc(25);
    content.writeUInt32BE(versionField, 0);
    content[4] = 2;
    random1.copy(content, 5);
    random0_r.copy(content, 21);

    const packet = Buffer.alloc(C2S_HEADER_LEN + content.length);
    Buffer.from("TS3INIT1").copy(packet, 0);
    packet.writeUInt16BE(0x65, PACKET_ID_OFFSET);
    packet.writeUInt16BE(0, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = FLAGS_UNENCRYPTED | PacketType.Init;
    content.copy(packet, C2S_HEADER_LEN);

    this.send(packet);
  }

  private sendInit4(
    x: Buffer,
    n: Buffer,
    level: number,
    random2: Buffer,
    y: Buffer
  ): void {
    this.initStep = 4;
    const CLIENT_VERSION_OFFSET = 1356998400;
    const CLIENT_VERSION = 1560592083;
    const versionField = CLIENT_VERSION - CLIENT_VERSION_OFFSET;

    const alphaB64 = this.alpha.toString("base64");
    const omegaB64 = this.omega;
    const cmdStr = `clientinitiv alpha=${alphaB64} omega=${omegaB64} ot=1 ip=`;

    const contentBuf = Buffer.alloc(4 + 1 + 64 + 64 + 4 + 100 + 64);
    let offset = 0;
    contentBuf.writeUInt32BE(versionField, offset); offset += 4;
    contentBuf[offset] = 4; offset += 1;
    x.copy(contentBuf, offset); offset += 64;
    n.copy(contentBuf, offset); offset += 64;
    contentBuf.writeUInt32BE(level, offset); offset += 4;
    random2.copy(contentBuf, offset); offset += 100;
    y.copy(contentBuf, offset); offset += 64;

    const cmdBuf = Buffer.from(cmdStr, "utf8");
    const fullContent = Buffer.concat([contentBuf, cmdBuf]);

    const packet = Buffer.alloc(C2S_HEADER_LEN + fullContent.length);
    Buffer.from("TS3INIT1").copy(packet, 0);
    packet.writeUInt16BE(0x65, PACKET_ID_OFFSET);
    packet.writeUInt16BE(0, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = FLAGS_UNENCRYPTED | PacketType.Init;
    fullContent.copy(packet, C2S_HEADER_LEN);

    this.send(packet);
  }

  private handlePacket(data: Buffer): void {
    if (data.length < S2C_HEADER_LEN) return;

    const packetId = data.readUInt16BE(PACKET_ID_OFFSET);
    const typeByte = data[S2C_HEADER_LEN - 1];
    const pType = typeByte & 0x0f;
    const flags = typeByte & 0xf0;

    if (pType === PacketType.Init) {
      this.handleInitPacket(data);
      return;
    }

    if (pType === PacketType.Ping) {
      this.sendPong(packetId);
      return;
    }

    if (pType === PacketType.Pong) {
      return;
    }

    if (pType === PacketType.Ack || pType === PacketType.AckLow) {
      const ackedId = data.readUInt16BE(S2C_HEADER_LEN);
      const cb = this.ackCallbacks.get(ackedId);
      if (cb) {
        cb();
        this.ackCallbacks.delete(ackedId);
      }
      return;
    }

    if (pType === PacketType.Command || pType === PacketType.CommandLow) {
      let content: Buffer | null = null;

      if (flags & FLAGS_UNENCRYPTED) {
        content = data.subarray(S2C_HEADER_LEN);
      } else {
        content = decryptFake(data, S2C_HEADER_LEN);

        if (!content && this.sharedIv) {
          const { key, nonce } = createKeyNonce(
            pType, null, packetId, this.generationId, this.sharedIv
          );
          const mac = data.subarray(0, 8);
          const header = data.subarray(8, S2C_HEADER_LEN);
          const ciphertext = data.subarray(S2C_HEADER_LEN);
          content = eaxDecrypt(key, nonce, header, ciphertext, mac);
        }

        if (!content && this.sharedIv) {
          content = decryptFake(data, S2C_HEADER_LEN);
        }
      }

      if (!content) {
        return;
      }

      if (flags & FLAGS_COMPRESSED) {
        return;
      }

      if (flags & FLAGS_FRAGMENTED) {
        if (!this.fragmentBuffer) {
          this.fragmentBuffer = content;
          this.fragmentType = pType;
        } else {
          this.fragmentBuffer = Buffer.concat([this.fragmentBuffer, content]);
          const assembled = this.fragmentBuffer;
          this.fragmentBuffer = null;
          this.fragmentType = null;
          this.handleCommandData(assembled, packetId, pType);
        }
      } else {
        this.handleCommandData(content, packetId, pType);
      }

      this.sendAck(packetId, pType === PacketType.CommandLow ? PacketType.AckLow : PacketType.Ack);
      return;
    }
  }

  private handleInitPacket(data: Buffer): void {
    const content = data.subarray(S2C_HEADER_LEN);
    if (content.length < 1) return;

    const step = content[0];

    if (step === 1 && content.length >= 21) {
      const random1 = content.subarray(1, 17);
      const random0_r = content.subarray(17, 21);
      this.sendInit2(random1, random0_r);
    } else if (step === 3 && content.length >= 233) {
      const x = content.subarray(1, 65);
      const n = content.subarray(65, 129);
      const level = content.readUInt32BE(129);
      const random2 = content.subarray(133, 233);

      const y = solveRsaPuzzle(x, n, level);
      this.sendInit4(x, n, level, random2, y);
    }
  }

  private handleCommandData(data: Buffer, packetId: number, pType: PacketType): void {
    const cmdStr = data.toString("utf8");
    const lines = cmdStr.split("\n").filter(l => l.trim());

    for (const line of lines) {
      const cmd = this.parseCommand(line);
      if (!cmd) continue;

      this.handleParsedCommand(cmd);
    }
  }

  private parseCommand(line: string): ParsedCommand | null {
    const parts = line.split("|");
    const items: Map<string, string>[] = [];

    let name = "";

    for (let pi = 0; pi < parts.length; pi++) {
      const tokens = parts[pi].trim().split(/\s+/);
      const params = new Map<string, string>();

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (pi === 0 && i === 0 && !token.includes("=")) {
          name = token;
          continue;
        }

        const eqIdx = token.indexOf("=");
        if (eqIdx === -1) {
          params.set(token, "");
        } else {
          const key = token.substring(0, eqIdx);
          const val = this.unescapeTS3(token.substring(eqIdx + 1));
          params.set(key, val);
        }
      }

      if (pi === 0 && items.length === 0) {
        items.push(params);
      } else {
        items.push(params);
      }
    }

    if (!name && items.length > 0) {
      return null;
    }

    return {
      name,
      params: items[0] || new Map(),
      items,
    };
  }

  private unescapeTS3(s: string): string {
    return s
      .replace(/\\s/g, " ")
      .replace(/\\p/g, "|")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\//g, "/")
      .replace(/\\\\/g, "\\");
  }

  private escapeTS3(s: string): string {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/ /g, "\\s")
      .replace(/\|/g, "\\p")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\//g, "\\/");
  }

  private handleParsedCommand(cmd: ParsedCommand): void {
    switch (cmd.name) {
      case "initivexpand2":
        this.handleInitIvExpand2(cmd);
        break;

      case "initserver":
        this.handleInitServer(cmd);
        break;

      case "channellist":
        this.handleChannelList(cmd);
        break;

      case "channellistfinished":
        break;

      case "notifycliententerview":
        this.handleClientEnterView(cmd);
        break;

      case "notifyclientleftview":
        this.handleClientLeftView(cmd);
        break;

      case "notifytextmessage":
        this.handleTextMessage(cmd);
        break;

      case "notifyclientmoved":
        break;

      case "notifyserveredited":
        break;

      case "notifychanneledited":
        break;

      default:
        break;
    }
  }

  private async handleInitIvExpand2Async(cmd: ParsedCommand): Promise<void> {
    const l = cmd.params.get("l");
    const beta = cmd.params.get("beta");

    if (!beta) {
      this.emit("error", new Error("initivexpand2 missing beta"));
      return;
    }

    const betaBuf = Buffer.from(beta, "base64");

    let serverEdPub: Buffer;
    if (l) {
      try {
        const licenseBuf = Buffer.from(l, "base64");
        serverEdPub = await deriveLicenseKey(licenseBuf);
      } catch (e: any) {
        console.error("[TS3] License key derivation failed:", e.message);
        serverEdPub = crypto.randomBytes(32);
      }
    } else {
      serverEdPub = crypto.randomBytes(32);
    }

    const { generateEd25519KeyPairFull, signWithEd25519 } = await import("./ts3-license");
    const ephemeral = await generateEd25519KeyPairFull();

    let sharedSecret: Buffer;
    try {
      sharedSecret = await ed25519DH(ephemeral.privateKey, serverEdPub);
    } catch (e: any) {
      console.error("[TS3] Ed25519 DH failed:", e.message);
      sharedSecret = crypto.randomBytes(32);
    }

    const { sharedIv, sharedMac } = computeSharedIv(
      this.alpha,
      betaBuf.subarray(0, Math.min(54, betaBuf.length)),
      sharedSecret
    );

    this.sharedIv = sharedIv;
    this.sharedMac = sharedMac;

    const ekPubB64 = ephemeral.publicKey.toString("base64");

    let proofB64: string;
    try {
      const proofSig = await signWithEd25519(ephemeral.rawPriv, sharedIv);
      proofB64 = proofSig.toString("base64");
    } catch {
      proofB64 = crypto.randomBytes(64).toString("base64");
    }

    this.sendCommand("clientek", {
      ek: ekPubB64,
      proof: proofB64,
    });
  }

  private handleInitIvExpand2(cmd: ParsedCommand): void {
    this.handleInitIvExpand2Async(cmd).catch((e) => {
      this.emit("error", new Error(`InitIvExpand2 failed: ${e.message}`));
    });
  }

  private handleInitServer(cmd: ParsedCommand): void {
    this.serverName = cmd.params.get("virtualserver_name") || "TeamSpeak Server";
    const clid = cmd.params.get("aclid") || cmd.params.get("clid");
    if (clid) this.ownClientId = parseInt(clid) || 0;

    const cid = cmd.params.get("virtualserver_channel_id");
    if (cid) this.currentChannelId = parseInt(cid) || 0;

    this.connected = true;
    this.startPingLoop();

    this.sendClientInit();
  }

  private sendClientInit(): void {
    const hwid = this.config.hwid || "923f136fb1e22ae6ce95e60255529c00,d13571b4a71c5497c3530e7d6280a5be";
    const params: Record<string, string> = {
      client_nickname: this.config.nickname,
      client_version: "3.6.2\\s[Build:\\s1690193193]",
      client_platform: "Linux",
      client_input_hardware: "1",
      client_output_hardware: "1",
      client_default_channel: this.config.defaultChannel ? `/${this.config.defaultChannel}` : "",
      client_default_channel_password: "",
      client_server_password: this.config.serverPassword || "",
      client_meta_data: "",
      client_version_sign: "o+l92HKfiUF+THx2rBsuNjj/S1QpxG1fd5o3Q7qtWxkviR3LI3JeWyqWm6sXC2gVy1MfKEkJOHUi+tnRGMOcg==",
      client_key_offset: "0",
      client_nickname_phonetic: "",
      client_default_token: "",
      client_badges: "",
      hwid: hwid,
    };

    this.sendCommand("clientinit", params);

    this.emit("connected");

    this.sendCommand("servernotifyregister", { event: "textchannel" });
    this.sendCommand("servernotifyregister", { event: "textprivate" });
    this.sendCommand("servernotifyregister", { event: "server" });
    this.sendCommand("clientlist");
    this.sendCommand("channellist");
  }

  private handleChannelList(cmd: ParsedCommand): void {
    for (const item of cmd.items) {
      const cid = parseInt(item.get("cid") || "0");
      const name = item.get("channel_name") || "";
      if (cid > 0) this.channels.set(cid, name);
    }
  }

  private handleClientEnterView(cmd: ParsedCommand): void {
    const clid = parseInt(cmd.params.get("clid") || "0");
    const name = cmd.params.get("client_nickname") || "";
    if (clid > 0) this.clientList.set(clid, name);
  }

  private handleClientLeftView(cmd: ParsedCommand): void {
    const clid = parseInt(cmd.params.get("clid") || "0");
    this.clientList.delete(clid);
  }

  private handleTextMessage(cmd: ParsedCommand): void {
    const targetmode = parseInt(cmd.params.get("targetmode") || "0");
    const msg = cmd.params.get("msg") || "";
    const invokerName = cmd.params.get("invokername") || "";
    const invokerId = cmd.params.get("invokerid") || "";

    this.emit("textmessage", targetmode, msg, invokerName, invokerId);
  }

  sendCommand(name: string, params?: Record<string, string>): void {
    let cmdStr = name;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        cmdStr += ` ${key}=${this.escapeTS3(value)}`;
      }
    }

    const content = Buffer.from(cmdStr, "utf8");
    const packetId = this.getNextPacketId(PacketType.Command);

    const packet = Buffer.alloc(C2S_HEADER_LEN + content.length);
    packet.fill(0, 0, PACKET_MAC_LEN);
    packet.writeUInt16BE(packetId, PACKET_ID_OFFSET);
    packet.writeUInt16BE(this.clientId, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = FLAGS_NEWPROTOCOL | PacketType.Command;
    content.copy(packet, C2S_HEADER_LEN);

    if (this.sharedIv) {
      const { key, nonce } = createKeyNonce(
        PacketType.Command, this.clientId, packetId, this.generationId, this.sharedIv
      );
      const headerMeta = packet.subarray(8, C2S_HEADER_LEN);
      const { ciphertext, tag } = eaxEncrypt(key, nonce, headerMeta, content, 8);
      tag.copy(packet, 0);
      ciphertext.copy(packet, C2S_HEADER_LEN);
    } else {
      const headerMeta = packet.subarray(8, C2S_HEADER_LEN);
      const { encrypted, mac } = encryptFake(headerMeta, content);
      mac.copy(packet, 0);
      encrypted.copy(packet, C2S_HEADER_LEN);
    }

    this.send(packet);
  }

  sendTextMessage(targetmode: number, target: string, msg: string): void {
    this.sendCommand("sendtextmessage", {
      targetmode: String(targetmode),
      target: target,
      msg: msg,
    });
  }

  sendChannelMessage(msg: string): void {
    this.sendTextMessage(2, String(this.currentChannelId), msg);
  }

  sendServerMessage(msg: string): void {
    this.sendTextMessage(3, "0", msg);
  }

  moveToChannel(channelName: string): boolean {
    for (const [cid, name] of this.channels) {
      if (name.toLowerCase() === channelName.toLowerCase()) {
        this.sendCommand("clientmove", {
          clid: String(this.ownClientId),
          cid: String(cid),
        });
        this.currentChannelId = cid;
        return true;
      }
    }
    return false;
  }

  private sendAck(packetId: number, ackType: PacketType = PacketType.Ack): void {
    const content = Buffer.alloc(2);
    content.writeUInt16BE(packetId, 0);

    const ackPacketId = this.getNextPacketId(ackType);
    const packet = Buffer.alloc(C2S_HEADER_LEN + 2);
    packet.fill(0, 0, PACKET_MAC_LEN);
    packet.writeUInt16BE(ackPacketId, PACKET_ID_OFFSET);
    packet.writeUInt16BE(this.clientId, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = ackType;
    content.copy(packet, C2S_HEADER_LEN);

    if (this.sharedIv) {
      const { key, nonce } = createKeyNonce(
        ackType, this.clientId, ackPacketId, this.generationId, this.sharedIv
      );
      const headerMeta = packet.subarray(8, C2S_HEADER_LEN);
      const { ciphertext, tag } = eaxEncrypt(key, nonce, headerMeta, content, 8);
      tag.copy(packet, 0);
      ciphertext.copy(packet, C2S_HEADER_LEN);
    } else {
      const headerMeta = packet.subarray(8, C2S_HEADER_LEN);
      const { encrypted, mac } = encryptFake(headerMeta, content);
      mac.copy(packet, 0);
      encrypted.copy(packet, C2S_HEADER_LEN);
    }

    this.send(packet);
  }

  private sendPong(pingId: number): void {
    const content = Buffer.alloc(2);
    content.writeUInt16BE(pingId, 0);

    const packetId = this.getNextPacketId(PacketType.Pong);
    const packet = Buffer.alloc(C2S_HEADER_LEN + 2);
    packet.fill(0, 0, PACKET_MAC_LEN);
    packet.writeUInt16BE(packetId, PACKET_ID_OFFSET);
    packet.writeUInt16BE(this.clientId, PACKET_CLIENT_ID_OFFSET);
    packet[C2S_HEADER_LEN - 1] = PacketType.Pong;
    content.copy(packet, C2S_HEADER_LEN);

    this.send(packet);
  }

  private startPingLoop(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (!this.connected) return;

      const packetId = this.getNextPacketId(PacketType.Ping);
      const packet = Buffer.alloc(C2S_HEADER_LEN);
      packet.fill(0, 0, PACKET_MAC_LEN);
      packet.writeUInt16BE(packetId, PACKET_ID_OFFSET);
      packet.writeUInt16BE(this.clientId, PACKET_CLIENT_ID_OFFSET);
      packet[C2S_HEADER_LEN - 1] = FLAGS_UNENCRYPTED | PacketType.Ping;

      this.send(packet);
    }, 1000);
  }

  async updateDescription(text: string): Promise<void> {
    if (!this.connected) return;
    this.sendCommand("clientedit", {
      clid: String(this.ownClientId),
      client_description: text,
    });
  }
}
