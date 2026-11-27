/**
 * official-time.ts
 *
 * Serviço único e browser-safe de relógio oficial do servidor PlayFab (`Client/GetTime`)
 * ancorado em tempo monotônico (`performance.now()`) e fuso oficial de Coari/AM (UTC-4).
 * Elimina calibrações redundantes de GetTime e divergências entre fuso local/UTC/Coari.
 */

/** Offset oficial de Coari/AM (America/Manaus): UTC-4 em milissegundos. */
export const COARI_OFFSET_MS = -4 * 60 * 60 * 1000;

/** Intervalo padrão de reutilização da calibração de relógio do servidor (3 minutos). */
export const DEFAULT_CLOCK_SYNC_TTL_MS = 3 * 60_000;

export interface CoariTimeParts {
  year: number;
  /** Mês calendário (1..12) */
  month: number;
  /** Mês base zero (0..11) */
  month0: number;
  day: number;
  /** Dia da semana (0 = Domingo .. 6 = Sábado) */
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
}

let officialClockOffsetMs: number | null = null;
let officialClockBaseUtcMs: number | null = null;
let officialClockBasePerfMs: number | null = null;
let lastOfficialClockSyncPerfMs = 0;
let inFlightOfficialClockSync: Promise<number | null> | null = null;

function getMonotonicMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Retorna o timestamp UTC calibrado pelo servidor, ou `null` se ainda não sincronizado. */
export function getCalibratedServerUtcMs(): number | null {
  if (officialClockBaseUtcMs !== null && officialClockBasePerfMs !== null) {
    const elapsed = Math.max(0, getMonotonicMs() - officialClockBasePerfMs);
    return Math.round(officialClockBaseUtcMs + elapsed);
  }
  if (officialClockOffsetMs !== null) {
    return Date.now() + officialClockOffsetMs;
  }
  return null;
}

export function hasOfficialClockSync(): boolean {
  return officialClockBaseUtcMs !== null || officialClockOffsetMs !== null;
}

export function getOfficialClockOffsetMs(): number {
  return officialClockOffsetMs ?? 0;
}

/** Timestamp UTC atual (em ms): usa o relógio calibrado do servidor quando disponível. */
export function getOfficialNowMs(): number {
  return getCalibratedServerUtcMs() ?? Date.now();
}

/** Instante `Date` atual no relógio oficial calibrado (UTC real). */
export function getOfficialNow(): Date {
  return new Date(getOfficialNowMs());
}

/** Registra uma amostra direta de horário UTC vinda do servidor, compensando metade do RTT. */
export function setOfficialClockSample(serverUtcMs: number, rttMs = 0): number {
  const safeRtt = Number.isFinite(rttMs) && rttMs > 0 ? rttMs : 0;
  const halfRtt = Math.round(safeRtt / 2);
  const perfNow = getMonotonicMs();
  const estimatedUtcMs = Math.round(serverUtcMs + halfRtt);
  officialClockBaseUtcMs = estimatedUtcMs;
  officialClockBasePerfMs = perfNow;
  officialClockOffsetMs = estimatedUtcMs - Date.now();
  lastOfficialClockSyncPerfMs = perfNow;
  return estimatedUtcMs;
}

/** Utilitário exclusivo para testes simulando dessincronização/tampering de relógio. */
export function __setOfficialClockOffsetForTests(offsetMs: number | null): void {
  officialClockOffsetMs = offsetMs;
  if (offsetMs === null) {
    officialClockBaseUtcMs = null;
    officialClockBasePerfMs = null;
    lastOfficialClockSyncPerfMs = 0;
  } else {
    const perfNow = getMonotonicMs();
    officialClockBaseUtcMs = Date.now() + offsetMs;
    officialClockBasePerfMs = perfNow;
    lastOfficialClockSyncPerfMs = perfNow;
  }
}

export function resetOfficialClockForTests(): void {
  __setOfficialClockOffsetForTests(null);
  inFlightOfficialClockSync = null;
}

export type OfficialTimeSampleInput =
  | string
  | number
  | { time?: string | number | null; rttMs?: number }
  | null
  | undefined;

/**
 * Sincroniza o relógio oficial compartilhado por meio de um callback `fetcher`,
 * com deduplicação de requisições concorrentes (`in-flight`) e cache por TTL.
 */
