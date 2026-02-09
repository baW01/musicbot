import { TS3Client } from "./ts3-client";
import { storage } from "./storage";
import { queueManager } from "./queue-manager";
import { discoverTeamspeakServer } from "./ts-discovery";
import type { BotStatus } from "@shared/schema";
import { log } from "./index";

class TeamspeakBot {
  private client: TS3Client | null = null;
  private connected = false;
  private serverName = "";
  private channelName = "";
  private clientCount = 0;

  async connect(): Promise<void> {
    const config = await storage.getBotConfig();
    if (!config || !config.serverAddress) {
      throw new Error("Brak konfiguracji serwera TeamSpeak");
    }

    let host = config.serverAddress;
    let serverPort = config.serverPort;

    const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (!isIP) {
      log(`Address "${host}" is a domain, running auto-discovery...`, "ts3bot");
      try {
        const discovery = await discoverTeamspeakServer(host);
        if (discovery.success && discovery.ip) {
          log(`Auto-discovery found: IP=${discovery.ip}, Voice=${discovery.serverPort || 9987}`, "ts3bot");
          host = discovery.ip;
          if (discovery.serverPort) serverPort = discovery.serverPort;
        } else {
          log(`Auto-discovery failed, trying original address...`, "ts3bot");
          discovery.steps.forEach((s) => log(`  ${s}`, "ts3bot"));
        }
      } catch (e) {
        log(`Auto-discovery error: ${e}, trying original address...`, "ts3bot");
      }
    }

    try {
      log(`Connecting as TS3 client to ${host}:${serverPort} (UDP, port 9987 protocol)...`, "ts3bot");
      log(`Nickname: ${config.nickname}`, "ts3bot");

      const useProxy = !!(config.proxyUrl && config.proxyToken);
      if (useProxy) {
        log(`Using UDP proxy: ${config.proxyUrl}`, "ts3bot");
      }

      this.client = new TS3Client({
        host,
        port: serverPort,
        nickname: config.nickname,
        defaultChannel: config.defaultChannel || undefined,
        proxyUrl: config.proxyUrl || undefined,
        proxyToken: config.proxyToken || undefined,
      });

      this.client.on("connected", () => {
        this.connected = true;
        this.serverName = this.client?.getServerName() || "TeamSpeak Server";
        log(`Connected to TeamSpeak server: ${this.serverName}`, "ts3bot");
      });

      this.client.on("disconnected", (reason) => {
        this.connected = false;
        this.client = null;
        log(`Disconnected from TeamSpeak: ${reason}`, "ts3bot");
      });

      this.client.on("error", (err) => {
        log(`TS3 error: ${err.message}`, "ts3bot");
      });

      this.client.on("textmessage", (targetmode, msg, invokerName, invokerId) => {
        const trimmed = msg.trim();
        if (trimmed.startsWith("!")) {
          this.handleCommand(trimmed, invokerName);
        }
      });

      queueManager.onStateChange((state) => {
        if (this.connected && this.client && state.currentSong) {
          this.client.updateDescription(`Now Playing: ${state.currentSong.title}`).catch(() => {});
        }
      });

      await this.client.connect();

      this.connected = true;
      this.serverName = this.client.getServerName();

      if (config.defaultChannel) {
        setTimeout(() => {
          if (this.client?.isConnected()) {
            const moved = this.client.moveToChannel(config.defaultChannel);
            if (moved) {
              this.channelName = config.defaultChannel;
              log(`Moved to channel: ${config.defaultChannel}`, "ts3bot");
            } else {
              log(`Channel "${config.defaultChannel}" not found`, "ts3bot");
            }
          }
        }, 2000);
      }
    } catch (error: any) {
      this.connected = false;
      this.client = null;
      const msg = error.message || String(error);
      log(`Connection failed: ${msg}`, "ts3bot");
      if (msg.includes("timeout") || msg.includes("Timeout")) {
        throw new Error(
          `Nie udalo sie polaczyc - timeout. Sprawdz:\n` +
          `1. Czy adres "${host}" jest poprawny\n` +
          `2. Czy port ${serverPort} (UDP) jest dostepny\n` +
          `3. Czy serwer TS3 jest online\n` +
          `4. Czy firewall serwera nie blokuje IP bota`
        );
      }
      if (msg.includes("banned") || msg.includes("blacklist")) {
        throw new Error(`IP bota zostalo zablokowane przez serwer. Skontaktuj sie z adminem serwera.`);
      }
      throw new Error(`Nie udalo sie polaczyc: ${msg}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.connected = false;
      log("Disconnected from TeamSpeak", "ts3bot");
    }
  }

  getStatus(): BotStatus {
    return {
      connected: this.connected,
      serverName: this.serverName,
      channel: this.client?.getChannelName() || this.channelName,
      clients: this.client?.getClientCount() || 0,
    };
  }

  private async handleCommand(msg: string, invokerName: string) {
    const parts = msg.split(" ");
    const cmd = parts[0].toLowerCase();

    try {
      switch (cmd) {
        case "!play":
          queueManager.play();
          this.sendMessage("Odtwarzanie wznowione");
          break;
        case "!pause":
          queueManager.pause();
          this.sendMessage("Zatrzymano");
          break;
        case "!skip":
          queueManager.skip();
          this.sendMessage("Pominieto utwor");
          break;
        case "!stop":
          queueManager.stop();
          this.sendMessage("Odtwarzanie zatrzymane");
          break;
        case "!np":
        case "!nowplaying": {
          const state = queueManager.getState();
          if (state.currentSong) {
            this.sendMessage(`Teraz gra: ${state.currentSong.title}`);
          } else {
            this.sendMessage("Nic nie jest odtwarzane");
          }
          break;
        }
        case "!queue": {
          const state = queueManager.getState();
          if (state.queue.length === 0) {
            this.sendMessage("Kolejka jest pusta");
          } else {
            const list = state.queue
              .slice(0, 5)
              .map((s, i) => `${i + 1}. ${s.title}`)
              .join("\n");
            this.sendMessage(`Kolejka (${state.queue.length}):\n${list}`);
          }
          break;
        }
        case "!volume": {
          const vol = parseInt(parts[1]);
          if (!isNaN(vol)) {
            queueManager.setVolume(vol);
            this.sendMessage(`Glosnosc: ${vol}%`);
          }
          break;
        }
        case "!help":
          this.sendMessage(
            "Komendy: !play, !pause, !skip, !stop, !np, !queue, !volume [0-100], !help"
          );
          break;
      }
    } catch (error) {
      console.error("Command error:", error);
    }
  }

  private sendMessage(text: string) {
    try {
      if (this.client?.isConnected()) {
        this.client.sendChannelMessage(text);
      }
    } catch {
    }
  }
}

export const teamspeakBot = new TeamspeakBot();
