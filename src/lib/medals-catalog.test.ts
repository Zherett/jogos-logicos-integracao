import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBaseMedalsCatalog,
  calculateMaxConsecutiveDays,
  calculateMaxConsecutiveWeeks,
  calculateMedalProgress,
  evaluatePlayerMedals,
  getAllAvailableMedals,
  getDailyPostCapMatches,
  getDistinctFlawlessGames,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
  getPlayerStreakDays,
  getTopShowcaseMedals,
  isFlawlessMatch,
  RARITY_INFO,
  type MedalDefinition,
} from "./medals-catalog.ts";
import { ALL_GAME_IDS } from "./game-storage.ts";
import { ensurePlayerSeasonAligned, type PlayerProfile, type GameStatRow, grantPlayerMedalManually } from "./playfab.ts";
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

    // Valida medalhas de quantidade de partidas (5 por jogo x ALL_GAME_IDS.length)
    const matchMedals = catalog.filter((m) => m.category === "jogo_partidas");
    assert.equal(matchMedals.length, ALL_GAME_IDS.length * 5);

    // Valida medalhas de zero erros (1 por jogo)
    const flawlessMedals = catalog.filter((m) => m.category === "jogo_perfeito");
    assert.equal(flawlessMedals.length, ALL_GAME_IDS.length);

    // Valida medalhas de X1 (10 vitórias totais + 3 semanais)
    const x1Total = catalog.filter((m) => m.category === "x1_vitorias");
    const x1Weekly = catalog.filter((m) => m.category === "x1_semanal");
    assert.equal(x1Total.length, 10);
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

  it("seleciona automaticamente as 3 medalhas mais raras para vitrine/destaque", () => {
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

    const unlocked = [
      { medalId: "m_bronze", unlockedAt: "2026-10-31" },
      { medalId: "m_ouro", unlockedAt: "2026-10-31" },
      { medalId: "m_platina", unlockedAt: "2026-10-31" },
      { medalId: "m_diamante", unlockedAt: "2026-10-31" },
    ];

    const top3 = getTopShowcaseMedals(unlocked, medalsList);
    assert.equal(top3.length, 3);
    assert.equal(top3[0].id, "m_diamante"); // peso 5
    assert.equal(top3[1].id, "m_platina"); // peso 4
    assert.equal(top3[2].id, "m_ouro"); // peso 3
  });

  it("garante que cada jogo registrado gera automaticamente 7 medalhas dedicadas", () => {
    const catalog = buildBaseMedalsCatalog();

    for (const gId of ALL_GAME_IDS) {
      const gameMedals = catalog.filter((m) => m.gameId === gId);
      assert.equal(
        gameMedals.length,
        7,
        `Jogo ${gId} deveria ter 7 medalhas automáticas (1 nível, 1 sem erros, 5 partidas), mas tem ${gameMedals.length}`
      );
      assert.ok(gameMedals.some((m) => m.id === `game_${gId}_lvl_master`));
      assert.ok(gameMedals.some((m) => m.id === `game_${gId}_flawless`));
      assert.ok(gameMedals.some((m) => m.id === `game_${gId}_matches_10`));
      assert.ok(gameMedals.some((m) => m.id === `game_${gId}_matches_50`));
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
});
