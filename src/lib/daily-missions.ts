import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import type { AdminConfig } from "./game-codes.ts";
import type { GameStatRow, PlayerProfile } from "./playfab.ts";
import { getLocalDateKey } from "./player-profile.ts";
import { awardCareerPoints, awardCoins } from "./career-points.ts";
import { recordDailyMissionCompletedIntoWeekly } from "./weekly-missions.ts";

export const DEFAULT_DAILY_MISSION_COINS = 5;

export interface DailyMissionProgressState {
  dateKey: string;
  plays: number;
  wins: number;
  distinctGameIds: string[];
  flawlessCount: number;
  competitiveCount: number;
  playsByGame: Record<string, number>;
  claimedIds: string[];
}

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardPoints: number;
  rewardXp: number;
  rewardCoins?: number;
  isPersonalized: boolean;
  gameId?: GameId;
  claimed?: boolean;
}

export function createEmptyDailyMissionProgress(dateKey = getLocalDateKey()): DailyMissionProgressState {
  return {
    dateKey,
    plays: 0,
    wins: 0,
    distinctGameIds: [],
    flawlessCount: 0,
    competitiveCount: 0,
    playsByGame: {},
    claimedIds: [],
  };
}

/**
 * Atualiza o estado de progresso das missões diárias após o encerramento de uma partida.
 * Reseta automaticamente quando `dateKey` muda.
 */
export function recordMatchIntoDailyMissions(
  prev: DailyMissionProgressState | undefined | null,
  args: {
    gameId: GameId;
    won: boolean;
    flawless: boolean;
    mode?: string;
    dateKey?: string;
  },
): DailyMissionProgressState {
  const dateKey = args.dateKey ?? getLocalDateKey();
  const base =
    prev && prev.dateKey === dateKey
      ? {
          dateKey,
          plays: Math.max(0, prev.plays ?? 0),
          wins: Math.max(0, prev.wins ?? 0),
          distinctGameIds: Array.isArray(prev.distinctGameIds) ? [...prev.distinctGameIds] : [],
          flawlessCount: Math.max(0, prev.flawlessCount ?? 0),
          competitiveCount: Math.max(0, prev.competitiveCount ?? 0),
          playsByGame: { ...(prev.playsByGame ?? {}) },
          claimedIds: Array.isArray(prev.claimedIds) ? [...prev.claimedIds] : [],
        }
      : createEmptyDailyMissionProgress(dateKey);

  base.plays += 1;
  if (args.won) base.wins += 1;
  if (!base.distinctGameIds.includes(args.gameId)) {
    base.distinctGameIds.push(args.gameId);
  }
  if (args.flawless || args.mode === "torneio_semanal") {
    // No nível 4-6 a missão flawless aceita 0 erros OU 1 partida no Torneio;
    // para precisão em todos os níveis, mantemos flawlessCount quando flawless === true
  }
  if (args.flawless) {
    base.flawlessCount += 1;
  }
  if (args.mode === "x1_online" || (args.mode === "torneio_semanal" && args.won)) {
    base.competitiveCount += 1;
  }
  base.playsByGame[args.gameId] = (base.playsByGame[args.gameId] ?? 0) + 1;

  return base;
}

/**
 * Mescla dois estados de progresso diário (local vs nuvem PlayFab) mantendo o maior progresso
 * do dia mais recente sem perder missões já resgatadas.
 */
