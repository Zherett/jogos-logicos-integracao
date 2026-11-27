import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LastMatch } from "@/lib/game-storage";
import { LastMatchCard } from "./LastMatchCard";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";

interface Props {
  title: string;
  description?: string;
  onStart: () => void;
  onExit: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
  lastMatch?: LastMatch | null;
  sessionActive?: boolean;
  onFinishSession?: () => void;
  bonusTime?: boolean;
  onBonusTimeChange?: (v: boolean) => void;
  bonusTimeLabel?: string;
}

export function StartScreen({
  title, description, onStart, onExit, children, disabled, lastMatch,
  sessionActive, onFinishSession, bonusTime, onBonusTimeChange, bonusTimeLabel,
}: Props) {
  return (
    <div className="space-y-4">
      <GameTopBar title={title} onExit={onExit} sessionActive={sessionActive} onFinishSession={onFinishSession} />

      <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-6 sm:p-10 shadow-xl animate-pop-in">
        <div className="text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold">{title}</h2>
          {description && <p className="mt-2 text-muted-foreground">{description}</p>}
        </div>

        {lastMatch && (
          <div className="mt-6">
            <LastMatchCard match={lastMatch} />
          </div>
        )}

        {typeof bonusTime === "boolean" && onBonusTimeChange && (
          <div className="mt-6">
            <BonusTimeToggle value={bonusTime} onChange={onBonusTimeChange} label={bonusTimeLabel} className="w-full" />
          </div>
        )}

        {children && <div className="mt-8">{children}</div>}

        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={onStart}
            disabled={disabled}
            className="h-16 px-10 text-xl font-bold rounded-2xl shadow-lg bg-primary hover:bg-primary/90"
          >
            <Play className="mr-2 h-6 w-6 fill-current" /> Iniciar jogo
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OptionChip({
  active, onClick, children, disabled,
}: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border-2 px-4 py-3 font-display font-bold transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:scale-[1.02] active:scale-95"
      } ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-md"
          : "bg-card hover:bg-secondary border-border text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
