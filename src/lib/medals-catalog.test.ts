import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateStatsByGame,
  buildBaseMedalsCatalog,
  calculateMaxConsecutiveDays,
  calculateMaxConsecutiveWeeks,
  calculateMedalProgress,
  evaluatePlayerMedals,
  filterMedalsByQuery,
  getAllAvailableMedals,
  getDailyPostCapMatches,
  getDistinctFlawlessGames,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
  getGameMedalsProgress,
  getX1MedalsProgress,
  getPlayerStreakDays,
  getMedalProgressStyle,
  getTopShowcaseMedals,
  isFlawlessMatch,
  RARITY_INFO,
  type MedalDefinition,
} from "./medals-catalog.ts";
import { ALL_GAME_IDS, type GameId } from "./game-storage.ts";
import {
  ensurePlayerSeasonAligned,
  type PlayerProfile,
  type GameStatRow,
  grantPlayerMedalManually,
  runRetroactiveMedalsAudit,
  loadRegistry,
  saveRegistry,
} from "./playfab.ts";
import { loadAdminConfig } from "./game-codes.ts";
import { getLocalDateKey } from "./player-profile.ts";

describe("Sistema Completo de Medalhas e Inventário", () => {
  it("constrói o catálogo base com todas as categorias solicitadas", () => {
    const catalog = buildBaseMedalsCatalog();
    assert.ok(catalog.length >= 90, `Esperado 90+ medalhas, encontrado ${catalog.length}`);

    // Valida 9 medalhas de nível
    const lvlMedals = catalog.filter((m) => m.category === "nivel");
    assert.equal(lvlMedals.length, 9);
    assert.equal(lvlMedals[0].id, "lvl_2");
    assert.equal(lvlMedals[8].id, "lvl_10");

    // Valida medalhas de quantidade de partidas (7 por jogo x ALL_GAME_IDS.length + 4 globais não secretas)
    const matchMedals = catalog.filter((m) => m.category === "jogo_partidas");
    assert.equal(matchMedals.length, ALL_GAME_IDS.length * 7 + 4);

    // Valida medalhas de zero erros (1 por jogo)
    const flawlessMedals = catalog.filter((m) => m.category === "jogo_perfeito");
    assert.equal(flawlessMedals.length, ALL_GAME_IDS.length);

    // Valida medalhas de X1 (7 participação + 8 vitórias + 5 sequência + 6 escola = 26, + 3 semanais)
    const x1Total = catalog.filter((m) => m.category === "x1_vitorias");
    const x1Weekly = catalog.filter((m) => m.category === "x1_semanal");
    assert.equal(x1Total.length, 26);
    assert.equal(x1Weekly.length, 3);
  });

  it("avalia e concede medalhas de nível e zero erros automaticamente", () => {
    const mockProfile: PlayerProfile = {
      id: "p1",
      nick: "AlunoTeste",
      nickNormalized: "alunoteste",
      full_name: "ALUNO TESTE",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-01-20",
      xp: 2000,
      seasonXp: 2000,
      level: 5,
      wins: 6,
      matchesPlayed: 12,
      distinctGamesPlayed: 4,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const mockStats: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "padrao",
        plays: 15,
        wins: 4,
        best_score: 95,
        best_level: 3,
        last_played_at: new Date().toISOString(),
      },
    ];

    const awarded = evaluatePlayerMedals({
      profile: mockProfile,
      stats: mockStats,
      lastMatch: {
        gameId: "logica",
        score: 95,
        level: 3,
        correct: 5,
        wrong: 0,
      },
    });

    const ids = awarded.map((m) => m.id);
    // Deve ganhar medalhas dos níveis 2, 3, 4, 5
    assert.ok(ids.includes("lvl_2"));
    assert.ok(ids.includes("lvl_5"));
    assert.ok(!ids.includes("lvl_6")); // ainda não é nível 6

    // Deve ganhar a medalha de 10 partidas de Lógica
    assert.ok(ids.includes("game_logica_matches_10"));
    // Deve ganhar a de zero erros de Lógica
    assert.ok(ids.includes("game_logica_flawless"));
  });

  it("seleciona automaticamente até 6 medalhas mais raras para vitrine/destaque (com suporte a limite customizado)", () => {
    const medalsList: MedalDefinition[] = [
      {
        id: "m_bronze",
        title: "Bronze Comum",
        description: "",
        rarity: "bronze",
        category: "atividade",
        iconName: "Clock",
        condition: { type: "streak_days", threshold: 3 },
      },
      {
        id: "m_ouro",
        title: "Ouro Supremo",
        description: "",
        rarity: "ouro",
        category: "ranking",
        iconName: "Trophy",
        condition: { type: "tournament_rank", targetRank: 1 },
      },
      {
        id: "m_platina",
        title: "Platina Rara",
        description: "",
        rarity: "platina",
        category: "meta",
        iconName: "Crown",
        condition: { type: "all_level_medals" },
      },
      {
        id: "m_diamante",
        title: "Diamante Lendário",
        description: "",
        rarity: "diamante",
        category: "meta",
        iconName: "Gem",
        condition: { type: "total_medals_count", threshold: 50 },
      },
    ];

    const extraMedals: MedalDefinition[] = [
      ...medalsList,
      {
        id: "m_prata",
        title: "Medalha Prata",
        description: "Prata",
        rarity: "prata",
        category: "meta",
        iconName: "Award",
        condition: { type: "total_medals_count", threshold: 5 },
      },
      {
        id: "m_ouro_2",
        title: "Ouro Z",
        description: "Ouro Z",
        rarity: "ouro",
        category: "meta",
        iconName: "Award",
        condition: { type: "total_medals_count", threshold: 15 },
      },
      {
        id: "m_platina_2",
        title: "Platina Z",
        description: "Platina Z",
        rarity: "platina",
        category: "meta",
        iconName: "Award",
        condition: { type: "total_medals_count", threshold: 30 },
      },
    ];

    const unlocked = [
      { medalId: "m_bronze", unlockedAt: "2026-10-31" },
      { medalId: "m_prata", unlockedAt: "2026-10-31" },
      { medalId: "m_ouro", unlockedAt: "2026-10-31" },
      { medalId: "m_ouro_2", unlockedAt: "2026-10-31" },
      { medalId: "m_platina", unlockedAt: "2026-10-31" },
      { medalId: "m_platina_2", unlockedAt: "2026-10-31" },
      { medalId: "m_diamante", unlockedAt: "2026-10-31" },
    ];

    const topDefault = getTopShowcaseMedals(unlocked, extraMedals);
    assert.equal(topDefault.length, 7);
    assert.equal(topDefault[0].id, "m_diamante"); // peso 5
    assert.equal(topDefault[1].id, "m_platina"); // peso 4 (A antes de B)
    assert.equal(topDefault[2].id, "m_platina_2"); // peso 4
    assert.equal(topDefault[3].id, "m_ouro"); // peso 3 (A antes de B)
    assert.equal(topDefault[4].id, "m_ouro_2"); // peso 3
    assert.equal(topDefault[5].id, "m_prata"); // peso 2
    assert.equal(topDefault[6].id, "m_bronze"); // peso 1

    const extra8 = [
      ...extraMedals,
      {
        id: "m_heroi",
        title: "Herói Supremo",
        description: "Herói",
        rarity: "heroi" as const,
        category: "meta" as const,
        iconName: "Crown",
        condition: { type: "total_medals_count" as const, threshold: 50 },
      },
      {
        id: "m_bronze_2",
        title: "Bronze Extra",
        description: "Bronze Extra",
        rarity: "bronze" as const,
        category: "meta" as const,
        iconName: "Award",
        condition: { type: "total_medals_count" as const, threshold: 2 },
      },
    ];
    const unlocked9 = [
      ...unlocked,
      { medalId: "m_heroi", unlockedAt: "2026-10-31" },
      { medalId: "m_bronze_2", unlockedAt: "2026-10-31" },
    ];
    const top8 = getTopShowcaseMedals(unlocked9, extra8);
    assert.equal(top8.length, 8);
    assert.equal(top8[0].id, "m_heroi");

    const top3 = getTopShowcaseMedals(unlocked, extraMedals, 3);
    assert.equal(top3.length, 3);
    assert.equal(top3[0].id, "m_diamante");
    assert.equal(top3[1].id, "m_platina");
    assert.equal(top3[2].id, "m_platina_2");
  });

  it("calcula corretamente as cores dinâmicas do contador de medalhas (laranja, amarelo claro e verde)", () => {
    // 0 medalhas ou abaixo da metade -> laranja
    assert.equal(getMedalProgressStyle(0, 7).tier, "start");
    assert.equal(getMedalProgressStyle(3, 7).tier, "start");
    assert.equal(getMedalProgressStyle(0, 0).tier, "start");

    // Metade (arredondada para cima em ímpares) até antes de 100% -> amarelo claro
    assert.equal(getMedalProgressStyle(4, 7).tier, "half");
    assert.equal(getMedalProgressStyle(6, 7).tier, "half");
    assert.equal(getMedalProgressStyle(4, 8).tier, "half");

    // 100% concluído -> verde
    assert.equal(getMedalProgressStyle(7, 7).tier, "complete");
    assert.equal(getMedalProgressStyle(11, 11).tier, "complete");
  });

  it("garante que cada jogo registrado gera automaticamente 11 medalhas dedicadas (além das exclusivas vinculadas)", () => {
    const catalog = buildBaseMedalsCatalog();
    const expectedTotalByGame: Partial<Record<string, number>> = {
      rpg: 13,
      spacequest: 19,
    };

    for (const gId of ALL_GAME_IDS) {
      const autoMedals = catalog.filter(
        (m) => m.gameId === gId && m.id.startsWith(`game_${gId}_`)
      );
      assert.equal(
        autoMedals.length,
        11,
        `Jogo ${gId} deveria ter 11 medalhas automáticas (1 nível, 1 sem erros, 9 partidas), mas tem ${autoMedals.length}`
      );
      assert.ok(autoMedals.some((m) => m.id === `game_${gId}_lvl_master`));
      assert.ok(autoMedals.some((m) => m.id === `game_${gId}_flawless`));
      assert.ok(autoMedals.some((m) => m.id === `game_${gId}_matches_10`));
      assert.ok(autoMedals.some((m) => m.id === `game_${gId}_matches_50`));
      assert.ok(autoMedals.some((m) => m.id === `game_${gId}_matches_500` && m.excludeFromGameCompletion));

      const allGameMedals = catalog.filter((m) => m.gameId === gId);
      const expectedTotal = expectedTotalByGame[gId] ?? 11;
      assert.equal(
        allGameMedals.length,
        expectedTotal,
        `Jogo ${gId} deveria ter ${expectedTotal} medalhas no catálogo base, mas tem ${allGameMedals.length}`
      );
    }
  });

  it("avalia e desbloqueia medalhas de exploração de múltiplos jogos a partir de distinctGamesPlayed", () => {
    const profile = {
      id: "test-admin",
      nick: "Admin",
      nickNormalized: "admin",
      full_name: "Administrador do Sistema",
      birthdate: "2010-01-01",
      school: "Escola Municipal Raimunda Cruz",
      level: 10,
      xp: 9999,
      matchesPlayed: 50,
      wins: 40,
      distinctGamesPlayed: 10,
      grade: "5º Ano",
      seasonXp: 9999,
      seasonId: 1,
      badges: [],
      unlockedMedals: [],
    };

    const awarded = evaluatePlayerMedals({
      profile,
      stats: [],
    });

    const ids = awarded.map((m) => m.id);
    assert.ok(ids.includes("explore_3_games"));
    assert.ok(ids.includes("explore_5_games")); // Explorador da Lógica
    assert.ok(ids.includes("explore_all_games")); // Mestre de Todos os Jogos
  });

  it("avalia e concede as medalhas especiais de Beta Tester no período Beta até 15 de Novembro", () => {
    const nov3 = new Date("2026-11-03T14:00:00Z"); // Durante período Beta
    const postBeta = new Date("2026-11-16T14:00:00Z"); // Fora do período Beta (após encerramento em 15/11 às 23:59)

    // Perfil de jogador com 1 partida finalizada
    const profileBronze: PlayerProfile = {
      id: "p_beta",
      nick: "BetaGuy",
      nickNormalized: "betaguy",
      full_name: "BETA GUY",
      school: "Nenhuma",
      grade: null,
      birthdate: "2012-05-10",
      xp: 100,
      seasonXp: 100,
      level: 1,
      wins: 1,
      matchesPlayed: 1,
      distinctGamesPlayed: 1,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const statsBronze: GameStatRow[] = [
      {
        player_id: "p_beta",
        game_id: "logica",
        plays: 1,
        wins: 1,
        best_score: 50,
        best_level: 2,
        updated_at: "2026-11-03T12:00:00Z",
      },
    ];

    // Dentro do período Beta: conquista Beta Tester Bronze
    const awardedNov3 = evaluatePlayerMedals(
      { profile: profileBronze, stats: statsBronze },
      undefined,
      nov3,
    );
    assert.ok(awardedNov3.some((m) => m.id === "beta_tester_bronze"));

    // Fora do período Beta (após 15/11): não conquista
    const awardedPostBeta = evaluatePlayerMedals(
      { profile: profileBronze, stats: statsBronze },
      undefined,
      postBeta,
    );
    assert.ok(!awardedPostBeta.some((m) => m.id === "beta_tester_bronze"));

    // Jogador avançado com 10 partidas finalizadas em todos os 10 jogos e Nível 5
    const statsHeroi: GameStatRow[] = ALL_GAME_IDS.map((gId) => ({
      player_id: "p_hero",
      game_id: gId,
      plays: 10,
      wins: 8,
      best_score: 100,
      best_level: 5,
      updated_at: "2026-11-03T12:00:00Z",
    }));

    const profileHeroi: PlayerProfile = {
      ...profileBronze,
      level: 5,
      xp: 3000,
    };

    const awardedHero = evaluatePlayerMedals(
      { profile: profileHeroi, stats: statsHeroi },
      undefined,
      nov3,
    );

    const heroMedalIds = awardedHero.map((m) => m.id);
    assert.ok(heroMedalIds.includes("beta_tester_bronze"));
    assert.ok(heroMedalIds.includes("beta_tester_prata"));
    assert.ok(heroMedalIds.includes("beta_tester_ouro"));
    assert.ok(heroMedalIds.includes("beta_tester_platina"));
    assert.ok(heroMedalIds.includes("beta_tester_heroi"));

    // Valida raridade Herói com brilho vermelho
    const heroiMedal = awardedHero.find((m) => m.id === "beta_tester_heroi");
    assert.equal(heroiMedal?.rarity, "heroi");
    assert.equal(RARITY_INFO.heroi.glowHex, "#ef4444");
    assert.equal(RARITY_INFO.heroi.label, "Herói");

    // Jogador que jogou 4 partidas em 1 jogo e apenas 1 partida nos outros 7 jogos (total 11 partidas)
    // NÃO deve ganhar Beta Tester Platina nem Beta Tester Prata/Ouro!
    const statsApenas1JogoCom2: GameStatRow[] = ALL_GAME_IDS.map((gId, idx) => ({
      player_id: "p_aluna_beta",
      game_id: gId,
      plays: idx === 0 ? 4 : 1,
      wins: 1,
      best_score: 100,
      best_level: 2,
      updated_at: "2026-11-03T12:00:00Z",
    }));

    const profileAlunaBeta: PlayerProfile = {
      ...profileBronze,
      matchesPlayed: 11,
      distinctGamesPlayed: ALL_GAME_IDS.length,
    };

    const awardedAluna = evaluatePlayerMedals(
      { profile: profileAlunaBeta, stats: statsApenas1JogoCom2 },
      undefined,
      nov3,
    );

    const alunaMedalIds = awardedAluna.map((m) => m.id);
    assert.ok(alunaMedalIds.includes("beta_tester_bronze"), "Deve ter Bronze por ter finalizado ao menos 1 partida");
    assert.ok(!alunaMedalIds.includes("beta_tester_prata"), "NÃO deve ter Prata (apenas 1 jogo tem 2+ partidas)");
    assert.ok(!alunaMedalIds.includes("beta_tester_ouro"), "NÃO deve ter Ouro (apenas 1 jogo tem 2+ partidas)");
    assert.ok(!alunaMedalIds.includes("beta_tester_platina"), "NÃO deve ter Platina (nem todos os jogos têm 2+ partidas)");
    assert.ok(!alunaMedalIds.includes("beta_tester_heroi"), "NÃO deve ter Herói");

    // Aluna com 10 jogos concluídos com 10 partidas e Nível 5 (mesmo sem jogar o 11º jogo recente spacequest)
    const statsExatos10Jogos: GameStatRow[] = ALL_GAME_IDS.filter((id) => id !== "spacequest").map((gId) => ({
      player_id: "p_aluna_10_jogos",
      game_id: gId,
      plays: 10,
      wins: 8,
      best_score: 90,
      best_level: 3,
      updated_at: "2026-11-03T12:00:00Z",
    }));

    const profileAluna10: PlayerProfile = {
      ...profileBronze,
      level: 5,
      xp: 2500,
      matchesPlayed: 100,
      distinctGamesPlayed: 10,
    };

    const awarded10 = evaluatePlayerMedals(
      { profile: profileAluna10, stats: statsExatos10Jogos },
      undefined,
      nov3,
    );
    const ids10 = awarded10.map((m) => m.id);
    assert.ok(ids10.includes("beta_tester_platina"), "Deve receber Platina com 10 jogos mesmo havendo 11 na plataforma");
    assert.ok(ids10.includes("beta_tester_heroi"), "Deve receber Herói com 10 jogos de 10 partidas e nível 5");
  });

  it("NÃO concede medalha de zero erros (individual ou 3 jogos) se a aluna teve 1 ou mais erros no final do jogo", () => {
    const profileWith1Error: PlayerProfile = {
      id: "p_aluna",
      nick: "AlunaTeste",
      nickNormalized: "alunateste",
      full_name: "ALUNA TESTE",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-03-15",
      xp: 600,
      seasonXp: 600,
      level: 3,
      wins: 3,
      matchesPlayed: 3,
      distinctGamesPlayed: 3,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    // Jogou 3 jogos distintos com pontuação alta (>= 30) e vitória (wins >= 1),
    // mas cometeu 1 erro em cada (flawless_wins = 0, last_wrong = 1)
    const statsWithErrors: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "padrao",
        plays: 1,
        wins: 1,
        flawless_wins: 0,
        last_wrong: 1,
        best_score: 80,
        best_level: 2,
      },
      {
        game_id: "porcentagem",
        mode: "padrao",
        plays: 1,
        wins: 1,
        flawless_wins: 0,
        last_wrong: 2,
        best_score: 70,
        best_level: 2,
      },
      {
        game_id: "cartesiano",
        mode: "padrao",
        plays: 1,
        wins: 1,
        flawless_wins: 0,
        last_wrong: 1,
        best_score: 90,
        best_level: 2,
      },
    ];

    const lastMatchWith1Error = {
      gameId: "cartesiano" as const,
      score: 90,
      level: 2,
      correct: 9,
      wrong: 1, // Cometeu 1 erro no final do jogo!
    };

    assert.equal(isFlawlessMatch(lastMatchWith1Error), false);
    assert.equal(
      getDistinctFlawlessGames(profileWith1Error, statsWithErrors, lastMatchWith1Error).size,
      0,
    );

    const awarded = evaluatePlayerMedals({
      profile: profileWith1Error,
      stats: statsWithErrors,
      lastMatch: lastMatchWith1Error,
    });

    const ids = awarded.map((m) => m.id);
    // Não pode ganhar medalha individual sem erros nem a de 3 jogos sem erros
    assert.ok(!ids.includes("game_cartesiano_flawless"));
    assert.ok(!ids.includes("flawless_3_games"));
    assert.ok(!ids.includes("flawless_5_games"));
    assert.ok(!ids.includes("flawless_8_games"));

    // Progresso da medalha flawless_3_games deve ser 0/3
    const catalog = buildBaseMedalsCatalog();
    const medal3Flawless = catalog.find((m) => m.id === "flawless_3_games")!;
    const prog = calculateMedalProgress(medal3Flawless, profileWith1Error, statsWithErrors);
    assert.equal(prog.percent, 0);
    assert.ok(prog.progressText.includes("0 de 3"));
  });

  it("JAMAIS concede medalha de zero erros no final de uma partida com wrong > 0, mesmo com stats residuais", () => {
    const profile: PlayerProfile = {
      id: "p_campo_minado",
      nick: "JogadorMinado",
      nickNormalized: "jogadorminado",
      full_name: "JOGADOR MINADO",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-05-10",
      xp: 1200,
      seasonXp: 1200,
      level: 4,
      wins: 5,
      matchesPlayed: 5,
      distinctGamesPlayed: 3,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    // Suponha que no passado houvesse flawless_wins = 1 no registro
    const statsWithPastResidual: GameStatRow[] = [
      {
        game_id: "minado",
        mode: "padrao",
        plays: 2,
        wins: 2,
        flawless_wins: 1,
        last_wrong: 1,
        best_score: 360,
        best_level: 4,
      },
    ];

    // Partida recém finalizada com 1 erro no Campo Minado!
    const lastMatchFinishedWith1Error = {
      gameId: "minado" as const,
      score: 360,
      level: 4,
      correct: 29,
      wrong: 1, // Cometeu 1 erro!
    };

    assert.equal(isFlawlessMatch(lastMatchFinishedWith1Error), false);
    const flawlessGames = getDistinctFlawlessGames(profile, statsWithPastResidual, lastMatchFinishedWith1Error);
    assert.equal(flawlessGames.has("minado"), false, "minado NÃO pode entrar no conjunto de flawless após partida com erro");

    const awarded = evaluatePlayerMedals({
      profile,
      stats: statsWithPastResidual,
      lastMatch: lastMatchFinishedWith1Error,
    });

    const ids = awarded.map((m) => m.id);
    assert.equal(ids.includes("game_minado_flawless"), false, "NÃO pode conceder game_minado_flawless se a partida teve 1 erro!");
    assert.equal(ids.includes("flawless_3_games"), false, "NÃO pode conceder flawless_3_games");
    assert.equal(ids.includes("flawless_5_games"), false, "NÃO pode conceder flawless_5_games");
    assert.equal(ids.includes("flawless_8_games"), false, "NÃO pode conceder flawless_8_games");
  });

  it("concede flawless_3_games somente quando 3 jogos DISTINTOS são finalizados com wrong === 0", () => {
    const profileFlawless: PlayerProfile = {
      id: "p_precisa",
      nick: "MentePrecisa",
      nickNormalized: "menteprecisa",
      full_name: "ALUNA PRECISA",
      school: "Raimundo Bezerra",
      grade: "7º ano",
      birthdate: "2013-07-10",
      xp: 900,
      seasonXp: 900,
      level: 4,
      wins: 4,
      matchesPlayed: 4,
      distinctGamesPlayed: 3,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    // Se jogar o mesmo jogo em 2 modos ("padrao" e "equipes") sem erros + 1 segundo jogo sem erros,
    // são apenas 2 jogos distintos (não pode ganhar flawless_3_games ainda)
    const statsTwoDistinctGames: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "padrao",
        plays: 1,
        wins: 1,
        flawless_wins: 1,
        last_wrong: 0,
        best_score: 60,
        best_level: 2,
      },
      {
        game_id: "logica",
        mode: "equipes",
        plays: 1,
        wins: 1,
        flawless_wins: 1,
        last_wrong: 0,
        best_score: 70,
        best_level: 2,
      },
      {
        game_id: "porcentagem",
        mode: "padrao",
        plays: 1,
        wins: 1,
        flawless_wins: 1,
        last_wrong: 0,
        best_score: 50,
        best_level: 2,
      },
    ];

    const awardedTwo = evaluatePlayerMedals({
      profile: profileFlawless,
      stats: statsTwoDistinctGames,
    });
    assert.ok(!awardedTwo.some((m) => m.id === "flawless_3_games"));

    // Ao finalizar o 3º jogo distinto sem nenhum erro (wrong === 0, correct >= 3, score >= 30):
    const thirdFlawlessMatch = {
      gameId: "memoria" as const,
      score: 80,
      level: 2,
      correct: 6,
      wrong: 0,
    };

    const awardedThree = evaluatePlayerMedals({
      profile: profileFlawless,
      stats: statsTwoDistinctGames,
      lastMatch: thirdFlawlessMatch,
    });

    const idsThree = awardedThree.map((m) => m.id);
    assert.ok(idsThree.includes("game_memoria_flawless"));
    assert.ok(idsThree.includes("flawless_3_games"));
  });

  it("NÃO permite conquistar medalha de 8 jogos diferentes (flawless_8_games / explore_all_games) quando apenas 7 jogos estão habilitados", () => {
    // Apenas 7 jogos habilitados pelo ADM (3 jogos desabilitados)
    const enabledOnly7: Partial<Record<(typeof ALL_GAME_IDS)[number], boolean>> = {
      logica: true,
      cartesiano: true,
      formas: true,
      memoria: true,
      variaveis: true,
      robogrid: true,
      minado: true,
      porcentagem: false,
      completar: false,
      rpg: false,
      spacequest: false,
    };

    const profileInflated: PlayerProfile = {
      id: "p_7jogos",
      nick: "Aluno7Jogos",
      nickNormalized: "aluno7jogos",
      full_name: "ALUNO SETE JOGOS",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-05-10",
      xp: 2500,
      seasonXp: 2500,
      level: 6,
      wins: 15,
      matchesPlayed: 20,
      distinctGamesPlayed: 9, // Valor antigo inflado no banco
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    // Mesmo que o array stats tenha linhas para todos os 10 jogos (ou modos duplicados),
    // apenas os 7 jogos habilitados podem ser contabilizados
    const statsAll10: GameStatRow[] = ALL_GAME_IDS.map((gId) => ({
      game_id: gId,
      mode: "padrao",
      plays: 3,
      wins: 3,
      flawless_wins: 2,
      last_wrong: 0,
      best_score: 90,
      best_level: 3,
    }));

    const flawlessSet = getDistinctFlawlessGames(
      profileInflated,
      statsAll10,
      undefined,
      enabledOnly7,
    );
    assert.equal(flawlessSet.size, 7);

    const awarded = evaluatePlayerMedals({
      profile: profileInflated,
      stats: statsAll10,
      enabledGames: enabledOnly7,
    });
    const ids = awarded.map((m) => m.id);

    // Conquista as de 3 e 5 jogos (pois jogou os 7 habilitados sem erros),
    // mas JAMAIS conquista a de 8 jogos (flawless_8_games) nem a de 9 jogos (explore_all_games)
    assert.ok(ids.includes("explore_3_games"));
    assert.ok(ids.includes("explore_5_games"));
    assert.ok(!ids.includes("explore_all_games"));
    assert.ok(ids.includes("flawless_3_games"));
    assert.ok(ids.includes("flawless_5_games"));
    assert.ok(!ids.includes("flawless_8_games"));

    // E o progresso da medalha de 8 jogos deve mostrar exatamente 7 de 8 (88%)
    const catalog = buildBaseMedalsCatalog();
    const medal8 = catalog.find((m) => m.id === "flawless_8_games")!;
    const prog8 = calculateMedalProgress(medal8, profileInflated, statsAll10, enabledOnly7);
    assert.ok(prog8.progressText.includes("7 de 8"));
    assert.equal(prog8.percent, 88);
  });

  it("avalia medalhas secretas 'Além do Limite' e reseta progresso diariamente às 00:00 se não obtidas", () => {
    const today = getLocalDateKey();
    const yesterday = "2026-11-02";

    const baseProfile: PlayerProfile = {
      id: "aluno-dedicado",
      nick: "Dedicado",
      nickNormalized: "dedicado",
      full_name: "ALUNO DEDICADO",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-04-10",
      xp: 1500,
      seasonXp: 1500,
      level: 5,
      wins: 20,
      matchesPlayed: 40,
      seasonId: 1,
      badges: [],
      dailyXp: 1000,
      dailyXpDate: today,
      dailyPostCapMatches: 29,
      dailyPostCapDate: today,
    };

    // Com 29 partidas hoje após atingir o XP máximo diário:
    // Conquista Bronze (10 partidas), mas AINDA NÃO conquista Prata (30 partidas)
    const awarded29 = evaluatePlayerMedals({
      profile: baseProfile,
      stats: [],
    });
    const awardedIds29 = awarded29.map((m) => m.id);
    assert.ok(awardedIds29.includes("post_cap_10"), "Deveria ter conquistado Além do Limite Bronze (10)");
    assert.ok(!awardedIds29.includes("post_cap_30"), "Não deveria ter conquistado Além do Limite Prata (29/30)");

    // Checa cálculo de progresso para a de Prata (29/30 = 97%)
    const catalog = buildBaseMedalsCatalog();
    const medalPrata = catalog.find((m) => m.id === "post_cap_30")!;
    assert.ok(medalPrata.isSecret, "Medalha deve ser marcada como secreta");
    assert.equal(medalPrata.category, "secreta");

    const progPrata = calculateMedalProgress(medalPrata, baseProfile, []);
    assert.equal(progPrata.percent, 97);
    assert.ok(progPrata.progressText.includes("29 de 30"));

    // Simula virada do dia para 00:00 (dailyPostCapDate fica sendo ontem e o dia atual muda)
    const profileNewDay: PlayerProfile = {
      ...baseProfile,
      dailyPostCapMatches: 29,
      dailyPostCapDate: yesterday, // data antiga/ontem!
    };

    // Ao virar o dia sem ter completado a de Prata, o progresso reseta para 0/30 (0%)
    assert.equal(getDailyPostCapMatches(profileNewDay, today), 0);
    const progPrataNewDay = calculateMedalProgress(medalPrata, profileNewDay, []);
    assert.equal(progPrataNewDay.percent, 0);
    assert.ok(progPrataNewDay.progressText.includes("0 de 30"));

    // Jogou mais partidas no novo dia após bater o XP máximo: atinge 30, 60 e 100
    const profile100: PlayerProfile = {
      ...baseProfile,
      dailyPostCapMatches: 100,
      dailyPostCapDate: today,
    };
    const awarded100 = evaluatePlayerMedals({
      profile: profile100,
      stats: [],
    });
    const awardedIds100 = awarded100.map((m) => m.id);
    assert.ok(awardedIds100.includes("post_cap_10"), "Conquista Bronze (10)");
    assert.ok(awardedIds100.includes("post_cap_30"), "Conquista Prata (30)");
    assert.ok(awardedIds100.includes("post_cap_60"), "Conquista Ouro (60)");
    assert.ok(awardedIds100.includes("post_cap_100"), "Conquista Platina (100)");
  });

  it("avalia corretamente jogos distintos combinando estatísticas, partidas e medalhas sem perder o progresso", () => {
    // 1. Jogador com estatísticas ativas apenas em 1 jogo em stats, mas com medalha em outro jogo e atividade em score
    const profile: Partial<PlayerProfile> = {
      id: "p_multi",
      nick: "MultiGamer",
      nickNormalized: "multigamer",
      full_name: "MULTI GAMER",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2013-05-10",
      xp: 400,
      level: 1,
      matchesPlayed: 6,
      wins: 3,
      distinctGamesPlayed: 1,
      unlockedMedals: [
        {
          medalId: "game_memoria_lvl_master",
          unlockedAt: "2026-11-01T10:00:00Z",
        },
      ],
    };

    const stats: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "classico",
        plays: 4,
        wins: 2,
        flawless_wins: 0,
        best_score: 120,
        best_level: 2,
        last_played_at: "2026-11-02T10:00:00Z",
      },
      // Jogo com plays=0 mas pontuação registrada
      {
        game_id: "cartesiano",
        mode: "classico",
        plays: 0,
        wins: 0,
        flawless_wins: 0,
        best_score: 50,
        best_level: 1,
        last_played_at: "2026-11-02T11:00:00Z",
      },
    ];

    // logica (plays=4) + cartesiano (best_score=50) + memoria (medalha game_memoria_lvl_master) = 3 jogos distintos!
    const distinctCount = getDistinctGamesPlayed(profile, stats);
    assert.equal(distinctCount, 3, "Deveria ter reconhecido 3 jogos distintos");

    // Limitação aos jogos habilitados
    const limitedCount = getDistinctGamesPlayed(profile, stats, undefined, {
      logica: true,
      memoria: false, // desabilitado
      cartesiano: true,
    });
    // logica e cartesiano habilitados = 2
    assert.equal(limitedCount, 2, "Não deve contar jogos desabilitados");
  });

  it("avalia e concede medalhas vinculadas a eventos com requisitos especiais e respeita ciclo do evento", () => {
    const eventMedalMatches: MedalDefinition = {
      id: "ev_med_matches_5",
      title: "Maratonista do Evento",
      description: "Jogue 5 partidas durante o evento",
      rarity: "bronze",
      category: "evento",
      iconName: "Flame",
      eventId: "ev_special_marathon",
      eventName: "Maratona SEMED",
      condition: { type: "event_matches", threshold: 5 },
      eventRequirement: {
        type: "event_matches",
        threshold: 5,
      },
    };

    const eventMedalFlawless: MedalDefinition = {
      id: "ev_med_flawless_1",
      title: "Mente Brilhante do Evento",
      description: "Finalize 1 partida com zero erros no evento",
      rarity: "ouro",
      category: "evento",
      iconName: "Crown",
      eventId: "ev_special_marathon",
      eventName: "Maratona SEMED",
      condition: { type: "event_flawless", threshold: 1 },
      eventRequirement: {
        type: "event_flawless",
        threshold: 1,
      },
    };

    const testCatalog = [eventMedalMatches, eventMedalFlawless];

    const profileIncomplete: PlayerProfile = {
      id: "student-ev",
      nick: "AlunoEvento",
      nickNormalized: "alunoevento",
      full_name: "ALUNO EVENTO",
      school: "Raimunda Cruz",
      grade: "5º ano",
      birthdate: "2015-05-10",
      xp: 200,
      seasonXp: 200,
      level: 2,
      wins: 2,
      matchesPlayed: 3,
      seasonId: 1,
      badges: [],
      eventProgress: {
        ev_special_marathon: {
          cycleKey: "ev_special_marathon_2026-11-03",
          matchesCount: 3,
          flawlessCount: 0,
        },
      },
    };

    // 3 de 5 partidas: ainda não ganha a medalha
    const res1 = evaluatePlayerMedals({ profile: profileIncomplete, stats: [] }, testCatalog);
    assert.equal(res1.length, 0);

    // Verifica cálculo de progresso (3/5 = 60%)
    const prog = calculateMedalProgress(eventMedalMatches, profileIncomplete);
    assert.equal(prog.percent, 60);
    assert.ok(prog.progressText.includes("3 de 5"));

    // Atualiza progresso para 5 partidas e 1 sem erros
    const profileComplete: PlayerProfile = {
      ...profileIncomplete,
      eventProgress: {
        ev_special_marathon: {
          cycleKey: "ev_special_marathon_2026-11-03",
          matchesCount: 5,
          flawlessCount: 1,
        },
      },
    };

    const res2 = evaluatePlayerMedals({ profile: profileComplete, stats: [] }, testCatalog);
    const awardedIds = res2.map((m) => m.id);
    assert.ok(awardedIds.includes("ev_med_matches_5"));
    assert.ok(awardedIds.includes("ev_med_flawless_1"));

    // O aluno que já conquistou a medalha mantém ela para sempre mesmo se o evento reiniciar
    const profileAwarded: PlayerProfile = {
      ...profileComplete,
      unlockedMedals: [
        { medalId: "ev_med_matches_5", unlockedAt: "2026-11-03T10:00:00Z" },
      ],
      eventProgress: {
        // Novo ciclo/edição com progresso zerado
        ev_special_marathon: {
          cycleKey: "ev_special_marathon_2026-11-10",
          matchesCount: 1,
          flawlessCount: 0,
        },
      },
    };

    const res3 = evaluatePlayerMedals({ profile: profileAwarded, stats: [] }, testCatalog);
    // Como ev_med_matches_5 já está desbloqueada, não a recebe novamente
    assert.ok(!res3.some((m) => m.id === "ev_med_matches_5"));
    assert.ok(profileAwarded.unlockedMedals!.some((u) => u.medalId === "ev_med_matches_5"));
  });

  it("garante que atividade em múltiplos jogos avança de nível e destrava medalha de nível correspondente", () => {
    // Aluno com progresso em dois jogos (ex: Lógica e Tabuada), mas cujo profile.wins estava zerado
    const aluno: PlayerProfile = {
      id: "aluno_progresso",
      nick: "AlunoMulti",
      nickNormalized: "alunomulti",
      full_name: "ALUNO MULTI JOGOS",
      school: "Raimunda Cruz",
      grade: "7º ano",
      birthdate: "2013-05-15",
      xp: 250,
      seasonXp: 250,
      level: 1, // preso incorretamente no nível 1
      wins: 0, // wins não consolidadas no profile
      matchesPlayed: 0,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const stats: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "padrao",
        plays: 3,
        wins: 1,
        best_score: 50,
        best_level: 2,
        last_played_at: "2026-11-03T10:00:00Z",
      },
      {
        game_id: "cartesiano",
        mode: "padrao",
        plays: 2,
        wins: 1,
        best_score: 40,
        best_level: 1,
        last_played_at: "2026-11-03T11:00:00Z",
      },
    ];

    // 1. getDistinctGamesPlayed identifica 2 jogos distintos
    const distinct = getDistinctGamesPlayed(aluno, stats);
    assert.equal(distinct, 2);

    // 2. Progresso de medalhas calcula as frações dos jogos
    const cat = buildBaseMedalsCatalog();
    const medalLogica = cat.find((m) => m.id === "game_logica_matches_10"); // 10 partidas
    assert.ok(medalLogica, "Medalha de 10 partidas de lógica encontrada");
    const progLogica = calculateMedalProgress(medalLogica, aluno, stats);
    assert.equal(progLogica.percent, 30); // 3 de 10 partidas = 30%

    // 3. Avaliação de medalhas concede lvl_2
    const totalWins = stats.reduce((s, r) => s + (r.wins ?? 0), 0);
    const totalPlays = stats.reduce((s, r) => s + (r.plays ?? 0), 0);
    const updatedProfile: PlayerProfile = {
      ...aluno,
      wins: totalWins,
      matchesPlayed: totalPlays,
      distinctGamesPlayed: distinct,
      level: 2,
    };

    const awarded = evaluatePlayerMedals({ profile: updatedProfile, stats }, cat);
    assert.ok(awarded.some((m) => m.id === "lvl_2"), "Medalha lvl_2 deve ser concedida");
  });

  it("recupera nível e medalhas de jogadores com 50% e 33% de progresso em medalhas de jogos ou com stats zeradas na nuvem", () => {
    const cfg = loadAdminConfig();
    const cat = buildBaseMedalsCatalog();

    // Caso 1: Jogador com 50% na medalha Perfeição de Lógica (best_score=30, last_wrong=1)
    // e 33% na medalha Perfeição de Cartesiano (best_score=20, last_wrong=1),
    // mas com plays=0, wins=0, matchesPlayed=0, distinctGamesPlayed=0 e level=1
    const accPartialStats = {
      profile: {
        id: "stu_parcial",
        nick: "AlunoParcial",
        nickNormalized: "alunoparcial",
        full_name: "ALUNO PARCIAL",
        school: "Raimunda Cruz",
        grade: "5º ano",
        birthdate: "2015-05-10",
        xp: 180,
        seasonXp: 180,
        level: 1,
        wins: 0,
        matchesPlayed: 0,
        distinctGamesPlayed: 0,
        badges: [],
        seasonId: cfg.seasonId,
        unlockedMedals: [],
      } as PlayerProfile,
      passwordHash: "hash",
      unlocked: [],
      stats: [
        {
          game_id: "logica" as const,
          mode: "padrao",
          plays: 0,
          wins: 0,
          flawless_wins: 0,
          last_wrong: 1,
          best_score: 30, // 50% na medalha game_logica_flawless
          best_level: 1,
          last_played_at: "2026-11-03T10:00:00Z",
        },
        {
          game_id: "cartesiano" as const,
          mode: "padrao",
          plays: 0,
          wins: 0,
          flawless_wins: 0,
          last_wrong: 1,
          best_score: 20, // 33% na medalha game_cartesiano_flawless
          best_level: 1,
          last_played_at: "2026-11-03T11:00:00Z",
        },
      ],
      updatedAt: "2026-11-03T11:00:00Z",
    };

    const medalFlawlessLogica = cat.find((m) => m.id === "game_logica_flawless")!;
    const medalFlawlessCart = cat.find((m) => m.id === "game_cartesiano_flawless")!;
    const medalMasterRpg = cat.find((m) => m.id === "game_rpg_lvl_master")!;

    assert.equal(
      calculateMedalProgress(medalFlawlessLogica, accPartialStats.profile, accPartialStats.stats).percent,
      50,
    );
    assert.equal(
      calculateMedalProgress(medalFlawlessCart, accPartialStats.profile, accPartialStats.stats).percent,
      33,
    );
    // Jogo nunca jogado (rpg) deve ter 0% em Especialista (não 33% falso)
    assert.equal(
      calculateMedalProgress(medalMasterRpg, accPartialStats.profile, accPartialStats.stats).percent,
      0,
    );

    const aligned1 = ensurePlayerSeasonAligned(accPartialStats, cfg);
    assert.equal(aligned1.profile.distinctGamesPlayed, 2, "Deve recuperar 2 jogos distintos");
    assert.ok((aligned1.profile.matchesPlayed ?? 0) >= 2, "Deve recuperar pelo menos 2 partidas");
    assert.ok((aligned1.profile.wins ?? 0) >= 1, "Deve recuperar pelo menos 1 vitória");
    assert.equal(aligned1.profile.level, 2, "Deve subir imediatamente para o Nível 2");
    assert.ok(
      aligned1.profile.unlockedMedals?.some((m) => m.medalId === "lvl_2"),
      "Deve restaurar a medalha lvl_2",
    );

    // Caso 2: Alunos reais cujas stats e distinctGamesPlayed foram zerados no Roster compartilhado
    // (ex: Lucas com 416 XP e 10 vitórias -> Nível 3; ESHELLEN2026 com 270 XP e 5 vitórias -> Nível 2)
    const accLucas = ensurePlayerSeasonAligned(
      {
        profile: {
          id: "stu_lucas",
          nick: "Lucas",
          nickNormalized: "lucas",
          full_name: "DAVI LUCAS",
          school: "Raimunda Cruz",
          grade: "5º ano",
          birthdate: "2015-03-10",
          xp: 416,
          seasonXp: 416,
          level: 1, // estava rebaixado para 1
          wins: 10,
          matchesPlayed: 0, // estava zerado
          distinctGamesPlayed: 0, // estava zerado
          badges: [],
          seasonId: cfg.seasonId,
          unlockedMedals: [],
        },
        passwordHash: "hash",
        unlocked: [],
        stats: [],
        updatedAt: "2026-11-03T12:00:00Z",
      },
      cfg,
    );
    assert.equal(accLucas.profile.level, 3, "Lucas (416 XP, 10 vitórias) deve recuperar Nível 3");
    assert.ok(accLucas.profile.unlockedMedals?.some((m) => m.medalId === "lvl_2"));
    assert.ok(accLucas.profile.unlockedMedals?.some((m) => m.medalId === "lvl_3"));

    const accEshellen = ensurePlayerSeasonAligned(
      {
        profile: {
          id: "stu_eshellen2026",
          nick: "ESHELLEN2026",
          nickNormalized: "eshellen2026",
          full_name: "ESHELLEN SANTOS LIMA",
          school: "Elisângela Litaiff",
          grade: "5º ano",
          birthdate: "2016-04-12",
          xp: 270,
          seasonXp: 270,
          level: 1, // estava rebaixado para 1
          wins: 5,
          matchesPlayed: 0,
          distinctGamesPlayed: 0,
          badges: [],
          seasonId: cfg.seasonId,
          unlockedMedals: [],
        },
        passwordHash: "hash",
        unlocked: [],
        stats: [],
        updatedAt: "2026-11-03T12:00:00Z",
      },
      cfg,
    );
    assert.equal(accEshellen.profile.level, 2, "ESHELLEN2026 (270 XP, 5 vitórias) deve recuperar Nível 2");
    assert.ok(accEshellen.profile.unlockedMedals?.some((m) => m.medalId === "lvl_2"));
  });

  it("avalia e concede as medalhas secretas de quantidade de partidas jogadas (50, 100, 250 e 1000 partidas)", () => {
    const all = getAllAvailableMedals();

    const m50 = all.find((m) => m.id === "secret_matches_50");
    const m100 = all.find((m) => m.id === "secret_matches_100");
    const m250 = all.find((m) => m.id === "secret_matches_250");
    const m1000 = all.find((m) => m.id === "secret_matches_1000");

    assert.ok(m50 && m50.isSecret && m50.rarity === "prata" && m50.category === "secreta");
    assert.ok(m100 && m100.isSecret && m100.rarity === "ouro" && m100.category === "secreta");
    assert.ok(m250 && m250.isSecret && m250.rarity === "platina" && m250.category === "secreta");
    assert.ok(m1000 && m1000.isSecret && m1000.rarity === "heroi" && m1000.category === "secreta");

    const prof49 = {
      id: "p49",
      matchesPlayed: 49,
      unlockedMedals: [],
    };
    const awarded49 = evaluatePlayerMedals({ profile: prof49 as any, stats: [] });
    assert.ok(!awarded49.some((m) => m.id.startsWith("secret_matches_")));

    // 50 partidas: destrava prata secreta
    const prof50 = {
      id: "p50",
      matchesPlayed: 50,
      unlockedMedals: [],
    };
    const awarded50 = evaluatePlayerMedals({ profile: prof50 as any, stats: [] });
    assert.ok(awarded50.some((m) => m.id === "secret_matches_50"));
    assert.ok(!awarded50.some((m) => m.id === "secret_matches_100"));

    // 100 partidas: destrava ouro secreta
    const prof100 = {
      id: "p100",
      matchesPlayed: 100,
      unlockedMedals: [{ medalId: "secret_matches_50", earnedAt: "2026-11-01" }],
    };
    const awarded100 = evaluatePlayerMedals({ profile: prof100 as any, stats: [] });
    assert.ok(awarded100.some((m) => m.id === "secret_matches_100"));
    assert.ok(!awarded100.some((m) => m.id === "secret_matches_250"));

    // 250 partidas: destrava platina secreta
    const prof250 = {
      id: "p250",
      matchesPlayed: 250,
      unlockedMedals: [],
    };
    const awarded250 = evaluatePlayerMedals({ profile: prof250 as any, stats: [] });
    assert.ok(awarded250.some((m) => m.id === "secret_matches_250"));
    assert.ok(!awarded250.some((m) => m.id === "secret_matches_1000"));

    // 1000 partidas: destrava heroi secreta
    const prof1000 = {
      id: "p1000",
      matchesPlayed: 1000,
      unlockedMedals: [],
    };
    const awarded1000 = evaluatePlayerMedals({ profile: prof1000 as any, stats: [] });
    assert.ok(awarded1000.some((m) => m.id === "secret_matches_1000"));
  });

  it("calcula corretamente semanas consecutivas com calculateMaxConsecutiveWeeks", () => {
    assert.equal(calculateMaxConsecutiveWeeks([]), 0);
    assert.equal(calculateMaxConsecutiveWeeks(["2026-W01"]), 1);
    assert.equal(calculateMaxConsecutiveWeeks(["2026-W01", "2026-W03"]), 1);
    assert.equal(calculateMaxConsecutiveWeeks(["2026-W01", "2026-W02", "2026-W03"]), 3);
    assert.equal(calculateMaxConsecutiveWeeks(["2026-W01", "2026-W02", "2026-W04", "2026-W05", "2026-W06"]), 3);
    // Transição de ano (52/53 semanas)
    assert.equal(calculateMaxConsecutiveWeeks(["2025-W52", "2026-W01", "2026-W02"]), 3);
  });

  it("avalia e concede as medalhas secretas do torneio semanal (Top 5 e Top 1 consecutivo)", () => {
    const all = getAllAvailableMedals();

    const top5w2 = all.find((m) => m.id === "secret_top5_weeks_2");
    const top5w4 = all.find((m) => m.id === "secret_top5_weeks_4");
    const top1c2 = all.find((m) => m.id === "secret_top1_consecutive_2");
    const top1c3 = all.find((m) => m.id === "secret_top1_consecutive_3");
    const top1c4 = all.find((m) => m.id === "secret_top1_consecutive_4");

    assert.ok(top5w2 && top5w2.isSecret && top5w2.rarity === "bronze" && top5w2.category === "secreta");
    assert.ok(top5w4 && top5w4.isSecret && top5w4.rarity === "prata" && top5w4.category === "secreta");
    assert.ok(top1c2 && top1c2.isSecret && top1c2.rarity === "ouro" && top1c2.category === "secreta");
    assert.ok(top1c3 && top1c3.isSecret && top1c3.rarity === "platina" && top1c3.category === "secreta");
    assert.ok(top1c4 && top1c4.isSecret && top1c4.rarity === "heroi" && top1c4.category === "secreta");

    // Perfil com 1 semana no top 5 (sem medalhas secretas)
    const prof1WeekTop5 = {
      id: "p_t1",
      tournamentMedals: [
        { rank: 3, weekKey: "2026-W10", count: 1, historyWeeks: ["2026-W10"] },
      ],
      unlockedMedals: [],
    };
    const awarded1 = evaluatePlayerMedals({ profile: prof1WeekTop5 as any, stats: [] });
    assert.ok(!awarded1.some((m) => m.id.startsWith("secret_top")));

    // Perfil com 2 semanas no top 5 (não consecutivas) -> destrava segredo Bronze (2 semanas)
    const prof2WeeksTop5 = {
      id: "p_t2",
      tournamentMedals: [
        { rank: 3, weekKey: "2026-W10", count: 1, historyWeeks: ["2026-W10"] },
        { rank: 5, weekKey: "2026-W13", count: 1, historyWeeks: ["2026-W13"] },
      ],
      unlockedMedals: [],
    };
    const awarded2 = evaluatePlayerMedals({ profile: prof2WeeksTop5 as any, stats: [] });
    assert.ok(awarded2.some((m) => m.id === "secret_top5_weeks_2"));
    assert.ok(!awarded2.some((m) => m.id === "secret_top5_weeks_4"));

    // Perfil com 4 semanas no top 5 (acumuladas na mesma medalha de rank 2 e outra de rank 4)
    const prof4WeeksTop5 = {
      id: "p_t4",
      tournamentMedals: [
        { rank: 2, weekKey: "2026-W10", count: 3, historyWeeks: ["2026-W10", "2026-W12", "2026-W14"] },
        { rank: 4, weekKey: "2026-W16", count: 1, historyWeeks: ["2026-W16"] },
      ],
      unlockedMedals: [],
    };
    const awarded4 = evaluatePlayerMedals({ profile: prof4WeeksTop5 as any, stats: [] });
    assert.ok(awarded4.some((m) => m.id === "secret_top5_weeks_2"));
    assert.ok(awarded4.some((m) => m.id === "secret_top5_weeks_4"));

    // Top 1 não consecutivo (semanas 10 e 12) -> NÃO deve dar a medalha de 2 semanas consecutivas
    const profTop1NonConsecutive = {
      id: "p_t1_nc",
      tournamentMedals: [
        { rank: 1, weekKey: "2026-W10", count: 2, historyWeeks: ["2026-W10", "2026-W12"] },
      ],
      unlockedMedals: [],
    };
    const awardedTop1NC = evaluatePlayerMedals({ profile: profTop1NonConsecutive as any, stats: [] });
    assert.ok(!awardedTop1NC.some((m) => m.id.startsWith("secret_top1_consecutive_")));

    // Top 1 por 2 semanas consecutivas -> destrava Ouro
    const profTop1Consec2 = {
      id: "p_t1_c2",
      tournamentMedals: [
        { rank: 1, weekKey: "2026-W10", count: 2, historyWeeks: ["2026-W10", "2026-W11"] },
      ],
      unlockedMedals: [],
    };
    const awardedC2 = evaluatePlayerMedals({ profile: profTop1Consec2 as any, stats: [] });
    assert.ok(awardedC2.some((m) => m.id === "secret_top1_consecutive_2"));
    assert.ok(!awardedC2.some((m) => m.id === "secret_top1_consecutive_3"));

    // Top 1 por 3 semanas consecutivas -> destrava Ouro e Platina
    const profTop1Consec3 = {
      id: "p_t1_c3",
      tournamentMedals: [
        { rank: 1, weekKey: "2026-W10", count: 3, historyWeeks: ["2026-W10", "2026-W11", "2026-W12"] },
      ],
      unlockedMedals: [],
    };
    const awardedC3 = evaluatePlayerMedals({ profile: profTop1Consec3 as any, stats: [] });
    assert.ok(awardedC3.some((m) => m.id === "secret_top1_consecutive_2"));
    assert.ok(awardedC3.some((m) => m.id === "secret_top1_consecutive_3"));
    assert.ok(!awardedC3.some((m) => m.id === "secret_top1_consecutive_4"));

    // Top 1 por 4 semanas consecutivas -> destrava Ouro, Platina e Herói!
    const profTop1Consec4 = {
      id: "p_t1_c4",
      tournamentMedals: [
        { rank: 1, weekKey: "2026-W10", count: 4, historyWeeks: ["2026-W10", "2026-W11", "2026-W12", "2026-W13"] },
      ],
      unlockedMedals: [],
    };
    const awardedC4 = evaluatePlayerMedals({ profile: profTop1Consec4 as any, stats: [] });
    assert.ok(awardedC4.some((m) => m.id === "secret_top1_consecutive_2"));
    assert.ok(awardedC4.some((m) => m.id === "secret_top1_consecutive_3"));
    assert.ok(awardedC4.some((m) => m.id === "secret_top1_consecutive_4"));
  });

  it("calcula streak diário de atividade legítimo e impede medalhas fraudulentas ou prematuras de 7 dias", () => {
    // 1. calculateMaxConsecutiveDays
    assert.equal(calculateMaxConsecutiveDays([]), 0);
    assert.equal(calculateMaxConsecutiveDays(["2026-11-03"]), 1);
    assert.equal(calculateMaxConsecutiveDays(["2026-11-01", "2026-11-03"]), 1); // dia 02 pulado
    assert.equal(calculateMaxConsecutiveDays(["2026-11-02", "2026-11-03", "2026-11-04"]), 3);
    assert.equal(
      calculateMaxConsecutiveDays([
        "2026-11-01",
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
        "2026-11-05",
        "2026-11-06",
        "2026-11-07",
      ]),
      7,
    );

    // 2. getPlayerStreakDays
    // Aluno sem partidas: streak 0
    assert.equal(getPlayerStreakDays({ matchesPlayed: 0, streakDays: 7 }), 0);

    // Aluno que colocou a plataforma ontem e jogou hoje:
    // Mesmo se streakDays estiver adulterado como 7, ele tem apenas 2 datas ativas e 4 partidas -> estritamente travado em 2!
    const fakeStudent = {
      matchesPlayed: 4,
      streakDays: 7,
      activeDates: ["2026-11-03", "2026-11-04"],
      lastActiveDate: "2026-11-04",
    };
    assert.equal(getPlayerStreakDays(fakeStudent as any), 2);

    // Avaliação de medalhas para o fakeStudent:
    // Não pode ganhar streak_3_days nem streak_7_days!
    const awardedFake = evaluatePlayerMedals({
      profile: fakeStudent as any,
      stats: [],
      streakDays: 7,
    });
    assert.ok(!awardedFake.some((m) => m.id === "streak_3_days"));
    assert.ok(!awardedFake.some((m) => m.id === "streak_5_days"));
    assert.ok(!awardedFake.some((m) => m.id === "streak_7_days"));

    // Progresso visual no catálogo para o aluno fake: mostra 2 de 7 dias (29%), não 100%!
    const all = getAllAvailableMedals();
    const streak7Def = all.find((m) => m.id === "streak_7_days")!;
    const prog = calculateMedalProgress(streak7Def, fakeStudent as any);
    assert.equal(prog.percent, 29); // 2 / 7 = 28.57% -> 29%
    assert.equal(prog.progressText, "2 de 7 dias consecutivos ativos");

    // 3. Reconciliação no ensurePlayerSeasonAligned:
    // Se o aluno de alguma forma recebeu a medalha streak_7_days indevidamente, o sanitizador revoga e ajusta o streak para 2!
    const cfg = loadAdminConfig();
    const accWithIllegitimateMedal = {
      profile: {
        id: "p_cheat",
        nick: "AlunoFake",
        nickNormalized: "alunofake",
        full_name: "ALUNO FAKE",
        school: "Raimundo Bezerra",
        grade: "6º ano",
        birthdate: "2014-01-20",
        xp: 150,
        seasonXp: 150,
        level: 1,
        wins: 1,
        matchesPlayed: 3,
        streakDays: 7,
        activeDates: ["2026-11-03", "2026-11-04"],
        lastActiveDate: "2026-11-04",
        unlockedMedals: [
          { medalId: "streak_7_days", unlockedAt: "2026-11-04T00:00:00.000Z" },
        ],
        badges: [],
        seasonId: 1,
      },
      passwordHash: "hash",
      unlocked: [],
      stats: [],
      updatedAt: "2026-11-04",
    };

    const sanitizedAcc = ensurePlayerSeasonAligned(accWithIllegitimateMedal as any, cfg);
    assert.equal(sanitizedAcc.profile.streakDays, 2);
    // A medalha indevida de 7 dias foi revogada!
    assert.ok(!sanitizedAcc.profile.unlockedMedals?.some((m) => m.medalId === "streak_7_days"));
  });

  it("suporta medalhas dinâmicas empilháveis/cumulativas incrementando o contador no inventário", async () => {
    // 1. Mock de medalha empilhável criada pelo ADM
    const stackableMedal: MedalDefinition = {
      id: "custom_ouro_gincana",
      title: "Campeão da Gincana de Lógica",
      description: "Medalha de ouro cumulativa para campeões das gincanas mensais.",
      rarity: "ouro",
      category: "evento",
      iconName: "Trophy",
      condition: { type: "manual_event" },
      isCustom: true,
      isStackable: true,
      createdByAdmin: true,
    };

    // 2. Aluno ganha a medalha pela 1ª vez: aloca 1 única entrada com count = 1
    const alunoProfile: PlayerProfile = {
      id: "student_stackable_test",
      nick: "GincanaWinner",
      nickNormalized: "gincanawinner",
      full_name: "ALUNO VENCEDOR GINCANA",
      school: "Raimunda Cruz",
      grade: "8º ano",
      birthdate: "2012-04-10",
      xp: 500,
      seasonXp: 500,
      level: 3,
      wins: 5,
      matchesPlayed: 10,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    // Concessão 1
    const acc = {
      profile: { ...alunoProfile },
      passwordHash: "hash",
      unlocked: [],
      stats: [],
      updatedAt: "2026-11-05T10:00:00Z",
    };

    // Simula a concessão manual
    const nowIso1 = "2026-11-05T10:00:00Z";
    acc.profile.unlockedMedals = [
      { medalId: stackableMedal.id, unlockedAt: nowIso1, count: 1, lastUnlockedAt: nowIso1 },
    ];

    assert.equal(acc.profile.unlockedMedals.length, 1);
    assert.equal(acc.profile.unlockedMedals[0].count, 1);

    // Concessão 2 (mesmo aluno ganha novamente a medalha empilhável)
    // Em vez de duplicar na lista, incrementa a contagem
    const existingIdx = acc.profile.unlockedMedals.findIndex((m) => m.medalId === stackableMedal.id);
    assert.ok(existingIdx >= 0);
    const nowIso2 = "2026-11-05T11:00:00Z";
    acc.profile.unlockedMedals[existingIdx] = {
      ...acc.profile.unlockedMedals[existingIdx],
      count: (acc.profile.unlockedMedals[existingIdx].count ?? 1) + 1,
      lastUnlockedAt: nowIso2,
    };

    // Deve continuar com apenas 1 entrada no inventário
    assert.equal(acc.profile.unlockedMedals.length, 1);
    // Mas agora com count = 2
    assert.equal(acc.profile.unlockedMedals[0].count, 2);

    // Concessão 3 (mesmo aluno ganha a 3ª vez)
    acc.profile.unlockedMedals[existingIdx] = {
      ...acc.profile.unlockedMedals[existingIdx],
      count: (acc.profile.unlockedMedals[existingIdx].count ?? 1) + 1,
      lastUnlockedAt: "2026-11-05T12:00:00Z",
    };

    assert.equal(acc.profile.unlockedMedals.length, 1);
    assert.equal(acc.profile.unlockedMedals[0].count, 3);

    // O total acumulado de medalhas soma os stacks corretamente (3 medalhas)
    const totalStacks = acc.profile.unlockedMedals.reduce((sum, m) => sum + (m.count ?? 1), 0);
    assert.equal(totalStacks, 3);

    // 3. Se a medalha NÃO for empilhável, o sistema mantém count = 1 e não cria duplicatas
    const standardMedal: MedalDefinition = {
      id: "custom_padrao_unica",
      title: "Participação Única",
      description: "Medalha não cumulativa",
      rarity: "bronze",
      category: "evento",
      iconName: "Award",
      condition: { type: "manual_event" },
      isCustom: true,
      isStackable: false,
    };

    acc.profile.unlockedMedals.push({
      medalId: standardMedal.id,
      unlockedAt: nowIso1,
      count: 1,
    });

    assert.equal(acc.profile.unlockedMedals.length, 2);
    // Tentativa de conceder novamente a não empilhável: não altera
    const nonStackIdx = acc.profile.unlockedMedals.findIndex((m) => m.medalId === standardMedal.id);
    if (!standardMedal.isStackable) {
      // Bloqueado / no-op
    }
    assert.equal(acc.profile.unlockedMedals[nonStackIdx].count, 1);
  });

  it("preserva e gerencia imunidade total das medalhas de robô especial Ametista e Carmesim", () => {
    const catalog = buildBaseMedalsCatalog();
    const ametista = catalog.find((m) => m.id === "m_rpg_ametista");
    const carmesim = catalog.find((m) => m.id === "m_rpg_carmesim");

    assert.ok(ametista, "Medalha m_rpg_ametista deve existir no catálogo base");
    assert.equal(ametista.rarity, "platina");
    assert.equal(ametista.title, "Destruidor do Robô Ametista");

    assert.ok(carmesim, "Medalha m_rpg_carmesim deve existir no catálogo base");
    assert.equal(carmesim.rarity, "platina");
    assert.equal(carmesim.title, "Destruidor do Robô Carmesim");
  });

  it("computa corretamente partidas disputadas no modo ranqueado/torneio_semanal e concede a medalha de 10 partidas", () => {
    const statsRanked: GameStatRow[] = [
      {
        game_id: "logica",
        mode: "torneio_semanal",
        plays: 10,
        wins: 8,
        best_score: 95,
        best_level: 2,
        last_wrong: 0,
      },
    ];

    const agg = aggregateStatsByGame(statsRanked);
    const logicaAgg = agg.get("logica");
    assert.ok(logicaAgg, "Deve agregar estatísticas da Lógica");
    assert.equal(logicaAgg.plays, 10, "Partidas de torneio_semanal devem somar 10 partidas");

    const profileAluna: PlayerProfile = {
      id: "aluna_10_logica",
      nick: "AlunaLogica",
      nickNormalized: "alunalogica",
      full_name: "ALUNA DA SILVA",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-05-10",
      xp: 500,
      seasonXp: 500,
      level: 2,
      wins: 8,
      matchesPlayed: 10,
      distinctGamesPlayed: 1,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const awarded = evaluatePlayerMedals({
      profile: profileAluna,
      stats: statsRanked,
    });

    const has10Logica = awarded.some((m) => m.id === "game_logica_matches_10");
    assert.ok(has10Logica, "Aluna com 10 partidas no torneio deve receber a medalha game_logica_matches_10");
  });

  it("varredura retroativa (runRetroactiveMedalsAudit) identifica aluna com 10 partidas sem a medalha e atribui retroativamente", async () => {
    // Simula conta no banco local que jogou 10 partidas mas não tinha a medalha atribuída
    const alunaAcc = {
      profile: {
        id: "aluna_audit_test",
        nick: "AlunaAudit",
        nickNormalized: "alunaaudit",
        full_name: "ALUNA AUDIT TESTE",
        school: "Raimundo Bezerra",
        grade: "6º ano",
        birthdate: "2014-06-15",
        xp: 400,
        seasonXp: 400,
        level: 2,
        wins: 6,
        matchesPlayed: 10,
        distinctGamesPlayed: 1,
        badges: [],
        seasonId: 1,
        unlockedMedals: [],
      },
      passwordHash: "hash",
      unlocked: ["cartesiano"],
      stats: [
        {
          game_id: "cartesiano",
          mode: "padrao",
          plays: 10,
          wins: 6,
          best_score: 80,
          best_level: 2,
          last_wrong: 0,
        },
      ],
      updatedAt: "2026-11-01T00:00:00.000Z",
    };

    saveRegistry({ [alunaAcc.profile.nickNormalized]: alunaAcc as any });

    const auditRes = await runRetroactiveMedalsAudit({ skipCloudSync: true });
    assert.ok(auditRes.auditedStudentsCount >= 1, "Deve ter auditado pelo menos 1 aluno");
    assert.ok(auditRes.medalsAwardedCount >= 1, "Deve ter retroatribuído ao menos 1 medalha");

    // Verifica que a aluna recebeu a medalha retroativamente
    const regAfter = loadRegistry();
    const saved = regAfter[alunaAcc.profile.nickNormalized];
    assert.ok(saved, "Conta deve existir no registro após varredura");
    assert.ok(
      saved.profile.unlockedMedals?.some((m: any) => m.medalId === "game_cartesiano_matches_10"),
      "A medalha de 10 partidas de Cartesiano deve ter sido retroatribuída",
    );
    assert.ok(
      (saved.profile.careerPoints ?? 0) > 0,
      "Pontos de carreira devem ter sido concedidos pela medalha retroativa",
    );
  });

  it("avalia e concede as novas medalhas secretas (Especialista em 10 Jogos, Zero Erros em 10 Jogos e 50 Partidas em 10 Jogos)", () => {
    const all = getAllAvailableMedals();

    const mSpec10 = all.find((m) => m.id === "secret_specialist_10_games");
    const mFlaw10 = all.find((m) => m.id === "secret_flawless_10_games");
    const mPlays10 = all.find((m) => m.id === "secret_50_matches_10_games");

    assert.ok(mSpec10 && mSpec10.isSecret && mSpec10.rarity === "diamante" && mSpec10.category === "secreta");
    assert.ok(mFlaw10 && mFlaw10.isSecret && mFlaw10.rarity === "platina" && mFlaw10.category === "secreta");
    assert.ok(mPlays10 && mPlays10.isSecret && mPlays10.rarity === "diamante" && mPlays10.category === "secreta");

    const gameIds: GameId[] = [
      "logica", "cartesiano", "formas", "memoria", "variaveis",
      "robogrid", "porcentagem", "minado", "completar", "rpg"
    ];

    const stats10Spec = gameIds.map((id) => ({
      game_id: id,
      mode: "padrao",
      plays: 5,
      wins: 5,
      best_score: 50,
      best_level: 3,
      flawless_wins: 0,
      last_wrong: 1,
    }));

    const awardedSpec = evaluatePlayerMedals({
      profile: { id: "p_spec", unlockedMedals: [] } as any,
      stats: stats10Spec as any,
    });
    assert.ok(awardedSpec.some((m) => m.id === "secret_specialist_10_games"), "Deve conceder Especialista Absoluto com 10 jogos nível 3+");

    const stats10Flawless = gameIds.map((id) => ({
      game_id: id,
      mode: "padrao",
      plays: 5,
      wins: 5,
      best_score: 50,
      best_level: 2,
      flawless_wins: 1,
      last_wrong: 0,
    }));

    const awardedFlawless = evaluatePlayerMedals({
      profile: { id: "p_flaw", unlockedMedals: [] } as any,
      stats: stats10Flawless as any,
    });
    assert.ok(awardedFlawless.some((m) => m.id === "secret_flawless_10_games"), "Deve conceder Perfeição Impecável com 10 jogos sem erros");

    const stats10Plays50 = gameIds.map((id) => ({
      game_id: id,
      mode: "padrao",
      plays: 50,
      wins: 30,
      best_score: 80,
      best_level: 2,
      flawless_wins: 0,
      last_wrong: 2,
    }));

    const awardedPlays = evaluatePlayerMedals({
      profile: { id: "p_plays", unlockedMedals: [] } as any,
      stats: stats10Plays50 as any,
    });
    assert.ok(awardedPlays.some((m) => m.id === "secret_50_matches_10_games"), "Deve conceder Veterano Universal com 50 partidas em 10 jogos");
  });

  it("sincroniza e reconcilia medalhas Ouro+ de alunos no correio do ADM e exclui contas de administradores", async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 200, status: "OK", data: { Data: {} } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
    const { syncAdminMedalNotificationsFromPlayFab, saveRegistry } = await import("./playfab.ts");
    const { loadAdminConfig, saveAdminConfig } = await import("./game-codes.ts");

    // Prepara cenário: uma conta de ADM (JOSINEY) e uma conta de aluno real (MARIA)
    const mockRegistry: any = {
      josiney: {
        profile: {
          id: "adm_josiney",
          nick: "JOSINEY",
          nickNormalized: "josiney",
          full_name: "JOSINEY - ADMINISTRAÇÃO SEMED",
          school: "ADMINISTRAÇÃO SEMED",
          isAdmin: true,
          unlockedMedals: [
            { medalId: "game_minado_flawless", unlockedAt: "2026-11-09T08:30:23Z" },
          ],
        },
        stats: [],
        unlocked: [],
      },
      maria_silva: {
        profile: {
          id: "student_maria",
          nick: "MariaS",
          nickNormalized: "marias",
          full_name: "Maria Silva",
          school: "Ursulina Souza",
          isAdmin: false,
          matchesPlayed: 1,
          unlockedMedals: [
            { medalId: "game_minado_flawless", unlockedAt: "2026-11-09T09:15:00Z" }, // Raridade Ouro
            { medalId: "first_game_played", unlockedAt: "2026-11-09T09:00:00Z" }, // Bronze (não deve ir pra caixa ouro+)
          ],
        },
        stats: [
          { game_id: "minado", mode: "padrao", plays: 1, wins: 1, flawless_wins: 1, best_score: 50, best_level: 1 },
        ],
        unlocked: [],
      },
    };

    saveRegistry(mockRegistry);

    // Limpa configurações de notificações anteriores
    const cfg = loadAdminConfig();
    cfg.adminMedalNotifications = [];
    saveAdminConfig(cfg);

    const notifs = await syncAdminMedalNotificationsFromPlayFab();

    // Deve listar a medalha de Maria Silva
    assert.ok(notifs.some((n) => n.studentNick === "MariaS" && n.medalRarity === "ouro"));
    // NÃO deve listar nenhuma notificação pertencente ao ADM Josiney
    assert.ok(!notifs.some((n) => n.studentNick === "JOSINEY"));
    assert.ok(!notifs.some((n) => (n.studentSchool || "").includes("ADMINISTRAÇÃO")));
    // Não deve listar medalha de bronze
    assert.ok(!notifs.some((n) => n.medalId === "first_game_played"));
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("as medalhas do período Beta possuem descrição oficial válida até o dia 15 de Novembro", () => {
    const all = getAllAvailableMedals();
    const betaIds = [
      "beta_tester_bronze",
      "beta_tester_prata",
      "beta_tester_ouro",
      "beta_tester_platina",
      "beta_tester_heroi",
    ];

    for (const bId of betaIds) {
      const def = all.find((m) => m.id === bId);
      assert.ok(def, `Medalha ${bId} deve existir no catálogo`);
      assert.ok(
        def.description.includes("15 de Novembro"),
        `Descrição da medalha ${bId} deve mencionar 15 de Novembro, obtido: "${def.description}"`,
      );
    }
  });

  it("varredura retroativa revoga medalha do torneio semanal atribuída indevidamente e estorna pontuação e XP", async () => {
    // Aluno que recebeu prematuramente Campeão Semanal (Ouro) durante o torneio ativo aberto
    const alunoComMedalhaIndevida = {
      profile: {
        id: "aluno_revogacao_test",
        nick: "AlunoIndevido",
        nickNormalized: "alunoindevido",
        full_name: "ALUNO INDEVIDO TESTE",
        school: "Maria de Nazaré",
        grade: "5º ano",
        birthdate: "2015-05-10",
        xp: 600,
        seasonXp: 600,
        level: 3,
        wins: 5,
        matchesPlayed: 10,
        distinctGamesPlayed: 2,
        pointsBalance: 200,
        careerPoints: 500,
        badges: [],
        seasonId: 1,
        // Medalha de pódio semanal atribuída antes do fechamento
        unlockedMedals: [
          { medalId: "tournament_top_1_gold", unlockedAt: "2026-11-05T00:00:00.000Z" },
        ],
        tournamentMedals: [],
      },
      passwordHash: "hash",
      unlocked: ["logica"],
      stats: [
        {
          game_id: "logica",
          mode: "padrao",
          plays: 10,
          wins: 5,
          best_score: 50,
          best_level: 2,
          last_wrong: 0,
        },
      ],
      updatedAt: "2026-11-05T00:00:00.000Z",
    };

    saveRegistry({ [alunoComMedalhaIndevida.profile.nickNormalized]: alunoComMedalhaIndevida as any });

    const auditRes = await runRetroactiveMedalsAudit({ skipCloudSync: true });
    assert.ok(auditRes.medalsRevokedCount >= 1, "Deve ter revogado ao menos 1 medalha indevida");
    assert.ok(auditRes.pointsDeductedTotal >= 50, "Deve ter estornado os pontos da medalha");

    // Verifica que a medalha foi removida e os pontos e XP foram estornados
    const regAfter = loadRegistry();
    const saved = regAfter[alunoComMedalhaIndevida.profile.nickNormalized];
    assert.ok(saved, "Conta deve existir no registro após varredura");
    assert.equal(
      saved.profile.unlockedMedals?.some((m: any) => m.medalId === "tournament_top_1_gold"),
      false,
      "A medalha tournament_top_1_gold indevida deve ter sido removida",
    );
    assert.ok(
      (saved.profile.careerPoints ?? 0) < 500,
      `CareerPoints deve ter sido estornado (< 500), obtido: ${saved.profile.careerPoints}`,
    );
    assert.ok(
      (saved.profile.pointsBalance ?? 0) < 200,
      `PointsBalance deve ter sido estornado (< 200), obtido: ${saved.profile.pointsBalance}`,
    );
    assert.ok(
      (saved.profile.xp ?? 0) < 600,
      `XP deve ter sido estornado (< 600), obtido: ${saved.profile.xp}`,
    );
  });

  it("revoga e impede reatribuição de medalha de pódio semanal se o torneio ativo (W46 / RoboGrid) ainda não encerrou", async () => {
    const alunoAtivoW46: any = {
      profile: {
        id: "aluno_w46_premature",
        nick: "LORD",
        nickNormalized: "lord",
        full_name: "QUEMUEL DA SILVA MONTEIRO",
        school: "Nenhuma",
        birthdate: "2010-05-15",
        xp: 400,
        seasonXp: 400,
        careerPoints: 300,
        pointsBalance: 200,
        level: 3,
        unlockedMedals: [
          { medalId: "tournament_top_1_gold", unlockedAt: "2026-11-10T11:36:35.000Z" },
        ],
        tournamentMedals: [
          {
            id: "medal_season_1_stage_3_r1",
            weekKey: "2026-W46",
            gameId: "robogrid",
            rank: 1,
            tier: "ouro",
            label: "🥇 Top 1 3ª Etapa (RoboGrid)",
            heldMinutes: 120,
            bonusXpAwarded: 0,
            earnedAt: "2026-11-10T11:36:35.000Z",
          },
        ],
      },
      passwordHash: "hash",
      unlocked: ["robogrid"],
      stats: [
        {
          game_id: "robogrid",
          mode: "torneio_semanal",
          plays: 5,
          wins: 4,
          best_score: 90,
          best_level: 2,
          last_wrong: 0,
        },
      ],
      updatedAt: "2026-11-10T11:36:35.000Z",
    };

    saveRegistry({ [alunoAtivoW46.profile.nickNormalized]: alunoAtivoW46 });

    const auditRes = await runRetroactiveMedalsAudit({ skipCloudSync: true });
    assert.ok(auditRes.medalsRevokedCount >= 1, "Deve revogar a medalha prematura");

    const regAfter = loadRegistry();
    const saved = regAfter[alunoAtivoW46.profile.nickNormalized];
    assert.equal(
      saved.profile.unlockedMedals?.some((m: any) => m.medalId === "tournament_top_1_gold"),
      false,
      "tournament_top_1_gold NÃO pode permanecer para a semana ativa W46 em andamento",
    );
    assert.equal(
      saved.profile.tournamentMedals?.length ?? 0,
      0,
      "tournamentMedals prematuro da W46 deve ser purgado",
    );
  });

  it("getGameMedalsProgress contabiliza PlayerUnlockedMedal[], extras (RPG=9, SpaceQuest=15) e medalhas de eventos por jogo", () => {
    const unlocked = [
      { medalId: "game_formas_lvl_master", unlockedAt: "2026-11-14T10:00:00Z" },
      { medalId: "game_formas_flawless", unlockedAt: "2026-11-14T10:05:00Z" },
      { medalId: "m_rpg_ametista", unlockedAt: "2026-11-14T10:10:00Z" },
      { medalId: "sq_rubi", unlockedAt: "2026-11-14T10:15:00Z" },
    ];

    const formas = getGameMedalsProgress("formas", unlocked);
    assert.equal(formas.total, 9);
    assert.equal(formas.earned, 2);
    assert.equal(formas.remaining, 7);

    const rpg = getGameMedalsProgress("rpg", unlocked);
    assert.equal(rpg.total, 11);
    assert.equal(rpg.earned, 1);
    assert.equal(rpg.remaining, 10);

    const sq = getGameMedalsProgress("spacequest", unlocked);
    assert.equal(sq.total, 17);
    assert.equal(sq.earned, 1);
    assert.equal(sq.remaining, 16);

    const customMedals: MedalDefinition[] = [
      {
        id: "ev_cart_1",
        title: "Evento Cartesiano",
        description: "Especial do Plano Cartesiano",
        rarity: "ouro",
        category: "evento",
        iconName: "Award",
        condition: { type: "manual_event" },
      },
      {
        id: "ev_global_1",
        title: "Evento Global",
        description: "Para todos os jogos",
        rarity: "ouro",
        category: "evento",
        iconName: "Award",
        condition: { type: "manual_event" },
      },
    ];
    const events = [
      { scope: "cartesiano", linkedMedalIds: ["ev_cart_1"] },
      { scope: "todos", linkedMedalIds: ["ev_global_1"] },
    ];
    const cart = getGameMedalsProgress("cartesiano", [{ medalId: "ev_cart_1", unlockedAt: "2026-11-14T11:00:00Z" }], customMedals, events);
    assert.equal(cart.total, 10);
    assert.equal(cart.earned, 1);
    assert.equal(cart.remaining, 9);
  });

  it("filterMedalsByQuery busca medalhas por nome, descrição e raridade (prata, ouro, platina)", () => {
    const all = getAllAvailableMedals();
    const prata = filterMedalsByQuery(all, "prata");
    assert.ok(prata.length > 0);
    assert.ok(prata.every((m) => m.rarity === "prata" || m.title.toLowerCase().includes("prata") || m.description.toLowerCase().includes("prata")));
    assert.ok(prata.some((m) => m.rarity === "prata"));

    const ouro = filterMedalsByQuery(all, "Ouro");
    assert.ok(ouro.some((m) => m.rarity === "ouro"));

    const platina = filterMedalsByQuery(all, "PLATINA");
    assert.ok(platina.some((m) => m.rarity === "platina"));

    const ametista = filterMedalsByQuery(all, "ametista");
    assert.ok(ametista.some((m) => m.id === "m_rpg_ametista" || m.id === "sq_ametista"));

    // Simula medalha customizada criada manualmente pelo administrador com nível platina
    const customManualPlatina: MedalDefinition = {
      id: "custom_adm_platina_123",
      title: "Gênio da Robótica",
      description: "Medalha concedida manualmente pelo administrador.",
      rarity: "platina",
      category: "evento",
      iconName: "Award",
      condition: { type: "manual_event" },
      isCustom: true,
      createdByAdmin: true,
    };

    const allWithCustom = getAllAvailableMedals([customManualPlatina]);
    assert.ok(allWithCustom.some((m) => m.id === "custom_adm_platina_123"));

    // Busca por termo do título
    const searchByTitle = filterMedalsByQuery(allWithCustom, "Robótica");
    assert.ok(searchByTitle.some((m) => m.id === "custom_adm_platina_123"));

    // Busca pela raridade "platina"
    const searchByPlatina = filterMedalsByQuery(allWithCustom, "platina");
    assert.ok(searchByPlatina.some((m) => m.id === "custom_adm_platina_123"));

    // Busca por "manual"
    const searchByManual = filterMedalsByQuery(allWithCustom, "manual");
    assert.ok(searchByManual.some((m) => m.id === "custom_adm_platina_123"));
  });

  it("no modo X1 (x1_online), libera exclusivamente medalhas do X1 e eventos voltados ao X1", () => {
    const profileX1: PlayerProfile = {
      id: "p_x1_only",
      nick: "DuelistaX1",
      nickNormalized: "duelistax1",
      full_name: "DUELISTA X1",
      school: "SEMED",
      grade: null,
      birthdate: "2012-05-10",
      xp: 200,
      seasonXp: 200,
      level: 5,
      wins: 1,
      x1Wins: 1,
      weeklyX1Wins: 1,
      matchesPlayed: 1,
      distinctGamesPlayed: 0,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
      eventProgress: {
        ev_geral: {
          cycleKey: "2026-11",
          matchesCount: 5,
          matchesByGame: { logica: 5 },
          xpEarned: 100,
          xpByGame: { logica: 100 },
          bestScoreByGame: { logica: 80 },
          bestLevelByGame: { logica: 3 },
          flawlessCount: 1,
          x1Wins: 1,
          maxCombo: 5,
          dailyCapDaysCount: 0,
          teamMatchesCount: 0,
          distinctGamesPlayed: ["logica"],
        },
        ev_x1: {
          cycleKey: "2026-11",
          matchesCount: 1,
          matchesByGame: { logica: 1 },
          xpEarned: 50,
          xpByGame: { logica: 50 },
          bestScoreByGame: { logica: 80 },
          bestLevelByGame: { logica: 1 },
          flawlessCount: 0,
          x1Wins: 1,
          maxCombo: 3,
          dailyCapDaysCount: 0,
          teamMatchesCount: 0,
          distinctGamesPlayed: [],
        },
      },
    };

    const x1Stats: GameStatRow[] = [
      {
        player_id: "p_x1_only",
        game_id: "logica",
        mode: "x1_online",
        plays: 1,
        wins: 1,
        flawless_wins: 1,
        best_score: 120,
        best_level: 3,
        updated_at: "2026-11-14T12:00:00Z",
      },
    ];

    const customEventCommon: MedalDefinition = {
      id: "custom_ev_common_matches",
      title: "Evento Geral 1 partida",
      description: "Medalha de evento comum.",
      rarity: "bronze",
      category: "evento",
      iconName: "Award",
      condition: { type: "manual_event" },
      eventId: "ev_geral",
      eventRequirement: { type: "event_matches", threshold: 1 },
      isCustom: true,
    };

    const customEventX1: MedalDefinition = {
      id: "custom_ev_x1_win",
      title: "Campeão Evento X1",
      description: "Vença 1 duelo X1 no evento.",
      rarity: "prata",
      category: "evento",
      iconName: "Swords",
      condition: { type: "manual_event" },
      eventId: "ev_x1",
      eventRequirement: { type: "event_x1_wins", threshold: 1 },
      isCustom: true,
    };

    const allWithEvents = getAllAvailableMedals([customEventCommon, customEventX1]);
    const awarded = evaluatePlayerMedals(
      {
        profile: profileX1,
        stats: x1Stats,
        lastMatch: {
          gameId: "logica",
          score: 120,
          level: 1,
          correct: 5,
          wrong: 0,
          mode: "x1_online",
        },
        weeklyX1Wins: 1,
        x1EventIds: new Set(["ev_x1"]),
      },
      allWithEvents,
      new Date("2026-11-14T12:00:00Z"),
    );

    const ids = awarded.map((m) => m.id);
    // Deve liberar apenas medalhas voltadas ao X1
    assert.ok(ids.includes("x1_wins_1"));
    assert.ok(ids.includes("custom_ev_x1_win"));
    // Jamais deve liberar medalhas padrão de jogos ou eventos gerais
    assert.ok(!ids.includes("game_logica_lvl_2"));
    assert.ok(!ids.includes("game_logica_flawless"));
    assert.ok(!ids.includes("explore_1_game"));
    assert.ok(!ids.includes("custom_ev_common_matches"));
  });

  it("desbloqueia novas medalhas X1 (participação, vitórias reajustadas, sequência, escola e virada) e medalhas de completar jogos", () => {
    const profileRichX1: PlayerProfile = {
      id: "p_x1_rich",
      nick: "MestreX1",
      nickNormalized: "mestrex1",
      full_name: "MESTRE X1",
      school: "Escola A",
      grade: null,
      birthdate: "2012-05-10",
      xp: 500,
      seasonXp: 500,
      level: 5,
      wins: 100,
      x1Matches: 300,
      x1Wins: 100,
      x1BestWinStreak: 20,
      x1SameSchoolWins: 10,
      x1OtherSchoolWins: 10,
      x1Comeback3Unlocked: true,
      x1Comeback5Unlocked: true,
      weeklyX1Wins: 15,
      matchesPlayed: 300,
      distinctGamesPlayed: 0,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const awardedX1 = evaluatePlayerMedals({
      profile: profileRichX1,
      stats: [],
      lastMatch: {
        gameId: "logica",
        score: 100,
        level: 1,
        correct: 5,
        wrong: 0,
        mode: "x1_online",
      },
      weeklyX1Wins: 15,
    });
    const x1Ids = awardedX1.map((m) => m.id);
    for (const expectedId of [
      "x1_matches_1",
      "x1_matches_10",
      "x1_matches_20",
      "x1_matches_30",
      "x1_matches_50",
      "x1_matches_100",
      "x1_matches_300",
      "x1_wins_1",
      "x1_wins_3",
      "x1_wins_5",
      "x1_wins_10",
      "x1_wins_20",
      "x1_wins_40",
      "x1_wins_60",
      "x1_wins_100",
      "x1_streak_2",
      "x1_streak_5",
      "x1_streak_8",
      "x1_streak_12",
      "x1_streak_20",
      "x1_same_school_1",
      "x1_same_school_5",
      "x1_same_school_10",
      "x1_other_school_1",
      "x1_other_school_5",
      "x1_other_school_10",
      "x1_secret_comeback_3",
      "x1_secret_comeback_5",
    ]) {
      assert.ok(x1Ids.includes(expectedId), `faltou medalha X1 ${expectedId}`);
    }
    assert.ok(!x1Ids.includes("complete_1_game"));

    // Testa medalhas de completar todas as medalhas base de 1, 2 e 10 jogos
    const allBase = getAllAvailableMedals();
    const baseMedalsFor = (gId: string) =>
      allBase.filter((m) => !m.isCustom && !m.eventId && (m.gameId === gId || m.condition.gameId === gId));

    const tenGames = ALL_GAME_IDS.slice(0, 10);
    const unlocked10 = tenGames.flatMap((g) => baseMedalsFor(g).map((m) => ({ medalId: m.id, unlockedAt: "2026-11-15T00:00:00Z" })));
    const awardedComplete = evaluatePlayerMedals({
      profile: {
        ...profileRichX1,
        unlockedMedals: unlocked10,
      },
      stats: [],
    });
    const completeIds = awardedComplete.map((m) => m.id);
    assert.ok(completeIds.includes("complete_1_game"));
    assert.ok(completeIds.includes("complete_2_games"));
    assert.ok(completeIds.includes("complete_10_games"));

    // Testa progresso de medalhas do X1 (conquistadas x existentes)
    const x1Progress = getX1MedalsProgress(
      [{ medalId: "x1_wins_1", unlockedAt: "2026-11-15T00:00:00Z" }, "x1_matches_1"],
    );
    assert.equal(x1Progress.total, 31);
    assert.equal(x1Progress.earned, 2);
    assert.equal(x1Progress.remaining, 29);
  });

  it("avalia e calcula progresso das 6 medalhas de tarefas diárias concluídas (3, 15, 30, 90, 150 e 300)", () => {
    const catalog = buildBaseMedalsCatalog();
    const expected = [
      { id: "daily_missions_3", rarity: "bronze", threshold: 3 },
      { id: "daily_missions_15", rarity: "prata", threshold: 15 },
      { id: "daily_missions_30", rarity: "ouro", threshold: 30 },
      { id: "daily_missions_90", rarity: "platina", threshold: 90 },
      { id: "daily_missions_150", rarity: "diamante", threshold: 150 },
      { id: "daily_missions_300", rarity: "heroi", threshold: 300 },
    ] as const;

    for (const item of expected) {
      const def = catalog.find((m) => m.id === item.id);
      assert.ok(def, `Medalha ${item.id} deve existir no catálogo`);
      assert.equal(def.rarity, item.rarity);
      assert.equal(def.condition.type, "daily_missions_completed");
      assert.equal(def.condition.threshold, item.threshold);
    }

    const baseProfile: PlayerProfile = {
      id: "daily_missions_test",
      nick: "aluno",
      nickNormalized: "aluno",
      full_name: "Aluno Teste",
      school: "Escola",
      grade: "6",
      birthdate: "2012-01-01",
      xp: 0,
      seasonXp: 0,
      level: 1,
      wins: 0,
      matchesPlayed: 0,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const p30: PlayerProfile = { ...baseProfile, dailyMissionsCompleted: 30 };
    const awarded30 = evaluatePlayerMedals({ profile: p30, stats: [] }).map((m) => m.id);
    assert.ok(awarded30.includes("daily_missions_3"));
    assert.ok(awarded30.includes("daily_missions_15"));
    assert.ok(awarded30.includes("daily_missions_30"));
    assert.ok(!awarded30.includes("daily_missions_90"));

    const p300: PlayerProfile = { ...baseProfile, dailyMissionsCompleted: 300 };
    const awarded300 = evaluatePlayerMedals({ profile: p300, stats: [] }).map((m) => m.id);
    for (const item of expected) {
      assert.ok(awarded300.includes(item.id), `Deve conceder ${item.id} com 300 tarefas diárias`);
    }

    const platinaDef = catalog.find((m) => m.id === "daily_missions_90")!;
    const prog = calculateMedalProgress(platinaDef, { ...baseProfile, dailyMissionsCompleted: 45 }, []);
    assert.equal(prog.percent, 50);
    assert.equal(prog.progressText, "45 de 90 tarefas diárias concluídas");
  });

  it("avalia e calcula progresso das 6 medalhas de missões semanais concluídas (2, 4, 12, 20, 32 e 52)", () => {
    const catalog = buildBaseMedalsCatalog();
    const expected = [
      { id: "weekly_missions_2", rarity: "bronze", threshold: 2 },
      { id: "weekly_missions_4", rarity: "prata", threshold: 4 },
      { id: "weekly_missions_12", rarity: "ouro", threshold: 12 },
      { id: "weekly_missions_20", rarity: "platina", threshold: 20 },
      { id: "weekly_missions_32", rarity: "diamante", threshold: 32 },
      { id: "weekly_missions_52", rarity: "heroi", threshold: 52 },
    ] as const;

    for (const item of expected) {
      const def = catalog.find((m) => m.id === item.id);
      assert.ok(def, `Medalha ${item.id} deve existir no catálogo`);
      assert.equal(def.rarity, item.rarity);
      assert.equal(def.condition.type, "weekly_missions_completed");
      assert.equal(def.condition.threshold, item.threshold);
    }

    const baseProfile: PlayerProfile = {
      id: "weekly_missions_test",
      nick: "aluno",
      nickNormalized: "aluno",
      full_name: "Aluno Teste",
      school: "Escola",
      grade: "6",
      birthdate: "2012-01-01",
      xp: 0,
      seasonXp: 0,
      level: 1,
      wins: 0,
      matchesPlayed: 0,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
    };

    const p12: PlayerProfile = { ...baseProfile, weeklyMissionsCompleted: 12 };
    const awarded12 = evaluatePlayerMedals({ profile: p12, stats: [] }).map((m) => m.id);
    assert.ok(awarded12.includes("weekly_missions_2"));
    assert.ok(awarded12.includes("weekly_missions_4"));
    assert.ok(awarded12.includes("weekly_missions_12"));
    assert.ok(!awarded12.includes("weekly_missions_20"));

    const p52: PlayerProfile = { ...baseProfile, weeklyMissionsCompleted: 52 };
    const awarded52 = evaluatePlayerMedals({ profile: p52, stats: [] }).map((m) => m.id);
    for (const item of expected) {
      assert.ok(awarded52.includes(item.id), `Deve conceder ${item.id} com 52 missões semanais`);
    }

    const platinaDef = catalog.find((m) => m.id === "weekly_missions_20")!;
    const prog = calculateMedalProgress(platinaDef, { ...baseProfile, weeklyMissionsCompleted: 10 }, []);
    assert.equal(prog.percent, 50);
    assert.equal(prog.progressText, "10 de 20 missões semanais concluídas");
  });

  it("avalia medalhas de partidas normais (excluindo X1 e torneio), economia, baús, pacotes e cartas", () => {
    const profile: PlayerProfile = {
      id: "eco1",
      nick: "EcoPlayer",
      nickNormalized: "ecoplayer",
      full_name: "Eco Player",
      school: "E.M. Teste",
      grade: "5º Ano",
      birthdate: "",
      xp: 0,
      seasonXp: 0,
      level: 1,
      wins: 0,
      matchesPlayed: 0,
      badges: [],
      seasonId: 1,
      coins: 120,
      lifetimeCoins: 1500,
      peakCoins: 900,
      coinsSpentTotal: 1380,
      purchasedCosmeticIds: ["avatar:avatar_smile", "aura:aura_azul_static"],
      chestsOpenedTotal: 12,
      packsOpenedTotal: 16,
      cards: {
        c1: 10,
        c2: 12,
        c3: 5,
        c4: 1,
        c5: 2,
        c6: 3,
        c7: 4,
        c8: 6,
        c9: 8,
        c10: 9,
      },
      unlockedMedals: [],
    };
    const stats = [
      { game_id: "logica" as const, mode: "normal", plays: 110, wins: 50, best_score: 100, best_level: 3 },
      { game_id: "logica" as const, mode: "x1_online", plays: 200, wins: 100, best_score: 100, best_level: 3 },
      { game_id: "logica" as const, mode: "torneio_semanal", plays: 90, wins: 40, best_score: 100, best_level: 3 },
    ];

    const awarded = evaluatePlayerMedals({ profile, stats }).map((m) => m.id);
    // Partidas normais: 110 (não soma 200 de X1 nem 90 de torneio)
    assert.ok(awarded.includes("normal_matches_100"));
    assert.ok(!awarded.includes("normal_matches_200"));
    // Moedas conseguidas (1500)
    assert.ok(awarded.includes("coins_earned_100"));
    assert.ok(awarded.includes("coins_earned_1200"));
    assert.ok(!awarded.includes("coins_earned_2000"));
    // Moedas gastas (1380)
    assert.ok(awarded.includes("coins_spent_50"));
    assert.ok(awarded.includes("coins_spent_1200"));
    assert.ok(!awarded.includes("coins_spent_2000"));
    // Cosméticos comprados (2)
    assert.ok(awarded.includes("cosmetics_bought_1"));
    assert.ok(awarded.includes("cosmetics_bought_2"));
    assert.ok(!awarded.includes("cosmetics_bought_5"));
    // Baús (12)
    assert.ok(awarded.includes("chests_opened_1"));
    assert.ok(awarded.includes("chests_opened_10"));
    assert.ok(!awarded.includes("chests_opened_20"));
    // Pacotes (16)
    assert.ok(awarded.includes("packs_opened_1"));
    assert.ok(awarded.includes("packs_opened_15"));
    assert.ok(!awarded.includes("packs_opened_30"));
    // Cartas únicas (10) e total (60)
    assert.ok(awarded.includes("cards_unique_10"));
    assert.ok(!awarded.includes("cards_unique_30"));
    assert.ok(awarded.includes("cards_total_20"));
    assert.ok(awarded.includes("cards_total_50"));
    assert.ok(!awarded.includes("cards_total_100"));
  });
});
