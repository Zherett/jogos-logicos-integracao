// Catálogo de Cosméticos (Avatares e Auras do Perfil) e Regras de Loja (browser-safe)

import type { CardPackDefinition } from "./cards-catalog.ts";

export type AvatarIconKey =
  | "user"
  | "smile"
  | "heart"
  | "flower"
  | "star"
  | "headphones"
  | "gamepad"
  | "bomb"
  | "zap"
  | "shield"
  | "rocket"
  | "flame"
  | "ghost"
  | "bot"
  | "bot_cyber"
  | "bot_crown"
  | "trophy"
  | "gem"
  | "crown";

export type CosmeticKind = "avatar" | "aura";

export interface AvatarBasicColor {
  id: string;
  label: string;
  hex: string;
}

export const AVATAR_BASIC_COLORS: readonly AvatarBasicColor[] = [
  { id: "azul", label: "Azul", hex: "#3b82f6" },
  { id: "verde", label: "Verde", hex: "#10b981" },
  { id: "amarelo", label: "Amarelo", hex: "#f59e0b" },
  { id: "roxo", label: "Roxo", hex: "#8b5cf6" },
  { id: "rosa", label: "Rosa", hex: "#ec4899" },
  { id: "grafite", label: "Grafite", hex: "#64748b" },
] as const;

export const DEFAULT_AVATAR_ID = "avatar_default";
export const DEFAULT_AVATAR_COLOR = AVATAR_BASIC_COLORS[0].hex;

export interface AvatarDefinition {
  id: string;
  name: string;
  description: string;
  iconKey?: AvatarIconKey;
  /** URL de imagem estática ou GIF criada pelo ADM */
  imageUrl?: string;
  priceCoins: number;
  featured?: boolean;
  enabled: boolean;
  isDefault?: boolean;
  createdAt?: string;
}

export type AuraKind = "static" | "pulsing" | "bicolor";

export interface AuraDefinition {
  id: string;
  name: string;
  description: string;
  kind: AuraKind;
  primaryColor: string;
  secondaryColor?: string;
  priceCoins: number;
  featured?: boolean;
  enabled: boolean;
  isDefault?: boolean;
}

export const DEFAULT_AVATARS: readonly AvatarDefinition[] = [
  {
    id: DEFAULT_AVATAR_ID,
    name: "Avatar Padrão",
    description: "Ícone clássico de contato com 6 cores gratuitas.",
    iconKey: "user",
    priceCoins: 0,
    featured: false,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_smile",
    name: "Sorriso Feliz",
    description: "Expressão leve e amigável para o seu perfil.",
    iconKey: "smile",
    priceCoins: 60,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_heart",
    name: "Coração",
    description: "Ícone de coração vibrante.",
    iconKey: "heart",
    priceCoins: 60,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_flower",
    name: "Flor",
    description: "Visual natural e colorido para seu quadrado.",
    iconKey: "flower",
    priceCoins: 60,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_star",
    name: "Estrela",
    description: "Brilhe entre os melhores jogadores.",
    iconKey: "star",
    priceCoins: 60,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_headphones",
    name: "Fone de Ouvido",
    description: "Para quem joga no ritmo da música.",
    iconKey: "headphones",
    priceCoins: 60,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_gamepad",
    name: "Gamepad",
    description: "Clássico controle gamer.",
    iconKey: "gamepad",
    priceCoins: 60,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_bomb",
    name: "Bomba Tática",
    description: "Inspirado nos desafios explosivos do Campo Minado.",
    iconKey: "bomb",
    priceCoins: 110,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_zap",
    name: "Raio Elétrico",
    description: "Velocidade máxima de raciocínio.",
    iconKey: "zap",
    priceCoins: 110,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_shield",
    name: "Escudo Guardião",
    description: "Defesa sólida nos duelos e ranqueadas.",
    iconKey: "shield",
    priceCoins: 110,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_rocket",
    name: "Foguete Espacial",
    description: "Decole rumo ao topo do placar.",
    iconKey: "rocket",
    priceCoins: 110,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_flame",
    name: "Chama Ardente",
    description: "Sequência de vitórias pegando fogo.",
    iconKey: "flame",
    priceCoins: 110,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_ghost",
    name: "Fantasminha",
    description: "Misterioso e estiloso.",
    iconKey: "ghost",
    priceCoins: 110,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_bot",
    name: "Robô Clássico",
    description: "O mascote robótico dos Desafios.",
    iconKey: "bot",
    priceCoins: 160,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_bot_cyber",
    name: "Robô Ciborgue",
    description: "Unidade cibernética com visor iluminado.",
    iconKey: "bot_cyber",
    priceCoins: 200,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_trophy",
    name: "Troféu Dourado",
    description: "Símbolo dos campeões de torneio.",
    iconKey: "trophy",
    priceCoins: 200,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_gem",
    name: "Diamante Puro",
    description: "Brilho cristalino de raridade elevada.",
    iconKey: "gem",
    priceCoins: 240,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_bot_crown",
    name: "Robô Coroado",
    description: "Robô supremo com coroa real.",
    iconKey: "bot_crown",
    priceCoins: 250,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "avatar_crown",
    name: "Coroa Real",
    description: "Autoridade máxima no perfil.",
    iconKey: "crown",
    priceCoins: 280,
    featured: true,
    enabled: true,
    isDefault: true,
  },
];

