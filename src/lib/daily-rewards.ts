import type { PlayerProfile } from "./playfab.ts";
import { isSpecialAdminAccount } from "./playfab.ts";
import type { AdminConfig } from "./game-codes.ts";
import {
  calculateDuplicateCosmeticCompensation,
  mergeWithDefaultChests,
  openChest,
  type ChestDefinition,
  type ChestOpenOutcome,
} from "./chests-catalog.ts";
import {
  awardCareerPoints,
  awardCoins,
  DAILY_LOGIN_POINTS,
  MEDAL_COINS_REWARDS,
  MEDAL_POINTS_REWARDS,
} from "./career-points.ts";
import {
  grantCosmeticToProfile,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
} from "./cosmetics-catalog.ts";
import { getLocalDateKey } from "./player-profile.ts";
import { getCoariDateKey, getOfficialNow, parseUtcMs, shiftDateKeyUTC } from "./official-time.ts";
import { getCurrentActiveStreakDays, MEDAL_XP_REWARDS } from "./medals-catalog.ts";

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
    allChests.find((c) => c.id === DEFAULT_DAY7_CHEST_ID && c.enabled !== false) ??
    allChests.find((c) => c.enabled !== false) ??
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
  const isTodayClaimed = Boolean(
    profile?.lastDailyRewardClaimDate && profile.lastDailyRewardClaimDate >= todayKey,
  );
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
  medalCoinsAwarded?: number;
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
    now?: Date;
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

  // Atualiza marcadores de check-in (e marca lastDailyLoginPointsDate para evitar duplo pagamento)
  const alreadyGotLoginBonusToday = profile.lastDailyLoginPointsDate === todayKey;
  profile.dailyCheckInCount = state.totalCheckIns + 1;
  profile.lastDailyRewardClaimDate = todayKey;
  profile.lastDailyLoginPointsDate = todayKey;

  const hadPriorActiveDates = Array.isArray(profile.activeDates) && profile.activeDates.length > 0;
  const activeSet = new Set<string>(Array.isArray(profile.activeDates) ? profile.activeDates : []);
  activeSet.add(todayKey);
  profile.activeDates = Array.from(activeSet).sort();

  // Calcula ofensiva ativa real (incluindo check-in de hoje), regredindo corretamente quando houve falta
  // (contas legadas sem activeDates anterior preservam streakDays já registrado)
  const computedActiveStreak = getCurrentActiveStreakDays(profile, todayKey);
  const streak = hadPriorActiveDates
    ? Math.max(1, computedActiveStreak)
    : Math.max(1, computedActiveStreak, Math.floor(Number(profile.streakDays ?? 0)));
  profile.streakDays = streak;

  const streakBonusPoints = getStreakBonusPoints(streak, routine);
  const streakBonusXp = getStreakBonusXp(streak, routine);
  const streakBonusCoins = getStreakBonusCoins(streak, routine);
  const dailyLoginCoins = Math.max(0, Math.floor(routine?.dailyLoginCoins ?? 0));

  const totalPoints = Math.max(0, tier.points) + streakBonusPoints;
  const netDailyPoints = alreadyGotLoginBonusToday
    ? Math.max(0, totalPoints - DAILY_LOGIN_POINTS)
    : totalPoints;
  const totalXp = Math.max(0, tier.xp) + streakBonusXp;
  const totalCoins = Math.max(0, tier.coins ?? 0) + dailyLoginCoins + streakBonusCoins;
  let awardedPoints = netDailyPoints;
  let awardedXp = totalXp;
  let medalCoinsAwarded = 0;

  if (netDailyPoints > 0) {
    awardCareerPoints(profile, netDailyPoints, `Recompensa Diária (Dia ${claimedDay})`, undefined, {
      source: "recompensa_diaria",
    });
  }
  if (totalXp > 0) {
    profile.xp = Math.max(0, (profile.xp ?? 0) + totalXp);
    profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + totalXp);
  }
  if (totalCoins > 0) {
    awardCoins(profile, totalCoins, `Recompensa Diária (Dia ${claimedDay})`, "recompensa_diaria");
  }

  // Concede/empilha a medalha de marco correspondente nos Dias 3, 5 e 7 SOMENTE se a ofensiva consecutiva atingir 3, 5 ou 7 dias seguidos (idempotente no mesmo dia)
  if (tier.milestoneMedalId && streak >= tier.day) {
    const unlocked = Array.isArray(profile.unlockedMedals) ? [...profile.unlockedMedals] : [];
    const refNow = options?.now ?? getOfficialNow();
    const nowIso =
      isoToOfficialDateKey(refNow.toISOString()) === todayKey
        ? refNow.toISOString()
        : `${todayKey}T16:00:00.000Z`;
    const existingIdx = unlocked.findIndex((m) => m?.medalId === tier.milestoneMedalId);
    const existingDateKey =
      existingIdx >= 0 ? isoToOfficialDateKey(unlocked[existingIdx]?.unlockedAt) : null;
    const alreadyGrantedToday = existingDateKey === todayKey;

    if (!alreadyGrantedToday) {
      if (existingIdx >= 0) {
        const prevCount = Math.max(1, Number(unlocked[existingIdx].count ?? 1));
        unlocked[existingIdx] = {
          ...unlocked[existingIdx],
          count: prevCount + 1,
          unlockedAt: nowIso,
        };
      } else {
        unlocked.push({
          medalId: tier.milestoneMedalId,
          unlockedAt: nowIso,
          count: 1,
        });
      }
      profile.unlockedMedals = unlocked;

      const milestoneRarity =
        tier.day === 7 ? "ouro" : tier.day === 5 ? "prata" : "bronze";
      const medalXp = Math.max(0, Math.floor(MEDAL_XP_REWARDS[milestoneRarity] ?? 0));
      const medalPts = Math.max(0, Math.floor(MEDAL_POINTS_REWARDS[milestoneRarity] ?? 0));
      if (medalXp > 0) {
        profile.xp = Math.max(0, (profile.xp ?? 0) + medalXp);
        profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + medalXp);
        awardedXp += medalXp;
      }
      if (medalPts > 0) {
        awardCareerPoints(
          profile,
          medalPts,
          `Medalha Marco Diário (Dia ${tier.day})`,
          undefined,
          { source: "medalha", metadata: { medalId: tier.milestoneMedalId } },
        );
        awardedPoints += medalPts;
      }
      const medalCoins = Math.max(
        0,
        Math.floor(
          Number(
            adminConfig?.coinRewardsConfig?.medalCoinsByRarity?.[milestoneRarity] ??
              MEDAL_COINS_REWARDS[milestoneRarity] ??
              5,
          ),
        ),
      );
      if (medalCoins > 0) {
        awardCoins(profile, medalCoins, `Marco Diário (Dia ${tier.day})`, "medalha");
        medalCoinsAwarded += medalCoins;
      }
      profile.coinRewardedMedalIds = {
        ...(profile.coinRewardedMedalIds ?? {}),
        [tier.milestoneMedalId]: Math.max(
          1,
          (profile.coinRewardedMedalIds?.[tier.milestoneMedalId] ?? 0) + 1,
        ),
      };
    }
  }

  let chestDefinition: ChestDefinition | undefined;
  let chestOutcome: ChestOpenOutcome | undefined;

  if (claimedDay === 7) {
    chestDefinition = resolveDay7ChestDefinition(routine, adminConfig?.chestsCatalog);
    if (chestDefinition) {
      chestOutcome = openChest(chestDefinition, options?.rng ?? Math.random);
      profile.chestsOpenedTotal = (profile.chestsOpenedTotal ?? 0) + 1;

      if (chestOutcome.points > 0) {
        awardCareerPoints(profile, chestOutcome.points, `Baú Semanal: ${chestDefinition.name}`, undefined, {
          source: "bau",
        });
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
        const allAvatars = mergeWithDefaultAvatars(adminConfig?.avatarsCatalog);
        const allAuras = mergeWithDefaultAuras(adminConfig?.aurasCatalog);
        const newlyGrantedCosmetics: ChestOpenOutcome["cosmetics"] = [];
        const cosmeticGrants: NonNullable<ChestOpenOutcome["cosmeticGrants"]> = [];
        let duplicateCompensationCoins = 0;

        for (const c of chestOutcome.cosmetics) {
          const def =
            c.kind === "avatar"
              ? allAvatars.find((a) => a.id === c.itemId)
              : allAuras.find((a) => a.id === c.itemId);
          const grant = grantCosmeticToProfile(profile, c.kind, c.itemId);
          profile.unlockedAvatars = grant.profile.unlockedAvatars;
          profile.unlockedAuras = grant.profile.unlockedAuras;
          if (!grant.alreadyOwned) {
            newlyGrantedCosmetics.push(c);
            cosmeticGrants.push({
              kind: c.kind,
              itemId: c.itemId,
              name: def?.name ?? c.itemId,
              alreadyOwned: false,
              compensatedCoins: 0,
            });
          } else {
            const comp = calculateDuplicateCosmeticCompensation(def?.priceCoins);
            duplicateCompensationCoins += comp;
            awardCoins(
              profile,
              comp,
              `Compensação cosmético repetido (${def?.name ?? c.itemId})`,
              "bau",
            );
            cosmeticGrants.push({
              kind: c.kind,
              itemId: c.itemId,
              name: def?.name ?? c.itemId,
              alreadyOwned: true,
              compensatedCoins: comp,
            });
          }
        }
        chestOutcome = {
          ...chestOutcome,
          cosmetics: newlyGrantedCosmetics,
          cosmeticGrants,
          duplicateCompensationCoins,
        };
      }
    }
  }

  return {
    ok: true,
    claimedDay,
    pointsAwarded: awardedPoints,
    streakBonusPoints,
    xpAwarded: awardedXp,
    streakBonusXp,
    coinsAwarded: totalCoins,
    ...(medalCoinsAwarded > 0 ? { medalCoinsAwarded } : {}),
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

/** Exibição do Avatar padrão no perfil/topo no lugar do selo de Nível (também ativa automaticamente se a Loja estiver liberada) */
export function canUseDefaultAvatar(
  profile?: Partial<PlayerProfile> | null,
  isAdmin = false,
  adminConfig?: Partial<AdminConfig> | null,
): boolean {
  if (canAccessDailyRewardsPreview(profile, isAdmin)) return true;
  return Boolean(
    profile &&
      (adminConfig?.rolloutFlags?.enableDefaultAvatarForStudents ||
        adminConfig?.rolloutFlags?.enableShopForStudents),
  );
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

/** Desloca uma chave de data `YYYY-MM-DD` em `deltaDays` dias. */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  return shiftDateKeyUTC(dateKey, deltaDays);
}

function isoToOfficialDateKey(iso?: string | null): string | null {
  if (!iso || typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ms = parseUtcMs(trimmed);
  if (ms === null) return null;
  return getCoariDateKey(ms);
}

/**
 * Retorna a data (`YYYY-MM-DD`, fuso oficial UTC-4 Coari/AM) da atividade/login mais recente do aluno entre todas
 * as fontes reais de login/jogo do perfil.
 * Obs.: ignora intencionalmente `accountUpdatedAt`, pois auditorias do ADM atualizam `acc.updatedAt`
 * de todas as contas e isso falsificaria logins recentes para alunos inativos.
 */
export function getLatestActivityDateKey(
  profile?: Partial<PlayerProfile> | null,
  _ignoredAccountUpdatedAt?: string | null,
): string | null {
  if (!profile) return null;
  const candidates: string[] = [];
  if (Array.isArray(profile.activeDates)) {
    for (const d of profile.activeDates) {
      const norm = isoToOfficialDateKey(d);
      if (norm) candidates.push(norm);
    }
  }
  for (const raw of [
    profile.lastActiveDate,
    profile.lastDailyLoginPointsDate,
    profile.lastDailyFirstGamePointsDate,
    profile.lastKnownActivityAt,
    profile.activeSessionUpdatedAt,
  ]) {
    const norm = isoToOfficialDateKey(raw);
    if (norm) candidates.push(norm);
  }
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1] ?? null;
}

/**
 * Verifica se o aluno esteve ativo/logado pelo menos uma vez dentro dos últimos `daysWindow` dias
 * (padrão: 3 dias, ex.: de `todayKey - 3 dias` até `todayKey`).
 */
export function isPlayerActiveWithinDays(
  profile?: Partial<PlayerProfile> | null,
  options?: {
    todayKey?: string;
    daysWindow?: number;
    accountUpdatedAt?: string | null;
  },
): { active: boolean; latestActivityDate: string | null; cutoffDateKey: string } {
  const todayKey = options?.todayKey ?? getLocalDateKey();
  const daysWindow = Math.max(1, Math.floor(options?.daysWindow ?? 3));
  const cutoffDateKey = shiftDateKey(todayKey, -daysWindow);
  const latestActivityDate = getLatestActivityDateKey(profile, options?.accountUpdatedAt);
  const active = Boolean(latestActivityDate && latestActivityDate >= cutoffDateKey);
  return { active, latestActivityDate, cutoffDateKey };
}

export interface RetroactiveDay1Evaluation {
  eligible: boolean;
  reason: string;
  latestActivityDate: string | null;
  day1DateKey: string;
  pointsToAward: number;
  xpToAward: number;
  coinsToAward: number;
}

/**
 * Avalia se o aluno é elegível para receber a retrocoleta do Dia 1 (ontem / segunda-feira):
 * - Ativo/logado nos últimos `daysWindow` dias (padrão: 3)
 * - Ainda sem check-in na trilha (`dailyCheckInCount === 0` e sem `lastDailyRewardClaimDate`)
 * - Ainda sem a trava idempotente `retroactiveDay1GrantedAt`
 */
export function evaluateRetroactiveDay1CheckIn(
  profile?: Partial<PlayerProfile> | null,
  adminConfig?: Partial<AdminConfig> | null,
  options?: {
    todayKey?: string;
    day1DateKey?: string;
    daysWindow?: number;
    grantMissingRewards?: boolean;
    accountUpdatedAt?: string | null;
  },
): RetroactiveDay1Evaluation {
  const todayKey = options?.todayKey ?? getLocalDateKey();
  const day1DateKey = options?.day1DateKey ?? shiftDateKey(todayKey, -1);
  const grantMissingRewards = options?.grantMissingRewards !== false;

  if (!profile) {
    return {
      eligible: false,
      reason: "Perfil inexistente",
      latestActivityDate: null,
      day1DateKey,
      pointsToAward: 0,
      xpToAward: 0,
      coinsToAward: 0,
    };
  }

  if (profile.retroactiveDay1GrantedAt) {
    return {
      eligible: false,
      reason: "Retrocoleta do Dia 1 já aplicada anteriormente",
      latestActivityDate: getLatestActivityDateKey(profile, options?.accountUpdatedAt),
      day1DateKey,
      pointsToAward: 0,
      xpToAward: 0,
      coinsToAward: 0,
    };
  }

  if ((profile.dailyCheckInCount ?? 0) > 0 || Boolean(profile.lastDailyRewardClaimDate)) {
    return {
      eligible: false,
      reason: "Aluno já iniciou a trilha de check-in",
      latestActivityDate: getLatestActivityDateKey(profile, options?.accountUpdatedAt),
      day1DateKey,
      pointsToAward: 0,
      xpToAward: 0,
      coinsToAward: 0,
    };
  }

  const activity = isPlayerActiveWithinDays(profile, {
    todayKey,
    daysWindow: options?.daysWindow ?? 3,
    accountUpdatedAt: options?.accountUpdatedAt,
  });

  if (!activity.active) {
    return {
      eligible: false,
      reason: "Sem login/atividade nos últimos 3 dias",
      latestActivityDate: activity.latestActivityDate,
      day1DateKey,
      pointsToAward: 0,
      xpToAward: 0,
      coinsToAward: 0,
    };
  }

  const routine = adminConfig?.weeklyRoutineConfig;
  const schedule = resolveDailyRewardsSchedule(routine, adminConfig?.chestsCatalog);
  const tier1 = schedule[0];
  const dailyLoginCoins = Math.max(0, Math.floor(routine?.dailyLoginCoins ?? 0));

  // Evita duplicar os +25 pts se o aluno já recebeu login diário automático na data do Dia 1
  // (inclusive quando logou novamente hoje e sobrescreveu lastDailyLoginPointsDate, mantendo day1DateKey em activeDates)
  const alreadyGotDay1LoginPts =
    profile.lastDailyLoginPointsDate === day1DateKey ||
    Boolean(
      profile.lastDailyLoginPointsDate &&
        profile.lastDailyLoginPointsDate >= day1DateKey &&
        Array.isArray(profile.activeDates) &&
        profile.activeDates.includes(day1DateKey),
    );
  const pointsToAward = grantMissingRewards && !alreadyGotDay1LoginPts ? Math.max(0, tier1.points) : 0;
  const xpToAward = grantMissingRewards ? Math.max(0, tier1.xp) : 0;
  const coinsToAward = grantMissingRewards ? Math.max(0, (tier1.coins ?? 0) + dailyLoginCoins) : 0;

  return {
    eligible: true,
    reason: "Elegível (ativo nos últimos 3 dias)",
    latestActivityDate: activity.latestActivityDate,
    day1DateKey,
    pointsToAward,
    xpToAward,
    coinsToAward,
  };
}

/**
 * Aplica de forma 100% idempotente a retrocoleta do Dia 1 ao perfil do aluno.
 * Marca `dailyCheckInCount = 1` e `lastDailyRewardClaimDate = day1DateKey` (ontem),
 * deixando o Dia 1 como Coletado e o Dia 2 liberado para coleta manual hoje!
 */
export function applyRetroactiveDay1CheckIn(
  profile: PlayerProfile,
  adminConfig?: Partial<AdminConfig> | null,
  options?: {
    todayKey?: string;
    day1DateKey?: string;
    daysWindow?: number;
    grantMissingRewards?: boolean;
    accountUpdatedAt?: string | null;
    nowIso?: string;
  },
): RetroactiveDay1Evaluation {
  const evalRes = evaluateRetroactiveDay1CheckIn(profile, adminConfig, options);
  if (!evalRes.eligible) return evalRes;

  profile.dailyCheckInCount = 1;
  profile.lastDailyRewardClaimDate = evalRes.day1DateKey;
  profile.retroactiveDay1GrantedAt = options?.nowIso ?? getOfficialNow().toISOString();

  if (evalRes.pointsToAward > 0) {
    awardCareerPoints(profile, evalRes.pointsToAward, "Retrocoleta Diária (Dia 1)");
  }
  if (evalRes.xpToAward > 0) {
    profile.xp = Math.max(0, (profile.xp ?? 0) + evalRes.xpToAward);
    profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + evalRes.xpToAward);
  }
  if (evalRes.coinsToAward > 0) {
    awardCoins(profile, evalRes.coinsToAward, "Retrocoleta Diária (Dia 1)", "retroatribuicao");
  }

  return evalRes;
}
