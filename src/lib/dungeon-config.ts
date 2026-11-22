// Configuração estática e tabelas de progressão, loot, biomas, habilidades e forja da Masmorra (browser-safe)

import type { CardDefinition, CardRarity, DungeonCardSkillId } from "./cards-catalog.ts";

export const DUNGEON_UNLOCK_LEVEL = 5;
export const DUNGEON_MID_TIER_MAX_FLOOR = 10; // Níveis 5–9
export const DUNGEON_MAX_FLOOR = 15; // Nível 10+
export const DUNGEON_MAX_STAMINA = 5;
export const DUNGEON_MATCHES_PER_STAMINA = 3;
export const DUNGEON_FULL_RECHARGE_MATCHES = 10;
export const DUNGEON_FULL_RECHARGE_DISTINCT_GAMES = 3;
export const DUNGEON_REQUIRED_CARDS = 3;
export const DUNGEON_BASE_HP = 100;
export const DUNGEON_BASE_SAFE_RETENTION = 0.3;

export type DungeonBiomeId = "crypt" | "forge" | "observatory";

export type DungeonResourceId =
  | "paper_fragment"
  | "arcane_dust"
  | "bronze_token"
  | "logic_ore"
  | "iron_gear"
  | "grimoire_page"
  | "quantum_crystal"
  | "star_essence"
  | "guardian_sigil";

export const DUNGEON_RESOURCE_IDS: readonly DungeonResourceId[] = [
  "paper_fragment",
  "arcane_dust",
  "bronze_token",
  "logic_ore",
  "iron_gear",
  "grimoire_page",
  "quantum_crystal",
  "star_essence",
  "guardian_sigil",
] as const;

export interface DungeonResourceDefinition {
  id: DungeonResourceId;
  name: string;
  emoji: string;
  rarityLabel: string;
  biomeId: DungeonBiomeId | "boss";
  description: string;
  badgeClass: string;
  dropWeight: number;
}

export const DUNGEON_RESOURCES: Record<DungeonResourceId, DungeonResourceDefinition> = {
  paper_fragment: {
    id: "paper_fragment",
    name: "Fragmento de Papel",
    emoji: "📜",
    rarityLabel: "Básico",
    biomeId: "crypt",
    description: "Papiro antigo da Cripta de Pedra usado para montar pacotes iniciais.",
    badgeClass: "border-stone-400/50 bg-stone-500/15 text-stone-700 dark:text-stone-300",
    dropWeight: 42,
  },
  arcane_dust: {
    id: "arcane_dust",
    name: "Poeira Arcana",
    emoji: "✨",
    rarityLabel: "Básico",
    biomeId: "crypt",
    description: "Resíduo luminoso deixado por runas antigas da Cripta.",
    badgeClass: "border-sky-400/50 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    dropWeight: 35,
  },
  bronze_token: {
    id: "bronze_token",
    name: "Moeda de Bronze",
    emoji: "🪙",
    rarityLabel: "Comum",
    biomeId: "crypt",
    description: "Ficha antiga que pode ser fundida em moedas da plataforma ou baús.",
    badgeClass: "border-amber-600/50 bg-amber-600/15 text-amber-800 dark:text-amber-300",
    dropWeight: 23,
  },
  logic_ore: {
    id: "logic_ore",
    name: "Minério Lógico",
    emoji: "⛏️",
    rarityLabel: "Intermediário",
    biomeId: "forge",
    description: "Metal cristalizado extraído das galerias da Forja Subterrânea.",
    badgeClass: "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300",
    dropWeight: 38,
  },
  iron_gear: {
    id: "iron_gear",
    name: "Engrenagem",
    emoji: "⚙️",
    rarityLabel: "Intermediário",
    biomeId: "forge",
    description: "Peça de precisão usada na calibração de mecanismos e pacotes avançados.",
    badgeClass: "border-slate-400/50 bg-slate-500/15 text-slate-700 dark:text-slate-300",
    dropWeight: 35,
  },
  grimoire_page: {
    id: "grimoire_page",
    name: "Página de Grimório",
    emoji: "📖",
    rarityLabel: "Incomum",
    biomeId: "forge",
    description: "Folha codificada com teoremas que potencializam pacotes de cartas.",
    badgeClass: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dropWeight: 27,
  },
  quantum_crystal: {
    id: "quantum_crystal",
    name: "Cristal Quântico",
    emoji: "💎",
    rarityLabel: "Raro",
    biomeId: "observatory",
    description: "Gema pura do Observatório Cristalino para receitas lendárias.",
    badgeClass: "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300",
    dropWeight: 55,
  },
  star_essence: {
    id: "star_essence",
    name: "Essência Estelar",
    emoji: "🌟",
    rarityLabel: "Épico",
    biomeId: "observatory",
    description: "Energia cósmica concentrada dos andares mais profundos.",
    badgeClass: "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    dropWeight: 45,
  },
  guardian_sigil: {
    id: "guardian_sigil",
    name: "Selo do Guardião",
    emoji: "🛡️",
    rarityLabel: "Lendário",
    biomeId: "boss",
    description: "Insígnia exclusiva derrubada apenas ao derrotar um Guardião de Bioma.",
    badgeClass: "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300",
    dropWeight: 100,
  },
};

