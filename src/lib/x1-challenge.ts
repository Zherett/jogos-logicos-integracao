// Arena de Desafio X1 Online (1v1 Versus Mode)
// Browser-safe state machine, room/presence synchronization (PlayFab SharedGroupData + BroadcastChannel + localStorage),
// deterministic room codes, and 1v1 Tug-of-War / Score-Race evaluation.

import { GAME_NAMES, type GameId } from "./game-storage.ts";
import {
  clearCachedAdminPlayFabTicket,
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

export type X1RoomStatus = "waiting" | "countdown" | "playing" | "finished" | "cancelled";

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
  cardIndex?: number;
  openedBy: string;
  prompt: string;
  question: string;
  expr?: string;
  shape?: Shape;
  options: string[];
  answer: string;
  expiresAt: number;
  answered?: boolean;
}

export interface X1MinadoState {
  board: MineCard[];
  revealed: Record<string, { openedBy: string; openedByRole?: "host" | "guest"; openedAt: number; resultText: string }>;
  currentTurnPlayerId: string;
  activeQuestion?: X1MinadoActiveQuestion | null;
  turnStartedAt: number;
}

export interface X1QuestionEntry {
  id: string;
  prompt: string;
  question: string;
  expr?: string;
  options: string[];
  answer: string;
  points: number;
}

