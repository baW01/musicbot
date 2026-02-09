import { useState } from "react";
import { Search, Plus, Loader2, Music, ListPlus } from "lucide-react";
import { SiYoutube, SiSoundcloud } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { SearchResult } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SearchPanelProps {
  onAddToQueue: (song: { title: string; url: string; source: "youtube" | "soundcloud"; duration: string; thumbnail: string }) => void;
}

export function SearchPanel({ onAddToQueue }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"youtube" | "soundcloud">("youtube");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`/api/search/${activeTab}?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error("Błąd wyszukiwania");
      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      toast({ title: "Błąd wyszukiwania", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSong = (result: SearchResult) => {
    onAddToQueue({
      title: result.title,
      url: result.url,
      source: result.source,
      duration: result.duration,
      thumbnail: result.thumbnail,
    });
    toast({ title: "Dodano do kolejki", description: result.title });
  };

  const handleLoadPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setLoadingPlaylist(true);
    try {
      const res = await fetch(`/api/playlist/load?url=${encodeURIComponent(playlistUrl.trim())}`);
      if (!res.ok) throw new Error("Nie udało się załadować playlisty");
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        data.songs.forEach((song: any) => {
          onAddToQueue({
            title: song.title,
            url: song.url,
            source: song.source,
            duration: song.duration || "",
            thumbnail: song.thumbnail || "",
          });
        });
        toast({ title: "Playlista załadowana", description: `Dodano ${data.songs.length} utworów` });
        setPlaylistUrl("");
      } else {
        toast({ title: "Pusta playlista", description: "Nie znaleziono utworów", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPlaylist(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "youtube" | "soundcloud")}>
        <TabsList className="w-full">
          <TabsTrigger value="youtube" className="flex-1 gap-1.5" data-testid="tab-youtube">
            <SiYoutube className="w-3.5 h-3.5" />
            YouTube
          </TabsTrigger>
          <TabsTrigger value="soundcloud" className="flex-1 gap-1.5" data-testid="tab-soundcloud">
            <SiSoundcloud className="w-3.5 h-3.5" />
            SoundCloud
          </TabsTrigger>
        </TabsList>

        <TabsContent value="youtube" className="space-y-3 mt-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj na YouTube..."
              className="flex-1"
              data-testid="input-search-youtube"
            />
            <Button type="submit" disabled={loading || !query.trim()} data-testid="button-search">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Załaduj playlistę YouTube</p>
            <div className="flex gap-2">
              <Input
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="Wklej URL playlisty YouTube..."
                className="flex-1"
                data-testid="input-playlist-url-youtube"
              />
              <Button
                onClick={handleLoadPlaylist}
                disabled={loadingPlaylist || !playlistUrl.trim()}
                variant="secondary"
                data-testid="button-load-playlist-youtube"
              >
                {loadingPlaylist ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="soundcloud" className="space-y-3 mt-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj na SoundCloud..."
              className="flex-1"
              data-testid="input-search-soundcloud"
            />
            <Button type="submit" disabled={loading || !query.trim()} data-testid="button-search-sc">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Załaduj playlistę SoundCloud</p>
            <div className="flex gap-2">
              <Input
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="Wklej URL playlisty SoundCloud..."
                className="flex-1"
                data-testid="input-playlist-url-soundcloud"
              />
              <Button
                onClick={handleLoadPlaylist}
                disabled={loadingPlaylist || !playlistUrl.trim()}
                variant="secondary"
                data-testid="button-load-playlist-soundcloud"
              >
                {loadingPlaylist ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Szukam...</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <ScrollArea className="h-[350px]">
          <div className="space-y-1 pr-3">
            {results.map((result, index) => (
              <div
                key={`${result.url}-${index}`}
                className="flex items-center gap-2 p-2 rounded-md bg-card border border-card-border hover-elevate"
                data-testid={`search-result-${index}`}
              >
                <div className="w-10 h-10 rounded-sm overflow-hidden shrink-0 bg-muted">
                  {result.thumbnail ? (
                    <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" title={result.title}>{result.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground truncate">{result.channel}</span>
                    {result.duration && (
                      <span className="text-[10px] text-muted-foreground">{result.duration}</span>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleAddSong(result)}
                  data-testid={`button-add-${index}`}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {!loading && results.length === 0 && query && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Brak wyników</p>
        </div>
      )}
    </div>
  );
}
