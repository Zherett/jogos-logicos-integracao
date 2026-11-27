// Blindagem de persistência de PlatformAdminConfig (browser-safe)
// Garante isolamento por domínio, proteção anti-wipe para TODAS as coleções críticas,
// controle otimista por configRevision e Backup/Restauração completa da plataforma.

import type { PlatformAdminConfig } from "./game-codes.ts";

export type AdminConfigWriteDomain =
  | "all"
  | "core"
  | "x1"
  | "cards"
  | "packs"
  | "chests"
  | "cosmetics"
  | "inbox"
  | "events"
  | "notices"
  | "medals"
  | "routine"
  | "season";

export type AdminConfigProtectedCollectionKey =
  | "cardsCatalog"
  | "cardPacks"
  | "chestsCatalog"
  | "aurasCatalog"
  | "avatarsCatalog"
  | "customMedals"
  | "specialEvents"
  | "recurringEvents"
  | "noticeSlides"
  | "inboxMessages"
  | "canceledInboxMessageIds"
  | "adminMedalNotifications";

export const PROTECTED_ADMIN_COLLECTIONS: readonly AdminConfigProtectedCollectionKey[] = [
  "cardsCatalog",
  "cardPacks",
  "chestsCatalog",
  "aurasCatalog",
  "avatarsCatalog",
  "customMedals",
  "specialEvents",
  "recurringEvents",
  "noticeSlides",
  "inboxMessages",
  "canceledInboxMessageIds",
  "adminMedalNotifications",
] as const;

export interface MergeAdminConfigWriteOptions {
  /** Domínio funcional que originou o salvamento. Quando especificado, somente os campos desse domínio são sobrescritos sobre o estado remoto. */
  domain?: AdminConfigWriteDomain;
  /** Autoriza explicitamente gravar alterações no catálogo de cartas. */
  allowCardsCatalogWrite?: boolean;
  /** Confirmação explícita para esvaziar o catálogo de cartas na nuvem (0 cartas). */
  allowEmptyCardsCatalog?: boolean;
  /** Lista explícita de coleções autorizadas a serem esvaziadas (ex.: exclusão em massa confirmada). */
  allowEmptyCollections?: readonly AdminConfigProtectedCollectionKey[];
  /** Campos opcionais do domínio explicitamente limpos (ex.: ao cancelar agendamentos). */
  clearFields?: readonly (keyof PlatformAdminConfig)[];
  /** Autoriza alteração de temporada (seasonId / activitySeasonId / rankedSeasonId). */
  allowSeasonChange?: boolean;
}

export interface MergeAdminConfigWriteResult {
  merged: PlatformAdminConfig;
  blockedError?: string;
  preservedCollections: AdminConfigProtectedCollectionKey[];
  nextRevision: number;
}

