import { useState } from "react";
import { Calendar, CheckCircle2, Flame, RotateCcw, Save, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAYS_OF_WEEK } from "@/lib/custom-events";
import {
  DAILY_REWARDS_SCHEDULE,
  DAILY_STREAK_BONUS_CAP,
  DAILY_STREAK_BONUS_STEP,
  resolveDailyRewardsSchedule,
} from "@/lib/daily-rewards";
import type { PlatformAdminConfig } from "@/lib/game-codes";

interface AdminRoutineTabProps {
  draft: PlatformAdminConfig;
  setDraft: (next: PlatformAdminConfig) => void;
  onSaveConfig: (next: PlatformAdminConfig) => Promise<void> | void;
  onShowFeedback?: (msg: string) => void;
}

const DEFAULT_DAILY_MISSION_TEMPLATES = [
  { key: "plays", label: "Partidas Diárias (Aquecimento / Maratona)", target: 3, points: 20, xp: 20 },
  { key: "wins", label: "Vitórias Diárias (Vitória Inicial / Domínio)", target: 2, points: 25, xp: 25 },
  { key: "distinct", label: "Jogos Diferentes no Dia", target: 2, points: 25, xp: 30 },
  { key: "flawless", label: "Partida Perfeita (Zero Erros)", target: 1, points: 35, xp: 35 },
  { key: "competitive", label: "Espírito Competitivo (X1 / Ranqueada)", target: 1, points: 45, xp: 45 },
  { key: "personal", label: "Desafio Pessoal (Jogo Menos Jogado)", target: 2, points: 40, xp: 40 },
] as const;

const DEFAULT_WEEKLY_MISSION_TEMPLATES = [
  { key: "weekly_matches", label: "Partidas na Semana", target: 20, points: 100, xp: 100 },
  { key: "weekly_distinct_games", label: "Jogos Diferentes na Semana", target: 4, points: 110, xp: 110 },
  { key: "weekly_xp", label: "XP Acumulado na Semana", target: 800, points: 120, xp: 120 },
  { key: "weekly_daily_missions", label: "Missões Diárias Concluídas na Semana", target: 8, points: 130, xp: 130 },
  { key: "weekly_ranked_ranks", label: "Subir Ranks na Ranqueada", target: 2, points: 150, xp: 150 },
  { key: "weekly_ranked_matches", label: "Partidas Ranqueadas (Rank Máximo)", target: 8, points: 150, xp: 150 },
] as const;

