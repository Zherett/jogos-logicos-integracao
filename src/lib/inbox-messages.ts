// Modulo de Mensagens, Notificacoes e Correio do Aluno (Inbox System)
// Suporta:
// - Alertas de seguranca (login em outro dispositivo)
// - Comunicados administrativos com texto amplo e suporte a tags de GIF ([gif1], [gif2])
// - Transmissao em massa (Broadcast geral, por escola, por etapa ou aluno especifico com checkboxes)
// - Recompensas em pontos e medalhas (normais e secretas com revelacao)
// - Regra de exclusao: mensagens com recompensa nao podem ser apagadas ate o resgate

import type { PlayerProfile } from "./playfab.ts";
import { awardCareerPoints } from "./career-points.ts";
import { getAllAvailableMedals, type PlayerUnlockedMedal } from "./medals-catalog.ts";
import { stageFromBirthdate } from "./player-profile.ts";
import { GAME_NAMES, type GameId } from "./game-storage.ts";

export type InboxRewardType = "points" | "medal" | "future_item";

export interface InboxReward {
  id: string;
  type: InboxRewardType;
  pointsAmount?: number;
  medalId?: string;
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
  mentionedGameId?: string; // ID do jogo referenciado na tag [game] (apenas menção de texto)
  mentionedEventId?: string; // ID do evento referenciado na tag [event]
  mentionedEventTitle?: string; // Nome do evento para cache e fallback
  linkEventDetails?: boolean; // Se true (padrão), o nome do evento é clicável e abre modal com detalhes
  mentionedGames?: Record<string, string>; // Tags indexadas de jogos: { game: "velha", game1: "memoria", game2: "quebra-cabeca" }
  mentionedEvents?: Record<string, {
    eventId: string;
    eventTitle?: string;
    linkEventDetails?: boolean;
  }>; // Tags indexadas de eventos: { event: { eventId, ... }, event1: { ... } }
  reward?: InboxReward;
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
      window.localStorage.setItem("desafios_inbox_sync_pulse", JSON.stringify(fullPayload));
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
    window.localStorage.setItem(CANCELED_MESSAGES_KEY, JSON.stringify(Array.from(set)));
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
            window.localStorage.setItem(key, JSON.stringify(cfg));
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

