// Catálogo de Cartas Colecionáveis, Raridades e Pacotes (browser-safe)

export type CardRarity = "comum" | "incomum" | "rara" | "epica" | "lendaria";

export const CARD_RARITIES: readonly CardRarity[] = [
  "comum",
  "incomum",
  "rara",
  "epica",
  "lendaria",
] as const;

export interface CardRarityMeta {
  id: CardRarity;
  label: string;
  borderClass: string;
  cardBgClass: string;
  innerBoxClass: string;
  badgeClass: string;
  glowClass: string;
}

export const CARD_RARITY_META: Record<CardRarity, CardRarityMeta> = {
  comum: {
    id: "comum",
    label: "Comum",
    borderClass: "border-slate-300 dark:border-slate-500/80",
    cardBgClass: "bg-white dark:bg-slate-900",
    innerBoxClass:
      "bg-slate-100/90 border-slate-300/80 text-slate-900 dark:bg-slate-950/90 dark:border-slate-700/80 dark:text-slate-100",
    badgeClass:
      "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-950/95 dark:text-slate-200 dark:border-slate-500/70",
    glowClass: "shadow-sm dark:shadow-[0_0_14px_-3px_rgba(148,163,184,0.35)]",
  },
  incomum: {
    id: "incomum",
    label: "Incomum",
    borderClass: "border-emerald-500 dark:border-emerald-400",
    cardBgClass: "bg-emerald-500 dark:bg-emerald-700",
    innerBoxClass:
      "bg-white/95 border-emerald-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-emerald-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-emerald-700 border-emerald-600/50 dark:bg-slate-950/95 dark:text-emerald-300 dark:border-emerald-400/80",
    glowClass: "shadow-[0_0_18px_-2px_rgba(16,185,129,0.55)] dark:shadow-[0_0_18px_-2px_rgba(16,185,129,0.65)]",
  },
  rara: {
    id: "rara",
    label: "Rara",
    borderClass: "border-blue-500 dark:border-blue-400",
    cardBgClass: "bg-blue-500 dark:bg-blue-700",
    innerBoxClass:
      "bg-white/95 border-blue-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-blue-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-blue-700 border-blue-600/50 dark:bg-slate-950/95 dark:text-blue-300 dark:border-blue-400/80",
    glowClass: "shadow-[0_0_20px_-2px_rgba(59,130,246,0.6)] dark:shadow-[0_0_20px_-2px_rgba(59,130,246,0.7)]",
  },
  epica: {
    id: "epica",
    label: "Épica",
    borderClass: "border-purple-500 dark:border-purple-400",
    cardBgClass: "bg-purple-500 dark:bg-purple-700",
    innerBoxClass:
      "bg-white/95 border-purple-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-purple-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-purple-700 border-purple-600/50 dark:bg-slate-950/95 dark:text-purple-300 dark:border-purple-400/80",
    glowClass: "shadow-[0_0_22px_-2px_rgba(168,85,247,0.65)] dark:shadow-[0_0_22px_-2px_rgba(168,85,247,0.75)]",
  },
  lendaria: {
    id: "lendaria",
    label: "Lendária",
    borderClass: "border-red-500 dark:border-red-400",
    cardBgClass: "bg-red-500 dark:bg-red-700",
    innerBoxClass:
      "bg-white/95 border-red-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-red-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-red-700 border-red-600/50 dark:bg-slate-950/95 dark:text-red-300 dark:border-red-400/80",
    glowClass: "shadow-[0_0_26px_-1px_rgba(239,68,68,0.75)] dark:shadow-[0_0_26px_-1px_rgba(239,68,68,0.85)]",
  },
};

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  imageUrl: string;
  isFoil?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PackProbabilities = Record<CardRarity, number>;

