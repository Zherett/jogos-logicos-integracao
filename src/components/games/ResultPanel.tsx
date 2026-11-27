import {
  Trophy,
  Target,
  XCircle,
  Star,
  TrendingUp,
  RotateCcw,
  Home,
  Settings,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type GameId } from "@/lib/game-storage";
import { computeMatchDisplayXp } from "@/lib/player-profile";
import { usePlayerAuth } from "@/lib/player-auth";
import { getActiveEventBonuses } from "@/lib/custom-events";
import { getAuthoritativeNow } from "@/lib/playfab";

interface Props {
  score: number;
  correct: number;
  wrong: number;
  level: number;
  gameId?: GameId;
  mode?: string;
  isTeam?: boolean;
  earnedXp?: number;
  xpFormula?: string;
  onReplay: () => void;
  onMenu: () => void;
  onChangeSettings?: () => void;
}

export function ResultPanel({
  score,
  correct,
  wrong,
  level,
  gameId,
  mode,
  isTeam,
  earnedXp,
  xpFormula,
  onReplay,
  onMenu,
  onChangeSettings,
}: Props) {
  const total = correct + wrong;
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

  let authProfile: { dailyXp?: number; dailyXpDate?: string } | null = null;
  try {
    const auth = usePlayerAuth();
    authProfile = auth.profile;
  } catch {
    /* fallback se renderizado fora do contexto de auth */
  }

  const xpInfo = computeMatchDisplayXp({
    score,
    correct,
    wrong,
    level,
    gameId,
    mode,
    isTeam,
    currentDailyXp: authProfile?.dailyXp,
    dailyXpDate: authProfile?.dailyXpDate,
  });

  const displayXpValue =
    earnedXp !== undefined
      ? xpFormula
        ? `${earnedXp} XP ${xpFormula}`
        : `${earnedXp} XP`
      : xpInfo.displayLabel;

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-6 sm:p-8 shadow-xl animate-pop-in">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Trophy className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-3xl font-bold">Fim de jogo!</h2>
        <p className="text-muted-foreground">Veja como você se saiu</p>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Linha 1 */}
        <Row icon={<Trophy />} label="Pontuação" value={score} tone="accent" />
        <Row icon={<Target />} label="Acertos" value={correct} tone="success" />
        <Row icon={<XCircle />} label="Erros" value={wrong} tone="destructive" />

        {/* Linha 2 — XP logo abaixo de Erros na 3ª coluna */}
        <Row icon={<Star />} label="Nível" value={level} tone="primary" />
        <Row icon={<TrendingUp />} label="Aproveitamento" value={`${pct}%`} tone="primary" />
        <Row
          icon={<Zap className="h-5 w-5" />}
          label="XP"
          value={displayXpValue}
          tone="xp"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {mode === "torneio_semanal" && (() => {
        const eventBonuses = getActiveEventBonuses(
          gameId,
          1000,
          20,
          undefined,
          getAuthoritativeNow(),
          undefined,
          true,
        );
        const rankedMult = eventBonuses.rankedMultiplier ?? 1;
        const hasRealEffort = correct + wrong >= 1 || score > 0;
        const basePts = hasRealEffort ? Math.max(1, 10 - wrong) : 0;
        const finalPts = hasRealEffort ? Math.round(basePts * rankedMult) : 0;
        return (
          <div className="mt-4 rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 p-3.5 text-center shadow-xs">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
              <Trophy className="h-4 w-4" /> Pontuação da Partida Ranqueada
            </div>
            <div className="mt-1 font-display text-2xl font-black text-foreground">
              +{finalPts} {finalPts === 1 ? "Ponto" : "Pontos"} Ranqueados
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {hasRealEffort
                ? `10 pontos base - ${wrong} ${wrong === 1 ? "erro" : "erros"} (mínimo garantido de 1 pt)`
                : "Partida encerrada sem respostas (0 pts ranqueados)"}
              {hasRealEffort && rankedMult > 1 && (
                <span className="ml-1 text-amber-500 font-bold">
                  • ⚡ Evento {rankedMult}x Ativo!
                </span>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button size="lg" className="flex-1 h-14 text-base font-bold" onClick={onReplay}>
          <RotateCcw className="mr-2 h-5 w-5" />{" "}
          {mode === "torneio_semanal" ? "Treinar novamente (Modo Casual)" : "Jogar novamente"}
        </Button>
        {onChangeSettings && (
          <Button size="lg" variant="outline" className="flex-1 h-14 text-base font-bold" onClick={onChangeSettings}>
            <Settings className="mr-2 h-5 w-5" /> Alterar
          </Button>
        )}
        <Button size="lg" variant="secondary" className="flex-1 h-14 text-base font-bold" onClick={onMenu}>
          <Home className="mr-2 h-5 w-5" /> Menu
        </Button>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: string;
  className?: string;
}) {
  const map: Record<string, string> = {
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    xp: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl border bg-background/60 p-3 ${className ?? ""}`}>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${map[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-display text-base sm:text-lg font-bold leading-tight break-words">{value}</div>
      </div>
    </div>
  );
}