const DOMAIN_FIELDS: Record<Exclude<AdminConfigWriteDomain, "all">, readonly (keyof PlatformAdminConfig)[]> = {
  core: [
    "enabledGames",
    "gameCodes",
    "masterCode",
    "requireCodeGate",
    "showCodeGateCardOnHome",
    "x1Enabled",
    "x1ArenaClosed",
    "x1OpenHour",
    "x1CloseHour",
    "x1ForceOpen",
    "x1AvailableGames",
    "x1RotationMinutes",
    "x1MinadoGridSize",
    "tournamentEnabled",
    "tournamentGameOverride",
    "rankedMilestoneRewards",
    "tournamentPodiumRewards",
    "rankedOpenHour",
    "rankedCloseHour",
    "rankedForceOpen",
    "dailyXpCap",
    "gameLevelRequirements",
    "adminOnlyGames",
    "pointsToCoinsRate",
    "coinsConversionEnabled",
    "playfabTitleId",
    "autoRenewSeason",
    "scheduledResetAt",
    "scheduledResetClearXp",
    "seasonStartAt",
    "seasonEndAt",
    "seasonDurationDays",
    "activitySeasonStartAt",
    "activitySeasonEndAt",
    "activitySeasonDurationDays",
    "activitySeasonName",
    "rankedSeasonStartAt",
    "rankedSeasonEndAt",
    "rankedSeasonDurationDays",
    "rankedSeasonCycleMode",
    "rankedSeasonName",
  ],
  x1: [
    "x1Enabled",
    "x1ArenaClosed",
    "x1OpenHour",
    "x1CloseHour",
    "x1ForceOpen",
    "x1AvailableGames",
    "x1RotationMinutes",
    "x1MinadoGridSize",
  ],
  cards: [
    "cardsCatalog",
    "foilDuplicatesSeededV2",
    "cardFoilChancePercent",
    "cardPacks",
  ],
  packs: ["cardPacks"],
  chests: ["chestsCatalog"],
  cosmetics: [
    "avatarsCatalog",
    "aurasCatalog",
    "cardPacks",
    "coinRewardsConfig",
    "rolloutFlags",
  ],
  inbox: [
    "inboxMessages",
    "canceledInboxMessageIds",
    "scheduledInboxRules",
  ],
  events: [
    "specialEvents",
    "recurringEvents",
    "customMedals",
  ],
  notices: [
    "noticeSlides",
    "enabledDefaultNotices",
    "hideAllDefaultNotices",
    "pauseNoticeBoard",
  ],
  medals: [
    "customMedals",
    "adminMedalNotifications",
  ],
  routine: [
    "weeklyRoutineConfig",
    "rolloutFlags",
    "coinRewardsConfig",
  ],
  season: [
    "seasonId",
    "seasonName",
    "seasonStartAt",
    "seasonEndAt",
    "seasonDurationDays",
    "autoRenewSeason",
    "lastResetAt",
    "scheduledResetAt",
    "scheduledResetClearXp",
    "resetHistory",
    "activitySeasonId",
    "activitySeasonName",
    "activitySeasonStartAt",
    "activitySeasonEndAt",
    "activitySeasonDurationDays",
    "isBetaActive",
    "rankedSeasonId",
    "rankedSeasonName",
    "rankedSeasonStartAt",
    "rankedSeasonEndAt",
    "rankedSeasonDurationDays",
    "rankedSeasonCycleMode",
    "inboxMessages",
  ],
};

function getArrayLen(obj: Partial<PlatformAdminConfig> | null | undefined, key: AdminConfigProtectedCollectionKey): number {
  const val = obj?.[key];
  return Array.isArray(val) ? val.length : 0;
}

/**
 * Mescla o rascunho local do ADM com a versão autoritativa lida da nuvem imediatamente antes de gravar:
 * - Isola escritas por `domain` para impedir Lost Update entre dois ADMs ou abas diferentes.
 * - Impede que qualquer coleção crítica seja zerada acidentalmente (`N -> 0`) sem permissão explícita.
 * - Impede salto/regressão acidental de temporada fora de `domain: "season"`.
 * - Incrementa `configRevision` monotonicamente.
 */
