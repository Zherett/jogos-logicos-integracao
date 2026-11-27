// Catálogo de Cosméticos (Avatares e Auras do Perfil) e Regras de Loja (browser-safe)

import type { CardPackDefinition } from "./cards-catalog.ts";
import { isSafeHttpOrRelativeMediaUrl } from "./media-url.ts";

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

export type AvatarCategory = "icon" | "letter";
export type AvatarLetterVariant = "simple" | "round" | "square";

export const LEVEL5_FREE_LETTER_MIN_LEVEL = 5;
export const DUAL_AVATAR_MIN_LEVEL = 10;

export const AVATAR_LETTER_VARIANTS: readonly {
  id: AvatarLetterVariant;
  label: string;
  shortLabel: string;
  description: string;
  priceCoins: number;
}[] = [
  {
    id: "simple",
    label: "Simples",
    shortLabel: "Simples",
    description: "Fonte limpa e fina para um visual minimalista.",
    priceCoins: 50,
  },
  {
    id: "round",
    label: "Arredondada",
    shortLabel: "Arredondada",
    description: "Fonte bold, cheinha e com contornos arredondados.",
    priceCoins: 80,
  },
  {
    id: "square",
    label: "Geométrica",
    shortLabel: "Quadrada",
    description: "Fonte cheinha com formas geométricas e traços retos.",
    priceCoins: 100,
  },
] as const;

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
  category?: AvatarCategory;
  iconKey?: AvatarIconKey;
  /** Letra maiúscula de A a Z para avatares da categoria "letter" */
  letterChar?: string;
  /** Variação estilística da letra: simples, arredondada ou quadrada/geométrica */
  letterVariant?: AvatarLetterVariant;
  /** URL de imagem estática ou GIF criada pelo ADM */
  imageUrl?: string;
  priceCoins: number;
  featured?: boolean;
  enabled: boolean;
  isDefault?: boolean;
  createdAt?: string;
}

export function getAvatarCategory(avatar?: Pick<AvatarDefinition, "category" | "letterChar"> | null): AvatarCategory {
  if (!avatar) return "icon";
  if (avatar.category === "letter" || avatar.letterChar) return "letter";
  return "icon";
}

const AVATAR_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function buildLetterAvatarId(letter: string, variant: AvatarLetterVariant): string {
  const clean = letter.trim().toLowerCase().slice(0, 1);
  return `avatar_letter_${variant}_${clean}`;
}

export function buildDefaultLetterAvatars(): AvatarDefinition[] {
  const list: AvatarDefinition[] = [];
  for (const variant of AVATAR_LETTER_VARIANTS) {
    for (const letter of AVATAR_ALPHABET) {
      list.push({
        id: buildLetterAvatarId(letter, variant.id),
        name: `Letra ${letter} (${variant.label})`,
        description: variant.description,
        category: "letter",
        letterChar: letter,
        letterVariant: variant.id,
        priceCoins: variant.priceCoins,
        featured: false,
        enabled: true,
        isDefault: true,
      });
    }
  }
  return list;
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
  ...buildDefaultLetterAvatars(),
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

const MAX_DATA_IMAGE_URL_CHARS = 16_000;

/**
 * Sanitiza uma cor hexadecimal para exatamente 6 dígitos (`#RRGGBB`),
 * impedindo CSS inválido (ex.: `#fff22`) ou injeção em variáveis/SVG.
 */
export function sanitizeHex6(value?: string | null, fallback = DEFAULT_AVATAR_COLOR): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

/**
 * Valida URL de imagem para avatares customizados contra protocolos inseguros (XSS),
 * bloqueios de CSP (`http://`) e excesso de bytes no limite de 100 KB do PlayFab.
 * Aceita apenas `https://`, caminhos relativos (`/`) ou `data:image/(png|jpeg|gif|webp);base64,...` até ~12 KB.
 */
export function isSafeCosmeticImageUrl(url?: string | null): boolean {
  return isSafeHttpOrRelativeMediaUrl(url, {
    allowDataImage: true,
    maxDataImageChars: MAX_DATA_IMAGE_URL_CHARS,
  });
}

function stripUndefinedEntries<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const clean: Partial<T> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      (clean as Record<string, unknown>)[key] = val;
    }
  }
  return clean;
}

