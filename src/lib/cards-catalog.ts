// Catálogo de Cartas Colecionáveis, Raridades e Pacotes (browser-safe)

export type CardRarity = "comum" | "incomum" | "rara" | "epica" | "lendaria";

export const CARD_RARITIES: readonly CardRarity[] = [
  "comum",
  "incomum",
  "rara",
  "epica",
  "lendaria",
] as const;

export type CardColorVariant = 1 | 2 | 3;

export const CARD_COLOR_VARIANTS: readonly CardColorVariant[] = [1, 2, 3] as const;

export interface CardRarityMeta {
  id: CardRarity;
  label: string;
  borderClass: string;
  cardBgClass: string;
  gradientVariants: Record<CardColorVariant, string>;
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
    gradientVariants: {
      1: "bg-white dark:bg-slate-900",
      2: "bg-white dark:bg-slate-900",
      3: "bg-white dark:bg-slate-900",
    },
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
    cardBgClass:
      "bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-700 dark:from-emerald-600 dark:via-emerald-700 dark:to-teal-900",
    gradientVariants: {
      1: "bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-700 dark:from-emerald-600 dark:via-emerald-700 dark:to-teal-900",
      2: "bg-gradient-to-br from-lime-400 via-emerald-600 to-green-900 dark:from-lime-600 dark:via-emerald-800 dark:to-green-950",
      3: "bg-gradient-to-br from-teal-400 via-emerald-500 to-cyan-800 dark:from-teal-600 dark:via-emerald-700 dark:to-cyan-950",
    },
    innerBoxClass:
      "bg-white/95 border-emerald-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-emerald-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-emerald-700 border-emerald-600/50 dark:bg-slate-950/95 dark:text-emerald-300 dark:border-emerald-400/80",
    glowClass: "shadow-[0_0_18px_-2px_rgba(16,185,129,0.55)] dark:shadow-[0_0_18px_-2px_rgba(16,185,129,0.65)]",
  },
  rara: {
    id: "rara",
    label: "Rara",
    borderClass: "border-yellow-400 dark:border-yellow-400",
    cardBgClass:
      "bg-gradient-to-br from-yellow-300 via-amber-500 to-orange-600 dark:from-yellow-500 dark:via-amber-600 dark:to-orange-800",
    gradientVariants: {
      1: "bg-gradient-to-br from-yellow-300 via-amber-500 to-orange-600 dark:from-yellow-500 dark:via-amber-600 dark:to-orange-800",
      2: "bg-gradient-to-br from-amber-300 via-yellow-500 to-yellow-800 dark:from-amber-500 dark:via-yellow-600 dark:to-yellow-900",
      3: "bg-gradient-to-br from-yellow-200 via-yellow-500 to-amber-700 dark:from-yellow-400 dark:via-amber-600 dark:to-amber-900",
    },
    innerBoxClass:
      "bg-white/95 border-amber-500/45 text-slate-900 dark:bg-slate-950/90 dark:border-yellow-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-amber-700 border-amber-500/60 dark:bg-slate-950/95 dark:text-yellow-300 dark:border-yellow-400/80",
    glowClass: "shadow-[0_0_20px_-2px_rgba(250,204,21,0.65)] dark:shadow-[0_0_20px_-2px_rgba(250,204,21,0.75)]",
  },
  epica: {
    id: "epica",
    label: "Épica",
    borderClass: "border-purple-500 dark:border-purple-400",
    cardBgClass:
      "bg-gradient-to-br from-violet-400 via-purple-600 to-fuchsia-900 dark:from-violet-600 dark:via-purple-700 dark:to-fuchsia-950",
    gradientVariants: {
      1: "bg-gradient-to-br from-violet-400 via-purple-600 to-fuchsia-900 dark:from-violet-600 dark:via-purple-700 dark:to-fuchsia-950",
      2: "bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-900 dark:from-pink-600 dark:via-purple-800 dark:to-indigo-950",
      3: "bg-gradient-to-br from-purple-400 via-purple-700 to-slate-900 dark:from-purple-600 dark:via-purple-800 dark:to-slate-950",
    },
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
    cardBgClass:
      "bg-gradient-to-br from-orange-400 via-red-600 to-rose-900 dark:from-orange-600 dark:via-red-700 dark:to-rose-950",
    gradientVariants: {
      1: "bg-gradient-to-br from-orange-400 via-red-600 to-rose-900 dark:from-orange-600 dark:via-red-700 dark:to-rose-950",
      2: "bg-gradient-to-br from-amber-400 via-red-600 to-red-950 dark:from-amber-600 dark:via-red-800 dark:to-red-950",
      3: "bg-gradient-to-br from-rose-400 via-red-600 to-purple-950 dark:from-rose-600 dark:via-red-800 dark:to-purple-950",
    },
    innerBoxClass:
      "bg-white/95 border-red-600/35 text-slate-900 dark:bg-slate-950/90 dark:border-red-400/50 dark:text-slate-100",
    badgeClass:
      "bg-white/95 text-red-700 border-red-600/50 dark:bg-slate-950/95 dark:text-red-300 dark:border-red-400/80",
    glowClass: "shadow-[0_0_26px_-1px_rgba(239,68,68,0.75)] dark:shadow-[0_0_26px_-1px_rgba(239,68,68,0.85)]",
  },
};

