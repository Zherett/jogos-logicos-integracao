import { useMemo, useState } from "react";
import { Backpack, Lock, Sparkles, Gift, Palette, Ticket, Layers, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CARD_PACK_COLOR_META,
  CARD_RARITIES,
  CARD_RARITY_META,
  consumeAndOpenCardPack,
  DEFAULT_CARD_FOIL_CHANCE_PERCENT,
  mergeWithDefaultCardPacks,
  openCardPack,
  type CardDefinition,
  type CardPackDefinition,
  type CardRarity,
} from "@/lib/cards-catalog";
import {
  CHEST_RARITY_META,
  consumeAndOpenChest,
  mergeWithDefaultChests,
  type ChestDefinition,
  type ChestOpenOutcome,
} from "@/lib/chests-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { creditCoinMetrics } from "@/lib/career-points";
import { isAdminUnlockedSession, syncActiveProfileChangeToPlayFab } from "@/lib/playfab";
import { isAdminOrTestAccount } from "@/lib/player-profile";
import { CollectibleCardView } from "./CollectibleCardView";
import { ChestOpeningModal } from "./ChestOpeningModal";
import { ChestVector } from "./ChestVector";
import { PackOpeningModal, type PackOpenOutcome } from "./PackOpeningModal";
import { getAuraPresentation, PlayerAvatarBadge } from "./PlayerAvatarBadge";
import {
  allocateStackedInventorySlots,
  getUnlockedAuraIds,
  getUnlockedAvatarIds,
  grantCosmeticToProfile,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  paginateUnifiedInventorySlots,
} from "@/lib/cosmetics-catalog";

const INVENTORY_SLOTS_COUNT = 12;
const PACK_SLOTS_COUNT = 15;
const CHEST_SLOTS_COUNT = 15;