export function mergeWithDefaultAvatars(custom?: AvatarDefinition[] | null): AvatarDefinition[] {
  const byId = new Map<string, AvatarDefinition>();
  for (const def of DEFAULT_AVATARS) {
    byId.set(def.id, { ...def });
  }
  for (const item of custom ?? []) {
    if (!item || !item.id) continue;
    const base = byId.get(item.id);
    const hasSafeImage = Boolean(item.imageUrl && isSafeCosmeticImageUrl(item.imageUrl));
    if (item.imageUrl && !hasSafeImage && !base && !item.iconKey && !item.letterChar) {
      continue;
    }
    const cleanItem = stripUndefinedEntries(item as unknown as Record<string, unknown>) as Partial<AvatarDefinition>;
    if (item.imageUrl !== undefined) {
      cleanItem.imageUrl = hasSafeImage ? item.imageUrl.trim() : base?.imageUrl;
      if (!cleanItem.imageUrl) {
        delete cleanItem.imageUrl;
      }
    }
    const merged: AvatarDefinition = base
      ? ({ ...base, ...cleanItem } as AvatarDefinition)
      : ({ ...(cleanItem as AvatarDefinition) });
    byId.set(merged.id, merged);
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
    const cleanItem = stripUndefinedEntries(item as unknown as Record<string, unknown>) as Partial<AuraDefinition>;
    const merged: AuraDefinition = base
      ? ({ ...base, ...cleanItem } as AuraDefinition)
      : ({ ...(cleanItem as AuraDefinition) });
    merged.primaryColor = sanitizeHex6(merged.primaryColor, base?.primaryColor ?? "#3b82f6");
    if (merged.secondaryColor) {
      merged.secondaryColor = sanitizeHex6(merged.secondaryColor, base?.secondaryColor ?? "#ec4899");
    }
    byId.set(merged.id, merged);
  }
  return Array.from(byId.values());
}

/**
 * Extrai apenas avatares customizados ou overrides que diferem do catálogo padrão,
 * economizando ~20 KB na chave compartilhada de 100 KB no PlayFab.
 */
export function extractCustomAvatarsForStorage(allAvatars: AvatarDefinition[]): AvatarDefinition[] {
  const defaultById = new Map(DEFAULT_AVATARS.map((d) => [d.id, d]));
  const result: AvatarDefinition[] = [];
  for (const av of allAvatars) {
    if (!av?.id) continue;
    const def = defaultById.get(av.id);
    if (!def) {
      result.push(av);
      continue;
    }
    const changed =
      av.priceCoins !== def.priceCoins ||
      av.enabled !== def.enabled ||
      Boolean(av.featured) !== Boolean(def.featured) ||
      av.name !== def.name ||
      av.description !== def.description ||
      (av.iconKey ?? "") !== (def.iconKey ?? "") ||
      (av.category ?? "") !== (def.category ?? "") ||
      (av.letterChar ?? "") !== (def.letterChar ?? "") ||
      (av.letterVariant ?? "") !== (def.letterVariant ?? "") ||
      (av.imageUrl ?? "") !== (def.imageUrl ?? "");
    if (changed) {
      result.push(av);
    }
  }
  return result;
}

/**
 * Extrai apenas auras customizadas ou overrides que diferem do catálogo padrão.
 */