export function mergeAdminConfigForCloudWrite(
  remote: Partial<PlatformAdminConfig> | null | undefined,
  incoming: PlatformAdminConfig,
  options: MergeAdminConfigWriteOptions = {},
): MergeAdminConfigWriteResult {
  const domain: AdminConfigWriteDomain =
    options.domain ?? (options.allowCardsCatalogWrite ? "cards" : "all");
  const allowEmptySet = new Set<AdminConfigProtectedCollectionKey>(
    options.allowEmptyCollections ?? [],
  );
  if (options.allowEmptyCardsCatalog) {
    allowEmptySet.add("cardsCatalog");
  }

  const remoteRev = Math.max(0, Math.floor(Number(remote?.configRevision) || 0));
  const localRev = Math.max(0, Math.floor(Number(incoming.configRevision) || 0));
  const nextRevision = Math.max(remoteRev, localRev) + 1;
  const preservedCollections: AdminConfigProtectedCollectionKey[] = [];

  if (!remote || typeof remote !== "object" || Object.keys(remote).length === 0) {
    return {
      merged: {
        ...incoming,
        configRevision: nextRevision,
      },
      preservedCollections,
      nextRevision,
    };
  }

  const remoteCardsLen = getArrayLen(remote, "cardsCatalog");
  const incomingCardsLen = getArrayLen(incoming, "cardsCatalog");
  const cardsWriteExplicit = Boolean(options.allowCardsCatalogWrite) || domain === "cards";

  // Trava anti-wipe estrita para cardsCatalog quando escrita explícita tenta zerar catálogo remoto populado
  if (
    cardsWriteExplicit &&
    remoteCardsLen > 0 &&
    incomingCardsLen === 0 &&
    !allowEmptySet.has("cardsCatalog")
  ) {
    return {
      merged: incoming,
      blockedError: `Proteção anti-perda ativada: o servidor possui ${remoteCardsLen} carta(s) e o envio com catálogo vazio foi bloqueado.`,
      preservedCollections,
      nextRevision,
    };
  }

  let merged: PlatformAdminConfig;

  if (domain !== "all") {
    // Escrita isolada por domínio: começa no estado remoto vivo e aplica SOMENTE os campos do domínio
    merged = {
      ...incoming,
      ...remote,
    } as PlatformAdminConfig;

    const allowedFields = DOMAIN_FIELDS[domain];
    for (const field of allowedFields) {
      if (incoming[field] !== undefined) {
        (merged as unknown as Record<string, unknown>)[field] = incoming[field];
      }
    }
    if (options.clearFields && options.clearFields.length > 0) {
      for (const field of options.clearFields) {
        if (allowedFields.includes(field) && incoming[field] === undefined) {
          delete (merged as unknown as Record<string, unknown>)[field];
        }
      }
    }
  } else {
    merged = {
      ...remote,
      ...incoming,
    } as PlatformAdminConfig;
  }

  // Garante isolamento de cardsCatalog quando a escrita não veio da aba Cartas
  if (!cardsWriteExplicit && remoteCardsLen > 0) {
    merged.cardsCatalog = remote.cardsCatalog;
    if (incomingCardsLen === 0) {
      preservedCollections.push("cardsCatalog");
    }
  }

  // Proteção anti-wipe para TODAS as coleções críticas
  for (const key of PROTECTED_ADMIN_COLLECTIONS) {
    if (key === "cardsCatalog") continue; // já tratado acima com regra estrita
    const remLen = getArrayLen(remote, key);
    const nextLen = getArrayLen(merged, key);
    if (remLen === 0 || nextLen > 0 || allowEmptySet.has(key)) continue;

    // Em escrita genérica ("all") ou quando há >= 2 itens no servidor e cai abruptamente para 0,
    // preserva o estado remoto automaticamente contra wipes por draft desatualizado.
    const isSuspiciousBulkWipe = domain === "all" || remLen >= 2;
    if (isSuspiciousBulkWipe) {
      (merged as unknown as Record<string, unknown>)[key] = remote[key];
      preservedCollections.push(key);
    }
  }

  // Proteção de temporadas: fora de `domain === "season"` e sem `allowSeasonChange`, preserva IDs de temporada remotos
  if (domain !== "season" && !options.allowSeasonChange) {
    if (typeof remote.rankedSeasonId === "number" && remote.rankedSeasonId > 0) {
      merged.rankedSeasonId = remote.rankedSeasonId;
      if (remote.rankedSeasonName) merged.rankedSeasonName = remote.rankedSeasonName;
    }
    if (typeof remote.activitySeasonId === "number" && remote.activitySeasonId > 0) {
      merged.activitySeasonId = remote.activitySeasonId;
    }
    if (typeof remote.seasonId === "number" && remote.seasonId > 0) {
      merged.seasonId = remote.seasonId;
    }
    if (Array.isArray(remote.resetHistory) && remote.resetHistory.length > (merged.resetHistory?.length ?? 0)) {
      merged.resetHistory = remote.resetHistory;
    }
  }

  // Nunca deixa playfabTitleId vazio se o remoto tinha um TitleId válido
  if (!merged.playfabTitleId?.trim() && remote.playfabTitleId?.trim()) {
    merged.playfabTitleId = remote.playfabTitleId.trim();
  }

  merged.configRevision = nextRevision;
  return {
    merged,
    preservedCollections,
    nextRevision,
  };
}

/* --------------------- Backup Completo Unificado da Plataforma --------------------- */

export const FULL_ADMIN_BACKUP_SCHEMA = "desafios-full-admin-backup-v1";

export interface FullAdminBackupPayload {
  schema: typeof FULL_ADMIN_BACKUP_SCHEMA;
  exportedAt: string;
  summary: {
    cardsCount: number;
    packsCount: number;
    chestsCount: number;
    avatarsCount: number;
    aurasCount: number;
    customMedalsCount: number;
    specialEventsCount: number;
    recurringEventsCount: number;
    noticeSlidesCount: number;
    inboxMessagesCount: number;
    promoCodesCount: number;
  };
  config: PlatformAdminConfig;
  promoCodes?: unknown[];
}