export function mergeDailyMissionProgress(
  a?: DailyMissionProgressState | null,
  b?: DailyMissionProgressState | null,
): DailyMissionProgressState | undefined {
  if (!a && !b) return undefined;
  if (!a) return b ?? undefined;
  if (!b) return a;
  if (a.dateKey !== b.dateKey) {
    return a.dateKey > b.dateKey ? a : b;
  }
  const playsByGame: Record<string, number> = { ...(a.playsByGame ?? {}) };
  for (const [gId, count] of Object.entries(b.playsByGame ?? {})) {
    playsByGame[gId] = Math.max(playsByGame[gId] ?? 0, count ?? 0);
  }
  return {
    dateKey: a.dateKey,
    plays: Math.max(a.plays ?? 0, b.plays ?? 0),
    wins: Math.max(a.wins ?? 0, b.wins ?? 0),
    distinctGameIds: Array.from(new Set([...(a.distinctGameIds ?? []), ...(b.distinctGameIds ?? [])])),
    flawlessCount: Math.max(a.flawlessCount ?? 0, b.flawlessCount ?? 0),
    competitiveCount: Math.max(a.competitiveCount ?? 0, b.competitiveCount ?? 0),
    playsByGame,
    claimedIds: Array.from(new Set([...(a.claimedIds ?? []), ...(b.claimedIds ?? [])])),
  };
}

/**
 * Retorna a quantidade de missões diárias conforme a faixa de nível do jogador:
 * - Nível 1 a 3: 4 missões (3 padrão + 1 personalizada)
 * - Nível 4 a 6: 5 missões (4 padrão + 1 personalizada)
 * - Nível 7 a 10: 6 missões (5 padrão + 1 personalizada)
 */
export function getDailyMissionsCountForLevel(level = 1): number {
  const safeLevel = Math.max(1, Math.floor(level));
  if (safeLevel <= 3) return 4;
  if (safeLevel <= 6) return 5;
  return 6;
}

function simpleSeedHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Seleciona o jogo elegível com o menor número de partidas jogadas pelo aluno.
 */
export function pickLeastPlayedGameForPlayer(args: {
  playerId: string;
  level: number;
  isAdmin?: boolean;
  stats?: GameStatRow[];
  adminConfig?: Partial<AdminConfig> | null;
  dateKey?: string;
}): { gameId: GameId; gameName: string; plays: number } {
  const dateKey = args.dateKey ?? getLocalDateKey();
  const enabledMap = args.adminConfig?.enabledGames;
  const adminOnlyMap = args.adminConfig?.adminOnlyGames;
  const minLevelsMap = args.adminConfig?.gameMinLevels;

  const eligibleGames = ALL_GAME_IDS.filter((gId) => {
    if (enabledMap && enabledMap[gId] === false) return false;
    if (!args.isAdmin && adminOnlyMap && adminOnlyMap[gId] === true) return false;
    const minLvl = minLevelsMap?.[gId] ?? 1;
    if (!args.isAdmin && args.level < minLvl) return false;
    return true;
  });

  const pool = eligibleGames.length > 0 ? eligibleGames : ALL_GAME_IDS;

  const playsByGame = new Map<GameId, number>();
  for (const gId of pool) {
    playsByGame.set(gId, 0);
  }
  for (const row of args.stats ?? []) {
    if (!row?.game_id || !playsByGame.has(row.game_id)) continue;
    playsByGame.set(row.game_id, (playsByGame.get(row.game_id) ?? 0) + Math.max(0, row.plays ?? 0));
  }

  let minPlays = Infinity;
  for (const count of playsByGame.values()) {
    if (count < minPlays) minPlays = count;
  }

  const tiedGames = pool.filter((gId) => (playsByGame.get(gId) ?? 0) === minPlays);
  const seed = simpleSeedHash(`${args.playerId}|${dateKey}`);
  const chosenId = tiedGames[seed % tiedGames.length] ?? pool[0];

  return {
    gameId: chosenId,
    gameName: GAME_NAMES[chosenId] ?? chosenId,
    plays: minPlays === Infinity ? 0 : minPlays,
  };
}