export function extractCustomAurasForStorage(allAuras: AuraDefinition[]): AuraDefinition[] {
  const defaultById = new Map(DEFAULT_AURAS.map((d) => [d.id, d]));
  const result: AuraDefinition[] = [];
  for (const au of allAuras) {
    if (!au?.id) continue;
    const def = defaultById.get(au.id);
    if (!def) {
      result.push(au);
      continue;
    }
    const changed =
      au.priceCoins !== def.priceCoins ||
      au.enabled !== def.enabled ||
      Boolean(au.featured) !== Boolean(def.featured) ||
      au.name !== def.name ||
      au.description !== def.description ||
      au.kind !== def.kind ||
      au.primaryColor !== def.primaryColor ||
      (au.secondaryColor ?? "") !== (def.secondaryColor ?? "");
    if (changed) {
      result.push(au);
    }
  }
  return result;
}

export interface CosmeticProfileSlice {
  coins?: number;
  lifetimeCoins?: number;
  coinsSpentTotal?: number;
  purchasedCosmeticIds?: string[];
  purchasedPackCounts?: Record<string, number>;
  storeCoinsSpentByItem?: Record<string, number>;
  unlockedAvatars?: string[];
  equippedAvatar?: { id: string; secondaryId?: string; color?: string };
  level5InitialAvatarGrantedId?: string;
  level?: number;
  nick?: string;
  full_name?: string;
  unlockedAuras?: string[];
  equippedAuraId?: string;
  unopenedPacks?: Record<string, number>;
}

/**
 * Mescla mapas de contadores não-negativos (ex.: pacotes comprados, moedas gastas por item)
 * preservando o maior valor observado para cada chave.
 */
export function mergeMonotonicCountRecords(
  ...records: Array<Record<string, number> | undefined | null>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    for (const [key, rawVal] of Object.entries(rec)) {
      if (!key) continue;
      const n = Number(rawVal);
      if (!Number.isFinite(n) || n <= 0) continue;
      const safeVal = Math.floor(n);
      if (safeVal > (out[key] ?? 0)) {
        out[key] = safeVal;
      }
    }
  }
  return out;
}

const VALID_LEVEL5_FREE_LETTER_REGEX = /^avatar_letter_simple_[a-z]$/;

export function isValidLevel5InitialLetterAvatarId(id?: string | null): boolean {
  return typeof id === "string" && VALID_LEVEL5_FREE_LETTER_REGEX.test(id);
}

/** Extrai a primeira letra A-Z (sem acentos, em maiúsculo) do apelido (ou nome de fallback). */
export function getInitialLetterFromNick(nick?: string | null, fallbackFullName?: string | null): string | null {
  for (const candidate of [nick, fallbackFullName]) {
    if (!candidate || typeof candidate !== "string") continue;
    const normalized = candidate
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const match = /[A-Z]/.exec(normalized);
    if (match) return match[0];
  }
  return null;
}

/** Retorna o ID do avatar de letra simples gratuito correspondente à inicial do nick (ou nome). */
export function getInitialLetterAvatarIdForNick(
  nick?: string | null,
  fallbackFullName?: string | null,
): string | null {
  const letter = getInitialLetterFromNick(nick, fallbackFullName);
  if (!letter) return null;
  return buildLetterAvatarId(letter, "simple");
}

/** Verifica se o jogador já atingiu o Nível 10 para equipar 2 avatares com animação. */
export function canUseDualAvatar(profile?: Pick<CosmeticProfileSlice, "level"> | null): boolean {
  const lvl = Math.floor(Number(profile?.level) || 1);
  return lvl >= DUAL_AVATAR_MIN_LEVEL;
}

/**
 * Garante o desbloqueio gratuito (inclusive retroativo) da letra inicial simples
 * para jogadores que atingiram o Nível 5 ou superior, sem descontar moedas.
 */
