// Torneio Semanal Ranqueado (Nível 3+)
// 1 Jogo por semana, limite de 10 entradas diárias (+100 XP extras/dia),
// Ranking Top 5 com Bônus de Permanência ("quem se mantiver na colocação por mais tempo")
// e sistema de Medalhas de Torneio engatilhado.

import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import { loadAdminConfig } from "./game-codes.ts";
import {
  grantPlayerTournamentMedal,
  deductPaidTournamentPoints,
  getAdminPlayFabTicket,
  getAllRegisteredPlayers,
  getPlayFabTitleId,
  isPlayFabConfigured,
  loadStoredSession,
  syncStudentRosterFromPlayFab,
  loadRegistry,
  saveRegistry,
  getStudentRosterCloudKey,
  type PlayerProfile,
} from "./playfab.ts";
import { createInboxMessage } from "./inbox-messages.ts";
import {
  getActiveEventBonuses,
  type SpecialEvent,
  type RecurringEvent,
} from "./custom-events.ts";
import {
  awardCareerPoints,
  checkTournamentTierPromotion,
  RANKED_WIN_POINTS,
} from "./career-points.ts";
import {
  ageFrom,
  AGE_STAGES,
  getAgeStageInfo,
  getLocalDateKey,
  isMatchVictory,
  stageFromBirthdate,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_PAID_ENTRY_COST,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  TOURNAMENT_XP_PER_ENTRY,
  type AgeStageId,
  type TournamentMedal,
} from "./player-profile.ts";

export type { AgeStageId };

const TOURNAMENT_STORAGE_KEY = "desafios-weekly-tournament-v1";

export {
  AGE_STAGES,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_PAID_ENTRY_COST,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  TOURNAMENT_XP_PER_ENTRY,
};

export type TournamentTier = "bronze" | "prata" | "ouro" | "platina" | "diamante" | "mestre";

export type TournamentRankId =
  | "bronze_1"
  | "bronze_2"
  | "bronze_3"
  | "prata_1"
  | "prata_2"
  | "prata_3"
  | "ouro_1"
  | "ouro_2"
  | "ouro_3"
  | "platina_1"
  | "platina_2"
  | "platina_3"
  | "platina_4"
  | "diamante_1"
  | "diamante_2"
  | "diamante_3"
  | "diamante_4"
  | "diamante_5"
  | "mestre";

export interface TournamentRankDefinition {
  id: TournamentRankId;
  tier: TournamentTier;
  tierName: string;
  division: string;
  name: string;
  minPoints: number;
  maxPoints: number;
  textColor: string;
  badgeBg: string;
  borderColor: string;
  glowHex: string;
  iconName: string;
  shape: "shield" | "crest" | "star" | "diamond" | "hexagon" | "crown";
}

