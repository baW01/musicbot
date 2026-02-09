import { Music, Radio } from "lucide-react";
import type { QueueItem } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface NowPlayingProps {
  song: QueueItem | null;
  isPlaying: boolean;
}

export function NowPlaying({ song, isPlaying }: NowPlayingProps) {
  if (!song) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="now-playing-empty">
        <div className="w-48 h-48 rounded-md bg-card flex items-center justify-center border border-card-border">
          <Music className="w-16 h-16 text-muted-foreground/30" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-muted-foreground text-sm">Brak odtwarzanego utworu</p>
          <p className="text-muted-foreground/60 text-xs">Wyszukaj i dodaj piosenki do kolejki</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4" data-testid="now-playing">
      <div className="relative group">
        <div className="w-48 h-48 rounded-md overflow-hidden border border-card-border">
          {song.thumbnail ? (
            <img
              src={song.thumbnail}
              alt={song.title}
              className="w-full h-full object-cover"
              data-testid="img-now-playing-thumbnail"
            />
          ) : (
            <div className="w-full h-full bg-card flex items-center justify-center">
              <Music className="w-16 h-16 text-muted-foreground/30" />
            </div>
          )}
        </div>
        {isPlaying && (
          <div className="absolute bottom-2 right-2">
            <div className="flex items-center gap-0.5 bg-primary/90 rounded-sm px-1.5 py-0.5">
              <span className="w-0.5 h-3 bg-primary-foreground rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
              <span className="w-0.5 h-4 bg-primary-foreground rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
              <span className="w-0.5 h-2 bg-primary-foreground rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
              <span className="w-0.5 h-3.5 bg-primary-foreground rounded-full animate-pulse" style={{ animationDelay: "450ms" }} />
            </div>
          </div>
        )}
      </div>
      <div className="text-center space-y-1.5 max-w-[260px]">
        <h3
          className="font-semibold text-sm leading-tight line-clamp-2"
          data-testid="text-now-playing-title"
          title={song.title}
        >
          {song.title}
        </h3>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {song.source === "youtube" ? (
              <Radio className="w-3 h-3 mr-1" />
            ) : (
              <Music className="w-3 h-3 mr-1" />
            )}
            {song.source === "youtube" ? "YouTube" : "SoundCloud"}
          </Badge>
          {song.duration && (
            <span className="text-xs text-muted-foreground">{song.duration}</span>
          )}
        </div>
      </div>
    </div>
  );
}