export function ensureLevel5InitialLetterUnlock<T extends CosmeticProfileSlice>(
  profile: T,
): { profile: T; grantedAvatarId: string | null } {
  const lvl = Math.floor(Number(profile?.level) || 1);
  if (lvl < LEVEL5_FREE_LETTER_MIN_LEVEL) {
    return { profile, grantedAvatarId: null };
  }

  const validExistingGrant = isValidLevel5InitialLetterAvatarId(profile.level5InitialAvatarGrantedId)
    ? profile.level5InitialAvatarGrantedId
    : null;
  const targetId =
    validExistingGrant || getInitialLetterAvatarIdForNick(profile.nick, profile.full_name);
  if (!targetId) {
    return { profile, grantedAvatarId: null };
  }

  const rawUnlocked = Array.isArray(profile.unlockedAvatars) ? profile.unlockedAvatars : [];
  const hasTarget = rawUnlocked.includes(targetId);
  const alreadyMarked = profile.level5InitialAvatarGrantedId === targetId;

  if (hasTarget && alreadyMarked) {
    return { profile, grantedAvatarId: null };
  }

  const nextUnlocked = Array.from(new Set([DEFAULT_AVATAR_ID, ...rawUnlocked, targetId]));
  return {
    profile: {
      ...profile,
      unlockedAvatars: nextUnlocked,
      level5InitialAvatarGrantedId: targetId,
    },
    grantedAvatarId: hasTarget ? null : targetId,
  };
}

