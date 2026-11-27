/**
 * season-cycle.ts
 *
 * Módulo de Lógica de Ciclos de Temporada (Duração em Dias, Presets de 7/14/30 dias,
 * Extensão de Prazos, Renovação Automática em Cadeia e Indicadores de Progresso).
 */

import {
  COARI_OFFSET_MS,
  formatCoariDateBR,
  formatCoariTimeBR,
  getOfficialNow,
  getOfficialNowMs,
  parseUtcMs,
} from "./official-time.ts";

export const SEASON_DURATION_PRESETS = [7, 14, 30] as const;
export type SeasonDurationPreset = (typeof SEASON_DURATION_PRESETS)[number];

export const DEFAULT_SEASON_DURATION_DAYS: SeasonDurationPreset = 14;

/** Fuso oficial da SEMED Coari/AM (UTC-4) */
const OFFICIAL_COARI_UTC_OFFSET_MS = COARI_OFFSET_MS;

const PT_BR_MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export interface MonthlyTournamentDates {
  start: Date;
  end: Date;
  year: number;
  /** 1..12 */
  month: number;
  monthKey: string;
  monthLabel: string;
  durationDays: number;
}

/**
 * Calcula início (01/MM 00:00:00-04:00) e término (último dia/MM 23:59:59.999-04:00)
 * de um mês calendário no fuso oficial de Coari/AM (UTC-4), suportando 28/29/30/31 dias.
 */
export function computeMonthlyTournamentDatesForYearMonth(
  year: number,
  monthIndexZeroBased: number,
): MonthlyTournamentDates {
  const normalized = new Date(Date.UTC(year, monthIndexZeroBased, 1));
  const y = normalized.getUTCFullYear();
  const m0 = normalized.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

  // 00:00:00.000 UTC-4 === 04:00:00.000 UTC
  const start = new Date(Date.UTC(y, m0, 1, 4, 0, 0, 0));
  // 23:59:59.999 UTC-4 do último dia === 03:59:59.999 UTC do dia 1º do mês seguinte
  const end = new Date(Date.UTC(y, m0 + 1, 1, 3, 59, 59, 999));
  const monthNum = m0 + 1;
  const monthKey = `${y}-${String(monthNum).padStart(2, "0")}`;
  const monthLabel = `${PT_BR_MONTH_NAMES[m0]}/${y}`;

  return {
    start,
    end,
    year: y,
    month: monthNum,
    monthKey,
    monthLabel,
    durationDays: lastDay,
  };
}

/**
 * Retorna os limites do mês calendário (UTC-4) correspondente à data de referência.
 */
export function computeMonthlyTournamentDates(
  referenceDate: Date = getOfficialNow(),
  options?: { advanceMonths?: number },
): MonthlyTournamentDates {
  const safeMs =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate.getTime()
      : getOfficialNowMs();
  const shifted = new Date(safeMs + OFFICIAL_COARI_UTC_OFFSET_MS);
  const advance = Math.trunc(options?.advanceMonths ?? 0);
  return computeMonthlyTournamentDatesForYearMonth(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + advance,
  );
}

/**
 * Calcula o próximo ciclo mensal do Torneio Ranqueado ao encerrar a temporada atual.
 * Ex.: Beta terminando em 31/12/2026 -> Janeiro/2027 (01/01/2027 00:00 até 31/01/2027 23:59:59 UTC-4);
 * Janeiro/2027 -> Fevereiro/2027 (01/02/2027 até 28/02/2027 UTC-4).
 */
export function computeNextMonthlyTournamentDates(
  previousEndIso?: string | null,
  now: Date = getOfficialNow(),
): MonthlyTournamentDates {
  const currentMonth = computeMonthlyTournamentDates(now, { advanceMonths: 0 });
  if (previousEndIso) {
    const prevEnd = new Date(previousEndIso);
    if (!Number.isNaN(prevEnd.getTime())) {
      const nextFromPrev = computeMonthlyTournamentDates(prevEnd, { advanceMonths: 1 });
      if (nextFromPrev.end.getTime() >= now.getTime()) {
        return nextFromPrev;
      }
    }
  }
  return currentMonth;
}

/**
 * Formata uma data/ISO no fuso oficial de Coari/AM (UTC-4) de forma determinística,
 * independente do fuso horário configurado no navegador do usuário (ex.: Brasília UTC-3 ou UTC).
 */
export function formatOfficialCoariDate(
  dateOrIso: Date | string | null | undefined,
  options?: { includeYear?: boolean },
): string {
  const ms = parseUtcMs(dateOrIso);
  if (ms === null) return "";
  return formatCoariDateBR(ms, options);
}

