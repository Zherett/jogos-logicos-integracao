import { useMemo } from "react";
import { Crown, Sparkles, Shield, Award, Star, Gem } from "lucide-react";
import {
  getTournamentRank,
  TOURNAMENT_RANKS,
  type TournamentRankDefinition,
  type TournamentRankId,
} from "@/lib/weekly-tournament";

interface Props {
  rankId?: TournamentRankId | string | null;
  points?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  showPoints?: boolean;
  className?: string;
}

export function TournamentRankBadge({
  rankId,
  points,
  size = "md",
  showLabel = false,
  showPoints = false,
  className = "",
}: Props) {
  const rank: TournamentRankDefinition = useMemo(() => {
    if (typeof points === "number") {
      return getTournamentRank(points).currentRank;
    }
    if (rankId) {
      const found = TOURNAMENT_RANKS.find((r) => r.id === rankId);
      if (found) return found;
    }
    return TOURNAMENT_RANKS[0]; // fallback Bronze I
  }, [rankId, points]);

  const sizeClasses = {
    xs: {
      box: "h-6 w-6 text-[10px]",
      numeral: "text-[10px] font-black",
      icon: "h-3 w-3",
      padding: "p-0.5",
    },
    sm: {
      box: "h-8 w-8 text-xs",
      numeral: "text-xs font-black",
      icon: "h-4 w-4",
      padding: "p-1",
    },
    md: {
      box: "h-11 w-11 text-sm",
      numeral: "text-sm font-black",
      icon: "h-5 w-5",
      padding: "p-1.5",
    },
    lg: {
      box: "h-14 w-14 text-base",
      numeral: "text-base font-black tracking-tight",
      icon: "h-6 w-6",
      padding: "p-2",
    },
    xl: {
      box: "h-20 w-20 text-xl",
      numeral: "text-xl font-black tracking-wider",
      icon: "h-9 w-9",
      padding: "p-3",
    },
  }[size];

  // Distinct geometric silhouettes based on the rank family shape
  const shapeClasses = {
    shield: "rounded-b-2xl rounded-t-lg border-2 shadow-xs",
    crest: "rounded-xl border-2 shadow-sm",
    star: "rounded-2xl border-2 ring-2 ring-amber-400/40 shadow-sm",
    diamond: "rounded-2xl border-2 ring-2 ring-cyan-400/40 shadow-sm",
    hexagon: "rounded-2xl border-2 ring-2 ring-fuchsia-400/50 shadow-md",
    crown: "rounded-2xl border-2 ring-2 ring-rose-500/60 shadow-lg",
  }[rank.shape];

  // Background gradients and metallic textures
  const gradientBg = {
    bronze: "bg-gradient-to-br from-[#f7e4d0] to-[#e6be98] dark:from-[#3b2310] dark:to-[#221307]",
    prata: "bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-800 dark:to-slate-900",
    ouro: "bg-gradient-to-br from-amber-100 to-amber-300 dark:from-amber-950 dark:to-yellow-950",
    platina: "bg-gradient-to-br from-cyan-100 to-cyan-300 dark:from-cyan-950 dark:to-teal-950",
    diamante: "bg-gradient-to-br from-fuchsia-100 to-purple-300 dark:from-fuchsia-950 dark:to-purple-950",
    mestre: "bg-gradient-to-br from-rose-200 via-red-300 to-amber-200 dark:from-rose-950 dark:via-red-950 dark:to-amber-950",
  }[rank.tier];

  const rankTooltip = useMemo(() => {
    if (typeof points === "number") {
      const nextRank = TOURNAMENT_RANKS.find((r) => r.minPoints > rank.minPoints);
      if (!nextRank) {
        return `${rank.name} • ${points} pts (Patente Máxima)`;
      }
      const needed = Math.max(0, nextRank.minPoints - points);
      return `${rank.name} • ${points} pts (Faltam ${needed} pts para ${nextRank.name})`;
    }
    return `${rank.name} • Requer ${rank.minPoints}+ pontos na Ranqueada`;
  }, [rank, points]);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div
        className={`relative flex items-center justify-center shrink-0 select-none transition-transform hover:scale-105 ${sizeClasses.box} ${shapeClasses} ${gradientBg} ${rank.borderColor}`}
        style={{ boxShadow: `0 0 12px ${rank.glowHex}40` }}
        title={rankTooltip}
      >
        {/* Core center: Roman Numeral or Crown for Mestre */}
        {rank.tier === "mestre" ? (
          <Crown className={`${sizeClasses.icon} text-rose-600 dark:text-rose-400 fill-rose-500 drop-shadow`} />
        ) : (
          <span
            className={`font-mono ${sizeClasses.numeral} ${rank.textColor} drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]`}
          >
            {rank.division}
          </span>
        )}

        {/* Small corner emblem icon indicating the tier family */}
        {size !== "xs" && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background/90 text-[8px] shadow-xs">
            {rank.tier === "bronze" && <Shield className="h-2 w-2 text-[#cd7f32]" />}
            {rank.tier === "prata" && <Award className="h-2 w-2 text-slate-400" />}
            {rank.tier === "ouro" && <Star className="h-2 w-2 text-amber-500 fill-amber-400" />}
            {rank.tier === "platina" && <Sparkles className="h-2 w-2 text-cyan-400 fill-cyan-400" />}
            {rank.tier === "diamante" && <Gem className="h-2 w-2 text-fuchsia-400 fill-fuchsia-400" />}
            {rank.tier === "mestre" && <Crown className="h-2 w-2 text-rose-500 fill-rose-400" />}
          </span>
        )}
      </div>

      {(showLabel || showPoints) && (
        <div className="min-w-0 text-left leading-tight">
          {showLabel && (
            <div className={`font-display text-xs font-black truncate ${rank.textColor}`}>
              {rank.name}
            </div>
          )}
          {showPoints && typeof points === "number" && (
            <div className="font-mono text-[10px] text-muted-foreground font-semibold">
              {points} pts
            </div>
          )}
        </div>
      )}
    </div>
  );
}