function formatDailyDescription(key: string, target: number, gameName?: string): string {
  switch (key) {
    case "plays":
      return `Jogue ${target} ${target === 1 ? "partida" : "partidas"} em qualquer jogo hoje.`;
    case "wins":
      return `Conquiste ${target} ${target === 1 ? "vitória" : "vitórias"} em qualquer desafio hoje.`;
    case "distinct":
      return `Jogue ${target} ${target === 1 ? "jogo diferente" : "jogos diferentes"} hoje.`;
    case "flawless":
      return `Conclua ${target} ${target === 1 ? "partida perfeita" : "partidas perfeitas"} (0 erros) hoje.`;
    case "competitive":
      return `Dispute ${target} ${target === 1 ? "duelo na Arena X1 ou vitória no Torneio Semanal" : "duelos na Arena X1 ou vitórias no Torneio Semanal"} hoje.`;
    case "personal":
      return `Jogue ${target} ${target === 1 ? "partida" : "partidas"} de ${gameName ?? "seu desafio pessoal"} hoje.`;
    default:
      return "";
  }
}

/**
 * Gera a lista de missões diárias para o jogador com progresso real e status de resgate.
 */
export function generateDailyMissions(args: {
  profile?: Partial<PlayerProfile> | null;
  stats?: GameStatRow[];
  adminConfig?: Partial<AdminConfig> | null;
  dateKey?: string;
}): DailyMission[] {
  const dateKey = args.dateKey ?? getLocalDateKey();
  const cfgAny = args.adminConfig as
    | {
        coinRewardsConfig?: { dailyMissionCoins?: number };
        weeklyRoutineConfig?: {
          dailyMissionOverrides?: Record<
            string,
            { target?: number; points?: number; xp?: number; coins?: number }
          >;
        };
      }
    | null
    | undefined;
  const dailyCoins = Math.max(
    0,
    Math.floor(cfgAny?.coinRewardsConfig?.dailyMissionCoins ?? DEFAULT_DAILY_MISSION_COINS),
  );
  const overrides = cfgAny?.weeklyRoutineConfig?.dailyMissionOverrides ?? {};
  const progress =
    args.profile?.dailyMissionProgress?.dateKey === dateKey
      ? args.profile.dailyMissionProgress
      : null;
  const claimedSet = new Set<string>(progress?.claimedIds ?? []);

  return buildDailyMissionsList({ ...args, dateKey }).map((m) => {
    const key = m.isPersonalized ? "personal" : m.id.split("_").pop() || "";
    const ov = overrides[key];
    const target = ov?.target && ov.target > 0 ? Math.floor(ov.target) : m.target;
    const rewardPoints = ov?.points !== undefined ? Math.max(0, Math.floor(ov.points)) : m.rewardPoints;
    const rewardXp = ov?.xp !== undefined ? Math.max(0, Math.floor(ov.xp)) : m.rewardXp;
    const rewardCoins = ov?.coins !== undefined ? Math.max(0, Math.floor(ov.coins)) : dailyCoins;

    let current = 0;
    if (progress) {
      if (key === "plays") current = progress.plays ?? 0;
      else if (key === "wins") current = progress.wins ?? 0;
      else if (key === "distinct") current = progress.distinctGameIds?.length ?? 0;
      else if (key === "flawless") current = progress.flawlessCount ?? 0;
      else if (key === "competitive") current = progress.competitiveCount ?? 0;
      else if (key === "personal" && m.gameId) current = progress.playsByGame?.[m.gameId] ?? 0;
    }

    const description =
      ov?.target && ov.target > 0
        ? formatDailyDescription(key, target, m.gameId ? GAME_NAMES[m.gameId] : undefined) || m.description
        : m.description;

    return {
      ...m,
      target,
      current: Math.min(target, Math.max(0, current)),
      description,
      rewardPoints,
      rewardXp,
      rewardCoins,
      claimed: claimedSet.has(m.id),
    };
  });
}

export interface ClaimMissionResult {
  ok: boolean;
  alreadyClaimed?: boolean;
  error?: string;
  missionId: string;
  pointsAwarded: number;
  xpAwarded: number;
  coinsAwarded: number;
}