export const TOURNAMENT_RANKS: TournamentRankDefinition[] = [
  // Bronze (0 - 90 pts)
  {
    id: "bronze_1",
    tier: "bronze",
    tierName: "Bronze",
    division: "I",
    name: "Bronze I",
    minPoints: 0,
    maxPoints: 30,
    textColor: "text-[#b8661d] dark:text-[#cd7f32]",
    badgeBg: "bg-[#f7e4d0] dark:bg-[#3b2310]",
    borderColor: "border-[#cd7f32]",
    glowHex: "#cd7f32",
    iconName: "Shield",
    shape: "shield",
  },
  {
    id: "bronze_2",
    tier: "bronze",
    tierName: "Bronze",
    division: "II",
    name: "Bronze II",
    minPoints: 31,
    maxPoints: 60,
    textColor: "text-[#b8661d] dark:text-[#cd7f32]",
    badgeBg: "bg-[#f7e4d0] dark:bg-[#3b2310]",
    borderColor: "border-[#cd7f32]",
    glowHex: "#cd7f32",
    iconName: "Shield",
    shape: "shield",
  },
  {
    id: "bronze_3",
    tier: "bronze",
    tierName: "Bronze",
    division: "III",
    name: "Bronze III",
    minPoints: 61,
    maxPoints: 90,
    textColor: "text-[#b8661d] dark:text-[#cd7f32]",
    badgeBg: "bg-[#f7e4d0] dark:bg-[#3b2310]",
    borderColor: "border-[#cd7f32]",
    glowHex: "#cd7f32",
    iconName: "Shield",
    shape: "shield",
  },
  // Prata (91 - 240 pts)
  {
    id: "prata_1",
    tier: "prata",
    tierName: "Prata",
    division: "I",
    name: "Prata I",
    minPoints: 91,
    maxPoints: 140,
    textColor: "text-slate-700 dark:text-slate-200",
    badgeBg: "bg-slate-200 dark:bg-slate-700",
    borderColor: "border-slate-400 dark:border-slate-500",
    glowHex: "#94a3b8",
    iconName: "Award",
    shape: "crest",
  },
  {
    id: "prata_2",
    tier: "prata",
    tierName: "Prata",
    division: "II",
    name: "Prata II",
    minPoints: 141,
    maxPoints: 190,
    textColor: "text-slate-700 dark:text-slate-200",
    badgeBg: "bg-slate-200 dark:bg-slate-700",
    borderColor: "border-slate-400 dark:border-slate-500",
    glowHex: "#94a3b8",
    iconName: "Award",
    shape: "crest",
  },
  {
    id: "prata_3",
    tier: "prata",
    tierName: "Prata",
    division: "III",
    name: "Prata III",
    minPoints: 191,
    maxPoints: 240,
    textColor: "text-slate-700 dark:text-slate-200",
    badgeBg: "bg-slate-200 dark:bg-slate-700",
    borderColor: "border-slate-400 dark:border-slate-500",
    glowHex: "#94a3b8",
    iconName: "Award",
    shape: "crest",
  },
  // Ouro (241 - 450 pts)
  {
    id: "ouro_1",
    tier: "ouro",
    tierName: "Ouro",
    division: "I",
    name: "Ouro I",
    minPoints: 241,
    maxPoints: 310,
    textColor: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-100 dark:bg-amber-950",
    borderColor: "border-amber-400",
    glowHex: "#fbbf24",
    iconName: "Star",
    shape: "star",
  },
  {
    id: "ouro_2",
    tier: "ouro",
    tierName: "Ouro",
    division: "II",
    name: "Ouro II",
    minPoints: 311,
    maxPoints: 380,
    textColor: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-100 dark:bg-amber-950",
    borderColor: "border-amber-400",
    glowHex: "#fbbf24",
    iconName: "Star",
    shape: "star",
  },
  {
    id: "ouro_3",
    tier: "ouro",
    tierName: "Ouro",
    division: "III",
    name: "Ouro III",
    minPoints: 381,
    maxPoints: 450,
    textColor: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-100 dark:bg-amber-950",
    borderColor: "border-amber-400",
    glowHex: "#fbbf24",
    iconName: "Star",
    shape: "star",
  },
  // Platina (451 - 680 pts)
  {
    id: "platina_1",
    tier: "platina",
    tierName: "Platina",
    division: "I",
    name: "Platina I",
    minPoints: 451,
    maxPoints: 507,
    textColor: "text-cyan-700 dark:text-cyan-300",
    badgeBg: "bg-cyan-100 dark:bg-cyan-950",
    borderColor: "border-cyan-400",
    glowHex: "#22d3ee",
    iconName: "Sparkles",
    shape: "diamond",
  },
  {
    id: "platina_2",
    tier: "platina",
    tierName: "Platina",
    division: "II",
    name: "Platina II",
    minPoints: 508,
    maxPoints: 564,
    textColor: "text-cyan-700 dark:text-cyan-300",
    badgeBg: "bg-cyan-100 dark:bg-cyan-950",
    borderColor: "border-cyan-400",
    glowHex: "#22d3ee",
    iconName: "Sparkles",
    shape: "diamond",
  },
  {
    id: "platina_3",
    tier: "platina",
    tierName: "Platina",
    division: "III",
    name: "Platina III",
    minPoints: 565,
    maxPoints: 621,
    textColor: "text-cyan-700 dark:text-cyan-300",
    badgeBg: "bg-cyan-100 dark:bg-cyan-950",
    borderColor: "border-cyan-400",
    glowHex: "#22d3ee",
    iconName: "Sparkles",
    shape: "diamond",
  },
  {
    id: "platina_4",
    tier: "platina",
    tierName: "Platina",
    division: "IV",
    name: "Platina IV",
    minPoints: 622,
    maxPoints: 680,
    textColor: "text-cyan-700 dark:text-cyan-300",
    badgeBg: "bg-cyan-100 dark:bg-cyan-950",
    borderColor: "border-cyan-400",
    glowHex: "#22d3ee",
    iconName: "Sparkles",
    shape: "diamond",
  },
  // Diamante (681 - 849 pts)
  {
    id: "diamante_1",
    tier: "diamante",
    tierName: "Diamante",
    division: "I",
    name: "Diamante I",
    minPoints: 681,
    maxPoints: 714,
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
    badgeBg: "bg-fuchsia-100 dark:bg-fuchsia-950",
    borderColor: "border-fuchsia-400",
    glowHex: "#e879f9",
    iconName: "Sparkles",
    shape: "hexagon",
  },
  {
    id: "diamante_2",
    tier: "diamante",
    tierName: "Diamante",
    division: "II",
    name: "Diamante II",
    minPoints: 715,
    maxPoints: 748,
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
    badgeBg: "bg-fuchsia-100 dark:bg-fuchsia-950",
    borderColor: "border-fuchsia-400",
    glowHex: "#e879f9",
    iconName: "Sparkles",
    shape: "hexagon",
  },
  {
    id: "diamante_3",
    tier: "diamante",
    tierName: "Diamante",
    division: "III",
    name: "Diamante III",
    minPoints: 749,
    maxPoints: 782,
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
    badgeBg: "bg-fuchsia-100 dark:bg-fuchsia-950",
    borderColor: "border-fuchsia-400",
    glowHex: "#e879f9",
    iconName: "Sparkles",
    shape: "hexagon",
  },
  {
    id: "diamante_4",
    tier: "diamante",
    tierName: "Diamante",
    division: "IV",
    name: "Diamante IV",
    minPoints: 783,
    maxPoints: 816,
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
    badgeBg: "bg-fuchsia-100 dark:bg-fuchsia-950",
    borderColor: "border-fuchsia-400",
    glowHex: "#e879f9",
    iconName: "Sparkles",
    shape: "hexagon",
  },
  {
    id: "diamante_5",
    tier: "diamante",
    tierName: "Diamante",
    division: "V",
    name: "Diamante V",
    minPoints: 817,
    maxPoints: 849,
    textColor: "text-fuchsia-700 dark:text-fuchsia-300",
    badgeBg: "bg-fuchsia-100 dark:bg-fuchsia-950",
    borderColor: "border-fuchsia-400",
    glowHex: "#e879f9",
    iconName: "Sparkles",
    shape: "hexagon",
  },
  // Mestre (850+ pts)
  {
    id: "mestre",
    tier: "mestre",
    tierName: "Mestre",
    division: "",
    name: "Mestre",
    minPoints: 850,
    maxPoints: 99999,
    textColor: "text-rose-600 dark:text-rose-300",
    badgeBg: "bg-rose-100 dark:bg-rose-950",
    borderColor: "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse",
    glowHex: "#f43f5e",
    iconName: "Crown",
    shape: "crown",
  },
];

export function getTournamentRank(points: number): {
  currentRank: TournamentRankDefinition;
  nextRank: TournamentRankDefinition | null;
  progressPercent: number;
  pointsToNext: number;
  pointsInCurrentRank: number;
  pointsForCurrentRank: number;
} {
  const safePoints = Math.max(0, Math.floor(points));
  let curIdx = 0;
  for (let i = 0; i < TOURNAMENT_RANKS.length; i++) {
    if (safePoints >= TOURNAMENT_RANKS[i].minPoints) {
      curIdx = i;
    }
  }

  const currentRank = TOURNAMENT_RANKS[curIdx];
  const nextRank = curIdx < TOURNAMENT_RANKS.length - 1 ? TOURNAMENT_RANKS[curIdx + 1] : null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      progressPercent: 100,
      pointsToNext: 0,
      pointsInCurrentRank: safePoints - currentRank.minPoints,
      pointsForCurrentRank: 100,
    };
  }

  const span = Math.max(1, nextRank.minPoints - currentRank.minPoints);
  const inRank = Math.max(0, safePoints - currentRank.minPoints);
  const progressPercent = Math.min(100, Math.round((inRank / span) * 100));
  const pointsToNext = Math.max(0, nextRank.minPoints - safePoints);

  return {
    currentRank,
    nextRank,
    progressPercent,
    pointsToNext,
    pointsInCurrentRank: inRank,
    pointsForCurrentRank: span,
  };
}

export interface TournamentPlayerRecord {
  playerId: string;
  nick: string;
  fullName: string;
  school: string;
  birthdate?: string;
  age?: number;
  stage?: AgeStageId;
  level: number;
  bestScore: number;
  totalEntries: number;
  tournamentPoints?: number;
  dailyWinsCount?: number;
  dailyMatchesCount?: number;
  dailyDateKey?: string;
  dailyBonusAwarded?: boolean;
  highestRankId?: TournamentRankId;
  /** Timestamp (epoch ms) when the player entered the Top 5 of their Etapa (null if currently outside Top 5) */
  activeTop5Since: number | null;
  /** Accumulated milliseconds previously spent inside the Top 5 of their Etapa this week */
  accumulatedTop5Ms: number;
  updatedAt: number;
}

export interface TournamentStandingRow {
  rank: number;
  playerId: string;
  nick: string;
  fullName: string;
  school: string;
  age: number;
  stage: AgeStageId;
  stageLabel: string;
  level: number;
  bestScore: number;
  tournamentPoints: number;
  currentRank: TournamentRankDefinition;
  holdMinutes: number;
  holdBonusPoints: number;
  totalRankedPoints: number;
  totalEntries: number;
  projectedMedal: {
    tier: "gold" | "silver" | "bronze" | "elite";
    emoji: string;
    label: string;
    bonusXp: number;
  };
}

