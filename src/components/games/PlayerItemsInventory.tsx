import { useMemo, useState } from "react";
import { Backpack, Lock, Sparkles, Gift, Palette, Ticket, Layers, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CARD_RARITIES,
  CARD_RARITY_META,
  mergeWithDefaultCardPacks,
  openCardPack,
  type CardDefinition,
  type CardPackDefinition,
  type CardRarity,
} from "@/lib/cards-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { isAdminUnlockedSession } from "@/lib/playfab";
import { isAdminOrTestAccount } from "@/lib/player-profile";
import { CollectibleCardView } from "./CollectibleCardView";

const INVENTORY_SLOTS_COUNT = 12;

export function PlayerItemsInventory() {
  const auth = usePlayerAuth();
  const canViewCards = isAdminOrTestAccount(auth.profile, isAdminUnlockedSession());

  const [activePill, setActivePill] = useState<"mochila" | "album">("mochila");
  const [rarityFilter, setRarityFilter] = useState<CardRarity | "todas">("todas");
  const [inspectCard, setInspectCard] = useState<{ card: CardDefinition; count: number } | null>(null);
  const [packResult, setPackResult] = useState<{
    packName: string;
    drawn: CardDefinition[];
    newlyDiscovered: string[];
  } | null>(null);

  const slots = Array.from({ length: INVENTORY_SLOTS_COUNT }, (_, idx) => idx + 1);
  const catalog = useMemo(() => auth.adminConfig.cardsCatalog ?? [], [auth.adminConfig.cardsCatalog]);
  const packs = useMemo(
    () => mergeWithDefaultCardPacks(auth.adminConfig.cardPacks).filter((p) => p.enabled),
    [auth.adminConfig.cardPacks],
  );
  const ownedCardsMap = useMemo(() => auth.profile?.cards ?? {}, [auth.profile?.cards]);

  const discoveredCount = useMemo(
    () => catalog.filter((c) => (ownedCardsMap[c.id] ?? 0) > 0).length,
    [catalog, ownedCardsMap],
  );
  const totalOwnedCount = useMemo(
    () => Object.values(ownedCardsMap).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [ownedCardsMap],
  );

  const filteredCatalog = useMemo(() => {
    if (rarityFilter === "todas") return catalog;
    return catalog.filter((c) => c.rarity === rarityFilter);
  }, [catalog, rarityFilter]);

  async function handleOpenPack(pack: CardPackDefinition) {
    const res = openCardPack(pack, catalog, ownedCardsMap);
    if (res.error) return;
    await auth.updatePlayerCards({
      cards: res.updatedCardsMap,
      unopenedPacks: auth.profile?.unopenedPacks,
    });
    setPackResult({
      packName: pack.name,
      drawn: res.drawnCards,
      newlyDiscovered: res.newlyDiscoveredIds,
    });
  }

  return (
    <div className="space-y-4">
      {/* Pílulas do Inventário (Álbum de Cartas visível apenas para ADM / perfis de teste) */}
      {canViewCards && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePill("mochila")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
              activePill === "mochila"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Backpack className="h-3.5 w-3.5" />
            Mochila de Itens
          </button>
          <button
            type="button"
            onClick={() => setActivePill("album")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
              activePill === "album"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Álbum de Cartas
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 font-mono text-[10px]">
              {discoveredCount}/{catalog.length}
            </span>
          </button>
        </div>
      )}

      {canViewCards && activePill === "album" ? (
        <div className="space-y-4">
          {/* Cabeçalho do Álbum */}
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-purple-500/10 p-4 sm:p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <Layers className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                    Álbum de Cartas Colecionáveis
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {discoveredCount} de {catalog.length} cartas descobertas • {totalOwnedCount} carta(s) acumuladas
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" /> Prévia Restrita ADM
              </span>
            </div>
          </div>

          {/* Abertura rápida de pacotes para teste do ADM */}
          {catalog.length > 0 && packs.length > 0 && (
            <div className="rounded-3xl border bg-card p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                <PackageOpen className="h-4 w-4 text-primary" />
                Abrir Pacotes (5 Cartas • Teste ADM)
              </div>
              <div className="flex flex-wrap gap-2">
                {packs.map((pack) => (
                  <Button
                    key={pack.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleOpenPack(pack)}
                    className="rounded-xl text-xs font-bold"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-500" />
                    {pack.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Filtros por raridade */}
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

          {/* Grade do Álbum */}
          {filteredCatalog.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              Nenhuma carta cadastrada ainda. Crie cartas no Painel ADM → aba <b>Cartas &amp; Pacotes</b>.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredCatalog.map((card) => {
                const count = ownedCardsMap[card.id] ?? 0;
                const locked = count <= 0;
                return (
                  <CollectibleCardView
                    key={card.id}
                    card={card}
                    count={count > 0 ? count : undefined}
                    locked={locked}
                    compact
                    onClick={locked ? undefined : () => setInspectCard({ card, count })}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Banner de Prévia do Inventário */}
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-4 sm:p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <Backpack className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                    Mochila de Colecionáveis &amp; Itens
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Seus cosméticos de robô, baús fechados e passes especiais ficarão armazenados aqui.
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Sparkles className="h-3 w-3" /> Prévia ADM • Em Estruturação
              </span>
            </div>

            {/* Categorias futuras */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
                <Palette className="h-3 w-3 text-primary" /> Visores &amp; Pinturas
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
                <Gift className="h-3 w-3 text-emerald-500" /> Baús Semanais
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
                <Ticket className="h-3 w-3 text-amber-500" /> Passes &amp; Boosters
              </span>
            </div>
          </div>

          {/* Grade de Slots de Inventário */}
          <div className="rounded-3xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground">Espaços do Inventário</span>
              <span className="font-mono text-muted-foreground">0 / {INVENTORY_SLOTS_COUNT} ocupados</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {slots.map((slotNum) => (
                <div
                  key={slotNum}
                  title={`Slot #${slotNum} — Vazio (Reservado para itens futuros)`}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground/60 transition-colors hover:border-primary/40 hover:bg-secondary/40 select-none"
                >
                  <Lock className="h-4 w-4 opacity-50" />
                  <span className="font-mono text-[10px] font-bold opacity-60">Slot {slotNum}</span>
                </div>
              ))}
            </div>

            <p className="text-center text-[11px] text-muted-foreground pt-1">
              🔒 Esta aba é privada e visível apenas para você. Outros jogadores não podem acessar seu inventário.
            </p>
          </div>
        </>
      )}

      {/* Modal de Inspeção da Carta */}
      <Dialog open={Boolean(inspectCard)} onOpenChange={(v) => !v && setInspectCard(null)}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-extrabold">Detalhes da Carta</DialogTitle>
          </DialogHeader>
          {inspectCard && (
            <CollectibleCardView card={inspectCard.card} count={inspectCard.count} />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Abertura de Pacote */}
      <Dialog open={Boolean(packResult)} onOpenChange={(v) => !v && setPackResult(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Pacote Aberto: {packResult?.packName}
            </DialogTitle>
          </DialogHeader>
          {packResult && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 py-2">
              {packResult.drawn.map((card, idx) => (
                <CollectibleCardView
                  key={`${card.id}_${idx}`}
                  card={card}
                  isNew={packResult.newlyDiscovered.includes(card.id)}
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