/**
 * Resgata uma missão diária concluída (`current >= target`), de forma idempotente.
 */
export function claimDailyMissionForProfile(
  profile: PlayerProfile,
  missionId: string,
  args?: {
    stats?: GameStatRow[];
    adminConfig?: Partial<AdminConfig> | null;
    dateKey?: string;
    now?: Date;
  },
): ClaimMissionResult {
  const dateKey = args?.dateKey ?? getLocalDateKey(args?.now);
  const missions = generateDailyMissions({
    profile,
    stats: args?.stats,
    adminConfig: args?.adminConfig,
    dateKey,
  });
  const mission = missions.find((m) => m.id === missionId);
  if (!mission) {
    return { ok: false, error: "Missão diária não encontrada.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }
  if (mission.claimed) {
    return { ok: false, alreadyClaimed: true, error: "Missão já resgatada hoje.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }
  if (mission.current < mission.target) {
    return { ok: false, error: "Conclua o objetivo da missão antes de resgatar.", missionId, pointsAwarded: 0, xpAwarded: 0, coinsAwarded: 0 };
  }

  const prev =
    profile.dailyMissionProgress && profile.dailyMissionProgress.dateKey === dateKey
      ? profile.dailyMissionProgress
      : createEmptyDailyMissionProgress(dateKey);
  const claimedIds = Array.from(new Set([...(prev.claimedIds ?? []), missionId]));
  profile.dailyMissionProgress = { ...prev, claimedIds };
  profile.dailyMissionsCompleted = (profile.dailyMissionsCompleted ?? 0) + 1;

  // Atualiza também o progresso da missão semanal "Missões Diárias Concluídas"
  profile.weeklyMissionProgress = recordDailyMissionCompletedIntoWeekly(
    profile.weeklyMissionProgress,
    args?.now,
  );

  const pointsAwarded = Math.max(0, mission.rewardPoints);
  const xpAwarded = Math.max(0, mission.rewardXp);
  const coinsAwarded = Math.max(0, mission.rewardCoins ?? 0);

  if (pointsAwarded > 0) {
    awardCareerPoints(profile, pointsAwarded, `Missão Diária: ${mission.title}`);
  }
  if (xpAwarded > 0) {
    profile.xp = Math.max(0, (profile.xp ?? 0) + xpAwarded);
    profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + xpAwarded);
  }
  if (coinsAwarded > 0) {
    awardCoins(profile, coinsAwarded, `Missão Diária: ${mission.title}`, "missao_diaria");
  }

  return { ok: true, missionId, pointsAwarded, xpAwarded, coinsAwarded };
}

function buildDailyMissionsList(args: {
  profile?: Partial<PlayerProfile> | null;
  stats?: GameStatRow[];
  adminConfig?: Partial<AdminConfig> | null;
  dateKey?: string;
}): DailyMission[] {
  const level = Math.max(1, Math.floor(args.profile?.level ?? 1));
  const playerId = args.profile?.id || args.profile?.nick || "guest";
  const isAdmin = Boolean(args.profile?.isAdmin);
  const dateKey = args.dateKey ?? getLocalDateKey();

  const leastPlayed = pickLeastPlayedGameForPlayer({
    playerId,
    level,
    isAdmin,
    stats: args.stats,
    adminConfig: args.adminConfig,
    dateKey,
  });

  if (level <= 3) {
    return [
      {
        id: `dm_${dateKey}_plays`,
        title: "Aquecimento Diário",
        description: "Jogue 2 partidas em qualquer jogo hoje.",
        target: 2,
        current: 0,
        rewardPoints: 15,
        rewardXp: 15,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_wins`,
        title: "Primeira Vitória",
        description: "Conquiste 1 vitória em qualquer desafio hoje.",
        target: 1,
        current: 0,
        rewardPoints: 20,
        rewardXp: 20,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_distinct`,
        title: "Explorador Curioso",
        description: "Jogue 2 jogos diferentes hoje.",
        target: 2,
        current: 0,
        rewardPoints: 25,
        rewardXp: 25,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_personal_${leastPlayed.gameId}`,
        title: `Desafio Pessoal: ${leastPlayed.gameName}`,
        description: `Você jogou pouco este desafio! Jogue 1 partida de ${leastPlayed.gameName} hoje.`,
        target: 1,
        current: 0,
        rewardPoints: 30,
        rewardXp: 30,
        isPersonalized: true,
        gameId: leastPlayed.gameId,
      },
    ];
  }

  if (level <= 6) {
    return [
      {
        id: `dm_${dateKey}_plays`,
        title: "Ritmo Constante",
        description: "Jogue 3 partidas em qualquer jogo hoje.",
        target: 3,
        current: 0,
        rewardPoints: 20,
        rewardXp: 20,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_wins`,
        title: "Sequência Vencedora",
        description: "Conquiste 2 vitórias hoje.",
        target: 2,
        current: 0,
        rewardPoints: 25,
        rewardXp: 25,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_distinct`,
        title: "Mente Versátil",
        description: "Jogue 2 jogos diferentes hoje.",
        target: 2,
        current: 0,
        rewardPoints: 25,
        rewardXp: 30,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_flawless`,
        title: "Precisão Cirúrgica",
        description: "Conclua 1 partida perfeita (0 erros) hoje.",
        target: 1,
        current: 0,
        rewardPoints: 35,
        rewardXp: 35,
        isPersonalized: false,
      },
      {
        id: `dm_${dateKey}_personal_${leastPlayed.gameId}`,
        title: `Desafio Pessoal: ${leastPlayed.gameName}`,
        description: `Supere seu menor histórico! Jogue 2 partidas de ${leastPlayed.gameName} hoje.`,
        target: 2,
        current: 0,
        rewardPoints: 40,
        rewardXp: 40,
        isPersonalized: true,
        gameId: leastPlayed.gameId,
      },
    ];
  }

  return [
    {
      id: `dm_${dateKey}_plays`,
      title: "Maratona de Lógica",
      description: "Jogue 5 partidas em qualquer jogo hoje.",
      target: 5,
      current: 0,
      rewardPoints: 25,
      rewardXp: 25,
      isPersonalized: false,
    },
    {
      id: `dm_${dateKey}_wins`,
      title: "Domínio Total",
      description: "Conquiste 3 vitórias hoje.",
      target: 3,
      current: 0,
      rewardPoints: 30,
      rewardXp: 30,
      isPersonalized: false,
    },
    {
      id: `dm_${dateKey}_distinct`,
      title: "Mestre Multijogos",
      description: "Jogue 3 jogos diferentes hoje.",
      target: 3,
      current: 0,
      rewardPoints: 30,
      rewardXp: 35,
      isPersonalized: false,
    },
    {
      id: `dm_${dateKey}_flawless`,
      title: "Zero Erros",
      description: "Conclua 1 partida perfeita (0 erros) hoje.",
      target: 1,
      current: 0,
      rewardPoints: 40,
      rewardXp: 40,
      isPersonalized: false,
    },
    {
      id: `dm_${dateKey}_competitive`,
      title: "Espírito Competitivo",
      description: "Dispute 1 duelo na Arena X1 ou vença 1 partida no Torneio Semanal.",
      target: 1,
      current: 0,
      rewardPoints: 45,
      rewardXp: 45,
      isPersonalized: false,
    },
    {
      id: `dm_${dateKey}_personal_${leastPlayed.gameId}`,
      title: `Desafio Pessoal: ${leastPlayed.gameName}`,
      description: `Domine o que menos joga! Jogue 2 partidas de ${leastPlayed.gameName} hoje.`,
      target: 2,
      current: 0,
      rewardPoints: 50,
      rewardXp: 50,
      isPersonalized: true,
      gameId: leastPlayed.gameId,
    },
  ];
}
