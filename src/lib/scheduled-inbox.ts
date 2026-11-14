// Modulo de Mensagens Programadas e Recorrentes (Scheduled Inbox System)
// Permite que a Administracao agende comunicados:
// - Semanais (ex: todo Sabado ou toda Segunda as 08:00)
// - Mensais (ex: todo dia 1º as 09:00)
// - Pontuais em data e hora especifica (ex: 20/11/2026 as 14:00)
// Com renovacao automatica de ciclo (os dados anteriores somem e dao espaco para o novo ciclo)

import type { SystemInboxMessage, AdminBroadcastDraft } from "./inbox-messages.ts";
import {
  sendAdminBroadcastMessage,
  loadAllInboxMessages,
  removeInboxMessageById,
} from "./inbox-messages.ts";

export type ScheduleRecurrenceType = "weekly" | "monthly" | "once";

export interface ScheduledInboxRule {
  id: string;
  title: string;
  body: string;
  active: boolean;
  recurrence: ScheduleRecurrenceType;
  // Dias da semana: 0 = Dom, 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sab
  daysOfWeek?: number[];
  // Dia do mês (1..31)
  dayOfMonth?: number;
  // Data específica "YYYY-MM-DD"
  specificDate?: string;
  // Horário "HH:mm" (24 horas)
  timeOfDay: string;
  // Janela de validade opcional
  validFrom?: string; // "YYYY-MM-DD"
  validUntil?: string; // "YYYY-MM-DD"

  // Destinatários
  recipientMode: "all" | "school" | "stage" | "students";
  targetSchool?: string;
  targetStage?: string;
  targetStudentIds?: string[];
  excludedStudentIds?: string[];

  // Mídias e Menções
  gifLinks?: Record<string, string>;
  imageLinks?: Record<string, string>;
  mediaScales?: Record<string, number>;
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

  // Recompensa
  reward?: {
    type: "points" | "medal" | "future_item";
    pointsAmount?: number;
    medalId?: string;
    isSecret: boolean;
  };
  rewards?: Array<{
    type: "points" | "medal" | "future_item";
    pointsAmount?: number;
    medalId?: string;
    isSecret: boolean;
  }>;

  // Rastreamento de Ciclo
  lastTriggeredAt?: string;
  lastTriggeredCycleKey?: string;
  lastTriggeredMessageId?: string;
  createdAt: string;
  updatedAt?: string;
}

const SCHEDULED_RULES_STORAGE_KEY = "desafios_scheduled_inbox_rules_v1";
const ADMIN_CONFIG_LOCAL_KEY = "desafios-logica-admin-config-v1";
const ADMIN_CONFIG_REMOTE_KEY = "desafios-remote-admin-config-v1";

let memoryScheduledRules: ScheduledInboxRule[] = [];

export function clearMemoryScheduledRules(): void {
  memoryScheduledRules = [];
}

