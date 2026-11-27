// Motor lógico da Masmorra (Expedição Lógica) — 100% browser-safe e testável via node:test

import type { CardDefinition, DungeonCardSkillId } from "./cards-catalog.ts";
import {
  DUNGEON_BASE_HP,
  DUNGEON_BASE_SAFE_RETENTION,
  DUNGEON_CARD_SKILLS,
  DUNGEON_CRAFT_RECIPES,
  DUNGEON_FOIL_BONUS_PERCENT,
  DUNGEON_FULL_RECHARGE_DISTINCT_GAMES,
  DUNGEON_FULL_RECHARGE_MATCHES,
  DUNGEON_MATCHES_PER_STAMINA,
  DUNGEON_MAX_FLOOR,
  DUNGEON_MAX_STAMINA,
  DUNGEON_MID_TIER_MAX_FLOOR,
  DUNGEON_MONSTERS,
  DUNGEON_PORTALS,
  DUNGEON_RARITY_BASE_BONUS,
  DUNGEON_REQUIRED_CARDS,
  DUNGEON_RESOURCES,
  DUNGEON_RESOURCE_IDS,
  DUNGEON_UNLOCK_LEVEL,
  getBiomeForFloor,
  type DungeonCraftRecipe,
  type DungeonResourceId,
} from "./dungeon-config.ts";
import type { GameId } from "./game-storage.ts";
import { getLocalDateKey } from "./player-profile.ts";

export type DungeonResourceInventory = Partial<Record<DungeonResourceId, number>>;

export interface DungeonStaminaState {
  current: number;
  max: number;
  matchesSinceLastPoint: number;
  crossGameCycle: {
    dateKey: string;
    totalMatches: number;
    distinctGamesPlayed: GameId[];
  };
}

export interface DungeonProgressionState {
  highestFloorReached: number;
  unlockedCheckpoints: number[];
  totalFloorsCleared: number;
  flawlessFloorsCleared: number;
  bossesDefeated: number[];
}

export interface DungeonLoadoutState {
  equippedCardIds: string[];
}

export type DungeonEncounterKind =
  | "combat"
  | "puzzle"
  | "question"
  | "interaction"
  | "fork"
  | "shrine"
  | "guardian";

export interface DungeonFloorEncounter {
  id: string;
  index: number;
  kind: DungeonEncounterKind;
  subType: string;
  title: string;
  narrativeIntro: string;
  monsterId?: string;
  completed: boolean;
  flawless?: boolean;
  lootMultiplier?: number;
}

export interface DungeonActiveRun {
  active: boolean;
  currentFloor: number;
  hp: number;
  maxHp: number;
  shieldsRemaining: number;
  floorProgressIndex: number;
  encounters: DungeonFloorEncounter[];
  narrativeLog: string[];
  tempBackpack: DungeonResourceInventory;
  tempCoins: number;
  tempXp: number;
  equippedCardIds: string[];
  pendingLootMultiplier?: number;
  floorErrors?: number;
}

export interface PlayerDungeonState {
  stamina: DungeonStaminaState;
  progression: DungeonProgressionState;
  loadout: DungeonLoadoutState;
  permanentResources: DungeonResourceInventory;
  currentRun: DungeonActiveRun | null;
  updatedAt?: string;
  /** Timestamp oficial calibrado no servidor (ms) para resolver conflitos sem depender do relógio local */
  updatedAtServerMs?: number;
}

/* ------------------------------ RNG Helpers ------------------------------ */

function rngInt(rng: () => number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function rngPick<T>(rng: () => number, list: readonly T[]): T {
  const idx = Math.floor(rng() * list.length) % list.length;
  return list[Math.max(0, idx)];
}

function shuffleArray<T>(rng: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ----------------------------- State Helpers ----------------------------- */

function sanitizeInventory(raw?: DungeonResourceInventory | null): DungeonResourceInventory {
  const out: DungeonResourceInventory = {};
  if (!raw || typeof raw !== "object") return out;
  for (const resId of DUNGEON_RESOURCE_IDS) {
    const qty = Math.max(0, Math.floor(Number(raw[resId]) || 0));
    if (qty > 0) out[resId] = qty;
  }
  return out;
}

export function addResourcesToInventory(
  base: DungeonResourceInventory,
  delta: DungeonResourceInventory,
): DungeonResourceInventory {
  const next = sanitizeInventory(base);
  for (const resId of DUNGEON_RESOURCE_IDS) {
    const add = Math.max(0, Math.floor(Number(delta[resId]) || 0));
    if (add > 0) {
      next[resId] = (next[resId] ?? 0) + add;
    }
  }
  return next;
}

export function createDefaultDungeonState(
  todayKey = getLocalDateKey(),
): PlayerDungeonState {
  return {
    stamina: {
      current: DUNGEON_MAX_STAMINA,
      max: DUNGEON_MAX_STAMINA,
      matchesSinceLastPoint: 0,
      crossGameCycle: {
        dateKey: todayKey,
        totalMatches: 0,
        distinctGamesPlayed: [],
      },
    },
    progression: {
      highestFloorReached: 0,
      unlockedCheckpoints: [1],
      totalFloorsCleared: 0,
      flawlessFloorsCleared: 0,
      bossesDefeated: [],
    },
    loadout: {
      equippedCardIds: [],
    },
    permanentResources: {},
    currentRun: null,
  };
}

export function normalizeDungeonState(
  raw?: Partial<PlayerDungeonState> | null,
  todayKey = getLocalDateKey(),
): PlayerDungeonState {
  const base = createDefaultDungeonState(todayKey);
  if (!raw || typeof raw !== "object") return base;

  const rawStamina = raw.stamina;
  const maxStam = DUNGEON_MAX_STAMINA;
  const curStam =
    typeof rawStamina?.current === "number" && !Number.isNaN(rawStamina.current)
      ? Math.max(0, Math.min(maxStam, Math.floor(rawStamina.current)))
      : base.stamina.current;
  const matchesSinceLast = Math.max(
    0,
    Math.min(
      DUNGEON_MATCHES_PER_STAMINA - 1,
      Math.floor(Number(rawStamina?.matchesSinceLastPoint) || 0),
    ),
  );
  const rawCycle = rawStamina?.crossGameCycle;
  const cycleDate =
    typeof rawCycle?.dateKey === "string" && rawCycle.dateKey.trim()
      ? rawCycle.dateKey
      : todayKey;
  const distinctGames = Array.isArray(rawCycle?.distinctGamesPlayed)
    ? Array.from(new Set(rawCycle.distinctGamesPlayed))
    : [];

  const rawProg = raw.progression;
  const checkpoints = Array.from(
    new Set([
      1,
      ...(Array.isArray(rawProg?.unlockedCheckpoints)
        ? rawProg.unlockedCheckpoints
            .map((n) => Math.floor(Number(n)))
            .filter((n) => n === 1 || n === 5 || n === 10 || n === 15)
        : []),
    ]),
  ).sort((a, b) => a - b);

  const bosses = Array.from(
    new Set(
      Array.isArray(rawProg?.bossesDefeated)
        ? rawProg.bossesDefeated
            .map((n) => Math.floor(Number(n)))
            .filter((n) => n === 5 || n === 10 || n === 15)
        : [],
    ),
  ).sort((a, b) => a - b);

  const equippedIds = Array.isArray(raw.loadout?.equippedCardIds)
    ? Array.from(
        new Set(
          raw.loadout.equippedCardIds
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
        ),
      ).slice(0, DUNGEON_REQUIRED_CARDS)
    : [];

  let currentRun: DungeonActiveRun | null = null;
  if (raw.currentRun && raw.currentRun.active) {
    const r = raw.currentRun;
    const normalizedMaxHp = Math.max(50, Math.floor(Number(r.maxHp) || DUNGEON_BASE_HP));
    const parsedHp = Number(r.hp);
    const normalizedHp = Number.isFinite(parsedHp)
      ? Math.max(0, Math.min(normalizedMaxHp, Math.floor(parsedHp)))
      : DUNGEON_BASE_HP;
    // Run derrotada (hp <= 0) nunca ressuscita com 100 HP ao recarregar
    if (normalizedHp > 0) {
      currentRun = {
        active: true,
        currentFloor: Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Math.floor(Number(r.currentFloor) || 1))),
        maxHp: normalizedMaxHp,
        hp: normalizedHp,
        shieldsRemaining: Math.max(0, Math.floor(Number(r.shieldsRemaining) || 0)),
        floorProgressIndex: Math.max(0, Math.floor(Number(r.floorProgressIndex) || 0)),
        encounters: Array.isArray(r.encounters) ? r.encounters : [],
        narrativeLog: Array.isArray(r.narrativeLog) ? r.narrativeLog.slice(-40) : [],
        tempBackpack: sanitizeInventory(r.tempBackpack),
        tempCoins: Math.max(0, Math.floor(Number(r.tempCoins) || 0)),
        tempXp: Math.max(0, Math.floor(Number(r.tempXp) || 0)),
        equippedCardIds: Array.isArray(r.equippedCardIds) ? r.equippedCardIds.slice(0, 3) : equippedIds,
        pendingLootMultiplier:
          typeof r.pendingLootMultiplier === "number" && r.pendingLootMultiplier > 1
            ? r.pendingLootMultiplier
            : 1,
        floorErrors: Math.max(0, Math.floor(Number(r.floorErrors) || 0)),
      };
    }
  }

  return {
    stamina: {
      current: curStam,
      max: maxStam,
      matchesSinceLastPoint: matchesSinceLast,
      crossGameCycle: {
        dateKey: cycleDate,
        totalMatches: Math.max(0, Math.floor(Number(rawCycle?.totalMatches) || 0)),
        distinctGamesPlayed: distinctGames,
      },
    },
    progression: {
      highestFloorReached: Math.max(
        0,
        Math.min(DUNGEON_MAX_FLOOR, Math.floor(Number(rawProg?.highestFloorReached) || 0)),
      ),
      unlockedCheckpoints: checkpoints,
      totalFloorsCleared: Math.max(0, Math.floor(Number(rawProg?.totalFloorsCleared) || 0)),
      flawlessFloorsCleared: Math.max(0, Math.floor(Number(rawProg?.flawlessFloorsCleared) || 0)),
      bossesDefeated: bosses,
    },
    loadout: {
      equippedCardIds: equippedIds,
    },
    permanentResources: sanitizeInventory(raw.permanentResources),
    currentRun,
    updatedAt: raw.updatedAt,
    ...(typeof raw.updatedAtServerMs === "number" && Number.isFinite(raw.updatedAtServerMs)
      ? { updatedAtServerMs: raw.updatedAtServerMs }
      : {}),
  };
}