export function resolveCardBgClass(
  rarity: CardRarity,
  variant?: CardColorVariant,
): string {
  const meta = CARD_RARITY_META[rarity] ?? CARD_RARITY_META.comum;
  const v: CardColorVariant = variant === 2 || variant === 3 ? variant : 1;
  return meta.gradientVariants[v] ?? meta.cardBgClass;
}

export type CardImageFit = "contain-blur" | "cover";

export type DungeonCardSkillId =
  | "chronomancer"
  | "aegis"
  | "regeneration"
  | "miner"
  | "explorer"
  | "critical"
  | "economy"
  | "pocket";

export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  imageUrl: string;
  imageFit?: CardImageFit;
  colorVariant?: CardColorVariant;
  isFoil?: boolean;
  dungeonSkillId?: DungeonCardSkillId;
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
  priceCoins?: number;
  featuredInStore?: boolean;
  showInStore?: boolean;
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
    priceCoins: 40,
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
    priceCoins: 65,
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
    priceCoins: 110,
    featuredInStore: true,
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
    priceCoins: 180,
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
    priceCoins: 300,
    featuredInStore: true,
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
  colorVariant?: CardColorVariant;
  isFoil?: boolean;
  dungeonSkillId?: DungeonCardSkillId | null;
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
      colorVariant: input.colorVariant === 2 || input.colorVariant === 3 ? input.colorVariant : 1,
      isFoil: Boolean(input.isFoil),
      ...(input.dungeonSkillId ? { dungeonSkillId: input.dungeonSkillId } : {}),
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Cria versão Normal e/ou Foil da mesma carta (cada versão recebe um ID distinto).
 */
export function createCardBatch(input: {
  name: string;
  description: string;
  rarity: CardRarity;
  imageUrl: string;
  imageFit?: CardImageFit;
  colorVariant?: CardColorVariant;
  createNormal: boolean;
  createFoil: boolean;
  dungeonSkillId?: DungeonCardSkillId | null;
}): { cards: CardDefinition[]; error?: string } {
  if (!input.createNormal && !input.createFoil) {
    return { cards: [], error: "Selecione pelo menos uma versão (Normal ou Foil) para criar." };
  }
  const created: CardDefinition[] = [];
  if (input.createNormal) {
    const resNormal = createCardDefinition({ ...input, isFoil: false });
    if (!resNormal.card) return { cards: [], error: resNormal.error };
    created.push(resNormal.card);
  }
  if (input.createFoil) {
    const resFoil = createCardDefinition({ ...input, isFoil: true });
    if (!resFoil.card) return { cards: [], error: resFoil.error };
    // Garante ID distinto caso criados no mesmo milissegundo
    if (created.some((c) => c.id === resFoil.card!.id)) {
      resFoil.card.id = `${resFoil.card.id}_foil`;
    }
    created.push(resFoil.card);
  }
  return { cards: created };
}

/**
 * Gera automaticamente versões faltantes (Normal <-> Foil) com IDs distintos
 * para todas as cartas do catálogo que ainda não possuem o par correspondente
 * (mesmo nome + raridade). Idempotente.
 */
