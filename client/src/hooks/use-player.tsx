import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { PlayerState, QueueItem } from "@shared/schema";
import { wsClient } from "@/lib/websocket";

const defaultState: PlayerState = {
  isPlaying: false,
  currentSong: null,
  queue: [],
  volume: 80,
  progress: 0,
  duration: 0,
};

interface PlayerContextType {
  state: PlayerState;
  wsConnected: boolean;
  audioUrl: string | null;
  play: () => void;
  pause: () => void;
  skip: () => void;
  stop: () => void;
  setVolume: (vol: number) => void;
  seek: (time: number) => void;
  addToQueue: (song: Omit<QueueItem, "id" | "addedAt">) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerState>(defaultState);
  const [wsConnected, setWsConnected] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      wsClient.send("skip");
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    wsClient.connect();

    const unsub = wsClient.on("playerState", (data: PlayerState) => {
      setState(data);
    });

    const unsubConnection = wsClient.on("connection", (data) => {
      setWsConnected(data.connected);
    });

    return () => {
      unsub();
      unsubConnection();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.currentSong && state.currentSong.id !== lastSongIdRef.current) {
      lastSongIdRef.current = state.currentSong.id;
      fetch(`/api/audio?url=${encodeURIComponent(state.currentSong.url)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.audioUrl) {
            setAudioUrl(data.audioUrl);
            audio.src = `/api/audio/stream?url=${encodeURIComponent(data.audioUrl)}`;
            audio.volume = state.volume / 100;
            audio.play().catch(() => {});
          }
        })
        .catch(() => {});
    }

    if (!state.currentSong) {
      lastSongIdRef.current = null;
      audio.pause();
      audio.src = "";
      setAudioUrl(null);
    }
  }, [state.currentSong?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.isPlaying && audio.paused && audio.src) {
      audio.play().catch(() => {});
    } else if (!state.isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [state.isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = state.volume / 100;
    }
  }, [state.volume]);

  const play = useCallback(() => wsClient.send("play"), []);
  const pause = useCallback(() => wsClient.send("pause"), []);
  const skip = useCallback(() => wsClient.send("skip"), []);
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    lastSongIdRef.current = null;
    setAudioUrl(null);
    wsClient.send("stop");
  }, []);
  const setVolume = useCallback((vol: number) => wsClient.send("volume", { volume: vol }), []);
  const seek = useCallback((time: number) => wsClient.send("seek", { time }), []);
  const addToQueue = useCallback((song: Omit<QueueItem, "id" | "addedAt">) => {
    if (wsClient.isConnected()) {
      wsClient.send("addToQueue", song);
    } else {
      fetch("/api/queue/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(song),
      }).catch(console.error);
    }
  }, []);
  const removeFromQueue = useCallback((id: string) => wsClient.send("removeFromQueue", { id }), []);
  const clearQueue = useCallback(() => wsClient.send("clearQueue"), []);
  const moveInQueue = useCallback((fromIndex: number, toIndex: number) => wsClient.send("moveInQueue", { fromIndex, toIndex }), []);

  const value: PlayerContextType = {
    state,
    wsConnected,
    audioUrl,
    play,
    pause,
    skip,
    stop,
    setVolume,
    seek,
    addToQueue,
    removeFromQueue,
    clearQueue,
    moveInQueue,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextType {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
