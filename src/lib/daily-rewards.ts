import type { PlayerProfile } from "./playfab.ts";
import { isSpecialAdminAccount } from "./playfab.ts";
import type { AdminConfig } from "./game-codes.ts";
import {
  mergeWithDefaultChests,
  openChest,
  type ChestDefinition,
  type ChestOpenOutcome,
} from "./chests-catalog.ts";
import { awardCareerPoints, awardCoins } from "./career-points.ts";
import { getLocalDateKey } from "./player-profile.ts";

/** Incremento de pontos por dia seguido na ofensiva (a partir do 2º dia consecutivo) */
export const DAILY_STREAK_BONUS_STEP = 5;

/** Teto máximo diário do bônus extra de ofensiva */
export const DAILY_STREAK_BONUS_CAP = 100;

/** ID padrão do Baú entregue no 7º dia do ciclo */
export const DEFAULT_DAY7_CHEST_ID = "weekly_epic";

export interface WeeklyRoutineConfigSlice {
  weekStartDay?: number;
  weekEndDay?: number;
  dailyLoginCoins?: number;
  streakPointsStep?: number;
  streakPointsCap?: number;
  streakXpStep?: number;
  streakCoinsStep?: number;
  streakCoinsCap?: number;
  day7ChestId?: string;
  dailyTiers?: Array<{ day: number; title: string; points: number; xp: number; coins: number }>;
}

/** Configuração de um dia específico na trilha de 7 dias */
export interface DailyRewardTier {
  day: number;
  title: string;
  points: number;
  xp: number;
  coins?: number;
  milestoneMedalId?: string;
  /** Baú especial entregue no 7º dia */
  chestReward?: {
    enabled: boolean;
    chestId: string;
    label: string;
    icon: string;
  };
}

/** Tabela progressiva oficial de 7 dias da Semana */
export const DAILY_REWARDS_SCHEDULE: readonly DailyRewardTier[] = [
  {
    day: 1,
    title: "Boas-Vindas à Semana",
    points: 25,
    xp: 10,
  },
  {
    day: 2,
    title: "Aquecendo os Motores",
    points: 30,
    xp: 15,
  },
  {
    day: 3,
    title: "Hábito Formado",
    points: 40,
    xp: 25,
    milestoneMedalId: "streak_3_days",
  },
  {
    day: 4,
    title: "Foco Redobrado",
    points: 50,
    xp: 35,
  },
  {
    day: 5,
    title: "Disciplina de Campeão",
    points: 65,
    xp: 50,
    milestoneMedalId: "streak_5_days",
  },
  {
    day: 6,
    title: "Reta Final",
    points: 80,
    xp: 70,
  },
  {
    day: 7,
    title: "Constância Lendária!",
    points: 120,
    xp: 100,
    milestoneMedalId: "streak_7_days",
    chestReward: {
      enabled: true,
      chestId: DEFAULT_DAY7_CHEST_ID,
      label: "Grande Baú Semanal",
      icon: "Gift",
    },
  },
] as const;

/**
 * Calcula o bônus extra de pontos por ofensiva de dias consecutivos:
 * - 1º dia (ou retorno após falta): 0 pts
 * - 2º dia seguido: +step pts (padrão +5)
 * - ... até o teto máximo (padrão 100 pts).
 */
export function getStreakBonusPoints(
  consecutiveDays?: number,
  routineConfig?: WeeklyRoutineConfigSlice | null,
): number {
  const safeDays = Math.max(1, Math.floor(consecutiveDays ?? 1));
  const step = Math.max(0, Math.floor(routineConfig?.streakPointsStep ?? DAILY_STREAK_BONUS_STEP));
  const cap = Math.max(0, Math.floor(routineConfig?.streakPointsCap ?? DAILY_STREAK_BONUS_CAP));
  const rawBonus = (safeDays - 1) * step;
  return Math.min(cap, Math.max(0, rawBonus));
}

export function getStreakBonusXp(
  consecutiveDays?: number,
  routineConfig?: WeeklyRoutineConfigSlice | null,
): number {
  const safeDays = Math.max(1, Math.floor(consecutiveDays ?? 1));
  const step = Math.max(0, Math.floor(routineConfig?.streakXpStep ?? 0));
  return Math.max(0, (safeDays - 1) * step);
}

