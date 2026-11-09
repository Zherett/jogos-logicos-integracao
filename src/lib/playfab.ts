// Microsoft Azure PlayFab integration module
// Handles player authentication (Username + Password without email), UserData,
// Statistics, Leaderboards (General XP, Per-Game, Per-School), and ADM Config / Scheduled Resets.

import {
  ALL_GAME_IDS,
  clearLocalStats,
  loadStats,
  updateBest,
  type GameId,
} from "./game-storage.ts";
import {
  clearUnlocked,
  DEFAULT_ENABLED_GAMES,
  loadAdminConfig,
  saveAdminConfig,
  saveUnlocked,
  type PlatformAdminConfig,
  type ResetHistoryEntry,
} from "./game-codes.ts";
import { computeSeasonDates } from "./season-cycle.ts";
import {
  adjustXpForGameMode,
  advanceLevelStageOnMatch,
  ageFrom,
  applyDailyXpCap,
  calculatePlayerLevel,
  computeBadges,
  evaluateLeaderboardRankChanges,
  formatFullNameUpper,
  fullNameSlug,
  getLocalDateKey,
  isEtapa3OrOlder,
  is5thGradeSchool,
  isMatchVictory,
  isOfficialSemedSchool,
  isValidSchool,
  levelFromXp,
  levelTitle,
  matchesRankingCategory,
  nickSlug,
  normalizeBirthdatePasswordInput,
  passwordFromBirthdate,
  playfabUsernameFromNick,
  isPioneerExcludedAccount,
  schoolNeedsGrade,
  SCHOOLS,
  schoolSlug,
  stageFromBirthdate,
  studentCustomId,
  syncLevelStageProgress,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_XP_PER_ENTRY,
  X1_DAILY_EXTRA_XP_CAP,
  xpFromMatch,
  type AgeStageId,
  type Badge,
  type LevelStageProgress,
  type RankingFilterCategory,
  type RankHistoryState,
  type RankTrendDirection,
  type TournamentMedal,
  type TurmaCode,
  createTurmaChangeRequest,
  resolveTurmaChangeRequest,
  getPreviousDateKey,
} from "./player-profile.ts";
import {
  calculateEventXpMultiplier,
  getEffectiveDailyXpCap,
  getActiveEventBonuses,
  getActiveSpecialEvents,
  getActiveRecurringEvents,
  getEventCycleKey,
  loadSpecialEvents,
  loadRecurringEvents,
} from "./custom-events.ts";
import {
  aggregateStatsByGame,
  evaluatePlayerMedals,
  getAllAvailableMedals,
  getDistinctFlawlessGames,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
  getEnabledGameIdsSet,
  getPlayerStreakDays,
  getTop5TotalWeeks,
  getTop1ConsecutiveWeeks,
  isFlawlessMatch,
  isMedalPreservedOnBetaEnd,
  MEDAL_XP_REWARDS,
  type PlayerUnlockedMedal,
  type MedalDefinition,
  type AdminMedalNotification,
} from "./medals-catalog.ts";
import {
  removePlayerFromGameRecords,
  seedRecordsFromRegistry,
} from "./game-records.ts";
import {
  autoConvertAllPointsToCoins,
  awardCareerPoints,
  checkAndApplyDailyLoginPoints,
  checkAndApplyFirstGameOfDayPoints,
  checkLevelPromotionPoints,
  checkTournamentTierPromotion,
  ensurePlayerCareerPointsInitialized,
  MEDAL_POINTS_REWARDS,
  RECORD_PERSONAL_POINTS,
  RECORD_STAGE_MAX_POINTS,
  X1_WIN_POINTS,
  FLAWLESS_MATCH_POINTS,
  RANKED_WIN_POINTS,
} from "./career-points.ts";
import { removePlayerFromPresence } from "./presence.ts";
import {
  removePlayerFromTournament,
  getTournamentRank,
  getTournamentStoreRecord,
  finalizeRankedSeasonAndAwardMedalsViaInbox,
} from "./weekly-tournament.ts";
import {
  createInboxMessage,
  recordDeviceSecurityAlert,
  ADMIN_NOTIFICATIONS_SHARED_GROUP_ID,
  mergeStudentReads,
  mergeStudentClaims,
} from "./inbox-messages.ts";
import { invalidatePioneersCache } from "./medal-pioneers.ts";
import { recordScoreLedgerEntry } from "./score-history-ledger.ts";

const SESSION_KEY = "desafios-playfab-session-v1";
const REGISTRY_KEY = "desafios-playfab-registry-v1";
const ADMIN_AUTH_KEY = "desafios-playfab-admin-auth-v1";
const ADMIN_PIN_KEY = "desafios-playfab-admin-pin-v1";
export const ROSTER_SHARED_GROUP_ID = "SEMED_STUDENT_ROSTER_V1";
export const ADMIN_CONFIG_SHARED_GROUP_ID = "SEMED_PLATFORM_CONFIG_V1";

/**
 * Retorna a chave canônica oficial para o registro do aluno no grupo compartilhado SEMED_STUDENT_ROSTER_V1.
 * O formato canônico é RIGOROSAMENTE `stu_${nickNormalized}`.
 * NUNCA utiliza PlayFabId ou outros IDs como chave do Shared Group para prevenir duplicatas e conflitos.
 */
export function getStudentRosterCloudKey(profileOrSlug: Partial<PlayerProfile> | string | undefined | null): string {
  if (!profileOrSlug) return "stu_desconhecido";
  if (typeof profileOrSlug === "string") {
    const clean = nickSlug(profileOrSlug.replace(/^stu_/, ""));
    return `stu_${clean}`;
  }
  const rawNick = profileOrSlug.nickNormalized || profileOrSlug.nick || profileOrSlug.id || "";
  const clean = nickSlug(String(rawNick).replace(/^stu_/, ""));
  return `stu_${clean}`;
}
export const TOMBSTONES_STORAGE_KEY = "desafios:deleted-students-tombstones-v1";
const inMemoryTombstones = new Set<string>();

export function loadTombstones(): Set<string> {
  if (typeof window === "undefined") return inMemoryTombstones;
  try {
    const raw = window.localStorage.getItem(TOMBSTONES_STORAGE_KEY);
    if (!raw) return inMemoryTombstones;
    const arr = JSON.parse(raw);
    const set = new Set(
      Array.isArray(arr) ? arr.map((s: string) => String(s).toLowerCase().trim()) : [],
    );
    for (const item of inMemoryTombstones) set.add(item);
    return set;
  } catch {
    return inMemoryTombstones;
  }
}

