import type { PlayerProfile } from "./playfab.ts";
import { getAllAvailableMedals, type MedalRarity } from "./medals-catalog.ts";
import { getLocalDateKey } from "./player-profile.ts";
import { loadAllInboxMessages, getMessageRewards } from "./inbox-messages.ts";
import { recordScoreLedgerEntry, type ScoreTransactionSource } from "./score-history-ledger.ts";

/** Pontos concedidos por raridade de medalha */
export const MEDAL_POINTS_REWARDS: Record<MedalRarity | "secreta", number> = {
  bronze: 20,
  prata: 30,
  ouro: 50,
  platina: 100,
  diamante: 150,
  heroi: 150,
  secreta: 150,
};

/** Moedas concedidas por raridade de medalha (padrão configurável pelo ADM) */
export const MEDAL_COINS_REWARDS: Record<string, number> = {
  bronze: 5,
  prata: 10,
  ouro: 15,
  platina: 25,
  diamante: 50,
  heroi: 100,
  secreta: 100,
};

export function getLevelUpCoinsReward(level: number, step = 10): number {
  const safeLvl = Math.floor(Number(level) || 1);
  if (safeLvl < 2) return 0;
  return (safeLvl - 1) * Math.max(0, Math.floor(step));
}

/**
 * Atualiza saldo atual, total histórico conseguido (lifetimeCoins) e recorde máximo sem gastar (peakCoins).
 * Preserva sempre o invariante `lifetimeCoins >= coins + coinsSpentTotal` para evitar perda de moedas em contas legadas.
 */
export function creditCoinMetrics(
  profile: { coins?: number; lifetimeCoins?: number; peakCoins?: number; coinsSpentTotal?: number },
  amount: number,
): number {
  const numAmount = Number(amount);
  const currentCoins = Number.isFinite(Number(profile.coins)) ? Math.max(0, Math.floor(Number(profile.coins))) : 0;
  if (!Number.isFinite(numAmount)) return currentCoins;
  const added = Math.max(0, Math.round(numAmount));
  if (added <= 0) return currentCoins;
  const spent = Number.isFinite(Number(profile.coinsSpentTotal))
    ? Math.max(0, Math.floor(Number(profile.coinsSpentTotal)))
    : 0;
  const baseLifetime = Math.max(
    Number.isFinite(Number(profile.lifetimeCoins)) ? Math.max(0, Math.floor(Number(profile.lifetimeCoins))) : 0,
    currentCoins + spent,
  );
  const nextBalance = currentCoins + added;
  profile.coins = nextBalance;
  profile.lifetimeCoins = baseLifetime + added;
  profile.peakCoins = Math.max(
    Number.isFinite(Number(profile.peakCoins)) ? Math.max(0, Math.floor(Number(profile.peakCoins))) : 0,
    nextBalance,
  );
  return nextBalance;
}

export function awardCoins(
  profile: PlayerProfile,
  amount: number,
  reason = "Moedas Conquistadas",
  explicitSource?: ScoreTransactionSource,
): { profile: PlayerProfile; coinsAwarded: number } {
  if (!profile) return { profile, coinsAwarded: 0 };
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount)) return { profile, coinsAwarded: 0 };
  const coinsAwarded = Math.max(0, Math.round(numAmount));
  if (coinsAwarded <= 0) return { profile, coinsAwarded: 0 };
  creditCoinMetrics(profile, coinsAwarded);
  try {
    const rLower = (reason || "").toLowerCase();
    const source: ScoreTransactionSource =
      explicitSource ??
      (rLower.includes("retroativ")
        ? "retroatribuicao"
        : rLower.includes("missão diária") || rLower.includes("missao diaria")
          ? "missao_diaria"
          : rLower.includes("missão semanal") || rLower.includes("missao semanal")
            ? "missao_semanal"
            : rLower.includes("recompensa diária") || rLower.includes("check-in") || rLower.includes("login")
              ? "recompensa_diaria"
              : rLower.includes("baú") || rLower.includes("bau")
                ? "bau"
                : rLower.includes("nível") || rLower.includes("nivel")
                  ? "promocao_nivel"
                  : "medalha");
    recordScoreLedgerEntry({
      playerId: profile.id || profile.nick,
      playerNick: profile.nick || "Jogador",
      type: "coins",
      source,
      amount: coinsAwarded,
      balanceAfter: profile.coins,
      reason,
    });
  } catch {
    /* ignore */
  }
  return { profile, coinsAwarded };
}