export function getUnlockedAvatarIds(profile?: CosmeticProfileSlice | null): string[] {
  const set = new Set<string>([DEFAULT_AVATAR_ID]);
  for (const id of profile?.unlockedAvatars ?? []) {
    if (id) set.add(id);
  }
  const lvl = Math.floor(Number(profile?.level) || 1);
  if (lvl >= LEVEL5_FREE_LETTER_MIN_LEVEL) {
    const validExistingGrant = isValidLevel5InitialLetterAvatarId(profile?.level5InitialAvatarGrantedId)
      ? profile?.level5InitialAvatarGrantedId
      : null;
    const freeLetterId =
      validExistingGrant || getInitialLetterAvatarIdForNick(profile?.nick, profile?.full_name);
    if (freeLetterId) {
      set.add(freeLetterId);
    }
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
): { avatar: AvatarDefinition; secondaryAvatar: AvatarDefinition | null; color: string } {
  const catalog = mergeWithDefaultAvatars(avatarsCatalog);
  const unlocked = new Set(getUnlockedAvatarIds(profile));
  const desiredId = profile?.equippedAvatar?.id;
  const matched =
    desiredId && unlocked.has(desiredId)
      ? catalog.find((a) => a.id === desiredId)
      : undefined;
  const avatar = matched ?? catalog.find((a) => a.id === DEFAULT_AVATAR_ID) ?? DEFAULT_AVATARS[0];

  let secondaryAvatar: AvatarDefinition | null = null;
  const desiredSecondaryId = profile?.equippedAvatar?.secondaryId;
  if (
    canUseDualAvatar(profile) &&
    desiredSecondaryId &&
    desiredSecondaryId !== avatar.id &&
    unlocked.has(desiredSecondaryId)
  ) {
    secondaryAvatar = catalog.find((a) => a.id === desiredSecondaryId) ?? null;
  }

  const validColor = sanitizeHex6(profile?.equippedAvatar?.color, DEFAULT_AVATAR_COLOR);

  return { avatar, secondaryAvatar, color: validColor };
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
): { ok: boolean; error?: string; profile: T; pricePaid: number } {
  if (item.enabled === false) {
    return { ok: false, error: "Este item não está disponível na loja no momento.", profile, pricePaid: 0 };
  }
  const unlocked = kind === "avatar" ? getUnlockedAvatarIds(profile) : getUnlockedAuraIds(profile);
  if (unlocked.includes(item.id)) {
    return { ok: false, error: "Você já possui este item cosmético.", profile, pricePaid: 0 };
  }
  const rawPrice = Number(item.priceCoins);
  if (!Number.isFinite(rawPrice) || Math.floor(rawPrice) <= 0) {
    return {
      ok: false,
      error: "Este item não possui preço válido configurado na loja.",
      profile,
      pricePaid: 0,
    };
  }
  const price = Math.floor(rawPrice);
  const currentCoins = Number.isFinite(Number(profile.coins)) ? Math.max(0, Math.floor(Number(profile.coins))) : 0;
  if (currentCoins < price) {
    return {
      ok: false,
      error: `Moedas insuficientes (precisa de ${price}, você tem ${currentCoins}).`,
      profile,
      pricePaid: 0,
    };
  }
  const granted = grantCosmeticToProfile(profile, kind, item.id);
  const purchasedKey = `${kind}:${item.id}`;
  const prevPurchased = Array.isArray(profile.purchasedCosmeticIds) ? profile.purchasedCosmeticIds : [];
  const nextPurchased = prevPurchased.includes(purchasedKey)
    ? prevPurchased
    : [...prevPurchased, purchasedKey];
  const prevSpentByItem = { ...(profile.storeCoinsSpentByItem ?? {}) };
  prevSpentByItem[purchasedKey] =
    Math.max(0, Math.floor(Number(prevSpentByItem[purchasedKey]) || 0)) + price;
  const prevSpent = Number.isFinite(Number(profile.coinsSpentTotal))
    ? Math.max(0, Math.floor(Number(profile.coinsSpentTotal)))
    : 0;
  const safeLifetime = Math.max(
    Number.isFinite(Number(profile.lifetimeCoins)) ? Math.max(0, Math.floor(Number(profile.lifetimeCoins))) : 0,
    currentCoins + prevSpent,
  );
  return {
    ok: true,
    pricePaid: price,
    profile: {
      ...granted.profile,
      coins: currentCoins - price,
      lifetimeCoins: safeLifetime,
      coinsSpentTotal: prevSpent + price,
      purchasedCosmeticIds: nextPurchased,
      storeCoinsSpentByItem: prevSpentByItem,
    },
  };
}

export function purchaseStoreCardPack<T extends CosmeticProfileSlice>(
  profile: T,
  pack: CardPackDefinition,
  quantity = 1,
): { ok: boolean; error?: string; profile: T; totalCost: number } {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "Quantidade inválida para compra de pacote.", profile, totalCost: 0 };
  }
  if (pack.enabled === false || pack.showInStore === false) {
    return { ok: false, error: "Este pacote não está disponível na loja.", profile, totalCost: 0 };
  }
  const rawPrice = Number(pack.priceCoins);
  if (!Number.isFinite(rawPrice) || Math.floor(rawPrice) <= 0) {
    return {
      ok: false,
      error: "Este pacote está sem preço em moedas configurado na loja.",
      profile,
      totalCost: 0,
    };
  }
  const safeQty = quantity;
  const unitPrice = Math.floor(rawPrice);
  const totalCost = unitPrice * safeQty;
  const currentCoins = Number.isFinite(Number(profile.coins)) ? Math.max(0, Math.floor(Number(profile.coins))) : 0;
  if (currentCoins < totalCost) {
    return {
      ok: false,
      error: `Moedas insuficientes (precisa de ${totalCost}, você tem ${currentCoins}).`,
      profile,
      totalCost,
    };
  }
  const nextPacks = { ...(profile.unopenedPacks ?? {}) };
  nextPacks[pack.id] = (Math.max(0, Math.floor(Number(nextPacks[pack.id]) || 0))) + safeQty;
  const nextPackCounts = { ...(profile.purchasedPackCounts ?? {}) };
  nextPackCounts[pack.id] = Math.max(0, Math.floor(Number(nextPackCounts[pack.id]) || 0)) + safeQty;
  const nextSpentByItem = { ...(profile.storeCoinsSpentByItem ?? {}) };
  const packItemKey = `pack:${pack.id}`;
  nextSpentByItem[packItemKey] =
    Math.max(0, Math.floor(Number(nextSpentByItem[packItemKey]) || 0)) + totalCost;
  const prevSpent = Number.isFinite(Number(profile.coinsSpentTotal))
    ? Math.max(0, Math.floor(Number(profile.coinsSpentTotal)))
    : 0;
  const safeLifetime = Math.max(
    Number.isFinite(Number(profile.lifetimeCoins)) ? Math.max(0, Math.floor(Number(profile.lifetimeCoins))) : 0,
    currentCoins + prevSpent,
  );
  return {
    ok: true,
    totalCost,
    profile: {
      ...profile,
      coins: currentCoins - totalCost,
      lifetimeCoins: safeLifetime,
      coinsSpentTotal: prevSpent + totalCost,
      unopenedPacks: nextPacks,
      purchasedPackCounts: nextPackCounts,
      storeCoinsSpentByItem: nextSpentByItem,
    },
  };
}

