// Catálogo e lógica pura de Baús de Recompensa (browser-safe)

export type ChestRarity = "comum" | "incomum" | "rara" | "epica" | "lendaria";
export type ChestShape = "padrao" | "largo" | "compacto";

export const DEFAULT_CHEST_PRIMARY_COLOR = "#8B4513";
export const DEFAULT_CHEST_METAL_COLOR = "#94A3B8";
export const DEFAULT_CHEST_OPEN_DURATION_MS = 2000;

export const CHEST_SHAPES: readonly { id: ChestShape; label: string }[] = [
  { id: "padrao", label: "Padrão" },
  { id: "largo", label: "Largo" },
  { id: "compacto", label: "Compacto" },
] as const;

export interface ChestCardPackDrop {
  packId: string;
  quantity: number;
  chancePercent: number; // 1..100
}

export interface ChestCosmeticDrop {
  kind: "avatar" | "aura";
  itemId: string;
  chancePercent: number; // 1..100
}

export interface ChestRewardConfig {
  points?: { min: number; max: number };
  xp?: { min: number; max: number };
  coins?: { min: number; max: number };
  cardPacks?: ChestCardPackDrop[];
  cosmetics?: ChestCosmeticDrop[];
}

export interface ChestDefinition {
  id: string;
  name: string;
  description: string;
  rarity: ChestRarity;
  primaryColor?: string;
  metalColor?: string;
  shape?: ChestShape;
  openDurationMs?: number;
  isDefault?: boolean;
  enabled: boolean;
  rewards: ChestRewardConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ChestRarityMeta {
  id: ChestRarity;
  label: string;
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  glowClass: string;
}

export const CHEST_RARITIES: readonly ChestRarity[] = [
  "comum",
  "incomum",
  "rara",
  "epica",
  "lendaria",
] as const;

export const CHEST_RARITY_META: Record<ChestRarity, ChestRarityMeta> = {
  comum: {
    id: "comum",
    label: "Comum",
    borderClass: "border-slate-400 dark:border-slate-500",
    bgClass: "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900",
    badgeClass: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    glowClass: "shadow-sm",
  },
  incomum: {
    id: "incomum",
    label: "Incomum",
    borderClass: "border-emerald-500 dark:border-emerald-400",
    bgClass: "bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-950 dark:to-teal-950",
    badgeClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    glowClass: "shadow-[0_0_16px_rgba(16,185,129,0.25)]",
  },
  rara: {
    id: "rara",
    label: "Rara",
    borderClass: "border-sky-500 dark:border-sky-400",
    bgClass: "bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-sky-950 dark:to-indigo-950",
    badgeClass: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
    glowClass: "shadow-[0_0_18px_rgba(14,165,233,0.3)]",
  },
  epica: {
    id: "epica",
    label: "Épica",
    borderClass: "border-purple-500 dark:border-purple-400",
    bgClass: "bg-gradient-to-br from-purple-50 to-fuchsia-100 dark:from-purple-950 dark:to-fuchsia-950",
    badgeClass: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
    glowClass: "shadow-[0_0_20px_rgba(168,85,247,0.35)]",
  },
  lendaria: {
    id: "lendaria",
    label: "Lendária",
    borderClass: "border-amber-500 dark:border-amber-400",
    bgClass: "bg-gradient-to-br from-amber-50 via-orange-100 to-rose-100 dark:from-amber-950 dark:via-orange-950 dark:to-rose-950",
    badgeClass: "bg-amber-500/25 text-amber-800 dark:text-amber-300",
    glowClass: "shadow-[0_0_24px_rgba(245,158,11,0.45)]",
  },
};

export const DEFAULT_CHESTS: ChestDefinition[] = [
  {
    id: "weekly_common",
    name: "Baú Semanal Comum",
    description: "Recompensa básica de constância semanal com pontos, XP e chance de pacote de cartas.",
    rarity: "comum",
    isDefault: true,
    enabled: true,
    rewards: {
      points: { min: 30, max: 60 },
      xp: { min: 40, max: 80 },
      coins: { min: 20, max: 50 },
      cardPacks: [{ packId: "pack_basico", quantity: 1, chancePercent: 50 }],
    },
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  },
  {
    id: "weekly_epic",
    name: "Grande Baú Semanal",
    description: "Baú especial do 7º dia consecutivo com alta premiação e pacote garantido.",
    rarity: "epica",
    isDefault: true,
    enabled: true,
    rewards: {
      points: { min: 80, max: 150 },
      xp: { min: 100, max: 180 },
      coins: { min: 60, max: 120 },
      cardPacks: [{ packId: "pack_iniciante", quantity: 1, chancePercent: 100 }],
    },
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  },
  {
    id: "quantum_logic",
    name: "Baú de Lógica Quântica",
    description: "Baú raro com foco em pontos extras e chance de pacotes avançados.",
    rarity: "rara",
    isDefault: true,
    enabled: true,
    rewards: {
      points: { min: 60, max: 120 },
      xp: { min: 80, max: 140 },
      coins: { min: 40, max: 90 },
      cardPacks: [{ packId: "pack_mestre", quantity: 1, chancePercent: 75 }],
    },
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  },
  {
    id: "event_special",
    name: "Baú Especial de Evento",
    description: "Baú lendário reservado para eventos oficiais e premiações especiais da SEMED.",
    rarity: "lendaria",
    isDefault: true,
    enabled: true,
    rewards: {
      points: { min: 150, max: 250 },
      xp: { min: 150, max: 300 },
      coins: { min: 100, max: 200 },
      cardPacks: [{ packId: "pack_supremo", quantity: 1, chancePercent: 100 }],
    },
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  },
];

/** Mapeamento retrocompatível de IDs legados de pacotes para IDs válidos do catálogo. */
export const LEGACY_PACK_ID_ALIASES: Record<string, string> = {
  pack_avancado: "pack_mestre",
  pack_epico: "pack_mestre",
  pack_lendario: "pack_supremo",
};

export function normalizeCardPackId(packId: string): string {
  const clean = (packId ?? "").trim();
  return LEGACY_PACK_ID_ALIASES[clean] ?? clean;
}

/** Valor mínimo de compensação em moedas quando um baú sorteia um cosmético que o jogador já possui. */
export const DUPLICATE_COSMETIC_MIN_COINS = 25;

export function calculateDuplicateCosmeticCompensation(priceCoins?: number | null): number {
  const safePrice = Number.isFinite(Number(priceCoins)) ? Math.max(0, Math.floor(Number(priceCoins))) : 0;
  return Math.max(DUPLICATE_COSMETIC_MIN_COINS, Math.round(safePrice * 0.5));
}

function sanitizeChestHex6(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function stripUndefinedProps<T extends object>(obj?: T | null): Partial<T> {
  if (!obj) return {};
  const clean: Partial<T> = {};
  for (const [k, v] of Object.entries(obj) as Array<[keyof T, unknown]>) {
    if (v !== undefined) {
      (clean as Record<string, unknown>)[k as string] = v;
    }
  }
  return clean;
}

export function mergeWithDefaultChests(custom?: ChestDefinition[] | null): ChestDefinition[] {
  const byId = new Map<string, ChestDefinition>();
  for (const def of DEFAULT_CHESTS) {
    byId.set(def.id, def);
  }
  for (const item of custom ?? []) {
    if (!item?.id) continue;
    const base = byId.get(item.id);
    const cleanItem = stripUndefinedProps(item);
    const cleanRewards = stripUndefinedProps(item.rewards);
    const hasCustomPacks = Array.isArray(item.rewards?.cardPacks);
    const normalizedPacks = hasCustomPacks
      ? item.rewards!.cardPacks!.map((p) => ({
          ...p,
          packId: normalizeCardPackId(p.packId),
        }))
      : undefined;
    const sanitized: ChestDefinition = {
      ...(base ?? ({} as ChestDefinition)),
      ...cleanItem,
      ...(item.primaryColor ? { primaryColor: sanitizeChestHex6(item.primaryColor, base?.primaryColor ?? "#f59e0b") } : {}),
      ...(item.metalColor ? { metalColor: sanitizeChestHex6(item.metalColor, base?.metalColor ?? "#fbbf24") } : {}),
      rewards: {
        ...(base?.rewards ?? {}),
        ...cleanRewards,
        ...(hasCustomPacks ? { cardPacks: normalizedPacks } : {}),
      },
    };
    byId.set(item.id, sanitized);
  }
  return Array.from(byId.values());
}

export interface ChestOpenOutcome {
  chestId: string;
  chestName: string;
  points: number;
  xp: number;
  coins: number;
  packs: Array<{ packId: string; quantity: number }>;
  cosmetics: Array<{ kind: "avatar" | "aura"; itemId: string }>;
  /** Detalhes resolvidos para exibição no modal (novos cosméticos + compensações por duplicata). */
  cosmeticGrants?: Array<{
    kind: "avatar" | "aura";
    itemId: string;
    name: string;
    alreadyOwned: boolean;
    compensatedCoins: number;
  }>;
  duplicateCompensationCoins?: number;
}

function rollRange(range: { min: number; max: number } | undefined, rng: () => number): number {
  if (!range) return 0;
  const rawMin = Number(range.min);
  const rawMax = Number(range.max);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return 0;
  const min = Math.max(0, Math.floor(Math.min(rawMin, rawMax)));
  const max = Math.max(min, Math.floor(Math.max(rawMin, rawMax)));
  if (max <= 0) return 0;
  if (min === max) return min;
  const rawRoll = Number(rng());
  const safeRoll = Number.isFinite(rawRoll) ? Math.min(1 - Number.EPSILON, Math.max(0, rawRoll)) : 0;
  return min + Math.floor(safeRoll * (max - min + 1));
}

export function openChest(
  chest: ChestDefinition,
  rng: () => number = Math.random,
): ChestOpenOutcome {
  const points = rollRange(chest.rewards.points, rng);
  const xp = rollRange(chest.rewards.xp, rng);
  const coins = rollRange(chest.rewards.coins, rng);
  const packs: Array<{ packId: string; quantity: number }> = [];
  const cosmetics: Array<{ kind: "avatar" | "aura"; itemId: string }> = [];

  for (const drop of chest.rewards.cardPacks ?? []) {
    if (!drop?.packId || !Number.isFinite(drop.quantity) || drop.quantity <= 0) continue;
    const chance = Math.min(100, Math.max(0, Number(drop.chancePercent) || 0));
    if (chance >= 100 || rng() * 100 < chance) {
      packs.push({ packId: normalizeCardPackId(drop.packId), quantity: Math.floor(drop.quantity) });
    }
  }

  for (const drop of chest.rewards.cosmetics ?? []) {
    if (!drop?.itemId) continue;
    const chance = Math.min(100, Math.max(0, Number(drop.chancePercent) || 0));
    if (chance >= 100 || rng() * 100 < chance) {
      cosmetics.push({ kind: drop.kind, itemId: drop.itemId });
    }
  }

  return {
    chestId: chest.id,
    chestName: chest.name,
    points,
    xp,
    coins,
    packs,
    cosmetics,
  };
}

export function consumeAndOpenChest(
  chest: ChestDefinition,
  currentUnopenedChests: Record<string, number> = {},
  rng: () => number = Math.random,
): {
  ok: boolean;
  error?: string;
  outcome?: ChestOpenOutcome;
  updatedUnopenedChests: Record<string, number>;
} {
  const available = Math.max(0, Math.floor(Number(currentUnopenedChests[chest.id]) || 0));
  if (available <= 0) {
    return {
      ok: false,
      error: "Você não possui este baú disponível na mochila.",
      updatedUnopenedChests: { ...currentUnopenedChests },
    };
  }
  const outcome = openChest(chest, rng);
  const updatedUnopenedChests = { ...currentUnopenedChests };
  const remaining = available - 1;
  if (remaining > 0) updatedUnopenedChests[chest.id] = remaining;
  else delete updatedUnopenedChests[chest.id];

  return { ok: true, outcome, updatedUnopenedChests };
}

/**
 * Consome até `quantity` unidades do mesmo baú atomicamente e consolida
 * todos os bônus (pontos, XP, moedas, pacotes agrupados por packId e cosméticos deduplicados).
 */
export function consumeAndOpenChestsBatch(
  chest: ChestDefinition,
  quantity: number,
  currentUnopenedChests: Record<string, number> = {},
  rng: () => number = Math.random,
): {
  ok: boolean;
  error?: string;
  openedCount: number;
  outcome?: ChestOpenOutcome;
  updatedUnopenedChests: Record<string, number>;
} {
  const available = Math.max(0, Math.floor(Number(currentUnopenedChests[chest.id]) || 0));
  if (!Number.isFinite(quantity) || Math.floor(quantity) < 1) {
    return {
      ok: false,
      error: "Quantidade de baús inválida.",
      openedCount: 0,
      updatedUnopenedChests: { ...currentUnopenedChests },
    };
  }
  const requested = Math.floor(quantity);
  const toOpen = Math.min(available, requested);
  if (toOpen <= 0) {
    return {
      ok: false,
      error: "Você não possui este baú disponível na mochila.",
      openedCount: 0,
      updatedUnopenedChests: { ...currentUnopenedChests },
    };
  }

  let totalPoints = 0;
  let totalXp = 0;
  let totalCoins = 0;
  const packsMap = new Map<string, number>();
  // Preserva todas as ocorrências sorteadas para que cada duplicata receba compensação em moedas na abertura em lote
  const cosmeticsList: Array<{ kind: "avatar" | "aura"; itemId: string }> = [];

  for (let i = 0; i < toOpen; i++) {
    const single = openChest(chest, rng);
    totalPoints += single.points;
    totalXp += single.xp;
    totalCoins += single.coins;
    for (const pk of single.packs) {
      if (pk.quantity > 0) {
        packsMap.set(pk.packId, (packsMap.get(pk.packId) ?? 0) + pk.quantity);
      }
    }
    for (const cosm of single.cosmetics) {
      cosmeticsList.push(cosm);
    }
  }

  const updatedUnopenedChests = { ...currentUnopenedChests };
  const remaining = available - toOpen;
  if (remaining > 0) updatedUnopenedChests[chest.id] = remaining;
  else delete updatedUnopenedChests[chest.id];

  return {
    ok: true,
    openedCount: toOpen,
    outcome: {
      chestId: chest.id,
      chestName: chest.name,
      points: totalPoints,
      xp: totalXp,
      coins: totalCoins,
      packs: Array.from(packsMap.entries()).map(([packId, qty]) => ({
        packId,
        quantity: qty,
      })),
      cosmetics: cosmeticsList,
    },
    updatedUnopenedChests,
  };
}