export const DEFAULT_AURAS: readonly AuraDefinition[] = [
  // Estáticas (90 moedas)
  {
    id: "aura_azul_static",
    name: "Aura Azul Estática",
    description: "Brilho azul contínuo ao redor do avatar e do cartão.",
    kind: "static",
    primaryColor: "#3b82f6",
    priceCoins: 90,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_verde_static",
    name: "Aura Verde Estática",
    description: "Brilho verde esmeralda contínuo.",
    kind: "static",
    primaryColor: "#10b981",
    priceCoins: 90,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_amarela_static",
    name: "Aura Amarela Estática",
    description: "Brilho dourado contínuo.",
    kind: "static",
    primaryColor: "#f59e0b",
    priceCoins: 90,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_roxa_static",
    name: "Aura Roxa Estática",
    description: "Brilho violeta contínuo.",
    kind: "static",
    primaryColor: "#8b5cf6",
    priceCoins: 90,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_rosa_static",
    name: "Aura Rosa Estática",
    description: "Brilho rosa contínuo.",
    kind: "static",
    primaryColor: "#ec4899",
    priceCoins: 90,
    enabled: true,
    isDefault: true,
  },
  // Pulsantes (160 moedas)
  {
    id: "aura_azul_pulse",
    name: "Aura Azul Pulsante",
    description: "Energia azul pulsante ao redor do perfil.",
    kind: "pulsing",
    primaryColor: "#3b82f6",
    priceCoins: 160,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_verde_pulse",
    name: "Aura Verde Pulsante",
    description: "Energia verde pulsante ao redor do perfil.",
    kind: "pulsing",
    primaryColor: "#10b981",
    priceCoins: 160,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_amarela_pulse",
    name: "Aura Amarela Pulsante",
    description: "Energia dourada pulsante ao redor do perfil.",
    kind: "pulsing",
    primaryColor: "#f59e0b",
    priceCoins: 160,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_roxa_pulse",
    name: "Aura Roxa Pulsante",
    description: "Energia violeta pulsante ao redor do perfil.",
    kind: "pulsing",
    primaryColor: "#8b5cf6",
    priceCoins: 160,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_rosa_pulse",
    name: "Aura Rosa Pulsante",
    description: "Energia rosa pulsante ao redor do perfil.",
    kind: "pulsing",
    primaryColor: "#ec4899",
    priceCoins: 160,
    enabled: true,
    isDefault: true,
  },
  // Bicolores Pulsantes (320 a 350 moedas)
  {
    id: "aura_bicolor_cyber",
    name: "Aura Cibernética",
    description: "Fusão pulsante de Azul e Roxo neon.",
    kind: "bicolor",
    primaryColor: "#3b82f6",
    secondaryColor: "#a855f7",
    priceCoins: 320,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_bicolor_esmeralda",
    name: "Aura Esmeralda Neon",
    description: "Fusão pulsante de Verde e Ciano brilhante.",
    kind: "bicolor",
    primaryColor: "#10b981",
    secondaryColor: "#06b6d4",
    priceCoins: 320,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_bicolor_solar",
    name: "Aura Solar",
    description: "Fusão pulsante de Amarelo e Laranja intenso.",
    kind: "bicolor",
    primaryColor: "#f59e0b",
    secondaryColor: "#f97316",
    priceCoins: 320,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_bicolor_galactica",
    name: "Aura Galáctica",
    description: "Fusão pulsante de Roxo e Rosa cósmico.",
    kind: "bicolor",
    primaryColor: "#8b5cf6",
    secondaryColor: "#ec4899",
    priceCoins: 320,
    featured: true,
    enabled: true,
    isDefault: true,
  },
  {
    id: "aura_bicolor_real",
    name: "Aura Real",
    description: "Fusão pulsante de Dourado e Vermelho lendário.",
    kind: "bicolor",
    primaryColor: "#eab308",
    secondaryColor: "#ef4444",
    priceCoins: 350,
    featured: true,
    enabled: true,
    isDefault: true,
  },
];