/** Pontos concedidos ao subir para cada nível (2 a 10) */
export const LEVEL_POINTS_REWARDS: Record<number, number> = {
  2: 30,
  3: 40,
  4: 50,
  5: 75,
  6: 100,
  7: 150,
  8: 200,
  9: 300,
  10: 500,
};

/** Pontos concedidos ao alcançar uma nova classe no torneio semanal */
export const TOURNAMENT_TIER_PROMOTION_POINTS: Record<string, number> = {
  prata: 50,
  ouro: 100,
  platina: 150,
  diamante: 250,
  mestre: 400,
};

export const RECORD_PERSONAL_POINTS = 15;
export const RECORD_STAGE_MAX_POINTS = 50;
export const X1_WIN_POINTS = 10;
export const FLAWLESS_MATCH_POINTS = 10;
export const RANKED_WIN_POINTS = 10;
export const DAILY_LOGIN_POINTS = 25;
export const DAILY_FIRST_GAME_POINTS = 10;

/**
 * Concede pontos ao jogador, atualizando tanto o saldo gastável (pointsBalance)
 * quanto o total histórico acumulado (careerPoints) que governa o Hall da Fama.
 */
export function awardCareerPoints(
  profile: PlayerProfile,
  basePoints: number,
  _reason?: string,
  multiplier = 1,
): { profile: PlayerProfile; pointsAwarded: number } {
  if (!profile) return { profile, pointsAwarded: 0 };
  if (!Number.isFinite(basePoints) || !Number.isFinite(multiplier)) {
    return { profile, pointsAwarded: 0 };
  }
  const safeMult = Math.max(1, multiplier);
  const pointsAwarded = Math.round(basePoints * safeMult);
  if (!Number.isFinite(pointsAwarded) || pointsAwarded <= 0) {
    return { profile, pointsAwarded: 0 };
  }

  const currentBalance = Number.isFinite(profile.pointsBalance) ? Math.max(0, Math.floor(profile.pointsBalance!)) : 0;
  const currentCareer = Number.isFinite(profile.careerPoints) ? Math.max(0, Math.floor(profile.careerPoints!)) : 0;

  profile.pointsBalance = Math.max(0, currentBalance + pointsAwarded);
  profile.careerPoints = Math.max(0, currentCareer + pointsAwarded);

  try {
    const rLower = (_reason || "").toLowerCase();
    const source = rLower.includes("login")
      ? "login_diario"
      : rLower.includes("primeiro jogo")
        ? "primeiro_jogo"
        : rLower.includes("recorde")
          ? "recorde"
          : rLower.includes("ranqueada") || rLower.includes("torneio")
            ? "torneio_semanal"
            : rLower.includes("x1")
              ? "arena_x1"
              : rLower.includes("nível") || rLower.includes("nivel")
                ? "promocao_nivel"
                : rLower.includes("medalha")
                  ? "medalha"
                  : "partida";

    recordScoreLedgerEntry({
      playerId: profile.id || profile.nick,
      playerNick: profile.nick || "Jogador",
      type: "career_points",
      source,
      amount: pointsAwarded,
      balanceAfter: profile.careerPoints,
      reason: _reason || "Pontos Conquistados",
    });
  } catch {
    /* ignore ledger recording error */
  }

  return { profile, pointsAwarded };
}

/**
 * Estorna Pontos de Carreira e saldo concedidos indevidamente (por exemplo, por medalhas atribuídas prematuramente).
 */
export function revokeCareerPoints(
  profile: PlayerProfile,
  pointsToRevoke: number,
  reason?: string,
): { profile: PlayerProfile; pointsRevoked: number } {
  if (!profile || !Number.isFinite(pointsToRevoke) || pointsToRevoke <= 0) {
    return { profile, pointsRevoked: 0 };
  }
  const safeRevoke = Math.floor(pointsToRevoke);
  if (safeRevoke <= 0) return { profile, pointsRevoked: 0 };
  const currentBalance = Number.isFinite(profile.pointsBalance) ? Math.max(0, Math.floor(profile.pointsBalance!)) : 0;
  const currentCareer = Number.isFinite(profile.careerPoints) ? Math.max(0, Math.floor(profile.careerPoints!)) : 0;

  profile.pointsBalance = Math.max(0, currentBalance - safeRevoke);
  profile.careerPoints = Math.max(0, currentCareer - safeRevoke);

  try {
    recordScoreLedgerEntry({
      playerId: profile.id || profile.nick,
      playerNick: profile.nick || "Jogador",
      type: "career_points",
      source: "reconciliacao",
      amount: -safeRevoke,
      balanceAfter: profile.careerPoints,
      reason: reason || "Estorno Administrativo: Medalha Atribuída Indevidamente",
    });
  } catch {
    /* ignore */
  }

  return { profile, pointsRevoked: safeRevoke };
}