export function AdminRoutineTab({
  draft,
  setDraft,
  onSaveConfig,
  onShowFeedback,
}: AdminRoutineTabProps) {
  const [subTab, setSubTab] = useState<"semana" | "diarias" | "missoes_d" | "missoes_s">("semana");
  const [saving, setSaving] = useState(false);

  const routine = draft.weeklyRoutineConfig ?? {};
  const tiers = resolveDailyRewardsSchedule(routine);
  const dailyOverrides = routine.dailyMissionOverrides ?? {};
  const weeklyOverrides = routine.weeklyMissionOverrides ?? {};

  function updateRoutine(patch: NonNullable<PlatformAdminConfig["weeklyRoutineConfig"]>) {
    setDraft({
      ...draft,
      weeklyRoutineConfig: {
        ...routine,
        ...patch,
      },
    });
  }

  function updateTier(day: number, field: "title" | "points" | "xp" | "coins", value: string | number) {
    const nextTiers = tiers.map((t) => {
      if (t.day !== day) return { day: t.day, title: t.title, points: t.points, xp: t.xp, coins: t.coins ?? 0 };
      if (field === "title") {
        return { day: t.day, title: String(value), points: t.points, xp: t.xp, coins: t.coins ?? 0 };
      }
      return {
        day: t.day,
        title: t.title,
        points: field === "points" ? Math.max(0, Number(value) || 0) : t.points,
        xp: field === "xp" ? Math.max(0, Number(value) || 0) : t.xp,
        coins: field === "coins" ? Math.max(0, Number(value) || 0) : (t.coins ?? 0),
      };
    });
    updateRoutine({ dailyTiers: nextTiers });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveConfig(draft);
      onShowFeedback?.("✅ Rotina Semanal & Diária salva como verdade absoluta na nuvem!");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetDefaults() {
    const nextCfg: PlatformAdminConfig = {
      ...draft,
      weeklyRoutineConfig: {
        weekStartDay: 1,
        weekEndDay: 0,
        dailyLoginCoins: 0,
        streakPointsStep: DAILY_STREAK_BONUS_STEP,
        streakPointsCap: DAILY_STREAK_BONUS_CAP,
        streakXpStep: 0,
        streakCoinsStep: 0,
        streakCoinsCap: 0,
        dailyTiers: DAILY_REWARDS_SCHEDULE.map((t) => ({
          day: t.day,
          title: t.title,
          points: t.points,
          xp: t.xp,
          coins: 0,
        })),
        dailyMissionOverrides: {},
        weeklyMissionOverrides: {},
      },
    };
    setDraft(nextCfg);
    await onSaveConfig(nextCfg);
    onShowFeedback?.("🔄 Rotina restaurada para os padrões (com moedas zeradas).");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-sm font-black text-foreground">
            Rotina Semanal &amp; Diária (Verdade Absoluta da Semana)
          </div>
          <p className="text-muted-foreground mt-0.5">
            Define o início/fim da semana, prêmios diários, combos de ofensiva e missões. Se nada for alterado na virada da semana, o padrão se repete automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleResetDefaults()}
            className="h-8 rounded-xl text-xs font-bold gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar Padrões
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
            className="h-8 rounded-xl text-xs font-bold gap-1"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar Tudo"}
          </Button>
        </div>
      </div>

      {/* Sub-abas em pílula */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-2xl border bg-secondary/40 p-1">
        {(
          [
            { id: "semana", label: "Semana & Ofensiva", icon: Calendar },
            { id: "diarias", label: "Trilha 7 Dias", icon: Flame },
            { id: "missoes_d", label: "Missões Diárias", icon: CheckCircle2 },
            { id: "missoes_s", label: "Missões Semanais", icon: Trophy },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === "semana" && (
        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Dia de Início da Semana (00:00)</Label>
              <select
                value={routine.weekStartDay ?? 1}
                onChange={(e) => updateRoutine({ weekStartDay: Number(e.target.value) })}
                className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">Dia de Término da Semana (23:59)</Label>
              <select
                value={routine.weekEndDay ?? 0}
                onChange={(e) => updateRoutine({ weekEndDay: Number(e.target.value) })}
                className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="font-display text-xs font-black uppercase tracking-wider text-muted-foreground">
              Bônus de Login Diário e Combo de Ofensiva
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Moedas por Login Diário</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.dailyLoginCoins ?? 0}
                  onChange={(e) => updateRoutine({ dailyLoginCoins: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Ofensiva: Passo Pontos</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.streakPointsStep ?? DAILY_STREAK_BONUS_STEP}
                  onChange={(e) => updateRoutine({ streakPointsStep: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Ofensiva: Teto Pontos</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.streakPointsCap ?? DAILY_STREAK_BONUS_CAP}
                  onChange={(e) => updateRoutine({ streakPointsCap: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Ofensiva: Passo XP</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.streakXpStep ?? 0}
                  onChange={(e) => updateRoutine({ streakXpStep: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Ofensiva: Passo Moedas</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.streakCoinsStep ?? 0}
                  onChange={(e) => updateRoutine({ streakCoinsStep: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Ofensiva: Teto Moedas</Label>
                <Input
                  type="number"
                  min={0}
                  value={routine.streakCoinsCap ?? 0}
                  onChange={(e) => updateRoutine({ streakCoinsCap: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === "diarias" && (
        <div className="space-y-2.5">
          {tiers.map((t) => (
            <div
              key={t.day}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center rounded-2xl border bg-card p-3"
            >
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-[10px] font-black uppercase text-primary">Dia {t.day}</Label>
                <Input
                  value={t.title}
                  onChange={(e) => updateTier(t.day, "title", e.target.value)}
                  className="h-8 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[10px] font-bold">Pontos</Label>
                <Input
                  type="number"
                  min={0}
                  value={t.points}
                  onChange={(e) => updateTier(t.day, "points", e.target.value)}
                  className="h-8 rounded-lg text-xs"
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-[10px] font-bold">XP</Label>
                <Input
                  type="number"
                  min={0}
                  value={t.xp}
                  onChange={(e) => updateTier(t.day, "xp", e.target.value)}
                  className="h-8 rounded-lg text-xs"
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Moedas (Padrão 0)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={t.coins ?? 0}
                  onChange={(e) => updateTier(t.day, "coins", e.target.value)}
                  className="h-8 rounded-lg text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === "missoes_d" && (
        <div className="space-y-2.5">
          {DEFAULT_DAILY_MISSION_TEMPLATES.map((tpl) => {
            const ov = dailyOverrides[tpl.key] ?? {};
            return (
              <div
                key={tpl.key}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center rounded-2xl border bg-card p-3"
              >
                <div className="sm:col-span-4 font-display text-xs font-black text-foreground">
                  {tpl.label}
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">Meta</Label>
                  <Input
                    type="number"
                    min={1}
                    value={ov.target ?? tpl.target}
                    onChange={(e) =>
                      updateRoutine({
                        dailyMissionOverrides: {
                          ...dailyOverrides,
                          [tpl.key]: { ...ov, target: Math.max(1, Number(e.target.value) || 1) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">Pontos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.points ?? tpl.points}
                    onChange={(e) =>
                      updateRoutine({
                        dailyMissionOverrides: {
                          ...dailyOverrides,
                          [tpl.key]: { ...ov, points: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">XP</Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.xp ?? tpl.xp}
                    onChange={(e) =>
                      updateRoutine({
                        dailyMissionOverrides: {
                          ...dailyOverrides,
                          [tpl.key]: { ...ov, xp: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    Moedas
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.coins ?? 0}
                    onChange={(e) =>
                      updateRoutine({
                        dailyMissionOverrides: {
                          ...dailyOverrides,
                          [tpl.key]: { ...ov, coins: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === "missoes_s" && (
        <div className="space-y-2.5">
          {DEFAULT_WEEKLY_MISSION_TEMPLATES.map((tpl) => {
            const ov = weeklyOverrides[tpl.key] ?? {};
            return (
              <div
                key={tpl.key}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center rounded-2xl border bg-card p-3"
              >
                <div className="sm:col-span-4 font-display text-xs font-black text-foreground">
                  {tpl.label}
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">Meta</Label>
                  <Input
                    type="number"
                    min={1}
                    value={ov.target ?? tpl.target}
                    onChange={(e) =>
                      updateRoutine({
                        weeklyMissionOverrides: {
                          ...weeklyOverrides,
                          [tpl.key]: { ...ov, target: Math.max(1, Number(e.target.value) || 1) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">Pontos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.points ?? tpl.points}
                    onChange={(e) =>
                      updateRoutine({
                        weeklyMissionOverrides: {
                          ...weeklyOverrides,
                          [tpl.key]: { ...ov, points: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold">XP</Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.xp ?? tpl.xp}
                    onChange={(e) =>
                      updateRoutine({
                        weeklyMissionOverrides: {
                          ...weeklyOverrides,
                          [tpl.key]: { ...ov, xp: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    Moedas
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={ov.coins ?? 0}
                    onChange={(e) =>
                      updateRoutine({
                        weeklyMissionOverrides: {
                          ...weeklyOverrides,
                          [tpl.key]: { ...ov, coins: Math.max(0, Number(e.target.value) || 0) },
                        },
                      })
                    }
                    className="h-8 rounded-lg text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