export function getStreakBonusCoins(
  consecutiveDays?: number,
  routineConfig?: WeeklyRoutineConfigSlice | null,
): number {
  const safeDays = Math.max(1, Math.floor(consecutiveDays ?? 1));
  const step = Math.max(0, Math.floor(routineConfig?.streakCoinsStep ?? 0));
  const cap = Math.max(0, Math.floor(routineConfig?.streakCoinsCap ?? 0));
  if (step <= 0) return 0;
  const rawBonus = (safeDays - 1) * step;
  return cap > 0 ? Math.min(cap, rawBonus) : rawBonus;
}

/**
 * Resolve o baú configurado para o 7º dia do ciclo (padrão: Grande Baú Semanal - "weekly_epic").
 */
export function resolveDay7ChestDefinition(
  routineConfig?: WeeklyRoutineConfigSlice | null,
  chestsCatalog?: ChestDefinition[] | null,
): ChestDefinition {
  const allChests = mergeWithDefaultChests(chestsCatalog);
  const desiredId = (routineConfig?.day7ChestId || DEFAULT_DAY7_CHEST_ID).trim();
  const found =
    allChests.find((c) => c.id === desiredId && c.enabled !== false) ??
    allChests.find((c) => c.id === DEFAULT_DAY7_CHEST_ID) ??
    allChests[0];
  return found;
}

export function resolveDailyRewardsSchedule(
  routineConfig?: WeeklyRoutineConfigSlice | null,
  chestsCatalog?: ChestDefinition[] | null,
): DailyRewardTier[] {
  const customMap = new Map((routineConfig?.dailyTiers ?? []).map((t) => [t.day, t]));
  const day7Chest = resolveDay7ChestDefinition(routineConfig, chestsCatalog);
  return DAILY_REWARDS_SCHEDULE.map((base) => {
    const ov = customMap.get(base.day);
    return {
      ...base,
      title: ov?.title?.trim() || base.title,
      points: ov ? Math.max(0, Math.floor(ov.points)) : base.points,
      xp: ov ? Math.max(0, Math.floor(ov.xp)) : base.xp,
      coins: ov ? Math.max(0, Math.floor(ov.coins)) : 0,
      ...(base.day === 7 && day7Chest
        ? {
            chestReward: {
              enabled: true,
              chestId: day7Chest.id,
              label: day7Chest.name,
              icon: "Gift",
            },
          }
        : {}),
    };
  });
}

/**
 * Calcula o dia atual (1 a 7) na trilha de Check-in Acumulativo.
 * O progresso nunca regride ao faltar um dia:
 * - Se ainda não coletou hoje, retorna o próximo passo disponível (totalCheckIns % 7 + 1).
 * - Se já coletou hoje, mantém exibindo o passo recém-coletado.
 */
export function getCumulativeCheckInDay(
  totalCheckIns?: number,
  isTodayClaimed = false,
): number {
  const count = Math.max(0, Math.floor(totalCheckIns ?? 0));
  if (count === 0) return 1;
  if (isTodayClaimed) {
    const mod = count % 7;
    return mod === 0 ? 7 : mod;
  }
  return (count % 7) + 1;
}

/**
 * Retorna quantos ciclos completos de 7 check-ins o jogador já concluiu.
 */
export function getCompletedCyclesCount(totalCheckIns?: number): number {
  const safeCount = Math.max(0, Math.floor(totalCheckIns ?? 0));
  return Math.floor(safeCount / 7);
}

/**
 * Helper legado/compatível que resolve o passo atual do ciclo.
 */
export function getCurrentCycleDay(
  streakOrCount?: number,
  isTodayClaimed = false,
): number {
  return getCumulativeCheckInDay(streakOrCount, isTodayClaimed);
}

/**
 * Resolve o estado atual de check-in diário do perfil usando os campos dedicados
 * (`dailyCheckInCount` e `lastDailyRewardClaimDate`), independente de `lastDailyLoginPointsDate`.
 */
export function getDailyRewardClaimState(
  profile?: Partial<PlayerProfile> | null,
  todayKey = getLocalDateKey(),
): {
  isTodayClaimed: boolean;
  totalCheckIns: number;
  currentDay: number;
  completedCycles: number;
} {
  const isTodayClaimed = Boolean(profile?.lastDailyRewardClaimDate === todayKey);
  const totalCheckIns = Math.max(
    0,
    Math.floor(profile?.dailyCheckInCount ?? 0),
    isTodayClaimed ? 1 : 0,
  );
  const currentDay = getCumulativeCheckInDay(totalCheckIns, isTodayClaimed);
  const completedCycles = getCompletedCyclesCount(totalCheckIns);
  return { isTodayClaimed, totalCheckIns, currentDay, completedCycles };
}