export function saveTombstones(set: Set<string>): void {
  for (const item of set) inMemoryTombstones.add(item);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

export function addTombstone(slugOrId?: string | null): void {
  if (!slugOrId) return;
  const set = loadTombstones();
  set.add(slugOrId.trim().toLowerCase());
  saveTombstones(set);
}

export function isTombstoned(slugOrId?: string | null): boolean {
  if (!slugOrId) return false;
  const set = loadTombstones();
  return set.has(slugOrId.trim().toLowerCase());
}

export interface EventProgressData {
  cycleKey: string;
  matchesCount?: number;
  matchesByGame?: Record<string, number>;
  xpEarned?: number;
  xpByGame?: Record<string, number>;
  bestScoreByGame?: Record<string, number>;
  bestLevelByGame?: Record<string, number>;
  flawlessCount?: number;
  x1Wins?: number;
  maxCombo?: number;
  dailyCapDaysCount?: number;
  lastDailyCapDate?: string;
  teamMatchesCount?: number;
  distinctGamesPlayed?: string[];
}

export interface PlayerProfile {
  id: string;
  playfabId?: string;
  nick: string;
  nickNormalized: string;
  full_name: string;
  school: string;
  grade: string | null;
  turma?: string | null;
  pendingTurmaRequest?: string | null;
  birthdate: string;
  xp: number;
  seasonXp: number;
  level: number;
  levelStageProgress?: LevelStageProgress;
  wins: number;
  x1Wins?: number;
  x1Losses?: number;
  x1Draws?: number;
  x1Matches?: number;
  weeklyX1Wins?: number;
  weeklyX1WeekKey?: string;
  matchesPlayed: number;
  totalMatches?: number;
  totalPlays?: number;
  distinctGamesPlayed?: number;
  dailyXp?: number;
  dailyX1Xp?: number;
  dailyTournamentXp?: number;
  dailyTournamentEntries?: number;
  tournamentPoints?: number;
  bestTournamentPoints?: number;
  tournamentRankId?: string;
  tournamentWeekKey?: string;
  dailyXpDate?: string;
  dailyPostCapMatches?: number;
  dailyPostCapDate?: string;
  streakDays?: number;
  lastActiveDate?: string;
  activeDates?: string[];
  pointsBalance?: number;
  careerPoints?: number;
  coins?: number;
  claimedInboxRewardIds?: string[];
  lastDailyLoginPointsDate?: string;
  lastDailyFirstGamePointsDate?: string;
  achievedTournamentTiers?: string[];
  achievedLevelsPoints?: number[];
  tournamentMedals?: TournamentMedal[];
  unlockedMedals?: PlayerUnlockedMedal[];
  eventProgress?: Record<string, EventProgressData>;
  stats?: GameStatRow[];
  badges: Badge[];
  isAdmin?: boolean;
  seasonId: number;
  rankedSeasonId?: number;
  activeSessionId?: string;
  activeSessionUpdatedAt?: string;
  deletedAt?: string;
  deleteScheduledPermanentAt?: string;
}

export interface GameStatRow {
  game_id: GameId;
  mode?: string;
  plays: number;
  wins: number;
  flawless_wins?: number;
  last_wrong?: number;
  best_score: number;
  best_level: number;
  last_played_at?: string;
  player_id?: string;
  updated_at?: string;
}

export interface SignUpData {
  nick: string;
  password?: string;
  fullName: string;
  school: string;
  grade: string | null;
  turma?: string | null;
  birthdate: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nick: string;
  fullName: string;
  school: string;
  grade: string | null;
  turma?: string | null;
  age: number;
  stage: AgeStageId;
  stageLabel: string;
  level: number;
  rankTitle: string;
  rankEmoji: string;
  value: number; // Points, Medals, XP, or Best Score depending on board
  careerPoints?: number;
  pointsBalance?: number;
  medalsCount?: number;
  xpValue?: number;
  wins: number;
  rankTrend?: RankTrendDirection;
  previousRank?: number;
  isCurrentPlayer?: boolean;
}

interface StoredAccount {
  profile: PlayerProfile;
  passwordHash: string;
  unlocked: GameId[];
  stats: GameStatRow[];
  updatedAt: string;
}

interface StoredSession {
  playerId: string;
  sessionTicket?: string;
  playfabId?: string;
  activeSessionId?: string;
}

function simpleHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export const DEFAULT_PLAYFAB_TITLE_ID = "186F63";

export function getPlayFabTitleId(): string {
  const envId = (import.meta.env?.VITE_PLAYFAB_TITLE_ID as string | undefined)?.trim();
  if (envId) return envId;
  const cfg = loadAdminConfig();
  const cfgId = cfg.playfabTitleId?.trim();
  if (cfgId) return cfgId;
  return DEFAULT_PLAYFAB_TITLE_ID;
}

export function isPlayFabConfigured(): boolean {
  return getPlayFabTitleId().length >= 3;
}

export function getAdminPin(): string {
  if (typeof window !== "undefined") {
    const custom = window.localStorage.getItem(ADMIN_PIN_KEY);
    if (custom && custom.trim().length >= 4) return custom.trim();
  }
  const envPin = (import.meta.env?.VITE_ADMIN_PIN as string | undefined)?.trim();
  return envPin || "SEMED26";
}

export function setAdminPin(newPin: string) {
  if (typeof window === "undefined") return;
  const clean = newPin.trim();
  if (clean.length >= 4) {
    window.localStorage.setItem(ADMIN_PIN_KEY, clean);
  }
}

const ADMIN_TICKET_CACHE_KEY = "desafios-playfab-admin-ticket-v1";
const ADMIN_TICKET_TTL_MS = 20 * 60 * 60 * 1000; // 20 horas
let cachedAdminTicket: string | null = null;
let cachedAdminTicketTime = 0;
let inFlightAdminTicketPromise: Promise<string | null> | null = null;

export function clearCachedAdminPlayFabTicket() {
  cachedAdminTicket = null;
  cachedAdminTicketTime = 0;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(ADMIN_TICKET_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export async function getAdminPlayFabTicket(): Promise<string | null> {
  if (cachedAdminTicket && Date.now() - cachedAdminTicketTime < ADMIN_TICKET_TTL_MS) {
    return cachedAdminTicket;
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ADMIN_TICKET_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ticket: string; at: number };
        if (parsed.ticket && Date.now() - parsed.at < ADMIN_TICKET_TTL_MS) {
          cachedAdminTicket = parsed.ticket;
          cachedAdminTicketTime = parsed.at;
          return parsed.ticket;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (!isPlayFabConfigured()) return null;
  if (inFlightAdminTicketPromise) return inFlightAdminTicketPromise;

  inFlightAdminTicketPromise = (async () => {
    try {
      const res = await callPlayFabClient<PlayFabLoginPayload>("LoginWithPlayFab", {
        Username: "adminjosiney",
        Password: "SEMED2620ZZadm",
      });
      if (res.data?.SessionTicket) {
        cachedAdminTicket = res.data.SessionTicket;
        cachedAdminTicketTime = Date.now();
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              ADMIN_TICKET_CACHE_KEY,
              JSON.stringify({ ticket: cachedAdminTicket, at: cachedAdminTicketTime }),
            );
          } catch {
            /* ignore */
          }
        }
        return cachedAdminTicket;
      }
      return null;
    } finally {
      inFlightAdminTicketPromise = null;
    }
  })();

  return inFlightAdminTicketPromise;
}

export function isSpecialAdminAccount(p?: {
  id?: string;
  nickNormalized?: string;
  nick?: string;
  isAdmin?: boolean;
} | null): boolean {
  if (!p) return false;
  if (p.isAdmin) return true;
  if (p.id === "admin-system" || p.id?.startsWith("admin-")) return true;
  const n = p.nickNormalized?.toLowerCase();
  const raw = (p as any).nick?.toLowerCase()?.trim();
  return (
    n === "admin" ||
    n === "josiney" ||
    n === "quemuel" ||
    raw === "quemuel" ||
    raw === "josiney"
  );
}

export function isAdminUnlockedSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ADMIN_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdminUnlockedSession(unlocked: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (unlocked) window.sessionStorage.setItem(ADMIN_AUTH_KEY, "1");
    else window.sessionStorage.removeItem(ADMIN_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/* --------------------- Local Registry / Offline Mirror --------------------- */

export const STUDENT_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function purgeExpiredTrash(reg: Record<string, StoredAccount>): boolean {
  let changed = false;
  const now = Date.now();
  for (const [key, acc] of Object.entries(reg)) {
    if (acc?.profile?.deletedAt) {
      const delTime = new Date(acc.profile.deletedAt).getTime();
      if (!isNaN(delTime) && now - delTime >= STUDENT_TRASH_RETENTION_MS) {
        addTombstone(acc.profile.nickNormalized);
        if (acc.profile.id) addTombstone(acc.profile.id);
        if (acc.profile.nick) addTombstone(acc.profile.nick);
        try {
          removePlayerFromGameRecords(acc.profile.id, acc.profile.nick);
        } catch {
          /* ignore */
        }
        try {
          void removePlayerFromPresence(acc.profile.id, acc.profile.nick);
        } catch {
          /* ignore */
        }
        try {
          removePlayerFromTournament(acc.profile.id, acc.profile.nick);
        } catch {
          /* ignore */
        }
        delete reg[key];
        changed = true;
      }
    }
  }
  return changed;
}

let inMemoryRegistry: Record<string, StoredAccount> = {};

export function loadRegistry(): Record<string, StoredAccount> {
  if (typeof window === "undefined") return inMemoryRegistry;
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredAccount>;
    let tombstoneCleaned = false;
    for (const [key, acc] of Object.entries(parsed)) {
      if (!acc || !acc.profile || !acc.profile.id) {
        delete parsed[key];
        continue;
      }
      if (
        isTombstoned(key) ||
        isTombstoned(acc.profile.id) ||
        isTombstoned(acc.profile.nickNormalized)
      ) {
        delete parsed[key];
        tombstoneCleaned = true;
      }
    }
    if (purgeExpiredTrash(parsed) || tombstoneCleaned) {
      saveRegistry(parsed);
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveRegistry(reg: Record<string, StoredAccount>) {
  if (typeof window === "undefined") {
    inMemoryRegistry = { ...reg };
    return;
  }
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  } catch {
    /* ignore */
  }
}

export function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

/* --------------------- PlayFab REST API Low-Level Call --------------------- */

interface PlayFabResponse<T> {
  code: number;
  status: string;
  data?: T;
  error?: string;
  errorCode?: number;
  errorMessage?: string;
}

async function callPlayFabClient<T>(
  endpoint: string,
  body: Record<string, unknown>,
  sessionTicket?: string,
): Promise<{ data: T | null; error: string | null; errorCode?: string }> {
  const titleId = getPlayFabTitleId();
  if (!titleId) {
    return { data: null, error: "Servidor da nuvem indisponível no momento." };
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (sessionTicket) {
      headers["X-Authorization"] = sessionTicket;
    }
    const response = await fetch(
      `https://${titleId}.playfabapi.com/Client/${endpoint}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ TitleId: titleId, ...body }),
      },
    );
    const json = (await response.json()) as PlayFabResponse<T>;
    if (!response.ok || json.error) {
      return {
        data: null,
        error: json.errorMessage || json.error || "Não foi possível conectar ao servidor da plataforma.",
        errorCode: json.error,
      };
    }
    return { data: json.data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Falha de conexão com a rede. Verifique sua conexão com a internet.",
    };
  }
}

/* --------------------- Scheduled Reset Engine (ADM) ---------------------- */

/** Checks if the ADM scheduled a ranking reset whose timestamp has arrived,
 *  and executes it automatically if due. */
export function checkAndApplyScheduledReset(): PlatformAdminConfig {
  let cfg = loadAdminConfig();

  // 1. Encerramento automático agendado da Temporada Geral de Atividades (BETA / 60 dias)
  const targetEnd = cfg.seasonEndAt || cfg.scheduledResetAt;
  if (targetEnd) {
    const dueTime = new Date(targetEnd).getTime();
    if (!Number.isNaN(dueTime) && Date.now() >= dueTime) {
      const durationLabel = cfg.seasonDurationDays ? `${cfg.seasonDurationDays} dias` : "período regular";
      cfg = executeRankingReset({
        clearXp: cfg.scheduledResetClearXp,
        newSeasonName: `Temporada ${cfg.seasonId + 1} • SEMED Coari`,
        reason: `Encerramento automático da Temporada ${cfg.seasonId} (${durationLabel}) agendado para ${new Date(targetEnd).toLocaleString("pt-BR")}`,
      });
    }
  }

  // 2. Encerramento automático agendado da Temporada do Modo Ranqueado (14 dias ou definido no ADM)
  const rankedEnd = cfg.rankedSeasonEndAt;
  if (rankedEnd) {
    const dueRanked = new Date(rankedEnd).getTime();
    if (!Number.isNaN(dueRanked) && Date.now() >= dueRanked) {
      cfg = executeRankedSeasonReset({
        reason: `Encerramento automático da Temporada de Ranqueada ${cfg.rankedSeasonId ?? 1} agendado para ${new Date(rankedEnd).toLocaleString("pt-BR")}`,
      });
    }
  }

  return cfg;
}

export function executeRankingReset(options: {
  clearXp: boolean;
  newSeasonName?: string;
  reason?: string;
}): PlatformAdminConfig {
  return executeActivitySeasonReset({
    isBetaEnd: options.clearXp,
    newSeasonName: options.newSeasonName,
    reason: options.reason,
  });
}

/**
 * Executa o Reset da Temporada de Atividades (Geral & Beta):
 * - Se isBetaEnd === true:
 *   - Finaliza a fase Beta (isBetaActive = false).
 *   - Todos os alunos voltam para o Nível 1 (0 XP).
 *   - Revoga as 120 medalhas de atividades/jogos, preservando estritamente as 25 medalhas especiais acordadas.
 *   - Reseta os pioneiros de medalhas (invalidatePioneersCache).
 *   - Converte todo o saldo restante de pontos (pointsBalance) em moedas (coins) para a futura loja.
 *   - O ranking histórico permanente (careerPoints) NUNCA é reduzido!
 *   - Inicia a Temporada 1 Oficial de Atividades com duração pós-beta de 60 dias (2 meses).
 * - Se isBetaEnd === false (resets pós-beta a cada 2 meses):
 *   - Zera nível/XP para 1.
 *   - Converte pontos em moedas.
 *   - AS MEDALHAS NÃO SÃO REMOVIDAS (permanecem intactas).
 */
export function executeActivitySeasonReset(options: {
  isBetaEnd?: boolean;
  newSeasonName?: string;
  reason?: string;
}): PlatformAdminConfig {
  const cfg = loadAdminConfig();
  const nowIso = new Date().toISOString();
  const isBeta = options.isBetaEnd !== undefined ? options.isBetaEnd : (cfg.isBetaActive ?? true);
  const currentSeasonId = cfg.activitySeasonId ?? cfg.seasonId;
  const nextSeasonId = currentSeasonId + 1;

  // Duração pós-beta: 60 dias (2 meses)
  const durationDays = isBeta ? 60 : (cfg.activitySeasonDurationDays && cfg.activitySeasonDurationDays > 0 ? cfg.activitySeasonDurationDays : 60);
  const { start: nStart, end: nEnd } = computeSeasonDates(new Date(nowIso), durationDays);

  const entry: ResetHistoryEntry = {
    id: `rst_act_${Date.now()}`,
    seasonId: currentSeasonId,
    seasonName: cfg.activitySeasonName || cfg.seasonName,
    executedAt: nowIso,
    resetXp: true,
    reason: options.reason || (isBeta ? "Encerramento Oficial da Fase Beta" : "Reset Regular da Temporada de Atividades (2 meses)"),
  };

  const nextConfig = saveAdminConfig({
    ...cfg,
    seasonId: nextSeasonId,
    activitySeasonId: nextSeasonId,
    activitySeasonName: options.newSeasonName?.trim() || `Temporada ${nextSeasonId} de Atividades • SEMED Coari`,
    activitySeasonStartAt: nStart.toISOString(),
    activitySeasonEndAt: nEnd.toISOString(),
    activitySeasonDurationDays: durationDays,
    isBetaActive: false,
    lastResetAt: nowIso,
    scheduledResetAt: nEnd.toISOString(),
    resetHistory: [entry, ...cfg.resetHistory].slice(0, 25),
  });

  const rate = cfg.pointsToCoinsRate ?? 1;

  // Processa todos os alunos registrados
  const reg = loadRegistry();
  for (const key of Object.keys(reg)) {
    const acc = reg[key];
    acc.stats = [];
    acc.profile.seasonXp = 0;
    acc.profile.seasonId = nextConfig.seasonId;
    acc.profile.xp = 0;
    acc.profile.level = 1;
    acc.profile.wins = 0;
    acc.profile.matchesPlayed = 0;
    acc.profile.distinctGamesPlayed = 0;
    acc.profile.dailyXp = 0;
    acc.profile.dailyXpDate = getLocalDateKey();

    // Converte saldo restante de pontos em moedas
    autoConvertAllPointsToCoins(acc.profile, rate);

    if (isBeta) {
      // No fim do Beta: revoga as 120 medalhas de atividades e preserva apenas as 25 especiais
      acc.profile.unlockedMedals = (acc.profile.unlockedMedals ?? []).filter((m) =>
        isMedalPreservedOnBetaEnd(m.medalId),
      );
      acc.profile.badges = (acc.profile.badges ?? []).filter((b) =>
        isMedalPreservedOnBetaEnd(b.id),
      );
    }

    acc.updatedAt = nowIso;
  }
  saveRegistry(reg);
  clearLocalStats();
  invalidatePioneersCache();

  return nextConfig;
}

/**
 * Executa o Reset da Temporada de Ranqueada (Torneio Competitivo):
 * - Ciclo rápido de 2 semanas (14 dias).
 * - Reinicia a pontuação de todos os jogadores para 0 pontos ranqueados (tournamentPoints = 0).
 * - Retorna o rank inicial para Bronze I.
 * - TODAS as medalhas ranqueadas e pódios são 100% mantidos (cumulativas com contador 'count').
 * - Inicia a nova Temporada N+1 de Ranqueada.
 */
export function executeRankedSeasonReset(options?: {
  newSeasonName?: string;
  reason?: string;
}): PlatformAdminConfig {
  const cfg = loadAdminConfig();
  const nowIso = new Date().toISOString();
  const currentRankedSeasonId = cfg.rankedSeasonId ?? 1;
  const nextRankedSeasonId = currentRankedSeasonId + 1;

  // 1. Encerra oficialmente a temporada anterior, congela o pódio e envia as medalhas com carta oficial ao Correio dos vencedores
  void finalizeRankedSeasonAndAwardMedalsViaInbox(currentRankedSeasonId);

  // 2. Limpa o armazenamento local do Torneio Semanal para iniciar a nova Temporada com registros limpos
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("desafios-weekly-tournament-v1");
    } catch {
      /* ignore */
    }
  }

  const durationDays = cfg.rankedSeasonDurationDays && cfg.rankedSeasonDurationDays > 0 ? cfg.rankedSeasonDurationDays : 14;
  const { start: nStart, end: nEnd } = computeSeasonDates(new Date(nowIso), durationDays);

  const entry: ResetHistoryEntry = {
    id: `rst_rnk_${Date.now()}`,
    seasonId: currentRankedSeasonId,
    seasonName: cfg.rankedSeasonName || `Temporada ${currentRankedSeasonId} Ranqueada`,
    executedAt: nowIso,
    resetXp: false,
    reason: options?.reason || "Reset da Temporada de Ranqueada (2 semanas)",
  };

  const nextConfig = saveAdminConfig({
    ...cfg,
    rankedSeasonId: nextRankedSeasonId,
    rankedSeasonName: options?.newSeasonName?.trim() || `Temporada ${nextRankedSeasonId} Ranqueada • SEMED Coari`,
    rankedSeasonStartAt: nStart.toISOString(),
    rankedSeasonEndAt: nEnd.toISOString(),
    rankedSeasonDurationDays: durationDays,
    resetHistory: [entry, ...cfg.resetHistory].slice(0, 25),
  });

  // Zera os pontos ranqueados de todos os alunos registrados e alinha com a nova temporada
  const reg = loadRegistry();
  for (const key of Object.keys(reg)) {
    const acc = reg[key];
    acc.profile.tournamentPoints = 0;
    acc.profile.bestTournamentPoints = 0;
    acc.profile.tournamentRankId = "bronze_1";
    acc.profile.rankedSeasonId = nextRankedSeasonId;
    acc.profile.dailyTournamentEntries = 0;
    acc.updatedAt = nowIso;
  }
  saveRegistry(reg);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("desafios:weekly-tournament-updated"));
    window.dispatchEvent(new CustomEvent("desafios:profile-updated"));
  }

  return nextConfig;
}

/* --------------------- Sync Admin Config with PlayFab --------------------- */

/**
 * A configuração global (jogos visíveis, trava SEMED26 etc.) é gravada pelo ADM nos
 * "User Data" PÚBLICOS da conta administradora no PlayFab. Qualquer outra sessão
 * (aluno logado ou visitante) consegue ler esses dados com GetUserData, sem precisar
 * fazer login na conta do ADM — evitando o bloqueio 429 (limite de logins por conta).
 */
const ADMIN_CONFIG_OWNER_PLAYFAB_ID = "FB6662558A38ACAD";
const ADMIN_CONFIG_USERDATA_KEY = "PlatformAdminConfig";
const REMOTE_CONFIG_CACHE_KEY = "desafios-remote-admin-config-v1";
const VIEWER_TICKET_KEY = "desafios-playfab-viewer-ticket-v1";
const VIEWER_USERNAME = "semedvisitante";
const VIEWER_PASSWORD = "SemedVisitante2026";
const VIEWER_TICKET_TTL_MS = 20 * 60 * 60 * 1000; // tickets PlayFab valem 24h

let cachedViewerTicket: string | null = null;
let cachedViewerTicketTime = 0;
let inFlightViewerTicketPromise: Promise<string | null> | null = null;
let inFlightConfigSyncPromise: Promise<PlatformAdminConfig> | null = null;
let lastAdminCloudSyncError: string | null = null;

/** Último erro ao publicar a configuração do ADM na nuvem (null = sucesso). */
export function getLastAdminCloudSyncError(): string | null {
  return lastAdminCloudSyncError;
}

function loadCachedRemoteConfig(): Partial<PlatformAdminConfig> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMOTE_CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PlatformAdminConfig>) : null;
  } catch {
    return null;
  }
}

function storeCachedRemoteConfig(raw: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMOTE_CONFIG_CACHE_KEY, raw);
  } catch {
    /* ignore */
  }
}

/** Ticket de leitura reaproveitado por até 20h no dispositivo (com fallback anti-429). */
async function getViewerPlayFabTicket(): Promise<string | null> {
  if (cachedViewerTicket && Date.now() - cachedViewerTicketTime < VIEWER_TICKET_TTL_MS) {
    return cachedViewerTicket;
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(VIEWER_TICKET_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ticket: string; at: number };
        if (cached.ticket && Date.now() - cached.at < VIEWER_TICKET_TTL_MS) {
          cachedViewerTicket = cached.ticket;
          cachedViewerTicketTime = cached.at;
          return cached.ticket;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (inFlightViewerTicketPromise) return inFlightViewerTicketPromise;

  inFlightViewerTicketPromise = (async () => {
    try {
      let res = await callPlayFabClient<PlayFabLoginPayload>("LoginWithPlayFab", {
        Username: VIEWER_USERNAME,
        Password: VIEWER_PASSWORD,
      });
      if (!res.data?.SessionTicket && res.errorCode === "AccountNotFound") {
        res = await callPlayFabClient<PlayFabLoginPayload>("RegisterPlayFabUser", {
          Username: VIEWER_USERNAME,
          Password: VIEWER_PASSWORD,
          RequireBothUsernameAndEmail: false,
        });
      }
      // Fallback caso muitos celulares abram simultaneamente e atinjam rate limit na conta padrão
      if (!res.data?.SessionTicket) {
        const uniqueUser = `semedv${Math.random().toString(36).slice(2, 10)}`;
        res = await callPlayFabClient<PlayFabLoginPayload>("RegisterPlayFabUser", {
          Username: uniqueUser,
          Password: VIEWER_PASSWORD,
          RequireBothUsernameAndEmail: false,
        });
      }
      const ticket = res.data?.SessionTicket ?? null;
      if (ticket) {
        cachedViewerTicket = ticket;
        cachedViewerTicketTime = Date.now();
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              VIEWER_TICKET_KEY,
              JSON.stringify({ ticket, at: cachedViewerTicketTime }),
            );
          } catch {
            /* ignore */
          }
        }
      }
      return ticket;
    } finally {
      inFlightViewerTicketPromise = null;
    }
  })();

  return inFlightViewerTicketPromise;
}

function clearViewerTicket() {
  cachedViewerTicket = null;
  cachedViewerTicketTime = 0;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VIEWER_TICKET_KEY);
  } catch {
    /* ignore */
  }
}

async function readRemoteAdminConfigRaw(ticket: string): Promise<{ raw: string | null; ok: boolean }> {
  const res = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
    "GetUserData",
    { PlayFabId: ADMIN_CONFIG_OWNER_PLAYFAB_ID, Keys: [ADMIN_CONFIG_USERDATA_KEY] },
    ticket,
  );
  if (!res.error) {
    const val = res.data?.Data?.[ADMIN_CONFIG_USERDATA_KEY]?.Value ?? null;
    if (val) return { raw: val, ok: true };
  }
  // Fallback secundário para SharedGroup caso exista
  const sgRes = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
    "GetSharedGroupData",
    { SharedGroupId: ADMIN_CONFIG_SHARED_GROUP_ID },
    ticket,
  );
  if (!sgRes.error && sgRes.data?.Data?.[ADMIN_CONFIG_USERDATA_KEY]?.Value) {
    return { raw: sgRes.data.Data[ADMIN_CONFIG_USERDATA_KEY].Value, ok: true };
  }
  return { raw: null, ok: !res.error };
}

function applyRemoteConfig(
  localCfg: PlatformAdminConfig,
  remote: Partial<PlatformAdminConfig>,
): PlatformAdminConfig {
  // A configuração publicada pelo ADM é sempre a fonte da verdade.
  return saveAdminConfig({
    ...localCfg,
    ...remote,
    enabledGames: { ...DEFAULT_ENABLED_GAMES, ...(remote.enabledGames ?? {}) },
    gameCodes: { ...localCfg.gameCodes, ...(remote.gameCodes ?? {}) },
  } as PlatformAdminConfig);
}

export async function syncAdminConfigFromPlayFab(sessionTicket?: string): Promise<PlatformAdminConfig> {
  if (inFlightConfigSyncPromise && !sessionTicket) return inFlightConfigSyncPromise;

  const run = async (): Promise<PlatformAdminConfig> => {
    const localCfg = checkAndApplyScheduledReset();
    if (!isPlayFabConfigured()) return localCfg;

    // 1. Sessão do próprio aluno; 2. ticket de visitante (cacheado por dispositivo).
    const candidates: Array<() => Promise<string | null>> = [
      async () => sessionTicket ?? loadStoredSession()?.sessionTicket ?? null,
      () => getViewerPlayFabTicket(),
    ];

    for (let i = 0; i < candidates.length; i++) {
      try {
        const ticket = await candidates[i]();
        if (!ticket) continue;
        const { raw, ok } = await readRemoteAdminConfigRaw(ticket);
        if (!ok) {
          if (i === 1) clearViewerTicket(); // ticket expirado: renova no próximo acesso
          continue;
        }
        if (!raw) return localCfg; // ADM ainda não publicou nada
        const remote = JSON.parse(raw) as Partial<PlatformAdminConfig>;
        storeCachedRemoteConfig(raw);
        return applyRemoteConfig(localCfg, remote);
      } catch {
        /* tenta o próximo caminho */
      }
    }

    // Sem conexão / bloqueio temporário: usa a última configuração recebida do ADM.
    const cached = loadCachedRemoteConfig();
    return cached ? applyRemoteConfig(localCfg, cached) : localCfg;
  };

  if (sessionTicket) return run();
  inFlightConfigSyncPromise = run().finally(() => {
    inFlightConfigSyncPromise = null;
  });
  return inFlightConfigSyncPromise;
}

export async function pushAdminConfigToPlayFab(config: PlatformAdminConfig): Promise<PlatformAdminConfig> {
  const saved = saveAdminConfig(config);
  if (!isPlayFabConfigured()) {
    lastAdminCloudSyncError = "PlayFab não configurado.";
    return saved;
  }

  let ticket = await getAdminPlayFabTicket();
  if (!ticket) {
    lastAdminCloudSyncError = "Não foi possível autenticar a conta ADM no PlayFab (aguarde alguns segundos e tente novamente).";
    return saved;
  }
  const raw = JSON.stringify(saved);
  let res = await callPlayFabClient(
    "UpdateUserData",
    { Data: { [ADMIN_CONFIG_USERDATA_KEY]: raw }, Permission: "Public" },
    ticket,
  );
  // Se o ticket cacheado do ADM expirou, renova uma vez automaticamente
  if (res.error) {
    clearCachedAdminPlayFabTicket();
    ticket = await getAdminPlayFabTicket();
    if (ticket) {
      res = await callPlayFabClient(
        "UpdateUserData",
        { Data: { [ADMIN_CONFIG_USERDATA_KEY]: raw }, Permission: "Public" },
        ticket,
      );
    }
  }
  if (res.error) {
    lastAdminCloudSyncError = res.error;
  } else {
    lastAdminCloudSyncError = null;
    storeCachedRemoteConfig(raw);
    // Espelha também no SharedGroup em segundo plano
    if (ticket) {
      void callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ADMIN_CONFIG_SHARED_GROUP_ID,
          Data: { [ADMIN_CONFIG_USERDATA_KEY]: raw },
          Permission: "Public",
        },
        ticket,
      );
    }
  }
  return saved;
}

/* --------------------- Auth & Profile Operations --------------------- */

function getCurrentWeekKey(now = new Date()): string {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startMondayOffset = (startOfYear.getDay() + 6) % 7;
  const diffDays = Math.round((todayMidnight.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.floor((diffDays + startMondayOffset) / 7) + 1;
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const aligningPlayerKeys = new Set<string>();

export function ensurePlayerSeasonAligned(acc: StoredAccount, cfg: PlatformAdminConfig): StoredAccount {
  if (!acc || !acc.profile) return acc;
  const pKey = (acc.profile.nickNormalized || acc.profile.id || "").toLowerCase().trim();
  if (pKey && aligningPlayerKeys.has(pKey)) {
    return acc;
  }
  if (pKey) aligningPlayerKeys.add(pKey);
  try {

  // Captura as medalhas que o aluno já possuía antes de qualquer filtragem/alinhamento
  // para impedir concessão duplicada de XP ou Pontos de Carreira na mesma função
  const preExistingMedalIds = new Set<string>(
    (acc.profile.unlockedMedals ?? [])
      .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
      .filter(Boolean),
  );

  // Sincroniza a senha estritamente com a data de nascimento atual do aluno
  if (acc.profile.birthdate && !acc.profile.isAdmin && !isSpecialAdminAccount(acc.profile)) {
    acc.passwordHash = simpleHash(passwordFromBirthdate(acc.profile.birthdate));
  }

  // Concede login diário APENAS se este perfil for o jogador realmente autenticado na sessão local ativa
  const activeSession = loadStoredSession();
  const isCurrentActivePlayer = Boolean(
    activeSession?.playerId &&
      (acc.profile.nickNormalized === activeSession.playerId ||
        acc.profile.id === activeSession.playerId ||
        (activeSession.playfabId && acc.profile.playfabId === activeSession.playfabId)),
  );
  if (isCurrentActivePlayer && !acc.profile.isAdmin && !isSpecialAdminAccount(acc.profile)) {
    checkAndApplyDailyLoginPoints(acc.profile);
  }

  const todayKey = getLocalDateKey();
  if (acc.profile.dailyXpDate !== todayKey) {
    acc.profile.dailyXp = 0;
    acc.profile.dailyX1Xp = 0;
    acc.profile.dailyTournamentXp = 0;
    acc.profile.dailyTournamentEntries = 0;
    acc.profile.dailyXpDate = todayKey;
  }
  if (acc.profile.dailyPostCapDate !== todayKey) {
    acc.profile.dailyPostCapMatches = 0;
    acc.profile.dailyPostCapDate = todayKey;
  }
  const currentWeekKey = getCurrentWeekKey();
  if (acc.profile.weeklyX1WeekKey && acc.profile.weeklyX1WeekKey !== currentWeekKey) {
    acc.profile.weeklyX1Wins = 0;
    acc.profile.weeklyX1WeekKey = currentWeekKey;
  }

  const currentRankedSeason = cfg.rankedSeasonId ?? 1;
  const playerRankedSeason = acc.profile.rankedSeasonId ?? 1;

  // Se a temporada de ranqueada avançou no ADM, zera os pontos do jogador para a nova temporada
  if (playerRankedSeason < currentRankedSeason) {
    acc.profile.tournamentPoints = 0;
    acc.profile.bestTournamentPoints = 0;
    acc.profile.tournamentRankId = "bronze_1";
    acc.profile.rankedSeasonId = currentRankedSeason;
  } else {
    acc.profile.rankedSeasonId = currentRankedSeason;
    // Preserva e sincroniza os pontos da ranqueada acumulados na temporada (definida por 14 dias ou término do ADM).
    // Sincroniza diretamente com o registro oficial do Torneio Semanal para manter 100% de paridade entre a lista do rank e o perfil.
    const tourRec =
      getTournamentStoreRecord(acc.profile.id, acc.profile.nick) ||
      (acc.profile.playfabId ? getTournamentStoreRecord(acc.profile.playfabId, acc.profile.nick) : null) ||
      (acc.profile.nickNormalized ? getTournamentStoreRecord(acc.profile.nickNormalized, acc.profile.nickNormalized) : null);
    const tourPoints = Math.max(tourRec?.tournamentPoints ?? 0, tourRec?.bestScore ?? 0);
    const maxTournamentPts = Math.max(
      acc.profile.tournamentPoints ?? 0,
      acc.profile.bestTournamentPoints ?? 0,
      tourPoints,
    );

    if (maxTournamentPts > 0) {
      acc.profile.tournamentPoints = maxTournamentPts;
      acc.profile.bestTournamentPoints = Math.max(acc.profile.bestTournamentPoints ?? 0, maxTournamentPts);
      acc.profile.tournamentRankId = getTournamentRank(maxTournamentPts).currentRank.id;
    } else {
      if (typeof acc.profile.tournamentPoints !== "number") {
        acc.profile.tournamentPoints = 0;
      }
      if (!acc.profile.tournamentRankId) {
        acc.profile.tournamentRankId = "bronze_1";
      }
    }
  }
  acc.profile.tournamentWeekKey = currentWeekKey;

  const currentSeasonId = cfg.rankedSeasonId ?? 1;
  const currentSeasonKey = `Season_${currentSeasonId}`;
  const isAdminAcc = isSpecialAdminAccount(acc.profile);

  // As medalhas do Torneio Semanal são prêmios exclusivos concedidos no encerramento de ciclo (domingo às 23:59).
  // Remove qualquer medalha indevida emitida antes do término da semana corrente ou temporada ativa não encerrada:
  const totalM = Math.max(
    acc.profile.matchesPlayed ?? 0,
    (acc.profile as any)?.totalMatches ?? 0,
    Array.isArray(acc.stats) ? acc.stats.reduce((s, r) => s + (r.plays ?? 0), 0) : 0,
  );

  const isCorruptedNovice =
    !isAdminAcc &&
    acc.profile.matchesPlayed !== undefined &&
    acc.profile.matchesPlayed > 0 &&
    acc.profile.matchesPlayed <= 6 &&
    (acc.profile.xp ?? 0) <= 300 &&
    (acc.profile.level ?? 1) <= 2;

  if (Array.isArray(acc.profile.tournamentMedals)) {
    if (isCorruptedNovice) {
      acc.profile.tournamentMedals = [];
    } else {
      acc.profile.tournamentMedals = acc.profile.tournamentMedals
        .filter((m): m is any => Boolean(m && typeof m === "object"))
        .map((m) => {
          if (Array.isArray(m.historyWeeks)) {
            m.historyWeeks = m.historyWeeks.filter((w: string) => w !== currentWeekKey && w !== currentSeasonKey);
            m.count = Math.max(1, m.historyWeeks.length);
          }
          return m;
        })
        .filter((m) => Boolean(m && m.weekKey !== currentWeekKey && m.weekKey !== currentSeasonKey && !String(m.id || "").startsWith("projected_")));
    }
  }

  // Remove medalhas de pódio ranqueado e segredos de pódio emitidos indevidamente durante a temporada ativa:
  if (Array.isArray(acc.profile.unlockedMedals)) {
    acc.profile.unlockedMedals = acc.profile.unlockedMedals.filter((m: any) => {
      if (!m) return false;
      const rawId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
      const medalId = typeof rawId === "string" ? rawId : String(rawId || "");
      if (!medalId) return false;
      const isPodiumMedal =
        medalId === "tournament_top_1_gold" ||
        medalId === "tournament_top_2_silver" ||
        medalId === "tournament_top_3_bronze" ||
        medalId.startsWith("secret_top5_weeks_") ||
        medalId.startsWith("secret_top1_consecutive_");
      if (isPodiumMedal && !isAdminAcc) {
        if (isCorruptedNovice) return false;
        const hasPastSeasonMedal = Array.isArray(acc.profile.tournamentMedals) &&
          acc.profile.tournamentMedals.some((tm) => tm && tm.weekKey && tm.weekKey !== currentSeasonKey && tm.weekKey !== currentWeekKey);
        return hasPastSeasonMedal;
      }
      return true;
    });
  }

  // Retroverificação e Limpeza do X1:
  // Como o sistema anterior permitia finalizar partida sem oponente real, remove medalhas de X1
  // obtidas indevidamente antes do lançamento oficial:
  if (Array.isArray(acc.profile.unlockedMedals)) {
    acc.profile.unlockedMedals = acc.profile.unlockedMedals.filter((m: any) => {
      if (!m) return false;
      const rawId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
      const medalId = typeof rawId === "string" ? rawId : String(rawId || "");
      if (!medalId) return false;
      const isX1Medal =
        medalId.startsWith("x1_wins_") ||
        medalId.startsWith("x1_weekly_") ||
        medalId === "event_x1_wins";
      return !isX1Medal;
    });
  }
  if (acc.profile.x1Wins && (acc.profile.x1Matches ?? 0) === 0) {
    acc.profile.x1Wins = 0;
    acc.profile.weeklyX1Wins = 0;
  }

  // Filter out invalid, synthetic tournament, or disabled games from student stats
  if (!isAdminAcc && Array.isArray(acc.stats)) {
    acc.stats = acc.stats
      .filter(
        (s) =>
          s &&
          s.game_id &&
          ALL_GAME_IDS.includes(s.game_id) &&
          cfg.enabledGames[s.game_id] !== false &&
          ((s.plays ?? 0) > 0 || (s.best_score ?? 0) > 0 || (s.best_level ?? 1) > 1 || (s.wins ?? 0) > 0),
      )
      .map((s) => {
        const plays = Math.max(1, s.plays ?? 0);
        const hasWinEvidence =
          (s.wins ?? 0) > 0 ||
          (s.flawless_wins ?? 0) >= 1 ||
          (s.best_score ?? 0) >= 20 ||
          (s.best_level ?? 1) >= 2 ||
          plays >= 2;
        return {
          ...s,
          plays,
          wins: Math.max(0, s.wins ?? 0, hasWinEvidence ? 1 : 0),
        };
      });
  }

  const statsMap = aggregateStatsByGame(acc.stats, cfg.enabledGames);
  const aggregatedRows = Array.from(statsMap.values()).filter((s) => s.plays > 0);

  const effProg = getEffectivePlayerProgression(
    acc.profile,
    acc.stats,
    cfg.enabledGames,
  );
  const distinctGames = effProg.distinctGames;
  const totalMatchesCount = effProg.matchesPlayed;
  const totalWins = effProg.wins;

  acc.profile.xp = effProg.xp;
  acc.profile.distinctGamesPlayed = distinctGames;
  acc.profile.matchesPlayed = totalMatchesCount;
  acc.profile.totalMatches = totalMatchesCount;
  acc.profile.wins = totalWins;
  acc.profile.level = effProg.level;
  acc.profile.levelStageProgress = effProg.stageProgress;

  // Sanitiza inflação indevida de XP em contas de alunos regulares (ex: vazamento de moedas como XP ou cache local compartilhado)
  const isCorruptedStudentXp =
    !isAdminAcc &&
    (((acc.profile.xp ?? 0) > 8000 && totalMatchesCount < 30) ||
      ((acc.profile.xp ?? 0) > Math.max(500, totalMatchesCount * 50)));

  if (isCorruptedStudentXp) {
    const legitimateXp = aggregatedRows.reduce((sum, r) => sum + Math.min(r.plays * 25, 1000), 0) + (totalWins * 15);
    acc.profile.xp = legitimateXp;
    acc.profile.seasonXp = legitimateXp;
    const stageRes = syncLevelStageProgress({
      xp: legitimateXp,
      lifetimeMatches: totalMatchesCount,
      lifetimeWins: totalWins,
      lifetimeDistinctGames: distinctGames,
      playedGameIds: aggregatedRows.map((r) => r.game_id),
      currentLevel: effProg.level > 4 ? (totalMatchesCount >= 20 ? 3 : 2) : effProg.level,
      existingStage: acc.profile.levelStageProgress ?? null,
      maxAvailableGames: ALL_GAME_IDS.length,
    });
    acc.profile.level = stageRes.level;
    acc.profile.levelStageProgress = stageRes.stageProgress;

    // Remove badges de XP e nível infladas
    if (Array.isArray(acc.profile.badges)) {
      acc.profile.badges = acc.profile.badges.filter(
        (b) => b && b.id !== "xp_1000" && b.id !== "xp_5000" && b.id !== "nivel_5" && b.id !== "nivel_10"
      );
    }
    // Remove medalhas de nível 5+
    if (Array.isArray(acc.profile.unlockedMedals)) {
      acc.profile.unlockedMedals = acc.profile.unlockedMedals.filter((m: any) => {
        if (!m) return false;
        const rawId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
        const mId = typeof rawId === "string" ? rawId : String(rawId || "");
        if (!mId) return false;
        return !(
          mId.startsWith("lvl_5") ||
          mId.startsWith("lvl_6") ||
          mId.startsWith("lvl_7") ||
          mId.startsWith("lvl_8") ||
          mId.startsWith("lvl_9") ||
          mId.startsWith("lvl_10") ||
          mId === "xp_1000" ||
          mId === "xp_5000"
        );
      });
    }
  }

  acc.profile.badges = computeBadges({
    existing: acc.profile.badges ?? [],
    xp: acc.profile.xp,
    wins: totalWins,
    matchesPlayed: totalMatchesCount,
    distinctGamesPlayed: distinctGames,
    lastMatchScore: aggregatedRows.reduce((m, r) => Math.max(m, r.best_score ?? 0), 0),
  });
  acc.profile.stats = acc.stats;

  const allAvailable = getAllAvailableMedals(cfg.customMedals);
  const medalDefMap = new Map<string, MedalDefinition>(allAvailable.map((m) => [m.id, m]));
  const trueFlawlessSet = getDistinctFlawlessGames(
    acc.profile,
    acc.stats,
    undefined,
    cfg.enabledGames,
  );
  const trueFlawlessCount = trueFlawlessSet.size;
  // Contagem estrita de jogos com 2+ partidas concluídas (sem heurística)
  const gamesWith2Plays = aggregatedRows.filter((s) => s.plays >= 2).length;
  const gamesWith10Plays = aggregatedRows.filter((s) => s.plays >= 10).length;

  // Always verify and clamp streakDays to legitimate verified daily activity
  acc.profile.streakDays = getPlayerStreakDays(acc.profile);

  // Reconcile all unlocked medals so any improperly awarded medal returns to its proper progress
  if (acc.profile.unlockedMedals && acc.profile.unlockedMedals.length > 0 && !isAdminAcc) {
    let filtered = acc.profile.unlockedMedals.filter((m: any) => {
      if (!m) return false;
      const rawId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
      const mId = typeof rawId === "string" ? rawId : String(rawId || "");
      if (!mId) return false;
      // Legacy X1 IDs
      if (mId.startsWith("m_x1_win_") && (acc.profile.x1Wins ?? 0) === 0) {
        return false;
      }
      // Permanent immunity for Beta Tester and Special Robot boss medals
      if (
        mId === "m_rpg_ametista" ||
        mId === "m_rpg_carmesim" ||
        mId.startsWith("beta_tester_")
      ) {
        return true;
      }
      const def = medalDefMap.get(mId);
      if (!def) return true;
      const cond = def.condition;

      switch (cond.type) {
        case "player_level":
          return acc.profile.level >= (cond.threshold ?? 2);

        case "all_level_medals":
          return acc.profile.level >= 10;

        case "streak_days":
          return getPlayerStreakDays(acc.profile) >= (cond.threshold ?? 3);

        case "max_daily_xp":
          return acc.profile.xp >= (cond.threshold ?? 1000);

        case "total_matches_played":
          return totalMatchesCount >= (cond.threshold ?? 50);

        case "top5_weeks_count":
          return getTop5TotalWeeks(acc.profile) >= (cond.threshold ?? 2);

        case "top1_consecutive_weeks":
          return getTop1ConsecutiveWeeks(acc.profile) >= (cond.threshold ?? 2);

        case "tournament_rank":
          return Boolean(
            Array.isArray(acc.profile.tournamentMedals) &&
              acc.profile.tournamentMedals.some((tm) => tm.rank === cond.targetRank),
          );

        case "tournament_rank_mastery": {
          const pts = Math.max(
            acc.profile.tournamentPoints ?? 0,
            acc.profile.bestTournamentPoints ?? 0,
          );
          return pts >= (cond.threshold ?? 61);
        }

        case "game_best_level": {
          if (!cond.gameId || cfg.enabledGames[cond.gameId] === false) return false;
          const row = statsMap.get(cond.gameId);
          return Boolean(row && row.plays > 0 && row.best_level >= (cond.threshold ?? 3));
        }

        case "game_flawless": {
          if (!cond.gameId || cfg.enabledGames[cond.gameId] === false) return false;
          const row = statsMap.get(cond.gameId);
          const minScore = cond.threshold ?? 30;
          return Boolean(
            row &&
              row.flawless_wins >= 1 &&
              row.best_score >= minScore &&
              !(row.plays === 1 && (row.last_wrong ?? 0) > 0),
          );
        }

        case "game_match_count": {
          if (!cond.gameId || cfg.enabledGames[cond.gameId] === false) return false;
          const row = statsMap.get(cond.gameId);
          return Boolean(row && row.plays >= (cond.threshold ?? 10));
        }

        case "distinct_games":
          return distinctGames >= (cond.threshold ?? 3);

        case "distinct_flawless_games":
          return trueFlawlessCount >= (cond.threshold ?? 3);

        case "x1_wins_total":
          return (acc.profile.x1Wins ?? 0) >= (cond.threshold ?? 1);

        case "x1_wins_weekly":
          return (acc.profile.x1Wins ?? 0) >= (cond.threshold ?? 5);

        case "beta_tester_prata":
          return gamesWith2Plays >= 4;

        case "beta_tester_ouro":
          return gamesWith2Plays >= 6;

        case "beta_tester_platina":
          return gamesWith2Plays >= (def?.condition.threshold ?? 10);

        case "beta_tester_heroi":
          return gamesWith10Plays >= (def?.condition.threshold ?? 10) && acc.profile.level >= 5;

        case "all_game_medals":
          return ALL_GAME_IDS.filter((gId) => cfg.enabledGames[gId] !== false).every((gId) => {
            const r = statsMap.get(gId);
            return Boolean(r && r.plays > 0 && r.best_level >= 3);
          });

        default:
          return true;
      }
    });

    // Check total_medals_count (meta_collector_50 / meta_collector_80) after filtering
    filtered = filtered.filter((m: any) => {
      if (!m) return false;
      const rawId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
      const mId = typeof rawId === "string" ? rawId : String(rawId || "");
      if (!mId) return false;
      // Permanent immunity for Beta Tester and Special Robot boss medals
      if (
        mId === "m_rpg_ametista" ||
        mId === "m_rpg_carmesim" ||
        mId.startsWith("beta_tester_")
      ) {
        return true;
      }
      const def = medalDefMap.get(mId);
      if (def?.condition.type === "total_medals_count") {
        return filtered.length >= (def.condition.threshold ?? 50);
      }
      if (mId.endsWith("_lvl_master") && !isAdminAcc) {
        const gId = mId.replace("game_", "").replace("_lvl_master", "") as GameId;
        const row = statsMap.get(gId);
        if (!row || (row.best_level ?? 1) < 5) return false;
      }
      if (mId.endsWith("_flawless") && !isAdminAcc) {
        const gId = mId.replace("game_", "").replace("_flawless", "") as GameId;
        const row = statsMap.get(gId);
        if (!row || (row.flawless_wins ?? 0) <= 0) return false;
      }
      return true;
    });

    acc.profile.unlockedMedals = filtered;
  }

  // Avalia e concede automaticamente medalhas legítimas que o aluno tem direito (ex: nível atualizado ou exploração)
  if (!isAdminAcc) {
    const legitimatelyAwarded = evaluatePlayerMedals(
      {
        profile: acc.profile,
        stats: acc.stats,
        enabledGames: cfg.enabledGames,
        todayXpEarned: acc.profile.dailyXp,
        streakDays: acc.profile.streakDays,
        weeklyX1Wins: acc.profile.weeklyX1Wins,
      },
      allAvailable,
    );
    if (legitimatelyAwarded.length > 0) {
      const unlocked = acc.profile.unlockedMedals ?? [];
      const nowIso = new Date().toISOString();
      let bonusXp = 0;
      for (const m of legitimatelyAwarded) {
        if (!unlocked.some((u) => u.medalId === m.id)) {
          unlocked.push({ medalId: m.id, unlockedAt: nowIso });
          // Só concede XP e Pontos de Carreira se a medalha realmente NÃO existia antes do filtro
          if (!preExistingMedalIds.has(m.id)) {
            const extraXp = MEDAL_XP_REWARDS[m.rarity] ?? 10;
            bonusXp += extraXp;
            const ptsReward = MEDAL_POINTS_REWARDS[m.rarity] ?? 20;
            awardCareerPoints(acc.profile, ptsReward, `Medalha: ${m.title}`);
          }
        }
      }
      acc.profile.unlockedMedals = unlocked;
      if (bonusXp > 0) {
        acc.profile.xp += bonusXp;
        acc.profile.seasonXp = (acc.profile.seasonXp ?? 0) + bonusXp;
      }
    }

    // Concessão para o jogador ZHERET que comprovadamente derrotou o Robô Ametista na Batalha de Robôs
    if (acc.profile.nickNormalized === "zheret") {
      const unlocked = acc.profile.unlockedMedals ?? [];
      if (!unlocked.some((u) => u.medalId === "m_rpg_ametista")) {
        unlocked.push({
          medalId: "m_rpg_ametista",
          unlockedAt: new Date().toISOString(),
          count: 1,
        });
        acc.profile.unlockedMedals = unlocked;
      }
    }
  }

  // Inicializa e sanitiza pontos de carreira após reconciliar stats, nível e medalhas
  ensurePlayerCareerPointsInitialized(acc.profile);

  // Sanitization: Players in Etapa 3 (15+ years old) cannot belong to elementary SEMED schools or classes.
  // If institution is "Nenhuma" or "Outro", grade and turma are always null.
  if (isEtapa3OrOlder(acc.profile.birthdate)) {
    if (isOfficialSemedSchool(acc.profile.school)) {
      acc.profile.school = "Outro";
    }
    acc.profile.grade = null;
    acc.profile.turma = null;
  } else if (acc.profile.school === "Nenhuma" || acc.profile.school === "Outro") {
    acc.profile.grade = null;
    acc.profile.turma = null;
  }

  // Ensure passive/cumulative medals (level, distinct games, total count, etc.) are awarded when criteria met
  const earnedPassively = evaluatePlayerMedals(
    {
      profile: acc.profile,
      stats: acc.stats,
      todayXpEarned: acc.profile.dailyXp,
      streakDays: acc.profile.streakDays,
      weeklyX1Wins: acc.profile.weeklyX1Wins,
      enabledGames: cfg.enabledGames,
    },
    allAvailable,
  );
  if (earnedPassively.length > 0) {
    const currentUnlocked = [...(acc.profile.unlockedMedals ?? [])];
    const nowIso = new Date().toISOString();
    let updated = false;
    for (const m of earnedPassively) {
      if (!currentUnlocked.some((u) => u.medalId === m.id)) {
        currentUnlocked.push({ medalId: m.id, unlockedAt: nowIso });
        updated = true;
      }
    }
    if (updated) {
      acc.profile.unlockedMedals = currentUnlocked;
    }
  }

  if (acc.profile.seasonId !== cfg.seasonId) {
    acc.profile.seasonId = cfg.seasonId;
    acc.profile.seasonXp = 0;
    acc.stats = [];
    if (cfg.resetHistory?.[0]?.resetXp) {
      acc.profile.xp = 0;
      acc.profile.level = 1;
      acc.profile.levelStageProgress = {
        forLevel: 1,
        matches: 0,
        wins: 0,
        distinctGames: [],
      };
      acc.profile.wins = 0;
      acc.profile.matchesPlayed = 0;
      acc.profile.distinctGamesPlayed = 0;
      acc.profile.dailyXp = 0;
    }
  }

  acc.profile.totalMatches = acc.profile.matchesPlayed;
  acc.profile.stats = acc.stats;
  return acc;
  } finally {
    if (pKey) aligningPlayerKeys.delete(pKey);
  }
}

function findAccountByFullNameAndPassword(
  reg: Record<string, StoredAccount>,
  fullName: string,
  normalizedPass: string,
  birthdateIso?: string,
): StoredAccount | null {
  const targetName = fullNameSlug(fullName);
  if (!targetName) return null;
  const passHash = simpleHash(normalizedPass);

  for (const acc of Object.values(reg)) {
    const accName = fullNameSlug(acc.profile.full_name);
    if (accName !== targetName) continue;
    const accPassFromBirth = passwordFromBirthdate(acc.profile.birthdate);
    if (
      acc.passwordHash === passHash ||
      accPassFromBirth === normalizedPass ||
      (birthdateIso && acc.profile.birthdate === birthdateIso)
    ) {
      return acc;
    }
  }
  return null;
}

function findAccountByFullNameOnly(
  reg: Record<string, StoredAccount>,
  fullName: string,
): StoredAccount | null {
  const targetName = fullNameSlug(fullName);
  if (!targetName) return null;
  for (const acc of Object.values(reg)) {
    if (fullNameSlug(acc.profile.full_name) === targetName) {
      return acc;
    }
  }
  return null;
}

interface PlayFabLoginPayload {
  PlayFabId: string;
  SessionTicket: string;
  InfoResultPayload?: {
    UserData?: Record<string, { Value: string }>;
    PlayerStatistics?: { StatisticName: string; Value: number }[];
    AccountInfo?: { TitleInfo?: { DisplayName?: string }; Username?: string };
  };
}

function buildAccountFromPlayFabPayload(
  payload: PlayFabLoginPayload,
  fallbackNick: string,
  normalizedPassword: string,
  cfg: PlatformAdminConfig,
): StoredAccount {
  const playfabId = payload.PlayFabId;
  const userData = payload.InfoResultPayload?.UserData ?? {};
  const pfStats = payload.InfoResultPayload?.PlayerStatistics ?? [];
  const displayName =
    payload.InfoResultPayload?.AccountInfo?.TitleInfo?.DisplayName || fallbackNick.trim();

  let parsedProfile: Partial<PlayerProfile> = {};
  if (userData.PlayerProfile?.Value) {
    try {
      parsedProfile = JSON.parse(userData.PlayerProfile.Value);
    } catch {
      /* ignore */
    }
  }

  let parsedStats: GameStatRow[] = [];
  if (userData.GameStats?.Value) {
    try {
      parsedStats = JSON.parse(userData.GameStats.Value);
    } catch {
      /* ignore */
    }
  }

  let parsedUnlocked: GameId[] = [];
  if (userData.UnlockedGames?.Value) {
    try {
      parsedUnlocked = JSON.parse(userData.UnlockedGames.Value);
    } catch {
      /* ignore */
    }
  }

  const resolvedNick = parsedProfile.nick || displayName || fallbackNick;
  const slug = nickSlug(resolvedNick) || `pf_${playfabId.toLowerCase()}`;
  const statXp = pfStats.find((s) => s.StatisticName === "XP_Total")?.Value ?? 0;
  const xp = Math.max(parsedProfile.xp ?? 0, statXp);
  const distinctGamesPlayed = getDistinctGamesPlayed(parsedProfile, parsedStats);
  const wins = parsedProfile.wins ?? 0;
  const matchesPlayed = Math.max(
    parsedProfile.matchesPlayed ?? 0,
    parsedProfile.totalMatches ?? 0,
    (parsedProfile as any).totalPlays ?? 0,
  );

  const mergedProfile: PlayerProfile = {
    id: playfabId ?? `pf_${slug}`,
    playfabId,
    nick: resolvedNick,
    nickNormalized: slug,
    full_name: formatFullNameUpper((parsedProfile.full_name || displayName).trim()),
    school:
      parsedProfile.school && isValidSchool(parsedProfile.school)
        ? parsedProfile.school
        : SCHOOLS[0].name,
    grade: parsedProfile.grade ?? null,
    birthdate: parsedProfile.birthdate || "2015-01-01",
    xp,
    seasonXp: parsedProfile.seasonXp ?? xp,
    level: calculatePlayerLevel({
      xp,
      matchesPlayed,
      wins,
      distinctGames: distinctGamesPlayed,
      currentLevel: parsedProfile.level,
      stageProgress: parsedProfile.levelStageProgress,
    }),
    levelStageProgress: parsedProfile.levelStageProgress,
    wins,
    x1Wins: parsedProfile.x1Wins ?? 0,
    weeklyX1Wins: parsedProfile.weeklyX1Wins ?? 0,
    weeklyX1WeekKey: parsedProfile.weeklyX1WeekKey,
    matchesPlayed,
    distinctGamesPlayed,
    dailyXp: parsedProfile.dailyXp ?? 0,
    dailyXpDate: parsedProfile.dailyXpDate ?? getLocalDateKey(),
    dailyTournamentEntries: parsedProfile.dailyTournamentEntries ?? 0,
    dailyTournamentXp: parsedProfile.dailyTournamentXp ?? 0,
    tournamentPoints: parsedProfile.tournamentPoints ?? 0,
    bestTournamentPoints: Math.max(
      parsedProfile.bestTournamentPoints ?? 0,
      parsedProfile.tournamentPoints ?? 0,
    ),
    tournamentRankId: parsedProfile.tournamentRankId ?? "bronze_1",
    tournamentWeekKey: parsedProfile.tournamentWeekKey ?? getCurrentWeekKey(),
    streakDays: getPlayerStreakDays(parsedProfile),
    lastActiveDate: parsedProfile.lastActiveDate,
    activeDates: Array.isArray(parsedProfile.activeDates) ? parsedProfile.activeDates : [],
    tournamentMedals: Array.isArray(parsedProfile.tournamentMedals)
      ? parsedProfile.tournamentMedals
      : [],
    unlockedMedals: Array.isArray(parsedProfile.unlockedMedals)
      ? parsedProfile.unlockedMedals
      : [],
    badges: Array.isArray(parsedProfile.badges) ? parsedProfile.badges : [],
    careerPoints: parsedProfile.careerPoints ?? 0,
    pointsBalance: parsedProfile.pointsBalance ?? 0,
    coins: parsedProfile.coins ?? 0,
    claimedInboxRewardIds: Array.isArray(parsedProfile.claimedInboxRewardIds)
      ? parsedProfile.claimedInboxRewardIds
      : [],
    lastDailyLoginPointsDate: parsedProfile.lastDailyLoginPointsDate,
    lastDailyFirstGamePointsDate: parsedProfile.lastDailyFirstGamePointsDate,
    achievedLevelsPoints: Array.isArray(parsedProfile.achievedLevelsPoints)
      ? parsedProfile.achievedLevelsPoints
      : [],
    achievedTournamentTiers: Array.isArray(parsedProfile.achievedTournamentTiers)
      ? parsedProfile.achievedTournamentTiers
      : [],
    eventProgress: parsedProfile.eventProgress,
    isAdmin: parsedProfile.isAdmin || slug === "admin" || slug === "semed_admin",
    seasonId: parsedProfile.seasonId ?? cfg.seasonId,
  };

  return ensurePlayerSeasonAligned(
    {
      profile: mergedProfile,
      passwordHash: simpleHash(normalizedPassword),
      unlocked: parsedUnlocked,
      stats: parsedStats,
      updatedAt: new Date().toISOString(),
    },
    cfg,
  );
}

export async function playfabSignUp(data: SignUpData): Promise<{
  account: StoredAccount | null;
  error: string | null;
  recoveredNick?: string;
}> {
  const cfg = checkAndApplyScheduledReset();
  const slug = nickSlug(data.nick);
  if (slug.length < 3 || slug.length > 20) {
    return {
      account: null,
      error: "O apelido precisa ter entre 3 e 20 letras ou números (sem espaços).",
    };
  }
  if (!data.fullName.trim()) {
    return { account: null, error: "Informe o seu nome completo." };
  }
  if (!isValidSchool(data.school)) {
    return { account: null, error: "Selecione uma instituição válida." };
  }
  if (!data.birthdate) {
    return { account: null, error: "Informe a sua data de nascimento." };
  }

  // The student's password is automatically derived from their birthdate in DDMMAA format (e.g. 20/01/2014 -> 200114)
  const derivedPassword = passwordFromBirthdate(data.birthdate);
  if (derivedPassword.length < 6) {
    return { account: null, error: "Data de nascimento inválida." };
  }

  const reg = loadRegistry();

  // If a student with the exact same Full Name + Birthdate already exists, log them in automatically!
  const existingByPerson = findAccountByFullNameAndPassword(
    reg,
    data.fullName,
    derivedPassword,
    data.birthdate,
  );
  if (existingByPerson) {
    const aligned = ensurePlayerSeasonAligned(existingByPerson, cfg);
    reg[aligned.profile.nickNormalized] = aligned;
    saveRegistry(reg);
    saveStoredSession({
      playerId: aligned.profile.nickNormalized,
      playfabId: aligned.profile.playfabId,
    });
    syncLocalBrowserFromAccount(aligned);
    return {
      account: aligned,
      error: null,
      recoveredNick: aligned.profile.nick,
    };
  }

  const nickCleanLower = data.nick.trim().toLowerCase();
  const isNickTaken =
    Boolean(reg[slug]) ||
    isTombstoned(slug) ||
    Object.values(reg).some(
      (a) =>
        a.profile.nickNormalized === slug ||
        a.profile.nick.trim().toLowerCase() === nickCleanLower
    );
  if (isNickTaken) {
    return { account: null, error: "Esse apelido já está em uso por outro jogador. Por favor, escolha outro apelido." };
  }

  let playfabId: string | undefined;
  let sessionTicket: string | undefined;

  if (isPlayFabConfigured()) {
    // Mapeia o Username para formato alfanumérico seguro (PlayFab proíbe '_' no campo Username)
    // O apelido original com underlines é preservado integralmente no DisplayName e no perfil
    const pfUsername = playfabUsernameFromNick(data.nick);
    const res = await callPlayFabClient<{
      PlayFabId: string;
      SessionTicket: string;
    }>("RegisterPlayFabUser", {
      Username: pfUsername,
      Password: derivedPassword,
      DisplayName: data.nick.trim().slice(0, 25),
      RequireBothUsernameAndEmail: false,
    });

    if (res.error) {
      if (
        res.errorCode === "UsernameNotAvailable" ||
        res.errorCode === "NameNotAvailable" ||
        res.error.toLowerCase().includes("available") ||
        res.error.toLowerCase().includes("taken") ||
        res.error.toLowerCase().includes("already in use")
      ) {
        return { account: null, error: "Esse apelido já está em uso por outro jogador. Por favor, escolha outro apelido." };
      }
      const sanitizedError = res.error
        ? String(res.error).replace(/PlayFab:?\s*/gi, "").trim()
        : "Não foi possível concluir o registro na nuvem.";
      return { account: null, error: sanitizedError || "Falha ao registrar ou sincronizar perfil." };
    }

    playfabId = res.data?.PlayFabId;
    sessionTicket = res.data?.SessionTicket;

    // Link CustomId para o Nick (suporta underlines nativamente) e CustomId para Nome Completo + DDMMAA
    if (sessionTicket) {
      try {
        await callPlayFabClient(
          "LinkCustomID",
          {
            CustomId: `nick_${slug}`,
            ForceLink: true,
          },
          sessionTicket,
        );
      } catch {
        // ignore optional link
      }
      try {
        await callPlayFabClient(
          "LinkCustomID",
          {
            CustomId: studentCustomId(data.fullName, derivedPassword),
            ForceLink: false,
          },
          sessionTicket,
        );
      } catch {
        // ignore optional link
      }
    }
  }

  const age = ageFrom(data.birthdate);
  const isOver15 = isEtapa3OrOlder(data.birthdate);
  const isOver11 = age > 11;
  let resolvedSchool = data.school;
  if (isOver15 && isOfficialSemedSchool(data.school)) {
    resolvedSchool = "Nenhuma";
  } else if (isOver11 && is5thGradeSchool(data.school)) {
    resolvedSchool = "Nenhuma";
  }
  const isNoSchool = resolvedSchool === "Nenhuma" || resolvedSchool === "Outro" || isOver15;
  const resolvedGrade = isNoSchool ? null : data.grade;
  const resolvedTurma = isNoSchool ? null : data.turma;

  const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const profile: PlayerProfile = {
    id: playfabId ?? `pf_local_${slug}`,
    playfabId,
    nick: data.nick.trim(),
    nickNormalized: slug,
    full_name: formatFullNameUpper(data.fullName.trim()),
    school: resolvedSchool,
    grade: resolvedGrade,
    turma: resolvedTurma,
    birthdate: data.birthdate,
    xp: 0,
    seasonXp: 0,
    level: 1,
    wins: 0,
    matchesPlayed: 0,
    distinctGamesPlayed: 0,
    dailyXp: 0,
    dailyXpDate: getLocalDateKey(),
    streakDays: 0,
    activeDates: [],
    badges: [],
    isAdmin: isSpecialAdminAccount({ nickNormalized: slug }) || slug === "admin" || slug === "semed_admin",
    seasonId: cfg.seasonId,
    activeSessionId: newActiveSessionId,
    activeSessionUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const account: StoredAccount = {
    profile,
    passwordHash: simpleHash(derivedPassword),
    unlocked: [],
    stats: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  checkAndApplyDailyLoginPoints(account.profile);

  reg[slug] = account;
  saveRegistry(reg);
  saveStoredSession({ playerId: slug, sessionTicket, playfabId, activeSessionId: newActiveSessionId });
  clearLocalStats();
  clearUnlocked();

  if (sessionTicket && isPlayFabConfigured()) {
    await pushProfileToPlayFab(account, sessionTicket);
  }

  return { account, error: null };
}

/**
 * Signs in a student using EITHER their Nickname (Apelido) OR their Full Name (Nome Completo),
 * and their Birthdate password (`DDMMAA`, e.g., `200114` for `20/01/2014`).
 */
export async function playfabSignIn(
  identifier: string,
  rawPassword: string,
): Promise<{
  account: StoredAccount | null;
  error: string | null;
  recoveredNick?: string;
  needsRecovery?: boolean;
}> {
  const cfg = checkAndApplyScheduledReset();
  const cleanId = identifier.trim();
  const normalizedPassword = normalizeBirthdatePasswordInput(rawPassword);

  if (!cleanId || !normalizedPassword) {
    return {
      account: null,
      error: "Informe seu apelido (ou nome completo) e sua data de nascimento (ex: 200114).",
    };
  }

  const reg = loadRegistry();
  // 0. Dedicated Administrators: JOSINEY and QUEMUEL (replaces default admin)
  const rawUpper = rawPassword.trim().toUpperCase();
  const cleanIdLower = cleanId.toLowerCase().trim();

  let matchedAdminKey: "josiney" | "quemuel" | null = null;
  if (
    cleanIdLower === "josiney" ||
    (cleanIdLower === "admin" && rawUpper === "SEMED2620ZZ") ||
    (cleanIdLower === "adm" && rawUpper === "SEMED2620ZZ")
  ) {
    if (rawUpper === "SEMED2620ZZ") {
      matchedAdminKey = "josiney";
    }
  } else if (
    cleanIdLower === "quemuel" ||
    (cleanIdLower === "admin" && rawUpper === "SEMED2620QQ") ||
    (cleanIdLower === "adm" && rawUpper === "SEMED2620QQ")
  ) {
    if (rawUpper === "SEMED2620QQ") {
      matchedAdminKey = "quemuel";
    }
  }

  if (matchedAdminKey) {
    const adminKey = matchedAdminKey;
    const adminNick = adminKey === "josiney" ? "JOSINEY" : "QUEMUEL";
    const adminFullName =
      adminKey === "josiney"
        ? "JOSINEY - ADMINISTRAÇÃO SEMED"
        : "QUEMUEL - ADMINISTRAÇÃO SEMED";

    let adminAcc = reg[adminKey];
    if (!adminAcc) {
      adminAcc = {
        profile: {
          id: `admin-${adminKey}`,
          nick: adminNick,
          nickNormalized: adminKey,
          full_name: adminFullName,
          school: "SEMED - Gestão Central",
          grade: "Gestão",
          turma: "ADM",
          birthdate: "1990-01-01",
          xp: 8500,
          seasonXp: 8500,
          level: 10,
          wins: 50,
          matchesPlayed: 60,
          distinctGamesPlayed: 10,
          badges: [],
          isAdmin: true,
          seasonId: cfg.seasonId,
        },
        passwordHash: simpleHash(rawUpper),
        unlocked: [...ALL_GAME_IDS],
        stats: [],
        updatedAt: new Date().toISOString(),
      };
      reg[adminKey] = adminAcc;
      saveRegistry(reg);
    } else {
      adminAcc.profile.isAdmin = true;
    }
    setAdminUnlockedSession(true);

    let adminSessionTicket: string | undefined;
    let adminPlayFabId: string | undefined;
    if (isPlayFabConfigured()) {
      const pfAdminUser = adminKey === "josiney" ? "adminjosiney" : "adminquemuel";
      const pfAdminPass = adminKey === "josiney" ? "SEMED2620ZZadm" : "SEMED2620QQadm";
      const pfLogin = await callPlayFabClient<PlayFabLoginPayload>("LoginWithPlayFab", {
        Username: pfAdminUser,
        Password: pfAdminPass,
      });
      if (pfLogin.data?.SessionTicket) {
        adminSessionTicket = pfLogin.data.SessionTicket;
        adminPlayFabId = pfLogin.data.PlayFabId;
      }
    }

    saveStoredSession({
      playerId: adminKey,
      sessionTicket: adminSessionTicket ?? `admin-${adminKey}-session-ticket`,
      playfabId: adminPlayFabId,
    });
    syncLocalBrowserFromAccount(adminAcc);
    return { account: adminAcc, error: null };
  }

  const slugCandidate = nickSlug(cleanId);
  const typedAsFullName = cleanId.includes(" ") || !reg[slugCandidate];

  // Resolve target account in local registry by Nick OR by Full Name
  const localByNick = reg[slugCandidate] ?? null;
  const localByFullName =
    findAccountByFullNameAndPassword(reg, cleanId, normalizedPassword) ??
    findAccountByFullNameOnly(reg, cleanId);
  const matchedLocal = localByNick ?? localByFullName;
  const resolvedSlug = matchedLocal ? matchedLocal.profile.nickNormalized : slugCandidate;

  if (isPlayFabConfigured()) {
    // 1. Try LoginWithPlayFab (Username + Password) usando o Username sanitizado para PlayFab
    const pfUsername = playfabUsernameFromNick(resolvedSlug);
    if (pfUsername.length >= 3 && pfUsername.length <= 20) {
      const res = await callPlayFabClient<PlayFabLoginPayload>("LoginWithPlayFab", {
        Username: pfUsername,
        Password: normalizedPassword,
        InfoRequestParameters: {
          GetUserData: true,
          GetPlayerStatistics: true,
          GetUserAccountInfo: true,
        },
      });

      if (!res.error && res.data) {
        const account = buildAccountFromPlayFabPayload(
          res.data,
          matchedLocal?.profile.nick ?? cleanId,
          normalizedPassword,
          cfg,
        );
        if (
          account.profile.deletedAt &&
          !account.profile.isAdmin &&
          !isSpecialAdminAccount(account.profile)
        ) {
          return {
            account: null,
            error:
              "Esta conta foi suspensa e movida para a lixeira pelo administrador. Procure a coordenação escolar.",
          };
        }

        // Sessão Única Modelo A: Gera novo activeSessionId e desloga aparelhos anteriores
        const previousSessionId = account.profile.activeSessionId;
        const currentLocalSessionId = loadStoredSession()?.activeSessionId;
        const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        if (previousSessionId && previousSessionId !== currentLocalSessionId) {
          recordDeviceSecurityAlert({
            studentNick: account.profile.nick,
            studentFullName: account.profile.full_name,
            studentId: account.profile.nickNormalized,
            deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Navegador Web",
            timestamp: Date.now(),
          });
        }

        account.profile.activeSessionId = newActiveSessionId;
        account.profile.activeSessionUpdatedAt = new Date().toISOString();
        checkAndApplyDailyLoginPoints(account.profile);

        reg[account.profile.nickNormalized] = account;
        saveRegistry(reg);
        saveStoredSession({
          playerId: account.profile.nickNormalized,
          sessionTicket: res.data.SessionTicket,
          playfabId: res.data.PlayFabId,
          activeSessionId: newActiveSessionId,
        });
        syncLocalBrowserFromAccount(account);
        return {
          account,
          error: null,
          recoveredNick: typedAsFullName ? account.profile.nick : undefined,
        };
      }
    }

    // 1.1 Try LoginWithCustomID por nick (suporta underlines)
    const nickCustomRes = await callPlayFabClient<PlayFabLoginPayload>("LoginWithCustomID", {
      CustomId: `nick_${resolvedSlug}`,
      CreateAccount: false,
      InfoRequestParameters: {
        GetUserData: true,
        GetPlayerStatistics: true,
        GetUserAccountInfo: true,
      },
    });

    if (!nickCustomRes.error && nickCustomRes.data) {
      const account = buildAccountFromPlayFabPayload(
        nickCustomRes.data,
        matchedLocal?.profile.nick ?? cleanId,
        normalizedPassword,
        cfg,
      );
      if (
        account.profile.deletedAt &&
        !account.profile.isAdmin &&
        !isSpecialAdminAccount(account.profile)
      ) {
        return {
          account: null,
          error:
            "Esta conta foi suspensa e movida para a lixeira pelo administrador. Procure a coordenação escolar.",
        };
      }

      const previousSessionId = account.profile.activeSessionId;
      const currentLocalSessionId = loadStoredSession()?.activeSessionId;
      const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      if (previousSessionId && previousSessionId !== currentLocalSessionId) {
        recordDeviceSecurityAlert({
          studentNick: account.profile.nick,
          studentFullName: account.profile.full_name,
          studentId: account.profile.nickNormalized,
          deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Navegador Web",
          timestamp: Date.now(),
        });
      }

      account.profile.activeSessionId = newActiveSessionId;
      account.profile.activeSessionUpdatedAt = new Date().toISOString();
      checkAndApplyDailyLoginPoints(account.profile);

      reg[account.profile.nickNormalized] = account;
      saveRegistry(reg);
      saveStoredSession({
        playerId: account.profile.nickNormalized,
        sessionTicket: nickCustomRes.data.SessionTicket,
        playfabId: nickCustomRes.data.PlayFabId,
        activeSessionId: newActiveSessionId,
      });
      syncLocalBrowserFromAccount(account);
      return {
        account,
        error: null,
        recoveredNick: typedAsFullName ? account.profile.nick : undefined,
      };
    }

    // 2. If the student typed their Full Name, try LoginWithCustomID (stu_<fullName>_<DDMMAA>)
    const customRes = await callPlayFabClient<PlayFabLoginPayload>("LoginWithCustomID", {
      CustomId: studentCustomId(cleanId, normalizedPassword),
      CreateAccount: false,
      InfoRequestParameters: {
        GetUserData: true,
        GetPlayerStatistics: true,
        GetUserAccountInfo: true,
      },
    });

    if (!customRes.error && customRes.data) {
      const account = buildAccountFromPlayFabPayload(
        customRes.data,
        matchedLocal?.profile.nick ?? cleanId,
        normalizedPassword,
        cfg,
      );

      const previousSessionId = account.profile.activeSessionId;
      const currentLocalSessionId = loadStoredSession()?.activeSessionId;
      const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      if (previousSessionId && previousSessionId !== currentLocalSessionId) {
        recordDeviceSecurityAlert({
          studentNick: account.profile.nick,
          studentFullName: account.profile.full_name,
          studentId: account.profile.nickNormalized,
          deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Navegador Web",
          timestamp: Date.now(),
        });
      }

      account.profile.activeSessionId = newActiveSessionId;
      account.profile.activeSessionUpdatedAt = new Date().toISOString();
      checkAndApplyDailyLoginPoints(account.profile);

      reg[account.profile.nickNormalized] = account;
      saveRegistry(reg);
      saveStoredSession({
        playerId: account.profile.nickNormalized,
        sessionTicket: customRes.data.SessionTicket,
        playfabId: customRes.data.PlayFabId,
        activeSessionId: newActiveSessionId,
      });
      syncLocalBrowserFromAccount(account);
      return {
        account,
        error: null,
        recoveredNick: account.profile.nick,
      };
    }

    return {
      account: null,
      error:
        "Não encontramos sua conta com esses dados. Confirme seu Nome Completo e selecione sua Data de Nascimento abaixo para entrar automaticamente!",
      needsRecovery: true,
    };
  }

  // Local / Offline mode authentication (matches by Nick OR Full Name + Birthdate password)
  const targetAcc =
    localByNick &&
    (localByNick.passwordHash === simpleHash(normalizedPassword) ||
      passwordFromBirthdate(localByNick.profile.birthdate) === normalizedPassword)
      ? localByNick
      : findAccountByFullNameAndPassword(reg, cleanId, normalizedPassword);

  if (!targetAcc) {
    return {
      account: null,
      error:
        "Apelido ou senha não encontrados. Digite seu Nome Completo e selecione sua Data de Nascimento abaixo para recuperar e entrar automaticamente!",
      needsRecovery: true,
    };
  }

  if (
    targetAcc.profile.deletedAt &&
    !targetAcc.profile.isAdmin &&
    !isSpecialAdminAccount(targetAcc.profile)
  ) {
    return {
      account: null,
      error:
        "Esta conta foi suspensa e movida para a lixeira pelo administrador. Procure a coordenação escolar.",
    };
  }

  const aligned = ensurePlayerSeasonAligned(targetAcc, cfg);
  if (
    aligned.profile.isAdmin ||
    isSpecialAdminAccount(aligned.profile) ||
    rawUpper === "SEMED2620ZZ" ||
    rawUpper === "SEMED2620QQ"
  ) {
    aligned.profile.isAdmin = true;
    setAdminUnlockedSession(true);
  }
  const previousSessionId = aligned.profile.activeSessionId;
  const currentLocalSessionId = loadStoredSession()?.activeSessionId;
  const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  if (previousSessionId && previousSessionId !== currentLocalSessionId && !aligned.profile.isAdmin) {
    recordDeviceSecurityAlert({
      studentNick: aligned.profile.nick,
      studentFullName: aligned.profile.full_name,
      studentId: aligned.profile.nickNormalized,
      deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Navegador Web",
      timestamp: Date.now(),
    });
  }

  aligned.profile.activeSessionId = newActiveSessionId;
  aligned.profile.activeSessionUpdatedAt = new Date().toISOString();
  if (!aligned.profile.isAdmin && !isSpecialAdminAccount(aligned.profile)) {
    checkAndApplyDailyLoginPoints(aligned.profile);
  }

  reg[aligned.profile.nickNormalized] = aligned;
  saveRegistry(reg);
  saveStoredSession({ playerId: aligned.profile.nickNormalized, activeSessionId: newActiveSessionId });
  syncLocalBrowserFromAccount(aligned);
  return {
    account: aligned,
    error: null,
    recoveredNick:
      cleanId.toLowerCase() !== aligned.profile.nick.toLowerCase()
        ? aligned.profile.nick
        : undefined,
  };
}

/**
 * Automatic account recovery & login by Full Name + Birthdate (`YYYY-MM-DD`).
 * If a matching student is found, logs them in immediately and returns their saved `nick`.
 */
export async function playfabRecoverByNameAndBirthdate(
  fullName: string,
  birthdate: string,
): Promise<{
  account: StoredAccount | null;
  error: string | null;
  recoveredNick?: string;
  derivedPassword?: string;
}> {
  const cfg = checkAndApplyScheduledReset();
  const cleanName = fullName.trim();
  const cleanDate = birthdate.trim();
  if (!cleanName || !cleanDate) {
    return {
      account: null,
      error: "Informe seu nome completo e selecione sua data de nascimento.",
    };
  }

  const derivedPassword = passwordFromBirthdate(cleanDate);
  const reg = loadRegistry();

  // Check PlayFab via CustomId or matched local username first when configured
  if (isPlayFabConfigured()) {
    const customRes = await callPlayFabClient<PlayFabLoginPayload>("LoginWithCustomID", {
      CustomId: studentCustomId(cleanName, derivedPassword),
      CreateAccount: false,
      InfoRequestParameters: {
        GetUserData: true,
        GetPlayerStatistics: true,
        GetUserAccountInfo: true,
      },
    });

    if (!customRes.error && customRes.data) {
      const account = buildAccountFromPlayFabPayload(
        customRes.data,
        cleanName,
        derivedPassword,
        cfg,
      );
      const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      account.profile.activeSessionId = newActiveSessionId;
      account.profile.activeSessionUpdatedAt = new Date().toISOString();
      checkAndApplyDailyLoginPoints(account.profile);
      reg[account.profile.nickNormalized] = account;
      saveRegistry(reg);
      saveStoredSession({
        playerId: account.profile.nickNormalized,
        sessionTicket: customRes.data.SessionTicket,
        playfabId: customRes.data.PlayFabId,
        activeSessionId: newActiveSessionId,
      });
      syncLocalBrowserFromAccount(account);
      return {
        account,
        error: null,
        recoveredNick: account.profile.nick,
        derivedPassword,
      };
    }
  }

  // Check local registry by Full Name + Birthdate
  const found = findAccountByFullNameAndPassword(reg, cleanName, derivedPassword, cleanDate);
  if (!found) {
    return {
      account: null,
      error:
        "Nenhuma conta foi encontrada com esse Nome Completo e Data de Nascimento. Verifique se digitou igual ao cadastro ou clique em 'Criar perfil'.",
    };
  }

  const aligned = ensurePlayerSeasonAligned(found, cfg);
  const previousSessionId = aligned.profile.activeSessionId;
  const currentLocalSessionId = loadStoredSession()?.activeSessionId;
  const newActiveSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  if (previousSessionId && previousSessionId !== currentLocalSessionId && !aligned.profile.isAdmin) {
    recordDeviceSecurityAlert({
      studentNick: aligned.profile.nick,
      studentFullName: aligned.profile.full_name,
      studentId: aligned.profile.nickNormalized,
      deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Navegador Web",
      timestamp: Date.now(),
    });
  }

  aligned.profile.activeSessionId = newActiveSessionId;
  aligned.profile.activeSessionUpdatedAt = new Date().toISOString();
  if (!aligned.profile.isAdmin && !isSpecialAdminAccount(aligned.profile)) {
    checkAndApplyDailyLoginPoints(aligned.profile);
  }

  reg[aligned.profile.nickNormalized] = aligned;
  saveRegistry(reg);
  saveStoredSession({ playerId: aligned.profile.nickNormalized, activeSessionId: newActiveSessionId });
  syncLocalBrowserFromAccount(aligned);

  return {
    account: aligned,
    error: null,
    recoveredNick: aligned.profile.nick,
    derivedPassword,
  };
}

function syncLocalBrowserFromAccount(account: StoredAccount) {
  clearLocalStats();
  for (const s of account.stats) {
    updateBest(s.game_id, s.best_score, s.best_level);
  }
  saveUnlocked(account.unlocked);
}

export function playfabSignOut() {
  saveStoredSession(null);
  setAdminUnlockedSession(false);
  clearLocalStats();
  clearUnlocked();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }
}

export function getActiveAccount(): StoredAccount | null {
  const cfg = checkAndApplyScheduledReset();
  const session = loadStoredSession();
  if (!session) return null;
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return null;
  return ensurePlayerSeasonAligned(acc, cfg);
}

async function pushProfileToPlayFab(account: StoredAccount, sessionTicket?: string) {
  const ticket = sessionTicket ?? loadStoredSession()?.sessionTicket;
  if (!ticket || !isPlayFabConfigured()) return;

  const p = account.profile;
  await callPlayFabClient(
    "UpdateUserData",
    {
      Data: {
        PlayerProfile: JSON.stringify({
          nick: p.nick,
          full_name: p.full_name,
          school: p.school,
          grade: p.grade,
          birthdate: p.birthdate,
          xp: p.xp,
          seasonXp: p.seasonXp,
          level: p.level,
          levelStageProgress: p.levelStageProgress,
          wins: p.wins,
          x1Wins: p.x1Wins ?? 0,
          weeklyX1Wins: p.weeklyX1Wins ?? 0,
          weeklyX1WeekKey: p.weeklyX1WeekKey,
          matchesPlayed: p.matchesPlayed,
          distinctGamesPlayed: p.distinctGamesPlayed ?? 0,
          dailyXp: p.dailyXp ?? 0,
          dailyX1Xp: p.dailyX1Xp ?? 0,
          dailyTournamentXp: p.dailyTournamentXp ?? 0,
          dailyTournamentEntries: p.dailyTournamentEntries ?? 0,
          tournamentPoints: p.tournamentPoints ?? 0,
          bestTournamentPoints: p.bestTournamentPoints ?? 0,
          tournamentRankId: p.tournamentRankId ?? "bronze_1",
          tournamentWeekKey: p.tournamentWeekKey,
          dailyXpDate: p.dailyXpDate ?? getLocalDateKey(),
          dailyPostCapMatches: p.dailyPostCapMatches ?? 0,
          dailyPostCapDate: p.dailyPostCapDate ?? getLocalDateKey(),
          streakDays: getPlayerStreakDays(p),
          lastActiveDate: p.lastActiveDate,
          activeDates: p.activeDates ?? [],
          tournamentMedals: p.tournamentMedals ?? [],
          unlockedMedals: p.unlockedMedals ?? [],
          badges: p.badges,
          careerPoints: p.careerPoints ?? 0,
          pointsBalance: p.pointsBalance ?? 0,
          coins: p.coins ?? 0,
          claimedInboxRewardIds: p.claimedInboxRewardIds ?? [],
          lastDailyLoginPointsDate: p.lastDailyLoginPointsDate,
          lastDailyFirstGamePointsDate: p.lastDailyFirstGamePointsDate,
          achievedLevelsPoints: p.achievedLevelsPoints ?? [],
          achievedTournamentTiers: p.achievedTournamentTiers ?? [],
          eventProgress: p.eventProgress,
          isAdmin: p.isAdmin,
          seasonId: p.seasonId,
        }),
        GameStats: JSON.stringify(account.stats),
        UnlockedGames: JSON.stringify(account.unlocked),
      },
      Permission: "Public",
    },
    ticket,
  );

  // Sync into shared student roster for ADM, teachers, and leaderboards across all devices
  try {
    const rosterTicket = (await getAdminPlayFabTicket()) ?? ticket;
    if (rosterTicket) {
      await callPlayFabClient("CreateSharedGroup", { SharedGroupId: ROSTER_SHARED_GROUP_ID }, rosterTicket);
      await callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ROSTER_SHARED_GROUP_ID,
          Data: {
            [getStudentRosterCloudKey(p)]: JSON.stringify({
              id: p.id,
              playfabId: p.playfabId,
              nick: p.nick,
              nickNormalized: p.nickNormalized,
              full_name: p.full_name,
              school: p.school,
              grade: p.grade,
              turma: p.turma ?? null,
              birthdate: p.birthdate,
              xp: p.xp,
              seasonXp: p.seasonXp,
              level: p.level,
              levelStageProgress: p.levelStageProgress,
              wins: p.wins,
              x1Wins: p.x1Wins ?? 0,
              weeklyX1Wins: p.weeklyX1Wins ?? 0,
              weeklyX1WeekKey: p.weeklyX1WeekKey,
              tournamentPoints: p.tournamentPoints ?? 0,
              bestTournamentPoints: p.bestTournamentPoints ?? 0,
              tournamentRankId: p.tournamentRankId ?? "bronze_1",
              tournamentWeekKey: p.tournamentWeekKey,
              matchesPlayed: p.matchesPlayed,
              distinctGamesPlayed: p.distinctGamesPlayed ?? 0,
              streakDays: getPlayerStreakDays(p),
              lastActiveDate: p.lastActiveDate,
              activeDates: p.activeDates ?? [],
              tournamentMedals: p.tournamentMedals ?? [],
              unlockedMedals: p.unlockedMedals ?? [],
              badges: p.badges ?? [],
              careerPoints: p.careerPoints ?? 0,
              pointsBalance: p.pointsBalance ?? 0,
              coins: p.coins ?? 0,
              claimedInboxRewardIds: p.claimedInboxRewardIds ?? [],
              lastDailyLoginPointsDate: p.lastDailyLoginPointsDate,
              lastDailyFirstGamePointsDate: p.lastDailyFirstGamePointsDate,
              achievedLevelsPoints: p.achievedLevelsPoints ?? [],
              achievedTournamentTiers: p.achievedTournamentTiers ?? [],
              eventProgress: p.eventProgress,
              stats: account.stats ?? [],
              isAdmin: p.isAdmin,
              seasonId: p.seasonId,
              updatedAt: account.updatedAt,
            }),
          },
          Permission: "Public",
        },
        rosterTicket,
      );
    }
  } catch {
    /* ignore network issues with shared group */
  }
}

/**
 * Downloads and merges all registered students across all schools/devices from PlayFab.
 */
export async function syncStudentRosterFromPlayFab(sessionTicket?: string): Promise<PlayerProfile[]> {
  const cfg = checkAndApplyScheduledReset();
  const ticket = (await getAdminPlayFabTicket()) ?? sessionTicket ?? loadStoredSession()?.sessionTicket;
  if (!ticket || !isPlayFabConfigured()) {
    return getAllRegisteredPlayers();
  }

  try {
    await callPlayFabClient("CreateSharedGroup", { SharedGroupId: ROSTER_SHARED_GROUP_ID }, ticket);
    const res = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
      "GetSharedGroupData",
      { SharedGroupId: ROSTER_SHARED_GROUP_ID },
      ticket,
    );

    const data = res.data?.Data;
    const reg = loadRegistry();
    let updated = false;
    const needsCloudSanitize = new Set<string>();
    const keysToRemoveFromCloud: string[] = [];

    // 0. Recover PlayFabIds, XP, and per-game best scores from PlayFab Leaderboards
    const playfabIdBySlug = new Map<string, string>();
    const leaderboardXpBySlug = new Map<string, number>();
    const leaderboardGameScoresBySlug = new Map<string, Map<GameId, number>>();

    const enabledGameIds = ALL_GAME_IDS.filter((g) => cfg.enabledGames[g] !== false);
    type LbRow = { PlayFabId: string; DisplayName?: string; StatValue: number };

    try {
      const xpLbPromises = [
        callPlayFabClient<{ Leaderboard?: LbRow[] }>(
          "GetLeaderboard",
          { StatisticName: "XP_Total", StartPosition: 0, MaxResultsCount: 100 },
          ticket,
        ),
        callPlayFabClient<{ Leaderboard?: LbRow[] }>(
          "GetLeaderboard",
          { StatisticName: `XP_Season_S${cfg.seasonId}`, StartPosition: 0, MaxResultsCount: 100 },
          ticket,
        ),
      ];
      const gameLbPromises = enabledGameIds.flatMap((gId) => [
        callPlayFabClient<{ Leaderboard?: LbRow[] }>(
          "GetLeaderboard",
          { StatisticName: `Best_${gId}_S${cfg.seasonId}`, StartPosition: 0, MaxResultsCount: 100 },
          ticket,
        ).then((r) => ({ gId, rows: r.data?.Leaderboard ?? [] })),
        callPlayFabClient<{ Leaderboard?: LbRow[] }>(
          "GetLeaderboard",
          { StatisticName: `Best_${gId}`, StartPosition: 0, MaxResultsCount: 100 },
          ticket,
        ).then((r) => ({ gId, rows: r.data?.Leaderboard ?? [] })),
      ]);

      const [xpResults, gameResults] = await Promise.all([
        Promise.allSettled(xpLbPromises),
        Promise.allSettled(gameLbPromises),
      ]);

      // Map PlayFabId -> slug from known local and cloud profiles
      const slugByPlayFabId = new Map<string, string>();
      for (const [s, acc] of Object.entries(reg)) {
        if (acc.profile.playfabId) slugByPlayFabId.set(acc.profile.playfabId, s);
      }
      if (data) {
        for (const item of Object.values(data)) {
          if (!item?.Value) continue;
          try {
            const p = JSON.parse(item.Value) as Partial<PlayerProfile>;
            if (p.nickNormalized && p.playfabId) {
              slugByPlayFabId.set(p.playfabId, p.nickNormalized);
              playfabIdBySlug.set(p.nickNormalized, p.playfabId);
            }
          } catch {
            /* ignore */
          }
        }
      }

      for (const resItem of xpResults) {
        if (resItem.status !== "fulfilled") continue;
        for (const row of resItem.value.data?.Leaderboard ?? []) {
          const slug =
            slugByPlayFabId.get(row.PlayFabId) ||
            (row.DisplayName ? nickSlug(row.DisplayName) : "");
          if (!slug) continue;
          if (row.PlayFabId) {
            playfabIdBySlug.set(slug, row.PlayFabId);
            slugByPlayFabId.set(row.PlayFabId, slug);
          }
          if (row.StatValue > 0) {
            leaderboardXpBySlug.set(slug, Math.max(leaderboardXpBySlug.get(slug) ?? 0, row.StatValue));
          }
        }
      }

      for (const resItem of gameResults) {
        if (resItem.status !== "fulfilled") continue;
        const { gId, rows } = resItem.value;
        for (const row of rows) {
          const slug =
            slugByPlayFabId.get(row.PlayFabId) ||
            (row.DisplayName ? nickSlug(row.DisplayName) : "");
          if (!slug) continue;
          if (row.PlayFabId) {
            playfabIdBySlug.set(slug, row.PlayFabId);
            slugByPlayFabId.set(row.PlayFabId, slug);
          }
          if (row.StatValue > 0) {
            let gameMap = leaderboardGameScoresBySlug.get(slug);
            if (!gameMap) {
              gameMap = new Map<GameId, number>();
              leaderboardGameScoresBySlug.set(slug, gameMap);
            }
            gameMap.set(gId, Math.max(gameMap.get(gId) ?? 0, row.StatValue));
          }
        }
      }
    } catch {
      /* ignore leaderboard recovery network errors */
    }

    // 0b. Fetch individual Public UserData (PlayerProfile & GameStats) for students with known PlayFabId
    const userDataBySlug = new Map<
      string,
      { profile?: Partial<PlayerProfile>; stats?: GameStatRow[] }
    >();
    try {
      const slugsWithPfId = Array.from(playfabIdBySlug.entries());
      const userDataResults = await Promise.allSettled(
        slugsWithPfId.map(async ([slug, pfId]) => {
          const udRes = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
            "GetUserData",
            { PlayFabId: pfId, Keys: ["PlayerProfile", "GameStats"] },
            ticket,
          );
          const ud = udRes.data?.Data;
          let udProfile: Partial<PlayerProfile> | undefined;
          let udStats: GameStatRow[] | undefined;
          if (ud?.PlayerProfile?.Value) {
            try {
              udProfile = JSON.parse(ud.PlayerProfile.Value);
            } catch {
              /* ignore */
            }
          }
          if (ud?.GameStats?.Value) {
            try {
              udStats = JSON.parse(ud.GameStats.Value);
            } catch {
              /* ignore */
            }
          }
          return { slug, udProfile, udStats };
        }),
      );
      for (const r of userDataResults) {
        if (r.status === "fulfilled" && (r.value.udProfile || r.value.udStats)) {
          userDataBySlug.set(r.value.slug, {
            profile: r.value.udProfile,
            stats: r.value.udStats,
          });
        }
      }
    } catch {
      /* ignore userdata recovery errors */
    }

    // 0c. Consulta o grupo oficial da temporada de ranqueada (TOURNAMENT_SEASON_X) para paridade imediata entre ranking e perfil
    const tourStandingsBySlug = new Map<string, number>();
    try {
      const tourSeasonGroupId = `TOURNAMENT_SEASON_${cfg.rankedSeasonId ?? 1}`;
      const tourRes = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
        "GetSharedGroupData",
        { SharedGroupId: tourSeasonGroupId },
        ticket,
      );
      const standingsVal = tourRes.data?.Data?.Standings?.Value;
      if (standingsVal) {
        const parsedStandings = JSON.parse(standingsVal) as Record<
          string,
          { nick?: string; playerId?: string; tournamentPoints?: number; bestScore?: number }
        >;
        for (const [id, rec] of Object.entries(parsedStandings)) {
          const pts = rec.tournamentPoints ?? rec.bestScore ?? 0;
          if (pts > 0) {
            if (rec.nick) {
              const s = nickSlug(rec.nick);
              tourStandingsBySlug.set(s, Math.max(tourStandingsBySlug.get(s) ?? 0, pts));
            }
            const cleanId = id.toLowerCase().trim();
            tourStandingsBySlug.set(cleanId, Math.max(tourStandingsBySlug.get(cleanId) ?? 0, pts));
            if (rec.playerId) {
              const pId = rec.playerId.toLowerCase().trim();
              tourStandingsBySlug.set(pId, Math.max(tourStandingsBySlug.get(pId) ?? 0, pts));
            }
          }
        }
      }
    } catch {
      /* ignore tournament shared group errors */
    }

    // 1. If we received students from the cloud, deduplicate and merge them into local registry
    if (data && Object.keys(data).length > 0) {
      // Pré-passo de deduplicação e higienização:
      // Agrupa todas as entradas por slug canônico de nick.
      // Se houver mais de uma entrada para o mesmo aluno (ex: chaves legadas com PlayFabId),
      // combina as informações retendo o maior progresso e agenda a exclusão da chave legada na nuvem.
      const cloudItemsBySlug = new Map<string, { primary: Partial<PlayerProfile>; allKeys: string[] }>();

      for (const [key, item] of Object.entries(data)) {
        if (!item?.Value || key.startsWith("_")) continue;
        try {
          const parsedItem = JSON.parse(item.Value) as Partial<PlayerProfile>;
          const rawNick = parsedItem.nickNormalized || parsedItem.nick || parsedItem.id || "";
          if (!rawNick) {
            keysToRemoveFromCloud.push(key);
            continue;
          }
          const itemSlug = nickSlug(rawNick);
          const canonicalKey = getStudentRosterCloudKey(itemSlug);
          if (key !== canonicalKey) {
            keysToRemoveFromCloud.push(key);
          }

          const existingEntry = cloudItemsBySlug.get(itemSlug);
          if (!existingEntry) {
            cloudItemsBySlug.set(itemSlug, { primary: parsedItem, allKeys: [key] });
          } else {
            existingEntry.allKeys.push(key);
            const p = existingEntry.primary;
            const pMatches = Math.max(p.matchesPlayed ?? 0, (p as any)?.totalMatches ?? 0);
            const incMatches = Math.max(parsedItem.matchesPlayed ?? 0, (parsedItem as any)?.totalMatches ?? 0);

            // Combina medalhas
            const combinedMedals = [...(p.unlockedMedals ?? []), ...(parsedItem.unlockedMedals ?? [])];
            const dedupMedals = new Map<string, PlayerUnlockedMedal>();
            for (const m of combinedMedals) {
              if (m?.medalId) {
                const prev = dedupMedals.get(m.medalId);
                if (!prev) dedupMedals.set(m.medalId, { ...m });
                else dedupMedals.set(m.medalId, { ...prev, count: Math.max(prev.count ?? 1, m.count ?? 1) });
              }
            }

            // Combina estatísticas
            const combinedStats = [...((p as any).stats ?? []), ...((parsedItem as any).stats ?? [])];
            const statMap = new Map<string, any>();
            for (const s of combinedStats) {
              if (s?.game_id) {
                const sKey = `${s.game_id}__${s.mode || "padrao"}`;
                const cur = statMap.get(sKey);
                if (!cur) statMap.set(sKey, { ...s });
                else {
                  statMap.set(sKey, {
                    ...cur,
                    plays: Math.max(cur.plays ?? 0, s.plays ?? 0),
                    wins: Math.max(cur.wins ?? 0, s.wins ?? 0),
                    flawless_wins: Math.max(cur.flawless_wins ?? 0, s.flawless_wins ?? 0),
                    best_score: Math.max(cur.best_score ?? 0, s.best_score ?? 0),
                    best_level: Math.max(cur.best_level ?? 1, s.best_level ?? 1),
                  });
                }
              }
            }

            // Escolhe stageProgress com maior forLevel
            const pStage = p.levelStageProgress;
            const incStage = parsedItem.levelStageProgress;
            let chosenStage = pStage;
            if (incStage && (!pStage || (incStage.forLevel ?? 1) > (pStage.forLevel ?? 1))) {
              chosenStage = incStage;
            } else if (incStage && pStage && incStage.forLevel === pStage.forLevel && (incStage.matches ?? 0) > (pStage.matches ?? 0)) {
              chosenStage = incStage;
            }

            existingEntry.primary = {
              ...p,
              id: p.id || parsedItem.id,
              playfabId: p.playfabId || parsedItem.playfabId,
              nick: incMatches > pMatches ? (parsedItem.nick || p.nick) : p.nick,
              full_name: p.full_name || parsedItem.full_name,
              school: p.school || parsedItem.school,
              grade: p.grade ?? parsedItem.grade,
              turma: p.turma ?? parsedItem.turma,
              birthdate: p.birthdate || parsedItem.birthdate,
              xp: Math.max(p.xp ?? 0, parsedItem.xp ?? 0),
              seasonXp: Math.max(p.seasonXp ?? 0, parsedItem.seasonXp ?? 0),
              level: Math.max(p.level ?? 1, parsedItem.level ?? 1),
              levelStageProgress: chosenStage,
              wins: Math.max(p.wins ?? 0, parsedItem.wins ?? 0),
              matchesPlayed: Math.max(pMatches, incMatches),
              distinctGamesPlayed: Math.max(p.distinctGamesPlayed ?? 0, parsedItem.distinctGamesPlayed ?? 0),
              careerPoints: Math.max(p.careerPoints ?? 0, parsedItem.careerPoints ?? 0),
              pointsBalance: Math.max(p.pointsBalance ?? 0, parsedItem.pointsBalance ?? 0),
              tournamentPoints: Math.max(p.tournamentPoints ?? 0, parsedItem.tournamentPoints ?? 0),
              bestTournamentPoints: Math.max(p.bestTournamentPoints ?? 0, parsedItem.bestTournamentPoints ?? 0),
              unlockedMedals: Array.from(dedupMedals.values()),
              stats: Array.from(statMap.values()),
            };
          }
        } catch {
          keysToRemoveFromCloud.push(key);
        }
      }

      for (const [slug, { primary: parsed, allKeys }] of cloudItemsBySlug.entries()) {
        try {
          if (!parsed.nickNormalized) parsed.nickNormalized = slug;

          if (isTombstoned(slug) || isTombstoned(parsed.id)) {
            keysToRemoveFromCloud.push(...allKeys);
            keysToRemoveFromCloud.push(getStudentRosterCloudKey(slug));
            if (parsed.id && parsed.id !== slug) keysToRemoveFromCloud.push(`stu_${parsed.id}`);
            delete reg[slug];
            if (parsed.id) delete reg[parsed.id];
            updated = true;
            continue;
          }

          const existing = reg[slug];
          const recoveredUd = userDataBySlug.get(slug);
          const udProf = recoveredUd?.profile;
          const lbXp = leaderboardXpBySlug.get(slug) ?? 0;

          const isStudent =
            !isSpecialAdminAccount(parsed) &&
            !parsed.isAdmin &&
            slug !== "quemuel" &&
            slug !== "josiney" &&
            slug !== "admin" &&
            slug !== "semed_admin";
          const existingMatches = Math.max(
            parsed.matchesPlayed ?? 0,
            existing?.profile.matchesPlayed ?? 0,
            (parsed as any)?.totalMatches ?? 0,
            (existing?.profile as any)?.totalMatches ?? 0,
          );

          // Validação e detecção universal de corrupção ou inflação de XP/níveis (inclusive vinda da nuvem parsed):
          const isCorruptedParsed =
            isStudent &&
            (((parsed.xp ?? 0) > 8000 && existingMatches < 30) ||
              ((parsed.xp ?? 0) > Math.max(400, existingMatches * 50)) ||
              ((parsed.level ?? 1) >= 5 && existingMatches < 15));

          const isCorruptedExisting =
            isStudent &&
            (((existing?.profile.xp ?? 0) > 8000 && existingMatches < 30) ||
              ((existing?.profile.xp ?? 0) > Math.max(400, existingMatches * 50)) ||
              ((existing?.profile.level ?? 1) >= 5 && existingMatches < 15));

          const isCorruptedUd =
            isStudent &&
            (((udProf?.xp ?? 0) > 8000 && existingMatches < 30) ||
              ((udProf?.xp ?? 0) > Math.max(400, existingMatches * 50)) ||
              ((udProf?.level ?? 1) >= 5 && existingMatches < 15));

          const isCorruptedLb =
            isStudent &&
            ((lbXp > 8000 && existingMatches < 30) || lbXp > Math.max(400, existingMatches * 50));
          const validLbXp = isCorruptedLb ? 0 : lbXp;

          if (isCorruptedParsed || isCorruptedExisting || isCorruptedUd || isCorruptedLb) {
            needsCloudSanitize.add(slug);
          }

          // Merge unlockedMedals union across cloud roster, local registry, and individual PlayFab UserData
          const medalMap = new Map<string, PlayerUnlockedMedal>();
          for (const srcMedals of [
            !isCorruptedExisting ? existing?.profile.unlockedMedals : undefined,
            !isCorruptedUd ? udProf?.unlockedMedals : undefined,
            parsed.unlockedMedals,
          ]) {
            if (!Array.isArray(srcMedals)) continue;
            for (const m of srcMedals) {
              if (m && m.medalId) {
                if (
                  isStudent &&
                  ((parsed.xp ?? 0) < 2000 || isCorruptedParsed || isCorruptedExisting) &&
                  (m.medalId.startsWith("lvl_5") ||
                    m.medalId.startsWith("lvl_6") ||
                    m.medalId.startsWith("lvl_7") ||
                    m.medalId.startsWith("lvl_8") ||
                    m.medalId.startsWith("lvl_9") ||
                    m.medalId.startsWith("lvl_10") ||
                    m.medalId === "xp_1000" ||
                    m.medalId === "xp_5000")
                ) {
                  needsCloudSanitize.add(slug);
                  continue;
                }
                if (
                  isStudent &&
                  (m.medalId === "tournament_top_1_gold" ||
                    m.medalId === "tournament_top_2_silver" ||
                    m.medalId === "tournament_top_3_bronze" ||
                    m.medalId.startsWith("secret_top5_weeks_") ||
                    m.medalId.startsWith("secret_top1_consecutive_"))
                ) {
                  needsCloudSanitize.add(slug);
                  continue;
                }
                const prev = medalMap.get(m.medalId);
                if (!prev) {
                  medalMap.set(m.medalId, { ...m, count: m.count ?? 1 });
                } else {
                  const maxCount = Math.max(prev.count ?? 1, m.count ?? 1);
                  medalMap.set(m.medalId, {
                    ...prev,
                    count: maxCount,
                    lastUnlockedAt: m.lastUnlockedAt || prev.lastUnlockedAt,
                  });
                }
              }
            }
          }

          // Merge badges union
          const badgeMap = new Map<string, Badge>();
          for (const srcBadges of [
            !isCorruptedExisting ? existing?.profile.badges : undefined,
            !isCorruptedUd ? udProf?.badges : undefined,
            parsed.badges,
          ]) {
            if (!Array.isArray(srcBadges)) continue;
            for (const b of srcBadges) {
              if (b && b.id) {
                if (
                  isStudent &&
                  (parsed.xp ?? 0) < 2000 &&
                  (b.id === "nivel_5" || b.id === "xp_1000" || b.id === "xp_5000")
                ) {
                  continue;
                }
                if (!badgeMap.has(b.id)) {
                  badgeMap.set(b.id, b);
                }
              }
            }
          }

          const mergedProfile: PlayerProfile = {
            id: parsed.id || existing?.profile.id || udProf?.id || `pf_${slug}`,
            playfabId:
              parsed.playfabId ||
              existing?.profile.playfabId ||
              udProf?.playfabId ||
              playfabIdBySlug.get(slug),
            nick: parsed.nick || existing?.profile.nick || udProf?.nick || slug,
            nickNormalized: slug,
            full_name: parsed.full_name || existing?.profile.full_name || udProf?.full_name || "",
            school:
              parsed.school && isValidSchool(parsed.school)
                ? parsed.school
                : existing?.profile.school || udProf?.school || SCHOOLS[0].name,
            grade: parsed.grade ?? existing?.profile.grade ?? udProf?.grade ?? null,
            turma: parsed.turma ?? existing?.profile.turma ?? udProf?.turma ?? null,
            birthdate:
              parsed.birthdate || existing?.profile.birthdate || udProf?.birthdate || "2015-01-01",
            xp: (() => {
              const existingIsAdmin = isSpecialAdminAccount(existing?.profile) || existing?.profile.isAdmin;
              if (existingIsAdmin && isStudent) return 0;
              const validParsedXp = isCorruptedParsed ? 0 : (parsed.xp ?? 0);
              const validExistingXp = isCorruptedExisting ? 0 : (existing?.profile.xp ?? 0);
              const validUdXp = isCorruptedUd ? 0 : (udProf?.xp ?? 0);
              const maxVal = Math.max(validParsedXp, validExistingXp, validUdXp, validLbXp);
              if (maxVal > 0) return maxVal;
              return Math.min(8433, Math.max(0, existingMatches * 25));
            })(),
            seasonXp: (() => {
              const existingIsAdmin = isSpecialAdminAccount(existing?.profile) || existing?.profile.isAdmin;
              if (existingIsAdmin && isStudent) return 0;
              const validParsedSeasonXp = isCorruptedParsed ? 0 : (parsed.seasonXp ?? 0);
              const validExistingSeasonXp = isCorruptedExisting ? 0 : (existing?.profile.seasonXp ?? 0);
              const validUdSeasonXp = isCorruptedUd ? 0 : (udProf?.seasonXp ?? 0);
              const maxVal = Math.max(validParsedSeasonXp, validExistingSeasonXp, validUdSeasonXp, validLbXp);
              if (maxVal > 0) return maxVal;
              return Math.min(8433, Math.max(0, existingMatches * 25));
            })(),
            level: (() => {
              const validParsedLvl = isCorruptedParsed ? 1 : (parsed.level ?? 1);
              const validExistingLvl = isCorruptedExisting ? 1 : (existing?.profile.level ?? 1);
              const validUdLvl = isCorruptedUd ? 1 : (udProf?.level ?? 1);
              const maxLvl = Math.max(validParsedLvl, validExistingLvl, validUdLvl);
              if (isCorruptedParsed || isCorruptedExisting || isCorruptedUd) {
                return existingMatches >= 20 ? 3 : existingMatches >= 10 ? 2 : 1;
              }
              return maxLvl;
            })(),
            levelStageProgress: (() => {
              const existingStage = existing?.profile.levelStageProgress;
              const incomingStage = parsed.levelStageProgress ?? udProf?.levelStageProgress;
              if (!incomingStage) return existingStage;
              if (!existingStage) return incomingStage;
              // Invariante anti-regressão: se o estágio recebido for de nível inferior ao atual do aluno, preserva o estágio mais avançado
              if ((incomingStage.forLevel ?? 1) < (existingStage.forLevel ?? 1)) {
                return existingStage;
              }
              if ((incomingStage.forLevel ?? 1) > (existingStage.forLevel ?? 1)) {
                return incomingStage;
              }
              const incMatches = incomingStage.matches ?? 0;
              const exMatches = existingStage.matches ?? 0;
              return incMatches >= exMatches ? incomingStage : existingStage;
            })(),
            wins: Math.max(parsed.wins ?? 0, existing?.profile.wins ?? 0, udProf?.wins ?? 0),
            x1Wins: Math.max(parsed.x1Wins ?? 0, existing?.profile.x1Wins ?? 0, udProf?.x1Wins ?? 0),
            weeklyX1Wins: Math.max(
              parsed.weeklyX1Wins ?? 0,
              existing?.profile.weeklyX1Wins ?? 0,
              udProf?.weeklyX1Wins ?? 0,
            ),
            weeklyX1WeekKey:
              parsed.weeklyX1WeekKey ??
              existing?.profile.weeklyX1WeekKey ??
              udProf?.weeklyX1WeekKey,
            matchesPlayed: Math.max(
              parsed.matchesPlayed ?? 0,
              existing?.profile.matchesPlayed ?? 0,
              udProf?.matchesPlayed ?? 0,
            ),
            distinctGamesPlayed: Math.max(
              parsed.distinctGamesPlayed ?? 0,
              existing?.profile.distinctGamesPlayed ?? 0,
              udProf?.distinctGamesPlayed ?? 0,
            ),
            dailyXp: existing?.profile.dailyXp ?? udProf?.dailyXp ?? 0,
            dailyXpDate: existing?.profile.dailyXpDate ?? udProf?.dailyXpDate,
            dailyPostCapMatches:
              parsed.dailyPostCapMatches ??
              existing?.profile.dailyPostCapMatches ??
              udProf?.dailyPostCapMatches ??
              0,
            dailyPostCapDate:
              parsed.dailyPostCapDate ??
              existing?.profile.dailyPostCapDate ??
              udProf?.dailyPostCapDate,
            streakDays: getPlayerStreakDays({
              matchesPlayed: Math.max(
                parsed.matchesPlayed ?? 0,
                existing?.profile.matchesPlayed ?? 0,
                udProf?.matchesPlayed ?? 0,
              ),
              streakDays: Math.max(
                parsed.streakDays ?? 1,
                existing?.profile.streakDays ?? 1,
                udProf?.streakDays ?? 1,
              ),
              lastActiveDate:
                parsed.lastActiveDate ?? existing?.profile.lastActiveDate ?? udProf?.lastActiveDate,
              activeDates: Array.from(
                new Set([
                  ...(Array.isArray(parsed.activeDates) ? parsed.activeDates : []),
                  ...(Array.isArray(existing?.profile.activeDates) ? existing.profile.activeDates : []),
                  ...(Array.isArray(udProf?.activeDates) ? udProf.activeDates : []),
                  ...(parsed.lastActiveDate ? [parsed.lastActiveDate] : []),
                  ...(existing?.profile.lastActiveDate ? [existing.profile.lastActiveDate] : []),
                  ...(udProf?.lastActiveDate ? [udProf.lastActiveDate] : []),
                ]),
              ),
            }),
            lastActiveDate:
              parsed.lastActiveDate ?? existing?.profile.lastActiveDate ?? udProf?.lastActiveDate,
            activeDates: Array.from(
              new Set([
                ...(Array.isArray(parsed.activeDates) ? parsed.activeDates : []),
                ...(Array.isArray(existing?.profile.activeDates) ? existing.profile.activeDates : []),
                ...(Array.isArray(udProf?.activeDates) ? udProf.activeDates : []),
                ...(parsed.lastActiveDate ? [parsed.lastActiveDate] : []),
                ...(existing?.profile.lastActiveDate ? [existing.profile.lastActiveDate] : []),
                ...(udProf?.lastActiveDate ? [udProf.lastActiveDate] : []),
              ]),
            ).sort(),
            tournamentMedals: (() => {
              const rawM =
                parsed.tournamentMedals ??
                existing?.profile.tournamentMedals ??
                udProf?.tournamentMedals ??
                [];
              const activeSeasonKey = `Season_${cfg.rankedSeasonId ?? 1}`;
              const activeWeekKey = getCurrentWeekKey();
              const clean = rawM.filter(
                (m) =>
                  m &&
                  m.weekKey !== activeWeekKey &&
                  m.weekKey !== activeSeasonKey &&
                  !m.id?.startsWith("projected_")
              );
              if (clean.length !== rawM.length) {
                needsCloudSanitize.add(slug);
              }
              return clean;
            })(),
            dailyTournamentEntries: Math.max(
              parsed.dailyTournamentEntries ?? 0,
              existing?.profile.dailyTournamentEntries ?? 0,
              udProf?.dailyTournamentEntries ?? 0,
            ),
            dailyTournamentXp: Math.max(
              parsed.dailyTournamentXp ?? 0,
              existing?.profile.dailyTournamentXp ?? 0,
              udProf?.dailyTournamentXp ?? 0,
            ),
            tournamentPoints: (() => {
              const cloudTourPts = Math.max(
                tourStandingsBySlug.get(slug) ?? 0,
                tourStandingsBySlug.get(parsed.id?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.playfabId?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.nick?.toLowerCase().trim() ?? "") ?? 0,
              );
              const tourRec = getTournamentStoreRecord(parsed.id, slug) || (parsed.playfabId ? getTournamentStoreRecord(parsed.playfabId, slug) : null);
              const tourPts = Math.max(tourRec?.tournamentPoints ?? 0, tourRec?.bestScore ?? 0);
              const finalPts = Math.max(
                cloudTourPts,
                parsed.tournamentPoints ?? 0,
                parsed.bestTournamentPoints ?? 0,
                existing?.profile.tournamentPoints ?? 0,
                existing?.profile.bestTournamentPoints ?? 0,
                udProf?.tournamentPoints ?? 0,
                udProf?.bestTournamentPoints ?? 0,
                tourPts,
              );
              if (finalPts > (parsed.tournamentPoints ?? 0)) {
                needsCloudSanitize.add(slug);
              }
              return finalPts;
            })(),
            bestTournamentPoints: (() => {
              const cloudTourPts = Math.max(
                tourStandingsBySlug.get(slug) ?? 0,
                tourStandingsBySlug.get(parsed.id?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.playfabId?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.nick?.toLowerCase().trim() ?? "") ?? 0,
              );
              const tourRec = getTournamentStoreRecord(parsed.id, slug) || (parsed.playfabId ? getTournamentStoreRecord(parsed.playfabId, slug) : null);
              const tourPts = Math.max(tourRec?.tournamentPoints ?? 0, tourRec?.bestScore ?? 0);
              const curPts = Math.max(
                cloudTourPts,
                parsed.tournamentPoints ?? 0,
                parsed.bestTournamentPoints ?? 0,
                existing?.profile.tournamentPoints ?? 0,
                existing?.profile.bestTournamentPoints ?? 0,
                udProf?.tournamentPoints ?? 0,
                udProf?.bestTournamentPoints ?? 0,
                tourPts,
              );
              return Math.max(
                parsed.bestTournamentPoints ?? 0,
                existing?.profile.bestTournamentPoints ?? 0,
                udProf?.bestTournamentPoints ?? 0,
                curPts,
              );
            })(),
            tournamentRankId: (() => {
              const cloudTourPts = Math.max(
                tourStandingsBySlug.get(slug) ?? 0,
                tourStandingsBySlug.get(parsed.id?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.playfabId?.toLowerCase().trim() ?? "") ?? 0,
                tourStandingsBySlug.get(parsed.nick?.toLowerCase().trim() ?? "") ?? 0,
              );
              const tourRec = getTournamentStoreRecord(parsed.id, slug) || (parsed.playfabId ? getTournamentStoreRecord(parsed.playfabId, slug) : null);
              const tourPts = Math.max(tourRec?.tournamentPoints ?? 0, tourRec?.bestScore ?? 0);
              const curPts = Math.max(
                cloudTourPts,
                parsed.tournamentPoints ?? 0,
                parsed.bestTournamentPoints ?? 0,
                existing?.profile.tournamentPoints ?? 0,
                existing?.profile.bestTournamentPoints ?? 0,
                udProf?.tournamentPoints ?? 0,
                udProf?.bestTournamentPoints ?? 0,
                tourPts,
              );
              return curPts > 0
                ? getTournamentRank(curPts).currentRank.id
                : (parsed.tournamentRankId ?? existing?.profile.tournamentRankId ?? udProf?.tournamentRankId ?? "bronze_1");
            })(),
            rankedSeasonId:
              parsed.rankedSeasonId ??
              existing?.profile.rankedSeasonId ??
              udProf?.rankedSeasonId ??
              cfg.rankedSeasonId ??
              1,
            tournamentWeekKey:
              parsed.tournamentWeekKey ??
              existing?.profile.tournamentWeekKey ??
              udProf?.tournamentWeekKey ??
              getCurrentWeekKey(),
            unlockedMedals: Array.from(medalMap.values()),
            badges: Array.from(badgeMap.values()),
            eventProgress:
              parsed.eventProgress ?? existing?.profile.eventProgress ?? udProf?.eventProgress,
            deletedAt: parsed.deletedAt ?? existing?.profile.deletedAt ?? udProf?.deletedAt,
            deleteScheduledPermanentAt:
              parsed.deleteScheduledPermanentAt ??
              existing?.profile.deleteScheduledPermanentAt ??
              udProf?.deleteScheduledPermanentAt,
            isAdmin: parsed.isAdmin ?? existing?.profile.isAdmin,
            seasonId: parsed.seasonId ?? existing?.profile.seasonId ?? 1,
            careerPoints: (() => {
              if (isCorruptedParsed || isCorruptedExisting || isCorruptedUd || (isStudent && existingMatches <= 10)) {
                const cand = parsed.careerPoints ?? 220;
                return cand > 350 && existingMatches <= 10 ? 220 : cand;
              }
              return Math.max(
                parsed.careerPoints ?? 0,
                existing?.profile.careerPoints ?? 0,
                (udProf as any)?.careerPoints ?? 0,
              );
            })(),
            pointsBalance: (() => {
              if (isCorruptedParsed || isCorruptedExisting || isCorruptedUd || (isStudent && existingMatches <= 10)) {
                const cand = parsed.pointsBalance ?? parsed.careerPoints ?? 220;
                return cand > 350 && existingMatches <= 10 ? 220 : cand;
              }
              return Math.max(
                parsed.pointsBalance ?? 0,
                existing?.profile.pointsBalance ?? 0,
                (udProf as any)?.pointsBalance ?? 0,
              );
            })(),
            coins: Math.max(
              parsed.coins ?? 0,
              existing?.profile.coins ?? 0,
              (udProf as any)?.coins ?? 0,
            ),
            claimedInboxRewardIds: Array.from(
              new Set([
                ...(Array.isArray(parsed.claimedInboxRewardIds) ? parsed.claimedInboxRewardIds : []),
                ...(Array.isArray(existing?.profile.claimedInboxRewardIds) ? existing.profile.claimedInboxRewardIds : []),
                ...(Array.isArray((udProf as any)?.claimedInboxRewardIds) ? (udProf as any).claimedInboxRewardIds : []),
              ])
            ),
            lastDailyLoginPointsDate:
              [
                parsed.lastDailyLoginPointsDate,
                existing?.profile.lastDailyLoginPointsDate,
                (udProf as any)?.lastDailyLoginPointsDate,
              ]
                .filter((d): d is string => Boolean(d))
                .sort()
                .pop(),
            lastDailyFirstGamePointsDate:
              [
                parsed.lastDailyFirstGamePointsDate,
                existing?.profile.lastDailyFirstGamePointsDate,
                (udProf as any)?.lastDailyFirstGamePointsDate,
              ]
                .filter((d): d is string => Boolean(d))
                .sort()
                .pop(),
            achievedLevelsPoints: Array.from(
              new Set([
                ...(Array.isArray(parsed.achievedLevelsPoints) ? parsed.achievedLevelsPoints : []),
                ...(Array.isArray(existing?.profile.achievedLevelsPoints) ? existing.profile.achievedLevelsPoints : []),
                ...(Array.isArray((udProf as any)?.achievedLevelsPoints) ? (udProf as any).achievedLevelsPoints : []),
              ])
            ),
            achievedTournamentTiers: Array.from(
              new Set([
                ...(Array.isArray(parsed.achievedTournamentTiers) ? parsed.achievedTournamentTiers : []),
                ...(Array.isArray(existing?.profile.achievedTournamentTiers) ? existing.profile.achievedTournamentTiers : []),
                ...(Array.isArray((udProf as any)?.achievedTournamentTiers) ? (udProf as any).achievedTournamentTiers : []),
              ])
            ),
          };

          if (mergedProfile.claimedInboxRewardIds && mergedProfile.claimedInboxRewardIds.length > 0) {
            mergeStudentClaims(
              mergedProfile.claimedInboxRewardIds.map((mId) => ({
                studentKey: mergedProfile.id,
                messageId: mId,
              }))
            );
            mergeStudentClaims(
              mergedProfile.claimedInboxRewardIds.map((mId) => ({
                studentKey: mergedProfile.nickNormalized,
                messageId: mId,
              }))
            );
          }

          // Merge stats per game_id keeping highest best_score, best_level, plays, wins, and flawless_wins
          const incomingStats: GameStatRow[] = Array.isArray((parsed as any).stats)
            ? (parsed as any).stats
            : [];
          const existingStats: GameStatRow[] = existing?.stats ?? [];
          const udStats: GameStatRow[] = Array.isArray(recoveredUd?.stats) ? recoveredUd!.stats! : [];
          const udProfileStats: GameStatRow[] = Array.isArray((udProf as any)?.stats)
            ? (udProf as any).stats
            : [];
          const statsMap = new Map<string, GameStatRow>();
          for (const st of [...existingStats, ...udStats, ...udProfileStats, ...incomingStats]) {
            if (!st || !st.game_id) continue;
            const key = `${st.game_id}__${st.mode || "padrao"}`;
            const cur = statsMap.get(key);
            if (!cur) {
              statsMap.set(key, { ...st });
            } else {
              statsMap.set(key, {
                game_id: st.game_id,
                mode: st.mode || "padrao",
                plays: Math.max(cur.plays ?? 0, st.plays ?? 0),
                wins: Math.max(cur.wins ?? 0, st.wins ?? 0),
                flawless_wins: Math.max(cur.flawless_wins ?? 0, st.flawless_wins ?? 0),
                last_wrong: st.last_wrong ?? cur.last_wrong,
                best_score: Math.max(cur.best_score ?? 0, st.best_score ?? 0),
                best_level: Math.max(cur.best_level ?? 1, st.best_level ?? 1),
                last_played_at:
                  (st.last_played_at || "") > (cur.last_played_at || "")
                    ? st.last_played_at
                    : cur.last_played_at,
              });
            }
          }

          // Reconstruct any missing game rows discovered in PlayFab per-game leaderboards
          const lbGames = leaderboardGameScoresBySlug.get(slug);
          if (lbGames) {
            for (const [gId, lbScore] of lbGames.entries()) {
              if (lbScore <= 0) continue;
              const key = `${gId}__padrao`;
              const cur = statsMap.get(key);
              if (!cur) {
                statsMap.set(key, {
                  game_id: gId,
                  mode: "padrao",
                  plays: 1,
                  wins: lbScore >= 20 ? 1 : 0,
                  flawless_wins: 0,
                  best_score: lbScore,
                  best_level: lbScore >= 60 ? 2 : 1,
                  last_played_at: (parsed as any).updatedAt || new Date().toISOString(),
                });
              } else {
                statsMap.set(key, {
                  ...cur,
                  plays: Math.max(1, cur.plays ?? 0),
                  wins: Math.max(cur.wins ?? 0, lbScore >= 20 ? 1 : 0),
                  best_score: Math.max(cur.best_score ?? 0, lbScore),
                });
              }
            }
          }

          const incomingMedalsCount = Array.isArray(parsed.unlockedMedals)
            ? parsed.unlockedMedals.length
            : 0;
          const incomingDistinct = parsed.distinctGamesPlayed ?? 0;
          const incomingLevel = parsed.level ?? 1;
          const incomingMatches = parsed.matchesPlayed ?? 0;
          const incomingCareerPoints = parsed.careerPoints ?? 0;

          const aligned = ensurePlayerSeasonAligned(
            {
              profile: mergedProfile,
              passwordHash:
                existing?.passwordHash ||
                simpleHash(passwordFromBirthdate(mergedProfile.birthdate)),
              unlocked: existing?.unlocked || [],
              stats: Array.from(statsMap.values()),
              updatedAt: (parsed as any).updatedAt || new Date().toISOString(),
            },
            cfg,
          );

          if (
            (aligned.profile.unlockedMedals?.length ?? 0) !== incomingMedalsCount ||
            (aligned.profile.distinctGamesPlayed ?? 0) !== incomingDistinct ||
            aligned.profile.level !== incomingLevel ||
            (aligned.profile.matchesPlayed ?? 0) !== incomingMatches ||
            (aligned.stats?.length ?? 0) !== incomingStats.length ||
            (aligned.profile.careerPoints ?? 0) !== incomingCareerPoints
          ) {
            needsCloudSanitize.add(slug);
          }

          reg[slug] = aligned;
          updated = true;
        } catch {
          /* ignore JSON parse error */
        }
      }
    }

    // 2. Push any local students that are not yet in the cloud roster (or whose medals/stats were reconciled)
    const missingInCloud: Record<string, string> = {};
    for (const [slug, rawAcc] of Object.entries(reg)) {
      if (isTombstoned(slug) || isTombstoned(rawAcc.profile.id)) {
        keysToRemoveFromCloud.push(`stu_${slug}`);
        delete reg[slug];
        updated = true;
        continue;
      }
      const acc = ensurePlayerSeasonAligned(rawAcc, cfg);
      reg[slug] = acc;
      if (isSpecialAdminAccount(acc.profile)) continue;
      const key = getStudentRosterCloudKey(slug);
      if (!data || !data[key] || needsCloudSanitize.has(slug) || acc.profile.deletedAt) {
        missingInCloud[key] = JSON.stringify({
          id: acc.profile.id,
          playfabId: acc.profile.playfabId,
          nick: acc.profile.nick,
          nickNormalized: acc.profile.nickNormalized,
          full_name: acc.profile.full_name,
          school: acc.profile.school,
          grade: acc.profile.grade,
          turma: acc.profile.turma ?? null,
          birthdate: acc.profile.birthdate,
          xp: acc.profile.xp,
          seasonXp: acc.profile.seasonXp,
          level: acc.profile.level,
          levelStageProgress: acc.profile.levelStageProgress,
          wins: acc.profile.wins,
          x1Wins: acc.profile.x1Wins ?? 0,
          weeklyX1Wins: acc.profile.weeklyX1Wins ?? 0,
          weeklyX1WeekKey: acc.profile.weeklyX1WeekKey,
          tournamentPoints: acc.profile.tournamentPoints ?? 0,
          bestTournamentPoints: acc.profile.bestTournamentPoints ?? 0,
          tournamentRankId: acc.profile.tournamentRankId ?? "bronze_1",
          rankedSeasonId: acc.profile.rankedSeasonId ?? cfg.rankedSeasonId ?? 1,
          tournamentWeekKey: acc.profile.tournamentWeekKey,
          matchesPlayed: acc.profile.matchesPlayed,
          distinctGamesPlayed: acc.profile.distinctGamesPlayed ?? 0,
          streakDays: getPlayerStreakDays(acc.profile),
          lastActiveDate: acc.profile.lastActiveDate,
          activeDates: acc.profile.activeDates ?? [],
          tournamentMedals: acc.profile.tournamentMedals ?? [],
          unlockedMedals: acc.profile.unlockedMedals ?? [],
          badges: acc.profile.badges ?? [],
          careerPoints: acc.profile.careerPoints ?? 0,
          pointsBalance: acc.profile.pointsBalance ?? 0,
          coins: acc.profile.coins ?? 0,
          claimedInboxRewardIds: acc.profile.claimedInboxRewardIds ?? [],
          lastDailyLoginPointsDate: acc.profile.lastDailyLoginPointsDate,
          lastDailyFirstGamePointsDate: acc.profile.lastDailyFirstGamePointsDate,
          achievedLevelsPoints: acc.profile.achievedLevelsPoints ?? [],
          achievedTournamentTiers: acc.profile.achievedTournamentTiers ?? [],
          eventProgress: acc.profile.eventProgress,
          stats: acc.stats ?? [],
          deletedAt: acc.profile.deletedAt,
          deleteScheduledPermanentAt: acc.profile.deleteScheduledPermanentAt,
          isAdmin: acc.profile.isAdmin,
          seasonId: acc.profile.seasonId,
          updatedAt: acc.updatedAt,
        });
      }
    }

    if (Object.keys(missingInCloud).length > 0) {
      await callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ROSTER_SHARED_GROUP_ID,
          Data: missingInCloud,
          Permission: "Public",
        },
        ticket,
      );
    }

    if (keysToRemoveFromCloud.length > 0) {
      try {
        await callPlayFabClient(
          "UpdateSharedGroupData",
          {
            SharedGroupId: ROSTER_SHARED_GROUP_ID,
            KeysToRemove: Array.from(new Set(keysToRemoveFromCloud)),
          },
          ticket,
        );
      } catch {
        /* ignore cloud removal error */
      }
    }

    if (updated) {
      saveRegistry(reg);
    }
  } catch {
    /* ignore network issues */
  }

  return getAllRegisteredPlayers();
}

/**
 * Valida se o identificador de sessão local coincide com a sessão ativa mais recente da conta.
 * Se outro aparelho efetuou login, esta validação retornará false, disparando a desconexão automática (Modelo A).
 */
export function validateActiveSession(playerId: string, currentSessionId?: string): boolean {
  if (!playerId) return false;
  const reg = loadRegistry();
  const slug = nickSlug(playerId);
  const acc = reg[slug] || Object.values(reg).find((a) => a.profile.nickNormalized === slug);
  if (!acc || !acc.profile.activeSessionId) return true;
  const expected = acc.profile.activeSessionId;
  const activeLocal = currentSessionId ?? loadStoredSession()?.activeSessionId;
  if (!activeLocal) return true;
  return expected === activeLocal;
}

/**
 * Reconcilia e sincroniza todas as senhas de todos os alunos registrados
 * para que correspondam rigorosamente à data de nascimento atual de seus perfis (DDMMAA).
 */
export function syncAllPasswordsWithBirthdate(): number {
  const reg = loadRegistry();
  let updatedCount = 0;
  for (const acc of Object.values(reg)) {
    if (acc.profile.birthdate && !acc.profile.isAdmin && !isSpecialAdminAccount(acc.profile)) {
      const expectedHash = simpleHash(passwordFromBirthdate(acc.profile.birthdate));
      if (acc.passwordHash !== expectedHash) {
        acc.passwordHash = expectedHash;
        acc.updatedAt = new Date().toISOString();
        updatedCount++;
      }
    }
  }
  if (updatedCount > 0) {
    saveRegistry(reg);
  }
  return updatedCount;
}

/**
 * Sincroniza uma notificação de medalha Ouro+ com a nuvem PlayFab (SharedGroupData)
 * permitindo que o ADM receba as notificações em qualquer computador ou dispositivo.
 */
export async function pushAdminMedalNotificationToPlayFab(
  notif: AdminMedalNotification,
  sessionTicket?: string
): Promise<void> {
  if (!isPlayFabConfigured()) return;
  try {
    const ticket = sessionTicket ?? loadStoredSession()?.sessionTicket ?? (await getAdminPlayFabTicket());
    if (!ticket) return;
    await callPlayFabClient(
      "UpdateSharedGroupData",
      {
        SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID,
        Data: {
          [`notif_${notif.id}`]: JSON.stringify(notif),
        },
        Permission: "Public",
      },
      ticket,
    );
  } catch (err) {
    console.warn("Falha ao sincronizar notificação de medalha no PlayFab:", err);
  }
}

/**
 * Consulta a nuvem PlayFab para baixar todas as notificações de medalhas Ouro+ conquistadas pelos alunos
 */
export async function syncAdminMedalNotificationsFromPlayFab(
  sessionTicket?: string
): Promise<AdminMedalNotification[]> {
  const cfg = loadAdminConfig();
  const localNotifs = cfg.adminMedalNotifications ?? [];
  if (!isPlayFabConfigured()) return localNotifs;

  try {
    const ticket = sessionTicket ?? (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
    if (!ticket) return localNotifs;

    const res = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
      "GetSharedGroupData",
      { SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID },
      ticket,
    );

    if (res.data?.Data) {
      const remoteList: AdminMedalNotification[] = [];
      for (const [k, v] of Object.entries(res.data.Data)) {
        if (!k.startsWith("notif_") || !v?.Value) continue;
        try {
          const parsed = JSON.parse(v.Value) as AdminMedalNotification;
          if (parsed.id && parsed.medalTitle) {
            remoteList.push(parsed);
          }
        } catch {
          // ignore
        }
      }

      const map = new Map<string, AdminMedalNotification>();
      for (const n of localNotifs) {
        map.set(n.id, n);
      }
      for (const n of remoteList) {
        if (!map.has(n.id)) {
          map.set(n.id, n);
        } else {
          const existing = map.get(n.id)!;
          if (n.read) existing.read = true;
        }
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => Date.parse(b.unlockedAt) - Date.parse(a.unlockedAt)
      ).slice(0, 200);

      cfg.adminMedalNotifications = merged;
      saveAdminConfig(cfg);
      return merged;
    }
  } catch (err) {
    console.warn("Falha ao sincronizar notificações de medalhas do PlayFab:", err);
  }

  return localNotifs;
}

export interface InboxReadReceipt {
  messageId: string;
  studentId: string;
  studentNick?: string;
  studentSchool?: string;
  readAt: string;
}

/**
 * Publica um recibo de leitura de mensagem na nuvem PlayFab (SharedGroup público)
 * para que o painel administrativo saiba em tempo real quem já abriu cada comunicado.
 */
export async function pushInboxReadToPlayFab(
  messageId: string,
  player: { id: string; nick?: string; nickNormalized?: string; school?: string },
  sessionTicket?: string
): Promise<void> {
  if (!isPlayFabConfigured() || !messageId || !player) return;
  try {
    const adminTicket = (await getAdminPlayFabTicket()) ?? sessionTicket ?? loadStoredSession()?.sessionTicket;
    if (!adminTicket) return;

    const receipt: InboxReadReceipt = {
      messageId,
      studentId: player.id,
      studentNick: player.nick,
      studentSchool: player.school,
      readAt: new Date().toISOString(),
    };

    const cleanNick = (player.nick || player.id).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanMsg = messageId.replace(/[^a-z0-9_]/gi, "_");
    const key = `inbox_read_${cleanNick}_${cleanMsg}`.substring(0, 100);

    // Tenta garantir que o SharedGroup exista (ignora se já existir)
    try {
      await callPlayFabClient(
        "CreateSharedGroup",
        { SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID },
        adminTicket
      );
    } catch {
      /* SharedGroup já existe, prossegue normalmente */
    }

    try {
      await callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID,
          Data: {
            [key]: JSON.stringify(receipt),
          },
          Permission: "Public",
        },
        adminTicket
      );
    } catch (updateErr) {
      console.warn("Aviso ao salvar leitura no SharedGroup:", updateErr);
    }

    // Também espelha nos dados pessoais do aluno caso tenha sessão ativa
    const studentTicket = sessionTicket ?? loadStoredSession()?.sessionTicket;
    if (studentTicket) {
      void callPlayFabClient(
        "UpdateUserData",
        {
          Data: {
            [`read_${cleanMsg}`]: receipt.readAt,
          },
          Permission: "Public",
        },
        studentTicket
      );
    }
  } catch (err) {
    console.warn("Falha ao registrar leitura no PlayFab:", err);
  }
}

export interface InboxClaimReceipt {
  messageId: string;
  studentId: string;
  studentNick?: string;
  studentSchool?: string;
  claimedAt: string;
}

/**
 * Publica um recibo de resgate de recompensa/presente na nuvem PlayFab (SharedGroup público)
 * para travar imediatamente resgates duplicados entre múltiplos dispositivos.
 */
export async function pushInboxClaimToPlayFab(
  messageId: string,
  player: { id: string; nick?: string; nickNormalized?: string; school?: string },
  sessionTicket?: string
): Promise<void> {
  if (!isPlayFabConfigured() || !messageId || !player) return;
  try {
    const adminTicket = (await getAdminPlayFabTicket()) ?? sessionTicket ?? loadStoredSession()?.sessionTicket;
    if (!adminTicket) return;

    const receipt: InboxClaimReceipt = {
      messageId,
      studentId: player.id,
      studentNick: player.nick,
      studentSchool: player.school,
      claimedAt: new Date().toISOString(),
    };

    const cleanNick = (player.nick || player.id).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanMsg = messageId.replace(/[^a-z0-9_]/gi, "_");
    const key = `inbox_claim_${cleanNick}_${cleanMsg}`.substring(0, 100);

    try {
      await callPlayFabClient(
        "CreateSharedGroup",
        { SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID },
        adminTicket
      );
    } catch {
      /* SharedGroup já existe */
    }

    try {
      await callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID,
          Data: {
            [key]: JSON.stringify(receipt),
          },
          Permission: "Public",
        },
        adminTicket
      );
    } catch (updateErr) {
      console.warn("Aviso ao salvar resgate no SharedGroup:", updateErr);
    }

    const studentTicket = sessionTicket ?? loadStoredSession()?.sessionTicket;
    if (studentTicket) {
      void callPlayFabClient(
        "UpdateUserData",
        {
          Data: {
            [`claim_${cleanMsg}`]: receipt.claimedAt,
          },
          Permission: "Public",
        },
        studentTicket
      );
    }
  } catch (err) {
    console.warn("Falha ao registrar resgate no PlayFab:", err);
  }
}

/**
 * Salva o perfil do aluno no registro local e sincroniza imediatamente com a nuvem PlayFab.
 */
export async function savePlayerProfile(profile: PlayerProfile): Promise<PlayerProfile> {
  const reg = loadRegistry();
  const slug = nickSlug(profile.nickNormalized || profile.nick || profile.id);
  const pId = profile.id;
  const acc =
    reg[slug] ||
    (pId ? reg[pId] : undefined) ||
    Object.values(reg).find((a) => a.profile.id === pId || a.profile.nickNormalized === slug);

  if (acc) {
    acc.profile = { ...acc.profile, ...profile };
    acc.updatedAt = new Date().toISOString();
    reg[slug] = acc;
    if (pId) reg[pId] = acc;
    saveRegistry(reg);
    syncLocalBrowserFromAccount(acc);
    const session = loadStoredSession();
    if (session?.sessionTicket && isPlayFabConfigured()) {
      await pushProfileToPlayFab(acc, session.sessionTicket);
    }
    return acc.profile;
  }
  return profile;
}

/**
 * Consulta a nuvem PlayFab para sincronizar todos os recibos de abertura e resgates de comunicados
 * feitos pelos alunos, integrando-os ao cache local de leituras e resgates.
 */
export async function syncInboxReadsFromPlayFab(
  sessionTicket?: string
): Promise<InboxReadReceipt[]> {
  if (!isPlayFabConfigured()) return [];
  try {
    const ticket = (await getAdminPlayFabTicket()) ?? sessionTicket ?? loadStoredSession()?.sessionTicket;
    if (!ticket) return [];

    const res = await callPlayFabClient<{ Data?: Record<string, { Value: string }> }>(
      "GetSharedGroupData",
      { SharedGroupId: ADMIN_NOTIFICATIONS_SHARED_GROUP_ID },
      ticket
    );

    if (res.data?.Data) {
      const receipts: InboxReadReceipt[] = [];
      const remoteReadsToMerge: Array<{ studentKey: string; messageId: string; readAt?: string }> = [];
      const remoteClaimsToMerge: Array<{ studentKey: string; messageId: string; claimedAt?: string }> = [];

      for (const [k, v] of Object.entries(res.data.Data)) {
        if (!v?.Value) continue;
        if (k.startsWith("inbox_read_")) {
          try {
            const parsed = JSON.parse(v.Value) as InboxReadReceipt;
            if (parsed && parsed.messageId && (parsed.studentId || parsed.studentNick)) {
              receipts.push(parsed);
              if (parsed.studentId) {
                remoteReadsToMerge.push({
                  studentKey: parsed.studentId,
                  messageId: parsed.messageId,
                  readAt: parsed.readAt,
                });
              }
              if (parsed.studentNick) {
                remoteReadsToMerge.push({
                  studentKey: parsed.studentNick,
                  messageId: parsed.messageId,
                  readAt: parsed.readAt,
                });
              }
            }
          } catch {
            /* ignore */
          }
        } else if (k.startsWith("inbox_claim_")) {
          try {
            const parsed = JSON.parse(v.Value) as InboxClaimReceipt;
            if (parsed && parsed.messageId && (parsed.studentId || parsed.studentNick)) {
              if (parsed.studentId) {
                remoteClaimsToMerge.push({
                  studentKey: parsed.studentId,
                  messageId: parsed.messageId,
                  claimedAt: parsed.claimedAt,
                });
              }
              if (parsed.studentNick) {
                remoteClaimsToMerge.push({
                  studentKey: parsed.studentNick,
                  messageId: parsed.messageId,
                  claimedAt: parsed.claimedAt,
                });
              }
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (remoteReadsToMerge.length > 0) {
        mergeStudentReads(remoteReadsToMerge);
      }
      if (remoteClaimsToMerge.length > 0) {
        mergeStudentClaims(remoteClaimsToMerge);
      }

      return receipts;
    }
  } catch (err) {
    console.warn("Falha ao sincronizar leituras/resgates do PlayFab:", err);
  }
  return [];
}

/**
 * Allows the Administrator to update student profile data (Birthdate, School, Turma, Full Name)
 * directly from the Admin Panel or Inspect Modal, immediately syncing to local storage and PlayFab cloud.
 */
export async function updateStudentProfileByAdmin(args: {
  playerId: string;
  birthdate?: string;
  school?: string;
  turma?: string | null;
  grade?: string | null;
  fullName?: string;
}): Promise<PlayerProfile | null> {
  const reg = loadRegistry();
  const slug = nickSlug(args.playerId);
  const accEntry = Object.entries(reg).find(
    ([k, acc]) =>
      k === slug ||
      acc.profile.id === args.playerId ||
      acc.profile.nickNormalized === slug ||
      acc.profile.nick.toLowerCase() === args.playerId.toLowerCase(),
  );

  let acc = accEntry ? accEntry[1] : null;

  if (!acc) {
    const all = getAllRegisteredPlayers();
    const found = all.find(
      (p) =>
        p.id === args.playerId ||
        p.nickNormalized === slug ||
        p.nick.toLowerCase() === args.playerId.toLowerCase(),
    );
    if (!found) return null;
    acc = {
      profile: { ...found },
      passwordHash: "",
      unlocked: [],
      stats: [],
      updatedAt: new Date().toISOString(),
    };
  }

  if (args.birthdate) {
    acc.profile.birthdate = args.birthdate;
    if (!acc.profile.isAdmin && !isSpecialAdminAccount(acc.profile)) {
      acc.passwordHash = simpleHash(passwordFromBirthdate(args.birthdate));
    }
  }
  if (args.school !== undefined) {
    acc.profile.school = args.school;
  }

  // Validate age restrictions
  const currentAge = ageFrom(acc.profile.birthdate);
  if (isEtapa3OrOlder(acc.profile.birthdate)) {
    if (isOfficialSemedSchool(acc.profile.school)) {
      acc.profile.school = "Nenhuma";
    }
    acc.profile.turma = null;
    acc.profile.grade = null;
  } else if (currentAge > 11) {
    if (is5thGradeSchool(acc.profile.school)) {
      acc.profile.school = "Nenhuma";
      acc.profile.turma = null;
      acc.profile.grade = null;
    }
  }

  if (args.turma !== undefined) {
    acc.profile.turma = acc.profile.school === "Nenhuma" || acc.profile.school === "Outro" ? null : args.turma;
  }
  if (acc.profile.school === "Nenhuma" || acc.profile.school === "Outro") {
    acc.profile.grade = null;
  } else if (is5thGradeSchool(acc.profile.school)) {
    acc.profile.grade = "5º ano";
  } else if (args.grade !== undefined) {
    acc.profile.grade = args.grade;
  }
  if (args.fullName) {
    acc.profile.full_name = formatFullNameUpper(args.fullName);
  }

  acc.updatedAt = new Date().toISOString();
  reg[acc.profile.nickNormalized] = acc;
  saveRegistry(reg);

  // Sync to PlayFab SharedGroupData
  try {
    const ticket = await getAdminPlayFabTicket();
    if (ticket && isPlayFabConfigured()) {
      await callPlayFabClient(
        "UpdateSharedGroupData",
        {
          SharedGroupId: ROSTER_SHARED_GROUP_ID,
          Data: {
            [getStudentRosterCloudKey(acc.profile)]: JSON.stringify({
              ...acc.profile,
              stats: acc.stats ?? acc.profile.stats ?? [],
              updatedAt: acc.updatedAt,
            }),
          },
          Permission: "Public",
        },
        ticket,
      );
    }
  } catch (err) {
    console.warn("Failed to sync updated student to PlayFab:", err);
  }

  return acc.profile;
}

export async function playfabUnlockGames(games: GameId[]): Promise<GameId[]> {
  const session = loadStoredSession();
  if (!session) return [];
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return [];

  acc.unlocked = [...new Set([...acc.unlocked, ...games])];
  acc.updatedAt = new Date().toISOString();
  reg[session.playerId] = acc;
  saveRegistry(reg);
  saveUnlocked(acc.unlocked);

  await pushProfileToPlayFab(acc, session.sessionTicket);
  return acc.unlocked;
}

export async function playfabRecordMatch(args: {
  gameId: GameId;
  mode?: string;
  won?: boolean;
  isTeam?: boolean;
  score: number;
  level: number;
  correct: number;
  wrong?: number;
  tournamentPoints?: number;
  tournamentRankId?: string;
  isDraw?: boolean;
}): Promise<StoredAccount | null> {
  const cfg = checkAndApplyScheduledReset();
  const session = loadStoredSession();
  if (!session) return null;
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return null;

  ensurePlayerSeasonAligned(acc, cfg);

  const safeScore = Math.max(0, args.score);
  const safeLevel = Math.max(1, args.level);
  const mode = args.mode ?? "padrao";
  const wrong = args.wrong ?? 0;
  const won = typeof args.won === "boolean" ? args.won : isMatchVictory(safeScore, args.correct, wrong);
  const flawless = isFlawlessMatch({
    score: safeScore,
    correct: args.correct,
    wrong,
    mode,
  });
  const rawEarnedXp = xpFromMatch(safeScore, args.correct, wrong, safeLevel);
  const todayKey = getLocalDateKey();
  const currentWeekKey = getCurrentWeekKey();

  // Persiste pontos e patente do torneio semanal ranqueado no perfil do PlayFab
  if (typeof args.tournamentPoints === "number") {
    acc.profile.tournamentPoints = Math.max(0, Math.floor(args.tournamentPoints));
    acc.profile.bestTournamentPoints = Math.max(
      acc.profile.bestTournamentPoints ?? 0,
      acc.profile.tournamentPoints,
    );
  }
  if (args.tournamentRankId) {
    acc.profile.tournamentRankId = args.tournamentRankId;
  }
  if (mode === "torneio_semanal" || typeof args.tournamentPoints === "number") {
    acc.profile.tournamentWeekKey = currentWeekKey;
  }

  // Update consecutive daily activity streak and activeDates
  const activeDatesSet = new Set<string>(
    Array.isArray(acc.profile.activeDates) ? acc.profile.activeDates : [],
  );
  if (acc.profile.lastActiveDate) {
    activeDatesSet.add(acc.profile.lastActiveDate);
  }
  activeDatesSet.add(todayKey);
  acc.profile.activeDates = Array.from(activeDatesSet).sort();

  if (acc.profile.lastActiveDate !== todayKey) {
    const yesterdayKey = getPreviousDateKey(todayKey);
    if (acc.profile.lastActiveDate === yesterdayKey) {
      acc.profile.streakDays = (acc.profile.streakDays ?? 0) + 1;
    } else {
      acc.profile.streakDays = 1;
    }
    acc.profile.lastActiveDate = todayKey;
  } else if (!acc.profile.streakDays || acc.profile.streakDays < 1) {
    acc.profile.streakDays = 1;
  }

  // Ensure streakDays is strictly bounded by verified active dates and matches played
  acc.profile.streakDays = getPlayerStreakDays({
    ...acc.profile,
    matchesPlayed: Math.max((acc.profile.matchesPlayed ?? 0) + 1, 1),
  });

  const eventBonuses = getActiveEventBonuses(
    args.gameId,
    cfg.dailyXpCap,
    20,
    undefined,
    undefined,
    undefined,
    mode === "torneio_semanal",
  );
  const pointsMultiplier = eventBonuses.pointsMultiplier ?? 1;

  let earnedXp = 0;
  if (mode === "x1_online") {
    // Dedicated +100 XP/day extra cap for Arena X1 (unlimited matches per day)
    acc.profile.x1Matches = (acc.profile.x1Matches ?? 0) + 1;
    if (won) {
      acc.profile.x1Wins = (acc.profile.x1Wins ?? 0) + 1;
      if (acc.profile.weeklyX1WeekKey !== currentWeekKey) {
        acc.profile.weeklyX1Wins = 1;
        acc.profile.weeklyX1WeekKey = currentWeekKey;
      } else {
        acc.profile.weeklyX1Wins = (acc.profile.weeklyX1Wins ?? 0) + 1;
      }
    } else if (args.isDraw) {
      acc.profile.x1Draws = (acc.profile.x1Draws ?? 0) + 1;
    } else {
      acc.profile.x1Losses = (acc.profile.x1Losses ?? 0) + 1;
    }
    const x1CapRes = applyDailyXpCap({
      rawEarnedXp: won ? 25 : 10,
      currentDailyXp: acc.profile.dailyX1Xp ?? 0,
      lastDateKey: acc.profile.dailyXpDate,
      todayKey,
      dailyCap: X1_DAILY_EXTRA_XP_CAP,
    });
    earnedXp = x1CapRes.grantedXp;
    acc.profile.dailyX1Xp = x1CapRes.newDailyXp;
    acc.profile.dailyXpDate = todayKey;
  } else if (mode === "torneio_semanal") {
    // Dedicated +100 XP/day extra cap for Weekly Ranked Tournament (10 entries/day × 10 XP = 100 XP)
    const usedEntries = acc.profile.dailyTournamentEntries ?? 0;
    if (usedEntries < TOURNAMENT_DAILY_ENTRIES_LIMIT) {
      acc.profile.dailyTournamentEntries = usedEntries + 1;
      const tourCapRes = applyDailyXpCap({
        rawEarnedXp: TOURNAMENT_XP_PER_ENTRY,
        currentDailyXp: acc.profile.dailyTournamentXp ?? 0,
        lastDateKey: acc.profile.dailyXpDate,
        todayKey,
        dailyCap: TOURNAMENT_DAILY_EXTRA_XP_CAP,
      });
      earnedXp = tourCapRes.grantedXp;
      acc.profile.dailyTournamentXp = tourCapRes.newDailyXp;
      acc.profile.dailyXpDate = todayKey;
    } else {
      earnedXp = 0;
    }
  } else {
    // Normal match XP: default capped at 20 XP per match (can be raised by special event matchXpCap)
    const bonuses = getActiveEventBonuses(args.gameId, cfg.dailyXpCap, 20);
    const effectiveMatchCap = bonuses.matchXpCap > 20
      ? bonuses.matchXpCap
      : Math.round(20 * bonuses.multiplier);
    const multipliedRawXp = Math.round(rawEarnedXp * bonuses.multiplier);
    let cappedMatchXp = Math.min(multipliedRawXp, effectiveMatchCap);

    // Quando em equipes (disputas em grupo), o XP ganho é reduzido em 4X (ex: 20 XP vira 5 XP)
    const isTeamMode = Boolean(args.isTeam || mode === "equipes");
    if (isTeamMode) {
      cappedMatchXp = adjustXpForGameMode(cappedMatchXp, true);
    }

    const effectiveDailyCap = bonuses.dailyXpCap;
    const wasAlreadyAtDailyCap =
      acc.profile.dailyXpDate === todayKey && (acc.profile.dailyXp ?? 0) >= effectiveDailyCap;

    const dailyCapResult = applyDailyXpCap({
      rawEarnedXp: cappedMatchXp,
      currentDailyXp: acc.profile.dailyXp ?? 0,
      lastDateKey: acc.profile.dailyXpDate,
      todayKey,
      dailyCap: effectiveDailyCap,
    });
    earnedXp = dailyCapResult.grantedXp;
    acc.profile.dailyXp = dailyCapResult.newDailyXp;
    acc.profile.dailyXpDate = dailyCapResult.dateKey;

    // Reseta partidas pós-cap se mudou o dia
    if (acc.profile.dailyPostCapDate !== todayKey) {
      acc.profile.dailyPostCapMatches = 0;
      acc.profile.dailyPostCapDate = todayKey;
    }

    // Se a partida foi jogada após o limite de XP diário já ter sido alcançado, incrementa o contador diário
    if (wasAlreadyAtDailyCap) {
      acc.profile.dailyPostCapMatches = (acc.profile.dailyPostCapMatches ?? 0) + 1;
    }
  }

  const existingIdx = acc.stats.findIndex(
    (s) => s.game_id === args.gameId && s.mode === mode,
  );

  const nowIso = new Date().toISOString();
  if (existingIdx >= 0) {
    const cur = acc.stats[existingIdx];
    const prevFlawless =
      cur.plays === 1 && (cur.last_wrong ?? 0) > 0 ? 0 : (cur.flawless_wins ?? 0);

    // Concede pontos por bater o próprio recorde pessoal em qualquer jogo
    if (safeScore > (cur.best_score ?? 0) && (cur.best_score ?? 0) > 0) {
      awardCareerPoints(acc.profile, RECORD_PERSONAL_POINTS, "Novo Recorde Pessoal", pointsMultiplier);
    }

    acc.stats[existingIdx] = {
      ...cur,
      plays: cur.plays + 1,
      wins: (cur.wins ?? 0) + (won ? 1 : 0),
      flawless_wins: prevFlawless + (flawless ? 1 : 0),
      last_wrong: wrong,
      best_score: Math.max(cur.best_score, safeScore),
      best_level: Math.max(cur.best_level, safeLevel),
      last_played_at: nowIso,
    };
  } else {
    acc.stats.push({
      game_id: args.gameId,
      mode,
      plays: 1,
      wins: won ? 1 : 0,
      flawless_wins: flawless ? 1 : 0,
      last_wrong: wrong,
      best_score: safeScore,
      best_level: safeLevel,
      last_played_at: nowIso,
    });
  }

  // Pontuação de Carreira: inicialização, primeiro jogo do dia, precisão e vitórias
  ensurePlayerCareerPointsInitialized(acc.profile);
  checkAndApplyFirstGameOfDayPoints(acc.profile, undefined, pointsMultiplier);

  if (flawless) {
    awardCareerPoints(acc.profile, FLAWLESS_MATCH_POINTS, "Partida Perfeita", pointsMultiplier);
  }
  if (mode === "x1_online" && won) {
    awardCareerPoints(acc.profile, X1_WIN_POINTS, "Vitória no Desafio X1", pointsMultiplier);
  }
  if (mode === "torneio_semanal" && won) {
    awardCareerPoints(acc.profile, RANKED_WIN_POINTS, "Vitória na Ranqueada", pointsMultiplier);
  }
  if (args.tournamentRankId) {
    checkTournamentTierPromotion(args.tournamentRankId, acc.profile, pointsMultiplier);
  }

  const nextXp = acc.profile.xp + earnedXp;
  const nextSeasonXp = (acc.profile.seasonXp ?? 0) + earnedXp;
  const nextWins = (acc.profile.wins ?? 0) + (won ? 1 : 0);
  const nextMatches = (acc.profile.matchesPlayed ?? 0) + 1;
  const distinctGames = getDistinctGamesPlayed(
    acc.profile,
    acc.stats,
    {
      gameId: args.gameId,
      score: safeScore,
      level: safeLevel,
      correct: args.correct,
      wrong,
      mode,
    },
    cfg.enabledGames,
  );

  acc.profile.xp = nextXp;
  acc.profile.seasonXp = nextSeasonXp;
  acc.profile.wins = nextWins;
  acc.profile.matchesPlayed = nextMatches;
  acc.profile.totalMatches = nextMatches;
  acc.profile.distinctGamesPlayed = distinctGames;

  const maxAvailableGames = Math.max(1, getEnabledGameIdsSet(cfg.enabledGames).size);
  const stageRes = advanceLevelStageOnMatch({
    currentLevel: acc.profile.level,
    stageProgress: acc.profile.levelStageProgress,
    newXp: nextXp,
    lifetimeMatches: nextMatches,
    lifetimeWins: nextWins,
    gameId: args.gameId,
    won,
    isGameEnabled: cfg.enabledGames[args.gameId] !== false,
    maxAvailableGames,
  });
  acc.profile.level = stageRes.level;
  acc.profile.levelStageProgress = stageRes.stageProgress;
  checkLevelPromotionPoints(acc.profile.level, acc.profile, pointsMultiplier);

  if (earnedXp > 0) {
    try {
      const gName = GAME_NAMES[args.gameId] || args.gameId;
      const src = mode === "torneio_semanal" ? "torneio_semanal" : mode === "x1_online" ? "arena_x1" : "partida";
      recordScoreLedgerEntry({
        playerId: acc.profile.id || acc.profile.nick,
        playerNick: acc.profile.nick,
        type: "xp",
        source: src,
        amount: earnedXp,
        balanceAfter: nextXp,
        reason: `Partida ${won ? "Vencida" : "Concluída"} (${gName})`,
        metadata: { gameId: args.gameId, mode, score: safeScore, level: safeLevel },
      });
    } catch {
      /* ignore */
    }
  }

  acc.profile.badges = computeBadges({
    existing: acc.profile.badges,
    xp: nextXp,
    wins: nextWins,
    matchesPlayed: nextMatches,
    distinctGamesPlayed: distinctGames,
    lastMatchScore: safeScore,
  });

  // Atualiza progresso dos eventos ativos para obtenção de medalhas especiais de evento
  const nowObj = new Date();
  const allActiveEvents = [
    ...getActiveSpecialEvents(cfg.specialEvents ?? loadSpecialEvents(), nowObj),
    ...getActiveRecurringEvents(cfg.recurringEvents ?? loadRecurringEvents(), nowObj),
  ];

  if (allActiveEvents.length > 0) {
    if (!acc.profile.eventProgress) {
      acc.profile.eventProgress = {};
    }
    for (const ev of allActiveEvents) {
      const cycleKey = getEventCycleKey(ev, nowObj);
      let evProg = acc.profile.eventProgress[ev.id];
      if (!evProg || evProg.cycleKey !== cycleKey) {
        evProg = {
          cycleKey,
          matchesCount: 0,
          matchesByGame: {},
          xpEarned: 0,
          xpByGame: {},
          bestScoreByGame: {},
          bestLevelByGame: {},
          flawlessCount: 0,
          x1Wins: 0,
          maxCombo: 0,
          dailyCapDaysCount: 0,
          teamMatchesCount: 0,
          distinctGamesPlayed: [],
        };
        acc.profile.eventProgress[ev.id] = evProg;
      }

      const inScope =
        ev.scope === "todos" ||
        (ev.scope === "modo_ranqueado" && mode === "torneio_semanal") ||
        (ev.scope !== "modo_ranqueado" && ev.scope === args.gameId);
      if (inScope) {
        evProg.matchesCount = (evProg.matchesCount ?? 0) + 1;
        evProg.matchesByGame = evProg.matchesByGame ?? {};
        evProg.matchesByGame[args.gameId] = (evProg.matchesByGame[args.gameId] ?? 0) + 1;
        evProg.xpEarned = (evProg.xpEarned ?? 0) + earnedXp;
        evProg.xpByGame = evProg.xpByGame ?? {};
        evProg.xpByGame[args.gameId] = (evProg.xpByGame[args.gameId] ?? 0) + earnedXp;

        evProg.bestScoreByGame = evProg.bestScoreByGame ?? {};
        evProg.bestScoreByGame[args.gameId] = Math.max(evProg.bestScoreByGame[args.gameId] ?? 0, safeScore);

        evProg.bestLevelByGame = evProg.bestLevelByGame ?? {};
        evProg.bestLevelByGame[args.gameId] = Math.max(evProg.bestLevelByGame[args.gameId] ?? 1, safeLevel);

        if (flawless) {
          evProg.flawlessCount = (evProg.flawlessCount ?? 0) + 1;
        }
        if (mode === "x1_online" && won) {
          evProg.x1Wins = (evProg.x1Wins ?? 0) + 1;
        }
        if (args.correct > 0) {
          evProg.maxCombo = Math.max(evProg.maxCombo ?? 0, args.correct);
        }
        if (Boolean(args.isTeam || mode === "equipes")) {
          evProg.teamMatchesCount = (evProg.teamMatchesCount ?? 0) + 1;
        }
        if (!evProg.distinctGamesPlayed) {
          evProg.distinctGamesPlayed = [];
        }
        if (!evProg.distinctGamesPlayed.includes(args.gameId)) {
          evProg.distinctGamesPlayed.push(args.gameId);
        }
      }

      // Verifica meta de bater o limite diário de XP
      const currentDailyXp = acc.profile.dailyXp ?? 0;
      const effectiveCap = cfg.dailyXpCap ?? 1000;
      if (currentDailyXp >= effectiveCap && evProg.lastDailyCapDate !== todayKey) {
        evProg.lastDailyCapDate = todayKey;
        evProg.dailyCapDaysCount = (evProg.dailyCapDaysCount ?? 0) + 1;
      }
    }
  }

  // Evaluate new medals at the end of the match using the exact final wrong/correct/score counts
  const allMedals = getAllAvailableMedals(cfg.customMedals);
  const newlyAwarded = evaluatePlayerMedals(
    {
      profile: acc.profile,
      stats: acc.stats,
      lastMatch: {
        gameId: args.gameId,
        score: safeScore,
        level: safeLevel,
        correct: args.correct,
        wrong,
        mode,
      },
      todayXpEarned: acc.profile.dailyXp,
      streakDays: acc.profile.streakDays,
      weeklyX1Wins: acc.profile.weeklyX1Wins,
      enabledGames: cfg.enabledGames,
    },
    allMedals,
  );

  if (newlyAwarded.length > 0) {
    const currentUnlocked = acc.profile.unlockedMedals ?? [];
    let medalsBonusXp = 0;
    for (const m of newlyAwarded) {
      currentUnlocked.push({ medalId: m.id, unlockedAt: nowIso });
      medalsBonusXp += MEDAL_XP_REWARDS[m.rarity] ?? 10;
      const ptsReward = MEDAL_POINTS_REWARDS[m.rarity] ?? 20;
      awardCareerPoints(acc.profile, ptsReward, m.title, pointsMultiplier);
      try {
        recordScoreLedgerEntry({
          playerId: acc.profile.id,
          playerNick: acc.profile.nick,
          type: "medal",
          source: "medalha",
          amount: 1,
          reason: `Medalha Conquistada: ${m.title}`,
          metadata: { medalId: m.id, medalTitle: m.title },
        });
      } catch {
        /* ignore */
      }
    }
    acc.profile.unlockedMedals = currentUnlocked;

    // Grant instant bonus XP for unlocked medals (Bronze: 10, Prata: 20, Ouro: 30, etc.)
    if (medalsBonusXp > 0) {
      acc.profile.xp += medalsBonusXp;
      acc.profile.seasonXp = (acc.profile.seasonXp ?? 0) + medalsBonusXp;
      try {
        recordScoreLedgerEntry({
          playerId: acc.profile.id,
          playerNick: acc.profile.nick,
          type: "xp",
          source: "medalha",
          amount: medalsBonusXp,
          balanceAfter: acc.profile.xp,
          reason: "Bônus de XP por Medalhas Conquistadas",
        });
      } catch {
        /* ignore */
      }
      const syncedAfterBonus = syncLevelStageProgress({
        xp: acc.profile.xp,
        lifetimeMatches: acc.profile.matchesPlayed,
        lifetimeWins: acc.profile.wins,
        lifetimeDistinctGames: acc.profile.distinctGamesPlayed ?? 1,
        currentLevel: acc.profile.level,
        existingStage: acc.profile.levelStageProgress,
        maxAvailableGames,
      });
      acc.profile.level = syncedAfterBonus.level;
      acc.profile.levelStageProgress = syncedAfterBonus.stageProgress;
      checkLevelPromotionPoints(acc.profile.level, acc.profile, pointsMultiplier);

      // Re-evaluate in case the bonus XP or newly added medals unlocked a level/meta medal
      const secondaryAwarded = evaluatePlayerMedals(
        {
          profile: acc.profile,
          stats: acc.stats,
          todayXpEarned: acc.profile.dailyXp,
          streakDays: acc.profile.streakDays,
          weeklyX1Wins: acc.profile.weeklyX1Wins,
          enabledGames: cfg.enabledGames,
        },
        allMedals,
      );
      for (const sm of secondaryAwarded) {
        if (!currentUnlocked.some((u) => u.medalId === sm.id)) {
          currentUnlocked.push({ medalId: sm.id, unlockedAt: nowIso });
          newlyAwarded.push(sm);
          const extraXp = MEDAL_XP_REWARDS[sm.rarity] ?? 10;
          medalsBonusXp += extraXp;
          acc.profile.xp += extraXp;
          acc.profile.seasonXp = (acc.profile.seasonXp ?? 0) + extraXp;
          const ptsReward = MEDAL_POINTS_REWARDS[sm.rarity] ?? 20;
          awardCareerPoints(acc.profile, ptsReward, sm.title, pointsMultiplier);
        }
      }
      acc.profile.unlockedMedals = currentUnlocked;
    }

    // Invalida cache de pioneiros para novo cálculo determinístico
    invalidatePioneersCache();

    // Send notifications to Admin Mailbox (apenas a partir do nível Ouro: ouro, platina, diamante, herói, secreta)
    const adminNotifs = cfg.adminMedalNotifications ?? [];
    const goldPlusMedals = newlyAwarded.filter(
      (m) =>
        m.rarity === "ouro" ||
        m.rarity === "platina" ||
        m.rarity === "diamante" ||
        m.rarity === "heroi" ||
        m.rarity === "secreta"
    );

    for (const m of goldPlusMedals) {
      const notifItem: AdminMedalNotification = {
        id: `adm_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        studentId: acc.profile.id,
        studentNick: acc.profile.nick,
        studentFullName: acc.profile.full_name,
        studentSchool: acc.profile.school,
        medalId: m.id,
        medalTitle: m.title,
        medalRarity: m.rarity,
        medalIcon: m.iconName,
        unlockedAt: nowIso,
        read: false,
      };
      adminNotifs.unshift(notifItem);

      createInboxMessage({
        recipientId: "admin",
        sender: "sistema",
        category: "medalha_ouro",
        title: `Nova Medalha ${m.rarity.toUpperCase()}: ${m.title}`,
        body: `O aluno ${acc.profile.full_name} (${acc.profile.nick}) da ${acc.profile.school} conquistou a medalha ${m.title}!`,
        metadata: {
          studentId: acc.profile.id,
          studentNick: acc.profile.nick,
          studentFullName: acc.profile.full_name,
          studentSchool: acc.profile.school,
          medalId: m.id,
          medalTitle: m.title,
          medalRarity: m.rarity,
        },
      });

      void pushAdminMedalNotificationToPlayFab(notifItem);
    }
    cfg.adminMedalNotifications = adminNotifs.slice(0, 200); // retain last 200 mailbox entries
    saveAdminConfig(cfg);

    // Dispatch custom browser event for celebration popup
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("desafios:medal-unlocked", {
          detail: {
            medals: newlyAwarded,
            studentNick: acc.profile.nick,
            bonusXp: medalsBonusXp,
          },
        }),
      );
    }
  }

  acc.updatedAt = nowIso;

  reg[session.playerId] = acc;
  saveRegistry(reg);

  // Sync with Azure PlayFab Statistics & UserData
  if (session.sessionTicket && isPlayFabConfigured()) {
    const sSlug = schoolSlug(acc.profile.school);
    const sId = cfg.seasonId;
    const playerStage = stageFromBirthdate(acc.profile.birthdate, new Date(), acc.profile.school);
    const bestGameScore = Math.max(
      safeScore,
      ...acc.stats.filter((s) => s.game_id === args.gameId).map((s) => s.best_score),
    );
    const medalsTotal = (acc.profile.unlockedMedals ?? []).reduce(
      (sum, m) => sum + (m.count ?? 1),
      0,
    );
    const statistics = [
      { StatisticName: "XP_Total", Value: acc.profile.xp },
      { StatisticName: "Medals_Total", Value: medalsTotal },
      { StatisticName: `XP_Season_S${sId}`, Value: acc.profile.seasonXp },
      { StatisticName: `XP_Season_S${sId}_${playerStage.id}`, Value: acc.profile.seasonXp },
      { StatisticName: `Best_${args.gameId}`, Value: bestGameScore },
      { StatisticName: `Best_${args.gameId}_S${sId}`, Value: bestGameScore },
      { StatisticName: `Best_${args.gameId}_S${sId}_${playerStage.id}`, Value: bestGameScore },
      { StatisticName: `School_${sSlug}_XP`, Value: acc.profile.seasonXp },
    ];

    // Try CloudScript first; fall back to direct UpdatePlayerStatistics
    const csRes = await callPlayFabClient(
      "ExecuteCloudScript",
      {
        FunctionName: "RecordMatchResult",
        FunctionParameter: {
          gameId: args.gameId,
          mode,
          score: safeScore,
          level: safeLevel,
          correct: args.correct,
          wrong,
          earnedXp,
          statistics,
        },
      },
      session.sessionTicket,
    );

    if (csRes.error) {
      await callPlayFabClient(
        "UpdatePlayerStatistics",
        { Statistics: statistics },
        session.sessionTicket,
      );
    }

    await pushProfileToPlayFab(acc, session.sessionTicket);
  }

  return acc;
}

/* --------------------- Leaderboards (Rankings) Query --------------------- */

const RANK_HISTORY_STORAGE_KEY = "desafios-leaderboard-rank-history-v2";
let lastRosterLeaderboardSyncAt = 0;

function loadLeaderboardRankHistory(): Record<string, Record<string, RankHistoryState>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RANK_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLeaderboardRankHistory(history: Record<string, Record<string, RankHistoryState>>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RANK_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* ignore storage quota */
  }
}