function getRunProgressRank(run: DungeonActiveRun | null): number {
  if (!run || !run.active) return -1;
  const completedCount = (run.encounters ?? []).filter((e) => e.completed).length;
  return run.currentFloor * 100 + Math.max(run.floorProgressIndex ?? 0, completedCount);
}

/**
 * Mescla estados local e da nuvem mantendo a progressão monotonicamente crescente
 * (maior andar, checkpoints, chefes derrotados) e protegendo contra clock skew de máquina local.
 */
export function mergeDungeonStates(
  local?: Partial<PlayerDungeonState> | null,
  cloud?: Partial<PlayerDungeonState> | null,
  localIsNewer = false,
  serverNowMs = Date.now(),
): PlayerDungeonState {
  if (!local && !cloud) return createDefaultDungeonState();
  if (!local) return normalizeDungeonState(cloud);
  if (!cloud) return normalizeDungeonState(local);

  const normLocal = normalizeDungeonState(local);
  const normCloud = normalizeDungeonState(cloud);

  const maxAllowedTs = serverNowMs + 5 * 60_000;
  const resolveReliableTs = (ds: PlayerDungeonState): number => {
    if (
      typeof ds.updatedAtServerMs === "number" &&
      Number.isFinite(ds.updatedAtServerMs) &&
      ds.updatedAtServerMs > 0
    ) {
      return Math.min(ds.updatedAtServerMs, maxAllowedTs);
    }
    const parsed = ds.updatedAt ? Date.parse(ds.updatedAt) : 0;
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(parsed, maxAllowedTs);
  };

  const localTs = resolveReliableTs(normLocal);
  const cloudTs = resolveReliableTs(normCloud);
  const bothHaveServerTs =
    typeof normLocal.updatedAtServerMs === "number" &&
    typeof normCloud.updatedAtServerMs === "number";
  const localWasFutureSkewed =
    typeof normLocal.updatedAtServerMs !== "number" &&
    Boolean(normLocal.updatedAt && Date.parse(normLocal.updatedAt) > maxAllowedTs);
  const cloudWasFutureSkewed =
    typeof normCloud.updatedAtServerMs !== "number" &&
    Boolean(normCloud.updatedAt && Date.parse(normCloud.updatedAt) > maxAllowedTs);

  const preferLocal =
    localWasFutureSkewed !== cloudWasFutureSkewed
      ? !localWasFutureSkewed
      : localTs > 0 && cloudTs > 0
        ? localTs >= cloudTs
        : localIsNewer;

  const primary = preferLocal ? normLocal : normCloud;
  const secondary = preferLocal ? normCloud : normLocal;

  // Se ambos possuem run ativa sem timestamps de servidor confiáveis ou com possível skew,
  // evita perder progresso de andar/encontro já concluído dentro da expedição.
  let chosenRun = primary.currentRun;
  if (normLocal.currentRun && normCloud.currentRun && !bothHaveServerTs) {
    const localRank = getRunProgressRank(normLocal.currentRun);
    const cloudRank = getRunProgressRank(normCloud.currentRun);
    if (localRank !== cloudRank) {
      chosenRun = localRank > cloudRank ? normLocal.currentRun : normCloud.currentRun;
    }
  }

  const checkpoints = Array.from(
    new Set([
      1,
      ...normLocal.progression.unlockedCheckpoints,
      ...normCloud.progression.unlockedCheckpoints,
    ]),
  ).sort((a, b) => a - b);

  const bosses = Array.from(
    new Set([
      ...normLocal.progression.bossesDefeated,
      ...normCloud.progression.bossesDefeated,
    ]),
  ).sort((a, b) => a - b);

  return {
    stamina: primary.stamina,
    progression: {
      highestFloorReached: Math.max(
        normLocal.progression.highestFloorReached,
        normCloud.progression.highestFloorReached,
      ),
      unlockedCheckpoints: checkpoints,
      totalFloorsCleared: Math.max(
        normLocal.progression.totalFloorsCleared,
        normCloud.progression.totalFloorsCleared,
      ),
      flawlessFloorsCleared: Math.max(
        normLocal.progression.flawlessFloorsCleared,
        normCloud.progression.flawlessFloorsCleared,
      ),
      bossesDefeated: bosses,
    },
    loadout:
      primary.loadout.equippedCardIds.length >= DUNGEON_REQUIRED_CARDS
        ? primary.loadout
        : secondary.loadout.equippedCardIds.length > 0
          ? secondary.loadout
          : primary.loadout,
    permanentResources: primary.permanentResources,
    currentRun: chosenRun,
    updatedAt: primary.updatedAt ?? secondary.updatedAt,
    ...(primary.updatedAtServerMs || secondary.updatedAtServerMs
      ? { updatedAtServerMs: primary.updatedAtServerMs ?? secondary.updatedAtServerMs }
      : {}),
  };
}

/* -------------------------- Level & Portal Locks ------------------------- */

export interface DungeonAccessInfo {
  unlocked: boolean;
  unlockLevel: number;
  maxAllowedFloor: number;
  reason: string;
}

export function getDungeonAccessForLevel(level: number): DungeonAccessInfo {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (safeLevel < DUNGEON_UNLOCK_LEVEL) {
    return {
      unlocked: false,
      unlockLevel: DUNGEON_UNLOCK_LEVEL,
      maxAllowedFloor: 0,
      reason: `A Masmorra é desbloqueada no Nível ${DUNGEON_UNLOCK_LEVEL} da plataforma.`,
    };
  }
  if (safeLevel < 10) {
    return {
      unlocked: true,
      unlockLevel: DUNGEON_UNLOCK_LEVEL,
      maxAllowedFloor: DUNGEON_MID_TIER_MAX_FLOOR,
      reason:
        "Níveis 5–9 acessam os Andares 1–10. Alcance o Nível 10 para explorar o Observatório Cristalino (11–15).",
    };
  }
  return {
    unlocked: true,
    unlockLevel: DUNGEON_UNLOCK_LEVEL,
    maxAllowedFloor: DUNGEON_MAX_FLOOR,
    reason: "Acesso irrestrito aos Andares 1–15 (limitado apenas pela Estamina).",
  };
}

