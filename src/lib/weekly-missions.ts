import { ALL_GAME_IDS, type GameId } from "./game-storage.ts";
import type { AdminConfig } from "./game-codes.ts";
import type { PlayerProfile } from "./playfab.ts";
import { getTournamentRank, getWeekInfo, TOURNAMENT_RANKS } from "./weekly-tournament.ts";
import { awardCareerPoints, awardCoins } from "./career-points.ts";

export type WeeklyMissionType =
  | "weekly_matches"
  | "weekly_distinct_games"
  | "weekly_xp"
  | "weekly_ranked_ranks"
  | "weekly_ranked_matches"
  | "weekly_daily_missions";

export const DEFAULT_WEEKLY_MISSION_COINS = 10;

export interface WeeklyMissionProgressState {
  weekKey: string;
  matches: number;
  distinctGameIds: string[];
  xpEarned: number;
  dailyMissionsCompleted: number;
  rankedMatches: number;
  startRankIndex?: number;
  maxRankIndex?: number;
  rankUpsEarned?: number;
  /** Faixa de nível travada na primeira atividade da semana para evitar mudança de missões no meio do ciclo */
  lockedLevel?: number;
  claimedIds: string[];
}

export interface WeeklyMission {
  id: string;
  type: WeeklyMissionType;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardPoints: number;
  rewardXp: number;
  rewardCoins?: number;
  minLevelRequired: number;
  claimed?: boolean;
}

export const WEEKLY_MISSIONS_COUNT = 4;

export function createEmptyWeeklyMissionProgress(
  weekKey = getWeekInfo().weekKey,
  initialRankIndex?: number,
  lockedLevel?: number,
): WeeklyMissionProgressState {
  return {
    weekKey,
    matches: 0,
    distinctGameIds: [],
    xpEarned: 0,
    dailyMissionsCompleted: 0,
    rankedMatches: 0,
    ...(typeof initialRankIndex === "number"
      ? { startRankIndex: initialRankIndex, maxRankIndex: initialRankIndex }
      : {}),
    ...(typeof lockedLevel === "number"
      ? { lockedLevel: Math.max(1, Math.floor(lockedLevel)) }
      : {}),
    claimedIds: [],
  };
}

function resolveRankIndex(tournamentPoints?: number, tournamentRankId?: string): number {
  const pointsRank = getTournamentRank(tournamentPoints ?? 0).currentRank;
  const pointsIdx = TOURNAMENT_RANKS.findIndex((r) => r.id === pointsRank.id);
  const idIdx = tournamentRankId
    ? TOURNAMENT_RANKS.findIndex((r) => r.id === tournamentRankId)
    : -1;
  return Math.max(0, pointsIdx, idIdx);
}

/**
 * Atualiza o progresso das missões semanais após uma partida concluída.
 */