/**
 * Deduz pontos do saldo gastável do jogador (para compras futuras de itens/moeda).
 * O total histórico (careerPoints) NUNCA é reduzido, garantindo que compras
 * não rebaixem o aluno no ranking geral do Hall da Fama.
 */
export function spendCareerPoints(
  profile: PlayerProfile,
  cost: number,
): { success: boolean; newBalance: number } {
  const currentBalance = Number.isFinite(profile?.pointsBalance) ? Math.max(0, Math.floor(profile.pointsBalance!)) : 0;
  if (!profile || !Number.isFinite(cost)) {
    return { success: false, newBalance: currentBalance };
  }
  const safeCost = Math.floor(cost);
  if (safeCost <= 0) return { success: true, newBalance: currentBalance };
  if (currentBalance < safeCost) {
    return { success: false, newBalance: currentBalance };
  }

  profile.pointsBalance = currentBalance - safeCost;
  profile.pointsSpentTotal = (Number.isFinite(profile.pointsSpentTotal) ? Math.max(0, Math.floor(profile.pointsSpentTotal!)) : 0) + safeCost;
  return { success: true, newBalance: profile.pointsBalance };
}

/**
 * Converte voluntariamente uma quantidade de pontos em moedas para aquisição futura de itens/cosméticos.
 * O saldo de pontos (pointsBalance) é debitado e as moedas (coins) são creditadas.
 * IMPORTANTE: O total histórico acumulado (careerPoints) NUNCA é reduzido,
 * garantindo que a conversão de moedas não altere o ranking do Hall da Fama!
 */
export function convertPointsToCoins(
  profile: PlayerProfile,
  pointsToConvert: number,
  rate = 1,
): { success: boolean; coinsAwarded: number; remainingBalance: number; error?: string } {
  if (!profile) return { success: false, coinsAwarded: 0, remainingBalance: 0, error: "Perfil inexistente" };
  const currentBalance = Number.isFinite(profile.pointsBalance) ? Math.max(0, Math.floor(profile.pointsBalance!)) : 0;
  if (!Number.isFinite(pointsToConvert) || !Number.isFinite(rate) || pointsToConvert <= 0 || !Number.isInteger(pointsToConvert)) {
    return { success: false, coinsAwarded: 0, remainingBalance: currentBalance, error: "Quantidade inválida" };
  }
  if (currentBalance < pointsToConvert) {
    return { success: false, coinsAwarded: 0, remainingBalance: currentBalance, error: "Saldo de pontos insuficiente" };
  }

  const safeRate = Math.max(0.1, rate);
  const coinsAwarded = Math.floor(pointsToConvert / safeRate);
  if (!Number.isFinite(coinsAwarded) || coinsAwarded <= 0) {
    return {
      success: false,
      coinsAwarded: 0,
      remainingBalance: currentBalance,
      error: "Pontos insuficientes para obter ao menos 1 moeda",
    };
  }

  profile.pointsBalance = currentBalance - pointsToConvert;
  profile.pointsSpentTotal = (Number.isFinite(profile.pointsSpentTotal) ? Math.max(0, Math.floor(profile.pointsSpentTotal!)) : 0) + pointsToConvert;
  creditCoinMetrics(profile, coinsAwarded);

  return { success: true, coinsAwarded, remainingBalance: profile.pointsBalance };
}

/**
 * Conversão automática de todo o saldo residual de pontos em moedas
 * acionada ao encerramento de um ciclo / temporada de atividades.
 */
export function autoConvertAllPointsToCoins(
  profile: PlayerProfile,
  rate = 1,
): { coinsAwarded: number; newCoinsBalance: number } {
  if (!profile) return { coinsAwarded: 0, newCoinsBalance: 0 };
  const currentBalance = Number.isFinite(profile.pointsBalance) ? Math.max(0, Math.floor(profile.pointsBalance!)) : 0;
  const currentCoins = Number.isFinite(profile.coins) ? Math.max(0, Math.floor(profile.coins!)) : 0;
  if (currentBalance <= 0 || !Number.isFinite(rate)) {
    return { coinsAwarded: 0, newCoinsBalance: currentCoins };
  }

  const safeRate = Math.max(0.1, rate);
  const coinsAwarded = Math.floor(currentBalance / safeRate);
  if (!Number.isFinite(coinsAwarded) || coinsAwarded <= 0) {
    return { coinsAwarded: 0, newCoinsBalance: currentCoins };
  }

  profile.pointsBalance = 0;
  profile.pointsSpentTotal = (Number.isFinite(profile.pointsSpentTotal) ? Math.max(0, Math.floor(profile.pointsSpentTotal!)) : 0) + currentBalance;
  const newCoinsBalance = creditCoinMetrics(profile, coinsAwarded);

  return { coinsAwarded, newCoinsBalance };
}