export function canStartFromPortal(
  portalId: string,
  level: number,
  rawState?: Partial<PlayerDungeonState> | null,
): { ok: boolean; reason?: string; startFloor: number } {
  const portal = DUNGEON_PORTALS.find((p) => p.id === portalId);
  if (!portal) {
    return { ok: false, reason: "Portal desconhecido.", startFloor: 1 };
  }
  const state = normalizeDungeonState(rawState);
  const access = getDungeonAccessForLevel(level);
  if (!access.unlocked) {
    return { ok: false, reason: access.reason, startFloor: portal.startFloor };
  }
  if (
    level < portal.minLevelRequired ||
    portal.startFloor > access.maxAllowedFloor
  ) {
    return {
      ok: false,
      reason: `Exige Nível ${portal.minLevelRequired} na plataforma.`,
      startFloor: portal.startFloor,
    };
  }
  if (!state.progression.unlockedCheckpoints.includes(portal.requiredCheckpoint)) {
    return {
      ok: false,
      reason: `Derrote o Guardião do Andar ${portal.requiredCheckpoint} para liberar este Portal.`,
      startFloor: portal.startFloor,
    };
  }
  if (state.stamina.current < 1) {
    return {
      ok: false,
      reason: "Sem estamina (0/5). Conclua partidas em outros jogos para recarregar.",
      startFloor: portal.startFloor,
    };
  }
  return { ok: true, startFloor: portal.startFloor };
}

export function canAdvanceToFloor(
  nextFloor: number,
  level: number,
  rawState?: Partial<PlayerDungeonState> | null,
): { ok: boolean; reason?: string } {
  const state = normalizeDungeonState(rawState);
  const access = getDungeonAccessForLevel(level);
  if (!access.unlocked) {
    return { ok: false, reason: access.reason };
  }
  if (nextFloor < 1 || nextFloor > DUNGEON_MAX_FLOOR) {
    return { ok: false, reason: "Você concluiu o último andar da Masmorra!" };
  }
  if (nextFloor > access.maxAllowedFloor) {
    return {
      ok: false,
      reason: `Andar ${nextFloor} exige Nível 10 na plataforma! Extraia seus itens ou alcance o Nível 10.`,
    };
  }
  if (state.stamina.current < 1) {
    return {
      ok: false,
      reason:
        "Estamina esgotada (0/5)! Sua expedição foi pausada: jogue outros modos para ganhar estamina ou extraia agora.",
    };
  }
  return { ok: true };
}

/* ----------------------------- Stamina Engine ---------------------------- */

export function recordExternalMatchForDungeonStamina(
  rawState: Partial<PlayerDungeonState> | null | undefined,
  gameId: GameId,
  todayKey = getLocalDateKey(),
): {
  state: PlayerDungeonState;
  staminaGained: number;
  triggeredFullRecharge: boolean;
} {
  const state = normalizeDungeonState(rawState, todayKey);
  if (state.stamina.current >= state.stamina.max) {
    return { state, staminaGained: 0, triggeredFullRecharge: false };
  }

  if (state.stamina.crossGameCycle.dateKey !== todayKey) {
    state.stamina.crossGameCycle = {
      dateKey: todayKey,
      totalMatches: 0,
      distinctGamesPlayed: [],
    };
  }

  state.stamina.matchesSinceLastPoint += 1;
  state.stamina.crossGameCycle.totalMatches += 1;
  if (!state.stamina.crossGameCycle.distinctGamesPlayed.includes(gameId)) {
    state.stamina.crossGameCycle.distinctGamesPlayed.push(gameId);
  }

  const meetsFullRecharge =
    state.stamina.crossGameCycle.totalMatches >= DUNGEON_FULL_RECHARGE_MATCHES &&
    state.stamina.crossGameCycle.distinctGamesPlayed.length >=
      DUNGEON_FULL_RECHARGE_DISTINCT_GAMES;

  if (meetsFullRecharge) {
    const gained = state.stamina.max - state.stamina.current;
    state.stamina.current = state.stamina.max;
    state.stamina.matchesSinceLastPoint = 0;
    state.stamina.crossGameCycle = {
      dateKey: todayKey,
      totalMatches: 0,
      distinctGamesPlayed: [],
    };
    state.updatedAt = new Date().toISOString();
    return { state, staminaGained: gained, triggeredFullRecharge: true };
  }

  let gained = 0;
  while (
    state.stamina.matchesSinceLastPoint >= DUNGEON_MATCHES_PER_STAMINA &&
    state.stamina.current < state.stamina.max
  ) {
    state.stamina.matchesSinceLastPoint -= DUNGEON_MATCHES_PER_STAMINA;
    state.stamina.current += 1;
    gained += 1;
  }
  if (state.stamina.current >= state.stamina.max) {
    state.stamina.matchesSinceLastPoint = 0;
  }

  state.updatedAt = new Date().toISOString();
  return { state, staminaGained: gained, triggeredFullRecharge: false };
}

export function consumeDungeonFloorStamina(
  rawState?: Partial<PlayerDungeonState> | null,
): { ok: boolean; state: PlayerDungeonState; error?: string } {
  const state = normalizeDungeonState(rawState);
  if (state.stamina.current < 1) {
    return {
      ok: false,
      state,
      error: "Estamina esgotada (0/5). Conclua partidas em outros jogos para recarregar!",
    };
  }
  state.stamina.current -= 1;
  state.updatedAt = new Date().toISOString();
  return { ok: true, state };
}

/* ------------------------ Card Loadout & Bonuses ------------------------- */

const ALL_DUNGEON_SKILL_IDS: readonly DungeonCardSkillId[] = [
  "chronomancer",
  "aegis",
  "regeneration",
  "miner",
  "explorer",
  "critical",
  "economy",
  "pocket",
] as const;

export interface ResolvedCardDungeonBonus {
  cardId: string;
  cardName: string;
  rarity: CardDefinition["rarity"];
  isFoil: boolean;
  skillId: DungeonCardSkillId;
  skillName: string;
  skillEmoji: string;
  rarityBasePercent: number;
  foilBonusPercent: number;
  uniqueVariancePercent: number;
  totalPowerPercent: number;
  secondaryPerkLabel: string;
  bonusMaxHp: number;
  bonusExtraSeconds: number;
  bonusCritPercent: number;
  bonusLootPercent: number;
  effectSummary: string;
}

export interface AggregatedLoadoutBonuses {
  extraTimerSeconds: number;
  errorShieldsPerFloor: number;
  damageReductionPercent: number;
  flawlessHealPercent: number;
  extraLootChancePercent: number;
  rareEventChancePercent: number;
  revealProgressIcons: boolean;
  critChancePercent: number;
  coinsXpBonusPercent: number;
  extraSafeRetentionPercent: number;
  bonusMaxHp: number;
  cardBonuses: ResolvedCardDungeonBonus[];
}