export function getTournamentSeasonGroupId(seasonId: number): string {
  return `TOURNAMENT_SEASON_${seasonId}`;
}

export interface WeeklyTournamentStore {
  seasonId?: number;
  weekKey: string;
  gameId: GameId;
  records: Record<string, TournamentPlayerRecord>;
  updatedAt: number;
}

/** Computes a deterministic Monday-to-Sunday week key (`YYYY-Www`, flipping Sunday 23:59 -> Monday 00:00). */
export function getWeekInfo(now = new Date()): {
  weekKey: string;
  weekIndex: number;
  endsAtLabel: string;
} {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startMondayOffset = (startOfYear.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const diffDays = Math.round((todayMidnight.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.floor((diffDays + startMondayOffset) / 7) + 1;
  const weekKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

  // Current week's Sunday 23:59
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday);
  const endsAtLabel = `${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às 23:59`;

  return {
    weekKey,
    weekIndex: now.getFullYear() * 53 + weekNum,
    endsAtLabel,
  };
}

/** Selects the Weekly Ranked Tournament game (ADM override or automatic weekly rotation). */
export function resolveWeeklyTournamentGame(
  weekIndex: number,
  overrideGame?: GameId | null,
  enabledGames?: Record<GameId, boolean>,
): GameId {
  if (overrideGame && (!enabledGames || enabledGames[overrideGame])) {
    return overrideGame;
  }
  const pool = enabledGames
    ? ALL_GAME_IDS.filter((id) => enabledGames[id])
    : ALL_GAME_IDS;
  const safePool = pool.length > 0 ? pool : ALL_GAME_IDS;
  return safePool[Math.abs(weekIndex) % safePool.length];
}

/** Calculates total minutes spent in the Top 5. */
export function computeTop5HoldMetrics(
  record: Pick<TournamentPlayerRecord, "activeTop5Since" | "accumulatedTop5Ms">,
  nowMs = Date.now(),
): { holdMinutes: number; holdBonusPoints: number } {
  const activeMs =
    record.activeTop5Since !== null ? Math.max(0, nowMs - record.activeTop5Since) : 0;
  const totalMs = Math.max(0, (record.accumulatedTop5Ms ?? 0) + activeMs);
  const holdMinutes = Math.floor(totalMs / 60_000);
  // Pontuação de permanência completamente removida: apenas os pontos das partidas definem os ranks.
  const holdBonusPoints = 0;
  return { holdMinutes, holdBonusPoints };
}

export function projectedMedalForRank(
  rank: number,
  _holdMinutes = 0,
): TournamentStandingRow["projectedMedal"] {
  if (rank === 1) {
    return {
      tier: "gold",
      emoji: "🥇",
      label: "Ouro • Campeão da Semana",
      bonusXp: 150,
    };
  }
  if (rank === 2) {
    return {
      tier: "silver",
      emoji: "🥈",
      label: "Prata • Vice-Campeão Semanal",
      bonusXp: 100,
    };
  }
  if (rank === 3) {
    return {
      tier: "bronze",
      emoji: "🥉",
      label: "Bronze • 3º Lugar Semanal",
      bonusXp: 75,
    };
  }
  return {
    tier: "elite",
    emoji: "🏅",
    label: "Elite • Top 5 da Semana",
    bonusXp: 50,
  };
}

/**
 * Re-evaluates all tournament records per Age Stage (1ª, 2ª, 3ª Etapa),
 * updates `activeTop5Since` for who is inside vs. outside the Top 5 of their Etapa,
 * and returns the sorted Top 5 leaderboard (for the requested `stageFilter` or `"TODAS"`).
 */
export function evaluateTournamentStandings(
  recordsMap: Record<string, TournamentPlayerRecord>,
  nowMs = Date.now(),
  stageFilter?: AgeStageId | "TODAS",
): {
  top5: TournamentStandingRow[];
  allStandings: TournamentStandingRow[];
  updatedRecords: Record<string, TournamentPlayerRecord>;
} {
  const reg = typeof window !== "undefined" ? loadRegistry() : {};
  const list = Object.values(recordsMap)
    .filter((rec) => {
      if (!rec || !rec.playerId) return false;
      const pId = rec.playerId.toLowerCase();
      if (pId === "admin-system" || pId.startsWith("admin-system")) return false;
      // Requisito oficial do Torneio Semanal Ranqueado: Nível 3+
      const pNick = (rec.nick || "").toLowerCase();
      const foundAcc =
        reg[pId] ||
        reg[pNick] ||
        Object.values(reg).find((a) => a?.profile?.nick?.toLowerCase() === pNick);
      const effLevel = rec.level ?? foundAcc?.profile?.level ?? 1;
      if (effLevel < TOURNAMENT_MIN_LEVEL) return false;
      return true;
    })
    .map((rec) => {
      const resolvedAge =
        rec.age ?? (rec.birthdate ? ageFrom(rec.birthdate, new Date(nowMs)) : 10);
      const resolvedStage: AgeStageId =
        rec.stage ??
        (rec.birthdate ? stageFromBirthdate(rec.birthdate, new Date(nowMs), rec.school).id : "etapa_1");
      const stInfo = getAgeStageInfo(resolvedStage);
      const { holdMinutes, holdBonusPoints } = computeTop5HoldMetrics(rec, nowMs);
      const tourPoints =
        typeof rec.tournamentPoints === "number"
          ? Math.max(0, rec.tournamentPoints)
          : Math.max(0, rec.bestScore ?? 0);
      const currentRank = getTournamentRank(tourPoints).currentRank;
      return {
        rec: {
          ...rec,
          age: resolvedAge,
          stage: resolvedStage,
          tournamentPoints: tourPoints,
        },
        stage: resolvedStage,
        stageLabel: stInfo.shortLabel,
        age: resolvedAge,
        tournamentPoints: tourPoints,
        currentRank,
        holdMinutes,
        holdBonusPoints,
        totalRankedPoints: tourPoints,
      };
    });

  // Ordena unicamente por Pontos do Torneio (apenas as pontuações dos ranks definem as posições)
  // Em caso de empate: melhor pontuação em partida individual (bestScore) e quem pontuou primeiro (updatedAt)
  list.sort(
    (a, b) =>
      b.tournamentPoints - a.tournamentPoints ||
      b.rec.bestScore - a.rec.bestScore ||
      a.rec.updatedAt - b.rec.updatedAt,
  );

  // Track Top 5 independently within each Etapa (1ª Etapa, 2ª Etapa, 3ª Etapa)
  const stageCounters: Record<AgeStageId, number> = {
    etapa_1: 0,
    etapa_2: 0,
    etapa_3: 0,
  };

  const updatedRecords: Record<string, TournamentPlayerRecord> = {};
  const stageStandingsMap: Record<AgeStageId, TournamentStandingRow[]> = {
    etapa_1: [],
    etapa_2: [],
    etapa_3: [],
  };
  const generalStandings: TournamentStandingRow[] = [];

  list.forEach((item, globalIndex) => {
    stageCounters[item.stage] += 1;
    const stageRank = stageCounters[item.stage];
    const isTop5InStage = stageRank <= 5;
    const copy: TournamentPlayerRecord = { ...item.rec };

    if (isTop5InStage && copy.activeTop5Since === null) {
      copy.activeTop5Since = nowMs;
    } else if (!isTop5InStage && copy.activeTop5Since !== null) {
      copy.accumulatedTop5Ms += Math.max(0, nowMs - copy.activeTop5Since);
      copy.activeTop5Since = null;
    }

    updatedRecords[copy.playerId] = copy;

    const stageRow: TournamentStandingRow = {
      rank: stageRank,
      playerId: copy.playerId,
      nick: copy.nick,
      fullName: copy.fullName,
      school: copy.school,
      age: item.age,
      stage: item.stage,
      stageLabel: item.stageLabel,
      level: copy.level,
      bestScore: copy.bestScore,
      tournamentPoints: item.tournamentPoints,
      currentRank: item.currentRank,
      holdMinutes: item.holdMinutes,
      holdBonusPoints: item.holdBonusPoints,
      totalRankedPoints: item.totalRankedPoints,
      totalEntries: copy.totalEntries,
      projectedMedal: projectedMedalForRank(stageRank, item.holdMinutes),
    };
    stageStandingsMap[item.stage].push(stageRow);

    generalStandings.push({
      ...stageRow,
      rank: globalIndex + 1,
      projectedMedal: projectedMedalForRank(globalIndex + 1, item.holdMinutes),
    });
  });

  const targetList =
    stageFilter && stageFilter !== "TODAS"
      ? stageStandingsMap[stageFilter]
      : generalStandings;

  return {
    top5: targetList.slice(0, 5),
    allStandings: targetList,
    updatedRecords,
  };
}

/* --------------------- Local & PlayFab Persistence --------------------- */

/**
 * Executa o encerramento consolidado e solene da Temporada do Modo Ranqueado:
 * 1. Congela o Pódio Oficial Top 5 de cada uma das 3 etapas (1ª, 2ª e 3ª Etapa).
 * 2. Concede as medalhas oficiais e XP diretamente no Correio (Inbox) de cada medalhista com carta oficial e anexo de resgate.
 * 3. Se o jogador estiver na sessão local ativa, atualiza também imediatamente o inventário permanente de medalhas.
 */
export async function finalizeRankedSeasonAndAwardMedalsViaInbox(
  seasonId: number,
  pastStore?: WeeklyTournamentStore,
): Promise<{ totalMedalsAwarded: number; podiumSummary: Record<string, string[]> }> {
  const store = pastStore ?? loadTournamentStore();
  const stages: AgeStageId[] = ["etapa_1", "etapa_2", "etapa_3"];
  let totalMedalsAwarded = 0;
  const podiumSummary: Record<string, string[]> = {};

  if (!store || !store.records || Object.keys(store.records).length === 0) {
    return { totalMedalsAwarded: 0, podiumSummary };
  }

  for (const st of stages) {
    const evaluated = evaluateTournamentStandings(store.records, store.updatedAt, st);
    const winners = evaluated.top5.filter((r) => r.rank <= 5);
    podiumSummary[st] = [];

    for (const row of winners) {
      const proj = projectedMedalForRank(row.rank, row.holdMinutes);
      const medalId =
        row.rank === 1
          ? "tournament_top_1_gold"
          : row.rank === 2
          ? "tournament_top_2_silver"
          : row.rank === 3
          ? "tournament_top_3_bronze"
          : "tour_master_bronze";

      const tourMedal: TournamentMedal = {
        id: `medal_season_${seasonId}_${st}_r${row.rank}`,
        weekKey: `Season_${seasonId}`,
        gameId: store.gameId,
        rank: row.rank,
        tier: proj.tier,
        label: `${proj.emoji} Top ${row.rank} ${row.stageLabel} (Temporada ${seasonId})`,
        heldMinutes: row.holdMinutes,
        bonusXpAwarded: proj.bonusXp,
        earnedAt: new Date(store.updatedAt).toISOString(),
      };

      const title =
        row.rank === 1
          ? `🏆 Campeão da Temporada ${seasonId} Ranqueada!`
          : row.rank === 2
          ? `🥈 Vice-Campeão da Temporada ${seasonId} Ranqueada!`
          : row.rank === 3
          ? `🥉 3º Lugar da Temporada ${seasonId} Ranqueada!`
          : `🎖️ Top ${row.rank} de Elite da Temporada ${seasonId} Ranqueada!`;

      const body =
        row.rank === 1
          ? `Parabéns pelo feito extraordinário! Você conquistou o 1º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Modo Ranqueado da SEMED Coari. Sua dedicação e conhecimento levaram você ao topo mais alto do pódio! Reivindique sua Medalha de Ouro Oficial de Campeão e seus pontos de prestígio abaixo.`
          : row.rank === 2
          ? `Parabéns pela grande conquista! Você conquistou o 2º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Modo Ranqueado da SEMED Coari. Excelente desempenho e determinação! Reivindique sua Medalha de Prata Oficial de Vice-Campeão e seus pontos de prestígio abaixo.`
          : row.rank === 3
          ? `Parabéns pelo pódio! Você garantiu o 3º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Modo Ranqueado da SEMED Coari. Você faz parte dos melhores da rede municipal! Reivindique sua Medalha de Bronze Oficial de 3º Lugar e seus pontos de prestígio abaixo.`
          : `Parabéns! Você alcançou o Top ${row.rank} na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Modo Ranqueado da SEMED Coari, consolidando-se entre os melhores competidores da rede municipal! Reivindique sua Medalha de Honra de Elite Oficial e seus pontos de prestígio abaixo.`;

      const rewId = `rew_rnk_s${seasonId}_${st}_r${row.rank}_${Date.now()}`;
      createInboxMessage({
        recipientId: row.playerId,
        sender: "adm",
        senderName: "Coordenação de Torneios SEMED",
        category: "recompensa_especial",
        title,
        body,
        reward: {
          id: rewId,
          type: "medal",
          medalId,
          pointsAmount: proj.bonusXp,
          isSecret: false,
          claimed: false,
          itemData: {
            tournamentMedal: tourMedal,
            seasonId,
            stage: st,
            rank: row.rank,
            tier: proj.tier,
          },
        },
      });

      if (row.nick && row.nick.toLowerCase() !== row.playerId.toLowerCase()) {
        createInboxMessage({
          recipientId: row.nick,
          sender: "adm",
          senderName: "Coordenação de Torneios SEMED",
          category: "recompensa_especial",
          title,
          body,
          reward: {
            id: `${rewId}_nick`,
            type: "medal",
            medalId,
            pointsAmount: proj.bonusXp,
            isSecret: false,
            claimed: false,
            itemData: {
              tournamentMedal: tourMedal,
              seasonId,
              stage: st,
              rank: row.rank,
              tier: proj.tier,
            },
          },
        });
      }

      try {
        await grantPlayerTournamentMedal(tourMedal);
      } catch {
        /* ignore */
      }

      podiumSummary[st].push(`Top ${row.rank}: ${row.nick} (${row.tournamentPoints ?? row.bestScore} pts)`);
      totalMedalsAwarded++;
    }
  }

  return { totalMedalsAwarded, podiumSummary };
}

/**
 * Conclui e consolida a temporada de ranqueada e concede as medalhas legítimas aos Top 5 vencedores.
 */
export async function finalizeWeeklyTournamentSeason(pastStore: WeeklyTournamentStore): Promise<void> {
  const cfg = loadAdminConfig();
  await finalizeRankedSeasonAndAwardMedalsViaInbox(pastStore.seasonId ?? cfg.rankedSeasonId ?? 1, pastStore);
}

function loadTournamentStore(now = new Date()): WeeklyTournamentStore {
  const cfg = loadAdminConfig();
  const currentSeasonId = cfg.rankedSeasonId ?? 1;
  const { weekKey, weekIndex } = getWeekInfo(now);
  const activeGame = resolveWeeklyTournamentGame(
    weekIndex,
    cfg.tournamentGameOverride,
    cfg.enabledGames,
  );

  const baseRecords: Record<string, TournamentPlayerRecord> = {};

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(TOURNAMENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WeeklyTournamentStore>;
        // Se pertencer a uma temporada anterior, nova temporada inicia com registros limpos
        if (typeof parsed.seasonId === "number" && parsed.seasonId < currentSeasonId) {
          // Registros da temporada anterior são descartados do armazenamento local ativo
        } else {
          // Temporada corrente: preserva integralmente os registros
          if (parsed.records) {
            Object.assign(baseRecords, parsed.records);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Localizador de registros correspondentes por ID, nick ou apelido normalizado
  const findMatchingRecords = (
    records: Record<string, TournamentPlayerRecord>,
    identifiers: (string | undefined | null)[],
  ): { key: string; record: TournamentPlayerRecord }[] => {
    const cleanList = identifiers
      .filter((s): s is string => Boolean(s && s.trim()))
      .map((s) => s.toLowerCase().trim());
    if (cleanList.length === 0) return [];

    const found: { key: string; record: TournamentPlayerRecord }[] = [];
    for (const [key, rec] of Object.entries(records)) {
      const kLower = key.toLowerCase().trim();
      const rId = (rec.playerId || "").toLowerCase().trim();
      const rNick = (rec.nick || "").toLowerCase().trim();
      if (
        cleanList.includes(kLower) ||
        cleanList.includes(rId) ||
        cleanList.includes(rNick)
      ) {
        found.push({ key, record: rec });
      }
    }
    return found;
  };

  // Mescla dinamicamente jogadores registrados no catálogo PlayFab unificado com pontuação ativa
  try {
    const reg = loadRegistry();
    const players = Object.values(reg)
      .map((a) => a?.profile)
      .filter((p): p is PlayerProfile => Boolean(p));
    for (const p of players) {
      const pId = p.id || p.nickNormalized;
      if (!pId || pId.startsWith("admin-system")) continue;
      const pts = Math.max(
        typeof p.tournamentPoints === "number" ? p.tournamentPoints : 0,
        typeof p.bestTournamentPoints === "number" ? p.bestTournamentPoints : 0,
      );

      const matched = findMatchingRecords(baseRecords, [
        p.id,
        p.nickNormalized,
        p.nick,
        p.playfabId,
      ]);

      // Alunos abaixo do Nível 3 (requisito do Torneio) não podem ter registro no Torneio Semanal
      if ((p.level ?? 1) < TOURNAMENT_MIN_LEVEL) {
        for (const m of matched) {
          delete baseRecords[m.key];
        }
        continue;
      }

      const existingBestPts = matched.reduce(
        (max, m) => Math.max(max, m.record.tournamentPoints ?? 0),
        0,
      );
      const existingRecord = matched[0]?.record;

      if (pts > 0 || (p.dailyTournamentEntries ?? 0) > 0 || matched.length > 0) {
        const pAge = p.birthdate ? ageFrom(p.birthdate, now) : 10;
        const pStage = p.birthdate
          ? stageFromBirthdate(p.birthdate, now, p.school).id
          : "etapa_1";
        const bestPts = Math.max(pts, existingBestPts);
        const rank = getTournamentRank(bestPts).currentRank;
        const recKey = p.nickNormalized || p.id;

        // Unificação determinística: limpa duplicatas com pontuações obsoletas para o mesmo aluno
        for (const m of matched) {
          if (m.key !== recKey) {
            delete baseRecords[m.key];
          }
        }

        baseRecords[recKey] = {
          playerId: recKey,
          nick: p.nick,
          fullName: p.full_name,
          school: p.school,
          birthdate: p.birthdate,
          age: pAge,
          stage: pStage,
          level: p.level,
          bestScore: Math.max(existingRecord?.bestScore ?? 0, (typeof p.tournamentPoints === "number" ? p.tournamentPoints : 0)),
          totalEntries: Math.max(existingRecord?.totalEntries ?? 0, p.dailyTournamentEntries ?? 1),
          tournamentPoints: bestPts,
          dailyWinsCount: existingRecord?.dailyWinsCount ?? 0,
          dailyMatchesCount: existingRecord?.dailyMatchesCount ?? p.dailyTournamentEntries ?? 0,
          dailyDateKey: existingRecord?.dailyDateKey ?? p.dailyXpDate,
          dailyBonusAwarded: existingRecord?.dailyBonusAwarded ?? false,
          highestRankId: rank.id,
          activeTop5Since: existingRecord?.activeTop5Since ?? null,
          accumulatedTop5Ms: existingRecord?.accumulatedTop5Ms ?? 0,
          updatedAt: existingRecord?.updatedAt ?? now.getTime(),
        };
      }
    }

    // Expurgar qualquer registro remanescente de alunos abaixo do Nível 3
    for (const [key, rec] of Object.entries(baseRecords)) {
      if ((rec.level ?? 1) < TOURNAMENT_MIN_LEVEL) {
        delete baseRecords[key];
      }
    }
  } catch {
    /* ignore */
  }

  return {
    seasonId: currentSeasonId,
    weekKey,
    gameId: activeGame,
    records: baseRecords,
    updatedAt: now.getTime(),
  };
}

/**
 * Recupera o registro da ranqueada de um jogador diretamente do armazenamento do Torneio Semanal.
 * Realiza varredura inteligente por ID, apelido ou apelido normalizado, garantindo sempre a maior pontuação.
 */
export function getTournamentStoreRecord(
  playerId?: string | null,
  nick?: string | null,
): TournamentPlayerRecord | null {
  if (!playerId && !nick) return null;
  const store = loadTournamentStore();
  const cleanId = (playerId ?? "").toLowerCase().trim();
  const cleanNick = (nick ?? "").toLowerCase().trim();

  // Coleta todas as correspondências para este aluno
  const matches: TournamentPlayerRecord[] = [];
  for (const [key, rec] of Object.entries(store.records)) {
    const kLower = key.toLowerCase().trim();
    const rId = (rec.playerId || "").toLowerCase().trim();
    const rNick = (rec.nick || "").toLowerCase().trim();
    if (
      (cleanId && (kLower === cleanId || rId === cleanId || rNick === cleanId)) ||
      (cleanNick && (kLower === cleanNick || rNick === cleanNick || rId === cleanNick))
    ) {
      matches.push(rec);
    }
  }

  if (matches.length > 0) {
    // Retorna sempre a entrada com a maior pontuação ranqueada
    matches.sort(
      (a, b) =>
        (b.tournamentPoints ?? 0) - (a.tournamentPoints ?? 0) ||
        (b.bestScore ?? 0) - (a.bestScore ?? 0),
    );
    return matches[0];
  }

  if (cleanId && store.records[cleanId]) return store.records[cleanId];
  if (cleanNick && store.records[cleanNick]) return store.records[cleanNick];

  return null;
}

function saveTournamentStore(store: WeeklyTournamentStore) {
  if (typeof window === "undefined") return;
  store.updatedAt = Date.now();
  try {
    window.localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export async function syncWeeklyTournamentWithPlayFab(): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const titleId = getPlayFabTitleId();
  if (!titleId) return;

  // 1. Sincroniza o catálogo unificado de alunos (SEMED_STUDENT_ROSTER_V1) onde todos os perfis e pontuações já existem
  try {
    await syncStudentRosterFromPlayFab();
  } catch {
    /* ignore */
  }

  // 2. Prioriza o ticket administrativo de serviço para ter permissão global no SharedGroupData
  let ticket = await getAdminPlayFabTicket();
  if (!ticket) {
    const session = loadStoredSession();
    ticket = session?.sessionTicket ?? null;
  }
  if (!ticket) return;

  const cfg = loadAdminConfig();
  const seasonId = cfg.rankedSeasonId ?? 1;
  const store = loadTournamentStore();
  const groupId = getTournamentSeasonGroupId(seasonId);

  try {
    // 1. Assegura que o grupo compartilhado da temporada existe (ignora se já criado)
    await fetch(`https://${titleId}.playfabapi.com/Client/CreateSharedGroup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
    });

    // 2. Busca os competidores remotos no grupo oficial da temporada
    const getRes = await fetch(`https://${titleId}.playfabapi.com/Client/GetSharedGroupData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
    });
    const json = (await getRes.json()) as {
      data?: { Data?: Record<string, { Value: string }> };
    };

    let changed = false;
    let remoteRecords: Record<string, TournamentPlayerRecord> = {};
    if (json.data?.Data?.Standings?.Value) {
      try {
        remoteRecords = JSON.parse(json.data.Data.Standings.Value);
      } catch {
        remoteRecords = {};
      }
    }

    // Se for Temporada 1 e o grupo oficial ainda não tiver todos os dados, migra da chave semanal legada
    if (seasonId === 1) {
      try {
        const legacyGroupId = `TOURNAMENT_${store.weekKey.replace(/[^A-Z0-9_]/gi, "_")}`;
        const legacyRes = await fetch(`https://${titleId}.playfabapi.com/Client/GetSharedGroupData`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Authorization": ticket,
          },
          body: JSON.stringify({ TitleId: titleId, SharedGroupId: legacyGroupId }),
        });
        const legacyJson = (await legacyRes.json()) as {
          data?: { Data?: Record<string, { Value: string }> };
        };
        if (legacyJson.data?.Data?.Standings?.Value) {
          const legacyRecords = JSON.parse(legacyJson.data.Data.Standings.Value) as Record<
            string,
            TournamentPlayerRecord
          >;
          for (const [id, lr] of Object.entries(legacyRecords)) {
            const cur = remoteRecords[id];
            if (!cur || (lr.tournamentPoints ?? 0) > (cur.tournamentPoints ?? 0)) {
              remoteRecords[id] = lr;
              changed = true;
            }
          }
        }
      } catch {
        /* ignore legacy fallback error */
      }
    }

    const reg = loadRegistry();

    for (const [id, r] of Object.entries(remoteRecords)) {
      const matchKey = Object.keys(reg).find(
        (k) =>
          k.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.id?.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.nick?.toLowerCase() === r.nick?.toLowerCase() ||
          reg[k].profile.nickNormalized?.toLowerCase() === r.nick?.toLowerCase(),
      );
      const acc = matchKey ? reg[matchKey] : undefined;
      const effLevel = r.level ?? acc?.profile?.level ?? 1;

      // Alunos abaixo do Nível 3 são descartados e purgados do store
      if (effLevel < TOURNAMENT_MIN_LEVEL) {
        if (store.records[id]) {
          delete store.records[id];
          changed = true;
        }
        continue;
      }

      const existingKey = Object.keys(store.records).find(
        (k) =>
          k.toLowerCase() === id.toLowerCase() ||
          store.records[k].playerId?.toLowerCase() === id.toLowerCase() ||
          (r.nick && store.records[k].nick?.toLowerCase() === r.nick.toLowerCase()),
      );
      const targetKey = existingKey ?? id;
      const local = store.records[targetKey];
      const remotePts = r.tournamentPoints ?? 0;
      const localPts = local ? (local.tournamentPoints ?? 0) : 0;

      if (!local || remotePts >= localPts || r.updatedAt > local.updatedAt) {
        store.records[targetKey] = {
          ...(local ?? {}),
          ...r,
          tournamentPoints: Math.max(remotePts, localPts),
          bestScore: Math.max(r.bestScore ?? 0, local?.bestScore ?? 0),
        };
        changed = true;
      }
    }

    // Purga qualquer registro residual em store.records de alunos com level < TOURNAMENT_MIN_LEVEL
    for (const [id, r] of Object.entries(store.records)) {
      const matchKey = Object.keys(reg).find(
        (k) =>
          k.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.id?.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.nick?.toLowerCase() === r.nick?.toLowerCase() ||
          reg[k].profile.nickNormalized?.toLowerCase() === r.nick?.toLowerCase(),
      );
      const acc = matchKey ? reg[matchKey] : undefined;
      const effLevel = r.level ?? acc?.profile?.level ?? 1;
      if (effLevel < TOURNAMENT_MIN_LEVEL) {
        delete store.records[id];
        changed = true;
      }
    }

    const evaluated = evaluateTournamentStandings(store.records);
    store.records = evaluated.updatedRecords;
    saveTournamentStore(store);

    // 3. Atualiza o catálogo local de alunos no registro para sincronizar tournamentPoints e rankId
    let regUpdated = false;
    const rosterUpdatesForCloud: Record<string, string> = {};

    for (const [id, r] of Object.entries(store.records)) {
      const matchKey = Object.keys(reg).find(
        (k) =>
          k.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.id?.toLowerCase() === id.toLowerCase() ||
          reg[k].profile.nick?.toLowerCase() === r.nick.toLowerCase() ||
          reg[k].profile.nickNormalized?.toLowerCase() === r.nick.toLowerCase(),
      );
      if (matchKey) {
        const acc = reg[matchKey];
        const rPts = r.tournamentPoints ?? 0;
        if (rPts > (acc.profile.tournamentPoints ?? 0)) {
          acc.profile.tournamentPoints = rPts;
          acc.profile.bestTournamentPoints = Math.max(acc.profile.bestTournamentPoints ?? 0, rPts);
          acc.profile.tournamentRankId = getTournamentRank(rPts).currentRank.id;
          acc.updatedAt = new Date().toISOString();
          regUpdated = true;

          if (acc.profile.nickNormalized) {
            rosterUpdatesForCloud[getStudentRosterCloudKey(acc.profile)] = JSON.stringify({
              ...acc.profile,
              stats: acc.stats,
              updatedAt: acc.updatedAt,
            });
          }
        }
      }
    }
    if (regUpdated) {
      saveRegistry(reg);
    }

    // 4. Atualiza na nuvem com os dados mesclados
    await fetch(`https://${titleId}.playfabapi.com/Client/UpdateSharedGroupData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({
        TitleId: titleId,
        SharedGroupId: groupId,
        Data: { Standings: JSON.stringify(store.records) },
        Permission: "Public",
      }),
    });

    // Se temos credencial de ADM e houve atualização no catálogo de alunos, atualiza também o SEMED_STUDENT_ROSTER_V1
    const adminTicket = await getAdminPlayFabTicket();
    if (adminTicket && Object.keys(rosterUpdatesForCloud).length > 0) {
      try {
        await fetch(`https://${titleId}.playfabapi.com/Client/UpdateSharedGroupData`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Authorization": adminTicket,
          },
          body: JSON.stringify({
            TitleId: titleId,
            SharedGroupId: "SEMED_STUDENT_ROSTER_V1",
            Data: rosterUpdatesForCloud,
            Permission: "Public",
          }),
        });
      } catch {
        /* ignore roster sync error */
      }
    }

    // 5. Notifica todas as abas e componentes da tela em tempo real
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("desafios:weekly-tournament-updated", { detail: store }),
      );
    }
  } catch {
    /* ignore network errors */
  }
}