export interface DungeonBiomeDefinition {
  id: DungeonBiomeId;
  name: string;
  subtitle: string;
  minFloor: number;
  maxFloor: number;
  guardianFloor: number;
  guardianName: string;
  guardianChestId: string;
  minLevelRequired: number;
  lootTable: DungeonResourceId[];
  gradientClass: string;
  accentBorderClass: string;
  badgeClass: string;
}

export const DUNGEON_BIOMES: readonly DungeonBiomeDefinition[] = [
  {
    id: "crypt",
    name: "Cripta de Pedra",
    subtitle: "Corredores antigos com armadilhas rúnicas e guardas de silício.",
    minFloor: 1,
    maxFloor: 5,
    guardianFloor: 5,
    guardianName: "Colosso Rúnico",
    guardianChestId: "weekly_common",
    minLevelRequired: DUNGEON_UNLOCK_LEVEL,
    lootTable: ["paper_fragment", "arcane_dust", "bronze_token"],
    gradientClass: "from-stone-800 via-slate-800 to-sky-950",
    accentBorderClass: "border-sky-500/60",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-400/40",
  },
  {
    id: "forge",
    name: "Forja Subterrânea",
    subtitle: "Câmaras de engrenagens vivas, circuitos aquecidos e minérios raros.",
    minFloor: 6,
    maxFloor: 10,
    guardianFloor: 10,
    guardianName: "Autômato de Engrenagens",
    guardianChestId: "quantum_logic",
    minLevelRequired: DUNGEON_UNLOCK_LEVEL,
    lootTable: ["logic_ore", "iron_gear", "grimoire_page"],
    gradientClass: "from-orange-950 via-amber-950 to-stone-900",
    accentBorderClass: "border-amber-500/60",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-400/40",
  },
  {
    id: "observatory",
    name: "Observatório Cristalino",
    subtitle: "Salões estelares de alta complexidade com cristais quânticos.",
    minFloor: 11,
    maxFloor: 15,
    guardianFloor: 15,
    guardianName: "Arquiteto Quântico",
    guardianChestId: "weekly_epic",
    minLevelRequired: 10,
    lootTable: ["quantum_crystal", "star_essence"],
    gradientClass: "from-purple-950 via-indigo-950 to-fuchsia-950",
    accentBorderClass: "border-purple-500/60",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-400/40",
  },
] as const;

export interface DungeonPortalDefinition {
  id: string;
  biomeId: DungeonBiomeId;
  name: string;
  startFloor: number;
  requiredCheckpoint: number;
  minLevelRequired: number;
  description: string;
}

export const DUNGEON_PORTALS: readonly DungeonPortalDefinition[] = [
  {
    id: "portal_crypt",
    biomeId: "crypt",
    name: "Portal da Cripta (Andar 1)",
    startFloor: 1,
    requiredCheckpoint: 1,
    minLevelRequired: DUNGEON_UNLOCK_LEVEL,
    description: "Início da expedição (Andares 1–5). Farme recursos básicos e enfrente o Colosso Rúnico.",
  },
  {
    id: "portal_forge",
    biomeId: "forge",
    name: "Portal da Forja (Andar 6)",
    startFloor: 6,
    requiredCheckpoint: 5,
    minLevelRequired: DUNGEON_UNLOCK_LEVEL,
    description: "Desbloqueado ao vencer o Andar 5. Acessa os Andares 6–10 e recursos intermediários.",
  },
  {
    id: "portal_observatory",
    biomeId: "observatory",
    name: "Portal do Observatório (Andar 11)",
    startFloor: 11,
    requiredCheckpoint: 10,
    minLevelRequired: 10,
    description: "Exclusivo Nível 10+ após vencer o Andar 10. Libera os Andares 11–15 e cristais raros.",
  },
] as const;