export function resolveCardDungeonBonus(card: CardDefinition): ResolvedCardDungeonBonus {
  const h1 = fnv1aHash(`${card.id}|${card.name}`);
  const h2 = fnv1aHash(`${card.name}|${card.rarity}|v2`);
  const h3 = fnv1aHash(`${card.id}|perk`);

  const skillId: DungeonCardSkillId =
    card.dungeonSkillId && DUNGEON_CARD_SKILLS[card.dungeonSkillId]
      ? card.dungeonSkillId
      : ALL_DUNGEON_SKILL_IDS[h1 % ALL_DUNGEON_SKILL_IDS.length];

  const skillMeta = DUNGEON_CARD_SKILLS[skillId];
  const rarityBasePercent = DUNGEON_RARITY_BASE_BONUS[card.rarity] ?? 5;
  const foilBonusPercent = card.isFoil ? DUNGEON_FOIL_BONUS_PERCENT : 0;
  const uniqueVariancePercent = h2 % 5; // 0..4% exclusivo por carta
  const totalPowerPercent = rarityBasePercent + foilBonusPercent + uniqueVariancePercent;

  const perkSlot = h3 % 4;
  let bonusMaxHp = 0;
  let bonusExtraSeconds = 0;
  let bonusCritPercent = 0;
  let bonusLootPercent = 0;
  let secondaryPerkLabel = "";

  if (perkSlot === 0) {
    bonusMaxHp = 4 + (h2 % 4) * 2;
    secondaryPerkLabel = `+${bonusMaxHp} HP Máx.`;
  } else if (perkSlot === 1) {
    bonusExtraSeconds = 1 + (h2 % 2);
    secondaryPerkLabel = `+${bonusExtraSeconds}s extras`;
  } else if (perkSlot === 2) {
    bonusCritPercent = 3 + (h2 % 4);
    secondaryPerkLabel = `+${bonusCritPercent}% Crítico`;
  } else {
    bonusLootPercent = 4 + (h2 % 4);
    secondaryPerkLabel = `+${bonusLootPercent}% Coleta`;
  }

  let effectSummary = "";
  switch (skillId) {
    case "chronomancer":
      effectSummary = `+${Math.max(2, Math.round(totalPowerPercent / 4))}s no tempo de combate`;
      break;
    case "aegis":
      effectSummary = `${totalPowerPercent >= 32 ? 2 : 1} escudo(s)/andar e -${Math.round(totalPowerPercent * 0.65)}% dano`;
      break;
    case "regeneration":
      effectSummary = `Cura ${Math.max(4, Math.round(totalPowerPercent * 0.55))}% HP em sala perfeita`;
      break;
    case "miner":
      effectSummary = `+${totalPowerPercent}% chance de recurso extra`;
      break;
    case "explorer":
      effectSummary = `Revela barra do andar e +${totalPowerPercent}% eventos raros`;
      break;
    case "critical":
      effectSummary = `+${Math.min(75, Math.round(totalPowerPercent * 1.15))}% chance de Golpe Crítico`;
      break;
    case "economy":
      effectSummary = `+${totalPowerPercent}% Moedas e XP na expedição`;
      break;
    case "pocket":
      effectSummary = `Protege +${Math.min(60, Math.round(totalPowerPercent * 1.1))}% da mochila na derrota`;
      break;
  }

  return {
    cardId: card.id,
    cardName: card.name,
    rarity: card.rarity,
    isFoil: Boolean(card.isFoil),
    skillId,
    skillName: skillMeta.name,
    skillEmoji: skillMeta.emoji,
    rarityBasePercent,
    foilBonusPercent,
    uniqueVariancePercent,
    totalPowerPercent,
    secondaryPerkLabel,
    bonusMaxHp,
    bonusExtraSeconds,
    bonusCritPercent,
    bonusLootPercent,
    effectSummary: `${effectSummary} (${secondaryPerkLabel})`,
  };
}

export function validateDungeonLoadout(
  cardIds: readonly string[],
  ownedCardsMap: Record<string, number> | undefined,
  catalog: readonly CardDefinition[],
): { valid: boolean; error?: string; cards: CardDefinition[] } {
  const uniqueIds = Array.from(
    new Set(cardIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)),
  );
  if (uniqueIds.length !== DUNGEON_REQUIRED_CARDS) {
    return {
      valid: false,
      error: `Selecione exatamente ${DUNGEON_REQUIRED_CARDS} cartas distintas para equipar no Deck de Expedição.`,
      cards: [],
    };
  }
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const resolved: CardDefinition[] = [];
  for (const id of uniqueIds) {
    const def = byId.get(id);
    if (!def) {
      return { valid: false, error: "Uma das cartas selecionadas não existe mais no catálogo.", cards: [] };
    }
    const qty = Math.max(0, Math.floor(Number(ownedCardsMap?.[id]) || 0));
    if (qty < 1) {
      return {
        valid: false,
        error: `Você ainda não possui a carta "${def.name}" na coleção.`,
        cards: [],
      };
    }
    resolved.push(def);
  }
  return { valid: true, cards: resolved };
}

/**
 * Resolve estritamente as cartas travadas na run ativa (`run.equippedCardIds`),
 * exigindo posse real na coleção do jogador e sem jamais recorrer a cartas gratuitas.
 */
export function resolveActiveRunCards(
  run: DungeonActiveRun | null | undefined,
  ownedCardsMap: Record<string, number> | undefined,
  catalog: readonly CardDefinition[],
): { valid: boolean; error?: string; cards: CardDefinition[] } {
  if (!run || !Array.isArray(run.equippedCardIds) || run.equippedCardIds.length !== DUNGEON_REQUIRED_CARDS) {
    return {
      valid: false,
      error: `Esta expedição não possui ${DUNGEON_REQUIRED_CARDS} cartas válidas travadas no deck.`,
      cards: [],
    };
  }
  return validateDungeonLoadout(run.equippedCardIds, ownedCardsMap, catalog);
}

export function aggregateDungeonLoadout(
  cards: readonly CardDefinition[],
): AggregatedLoadoutBonuses {
  const cardBonuses = cards.map(resolveCardDungeonBonus);
  let extraTimerSeconds = 0;
  let errorShieldsPerFloor = 0;
  let damageReductionPercent = 0;
  let flawlessHealPercent = 0;
  let extraLootChancePercent = 0;
  let rareEventChancePercent = 0;
  let revealProgressIcons = false;
  let critChancePercent = 0;
  let coinsXpBonusPercent = 0;
  let extraSafeRetentionPercent = 0;
  let bonusMaxHp = 0;

  for (const b of cardBonuses) {
    bonusMaxHp += b.bonusMaxHp;
    extraTimerSeconds += b.bonusExtraSeconds;
    critChancePercent += b.bonusCritPercent;
    extraLootChancePercent += b.bonusLootPercent;

    switch (b.skillId) {
      case "chronomancer":
        extraTimerSeconds += Math.max(2, Math.round(b.totalPowerPercent / 4));
        break;
      case "aegis":
        errorShieldsPerFloor += b.totalPowerPercent >= 32 ? 2 : 1;
        damageReductionPercent += Math.round(b.totalPowerPercent * 0.65);
        break;
      case "regeneration":
        flawlessHealPercent += Math.max(4, Math.round(b.totalPowerPercent * 0.55));
        break;
      case "miner":
        extraLootChancePercent += b.totalPowerPercent;
        break;
      case "explorer":
        revealProgressIcons = true;
        rareEventChancePercent += b.totalPowerPercent;
        break;
      case "critical":
        critChancePercent += Math.round(b.totalPowerPercent * 1.15);
        break;
      case "economy":
        coinsXpBonusPercent += b.totalPowerPercent;
        break;
      case "pocket":
        extraSafeRetentionPercent += Math.round(b.totalPowerPercent * 1.1);
        break;
    }
  }

  return {
    extraTimerSeconds,
    errorShieldsPerFloor,
    damageReductionPercent: Math.min(60, damageReductionPercent),
    flawlessHealPercent: Math.min(50, flawlessHealPercent),
    extraLootChancePercent,
    rareEventChancePercent,
    revealProgressIcons,
    critChancePercent: Math.min(75, critChancePercent),
    coinsXpBonusPercent,
    extraSafeRetentionPercent: Math.min(60, extraSafeRetentionPercent),
    bonusMaxHp,
    cardBonuses,
  };
}

/* --------------------- Procedural Floor Encounter Deck ------------------- */

const QUESTION_NARRATIVES: readonly string[] = [
  "Você avistou inscrições matemáticas brilhando na parede de pedra.",
  "Um painel rúnico bloqueia o corredor e pede uma resposta rápida.",
  "Você encontrou um pergaminho antigo caído próximo a uma tocha.",
  "Símbolos luminosos piscam no piso indicando uma passagem lógica.",
  "Uma fechadura aritmética estala ao detectar seus passos.",
  "Runas suspensas no ar formam um desafio antes da próxima curva.",
];

const PUZZLE_NARRATIVES: readonly string[] = [
  "Você entrou em uma câmara silenciosa com um mecanismo complexo no centro.",
  "Um altar antigo exibe um enigma estruturado esperando para ser decifrado.",
  "Portões duplos de ferro exigem raciocínio profundo para abrir.",
];

const INTERACTION_INTROS: Record<string, { title: string; intro: string }> = {
  fit_key: {
    title: "Encaixar Chave Rúnica",
    intro: "Você encontrou uma porta trancada com pinos desalinhados — encaixe a chave certa!",
  },
  align_notes: {
    title: "Alinhar Notas & Frequência",
    intro: "Um diapasão arcano ecoa notas fora de ordem — alinhe a sequência crescente!",
  },
  gear_calibration: {
    title: "Calibrar Engrenagens",
    intro: "O mecanismo da ponte travou — selecione a engrenagem compatível para ativá-lo!",
  },
  trap_tiles: {
    title: "Desarmar Ladrilhos",
    intro: "Você avistou placas de pressão no corredor! Memorize as armadilhas e pise nos ladrilhos seguros.",
  },
  clean_crystal: {
    title: "Limpar Poeira do Cristal",
    intro: "Há um veio mineral brilhando sob a poeira — limpe os pontos para extrair o recurso!",
  },
};

