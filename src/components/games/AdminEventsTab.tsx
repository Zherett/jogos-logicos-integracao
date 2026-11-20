import { useState, useMemo } from "react";
import {
  CalendarClock,
  Sparkles,
  Cloud,
  Trash2,
  Award,
  Zap,
  Clock,
  Calendar,
  Pencil,
  Plus,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type SpecialEvent,
  type RecurringEvent,
  type EventBonusType,
  type EventScope,
  formatEventRemainingTime,
  formatDateOnlyBR,
  formatDateTimeBR,
  isEventActive,
  isRecurringEventActive,
  DAYS_OF_WEEK,
  getEventLinkedMedalIds,
  formatEventScopeText,
  createSpecialEvent,
  loadSpecialEvents,
  saveSpecialEvents,
  createRecurringEvent,
  loadRecurringEvents,
  saveRecurringEvents,
} from "@/lib/custom-events";
import {
  type MedalDefinition,
  type MedalRarity,
  type EventRequirementType,
  type EventMedalRequirement,
  getAllAvailableMedals,
  AVAILABLE_MEDAL_ICONS,
  RARITY_INFO,
  formatEventRequirementLabel,
} from "@/lib/medals-catalog";
import { MedalIcon } from "./MedalIcon";
import { type PlatformAdminConfig } from "@/lib/game-codes";
import { type GameId, ALL_GAME_IDS, GAME_NAMES } from "@/lib/game-storage";
import { isPlayFabConfigured, getPlayFabTitleId } from "@/lib/playfab";
import { usePlayerAuth } from "@/lib/player-auth";

const EVENT_REQUIREMENT_OPTIONS: {
  type: EventRequirementType;
  label: string;
  unit: string;
  defaultVal: number;
}[] = [
  { type: "event_matches", label: "Partidas Jogadas no Evento", unit: "partida(s)", defaultVal: 5 },
  { type: "event_xp", label: "XP Acumulado no Evento", unit: "XP", defaultVal: 300 },
  { type: "event_score", label: "Pontuação Máxima em uma Partida", unit: "pontos", defaultVal: 50 },
  { type: "event_level", label: "Nível Alcançado no Jogo", unit: "Nível", defaultVal: 3 },
  { type: "event_flawless", label: "Vitória com Zero Erros (Partida Perfeita)", unit: "partida(s) com 0 erros", defaultVal: 1 },
  { type: "event_x1_wins", label: "Gladiador do X1 (Vitórias no Versus Online)", unit: "vitória(s)", defaultVal: 3 },
  { type: "event_combo", label: "Sequência de Acertos (Combo sem Erros)", unit: "acertos seguidos", defaultVal: 10 },
  { type: "event_daily_cap", label: "Constância (Bater Limite Diário de XP)", unit: "dia(s)", defaultVal: 1 },
  { type: "event_team_matches", label: "Espírito de Equipe (Modo Grupos)", unit: "partida(s)", defaultVal: 3 },
  { type: "event_distinct_games", label: "Explorador Multijogos do Evento", unit: "jogos diferentes", defaultVal: 3 },
];

function renderActiveBonusesLabel(ev: {
  xpMultiplier?: number;
  matchXpCap?: number;
  dailyXpCap?: number;
  rankedMultiplier?: number;
  pointsMultiplier?: number;
  bonusType?: string;
  bonusValue?: number;
  linkedMedalIds?: string[];
  linkedMedalId?: string | null;
}): string {
  const parts: string[] = [];
  if (ev.xpMultiplier && ev.xpMultiplier > 1) {
    parts.push(
      ev.xpMultiplier === 2
        ? "2x XP (Dobro)"
        : `${ev.xpMultiplier}x XP (+${Math.round((ev.xpMultiplier - 1) * 100)}%)`,
    );
  }
  if (ev.rankedMultiplier && ev.rankedMultiplier > 1) {
    parts.push(`${ev.rankedMultiplier}x Pontos Ranqueados`);
  }
  if (ev.pointsMultiplier && ev.pointsMultiplier > 1) {
    parts.push(`${ev.pointsMultiplier}x Pontos de Conquista`);
  }
  if (ev.matchXpCap && ev.matchXpCap > 20) {
    parts.push(`Max ${ev.matchXpCap} XP/partida`);
  }
  if (ev.dailyXpCap && ev.dailyXpCap > 1000) {
    parts.push(`+${ev.dailyXpCap - 1000} XP/dia (${ev.dailyXpCap} total)`);
  } else if (ev.bonusType === "aumentar_limite_diario" && ev.bonusValue && ev.bonusValue > 1000) {
    parts.push(`+${ev.bonusValue - 1000} XP/dia (${ev.bonusValue} total)`);
  }
  if (parts.length === 0) {
    if (ev.bonusType === "dobro_xp") parts.push("2x XP (Dobro)");
    else if (ev.bonusType === "xp_1_5x") parts.push("1.5x XP (+50%)");
    else if ((ev.linkedMedalIds && ev.linkedMedalIds.length > 0) || ev.linkedMedalId) {
      parts.push("Medalha de Evento");
    } else {
      parts.push("Bônus Ativo");
    }
  }
  return parts.join(" • ");
}

function toDatetimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