export function recordMatchIntoWeeklyMissions(
  prev: WeeklyMissionProgressState | undefined | null,
  args: {
    gameId: GameId;
    earnedXp: number;
    mode?: string;
    playerLevel?: number;
    tournamentPointsBefore?: number;
    tournamentRankIdBefore?: string;
    tournamentPointsAfter?: number;
    tournamentRankIdAfter?: string;
    now?: Date;
    weekKey?: string;
    /** Evita farm AFK/0 pontos: quando informado como false, não contabiliza partida sem participação real. */
    hasRealParticipation?: boolean;
  },
): WeeklyMissionProgressState {
  const weekKey = args.weekKey ?? getWeekInfo(args.now ?? new Date()).weekKey;
  const rankBefore = resolveRankIndex(args.tournamentPointsBefore, args.tournamentRankIdBefore);
  const rankAfter = resolveRankIndex(args.tournamentPointsAfter, args.tournamentRankIdAfter);

  const base: WeeklyMissionProgressState =
    prev && prev.weekKey === weekKey
      ? {
          weekKey,
          matches: Math.max(0, prev.matches ?? 0),
          distinctGameIds: Array.isArray(prev.distinctGameIds) ? [...prev.distinctGameIds] : [],
          xpEarned: Math.max(0, prev.xpEarned ?? 0),
          dailyMissionsCompleted: Math.max(0, prev.dailyMissionsCompleted ?? 0),
          rankedMatches: Math.max(0, prev.rankedMatches ?? 0),
          startRankIndex:
            typeof prev.startRankIndex === "number" ? prev.startRankIndex : rankBefore,
          maxRankIndex:
            typeof prev.maxRankIndex === "number" ? prev.maxRankIndex : rankBefore,
          rankUpsEarned: Math.max(0, prev.rankUpsEarned ?? 0),
          ...(typeof prev.lockedLevel === "number"
            ? { lockedLevel: prev.lockedLevel }
            : typeof args.playerLevel === "number"
              ? { lockedLevel: Math.max(1, Math.floor(args.playerLevel)) }
              : {}),
          claimedIds: Array.isArray(prev.claimedIds) ? [...prev.claimedIds] : [],
        }
      : createEmptyWeeklyMissionProgress(weekKey, rankBefore, args.playerLevel);

  if (args.hasRealParticipation === false) {
    return base;
  }

  base.matches += 1;
  if (!base.distinctGameIds.includes(args.gameId)) {
    base.distinctGameIds.push(args.gameId);
  }
  base.xpEarned += Math.max(0, Math.floor(args.earnedXp || 0));
  if (args.mode === "torneio_semanal") {
    base.rankedMatches += 1;
  }
  base.maxRankIndex = Math.max(base.maxRankIndex ?? rankBefore, rankAfter);
  const stepRankUps = Math.max(0, rankAfter - rankBefore);
  base.rankUpsEarned = Math.max(0, base.rankUpsEarned ?? 0) + stepRankUps;

  return base;
}

/**
 * Incrementa o contador semanal de missões diárias concluídas.
 */
export function recordDailyMissionCompletedIntoWeekly(
  prev: WeeklyMissionProgressState | undefined | null,
  now?: Date,
  explicitWeekKey?: string,
  options?: {
    playerLevel?: number;
    tournamentPoints?: number;
    tournamentRankId?: string;
  },
): WeeklyMissionProgressState {
  const weekKey = explicitWeekKey ?? getWeekInfo(now ?? new Date()).weekKey;
  const initialRank =
    options?.tournamentPoints !== undefined || options?.tournamentRankId
      ? resolveRankIndex(options.tournamentPoints, options.tournamentRankId)
      : undefined;
  const base: WeeklyMissionProgressState =
    prev && prev.weekKey === weekKey
      ? {
          ...prev,
          distinctGameIds: Array.isArray(prev.distinctGameIds) ? [...prev.distinctGameIds] : [],
          claimedIds: Array.isArray(prev.claimedIds) ? [...prev.claimedIds] : [],
          ...(typeof prev.lockedLevel === "number"
            ? { lockedLevel: prev.lockedLevel }
            : typeof options?.playerLevel === "number"
              ? { lockedLevel: Math.max(1, Math.floor(options.playerLevel)) }
              : {}),
          ...(typeof prev.startRankIndex === "number"
            ? { startRankIndex: prev.startRankIndex }
            : typeof initialRank === "number"
              ? { startRankIndex: initialRank, maxRankIndex: initialRank }
              : {}),
        }
      : createEmptyWeeklyMissionProgress(weekKey, initialRank, options?.playerLevel);
  base.dailyMissionsCompleted = Math.max(0, base.dailyMissionsCompleted ?? 0) + 1;
  return base;
}

/**
 * Mescla dois estados semanais (local vs nuvem PlayFab) mantendo o maior progresso
 * da semana mais recente sem perder missões já resgatadas.
 */
