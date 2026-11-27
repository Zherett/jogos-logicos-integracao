// Modulo de Mensagens, Notificacoes e Correio do Aluno (Inbox System)
// Suporta:
// - Alertas de seguranca (login em outro dispositivo)
// - Comunicados administrativos com texto amplo e suporte a tags de GIF ([gif1], [gif2])
// - Transmissao em massa (Broadcast geral, por escola, por etapa ou aluno especifico com checkboxes)
// - Recompensas em pontos e medalhas (normais e secretas com revelacao)
// - Regra de exclusao: mensagens com recompensa nao podem ser apagadas ate o resgate

import type { PlayerProfile } from "./playfab.ts";
import { isSafeHttpOrRelativeMediaUrl } from "./media-url.ts";
import { safeLocalStorageSet } from "./storage-guard.ts";
import { awardCareerPoints, checkLevelPromotionPoints, creditCoinMetrics } from "./career-points.ts";
import { calculateDuplicateCosmeticCompensation, normalizeCardPackId } from "./chests-catalog.ts";
import {
  ensureLevel5InitialLetterUnlock,
  grantCosmeticToProfile,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
} from "./cosmetics-catalog.ts";
import { getAllAvailableMedals, getEnabledGameIdsSet, type PlayerUnlockedMedal } from "./medals-catalog.ts";
import {
  stageForPlayer,
  accumulateTournamentMedal,
  calculatePlayerLevel,
  nickSlug,
  syncLevelStageProgress,
  type TournamentMedal,
} from "./player-profile.ts";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import { recordScoreLedgerEntry } from "./score-history-ledger.ts";

export type PendingScoreLedgerInput = Parameters<typeof recordScoreLedgerEntry>[0];

export type InboxRewardType = "points" | "xp" | "coins" | "medal" | "cosmetic" | "future_item";

export interface InboxReward {
  id: string;
  type: InboxRewardType;
  pointsAmount?: number;
  medalId?: string;
  cosmeticKind?: "avatar" | "aura";
  cosmeticId?: string;
  itemData?: Record<string, unknown>; // Preparado para futuras aquisicoes
  isSecret: boolean;
  claimed: boolean;
  claimedAt?: string;
}

export type InboxMessageCategory =
  | "seguranca_acesso"
  | "medalha_ouro"
  | "pioneiro_medalha"
  | "comunicado"
  | "recompensa_especial";

export interface RecipientFilter {
  school?: string;
  stage?: string;
  excludedStudentIds?: string[];
  targetStudentIds?: string[];
}

export interface SystemInboxMessage {
  id: string;
  broadcastId?: string;
  recipientId: string; // ID / nick do aluno, "admin", ou "ALL" para transmissao
  recipientFilter?: RecipientFilter;
  sender: "seguranca" | "sistema" | "adm";
  senderName?: string;
  category: InboxMessageCategory;
  title: string;
  body: string;
  gifLinks?: Record<string, string>; // ex: { gif1: "https://...", gif2: "https://..." }
  imageLinks?: Record<string, string>; // ex: { img1: "https://...", img2: "https://..." }
  mediaScales?: Record<string, number>; // ex: { gif1: 60, img1: 100 } (escala 10..100%, padrão 100%)
  mentionedGameId?: string; // ID do jogo referenciado na tag [game] (apenas menção de texto)
  mentionedEventId?: string; // ID do evento referenciado na tag [event]
  mentionedEventTitle?: string; // Nome do evento para cache e fallback
  linkEventDetails?: boolean;
  mentionedGames?: Record<string, string>; // Tags indexadas de jogos: { game: "velha", game1: "memoria", game2: "quebra-cabeca" }
  mentionedEvents?: Record<string, {
    eventId: string;
    eventTitle?: string;
    linkEventDetails?: boolean;
  includeNewPlayers?: boolean;
  }>; // Tags indexadas de eventos: { event: { eventId, ... }, event1: { ... } }
  reward?: InboxReward;
  rewards?: InboxReward[];
  metadata?: {
    deviceInfo?: string;
    attemptedAt?: string;
    ipHint?: string;
    medalId?: string;
    medalTitle?: string;
    medalRarity?: string;
    studentId?: string;
    studentNick?: string;
    studentFullName?: string;
    studentSchool?: string;
    pioneerRank?: number;
    [key: string]: unknown;
  };
  read: boolean;
  readAt?: string;
  includeNewPlayers?: boolean;
  createdAt: string;
}

// Chave para persistencia local de mensagens
const INBOX_STORAGE_KEY = "desafios_inbox_messages_v2";
const CANCELED_MESSAGES_KEY = "desafios_canceled_inbox_messages_v1";
const STUDENT_CLAIMS_KEY = "desafios_student_claimed_rewards_v1";
const STUDENT_READS_KEY = "desafios_student_read_messages_v1";
const STUDENT_DELETES_KEY = "desafios_student_deleted_messages_v1";
const ADMIN_CONFIG_LOCAL_KEY = "desafios-logica-admin-config-v1";
const ADMIN_CONFIG_REMOTE_KEY = "desafios-remote-admin-config-v1";

export const BROADCAST_SHARED_GROUP_ID = "SEMED_INBOX_BROADCAST_V1";
export const ADMIN_NOTIFICATIONS_SHARED_GROUP_ID = "SEMED_ADMIN_NOTIFICATIONS_V1";

// REGRA DO USUÁRIO: Mensagens lidas com recompensas resgatadas são auto-expiradas em 24h
export const INBOX_MESSAGE_AUTO_PURGE_MS = 24 * 60 * 60 * 1000; // 24 horas
export const INBOX_RETENTION_LIMIT = 80;

function readCachedAdminLevelConfig(): { maxAvailableGames: number; levelCoinStep: number } {
  const fallback = { maxAvailableGames: ALL_GAME_IDS.length, levelCoinStep: 10 };
  if (typeof window === "undefined") return fallback;
  try {
    for (const key of [ADMIN_CONFIG_REMOTE_KEY, ADMIN_CONFIG_LOCAL_KEY]) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== "object") continue;
      const enabledSet = getEnabledGameIdsSet(cfg.enabledGames);
      const step = Number(cfg?.coinRewardsConfig?.levelCoinStep);
      return {
        maxAvailableGames: Math.max(1, enabledSet.size || ALL_GAME_IDS.length),
        levelCoinStep: Number.isFinite(step) && step >= 0 ? step : 10,
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function getPlayerAliasKeys(player?: {
  id?: string;
  nick?: string;
  nickNormalized?: string;
  playfabId?: string;
} | null): string[] {
  if (!player) return [];
  const pId = String(player.id || "").toLowerCase().trim();
  const pNick = String(player.nick || "").toLowerCase().trim();
  const pNickNorm = String(player.nickNormalized || "").toLowerCase().trim();
  const pPlayfabId = String(player.playfabId || "").toLowerCase().trim();
  const strippedId = pId.startsWith("pf_local_") ? pId.replace(/^pf_local_/, "").trim() : "";
  const nickSlugVal = pNick ? nickSlug(pNick) : "";

  const keys = new Set<string>();
  for (const candidate of [pId, strippedId, pNick, nickSlugVal, pNickNorm, pPlayfabId]) {
    if (candidate) keys.add(candidate);
  }
  return Array.from(keys);
}

export function getCanonicalInboxStudentKey(
  playerOrId?:
    | string
    | { id?: string; nick?: string; nickNormalized?: string; playfabId?: string }
    | null,
): string {
  if (!playerOrId) return "";
  if (typeof playerOrId === "string") {
    const clean = playerOrId.toLowerCase().trim();
    if (!clean) return "";
    return clean.startsWith("pf_local_") ? clean.replace(/^pf_local_/, "").trim() || clean : clean;
  }
  const pNickNorm = String(playerOrId.nickNormalized || "").toLowerCase().trim();
  if (pNickNorm) return pNickNorm;
  const pNick = String(playerOrId.nick || "").trim();
  if (pNick) {
    const slug = nickSlug(pNick);
    if (slug) return slug;
    return pNick.toLowerCase();
  }
  const pId = String(playerOrId.id || "").toLowerCase().trim();
  if (pId) {
    return pId.startsWith("pf_local_") ? pId.replace(/^pf_local_/, "").trim() || pId : pId;
  }
  return String(playerOrId.playfabId || "").toLowerCase().trim();
}

export function pruneExpiredLocalInboxReceipts(
  map: Record<string, Record<string, string>>,
  activeMessageIds: Set<string>,
  nowMs = Date.now(),
  maxAgeDays = 90,
): number {
  const cutoffMs = nowMs - Math.max(7, maxAgeDays) * 86_400_000;
  let removed = 0;
  for (const [studentKey, entryMap] of Object.entries(map)) {
    if (!entryMap || typeof entryMap !== "object") {
      delete map[studentKey];
      continue;
    }
    for (const [msgId, rawVal] of Object.entries(entryMap)) {
      if (activeMessageIds.has(msgId)) continue;
      if (typeof rawVal === "string") {
        const tsMs = Date.parse(rawVal);
        if (Number.isFinite(tsMs) && tsMs < cutoffMs) {
          delete entryMap[msgId];
          removed += 1;
        }
      }
    }
    if (Object.keys(entryMap).length === 0) {
      delete map[studentKey];
    }
  }
  return removed;
}

const INBOX_CHANNEL_NAME = "semed_inbox_realtime_sync_v1";

export interface InboxSyncPayload {
  type: "new_message" | "message_read" | "rewards_claimed" | "message_canceled";
  messageId?: string;
  studentId?: string;
  studentNick?: string;
  message?: SystemInboxMessage;
  timestamp: number;
}

let inboxBroadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    inboxBroadcastChannel = new BroadcastChannel(INBOX_CHANNEL_NAME);
  } catch {
    inboxBroadcastChannel = null;
  }
}

