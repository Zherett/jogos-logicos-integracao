import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  recordScoreLedgerEntry,
  getPlayerScoreLedger,
  getAllScoreLedger,
  calculateStudentScoreBreakdown,
  reconstructStudentLedgerFromProfile,
  sanitizeScoreLedgerEntries,
  trimLedgerFairly,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "./score-history-ledger.ts";

describe("Sistema de Histórico e Auditoria de Pontuação (Score Ledger)", () => {
  it("registra entradas no ledger e recupera por ID do jogador", () => {
    const studentId = "aluno_teste_ledger_01";
    const nick = "AlunoTeste01";

    recordScoreLedgerEntry({
      playerId: studentId,
      playerNick: nick,
      type: "xp",
      source: "partida",
      amount: 20,
      balanceAfter: 120,
      reason: "Partida concluída em Campo Minado",
      metadata: { gameId: "minado", mode: "padrao", score: 150, level: 3 },
    });

    recordScoreLedgerEntry({
      playerId: studentId,
      playerNick: nick,
      type: "career_points",
      source: "login_diario",
      amount: 25,
      balanceAfter: 25,
      reason: "Bônus de Login Diário",
    });

    recordScoreLedgerEntry({
      playerId: studentId,
      playerNick: nick,
      type: "medal",
      source: "medalha",
      amount: 1,
      reason: "Medalha: Mestre do Campo Minado",
      metadata: { medalId: "game_minado_lvl_master", medalTitle: "Mestre do Campo Minado" },
    });

    const history = getPlayerScoreLedger(studentId);
    assert.ok(history.length >= 3);
    assert.equal(history[0].playerNick, nick);

    // Filtra apenas por tipo 'xp'
    const xpEntries = getPlayerScoreLedger(studentId, { type: "xp" });
    assert.ok(xpEntries.length >= 1);
    assert.equal(xpEntries[0].type, "xp");
    assert.equal(xpEntries[0].amount, 20);
    assert.equal(xpEntries[0].metadata?.gameId, "minado");
  });

  it("calcula o detalhamento consolidado (breakdown) de pontuação do aluno", () => {
    const sId = "aluno_breakdown_02";
    const nick = "Gamer02";

    recordScoreLedgerEntry({
      playerId: sId,
      playerNick: nick,
      type: "xp",
      source: "partida",
      amount: 40,
      reason: "Partida Robô",
    });

    recordScoreLedgerEntry({
      playerId: sId,
      playerNick: nick,
      type: "xp",
      source: "medalha",
      amount: 30,
      reason: "Medalha Ouro",
    });

    recordScoreLedgerEntry({
      playerId: sId,
      playerNick: nick,
      type: "career_points",
      source: "login_diario",
      amount: 25,
      reason: "Login Diário",
    });

    recordScoreLedgerEntry({
      playerId: sId,
      playerNick: nick,
      type: "career_points",
      source: "primeiro_jogo",
      amount: 10,
      reason: "Primeiro Jogo do Dia",
    });

    recordScoreLedgerEntry({
      playerId: sId,
      playerNick: nick,
      type: "tournament_pts",
      source: "torneio_semanal",
      amount: 15,
      reason: "Vitória na Ranqueada",
    });

    const breakdown = calculateStudentScoreBreakdown(sId);
    assert.equal(breakdown.totalXpFromMatches, 40);
    assert.equal(breakdown.totalXpFromMedals, 30);
    assert.equal(breakdown.totalCareerPoints, 35); // 25 + 10
    assert.equal(breakdown.totalTournamentPoints, 15);
    assert.equal(breakdown.sourcesBreakdown.login_diario.points, 25);
    assert.equal(breakdown.sourcesBreakdown.primeiro_jogo.points, 10);
  });

  it("permite busca dinâmica com termo de pesquisa no ledger geral", () => {
    const queryResult = getAllScoreLedger({ search: "Robô" });
    assert.ok(queryResult.some((r) => r.reason.includes("Robô")));
  });

  it("possui rótulos completos e amigáveis para todos os tipos e fontes", () => {
    assert.ok(TRANSACTION_SOURCE_LABELS.partida.label);
    assert.ok(TRANSACTION_SOURCE_LABELS.arena_x1.label);
    assert.ok(TRANSACTION_SOURCE_LABELS.login_diario.label);
    assert.ok(TRANSACTION_TYPE_LABELS.xp.label);
    assert.ok(TRANSACTION_TYPE_LABELS.career_points.label);
  });

  it("reconstitui sinteticamente o extrato de auditoria a partir do perfil quando o histórico local estiver vazio", () => {
    const mockProfile: any = {
      id: "aluno_reconstrucao_01",
      nick: "raifriane.maçã",
      full_name: "RAIFRIANE GOMES FELIPE",
      school: "Raimundo Bezerra",
      xp: 365,
      careerPoints: 220,
      level: 3,
      stats: [
        { game_id: "robogrid", plays: 5, wins: 4, flawless_wins: 2, best_score: 95 },
        { game_id: "minado", plays: 3, wins: 2, flawless_wins: 1, best_score: 80 },
      ],
      unlockedMedals: [
        { medalId: "m_first_match", unlockedAt: "2026-11-09T10:00:00.000Z" },
        { medalId: "m_plays_10", unlockedAt: "2026-11-09T11:00:00.000Z" },
      ],
    };

    // Consulta extrato sem registros locais gravados: deve acionar a reconstrução sintética
    const entries = getPlayerScoreLedger(mockProfile.id, undefined, mockProfile);
    assert.ok(entries.length > 0, "Deve gerar entradas de auditoria reconstruídas");

    const totalPtsInLedger = entries
      .filter((e) => e.type === "career_points")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalXpInLedger = entries
      .filter((e) => e.type === "xp")
      .reduce((sum, e) => sum + e.amount, 0);

    assert.equal(totalPtsInLedger, 220, "Total de pontos no extrato deve bater exatamente com os 220 pontos do perfil");
    assert.equal(totalXpInLedger, 365, "Total de XP no extrato deve bater exatamente com os 365 XP do perfil");

    // Breakdown consolidado
    const breakdown = calculateStudentScoreBreakdown(mockProfile.id, mockProfile);
    assert.equal(breakdown.totalCareerPoints, 220);
    assert.ok(breakdown.totalXpFromMatches > 0);
    assert.ok(breakdown.totalXpFromMedals > 0);
    assert.ok(breakdown.transactionsCount > 0);
  });

  it("higieniza transações fantasmas de medalha geradas em loop no extrato (caso banana123 com 61 registros repetidos)", () => {
    const corruptEntries: any[] = [];
    // Simula 61 registros idênticos de Campeão Semanal gerados a cada 1 segundo no dia 09/11
    for (let i = 0; i < 61; i++) {
      corruptEntries.push({
        id: `tx_ghost_${i}`,
        playerId: "banana123",
        playerNick: "banana123",
        type: "career_points",
        source: "medalha",
        amount: 50,
        reason: "Medalha: Campeão Semanal (Ouro)",
        timestamp: `2026-11-09T16:14:${String(i).padStart(2, "0")}.000Z`,
      });
    }

    const cleaned = sanitizeScoreLedgerEntries(corruptEntries);
    assert.equal(cleaned.length, 1, "Deve purgar todas as 60 duplicatas fantasmas e reter apenas 1 registro");
  });

  it("Bloco 1.3 (ECON-09/ECON-22): preserva moedas e medalhas empilháveis >60s, inclui fim do dia em endDate, soma totalCoins e inclui mode/count", () => {
    const validRepeats: any[] = [
      {
        id: "tx_streak_1",
        playerId: "st_leg",
        playerNick: "StLeg",
        type: "xp",
        source: "medalha",
        amount: 20,
        reason: "Medalha: streak_3_days",
        metadata: { medalId: "streak_3_days" },
        timestamp: "2026-11-10T10:00:00.000-04:00",
      },
      {
        id: "tx_streak_2",
        playerId: "st_leg",
        playerNick: "StLeg",
        type: "xp",
        source: "medalha",
        amount: 20,
        reason: "Medalha: streak_3_days",
        metadata: { medalId: "streak_3_days" },
        timestamp: "2026-11-20T10:00:00.000-04:00",
      },
      {
        id: "tx_coin_1",
        playerId: "st_leg",
        playerNick: "StLeg",
        type: "coins",
        source: "medalha",
        amount: 10,
        reason: "Moeda Conquista",
        timestamp: "2026-11-10T10:00:00.000-04:00",
      },
      {
        id: "tx_coin_2",
        playerId: "st_leg",
        playerNick: "StLeg",
        type: "coins",
        source: "medalha",
        amount: 10,
        reason: "Moeda Conquista",
        timestamp: "2026-11-26T22:30:00.000-04:00",
      },
    ];
    const sanitized = sanitizeScoreLedgerEntries(validRepeats);
    assert.equal(sanitized.length, 4, "Medalhas empilháveis e moedas em dias distintos não podem ser removidas");

    // Registra transação às 22:30 UTC-4 (02:30Z do dia seguinte) e filtra endDate=2026-11-26
    const pId = "st_enddate_test";
    recordScoreLedgerEntry({
      playerId: pId,
      playerNick: "EndDateUser",
      type: "coins",
      source: "recompensa_diaria",
      amount: 15,
      balanceAfter: 15,
      reason: "Check-in Noturno",
      timestamp: "2026-11-26T22:30:00.000-04:00",
    });
    const ledgerByEndDate = getPlayerScoreLedger(pId, {
      startDate: "2026-11-26",
      endDate: "2026-11-26",
    });
    assert.equal(ledgerByEndDate.length, 1);

    const breakdown = calculateStudentScoreBreakdown(pId);
    assert.equal(breakdown.totalCoins, 15);

    const reconstructed = reconstructStudentLedgerFromProfile({
      id: "st_reconst",
      nick: "Reconst",
      nickNormalized: "reconst",
      xp: 200,
      careerPoints: 200,
      unlockedMedals: [{ medalId: "streak_3_days", unlockedAt: "2026-11-10T12:00:00.000Z", count: 3 }],
      stats: [
        { game_id: "logica", mode: "padrao", best_score: 200, best_level: 1, plays: 2, wins: 1, last_played_at: "2026-11-10T12:00:00.000Z" },
        { game_id: "logica", mode: "equipes", best_score: 150, best_level: 1, plays: 1, wins: 1, last_played_at: "2026-11-10T13:00:00.000Z" },
      ],
    } as any);
    assert.ok(reconstructed.some((e) => e.id === "syn_stat_xp_logica_padrao"));
    assert.ok(reconstructed.some((e) => e.id === "syn_stat_xp_logica_equipes"));
    const medalXpEntry = reconstructed.find((e) => e.id === "syn_med_xp_streak_3_days");
    assert.ok(medalXpEntry && medalXpEntry.amount >= 15); // count=3 multiplica o XP da medalha (bronze = 5 * 3 = 15)
  });

  it("QUOTA-09: trimLedgerFairly preserva extrato de outros alunos mesmo quando um único aluno gera excesso de registros", () => {
    const quietStudentEntry = {
      id: "tx_quiet_1",
      playerId: "aluno_silencioso",
      playerNick: "Silencioso",
      type: "xp" as const,
      source: "partida" as const,
      amount: 20,
      reason: "Primeira partida",
      timestamp: "2026-11-01T10:00:00.000Z",
    };
    const heavyEntries = Array.from({ length: 180 }, (_, idx) => ({
      id: `tx_heavy_${idx}`,
      playerId: "aluno_intenso",
      playerNick: "Intenso",
      type: "xp" as const,
      source: "partida" as const,
      amount: 10,
      reason: `Partida ${idx}`,
      timestamp: `2026-11-20T10:${String(idx % 60).padStart(2, "0")}:00.000Z`,
    }));

    const trimmed = trimLedgerFairly([quietStudentEntry, ...heavyEntries], 150, 200);
    assert.equal(trimmed.some((e) => e.id === "tx_quiet_1"), true);
    assert.equal(trimmed.filter((e) => e.playerId === "aluno_intenso").length, 150);
  });
});
