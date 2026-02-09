#!/usr/bin/env node
const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");

const PORT = parseInt(process.env.PROXY_PORT || "9988");
const SECRET = process.env.PROXY_SECRET || crypto.randomBytes(16).toString("hex");

console.log(`TS3 UDP Proxy starting on port ${PORT}`);
console.log(`Secret: ${SECRET}`);
console.log(`Use this URL in the bot config: ws://YOUR_SERVER_IP:${PORT}`);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const clients = new Map();

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const targetHost = url.searchParams.get("host");
  const targetPort = parseInt(url.searchParams.get("port") || "9987");

  if (token !== SECRET) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    console.log("Rejected: invalid token");
    return;
  }

  if (!targetHost) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    console.log("Rejected: no target host");
    return;
  }

  const wsKey = req.headers["sec-websocket-key"];
  const acceptKey = crypto
    .createHash("sha1")
    .update(wsKey + "258EAFA5-E914-47DA-95CA-5AB5DC65C37B")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    "\r\n"
  );

  const clientId = crypto.randomBytes(4).toString("hex");
  console.log(`[${clientId}] Connected: ${targetHost}:${targetPort}`);

  const udpSocket = dgram.createSocket("udp4");

  udpSocket.on("message", (msg) => {
    try {
      sendWsFrame(socket, msg);
    } catch (e) {
      console.log(`[${clientId}] WS send error:`, e.message);
    }
  });

  udpSocket.on("error", (err) => {
    console.log(`[${clientId}] UDP error:`, err.message);
  });

  let wsBuffer = Buffer.alloc(0);
  let fragmentBuffer = null;

  socket.on("data", (data) => {
    wsBuffer = Buffer.concat([wsBuffer, data]);

    while (wsBuffer.length >= 2) {
      const result = parseWsFrame(wsBuffer);
      if (!result) break;

      wsBuffer = wsBuffer.subarray(result.totalLen);

      if (result.opcode === 0x08) {
        console.log(`[${clientId}] WS close`);
        cleanup();
        return;
      }
      if (result.opcode === 0x09) {
        sendWsFrame(socket, result.payload, 0x0a);
        continue;
      }

      const isFin = result.fin;

      if (result.opcode === 0x00) {
        if (fragmentBuffer) {
          fragmentBuffer = Buffer.concat([fragmentBuffer, result.payload]);
        }
        if (isFin && fragmentBuffer) {
          udpSocket.send(fragmentBuffer, targetPort, targetHost, (err) => {
            if (err) console.log(`[${clientId}] UDP send error:`, err.message);
          });
          fragmentBuffer = null;
        }
        continue;
      }

      if (result.opcode === 0x02) {
        if (!isFin) {
          fragmentBuffer = Buffer.from(result.payload);
        } else {
          udpSocket.send(result.payload, targetPort, targetHost, (err) => {
            if (err) console.log(`[${clientId}] UDP send error:`, err.message);
          });
        }
      }
    }
  });

  socket.on("close", () => {
    console.log(`[${clientId}] Socket closed`);
    cleanup();
  });

  socket.on("error", (err) => {
    console.log(`[${clientId}] Socket error:`, err.message);
    cleanup();
  });

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clients.delete(clientId);
    try { udpSocket.close(); } catch {}
    try { socket.destroy(); } catch {}
    console.log(`[${clientId}] Cleaned up`);
  }

  clients.set(clientId, { socket, udpSocket, targetHost, targetPort });
});

function parseWsFrame(buf) {
  if (buf.length < 2) return null;

  const byte1 = buf[0];
  const byte2 = buf[1];
  const fin = (byte1 & 0x80) !== 0;
  const opcode = byte1 & 0x0f;
  const masked = (byte2 & 0x80) !== 0;
  let payloadLen = byte2 & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payloadLen) return null;

  let payload = Buffer.from(buf.subarray(offset, offset + payloadLen));

  if (masked && maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return { fin, opcode, payload, totalLen: offset + payloadLen };
}

function sendWsFrame(socket, data, opcode = 0x02) {
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = data.length;
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }

  try {
    socket.write(Buffer.concat([header, data]));
  } catch {}
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on 0.0.0.0:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  for (const [id, client] of clients) {
    try { client.udpSocket.close(); } catch {}
    try { client.socket.destroy(); } catch {}
  }
  server.close();
  process.exit(0);
});
