// Modulo de Presenca e Rastreamento de Status Online dos Jogadores
// Browser-safe: Verde = Online (<= 90s), Âmbar = Inativo (90s a 5 min), Vermelho = Offline (> 5 min ou desconectado)

import { useEffect, useState } from "react";
import { nickSlug } from "./player-profile.ts";
import { GAME_NAMES, type GameId } from "./game-storage.ts";
import {
  clearCachedAdminPlayFabTicket,
  clearExpiredStoredSessionTicket,
  getAdminPlayFabTicket,
  getPlayFabTitleId,
  getViewerPlayFabTicket,
  isPlayFabConfigured,
  loadStoredSession,
  validateActiveSession,
  validateActiveSessionRemote,
} from "./playfab.ts";

export type PresenceStatus = "online" | "idle" | "offline";

export type PlayerActivityType =
  | "menu"
  | "game"
  | "ranking"
  | "profile"
  | "medals"
  | "inbox"
  | "x1_arena"
  | "tournament";

export interface PlayerActivityInfo {
  type: PlayerActivityType;
  gameId?: string;
  gameName?: string;
  mode?: "normal" | "torneio_semanal" | "duelo_x1";
  level?: number;
  updatedAt?: number;
}

export interface PlayerPresenceRecord {
  playerId: string;
  playfabId?: string;
  nick?: string;
  nickNormalized?: string;
  lastSeenAt: number;   // Timestamp em ms do último heartbeat (aba aberta/viva)
  lastActiveAt: number; // Timestamp em ms da última interação do aluno (clique, toque, tecla)
  idleMs?: number;      // Tempo inativo medido no relógio do dispositivo do próprio aluno
  disconnected?: boolean;
  activity?: PlayerActivityInfo;
}

export interface PresenceStore {
  players: Record<string, PlayerPresenceRecord>;
  updatedAt: number;
}

// Limiares de tempo especificados:
export const PRESENCE_ONLINE_MAX_AGE_MS = 90 * 1000;       // 1 min 30s com atividade do aluno (Verde)
export const PRESENCE_IDLE_MAX_AGE_MS = 5 * 60 * 1000;     // 5 minutos conectado sem interação (Âmbar/Inativo)
export const PRESENCE_DISCONNECT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos sem heartbeat = aba fechada/suspensa (Vermelho)

const PRESENCE_STORAGE_KEY = "desafios-presence-store-v1";
const LOCAL_LAST_ACTIVE_KEY = "desafios-local-last-active-v1";
export const PRESENCE_SHARED_GROUP_ID = "SEMED_PRESENCE_V3";
export const LEGACY_PRESENCE_SHARED_GROUP_ID = "SEMED_PRESENCE_V2";
export const PRESENCE_UPDATED_EVENT = "desafios:presence-updated";

/**
 * Avalia de forma pura e deterministica o status de presenca de um jogador.
 * - Verde ("online"): fez interacao ha menos de 1 min 30s (com heartbeat ativo).
 * - Amarelo/Âmbar ("idle"): sem interacao entre 1 min 30s e 5 minutos (aba continua aberta conectada).
 * - Vermelho ("offline"): mais de 5 minutos sem interacao OU sem heartbeat recente (aba fechada/desconectada).
 */
export function computePresenceStatus(
  record?: { lastSeenAt?: number; lastActiveAt?: number; idleMs?: number; disconnected?: boolean } | null,
  now = Date.now()
): PresenceStatus {
  if (
    !record ||
    record.disconnected ||
    typeof record.lastSeenAt !== "number" ||
    record.lastSeenAt <= 0
  ) {
    return "offline";
  }

  // Se o heartbeat está mais antigo que o limite de desconexão (5 min), a aba foi fechada/suspensa
  const timeSinceSeen = Math.max(0, now - record.lastSeenAt);
  if (timeSinceSeen > PRESENCE_DISCONNECT_MAX_AGE_MS) {
    return "offline";
  }

  const lastActive = typeof record.lastActiveAt === "number" && record.lastActiveAt > 0
    ? record.lastActiveAt
    : record.lastSeenAt;

  const timeSinceActive =
    typeof record.idleMs === "number" && record.idleMs >= 0
      ? Math.max(0, timeSinceSeen + record.idleMs)
      : Math.max(0, now - lastActive);

  if (timeSinceActive <= PRESENCE_ONLINE_MAX_AGE_MS) {
    return "online";
  }

  if (timeSinceActive <= PRESENCE_IDLE_MAX_AGE_MS) {
    return "idle";
  }

  return "offline";
}

/**
 * Formata de maneira amigável em português o tempo decorrido desde a última atividade online
 * Ex: "Online agora", "Inativo há 7 min", "Online há 15 min", "Online há 2 horas", "Online ontem às 15:30", "Online há 3 dias"
 */
export function formatPresenceTimeAgo(
  record?: { lastActiveAt?: number; lastSeenAt?: number; disconnected?: boolean; idleMs?: number } | null,
  now = Date.now()
): string {
  if (!record) return "Nunca conectou";

  const status = computePresenceStatus(record, now);
  if (status === "online") {
    return "Online agora";
  }

  // Se estiver conectado mas inativo (1 min 30s a 5 min)
  if (status === "idle") {
    const lastActive = record.lastActiveAt && record.lastActiveAt > 0 ? record.lastActiveAt : record.lastSeenAt;
    const diffMs = lastActive ? Math.max(0, now - lastActive) : PRESENCE_ONLINE_MAX_AGE_MS;
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return `Inativo há ${mins} min (conectado)`;
  }

  // Status offline: calcula o tempo desde a última presença
  const refTime =
    (record.lastActiveAt && record.lastActiveAt > 0)
      ? record.lastActiveAt
      : (record.lastSeenAt && record.lastSeenAt > 0)
        ? record.lastSeenAt
        : 0;

  if (!refTime || refTime <= 0) {
    return "Nunca conectou";
  }

  const diffMs = Math.max(0, now - refTime);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) {
    return "Online há instantes";
  }

  if (diffMin < 60) {
    return diffMin === 1 ? "Online há 1 minuto" : `Online há ${diffMin} minutos`;
  }

  if (diffHours < 24) {
    return diffHours === 1 ? "Online há 1 hora" : `Online há ${diffHours} horas`;
  }

  const refDate = new Date(refTime);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    refDate.getDate() === yesterday.getDate() &&
    refDate.getMonth() === yesterday.getMonth() &&
    refDate.getFullYear() === yesterday.getFullYear();

  const hh = String(refDate.getHours()).padStart(2, "0");
  const mm = String(refDate.getMinutes()).padStart(2, "0");

  if (isYesterday || diffHours < 48) {
    return `Online ontem às ${hh}:${mm}`;
  }

  if (diffDays >= 2 && diffDays < 7) {
    return `Online há ${diffDays} dias`;
  }

  return "Ausente há mais de 1 semana";
}

/**
 * Retorna uma descricao textual legivel para acessibilidade e tooltip
 */
export function formatPresenceTooltip(
  status: PresenceStatus,
  record?: { lastActiveAt?: number; lastSeenAt?: number; nick?: string; disconnected?: boolean } | null,
  now = Date.now()
): string {
  const nickPrefix = record?.nick ? `${record.nick}: ` : "";
  const timeAgo = formatPresenceTimeAgo(record, now);
  if (status === "online") {
    return `${nickPrefix}Online — Ativo agora`;
  }
  return `${nickPrefix}${timeAgo}`;
}