function parseDatetimeLocal(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export interface AdminEventsTabProps {
  draft: PlatformAdminConfig;
  setDraft: React.Dispatch<React.SetStateAction<PlatformAdminConfig>>;
  specialEvents: SpecialEvent[];
  setSpecialEvents: React.Dispatch<React.SetStateAction<SpecialEvent[]>>;
  recurringEvents: RecurringEvent[];
  setRecurringEvents: React.Dispatch<React.SetStateAction<RecurringEvent[]>>;
  flashSaved: (msg: string) => void;
  onConfigSaved?: () => void;
}

export function AdminEventsTab({
  draft,
  setDraft,
  specialEvents,
  setSpecialEvents,
  recurringEvents,
  setRecurringEvents,
  flashSaved,
  onConfigSaved,
}: AdminEventsTabProps) {
  const auth = usePlayerAuth();

  // Estados locais exclusivos dos formulários de eventos
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [editingSpecialEventId, setEditingSpecialEventId] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evScope, setEvScope] = useState<EventScope>("todos");
  const [evBonusType, setEvBonusType] = useState<EventBonusType>("personalizado");
  const [evHasMultiplier, setEvHasMultiplier] = useState(true);
  const [evMultiplier, setEvMultiplier] = useState<number>(2);
  const [evHasMatchCap, setEvHasMatchCap] = useState(false);
  const [evMatchXpCap, setEvMatchXpCap] = useState<number>(30);
  const [evHasDailyCap, setEvHasDailyCap] = useState(false);
  const [evDailyExtraXp, setEvDailyExtraXp] = useState<number>(500);
  const [evHasRankedMultiplier, setEvHasRankedMultiplier] = useState(false);
  const [evRankedMultiplier, setEvRankedMultiplier] = useState<number>(2);
  const [evHasPointsMultiplier, setEvHasPointsMultiplier] = useState(false);
  const [evPointsMultiplier, setEvPointsMultiplier] = useState<number>(2);
  const [evDurationHours, setEvDurationHours] = useState<number>(24);
  const [evStartMode, setEvStartMode] = useState<"now" | "scheduled">("now");
  const [evScheduledStartInput, setEvScheduledStartInput] = useState<string>(() =>
    toDatetimeLocalString(new Date()),
  );
  const [evDurationMode, setEvDurationMode] = useState<"preset" | "days" | "end_date">("preset");
  const [evCustomDays, setEvCustomDays] = useState<number>(4);
  const [evCustomEndInput, setEvCustomEndInput] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return toDatetimeLocalString(d);
  });
  const [evLinkedMedalId, setEvLinkedMedalId] = useState<string>("");
  const [evObjective, setEvObjective] = useState<string>("");

  // Event Medals state for punctual events
  const [evAttachedMedals, setEvAttachedMedals] = useState<MedalDefinition[]>([]);
  const [isAddingMedalToEv, setIsAddingMedalToEv] = useState(false);
  const [evMedalMode, setEvMedalMode] = useState<"novo" | "existente">("novo");
  const [evNewMedalTitle, setEvNewMedalTitle] = useState("");
  const [evNewMedalDesc, setEvNewMedalDesc] = useState("");
  const [evNewMedalRarity, setEvNewMedalRarity] = useState<MedalRarity>("ouro");
  const [evNewMedalIcon, setEvNewMedalIcon] = useState("Award");
  const [evNewMedalReqType, setEvNewMedalReqType] = useState<EventRequirementType>("event_matches");
  const [evNewMedalScope, setEvNewMedalScope] = useState<"todos" | GameId>("todos");
  const [evNewMedalThreshold, setEvNewMedalThreshold] = useState<number>(5);
  const [evNewMedalMinScore, setEvNewMedalMinScore] = useState<number>(30);
  const [evNewMedalIsStackable, setEvNewMedalIsStackable] = useState<boolean>(true);
  const [evSelectedExistingMedalId, setEvSelectedExistingMedalId] = useState("");

  // Eventos Sub-Abas: "criacao" e "recorrentes"
  const [eventosSubTab, setEventosSubTab] = useState<"criacao" | "recorrentes">("criacao");
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);
  const [editingRecurringEventId, setEditingRecurringEventId] = useState<string | null>(null);
  const [recTitle, setRecTitle] = useState("");
  const [recDesc, setRecDesc] = useState("");
  const [recScope, setRecScope] = useState<EventScope>("todos");
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>([6, 0]); // Padrão: Sábado e Domingo
  const [recSpecificDates, setRecSpecificDates] = useState<string[]>([]);
  const [recDateInput, setRecDateInput] = useState("");
  const [recHasMultiplier, setRecHasMultiplier] = useState(true);
  const [recMultiplier, setRecMultiplier] = useState<number>(1.5);
  const [recHasMatchCap, setRecHasMatchCap] = useState(false);
  const [recMatchCap, setRecMatchCap] = useState<number>(30);
  const [recHasDailyCap, setRecHasDailyCap] = useState(false);
  const [recDailyExtraXp, setRecDailyExtraXp] = useState<number>(500);
  const [recHasRankedMultiplier, setRecHasRankedMultiplier] = useState(false);
  const [recRankedMultiplier, setRecRankedMultiplier] = useState<number>(2);
  const [recHasPointsMultiplier, setRecHasPointsMultiplier] = useState(false);
  const [recPointsMultiplier, setRecPointsMultiplier] = useState<number>(2);
  const [recLinkedMedal, setRecLinkedMedal] = useState<string>("");
  const [recObjective, setRecObjective] = useState<string>("");

  // Event Medals state for recurring events
  const [recAttachedMedals, setRecAttachedMedals] = useState<MedalDefinition[]>([]);
  const [isAddingMedalToRec, setIsAddingMedalToRec] = useState(false);
  const [recMedalMode, setRecMedalMode] = useState<"novo" | "existente">("novo");
  const [recNewMedalTitle, setRecNewMedalTitle] = useState("");
  const [recNewMedalDesc, setRecNewMedalDesc] = useState("");
  const [recNewMedalRarity, setRecNewMedalRarity] = useState<MedalRarity>("ouro");
  const [recNewMedalIcon, setRecNewMedalIcon] = useState("Award");
  const [recNewMedalReqType, setRecNewMedalReqType] = useState<EventRequirementType>("event_matches");
  const [recNewMedalScope, setRecNewMedalScope] = useState<"todos" | GameId>("todos");
  const [recNewMedalThreshold, setRecNewMedalThreshold] = useState<number>(5);
  const [recNewMedalMinScore, setRecNewMedalMinScore] = useState<number>(30);
  const [recSelectedExistingMedalId, setRecSelectedExistingMedalId] = useState("");

  // Arena X1 Caixa de Entrada / Histórico e Estados de Edição de Horário

  // Identificação de medalhas já atreladas a eventos ativos
  const activeLinkedMedalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ev of specialEvents) {
      if (ev.active) {
        getEventLinkedMedalIds(ev).forEach((id) => ids.add(id));
      }
    }
    for (const ev of recurringEvents) {
      if (ev.active) {
        getEventLinkedMedalIds(ev).forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [specialEvents, recurringEvents]);

  // Medalhas de eventos disponíveis que não estão atualmente em uso em eventos ativos
  const availableExistingEventMedals = useMemo(() => {
    return getAllAvailableMedals(draft.customMedals).filter(
      (m) =>
        (m.category === "evento" || Boolean(m.eventRequirement)) &&
        !activeLinkedMedalIds.has(m.id)
    );
  }, [draft.customMedals, activeLinkedMedalIds]);

  function handleStartEditSpecialEvent(ev: SpecialEvent) {
    setEditingSpecialEventId(ev.id);
    setEvTitle(ev.title);
    setEvDesc(ev.description || "");
    setEvScope(ev.scope);

    const sDate = new Date(ev.startsAt);
    const eDate = new Date(ev.endsAt);
    const durationHours =
      Math.max(
        1,
        Math.round((eDate.getTime() - sDate.getTime()) / (3600 * 1000))
      ) || 24;

    setEvDurationHours(durationHours);
    setEvScheduledStartInput(toDatetimeLocalString(sDate));
    setEvCustomEndInput(toDatetimeLocalString(eDate));
    setEvStartMode("scheduled");
    if (durationHours % 24 === 0) {
      setEvDurationMode("days");
      setEvCustomDays(Math.max(1, Math.round(durationHours / 24)));
    } else {
      setEvDurationMode("preset");
    }

    setEvHasMultiplier(Boolean(ev.xpMultiplier && ev.xpMultiplier > 1));
    setEvMultiplier(ev.xpMultiplier || 2);
    setEvHasMatchCap(Boolean(ev.matchXpCap && ev.matchXpCap > 20));
    setEvMatchXpCap(ev.matchXpCap || 30);
    setEvHasDailyCap(Boolean(ev.dailyXpCap && ev.dailyXpCap > 1000));
    setEvDailyExtraXp(ev.dailyXpCap ? Math.max(100, ev.dailyXpCap - 1000) : 500);
    setEvHasRankedMultiplier(Boolean(ev.rankedMultiplier && ev.rankedMultiplier > 1));
    setEvRankedMultiplier(ev.rankedMultiplier || 2);
    setEvHasPointsMultiplier(Boolean(ev.pointsMultiplier && ev.pointsMultiplier > 1));
    setEvPointsMultiplier(ev.pointsMultiplier || 2);
    setEvObjective(ev.objectiveDescription || "");
    setEvLinkedMedalId(ev.linkedMedalId || "");
    setIsCreatingEvent(true);
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitle.trim()) {
      flashSaved("Informe o título do evento.");
      return;
    }
    const hasAnyBonus = evHasMultiplier || evHasMatchCap || evHasDailyCap || evHasRankedMultiplier || evHasPointsMultiplier;
    const hasAnyMedal = evAttachedMedals.length > 0 || Boolean(evLinkedMedalId);
    if (!hasAnyBonus && !hasAnyMedal) {
      flashSaved("Marque pelo menos uma caixa de bônus ou vincule uma medalha ao evento.");
      return;
    }

    const startObj =
      evStartMode === "now"
        ? new Date()
        : parseDatetimeLocal(evScheduledStartInput) || new Date();

    let endObj: Date;
    if (evDurationMode === "preset") {
      endObj = new Date(startObj.getTime() + Number(evDurationHours) * 3600 * 1000);
    } else if (evDurationMode === "days") {
      endObj = new Date(startObj.getTime() + Math.max(1, Number(evCustomDays)) * 24 * 3600 * 1000);
    } else {
      endObj = parseDatetimeLocal(evCustomEndInput) || new Date(startObj.getTime() + 24 * 3600 * 1000);
    }

    if (endObj.getTime() <= startObj.getTime()) {
      flashSaved("⚠️ O término do evento deve ser em data e horário posterior ao início.");
      return;
    }

    const calculatedStartsAt = startObj.toISOString();
    const calculatedEndsAt = endObj.toISOString();

    const newCustoms = [...(draft.customMedals ?? [])];
    const linkedIds: string[] = [];
    for (const m of evAttachedMedals) {
      if (!newCustoms.some((c) => c.id === m.id)) {
        newCustoms.push(m);
      }
      linkedIds.push(m.id);
    }

    if (editingSpecialEventId) {
      const list = specialEvents.map((existing) => {
        if (existing.id !== editingSpecialEventId) return existing;
        return {
          ...existing,
          title: evTitle.trim(),
          description: evDesc.trim(),
          scope: evScope,
          bonusType: (evHasDailyCap
            ? "aumentar_limite_diario"
            : evHasMultiplier
              ? evMultiplier === 2
                ? "dobro_xp"
                : "xp_1_5x"
              : "personalizado") as EventBonusType,
          bonusValue: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
          xpMultiplier: evHasMultiplier ? Number(evMultiplier) : undefined,
          rankedMultiplier: evHasRankedMultiplier ? Number(evRankedMultiplier) : undefined,
          pointsMultiplier: evHasPointsMultiplier ? Number(evPointsMultiplier) : undefined,
          matchXpCap: evHasMatchCap ? Number(evMatchXpCap) : undefined,
          dailyXpCap: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
          startsAt: calculatedStartsAt,
          endsAt: calculatedEndsAt,
          linkedMedalId: linkedIds[0] ?? (evLinkedMedalId || existing.linkedMedalId || null),
          linkedMedalIds: linkedIds.length > 0 ? linkedIds : existing.linkedMedalIds,
          objectiveDescription: evObjective?.trim() || null,
        };
      });
      setSpecialEvents(list);
      saveSpecialEvents(list);
      setIsCreatingEvent(false);
      setEditingSpecialEventId(null);
      setEvTitle("");
      setEvDesc("");
      setEvObjective("");
      setEvAttachedMedals([]);
      const nextCfg = { ...draft, specialEvents: list, customMedals: newCustoms };
      setDraft(nextCfg);
      await auth.updateAdminConfig(nextCfg);
      flashSaved("✅ Evento especial atualizado com sucesso!");
      onConfigSaved?.();
      return;
    }

    createSpecialEvent({
      title: evTitle,
      description: evDesc,
      scope: evScope,
      bonusType: evHasDailyCap
        ? "aumentar_limite_diario"
        : evHasMultiplier
          ? evMultiplier === 2
            ? "dobro_xp"
            : "xp_1_5x"
          : "personalizado",
      bonusValue: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
      xpMultiplier: evHasMultiplier ? Number(evMultiplier) : undefined,
      rankedMultiplier: evHasRankedMultiplier ? Number(evRankedMultiplier) : undefined,
      pointsMultiplier: evHasPointsMultiplier ? Number(evPointsMultiplier) : undefined,
      matchXpCap: evHasMatchCap ? Number(evMatchXpCap) : undefined,
      dailyXpCap: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
      durationHours: Number(evDurationHours),
      startsAt: calculatedStartsAt,
      endsAt: calculatedEndsAt,
      linkedMedalId: linkedIds[0] ?? (evLinkedMedalId || null),
      linkedMedalIds: linkedIds,
      objectiveDescription: evObjective || null,
    });
    const updated = loadSpecialEvents();
    setSpecialEvents(updated);
    setIsCreatingEvent(false);
    setEditingSpecialEventId(null);
    setEvTitle("");
    setEvDesc("");
    setEvObjective("");
    setEvAttachedMedals([]);
    const nextCfg = { ...draft, specialEvents: updated, customMedals: newCustoms };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento especial salvo no Banco de Dados (PlayFab) e ativado!"
        : "💾 Evento especial salvo localmente neste navegador!"
    );
    onConfigSaved?.();
  }

  async function handleToggleEventActive(id: string) {
    const list = specialEvents.map((ev) =>
      ev.id === id ? { ...ev, active: !ev.active } : ev,
    );
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Status sincronizado com o Banco de Dados (PlayFab)!"
        : "💾 Status do evento atualizado localmente!"
    );
    onConfigSaved?.();
  }

  async function handleToggleSpecialScope(id: string) {
    const list = specialEvents.map((ev) => {
      if (ev.id !== id) return ev;
      const nextScope: EventScope = ev.scope === "modo_ranqueado" ? "todos" : "modo_ranqueado";
      return { ...ev, scope: nextScope };
    });
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved("✅ Escopo do evento atualizado com sucesso!");
    onConfigSaved?.();
  }

  async function handleDeleteEvent(id: string) {
    const list = specialEvents.filter((ev) => ev.id !== id);
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento excluído do Banco de Dados (PlayFab)!"
        : "💾 Evento excluído localmente."
    );
    onConfigSaved?.();
  }

  function handleStartEditRecurringEvent(ev: RecurringEvent) {
    setEditingRecurringEventId(ev.id);
    setRecTitle(ev.title);
    setRecDesc(ev.description || "");
    setRecScope(ev.scope);
    setRecDaysOfWeek(ev.daysOfWeek || []);
    setRecSpecificDates(ev.specificDates || []);
    setRecHasMultiplier(Boolean(ev.xpMultiplier && ev.xpMultiplier > 1));
    setRecMultiplier(ev.xpMultiplier || 1.5);
    setRecHasMatchCap(Boolean(ev.matchXpCap && ev.matchXpCap > 20));
    setRecMatchCap(ev.matchXpCap || 30);
    setRecHasDailyCap(Boolean(ev.dailyXpCap && ev.dailyXpCap > 1000));
    setRecDailyExtraXp(ev.dailyXpCap ? Math.max(100, ev.dailyXpCap - 1000) : 500);
    setRecHasRankedMultiplier(Boolean(ev.rankedMultiplier && ev.rankedMultiplier > 1));
    setRecRankedMultiplier(ev.rankedMultiplier || 2);
    setRecHasPointsMultiplier(Boolean(ev.pointsMultiplier && ev.pointsMultiplier > 1));
    setRecPointsMultiplier(ev.pointsMultiplier || 2);
    setRecObjective(ev.objectiveDescription || "");
    setRecLinkedMedal(ev.linkedMedalId || "");
    setIsCreatingRecurring(true);
  }

  async function handleCreateRecurringEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!recTitle.trim()) {
      flashSaved("Informe o título do evento recorrente.");
      return;
    }
    if (recDaysOfWeek.length === 0 && recSpecificDates.length === 0) {
      flashSaved("Selecione pelo menos um dia da semana ou uma data específica.");
      return;
    }
    const hasAnyBonus = recHasMultiplier || recHasMatchCap || recHasDailyCap || recHasRankedMultiplier || recHasPointsMultiplier;
    const hasAnyMedal = recAttachedMedals.length > 0 || Boolean(recLinkedMedal);
    if (!hasAnyBonus && !hasAnyMedal) {
      flashSaved("Marque pelo menos uma caixa de bônus ou vincule uma medalha ao evento.");
      return;
    }
    const newCustoms = [...(draft.customMedals ?? [])];
    const linkedIds: string[] = [];
    for (const m of recAttachedMedals) {
      if (!newCustoms.some((c) => c.id === m.id)) {
        newCustoms.push(m);
      }
      linkedIds.push(m.id);
    }

    if (editingRecurringEventId) {
      const list = recurringEvents.map((existing) => {
        if (existing.id !== editingRecurringEventId) return existing;
        return {
          ...existing,
          title: recTitle.trim(),
          description: recDesc.trim(),
          scope: recScope,
          daysOfWeek: recDaysOfWeek,
          specificDates: recSpecificDates,
          xpMultiplier: recHasMultiplier ? Number(recMultiplier) : undefined,
          rankedMultiplier: recHasRankedMultiplier ? Number(recRankedMultiplier) : undefined,
          pointsMultiplier: recHasPointsMultiplier ? Number(recPointsMultiplier) : undefined,
          matchXpCap: recHasMatchCap ? Number(recMatchCap) : undefined,
          dailyXpCap: recHasDailyCap ? 1000 + Number(recDailyExtraXp) : undefined,
          linkedMedalId: linkedIds[0] ?? (recLinkedMedal || existing.linkedMedalId || null),
          linkedMedalIds: linkedIds.length > 0 ? linkedIds : existing.linkedMedalIds,
          objectiveDescription: recObjective?.trim() || null,
        };
      });
      setRecurringEvents(list);
      saveRecurringEvents(list);
      setIsCreatingRecurring(false);
      setEditingRecurringEventId(null);
      setRecTitle("");
      setRecDesc("");
      setRecObjective("");
      setRecSpecificDates([]);
      setRecDaysOfWeek([6, 0]);
      setRecAttachedMedals([]);
      const nextCfg = { ...draft, recurringEvents: list, customMedals: newCustoms };
      setDraft(nextCfg);
      await auth.updateAdminConfig(nextCfg);
      flashSaved("✅ Evento recorrente atualizado com sucesso!");
      onConfigSaved?.();
      return;
    }

    createRecurringEvent({
      title: recTitle,
      description: recDesc,
      scope: recScope,
      daysOfWeek: recDaysOfWeek,
      specificDates: recSpecificDates,
      xpMultiplier: recHasMultiplier ? Number(recMultiplier) : undefined,
      rankedMultiplier: recHasRankedMultiplier ? Number(recRankedMultiplier) : undefined,
      pointsMultiplier: recHasPointsMultiplier ? Number(recPointsMultiplier) : undefined,
      matchXpCap: recHasMatchCap ? Number(recMatchCap) : undefined,
      dailyXpCap: recHasDailyCap ? 1000 + Number(recDailyExtraXp) : undefined,
      linkedMedalId: linkedIds[0] ?? (recLinkedMedal || null),
      linkedMedalIds: linkedIds,
      objectiveDescription: recObjective || null,
    });
    const updated = loadRecurringEvents();
    setRecurringEvents(updated);
    setIsCreatingRecurring(false);
    setRecTitle("");
    setRecDesc("");
    setRecObjective("");
    setRecSpecificDates([]);
    setRecDaysOfWeek([6, 0]);
    setRecAttachedMedals([]);
    const nextCfg = { ...draft, recurringEvents: updated, customMedals: newCustoms };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento recorrente salvo no Banco de Dados (PlayFab) e ativado!"
        : "💾 Evento recorrente salvo localmente neste navegador!"
    );
    onConfigSaved?.();
  }

  async function handleToggleRecurringActive(id: string) {
    const list = recurringEvents.map((ev) =>
      ev.id === id ? { ...ev, active: !ev.active } : ev,
    );
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Status recorrente sincronizado com o Banco de Dados (PlayFab)!"
        : "💾 Status do evento recorrente atualizado localmente!"
    );
    onConfigSaved?.();
  }

  async function handleToggleRecurringScope(id: string) {
    const list = recurringEvents.map((ev) => {
      if (ev.id !== id) return ev;
      const nextScope: EventScope = ev.scope === "modo_ranqueado" ? "todos" : "modo_ranqueado";
      return { ...ev, scope: nextScope };
    });
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved("✅ Escopo do evento recorrente atualizado com sucesso!");
    onConfigSaved?.();
  }

  async function handleDeleteRecurringEvent(id: string) {
    const list = recurringEvents.filter((ev) => ev.id !== id);
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento recorrente excluído do Banco de Dados (PlayFab)!"
        : "💾 Evento recorrente excluído localmente."
    );
    onConfigSaved?.();
  }


  return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-secondary/30 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Zap className="h-5 w-5 text-amber-500" /> Eventos & Linhas de Bônus
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerencie eventos pontuais manuais ou programe eventos recorrentes por dias da semana e datas específicas!
                    </p>
                  </div>

                  {/* Alternador das 2 Sub-abas de Eventos */}
                  <div className="flex items-center gap-1 rounded-xl bg-background border p-1">
                    <button
                      type="button"
                      onClick={() => setEventosSubTab("criacao")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        eventosSubTab === "criacao"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Zap className="inline mr-1 h-3.5 w-3.5" /> 1. Criação de Eventos
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventosSubTab("recorrentes")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        eventosSubTab === "recorrentes"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Calendar className="inline mr-1 h-3.5 w-3.5" /> 2. Eventos Recorrentes
                      {recurringEvents.filter((e) => isRecurringEventActive(e)).length > 0 && (
                        <span className="ml-1.5 rounded-full bg-emerald-500 text-white px-1.5 py-0.2 text-[9px] font-black">
                          Ao Vivo
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Indicador de Status do Banco de Dados / PlayFab Cloud */}
                {isPlayFabConfigured() ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-bold">
                        Banco de Dados Ativo: Microsoft Azure PlayFab (Title ID: {getPlayFabTitleId()})
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400">
                      ☁️ Sincronização em nuvem ativa: todos os eventos são salvos no banco de dados e sincronizados em todos os computadores.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-bold">
                        Modo Local (Banco de Dados Offline)
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-400">
                      💾 Salvo no navegador local. Para salvar no banco de dados da nuvem para todos os computadores, configure o Title ID na aba <b>PlayFab</b>.
                    </span>
                  </div>
                )}

                {/* SUB-ABA 1: CRIAÇÃO DE EVENTOS PONTUAIS / MANUAIS */}
                {eventosSubTab === "criacao" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          if (isCreatingEvent) {
                            setIsCreatingEvent(false);
                            setEditingSpecialEventId(null);
                          } else {
                            setEditingSpecialEventId(null);
                            setEvTitle("");
                            setEvDesc("");
                            setEvObjective("");
                            setEvAttachedMedals([]);
                            setEvStartMode("now");
                            setEvScheduledStartInput(toDatetimeLocalString(new Date()));
                            setEvDurationMode("preset");
                            setEvDurationHours(24);
                            setEvCustomDays(4);
                            const d = new Date();
                            d.setDate(d.getDate() + 4);
                            setEvCustomEndInput(toDatetimeLocalString(d));
                            setIsCreatingEvent(true);
                          }
                        }}
                        className="rounded-xl font-bold h-9 text-xs"
                      >
                        {isCreatingEvent ? (editingSpecialEventId ? "Cancelar Edição" : "Fechar Formulário") : "+ Criar Novo Evento Pontual"}
                      </Button>
                    </div>

                    {isCreatingEvent && (
                      <form onSubmit={handleCreateEvent} className="rounded-3xl border-2 border-primary/40 bg-card p-4 space-y-3 animate-in fade-in-50">
                        <h4 className="font-display text-sm font-black text-primary">
                          {editingSpecialEventId ? `Editar Evento Pontual: ${evTitle || "Sem título"}` : "Novo Evento Especial Turbinado"}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Nome do Evento</Label>
                            <Input
                              value={evTitle}
                              onChange={(e) => setEvTitle(e.target.value)}
                              placeholder="Ex: Super Fim de Semana 2x XP"
                              className="rounded-xl h-9 text-xs font-semibold"
                              required
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Escopo (Jogos Participantes)</Label>
                            <select
                              value={evScope}
                              onChange={(e) => setEvScope(e.target.value as EventScope)}
                              className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                            >
                              <option value="todos">🌟 Todos os Jogos da Plataforma</option>
                              <option value="modo_ranqueado">🏆 Apenas Jogo do Modo Ranqueado (Torneio Semanal)</option>
                              {ALL_GAME_IDS.map((id) => (
                                <option key={id} value={id}>
                                  🎮 Somente: {GAME_NAMES[id]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Descrição / Detalhes para os Alunos</Label>
                          <Input
                            value={evDesc}
                            onChange={(e) => setEvDesc(e.target.value)}
                            placeholder="Ex: Jogue qualquer partida e ganhe o dobro de XP com teto expandido!"
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>

                        {/* As 3 Linhas de Bônus com Caixinhas para Marcar */}
                        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="font-display text-xs font-black uppercase text-amber-500 flex items-center gap-1.5">
                              <Zap className="h-4 w-4" /> Bônus do Evento (Marque as caixinhas que deseja ativar)
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              Escolha 1, 2 ou os 3 bônus (opcional se vincular medalha)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Bônus 1: Multiplicador */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasMultiplier}
                                  onChange={(e) => setEvHasMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  1. Multiplicador de XP
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasMultiplier}
                                  value={evMultiplier}
                                  onChange={(e) => setEvMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% bônus)</option>
                                  <option value={2}>2x (Dobro de XP)</option>
                                  <option value={2.5}>2.5x (+150% bônus)</option>
                                  <option value={3}>3x (Triplo de XP)</option>
                                  <option value={4}>4x (4x de XP)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica o XP das partidas</p>
                              </div>
                            </div>

                            {/* Bônus 2: Teto por Partida */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasMatchCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasMatchCap}
                                  onChange={(e) => setEvHasMatchCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  2. Teto por Partida (XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!evHasMatchCap}
                                  min={10}
                                  max={200}
                                  step={5}
                                  value={evMatchXpCap}
                                  onChange={(e) => setEvMatchXpCap(Number(e.target.value))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!evHasMatchCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 50 XP"
                                />
                                <p className="text-[10px] text-muted-foreground">Normal: 20 XP por partida</p>
                              </div>
                            </div>

                            {/* Bônus 3: Adicionar ao Limite Diário Geral */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasDailyCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasDailyCap}
                                  onChange={(e) => setEvHasDailyCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  3. Limite Diário (+XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!evHasDailyCap}
                                  min={50}
                                  max={5000}
                                  step={50}
                                  value={evDailyExtraXp}
                                  onChange={(e) => setEvDailyExtraXp(Math.max(0, Number(e.target.value)))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!evHasDailyCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 500 XP adicionais"
                                />
                                <p className="text-[10px] text-muted-foreground font-semibold">
                                  {evHasDailyCap
                                    ? `Base (1.000 XP) + ${evDailyExtraXp} = ${1000 + evDailyExtraXp} XP/dia`
                                    : "Normal: 1.000 XP/dia"}
                                </p>
                              </div>
                            </div>

                            {/* Bônus 4: Multiplicador na Ranqueada */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasRankedMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasRankedMultiplier}
                                  onChange={(e) => {
                                    setEvHasRankedMultiplier(e.target.checked);
                                  }}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  4. Ranqueada (Pontos)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasRankedMultiplier}
                                  value={evRankedMultiplier}
                                  onChange={(e) => setEvRankedMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasRankedMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos no torneio</p>
                              </div>
                            </div>

                            {/* Bônus 5: Multiplicador de Pontos de Conquista / Moedas */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasPointsMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasPointsMultiplier}
                                  onChange={(e) => setEvHasPointsMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  5. Pontos (Moedas)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasPointsMultiplier}
                                  value={evPointsMultiplier}
                                  onChange={(e) => setEvPointsMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasPointsMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos de conquista</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Área Específica: Período, Data/Hora de Início e Duração do Evento */}
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                            <div>
                              <div className="font-display text-xs font-black uppercase text-primary flex items-center gap-1.5">
                                <CalendarClock className="h-4 w-4" /> Período e Duração do Evento
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Defina quando o evento começa (imediato ou agendado) e quanto tempo ele vai durar.
                              </p>
                            </div>
                            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-black text-primary uppercase">
                              Agendamento Completo
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 1. Início do Evento (Agora ou Data e Hora Específica) */}
                            <div className="space-y-2 rounded-xl border bg-card p-3 shadow-xs">
                              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <span>🚀</span> 1. Início do Evento
                              </Label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEvStartMode("now")}
                                  className={`rounded-xl border py-2 px-2.5 text-xs font-bold transition-all ${
                                    evStartMode === "now"
                                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-xs"
                                      : "border-border bg-background text-muted-foreground hover:bg-secondary/40"
                                  }`}
                                >
                                  🟢 Começar Imediatamente
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvStartMode("scheduled")}
                                  className={`rounded-xl border py-2 px-2.5 text-xs font-bold transition-all ${
                                    evStartMode === "scheduled"
                                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                      : "border-border bg-background text-muted-foreground hover:bg-secondary/40"
                                  }`}
                                >
                                  🗓️ Agendar Data e Hora
                                </button>
                              </div>

                              {evStartMode === "scheduled" ? (
                                <div className="space-y-1 pt-1.5 animate-in fade-in-50">
                                  <Label className="text-[11px] font-bold text-muted-foreground">
                                    Escolha a Data e Hora de Início:
                                  </Label>
                                  <Input
                                    type="datetime-local"
                                    value={evScheduledStartInput}
                                    onChange={(e) => setEvScheduledStartInput(e.target.value)}
                                    className="h-9 rounded-xl font-mono text-xs font-bold bg-background"
                                    required
                                  />
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground pt-1">
                                  O evento entrará no ar no mesmo instante em que for salvo.
                                </p>
                              )}
                            </div>

                            {/* 2. Duração e Encerramento (Padrões, Dias Personalizados ou Data Final) */}
                            <div className="space-y-2 rounded-xl border bg-card p-3 shadow-xs">
                              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <span>⏳</span> 2. Duração / Encerramento
                              </Label>
                              <div className="grid grid-cols-3 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEvDurationMode("preset")}
                                  className={`rounded-lg py-1.5 px-1.5 text-[11px] font-bold transition-all text-center ${
                                    evDurationMode === "preset"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "border bg-background text-muted-foreground hover:bg-secondary/40"
                                  }`}
                                >
                                  Padrões
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvDurationMode("days")}
                                  className={`rounded-lg py-1.5 px-1.5 text-[11px] font-bold transition-all text-center ${
                                    evDurationMode === "days"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "border bg-background text-muted-foreground hover:bg-secondary/40"
                                  }`}
                                >
                                  Em Dias
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvDurationMode("end_date")}
                                  className={`rounded-lg py-1.5 px-1.5 text-[11px] font-bold transition-all text-center ${
                                    evDurationMode === "end_date"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "border bg-background text-muted-foreground hover:bg-secondary/40"
                                  }`}
                                >
                                  Data Final
                                </button>
                              </div>

                              {evDurationMode === "preset" && (
                                <div className="space-y-1 pt-1 animate-in fade-in-50">
                                  <Label className="text-[11px] font-bold text-muted-foreground">
                                    Selecione a Duração Pré-definida:
                                  </Label>
                                  <select
                                    value={evDurationHours}
                                    onChange={(e) => setEvDurationHours(Number(e.target.value))}
                                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                                  >
                                    <option value={12}>12 Horas (Meio dia)</option>
                                    <option value={24}>1 Dia (24 horas)</option>
                                    <option value={48}>2 Dias (Fim de Semana / 48 horas)</option>
                                    <option value={72}>3 Dias (72 horas)</option>
                                    <option value={96}>4 Dias (96 horas)</option>
                                    <option value={120}>5 Dias (120 horas)</option>
                                    <option value={168}>1 Semana Completa (7 dias)</option>
                                    <option value={336}>2 Semanas (14 dias)</option>
                                  </select>
                                </div>
                              )}

                              {evDurationMode === "days" && (
                                <div className="space-y-1.5 pt-1 animate-in fade-in-50">
                                  <Label className="text-[11px] font-bold text-muted-foreground">
                                    Informe a Quantidade Exata de Dias:
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min={1}
                                      max={60}
                                      value={evCustomDays}
                                      onChange={(e) => setEvCustomDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                                      className="h-9 rounded-xl font-bold text-sm bg-background w-28"
                                    />
                                    <span className="text-xs font-extrabold text-foreground">
                                      {evCustomDays === 1 ? "dia completo" : "dias de duração"}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    Exemplo: 4 dias = 96 horas a partir do horário de início.
                                  </p>
                                </div>
                              )}

                              {evDurationMode === "end_date" && (
                                <div className="space-y-1 pt-1 animate-in fade-in-50">
                                  <Label className="text-[11px] font-bold text-muted-foreground">
                                    Escolha a Data e Hora de Término do Evento:
                                  </Label>
                                  <Input
                                    type="datetime-local"
                                    value={evCustomEndInput}
                                    onChange={(e) => setEvCustomEndInput(e.target.value)}
                                    className="h-9 rounded-xl font-mono text-xs font-bold bg-background"
                                    required
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Resumo Dinâmico do Período Calculado em Tempo Real */}
                          {(() => {
                            const pStart = evStartMode === "now" ? new Date() : (parseDatetimeLocal(evScheduledStartInput) || new Date());
                            let pEnd = new Date(pStart.getTime() + 24 * 3600 * 1000);
                            if (evDurationMode === "preset") {
                              pEnd = new Date(pStart.getTime() + Number(evDurationHours) * 3600 * 1000);
                            } else if (evDurationMode === "days") {
                              pEnd = new Date(pStart.getTime() + Math.max(1, Number(evCustomDays)) * 24 * 3600 * 1000);
                            } else {
                              pEnd = parseDatetimeLocal(evCustomEndInput) || new Date(pStart.getTime() + 24 * 3600 * 1000);
                            }
                            const diffTotalMs = pEnd.getTime() - pStart.getTime();
                            const totalHours = Math.max(0, Math.round(diffTotalMs / (3600 * 1000)));
                            const daysPart = Math.floor(totalHours / 24);
                            const remHoursPart = totalHours % 24;
                            const isScheduledFuture = pStart.getTime() > Date.now();

                            return (
                              <div className="rounded-xl border border-primary/20 bg-background/90 p-3 space-y-1.5 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-display font-black text-foreground">
                                    Resumo do Período Programado:
                                  </span>
                                  {isScheduledFuture ? (
                                    <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                                      ⏳ Agendado para o Futuro
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                                      🟢 Ativo Imediatamente
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                                  <div className="rounded-lg bg-card p-2 border">
                                    <span className="text-muted-foreground block text-[10px] font-semibold">Início:</span>
                                    <b className="text-foreground">{formatDateTimeBR(pStart.toISOString())}</b>
                                  </div>
                                  <div className="rounded-lg bg-card p-2 border">
                                    <span className="text-muted-foreground block text-[10px] font-semibold">Término:</span>
                                    <b className="text-primary">{formatDateTimeBR(pEnd.toISOString())}</b>
                                  </div>
                                  <div className="rounded-lg bg-card p-2 border">
                                    <span className="text-muted-foreground block text-[10px] font-semibold">Duração Calculada:</span>
                                    <b className="text-foreground">
                                      {daysPart > 0 ? `${daysPart} ${daysPart === 1 ? "dia" : "dias"}` : ""}
                                      {remHoursPart > 0 ? ` ${remHoursPart}h` : ""}
                                      {daysPart === 0 && remHoursPart === 0 ? `${totalHours} horas` : ""}
                                    </b>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Seção de Medalhas Atribuídas ao Evento */}
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h5 className="font-display text-xs font-black uppercase text-primary flex items-center gap-1.5">
                                <Award className="h-4 w-4 text-primary" /> Medalhas do Evento ({evAttachedMedals.length})
                              </h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Crie ou vincule medalhas exclusivas com objetivos e missões a serem cumpridos durante o evento.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={isAddingMedalToEv ? "secondary" : "default"}
                              onClick={() => setIsAddingMedalToEv(!isAddingMedalToEv)}
                              className="rounded-xl font-bold text-xs h-8"
                            >
                              {isAddingMedalToEv ? "Fechar Seletor" : "+ Adicionar Medalha ao Evento"}
                            </Button>
                          </div>

                          {/* Lista das Medalhas já anexadas */}
                          {evAttachedMedals.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {evAttachedMedals.map((m, idx) => {
                                const rarity = RARITY_INFO[m.rarity];
                                return (
                                  <div
                                    key={m.id || idx}
                                    className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                        <div className={rarity.textColor}>
                                          <MedalIcon name={m.iconName} className="h-4 w-4" />
                                        </div>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="truncate font-display text-xs font-black text-foreground">
                                            {m.title}
                                          </span>
                                          <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase ${rarity.badgeBgClass}`}>
                                            {rarity.label}
                                          </span>
                                        </div>
                                        <p className="line-clamp-1 text-[10px] text-muted-foreground">
                                          {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEvAttachedMedals(evAttachedMedals.filter((_, i) => i !== idx))}
                                      className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Remover medalha deste evento"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-primary/20 p-3 text-center text-[11px] text-muted-foreground">
                              Nenhuma medalha vinculada ainda. Clique em <b>"+ Adicionar Medalha ao Evento"</b> para criar novas medalhas com requisitos específicos ou escolher existentes.
                            </div>
                          )}

                          {/* Sub-painel para Adicionar Medalha */}
                          {isAddingMedalToEv && (
                            <div className="rounded-2xl border bg-card p-3 space-y-3 animate-in fade-in-50">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <button
                                  type="button"
                                  onClick={() => setEvMedalMode("novo")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    evMedalMode === "novo"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  ✨ Criar Nova Medalha
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvMedalMode("existente")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    evMedalMode === "existente"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  📂 Utilizar Medalha Existente ({availableExistingEventMedals.length})
                                </button>
                              </div>

                              {evMedalMode === "novo" ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Título da Medalha</Label>
                                      <Input
                                        value={evNewMedalTitle}
                                        onChange={(e) => setEvNewMedalTitle(e.target.value)}
                                        placeholder="Ex: Campeão da Arena 2x"
                                        className="h-8 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Raridade</Label>
                                      <select
                                        value={evNewMedalRarity}
                                        onChange={(e) => setEvNewMedalRarity(e.target.value as MedalRarity)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        <option value="bronze">Bronze</option>
                                        <option value="prata">Prata</option>
                                        <option value="ouro">Ouro</option>
                                        <option value="platina">Platina</option>
                                        <option value="diamante">Diamante</option>
                                        <option value="heroi">Herói</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Requisito do Evento</Label>
                                      <select
                                        value={evNewMedalReqType}
                                        onChange={(e) => {
                                          const t = e.target.value as EventRequirementType;
                                          setEvNewMedalReqType(t);
                                          const opt = EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === t);
                                          if (opt) setEvNewMedalThreshold(opt.defaultVal);
                                        }}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        {EVENT_REQUIREMENT_OPTIONS.map((opt) => (
                                          <option key={opt.type} value={opt.type}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Jogo Vinculado</Label>
                                      <select
                                        disabled={["event_x1_wins", "event_distinct_games", "event_daily_cap", "event_team_matches"].includes(evNewMedalReqType)}
                                        value={evNewMedalScope}
                                        onChange={(e) => setEvNewMedalScope(e.target.value as "todos" | GameId)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold disabled:opacity-50"
                                      >
                                        <option value="todos">🌟 Qualquer Jogo</option>
                                        {ALL_GAME_IDS.map((id) => (
                                          <option key={id} value={id}>
                                            🎮 {GAME_NAMES[id]}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">
                                        Meta ({EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === evNewMedalReqType)?.unit})
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={evNewMedalThreshold}
                                        onChange={(e) => setEvNewMedalThreshold(Math.max(1, Number(e.target.value)))}
                                        className="h-8 rounded-lg text-xs font-bold bg-background"
                                      />
                                    </div>
                                  </div>

                                  {/* Ícones Selector Compact */}
                                  <div className="space-y-1">
                                    <Label className="text-[11px] font-bold">Ícone</Label>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto rounded-lg border bg-background p-1.5">
                                      {AVAILABLE_MEDAL_ICONS.map((ic) => (
                                        <button
                                          key={ic}
                                          type="button"
                                          onClick={() => setEvNewMedalIcon(ic)}
                                          className={`grid h-7 w-7 place-items-center rounded-md border transition-all ${
                                            evNewMedalIcon === ic
                                              ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                                              : "hover:bg-secondary text-muted-foreground"
                                          }`}
                                          title={ic}
                                        >
                                          <MedalIcon name={ic} className="h-3.5 w-3.5" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Preview do Requisito */}
                                  <div className="rounded-xl border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
                                    <b>Descrição automática:</b> {formatEventRequirementLabel({
                                      type: evNewMedalReqType,
                                      threshold: evNewMedalThreshold,
                                      gameId: evNewMedalScope === "todos" ? undefined : evNewMedalScope,
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between rounded-xl border bg-card p-2.5">
                                    <div>
                                      <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer" htmlFor="ev-medal-stackable">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        Medalha Empilhável / Cumulativa
                                      </Label>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Alunos podem acumular esta medalha múltiplas vezes com contador no canto superior direito.
                                      </p>
                                    </div>
                                    <input
                                      id="ev-medal-stackable"
                                      type="checkbox"
                                      checked={evNewMedalIsStackable}
                                      onChange={(e) => setEvNewMedalIsStackable(e.target.checked)}
                                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        if (!evNewMedalTitle.trim()) {
                                          flashSaved("Informe o título da medalha.");
                                          return;
                                        }
                                        const req: EventMedalRequirement = {
                                          type: evNewMedalReqType,
                                          threshold: Number(evNewMedalThreshold) || 1,
                                          gameId: evNewMedalScope === "todos" ? undefined : evNewMedalScope,
                                        };
                                        const medalId = `ev_medal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                                        const newM: MedalDefinition = {
                                          id: medalId,
                                          title: evNewMedalTitle.trim(),
                                          description: `${evNewMedalTitle.trim()} — Exclusiva do evento "${evTitle.trim() || "Especial"}". ${formatEventRequirementLabel(req)}`,
                                          rarity: evNewMedalRarity,
                                          category: "evento",
                                          iconName: evNewMedalIcon,
                                          condition: {
                                            type: evNewMedalReqType,
                                            threshold: req.threshold,
                                            gameId: req.gameId,
                                          },
                                          isCustom: true,
                                          isStackable: evNewMedalIsStackable,
                                          createdByAdmin: true,
                                          eventName: evTitle.trim() || "Evento Especial",
                                          eventRequirement: req,
                                        };
                                        setEvAttachedMedals([...evAttachedMedals, newM]);
                                        setIsAddingMedalToEv(false);
                                        setEvNewMedalTitle("");
                                        flashSaved(`Medalha "${newM.title}" adicionada ao evento!`);
                                      }}
                                      className="rounded-xl font-bold text-xs h-8 bg-primary"
                                    >
                                      + Adicionar Medalha ao Evento
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Modo Existente */
                                <div className="space-y-3">
                                  {availableExistingEventMedals.length === 0 ? (
                                    <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                                      Nenhuma medalha de evento disponível que não esteja em uso em outro evento ativo. Crie uma nova medalha na aba acima!
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <Label className="text-[11px] font-bold">Selecione uma Medalha Existente</Label>
                                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                        {availableExistingEventMedals.map((m) => {
                                          const rarity = RARITY_INFO[m.rarity];
                                          const isAlreadyAttached = evAttachedMedals.some((a) => a.id === m.id);
                                          return (
                                            <div
                                              key={m.id}
                                              className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-colors ${
                                                isAlreadyAttached ? "opacity-40 bg-muted" : "bg-card hover:border-primary"
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                                  <div className={rarity.textColor}>
                                                    <MedalIcon name={m.iconName} className="h-3.5 w-3.5" />
                                                  </div>
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-bold truncate">{m.title}</span>
                                                    <span className={`text-[8px] font-extrabold uppercase px-1 rounded ${rarity.badgeBgClass}`}>
                                                      {rarity.label}
                                                    </span>
                                                  </div>
                                                  <p className="text-[10px] text-muted-foreground truncate">
                                                    {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                                  </p>
                                                </div>
                                              </div>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={isAlreadyAttached}
                                                onClick={() => {
                                                  const cloned: MedalDefinition = {
                                                    ...m,
                                                    eventName: evTitle.trim() || m.eventName || "Evento Especial",
                                                    description: m.description.includes("—")
                                                      ? m.description
                                                      : `${m.title} — Exclusiva do evento "${evTitle.trim() || "Especial"}". ${m.description}`,
                                                  };
                                                  setEvAttachedMedals([...evAttachedMedals, cloned]);
                                                  setIsAddingMedalToEv(false);
                                                  flashSaved(`Medalha "${m.title}" vinculada ao evento!`);
                                                }}
                                                className="rounded-lg text-[10px] font-bold h-7 px-2"
                                              >
                                                {isAlreadyAttached ? "Já Vinculada" : "+ Vincular"}
                                              </Button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingEvent(false);
                              setEditingSpecialEventId(null);
                            }}
                            className="rounded-xl text-xs"
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" size="sm" className="rounded-xl font-bold text-xs bg-primary">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {editingSpecialEventId ? "Salvar Alterações" : "Criar e Ativar Evento"}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Lista de Eventos Pontuais */}
                    <div className="space-y-2">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Eventos Pontuais Ativos / Agendados ({specialEvents.length})
                      </h4>

                      {specialEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          Nenhum evento pontual cadastrado. Clique no botão acima para criar um evento temporário.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {specialEvents.map((ev) => {
                            const activeNow = isEventActive(ev);
                            const remaining = formatEventRemainingTime(ev.endsAt);
                            return (
                              <div
                                key={ev.id}
                                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                                  activeNow
                                    ? "border-amber-500/50 bg-amber-500/5"
                                    : "border-border/60 bg-muted/20 opacity-75"
                                }`}
                              >
                                <div className="min-w-0 space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                        activeNow
                                          ? "bg-amber-500 text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {activeNow ? "AO VIVO NO MENU" : "ENCERRADO / INATIVO"}
                                    </span>
                                    <h5 className="font-display text-sm font-black text-foreground truncate">
                                      {ev.title}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleSpecialScope(ev.id)}
                                      title="Clique para alternar o escopo do evento (Todos os Jogos ⇄ Apenas Ranqueada)"
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-all border hover:scale-105 ${
                                        ev.scope === "modo_ranqueado"
                                          ? "bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30"
                                          : "bg-secondary text-muted-foreground border-border/60 hover:text-foreground"
                                      }`}
                                    >
                                      {formatEventScopeText(ev.scope)} ⇄
                                    </button>
                                  </div>

                                  {ev.description && (
                                    <p className="text-xs text-muted-foreground">{ev.description}</p>
                                  )}

                                  <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                    <span className="font-bold text-amber-500 flex items-center gap-1">
                                      <Zap className="h-3.5 w-3.5" />
                                      {renderActiveBonusesLabel(ev)}
                                    </span>
                                    <span className="flex items-center gap-1 font-semibold text-foreground">
                                      <Calendar className="h-3.5 w-3.5 text-primary" />
                                      Período: <b>{formatDateTimeBR(ev.startsAt)}</b> até <b>{formatDateTimeBR(ev.endsAt)}</b>
                                    </span>
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                                      {activeNow ? remaining : "Expirado"}
                                    </span>
                                    {ev.linkedMedalId && (
                                      <span className="font-medium text-primary flex items-center gap-1">
                                        <Award className="h-3.5 w-3.5" />
                                        Medalha vinculada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartEditSpecialEvent(ev)}
                                    className="rounded-xl text-xs h-8 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                    title="Editar evento"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={ev.active ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => handleToggleEventActive(ev.id)}
                                    className="rounded-xl text-xs h-8"
                                  >
                                    {ev.active ? "Desativar" : "Ativar"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEvent(ev.id)}
                                    className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10"
                                    title="Excluir evento"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-ABA 2: EVENTOS RECORRENTES (DIAS DA SEMANA E DATAS ESPECÍFICAS) */}
                {eventosSubTab === "recorrentes" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          if (isCreatingRecurring) {
                            setIsCreatingRecurring(false);
                            setEditingRecurringEventId(null);
                          } else {
                            setEditingRecurringEventId(null);
                            setRecTitle("");
                            setRecDesc("");
                            setRecObjective("");
                            setRecSpecificDates([]);
                            setRecDaysOfWeek([6, 0]);
                            setRecAttachedMedals([]);
                            setIsCreatingRecurring(true);
                          }
                        }}
                        className="rounded-xl font-bold h-9 text-xs"
                      >
                        {isCreatingRecurring ? (editingRecurringEventId ? "Cancelar Edição" : "Fechar Formulário") : "+ Criar Evento Recorrente"}
                      </Button>
                    </div>

                    {isCreatingRecurring && (
                      <form onSubmit={handleCreateRecurringEvent} className="rounded-3xl border-2 border-primary/40 bg-card p-4 space-y-3 animate-in fade-in-50">
                        <h4 className="font-display text-sm font-black text-primary flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" /> {editingRecurringEventId ? `Editar Evento Recorrente: ${recTitle || "Sem título"}` : "Novo Evento Recorrente (Dias da Semana / Datas)"}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Título do Evento Recorrente</Label>
                            <Input
                              value={recTitle}
                              onChange={(e) => setRecTitle(e.target.value)}
                              placeholder="Ex: Fim de Semana Turbinado"
                              className="rounded-xl h-9 text-xs font-semibold"
                              required
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Escopo (Jogos)</Label>
                            <select
                              value={recScope}
                              onChange={(e) => setRecScope(e.target.value as EventScope)}
                              className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                            >
                              <option value="todos">🌟 Todos os Jogos da Plataforma</option>
                              <option value="modo_ranqueado">🏆 Apenas Jogo do Modo Ranqueado (Torneio Semanal)</option>
                              {ALL_GAME_IDS.map((id) => (
                                <option key={id} value={id}>
                                  🎮 Somente: {GAME_NAMES[id]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Descrição</Label>
                          <Input
                            value={recDesc}
                            onChange={(e) => setRecDesc(e.target.value)}
                            placeholder="Ex: Ativação automática todo sábado e domingo com XP em dobro!"
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>

                        {/* Seleção de Dias da Semana */}
                        <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
                          <Label className="text-xs font-bold flex items-center justify-between">
                            <span>Dias da Semana com Ativação Automática</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              Clique para marcar/desmarcar
                            </span>
                          </Label>
                          <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
                            {DAYS_OF_WEEK.map((d) => {
                              const isSelected = recDaysOfWeek.includes(d.value);
                              return (
                                <button
                                  key={d.value}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setRecDaysOfWeek(recDaysOfWeek.filter((w) => w !== d.value));
                                    } else {
                                      setRecDaysOfWeek([...recDaysOfWeek, d.value]);
                                    }
                                  }}
                                  className={`rounded-xl py-2 px-1 text-center font-bold text-xs transition-all ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "border bg-card text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  <div>{d.short}</div>
                                  <div className="text-[9px] opacity-80">{isSelected ? "✓ Ativo" : "-"}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Seleção de Datas Específicas */}
                        <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
                          <Label className="text-xs font-bold">Datas Específicas Adicionais (Feriados, Gincanas, etc.)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={recDateInput}
                              onChange={(e) => setRecDateInput(e.target.value)}
                              className="h-9 w-48 rounded-xl text-xs font-semibold bg-background"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (recDateInput && !recSpecificDates.includes(recDateInput)) {
                                  setRecSpecificDates([...recSpecificDates, recDateInput]);
                                  setRecDateInput("");
                                }
                              }}
                              className="h-9 rounded-xl text-xs font-bold"
                            >
                              + Adicionar Data
                            </Button>
                          </div>
                          {recSpecificDates.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {recSpecificDates.map((dt) => (
                                <span
                                  key={dt}
                                  className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-0.5 text-xs font-bold text-primary"
                                >
                                  {formatDateOnlyBR(dt)}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRecSpecificDates(recSpecificDates.filter((d) => d !== dt))
                                    }
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* As 3 Linhas de Bônus para o Evento Recorrente com Caixinhas para Marcar */}
                        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="font-display text-xs font-black uppercase text-amber-500 flex items-center gap-1.5">
                              <Zap className="h-4 w-4" /> Bônus Recorrentes (Marque as caixinhas que deseja ativar)
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              Escolha 1, 2 ou os 3 bônus (opcional se vincular medalha)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Bônus 1: Multiplicador */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasMultiplier}
                                  onChange={(e) => setRecHasMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  1. Multiplicador de XP
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasMultiplier}
                                  value={recMultiplier}
                                  onChange={(e) => setRecMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% bônus)</option>
                                  <option value={2}>2x (Dobro de XP)</option>
                                  <option value={2.5}>2.5x (+150% bônus)</option>
                                  <option value={3}>3x (Triplo de XP)</option>
                                  <option value={4}>4x (4x de XP)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica o XP das partidas</p>
                              </div>
                            </div>

                            {/* Bônus 2: Teto por Partida */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasMatchCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasMatchCap}
                                  onChange={(e) => setRecHasMatchCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  2. Teto por Partida (XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!recHasMatchCap}
                                  min={10}
                                  max={200}
                                  step={5}
                                  value={recMatchCap}
                                  onChange={(e) => setRecMatchCap(Number(e.target.value))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!recHasMatchCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 30 XP"
                                />
                                <p className="text-[10px] text-muted-foreground">Normal: 20 XP por partida</p>
                              </div>
                            </div>

                            {/* Bônus 3: Adicionar ao Limite Diário Geral */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasDailyCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasDailyCap}
                                  onChange={(e) => setRecHasDailyCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  3. Limite Diário (+XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!recHasDailyCap}
                                  min={50}
                                  max={5000}
                                  step={50}
                                  value={recDailyExtraXp}
                                  onChange={(e) => setRecDailyExtraXp(Math.max(0, Number(e.target.value)))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!recHasDailyCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 500 XP adicionais"
                                />
                                <p className="text-[10px] text-muted-foreground font-semibold">
                                  {recHasDailyCap
                                    ? `Base (1.000 XP) + ${recDailyExtraXp} = ${1000 + recDailyExtraXp} XP/dia`
                                    : "Normal: 1.000 XP/dia"}
                                </p>
                              </div>
                            </div>

                            {/* Bônus 4: Multiplicador na Ranqueada */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasRankedMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasRankedMultiplier}
                                  onChange={(e) => {
                                    setRecHasRankedMultiplier(e.target.checked);
                                  }}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  4. Ranqueada (Pontos)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasRankedMultiplier}
                                  value={recRankedMultiplier}
                                  onChange={(e) => setRecRankedMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasRankedMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos no torneio</p>
                              </div>
                            </div>

                            {/* Bônus 5: Multiplicador de Pontos de Conquista / Moedas */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasPointsMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasPointsMultiplier}
                                  onChange={(e) => setRecHasPointsMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  5. Pontos (Moedas)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasPointsMultiplier}
                                  value={recPointsMultiplier}
                                  onChange={(e) => setRecPointsMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasPointsMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos de conquista</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Seção de Medalhas Atribuídas ao Evento Recorrente */}
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h5 className="font-display text-xs font-black uppercase text-primary flex items-center gap-1.5">
                                <Award className="h-4 w-4 text-primary" /> Medalhas do Evento ({recAttachedMedals.length})
                              </h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Crie ou vincule medalhas com metas a serem cumpridas a cada edição deste evento recorrente.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={isAddingMedalToRec ? "secondary" : "default"}
                              onClick={() => setIsAddingMedalToRec(!isAddingMedalToRec)}
                              className="rounded-xl font-bold text-xs h-8"
                            >
                              {isAddingMedalToRec ? "Fechar Seletor" : "+ Adicionar Medalha ao Evento"}
                            </Button>
                          </div>

                          {/* Lista das Medalhas já anexadas ao evento recorrente */}
                          {recAttachedMedals.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {recAttachedMedals.map((m, idx) => {
                                const rarity = RARITY_INFO[m.rarity];
                                return (
                                  <div
                                    key={m.id || idx}
                                    className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                        <div className={rarity.textColor}>
                                          <MedalIcon name={m.iconName} className="h-4 w-4" />
                                        </div>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="truncate font-display text-xs font-black text-foreground">
                                            {m.title}
                                          </span>
                                          <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase ${rarity.badgeBgClass}`}>
                                            {rarity.label}
                                          </span>
                                        </div>
                                        <p className="line-clamp-1 text-[10px] text-muted-foreground">
                                          {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setRecAttachedMedals(recAttachedMedals.filter((_, i) => i !== idx))}
                                      className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Remover medalha deste evento"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-primary/20 p-3 text-center text-[11px] text-muted-foreground">
                              Nenhuma medalha vinculada ainda. Clique em <b>"+ Adicionar Medalha ao Evento"</b> para criar novas medalhas com requisitos específicos ou escolher existentes.
                            </div>
                          )}

                          {/* Sub-painel para Adicionar Medalha ao Evento Recorrente */}
                          {isAddingMedalToRec && (
                            <div className="rounded-2xl border bg-card p-3 space-y-3 animate-in fade-in-50">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <button
                                  type="button"
                                  onClick={() => setRecMedalMode("novo")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    recMedalMode === "novo"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  ✨ Criar Nova Medalha
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRecMedalMode("existente")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    recMedalMode === "existente"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  📂 Utilizar Medalha Existente ({availableExistingEventMedals.length})
                                </button>
                              </div>

                              {recMedalMode === "novo" ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Título da Medalha</Label>
                                      <Input
                                        value={recNewMedalTitle}
                                        onChange={(e) => setRecNewMedalTitle(e.target.value)}
                                        placeholder="Ex: Guerreiro de Fim de Semana"
                                        className="h-8 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Raridade</Label>
                                      <select
                                        value={recNewMedalRarity}
                                        onChange={(e) => setRecNewMedalRarity(e.target.value as MedalRarity)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        <option value="bronze">Bronze</option>
                                        <option value="prata">Prata</option>
                                        <option value="ouro">Ouro</option>
                                        <option value="platina">Platina</option>
                                        <option value="diamante">Diamante</option>
                                        <option value="heroi">Herói</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Requisito do Evento</Label>
                                      <select
                                        value={recNewMedalReqType}
                                        onChange={(e) => {
                                          const t = e.target.value as EventRequirementType;
                                          setRecNewMedalReqType(t);
                                          const opt = EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === t);
                                          if (opt) setRecNewMedalThreshold(opt.defaultVal);
                                        }}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        {EVENT_REQUIREMENT_OPTIONS.map((opt) => (
                                          <option key={opt.type} value={opt.type}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Jogo Vinculado</Label>
                                      <select
                                        disabled={["event_x1_wins", "event_distinct_games", "event_daily_cap", "event_team_matches"].includes(recNewMedalReqType)}
                                        value={recNewMedalScope}
                                        onChange={(e) => setRecNewMedalScope(e.target.value as "todos" | GameId)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold disabled:opacity-50"
                                      >
                                        <option value="todos">🌟 Qualquer Jogo</option>
                                        {ALL_GAME_IDS.map((id) => (
                                          <option key={id} value={id}>
                                            🎮 {GAME_NAMES[id]}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">
                                        Meta ({EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === recNewMedalReqType)?.unit})
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={recNewMedalThreshold}
                                        onChange={(e) => setRecNewMedalThreshold(Math.max(1, Number(e.target.value)))}
                                        className="h-8 rounded-lg text-xs font-bold bg-background"
                                      />
                                    </div>
                                  </div>

                                  {/* Ícones Selector Compact */}
                                  <div className="space-y-1">
                                    <Label className="text-[11px] font-bold">Ícone</Label>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto rounded-lg border bg-background p-1.5">
                                      {AVAILABLE_MEDAL_ICONS.map((ic) => (
                                        <button
                                          key={ic}
                                          type="button"
                                          onClick={() => setRecNewMedalIcon(ic)}
                                          className={`grid h-7 w-7 place-items-center rounded-md border transition-all ${
                                            recNewMedalIcon === ic
                                              ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                                              : "hover:bg-secondary text-muted-foreground"
                                          }`}
                                          title={ic}
                                        >
                                          <MedalIcon name={ic} className="h-3.5 w-3.5" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Preview do Requisito */}
                                  <div className="rounded-xl border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
                                    <b>Descrição automática:</b> {formatEventRequirementLabel({
                                      type: recNewMedalReqType,
                                      threshold: recNewMedalThreshold,
                                      gameId: recNewMedalScope === "todos" ? undefined : recNewMedalScope,
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between rounded-xl border bg-card p-2.5">
                                    <div>
                                      <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer" htmlFor="ev-medal-stackable">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        Medalha Empilhável / Cumulativa
                                      </Label>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Alunos podem acumular esta medalha múltiplas vezes com contador no canto superior direito.
                                      </p>
                                    </div>
                                    <input
                                      id="ev-medal-stackable"
                                      type="checkbox"
                                      checked={evNewMedalIsStackable}
                                      onChange={(e) => setEvNewMedalIsStackable(e.target.checked)}
                                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        if (!recNewMedalTitle.trim()) {
                                          flashSaved("Informe o título da medalha.");
                                          return;
                                        }
                                        const req: EventMedalRequirement = {
                                          type: recNewMedalReqType,
                                          threshold: Number(recNewMedalThreshold) || 1,
                                          gameId: recNewMedalScope === "todos" ? undefined : recNewMedalScope,
                                        };
                                        const medalId = `rec_medal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                                        const newM: MedalDefinition = {
                                          id: medalId,
                                          title: recNewMedalTitle.trim(),
                                          description: `${recNewMedalTitle.trim()} — Exclusiva do evento "${recTitle.trim() || "Recorrente"}". ${formatEventRequirementLabel(req)}`,
                                          rarity: recNewMedalRarity,
                                          category: "evento",
                                          iconName: recNewMedalIcon,
                                          condition: {
                                            type: recNewMedalReqType,
                                            threshold: req.threshold,
                                            gameId: req.gameId,
                                          },
                                          isCustom: true,
                                          isStackable: evNewMedalIsStackable,
                                          createdByAdmin: true,
                                          eventName: recTitle.trim() || "Evento Recorrente",
                                          eventRequirement: req,
                                        };
                                        setRecAttachedMedals([...recAttachedMedals, newM]);
                                        setIsAddingMedalToRec(false);
                                        setRecNewMedalTitle("");
                                        flashSaved(`Medalha "${newM.title}" adicionada ao evento recorrente!`);
                                      }}
                                      className="rounded-xl font-bold text-xs h-8 bg-primary"
                                    >
                                      + Adicionar Medalha ao Evento
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Modo Existente para Recorrente */
                                <div className="space-y-3">
                                  {availableExistingEventMedals.length === 0 ? (
                                    <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                                      Nenhuma medalha de evento disponível que não esteja em uso em outro evento ativo. Crie uma nova medalha na aba acima!
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <Label className="text-[11px] font-bold">Selecione uma Medalha Existente</Label>
                                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                        {availableExistingEventMedals.map((m) => {
                                          const rarity = RARITY_INFO[m.rarity];
                                          const isAlreadyAttached = recAttachedMedals.some((a) => a.id === m.id);
                                          return (
                                            <div
                                              key={m.id}
                                              className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-colors ${
                                                isAlreadyAttached ? "opacity-40 bg-muted" : "bg-card hover:border-primary"
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                                  <div className={rarity.textColor}>
                                                    <MedalIcon name={m.iconName} className="h-3.5 w-3.5" />
                                                  </div>
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-bold truncate">{m.title}</span>
                                                    <span className={`text-[8px] font-extrabold uppercase px-1 rounded ${rarity.badgeBgClass}`}>
                                                      {rarity.label}
                                                    </span>
                                                  </div>
                                                  <p className="text-[10px] text-muted-foreground truncate">
                                                    {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                                  </p>
                                                </div>
                                              </div>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={isAlreadyAttached}
                                                onClick={() => {
                                                  const cloned: MedalDefinition = {
                                                    ...m,
                                                    eventName: recTitle.trim() || m.eventName || "Evento Recorrente",
                                                    description: m.description.includes("—")
                                                      ? m.description
                                                      : `${m.title} — Exclusiva do evento "${recTitle.trim() || "Recorrente"}". ${m.description}`,
                                                  };
                                                  setRecAttachedMedals([...recAttachedMedals, cloned]);
                                                  setIsAddingMedalToRec(false);
                                                  flashSaved(`Medalha "${m.title}" vinculada ao evento recorrente!`);
                                                }}
                                                className="rounded-lg text-[10px] font-bold h-7 px-2"
                                              >
                                                {isAlreadyAttached ? "Já Vinculada" : "+ Vincular"}
                                              </Button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingRecurring(false);
                              setEditingRecurringEventId(null);
                            }}
                            className="rounded-xl text-xs"
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" size="sm" className="rounded-xl font-bold text-xs bg-primary">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {editingRecurringEventId ? "Salvar Alterações" : "Salvar Evento Recorrente"}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Lista de Eventos Recorrentes Cadastrados */}
                    <div className="space-y-2">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Eventos Recorrentes Cadastrados ({recurringEvents.length})
                      </h4>

                      {recurringEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          Nenhum evento recorrente configurado. Crie um evento para ser ativado automaticamente nos fins de semana ou dias específicos.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {recurringEvents.map((ev) => {
                            const activeToday = isRecurringEventActive(ev);
                            const dayLabels = (ev.daysOfWeek ?? [])
                              .map((w) => DAYS_OF_WEEK.find((d) => d.value === w)?.short ?? String(w))
                              .join(", ");
                            return (
                              <div
                                key={ev.id}
                                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                                  activeToday
                                    ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm"
                                    : "border-border/60 bg-muted/20 opacity-80"
                                }`}
                              >
                                <div className="min-w-0 space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                        activeToday
                                          ? "bg-emerald-500 text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {activeToday ? "✓ ATIVO HOJE" : "AGUARDANDO DIA PROGRAMADO"}
                                    </span>
                                    <h5 className="font-display text-sm font-black text-foreground truncate">
                                      {ev.title}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleRecurringScope(ev.id)}
                                      title="Clique para alternar o escopo do evento (Todos os Jogos ⇄ Apenas Ranqueada)"
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-all border hover:scale-105 ${
                                        ev.scope === "modo_ranqueado"
                                          ? "bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30"
                                          : "bg-secondary text-muted-foreground border-border/60 hover:text-foreground"
                                      }`}
                                    >
                                      {formatEventScopeText(ev.scope)} ⇄
                                    </button>
                                  </div>

                                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                                    {dayLabels && (
                                      <span>
                                        Dias: <b>{dayLabels}</b>
                                      </span>
                                    )}
                                    {ev.specificDates?.length > 0 && (
                                      <span>
                                        Datas: <b>{ev.specificDates.map(formatDateOnlyBR).join(", ")}</b>
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                    <span className="font-bold text-amber-500 flex items-center gap-1">
                                      <Zap className="h-3.5 w-3.5" />
                                      {renderActiveBonusesLabel(ev)}
                                    </span>
                                    {ev.linkedMedalId && (
                                      <span className="font-medium text-primary flex items-center gap-1">
                                        <Award className="h-3.5 w-3.5" />
                                        Medalha vinculada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartEditRecurringEvent(ev)}
                                    className="rounded-xl text-xs h-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    title="Editar evento recorrente"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={ev.active ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => handleToggleRecurringActive(ev.id)}
                                    className="rounded-xl text-xs h-8"
                                  >
                                    {ev.active ? "Desativar" : "Ativar"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRecurringEvent(ev.id)}
                                    className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10"
                                    title="Excluir evento recorrente"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
  );
}
