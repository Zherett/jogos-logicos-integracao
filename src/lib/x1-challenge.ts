// Arena de Desafio X1 Online (1v1 Versus Mode)
// Browser-safe state machine, room/presence synchronization (PlayFab SharedGroupData + BroadcastChannel + localStorage),
// deterministic room codes, and 1v1 Tug-of-War / Score-Race evaluation.

import { GAME_NAMES, type GameId } from "./game-storage.ts";
import {
  getAdminPlayFabTicket,
  getPlayFabTitleId,
  isPlayFabConfigured,
  loadStoredSession,
} from "./playfab.ts";
import type { AgeStageId } from "./player-profile.ts";
import { recordPlayerHeartbeat } from "./presence.ts";
import { type Shape } from "./shapes-content.ts";
import {
  cellLabel,
  GENERAL_SHAPES,
  type MineCard,
  type QuestionCard,
  type BonusCard,
} from "./minefield-content.ts";

const X1_STORAGE_KEY = "desafios-x1-lobby-state-v1";
const X1_CHANNEL_NAME = "desafios-x1-broadcast-v1";
const LOBBY_SHARED_GROUP_ID = "X1_LOBBY_SEMED_V2";

export const X1_MATCH_DURATION_SEC = 90;
export const X1_ROBOT_INITIAL_HP = 5; // 5 Vidas na Batalha dos Robôs
export const X1_ROOM_EXPIRATION_MS = 120_000; // Sala de espera expira em 2 minutos se ninguém entrar
export const X1_POST_MATCH_AUTOCLOSE_MS = 60_000; // Sala fechada e apagada em 1 minuto pós-partida
export const X1_COUNTDOWN_DURATION_SEC = 10; // 10 segundos de contagem regressiva sincronizada
export const X1_VICTORY_BONUS_XP = 50;
export const X1_PARTICIPATION_BONUS_XP = 20;

export type X1RoomStatus = "waiting" | "countdown" | "playing" | "finished";

export interface X1OnlinePlayer {
  playerId: string;
  nick: string;
  fullName: string;
  school: string;
  level: number;
  age?: number;
  stage?: AgeStageId;
  lastSeenAt: number; // epoch ms
  lastActiveAt?: number; // epoch ms
  inRoomCode?: string | null;
}

export interface X1PlayerSideState {
  playerId: string;
  nick: string;
  school: string;
  level: number;
  age?: number;
  stage?: AgeStageId;
  score: number;
  correct: number;
  wrong: number;
  hp: number;
  maxHp: number;
  finished: boolean;
  currentQuestionIdx?: number;
  isBot?: boolean;
  updatedAt: number;
}

export interface X1ChallengeInvite {
  id: string;
  roomCode: string;
  fromNick: string;
  fromSchool: string;
  toPlayerId: string;
  gameId: GameId;
  createdAt: number;
  status?: "pending" | "accepted" | "rejected";
  rejectedByNick?: string;
}

export interface X1MatchLogEntry {
  id: string;
  roomCode: string;
  gameId: GameId;
  gameName: string;
  hostNick: string;
  hostSchool: string;
  hostScore: number;
  guestNick: string;
  guestSchool: string;
  guestScore: number;
  winnerId: string | "draw";
  winnerNick: string;
  finishedAt: string;
  read?: boolean;
}

export interface X1MinadoActiveQuestion {
  cardId: string;
  openedBy: string;
  prompt: string;
  expr?: string;
  shape?: Shape;
  options: string[];
  answer: string;
  expiresAt: number;
}

export interface X1MinadoState {
  board: MineCard[];
  revealed: Record<string, { openedBy: string; openedAt: number; resultText: string }>;
  currentTurnPlayerId: string;
  activeQuestion?: X1MinadoActiveQuestion | null;
  turnStartedAt: number;
}

export interface X1QuestionEntry {
  id: string;
  prompt: string;
  expr?: string;
  options: string[];
  answer: string;
}

export interface X1Room {
  code: string;
  gameId: GameId;
  status: X1RoomStatus;
  seed: number;
  createdAt: number;
  expiresAt: number;
  countdownEndsAt?: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  autoCloseAt?: number | null;
  durationSec: number;
  /** Blue share (0..100) for the 1v1 Tug-of-War bar (50 = balanced center) */
  blueShare: number;
  host: X1PlayerSideState;
  guest: X1PlayerSideState | null;
  winnerId: string | "draw" | null;
  minadoState?: X1MinadoState | null;
  questionList?: X1QuestionEntry[];
}

interface X1LobbyStore {
  players: Record<string, X1OnlinePlayer>;
  rooms: Record<string, X1Room>;
  invites: X1ChallengeInvite[];
  updatedAt: number;
}

const X1_MATCH_HISTORY_KEY = "desafios-x1-match-history-v1";

export function loadX1MatchHistory(): X1MatchLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(X1_MATCH_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as X1MatchLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveX1MatchHistory(entries: X1MatchLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(X1_MATCH_HISTORY_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent("desafios:x1-history-updated"));
  } catch {
    // ignore
  }
}

