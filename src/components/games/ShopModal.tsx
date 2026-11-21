import { useMemo, useState } from "react";
import { BadgeDollarSign, Check, Coins, Package, Palette, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import {
  getUnlockedAuraIds,
  getUnlockedAvatarIds,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  purchaseStoreCardPack,
  purchaseStoreCosmetic,
  type AuraDefinition,
  type AvatarDefinition,
} from "@/lib/cosmetics-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { syncActiveProfileChangeToPlayFab } from "@/lib/playfab";
import { recordScoreLedgerEntry } from "@/lib/score-history-ledger";
import { getAuraPresentation, PlayerAvatarBadge } from "./PlayerAvatarBadge";

interface ShopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShopPill = "destaques" | "pacotes" | "cosmeticos";

export function ShopModal({ open, onOpenChange }: ShopModalProps) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const [activePill, setActivePill] = useState<ShopPill>("destaques");
  const [cosmeticFilter, setCosmeticFilter] = useState<"todos" | "avatares" | "auras">("todos");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const packs = useMemo(
    () =>
      mergeWithDefaultCardPacks(auth.adminConfig.cardPacks).filter(
        (p) => p.enabled && p.showInStore !== false,
      ),
    [auth.adminConfig.cardPacks],
  );
  const avatars = useMemo(
    () =>
      mergeWithDefaultAvatars(auth.adminConfig.avatarsCatalog).filter(
        (a) => a.enabled && a.priceCoins > 0,
      ),
    [auth.adminConfig.avatarsCatalog],
  );
  const auras = useMemo(
    () =>
      mergeWithDefaultAuras(auth.adminConfig.aurasCatalog).filter(
        (a) => a.enabled && a.priceCoins > 0,
      ),
    [auth.adminConfig.aurasCatalog],
  );

  const unlockedAvatarSet = useMemo(
    () => new Set(getUnlockedAvatarIds(profile)),
    [profile],
  );
  const unlockedAuraSet = useMemo(
    () => new Set(getUnlockedAuraIds(profile)),
    [profile],
  );

  const coinsBalance = Math.max(0, Math.floor(Number(profile?.coins) || 0));

  async function handleBuyPack(pack: CardPackDefinition) {
    if (!profile) return;
    setBusyId(pack.id);
    setFeedback(null);
    try {
      const res = purchaseStoreCardPack(profile, pack, 1);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar o pacote.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile);
      try {
        recordScoreLedgerEntry({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "coins",
          source: "correio",
          amount: -res.totalCost,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja: 1x ${pack.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ Você comprou 1x ${pack.name}! Confira na sua Mochila.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleBuyAvatar(avatar: AvatarDefinition) {
    if (!profile) return;
    setBusyId(avatar.id);
    setFeedback(null);
    try {
      const res = purchaseStoreCosmetic(profile, "avatar", avatar);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar o avatar.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile);
      try {
        recordScoreLedgerEntry({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "coins",
          source: "correio",
          amount: -avatar.priceCoins,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja (Avatar): ${avatar.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ Avatar "${avatar.name}" desbloqueado! Já disponível em Personalizar Perfil.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleBuyAura(aura: AuraDefinition) {
    if (!profile) return;
    setBusyId(aura.id);
    setFeedback(null);
    try {
      const res = purchaseStoreCosmetic(profile, "aura", aura);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar a aura.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile);
      try {
        recordScoreLedgerEntry({
          playerId: profile.id,
          playerNick: profile.nick,
          type: "coins",
          source: "correio",
          amount: -aura.priceCoins,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja (Aura): ${aura.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ ${aura.name} desbloqueada! Já disponível em Personalizar Perfil.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleEquipAvatar(avatarId: string) {
    if (!profile) return;
    await syncActiveProfileChangeToPlayFab({
      ...profile,
      equippedAvatar: {
        id: avatarId,
        color: profile.equippedAvatar?.color,
      },
    });
    await auth.refresh();
    setFeedback("✨ Avatar equipado no seu perfil!");
  }

  async function handleEquipAura(auraId: string) {
    if (!profile) return;
    await syncActiveProfileChangeToPlayFab({
      ...profile,
      equippedAuraId: auraId,
    });
    await auth.refresh();
    setFeedback("✨ Aura equipada no seu perfil!");
  }

  const featuredPacks = packs.filter((p) => p.featuredInStore);
  const featuredAvatars = avatars.filter((a) => a.featured);
  const featuredAuras = auras.filter((a) => a.featured);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden rounded-3xl sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2 font-display text-xl sm:text-2xl font-black">
              <BadgeDollarSign className="h-6 w-6 text-amber-500" />
              Loja de Moedas
              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                Prévia ADM
              </span>
            </DialogTitle>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 font-mono text-sm font-black text-amber-600 dark:text-amber-400">
              <Coins className="h-4 w-4" />
              <span>{coinsBalance} moedas</span>
            </div>
          </div>

          {/* Navegação em Pílulas */}
          <div className="grid grid-cols-3 gap-1 rounded-full border border-border/70 bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setActivePill("destaques")}
              className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activePill === "destaques"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="h-4 w-4" />
              <span>Destaques</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePill("pacotes")}
              className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activePill === "pacotes"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Pacotes de Cartas</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePill("cosmeticos")}
              className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activePill === "cosmeticos"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="h-4 w-4" />
              <span>Cosméticos</span>
            </button>
          </div>
        </DialogHeader>

        {feedback && (
          <div className="shrink-0 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-foreground">
            {feedback}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1 py-1">
          {activePill === "destaques" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent p-3.5 text-xs">
                <div className="font-display text-sm font-black text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Vitrine em Destaque
                </div>
                <p className="text-muted-foreground mt-0.5">
                  Use suas moedas conquistadas em missões, medalhas, níveis, ranqueadas e baús! (Baús são exclusivos de conquista e não são vendidos na loja.)
                </p>
              </div>

              {featuredAvatars.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Avatares em Destaque
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {featuredAvatars.map((av) => {
                      const owned = unlockedAvatarSet.has(av.id);
                      const equipped = profile?.equippedAvatar?.id === av.id;
                      return (
                        <div
                          key={av.id}
                          className="flex flex-col justify-between gap-2.5 rounded-2xl border bg-card p-3 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatarBadge avatar={av} size="sm" />
                            <div className="min-w-0">
                              <div className="font-display text-sm font-black truncate">{av.name}</div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2">{av.description}</p>
                            </div>
                          </div>
                          {owned ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={equipped ? "secondary" : "outline"}
                              disabled={equipped}
                              onClick={() => void handleEquipAvatar(av.id)}
                              className="w-full rounded-xl text-xs font-bold"
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              {equipped ? "Equipado" : "Adquirido • Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === av.id || coinsBalance < av.priceCoins}
                              onClick={() => void handleBuyAvatar(av)}
                              className="w-full rounded-xl text-xs font-bold"
                            >
                              🪙 {av.priceCoins} moedas
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {featuredAuras.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Auras em Destaque
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {featuredAuras.map((aura) => {
                      const owned = unlockedAuraSet.has(aura.id);
                      const equipped = profile?.equippedAuraId === aura.id;
                      const pres = getAuraPresentation(aura);
                      return (
                        <div
                          key={aura.id}
                          className={`flex items-center justify-between gap-3 rounded-2xl border-2 bg-card p-3 ${pres.className}`}
                          style={pres.style}
                        >
                          <div className="min-w-0">
                            <div className="font-display text-sm font-black truncate">{aura.name}</div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{aura.description}</p>
                          </div>
                          {owned ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={equipped ? "secondary" : "outline"}
                              disabled={equipped}
                              onClick={() => void handleEquipAura(aura.id)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              {equipped ? "Equipada" : "Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === aura.id || coinsBalance < aura.priceCoins}
                              onClick={() => void handleBuyAura(aura)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              🪙 {aura.priceCoins}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {featuredPacks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Pacotes em Destaque
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {featuredPacks.map((pack) => {
                      const price = Math.max(1, Math.floor(Number(pack.priceCoins) || 40));
                      return (
                        <div
                          key={pack.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-display text-sm font-black truncate">{pack.name}</div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{pack.description}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === pack.id || coinsBalance < price}
                            onClick={() => void handleBuyPack(pack)}
                            className="shrink-0 rounded-xl text-xs font-bold"
                          >
                            🪙 {price}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activePill === "pacotes" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {packs.map((pack) => {
                const price = Math.max(1, Math.floor(Number(pack.priceCoins) || 40));
                return (
                  <div
                    key={pack.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-3.5 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-black text-foreground">
                          {pack.name}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold">
                          {pack.cardsPerPack} cartas
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{pack.description}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === pack.id || coinsBalance < price}
                      onClick={() => void handleBuyPack(pack)}
                      className="w-full rounded-xl text-xs font-bold"
                    >
                      Comprar por 🪙 {price} moedas
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {activePill === "cosmeticos" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(["todos", "avatares", "auras"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCosmeticFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${
                      cosmeticFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground"
                    }`}
                  >
                    {f === "todos" ? "Todos" : f === "avatares" ? `Avatares (${avatars.length})` : `Auras (${auras.length})`}
                  </button>
                ))}
              </div>

              {(cosmeticFilter === "todos" || cosmeticFilter === "avatares") && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Avatares
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {avatars.map((av) => {
                      const owned = unlockedAvatarSet.has(av.id);
                      const equipped = profile?.equippedAvatar?.id === av.id;
                      return (
                        <div
                          key={av.id}
                          className="flex flex-col justify-between gap-2.5 rounded-2xl border bg-card p-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatarBadge avatar={av} size="sm" />
                            <div className="min-w-0">
                              <div className="font-display text-sm font-black truncate">{av.name}</div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2">{av.description}</p>
                            </div>
                          </div>
                          {owned ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={equipped ? "secondary" : "outline"}
                              disabled={equipped}
                              onClick={() => void handleEquipAvatar(av.id)}
                              className="w-full rounded-xl text-xs font-bold"
                            >
                              {equipped ? "Equipado" : "Adquirido • Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === av.id || coinsBalance < av.priceCoins}
                              onClick={() => void handleBuyAvatar(av)}
                              className="w-full rounded-xl text-xs font-bold"
                            >
                              🪙 {av.priceCoins} moedas
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(cosmeticFilter === "todos" || cosmeticFilter === "auras") && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Auras do Perfil
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {auras.map((aura) => {
                      const owned = unlockedAuraSet.has(aura.id);
                      const equipped = profile?.equippedAuraId === aura.id;
                      const pres = getAuraPresentation(aura);
                      return (
                        <div
                          key={aura.id}
                          className={`flex items-center justify-between gap-3 rounded-2xl border-2 bg-card p-3 ${pres.className}`}
                          style={pres.style}
                        >
                          <div className="min-w-0">
                            <div className="font-display text-sm font-black truncate">{aura.name}</div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{aura.description}</p>
                          </div>
                          {owned ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={equipped ? "secondary" : "outline"}
                              disabled={equipped}
                              onClick={() => void handleEquipAura(aura.id)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              {equipped ? "Equipada" : "Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === aura.id || coinsBalance < aura.priceCoins}
                              onClick={() => void handleBuyAura(aura)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              🪙 {aura.priceCoins}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
