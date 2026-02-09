import { Play, Pause, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";

interface PlayerControlsProps {
  isPlaying: boolean;
  hasSong: boolean;
  volume: number;
  progress: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onStop: () => void;
  onVolumeChange: (vol: number) => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerControls({
  isPlaying,
  hasSong,
  volume,
  progress,
  duration,
  onPlay,
  onPause,
  onSkip,
  onStop,
  onVolumeChange,
  onSeek,
}: PlayerControlsProps) {
  const [showVolume, setShowVolume] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Slider
          value={[progress]}
          max={duration || 100}
          step={1}
          onValueChange={([val]) => onSeek(val)}
          disabled={!hasSong}
          className="cursor-pointer"
          data-testid="slider-progress"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="text-progress-current">{formatTime(progress)}</span>
          <span data-testid="text-progress-total">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={onStop}
          disabled={!hasSong}
          data-testid="button-stop"
        >
          <Square className="w-4 h-4" />
        </Button>

        <Button
          size="icon"
          variant="default"
          onClick={isPlaying ? onPause : onPlay}
          disabled={!hasSong}
          data-testid="button-play-pause"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={onSkip}
          disabled={!hasSong}
          data-testid="button-skip"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onVolumeChange(volume === 0 ? 80 : 0)}
          data-testid="button-mute"
        >
          {volume === 0 ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </Button>
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={([val]) => onVolumeChange(val)}
          className="w-24 cursor-pointer"
          data-testid="slider-volume"
        />
        <span className="text-xs text-muted-foreground w-8 text-right">{volume}%</span>
      </div>
    </div>
  );
}