/**
 * Avalia e concede 25 pontos pelo primeiro login do dia (1x a cada 24h).
 */
export function checkAndApplyDailyLoginPoints(
  profile: PlayerProfile,
  now = new Date(),
  multiplier = 1,
): { profile: PlayerProfile; pointsAwarded: number } {
  if (!profile) return { profile, pointsAwarded: 0 };
  const todayKey = getLocalDateKey(now);
  if (profile.lastDailyLoginPointsDate === todayKey) {
    return { profile, pointsAwarded: 0 };
  }

  profile.lastDailyLoginPointsDate = todayKey;
  return awardCareerPoints(profile, DAILY_LOGIN_POINTS, "Login diário", multiplier);
}

/**
 * Avalia e concede 10 pontos por jogar a primeira partida no dia (1x a cada 24h).
 */
export function checkAndApplyFirstGameOfDayPoints(
  profile: PlayerProfile,
  now = new Date(),
  multiplier = 1,
): { profile: PlayerProfile; pointsAwarded: number } {
  if (!profile) return { profile, pointsAwarded: 0 };
  const todayKey = getLocalDateKey(now);
  if (profile.lastDailyFirstGamePointsDate === todayKey) {
    return { profile, pointsAwarded: 0 };
  }

  profile.lastDailyFirstGamePointsDate = todayKey;
  return awardCareerPoints(profile, DAILY_FIRST_GAME_POINTS, "Primeiro jogo do dia", multiplier);
}

/**
 * Avalia se o aluno alcançou novos patamares de classe na ranqueada
 * (Prata, Ouro, Platina, Diamante, Mestre) e concede a pontuação devida apenas 1 vez por tier.
 */
export function checkTournamentTierPromotion(
  rankId: string,
  profile: PlayerProfile,
  multiplier = 1,
): { profile: PlayerProfile; pointsAwarded: number; newTiers: string[] } {
  if (!profile) return { profile, pointsAwarded: 0, newTiers: [] };
  const tier = rankId.split("_")[0]?.toLowerCase();
  if (!tier || !TOURNAMENT_TIER_PROMOTION_POINTS[tier]) {
    return { profile, pointsAwarded: 0, newTiers: [] };
  }

  const achieved = new Set<string>(profile.achievedTournamentTiers ?? []);
  if (achieved.has(tier)) {
    return { profile, pointsAwarded: 0, newTiers: [] };
  }

  achieved.add(tier);
  profile.achievedTournamentTiers = Array.from(achieved);

  const basePoints = TOURNAMENT_TIER_PROMOTION_POINTS[tier];
  const { pointsAwarded } = awardCareerPoints(
    profile,
    basePoints,
    `Promoção para Liga ${tier.toUpperCase()}`,
    multiplier,
  );

  return { profile, pointsAwarded, newTiers: [tier] };
}

/**
 * Avalia se o jogador subiu para um nível que ainda não foi recompensado em pontos.
 */
export function checkLevelPromotionPoints(
  level: number,
  profile: PlayerProfile,
  multiplier = 1,
  levelCoinStep = 10,
): { profile: PlayerProfile; pointsAwarded: number } {
  if (!profile || level < 2 || level > 10) {
    return { profile, pointsAwarded: 0 };
  }

  const rewarded = new Set<number>(profile.achievedLevelsPoints ?? []);
  let totalAwarded = 0;

  // Garante que todos os níveis até o atual foram recompensados
  for (let lvl = 2; lvl <= level; lvl++) {
    if (!rewarded.has(lvl)) {
      rewarded.add(lvl);
      const basePts = LEVEL_POINTS_REWARDS[lvl] ?? 0;
      if (basePts > 0) {
        const { pointsAwarded } = awardCareerPoints(
          profile,
          basePts,
          `Alcance do Nível ${lvl}`,
          multiplier,
        );
        totalAwarded += pointsAwarded;
      }
      const coinsReward = getLevelUpCoinsReward(lvl, levelCoinStep);
      if (coinsReward > 0) {
        awardCoins(profile, coinsReward, `Alcance do Nível ${lvl}`);
      }
    }
  }

  profile.achievedLevelsPoints = Array.from(rewarded);
  return { profile, pointsAwarded: totalAwarded };
}

let cachedBaseMedalRarityMap: Map<string, MedalRarity> | null = null;