export async function syncOfficialClock(
  fetcher: () => Promise<OfficialTimeSampleInput>,
  options?: { force?: boolean; ttlMs?: number },
): Promise<number | null> {
  const force = Boolean(options?.force);
  const ttlMs = Math.max(0, options?.ttlMs ?? DEFAULT_CLOCK_SYNC_TTL_MS);
  const perfNow = getMonotonicMs();
  const cachedUtc = getCalibratedServerUtcMs();

  if (!force && cachedUtc !== null && lastOfficialClockSyncPerfMs > 0 && perfNow - lastOfficialClockSyncPerfMs < ttlMs) {
    return cachedUtc;
  }

  if (!force && inFlightOfficialClockSync) {
    return inFlightOfficialClockSync;
  }

  const runPromise: Promise<number | null> = (async () => {
    try {
      const p0 = getMonotonicMs();
      const raw = await fetcher();
      const p1 = getMonotonicMs();

      if (raw === null || raw === undefined) return null;

      let timeVal: string | number | null | undefined;
      let explicitRtt: number | undefined;

      if (typeof raw === "object") {
        timeVal = raw.time;
        explicitRtt = raw.rttMs;
      } else {
        timeVal = raw;
      }

      if (timeVal === null || timeVal === undefined || timeVal === "") return null;

      const serverMs = typeof timeVal === "number" ? timeVal : Date.parse(timeVal);
      if (!Number.isFinite(serverMs)) return null;

      return setOfficialClockSample(serverMs, explicitRtt ?? Math.max(0, p1 - p0));
    } catch {
      return null;
    }
  })().finally(() => {
    if (inFlightOfficialClockSync === runPromise) {
      inFlightOfficialClockSync = null;
    }
  });

  if (!force) {
    inFlightOfficialClockSync = runPromise;
  }
  return runPromise;
}

/** Converte `Date | number | string` para epoch UTC (ms) ou `null` quando inválido. */
export function parseUtcMs(dateOrMs: Date | number | string | null | undefined): number | null {
  if (dateOrMs === null || dateOrMs === undefined || dateOrMs === "") return null;
  if (typeof dateOrMs === "number") {
    return Number.isFinite(dateOrMs) ? dateOrMs : null;
  }
  if (dateOrMs instanceof Date) {
    const ms = dateOrMs.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(dateOrMs);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Decompõe qualquer instante no calendário e horário oficial de Coari/AM (UTC-4). */
export function getCoariTimeParts(dateOrMs?: Date | number | string | null): CoariTimeParts {
  const utcMs = parseUtcMs(dateOrMs) ?? getOfficialNowMs();
  const shifted = new Date(utcMs + COARI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** Constrói um `Date` UTC real representando o horário informado em Coari/AM (UTC-4). */
export function makeCoariDate(
  year: number,
  month0Based: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month0Based, day, hours, minutes, seconds, ms) - COARI_OFFSET_MS);
}

/** Retorna chave calendária `YYYY-MM-DD` no fuso oficial de Coari/AM (UTC-4). */
export function getCoariDateKey(dateOrMs?: Date | number | string | null): string {
  const { year, month, day } = getCoariTimeParts(dateOrMs);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Formata data brasileira (`DD/MM/AAAA` ou `DD/MM`) de forma determinística no fuso de Coari (UTC-4). */
export function formatCoariDateBR(
  dateOrMs?: Date | number | string | null,
  options?: { includeYear?: boolean; includeTime?: boolean },
): string {
  const { year, month, day, hour, minute } = getCoariTimeParts(dateOrMs);
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const datePart = options?.includeYear === false ? `${dd}/${mm}` : `${dd}/${mm}/${year}`;
  if (options?.includeTime) {
    return `${datePart} às ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return datePart;
}

/** Formata horário `HH:MM` no fuso oficial de Coari/AM (UTC-4). */
export function formatCoariTimeBR(dateOrMs?: Date | number | string | null): string {
  const { hour, minute } = getCoariTimeParts(dateOrMs);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Verifica se dois instantes pertencem ao mesmo dia calendário em Coari/AM (UTC-4). */
export function isSameCoariDay(
  a: Date | number | string,
  b: Date | number | string,
): boolean {
  return getCoariDateKey(a) === getCoariDateKey(b);
}

/** Soma/subtrai dias em uma chave `YYYY-MM-DD` sem depender do fuso ou horário de verão do sistema. */
export function shiftDateKeyUTC(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateKey || "").trim());
  if (!match) return getCoariDateKey();
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.trunc(deltaDays)));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