export function recordX1MatchFinished(room: X1Room): void {
  if (!room.guest || !room.winnerId) return;
  const history = loadX1MatchHistory();
  if (history.some((h) => h.roomCode === room.code)) return;

  let winnerNick = "Empate";
  if (room.winnerId === room.host.playerId) {
    winnerNick = room.host.nick;
  } else if (room.winnerId === room.guest.playerId) {
    winnerNick = room.guest.nick;
  }

  room.autoCloseAt = (room.finishedAt ?? Date.now()) + X1_POST_MATCH_AUTOCLOSE_MS;

  const entry: X1MatchLogEntry = {
    id: `x1_match_${room.code}_${Date.now()}`,
    roomCode: room.code,
    gameId: room.gameId,
    gameName: GAME_NAMES[room.gameId] ?? room.gameId,
    hostNick: room.host.nick,
    hostSchool: room.host.school,
    hostScore: room.host.score,
    guestNick: room.guest.nick,
    guestSchool: room.guest.school,
    guestScore: room.guest.score,
    winnerId: room.winnerId,
    winnerNick,
    finishedAt: new Date(room.finishedAt ?? Date.now()).toISOString(),
    read: false,
  };

  history.unshift(entry);
  saveX1MatchHistory(history.slice(0, 100));
}

export function markAllX1MatchesRead(): void {
  const history = loadX1MatchHistory();
  const updated = history.map((h) => ({ ...h, read: true }));
  saveX1MatchHistory(updated);
}

export function clearX1MatchHistory(): void {
  saveX1MatchHistory([]);
}

/* --------------------- Pure Logic & Deterministic Generators (Testable) --------------------- */

