import { GAME_NAMES, type GameId } from "./game-storage.ts";

export type EventBonusType = "dobro_xp" | "xp_1_5x" | "aumentar_limite_diario" | "personalizado";

export type EventScope = "todos" | "modo_ranqueado" | GameId;

export function formatEventScopeText(scope: EventScope): string {
  if (scope === "todos") return "Todos os Jogos";
  if (scope === "modo_ranqueado") return "Apenas Modo Ranqueado";
  return GAME_NAMES[scope as GameId] ?? scope;
}

export interface SpecialEvent {
  id: string;
  title: string;
  description: string;
  scope: EventScope;
  bonusType: EventBonusType;
  /** Ex: 2000 when bonusType is "aumentar_limite_diario" */
  bonusValue?: number;
  /** Multiplicador de XP (ex: 2x, 1.5x, 3x) */
  xpMultiplier?: number;
  /** Multiplicador de pontos no Torneio Ranqueado (ex: 1.5x, 2x, 3x) */
  rankedMultiplier?: number;
  /** Multiplicador de Pontos de Conquista / Moedas de Carreira (ex: 1.5x, 2x, 3x) */
  pointsMultiplier?: number;
  /** Limite de XP por partida/atividade (padrão normal: 20 XP, evento pode elevar para 50 XP, etc.) */
  matchXpCap?: number;
  /** Limite diário de XP geral (padrão normal: 1.000 XP, evento pode elevar para 2.500 XP, etc.) */
  dailyXpCap?: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
  objectiveDescription?: string | null;
  createdAt: string;
}

const SPECIAL_EVENTS_KEY = "desafios-special-events-v1";

export function loadSpecialEvents(): SpecialEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SPECIAL_EVENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SpecialEvent[];
    let migrated = false;
    for (const ev of list) {
      if (
        ev.scope === "modo_ranqueado" &&
        (ev.title.includes("Fim de Semana") || (ev.xpMultiplier && ev.xpMultiplier > 1))
      ) {
        ev.scope = "todos";
        migrated = true;
      }
    }
    if (migrated) {
      localStorage.setItem(SPECIAL_EVENTS_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return [];
  }
}

export function saveSpecialEvents(events: SpecialEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SPECIAL_EVENTS_KEY, JSON.stringify(events));
    // Trigger custom event so reactive UI (like menu and cards) can refresh immediately
    window.dispatchEvent(new CustomEvent("desafios:special-events-updated"));
  } catch {
    // ignore
  }
}

export function isEventActive(event: SpecialEvent, now = new Date()): boolean {
  if (!event.active) return false;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return now >= start && now <= end;
}

export function getActiveSpecialEvents(
  events = loadSpecialEvents(),
  now = new Date(),
): SpecialEvent[] {
  return events.filter((e) => isEventActive(e, now));
}

/**
 * Retorna todos os IDs de medalhas associadas a um evento (pontual ou recorrente).
 */
