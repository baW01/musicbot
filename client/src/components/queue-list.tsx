import { Trash2, GripVertical, Music, ListX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QueueItem } from "@shared/schema";

interface QueueListProps {
  queue: QueueItem[];
  currentSong: QueueItem | null;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function QueueList({ queue, currentSong, onRemove, onClear }: QueueListProps) {
  if (queue.length === 0 && !currentSong) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="queue-empty">
        <ListX className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Kolejka jest pusta</p>
        <p className="text-xs text-muted-foreground/60">Dodaj utwory przez wyszukiwanie</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium text-muted-foreground">
          {queue.length} {queue.length === 1 ? "utwór" : queue.length < 5 ? "utwory" : "utworów"} w kolejce
        </h3>
        {queue.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs text-destructive"
            data-testid="button-clear-queue"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Wyczyść
          </Button>
        )}
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1 pr-3">
          {queue.map((song, index) => (
            <div
              key={song.id}
              className="flex items-center gap-2 p-2 rounded-md bg-card border border-card-border group"
              data-testid={`queue-item-${song.id}`}
            >
              <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{index + 1}</span>
              <div className="w-8 h-8 rounded-sm overflow-hidden shrink-0 bg-muted">
                {song.thumbnail ? (
                  <img src={song.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" title={song.title}>{song.title}</p>
                <p className="text-[10px] text-muted-foreground">{song.duration || "—"}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ visibility: "visible" }}
                onClick={() => onRemove(song.id)}
                data-testid={`button-remove-${song.id}`}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
