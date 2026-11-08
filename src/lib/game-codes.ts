// Access-code and platform game configuration system
// Supports dynamic configuration by the Administrator (ADM) synced with PlayFab TitleData.
import { ALL_GAME_IDS, type GameId } from "./game-storage.ts";
import type { MedalDefinition, AdminMedalNotification } from "./medals-catalog.ts";
import {
  type SpecialEvent,
  type RecurringEvent,
  loadSpecialEvents,
  loadRecurringEvents,
  saveSpecialEvents,
  saveRecurringEvents,
} from "./custom-events.ts";
import {
  type ScheduledInboxRule,
  loadScheduledInboxRules,
  saveScheduledInboxRules,
} from "./scheduled-inbox.ts";

const UNLOCK_KEY = "desafios-logica-unlocked-v1";
const ADMIN_CONFIG_KEY = "desafios-logica-admin-config-v1";
const INITIAL_UNLOCKED_MIGRATION_KEY = "desafios-initial-unlocked-v2";

const STATIC_PRESETS: Record<string, string> = {
  logica: "L1MT26",
  cartesiano: "C2PL26",
  formas: "F3FC26",
  memoria: "M4CR26",
  variaveis: "V5CV26",
  robogrid: "R6RG26",
  minado: "N7CM26",
  porcentagem: "Q9PC26",
  completar: "K0CL26",
  rpg: "P8RP26",
  spacequest: "S4SQ26",
};