/** Estado de exibição de um dia na lista do modal */
export type DailyRewardDayStatus = "collected" | "today" | "locked";

/**
 * Calcula o status de cada um dos 7 dias para visualização na UI.
 */
export function getDayStatus(
  day: number,
  currentDay: number,
  isTodayClaimed = false,
): DailyRewardDayStatus {
  if (day < currentDay) {
    return "collected";
  }
  if (day === currentDay) {
    return isTodayClaimed ? "collected" : "today";
  }
  return "locked";
}

export interface ClaimDailyRewardResult {
  ok: boolean;
  alreadyClaimed?: boolean;
  error?: string;
  claimedDay: number;
  pointsAwarded: number;
  streakBonusPoints: number;
  xpAwarded: number;
  streakBonusXp: number;
  coinsAwarded: number;
  streakBonusCoins: number;
  chestDefinition?: ChestDefinition;
  chestOutcome?: ChestOpenOutcome;
}

/**
 * Executa o resgate real da recompensa diária (idempotente por `todayKey`).
 * Atualiza pontos, XP, moedas e, no 7º dia, abre imediatamente o Baú Semanal configurado pelo ADM.
 */
export function claimDailyRewardForProfile(
  profile: PlayerProfile,
  adminConfig?: Partial<AdminConfig> | null,
  options?: {
    todayKey?: string;
    rng?: () => number;
  },
): ClaimDailyRewardResult {
  const todayKey = options?.todayKey ?? getLocalDateKey();
  if (!profile) {
    return {
      ok: false,
      error: "Perfil não encontrado.",
      claimedDay: 1,
      pointsAwarded: 0,
      streakBonusPoints: 0,
      xpAwarded: 0,
      streakBonusXp: 0,
      coinsAwarded: 0,
      streakBonusCoins: 0,
    };
  }

  const state = getDailyRewardClaimState(profile, todayKey);
  if (state.isTodayClaimed) {
    return {
      ok: false,
      alreadyClaimed: true,
      error: "Você já resgatou a recompensa de hoje!",
      claimedDay: state.currentDay,
      pointsAwarded: 0,
      streakBonusPoints: 0,
      xpAwarded: 0,
      streakBonusXp: 0,
      coinsAwarded: 0,
      streakBonusCoins: 0,
    };
  }

  const routine = adminConfig?.weeklyRoutineConfig;
  const schedule = resolveDailyRewardsSchedule(routine, adminConfig?.chestsCatalog);
  const claimedDay = state.currentDay;
  const tier = schedule.find((t) => t.day === claimedDay) ?? schedule[0];
  const streak = Math.max(1, profile.streakDays ?? 1);

  const streakBonusPoints = getStreakBonusPoints(streak, routine);
  const streakBonusXp = getStreakBonusXp(streak, routine);
  const streakBonusCoins = getStreakBonusCoins(streak, routine);
  const dailyLoginCoins = Math.max(0, Math.floor(routine?.dailyLoginCoins ?? 0));

  const totalPoints = Math.max(0, tier.points) + streakBonusPoints;
  const totalXp = Math.max(0, tier.xp) + streakBonusXp;
  const totalCoins = Math.max(0, tier.coins ?? 0) + dailyLoginCoins + streakBonusCoins;

  // Atualiza marcadores de check-in (e marca lastDailyLoginPointsDate para evitar duplo pagamento)
  profile.dailyCheckInCount = state.totalCheckIns + 1;
  profile.lastDailyRewardClaimDate = todayKey;
  profile.lastDailyLoginPointsDate = todayKey;

  const activeSet = new Set<string>(Array.isArray(profile.activeDates) ? profile.activeDates : []);
  activeSet.add(todayKey);
  profile.activeDates = Array.from(activeSet).sort();

  if (totalPoints > 0) {
    awardCareerPoints(profile, totalPoints, `Recompensa Diária (Dia ${claimedDay})`);
  }
  if (totalXp > 0) {
    profile.xp = Math.max(0, (profile.xp ?? 0) + totalXp);
    profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + totalXp);
  }
  if (totalCoins > 0) {
    awardCoins(profile, totalCoins, `Recompensa Diária (Dia ${claimedDay})`, "recompensa_diaria");
  }

  let chestDefinition: ChestDefinition | undefined;
  let chestOutcome: ChestOpenOutcome | undefined;

  if (claimedDay === 7) {
    chestDefinition = resolveDay7ChestDefinition(routine, adminConfig?.chestsCatalog);
    if (chestDefinition) {
      chestOutcome = openChest(chestDefinition, options?.rng ?? Math.random);
      profile.chestsOpenedTotal = (profile.chestsOpenedTotal ?? 0) + 1;

      if (chestOutcome.points > 0) {
        awardCareerPoints(profile, chestOutcome.points, `Baú Semanal: ${chestDefinition.name}`);
      }
      if (chestOutcome.xp > 0) {
        profile.xp = Math.max(0, (profile.xp ?? 0) + chestOutcome.xp);
        profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + chestOutcome.xp);
      }
      if (chestOutcome.coins > 0) {
        awardCoins(profile, chestOutcome.coins, `Baú Semanal: ${chestDefinition.name}`, "bau");
      }
      if (chestOutcome.packs.length > 0) {
        const packsMap = { ...(profile.unopenedPacks ?? {}) };
        for (const p of chestOutcome.packs) {
          packsMap[p.packId] = (packsMap[p.packId] ?? 0) + p.quantity;
        }
        profile.unopenedPacks = packsMap;
      }
      if (chestOutcome.cosmetics.length > 0) {
        const avSet = new Set<string>(profile.unlockedAvatars ?? []);
        const auraSet = new Set<string>(profile.unlockedAuras ?? []);
        for (const c of chestOutcome.cosmetics) {
          if (c.kind === "avatar") avSet.add(c.itemId);
          else auraSet.add(c.itemId);
        }
        profile.unlockedAvatars = Array.from(avSet);
        profile.unlockedAuras = Array.from(auraSet);
      }
    }
  }

  return {
    ok: true,
    claimedDay,
    pointsAwarded: totalPoints,
    streakBonusPoints,
    xpAwarded: totalXp,
    streakBonusXp,
    coinsAwarded: totalCoins,
    streakBonusCoins,
    chestDefinition,
    chestOutcome,
  };
}