export function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function computeCycleKey(rule: ScheduledInboxRule, now: Date): string {
  if (rule.recurrence === "weekly") {
    return `${rule.id}_weekly_${formatDateIso(now)}`;
  }
  if (rule.recurrence === "monthly") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${rule.id}_monthly_${y}-${m}`;
  }
  if (rule.recurrence === "once") {
    return `${rule.id}_once_${rule.specificDate || formatDateIso(now)}`;
  }
  return `${rule.id}_${formatDateIso(now)}`;
}

export const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function formatRecurrenceLabel(rule: ScheduledInboxRule): string {
  const time = rule.timeOfDay || "08:00";
  if (rule.recurrence === "weekly") {
    const days = rule.daysOfWeek || [];
    if (days.length === 0) return `Semanal às ${time}`;
    if (days.length === 7) return `Todos os dias às ${time}`;
    if (days.length === 2 && days.includes(0) && days.includes(6)) {
      return `Fins de Semana (Sáb e Dom) às ${time}`;
    }
    const dayNames = days.map((d) => DAY_NAMES_SHORT[d] || `${d}`).join(", ");
    return `Toda (${dayNames}) às ${time}`;
  }
  if (rule.recurrence === "monthly") {
    return `Todo dia ${rule.dayOfMonth || 1} do mês às ${time}`;
  }
  if (rule.recurrence === "once") {
    if (!rule.specificDate) return `Data única às ${time}`;
    const [y, m, d] = rule.specificDate.split("-");
    return `${d}/${m}/${y} às ${time}`;
  }
  return `Programada às ${time}`;
}

export function isRuleDue(rule: ScheduledInboxRule, now = new Date()): boolean {
  if (!rule.active) return false;

  const todayStr = formatDateIso(now);
  if (rule.validFrom && todayStr < rule.validFrom) return false;
  if (rule.validUntil && todayStr > rule.validUntil) return false;

  const [ruleHours, ruleMinutes] = (rule.timeOfDay || "08:00").split(":").map(Number);
  const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const ruleTotalMinutes = (ruleHours || 0) * 60 + (ruleMinutes || 0);

  if (nowTotalMinutes < ruleTotalMinutes) {
    return false;
  }

  if (rule.recurrence === "weekly") {
    const day = now.getDay();
    if (!rule.daysOfWeek || !rule.daysOfWeek.includes(day)) {
      return false;
    }
  } else if (rule.recurrence === "monthly") {
    if (now.getDate() !== (rule.dayOfMonth || 1)) {
      return false;
    }
  } else if (rule.recurrence === "once") {
    if (rule.specificDate !== todayStr) {
      return false;
    }
  }

  const currentCycleKey = computeCycleKey(rule, now);
  if (rule.lastTriggeredCycleKey === currentCycleKey) {
    return false;
  }

  return true;
}

export function computeNextRunDate(rule: ScheduledInboxRule, fromDate = new Date()): Date | null {
  if (!rule.active) return null;

  const [hours, minutes] = (rule.timeOfDay || "08:00").split(":").map(Number);
  const from = new Date(fromDate);

  if (rule.recurrence === "once") {
    if (!rule.specificDate) return null;
    const [y, m, d] = rule.specificDate.split("-").map(Number);
    const target = new Date(y, m - 1, d, hours || 0, minutes || 0, 0, 0);
    return target.getTime() > from.getTime() ? target : null;
  }

  if (rule.recurrence === "weekly") {
    const days = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [6];
    for (let i = 0; i <= 14; i++) {
      const candidate = new Date(
        from.getFullYear(),
        from.getMonth(),
        from.getDate() + i,
        hours || 0,
        minutes || 0,
        0,
        0
      );
      if (candidate.getTime() <= from.getTime()) continue;
      if (days.includes(candidate.getDay())) {
        const iso = formatDateIso(candidate);
        if (rule.validFrom && iso < rule.validFrom) continue;
        if (rule.validUntil && iso > rule.validUntil) return null;
        return candidate;
      }
    }
    return null;
  }

  if (rule.recurrence === "monthly") {
    const targetDay = rule.dayOfMonth || 1;
    for (let mOffset = 0; mOffset <= 12; mOffset++) {
      const year = from.getFullYear();
      const month = from.getMonth() + mOffset;
      const candidate = new Date(year, month, targetDay, hours || 0, minutes || 0, 0, 0);
      if (candidate.getTime() <= from.getTime()) continue;
      const iso = formatDateIso(candidate);
      if (rule.validFrom && iso < rule.validFrom) continue;
      if (rule.validUntil && iso > rule.validUntil) return null;
      return candidate;
    }
  }

  return null;
}

export function triggerScheduledRule(
  rule: ScheduledInboxRule,
  now = new Date()
): { updatedRule: ScheduledInboxRule; message: SystemInboxMessage } {
  const cycleKey = computeCycleKey(rule, now);

  // REGRA DO USUÁRIO:
  // "quando ela for reenviada novamente, os dados anteriores somem para dar espaço para os novos dados.
  // quem leu, quem não leu, somem para dar espaço aos dados dessa nova semana."
  // Remove a mensagem do ciclo anterior para que a nova semana inicie com contagem 0% de leitura
  if (rule.lastTriggeredMessageId) {
    try {
      removeInboxMessageById(rule.lastTriggeredMessageId);
    } catch {
      /* ignore */
    }
  }

  const draft: AdminBroadcastDraft = {
    mode: rule.recipientMode,
    targetSchool: rule.targetSchool,
    targetStage: rule.targetStage,
    targetStudentIds: rule.targetStudentIds,
    excludedStudentIds: rule.excludedStudentIds,
    title: rule.title,
    body: rule.body,
    gifLinks: rule.gifLinks,
    imageLinks: rule.imageLinks,
    mediaScales: rule.mediaScales,
    mentionedGameId: rule.mentionedGameId,
    mentionedEventId: rule.mentionedEventId,
    mentionedEventTitle: rule.mentionedEventTitle,
    linkEventDetails: rule.linkEventDetails,
    mentionedGames: rule.mentionedGames,
    mentionedEvents: rule.mentionedEvents,
    reward: rule.reward,
    rewards: rule.rewards,
  };

  const message = sendAdminBroadcastMessage(draft);
  message.metadata = {
    ...message.metadata,
    scheduledRuleId: rule.id,
    cycleKey,
  };

  const updatedRule: ScheduledInboxRule = {
    ...rule,
    lastTriggeredAt: now.toISOString(),
    lastTriggeredCycleKey: cycleKey,
    lastTriggeredMessageId: message.id,
    active: rule.recurrence === "once" ? false : rule.active,
    updatedAt: now.toISOString(),
  };

  return { updatedRule, message };
}

export function loadScheduledInboxRules(): ScheduledInboxRule[] {
  if (typeof window === "undefined") {
    return [...memoryScheduledRules];
  }
  try {
    const map = new Map<string, ScheduledInboxRule>();

    for (const r of memoryScheduledRules) {
      if (r && r.id) map.set(r.id, r);
    }

    const localRaw = window.localStorage.getItem(SCHEDULED_RULES_STORAGE_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (r && r.id) map.set(r.id, r);
        }
      }
    }

    for (const key of [ADMIN_CONFIG_LOCAL_KEY, ADMIN_CONFIG_REMOTE_KEY]) {
      try {
        const cRaw = window.localStorage.getItem(key);
        if (cRaw) {
          const cfg = JSON.parse(cRaw);
          if (Array.isArray(cfg?.scheduledInboxRules)) {
            for (const r of cfg.scheduledInboxRules) {
              if (r && r.id && !map.has(r.id)) {
                map.set(r.id, r);
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    memoryScheduledRules = [...list];
    return list;
  } catch {
    return [...memoryScheduledRules];
  }
}

export function saveScheduledInboxRules(rules: ScheduledInboxRule[]): void {
  memoryScheduledRules = [...rules];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCHEDULED_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.warn("Falha ao salvar regras de mensagens programadas:", err);
  }
}

export function upsertScheduledInboxRule(rule: ScheduledInboxRule): ScheduledInboxRule[] {
  const current = loadScheduledInboxRules();
  const existingIdx = current.findIndex((r) => r.id === rule.id);
  let updated: ScheduledInboxRule[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...rule, updatedAt: new Date().toISOString() };
  } else {
    updated = [rule, ...current];
  }
  saveScheduledInboxRules(updated);
  return updated;
}

export function deleteScheduledInboxRule(ruleId: string): ScheduledInboxRule[] {
  const current = loadScheduledInboxRules();
  const filtered = current.filter((r) => r.id !== ruleId);
  saveScheduledInboxRules(filtered);
  return filtered;
}

export function toggleScheduledInboxRuleActive(ruleId: string, active?: boolean): ScheduledInboxRule[] {
  const current = loadScheduledInboxRules();
  const updated = current.map((r) => {
    if (r.id === ruleId) {
      return {
        ...r,
        active: active !== undefined ? active : !r.active,
        updatedAt: new Date().toISOString(),
      };
    }
    return r;
  });
  saveScheduledInboxRules(updated);
  return updated;
}

export function evaluateAndTriggerScheduledMessages(
  rules?: ScheduledInboxRule[],
  now = new Date(),
  forceTriggerRuleId?: string
): {
  triggeredCount: number;
  updatedRules: ScheduledInboxRule[];
  generatedMessages: SystemInboxMessage[];
} {
  const list = rules ?? loadScheduledInboxRules();
  let triggeredCount = 0;
  const updatedRules: ScheduledInboxRule[] = [];
  const generatedMessages: SystemInboxMessage[] = [];

  for (const rule of list) {
    const shouldTrigger = forceTriggerRuleId === rule.id || isRuleDue(rule, now);

    if (shouldTrigger) {
      const { updatedRule, message } = triggerScheduledRule(rule, now);
      triggeredCount++;
      updatedRules.push(updatedRule);
      generatedMessages.push(message);
    } else {
      updatedRules.push(rule);
    }
  }

  if (triggeredCount > 0) {
    saveScheduledInboxRules(updatedRules);
  }

  return { triggeredCount, updatedRules, generatedMessages };
}
