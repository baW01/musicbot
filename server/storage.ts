import { db } from "./db";
import { playlists, playlistSongs, botConfig } from "@shared/schema";
import type { Playlist, InsertPlaylist, PlaylistSong, InsertPlaylistSong, BotConfig, InsertBotConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getPlaylists(): Promise<Playlist[]>;
  getPlaylist(id: number): Promise<Playlist | undefined>;
  createPlaylist(data: InsertPlaylist): Promise<Playlist>;
  deletePlaylist(id: number): Promise<void>;
  getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]>;
  addPlaylistSongs(songs: InsertPlaylistSong[]): Promise<void>;
  clearPlaylistSongs(playlistId: number): Promise<void>;
  getBotConfig(): Promise<BotConfig | undefined>;
  upsertBotConfig(data: InsertBotConfig): Promise<BotConfig>;
}

export class DatabaseStorage implements IStorage {
  async getPlaylists(): Promise<Playlist[]> {
    return db.select().from(playlists).orderBy(playlists.createdAt);
  }

  async getPlaylist(id: number): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    return playlist;
  }

  async createPlaylist(data: InsertPlaylist): Promise<Playlist> {
    const [playlist] = await db.insert(playlists).values(data).returning();
    return playlist;
  }

  async deletePlaylist(id: number): Promise<void> {
    await db.delete(playlists).where(eq(playlists.id, id));
  }

  async getPlaylistSongs(playlistId: number): Promise<PlaylistSong[]> {
    return db.select().from(playlistSongs).where(eq(playlistSongs.playlistId, playlistId)).orderBy(playlistSongs.position);
  }

  async addPlaylistSongs(songs: InsertPlaylistSong[]): Promise<void> {
    if (songs.length === 0) return;
    await db.insert(playlistSongs).values(songs);
  }

  async clearPlaylistSongs(playlistId: number): Promise<void> {
    await db.delete(playlistSongs).where(eq(playlistSongs.playlistId, playlistId));
  }

  async getBotConfig(): Promise<BotConfig | undefined> {
    const [config] = await db.select().from(botConfig);
    return config;
  }

  async upsertBotConfig(data: InsertBotConfig): Promise<BotConfig> {
    const existing = await this.getBotConfig();
    if (existing) {
      const [updated] = await db.update(botConfig).set(data).where(eq(botConfig.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(botConfig).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