export function broadcastInboxEvent(payload: Omit<InboxSyncPayload, "timestamp">): void {
  const fullPayload: InboxSyncPayload = { ...payload, timestamp: Date.now() };
  if (inboxBroadcastChannel) {
    try {
      inboxBroadcastChannel.postMessage(fullPayload);
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") {
    try {
      safeLocalStorageSet("desafios_inbox_sync_pulse", JSON.stringify(fullPayload));
    } catch {
      /* ignore */
    }
  }
}

export function subscribeToInboxSync(
  callback: (payload: InboxSyncPayload) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChannelMsg = (evt: MessageEvent) => {
    if (evt.data && typeof evt.data === "object") {
      callback(evt.data as InboxSyncPayload);
    }
  };

  const handleStorage = (evt: StorageEvent) => {
    if (evt.key === "desafios_inbox_sync_pulse" && evt.newValue) {
      try {
        const parsed = JSON.parse(evt.newValue);
        callback(parsed);
      } catch {
        /* ignore */
      }
    }
  };

  if (inboxBroadcastChannel) {
    inboxBroadcastChannel.addEventListener("message", handleChannelMsg);
  }
  window.addEventListener("storage", handleStorage);

  return () => {
    if (inboxBroadcastChannel) {
      inboxBroadcastChannel.removeEventListener("message", handleChannelMsg);
    }
    window.removeEventListener("storage", handleStorage);
  };
}

let memoryInboxMessages: SystemInboxMessage[] = [];
let memoryCanceledMessages = new Set<string>();
let memoryStudentClaims: Record<string, Record<string, string>> = {}; // playerId -> { messageId: claimedAt }
let memoryStudentReads: Record<string, Record<string, any>> = {}; // playerId -> { messageId: timestamp | true }
let memoryStudentDeletes: Record<string, Record<string, boolean>> = {}; // playerId -> { messageId: true }

export function clearMemoryInboxMessages(): void {
  memoryInboxMessages = [];
  memoryCanceledMessages.clear();
  memoryStudentClaims = {};
  memoryStudentReads = {};
  memoryStudentDeletes = {};
}

export function clearMemoryStudentClaims(): void {
  memoryStudentClaims = {};
}

// ----------------------------------------------------------------------------
// PERSISTÊNCIA BROWSER / LOCAL & NUVEM
// ----------------------------------------------------------------------------

export function loadCanceledMessageIds(): Set<string> {
  const set = new Set(memoryCanceledMessages);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CANCELED_MESSAGES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const id of arr) {
            if (typeof id === "string" && id) set.add(id);
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Mescla com IDs cancelados nos arquivos locais e remotos de configuração ADM
    for (const key of [ADMIN_CONFIG_LOCAL_KEY, ADMIN_CONFIG_REMOTE_KEY]) {
      try {
        const cRaw = window.localStorage.getItem(key);
        if (cRaw) {
          const cfg = JSON.parse(cRaw);
          if (Array.isArray(cfg?.canceledInboxMessageIds)) {
            for (const id of cfg.canceledInboxMessageIds) {
              if (typeof id === "string" && id) set.add(id);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  memoryCanceledMessages = new Set(set);
  return set;
}

export function saveCanceledMessageIds(set: Set<string>): void {
  memoryCanceledMessages = new Set(set);
  if (typeof window === "undefined") return;
  try {
    safeLocalStorageSet(CANCELED_MESSAGES_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn("Falha ao salvar IDs de mensagens canceladas:", err);
  }
}

export function isMessageCanceled(messageId: string): boolean {
  if (!messageId) return false;
  return loadCanceledMessageIds().has(messageId);
}

/**
 * Cancela o envio de uma mensagem específica no perfil ADM.
 * Remove a mensagem do histórico e da caixa de correio de todos os alunos instantaneamente.
 */
export function cancelInboxMessage(messageId: string): {
  success: boolean;
  canceledMessage?: SystemInboxMessage;
} {
  if (!messageId) return { success: false };

  const all = loadAllInboxMessages();
  const target = all.find((m) => m.id === messageId);

  // Registra o ID como permanentemente cancelado
  const canceled = loadCanceledMessageIds();
  canceled.add(messageId);
  saveCanceledMessageIds(canceled);

  // Remove a mensagem da lista de ativas e salva
  const filtered = all.filter((m) => m.id !== messageId);
  saveAllInboxMessages(filtered);

  // Atualiza também os caches de configuração do ADM
  if (typeof window !== "undefined") {
    for (const key of [ADMIN_CONFIG_LOCAL_KEY, ADMIN_CONFIG_REMOTE_KEY]) {
      try {
        const cRaw = window.localStorage.getItem(key);
        if (cRaw) {
          const cfg = JSON.parse(cRaw);
          let changed = false;
          if (Array.isArray(cfg?.inboxMessages)) {
            cfg.inboxMessages = cfg.inboxMessages.filter((m: any) => m?.id !== messageId);
            changed = true;
          }
          if (!Array.isArray(cfg?.canceledInboxMessageIds)) {
            cfg.canceledInboxMessageIds = [];
          }
          if (!cfg.canceledInboxMessageIds.includes(messageId)) {
            cfg.canceledInboxMessageIds.push(messageId);
            changed = true;
          }
          if (changed) {
            safeLocalStorageSet(key, JSON.stringify(cfg));
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Dispara eventos em tempo real para atualização imediata na interface de todos os alunos e abas
    window.dispatchEvent(
      new CustomEvent("desafios:inbox-message-received", {
        detail: { type: "message_canceled", messageId },
      })
    );
    window.dispatchEvent(
      new CustomEvent("desafios:inbox-message-canceled", {
        detail: { messageId },
      })
    );
    broadcastInboxEvent({
      type: "message_canceled",
      messageId,
    });
  }

  return { success: true, canceledMessage: target };
}

export function loadAllInboxMessages(): SystemInboxMessage[] {
  if (typeof window === "undefined") {
    const canceled = loadCanceledMessageIds();
    return memoryInboxMessages.filter((m) => !canceled.has(m.id));
  }
  try {
    const raw = window.localStorage.getItem(INBOX_STORAGE_KEY);
    const localList: SystemInboxMessage[] = raw ? JSON.parse(raw) : [];

    const map = new Map<string, SystemInboxMessage>();
    if (Array.isArray(localList)) {
      for (const m of localList) {
        if (m && m.id) map.set(m.id, m);
      }
    }

    // Mescla com mensagens salvas no cache de configuração do ADM (nuvem/PlayFab), priorizando a versão remota mais recente
    for (const key of [ADMIN_CONFIG_LOCAL_KEY, ADMIN_CONFIG_REMOTE_KEY]) {
      try {
        const cRaw = window.localStorage.getItem(key);
        if (cRaw) {
          const cfg = JSON.parse(cRaw);
          if (Array.isArray(cfg?.inboxMessages)) {
            const isRemoteSource = key === ADMIN_CONFIG_REMOTE_KEY;
            for (const m of cfg.inboxMessages) {
              if (!m || !m.id) continue;
              const existing = map.get(m.id);
              if (!existing) {
                map.set(m.id, m);
              } else if (isRemoteSource) {
                const mVer = String((m as any).updatedAt || m.createdAt || "");
                const exVer = String((existing as any).updatedAt || existing.createdAt || "");
                if (!exVer || mVer >= exVer) {
                  map.set(m.id, m);
                }
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const canceled = loadCanceledMessageIds();
    const merged = Array.from(map.values())
      .filter((m) => !canceled.has(m.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    memoryInboxMessages = [...merged];
    return merged;
  } catch {
    const canceled = loadCanceledMessageIds();
    return memoryInboxMessages.filter((m) => !canceled.has(m.id));
  }
}

export function saveAllInboxMessages(messages: SystemInboxMessage[]): void {
  const trimmed = messages.slice(0, INBOX_RETENTION_LIMIT);
  memoryInboxMessages = [...trimmed];
  if (typeof window === "undefined") return;
  try {
    safeLocalStorageSet(INBOX_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn("Falha ao salvar caixa de mensagens:", err);
  }
}

function loadStudentMap(key: string, mem: Record<string, any>): Record<string, any> {
  if (typeof window === "undefined") return mem;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : mem;
  } catch {
    return mem;
  }
}

function saveStudentMap(key: string, data: Record<string, any>, setMem: (d: any) => void): void {
  setMem(data);
  if (typeof window === "undefined") return;
  try {
    safeLocalStorageSet(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// ----------------------------------------------------------------------------
// CRIAÇÃO DE MENSAGENS E TRANSMISSÃO
// ----------------------------------------------------------------------------

export function createInboxMessage(
  data: Omit<SystemInboxMessage, "id" | "createdAt" | "read"> & { id?: string; createdAt?: string }
): SystemInboxMessage {
  const msg: SystemInboxMessage = {
    id: data.id ?? `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    broadcastId: data.broadcastId,
    recipientId: data.recipientId,
    recipientFilter: data.recipientFilter,
    sender: data.sender,
    senderName: data.senderName ?? (data.sender === "adm" ? "Administração SEMED" : "Sistema"),
    category: data.category,
    title: data.title,
    body: data.body,
    gifLinks: data.gifLinks ?? {},
    imageLinks: data.imageLinks ?? {},
    mediaScales: data.mediaScales ?? {},
    mentionedGameId: data.mentionedGameId,
    mentionedEventId: data.mentionedEventId,
    mentionedEventTitle: data.mentionedEventTitle,
    linkEventDetails: data.linkEventDetails,
    mentionedGames: data.mentionedGames ?? {},
    mentionedEvents: data.mentionedEvents ?? {},
    reward: data.reward,
    rewards: data.rewards,
    metadata: data.metadata,
    read: false,
    includeNewPlayers: Boolean(data.includeNewPlayers),
    createdAt: data.createdAt ?? new Date().toISOString(),
  };

  const all = loadAllInboxMessages();
  if (data.id) {
    const existing = all.find((m) => m.id === msg.id);
    if (existing) return existing;
  }
  all.unshift(msg);
  saveAllInboxMessages(all);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("desafios:inbox-message-received", {
        detail: msg,
      })
    );
    broadcastInboxEvent({
      type: "new_message",
      messageId: msg.id,
      message: msg,
    });
  }

  return msg;
}

export interface AdminBroadcastDraft {
  id?: string;
  metadata?: Record<string, unknown>;
  mode: "all" | "school" | "stage" | "students";
  targetSchool?: string;
  targetStage?: string;
  targetStudentIds?: string[];
  singleStudentId?: string;
  excludedStudentIds?: string[];
  title: string;
  body: string;
  gifLinks?: Record<string, string>;
  imageLinks?: Record<string, string>;
  mediaScales?: Record<string, number>;
  mentionedGameId?: string;
  mentionedEventId?: string;
  mentionedEventTitle?: string;
  linkEventDetails?: boolean;
  includeNewPlayers?: boolean;
  mentionedGames?: Record<string, string>;
  mentionedEvents?: Record<string, {
    eventId: string;
    eventTitle?: string;
    linkEventDetails?: boolean;
  includeNewPlayers?: boolean;
  }>;
  reward?: {
    type: InboxRewardType;
    pointsAmount?: number;
    medalId?: string;
    cosmeticKind?: "avatar" | "aura";
    cosmeticId?: string;
    itemData?: Record<string, unknown>;
    isSecret: boolean;
  };
  rewards?: Array<{
    type: InboxRewardType;
    pointsAmount?: number;
    medalId?: string;
    cosmeticKind?: "avatar" | "aura";
    cosmeticId?: string;
    itemData?: Record<string, unknown>;
    isSecret: boolean;
  }>;
}

/**
 * Normaliza as recompensas de uma mensagem (suporta `rewards[]` novo e `reward` legado).
 */
export function getMessageRewards(
  msg?: Pick<SystemInboxMessage, "reward" | "rewards"> | null
): InboxReward[] {
  if (!msg) return [];
  if (Array.isArray(msg.rewards) && msg.rewards.length > 0) {
    return msg.rewards;
  }
  if (msg.reward) {
    return [msg.reward];
  }
  return [];
}

export interface ExtractedInboxTags {
  games: string[]; // e.g. ["game", "game1", "game2"]
  events: string[]; // e.g. ["event", "event1", "event2"]
  gifs: string[]; // e.g. ["gif1", "gif2"]
  imgs: string[]; // e.g. ["img1", "img2"]
}

/**
 * Extrai todas as tags entre colchetes presentes no texto da mensagem
 * (ignora menções de texto plano sem colchetes como a palavra isolada 'event' ou 'game')
 */
export function extractInboxTags(text: string): ExtractedInboxTags {
  if (!text) return { games: [], events: [], gifs: [], imgs: [] };
  const gamesSet = new Set<string>();
  const eventsSet = new Set<string>();
  const gifsSet = new Set<string>();
  const imgsSet = new Set<string>();

  const tagRegex = /\[([a-zA-Z0-9_-]+)(?::\d{1,3}%?)?\]/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const inner = match[1].toLowerCase().trim();
    if (/^game\d*$/.test(inner)) {
      gamesSet.add(inner);
    } else if (/^event\d*$/.test(inner)) {
      eventsSet.add(inner);
    } else if (/^gif\d*$/.test(inner)) {
      gifsSet.add(inner);
    } else if (/^img\d*$/.test(inner)) {
      imgsSet.add(inner);
    }
  }

  return {
    games: Array.from(gamesSet),
    events: Array.from(eventsSet),
    gifs: Array.from(gifsSet),
    imgs: Array.from(imgsSet),
  };
}

/**
 * Validação rigorosa pré-envio do Administrador:
 * Se houver qualquer tag [gameX], [eventX], [gifX] ou [imgX] no texto sem o respectivo item/link selecionado,
 * bloqueia o envio e retorna mensagem explicativa.
 */
export function validateMessageTags(
  body: string,
  config: {
    mentionedGames?: Record<string, string>;
    mentionedEvents?: Record<string, { eventId?: string }>;
    gifLinks?: Record<string, string>;
    imageLinks?: Record<string, string>;
    singleGameId?: string;
    singleEventId?: string;
  }
): { valid: boolean; errorMessage?: string } {
  const { games, events, gifs, imgs } = extractInboxTags(body);

  for (const gTag of games) {
    const selected =
      config.mentionedGames?.[gTag] || (gTag === "game" ? config.singleGameId : undefined);
    if (!selected || !selected.trim()) {
      return {
        valid: false,
        errorMessage: `Você inseriu a tag [${gTag}] no texto da mensagem, mas não selecionou nenhum jogo vinculado a ela. Por favor, selecione um jogo para [${gTag}] ou remova a tag antes de transmitir.`,
      };
    }
  }

  for (const eTag of events) {
    const selected =
      config.mentionedEvents?.[eTag]?.eventId || (eTag === "event" ? config.singleEventId : undefined);
    if (!selected || !selected.trim()) {
      return {
        valid: false,
        errorMessage: `Você inseriu a tag [${eTag}] no texto da mensagem, mas não selecionou nenhum evento vinculado a ela. Por favor, selecione um evento para [${eTag}] ou remova a tag antes de transmitir.`,
      };
    }
  }

  for (const gifTag of gifs) {
    const url =
      config.gifLinks?.[gifTag] ||
      (gifTag === "gif" ? config.gifLinks?.["gif1"] || Object.values(config.gifLinks || {})[0] : undefined);
    if (!url || !url.trim()) {
      return {
        valid: false,
        errorMessage: `Você inseriu a tag [${gifTag}] no texto da mensagem, mas não informou o link do GIF correspondente. Por favor, cole a URL do GIF ou remova a tag antes de transmitir.`,
      };
    }
  }

  for (const imgTag of imgs) {
    const url =
      config.imageLinks?.[imgTag] ||
      (imgTag === "img" ? config.imageLinks?.["img1"] || Object.values(config.imageLinks || {})[0] : undefined);
    if (!url || !url.trim()) {
      return {
        valid: false,
        errorMessage: `Você inseriu a tag [${imgTag}] no texto da mensagem, mas não informou o link da imagem correspondente. Por favor, cole a URL da imagem ou remova a tag antes de transmitir.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Resolve tags dinâmicas de texto como [nick]/[aluno], [game]/[game1] e [event]/[event1]
 */
export function formatInboxMessageText(
  text: string,
  options?: {
    playerNick?: string;
    mentionedGameId?: string;
    mentionedGameName?: string;
    mentionedGames?: Record<string, string>;
    mentionedEventTitle?: string;
    mentionedEvents?: Record<string, { eventTitle?: string }>;
    includeEmoji?: boolean;
  }
): string {
  if (!text) return "";
  let res = text;
  if (options?.playerNick !== undefined) {
    res = res.replace(/\[(?:nick|aluno)\]/gi, options.playerNick || "Aluno");
  }

  // Substitui tags de jogos: [game], [game1], [game2], etc.
  res = res.replace(/\[(game\d*)\]/gi, (match, tagKey) => {
    const key = tagKey.toLowerCase();
    const isPrimaryGameTag = key === "game" || key === "game1";
    const gId =
      options?.mentionedGames?.[key] ||
      (isPrimaryGameTag
        ? options?.mentionedGameId || Object.values(options?.mentionedGames || {})[0]
        : "");
    const normalizedGId = gId ? (gId.toLowerCase().replace(/[_-]/g, "") as GameId) : undefined;
    const gName = gId
      ? GAME_NAMES[gId as GameId] || (normalizedGId ? GAME_NAMES[normalizedGId] : undefined) || gId
      : (isPrimaryGameTag ? options?.mentionedGameName : undefined);
    if (!gName) return match;
    const prefix = options?.includeEmoji ? "🎮 " : "";
    return `${prefix}${gName}`;
  });

  // Substitui tags de eventos: [event], [event1], [event2], etc.
  res = res.replace(/\[(event\d*)\]/gi, (match, tagKey) => {
    const key = tagKey.toLowerCase();
    const isPrimaryEventTag = key === "event" || key === "event1";
    const ev =
      options?.mentionedEvents?.[key] ||
      (isPrimaryEventTag
        ? (options?.mentionedEventTitle ? { eventTitle: options.mentionedEventTitle } : Object.values(options?.mentionedEvents || {})[0])
        : undefined);
    const evTitle = ev?.eventTitle || (isPrimaryEventTag ? options?.mentionedEventTitle : undefined);
    if (!evTitle) return match;
    const prefix = options?.includeEmoji ? "✨ " : "";
    return `${prefix}${evTitle}`;
  });

  return res;
}

/**
 * Cria uma transmissão oficial pelo Administrador para múltiplos ou todos os alunos
 */
export function sendAdminBroadcastMessage(draft: AdminBroadcastDraft): SystemInboxMessage {
  const rawRewards =
    Array.isArray(draft.rewards) && draft.rewards.length > 0
      ? draft.rewards
      : draft.reward
        ? [draft.reward]
        : [];

  const nowTs = Date.now();
  const rewardsList: InboxReward[] = rawRewards
    .filter(
      (r) =>
        (r.pointsAmount && r.pointsAmount > 0) ||
        Boolean(r.medalId) ||
        Boolean(r.cosmeticId) ||
        (r.type === "future_item" && Boolean(r.itemData?.itemId)),
    )
    .map((r, idx) => ({
      id: `rew_${nowTs}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      type: r.type,
      pointsAmount: r.pointsAmount,
      medalId: r.medalId,
      cosmeticKind: r.cosmeticKind,
      cosmeticId: r.cosmeticId,
      itemData: r.itemData,
      isSecret: Boolean(r.isSecret),
      claimed: false,
    }));

  const rewardObj: InboxReward | undefined = rewardsList[0];

  const broadcastFilter: RecipientFilter = {
    school: draft.mode === "school" ? draft.targetSchool : undefined,
    stage: draft.mode === "stage" ? draft.targetStage : undefined,
    targetStudentIds: draft.mode === "students" ? draft.targetStudentIds : undefined,
    excludedStudentIds: draft.excludedStudentIds ?? [],
  };

  const defaultGameId = draft.mentionedGames?.["game"] || draft.mentionedGameId || undefined;
  const defaultEvent = draft.mentionedEvents?.["event"];
  const defaultEventId = defaultEvent?.eventId || draft.mentionedEventId || undefined;
  const defaultEventTitle = defaultEvent?.eventTitle || draft.mentionedEventTitle || undefined;
  const defaultLinkDetails = defaultEvent?.linkEventDetails ?? (draft.linkEventDetails !== false);

  const targetRecipientId =
    draft.mode === "students" && (draft.singleStudentId || (draft.targetStudentIds && draft.targetStudentIds.length === 1))
      ? (draft.singleStudentId || draft.targetStudentIds![0])
      : "ALL";

  const msg = createInboxMessage({
    id: draft.id,
    recipientId: targetRecipientId,
    recipientFilter: broadcastFilter,
    sender: "adm",
    senderName: "Administração SEMED",
    category: rewardObj ? "recompensa_especial" : "comunicado",
    title: draft.title.trim(),
    body: draft.body.trim(),
    gifLinks: draft.gifLinks ?? {},
    imageLinks: draft.imageLinks ?? {},
    mediaScales: draft.mediaScales ?? {},
    mentionedGameId: defaultGameId,
    mentionedEventId: defaultEventId,
    mentionedEventTitle: defaultEventTitle,
    linkEventDetails: defaultLinkDetails,
    mentionedGames: draft.mentionedGames ?? {},
    mentionedEvents: draft.mentionedEvents ?? {},
    reward: rewardObj,
    rewards: rewardsList.length > 0 ? rewardsList : undefined,
    metadata: draft.metadata,
    includeNewPlayers: Boolean(draft.includeNewPlayers),
  });

  return msg;
}

// ----------------------------------------------------------------------------
// LEITURA, FILTRAGEM E RESGATE PELO ALUNO
// ----------------------------------------------------------------------------

/**
 * Compara de forma tolerante e sanitizada qualquer identificador do aluno (ID, nick, nickNormalizado, PlayFabId)
 */
export function matchPlayerIdentifier(target: string, player: any): boolean {
  if (!target || !player) return false;
  const rawTarget = String(target).toLowerCase().trim();
  const strippedTarget = rawTarget.replace(/^pf_local_/, "").trim();
  const slugTarget = nickSlug(strippedTarget);
  if (!strippedTarget && !slugTarget) return false;

  const id = String(player.id || "").toLowerCase().trim();
  const strippedId = id.replace(/^pf_local_/, "").trim();
  const nick = String(player.nick || "").toLowerCase().trim();
  const nickNorm = String(player.nickNormalized || "").toLowerCase().trim();
  const playfabId = String(player.playfabId || "").toLowerCase().trim();

  const candidates = [id, strippedId, nick, nickNorm, playfabId].filter(Boolean);
  if (candidates.includes(rawTarget) || (strippedTarget && candidates.includes(strippedTarget))) {
    return true;
  }
  if (slugTarget) {
    const slugCandidates = [strippedId, nick, nickNorm].map((v) => nickSlug(v)).filter(Boolean);
    if (slugCandidates.includes(slugTarget)) {
      return true;
    }
  }
  return false;
}

/**
 * Avalia se o aluno tem direito a receber uma mensagem de transmissão
 */
export function isMessageEligibleForPlayer(
  msg: SystemInboxMessage,
  player: PlayerProfile | { id: string; nick?: string; nickNormalized?: string; playfabId?: string; school?: string; birthdate?: string }
): boolean {
  if (!player) return false;

  // Mensagem direta para o aluno
  if (matchPlayerIdentifier(msg.recipientId, player)) {
    return true;
  }

  // Mensagem de transmissão ("ALL")
  if (msg.recipientId === "ALL") {
    // Por padrão, alunos que se cadastrarem DEPOIS do envio não recebem mensagens antigas,
    // a menos que o ADM tenha marcado explicitamente `includeNewPlayers: true`.
    if (!msg.includeNewPlayers && (player as any).createdAt && msg.createdAt) {
      const msgTime = new Date(msg.createdAt).getTime();
      const playerCreatedTime = new Date((player as any).createdAt).getTime();
      // Tolerância de 10 minutos para relógios locais
      if (!isNaN(msgTime) && !isNaN(playerCreatedTime) && playerCreatedTime > msgTime + 10 * 60 * 1000) {
        return false;
      }
    }

    const filter = msg.recipientFilter;
    if (!filter) return true;

    // Se estiver explicitamente excluído
    if (Array.isArray(filter.excludedStudentIds) && filter.excludedStudentIds.length > 0) {
      const isExcluded = filter.excludedStudentIds.some((ex) => matchPlayerIdentifier(ex, player));
      if (isExcluded) return false;
    }

    // Se o filtro for para alunos específicos
    if (Array.isArray(filter.targetStudentIds) && filter.targetStudentIds.length > 0) {
      const isTargeted = filter.targetStudentIds.some((t) => matchPlayerIdentifier(t, player));
      if (!isTargeted) return false;
    }

    // Filtro por escola
    if (filter.school && filter.school !== "TODAS") {
      const sSchool = (player.school || "").toLowerCase().trim();
      const fSchool = filter.school.toLowerCase().trim();
      if (!sSchool || sSchool !== fSchool) {
        return false;
      }
    }

    // Filtro por etapa
    if (filter.stage && filter.stage !== "TODAS") {
      try {
        const st = stageForPlayer(
          player.school,
          player.birthdate,
          new Date(),
          (player as any).ageStage,
        );
        if (st.id !== filter.stage && st.shortLabel !== filter.stage) {
          return false;
        }
      } catch {
        /* ignore */
      }
    }

    return true;
  }

  return false;
}

function mergeStudentMapForAliases<T extends Record<string, any>>(
  allMap: Record<string, T>,
  aliases: string[],
): T {
  const merged = {} as Record<string, any>;
  for (const key of aliases) {
    const slice = allMap[key];
    if (slice && typeof slice === "object") {
      Object.assign(merged, slice);
    }
  }
  return merged as T;
}

function isInboxMessageAutoExpired(cloned: SystemInboxMessage, nowTime: number): boolean {
  if (!cloned.read) return false;
  let isEligibleForAutoPurge = false;
  let completionTimestamp = 0;

  if (cloned.reward) {
    // Se houver recompensa, SÓ inicia a contagem de 24h quando a recompensa estiver resgatada
    if (cloned.reward.claimed) {
      isEligibleForAutoPurge = true;
      const readTs = cloned.readAt ? new Date(cloned.readAt).getTime() : 0;
      const claimTs = cloned.reward.claimedAt ? new Date(cloned.reward.claimedAt).getTime() : 0;
      completionTimestamp = Math.max(readTs, claimTs);
    }
  } else {
    // Sem recompensa anexa: a contagem de 24h inicia com a leitura
    isEligibleForAutoPurge = true;
    completionTimestamp = cloned.readAt ? new Date(cloned.readAt).getTime() : 0;
  }

  // Fallback caso timestamps de leitura sejam zero
  if (isEligibleForAutoPurge && (!completionTimestamp || isNaN(completionTimestamp))) {
    completionTimestamp = cloned.createdAt ? new Date(cloned.createdAt).getTime() : 0;
  }

  return Boolean(
    isEligibleForAutoPurge &&
      completionTimestamp > 0 &&
      nowTime - completionTimestamp >= INBOX_MESSAGE_AUTO_PURGE_MS,
  );
}

function collectInboxMessagesForPlayer(
  player: PlayerProfile | { id: string; nick?: string; nickNormalized?: string; playfabId?: string; school?: string; birthdate?: string },
  nowTime: number = Date.now(),
): { visible: SystemInboxMessage[]; expiredIds: string[] } {
  const all = loadAllInboxMessages();
  const aliases = getPlayerAliasKeys(player);

  const deletesMap = mergeStudentMapForAliases(
    loadStudentMap(STUDENT_DELETES_KEY, memoryStudentDeletes),
    aliases,
  );
  const readsMap = mergeStudentMapForAliases(
    loadStudentMap(STUDENT_READS_KEY, memoryStudentReads),
    aliases,
  );
  const claimsMap = mergeStudentMapForAliases<Record<string, string>>(
    loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims),
    aliases,
  );

  const visible: SystemInboxMessage[] = [];
  const expiredIds: string[] = [];

  for (const raw of all) {
    // Se o envio da mensagem foi cancelado pelo ADM, não exibir para o aluno
    if (isMessageCanceled(raw.id)) continue;

    // Se o aluno já apagou a mensagem, não exibir
    if (deletesMap[raw.id]) continue;

    if (isMessageEligibleForPlayer(raw, player)) {
      // Para mensagens de transmissão (ALL), o status de lida pertence exclusivamente a este aluno
      const readVal = readsMap[raw.id];
      const isRead = raw.recipientId === "ALL"
        ? Boolean(readVal)
        : Boolean(readVal ?? raw.read);

      const isClaimedInProfile =
        Array.isArray((player as any).claimedInboxRewardIds) &&
        (player as any).claimedInboxRewardIds.includes(raw.id);
      const profileClaimTs = (player as any).claimedInboxRewardTimestamps?.[raw.id];

      const rawRewards = getMessageRewards(raw);
      const anyRawClaimed = rawRewards.some((r) => r.claimed);
      const rawFirstClaimedAt = rawRewards.find((r) => r.claimedAt)?.claimedAt;
      const claimedAt =
        claimsMap[raw.id] ||
        (isClaimedInProfile ? profileClaimTs || rawFirstClaimedAt : undefined);
      const isClaimed = Boolean(claimedAt || isClaimedInProfile || anyRawClaimed);
      const resolvedClaimedAt =
        claimedAt || (isClaimed ? profileClaimTs || rawFirstClaimedAt : undefined);

      const clonedRewards: InboxReward[] | undefined = rawRewards.length > 0
        ? rawRewards.map((r) => ({
            ...r,
            claimed: isClaimed,
            claimedAt: resolvedClaimedAt,
          }))
        : undefined;

      // Clone com estados locais do aluno
      const cloned: SystemInboxMessage = {
        ...raw,
        read: Boolean(isRead),
        readAt: typeof readVal === "string" ? readVal : raw.readAt,
        reward: clonedRewards ? clonedRewards[0] : undefined,
        rewards: clonedRewards,
      };

      // REGRA DO USUÁRIO: AUTO-EXCLUSÃO EM 24 HORAS (avaliação pura; persistência via purgeExpiredInboxMessagesForPlayer)
      if (isInboxMessageAutoExpired(cloned, nowTime)) {
        expiredIds.push(raw.id);
        continue;
      }

      visible.push(cloned);
    }
  }

  // Ordena por data decrescente (mais recente no topo)
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { visible, expiredIds };
}

/**
 * Retorna todas as mensagens da caixa de entrada do aluno, com estados de leitura e resgate aplicados.
 * Aplica filtro puro de expiração de 24 horas sem mutar localStorage durante leitura.
 */
export function getInboxMessagesForPlayer(
  player: PlayerProfile | { id: string; nick?: string; nickNormalized?: string; playfabId?: string; school?: string; birthdate?: string },
  nowTime: number = Date.now(),
): SystemInboxMessage[] {
  return collectInboxMessagesForPlayer(player, nowTime).visible;
}

/**
 * Persiste a exclusão das mensagens já expiradas pela regra de 24h (efeito explícito com relógio autoritativo).
 */
export function purgeExpiredInboxMessagesForPlayer(
  player: PlayerProfile | { id: string; nick?: string; nickNormalized?: string; playfabId?: string; school?: string; birthdate?: string; claimedInboxRewardIds?: string[] },
  nowTime: number = Date.now(),
): number {
  if (!player) return 0;
  const { expiredIds } = collectInboxMessagesForPlayer(player, nowTime);
  let purged = 0;
  for (const id of expiredIds) {
    const res = deleteInboxMessageForPlayer(id, player);
    if (res.success) purged++;
  }
  return purged;
}

/**
 * Marca uma mensagem como lida para o aluno com carimbo de data
 */
export function markInboxMessageAsRead(
  messageId: string,
  playerOrId?: string | { id: string; nick?: string; nickNormalized?: string; playfabId?: string }
): void {
  if (playerOrId) {
    const nowIso = new Date().toISOString();
    const id = typeof playerOrId === "string" ? playerOrId : playerOrId.id;
    const nick = typeof playerOrId === "object" ? playerOrId.nick : undefined;
    const canonicalKey = getCanonicalInboxStudentKey(playerOrId);

    const reads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
    if (canonicalKey) {
      if (!reads[canonicalKey]) reads[canonicalKey] = {};
      reads[canonicalKey][messageId] = nowIso;
    }
    const activeIds = new Set(loadAllInboxMessages().map((m) => m.id));
    pruneExpiredLocalInboxReceipts(reads, activeIds);
    saveStudentMap(STUDENT_READS_KEY, reads, (d) => (memoryStudentReads = d));

    // Notifica em tempo real (cross-tab / instantâneo) que a mensagem foi lida
    broadcastInboxEvent({
      type: "message_read",
      messageId,
      studentId: id,
      studentNick: nick,
    });
  }

  // Apenas altera m.read na mensagem mestra se for uma mensagem direta para 1 aluno específico
  const all = loadAllInboxMessages();
  let changed = false;
  for (const m of all) {
    if (m.id === messageId && m.recipientId !== "ALL" && !m.read) {
      m.read = true;
      changed = true;
    }
  }
  if (changed) {
    saveAllInboxMessages(all);
  }
}

/**
 * Mescla leituras vindas da nuvem PlayFab com a base local
 */
export function mergeStudentReads(
  remoteReads: Array<{ studentKey: string; messageId: string; readAt?: string }>
): void {
  const reads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
  let changed = false;
  for (const item of remoteReads) {
    if (!item.studentKey || !item.messageId) continue;
    const clean = item.studentKey.toLowerCase().trim();
    if (!clean) continue;
    if (!reads[clean]) reads[clean] = {};
    if (!reads[clean][item.messageId]) {
      reads[clean][item.messageId] = item.readAt || new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    saveStudentMap(STUDENT_READS_KEY, reads, (d) => (memoryStudentReads = d));
  }
}

/**
 * Mescla resgates de presentes/recompensas vindos da nuvem PlayFab com a base local
 */
export function mergeStudentClaims(
  remoteClaims: Array<{ studentKey: string; messageId: string; claimedAt?: string }>
): void {
  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
  let changed = false;
  for (const item of remoteClaims) {
    if (!item.studentKey || !item.messageId) continue;
    const clean = item.studentKey.toLowerCase().trim();
    if (!clean) continue;
    if (!claims[clean]) claims[clean] = {};
    if (!claims[clean][item.messageId]) {
      claims[clean][item.messageId] = item.claimedAt || new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    saveStudentMap(STUDENT_CLAIMS_KEY, claims, (d) => (memoryStudentClaims = d));
  }
}

/**
 * Informações detalhadas de leitura e resgate de um aluno em relação a uma mensagem
 */
export interface MessageReaderInfo {
  student: PlayerProfile;
  readAt?: string;
  claimedAt?: string;
  hasClaimedReward?: boolean;
}

/**
 * Calcula quem eram os destinatários de um comunicado e quem já abriu a mensagem.
 * Garante rigorosamente que nenhum aluno apareça duplicado.
 */
export function getMessageReaders(
  msg: SystemInboxMessage,
  allStudents: PlayerProfile[]
): {
  readCount: number;
  totalTargeted: number;
  readStudents: MessageReaderInfo[];
  unreadStudents: PlayerProfile[];
} {
  const reads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);

  // 1. Deduplica rigorosamente a lista de entrada de alunos para que a mesma conta não seja processada 2 vezes
  const uniqueStudentsMap = new Map<string, PlayerProfile>();
  for (const st of allStudents) {
    if (!st) continue;
    const key = (st.nickNormalized || st.nick || st.id || "").toLowerCase().trim();
    if (key && !uniqueStudentsMap.has(key)) {
      uniqueStudentsMap.set(key, st);
    }
  }
  const uniqueStudents = Array.from(uniqueStudentsMap.values());

  // 2. Filtra apenas os alunos que eram de fato elegíveis para receber este comunicado
  const targeted = uniqueStudents.filter((st) => isMessageEligibleForPlayer(msg, st));

  const readStudents: MessageReaderInfo[] = [];
  const unreadStudents: PlayerProfile[] = [];
  const processedKeys = new Set<string>();

  for (const st of targeted) {
    const pId = (st.id || "").toLowerCase().trim();
    const pNick = (st.nick || "").toLowerCase().trim();
    const pNickNorm = (st.nickNormalized || "").toLowerCase().trim();
    const pPlayfabId = (st.playfabId || "").toLowerCase().trim();

    const identKey = pNickNorm || pNick || pId;
    if (processedKeys.has(identKey)) continue;
    processedKeys.add(identKey);

    let readVal =
      (reads[pId] && reads[pId][msg.id]) ||
      (pId.startsWith("pf_local_") && reads[pId.replace(/^pf_local_/, "")] && reads[pId.replace(/^pf_local_/, "")][msg.id]) ||
      (pNick && reads[pNick] && reads[pNick][msg.id]) ||
      (pNickNorm && reads[pNickNorm] && reads[pNickNorm][msg.id]) ||
      (pPlayfabId && reads[pPlayfabId] && reads[pPlayfabId][msg.id]);

    if (!readVal) {
      // Varredura tolerante caso a chave salva na leitura corresponda ao aluno
      for (const [key, msgMap] of Object.entries(reads)) {
        if (msgMap && msgMap[msg.id] && matchPlayerIdentifier(key, st)) {
          readVal = msgMap[msg.id];
          break;
        }
      }
    }

    // Verifica resgate de recompensa
    let claimVal =
      (claims[pId] && claims[pId][msg.id]) ||
      (pNick && claims[pNick] && claims[pNick][msg.id]) ||
      (pNickNorm && claims[pNickNorm] && claims[pNickNorm][msg.id]) ||
      (pPlayfabId && claims[pPlayfabId] && claims[pPlayfabId][msg.id]);

    if (!claimVal && Array.isArray((st as any).claimedInboxRewardIds) && (st as any).claimedInboxRewardIds.includes(msg.id)) {
      claimVal = readVal || new Date().toISOString();
    }

    if (!claimVal) {
      for (const [key, msgMap] of Object.entries(claims)) {
        if (msgMap && msgMap[msg.id] && matchPlayerIdentifier(key, st)) {
          claimVal = msgMap[msg.id];
          break;
        }
      }
    }

    // Se o aluno resgatou a recompensa da mensagem, ele comprovadamente abriu e leu a mensagem
    if (!readVal && claimVal) {
      readVal = claimVal;
    }

    if (readVal) {
      const readAt = typeof readVal === "string" ? readVal : undefined;
      const claimedAt = typeof claimVal === "string" ? claimVal : undefined;
      readStudents.push({
        student: st,
        readAt,
        claimedAt,
        hasClaimedReward: Boolean(claimVal),
      });
    } else {
      unreadStudents.push(st);
    }
  }

  return {
    readCount: readStudents.length,
    totalTargeted: targeted.length,
    readStudents,
    unreadStudents,
  };
}

/**
 * Executa uma varredura retroativa ampla para reconciliar recibos de leitura
 * a partir de claims de recompensa, contas registradas e registros locais/remotos.
 */
export function runRetroactiveInboxReadsScan(
  allStudents: PlayerProfile[] = []
): { recoveredCount: number } {
  let recoveredCount = 0;
  const reads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);

  // 1. Reconciliação a partir de Recompensas Resgatadas (Claims):
  // Se um aluno resgatou a recompensa de uma mensagem, ele comprovadamente abriu a mensagem.
  for (const [studentKey, msgClaims] of Object.entries(claims)) {
    if (!msgClaims || typeof msgClaims !== "object") continue;
    if (!reads[studentKey]) reads[studentKey] = {};
    for (const [msgId, claimedAt] of Object.entries(msgClaims)) {
      if (claimedAt && !reads[studentKey][msgId]) {
        reads[studentKey][msgId] = typeof claimedAt === "string" ? claimedAt : new Date().toISOString();
        recoveredCount++;
      }
    }
  }

  // 2. Consolida leitura dos identificadores legados do aluno na chave canônica única (sem multiplicar em 4x)
  for (const st of allStudents) {
    if (!st) continue;
    const pId = (st.id || "").toLowerCase().trim();
    const pNick = (st.nick || "").toLowerCase().trim();
    const pNickNorm = (st.nickNormalized || "").toLowerCase().trim();
    const pPlayfab = (st.playfabId || "").toLowerCase().trim();
    const canonicalKey = getCanonicalInboxStudentKey(st);
    if (!canonicalKey) continue;

    const knownReads: Record<string, string> = {
      ...(reads[canonicalKey] || {}),
      ...(reads[pId] || {}),
      ...(pNick ? reads[pNick] || {} : {}),
      ...(pNickNorm ? reads[pNickNorm] || {} : {}),
      ...(pPlayfab ? reads[pPlayfab] || {} : {}),
    };

    if (Object.keys(knownReads).length > 0) {
      if (!reads[canonicalKey]) reads[canonicalKey] = {};
      for (const [mId, ts] of Object.entries(knownReads)) {
        if (!reads[canonicalKey][mId]) {
          reads[canonicalKey][mId] = ts;
          recoveredCount++;
        }
      }
    }
  }

  saveStudentMap(STUDENT_READS_KEY, reads, (d) => (memoryStudentReads = d));
  return { recoveredCount };
}

/**
 * Marca todas as mensagens de um destinatário como lidas
 */
export function markAllInboxMessagesAsReadForRecipient(playerId: string, profile?: PlayerProfile): void {
  const msgs = profile ? getInboxMessagesForPlayer(profile) : getInboxMessagesForRecipient(playerId);
  for (const m of msgs) {
    markInboxMessageAsRead(m.id, profile ?? playerId);
  }
}

/**
 * Recupera mensagens filtradas diretamente por recipientId simples (para ADM ou testes)
 */
export function getInboxMessagesForRecipient(recipientId: string): SystemInboxMessage[] {
  const all = loadAllInboxMessages();
  const clean = recipientId.toLowerCase().trim();
  return all.filter((m) => m.recipientId.toLowerCase().trim() === clean);
}

/**
 * Resgata uma recompensa presente na mensagem.
 * Atualiza pontos ou medalha do aluno e trava contra resgates duplicados.
 * Sincroniza em nuvem e impede que outro dispositivo resgate o mesmo presente novamente.
 */
function applyXpAndSyncLevelInInbox(args: {
  profile: PlayerProfile;
  xpBonus: number;
  ledgerSource: PendingScoreLedgerInput["source"];
  reason: string;
  messageId: string;
  deferLocalCommit: boolean;
  pushLedger: (entry: PendingScoreLedgerInput) => void;
}): void {
  const { profile, xpBonus, ledgerSource, reason, messageId, deferLocalCommit, pushLedger } = args;
  if (!(xpBonus > 0)) return;
  const prevLevel = Math.max(1, Math.floor(Number(profile.level) || 1));
  profile.xp = (profile.xp ?? 0) + xpBonus;
  profile.seasonXp = (profile.seasonXp ?? 0) + xpBonus;
  const cfgSlice = readCachedAdminLevelConfig();
  const synced = syncLevelStageProgress({
    xp: profile.xp,
    lifetimeMatches: profile.matchesPlayed ?? 0,
    lifetimeWins: profile.wins ?? 0,
    lifetimeDistinctGames: profile.distinctGamesPlayed ?? 0,
    currentLevel: profile.level,
    existingStage: profile.levelStageProgress ?? null,
    maxAvailableGames: cfgSlice.maxAvailableGames,
  });
  profile.level =
    synced.level ||
    calculatePlayerLevel({
      xp: profile.xp,
      matchesPlayed: profile.matchesPlayed ?? 0,
      wins: profile.wins ?? 0,
      distinctGames: profile.distinctGamesPlayed ?? 0,
      currentLevel: profile.level,
      stageProgress: profile.levelStageProgress,
      maxAvailableGames: cfgSlice.maxAvailableGames,
    });
  profile.levelStageProgress = synced.stageProgress;

  if (profile.level > prevLevel) {
    if (!Array.isArray(profile.achievedLevelsPoints)) {
      const prior: number[] = [];
      for (let lvl = 2; lvl <= prevLevel; lvl++) {
        prior.push(lvl);
      }
      profile.achievedLevelsPoints = prior;
    }
    const ptsBeforePromo = Number(profile.careerPoints ?? 0);
    const coinsBeforePromo = Number(profile.coins ?? 0);
    checkLevelPromotionPoints(profile.level, profile, 1, cfgSlice.levelCoinStep, {
      skipLedger: deferLocalCommit,
    });
    if (deferLocalCommit) {
      const ptsDelta = Number(profile.careerPoints ?? 0) - ptsBeforePromo;
      const coinsDelta = Number(profile.coins ?? 0) - coinsBeforePromo;
      if (ptsDelta > 0) {
        pushLedger({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "career_points",
          source: "promocao_nivel",
          amount: ptsDelta,
          balanceAfter: profile.careerPoints,
          reason: `Alcance do Nível ${profile.level}`,
          metadata: { messageId },
        });
      }
      if (coinsDelta > 0) {
        pushLedger({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "coins",
          source: "promocao_nivel",
          amount: coinsDelta,
          balanceAfter: profile.coins,
          reason: `Alcance do Nível ${profile.level}`,
          metadata: { messageId },
        });
      }
    }

    if (profile.level >= 5) {
      const l5 = ensureLevel5InitialLetterUnlock(profile);
      profile.unlockedAvatars = l5.profile.unlockedAvatars;
      profile.level5InitialAvatarGrantedId = l5.profile.level5InitialAvatarGrantedId;
    }
  }

  pushLedger({
    playerId: profile.id,
    playerNick: profile.nick,
    type: "xp",
    source: ledgerSource,
    amount: xpBonus,
    balanceAfter: profile.xp,
    reason,
    metadata: { messageId },
  });
}

function grantInboxCosmeticWithCompensation(args: {
  profile: PlayerProfile;
  kind: "avatar" | "aura";
  cosmeticId: string;
  msgTitle: string;
  messageId: string;
  pushLedger: (entry: PendingScoreLedgerInput) => void;
}): void {
  const { profile, kind, cosmeticId, msgTitle, messageId, pushLedger } = args;
  const grant = grantCosmeticToProfile(profile, kind, cosmeticId);
  profile.unlockedAvatars = grant.profile.unlockedAvatars;
  profile.unlockedAuras = grant.profile.unlockedAuras;
  if (grant.alreadyOwned) {
    const defs = kind === "aura" ? mergeWithDefaultAuras() : mergeWithDefaultAvatars();
    const def = defs.find((d) => d.id === cosmeticId);
    const compCoins = calculateDuplicateCosmeticCompensation(def?.priceCoins);
    if (compCoins > 0) {
      creditCoinMetrics(profile, compCoins);
      pushLedger({
        playerId: profile.id,
        playerNick: profile.nick,
        type: "coins",
        source: "correio",
        amount: compCoins,
        balanceAfter: profile.coins,
        reason: `Compensação cosmético repetido (${def?.name ?? cosmeticId} · ${msgTitle})`,
        metadata: { messageId },
      });
    }
  }
}

export function claimInboxReward(
  messageId: string,
  inputProfile: PlayerProfile,
  options?: { deferLocalCommit?: boolean; nowIso?: string },
): {
  success: boolean;
  error?: string;
  reward?: InboxReward;
  profile: PlayerProfile;
  claimedAt?: string;
  pendingLedgerEntries?: PendingScoreLedgerInput[];
} {
  if (!inputProfile) {
    return { success: false, error: "Perfil do aluno inválido.", profile: inputProfile };
  }
  const deferLocalCommit = Boolean(options?.deferLocalCommit);
  // Quando deferLocalCommit=true, opera em clone seguro para que falha no servidor não corrompa estado local
  const profile: PlayerProfile = deferLocalCommit
    ? {
        ...inputProfile,
        unopenedChests: inputProfile.unopenedChests ? { ...inputProfile.unopenedChests } : undefined,
        unopenedPacks: inputProfile.unopenedPacks ? { ...inputProfile.unopenedPacks } : undefined,
        unlockedAvatars: Array.isArray(inputProfile.unlockedAvatars) ? [...inputProfile.unlockedAvatars] : undefined,
        unlockedAuras: Array.isArray(inputProfile.unlockedAuras) ? [...inputProfile.unlockedAuras] : undefined,
        unlockedMedals: Array.isArray(inputProfile.unlockedMedals)
          ? inputProfile.unlockedMedals.map((m) => ({ ...m }))
          : undefined,
        claimedInboxRewardIds: Array.isArray(inputProfile.claimedInboxRewardIds)
          ? [...inputProfile.claimedInboxRewardIds]
          : undefined,
        claimedInboxRewardTimestamps: inputProfile.claimedInboxRewardTimestamps
          ? { ...inputProfile.claimedInboxRewardTimestamps }
          : undefined,
      }
    : inputProfile;

  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
  const aliases = getPlayerAliasKeys(profile);
  const alreadyClaimedLocal = aliases.some((k) => Boolean(claims[k]?.[messageId]));

  const alreadyClaimedProfile =
    Array.isArray(profile.claimedInboxRewardIds) && profile.claimedInboxRewardIds.includes(messageId);

  if (alreadyClaimedLocal || alreadyClaimedProfile) {
    return { success: false, error: "Esta recompensa já foi resgatada anteriormente.", profile };
  }

  if (isMessageCanceled(messageId)) {
    return { success: false, error: "Esta mensagem foi cancelada pela administração.", profile };
  }

  const all = loadAllInboxMessages();
  const msg = all.find((m) => m.id === messageId);
  const rewardsList = getMessageRewards(msg);
  if (!msg || rewardsList.length === 0) {
    return { success: false, error: "Nenhuma recompensa encontrada nesta mensagem.", profile };
  }

  if (!isMessageEligibleForPlayer(msg, profile)) {
    return { success: false, error: "Esta recompensa não pertence a este perfil de aluno.", profile };
  }

  if (msg.recipientId !== "ALL" && rewardsList.every((r) => r.claimed)) {
    return { success: false, error: "Esta recompensa já foi resgatada anteriormente.", profile };
  }

  const nowIso = options?.nowIso ?? new Date().toISOString();
  const pendingLedgerEntries: PendingScoreLedgerInput[] = [];
  const pushLedger = (entry: PendingScoreLedgerInput) => {
    if (deferLocalCommit) {
      pendingLedgerEntries.push(entry);
    } else {
      try {
        recordScoreLedgerEntry(entry);
      } catch {
        /* ignore */
      }
    }
  };

  for (const reward of rewardsList) {
    // 1. Conceder Pontos se houver (ledger único via pushLedger)
    if (reward.type === "points" && reward.pointsAmount && reward.pointsAmount > 0) {
      awardCareerPoints(profile, reward.pointsAmount, `Recompensa Correio: ${msg.title}`, 1, {
        source: "correio",
        skipLedger: true,
      });
      pushLedger({
        playerId: profile.id,
        playerNick: profile.nick,
        type: "career_points",
        source: "correio",
        amount: reward.pointsAmount!,
        balanceAfter: profile.careerPoints,
        reason: `Recompensa Postal: ${reward.pointsAmount} Pontos`,
        metadata: { messageId },
      });
    }

    // 1.1 Conceder XP direto se houver (com sincronização completa de nível e bônus de promoção)
    if (reward.type === "xp" && reward.pointsAmount && reward.pointsAmount > 0) {
      const xpBonus = reward.pointsAmount;
      applyXpAndSyncLevelInInbox({
        profile,
        xpBonus,
        ledgerSource: "correio",
        reason: `Recompensa Postal: +${xpBonus} XP (${msg.title})`,
        messageId,
        deferLocalCommit,
        pushLedger,
      });
    }

    // 1.2 Conceder Moedas se houver
    if (reward.type === "coins" && reward.pointsAmount && reward.pointsAmount > 0) {
      const coinsBonus = Math.floor(reward.pointsAmount);
      creditCoinMetrics(profile, coinsBonus);
      pushLedger({
        playerId: profile.id,
        playerNick: profile.nick,
        type: "coins",
        source: "correio",
        amount: coinsBonus,
        balanceAfter: profile.coins,
        reason: `Recompensa Postal: +${coinsBonus} Moedas (${msg.title})`,
        metadata: { messageId },
      });
    }

    // 1.3 Conceder Cosmético (Avatar ou Aura) se houver, com compensação por duplicata
    if (reward.type === "cosmetic" && reward.cosmeticId) {
      const kind: "avatar" | "aura" = reward.cosmeticKind === "aura" ? "aura" : "avatar";
      grantInboxCosmeticWithCompensation({
        profile,
        kind,
        cosmeticId: reward.cosmeticId,
        msgTitle: msg.title,
        messageId,
        pushLedger,
      });
    }

    // 1.4 Conceder Item (Baú, Pacote de Cartas ou Cosmético) via future_item
    if (reward.type === "future_item" && reward.itemData) {
      const cat = String(reward.itemData.itemCategory || "");
      const itemId = String(reward.itemData.itemId || "");
      const qty = Math.max(1, Math.floor(Number(reward.itemData.quantity) || 1));
      if (itemId) {
        if (cat === "chest") {
          const prevChests = { ...(profile.unopenedChests ?? {}) };
          prevChests[itemId] = (Number(prevChests[itemId]) || 0) + qty;
          profile.unopenedChests = prevChests;
        } else if (cat === "card_pack") {
          const normalizedPackId = normalizeCardPackId(itemId);
          const prevPacks = { ...(profile.unopenedPacks ?? {}) };
          prevPacks[normalizedPackId] = (Number(prevPacks[normalizedPackId]) || 0) + qty;
          profile.unopenedPacks = prevPacks;
        } else if (cat === "cosmetic") {
          const cKind: "avatar" | "aura" = String(reward.itemData.cosmeticKind || "avatar") === "aura" ? "aura" : "avatar";
          grantInboxCosmeticWithCompensation({
            profile,
            kind: cKind,
            cosmeticId: itemId,
            msgTitle: msg.title,
            messageId,
            pushLedger,
          });
        }
      }
    }

    // 2. Conceder Medalha se houver (Opção A: sem auto-XP/pontos do catálogo; respeita isStackable)
    if (reward.type === "medal") {
      if (reward.medalId) {
        const allMedals = getAllAvailableMedals();
        const medalDef = allMedals.find((m) => m.id === reward.medalId);
        if (medalDef) {
          if (!Array.isArray(profile.unlockedMedals)) {
            profile.unlockedMedals = [];
          }
          const existing = profile.unlockedMedals.find((u) => u.medalId === reward.medalId);
          if (!existing) {
            const newUnlocked: PlayerUnlockedMedal = {
              medalId: medalDef.id,
              unlockedAt: nowIso,
              count: 1,
            };
            profile.unlockedMedals.push(newUnlocked);
          } else if (medalDef.isStackable) {
            existing.count = (existing.count ?? 1) + 1;
          }
        }
      }

      // Se houver dados de medalha do torneio ranqueado no itemData
      const tm = (reward.itemData as any)?.tournamentMedal as TournamentMedal | undefined;
      if (tm) {
        profile.tournamentMedals = accumulateTournamentMedal(profile.tournamentMedals ?? [], tm);
        // Concede exclusivamente o bônus de XP previsto na medalha ranqueada (jamais converte pointsAmount de moedas/loja em XP!)
        const bonusXp = tm.bonusXpAwarded ?? 0;
        if (bonusXp > 0) {
          applyXpAndSyncLevelInInbox({
            profile,
            xpBonus: bonusXp,
            ledgerSource: "torneio_semanal",
            reason: `Bônus de XP do Torneio Ranqueado (${tm.label || tm.tier})`,
            messageId,
            deferLocalCommit,
            pushLedger,
          });
        }
      }

      if (reward.medalId) {
        pushLedger({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "medal",
          source: "correio",
          amount: 1,
          reason: `Medalha Resgatada da Caixa Postal (${reward.medalId})`,
          metadata: { messageId, medalId: reward.medalId },
        });
      }
    }
  }

  // 3. Atualizar profile.claimedInboxRewardIds e timestamps cross-device
  if (!Array.isArray(profile.claimedInboxRewardIds)) {
    profile.claimedInboxRewardIds = [];
  }
  if (!profile.claimedInboxRewardIds.includes(messageId)) {
    profile.claimedInboxRewardIds.push(messageId);
  }
  profile.claimedInboxRewardTimestamps = {
    ...(profile.claimedInboxRewardTimestamps ?? {}),
    [messageId]: nowIso,
  };

  if (!deferLocalCommit) {
    commitInboxClaimLocally(messageId, profile, nowIso);
  }

  return {
    success: true,
    reward: { ...rewardsList[0], claimed: true, claimedAt: nowIso },
    profile,
    claimedAt: nowIso,
    ...(deferLocalCommit ? { pendingLedgerEntries } : {}),
  };
}

/**
 * Efetiva o marcador local de resgate de recompensa do Correio (localStorage + cache em memória)
 * e grava os lançamentos adiados no livro-razão após confirmação do servidor.
 */
export function commitInboxClaimLocally(
  messageId: string,
  profile: PlayerProfile,
  claimedAtIso = new Date().toISOString(),
  pendingLedgerEntries?: PendingScoreLedgerInput[],
): void {
  const canonicalKey = getCanonicalInboxStudentKey(profile);

  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
  if (canonicalKey) {
    if (!claims[canonicalKey]) claims[canonicalKey] = {};
    claims[canonicalKey][messageId] = claimedAtIso;
  }
  const activeIds = new Set(loadAllInboxMessages().map((m) => m.id));
  pruneExpiredLocalInboxReceipts(claims, activeIds);
  saveStudentMap(STUDENT_CLAIMS_KEY, claims, (d) => (memoryStudentClaims = d));

  profile.claimedInboxRewardTimestamps = {
    ...(profile.claimedInboxRewardTimestamps ?? {}),
    [messageId]: claimedAtIso,
  };

  if (Array.isArray(pendingLedgerEntries) && pendingLedgerEntries.length > 0) {
    for (const entry of pendingLedgerEntries) {
      try {
        recordScoreLedgerEntry(entry);
      } catch {
        /* ignore */
      }
    }
  }

  markInboxMessageAsRead(messageId, profile);
  broadcastInboxEvent({
    type: "rewards_claimed",
    messageId,
    studentId: profile.id,
    studentNick: profile.nick,
  });

  const all = loadAllInboxMessages();
  const msg = all.find((m) => m.id === messageId);
  if (msg && msg.recipientId !== "ALL") {
    const rewardsList = getMessageRewards(msg);
    for (const r of rewardsList) {
      r.claimed = true;
      r.claimedAt = claimedAtIso;
    }
    if (msg.reward) {
      msg.reward.claimed = true;
      msg.reward.claimedAt = claimedAtIso;
    }
    saveAllInboxMessages(all);
  }
}

/**
 * Apaga a mensagem para o aluno.
 * REGRA RIGOROSA: Mensagens com recompensa NÃO podem ser apagadas antes do resgate!
 */
export function deleteInboxMessageForPlayer(
  messageId: string,
  player: PlayerProfile | { id: string; nick?: string; nickNormalized?: string; playfabId?: string; claimedInboxRewardIds?: string[] }
): { success: boolean; error?: string } {
  const aliases = getPlayerAliasKeys(player);
  const all = loadAllInboxMessages();
  const msg = all.find((m) => m.id === messageId);

  if (!msg) {
    return { success: true };
  }

  // Se a mensagem tiver recompensa, verificar se o aluno já resgatou (local OU cross-device via claimedInboxRewardIds)
  const msgRewards = getMessageRewards(msg);
  if (msgRewards.length > 0) {
    const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
    const claimedLocal = aliases.some((k) => Boolean(claims[k]?.[messageId]));
    const claimedProfile = Boolean(
      Array.isArray(player.claimedInboxRewardIds) &&
        player.claimedInboxRewardIds.includes(messageId),
    );
    const hasClaimed = Boolean(
      claimedLocal ||
        claimedProfile ||
        (msg.recipientId !== "ALL" && msgRewards.every((r) => r.claimed)),
    );
    if (!hasClaimed) {
      return {
        success: false,
        error: "Você precisa resgatar sua recompensa antes de apagar esta mensagem!",
      };
    }
  }

  // Marca como deletada apenas na chave canônica única do aluno (elimina amplificação 4x)
  const deletes = loadStudentMap(STUDENT_DELETES_KEY, memoryStudentDeletes);
  const canonicalKey = getCanonicalInboxStudentKey(player);
  if (canonicalKey) {
    if (!deletes[canonicalKey]) deletes[canonicalKey] = {};
    deletes[canonicalKey][messageId] = true;
  }
  saveStudentMap(STUDENT_DELETES_KEY, deletes, (d) => (memoryStudentDeletes = d));

  return { success: true };
}

/**
 * Remove completamente uma mensagem da lista global pelo ID (usado por exemplo na renovação de ciclo de mensagens programadas)
 */
export function removeInboxMessageById(messageId: string): void {
  const all = loadAllInboxMessages();
  const filtered = all.filter((m) => m.id !== messageId);
  if (filtered.length !== all.length) {
    saveAllInboxMessages(filtered);
  }
}

/**
 * Contabiliza mensagens não lidas e recompensas pendentes para badges do cabeçalho
 */
export function getInboxCountsForPlayer(
  player?: PlayerProfile | null
): { unreadCount: number; unclaimedRewardsCount: number; totalAlerts: number } {
  if (!player) return { unreadCount: 0, unclaimedRewardsCount: 0, totalAlerts: 0 };
  const msgs = getInboxMessagesForPlayer(player);
  let unreadCount = 0;
  let unclaimedRewardsCount = 0;

  for (const m of msgs) {
    if (!m.read) unreadCount++;
    const mRewards = getMessageRewards(m);
    if (mRewards.some((r) => !r.claimed)) unclaimedRewardsCount++;
  }

  return {
    unreadCount,
    unclaimedRewardsCount,
    totalAlerts: unreadCount + unclaimedRewardsCount,
  };
}

/**
 * Cria notificacao de seguranca de tentativa / login em segundo aparelho
 */
export function recordDeviceSecurityAlert(args: {
  studentNick: string;
  studentFullName: string;
  studentId: string;
  deviceInfo?: string;
  timestamp?: number;
}): { studentMsg: SystemInboxMessage; adminMsg: SystemInboxMessage } {
  const now = args.timestamp ? new Date(args.timestamp) : new Date();
  const timeFormatted = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateFormatted = now.toLocaleDateString("pt-BR");

  // Mensagem para o aluno
  const studentMsg = createInboxMessage({
    recipientId: args.studentId,
    sender: "seguranca",
    senderName: "Segurança do Sistema",
    category: "seguranca_acesso",
    title: "Alerta de Segurança: Acesso em outro aparelho",
    body: `Sua conta foi conectada em outro dispositivo às ${timeFormatted} de ${dateFormatted}. Se não foi você, procure a coordenação escolar ou seu professor.`,
    metadata: {
      deviceInfo: args.deviceInfo || "Navegador Web",
      attemptedAt: now.toISOString(),
      studentNick: args.studentNick,
      studentId: args.studentId,
    },
  });

  // Mensagem para o ADM
  const adminMsg = createInboxMessage({
    recipientId: "admin",
    sender: "seguranca",
    senderName: "Segurança do Sistema",
    category: "seguranca_acesso",
    title: `Tentativa de acesso simultâneo: ${args.studentNick}`,
    body: `O aluno ${args.studentFullName} (${args.studentNick}) registrou uma conexão em um novo aparelho às ${timeFormatted} de ${dateFormatted}, encerrando a sessão anterior.`,
    metadata: {
      deviceInfo: args.deviceInfo || "Navegador Web",
      attemptedAt: now.toISOString(),
      studentNick: args.studentNick,
      studentFullName: args.studentFullName,
      studentId: args.studentId,
    },
  });

  return { studentMsg, adminMsg };
}

export interface InboxMediaToken {
  prefix: "gif" | "img";
  tagKey: string;
  resolvedTagKey: string;
  url?: string;
  scale: number;
}

export type InboxBodySegment =
  | { type: "text"; content: string }
  | { type: "media-group"; items: InboxMediaToken[] };

/**
 * Retorna a largura de cada item na grade flex-wrap (gap-3 = 0.75rem) de acordo com a escala:
 * - <= 40%: até 4 por linha
 * - <= 60%: até 3 por linha
 * - <= 80%: até 2 por linha
 * - > 80% (100%): 1 por linha
 */
/**
 * Valida URL de mídia externa/interna para impedir esquemas perigosos (javascript:, data:, etc.)
 */
export function isSafeMediaUrl(url?: string | null): boolean {
  return isSafeHttpOrRelativeMediaUrl(url, { allowDataImage: false });
}

export function getMediaRowSlotWidth(scale: number): string {
  if (scale <= 40) return "calc((100% - 2.25rem) / 4)";
  if (scale <= 60) return "calc((100% - 1.5rem) / 3)";
  if (scale <= 80) return "calc((100% - 0.75rem) / 2)";
  return "100%";
}

/**
 * Divide o corpo da mensagem em segmentos de texto e grupos de mídia consecutiva
 * (separada apenas por espaços/quebras de linha), permitindo exibir múltiplas
 * mídias lado a lado conforme a capacidade da linha definida pela escala.
 */
export function splitInboxBodySegments(
  body: string,
  options?: {
    gifLinks?: Record<string, string>;
    imageLinks?: Record<string, string>;
    mediaScales?: Record<string, number>;
  },
): InboxBodySegment[] {
  const gifLinks = options?.gifLinks;
  const imageLinks = options?.imageLinks;
  const mediaScales = options?.mediaScales;
  const parts = body.split(/(\[(?:gif|img)\d*(?::\d+%?)?\])/gi);
  const segments: InboxBodySegment[] = [];

  for (const part of parts) {
    const match = /^\[(gif|img)(\d*)(?::(\d+)%?)?\]$/i.exec(part.trim());
    if (match) {
      const prefix = match[1].toLowerCase() as "gif" | "img";
      const tagNum = match[2];
      const tagKey = tagNum ? `${prefix}${tagNum}`.toLowerCase() : prefix;
      const resolvedTagKey =
        prefix === "gif"
          ? gifLinks?.[tagKey]
            ? tagKey
            : tagKey === "gif"
              ? gifLinks?.["gif1"]
                ? "gif1"
                : Object.keys(gifLinks || {})[0] || tagKey
              : tagKey
          : imageLinks?.[tagKey]
            ? tagKey
            : tagKey === "img"
              ? imageLinks?.["img1"]
                ? "img1"
                : Object.keys(imageLinks || {})[0] || tagKey
              : tagKey;

      const url = prefix === "gif" ? gifLinks?.[resolvedTagKey] : imageLinks?.[resolvedTagKey];
      const inlineScale = match[3] ? Number(match[3]) : undefined;
      const scale = Math.min(
        100,
        Math.max(10, mediaScales?.[resolvedTagKey] ?? mediaScales?.[tagKey] ?? inlineScale ?? 100),
      );

      const token: InboxMediaToken = { prefix, tagKey, resolvedTagKey, url, scale };
      const last = segments[segments.length - 1];
      if (last && last.type === "media-group") {
        last.items.push(token);
      } else {
        segments.push({ type: "media-group", items: [token] });
      }
      continue;
    }

    // Ignora apenas espaços/quebras de linha entre tags de mídia consecutivas
    if (!part.trim()) {
      const last = segments[segments.length - 1];
      if (last && last.type === "media-group") {
        continue;
      }
      if (!part) continue;
    }

    const last = segments[segments.length - 1];
    if (last && last.type === "text") {
      last.content += part;
    } else {
      segments.push({ type: "text", content: part });
    }
  }

  return segments;
}

export interface InboxInlineTextSegment {
  text: string;
  bold: boolean;
}

/**
 * Interpreta trechos entre asteriscos (*texto* ou **texto**) como negrito (estilo WhatsApp),
 * removendo os asteriscos de marcação. Asteriscos soltos sem par na mesma linha são preservados.
 */
export function parseInboxBoldSegments(text: string): InboxInlineTextSegment[] {
  if (!text) return [];
  const regex = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  const result: InboxInlineTextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    const inner = match[1] ?? match[2] ?? "";
    if (inner.length > 0) {
      result.push({ text: inner, bold: true });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex), bold: false });
  }

  return result;
}

/**
 * Remove os asteriscos de marcação de negrito para pré-visualizações em texto simples.
 */
export function stripInboxBoldMarkers(text: string): string {
  if (!text) return "";
  return text.replace(/\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g, "$1$2");
}
