// Torneio Semanal Ranqueado (Nível 3+)
// 1 Jogo por semana, limite de 10 entradas diárias (+100 XP extras/dia),
// Ranking Top 5 com Bônus de Permanência ("quem se mantiver na colocação por mais tempo")
// e sistema de Medalhas de Torneio engatilhado.

import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import { safeLocalStorageSet } from "./storage-guard.ts";
import { normalizeCardPackId } from "./chests-catalog.ts";
import { creditCoinMetrics } from "./career-points.ts";
import {
  loadAdminConfig,
  resolveTournamentPodiumRewards,
  saveAdminConfig,
  type RankedMilestoneReward,
  type TournamentPodiumRank,
} from "./game-codes.ts";
import {
  grantPlayerTournamentMedal,
  grantTournamentMedalsBatchToPlayers,
  deductPaidTournamentPoints,
  getAdminPlayFabTicket,
  getAllRegisteredPlayers,
  getAuthoritativeDateKey,
  getAuthoritativeNow,
  getPlayFabTitleId,
  isBlockedRealPlayFabCallInTest,
  isPlayFabConfigured,
  loadStoredSession,
  syncStudentRosterFromPlayFab,
  loadRegistry,
  loadRegistryReadOnly,
  saveRegistry,
  getStudentRosterCloudKey,
  type PlayerProfile,
} from "./playfab.ts";
import { createInboxMessage, type InboxReward, type SystemInboxMessage } from "./inbox-messages.ts";
import {
  getActiveEventBonuses,
  type SpecialEvent,
  type RecurringEvent,
} from "./custom-events.ts";
import { formatOfficialCoariDate } from "./season-cycle.ts";
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
  nickSlug,
  stageForPlayer,
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
import { recordScoreLedgerEntry } from "./score-history-ledger.ts";

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
    borderColor: "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)]",
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

export const TOURNAMENT_PLAYER_KEY_PREFIX = "rnk_";

/** Chave individual isolada por jogador dentro do SharedGroup `TOURNAMENT_SEASON_N` (evita sobrescrita entre dispositivos). */
export function getTournamentPlayerCloudKey(identifier: string): string {
  const clean = nickSlug(identifier || "desconhecido") || "desconhecido";
  return `${TOURNAMENT_PLAYER_KEY_PREFIX}${clean}`;
}

/**
 * Faz o parse unificado de todos os registros de `TOURNAMENT_SEASON_N`:
 * - Lê primeiro a chave legada `Standings` (somente leitura, retrocompatibilidade).
 * - Sobrepõe com todas as chaves individuais `rnk_<slug>` (fonte canônica isolada por jogador).
 */
export function parseTournamentSharedGroupRecords(
  groupData?: Record<string, { Value?: string }> | null,
): {
  records: Record<string, TournamentPlayerRecord>;
  perPlayerKeys: Set<string>;
} {
  const records: Record<string, TournamentPlayerRecord> = {};
  const perPlayerKeys = new Set<string>();
  if (!groupData || typeof groupData !== "object") {
    return { records, perPlayerKeys };
  }

  // 1. Leitura retrocompatível da chave monolítica legada `Standings` (nunca mais sobrescrita por clientes)
  const legacyRaw = groupData.Standings?.Value;
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as Record<string, TournamentPlayerRecord>;
      if (parsed && typeof parsed === "object") {
        for (const [id, rec] of Object.entries(parsed)) {
          if (!rec || typeof rec !== "object") continue;
          const canonical = nickSlug(rec.nick || rec.playerId || id) || id.toLowerCase().trim();
          if (!canonical) continue;
          const prev = records[canonical];
          if (!prev || (rec.tournamentPoints ?? 0) > (prev.tournamentPoints ?? 0)) {
            records[canonical] = { ...rec, playerId: canonical };
          }
        }
      }
    } catch {
      /* ignore invalid legacy JSON */
    }
  }

  // 2. Leitura autoritativa das chaves individuais `rnk_<slug>` (sempre prevalecem sobre o legado)
  for (const [key, item] of Object.entries(groupData)) {
    if (!key.startsWith(TOURNAMENT_PLAYER_KEY_PREFIX) || !item?.Value) continue;
    try {
      const rec = JSON.parse(item.Value) as TournamentPlayerRecord;
      if (!rec || typeof rec !== "object") continue;
      const slugFromKey = key.slice(TOURNAMENT_PLAYER_KEY_PREFIX.length);
      const canonical = nickSlug(rec.nick || rec.playerId || slugFromKey) || slugFromKey;
      if (!canonical) continue;
      records[canonical] = { ...rec, playerId: canonical };
      perPlayerKeys.add(canonical);
    } catch {
      /* ignore malformed per-player entry */
    }
  }

  return { records, perPlayerKeys };
}

export interface WeeklyTournamentStore {
  seasonId?: number;
  weekKey: string;
  gameId: GameId;
  records: Record<string, TournamentPlayerRecord>;
  updatedAt: number;
}

/**
 * Computes a deterministic ISO-8601 Monday-to-Sunday week key (`YYYY-Www`),
 * flipping cleanly Sunday 23:59 -> Monday 00:00 without splitting across Dec 31 / Jan 1.
 */
