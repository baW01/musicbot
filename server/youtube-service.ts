import { YouTube } from "youtube-sr";
import { execFile } from "child_process";
import { promisify } from "util";
import type { SearchResult } from "@shared/schema";

const execFileAsync = promisify(execFile);

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  try {
    const results = await YouTube.search(query, { limit: 15, type: "video" });
    return results
      .filter((r) => r.id)
      .map((r) => ({
        title: r.title || "Unknown",
        url: `https://www.youtube.com/watch?v=${r.id}`,
        source: "youtube" as const,
        duration: r.durationFormatted || "",
        thumbnail: r.thumbnail?.url || "",
        channel: r.channel?.name || "",
      }));
  } catch (error) {
    console.error("YouTube search error:", error);
    return [];
  }
}

export async function getYouTubePlaylist(url: string): Promise<SearchResult[]> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 30000 });

    const lines = stdout.trim().split("\n");
    const songs: SearchResult[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        songs.push({
          title: data.title || "Unknown",
          url: data.url ? `https://www.youtube.com/watch?v=${data.id || data.url}` : `https://www.youtube.com/watch?v=${data.id}`,
          source: "youtube",
          duration: data.duration ? formatDuration(data.duration) : "",
          thumbnail: data.thumbnails?.[0]?.url || data.thumbnail || "",
          channel: data.uploader || data.channel || "",
        });
      } catch {
        continue;
      }
    }

    return songs;
  } catch (error) {
    console.error("YouTube playlist error:", error);
    return [];
  }
}

export async function getSoundCloudPlaylist(url: string): Promise<SearchResult[]> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 30000 });

    const lines = stdout.trim().split("\n");
    const songs: SearchResult[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        songs.push({
          title: data.title || "Unknown",
          url: data.webpage_url || data.url || url,
          source: "soundcloud",
          duration: data.duration ? formatDuration(data.duration) : "",
          thumbnail: data.thumbnail || "",
          channel: data.uploader || "",
        });
      } catch {
        continue;
      }
    }

    return songs;
  } catch (error) {
    console.error("SoundCloud playlist error:", error);
    return [];
  }
}

export async function searchSoundCloud(query: string): Promise<SearchResult[]> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      `scsearch10:${query}`,
      "--dump-json",
      "--flat-playlist",
      "--no-warnings",
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 15000 });

    const lines = stdout.trim().split("\n");
    const results: SearchResult[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        results.push({
          title: data.title || "Unknown",
          url: data.webpage_url || data.url || "",
          source: "soundcloud",
          duration: data.duration ? formatDuration(data.duration) : "",
          thumbnail: data.thumbnail || "",
          channel: data.uploader || "",
        });
      } catch {
        continue;
      }
    }

    return results;
  } catch (error) {
    console.error("SoundCloud search error:", error);
    return [];
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function getAudioUrl(url: string): Promise<string | null> {
  const args = [
    "-f", "bestaudio/best",
    "-g",
    "--no-warnings",
    "--no-playlist",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--extractor-args", "youtube:player_client=web",
    url,
  ];

  try {
    const { stdout } = await execFileAsync("yt-dlp", args, { timeout: 30000 });
    return stdout.trim().split("\n")[0];
  } catch (error) {
    console.error("Audio URL extraction error (attempt 1):", error);
    try {
      const { stdout } = await execFileAsync("yt-dlp", [
        "-f", "bestaudio/best",
        "-g",
        "--no-warnings",
        "--no-playlist",
        "--extractor-args", "youtube:player_client=android",
        url,
      ], { timeout: 30000 });
      return stdout.trim().split("\n")[0];
    } catch (error2) {
      console.error("Audio URL extraction error (attempt 2):", error2);
      return null;
    }
  }
}