/**
 * Chave de armazenamento e evento de transição de atividade do jogador local
 */
export const ACTIVITY_STORAGE_KEY = "desafios-current-activity-v1";
export const ACTIVITY_CHANGED_EVENT = "desafios:activity-changed";

let currentLocalActivity: PlayerActivityInfo = {
  type: "menu",
  updatedAt: Date.now(),
};

/**
 * Atualiza a atividade atual do jogador no cliente (ex: jogando determinado jogo, no ranking, etc.)
 */
export function setPlayerCurrentActivity(
  activity: Partial<PlayerActivityInfo> & { type: PlayerActivityType }
): void {
  const gId = activity.gameId as GameId | undefined;
  const normalizedGId = gId ? (gId.toLowerCase().replace(/[_-]/g, "") as GameId) : undefined;
  const gameName =
    activity.gameName ||
    (gId && GAME_NAMES[gId]) ||
    (normalizedGId && GAME_NAMES[normalizedGId]) ||
    undefined;

  currentLocalActivity = {
    ...activity,
    gameName,
    updatedAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(currentLocalActivity));
      window.dispatchEvent(
        new CustomEvent(ACTIVITY_CHANGED_EVENT, { detail: currentLocalActivity })
      );
    } catch {
      // ignore
    }
  }
}

/**
 * Atualiza em tempo real o nível da partida em andamento quando o jogador sobe de nível no jogo.
 */
export function updateActiveGameLevel(level: number): void {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const cur = getPlayerCurrentActivity();
  if (cur.type === "game" && cur.level !== safeLevel) {
    setPlayerCurrentActivity({
      ...cur,
      level: safeLevel,
    });
  }
}

/**
 * Recupera a atividade atual do jogador local
 */