export function getWeeklyTournamentSnapshot(
  profile?: PlayerProfile | null,
  stageFilter?: AgeStageId | "TODAS",
) {
  const now = new Date();
  const cfg = loadAdminConfig();
  const currentSeasonId = cfg.rankedSeasonId ?? 1;
  const store = loadTournamentStore(now);
  const { weekKey, endsAtLabel: defaultWeekEnd } = getWeekInfo(now);
  const seasonEnd = cfg.rankedSeasonEndAt ? new Date(cfg.rankedSeasonEndAt) : null;
  const endsAtLabel =
    seasonEnd && !Number.isNaN(seasonEnd.getTime())
      ? `${seasonEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às 23:59`
      : defaultWeekEnd;
  const seasonLabel = `Temporada ${currentSeasonId}`;
  const playerStageInfo = profile
    ? stageFromBirthdate(profile.birthdate, now, profile.school)
    : AGE_STAGES[0];
  const effectiveStage: AgeStageId | "TODAS" = stageFilter ?? playerStageInfo.id;
  const evaluated = evaluateTournamentStandings(store.records, now.getTime(), effectiveStage);
  const myStageEvaluated = evaluateTournamentStandings(
    store.records,
    now.getTime(),
    playerStageInfo.id,
  );

  const todayKey = getLocalDateKey(now);
  const isToday = profile?.dailyXpDate === todayKey;
  const entriesUsedToday = isToday ? Math.max(0, profile?.dailyTournamentEntries ?? 0) : 0;
  const entriesRemainingToday = Math.max(0, TOURNAMENT_DAILY_ENTRIES_LIMIT - entriesUsedToday);
  const freeRemainingToday = Math.max(0, TOURNAMENT_DAILY_FREE_ENTRIES - entriesUsedToday);
  const paidRemainingToday = Math.max(0, TOURNAMENT_DAILY_ENTRIES_LIMIT - Math.max(entriesUsedToday, TOURNAMENT_DAILY_FREE_ENTRIES));
  const isFreeEntry = entriesUsedToday < TOURNAMENT_DAILY_FREE_ENTRIES;
  const extraXpEarnedToday = isToday ? Math.max(0, profile?.dailyTournamentXp ?? 0) : 0;
  const myStanding = profile
    ? (myStageEvaluated.allStandings.find(
        (s) =>
          s.playerId === profile.id ||
          s.playerId === profile.nickNormalized ||
          (s.nick && s.nick.toLowerCase() === profile.nick.toLowerCase()),
      ) ?? null)
    : null;

  const currentPoints = Math.max(
    0,
    myStanding?.tournamentPoints ?? profile?.tournamentPoints ?? 0,
  );
  const rankInfo = getTournamentRank(currentPoints);
  const canAffordPaid = currentPoints >= TOURNAMENT_PAID_ENTRY_COST;
  const canStartMatch = Boolean(
    (profile?.isAdmin || (profile?.level ?? 1) >= TOURNAMENT_MIN_LEVEL) &&
      (isFreeEntry ? freeRemainingToday > 0 : paidRemainingToday > 0 && canAffordPaid),
  );

  const eventBonuses = getActiveEventBonuses(
    store.gameId,
    1000,
    20,
    undefined,
    undefined,
    undefined,
    true,
  );
  const rankedMultiplier = eventBonuses.rankedMultiplier ?? 1;

  return {
    weekKey,
    seasonLabel,
    seasonId: currentSeasonId,
    endsAtLabel,
    gameId: store.gameId,
    gameName: GAME_NAMES[store.gameId] ?? store.gameId,
    playerStage: playerStageInfo,
    selectedStage: effectiveStage,
    top5: evaluated.top5,
    allStandings: evaluated.allStandings,
    myStanding,
    entriesUsedToday,
    entriesRemainingToday,
    freeRemainingToday,
    paidRemainingToday,
    isFreeEntry,
    canAffordPaid,
    canStartMatch,
    paidCost: TOURNAMENT_PAID_ENTRY_COST,
    rankedMultiplier,
    extraXpEarnedToday,
    canEnterLevel: Boolean(profile?.isAdmin || (profile?.level ?? 1) >= TOURNAMENT_MIN_LEVEL),
    tournamentPoints: currentPoints,
    rankInfo,
  };
}

