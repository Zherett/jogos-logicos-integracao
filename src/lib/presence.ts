// Modulo de Presenca e Rastreamento de Status Online dos Jogadores
// Browser-safe: Verde = Online (< 5 min), Cinza = Inativo (5 a 10 min), Vermelho = Offline (> 10 min ou desconectado)

import { useEffect, useState } from "react";
import { nickSlug } from "./player-profile.ts";
import { GAME_NAMES, type GameId } from "./game-storage.ts";
import {
  clearCachedAdminPlayFabTicket,
  getAdminPlayFabTicket,
  getPlayFabTitleId,
  isPlayFabConfigured,
  loadStoredSession,
  validateActiveSession,
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
export const PRESENCE_ONLINE_MAX_AGE_MS = 2 * 60 * 1000;   // 2 minutos com atividade do aluno (Verde)
export const PRESENCE_IDLE_MAX_AGE_MS = 10 * 60 * 1000;    // 10 minutos conectado sem interação (Amarelo/Âmbar)
export const PRESENCE_DISCONNECT_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutos sem heartbeat = aba fechada/suspensa (Vermelho)

const PRESENCE_STORAGE_KEY = "desafios-presence-store-v1";
const LOCAL_LAST_ACTIVE_KEY = "desafios-local-last-active-v1";
export const PRESENCE_SHARED_GROUP_ID = "SEMED_PRESENCE_V2";
export const PRESENCE_UPDATED_EVENT = "desafios:presence-updated";

/**
 * Avalia de forma pura e deterministica o status de presenca de um jogador.
 * - Verde ("online"): fez interacao ha menos de 2 minutos (com heartbeat ativo).
 * - Amarelo/Âmbar ("idle"): sem interacao entre 2 e 10 minutos (aba continua aberta conectada).
 * - Vermelho ("offline"): mais de 10 minutos sem interacao OU sem heartbeat recente (aba fechada).
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

  // Se o heartbeat está mais antigo que o limite de desconexão (2 min), a aba foi fechada/suspensa
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

  // Se estiver conectado mas inativo (2 a 10 min)
  if (status === "idle") {
    const lastActive = record.lastActiveAt && record.lastActiveAt > 0 ? record.lastActiveAt : record.lastSeenAt;
    const diffMs = lastActive ? Math.max(0, now - lastActive) : 2 * 60 * 1000;
    const mins = Math.max(2, Math.floor(diffMs / 60000));
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
    localStorage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(store));
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

  const activity =
    data?.activity ??
    (data?.disconnected ? undefined : (existing?.activity ?? getPlayerCurrentActivity()));

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
): Promise<{ data?: Record<string, unknown>; serverDate?: string | null } | null> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return null;
  const titleId = getPlayFabTitleId();
  if (!titleId) return null;
  const session = loadStoredSession();
  let ticket = (await getAdminPlayFabTicket()) ?? session?.sessionTicket;
  if (!ticket) return null;

  try {
    const res = await fetch(`https://${titleId}.playfabapi.com/Client/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, ...body }),
    });
    const serverDate = res.headers.get("date");
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      error?: string;
      errorCode?: number;
      errorMessage?: string;
    };

    // Renovação automática caso o ticket em cache tenha expirado ou sido invalidado no PlayFab
    if (res.status === 401 || json.errorCode === 1089 || json.error === "NotAuthorized") {
      clearCachedAdminPlayFabTicket();
      if (canRetry) {
        return callPresencePlayFab(endpoint, body, false);
      }
      return null;
    }

    if (json.error) return null;
    return { data: json.data, serverDate };
  } catch {
    return null;
  }
}

/**
 * Envia o pulso de presença do jogador atual para o SharedGroup global no PlayFab.
 */
export async function pushPresenceToPlayFab(record: PlayerPresenceRecord): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  try {
    if (!presenceGroupCreated) {
      await callPresencePlayFab("CreateSharedGroup", {
        SharedGroupId: PRESENCE_SHARED_GROUP_ID,
      });
      presenceGroupCreated = true;
    }
    const slug =
      record.nickNormalized ||
      (record.nick ? nickSlug(record.nick) : nickSlug(record.playerId));
    const key = `pres_${slug || record.playerId}`;
    await callPresencePlayFab("UpdateSharedGroupData", {
      SharedGroupId: PRESENCE_SHARED_GROUP_ID,
      Data: {
        [key]: JSON.stringify({
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
        }),
      },
      Permission: "Public",
    });
  } catch {
    /* ignore network issues */
  }
}