export function exportFullAdminBackup(
  config: PlatformAdminConfig,
  promoCodes: unknown[] = [],
): string {
  const payload: FullAdminBackupPayload = {
    schema: FULL_ADMIN_BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    summary: {
      cardsCount: Array.isArray(config.cardsCatalog) ? config.cardsCatalog.length : 0,
      packsCount: Array.isArray(config.cardPacks) ? config.cardPacks.length : 0,
      chestsCount: Array.isArray(config.chestsCatalog) ? config.chestsCatalog.length : 0,
      avatarsCount: Array.isArray(config.avatarsCatalog) ? config.avatarsCatalog.length : 0,
      aurasCount: Array.isArray(config.aurasCatalog) ? config.aurasCatalog.length : 0,
      customMedalsCount: Array.isArray(config.customMedals) ? config.customMedals.length : 0,
      specialEventsCount: Array.isArray(config.specialEvents) ? config.specialEvents.length : 0,
      recurringEventsCount: Array.isArray(config.recurringEvents) ? config.recurringEvents.length : 0,
      noticeSlidesCount: Array.isArray(config.noticeSlides) ? config.noticeSlides.length : 0,
      inboxMessagesCount: Array.isArray(config.inboxMessages) ? config.inboxMessages.length : 0,
      promoCodesCount: Array.isArray(promoCodes) ? promoCodes.length : 0,
    },
    config,
    ...(Array.isArray(promoCodes) && promoCodes.length > 0 ? { promoCodes } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseFullAdminBackup(rawJson: string): {
  config: Partial<PlatformAdminConfig> | null;
  promoCodes: unknown[] | null;
  summary: FullAdminBackupPayload["summary"] | null;
  error?: string;
} {
  if (!rawJson || typeof rawJson !== "string" || !rawJson.trim()) {
    return { config: null, promoCodes: null, summary: null, error: "Arquivo de backup vazio." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
  } catch {
    return { config: null, promoCodes: null, summary: null, error: "JSON inválido." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { config: null, promoCodes: null, summary: null, error: "Formato de backup não reconhecido." };
  }

  const obj = parsed as Record<string, unknown>;
  let configCandidate: Partial<PlatformAdminConfig> | null = null;
  let promoCodes: unknown[] | null = null;

  if (obj.schema === FULL_ADMIN_BACKUP_SCHEMA && obj.config && typeof obj.config === "object") {
    configCandidate = obj.config as Partial<PlatformAdminConfig>;
    if (Array.isArray(obj.promoCodes)) {
      promoCodes = obj.promoCodes;
    }
  } else if ("enabledGames" in obj || "cardsCatalog" in obj || "weeklyRoutineConfig" in obj) {
    // Suporta também dump direto de PlatformAdminConfig (localStorage)
    configCandidate = obj as Partial<PlatformAdminConfig>;
  }

  if (!configCandidate) {
    return {
      config: null,
      promoCodes: null,
      summary: null,
      error: "O arquivo não contém uma configuração administrativa válida.",
    };
  }

  const summary: FullAdminBackupPayload["summary"] = {
    cardsCount: Array.isArray(configCandidate.cardsCatalog) ? configCandidate.cardsCatalog.length : 0,
    packsCount: Array.isArray(configCandidate.cardPacks) ? configCandidate.cardPacks.length : 0,
    chestsCount: Array.isArray(configCandidate.chestsCatalog) ? configCandidate.chestsCatalog.length : 0,
    avatarsCount: Array.isArray(configCandidate.avatarsCatalog) ? configCandidate.avatarsCatalog.length : 0,
    aurasCount: Array.isArray(configCandidate.aurasCatalog) ? configCandidate.aurasCatalog.length : 0,
    customMedalsCount: Array.isArray(configCandidate.customMedals) ? configCandidate.customMedals.length : 0,
    specialEventsCount: Array.isArray(configCandidate.specialEvents) ? configCandidate.specialEvents.length : 0,
    recurringEventsCount: Array.isArray(configCandidate.recurringEvents) ? configCandidate.recurringEvents.length : 0,
    noticeSlidesCount: Array.isArray(configCandidate.noticeSlides) ? configCandidate.noticeSlides.length : 0,
    inboxMessagesCount: Array.isArray(configCandidate.inboxMessages) ? configCandidate.inboxMessages.length : 0,
    promoCodesCount: Array.isArray(promoCodes) ? promoCodes.length : 0,
  };

  return { config: configCandidate, promoCodes, summary };
}
