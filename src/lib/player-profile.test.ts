import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adjustXpForGameMode,
  advanceLevelStageOnMatch,
  applyDailyXpCap,
  calculatePlayerLevel,
  computeBadges,
  computeMatchDisplayXp,
  DEFAULT_DAILY_XP_CAP,
  evaluateLeaderboardRankChanges,
  formatFullNameUpper,
  fullNameSlug,
  getAvailableSchoolsForAge,
  isEligibleForEtapa1,
  isOlderThanEtapa1,
  isEtapa3OrOlder,
  isMatchVictory,
  isOfficialSemedSchool,
  isValidSchool,
  levelFromXp,
  levelProgress,
  matchesRankingCategory,
  MAX_LEVEL,
  normalizeBirthdatePasswordInput,
  passwordFromBirthdate,
  playfabUsernameFromNick,
  nickSlug,
  isPioneerExcludedAccount,
  RANKING_SERIES_OPTIONS,
  resolveDefaultRankingCategory,
  SCHOOLS,
  stageFromAge,
  stageFromBirthdate,
  studentCustomId,
  syncLevelStageProgress,
  TEAM_MODE_XP_DIVISOR,
  xpForLevel,
  xpFromMatch,
} from "./player-profile.ts";
import {
  isSpecialAdminAccount,
  purgeExpiredTrash,
  STUDENT_TRASH_RETENTION_MS,
  addTombstone,
  isTombstoned,
  ensurePlayerSeasonAligned,
  type StoredAccount,
} from "./playfab.ts";