export function getBiomeForFloor(floor: number): DungeonBiomeDefinition {
  const safeFloor = Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Math.floor(floor)));
  return (
    DUNGEON_BIOMES.find((b) => safeFloor >= b.minFloor && safeFloor <= b.maxFloor) ??
    DUNGEON_BIOMES[0]
  );
}

export interface DungeonMonsterDefinition {
  id: string;
  name: string;
  emoji: string;
  biomeId: DungeonBiomeId;
  isGuardian: boolean;
  lore: string;
  hitsRequired: number;
}

export const DUNGEON_MONSTERS: readonly DungeonMonsterDefinition[] = [
  // Bioma 1: Cripta de Pedra
  {
    id: "slime_silicio",
    name: "Geleia de Silício",
    emoji: "🟢",
    biomeId: "crypt",
    isGuardian: false,
    lore: "Criatura translúcida que se divide quando cálculos simples são ignorados.",
    hitsRequired: 3,
  },
  {
    id: "espectro_binario",
    name: "Espectro Binário",
    emoji: "👻",
    biomeId: "crypt",
    isGuardian: false,
    lore: "Sussurra sequências verdadeiras e falsas pelos corredores da cripta.",
    hitsRequired: 3,
  },
  {
    id: "sentinela_ardosia",
    name: "Sentinela de Ardósia",
    emoji: "🗿",
    biomeId: "crypt",
    isGuardian: false,
    lore: "Estátua animada que só recua diante de raciocínio rápido.",
    hitsRequired: 4,
  },
  {
    id: "boss_colosso_runico",
    name: "Colosso Rúnico",
    emoji: "👹",
    biomeId: "crypt",
    isGuardian: true,
    lore: "Guardião do 5º Andar. Protege o primeiro Portal de Checkpoint com runas antigas.",
    hitsRequired: 5,
  },
  // Bioma 2: Forja Subterrânea
  {
    id: "aranha_cobre",
    name: "Aranha de Cobre",
    emoji: "🕷️",
    biomeId: "forge",
    isGuardian: false,
    lore: "Constrói teias geométricas entre os tubos de vapor da forja.",
    hitsRequired: 3,
  },
  {
    id: "golem_brasa",
    name: "Golem de Brasa",
    emoji: "🔥",
    biomeId: "forge",
    isGuardian: false,
    lore: "Forjado no núcleo lógico, sua armadura esquenta a cada erro do explorador.",
    hitsRequired: 4,
  },
  {
    id: "pistao_voador",
    name: "Drone de Calibração",
    emoji: "🤖",
    biomeId: "forge",
    isGuardian: false,
    lore: "Patrulha as engrenagens exigindo precisão matemática para ser desligado.",
    hitsRequired: 4,
  },
  {
    id: "boss_automato_engrenagens",
    name: "Autômato de Engrenagens",
    emoji: "🦾",
    biomeId: "forge",
    isGuardian: true,
    lore: "Guardião do 10º Andar. Mestre em sequências mecânicas e travas de engrenagens.",
    hitsRequired: 6,
  },
  // Bioma 3: Observatório Cristalino
  {
    id: "prisma_astral",
    name: "Prisma Astral",
    emoji: "🔮",
    biomeId: "observatory",
    isGuardian: false,
    lore: "Reflete expressões algébricas em múltiplas cores cristalinas.",
    hitsRequired: 4,
  },
  {
    id: "guarda_estelar",
    name: "Guarda Estelar",
    emoji: "👾",
    biomeId: "observatory",
    isGuardian: false,
    lore: "Entidade galáctica que testa porcentagens e lógica pura em alta velocidade.",
    hitsRequired: 4,
  },
  {
    id: "serpente_quantic",
    name: "Serpente Quântica",
    emoji: "🐉",
    biomeId: "observatory",
    isGuardian: false,
    lore: "Desliza entre pilares cristalinos exigindo reflexos e dedução impecáveis.",
    hitsRequired: 5,
  },
  {
    id: "boss_arquiteto_quantico",
    name: "Arquiteto Quântico",
    emoji: "👑",
    biomeId: "observatory",
    isGuardian: true,
    lore: "Guardião Supremo do 15º Andar. Domina o núcleo do Observatório Cristalino.",
    hitsRequired: 6,
  },
] as const;

export const DUNGEON_RARITY_BASE_BONUS: Record<CardRarity, number> = {
  comum: 5,
  incomum: 10,
  rara: 18,
  epica: 28,
  lendaria: 40,
};

