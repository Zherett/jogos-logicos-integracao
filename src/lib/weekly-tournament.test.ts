import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  claimRankedMilestoneReward,
  computeTop5HoldMetrics,
  countUnlockedRankedMedals,
  countUnlockedTournamentRanks,
  evaluateTournamentStandings,
  finalizeWeeklyTournamentSeason,
  finalizeRankedSeasonAndAwardMedalsViaInbox,
  getTournamentSeasonGroupId,
  getTournamentRank,
  getTournamentStoreRecord,
  getWeekInfo,
  recordWeeklyTournamentAttempt,
  resolveCanonicalTournamentPoints,
  resolveWeeklyTournamentGame,
  sanitizeTournamentRecordForCloud,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_PAID_ENTRY_COST,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  TOURNAMENT_XP_PER_ENTRY,
  type TournamentPlayerRecord,
  type WeeklyTournamentStore,
} from "./weekly-tournament.ts";
import {
  isX1WindowOpen,
  X1_DAILY_EXTRA_XP_CAP,
  X1_MIN_LEVEL,
} from "./player-profile.ts";
import { evaluatePlayerMedals } from "./medals-catalog.ts";
import { accumulateTournamentMedal, ensurePlayerSeasonAligned } from "./playfab.ts";
import { getInboxMessagesForRecipient, claimInboxReward } from "./inbox-messages.ts";