export function generateFloorEncounters(
  floor: number,
  rng: () => number = Math.random,
  bonuses?: AggregatedLoadoutBonuses,
): DungeonFloorEncounter[] {
  const safeFloor = Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Math.floor(floor)));
  const biome = getBiomeForFloor(safeFloor);
  const isGuardianFloor = safeFloor % 5 === 0;

  const regularMonsters = DUNGEON_MONSTERS.filter(
    (m) => m.biomeId === biome.id && !m.isGuardian,
  );
  const guardianMonster = DUNGEON_MONSTERS.find(
    (m) => m.biomeId === biome.id && m.isGuardian,
  );

  // Regras acordadas: 1-3 combates, 1-2 puzzles, 2-6 questões, 2-3 microinterações
  const combatCount = rngInt(rng, 1, 3);
  const puzzleCount = rngInt(rng, 1, 2);
  const questionCount = rngInt(rng, 2, 6);
  const interactionCount = rngInt(rng, 2, 3);

  const pool: Array<Omit<DungeonFloorEncounter, "index">> = [];

  for (let i = 0; i < combatCount; i++) {
    const monster = rngPick(rng, regularMonsters);
    pool.push({
      id: `enc_f${safeFloor}_c_${i}_${Math.floor(rng() * 10000)}`,
      kind: "combat",
      subType: "logic_duel",
      title: `Combate: ${monster.name}`,
      narrativeIntro: `${monster.emoji} Um ${monster.name} saltou das sombras bloqueando o caminho!`,
      monsterId: monster.id,
      completed: false,
    });
  }

  const puzzleTypes = ["number_sequence", "logic_circuit", "magic_grid"] as const;
  for (let i = 0; i < puzzleCount; i++) {
    const pType = puzzleTypes[(i + rngInt(rng, 0, 2)) % puzzleTypes.length];
    const pTitle =
      pType === "number_sequence"
        ? "Enigma: Sequência Oculta"
        : pType === "logic_circuit"
          ? "Enigma: Circuito Booleano"
          : "Enigma: Matriz Mágica 3×3";
    pool.push({
      id: `enc_f${safeFloor}_p_${i}_${Math.floor(rng() * 10000)}`,
      kind: "puzzle",
      subType: pType,
      title: pTitle,
      narrativeIntro: rngPick(rng, PUZZLE_NARRATIVES),
      completed: false,
    });
  }

  const questionTypes = ["arithmetic", "comparison", "variable", "percent"] as const;
  for (let i = 0; i < questionCount; i++) {
    const qType = rngPick(rng, questionTypes);
    pool.push({
      id: `enc_f${safeFloor}_q_${i}_${Math.floor(rng() * 10000)}`,
      kind: "question",
      subType: qType,
      title: "Desafio do Corredor",
      narrativeIntro: rngPick(rng, QUESTION_NARRATIVES),
      completed: false,
    });
  }

  const interactionPool = shuffleArray(rng, [
    "fit_key",
    "align_notes",
    "gear_calibration",
    "trap_tiles",
    "clean_crystal",
  ]).slice(0, interactionCount);

  for (let i = 0; i < interactionPool.length; i++) {
    const subType = interactionPool[i];
    const meta = INTERACTION_INTROS[subType];
    pool.push({
      id: `enc_f${safeFloor}_i_${i}_${Math.floor(rng() * 10000)}`,
      kind: "interaction",
      subType,
      title: meta.title,
      narrativeIntro: meta.intro,
      completed: false,
    });
  }

  const ordered = shuffleArray(rng, pool);

  // Eventos opcionais roguelite (Bifurcação e Fonte de Restauração) em andares não-boss
  if (!isGuardianFloor && ordered.length >= 4) {
    const rareBoost = (bonuses?.rareEventChancePercent ?? 0) / 100;
    if (rng() < 0.55 + rareBoost * 0.4) {
      const forkIdx = Math.floor(ordered.length / 2);
      ordered.splice(forkIdx, 0, {
        id: `enc_f${safeFloor}_fork_${Math.floor(rng() * 10000)}`,
        kind: "fork",
        subType: "corridor_choice",
        title: "Bifurcação da Masmorra",
        narrativeIntro:
          "🚪 Você avista duas passagens: uma iluminada e segura, outra sombria com brilho de tesouro.",
        completed: false,
      });
    }
    if (safeFloor >= 2 && rng() < 0.4 + rareBoost * 0.5) {
      const shrineIdx = Math.max(2, ordered.length - 2);
      ordered.splice(shrineIdx, 0, {
        id: `enc_f${safeFloor}_shrine_${Math.floor(rng() * 10000)}`,
        kind: "shrine",
        subType: "healing_altar",
        title: "Fonte Lógica",
        narrativeIntro:
          "⛲ Uma fonte cristalina pulsa com energia restauradora! Resolva o selo para recuperar HP.",
        completed: false,
      });
    }
  }

  if (isGuardianFloor && guardianMonster) {
    ordered.push({
      id: `enc_f${safeFloor}_guardian`,
      kind: "guardian",
      subType: "biome_guardian",
      title: `Guardião: ${guardianMonster.name}`,
      narrativeIntro: `${guardianMonster.emoji} As portas da câmara final se abrem! ${guardianMonster.name} aguarda para proteger o Portal de Checkpoint!`,
      monsterId: guardianMonster.id,
      completed: false,
    });
  }

  return ordered.map((item, idx) => ({ ...item, index: idx }));
}

