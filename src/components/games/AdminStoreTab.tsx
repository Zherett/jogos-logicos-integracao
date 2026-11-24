import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Coins,
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Palette,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import { creditCoinMetrics, MEDAL_COINS_REWARDS } from "@/lib/career-points";
import {
  AVATAR_LETTER_VARIANTS,
  DEFAULT_AVATAR_ID,
  extractCustomAurasForStorage,
  extractCustomAvatarsForStorage,
  getAvatarCategory,
  isSafeCosmeticImageUrl,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  type AuraDefinition,
  type AvatarCategory,
  type AvatarDefinition,
  type AvatarLetterVariant,
} from "@/lib/cosmetics-catalog";
import type { PlatformAdminConfig } from "@/lib/game-codes";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  getActiveAccount,
  getLastAdminCloudSyncError,
  runRetroactiveCoinsAudit,
  syncActiveProfileChangeToPlayFab,
  type RetroactiveCoinsAuditResult,
} from "@/lib/playfab";
import { getAuraPresentation, PlayerAvatarBadge } from "./PlayerAvatarBadge";

interface AdminStoreTabProps {
  draft: PlatformAdminConfig;
  setDraft: (next: PlatformAdminConfig) => void;
  onSaveConfig: (next: PlatformAdminConfig) => Promise<void> | void;
  onShowFeedback?: (msg: string) => void;
}