/**
 * Deduz 5 pontos ranqueados para autorizar uma entrada paga extra.
 */
export async function spendPaidTournamentEntry(playerId: string, cost = TOURNAMENT_PAID_ENTRY_COST) {
  return deductPaidTournamentPoints(playerId, cost);
}

/**
 * Registra o resultado da partida ranqueada:
 * - Base = 10 pontos
 * - Cada erro comete descontos = -1 ponto
 * - Piso mínimo garantido por partida concluída = 1 ponto: Math.max(1, 10 - wrong)
 * - Multiplicador de eventos especiais: Math.round(basePoints * rankedMultiplier)
 * - Bônus de 10 partidas perfeitas sem erro no dia = +25 pontos
 * - Trava no zero: nunca desce abaixo de 0 pontos (Bronze I)
 */
export async function recordWeeklyTournamentAttempt(args: {
  profile: PlayerProfile;
  score: number;
  correct?: number;
  wrong?: number;
}): Promise<{
  standing: TournamentStandingRow | null;
  awardedMedal: TournamentMedal | null;
  pointsDelta: number;
  newTournamentPoints: number;
  currentRank: TournamentRankDefinition;
  dailyBonusAwarded: boolean;
}> {
  const pId = args.profile.id.toLowerCase();
  if (pId === "admin-system" || pId.startsWith("admin-system")) {
    const curRank = getTournamentRank(0).currentRank;
    return {
      standing: null,
      awardedMedal: null,
      pointsDelta: 0,
      newTournamentPoints: 0,
      currentRank: curRank,
      dailyBonusAwarded: false,
    };
  }

  const nowMs = Date.now();
  const nowDate = new Date(nowMs);
  const todayKey = getLocalDateKey(nowDate);
  const store = loadTournamentStore(nowDate);
  const safeScore = Math.max(0, Math.floor(args.score));
  const safeCorrect = Math.max(0, args.correct ?? 0);
  const safeWrong = Math.max(0, args.wrong ?? 0);
  const won = isMatchVictory(safeScore, safeCorrect, safeWrong);

  const existing = store.records[args.profile.id];
  const pAge = ageFrom(args.profile.birthdate, nowDate);
  const pStage = stageFromBirthdate(args.profile.birthdate, nowDate, args.profile.school);

  // Regra de pontuação ranqueada:
  // Base 10 pontos, -1 ponto por erro cometido. Piso mínimo de 1 ponto ao concluir.
  const baseEarned = Math.max(1, 10 - safeWrong);
  const eventBonuses = getActiveEventBonuses(
    store.gameId,
    1000,
    20,
    undefined,
    undefined,
    undefined,
    true,
  );
  const rankedMultiplier = Math.max(1, eventBonuses.rankedMultiplier ?? 1);
  const matchPoints = Math.round(baseEarned * rankedMultiplier);
  let pointsDelta = matchPoints;

  // Acompanhamento do bônus diário de 10 partidas sem nenhum erro (10 perfeitas)
  const isSameDay = existing?.dailyDateKey === todayKey;
  const currentDailyMatches = isSameDay ? (existing?.dailyMatchesCount ?? 0) : 0;
  const currentDailyFlawless = isSameDay ? (existing?.dailyWinsCount ?? 0) : 0;
  const isFlawless = safeWrong === 0;
  const nextDailyMatches = currentDailyMatches + 1;
  const nextDailyWins = currentDailyFlawless + (isFlawless ? 1 : 0);
  let dailyBonusAwarded = false;

  if (nextDailyMatches === 10 && nextDailyWins === 10 && !existing?.dailyBonusAwarded) {
    pointsDelta += 25;
    dailyBonusAwarded = true;
  }

  const curPoints = Math.max(0, existing?.tournamentPoints ?? args.profile.tournamentPoints ?? 0);
  const newTournamentPoints = Math.max(0, curPoints + pointsDelta);
  const rankInfo = getTournamentRank(newTournamentPoints);

  store.records[args.profile.id] = {
    playerId: args.profile.id,
    nick: args.profile.nick,
    fullName: args.profile.full_name,
    school: args.profile.school,
    birthdate: args.profile.birthdate,
    age: pAge,
    stage: pStage.id,
    level: args.profile.level,
    bestScore: Math.max(existing?.bestScore ?? 0, safeScore),
    totalEntries: (existing?.totalEntries ?? 0) + 1,
    tournamentPoints: newTournamentPoints,
    dailyWinsCount: nextDailyWins,
    dailyMatchesCount: nextDailyMatches,
    dailyDateKey: todayKey,
    dailyBonusAwarded: dailyBonusAwarded || (isSameDay ? (existing?.dailyBonusAwarded ?? false) : false),
    highestRankId: rankInfo.currentRank.id,
    activeTop5Since: existing?.activeTop5Since ?? null,
    accumulatedTop5Ms: existing?.accumulatedTop5Ms ?? 0,
    updatedAt: nowMs,
  };

  const evaluated = evaluateTournamentStandings(store.records, nowMs, pStage.id);
  store.records = evaluated.updatedRecords;
  saveTournamentStore(store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("desafios:weekly-tournament-updated", { detail: store }),
    );
  }
  void syncWeeklyTournamentWithPlayFab();

  const myRow =
    evaluated.allStandings.find(
      (s) =>
        s.playerId === args.profile.id ||
        s.playerId === args.profile.nickNormalized ||
        (s.nick && s.nick.toLowerCase() === args.profile.nick.toLowerCase()),
    ) ?? null;
  let awardedMedal: TournamentMedal | null = null;

  // Projeção do Top 5 da etapa durante a semana em andamento:
  // A concessão e gravação oficial da medalha no perfil ocorre exclusivamente no encerramento de temporada aos domingos às 23:59.
  if (myRow && myRow.rank <= 5) {
    awardedMedal = {
      id: `projected_${store.weekKey}_${pStage.id}_r${myRow.rank}`,
      weekKey: store.weekKey,
      gameId: store.gameId,
      rank: myRow.rank,
      tier: myRow.projectedMedal.tier,
      label: `${myRow.projectedMedal.emoji} Top ${myRow.rank} ${pStage.shortLabel} (${GAME_NAMES[store.gameId]})`,
      heldMinutes: myRow.holdMinutes,
      bonusXpAwarded: 0,
      earnedAt: new Date(nowMs).toISOString(),
    };
  }

  // Atualiza pontos do torneio no perfil local
  args.profile.tournamentPoints = newTournamentPoints;
  args.profile.tournamentRankId = rankInfo.currentRank.id;
  args.profile.bestTournamentPoints = Math.max(
    args.profile.bestTournamentPoints ?? 0,
    newTournamentPoints,
  );

  return {
    standing: myRow,
    awardedMedal,
    pointsDelta,
    newTournamentPoints,
    currentRank: rankInfo.currentRank,
    dailyBonusAwarded,
  };
}

/**
 * Remove o jogador do armazenamento local e rankings do torneio semanal (usado ao excluir ou mover para a lixeira).
 */
export function removePlayerFromTournament(playerId: string, playerNick?: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (!store?.records) return;

    let changed = false;
    const normNick = playerNick?.trim().toLowerCase();

    for (const [key, rec] of Object.entries(store.records as Record<string, TournamentPlayerRecord>)) {
      if (
        rec.playerId === playerId ||
        key === playerId ||
        (normNick && rec.nick.trim().toLowerCase() === normNick)
      ) {
        delete store.records[key];
        changed = true;
      }
    }

    if (changed) {
      saveTournamentStore(store);
      window.dispatchEvent(new CustomEvent("desafios:weekly-tournament-updated", { detail: store }));
    }
  } catch {
    /* ignore */
  }
}