/**
 * Controle de acesso restrito (Feature Flag de Segurança):
 * Apenas Administradores e contas especiais de teste da administração.
 */
export function canAccessDailyRewardsPreview(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  if (!profile) return false;
  if (profile.isAdmin) return true;
  if (isSpecialAdminAccount(profile)) return true;

  const nick = String(profile.nickNormalized || profile.nick || "").toLowerCase().trim();
  const testAccounts = ["zheret", "admin", "semed_admin", "josiney", "quemuel", "lord"];
  return testAccounts.includes(nick);
}

/** Central Diária + Missões Diárias + Missões Semanais (desacoplada da Loja) */
export function canAccessDailyRoutine(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
  adminConfig?: Partial<AdminConfig> | null,
): boolean {
  if (canAccessDailyRewardsPreview(profile, isAdmin)) return true;
  return Boolean(profile && adminConfig?.rolloutFlags?.enableDailyRoutineForStudents);
}

/** Exibição do saldo de Moedas no perfil (desacoplada da Loja) */
export function canViewCoinsWallet(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
  adminConfig?: Partial<AdminConfig> | null,
): boolean {
  if (canAccessDailyRewardsPreview(profile, isAdmin)) return true;
  return Boolean(profile && adminConfig?.rolloutFlags?.enableCoinsWalletForStudents);
}

/** Exibição do Avatar padrão no perfil/topo no lugar do selo de Nível (sem exigir customização) */
export function canUseDefaultAvatar(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
  adminConfig?: Partial<AdminConfig> | null,
): boolean {
  if (canAccessDailyRewardsPreview(profile, isAdmin)) return true;
  return Boolean(profile && adminConfig?.rolloutFlags?.enableDefaultAvatarForStudents);
}

/** Loja de Moedas, Customização de Avatar/Aura e Aba Inventário */
export function canAccessShopAndCustomization(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
  adminConfig?: Partial<AdminConfig> | null,
): boolean {
  if (canAccessDailyRewardsPreview(profile, isAdmin)) return true;
  return Boolean(profile && adminConfig?.rolloutFlags?.enableShopForStudents);
}
