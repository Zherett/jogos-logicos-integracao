import { useState } from "react";
import { Calendar, CheckCircle2, Eye, Flame, Gift, RotateCcw, Save, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DAYS_OF_WEEK } from "@/lib/custom-events";
import { mergeWithDefaultChests } from "@/lib/chests-catalog";
import {
  DAILY_REWARDS_SCHEDULE,
  DAILY_STREAK_BONUS_CAP,
  DAILY_STREAK_BONUS_STEP,
  DEFAULT_DAY7_CHEST_ID,
  resolveDailyRewardsSchedule,
} from "@/lib/daily-rewards";
import { DEFAULT_DAILY_MISSION_COINS } from "@/lib/daily-missions";
import { DEFAULT_WEEKLY_MISSION_COINS } from "@/lib/weekly-missions";
import type { PlatformAdminConfig } from "@/lib/game-codes";
import {
  getLastAdminCloudSyncError,
  runRetroactiveDay1CheckInAudit,
  type RetroactiveDay1AuditResult,
} from "@/lib/playfab";

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
  const [retroDay1Loading, setRetroDay1Loading] = useState(false);
  const [retroDay1GrantRewards, setRetroDay1GrantRewards] = useState(true);
  const [retroDay1Preview, setRetroDay1Preview] = useState<RetroactiveDay1AuditResult | null>(null);

  const routine = draft.weeklyRoutineConfig ?? {};
  const rollout = draft.rolloutFlags ?? {};
  const availableChests = mergeWithDefaultChests(draft.chestsCatalog).filter((c) => c.enabled !== false);
  const selectedDay7ChestId = routine.day7ChestId || DEFAULT_DAY7_CHEST_ID;
  const tiers = resolveDailyRewardsSchedule(routine, draft.chestsCatalog);
  const dailyOverrides = routine.dailyMissionOverrides ?? {};
  const weeklyOverrides = routine.weeklyMissionOverrides ?? {};
  const globalDailyMissionCoins = draft.coinRewardsConfig?.dailyMissionCoins ?? DEFAULT_DAILY_MISSION_COINS;
  const globalWeeklyMissionCoins = draft.coinRewardsConfig?.weeklyMissionCoins ?? DEFAULT_WEEKLY_MISSION_COINS;

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
      const cloudErr = getLastAdminCloudSyncError();
      onShowFeedback?.(
        cloudErr
          ? `⚠️ Salvo apenas localmente — erro ao publicar no PlayFab: ${cloudErr}`
          : "✅ Rotina Semanal & Diária salva como verdade absoluta na nuvem!",
      );
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
        day7ChestId: DEFAULT_DAY7_CHEST_ID,
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
    const cloudErr = getLastAdminCloudSyncError();
    onShowFeedback?.(
      cloudErr
        ? `⚠️ Padrões restaurados apenas localmente — erro ao publicar no PlayFab: ${cloudErr}`
        : "🔄 Rotina restaurada para os padrões (com moedas zeradas).",
    );
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

          <div className="border-t pt-3 space-y-2">
            <div className="font-display text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5" /> Baú Especial do 7º Dia da Semana
            </div>
            <p className="text-[11px] text-muted-foreground">
              Escolha qual baú do catálogo (padrão ou criado na aba Baús) será entregue ao aluno ao completar o 7º dia do ciclo.
            </p>
            <select
              value={selectedDay7ChestId}
              onChange={(e) => updateRoutine({ day7ChestId: e.target.value })}
              className="h-9 w-full sm:max-w-md rounded-xl border border-emerald-500/40 bg-background px-3 text-xs font-bold"
            >
              {availableChests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.rarity.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Retrocoleta do Dia 1 (Segunda-feira • Alunos logados nos últimos 3 dias) */}
          <div className="border-t pt-4 space-y-3">
            <div className="space-y-0.5">
              <div className="font-display text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Retrocoleta do Dia 1 (Alunos Ativos nos Últimos 3 Dias)
              </div>
              <p className="text-[11px] text-muted-foreground">
                Marca o <b>Dia 1 (Segunda-feira)</b> como coletado para alunos que entraram nos últimos 3 dias e ainda não iniciaram a trilha, liberando o <b>Dia 2</b> para coleta manual hoje. 100% idempotente.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={retroDay1GrantRewards}
                onChange={(e) => setRetroDay1GrantRewards(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Creditar também os prêmios faltantes do Dia 1 (XP/moedas e pontos apenas se não recebeu login ontem)
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={retroDay1Loading}
                onClick={async () => {
                  setRetroDay1Loading(true);
                  try {
                    const res = await runRetroactiveDay1CheckInAudit({
                      dryRun: true,
                      grantMissingRewards: retroDay1GrantRewards,
                    });
                    setRetroDay1Preview(res);
                    onShowFeedback?.(
                      `🔍 Simulação Dia 1: ${res.eligibleStudentsCount} de ${res.scannedCount} aluno(s) elegíveis (ativos nos últimos 3 dias).`,
                    );
                  } finally {
                    setRetroDay1Loading(false);
                  }
                }}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
                {retroDay1Loading ? "Analisando..." : "Simular Retrocoleta Dia 1"}
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={retroDay1Loading}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Deseja aplicar a retrocoleta do Dia 1 para todos os alunos ativos nos últimos 3 dias e enviar para a nuvem PlayFab?",
                    )
                  ) {
                    return;
                  }
                  setRetroDay1Loading(true);
                  try {
                    const res = await runRetroactiveDay1CheckInAudit({
                      dryRun: false,
                      grantMissingRewards: retroDay1GrantRewards,
                    });
                    setRetroDay1Preview(res);
                    onShowFeedback?.(
                      res.cloudSyncError || (res.cloudFailedCount ?? 0) > 0
                        ? `⚠️ Retrocoleta Dia 1 aplicada localmente (${res.eligibleStudentsCount} aluno(s)), mas ${res.cloudFailedCount ?? 0} registro(s) falharam ao enviar à nuvem (${res.cloudPushedCount} sincronizados): ${res.cloudSyncError ?? "erro de rede"}`
                        : `✅ Retrocoleta Dia 1 aplicada! ${res.eligibleStudentsCount} aluno(s) atualizados (${res.cloudPushedCount} enviados à nuvem).`,
                    );
                  } finally {
                    setRetroDay1Loading(false);
                  }
                }}
                className="rounded-xl text-xs font-bold gap-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {retroDay1Loading ? "Aplicando..." : "Aplicar Retrocoleta Dia 1 na Nuvem"}
              </Button>
            </div>

            {retroDay1Preview && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span>
                    {retroDay1Preview.dryRun ? "📋 Prévia Dia 1 (não aplicada)" : "✅ Retrocoleta Dia 1 Aplicada"}
                  </span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">
                    {retroDay1Preview.eligibleStudentsCount} / {retroDay1Preview.scannedCount} alunos
                    {retroDay1Preview.totalPointsToAward > 0 ? ` • +${retroDay1Preview.totalPointsToAward} pts` : ""}
                    {retroDay1Preview.totalXpToAward > 0 ? ` • +${retroDay1Preview.totalXpToAward} XP` : ""}
                    {retroDay1Preview.totalCoinsToAward > 0 ? ` • +${retroDay1Preview.totalCoinsToAward} moedas` : ""}
                  </span>
                </div>
                {retroDay1Preview.students.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum aluno elegível pendente para retrocoleta do Dia 1.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto divide-y divide-border/50 rounded-xl border bg-background/80">
                    {retroDay1Preview.students.slice(0, 30).map((st) => (
                      <div
                        key={st.playerId}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-foreground">{st.nick}</span>
                          <span className="text-muted-foreground ml-1.5">
                            (Últ. acesso: {st.latestActivityDate ?? "—"})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          Dia 1 ✅ → Dia 2 Hoje
                        </span>
                      </div>
                    ))}
                    {retroDay1Preview.students.length > 30 && (
                      <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground text-center">
                        ... e mais {retroDay1Preview.students.length - 30} aluno(s).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chaves de Liberação para Alunos Comuns (rolloutFlags) */}
          <div className="border-t pt-4 space-y-3">
            <div className="space-y-0.5">
              <div className="font-display text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Chaves de Liberação para Alunos Comuns
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tudo começa <b>desligado (somente ADM)</b>. Ative os módulos abaixo e clique em <b>Salvar Tudo</b> somente quando finalizar os testes e as retroatribuições.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  {
                    key: "enableDailyRoutineForStudents",
                    label: "Central Diária & Missões",
                    desc: "Libera trilha de 7 dias, Baú do Dia 7, 5 missões diárias e 4 semanais.",
                  },
                  {
                    key: "enableCoinsWalletForStudents",
                    label: "Saldo de Moedas no Perfil",
                    desc: "Exibe a carteira de moedas dos alunos no perfil.",
                  },
                  {
                    key: "enableDefaultAvatarForStudents",
                    label: "Avatar Padrão (Perfil & Ranking)",
                    desc: "Exibe o avatar dos alunos no perfil, topo e ranking.",
                  },
                  {
                    key: "enableShopForStudents",
                    label: "Loja, Inventário & Personalização",
                    desc: "Libera Loja de Moedas, Pacotes/Cartas, Baús, Álbum e Personalizar Perfil.",
                  },
                ] as const
              ).map((item) => {
                const checked = Boolean(rollout[item.key]);
                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
                      checked
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-border/70 bg-secondary/20"
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-black text-foreground">{item.label}</div>
                      <div className="text-[10.5px] text-muted-foreground leading-snug">
                        {item.desc}
                      </div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(val) =>
                        setDraft({
                          ...draft,
                          rolloutFlags: {
                            ...rollout,
                            [item.key]: val,
                          },
                        })
                      }
                    />
                  </div>
                );
              })}
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
                    Moedas (Padrão {globalDailyMissionCoins})
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(globalDailyMissionCoins)}
                    value={ov.coins ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const nextOv = { ...ov };
                      if (raw === "") {
                        delete nextOv.coins;
                      } else {
                        nextOv.coins = Math.max(0, Number(raw) || 0);
                      }
                      updateRoutine({
                        dailyMissionOverrides: {
                          ...dailyOverrides,
                          [tpl.key]: nextOv,
                        },
                      });
                    }}
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
                    Moedas (Padrão {globalWeeklyMissionCoins})
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(globalWeeklyMissionCoins)}
                    value={ov.coins ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const nextOv = { ...ov };
                      if (raw === "") {
                        delete nextOv.coins;
                      } else {
                        nextOv.coins = Math.max(0, Number(raw) || 0);
                      }
                      updateRoutine({
                        weeklyMissionOverrides: {
                          ...weeklyOverrides,
                          [tpl.key]: nextOv,
                        },
                      });
                    }}
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