export function getFloorProgressStats(run: DungeonActiveRun | null): {
  completed: number;
  total: number;
  percent: number;
} {
  if (!run || !Array.isArray(run.encounters) || run.encounters.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  const total = run.encounters.length;
  const completed = run.encounters.filter((e) => e.completed).length;
  const percent = Math.min(100, Math.round((completed / total) * 100));
  return { completed, total, percent };
}

/* ------------------ Challenge Generators & Validators -------------------- */

export interface DungeonQuestionChallenge {
  prompt: string;
  options: string[];
  correctIndex: number;
  categoryLabel: string;
  isTrueFalse?: boolean;
}

function buildUniqueNumericOptions(
  correctValue: number,
  rng: () => number,
  suffix = "",
): { options: string[]; correctIndex: number } {
  const distractors = new Set<number>([correctValue]);
  const deltas = [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6, 8, 10];
  let guard = 0;
  while (distractors.size < 4 && guard < 40) {
    guard++;
    const delta = rngPick(rng, deltas);
    const candidate = correctValue + delta;
    if (candidate >= 0 && candidate !== correctValue) {
      distractors.add(candidate);
    }
  }
  while (distractors.size < 4) {
    distractors.add(correctValue + distractors.size + 1);
  }
  const raw = shuffleArray(rng, Array.from(distractors));
  const options = raw.map((v) => `${v}${suffix}`);
  const correctIndex = raw.indexOf(correctValue);
  return { options, correctIndex };
}

export function generateDungeonQuestion(
  floor: number,
  subType = "arithmetic",
  rng: () => number = Math.random,
): DungeonQuestionChallenge {
  const tier = floor <= 5 ? 1 : floor <= 10 ? 2 : 3;

  if (subType === "comparison") {
    const a = rngInt(rng, 2, 12 * tier);
    const b = rngInt(rng, 2, 12 * tier);
    const c = rngInt(rng, 2, 10 * tier);
    const ops = ["<", ">", "="] as const;
    const op = rngPick(rng, ops);
    const leftVal = op === "<" ? a < b : op === ">" ? a > b : a === b;
    if (tier === 1) {
      return {
        prompt: `Esta afirmação é verdadeira?  ${a} ${op} ${b}`,
        options: ["Verdadeiro (V)", "Falso (F)"],
        correctIndex: leftVal ? 0 : 1,
        categoryLabel: "Comparação Lógica",
        isTrueFalse: true,
      };
    }
    const conj = rng() < 0.5 ? "e" : "ou";
    const rightVal = a + b > c * 2;
    const result = conj === "e" ? leftVal && rightVal : leftVal || rightVal;
    return {
      prompt: `Avalie: (${a} ${op} ${b}) ${conj} (${a} + ${b} > ${c * 2})`,
      options: ["Verdadeiro (V)", "Falso (F)"],
      correctIndex: result ? 0 : 1,
      categoryLabel: "Lógica Booleana",
      isTrueFalse: true,
    };
  }

  if (subType === "variable") {
    const x = rngInt(rng, 2, 8 + tier * 4);
    const mult = tier >= 2 ? rngInt(rng, 2, 4) : 1;
    const add = rngInt(rng, 3, 10 * tier);
    const rhs = mult * x + add;
    const prompt =
      mult === 1
        ? `Qual o valor de x em:  x + ${add} = ${rhs}`
        : `Qual o valor de x em:  ${mult} × x + ${add} = ${rhs}`;
    const { options, correctIndex } = buildUniqueNumericOptions(x, rng);
    return {
      prompt,
      options,
      correctIndex,
      categoryLabel: "Caça às Variáveis",
    };
  }

  if (subType === "percent") {
    const percents = tier === 1 ? [10, 25, 50] : tier === 2 ? [10, 20, 25, 50, 75] : [15, 25, 30, 40, 75];
    const pct = rngPick(rng, percents);
    const base = rngInt(rng, 2, 10) * 20;
    const answer = Math.round((pct * base) / 100);
    const { options, correctIndex } = buildUniqueNumericOptions(answer, rng);
    return {
      prompt: `Calcule ${pct}% de ${base}:`,
      options,
      correctIndex,
      categoryLabel: "Porcentagem",
    };
  }

  // Default: arithmetic
  const opChoice = rngInt(rng, 0, tier === 1 ? 2 : 3);
  let prompt = "";
  let answer = 0;
  if (opChoice === 0) {
    const a = rngInt(rng, 6 * tier, 18 * tier);
    const b = rngInt(rng, 4 * tier, 15 * tier);
    answer = a + b;
    prompt = `Quanto é ${a} + ${b}?`;
  } else if (opChoice === 1) {
    const b = rngInt(rng, 3 * tier, 12 * tier);
    answer = rngInt(rng, 4, 15 * tier);
    const a = b + answer;
    prompt = `Quanto é ${a} − ${b}?`;
  } else if (opChoice === 2) {
    const a = rngInt(rng, 2, 6 + tier * 3);
    const b = rngInt(rng, 2, 8 + tier * 2);
    answer = a * b;
    prompt = `Quanto é ${a} × ${b}?`;
  } else {
    const divisor = rngInt(rng, 2, 9);
    answer = rngInt(rng, 3, 12 * tier);
    const dividend = divisor * answer;
    prompt = `Quanto é ${dividend} ÷ ${divisor}?`;
  }

  const { options, correctIndex } = buildUniqueNumericOptions(answer, rng);
  return {
    prompt,
    options,
    correctIndex,
    categoryLabel: "Cálculo Rápido",
  };
}

export type DungeonPuzzleChallenge =
  | {
      kind: "number_sequence";
      prompt: string;
      sequence: Array<number | null>;
      options: string[];
      correctIndex: number;
      hint: string;
    }
  | {
      kind: "logic_circuit";
      prompt: string;
      inputs: { A: boolean; B: boolean; C: boolean };
      gate1: "E" | "OU" | "XOR";
      gate2: "E" | "OU";
      options: ["Verdadeiro (V)", "Falso (F)"];
      correctIndex: 0 | 1;
      hint: string;
    }
  | {
      kind: "magic_grid";
      prompt: string;
      targetSum: number;
      cells: Array<number | null>; // 9 células (3x3), exatamente 1 null
      options: string[];
      correctIndex: number;
      hint: string;
    };

export function generateDungeonPuzzle(
  floor: number,
  subType = "number_sequence",
  rng: () => number = Math.random,
): DungeonPuzzleChallenge {
  const tier = floor <= 5 ? 1 : floor <= 10 ? 2 : 3;

  if (subType === "logic_circuit") {
    const A = rng() < 0.5;
    const B = rng() < 0.5;
    const C = rng() < 0.5;
    const gate1 = rngPick(rng, ["E", "OU", "XOR"] as const);
    const gate2 = rngPick(rng, ["E", "OU"] as const);

    const out1 = gate1 === "E" ? A && B : gate1 === "OU" ? A || B : A !== B;
    const finalOut = gate2 === "E" ? out1 && C : out1 || C;

    return {
      kind: "logic_circuit",
      prompt: "Calcule a saída final do circuito lógico:",
      inputs: { A, B, C },
      gate1,
      gate2,
      options: ["Verdadeiro (V)", "Falso (F)"],
      correctIndex: finalOut ? 0 : 1,
      hint: `Primeiro resolva (${A ? "V" : "F"} ${gate1} ${B ? "V" : "F"}), depois combine com C (${C ? "V" : "F"}) usando ${gate2}.`,
    };
  }

  if (subType === "magic_grid") {
    const targetSum = 12 + tier * 3 + rngInt(rng, 0, 6);
    const cells: Array<number | null> = [];
    for (let r = 0; r < 3; r++) {
      const n1 = rngInt(rng, 2, Math.floor(targetSum / 3));
      const n2 = rngInt(rng, 2, Math.floor((targetSum - n1) / 2));
      const n3 = targetSum - n1 - n2;
      cells.push(n1, n2, n3);
    }
    const missingIdx = rngInt(rng, 0, 8);
    const answer = cells[missingIdx] ?? 1;
    cells[missingIdx] = null;
    const { options, correctIndex } = buildUniqueNumericOptions(answer, rng);
    return {
      kind: "magic_grid",
      prompt: `Cada linha soma exatamente ${targetSum}. Descubra o número oculto (?):`,
      targetSum,
      cells,
      options,
      correctIndex,
      hint: `Some os dois números da mesma linha e subtraia de ${targetSum}.`,
    };
  }

  // number_sequence
  const start = rngInt(rng, 2, 10);
  const step = rngInt(rng, 2, 5 + tier * 2);
  const useIncreasingDiff = tier >= 2 && rng() < 0.5;
  const values: number[] = [start];
  for (let i = 1; i < 5; i++) {
    const prev = values[i - 1];
    values.push(useIncreasingDiff ? prev + step + (i - 1) * 2 : prev + step);
  }
  const answer = values[4];
  const sequence: Array<number | null> = [values[0], values[1], values[2], values[3], null];
  const { options, correctIndex } = buildUniqueNumericOptions(answer, rng);
  return {
    kind: "number_sequence",
    prompt: "Descubra o próximo número da sequência rúnica:",
    sequence,
    options,
    correctIndex,
    hint: useIncreasingDiff
      ? "Observe de quanto em quanto a diferença entre os números cresce."
      : `A diferença entre os números vizinhos é constante (+${step}).`,
  };
}

export type DungeonInteractionChallenge =
  | {
      kind: "fit_key";
      prompt: string;
      targetPins: number[];
      maxPinHeight: number;
    }
  | {
      kind: "align_notes";
      prompt: string;
      initialNotes: number[];
    }
  | {
      kind: "gear_calibration";
      prompt: string;
      ruleLabel: string;
      gearOptions: number[];
      correctIndex: number;
    }
  | {
      kind: "trap_tiles";
      prompt: string;
      gridSize: 9;
      trapIndices: number[];
      safePickGoal: 3;
    }
  | {
      kind: "clean_crystal";
      prompt: string;
      dustSpots: Array<{ id: string; x: number; y: number }>;
      rewardResourceId: DungeonResourceId;
    };

export function generateDungeonInteraction(
  floor: number,
  subType: string,
  rng: () => number = Math.random,
): DungeonInteractionChallenge {
  const biome = getBiomeForFloor(floor);

  if (subType === "fit_key") {
    const pinCount = floor <= 5 ? 3 : 4;
    const targetPins = Array.from({ length: pinCount }, () => rngInt(rng, 1, 4));
    return {
      kind: "fit_key",
      prompt: "Ajuste os pinos da chave até alinhar exatamente com o molde da fechadura:",
      targetPins,
      maxPinHeight: 4,
    };
  }

  if (subType === "align_notes") {
    const base = rngInt(rng, 2, 10);
    const step = rngInt(rng, 2, 5);
    const sorted = [base, base + step, base + step * 2, base + step * 3];
    let scrambled = shuffleArray(rng, sorted);
    if (scrambled.every((v, idx) => idx === 0 || scrambled[idx - 1] < v)) {
      scrambled = [sorted[2], sorted[0], sorted[3], sorted[1]];
    }
    return {
      kind: "align_notes",
      prompt: "Toque em duas notas para trocá-las até ficarem em ordem crescente:",
      initialNotes: scrambled,
    };
  }

  if (subType === "gear_calibration") {
    const divisor = rngPick(rng, [3, 4, 5, 6, 7]);
    const mult = rngInt(rng, 3, 7);
    const correctGear = divisor * mult;
    const distractors = new Set<number>([correctGear]);
    let guard = 0;
    while (distractors.size < 4 && guard < 40) {
      guard++;
      const candidate = correctGear + rngPick(rng, [-5, -3, -2, -1, 1, 2, 3, 5]);
      if (candidate > 5 && candidate % divisor !== 0) {
        distractors.add(candidate);
      }
    }
    while (distractors.size < 4) {
      distractors.add(correctGear + distractors.size);
    }
    const gearOptions = shuffleArray(rng, Array.from(distractors));
    return {
      kind: "gear_calibration",
      prompt: "Escolha a engrenagem com o número exato de dentes para girar o eixo:",
      ruleLabel: `Precisa ser múltiplo exato de ${divisor}`,
      gearOptions,
      correctIndex: gearOptions.indexOf(correctGear),
    };
  }

  if (subType === "trap_tiles") {
    const indices = shuffleArray(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const trapIndices = indices.slice(0, 3).sort((a, b) => a - b);
    return {
      kind: "trap_tiles",
      prompt: "Memorize as 3 armadilhas vermelhas e depois clique em 3 ladrilhos seguros!",
      gridSize: 9,
      trapIndices,
      safePickGoal: 3,
    };
  }

  // clean_crystal
  const dustSpots = [
    { id: "spot_1", x: rngInt(rng, 18, 36), y: rngInt(rng, 20, 38) },
    { id: "spot_2", x: rngInt(rng, 58, 80), y: rngInt(rng, 20, 40) },
    { id: "spot_3", x: rngInt(rng, 20, 40), y: rngInt(rng, 58, 80) },
    { id: "spot_4", x: rngInt(rng, 58, 80), y: rngInt(rng, 58, 80) },
  ];
  return {
    kind: "clean_crystal",
    prompt: "Limpe todos os pontos de poeira para extrair o mineral escondido!",
    dustSpots,
    rewardResourceId: rngPick(rng, biome.lootTable),
  };
}

export function validateFitKey(
  pins: readonly number[],
  targetPins: readonly number[],
): boolean {
  if (pins.length !== targetPins.length || pins.length === 0) return false;
  return pins.every((val, idx) => Math.floor(val) === Math.floor(targetPins[idx]));
}

export function validateAlignNotes(order: readonly number[]): boolean {
  if (order.length < 2) return false;
  for (let i = 1; i < order.length; i++) {
    if (order[i - 1] >= order[i]) return false;
  }
  return true;
}

export function validateTrapTiles(
  pickedIndices: readonly number[],
  trapIndices: readonly number[],
  safePickGoal = 3,
): boolean {
  const unique = Array.from(new Set(pickedIndices)).filter(
    (idx) => Number.isInteger(idx) && idx >= 0 && idx < 9,
  );
  if (unique.length < safePickGoal) return false;
  const traps = new Set(trapIndices);
  return unique.every((idx) => !traps.has(idx));
}

/* ------------------------ Run Lifecycle & Crafting ----------------------- */

export function rollEncounterLoot(args: {
  floor: number;
  kind: DungeonEncounterKind;
  bonusMultiplier?: number;
  bonuses?: AggregatedLoadoutBonuses;
  rng?: () => number;
}): { resources: DungeonResourceInventory; coins: number; xp: number } {
  const rng = args.rng ?? Math.random;
  const biome = getBiomeForFloor(args.floor);
  const mult = Math.max(1, args.bonusMultiplier ?? 1);
  const coinsXpMult = 1 + (args.bonuses?.coinsXpBonusPercent ?? 0) / 100;
  const extraDropChance = (args.bonuses?.extraLootChancePercent ?? 0) / 100;

  const baseCoins =
    args.kind === "guardian"
      ? 25 + args.floor * 2
      : args.kind === "combat" || args.kind === "puzzle"
        ? 8 + args.floor
        : 4 + Math.floor(args.floor / 2);
  const baseXp =
    args.kind === "guardian"
      ? 40 + args.floor * 3
      : args.kind === "combat" || args.kind === "puzzle"
        ? 12 + args.floor
        : 6 + Math.floor(args.floor / 2);

  const coins = Math.max(1, Math.round(baseCoins * mult * coinsXpMult));
  const xp = Math.max(1, Math.round(baseXp * mult * coinsXpMult));

  const resources: DungeonResourceInventory = {};
  const dropCount =
    args.kind === "guardian"
      ? 3
      : args.kind === "combat" || args.kind === "puzzle" || args.kind === "interaction"
        ? 1 + (rng() < 0.35 + extraDropChance ? 1 : 0)
        : rng() < 0.6 + extraDropChance
          ? 1
          : 0;

  for (let i = 0; i < dropCount * mult; i++) {
    // Escolhe recurso ponderado pela tabela do bioma
    const candidates = biome.lootTable;
    const totalWeight = candidates.reduce(
      (sum, id) => sum + (DUNGEON_RESOURCES[id]?.dropWeight ?? 10),
      0,
    );
    let roll = rng() * totalWeight;
    let picked: DungeonResourceId = candidates[0];
    for (const id of candidates) {
      roll -= DUNGEON_RESOURCES[id]?.dropWeight ?? 10;
      if (roll <= 0) {
        picked = id;
        break;
      }
    }
    resources[picked] = (resources[picked] ?? 0) + 1;
  }

  return { resources, coins, xp };
}

export function applyEncounterDamage(
  run: DungeonActiveRun,
  rawDamage: number,
  bonuses?: AggregatedLoadoutBonuses,
): { run: DungeonActiveRun; absorbedByShield: boolean; damageTaken: number } {
  const nextRun: DungeonActiveRun = {
    ...run,
    floorErrors: (run.floorErrors ?? 0) + 1,
  };
  if (nextRun.shieldsRemaining > 0) {
    nextRun.shieldsRemaining -= 1;
    return { run: nextRun, absorbedByShield: true, damageTaken: 0 };
  }
  const reduction = Math.min(0.6, (bonuses?.damageReductionPercent ?? 0) / 100);
  const damageTaken = Math.max(1, Math.round(rawDamage * (1 - reduction)));
  nextRun.hp = Math.max(0, nextRun.hp - damageTaken);
  return { run: nextRun, absorbedByShield: false, damageTaken };
}

export function startDungeonRun(args: {
  state?: Partial<PlayerDungeonState> | null;
  startFloor: number;
  level: number;
  equippedCards: readonly CardDefinition[];
  rng?: () => number;
}): { ok: boolean; state: PlayerDungeonState; error?: string } {
  const rng = args.rng ?? Math.random;
  let state = normalizeDungeonState(args.state);

  if (args.equippedCards.length !== DUNGEON_REQUIRED_CARDS) {
    return {
      ok: false,
      state,
      error: `É obrigatório equipar exatamente ${DUNGEON_REQUIRED_CARDS} cartas.`,
    };
  }

  const access = getDungeonAccessForLevel(args.level);
  if (!access.unlocked) {
    return { ok: false, state, error: access.reason };
  }
  const safeFloor = Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Math.floor(args.startFloor)));
  if (safeFloor > access.maxAllowedFloor) {
    return { ok: false, state, error: access.reason };
  }
  const matchingPortal = DUNGEON_PORTALS.find((p) => p.startFloor === safeFloor);
  if (
    safeFloor > 1 &&
    (!matchingPortal || !state.progression.unlockedCheckpoints.includes(matchingPortal.requiredCheckpoint))
  ) {
    return {
      ok: false,
      state,
      error: "Este Portal de Checkpoint ainda não foi desbloqueado.",
    };
  }

  const stamRes = consumeDungeonFloorStamina(state);
  if (!stamRes.ok) {
    return { ok: false, state, error: stamRes.error };
  }
  state = stamRes.state;

  const bonuses = aggregateDungeonLoadout(args.equippedCards);
  const maxHp = DUNGEON_BASE_HP + bonuses.bonusMaxHp;
  const encounters = generateFloorEncounters(safeFloor, rng, bonuses);
  const biome = getBiomeForFloor(safeFloor);

  state.loadout = {
    equippedCardIds: args.equippedCards.map((c) => c.id),
  };
  state.progression.highestFloorReached = Math.max(
    state.progression.highestFloorReached,
    safeFloor,
  );
  state.currentRun = {
    active: true,
    currentFloor: safeFloor,
    hp: maxHp,
    maxHp,
    shieldsRemaining: bonuses.errorShieldsPerFloor,
    floorProgressIndex: 0,
    encounters,
    narrativeLog: [
      `🗺️ Você atravessou o portal e entrou no Andar ${safeFloor} (${biome.name}).`,
    ],
    tempBackpack: {},
    tempCoins: 0,
    tempXp: 0,
    equippedCardIds: args.equippedCards.map((c) => c.id),
    pendingLootMultiplier: 1,
    floorErrors: 0,
  };
  state.updatedAt = new Date().toISOString();

  return { ok: true, state };
}

