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
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import {
  CHEST_RARITIES,
  CHEST_RARITY_META,
  mergeWithDefaultChests,
  openChest,
  type ChestDefinition,
  type ChestOpenOutcome,
  type ChestRarity,
} from "@/lib/chests-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { syncActiveProfileChangeToPlayFab } from "@/lib/playfab";

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
  const [packId, setPackId] = useState<string>(packs[0]?.id ?? "");
  const [packQty, setPackQty] = useState(1);
  const [packChance, setPackChance] = useState(50);
  const [saving, setSaving] = useState(false);

  const [previewOutcome, setPreviewOutcome] = useState<ChestOpenOutcome | null>(null);

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
    setPackId(packs[0]?.id ?? "");
    setPackQty(1);
    setPackChance(50);
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
    const firstPack = c.rewards.cardPacks?.[0];
    setPackId(firstPack?.packId ?? "");
    setPackQty(firstPack?.quantity ?? 1);
    setPackChance(firstPack?.chancePercent ?? 50);
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
        isDefault: existing?.isDefault,
        enabled: existing?.enabled ?? true,
        rewards: {
          ...(ptsMax > 0 ? { points: { min: Math.min(ptsMin, ptsMax), max: Math.max(ptsMin, ptsMax) } } : {}),
          ...(xpMax > 0 ? { xp: { min: Math.min(xpMin, xpMax), max: Math.max(xpMin, xpMax) } } : {}),
          ...(coinsMax > 0 ? { coins: { min: Math.min(coinsMin, coinsMax), max: Math.max(coinsMin, coinsMax) } } : {}),
          ...(packId && packQty > 0 && packChance > 0
            ? { cardPacks: [{ packId, quantity: packQty, chancePercent: Math.min(100, packChance) }] }
            : {}),
        },
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      const nextList = editingId
        ? chests.map((c) => (c.id === editingId ? nextChest : c))
        : [...chests, nextChest];

      await onSaveChests(nextList);
      onShowFeedback?.(
        editingId
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
    onShowFeedback?.(
      !chest.enabled ? `✅ Baú "${chest.name}" ativado!` : `⏸️ Baú "${chest.name}" ocultado.`,
    );
  }

  async function handleDelete(chest: ChestDefinition) {
    if (chest.isDefault) return;
    const nextList = chests.filter((c) => c.id !== chest.id);
    await onSaveChests(nextList);
    onShowFeedback?.(`🗑️ Baú "${chest.name}" removido.`);
    if (editingId === chest.id) resetForm();
  }

  async function handleSendTestChestToSelf(chest: ChestDefinition) {
    if (!auth.profile) return;
    const prev = { ...(auth.profile.unopenedChests ?? {}) };
    prev[chest.id] = (Number(prev[chest.id]) || 0) + 1;
    await syncActiveProfileChangeToPlayFab({
      ...auth.profile,
      unopenedChests: prev,
    });
    await auth.refresh();
    onShowFeedback?.(`🎁 1x "${chest.name}" enviado para sua Mochila (Teste ADM)!`);
  }

  const rarityMeta = CHEST_RARITY_META[rarity];

  return (
    <div className="space-y-4">
      {/* Aviso de Modo Prévia ADM */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
          <span>
            Sistema de Baús em Prévia ADM — Apenas administradores visualizam e testam por enquanto (oculto para alunos).
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
              <Coins className="h-3.5 w-3.5 text-amber-500" /> Pontos (Mín / Máx)
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

        {/* Drop de Pacote de Cartas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border bg-secondary/30 p-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold flex items-center gap-1">
              <Package className="h-3.5 w-3.5 text-primary" /> Pacote de Cartas (Opcional)
            </Label>
            <select
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              className="h-8 w-full rounded-lg border bg-background px-2.5 text-xs font-bold"
            >
              <option value="">Nenhum pacote</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold">Quantidade de Pacotes</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={packQty}
              disabled={!packId}
              onChange={(e) => setPackQty(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 rounded-lg text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold">Chance de Drop (%)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={packChance}
              disabled={!packId}
              onChange={(e) => setPackChance(Math.min(100, Math.max(1, Number(e.target.value) || 100)))}
              className="h-8 rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Prévia Visual + Botão Salvar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div
            className={`flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2 ${rarityMeta.borderClass} ${rarityMeta.bgClass}`}
          >
            <Gift className="h-5 w-5 text-foreground shrink-0" />
            <div className="text-xs">
              <div className="font-display font-black text-foreground">
                {name.trim() || "Prévia do Baú"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {rarityMeta.label} • {ptsMin}-{ptsMax} pts • {xpMin}-{xpMax} XP
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
            const dropPack = c.rewards.cardPacks?.[0];
            const packName = dropPack
              ? packs.find((p) => p.id === dropPack.packId)?.name ?? dropPack.packId
              : null;

            return (
              <div
                key={c.id}
                className={`rounded-2xl border-2 p-3.5 space-y-2.5 transition-all ${meta.borderClass} ${meta.bgClass} ${meta.glowClass} ${
                  !c.enabled ? "opacity-55 grayscale" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
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
                      🎯 {c.rewards.points.min}-{c.rewards.points.max} pts
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
                  {dropPack && (
                    <span className="rounded-lg bg-background/70 border px-2 py-0.5">
                      📦 {dropPack.quantity}x {packName} ({dropPack.chancePercent}%)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreviewOutcome(openChest(c))}
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

      {/* Modal de Simulação de Abertura (Prévia ADM) */}
      <Dialog open={Boolean(previewOutcome)} onOpenChange={(v) => !v && setPreviewOutcome(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 font-display text-lg font-black">
              <Gift className="h-5 w-5 text-amber-500" /> Simulação: {previewOutcome?.chestName}
            </DialogTitle>
          </DialogHeader>
          {previewOutcome && (
            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border bg-secondary/40 p-2.5">
                  <div className="text-[10px] text-muted-foreground">Pontos</div>
                  <div className="font-display text-base font-black text-primary">
                    +{previewOutcome.points}
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/40 p-2.5">
                  <div className="text-[10px] text-muted-foreground">XP</div>
                  <div className="font-display text-base font-black text-emerald-500">
                    +{previewOutcome.xp}
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/40 p-2.5">
                  <div className="text-[10px] text-muted-foreground">Moedas</div>
                  <div className="font-display text-base font-black text-amber-500">
                    +{previewOutcome.coins}
                  </div>
                </div>
              </div>
              {previewOutcome.packs.length > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 font-bold text-primary">
                  📦 Pacotes Sorteados:{" "}
                  {previewOutcome.packs
                    .map((pk) => {
                      const pName = packs.find((p) => p.id === pk.packId)?.name ?? pk.packId;
                      return `${pk.quantity}x ${pName}`;
                    })
                    .join(", ")}
                </div>
              )}
              <Button
                type="button"
                onClick={() => setPreviewOutcome(null)}
                className="w-full rounded-xl font-bold"
              >
                Fechar Simulação
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
