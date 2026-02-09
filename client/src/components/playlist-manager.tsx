import { useState } from "react";
import { Plus, Trash2, Play, Loader2, ListMusic, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Playlist, PlaylistSong } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PlaylistManagerProps {
  currentQueue: { title: string; url: string; source: string; duration: string; thumbnail: string }[];
  onLoadPlaylist: (songs: { title: string; url: string; source: "youtube" | "soundcloud"; duration: string; thumbnail: string }[]) => void;
}

export function PlaylistManager({ currentQueue, onLoadPlaylist }: PlaylistManagerProps) {
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: playlists = [], isLoading } = useQuery<Playlist[]>({
    queryKey: ["/api/playlists"],
  });

  const { data: playlistSongs = [] } = useQuery<PlaylistSong[]>({
    queryKey: ["/api/playlists", selectedPlaylist, "songs"],
    enabled: selectedPlaylist !== null,
  });

  const createPlaylistMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/playlists", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      setNewPlaylistName("");
      setCreateOpen(false);
      toast({ title: "Playlista utworzona" });
    },
    onError: (err: any) => {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/playlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      if (selectedPlaylist) setSelectedPlaylist(null);
      toast({ title: "Playlista usunięta" });
    },
  });

  const saveQueueMutation = useMutation({
    mutationFn: async ({ playlistId, songs }: { playlistId: number; songs: any[] }) => {
      await apiRequest("POST", `/api/playlists/${playlistId}/songs`, { songs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      toast({ title: "Kolejka zapisana do playlisty" });
    },
    onError: (err: any) => {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    },
  });

  const handleLoadPlaylist = (songs: PlaylistSong[]) => {
    onLoadPlaylist(
      songs.map((s) => ({
        title: s.title,
        url: s.url,
        source: s.source as "youtube" | "soundcloud",
        duration: s.duration || "",
        thumbnail: s.thumbnail || "",
      }))
    );
    toast({ title: "Playlista załadowana", description: `Dodano ${songs.length} utworów` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Twoje playlisty</h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm" data-testid="button-create-playlist">
              <Plus className="w-3 h-3 mr-1" />
              Nowa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowa playlista</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nazwa playlisty..."
                data-testid="input-playlist-name"
              />
              <Button
                className="w-full"
                onClick={() => createPlaylistMutation.mutate(newPlaylistName)}
                disabled={!newPlaylistName.trim() || createPlaylistMutation.isPending}
                data-testid="button-save-playlist"
              >
                {createPlaylistMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Plus className="w-4 h-4 mr-1" />
                )}
                Utwórz
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <ListMusic className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Brak playlist</p>
          <p className="text-xs text-muted-foreground/60">Utwórz nową playlistę i zapisz ulubione utwory</p>
        </div>
      ) : (
        <ScrollArea className="h-[350px]">
          <div className="space-y-2 pr-3">
            {playlists.map((playlist) => (
              <Card
                key={playlist.id}
                className={`p-3 cursor-pointer transition-colors ${selectedPlaylist === playlist.id ? "border-primary" : ""}`}
                onClick={() => setSelectedPlaylist(selectedPlaylist === playlist.id ? null : playlist.id)}
                data-testid={`playlist-card-${playlist.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{playlist.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(playlist.createdAt).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {currentQueue.length > 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveQueueMutation.mutate({
                            playlistId: playlist.id,
                            songs: currentQueue.map((s, i) => ({ ...s, position: i })),
                          });
                        }}
                        title="Zapisz kolejkę do playlisty"
                        data-testid={`button-save-queue-${playlist.id}`}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlaylistMutation.mutate(playlist.id);
                      }}
                      data-testid={`button-delete-playlist-${playlist.id}`}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {selectedPlaylist === playlist.id && (
                  <div className="mt-3 space-y-2 border-t border-card-border pt-2">
                    {playlistSongs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Pusta playlista</p>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadPlaylist(playlistSongs);
                          }}
                          data-testid={`button-load-playlist-${playlist.id}`}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Załaduj ({playlistSongs.length} utworów)
                        </Button>
                        <div className="space-y-1">
                          {playlistSongs.slice(0, 5).map((song) => (
                            <div key={song.id} className="flex items-center gap-2 text-xs">
                              <ListMusic className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="truncate text-muted-foreground">{song.title}</span>
                            </div>
                          ))}
                          {playlistSongs.length > 5 && (
                            <p className="text-[10px] text-muted-foreground/60 text-center">
                              ...i {playlistSongs.length - 5} więcej
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