export const DUNGEON_FOIL_BONUS_PERCENT = 3;

export interface DungeonCardSkillMeta {
  id: DungeonCardSkillId;
  name: string;
  emoji: string;
  shortDesc: string;
  badgeClass: string;
}

export const DUNGEON_CARD_SKILLS: Record<DungeonCardSkillId, DungeonCardSkillMeta> = {
  chronomancer: {
    id: "chronomancer",
    name: "Cronomante",
    emoji: "⏳",
    shortDesc: "Adiciona segundos extras no tempo de combate e desafios.",
    badgeClass: "border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  },
  aegis: {
    id: "aegis",
    name: "Égide Lógica",
    emoji: "🛡️",
    shortDesc: "Concede escudo contra o primeiro erro do andar e reduz dano.",
    badgeClass: "border-blue-500/50 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  regeneration: {
    id: "regeneration",
    name: "Regeneração Arcana",
    emoji: "💚",
    shortDesc: "Recupera HP ao vencer combates ou puzzles sem errar.",
    badgeClass: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  miner: {
    id: "miner",
    name: "Fortuna do Minerador",
    emoji: "⛏️",
    shortDesc: "Aumenta a chance de coletar recursos extras dos biomas.",
    badgeClass: "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  explorer: {
    id: "explorer",
    name: "Olho do Explorador",
    emoji: "🔮",
    shortDesc: "Revela ícones na barra do andar e atrai fontes/eventos raros.",
    badgeClass: "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  critical: {
    id: "critical",
    name: "Golpe Crítico",
    emoji: "⚡",
    shortDesc: "Chance de causar dano duplo em combates lógicos.",
    badgeClass: "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  economy: {
    id: "economy",
    name: "Ímã de Tesouros",
    emoji: "🧲",
    shortDesc: "Multiplica as moedas e XP coletados dentro da expedição.",
    badgeClass: "border-yellow-500/50 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  },
  pocket: {
    id: "pocket",
    name: "Bolso Dimensional",
    emoji: "🎒",
    shortDesc: "Protege uma fração maior da mochila temporária em caso de derrota.",
    badgeClass: "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
};

export const DUNGEON_CARD_SKILL_LIST: readonly DungeonCardSkillMeta[] = Object.values(
  DUNGEON_CARD_SKILLS,
);

export type DungeonCraftCategory = "pack" | "chest" | "coins";

export interface DungeonCraftRecipe {
  id: string;
  name: string;
  description: string;
  category: DungeonCraftCategory;
  targetId: string;
  quantity: number;
  cost: Partial<Record<DungeonResourceId, number>>;
  emoji: string;
  accentClass: string;
}

export const DUNGEON_CRAFT_RECIPES: readonly DungeonCraftRecipe[] = [
  {
    id: "craft_pack_basico",
    name: "Pacote Básico",
    description: "Combina papiros e poeira da Cripta para forjar 1 Pacote Básico fechado.",
    category: "pack",
    targetId: "pack_basico",
    quantity: 1,
    cost: { paper_fragment: 4, arcane_dust: 2 },
    emoji: "🃏",
    accentClass: "border-slate-400/50",
  },
  {
    id: "craft_pack_iniciante",
    name: "Pacote Iniciante",
    description: "Forja 1 Pacote Iniciante com chances ampliadas de cartas Incomuns.",
    category: "pack",
    targetId: "pack_iniciante",
    quantity: 1,
    cost: { paper_fragment: 5, arcane_dust: 4, bronze_token: 2 },
    emoji: "💚",
    accentClass: "border-emerald-500/50",
  },
  {
    id: "craft_pack_explorador",
    name: "Pacote Explorador",
    description: "Usa recursos da Forja Subterrânea para criar 1 Pacote Explorador (Raras).",
    category: "pack",
    targetId: "pack_explorador",
    quantity: 1,
    cost: { logic_ore: 4, iron_gear: 3, grimoire_page: 2 },
    emoji: "💛",
    accentClass: "border-amber-500/50",
  },
  {
    id: "craft_pack_mestre",
    name: "Pacote Mestre",
    description: "Alquimia avançada para obter 1 Pacote Mestre focado em cartas Épicas.",
    category: "pack",
    targetId: "pack_mestre",
    quantity: 1,
    cost: { logic_ore: 5, grimoire_page: 4, quantum_crystal: 2 },
    emoji: "💜",
    accentClass: "border-purple-500/50",
  },
  {
    id: "craft_pack_supremo",
    name: "Pacote Supremo",
    description: "Síntese estelar suprema para forjar 1 Pacote Supremo com foco em Lendárias.",
    category: "pack",
    targetId: "pack_supremo",
    quantity: 1,
    cost: { quantum_crystal: 4, star_essence: 3, guardian_sigil: 1 },
    emoji: "🔥",
    accentClass: "border-red-500/50",
  },
  {
    id: "craft_chest_common",
    name: "Baú Semanal Comum",
    description: "Monta 1 Baú Semanal Comum direto na mochila da plataforma.",
    category: "chest",
    targetId: "weekly_common",
    quantity: 1,
    cost: { arcane_dust: 3, bronze_token: 3 },
    emoji: "🧰",
    accentClass: "border-sky-500/50",
  },
  {
    id: "craft_chest_quantum",
    name: "Baú de Lógica Quântica",
    description: "Forja 1 Baú Raro de Lógica Quântica com materiais da Forja.",
    category: "chest",
    targetId: "quantum_logic",
    quantity: 1,
    cost: { logic_ore: 4, iron_gear: 4, guardian_sigil: 1 },
    emoji: "💎",
    accentClass: "border-cyan-500/50",
  },
  {
    id: "craft_chest_epic",
    name: "Grande Baú Semanal",
    description: "Funde cristais e selos de guardiões em 1 Grande Baú Épico.",
    category: "chest",
    targetId: "weekly_epic",
    quantity: 1,
    cost: { quantum_crystal: 3, star_essence: 2, guardian_sigil: 1 },
    emoji: "👑",
    accentClass: "border-fuchsia-500/50",
  },
  {
    id: "craft_coins_crypt",
    name: "Fusão de Bronze (+40 Moedas)",
    description: "Converte recursos básicos da Cripta em 40 Moedas para a Loja.",
    category: "coins",
    targetId: "coins",
    quantity: 40,
    cost: { bronze_token: 3, paper_fragment: 2 },
    emoji: "🪙",
    accentClass: "border-amber-400/50",
  },
  {
    id: "craft_coins_forge",
    name: "Lingote Lógico (+120 Moedas)",
    description: "Refina minérios e engrenagens da Forja em 120 Moedas.",
    category: "coins",
    targetId: "coins",
    quantity: 120,
    cost: { logic_ore: 3, iron_gear: 3 },
    emoji: "💰",
    accentClass: "border-yellow-500/50",
  },
] as const;

/**
 * Cartas de exemplo usadas exclusivamente como fallback quando o catálogo do ADM
 * ainda possui menos de 3 cartas cadastradas.
 */
export const DUNGEON_FALLBACK_TEST_CARDS: readonly CardDefinition[] = [
  {
    id: "dungeon_sample_turing",
    name: "Alan Turing",
    description: "Decifrador de códigos que amplia o tempo de análise lógica.",
    rarity: "rara",
    imageUrl: "/favicon.png",
    imageFit: "contain-blur",
    colorVariant: 1,
    isFoil: false,
    dungeonSkillId: "chronomancer",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "dungeon_sample_curie",
    name: "Marie Curie",
    description: "Cientista radiante que regenera energia ao concluir salas sem erros.",
    rarity: "epica",
    imageUrl: "/favicon.png",
    imageFit: "contain-blur",
    colorVariant: 2,
    isFoil: true,
    dungeonSkillId: "regeneration",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "dungeon_sample_newton",
    name: "Isaac Newton",
    description: "Mestre das leis físicas que localiza minérios e recursos extras.",
    rarity: "incomum",
    imageUrl: "/favicon.png",
    imageFit: "contain-blur",
    colorVariant: 1,
    isFoil: false,
    dungeonSkillId: "miner",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "dungeon_sample_lovelace",
    name: "Ada Lovelace",
    description: "Pioneira dos algoritmos que protege o explorador contra falhas.",
    rarity: "lendaria",
    imageUrl: "/favicon.png",
    imageFit: "contain-blur",
    colorVariant: 1,
    isFoil: true,
    dungeonSkillId: "aegis",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "dungeon_sample_galileu",
    name: "Galileu Galilei",
    description: "Observador incansável que atrai moedas e protege a mochila.",
    rarity: "comum",
    imageUrl: "/favicon.png",
    imageFit: "contain-blur",
    colorVariant: 1,
    isFoil: false,
    dungeonSkillId: "economy",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  },
] as const;
