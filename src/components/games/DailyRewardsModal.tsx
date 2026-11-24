import { useEffect, useMemo, useState } from "react";
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
  Target,
  Trophy,
} from "lucide-react";
import {
  claimCurrentPlayerDailyMission,
  claimCurrentPlayerDailyReward,
  claimCurrentPlayerWeeklyMission,
  type GameStatRow,
  type PlayerProfile,
} from "@/lib/playfab.ts";
import type { AdminConfig } from "@/lib/game-codes.ts";
import { getLocalDateKey } from "@/lib/player-profile.ts";
import { mergeWithDefaultCardPacks } from "@/lib/cards-catalog.ts";
import type { ChestDefinition, ChestOpenOutcome } from "@/lib/chests-catalog.ts";
import {
  DAILY_STREAK_BONUS_CAP,
  DAILY_STREAK_BONUS_STEP,
  getDailyRewardClaimState,
  getStreakBonusCoins,
  getStreakBonusPoints,
  getStreakBonusXp,
  getDayStatus,
  resolveDailyRewardsSchedule,
} from "@/lib/daily-rewards.ts";
import { DEFAULT_DAILY_MISSION_COINS, generateDailyMissions } from "@/lib/daily-missions.ts";
import { DEFAULT_WEEKLY_MISSION_COINS, generateWeeklyMissions } from "@/lib/weekly-missions.ts";
import { getWeekInfo } from "@/lib/weekly-tournament.ts";
import { ChestOpeningModal } from "./ChestOpeningModal";

interface DailyRewardsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: PlayerProfile | null;
  stats?: GameStatRow[];
  adminConfig?: Partial<AdminConfig> | null;
  onProfileUpdated?: () => void;
}