export function getWeekInfo(now = new Date()): {
  weekKey: string;
  weekIndex: number;
  endsAtLabel: string;
} {
  // Fuso horário oficial de Coari (UTC-4), garantindo transição consistente Domingo 23:59 -> Segunda 00:00 Coari
  const coariShifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const cYear = coariShifted.getUTCFullYear();
  const cMonth = coariShifted.getUTCMonth();
  const cDate = coariShifted.getUTCDate();

  // ISO-8601 anchored to Thursday of the current Monday-Sunday week
  const d = new Date(Date.UTC(cYear, cMonth, cDate));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const weekKey = `${isoYear}-W${String(weekNum).padStart(2, "0")}`;

  // Índice contínuo de semanas desde a segunda-feira ISO 1969-12-29 (evita salto de paridade em anos ISO de 52 semanas)
  const mondayUtcMs = Date.UTC(cYear, cMonth, cDate - (dayNum - 1));
  const EPOCH_MONDAY_MS = Date.UTC(1969, 11, 29);
  const weekIndex = Math.floor((mondayUtcMs - EPOCH_MONDAY_MS) / (7 * 86_400_000));

  // Current week's Sunday 23:59 Coari
  const daysUntilSunday = 7 - dayNum;
  const end = new Date(Date.UTC(cYear, cMonth, cDate + daysUntilSunday));
  const dd = String(end.getUTCDate()).padStart(2, "0");
  const mm = String(end.getUTCMonth() + 1).padStart(2, "0");
  const endsAtLabel = `${dd}/${mm} às 23:59`;

  return {
    weekKey,
    weekIndex,
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
  const findAccForRecord = (rec: TournamentPlayerRecord) => {
    const pId = rec.playerId.toLowerCase();
    const pNick = (rec.nick || "").toLowerCase();
    return (
      reg[pId] ||
      reg[pNick] ||
      Object.values(reg).find((a) => a?.profile?.nick?.toLowerCase() === pNick)
    );
  };
  const list = Object.values(recordsMap)
    .filter((rec) => {
      if (!rec || !rec.playerId) return false;
      const pId = rec.playerId.toLowerCase();
      if (pId === "admin-system" || pId.startsWith("admin-system")) return false;
      // Requisito oficial do Torneio Semanal Ranqueado: Nível 3+
      const foundAcc = findAccForRecord(rec);
      const effLevel = rec.level ?? foundAcc?.profile?.level ?? 1;
      if (effLevel < TOURNAMENT_MIN_LEVEL) return false;
      return true;
    })
    .map((rec) => {
      const foundAcc = findAccForRecord(rec);
      const effLevel = rec.level ?? foundAcc?.profile?.level ?? 1;
      const resolvedAge =
        rec.age ?? (rec.birthdate ? ageFrom(rec.birthdate, new Date(nowMs)) : 10);
      const resolvedStage: AgeStageId =
        rec.stage ??
        stageForPlayer(
          rec.school,
          rec.birthdate,
          new Date(nowMs),
          foundAcc?.profile?.ageStage,
        ).id;
      const stInfo = getAgeStageInfo(resolvedStage);
      const { holdMinutes, holdBonusPoints } = computeTop5HoldMetrics(rec, nowMs);
      const tourPoints = resolveCanonicalTournamentPoints({
        level: effLevel,
        isAdmin: Boolean(foundAcc?.profile?.isAdmin),
        tournamentPoints: foundAcc?.profile?.tournamentPoints,
        bestTournamentPoints: foundAcc?.profile?.bestTournamentPoints,
        record: rec,
      });
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
  options?: { deferTrophyGrant?: boolean },
): Promise<{
  totalMedalsAwarded: number;
  podiumSummary: Record<string, string[]>;
  createdMessages: SystemInboxMessage[];
  autoTrophyGrants: Array<{ playerId: string; nick?: string; medal: TournamentMedal }>;
}> {
  const store = pastStore ?? loadTournamentStore();
  const cfg = loadAdminConfig();
  const podiumRewards = resolveTournamentPodiumRewards(cfg.tournamentPodiumRewards);
  const stages: AgeStageId[] = ["etapa_1", "etapa_2", "etapa_3"];
  let totalMedalsAwarded = 0;
  const podiumSummary: Record<string, string[]> = {};
  const autoTrophyGrants: Array<{ playerId: string; nick?: string; medal: TournamentMedal }> = [];
  const createdMessages: SystemInboxMessage[] = [];

  if (!store || !store.records || Object.keys(store.records).length === 0) {
    return { totalMedalsAwarded: 0, podiumSummary, createdMessages, autoTrophyGrants };
  }

  for (const st of stages) {
    const evaluated = evaluateTournamentStandings(store.records, store.updatedAt, st);
    const winners = evaluated.top5.filter((r) => r.rank <= 5);
    podiumSummary[st] = [];

    for (const row of winners) {
      const rankKey = Math.min(5, Math.max(1, row.rank)) as TournamentPodiumRank;
      const slot = podiumRewards[rankKey];
      const proj = projectedMedalForRank(row.rank, row.holdMinutes);

      const tourMedal: TournamentMedal = {
        id: `medal_season_${seasonId}_${st}_r${row.rank}`,
        weekKey: `Season_${seasonId}`,
        gameId: store.gameId,
        rank: row.rank,
        tier: proj.tier,
        label: `${proj.emoji} Top ${row.rank} ${row.stageLabel} (Temporada ${seasonId})`,
        heldMinutes: row.holdMinutes,
        bonusXpAwarded: 0,
        earnedAt: new Date(store.updatedAt).toISOString(),
      };

      // Troféus (Top 3) e histórico Top 5 são aplicados automaticamente no perfil + Roster na nuvem
      autoTrophyGrants.push({
        playerId: row.playerId,
        nick: row.nick,
        medal: tourMedal,
      });

      const rewBaseId = `rew_rnk_s${seasonId}_${st}_r${row.rank}`;
      const rewardsList: InboxReward[] = [];

      if (slot.medalId) {
        rewardsList.push({
          id: `${rewBaseId}_medal`,
          type: "medal",
          medalId: slot.medalId,
          isSecret: false,
          claimed: false,
          itemData: {
            seasonId,
            stage: st,
            rank: row.rank,
            tier: proj.tier,
          },
        });
      }
      if (slot.xp > 0) {
        rewardsList.push({
          id: `${rewBaseId}_xp`,
          type: "xp",
          pointsAmount: slot.xp,
          isSecret: false,
          claimed: false,
        });
      }
      if (slot.points > 0) {
        rewardsList.push({
          id: `${rewBaseId}_points`,
          type: "points",
          pointsAmount: slot.points,
          isSecret: false,
          claimed: false,
        });
      }
      if (slot.coins > 0) {
        rewardsList.push({
          id: `${rewBaseId}_coins`,
          type: "coins",
          pointsAmount: slot.coins,
          isSecret: false,
          claimed: false,
        });
      }
      for (let i = 0; i < slot.items.length; i++) {
        const item = slot.items[i];
        rewardsList.push({
          id: `${rewBaseId}_item_${i}`,
          type: "future_item",
          isSecret: false,
          claimed: false,
          itemData: {
            itemCategory: item.itemCategory,
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity,
            ...(item.cosmeticKind ? { cosmeticKind: item.cosmeticKind } : {}),
          },
        });
      }

      const title =
        row.rank === 1
          ? `🏆 Campeão da Temporada ${seasonId} do Torneio Mensal!`
          : row.rank === 2
          ? `🥈 Vice-Campeão da Temporada ${seasonId} do Torneio Mensal!`
          : row.rank === 3
          ? `🥉 3º Lugar da Temporada ${seasonId} do Torneio Mensal!`
          : `🎖️ Top ${row.rank} de Elite da Temporada ${seasonId} do Torneio Mensal!`;

      const trophyNotice =
        row.rank === 1
          ? " Seu Troféu de Ouro do Torneio Mensal já foi aplicado automaticamente no seu perfil!"
          : row.rank === 2
          ? " Seu Troféu de Prata do Torneio Mensal já foi aplicado automaticamente no seu perfil!"
          : row.rank === 3
          ? " Seu Troféu de Bronze do Torneio Mensal já foi aplicado automaticamente no seu perfil!"
          : "";

      const collectNotice =
        rewardsList.length > 0
          ? " Resgate abaixo suas recompensas oficiais desta colocação."
          : "";

      const body =
        row.rank === 1
          ? `Parabéns pelo feito extraordinário! Você conquistou o 1º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Torneio Mensal Ranqueado da SEMED Coari.${trophyNotice}${collectNotice}`
          : row.rank === 2
          ? `Parabéns pela grande conquista! Você conquistou o 2º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Torneio Mensal Ranqueado da SEMED Coari.${trophyNotice}${collectNotice}`
          : row.rank === 3
          ? `Parabéns pelo pódio! Você garantiu o 3º Lugar na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Torneio Mensal Ranqueado da SEMED Coari.${trophyNotice}${collectNotice}`
          : `Parabéns! Você alcançou o Top ${row.rank} na sua etapa (${row.stageLabel}) durante a Temporada ${seasonId} do Torneio Mensal Ranqueado da SEMED Coari, consolidando-se entre os melhores competidores da rede municipal!${collectNotice}`;

      const msgId = `msg_rnk_s${seasonId}_${st}_r${row.rank}`;
      const msg = createInboxMessage({
        id: msgId,
        recipientId: row.playerId,
        recipientFilter: {
          targetStudentIds: Array.from(new Set([row.playerId, ...(row.nick ? [row.nick] : [])])),
        },
        sender: "adm",
        senderName: "Coordenação de Torneios SEMED",
        category: "recompensa_especial",
        title,
        body,
        ...(rewardsList.length > 0
          ? {
              reward: rewardsList[0],
              rewards: rewardsList,
            }
          : {}),
      });
      createdMessages.push(msg);

      podiumSummary[st].push(`Top ${row.rank}: ${row.nick} (${row.tournamentPoints ?? row.bestScore} pts)`);
      totalMedalsAwarded++;
    }
  }

  // Inclui as cartas criadas em AdminConfig.inboxMessages para sincronização na nuvem PlayFab
  if (createdMessages.length > 0) {
    try {
      const liveCfg = loadAdminConfig();
      const existingList = Array.isArray(liveCfg.inboxMessages) ? liveCfg.inboxMessages : [];
      const existingIds = new Set(existingList.map((m) => m.id));
      const newOnes = createdMessages.filter((m) => !existingIds.has(m.id));
      if (newOnes.length > 0) {
        saveAdminConfig({
          ...liveCfg,
          inboxMessages: [...newOnes, ...existingList],
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (!options?.deferTrophyGrant) {
    // Aplica os troféus/pódios automaticamente nos perfis locais e no Roster da nuvem PlayFab
    try {
      await grantTournamentMedalsBatchToPlayers(autoTrophyGrants);
    } catch {
      /* ignore */
    }

    // Fallback para sessão ativa caso o vencedor não estivesse mapeado na lista do registro
    try {
      const activeSession = loadStoredSession();
      const sessionPid = activeSession?.playerId?.toLowerCase().trim();
      if (sessionPid) {
        for (const g of autoTrophyGrants) {
          if (
            sessionPid === g.playerId.toLowerCase().trim() ||
            (g.nick && sessionPid === g.nick.toLowerCase().trim())
          ) {
            await grantPlayerTournamentMedal(g.medal);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { totalMedalsAwarded, podiumSummary, createdMessages, autoTrophyGrants };
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
    const reg = loadRegistryReadOnly();
    const hasBaseRecords = Object.keys(baseRecords).length > 0;
    const players = Object.values(reg)
      .map((a) => a?.profile)
      .filter((p): p is PlayerProfile => Boolean(p));
    for (const p of players) {
      const pId = p.id || p.nickNormalized;
      if (!pId || pId.startsWith("admin-system")) continue;
      const pts = resolveCanonicalTournamentPoints({
        level: p.level,
        isAdmin: Boolean(p.isAdmin),
        tournamentPoints: p.tournamentPoints,
        bestTournamentPoints: p.bestTournamentPoints,
      });

      if (!hasBaseRecords && pts === 0 && (p.dailyTournamentEntries ?? 0) === 0) {
        continue;
      }

      const matched = hasBaseRecords
        ? findMatchingRecords(baseRecords, [
            p.id,
            p.nickNormalized,
            p.nick,
            p.playfabId,
          ])
        : [];

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
        const pStageInfo = stageForPlayer(p.school, p.birthdate, now, p.ageStage);
        const pStage = pStageInfo.id;
        const pAge = p.birthdate ? ageFrom(p.birthdate, now) : pStageInfo.minAge;
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
          fullName: "",
          school: p.school,
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

export interface CanonicalTournamentPointsInput {
  level?: number;
  isAdmin?: boolean;
  tournamentPoints?: number | null;
  bestTournamentPoints?: number | null;
  record?: {
    level?: number;
    tournamentPoints?: number | null;
  } | null;
}

/**
 * Fonte única de verdade para a pontuação ranqueada exibida no ranking e nos perfis.
 * - Nível abaixo do mínimo (3) para contas não-ADM sempre retorna 0 pontos.
 * - Nunca utiliza `bestScore` (pontuação bruta de jogo) como pontuação ranqueada.
 * - Usa o maior valor legítimo entre registro do torneio e perfil, sem restaurar `bestTournamentPoints`
 *   quando já existe `tournamentPoints` numérico explícito.
 */
export function resolveCanonicalTournamentPoints(
  input: CanonicalTournamentPointsInput,
): number {
  const rawLevel = input.level ?? input.record?.level;
  if (!input.isAdmin && typeof rawLevel === "number" && rawLevel < TOURNAMENT_MIN_LEVEL) {
    return 0;
  }

  const recPts =
    typeof input.record?.tournamentPoints === "number"
      ? Math.max(0, input.record.tournamentPoints)
      : null;
  const profPts =
    typeof input.tournamentPoints === "number"
      ? Math.max(0, input.tournamentPoints)
      : null;

  const currentPts = Math.max(recPts ?? 0, profPts ?? 0);
  if (currentPts > 0) return currentPts;

  if (recPts === null && profPts === null) {
    return Math.max(0, input.bestTournamentPoints ?? 0);
  }
  return 0;
}

/**
 * Atualiza a pontuação ranqueada no armazenamento local do torneio (ex: dedução de entrada paga)
 * preservando a paridade entre perfil e lista de ranking.
 */
export function deductTournamentRecordPoints(
  playerId: string,
  newPoints: number,
  nick?: string,
): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.floor(newPoints));
  const nowMs = Date.now();
  const store = loadTournamentStore(new Date(nowMs));
  const cleanId = playerId.toLowerCase().trim();
  const cleanNick = (nick ?? "").toLowerCase().trim();
  let updated = false;

  let lastUpdatedRec: TournamentPlayerRecord | null = null;
  for (const [key, rec] of Object.entries(store.records)) {
    const kLower = key.toLowerCase().trim();
    const rId = (rec.playerId || "").toLowerCase().trim();
    const rNick = (rec.nick || "").toLowerCase().trim();
    if (
      (cleanId && (kLower === cleanId || rId === cleanId || rNick === cleanId)) ||
      (cleanNick && (kLower === cleanNick || rNick === cleanNick || rId === cleanNick))
    ) {
      rec.tournamentPoints = clamped;
      rec.highestRankId = getTournamentRank(clamped).currentRank.id;
      rec.updatedAt = nowMs;
      lastUpdatedRec = { ...rec };
      updated = true;
    }
  }

  if (updated) {
    saveTournamentStore(store);
    window.dispatchEvent(
      new CustomEvent("desafios:weekly-tournament-updated", { detail: store }),
    );
    if (lastUpdatedRec) {
      void pushSingleTournamentPlayerToPlayFab(lastUpdatedRec);
    }
  }
}

let cachedTourLookupRaw: string | null = null;
let cachedTourLookupRegRaw: string | null = null;
let cachedTourLookupSeasonId: number | null = null;
let cachedTourLookupMap: Map<string, TournamentPlayerRecord> | null = null;

function isBetterTournamentRecord(
  candidate: TournamentPlayerRecord,
  existing?: TournamentPlayerRecord,
): boolean {
  if (!existing) return true;
  const candPts = candidate.tournamentPoints ?? 0;
  const exPts = existing.tournamentPoints ?? 0;
  if (candPts !== exPts) return candPts > exPts;
  return (candidate.bestScore ?? 0) > (existing.bestScore ?? 0);
}

function getTournamentLookupMap(): Map<string, TournamentPlayerRecord> {
  const rawTour =
    typeof window !== "undefined" ? window.localStorage.getItem(TOURNAMENT_STORAGE_KEY) : null;
  const rawReg =
    typeof window !== "undefined"
      ? window.localStorage.getItem("desafios-playfab-registry-v1")
      : null;
  const currentSeasonId = loadAdminConfig().rankedSeasonId ?? 1;

  if (
    cachedTourLookupMap &&
    rawTour === cachedTourLookupRaw &&
    rawReg === cachedTourLookupRegRaw &&
    currentSeasonId === cachedTourLookupSeasonId
  ) {
    return cachedTourLookupMap;
  }

  const store = loadTournamentStore();
  const map = new Map<string, TournamentPlayerRecord>();
  for (const [key, rec] of Object.entries(store.records)) {
    const kLower = key.toLowerCase().trim();
    const rId = (rec.playerId || "").toLowerCase().trim();
    const rNick = (rec.nick || "").toLowerCase().trim();
    if (kLower && isBetterTournamentRecord(rec, map.get(kLower))) {
      map.set(kLower, rec);
    }
    if (rId && isBetterTournamentRecord(rec, map.get(rId))) {
      map.set(rId, rec);
    }
    if (rNick && isBetterTournamentRecord(rec, map.get(rNick))) {
      map.set(rNick, rec);
    }
  }

  cachedTourLookupRaw = rawTour;
  cachedTourLookupRegRaw = rawReg;
  cachedTourLookupSeasonId = currentSeasonId;
  cachedTourLookupMap = map;
  return map;
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
  const cleanId = (playerId ?? "").toLowerCase().trim();
  const cleanNick = (nick ?? "").toLowerCase().trim();
  const lookupMap = getTournamentLookupMap();

  const recById = cleanId ? lookupMap.get(cleanId) : undefined;
  const recByNick = cleanNick ? lookupMap.get(cleanNick) : undefined;
  let bestRec: TournamentPlayerRecord | null = null;
  if (recById && recByNick) {
    bestRec = isBetterTournamentRecord(recByNick, recById) ? recByNick : recById;
  } else {
    bestRec = recById ?? recByNick ?? null;
  }

  const reg = loadRegistryReadOnly();
  const memAcc = (cleanId ? reg[cleanId] : undefined) || (cleanNick ? reg[cleanNick] : undefined);
  if (memAcc && typeof memAcc === "object" && memAcc.profile) {
    if (!memAcc.profile.isAdmin && (memAcc.profile.level ?? 1) < TOURNAMENT_MIN_LEVEL) {
      return null;
    }
    const memPts = resolveCanonicalTournamentPoints({
      level: memAcc.profile.level,
      isAdmin: Boolean(memAcc.profile.isAdmin),
      tournamentPoints: memAcc.profile.tournamentPoints,
      bestTournamentPoints: memAcc.profile.bestTournamentPoints,
      record: bestRec,
    });
    if (bestRec && memPts !== (bestRec.tournamentPoints ?? 0)) {
      return { ...bestRec, tournamentPoints: memPts };
    }
  }

  return bestRec;
}

function saveTournamentStore(store: WeeklyTournamentStore) {
  if (typeof window === "undefined") return;
  store.updatedAt = Date.now();
  try {
    const serialized = JSON.stringify(store);
    safeLocalStorageSet(TOURNAMENT_STORAGE_KEY, serialized);
    cachedTourLookupRaw = null;
    cachedTourLookupMap = null;
  } catch {
    /* ignore */
  }
}

const ensuredTournamentGroups = new Set<string>();
let checkedLegacyTournamentSeason1 = false;
let inFlightTournamentSyncPromise: Promise<void> | null = null;
let lastTournamentSyncCompletedAt = 0;
const TOURNAMENT_SYNC_TTL_MS = 45_000;

export function sanitizeTournamentRecordForCloud(
  record: TournamentPlayerRecord,
): TournamentPlayerRecord {
  const canonical = nickSlug(record.nick || record.playerId) || record.playerId;
  const { birthdate: _omitBirthdate, age: _omitAge, ...rest } = record;
  return {
    ...rest,
    playerId: canonical,
    fullName: "",
  };
}

export async function pushSingleTournamentPlayerToPlayFab(
  record: TournamentPlayerRecord,
  seasonIdOverride?: number,
): Promise<boolean> {
  if (!isPlayFabConfigured()) return false;
  if (isBlockedRealPlayFabCallInTest()) return false;
  const titleId = getPlayFabTitleId();
  if (!titleId) return false;

  let ticket = await getAdminPlayFabTicket();
  if (!ticket) {
    const session = loadStoredSession();
    ticket = session?.sessionTicket && !session.sessionTicket.startsWith("admin-")
      ? session.sessionTicket
      : null;
  }
  if (!ticket) return false;

  const cfg = loadAdminConfig();
  const seasonId = seasonIdOverride ?? cfg.rankedSeasonId ?? 1;
  const groupId = getTournamentSeasonGroupId(seasonId);
  const canonical = nickSlug(record.nick || record.playerId) || record.playerId;
  const cloudKey = getTournamentPlayerCloudKey(canonical);
  const payloadRec: TournamentPlayerRecord = sanitizeTournamentRecordForCloud({
    ...record,
    playerId: canonical,
  });

  try {
    if (!ensuredTournamentGroups.has(groupId)) {
      await fetch(`https://${titleId}.playfabapi.com/Client/CreateSharedGroup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": ticket,
        },
        body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
      });
      ensuredTournamentGroups.add(groupId);
    }

    const res = await fetch(`https://${titleId}.playfabapi.com/Client/UpdateSharedGroupData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({
        TitleId: titleId,
        SharedGroupId: groupId,
        Data: { [cloudKey]: JSON.stringify(payloadRec) },
        Permission: "Public",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Atualiza o registro ranqueado de um único jogador localmente e (opcionalmente) na sua chave individual `rnk_<slug>` no PlayFab.
 * Nunca sobrescreve a chave monolítica `Standings` nem os registros de outros jogadores.
 */
export async function upsertTournamentRecordForPlayer(
  record: TournamentPlayerRecord,
  options?: { syncCloud?: boolean; seasonId?: number },
): Promise<boolean> {
  const nowDate = getAuthoritativeNow();
  const canonical = nickSlug(record.nick || record.playerId) || record.playerId;
  const cleanRec: TournamentPlayerRecord = {
    ...record,
    playerId: canonical,
    updatedAt: record.updatedAt || nowDate.getTime(),
  };

  if (typeof window !== "undefined") {
    const store = loadTournamentStore(nowDate);
    for (const [k, existing] of Object.entries(store.records)) {
      if (
        k !== canonical &&
        (nickSlug(k) === canonical ||
          nickSlug(existing.playerId || "") === canonical ||
          (cleanRec.nick && nickSlug(existing.nick || "") === canonical))
      ) {
        delete store.records[k];
      }
    }
    store.records[canonical] = cleanRec;
    const evaluated = evaluateTournamentStandings(store.records, nowDate.getTime());
    store.records = evaluated.updatedRecords;
    saveTournamentStore(store);
    window.dispatchEvent(
      new CustomEvent("desafios:weekly-tournament-updated", { detail: store }),
    );
  }

  if (options?.syncCloud !== false) {
    return pushSingleTournamentPlayerToPlayFab(cleanRec, options?.seasonId);
  }
  return true;
}

export async function syncWeeklyTournamentWithPlayFab(force = false): Promise<void> {
  if (!force && inFlightTournamentSyncPromise) return inFlightTournamentSyncPromise;
  if (!force && Date.now() - lastTournamentSyncCompletedAt < TOURNAMENT_SYNC_TTL_MS) return;
  inFlightTournamentSyncPromise = runSyncWeeklyTournamentWithPlayFab()
    .then(() => {
      lastTournamentSyncCompletedAt = Date.now();
    })
    .finally(() => {
      inFlightTournamentSyncPromise = null;
    });
  return inFlightTournamentSyncPromise;
}

async function runSyncWeeklyTournamentWithPlayFab(): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const titleId = getPlayFabTitleId();
  if (!titleId) return;

  // 1. Sincroniza em modo leve o catálogo unificado de alunos (SEMED_STUDENT_ROSTER_V1)
  try {
    await syncStudentRosterFromPlayFab(undefined, false, { lightweight: true });
  } catch {
    /* ignore */
  }

  // 2. Prioriza o ticket administrativo de serviço para leitura global no SharedGroupData
  if (isBlockedRealPlayFabCallInTest()) return;
  let ticket = await getAdminPlayFabTicket();
  const session = loadStoredSession();
  if (!ticket) {
    ticket = session?.sessionTicket && !session.sessionTicket.startsWith("admin-")
      ? session.sessionTicket
      : null;
  }
  if (!ticket) return;

  const cfg = loadAdminConfig();
  const seasonId = cfg.rankedSeasonId ?? 1;
  const store = loadTournamentStore();
  const groupId = getTournamentSeasonGroupId(seasonId);

  try {
    // 1. Assegura que o grupo compartilhado da temporada existe (apenas 1x por sessão)
    if (!ensuredTournamentGroups.has(groupId)) {
      await fetch(`https://${titleId}.playfabapi.com/Client/CreateSharedGroup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": ticket,
        },
        body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
      });
      ensuredTournamentGroups.add(groupId);
    }

    // 2. Busca todos os registros remotos (chaves individuais `rnk_<slug>` + fallback somente-leitura do legado `Standings`)
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

    const parsedCloud = parseTournamentSharedGroupRecords(json.data?.Data);
    const remoteRecords: Record<string, TournamentPlayerRecord> = { ...parsedCloud.records };
    const perPlayerKeys = parsedCloud.perPlayerKeys;

    // Se for Temporada 1 e ainda não verificou o legado semanal nesta sessão, lê em modo somente-leitura para não perder histórico
    if (seasonId === 1 && !checkedLegacyTournamentSeason1) {
      checkedLegacyTournamentSeason1 = true;
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
        const legacyParsed = parseTournamentSharedGroupRecords(legacyJson.data?.Data);
        for (const [canonical, lr] of Object.entries(legacyParsed.records)) {
          if (perPlayerKeys.has(canonical)) continue; // Chave individual `rnk_<slug>` tem prioridade absoluta
          const cur = remoteRecords[canonical];
          if (!cur || (lr.tournamentPoints ?? 0) > (cur.tournamentPoints ?? 0)) {
            remoteRecords[canonical] = lr;
          }
        }
      } catch {
        /* ignore legacy fallback error */
      }
    }

    const reg = loadRegistry();
    const activeSlug = session?.playerId ? nickSlug(session.playerId) : "";

    const findAccByCanonical = (canonical: string, nick?: string) => {
      const nickLower = (nick || "").toLowerCase().trim();
      const matchKey = Object.keys(reg).find(
        (k) =>
          nickSlug(k) === canonical ||
          nickSlug(reg[k].profile.id || "") === canonical ||
          nickSlug(reg[k].profile.nickNormalized || "") === canonical ||
          (nickLower && reg[k].profile.nick?.toLowerCase().trim() === nickLower),
      );
      return matchKey ? { key: matchKey, acc: reg[matchKey] } : null;
    };

    // 3. Constrói a visão local como reflexo estrito da verdade do servidor
    //    (Apenas o jogador atualmente logado pode reconciliar um ganho local ainda não enviado para sua própria chave `rnk_<slug>`)
    const serverReflected: Record<string, TournamentPlayerRecord> = {};
    let activePlayerNeedsCloudPush: TournamentPlayerRecord | null = null;

    for (const [canonical, r] of Object.entries(remoteRecords)) {
      const found = findAccByCanonical(canonical, r.nick);
      const isAccAdmin = Boolean(found?.acc.profile.isAdmin);
      const effLevel = Math.max(r.level ?? 1, found?.acc.profile.level ?? 1);

      if (!isAccAdmin && effLevel < TOURNAMENT_MIN_LEVEL) {
        continue;
      }

      const isActivePlayer = Boolean(activeSlug && canonical === activeSlug);
      const localRec = isActivePlayer
        ? Object.values(store.records).find(
            (lr) =>
              nickSlug(lr.playerId || "") === canonical ||
              nickSlug(lr.nick || "") === canonical,
          )
        : undefined;

      if (isActivePlayer && localRec && (localRec.updatedAt ?? 0) > (r.updatedAt ?? 0)) {
        const mergedActive: TournamentPlayerRecord = {
          ...r,
          ...localRec,
          playerId: canonical,
          level: effLevel,
        };
        serverReflected[canonical] = mergedActive;
        activePlayerNeedsCloudPush = mergedActive;
      } else {
        serverReflected[canonical] = {
          ...r,
          playerId: canonical,
          level: effLevel,
        };
      }
    }

    // Se o jogador ativo tem registro local elegível que ainda não existe no servidor, preserva e sobe APENAS sua própria chave
    if (activeSlug && !serverReflected[activeSlug]) {
      const localActive = Object.values(store.records).find(
        (lr) =>
          nickSlug(lr.playerId || "") === activeSlug ||
          nickSlug(lr.nick || "") === activeSlug,
      );
      const foundActive = findAccByCanonical(activeSlug, localActive?.nick);
      const isAccAdmin = Boolean(foundActive?.acc.profile.isAdmin);
      const effLevel = Math.max(localActive?.level ?? 1, foundActive?.acc.profile.level ?? 1);
      if (localActive && (isAccAdmin || effLevel >= TOURNAMENT_MIN_LEVEL) && (localActive.tournamentPoints ?? 0) > 0) {
        const cleanActive: TournamentPlayerRecord = {
          ...localActive,
          playerId: activeSlug,
          level: effLevel,
        };
        serverReflected[activeSlug] = cleanActive;
        activePlayerNeedsCloudPush = cleanActive;
      }
    }

    // Complementa com perfis do Roster na nuvem (somente leitura) que já têm pontos mas ainda não tinham chave em TOURNAMENT_SEASON_N
    for (const acc of Object.values(reg)) {
      const p = acc?.profile;
      if (!p || p.id?.startsWith("admin-system")) continue;
      if (!p.isAdmin && (p.level ?? 1) < TOURNAMENT_MIN_LEVEL) continue;
      const canonical = nickSlug(p.nickNormalized || p.nick || p.id);
      if (!canonical || serverReflected[canonical]) continue;
      const pPts = resolveCanonicalTournamentPoints({
        level: p.level,
        isAdmin: Boolean(p.isAdmin),
        tournamentPoints: p.tournamentPoints,
        bestTournamentPoints: p.bestTournamentPoints,
      });
      if (pPts <= 0) continue;
      const nowDate = getAuthoritativeNow();
      const pStageInfo = stageForPlayer(p.school, p.birthdate, nowDate, p.ageStage);
      serverReflected[canonical] = {
        playerId: canonical,
        nick: p.nick,
        fullName: "",
        school: p.school,
        stage: pStageInfo.id,
        level: p.level,
        bestScore: pPts,
        totalEntries: Math.max(1, p.dailyTournamentEntries ?? 1),
        tournamentPoints: pPts,
        highestRankId: getTournamentRank(pPts).currentRank.id,
        activeTop5Since: null,
        accumulatedTop5Ms: 0,
        updatedAt: Date.parse(acc.updatedAt || "") || nowDate.getTime(),
      };
    }

    const evaluated = evaluateTournamentStandings(serverReflected);
    store.records = evaluated.updatedRecords;
    saveTournamentStore(store);

    // 4. Atualiza apenas o catálogo local (sem sobrescrever o Roster na nuvem por clientes comuns)
    let regUpdated = false;
    for (const [canonical, r] of Object.entries(store.records)) {
      const found = findAccByCanonical(canonical, r.nick);
      if (!found) continue;
      const acc = found.acc;
      const rPts = Math.max(0, Math.floor(r.tournamentPoints ?? 0));
      const hasAuthoritativePerPlayerKey = perPlayerKeys.has(canonical);
      const curProfilePts = Math.max(0, Math.floor(acc.profile.tournamentPoints ?? 0));
      if (
        (hasAuthoritativePerPlayerKey && rPts !== curProfilePts) ||
        (!hasAuthoritativePerPlayerKey && rPts > curProfilePts)
      ) {
        acc.profile.tournamentPoints = rPts;
        acc.profile.bestTournamentPoints = Math.max(acc.profile.bestTournamentPoints ?? 0, rPts);
        acc.profile.tournamentRankId = getTournamentRank(rPts).currentRank.id;
        regUpdated = true;
      }
    }
    if (regUpdated) {
      saveRegistry(reg);
    }

    // 5. Envia para a nuvem EXCLUSIVAMENTE a chave individual do jogador ativo (nunca sobrescreve `Standings` nem outros alunos!)
    if (activePlayerNeedsCloudPush) {
      await pushSingleTournamentPlayerToPlayFab(activePlayerNeedsCloudPush, seasonId);
    }

    // 6. Notifica todas as abas e componentes da tela em tempo real
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
  const now = getAuthoritativeNow();
  const cfg = loadAdminConfig();
  const currentSeasonId = cfg.rankedSeasonId ?? 1;
  const store = loadTournamentStore(now);
  const { weekKey, endsAtLabel: defaultWeekEnd } = getWeekInfo(now);
  const seasonEnd = cfg.rankedSeasonEndAt ? new Date(cfg.rankedSeasonEndAt) : null;
  const endsAtLabel =
    seasonEnd && !Number.isNaN(seasonEnd.getTime())
      ? `${formatOfficialCoariDate(seasonEnd, { includeYear: false })} às 23:59`
      : defaultWeekEnd;
  const seasonLabel = `Temporada ${currentSeasonId}`;
  const playerStageInfo = profile
    ? stageForPlayer(profile.school, profile.birthdate, now, profile.ageStage)
    : AGE_STAGES[0];
  const effectiveStage: AgeStageId | "TODAS" = stageFilter ?? playerStageInfo.id;
  const evaluated = evaluateTournamentStandings(store.records, now.getTime(), effectiveStage);
  const myStageEvaluated = evaluateTournamentStandings(
    store.records,
    now.getTime(),
    playerStageInfo.id,
  );

  const todayKey = getAuthoritativeDateKey();
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

  const myRecord = profile
    ? getTournamentStoreRecord(profile.id, profile.nick) ||
      (profile.playfabId ? getTournamentStoreRecord(profile.playfabId, profile.nick) : null) ||
      (profile.nickNormalized ? getTournamentStoreRecord(profile.nickNormalized, profile.nickNormalized) : null)
    : null;
  const currentPoints = profile
    ? resolveCanonicalTournamentPoints({
        level: profile.level,
        isAdmin: profile.isAdmin,
        tournamentPoints: profile.tournamentPoints,
        bestTournamentPoints: profile.bestTournamentPoints,
        record: myRecord ?? myStanding,
      })
    : 0;
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
    now,
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

  const nowDate = getAuthoritativeNow();
  const nowMs = nowDate.getTime();
  const todayKey = getAuthoritativeDateKey();
  const store = loadTournamentStore(nowDate);
  const safeScore = Math.max(0, Math.floor(Number(args.score) || 0));
  const safeCorrect = Math.max(0, Math.floor(Number(args.correct) || 0));
  const safeWrong = Math.max(0, Math.floor(Number(args.wrong) || 0));
  const hasRealParticipation = safeCorrect + safeWrong >= 1 || safeScore > 0;

  // Chave canônica unificada com loadTournamentStore (evita duplicatas e zeragem de contadores diários)
  const canonicalKey = args.profile.nickNormalized || args.profile.id;
  const existing = store.records[canonicalKey] ?? store.records[args.profile.id];
  if (canonicalKey !== args.profile.id && store.records[args.profile.id]) {
    delete store.records[args.profile.id];
  }

  const pStage = stageForPlayer(
    args.profile.school,
    args.profile.birthdate,
    nowDate,
    args.profile.ageStage,
  );
  const pAge = args.profile.birthdate ? ageFrom(args.profile.birthdate, nowDate) : pStage.minAge;

  // Bloqueia farm AFK (0 acertos, 0 erros, 0 pontos) e respeita teto diário de 60 entradas
  const isSameDay = existing?.dailyDateKey === todayKey;
  const currentDailyMatches = isSameDay ? (existing?.dailyMatchesCount ?? 0) : 0;
  const currentDailyFlawless = isSameDay ? (existing?.dailyWinsCount ?? 0) : 0;
  const profileEntriesToday =
    args.profile.dailyXpDate === todayKey ? Math.max(0, args.profile.dailyTournamentEntries ?? 0) : 0;
  const effectiveEntriesToday = Math.max(currentDailyMatches, profileEntriesToday);
  const overDailyLimit = effectiveEntriesToday >= TOURNAMENT_DAILY_ENTRIES_LIMIT;

  // Regra de pontuação ranqueada:
  // - Partida AFK (sem respostas e score 0) ou acima do teto diário: 0 pontos
  // - Partida com participação real: Base 10 pontos, -1 por erro, piso mínimo de 1 ponto.
  const baseEarned = !hasRealParticipation || overDailyLimit ? 0 : Math.max(1, 10 - safeWrong);
  const eventBonuses = getActiveEventBonuses(
    store.gameId,
    1000,
    20,
    undefined,
    nowDate,
    undefined,
    true,
  );
  const rankedMultiplier = Math.max(1, eventBonuses.rankedMultiplier ?? 1);
  const matchPoints = baseEarned > 0 ? Math.round(baseEarned * rankedMultiplier) : 0;
  let pointsDelta = matchPoints;

  // Acompanhamento do bônus diário de 10 partidas perfeitas (exige 0 erros E participação real com >= 3 acertos ou vitória)
  const isFlawless =
    hasRealParticipation &&
    !overDailyLimit &&
    safeWrong === 0 &&
    (safeCorrect >= 3 || isMatchVictory(safeScore, safeCorrect, safeWrong));
  const nextDailyMatches = hasRealParticipation ? currentDailyMatches + 1 : currentDailyMatches;
  const nextDailyWins = currentDailyFlawless + (isFlawless ? 1 : 0);
  const alreadyGotBonusToday = isSameDay ? Boolean(existing?.dailyBonusAwarded) : false;
  let dailyBonusAwarded = false;

  if (nextDailyWins >= 10 && !alreadyGotBonusToday) {
    pointsDelta += 25;
    dailyBonusAwarded = true;
  }

  const curPoints = Math.max(0, existing?.tournamentPoints ?? args.profile.tournamentPoints ?? 0);
  const newTournamentPoints = Math.max(0, curPoints + pointsDelta);
  const rankInfo = getTournamentRank(newTournamentPoints);

  const savedRecord: TournamentPlayerRecord = {
    playerId: canonicalKey,
    nick: args.profile.nick,
    fullName: "",
    school: args.profile.school,
    stage: pStage.id,
    level: args.profile.level,
    bestScore: Math.max(existing?.bestScore ?? 0, safeScore),
    totalEntries: (existing?.totalEntries ?? 0) + (hasRealParticipation ? 1 : 0),
    tournamentPoints: newTournamentPoints,
    dailyWinsCount: nextDailyWins,
    dailyMatchesCount: nextDailyMatches,
    dailyDateKey: todayKey,
    dailyBonusAwarded: dailyBonusAwarded || alreadyGotBonusToday,
    highestRankId: rankInfo.currentRank.id,
    activeTop5Since: existing?.activeTop5Since ?? null,
    accumulatedTop5Ms: existing?.accumulatedTop5Ms ?? 0,
    updatedAt: nowMs,
  };
  store.records[canonicalKey] = savedRecord;

  const evaluated = evaluateTournamentStandings(store.records, nowMs, pStage.id);
  store.records = evaluated.updatedRecords;
  saveTournamentStore(store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("desafios:weekly-tournament-updated", { detail: store }),
    );
  }
  // Envia exclusivamente a chave individual `rnk_<slug>` deste jogador (nunca sobrescreve outros competidores)
  void pushSingleTournamentPlayerToPlayFab(savedRecord);

  // Registro oficial no Extrato de Auditoria (type: "tournament_pts")
  if (matchPoints > 0) {
    try {
      const gName = GAME_NAMES[store.gameId] || store.gameId;
      const multTag = rankedMultiplier > 1 ? ` [${rankedMultiplier}x]` : "";
      recordScoreLedgerEntry({
        playerId: args.profile.id || args.profile.nickNormalized || args.profile.nick,
        playerNick: args.profile.nick,
        type: "tournament_pts",
        source: "torneio_semanal",
        amount: matchPoints,
        balanceAfter: curPoints + matchPoints,
        reason: `Partida Ranqueada (${gName} • ${safeCorrect} acertos, ${safeWrong} erros)${multTag}`,
        metadata: {
          gameId: store.gameId,
          mode: "torneio_semanal",
          score: safeScore,
        },
      });
    } catch {
      /* ignore ledger error */
    }
  }
  if (dailyBonusAwarded) {
    try {
      recordScoreLedgerEntry({
        playerId: args.profile.id || args.profile.nickNormalized || args.profile.nick,
        playerNick: args.profile.nick,
        type: "tournament_pts",
        source: "torneio_semanal",
        amount: 25,
        balanceAfter: newTournamentPoints,
        reason: "Bônus Diário Ranqueada: 10 Partidas Perfeitas (+25 pts)",
        metadata: { gameId: store.gameId, mode: "torneio_semanal" },
      });
    } catch {
      /* ignore ledger error */
    }
  }

  // Opcional: notifica CloudScript autoritativo `RecordRankedMatch` se publicado no PlayFab
  if (isPlayFabConfigured() && pointsDelta > 0) {
    const titleId = getPlayFabTitleId();
    const session = loadStoredSession();
    const tk = session?.sessionTicket;
    if (titleId && tk && !tk.startsWith("admin-")) {
      void fetch(`https://${titleId}.playfabapi.com/Client/ExecuteCloudScript`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": tk,
        },
        body: JSON.stringify({
          FunctionName: "RecordRankedMatch",
          FunctionParameter: {
            seasonId: store.seasonId ?? loadAdminConfig().rankedSeasonId ?? 1,
            gameId: store.gameId,
            score: safeScore,
            correct: safeCorrect,
            wrong: safeWrong,
            pointsDelta,
            newTournamentPoints,
            dailyBonusAwarded,
          },
          GeneratePlayStreamEvent: false,
        }),
      }).catch(() => {});
    }
  }

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

/* --------------------- Trilha de Ranks, Medalhas e Recompensas --------------------- */

export const RANKED_MASTERY_MEDAL_BY_RANK: Partial<
  Record<TournamentRankId, { medalId: string; title: string; minPoints: number }>
> = {
  bronze_3: { medalId: "tour_master_bronze", title: "Dominador do Bronze", minPoints: 61 },
  prata_3: { medalId: "tour_master_prata", title: "Dominador da Prata", minPoints: 191 },
  ouro_3: { medalId: "tour_master_ouro", title: "Dominador do Ouro", minPoints: 381 },
  platina_4: { medalId: "tour_master_platina", title: "Dominador da Platina", minPoints: 622 },
  diamante_5: { medalId: "tour_master_diamante", title: "Dominador do Diamante", minPoints: 817 },
  mestre: { medalId: "tour_master_mestre", title: "Grande Mestre do Torneio", minPoints: 850 },
};

export const RANKED_MEDAL_IDS: readonly string[] = [
  "tournament_top_1_gold",
  "tournament_top_2_silver",
  "tournament_top_3_bronze",
  "tour_master_bronze",
  "tour_master_prata",
  "tour_master_ouro",
  "tour_master_platina",
  "tour_master_diamante",
  "tour_master_mestre",
];

/**
 * Contabiliza quantas das 9 medalhas voltadas à Ranqueada o jogador já conquistou,
 * analisando retroativamente unlockedMedals, tournamentMedals e bestTournamentPoints.
 */
export function countUnlockedRankedMedals(
  profile?: Pick<
    PlayerProfile,
    "unlockedMedals" | "tournamentMedals" | "tournamentPoints" | "bestTournamentPoints"
  > | null,
): { unlockedCount: number; totalCount: number; unlockedIds: string[] } {
  const totalCount = RANKED_MEDAL_IDS.length;
  if (!profile) return { unlockedCount: 0, totalCount, unlockedIds: [] };

  const unlockedSet = new Set<string>();
  for (const raw of profile.unlockedMedals ?? []) {
    const id = typeof raw === "string" ? raw : raw?.medalId;
    if (id && RANKED_MEDAL_IDS.includes(id)) {
      unlockedSet.add(id);
    }
  }

  for (const tm of profile.tournamentMedals ?? []) {
    if (!tm || tm.id?.startsWith("projected_")) continue;
    if (tm.rank === 1) unlockedSet.add("tournament_top_1_gold");
    else if (tm.rank === 2) unlockedSet.add("tournament_top_2_silver");
    else if (tm.rank === 3) unlockedSet.add("tournament_top_3_bronze");
  }

  const peakPts = Math.max(profile.tournamentPoints ?? 0, profile.bestTournamentPoints ?? 0);
  for (const info of Object.values(RANKED_MASTERY_MEDAL_BY_RANK)) {
    if (info && peakPts >= info.minPoints) {
      unlockedSet.add(info.medalId);
    }
  }

  const unlockedIds = RANKED_MEDAL_IDS.filter((id) => unlockedSet.has(id));
  return { unlockedCount: unlockedIds.length, totalCount, unlockedIds };
}

/**
 * Retorna quantos dos 19 ranks da trilha o jogador já alcançou.
 */
export function countUnlockedTournamentRanks(points: number): {
  unlockedCount: number;
  totalCount: number;
  unlockedIds: Set<TournamentRankId>;
} {
  const safePts = Math.max(0, Math.floor(points));
  const unlockedIds = new Set<TournamentRankId>();
  for (const r of TOURNAMENT_RANKS) {
    if (safePts >= r.minPoints) {
      unlockedIds.add(r.id);
    }
  }
  return {
    unlockedCount: unlockedIds.size,
    totalCount: TOURNAMENT_RANKS.length,
    unlockedIds,
  };
}

export function getRankedMilestoneKey(seasonId: number, rankId: TournamentRankId): string {
  return `S${Math.max(1, Math.floor(seasonId))}:${rankId}`;
}

export interface ClaimRankedMilestoneResult {
  ok: boolean;
  error?: string;
  updatedProfile?: PlayerProfile;
  milestoneKey?: string;
}

/**
 * Resgata a recompensa configurada pelo ADM para um marco/rank da trilha ranqueada,
 * creditando imediatamente pacotes de cartas ou pontos no perfil do jogador.
 */
export function claimRankedMilestoneReward(args: {
  profile: PlayerProfile;
  rankId: TournamentRankId;
  seasonId: number;
  reward: RankedMilestoneReward;
  currentPoints: number;
  allowCoinsRewards?: boolean;
}): ClaimRankedMilestoneResult {
  const rankDef = TOURNAMENT_RANKS.find((r) => r.id === args.rankId);
  if (!rankDef) {
    return { ok: false, error: "Rank não encontrado." };
  }
  if (!args.profile.isAdmin && (args.profile.level ?? 1) < TOURNAMENT_MIN_LEVEL) {
    return {
      ok: false,
      error: `Alcance o Nível ${TOURNAMENT_MIN_LEVEL} para participar da Ranqueada e resgatar marcos.`,
    };
  }
  const safeCurrentPts = Number.isFinite(args.currentPoints)
    ? Math.max(0, Math.floor(args.currentPoints))
    : 0;
  const safeProfilePts = Number.isFinite(args.profile.tournamentPoints)
    ? Math.max(0, Math.floor(args.profile.tournamentPoints!))
    : 0;
  const safeBestPts = Number.isFinite(args.profile.bestTournamentPoints)
    ? Math.max(0, Math.floor(args.profile.bestTournamentPoints!))
    : 0;
  const peakPoints = Math.max(safeCurrentPts, safeProfilePts, safeBestPts);
  const minRequired = rankDef.minPoints === 0 ? 1 : rankDef.minPoints;
  if (peakPoints < minRequired) {
    return {
      ok: false,
      error: `Alcance ${minRequired} pontos no Torneio para desbloquear ${rankDef.name}.`,
    };
  }

  const milestoneKey = getRankedMilestoneKey(args.seasonId, args.rankId);
  const existingClaimed = Array.isArray(args.profile.claimedRankedMilestones)
    ? args.profile.claimedRankedMilestones
    : [];
  if (existingClaimed.includes(milestoneKey)) {
    return { ok: false, error: "Recompensa deste marco já foi resgatada nesta temporada." };
  }

  const rawQty = Number(args.reward.quantity);
  if (!Number.isFinite(rawQty) || rawQty < 1) {
    return { ok: false, error: "Configuração de recompensa inválida." };
  }
  const qty = Math.max(1, Math.floor(rawQty));
  const nextProfile: PlayerProfile = {
    ...args.profile,
    claimedRankedMilestones: [...existingClaimed, milestoneKey],
  };

  if (args.reward.type === "card_pack" && args.reward.packId) {
    const normalizedPackId = normalizeCardPackId(args.reward.packId);
    const prevPacks = { ...(nextProfile.unopenedPacks ?? {}) };
    prevPacks[normalizedPackId] = Math.max(0, Number(prevPacks[normalizedPackId]) || 0) + qty;
    nextProfile.unopenedPacks = prevPacks;
  } else if (args.reward.type === "points") {
    nextProfile.pointsBalance = (nextProfile.pointsBalance ?? 0) + qty;
    nextProfile.careerPoints = (nextProfile.careerPoints ?? 0) + qty;
    try {
      recordScoreLedgerEntry({
        playerId: nextProfile.id || nextProfile.nickNormalized || nextProfile.nick,
        playerNick: nextProfile.nick,
        type: "career_points",
        source: "promocao_torneio",
        amount: qty,
        balanceAfter: nextProfile.careerPoints,
        reason: `Marco da Trilha Ranqueada (${rankDef.name})`,
        metadata: { mode: "torneio_semanal" },
      });
    } catch {
      /* ignore */
    }
  } else if (args.reward.type === "coins") {
    if (args.allowCoinsRewards === false) {
      return { ok: false, error: "Recompensas em Moedas serão liberadas em breve." };
    }
    creditCoinMetrics(nextProfile, qty);
    try {
      recordScoreLedgerEntry({
        playerId: nextProfile.id || nextProfile.nickNormalized || nextProfile.nick,
        playerNick: nextProfile.nick,
        type: "coins",
        source: "promocao_torneio",
        amount: qty,
        balanceAfter: nextProfile.coins,
        reason: `Marco da Trilha Ranqueada (${rankDef.name})`,
        metadata: { mode: "torneio_semanal" },
      });
    } catch {
      /* ignore */
    }
  } else {
    return { ok: false, error: "Configuração de recompensa inválida." };
  }

  const rawCoinsBonus = Number(args.reward.coinsBonus);
  if (
    args.allowCoinsRewards !== false &&
    Number.isFinite(rawCoinsBonus) &&
    rawCoinsBonus > 0 &&
    args.reward.type !== "coins"
  ) {
    const bonusCoins = Math.floor(rawCoinsBonus);
    creditCoinMetrics(nextProfile, bonusCoins);
    try {
      recordScoreLedgerEntry({
        playerId: nextProfile.id || nextProfile.nickNormalized || nextProfile.nick,
        playerNick: nextProfile.nick,
        type: "coins",
        source: "promocao_torneio",
        amount: bonusCoins,
        balanceAfter: nextProfile.coins,
        reason: `Bônus de Moedas — Marco (${rankDef.name})`,
        metadata: { mode: "torneio_semanal" },
      });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, updatedProfile: nextProfile, milestoneKey };
}
