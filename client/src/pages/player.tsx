import { NowPlaying } from "@/components/now-playing";
import { PlayerControls } from "@/components/player-controls";
import { QueueList } from "@/components/queue-list";
import { Card } from "@/components/ui/card";
import { usePlayer } from "@/hooks/use-player";

export default function PlayerPage() {
  const { state, play, pause, skip, stop, setVolume, seek, removeFromQueue, clearQueue } = usePlayer();

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-6">
          <NowPlaying song={state.currentSong} isPlaying={state.isPlaying} />
          <div className="mt-6">
            <PlayerControls
              isPlaying={state.isPlaying}
              hasSong={!!state.currentSong}
              volume={state.volume}
              progress={state.progress}
              duration={state.duration}
              onPlay={play}
              onPause={pause}
              onSkip={skip}
              onStop={stop}
              onVolumeChange={setVolume}
              onSeek={seek}
            />
          </div>
        </Card>

        <Card className="p-4">
          <QueueList
            queue={state.queue}
            currentSong={state.currentSong}
            onRemove={removeFromQueue}
            onClear={clearQueue}
          />
        </Card>
      </div>
    </div>
  );
}
