import type { GameId } from "../game-storage.ts";

export function splitIntoPlayFabKeyBatches<T>(items: T[], batchSize = 10): T[][] {
  const safeSize = Math.max(1, Math.min(10, Math.floor(batchSize)));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

export function splitRecordIntoPlayFabBatches(
  record: Record<string, string>,
  batchSize = 10,
): Array<Record<string, string>> {
  const safeSize = Math.max(1, Math.min(10, Math.floor(batchSize)));
  const entries = Object.entries(record);
  const batches: Array<Record<string, string>> = [];
  for (let i = 0; i < entries.length; i += safeSize) {
    batches.push(Object.fromEntries(entries.slice(i, i + safeSize)));
  }
  return batches;
}

export function getSeasonXpStatName(
  cfg: { seasonId?: number; useVersionedSeasonStats?: boolean },
  stageId?: string | null,
): string {
  if (cfg.useVersionedSeasonStats) {
    return stageId ? `XP_Season_${stageId}` : "XP_Season_Current";
  }
  const sId = cfg.seasonId ?? 1;
  return stageId ? `XP_Season_S${sId}_${stageId}` : `XP_Season_S${sId}`;
}

export function getGameBestStatName(
  gameId: GameId,
  cfg: { seasonId?: number; useVersionedSeasonStats?: boolean },
  stageId?: string | null,
): string {
  if (cfg.useVersionedSeasonStats) {
    return stageId ? `Best_${gameId}_${stageId}` : `Best_${gameId}_Current`;
  }
  const sId = cfg.seasonId ?? 1;
  return stageId ? `Best_${gameId}_S${sId}_${stageId}` : `Best_${gameId}_S${sId}`;
}

export function pruneExpiredInboxReceiptsFromData(
  data: Record<string, { Value?: string; LastUpdated?: string }> | null | undefined,
  activeMessageIds: Set<string>,
  nowMs = Date.now(),
  maxAgeDays = 90,
): string[] {
  if (!data) return [];
  const cutoffMs = nowMs - Math.max(7, maxAgeDays) * 86_400_000;
  const expiredKeys: string[] = [];
  for (const [key, item] of Object.entries(data)) {
    if (!key.startsWith("inbox_read_") && !key.startsWith("inbox_claim_")) continue;
    let msgId = "";
    let tsMs = item?.LastUpdated ? Date.parse(item.LastUpdated) : Number.NaN;
    if (item?.Value) {
      try {
        const parsed = JSON.parse(item.Value) as {
          messageId?: string;
          readAt?: string;
          claimedAt?: string;
        };
        msgId = typeof parsed.messageId === "string" ? parsed.messageId : "";
        const parsedTs = Date.parse(parsed.claimedAt || parsed.readAt || "");
        if (Number.isFinite(parsedTs)) tsMs = parsedTs;
      } catch {
        /* ignore */
      }
    }
    if (msgId && activeMessageIds.has(msgId)) continue;
    if (Number.isFinite(tsMs) && tsMs < cutoffMs) {
      expiredKeys.push(key);
    }
  }
  return expiredKeys;
}
