import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Package,
  Sparkles,
  Lock,
  Check,
  X,
  Image as ImageIcon,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CARD_RARITIES,
  CARD_RARITY_META,
  createCardDefinition,
  editCardDefinition,
  mergeWithDefaultCardPacks,
  openCardPack,
  sumPackProbabilities,
  validatePackProbabilities,
  type CardDefinition,
  type CardPackDefinition,
  type CardRarity,
  type PackProbabilities,
} from "@/lib/cards-catalog";
import type { PlatformAdminConfig } from "@/lib/game-codes";
import { usePlayerAuth } from "@/lib/player-auth";
import { CollectibleCardView } from "./CollectibleCardView";

interface AdminCardsTabProps {
  draft: PlatformAdminConfig;
  setDraft: React.Dispatch<React.SetStateAction<PlatformAdminConfig>>;
  onSaveConfig: (nextCfg: PlatformAdminConfig) => Promise<void> | void;
}

export function AdminCardsTab({ draft, setDraft, onSaveConfig }: AdminCardsTabProps) {
  const auth = usePlayerAuth();
  const cards = useMemo(() => draft.cardsCatalog ?? [], [draft.cardsCatalog]);
  const packs = useMemo(() => mergeWithDefaultCardPacks(draft.cardPacks), [draft.cardPacks]);

  // Sub-aba do gerenciador
  const [section, setSection] = useState<"cartas" | "pacotes">("cartas");

  // Formulário de Carta (Criar / Editar)
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [cardRarity, setCardRarity] = useState<CardRarity>("comum");
  const [cardImageUrl, setCardImageUrl] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<CardRarity | "todas">("todas");
  const [previewModalCard, setPreviewModalCard] = useState<CardDefinition | null>(null);

  // Formulário de Pacote (Criar Especial / Editar)
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [isPackFormOpen, setIsPackFormOpen] = useState(false);
  const [packName, setPackName] = useState("");
  const [packDesc, setPackDesc] = useState("");
  const [packCardsCount, setPackCardsCount] = useState<number>(5);
  const [packPrice, setPackPrice] = useState<number>(250);
  const [packEnabled, setPackEnabled] = useState(true);
  const [packProbs, setPackProbs] = useState<PackProbabilities>({
    comum: 40,
    incomum: 30,
    rara: 20,
    epica: 8,
    lendaria: 2,
  });
  const [packUseAllCards, setPackUseAllCards] = useState(true);
  const [packSelectedCardIds, setPackSelectedCardIds] = useState<string[]>([]);
  const [packError, setPackError] = useState<string | null>(null);

  // Modal de Teste de Abertura de Pacote (ADM)
  const [testOpenResult, setTestOpenResult] = useState<{
    packName: string;
    drawn: CardDefinition[];
    newlyDiscovered: string[];
  } | null>(null);

  const filteredCards = useMemo(() => {
    if (rarityFilter === "todas") return cards;
    return cards.filter((c) => c.rarity === rarityFilter);
  }, [cards, rarityFilter]);

  function resetCardForm() {
    setEditingCardId(null);
    setCardName("");
    setCardDesc("");
    setCardRarity("comum");
    setCardImageUrl("");
    setCardError(null);
  }

  function startEditCard(card: CardDefinition) {
    setEditingCardId(card.id);
    setCardName(card.name);
    setCardDesc(card.description);
    setCardRarity(card.rarity);
    setCardImageUrl(card.imageUrl);
    setCardError(null);
    setSection("cartas");
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    setCardError(null);

    let nextCards: CardDefinition[];
    if (editingCardId) {
      const existing = cards.find((c) => c.id === editingCardId);
      if (!existing) return;
      const res = editCardDefinition(existing, {
        name: cardName,
        description: cardDesc,
        imageUrl: cardImageUrl,
      });
      if (!res.card) {
        setCardError(res.error ?? "Erro ao atualizar carta.");
        return;
      }
      nextCards = cards.map((c) => (c.id === editingCardId ? res.card! : c));
    } else {
      const res = createCardDefinition({
        name: cardName,
        description: cardDesc,
        rarity: cardRarity,
        imageUrl: cardImageUrl,
      });
      if (!res.card) {
        setCardError(res.error ?? "Erro ao criar carta.");
        return;
      }
      nextCards = [res.card, ...cards];
    }

    const nextCfg: PlatformAdminConfig = { ...draft, cardsCatalog: nextCards };
    setDraft(nextCfg);
    await onSaveConfig(nextCfg);
    resetCardForm();
  }

  async function handleDeleteCard(cardId: string) {
    const nextCards = cards.filter((c) => c.id !== cardId);
    const nextCfg: PlatformAdminConfig = { ...draft, cardsCatalog: nextCards };
    setDraft(nextCfg);
    await onSaveConfig(nextCfg);
    if (editingCardId === cardId) resetCardForm();
  }

  function startNewSpecialPack() {
    setEditingPackId(null);
    setPackName("");
    setPackDesc("");
    setPackCardsCount(5);
    setPackPrice(300);
    setPackEnabled(true);
    setPackProbs({ comum: 40, incomum: 30, rara: 20, epica: 8, lendaria: 2 });
    setPackUseAllCards(true);
    setPackSelectedCardIds([]);
    setPackError(null);
    setIsPackFormOpen(true);
  }

  function startEditPack(pack: CardPackDefinition) {
    setEditingPackId(pack.id);
    setPackName(pack.name);
    setPackDesc(pack.description);
    setPackCardsCount(pack.cardsPerPack || 5);
    setPackPrice(pack.pricePoints ?? 0);
    setPackEnabled(pack.enabled);
    setPackProbs({ ...pack.probabilities });
    const hasCustomPool = Array.isArray(pack.cardIds) && pack.cardIds.length > 0;
    setPackUseAllCards(!hasCustomPool);
    setPackSelectedCardIds(hasCustomPool ? [...pack.cardIds!] : []);
    setPackError(null);
    setIsPackFormOpen(true);
  }

  async function handleSavePack(e: React.FormEvent) {
    e.preventDefault();
    setPackError(null);

    if (!packName.trim()) {
      setPackError("Informe o nome do pacote.");
      return;
    }
    const check = validatePackProbabilities(packProbs);
    if (!check.valid) {
      setPackError(check.error ?? "As probabilidades devem somar 100%.");
      return;
    }
    if (!packUseAllCards && packSelectedCardIds.length === 0) {
      setPackError("Selecione pelo menos 1 carta para este pacote ou marque 'Todas as cartas'.");
      return;
    }

    const now = new Date().toISOString();
    const existing = editingPackId ? packs.find((p) => p.id === editingPackId) : null;

    const newPack: CardPackDefinition = {
      id: existing?.id ?? `pack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: packName.trim(),
      description: packDesc.trim(),
      isDefault: existing?.isDefault ?? false,
      cardsPerPack: Math.max(1, Math.min(20, Math.floor(packCardsCount || 5))),
      probabilities: { ...packProbs },
      cardIds: packUseAllCards ? null : [...packSelectedCardIds],
      pricePoints: Math.max(0, Math.floor(packPrice || 0)),
      enabled: packEnabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const nextPacks = existing
      ? packs.map((p) => (p.id === existing.id ? newPack : p))
      : [...packs, newPack];

    const nextCfg: PlatformAdminConfig = { ...draft, cardPacks: nextPacks };
    setDraft(nextCfg);
    await onSaveConfig(nextCfg);
    setIsPackFormOpen(false);
    setEditingPackId(null);
  }

  async function handleDeleteSpecialPack(packId: string) {
    const nextPacks = packs.filter((p) => p.id !== packId || p.isDefault);
    const nextCfg: PlatformAdminConfig = { ...draft, cardPacks: nextPacks };
    setDraft(nextCfg);
    await onSaveConfig(nextCfg);
  }

  async function handleTestOpenPack(pack: CardPackDefinition) {
    const currentCards = auth.profile?.cards ?? {};
    const res = openCardPack(pack, cards, currentCards);
    if (res.error) {
      setPackError(res.error);
      return;
    }
    await auth.updatePlayerCards({
      cards: res.updatedCardsMap,
      unopenedPacks: auth.profile?.unopenedPacks,
    });
    setTestOpenResult({
      packName: pack.name,
      drawn: res.drawnCards,
      newlyDiscovered: res.newlyDiscoveredIds,
    });
  }

  const probsTotal = sumPackProbabilities(packProbs);

  return (
    <div className="space-y-4">
      {/* Banner de Modo Restrito ADM */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" />
          <span>
            Sistema de Cartas em modo privado: visível apenas para ADM e perfis de teste do ADM.
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold text-muted-foreground">
          {cards.length} carta(s) • {packs.length} pacote(s)
        </span>
      </div>

      {/* Sub-navegação Cartas vs Pacotes */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => setSection("cartas")}
          className={`rounded-xl py-2 text-xs sm:text-sm font-extrabold transition-colors flex items-center justify-center gap-1.5 ${
            section === "cartas"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          Cartas ({cards.length})
        </button>
        <button
          type="button"
          onClick={() => setSection("pacotes")}
          className={`rounded-xl py-2 text-xs sm:text-sm font-extrabold transition-colors flex items-center justify-center gap-1.5 ${
            section === "pacotes"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="h-4 w-4" />
          Pacotes ({packs.length})
        </button>
      </div>

      {section === "cartas" ? (
        <div className="space-y-5">
          {/* Formulário + Prévia ao Vivo */}
          <form
            onSubmit={handleSaveCard}
            className="rounded-3xl border bg-card p-4 sm:p-5 grid gap-5 md:grid-cols-[1fr_220px]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                  {editingCardId ? "Editar Carta Existente" : "Criar Nova Carta"}
                </h3>
                {editingCardId && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetCardForm}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar edição
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="card-name">Nome da Carta</Label>
                  <Input
                    id="card-name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Ex: Robô Lógico"
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="card-rarity" className="flex items-center gap-1.5">
                    Raridade
                    {editingCardId && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        <Lock className="h-3 w-3" /> Travada na edição
                      </span>
                    )}
                  </Label>
                  <select
                    id="card-rarity"
                    value={cardRarity}
                    disabled={Boolean(editingCardId)}
                    onChange={(e) => setCardRarity(e.target.value as CardRarity)}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {CARD_RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {CARD_RARITY_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="card-img">Link da Imagem ou GIF (HTTPS)</Label>
                <Input
                  id="card-img"
                  value={cardImageUrl}
                  onChange={(e) => setCardImageUrl(e.target.value)}
                  placeholder="https://media.giphy.com/..."
                  required
                  className="rounded-xl font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="card-desc">Descrição</Label>
                <Input
                  id="card-desc"
                  value={cardDesc}
                  onChange={(e) => setCardDesc(e.target.value)}
                  placeholder="Breve história ou poder da carta"
                  className="rounded-xl"
                />
              </div>

              {cardError && (
                <p className="rounded-xl bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive">
                  {cardError}
                </p>
              )}

              <Button type="submit" className="rounded-xl font-bold">
                {editingCardId ? (
                  <>
                    <Save className="h-4 w-4 mr-1.5" /> Salvar Alterações
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1.5" /> Criar Carta
                  </>
                )}
              </Button>
            </div>

            {/* Prévia Ao Vivo */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                Prévia da Carta
              </span>
              <CollectibleCardView
                card={{
                  name: cardName,
                  description: cardDesc,
                  rarity: cardRarity,
                  imageUrl: cardImageUrl,
                }}
              />
            </div>
          </form>

          {/* Galeria de Cartas Criadas */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-sm font-extrabold text-foreground">
                Catálogo de Cartas ({filteredCards.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {(["todas", ...CARD_RARITIES] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRarityFilter(r)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${
                      rarityFilter === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "todas" ? "Todas" : CARD_RARITY_META[r].label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                Nenhuma carta cadastrada neste filtro ainda. Crie a primeira acima!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredCards.map((card) => (
                  <div key={card.id} className="space-y-1.5">
                    <CollectibleCardView
                      card={card}
                      compact
                      onClick={() => setPreviewModalCard(card)}
                    />
                    <div className="flex items-center justify-between gap-1 px-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-[11px] rounded-lg"
                        onClick={() => setPreviewModalCard(card)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Ver
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-[11px] rounded-lg"
                        onClick={() => startEditCard(card)}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:bg-destructive/10 rounded-lg"
                        onClick={() => void handleDeleteCard(card.id)}
                        title="Excluir carta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                Pacotes de Cartas (5 Padrão + Especiais)
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Cada pacote entrega 5 cartas com probabilidades configuráveis por raridade.
              </p>
            </div>
            <Button type="button" size="sm" onClick={startNewSpecialPack} className="rounded-xl font-bold">
              <Plus className="h-4 w-4 mr-1" /> Criar Pacote Especial
            </Button>
          </div>

          {isPackFormOpen && (
            <form onSubmit={handleSavePack} className="rounded-3xl border bg-card p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-black text-foreground">
                  {editingPackId ? "Editar Pacote" : "Novo Pacote Especial"}
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPackFormOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nome do Pacote</Label>
                  <Input
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder="Ex: Pacote Festival de Lógica"
                    required
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Input
                    value={packDesc}
                    onChange={(e) => setPackDesc(e.target.value)}
                    placeholder="Descrição do pacote"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cartas por Pacote</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={packCardsCount}
                    onChange={(e) => setPackCardsCount(Number(e.target.value))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Preço (Pontos)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={packPrice}
                    onChange={(e) => setPackPrice(Number(e.target.value))}
                    className="rounded-xl"
                  />
                </div>
              </div>

              {/* Editor de Porcentagens */}
              <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Probabilidades por Raridade (%)</span>
                  <span
                    className={`font-mono ${
                      Math.abs(probsTotal - 100) <= 0.05
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                    }`}
                  >
                    Soma: {probsTotal}% / 100%
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {CARD_RARITIES.map((r) => (
                    <div key={r} className="space-y-1">
                      <Label className="text-[11px]">{CARD_RARITY_META[r].label} (%)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        max={100}
                        value={packProbs[r]}
                        onChange={(e) =>
                          setPackProbs((prev) => ({
                            ...prev,
                            [r]: Number(e.target.value) || 0,
                          }))
                        }
                        className="h-9 rounded-xl font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Seleção de Cartas do Pacote */}
              <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Cartas disponíveis neste pacote</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span>Todas as cartas</span>
                    <Switch checked={packUseAllCards} onCheckedChange={setPackUseAllCards} />
                  </div>
                </div>
                {!packUseAllCards && (
                  <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    {cards.map((c) => {
                      const selected = packSelectedCardIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setPackSelectedCardIds((prev) =>
                              selected ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                            )
                          }
                          className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left text-[11px] font-semibold transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "bg-background text-muted-foreground"
                          }`}
                        >
                          <Check className={`h-3 w-3 shrink-0 ${selected ? "opacity-100 text-primary" : "opacity-20"}`} />
                          <span className="truncate">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Switch checked={packEnabled} onCheckedChange={setPackEnabled} />
                  <span>Pacote Ativo</span>
                </div>
                <Button type="submit" className="rounded-xl font-bold">
                  <Save className="h-4 w-4 mr-1.5" /> Salvar Pacote
                </Button>
              </div>

              {packError && (
                <p className="rounded-xl bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive">
                  {packError}
                </p>
              )}
            </form>
          )}

          {/* Lista de Pacotes */}
          <div className="grid gap-3 sm:grid-cols-2">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="rounded-2xl border bg-card p-3.5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-sm font-extrabold text-foreground">
                      {pack.name}
                    </h4>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {pack.isDefault ? "Padrão" : "Especial"} • {pack.cardsPerPack} cartas
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{pack.description}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {CARD_RARITIES.map((r) => (
                      <span
                        key={r}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${CARD_RARITY_META[r].badgeClass}`}
                      >
                        {CARD_RARITY_META[r].label}: {pack.probabilities[r]}%
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 flex-1 rounded-xl text-xs font-bold"
                    onClick={() => void handleTestOpenPack(pack)}
                    disabled={cards.length === 0}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Testar Abertura
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl text-xs"
                    onClick={() => startEditPack(pack)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  {!pack.isDefault && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:bg-destructive/10 rounded-xl"
                      onClick={() => void handleDeleteSpecialPack(pack.id)}
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

      {/* Modal de Prévia Ampliada da Carta */}
      <Dialog open={Boolean(previewModalCard)} onOpenChange={(v) => !v && setPreviewModalCard(null)}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-extrabold">Prévia da Carta</DialogTitle>
          </DialogHeader>
          {previewModalCard && <CollectibleCardView card={previewModalCard} />}
        </DialogContent>
      </Dialog>

      {/* Modal de Resultado da Abertura de Teste */}
      <Dialog open={Boolean(testOpenResult)} onOpenChange={(v) => !v && setTestOpenResult(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Abertura: {testOpenResult?.packName}
            </DialogTitle>
          </DialogHeader>
          {testOpenResult && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 py-2">
              {testOpenResult.drawn.map((card, idx) => (
                <CollectibleCardView
                  key={`${card.id}_${idx}`}
                  card={card}
                  isNew={testOpenResult.newlyDiscovered.includes(card.id)}
                  compact
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