export function mergeWeeklyMissionProgress(
  a?: WeeklyMissionProgressState | null,
  b?: WeeklyMissionProgressState | null,
): WeeklyMissionProgressState | undefined {
  if (!a && !b) return undefined;
  if (!a) return b ?? undefined;
  if (!b) return a;
  if (a.weekKey !== b.weekKey) {
    return a.weekKey > b.weekKey ? a : b;
  }
  const startCandidates = [a.startRankIndex, b.startRankIndex].filter(
    (v): v is number => typeof v === "number",
  );
  const maxCandidates = [a.maxRankIndex, b.maxRankIndex].filter(
    (v): v is number => typeof v === "number",
  );
  const levelCandidates = [a.lockedLevel, b.lockedLevel].filter(
    (v): v is number => typeof v === "number" && v >= 1,
  );
  return {
    weekKey: a.weekKey,
    matches: Math.max(a.matches ?? 0, b.matches ?? 0),
    distinctGameIds: Array.from(new Set([...(a.distinctGameIds ?? []), ...(b.distinctGameIds ?? [])])),
    xpEarned: Math.max(a.xpEarned ?? 0, b.xpEarned ?? 0),
    dailyMissionsCompleted: Math.max(a.dailyMissionsCompleted ?? 0, b.dailyMissionsCompleted ?? 0),
    rankedMatches: Math.max(a.rankedMatches ?? 0, b.rankedMatches ?? 0),
    ...(startCandidates.length > 0 ? { startRankIndex: Math.min(...startCandidates) } : {}),
    ...(maxCandidates.length > 0 ? { maxRankIndex: Math.max(...maxCandidates) } : {}),
    rankUpsEarned: Math.max(a.rankUpsEarned ?? 0, b.rankUpsEarned ?? 0),
    ...(levelCandidates.length > 0 ? { lockedLevel: Math.min(...levelCandidates) } : {}),
    claimedIds: Array.from(new Set([...(a.claimedIds ?? []), ...(b.claimedIds ?? [])])),
  };
}

/**
 * Avalia o rank do jogador no Torneio Semanal (ancorado no início da semana quando disponível)
 * e retorna a missão ranqueada balanceada (apenas para jogadores de Nível 4+).
 */
export function resolveRankedWeeklyMission(args: {
  level: number;
  weekKey: string;
  tournamentPoints?: number;
  tournamentRankId?: string;
  startRankIndex?: number;
}): WeeklyMission {
  const safeLevel = Math.max(4, Math.floor(args.level));
  const currentIdx =
    typeof args.startRankIndex === "number"
      ? Math.max(0, Math.min(TOURNAMENT_RANKS.length - 1, Math.floor(args.startRankIndex)))
      : resolveRankIndex(args.tournamentPoints, args.tournamentRankId);
  const currentRank = TOURNAMENT_RANKS[currentIdx] ?? TOURNAMENT_RANKS[0];
  const remainingRanks = Math.max(0, TOURNAMENT_RANKS.length - 1 - currentIdx);

  if (remainingRanks === 0) {
    const matchTarget = safeLevel >= 7 ? 10 : 8;
    const reward = safeLevel >= 7 ? 200 : 150;
    return {
      id: `wm_${args.weekKey}_ranked_matches`,
      type: "weekly_ranked_matches",
      title: "Presença no Topo",
      description: `Você já alcançou o rank máximo (${currentRank.name})! Dispute ${matchTarget} partidas ranqueadas nesta semana.`,
      target: matchTarget,
      current: 0,
      rewardPoints: reward,
      rewardXp: reward,
      minLevelRequired: safeLevel >= 7 ? 7 : 4,
    };
  }

  const desiredByLevel = safeLevel >= 7 ? 3 : 2;
  const maxByTier =
    currentRank.tier === "diamante"
      ? 1
      : currentRank.tier === "ouro" || currentRank.tier === "platina"
        ? 2
        : 3;

  const targetRanks = Math.max(1, Math.min(desiredByLevel, maxByTier, remainingRanks));
  const reward = safeLevel >= 7 ? 200 : 150;

  return {
    id: `wm_${args.weekKey}_ranks`,
    type: "weekly_ranked_ranks",
    title: safeLevel >= 7 ? "Ascensão Suprema" : "Escalador Ranqueado",
    description: `Suba ${targetRanks} ${targetRanks === 1 ? "rank" : "ranks"} nas partidas ranqueadas nesta semana.`,
    target: targetRanks,
    current: 0,
    rewardPoints: reward,
    rewardXp: reward,
    minLevelRequired: safeLevel >= 7 ? 7 : 4,
  };
}