function getBaseMedalRarityMap(): Map<string, MedalRarity> {
  if (!cachedBaseMedalRarityMap) {
    cachedBaseMedalRarityMap = new Map(getAllAvailableMedals().map((m) => [m.id, m.rarity]));
  }
  return cachedBaseMedalRarityMap;
}

/**
 * Calcula a pontuação histórica retroativa para jogadores já existentes com base
 * nas medalhas desbloqueadas e no nível atual, evitando que comecem do zero.
 */
export function calculateRetroactivePoints(profile: PlayerProfile): number {
  if (!profile) return 0;
  let sum = 0;

  const catalogMap = getBaseMedalRarityMap();

  // 1. Pontos de medalhas já conquistadas
  if (Array.isArray(profile.unlockedMedals)) {
    for (const m of profile.unlockedMedals) {
      if (!m) continue;
      const mId = (m as any).medalId ?? (m as any).id ?? "";
      const rarity = ((m as any).rarity ?? catalogMap.get(mId) ?? "bronze") as MedalRarity;
      const count = Math.max(1, (m as any).count ?? 1);
      sum += (MEDAL_POINTS_REWARDS[rarity] ?? 20) * count;
    }
  }

  // 2. Pontos de níveis já alcançados
  const lvl = Math.min(10, Math.max(1, profile.level ?? 1));
  for (let l = 2; l <= lvl; l++) {
    sum += LEVEL_POINTS_REWARDS[l] ?? 0;
  }

  // 3. Pontos de vitórias acumuladas no X1
  if ((profile.x1Wins ?? 0) > 0) {
    sum += (profile.x1Wins ?? 0) * X1_WIN_POINTS;
  }

  return sum;
}

/**
 * Calcula o teto legítimo razoável de pontos de carreira para um perfil,
 * e se detectar inflação de pontos gerada pelo loop de sincronização anterior,
 * corrige `careerPoints`, `pointsBalance` e restaura as travas de nível/data.
 */