export type LeaderboardFilter =
  | { kind: "points"; stage?: RankingFilterCategory }
  | { kind: "medals"; stage?: RankingFilterCategory }
  | { kind: "xp_season"; stage?: RankingFilterCategory }
  | { kind: "xp_total"; stage?: RankingFilterCategory }
  | { kind: "game"; gameId: GameId; stage?: RankingFilterCategory }
  | { kind: "school"; school: string; stage?: RankingFilterCategory };

export async function fetchLeaderboard(
  filter: LeaderboardFilter,
  maxResults = 50,
): Promise<LeaderboardEntry[]> {
  const cfg = checkAndApplyScheduledReset();
  const session = loadStoredSession();
  const currentId = session?.playerId;

  // 1. Update best_score for already-played enabled games in the logged-in account (never inject unplayed games from shared browser storage)
  if (currentId) {
    const regBefore = loadRegistry();
    const activeAcc = regBefore[currentId];
    if (activeAcc) {
      const browserStats = loadStats();
      let changedLocalStats = false;
      for (const gId of ALL_GAME_IDS) {
        if (cfg.enabledGames[gId] === false) continue;
        const localBest = browserStats[gId]?.bestScore ?? 0;
        const localLevel = browserStats[gId]?.bestLevel ?? 1;
        if (localBest > 0) {
          const existingIdx = activeAcc.stats.findIndex((s) => s.game_id === gId);
          if (existingIdx >= 0 && localBest > activeAcc.stats[existingIdx].best_score) {
            activeAcc.stats[existingIdx].best_score = localBest;
            activeAcc.stats[existingIdx].best_level = Math.max(
              activeAcc.stats[existingIdx].best_level,
              localLevel,
            );
            changedLocalStats = true;
          }
        }
      }
      if (changedLocalStats) {
        regBefore[currentId] = activeAcc;
        saveRegistry(regBefore);
      }
    }
  }

  // 2. Sync shared student roster from PlayFab cloud (throttled to every 8s) so all devices' scores/medals appear
  if (isPlayFabConfigured() && Date.now() - lastRosterLeaderboardSyncAt > 8_000) {
    lastRosterLeaderboardSyncAt = Date.now();
    await syncStudentRosterFromPlayFab(session?.sessionTicket);
  }

  const reg = loadRegistry();
  const localAccounts = Object.values(reg).map((acc) => ensurePlayerSeasonAligned(acc, cfg));
  saveRegistry(reg);

  // Map PlayFab live statistic values (if available) to augment local/roster values
  const playfabStatByPlayer = new Map<string, number>();

  if (session?.sessionTicket && isPlayFabConfigured() && filter.kind !== "medals") {
    const stageParam =
      filter.stage === "etapa_1" || filter.stage === "5º ano"
        ? "etapa_1"
        : filter.stage === "etapa_2" ||
            filter.stage === "6º ano" ||
            filter.stage === "7º ano" ||
            filter.stage === "8º ano" ||
            filter.stage === "9º ano"
          ? "etapa_2"
          : filter.stage === "etapa_3"
            ? "etapa_3"
            : null;

    let statName = stageParam
      ? `XP_Season_S${cfg.seasonId}_${stageParam}`
      : `XP_Season_S${cfg.seasonId}`;
    if (filter.kind === "xp_total") statName = "XP_Total";
    else if (filter.kind === "game") {
      statName = stageParam
        ? `Best_${filter.gameId}_S${cfg.seasonId}_${stageParam}`
        : `Best_${filter.gameId}_S${cfg.seasonId}`;
    } else if (filter.kind === "school") {
      statName = `School_${schoolSlug(filter.school)}_XP`;
    }

    const { data } = await callPlayFabClient<{
      Leaderboard?: {
        PlayFabId: string;
        DisplayName?: string;
        StatValue: number;
        Position: number;
      }[];
    }>(
      "GetLeaderboard",
      {
        StatisticName: statName,
        StartPosition: 0,
        MaxResultsCount: maxResults,
      },
      session.sessionTicket,
    );

    if (data?.Leaderboard && data.Leaderboard.length > 0) {
      for (const row of data.Leaderboard) {
        if (row.PlayFabId) {
          playfabStatByPlayer.set(row.PlayFabId, row.StatValue);
        }
        if (row.DisplayName) {
          playfabStatByPlayer.set(row.DisplayName.toLowerCase(), row.StatValue);
        }
      }
    }
  }

  // 3. Evaluate all registered students (cloud roster + local accounts + PlayFab stats)
  const rows: Omit<LeaderboardEntry, "rank">[] = [];

  for (const acc of localAccounts) {
    const p = acc.profile;
    // Admins and profiles in trash are excluded from competitive student leaderboards
    if (isSpecialAdminAccount(p) || p.deletedAt) continue;

    if (!matchesRankingCategory(p, filter.stage)) continue;
    if (filter.kind === "school" && p.school !== filter.school) continue;

    const pAge = ageFrom(p.birthdate);
    const stInfo = stageFromBirthdate(p.birthdate, new Date(), p.school);
    const pfStatVal =
      (p.playfabId ? playfabStatByPlayer.get(p.playfabId) : undefined) ??
      playfabStatByPlayer.get(p.nick.toLowerCase()) ??
      0;

    const medalsCount = (p.unlockedMedals ?? []).reduce(
      (sum, m) => sum + (m.count ?? 1),
      0,
    );
    const xpValue = p.seasonXp ?? p.xp;

    let value = 0;
    if (filter.kind === "points") {
      value = p.careerPoints ?? 0;
    } else if (filter.kind === "medals") {
      value = medalsCount;
    } else if (filter.kind === "xp_total") {
      value = Math.max(p.xp, pfStatVal);
    } else if (filter.kind === "xp_season" || filter.kind === "school") {
      value = Math.max(xpValue, pfStatVal);
    } else if (filter.kind === "game") {
      const gameRows = acc.stats.filter((s) => s.game_id === filter.gameId);
      const localBest = gameRows.length > 0 ? Math.max(...gameRows.map((g) => g.best_score)) : 0;
      value = Math.max(localBest, pfStatVal);
    }

    if (value <= 0 && filter.kind === "game") continue;

    const titleInfo = levelTitle(p.level);
    rows.push({
      playerId: p.id,
      nick: p.nick,
      fullName: p.full_name || p.nick,
      school: p.school,
      grade: p.grade ?? (is5thGradeSchool(p.school) ? "5º ano" : null),
      turma: p.turma ?? null,
      age: pAge,
      stage: stInfo.id,
      stageLabel: stInfo.shortLabel,
      level: p.level,
      rankTitle: titleInfo.title,
      rankEmoji: titleInfo.emoji,
      value,
      careerPoints: p.careerPoints ?? 0,
      pointsBalance: p.pointsBalance ?? 0,
      medalsCount,
      xpValue,
      wins: p.wins ?? 0,
      isCurrentPlayer: p.nickNormalized === currentId,
    });
  }

  // 4. Sort according to the selected leaderboard tab
  rows.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if ((b.xpValue ?? 0) !== (a.xpValue ?? 0)) return (b.xpValue ?? 0) - (a.xpValue ?? 0);
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.fullName || a.nick).localeCompare(b.fullName || b.nick);
  });

  const ranked: LeaderboardEntry[] = rows.slice(0, maxResults).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  // 5. Compute real rank movement arrows (up / down / same) and persist snapshot
  const normalizedStageKey =
    filter.stage === "etapa_1" || filter.stage === "5º ano"
      ? "etapa_1"
      : filter.stage === "etapa_2" ||
          filter.stage === "6º ano" ||
          filter.stage === "7º ano" ||
          filter.stage === "8º ano" ||
          filter.stage === "9º ano"
        ? "etapa_2"
        : filter.stage === "etapa_3"
          ? "etapa_3"
          : "TODAS";
  const boardKey = `${filter.kind}_${normalizedStageKey}_${
    filter.kind === "game" ? filter.gameId : filter.kind === "school" ? filter.school : "all"
  }`;
  const allHistory = loadLeaderboardRankHistory();
  const prevBoardHistory = allHistory[boardKey] ?? {};
  const { entriesWithTrend, nextHistory } = evaluateLeaderboardRankChanges(ranked, prevBoardHistory);
  allHistory[boardKey] = nextHistory;
  saveLeaderboardRankHistory(allHistory);

  return entriesWithTrend;
}