export function mergeWithDefaultAvatars(custom?: AvatarDefinition[] | null): AvatarDefinition[] {
  const byId = new Map<string, AvatarDefinition>();
  for (const def of DEFAULT_AVATARS) {
    byId.set(def.id, { ...def });
  }
  for (const item of custom ?? []) {
    if (!item || !item.id) continue;
    const base = byId.get(item.id);
    byId.set(item.id, base ? { ...base, ...item } : { ...item });
  }
  return Array.from(byId.values());
}

export function mergeWithDefaultAuras(custom?: AuraDefinition[] | null): AuraDefinition[] {
  const byId = new Map<string, AuraDefinition>();
  for (const def of DEFAULT_AURAS) {
    byId.set(def.id, { ...def });
  }
  for (const item of custom ?? []) {
    if (!item || !item.id) continue;
    const base = byId.get(item.id);
    byId.set(item.id, base ? { ...base, ...item } : { ...item });
  }
  return Array.from(byId.values());
}

export interface CosmeticProfileSlice {
  coins?: number;
  unlockedAvatars?: string[];
  equippedAvatar?: { id: string; color?: string };
  unlockedAuras?: string[];
  equippedAuraId?: string;
  unopenedPacks?: Record<string, number>;
}

export function getUnlockedAvatarIds(profile?: CosmeticProfileSlice | null): string[] {
  const set = new Set<string>([DEFAULT_AVATAR_ID]);
  for (const id of profile?.unlockedAvatars ?? []) {
    if (id) set.add(id);
  }
  return Array.from(set);
}

export function getUnlockedAuraIds(profile?: CosmeticProfileSlice | null): string[] {
  const set = new Set<string>();
  for (const id of profile?.unlockedAuras ?? []) {
    if (id) set.add(id);
  }
  return Array.from(set);
}

export function resolveEquippedAvatar(
  profile?: CosmeticProfileSlice | null,
  avatarsCatalog?: AvatarDefinition[] | null,
): { avatar: AvatarDefinition; color: string } {
  const catalog = mergeWithDefaultAvatars(avatarsCatalog);
  const unlocked = new Set(getUnlockedAvatarIds(profile));
  const desiredId = profile?.equippedAvatar?.id;
  const matched =
    desiredId && unlocked.has(desiredId)
      ? catalog.find((a) => a.id === desiredId)
      : undefined;
  const avatar = matched ?? catalog.find((a) => a.id === DEFAULT_AVATAR_ID) ?? DEFAULT_AVATARS[0];

  const desiredColor = profile?.equippedAvatar?.color;
  const validColor =
    desiredColor && /^#[0-9a-fA-F]{3,8}$/.test(desiredColor)
      ? desiredColor
      : DEFAULT_AVATAR_COLOR;

  return { avatar, color: validColor };
}