export function AdminStoreTab({
  draft,
  setDraft,
  onSaveConfig,
  onShowFeedback,
}: AdminStoreTabProps) {
  const auth = usePlayerAuth();
  const [section, setSection] = useState<"economia" | "avatares" | "auras" | "pacotes">("economia");
  const [newAvatarName, setNewAvatarName] = useState("");
  const [newAvatarDesc, setNewAvatarDesc] = useState("");
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [newAvatarPrice, setNewAvatarPrice] = useState(250);
  const [newAvatarFeatured, setNewAvatarFeatured] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarSubcategory, setAvatarSubcategory] = useState<AvatarCategory>("icon");
  const [letterVariantFilter, setLetterVariantFilter] = useState<"all" | AvatarLetterVariant>("all");
  const [letterSearch, setLetterSearch] = useState("");
  const [retroAuditLoading, setRetroAuditLoading] = useState(false);
  const [retroAuditPreview, setRetroAuditPreview] = useState<RetroactiveCoinsAuditResult | null>(null);

  const avatars = useMemo(
    () => mergeWithDefaultAvatars(draft.avatarsCatalog),
    [draft.avatarsCatalog],
  );
  const iconAvatars = useMemo(
    () => avatars.filter((a) => getAvatarCategory(a) === "icon"),
    [avatars],
  );
  const letterAvatars = useMemo(
    () => avatars.filter((a) => getAvatarCategory(a) === "letter"),
    [avatars],
  );
  const filteredLetterAvatars = useMemo(() => {
    const q = letterSearch
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return letterAvatars.filter((av) => {
      if (letterVariantFilter !== "all" && av.letterVariant !== letterVariantFilter) return false;
      if (!q) return true;
      const hay = `${av.letterChar ?? ""} ${av.name} ${av.description}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(q);
    });
  }, [letterAvatars, letterVariantFilter, letterSearch]);
  const auras = useMemo(() => mergeWithDefaultAuras(draft.aurasCatalog), [draft.aurasCatalog]);
  const packs = useMemo(() => mergeWithDefaultCardPacks(draft.cardPacks), [draft.cardPacks]);

  const coinCfg = draft.coinRewardsConfig ?? {};
  const medalCoins = {
    bronze: coinCfg.medalCoinsByRarity?.bronze ?? MEDAL_COINS_REWARDS.bronze,
    prata: coinCfg.medalCoinsByRarity?.prata ?? MEDAL_COINS_REWARDS.prata,
    ouro: coinCfg.medalCoinsByRarity?.ouro ?? MEDAL_COINS_REWARDS.ouro,
    platina: coinCfg.medalCoinsByRarity?.platina ?? MEDAL_COINS_REWARDS.platina,
    diamante: coinCfg.medalCoinsByRarity?.diamante ?? MEDAL_COINS_REWARDS.diamante,
    heroi: coinCfg.medalCoinsByRarity?.heroi ?? MEDAL_COINS_REWARDS.heroi,
    secreta: coinCfg.medalCoinsByRarity?.secreta ?? MEDAL_COINS_REWARDS.secreta,
  };

  async function saveNext(next: PlatformAdminConfig, msg: string) {
    setSaving(true);
    try {
      setDraft(next);
      await onSaveConfig(next);
      const cloudErr = getLastAdminCloudSyncError();
      onShowFeedback?.(
        cloudErr
          ? `⚠️ Salvo apenas localmente — erro ao publicar no PlayFab: ${cloudErr}`
          : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCustomAvatar(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = newAvatarName.trim();
    const cleanUrl = newAvatarUrl.trim();
    if (!cleanName || !cleanUrl) return;
    if (!isSafeCosmeticImageUrl(cleanUrl)) {
      onShowFeedback?.(
        "⚠️ URL de imagem inválida ou insegura. Use apenas links https://, caminhos / ou imagens PNG/JPG/GIF/WEBP (até 16 KB).",
      );
      return;
    }
    const item: AvatarDefinition = {
      id: `avatar_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      description: newAvatarDesc.trim() || "Avatar personalizado criado pelo ADM.",
      imageUrl: cleanUrl,
      priceCoins: Math.max(0, Math.floor(newAvatarPrice || 0)),
      featured: newAvatarFeatured,
      enabled: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    const nextList = [...avatars, item];
    await saveNext(
      { ...draft, avatarsCatalog: extractCustomAvatarsForStorage(nextList) },
      `🖼️ Avatar "${cleanName}" criado na Loja!`,
    );
    setNewAvatarName("");
    setNewAvatarDesc("");
    setNewAvatarUrl("");
    setNewAvatarPrice(250);
  }

  async function handleUpdateAvatar(id: string, patch: Partial<AvatarDefinition>) {
    const nextList = avatars.map((a) => (a.id === id ? { ...a, ...patch } : a));
    await saveNext(
      { ...draft, avatarsCatalog: extractCustomAvatarsForStorage(nextList) },
      "✅ Avatar atualizado na Loja!",
    );
  }

  async function handleDeleteAvatar(id: string) {
    const target = avatars.find((a) => a.id === id);
    if (!window.confirm(`Deseja excluir o avatar customizado "${target?.name ?? id}"?`)) return;
    const nextList = avatars.filter((a) => a.id !== id);
    await saveNext(
      { ...draft, avatarsCatalog: extractCustomAvatarsForStorage(nextList) },
      "🗑️ Avatar customizado removido.",
    );
  }

  async function handleUpdateAura(id: string, patch: Partial<AuraDefinition>) {
    const nextList = auras.map((a) => (a.id === id ? { ...a, ...patch } : a));
    await saveNext(
      { ...draft, aurasCatalog: extractCustomAurasForStorage(nextList) },
      "✅ Aura atualizada na Loja!",
    );
  }

  async function handleUpdatePack(id: string, patch: Partial<CardPackDefinition>) {
    const nextList = packs.map((p) => (p.id === id ? { ...p, ...patch } : p));
    await saveNext({ ...draft, cardPacks: nextList }, "✅ Pacote atualizado na Loja!");
  }

  async function handleGrantSelfTestCoins() {
    if (!auth.profile) return;
    try {
      const liveProfile = getActiveAccount()?.profile ?? auth.profile;
      const nextProf = { ...liveProfile };
      creditCoinMetrics(nextProf, 200);
      await syncActiveProfileChangeToPlayFab(nextProf, { requireServerSync: true });
      await auth.refresh();
      onShowFeedback?.("🪙 +200 moedas adicionadas ao seu perfil (Teste ADM)!");
    } catch (err) {
      onShowFeedback?.(
        `⚠️ ${err instanceof Error && err.message ? err.message : "Erro ao conceder moedas de teste."}`,
      );
    }
  }

  const isShopReleased = Boolean(draft.rolloutFlags?.enableShopForStudents);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-3.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
          isShopReleased
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <div
          className={`flex items-center gap-2 font-bold ${
            isShopReleased
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-amber-800 dark:text-amber-300"
          }`}
        >
          <BadgeDollarSign
            className={`h-4 w-4 shrink-0 ${isShopReleased ? "text-emerald-500" : "text-amber-500"}`}
          />
          <span>
            {isShopReleased
              ? "Loja & Cosméticos Liberada para os Alunos — alterações salvas aqui ficam ativas para toda a rede."
              : "Loja & Cosméticos em Prévia ADM — Apenas administradores visualizam e testam por enquanto."}
          </span>
        </div>
        {auth.profile && (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-500/40 bg-background/80 px-2.5 py-1 font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
              Saldo: 🪙 {auth.profile.coins ?? 0}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleGrantSelfTestCoins()}
              className="h-7 rounded-xl text-[11px] font-bold"
            >
              <Coins className="mr-1 h-3.5 w-3.5 text-amber-500" /> +200 Moedas (Teste ADM)
            </Button>
          </div>
        )}
      </div>

      {/* Sub-navegação em pílulas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-2xl border bg-secondary/40 p-1">
        {(
          [
            { id: "economia", label: "Moedas & Regras", icon: Coins },
            { id: "avatares", label: `Avatares (${avatars.length})`, icon: Palette },
            { id: "auras", label: `Auras (${auras.length})`, icon: Sparkles },
            { id: "pacotes", label: `Pacotes (${packs.length})`, icon: Package },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {section === "economia" && (
        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <div className="font-display text-sm font-black text-foreground">
            Configuração Global de Moedas Ganhas
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold">Tarefa Diária (Moedas)</Label>
              <Input
                type="number"
                min={0}
                value={coinCfg.dailyMissionCoins ?? 5}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    coinRewardsConfig: {
                      ...coinCfg,
                      dailyMissionCoins: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold">Tarefa Semanal (Moedas)</Label>
              <Input
                type="number"
                min={0}
                value={coinCfg.weeklyMissionCoins ?? 10}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    coinRewardsConfig: {
                      ...coinCfg,
                      weeklyMissionCoins: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold">Passo por Nível (Nvl 2 = 1x, Nvl 3 = 2x...)</Label>
              <Input
                type="number"
                min={0}
                value={coinCfg.levelCoinStep ?? 10}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    coinRewardsConfig: {
                      ...coinCfg,
                      levelCoinStep: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="h-9 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-bold">Moedas por Raridade de Medalha</Label>
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
              {(["bronze", "prata", "ouro", "platina", "diamante", "heroi", "secreta"] as const).map((r) => (
                <div key={r} className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{r}</span>
                  <Input
                    type="number"
                    min={0}
                    value={medalCoins[r]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        coinRewardsConfig: {
                          ...coinCfg,
                          medalCoinsByRarity: {
                            ...medalCoins,
                            [r]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          },
                        },
                      })
                    }
                    className="h-8 rounded-xl text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <Button
            type="button"
            disabled={saving}
            onClick={() => void saveNext(draft, "✅ Regras globais de moedas salvas!")}
            className="rounded-xl font-bold gap-1.5"
          >
            <Save className="h-4 w-4" /> Salvar Regras de Moedas
          </Button>

          {/* Retroatribuição de Moedas por Medalhas (Idempotente) */}
          <div className="border-t pt-4 space-y-3">
            <div className="space-y-0.5">
              <div className="font-display text-sm font-black text-foreground flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-amber-500" /> Retroatribuição de Moedas por Medalhas
              </div>
              <p className="text-[11px] text-muted-foreground">
                Calcula e credita moedas retroativamente com base <b>exclusivamente nas medalhas já conquistadas</b> por cada aluno, usando a tabela por raridade acima. É idempotente: nunca paga duas vezes pela mesma medalha.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={retroAuditLoading}
                onClick={async () => {
                  setRetroAuditLoading(true);
                  try {
                    const res = await runRetroactiveCoinsAudit({ dryRun: true, configOverride: draft });
                    setRetroAuditPreview(res);
                    onShowFeedback?.(
                      `🔍 Simulação concluída: ${res.eligibleStudentsCount} aluno(s) receberiam ${res.totalCoinsToAward} moedas no total.`,
                    );
                  } catch (err) {
                    onShowFeedback?.(
                      `⚠️ Erro ao simular retroatribuição: ${err instanceof Error ? err.message : "falha inesperada"}`,
                    );
                  } finally {
                    setRetroAuditLoading(false);
                  }
                }}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
                {retroAuditLoading ? "Calculando..." : "Simular Retroatribuição (Prévia)"}
              </Button>

              <Button
                type="button"
                disabled={retroAuditLoading}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Deseja aplicar a retroatribuição de moedas baseada nas medalhas para todos os alunos elegíveis e sincronizar na nuvem?",
                    )
                  ) {
                    return;
                  }
                  setRetroAuditLoading(true);
                  try {
                    const res = await runRetroactiveCoinsAudit({ dryRun: false, configOverride: draft });
                    setRetroAuditPreview(res);
                    await auth.refresh();
                    onShowFeedback?.(
                      res.cloudSyncError || (res.cloudFailedCount ?? 0) > 0
                        ? `⚠️ Retroatribuição concluída parcialmente (${res.cloudPushedCount} sincronizados, ${res.cloudFailedCount ?? 0} falharam — você pode clicar novamente para reenviar os falhos): ${res.cloudSyncError ?? "erro de rede"}`
                        : `🪙 Retroatribuição aplicada! ${res.eligibleStudentsCount} aluno(s) receberam ${res.totalCoinsToAward} moedas (${res.cloudPushedCount} enviados à nuvem).`,
                    );
                  } catch (err) {
                    onShowFeedback?.(
                      `⚠️ Erro ao aplicar retroatribuição: ${err instanceof Error ? err.message : "falha inesperada"}`,
                    );
                  } finally {
                    setRetroAuditLoading(false);
                  }
                }}
                className="rounded-xl text-xs font-bold gap-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950"
              >
                <Coins className="h-3.5 w-3.5" />
                {retroAuditLoading ? "Aplicando..." : "Aplicar Retroatribuição na Nuvem"}
              </Button>
            </div>

            {retroAuditPreview && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span>
                    {retroAuditPreview.dryRun ? "📋 Prévia (não aplicada)" : "✅ Resultado Aplicado"}
                  </span>
                  <span className="font-mono text-amber-600 dark:text-amber-400">
                    {retroAuditPreview.eligibleStudentsCount} / {retroAuditPreview.scannedCount} alunos • +{retroAuditPreview.totalCoinsToAward} moedas
                  </span>
                </div>
                {retroAuditPreview.students.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum aluno com moedas de medalha pendentes de retroatribuição.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto divide-y divide-border/50 rounded-xl border bg-background/80">
                    {retroAuditPreview.students.slice(0, 30).map((st) => (
                      <div
                        key={st.playerId}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-foreground">{st.nick}</span>
                          <span className="text-muted-foreground ml-1.5">
                            ({st.medalsCount} {st.medalsCount === 1 ? "medalha" : "medalhas"})
                          </span>
                        </div>
                        <span className="font-mono font-black text-amber-600 dark:text-amber-400 shrink-0">
                          {st.coinsBefore} → {st.coinsAfter} (+{st.coinsToAward})
                        </span>
                      </div>
                    ))}
                    {retroAuditPreview.students.length > 30 && (
                      <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground text-center">
                        ... e mais {retroAuditPreview.students.length - 30} aluno(s).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {section === "avatares" && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => void handleCreateCustomAvatar(e)}
            className="rounded-2xl border bg-card p-4 space-y-3"
          >
            <div className="font-display text-sm font-black flex items-center gap-1.5">
              <ImagePlus className="h-4 w-4 text-primary" /> Criar Avatar Customizado (Imagem ou GIF)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Nome do Avatar</Label>
                <Input
                  value={newAvatarName}
                  onChange={(e) => setNewAvatarName(e.target.value)}
                  placeholder="Ex.: Robô Dourado GIF"
                  required
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Link da Imagem / GIF</Label>
                <Input
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  placeholder="https://.../avatar.gif"
                  required
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Descrição</Label>
                <Input
                  value={newAvatarDesc}
                  onChange={(e) => setNewAvatarDesc(e.target.value)}
                  placeholder="Opcional"
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px] font-bold">Preço (Moedas)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newAvatarPrice}
                    onChange={(e) => setNewAvatarPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="h-9 rounded-xl text-xs"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-bold pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAvatarFeatured}
                    onChange={(e) => setNewAvatarFeatured(e.target.checked)}
                  />
                  Destaque
                </label>
              </div>
            </div>
            <Button type="submit" disabled={saving || !newAvatarName.trim() || !newAvatarUrl.trim()} className="rounded-xl font-bold gap-1.5">
              <Plus className="h-4 w-4" /> Criar Avatar na Loja
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/40 p-0.5">
              <button
                type="button"
                onClick={() => setAvatarSubcategory("icon")}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  avatarSubcategory === "icon"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ícones ({iconAvatars.length})
              </button>
              <button
                type="button"
                onClick={() => setAvatarSubcategory("letter")}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  avatarSubcategory === "letter"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Letras ({letterAvatars.length})
              </button>
            </div>

            {avatarSubcategory === "letter" && (
              <div className="flex flex-wrap items-center gap-1.5 flex-1 justify-end min-w-[220px]">
                <div className="relative flex-1 max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={letterSearch}
                    onChange={(e) => setLetterSearch(e.target.value)}
                    placeholder="Pesquisar letra..."
                    className="h-8 rounded-xl pl-8 pr-7 text-xs"
                  />
                  {letterSearch && (
                    <button
                      type="button"
                      onClick={() => setLetterSearch("")}
                      aria-label="Limpar pesquisa"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLetterVariantFilter("all")}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all cursor-pointer ${
                    letterVariantFilter === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/40 text-muted-foreground border-border/60"
                  }`}
                >
                  Todas
                </button>
                {AVATAR_LETTER_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setLetterVariantFilter(v.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all cursor-pointer ${
                      letterVariantFilter === v.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/40 text-muted-foreground border-border/60"
                    }`}
                  >
                    {v.shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
            {(avatarSubcategory === "icon" ? iconAvatars : filteredLetterAvatars).map((av) => (
              <div
                key={av.id}
                className={`flex items-center justify-between gap-2.5 rounded-2xl border bg-card p-3 ${
                  !av.enabled ? "opacity-55" : ""
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <PlayerAvatarBadge avatar={av} size="sm" />
                  <div className="min-w-0">
                    <div className="font-display text-xs font-black truncate">{av.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {av.isDefault && av.priceCoins === 0 ? "Gratuito" : `🪙 ${av.priceCoins} moedas`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {av.id !== DEFAULT_AVATAR_ID && (
                    <Input
                      key={`${av.id}_${av.priceCoins}`}
                      type="number"
                      min={0}
                      defaultValue={av.priceCoins}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        if (v !== av.priceCoins) void handleUpdateAvatar(av.id, { priceCoins: v });
                      }}
                      className="h-7 w-16 rounded-lg text-[11px] text-center"
                      title="Preço em moedas"
                    />
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleUpdateAvatar(av.id, { featured: !av.featured })}
                    className={`h-7 w-7 rounded-lg ${av.featured ? "text-amber-500" : "text-muted-foreground"}`}
                    title="Destacar na loja"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleUpdateAvatar(av.id, { enabled: !av.enabled })}
                    className="h-7 w-7 rounded-lg"
                    title={av.enabled ? "Ocultar" : "Ativar"}
                  >
                    {av.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  {!av.isDefault && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleDeleteAvatar(av.id)}
                      className="h-7 w-7 rounded-lg text-destructive"
                      title="Excluir avatar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "auras" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
          {auras.map((aura) => {
            const pres = getAuraPresentation(aura);
            return (
              <div
                key={aura.id}
                className={`flex items-center justify-between gap-2.5 rounded-2xl border-2 bg-card p-3 ${pres.className} ${
                  !aura.enabled ? "opacity-55" : ""
                }`}
                style={pres.style}
              >
                <div className="min-w-0">
                  <div className="font-display text-xs font-black truncate">{aura.name}</div>
                  <div className="text-[10px] text-muted-foreground">🪙 {aura.priceCoins} moedas</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    key={`${aura.id}_${aura.priceCoins}`}
                    type="number"
                    min={0}
                    defaultValue={aura.priceCoins}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      if (v !== aura.priceCoins) void handleUpdateAura(aura.id, { priceCoins: v });
                    }}
                    className="h-7 w-16 rounded-lg text-[11px] text-center bg-background"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleUpdateAura(aura.id, { featured: !aura.featured })}
                    className={`h-7 w-7 rounded-lg ${aura.featured ? "text-amber-500" : "text-muted-foreground"}`}
                    title="Destacar na loja"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleUpdateAura(aura.id, { enabled: !aura.enabled })}
                    className="h-7 w-7 rounded-lg"
                  >
                    {aura.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {section === "pacotes" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {packs.map((pack) => {
            const visibleInStore = pack.showInStore !== false;
            return (
            <div
              key={pack.id}
              className={`flex items-center justify-between gap-2.5 rounded-2xl border bg-card p-3 ${
                !pack.enabled || !visibleInStore ? "opacity-55" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="font-display text-xs font-black truncate">{pack.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {pack.cardsPerPack} cartas • 🪙 {pack.priceCoins ?? 40} moedas
                  {!visibleInStore ? " • Oculto na Loja" : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Input
                  key={`${pack.id}_${pack.priceCoins ?? 40}`}
                  type="number"
                  min={1}
                  defaultValue={pack.priceCoins ?? 40}
                  onBlur={(e) => {
                    const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    if (v !== pack.priceCoins) void handleUpdatePack(pack.id, { priceCoins: v });
                  }}
                  className="h-7 w-16 rounded-lg text-[11px] text-center"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleUpdatePack(pack.id, { featuredInStore: !pack.featuredInStore })}
                  className={`h-7 w-7 rounded-lg ${pack.featuredInStore ? "text-amber-500" : "text-muted-foreground"}`}
                  title="Destacar na loja"
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleUpdatePack(pack.id, { showInStore: !visibleInStore })}
                  className="h-7 w-7 rounded-lg"
                  title={visibleInStore ? "Ocultar da loja" : "Exibir na loja"}
                >
                  {visibleInStore ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
