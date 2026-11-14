import { Trophy, Star, Clock, Flame } from "lucide-react";
import { formatTime } from "@/lib/use-countdown";

interface Props {
  time: number;
  score: number;
  level: number;
  streak?: number;
  wrong?: number;
}

export function GameHud({ time, score, level, streak, wrong }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-3 select-none">
      <Stat icon={<Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Tempo" value={formatTime(time)} tone="primary" />
      {wrong === undefined ? (
        <Stat icon={<Trophy className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Pontos" value={score.toString()} tone="accent" />
      ) : (
        <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-xl sm:rounded-2xl border bg-card p-1.5 sm:p-2.5 shadow-2xs min-w-0">
          <div className="grid h-7 w-7 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg sm:rounded-xl bg-accent/15 text-accent">
            <Trophy className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate font-semibold leading-tight">Pontos</div>
            <div className="truncate text-xs sm:text-base font-black font-display text-foreground leading-tight">{score}</div>
          </div>
          <div className="h-6 sm:h-8 w-px bg-border shrink-0" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="text-[9px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate font-semibold leading-tight">Erros</div>
            <div className={`truncate text-xs sm:text-base font-black font-display leading-tight ${wrong > 0 ? "text-destructive" : "text-foreground"}`}>
              {wrong}
            </div>
          </div>
        </div>
      )}
      <Stat icon={<Star className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Nível" value={level.toString()} tone="primary" />
      <Stat icon={<Flame className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Sequência" value={(streak ?? 0).toString()} tone="accent" />
    </div>
  );
}

function Stat({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "accent" }) {
  const bg = tone === "primary"
    ? "bg-primary/10 text-primary"
    : "bg-accent/15 text-accent";
  return (
    <div className="flex items-center gap-1.5 sm:gap-3 rounded-xl sm:rounded-2xl border bg-card p-1.5 sm:p-2.5 shadow-2xs min-w-0">
      <div className={`grid h-7 w-7 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg sm:rounded-xl ${bg}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate font-semibold leading-tight">{label}</div>
        <div className="truncate text-xs sm:text-base font-black font-display text-foreground leading-tight">{value}</div>
      </div>
    </div>
  );
}