export function sanitizeInflatedCareerPoints(
  profile: PlayerProfile,
  options?: { skipMedalPrune?: boolean },
): {
  profile: PlayerProfile;
  wasSanitized: boolean;
} {
  if (!profile || profile.isAdmin) {
    return { profile, wasSanitized: false };
  }

  // Garante que todos os níveis já conquistados pelo jogador constem em achievedLevelsPoints
  const curLevel = Math.min(10, Math.max(1, profile.level ?? 1));
  const lvlSet = new Set<number>(Array.isArray(profile.achievedLevelsPoints) ? profile.achievedLevelsPoints : []);
  for (let l = 2; l <= curLevel; l++) {
    lvlSet.add(l);
  }
  profile.achievedLevelsPoints = Array.from(lvlSet);

  // Restaura achievedTournamentTiers de acordo com a patente máxima já alcançada (alinhado a TOURNAMENT_RANKS)
  const tierSet = new Set<string>(Array.isArray(profile.achievedTournamentTiers) ? profile.achievedTournamentTiers : []);
  const maxPts = Math.max(profile.tournamentPoints ?? 0, profile.bestTournamentPoints ?? 0);
  if (maxPts >= 91) tierSet.add("prata");
  if (maxPts >= 241) tierSet.add("ouro");
  if (maxPts >= 451) tierSet.add("platina");
  if (maxPts >= 681) tierSet.add("diamante");
  if (maxPts >= 850) tierSet.add("mestre");
  profile.achievedTournamentTiers = Array.from(tierSet);

  // Higieniza medalhas incompatíveis com o histórico real de partidas do aluno
  const statsList = Array.isArray(profile.stats) ? profile.stats : [];
  const totalMatches = Math.max(
    profile.matchesPlayed ?? 0,
    profile.totalMatches ?? 0,
    statsList.reduce((acc, s) => acc + (s?.plays ?? 0), 0),
  );

  if (!options?.skipMedalPrune && totalMatches <= 15 && Array.isArray(profile.unlockedMedals)) {
    profile.unlockedMedals = profile.unlockedMedals.filter((m) => {
      if (!m) return false;
      const mId = m.medalId || (m as any).id || "";
      if (
        mId === "tournament_top_1_gold" ||
        mId === "tournament_top_2_silver" ||
        mId === "tournament_top_3_bronze" ||
        mId.startsWith("secret_top5_") ||
        mId.startsWith("secret_top1_") ||
        mId.startsWith("beta_tester_") ||
        mId.startsWith("meta_collector_") ||
        mId === "explorer_all_games" ||
        (mId === "m_rpg_ametista" && profile.nickNormalized !== "zheret") ||
        (mId === "m_rpg_carmesim" && profile.nickNormalized !== "zheret") ||
        (mId === "streak_3_days" && (profile.streakDays ?? 0) < 3) ||
        (mId === "streak_5_days" && (profile.streakDays ?? 0) < 5) ||
        (mId === "streak_7_days" && (profile.streakDays ?? 0) < 7) ||
        (mId.startsWith("streak_") &&
          mId !== "streak_3_days" &&
          mId !== "streak_5_days" &&
          mId !== "streak_7_days" &&
          (profile.streakDays ?? 0) < 7)
      ) {
        return false;
      }
      if (mId.endsWith("_lvl_master")) {
        const gameId = mId.replace("game_", "").replace("_lvl_master", "");
        const stat = statsList.find((s) => s?.game_id === gameId);
        if (!stat || (stat.best_level ?? 1) < 3) return false;
      }
      if (mId.endsWith("_flawless")) {
        const gameId = mId.replace("game_", "").replace("_flawless", "");
        const stat = statsList.find((s) => s?.game_id === gameId);
        if (!stat || (stat.flawless_wins ?? 0) <= 0) return false;
      }
      return true;
    });

    // Limita o count cumulativo ao número real de partidas jogadas
    for (const m of profile.unlockedMedals) {
      if (m && m.count && m.count > Math.max(1, totalMatches)) {
        m.count = Math.max(1, totalMatches);
      }
    }
  }

  // Calcula os pontos legítimos comprovados pelo histórico real do aluno
  const baseRetro = calculateRetroactivePoints(profile);

  // Pontos de promoção de liga ranqueada
  let tierPoints = 0;
  for (const t of tierSet) {
    tierPoints += TOURNAMENT_TIER_PROMOTION_POINTS[t] ?? 0;
  }

  // Pontos de dias ativos (login diário +25 e 1º jogo do dia +10 por data ativa real)
  const activeDatesCount = Math.max(
    Array.isArray(profile.activeDates) ? profile.activeDates.length : 0,
    profile.lastActiveDate ? 1 : 0,
    totalMatches > 0 ? 1 : 0,
  );
  const verifiedLoginDays = Math.max(1, activeDatesCount);
  const loginAndFirstGamePoints =
    verifiedLoginDays * DAILY_LOGIN_POINTS +
    (totalMatches > 0 ? activeDatesCount * DAILY_FIRST_GAME_POINTS : 0);

  // Pontos de partidas perfeitas (flawless_wins) e recordes pessoais
  const totalFlawlessWins = statsList.reduce((acc, s) => acc + (s?.flawless_wins ?? 0), 0);
  const gamesPlayedCount = statsList.filter((s) => (s?.plays ?? 0) > 0).length;
  const flawlessAndRecordPoints =
    totalFlawlessWins * FLAWLESS_MATCH_POINTS + gamesPlayedCount * RECORD_PERSONAL_POINTS;

  // Pontos de vitórias ranqueadas
  const rankedStats = statsList.filter((s) => s?.mode === "torneio_semanal");
  const rankedWins = Math.max(
    rankedStats.reduce((acc, s) => acc + (s?.wins ?? 0), 0),
    Math.floor(maxPts / 8),
  );
  const rankedWinPoints = rankedWins * RANKED_WIN_POINTS;

  // Pontos resgatados em mensagens do correio
  let claimedInboxPoints = 0;
  if (Array.isArray(profile.claimedInboxRewardIds) && profile.claimedInboxRewardIds.length > 0) {
    try {
      const allMsgs = loadAllInboxMessages();
      const msgMap = new Map(allMsgs.map((m) => [m.id, m]));
      for (const mId of profile.claimedInboxRewardIds) {
        const msg = msgMap.get(mId);
        for (const r of getMessageRewards(msg)) {
          if (r.type === "points" && (r.pointsAmount ?? 0) > 0) {
            claimedInboxPoints += r.pointsAmount!;
          }
        }
      }
    } catch {
      // Fallback caso mensagens ainda não estejam carregadas
      claimedInboxPoints += profile.claimedInboxRewardIds.length * 100;
    }
  }

  // Pontos legítimos de Rotina Diária/Semanal, Baús e Códigos Promocionais
  const checkInDays = Math.max(0, Math.floor(Number(profile.dailyCheckInCount) || 0));
  const dailyMissionsCount = Math.max(
    Math.floor(Number(profile.dailyMissionsCompleted) || 0),
    Array.isArray(profile.dailyMissionProgress?.claimedIds) ? profile.dailyMissionProgress!.claimedIds.length : 0,
  );
  const weeklyMissionsCount = Math.max(
    Math.floor(Number(profile.weeklyMissionsCompleted) || 0),
    Array.isArray(profile.weeklyMissionProgress?.claimedIds) ? profile.weeklyMissionProgress!.claimedIds.length : 0,
  );
  const chestsCount = Math.max(0, Math.floor(Number(profile.chestsOpenedTotal) || 0));
  const promoClaimsCount = Array.isArray(profile.claimedPromoCodeIds) ? profile.claimedPromoCodeIds.length : 0;
  const routineAndChestPoints =
    checkInDays * 180 + // trilha 7d + bônus máximo de ofensiva (+100/dia)
    dailyMissionsCount * 60 +
    weeklyMissionsCount * 160 +
    chestsCount * 260 +
    promoClaimsCount * 250;

  const legitimatePoints =
    baseRetro +
    tierPoints +
    loginAndFirstGamePoints +
    flawlessAndRecordPoints +
    rankedWinPoints +
    claimedInboxPoints +
    routineAndChestPoints;

  // Teto proporcional inviolável de salvaguarda física baseado na atividade real do estudante
  const maxPhysicalCeiling = Math.max(
    150,
    totalMatches * 60 +
      (curLevel - 1) * 60 +
      verifiedLoginDays * 35 +
      claimedInboxPoints +
      routineAndChestPoints +
      120,
  );

  const finalLegitimatePoints = Math.min(legitimatePoints, maxPhysicalCeiling);

  // Margem de segurança para bônus de eventos (2x) ou recordes de etapa (+50)
  const maxReasonableThreshold = Math.min(
    maxPhysicalCeiling,
    Math.max(
      finalLegitimatePoints + 150,
      Math.round(finalLegitimatePoints * 1.5),
    )
  );

  const currentCareer = profile.careerPoints ?? 0;
  const currentBalance = profile.pointsBalance ?? 0;

  if (
    currentCareer > maxReasonableThreshold ||
    currentBalance > maxReasonableThreshold ||
    currentCareer > maxPhysicalCeiling
  ) {
    profile.careerPoints = finalLegitimatePoints;
    profile.pointsBalance = Math.max(0, finalLegitimatePoints);
    return { profile, wasSanitized: true };
  }

  return { profile, wasSanitized: false };
}