/** Returns summary stats per school for the School Ranking tab & Admin overview. */
export function getSchoolStandings(): {
  school: string;
  studentsCount: number;
  totalXp: number;
  totalWins: number;
  topStudent: string | null;
}[] {
  const cfg = checkAndApplyScheduledReset();
  const reg = loadRegistry();
  const accounts = Object.values(reg).map((a) => ensurePlayerSeasonAligned(a, cfg));

  return SCHOOLS.map((s) => {
    const members = accounts.filter(
      (a) => a.profile.school === s.name && !isSpecialAdminAccount(a.profile),
    );
    members.sort((a, b) => (b.profile.seasonXp ?? b.profile.xp) - (a.profile.seasonXp ?? a.profile.xp));
    const totalXp = members.reduce((sum, a) => sum + (a.profile.seasonXp ?? a.profile.xp), 0);
    const totalWins = members.reduce((sum, a) => sum + (a.profile.wins ?? 0), 0);
    return {
      school: s.name,
      studentsCount: members.length,
      totalXp,
      totalWins,
      topStudent: members[0] ? (members[0].profile.full_name || members[0].profile.nick) : null,
    };
  }).sort((a, b) => b.totalXp - a.totalXp || b.totalWins - a.totalWins);
}

/** Returns all registered players for the Admin Panel overview (excludes trash by default). */
export function getAllRegisteredPlayers(includeDeleted = false): PlayerProfile[] {
  const cfg = checkAndApplyScheduledReset();
  const reg = loadRegistry();
  const seen = new Set<string>();
  const list: PlayerProfile[] = [];

  for (const rawAcc of Object.values(reg)) {
    const p = ensurePlayerSeasonAligned(rawAcc, cfg).profile;
    if (!includeDeleted && p.deletedAt) continue;
    if (includeDeleted && !p.deletedAt) {
      /* include */
    }
    const ident = (p.nickNormalized || p.nick || p.id).toLowerCase().trim();
    if (seen.has(ident)) continue;
    seen.add(ident);
    list.push(p);
  }

  list.sort((a, b) => b.xp - a.xp);
  return list;
}

