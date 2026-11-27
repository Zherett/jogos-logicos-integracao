/**
 * rate-limit.ts
 *
 * Helpers compartilhados de backoff exponencial com jitter para requisições HTTP 429 (rate-limit),
 * compatíveis com mocks simples de testes que podem não implementar `Headers`.
 */

export const MAX_RATE_LIMIT_RETRIES = 2;
export const MAX_RATE_LIMIT_DELAY_MS = 3_000;

/**
 * Apenas endpoints de sincronização/leitura e SharedGroups fazem backoff automático em HTTP 429.
 * Endpoints de login/cadastro/mutação crítica interrompem imediatamente para feedback ao usuário.
 */
export const RATE_LIMIT_RETRYABLE_ENDPOINTS = new Set([
  "GetTime",
  "GetUserData",
  "GetTitleData",
  "GetSharedGroupData",
  "GetLeaderboard",
  "GetLeaderboardAroundPlayer",
  "UpdateSharedGroupData",
]);

export function shouldRetryEndpointOnRateLimit(endpoint: string): boolean {
  return RATE_LIMIT_RETRYABLE_ENDPOINTS.has(endpoint);
}

export function parseRetryAfterMs(retryAfterHeader: string | null | undefined): number | null {
  if (!retryAfterHeader || typeof retryAfterHeader !== "string") return null;
  const trimmed = retryAfterHeader.trim();
  if (!trimmed) return null;
  const numericSec = Number(trimmed);
  if (Number.isFinite(numericSec) && numericSec >= 0) {
    return Math.min(MAX_RATE_LIMIT_DELAY_MS, Math.round(numericSec * 1000));
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.min(MAX_RATE_LIMIT_DELAY_MS, Math.max(0, dateMs - Date.now()));
  }
  return null;
}

export function computeRateLimitBackoffMs(
  attempt: number,
  retryAfterHeader?: string | null,
  rng: () => number = Math.random,
): number {
  const headerDelay = parseRetryAfterMs(retryAfterHeader);
  if (headerDelay !== null && headerDelay > 0) {
    return headerDelay;
  }
  const base = 400 * Math.pow(2, Math.max(0, Math.floor(attempt)));
  const jitter = Math.floor(Math.max(0, Math.min(1, rng())) * 200);
  return Math.min(MAX_RATE_LIMIT_DELAY_MS, base + jitter);
}

export function getResponseHeaderSafe(
  res: { headers?: { get?: (name: string) => string | null } } | null | undefined,
  name: string,
): string | null {
  try {
    return res?.headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

export async function waitRateLimitDelay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