export interface SeasonProgressInfo {
  start: Date;
  end: Date | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  remainingHours: number;
  progressPercent: number;
  isExpired: boolean;
  formattedCountdown: string;
  formattedRangeLabel: string;
}

/**
 * Calcula a data de início e término exatas a partir de uma data base e da quantidade de dias.
 * Se uma temporada dura N dias (ex: 7 ou 14 dias), o encerramento ocorre no N-ésimo dia às 23:59:59.999.
 */
export function computeSeasonDates(
  startDate: Date = getOfficialNow(),
  durationDays: number = DEFAULT_SEASON_DURATION_DAYS,
): { start: Date; end: Date } {
  const start = new Date(startDate);
  const daysOffset = Math.max(1, durationDays) - 1;
  const end = new Date(start);
  end.setDate(end.getDate() + daysOffset);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Estende uma data de encerramento em um número específico de dias (ex: +3, +7, +14).
 * Mantém o horário padronizado de encerramento (23:59:59.999) no fuso oficial de Coari (UTC-4).
 */
export function extendSeasonDate(
  currentEndDate: Date,
  additionalDays: number,
): Date {
  const safeDays = Math.max(1, Math.floor(Number(additionalDays) || 1));
  const baseMs = currentEndDate instanceof Date && !Number.isNaN(currentEndDate.getTime())
    ? currentEndDate.getTime()
    : getOfficialNowMs();
  const shifted = new Date(baseMs + OFFICIAL_COARI_UTC_OFFSET_MS);
  const nextEndUtcMs =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + safeDays,
      23,
      59,
      59,
      999,
    ) - OFFICIAL_COARI_UTC_OFFSET_MS;
  return new Date(nextEndUtcMs);
}

/**
 * Converte um objeto Date para o formato ISO aceito pelo <input type="datetime-local">
 * preservando o fuso horário local do navegador (YYYY-MM-DDTHH:mm).
 */
export function toDatetimeLocalString(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Faz o parse seguro de uma string datetime-local para Date.
 */
export function parseDatetimeLocal(str: string): Date | null {
  if (!str || typeof str !== "string") return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calcula métricas completas de progresso e contagem regressiva para a temporada vigente.
 */
export function getSeasonProgress(
  startIso?: string | null,
  endIso?: string | null,
  nowMs = getOfficialNowMs(),
): SeasonProgressInfo {
  const now = new Date(nowMs);
  const start = startIso ? new Date(startIso) : new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  const safeStart = Number.isNaN(start.getTime()) ? new Date(nowMs - 7 * 24 * 60 * 60 * 1000) : start;

  const end = endIso ? new Date(endIso) : null;
  const safeEnd = end && !Number.isNaN(end.getTime()) ? end : null;

  if (!safeEnd) {
    return {
      start: safeStart,
      end: null,
      totalDays: 14,
      elapsedDays: 0,
      remainingDays: 14,
      remainingHours: 0,
      progressPercent: 0,
      isExpired: false,
      formattedCountdown: "Encerramento não agendado (Ciclo Contínuo)",
      formattedRangeLabel: `Iniciada em ${formatCoariDateBR(safeStart)}`,
    };
  }

  const totalMs = Math.max(1000, safeEnd.getTime() - safeStart.getTime());
  const elapsedMs = Math.max(0, nowMs - safeStart.getTime());
  const remainingMs = Math.max(0, safeEnd.getTime() - nowMs);

  const totalDays = Math.max(1, Math.round(totalMs / (24 * 60 * 60 * 1000)));
  const elapsedDays = Math.min(totalDays, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const remainingHours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  const progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const isExpired = nowMs >= safeEnd.getTime();

  const remainingMins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  let formattedCountdown = "";
  if (isExpired) {
    formattedCountdown = "Temporada Concluída! Aguardando renovação...";
  } else if (remainingDays === 0 && remainingHours < 1) {
    formattedCountdown = `Última hora! Termina em ${Math.max(1, remainingMins)} min`;
  } else if (remainingDays === 0) {
    formattedCountdown =
      remainingMins > 0
        ? `Termina hoje! Restam ${remainingHours}h e ${remainingMins}min`
        : `Termina hoje! Restam ${remainingHours}h`;
  } else {
    formattedCountdown = `Termina em ${remainingDays}d e ${remainingHours}h (${formatCoariDateBR(safeEnd, { includeYear: false })} às ${formatCoariTimeBR(safeEnd)})`;
  }

  const formattedRangeLabel = `${formatCoariDateBR(safeStart)} até ${formatCoariDateBR(safeEnd)} (${totalDays} dias)`;

  return {
    start: safeStart,
    end: safeEnd,
    totalDays,
    elapsedDays,
    remainingDays,
    remainingHours,
    progressPercent,
    isExpired,
    formattedCountdown,
    formattedRangeLabel,
  };
}