export interface InventorySlotEntry<T extends { id: string }> {
  slotIndex: number;
  item: T | null;
  quantity: number;
}

/**
 * Aloca itens empilháveis (pacotes de cartas ou baús) em uma grade de até `maxSlots` slots.
 * Cada tipo de item distinto ocupa 1 slot com quantidade ilimitada; slots vazios completam até `maxSlots`.
 */
export function allocateStackedInventorySlots<T extends { id: string }>(
  catalog: readonly T[],
  quantitiesMap?: Record<string, number> | null,
  maxSlots = 15,
): InventorySlotEntry<T>[] {
  const safeMax = Math.max(1, Math.floor(maxSlots));
  const map = quantitiesMap ?? {};
  const occupied: Array<{ item: T; quantity: number }> = [];
  const seenIds = new Set<string>();

  for (const item of catalog) {
    if (!item?.id || seenIds.has(item.id)) continue;
    const qty = Math.max(0, Math.floor(Number(map[item.id]) || 0));
    if (qty <= 0) continue;
    seenIds.add(item.id);
    occupied.push({ item, quantity: qty });
    if (occupied.length >= safeMax) break;
  }

  const slots: InventorySlotEntry<T>[] = [];
  for (let i = 0; i < safeMax; i++) {
    const entry = occupied[i];
    slots.push({
      slotIndex: i + 1,
      item: entry ? entry.item : null,
      quantity: entry ? entry.quantity : 0,
    });
  }
  return slots;
}

export interface PaginatedInventoryResult<T> {
  page: number;
  totalPages: number;
  totalItems: number;
  slots: Array<{ slotNumber: number; item: T | null }>;
}

/**
 * Pagina uma lista unificada de itens (pacotes + baús) em páginas fixas de `pageSize` slots (padrão 12).
 */
export function paginateUnifiedInventorySlots<T>(
  items: readonly T[],
  requestedPage = 1,
  pageSize = 12,
): PaginatedInventoryResult<T> {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const page = Math.max(1, Math.min(totalPages, Math.floor(requestedPage) || 1));
  const start = (page - 1) * safeSize;

  const slots: Array<{ slotNumber: number; item: T | null }> = [];
  for (let i = 0; i < safeSize; i++) {
    const idx = start + i;
    slots.push({
      slotNumber: idx + 1,
      item: idx < totalItems ? items[idx] : null,
    });
  }

  return { page, totalPages, totalItems, slots };
}

/** Calcula o tamanho UTF-8 aproximado da chave `PlatformAdminCatalogs` (limite PlayFab: 100 KB). */
export function measurePlatformCatalogsBytes(payload: {
  cardPacks?: unknown;
  chestsCatalog?: unknown;
  avatarsCatalog?: unknown;
  aurasCatalog?: unknown;
  cardsCatalog?: unknown;
}): number {
  const json = JSON.stringify({
    cardPacks: payload.cardPacks ?? [],
    chestsCatalog: payload.chestsCatalog ?? [],
    avatarsCatalog: payload.avatarsCatalog ?? [],
    aurasCatalog: payload.aurasCatalog ?? [],
    ...(payload.cardsCatalog ? { cardsCatalog: payload.cardsCatalog } : {}),
  });
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length;
}
