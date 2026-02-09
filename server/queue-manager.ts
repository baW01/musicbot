import { v4 as uuidv4 } from "uuid";
import type { QueueItem, PlayerState } from "@shared/schema";

type StateChangeCallback = (state: PlayerState) => void;

class QueueManager {
  private queue: QueueItem[] = [];
  private currentSong: QueueItem | null = null;
  private isPlaying = false;
  private volume = 80;
  private progress = 0;
  private duration = 0;
  private listeners: Set<StateChangeCallback> = new Set();
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  onStateChange(callback: StateChangeCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }

  getState(): PlayerState {
    return {
      isPlaying: this.isPlaying,
      currentSong: this.currentSong,
      queue: [...this.queue],
      volume: this.volume,
      progress: this.progress,
      duration: this.duration,
    };
  }

  addToQueue(song: Omit<QueueItem, "id" | "addedAt">): QueueItem {
    const item: QueueItem = {
      ...song,
      id: uuidv4(),
      addedAt: Date.now(),
    };
    this.queue.push(item);

    if (!this.currentSong) {
      this.playNext();
    }

    this.notifyListeners();
    return item;
  }

  removeFromQueue(id: string) {
    this.queue = this.queue.filter((s) => s.id !== id);
    this.notifyListeners();
  }

  clearQueue() {
    this.queue = [];
    this.notifyListeners();
  }

  play() {
    if (this.currentSong) {
      this.isPlaying = true;
      this.startProgressTimer();
      this.notifyListeners();
    } else if (this.queue.length > 0) {
      this.playNext();
    }
  }

  pause() {
    this.isPlaying = false;
    this.stopProgressTimer();
    this.notifyListeners();
  }

  stop() {
    this.isPlaying = false;
    this.currentSong = null;
    this.progress = 0;
    this.duration = 0;
    this.stopProgressTimer();
    this.notifyListeners();
  }

  skip() {
    this.stopProgressTimer();
    this.playNext();
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(100, vol));
    this.notifyListeners();
  }

  seek(time: number) {
    this.progress = Math.max(0, Math.min(time, this.duration));
    this.notifyListeners();
  }

  moveInQueue(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    const [item] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, item);
    this.notifyListeners();
  }

  private playNext() {
    this.stopProgressTimer();
    if (this.queue.length > 0) {
      this.currentSong = this.queue.shift()!;
      this.isPlaying = true;
      this.progress = 0;
      this.duration = this.parseDuration(this.currentSong.duration);
      this.startProgressTimer();
    } else {
      this.currentSong = null;
      this.isPlaying = false;
      this.progress = 0;
      this.duration = 0;
    }
    this.notifyListeners();
  }

  private parseDuration(durationStr: string): number {
    if (!durationStr) return 300;
    const parts = durationStr.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else seconds = parseInt(durationStr) || 300;
    return seconds > 0 ? seconds : 300;
  }

  private startProgressTimer() {
    this.stopProgressTimer();
    this.progressInterval = setInterval(() => {
      if (this.isPlaying && this.currentSong) {
        this.progress += 1;
        if (this.duration > 0 && this.progress >= this.duration) {
          this.playNext();
        } else {
          this.notifyListeners();
        }
      }
    }, 1000);
  }

  private stopProgressTimer() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  getCurrentSongTitle(): string | null {
    return this.currentSong?.title || null;
  }
}

export const queueManager = new QueueManager();