/**
 * Retorna os IDs de jogos elegíveis para o jogador respeitando:
 * - jogos habilitados (`enabledGames`)
 * - modo apenas ADM (`adminOnlyGames`)
 * - nível mínimo exigido por cada jogo (`gameMinLevels`)
 */
export function getEligibleGamesForWeeklyMissions(args: {
  level: number;
  isAdmin?: boolean;
  adminConfig?: Partial<AdminConfig> | null;
}): GameId[] {
  const safeLevel = Math.max(1, Math.floor(args.level));
  const enabledMap = args.adminConfig?.enabledGames;
  const adminOnlyMap = args.adminConfig?.adminOnlyGames;
  const minLevelsMap =
    args.adminConfig?.gameLevelRequirements ??
    (args.adminConfig as { gameMinLevels?: Partial<Record<GameId, number>> } | null | undefined)
      ?.gameMinLevels;

  const eligible = ALL_GAME_IDS.filter((gId) => {
    if (enabledMap && enabledMap[gId] === false) return false;
    if (!args.isAdmin && adminOnlyMap && adminOnlyMap[gId] === true) return false;
    const minLvl = minLevelsMap?.[gId] ?? 1;
    if (!args.isAdmin && safeLevel < minLvl) return false;
    return true;
  });

  return eligible.length > 0 ? eligible : [];
}

function formatWeeklyDescription(type: WeeklyMissionType, target: number): string {
  switch (type) {
    case "weekly_matches":
      return `Conclua ${target} ${target === 1 ? "partida" : "partidas"} em qualquer jogo elegível nesta semana.`;
    case "weekly_distinct_games":
      return `Jogue em ${target} ${target === 1 ? "jogo diferente" : "jogos diferentes"} liberados para o seu nível nesta semana.`;
    case "weekly_xp":
      return `Conquiste ${target.toLocaleString("pt-BR")} XP ao longo desta semana.`;
    case "weekly_daily_missions":
      return `Complete ${target} ${target === 1 ? "missão diária" : "missões diárias"} durante esta semana.`;
    case "weekly_ranked_ranks":
      return `Suba ${target} ${target === 1 ? "rank" : "ranks"} nas partidas ranqueadas nesta semana.`;
    case "weekly_ranked_matches":
      return `Dispute ${target} ${target === 1 ? "partida ranqueada" : "partidas ranqueadas"} nesta semana.`;
  }
}

/**
 * Gera exatamente 4 missões semanais com progresso real e status de resgate.
 */