/** Default codes for all games on the platform (dynamically populated). */
export const DEFAULT_GAME_CODES: Record<GameId, string> = ALL_GAME_IDS.reduce(
  (acc, id) => {
    acc[id] = STATIC_PRESETS[id] || `${id.slice(0, 2).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
    return acc;
  },
  {} as Record<GameId, string>,
);

/** Default enabled status per game (dynamically populated). */
export const DEFAULT_ENABLED_GAMES: Record<GameId, boolean> = ALL_GAME_IDS.reduce(
  (acc, id) => {
    acc[id] = true;
    return acc;
  },
  {} as Record<GameId, boolean>,
);

/** Default minimum level required for each game (Level 1 = free for everyone). */
export const DEFAULT_GAME_LEVEL_REQUIREMENTS: Record<GameId, number> = ALL_GAME_IDS.reduce(
  (acc, id) => {
    acc[id] = 1;
    return acc;
  },
  {} as Record<GameId, number>,
);

/** Default admin-only (preview/testing mode) games. Initially Space Quest is ADM-only. */
export const DEFAULT_ADMIN_ONLY_GAMES: Partial<Record<GameId, boolean>> = {
  spacequest: true,
};

/** Default Master code (unlocks all enabled games for teachers). */
export const DEFAULT_MASTER_CODE = "SEMED26";

/** Backwards-compatible exports */
export const GAME_CODES = DEFAULT_GAME_CODES;
export const MASTER_CODE = DEFAULT_MASTER_CODE;

/** Reserved codes for games still in production (accepted, nothing to play yet). */
const RESERVED_CODES = [
  "X1AB26", "X2CD26", "X3EF26", "X4GH26", "X5IJ26",
  "X6KL26", "X7MN26", "X8OP26", "X9QR26", "Y1ST26",
];

export interface ResetHistoryEntry {
  id: string;
  seasonId: number;
  seasonName: string;
  executedAt: string;
  resetXp: boolean;
  reason?: string;
}

export interface PlatformNoticeSlide {
  id: string;
  title: string;
  message: string;
  badgeLabel?: string;
  type: "announcement" | "game_highlight" | "event_challenge";
  featuredGameId?: GameId | null;
  linkedEventId?: string | null;
  linkedMedalId?: string | null;
  /** Duração em segundos que o slide fica visível antes de passar para o próximo (padrão: 7s) */
  durationSeconds?: number;
  active: boolean;
  createdAt: string;
}

export interface PlatformAdminConfig {
  enabledGames: Record<GameId, boolean>;
  gameCodes: Record<GameId, string>;
  masterCode: string;
  /** When false, all enabled games appear unlocked in the menu without requiring a code. */
  requireCodeGate: boolean;
  /** Exibir ou ocultar o card 'Inserir Código' na grade de jogos da tela inicial (padrão: false). */
  showCodeGateCardOnHome?: boolean;
  /** Current ranking season number (incremented on each reset). */
  seasonId: number;
  /** Human-readable name for the active ranking cycle/season. */
  seasonName: string;
  /** ISO timestamp de início da temporada vigente. */
  seasonStartAt?: string;
  /** ISO timestamp de encerramento da temporada vigente (alinha e retrocompatível com scheduledResetAt). */
  seasonEndAt?: string | null;
  /** Duração em dias configurada para a temporada (padrão: 14 dias; opções: 7, 14, 30 ou número customizado). */
  seasonDurationDays?: number;
  /** Se ativado (padrão: true), encerra a temporada no término e cria automaticamente a Temporada N+1. */
  autoRenewSeason?: boolean;
  /** ISO timestamp of the last ranking reset. */
  lastResetAt: string;
  /** Optional ISO timestamp scheduled by the ADM for the next automatic reset. */
  scheduledResetAt: string | null;
  /** Whether the scheduled reset should also reset player XP/Level (true) or only Season/Game Rankings (false). */
  scheduledResetClearXp: boolean;
  /** History of executed ranking resets. */
  resetHistory: ResetHistoryEntry[];

  /** --- GESTÃO SEPARADA: TEMPORADA DE ATIVIDADES (GERAL & BETA) --- */
  activitySeasonId?: number;
  activitySeasonName?: string;
  activitySeasonStartAt?: string;
  activitySeasonEndAt?: string | null;
  activitySeasonDurationDays?: number; // Padrão pós-beta: 60 dias (2 meses)
  isBetaActive?: boolean; // Padrão atual: true (finaliza em 15/11/2026 às 23:59:59)

  /** --- GESTÃO SEPARADA: TEMPORADA DE RANQUEADA (TORNEIO COMPETITIVO) --- */
  rankedSeasonId?: number;
  rankedSeasonName?: string;
  rankedSeasonStartAt?: string;
  rankedSeasonEndAt?: string | null;
  rankedSeasonDurationDays?: number; // Padrão: 14 dias (2 semanas)
  rankedOpenHour?: number;
  rankedCloseHour?: number;
  rankedForceOpen?: boolean;

  /** --- SISTEMA INTERNO DE CONVERSÃO DE PONTOS EM MOEDAS --- */
  pointsToCoinsRate?: number; // Padrão: 1 (1 ponto = 1 moeda)
  coinsConversionEnabled?: boolean; // Padrão: true
  /** Whether the Arena X1 Online (1v1 Versus mode) is enabled for students (Level 5+). */
  x1Enabled: boolean;
  /** Definido pelo ADM para forçar o fechamento total da Arena X1 com faixa visual explicativa. */
  x1ArenaClosed?: boolean;
  /** Opening hour for Arena X1 (0..23, default 7 = 07:00). */
  x1OpenHour: number;
  /** Closing hour for Arena X1 (0..23, default 19 = 19:00). */
  x1CloseHour: number;
  /** When true, ADM forces Arena X1 open regardless of the clock hour. */
  x1ForceOpen: boolean;
  /** 1 to 3 games available for X1 Arena battles (default: 3 games with rotation). */
  x1AvailableGames?: GameId[];
  /** Rotation interval in minutes for X1 Arena games (default: 10). */
  x1RotationMinutes?: number;
  /** Whether the Weekly Ranked Tournament is enabled (Level 3+). */
  tournamentEnabled: boolean;
  /** Optional ADM override for the Weekly Tournament game (`null` = automatic weekly rotation). */
  tournamentGameOverride: GameId | null;
  /** Daily XP limit per student (default: 1000 XP/day). Configurable by ADM. */
  dailyXpCap: number;
  /** Nível mínimo (1 a 10) exigido para alunos logados acessarem cada jogo (padrão: 1 para todos). */
  gameLevelRequirements?: Record<GameId, number>;
  /** Jogos com acesso liberado exclusivamente para o Administrador em modo de teste preliminar. */
  adminOnlyGames?: Partial<Record<GameId, boolean>>;
  /** Custom medals created or edited by the administrator */
  customMedals?: MedalDefinition[];
  /** In-game "mailbox" notifications of students who earned medals */
  adminMedalNotifications?: AdminMedalNotification[];
  /** Special one-off events created by ADM synced with database */
  specialEvents?: SpecialEvent[];
  /** Recurring automated events (weekdays/dates) synced with database */
  recurringEvents?: RecurringEvent[];
  /** Slides/notices managed by the ADM for the prominent Notice Board */
  noticeSlides?: PlatformNoticeSlide[];
  /** Controle individual de exibição dos avisos padrão do sistema (marcado/desmarcado) */
  enabledDefaultNotices?: Record<string, boolean>;
  /** Ocultar/pausar todos os avisos padrão de uma só vez */
  hideAllDefaultNotices?: boolean;
  /** Pausar a rotação automática do slide do quadro de avisos */
  pauseNoticeBoard?: boolean;
  /** Mensagens transmitidas do Correio / Caixa de Entrada */
  inboxMessages?: any[];
  /** Regras de mensagens programadas e recorrentes */
  scheduledInboxRules?: ScheduledInboxRule[];
  /** Optional PlayFab Title ID configured via Admin UI. */
  playfabTitleId?: string;
  updatedAt: string;
}

export const DEFAULT_ENABLED_DEFAULT_NOTICES: Record<string, boolean> = {
  default_weekly_tournament: true,
  default_x1_arena: true,
  default_new_games: true,
};

export interface DefaultNoticeDescriptor {
  id: "default_weekly_tournament" | "default_x1_arena" | "default_new_games";
  title: string;
  badgeLabel: string;
  description: string;
}

export const SYSTEM_DEFAULT_NOTICES: DefaultNoticeDescriptor[] = [
  {
    id: "default_weekly_tournament",
    badgeLabel: "TORNEIO RANQUEADO",
    title: "Torneio Semanal Ranqueado (Desafio da Semana)",
    description: "Incentiva a disputa diária de 10 partidas ranqueadas para subir da Liga Bronze até o Mestre (+100 XP extras).",
  },
  {
    id: "default_x1_arena",
    badgeLabel: "BATALHA AO VIVO",
    title: "Arena X1 Online (Duelo 1 vs 1 ao Vivo)",
    description: "Informa sobre os confrontos diretos em tempo real das 07:00 às 19:00 com rotação de jogos (+100 XP extras).",
  },
  {
    id: "default_new_games",
    badgeLabel: "NOVIDADE & DESTAQUE",
    title: "Explore Todos os Desafios de Lógica",
    description: "Divulga jogos de raciocínio, geometria e porcentagem para avançar rumo ao Nível Máximo 10.",
  },
];

export const DEFAULT_ADMIN_CONFIG: PlatformAdminConfig = {
  enabledGames: { ...DEFAULT_ENABLED_GAMES },
  gameCodes: { ...DEFAULT_GAME_CODES },
  masterCode: DEFAULT_MASTER_CODE,
  requireCodeGate: false,
  showCodeGateCardOnHome: false,
  seasonId: 1,
  seasonName: "Temporada 1 • SEMED Coari",
  seasonStartAt: "2026-01-01T00:00:00.000Z",
  seasonEndAt: null,
  seasonDurationDays: 14,
  autoRenewSeason: true,
  lastResetAt: "2026-01-01T00:00:00.000Z",
  scheduledResetAt: null,
  scheduledResetClearXp: false,
  resetHistory: [],
  activitySeasonId: 1,
  activitySeasonName: "Temporada 1 Beta • SEMED Coari",
  activitySeasonStartAt: "2026-11-01T00:00:00.000Z",
  activitySeasonEndAt: "2026-11-15T23:59:59.999Z",
  activitySeasonDurationDays: 60,
  isBetaActive: true,
  rankedSeasonId: 1,
  rankedSeasonName: "Temporada 1 Ranqueada • SEMED Coari",
  rankedSeasonStartAt: "2026-11-01T00:00:00.000Z",
  rankedSeasonEndAt: "2026-11-15T23:59:59.999Z",
  rankedSeasonDurationDays: 14,
  rankedOpenHour: 7,
  rankedCloseHour: 22,
  rankedForceOpen: true,
  pointsToCoinsRate: 1,
  coinsConversionEnabled: true,
  x1Enabled: true,
  x1ArenaClosed: false,
  x1OpenHour: 7,
  x1CloseHour: 19,
  x1ForceOpen: false,
  x1AvailableGames: ["rpg", "logica", "porcentagem", "minado"],
  x1RotationMinutes: 10,
  tournamentEnabled: true,
  tournamentGameOverride: null,
  dailyXpCap: 1000,
  gameLevelRequirements: { ...DEFAULT_GAME_LEVEL_REQUIREMENTS },
  adminOnlyGames: { ...DEFAULT_ADMIN_ONLY_GAMES },
  customMedals: [],
  adminMedalNotifications: [],
  specialEvents: [],
  recurringEvents: [],
  noticeSlides: [],
  enabledDefaultNotices: { ...DEFAULT_ENABLED_DEFAULT_NOTICES },
  hideAllDefaultNotices: false,
  pauseNoticeBoard: false,
  inboxMessages: [],
  playfabTitleId: "186F63",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function loadAdminConfig(): PlatformAdminConfig {
  if (typeof window === "undefined") return { ...DEFAULT_ADMIN_CONFIG };
  try {
    let raw = window.localStorage.getItem(ADMIN_CONFIG_KEY);
    // Migration: ensure default is unlocked initially for all devices
    const hasMigrated = window.localStorage.getItem(INITIAL_UNLOCKED_MIGRATION_KEY);
    if (!hasMigrated) {
      window.localStorage.setItem(INITIAL_UNLOCKED_MIGRATION_KEY, "1");
      if (raw) {
        try {
          const p = JSON.parse(raw);
          p.requireCodeGate = false;
          raw = JSON.stringify(p);
          window.localStorage.setItem(ADMIN_CONFIG_KEY, raw);
        } catch {
          // ignore
        }
      }
    }

    if (!raw) return { ...DEFAULT_ADMIN_CONFIG };
    const parsed = JSON.parse(raw) as Partial<PlatformAdminConfig>;
    return {
      ...DEFAULT_ADMIN_CONFIG,
      ...parsed,
      requireCodeGate: typeof parsed.requireCodeGate === "boolean" ? parsed.requireCodeGate : false,
      enabledGames: { ...DEFAULT_ENABLED_GAMES, ...(parsed.enabledGames ?? {}) },
      gameLevelRequirements: {
        ...DEFAULT_GAME_LEVEL_REQUIREMENTS,
        ...(parsed.gameLevelRequirements ?? {}),
      },
      adminOnlyGames: {
        ...DEFAULT_ADMIN_ONLY_GAMES,
        ...(parsed.adminOnlyGames ?? {}),
      },
      gameCodes: { ...DEFAULT_GAME_CODES, ...(parsed.gameCodes ?? {}) },
      masterCode: normalizeCode(parsed.masterCode || DEFAULT_MASTER_CODE) || DEFAULT_MASTER_CODE,
      resetHistory: Array.isArray(parsed.resetHistory) ? parsed.resetHistory : [],
      x1Enabled: typeof parsed.x1Enabled === "boolean" ? parsed.x1Enabled : true,
      x1OpenHour: typeof parsed.x1OpenHour === "number" ? parsed.x1OpenHour : 7,
      x1CloseHour: typeof parsed.x1CloseHour === "number" ? parsed.x1CloseHour : 19,
      x1ForceOpen: typeof parsed.x1ForceOpen === "boolean" ? parsed.x1ForceOpen : false,
      tournamentEnabled:
        typeof parsed.tournamentEnabled === "boolean" ? parsed.tournamentEnabled : true,
      tournamentGameOverride: parsed.tournamentGameOverride ?? null,
      customMedals: Array.isArray(parsed.customMedals) ? parsed.customMedals : [],
      adminMedalNotifications: Array.isArray(parsed.adminMedalNotifications)
        ? parsed.adminMedalNotifications
        : [],
      specialEvents: Array.isArray(parsed.specialEvents) ? parsed.specialEvents : loadSpecialEvents(),
      recurringEvents: Array.isArray(parsed.recurringEvents) ? parsed.recurringEvents : loadRecurringEvents(),
      noticeSlides: Array.isArray(parsed.noticeSlides) ? parsed.noticeSlides : [],
      enabledDefaultNotices:
        parsed.enabledDefaultNotices && typeof parsed.enabledDefaultNotices === "object"
          ? { ...DEFAULT_ENABLED_DEFAULT_NOTICES, ...parsed.enabledDefaultNotices }
          : { ...DEFAULT_ENABLED_DEFAULT_NOTICES },
      hideAllDefaultNotices:
        typeof parsed.hideAllDefaultNotices === "boolean" ? parsed.hideAllDefaultNotices : false,
      pauseNoticeBoard:
        typeof parsed.pauseNoticeBoard === "boolean" ? parsed.pauseNoticeBoard : false,
      inboxMessages: Array.isArray(parsed.inboxMessages) ? parsed.inboxMessages : [],
      scheduledInboxRules: Array.isArray(parsed.scheduledInboxRules)
        ? parsed.scheduledInboxRules
        : loadScheduledInboxRules(),
      dailyXpCap:
        typeof parsed.dailyXpCap === "number" && parsed.dailyXpCap >= 100
          ? Math.floor(parsed.dailyXpCap)
          : 1000,
    };
  } catch {
    return { ...DEFAULT_ADMIN_CONFIG };
  }
}

export function saveAdminConfig(config: PlatformAdminConfig): PlatformAdminConfig {
  const normalized: PlatformAdminConfig = {
    ...config,
    masterCode: normalizeCode(config.masterCode) || DEFAULT_MASTER_CODE,
    gameCodes: Object.fromEntries(
      (Object.keys(DEFAULT_GAME_CODES) as GameId[]).map((id) => [
        id,
        normalizeCode(config.gameCodes[id] || DEFAULT_GAME_CODES[id]) || DEFAULT_GAME_CODES[id],
      ]),
    ) as Record<GameId, string>,
    specialEvents: Array.isArray(config.specialEvents) ? config.specialEvents : loadSpecialEvents(),
    recurringEvents: Array.isArray(config.recurringEvents) ? config.recurringEvents : loadRecurringEvents(),
    noticeSlides: Array.isArray(config.noticeSlides) ? config.noticeSlides : [],
    enabledDefaultNotices:
      config.enabledDefaultNotices && typeof config.enabledDefaultNotices === "object"
        ? { ...DEFAULT_ENABLED_DEFAULT_NOTICES, ...config.enabledDefaultNotices }
        : { ...DEFAULT_ENABLED_DEFAULT_NOTICES },
    hideAllDefaultNotices:
      typeof config.hideAllDefaultNotices === "boolean" ? config.hideAllDefaultNotices : false,
    pauseNoticeBoard:
      typeof config.pauseNoticeBoard === "boolean" ? config.pauseNoticeBoard : false,
    inboxMessages: Array.isArray(config.inboxMessages) ? config.inboxMessages : [],
    scheduledInboxRules: Array.isArray(config.scheduledInboxRules)
      ? config.scheduledInboxRules
      : loadScheduledInboxRules(),
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(normalized));
      if (Array.isArray(config.specialEvents)) {
        saveSpecialEvents(config.specialEvents);
      }
      if (Array.isArray(config.recurringEvents)) {
        saveRecurringEvents(config.recurringEvents);
      }
      if (Array.isArray(config.scheduledInboxRules)) {
        saveScheduledInboxRules(config.scheduledInboxRules);
      }
      window.dispatchEvent(
        new CustomEvent("desafios:admin-config-updated", { detail: normalized }),
      );
    } catch {
      /* ignore */
    }
  }
  return normalized;
}

export type CodeResult =
  | { status: "ok"; game: GameId }
  | { status: "all"; games: GameId[] }
  | { status: "reserved" }
  | { status: "already"; game: GameId }
  | { status: "disabled"; game: GameId }
  | { status: "invalid" };

export function loadUnlocked(): GameId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(UNLOCK_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as GameId[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveUnlocked(list: GameId[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UNLOCK_KEY, JSON.stringify([...new Set(list)]));
}

export function clearUnlocked() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

/** Validates a code against the active Admin configuration and unlocks the matching game. */
export function redeemCode(raw: string, customConfig?: PlatformAdminConfig): CodeResult {
  const code = normalizeCode(raw);
  if (!code) return { status: "invalid" };

  const cfg = customConfig ?? loadAdminConfig();

  if (code === cfg.masterCode) {
    const allEnabled = (Object.keys(cfg.gameCodes) as GameId[]).filter(
      (g) => cfg.enabledGames[g],
    );
    saveUnlocked([...loadUnlocked(), ...allEnabled]);
    return { status: "all", games: allEnabled };
  }

  const entry = (Object.entries(cfg.gameCodes) as [GameId, string][]).find(
    ([, c]) => normalizeCode(c) === code,
  );
  if (entry) {
    const [game] = entry;
    if (!cfg.enabledGames[game]) {
      return { status: "disabled", game };
    }
    const current = loadUnlocked();
    if (current.includes(game)) return { status: "already", game };
    saveUnlocked([...current, game]);
    return { status: "ok", game };
  }

  if (RESERVED_CODES.includes(code)) return { status: "reserved" };
  return { status: "invalid" };
}