describe("Torneio Semanal Ranqueado (Nível 3+) e Regras da Arena X1 (Nível 5+, 07h–19h)", () => {
  it("valida os requisitos de nível e limites de XP extra diário (100 XP X1 + 100 XP Ranqueada em 10 entradas gratuitas e até 60 entradas diárias totais)", () => {
    assert.equal(X1_MIN_LEVEL, 5);
    assert.equal(TOURNAMENT_MIN_LEVEL, 3);
    assert.equal(X1_DAILY_EXTRA_XP_CAP, 100);
    assert.equal(TOURNAMENT_DAILY_EXTRA_XP_CAP, 100);
    assert.equal(TOURNAMENT_DAILY_FREE_ENTRIES, 10);
    assert.equal(TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT, 50);
    assert.equal(TOURNAMENT_DAILY_ENTRIES_LIMIT, 60);
    assert.equal(TOURNAMENT_PAID_ENTRY_COST, 5);
    assert.equal(TOURNAMENT_DAILY_FREE_ENTRIES * TOURNAMENT_XP_PER_ENTRY, 100);
  });

  it("verifica a janela de funcionamento da Arena X1 (aberta das 07:00 às 19:00 e fechada fora desse horário)", () => {
    const morning = new Date("2026-10-31T08:30:00");
    const afternoon = new Date("2026-10-31T18:59:00");
    const night = new Date("2026-10-31T19:05:00");
    const dawn = new Date("2026-10-31T06:30:00");

    assert.equal(isX1WindowOpen(morning, 7, 19, false), true);
    assert.equal(isX1WindowOpen(afternoon, 7, 19, false), true);
    assert.equal(isX1WindowOpen(night, 7, 19, false), false);
    assert.equal(isX1WindowOpen(dawn, 7, 19, false), false);
    // Quando o ADM ativa o forceOpen, abre em qualquer horário
    assert.equal(isX1WindowOpen(night, 7, 19, true), true);
  });

  it("seleciona o jogo da semana automaticamente ou respeita o override do ADM e vira no domingo às 23:59", () => {
    const g1 = resolveWeeklyTournamentGame(100, null);
    const g2 = resolveWeeklyTournamentGame(101, null);
    assert.notEqual(g1, g2);
    assert.equal(resolveWeeklyTournamentGame(100, "rpg"), "rpg");

    // Sábado e Domingo às 23:59 pertencem à mesma semana; Segunda 00:00 inicia nova semana
    const saturday = new Date("2026-10-31T14:00:00-04:00");
    const sundayNight = new Date("2026-11-01T23:59:00-04:00");
    const mondayMorning = new Date("2026-11-02T00:01:00-04:00");
    assert.equal(getWeekInfo(saturday).weekKey, getWeekInfo(sundayNight).weekKey);
    assert.notEqual(getWeekInfo(sundayNight).weekKey, getWeekInfo(mondayMorning).weekKey);
  });

  it("calcula minutos de permanência no Top 5 e prioriza estritamente os pontos no ranking", () => {
    const now = 1_000_000_000;
    const oneHourAgo = now - 60 * 60_000; // 60 minutos no Top 5

    const metrics = computeTop5HoldMetrics(
      { activeTop5Since: oneHourAgo, accumulatedTop5Ms: 0 },
      now,
    );
    assert.equal(metrics.holdMinutes, 60);
    assert.equal(metrics.holdBonusPoints, 0); // Não infla pontos de rank de forma fantasma

    const records: Record<string, TournamentPlayerRecord> = {
      p1: {
        playerId: "p1",
        nick: "VeteranoTop",
        fullName: "ALUNO UM",
        school: "Raimundo Bezerra",
        level: 5,
        tournamentPoints: 100,
        bestScore: 100,
        totalEntries: 4,
        activeTop5Since: oneHourAgo,
        accumulatedTop5Ms: 0,
        updatedAt: now - 10_000,
      },
      p2: {
        playerId: "p2",
        nick: "NovatoRecente",
        fullName: "ALUNO DOIS",
        school: "Elisângela Litaiff",
        level: 4,
        tournamentPoints: 105, // 5 pontos a mais no ranking
        bestScore: 105,
        totalEntries: 1,
        activeTop5Since: now,
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
    };

    const res = evaluateTournamentStandings(records, now);
    // p2 tem 105 pts e deve estar em 1º lugar, superando p1 (100 pts) independentemente do tempo de Top 5
    assert.equal(res.top5[0].playerId, "p2");
    assert.equal(res.top5[0].tournamentPoints, 105);
    assert.equal(res.top5[0].projectedMedal.tier, "gold");
    assert.equal(res.top5[1].playerId, "p1");
    assert.equal(res.top5[1].tournamentPoints, 100);
    assert.equal(res.top5[1].projectedMedal.tier, "silver");
  });

  it("ordena o ranking corretamente garantindo que Douglas (27 pts) fique em 1º acima de outros alunos", () => {
    const now = 1_000_000_000;
    const records: Record<string, TournamentPlayerRecord> = {
      kaylon: {
        playerId: "kaylon",
        nick: "kaylon",
        fullName: "Kaylon Silva",
        school: "Raimundo Bezerra",
        stage: "etapa_2",
        level: 4,
        tournamentPoints: 5,
        bestScore: 5,
        totalEntries: 1,
        activeTop5Since: now - 86400000, // 24h atrás
        accumulatedTop5Ms: 0,
        updatedAt: now - 86400000,
      },
      breno: {
        playerId: "breno",
        nick: "breno santos",
        fullName: "Breno Santos",
        school: "Raimundo Bezerra",
        stage: "etapa_2",
        level: 4,
        tournamentPoints: 3,
        bestScore: 3,
        totalEntries: 3,
        activeTop5Since: now - 86400000, // 24h atrás
        accumulatedTop5Ms: 0,
        updatedAt: now - 86400000,
      },
      douglas: {
        playerId: "douglas",
        nick: "douglas",
        fullName: "Douglas Aluno",
        school: "Raimundo Bezerra",
        stage: "etapa_2",
        level: 3,
        tournamentPoints: 27,
        bestScore: 27,
        totalEntries: 4,
        activeTop5Since: null, // acabou de pontuar
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
      delas: {
        playerId: "delas",
        nick: "delas",
        fullName: "Delas Aluno",
        school: "Raimundo Bezerra",
        stage: "etapa_2",
        level: 4,
        tournamentPoints: 8,
        bestScore: 8,
        totalEntries: 1,
        activeTop5Since: null,
        accumulatedTop5Ms: 0,
        updatedAt: now - 1000,
      },
    };

    const res = evaluateTournamentStandings(records, now, "etapa_2");
    assert.equal(res.top5.length, 4);
    assert.equal(res.top5[0].nick, "douglas");
    assert.equal(res.top5[0].tournamentPoints, 27);
    assert.equal(res.top5[0].rank, 1);

    assert.equal(res.top5[1].nick, "delas");
    assert.equal(res.top5[1].tournamentPoints, 8);
    assert.equal(res.top5[1].rank, 2);

    assert.equal(res.top5[2].nick, "kaylon");
    assert.equal(res.top5[2].tournamentPoints, 5);
    assert.equal(res.top5[2].rank, 3);

    assert.equal(res.top5[3].nick, "breno santos");
    assert.equal(res.top5[3].tournamentPoints, 3);
    assert.equal(res.top5[3].rank, 4);
  });

  it("garante que tempo de permanência não influencia o desempate, apenas pontuação de partidas", () => {
    const now = 1_000_000_000;
    const records: Record<string, TournamentPlayerRecord> = {
      jogadorA: {
        playerId: "jogadorA",
        nick: "JogadorA",
        fullName: "Jogador A",
        school: "Escola 1",
        stage: "etapa_2",
        level: 3,
        tournamentPoints: 20,
        bestScore: 20,
        totalEntries: 2,
        activeTop5Since: now - 500000, // ficou muito tempo no Top 5
        accumulatedTop5Ms: 1000000,
        updatedAt: now - 500,
      },
      jogadorB: {
        playerId: "jogadorB",
        nick: "JogadorB",
        fullName: "Jogador B",
        school: "Escola 2",
        stage: "etapa_2",
        level: 3,
        tournamentPoints: 20,
        bestScore: 20,
        totalEntries: 2,
        activeTop5Since: null, // 0 tempo no Top 5
        accumulatedTop5Ms: 0,
        updatedAt: now - 1000, // pontuou antes!
      },
    };

    const res = evaluateTournamentStandings(records, now, "etapa_2");
    // JogadorB pontuou antes (updatedAt menor), então fica na frente mesmo tendo 0 tempo de permanência
    assert.equal(res.top5[0].playerId, "jogadorB");
    assert.equal(res.top5[1].playerId, "jogadorA");
  });

  it("separa o Top 5 por Etapa (Faixa Etária) para que um jogador de 20 anos (3ª Etapa) não desbanque um aluno de 10 anos (1ª Etapa)", () => {
    const now = 1_000_000_000;
    const records: Record<string, TournamentPlayerRecord> = {
      kid10: {
        playerId: "kid10",
        nick: "Aluno10Anos",
        fullName: "CRIANCA DEZ ANOS",
        school: "Elisângela Litaiff",
        age: 10,
        stage: "etapa_1",
        level: 4,
        bestScore: 120,
        totalEntries: 3,
        activeTop5Since: now,
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
      adult20: {
        playerId: "adult20",
        nick: "Jovem20Anos",
        fullName: "JOVEM VINTE ANOS",
        school: "Raimundo Bezerra",
        age: 20,
        stage: "etapa_3",
        level: 8,
        bestScore: 350,
        totalEntries: 5,
        activeTop5Since: now,
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
    };

    const etapa1 = evaluateTournamentStandings(records, now, "etapa_1");
    const etapa3 = evaluateTournamentStandings(records, now, "etapa_3");
    const geral = evaluateTournamentStandings(records, now, "TODAS");

    // Na 1ª Etapa (até 11 anos), o aluno de 10 anos é 1º colocado (Ouro)!
    assert.equal(etapa1.top5.length, 1);
    assert.equal(etapa1.top5[0].playerId, "kid10");
    assert.equal(etapa1.top5[0].rank, 1);
    assert.equal(etapa1.top5[0].projectedMedal.tier, "gold");

    // Na 3ª Etapa (15+ anos), o jovem de 20 anos é 1º colocado da faixa dele
    assert.equal(etapa3.top5.length, 1);
    assert.equal(etapa3.top5[0].playerId, "adult20");
    assert.equal(etapa3.top5[0].rank, 1);

    // E no Ranking Geral secundário ("TODAS"), ambos aparecem listados
    assert.equal(geral.top5.length, 2);
  });

  it("calcula corretamente os 19 ranks ranqueados (Bronze I até Mestre 850+) e progressão percentual", () => {
    // Bronze (0 - 90)
    assert.equal(getTournamentRank(0).currentRank.name, "Bronze I");
    assert.equal(getTournamentRank(30).currentRank.name, "Bronze I");
    assert.equal(getTournamentRank(31).currentRank.name, "Bronze II");
    assert.equal(getTournamentRank(60).currentRank.name, "Bronze II");
    assert.equal(getTournamentRank(61).currentRank.name, "Bronze III");
    assert.equal(getTournamentRank(90).currentRank.name, "Bronze III");

    // Prata (91 - 240)
    assert.equal(getTournamentRank(91).currentRank.name, "Prata I");
    assert.equal(getTournamentRank(141).currentRank.name, "Prata II");
    assert.equal(getTournamentRank(191).currentRank.name, "Prata III");

    // Ouro (241 - 450)
    assert.equal(getTournamentRank(241).currentRank.name, "Ouro I");
    assert.equal(getTournamentRank(311).currentRank.name, "Ouro II");
    assert.equal(getTournamentRank(381).currentRank.name, "Ouro III");

    // Platina (451 - 680)
    assert.equal(getTournamentRank(451).currentRank.name, "Platina I");
    assert.equal(getTournamentRank(508).currentRank.name, "Platina II");
    assert.equal(getTournamentRank(565).currentRank.name, "Platina III");
    assert.equal(getTournamentRank(622).currentRank.name, "Platina IV");

    // Diamante (681 - 849)
    assert.equal(getTournamentRank(681).currentRank.name, "Diamante I");
    assert.equal(getTournamentRank(715).currentRank.name, "Diamante II");
    assert.equal(getTournamentRank(749).currentRank.name, "Diamante III");
    assert.equal(getTournamentRank(783).currentRank.name, "Diamante IV");
    assert.equal(getTournamentRank(817).currentRank.name, "Diamante V");

    // Mestre (850+)
    const mestre = getTournamentRank(850);
    assert.equal(mestre.currentRank.name, "Mestre");
    assert.equal(mestre.nextRank, null);
    assert.equal(mestre.progressPercent, 100);

    const mestrePlus = getTournamentRank(1500);
    assert.equal(mestrePlus.currentRank.name, "Mestre");
  });

  it("aplica a regra de pontuação ranqueada (10 base, -1 por erro, piso mínimo de 1 pt ao concluir, +25 bônus diário de 10 partidas perfeitas)", async () => {
    const baseProfile = {
      id: "student_test_1",
      nick: "AlunoRanqueado",
      full_name: "ALUNO TESTE",
      school: "Escola Teste",
      birthdate: "2015-05-10",
      level: 4,
      xp: 400,
      tournamentPoints: 0,
    };

    // 1. Partida com 10 acertos e 0 erros: 10 - 0 = +10 pontos
    const r1 = await recordWeeklyTournamentAttempt({
      profile: baseProfile as any,
      score: 100,
      correct: 10,
      wrong: 0,
    });
    assert.equal(r1.pointsDelta, 10);
    assert.equal(r1.newTournamentPoints, 10);
    assert.equal(r1.currentRank.name, "Bronze I");

    // 2. Partida com 2 erros: 10 - 2 = +8 pontos -> Total 18
    const r2 = await recordWeeklyTournamentAttempt({
      profile: { ...baseProfile, tournamentPoints: 10 } as any,
      score: 80,
      correct: 8,
      wrong: 2,
    });
    assert.equal(r2.pointsDelta, 8);
    assert.equal(r2.newTournamentPoints, 18);

    // 3. Partida com 1 erro: 10 - 1 = +9 pontos -> Total 27
    const r3 = await recordWeeklyTournamentAttempt({
      profile: { ...baseProfile, tournamentPoints: 18 } as any,
      score: 90,
      correct: 9,
      wrong: 1,
    });
    assert.equal(r3.pointsDelta, 9);
    assert.equal(r3.newTournamentPoints, 27);

    // 4. Partida com 9 erros: 10 - 9 = 1 ponto. Piso mínimo de 1 ponto garantido! -> Total 28
    const r4 = await recordWeeklyTournamentAttempt({
      profile: { ...baseProfile, tournamentPoints: 27 } as any,
      score: 10,
      correct: 1,
      wrong: 9,
    });
    assert.equal(r4.pointsDelta, 1);
    assert.equal(r4.newTournamentPoints, 28);

    // 5. Partida com mais de 10 erros (ex: 12 erros): nunca dá menos que 1 ponto! -> Total 29
    const r5 = await recordWeeklyTournamentAttempt({
      profile: { ...baseProfile, tournamentPoints: 28 } as any,
      score: 0,
      correct: 0,
      wrong: 12,
    });
    assert.equal(r5.pointsDelta, 1);
    assert.equal(r5.newTournamentPoints, 29);

    // 6. Garante que perfis de administradores reais (Josiney / Quemuel) pontuam normalmente e aparecem na classificação
    const rJosiney = await recordWeeklyTournamentAttempt({
      profile: {
        ...baseProfile,
        id: "p_josiney",
        nick: "ZHERET",
        nickNormalized: "josiney",
        isAdmin: true,
        tournamentPoints: 0,
      } as any,
      score: 100,
      correct: 10,
      wrong: 0,
    });
    assert.equal(rJosiney.pointsDelta, 10);
    assert.equal(rJosiney.newTournamentPoints, 10);
    assert.ok(rJosiney.standing !== null);
  });

  it("concede as medalhas de maestria ao alcançar o ápice de cada liga (Bronze III, Prata III, etc)", () => {
    const profBronze3 = {
      id: "p_bronze",
      tournamentPoints: 61,
      unlockedMedals: [],
    };
    const medalsBronze3 = evaluatePlayerMedals({ profile: profBronze3 as any, stats: [] });
    assert.ok(medalsBronze3.some((m) => m.id === "tour_master_bronze"));
    assert.ok(!medalsBronze3.some((m) => m.id === "tour_master_prata"));

    const profPrata3 = {
      id: "p_prata",
      tournamentPoints: 191,
      unlockedMedals: [{ medalId: "tour_master_bronze", earnedAt: "2026-11-01" }],
    };
    const medalsPrata3 = evaluatePlayerMedals({ profile: profPrata3 as any, stats: [] });
    assert.ok(medalsPrata3.some((m) => m.id === "tour_master_prata"));

    const profMestre = {
      id: "p_mestre",
      tournamentPoints: 850,
      unlockedMedals: [],
    };
    const medalsMestre = evaluatePlayerMedals({ profile: profMestre as any, stats: [] });
    assert.ok(medalsMestre.some((m) => m.id === "tour_master_mestre"));
  });

  it("acumula contagem para medalhas semanais repetidas ao invés de duplicar", () => {
    const initialMedals = [
      {
        id: "tour_medal_1",
        weekKey: "2026-W44",
        gameId: "termux" as const,
        rank: 1,
        tier: "gold" as const,
        label: "🥇 Campeão Semanal",
        heldMinutes: 30,
        bonusXpAwarded: 150,
        earnedAt: "2026-11-01T23:59:00Z",
        count: 1,
      },
    ];

    // Ganha outro ouro semanal em semana posterior
    const updated = accumulateTournamentMedal(initialMedals, {
      id: "tour_medal_2",
      weekKey: "2026-W45",
      gameId: "calc" as const,
      rank: 1,
      tier: "gold" as const,
      label: "🥇 Campeão Semanal",
      heldMinutes: 60,
      bonusXpAwarded: 150,
      earnedAt: "2026-11-08T23:59:00Z",
    });

    // Deve ter 1 elemento com count = 2
    assert.equal(updated.length, 1);
    assert.equal(updated[0].count, 2);
    assert.equal(updated[0].heldMinutes, 60);
  });

  it("NÃO concede medalha permanente no meio da semana (apenas projeção temporária com prefixo projected_)", async () => {
    const student = {
      id: "aluno_top1_quarta",
      nick: "AlunoQuarta",
      full_name: "ALUNA QUARTA",
      school: "Escola Centro",
      birthdate: "2015-05-10",
      level: 4,
      xp: 400,
      tournamentPoints: 0,
      tournamentMedals: [],
    };

    const res = await recordWeeklyTournamentAttempt({
      profile: student as any,
      score: 100,
      correct: 10,
      wrong: 0,
    });

    // A medalha projetada gerada possui o prefixo projected_ e NÃO é gravada permanentemente no perfil durante a semana
    assert.ok(res.awardedMedal, "Deve retornar projeção de medalha para o Top 1");
    assert.ok(res.awardedMedal.id.startsWith("projected_"), "Medalha deve ser apenas projeção temporária durante a semana");
  });

  it("ensurePlayerSeasonAligned remove medalhas prematuras da semana corrente que ainda está em disputa", () => {
    const { weekKey } = getWeekInfo();
    const mockAccount: any = {
      profile: {
        id: "aluna_com_medalha_prematura",
        tournamentWeekKey: weekKey,
        tournamentMedals: [
          {
            id: `medal_${weekKey}_etapa_1_r1`,
            weekKey: weekKey, // Medalha indevida emitida na semana em andamento
            rank: 1,
            label: "🥇 Top 1 1ª Etapa (Memória das Cores)",
          },
          {
            id: "medal_2026-W40_etapa_1_r1",
            weekKey: "2026-W40", // Medalha legítima de semana já encerrada
            rank: 1,
            label: "🥇 Top 1 1ª Etapa (Semana 40)",
          },
        ],
      },
      stats: [],
    };

    const aligned = ensurePlayerSeasonAligned(mockAccount, {} as any);
    // A medalha da semana corrente deve ter sido removida!
    assert.equal(aligned.profile.tournamentMedals?.length, 1);
    assert.equal(aligned.profile.tournamentMedals?.[0].weekKey, "2026-W40");
  });

  it("garante preservação de tournamentPoints e rankId no alinhamento da temporada", () => {
    const { weekKey } = getWeekInfo();
    const mockAccount: any = {
      profile: {
        id: "jogador_ranqueado_ativo",
        tournamentWeekKey: weekKey,
        tournamentPoints: 45,
        tournamentRankId: "bronze_2",
        dailyTournamentEntries: 3,
        dailyTournamentXp: 30,
      },
      stats: [],
    };

    const aligned = ensurePlayerSeasonAligned(mockAccount, {} as any);
    assert.equal(aligned.profile.tournamentPoints, 45);
    assert.equal(aligned.profile.tournamentRankId, "bronze_2");
    assert.equal(aligned.profile.tournamentWeekKey, weekKey);
  });

  it("restaura pontuação e patente automaticamente a partir de bestTournamentPoints se points foi zerado indevidamente na virada de semana", () => {
    const mockAccount: any = {
      profile: {
        id: "ana-banana",
        tournamentWeekKey: "2026-W45", // semana anterior
        tournamentPoints: 0, // zerado acidentalmente
        bestTournamentPoints: 145, // havia alcançado Prata II
        tournamentRankId: "bronze_1",
      },
      stats: [],
    };

    const aligned = ensurePlayerSeasonAligned(mockAccount, {} as any);
    assert.equal(aligned.profile.tournamentPoints, 145);
    assert.equal(aligned.profile.tournamentRankId, "prata_2");
  });

  it("calcula a chave correta do grupo de torneio compartilhado por temporada (TOURNAMENT_SEASON_X)", () => {
    assert.equal(getTournamentSeasonGroupId(1), "TOURNAMENT_SEASON_1");
    assert.equal(getTournamentSeasonGroupId(2), "TOURNAMENT_SEASON_2");
    assert.equal(getTournamentSeasonGroupId(10), "TOURNAMENT_SEASON_10");
  });

  it("rito solene de encerramento: envia cartas oficiais com medalhas anexadas ao Correio dos 5 primeiros colocados e permite resgate", async () => {
    const mockStore: WeeklyTournamentStore = {
      seasonId: 1,
      weekKey: "2026-W45",
      gameId: "logica",
      records: {
        "campeao-etapa2": {
          playerId: "campeao-etapa2",
          nick: "campeao2",
          fullName: "Aluno Campeão Etapa 2",
          school: "Escola Modelo",
          age: 13,
          stage: "etapa_2",
          level: 8,
          bestScore: 250,
          totalEntries: 20,
          tournamentPoints: 250,
          activeTop5Since: null,
          accumulatedTop5Ms: 120_000,
          updatedAt: Date.now(),
        },
        "vice-etapa2": {
          playerId: "vice-etapa2",
          nick: "vice2",
          fullName: "Aluno Vice Etapa 2",
          school: "Escola Modelo",
          age: 13,
          stage: "etapa_2",
          level: 7,
          bestScore: 200,
          totalEntries: 15,
          tournamentPoints: 200,
          activeTop5Since: null,
          accumulatedTop5Ms: 90_000,
          updatedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    };

    const res = await finalizeRankedSeasonAndAwardMedalsViaInbox(1, mockStore);
    assert.ok(res.totalMedalsAwarded >= 2);
    assert.ok(res.podiumSummary.etapa_2.length >= 2);

    // Verifica que a mensagem chegou ao correio do campeão (idempotente, sem XP oculto quando zerado)
    const inbox = getInboxMessagesForRecipient("campeao-etapa2");
    const seasonMsg = inbox.find((m) => m.title.includes("Campeão da Temporada 1"));
    assert.ok(seasonMsg, "Carta de campeão deve existir no correio do aluno");
    assert.equal(seasonMsg.reward?.type, "medal");
    assert.equal(seasonMsg.reward?.medalId, "tournament_top_1_gold");
    assert.equal(seasonMsg.rewards?.length, 1, "Sem XP/pontos/moedas configurados (>0), envia apenas a medalha");

    // Re-executar para a mesma temporada NÃO duplica carta no Correio
    await finalizeRankedSeasonAndAwardMedalsViaInbox(1, mockStore);
    const inboxAfterDup = getInboxMessagesForRecipient("campeao-etapa2").filter((m) =>
      m.title.includes("Campeão da Temporada 1"),
    );
    assert.equal(inboxAfterDup.length, 1);

    // O aluno resgata a medalha pelo correio sem XP oculto
    const mockStudentProfile: any = {
      id: "campeao-etapa2",
      nick: "campeao2",
      xp: 1000,
      seasonXp: 1000,
      level: 4,
      tournamentMedals: [],
      unlockedMedals: [],
      claimedInboxRewardIds: [],
    };

    const claimRes = claimInboxReward(seasonMsg.id, mockStudentProfile);
    assert.equal(claimRes.success, true);
    assert.equal(
      claimRes.profile.unlockedMedals?.some((m) => m.medalId === "tournament_top_1_gold"),
      true,
    );
    assert.equal(claimRes.profile.xp, 1000, "Com XP=0 na config do ADM, não injeta XP oculto");
  });

  it("aplica troféus automaticamente ao Top 3, envia prêmios customizados do ADM no Correio e mantém merge/ofensiva mensal idempotentes", async () => {
    const { DEFAULT_ADMIN_CONFIG, saveAdminConfig } = await import("./game-codes.ts");
    const { mergeTournamentMedalsList } = await import("./playfab.ts");
    const { getTop1ConsecutiveWeeks } = await import("./medals-catalog.ts");
    const { accumulateTournamentMedal } = await import("./player-profile.ts");

    const hadWindow = typeof (globalThis as any).window !== "undefined";
    const prevWindow = (globalThis as any).window;
    const memStorage = new Map<string, string>();
    if (!hadWindow) {
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => (memStorage.has(k) ? memStorage.get(k)! : null),
          setItem: (k: string, v: string) => memStorage.set(k, String(v)),
          removeItem: (k: string) => memStorage.delete(k),
          clear: () => memStorage.clear(),
        },
        dispatchEvent: () => true,
      };
    }

    // Registra vencedor no registry local para testar aplicação automática do troféu
    const REG_KEY = "desafios-playfab-registry-v1";
    const prevReg = window.localStorage.getItem(REG_KEY);
    try {
      // Configura prêmios customizados no Top 1 (medalha + XP + pontos + moedas + baú + pacote) e Top 2 zerado exceto medalha
      saveAdminConfig({
        ...DEFAULT_ADMIN_CONFIG,
        playfabTitleId: "",
        tournamentPodiumRewards: {
          1: {
            medalId: "tournament_top_1_gold",
            xp: 250,
            points: 120,
            coins: 40,
            items: [
              { itemCategory: "chest", itemId: "weekly_epic", itemName: "Grande Baú Semanal", quantity: 1 },
              { itemCategory: "card_pack", itemId: "pack_basico", itemName: "Pacote Básico", quantity: 2 },
            ],
          },
          2: { medalId: "tournament_top_2_silver", xp: 0, points: 0, coins: 0, items: [] },
          3: { medalId: "tournament_top_3_bronze", xp: 0, points: 0, coins: 0, items: [] },
          4: { medalId: "tour_master_bronze", xp: 0, points: 50, coins: 0, items: [] },
          5: { medalId: null, xp: 0, points: 0, coins: 0, items: [] },
        },
      });
      window.localStorage.setItem(
        REG_KEY,
        JSON.stringify({
          "camp-s2": {
            profile: {
              id: "camp-s2",
              nick: "CampeaoMensal",
              nickNormalized: "campeaomensal",
              xp: 500,
              seasonXp: 500,
              pointsBalance: 100,
              careerPoints: 100,
              coins: 10,
              lifetimeCoins: 10,
              peakCoins: 10,
              level: 3,
              matchesPlayed: 5,
              wins: 5,
              unlockedMedals: [],
              tournamentMedals: [],
              claimedInboxRewardIds: [],
              unopenedChests: {},
              unopenedPacks: {},
            },
            stats: [],
            unlocked: [],
            updatedAt: new Date().toISOString(),
          },
        }),
      );

      const mockStore: WeeklyTournamentStore = {
        weekKey: "2027-W05",
        seasonId: 2,
        gameId: "logica",
        records: {
          "camp-s2": {
            playerId: "camp-s2",
            nick: "CampeaoMensal",
            fullName: "Aluno Campeão Mensal",
            school: "Escola Modelo",
            age: 13,
            stage: "etapa_2",
            level: 5,
            bestScore: 500,
            totalEntries: 20,
            tournamentPoints: 500,
            activeTop5Since: null,
            accumulatedTop5Ms: 60_000,
            updatedAt: Date.now(),
          },
        },
        updatedAt: Date.now(),
      };

      await finalizeRankedSeasonAndAwardMedalsViaInbox(2, mockStore);

      // 1) Troféu de Ouro foi aplicado AUTOMATICAMENTE no perfil do registro local (sem depender de abrir o Correio!)
      const regAfter = JSON.parse(window.localStorage.getItem(REG_KEY)!);
      const savedProf = regAfter["camp-s2"].profile;
      assert.equal(savedProf.tournamentMedals?.length, 1);
      assert.equal(savedProf.tournamentMedals[0].rank, 1);
      assert.equal(savedProf.tournamentMedals[0].count, 1);

      // 2) Carta do Correio contém exatamente Medalha + XP + Pontos + Moedas + 2 Itens (6 recompensas)
      const msgs = getInboxMessagesForRecipient("camp-s2");
      const s2Msg = msgs.find((m) => m.id === "msg_rnk_s2_etapa_2_r1");
      assert.ok(s2Msg, "Carta determinística da Temporada 2 deve existir");
      assert.equal(s2Msg.rewards?.length, 6);

      const claim = claimInboxReward(s2Msg.id, savedProf);
      assert.equal(claim.success, true);
      assert.equal(claim.profile.xp, 750); // 500 + 250
      assert.equal(claim.profile.pointsBalance, 220); // 100 + 120
      assert.equal(claim.profile.coins, 50); // 10 + 40
      assert.equal(claim.profile.unopenedChests?.weekly_epic, 1);
      assert.equal(claim.profile.unopenedPacks?.pack_basico, 2);
      // Troféu NÃO foi duplicado ao resgatar a carta do Correio!
      assert.equal(claim.profile.tournamentMedals?.[0].count, 1);

      // 3) Acumulação multi-mês + merge idempotente (re-aplicar Season_2 após Season_3 não duplica!)
      const s3Medal = {
        ...savedProf.tournamentMedals[0],
        id: "medal_season_3_etapa_2_r1",
        weekKey: "Season_3",
      };
      let list = accumulateTournamentMedal(claim.profile.tournamentMedals ?? [], s3Medal);
      assert.equal(list[0].count, 2);
      // Re-aplicar Season_2 (que já está em historyWeeks) NÃO incrementa para 3!
      list = accumulateTournamentMedal(list, savedProf.tournamentMedals[0]);
      assert.equal(list[0].count, 2);
      const merged = mergeTournamentMedalsList(list, list);
      assert.equal(merged[0].count, 2);

      // 4) getTop1ConsecutiveWeeks reconhece temporadas e meses consecutivos
      assert.equal(
        getTop1ConsecutiveWeeks({
          tournamentMedals: [
            {
              ...s3Medal,
              weekKey: "2027-03",
              historyWeeks: ["2027-01", "2027-02", "2027-03"],
              count: 3,
            },
          ],
        } as any),
        3,
      );

      // 5) executeRankedSeasonResetAsync executa em ordem atômica: avança temporada + inclui cartas em AdminConfig.inboxMessages + zera pontos preservando o troféu recém-aplicado
      const prevFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 200, status: "OK", data: { Data: {} } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      try {
      const { executeRankedSeasonResetAsync } = await import("./playfab.ts");
      saveAdminConfig({
        ...DEFAULT_ADMIN_CONFIG,
        playfabTitleId: "",
        rankedSeasonId: 1,
        rankedSeasonCycleMode: "monthly",
        rankedSeasonEndAt: "2027-01-01T03:59:59.999Z", // 31/12/2026 23:59 UTC-4
        tournamentPodiumRewards: {
          1: { medalId: "tournament_top_1_gold", xp: 100, points: 50, coins: 0, items: [] },
          2: { medalId: "tournament_top_2_silver", xp: 0, points: 0, coins: 0, items: [] },
          3: { medalId: "tournament_top_3_bronze", xp: 0, points: 0, coins: 0, items: [] },
          4: { medalId: "tour_master_bronze", xp: 0, points: 0, coins: 0, items: [] },
          5: { medalId: "tour_master_bronze", xp: 0, points: 0, coins: 0, items: [] },
        },
      });
      window.localStorage.setItem(
        REG_KEY,
        JSON.stringify({
          "camp-async": {
            profile: {
              id: "camp-async",
              nick: "CampeaoAsync",
              nickNormalized: "campeaoasync",
              xp: 500,
              seasonXp: 500,
              tournamentPoints: 400,
              bestTournamentPoints: 400,
              tournamentRankId: "ouro_1",
              rankedSeasonId: 1,
              level: 4,
              matchesPlayed: 5,
              wins: 5,
              unlockedMedals: [],
              tournamentMedals: [],
              claimedInboxRewardIds: [],
            },
            stats: [],
            unlocked: [],
            updatedAt: new Date().toISOString(),
          },
        }),
      );
      window.localStorage.setItem(
        "desafios-weekly-tournament-v1",
        JSON.stringify({
          weekKey: "2026-W53",
          seasonId: 1,
          gameId: "logica",
          records: {
            "camp-async": {
              playerId: "camp-async",
              nick: "CampeaoAsync",
              fullName: "Aluno Campeão Async",
              school: "Escola Modelo",
              age: 13,
              stage: "etapa_2",
              level: 4,
              bestScore: 400,
              totalEntries: 12,
              tournamentPoints: 400,
              activeTop5Since: null,
              accumulatedTop5Ms: 60_000,
              updatedAt: Date.now(),
            },
          },
          updatedAt: Date.now(),
        }),
      );

      const syncedAfterReset = await executeRankedSeasonResetAsync();
      assert.equal(syncedAfterReset.rankedSeasonId, 2);
      assert.equal(syncedAfterReset.rankedSeasonName, "Torneio Mensal Janeiro/2027 • SEMED Coari");
      assert.equal(
        syncedAfterReset.inboxMessages?.some((m) => m.id === "msg_rnk_s1_etapa_2_r1"),
        true,
        "Carta do 1º lugar já deve estar presente em AdminConfig.inboxMessages antes do push na nuvem",
      );
      const regPostAsync = JSON.parse(window.localStorage.getItem(REG_KEY)!);
      assert.equal(regPostAsync["camp-async"].profile.tournamentPoints, 0, "Pontos ranqueados devem zerar");
      assert.equal(regPostAsync["camp-async"].profile.rankedSeasonId, 2);
      assert.equal(regPostAsync["camp-async"].profile.tournamentMedals?.length, 1, "Troféu recém-aplicado deve ser preservado");
      assert.equal(regPostAsync["camp-async"].profile.tournamentMedals[0].rank, 1);
      assert.equal(regPostAsync["camp-async"].profile.tournamentMedals[0].count, 1);
      } finally {
        globalThis.fetch = prevFetch;
      }
    } finally {
      if (prevReg !== null) window.localStorage.setItem(REG_KEY, prevReg);
      else window.localStorage.removeItem(REG_KEY);
      saveAdminConfig(DEFAULT_ADMIN_CONFIG);
      if (!hadWindow) {
        if (prevWindow === undefined) delete (globalThis as any).window;
        else (globalThis as any).window = prevWindow;
      }
    }
  });

  it("reseta deterministamente os pontos de ranqueada apenas quando rankedSeasonId do ADM avança", () => {
    const mockAccount: any = {
      profile: {
        id: "aluno-teste",
        rankedSeasonId: 1,
        tournamentPoints: 120,
        bestTournamentPoints: 120,
        tournamentRankId: "prata_1",
      },
      stats: [],
    };

    // Caso 1: Dentro da Temporada 1 -> mantém 120 pts
    const alignedS1 = ensurePlayerSeasonAligned(mockAccount, { rankedSeasonId: 1 } as any);
    assert.equal(alignedS1.profile.tournamentPoints, 120);
    assert.equal(alignedS1.profile.tournamentRankId, "prata_1");

    // Caso 2: Nova Temporada 2 iniciada no ADM -> zera deterministamente para Bronze I
    const alignedS2 = ensurePlayerSeasonAligned(mockAccount, { rankedSeasonId: 2 } as any);
    assert.equal(alignedS2.profile.tournamentPoints, 0);
    assert.equal(alignedS2.profile.bestTournamentPoints, 0);
    assert.equal(alignedS2.profile.tournamentRankId, "bronze_1");
    assert.equal(alignedS2.profile.rankedSeasonId, 2);
  });

  it("getTournamentStoreRecord resolve a maior pontuação quando houver entradas com chaves diferentes (PlayFabId vs pf_slug)", () => {
    if (typeof window !== "undefined") {
      const mockStore: any = {
        seasonId: 1,
        weekKey: "2026-W45",
        gameId: "tabuada_divertida",
        records: {
          "2F89A56BC78": {
            playerId: "2F89A56BC78",
            nick: "ana-banana",
            tournamentPoints: 147,
            highestRankId: "prata_2",
          },
          "pf_ana-banana": {
            playerId: "pf_ana-banana",
            nick: "ana-banana",
            tournamentPoints: 9,
            highestRankId: "bronze_1",
          },
        },
      };
      window.localStorage.setItem("desafios-weekly-tournament-v1", JSON.stringify(mockStore));

      const byPfId = getTournamentStoreRecord("pf_ana-banana", "ana-banana");
      assert.ok(byPfId);
      assert.equal(byPfId.tournamentPoints, 147);

      const byNick = getTournamentStoreRecord(null, "ana-banana");
      assert.ok(byNick);
      assert.equal(byNick.tournamentPoints, 147);

      const bySessionId = getTournamentStoreRecord("2F89A56BC78", null);
      assert.ok(bySessionId);
      assert.equal(bySessionId.tournamentPoints, 147);
    }
  });

  it("fonte única de verdade: resolveCanonicalTournamentPoints ignora bestScore, respeita nível mínimo e mantém paridade com o ranking", () => {
    const now = Date.now();
    // 1. Nunca contamina pontos ranqueados com bestScore bruto de partida
    const pts = resolveCanonicalTournamentPoints({
      level: 5,
      tournamentPoints: 42,
      bestTournamentPoints: 42,
      record: { level: 5, tournamentPoints: 42 },
    });
    assert.equal(pts, 42);

    // 2. Registro sem tournamentPoints explícito não promove bestScore
    const records: Record<string, TournamentPlayerRecord> = {
      alunoA: {
        playerId: "alunoA",
        nick: "AlunoA",
        fullName: "ALUNO A",
        school: "Raimundo Bezerra",
        level: 6,
        bestScore: 950, // pontuação bruta de jogo NÃO pode virar pontos ranqueados
        totalEntries: 2,
        activeTop5Since: null,
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
      alunoB: {
        playerId: "alunoB",
        nick: "AlunoB",
        fullName: "ALUNO B",
        school: "Raimundo Bezerra",
        level: 6,
        tournamentPoints: 85,
        bestScore: 500,
        totalEntries: 1, // mesmo com 1 entrada (evento com multiplicador ou ajuste), não sofre cap diferente
        activeTop5Since: null,
        accumulatedTop5Ms: 0,
        updatedAt: now,
      },
    };
    const evaluated = evaluateTournamentStandings(records, now, "TODAS");
    const rowA = evaluated.allStandings.find((s) => s.playerId === "alunoA");
    const rowB = evaluated.allStandings.find((s) => s.playerId === "alunoB");
    assert.equal(rowA?.tournamentPoints, 0);
    assert.equal(rowB?.tournamentPoints, 85);
    assert.equal(
      resolveCanonicalTournamentPoints({
        level: 6,
        tournamentPoints: 85,
        bestTournamentPoints: 85,
        record: records.alunoB,
      }),
      rowB?.tournamentPoints,
    );

    // 3. Nível abaixo de TOURNAMENT_MIN_LEVEL (3) sempre resulta em 0
    assert.equal(
      resolveCanonicalTournamentPoints({
        level: 2,
        tournamentPoints: 120,
        bestTournamentPoints: 120,
        record: { level: 2, tournamentPoints: 120 },
      }),
      0,
    );

    // 4. Dedução explícita (ex.: entrada paga) não é sobrescrita por bestTournamentPoints
    assert.equal(
      resolveCanonicalTournamentPoints({
        level: 5,
        tournamentPoints: 95,
        bestTournamentPoints: 100,
        record: { level: 5, tournamentPoints: 95 },
      }),
      95,
    );
  });

  it("checkAndApplyScheduledReset ignora data local vencida enquanto o PlayFab não sincronizar a verdade do ADM", async () => {
    const { checkAndApplyScheduledReset } = await import("./playfab.ts");
    const { DEFAULT_ADMIN_CONFIG, saveAdminConfig, loadAdminConfig } = await import("./game-codes.ts");
    if (typeof window === "undefined") return;

    const prevRaw = window.localStorage.getItem("desafios-admin-config-v1");
    try {
      saveAdminConfig({
        ...DEFAULT_ADMIN_CONFIG,
        playfabTitleId: "186F63",
        rankedSeasonId: 1,
        rankedSeasonEndAt: "2020-01-01T00:00:00.000Z", // data vencida no cache local
      });

      // Sem sync prévio do PlayFab neste ciclo de sessão, não deve executar reset local prematuro
      const after = checkAndApplyScheduledReset();
      assert.equal(after.rankedSeasonId, 1);
      assert.equal(loadAdminConfig().rankedSeasonId, 1);
    } finally {
      if (prevRaw !== null) {
        window.localStorage.setItem("desafios-admin-config-v1", prevRaw);
      } else {
        window.localStorage.removeItem("desafios-admin-config-v1");
      }
    }
  });

  it("checkAndApplyScheduledReset não reseta automaticamente quando autoRenewSeason está desativado", async () => {
    const { checkAndApplyScheduledReset } = await import("./playfab.ts");
    const { DEFAULT_ADMIN_CONFIG, saveAdminConfig, loadAdminConfig } = await import("./game-codes.ts");
    if (typeof window === "undefined") return;

    const prevRaw = window.localStorage.getItem("desafios-admin-config-v1");
    try {
      saveAdminConfig({
        ...DEFAULT_ADMIN_CONFIG,
        playfabTitleId: "",
        autoRenewSeason: false,
        rankedSeasonId: 1,
        rankedSeasonEndAt: "2020-01-01T00:00:00.000Z",
        seasonEndAt: "2020-01-01T00:00:00.000Z",
      });

      const after = checkAndApplyScheduledReset({ fromCloudSync: true });
      assert.equal(after.rankedSeasonId, 1);
      assert.equal(after.seasonId, 1);
      assert.equal(loadAdminConfig().rankedSeasonId, 1);
    } finally {
      if (prevRaw !== null) {
        window.localStorage.setItem("desafios-admin-config-v1", prevRaw);
      } else {
        window.localStorage.removeItem("desafios-admin-config-v1");
      }
    }
  });

  it("contabiliza corretamente os 19 ranks alcançados e as 9 medalhas ranqueadas (incluindo análise retroativa)", () => {
    const r0 = countUnlockedTournamentRanks(0);
    assert.equal(r0.totalCount, 19);
    assert.equal(r0.unlockedCount, 1); // Bronze I

    const rOuro = countUnlockedTournamentRanks(250); // Bronze 3 + Prata 3 + Ouro I = 7 ranks
    assert.equal(rOuro.unlockedCount, 7);
    assert.equal(rOuro.unlockedIds.has("ouro_1"), true);
    assert.equal(rOuro.unlockedIds.has("ouro_2"), false);

    const rMestre = countUnlockedTournamentRanks(900);
    assert.equal(rMestre.unlockedCount, 19);

    const medalsRetro = countUnlockedRankedMedals({
      unlockedMedals: [],
      tournamentMedals: [
        {
          id: "tm1",
          weekKey: "2026-W44",
          gameId: "logica",
          rank: 2,
          tier: "silver",
          label: "Vice",
          heldMinutes: 10,
          bonusXpAwarded: 100,
          earnedAt: "2026-11-01T23:59:00Z",
        },
      ],
      tournamentPoints: 10,
      bestTournamentPoints: 200, // Qualifica retroativamente para Bronze III (61+) e Prata III (191+)
    });
    assert.equal(medalsRetro.totalCount, 9);
    assert.equal(medalsRetro.unlockedCount, 3); // top_2_silver + tour_master_bronze + tour_master_prata
  });

  it("resgata recompensa da trilha ranqueada para o inventário, impede duplicidade na temporada e libera em nova temporada", () => {
    const baseProfile: any = {
      id: "p1",
      nick: "AlunoTeste",
      nickNormalized: "alunoteste",
      full_name: "Aluno Teste",
      school: "Raimundo Bezerra",
      grade: "6º ano",
      birthdate: "2014-01-01",
      xp: 500,
      level: 4,
      wins: 10,
      matchesPlayed: 15,
      badges: [],
      seasonId: 1,
      tournamentPoints: 250,
      bestTournamentPoints: 250,
      unopenedPacks: { pack_basico: 1 },
      claimedRankedMilestones: [],
    };

    // Bloqueia rank ainda não alcançado (Ouro II requer 311)
    const lockedRes = claimRankedMilestoneReward({
      profile: baseProfile,
      rankId: "ouro_2",
      seasonId: 1,
      reward: { type: "card_pack", packId: "pack_basico", quantity: 2 },
      currentPoints: 250,
    });
    assert.equal(lockedRes.ok, false);

    // Resgata Ouro I (241+ pts) -> credita 2x pack_basico direto em unopenedPacks
    const okRes = claimRankedMilestoneReward({
      profile: baseProfile,
      rankId: "ouro_1",
      seasonId: 1,
      reward: { type: "card_pack", packId: "pack_basico", quantity: 2 },
      currentPoints: 250,
    });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.updatedProfile?.unopenedPacks?.pack_basico, 3);
    assert.deepEqual(okRes.updatedProfile?.claimedRankedMilestones, ["S1:ouro_1"]);

    // Impede resgate duplicado na mesma temporada
    const dupRes = claimRankedMilestoneReward({
      profile: okRes.updatedProfile!,
      rankId: "ouro_1",
      seasonId: 1,
      reward: { type: "card_pack", packId: "pack_basico", quantity: 2 },
      currentPoints: 250,
    });
    assert.equal(dupRes.ok, false);

    // Permite resgate na Temporada 2
    const s2Res = claimRankedMilestoneReward({
      profile: okRes.updatedProfile!,
      rankId: "ouro_1",
      seasonId: 2,
      reward: { type: "card_pack", packId: "pack_basico", quantity: 1 },
      currentPoints: 250,
    });
    assert.equal(s2Res.ok, true);
    assert.equal(s2Res.updatedProfile?.unopenedPacks?.pack_basico, 4);
  });

  it("Onda 0 (LGPD-01): sanitizeTournamentRecordForCloud remove birthdate, age e fullName antes de publicar", () => {
    const clean = sanitizeTournamentRecordForCloud({
      playerId: "aluno_1",
      nick: "Aluno_1",
      fullName: "JOAO PEDRO SOUZA",
      school: "Raimunda Cruz",
      birthdate: "2015-04-12",
      age: 11,
      stage: "etapa_1",
      level: 5,
      bestScore: 100,
      totalEntries: 3,
      tournamentPoints: 30,
      activeTop5Since: null,
      accumulatedTop5Ms: 0,
      updatedAt: 1_000_000,
    });
    assert.equal("birthdate" in clean, false);
    assert.equal("age" in clean, false);
    assert.equal(clean.fullName, "");
    assert.equal(clean.nick, "Aluno_1");
    assert.equal(clean.school, "Raimunda Cruz");
  });

  it("Bloco 1.1 (RANK-04 / RANK-05): claimRankedMilestoneReward valida nível/pontos/moedas/packId e bônus de 10 vitórias perfeitas funciona mesmo após erro anterior", async () => {
    // 1. Nível 1 não pode resgatar nem bronze_1
    const lvl1Res = claimRankedMilestoneReward({
      profile: { id: "p_lvl1", nick: "Novato", nickNormalized: "novato", full_name: "NOVATO", school: "Nenhuma", grade: null, birthdate: "", xp: 0, seasonXp: 0, level: 1, wins: 0, matchesPlayed: 0, badges: [], seasonId: 1 } as any,
      rankId: "bronze_1",
      seasonId: 1,
      reward: { type: "points", quantity: 10 },
      currentPoints: 100,
    });
    assert.equal(lvl1Res.ok, false);

    // 2. Nível 3 com 0 pts não pode resgatar bronze_1; Infinity não corrompe; packId é normalizado e allowCoinsRewards=false bloqueia
    const baseEligible = {
      id: "p_lvl4",
      nick: "Elegivel",
      nickNormalized: "elegivel",
      full_name: "ELEGIVEL",
      school: "Nenhuma",
      grade: null,
      birthdate: "",
      xp: 1000,
      seasonXp: 1000,
      level: 4,
      wins: 10,
      matchesPlayed: 15,
      badges: [],
      seasonId: 1,
    } as any;

    const zeroPtsRes = claimRankedMilestoneReward({
      profile: baseEligible,
      rankId: "bronze_1",
      seasonId: 1,
      reward: { type: "points", quantity: 10 },
      currentPoints: 0,
    });
    assert.equal(zeroPtsRes.ok, false);

    const infBlockedRes = claimRankedMilestoneReward({
      profile: baseEligible,
      rankId: "ouro_1",
      seasonId: 1,
      reward: { type: "points", quantity: 10 },
      currentPoints: Number.POSITIVE_INFINITY,
    });
    assert.equal(infBlockedRes.ok, false);

    const coinsBlockedRes = claimRankedMilestoneReward({
      profile: baseEligible,
      rankId: "bronze_1",
      seasonId: 1,
      reward: { type: "coins", quantity: 50 },
      currentPoints: 10,
      allowCoinsRewards: false,
    });
    assert.equal(coinsBlockedRes.ok, false);

    const packClaimRes = claimRankedMilestoneReward({
      profile: baseEligible,
      rankId: "bronze_1",
      seasonId: 1,
      reward: { type: "card_pack", packId: "pack_avancado", quantity: 1, coinsBonus: 30 },
      currentPoints: 10,
      allowCoinsRewards: false,
    });
    assert.equal(packClaimRes.ok, true);
    assert.equal(packClaimRes.updatedProfile?.unopenedPacks?.pack_avancado ?? 0, 0);
    assert.equal(packClaimRes.updatedProfile?.unopenedPacks?.pack_mestre, 1);
    assert.equal(packClaimRes.updatedProfile?.coins ?? 0, 0); // coinsBonus respeitou allowCoinsRewards=false

    // 3. Bônus de 10 partidas perfeitas no mesmo dia (mesmo após 1 partida anterior com erro)
    const hadWindow = typeof (globalThis as any).window !== "undefined";
    const prevWindow = (globalThis as any).window;
    const memStorage = new Map<string, string>();
    if (!hadWindow) {
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => (memStorage.has(k) ? memStorage.get(k)! : null),
          setItem: (k: string, v: string) => memStorage.set(k, String(v)),
          removeItem: (k: string) => memStorage.delete(k),
          clear: () => memStorage.clear(),
        },
        dispatchEvent: () => true,
      };
    }
    try {
      const testProfile = {
        ...baseEligible,
        id: "p_perf10",
        nick: "Perfeito10",
        nickNormalized: "perfeito10",
        tournamentPoints: 0,
      };
      // 1ª partida com 1 erro (não perfeita)
      await recordWeeklyTournamentAttempt({
        profile: testProfile,
        score: 90,
        correct: 9,
        wrong: 1,
      });
      let dailyBonusTriggered = false;
      for (let i = 0; i < 10; i++) {
        const attempt = await recordWeeklyTournamentAttempt({
          profile: { ...testProfile, tournamentPoints: i * 10 },
          score: 100,
          correct: 10,
          wrong: 0,
        });
        if (attempt.dailyBonusAwarded) dailyBonusTriggered = true;
      }
      assert.equal(dailyBonusTriggered, true);
    } finally {
      if (!hadWindow) {
        (globalThis as any).window = prevWindow;
      }
    }
  });
});