export interface X1Room {
  code: string;
  gameId: GameId;
  status: X1RoomStatus;
  revision?: number;
  seed: number;
  createdAt: number;
  expiresAt?: number;
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
  deletedRooms?: Record<string, number>;
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
  for (let i = 0; i < 16; i++) {
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
      const prompt = `Quanto é ${pct}% de ${baseVal}?`;
      list.push({
        id: `q_pct_${seed}_${i}`,
        prompt,
        question: prompt,
        expr: `${pct}% de ${baseVal}`,
        options: shuffle([...opts]).map(String),
        answer: String(correctAns),
        points: 15,
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
      const expr = `${exprA} ${op} ${exprB} = ${shownVal}`;
      list.push({
        id: `q_log_${seed}_${i}`,
        prompt: "A igualdade abaixo é Verdadeira ou Falsa?",
        question: expr,
        expr,
        options: ["Verdadeiro", "Falso"],
        answer: isCorrectShown ? "Verdadeiro" : "Falso",
        points: 15,
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
    revision: (args.room.revision ?? 1) + 1,
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

let memoryStoreFallback: X1LobbyStore = {
  players: {},
  rooms: {},
  deletedRooms: {},
  invites: [],
  updatedAt: Date.now(),
};

function getRoomStatusRank(status: X1RoomStatus): number {
  switch (status) {
    case "waiting":
      return 1;
    case "countdown":
      return 2;
    case "playing":
      return 3;
    case "finished":
      return 4;
    case "cancelled":
      return 5;
    default:
      return 0;
  }
}

/**
 * Mescla de forma determinística e livre de conflito (CRDT) o estado local e remoto de uma sala X1.
 * Garante imunidade contra diferenças de relógio (clock skew) entre celulares/computadores diferentes.
 */
export function mergeX1RoomStates(local: X1Room | undefined, remote: X1Room, now = Date.now()): X1Room {
  if (!local) {
    const copy: X1Room = structuredClone(remote);
    if (copy.status === "countdown") {
      // Normaliza a contagem regressiva para o relógio deste aparelho se houver skew
      const rem = (copy.countdownEndsAt ?? 0) - now;
      if (rem <= 0 || rem > (X1_COUNTDOWN_DURATION_SEC + 2) * 1000) {
        copy.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
      }
    } else if (copy.status === "playing") {
      if (!copy.startedAt || Math.abs(now - copy.startedAt) > (copy.durationSec + 15) * 1000) {
        copy.startedAt = now;
      }
    }
    return copy;
  }

  const localRank = getRoomStatusRank(local.status);
  const remoteRank = getRoomStatusRank(remote.status);

  // 1. Se o estado remoto avançou de fase (ex: waiting -> countdown -> playing -> finished -> cancelled)
  if (remoteRank > localRank) {
    const merged: X1Room = structuredClone(remote);
    if (local.status === "waiting" && merged.status === "countdown") {
      // Anfitrião acabou de receber a entrada do Desafiante: garante os 10s sincronizados no relógio local
      const rem = (merged.countdownEndsAt ?? 0) - now;
      if (rem < 4_000 || rem > (X1_COUNTDOWN_DURATION_SEC + 2) * 1000) {
        merged.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
      }
    } else if (local.status !== "playing" && merged.status === "playing") {
      if (!merged.startedAt || Math.abs(now - merged.startedAt) > 15_000) {
        merged.startedAt = now;
      }
    }
    return merged;
  }

  // 2. Se o estado local já está em uma fase mais avançada que o remoto (ex: local já é playing e nuvem ainda é countdown)
  if (localRank > remoteRank) {
    const merged: X1Room = structuredClone(local);
    // Ainda assim, se o remoto trouxe dados do guest que faltavam, preserva o guest
    if (!merged.guest && remote.guest) {
      merged.guest = structuredClone(remote.guest);
    }
    return merged;
  }

  // 3. Mesma fase (ambos em waiting, countdown, playing ou finished)
  const localRev = local.revision ?? 1;
  const remoteRev = remote.revision ?? 1;
  const localTime = Math.max(local.host.updatedAt, local.guest?.updatedAt ?? 0, local.createdAt);
  const remoteTime = Math.max(remote.host.updatedAt, remote.guest?.updatedAt ?? 0, remote.createdAt);

  const remoteIsNewer = remoteRev > localRev || (remoteRev === localRev && remoteTime > localTime);
  const base: X1Room = structuredClone(remoteIsNewer ? remote : local);
  base.revision = Math.max(localRev, remoteRev);

  // Preserva o countdownEndsAt e startedAt locais para evitar saltos de relógio na mesma fase
  if (local.status === "countdown" && local.countdownEndsAt) {
    base.countdownEndsAt = local.countdownEndsAt;
  }
  if (local.status === "playing" && local.startedAt) {
    base.startedAt = local.startedAt;
  }

  if (base.status === "playing" && local.guest && remote.guest) {
    if (base.gameId === "logica" || base.gameId === "porcentagem") {
      // Na corrida de questões, cada jogador é autoritativo sobre seu próprio lado
      const localHostProgress = (local.host.correct + local.host.wrong) * 1000 + (local.host.currentQuestionIdx ?? 0);
      const remoteHostProgress = (remote.host.correct + remote.host.wrong) * 1000 + (remote.host.currentQuestionIdx ?? 0);
      base.host = structuredClone(remoteHostProgress > localHostProgress ? remote.host : local.host);

      const localGuestProgress = (local.guest.correct + local.guest.wrong) * 1000 + (local.guest.currentQuestionIdx ?? 0);
      const remoteGuestProgress = (remote.guest.correct + remote.guest.wrong) * 1000 + (remote.guest.currentQuestionIdx ?? 0);
      base.guest = structuredClone(remoteGuestProgress > localGuestProgress ? remote.guest : local.guest);

      base.blueShare = computeScoreRaceBlueShare(base.host.score, base.guest.score);
      if (base.host.finished && base.guest.finished) {
        base.status = "finished";
        base.finishedAt = base.finishedAt ?? now;
        base.winnerId = resolveX1Winner(base);
        recordX1MatchFinished(base);
      }
    } else if (base.gameId === "rpg") {
      // Na Batalha de Robôs, acertos/erros/pontos só crescem e HP só diminui (CRDT)
      const other = remoteIsNewer ? local : remote;
      const dHostCorrect = Math.max(0, other.host.correct - base.host.correct);
      const dHostWrong = Math.max(0, other.host.wrong - base.host.wrong);
      const dGuestCorrect = Math.max(0, (other.guest?.correct ?? 0) - (base.guest?.correct ?? 0));
      const dGuestWrong = Math.max(0, (other.guest?.wrong ?? 0) - (base.guest?.wrong ?? 0));

      const hostAnsweredMoreLocally =
        local.host.correct + local.host.wrong > remote.host.correct + remote.host.wrong;
      const guestAnsweredMoreLocally =
        local.guest.correct + local.guest.wrong > remote.guest.correct + remote.guest.wrong;

      base.host = structuredClone(hostAnsweredMoreLocally ? local.host : remote.host);
      base.guest = structuredClone(guestAnsweredMoreLocally ? local.guest : remote.guest);

      base.host.hp = Math.min(local.host.hp, remote.host.hp);
      base.guest.hp = Math.min(local.guest.hp, remote.guest.hp);
      base.host.score = Math.max(local.host.score, remote.host.score);
      base.guest.score = Math.max(local.guest.score, remote.guest.score);
      base.host.correct = Math.max(local.host.correct, remote.host.correct);
      base.guest.correct = Math.max(local.guest.correct, remote.guest.correct);
      base.host.wrong = Math.max(local.host.wrong, remote.host.wrong);
      base.guest.wrong = Math.max(local.guest.wrong, remote.guest.wrong);

      // Aplica o deslocamento da barra de Cabo de Guerra caso ambos tenham respondido simultaneamente
      const shareDelta =
        dHostCorrect * 12 - dHostWrong * 8 - dGuestCorrect * 12 + dGuestWrong * 8;
      if (shareDelta !== 0) {
        base.blueShare = Math.max(0, Math.min(100, base.blueShare + shareDelta));
      }

      if (base.host.hp <= 0 || base.guest.hp <= 0) {
        base.status = "finished";
        base.finishedAt = base.finishedAt ?? now;
        base.winnerId = base.host.hp <= 0 ? base.guest.playerId : base.host.playerId;
        base.blueShare = base.host.hp <= 0 ? 0 : 100;
        recordX1MatchFinished(base);
      }
    } else if (base.gameId === "minado" && local.minadoState && remote.minadoState) {
      // No Campo Minado por turnos, vence o estado com mais cartas reveladas ou maior revisão
      const localRevCards = Object.keys(local.minadoState.revealed).length;
      const remoteRevCards = Object.keys(remote.minadoState.revealed).length;
      if (remoteRevCards > localRevCards || (remoteRevCards === localRevCards && remoteIsNewer)) {
        base.minadoState = structuredClone(remote.minadoState);
        base.host = structuredClone(remote.host);
        base.guest = structuredClone(remote.guest);
      } else {
        base.minadoState = structuredClone(local.minadoState);
        base.host = structuredClone(local.host);
        base.guest = structuredClone(local.guest);
      }
    }
  }

  return base;
}

function loadStore(): X1LobbyStore {
  const empty: X1LobbyStore = {
    players: {},
    rooms: {},
    deletedRooms: {},
    invites: [],
    updatedAt: Date.now(),
  };
  if (typeof window === "undefined") {
    // Em ambiente Node (testes), também aplica limpeza de expiração e salas deletadas
    const now = Date.now();
    const deletedRooms: Record<string, number> = {};
    for (const [c, ts] of Object.entries(memoryStoreFallback.deletedRooms ?? {})) {
      if (now - ts < 15 * 60_000) deletedRooms[c] = ts;
    }
    const rooms: Record<string, X1Room> = {};
    for (const [code, r] of Object.entries(memoryStoreFallback.rooms ?? {})) {
      if (deletedRooms[code] || r.status === "cancelled") continue;
      const expiresAt = r.expiresAt ?? r.createdAt + X1_ROOM_EXPIRATION_MS;
      if (r.status === "waiting" && now >= expiresAt) continue;
      if (r.status === "finished" && r.autoCloseAt && now >= r.autoCloseAt) continue;
      if (r.status === "countdown" && r.countdownEndsAt && now >= r.countdownEndsAt) {
        r.status = "playing";
        r.startedAt = r.startedAt ?? now;
        r.revision = (r.revision ?? 1) + 1;
      }
      rooms[code] = r;
    }
    memoryStoreFallback.deletedRooms = deletedRooms;
    memoryStoreFallback.rooms = rooms;
    return memoryStoreFallback;
  }

  try {
    const raw = window.localStorage.getItem(X1_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<X1LobbyStore>;
    const now = Date.now();

    // Retain players up to 10 minutes (matching PRESENCE_IDLE_MAX_AGE_MS)
    const players: Record<string, X1OnlinePlayer> = {};
    for (const [id, p] of Object.entries(parsed.players ?? {})) {
      if (now - p.lastSeenAt <= 10 * 60_000) players[id] = p;
    }

    // Retain deleted room tombstones up to 15 minutes so PlayFab never resurrects cancelled rooms
    const deletedRooms: Record<string, number> = {};
    for (const [code, deletedAt] of Object.entries(parsed.deletedRooms ?? {})) {
      if (now - deletedAt < 15 * 60_000) {
        deletedRooms[code] = deletedAt;
      }
    }

    const rooms: Record<string, X1Room> = {};
    for (const [code, r] of Object.entries(parsed.rooms ?? {})) {
      // 0. Ignora salas canceladas ou registradas no tombstone de exclusão
      if (deletedRooms[code] || r.status === "cancelled") {
        deletedRooms[code] = deletedRooms[code] ?? now;
        continue;
      }
      // 1. Expira salas de espera não iniciadas após 2 minutos
      const expiresAt = r.expiresAt ?? (r.createdAt + X1_ROOM_EXPIRATION_MS);
      if (r.status === "waiting" && now >= expiresAt) {
        deletedRooms[code] = now;
        continue;
      }
      // 2. Limpa salas concluídas após 1 minuto de encerramento
      if (r.status === "finished" && r.autoCloseAt && now >= r.autoCloseAt) {
        deletedRooms[code] = now;
        continue;
      }
      // 3. Fallback de descarte após 15 minutos
      if (now - r.createdAt < 15 * 60_000) {
        // Transição automática da contagem regressiva para jogo ativo
        if (r.status === "countdown" && r.countdownEndsAt && now >= r.countdownEndsAt) {
          r.status = "playing";
          r.startedAt = r.startedAt ?? now;
          r.revision = (r.revision ?? 1) + 1;
        }
        rooms[code] = r;
      }
    }

    const invites = (parsed.invites ?? []).filter(
      (inv) =>
        now - inv.createdAt < 120_000 &&
        !deletedRooms[inv.roomCode] &&
        (rooms[inv.roomCode]?.status === "waiting" || inv.status === "rejected"),
    );

    return { players, rooms, deletedRooms, invites, updatedAt: parsed.updatedAt ?? now };
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

const createdSharedGroups = new Set<string>();
let inFlightCloudSyncPromise: Promise<void> | null = null;
let queuedSyncRoomCode: string | null | undefined = undefined;
let lastLobbyCloudSyncAt = 0;

async function callPlayFabSharedGroup(
  endpoint: string,
  body: Record<string, unknown>,
  allowRetry = true,
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
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      error?: string;
      errorCode?: number;
    };

    if ((!res.ok || json.error) && allowRetry) {
      const errName = String(json.error ?? "");
      // Renova ticket ADM se expirou ou ficou inválido
      if (
        res.status === 401 ||
        errName.includes("NotAuthenticated") ||
        errName.includes("InvalidSessionTicket") ||
        errName.includes("NotAuthorized")
      ) {
        clearCachedAdminPlayFabTicket();
        const freshTicket = await getAdminPlayFabTicket();
        if (freshTicket) {
          return callPlayFabSharedGroup(endpoint, body, false);
        }
      }
      // Se tentou atualizar um SharedGroup ainda não criado, cria e tenta de novo
      if (
        endpoint === "UpdateSharedGroupData" &&
        typeof body.SharedGroupId === "string" &&
        (errName.includes("SharedGroup") || errName.includes("InvalidParams") || res.status === 400)
      ) {
        createdSharedGroups.delete(body.SharedGroupId);
        await ensureSharedGroupExists(body.SharedGroupId);
        return callPlayFabSharedGroup(endpoint, body, false);
      }
    }

    return json.data ?? null;
  } catch {
    return null;
  }
}

async function ensureSharedGroupExists(groupId: string): Promise<void> {
  if (createdSharedGroups.has(groupId)) return;
  await callPlayFabSharedGroup("CreateSharedGroup", { SharedGroupId: groupId }, false);
  createdSharedGroups.add(groupId);
}

async function runSyncX1WithPlayFabCloud(activeRoomCode?: string | null): Promise<void> {
  if (!isPlayFabConfigured()) return;

  let activeRoomStatus: X1RoomStatus | null = null;

  // 1. Prioridade máxima: se há uma sala ativa (espera, contagem ou partida), sincroniza seu SharedGroup primeiro
  if (activeRoomCode) {
    const cleanCode = activeRoomCode.trim().toUpperCase();
    const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string }> } | null;

    // Recarrega o store APÓS o await para nunca sobrescrever ações locais feitas durante a requisição
    const storeAfterRoom = loadStore();
    storeAfterRoom.deletedRooms = storeAfterRoom.deletedRooms ?? {};
    let roomChanged = false;
    let shouldPushMergedBack = false;
    let roomToPush: X1Room | null = null;

    if (remoteRoomData?.Data?.Room?.Value) {
      try {
        const remoteRoom = JSON.parse(remoteRoomData.Data.Room.Value) as X1Room;
        if (remoteRoom.status === "cancelled" || storeAfterRoom.deletedRooms[cleanCode]) {
          if (storeAfterRoom.rooms[cleanCode]) {
            delete storeAfterRoom.rooms[cleanCode];
            roomChanged = true;
          }
          storeAfterRoom.deletedRooms[cleanCode] =
            storeAfterRoom.deletedRooms[cleanCode] ?? Date.now();
          activeRoomStatus = "cancelled";
        } else {
          const localRoom = storeAfterRoom.rooms[cleanCode];
          const merged = mergeX1RoomStates(localRoom, remoteRoom);
          activeRoomStatus = merged.status;
          if (!localRoom || JSON.stringify(localRoom) !== JSON.stringify(merged)) {
            storeAfterRoom.rooms[cleanCode] = merged;
            roomChanged = true;
          }
          if (
            localRoom &&
            ((localRoom.revision ?? 1) > (remoteRoom.revision ?? 1) ||
              JSON.stringify(merged) !== JSON.stringify(remoteRoom))
          ) {
            shouldPushMergedBack = true;
            roomToPush = merged;
          }
        }
      } catch {
        /* ignore */
      }
    } else if (storeAfterRoom.rooms[cleanCode] && !storeAfterRoom.deletedRooms[cleanCode]) {
      // Sala existe localmente mas ainda não foi gravada no SharedGroup da nuvem: envia agora
      shouldPushMergedBack = true;
      roomToPush = storeAfterRoom.rooms[cleanCode];
      activeRoomStatus = roomToPush.status;
    }

    if (roomChanged) {
      saveStore(storeAfterRoom);
    }

    if (shouldPushMergedBack && roomToPush) {
      await ensureSharedGroupExists(roomGroupId);
      await callPlayFabSharedGroup("UpdateSharedGroupData", {
        SharedGroupId: roomGroupId,
        Data: { Room: JSON.stringify(roomToPush) },
        Permission: "Public",
      });
    }
  }

  // Durante partida ativa ("playing"), evita trafegar o LobbySnapshot global a cada 1.2s (sincroniza o lobby a cada 8s)
  const nowCheck = Date.now();
  if (activeRoomCode && activeRoomStatus === "playing" && nowCheck - lastLobbyCloudSyncAt < 8_000) {
    return;
  }
  lastLobbyCloudSyncAt = nowCheck;

  // 2. Sincroniza o Lobby SharedGroup geral
  await ensureSharedGroupExists(LOBBY_SHARED_GROUP_ID);

  const remoteLobby = (await callPlayFabSharedGroup("GetSharedGroupData", {
    SharedGroupId: LOBBY_SHARED_GROUP_ID,
  })) as { Data?: Record<string, { Value: string; LastUpdated?: string }> } | null;

  // Recarrega o store imediatamente após o await para preservar qualquer mudança local recente
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  let changed = false;

  if (remoteLobby?.Data?.LobbySnapshot?.Value) {
    try {
      const remoteStore = JSON.parse(remoteLobby.Data.LobbySnapshot.Value) as Partial<X1LobbyStore>;
      const now = Date.now();

      // Mescla tombstones de salas canceladas/deletadas para nunca ressuscitá-las
      for (const [delCode, delAt] of Object.entries(remoteStore.deletedRooms ?? {})) {
        if (now - delAt < 15 * 60_000) {
          if (!store.deletedRooms[delCode] || delAt > store.deletedRooms[delCode]) {
            store.deletedRooms[delCode] = delAt;
            changed = true;
          }
          if (store.rooms[delCode]) {
            delete store.rooms[delCode];
            changed = true;
          }
        }
      }

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
        if (store.deletedRooms[code] || r.status === "cancelled") {
          store.deletedRooms[code] = store.deletedRooms[code] ?? now;
          if (store.rooms[code]) {
            delete store.rooms[code];
            changed = true;
          }
          continue;
        }

        const expiresAt = r.expiresAt ?? (r.createdAt + X1_ROOM_EXPIRATION_MS);
        if (r.status === "waiting" && now >= expiresAt) {
          store.deletedRooms[code] = now;
          continue;
        }
        if (r.status === "finished" && r.autoCloseAt && now >= r.autoCloseAt) {
          store.deletedRooms[code] = now;
          continue;
        }

        if (now - r.createdAt < 15 * 60_000) {
          const local = store.rooms[code];
          const merged = mergeX1RoomStates(local, r, now);
          if (!local || JSON.stringify(local) !== JSON.stringify(merged)) {
            store.rooms[code] = merged;
            changed = true;
          }
        }
      }

      // Mescla convites diretos entre dispositivos (incluindo notificações de recusa)
      if (Array.isArray(remoteStore.invites)) {
        const localById = new Map(store.invites.map((i) => [i.id, i]));
        for (const rInv of remoteStore.invites) {
          if (!rInv || !rInv.id || now - rInv.createdAt >= 120_000) continue;
          if (store.deletedRooms[rInv.roomCode]) continue;
          const existing = localById.get(rInv.id);
          if (!existing) {
            if (store.rooms[rInv.roomCode]?.status === "waiting" || rInv.status === "rejected") {
              localById.set(rInv.id, rInv);
              changed = true;
            }
          } else if (rInv.status === "rejected" && existing.status !== "rejected") {
            existing.status = "rejected";
            existing.rejectedByNick = rInv.rejectedByNick;
            changed = true;
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("desafios:x1-invite-rejected", {
                  detail: {
                    inviteId: rInv.id,
                    roomCode: rInv.roomCode,
                    rejectedByNick: rInv.rejectedByNick || "O jogador convidado",
                  },
                }),
              );
            }
          }
        }
        store.invites = Array.from(localById.values()).filter(
          (inv) =>
            now - inv.createdAt < 120_000 &&
            !store.deletedRooms?.[inv.roomCode] &&
            (store.rooms[inv.roomCode]?.status === "waiting" || inv.status === "rejected"),
        );
      }
    } catch {
      /* ignore */
    }
  }

  if (changed) {
    saveStore(store);
  }

  // Push merged snapshot (usando o store mais recente para nunca sobrescrever ações concorrentes)
  const latestStore = loadStore();
  await callPlayFabSharedGroup("UpdateSharedGroupData", {
    SharedGroupId: LOBBY_SHARED_GROUP_ID,
    Data: {
      LobbySnapshot: JSON.stringify({
        players: latestStore.players,
        rooms: latestStore.rooms,
        deletedRooms: latestStore.deletedRooms,
        invites: latestStore.invites,
      }),
    },
    Permission: "Public",
  });
}

export async function syncX1WithPlayFabCloud(activeRoomCode?: string | null): Promise<void> {
  if (!isPlayFabConfigured()) return;
  if (inFlightCloudSyncPromise) {
    // Enfileira o código prioritário se chegar enquanto uma sincronização já está em voo
    if (activeRoomCode || queuedSyncRoomCode === undefined) {
      queuedSyncRoomCode = activeRoomCode ?? null;
    }
    return inFlightCloudSyncPromise;
  }

  inFlightCloudSyncPromise = (async () => {
    try {
      await runSyncX1WithPlayFabCloud(activeRoomCode);
      while (queuedSyncRoomCode !== undefined) {
        const nextCode = queuedSyncRoomCode;
        queuedSyncRoomCode = undefined;
        await runSyncX1WithPlayFabCloud(nextCode);
      }
    } finally {
      inFlightCloudSyncPromise = null;
    }
  })();

  return inFlightCloudSyncPromise;
}

async function pushRoomToPlayFab(room: X1Room): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const roomGroupId = `x1_room_${room.code.toLowerCase()}`;
  await ensureSharedGroupExists(roomGroupId);
  const latestRoom = getX1Room(room.code) ?? room;
  await callPlayFabSharedGroup("UpdateSharedGroupData", {
    SharedGroupId: roomGroupId,
    Data: { Room: JSON.stringify(latestRoom) },
    Permission: "Public",
  });
  // Sincroniza o lobby imediatamente quando a sala é criada, inicia contagem ou encerra
  if (latestRoom.status !== "playing") {
    lastLobbyCloudSyncAt = 0;
  }
  await syncX1WithPlayFabCloud(room.code);
}

async function pushCancelledRoomToPlayFab(code: string, previousRoom?: X1Room): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const clean = code.trim().toUpperCase();
  const roomGroupId = `x1_room_${clean.toLowerCase()}`;
  if (previousRoom) {
    const tombstone: X1Room = {
      ...previousRoom,
      status: "cancelled",
      revision: (previousRoom.revision ?? 1) + 100,
      finishedAt: Date.now(),
    };
    await ensureSharedGroupExists(roomGroupId);
    await callPlayFabSharedGroup("UpdateSharedGroupData", {
      SharedGroupId: roomGroupId,
      Data: { Room: JSON.stringify(tombstone) },
      Permission: "Public",
    });
  }
  lastLobbyCloudSyncAt = 0;
  await syncX1WithPlayFabCloud();
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