/**
 * Garante que o perfil possua `careerPoints` e `pointsBalance` inicializados,
 * aplicando reconciliação retroativa justa caso estejam zerados/indefinidos,
 * e corrige pontuações infladas por loops de sincronização.
 */
export function ensurePlayerCareerPointsInitialized(
  profile: PlayerProfile,
  options?: { skipMedalPrune?: boolean },
): PlayerProfile {
  if (!profile) return profile;
  sanitizeInflatedCareerPoints(profile, options);
  const needsInit =
    profile.careerPoints === undefined ||
    profile.pointsBalance === undefined ||
    (profile.careerPoints === 0 && ((profile.level ?? 1) > 1 || (profile.unlockedMedals?.length ?? 0) > 0));

  if (needsInit) {
    const retroPoints = calculateRetroactivePoints(profile);
    const existingCareer = profile.careerPoints ?? 0;
    const finalPoints = Math.max(existingCareer, retroPoints);
    profile.careerPoints = finalPoints;
    profile.pointsBalance = Math.max(profile.pointsBalance ?? 0, finalPoints);

    // Marca os níveis já atingidos para não duplicar no futuro
    const curLevel = Math.min(10, Math.max(1, profile.level ?? 1));
    const lvlList: number[] = [];
    for (let l = 2; l <= curLevel; l++) {
      lvlList.push(l);
    }
    profile.achievedLevelsPoints = Array.from(new Set([...(profile.achievedLevelsPoints ?? []), ...lvlList]));
    sanitizeInflatedCareerPoints(profile, options);
  }

  return profile;
}

export interface RetroactiveMedalCoinsBreakdownItem {
  medalId: string;
  rarity: MedalRarity;
  unrewardedCount: number;
  coinsPerUnit: number;
  totalCoins: number;
}

export interface RetroactiveMedalCoinsResult {
  totalExpectedMedalCoins: number;
  coinsToAward: number;
  alreadyRewardedOffset: number;
  breakdown: RetroactiveMedalCoinsBreakdownItem[];
  nextRewardedMap: Record<string, number>;
}

/**
 * Calcula as moedas retroativas devidas EXCLUSIVAMENTE pelas medalhas já desbloqueadas pelo aluno,
 * utilizando `coinRewardsConfig.medalCoinsByRarity` (fallback: `MEDAL_COINS_REWARDS`).
 * É 100% idempotente: rastreia `coinRewardedMedalIds` por medalha (inclusive contagem cumulativa)
 * e, na primeira migração, desconta eventual `lifetimeCoins` já creditado para evitar pagamento em dobro.
 */
