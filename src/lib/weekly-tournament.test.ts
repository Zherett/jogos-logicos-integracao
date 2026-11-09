import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTop5HoldMetrics,
  evaluateTournamentStandings,
  finalizeWeeklyTournamentSeason,
  getTournamentRank,
  getWeekInfo,
  recordWeeklyTournamentAttempt,
  resolveWeeklyTournamentGame,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_DAILY_PAID_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_PAID_ENTRY_COST,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  TOURNAMENT_XP_PER_ENTRY,
  type TournamentPlayerRecord,
} from "./weekly-tournament.ts";
import {
  isX1WindowOpen,
  X1_DAILY_EXTRA_XP_CAP,
  X1_MIN_LEVEL,
} from "./player-profile.ts";
import { evaluatePlayerMedals } from "./medals-catalog.ts";
import { accumulateTournamentMedal, ensurePlayerSeasonAligned } from "./playfab.ts";

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
    const saturday = new Date("2026-10-31T14:00:00");
    const sundayNight = new Date("2026-11-01T23:59:00");
    const mondayMorning = new Date("2026-11-02T00:01:00");
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
});
