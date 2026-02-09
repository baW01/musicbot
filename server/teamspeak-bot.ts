import { TeamSpeak } from "ts3-nodejs-library";
import { storage } from "./storage";
import { queueManager } from "./queue-manager";
import type { BotStatus } from "@shared/schema";
import { log } from "./index";

class TeamspeakBot {
  private client: TeamSpeak | null = null;
  private connected = false;
  private serverName = "";
  private channelName = "";
  private clientCount = 0;

  async connect(): Promise<void> {
    const config = await storage.getBotConfig();
    if (!config || !config.serverAddress) {
      throw new Error("Brak konfiguracji serwera TeamSpeak");
    }

    try {
      this.client = await TeamSpeak.connect({
        host: config.serverAddress,
        queryport: config.queryPort,
        serverport: config.serverPort,
        username: config.username,
        password: config.password,
        nickname: config.nickname,
      });

      this.connected = true;
      log("Connected to TeamSpeak server", "ts3bot");

      const serverInfo = await this.client.serverInfo();
      this.serverName = serverInfo.virtualserverName || "Unknown";

      const clients = await this.client.clientList();
      this.clientCount = clients.length;

      if (config.defaultChannel) {
        try {
          const channels = await this.client.channelList();
          const channel = channels.find(
            (ch) => ch.name.toLowerCase() === config.defaultChannel.toLowerCase()
          );
          if (channel) {
            const whoami = await this.client.whoami();
            await this.client.clientMove(whoami.clientId, channel.cid);
            this.channelName = channel.name;
            log(`Moved to channel: ${channel.name}`, "ts3bot");
          }
        } catch (e) {
          log(`Could not move to channel: ${e}`, "ts3bot");
        }
      }

      this.client.on("textmessage", async (event) => {
        const msg = event.msg.trim();
        if (msg.startsWith("!")) {
          await this.handleCommand(msg, event);
        }
      });

      queueManager.onStateChange((state) => {
        if (this.connected && this.client && state.currentSong) {
          this.updateDescription(`Now Playing: ${state.currentSong.title}`);
        }
      });

      this.client.on("close", () => {
        this.connected = false;
        this.client = null;
        log("Disconnected from TeamSpeak", "ts3bot");
      });
    } catch (error: any) {
      this.connected = false;
      this.client = null;
      throw new Error(`Nie udało się połączyć: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      log("Disconnected from TeamSpeak", "ts3bot");
    }
  }

  getStatus(): BotStatus {
    return {
      connected: this.connected,
      serverName: this.serverName,
      channel: this.channelName,
      clients: this.clientCount,
    };
  }

  private async updateDescription(text: string) {
    try {
      if (this.client) {
        const whoami = await this.client.whoami();
        await this.client.clientEdit(whoami.clientId, {
          clientDescription: text,
        });
      }
    } catch {
      // silently fail description update
    }
  }

  private async handleCommand(msg: string, event: any) {
    const parts = msg.split(" ");
    const cmd = parts[0].toLowerCase();

    try {
      switch (cmd) {
        case "!play":
          queueManager.play();
          await this.sendMessage("Odtwarzanie wznowione");
          break;
        case "!pause":
          queueManager.pause();
          await this.sendMessage("Zatrzymano");
          break;
        case "!skip":
          queueManager.skip();
          await this.sendMessage("Pominięto utwór");
          break;
        case "!stop":
          queueManager.stop();
          await this.sendMessage("Odtwarzanie zatrzymane");
          break;
        case "!np":
        case "!nowplaying": {
          const state = queueManager.getState();
          if (state.currentSong) {
            await this.sendMessage(`Teraz gra: ${state.currentSong.title}`);
          } else {
            await this.sendMessage("Nic nie jest odtwarzane");
          }
          break;
        }
        case "!queue": {
          const state = queueManager.getState();
          if (state.queue.length === 0) {
            await this.sendMessage("Kolejka jest pusta");
          } else {
            const list = state.queue
              .slice(0, 5)
              .map((s, i) => `${i + 1}. ${s.title}`)
              .join("\n");
            await this.sendMessage(`Kolejka (${state.queue.length}):\n${list}`);
          }
          break;
        }
        case "!volume": {
          const vol = parseInt(parts[1]);
          if (!isNaN(vol)) {
            queueManager.setVolume(vol);
            await this.sendMessage(`Głośność: ${vol}%`);
          }
          break;
        }
        case "!help":
          await this.sendMessage(
            "Komendy: !play, !pause, !skip, !stop, !np, !queue, !volume [0-100], !help"
          );
          break;
      }
    } catch (error) {
      console.error("Command error:", error);
    }
  }

  private async sendMessage(text: string) {
    try {
      if (this.client) {
        await this.client.sendTextMessage("0", 2, text);
      }
    } catch {
      // silently fail
    }
  }
}

export const teamspeakBot = new TeamspeakBot();