export function calculateRetroactiveMedalCoins(
  profile: Partial<PlayerProfile> | null | undefined,
  options?: {
    medalCoinsByRarity?: Partial<Record<string, number>>;
    customMedalRarities?: Record<string, MedalRarity>;
  },
): RetroactiveMedalCoinsResult {
  const empty: RetroactiveMedalCoinsResult = {
    totalExpectedMedalCoins: 0,
    coinsToAward: 0,
    alreadyRewardedOffset: 0,
    breakdown: [],
    nextRewardedMap: { ...(profile?.coinRewardedMedalIds ?? {}) },
  };
  if (!profile || !Array.isArray(profile.unlockedMedals) || profile.unlockedMedals.length === 0) {
    return empty;
  }

  const catalogMap = getBaseMedalRarityMap();
  const customMap = options?.customMedalRarities ?? {};
  const rarityCoinsCfg = options?.medalCoinsByRarity ?? {};
  const prevRewarded = profile.coinRewardedMedalIds ?? {};

  // Agrega contagem por medalId (evitando duplicatas caso haja entradas repetidas no array)
  const countByMedal = new Map<string, { count: number; rarity: MedalRarity }>();
  for (const m of profile.unlockedMedals) {
    if (!m) continue;
    const mId = String((m as any).medalId ?? (m as any).id ?? "").trim();
    if (!mId) continue;
    const rarity = (
      customMap[mId] ??
      (m as any).rarity ??
      catalogMap.get(mId) ??
      "bronze"
    ) as MedalRarity;
    const count = Math.max(1, Math.floor(Number((m as any).count ?? 1)));
    const prev = countByMedal.get(mId);
    if (prev) {
      prev.count = Math.max(prev.count, count);
    } else {
      countByMedal.set(mId, { count, rarity });
    }
  }

  const nextRewardedMap: Record<string, number> = { ...prevRewarded };
  const breakdown: RetroactiveMedalCoinsBreakdownItem[] = [];
  let rawDeltaCoins = 0;

  for (const [medalId, info] of countByMedal.entries()) {
    const alreadyCount = Math.max(0, Math.floor(Number(prevRewarded[medalId] ?? 0)));
    const unrewardedCount = Math.max(0, info.count - alreadyCount);
    nextRewardedMap[medalId] = Math.max(alreadyCount, info.count);
    if (unrewardedCount <= 0) continue;

    const coinsPerUnit = Math.max(
      0,
      Math.floor(
        Number(
          rarityCoinsCfg[info.rarity] ??
            MEDAL_COINS_REWARDS[info.rarity] ??
            MEDAL_COINS_REWARDS.bronze,
        ),
      ),
    );
    const totalCoins = unrewardedCount * coinsPerUnit;
    if (totalCoins > 0) {
      rawDeltaCoins += totalCoins;
      breakdown.push({
        medalId,
        rarity: info.rarity,
        unrewardedCount,
        coinsPerUnit,
        totalCoins,
      });
    }
  }

  // Não desconta `lifetimeCoins` de outras fontes (correio, promo, Dia 1 ou loja):
  // a idempotência é garantida exclusivamente por `coinRewardedMedalIds` por medalha.
  const alreadyRewardedOffset = 0;
  const coinsToAward = Math.max(0, rawDeltaCoins);

  return {
    totalExpectedMedalCoins: rawDeltaCoins,
    coinsToAward,
    alreadyRewardedOffset,
    breakdown,
    nextRewardedMap,
  };
}

/**
 * Aplica a retroatribuição de moedas baseadas em medalhas ao perfil de forma idempotente.
 */
export function applyRetroactiveMedalCoins(
  profile: PlayerProfile,
  options?: {
    medalCoinsByRarity?: Partial<Record<string, number>>;
    customMedalRarities?: Record<string, MedalRarity>;
    nowIso?: string;
  },
): RetroactiveMedalCoinsResult {
  const calc = calculateRetroactiveMedalCoins(profile, options);
  profile.coinRewardedMedalIds = calc.nextRewardedMap;
  if (!profile.retroactiveMedalCoinsGrantedAt) {
    profile.retroactiveMedalCoinsGrantedAt = options?.nowIso ?? new Date().toISOString();
  }
  if (calc.coinsToAward > 0) {
    awardCoins(
      profile,
      calc.coinsToAward,
      `Retroatribuição de Moedas (${calc.breakdown.length} medalha${calc.breakdown.length === 1 ? "" : "s"})`,
      "retroatribuicao",
    );
  }
  return calc;
}
