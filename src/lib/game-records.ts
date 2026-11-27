import type { GameId } from "./game-storage.ts";
import { nickSlug, stageForPlayer, type AgeStageId } from "./player-profile.ts";
import { formatCoariDateBR, getOfficialNow } from "./official-time.ts";
import { safeLocalStorageSet } from "./storage-guard.ts";
import {
  acquireCanonicalConfigWriteTicket,
  getAdminPlayFabTicket,
  getPlayFabTitleId,
  getViewerPlayFabTicket,
  isBlockedRealPlayFabCallInTest,
  isPlayFabConfigured,
  loadRegistry,
  loadStoredSession,
  sanitizeGameBestScore,
} from "./playfab.ts";

export const GAME_RECORDS_STORAGE_KEY = "desafios-game-records-v1";
export const MAX_LEGIT_LOGIC_SCORE = 480;

export const MAX_ALLOWED_RECORD_SCORE_BY_GAME: Record<GameId, number> = {
  logica: 480,
  porcentagem: 600,
  completar: 600,
  rpg: 1000,
  formas: 1000,
  memoria: 1000,
  variaveis: 1000,
  cartesiano: 1000,
  minado: 1500,
  robogrid: 1500,
  spacequest: 2500,
};

export function isRecordScoreAllowed(gameId: GameId, score: number): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  const maxAllowed = MAX_ALLOWED_RECORD_SCORE_BY_GAME[gameId] ?? 2500;
  return score <= maxAllowed;
}

export function sanitizeRecordsStore(store: AllGameRecords): boolean {
  let changed = false;
  const reg = typeof window !== "undefined" ? loadRegistry() : {};
  const regAccounts = Object.values(reg);

  for (const key of Object.keys(store)) {
    const rec = store[key];
    if (!rec) continue;
    const gameId = rec.gameId ?? (key.split(":")[0] as GameId);
    if (!isRecordScoreAllowed(gameId, rec.score)) {
      delete store[key];
      changed = true;
      continue;
    }

    // Se o detentor existe no registro de alunos local/nuvem mas a pontuação real dele no jogo é menor que o recorde órfão, remove
    if (regAccounts.length > 0 && Array.isArray(rec.holders)) {
      const validHolders = rec.holders.filter((h) => {
        const matched =
          reg[h.playerId] ??
          regAccounts.find(
            (a) =>
              a?.profile &&
              (a.profile.id === h.playerId ||
                a.profile.playfabId === h.playerId ||
                a.profile.nick?.toLowerCase() === h.nick?.toLowerCase()),
          );
        if (!matched) return true;
        if (matched.profile?.deletedAt) return false;
        const rows = (matched.stats ?? []).filter((s) => s.game_id === gameId);
        const actualBest =
          rows.length > 0
            ? Math.max(...rows.map((r) => sanitizeGameBestScore(gameId, r.best_score)))
            : 0;
        return actualBest >= rec.score;
      });
      if (validHolders.length !== rec.holders.length) {
        changed = true;
        if (validHolders.length === 0) {
          delete store[key];
        } else {
          rec.holders = validHolders;
        }
      }
    }
  }
  return changed;
}

export interface RecordHolder {
  playerId: string;
  nick: string;
  fullName?: string;
  school?: string;
  achievedAt: number; // epoch ms
}

export interface StageGameRecord {
  gameId: GameId;
  stage: AgeStageId;
  score: number;
  holders: RecordHolder[]; // In chronological order of achievement (first to reach is index 0)
  updatedAt: number;
}

export type AllGameRecords = Record<string, StageGameRecord>;
// Key: `${gameId}:${stage}` (e.g. "logica:etapa_1", "rpg:etapa_2")

export function getRecordKey(gameId: GameId, stage: AgeStageId): string {
  return `${gameId}:${stage}`;
}