export function resolveEquippedAura(
  profile?: CosmeticProfileSlice | null,
  aurasCatalog?: AuraDefinition[] | null,
): AuraDefinition | null {
  const desiredId = profile?.equippedAuraId;
  if (!desiredId) return null;
  const unlocked = new Set(getUnlockedAuraIds(profile));
  if (!unlocked.has(desiredId)) return null;
  const catalog = mergeWithDefaultAuras(aurasCatalog);
  return catalog.find((a) => a.id === desiredId) ?? null;
}

export function grantCosmeticToProfile<T extends CosmeticProfileSlice>(
  profile: T,
  kind: CosmeticKind,
  itemId: string,
): { profile: T; alreadyOwned: boolean } {
  if (!itemId) return { profile, alreadyOwned: false };
  if (kind === "avatar") {
    const unlocked = getUnlockedAvatarIds(profile);
    if (unlocked.includes(itemId)) {
      return { profile, alreadyOwned: true };
    }
    return {
      profile: {
        ...profile,
        unlockedAvatars: [...unlocked, itemId],
      },
      alreadyOwned: false,
    };
  }
  const unlocked = getUnlockedAuraIds(profile);
  if (unlocked.includes(itemId)) {
    return { profile, alreadyOwned: true };
  }
  return {
    profile: {
      ...profile,
      unlockedAuras: [...unlocked, itemId],
    },
    alreadyOwned: false,
  };
}

export function purchaseStoreCosmetic<T extends CosmeticProfileSlice>(
  profile: T,
  kind: CosmeticKind,
  item: { id: string; name: string; priceCoins: number; enabled?: boolean },
): { ok: boolean; error?: string; profile: T } {
  if (item.enabled === false) {
    return { ok: false, error: "Este item não está disponível na loja no momento.", profile };
  }
  const unlocked = kind === "avatar" ? getUnlockedAvatarIds(profile) : getUnlockedAuraIds(profile);
  if (unlocked.includes(item.id)) {
    return { ok: false, error: "Você já possui este item cosmético.", profile };
  }
  const price = Math.max(0, Math.floor(Number(item.priceCoins) || 0));
  const currentCoins = Math.max(0, Math.floor(Number(profile.coins) || 0));
  if (currentCoins < price) {
    return {
      ok: false,
      error: `Moedas insuficientes (precisa de ${price}, você tem ${currentCoins}).`,
      profile,
    };
  }
  const granted = grantCosmeticToProfile(profile, kind, item.id);
  return {
    ok: true,
    profile: {
      ...granted.profile,
      coins: currentCoins - price,
    },
  };
}

export function purchaseStoreCardPack<T extends CosmeticProfileSlice>(
  profile: T,
  pack: CardPackDefinition,
  quantity = 1,
): { ok: boolean; error?: string; profile: T; totalCost: number } {
  const safeQty = Math.max(1, Math.floor(quantity));
  if (pack.enabled === false) {
    return { ok: false, error: "Este pacote não está disponível na loja.", profile, totalCost: 0 };
  }
  const unitPrice = Math.max(1, Math.floor(Number(pack.priceCoins) || 0));
  const totalCost = unitPrice * safeQty;
  const currentCoins = Math.max(0, Math.floor(Number(profile.coins) || 0));
  if (currentCoins < totalCost) {
    return {
      ok: false,
      error: `Moedas insuficientes (precisa de ${totalCost}, você tem ${currentCoins}).`,
      profile,
      totalCost,
    };
  }
  const nextPacks = { ...(profile.unopenedPacks ?? {}) };
  nextPacks[pack.id] = (Number(nextPacks[pack.id]) || 0) + safeQty;
  return {
    ok: true,
    totalCost,
    profile: {
      ...profile,
      coins: currentCoins - totalCost,
      unopenedPacks: nextPacks,
    },
  };
}
