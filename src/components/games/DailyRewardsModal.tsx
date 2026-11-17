import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Flame,
  CheckCircle2,
  Lock,
  Sparkles,
  Gift,
  ShieldAlert,
  Coins,
  Zap,
  Medal,
} from "lucide-react";
import type { PlayerProfile } from "@/lib/playfab.ts";
import { getLocalDateKey } from "@/lib/player-profile.ts";
import {
  DAILY_REWARDS_SCHEDULE,
  getCurrentCycleDay,
  getCompletedCyclesCount,
  getDayStatus,
} from "@/lib/daily-rewards.ts";

interface DailyRewardsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: PlayerProfile | null;
}

export function DailyRewardsModal({
  open,
  onOpenChange,
  profile,
}: DailyRewardsModalProps) {
  const streak = profile?.streakDays ?? 1;
  const currentDay = getCurrentCycleDay(streak);
  const completedCycles = getCompletedCyclesCount(streak);
  const todayKey = getLocalDateKey();
  const isTodayClaimed = profile?.lastDailyLoginPointsDate === todayKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-6 shadow-2xl border-2 border-amber-500/40 bg-card">
        <DialogHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-xs font-black uppercase text-amber-600 dark:text-amber-400">
              <Calendar className="h-3.5 w-3.5" /> Trilha Semanal
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              <ShieldAlert className="h-3 w-3 text-amber-500" /> Prévia ADM • Não Coletável
            </span>
          </div>

          <DialogTitle className="font-display text-xl sm:text-2xl font-black text-foreground pt-2 flex items-center gap-2">
            <span>Recompensas Diárias</span>
            <span className="text-amber-500">✨</span>
          </DialogTitle>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-bold text-foreground">
              <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
              Ofensiva: <b className="text-orange-500 font-mono">{streak}</b> {streak === 1 ? "dia" : "dias"}
            </span>
            <span>•</span>
            <span>
              Dia no Ciclo: <b className="text-primary font-bold">{currentDay} de 7</b>
            </span>
            {completedCycles > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  🔄 {completedCycles} {completedCycles === 1 ? "ciclo concluído" : "ciclos concluídos"}
                </span>
              </>
            )}
          </div>
        </DialogHeader>

        {/* Banner Informativo de Prévia */}
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            Estrutura interna em testes (visível apenas para Administradores).
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            A cada dia que você entra e joga, um novo marco é liberado. Ao completar o 7º dia, a trilha reinicia no Dia 1 mantendo o progresso das medalhas cumulativas!
          </p>
        </div>

        {/* Lista dos 7 Dias da Trilha */}
        <div className="space-y-2.5 py-1">
          {DAILY_REWARDS_SCHEDULE.map((tier) => {
            const status = getDayStatus(tier.day, currentDay, isTodayClaimed);
            const isToday = status === "today";
            const isCollected = status === "collected";
            const isLocked = status === "locked";

            return (
              <div
                key={tier.day}
                className={`relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-3 sm:p-3.5 transition-all ${
                  isToday
                    ? "border-amber-500/70 bg-gradient-to-r from-amber-500/15 via-primary/5 to-transparent shadow-md ring-2 ring-amber-500/30 scale-[1.01]"
                    : isCollected
                      ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground"
                      : "border-border/60 bg-secondary/30 opacity-75"
                }`}
              >
                {/* Lado Esquerdo: Dia, Título e Marcador */}
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-mono text-sm font-black shadow-inner ${
                      isToday
                        ? "bg-amber-500 text-zinc-950 font-black shadow-amber-500/30"
                        : isCollected
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {isCollected ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      tier.day
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-foreground">
                        Dia {tier.day}: {tier.title}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/50 px-2 py-0.2 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 animate-pulse">
                          Hoje
                        </span>
                      )}
                    </div>

                    {/* Tags de Recompensas do Dia */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
                        <Coins className="h-3 w-3" /> +{tier.points} pts
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[11px] font-black text-primary">
                        <Zap className="h-3 w-3" /> +{tier.xp} XP
                      </span>

                      {/* Marco de Medalha */}
                      {tier.milestoneMedalId && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                          <Medal className="h-3 w-3" />
                          {tier.day === 3 && "🥉 Hábito (Bronze)"}
                          {tier.day === 5 && "🥈 Disciplina (Prata)"}
                          {tier.day === 7 && "🥇 Constância (Ouro)"}
                        </span>
                      )}

                      {/* Preparação do Baú Semanal Especial */}
                      {tier.chestReward && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Gift className="h-3 w-3 text-emerald-500" />
                          {tier.chestReward.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Botão / Status */}
                <div className="shrink-0 self-end sm:self-center">
                  {isCollected ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Coletado
                    </span>
                  ) : isToday ? (
                    <button
                      type="button"
                      disabled
                      title="Sistema em testes de desenvolvimento pelo Administrador. Coleta real desativada nesta prévia."
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/40 text-zinc-900 dark:text-zinc-100 font-display text-xs font-bold px-4 py-2 opacity-80 cursor-not-allowed border border-amber-500/50"
                    >
                      <span>Resgatar</span>
                      <span className="text-[10px] opacity-75">(Prévia)</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground px-3 py-1.5 rounded-xl bg-muted/60 border">
                      <Lock className="h-3.5 w-3.5" /> Bloqueado
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé Informativo */}
        <div className="pt-2 border-t text-center text-[11px] text-muted-foreground">
          Entre na plataforma e dispute partidas todos os dias para não perder a sua sequência.
        </div>
      </DialogContent>
    </Dialog>
  );
}