export function advanceToNextDungeonFloor(args: {
  state?: Partial<PlayerDungeonState> | null;
  level: number;
  equippedCards: readonly CardDefinition[];
  rng?: () => number;
}): { ok: boolean; state: PlayerDungeonState; error?: string } {
  const rng = args.rng ?? Math.random;
  let state = normalizeDungeonState(args.state);
  if (!state.currentRun || !state.currentRun.active) {
    return { ok: false, state, error: "Nenhuma expedição ativa para avançar." };
  }

  const nextFloor = state.currentRun.currentFloor + 1;
  const canAdv = canAdvanceToFloor(nextFloor, args.level, state);
  if (!canAdv.ok) {
    return { ok: false, state, error: canAdv.reason };
  }

  const stamRes = consumeDungeonFloorStamina(state);
  if (!stamRes.ok) {
    return { ok: false, state, error: stamRes.error };
  }
  state = stamRes.state;

  const bonuses = aggregateDungeonLoadout(args.equippedCards);
  const encounters = generateFloorEncounters(nextFloor, rng, bonuses);
  const biome = getBiomeForFloor(nextFloor);
  const maxHp = DUNGEON_BASE_HP + bonuses.bonusMaxHp;
  const restHeal = Math.max(5, Math.round(maxHp * 0.1));
  const prevRun = state.currentRun!;

  state.progression.highestFloorReached = Math.max(
    state.progression.highestFloorReached,
    nextFloor,
  );
  state.progression.totalFloorsCleared += 1;
  if ((prevRun.floorErrors ?? 0) === 0) {
    state.progression.flawlessFloorsCleared += 1;
  }

  state.currentRun = {
    ...prevRun,
    currentFloor: nextFloor,
    maxHp,
    hp: Math.min(maxHp, prevRun.hp + restHeal),
    shieldsRemaining: bonuses.errorShieldsPerFloor,
    floorProgressIndex: 0,
    encounters,
    narrativeLog: [
      ...prevRun.narrativeLog.slice(-15),
      `🪜 Você desceu para o Andar ${nextFloor} (${biome.name}) e recuperou +${restHeal} HP.`,
    ],
    pendingLootMultiplier: 1,
    floorErrors: 0,
  };
  state.updatedAt = new Date().toISOString();

  return { ok: true, state };
}

