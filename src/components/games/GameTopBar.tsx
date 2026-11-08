import { ArrowLeft, Flag, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSoundMuted } from "@/lib/sound";

interface Props {
  title: string;
  onExit: () => void;
  /** Shown when a team session is running. */
  sessionActive?: boolean;
  onFinishSession?: () => void;
  rightElement?: React.ReactNode;
}

export function GameTopBar({ title, onExit, sessionActive, onFinishSession, rightElement }: Props) {
  const sound = useSoundMuted();

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={onExit} className="rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" /> Menu
        </Button>
        {sessionActive && onFinishSession && (
          <Button
            size="sm"
            variant="outline"
            onClick={onFinishSession}
            className="h-8 rounded-xl px-2 text-xs font-bold"
          >
            <Flag className="mr-1 h-3 w-3" /> Finalizar jogo
          </Button>
        )}
      </div>
      <div className="font-display text-lg sm:text-xl font-bold truncate">{title}</div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {rightElement}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={sound.toggle}
          title={sound.muted ? "Ativar som" : "Silenciar som"}
          aria-label={sound.muted ? "Ativar som" : "Silenciar som"}
          className="h-9 w-9 rounded-xl"
        >
          {sound.muted ? (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4 text-primary" />
          )}
        </Button>
      </div>
    </div>
  );
}
