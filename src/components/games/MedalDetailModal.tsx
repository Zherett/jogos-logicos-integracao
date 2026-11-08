import { Award, CheckCircle, Clock, Compass, HelpCircle, Lock, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MedalIcon } from "./MedalIcon";
import {
  RARITY_INFO,
  MEDAL_XP_REWARDS,
  type MedalDefinition,
  type PlayerUnlockedMedal,
} from "@/lib/medals-catalog";
import { MEDAL_POINTS_REWARDS } from "@/lib/career-points";
import { getCachedMedalPioneers, formatPioneerLabel } from "@/lib/medal-pioneers";

interface Props {
  medal: MedalDefinition | null;
  unlockedInfo?: PlayerUnlockedMedal | null;
  progressText?: string;
  percentComplete?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MedalDetailModal({
  medal,
  unlockedInfo,
  progressText,
  percentComplete = 0,
  open,
  onOpenChange,
}: Props) {
  if (!medal) return null;

  const isUnlocked = Boolean(unlockedInfo);
  const isSecretLocked = Boolean(medal.isSecret && !isUnlocked);
  const isSecretRevealed = Boolean(medal.isSecret && isUnlocked);
  const rarity = RARITY_INFO[medal.rarity];
  const stackCount = unlockedInfo?.count ?? 1;
  const showStackBadge = isUnlocked && (medal.isStackable || stackCount > 1);

  const pioneers = getCachedMedalPioneers();
  const pioneer = medal ? pioneers[medal.id] : null;
  const pioneerInfo = formatPioneerLabel(pioneer);

  let formattedDate: string | null = null;
  if (unlockedInfo?.unlockedAt) {
    try {
      const d = new Date(unlockedInfo.unlockedAt);
      formattedDate = d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      formattedDate = unlockedInfo.unlockedAt;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md rounded-3xl border bg-card p-6 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{isSecretLocked ? "Medalha Secreta" : medal.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center text-center">
          {/* Medal Icon with Neon Glow */}
          <div
            className={`relative mb-4 grid h-24 w-24 place-items-center rounded-3xl border-2 transition-transform duration-300 ${
              isSecretRevealed
                ? "border-emerald-400 ring-4 ring-emerald-400/80 shadow-[0_0_30px_rgba(34,197,94,0.85)] animate-pulse scale-105"
                : isUnlocked
                  ? rarity.neonBorderClass + " scale-105"
                  : "border-muted-foreground/30 bg-muted/40 opacity-75"
            }`}
            style={{
              boxShadow: isSecretRevealed
                ? "0 0 32px rgba(34, 197, 94, 0.85), inset 0 0 16px rgba(34, 197, 94, 0.35)"
                : isUnlocked
                  ? `0 0 25px ${rarity.glowHex}`
                  : undefined,
            }}
          >
            {isSecretLocked ? (
              <HelpCircle className="h-12 w-12 text-amber-500/80" />
            ) : (
              <MedalIcon
                name={medal.iconName}
                className={`h-12 w-12 ${
                  isSecretRevealed
                    ? "text-emerald-400"
                    : isUnlocked
                      ? rarity.textColor
                      : "text-muted-foreground"
                }`}
              />
            )}
            {isUnlocked && (
              showStackBadge ? (
                <span
                  className="absolute -top-2.5 -right-2.5 flex h-8 min-w-8 px-2 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-mono text-xs font-black border-2 border-background shadow-lg"
                  title={`${stackCount}x conquistada`}
                >
                  {stackCount}
                </span>
              ) : (
                <span className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                  <CheckCircle className="h-4 w-4" />
                </span>
              )
            )}
          </div>

          {/* Rarity, Reward & Category Tag */}
          <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
            {isSecretRevealed && (
              <span className="rounded-full bg-emerald-950/80 border border-emerald-400 px-2.5 py-0.5 text-[11px] font-black text-emerald-300 shadow-sm flex items-center gap-1 animate-pulse">
                <span>✨</span> Aura Secreta Revelada
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-0.5 text-xs font-black uppercase tracking-wider ${
                isSecretRevealed
                  ? "border-emerald-400 bg-emerald-950/60 text-emerald-300"
                  : rarity.badgeBgClass
              }`}
            >
              {rarity.label}
            </span>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
              {isSecretLocked ? "+?? XP" : `+${MEDAL_XP_REWARDS[medal.rarity]} XP`}
            </span>
            <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {isSecretLocked ? "SECRETA" : medal.category.replace("_", " ").toUpperCase()}
            </span>
            {medal.isStackable && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
                EMPILHÁVEL
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-display text-xl font-black text-foreground">
            {isSecretLocked ? "Medalha Secreta" : medal.title}
          </h3>

          {/* Description */}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {isSecretLocked
              ? "Medalha secreta. Jogue e descubra como conquistá-la!"
              : medal.description}
          </p>

          {/* Recompensas da Medalha: Pontos de Conquista e XP */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-500">
              🪙 +{MEDAL_POINTS_REWARDS[medal.rarity] ?? 20} Pontos
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1 text-xs font-bold text-primary">
              ⚡ +{MEDAL_XP_REWARDS[medal.rarity] ?? 10} XP
            </span>
          </div>

          {/* Unlock Status / Progress */}
          <div className="mt-5 w-full rounded-2xl border bg-secondary/30 p-3.5 text-left">
            {isUnlocked ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-500 dark:text-emerald-400">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Medalha Desbloqueada e Conquistada!</span>
                  </div>
                  {showStackBadge && (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                      {stackCount}x no inventário
                    </span>
                  )}
                </div>
                {formattedDate && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Obtida em: <b>{formattedDate}</b>
                  </p>
                )}
              </div>
            ) : isSecretLocked ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground py-1">
                <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>Requisitos ocultos. Jogue e descubra para desbloquear!</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Ainda não desbloqueada
                  </span>
                  <span>{Math.round(percentComplete)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, percentComplete))}%` }}
                  />
                </div>
                {progressText && (
                  <p className="text-right text-[11px] font-semibold text-primary">
                    {progressText}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Primeiro Aluno a Conquistar (Pioneiro da Medalha) */}
          <div className="mt-3 w-full rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 text-left">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-600 dark:text-amber-400">
              <Compass className="h-4 w-4 shrink-0" />
              <span>{pioneerInfo.title}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {pioneerInfo.description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-5 w-full rounded-xl bg-secondary py-2.5 font-display text-xs font-bold text-secondary-foreground transition-all hover:bg-secondary/80 active:scale-95"
          >
            Fechar Detalhes
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