export function generateMissingFoilDuplicates(
  existingCards: CardDefinition[],
): { updatedCatalog: CardDefinition[]; addedCount: number } {
  const normalKeys = new Set<string>();
  const foilKeys = new Set<string>();
  for (const c of existingCards) {
    const key = `${c.name.trim().toLowerCase()}::${c.rarity}`;
    if (c.isFoil) {
      foilKeys.add(key);
    } else {
      normalKeys.add(key);
    }
  }

  const additions: CardDefinition[] = [];
  const now = new Date().toISOString();

  existingCards.forEach((c, idx) => {
    const key = `${c.name.trim().toLowerCase()}::${c.rarity}`;
    if (c.isFoil) {
      // Carta já é Foil: se não existe versão Normal (sem Foil), cria a versão Normal
      if (normalKeys.has(key)) return;
      normalKeys.add(key);
      additions.push({
        ...c,
        id: `card_${Date.now()}_${idx}_normal_${Math.random().toString(36).slice(2, 6)}`,
        isFoil: false,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Carta é Normal: se não existe versão Foil, cria a versão Foil
      if (foilKeys.has(key)) return;
      foilKeys.add(key);
      additions.push({
        ...c,
        id: `card_${Date.now()}_${idx}_foil_${Math.random().toString(36).slice(2, 6)}`,
        isFoil: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  if (additions.length === 0) {
    return { updatedCatalog: existingCards, addedCount: 0 };
  }

  return {
    updatedCatalog: [...additions, ...existingCards],
    addedCount: additions.length,
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
    colorVariant?: CardColorVariant;
    isFoil?: boolean;
    dungeonSkillId?: DungeonCardSkillId | null;
  },
): { card: CardDefinition | null; error?: string } {
  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  const nextDesc = patch.description !== undefined ? patch.description.trim() : existing.description;
  const nextUrl = patch.imageUrl !== undefined ? patch.imageUrl.trim() : existing.imageUrl;
  const nextFit = patch.imageFit ?? existing.imageFit ?? "contain-blur";
  const nextVariant: CardColorVariant =
    patch.colorVariant === 1 || patch.colorVariant === 2 || patch.colorVariant === 3
      ? patch.colorVariant
      : existing.colorVariant === 2 || existing.colorVariant === 3
        ? existing.colorVariant
        : 1;
  const nextFoil = patch.isFoil !== undefined ? Boolean(patch.isFoil) : Boolean(existing.isFoil);
  const nextSkillId =
    patch.dungeonSkillId === undefined
      ? existing.dungeonSkillId
      : patch.dungeonSkillId ?? undefined;

  if (!nextName) return { card: null, error: "O nome da carta não pode ficar vazio." };
  if (!isValidCardMediaUrl(nextUrl)) {
    return { card: null, error: "Link de imagem/GIF inválido. Utilize HTTPS." };
  }

  const nextCard: CardDefinition = {
    ...existing,
    name: nextName,
    description: nextDesc,
    imageUrl: nextUrl,
    imageFit: nextFit,
    colorVariant: nextVariant,
    isFoil: nextFoil,
    rarity: existing.rarity, // Raridade nunca pode ser alterada após criação
    updatedAt: new Date().toISOString(),
  };
  if (nextSkillId) {
    nextCard.dungeonSkillId = nextSkillId;
  } else {
    delete nextCard.dungeonSkillId;
  }

  return { card: nextCard };
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

export const DEFAULT_CARD_FOIL_CHANCE_PERCENT = 30;

export interface OpenPackResult {
  drawnCards: CardDefinition[];
  updatedCardsMap: Record<string, number>;
  newlyDiscoveredIds: string[];
  error?: string;
}

function pickCardVariantByFoilChance(
  candidates: CardDefinition[],
  foilChancePercent: number,
  rng: () => number,
): CardDefinition | null {
  if (candidates.length === 0) return null;
  const groupsMap = new Map<string, { normal: CardDefinition[]; foil: CardDefinition[] }>();
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase() || c.id;
    let group = groupsMap.get(key);
    if (!group) {
      group = { normal: [], foil: [] };
      groupsMap.set(key, group);
    }
    if (c.isFoil) group.foil.push(c);
    else group.normal.push(c);
  }

  const groups = Array.from(groupsMap.values());
  const chosenGroup = groups[Math.floor(rng() * groups.length) % groups.length];
  if (!chosenGroup) return null;

  if (chosenGroup.normal.length > 0 && chosenGroup.foil.length > 0) {
    const clampedFoil = Math.max(0, Math.min(100, Number(foilChancePercent)));
    const rollFoil = rng() * 100 < clampedFoil;
    const pool = rollFoil ? chosenGroup.foil : chosenGroup.normal;
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  const fallbackPool = chosenGroup.foil.length > 0 ? chosenGroup.foil : chosenGroup.normal;
  return fallbackPool[Math.floor(rng() * fallbackPool.length) % fallbackPool.length] ?? null;
}

export function openCardPack(
  pack: CardPackDefinition,
  allCards: CardDefinition[],
  currentCardsMap: Record<string, number> = {},
  rng: () => number = Math.random,
  foilChancePercent = DEFAULT_CARD_FOIL_CHANCE_PERCENT,
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
    const picked = pickCardVariantByFoilChance(candidates, foilChancePercent, rng);
    if (!picked) continue;
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
  foilChancePercent = DEFAULT_CARD_FOIL_CHANCE_PERCENT,
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

  const openRes = openCardPack(pack, allCards, currentCardsMap, rng, foilChancePercent);
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

export interface ConsumePackBatchResult extends ConsumePackResult {
  openedCount: number;
}

/**
 * Consome até `quantity` unidades do mesmo pacote fechado atomicamente,
 * preservando a flag `newlyDiscoveredIds` mesmo que uma carta nova repita dentro do lote.
 */
export function consumeAndOpenCardPacksBatch(
  pack: CardPackDefinition,
  quantity: number,
  allCards: CardDefinition[],
  currentCardsMap: Record<string, number> = {},
  currentUnopenedPacks: Record<string, number> = {},
  rng: () => number = Math.random,
  foilChancePercent = DEFAULT_CARD_FOIL_CHANCE_PERCENT,
): ConsumePackBatchResult {
  const available = Math.max(0, Math.floor(Number(currentUnopenedPacks[pack.id]) || 0));
  if (!Number.isFinite(quantity) || Math.floor(quantity) < 1) {
    return {
      openedCount: 0,
      drawnCards: [],
      updatedCardsMap: { ...currentCardsMap },
      updatedUnopenedPacks: { ...currentUnopenedPacks },
      newlyDiscoveredIds: [],
      error: "Quantidade de pacotes inválida.",
    };
  }
  const requested = Math.floor(quantity);
  const toOpen = Math.min(available, requested);
  if (toOpen <= 0) {
    return {
      openedCount: 0,
      drawnCards: [],
      updatedCardsMap: { ...currentCardsMap },
      updatedUnopenedPacks: { ...currentUnopenedPacks },
      newlyDiscoveredIds: [],
      error: "Você não possui unidades fechadas deste pacote.",
    };
  }

  let runningCardsMap: Record<string, number> = { ...currentCardsMap };
  let runningUnopenedPacks: Record<string, number> = { ...currentUnopenedPacks };
  const allDrawn: CardDefinition[] = [];
  const allNewlyDiscovered = new Set<string>();
  let openedCount = 0;

  for (let i = 0; i < toOpen; i++) {
    const res = consumeAndOpenCardPack(
      pack,
      allCards,
      runningCardsMap,
      runningUnopenedPacks,
      rng,
      foilChancePercent,
    );
    if (res.error || res.drawnCards.length === 0) {
      if (openedCount === 0) {
        return {
          ...res,
          openedCount: 0,
        };
      }
      break;
    }
    runningCardsMap = res.updatedCardsMap;
    runningUnopenedPacks = res.updatedUnopenedPacks;
    allDrawn.push(...res.drawnCards);
    for (const id of res.newlyDiscoveredIds) {
      allNewlyDiscovered.add(id);
    }
    openedCount += 1;
  }

  return {
    openedCount,
    drawnCards: allDrawn,
    updatedCardsMap: runningCardsMap,
    updatedUnopenedPacks: runningUnopenedPacks,
    newlyDiscoveredIds: Array.from(allNewlyDiscovered),
  };
}

export interface GroupedBatchCard {
  card: CardDefinition;
  count: number;
  isNew: boolean;
}

/**
 * Agrupa cartas repetidas obtidas em uma abertura em lote, mantendo badge `xN`
 * e ordenando pelas mais raras / Foil / recém-descobertas primeiro.
 */
export function groupDrawnCardsForBatchSummary(
  drawnCards: CardDefinition[],
  newlyDiscoveredIds: readonly string[],
): GroupedBatchCard[] {
  const newSet = new Set(newlyDiscoveredIds);
  const byId = new Map<string, GroupedBatchCard>();
  for (const card of drawnCards) {
    const existing = byId.get(card.id);
    if (existing) {
      existing.count += 1;
    } else {
      byId.set(card.id, {
        card,
        count: 1,
        isNew: newSet.has(card.id),
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const rankDiff = RARITY_REVEAL_RANK[b.card.rarity] - RARITY_REVEAL_RANK[a.card.rarity];
    if (rankDiff !== 0) return rankDiff;
    const foilDiff = (b.card.isFoil ? 1 : 0) - (a.card.isFoil ? 1 : 0);
    if (foilDiff !== 0) return foilDiff;
    const newDiff = (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
    if (newDiff !== 0) return newDiff;
    return b.count - a.count;
  });
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

/* --------------------- Particionamento (Chunks) & Backup JSON --------------------- */

export const CARDS_CHUNK_MAX_BYTES = 45_000;
export const MAX_CARDS_CHUNKS = 20;
export const CARDS_BACKUP_SCHEMA = "desafios-cards-backup-v1";

export interface CardsCatalogChunkMeta {
  version: 1;
  chunkCount: number;
  totalCards: number;
  updatedAt: string;
}

function measureUtf8Bytes(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

/**
 * Divide o catálogo de cartas em fatias JSON independentes de até `maxChunkBytes`
 * para armazenamento seguro no PlayFab UserData sem nunca estourar o limite por chave.
 */
export function serializeCardsCatalogChunks(
  cards: CardDefinition[],
  maxChunkBytes = CARDS_CHUNK_MAX_BYTES,
): { meta: CardsCatalogChunkMeta; chunks: string[] } {
  const safeLimit = Math.max(2_000, Math.floor(maxChunkBytes));
  const list = Array.isArray(cards) ? cards : [];
  const chunks: string[] = [];

  if (list.length > 0) {
    let currentBatch: CardDefinition[] = [];
    let currentBytes = 2; // "[]"

    for (const card of list) {
      const cardStr = JSON.stringify(card);
      const cardBytes = measureUtf8Bytes(cardStr);
      const separatorBytes = currentBatch.length > 0 ? 1 : 0;

      if (currentBatch.length > 0 && currentBytes + separatorBytes + cardBytes > safeLimit) {
        chunks.push(JSON.stringify(currentBatch));
        currentBatch = [card];
        currentBytes = 2 + cardBytes;
      } else {
        currentBatch.push(card);
        currentBytes += separatorBytes + cardBytes;
      }
    }
    if (currentBatch.length > 0) {
      chunks.push(JSON.stringify(currentBatch));
    }
  }

  return {
    meta: {
      version: 1,
      chunkCount: chunks.length,
      totalCards: list.length,
      updatedAt: new Date().toISOString(),
    },
    chunks,
  };
}

/**
 * Reconstrói o catálogo completo a partir dos metadados e das fatias armazenadas.
 * Retorna `ok: false` se qualquer fatia esperada estiver ausente ou corrompida,
 * evitando que leituras parciais sejam confundidas com um catálogo vazio.
 */
export function deserializeCardsCatalogChunks(
  metaRaw: string | null | undefined,
  chunkRaws: Array<string | null | undefined>,
): {
  cards: CardDefinition[];
  ok: boolean;
  expectedChunks: number;
  loadedChunks: number;
  totalCardsExpected: number;
} {
  if (!metaRaw || typeof metaRaw !== "string") {
    return { cards: [], ok: false, expectedChunks: 0, loadedChunks: 0, totalCardsExpected: 0 };
  }
  try {
    const meta = JSON.parse(metaRaw) as Partial<CardsCatalogChunkMeta>;
    const expectedChunks =
      typeof meta.chunkCount === "number" && Number.isFinite(meta.chunkCount) && meta.chunkCount >= 0
        ? Math.floor(meta.chunkCount)
        : -1;
    const totalCardsExpected =
      typeof meta.totalCards === "number" && Number.isFinite(meta.totalCards) && meta.totalCards >= 0
        ? Math.floor(meta.totalCards)
        : 0;
    if (expectedChunks < 0 || expectedChunks > MAX_CARDS_CHUNKS) {
      return { cards: [], ok: false, expectedChunks: 0, loadedChunks: 0, totalCardsExpected: 0 };
    }
    if (expectedChunks === 0) {
      return { cards: [], ok: true, expectedChunks: 0, loadedChunks: 0, totalCardsExpected: 0 };
    }

    const cards: CardDefinition[] = [];
    let loadedChunks = 0;
    for (let i = 0; i < expectedChunks; i++) {
      const raw = chunkRaws[i];
      if (!raw || typeof raw !== "string") {
        return { cards: [], ok: false, expectedChunks, loadedChunks, totalCardsExpected };
      }
      const parsedChunk = JSON.parse(raw);
      if (!Array.isArray(parsedChunk)) {
        return { cards: [], ok: false, expectedChunks, loadedChunks, totalCardsExpected };
      }
      for (const item of parsedChunk) {
        if (item && typeof item === "object" && typeof (item as CardDefinition).id === "string") {
          cards.push(item as CardDefinition);
        }
      }
      loadedChunks += 1;
    }

    return { cards, ok: true, expectedChunks, loadedChunks, totalCardsExpected };
  } catch {
    return { cards: [], ok: false, expectedChunks: 0, loadedChunks: 0, totalCardsExpected: 0 };
  }
}

const VALID_RARITY_SET = new Set<string>(CARD_RARITIES);
const VALID_DUNGEON_SKILL_SET = new Set<string>([
  "chronomancer",
  "aegis",
  "regeneration",
  "miner",
  "explorer",
  "critical",
  "economy",
  "pocket",
]);

function sanitizeImportedCard(raw: unknown): CardDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const rarity = typeof obj.rarity === "string" ? obj.rarity.trim().toLowerCase() : "";
  const imageUrl = typeof obj.imageUrl === "string" ? obj.imageUrl.trim() : "";
  if (!id || !name || !VALID_RARITY_SET.has(rarity) || !isValidCardMediaUrl(imageUrl)) {
    return null;
  }
  const now = new Date().toISOString();
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const imageFit: CardImageFit = obj.imageFit === "cover" ? "cover" : "contain-blur";
  const colorVariant: CardColorVariant =
    obj.colorVariant === 2 || obj.colorVariant === 3 ? obj.colorVariant : 1;
  const isFoil = Boolean(obj.isFoil);
  const dungeonSkillId =
    typeof obj.dungeonSkillId === "string" && VALID_DUNGEON_SKILL_SET.has(obj.dungeonSkillId)
      ? (obj.dungeonSkillId as DungeonCardSkillId)
      : undefined;
  const createdAt = typeof obj.createdAt === "string" && obj.createdAt.trim() ? obj.createdAt : now;
  const updatedAt = typeof obj.updatedAt === "string" && obj.updatedAt.trim() ? obj.updatedAt : now;

  return {
    id,
    name,
    description,
    rarity: rarity as CardRarity,
    imageUrl,
    imageFit,
    colorVariant,
    isFoil,
    ...(dungeonSkillId ? { dungeonSkillId } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Serializa o catálogo de cartas em um arquivo JSON de backup portável.
 */
export function exportCardsCatalogBackup(cards: CardDefinition[]): string {
  const list = Array.isArray(cards) ? cards : [];
  return JSON.stringify(
    {
      schema: CARDS_BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      count: list.length,
      cardsCatalog: list,
    },
    null,
    2,
  );
}

/**
 * Lê e valida um JSON de backup de cartas. Aceita:
 * 1) Backup oficial (`{ schema, cardsCatalog: [...] }`)
 * 2) Dump completo de `PlatformAdminConfig` / `localStorage` (`{ cardsCatalog: [...] }`)
 * 3) Array direto de cartas (`[CardDefinition, ...]`)
 * Preserva os `id` originais para manter o vínculo com os álbuns dos jogadores.
 */
export function parseCardsCatalogBackup(rawJson: string): {
  cards: CardDefinition[];
  skippedCount: number;
  error?: string;
} {
  if (!rawJson || typeof rawJson !== "string" || !rawJson.trim()) {
    return { cards: [], skippedCount: 0, error: "Arquivo JSON vazio." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
    // Suporta caso o usuário tenha colado uma string JSON duplamente serializada do Console
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
  } catch {
    return { cards: [], skippedCount: 0, error: "JSON inválido. Verifique o arquivo selecionado." };
  }

  let candidateList: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    candidateList = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.cardsCatalog)) {
      candidateList = obj.cardsCatalog;
    } else if (Array.isArray(obj.cards)) {
      candidateList = obj.cards;
    }
  }

  if (!candidateList) {
    return {
      cards: [],
      skippedCount: 0,
      error: "Nenhuma lista de cartas (cardsCatalog) encontrada neste JSON.",
    };
  }

  const seenIds = new Set<string>();
  const cards: CardDefinition[] = [];
  let skippedCount = 0;

  for (const item of candidateList) {
    const clean = sanitizeImportedCard(item);
    if (!clean || seenIds.has(clean.id)) {
      skippedCount += 1;
      continue;
    }
    seenIds.add(clean.id);
    cards.push(clean);
  }

  if (cards.length === 0) {
    return {
      cards: [],
      skippedCount,
      error: "Nenhuma carta válida encontrada no backup.",
    };
  }

  return { cards, skippedCount };
}

/**
 * Mescla ou substitui o catálogo atual com cartas importadas, preservando IDs originais.
 */
export function mergeCardsCatalog(
  existing: CardDefinition[],
  incoming: CardDefinition[],
  mode: "merge" | "replace" = "merge",
): { cards: CardDefinition[]; addedCount: number; updatedCount: number } {
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeIncoming = Array.isArray(incoming) ? incoming : [];

  if (mode === "replace") {
    const existingIds = new Set(safeExisting.map((c) => c.id));
    let addedCount = 0;
    let updatedCount = 0;
    for (const c of safeIncoming) {
      if (existingIds.has(c.id)) updatedCount += 1;
      else addedCount += 1;
    }
    return { cards: [...safeIncoming], addedCount, updatedCount };
  }

  const byId = new Map<string, CardDefinition>();
  const order: string[] = [];
  for (const c of safeExisting) {
    byId.set(c.id, c);
    order.push(c.id);
  }

  let addedCount = 0;
  let updatedCount = 0;
  for (const c of safeIncoming) {
    if (byId.has(c.id)) {
      byId.set(c.id, c);
      updatedCount += 1;
    } else {
      byId.set(c.id, c);
      order.push(c.id);
      addedCount += 1;
    }
  }

  return {
    cards: order.map((id) => byId.get(id)!),
    addedCount,
    updatedCount,
  };
}

export interface AlbumCollectionSummary {
  discoveredCount: number;
  totalCatalogCount: number;
  ownedUniqueCount: number;
  totalOwnedCopies: number;
  missingFromCatalogUniqueCount: number;
  missingFromCatalogCopies: number;
}

/**
 * Consolida a coleção do jogador em relação ao catálogo ativo, contabilizando
 * também cartas já conquistadas no perfil cujas definições estejam temporariamente
 * ausentes do catálogo (evitando a impressão de perda do inventário).
 */
export function summarizeAlbumCollection(
  catalog: CardDefinition[],
  ownedCardsMap: Record<string, number> = {},
): AlbumCollectionSummary {
  const safeCatalog = Array.isArray(catalog) ? catalog : [];
  const catalogIds = new Set(safeCatalog.map((c) => c.id));

  let ownedUniqueCount = 0;
  let totalOwnedCopies = 0;
  let discoveredCount = 0;
  let missingFromCatalogUniqueCount = 0;
  let missingFromCatalogCopies = 0;

  for (const [id, rawQty] of Object.entries(ownedCardsMap ?? {})) {
    const qty = Math.max(0, Math.floor(Number(rawQty) || 0));
    if (qty <= 0) continue;
    ownedUniqueCount += 1;
    totalOwnedCopies += qty;
    if (catalogIds.has(id)) {
      discoveredCount += 1;
    } else {
      missingFromCatalogUniqueCount += 1;
      missingFromCatalogCopies += qty;
    }
  }

  return {
    discoveredCount,
    totalCatalogCount: safeCatalog.length,
    ownedUniqueCount,
    totalOwnedCopies,
    missingFromCatalogUniqueCount,
    missingFromCatalogCopies,
  };
}