export function getEventLinkedMedalIds(ev: {
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
}): string[] {
  const ids: string[] = [];
  if (Array.isArray(ev.linkedMedalIds)) {
    for (const id of ev.linkedMedalIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  if (ev.linkedMedalId && !ids.includes(ev.linkedMedalId)) {
    ids.push(ev.linkedMedalId);
  }
  return ids;
}

/**
 * Retorna a chave de ciclo do evento para controle de progresso estritamente durante aquela edição.
 * Se o evento for pontual, a chave é o startsAt. Se for recorrente, a chave é o dia YYYY-MM-DD.
 */
export function getEventCycleKey(
  ev: { id: string; startsAt?: string },
  now = new Date(),
): string {
  if (ev.startsAt) {
    return `${ev.id}_${ev.startsAt}`;
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${ev.id}_${y}-${m}-${d}`;
}

export interface ActiveEventBonuses {
  multiplier: number;
  matchXpCap: number; // default 20 XP
  dailyXpCap: number; // default 1000 XP
  extraDailyXp: number;
  extraMatchXp: number;
  rankedMultiplier: number; // Multiplicador de pontos no Torneio Ranqueado (1x, 1.5x, 2x, 3x)
  pointsMultiplier: number; // Multiplicador de Pontos de Conquista / Moedas (1x, 1.5x, 2x, 3x)
  activeEventNames: string[];
}

export interface CumulativeActiveBonuses {
  totalMultiplier: number;
  totalDailyCap: number;
  totalMatchCap: number;
  totalExtraDaily: number;
  totalExtraMatch: number;
  totalRankedMultiplier: number;
  hasActiveBonuses: boolean;
  activeEventsCount: number;
}

/**
 * Calculates combined bonuses (XP multiplier, match XP cap, daily XP cap, ranked multiplier)
 * by summing additional gains from all currently active special events and recurring events.
 * Example: base 1.0x + 0.5x (Ev 1) + 1.0x (Ev 2) = 2.5x total XP multiplier.
 * Daily cap: base 1000 + 500 (Ev 1) + 200 (Ev 2) = 1700 total XP daily cap.
 */
export function getActiveEventBonuses(
  gameId: GameId = "todos" as GameId,
  baseDailyCap = 1000,
  baseMatchCap = 20,
  activeEvents = getActiveSpecialEvents(),
  now = new Date(),
  recurringEvents = getActiveRecurringEvents(undefined, now),
  isRankedMatch = false,
): ActiveEventBonuses {
  let extraMultiplier = 0;
  let extraMatch = 0;
  let extraDaily = 0;
  let extraRankedMultiplier = 0;
  let extraPointsMultiplier = 0;
  const activeEventNames: string[] = [];

  const allActive = [
    ...activeEvents.filter((e) => isEventActive(e, now)),
    ...recurringEvents.filter((e) => isRecurringEventActive(e, now)),
  ];

  for (const ev of allActive) {
    const isRankedScope = ev.scope === "modo_ranqueado";
    const inScope = isRankedScope
      ? Boolean(isRankedMatch || (gameId as any) === "modo_ranqueado")
      : ev.scope === "todos" || ev.scope === gameId;

    if (inScope) {
      if (!activeEventNames.includes(ev.title)) {
        activeEventNames.push(ev.title);
      }

      // Linha 1: Multiplicador de XP (+0.5x, +1.0x, etc.)
      let mult = ev.xpMultiplier;
      const bType = "bonusType" in ev ? (ev as any).bonusType : undefined;
      const bVal = "bonusValue" in ev ? (ev as any).bonusValue : undefined;
      if (bType === "dobro_xp" && (!mult || mult < 2)) mult = 2;
      if (bType === "xp_1_5x" && (!mult || mult < 1.5)) mult = 1.5;
      if (mult && mult > 1) {
        extraMultiplier += (mult - 1);
      }

      // Linha 2: Limite de XP por partida (adicional sobre 20)
      if (ev.matchXpCap && ev.matchXpCap > baseMatchCap) {
        extraMatch += (ev.matchXpCap - baseMatchCap);
      }

      // Linha 3: Limite diário de XP (adicional sobre 1000)
      const dCap = ev.dailyXpCap ?? (bType === "aumentar_limite_diario" ? bVal : undefined);
      if (dCap && dCap > baseDailyCap) {
        extraDaily += (dCap - baseDailyCap);
      }

      // Linha 4: Multiplicador de Pontos na Ranqueada (1.5x, 2x, 3x)
      // Aplica-se exclusivamente em partidas ranqueadas
      if (
        ev.rankedMultiplier &&
        ev.rankedMultiplier > 1 &&
        (isRankedMatch || (gameId as any) === "modo_ranqueado")
      ) {
        extraRankedMultiplier += (ev.rankedMultiplier - 1);
      }

      // Linha 5: Multiplicador de Pontos de Conquista / Moedas (1.5x, 2x, 3x)
      if (ev.pointsMultiplier && ev.pointsMultiplier > 1) {
        extraPointsMultiplier += (ev.pointsMultiplier - 1);
      }
    }
  }

  const multiplier = Number((1 + extraMultiplier).toFixed(2));
  const matchXpCap = baseMatchCap + extraMatch;
  const dailyXpCap = baseDailyCap + extraDaily;
  const rankedMultiplier = Number((1 + extraRankedMultiplier).toFixed(2));
  const pointsMultiplier = Number((1 + extraPointsMultiplier).toFixed(2));

  return {
    multiplier,
    matchXpCap,
    dailyXpCap,
    extraDailyXp: extraDaily,
    extraMatchXp: extraMatch,
    rankedMultiplier,
    pointsMultiplier,
    activeEventNames,
  };
}

/**
 * Retorna os bônus acumulados de todos os eventos ativos para exibição em blocos no topo do menu.
 */
export function calculateCumulativeActiveBonuses(
  activeEvents = getActiveSpecialEvents(),
  recurringEvents = getActiveRecurringEvents(),
  now = new Date(),
): CumulativeActiveBonuses {
  const bonuses = getActiveEventBonuses("todos" as GameId, 1000, 20, activeEvents, now);
  const activeList = getAllActiveEvents(activeEvents, recurringEvents, now);

  const hasActiveBonuses =
    bonuses.multiplier > 1 || bonuses.dailyXpCap > 1000 || bonuses.matchXpCap > 20;

  return {
    totalMultiplier: bonuses.multiplier,
    totalDailyCap: bonuses.dailyXpCap,
    totalMatchCap: bonuses.matchXpCap,
    totalExtraDaily: bonuses.extraDailyXp,
    totalExtraMatch: bonuses.extraMatchXp,
    hasActiveBonuses,
    activeEventsCount: activeList.length,
  };
}

/**
 * Calculates XP multiplier from active events for a specific game (or "todos").
 */
export function calculateEventXpMultiplier(
  gameId: GameId,
  activeEvents = getActiveSpecialEvents(),
  now = new Date(),
): { multiplier: number; eventName?: string } {
  const bonuses = getActiveEventBonuses(gameId, 1000, 20, activeEvents, now);
  return {
    multiplier: bonuses.multiplier,
    eventName: bonuses.activeEventNames[0],
  };
}

/**
 * Calculates effective daily XP cap taking into account any active "aumentar_limite_diario" events.
 */
export function getEffectiveDailyXpCap(
  baseCap = 1000,
  activeEvents = getActiveSpecialEvents(),
  now = new Date(),
): number {
  return getActiveEventBonuses("todos" as GameId, baseCap, 20, activeEvents, now).dailyXpCap;
}

export function formatEventRemainingTime(endsAt: string, now = new Date()): string {
  const end = new Date(endsAt);
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return "Encerrado";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 1) {
    const remHours = diffHours % 24;
    return `${diffDays}d ${remHours}h restantes`;
  }
  if (diffHours >= 1) {
    const remMin = diffMin % 60;
    return `${diffHours}h ${remMin}m restantes`;
  }
  if (diffMin >= 1) {
    return `${diffMin} min restantes`;
  }
  return "Menos de 1 min";
}

/**
 * Converte data no formato YYYY-MM-DD ou ISO para o padrão brasileiro DD/MM/AAAA.
 */
export function formatDateOnlyBR(dateStr: string): string {
  if (!dateStr) return "";
  const clean = dateStr.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(clean);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

/**
 * Converte timestamp ISO para o formato brasileiro DD/MM/AAAA às HH:mm.
 */
export function formatDateTimeBR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return formatDateOnlyBR(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

export function createSpecialEvent(args: {
  title: string;
  description: string;
  scope: EventScope;
  bonusType: EventBonusType;
  bonusValue?: number;
  xpMultiplier?: number;
  rankedMultiplier?: number;
  pointsMultiplier?: number;
  matchXpCap?: number;
  dailyXpCap?: number;
  durationHours?: number;
  startsAt?: string;
  endsAt?: string;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
  objectiveDescription?: string | null;
  now?: Date;
}): SpecialEvent {
  const now = args.now ?? new Date();
  const resolvedStartsAt = args.startsAt
    ? new Date(args.startsAt).toISOString()
    : now.toISOString();

  const startTimeMs = new Date(resolvedStartsAt).getTime();
  const defaultDurationHours = args.durationHours && args.durationHours > 0 ? args.durationHours : 24;
  const resolvedEndsAt = args.endsAt
    ? new Date(args.endsAt).toISOString()
    : new Date(startTimeMs + defaultDurationHours * 3600 * 1000).toISOString();

  const finalLinkedIds = Array.isArray(args.linkedMedalIds)
    ? [...args.linkedMedalIds]
    : args.linkedMedalId
      ? [args.linkedMedalId]
      : [];

  const ev: SpecialEvent = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: args.title.trim(),
    description: args.description.trim(),
    scope: args.scope,
    bonusType: args.bonusType,
    bonusValue: args.bonusValue,
    xpMultiplier: args.xpMultiplier,
    rankedMultiplier: args.rankedMultiplier,
    pointsMultiplier: args.pointsMultiplier,
    matchXpCap: args.matchXpCap,
    dailyXpCap: args.dailyXpCap,
    startsAt: resolvedStartsAt,
    endsAt: resolvedEndsAt,
    active: true,
    linkedMedalId: finalLinkedIds[0] ?? null,
    linkedMedalIds: finalLinkedIds,
    objectiveDescription: args.objectiveDescription?.trim() ?? null,
    createdAt: now.toISOString(),
  };

  const list = loadSpecialEvents();
  list.unshift(ev);
  saveSpecialEvents(list);
  return ev;
}

export function updateSpecialEvent(
  id: string,
  updates: Partial<Omit<SpecialEvent, "id" | "createdAt">>
): SpecialEvent | null {
  const list = loadSpecialEvents();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  saveSpecialEvents(list);
  return list[idx];
}

/* ---------------------- EVENTOS RECORRENTES ---------------------- */

export interface RecurringEvent {
  id: string;
  title: string;
  description: string;
  scope: EventScope;
  /** Dias da semana: 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado */
  daysOfWeek: number[];
  /** Datas específicas no formato YYYY-MM-DD */
  specificDates: string[];
  /** Multiplicador de XP (ex: 2x, 1.5x, 3x) */
  xpMultiplier?: number;
  /** Multiplicador de pontos no Torneio Ranqueado (ex: 1.5x, 2x, 3x) */
  rankedMultiplier?: number;
  /** Multiplicador de Pontos de Conquista / Moedas de Carreira (ex: 1.5x, 2x, 3x) */
  pointsMultiplier?: number;
  /** Limite de XP por partida/atividade */
  matchXpCap?: number;
  /** Limite diário de XP geral */
  dailyXpCap?: number;
  active: boolean;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
  objectiveDescription?: string | null;
  createdAt: string;
}

export const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terça-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
];

export const DEFAULT_RECURRING_EVENTS: RecurringEvent[] = [
  {
    id: "rec_sabado_xp",
    title: "+50% de XP do SÁBADO",
    description: "jogue qualquer partida e ganhe mais 50% de XP e um limite diário de 1500 XP",
    scope: "todos",
    daysOfWeek: [6], // 6 = Sábado
    specificDates: [],
    xpMultiplier: 1.5,
    matchXpCap: 30,
    dailyXpCap: 1500,
    active: true,
    linkedMedalId: null,
    objectiveDescription: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rec_domingo_xp",
    title: "DOBRO DE XP DO DOMINGO",
    description: "Aproveite o domingo com dobro de XP em todos os jogos e limite diário expandido para 2000 XP!",
    scope: "todos",
    daysOfWeek: [0], // 0 = Domingo
    specificDates: [],
    xpMultiplier: 2.0,
    matchXpCap: 40,
    dailyXpCap: 2000,
    active: true,
    linkedMedalId: null,
    objectiveDescription: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const RECURRING_EVENTS_KEY = "desafios-recurring-events-v1";

export function loadRecurringEvents(): RecurringEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECURRING_EVENTS_KEY);
    if (raw === null) {
      localStorage.setItem(RECURRING_EVENTS_KEY, JSON.stringify(DEFAULT_RECURRING_EVENTS));
      return [...DEFAULT_RECURRING_EVENTS];
    }
    const list = JSON.parse(raw) as RecurringEvent[];
    let migrated = false;
    for (const ev of list) {
      if (
        ev.scope === "modo_ranqueado" &&
        (ev.title.includes("Fim de Semana") || (ev.xpMultiplier && ev.xpMultiplier > 1))
      ) {
        ev.scope = "todos";
        migrated = true;
      }
    }
    if (migrated) {
      localStorage.setItem(RECURRING_EVENTS_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return [];
  }
}

export function saveRecurringEvents(events: RecurringEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECURRING_EVENTS_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent("desafios:special-events-updated"));
  } catch {
    // ignore
  }
}

export function isRecurringEventActive(event: RecurringEvent, now = new Date()): boolean {
  if (!event.active) return false;
  const currentDay = now.getDay();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayDateStr = `${year}-${month}-${day}`;

  const matchesDayOfWeek = (event.daysOfWeek ?? []).includes(currentDay);
  const matchesDate = (event.specificDates ?? []).includes(todayDateStr);

  return matchesDayOfWeek || matchesDate;
}

export function getActiveRecurringEvents(
  events = loadRecurringEvents(),
  now = new Date(),
): RecurringEvent[] {
  return events.filter((e) => isRecurringEventActive(e, now));
}

export function createRecurringEvent(args: {
  title: string;
  description: string;
  scope: EventScope;
  daysOfWeek: number[];
  specificDates: string[];
  xpMultiplier?: number;
  rankedMultiplier?: number;
  pointsMultiplier?: number;
  matchXpCap?: number;
  dailyXpCap?: number;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
  objectiveDescription?: string | null;
  now?: Date;
}): RecurringEvent {
  const now = args.now ?? new Date();
  const finalLinkedIds = Array.isArray(args.linkedMedalIds)
    ? [...args.linkedMedalIds]
    : args.linkedMedalId
      ? [args.linkedMedalId]
      : [];

  const ev: RecurringEvent = {
    id: `rec_ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: args.title.trim(),
    description: args.description.trim(),
    scope: args.scope,
    daysOfWeek: args.daysOfWeek,
    specificDates: args.specificDates,
    xpMultiplier: args.xpMultiplier,
    rankedMultiplier: args.rankedMultiplier,
    pointsMultiplier: args.pointsMultiplier,
    matchXpCap: args.matchXpCap,
    dailyXpCap: args.dailyXpCap,
    active: true,
    linkedMedalId: finalLinkedIds[0] ?? null,
    linkedMedalIds: finalLinkedIds,
    objectiveDescription: args.objectiveDescription?.trim() ?? null,
    createdAt: now.toISOString(),
  };

  const list = loadRecurringEvents();
  list.unshift(ev);
  saveRecurringEvents(list);
  return ev;
}

export function updateRecurringEvent(
  id: string,
  updates: Partial<Omit<RecurringEvent, "id" | "createdAt">>
): RecurringEvent | null {
  const list = loadRecurringEvents();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  saveRecurringEvents(list);
  return list[idx];
}

/* ---------------------- MODELO UNIFICADO DE EXIBIÇÃO NO MENU ---------------------- */

export interface ActiveEventBonusBadge {
  type: "multiplier" | "match" | "daily";
  label: string;
  icon: string;
}

export interface ActiveEventDisplayItem {
  id: string;
  title: string;
  description: string;
  scope: EventScope;
  badgeLabel: string;
  remainingTime: string;
  bonusTitle: string;
  bonusHighlight: string;
  bonusBadges: ActiveEventBonusBadge[];
  bonusScopeText: string;
  activePeriodLabel?: string;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
  objectiveDescription?: string | null;
  isRecurring: boolean;
}

function buildEventBonusBadges(ev: {
  xpMultiplier?: number;
  rankedMultiplier?: number;
  pointsMultiplier?: number;
  bonusType?: EventBonusType;
  bonusValue?: number;
  matchXpCap?: number;
  dailyXpCap?: number;
  linkedMedalId?: string | null;
  linkedMedalIds?: string[];
}): ActiveEventBonusBadge[] {
  const badges: ActiveEventBonusBadge[] = [];

  // 1. Multiplicador de XP marcado
  let mult = ev.xpMultiplier;
  if (ev.bonusType === "dobro_xp" && (!mult || mult < 2)) mult = 2;
  if (ev.bonusType === "xp_1_5x" && (!mult || mult < 1.5)) mult = 1.5;
  if (mult && mult > 1) {
    badges.push({
      type: "multiplier",
      label: `${mult}x de XP (+${Math.round((mult - 1) * 100)}%)`,
      icon: "🔥",
    });
  }

  // 2. Multiplicador de Pontos Ranqueados
  if (ev.rankedMultiplier && ev.rankedMultiplier > 1) {
    badges.push({
      type: "multiplier",
      label: `${ev.rankedMultiplier}x Pontos na Ranqueada`,
      icon: "🏆",
    });
  }

  // 3. Multiplicador de Pontos de Conquista / Moedas
  if (ev.pointsMultiplier && ev.pointsMultiplier > 1) {
    badges.push({
      type: "multiplier",
      label: `${ev.pointsMultiplier}x Pontos de Conquista`,
      icon: "🪙",
    });
  }

  // 2. Teto por Partida marcado
  if (ev.matchXpCap && ev.matchXpCap > 20) {
    badges.push({
      type: "match",
      label: `+${ev.matchXpCap - 20} XP/partida (${ev.matchXpCap} máx)`,
      icon: "🎯",
    });
  }

  // 3. Limite Diário Geral marcado
  const dCap = ev.dailyXpCap ?? (ev.bonusType === "aumentar_limite_diario" ? ev.bonusValue : undefined);
  if (dCap && dCap > 1000) {
    badges.push({
      type: "daily",
      label: `+${dCap - 1000} XP/dia (${dCap} total)`,
      icon: "🚀",
    });
  }

  if (badges.length === 0) {
    if ((ev.linkedMedalIds && ev.linkedMedalIds.length > 0) || ev.linkedMedalId) {
      badges.push({
        type: "multiplier",
        label: "🏅 Medalha Especial de Evento",
        icon: "🏅",
      });
    } else {
      badges.push({
        type: "multiplier",
        label: "⚡ Bônus Especial Ativo",
        icon: "⚡",
      });
    }
  }

  return badges;
}

/**
 * Retorna todos os eventos ativos no momento (pontuais criados pelo ADM + recorrentes por dia da semana/data)
 * formatados para exibição imediata no banner com carrossel da tela inicial.
 */
export function getAllActiveEvents(
  specialEvents = getActiveSpecialEvents(),
  recurringEvents = getActiveRecurringEvents(),
  now = new Date(),
): ActiveEventDisplayItem[] {
  const items: ActiveEventDisplayItem[] = [];

  // 1. Eventos Pontuais (SpecialEvent)
  for (const ev of specialEvents) {
    const badges = buildEventBonusBadges(ev);
    const highlight = badges[0]?.label ?? "⚡ Bônus Especial";

    items.push({
      id: ev.id,
      title: ev.title,
      description: ev.description || "Aproveite os bônus especiais em vigor nesta temporada!",
      scope: ev.scope,
      badgeLabel: "EVENTO ESPECIAL ATIVO",
      remainingTime: formatEventRemainingTime(ev.endsAt, now),
      bonusTitle: "BÔNUS DO EVENTO",
      bonusHighlight: highlight,
      bonusBadges: badges,
      bonusScopeText: formatEventScopeText(ev.scope),
      activePeriodLabel: `Até ${formatDateTimeBR(ev.endsAt)}`,
      linkedMedalId: ev.linkedMedalId,
      linkedMedalIds: ev.linkedMedalIds ?? (ev.linkedMedalId ? [ev.linkedMedalId] : []),
      objectiveDescription: ev.objectiveDescription,
      isRecurring: false,
    });
  }

  // 2. Eventos Recorrentes (RecurringEvent)
  for (const ev of recurringEvents) {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayDateStr = `${year}-${month}-${day}`;

    const badges = buildEventBonusBadges(ev);
    const highlight = badges[0]?.label ?? "⚡ Bônus Ativo";

    items.push({
      id: ev.id,
      title: ev.title,
      description: ev.description || "Aproveite os bônus automáticos deste dia!",
      scope: ev.scope,
      badgeLabel: "EVENTO ESPECIAL ATIVO",
      remainingTime: formatEventRemainingTime(endOfDay.toISOString(), now),
      bonusTitle: "BÔNUS DO EVENTO",
      bonusHighlight: highlight,
      bonusBadges: badges,
      bonusScopeText: formatEventScopeText(ev.scope),
      activePeriodLabel: `Válido hoje (${formatDateOnlyBR(todayDateStr)})`,
      linkedMedalId: ev.linkedMedalId,
      linkedMedalIds: ev.linkedMedalIds ?? (ev.linkedMedalId ? [ev.linkedMedalId] : []),
      objectiveDescription: ev.objectiveDescription,
      isRecurring: true,
    });
  }

  return items;
}

/**
 * Localiza um evento especial ou recorrente por ID
 */
export function findEventById(
  id: string
): { event: SpecialEvent | RecurringEvent; isRecurring: boolean } | null {
  if (!id) return null;
  const specials = loadSpecialEvents();
  const s = specials.find((e) => e.id === id);
  if (s) return { event: s, isRecurring: false };

  const recurrings = loadRecurringEvents();
  const r = recurrings.find((e) => e.id === id);
  if (r) return { event: r, isRecurring: true };

  return null;
}
