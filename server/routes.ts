import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { storage } from "./storage";
import { queueManager } from "./queue-manager";
import { searchYouTube, searchSoundCloud, getYouTubePlaylist, getSoundCloudPlaylist, getAudioUrl } from "./youtube-service";
import { discoverTeamspeakServer } from "./ts-discovery";
import { teamspeakBot } from "./teamspeak-bot";
import { insertPlaylistSchema, insertBotConfigSchema } from "@shared/schema";
import type { PlayerState } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // YouTube search
  app.get("/api/search/youtube", async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ message: "Query required" });
    try {
      const results = await searchYouTube(q);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // SoundCloud search
  app.get("/api/search/soundcloud", async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ message: "Query required" });
    try {
      const results = await searchSoundCloud(q);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Load playlist from URL (YouTube or SoundCloud)
  app.get("/api/playlist/load", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ message: "URL required" });
    try {
      let songs;
      if (url.includes("soundcloud.com")) {
        songs = await getSoundCloudPlaylist(url);
      } else {
        songs = await getYouTubePlaylist(url);
      }
      res.json({ songs });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get audio URL for streaming
  app.get("/api/audio", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ message: "URL required" });
    try {
      const audioUrl = await getAudioUrl(url);
      if (!audioUrl) return res.status(404).json({ message: "Audio not found" });
      res.json({ audioUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Proxy audio stream to avoid CORS issues
  app.get("/api/audio/stream", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ message: "URL required" });
    try {
      const response = await fetch(url);
      if (!response.ok) return res.status(502).json({ message: "Audio fetch failed" });

      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      const contentLength = response.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      res.setHeader("Accept-Ranges", "bytes");

      const reader = response.body?.getReader();
      if (!reader) return res.status(502).json({ message: "No body" });

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          if (!res.write(value)) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        }
      };

      res.on("close", () => reader.cancel());
      await pump();
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      }
    }
  });

  // Playlists CRUD
  app.get("/api/playlists", async (_req, res) => {
    const data = await storage.getPlaylists();
    res.json(data);
  });

  app.post("/api/playlists", async (req, res) => {
    try {
      const parsed = insertPlaylistSchema.parse(req.body);
      const playlist = await storage.createPlaylist(parsed);
      res.json(playlist);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/playlists/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deletePlaylist(id);
    res.json({ ok: true });
  });

  app.get("/api/playlists/:id/songs", async (req, res) => {
    const id = parseInt(req.params.id);
    const songs = await storage.getPlaylistSongs(id);
    res.json(songs);
  });

  app.post("/api/playlists/:id/songs", async (req, res) => {
    const playlistId = parseInt(req.params.id);
    const { songs } = req.body;
    if (!Array.isArray(songs)) return res.status(400).json({ message: "Songs array required" });

    await storage.clearPlaylistSongs(playlistId);
    const songsToInsert = songs.map((s: any, i: number) => ({
      playlistId,
      title: s.title || "Unknown",
      url: s.url || "",
      source: s.source || "youtube",
      duration: s.duration || "",
      thumbnail: s.thumbnail || "",
      position: i,
    }));
    await storage.addPlaylistSongs(songsToInsert);
    res.json({ ok: true });
  });

  // Bot config
  app.get("/api/bot/config", async (_req, res) => {
    const config = await storage.getBotConfig();
    res.json(config || {
      serverAddress: "",
      serverPort: 9987,
      queryPort: 10011,
      username: "serveradmin",
      password: "",
      nickname: "MusicBot",
      defaultChannel: "",
    });
  });

  app.put("/api/bot/config", async (req, res) => {
    try {
      const data = {
        serverAddress: String(req.body.serverAddress || ""),
        serverPort: parseInt(req.body.serverPort) || 9987,
        queryPort: parseInt(req.body.queryPort) || 10011,
        username: String(req.body.username || "serveradmin"),
        password: String(req.body.password || ""),
        nickname: String(req.body.nickname || "MusicBot"),
        defaultChannel: String(req.body.defaultChannel || ""),
      };
      const config = await storage.upsertBotConfig(data);
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Bot status
  app.get("/api/bot/status", async (_req, res) => {
    res.json(teamspeakBot.getStatus());
  });

  app.post("/api/bot/discover", async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ message: "Podaj domenę serwera" });
    try {
      const result = await discoverTeamspeakServer(domain);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bot/test", async (_req, res) => {
    const config = await storage.getBotConfig();
    if (!config?.serverAddress) {
      return res.status(400).json({ message: "Brak adresu serwera" });
    }
    const dgram = await import("dgram");
    const port = config.serverPort || 9987;
    const socket = dgram.createSocket("udp4");
    let responded = false;

    const timeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        socket.close();
        res.json({
          reachable: false,
          message: `Serwer ${config.serverAddress}:${port} (UDP) nie odpowiada. Sprawdz czy adres jest poprawny i firewall nie blokuje polaczenia.`,
        });
      }
    }, 5000);

    socket.on("message", () => {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        socket.close();
        res.json({ reachable: true, message: `Serwer TS3 na ${config.serverAddress}:${port} odpowiada!` });
      }
    });

    socket.on("error", (err: any) => {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        socket.close();
        res.json({ reachable: false, message: `Blad UDP: ${err.message}` });
      }
    });

    const initPacket = Buffer.alloc(34);
    Buffer.from("TS3INIT1").copy(initPacket, 0);
    initPacket.writeUInt16BE(0x65, 8);
    initPacket.writeUInt16BE(0, 10);
    initPacket[12] = 0x88;
    initPacket.writeUInt32BE(3, 13);
    initPacket[17] = 0;
    initPacket.writeUInt32BE(Math.floor(Date.now() / 1000), 18);
    crypto.randomBytes(4).copy(initPacket, 22);

    socket.send(initPacket, 0, initPacket.length, port, config.serverAddress);
  });

  app.post("/api/bot/proxy-test", async (_req, res) => {
    const config = await storage.getBotConfig();
    if (!config?.proxyUrl || !config.proxyToken) {
      return res.status(400).json({ ok: false, message: "Brak konfiguracji proxy (URL i token)" });
    }
    try {
      const healthUrl = config.proxyUrl.replace(/^ws/, "http").replace(/\/$/, "") + "/health";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        res.json({ ok: true, message: `Proxy dziala! Uptime: ${Math.round(data.uptime)}s` });
      } else {
        res.json({ ok: false, message: `Proxy odpowiada ale z bledem: HTTP ${resp.status}` });
      }
    } catch (e: any) {
      res.json({ ok: false, message: `Nie mozna polaczyc z proxy: ${e.message}` });
    }
  });

  app.post("/api/bot/connect", async (_req, res) => {
    try {
      await teamspeakBot.connect();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bot/disconnect", async (_req, res) => {
    try {
      await teamspeakBot.disconnect();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Player state
  app.get("/api/player/state", (_req, res) => {
    res.json(queueManager.getState());
  });

  app.post("/api/queue/add", (req, res) => {
    try {
      const item = queueManager.addToQueue(req.body);
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // WebSocket setup
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  function broadcastState(state: PlayerState) {
    const message = JSON.stringify({ type: "playerState", data: state });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  queueManager.onStateChange(broadcastState);

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "playerState", data: queueManager.getState() }));

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        switch (msg.type) {
          case "play":
            queueManager.play();
            break;
          case "pause":
            queueManager.pause();
            break;
          case "skip":
            queueManager.skip();
            break;
          case "stop":
            queueManager.stop();
            break;
          case "volume":
            queueManager.setVolume(msg.data?.volume ?? 80);
            break;
          case "seek":
            queueManager.seek(msg.data?.time ?? 0);
            break;
          case "addToQueue":
            if (msg.data) {
              queueManager.addToQueue(msg.data);
            }
            break;
          case "removeFromQueue":
            if (msg.data?.id) {
              queueManager.removeFromQueue(msg.data.id);
            }
            break;
          case "clearQueue":
            queueManager.clearQueue();
            break;
          case "moveInQueue":
            if (msg.data) {
              queueManager.moveInQueue(msg.data.fromIndex, msg.data.toIndex);
            }
            break;
        }
      } catch (error) {
        console.error("WS message error:", error);
      }
    });
  });

  return httpServer;
}
