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

export type CardImageFit = "contain-blur" | "cover";

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  imageUrl: string;
  imageFit?: CardImageFit;
  isFoil?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PackProbabilities = Record<CardRarity, number>;

export type CardPackIconId =
  | "layers"
  | "sparkles"
  | "flame"
  | "crown"
  | "gem"
  | "zap"
  | "star"
  | "shield"
  | "rocket";

export const CARD_PACK_ICONS: readonly { id: CardPackIconId; label: string }[] = [
  { id: "layers", label: "Cartas" },
  { id: "sparkles", label: "Brilho" },
  { id: "flame", label: "Fogo" },
  { id: "crown", label: "Coroa" },
  { id: "gem", label: "Gema" },
  { id: "zap", label: "Raio" },
  { id: "star", label: "Estrela" },
  { id: "shield", label: "Escudo" },
  { id: "rocket", label: "Foguete" },
] as const;

export type CardPackColorId =
  | "teal"
  | "emerald"
  | "blue"
  | "purple"
  | "red"
  | "amber"
  | "sunset"
  | "aurora";

export interface CardPackColorMeta {
  id: CardPackColorId;
  label: string;
  gradientClass: string;
  topBgClass: string;
  bottomBgClass: string;
  iconBoxClass: string;
  iconClass: string;
  swatchClass: string;
}

export const CARD_PACK_COLOR_META: Record<CardPackColorId, CardPackColorMeta> = {
  teal: {
    id: "teal",
    label: "Teal Clássico",
    gradientClass: "bg-gradient-to-b from-teal-700 via-teal-800 to-teal-900",
    topBgClass: "bg-teal-700",
    bottomBgClass: "bg-teal-900",
    iconBoxClass: "border-teal-300/60 bg-teal-950/35",
    iconClass: "text-teal-200",
    swatchClass: "bg-gradient-to-br from-teal-600 to-teal-900",
  },
  emerald: {
    id: "emerald",
    label: "Verde Esmeralda",
    gradientClass: "bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-900",
    topBgClass: "bg-emerald-600",
    bottomBgClass: "bg-emerald-900",
    iconBoxClass: "border-emerald-300/60 bg-emerald-950/35",
    iconClass: "text-emerald-200",
    swatchClass: "bg-gradient-to-br from-emerald-500 to-emerald-900",
  },
  blue: {
    id: "blue",
    label: "Azul Cobalto",
    gradientClass: "bg-gradient-to-b from-blue-600 via-indigo-700 to-slate-900",
    topBgClass: "bg-blue-600",
    bottomBgClass: "bg-slate-900",
    iconBoxClass: "border-blue-300/60 bg-slate-950/40",
    iconClass: "text-blue-200",
    swatchClass: "bg-gradient-to-br from-blue-500 to-indigo-900",
  },
  purple: {
    id: "purple",
    label: "Roxo Místico",
    gradientClass: "bg-gradient-to-b from-purple-600 via-fuchsia-700 to-purple-950",
    topBgClass: "bg-purple-600",
    bottomBgClass: "bg-purple-950",
    iconBoxClass: "border-purple-300/60 bg-purple-950/45",
    iconClass: "text-purple-200",
    swatchClass: "bg-gradient-to-br from-purple-500 to-fuchsia-900",
  },
  red: {
    id: "red",
    label: "Rubi Lendário",
    gradientClass: "bg-gradient-to-b from-red-600 via-rose-700 to-red-950",
    topBgClass: "bg-red-600",
    bottomBgClass: "bg-red-950",
    iconBoxClass: "border-red-300/60 bg-red-950/45",
    iconClass: "text-red-200",
    swatchClass: "bg-gradient-to-br from-red-500 to-rose-900",
  },
  amber: {
    id: "amber",
    label: "Dourado Solar",
    gradientClass: "bg-gradient-to-b from-amber-500 via-orange-600 to-amber-900",
    topBgClass: "bg-amber-500",
    bottomBgClass: "bg-amber-900",
    iconBoxClass: "border-amber-200/70 bg-amber-950/40",
    iconClass: "text-amber-100",
    swatchClass: "bg-gradient-to-br from-amber-400 to-orange-800",
  },
  sunset: {
    id: "sunset",
    label: "Degradê Pôr do Sol",
    gradientClass: "bg-gradient-to-b from-rose-500 via-fuchsia-600 to-indigo-900",
    topBgClass: "bg-rose-500",
    bottomBgClass: "bg-indigo-900",
    iconBoxClass: "border-pink-200/65 bg-indigo-950/40",
    iconClass: "text-pink-100",
    swatchClass: "bg-gradient-to-br from-rose-500 via-fuchsia-600 to-indigo-800",
  },
  aurora: {
    id: "aurora",
    label: "Degradê Aurora",
    gradientClass: "bg-gradient-to-b from-cyan-500 via-emerald-600 to-purple-900",
    topBgClass: "bg-cyan-500",
    bottomBgClass: "bg-purple-900",
    iconBoxClass: "border-cyan-200/65 bg-slate-950/40",
    iconClass: "text-cyan-100",
    swatchClass: "bg-gradient-to-br from-cyan-400 via-emerald-500 to-purple-800",
  },
};

export const CARD_PACK_COLORS: readonly CardPackColorMeta[] = Object.values(CARD_PACK_COLOR_META);

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
  icon?: CardPackIconId;
  colorTheme?: CardPackColorId;
  isFoil?: boolean;
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
  imageFit?: CardImageFit;
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
      imageFit: input.imageFit ?? "contain-blur",
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
  patch: {
    name?: string;
    description?: string;
    imageUrl?: string;
    imageFit?: CardImageFit;
    isFoil?: boolean;
  },
): { card: CardDefinition | null; error?: string } {
  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  const nextDesc = patch.description !== undefined ? patch.description.trim() : existing.description;
  const nextUrl = patch.imageUrl !== undefined ? patch.imageUrl.trim() : existing.imageUrl;
  const nextFit = patch.imageFit ?? existing.imageFit ?? "contain-blur";
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
      imageFit: nextFit,
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

export interface ConsumePackResult extends OpenPackResult {
  updatedUnopenedPacks: Record<string, number>;
}

/**
 * Consome 1 unidade do pacote fechado do jogador e sorteia as cartas atomicamente.
 * Se o jogador não possuir o pacote ou o catálogo estiver vazio, nada é debitado.
 */
export function consumeAndOpenCardPack(
  pack: CardPackDefinition,
  allCards: CardDefinition[],
  currentCardsMap: Record<string, number> = {},
  currentUnopenedPacks: Record<string, number> = {},
  rng: () => number = Math.random,
): ConsumePackResult {
  const available = Math.max(0, Math.floor(Number(currentUnopenedPacks[pack.id]) || 0));
  if (available <= 0) {
    return {
      drawnCards: [],
      updatedCardsMap: { ...currentCardsMap },
      updatedUnopenedPacks: { ...currentUnopenedPacks },
      newlyDiscoveredIds: [],
      error: "Você não possui unidades fechadas deste pacote.",
    };
  }

  const openRes = openCardPack(pack, allCards, currentCardsMap, rng);
  if (openRes.error || openRes.drawnCards.length === 0) {
    return {
      ...openRes,
      updatedUnopenedPacks: { ...currentUnopenedPacks },
    };
  }

  const updatedUnopenedPacks: Record<string, number> = { ...currentUnopenedPacks };
  const remaining = available - 1;
  if (remaining > 0) {
    updatedUnopenedPacks[pack.id] = remaining;
  } else {
    delete updatedUnopenedPacks[pack.id];
  }

  return {
    ...openRes,
    updatedUnopenedPacks,
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