export function DailyRewardsModal({
  open,
  onOpenChange,
  profile,
  stats = [],
  adminConfig,
  onProfileUpdated,
}: DailyRewardsModalProps) {
  const [activeTab, setActiveTab] = useState<"recompensas" | "missoes" | "semanais">("recompensas");
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [openedChest, setOpenedChest] = useState<{
    chest: ChestDefinition;
    outcome: ChestOpenOutcome;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab("recompensas");
      setFeedbackMsg(null);
    }
  }, [open]);

  const routineConfig = adminConfig?.weeklyRoutineConfig;
  const streak = Math.max(1, profile?.streakDays ?? 1);
  const todayKey = getLocalDateKey();
  const claimState = getDailyRewardClaimState(profile, todayKey);
  const { isTodayClaimed, currentDay, completedCycles } = claimState;

  const streakStepPts = Math.max(0, Math.floor(routineConfig?.streakPointsStep ?? DAILY_STREAK_BONUS_STEP));
  const streakCapPts = Math.max(0, Math.floor(routineConfig?.streakPointsCap ?? DAILY_STREAK_BONUS_CAP));
  const streakBonusPoints = getStreakBonusPoints(streak, routineConfig);
  const streakBonusXp = getStreakBonusXp(streak, routineConfig);
  const streakBonusCoins = getStreakBonusCoins(streak, routineConfig);
  const dailyLoginCoins = Math.max(0, Math.floor(routineConfig?.dailyLoginCoins ?? 0));

  const schedule = useMemo(
    () => resolveDailyRewardsSchedule(routineConfig, adminConfig?.chestsCatalog),
    [routineConfig, adminConfig?.chestsCatalog],
  );

  const playerLevel = Math.max(1, profile?.level ?? 1);
  const levelTierLabel =
    playerLevel <= 3
      ? "Nível 1–3 (5 Missões)"
      : playerLevel <= 6
        ? "Nível 4–6 (5 Missões)"
        : "Nível 7–10 (5 Missões)";

  const missions = useMemo(
    () =>
      generateDailyMissions({
        profile,
        stats,
        adminConfig,
        dateKey: todayKey,
      }),
    [profile, stats, adminConfig, todayKey],
  );
  const completedMissionsCount = useMemo(
    () => missions.filter((m) => m.current >= m.target).length,
    [missions],
  );
  const claimableDailyMissionsCount = useMemo(
    () => missions.filter((m) => m.current >= m.target && !m.claimed).length,
    [missions],
  );

  const weekInfo = useMemo(() => getWeekInfo(), []);
  const weeklyLevelTierLabel =
    playerLevel <= 3
      ? "Nível 1–3 (4 Missões)"
      : playerLevel <= 6
        ? "Nível 4–6 (4 Missões)"
        : "Nível 7–10 (4 Missões)";

  const weeklyMissions = useMemo(
    () =>
      generateWeeklyMissions({
        profile,
        adminConfig,
        weekKey: weekInfo.weekKey,
        weekIndex: weekInfo.weekIndex,
      }),
    [profile, adminConfig, weekInfo.weekKey, weekInfo.weekIndex],
  );
  const completedWeeklyMissionsCount = useMemo(
    () => weeklyMissions.filter((m) => m.current >= m.target).length,
    [weeklyMissions],
  );
  const claimableWeeklyMissionsCount = useMemo(
    () => weeklyMissions.filter((m) => m.current >= m.target && !m.claimed).length,
    [weeklyMissions],
  );

  const packsCatalog = useMemo(
    () => mergeWithDefaultCardPacks(adminConfig?.cardPacks),
    [adminConfig?.cardPacks],
  );

  const isStudentsRolloutActive = Boolean(adminConfig?.rolloutFlags?.enableDailyRoutineForStudents);

  async function handleClaimDaily() {
    if (claimingDaily || isTodayClaimed) return;
    setClaimingDaily(true);
    setFeedbackMsg(null);
    try {
      const res = await claimCurrentPlayerDailyReward();
      if (!res.ok) {
        setFeedbackMsg(res.error ?? "Não foi possível resgatar hoje.");
        return;
      }
      const parts: string[] = [];
      if (res.pointsAwarded > 0) parts.push(`+${res.pointsAwarded} pts`);
      if (res.xpAwarded > 0) parts.push(`+${res.xpAwarded} XP`);
      if (res.coinsAwarded > 0) parts.push(`+${res.coinsAwarded} moedas`);
      setFeedbackMsg(`✅ Dia ${res.claimedDay} resgatado! ${parts.join(" • ")}`);
      onProfileUpdated?.();
      if (res.chestDefinition && res.chestOutcome) {
        setOpenedChest({ chest: res.chestDefinition, outcome: res.chestOutcome });
      }
    } finally {
      setClaimingDaily(false);
    }
  }

  async function handleClaimDailyMission(missionId: string) {
    if (claimingMissionId) return;
    setClaimingMissionId(missionId);
    setFeedbackMsg(null);
    try {
      const res = await claimCurrentPlayerDailyMission(missionId);
      if (!res.ok) {
        setFeedbackMsg(res.error ?? "Não foi possível resgatar esta missão.");
        return;
      }
      const parts: string[] = [];
      if (res.pointsAwarded > 0) parts.push(`+${res.pointsAwarded} pts`);
      if (res.xpAwarded > 0) parts.push(`+${res.xpAwarded} XP`);
      if (res.coinsAwarded > 0) parts.push(`+${res.coinsAwarded} moedas`);
      setFeedbackMsg(`✅ Missão diária resgatada! ${parts.join(" • ")}`);
      onProfileUpdated?.();
    } finally {
      setClaimingMissionId(null);
    }
  }

  async function handleClaimWeeklyMission(missionId: string) {
    if (claimingMissionId) return;
    setClaimingMissionId(missionId);
    setFeedbackMsg(null);
    try {
      const res = await claimCurrentPlayerWeeklyMission(missionId);
      if (!res.ok) {
        setFeedbackMsg(res.error ?? "Não foi possível resgatar esta missão semanal.");
        return;
      }
      const parts: string[] = [];
      if (res.pointsAwarded > 0) parts.push(`+${res.pointsAwarded} pts`);
      if (res.xpAwarded > 0) parts.push(`+${res.xpAwarded} XP`);
      if (res.coinsAwarded > 0) parts.push(`+${res.coinsAwarded} moedas`);
      setFeedbackMsg(`🏆 Missão semanal resgatada! ${parts.join(" • ")}`);
      onProfileUpdated?.();
    } finally {
      setClaimingMissionId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl border-2 border-amber-500/40 bg-card">
          <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-xs font-black uppercase text-amber-600 dark:text-amber-400">
                <Calendar className="h-3.5 w-3.5" /> Central Diária
              </span>
              {!isStudentsRolloutActive && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  <ShieldAlert className="h-3 w-3 text-amber-500" /> Modo Teste ADM • Coleta Ativa
                </span>
              )}
            </div>

            <DialogTitle className="font-display text-xl sm:text-2xl font-black text-foreground pt-2 flex flex-wrap items-center gap-2">
              <span>
                {activeTab === "recompensas"
                  ? "Recompensas Diárias"
                  : activeTab === "missoes"
                    ? "Missões Diárias"
                    : "Missões Semanais"}
              </span>
              <span className="text-amber-500">✨</span>
              {activeTab === "missoes" && (
                <span
                  aria-label={`${completedMissionsCount} de ${missions.length} missões concluídas`}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-black text-primary"
                >
                  {completedMissionsCount} / {missions.length}
                </span>
              )}
              {activeTab === "semanais" && (
                <span
                  aria-label={`${completedWeeklyMissionsCount} de ${weeklyMissions.length} missões semanais concluídas`}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs font-black text-amber-600 dark:text-amber-400"
                >
                  {completedWeeklyMissionsCount} / {weeklyMissions.length}
                </span>
              )}
            </DialogTitle>

            {/* Navegação em Abas Estilo Pílula */}
            <div
              role="tablist"
              aria-label="Seções diárias e semanais"
              className="mt-2 grid grid-cols-3 items-center rounded-full border border-border/70 bg-secondary/40 p-1 shadow-2xs gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "recompensas"}
                onClick={() => setActiveTab("recompensas")}
                className={`relative flex items-center justify-center gap-1.5 rounded-full px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer ${
                  activeTab === "recompensas"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">Recompensa Diária</span>
                {!isTodayClaimed && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "missoes"}
                onClick={() => setActiveTab("missoes")}
                className={`relative flex items-center justify-center gap-1.5 rounded-full px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer ${
                  activeTab === "missoes"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">Missões Diárias</span>
                {claimableDailyMissionsCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-zinc-950">
                    {claimableDailyMissionsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "semanais"}
                onClick={() => setActiveTab("semanais")}
                className={`relative flex items-center justify-center gap-1.5 rounded-full px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer ${
                  activeTab === "semanais"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Trophy className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">Missões Semanais</span>
                {claimableWeeklyMissionsCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-zinc-950">
                    {claimableWeeklyMissionsCount}
                  </span>
                )}
              </button>
            </div>

            {feedbackMsg && (
              <div className="mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {feedbackMsg}
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {activeTab === "recompensas" ? (
              <div className="space-y-3">
                {/* Resumo de Check-in e Ofensiva */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Check-in: <b className="text-primary font-bold">Dia {currentDay} de 7</b>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-bold text-foreground">
                    <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
                    Ofensiva: <b className="text-orange-500 font-mono">{streak}</b>{" "}
                    {streak === 1 ? "dia seguido" : "dias seguidos"}
                  </span>
                  {streakBonusPoints > 0 && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-orange-600 dark:text-orange-400">
                        🔥 Bônus de Ofensiva Hoje: +{streakBonusPoints} pts
                      </span>
                    </>
                  )}
                  {completedCycles > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        🔄 {completedCycles} {completedCycles === 1 ? "ciclo concluído" : "ciclos concluídos"}
                      </span>
                    </>
                  )}
                </div>

                {/* Banner Informativo */}
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3 text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    Check-in acumulativo com Bônus de Ofensiva e Grande Baú no Dia 7.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Seu progresso na trilha de 7 dias <b>nunca regride</b> se você faltar um dia. Além disso, cada dia consecutivo seguido soma{" "}
                    <b>+{streakStepPts} pts</b> extras de ofensiva (até o teto de <b>+{streakCapPts} pts</b> por dia)!
                  </p>
                </div>

                {/* Lista dos 7 Dias da Trilha */}
                <div className="space-y-2.5 py-1">
                  {schedule.map((tier) => {
                    const status = getDayStatus(tier.day, currentDay, isTodayClaimed);
                    const isToday = status === "today";
                    const isCollected = status === "collected";
                    const isLocked = status === "locked";
                    const tierTotalCoins =
                      (tier.coins ?? 0) + (isToday ? dailyLoginCoins + streakBonusCoins : dailyLoginCoins);

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
                              {tierTotalCoins > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-yellow-600 dark:text-yellow-400">
                                  🪙 +{tierTotalCoins}
                                </span>
                              )}
                              {isToday && streakBonusPoints > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-orange-500/15 border border-orange-500/40 px-2 py-0.5 font-mono text-[11px] font-black text-orange-600 dark:text-orange-400">
                                  <Flame className="h-3 w-3" /> +{streakBonusPoints} pts Ofensiva
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[11px] font-black text-primary">
                                <Zap className="h-3 w-3" /> +{tier.xp + (isToday ? streakBonusXp : 0)} XP
                              </span>

                              {tier.milestoneMedalId && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                  <Medal className="h-3 w-3" />
                                  {tier.day === 3 && "🥉 Hábito (Bronze)"}
                                  {tier.day === 5 && "🥈 Disciplina (Prata)"}
                                  {tier.day === 7 && "🥇 Constância (Ouro)"}
                                </span>
                              )}

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
                              disabled={claimingDaily}
                              onClick={() => void handleClaimDaily()}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-display text-xs font-black px-4 py-2 shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-60"
                            >
                              <Gift className="h-3.5 w-3.5" />
                              <span>{claimingDaily ? "Resgatando..." : "Resgatar"}</span>
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

                <div className="pt-2 border-t text-center text-[11px] text-muted-foreground">
                  Entre todos os dias para acumular +{streakStepPts} pts de ofensiva por dia seguido (até +{streakCapPts} pts/dia)!
                </div>
              </div>
            ) : activeTab === "missoes" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3 py-1 font-bold text-primary">
                    <Target className="h-3.5 w-3.5" /> {levelTierLabel}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    Renova diariamente à 00h
                  </span>
                </div>

                <div className="space-y-2.5 py-1">
                  {missions.map((mission, idx) => {
                    const pct = Math.min(100, Math.round((mission.current / Math.max(1, mission.target)) * 100));
                    const isCompleted = mission.current >= mission.target;
                    const isClaimed = Boolean(mission.claimed);
                    const isClaimingThis = claimingMissionId === mission.id;
                    return (
                      <div
                        key={mission.id}
                        className={`rounded-2xl border p-3.5 transition-all space-y-2 ${
                          isClaimed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : isCompleted
                              ? "border-amber-500/60 bg-amber-500/10 shadow-sm"
                              : mission.isPersonalized
                                ? "border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent"
                                : "border-border/70 bg-secondary/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/15 font-mono text-xs font-black text-primary">
                                {idx + 1}
                              </span>
                              <span className="font-display text-sm font-bold text-foreground">
                                {mission.title}
                              </span>
                              {mission.isPersonalized && (
                                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                                  🎯 Personalizada
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground pl-8">
                              {mission.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-8 sm:pl-0">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
                              <Coins className="h-3 w-3" /> +{mission.rewardPoints} pts
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-yellow-600 dark:text-yellow-400">
                              🪙 +{mission.rewardCoins ?? DEFAULT_DAILY_MISSION_COINS}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[11px] font-black text-primary">
                              <Zap className="h-3 w-3" /> +{mission.rewardXp} XP
                            </span>
                          </div>
                        </div>

                        <div className="pl-8 flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                              <span>Progresso</span>
                              <span className="font-mono text-foreground">
                                {mission.current} / {mission.target}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isClaimed
                                    ? "bg-emerald-500"
                                    : mission.isPersonalized
                                      ? "bg-amber-500"
                                      : "bg-primary"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="shrink-0 self-end sm:self-center">
                            {isClaimed ? (
                              <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Resgatada
                              </span>
                            ) : isCompleted ? (
                              <button
                                type="button"
                                disabled={isClaimingThis}
                                onClick={() => void handleClaimDailyMission(mission.id)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-display text-xs font-black px-3.5 py-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60"
                              >
                                <Gift className="h-3.5 w-3.5" />
                                {isClaimingThis ? "Resgatando..." : "Resgatar"}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-xl bg-muted/60 border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                Em andamento
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 font-bold text-amber-600 dark:text-amber-400">
                    <Trophy className="h-3.5 w-3.5" /> {weeklyLevelTierLabel}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    Ciclo {weekInfo.weekKey} • Encerra {weekInfo.endsAtLabel} (Seg. 00h)
                  </span>
                </div>

                <div className="space-y-2.5 py-1">
                  {weeklyMissions.map((mission, idx) => {
                    const pct = Math.min(100, Math.round((mission.current / Math.max(1, mission.target)) * 100));
                    const isRankedMission =
                      mission.type === "weekly_ranked_ranks" || mission.type === "weekly_ranked_matches";
                    const isCompleted = mission.current >= mission.target;
                    const isClaimed = Boolean(mission.claimed);
                    const isClaimingThis = claimingMissionId === mission.id;

                    return (
                      <div
                        key={mission.id}
                        className={`rounded-2xl border p-3.5 transition-all space-y-2 ${
                          isClaimed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : isCompleted
                              ? "border-amber-500/60 bg-amber-500/10 shadow-sm"
                              : isRankedMission
                                ? "border-amber-500/50 bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent"
                                : "border-border/70 bg-secondary/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-500/15 font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                {idx + 1}
                              </span>
                              <span className="font-display text-sm font-bold text-foreground">
                                {mission.title}
                              </span>
                              {isRankedMission && (
                                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                                  🏆 Ranqueada
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground pl-8">
                              {mission.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-8 sm:pl-0">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
                              <Coins className="h-3 w-3" /> +{mission.rewardPoints} pts
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-yellow-600 dark:text-yellow-400">
                              🪙 +{mission.rewardCoins ?? DEFAULT_WEEKLY_MISSION_COINS}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[11px] font-black text-primary">
                              <Zap className="h-3 w-3" /> +{mission.rewardXp} XP
                            </span>
                          </div>
                        </div>

                        <div className="pl-8 flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                              <span>Progresso</span>
                              <span className="font-mono text-foreground">
                                {mission.current} / {mission.target}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isClaimed
                                    ? "bg-emerald-500"
                                    : isRankedMission
                                      ? "bg-amber-500"
                                      : "bg-primary"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="shrink-0 self-end sm:self-center">
                            {isClaimed ? (
                              <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Resgatada
                              </span>
                            ) : isCompleted ? (
                              <button
                                type="button"
                                disabled={isClaimingThis}
                                onClick={() => void handleClaimWeeklyMission(mission.id)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-display text-xs font-black px-3.5 py-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60"
                              >
                                <Gift className="h-3.5 w-3.5" />
                                {isClaimingThis ? "Resgatando..." : "Resgatar"}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-xl bg-muted/60 border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                Em andamento
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {openedChest && (
        <ChestOpeningModal
          chest={openedChest.chest}
          outcome={openedChest.outcome}
          packsCatalog={packsCatalog}
          onClose={() => setOpenedChest(null)}
        />
      )}
    </>
  );
}
