import { PlaylistManager } from "@/components/playlist-manager";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/hooks/use-player";

export default function PlaylistsPage() {
  const { state, addToQueue } = usePlayer();

  const currentQueue = state.queue.map((s) => ({
    title: s.title,
    url: s.url,
    source: s.source,
    duration: s.duration,
    thumbnail: s.thumbnail,
  }));

  const handleLoadPlaylist = (songs: { title: string; url: string; source: "youtube" | "soundcloud"; duration: string; thumbnail: string }[]) => {
    songs.forEach((song) => addToQueue(song));
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-4">Playlisty</h2>
          <PlaylistManager
            currentQueue={currentQueue}
            onLoadPlaylist={handleLoadPlaylist}
          />
        </Card>
      </div>
    </div>
  );
}
