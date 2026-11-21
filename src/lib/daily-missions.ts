import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "./game-storage.ts";
import type { AdminConfig } from "./game-codes.ts";
import type { GameStatRow, PlayerProfile } from "./playfab.ts";
import { getLocalDateKey } from "./player-profile.ts";

export const DEFAULT_DAILY_MISSION_COINS = 5;

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
 * Respeita jogos habilitados, trava de modo apenas ADM e nível mínimo por jogo.
 * Em caso de empate (ex: vários jogos com 0 partidas), desempata deterministicamente
 * usando o ID do jogador e a data do dia para variar entre os dias.
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

  // Soma total de partidas por gameId (unificando modos normal, ranqueada, x1)
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

/**
 * Gera a lista de missões diárias para o jogador com base em sua faixa de nível
 * e no jogo que ele menos jogou (sempre colocado como a última missão da lista).
 */
export function generateDailyMissions(args: {
  profile?: Partial<PlayerProfile> | null;
  stats?: GameStatRow[];
  adminConfig?: Partial<AdminConfig> | null;
  dateKey?: string;
}): DailyMission[] {
  const dailyCoins = Math.max(
    0,
    Math.floor(
      (args.adminConfig as { coinRewardsConfig?: { dailyMissionCoins?: number } } | null | undefined)
        ?.coinRewardsConfig?.dailyMissionCoins ?? DEFAULT_DAILY_MISSION_COINS,
    ),
  );
  return buildDailyMissionsList(args).map((m) => ({ ...m, rewardCoins: dailyCoins }));
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
    // Nível 1 a 3 -> 4 missões (3 padrão + 1 personalizada)
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
    // Nível 4 a 6 -> 5 missões (4 padrão + 1 personalizada)
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
        description: "Conclua 1 partida perfeita (0 erros) ou dispute 1 partida no Torneio.",
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

  // Nível 7 a 10 -> 6 missões (5 padrão + 1 personalizada)
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
      description: "Dispute 1 duelo na Arena X1 ou vença 2 partidas no Torneio Semanal.",
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
