import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playlistSongs = pgTable("playlist_songs", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull(),
  duration: text("duration"),
  thumbnail: text("thumbnail"),
  position: integer("position").notNull().default(0),
});

export const botConfig = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  serverAddress: text("server_address").notNull().default(""),
  serverPort: integer("server_port").notNull().default(9987),
  queryPort: integer("query_port").notNull().default(10011),
  username: text("username").notNull().default("serveradmin"),
  password: text("password").notNull().default(""),
  nickname: text("nickname").notNull().default("MusicBot"),
  defaultChannel: text("default_channel").notNull().default(""),
  proxyUrl: text("proxy_url").notNull().default(""),
  proxyToken: text("proxy_token").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertPlaylistSchema = createInsertSchema(playlists).omit({
  id: true,
  createdAt: true,
});

export const insertPlaylistSongSchema = createInsertSchema(playlistSongs).omit({
  id: true,
});

export const insertBotConfigSchema = createInsertSchema(botConfig).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type InsertPlaylistSong = z.infer<typeof insertPlaylistSongSchema>;
export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;

export interface QueueItem {
  id: string;
  title: string;
  url: string;
  source: "youtube" | "soundcloud";
  duration: string;
  thumbnail: string;
  addedAt: number;
}

export interface PlayerState {
  isPlaying: boolean;
  currentSong: QueueItem | null;
  queue: QueueItem[];
  volume: number;
  progress: number;
  duration: number;
}

export interface SearchResult {
  title: string;
  url: string;
  source: "youtube" | "soundcloud";
  duration: string;
  thumbnail: string;
  channel: string;
}

export interface BotStatus {
  connected: boolean;
  serverName: string;
  channel: string;
  clients: number;
}