export function PlayerItemsInventory() {
  const auth = usePlayerAuth();
  const canViewCards = isAdminOrTestAccount(auth.profile, isAdminUnlockedSession());

  const [activePill, setActivePill] = useState<"mochila" | "pacotes" | "baus" | "album" | "visual">("mochila");
  const [backpackPage, setBackpackPage] = useState(1);
  const [rarityFilter, setRarityFilter] = useState<CardRarity | "todas">("todas");
  const [inspectCard, setInspectCard] = useState<{ card: CardDefinition; count: number } | null>(null);
  const [packToOpen, setPackToOpen] = useState<CardPackDefinition | null>(null);
  const [openingChest, setOpeningChest] = useState<ChestDefinition | null>(null);
  const [chestOutcome, setChestOutcome] = useState<ChestOpenOutcome | null>(null);

  const chests = useMemo(() => mergeWithDefaultChests(auth.adminConfig.chestsCatalog), [auth.adminConfig.chestsCatalog]);
  const ownedChests = useMemo(() => {
    const map = auth.profile?.unopenedChests ?? {};
    return chests
      .map((c) => ({ chest: c, qty: Math.max(0, Math.floor(Number(map[c.id]) || 0)) }))
      .filter((item) => item.qty > 0);
  }, [chests, auth.profile?.unopenedChests]);

  async function handleOpenChest(chest: ChestDefinition) {
    if (!auth.profile || !canViewCards) return;
    const res = consumeAndOpenChest(chest, auth.profile.unopenedChests ?? {});
    if (!res.ok || !res.outcome) return;
    const nextPacks = { ...(auth.profile.unopenedPacks ?? {}) };
    for (const pk of res.outcome.packs) {
      nextPacks[pk.packId] = (Number(nextPacks[pk.packId]) || 0) + pk.quantity;
    }
    let updatedProfile = {
      ...auth.profile,
      unopenedChests: res.updatedUnopenedChests,
      unopenedPacks: nextPacks,
      chestsOpenedTotal: Math.max(0, auth.profile.chestsOpenedTotal ?? 0) + 1,
      pointsBalance: (auth.profile.pointsBalance ?? 0) + res.outcome.points,
      careerPoints: (auth.profile.careerPoints ?? 0) + res.outcome.points,
      xp: (auth.profile.xp ?? 0) + res.outcome.xp,
      seasonXp: (auth.profile.seasonXp ?? 0) + res.outcome.xp,
    };
    creditCoinMetrics(updatedProfile, res.outcome.coins);
    for (const cosm of res.outcome.cosmetics ?? []) {
      updatedProfile = grantCosmeticToProfile(updatedProfile, cosm.kind, cosm.itemId).profile;
    }
    await syncActiveProfileChangeToPlayFab(updatedProfile);
    await auth.refresh();
    setOpeningChest(chest);
    setChestOutcome(res.outcome);
  }

  const catalog = useMemo(() => auth.adminConfig.cardsCatalog ?? [], [auth.adminConfig.cardsCatalog]);
  const allPacksCatalog = useMemo(
    () => mergeWithDefaultCardPacks(auth.adminConfig.cardPacks),
    [auth.adminConfig.cardPacks],
  );
  const packs = useMemo(
    () => allPacksCatalog.filter((p) => p.enabled),
    [allPacksCatalog],
  );
  const packSlots = useMemo(
    () => allocateStackedInventorySlots(allPacksCatalog, auth.profile?.unopenedPacks, PACK_SLOTS_COUNT),
    [allPacksCatalog, auth.profile?.unopenedPacks],
  );
  const chestSlots = useMemo(
    () => allocateStackedInventorySlots(chests, auth.profile?.unopenedChests, CHEST_SLOTS_COUNT),
    [chests, auth.profile?.unopenedChests],
  );
  const totalUnopenedPacks = useMemo(
    () => packSlots.reduce((sum, s) => sum + s.quantity, 0),
    [packSlots],
  );
  const occupiedPackSlotsCount = useMemo(
    () => packSlots.filter((s) => s.item !== null).length,
    [packSlots],
  );
  const totalUnopenedChests = useMemo(
    () => chestSlots.reduce((sum, s) => sum + s.quantity, 0),
    [chestSlots],
  );
  const occupiedChestSlotsCount = useMemo(
    () => chestSlots.filter((s) => s.item !== null).length,
    [chestSlots],
  );
  const unifiedBackpackItems = useMemo(() => {
    type UnifiedItem =
      | { kind: "pack"; item: CardPackDefinition; quantity: number }
      | { kind: "chest"; item: ChestDefinition; quantity: number };
    const list: UnifiedItem[] = [];
    for (const s of packSlots) {
      if (s.item && s.quantity > 0) {
        list.push({ kind: "pack", item: s.item, quantity: s.quantity });
      }
    }
    for (const s of chestSlots) {
      if (s.item && s.quantity > 0) {
        list.push({ kind: "chest", item: s.item, quantity: s.quantity });
      }
    }
    return list;
  }, [packSlots, chestSlots]);
  const paginatedBackpack = useMemo(
    () => paginateUnifiedInventorySlots(unifiedBackpackItems, backpackPage, INVENTORY_SLOTS_COUNT),
    [unifiedBackpackItems, backpackPage],
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

  function handleOpenPack(pack: CardPackDefinition) {
    setPackToOpen(pack);
  }

  async function confirmOpenPack(pack: CardPackDefinition): Promise<PackOpenOutcome | null> {
    const unopenedMap = auth.profile?.unopenedPacks ?? {};
    const hasStock = (Number(unopenedMap[pack.id]) || 0) > 0;
    const foilChance = auth.adminConfig.cardFoilChancePercent ?? DEFAULT_CARD_FOIL_CHANCE_PERCENT;

    if (hasStock) {
      const res = consumeAndOpenCardPack(pack, catalog, ownedCardsMap, unopenedMap, Math.random, foilChance);
      if (res.error) {
        return { drawn: [], newlyDiscovered: [], error: res.error };
      }
      const saveRes = await auth.updatePlayerCards({
        cards: res.updatedCardsMap,
        unopenedPacks: res.updatedUnopenedPacks,
        packsOpenedDelta: 1,
        requireServerSync: true,
      });
      if (!saveRes.ok) {
        return {
          drawn: [],
          newlyDiscovered: [],
          error: saveRes.error ?? "Sem conexão com o servidor. Tente novamente.",
        };
      }
      return {
        drawn: res.drawnCards,
        newlyDiscovered: res.newlyDiscoveredIds,
      };
    }

    // Modo teste ADM (sem estoque de pacotes fechados)
    const res = openCardPack(pack, catalog, ownedCardsMap, Math.random, foilChance);
    if (res.error) {
      return { drawn: [], newlyDiscovered: [], error: res.error };
    }
    const saveRes = await auth.updatePlayerCards({
      cards: res.updatedCardsMap,
      unopenedPacks: unopenedMap,
    });
    if (!saveRes.ok) {
      return {
        drawn: [],
        newlyDiscovered: [],
        error: saveRes.error ?? "Erro ao salvar cartas.",
      };
    }
    return {
      drawn: res.drawnCards,
      newlyDiscovered: res.newlyDiscoveredIds,
    };
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
            onClick={() => setActivePill("pacotes")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
              activePill === "pacotes"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <PackageOpen className="h-3.5 w-3.5" />
            Pacotes de Cartas
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 font-mono text-[10px]">
              {totalUnopenedPacks}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActivePill("baus")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
              activePill === "baus"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gift className="h-3.5 w-3.5" />
            Baús
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 font-mono text-[10px]">
              {totalUnopenedChests}
            </span>
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
          <button
            type="button"
            onClick={() => setActivePill("visual")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition-colors ${
              activePill === "visual"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            Visual
          </button>
        </div>
      )}

      {canViewCards && activePill === "visual" ? (() => {
        const allAvatars = mergeWithDefaultAvatars(auth.adminConfig.avatarsCatalog);
        const allAuras = mergeWithDefaultAuras(auth.adminConfig.aurasCatalog);
        const unlockedAvIds = new Set(getUnlockedAvatarIds(auth.profile));
        const unlockedAuraIds = new Set(getUnlockedAuraIds(auth.profile));
        const myAvatars = allAvatars.filter((a) => unlockedAvIds.has(a.id));
        const myAuras = allAuras.filter((a) => unlockedAuraIds.has(a.id));

        return (
          <div className="space-y-4">
            <div className="rounded-3xl border bg-card p-4 space-y-3">
              <div className="font-display text-sm font-black flex items-center justify-between">
                <span>Seus Avatares Desbloqueados ({myAvatars.length})</span>
                <span className="text-[10px] font-bold uppercase text-amber-500">Prévia ADM</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {myAvatars.map((av) => {
                  const equipped = (auth.profile?.equippedAvatar?.id ?? "avatar_default") === av.id;
                  return (
                    <button
                      key={av.id}
                      type="button"
                      onClick={async () => {
                        if (!auth.profile) return;
                        await syncActiveProfileChangeToPlayFab({
                          ...auth.profile,
                          equippedAvatar: {
                            id: av.id,
                            color: auth.profile.equippedAvatar?.color,
                          },
                        });
                        await auth.refresh();
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-center transition-all cursor-pointer ${
                        equipped
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-secondary/20 hover:bg-secondary/40"
                      }`}
                    >
                      <PlayerAvatarBadge
                        avatar={av}
                        color={auth.profile?.equippedAvatar?.color}
                        size="sm"
                      />
                      <span className="text-[11px] font-bold truncate w-full">{av.name}</span>
                      <span className="text-[9.5px] font-bold text-primary">
                        {equipped ? "Equipado" : "Equipar"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-4 space-y-3">
              <div className="font-display text-sm font-black">
                Suas Auras do Perfil ({myAuras.length})
              </div>
              {myAuras.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Você ainda não desbloqueou nenhuma aura. Adquira na Loja de Moedas!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {myAuras.map((aura) => {
                    const equipped = auth.profile?.equippedAuraId === aura.id;
                    const pres = getAuraPresentation(aura);
                    return (
                      <button
                        key={aura.id}
                        type="button"
                        onClick={async () => {
                          if (!auth.profile) return;
                          await syncActiveProfileChangeToPlayFab({
                            ...auth.profile,
                            equippedAuraId: equipped ? undefined : aura.id,
                          });
                          await auth.refresh();
                        }}
                        className={`flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all cursor-pointer ${
                          equipped ? "bg-primary/10" : "bg-card hover:bg-secondary/30"
                        } ${pres.className}`}
                        style={pres.style}
                      >
                        <span className="text-xs font-bold">{aura.name}</span>
                        <span className="text-[10px] font-black text-primary">
                          {equipped ? "Equipada (Remover)" : "Equipar"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })() : canViewCards && activePill === "pacotes" ? (
        <div className="space-y-4">
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-sky-500/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <PackageOpen className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                    Pacotes de Cartas ({totalUnopenedPacks})
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Cada tipo de pacote ocupa 1 slot com estoque ilimitado. Pacotes iguais são agrupados no mesmo espaço.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px] font-extrabold text-foreground">
                {occupiedPackSlotsCount} / {PACK_SLOTS_COUNT} slots
              </span>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
              {packSlots.map((slot) => {
                if (!slot.item) {
                  return (
                    <div
                      key={`pack_slot_${slot.slotIndex}`}
                      title={`Slot #${slot.slotIndex} — Vazio`}
                      className="min-h-[8.5rem] flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground/60 select-none p-2"
                    >
                      <Lock className="h-4 w-4 opacity-50" />
                      <span className="font-mono text-[10px] font-bold opacity-60">Slot {slot.slotIndex}</span>
                    </div>
                  );
                }
                const pack = slot.item;
                const colorMeta = CARD_PACK_COLOR_META[pack.colorTheme ?? "teal"] ?? CARD_PACK_COLOR_META.teal;
                return (
                  <div
                    key={pack.id}
                    className="relative flex flex-col justify-between gap-2 rounded-2xl border-2 border-primary/35 bg-card p-2.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-xl text-white shadow-sm ${colorMeta.gradientClass}`}
                      >
                        <PackageOpen className="h-4 w-4" />
                      </span>
                      <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-black text-primary">
                        x{slot.quantity}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-xs font-black text-foreground truncate" title={pack.name}>
                        {pack.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {pack.cardsPerPack} cartas
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenPack(pack)}
                      className="w-full h-7 rounded-xl text-[11px] font-bold"
                    >
                      Abrir
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : canViewCards && activePill === "baus" ? (
        <div className="space-y-4">
          <div className="rounded-3xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-orange-500/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
                  <Gift className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                    Baús de Recompensa ({totalUnopenedChests})
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Cada tipo de baú ocupa 1 slot próprio com quantidade ilimitada. Baús iguais são empilhados no mesmo espaço.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px] font-extrabold text-foreground">
                {occupiedChestSlotsCount} / {CHEST_SLOTS_COUNT} slots
              </span>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
              {chestSlots.map((slot) => {
                if (!slot.item) {
                  return (
                    <div
                      key={`chest_slot_${slot.slotIndex}`}
                      title={`Slot #${slot.slotIndex} — Vazio`}
                      className="min-h-[9rem] flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground/60 select-none p-2"
                    >
                      <Lock className="h-4 w-4 opacity-50" />
                      <span className="font-mono text-[10px] font-bold opacity-60">Slot {slot.slotIndex}</span>
                    </div>
                  );
                }
                const chest = slot.item;
                const meta = CHEST_RARITY_META[chest.rarity] ?? CHEST_RARITY_META.comum;
                return (
                  <div
                    key={chest.id}
                    className={`flex flex-col justify-between gap-2 rounded-2xl border-2 p-2.5 ${meta.borderClass} ${meta.bgClass}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <ChestVector
                        primaryColor={chest.primaryColor}
                        metalColor={chest.metalColor}
                        shape={chest.shape}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="rounded-full bg-background/85 px-2 py-0.5 font-mono text-[10px] font-black text-foreground">
                        x{slot.quantity}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-xs font-black text-foreground truncate" title={chest.name}>
                        {chest.name}
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground">
                        {meta.label}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleOpenChest(chest)}
                      className="w-full h-7 rounded-xl text-[11px] font-bold"
                    >
                      Abrir
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : canViewCards && activePill === "album" ? (
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

            {/* Atalhos rápidos para as abas dedicadas */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-bold text-muted-foreground">
              <button
                type="button"
                onClick={() => setActivePill("pacotes")}
                className="inline-flex items-center gap-1 rounded-lg bg-background/70 hover:bg-background border px-2.5 py-1 transition-colors cursor-pointer"
              >
                <PackageOpen className="h-3 w-3 text-primary" /> Pacotes de Cartas ({totalUnopenedPacks})
              </button>
              <button
                type="button"
                onClick={() => setActivePill("baus")}
                className="inline-flex items-center gap-1 rounded-lg bg-background/70 hover:bg-background border px-2.5 py-1 transition-colors cursor-pointer"
              >
                <Gift className="h-3 w-3 text-emerald-500" /> Baús ({totalUnopenedChests})
              </button>
              <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-1">
                <Ticket className="h-3 w-3 text-amber-500" /> Passes &amp; Boosters
              </span>
            </div>
          </div>

          {/* Grade de Slots de Inventário (12 por página com paginação automática) */}
          <div className="rounded-3xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground">Espaços do Inventário (Todos os Itens)</span>
              <span className="font-mono text-muted-foreground">
                {paginatedBackpack.totalItems} tipo(s) • Pág. {paginatedBackpack.page}/{paginatedBackpack.totalPages}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
              {paginatedBackpack.slots.map((slot) => {
                if (!slot.item) {
                  return (
                    <div
                      key={`unified_slot_${slot.slotNumber}`}
                      title={`Slot #${slot.slotNumber} — Vazio`}
                      className="min-h-[8.5rem] flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground/60 transition-colors hover:border-primary/40 hover:bg-secondary/40 select-none p-2"
                    >
                      <Lock className="h-4 w-4 opacity-50" />
                      <span className="font-mono text-[10px] font-bold opacity-60">Slot {slot.slotNumber}</span>
                    </div>
                  );
                }

                if (slot.item.kind === "pack") {
                  const pack = slot.item.item;
                  const colorMeta = CARD_PACK_COLOR_META[pack.colorTheme ?? "teal"] ?? CARD_PACK_COLOR_META.teal;
                  return (
                    <div
                      key={`unified_pack_${pack.id}`}
                      className="flex flex-col justify-between gap-2 rounded-2xl border-2 border-primary/35 bg-card p-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={`grid h-9 w-9 place-items-center rounded-xl text-white shadow-sm ${colorMeta.gradientClass}`}
                        >
                          <PackageOpen className="h-4 w-4" />
                        </span>
                        <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-black text-primary">
                          x{slot.item.quantity}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-xs font-black text-foreground truncate" title={pack.name}>
                          {pack.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Pacote • {pack.cardsPerPack} cartas
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenPack(pack)}
                        className="w-full h-7 rounded-xl text-[11px] font-bold"
                      >
                        Abrir
                      </Button>
                    </div>
                  );
                }

                const chest = slot.item.item;
                const meta = CHEST_RARITY_META[chest.rarity] ?? CHEST_RARITY_META.comum;
                return (
                  <div
                    key={`unified_chest_${chest.id}`}
                    className={`flex flex-col justify-between gap-2 rounded-2xl border-2 p-2.5 ${meta.borderClass} ${meta.bgClass}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <ChestVector
                        primaryColor={chest.primaryColor}
                        metalColor={chest.metalColor}
                        shape={chest.shape}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="rounded-full bg-background/85 px-2 py-0.5 font-mono text-[10px] font-black text-foreground">
                        x{slot.item.quantity}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-xs font-black text-foreground truncate" title={chest.name}>
                        {chest.name}
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground">
                        Baú • {meta.label}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleOpenChest(chest)}
                      className="w-full h-7 rounded-xl text-[11px] font-bold"
                    >
                      Abrir
                    </Button>
                  </div>
                );
              })}
            </div>

            {paginatedBackpack.totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={paginatedBackpack.page <= 1}
                  onClick={() => setBackpackPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl text-xs font-bold"
                >
                  Página Anterior
                </Button>
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  Página {paginatedBackpack.page} de {paginatedBackpack.totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={paginatedBackpack.page >= paginatedBackpack.totalPages}
                  onClick={() => setBackpackPage((p) => Math.min(paginatedBackpack.totalPages, p + 1))}
                  className="rounded-xl text-xs font-bold"
                >
                  Próxima Página
                </Button>
              </div>
            )}

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

      {/* Modal Interativo de Abertura de Pacote */}
      <PackOpeningModal
        pack={packToOpen}
        titlePrefix="Abrir Pacote"
        onConfirmOpen={confirmOpenPack}
        onClose={() => setPackToOpen(null)}
      />

      {/* Modal Animado de Abertura de Baú (Prévia ADM) */}
      <ChestOpeningModal
        chest={openingChest}
        outcome={chestOutcome}
        packsCatalog={packs}
        onClose={() => {
          setOpeningChest(null);
          setChestOutcome(null);
        }}
      />
    </div>
  );
}