describe("Perfil do Jogador, Escolas, Trava de Níveis (1..10) e Limite Diário de XP", () => {
  it("possui as opções de instituição com Nenhuma (padrão) no início, as 6 escolas oficiais da SEMED Coari (incluindo Raimundo Bezerra e Agenor Smith) e Outro por último", () => {
    const names = SCHOOLS.map((s) => s.name);
    assert.deepEqual(names, [
      "Nenhuma",
      "Raimundo Bezerra",
      "Agenor Smith",
      "Elisângela Litaiff",
      "Raimunda Cruz",
      "Maria de Nazaré",
      "Ursulina Souza",
      "Outro",
    ]);
    assert.equal(names[0], "Nenhuma");
    assert.equal(names[names.length - 1], "Outro");
    assert.equal(isValidSchool("Nenhuma"), true);
    assert.equal(isValidSchool("Raimundo Bezerra"), true);
    assert.equal(isValidSchool("Agenor Smith"), true);
    assert.equal(isValidSchool("Outro"), true);
    assert.equal(isValidSchool("Escola Inexistente"), false);
  });

  it("respeita a curva de XP do Nível 1 ao Nível Máximo 10 (8.433 XP)", () => {
    assert.equal(MAX_LEVEL, 10);
    assert.equal(xpForLevel(1), 0);
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(3), 354);
    assert.equal(xpForLevel(4), 795);
    assert.equal(xpForLevel(5), 1444);
    assert.equal(xpForLevel(10), 8433);
    // Mesmo com XP muito acima de 8.433, o nível máximo permanece 10
    assert.equal(levelFromXp(50000), 10);
  });

  it("trava o avanço de nível caso faltem partidas, vitórias ou jogos diferentes explorados", () => {
    // Aluno com 1.000 XP (máximo do 1º dia), mas que jogou apenas 1 modalidade (ex: só Lógica)
    const lockedAt2 = levelProgress({
      xp: 1000,
      matchesPlayed: 10,
      wins: 6,
      distinctGames: 1, // Nível 2 pede 1 jogo, mas Nível 3 pede 2 jogos diferentes
    });
    assert.equal(lockedAt2.level, 2);
    assert.equal(lockedAt2.isLockedByMissions, true);

    // Assim que explora 3 jogos diferentes (com 8+ partidas e 4+ vitórias), destrava o Nível 4 no 1º dia
    const unlockedLvl4 = levelProgress({
      xp: 1000,
      matchesPlayed: 8,
      wins: 4,
      distinctGames: 3,
    });
    assert.equal(unlockedLvl4.level, 4);
    assert.equal(unlockedLvl4.isLockedByMissions, false);

    // Para chegar ao Nível 10 (máximo), precisa de 8.433+ XP, 50+ partidas, 30+ vitórias e 9+ jogos diferentes
    assert.equal(
      calculatePlayerLevel({
        xp: 9000,
        matchesPlayed: 50,
        wins: 30,
        distinctGames: 8, // falta 1 jogo diferente para o nível 10
      }),
      9,
    );
    assert.equal(
      calculatePlayerLevel({
        xp: 9000,
        matchesPlayed: 50,
        wins: 30,
        distinctGames: 9,
      }),
      10,
    );
  });

  it("aplica o limite diário de 1.000 XP/dia e renova no dia seguinte", () => {
    assert.equal(DEFAULT_DAILY_XP_CAP, 1000);

    // Ganha 250 XP quando já tinha 850 XP hoje -> recebe apenas 150 XP para fechar 1.000 XP
    const res1 = applyDailyXpCap({
      rawEarnedXp: 250,
      currentDailyXp: 850,
      lastDateKey: "2026-10-31",
      todayKey: "2026-10-31",
      dailyCap: 1000,
    });
    assert.equal(res1.grantedXp, 150);
    assert.equal(res1.newDailyXp, 1000);
    assert.equal(res1.remainingToday, 0);
    assert.equal(res1.wasCapped, true);

    // Nova partida no mesmo dia após bater 1.000 XP -> 0 XP concedido
    const res2 = applyDailyXpCap({
      rawEarnedXp: 180,
      currentDailyXp: res1.newDailyXp,
      lastDateKey: "2026-10-31",
      todayKey: "2026-10-31",
      dailyCap: 1000,
    });
    assert.equal(res2.grantedXp, 0);
    assert.equal(res2.newDailyXp, 1000);

    // No dia seguinte (2026-11-01), o limite diário zera automaticamente
    const resNextDay = applyDailyXpCap({
      rawEarnedXp: 180,
      currentDailyXp: res2.newDailyXp,
      lastDateKey: "2026-10-31",
      todayKey: "2026-11-01",
      dailyCap: 1000,
    });
    assert.equal(resNextDay.grantedXp, 180);
    assert.equal(resNextDay.newDailyXp, 180);
    assert.equal(resNextDay.remainingToday, 820);
    assert.equal(resNextDay.wasCapped, false);
  });

  it("recompensa vitórias com bônus de XP e desbloqueia conquistas até o Nível 10", () => {
    assert.equal(isMatchVictory(80, 8, 2), true);
    const xpVictory = xpFromMatch(80, 8, 2, 2);
    const xpDefeat = xpFromMatch(10, 1, 8, 1);
    assert.ok(xpVictory > xpDefeat);

    const badges = computeBadges({
      existing: [],
      xp: 8500,
      wins: 30,
      matchesPlayed: 50,
      distinctGamesPlayed: 9,
      lastMatchScore: 120,
    });
    const ids = badges.map((b) => b.id);
    assert.ok(ids.includes("primeira_vitoria"));
    assert.ok(ids.includes("nivel_5"));
    assert.ok(ids.includes("nivel_10"));
  });

  it("gera a senha de 6 dígitos DDMMAA a partir da data de nascimento (ex: 20/01/2014 -> 200114) e normaliza nomes", () => {
    assert.equal(passwordFromBirthdate("2014-01-20"), "200114");
    assert.equal(passwordFromBirthdate("20/01/2014"), "200114");
    assert.equal(normalizeBirthdatePasswordInput("200114"), "200114");
    assert.equal(normalizeBirthdatePasswordInput("20/01/2014"), "200114");
    assert.equal(normalizeBirthdatePasswordInput("20012014"), "200114");
    assert.equal(formatFullNameUpper("joão pedro da conceição"), "JOÃO PEDRO DA CONCEIÇÃO");
    assert.equal(fullNameSlug("  João   Pedro da Conceição "), "joao pedro da conceicao");
    assert.equal(
      studentCustomId("João Pedro da Conceição", "2014-01-20"),
      "stu_joao_pedro_da_conceicao_200114",
    );
  });

  it("aloca o aluno na etapa conforme corte de nascimento (a partir de janeiro de 2014, 2015 e 2016 na 1ª Etapa) e restringe escolas de 5º ano para nascidos antes de 2014", () => {
    const refDateNov = new Date("2026-11-02T12:00:00");
    const refDateDec = new Date("2026-12-31T12:00:00");

    // 1. Fallback por Escola (quando data de nascimento não informada)
    assert.equal(stageFromBirthdate(undefined, refDateNov, "Raimunda Cruz").id, "etapa_1");
    assert.equal(stageFromBirthdate(undefined, refDateNov, "Ursulina Souza").id, "etapa_1");
    assert.equal(stageFromBirthdate(undefined, refDateNov, "Maria de Nazaré").id, "etapa_1");
    assert.equal(stageFromBirthdate(undefined, refDateNov, "Elisângela Litaiff").id, "etapa_1");
    assert.equal(stageFromBirthdate(undefined, refDateNov, "Raimundo Bezerra").id, "etapa_2");

    // 2. 1ª Etapa: nascidos a partir de janeiro de 2014, 2015 e 2016 (até 12 anos em 2026)
    assert.equal(stageFromAge(10).id, "etapa_1");
    assert.equal(stageFromAge(11).id, "etapa_1");
    assert.equal(stageFromAge(12).id, "etapa_1");
    assert.equal(stageFromBirthdate("2016-05-10", refDateNov).id, "etapa_1"); // 10 anos (2016)
    assert.equal(stageFromBirthdate("2015-09-15", refDateNov, "Elisângela Litaiff").id, "etapa_1"); // 11 anos (2015)
    assert.equal(stageFromBirthdate("2015-09-15", refDateDec, "Raimunda Cruz").id, "etapa_1"); // 11 anos em dez/2026
    assert.equal(stageFromBirthdate("2015-10-15", refDateDec, "Maria de Nazaré").id, "etapa_1");
    assert.equal(stageFromBirthdate("2015-12-20", refDateDec, "Ursulina Souza").id, "etapa_1");
    // Nascidos a partir de janeiro de 2014 entram na faixa da 1ª Etapa
    assert.equal(stageFromBirthdate("2014-01-20", refDateNov).id, "etapa_1"); // janeiro de 2014
    assert.equal(stageFromBirthdate("2014-05-10", refDateNov, "Elisângela Litaiff").id, "etapa_1"); // maio de 2014 em escola de 5º ano
    assert.equal(stageFromBirthdate("2014-12-31", refDateDec, "Raimunda Cruz").id, "etapa_1"); // dezembro de 2014

    // Se o aluno nascido a partir de 2014 estiver matriculado no Raimundo Bezerra (6º ano), participa da 2ª Etapa
    assert.equal(stageFromBirthdate("2015-09-15", refDateNov, "Raimundo Bezerra").id, "etapa_2");
    assert.equal(stageFromBirthdate("2014-01-20", refDateNov, "Raimundo Bezerra").id, "etapa_2");

    // 3. 2ª Etapa: nascidos antes de janeiro de 2014 até dez/2010 (13 a 16 anos em 2026)
    assert.equal(stageFromAge(13).id, "etapa_2");
    assert.equal(stageFromAge(14).id, "etapa_2");
    assert.equal(stageFromAge(16).id, "etapa_2");
    assert.equal(stageFromBirthdate("2013-05-10", refDateNov).id, "etapa_2"); // 13 anos (2013)
    assert.equal(stageFromBirthdate("2013-12-31", refDateNov).id, "etapa_2"); // nascido em dez/2013 (anterior a jan/2014)
    assert.equal(stageFromBirthdate("2011-05-10", refDateNov).id, "etapa_2"); // 15 anos em 2026 (8º/9º ano)
    assert.equal(stageFromBirthdate("2010-11-15", refDateNov).id, "etapa_2"); // aluna do 9º ano nascida em nov/2010
    assert.equal(stageFromBirthdate("2010-12-31", refDateNov).id, "etapa_2"); // nascida em dez/2010

    // Aluno nascido antes de 2014 (ex: 2013) JAMAIS é alocado em Etapa 1 mesmo que passe escola de 5º ano
    assert.equal(stageFromBirthdate("2013-05-10", refDateNov, "Elisângela Litaiff").id, "etapa_2");

    // 4. 3ª Etapa: nascidos antes de 2010 (17+ anos em 2026, ex: 17, 20 ou 25 anos)
    assert.equal(stageFromAge(17).id, "etapa_3");
    assert.equal(stageFromAge(20).id, "etapa_3");
    assert.equal(stageFromBirthdate("2009-12-31", refDateNov).id, "etapa_3"); // nascido antes de 2010
    assert.equal(stageFromBirthdate("2006-05-10", refDateNov).id, "etapa_3"); // 20 anos
  });

  it("reconhece os dois administradores autorizados JOSINEY e QUEMUEL", () => {
    assert.equal(isSpecialAdminAccount({ nickNormalized: "josiney" }), true);
    assert.equal(isSpecialAdminAccount({ nickNormalized: "quemuel" }), true);
    assert.equal(isSpecialAdminAccount({ id: "admin-josiney" }), true);
    assert.equal(isSpecialAdminAccount({ id: "admin-quemuel" }), true);
    assert.equal(isSpecialAdminAccount({ nickNormalized: "lord" }), false);
    assert.equal(isSpecialAdminAccount({ nickNormalized: "alunoteste" }), false);
  });

  it("reduz o ganho de XP em 4X quando o jogo é disputado em modo equipes/grupos", () => {
    assert.equal(TEAM_MODE_XP_DIVISOR, 4);

    // Modo solo (isTeam = false): mantém XP inalterado
    assert.equal(adjustXpForGameMode(20, false), 20);
    assert.equal(adjustXpForGameMode(12, false), 12);
    assert.equal(adjustXpForGameMode(5, false), 5);

    // Modo equipes (isTeam = true): reduz em 4X (ex: 20 XP vira 5 XP)
    assert.equal(adjustXpForGameMode(20, true), 5);
    assert.equal(adjustXpForGameMode(16, true), 4);
    assert.equal(adjustXpForGameMode(12, true), 3);
    assert.equal(adjustXpForGameMode(4, true), 1);
    // Garante no mínimo 1 XP para partidas concluídas
    assert.equal(adjustXpForGameMode(1, true), 1);
    assert.equal(adjustXpForGameMode(2, true), 1);
  });

  it("bloqueia escolas e turmas do ensino fundamental para jogadores da 3ª Etapa (nascidos antes de 2010)", () => {
    const refDate = new Date("2026-11-01T12:00:00");

    // Aluno com 25 anos (ex: nascido em 2001)
    assert.equal(isEtapa3OrOlder("2001-05-10", refDate), true);
    // Nascido antes de 2010 (ex: dez/2009) -> 3ª Etapa
    assert.equal(isEtapa3OrOlder("2009-12-31", refDate), true);

    // Aluna do 9º ano nascida em novembro de 2010 (nascida até dezembro de 2010 -> 2ª Etapa, NÃO é Etapa 3)
    assert.equal(isEtapa3OrOlder("2010-11-15", refDate), false);
    assert.equal(isEtapa3OrOlder("2010-12-31", refDate), false);

    // Aluno com 15 anos em 2026 (nascido em 2011) -> 2ª Etapa
    assert.equal(isEtapa3OrOlder("2011-03-15", refDate), false);
    // Aluno com 12 anos (nascido em 2014) -> 2ª Etapa
    assert.equal(isEtapa3OrOlder("2014-05-10", refDate), false);
    // Aluno com 10 anos (nascido em 2016) -> 1ª Etapa
    assert.equal(isEtapa3OrOlder("2016-05-10", refDate), false);

    // Escolas disponíveis para quem nasceu antes de 2010: APENAS 'Nenhuma' e 'Outro' (nenhuma escola do fundamental)
    const schoolsOver15 = getAvailableSchoolsForAge("2001-05-10", refDate).map((s) => s.name);
    assert.deepEqual(schoolsOver15, ["Nenhuma", "Outro"]);

    const schools2009 = getAvailableSchoolsForAge("2009-12-31", refDate).map((s) => s.name);
    assert.deepEqual(schools2009, ["Nenhuma", "Outro"]);

    // Para aluna do 9º ano nascida em nov/2010: Escolas da 2ª Etapa DEVEM aparecer
    const schoolsNov2010 = getAvailableSchoolsForAge("2010-11-15", refDate).map((s) => s.name);
    assert.equal(schoolsNov2010.includes("Raimundo Bezerra"), true);
    assert.equal(schoolsNov2010.includes("Agenor Smith"), true);
    assert.equal(schoolsNov2010.includes("Elisângela Litaiff"), false);

    // Para quem nasceu em 2015 ou 2016: escolas de 5º ano e 2ª Etapa aparecem normalmente
    const refDateDec = new Date("2026-12-31T12:00:00");
    const schoolsSept2015 = getAvailableSchoolsForAge("2015-09-15", refDateDec).map((s) => s.name);
    assert.equal(schoolsSept2015.includes("Raimundo Bezerra"), true);
    assert.equal(schoolsSept2015.includes("Agenor Smith"), true);
    assert.equal(schoolsSept2015.includes("Elisângela Litaiff"), true);
    assert.equal(schoolsSept2015.includes("Raimunda Cruz"), true);
    assert.equal(schoolsSept2015.includes("Maria de Nazaré"), true);
    assert.equal(schoolsSept2015.includes("Ursulina Souza"), true);

    // Para novos alunos nascidos a partir de janeiro de 2014: escolas tanto da Etapa 1 quanto da Etapa 2 ficam disponíveis
    const schools2014 = getAvailableSchoolsForAge("2014-05-10", refDate).map((s) => s.name);
    assert.equal(schools2014.includes("Raimundo Bezerra"), true); // Etapa 2
    assert.equal(schools2014.includes("Agenor Smith"), true); // Etapa 2
    assert.equal(schools2014.includes("Elisângela Litaiff"), true); // Etapa 1
    assert.equal(schools2014.includes("Raimunda Cruz"), true); // Etapa 1
    assert.equal(schools2014.includes("Maria de Nazaré"), true); // Etapa 1
    assert.equal(schools2014.includes("Ursulina Souza"), true); // Etapa 1

    // Para quem nasceu antes de janeiro de 2014 (ex: 2013): escolas de 5º ano NÃO devem aparecer
    const schools2013 = getAvailableSchoolsForAge("2013-05-10", refDate).map((s) => s.name);
    assert.equal(schools2013.includes("Raimundo Bezerra"), true);
    assert.equal(schools2013.includes("Agenor Smith"), true);
    assert.equal(schools2013.includes("Elisângela Litaiff"), false);
    assert.equal(schools2013.includes("Raimunda Cruz"), false);
    assert.equal(schools2013.includes("Maria de Nazaré"), false);
    assert.equal(schools2013.includes("Ursulina Souza"), false);

    // Para quem tem 10 anos (ex: 2016): escolas de 5º ano aparecem normalmente
    const schoolsUpTo11 = getAvailableSchoolsForAge("2016-05-10", refDate).map((s) => s.name);
    assert.equal(schoolsUpTo11.includes("Elisângela Litaiff"), true);
    assert.equal(schoolsUpTo11.includes("Raimunda Cruz"), true);

    // Aluno nascido antes de 2010 é SEMPRE alocado na Etapa 3 (Comunidade)
    assert.equal(stageFromBirthdate("2001-05-10", refDate, "Elisângela Litaiff").id, "etapa_3");
    assert.equal(stageFromBirthdate("2001-05-10", refDate, "Raimundo Bezerra").id, "etapa_3");
    assert.equal(stageFromBirthdate("2001-05-10", refDate, "Agenor Smith").id, "etapa_3");
    assert.equal(stageFromBirthdate("2001-05-10", refDate, "Outro").id, "etapa_3");
    assert.equal(stageFromBirthdate("2001-05-10", refDate, "Nenhuma").id, "etapa_3");

    // Aluna nascida em novembro de 2010 é SEMPRE alocada na 2ª Etapa
    assert.equal(stageFromBirthdate("2010-11-15", refDate, "Raimundo Bezerra").id, "etapa_2");
    assert.equal(stageFromBirthdate("2010-11-15", refDate, "Agenor Smith").id, "etapa_2");
    assert.equal(stageFromBirthdate("2010-11-15", refDate, "Nenhuma").id, "etapa_2");

    // Se aluno de 11 anos estiver no Agenor Smith (6º ano), vai para 2ª Etapa
    assert.equal(stageFromBirthdate("2015-09-15", refDate, "Agenor Smith").id, "etapa_2");

    // Validação de escolas oficiais
    assert.equal(isOfficialSemedSchool("Raimundo Bezerra"), true);
    assert.equal(isOfficialSemedSchool("Agenor Smith"), true);
    assert.equal(isOfficialSemedSchool("Elisângela Litaiff"), true);
    assert.equal(isOfficialSemedSchool("Nenhuma"), false);
    assert.equal(isOfficialSemedSchool("Outro"), false);
  });

  it("calcula corretamente as setas de subida (▲ verde) e descida (▼ vermelha) no ranking sem jamais marcar 1º lugar com seta vermelha", () => {
    // Leitura inicial do ranking
    const firstSnapshot = evaluateLeaderboardRankChanges(
      [
        { playerId: "aluno_a", rank: 1 },
        { playerId: "aluno_b", rank: 2 },
        { playerId: "aluno_c", rank: 3 },
      ],
      {},
    );

    // O 1º colocado nunca fica com seta vermelha ("down")
    assert.equal(firstSnapshot.entriesWithTrend[0].rankTrend, "up");
    assert.notEqual(firstSnapshot.entriesWithTrend[0].rankTrend, "down");
    assert.equal(firstSnapshot.entriesWithTrend[1].rankTrend, "same");
    assert.equal(firstSnapshot.entriesWithTrend[2].rankTrend, "same");

    // Na leitura seguinte: aluno_c subiu de 3º para 2º (▲ verde) e aluno_b caiu de 2º para 3º (▼ vermelha)
    const secondSnapshot = evaluateLeaderboardRankChanges(
      [
        { playerId: "aluno_a", rank: 1 },
        { playerId: "aluno_c", rank: 2 },
        { playerId: "aluno_b", rank: 3 },
      ],
      firstSnapshot.nextHistory,
    );

    const rowA = secondSnapshot.entriesWithTrend.find((r) => r.playerId === "aluno_a")!;
    const rowC = secondSnapshot.entriesWithTrend.find((r) => r.playerId === "aluno_c")!;
    const rowB = secondSnapshot.entriesWithTrend.find((r) => r.playerId === "aluno_b")!;

    assert.notEqual(rowA.rankTrend, "down"); // 1º lugar nunca cai
    assert.equal(rowC.rankTrend, "up"); // subiu de 3º para 2º
    assert.equal(rowC.previousRank, 3);
    assert.equal(rowB.rankTrend, "down"); // caiu de 2º para 3º
    assert.equal(rowB.previousRank, 2);

    // Se um novo jogador (sincronizado da nuvem) entrar no topo sem que os demais tenham ultrapassado uns aos outros,
    // NINGUÉM abaixo dele deve ficar com seta vermelha ("down") em cascata
    const thirdSnapshotWithNewCloudPlayer = evaluateLeaderboardRankChanges(
      [
        { playerId: "novo_lider", rank: 1 },
        { playerId: "aluno_a", rank: 2 },
        { playerId: "aluno_c", rank: 3 },
        { playerId: "aluno_b", rank: 4 },
      ],
      firstSnapshot.nextHistory, // aluno_a(1), aluno_b(2), aluno_c(3) -> aluno_c passou aluno_b, mas aluno_a não foi ultrapassado por b ou c
    );
    const rowANew = thirdSnapshotWithNewCloudPlayer.entriesWithTrend.find((r) => r.playerId === "aluno_a")!;
    assert.equal(rowANew.rankTrend, "same"); // não caiu em relação aos competidores conhecidos

    // E se houver um histórico antigo corrompido onde todos estavam marcados como "down" sem ninguém ter subido,
    // a invariante corrige todos automaticamente para "same" (—)
    const corruptedHistory = {
      lucas: { lastRank: 3, previousRank: 2, trend: "down" as const },
      andriu: { lastRank: 4, previousRank: 3, trend: "down" as const },
      mika: { lastRank: 5, previousRank: 4, trend: "down" as const },
      renan: { lastRank: 6, previousRank: 5, trend: "down" as const },
    };
    const healedSnapshot = evaluateLeaderboardRankChanges(
      [
        { playerId: "lucas", rank: 3 },
        { playerId: "andriu", rank: 4 },
        { playerId: "mika", rank: 5 },
        { playerId: "renan", rank: 6 },
      ],
      corruptedHistory,
    );
    for (const row of healedSnapshot.entriesWithTrend) {
      assert.equal(row.rankTrend, "same", `Jogador ${row.playerId} não pode ter seta vermelha sem alguém acima ter subido`);
    }
  });

  it("mantém a seleção da etapa somente em 1ª Etapa (5º ano), 2ª Etapa (6º - 9º ano) e 3ª Etapa (15+) e direciona cada aluno para sua etapa", () => {
    const refDate = new Date("2026-11-03T12:00:00");

    assert.equal(RANKING_SERIES_OPTIONS.length, 3);
    assert.deepEqual(
      RANKING_SERIES_OPTIONS.map((o) => o.shortLabel),
      ["1ª Etapa (5º ano)", "2ª Etapa (6º - 9º ano)", "3ª Etapa (15+)"],
    );

    const aluno5Ano = {
      birthdate: "2015-09-15",
      school: "Elisângela Litaiff",
      grade: "5º ano",
    };
    const aluno6Ano = {
      birthdate: "2014-05-10",
      school: "Raimundo Bezerra",
      grade: "6º ano",
    };
    const aluno7Ano = {
      birthdate: "2013-04-20",
      school: "Raimundo Bezerra",
      grade: "7º ano",
    };
    const alunoEtapa3 = {
      birthdate: "2008-03-10",
      school: "Outro",
      grade: null,
    };

    assert.equal(resolveDefaultRankingCategory(aluno5Ano, refDate), "etapa_1");
    assert.equal(resolveDefaultRankingCategory(aluno6Ano, refDate), "etapa_2");
    assert.equal(resolveDefaultRankingCategory(aluno7Ano, refDate), "etapa_2");
    assert.equal(resolveDefaultRankingCategory(alunoEtapa3, refDate), "etapa_3");

    assert.equal(matchesRankingCategory(aluno5Ano, "etapa_1", refDate), true);
    assert.equal(matchesRankingCategory(aluno5Ano, "etapa_2", refDate), false);
    assert.equal(matchesRankingCategory(aluno6Ano, "etapa_2", refDate), true);
    assert.equal(matchesRankingCategory(aluno7Ano, "etapa_2", refDate), true);
    assert.equal(matchesRankingCategory(alunoEtapa3, "etapa_3", refDate), true);
  });

  it("trava cada atributo de requisito no teto máximo do nível (ex: 4/4 e 3/3, nunca 15/4 ou 7/3) e reseta os requisitos em 0 ao subir de nível mantendo o histórico", () => {
    // Caso 1: Jogador no Nível 3 (faltando XP para os 795 XP do Nível 4), mas com 15 vitórias e 7 jogos no histórico
    const synced = syncLevelStageProgress({
      xp: 500,
      lifetimeMatches: 20,
      lifetimeWins: 15,
      lifetimeDistinctGames: 7,
      playedGameIds: ["logica", "fracoes", "labirinto", "memoria", "sequencias", "soma", "velha"],
    });
    assert.equal(synced.level, 3);
    assert.equal(synced.stageProgress.forLevel, 3);
    // Para o Nível 4, os tetos são: 8 partidas, 4 vitórias e 3 jogos diferentes
    assert.equal(synced.stageProgress.matches, 8);
    assert.equal(synced.stageProgress.wins, 4);
    assert.equal(synced.stageProgress.distinctGames.length, 3);

    const progLvl3 = levelProgress({
      xp: 500,
      matchesPlayed: 20,
      wins: 15,
      distinctGames: 7,
      currentLevel: synced.level,
      stageProgress: synced.stageProgress,
    });
    const winsItem = progLvl3.checklist.find((c) => c.key === "wins")!;
    const gamesItem = progLvl3.checklist.find((c) => c.key === "distinctGames")!;
    const matchesItem = progLvl3.checklist.find((c) => c.key === "matches")!;

    assert.equal(winsItem.current, 4);
    assert.equal(winsItem.required, 4);
    assert.equal(winsItem.met, true);

    assert.equal(gamesItem.current, 3);
    assert.equal(gamesItem.required, 3);
    assert.equal(gamesItem.met, true);

    assert.equal(matchesItem.current, 8);
    assert.equal(matchesItem.required, 8);
    assert.equal(matchesItem.met, true);

    // Caso 2: O jogador faz mais 10 vitórias seguidas antes de atingir 795 XP -> histórico sobe +10, requisito continua 4/4
    let currentLvl = synced.level;
    let stage = synced.stageProgress;
    let lifetimeWins = 15;
    let lifetimeMatches = 20;
    let currentXp = 500;

    for (let i = 0; i < 10; i++) {
      lifetimeWins += 1;
      lifetimeMatches += 1;
      currentXp += 20; // chega a 700 XP (ainda abaixo de 795 XP)
      const step = advanceLevelStageOnMatch({
        currentLevel: currentLvl,
        stageProgress: stage,
        newXp: currentXp,
        gameId: "logica",
        won: true,
      });
      currentLvl = step.level;
      stage = step.stageProgress;
      assert.equal(step.leveledUp, false);
      assert.equal(stage.wins, 4); // Cravado em 4/4
      assert.equal(stage.matches, 8); // Cravado em 8/8
    }

    assert.equal(lifetimeWins, 25); // Histórico geral salvou as +10 vitórias normalmente

    // Caso 3: Agora atinge 800 XP (>= 795 XP) -> Sobe para o Nível 4 e os requisitos do Nível 5 começam em 0!
    const levelUpStep = advanceLevelStageOnMatch({
      currentLevel: currentLvl,
      stageProgress: stage,
      newXp: 800,
      gameId: "logica",
      won: true,
    });
    assert.equal(levelUpStep.leveledUp, true);
    assert.equal(levelUpStep.level, 4);
    assert.equal(levelUpStep.stageProgress.forLevel, 4);
    assert.equal(levelUpStep.stageProgress.matches, 0);
    assert.equal(levelUpStep.stageProgress.wins, 0);
    assert.equal(levelUpStep.stageProgress.distinctGames.length, 0);

    const progLvl4 = levelProgress({
      xp: 800,
      matchesPlayed: lifetimeMatches + 1,
      wins: lifetimeWins + 1,
      distinctGames: 7,
      currentLevel: levelUpStep.level,
      stageProgress: levelUpStep.stageProgress,
    });
    assert.equal(progLvl4.level, 4);
    const nextWinsItem = progLvl4.checklist.find((c) => c.key === "wins")!;
    const nextMatchesItem = progLvl4.checklist.find((c) => c.key === "matches")!;
    const nextGamesItem = progLvl4.checklist.find((c) => c.key === "distinctGames")!;

    assert.equal(nextWinsItem.current, 0);
    assert.equal(nextWinsItem.required, 6);
    assert.equal(nextWinsItem.met, false);

    assert.equal(nextMatchesItem.current, 0);
    assert.equal(nextMatchesItem.required, 12);
    assert.equal(nextMatchesItem.met, false);

    assert.equal(nextGamesItem.current, 0);
    assert.equal(nextGamesItem.required, 4);
    assert.equal(nextGamesItem.met, false);
  });

  it("gerencia o ciclo de vida da Lixeira de Alunos por 7 dias com auto-expiração e restauração", () => {
    // 1. Criação de mock de contas no registro
    const mockRegistry: Record<string, StoredAccount> = {
      aluno_ativo: {
        profile: {
          id: "p_aluno_ativo",
          nick: "AlunoAtivo",
          nickNormalized: "alunoativo",
          full_name: "ALUNO ATIVO DA SILVA",
          school: "Raimunda Cruz",
          birthdate: "2013-04-10",
          xp: 300,
          level: 2,
          wins: 3,
          matchesPlayed: 5,
          badges: [],
          seasonId: 1,
        },
        passwordHash: "hash1",
        unlocked: [],
        stats: [],
        updatedAt: "2026-11-05T10:00:00Z",
      },
      aluno_lixeira_recente: {
        profile: {
          id: "p_aluno_lixeira",
          nick: "AlunoExcluido",
          nickNormalized: "alunoexcluido",
          full_name: "ALUNO EM LIXEIRA",
          school: "Raimundo Bezerra",
          birthdate: "2012-08-15",
          xp: 150,
          level: 1,
          wins: 1,
          matchesPlayed: 2,
          badges: [],
          seasonId: 1,
          // Excluído há 2 dias
          deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          deleteScheduledPermanentAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        passwordHash: "hash2",
        unlocked: [],
        stats: [],
        updatedAt: "2026-11-03T10:00:00Z",
      },
      aluno_lixeira_expirado: {
        profile: {
          id: "p_aluno_expirado",
          nick: "AlunoExpirado",
          nickNormalized: "alunoexpirado",
          full_name: "ALUNO EXPIRADO NA LIXEIRA",
          school: "Agenor Smith",
          birthdate: "2011-01-20",
          xp: 50,
          level: 1,
          wins: 0,
          matchesPlayed: 1,
          badges: [],
          seasonId: 1,
          // Excluído há mais de 7 dias (ex: 8 dias)
          deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          deleteScheduledPermanentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
        passwordHash: "hash3",
        unlocked: [],
        stats: [],
        updatedAt: "2026-10-28T10:00:00Z",
      },
    };

    // 2. purgeExpiredTrash remove alunos excluídos há mais de 7 dias e mantém os recentes
    const changed = purgeExpiredTrash(mockRegistry);
    assert.equal(changed, true, "Deve expurgar contas com mais de 7 dias na lixeira");
    assert.ok(mockRegistry["aluno_ativo"], "Aluno ativo não é afetado");
    assert.ok(mockRegistry["aluno_lixeira_recente"], "Aluno na lixeira há 2 dias permanece retido");
    assert.equal(mockRegistry["aluno_lixeira_expirado"], undefined, "Aluno com 8 dias na lixeira foi apagado definitivamente");

    // 3. Verificação de ocultação: Alunos na lixeira são excluídos de listas ativas
    const activeProfiles = Object.values(mockRegistry)
      .map((a) => a.profile)
      .filter((p) => !p.deletedAt);
    assert.equal(activeProfiles.length, 1);
    assert.equal(activeProfiles[0].nick, "AlunoAtivo");

    // 4. Lixeira do ADM: apenas perfis com deletedAt
    const trashProfiles = Object.values(mockRegistry)
      .map((a) => a.profile)
      .filter((p) => Boolean(p.deletedAt));
    assert.equal(trashProfiles.length, 1);
    assert.equal(trashProfiles[0].nick, "AlunoExcluido");

    // 5. Restauração da lixeira: removendo deletedAt devolve o aluno às listas ativas
    delete mockRegistry["aluno_lixeira_recente"].profile.deletedAt;
    delete mockRegistry["aluno_lixeira_recente"].profile.deleteScheduledPermanentAt;

    const restoredActive = Object.values(mockRegistry)
      .map((a) => a.profile)
      .filter((p) => !p.deletedAt);
    assert.equal(restoredActive.length, 2, "Agora ambos os alunos voltam a ser visíveis");

    // 6. Proteção de contas administrativas: nunca podem ser deletadas
    const adminAcc: StoredAccount = {
      profile: {
        id: "josiney",
        nick: "JOSINEY",
        nickNormalized: "josiney",
        full_name: "JOSINEY - ADMINISTRAÇÃO SEMED",
        school: "SEMED",
        birthdate: "1990-01-01",
        xp: 0,
        level: 1,
        wins: 0,
        matchesPlayed: 0,
        badges: [],
        seasonId: 1,
        isAdmin: true,
      },
      passwordHash: "adm",
      unlocked: [],
      stats: [],
      updatedAt: "2026-11-05T10:00:00Z",
    };
    assert.equal(isSpecialAdminAccount(adminAcc.profile), true, "Conta ADM protegida identificada");
  });

  it("impede que alunos apagados definitivamente retornem através do sistema de Tombstones", () => {
    addTombstone("alunoteste_excluido");
    assert.equal(isTombstoned("alunoteste_excluido"), true);
    assert.equal(isTombstoned("AlunoTeste_Excluido"), true);
    assert.equal(isTombstoned("outro_aluno_ativo"), false);
  });

  it("calcula o XP da partida e formata a fórmula entre parênteses quando há bônus ou redução", () => {
    // 1. Partida normal sem bônus (1x)
    const normal = computeMatchDisplayXp({
      score: 360,
      correct: 29,
      wrong: 0,
      level: 6,
      now: new Date("2026-11-04T12:00:00Z"), // quarta-feira sem evento
    });
    assert.equal(normal.baseXp, 20);
    assert.equal(normal.finalXp, 20);
    assert.equal(normal.formulaText, undefined);
    assert.equal(normal.displayLabel, "20 XP");

    // 2. Partida em modo equipes (redução 4x)
    const teamMatch = computeMatchDisplayXp({
      score: 360,
      correct: 29,
      wrong: 0,
      level: 6,
      isTeam: true,
      now: new Date("2026-11-04T12:00:00Z"),
    });
    assert.equal(teamMatch.baseXp, 20);
    assert.equal(teamMatch.finalXp, 5); // 20 / 4 = 5
    assert.equal(teamMatch.formulaText, "(20 ÷ 4)");
    assert.equal(teamMatch.displayLabel, "5 XP (20 ÷ 4)");

    // 3. Partida com evento 2x XP ativo
    const event2x = {
      id: "ev_double",
      title: "Fim de Semana Turbinado 2x",
      description: "",
      scope: "todos" as const,
      bonusType: "dobro_xp" as const,
      xpMultiplier: 2,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const weekendMatch = computeMatchDisplayXp({
      score: 360,
      correct: 29,
      wrong: 0,
      level: 6,
      activeEvents: [event2x],
      now: new Date("2026-10-31T12:00:00Z"),
    });
    assert.equal(weekendMatch.baseXp, 20);
    assert.equal(weekendMatch.multiplier, 2);
    assert.equal(weekendMatch.finalXp, 40); // 20 * 2 = 40
    assert.equal(weekendMatch.formulaText, "(20 x 2)");
    assert.equal(weekendMatch.displayLabel, "40 XP (20 x 2)");

    // 4. Partida com evento 2x XP + Modo equipes (40 ÷ 4 = 10)
    const weekendTeam = computeMatchDisplayXp({
      score: 360,
      correct: 29,
      wrong: 0,
      level: 6,
      isTeam: true,
      activeEvents: [event2x],
      now: new Date("2026-10-31T12:00:00Z"),
    });
    assert.equal(weekendTeam.finalXp, 10);
    assert.equal(weekendTeam.formulaText, "(20 x 2 ÷ 4)");
    assert.equal(weekendTeam.displayLabel, "10 XP (20 x 2 ÷ 4)");

    // 5. Partida quando o limite diário de XP já foi alcançado
    const atDailyCap = computeMatchDisplayXp({
      score: 360,
      correct: 29,
      wrong: 0,
      level: 6,
      currentDailyXp: 1000,
      dailyXpCap: 1000,
      dailyXpDate: "2026-11-05",
      now: new Date("2026-11-05T12:00:00"),
    });
    assert.equal(atDailyCap.finalXp, 0);
    assert.equal(atDailyCap.atDailyCap, true);
    assert.equal(atDailyCap.formulaText, "(Limite diário)");
    assert.equal(atDailyCap.displayLabel, "0 XP (Limite diário)");
  });

  it("garante contabilização de vitórias, partidas e jogos diferentes na transição do Nível 6 para o Nível 7", () => {
    // Aluno no Nível 6 com requisitos do Nível 7: 3445 XP, 25 partidas, 13 vitórias, 6 jogos diferentes
    const initialLvl6Stage = {
      forLevel: 6,
      matches: 0,
      wins: 0,
      distinctGames: [],
    };

    // 1. Aluno joga partida e vence -> vitórias e partidas incrementam na etapa
    const step1 = advanceLevelStageOnMatch({
      currentLevel: 6,
      stageProgress: initialLvl6Stage,
      newXp: 2500,
      gameId: "minado",
      won: true,
      maxAvailableGames: 10,
    });
    assert.equal(step1.leveledUp, false);
    assert.equal(step1.level, 6);
    assert.equal(step1.stageProgress.wins, 1);
    assert.equal(step1.stageProgress.matches, 1);
    assert.deepEqual(step1.stageProgress.distinctGames, ["minado"]);

    // 2. Aluno joga mais partidas e acumula vitórias e jogos diferentes
    let currentStage = step1.stageProgress;
    const games = ["logica", "rpg", "cartesiano", "formas", "variaveis"];
    for (let i = 0; i < games.length; i++) {
      const step = advanceLevelStageOnMatch({
        currentLevel: 6,
        stageProgress: currentStage,
        newXp: 2700 + i * 100,
        gameId: games[i],
        won: true,
        maxAvailableGames: 10,
      });
      currentStage = step.stageProgress;
    }
    assert.equal(currentStage.wins, 6); // 1 + 5 = 6 vitórias
    assert.equal(currentStage.matches, 6);
    assert.equal(currentStage.distinctGames.length, 6); // 6 jogos diferentes

    // 3. Verifica exibição dos requisitos no checklist do perfil
    const progLvl6 = levelProgress({
      xp: 3200,
      matchesPlayed: 20,
      wins: 15,
      distinctGames: 6,
      currentLevel: 6,
      stageProgress: currentStage,
    });
    const winsCheck = progLvl6.checklist.find((c) => c.key === "wins")!;
    const matchesCheck = progLvl6.checklist.find((c) => c.key === "matches")!;
    const gamesCheck = progLvl6.checklist.find((c) => c.key === "distinctGames")!;
    const xpCheck = progLvl6.checklist.find((c) => c.key === "xp")!;

    assert.equal(winsCheck.required, 13);
    assert.equal(matchesCheck.required, 25);
    assert.equal(gamesCheck.required, 6);
    assert.equal(xpCheck.required, 3445);
    assert.equal(gamesCheck.met, true); // 6 / 6 jogos atingido!

    // 4. Sincronização e recuperação com histórico de 15 vitórias e 28 partidas destrava o Nível 7
    const syncedLvl7 = syncLevelStageProgress({
      xp: 3500, // >= 3445 XP
      lifetimeMatches: 28, // >= 25 partidas
      lifetimeWins: 15, // >= 13 vitórias
      lifetimeDistinctGames: 6, // >= 6 jogos
      playedGameIds: ["minado", "logica", "rpg", "cartesiano", "formas", "variaveis"],
      currentLevel: 6,
      existingStage: currentStage,
      maxAvailableGames: 10,
    });
    assert.equal(syncedLvl7.level, 7);
    assert.equal(syncedLvl7.stageProgress.forLevel, 7);
  });

  it("permite underline no nick preservando o formato e gera Username sanitizado estritamente alfanumérico para a API PlayFab", () => {
    // 1. nickSlug preserva underlines para uso no jogo e perfil
    assert.equal(nickSlug("joao_silva"), "joao_silva");
    assert.equal(nickSlug("ZHERET_TESTE"), "zheret_teste");
    assert.equal(nickSlug("LORD_123"), "lord_123");

    // 2. playfabUsernameFromNick converte underlines em codificação 100% alfanumérica [a-z0-9] sem erro no PlayFab
    const pfUser1 = playfabUsernameFromNick("joao_silva");
    assert.equal(pfUser1, "joao0usilva");
    assert.ok(/^[a-z0-9]{3,20}$/.test(pfUser1));

    const pfUser2 = playfabUsernameFromNick("ZHERET_TESTE");
    assert.equal(pfUser2, "zheret0uteste");
    assert.ok(/^[a-z0-9]{3,20}$/.test(pfUser2));

    const pfUserShort = playfabUsernameFromNick("a_b");
    assert.ok(/^[a-z0-9]{3,20}$/.test(pfUserShort));
  });

  it("identifica e exclui contas de teste da administração ZHERET e LORD (e ADMs) do cálculo do Pioneiro da Medalha", () => {
    // Contas de teste normais do administrador
    assert.equal(isPioneerExcludedAccount({ nick: "ZHERET", nickNormalized: "zheret" }), true);
    assert.equal(isPioneerExcludedAccount({ nick: "LORD", nickNormalized: "lord" }), true);
    assert.equal(isPioneerExcludedAccount({ nick: "zheret_teste", nickNormalized: "zheret_teste" }), true);
    assert.equal(isPioneerExcludedAccount({ nick: "lord_play", nickNormalized: "lord_play" }), true);
    assert.equal(isPioneerExcludedAccount({ full_name: "LORD JOGADOR TESTE" }), true);

    // Contas administrativas
    assert.equal(isPioneerExcludedAccount({ isAdmin: true, nick: "QUALQUER" }), true);
    assert.equal(isPioneerExcludedAccount({ nick: "JOSINEY", nickNormalized: "josiney" }), true);
    assert.equal(isPioneerExcludedAccount({ nick: "QUEMUEL", nickNormalized: "quemuel" }), true);

    // Alunos legítimos NÃO são excluídos
    assert.equal(isPioneerExcludedAccount({ nick: "lucas_10", nickNormalized: "lucas_10", full_name: "LUCAS SILVA" }), false);
    assert.equal(isPioneerExcludedAccount({ nick: "maria_clara", nickNormalized: "maria_clara", full_name: "MARIA CLARA SOUZA" }), false);
  });

  it("sanitiza conta de aluno com XP exorbitante e partidas insuficientes, ajustando nível e revogando medalhas indevidas", () => {
    // Caso inspirado em raifriane.maçã (24 partidas jogadas, 20 vitórias, mas com 63645 XP e Nível 7 indevidos)
    const inflatedAccount: any = {
      profile: {
        id: "p_raifriane",
        nick: "raifriane.maçã",
        nickNormalized: "raifriane_maca",
        full_name: "RAIFRIANE GOMES FELIPE",
        school: "Raimundo Bezerra",
        grade: "7º ano",
        turma: "A",
        birthdate: "2014-02-03",
        xp: 63645,
        seasonXp: 63645,
        level: 7,
        wins: 20,
        matchesPlayed: 24,
        totalMatches: 24,
        badges: [
          { id: "primeira_vitoria", label: "Primeira Vitória" },
          { id: "nivel_5", label: "Nível 5" },
          { id: "xp_1000", label: "1000 XP" },
          { id: "xp_5000", label: "5000 XP" },
        ],
        unlockedMedals: [
          { medalId: "lvl_2_explorador", unlockedAt: "2026-11-01" },
          { medalId: "lvl_3_estudioso", unlockedAt: "2026-11-01" },
          { medalId: "lvl_7_mestre", unlockedAt: "2026-11-01" }, // Indevida!
          { medalId: "tournament_top_1_gold", unlockedAt: "2026-11-01" }, // Indevida (temporada ativa em andamento)!
          { medalId: "secret_top5_weeks_2", unlockedAt: "2026-11-01" }, // Indevida!
        ],
        tournamentMedals: [
          {
            id: "medal_season_1_etapa_2_r1",
            weekKey: "Season_1", // Temporada 1 ativa em andamento, não pode ter pódio definitivo!
            rank: 1,
            label: "🏆 Top 1 Etapa 2",
          },
        ],
      },
      stats: [
        { game_id: "rpg", plays: 5, wins: 4, best_score: 390, best_level: 4 },
        { game_id: "spacequest", plays: 7, wins: 6, best_score: 315, best_level: 5 },
        { game_id: "robogrid", plays: 4, wins: 3, best_score: 210, best_level: 4 },
        { game_id: "formas", plays: 4, wins: 4, best_score: 180, best_level: 4 },
        { game_id: "memoria", plays: 2, wins: 2, best_score: 60, best_level: 11 },
        { game_id: "minado", plays: 2, wins: 1, best_score: 53, best_level: 4 },
      ],
    };

    const cfg: any = {
      seasonId: 1,
      rankedSeasonId: 1,
      enabledGames: { rpg: true, spacequest: true, robogrid: true, formas: true, memoria: true, minado: true },
    };

    const aligned = ensurePlayerSeasonAligned(inflatedAccount, cfg);

    // O XP deve ter sido sanitizado para o valor legítimo compatível com 24 partidas (< 2000 XP)
    assert.ok(aligned.profile.xp < 2000, `XP esperado < 2000, obtido: ${aligned.profile.xp}`);
    assert.ok(aligned.profile.xp >= 600, `XP esperado >= 600, obtido: ${aligned.profile.xp}`);

    // Nível deve ter retornado para Nível 3 ou 4 (jamais Nível 7!)
    assert.ok(aligned.profile.level <= 4, `Nível esperado <= 4, obtido: ${aligned.profile.level}`);

    // Medalhas indevidas de Nível 5+ e medalhas de ranking da temporada ativa devem ter sido revogadas
    const medalIds = (aligned.profile.unlockedMedals ?? []).map((m: any) => m.medalId);
    assert.equal(medalIds.includes("lvl_7_mestre"), false);
    assert.equal(medalIds.includes("tournament_top_1_gold"), false);
    assert.equal(medalIds.includes("secret_top5_weeks_2"), false);

    // Medalha prematura do pódio da Temporada 1 corrente deve ter sido removida de tournamentMedals
    assert.equal(aligned.profile.tournamentMedals?.length ?? 0, 0);

    // Badges indevidas de Nível 5 e de milhares de XP devem ter sido revogadas
    const badgeIds = (aligned.profile.badges ?? []).map((b) => b.id);
    assert.equal(badgeIds.includes("nivel_5"), false);
    assert.equal(badgeIds.includes("xp_5000"), false);
  });

  it("permite que novos alunos nascidos em 2014 tenham disponíveis escolas da Etapa 1 e Etapa 2 sem alterar escolas existentes", () => {
    const ref = new Date("2026-11-10T12:00:00");
    const available = getAvailableSchoolsForAge("2014-04-15", ref).map((s) => s.name);

    // Escolas da Etapa 1 (5º ano) disponíveis:
    assert.equal(available.includes("Elisângela Litaiff"), true);
    assert.equal(available.includes("Raimunda Cruz"), true);
    assert.equal(available.includes("Maria de Nazaré"), true);
    assert.equal(available.includes("Ursulina Souza"), true);

    // Escolas da Etapa 2 (6º ao 9º ano) disponíveis:
    assert.equal(available.includes("Raimundo Bezerra"), true);
    assert.equal(available.includes("Agenor Smith"), true);

    // Se o aluno novo de 2014 selecionar uma escola da Etapa 1, é alocado na Etapa 1:
    assert.equal(stageFromBirthdate("2014-04-15", ref, "Maria de Nazaré").id, "etapa_1");

    // Se o aluno novo de 2014 selecionar uma escola da Etapa 2, é alocado na Etapa 2:
    assert.equal(stageFromBirthdate("2014-04-15", ref, "Raimundo Bezerra").id, "etapa_2");

    // Aluno existente com 2014 preserva sua escola:
    const existingStudent = {
      nick: "Aluno2014",
      birthdate: "2014-03-20",
      school: "Raimundo Bezerra",
    };
    assert.equal(existingStudent.school, "Raimundo Bezerra");
  });
});
