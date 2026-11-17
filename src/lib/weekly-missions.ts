import { ALL_GAME_IDS, type GameId } from "./game-storage.ts";
import type { AdminConfig } from "./game-codes.ts";
import type { PlayerProfile } from "./playfab.ts";
import { getTournamentRank, getWeekInfo, TOURNAMENT_RANKS } from "./weekly-tournament.ts";

export type WeeklyMissionType =
  | "weekly_matches"
  | "weekly_distinct_games"
  | "weekly_xp"
  | "weekly_ranked_ranks"
  | "weekly_ranked_matches"
  | "weekly_daily_missions";

export interface WeeklyMission {
  id: string;
  type: WeeklyMissionType;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardPoints: number;
  rewardXp: number;
  minLevelRequired: number;
}

export const WEEKLY_MISSIONS_COUNT = 4;

/**
 * Avalia o rank atual do jogador no Torneio Semanal e retorna a missão ranqueada
 * balanceada (apenas para jogadores de Nível 4+):
 * - Rank máximo (Mestre / 0 ranks restantes): missão apenas de jogar partidas ranqueadas.
 * - Rank muito alto (Diamante): no máximo 1 rank.
 * - Rank médio (Ouro / Platina): no máximo 2 ranks.
 * - Rank baixo (Bronze / Prata): até 3 ranks (2 no Nível 4–6, 3 no Nível 7–10).
 */
export function resolveRankedWeeklyMission(args: {
  level: number;
  weekKey: string;
  tournamentPoints?: number;
  tournamentRankId?: string;
}): WeeklyMission {
  const safeLevel = Math.max(4, Math.floor(args.level));
  const pointsRank = getTournamentRank(args.tournamentPoints ?? 0).currentRank;
  const pointsIdx = TOURNAMENT_RANKS.findIndex((r) => r.id === pointsRank.id);
  const idIdx = args.tournamentRankId
    ? TOURNAMENT_RANKS.findIndex((r) => r.id === args.tournamentRankId)
    : -1;
  const currentIdx = Math.max(0, pointsIdx, idIdx);
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
  const minLevelsMap = args.adminConfig?.gameMinLevels;

  const eligible = ALL_GAME_IDS.filter((gId) => {
    if (enabledMap && enabledMap[gId] === false) return false;
    if (!args.isAdmin && adminOnlyMap && adminOnlyMap[gId] === true) return false;
    const minLvl = minLevelsMap?.[gId] ?? 1;
    if (!args.isAdmin && safeLevel < minLvl) return false;
    return true;
  });

  return eligible.length > 0 ? eligible : [];
}

/**
 * Gera exatamente 4 missões semanais conforme a faixa de nível do jogador
 * (Nível 1–3, Nível 4–6 e Nível 7–10), alternando automaticamente a cada semana
 * (Segunda 00:00 até Domingo 23:59) via `getWeekInfo`.
 *
 * Missões de subir ranks na ranqueada aparecem exclusivamente a partir do Nível 4.
 */
export function generateWeeklyMissions(args: {
  profile?: Partial<PlayerProfile> | null;
  adminConfig?: Partial<AdminConfig> | null;
  now?: Date;
  weekKey?: string;
  weekIndex?: number;
}): WeeklyMission[] {
  const level = Math.max(1, Math.floor(args.profile?.level ?? 1));
  const isAdmin = Boolean(args.profile?.isAdmin);
  const weekInfo = getWeekInfo(args.now ?? new Date());
  const weekKey = args.weekKey ?? weekInfo.weekKey;
  const weekIndex = args.weekIndex ?? weekInfo.weekIndex;
  const variant = Math.abs(weekIndex) % 2;

  const eligibleGames = getEligibleGamesForWeeklyMissions({
    level,
    isAdmin,
    adminConfig: args.adminConfig,
  });
  const maxEligibleGames = Math.max(1, eligibleGames.length);

  // Nível 1 a 3: 4 missões semanais (sem ranqueada)
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

  // Nível 4 a 6: 4 missões semanais (inclui subir 2 ranks nas ranqueadas)
  if (level <= 6) {
    const distinctTarget = Math.min(5, maxEligibleGames);
    const rotatingMission: WeeklyMission =
      variant === 0
        ? {
            id: `wm_${weekKey}_xp`,
            type: "weekly_xp",
            title: "Força Semanal",
            description: "Conquiste 1.000 XP ao longo desta semana.",
            target: 1000,
            current: 0,
            rewardPoints: 120,
            rewardXp: 120,
            minLevelRequired: 4,
          }
        : {
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
      resolveRankedWeeklyMission({
        level,
        weekKey,
        tournamentPoints: args.profile?.tournamentPoints,
        tournamentRankId: args.profile?.tournamentRankId,
      }),
    ];
  }

  // Nível 7 a 10: 4 missões semanais (inclui subir 3 ranks nas ranqueadas)
  const distinctTarget = Math.min(6, maxEligibleGames);
  const rotatingHighMission: WeeklyMission =
    variant === 0
      ? {
          id: `wm_${weekKey}_xp`,
          type: "weekly_xp",
          title: "Potência Máxima",
          description: "Conquiste 1.500 XP ao longo desta semana.",
          target: 1500,
          current: 0,
          rewardPoints: 160,
          rewardXp: 160,
          minLevelRequired: 7,
        }
      : {
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
    resolveRankedWeeklyMission({
      level,
      weekKey,
      tournamentPoints: args.profile?.tournamentPoints,
      tournamentRankId: args.profile?.tournamentRankId,
    }),
  ];
}