export interface CardPackDefinition {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  cardsPerPack: number;
  probabilities: PackProbabilities;
  /** Lista opcional de IDs de cartas permitidas neste pacote. Null/vazio = todas as cartas do catálogo. */
  cardIds?: string[] | null;
  pricePoints?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CARD_PACKS: CardPackDefinition[] = [
  {
    id: "pack_basico",
    name: "Pacote Básico",
    description: "Sem incremento de raridade — ideal para iniciar a coleção com cartas comuns.",
    isDefault: true,
    cardsPerPack: 5,
    probabilities: { comum: 70, incomum: 20, rara: 7, epica: 2.5, lendaria: 0.5 },
    cardIds: null,
    pricePoints: 100,
    enabled: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
  {
    id: "pack_iniciante",
    name: "Pacote Iniciante",
    description: "Chances ampliadas de cartas Incomuns (borda verde).",
    isDefault: true,
    cardsPerPack: 5,
    probabilities: { comum: 35, incomum: 45, rara: 14, epica: 4.5, lendaria: 1.5 },
    cardIds: null,
    pricePoints: 200,
    enabled: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
  {
    id: "pack_explorador",
    name: "Pacote Explorador",
    description: "Foco em cartas Raras (borda azul) com bom salto de probabilidade.",
    isDefault: true,
    cardsPerPack: 5,
    probabilities: { comum: 15, incomum: 30, rara: 40, epica: 11, lendaria: 4 },
    cardIds: null,
    pricePoints: 350,
    enabled: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
  {
    id: "pack_mestre",
    name: "Pacote Mestre",
    description: "Altas chances de cartas Épicas (borda lilás).",
    isDefault: true,
    cardsPerPack: 5,
    probabilities: { comum: 5, incomum: 15, rara: 30, epica: 40, lendaria: 10 },
    cardIds: null,
    pricePoints: 600,
    enabled: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
  {
    id: "pack_supremo",
    name: "Pacote Supremo",
    description: "O pacote mais poderoso — chance máxima de cartas Lendárias (borda vermelha).",
    isDefault: true,
    cardsPerPack: 5,
    probabilities: { comum: 0, incomum: 5, rara: 20, epica: 35, lendaria: 40 },
    cardIds: null,
    pricePoints: 1000,
    enabled: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
];

export function isValidCardMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function sumPackProbabilities(probs: PackProbabilities): number {
  const total = CARD_RARITIES.reduce((acc, r) => acc + (Number(probs[r]) || 0), 0);
  return Math.round(total * 100) / 100;
}

export function validatePackProbabilities(probs: PackProbabilities): {
  valid: boolean;
  total: number;
  error?: string;
} {
  for (const r of CARD_RARITIES) {
    const v = Number(probs[r]);
    if (Number.isNaN(v) || v < 0) {
      return { valid: false, total: 0, error: `Porcentagem inválida em ${CARD_RARITY_META[r].label}.` };
    }
  }
  const total = sumPackProbabilities(probs);
  if (Math.abs(total - 100) > 0.05) {
    return {
      valid: false,
      total,
      error: `A soma das porcentagens deve ser 100% (atual: ${total}%).`,
    };
  }
  return { valid: true, total };
}

export function createCardDefinition(input: {
  name: string;
  description: string;
  rarity: CardRarity;
  imageUrl: string;
  isFoil?: boolean;
}): { card: CardDefinition | null; error?: string } {
  const name = input.name.trim();
  const description = input.description.trim();
  const imageUrl = input.imageUrl.trim();
  if (!name) return { card: null, error: "Informe o nome da carta." };
  if (!isValidCardMediaUrl(imageUrl)) {
    return { card: null, error: "Informe um link HTTPS válido (ou caminho local /...) para a imagem ou GIF." };
  }
  const now = new Date().toISOString();
  return {
    card: {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      description,
      rarity: input.rarity,
      imageUrl,
      isFoil: Boolean(input.isFoil),
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Edita uma carta existente mantendo a raridade IMUTÁVEL.
 */
export function editCardDefinition(
  existing: CardDefinition,
  patch: { name?: string; description?: string; imageUrl?: string; isFoil?: boolean },
): { card: CardDefinition | null; error?: string } {
  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  const nextDesc = patch.description !== undefined ? patch.description.trim() : existing.description;
  const nextUrl = patch.imageUrl !== undefined ? patch.imageUrl.trim() : existing.imageUrl;
  const nextFoil = patch.isFoil !== undefined ? Boolean(patch.isFoil) : Boolean(existing.isFoil);

  if (!nextName) return { card: null, error: "O nome da carta não pode ficar vazio." };
  if (!isValidCardMediaUrl(nextUrl)) {
    return { card: null, error: "Link de imagem/GIF inválido. Utilize HTTPS." };
  }

  return {
    card: {
      ...existing,
      name: nextName,
      description: nextDesc,
      imageUrl: nextUrl,
      isFoil: nextFoil,
      rarity: existing.rarity, // Raridade nunca pode ser alterada após criação
      updatedAt: new Date().toISOString(),
    },
  };
}

export function resolvePackCardPool(
  pack: CardPackDefinition,
  allCards: CardDefinition[],
): CardDefinition[] {
  if (Array.isArray(pack.cardIds) && pack.cardIds.length > 0) {
    const allowed = new Set(pack.cardIds);
    return allCards.filter((c) => allowed.has(c.id));
  }
  return allCards;
}

function pickRarityWithFallback(
  probs: PackProbabilities,
  availableByRarity: Map<CardRarity, CardDefinition[]>,
  rng: () => number,
): CardRarity | null {
  const roll = rng() * 100;
  let cumulative = 0;
  let chosen: CardRarity = CARD_RARITIES[0];

  for (const r of CARD_RARITIES) {
    cumulative += Math.max(0, Number(probs[r]) || 0);
    if (roll < cumulative) {
      chosen = r;
      break;
    }
  }

  if ((availableByRarity.get(chosen)?.length ?? 0) > 0) {
    return chosen;
  }

  // Fallback para a raridade disponível mais próxima
  const idx = CARD_RARITIES.indexOf(chosen);
  for (let offset = 1; offset < CARD_RARITIES.length; offset++) {
    if (idx - offset >= 0) {
      const lower = CARD_RARITIES[idx - offset];
      if ((availableByRarity.get(lower)?.length ?? 0) > 0) return lower;
    }
    if (idx + offset < CARD_RARITIES.length) {
      const higher = CARD_RARITIES[idx + offset];
      if ((availableByRarity.get(higher)?.length ?? 0) > 0) return higher;
    }
  }
  return null;
}

export interface OpenPackResult {
  drawnCards: CardDefinition[];
  updatedCardsMap: Record<string, number>;
  newlyDiscoveredIds: string[];
  error?: string;
}

export function openCardPack(
  pack: CardPackDefinition,
  allCards: CardDefinition[],
  currentCardsMap: Record<string, number> = {},
  rng: () => number = Math.random,
): OpenPackResult {
  const pool = resolvePackCardPool(pack, allCards);
  if (pool.length === 0) {
    return {
      drawnCards: [],
      updatedCardsMap: { ...currentCardsMap },
      newlyDiscoveredIds: [],
      error: "Nenhuma carta disponível neste pacote.",
    };
  }

  const byRarity = new Map<CardRarity, CardDefinition[]>();
  for (const r of CARD_RARITIES) byRarity.set(r, []);
  for (const c of pool) {
    byRarity.get(c.rarity)?.push(c);
  }

  const countToDraw = Math.max(1, Math.min(20, Math.floor(pack.cardsPerPack || 5)));
  const drawnCards: CardDefinition[] = [];
  const updatedCardsMap: Record<string, number> = { ...currentCardsMap };
  const newlyDiscoveredSet = new Set<string>();

  for (let i = 0; i < countToDraw; i++) {
    const rarity = pickRarityWithFallback(pack.probabilities, byRarity, rng);
    if (!rarity) break;
    const candidates = byRarity.get(rarity) ?? [];
    if (candidates.length === 0) continue;
    const picked = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    drawnCards.push(picked);
    const prevCount = updatedCardsMap[picked.id] ?? 0;
    if (prevCount === 0) {
      newlyDiscoveredSet.add(picked.id);
    }
    updatedCardsMap[picked.id] = prevCount + 1;
  }

  return {
    drawnCards,
    updatedCardsMap,
    newlyDiscoveredIds: Array.from(newlyDiscoveredSet),
  };
}

const RARITY_REVEAL_RANK: Record<CardRarity, number> = {
  comum: 0,
  incomum: 1,
  rara: 2,
  epica: 3,
  lendaria: 4,
};

/**
 * Ordena as cartas sorteadas para a revelação:
 * - Padrão: menor raridade primeiro e maior raridade por último (clímax).
 * - Pequena chance (~12%) de mover uma carta de maior raridade para o meio.
 * - Chance bem pequena (~4%) de colocá-la logo na frente.
 */
export function orderPackRevealCards(
  drawnCards: CardDefinition[],
  rng: () => number = Math.random,
): CardDefinition[] {
  if (drawnCards.length <= 1) return [...drawnCards];

  const ordered = [...drawnCards].sort((a, b) => {
    const rankDiff = RARITY_REVEAL_RANK[a.rarity] - RARITY_REVEAL_RANK[b.rarity];
    if (rankDiff !== 0) return rankDiff;
    return (a.isFoil ? 1 : 0) - (b.isFoil ? 1 : 0);
  });

  const highest = ordered[ordered.length - 1];
  const lowest = ordered[0];
  const hasHigherRarity =
    RARITY_REVEAL_RANK[highest.rarity] > RARITY_REVEAL_RANK[lowest.rarity];

  if (!hasHigherRarity) return ordered;

  const surpriseRoll = rng();
  if (surpriseRoll < 0.04) {
    // 4% de chance de surpresa logo na primeira carta
    ordered.pop();
    ordered.unshift(highest);
  } else if (surpriseRoll < 0.16 && ordered.length >= 3) {
    // 12% de chance de aparecer no meio da pilha
    ordered.pop();
    const midIdx = Math.floor(ordered.length / 2);
    ordered.splice(midIdx, 0, highest);
  }

  return ordered;
}

export function mergeWithDefaultCardPacks(
  configured?: CardPackDefinition[] | null,
): CardPackDefinition[] {
  const list = Array.isArray(configured) ? configured : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const merged: CardPackDefinition[] = DEFAULT_CARD_PACKS.map((def) => byId.get(def.id) ?? def);
  for (const p of list) {
    if (!DEFAULT_CARD_PACKS.some((d) => d.id === p.id)) {
      merged.push(p);
    }
  }
  return merged;
}