/** Returns all student profiles currently in the Admin Recycle Bin (trash). */
export function getTrashPlayers(): PlayerProfile[] {
  const cfg = checkAndApplyScheduledReset();
  const reg = loadRegistry();
  const seen = new Set<string>();
  const list: PlayerProfile[] = [];

  for (const rawAcc of Object.values(reg)) {
    const p = ensurePlayerSeasonAligned(rawAcc, cfg).profile;
    if (!p.deletedAt) continue;
    const ident = (p.nickNormalized || p.nick || p.id).toLowerCase().trim();
    if (seen.has(ident)) continue;
    seen.add(ident);
    list.push(p);
  }

  list.sort((a, b) => {
    const timeA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const timeB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return timeB - timeA;
  });
  return list;
}

/**
 * Moves a student profile to the trash for 7 days.
 * The profile immediately disappears from rankings, records, and active student lists.
 */
export async function moveStudentToTrash(
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  const reg = loadRegistry();
  const targetAcc =
    reg[playerId] ||
    Object.values(reg).find(
      (a) => a.profile.id === playerId || a.profile.nickNormalized === playerId,
    );

  if (!targetAcc) {
    return { success: false, error: "Aluno não encontrado no registro." };
  }

  if (targetAcc.profile.isAdmin || isSpecialAdminAccount(targetAcc.profile)) {
    return {
      success: false,
      error: "Contas de administrador não podem ser movidas para a lixeira.",
    };
  }

  const nowIso = new Date().toISOString();
  const permIso = new Date(Date.now() + STUDENT_TRASH_RETENTION_MS).toISOString();

  targetAcc.profile.deletedAt = nowIso;
  targetAcc.profile.deleteScheduledPermanentAt = permIso;
  targetAcc.updatedAt = nowIso;

  const pNorm = targetAcc.profile.nickNormalized;
  const pId = targetAcc.profile.id;
  const pNick = targetAcc.profile.nick;

  // Save to registry under all keys referencing this student
  reg[pNorm] = targetAcc;
  if (pId && pId !== pNorm) {
    reg[pId] = targetAcc;
  }
  saveRegistry(reg);

  // Remove student from game records
  try {
    removePlayerFromGameRecords(pId, pNick);
  } catch {
    /* ignore */
  }

  // Remove student from presence
  try {
    void removePlayerFromPresence(pId, pNick);
  } catch {
    /* ignore */
  }

  // Remove student from weekly tournament rankings
  try {
    removePlayerFromTournament(pId, pNick);
  } catch {
    /* ignore */
  }

  // If this student is currently logged in on this browser, disconnect them
  const currentSession = loadStoredSession();
  if (
    currentSession?.playerId === pId ||
    currentSession?.playerId === pNorm
  ) {
    playfabSignOut();
  }

  // Sincroniza com PlayFab SharedGroupData informando que o aluno está na lixeira
  if (isPlayFabConfigured()) {
    try {
      const ticket = (await getAdminPlayFabTicket()) ?? currentSession?.sessionTicket;
      if (ticket) {
        await callPlayFabClient(
          "UpdateSharedGroupData",
          {
            SharedGroupId: ROSTER_SHARED_GROUP_ID,
            Data: {
              [getStudentRosterCloudKey(pNorm)]: JSON.stringify({
                ...targetAcc.profile,
                stats: targetAcc.stats ?? [],
                deletedAt: nowIso,
                deleteScheduledPermanentAt: permIso,
                updatedAt: nowIso,
              }),
            },
            Permission: "Public",
          },
          ticket,
        );
      }
    } catch {
      /* ignore cloud failure */
    }
  }

  return { success: true };
}

