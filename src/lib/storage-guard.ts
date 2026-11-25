// Utilitários seguros de localStorage (browser-safe)
// Evita perdas silenciosas por QuotaExceededError limpando caches descartáveis antes de desistir
// e fornece diagnóstico de uso de armazenamento para o monitor de saúde do Painel ADM.

export const DISPOSABLE_STORAGE_CACHE_KEYS: readonly string[] = [
  "desafios-remote-admin-config-v1",
  "desafios-presence-store-v1",
  "desafios-leaderboard-rank-history-v2",
  "desafios_score_history_ledger_v1",
  "desafios-x1-match-history-v1",
] as const;

export const ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // ~5 MB padrão dos navegadores

export interface SafeStorageWriteResult {
  ok: boolean;
  evictedKeys: string[];
  error?: string;
}

/**
 * Grava em `localStorage` com recuperação automática de `QuotaExceededError`:
 * se a cota estourar, remove caches descartáveis um a um (sem nunca tocar na chave alvo
 * nem em sessão/configuração principal) e tenta gravar novamente.
 */
export function safeLocalStorageSet(
  key: string,
  value: string,
  storage?: Pick<Storage, "setItem" | "removeItem" | "getItem">,
): SafeStorageWriteResult {
  const target =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) {
    return { ok: false, evictedKeys: [], error: "Storage indisponível." };
  }

  try {
    target.setItem(key, value);
    return { ok: true, evictedKeys: [] };
  } catch (firstErr) {
    const evictedKeys: string[] = [];
    for (const disposableKey of DISPOSABLE_STORAGE_CACHE_KEYS) {
      if (disposableKey === key) continue;
      try {
        if (target.getItem(disposableKey) !== null) {
          target.removeItem(disposableKey);
          evictedKeys.push(disposableKey);
        }
      } catch {
        /* ignore */
      }
      try {
        target.setItem(key, value);
        return { ok: true, evictedKeys };
      } catch {
        /* continua liberando espaço */
      }
    }
    return {
      ok: false,
      evictedKeys,
      error: firstErr instanceof Error ? firstErr.message : "QuotaExceededError",
    };
  }
}

export interface LocalStorageHealthReport {
  totalKeys: number;
  totalBytes: number;
  estimatedQuotaBytes: number;
  usagePercent: number;
  topKeys: Array<{ key: string; bytes: number }>;
  warningLevel: "ok" | "attention" | "critical";
}

export function measureLocalStorageUsage(
  storage?: Pick<Storage, "length" | "key" | "getItem">,
  topN = 6,
): LocalStorageHealthReport {
  const target =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) {
    return {
      totalKeys: 0,
      totalBytes: 0,
      estimatedQuotaBytes: ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES,
      usagePercent: 0,
      topKeys: [],
      warningLevel: "ok",
    };
  }

  const entries: Array<{ key: string; bytes: number }> = [];
  let totalBytes = 0;

  try {
    for (let i = 0; i < target.length; i++) {
      const k = target.key(i);
      if (!k) continue;
      const v = target.getItem(k) ?? "";
      // UTF-16 no localStorage ocupa ~2 bytes por caractere
      const bytes = (k.length + v.length) * 2;
      totalBytes += bytes;
      entries.push({ key: k, bytes });
    }
  } catch {
    /* ignore */
  }

  entries.sort((a, b) => b.bytes - a.bytes);
  const usagePercent = Math.min(
    100,
    Math.round((totalBytes / ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES) * 1000) / 10,
  );
  const warningLevel: LocalStorageHealthReport["warningLevel"] =
    usagePercent >= 80 ? "critical" : usagePercent >= 55 ? "attention" : "ok";

  return {
    totalKeys: entries.length,
    totalBytes,
    estimatedQuotaBytes: ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES,
    usagePercent,
    topKeys: entries.slice(0, Math.max(1, topN)),
    warningLevel,
  };
}