  // Nunca exibe a sala criada pelo próprio jogador como disponível para ele mesmo entrar
  const openRooms = Object.values(store.rooms)
    .filter(
      (r) =>
        r.status === "waiting" &&
        !store.deletedRooms?.[r.code] &&
        (!currentPlayerId || r.host.playerId !== currentPlayerId),
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const activeMatches = Object.values(store.rooms)
    .filter((r) => r.status === "playing" || r.status === "countdown")
    .sort((a, b) => b.createdAt - a.createdAt);

  const myInvites = currentPlayerId
    ? store.invites.filter(
        (inv) =>
          inv.toPlayerId === currentPlayerId &&
          (!inv.status || inv.status === "pending") &&
          !store.deletedRooms?.[inv.roomCode] &&
          store.rooms[inv.roomCode]?.status === "waiting",
      )
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
  const room = store.rooms[clean];
  if (!room || room.status === "cancelled" || store.deletedRooms?.[clean]) return null;
  return room;
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
  store.deletedRooms = store.deletedRooms ?? {};
  const now = Date.now();

  // Destrói imediatamente qualquer sala anterior em espera que este mesmo anfitrião tenha deixado aberta
  for (const [oldCode, oldRoom] of Object.entries(store.rooms)) {
    if (oldRoom.host.playerId === args.host.playerId && oldRoom.status === "waiting") {
      store.deletedRooms[oldCode] = now;
      delete store.rooms[oldCode];
      store.invites = store.invites.filter((inv) => inv.roomCode !== oldCode);
      void pushCancelledRoomToPlayFab(oldCode, oldRoom);
    }
  }

  const existingAndDeleted = [
    ...Object.keys(store.rooms),
    ...Object.keys(store.deletedRooms),
  ];
  const code = generateRoomCode(existingAndDeleted);
  const seed = Math.floor(Math.random() * 1_000_000);

  const room: X1Room = {
    code,
    gameId: args.gameId,
    status: "waiting",
    revision: 1,
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
    lastLobbyCloudSyncAt = 0;
    void syncX1WithPlayFabCloud(inv.roomCode);
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
  if (!clean) return false;
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const room = store.rooms[clean];
  if (!room) {
    store.deletedRooms[clean] = Date.now();
    saveStore(store);
    return false;
  }
  if (hostPlayerId && room.host.playerId !== hostPlayerId) return false;
  // Não cancela se um desafiante já entrou e iniciou contagem/partida
  if (room.status !== "waiting") return false;

  store.deletedRooms[clean] = Date.now();
  delete store.rooms[clean];
  store.invites = store.invites.filter((inv) => inv.roomCode !== clean);
  saveStore(store);
  void pushCancelledRoomToPlayFab(clean, room);
  return true;
}

/**
 * Cancela imediatamente qualquer sala em espera ("waiting") pertencente ao jogador informado.
 * Usado quando o jogador não está na tela de espera do código, garantindo que nenhuma sala órfã permaneça aberta.
 */
export function cancelAllWaitingRoomsForHost(hostPlayerId: string): number {
  if (!hostPlayerId) return 0;
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const now = Date.now();
  let count = 0;

  for (const [code, room] of Object.entries(store.rooms)) {
    if (room.host.playerId === hostPlayerId && room.status === "waiting") {
      store.deletedRooms[code] = now;
      delete store.rooms[code];
      store.invites = store.invites.filter((inv) => inv.roomCode !== code);
      void pushCancelledRoomToPlayFab(code, room);
      count++;
    }
  }

  if (count > 0) {
    saveStore(store);
  }
  return count;
}

export function joinX1Room(args: {
  code: string;
  guest: { playerId: string; nick: string; school: string; level: number; isBot?: boolean };
}): { room: X1Room | null; error: string | null } {
  const clean = args.code.trim().toUpperCase();
  const store = loadStore();
  if (store.deletedRooms?.[clean]) {
    return { room: null, error: "Esta sala foi desfeita pelo criador." };
  }
  const room = store.rooms[clean];

  if (!room || room.status === "cancelled") {
    return { room: null, error: "Sala não encontrada, cancelada ou expirada (limite de 2 minutos)." };
  }
  if (room.host.playerId === args.guest.playerId) {
    return {
      room: null,
      error: "Você não pode entrar na própria sala que criou! Permaneça na tela de espera aguardando um colega.",
    };
  }
  if (room.guest && room.guest.playerId !== args.guest.playerId && room.status !== "waiting") {
    return { room: null, error: "Esta sala já está cheia (2/2) e em andamento." };
  }

  const now = Date.now();
  room.revision = (room.revision ?? 1) + 10;
  room.host.updatedAt = Math.max(room.host.updatedAt, now);
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
  room.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
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
      turnStartedAt: now + X1_COUNTDOWN_DURATION_SEC * 1000,
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
 * Transiciona explicitamente uma sala de "countdown" para "playing" e sincroniza na nuvem.
 */
export function startX1MatchAfterCountdown(code: string): X1Room | null {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room) return null;
  if (room.status === "countdown") {
    const now = Date.now();
    room.status = "playing";
    room.startedAt = room.startedAt ?? now;
    room.revision = (room.revision ?? 1) + 1;
    store.rooms[clean] = room;
    saveStore(store);
    void pushRoomToPlayFab(room);
  }
  return room;
}

/**
 * Procura e baixa o estado atualizado de uma sala na nuvem PlayFab (por código).
 */
export async function fetchX1RoomFromCloud(code: string): Promise<X1Room | null> {
  const clean = code.trim().toUpperCase();
  if (!clean || !isPlayFabConfigured()) return null;

  const roomGroupId = `x1_room_${clean.toLowerCase()}`;

  // 1. Consulta o SharedGroup direto da sala
  try {
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string }> } | null;

    if (remoteRoomData?.Data?.Room?.Value) {
      const remoteRoom = JSON.parse(remoteRoomData.Data.Room.Value) as X1Room;
      const store = loadStore();
      store.deletedRooms = store.deletedRooms ?? {};
      if (remoteRoom.status === "cancelled" || store.deletedRooms[clean]) {
        store.deletedRooms[clean] = store.deletedRooms[clean] ?? Date.now();
        delete store.rooms[clean];
        saveStore(store);
        return null;
      }
      const merged = mergeX1RoomStates(store.rooms[clean], remoteRoom);
      store.rooms[clean] = merged;
      saveStore(store);
      return merged;
    }
  } catch {
    /* ignore */
  }

