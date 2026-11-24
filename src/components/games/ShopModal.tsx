import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeDollarSign, Check, Coins, Package, Palette, Search, Sparkles, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  mergeWithDefaultCardPacks,
  resolvePackCardPool,
  type CardPackDefinition,
} from "@/lib/cards-catalog";
import {
  AVATAR_LETTER_VARIANTS,
  getAvatarCategory,
  getUnlockedAuraIds,
  getUnlockedAvatarIds,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  purchaseStoreCardPack,
  purchaseStoreCosmetic,
  type AuraDefinition,
  type AvatarCategory,
  type AvatarDefinition,
  type AvatarLetterVariant,
} from "@/lib/cosmetics-catalog";
import { usePlayerAuth } from "@/lib/player-auth";
import { getActiveAccount, syncActiveProfileChangeToPlayFab } from "@/lib/playfab";
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
  const [avatarSubcategory, setAvatarSubcategory] = useState<AvatarCategory>("icon");
  const [letterVariantFilter, setLetterVariantFilter] = useState<"all" | AvatarLetterVariant>("all");
  const [letterSearch, setLetterSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionLockRef = useRef(false);

  useEffect(() => {
    if (open) {
      setFeedback(null);
    }
  }, [open]);

  useEffect(() => {
    setFeedback(null);
  }, [activePill]);

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
      if (letterVariantFilter !== "all" && av.letterVariant !== letterVariantFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${av.letterChar ?? ""} ${av.name} ${av.description}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return hay.includes(q);
    });
  }, [letterAvatars, letterVariantFilter, letterSearch]);
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
  const isShopReleasedForStudents = Boolean(auth.adminConfig.rolloutFlags?.enableShopForStudents);
  const cardsCatalog = auth.adminConfig.cardsCatalog ?? [];
  const hasCardCatalog = cardsCatalog.length > 0;
  const packHasCardsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of packs) {
      map.set(p.id, resolvePackCardPool(p, cardsCatalog).length > 0);
    }
    return map;
  }, [packs, cardsCatalog]);

  async function handleBuyPack(pack: CardPackDefinition) {
    if (!profile || busyId || actionLockRef.current) return;
    if (!hasCardCatalog || !packHasCardsMap.get(pack.id)) {
      setFeedback("⚠️ Este pacote ainda não possui cartas cadastradas no catálogo.");
      return;
    }
    actionLockRef.current = true;
    setBusyId(pack.id);
    setFeedback(null);
    try {
      // Lê o estado mais recente direto do localStorage para impedir gasto duplicado em múltiplas abas
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const res = purchaseStoreCardPack(liveProfile, pack, 1);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar o pacote.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile, { requireServerSync: true });
      try {
        recordScoreLedgerEntry({
          playerId: liveProfile.id,
          playerNick: liveProfile.nick,
          type: "coins",
          source: "compra_loja",
          amount: -res.totalCost,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja: 1x ${pack.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ Você comprou 1x ${pack.name}! Confira na sua Mochila.`);
    } catch (err) {
      setFeedback(
        err instanceof Error && err.message
          ? `⚠️ ${err.message}`
          : "⚠️ Não foi possível concluir a compra no servidor. Tente novamente.",
      );
    } finally {
      actionLockRef.current = false;
      setBusyId(null);
    }
  }

  async function handleBuyAvatar(avatar: AvatarDefinition) {
    if (!profile || busyId || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyId(avatar.id);
    setFeedback(null);
    try {
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const res = purchaseStoreCosmetic(liveProfile, "avatar", avatar);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar o avatar.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile, { requireServerSync: true });
      try {
        recordScoreLedgerEntry({
          playerId: liveProfile.id,
          playerNick: liveProfile.nick,
          type: "coins",
          source: "compra_loja",
          amount: -res.pricePaid,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja (Avatar): ${avatar.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ Avatar "${avatar.name}" desbloqueado! Já disponível em Personalizar Perfil.`);
    } catch (err) {
      setFeedback(
        err instanceof Error && err.message
          ? `⚠️ ${err.message}`
          : "⚠️ Não foi possível concluir a compra no servidor. Tente novamente.",
      );
    } finally {
      actionLockRef.current = false;
      setBusyId(null);
    }
  }

  async function handleBuyAura(aura: AuraDefinition) {
    if (!profile || busyId || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyId(aura.id);
    setFeedback(null);
    try {
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const res = purchaseStoreCosmetic(liveProfile, "aura", aura);
      if (!res.ok) {
        setFeedback(res.error ?? "Não foi possível comprar a aura.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.profile, { requireServerSync: true });
      try {
        recordScoreLedgerEntry({
          playerId: liveProfile.id,
          playerNick: liveProfile.nick,
          type: "coins",
          source: "compra_loja",
          amount: -res.pricePaid,
          balanceAfter: res.profile.coins,
          reason: `Compra na Loja (Aura): ${aura.name}`,
        });
      } catch {
        /* ignore */
      }
      await auth.refresh();
      setFeedback(`✅ ${aura.name} desbloqueada! Já disponível em Personalizar Perfil.`);
    } catch (err) {
      setFeedback(
        err instanceof Error && err.message
          ? `⚠️ ${err.message}`
          : "⚠️ Não foi possível concluir a compra no servidor. Tente novamente.",
      );
    } finally {
      actionLockRef.current = false;
      setBusyId(null);
    }
  }

  async function handleEquipAvatar(avatarId: string) {
    if (!profile || busyId || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyId(`equip:${avatarId}`);
    setFeedback(null);
    try {
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const liveOwned = new Set(getUnlockedAvatarIds(liveProfile));
      if (!liveOwned.has(avatarId)) {
        setFeedback("⚠️ Este avatar ainda não está desbloqueado na sua conta.");
        return;
      }
      const prevSecondary = liveProfile.equippedAvatar?.secondaryId;
      await syncActiveProfileChangeToPlayFab(
        {
          ...liveProfile,
          equippedAvatar: {
            id: avatarId,
            ...(prevSecondary && prevSecondary !== avatarId ? { secondaryId: prevSecondary } : {}),
            color: liveProfile.equippedAvatar?.color,
          },
        },
        { requireServerSync: true },
      );
      await auth.refresh();
      setFeedback("✨ Avatar equipado no seu perfil!");
    } catch (err) {
      setFeedback(
        err instanceof Error && err.message
          ? `⚠️ ${err.message}`
          : "⚠️ Não foi possível salvar o avatar no servidor. Tente novamente.",
      );
    } finally {
      actionLockRef.current = false;
      setBusyId(null);
    }
  }

  async function handleEquipAura(auraId: string) {
    if (!profile || busyId || actionLockRef.current) return;
    actionLockRef.current = true;
    setBusyId(`equip:${auraId}`);
    setFeedback(null);
    try {
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const liveOwned = new Set(getUnlockedAuraIds(liveProfile));
      if (!liveOwned.has(auraId)) {
        setFeedback("⚠️ Esta aura ainda não está desbloqueada na sua conta.");
        return;
      }
      await syncActiveProfileChangeToPlayFab(
        {
          ...liveProfile,
          equippedAuraId: auraId,
        },
        { requireServerSync: true },
      );
      await auth.refresh();
      setFeedback("✨ Aura equipada no seu perfil!");
    } catch (err) {
      setFeedback(
        err instanceof Error && err.message
          ? `⚠️ ${err.message}`
          : "⚠️ Não foi possível salvar a aura no servidor. Tente novamente.",
      );
    } finally {
      actionLockRef.current = false;
      setBusyId(null);
    }
  }

  const featuredPacks = packs.filter((p) => p.featuredInStore);
  const featuredAvatars = avatars.filter((a) => a.featured);
  const featuredAuras = auras.filter((a) => a.featured);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(86vh,46rem)] max-h-[90vh] flex flex-col overflow-hidden rounded-3xl sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2 font-display text-xl sm:text-2xl font-black">
              <BadgeDollarSign className="h-6 w-6 text-amber-500" />
              Loja de Moedas
              {!isShopReleasedForStudents && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                  Prévia ADM
                </span>
              )}
            </DialogTitle>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 font-mono text-sm font-black text-amber-600 dark:text-amber-400">
              <Coins className="h-4 w-4" />
              <span>{coinsBalance} moedas</span>
            </div>
          </div>

          {auth.cloudSessionExpired && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <span>🔑 Sessão na nuvem expirada (24h). Renove o login para comprar na Loja.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => auth.openReloginDialog()}
                className="h-7 rounded-xl border-amber-500/50 bg-background/80 text-xs font-extrabold"
              >
                Renovar Login
              </Button>
            </div>
          )}

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

        <div className="shrink-0 min-h-[2.35rem] flex items-center">
          {feedback ? (
            <div className="w-full rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-foreground">
              {feedback}
            </div>
          ) : (
            <div className="w-full rounded-2xl border border-border/40 bg-secondary/20 px-3.5 py-2 text-[11px] font-medium text-muted-foreground">
              Selecione um item ou pacote abaixo para comprar com suas moedas.
            </div>
          )}
        </div>

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
                      const equippedSecondary = profile?.equippedAvatar?.secondaryId === av.id;
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
                              disabled={busyId !== null || equipped}
                              onClick={() => void handleEquipAvatar(av.id)}
                              className="w-full rounded-xl text-xs font-bold"
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              {equipped
                                ? "Equipado (1º)"
                                : equippedSecondary
                                  ? "No 2º slot • Tornar 1º"
                                  : "Adquirido • Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId !== null || coinsBalance < av.priceCoins}
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
                              disabled={busyId !== null || equipped}
                              onClick={() => void handleEquipAura(aura.id)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              {equipped ? "Equipada" : "Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId !== null || coinsBalance < aura.priceCoins}
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
                      const packReady = hasCardCatalog && Boolean(packHasCardsMap.get(pack.id));
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
                            disabled={busyId !== null || !packReady || coinsBalance < price}
                            onClick={() => void handleBuyPack(pack)}
                            className="shrink-0 rounded-xl text-xs font-bold"
                            title={!packReady ? "Pacote sem cartas disponíveis no catálogo" : undefined}
                          >
                            {packReady ? `🪙 ${price}` : "Em breve"}
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
            <div className="space-y-3">
              {!hasCardCatalog && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  📦 O catálogo de cartas colecionáveis ainda está sendo finalizado pela equipe. Os pacotes ficarão disponíveis para compra assim que as cartas forem publicadas!
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packs.map((pack) => {
                  const price = Math.max(1, Math.floor(Number(pack.priceCoins) || 40));
                  const packReady = hasCardCatalog && Boolean(packHasCardsMap.get(pack.id));
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
                        disabled={busyId !== null || !packReady || coinsBalance < price}
                        onClick={() => void handleBuyPack(pack)}
                        className="w-full rounded-xl text-xs font-bold"
                      >
                        {packReady ? `Comprar por 🪙 ${price} moedas` : "Indisponível (sem cartas no pacote)"}
                      </Button>
                    </div>
                  );
                })}
              </div>
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
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Avatares
                    </div>
                    {/* Subcategoria em pílulas: Ícones | Letras */}
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => setAvatarSubcategory("icon")}
                        className={`rounded-full px-3 py-1 text-[11px] font-extrabold transition-all cursor-pointer ${
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
                        className={`rounded-full px-3 py-1 text-[11px] font-extrabold transition-all cursor-pointer ${
                          avatarSubcategory === "letter"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Letras ({letterAvatars.length})
                      </button>
                    </div>
                  </div>

                  {avatarSubcategory === "letter" && (
                    <div className="space-y-2.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            value={letterSearch}
                            onChange={(e) => setLetterSearch(e.target.value)}
                            placeholder="Pesquisar letra (ex.: A, J, Simples, Arredondada, Quadrada)..."
                            className="h-8 rounded-xl pl-8 pr-8 text-xs bg-background"
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

                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setLetterVariantFilter("all")}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all cursor-pointer ${
                              letterVariantFilter === "all"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border/60 hover:text-foreground"
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
                                  : "bg-background text-muted-foreground border-border/60 hover:text-foreground"
                              }`}
                            >
                              {v.shortLabel}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        💡 Ao alcançar o <b>Nível 5</b>, a letra inicial do seu apelido na fonte <b>Simples</b> é liberada gratuitamente no seu inventário!
                      </p>
                    </div>
                  )}

                  {(() => {
                    const visibleAvatars =
                      avatarSubcategory === "icon" ? iconAvatars : filteredLetterAvatars;
                    if (visibleAvatars.length === 0) {
                      return (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/15 p-6 text-center text-xs text-muted-foreground">
                          {avatarSubcategory === "icon"
                            ? "Nenhum avatar de ícone disponível na loja no momento."
                            : letterSearch.trim()
                              ? `Nenhuma letra encontrada para "${letterSearch}".`
                              : "Nenhuma letra disponível para este filtro."}
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {visibleAvatars.map((av) => {
                          const owned = unlockedAvatarSet.has(av.id);
                          const equipped = profile?.equippedAvatar?.id === av.id;
                          const equippedSecondary = profile?.equippedAvatar?.secondaryId === av.id;
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
                                  disabled={busyId !== null || equipped}
                                  onClick={() => void handleEquipAvatar(av.id)}
                                  className="w-full rounded-xl text-xs font-bold"
                                >
                                  {equipped
                                    ? "Equipado (1º)"
                                    : equippedSecondary
                                      ? "No 2º slot • Tornar 1º"
                                      : "Adquirido • Equipar"}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busyId !== null || coinsBalance < av.priceCoins}
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
                    );
                  })()}
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
                              disabled={busyId !== null || equipped}
                              onClick={() => void handleEquipAura(aura.id)}
                              className="shrink-0 rounded-xl text-xs font-bold"
                            >
                              {equipped ? "Equipada" : "Equipar"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId !== null || coinsBalance < aura.priceCoins}
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