    // Mescla com mensagens salvas no cache de configuração do ADM (nuvem/PlayFab)
    for (const key of [ADMIN_CONFIG_LOCAL_KEY, ADMIN_CONFIG_REMOTE_KEY]) {
      try {
        const cRaw = window.localStorage.getItem(key);
        if (cRaw) {
          const cfg = JSON.parse(cRaw);
          if (Array.isArray(cfg?.inboxMessages)) {
            for (const m of cfg.inboxMessages) {
              if (m && m.id && !map.has(m.id)) {
                map.set(m.id, m);
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
  const trimmed = messages.slice(0, 500);
  memoryInboxMessages = [...trimmed];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(trimmed));
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
    window.localStorage.setItem(key, JSON.stringify(data));
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
    mentionedGameId: data.mentionedGameId,
    mentionedEventId: data.mentionedEventId,
    mentionedEventTitle: data.mentionedEventTitle,
    linkEventDetails: data.linkEventDetails,
    mentionedGames: data.mentionedGames ?? {},
    mentionedEvents: data.mentionedEvents ?? {},
    reward: data.reward,
    metadata: data.metadata,
    read: false,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };

  const all = loadAllInboxMessages();
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
  mode: "all" | "school" | "stage" | "students";
  targetSchool?: string;
  targetStage?: string;
  targetStudentIds?: string[];
  excludedStudentIds?: string[];
  title: string;
  body: string;
  gifLinks?: Record<string, string>;
  imageLinks?: Record<string, string>;
  mentionedGameId?: string;
  mentionedEventId?: string;
  mentionedEventTitle?: string;
  linkEventDetails?: boolean;
  mentionedGames?: Record<string, string>;
  mentionedEvents?: Record<string, {
    eventId: string;
    eventTitle?: string;
    linkEventDetails?: boolean;
  }>;
  reward?: {
    type: InboxRewardType;
    pointsAmount?: number;
    medalId?: string;
    isSecret: boolean;
  };
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
  const tagMatches = text.match(/\[([a-zA-Z0-9_-]+)\]/g) || [];
  const gamesSet = new Set<string>();
  const eventsSet = new Set<string>();
  const gifsSet = new Set<string>();
  const imgsSet = new Set<string>();

  for (const raw of tagMatches) {
    const inner = raw.slice(1, -1).toLowerCase().trim();
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
    const gId =
      options?.mentionedGames?.[key] ||
      (key === "game"
        ? options?.mentionedGameId || Object.values(options?.mentionedGames || {})[0]
        : options?.mentionedGameId || Object.values(options?.mentionedGames || {})[0] || "");
    const normalizedGId = gId ? (gId.toLowerCase().replace(/[_-]/g, "") as GameId) : undefined;
    const gName = gId
      ? GAME_NAMES[gId as GameId] || (normalizedGId ? GAME_NAMES[normalizedGId] : undefined) || gId
      : (key === "game" ? options?.mentionedGameName : undefined);
    if (!gName) return match;
    const prefix = options?.includeEmoji ? "🎮 " : "";
    return `${prefix}${gName}`;
  });

  // Substitui tags de eventos: [event], [event1], [event2], etc.
  res = res.replace(/\[(event\d*)\]/gi, (match, tagKey) => {
    const key = tagKey.toLowerCase();
    const ev =
      options?.mentionedEvents?.[key] ||
      (key === "event"
        ? (options?.mentionedEventTitle ? { eventTitle: options.mentionedEventTitle } : Object.values(options?.mentionedEvents || {})[0])
        : (options?.mentionedEventTitle ? { eventTitle: options.mentionedEventTitle } : Object.values(options?.mentionedEvents || {})[0]));
    const evTitle = ev?.eventTitle || (key === "event" ? options?.mentionedEventTitle : undefined);
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
  let rewardObj: InboxReward | undefined;
  if (draft.reward && (draft.reward.pointsAmount || draft.reward.medalId)) {
    rewardObj = {
      id: `rew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: draft.reward.type,
      pointsAmount: draft.reward.pointsAmount,
      medalId: draft.reward.medalId,
      isSecret: Boolean(draft.reward.isSecret),
      claimed: false,
    };
  }

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

  const msg = createInboxMessage({
    recipientId: draft.mode === "students" && draft.targetStudentIds?.length === 1 ? draft.targetStudentIds[0] : "ALL",
    recipientFilter: broadcastFilter,
    sender: "adm",
    senderName: "Administração SEMED",
    category: rewardObj ? "recompensa_especial" : "comunicado",
    title: draft.title.trim(),
    body: draft.body.trim(),
    gifLinks: draft.gifLinks ?? {},
    imageLinks: draft.imageLinks ?? {},
    mentionedGameId: defaultGameId,
    mentionedEventId: defaultEventId,
    mentionedEventTitle: defaultEventTitle,
    linkEventDetails: defaultLinkDetails,
    mentionedGames: draft.mentionedGames ?? {},
    mentionedEvents: draft.mentionedEvents ?? {},
    reward: rewardObj,
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
  const t = target.toLowerCase().trim();
  const id = (player.id || "").toLowerCase().trim();
  const nick = (player.nick || "").toLowerCase().trim();
  const nickNorm = (player.nickNormalized || "").toLowerCase().trim();
  const playfabId = (player.playfabId || "").toLowerCase().trim();

  if (t === id || t === nick || (nickNorm && t === nickNorm) || (playfabId && t === playfabId)) {
    return true;
  }
  if (t.replace(/^pf_local_/, "") === nick || t.replace(/^pf_local_/, "") === nickNorm) {
    return true;
  }
  if (id.replace(/^pf_local_/, "") === t) {
    return true;
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
      if (player.birthdate) {
        try {
          const st = stageFromBirthdate(player.birthdate, new Date(), player.school);
          if (st.id !== filter.stage && st.shortLabel !== filter.stage) {
            return false;
          }
        } catch {
          /* ignore */
        }
      }
    }

    return true;
  }

  return false;
}

/**
 * Retorna todas as mensagens da caixa de entrada do aluno, com estados de leitura e resgate aplicados.
 * Aplica a regra de expiração de 24 horas: mensagens lidas e com recompensas resgatadas são auto-apagadas após 24h.
 */
export function getInboxMessagesForPlayer(
  player: PlayerProfile | { id: string; nick?: string; school?: string; birthdate?: string },
  nowTime: number = Date.now()
): SystemInboxMessage[] {
  const all = loadAllInboxMessages();
  const pId = (player.id || "").toLowerCase().trim();
  const pNick = (player.nick || "").toLowerCase().trim();

  const deletesMap = loadStudentMap(STUDENT_DELETES_KEY, memoryStudentDeletes)[pId] || {};
  const allReads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
  const readsMap: Record<string, any> = {
    ...(allReads[pId] || {}),
    ...(pNick ? allReads[pNick] || {} : {}),
    ...(pId.startsWith("pf_local_") ? allReads[pId.replace(/^pf_local_/, "")] || {} : {}),
  };

  const allClaims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
  const pNickNorm = ((player as any).nickNormalized || "").toLowerCase().trim();
  const pPlayfabId = ((player as any).playfabId || "").toLowerCase().trim();
  const claimsMap: Record<string, string> = {
    ...(allClaims[pId] || {}),
    ...(pNick ? allClaims[pNick] || {} : {}),
    ...(pNickNorm ? allClaims[pNickNorm] || {} : {}),
    ...(pPlayfabId ? allClaims[pPlayfabId] || {} : {}),
    ...(pId.startsWith("pf_local_") ? allClaims[pId.replace(/^pf_local_/, "")] || {} : {}),
  };

  const playerMessages: SystemInboxMessage[] = [];

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

      const claimedAt = claimsMap[raw.id] || (isClaimedInProfile ? (raw.reward?.claimedAt || new Date().toISOString()) : undefined);
      const isClaimed = Boolean(claimedAt || isClaimedInProfile || raw.reward?.claimed);

      // Clone com estados locais do aluno
      const cloned: SystemInboxMessage = {
        ...raw,
        read: Boolean(isRead),
        readAt: typeof readVal === "string" ? readVal : raw.readAt,
        reward: raw.reward
          ? {
              ...raw.reward,
              claimed: isClaimed,
              claimedAt: claimedAt || (isClaimed ? raw.reward.claimedAt || new Date().toISOString() : undefined),
            }
          : undefined,
      };

      // REGRA DO USUÁRIO: AUTO-EXCLUSÃO EM 24 HORAS
      // "As mensagens da caixa de entrada que forem lidas e que tiverem as recompensas resgatadas,
      // e que não forem deletadas, serão apagadas em 24 horas. Se não forem apagadas manualmente,
      // elas automaticamente vão se apagar se já tiverem sido lidas e se as recompensas, caso houver,
      // tenham sido resgatadas. Se ainda houver recompensas para resgatar, essa contagem não é iniciada."
      if (cloned.read) {
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

        if (isEligibleForAutoPurge && completionTimestamp > 0) {
          if (nowTime - completionTimestamp >= INBOX_MESSAGE_AUTO_PURGE_MS) {
            // Auto-apaga a mensagem para este aluno
            deleteInboxMessageForPlayer(raw.id, player);
            continue;
          }
        }
      }

      playerMessages.push(cloned);
    }
  }

  // Ordena por data decrescente (mais recente no topo)
  playerMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return playerMessages;
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
    const nickNorm = typeof playerOrId === "object" ? playerOrId.nickNormalized : undefined;
    const playfabId = typeof playerOrId === "object" ? playerOrId.playfabId : undefined;

    const reads = loadStudentMap(STUDENT_READS_KEY, memoryStudentReads);
    const markKey = (k?: string) => {
      if (!k) return;
      const clean = k.toLowerCase().trim();
      if (!clean) return;
      if (!reads[clean]) reads[clean] = {};
      reads[clean][messageId] = nowIso;
    };

    markKey(id);
    if (id && id.startsWith("pf_local_")) {
      markKey(id.replace(/^pf_local_/, ""));
    }
    markKey(nick);
    markKey(nickNorm);
    markKey(playfabId);
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

  // 2. Propagação de leitura entre os múltiplos identificadores do mesmo aluno
  for (const st of allStudents) {
    if (!st) continue;
    const pId = (st.id || "").toLowerCase().trim();
    const pNick = (st.nick || "").toLowerCase().trim();
    const pNickNorm = (st.nickNormalized || "").toLowerCase().trim();
    const pPlayfab = (st.playfabId || "").toLowerCase().trim();

    const knownReads: Record<string, string> = {
      ...(reads[pId] || {}),
      ...(pNick ? reads[pNick] || {} : {}),
      ...(pNickNorm ? reads[pNickNorm] || {} : {}),
      ...(pPlayfab ? reads[pPlayfab] || {} : {}),
    };

    if (Object.keys(knownReads).length > 0) {
      for (const alias of [pId, pNick, pNickNorm, pPlayfab]) {
        if (!alias) continue;
        if (!reads[alias]) reads[alias] = {};
        for (const [mId, ts] of Object.entries(knownReads)) {
          if (!reads[alias][mId]) {
            reads[alias][mId] = ts;
            recoveredCount++;
          }
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
    markInboxMessageAsRead(m.id, playerId);
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
export function claimInboxReward(
  messageId: string,
  profile: PlayerProfile
): { success: boolean; error?: string; reward?: InboxReward; profile: PlayerProfile } {
  if (!profile) {
    return { success: false, error: "Perfil do aluno inválido.", profile };
  }

  const pId = profile.id.toLowerCase().trim();
  const pNick = (profile.nick || "").toLowerCase().trim();
  const pNickNorm = (profile.nickNormalized || "").toLowerCase().trim();
  const pPlayfabId = (profile.playfabId || "").toLowerCase().trim();

  const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);

  const alreadyClaimedLocal =
    (claims[pId] && claims[pId][messageId]) ||
    (pNick && claims[pNick] && claims[pNick][messageId]) ||
    (pNickNorm && claims[pNickNorm] && claims[pNickNorm][messageId]) ||
    (pPlayfabId && claims[pPlayfabId] && claims[pPlayfabId][messageId]);

  const alreadyClaimedProfile =
    Array.isArray(profile.claimedInboxRewardIds) && profile.claimedInboxRewardIds.includes(messageId);

  if (alreadyClaimedLocal || alreadyClaimedProfile) {
    return { success: false, error: "Esta recompensa já foi resgatada anteriormente.", profile };
  }

  const all = loadAllInboxMessages();
  const msg = all.find((m) => m.id === messageId);
  if (!msg || !msg.reward) {
    return { success: false, error: "Nenhuma recompensa encontrada nesta mensagem.", profile };
  }

  if (msg.recipientId !== "ALL" && msg.reward.claimed) {
    return { success: false, error: "Esta recompensa já foi resgatada anteriormente.", profile };
  }

  const reward = msg.reward;
  const nowIso = new Date().toISOString();

  // 1. Conceder Pontos se houver
  if (reward.type === "points" && reward.pointsAmount && reward.pointsAmount > 0) {
    awardCareerPoints(profile, reward.pointsAmount, `Recompensa Correio: ${msg.title}`);
  }

  // 2. Conceder Medalha se houver
  if (reward.type === "medal" && reward.medalId) {
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
          rarity: medalDef.rarity,
        };
        profile.unlockedMedals.push(newUnlocked);
      } else {
        existing.count = (existing.count ?? 1) + 1;
      }
    }
  }

  // 3. Atualizar profile.claimedInboxRewardIds permanente (trava cross-device)
  if (!Array.isArray(profile.claimedInboxRewardIds)) {
    profile.claimedInboxRewardIds = [];
  }
  if (!profile.claimedInboxRewardIds.includes(messageId)) {
    profile.claimedInboxRewardIds.push(messageId);
  }

  // 4. Salva registro de resgate individual em todas as chaves de identidade do aluno
  for (const k of [pId, pNick, pNickNorm, pPlayfabId]) {
    if (k) {
      if (!claims[k]) claims[k] = {};
      claims[k][messageId] = nowIso;
    }
  }
  saveStudentMap(STUDENT_CLAIMS_KEY, claims, (d) => (memoryStudentClaims = d));

  // Resgatar a recompensa garante que a mensagem também seja marcada como lida
  markInboxMessageAsRead(messageId, profile);
  broadcastInboxEvent({
    type: "rewards_claimed",
    messageId,
    studentId: profile.id,
    studentNick: profile.nick,
  });

  // Se a mensagem for direta (não ALL), atualiza o objeto global da mensagem
  if (msg.recipientId !== "ALL") {
    reward.claimed = true;
    reward.claimedAt = nowIso;
    saveAllInboxMessages(all);
  }

  return {
    success: true,
    reward: { ...reward, claimed: true, claimedAt: nowIso },
    profile,
  };
}

/**
 * Apaga a mensagem para o aluno.
 * REGRA RIGOROSA: Mensagens com recompensa NÃO podem ser apagadas antes do resgate!
 */
export function deleteInboxMessageForPlayer(
  messageId: string,
  player: PlayerProfile | { id: string }
): { success: boolean; error?: string } {
  const pId = player.id.toLowerCase().trim();
  const all = loadAllInboxMessages();
  const msg = all.find((m) => m.id === messageId);

  if (!msg) {
    return { success: true };
  }

  // Se a mensagem tiver recompensa, verificar se o aluno já resgatou
  if (msg.reward) {
    const claims = loadStudentMap(STUDENT_CLAIMS_KEY, memoryStudentClaims);
    const hasClaimed = Boolean(claims[pId]?.[messageId] || (msg.recipientId !== "ALL" && msg.reward.claimed));
    if (!hasClaimed) {
      return {
        success: false,
        error: "Você precisa resgatar sua recompensa antes de apagar esta mensagem!",
      };
    }
  }

  // Marca como deletada para este aluno
  const deletes = loadStudentMap(STUDENT_DELETES_KEY, memoryStudentDeletes);
  if (!deletes[pId]) deletes[pId] = {};
  deletes[pId][messageId] = true;
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
    if (m.reward && !m.reward.claimed) unclaimedRewardsCount++;
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