/**
 * Restores a student profile from the trash, making them active again in rankings and records.
 */
export async function restoreStudentFromTrash(
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  const reg = loadRegistry();
  const targetAcc =
    reg[playerId] ||
    Object.values(reg).find(
      (a) => a.profile.id === playerId || a.profile.nickNormalized === playerId,
    );

  if (!targetAcc) {
    return { success: false, error: "Aluno não encontrado na lixeira." };
  }

  delete targetAcc.profile.deletedAt;
  delete targetAcc.profile.deleteScheduledPermanentAt;
  const nowIso = new Date().toISOString();
  targetAcc.updatedAt = nowIso;

  const pNorm = targetAcc.profile.nickNormalized;
  const pId = targetAcc.profile.id;

  reg[pNorm] = targetAcc;
  if (pId && pId !== pNorm) {
    reg[pId] = targetAcc;
  }
  saveRegistry(reg);

  // Reseed records with restored student's scores
  try {
    seedRecordsFromRegistry();
  } catch {
    /* ignore */
  }

  if (isPlayFabConfigured()) {
    try {
      const ticket = (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
      if (ticket) {
        await callPlayFabClient(
          "UpdateSharedGroupData",
          {
            SharedGroupId: ROSTER_SHARED_GROUP_ID,
            Data: {
              [getStudentRosterCloudKey(pNorm)]: JSON.stringify({
                ...targetAcc.profile,
                stats: targetAcc.stats ?? [],
                updatedAt: nowIso,
              }),
            },
            Permission: "Public",
          },
          ticket,
        );
      }
    } catch {
      /* ignore cloud failure */
    }
  }

  return { success: true };
}

/**
 * Permanently deletes a student profile from the registry, records, presence, tournament and cloud immediately.
 */
export async function permanentlyDeleteStudent(
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  const reg = loadRegistry();
  const targetAcc =
    reg[playerId] ||
    Object.values(reg).find(
      (a) => a.profile.id === playerId || a.profile.nickNormalized === playerId,
    );

  if (!targetAcc) {
    return { success: false, error: "Aluno não encontrado." };
  }

  if (targetAcc.profile.isAdmin || isSpecialAdminAccount(targetAcc.profile)) {
    return { success: false, error: "Contas de administrador não podem ser excluídas." };
  }

  const pId = targetAcc.profile.id;
  const pNick = targetAcc.profile.nick;
  const pNorm = targetAcc.profile.nickNormalized;

  // 1. Marca tombstones para NUNCA mais reviver do leaderboard do PlayFab
  addTombstone(pNorm);
  if (pId) addTombstone(pId);
  if (pNick) addTombstone(pNick);

  // 2. Remove de todas as chaves do registro local
  delete reg[pNorm];
  if (pId) delete reg[pId];
  for (const [k, v] of Object.entries(reg)) {
    if (v.profile.id === pId || v.profile.nickNormalized === pNorm) {
      delete reg[k];
    }
  }
  saveRegistry(reg);

  // 3. Remove dos recordes de jogos
  try {
    removePlayerFromGameRecords(pId, pNick);
  } catch {
    /* ignore */
  }

  // 4. Remove da presença online/offline
  try {
    void removePlayerFromPresence(pId, pNick);
  } catch {
    /* ignore */
  }

  // 5. Remove dos rankings do torneio semanal
  try {
    removePlayerFromTournament(pId, pNick);
  } catch {
    /* ignore */
  }

  // 6. Se a sessão ativa deste navegador pertencer ao aluno deletado, desconecta
  const currentSession = loadStoredSession();
  if (currentSession?.playerId === pId || currentSession?.playerId === pNorm) {
    playfabSignOut();
  }

  // 7. DELETA DEFINITIVAMENTE A CHAVE DO ROSTER NA NUVEM PLAYFAB
  if (isPlayFabConfigured()) {
    try {
      const ticket = (await getAdminPlayFabTicket()) ?? currentSession?.sessionTicket;
      if (ticket) {
        const keysToRemove = [getStudentRosterCloudKey(pNorm)];
        if (pId && pId !== pNorm) keysToRemove.push(`stu_${pId}`);
        await callPlayFabClient(
          "UpdateSharedGroupData",
          {
            SharedGroupId: ROSTER_SHARED_GROUP_ID,
            KeysToRemove: keysToRemove,
          },
          ticket,
        );
      }
    } catch {
      /* ignore cloud error */
    }
  }

  return { success: true };
}

/**
 * Empties all student profiles currently in the recycle bin permanently.
 */
export async function emptyStudentTrash(): Promise<{ success: boolean; count: number }> {
  const reg = loadRegistry();
  let count = 0;
  const keysToRemoveFromCloud: string[] = [];

  for (const [k, acc] of Object.entries(reg)) {
    if (acc?.profile?.deletedAt && !acc.profile.isAdmin && !isSpecialAdminAccount(acc.profile)) {
      const pId = acc.profile.id;
      const pNick = acc.profile.nick;
      const pNorm = acc.profile.nickNormalized;

      addTombstone(pNorm);
      if (pId) addTombstone(pId);
      if (pNick) addTombstone(pNick);

      keysToRemoveFromCloud.push(getStudentRosterCloudKey(pNorm));
      if (pId && pId !== pNorm) keysToRemoveFromCloud.push(`stu_${pId}`);

      try {
        removePlayerFromGameRecords(pId, pNick);
      } catch {
        /* ignore */
      }
      try {
        void removePlayerFromPresence(pId, pNick);
      } catch {
        /* ignore */
      }
      try {
        removePlayerFromTournament(pId, pNick);
      } catch {
        /* ignore */
      }

      delete reg[k];
      count++;
    }
  }

  if (count > 0) {
    saveRegistry(reg);
  }

  if (isPlayFabConfigured() && keysToRemoveFromCloud.length > 0) {
    try {
      const ticket = (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
      if (ticket) {
        await callPlayFabClient(
          "UpdateSharedGroupData",
          {
            SharedGroupId: ROSTER_SHARED_GROUP_ID,
            KeysToRemove: Array.from(new Set(keysToRemoveFromCloud)),
          },
          ticket,
        );
      }
    } catch {
      /* ignore cloud error */
    }
  }

  return { success: true, count };
}

/**
 * Grants a Weekly Ranked Tournament medal (and optional holding bonus XP) to a player profile.
 */
export function accumulateTournamentMedal(
  existing: TournamentMedal[],
  medal: TournamentMedal,
): TournamentMedal[] {
  const copy = [...existing];
  const sameWeekIndex = copy.findIndex((m) => m.id === medal.id || m.weekKey === medal.weekKey);

  if (sameWeekIndex >= 0) {
    const cur = copy[sameWeekIndex];
    const prevWeeks = cur.historyWeeks ?? [cur.weekKey];
    copy[sameWeekIndex] = {
      ...cur,
      rank: Math.min(cur.rank, medal.rank),
      tier: medal.rank < cur.rank ? medal.tier : cur.tier,
      label: medal.rank <= cur.rank ? medal.label : cur.label,
      heldMinutes: Math.max(cur.heldMinutes, medal.heldMinutes),
      count: cur.count ?? 1,
      historyWeeks: Array.from(new Set([...prevWeeks, medal.weekKey])),
    };
    return copy;
  }

  // Acumula número no mesmo selo se o aluno já conquistou medalha dessa mesma colocação Top 5
  const sameRankIndex = copy.findIndex((m) => m.rank === medal.rank);
  if (sameRankIndex >= 0) {
    const cur = copy[sameRankIndex];
    const prevWeeks = cur.historyWeeks ?? [cur.weekKey];
    copy[sameRankIndex] = {
      ...cur,
      count: (cur.count ?? 1) + 1,
      heldMinutes: Math.max(cur.heldMinutes, medal.heldMinutes),
      earnedAt: medal.earnedAt,
      weekKey: medal.weekKey,
      historyWeeks: Array.from(new Set([...prevWeeks, medal.weekKey])),
    };
    return copy;
  }

  return [{ ...medal, count: 1, historyWeeks: [medal.weekKey] }, ...copy];
}

export async function grantPlayerTournamentMedal(
  medal: TournamentMedal,
): Promise<PlayerProfile | null> {
  const session = loadStoredSession();
  if (!session) return null;
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return null;

  acc.profile.tournamentMedals = accumulateTournamentMedal(
    acc.profile.tournamentMedals ?? [],
    medal,
  );
  if (medal.bonusXpAwarded > 0) {
    acc.profile.xp += medal.bonusXpAwarded;
    acc.profile.seasonXp = (acc.profile.seasonXp ?? 0) + medal.bonusXpAwarded;
    acc.profile.level = calculatePlayerLevel({
      xp: acc.profile.xp,
      matchesPlayed: acc.profile.matchesPlayed,
      wins: acc.profile.wins,
      distinctGames: acc.profile.distinctGamesPlayed ?? 0,
    });
  }
  acc.updatedAt = new Date().toISOString();
  reg[session.playerId] = acc;
  saveRegistry(reg);
  await pushProfileToPlayFab(acc, session.sessionTicket);
  return acc.profile;
}

/**
 * Grants a custom or base medal directly to a specific player (used by ADM for manual event awards).
 */
export async function grantPlayerMedalManually(
  targetPlayerId: string,
  medal: MedalDefinition,
): Promise<{ success: boolean; error?: string }> {
  const reg = loadRegistry();
  const acc = reg[targetPlayerId] || Object.values(reg).find((a) => a.profile.id === targetPlayerId);
  if (!acc) {
    return { success: false, error: "Aluno não encontrado no registro." };
  }

  const unlocked = [...(acc.profile.unlockedMedals ?? [])];
  const existingIdx = unlocked.findIndex((m) => m.medalId === medal.id);
  const nowIso = new Date().toISOString();

  if (existingIdx >= 0) {
    if (!medal.isStackable) {
      return { success: true }; // already unlocked and not stackable
    }
    const currentCount = unlocked[existingIdx].count ?? 1;
    unlocked[existingIdx] = {
      ...unlocked[existingIdx],
      count: currentCount + 1,
      lastUnlockedAt: nowIso,
    };
  } else {
    unlocked.push({
      medalId: medal.id,
      unlockedAt: nowIso,
      count: 1,
      lastUnlockedAt: nowIso,
    });
  }

  acc.profile.unlockedMedals = unlocked;
  acc.updatedAt = nowIso;

  invalidatePioneersCache();

  const cfg = loadAdminConfig();
  if (
    medal.rarity === "ouro" ||
    medal.rarity === "platina" ||
    medal.rarity === "diamante" ||
    medal.rarity === "heroi" ||
    medal.rarity === "secreta"
  ) {
    const notifs = cfg.adminMedalNotifications ?? [];
    const notifItem: AdminMedalNotification = {
      id: `adm_notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      studentId: acc.profile.id,
      studentNick: acc.profile.nick,
      studentFullName: acc.profile.full_name,
      studentSchool: acc.profile.school,
      medalId: medal.id,
      medalTitle: medal.title,
      medalRarity: medal.rarity,
      medalIcon: medal.iconName,
      unlockedAt: nowIso,
      read: true,
    };
    notifs.unshift(notifItem);
    cfg.adminMedalNotifications = notifs.slice(0, 200);
    saveAdminConfig(cfg);
    void pushAdminMedalNotificationToPlayFab(notifItem);
  }

  reg[acc.profile.nickNormalized] = acc;
  if (acc.profile.id) reg[acc.profile.id] = acc;
  saveRegistry(reg);

  const session = loadStoredSession();
  if (
    session?.sessionTicket &&
    isPlayFabConfigured() &&
    (acc.profile.id === session.playerId ||
      acc.profile.nickNormalized === session.playerId ||
      (session.playfabId && acc.profile.playfabId === session.playfabId))
  ) {
    await pushProfileToPlayFab(acc, session.sessionTicket);
  }

  return { success: true };
}

/**
 * Concede medalha de robô especial (Ametista ou Carmesim) ao jogador ativo da sessão.
 */
export async function grantSpecialRobotMedal(
  medalId: "m_rpg_ametista" | "m_rpg_carmesim",
): Promise<{ success: boolean; medal?: MedalDefinition; profile?: PlayerProfile }> {
  const session = loadStoredSession();
  if (!session) return { success: false };
  const cfg = loadAdminConfig();
  const allMedals = getAllAvailableMedals(cfg.customMedals);
  const def = allMedals.find((m) => m.id === medalId);
  if (!def) return { success: false };
  const res = await grantPlayerMedalManually(session.playerId, def);
  const active = getActiveAccount();
  return { success: res.success, medal: def, profile: active?.profile };
}

export type SpaceQuestMedalId =
  | "sq_safira"
  | "sq_ametista"
  | "sq_rubi"
  | "sq_ambar"
  | "sq_hourglass_3x"
  | "sq_shield_2x"
  | "sq_divine_luck"
  | "sq_purist_pilot";

/**
 * Concede medalha especial de conquista ou aura no Space Quest.
 */
export async function grantSpaceQuestAuraMedal(
  medalId: SpaceQuestMedalId,
): Promise<{ success: boolean; medal?: MedalDefinition; profile?: PlayerProfile }> {
  const session = loadStoredSession();
  if (!session) return { success: false };
  const cfg = loadAdminConfig();
  const allMedals = getAllAvailableMedals(cfg.customMedals);
  const def = allMedals.find((m) => m.id === medalId);
  if (!def) return { success: false };
  const res = await grantPlayerMedalManually(session.playerId, def);
  const active = getActiveAccount();
  return { success: res.success, medal: def, profile: active?.profile };
}

/**
 * Deduz a taxa fixa de 5 pontos ranqueados para compra de entrada extra (após esgotar as 10 grátis).
 */
export async function deductPaidTournamentPoints(
  playerId: string,
  points = 5,
): Promise<{ success: boolean; newPoints: number; error?: string }> {
  const reg = loadRegistry();
  const acc = reg[playerId] || Object.values(reg).find((a) => a.profile.id === playerId);
  if (!acc) return { success: false, newPoints: 0, error: "Jogador não encontrado." };

  const currentPoints = acc.profile.tournamentPoints ?? 0;
  if (currentPoints < points) {
    return {
      success: false,
      newPoints: currentPoints,
      error: `Pontos insuficientes (possui ${currentPoints}, necessários ${points}).`,
    };
  }

  const newPoints = currentPoints - points;
  acc.profile.tournamentPoints = newPoints;
  acc.profile.dailyTournamentEntries = (acc.profile.dailyTournamentEntries ?? 0) + 1;
  acc.updatedAt = new Date().toISOString();
  saveRegistry(reg);

  const session = loadStoredSession();
  if (session?.sessionTicket && isPlayFabConfigured() && acc.profile.id === session.playerId) {
    await pushProfileToPlayFab(acc, session.sessionTicket);
  }

  return { success: true, newPoints };
}

/**
 * Sets player's class letter (Turma A-F) initially if not chosen during sign up.
 */
export async function playfabSetInitialTurma(turma: TurmaCode): Promise<PlayerProfile | null> {
  const session = loadStoredSession();
  if (!session) return null;
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return null;

  // Regular players can only set their turma if it wasn't already set
  if (acc.profile.turma && !acc.profile.isAdmin) {
    return acc.profile;
  }

  acc.profile.turma = turma;
  acc.updatedAt = new Date().toISOString();
  reg[session.playerId] = acc;
  saveRegistry(reg);
  syncLocalBrowserFromAccount(acc);
  await pushProfileToPlayFab(acc, session.sessionTicket);
  return acc.profile;
}

/**
 * Allows a regular player to set their School, Grade (Série) and Turma ONE TIME if they left them
 * unset ("Nenhuma" or null) when creating their profile. Once selected, these fields become fixed
 * and can only be modified by the Administrator (ADM).
 */
export async function playfabCompleteInitialSchoolSetup(args: {
  school?: string;
  grade?: string | null;
  turma?: TurmaCode | null;
}): Promise<{ profile: PlayerProfile | null; error: string | null }> {
  const session = loadStoredSession();
  if (!session) {
    return { profile: null, error: "Você precisa estar logado para atualizar seu perfil." };
  }
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) {
    return { profile: null, error: "Perfil não encontrado." };
  }

  const p = acc.profile;
  const currentAge = ageFrom(p.birthdate);
  const isOver15 = isEtapa3OrOlder(p.birthdate);
  const isOver11 = currentAge > 11;

  if (isOver15) {
    return {
      profile: p,
      error: "Para participantes da 3ª Etapa (Comunidade), não há vínculo com escolas ou séries do ensino fundamental.",
    };
  }

  const schoolAlreadyLocked = Boolean(p.school && p.school !== "Nenhuma");
  const gradeAlreadyLocked = Boolean(p.grade);
  const turmaAlreadyLocked = Boolean(p.turma);

  // 1. School (only if not yet selected)
  if (!schoolAlreadyLocked && args.school && args.school !== "Nenhuma") {
    if (isOver11 && is5thGradeSchool(args.school)) {
      return {
        profile: p,
        error: "Alunos acima de 11 anos não podem selecionar escolas de 5º ano.",
      };
    }
    p.school = args.school;
  }

  // 2. Grade / Série (only if not yet selected)
  if (!gradeAlreadyLocked) {
    if (is5thGradeSchool(p.school)) {
      p.grade = "5º ano";
    } else if (schoolNeedsGrade(p.school)) {
      if (args.grade) {
        p.grade = args.grade;
      }
    }
  }

  // 3. Turma (only if not yet selected and school is an official SEMED school)
  if (!turmaAlreadyLocked && args.turma && isOfficialSemedSchool(p.school)) {
    p.turma = args.turma;
  }

  acc.updatedAt = new Date().toISOString();
  reg[session.playerId] = acc;
  saveRegistry(reg);
  syncLocalBrowserFromAccount(acc);
  await pushProfileToPlayFab(acc, session.sessionTicket);

  return { profile: acc.profile, error: null };
}

/**
 * Submits a request to the ADM to change the student's class (Turma A-F).
 */
export async function playfabRequestTurmaChange(
  requestedTurma: TurmaCode,
): Promise<PlayerProfile | null> {
  const session = loadStoredSession();
  if (!session) return null;
  const reg = loadRegistry();
  const acc = reg[session.playerId];
  if (!acc) return null;

  acc.profile.pendingTurmaRequest = requestedTurma;
  acc.updatedAt = new Date().toISOString();
  reg[session.playerId] = acc;
  saveRegistry(reg);
  syncLocalBrowserFromAccount(acc);

  createTurmaChangeRequest({
    playerId: acc.profile.id,
    playerNick: acc.profile.nick,
    playerFullName: acc.profile.full_name,
    school: acc.profile.school,
    grade: acc.profile.grade,
    currentTurma: acc.profile.turma ?? null,
    requestedTurma,
  });

  return acc.profile;
}

/**
 * Approves a student's class change request in the ADM panel.
 */
export async function playfabApproveTurmaRequest(requestId: string): Promise<boolean> {
  const resolved = resolveTurmaChangeRequest(requestId, "aprovada");
  if (!resolved) return false;

  const reg = loadRegistry();
  for (const key of Object.keys(reg)) {
    const acc = reg[key];
    if (acc.profile.id === resolved.playerId || acc.profile.nick === resolved.playerNick) {
      acc.profile.turma = resolved.requestedTurma;
      acc.profile.pendingTurmaRequest = null;
      acc.updatedAt = new Date().toISOString();
      reg[key] = acc;
      saveRegistry(reg);
      break;
    }
  }
  return true;
}

/**
 * Rejects a student's class change request in the ADM panel.
 */
export async function playfabRejectTurmaRequest(requestId: string): Promise<boolean> {
  const resolved = resolveTurmaChangeRequest(requestId, "recusada");
  if (!resolved) return false;

  const reg = loadRegistry();
  for (const key of Object.keys(reg)) {
    const acc = reg[key];
    if (acc.profile.id === resolved.playerId || acc.profile.nick === resolved.playerNick) {
      acc.profile.pendingTurmaRequest = null;
      acc.updatedAt = new Date().toISOString();
      reg[key] = acc;
      saveRegistry(reg);
      break;
    }
  }
  return true;
}

/**
 * Finds a player's public profile by ID or Nick for inspect modal
 */
export function getPlayerPublicProfile(identifier: string): PlayerProfile | null {
  const cfg = checkAndApplyScheduledReset();
  const reg = loadRegistry();
  const clean = identifier.trim().toLowerCase();
  const cleanStripped = clean.replace(/^stu_/, "");
  for (const acc of Object.values(reg)) {
    const p = acc.profile;
    const pId = p.id.toLowerCase();
    const pPfId = (p.playfabId || "").toLowerCase();
    const pNorm = (p.nickNormalized || "").toLowerCase();
    const pNick = p.nick.toLowerCase();
    if (
      pId === clean ||
      pId === cleanStripped ||
      (pPfId && (pPfId === clean || pPfId === cleanStripped)) ||
      pNorm === clean ||
      pNorm === cleanStripped ||
      pNick === clean ||
      pNick === cleanStripped ||
      pNick.replace(/[^a-z0-9_]/g, "") === cleanStripped
    ) {
      const aligned = ensurePlayerSeasonAligned(acc, cfg);
      saveRegistry(reg);
      return aligned.profile;
    }
  }
  return null;
}

export interface MedalsAuditResult {
  auditedStudentsCount: number;
  updatedStudentsCount: number;
  medalsAwardedCount: number;
  details: Array<{
    studentId: string;
    nick: string;
    fullName: string;
    school: string;
    medalsAwarded: Array<{ id: string; title: string; rarity: string }>;
  }>;
}

/**
 * Realiza uma varredura completa no banco de dados local e na nuvem PlayFab,
 * reavaliando todos os critérios de medalhas (partidas concluídas por jogo, modo ranqueado,
 * exploração, níveis e eventos) e retroatribuindo com integridade quaisquer medalhas pendentes
 * acompanhadas de seus respectivos Pontos de Carreira e XP.
 */
export async function runRetroactiveMedalsAudit(
  optionsOrProgress?:
    | ((info: { current: number; total: number; message: string }) => void)
    | {
        skipCloudSync?: boolean;
        onProgress?: (info: { current: number; total: number; message: string }) => void;
      },
): Promise<MedalsAuditResult> {
  const onProgress =
    typeof optionsOrProgress === "function"
      ? optionsOrProgress
      : optionsOrProgress?.onProgress;
  const skipCloudSync =
    typeof optionsOrProgress === "object" ? Boolean(optionsOrProgress?.skipCloudSync) : false;

  // 0. Captura o estado inicial de medalhas de cada aluno antes de qualquer alinhamento ou sincronização
  const initialUnlockedByPlayer = new Map<string, Set<string>>();
  for (const [k, acc] of Object.entries(loadRegistry())) {
    if (acc?.profile) {
      const pKey = (acc.profile.nickNormalized || acc.profile.id || k).toLowerCase().trim();
      initialUnlockedByPlayer.set(
        pKey,
        new Set(
          (acc.profile.unlockedMedals ?? [])
            .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
            .filter(Boolean),
        ),
      );
    }
  }

  // 1. Sincroniza o elenco escolar com o PlayFab para obter o banco de dados mais atualizado
  if (!skipCloudSync && isPlayFabConfigured()) {
    try {
      onProgress?.({ current: 0, total: 1, message: "Sincronizando elenco escolar com a nuvem PlayFab..." });
      await syncStudentRosterFromPlayFab();
    } catch (err) {
      console.warn("[MedalsAudit] Falha na pré-sincronização do roster:", err);
    }
  }

  const cfg = checkAndApplyScheduledReset();
  const allMedals = getAllAvailableMedals(cfg.customMedals);
  const reg = loadRegistry();
  const keys = Object.keys(reg);
  const total = keys.length;

  let updatedStudentsCount = 0;
  let medalsAwardedCount = 0;
  const details: MedalsAuditResult["details"] = [];
  const cloudRosterUpdates: Record<string, string> = {};

  for (let i = 0; i < total; i++) {
    const key = keys[i];
    const acc = reg[key];
    if (!acc || !acc.profile) continue;

    onProgress?.({
      current: i + 1,
      total,
      message: `Auditando ${acc.profile.nick || acc.profile.full_name} (${i + 1}/${total})...`,
    });

    const pKey = (acc.profile.nickNormalized || acc.profile.id || key).toLowerCase().trim();
    const initialUnlockedSet =
      initialUnlockedByPlayer.get(pKey) ??
      new Set(
        (acc.profile.unlockedMedals ?? [])
          .map((m: any) => (typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "")))
          .filter(Boolean),
      );

    const aligned = ensurePlayerSeasonAligned(acc, cfg);
    const isAdminAcc = aligned.profile.isAdmin || isSpecialAdminAccount(aligned.profile);
    if (isAdminAcc) {
      reg[key] = aligned;
      continue;
    }

    const earned = evaluatePlayerMedals(
      {
        profile: aligned.profile,
        stats: aligned.stats,
        todayXpEarned: aligned.profile.dailyXp,
        streakDays: aligned.profile.streakDays,
        weeklyX1Wins: aligned.profile.weeklyX1Wins,
        enabledGames: cfg.enabledGames,
      },
      allMedals,
    );

    const unlocked = aligned.profile.unlockedMedals ?? [];
    const missingMedals = earned.filter((m) => !unlocked.some((u) => u.medalId === m.id));

    if (missingMedals.length > 0) {
      const nowIso = new Date().toISOString();
      let bonusXp = 0;
      for (const m of missingMedals) {
        unlocked.push({ medalId: m.id, unlockedAt: nowIso });
        const extraXp = MEDAL_XP_REWARDS[m.rarity] ?? 10;
        bonusXp += extraXp;
        const ptsReward = MEDAL_POINTS_REWARDS[m.rarity] ?? 20;
        awardCareerPoints(aligned.profile, ptsReward, `Medalha Retroativa: ${m.title}`);
      }

      aligned.profile.unlockedMedals = unlocked;
      if (bonusXp > 0) {
        aligned.profile.xp += bonusXp;
        aligned.profile.seasonXp = (aligned.profile.seasonXp ?? 0) + bonusXp;
      }
    }

    // Identifica todas as medalhas que foram concedidas retroativamente nesta execução
    const currentUnlocked = aligned.profile.unlockedMedals ?? [];
    const freshlyGrantedMedals = currentUnlocked.filter((m: any) => {
      const mId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
      return Boolean(mId && !initialUnlockedSet.has(mId));
    });

    if (freshlyGrantedMedals.length > 0) {
      const nowIso = new Date().toISOString();
      const awardedForStudent: Array<{ id: string; title: string; rarity: string }> = [];

      for (const m of freshlyGrantedMedals) {
        const mId = typeof m === "string" ? m : (m?.medalId ?? m?.id ?? "");
        const def = allMedals.find((d) => d.id === mId);
        awardedForStudent.push({
          id: mId,
          title: def?.title ?? mId,
          rarity: def?.rarity ?? "bronze",
        });
      }

      const syncedProg = syncLevelStageProgress({
        xp: aligned.profile.xp,
        lifetimeMatches: aligned.profile.matchesPlayed,
        lifetimeWins: aligned.profile.wins,
        lifetimeDistinctGames: aligned.profile.distinctGamesPlayed ?? 1,
        currentLevel: aligned.profile.level,
        existingStage: aligned.profile.levelStageProgress,
        maxAvailableGames: ALL_GAME_IDS.length,
      });
      aligned.profile.level = syncedProg.level;
      aligned.profile.levelStageProgress = syncedProg.stageProgress;
      aligned.updatedAt = nowIso;

      reg[key] = aligned;
      updatedStudentsCount++;
      medalsAwardedCount += freshlyGrantedMedals.length;
      details.push({
        studentId: aligned.profile.id,
        nick: aligned.profile.nick,
        fullName: aligned.profile.full_name || aligned.profile.nick,
        school: aligned.profile.school,
        medalsAwarded: awardedForStudent,
      });

      cloudRosterUpdates[getStudentRosterCloudKey(aligned.profile)] = JSON.stringify({
        ...aligned.profile,
        stats: aligned.stats ?? [],
        updatedAt: nowIso,
      });

      if (!skipCloudSync) {
        try {
          await pushProfileToPlayFab(aligned);
        } catch (err) {
          console.warn(`[MedalsAudit] Erro ao sincronizar ${aligned.profile.nick}:`, err);
        }
      }
    } else {
      reg[key] = aligned;
    }
  }

  saveRegistry(reg);

  // Envia as atualizações em massa para a nuvem PlayFab se houver alterações
  if (!skipCloudSync && isPlayFabConfigured() && Object.keys(cloudRosterUpdates).length > 0) {
    try {
      const ticket = (await getAdminPlayFabTicket()) ?? loadStoredSession()?.sessionTicket;
      if (ticket) {
        const entries = Object.entries(cloudRosterUpdates);
        for (let i = 0; i < entries.length; i += 10) {
          const chunk = Object.fromEntries(entries.slice(i, i + 10));
          await callPlayFabClient(
            "UpdateSharedGroupData",
            {
              SharedGroupId: ROSTER_SHARED_GROUP_ID,
              Data: chunk,
              Permission: "Public",
            },
            ticket,
          );
        }
      }
    } catch (err) {
      console.warn("[MedalsAudit] Falha ao enviar atualizações em lote para o SharedGroup:", err);
    }
  }

  return {
    auditedStudentsCount: total,
    updatedStudentsCount,
    medalsAwardedCount,
    details,
  };
}

export { ALL_GAME_IDS };