export function loadGameRecords(): AllGameRecords {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GAME_RECORDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AllGameRecords;
    if (sanitizeRecordsStore(parsed)) {
      safeLocalStorageSet(GAME_RECORDS_STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveGameRecords(records: AllGameRecords) {
  if (typeof window === "undefined") return;
  try {
    safeLocalStorageSet(GAME_RECORDS_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent("desafios:game-records-updated", { detail: records }));
  } catch {
    /* ignore storage quota errors */
  }
}

/**
 * Pure function: Evaluates and updates the stage record for a game.
 * - If score > current.score: brand new record, replaces holders.
 * - If score === current.score: ties record, appends holder preserving chronological order.
 * - If score < current.score: no change.
 */
export function evaluateStageGameRecordUpdate(
  currentRecord: StageGameRecord | null | undefined,
  candidate: {
    gameId: GameId;
    stage: AgeStageId;
    playerId: string;
    nick: string;
    fullName?: string;
    school?: string;
    score: number;
    achievedAt?: number;
  },
): {
  updatedRecord: StageGameRecord;
  isNewRecord: boolean;
  isTiedRecord: boolean;
} {
  const safeScore = Number.isFinite(candidate.score) ? Math.max(0, Math.floor(candidate.score)) : 0;
  const achievedAt = candidate.achievedAt ?? Date.now();
  const baseRecord: StageGameRecord = currentRecord ?? {
    gameId: candidate.gameId,
    stage: candidate.stage,
    score: 0,
    holders: [],
    updatedAt: achievedAt,
  };

  if (safeScore <= 0 || !isRecordScoreAllowed(candidate.gameId, safeScore)) {
    return { updatedRecord: baseRecord, isNewRecord: false, isTiedRecord: false };
  }

  const holderItem: RecordHolder = {
    playerId: candidate.playerId,
    nick: candidate.nick,
    fullName: candidate.fullName,
    school: candidate.school,
    achievedAt,
  };

  // Case 1: Surpassed existing record or first record
  if (safeScore > baseRecord.score) {
    return {
      updatedRecord: {
        gameId: candidate.gameId,
        stage: candidate.stage,
        score: safeScore,
        holders: [holderItem],
        updatedAt: achievedAt,
      },
      isNewRecord: true,
      isTiedRecord: false,
    };
  }

  // Case 2: Tied existing maximum record
  if (safeScore === baseRecord.score && baseRecord.score > 0) {
    const existingIndex = baseRecord.holders.findIndex(
      (h) => h.playerId === candidate.playerId || h.nick.toLowerCase() === candidate.nick.toLowerCase(),
    );

    let updatedHolders: RecordHolder[];
    let isTiedRecord = false;

    if (existingIndex >= 0) {
      // Player already holds this record; keep their original achievedAt
      updatedHolders = [...baseRecord.holders];
      updatedHolders[existingIndex] = {
        ...updatedHolders[existingIndex],
        nick: candidate.nick,
        fullName: candidate.fullName ?? updatedHolders[existingIndex].fullName,
        school: candidate.school ?? updatedHolders[existingIndex].school,
      };
    } else {
      // New distinct player tied the record! Append in chronological order
      updatedHolders = [...baseRecord.holders, holderItem].sort(
        (a, b) => a.achievedAt - b.achievedAt,
      );
      isTiedRecord = true;
    }

    return {
      updatedRecord: {
        ...baseRecord,
        holders: updatedHolders,
        updatedAt: achievedAt,
      },
      isNewRecord: false,
      isTiedRecord,
    };
  }

  // Case 3: Score is lower than current record
  return {
    updatedRecord: baseRecord,
    isNewRecord: false,
    isTiedRecord: false,
  };
}

/**
 * Records a game score for the given player and updates stage records accordingly.
 */
export function recordGameStageScore(candidate: {
  gameId: GameId;
  stage: AgeStageId;
  playerId: string;
  nick: string;
  fullName?: string;
  school?: string;
  score: number;
  achievedAt?: number;
}): { updatedRecord: StageGameRecord; isNewRecord: boolean; isTiedRecord: boolean } {
  const all = loadGameRecords();
  const key = getRecordKey(candidate.gameId, candidate.stage);
  const current = all[key];
  const res = evaluateStageGameRecordUpdate(current, candidate);

  if (res.isNewRecord || res.isTiedRecord) {
    all[key] = res.updatedRecord;
    saveGameRecords(all);
    void syncGameRecordsWithPlayFab(all);
  }

  return res;
}

/**
 * Retrieves the current record and holders for a game and stage.
 */
export function getGameStageRecord(
  gameId: GameId,
  stage: AgeStageId,
  records?: AllGameRecords,
): StageGameRecord | null {
  const store = records ?? seedRecordsFromRegistry();
  const key = getRecordKey(gameId, stage);
  const rec = store[key];
  if (!rec || rec.score <= 0 || !Array.isArray(rec.holders) || rec.holders.length === 0) {
    return null;
  }

  // Hide record holders who are currently in trash
  const reg = loadRegistry();
  const activeHolders = rec.holders.filter((h) => {
    const acc =
      reg[h.playerId] ||
      Object.values(reg).find(
        (a) =>
          a.profile.id === h.playerId ||
          a.profile.nick.toLowerCase() === h.nick.toLowerCase(),
      );
    return !acc?.profile?.deletedAt;
  });

  if (activeHolders.length === 0) {
    return null;
  }

  return { ...rec, holders: activeHolders };
}

/**
 * Removes a player from all records (called when moved to trash or permanently deleted).
 */
export function removePlayerFromGameRecords(
  playerId: string,
  playerNick?: string,
): AllGameRecords {
  const store = loadGameRecords();
  let changed = false;
  const normNick = playerNick?.trim().toLowerCase();

  for (const key of Object.keys(store)) {
    const rec = store[key];
    if (!rec || !Array.isArray(rec.holders)) continue;
    const initialLen = rec.holders.length;
    const filtered = rec.holders.filter(
      (h) =>
        h.playerId !== playerId &&
        (!normNick || h.nick.trim().toLowerCase() !== normNick),
    );
    if (filtered.length !== initialLen) {
      changed = true;
      if (filtered.length === 0) {
        delete store[key];
      } else {
        rec.holders = filtered;
      }
    }
  }

  if (changed) {
    saveGameRecords(store);
    const updated = seedRecordsFromRegistry();
    if (!isBlockedRealPlayFabCallInTest() && isPlayFabConfigured()) {
      void pushGameRecordsToPlayFab(updated);
    }
    return updated;
  }
  return store;
}

/**
 * Populates/seeds records from the local registered students roster.
 */
export function seedRecordsFromRegistry(): AllGameRecords {
  const store = loadGameRecords();
  const reg = loadRegistry();
  let changed = false;

  for (const acc of Object.values(reg)) {
    if (!acc.profile || !acc.stats || acc.profile.deletedAt) continue;
    const p = acc.profile;
    const stage = stageForPlayer(p.school, p.birthdate, getOfficialNow(), p.ageStage).id;

    for (const s of acc.stats) {
      if (!s.game_id || (s.best_score ?? 0) <= 0 || !isRecordScoreAllowed(s.game_id, s.best_score)) continue;
      const key = getRecordKey(s.game_id, stage);
      const cur = store[key];
      const res = evaluateStageGameRecordUpdate(cur, {
        gameId: s.game_id,
        stage,
        playerId: p.id,
        nick: p.nick,
        fullName: p.full_name,
        school: p.school,
        score: s.best_score,
        achievedAt: s.last_played_at ? new Date(s.last_played_at).getTime() : 1_700_000_000_000,
      });

      if (res.isNewRecord || res.isTiedRecord) {
        store[key] = res.updatedRecord;
        changed = true;
      }
    }
  }

  if (changed) {
    saveGameRecords(store);
  }
  return store;
}

let ensuredGameRecordsGroup = false;
let lastGameRecordsSyncAt = 0;
let inFlightGameRecordsSync: Promise<AllGameRecords> | null = null;
let syncedGameRecordsFromCloud = false;
const GAME_RECORDS_SYNC_TTL_MS = 60_000;

export function hasSyncedGameRecordsFromCloud(): boolean {
  return syncedGameRecordsFromCloud;
}

export function markGameRecordsSyncedFromCloud(val: boolean): void {
  syncedGameRecordsFromCloud = val;
}

async function pushGameRecordsToPlayFab(store: AllGameRecords): Promise<boolean> {
  if (isBlockedRealPlayFabCallInTest() || !isPlayFabConfigured()) return false;
  const titleId = getPlayFabTitleId();
  const writeTicket = await acquireCanonicalConfigWriteTicket();
  if (!titleId || !writeTicket) return false;
  try {
    const res = await fetch(`https://${titleId}.playfabapi.com/Client/UpdateSharedGroupData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": writeTicket,
      },
      body: JSON.stringify({
        TitleId: titleId,
        SharedGroupId: "SEMED_GAME_RECORDS_V2",
        Data: { Records: JSON.stringify(sanitizeGameRecordsForCloud(store)) },
        Permission: "Public",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function sanitizeGameRecordsForCloud(store: AllGameRecords): AllGameRecords {
  const sanitized: AllGameRecords = {};
  for (const [key, rec] of Object.entries(store)) {
    if (!rec) continue;
    sanitized[key] = {
      ...rec,
      holders: Array.isArray(rec.holders)
        ? rec.holders.map(({ fullName: _omitFullName, ...holder }) => ({ ...holder }))
        : [],
    };
  }
  return sanitized;
}

/**
 * Synchronizes stage game records with PlayFab SharedGroupData so all players share records in real-time.
 */
export async function syncGameRecordsWithPlayFab(
  localStore?: AllGameRecords,
  force = false,
): Promise<AllGameRecords> {
  const store = localStore ?? loadGameRecords();
  if (!force && !localStore && inFlightGameRecordsSync) {
    return inFlightGameRecordsSync;
  }
  if (!force && !localStore && Date.now() - lastGameRecordsSyncAt < GAME_RECORDS_SYNC_TTL_MS) {
    return store;
  }

  const run = async (): Promise<AllGameRecords> => {
  if (isBlockedRealPlayFabCallInTest()) return store;
  const session = loadStoredSession();
  const titleId = getPlayFabTitleId();
  const ticket = (await getViewerPlayFabTicket()) ?? (await getAdminPlayFabTicket()) ?? session?.sessionTicket;
  if (!ticket || !titleId) return store;

  const groupId = "SEMED_GAME_RECORDS_V2";

  try {
    // 1. Ensure SharedGroup exists (only once per session)
    if (!ensuredGameRecordsGroup) {
      await fetch(`https://${titleId}.playfabapi.com/Client/CreateSharedGroup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Authorization": ticket,
        },
        body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
      });
      ensuredGameRecordsGroup = true;
    }

    // 2. Fetch remote records
    const getRes = await fetch(`https://${titleId}.playfabapi.com/Client/GetSharedGroupData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": ticket,
      },
      body: JSON.stringify({ TitleId: titleId, SharedGroupId: groupId }),
    });

    if (!getRes.ok) {
      // Nunca sobrescreve a nuvem se a leitura falhou (ex.: 429 / 500)
      return store;
    }

    const json = (await getRes.json()) as {
      code?: number;
      error?: string;
      data?: { Data?: Record<string, { Value: string }> };
    };

    if (json.error || (typeof json.code === "number" && json.code !== 200)) {
      return store;
    }

    let hasLocalChanges = sanitizeRecordsStore(store);
    let hasRemoteChanges = false;
    const remoteRaw = json.data?.Data?.Records?.Value;

    if (remoteRaw) {
      const remote = JSON.parse(remoteRaw) as AllGameRecords;
      if (sanitizeRecordsStore(remote)) {
        hasRemoteChanges = true;
      }
      for (const [key, remRec] of Object.entries(remote)) {
        const locRec = store[key];
        if (!locRec || remRec.score > locRec.score) {
          store[key] = remRec;
          hasLocalChanges = true;
        } else if (locRec && locRec.score > remRec.score) {
          hasRemoteChanges = true;
        } else if (remRec.score === locRec.score) {
          // Merge holders por nickSlug para evitar duplicidade após migração pf_local_* -> playfabId
          const mergedMap = new Map<string, RecordHolder>();
          const insertHolder = (h: RecordHolder) => {
            if (!h) return;
            const hKey = nickSlug(h.nick || h.playerId) || h.playerId.toLowerCase();
            const cur = mergedMap.get(hKey);
            if (!cur || h.achievedAt < cur.achievedAt) {
              mergedMap.set(hKey, h);
            }
          };
          for (const h of locRec.holders) insertHolder(h);
          for (const h of remRec.holders) insertHolder(h);

          const sortedHolders = Array.from(mergedMap.values()).sort(
            (a, b) => a.achievedAt - b.achievedAt,
          );
          const holdersSig = (list: RecordHolder[]) =>
            list
              .map(
                (h) =>
                  `${nickSlug(h.nick || h.playerId) || h.playerId.toLowerCase()}:${h.achievedAt}`,
              )
              .sort()
              .join("|");
          const mergedSig = holdersSig(sortedHolders);
          const locSig = holdersSig(locRec.holders);
          const remSig = holdersSig(remRec.holders);
          if (mergedSig !== locSig) {
            locRec.holders = sortedHolders;
            hasLocalChanges = true;
          }
          if (mergedSig !== remSig) {
            locRec.holders = sortedHolders;
            hasRemoteChanges = true;
          }
        }
      }
      for (const key of Object.keys(store)) {
        if (!remote[key] && store[key].score > 0) {
          hasRemoteChanges = true;
        }
      }
    } else if (Object.keys(store).length > 0) {
      hasRemoteChanges = true;
    }

    if (hasLocalChanges) {
      saveGameRecords(store);
    }

    // 3. Push merged records back to SharedGroupData ONLY if local had newer/higher/empate records
    if (hasRemoteChanges) {
      await pushGameRecordsToPlayFab(store);
    }
    syncedGameRecordsFromCloud = true;
    lastGameRecordsSyncAt = Date.now();
  } catch {
    /* ignore offline/network errors */
  }

  return store;
  };

  if (!localStore) {
    inFlightGameRecordsSync = run().finally(() => {
      inFlightGameRecordsSync = null;
    });
    return inFlightGameRecordsSync;
  }
  return run();
}

/** Formats date in Brazilian format DD/MM/AAAA (fuso oficial Coari UTC-4) */
export function formatRecordDateBR(epochMs: number): string {
  if (!epochMs || Number.isNaN(epochMs)) return "";
  return formatCoariDateBR(epochMs);
}