export function completeGuardianFloor(
  rawState: Partial<PlayerDungeonState> | null | undefined,
  floor: number,
): {
  state: PlayerDungeonState;
  unlockedCheckpoint: number;
  chestId: string;
  extractedResources: DungeonResourceInventory;
  coinsEarned: number;
  xpEarned: number;
} {
  const state = normalizeDungeonState(rawState);
  const biome = getBiomeForFloor(floor);
  const checkpoint = biome.guardianFloor;

  if (!state.progression.unlockedCheckpoints.includes(checkpoint)) {
    state.progression.unlockedCheckpoints = [
      ...state.progression.unlockedCheckpoints,
      checkpoint,
    ].sort((a, b) => a - b);
  }
  if (!state.progression.bossesDefeated.includes(checkpoint)) {
    state.progression.bossesDefeated = [
      ...state.progression.bossesDefeated,
      checkpoint,
    ].sort((a, b) => a - b);
  }
  state.progression.highestFloorReached = Math.max(
    state.progression.highestFloorReached,
    floor,
  );
  state.progression.totalFloorsCleared += 1;
  if ((state.currentRun?.floorErrors ?? 0) === 0) {
    state.progression.flawlessFloorsCleared += 1;
  }

  const runBackpack = addResourcesToInventory(
    state.currentRun?.tempBackpack ?? {},
    { guardian_sigil: 1 },
  );
  state.permanentResources = addResourcesToInventory(
    state.permanentResources,
    runBackpack,
  );

  const coinsEarned = state.currentRun?.tempCoins ?? 0;
  const xpEarned = state.currentRun?.tempXp ?? 0;
  state.currentRun = null;
  state.updatedAt = new Date().toISOString();

  return {
    state,
    unlockedCheckpoint: checkpoint,
    chestId: biome.guardianChestId,
    extractedResources: runBackpack,
    coinsEarned,
    xpEarned,
  };
}

export function extractDungeonRun(
  rawState?: Partial<PlayerDungeonState> | null,
): {
  state: PlayerDungeonState;
  extractedResources: DungeonResourceInventory;
  coinsEarned: number;
  xpEarned: number;
} {
  const state = normalizeDungeonState(rawState);
  const run = state.currentRun;
  if (!run) {
    return { state, extractedResources: {}, coinsEarned: 0, xpEarned: 0 };
  }

  const floorDone =
    run.encounters.length > 0 && run.encounters.every((e) => e.completed);
  if (floorDone) {
    state.progression.totalFloorsCleared += 1;
    if ((run.floorErrors ?? 0) === 0) {
      state.progression.flawlessFloorsCleared += 1;
    }
  }

  const extractedResources = sanitizeInventory(run.tempBackpack);
  state.permanentResources = addResourcesToInventory(
    state.permanentResources,
    extractedResources,
  );
  const coinsEarned = Math.max(0, run.tempCoins);
  const xpEarned = Math.max(0, run.tempXp);
  state.currentRun = null;
  state.updatedAt = new Date().toISOString();

  return { state, extractedResources, coinsEarned, xpEarned };
}

export function resolveDungeonDefeat(
  rawState: Partial<PlayerDungeonState> | null | undefined,
  equippedCards: readonly CardDefinition[],
): {
  state: PlayerDungeonState;
  retentionRate: number;
  keptResources: DungeonResourceInventory;
  lostResources: DungeonResourceInventory;
  keptCoins: number;
} {
  const state = normalizeDungeonState(rawState);
  const run = state.currentRun;
  const bonuses = aggregateDungeonLoadout(equippedCards);
  const retentionRate = Math.min(
    0.9,
    DUNGEON_BASE_SAFE_RETENTION + bonuses.extraSafeRetentionPercent / 100,
  );

  if (!run) {
    return {
      state,
      retentionRate,
      keptResources: {},
      lostResources: {},
      keptCoins: 0,
    };
  }

  const keptResources: DungeonResourceInventory = {};
  const lostResources: DungeonResourceInventory = {};

  for (const resId of DUNGEON_RESOURCE_IDS) {
    const total = Math.max(0, Math.floor(run.tempBackpack[resId] ?? 0));
    if (total <= 0) continue;
    const kept = Math.floor(total * retentionRate);
    const lost = total - kept;
    if (kept > 0) keptResources[resId] = kept;
    if (lost > 0) lostResources[resId] = lost;
  }

  state.permanentResources = addResourcesToInventory(
    state.permanentResources,
    keptResources,
  );
  const keptCoins = Math.floor((run.tempCoins ?? 0) * retentionRate);
  state.currentRun = null;
  state.updatedAt = new Date().toISOString();

  return {
    state,
    retentionRate,
    keptResources,
    lostResources,
    keptCoins,
  };
}

export function craftDungeonRecipe(
  rawState: Partial<PlayerDungeonState> | null | undefined,
  recipeId: string,
): {
  ok: boolean;
  state: PlayerDungeonState;
  recipe?: DungeonCraftRecipe;
  error?: string;
} {
  const state = normalizeDungeonState(rawState);
  const recipe = DUNGEON_CRAFT_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) {
    return { ok: false, state, error: "Receita de forja não encontrada." };
  }

  for (const [resId, reqQty] of Object.entries(recipe.cost) as Array<
    [DungeonResourceId, number]
  >) {
    const have = state.permanentResources[resId] ?? 0;
    if (have < reqQty) {
      const resName = DUNGEON_RESOURCES[resId]?.name ?? resId;
      return {
        ok: false,
        state,
        recipe,
        error: `Faltam recursos: precisa de ${reqQty}× ${resName} (você tem ${have}).`,
      };
    }
  }

  const nextResources = { ...state.permanentResources };
  for (const [resId, reqQty] of Object.entries(recipe.cost) as Array<
    [DungeonResourceId, number]
  >) {
    const rem = Math.max(0, (nextResources[resId] ?? 0) - reqQty);
    if (rem > 0) nextResources[resId] = rem;
    else delete nextResources[resId];
  }

  state.permanentResources = nextResources;
  state.updatedAt = new Date().toISOString();
  return { ok: true, state, recipe };
}
