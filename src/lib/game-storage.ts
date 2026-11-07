// Storage helpers for best scores per game
const KEY = "desafios-logica-stats-v1";
const LAST_KEY = "desafios-logica-last-v1";

export type GameId =
  | "logica"
  | "cartesiano"
  | "robogrid"
  | "rpg"
  | "variaveis"
  | "formas"
  | "memoria"
  | "minado"
  | "porcentagem"
  | "completar"
  | "spacequest";

export const ALL_GAME_IDS: GameId[] = [
  "logica",
  "cartesiano",
  "formas",
  "memoria",
  "variaveis",
  "robogrid",
  "porcentagem",
  "minado",
  "completar",
  "rpg",
  "spacequest",
];

export const GAME_NAMES: Record<GameId, string> = {
  logica: "Lógica Matemática",
  cartesiano: "Plano Cartesiano",
  formas: "Formas e Cores",
  memoria: "Memória das Cores",
  variaveis: "Caça às Variáveis",
  robogrid: "RoboGrid",
  porcentagem: "Desafio das Partes",
  minado: "Campo Minado Lógico",
  completar: "Completando a Lógica",
  rpg: "Batalha de Robôs",
  spacequest: "Space Quest",
};

export interface GameStats {
  bestScore: number;
  bestLevel: number;
}

export type AllStats = Record<GameId, GameStats>;

export interface LastMatch {
  score: number;
  correct: number;
  wrong: number;
  level: number;
  at: number; // epoch ms
  /** Optional game mode (games that have more than one). */
  mode?: string;
  /** Explicitly marks whether the player won or lost the duel/match (e.g., in X1 online mode). */
  won?: boolean;
  /** Indicates whether the match was played in local team mode (reduces XP by 4X) */
  isTeam?: boolean;
}

type MatchListener = (id: GameId, match: LastMatch) => void;
let matchListener: MatchListener | null = null;

/** Lets the logged-in profile record every finished match. */
export function onMatchSaved(fn: MatchListener | null) {
  matchListener = fn;
}

export type AllLastMatches = Partial<Record<GameId, LastMatch>>;

export const DEFAULT_STATS: AllStats = {
  logica: { bestScore: 0, bestLevel: 1 },
  cartesiano: { bestScore: 0, bestLevel: 1 },
  robogrid: { bestScore: 0, bestLevel: 1 },
  rpg: { bestScore: 0, bestLevel: 1 },
  variaveis: { bestScore: 0, bestLevel: 1 },
  formas: { bestScore: 0, bestLevel: 1 },
  memoria: { bestScore: 0, bestLevel: 1 },
  minado: { bestScore: 0, bestLevel: 1 },
  porcentagem: { bestScore: 0, bestLevel: 1 },
  completar: { bestScore: 0, bestLevel: 1 },
  spacequest: { bestScore: 0, bestLevel: 1 },
};

export function loadStats(): AllStats {
  if (typeof window === "undefined") return { ...DEFAULT_STATS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(stats: AllStats) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(stats));
}

export function clearLocalStats() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}

export function updateBest(id: GameId, score: number, level: number): AllStats {
  const safeScore = Math.max(0, score);
  const safeLevel = Math.max(1, level);
  const cur = loadStats();
  const next: AllStats = {
    ...cur,
    [id]: {
      bestScore: Math.max(cur[id]?.bestScore ?? 0, safeScore),
      bestLevel: Math.max(cur[id]?.bestLevel ?? 1, safeLevel),
    },
  };
  saveStats(next);
  return next;
}

function loadAllLast(): AllLastMatches {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function loadLastMatch(id: GameId): LastMatch | null {
  return loadAllLast()[id] ?? null;
}

export function saveLastMatch(id: GameId, match: Omit<LastMatch, "at"> & { at?: number }) {
  if (typeof window === "undefined") return;
  const all = loadAllLast();
  const full: LastMatch = {
    ...match,
    score: Math.max(0, match.score),
    at: match.at ?? Date.now(),
  };
  all[id] = full;
  window.localStorage.setItem(LAST_KEY, JSON.stringify(all));
  try {
    matchListener?.(id, full);
  } catch {
    /* ignore */
  }
}
