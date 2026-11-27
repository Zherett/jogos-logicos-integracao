// Módulo de análise de vendas da Loja de Moedas para o Painel ADM.
// Browser-safe (sem dependências de DOM/React) para reutilização direta na UI e em testes automatizados.

import { mergeWithDefaultCardPacks, type CardPackDefinition } from "./cards-catalog.ts";
import { normalizeCardPackId } from "./chests-catalog.ts";
import {
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  type AuraDefinition,
  type AvatarDefinition,
} from "./cosmetics-catalog.ts";
import { isAdminOrTestAccount, nickSlug } from "./player-profile.ts";

export type StoreAnalyticsItemKind = "avatar" | "aura" | "pack";

export type StoreAnalyticsSortBy = "quantity" | "coins" | "name";

export interface StoreAnalyticsPlayerSlice {
  id?: string;
  nick?: string;
  nickNormalized?: string;
  full_name?: string;
  school?: string | null;
  grade?: string | null;
  isAdmin?: boolean;
  deletedAt?: string | null;
  coinsSpentTotal?: number;
  purchasedCosmeticIds?: string[];
  purchasedPackCounts?: Record<string, number>;
  storeCoinsSpentByItem?: Record<string, number>;
}

export interface StoreAnalyticsCatalogInput {
  avatarsCatalog?: AvatarDefinition[] | null;
  aurasCatalog?: AuraDefinition[] | null;
  cardPacks?: CardPackDefinition[] | null;
}

export interface StoreAnalyticsBuyerEntry {
  playerId: string;
  nick: string;
  school?: string;
  quantity: number;
  coinsSpent: number;
  hasEstimatedCoins: boolean;
}

export interface StoreAnalyticsItemSummary {
  key: string;
  itemId: string;
  kind: StoreAnalyticsItemKind;
  name: string;
  currentPriceCoins: number | null;
  quantitySold: number;
  coinsSpent: number;
  hasEstimatedCoins: boolean;
  isRemovedFromCatalog: boolean;
  buyers: StoreAnalyticsBuyerEntry[];
}

export interface StoreAnalyticsCategoryTotals {
  units: number;
  coinsSpent: number;
  distinctItems: number;
}

export interface StoreAnalyticsReport {
  totalCoinsSpent: number;
  totalItemsPurchased: number;
  distinctItemsPurchased: number;
  uniqueBuyersCount: number;
  analyzedPlayersCount: number;
  excludedAdminAndTestCount: number;
  untrackedLegacyCoins: number;
  byKind: Record<StoreAnalyticsItemKind, StoreAnalyticsCategoryTotals>;
  items: StoreAnalyticsItemSummary[];
}