export function generateWeeklyMissions(args: {
  profile?: Partial<PlayerProfile> | null;
  adminConfig?: Partial<AdminConfig> | null;
  now?: Date;
  weekKey?: string;
  weekIndex?: number;
}): WeeklyMission[] {
  const weekInfo = getWeekInfo(args.now ?? new Date());
  const weekKey = args.weekKey ?? weekInfo.weekKey;
  const cfgAny = args.adminConfig as
    | {
        coinRewardsConfig?: { weeklyMissionCoins?: number };
        weeklyRoutineConfig?: {
          weeklyMissionOverrides?: Record<
            string,
            { target?: number; points?: number; xp?: number; coins?: number }
          >;
        };
      }
    | null
    | undefined;
  const weeklyCoins = Math.max(
    0,
    Math.floor(cfgAny?.coinRewardsConfig?.weeklyMissionCoins ?? DEFAULT_WEEKLY_MISSION_COINS),
  );
  const overrides = cfgAny?.weeklyRoutineConfig?.weeklyMissionOverrides ?? {};
  const progress =
    args.profile?.weeklyMissionProgress?.weekKey === weekKey
      ? args.profile.weeklyMissionProgress
      : null;
  const claimedSet = new Set<string>(progress?.claimedIds ?? []);

  const effectiveLevel = Math.max(
    1,
    Math.floor(progress?.lockedLevel ?? args.profile?.level ?? 1),
  );
  const maxEligibleGames = Math.max(
    1,
    getEligibleGamesForWeeklyMissions({
      level: effectiveLevel,
      isAdmin: Boolean(args.profile?.isAdmin),
      adminConfig: args.adminConfig,
    }).length,
  );

  return buildWeeklyMissionsList({ ...args, weekKey }).map((m) => {
    const ov = overrides[m.type];
    const rawTarget = ov?.target && ov.target > 0 ? Math.floor(ov.target) : m.target;
    const target =
      m.type === "weekly_distinct_games" ? Math.min(rawTarget, maxEligibleGames) : rawTarget;
    const rewardPoints = ov?.points !== undefined ? Math.max(0, Math.floor(ov.points)) : m.rewardPoints;
    const rewardXp = ov?.xp !== undefined ? Math.max(0, Math.floor(ov.xp)) : m.rewardXp;
    const rewardCoins = ov?.coins !== undefined ? Math.max(0, Math.floor(ov.coins)) : weeklyCoins;

    let current = 0;
    if (progress) {
      if (m.type === "weekly_matches") current = progress.matches ?? 0;
      else if (m.type === "weekly_distinct_games") current = progress.distinctGameIds?.length ?? 0;
      else if (m.type === "weekly_xp") current = progress.xpEarned ?? 0;
      else if (m.type === "weekly_daily_missions") current = progress.dailyMissionsCompleted ?? 0;
      else if (m.type === "weekly_ranked_matches") current = progress.rankedMatches ?? 0;
      else if (m.type === "weekly_ranked_ranks") {
        const startIdx = progress.startRankIndex ?? 0;
        const maxIdx = progress.maxRankIndex ?? startIdx;
        current = Math.max(Math.max(0, maxIdx - startIdx), progress.rankUpsEarned ?? 0);
      }
    }

    const description =
      ov?.target && ov.target > 0 ? formatWeeklyDescription(m.type, target) : m.description;

    return {
      ...m,
      target,
      current: Math.min(target, Math.max(0, current)),
      description,
      rewardPoints,
      rewardXp,
      rewardCoins,
      claimed: claimedSet.has(m.id),
    };
  });
}

export interface ClaimWeeklyMissionResult {
  ok: boolean;
  alreadyClaimed?: boolean;
  error?: string;
  missionId: string;
  pointsAwarded: number;
  xpAwarded: number;
  coinsAwarded: number;
}

/**
 * Resgata uma missão semanal concluída (`current >= target`), de forma idempotente.
 */
