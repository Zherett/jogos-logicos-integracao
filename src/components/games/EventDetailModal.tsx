import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Calendar,
  Zap,
  Clock,
  Award,
  Target,
  Trophy,
  Coins,
  ShieldAlert,
} from "lucide-react";
import {
  type SpecialEvent,
  type RecurringEvent,
  isEventActive,
  isRecurringEventActive,
  formatEventRemainingTime,
  formatDateTimeBR,
  formatDateOnlyBR,
  formatEventScopeText,
  DAYS_OF_WEEK,
} from "@/lib/custom-events";
import { getAllAvailableMedals, RARITY_INFO } from "@/lib/medals-catalog";
import { MedalIcon } from "./MedalIcon";

interface EventDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: (SpecialEvent | RecurringEvent) | null;
  fallbackTitle?: string;
}

export function EventDetailModal({
  open,
  onOpenChange,
  event,
  fallbackTitle,
}: EventDetailModalProps) {
  if (!event && !fallbackTitle) return null;

  const isSpecial = event && "startsAt" in event;
  const isRecurring = event && "daysOfWeek" in event;

  const isActiveNow = event
    ? isSpecial
      ? isEventActive(event as SpecialEvent)
      : isRecurringEventActive(event as RecurringEvent)
    : false;

  const title = event?.title || fallbackTitle || "Evento Especial";
  const desc = event?.description || "Detalhes e bônus aplicados durante o período deste evento oficial.";

  // Medalha vinculada
  const linkedId = event?.linkedMedalId || (event?.linkedMedalIds && event.linkedMedalIds[0]);
  const linkedMedal = linkedId
    ? getAllAvailableMedals().find((m) => m.id === linkedId)
    : null;

  // Dias da semana para recorrentes
  const recurringDaysText = isRecurring
    ? ((event as RecurringEvent).daysOfWeek ?? [])
        .map((w) => DAYS_OF_WEEK.find((d) => d.value === w)?.short ?? String(w))
        .join(", ")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-6 shadow-2xl border-2 border-amber-500/30">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                isActiveNow
                  ? "bg-amber-500 text-zinc-950 animate-pulse shadow-xs"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isActiveNow ? "⚡ AO VIVO / ATIVO" : "PROGRAMADO / AGUARDANDO"}
            </span>

            {event && (
              <span className="rounded-full bg-secondary border px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                {formatEventScopeText(event.scope)}
              </span>
            )}
          </div>

          <DialogTitle className="font-display text-lg sm:text-xl font-black text-foreground pt-1 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <span>{title}</span>
          </DialogTitle>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            {desc}
          </p>
        </DialogHeader>

        {event && (
          <div className="space-y-4 pt-2">
            {/* GRADE DE BÔNUS E MULTIPLICADORES */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Bônus e Turbinadores do Evento:
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {event.xpMultiplier && event.xpMultiplier > 1 ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-2.5">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase block">
                      Multiplicador de XP
                    </span>
                    <span className="font-display text-sm font-black text-foreground">
                      {event.xpMultiplier}x de XP (+{Math.round((event.xpMultiplier - 1) * 100)}%)
                    </span>
                  </div>
                ) : null}

                {event.rankedMultiplier && event.rankedMultiplier > 1 ? (
                  <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-2.5">
                    <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase block">
                      Torneio Ranqueado
                    </span>
                    <span className="font-display text-sm font-black text-foreground">
                      {event.rankedMultiplier}x Pontos Ranqueados
                    </span>
                  </div>
                ) : null}

                {event.pointsMultiplier && event.pointsMultiplier > 1 ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">
                      Pontos &amp; Conquistas
                    </span>
                    <span className="font-display text-sm font-black text-foreground">
                      {event.pointsMultiplier}x Pontos de Carreira
                    </span>
                  </div>
                ) : null}

                {event.dailyXpCap && event.dailyXpCap > 1000 ? (
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 p-2.5">
                    <span className="text-[10px] font-bold text-primary uppercase block">
                      Limite Diário Geral
                    </span>
                    <span className="font-display text-sm font-black text-foreground">
                      {event.dailyXpCap.toLocaleString("pt-BR")} XP/dia
                    </span>
                  </div>
                ) : null}

                {event.matchXpCap && event.matchXpCap > 20 ? (
                  <div className="rounded-2xl border border-border bg-secondary/30 p-2.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                      Teto por Partida
                    </span>
                    <span className="font-display text-sm font-black text-foreground">
                      Até {event.matchXpCap} XP/partida
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* VIGÊNCIA / CALENDÁRIO */}
            <div className="rounded-2xl border bg-secondary/20 p-3 space-y-1.5 text-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Período de Ativação:
              </span>

              {isSpecial && (
                <div className="space-y-0.5 text-muted-foreground">
                  <p>
                    Válido de <b>{formatDateTimeBR((event as SpecialEvent).startsAt)}</b> até <b>{formatDateTimeBR((event as SpecialEvent).endsAt)}</b>
                  </p>
                  <p className="flex items-center gap-1 text-amber-500 font-bold">
                    <Clock className="h-3 w-3" />
                    Tempo: {isActiveNow ? formatEventRemainingTime((event as SpecialEvent).endsAt) : "Encerrado"}
                  </p>
                </div>
              )}

              {isRecurring && (
                <div className="space-y-0.5 text-muted-foreground">
                  {recurringDaysText && (
                    <p>
                      Ativado automaticamente nos dias: <b>{recurringDaysText}</b>
                    </p>
                  )}
                  {(event as RecurringEvent).specificDates?.length > 0 && (
                    <p>
                      Datas especiais: <b>{(event as RecurringEvent).specificDates.map(formatDateOnlyBR).join(", ")}</b>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* MEDALHA VINCULADA (SE HOUVER) */}
            {linkedMedal && (
              <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-3 flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20">
                  <MedalIcon name={linkedMedal.iconName} className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Medalha do Evento
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground">
                      • {RARITY_INFO[linkedMedal.rarity]?.label ?? linkedMedal.rarity}
                    </span>
                  </div>
                  <h4 className="font-display text-xs font-black text-foreground truncate">
                    {linkedMedal.title}
                  </h4>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {linkedMedal.description}
                  </p>
                </div>
              </div>
            )}

            {/* OBJETIVO / MISSÃO (SE HOUVER) */}
            {event.objectiveDescription && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                <span className="font-bold text-primary flex items-center gap-1 text-[11px]">
                  <Target className="h-3.5 w-3.5" /> Missão do Evento:
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  {event.objectiveDescription}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl font-bold text-xs h-9 px-5 bg-primary cursor-pointer"
          >
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
