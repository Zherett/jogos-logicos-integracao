// Arena de Desafio X1 Online (1v1 Versus Mode)
// Browser-safe state machine, room/presence synchronization (PlayFab SharedGroupData + BroadcastChannel + localStorage),
// deterministic room codes, and 1v1 Tug-of-War / Score-Race evaluation.

import { GAME_NAMES, type GameId } from "./game-storage.ts";
import {
  sanitizeX1AvailableGames,
  sanitizeX1MinadoGridSize,
  X1_SUPPORTED_GAME_IDS,
  type X1MinadoGridSize,
} from "./game-codes.ts";
import type { PlayerAvatarConfig } from "./avatar.ts";
import {
  clearCachedAdminPlayFabTicket,
  clearExpiredStoredSessionTicket,
  getAdminPlayFabTicket,
  getPlayFabTitleId,
  getViewerPlayFabTicket,
  isPlayFabConfigured,
  loadStoredSession,
} from "./playfab.ts";
import { isAdminOrTestAccount, type AgeStageId } from "./player-profile.ts";
import { type Shape } from "./shapes-content.ts";
import {
  GENERAL_SHAPES,
  type MineCard,
  type QuestionCard,
  type BonusCard,
} from "./minefield-content.ts";

const X1_STORAGE_KEY = "desafios-x1-lobby-state-v1";
const X1_CHANNEL_NAME = "desafios-x1-broadcast-v1";
const LOBBY_SHARED_GROUP_ID = "X1_LOBBY_SEMED_V2";

export const X1_MATCH_DURATION_SEC = 90;
export const X1_RPG_MATCH_DURATION_SEC = 300; // 5 minutos máximo na Batalha de Robôs
export const X1_MINADO_MATCH_DURATION_SEC = 0; // Campo Minado sem tempo limite total
export const X1_MATCH_DISCONNECT_TIMEOUT_MS = 45_000; // 45s sem pulso na partida -> W.O.
export const X1_ROBOT_INITIAL_HP = 5; // 5 Vidas na Batalha dos Robôs
export { X1_SUPPORTED_GAME_IDS, sanitizeX1AvailableGames, sanitizeX1MinadoGridSize, type X1MinadoGridSize };

export function getX1DurationForGame(gameId: GameId): number {
  if (gameId === "minado") return X1_MINADO_MATCH_DURATION_SEC;
  if (gameId === "rpg") return X1_RPG_MATCH_DURATION_SEC;
  return X1_MATCH_DURATION_SEC;
}
export const X1_ROOM_EXPIRATION_MS = 120_000; // Sala de espera expira em 2 minutos se ninguém entrar
export const X1_POST_MATCH_AUTOCLOSE_MS = 60_000; // Sala fechada e apagada em 1 minuto pós-partida
export const X1_COUNTDOWN_DURATION_SEC = 10; // 10 segundos de contagem regressiva sincronizada
export const X1_MINADO_TURN_SELECT_TIMEOUT_SEC = 25; // 25s para escolher uma carta no Campo Minado 1v1
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
  lastSeenServerMs?: number; // epoch ms calibrado no relógio UTC do PlayFab
  lastActiveAt?: number; // epoch ms
  /** Timestamp local de quando o pulso deste jogador foi observado/recebido (imune a skew de relógio) */
  receivedAt?: number;
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
  /** Timestamp oficial UTC do servidor PlayFab no instante em que o jogador completou todas as questões (nunca sobrescrito por heartbeat) */
  finishedAtServerMs?: number | null;
  currentQuestionIdx?: number;
  updatedAt: number;
  lastSeenAt?: number;
  avatar?: PlayerAvatarConfig;
}

export interface X1ChallengeInvite {
  id: string;
  roomCode: string;
  fromPlayerId?: string;
  fromNick: string;
  fromSchool: string;
  toPlayerId: string;
  toNick?: string;
  gameId: GameId;
  createdAt: number;
  status?: "pending" | "accepted" | "rejected";
  rejectedByNick?: string;
}

export type X1DirectInvite = X1ChallengeInvite;

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
  /** Deadline oficial no relógio UTC do servidor PlayFab (20s) */
  expiresAtServerMs?: number;
  answered?: boolean;
}

export interface X1MinadoState {
  gridSize?: X1MinadoGridSize;
  board: MineCard[];
  revealed: Record<string, { openedBy: string; openedByRole?: "host" | "guest"; openedAt: number; resultText: string }>;
  currentTurnPlayerId: string;
  activeQuestion?: X1MinadoActiveQuestion | null;
  turnStartedAt: number;
  /** Início do turno no relógio UTC do servidor PlayFab */
  turnStartedAtServerMs?: number;
  /** Contador monotônico de turnos/ações para impedir conflitos na mesclagem de timeout de 25s */
  turnSeq?: number;
}