/**
 * Baixa os registros de presença de todos os alunos na nuvem (PlayFab),
 * normalizando os timestamps para eliminar problemas de relógio desajustado entre dispositivos.
 */
export async function syncPresenceFromPlayFab(force = false): Promise<void> {
  if (typeof window === "undefined" || !isPlayFabConfigured()) return;
  const now = Date.now();
  if (!force && now - lastPresenceCloudSyncAt < 4000) return;
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

      const res = await callPresencePlayFab("GetSharedGroupData", {
        SharedGroupId: PRESENCE_SHARED_GROUP_ID,
      });

      const resData = res?.data as {
        Data?: Record<string, { Value: string; LastUpdated?: string }>;
      } | undefined;

      if (!resData?.Data) return;

      const store = loadPresenceStore();
      const localSessionId = loadStoredSession()?.playerId;
      const syncNow = Date.now();
      let changed = false;

      // Mantém calibração de horário com o servidor PlayFab
      if (serverClockOffsetMs === null || syncNow - lastServerClockSyncAt > 5 * 60 * 1000) {
        void syncServerClockOffset();
      }
      const curServerNow = syncNow + (serverClockOffsetMs ?? 0);

      for (const [key, entry] of Object.entries(resData.Data)) {
        if (!entry?.Value) continue;
        try {
          const remote = JSON.parse(entry.Value) as Partial<PlayerPresenceRecord>;
          if (!remote.playerId && !remote.nickNormalized && !remote.nick) continue;

          const slug =
            remote.nickNormalized ||
            (remote.nick ? nickSlug(remote.nick) : key.replace(/^pres_/, ""));
          const pId = remote.playerId || `pf_${slug}`;

          if (remote.disconnected || !remote.lastSeenAt || remote.lastSeenAt <= 0) {
            const preservedActiveAt =
              remote.lastActiveAt && remote.lastActiveAt > 0
                ? remote.lastActiveAt
                : remote.lastSeenAt && remote.lastSeenAt > 0
                  ? remote.lastSeenAt
                  : (store.players[pId]?.lastActiveAt || 0);

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
 * Obtem os dados de presenca de um jogador, checando o storage local por ID, PlayFabId ou Nick,
 * e tambem a loja do lobby X1 (que sincroniza com o PlayFab na nuvem).
 */
export function getPlayerPresenceData(
  playerId: string,
  hints?: { playfabId?: string; nick?: string; nickNormalized?: string },
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

  // 1. Verificar presence store por chaves diretas e por varredura de alias
  const store = loadPresenceStore();
  let rec: PlayerPresenceRecord | undefined;

  for (const k of candidateKeys) {
    const candidate = store.players[k];
    if (candidate && (!rec || candidate.lastSeenAt > rec.lastSeenAt)) {
      rec = candidate;
    }
  }

  if (!rec) {
    for (const item of Object.values(store.players)) {
      if (!item) continue;
      const itemSlug = item.nickNormalized || (item.nick ? nickSlug(item.nick) : "");
      if (
        (cleanId && (item.playerId === cleanId || item.playfabId === cleanId)) ||
        (hints?.playfabId && item.playfabId === hints.playfabId) ||
        (slugHint && itemSlug === slugHint)
      ) {
        if (!rec || item.lastSeenAt > rec.lastSeenAt) {
          rec = item;
        }
      }
    }
  }

  // 2. Se nao encontrou ou dados estao desatualizados, verificar x1-lobby-state
  if (typeof window !== "undefined") {
    try {
      const x1Raw = localStorage.getItem("desafios-x1-lobby-state-v1");
      if (x1Raw) {
        const x1Store = JSON.parse(x1Raw) as {
          players?: Record<
            string,
            { playerId?: string; lastSeenAt?: number; lastActiveAt?: number; nick?: string }
          >;
        };
        for (const [k, x1Player] of Object.entries(x1Store.players ?? {})) {
          if (!x1Player || typeof x1Player.lastSeenAt !== "number") continue;
          const x1Slug = x1Player.nick ? nickSlug(x1Player.nick) : "";
          const matches =
            candidateKeys.has(k) ||
            (x1Player.playerId && candidateKeys.has(x1Player.playerId)) ||
            (slugHint && x1Slug === slugHint);
          if (matches && (!rec || x1Player.lastSeenAt > rec.lastSeenAt)) {
            rec = {
              playerId: cleanId || x1Player.playerId || k,
              nick: x1Player.nick ?? rec?.nick,
              nickNormalized: x1Slug || slugHint,
              lastSeenAt: x1Player.lastSeenAt,
              lastActiveAt: x1Player.lastActiveAt ?? x1Player.lastSeenAt,
            };
          }
        }
      }
    } catch {
      // ignore
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

/**
 * Hook para obter a presenca reativa de um jogador com atualizacao automatica
 */
export function usePlayerPresence(
  playerId?: string,
  hints?: { playfabId?: string; nick?: string; nickNormalized?: string },
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
    };

    refresh();

    // Reagir a eventos de presenca e lobby X1
    window.addEventListener(PRESENCE_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVITY_CHANGED_EVENT, refresh);
    window.addEventListener("desafios:x1-lobby-updated", refresh);
    window.addEventListener("storage", refresh);

    // Timer para recomputar limiares de tempo (5 min / 10 min) e sincronizar da nuvem
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      void syncPresenceFromPlayFab();
      refresh();
    }, 10000);

    return () => {
      window.removeEventListener(PRESENCE_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, refresh);
      window.removeEventListener("desafios:x1-lobby-updated", refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(timer);
    };
  }, [playerId, hints?.playfabId, hints?.nick, hints?.nickNormalized]);

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
    // Mesmo sem jogador logado (ou enquanto o ADM observa), sincroniza presenças da nuvem periodicamente
    void syncPresenceFromPlayFab(true);
    const cloudPollId = setInterval(() => {
      void syncPresenceFromPlayFab();
    }, 10000);

    if (!player?.playerId) {
      return () => clearInterval(cloudPollId);
    }

    const playerId = player.playerId;
    const playfabId = player.playfabId;
    const nick = player.nick;
    const nickNormalized = player.nickNormalized || (nick ? nickSlug(nick) : undefined);

    let lastRecordedActivity = Date.now();
    recordLocalUserActivity(lastRecordedActivity);

    //Pulso imediato e periodico a cada 12 segundos (local + nuvem PlayFab)
    const pulse = (disconnected = false) => {
      const now = Date.now();

      // Sessão Única Modelo A: Verifica se a conta foi acessada em outro aparelho
      if (!disconnected && playerId) {
        if (!validateActiveSession(playerId)) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("desafios:session-terminated", {
                detail: {
                  reason: "outro_aparelho",
                  timestamp: now,
                },
              })
            );
          }
          return;
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
      if (!disconnected) {
        void syncPresenceFromPlayFab();
      }
    };

    // Throttle de interacao do usuario (no maximo uma gravacao a cada 3 segundos)
    const onUserInteraction = () => {
      const now = Date.now();
      const wasIdleOrStale = now - lastRecordedActivity >= 60_000;
      if (now - lastRecordedActivity >= 3000) {
        lastRecordedActivity = now;
        recordLocalUserActivity(now);
        // Se estava inativo há 1+ min e voltou a interagir, envia pulso imediato para ficar Verde na hora
        if (wasIdleOrStale) {
          pulse(false);
        } else {
          recordPlayerHeartbeat(playerId, {
            playfabId,
            nick,
            nickNormalized,
            lastActiveAt: now,
            lastSeenAt: now,
            idleMs: 0,
            activity: getPlayerCurrentActivity(),
          });
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

    const onPageHide = () => {
      pulse(true);
    };

    const onActivityChange = () => {
      pulse(false);
    };

    window.addEventListener("pointerdown", onUserInteraction, { passive: true });
    window.addEventListener("keydown", onUserInteraction, { passive: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true });
    window.addEventListener("scroll", onUserInteraction, { passive: true });
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener(ACTIVITY_CHANGED_EVENT, onActivityChange);

    pulse(false);
    const intervalId = setInterval(() => pulse(false), 12000);

    return () => {
      window.removeEventListener("pointerdown", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      window.removeEventListener("touchstart", onUserInteraction);
      window.removeEventListener("scroll", onUserInteraction);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, onActivityChange);
      clearInterval(intervalId);
      clearInterval(cloudPollId);
    };
  }, [player?.playerId, player?.playfabId, player?.nick, player?.nickNormalized]);
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