export function createSeededRng(seed: number) {
  let s = Math.abs(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Constrói o tabuleiro 8x8 de Campo Minado exclusivo para o modo X1:
 * - Determinístico baseado no seed compartilhado da sala.
 * - ~40% de cartas bônus, sendo a maioria (~65%) minas com pontuação negativa (−1 a −3).
 * - ~60% de desafios matemáticos e lógicos.
 */
export function buildX1Board(seed: number): MineCard[] {
  const nextRnd = createSeededRng(seed);
  const ri = (n: number) => Math.floor(nextRnd() * n);
  const rand = <T>(arr: readonly T[]): T => arr[ri(arr.length)];
  const shuffle = <T>(arr: T[]): T[] => {
    const cp = [...arr];
    for (let i = cp.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [cp[i], cp[j]] = [cp[j], cp[i]];
    }
    return cp;
  };

  const cards: MineCard[] = [];
  for (let i = 0; i < 64; i++) {
    const roll = nextRnd();
    let base: QuestionCard | BonusCard;
    if (roll < 0.40) {
      // 40% Cartas Bônus / Minas no X1
      const mag = 1 + ri(3); // 1, 2 ou 3
      // 65% de chances de ser MINA negativa no modo X1
      const isNegative = nextRnd() < 0.65;
      base = { kind: "bonus", points: isNegative ? -mag : mag };
    } else if (roll < 0.60) {
      // Verdadeiro ou Falso
      const a = 1 + ri(20), b = 1 + ri(20);
      const op = rand([">", "<", "="] as const);
      const expr = `${a} ${op} ${b}`;
      const truth = op === ">" ? a > b : op === "<" ? a < b : a === b;
      base = {
        kind: "tf",
        prompt: "Verdadeiro ou Falso?",
        expr,
        options: ["Verdadeiro", "Falso"],
        answer: truth ? "Verdadeiro" : "Falso",
      };
    } else if (roll < 0.80) {
      // Conta misteriosa
      const x = 1 + ri(10);
      const b = 1 + ri(10);
      const expr = `X + ${b} = ${x + b}`;
      const opts = new Set<number>([x]);
      while (opts.size < 4) {
        const d = x + (ri(2) ? 1 : -1) * (1 + ri(4));
        if (d > 0) opts.add(d);
      }
      base = {
        kind: "mystery",
        prompt: "Qual o valor de X?",
        expr,
        options: shuffle([...opts]).map(String),
        answer: String(x),
      };
    } else {
      // Forma geométrica
      const target = rand(GENERAL_SHAPES);
      const others = shuffle(GENERAL_SHAPES.filter((s) => s.shape !== target.shape)).slice(0, 3);
      base = {
        kind: "shape",
        prompt: "Qual é o nome desta forma?",
        options: shuffle([target.label, ...others.map((s) => s.label)]),
        answer: target.label,
        shape: target.shape,
      };
    }
    cards.push({ ...base, id: `c${i}`, label: cellLabel(i) });
  }
  return cards;
}

/**
 * Gera uma lista determinística idêntica de questões a partir da semente da sala (seed).
 * Garante que ambos os jogadores recebam os mesmos problemas na mesma ordem.
 */
export function generateDeterministicQuestionList(seed: number, gameId: GameId): X1QuestionEntry[] {
  const nextRnd = createSeededRng(seed);
  const ri = (n: number) => Math.floor(nextRnd() * n);
  const rand = <T>(arr: readonly T[]): T => arr[ri(arr.length)];
  const shuffle = <T>(arr: T[]): T[] => {
    const cp = [...arr];
    for (let i = cp.length - 1; i > 0; i--) {
      const j = ri(i + 1);
      [cp[i], cp[j]] = [cp[j], cp[i]];
    }
    return cp;
  };

  const list: X1QuestionEntry[] = [];
  for (let i = 0; i < 25; i++) {
    if (gameId === "porcentagem") {
      const pct = rand([10, 20, 25, 50, 75, 100]);
      const baseVal = rand([20, 40, 50, 60, 80, 100, 200]);
      const correctAns = Math.round((pct / 100) * baseVal);
      const opts = new Set<number>([correctAns]);
      while (opts.size < 4) {
        const delta = rand([-10, -5, -2, 2, 5, 10, 15]);
        const cand = correctAns + delta;
        if (cand > 0) opts.add(cand);
      }
      list.push({
        id: `q_pct_${seed}_${i}`,
        prompt: `Quanto é ${pct}% de ${baseVal}?`,
        expr: `${pct}% de ${baseVal}`,
        options: shuffle([...opts]).map(String),
        answer: String(correctAns),
      });
    } else {
      // logica / geral
      const a = 1 + ri(15);
      const b = 1 + ri(12);
      const op = rand(["+", "−", "×"] as const);
      const val = op === "+" ? a + b : op === "−" ? Math.max(a, b) - Math.min(a, b) : a * b;
      const exprA = op === "−" ? Math.max(a, b) : a;
      const exprB = op === "−" ? Math.min(a, b) : b;
      const isCorrectShown = nextRnd() < 0.5;
      const shownVal = isCorrectShown ? val : val + rand([-3, -2, -1, 1, 2, 3]);
      list.push({
        id: `q_log_${seed}_${i}`,
        prompt: "A igualdade abaixo é Verdadeira ou Falsa?",
        expr: `${exprA} ${op} ${exprB} = ${shownVal}`,
        options: ["Verdadeiro", "Falso"],
        answer: isCorrectShown ? "Verdadeiro" : "Falso",
      });
    }
  }
  return list;
}

export interface RotatedX1GameInfo {
  currentGame: GameId;
  nextGame: GameId;
  secondsUntilNextRotation: number;
  totalGamesCount: number;
  gameList: GameId[];
}

/**
 * Calculates current active game in the X1 Arena and countdown to next rotation.
 * If 1 game is selected, it stays fixed.
 * If 2 or 3 games are selected, rotates deterministically every `rotationMinutes` (default: 10).
 */
export function getActiveRotatedX1Game(args: {
  availableGames?: GameId[];
  rotationMinutes?: number;
  now?: Date;
}): RotatedX1GameInfo {
  const games: GameId[] =
    args.availableGames && args.availableGames.length > 0
      ? args.availableGames.slice(0, 3)
      : ["rpg", "logica", "porcentagem"];

  const rotationMins = Math.max(1, args.rotationMinutes ?? 10);
  const rotationMs = rotationMins * 60 * 1000;
  const nowMs = (args.now ?? new Date()).getTime();

  if (games.length === 1) {
    return {
      currentGame: games[0],
      nextGame: games[0],
      secondsUntilNextRotation: rotationMins * 60,
      totalGamesCount: 1,
      gameList: games,
    };
  }

  const intervalIndex = Math.floor(nowMs / rotationMs);
  const currentIdx = ((intervalIndex % games.length) + games.length) % games.length;
  const nextIdx = (currentIdx + 1) % games.length;
  const elapsedInInterval = nowMs % rotationMs;
  const msRemaining = rotationMs - elapsedInInterval;

  return {
    currentGame: games[currentIdx],
    nextGame: games[nextIdx],
    secondsUntilNextRotation: Math.max(0, Math.floor(msRemaining / 1000)),
    totalGamesCount: games.length,
    gameList: games,
  };
}

/** Generates a 4-digit numeric room code (e.g., `"4829"`). */
export function generateRoomCode(existingCodes: string[] = []): string {
  for (let i = 0; i < 30; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!existingCodes.includes(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Calculates the 1v1 Tug-of-War blue share (`0..100`) for Score-Race games
 * based on the live score difference between Host (Blue) and Guest (Red).
 */
export function computeScoreRaceBlueShare(hostScore: number, guestScore: number): number {
  const diff = hostScore - guestScore;
  // Each 10 points of lead shifts the bar by ~6%, clamped between 8% and 92%
  const shifted = 50 + diff * 0.6;
  return Math.max(8, Math.min(92, Math.round(shifted)));
}

/**
 * Applies a 1v1 Robot Battle answer to a room from either the `"host"` (Blue, left)
 * or `"guest"` (Red, right) perspective.
 * - Host correct answer pushes `blueShare` right (`+18%`) and deals `1` HP damage to Guest (or `3` HP on `100%` Blue Super Hit!).
 * - Guest correct answer pushes `blueShare` left (`-18%`, i.e., Red grows!) and deals `1` HP damage to Host (or `3` HP on `0%` Blue / `100%` Red Super Hit!).
 */
export function applyX1RobotBattleAnswer(args: {
  room: X1Room;
  role: "host" | "guest";
  isCorrect: boolean;
}): {
  room: X1Room;
  isSuperHit: boolean;
  damageDealt: number;
} {
  const next: X1Room = {
    ...args.room,
    host: { ...args.room.host },
    guest: args.room.guest ? { ...args.room.guest } : null,
  };

  if (!next.guest || next.status !== "playing") {
    return { room: next, isSuperHit: false, damageDealt: 0 };
  }

  const me = args.role === "host" ? next.host : next.guest;
  const opp = args.role === "host" ? next.guest : next.host;
  const now = Date.now();
  me.updatedAt = now;

  if (!args.isCorrect) {
    me.wrong += 1;
    me.score = Math.max(0, me.score - 5);
    // Penalty pushes the bar 10% toward the opponent
    next.blueShare =
      args.role === "host"
        ? Math.max(0, next.blueShare - 10)
        : Math.min(100, next.blueShare + 10);
    return { room: next, isSuperHit: false, damageDealt: 0 };
  }

  me.correct += 1;
  let isSuperHit = false;
  let damageDealt = 1;

  if (args.role === "host") {
    const rawBlue = next.blueShare + 18;
    if (rawBlue >= 100) {
      isSuperHit = true;
      damageDealt = 3;
      next.blueShare = 55;
      me.score += 35;
    } else {
      next.blueShare = rawBlue;
      me.score += 15;
    }
  } else {
    // Guest is Red (pushing blueShare toward 0)
    const rawBlue = next.blueShare - 18;
    if (rawBlue <= 0) {
      isSuperHit = true;
      damageDealt = 3;
      next.blueShare = 45;
      me.score += 35;
    } else {
      next.blueShare = rawBlue;
      me.score += 15;
    }
  }

  opp.hp = Math.max(0, opp.hp - damageDealt);
  if (opp.hp <= 0) {
    next.status = "finished";
    next.finishedAt = now;
    next.winnerId = me.playerId;
    next.blueShare = args.role === "host" ? 100 : 0;
  }

  return { room: next, isSuperHit, damageDealt };
}

/**
 * Determines the winner of an X1 room when time expires or both players finish.
 */
export function resolveX1Winner(room: X1Room): string | "draw" {
  if (!room.guest) return room.host.playerId;
  if (room.gameId === "rpg") {
    if (room.host.hp !== room.guest.hp) {
      return room.host.hp > room.guest.hp ? room.host.playerId : room.guest.playerId;
    }
  }
  if (room.gameId === "minado") {
    // No Campo Minado X1: Vence quem tiver mais pontos; persistindo empate, menos erros
    if (room.host.score !== room.guest.score) {
      return room.host.score > room.guest.score ? room.host.playerId : room.guest.playerId;
    }
    if (room.host.wrong !== room.guest.wrong) {
      return room.host.wrong < room.guest.wrong ? room.host.playerId : room.guest.playerId;
    }
    if (room.host.correct !== room.guest.correct) {
      return room.host.correct > room.guest.correct ? room.host.playerId : room.guest.playerId;
    }
    return "draw";
  }
  if (room.host.score !== room.guest.score) {
    return room.host.score > room.guest.score ? room.host.playerId : room.guest.playerId;
  }
  if (room.host.correct !== room.guest.correct) {
    return room.host.correct > room.guest.correct ? room.host.playerId : room.guest.playerId;
  }
  if (room.host.wrong !== room.guest.wrong) {
    return room.host.wrong < room.guest.wrong ? room.host.playerId : room.guest.playerId;
  }
  return "draw";
}

/* --------------------- Store & Real-Time Transport Layer --------------------- */

let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(X1_CHANNEL_NAME);
      channel.onmessage = () => {
        notifyListeners();
      };
    } catch {
      channel = null;
    }
  }
  return channel;
}

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeX1Updates(fn: () => void): () => void {
  listeners.add(fn);
  getChannel();
  const onStorage = (e: StorageEvent) => {
    if (e.key === X1_STORAGE_KEY) notifyListeners();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

let memoryStoreFallback: X1LobbyStore = { players: {}, rooms: {}, invites: [], updatedAt: Date.now() };

function loadStore(): X1LobbyStore {
  const empty: X1LobbyStore = { players: {}, rooms: {}, invites: [], updatedAt: Date.now() };
  if (typeof window === "undefined") return memoryStoreFallback;
  try {
    const raw = window.localStorage.getItem(X1_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<X1LobbyStore>;
    const now = Date.now();

    // Retain players up to 10 minutes (matching PRESENCE_IDLE_MAX_AGE_MS) and rooms up to 15 min
    const players: Record<string, X1OnlinePlayer> = {};
    for (const [id, p] of Object.entries(parsed.players ?? {})) {
      if (now - p.lastSeenAt <= 10 * 60_000) players[id] = p;
    }

    const rooms: Record<string, X1Room> = {};
    for (const [code, r] of Object.entries(parsed.rooms ?? {})) {
      // 1. Expira salas de espera não iniciadas após 2 minutos
      const expiresAt = r.expiresAt ?? (r.createdAt + X1_ROOM_EXPIRATION_MS);
      if (r.status === "waiting" && now >= expiresAt) {
        continue;
      }
      // 2. Limpa salas concluídas após 1 minuto de encerramento
      if (r.status === "finished" && r.autoCloseAt && now >= r.autoCloseAt) {
        continue;
      }
      // 3. Fallback de descarte após 15 minutos
      if (now - r.createdAt < 15 * 60_000) {
        // Transição automática da contagem regressiva para jogo ativo
        if (r.status === "countdown" && r.countdownEndsAt && now >= r.countdownEndsAt) {
          r.status = "playing";
          r.startedAt = r.startedAt ?? now;
        }
        rooms[code] = r;
      }
    }

    const invites = (parsed.invites ?? []).filter((inv) => now - inv.createdAt < 120_000);

    return { players, rooms, invites, updatedAt: parsed.updatedAt ?? now };
  } catch {
    return empty;
  }
}

function saveStore(store: X1LobbyStore) {
  store.updatedAt = Date.now();
  memoryStoreFallback = store;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(X1_STORAGE_KEY, JSON.stringify(store));
    getChannel()?.postMessage({ type: "sync", at: store.updatedAt });
  } catch {
    /* ignore */
  }
  notifyListeners();
}

/* --------------------- PlayFab SharedGroupData Cloud Sync --------------------- */

async function callPlayFabSharedGroup(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!isPlayFabConfigured()) return null;
  const session = loadStoredSession();
  const titleId = getPlayFabTitleId();
  const ticket = (await getAdminPlayFabTicket()) ?? session?.sessionTicket;
  if (!ticket || !titleId) return null;

  try {
    const res = await fetch(`https://${titleId}.playfabapi.com/Client/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, ...body }),
    });
    const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function syncX1WithPlayFabCloud(activeRoomCode?: string | null): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const store = loadStore();

  // 1. Ensure Lobby SharedGroup exists and sync active rooms/players
  await callPlayFabSharedGroup("CreateSharedGroup", {
    SharedGroupId: LOBBY_SHARED_GROUP_ID,
  });

  const remoteLobby = (await callPlayFabSharedGroup("GetSharedGroupData", {
    SharedGroupId: LOBBY_SHARED_GROUP_ID,
  })) as { Data?: Record<string, { Value: string; LastUpdated?: string }> } | null;

  let changed = false;
  if (remoteLobby?.Data?.LobbySnapshot?.Value) {
    try {
      const remoteStore = JSON.parse(remoteLobby.Data.LobbySnapshot.Value) as Partial<X1LobbyStore>;
      const now = Date.now();
      for (const [id, p] of Object.entries(remoteStore.players ?? {})) {
        if (now - p.lastSeenAt <= 10 * 60_000) {
          const local = store.players[id];
          if (!local || p.lastSeenAt > local.lastSeenAt) {
            store.players[id] = p;
            recordPlayerHeartbeat(p.playerId || id, {
              nick: p.nick,
              lastSeenAt: p.lastSeenAt,
              lastActiveAt: p.lastActiveAt ?? p.lastSeenAt,
            });
            changed = true;
          }
        }
      }
      for (const [code, r] of Object.entries(remoteStore.rooms ?? {})) {
        // Ignora salas de espera expiradas (> 2 min) ou concluídas que já passaram do tempo de auto-close
        const expiresAt = r.expiresAt ?? (r.createdAt + X1_ROOM_EXPIRATION_MS);
        if (r.status === "waiting" && now >= expiresAt) {
          continue;
        }
        if (r.status === "finished" && r.autoCloseAt && now >= r.autoCloseAt) {
          continue;
        }

        if (now - r.createdAt < 15 * 60_000) {
          const local = store.rooms[code];
          const remoteTime = Math.max(r.host.updatedAt, r.guest?.updatedAt ?? 0, r.createdAt);
          const localTime = local
            ? Math.max(local.host.updatedAt, local.guest?.updatedAt ?? 0, local.createdAt)
            : 0;
          if (!local || remoteTime > localTime) {
            store.rooms[code] = r;
            changed = true;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Push merged snapshot
  await callPlayFabSharedGroup("UpdateSharedGroupData", {
    SharedGroupId: LOBBY_SHARED_GROUP_ID,
    Data: {
      LobbySnapshot: JSON.stringify({
        players: store.players,
        rooms: store.rooms,
        invites: store.invites,
      }),
    },
    Permission: "Public",
  });

  if (activeRoomCode) {
    const cleanCode = activeRoomCode.trim().toUpperCase();
    const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string }> } | null;

    if (remoteRoomData?.Data?.Room?.Value) {
      try {
        const remoteRoom = JSON.parse(remoteRoomData.Data.Room.Value) as X1Room;
        const localRoom = store.rooms[cleanCode];
        const remoteUpdated = Math.max(
          remoteRoom.host.updatedAt,
          remoteRoom.guest?.updatedAt ?? 0,
        );
        const localUpdated = localRoom
          ? Math.max(
              localRoom.host.updatedAt,
              localRoom.guest?.updatedAt ?? 0,
            )
          : 0;
        if (!localRoom || remoteUpdated >= localUpdated) {
          store.rooms[cleanCode] = remoteRoom;
          changed = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (changed) {
    saveStore(store);
  }
}

async function pushRoomToPlayFab(room: X1Room) {
  if (!isPlayFabConfigured()) return;
  const roomGroupId = `x1_room_${room.code.toLowerCase()}`;
  await callPlayFabSharedGroup("CreateSharedGroup", { SharedGroupId: roomGroupId });
  await callPlayFabSharedGroup("UpdateSharedGroupData", {
    SharedGroupId: roomGroupId,
    Data: { Room: JSON.stringify(room) },
    Permission: "Public",
  });
  void syncX1WithPlayFabCloud(room.code);
}

/* --------------------- Public Lobby & Room Operations --------------------- */

export function heartbeatOnlinePlayer(player: {
  playerId: string;
  nick: string;
  fullName: string;
  school: string;
  level: number;
  age?: number;
  stage?: AgeStageId;
  inRoomCode?: string | null;
  lastActiveAt?: number;
}) {
  const store = loadStore();
  const now = Date.now();
  const existing = store.players[player.playerId];
  const lastActiveAt = player.lastActiveAt ?? existing?.lastActiveAt ?? now;
  store.players[player.playerId] = {
    ...player,
    lastSeenAt: now,
    lastActiveAt,
  };
  saveStore(store);
  recordPlayerHeartbeat(player.playerId, {
    nick: player.nick,
    lastSeenAt: now,
    lastActiveAt,
  });
}

export function getX1LobbySnapshot(currentPlayerId?: string) {
  const store = loadStore();
  const onlinePlayers = Object.values(store.players)
    .filter((p) => p.level >= 5 && (Date.now() - p.lastSeenAt) <= 60_000)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const openRooms = Object.values(store.rooms)
    .filter((r) => r.status === "waiting")
    .sort((a, b) => b.createdAt - a.createdAt);

  const activeMatches = Object.values(store.rooms)
    .filter((r) => r.status === "playing" || r.status === "countdown")
    .sort((a, b) => b.createdAt - a.createdAt);

  const myInvites = currentPlayerId
    ? store.invites.filter((inv) => inv.toPlayerId === currentPlayerId && (!inv.status || inv.status === "pending"))
    : [];

  return {
    onlinePlayers,
    openRooms,
    activeMatches,
    myInvites,
  };
}

export function getX1Room(code: string): X1Room | null {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const store = loadStore();
  return store.rooms[clean] ?? null;
}

export function createX1Room(args: {
  host: {
    playerId: string;
    nick: string;
    school: string;
    level: number;
    age?: number;
    stage?: AgeStageId;
  };
  gameId: GameId;
  inviteTargetPlayerId?: string;
}): X1Room {
  const store = loadStore();
  const code = generateRoomCode(Object.keys(store.rooms));
  const now = Date.now();
  const seed = Math.floor(Math.random() * 1_000_000);

  const room: X1Room = {
    code,
    gameId: args.gameId,
    status: "waiting",
    seed,
    createdAt: now,
    expiresAt: now + X1_ROOM_EXPIRATION_MS, // Expira em 2 minutos se ninguém entrar
    countdownEndsAt: null,
    startedAt: null,
    finishedAt: null,
    durationSec: X1_MATCH_DURATION_SEC,
    blueShare: 50,
    host: {
      playerId: args.host.playerId,
      nick: args.host.nick,
      school: args.host.school,
      level: args.host.level,
      age: args.host.age,
      stage: args.host.stage,
      score: 0,
      correct: 0,
      wrong: 0,
      hp: X1_ROBOT_INITIAL_HP,
      maxHp: X1_ROBOT_INITIAL_HP,
      finished: false,
      currentQuestionIdx: 0,
      updatedAt: now,
    },
    guest: null,
    winnerId: null,
    minadoState: null,
    questionList: undefined,
  };

  store.rooms[code] = room;

  if (args.inviteTargetPlayerId) {
    store.invites.push({
      id: `inv_${now}_${code}`,
      roomCode: code,
      fromNick: args.host.nick,
      fromSchool: args.host.school,
      toPlayerId: args.inviteTargetPlayerId,
      gameId: args.gameId,
      createdAt: now,
      status: "pending",
    });
  }

  saveStore(store);
  void pushRoomToPlayFab(room);
  return room;
}

export function dismissX1Invite(inviteId: string) {
  const store = loadStore();
  store.invites = store.invites.filter((i) => i.id !== inviteId);
  saveStore(store);
}

export function rejectX1Invite(inviteId: string, rejectedByNick: string): void {
  const store = loadStore();
  const inv = store.invites.find((i) => i.id === inviteId);
  if (inv) {
    inv.status = "rejected";
    inv.rejectedByNick = rejectedByNick;
    saveStore(store);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("desafios:x1-invite-rejected", {
          detail: { inviteId, roomCode: inv.roomCode, rejectedByNick },
        }),
      );
    }
  }
}

export function cancelWaitingX1Room(code: string, hostPlayerId?: string): boolean {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room) return false;
  if (hostPlayerId && room.host.playerId !== hostPlayerId) return false;
  delete store.rooms[clean];
  store.invites = store.invites.filter((inv) => inv.roomCode !== clean);
  saveStore(store);
  void syncX1WithPlayFabCloud();
  return true;
}

export function joinX1Room(args: {
  code: string;
  guest: { playerId: string; nick: string; school: string; level: number; isBot?: boolean };
}): { room: X1Room | null; error: string | null } {
  const clean = args.code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];

  if (!room) {
    return { room: null, error: "Sala não encontrada ou expirada (limite de 2 minutos)." };
  }
  if (room.host.playerId === args.guest.playerId) {
    return { room, error: null };
  }
  if (room.guest && room.guest.playerId !== args.guest.playerId && room.status !== "waiting") {
    return { room: null, error: "Esta sala já está cheia (2/2) e em andamento." };
  }

  const now = Date.now();
  room.guest = {
    playerId: args.guest.playerId,
    nick: args.guest.nick,
    school: args.guest.school,
    level: args.guest.level,
    score: 0,
    correct: 0,
    wrong: 0,
    hp: X1_ROBOT_INITIAL_HP,
    maxHp: X1_ROBOT_INITIAL_HP,
    finished: false,
    currentQuestionIdx: 0,
    isBot: args.guest.isBot,
    updatedAt: now,
  };

  // Inicia contagem regressiva sincronizada de 10 segundos
  room.status = "countdown";
  room.countdownEndsAt = now + 10_000;
  room.startedAt = null;
  room.blueShare = 50;

  // Inicializa o tabuleiro ou lista determinística de questões para a partida
  if (room.gameId === "minado") {
    const firstPlayerId = room.seed % 2 === 0 ? room.host.playerId : args.guest.playerId;
    room.minadoState = {
      board: buildX1Board(room.seed),
      revealed: {},
      currentTurnPlayerId: firstPlayerId,
      activeQuestion: null,
      turnStartedAt: now + 10_000,
    };
  } else if (room.gameId === "logica" || room.gameId === "porcentagem") {
    room.questionList = generateDeterministicQuestionList(room.seed, room.gameId);
  }

  // Remove invites pendentes desta sala
  store.invites = store.invites.filter((inv) => inv.roomCode !== clean);
  store.rooms[clean] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);

  return { room, error: null };
}

/**
 * Procura e baixa o estado atualizado de uma sala na nuvem PlayFab (por código).
 */
export async function fetchX1RoomFromCloud(code: string): Promise<X1Room | null> {
  const clean = code.trim().toUpperCase();
  if (!clean || !isPlayFabConfigured()) return null;

  const store = loadStore();
  const roomGroupId = `x1_room_${clean.toLowerCase()}`;

  // 1. Consulta o SharedGroup direto da sala
  try {
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string }> } | null;

    if (remoteRoomData?.Data?.Room?.Value) {
      const remoteRoom = JSON.parse(remoteRoomData.Data.Room.Value) as X1Room;
      store.rooms[clean] = remoteRoom;
      saveStore(store);
      return remoteRoom;
    }
  } catch {
    /* ignore */
  }

  // 2. Consulta o snapshot geral do Lobby da nuvem
  await syncX1WithPlayFabCloud(clean);
  const refreshed = loadStore();
  return refreshed.rooms[clean] ?? null;
}

/**
 * Entra na sala por código com busca assíncrona garantida na nuvem PlayFab.
 */
export async function joinX1RoomAsync(args: {
  code: string;
  guest: { playerId: string; nick: string; school: string; level: number; isBot?: boolean };
}): Promise<{ room: X1Room | null; error: string | null }> {
  const clean = args.code.trim().toUpperCase();
  if (clean.length !== 4) {
    return { room: null, error: "O código da sala deve ter exatamente 4 dígitos numéricos." };
  }

  // 1. Tenta encontrar e entrar se a sala já estiver na memória local
  const immediate = joinX1Room(args);
  if (immediate.room) {
    return immediate;
  }

  // 2. Se não estiver local, busca a sala instantaneamente na nuvem PlayFab
  await fetchX1RoomFromCloud(clean);

  // 3. Tenta entrar novamente após a sincronização da nuvem
  return joinX1Room(args);
}

/**
 * Updates live score / progress for a player in a Score-Race X1 match.
 */
export function updateX1PlayerProgress(args: {
  code: string;
  playerId: string;
  score: number;
  correct: number;
  wrong: number;
  finished?: boolean;
}): X1Room | null {
  const store = loadStore();
  const room = store.rooms[args.code];
  if (!room) return null;

  const isHost = room.host.playerId === args.playerId;
  const side = isHost ? room.host : room.guest;
  if (!side) return room;

  const now = Date.now();
  side.score = Math.max(0, args.score);
  side.correct = Math.max(0, args.correct);
  side.wrong = Math.max(0, args.wrong);
  if (args.finished) side.finished = true;
  side.updatedAt = now;

  if (room.guest) {
    room.blueShare = computeScoreRaceBlueShare(room.host.score, room.guest.score);
    if (room.host.finished && room.guest.finished && room.status !== "finished") {
      room.status = "finished";
      room.finishedAt = now;
      room.winnerId = resolveX1Winner(room);
      recordX1MatchFinished(room);
    }
  }

  store.rooms[args.code] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);
  return room;
}

/**
 * Submits a True/False answer in a 1v1 Robot Tug-of-War X1 match (`gameId === "rpg"`).
 */
export function submitX1RobotClashAnswer(args: {
  code: string;
  playerId: string;
  isCorrect: boolean;
}): { room: X1Room | null; isSuperHit: boolean; damageDealt: number } {
  const store = loadStore();
  const room = store.rooms[args.code];
  if (!room || !room.guest) {
    return { room: room ?? null, isSuperHit: false, damageDealt: 0 };
  }

  const role: "host" | "guest" = room.host.playerId === args.playerId ? "host" : "guest";
  const res = applyX1RobotBattleAnswer({
    room,
    role,
    isCorrect: args.isCorrect,
  });

  store.rooms[args.code] = res.room;
  saveStore(store);
  if (res.room.status === "finished") {
    recordX1MatchFinished(res.room);
  }
  void pushRoomToPlayFab(res.room);
  return res;
}

/**
 * Revela uma carta no tabuleiro do Campo Minado 1v1 no X1.
 * Se for bônus/mina: aplica imediatamente o efeito e passa o turno para o oponente.
 * Se for questão: coloca a carta em activeQuestion com 20 segundos de limite.
 */
export function openX1MinadoCard(args: {
  code: string;
  playerId: string;
  cardId: string;
}): { room: X1Room | null; error?: string } {
  const store = loadStore();
  const room = store.rooms[args.code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null, error: "Sala não está em jogo." };
  }
  const minado = room.minadoState;
  if (minado.currentTurnPlayerId !== args.playerId) {
    return { room, error: "Não é a sua vez de jogar!" };
  }
  if (minado.activeQuestion) {
    return { room, error: "Há uma pergunta em andamento para responder." };
  }
  if (minado.revealed[args.cardId]) {
    return { room, error: "Esta carta já foi revelada." };
  }

  const card = minado.board.find((c) => c.id === args.cardId);
  if (!card) return { room, error: "Carta não encontrada." };

  const isHost = room.host.playerId === args.playerId;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room, error: "Jogadores inválidos." };

  const now = Date.now();
  me.updatedAt = now;

  if (card.kind === "bonus") {
    // Carta Bônus ou Mina: aplica pontos imediatos e passa a vez
    me.score = Math.max(0, me.score + card.points);
    if (card.points >= 0) {
      me.correct += 1;
    } else {
      me.wrong += 1;
    }
    minado.revealed[card.id] = {
      openedBy: me.nick,
      openedAt: now,
      resultText: `${card.points > 0 ? "+" : ""}${card.points} pts (${card.points > 0 ? "Bônus" : "Mina!"})`,
    };
    minado.currentTurnPlayerId = opp.playerId;
    minado.turnStartedAt = now;

    // Se todas as 64 cartas foram abertas
    if (Object.keys(minado.revealed).length >= minado.board.length) {
      room.status = "finished";
      room.finishedAt = now;
      room.winnerId = resolveX1Winner(room);
      recordX1MatchFinished(room);
    }
  } else {
    // Pergunta (V/F, mistério ou forma): abre exclusivamente para o jogador ativo por 20s
    minado.activeQuestion = {
      cardId: card.id,
      openedBy: args.playerId,
      prompt: card.prompt,
      expr: card.expr,
      shape: card.shape,
      options: card.options,
      answer: card.answer,
      expiresAt: now + 20_000,
    };
  }

  store.rooms[room.code] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);
  return { room };
}

/**
 * Responde à questão ativa no Campo Minado 1v1.
 */
export function answerX1MinadoQuestion(args: {
  code: string;
  playerId: string;
  option: string;
}): { room: X1Room | null; isCorrect: boolean; error?: string } {
  const store = loadStore();
  const room = store.rooms[args.code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null, isCorrect: false, error: "Partida inválida." };
  }
  const minado = room.minadoState;
  const q = minado.activeQuestion;
  if (!q || q.openedBy !== args.playerId) {
    return { room, isCorrect: false, error: "Nenhuma questão ativa para você responder." };
  }

  const isHost = room.host.playerId === args.playerId;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room, isCorrect: false, error: "Jogadores inválidos." };

  const isCorrect = args.option === q.answer;
  const now = Date.now();
  me.updatedAt = now;

  if (isCorrect) {
    me.score += 5;
    me.correct += 1;
    minado.revealed[q.cardId] = {
      openedBy: me.nick,
      openedAt: now,
      resultText: "+5 pts (Correto!)",
    };
  } else {
    me.score = Math.max(0, me.score - 3);
    me.wrong += 1;
    minado.revealed[q.cardId] = {
      openedBy: me.nick,
      openedAt: now,
      resultText: "−3 pts (Incorreto)",
    };
  }

  minado.activeQuestion = null;
  minado.currentTurnPlayerId = opp.playerId;
  minado.turnStartedAt = now;

  if (Object.keys(minado.revealed).length >= minado.board.length) {
    room.status = "finished";
    room.finishedAt = now;
    room.winnerId = resolveX1Winner(room);
    recordX1MatchFinished(room);
  }

  store.rooms[room.code] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);
  return { room, isCorrect };
}

/**
 * Computa estouro de tempo (20s) na questão ativa do Campo Minado 1v1.
 */
export function timeoutX1MinadoQuestion(args: {
  code: string;
}): { room: X1Room | null } {
  const store = loadStore();
  const room = store.rooms[args.code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null };
  }
  const minado = room.minadoState;
  const q = minado.activeQuestion;
  if (!q) return { room };

  const isHost = room.host.playerId === q.openedBy;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room };

  const now = Date.now();
  me.score = Math.max(0, me.score - 3);
  me.wrong += 1;
  me.updatedAt = now;

  minado.revealed[q.cardId] = {
    openedBy: me.nick,
    openedAt: now,
    resultText: "−3 pts (Tempo Esgotado)",
  };

  minado.activeQuestion = null;
  minado.currentTurnPlayerId = opp.playerId;
  minado.turnStartedAt = now;

  if (Object.keys(minado.revealed).length >= minado.board.length) {
    room.status = "finished";
    room.finishedAt = now;
    room.winnerId = resolveX1Winner(room);
    recordX1MatchFinished(room);
  }

  store.rooms[room.code] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);
  return { room };
}

export function finishX1RoomByTimeout(code: string): X1Room | null {
  const store = loadStore();
  const room = store.rooms[code];
  if (!room) return null;
  if (room.status !== "finished") {
    room.status = "finished";
    room.finishedAt = Date.now();
    room.winnerId = resolveX1Winner(room);
    recordX1MatchFinished(room);
    store.rooms[code] = room;
    saveStore(store);
    void pushRoomToPlayFab(room);
  }
  return room;
}

export function closeX1Room(code: string) {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  delete store.rooms[clean];
  store.invites = store.invites.filter((i) => i.roomCode !== clean);
  saveStore(store);
  void syncX1WithPlayFabCloud();
}

/**
 * Desistência / Forfeit voluntário de partida ativa:
 * Concede vitória imediata por W.O. ao oponente e encerra a sala com log oficial.
 */
export function forfeitX1Match(code: string, forfeitingPlayerId: string): X1Room | null {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room) return null;

  // Determina o vencedor como o oponente
  let winnerId: string | null = null;
  if (room.host.playerId === forfeitingPlayerId) {
    winnerId = room.guest?.playerId ?? null;
  } else if (room.guest?.playerId === forfeitingPlayerId) {
    winnerId = room.host.playerId;
  }

  if (winnerId) {
    room.winnerId = winnerId;
    room.status = "finished";
    room.finishedAt = Date.now();
    room.autoCloseAt = Date.now() + X1_POST_MATCH_AUTOCLOSE_MS;
    recordX1MatchFinished(room);
    store.rooms[clean] = room;
    saveStore(store);
    void pushRoomToPlayFab(room);
    return room;
  } else {
    closeX1Room(clean);
    return null;
  }
}
