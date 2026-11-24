import { useMemo, useState } from "react";
import {
  Check,
  Coins,
  Eye,
  EyeOff,
  Gift,
  Package,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChestOpeningModal } from "@/components/games/ChestOpeningModal";
import { ChestVector } from "@/components/games/ChestVector";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import {
  CHEST_RARITIES,
  CHEST_RARITY_META,
  CHEST_SHAPES,
  DEFAULT_CHEST_METAL_COLOR,
  DEFAULT_CHEST_OPEN_DURATION_MS,
  DEFAULT_CHEST_PRIMARY_COLOR,
  mergeWithDefaultChests,
  openChest,
  type ChestCardPackDrop,
  type ChestDefinition,
  type ChestOpenOutcome,
  type ChestRarity,
  type ChestShape,
} from "@/lib/chests-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  getActiveAccount,
  getLastAdminCloudSyncError,
  syncActiveProfileChangeToPlayFab,
} from "@/lib/playfab";

interface AdminChestsTabProps {
  chestsCatalog?: ChestDefinition[];
  cardPacks?: CardPackDefinition[];
  onSaveChests: (next: ChestDefinition[]) => Promise<void> | void;
  onShowFeedback?: (msg: string) => void;
}

export function AdminChestsTab({
  chestsCatalog,
  cardPacks,
  onSaveChests,
  onShowFeedback,
}: AdminChestsTabProps) {
  const auth = usePlayerAuth();
  const chests = useMemo(() => mergeWithDefaultChests(chestsCatalog), [chestsCatalog]);
  const packs = useMemo(
    () => mergeWithDefaultCardPacks(cardPacks).filter((p) => p.enabled),
    [cardPacks],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rarity, setRarity] = useState<ChestRarity>("rara");
  const [ptsMin, setPtsMin] = useState(30);
  const [ptsMax, setPtsMax] = useState(80);
  const [xpMin, setXpMin] = useState(40);
  const [xpMax, setXpMax] = useState(100);
  const [coinsMin, setCoinsMin] = useState(20);
  const [coinsMax, setCoinsMax] = useState(60);
  const [packDrops, setPackDrops] = useState<ChestCardPackDrop[]>([]);
  const [packId, setPackId] = useState<string>(packs[0]?.id ?? "");
  const [packQty, setPackQty] = useState(1);
  const [packChance, setPackChance] = useState(100);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_CHEST_PRIMARY_COLOR);
  const [metalColor, setMetalColor] = useState(DEFAULT_CHEST_METAL_COLOR);
  const [shape, setShape] = useState<ChestShape>("padrao");
  const [openDurationMs, setOpenDurationMs] = useState(DEFAULT_CHEST_OPEN_DURATION_MS);
  const [saving, setSaving] = useState(false);

  const [simChest, setSimChest] = useState<ChestDefinition | null>(null);
  const [simOutcome, setSimOutcome] = useState<ChestOpenOutcome | null>(null);

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setRarity("rara");
    setPtsMin(30);
    setPtsMax(80);
    setXpMin(40);
    setXpMax(100);
    setCoinsMin(20);
    setCoinsMax(60);
    setPackDrops([]);
    setPackId(packs[0]?.id ?? "");
    setPackQty(1);
    setPackChance(100);
    setPrimaryColor(DEFAULT_CHEST_PRIMARY_COLOR);
    setMetalColor(DEFAULT_CHEST_METAL_COLOR);
    setShape("padrao");
    setOpenDurationMs(DEFAULT_CHEST_OPEN_DURATION_MS);
  }

  function startEdit(c: ChestDefinition) {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description);
    setRarity(c.rarity);
    setPtsMin(c.rewards.points?.min ?? 0);
    setPtsMax(c.rewards.points?.max ?? 0);
    setXpMin(c.rewards.xp?.min ?? 0);
    setXpMax(c.rewards.xp?.max ?? 0);
    setCoinsMin(c.rewards.coins?.min ?? 0);
    setCoinsMax(c.rewards.coins?.max ?? 0);
    setPackDrops(
      Array.isArray(c.rewards.cardPacks)
        ? c.rewards.cardPacks.map((d) => ({ ...d }))
        : [],
    );
    setPackId(packs[0]?.id ?? "");
    setPackQty(1);
    setPackChance(100);
    setPrimaryColor(c.primaryColor ?? DEFAULT_CHEST_PRIMARY_COLOR);
    setMetalColor(c.metalColor ?? DEFAULT_CHEST_METAL_COLOR);
    setShape(c.shape ?? "padrao");
    setOpenDurationMs(c.openDurationMs ?? DEFAULT_CHEST_OPEN_DURATION_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const existing = editingId ? chests.find((c) => c.id === editingId) : undefined;
      const nextChest: ChestDefinition = {
        id: editingId ?? `chest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        description: description.trim() || "Baú de recompensas configurado pelo ADM.",
        rarity,
        primaryColor,
        metalColor,
        shape,
        openDurationMs,
        isDefault: existing?.isDefault,
        enabled: existing?.enabled ?? true,
        rewards: {
          ...(Math.max(ptsMin, ptsMax) > 0
            ? { points: { min: Math.min(ptsMin, ptsMax), max: Math.max(ptsMin, ptsMax) } }
            : {}),
          ...(Math.max(xpMin, xpMax) > 0
            ? { xp: { min: Math.min(xpMin, xpMax), max: Math.max(xpMin, xpMax) } }
            : {}),
          ...(Math.max(coinsMin, coinsMax) > 0
            ? { coins: { min: Math.min(coinsMin, coinsMax), max: Math.max(coinsMin, coinsMax) } }
            : {}),
          ...(packDrops.length > 0
            ? {
                cardPacks: packDrops
                  .filter((d) => d.packId && d.quantity > 0 && d.chancePercent > 0)
                  .map((d) => ({
                    packId: d.packId,
                    quantity: Math.max(1, Math.floor(d.quantity)),
                    chancePercent: Math.min(100, Math.max(1, Number(d.chancePercent))),
                  })),
              }
            : {}),
          ...(existing?.rewards.cosmetics?.length
            ? { cosmetics: existing.rewards.cosmetics }
            : {}),
        },
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      const nextList = editingId
        ? chests.map((c) => (c.id === editingId ? nextChest : c))
        : [...chests, nextChest];

      await onSaveChests(nextList);
      const cloudErr = getLastAdminCloudSyncError();
      onShowFeedback?.(
        cloudErr
          ? `⚠️ Salvo apenas localmente — erro ao publicar no PlayFab: ${cloudErr}`
          : editingId
            ? `🎁 Baú "${cleanName}" atualizado na nuvem!`
            : `🎁 Baú "${cleanName}" criado com sucesso!`,
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(chest: ChestDefinition) {
    const nextList = chests.map((c) =>
      c.id === chest.id ? { ...c, enabled: !c.enabled, updatedAt: new Date().toISOString() } : c,
    );
    await onSaveChests(nextList);
    const cloudErr = getLastAdminCloudSyncError();
    onShowFeedback?.(
      cloudErr
        ? `⚠️ Salvo apenas localmente — erro no PlayFab: ${cloudErr}`
        : !chest.enabled
          ? `✅ Baú "${chest.name}" ativado!`
          : `⏸️ Baú "${chest.name}" ocultado.`,
    );
  }

  async function handleDelete(chest: ChestDefinition) {
    if (chest.isDefault) return;
    if (!window.confirm(`Deseja excluir o baú "${chest.name}"?`)) return;
    const nextList = chests.filter((c) => c.id !== chest.id);
    await onSaveChests(nextList);
    const cloudErr = getLastAdminCloudSyncError();
    onShowFeedback?.(
      cloudErr
        ? `⚠️ Removido apenas localmente — erro no PlayFab: ${cloudErr}`
        : `🗑️ Baú "${chest.name}" removido.`,
    );
    if (editingId === chest.id) resetForm();
  }

  async function handleSendTestChestToSelf(chest: ChestDefinition) {
    if (!auth.profile) return;
    try {
      const liveProfile = getActiveAccount()?.profile ?? auth.profile;
      const prev = { ...(liveProfile.unopenedChests ?? {}) };
      prev[chest.id] = (Number(prev[chest.id]) || 0) + 1;
      await syncActiveProfileChangeToPlayFab(
        {
          ...liveProfile,
          unopenedChests: prev,
        },
        { requireServerSync: true },
      );
      await auth.refresh();
      onShowFeedback?.(`🎁 1x "${chest.name}" enviado para sua Mochila (Teste ADM)!`);
    } catch (err) {
      onShowFeedback?.(
        `⚠️ ${err instanceof Error && err.message ? err.message : "Erro ao enviar baú de teste."}`,
      );
    }
  }

  const rarityMeta = CHEST_RARITY_META[rarity];
  const isShopReleased = Boolean(auth.adminConfig.rolloutFlags?.enableShopForStudents);

  return (
    <div className="space-y-4">
      {/* Aviso Dinâmico de Status */}
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
          <Sparkles className={`h-4 w-4 shrink-0 ${isShopReleased ? "text-emerald-500" : "text-amber-500"}`} />
          <span>
            {isShopReleased
              ? "Sistema de Baús Ativo para os Alunos — alterações salvas aqui ficam ativas para toda a rede."
              : "Sistema de Baús em Prévia ADM — Apenas administradores visualizam e testam por enquanto (oculto para alunos)."}
          </span>
        </div>
      </div>

      {/* Formulário de Criação / Edição */}
      <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-display text-base font-extrabold text-foreground flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {editingId ? "Editar Baú" : "Criar Novo Baú"}
          </div>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-8 text-xs">
              Cancelar edição
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-bold">Nome do Baú</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Baú do Mestre"
              className="rounded-xl"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold">Raridade / Visual</Label>
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as ChestRarity)}
              className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
            >
              {CHEST_RARITIES.map((r) => (
                <option key={r} value={r}>
                  {CHEST_RARITY_META[r].label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que este baú representa"
              className="rounded-xl"
            />
          </div>
        </div>

        {/* Faixas de Recompensa */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border bg-secondary/30 p-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-primary" /> Pontos (Mín / Máx)
            </Label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                min={0}
                value={ptsMin}
                onChange={(e) => setPtsMin(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
              <Input
                type="number"
                min={0}
                value={ptsMax}
                onChange={(e) => setPtsMax(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-emerald-500" /> XP (Mín / Máx)
            </Label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                min={0}
                value={xpMin}
                onChange={(e) => setXpMin(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
              <Input
                type="number"
                min={0}
                value={xpMax}
                onChange={(e) => setXpMax(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-sky-500" /> Moedas (Mín / Máx)
            </Label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                min={0}
                value={coinsMin}
                onChange={(e) => setCoinsMin(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
              <Input
                type="number"
                min={0}
                value={coinsMax}
                onChange={(e) => setCoinsMax(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Drops Dinâmicos de Pacotes de Cartas */}
        <div className="rounded-2xl border bg-secondary/30 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-[11px] font-bold flex items-center gap-1">
              <Package className="h-3.5 w-3.5 text-primary" /> Recompensas de Pacotes de Cartas (Opcional)
            </Label>
            <span className="text-[10px] text-muted-foreground">
              Adicione um ou mais pacotes (inclusive o mesmo pacote com quantidades e chances diferentes)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px] font-bold">Pacote de Cartas</Label>
              <select
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                className="h-8 w-full rounded-lg border bg-background px-2.5 text-xs font-bold"
              >
                <option value="">Selecione um pacote...</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold">Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={packQty}
                disabled={!packId}
                onChange={(e) => setPackQty(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 rounded-lg text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold">Chance (%)</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={packChance === 0 ? "" : packChance}
                  disabled={!packId}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPackChance(raw === "" ? 0 : Math.min(100, Math.max(0, Number(raw) || 0)));
                  }}
                  className="h-8 rounded-lg text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!packId}
                  onClick={() => {
                    if (!packId) return;
                    setPackDrops((prev) => [
                      ...prev,
                      {
                        packId,
                        quantity: Math.max(1, Math.floor(packQty)),
                        chancePercent: Math.min(100, Math.max(1, Number(packChance) || 100)),
                      },
                    ]);
                  }}
                  className="h-8 rounded-lg text-xs font-bold shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                </Button>
              </div>
            </div>
          </div>

          {packDrops.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {packDrops.map((drop, idx) => {
                const packName = packs.find((p) => p.id === drop.packId)?.name ?? drop.packId;
                return (
                  <div
                    key={`${drop.packId}_${idx}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-background px-2.5 py-1.5 text-xs font-bold"
                  >
                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{packName}</span>
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-primary">
                      x{drop.quantity}
                    </span>
                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-amber-600 dark:text-amber-400">
                      {drop.chancePercent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setPackDrops((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Remover esta recompensa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aparência Vetorial e Tempo de Abertura */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-2xl border bg-secondary/30 p-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold">Cor da Madeira</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded-lg border bg-background p-0.5"
              />
              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                {primaryColor}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold">Cor do Metal</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={metalColor}
                onChange={(e) => setMetalColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded-lg border bg-background p-0.5"
              />
              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                {metalColor}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold">Formato do Baú</Label>
            <select
              value={shape}
              onChange={(e) => setShape(e.target.value as ChestShape)}
              className="h-8 w-full rounded-lg border bg-background px-2.5 text-xs font-bold"
            >
              {CHEST_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold flex items-center justify-between">
              <span>Tempo da Barra</span>
              <span className="text-primary">{(openDurationMs / 1000).toFixed(1)}s</span>
            </Label>
            <input
              type="range"
              min={1000}
              max={5000}
              step={250}
              value={openDurationMs}
              onChange={(e) => setOpenDurationMs(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer h-8"
            />
          </div>
        </div>

        {/* Prévia Visual + Botão Salvar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2 ${rarityMeta.borderClass} ${rarityMeta.bgClass}`}
          >
            <ChestVector
              primaryColor={primaryColor}
              metalColor={metalColor}
              shape={shape}
              size="sm"
              className="shrink-0"
            />
            <div className="text-xs">
              <div className="font-display font-black text-foreground">
                {name.trim() || "Prévia do Baú"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {rarityMeta.label} • {ptsMin}-{ptsMax} pts • {xpMin}-{xpMax} XP •{" "}
                {(openDurationMs / 1000).toFixed(1)}s
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving || !name.trim()} className="rounded-xl font-bold gap-1.5">
            {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Baú"}
          </Button>
        </div>
      </form>

      {/* Lista de Baús Cadastrados */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="font-display text-sm font-black text-foreground flex items-center justify-between">
          <span>Catálogo de Baús ({chests.length})</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
          {chests.map((c) => {
            const meta = CHEST_RARITY_META[c.rarity] ?? CHEST_RARITY_META.comum;
            const dropPacks = c.rewards.cardPacks ?? [];
            const cosmeticDropsCount = c.rewards.cosmetics?.length ?? 0;

            return (
              <div
                key={c.id}
                className={`rounded-2xl border-2 p-3.5 space-y-2.5 transition-all ${meta.borderClass} ${meta.bgClass} ${meta.glowClass} ${
                  !c.enabled ? "opacity-55 grayscale" : ""
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <ChestVector
                    primaryColor={c.primaryColor}
                    metalColor={c.metalColor}
                    shape={c.shape}
                    size="sm"
                    className="shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display text-sm font-black text-foreground truncate">
                        {c.name}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {c.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                  {c.rewards.points && (
                    <span className="rounded-lg bg-background/70 border px-2 py-0.5">
                      ⭐ {c.rewards.points.min}-{c.rewards.points.max} pts
                    </span>
                  )}
                  {c.rewards.xp && (
                    <span className="rounded-lg bg-background/70 border px-2 py-0.5">
                      ⚡ {c.rewards.xp.min}-{c.rewards.xp.max} XP
                    </span>
                  )}
                  {c.rewards.coins && (
                    <span className="rounded-lg bg-background/70 border px-2 py-0.5">
                      🪙 {c.rewards.coins.min}-{c.rewards.coins.max} moedas
                    </span>
                  )}
                  {dropPacks.map((dp, dpIdx) => {
                    const pName = packs.find((p) => p.id === dp.packId)?.name ?? dp.packId;
                    return (
                      <span key={`${dp.packId}_${dpIdx}`} className="rounded-lg bg-background/70 border px-2 py-0.5">
                        📦 {dp.quantity}x {pName} ({dp.chancePercent}%)
                      </span>
                    );
                  })}
                  {cosmeticDropsCount > 0 && (
                    <span className="rounded-lg bg-background/70 border px-2 py-0.5">
                      ✨ {cosmeticDropsCount} cosmético(s)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSimChest(c);
                      setSimOutcome(openChest(c));
                    }}
                    className="h-7 rounded-lg text-[11px] font-bold"
                  >
                    <Sparkles className="mr-1 h-3 w-3" /> Simular Abertura
                  </Button>
                  {auth.profile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleSendTestChestToSelf(c)}
                      className="h-7 rounded-lg text-[11px] font-bold"
                    >
                      <Gift className="mr-1 h-3 w-3" /> Enviar p/ Minha Mochila
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(c)}
                    className="h-7 w-7 rounded-lg ml-auto"
                    title="Editar baú"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleToggleEnabled(c)}
                    className="h-7 w-7 rounded-lg"
                    title={c.enabled ? "Ocultar baú" : "Ativar baú"}
                  >
                    {c.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  {!c.isDefault && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleDelete(c)}
                      className="h-7 w-7 rounded-lg text-destructive"
                      title="Excluir baú"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Animado de Simulação de Abertura (Prévia ADM) */}
      <ChestOpeningModal
        chest={simChest}
        outcome={simOutcome}
        packsCatalog={packs}
        isSimulation
        onClose={() => {
          setSimChest(null);
          setSimOutcome(null);
        }}
      />
    </div>
  );
}