interface ItemAccumulator {
  key: string;
  itemId: string;
  kind: StoreAnalyticsItemKind;
  name: string;
  currentPriceCoins: number | null;
  quantitySold: number;
  coinsSpent: number;
  hasEstimatedCoins: boolean;
  isRemovedFromCatalog: boolean;
  buyersByPlayerId: Map<string, StoreAnalyticsBuyerEntry>;
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fallbackRemovedItemName(kind: StoreAnalyticsItemKind, itemId: string): string {
  const kindLabel = kind === "avatar" ? "Avatar" : kind === "aura" ? "Aura" : "Pacote";
  return `${kindLabel} removido (${itemId})`;
}

function resolveTrackedCoins(
  spentMap: Record<string, number> | undefined,
  key: string,
  fallbackEstimatedCoins: number,
): { coins: number; estimated: boolean } {
  if (spentMap && typeof spentMap === "object") {
    const raw = Number(spentMap[key]);
    if (Number.isFinite(raw) && raw > 0) {
      return { coins: Math.floor(raw), estimated: false };
    }
  }
  return {
    coins: Math.max(0, Math.floor(Number(fallbackEstimatedCoins) || 0)),
    estimated: true,
  };
}

function upsertBuyer(
  acc: ItemAccumulator,
  buyer: StoreAnalyticsBuyerEntry,
): void {
  const existing = acc.buyersByPlayerId.get(buyer.playerId);
  if (existing) {
    existing.quantity += buyer.quantity;
    existing.coinsSpent += buyer.coinsSpent;
    existing.hasEstimatedCoins = existing.hasEstimatedCoins || buyer.hasEstimatedCoins;
    if (!existing.school && buyer.school) {
      existing.school = buyer.school;
    }
    return;
  }
  acc.buyersByPlayerId.set(buyer.playerId, { ...buyer });
}

export function computeStoreSalesReport(
  players: readonly StoreAnalyticsPlayerSlice[],
  catalog: StoreAnalyticsCatalogInput = {},
  options: { includeAdminAndTest?: boolean } = {},
): StoreAnalyticsReport {
  const includeAdminAndTest = Boolean(options.includeAdminAndTest);

  const avatars = mergeWithDefaultAvatars(catalog.avatarsCatalog);
  const auras = mergeWithDefaultAuras(catalog.aurasCatalog);
  const packs = mergeWithDefaultCardPacks(catalog.cardPacks);

  const avatarById = new Map<string, AvatarDefinition>(avatars.map((a) => [a.id, a]));
  const auraById = new Map<string, AuraDefinition>(auras.map((a) => [a.id, a]));
  const packById = new Map<string, CardPackDefinition>(packs.map((p) => [p.id, p]));

  const itemMap = new Map<string, ItemAccumulator>();
  const uniqueBuyerKeys = new Set<string>();

  let analyzedPlayersCount = 0;
  let excludedAdminAndTestCount = 0;
  let totalCoinsSpent = 0;
  let totalUntrackedLegacyCoins = 0;

  function ensureAccumulator(
    key: string,
    itemId: string,
    kind: StoreAnalyticsItemKind,
  ): ItemAccumulator {
    const existing = itemMap.get(key);
    if (existing) return existing;

    let name = fallbackRemovedItemName(kind, itemId);
    let currentPriceCoins: number | null = null;
    let isRemovedFromCatalog = true;

    if (kind === "avatar") {
      const def = avatarById.get(itemId);
      if (def) {
        name = def.name;
        currentPriceCoins = Math.max(0, Math.floor(Number(def.priceCoins) || 0));
        isRemovedFromCatalog = false;
      }
    } else if (kind === "aura") {
      const def = auraById.get(itemId);
      if (def) {
        name = def.name;
        currentPriceCoins = Math.max(0, Math.floor(Number(def.priceCoins) || 0));
        isRemovedFromCatalog = false;
      }
    } else {
      const def = packById.get(itemId);
      if (def) {
        name = def.name;
        currentPriceCoins = Math.max(0, Math.floor(Number(def.priceCoins) || 0));
        isRemovedFromCatalog = false;
      }
    }

    const created: ItemAccumulator = {
      key,
      itemId,
      kind,
      name,
      currentPriceCoins,
      quantitySold: 0,
      coinsSpent: 0,
      hasEstimatedCoins: false,
      isRemovedFromCatalog,
      buyersByPlayerId: new Map(),
    };
    itemMap.set(key, created);
    return created;
  }

  // Deduplica snapshots repetidos do mesmo jogador (ex: pf_local_* + playfabId) e ignora lixeira (deletedAt)
  const dedupedPlayers = new Map<string, StoreAnalyticsPlayerSlice>();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p || p.deletedAt) continue;
    const rawKey = String(p.nickNormalized || p.nick || p.id || `player_${i}`);
    const canonicalKey = nickSlug(rawKey) || rawKey.toLowerCase().trim() || `player_${i}`;
    const existing = dedupedPlayers.get(canonicalKey);
    if (!existing) {
      dedupedPlayers.set(canonicalKey, p);
      continue;
    }
    const existingSpent = Number(existing.coinsSpentTotal) || 0;
    const nextSpent = Number(p.coinsSpentTotal) || 0;
    const existingItems =
      (Array.isArray(existing.purchasedCosmeticIds) ? existing.purchasedCosmeticIds.length : 0) +
      Object.keys(existing.purchasedPackCounts ?? {}).length;
    const nextItems =
      (Array.isArray(p.purchasedCosmeticIds) ? p.purchasedCosmeticIds.length : 0) +
      Object.keys(p.purchasedPackCounts ?? {}).length;
    if (nextSpent > existingSpent || (nextSpent === existingSpent && nextItems > existingItems)) {
      dedupedPlayers.set(canonicalKey, p);
    }
  }

  for (const [canonicalKey, p] of dedupedPlayers.entries()) {
    if (!includeAdminAndTest && isAdminOrTestAccount(p)) {
      excludedAdminAndTestCount += 1;
      continue;
    }
    analyzedPlayersCount += 1;

    const playerKey = canonicalKey;
    const playerNick = String(p.nick || p.full_name || p.id || "Aluno").trim() || "Aluno";
    const playerSpent = Number.isFinite(Number(p.coinsSpentTotal))
      ? Math.max(0, Math.floor(Number(p.coinsSpentTotal)))
      : 0;
    totalCoinsSpent += playerSpent;

    let playerTrackedItemCoins = 0;
    let playerMadePurchase = playerSpent > 0;

    // 1. Cosméticos comprados na loja (avatares e auras)
    const rawCosmetics = Array.isArray(p.purchasedCosmeticIds) ? p.purchasedCosmeticIds : [];
    const seenCosmeticKeys = new Set<string>();
    for (const rawKey of rawCosmetics) {
      if (typeof rawKey !== "string") continue;
      const cleanKey = rawKey.trim();
      if (!cleanKey || seenCosmeticKeys.has(cleanKey)) continue;

      let kind: StoreAnalyticsItemKind | null = null;
      let itemId = "";
      if (cleanKey.startsWith("avatar:")) {
        kind = "avatar";
        itemId = cleanKey.slice("avatar:".length).trim();
      } else if (cleanKey.startsWith("aura:")) {
        kind = "aura";
        itemId = cleanKey.slice("aura:".length).trim();
      }
      if (!kind || !itemId) continue;

      const normalizedKey = `${kind}:${itemId}`;
      if (seenCosmeticKeys.has(normalizedKey)) continue;
      seenCosmeticKeys.add(cleanKey);
      seenCosmeticKeys.add(normalizedKey);

      const acc = ensureAccumulator(normalizedKey, itemId, kind);
      const { coins, estimated } = resolveTrackedCoins(
        p.storeCoinsSpentByItem,
        normalizedKey,
        acc.currentPriceCoins ?? 0,
      );

      acc.quantitySold += 1;
      acc.coinsSpent += coins;
      acc.hasEstimatedCoins = acc.hasEstimatedCoins || estimated;
      playerTrackedItemCoins += coins;
      playerMadePurchase = true;

      upsertBuyer(acc, {
        playerId: playerKey,
        nick: playerNick,
        school: p.school ?? undefined,
        quantity: 1,
        coinsSpent: coins,
        hasEstimatedCoins: estimated,
      });
    }

    // 2. Pacotes de cartas comprados na loja (normalizando IDs legados)
    if (p.purchasedPackCounts && typeof p.purchasedPackCounts === "object") {
      const normalizedPacks = new Map<string, { qty: number; rawTrackedCoins: number; hasRawTracked: boolean }>();
      for (const [rawPackId, rawQty] of Object.entries(p.purchasedPackCounts)) {
        const trimmedRawId = String(rawPackId).trim();
        const qty = Math.floor(Number(rawQty));
        if (!trimmedRawId || !Number.isFinite(qty) || qty <= 0) continue;
        const packId = normalizeCardPackId(trimmedRawId);
        const cur = normalizedPacks.get(packId) ?? { qty: 0, rawTrackedCoins: 0, hasRawTracked: false };
        cur.qty += qty;
        const legacySpent = p.storeCoinsSpentByItem?.[`pack:${trimmedRawId}`];
        if (
          trimmedRawId !== packId &&
          typeof legacySpent === "number" &&
          Number.isFinite(legacySpent) &&
          legacySpent >= 0
        ) {
          cur.rawTrackedCoins += Math.floor(legacySpent);
          cur.hasRawTracked = true;
        }
        normalizedPacks.set(packId, cur);
      }

      for (const [packId, info] of normalizedPacks.entries()) {
        const packKey = `pack:${packId}`;
        const acc = ensureAccumulator(packKey, packId, "pack");
        const directTracked = p.storeCoinsSpentByItem?.[packKey];
        let coins = 0;
        let estimated = false;
        if (typeof directTracked === "number" && Number.isFinite(directTracked) && directTracked >= 0) {
          coins = Math.floor(directTracked) + info.rawTrackedCoins;
        } else if (info.hasRawTracked) {
          coins = info.rawTrackedCoins;
        } else {
          const resCoins = resolveTrackedCoins(
            p.storeCoinsSpentByItem,
            packKey,
            (acc.currentPriceCoins ?? 0) * info.qty,
          );
          coins = resCoins.coins;
          estimated = resCoins.estimated;
        }

        acc.quantitySold += info.qty;
        acc.coinsSpent += coins;
        acc.hasEstimatedCoins = acc.hasEstimatedCoins || estimated;
        playerTrackedItemCoins += coins;
        playerMadePurchase = true;

        upsertBuyer(acc, {
          playerId: playerKey,
          nick: playerNick,
          school: p.school ?? undefined,
          quantity: info.qty,
          coinsSpent: coins,
          hasEstimatedCoins: estimated,
        });
      }
    }

    totalUntrackedLegacyCoins += Math.max(0, playerSpent - playerTrackedItemCoins);

    if (playerMadePurchase) {
      uniqueBuyerKeys.add(playerKey);
    }
  }

  const byKind: Record<StoreAnalyticsItemKind, StoreAnalyticsCategoryTotals> = {
    avatar: { units: 0, coinsSpent: 0, distinctItems: 0 },
    aura: { units: 0, coinsSpent: 0, distinctItems: 0 },
    pack: { units: 0, coinsSpent: 0, distinctItems: 0 },
  };

  let totalItemsPurchased = 0;
  const items: StoreAnalyticsItemSummary[] = [];

  for (const acc of itemMap.values()) {
    const buyers = Array.from(acc.buyersByPlayerId.values()).sort(
      (a, b) =>
        b.quantity - a.quantity ||
        b.coinsSpent - a.coinsSpent ||
        a.nick.localeCompare(b.nick, "pt-BR", { sensitivity: "base" }),
    );
    const summary: StoreAnalyticsItemSummary = {
      key: acc.key,
      itemId: acc.itemId,
      kind: acc.kind,
      name: acc.name,
      currentPriceCoins: acc.currentPriceCoins,
      quantitySold: acc.quantitySold,
      coinsSpent: acc.coinsSpent,
      hasEstimatedCoins: acc.hasEstimatedCoins,
      isRemovedFromCatalog: acc.isRemovedFromCatalog,
      buyers,
    };
    items.push(summary);
    totalItemsPurchased += summary.quantitySold;
    byKind[summary.kind].units += summary.quantitySold;
    byKind[summary.kind].coinsSpent += summary.coinsSpent;
    byKind[summary.kind].distinctItems += 1;
  }

  items.sort(
    (a, b) =>
      b.quantitySold - a.quantitySold ||
      b.coinsSpent - a.coinsSpent ||
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );

  return {
    totalCoinsSpent,
    totalItemsPurchased,
    distinctItemsPurchased: items.length,
    uniqueBuyersCount: uniqueBuyerKeys.size,
    analyzedPlayersCount,
    excludedAdminAndTestCount,
    untrackedLegacyCoins: totalUntrackedLegacyCoins,
    byKind,
    items,
  };
}

export function filterAndSortStoreReportItems(
  items: readonly StoreAnalyticsItemSummary[],
  filter: {
    kind?: "all" | StoreAnalyticsItemKind;
    search?: string;
    sortBy?: StoreAnalyticsSortBy;
  } = {},
): StoreAnalyticsItemSummary[] {
  const kind = filter.kind ?? "all";
  const q = normalizeSearchText(filter.search ?? "");
  const sortBy = filter.sortBy ?? "quantity";

  const filtered = items.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (!q) return true;
    const hay = normalizeSearchText(`${item.name} ${item.itemId}`);
    return hay.includes(q);
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === "coins") {
      return (
        b.coinsSpent - a.coinsSpent ||
        b.quantitySold - a.quantitySold ||
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      );
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    }
    return (
      b.quantitySold - a.quantitySold ||
      b.coinsSpent - a.coinsSpent ||
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
  });
}
