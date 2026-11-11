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
import { isAdminOrTestAccount, type AgeStageId } from "./player-profile.ts";
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
  updatedAt: number;
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
  // Desempate por velocidade quando ambos concluíram todas as questões com a mesma pontuação/acertos/erros
  if (room.host.finished && room.guest.finished && room.host.updatedAt !== room.guest.updatedAt) {
    return room.host.updatedAt < room.guest.updatedAt ? room.host.playerId : room.guest.playerId;
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
      if (!merged.startedAt || Math.abs(now - merged.startedAt) > 3_000) {
        merged.startedAt = now;
      }
    } else if (merged.status === "finished") {
      recordX1MatchFinished(merged);
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
    if (base.gameId !== "rpg" && base.gameId !== "minado") {
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

      // Aplica o deslocamento da barra de Cabo de Guerra caso ambos tenham respondido simultaneamente (+18 acerto / -10 erro)
      const shareDelta =
        dHostCorrect * 18 - dHostWrong * 10 - dGuestCorrect * 18 + dGuestWrong * 10;
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

      // Protege o cronômetro de 20s da questão ativa contra diferenças de relógio entre aparelhos
      const activeQ = base.minadoState.activeQuestion;
      if (activeQ && !activeQ.answered) {
        const localQ = local.minadoState.activeQuestion;
        if (localQ && localQ.cardId === activeQ.cardId && localQ.expiresAt) {
          activeQ.expiresAt = localQ.expiresAt;
        } else {
          const rem = activeQ.expiresAt - now;
          if (rem <= 0 || rem > 22_000) {
            activeQ.expiresAt = now + 20_000;
          }
        }
      }

      if (
        Object.keys(base.minadoState.revealed).length >= base.minadoState.board.length &&
        base.status !== "finished"
      ) {
        base.status = "finished";
        base.finishedAt = base.finishedAt ?? now;
        base.winnerId = resolveX1Winner(base);
        recordX1MatchFinished(base);
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

async function pushRoomToPlayFab(room: X1Room): Promise<void> {
  if (!isPlayFabConfigured()) return;
  const cleanCode = room.code.trim().toUpperCase();
  const roomGroupId = `x1_room_${cleanCode.toLowerCase()}`;
  await ensureSharedGroupExists(roomGroupId);
  // Verifica se a sala não foi cancelada/deletada localmente durante o await de rede
  const currentStore = loadStore();
  if (currentStore.deletedRooms?.[cleanCode]) {
    return;
  }
  const latestRoom = currentStore.rooms[cleanCode];
  if (!latestRoom || latestRoom.status === "cancelled") {
    return;
  }
  await callPlayFabSharedGroup("UpdateSharedGroupData", {
    SharedGroupId: roomGroupId,
    Data: { Room: JSON.stringify(latestRoom) },
    Permission: "Public",
  });
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
    lastActiveAt,
  };
  saveStore(store);
  recordPlayerHeartbeat(player.playerId, {
    nick: player.nick,
    lastSeenAt: now,
    lastActiveAt,
  });
}

export function getX1LobbySnapshot(currentPlayerId?: string, currentPlayerNick?: string) {
  const store = loadStore();
  const myNick = currentPlayerNick ?? (currentPlayerId ? store.players[currentPlayerId]?.nick : undefined);

  const activeMatches = Object.values(store.rooms)
    .filter((r) => r.status === "playing" || r.status === "countdown")
    .sort((a, b) => b.createdAt - a.createdAt);

  const onlinePlayers = Object.values(store.players)
    .filter((p) => {
      if (Date.now() - p.lastSeenAt > 60_000) return false;
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
  };
  gameId: GameId;
  inviteTargetPlayerId?: string;
  inviteTargetNick?: string;
}): X1Room {
  const store = loadStore();
  store.deletedRooms = store.deletedRooms ?? {};
  const now = Date.now();

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
  guest: { playerId: string; nick: string; school: string; level: number };
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
    if (room.minadoState) {
      room.minadoState.turnStartedAt = now;
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
  guest: { playerId: string; nick: string; school: string; level: number };
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
  const elapsed = now - (minado.turnStartedAt || now);
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