export function claimWeeklyMissionForProfile(
  profile: PlayerProfile,
  missionId: string,
  args?: {
    adminConfig?: Partial<AdminConfig> | null;
    now?: Date;
    weekKey?: string;
    weekIndex?: number;
  },
): ClaimWeeklyMissionResult {
  const weekInfo = getWeekInfo(args?.now ?? new Date());
  const weekKey = args?.weekKey ?? weekInfo.weekKey;
  const missions = generateWeeklyMissions({
    profile,
    adminConfig: args?.adminConfig,
    now: args?.now,
    weekKey,
    weekIndex: args?.weekIndex ?? weekInfo.weekIndex,
  });
  const mission = missions.find((m) => m.id === missionId);
  if (!mission) {
    return { ok: false, error: "Missão semanal não encontrada.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }
  if (mission.claimed) {
    return { ok: false, alreadyClaimed: true, error: "Missão semanal já resgatada.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }
  if (mission.current < mission.target) {
    return { ok: false, error: "Conclua o objetivo da missão antes de resgatar.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }

  const prev =
    profile.weeklyMissionProgress && profile.weeklyMissionProgress.weekKey === weekKey
      ? profile.weeklyMissionProgress
      : createEmptyWeeklyMissionProgress(
          weekKey,
          resolveRankIndex(profile.tournamentPoints, profile.tournamentRankId),
          profile.level,
        );
  const claimedIds = Array.from(new Set([...(prev.claimedIds ?? []), missionId]));
  profile.weeklyMissionProgress = {
    ...prev,
    claimedIds,
    lockedLevel: prev.lockedLevel ?? Math.max(1, Math.floor(profile.level ?? 1)),
  };
  profile.weeklyMissionsCompleted = (profile.weeklyMissionsCompleted ?? 0) + 1;

  const pointsAwarded = Math.max(0, mission.rewardPoints);
  const xpAwarded = Math.max(0, mission.rewardXp);
  const coinsAwarded = Math.max(0, mission.rewardCoins ?? 0);

  if (pointsAwarded > 0) {
    awardCareerPoints(profile, pointsAwarded, `Missão Semanal: ${mission.title}`, 1, {
      source: "missao_semanal",
    });
  }
  if (xpAwarded > 0) {
    profile.xp = Math.max(0, (profile.xp ?? 0) + xpAwarded);
    profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + xpAwarded);
  }
  if (coinsAwarded > 0) {
    awardCoins(profile, coinsAwarded, `Missão Semanal: ${mission.title}`, "missao_semanal");
  }

  return { ok: true, missionId, pointsAwarded, xpAwarded, coinsAwarded };
}

function buildWeeklyMissionsList(args: {
  profile?: Partial<PlayerProfile> | null;
  adminConfig?: Partial<AdminConfig> | null;
  now?: Date;
  weekKey?: string;
  weekIndex?: number;
}): WeeklyMission[] {
  const weekInfo = getWeekInfo(args.now ?? new Date());
  const weekKey = args.weekKey ?? weekInfo.weekKey;
  const weekIndex = args.weekIndex ?? weekInfo.weekIndex;
  const weekProgress =
    args.profile?.weeklyMissionProgress?.weekKey === weekKey
      ? args.profile.weeklyMissionProgress
      : null;
  const level = Math.max(1, Math.floor(weekProgress?.lockedLevel ?? args.profile?.level ?? 1));
  const isAdmin = Boolean(args.profile?.isAdmin);
  const tournamentEnabled = args.adminConfig?.tournamentEnabled !== false;
  const variant = Math.abs(weekIndex) % 2;

  const eligibleGames = getEligibleGamesForWeeklyMissions({
    level,
    isAdmin,
    adminConfig: args.adminConfig,
  });
  const maxEligibleGames = Math.max(1, eligibleGames.length);

  if (level <= 3) {
    const distinctTarget = Math.min(5, maxEligibleGames);
    return [
      {
        id: `wm_${weekKey}_matches`,
        type: "weekly_matches",
        title: "Maratona Semanal",
        description: "Conclua 15 partidas em qualquer jogo elegível nesta semana.",
        target: 15,
        current: 0,
        rewardPoints: 80,
        rewardXp: 80,
        minLevelRequired: 1,
      },
      {
        id: `wm_${weekKey}_distinct`,
        type: "weekly_distinct_games",
        title: "Explorador da Semana",
        description: `Jogue em ${distinctTarget} ${distinctTarget === 1 ? "jogo diferente" : "jogos diferentes"} liberados para o seu nível nesta semana.`,
        target: distinctTarget,
        current: 0,
        rewardPoints: 100,
        rewardXp: 100,
        minLevelRequired: 1,
      },
      {
        id: `wm_${weekKey}_xp`,
        type: "weekly_xp",
        title: "Acúmulo de Energia",
        description: "Conquiste 600 XP ao longo desta semana.",
        target: 600,
        current: 0,
        rewardPoints: 90,
        rewardXp: 90,
        minLevelRequired: 1,
      },
      {
        id: `wm_${weekKey}_daily_missions`,
        type: "weekly_daily_missions",
        title: "Constância Diária",
        description: "Complete 6 missões diárias durante esta semana.",
        target: 6,
        current: 0,
        rewardPoints: 120,
        rewardXp: 120,
        minLevelRequired: 1,
      },
    ];
  }

  if (level <= 6) {
    const distinctTarget = Math.min(5, maxEligibleGames);
    const xpMidMission: WeeklyMission = {
      id: `wm_${weekKey}_xp`,
      type: "weekly_xp",
      title: "Força Semanal",
      description: "Conquiste 1.000 XP ao longo desta semana.",
      target: 1000,
      current: 0,
      rewardPoints: 120,
      rewardXp: 120,
      minLevelRequired: 4,
    };
    const dailyMidMission: WeeklyMission = {
      id: `wm_${weekKey}_daily_missions`,
      type: "weekly_daily_missions",
      title: "Disciplina de Elite",
      description: "Complete 10 missões diárias durante esta semana.",
      target: 10,
      current: 0,
      rewardPoints: 130,
      rewardXp: 130,
      minLevelRequired: 4,
    };
    const rotatingMission = variant === 0 ? xpMidMission : dailyMidMission;
    const fourthMidMission = tournamentEnabled
      ? resolveRankedWeeklyMission({
          level,
          weekKey,
          tournamentPoints: args.profile?.tournamentPoints,
          tournamentRankId: args.profile?.tournamentRankId,
          startRankIndex: weekProgress?.startRankIndex,
        })
      : variant === 0
        ? dailyMidMission
        : xpMidMission;

    return [
      {
        id: `wm_${weekKey}_matches`,
        type: "weekly_matches",
        title: "Ritmo de Campeão",
        description: "Conclua 25 partidas em qualquer jogo elegível nesta semana.",
        target: 25,
        current: 0,
        rewardPoints: 110,
        rewardXp: 110,
        minLevelRequired: 4,
      },
      {
        id: `wm_${weekKey}_distinct`,
        type: "weekly_distinct_games",
        title: "Versatilidade Semanal",
        description: `Jogue em ${distinctTarget} ${distinctTarget === 1 ? "jogo diferente" : "jogos diferentes"} liberados para o seu nível nesta semana.`,
        target: distinctTarget,
        current: 0,
        rewardPoints: 120,
        rewardXp: 120,
        minLevelRequired: 4,
      },
      rotatingMission,
      fourthMidMission,
    ];
  }

  const distinctTarget = Math.min(6, maxEligibleGames);
  const xpHighMission: WeeklyMission = {
    id: `wm_${weekKey}_xp`,
    type: "weekly_xp",
    title: "Potência Máxima",
    description: "Conquiste 1.500 XP ao longo desta semana.",
    target: 1500,
    current: 0,
    rewardPoints: 160,
    rewardXp: 160,
    minLevelRequired: 7,
  };
  const dailyHighMission: WeeklyMission = {
    id: `wm_${weekKey}_daily_missions`,
    type: "weekly_daily_missions",
    title: "Imbatível na Rotina",
    description: "Complete 12 missões diárias durante esta semana.",
    target: 12,
    current: 0,
    rewardPoints: 170,
    rewardXp: 170,
    minLevelRequired: 7,
  };
  const rotatingHighMission = variant === 0 ? xpHighMission : dailyHighMission;
  const fourthHighMission = tournamentEnabled
    ? resolveRankedWeeklyMission({
        level,
        weekKey,
        tournamentPoints: args.profile?.tournamentPoints,
        tournamentRankId: args.profile?.tournamentRankId,
        startRankIndex: weekProgress?.startRankIndex,
      })
    : variant === 0
      ? dailyHighMission
      : xpHighMission;

  return [
    {
      id: `wm_${weekKey}_matches`,
      type: "weekly_matches",
      title: "Lenda da Semana",
      description: "Conclua 35 partidas em qualquer jogo elegível nesta semana.",
      target: 35,
      current: 0,
      rewardPoints: 140,
      rewardXp: 140,
      minLevelRequired: 7,
    },
    {
      id: `wm_${weekKey}_distinct`,
      type: "weekly_distinct_games",
      title: "Mestre Polivalente",
      description: `Jogue em ${distinctTarget} ${distinctTarget === 1 ? "jogo diferente" : "jogos diferentes"} liberados para o seu nível nesta semana.`,
      target: distinctTarget,
      current: 0,
      rewardPoints: 150,
      rewardXp: 150,
      minLevelRequired: 7,
    },
    rotatingHighMission,
    fourthHighMission,
  ];
}