  // 2. Consulta o snapshot geral do Lobby da nuvem
  lastLobbyCloudSyncAt = 0;
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

  // Bloqueio imediato se a sala local for do próprio jogador
  const localCheck = getX1Room(clean);
  if (localCheck && localCheck.host.playerId === args.guest.playerId) {
    return {
      room: null,
      error: "Você não pode entrar na própria sala que criou! Permaneça na tela de espera aguardando um colega.",
    };
  }

  // Sincroniza estado mais recente da nuvem PlayFab (verifica se o anfitrião não cancelou a sala)
  if (isPlayFabConfigured()) {
    await fetchX1RoomFromCloud(clean);
  }

  const res = joinX1Room(args);
  if (res.room && isPlayFabConfigured()) {
    await pushRoomToPlayFab(res.room);
  }
  return res;
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
  currentQuestionIdx?: number;
  finished?: boolean;
}): X1Room | null {
  const store = loadStore();
  const room = store.rooms[args.code];
  if (!room) return null;

  const isHost = room.host.playerId === args.playerId;
  const side = isHost ? room.host : room.guest;
  if (!side) return room;

  const now = Date.now();
  room.revision = (room.revision ?? 1) + 1;
  side.score = Math.max(0, Number.isFinite(args.score) ? args.score : side.score);
  side.correct = Math.max(0, args.correct);
  side.wrong = Math.max(0, args.wrong);
  if (args.currentQuestionIdx !== undefined) {
    side.currentQuestionIdx = args.currentQuestionIdx;
  }
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
export function openX1MinadoCard(
  codeOrArgs: string | { code: string; playerId: string; cardId: string },
  maybePlayerId?: string,
  maybeCardIdOrIdx?: string | number,
): { room: X1Room | null; error?: string } {
  const code = typeof codeOrArgs === "string" ? codeOrArgs : codeOrArgs.code;
  const playerId = typeof codeOrArgs === "string" ? (maybePlayerId ?? "") : codeOrArgs.playerId;
  const store = loadStore();
  const room = store.rooms[code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null, error: "Sala não está em jogo." };
  }
  const minado = room.minadoState;
  const cardId =
    typeof codeOrArgs === "string"
      ? typeof maybeCardIdOrIdx === "number"
        ? (minado.board[maybeCardIdOrIdx]?.id ?? `c${maybeCardIdOrIdx}`)
        : String(maybeCardIdOrIdx ?? "")
      : codeOrArgs.cardId;

  if (minado.currentTurnPlayerId !== playerId) {
    return { room, error: "Não é a sua vez de jogar!" };
  }
  if (minado.activeQuestion && !minado.activeQuestion.answered) {
    return { room, error: "Há uma pergunta em andamento para responder." };
  }
  if (minado.revealed[cardId]) {
    return { room, error: "Esta carta já foi revelada." };
  }

  const cardIdx = minado.board.findIndex((c) => c.id === cardId);
  const card = cardIdx >= 0 ? minado.board[cardIdx] : undefined;
  if (!card) return { room, error: "Carta não encontrada." };

  const isHost = room.host.playerId === playerId;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room, error: "Jogadores inválidos." };

  const now = Date.now();
  room.revision = (room.revision ?? 1) + 1;
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
      openedByRole: isHost ? "host" : "guest",
      openedAt: now,
      resultText: `${card.points > 0 ? "+" : ""}${card.points} pts (${card.points > 0 ? "Bônus" : "Mina!"})`,
    };
    minado.currentTurnPlayerId = opp.playerId;
    minado.turnStartedAt = now;

    if (Object.keys(minado.revealed).length >= minado.board.length) {
      room.status = "finished";
      room.finishedAt = now;
      room.winnerId = resolveX1Winner(room);
      recordX1MatchFinished(room);
    }
  } else {
    // Pergunta (V/F, mistério ou forma): abre exclusivamente para o jogador ativo por 20s
    const displayQ = card.expr ? `${card.prompt} (${card.expr})` : card.prompt;
    minado.activeQuestion = {
      cardId: card.id,
      cardIndex: cardIdx,
      openedBy: playerId,
      prompt: card.prompt,
      question: displayQ,
      expr: card.expr,
      shape: card.shape,
      options: card.options,
      answer: card.answer,
      expiresAt: now + 20_000,
      answered: false,
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
export function answerX1MinadoQuestion(
  codeOrArgs: string | { code: string; playerId: string; option: string },
  maybePlayerId?: string,
  maybeOption?: string,
): { room: X1Room | null; isCorrect: boolean; error?: string } {
  const code = typeof codeOrArgs === "string" ? codeOrArgs : codeOrArgs.code;
  const playerId = typeof codeOrArgs === "string" ? (maybePlayerId ?? "") : codeOrArgs.playerId;
  const option = typeof codeOrArgs === "string" ? (maybeOption ?? "") : codeOrArgs.option;

  const store = loadStore();
  const room = store.rooms[code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null, isCorrect: false, error: "Partida inválida." };
  }
  const minado = room.minadoState;
  const q = minado.activeQuestion;
  if (!q || q.openedBy !== playerId) {
    return { room, isCorrect: false, error: "Nenhuma questão ativa para você responder." };
  }

  const isHost = room.host.playerId === playerId;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room, isCorrect: false, error: "Jogadores inválidos." };

  const isCorrect = option === q.answer;
  const now = Date.now();
  room.revision = (room.revision ?? 1) + 1;
  me.updatedAt = now;

  if (isCorrect) {
    me.score += 5;
    me.correct += 1;
    minado.revealed[q.cardId] = {
      openedBy: me.nick,
      openedByRole: isHost ? "host" : "guest",
      openedAt: now,
      resultText: "+5 pts (Correto!)",
    };
  } else {
    me.score = Math.max(0, me.score - 3);
    me.wrong += 1;
    minado.revealed[q.cardId] = {
      openedBy: me.nick,
      openedByRole: isHost ? "host" : "guest",
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
export function timeoutX1MinadoQuestion(
  codeOrArgs: string | { code: string },
): { room: X1Room | null } {
  const code = typeof codeOrArgs === "string" ? codeOrArgs : codeOrArgs.code;
  const store = loadStore();
  const room = store.rooms[code.trim().toUpperCase()];
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
  room.revision = (room.revision ?? 1) + 1;
  me.score = Math.max(0, me.score - 3);
  me.wrong += 1;
  me.updatedAt = now;

  minado.revealed[q.cardId] = {
    openedBy: me.nick,
    openedByRole: isHost ? "host" : "guest",
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
    room.revision = (room.revision ?? 1) + 10;
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
  store.deletedRooms = store.deletedRooms ?? {};
  const prev = store.rooms[clean];
  store.deletedRooms[clean] = Date.now();
  delete store.rooms[clean];
  store.invites = store.invites.filter((i) => i.roomCode !== clean);
  saveStore(store);
  void pushCancelledRoomToPlayFab(clean, prev);
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
    room.revision = (room.revision ?? 1) + 20;
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