export interface X1RpgEvent {
  id: string;
  role: "host" | "guest";
  seq: number;
  isCorrect: boolean;
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
  /** Handshake de prontidão: ambos confirmam presença antes de disparar o cronômetro simultâneo */
  hostReady?: boolean;
  guestReady?: boolean;
  /** Momento oficial UTC em que o desafiante entrou (fallback de segurança caso o host demore) */
  guestJoinedAtServerMs?: number | null;
  countdownEndsAt?: number | null;
  /** Timestamp absoluto UTC do servidor PlayFab para término simultâneo da contagem (0 = VAI!) */
  countdownEndsAtServerMs?: number | null;
  startedAt: number | null;
  /** Timestamp absoluto UTC do servidor PlayFab para início simultâneo do cronômetro de partida */
  startedAtServerMs?: number | null;
  finishedAt: number | null;
  autoCloseAt?: number | null;
  /** Preenchido apenas em W.O./desistência explícita para preservar o vencedor sem recalcular por pontos */
  forfeitByPlayerId?: string | null;
  durationSec: number;
  /** Blue share (0..100) for the 1v1 Tug-of-War bar (50 = balanced center) */
  blueShare: number;
  host: X1PlayerSideState;
  guest: X1PlayerSideState | null;
  winnerId: string | "draw" | null;
  minadoGridSize?: X1MinadoGridSize;
  minadoState?: X1MinadoState | null;
  rpgEvents?: X1RpgEvent[];
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
const X1_MATCH_HISTORY_META_KEY = "desafios-x1-match-history-meta-v1";

export interface X1MatchHistoryMeta {
  clearedAt: number;
  readUpToAt: number;
}

let memoryMatchHistoryFallback: X1MatchLogEntry[] = [];
let memoryHistoryMetaFallback: X1MatchHistoryMeta = { clearedAt: 0, readUpToAt: 0 };

export function loadX1HistoryMeta(): X1MatchHistoryMeta {
  if (typeof window === "undefined") return { ...memoryHistoryMetaFallback };
  try {
    const raw = localStorage.getItem(X1_MATCH_HISTORY_META_KEY);
    if (!raw) return { clearedAt: 0, readUpToAt: 0 };
    const parsed = JSON.parse(raw) as Partial<X1MatchHistoryMeta>;
    return {
      clearedAt: typeof parsed.clearedAt === "number" ? parsed.clearedAt : 0,
      readUpToAt: typeof parsed.readUpToAt === "number" ? parsed.readUpToAt : 0,
    };
  } catch {
    return { clearedAt: 0, readUpToAt: 0 };
  }
}

export function saveX1HistoryMeta(meta: X1MatchHistoryMeta): void {
  memoryHistoryMetaFallback = { ...meta };
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(X1_MATCH_HISTORY_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

/**
 * Filtra qualquer registro legado que tenha envolvido robô de teste ("Robô Desafiante")
 * antes da diretriz oficial de 100% jogador vs jogador.
 */
export function isBotMatchEntry(entry?: Partial<X1MatchLogEntry> | null): boolean {
  if (!entry) return true;
  const host = (entry.hostNick ?? "").trim().toLowerCase();
  const guest = (entry.guestNick ?? "").trim().toLowerCase();
  const winner = (entry.winnerNick ?? "").trim().toLowerCase();
  const id = (entry.id ?? "").trim().toLowerCase();
  const botTerms = ["robô desafiante", "robo desafiante", "bot_challenger", "x1_bot"];
  return botTerms.some(
    (term) =>
      host.includes(term) ||
      guest.includes(term) ||
      winner.includes(term) ||
      id.includes(term),
  );
}

function sanitizeHistoryEntries(
  entries: X1MatchLogEntry[],
  meta = loadX1HistoryMeta(),
): X1MatchLogEntry[] {
  const result: X1MatchLogEntry[] = [];
  for (const item of entries) {
    if (!item || !item.id || !item.roomCode || isBotMatchEntry(item)) continue;
    const finishedMs = new Date(item.finishedAt).getTime();
    if (meta.clearedAt > 0 && Number.isFinite(finishedMs) && finishedMs <= meta.clearedAt + 1000) {
      continue;
    }
    const isRead =
      Boolean(item.read) ||
      (meta.readUpToAt > 0 && Number.isFinite(finishedMs) && finishedMs <= meta.readUpToAt + 1000);
    result.push({ ...item, read: isRead });
  }
  return result;
}

export function loadX1MatchHistory(): X1MatchLogEntry[] {
  const meta = loadX1HistoryMeta();
  if (typeof window === "undefined") {
    return sanitizeHistoryEntries(memoryMatchHistoryFallback, meta);
  }
  try {
    const raw = localStorage.getItem(X1_MATCH_HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as X1MatchLogEntry[]) : [];
    return sanitizeHistoryEntries(Array.isArray(parsed) ? parsed : [], meta);
  } catch {
    return [];
  }
}

export function saveX1MatchHistory(entries: X1MatchLogEntry[]): void {
  const clean = sanitizeHistoryEntries(entries);
  memoryMatchHistoryFallback = [...clean];
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(X1_MATCH_HISTORY_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent("desafios:x1-history-updated"));
  } catch {
    // ignore
  }
}

export function recordX1MatchFinished(room: X1Room): void {
  if (!room.guest || !room.winnerId) return;
  const history = loadX1MatchHistory();
  const deterministicId = `x1_match_${room.code}_${room.createdAt}`;
  if (
    history.some(
      (h) =>
        h.id === deterministicId ||
        (h.roomCode === room.code &&
          Math.abs(new Date(h.finishedAt).getTime() - (room.finishedAt ?? Date.now())) < 600_000),
    )
  ) {
    return;
  }

  let winnerNick = "Empate";
  if (room.winnerId === room.host.playerId) {
    winnerNick = room.host.nick;
  } else if (room.winnerId === room.guest.playerId) {
    winnerNick = room.guest.nick;
  }

  room.autoCloseAt = (room.finishedAt ?? Date.now()) + X1_POST_MATCH_AUTOCLOSE_MS;

  const entry: X1MatchLogEntry = {
    id: deterministicId,
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

  if (isBotMatchEntry(entry)) return;

  history.unshift(entry);
  saveX1MatchHistory(history.slice(0, 100));
  localLobbyDirty = true;
}

export function markAllX1MatchesRead(): void {
  const now = Date.now();
  const meta = loadX1HistoryMeta();
  saveX1HistoryMeta({
    clearedAt: meta.clearedAt,
    readUpToAt: Math.max(meta.readUpToAt, now),
  });
  const history = loadX1MatchHistory();
  const updated = history.map((h) => ({ ...h, read: true }));
  saveX1MatchHistory(updated);
  localLobbyDirty = true;
  lastLobbyCloudSyncAt = 0;
  void syncX1WithPlayFabCloud();
}

export function clearX1MatchHistory(): void {
  const now = Date.now();
  saveX1HistoryMeta({
    clearedAt: now,
    readUpToAt: now,
  });
  saveX1MatchHistory([]);
  localLobbyDirty = true;
  lastLobbyCloudSyncAt = 0;
  void syncX1WithPlayFabCloud();
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
 * Constrói o tabuleiro de Campo Minado exclusivo para o modo X1 (4x4, 6x6 padrão ou 8x8):
 * - Determinístico baseado no seed compartilhado da sala.
 * - ~40% de cartas bônus, sendo a maioria (~65%) minas com pontuação negativa (−1 a −3).
 * - ~60% de desafios matemáticos e lógicos.
 */
export function buildX1Board(seed: number, gridSize: X1MinadoGridSize = 6): MineCard[] {
  const safeSize = sanitizeX1MinadoGridSize(gridSize);
  const totalCards = safeSize * safeSize;
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
  for (let i = 0; i < totalCards; i++) {
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
    const colLetter = String.fromCharCode(65 + (i % safeSize));
    const rowNumber = Math.floor(i / safeSize) + 1;
    cards.push({ ...base, id: `c${i}`, label: `${colLetter}${rowNumber}` });
  }
  return cards;
}

/**
 * Gera determinísticamente a pergunta número `stepIndex` para a Batalha de Robôs (`rpg`) no X1,
 * usando a semente (`seed`) da sala para que ambos os jogadores enfrentem exatamente a mesma sequência.
 */
export function generateDeterministicRobotClashQuestion(
  seed: number,
  stepIndex: number,
): { text: string; answer: boolean } {
  const nextRnd = createSeededRng(seed + stepIndex * 7919 + 101);
  const ri = (n: number) => Math.floor(nextRnd() * n);
  const rand = <T>(arr: readonly T[]): T => arr[ri(arr.length)];

  const kind = ri(3);
  if (kind === 0) {
    const a = 2 + ri(16);
    const b = 2 + ri(14);
    const op = rand(["+", "−", "×"] as const);
    const exprA = op === "−" ? Math.max(a, b) : a;
    const exprB = op === "−" ? Math.min(a, b) : b;
    const real = op === "+" ? exprA + exprB : op === "−" ? exprA - exprB : exprA * exprB;
    const isTrue = nextRnd() < 0.5;
    const shown = isTrue ? real : real + rand([-4, -3, -2, -1, 1, 2, 3, 4]);
    return {
      text: `${exprA} ${op} ${exprB} = ${shown}`,
      answer: shown === real,
    };
  }
  if (kind === 1) {
    const a = 2 + ri(15);
    const b = 2 + ri(15);
    const c = 2 + ri(15);
    const d = 2 + ri(15);
    const cmp = rand([">", "<"] as const);
    const left = a + b;
    const right = c + d;
    const ans = cmp === ">" ? left > right : left < right;
    return {
      text: `${a} + ${b} ${cmp} ${c} + ${d}`,
      answer: ans,
    };
  }
  const n = 4 + ri(25);
  const askEven = nextRnd() < 0.5;
  return {
    text: askEven ? `${n} é um número PAR` : `${n} é um número ÍMPAR`,
    answer: askEven ? n % 2 === 0 : n % 2 !== 0,
  };
}

/**
 * Gera uma lista determinística idêntica de questões a partir da semente da sala (seed).
 * Garante que ambos os jogadores recebam os mesmos problemas na mesma ordem para qualquer modalidade habilitada.
 */
export function generateDeterministicQuestionList(
  seed: number,
  gameId: GameId | string,
): X1QuestionEntry[] {
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
    } else if (gameId === "variaveis") {
      const x = 1 + ri(12);
      const mult = rand([1, 2, 3, 4] as const);
      const add = 1 + ri(15);
      const isAdd = nextRnd() < 0.65;
      const total = isAdd ? mult * x + add : mult * x + add;
      const expr =
        mult === 1
          ? isAdd
            ? `X + ${add} = ${x + add}`
            : `X − ${add} = ${x}`
          : `${mult}X + ${add} = ${total}`;
      const correctAns = mult === 1 && !isAdd ? x + add : x;
      const opts = new Set<number>([correctAns]);
      while (opts.size < 4) {
        const cand = correctAns + rand([-5, -3, -2, -1, 1, 2, 3, 5]);
        if (cand > 0) opts.add(cand);
      }
      list.push({
        id: `q_var_${seed}_${i}`,
        prompt: "Descubra o valor da incógnita X:",
        question: expr,
        expr,
        options: shuffle([...opts]).map(String),
        answer: String(correctAns),
        points: 15,
      });
    } else if (gameId === "cartesiano") {
      const isMove = i % 2 === 0;
      if (isMove) {
        const x0 = -4 + ri(9);
        const y0 = -4 + ri(9);
        const dx = rand([-3, -2, -1, 1, 2, 3] as const);
        const dy = rand([-3, -2, -1, 1, 2, 3] as const);
        const xf = x0 + dx;
        const yf = y0 + dy;
        const ans = `(${xf}, ${yf})`;
        const opts = new Set<string>([
          ans,
          `(${x0 - dx}, ${yf})`,
          `(${xf}, ${y0 - dy})`,
          `(${yf}, ${xf})`,
        ]);
        let step = 1;
        while (opts.size < 4) {
          opts.add(`(${xf + step}, ${yf - step})`);
          step++;
        }
        const expr = `Início (${x0}, ${y0}) → X ${dx > 0 ? `+${dx}` : dx}, Y ${dy > 0 ? `+${dy}` : dy}`;
        list.push({
          id: `q_cart_${seed}_${i}`,
          prompt: "Qual é a coordenada final (X, Y) no Plano Cartesiano?",
          question: expr,
          expr,
          options: shuffle([...opts]),
          answer: ans,
          points: 15,
        });
      } else {
        const qNum = 1 + ri(4);
        const ax = 1 + ri(8);
        const ay = 1 + ri(8);
        const px = qNum === 1 || qNum === 4 ? ax : -ax;
        const py = qNum === 1 || qNum === 2 ? ay : -ay;
        const labels = ["1º Quadrante", "2º Quadrante", "3º Quadrante", "4º Quadrante"];
        const ans = labels[qNum - 1];
        const expr = `Ponto P(${px}, ${py})`;
        list.push({
          id: `q_cart_${seed}_${i}`,
          prompt: "Em qual quadrante do Plano Cartesiano está o ponto?",
          question: expr,
          expr,
          options: labels,
          answer: ans,
          points: 15,
        });
      }
    } else if (gameId === "formas") {
      const catalog = [
        { q: "Polígono regular com 3 lados e 3 vértices", a: "Triângulo" },
        { q: "Polígono com 4 lados iguais e 4 ângulos retos", a: "Quadrado" },
        { q: "Polígono com 5 lados e 5 vértices", a: "Pentágono" },
        { q: "Polígono com 6 lados e 6 vértices", a: "Hexágono" },
        { q: "Figura plana perfeitamente redonda sem vértices", a: "Círculo" },
        { q: "Quadrilátero com lados opostos paralelos e 4 lados iguais", a: "Losango" },
      ];
      const allLabels = ["Triângulo", "Quadrado", "Pentágono", "Hexágono", "Círculo", "Losango"];
      const chosen = rand(catalog);
      const others = shuffle(allLabels.filter((l) => l !== chosen.a)).slice(0, 3);
      list.push({
        id: `q_frm_${seed}_${i}`,
        prompt: "Qual é a forma geométrica descrita?",
        question: chosen.q,
        expr: chosen.q,
        options: shuffle([chosen.a, ...others]),
        answer: chosen.a,
        points: 15,
      });
    } else if (gameId === "robogrid") {
      const dirs = ["Norte", "Leste", "Sul", "Oeste"] as const;
      const startIdx = ri(4);
      const turn = rand(["Girar à Direita", "Girar à Esquerda", "Meia-volta (180°)"] as const);
      const endIdx =
        turn === "Girar à Direita"
          ? (startIdx + 1) % 4
          : turn === "Girar à Esquerda"
            ? (startIdx + 3) % 4
            : (startIdx + 2) % 4;
      const expr = `Olhando p/ ${dirs[startIdx]} → [${turn}]`;
      list.push({
        id: `q_rbg_${seed}_${i}`,
        prompt: "Para qual direção o robô ficará apontando?",
        question: expr,
        expr,
        options: [...dirs],
        answer: dirs[endIdx],
        points: 15,
      });
    } else if (gameId === "memoria") {
      const colors = ["Azul", "Verde", "Amarelo", "Vermelho"] as const;
      const c1 = colors[ri(4)];
      const c2 = colors[( colors.indexOf(c1) + 1 + ri(3) ) % 4];
      const c3 = colors[( colors.indexOf(c2) + 1 + ri(3) ) % 4];
      const pattern = [c1, c2, c3, c1, c2, "?"];
      const expr = pattern.join(" → ");
      list.push({
        id: `q_mem_${seed}_${i}`,
        prompt: "Qual cor completa o padrão de memória?",
        question: expr,
        expr,
        options: [...colors],
        answer: c3,
        points: 15,
      });
    } else if (gameId === "operacoes" || gameId === "spacequest") {
      const a = 2 + ri(18);
      const b = 2 + ri(12);
      const op = rand(["+", "−", "×"] as const);
      const exprA = op === "−" ? Math.max(a, b) : a;
      const exprB = op === "−" ? Math.min(a, b) : b;
      const correctAns = op === "+" ? exprA + exprB : op === "−" ? exprA - exprB : exprA * exprB;
      const opts = new Set<number>([correctAns]);
      while (opts.size < 4) {
        const cand = correctAns + rand([-6, -4, -2, -1, 1, 2, 4, 6]);
        if (cand >= 0) opts.add(cand);
      }
      const expr = `${exprA} ${op} ${exprB} = ?`;
      list.push({
        id: `q_op_${seed}_${i}`,
        prompt: "Qual é o resultado da operação?",
        question: expr,
        expr,
        options: shuffle([...opts]).map(String),
        answer: String(correctAns),
        points: 15,
      });
    } else if (gameId === "sequencias" || gameId === "completar") {
      const start = 1 + ri(10);
      const step = 2 + ri(6);
      const seq = [start, start + step, start + step * 2, start + step * 3];
      const correctAns = start + step * 4;
      const opts = new Set<number>([correctAns]);
      while (opts.size < 4) {
        const cand = correctAns + rand([-step, -2, -1, 1, 2, step]);
        if (cand > 0) opts.add(cand);
      }
      const expr = `${seq.join(", ")}, ?`;
      list.push({
        id: `q_seq_${seed}_${i}`,
        prompt: "Qual número completa a sequência lógica?",
        question: expr,
        expr,
        options: shuffle([...opts]).map(String),
        answer: String(correctAns),
        points: 15,
      });
    } else if (gameId === "binario") {
      const dec = 1 + ri(15);
      const bin = dec.toString(2).padStart(4, "0");
      const opts = new Set<number>([dec]);
      while (opts.size < 4) {
        const cand = 1 + ri(15);
        opts.add(cand);
      }
      list.push({
        id: `q_bin_${seed}_${i}`,
        prompt: "Qual é o valor decimal deste número binário?",
        question: bin,
        expr: bin,
        options: shuffle([...opts]).map(String),
        answer: String(dec),
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
  const games: GameId[] = sanitizeX1AvailableGames(args.availableGames);

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
  me.lastSeenAt = now;

  const seq = me.correct + me.wrong + 1;
  const eventId = `${args.role}:${seq}`;
  const existingEvents = Array.isArray(next.rpgEvents) ? next.rpgEvents : [];
  if (!existingEvents.some((ev) => ev.id === eventId)) {
    next.rpgEvents = [
      ...existingEvents,
      { id: eventId, role: args.role, seq, isCorrect: args.isCorrect },
    ];
  }

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
  // Desempate por velocidade quando ambos concluíram todas as questões com a mesma pontuação/acertos/erros
  // Prioriza finishedAtServerMs (calibrado no relógio UTC do servidor PlayFab e imutável após finalizar)
  if (room.host.finished && room.guest.finished) {
    const hostDoneAt = room.host.finishedAtServerMs ?? room.host.updatedAt;
    const guestDoneAt = room.guest.finishedAtServerMs ?? room.guest.updatedAt;
    if (hostDoneAt !== guestDoneAt) {
      return hostDoneAt < guestDoneAt ? room.host.playerId : room.guest.playerId;
    }
  }
  return "draw";
}

/* --------------------- Store & Real-Time Transport Layer --------------------- */

let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new window.BroadcastChannel(X1_CHANNEL_NAME);
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
const localOppObservedAt = new Map<string, number>();

/* --------------------- Calibração de Relógio UTC (PlayFab GetTime) --------------------- */

let x1ServerClockOffsetMs: number | null = null;
let x1LastClockSyncAt = 0;
let inFlightX1ClockSync: Promise<number> | null = null;

/** Retorna o instante atual estimado no relógio oficial UTC do PlayFab. */
export function getX1ServerNow(localNow = Date.now()): number {
  return localNow + (x1ServerClockOffsetMs ?? 0);
}

export function getX1ServerClockOffsetMs(): number {
  return x1ServerClockOffsetMs ?? 0;
}

export function isX1ServerClockCalibrated(): boolean {
  return x1ServerClockOffsetMs !== null;
}

/** Utilitário para testes determinísticos simulando relógios dessincronizados entre dispositivos. */
export function __setX1ServerClockOffsetForTests(offsetMs: number | null): void {
  x1ServerClockOffsetMs = offsetMs;
  x1LastClockSyncAt = offsetMs === null ? 0 : Date.now();
}

/**
 * Calibra a diferença de relógio entre o dispositivo e o servidor PlayFab (`Client/GetTime`),
 * compensando metade do RTT para precisão sub-segundo na contagem regressiva simultânea do X1.
 */
export async function syncX1ServerClockOffset(force = false): Promise<number> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return x1ServerClockOffsetMs ?? 0;
  const now = Date.now();
  if (!force && x1ServerClockOffsetMs !== null && now - x1LastClockSyncAt < 3 * 60_000) {
    return x1ServerClockOffsetMs;
  }
  if (inFlightX1ClockSync) return inFlightX1ClockSync;

  inFlightX1ClockSync = (async () => {
    try {
      const t0 = Date.now();
      const data = await callPlayFabSharedGroup("GetTime", {});
      const t1 = Date.now();
      const timeStr = (data as { Time?: string } | null)?.Time;
      if (timeStr) {
        const serverMs = Date.parse(timeStr);
        if (!Number.isNaN(serverMs)) {
          const rtt = Math.max(0, t1 - t0);
          const estimatedServerAtT1 = serverMs + Math.round(rtt / 2);
          x1ServerClockOffsetMs = estimatedServerAtT1 - t1;
          x1LastClockSyncAt = t1;
          return x1ServerClockOffsetMs;
        }
      }
    } catch {
      /* ignore */
    } finally {
      inFlightX1ClockSync = null;
    }
    return x1ServerClockOffsetMs ?? 0;
  })();

  return inFlightX1ClockSync;
}

function serverMsToLocalMs(serverMs: number): number {
  return serverMs - (x1ServerClockOffsetMs ?? 0);
}

function markOpponentObserved(code: string, playerId: string | undefined, at: number) {
  if (!playerId) return;
  localOppObservedAt.set(`${code}:${playerId}`, at);
}

function mergeScoreRaceSides(base: X1Room, local: X1Room, remote: X1Room, now: number) {
  if (!local.guest || !remote.guest || !base.guest) return;
  const localHostProgress = (local.host.correct + local.host.wrong) * 1000 + (local.host.currentQuestionIdx ?? 0);
  const remoteHostProgress = (remote.host.correct + remote.host.wrong) * 1000 + (remote.host.currentQuestionIdx ?? 0);
  const pickRemoteHost =
    remoteHostProgress > localHostProgress ||
    (remoteHostProgress === localHostProgress && Boolean(remote.host.finished) && !local.host.finished);
  base.host = structuredClone(pickRemoteHost ? remote.host : local.host);
  if (local.host.finished || remote.host.finished) {
    base.host.finished = true;
    const hFin = [local.host.finishedAtServerMs, remote.host.finishedAtServerMs].filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (hFin.length > 0) base.host.finishedAtServerMs = Math.min(...hFin);
  }
  base.host.avatar = local.host.avatar ?? remote.host.avatar;
  base.host.lastSeenAt = Math.max(local.host.lastSeenAt ?? 0, remote.host.lastSeenAt ?? 0) || undefined;

  const localGuestProgress = (local.guest.correct + local.guest.wrong) * 1000 + (local.guest.currentQuestionIdx ?? 0);
  const remoteGuestProgress = (remote.guest.correct + remote.guest.wrong) * 1000 + (remote.guest.currentQuestionIdx ?? 0);
  const pickRemoteGuest =
    remoteGuestProgress > localGuestProgress ||
    (remoteGuestProgress === localGuestProgress && Boolean(remote.guest.finished) && !local.guest.finished);
  base.guest = structuredClone(pickRemoteGuest ? remote.guest : local.guest);
  if (local.guest.finished || remote.guest.finished) {
    base.guest.finished = true;
    const gFin = [local.guest.finishedAtServerMs, remote.guest.finishedAtServerMs].filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (gFin.length > 0) base.guest.finishedAtServerMs = Math.min(...gFin);
  }
  base.guest.avatar = local.guest.avatar ?? remote.guest.avatar;
  base.guest.lastSeenAt = Math.max(local.guest.lastSeenAt ?? 0, remote.guest.lastSeenAt ?? 0) || undefined;

  base.blueShare = computeScoreRaceBlueShare(base.host.score, base.guest.score);
  if (base.host.finished && base.guest.finished && base.status !== "finished") {
    base.status = "finished";
    base.finishedAt = base.finishedAt ?? now;
  }
  if (base.status === "finished" && !base.forfeitByPlayerId) {
    base.winnerId = resolveX1Winner(base);
    recordX1MatchFinished(base);
  }
}

function mergeRpgSides(
  base: X1Room,
  local: X1Room,
  remote: X1Room,
  remoteIsNewer: boolean,
  now: number,
) {
  if (!local.guest || !remote.guest) return;
  const mergedHostAvatar = local.host.avatar ?? remote.host.avatar;
  const mergedGuestAvatar = local.guest.avatar ?? remote.guest.avatar;
  const mergedHostLastSeen = Math.max(local.host.lastSeenAt ?? 0, remote.host.lastSeenAt ?? 0) || undefined;
  const mergedGuestLastSeen = Math.max(local.guest.lastSeenAt ?? 0, remote.guest.lastSeenAt ?? 0) || undefined;

  const eventMap = new Map<string, X1RpgEvent>();
  for (const ev of local.rpgEvents ?? []) {
    if (ev?.id) eventMap.set(ev.id, ev);
  }
  for (const ev of remote.rpgEvents ?? []) {
    if (ev?.id && !eventMap.has(ev.id)) eventMap.set(ev.id, ev);
  }

  if (eventMap.size > 0) {
    const sortedEvents = Array.from(eventMap.values()).sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.role === b.role ? 0 : a.role === "host" ? -1 : 1;
    });

    const guestSeed = base.guest ?? local.guest ?? remote.guest;
    if (!guestSeed) return;
    const wasFinishedExternally = (base.status as X1RoomStatus) === "finished";
    const forfeitWinner = base.forfeitByPlayerId ? base.winnerId : null;
    let simRoom: X1Room = {
      ...base,
      status: "playing",
      blueShare: 50,
      finishedAt: null,
      winnerId: null,
      rpgEvents: [],
      host: {
        ...base.host,
        score: 0,
        correct: 0,
        wrong: 0,
        hp: base.host.maxHp || X1_ROBOT_INITIAL_HP,
        avatar: mergedHostAvatar,
        lastSeenAt: mergedHostLastSeen,
      },
      guest: {
        ...guestSeed,
        score: 0,
        correct: 0,
        wrong: 0,
        hp: guestSeed.maxHp || X1_ROBOT_INITIAL_HP,
        avatar: mergedGuestAvatar,
        lastSeenAt: mergedGuestLastSeen,
      },
    };

    for (const ev of sortedEvents) {
      if (simRoom.status === "finished") break;
      simRoom = applyX1RobotBattleAnswer({
        room: simRoom,
        role: ev.role,
        isCorrect: ev.isCorrect,
      }).room;
    }

    simRoom.rpgEvents = sortedEvents;
    if (forfeitWinner) {
      simRoom.status = "finished";
      simRoom.finishedAt = base.finishedAt ?? now;
      simRoom.winnerId = forfeitWinner;
    } else if (wasFinishedExternally && simRoom.status !== "finished") {
      simRoom.status = "finished";
      simRoom.finishedAt = base.finishedAt ?? now;
      simRoom.winnerId = resolveX1Winner(simRoom);
    }
    base.host = simRoom.host;
    base.guest = simRoom.guest;
    base.blueShare = simRoom.blueShare;
    base.rpgEvents = simRoom.rpgEvents;
    base.status = simRoom.status;
    base.finishedAt = simRoom.finishedAt;
    base.winnerId = simRoom.winnerId;
    if (base.status === "finished") {
      recordX1MatchFinished(base);
    }
  } else {
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
    base.host.avatar = mergedHostAvatar;
    base.guest.avatar = mergedGuestAvatar;
    base.host.lastSeenAt = mergedHostLastSeen;
    base.guest.lastSeenAt = mergedGuestLastSeen;

    const shareDelta =
      dHostCorrect * 18 - dHostWrong * 10 - dGuestCorrect * 18 + dGuestWrong * 10;
    if (shareDelta !== 0) {
      base.blueShare = Math.max(0, Math.min(100, base.blueShare + shareDelta));
    }

    if (base.host.hp <= 0 || base.guest.hp <= 0) {
      base.status = "finished";
      base.finishedAt = base.finishedAt ?? now;
      base.winnerId = base.forfeitByPlayerId
        ? base.winnerId
        : base.host.hp <= 0
          ? base.guest.playerId
          : base.host.playerId;
      base.blueShare = base.host.hp <= 0 ? 0 : 100;
      recordX1MatchFinished(base);
    } else if (base.status === "finished" && !base.forfeitByPlayerId) {
      base.winnerId = resolveX1Winner(base);
      recordX1MatchFinished(base);
    }
  }
}

function mergeMinadoSides(
  base: X1Room,
  local: X1Room,
  remote: X1Room,
  remoteIsNewer: boolean,
  now: number,
) {
  if (!local.minadoState || !remote.minadoState || !local.guest || !remote.guest) return;
  const localRevCards = Object.keys(local.minadoState.revealed).length;
  const remoteRevCards = Object.keys(remote.minadoState.revealed).length;
  const localTurnSeq = local.minadoState.turnSeq ?? 0;
  const remoteTurnSeq = remote.minadoState.turnSeq ?? 0;
  const localHasActiveQ = Boolean(
    local.minadoState.activeQuestion && !local.minadoState.activeQuestion.answered,
  );
  const remoteHasActiveQ = Boolean(
    remote.minadoState.activeQuestion && !remote.minadoState.activeQuestion.answered,
  );

  // Prioridade: 1) mais cartas reveladas; 2) maior turnSeq (preserva timeout de 25s sem perder turno);
  // 3) pergunta recém-aberta; 4) revisão mais nova.
  const preferRemoteMinado =
    remoteRevCards > localRevCards ||
    (remoteRevCards === localRevCards &&
      (remoteTurnSeq > localTurnSeq ||
        (remoteTurnSeq === localTurnSeq &&
          ((remoteHasActiveQ && !localHasActiveQ) ||
            (remoteHasActiveQ === localHasActiveQ && remoteIsNewer)))));

  if (preferRemoteMinado) {
    base.minadoState = structuredClone(remote.minadoState);
    base.host = structuredClone(remote.host);
    base.guest = structuredClone(remote.guest);
  } else {
    base.minadoState = structuredClone(local.minadoState);
    base.host = structuredClone(local.host);
    base.guest = structuredClone(local.guest);
  }

  base.minadoState.gridSize =
    base.minadoState.gridSize ??
    local.minadoState.gridSize ??
    remote.minadoState.gridSize ??
    base.minadoGridSize ??
    6;
  base.minadoState.turnSeq = Math.max(localTurnSeq, remoteTurnSeq);
  base.host.avatar = local.host.avatar ?? remote.host.avatar;
  base.guest.avatar = local.guest.avatar ?? remote.guest.avatar;
  base.host.lastSeenAt =
    Math.max(local.host.lastSeenAt ?? 0, remote.host.lastSeenAt ?? 0) || undefined;
  base.guest.lastSeenAt =
    Math.max(local.guest.lastSeenAt ?? 0, remote.guest.lastSeenAt ?? 0) || undefined;

  // Sincroniza turnStartedAt pelo relógio UTC do servidor quando disponível; senão ancora localmente
  if (base.minadoState.turnStartedAtServerMs) {
    base.minadoState.turnStartedAt = serverMsToLocalMs(base.minadoState.turnStartedAtServerMs);
  } else {
    const turnChanged =
      base.minadoState.currentTurnPlayerId !== local.minadoState.currentTurnPlayerId ||
      Object.keys(base.minadoState.revealed).length !== Object.keys(local.minadoState.revealed).length ||
      (base.minadoState.turnSeq ?? 0) !== (local.minadoState.turnSeq ?? 0);
    if (turnChanged || !local.minadoState.turnStartedAt) {
      base.minadoState.turnStartedAt = now;
    } else {
      base.minadoState.turnStartedAt = local.minadoState.turnStartedAt;
    }
  }

  const activeQ = base.minadoState.activeQuestion;
  if (activeQ && !activeQ.answered) {
    if (activeQ.expiresAtServerMs) {
      activeQ.expiresAt = serverMsToLocalMs(activeQ.expiresAtServerMs);
    } else {
      const localQ = local.minadoState.activeQuestion;
      if (localQ && localQ.cardId === activeQ.cardId && localQ.expiresAt) {
        activeQ.expiresAt = localQ.expiresAt;
      } else {
        activeQ.expiresAt = now + 20_000;
      }
    }
  }

  if (
    Object.keys(base.minadoState.revealed).length >= base.minadoState.board.length &&
    (base.status as X1RoomStatus) !== "finished"
  ) {
    base.status = "finished";
    base.finishedAt = base.finishedAt ?? now;
    base.winnerId = resolveX1Winner(base);
    recordX1MatchFinished(base);
  } else if (base.status === "finished" && !base.forfeitByPlayerId) {
    base.winnerId = resolveX1Winner(base);
    recordX1MatchFinished(base);
  }
}

export function mergeX1RoomStates(local: X1Room | undefined, remote: X1Room, now = Date.now()): X1Room {
  if (!local) {
    const copy: X1Room = structuredClone(remote);
    if (copy.status === "countdown") {
      if (copy.countdownEndsAtServerMs) {
        copy.countdownEndsAt = serverMsToLocalMs(copy.countdownEndsAtServerMs);
      } else if (copy.hostReady !== false) {
        // Fallback legado sem timestamp UTC do servidor: ancora localmente se fora do intervalo
        const rem = (copy.countdownEndsAt ?? 0) - now;
        if (rem <= 0 || rem > (X1_COUNTDOWN_DURATION_SEC + 1) * 1000) {
          copy.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
        }
      }
    } else if (copy.status === "playing") {
      if (copy.startedAtServerMs) {
        copy.startedAt = serverMsToLocalMs(copy.startedAtServerMs);
      } else if (!copy.startedAt || Math.abs(now - copy.startedAt) > (copy.durationSec + 15) * 1000) {
        copy.startedAt = now;
      }
      if (copy.minadoState?.turnStartedAtServerMs) {
        copy.minadoState.turnStartedAt = serverMsToLocalMs(copy.minadoState.turnStartedAtServerMs);
      }
      if (copy.minadoState?.activeQuestion?.expiresAtServerMs) {
        copy.minadoState.activeQuestion.expiresAt = serverMsToLocalMs(
          copy.minadoState.activeQuestion.expiresAtServerMs,
        );
      }
      markOpponentObserved(copy.code, copy.host.playerId, now);
      markOpponentObserved(copy.code, copy.guest?.playerId, now);
    }
    return copy;
  }

  const localRank = getRoomStatusRank(local.status);
  const remoteRank = getRoomStatusRank(remote.status);

  // 1. Se o estado remoto avançou de fase (ex: waiting -> countdown -> playing -> finished -> cancelled)
  if (remoteRank > localRank) {
    const merged: X1Room = structuredClone(remote);
    const awaitingHandshake =
      remote.hostReady === false && !local.hostReady && !remote.countdownEndsAtServerMs;
    if (local.hostReady || remote.hostReady) {
      merged.hostReady = true;
    } else if (remote.hostReady === false) {
      merged.hostReady = false;
    }
    if (local.guestReady || remote.guestReady) {
      merged.guestReady = true;
    }
    merged.guestJoinedAtServerMs = remote.guestJoinedAtServerMs ?? local.guestJoinedAtServerMs ?? null;
    merged.forfeitByPlayerId = remote.forfeitByPlayerId ?? local.forfeitByPlayerId ?? null;

    if (local.status === "waiting" && merged.status === "countdown") {
      if (merged.countdownEndsAtServerMs) {
        const localFromServer = serverMsToLocalMs(merged.countdownEndsAtServerMs);
        const rem = localFromServer - now;
        if (isX1ServerClockCalibrated() || (rem > 0 && rem <= (X1_COUNTDOWN_DURATION_SEC + 2) * 1000)) {
          // Timestamp oficial UTC válido: sincroniza sem reiniciar os 10s!
          merged.countdownEndsAt = localFromServer;
        } else {
          merged.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
        }
      } else if (awaitingHandshake) {
        // Handshake pendente (aguardando host confirmar prontidão via confirmX1HostReady)
        merged.countdownEndsAt = null;
      } else {
        // Modo legado/offline sem handshake pendente: ancora 10s no relógio local
        merged.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
      }
    } else if (local.status !== "playing" && merged.status === "playing") {
      if (merged.startedAtServerMs) {
        merged.startedAt = serverMsToLocalMs(merged.startedAtServerMs);
      } else if (local.countdownEndsAtServerMs) {
        merged.startedAtServerMs = local.countdownEndsAtServerMs;
        merged.startedAt = serverMsToLocalMs(local.countdownEndsAtServerMs);
      } else {
        merged.startedAt = now;
      }
      if (merged.minadoState) {
        merged.minadoState.turnStartedAt = merged.minadoState.turnStartedAtServerMs
          ? serverMsToLocalMs(merged.minadoState.turnStartedAtServerMs)
          : (merged.startedAt ?? now);
      }
      markOpponentObserved(merged.code, merged.host.playerId, now);
      markOpponentObserved(merged.code, merged.guest?.playerId, now);
    } else if (merged.status === "finished") {
      // CRÍTICO: ao receber "finished" vindo da nuvem enquanto estávamos em "playing",
      // SEMPRE mescla pontuações e eventos locais recentes antes de fixar o vencedor (exceto W.O./forfeit explícito)!
      if (local.status === "playing" && local.guest && remote.guest) {
        if (merged.gameId === "rpg") {
          mergeRpgSides(merged, local, remote, true, now);
        } else if (merged.gameId === "minado" && local.minadoState && remote.minadoState) {
          mergeMinadoSides(merged, local, remote, true, now);
        } else if (merged.gameId !== "minado") {
          mergeScoreRaceSides(merged, local, remote, now);
        }
      } else {
        recordX1MatchFinished(merged);
      }
    }
    return merged;
  }

  // 2. Se o estado local já está em uma fase mais avançada que o remoto (ex: local já é playing/finished)
  if (localRank > remoteRank) {
    const merged: X1Room = structuredClone(local);
    merged.hostReady = Boolean(local.hostReady || remote.hostReady);
    merged.guestReady = Boolean(local.guestReady || remote.guestReady);
    if (!merged.guest && remote.guest) {
      merged.guest = structuredClone(remote.guest);
    }
    // Se local está "finished" e remoto ainda chegou com jogadas de "playing" dos últimos segundos,
    // consolida as jogadas do oponente para evitar perda de pontuação no fim do tempo!
    if (merged.status === "finished" && remote.status === "playing" && local.guest && remote.guest) {
      if (merged.gameId === "rpg") {
        mergeRpgSides(merged, local, remote, false, now);
      } else if (merged.gameId === "minado" && local.minadoState && remote.minadoState) {
        mergeMinadoSides(merged, local, remote, false, now);
      } else if (merged.gameId !== "minado") {
        mergeScoreRaceSides(merged, local, remote, now);
      }
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
  base.hostReady = Boolean(local.hostReady || remote.hostReady);
  base.guestReady = Boolean(local.guestReady || remote.guestReady);
  base.guestJoinedAtServerMs =
    local.guestJoinedAtServerMs ?? remote.guestJoinedAtServerMs ?? null;
  base.forfeitByPlayerId = local.forfeitByPlayerId ?? remote.forfeitByPlayerId ?? null;

  // Registra observação local sempre que o estado remoto traz qualquer pulso ou atualização de jogador
  if ((remote.host.lastSeenAt ?? 0) > (local.host.lastSeenAt ?? 0) || remote.host.updatedAt > local.host.updatedAt) {
    markOpponentObserved(remote.code, remote.host.playerId, now);
  }
  if (
    remote.guest &&
    ((remote.guest.lastSeenAt ?? 0) > (local.guest?.lastSeenAt ?? 0) ||
      remote.guest.updatedAt > (local.guest?.updatedAt ?? 0))
  ) {
    markOpponentObserved(remote.code, remote.guest.playerId, now);
  }

  // Sincronização exata de countdownEndsAtServerMs e startedAtServerMs (sem drift nem reinício!)
  const canonicalCountdownServerMs =
    local.countdownEndsAtServerMs && remote.countdownEndsAtServerMs
      ? Math.min(local.countdownEndsAtServerMs, remote.countdownEndsAtServerMs)
      : (local.countdownEndsAtServerMs ?? remote.countdownEndsAtServerMs ?? null);
  if (canonicalCountdownServerMs) {
    base.countdownEndsAtServerMs = canonicalCountdownServerMs;
    base.countdownEndsAt = serverMsToLocalMs(canonicalCountdownServerMs);
  } else if (local.status === "countdown" && local.countdownEndsAt) {
    base.countdownEndsAt = local.countdownEndsAt;
  }

  const canonicalStartServerMs =
    local.startedAtServerMs && remote.startedAtServerMs
      ? Math.min(local.startedAtServerMs, remote.startedAtServerMs)
      : (local.startedAtServerMs ?? remote.startedAtServerMs ?? null);
  if (canonicalStartServerMs) {
    base.startedAtServerMs = canonicalStartServerMs;
    base.startedAt = serverMsToLocalMs(canonicalStartServerMs);
  } else if (local.status === "playing" && local.startedAt) {
    base.startedAt = local.startedAt;
  }

  if ((base.status === "playing" || base.status === "finished") && local.guest && remote.guest) {
    if (base.gameId !== "rpg" && base.gameId !== "minado") {
      mergeScoreRaceSides(base, local, remote, now);
    } else if (base.gameId === "rpg") {
      mergeRpgSides(base, local, remote, remoteIsNewer, now);
    } else if (base.gameId === "minado" && local.minadoState && remote.minadoState) {
      mergeMinadoSides(base, local, remote, remoteIsNewer, now);
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
      if (r.status === "countdown" && r.hostReady !== false) {
        const countdownDone = r.countdownEndsAtServerMs
          ? getX1ServerNow(now) >= r.countdownEndsAtServerMs
          : Boolean(r.countdownEndsAt && now >= r.countdownEndsAt);
        if (countdownDone) {
          r.status = "playing";
          if (r.countdownEndsAtServerMs) {
            r.startedAtServerMs = r.startedAtServerMs ?? r.countdownEndsAtServerMs;
            r.startedAt = r.startedAt ?? serverMsToLocalMs(r.startedAtServerMs);
          } else {
            r.startedAt = r.startedAt ?? now;
          }
          r.revision = (r.revision ?? 1) + 1;
        }
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
        // Transição automática da contagem regressiva para jogo ativo (respeitando handshake e relógio UTC)
        if (r.status === "countdown" && r.hostReady !== false) {
          const countdownDone = r.countdownEndsAtServerMs
            ? getX1ServerNow(now) >= r.countdownEndsAtServerMs
            : Boolean(r.countdownEndsAt && now >= r.countdownEndsAt);
          if (countdownDone) {
            r.status = "playing";
            if (r.countdownEndsAtServerMs) {
              r.startedAtServerMs = r.startedAtServerMs ?? r.countdownEndsAtServerMs;
              r.startedAt = r.startedAt ?? serverMsToLocalMs(r.startedAtServerMs);
            } else {
              r.startedAt = r.startedAt ?? now;
            }
            r.revision = (r.revision ?? 1) + 1;
          }
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

let localLobbyDirty = false;

function saveStore(store: X1LobbyStore, markDirty = true) {
  if (markDirty) localLobbyDirty = true;
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

interface X1SideCloudSnapshot {
  role: "host" | "guest";
  side: X1PlayerSideState;
  rpgEvents?: X1RpgEvent[];
  revision: number;
  updatedAtServerMs: number;
}

/**
 * Reconstitui o estado remoto mais recente combinando a chave `Room` com as chaves isoladas
 * `HostState` e `GuestState` (evita "Lost Update" quando ambos jogam simultaneamente).
 */
function hydrateRemoteRoomWithSideStates(
  data?: Record<string, { Value: string; LastUpdated?: string }> | null,
): X1Room | null {
  if (!data?.Room?.Value) return null;
  let room: X1Room;
  try {
    room = JSON.parse(data.Room.Value) as X1Room;
  } catch {
    return null;
  }

  const applySideSnap = (rawVal?: string) => {
    if (!rawVal) return;
    try {
      const snap = JSON.parse(rawVal) as Partial<X1SideCloudSnapshot>;
      if (!snap?.side || (snap.role !== "host" && snap.role !== "guest")) return;

      if (snap.role === "host") {
        const curProg = (room.host.correct + room.host.wrong) * 1000 + (room.host.currentQuestionIdx ?? 0);
        const snapProg = (snap.side.correct + snap.side.wrong) * 1000 + (snap.side.currentQuestionIdx ?? 0);
        if (
          snapProg > curProg ||
          (snapProg === curProg && Boolean(snap.side.finished) && !room.host.finished) ||
          (snap.side.lastSeenAt ?? 0) > (room.host.lastSeenAt ?? 0)
        ) {
          if (snapProg > curProg || (snapProg === curProg && Boolean(snap.side.finished) && !room.host.finished)) {
            room.host = {
              ...room.host,
              ...snap.side,
              avatar: snap.side.avatar ?? room.host.avatar,
            };
          } else {
            room.host.lastSeenAt = Math.max(room.host.lastSeenAt ?? 0, snap.side.lastSeenAt ?? 0);
          }
        }
      } else if (snap.role === "guest" && room.guest) {
        const curProg = (room.guest.correct + room.guest.wrong) * 1000 + (room.guest.currentQuestionIdx ?? 0);
        const snapProg = (snap.side.correct + snap.side.wrong) * 1000 + (snap.side.currentQuestionIdx ?? 0);
        if (
          snapProg > curProg ||
          (snapProg === curProg && Boolean(snap.side.finished) && !room.guest.finished) ||
          (snap.side.lastSeenAt ?? 0) > (room.guest.lastSeenAt ?? 0)
        ) {
          if (snapProg > curProg || (snapProg === curProg && Boolean(snap.side.finished) && !room.guest.finished)) {
            room.guest = {
              ...room.guest,
              ...snap.side,
              avatar: snap.side.avatar ?? room.guest.avatar,
            };
          } else {
            room.guest.lastSeenAt = Math.max(room.guest.lastSeenAt ?? 0, snap.side.lastSeenAt ?? 0);
          }
        }
      }

      if (room.gameId === "rpg" && Array.isArray(snap.rpgEvents) && snap.rpgEvents.length > 0) {
        const evMap = new Map<string, X1RpgEvent>();
        for (const ev of room.rpgEvents ?? []) {
          if (ev?.id) evMap.set(ev.id, ev);
        }
        for (const ev of snap.rpgEvents) {
          if (ev?.id && !evMap.has(ev.id)) evMap.set(ev.id, ev);
        }
        room.rpgEvents = Array.from(evMap.values());
      }
      if (typeof snap.revision === "number") {
        room.revision = Math.max(room.revision ?? 1, snap.revision);
      }
    } catch {
      /* ignore malformed side snapshot */
    }
  };

  applySideSnap(data.HostState?.Value);
  applySideSnap(data.GuestState?.Value);
  return room;
}

async function callPlayFabSharedGroup(
  endpoint: string,
  body: Record<string, unknown>,
  allowRetry = true,
  keepalive = false,
): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return null;
  const session = loadStoredSession();
  const titleId = getPlayFabTitleId();
  let syncCachedTicket: string | null = null;
  if (keepalive && typeof window !== "undefined") {
    try {
      const rawViewer = window.localStorage.getItem("desafios-playfab-viewer-ticket-v1");
      if (rawViewer) {
        const parsedV = JSON.parse(rawViewer) as { ticket?: string };
        if (parsedV.ticket) syncCachedTicket = parsedV.ticket;
      }
      if (!syncCachedTicket) {
        const raw = window.localStorage.getItem("desafios-playfab-admin-ticket-v1");
        if (raw) {
          const parsed = JSON.parse(raw) as { ticket?: string };
          if (parsed.ticket) syncCachedTicket = parsed.ticket;
        }
      }
    } catch {
      /* ignore */
    }
  }
  // IMPORTANTE: Usa a conta compartilhada de serviço (`semedvisitante` via getViewerPlayFabTicket)
  // como ticket primário para SharedGroups do X1 (`X1_LOBBY_SEMED_V2` e `x1_room_*`),
  // impedindo 403 NotAuthorized quando dois alunos diferentes acessam a mesma sala!
  const ticket = keepalive
    ? (syncCachedTicket ?? session?.sessionTicket ?? null)
    : ((await getViewerPlayFabTicket()) ?? (await getAdminPlayFabTicket()) ?? session?.sessionTicket);
  if (!ticket || !titleId) return null;

  try {
    const res = await fetch(`https://${titleId}.playfabapi.com/Client/${endpoint}`, {
      method: "POST",
      keepalive,
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
      const isNotAuthorized =
        res.status === 403 || json.errorCode === 1075 || errName.includes("NotAuthorized");
      const isAuthErr =
        !isNotAuthorized &&
        (json.errorCode === 1074 ||
          json.errorCode === 1089 ||
          errName.includes("NotAuthenticated") ||
          errName.includes("InvalidSessionTicket") ||
          (res.status === 401 && !errName));

      if (isAuthErr) {
        clearCachedAdminPlayFabTicket();
        clearExpiredStoredSessionTicket(ticket);
        const freshTicket = (await getViewerPlayFabTicket()) ?? (await getAdminPlayFabTicket());
        if (freshTicket && freshTicket !== ticket) {
          return callPlayFabSharedGroup(endpoint, body, false);
        }
      } else if (isNotAuthorized) {
        clearCachedAdminPlayFabTicket();
        const freshViewer = await getViewerPlayFabTicket();
        if (freshViewer && freshViewer !== ticket) {
          return callPlayFabSharedGroup(endpoint, body, false);
        }
        // Se um grupo antigo foi criado por outra conta e não inclui semedvisitante, tenta fallback com admin ticket
        const fallbackAdmin = await getAdminPlayFabTicket();
        if (fallbackAdmin && fallbackAdmin !== ticket) {
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

    if (!res.ok || json.error) {
      return null;
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
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;

  // Garante calibração inicial do relógio UTC do servidor PlayFab antes de normalizar timers do X1
  if (x1ServerClockOffsetMs === null) {
    await syncX1ServerClockOffset();
  } else if (Date.now() - x1LastClockSyncAt > 3 * 60_000) {
    void syncX1ServerClockOffset();
  }

  let activeRoomStatus: X1RoomStatus | null = null;

  // 1. Prioridade máxima: se há uma sala ativa (espera, contagem ou partida), sincroniza seu SharedGroup primeiro
  if (activeRoomCode) {
    const cleanCode = activeRoomCode.trim().toUpperCase();
    const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string; LastUpdated?: string }> } | null;

    // Recarrega o store APÓS o await para nunca sobrescrever ações locais feitas durante a requisição
    const storeAfterRoom = loadStore();
    storeAfterRoom.deletedRooms = storeAfterRoom.deletedRooms ?? {};
    let roomChanged = false;
    let shouldPushMergedBack = false;
    let roomToPush: X1Room | null = null;

    const hydratedRemoteRoom = hydrateRemoteRoomWithSideStates(remoteRoomData?.Data);
    if (hydratedRemoteRoom) {
      try {
        const remoteRoom = hydratedRemoteRoom;
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
      saveStore(storeAfterRoom, false);
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

  // Durante partida ativa ("playing") ou contagem ("countdown"), evita trafegar o LobbySnapshot global em alta frequência
  const nowCheck = Date.now();
  if (
    activeRoomCode &&
    (activeRoomStatus === "playing" || activeRoomStatus === "countdown") &&
    nowCheck - lastLobbyCloudSyncAt < 8_000
  ) {
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
      const serverNow = getX1ServerNow(now);
      const lobbyLastUpdatedMs = remoteLobby.Data.LobbySnapshot.LastUpdated
        ? Date.parse(remoteLobby.Data.LobbySnapshot.LastUpdated)
        : NaN;

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
        // Verifica frescor real pelo relógio UTC do servidor (impede listar alunos offline há horas como "Online na Arena X1")
        const hasServerSeen = typeof p.lastSeenServerMs === "number" && p.lastSeenServerMs > 0;
        let ageMs: number;
        if (hasServerSeen) {
          ageMs = Math.max(0, serverNow - (p.lastSeenServerMs as number));
        } else if (!Number.isNaN(lobbyLastUpdatedMs) && serverNow - lobbyLastUpdatedMs > 120_000) {
          ageMs = serverNow - lobbyLastUpdatedMs;
        } else {
          ageMs = Math.abs(now - p.lastSeenAt);
        }

        if (ageMs <= 120_000) {
          const local = store.players[id];
          const remoteTs = hasServerSeen ? (p.lastSeenServerMs as number) : p.lastSeenAt;
          const localTs = local
            ? (local.lastSeenServerMs ?? local.lastSeenAt)
            : 0;
          if (!local || remoteTs > localTs) {
            store.players[id] = {
              ...p,
              receivedAt: Math.max(1, now - ageMs),
            };
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
                    fromPlayerId: rInv.fromPlayerId ?? existing.fromPlayerId,
                    fromNick: rInv.fromNick ?? existing.fromNick,
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

      // Mescla histórico de partidas X1 concluídas para a Caixa de Entrada do ADM em qualquer dispositivo
      const remotePayload = remoteStore as {
        matchHistory?: X1MatchLogEntry[];
        historyClearedAt?: number;
        historyReadUpToAt?: number;
      };
      const localMeta = loadX1HistoryMeta();
      const mergedMeta: X1MatchHistoryMeta = {
        clearedAt: Math.max(localMeta.clearedAt, Number(remotePayload.historyClearedAt) || 0),
        readUpToAt: Math.max(localMeta.readUpToAt, Number(remotePayload.historyReadUpToAt) || 0),
      };
      const metaChanged =
        mergedMeta.clearedAt !== localMeta.clearedAt ||
        mergedMeta.readUpToAt !== localMeta.readUpToAt;
      if (metaChanged) {
        saveX1HistoryMeta(mergedMeta);
      }

      const localHistory = sanitizeHistoryEntries(loadX1MatchHistory(), mergedMeta);
      const byId = new Map(localHistory.map((h) => [h.id, h]));
      let historyChanged = metaChanged;

      const remoteHistory = remotePayload.matchHistory;
      if (Array.isArray(remoteHistory) && remoteHistory.length > 0) {
        for (const rEntry of remoteHistory) {
          if (!rEntry || !rEntry.id || !rEntry.roomCode) continue;
          if (isBotMatchEntry(rEntry)) continue;
          const finishedMs = new Date(rEntry.finishedAt).getTime();
          if (Number.isFinite(finishedMs) && finishedMs <= mergedMeta.clearedAt + 1000) {
            continue;
          }
          const existing = localHistory.find(
            (h) =>
              h.id === rEntry.id ||
              (h.roomCode === rEntry.roomCode &&
                Math.abs(new Date(h.finishedAt).getTime() - finishedMs) < 600_000),
          );
          const isRead = Boolean(
            existing?.read ||
              rEntry.read ||
              (Number.isFinite(finishedMs) && finishedMs <= mergedMeta.readUpToAt + 1000),
          );
          if (!existing && !byId.has(rEntry.id)) {
            byId.set(rEntry.id, { ...rEntry, read: isRead });
            historyChanged = true;
          } else if (existing && existing.read !== isRead) {
            byId.set(existing.id, { ...existing, read: isRead });
            historyChanged = true;
          }
        }
      }
      if (historyChanged) {
        const mergedHistory = Array.from(byId.values())
          .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())
          .slice(0, 100);
        saveX1MatchHistory(mergedHistory);
      }
    } catch {
      /* ignore */
    }
  }

  if (changed) {
    saveStore(store, false);
  }

  // Push merged snapshot apenas quando houver mutação local pendente (evita re-upload inútil quando apenas lendo, ex.: painel ADM)
  if (localLobbyDirty) {
    localLobbyDirty = false;
    const latestStore = loadStore();
    const latestMeta = loadX1HistoryMeta();
    const latestHistory = loadX1MatchHistory().slice(0, 40);
    await callPlayFabSharedGroup("UpdateSharedGroupData", {
      SharedGroupId: LOBBY_SHARED_GROUP_ID,
      Data: {
        LobbySnapshot: JSON.stringify({
          players: latestStore.players,
          rooms: latestStore.rooms,
          deletedRooms: latestStore.deletedRooms,
          invites: latestStore.invites,
          matchHistory: latestHistory,
          historyClearedAt: latestMeta.clearedAt,
          historyReadUpToAt: latestMeta.readUpToAt,
        }),
      },
      Permission: "Public",
    });
  }
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

/**
 * Envia SOMENTE a chave isolada do lado do jogador (`HostState` ou `GuestState`) no SharedGroup da sala,
 * eliminando sobrescritas cegas ("Lost Update") quando os dois jogadores respondem simultaneamente.
 */
async function pushPlayerSideToPlayFab(
  room: X1Room,
  role: "host" | "guest",
  keepalive = false,
): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  const cleanCode = room.code.trim().toUpperCase();
  const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
  const currentStore = loadStore();
  if (currentStore.deletedRooms?.[cleanCode]) return;
  const latestRoom = currentStore.rooms[cleanCode];
  if (!latestRoom || latestRoom.status === "cancelled") return;

  const side = role === "host" ? latestRoom.host : latestRoom.guest;
  if (!side) return;

  const sideKey = role === "host" ? "HostState" : "GuestState";
  const sideEvents =
    latestRoom.gameId === "rpg"
      ? (latestRoom.rpgEvents ?? []).filter((ev) => ev.role === role)
      : undefined;

  const payload: X1SideCloudSnapshot = {
    role,
    side,
    rpgEvents: sideEvents,
    revision: latestRoom.revision ?? 1,
    updatedAtServerMs: getX1ServerNow(),
  };

  if (!keepalive) {
    await ensureSharedGroupExists(roomGroupId);
  }
  await callPlayFabSharedGroup(
    "UpdateSharedGroupData",
    {
      SharedGroupId: roomGroupId,
      Data: { [sideKey]: JSON.stringify(payload) },
      Permission: "Public",
    },
    !keepalive,
    keepalive,
  );
  // Se a jogada concluiu a partida (ex: HP=0 ou ambos terminaram), atualiza também `Room` imediatamente
  if (latestRoom.status === "finished" && !keepalive) {
    await pushRoomToPlayFab(latestRoom, false);
  }
}

async function pushRoomToPlayFab(room: X1Room, keepalive = false): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  const cleanCode = room.code.trim().toUpperCase();
  const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
  if (!keepalive) {
    await ensureSharedGroupExists(roomGroupId);
  }
  // Verifica se a sala não foi cancelada/deletada localmente durante o await de rede
  const currentStore = loadStore();
  if (currentStore.deletedRooms?.[cleanCode]) {
    return;
  }
  const latestRoom = currentStore.rooms[cleanCode];
  if (!latestRoom || latestRoom.status === "cancelled") {
    return;
  }
  await callPlayFabSharedGroup(
    "UpdateSharedGroupData",
    {
      SharedGroupId: roomGroupId,
      Data: { Room: JSON.stringify(latestRoom) },
      Permission: "Public",
    },
    !keepalive,
    keepalive,
  );
  if (keepalive) return;
  // Sincroniza o lobby imediatamente quando a sala é criada, inicia contagem ou encerra
  if (latestRoom.status !== "playing") {
    lastLobbyCloudSyncAt = 0;
  }
  await syncX1WithPlayFabCloud(cleanCode);
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

function normalizeX1Nick(nick?: string | null): string {
  return (nick ?? "").trim().toLowerCase();
}

function isSameX1Identity(
  aId?: string | null,
  aNick?: string | null,
  bId?: string | null,
  bNick?: string | null,
): boolean {
  if (aId && bId && aId === bId) return true;
  const na = normalizeX1Nick(aNick);
  const nb = normalizeX1Nick(bNick);
  return Boolean(na && nb && na === nb);
}

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
  const normNick = normalizeX1Nick(player.nick);
  // Remove entradas antigas duplicadas do mesmo apelido caso tenha mudado de ID de sessão
  if (normNick) {
    for (const [id, p] of Object.entries(store.players)) {
      if (id !== player.playerId && normalizeX1Nick(p.nick) === normNick) {
        delete store.players[id];
      }
    }
  }
  const existing = store.players[player.playerId];
  const lastActiveAt = player.lastActiveAt ?? existing?.lastActiveAt ?? now;
  store.players[player.playerId] = {
    ...player,
    lastSeenAt: now,
    lastSeenServerMs: getX1ServerNow(now),
    lastActiveAt,
  };
  saveStore(store);
}

export function getX1LobbySnapshot(currentPlayerId?: string, currentPlayerNick?: string) {
  const store = loadStore();
  const now = Date.now();
  const myNick = currentPlayerNick ?? (currentPlayerId ? store.players[currentPlayerId]?.nick : undefined);

  const activeMatches = Object.values(store.rooms)
    .filter((r) => {
      if (r.status !== "playing" && r.status !== "countdown") return false;
      // Ignora salas antigas/abandonadas para não ocultar jogadores online como em partida
      if (r.status === "countdown" && now - r.createdAt > 5 * 60_000) return false;
      if (r.status === "playing") {
        const refStart = r.startedAt ?? r.createdAt;
        const maxMs = r.durationSec > 0 ? (r.durationSec + 120) * 1000 : 30 * 60_000;
        if (now - refStart > maxMs) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const onlinePlayers = Object.values(store.players)
    .filter((p) => {
      // Usa `receivedAt` (ancorado no relógio local) quando disponível para evitar ocultar jogadores por skew de relógio
      const seenRef = p.receivedAt ?? p.lastSeenAt;
      if (now - seenRef > 120_000) return false;
      const meetsLevelOrBypass =
        p.level >= 5 ||
        isAdminOrTestAccount({ id: p.playerId, nick: p.nick, full_name: p.fullName });
      if (!meetsLevelOrBypass) return false;
      const isInActiveMatch = activeMatches.some(
        (m) =>
          isSameX1Identity(m.host.playerId, m.host.nick, p.playerId, p.nick) ||
          (m.guest && isSameX1Identity(m.guest.playerId, m.guest.nick, p.playerId, p.nick)),
      );
      return !isInActiveMatch;
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  // Nunca exibe a sala criada pelo próprio jogador como disponível para ele mesmo entrar
  const openRooms = Object.values(store.rooms)
    .filter(
      (r) =>
        r.status === "waiting" &&
        !store.deletedRooms?.[r.code] &&
        !isSameX1Identity(r.host.playerId, r.host.nick, currentPlayerId, myNick),
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const myInvites =
    currentPlayerId || myNick
      ? store.invites.filter(
          (inv) =>
            isSameX1Identity(inv.toPlayerId, inv.toNick, currentPlayerId, myNick) &&
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
    avatar?: PlayerAvatarConfig;
  };
  gameId: GameId;
  minadoGridSize?: X1MinadoGridSize;
  inviteTargetPlayerId?: string;
  inviteTargetNick?: string;
}): X1Room {
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const now = Date.now();
  const safeGameId: GameId = X1_SUPPORTED_GAME_IDS.includes(args.gameId)
    ? args.gameId
    : "rpg";
  const safeMinadoGrid = sanitizeX1MinadoGridSize(args.minadoGridSize);

  // Destrói imediatamente qualquer sala anterior em espera que este mesmo anfitrião tenha deixado aberta
  for (const [oldCode, oldRoom] of Object.entries(store.rooms)) {
    if (
      isSameX1Identity(
        oldRoom.host.playerId,
        oldRoom.host.nick,
        args.host.playerId,
        args.host.nick,
      ) &&
      oldRoom.status === "waiting"
    ) {
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
    gameId: safeGameId,
    status: "waiting",
    revision: 1,
    seed,
    createdAt: now,
    expiresAt: now + X1_ROOM_EXPIRATION_MS, // Expira em 2 minutos se ninguém entrar
    countdownEndsAt: null,
    startedAt: null,
    finishedAt: null,
    durationSec: getX1DurationForGame(safeGameId),
    blueShare: 50,
    minadoGridSize: safeGameId === "minado" ? safeMinadoGrid : undefined,
    host: {
      playerId: args.host.playerId,
      nick: args.host.nick,
      school: args.host.school,
      level: args.host.level,
      age: args.host.age,
      stage: args.host.stage,
      avatar: args.host.avatar,
      score: 0,
      correct: 0,
      wrong: 0,
      hp: X1_ROBOT_INITIAL_HP,
      maxHp: X1_ROBOT_INITIAL_HP,
      finished: false,
      currentQuestionIdx: 0,
      updatedAt: now,
      lastSeenAt: now,
    },
    guest: null,
    winnerId: null,
    minadoState: null,
    rpgEvents: safeGameId === "rpg" ? [] : undefined,
    questionList: undefined,
  };

  store.rooms[code] = room;

  if (args.inviteTargetPlayerId) {
    const targetNick =
      args.inviteTargetNick ?? store.players[args.inviteTargetPlayerId]?.nick;
    store.invites.push({
      id: `inv_${now}_${code}`,
      roomCode: code,
      fromPlayerId: args.host.playerId,
      fromNick: args.host.nick,
      fromSchool: args.host.school,
      toPlayerId: args.inviteTargetPlayerId,
      toNick: targetNick,
      gameId: safeGameId,
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
          detail: {
            inviteId,
            roomCode: inv.roomCode,
            fromPlayerId: inv.fromPlayerId,
            fromNick: inv.fromNick,
            rejectedByNick,
          },
        }),
      );
    }
  }
}

export function cancelWaitingX1Room(
  code: string,
  hostPlayerId?: string,
  hostPlayerNick?: string,
): boolean {
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
  if (
    hostPlayerId &&
    !isSameX1Identity(room.host.playerId, room.host.nick, hostPlayerId, hostPlayerNick)
  ) {
    return false;
  }
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
export function cancelAllWaitingRoomsForHost(
  hostPlayerId: string,
  hostPlayerNick?: string,
): number {
  if (!hostPlayerId && !hostPlayerNick) return 0;
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const now = Date.now();
  let count = 0;

  for (const [code, room] of Object.entries(store.rooms)) {
    if (
      isSameX1Identity(room.host.playerId, room.host.nick, hostPlayerId, hostPlayerNick) &&
      room.status === "waiting"
    ) {
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
  guest: { playerId: string; nick: string; school: string; level: number; avatar?: PlayerAvatarConfig };
  awaitHostHandshake?: boolean;
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
  if (
    isSameX1Identity(room.host.playerId, room.host.nick, args.guest.playerId, args.guest.nick)
  ) {
    return {
      room: null,
      error: "Você não pode entrar na própria sala que criou! Permaneça na tela de espera aguardando um colega.",
    };
  }
  if (room.guest && room.guest.playerId !== args.guest.playerId && room.status !== "waiting") {
    return { room: null, error: "Esta sala já está cheia (2/2) e em andamento." };
  }

  const now = Date.now();
  const serverNow = getX1ServerNow(now);
  const useCloudHandshake = Boolean(args.awaitHostHandshake);
  room.revision = (room.revision ?? 1) + 10;
  room.host.updatedAt = Math.max(room.host.updatedAt, now);
  room.guest = {
    playerId: args.guest.playerId,
    nick: args.guest.nick,
    school: args.guest.school,
    level: args.guest.level,
    avatar: args.guest.avatar,
    score: 0,
    correct: 0,
    wrong: 0,
    hp: X1_ROBOT_INITIAL_HP,
    maxHp: X1_ROBOT_INITIAL_HP,
    finished: false,
    finishedAtServerMs: null,
    currentQuestionIdx: 0,
    updatedAt: now,
    lastSeenAt: now,
  };

  // Inicia contagem regressiva sincronizada de 10 segundos:
  // - No modo online PlayFab, aguarda handshake rápido do Anfitrião (hostReady) para definir o
  //   timestamp absoluto UTC `countdownEndsAtServerMs`, garantindo início 100% simultâneo nos dois aparelhos.
  // - No modo local/testes offline, inicia imediatamente a contagem.
  room.status = "countdown";
  room.guestReady = true;
  room.guestJoinedAtServerMs = serverNow;
  if (useCloudHandshake) {
    room.hostReady = false;
    room.countdownEndsAtServerMs = null;
    room.countdownEndsAt = null;
  } else {
    room.hostReady = true;
    room.countdownEndsAtServerMs = serverNow + X1_COUNTDOWN_DURATION_SEC * 1000;
    room.countdownEndsAt = now + X1_COUNTDOWN_DURATION_SEC * 1000;
  }
  room.startedAt = null;
  room.startedAtServerMs = null;
  room.forfeitByPlayerId = null;
  room.blueShare = 50;

  // Inicializa o tabuleiro ou lista determinística de questões para a partida
  if (room.gameId === "minado") {
    const firstPlayerId = room.seed % 2 === 0 ? room.host.playerId : args.guest.playerId;
    const gridSize = sanitizeX1MinadoGridSize(room.minadoGridSize);
    room.minadoGridSize = gridSize;
    room.minadoState = {
      gridSize,
      board: buildX1Board(room.seed, gridSize),
      revealed: {},
      currentTurnPlayerId: firstPlayerId,
      activeQuestion: null,
      turnStartedAt: now + X1_COUNTDOWN_DURATION_SEC * 1000,
      turnStartedAtServerMs: serverNow + X1_COUNTDOWN_DURATION_SEC * 1000,
      turnSeq: 0,
    };
  } else if (room.gameId !== "rpg") {
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
 * Handshake do Anfitrião: ao detectar que o Desafiante entrou, confirma presença (`hostReady = true`)
 * e fixa o instante absoluto oficial UTC (`countdownEndsAtServerMs`) no relógio do PlayFab,
 * garantindo que ambos os aparelhos contem regressivamente e entrem em `playing` juntos.
 */
export async function confirmX1HostReady(code: string): Promise<X1Room | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  if (isPlayFabConfigured()) {
    await syncX1ServerClockOffset();
  }
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room || room.status !== "countdown" || !room.guest) return room ?? null;

  if (room.hostReady && room.countdownEndsAtServerMs) {
    return room;
  }

  const now = Date.now();
  const serverNow = getX1ServerNow(now);
  // Margem de +800ms para o pacote viajar até o Desafiante, mas ambos usam o MESMO timestamp absoluto UTC
  const targetStartServerMs =
    room.countdownEndsAtServerMs ?? serverNow + X1_COUNTDOWN_DURATION_SEC * 1000;
  room.hostReady = true;
  room.guestReady = true;
  room.countdownEndsAtServerMs = targetStartServerMs;
  room.countdownEndsAt = serverMsToLocalMs(targetStartServerMs);
  if (room.minadoState) {
    room.minadoState.turnStartedAtServerMs = targetStartServerMs;
    room.minadoState.turnStartedAt = serverMsToLocalMs(targetStartServerMs);
  }
  room.revision = (room.revision ?? 1) + 2;
  store.rooms[clean] = room;
  saveStore(store);
  await pushRoomToPlayFab(room);
  return room;
}

/**
 * Fallback de segurança (5s): se o Anfitrião demorar a responder ao handshake por oscilação de rede,
 * destrava a contagem usando o relógio UTC do servidor para a sala nunca ficar presa em "Conectando...".
 */
export async function triggerX1CountdownFallbackIfStuck(
  code: string,
  maxWaitMs = 5000,
): Promise<X1Room | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  if (isPlayFabConfigured()) {
    await syncX1ServerClockOffset();
  }
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room || room.status !== "countdown" || room.countdownEndsAtServerMs) {
    return room ?? null;
  }
  const now = Date.now();
  const serverNow = getX1ServerNow(now);
  const joinedAt = room.guestJoinedAtServerMs ?? serverNow;
  if (serverNow - joinedAt < maxWaitMs) {
    return room;
  }
  const targetStartServerMs = serverNow + X1_COUNTDOWN_DURATION_SEC * 1000;
  room.hostReady = true;
  room.guestReady = true;
  room.countdownEndsAtServerMs = targetStartServerMs;
  room.countdownEndsAt = serverMsToLocalMs(targetStartServerMs);
  if (room.minadoState) {
    room.minadoState.turnStartedAtServerMs = targetStartServerMs;
    room.minadoState.turnStartedAt = serverMsToLocalMs(targetStartServerMs);
  }
  room.revision = (room.revision ?? 1) + 2;
  store.rooms[clean] = room;
  saveStore(store);
  await pushRoomToPlayFab(room);
  return room;
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
    const serverNow = getX1ServerNow(now);
    const officialStartServerMs = room.countdownEndsAtServerMs ?? serverNow;
    room.status = "playing";
    room.hostReady = true;
    room.guestReady = true;
    room.startedAtServerMs = room.startedAtServerMs ?? officialStartServerMs;
    room.startedAt = room.startedAt ?? serverMsToLocalMs(room.startedAtServerMs);
    if (room.minadoState) {
      room.minadoState.turnStartedAtServerMs = room.startedAtServerMs;
      room.minadoState.turnStartedAt = room.startedAt ?? now;
    }
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

  if (x1ServerClockOffsetMs === null) {
    await syncX1ServerClockOffset();
  }

  const roomGroupId = `x1_room_${clean.toLowerCase()}`;

  // 1. Consulta o SharedGroup direto da sala (Room + HostState + GuestState)
  try {
    const remoteRoomData = (await callPlayFabSharedGroup("GetSharedGroupData", {
      SharedGroupId: roomGroupId,
    })) as { Data?: Record<string, { Value: string; LastUpdated?: string }> } | null;

    const remoteRoom = hydrateRemoteRoomWithSideStates(remoteRoomData?.Data);
    if (remoteRoom) {
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
  guest: { playerId: string; nick: string; school: string; level: number; avatar?: PlayerAvatarConfig };
}): Promise<{ room: X1Room | null; error: string | null }> {
  const clean = args.code.trim().toUpperCase();
  if (clean.length !== 4) {
    return { room: null, error: "O código da sala deve ter exatamente 4 dígitos numéricos." };
  }

  // Bloqueio imediato se a sala local for do próprio jogador
  const localCheck = getX1Room(clean);
  if (
    localCheck &&
    isSameX1Identity(
      localCheck.host.playerId,
      localCheck.host.nick,
      args.guest.playerId,
      args.guest.nick,
    )
  ) {
    return {
      room: null,
      error: "Você não pode entrar na própria sala que criou! Permaneça na tela de espera aguardando um colega.",
    };
  }

  // Sincroniza relógio UTC e estado mais recente da nuvem PlayFab (verifica se o anfitrião não cancelou a sala)
  if (isPlayFabConfigured()) {
    await syncX1ServerClockOffset();
    await fetchX1RoomFromCloud(clean);
  }

  // Só inicia contagem imediata no modo local; no navegador com PlayFab aguarda handshake rápido do anfitrião
  const res = joinX1Room({
    ...args,
    awaitHostHandshake: typeof window !== "undefined" && isPlayFabConfigured(),
  });
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
  const clean = args.code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room) return null;

  const isHost = room.host.playerId === args.playerId;
  const side = isHost ? room.host : room.guest;
  if (!side) return room;

  const now = Date.now();
  const serverNow = getX1ServerNow(now);
  room.revision = (room.revision ?? 1) + 1;
  side.score = Math.max(0, Number.isFinite(args.score) ? args.score : side.score);
  side.correct = Math.max(0, args.correct);
  side.wrong = Math.max(0, args.wrong);
  if (args.currentQuestionIdx !== undefined) {
    side.currentQuestionIdx = args.currentQuestionIdx;
  }
  if (args.finished && !side.finished) {
    side.finished = true;
    side.finishedAtServerMs = side.finishedAtServerMs ?? serverNow;
  } else if (args.finished) {
    side.finished = true;
  }
  side.updatedAt = now;
  side.lastSeenAt = now;

  if (room.guest) {
    room.blueShare = computeScoreRaceBlueShare(room.host.score, room.guest.score);
    if (room.host.finished && room.guest.finished && room.status !== "finished") {
      room.status = "finished";
      room.finishedAt = now;
      room.winnerId = resolveX1Winner(room);
      recordX1MatchFinished(room);
    }
  }

  store.rooms[clean] = room;
  saveStore(store);
  void pushPlayerSideToPlayFab(room, isHost ? "host" : "guest");
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
  const clean = args.code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room || !room.guest) {
    return { room: room ?? null, isSuperHit: false, damageDealt: 0 };
  }

  const role: "host" | "guest" = room.host.playerId === args.playerId ? "host" : "guest";
  const res = applyX1RobotBattleAnswer({
    room,
    role,
    isCorrect: args.isCorrect,
  });

  store.rooms[clean] = res.room;
  saveStore(store);
  if (res.room.status === "finished") {
    recordX1MatchFinished(res.room);
  }
  void pushPlayerSideToPlayFab(res.room, role);
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
  const serverNow = getX1ServerNow(now);
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
    minado.turnStartedAtServerMs = serverNow;
    minado.turnSeq = (minado.turnSeq ?? 0) + 1;

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
      expiresAtServerMs: serverNow + 20_000,
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
  minado.turnStartedAtServerMs = getX1ServerNow(now);
  minado.turnSeq = (minado.turnSeq ?? 0) + 1;

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
  minado.turnStartedAtServerMs = getX1ServerNow(now);
  minado.turnSeq = (minado.turnSeq ?? 0) + 1;

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

/**
 * Computa estouro de tempo (25s) sem escolher nenhuma carta na vez do jogador no Campo Minado 1v1.
 * Aplica penalidade leve (-2 pts) e passa a vez para o oponente para evitar travamento da sala.
 */
export function timeoutX1MinadoTurnSelection(
  codeOrArgs: string | { code: string },
): { room: X1Room | null } {
  const code = typeof codeOrArgs === "string" ? codeOrArgs : codeOrArgs.code;
  const store = loadStore();
  const room = store.rooms[code.trim().toUpperCase()];
  if (!room || !room.minadoState || room.status !== "playing") {
    return { room: null };
  }
  const minado = room.minadoState;
  if (minado.activeQuestion) return { room };

  const now = Date.now();
  const serverNow = getX1ServerNow(now);
  const elapsedLocal = now - (minado.turnStartedAt || now);
  const elapsedServer = minado.turnStartedAtServerMs
    ? serverNow - minado.turnStartedAtServerMs
    : elapsedLocal;
  const elapsed = Math.max(elapsedLocal, elapsedServer);
  if (elapsed < (X1_MINADO_TURN_SELECT_TIMEOUT_SEC - 1) * 1000) {
    return { room };
  }

  const isHost = room.host.playerId === minado.currentTurnPlayerId;
  const me = isHost ? room.host : room.guest;
  const opp = isHost ? room.guest : room.host;
  if (!me || !opp) return { room };

  room.revision = (room.revision ?? 1) + 1;
  me.score = Math.max(0, me.score - 2);
  me.wrong += 1;
  me.updatedAt = now;

  minado.currentTurnPlayerId = opp.playerId;
  minado.turnStartedAt = now;
  minado.turnStartedAtServerMs = serverNow;
  minado.turnSeq = (minado.turnSeq ?? 0) + 1;

  store.rooms[room.code] = room;
  saveStore(store);
  void pushRoomToPlayFab(room);
  return { room };
}

export function finishX1RoomByTimeout(code: string): X1Room | null {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room) return null;
  if (room.durationSec <= 0) {
    return room;
  }
  if (room.status !== "finished") {
    room.status = "finished";
    room.revision = (room.revision ?? 1) + 10;
    room.finishedAt = Date.now();
    room.winnerId = resolveX1Winner(room);
    recordX1MatchFinished(room);
    store.rooms[clean] = room;
    saveStore(store);
    void pushRoomToPlayFab(room);
  }
  return room;
}

/**
 * Encerramento justo ao zerar o cronômetro:
 * 1) Envia o último progresso local (`HostState` ou `GuestState`) imediatamente;
 * 2) Aguarda breve janela de consolidação para receber as últimas respostas do oponente;
 * 3) Faz leitura fresca da nuvem (`syncX1WithPlayFabCloud`) e só então fixa o vencedor oficial!
 */
export async function consolidateAndFinishX1ByTimeout(
  code: string,
  myPlayerId: string,
  graceMs = 1100,
): Promise<X1Room | null> {
  const clean = code.trim().toUpperCase();
  const initial = getX1Room(clean);
  if (!initial) return null;
  if (initial.durationSec <= 0) return initial;

  if (isPlayFabConfigured()) {
    const myRole: "host" | "guest" = initial.host.playerId === myPlayerId ? "host" : "guest";
    await pushPlayerSideToPlayFab(initial, myRole, false);
    if (graceMs > 0) {
      await new Promise((r) => setTimeout(r, graceMs));
    }
    await syncX1WithPlayFabCloud(clean);
  }

  return finishX1RoomByTimeout(clean);
}

export function closeX1Room(code: string) {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const prev = store.rooms[clean];
  store.invites = store.invites.filter((i) => i.roomCode !== clean);

  // Se a partida já foi concluída ("finished"), preserva o estado "finished" na nuvem (que expira sozinho em 60s via autoCloseAt)
  // para que o segundo jogador não perca a tela final de vitória/derrota se estiver 1s atrás na rede
  if (prev?.status === "finished") {
    prev.autoCloseAt = prev.autoCloseAt ?? Date.now() + X1_POST_MATCH_AUTOCLOSE_MS;
    store.rooms[clean] = prev;
    saveStore(store);
    return;
  }

  store.deletedRooms[clean] = Date.now();
  delete store.rooms[clean];
  saveStore(store);
  void pushCancelledRoomToPlayFab(clean, prev);
}

/**
 * Desistência / Forfeit voluntário de partida ativa:
 * Concede vitória imediata por W.O. ao oponente e encerra a sala com log oficial.
 */
export function forfeitX1Match(
  code: string,
  forfeitingPlayerId: string,
  useKeepalive = false,
): X1Room | null {
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
    room.forfeitByPlayerId = forfeitingPlayerId;
    room.status = "finished";
    room.revision = (room.revision ?? 1) + 20;
    room.finishedAt = Date.now();
    room.autoCloseAt = Date.now() + X1_POST_MATCH_AUTOCLOSE_MS;
    recordX1MatchFinished(room);
    store.rooms[clean] = room;
    saveStore(store);
    void pushRoomToPlayFab(room, useKeepalive);
    return room;
  } else {
    closeX1Room(clean);
    return null;
  }
}

/**
 * Atualiza o heartbeat do jogador dentro da partida ativa e sincroniza com a nuvem
 * para evitar falsos W.O.s entre dispositivos (sem sobrescrever `updatedAt` de quem já concluiu
 * e sem sobrescrever o estado do oponente na nuvem).
 */
export function touchX1MatchHeartbeat(code: string, playerId: string): X1Room | null {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room || room.status !== "playing") return room ?? null;

  const now = Date.now();
  let role: "host" | "guest";
  if (room.host.playerId === playerId) {
    role = "host";
    room.host.lastSeenAt = now;
    if (!room.host.finished) {
      room.host.updatedAt = Math.max(room.host.updatedAt, now);
    }
  } else if (room.guest?.playerId === playerId) {
    role = "guest";
    room.guest.lastSeenAt = now;
    if (!room.guest.finished) {
      room.guest.updatedAt = Math.max(room.guest.updatedAt, now);
    }
  } else {
    return room;
  }

  // Não incrementa `revision` em pulsos de presença e grava SOMENTE a chave isolada do próprio jogador
  store.rooms[clean] = room;
  saveStore(store);
  void pushPlayerSideToPlayFab(room, role);
  return room;
}

/**
 * Verifica se o oponente ficou sem pulso acima de `timeoutMs` durante a partida;
 * usa timestamp de observação local para ser imune a diferença de relógio entre dispositivos.
 */
export function forfeitX1DisconnectedOpponent(
  code: string,
  myPlayerId: string,
  timeoutMs = X1_MATCH_DISCONNECT_TIMEOUT_MS,
): X1Room | null {
  const clean = code.trim().toUpperCase();
  const store = loadStore();
  const room = store.rooms[clean];
  if (!room || !room.guest || room.status !== "playing") return null;

  const now = Date.now();
  // Nunca declara W.O. antes da partida completar pelo menos `timeoutMs` reais no relógio local
  const matchElapsed = room.startedAt ? now - room.startedAt : 0;
  if (matchElapsed < timeoutMs) return null;

  const isHost = room.host.playerId === myPlayerId;
  const opp = isHost ? room.guest : room.host;
  const observedAt =
    localOppObservedAt.get(`${clean}:${opp.playerId}`) ??
    room.startedAt ??
    now;

  if (now - observedAt < timeoutMs) return null;

  return forfeitX1Match(clean, opp.playerId);
}