export function getPlayerCurrentActivity(): PlayerActivityInfo {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerActivityInfo;
        if (parsed?.type) {
          currentLocalActivity = parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return currentLocalActivity;
}

/**
 * Formata em texto claro a atividade que o aluno está realizando no momento.
 * Regra do usuário: O offline continua do jeito que está; se offline, retorna null (sem atividade ativa).
 */
export function formatPlayerActivity(
  activity?: PlayerActivityInfo | null,
  status?: PresenceStatus
): string | null {
  if (status === "offline" || !activity) return null;

  switch (activity.type) {
    case "game": {
      const gId = activity.gameId as GameId | undefined;
      const normalizedGId = gId ? (gId.toLowerCase().replace(/[_-]/g, "") as GameId) : undefined;
      const gName =
        activity.gameName ||
        (gId && GAME_NAMES[gId]) ||
        (normalizedGId && GAME_NAMES[normalizedGId]) ||
        activity.gameId ||
        "Jogo";
      const lvlStr = activity.level ? ` (Nível ${activity.level})` : "";
      const modeStr =
        activity.mode === "torneio_semanal"
          ? " • Ranqueada"
          : activity.mode === "duelo_x1"
            ? " • Duelo X1"
            : "";
      return `Jogando ${gName}${lvlStr}${modeStr}`;
    }
    case "ranking":
      return "Visualizando o Ranking";
    case "profile":
      return "Olhando o Perfil";
    case "medals":
      return "Olhando Medalhas";
    case "inbox":
      return "Na Caixa de Entrada";
    case "x1_arena":
      return "Na Arena X1";
    case "tournament":
      return "No Torneio Ranqueado";
    case "menu":
      return "No Menu Principal";
    default:
      return null;
  }
}

/**
 * Retorna os detalhes estilizados e ícone da atividade do jogador para exibição na UI do ADM
 */
export function getPlayerActivityDetails(
  record?: {
    activity?: PlayerActivityInfo;
    lastSeenAt?: number;
    lastActiveAt?: number;
    disconnected?: boolean;
    idleMs?: number;
  } | null,
  now = Date.now()
): {
  type: PlayerActivityType;
  label: string;
  icon: string;
  isIdle: boolean;
  colorClass: string;
} | null {
  if (!record) return null;
  const status = computePresenceStatus(record, now);
  if (status === "offline") return null;

  const activity = record.activity;
  const effectiveActivity: PlayerActivityInfo = activity || {
    type: "menu",
    updatedAt: record.lastActiveAt || now,
  };

  const label = formatPlayerActivity(effectiveActivity, status);
  if (!label) return null;

  const isIdle = status === "idle";
  let icon = "🎮";
  let colorClass = "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";

  switch (effectiveActivity.type) {
    case "game":
      icon = "🎮";
      colorClass = "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
      break;
    case "ranking":
      icon = "🏆";
      colorClass = "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400";
      break;
    case "profile":
      icon = "👤";
      colorClass = "bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400";
      break;
    case "medals":
      icon = "🎖️";
      colorClass = "bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400";
      break;
    case "inbox":
      icon = "📬";
      colorClass = "bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-400";
      break;
    case "x1_arena":
      icon = "⚔️";
      colorClass = "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400";
      break;
    case "tournament":
      icon = "🏆";
      colorClass = "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400";
      break;
    case "menu":
    default:
      icon = "🏠";
      colorClass = "bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-zinc-400";
      break;
  }

  return {
    type: effectiveActivity.type,
    label: isIdle ? `${label} (inativo)` : label,
    icon,
    isIdle,
    colorClass,
  };
}

let cachedPresenceRaw: string | null = null;
let cachedPresenceStore: PresenceStore | null = null;
let cachedPresenceIndexMap: Map<string, PlayerPresenceRecord> | null = null;

function buildPresenceIndexMap(store: PresenceStore): Map<string, PlayerPresenceRecord> {
  const map = new Map<string, PlayerPresenceRecord>();
  const put = (key: string | undefined | null, rec: PlayerPresenceRecord) => {
    if (!key) return;
    const cur = map.get(key);
    const recTs = Math.max(rec.lastSeenAt || 0, rec.lastActiveAt || 0);
    const curTs = cur ? Math.max(cur.lastSeenAt || 0, cur.lastActiveAt || 0) : -1;
    if (!cur || recTs > curTs) {
      map.set(key, rec);
    }
  };
  for (const [k, item] of Object.entries(store.players ?? {})) {
    if (!item) continue;
    put(k, item);
    put(k.toLowerCase(), item);
    if (item.playerId) {
      put(item.playerId, item);
      put(item.playerId.toLowerCase(), item);
    }
    if (item.playfabId) {
      put(item.playfabId, item);
    }
    const itemSlug = item.nickNormalized || (item.nick ? nickSlug(item.nick) : "");
    if (itemSlug) {
      put(itemSlug, item);
      put(`pf_${itemSlug}`, item);
    }
  }
  return map;
}

function loadPresenceStoreReadOnly(): PresenceStore {
  if (typeof window === "undefined") {
    return { players: {}, updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (!raw) {
      cachedPresenceRaw = null;
      cachedPresenceStore = null;
      cachedPresenceIndexMap = null;
      return { players: {}, updatedAt: 0 };
    }
    if (raw === cachedPresenceRaw && cachedPresenceStore) {
      return cachedPresenceStore;
    }
    const parsed = JSON.parse(raw) as PresenceStore;
    cachedPresenceRaw = raw;
    cachedPresenceStore = parsed;
    cachedPresenceIndexMap = buildPresenceIndexMap(parsed);
    return parsed;
  } catch {
    return { players: {}, updatedAt: 0 };
  }
}

/**
 * Carrega a base local de presenca
 */
export function loadPresenceStore(): PresenceStore {
  if (typeof window === "undefined") {
    return { players: {}, updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (!raw) return { players: {}, updatedAt: 0 };
    return JSON.parse(raw) as PresenceStore;
  } catch {
    return { players: {}, updatedAt: 0 };
  }
}

/**
 * Salva e notifica os componentes do aplicativo
 */
export function savePresenceStore(store: PresenceStore): void {
  if (typeof window === "undefined") return;
  try {
    store.updatedAt = Date.now();
    const serialized = JSON.stringify(store);
    cachedPresenceRaw = serialized;
    cachedPresenceStore = store;
    cachedPresenceIndexMap = buildPresenceIndexMap(store);
    localStorage.setItem(PRESENCE_STORAGE_KEY, serialized);
    window.dispatchEvent(new CustomEvent(PRESENCE_UPDATED_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Registra atividade do usuario local na aba (mouse, tecla, toque, scroll)
 */
let lastLocalActivityTimestamp = Date.now();

export function recordLocalUserActivity(now = Date.now()): void {
  lastLocalActivityTimestamp = now;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_LAST_ACTIVE_KEY, String(now));
    } catch {
      // ignore
    }
  }
}

export function getLocalUserLastActiveAt(): number {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCAL_LAST_ACTIVE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > lastLocalActivityTimestamp) {
          lastLocalActivityTimestamp = parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return lastLocalActivityTimestamp;
}

/**
 * Atualiza o pulso de presenca de um jogador
 */
export function recordPlayerHeartbeat(
  playerId: string,
  data?: {
    playfabId?: string;
    nick?: string;
    nickNormalized?: string;
    lastActiveAt?: number;
    lastSeenAt?: number;
    idleMs?: number;
    disconnected?: boolean;
    activity?: PlayerActivityInfo;
  }
): PlayerPresenceRecord | null {
  if (!playerId) return null;
  const store = loadPresenceStore();
  const now = Date.now();
  const existing = store.players[playerId];

  const lastSeenAt = data?.disconnected ? 0 : (data?.lastSeenAt ?? now);
  const lastActiveAt = data?.lastActiveAt ?? existing?.lastActiveAt ?? lastSeenAt;
  const resolvedNick = data?.nick ?? existing?.nick;
  const resolvedSlug =
    data?.nickNormalized ||
    (resolvedNick ? nickSlug(resolvedNick) : existing?.nickNormalized);
  const idleMs =
    typeof data?.idleMs === "number"
      ? Math.max(0, data.idleMs)
      : lastSeenAt > 0
        ? Math.max(0, lastSeenAt - lastActiveAt)
        : 0;

  // Só recorre à atividade local do navegador quando o registro pertence ao próprio jogador logado
  const localSessId = loadStoredSession()?.playerId;
  const isLocalPlayer = Boolean(
    localSessId &&
      (playerId === localSessId ||
        resolvedSlug === localSessId ||
        `pf_${localSessId}` === playerId),
  );
  const activity =
    data?.activity ??
    (data?.disconnected
      ? undefined
      : (existing?.activity ?? (isLocalPlayer ? getPlayerCurrentActivity() : undefined)));

  const record: PlayerPresenceRecord = {
    playerId,
    playfabId: data?.playfabId ?? existing?.playfabId,
    nick: resolvedNick,
    nickNormalized: resolvedSlug,
    lastSeenAt,
    lastActiveAt,
    idleMs,
    disconnected: Boolean(data?.disconnected),
    activity,
  };

  store.players[playerId] = record;
  if (resolvedSlug) {
    store.players[resolvedSlug] = record;
    store.players[`pf_${resolvedSlug}`] = record;
  }
  if (record.playfabId) {
    store.players[record.playfabId] = record;
  }

  savePresenceStore(store);
  return record;
}

/* --------------------- Sincronização em Nuvem (PlayFab SharedGroup) --------------------- */

let presenceGroupCreated = false;
let legacyPresenceV2Loaded = false;
let preferViewerTicketForSharedGroup = false;
let userDataPresenceCursor = 0;
let inFlightUserDataPresenceSync: Promise<void> | null = null;
let lastUserDataPresenceSyncAt = 0;
let lastPresenceCloudSyncAt = 0;
let inFlightPresenceSync: Promise<void> | null = null;
let serverClockOffsetMs: number | null = null;
let lastServerClockSyncAt = 0;

/**
 * Obtém o horário oficial UTC do PlayFab (GetTime) para calibrar a diferença
 * de relógio entre o dispositivo do usuário e o servidor, garantindo precisão em LastUpdated.
 */
export async function syncServerClockOffset(): Promise<number> {
  const now = Date.now();
  if (serverClockOffsetMs !== null && now - lastServerClockSyncAt < 5 * 60 * 1000) {
    return serverClockOffsetMs;
  }
  try {
    const res = await callPresencePlayFab("GetTime", {});
    const timeStr = (res?.data as { Time?: string } | undefined)?.Time;
    if (timeStr) {
      const serverMs = Date.parse(timeStr);
      if (!Number.isNaN(serverMs)) {
        serverClockOffsetMs = serverMs - Date.now();
        lastServerClockSyncAt = Date.now();
        return serverClockOffsetMs;
      }
    }
  } catch {
    // fallback
  }
  return serverClockOffsetMs ?? 0;
}

async function callPresencePlayFab(
  endpoint: string,
  body: Record<string, unknown>,
  canRetry = true,
  overrideTicket?: string,
  keepalive = false,
): Promise<{ data?: Record<string, unknown>; serverDate?: string | null } | null> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return null;
  const titleId = getPlayFabTitleId();
  if (!titleId) return null;
  const session = loadStoredSession();
  const ticket = overrideTicket ?? (await getAdminPlayFabTicket()) ?? session?.sessionTicket;
  if (!ticket) return null;

  try {
    const res = await fetch(`https://${titleId}.playfabapi.com/Client/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, ...body }),
      keepalive,
    });
    const serverDate = res.headers.get("date");
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      error?: string;
      errorCode?: number;
      errorMessage?: string;
    };

    // Renovação automática caso o ticket em cache ou na sessão tenha expirado ou sido invalidado no PlayFab
    // IMPORTANTE: No PlayFab, "NotAuthorized" (1075) retorna HTTP 401 e significa apenas que o aluno
    // não é membro do SharedGroup, NÃO que o sessionTicket expirou — nunca apagar o sessionTicket por NotAuthorized!
    const isNotAuthorized =
      json.errorCode === 1075 || json.error === "NotAuthorized";
    const isExpiredTicket =
      !isNotAuthorized &&
      (json.errorCode === 1074 ||
        json.errorCode === 1089 ||
        json.error === "NotAuthenticated" ||
        json.error === "InvalidSessionTicket" ||
        (res.status === 401 && !json.error));

    if (isExpiredTicket) {
      clearCachedAdminPlayFabTicket();
      clearExpiredStoredSessionTicket(ticket);
      if (!overrideTicket && canRetry) {
        return callPresencePlayFab(endpoint, body, false, undefined, keepalive);
      }
      return null;
    }

    if (!overrideTicket && isNotAuthorized) {
      clearCachedAdminPlayFabTicket();
      return null;
    }

    if (json.error) {
      return null;
    }
    return { data: json.data, serverDate };
  } catch {
    return null;
  }
}

/**
 * Envia o pulso de presença do jogador atual para o UserData público e para o SharedGroup global no PlayFab.
 */
export async function pushPresenceToPlayFab(record: PlayerPresenceRecord): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  try {
    const slug =
      record.nickNormalized ||
      (record.nick ? nickSlug(record.nick) : nickSlug(record.playerId));
    const payloadStr = JSON.stringify({
      playerId: record.playerId,
      playfabId: record.playfabId,
      nick: record.nick,
      nickNormalized: slug,
      lastSeenAt: record.lastSeenAt,
      lastActiveAt: record.lastActiveAt,
      idleMs:
        typeof record.idleMs === "number"
          ? record.idleMs
          : Math.max(0, record.lastSeenAt - record.lastActiveAt),
      disconnected: Boolean(record.disconnected),
      activity: record.activity,
    });

    const isExit = Boolean(record.disconnected);

    // 1. Grava no UserData público da própria conta logada (se o sessionTicket do aluno estiver válido)
    const ownTicket = loadStoredSession()?.sessionTicket;
    if (ownTicket && !ownTicket.startsWith("admin-")) {
      void callPresencePlayFab(
        "UpdateUserData",
        {
          Data: { PresenceHeartbeat: payloadStr },
          Permission: "Public",
        },
        false,
        ownTicket,
        isExit,
      );
    }

    // 2. Grava no SharedGroup global SEMED_PRESENCE_V3 (onde a conta de serviço semedvisitante e o ADM são membros)
    const key = `pres_${slug || record.playerId}`;
    const sgBody = {
      SharedGroupId: PRESENCE_SHARED_GROUP_ID,
      Data: { [key]: payloadStr },
      Permission: "Public",
    };

    if (!presenceGroupCreated && !isExit) {
      const createRes = await callPresencePlayFab("CreateSharedGroup", {
        SharedGroupId: PRESENCE_SHARED_GROUP_ID,
      });
      if (createRes) {
        void callPresencePlayFab("AddSharedGroupMembers", {
          SharedGroupId: PRESENCE_SHARED_GROUP_ID,
          PlayFabIds: ["FB6662558A38ACAD", "1B2E1517154B2D49"],
        });
      }
      presenceGroupCreated = true;
    }

    if (preferViewerTicketForSharedGroup) {
      const viewerTicket = await getViewerPlayFabTicket();
      if (viewerTicket) {
        const directRes = await callPresencePlayFab("UpdateSharedGroupData", sgBody, false, viewerTicket, isExit);
        if (directRes) return;
        await callPresencePlayFab("CreateSharedGroup", { SharedGroupId: PRESENCE_SHARED_GROUP_ID }, false, viewerTicket);
        await callPresencePlayFab("UpdateSharedGroupData", sgBody, false, viewerTicket, isExit);
        return;
      }
    }

    const sgRes = await callPresencePlayFab(
      "UpdateSharedGroupData",
      sgBody,
      true,
      undefined,
      isExit,
    );
    if (!sgRes) {
      const viewerTicket = await getViewerPlayFabTicket();
      if (viewerTicket && viewerTicket !== ownTicket) {
        await callPresencePlayFab("CreateSharedGroup", { SharedGroupId: PRESENCE_SHARED_GROUP_ID }, false, viewerTicket);
        const retryRes = await callPresencePlayFab(
          "UpdateSharedGroupData",
          sgBody,
          false,
          viewerTicket,
          isExit,
        );
        if (retryRes) {
          preferViewerTicketForSharedGroup = true;
        }
      }
    }
  } catch {
    /* ignore network issues */
  }
}

function shouldKeepExistingPresence(
  existing: PlayerPresenceRecord | undefined,
  incoming: {
    disconnected?: boolean;
    lastSeenAt: number;
    lastActiveAt: number;
    activityUpdatedAt?: number;
  },
): boolean {
  if (!existing) return false;
  if (incoming.disconnected) {
    // Nunca sobrescreve evidência online mais recente com um logout/disconnect antigo
    if (!existing.disconnected && existing.lastSeenAt > incoming.lastActiveAt) {
      return true;
    }
    // Entre dois registros offline, preserva o mais recente
    const existingTs = Math.max(existing.lastSeenAt || 0, existing.lastActiveAt || 0);
    if (existing.disconnected && existingTs >= incoming.lastActiveAt && incoming.lastActiveAt > 0) {
      return true;
    }
    return false;
  }
  // Registro online: nunca sobrescreve um heartbeat estritamente mais recente (normalizado pelo servidor)
  if (
    !existing.disconnected &&
    existing.lastSeenAt > 0 &&
    incoming.lastSeenAt > 0 &&
    Math.abs(existing.lastSeenAt - incoming.lastSeenAt) > 2000
  ) {
    return existing.lastSeenAt > incoming.lastSeenAt;
  }
  // Quando os heartbeats são praticamente simultâneos (<= 2s), desempata pela troca de atividade mais recente
  const existingActTs = existing.activity?.updatedAt ?? 0;
  const incomingActTs = incoming.activityUpdatedAt ?? 0;
  if (!existing.disconnected && existingActTs > 0 && incomingActTs > 0) {
    if (incomingActTs < existingActTs) return true;
    if (incomingActTs > existingActTs) return false;
  }
  if (!existing.disconnected && existing.lastSeenAt > incoming.lastSeenAt && incoming.lastSeenAt > 0) {
    return true;
  }
  // Se o registro existente é offline, só sobrescreve se o heartbeat online for mais recente que o disconnect
  if (existing.disconnected && existing.lastActiveAt > incoming.lastSeenAt) {
    return true;
  }
  return false;
}

/**
 * Incorpora um pulso de presença vindo do UserData público de um jogador ao cache local de presença.
 */
export function applyRemotePresenceHeartbeat(rawJson: string, lastUpdated?: string): void {
  if (typeof window === "undefined" || !rawJson) return;
  try {
    const remote = JSON.parse(rawJson) as Partial<PlayerPresenceRecord>;

    // Normaliza o horário pelo relógio do servidor PlayFab (imune a celular com hora errada)
    if (lastUpdated) {
      const entryMs = Date.parse(lastUpdated);
      if (!Number.isNaN(entryMs)) {
        const nowMs = Date.now();
        const ageMs = Math.max(0, nowMs + (serverClockOffsetMs ?? 0) - entryMs);
        const idle =
          typeof remote.idleMs === "number" && remote.idleMs >= 0
            ? remote.idleMs
            : Math.max(0, (remote.lastSeenAt ?? 0) - (remote.lastActiveAt ?? remote.lastSeenAt ?? 0));
        const seen = Math.max(1, nowMs - ageMs);
        if (remote.disconnected) {
          remote.lastSeenAt = 0;
          remote.lastActiveAt = Math.max(1, seen - idle);
        } else {
          remote.lastSeenAt = seen;
          remote.lastActiveAt = Math.max(1, seen - idle);
        }
        remote.idleMs = idle;
      }
    }
    if (!remote.playerId && !remote.nickNormalized && !remote.nick) return;
    const slug =
      remote.nickNormalized ||
      (remote.nick ? nickSlug(remote.nick) : "");
    const pId = remote.playerId || (slug ? `pf_${slug}` : "");
    if (!pId) return;

    const store = loadPresenceStore();
    const existing = store.players[pId] || (slug ? store.players[slug] : undefined);
    const remoteSeen = remote.disconnected ? 0 : (typeof remote.lastSeenAt === "number" ? remote.lastSeenAt : 0);
    const remoteActive = typeof remote.lastActiveAt === "number" ? remote.lastActiveAt : remoteSeen;

    if (
      shouldKeepExistingPresence(existing, {
        disconnected: Boolean(remote.disconnected),
        lastSeenAt: remoteSeen,
        lastActiveAt: remoteActive,
        activityUpdatedAt: remote.activity?.updatedAt,
      })
    ) {
      return;
    }

    const rec: PlayerPresenceRecord = {
      playerId: pId,
      playfabId: remote.playfabId,
      nick: remote.nick,
      nickNormalized: slug,
      lastSeenAt: remote.disconnected ? 0 : remoteSeen,
      lastActiveAt: remoteActive,
      idleMs: remote.idleMs ?? 0,
      disconnected: Boolean(remote.disconnected),
      activity: remote.activity,
    };

    store.players[pId] = rec;
    if (slug) {
      store.players[slug] = rec;
      store.players[`pf_${slug}`] = rec;
    }
    if (remote.playfabId) {
      store.players[remote.playfabId] = rec;
    }
    savePresenceStore(store);
  } catch {
    /* ignore malformed heartbeat */
  }
}

const PLAYFAB_ID_REGEX = /^[0-9A-F]{12,20}$/i;

/**
 * Lê o PresenceHeartbeat público (UserData) de cada aluno informado — fonte principal de presença,
 * pois cada jogador sempre pode gravar nos próprios dados. Processa em rodízio (até maxPerCycle
 * alunos por chamada, com concorrência limitada) para não estourar limites de requisição do PlayFab.
 */
export async function syncPresenceFromUserData(
  targets: Array<{ id?: string; playfabId?: string }>,
  options?: { maxPerCycle?: number; concurrency?: number; force?: boolean },
): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  const now = Date.now();
  if (!options?.force && now - lastUserDataPresenceSyncAt < 2500) return;
  if (inFlightUserDataPresenceSync) return inFlightUserDataPresenceSync;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    const pf = t.playfabId || (t.id && PLAYFAB_ID_REGEX.test(t.id) ? t.id : "");
    if (pf && !seen.has(pf)) {
      seen.add(pf);
      ids.push(pf);
    }
  }
  if (ids.length === 0) return;

  const maxPerCycle = Math.max(1, options?.maxPerCycle ?? 40);
  const concurrency = Math.max(1, options?.concurrency ?? 6);
  const start = userDataPresenceCursor % ids.length;
  const batch: string[] = [];
  for (let i = 0; i < Math.min(maxPerCycle, ids.length); i++) {
    batch.push(ids[(start + i) % ids.length]);
  }
  userDataPresenceCursor = (start + batch.length) % ids.length;
  lastUserDataPresenceSyncAt = now;

  inFlightUserDataPresenceSync = (async () => {
    try {
      if (serverClockOffsetMs === null || Date.now() - lastServerClockSyncAt > 5 * 60 * 1000) {
        await syncServerClockOffset();
      }
      let idx = 0;
      const worker = async () => {
        while (idx < batch.length) {
          const pfId = batch[idx++];
          const res = await callPresencePlayFab("GetUserData", {
            PlayFabId: pfId,
            Keys: ["PresenceHeartbeat"],
          });
          const entry = (
            res?.data as
              | { Data?: Record<string, { Value?: string; LastUpdated?: string }> }
              | undefined
          )?.Data?.PresenceHeartbeat;
          if (entry?.Value) {
            applyRemotePresenceHeartbeat(entry.Value, entry.LastUpdated);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
    } finally {
      inFlightUserDataPresenceSync = null;
    }
  })();
  return inFlightUserDataPresenceSync;
}

/**
 * Baixa os registros de presença de todos os alunos na nuvem (PlayFab),
 * normalizando os timestamps para eliminar problemas de relógio desajustado entre dispositivos.
 */
export async function syncPresenceFromPlayFab(force = false): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  const now = Date.now();
  if (!force && now - lastPresenceCloudSyncAt < 2000) return;
  if (inFlightPresenceSync) return inFlightPresenceSync;

  inFlightPresenceSync = (async () => {
    try {
      lastPresenceCloudSyncAt = Date.now();
      if (!presenceGroupCreated) {
        await callPresencePlayFab("CreateSharedGroup", {
          SharedGroupId: PRESENCE_SHARED_GROUP_ID,
        });
        presenceGroupCreated = true;
      }

      const store = loadPresenceStore();
      const shouldFetchLegacyV2 =
        !legacyPresenceV2Loaded || Object.keys(store.players ?? {}).length === 0;

      const [res, legacyV2Res] = await Promise.all([
        callPresencePlayFab("GetSharedGroupData", {
          SharedGroupId: PRESENCE_SHARED_GROUP_ID,
        }),
        shouldFetchLegacyV2
          ? callPresencePlayFab("GetSharedGroupData", {
              SharedGroupId: LEGACY_PRESENCE_SHARED_GROUP_ID,
            })
          : Promise.resolve(null),
      ]);

      if (shouldFetchLegacyV2 && (legacyV2Res || res)) {
        legacyPresenceV2Loaded = true;
      }

      const resData = res?.data as {
        Data?: Record<string, { Value: string; LastUpdated?: string }>;
      } | undefined;
      const legacyData = legacyV2Res?.data as {
        Data?: Record<string, { Value: string; LastUpdated?: string }>;
      } | undefined;

      // Mescla fallback histórico do SEMED_PRESENCE_V2 (188 alunos legados) sem nunca sobrescrever dados mais novos do V3
      const combinedData: Record<string, { Value: string; LastUpdated?: string }> = {
        ...(legacyData?.Data ?? {}),
      };
      for (const [k, v3Entry] of Object.entries(resData?.Data ?? {})) {
        const v2Entry = combinedData[k];
        if (!v2Entry) {
          combinedData[k] = v3Entry;
        } else {
          const v3Ms = v3Entry.LastUpdated ? Date.parse(v3Entry.LastUpdated) : 0;
          const v2Ms = v2Entry.LastUpdated ? Date.parse(v2Entry.LastUpdated) : 0;
          if (!v2Ms || v3Ms >= v2Ms) {
            combinedData[k] = v3Entry;
          }
        }
      }

      if (Object.keys(combinedData).length === 0) return;

      const localSessionId = loadStoredSession()?.playerId;
      const syncNow = Date.now();
      let changed = false;

      // Mantém calibração de horário com o servidor PlayFab (aguarda na primeira vez para não usar offset 0)
      if (serverClockOffsetMs === null) {
        await syncServerClockOffset();
      } else if (syncNow - lastServerClockSyncAt > 5 * 60 * 1000) {
        void syncServerClockOffset();
      }
      const curServerNow = syncNow + (serverClockOffsetMs ?? 0);

      for (const [key, entry] of Object.entries(combinedData)) {
        if (!entry?.Value) continue;
        try {
          const remote = JSON.parse(entry.Value) as Partial<PlayerPresenceRecord>;
          if (!remote.playerId && !remote.nickNormalized && !remote.nick) continue;

          const slug =
            remote.nickNormalized ||
            (remote.nick ? nickSlug(remote.nick) : key.replace(/^pres_/, ""));
          const pId = remote.playerId || `pf_${slug}`;

          if (remote.disconnected || !remote.lastSeenAt || remote.lastSeenAt <= 0) {
            const existingOff = store.players[pId] || (slug ? store.players[slug] : undefined);
            let normalizedOffActive =
              remote.lastActiveAt && remote.lastActiveAt > 0
                ? remote.lastActiveAt
                : remote.lastSeenAt && remote.lastSeenAt > 0
                  ? remote.lastSeenAt
                  : 0;
            if (entry.LastUpdated) {
              const entryMs = Date.parse(entry.LastUpdated);
              if (!Number.isNaN(entryMs)) {
                const ageMs = Math.max(0, curServerNow - entryMs);
                const idle =
                  typeof remote.idleMs === "number" && remote.idleMs >= 0
                    ? remote.idleMs
                    : 0;
                normalizedOffActive = Math.max(1, syncNow - ageMs - idle);
              }
            }
            const preservedActiveAt = normalizedOffActive || (existingOff?.lastActiveAt || 0);

            if (
              shouldKeepExistingPresence(existingOff, {
                disconnected: true,
                lastSeenAt: 0,
                lastActiveAt: preservedActiveAt,
              })
            ) {
              continue;
            }

            const offUnchanged =
              existingOff &&
              existingOff.disconnected === true &&
              existingOff.lastSeenAt === 0 &&
              Math.abs((existingOff.lastActiveAt || 0) - preservedActiveAt) < 1500;

            if (!offUnchanged) {
              const offRec: PlayerPresenceRecord = {
                playerId: pId,
                playfabId: remote.playfabId,
                nick: remote.nick,
                nickNormalized: slug,
                lastSeenAt: 0,
                lastActiveAt: preservedActiveAt,
                idleMs: 0,
                disconnected: true,
              };
              store.players[pId] = offRec;
              if (slug) {
                store.players[slug] = offRec;
                store.players[`pf_${slug}`] = offRec;
              }
              if (remote.playfabId) {
                store.players[remote.playfabId] = offRec;
              }
              changed = true;
            }
            continue;
          }

          // Calcula a idade do pulso usando o timestamp LastUpdated gravado pelo servidor PlayFab.
          // Isso é 100% imune a reload da página (F5) e discrepâncias de relógio entre celular e PC.
          let seenAgeMs = Math.max(0, syncNow - remote.lastSeenAt);
          if (entry.LastUpdated) {
            const entryMs = Date.parse(entry.LastUpdated);
            if (!Number.isNaN(entryMs)) {
              seenAgeMs = Math.max(0, curServerNow - entryMs);
            }
          }

          const remoteIdleMs =
            typeof remote.idleMs === "number" && remote.idleMs >= 0
              ? remote.idleMs
              : Math.max(0, remote.lastSeenAt - (remote.lastActiveAt ?? remote.lastSeenAt));

          const normalizedSeenAt = Math.max(1, syncNow - seenAgeMs);
          const normalizedActiveAt = Math.max(1, normalizedSeenAt - remoteIdleMs);

          // Se for a mesma conta da sessão local, apenas ignora se a informação local já for mais recente
          if (
            localSessionId &&
            (pId === localSessionId || slug === localSessionId)
          ) {
            const cur = store.players[pId] || store.players[slug];
            if (cur && cur.lastSeenAt >= normalizedSeenAt) {
              continue;
            }
          }

          const existingRec = store.players[pId] || (slug ? store.players[slug] : undefined);
          if (
            shouldKeepExistingPresence(existingRec, {
              disconnected: false,
              lastSeenAt: normalizedSeenAt,
              lastActiveAt: normalizedActiveAt,
              activityUpdatedAt: remote.activity?.updatedAt,
            })
          ) {
            continue;
          }
          const sameActivity =
            existingRec?.activity?.type === remote.activity?.type &&
            existingRec?.activity?.gameId === remote.activity?.gameId &&
            existingRec?.activity?.mode === remote.activity?.mode &&
            existingRec?.activity?.level === remote.activity?.level;
          const activeUnchanged =
            existingRec &&
            !existingRec.disconnected &&
            Math.abs((existingRec.lastSeenAt || 0) - normalizedSeenAt) < 1500 &&
            Math.abs((existingRec.lastActiveAt || 0) - normalizedActiveAt) < 1500 &&
            existingRec.idleMs === remoteIdleMs &&
            sameActivity;

          if (activeUnchanged) {
            continue;
          }

          const normalizedRec: PlayerPresenceRecord = {
            playerId: pId,
            playfabId: remote.playfabId,
            nick: remote.nick,
            nickNormalized: slug,
            lastSeenAt: normalizedSeenAt,
            lastActiveAt: normalizedActiveAt,
            idleMs: remoteIdleMs,
            disconnected: false,
            activity: remote.activity,
          };

          store.players[pId] = normalizedRec;
          if (slug) {
            store.players[slug] = normalizedRec;
            store.players[`pf_${slug}`] = normalizedRec;
          }
          if (remote.playfabId) {
            store.players[remote.playfabId] = normalizedRec;
          }
          changed = true;
        } catch {
          /* ignore malformed entry */
        }
      }

      if (changed) {
        savePresenceStore(store);
      }
    } finally {
      inFlightPresenceSync = null;
    }
  })();

  return inFlightPresenceSync;
}

/**
 * Extrai apenas timestamps reais com hora e minuto exatos gerados pela própria sessão/partida do aluno
 * (activeSessionUpdatedAt e stats[].last_played_at). Nunca utiliza dailyXpDate, updatedAt do roster ou medalhas
 * reconciliadas pelo ADM, evitando falsos positivos de "Online há instantes" para alunos desconectados.
 */
export function getLatestProfileActivityMs(profileLike?: {
  activeSessionUpdatedAt?: string;
  stats?: Array<{ last_played_at?: string }>;
  lastKnownActivityAt?: string | number;
} | null): number {
  if (!profileLike) return 0;
  let maxMs = 0;
  const consider = (raw?: string | number) => {
    if (!raw) return;
    if (typeof raw === "number") {
      if (!Number.isNaN(raw) && raw > maxMs) maxMs = raw;
      return;
    }
    const trimmed = raw.trim();
    // Ignora datas puras YYYY-MM-DD sem horário real
    if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return;
    const ms = Date.parse(trimmed);
    if (!Number.isNaN(ms) && ms > maxMs) {
      maxMs = ms;
    }
  };
  consider(profileLike.lastKnownActivityAt);
  consider(profileLike.activeSessionUpdatedAt);
  for (const s of profileLike.stats ?? []) {
    consider(s?.last_played_at);
  }
  return maxMs;
}

/**
 * Obtem os dados de presenca de um jogador, checando o storage local por ID, PlayFabId ou Nick,
 * e tambem a loja do lobby X1 (que sincroniza com o PlayFab na nuvem).
 */
export function getPlayerPresenceData(
  playerId: string,
  hints?: {
    playfabId?: string;
    nick?: string;
    nickNormalized?: string;
    activeSessionUpdatedAt?: string;
    updatedAt?: string;
    stats?: Array<{ last_played_at?: string }>;
    lastKnownActivityAt?: string | number;
  },
): PlayerPresenceRecord | null {
  if (!playerId && !hints?.nickNormalized && !hints?.nick && !hints?.playfabId) {
    return null;
  }

  const cleanId = (playerId || "").trim();
  const slugHint =
    hints?.nickNormalized ||
    (hints?.nick ? nickSlug(hints.nick) : cleanId.startsWith("pf_") ? cleanId.slice(3) : nickSlug(cleanId));

  const candidateKeys = new Set<string>();
  if (cleanId) {
    candidateKeys.add(cleanId);
    candidateKeys.add(cleanId.toLowerCase());
  }
  if (hints?.playfabId) candidateKeys.add(hints.playfabId);
  if (slugHint) {
    candidateKeys.add(slugHint);
    candidateKeys.add(`pf_${slugHint}`);
  }

  // 1. Verificar presence store por indice O(1)
  loadPresenceStoreReadOnly();
  let rec: PlayerPresenceRecord | undefined;

  if (cachedPresenceIndexMap) {
    for (const k of candidateKeys) {
      const candidate = cachedPresenceIndexMap.get(k);
      const candTs = candidate ? Math.max(candidate.lastSeenAt || 0, candidate.lastActiveAt || 0) : -1;
      const recTs = rec ? Math.max(rec.lastSeenAt || 0, rec.lastActiveAt || 0) : -1;
      if (candidate && (!rec || candTs > recTs)) {
        rec = candidate;
      }
    }
  }

  const latestActivityMs = getLatestProfileActivityMs(hints);
  if (latestActivityMs > 0) {
    if (!rec) {
      rec = {
        playerId: cleanId || slugHint,
        playfabId: hints?.playfabId,
        nick: hints?.nick,
        nickNormalized: slugHint,
        lastSeenAt: 0,
        lastActiveAt: latestActivityMs,
        disconnected: true,
      };
    } else if ((!rec.lastActiveAt || latestActivityMs > rec.lastActiveAt) && computePresenceStatus(rec) === "offline") {
      rec = {
        ...rec,
        lastActiveAt: latestActivityMs,
      };
    }
  }

  return rec ?? null;
}

export type PresenceTargetInput =
  | string
  | {
      id: string;
      playfabId?: string;
      nick?: string;
      nickNormalized?: string;
      activeSessionUpdatedAt?: string;
      updatedAt?: string;
      stats?: Array<{ last_played_at?: string }>;
      lastKnownActivityAt?: string | number;
    };

/**
 * Ordem de prioridade de presenca para listagens (online no topo, depois inativo, depois offline)
 */
export const PRESENCE_SORT_PRIORITY: Record<PresenceStatus, number> = {
  online: 0,
  idle: 1,
  offline: 2,
};

export interface StudentPresenceLevelComparable {
  presenceStatus: PresenceStatus;
  level: number;
  xp?: number;
  nick?: string;
  full_name?: string;
}

/**
 * Compara dois alunos priorizando primeiro o status online (online > idle > offline),
 * seguido por nível decrescente, XP decrescente e ordem alfabética por nick/nome.
 */
export function compareStudentsByPresenceAndLevel(
  a: StudentPresenceLevelComparable,
  b: StudentPresenceLevelComparable,
): number {
  const priorityDiff =
    (PRESENCE_SORT_PRIORITY[a.presenceStatus] ?? 2) -
    (PRESENCE_SORT_PRIORITY[b.presenceStatus] ?? 2);
  if (priorityDiff !== 0) return priorityDiff;

  const levelDiff = (b.level ?? 0) - (a.level ?? 0);
  if (levelDiff !== 0) return levelDiff;

  const xpDiff = (b.xp ?? 0) - (a.xp ?? 0);
  if (xpDiff !== 0) return xpDiff;

  const nameA = (a.nick || a.full_name || "").trim();
  const nameB = (b.nick || b.full_name || "").trim();
  return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
}

/**
 * Retorna uma nova lista ordenada com alunos online no topo e, dentro de cada status, por maior nível.
 */
export function sortStudentsByPresenceAndLevel<T>(
  items: readonly T[],
  toComparable: (item: T) => StudentPresenceLevelComparable,
): T[] {
  return [...items].sort((a, b) =>
    compareStudentsByPresenceAndLevel(toComparable(a), toComparable(b)),
  );
}

/**
 * Obtem o status de presenca computado para um alvo (ID ou perfil resumido de aluno)
 */
export function getPlayerPresenceStatus(
  item: PresenceTargetInput,
  now = Date.now(),
): PresenceStatus {
  const data =
    typeof item === "string"
      ? getPlayerPresenceData(item)
      : getPlayerPresenceData(item.id, {
          playfabId: item.playfabId,
          nick: item.nick,
          nickNormalized: item.nickNormalized,
          activeSessionUpdatedAt: item.activeSessionUpdatedAt,
          updatedAt: item.updatedAt,
          stats: item.stats,
          lastKnownActivityAt: item.lastKnownActivityAt,
        });
  return computePresenceStatus(data, now);
}

/**
 * Calcula o sumario de presenca para uma lista de IDs ou perfis de jogadores
 */
export function computePresenceSummary(
  targets: PresenceTargetInput[],
  now = Date.now()
): { online: number; idle: number; offline: number; total: number } {
  let online = 0;
  let idle = 0;
  let offline = 0;

  for (const item of targets) {
    const status = getPlayerPresenceStatus(item, now);
    if (status === "online") online++;
    else if (status === "idle") idle++;
    else offline++;
  }

  return {
    online,
    idle,
    offline,
    total: targets.length,
  };
}

const presenceSubscribers = new Set<() => void>();
let globalPresenceCleanup: (() => void) | null = null;

function subscribeGlobalPresence(cb: () => void): () => void {
  presenceSubscribers.add(cb);

  if (presenceSubscribers.size === 1 && typeof window !== "undefined") {
    const notifyAll = () => {
      for (const listener of presenceSubscribers) {
        listener();
      }
    };

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void syncPresenceFromPlayFab();
      notifyAll();
    }, 10000);

    window.addEventListener(PRESENCE_UPDATED_EVENT, notifyAll);
    window.addEventListener(ACTIVITY_CHANGED_EVENT, notifyAll);
    window.addEventListener("desafios:x1-lobby-updated", notifyAll);
    window.addEventListener("storage", notifyAll);

    globalPresenceCleanup = () => {
      window.removeEventListener(PRESENCE_UPDATED_EVENT, notifyAll);
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, notifyAll);
      window.removeEventListener("desafios:x1-lobby-updated", notifyAll);
      window.removeEventListener("storage", notifyAll);
      clearInterval(timer);
      globalPresenceCleanup = null;
    };
  }

  return () => {
    presenceSubscribers.delete(cb);
    if (presenceSubscribers.size === 0 && globalPresenceCleanup) {
      globalPresenceCleanup();
    }
  };
}

/**
 * Hook para obter a presenca reativa de um jogador com atualizacao automatica
 */
export function usePlayerPresence(
  playerId?: string,
  hints?: {
    playfabId?: string;
    nick?: string;
    nickNormalized?: string;
    activeSessionUpdatedAt?: string;
    lastKnownActivityAt?: string | number;
  },
): {
  status: PresenceStatus;
  tooltip: string;
  timeAgo: string;
  data: PlayerPresenceRecord | null;
  activityDetails: {
    type: PlayerActivityType;
    label: string;
    icon: string;
    isIdle: boolean;
    colorClass: string;
  } | null;
} {
  const [data, setData] = useState<PlayerPresenceRecord | null>(() =>
    playerId ? getPlayerPresenceData(playerId, hints) : null
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!playerId) {
      setData(null);
      return;
    }

    const refresh = () => {
      setData(getPlayerPresenceData(playerId, hints));
      setTick((t) => (t + 1) % 1_000_000);
    };

    refresh();
    return subscribeGlobalPresence(refresh);
  }, [
    playerId,
    hints?.playfabId,
    hints?.nick,
    hints?.nickNormalized,
    hints?.activeSessionUpdatedAt,
    hints?.lastKnownActivityAt,
  ]);

  const status = computePresenceStatus(data);
  const tooltip = formatPresenceTooltip(status, data);
  const timeAgo = formatPresenceTimeAgo(data);
  const activityDetails = getPlayerActivityDetails(data);

  return { status, tooltip, timeAgo, data, activityDetails };
}

/**
 * Hook que rastreia a atividade do jogador logado e emite heartbeats periodicos locais e na nuvem PlayFab
 */
export function usePresenceTracker(player?: {
  playerId?: string;
  playfabId?: string;
  nick?: string;
  nickNormalized?: string;
} | null) {
  useEffect(() => {
    if (!player?.playerId) {
      return;
    }

    const playerId = player.playerId;
    const playfabId = player.playfabId;
    const nick = player.nick;
    const nickNormalized = player.nickNormalized || (nick ? nickSlug(nick) : undefined);

    let lastRecordedActivity = Date.now();
    let lastRemoteSessionCheckAt = 0;
    recordLocalUserActivity(lastRecordedActivity);

    const dispatchSessionTerminated = (ts: number) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("desafios:session-terminated", {
            detail: {
              reason: "outro_aparelho",
              timestamp: ts,
            },
          })
        );
      }
    };

    // Pulso periódico a cada 30 segundos (local + push na nuvem PlayFab, sem baixar toda a rede)
    const pulse = (disconnected = false) => {
      const now = Date.now();

      // Sessão Única Modelo A: Verifica se a conta foi acessada em outro aparelho (local e nuvem)
      if (!disconnected && playerId) {
        if (!validateActiveSession(playerId)) {
          dispatchSessionTerminated(now);
          return;
        }
        if (now - lastRemoteSessionCheckAt >= 20_000) {
          lastRemoteSessionCheckAt = now;
          void validateActiveSessionRemote(playerId).then((valid) => {
            if (!valid) {
              dispatchSessionTerminated(Date.now());
            }
          });
        }
      }

      const activeAt = getLocalUserLastActiveAt();
      const idleMs = Math.max(0, now - activeAt);
      const rec = recordPlayerHeartbeat(playerId, {
        playfabId,
        nick,
        nickNormalized,
        lastActiveAt: activeAt,
        lastSeenAt: disconnected ? 0 : now,
        idleMs,
        disconnected,
        activity: disconnected ? undefined : getPlayerCurrentActivity(),
      });
      if (rec) {
        void pushPresenceToPlayFab(rec);
      }
    };

    // Throttle de interação do usuário (atualiza apenas timestamp leve, sem serializar o store inteiro no toque/scroll)
    const onUserInteraction = () => {
      const now = Date.now();
      const wasIdleOrStale = now - lastRecordedActivity >= 60_000;
      if (now - lastRecordedActivity >= 5000) {
        lastRecordedActivity = now;
        recordLocalUserActivity(now);
        // Se estava inativo há 1+ min e voltou a interagir, envia pulso imediato para ficar Verde na hora
        if (wasIdleOrStale) {
          pulse(false);
        }
      }
    };

    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const now = Date.now();
        lastRecordedActivity = now;
        recordLocalUserActivity(now);
        pulse(false);
      }
    };

    const onActivityChange = () => {
      const now = Date.now();
      lastRecordedActivity = now;
      recordLocalUserActivity(now);
      pulse(false);
    };

    let disconnectSent = false;
    const onPageExit = () => {
      if (disconnectSent) return;
      disconnectSent = true;
      pulse(true);
    };

    window.addEventListener("pointerdown", onUserInteraction, { passive: true });
    window.addEventListener("keydown", onUserInteraction, { passive: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true });
    window.addEventListener("scroll", onUserInteraction, { passive: true });
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener(ACTIVITY_CHANGED_EVENT, onActivityChange);
    window.addEventListener("pagehide", onPageExit);
    window.addEventListener("beforeunload", onPageExit);

    pulse(false);
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      pulse(false);
    }, 30000);

    return () => {
      window.removeEventListener("pointerdown", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      window.removeEventListener("touchstart", onUserInteraction);
      window.removeEventListener("scroll", onUserInteraction);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, onActivityChange);
      window.removeEventListener("pagehide", onPageExit);
      window.removeEventListener("beforeunload", onPageExit);
      clearInterval(intervalId);
    };
  }, [player?.playerId, player?.playfabId, player?.nick, player?.nickNormalized]);
}

/**
 * Marca o jogador como desconectado imediatamente (ex.: ao clicar em Sair/Logout),
 * enviando pulso com keepalive para o PlayFab antes da sessão ser encerrada.
 */
export function markPlayerDisconnected(player?: {
  playerId?: string;
  playfabId?: string;
  nick?: string;
  nickNormalized?: string;
} | null): void {
  if (!player?.playerId) return;
  const now = Date.now();
  const activeAt = getLocalUserLastActiveAt();
  const rec = recordPlayerHeartbeat(player.playerId, {
    playfabId: player.playfabId,
    nick: player.nick,
    nickNormalized: player.nickNormalized || (player.nick ? nickSlug(player.nick) : undefined),
    lastActiveAt: activeAt > 0 ? activeAt : now,
    lastSeenAt: 0,
    idleMs: 0,
    disconnected: true,
    activity: undefined,
  });
  if (rec) {
    void pushPresenceToPlayFab(rec);
  }
}

/**
 * Remove o jogador do armazenamento local e da nuvem de presença (usado ao excluir perfil).
 */
export async function removePlayerFromPresence(
  playerId: string,
  playerNick?: string,
): Promise<void> {
  const store = loadPresenceStore();
  const slug = playerNick ? nickSlug(playerNick) : nickSlug(playerId);
  let changed = false;

  for (const k of Object.keys(store.players)) {
    const p = store.players[k];
    if (
      p.playerId === playerId ||
      (playerNick && p.nick.toLowerCase() === playerNick.toLowerCase()) ||
      p.nickNormalized === slug
    ) {
      delete store.players[k];
      changed = true;
    }
  }

  if (changed) {
    savePresenceStore(store);
  }

  if (typeof window !== "undefined" && isPlayFabConfigured()) {
    try {
      const keysToRemove = [`pres_${slug}`];
      if (playerId && playerId !== slug) keysToRemove.push(`pres_${playerId}`);
      await callPresencePlayFab("UpdateSharedGroupData", {
        SharedGroupId: PRESENCE_SHARED_GROUP_ID,
        KeysToRemove: keysToRemove,
      });
    } catch {
      /* ignore */
    }
  }
}

