import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getTournamentPlayerCloudKey,
  parseTournamentSharedGroupRecords,
  recordWeeklyTournamentAttempt,
  resolveCanonicalTournamentPoints,
} from "./weekly-tournament.ts";
import {
  calculateStudentScoreBreakdown,
  getPlayerScoreLedger,
  mergePlayerScoreLedgerEntries,
  reconstructStudentLedgerFromProfile,
  type ScoreLedgerEntry,
} from "./score-history-ledger.ts";
import {
  computeRecoverableRankedPoints,
  loadRegistry,
  recoverLostRankedPointsFromCloud,
  runGlobalStudentsIntegrityAudit,
  saveRegistry,
  type PlayerProfile,
} from "./playfab.ts";
import { sanitizeInflatedCareerPoints } from "./career-points.ts";

function createStudentProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "pf_aluno_rnk",
    nick: "ALUNO_RNK",
    nickNormalized: "aluno_rnk",
    full_name: "ALUNO T.",
    school: "Ursulina Souza",
    grade: "6º ano",
    turma: "A",
    birthdate: "2013-05-10",
    ageStage: "etapa_2",
    xp: 650,
    seasonXp: 650,
    level: 4,
    wins: 18,
    matchesPlayed: 25,
    distinctGamesPlayed: 4,
    tournamentPoints: 0,
    bestTournamentPoints: 0,
    tournamentRankId: "bronze_1",
    rankedSeasonId: 1,
    careerPoints: 300,
    pointsBalance: 300,
    badges: [],
    unlockedMedals: [],
    stats: [
      {
        game_id: "logica",
        mode: "padrao",
        plays: 25,
        wins: 18,
        flawless_wins: 5,
        best_score: 500,
        best_level: 3,
      },
    ],
    seasonId: 1,
    ...overrides,
  };
}

describe("Sanitização da Ranqueada, Chaves Isoladas, Extrato na Nuvem e Recuperação Automática", () => {
  it("prioriza chaves individuais rnk_<slug> sobre o legado Standings sem sobrescrever outros competidores", () => {
    const groupData = {
      Standings: {
        Value: JSON.stringify({
          alice: {
            playerId: "alice",
            nick: "ALICE",
            fullName: "ALICE S.",
            school: "Ursulina Souza",
            level: 4,
            bestScore: 300,
            totalEntries: 10,
            tournamentPoints: 260,
            activeTop5Since: null,
            accumulatedTop5Ms: 0,
            updatedAt: 1000,
          },
          bob: {
            playerId: "bob",
            nick: "BOB",
            fullName: "BOB M.",
            school: "Ursulina Souza",
            level: 5,
            bestScore: 400,
            totalEntries: 15,
            tournamentPoints: 310,
            activeTop5Since: null,
            accumulatedTop5Ms: 0,
            updatedAt: 1000,
          },
        }),
      },
      // Alice gastou 5 pts em entrada paga -> chave individual rnk_alice tem prioridade mesmo sendo menor (255 < 260)
      [getTournamentPlayerCloudKey("alice")]: {
        Value: JSON.stringify({
          playerId: "alice",
          nick: "ALICE",
          fullName: "ALICE S.",
          school: "Ursulina Souza",
          level: 4,
          bestScore: 300,
          totalEntries: 11,
          tournamentPoints: 255,
          activeTop5Since: null,
          accumulatedTop5Ms: 0,
          updatedAt: 2000,
        }),
      },
    };

    const parsed = parseTournamentSharedGroupRecords(groupData);
    assert.equal(parsed.records["alice"]?.tournamentPoints, 255);
    assert.equal(parsed.perPlayerKeys.has("alice"), true);
    assert.equal(parsed.records["bob"]?.tournamentPoints, 310);
    assert.equal(parsed.perPlayerKeys.has("bob"), false);
  });

  it("grava lançamentos type=tournament_pts no Extrato ao concluir partidas ranqueadas", async () => {
    const profile = createStudentProfile({
      id: "pf_extrato_rnk_1",
      nick: "EXTRATO_RNK",
      nickNormalized: "extrato_rnk",
      level: 4,
      tournamentPoints: 40,
    });

    const res = await recordWeeklyTournamentAttempt({
      profile,
      score: 450,
      correct: 10,
      wrong: 2,
    });

    assert.ok(res.pointsDelta >= 8);
    assert.equal(res.newTournamentPoints, 40 + res.pointsDelta);

    const rankedEntries = getPlayerScoreLedger(
      profile.id,
      { type: "tournament_pts" },
      profile,
    );
    assert.ok(rankedEntries.length >= 1, "Deve registrar ao menos 1 lançamento de tournament_pts");
    assert.equal(rankedEntries[0].type, "tournament_pts");
    assert.equal(rankedEntries[0].source, "torneio_semanal");
    assert.equal(rankedEntries[0].amount, res.pointsDelta);
    assert.equal(rankedEntries[0].balanceAfter, res.newTournamentPoints);
  });

  it("exibe no Extrato do ADM lançamentos sincronizados na nuvem (profile.scoreLedger) e reconstitui contas legadas", () => {
    const cloudTx: ScoreLedgerEntry = {
      id: "cloud_tx_rnk_lord_1",
      playerId: "lord_cloud_test",
      playerNick: "LORD_CLOUD",
      type: "tournament_pts",
      source: "torneio_semanal",
      amount: 10,
      balanceAfter: 250,
      reason: "Partida Ranqueada (Lógica • 10 acertos, 0 erros)",
      timestamp: "2026-11-24T12:00:00.000Z",
    };

    const cloudProfile = createStudentProfile({
      id: "lord_cloud_test",
      nick: "LORD_CLOUD",
      nickNormalized: "lord_cloud",
      tournamentPoints: 250,
      scoreLedger: [cloudTx],
    });

    const entries = getPlayerScoreLedger(
      cloudProfile.id,
      { type: "tournament_pts" },
      cloudProfile,
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "cloud_tx_rnk_lord_1");
    assert.equal(entries[0].amount, 10);

    const breakdown = calculateStudentScoreBreakdown(cloudProfile.id, cloudProfile);
    assert.equal(breakdown.totalTournamentPoints, 10);

    // Conta legada sem scoreLedger na nuvem mas com 260 pts ranqueados -> reconstituição sintética gera tournament_pts
    const legacyProfile = createStudentProfile({
      id: "legacy_rnk_only",
      nick: "LEGACY_RNK",
      nickNormalized: "legacy_rnk",
      tournamentPoints: 260,
      scoreLedger: [],
    });
    const synthetic = reconstructStudentLedgerFromProfile(legacyProfile);
    const tourSynth = synthetic.filter((e) => e.type === "tournament_pts");
    assert.ok(tourSynth.length >= 1, "Reconstituição legada deve incluir pontos ranqueados");
    assert.equal(
      tourSynth.reduce((sum, e) => sum + e.amount, 0),
      260,
    );
  });

  it("runGlobalStudentsIntegrityAudit preserva pontos de aluno Nível 3+ mesmo com tourPlays=0 e aplica a regra padrão em LORD Nível < 3", async () => {
    const reg = loadRegistry();

    const eligibleNoTourStats = createStudentProfile({
      id: "stu_lvl4_ouro",
      nick: "ALUNO_OURO",
      nickNormalized: "aluno_ouro",
      level: 4,
      xp: 750,
      matchesPlayed: 25,
      wins: 18,
      tournamentPoints: 280,
      bestTournamentPoints: 280,
      tournamentRankId: "ouro_1",
      // Sem linhas mode === "torneio_semanal" em stats
      stats: [
        { game_id: "logica", mode: "padrao", plays: 25, wins: 18, best_score: 500, best_level: 3 },
      ],
    });

    const lordLowLevel = createStudentProfile({
      id: "stu_lord_lvl2",
      nick: "LORD",
      nickNormalized: "lord",
      level: 2,
      xp: 220,
      matchesPlayed: 5,
      wins: 3,
      tournamentPoints: 250,
      bestTournamentPoints: 250,
      tournamentRankId: "ouro_1",
      stats: [
        { game_id: "logica", mode: "padrao", plays: 5, wins: 3, best_score: 300, best_level: 2 },
      ],
    });

    reg["aluno_ouro"] = {
      profile: eligibleNoTourStats,
      passwordHash: "hash",
      unlocked: [],
      stats: eligibleNoTourStats.stats!,
      updatedAt: new Date().toISOString(),
    };
    reg["lord"] = {
      profile: lordLowLevel,
      passwordHash: "hash",
      unlocked: [],
      stats: lordLowLevel.stats!,
      updatedAt: new Date().toISOString(),
    };
    saveRegistry(reg);

    try {
      await runGlobalStudentsIntegrityAudit({ skipCloudSync: true });
      const after = loadRegistry();

      // Aluno Nível 4 com 280 pts NÃO pode mais ser zerado por falta de stats torneio_semanal
      assert.equal(after["aluno_ouro"].profile.tournamentPoints, 280);
      assert.equal(after["aluno_ouro"].profile.tournamentRankId, "ouro_1");

      // LORD Nível 2 segue exatamente a mesma regra dos alunos (Nível < 3 -> zerado + logado no extrato)
      assert.equal(after["lord"].profile.tournamentPoints, 0);
      assert.equal(after["lord"].profile.tournamentRankId, "bronze_1");
      assert.equal(
        resolveCanonicalTournamentPoints({
          level: 2,
          isAdmin: false,
          tournamentPoints: 250,
        }),
        0,
      );

      const lordSanitizeLogs = getPlayerScoreLedger(
        "stu_lord_lvl2",
        { type: "tournament_pts", source: "sanitizacao" },
        after["lord"].profile,
      );
      assert.ok(lordSanitizeLogs.length >= 1, "Sanitização de nível < 3 deve registrar motivo no extrato");
      assert.equal(lordSanitizeLogs[0].amount, -250);
    } finally {
      const cleanup = loadRegistry();
      delete cleanup["aluno_ouro"];
      delete cleanup["lord"];
      saveRegistry(cleanup);
    }
  });

  it("recuperação automática restaura pontos exatos e piso comprovado por marcos/medalhas de forma idempotente", async () => {
    // 1. Teste puro do avaliador
    const zeroedWithMilestone = createStudentProfile({
      id: "pf_rec_ouro",
      nick: "REC_OURO",
      nickNormalized: "rec_ouro",
      level: 5,
      tournamentPoints: 0,
      bestTournamentPoints: 0,
      claimedRankedMilestones: ["S1:prata_1", "S1:ouro_1"],
      unlockedMedals: [{ medalId: "tour_master_prata", unlockedAt: "2026-11-10T00:00:00Z" }],
    });

    const floorEval = computeRecoverableRankedPoints({
      profile: zeroedWithMilestone,
      seasonId: 1,
    });
    assert.equal(floorEval.eligible, true);
    assert.equal(floorEval.targetPoints, 241, "Marco S1:ouro_1 comprova piso mínimo de 241 pts");
    assert.equal(floorEval.isFloorEstimate, true);

    // Se houver snapshot exato maior (ex.: 295 pts), snapshot exato prevalece sobre o piso
    const exactEval = computeRecoverableRankedPoints({
      profile: zeroedWithMilestone,
      seasonId: 1,
      cloudStandingsPoints: 295,
    });
    assert.equal(exactEval.targetPoints, 295);
    assert.equal(exactEval.isFloorEstimate, false);

    // Conta Nível < 3 não é elegível para recuperação
    const lowLvlEval = computeRecoverableRankedPoints({
      profile: createStudentProfile({ level: 2, claimedRankedMilestones: ["S1:ouro_1"] }),
      seasonId: 1,
      cloudStandingsPoints: 250,
    });
    assert.equal(lowLvlEval.eligible, false);
    assert.equal(lowLvlEval.delta, 0);

    // 2. Execução completa idempotente via recoverLostRankedPointsFromCloud
    const reg = loadRegistry();
    reg["rec_ouro"] = {
      profile: zeroedWithMilestone,
      passwordHash: "hash",
      unlocked: [],
      stats: zeroedWithMilestone.stats!,
      updatedAt: new Date().toISOString(),
    };
    saveRegistry(reg);

    try {
      const firstRun = await recoverLostRankedPointsFromCloud({ skipCloudSync: true });
      assert.ok(firstRun.recoveredStudentsCount >= 1);
      const restored = loadRegistry()["rec_ouro"].profile;
      assert.equal(restored.tournamentPoints, 241);
      assert.equal(restored.tournamentRankId, "ouro_1");

      const recLogs = getPlayerScoreLedger(
        restored.id,
        { type: "tournament_pts", source: "reconciliacao" },
        restored,
      );
      assert.equal(recLogs.length, 1);
      assert.equal(recLogs[0].amount, 241);

      // Segunda execução deve ser 100% idempotente (0 alterações adicionais)
      const secondRun = await recoverLostRankedPointsFromCloud({ skipCloudSync: true });
      assert.equal(secondRun.details.some((d) => d.id === restored.id), false);
    } finally {
      const cleanup = loadRegistry();
      delete cleanup["rec_ouro"];
      saveRegistry(cleanup);
    }
  });

  it("sanitizeInflatedCareerPoints respeita os limiares oficiais de TOURNAMENT_RANKS (91/241/451/681/850)", () => {
    const bronzeStudent = createStudentProfile({
      tournamentPoints: 70, // Bronze III (abaixo de Prata 91)
      bestTournamentPoints: 70,
      achievedTournamentTiers: [],
    });
    sanitizeInflatedCareerPoints(bronzeStudent);
    assert.deepEqual(bronzeStudent.achievedTournamentTiers, []);

    const goldStudent = createStudentProfile({
      tournamentPoints: 260, // Ouro I (>= 241, abaixo de Platina 451)
      bestTournamentPoints: 260,
      achievedTournamentTiers: [],
    });
    sanitizeInflatedCareerPoints(goldStudent);
    assert.deepEqual(goldStudent.achievedTournamentTiers, ["prata", "ouro"]);
  });

  it("mergePlayerScoreLedgerEntries deduplica por id mantendo ordem cronológica", () => {
    const tx1: ScoreLedgerEntry = {
      id: "tx_a",
      playerId: "p1",
      playerNick: "P1",
      type: "tournament_pts",
      source: "torneio_semanal",
      amount: 10,
      reason: "Partida 1",
      timestamp: "2026-11-24T10:00:00.000Z",
    };
    const tx2: ScoreLedgerEntry = {
      id: "tx_b",
      playerId: "p1",
      playerNick: "P1",
      type: "tournament_pts",
      source: "torneio_semanal",
      amount: -5,
      reason: "Entrada paga",
      timestamp: "2026-11-24T10:05:00.000Z",
    };
    const merged = mergePlayerScoreLedgerEntries([[tx2, tx1], [tx1]]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, "tx_a");
    assert.equal(merged[1].id, "tx_b");
  });

  it("runGlobalStudentsIntegrityAudit é idempotente e não entra em loop com partidas x1_online", async () => {
    const reg = loadRegistry();
    const x1Student = createStudentProfile({
      id: "stu_x1_loop",
      nick: "X1Loop",
      nickNormalized: "x1loop",
      level: 5,
      xp: 2500,
      matchesPlayed: 55,
      wins: 50,
      x1Matches: 0,
      distinctGamesPlayed: 2,
      stats: [
        { game_id: "logica", mode: "padrao", plays: 30, wins: 28, best_score: 120, best_level: 3 },
        { game_id: "rpg", mode: "padrao", plays: 25, wins: 22, best_score: 140, best_level: 3 },
        { game_id: "logica", mode: "x1_online", plays: 12, wins: 12, best_score: 100, best_level: 1 },
      ],
    });
    reg["x1loop"] = {
      profile: x1Student,
      passwordHash: "hash",
      unlocked: [],
      stats: x1Student.stats!,
      updatedAt: new Date().toISOString(),
    };
    saveRegistry(reg);

    try {
      const first = await runGlobalStudentsIntegrityAudit({ skipCloudSync: true });
      const afterFirst = loadRegistry()["x1loop"].profile;
      assert.equal(afterFirst.matchesPlayed, 55, "Partidas regulares devem excluir x1_online");
      assert.equal(afterFirst.wins, 50);
      assert.equal(afterFirst.x1Matches, 12, "x1Matches deve ser restaurado a partir de stats x1_online");
      assert.ok(first.updatedStudentsCount >= 1);

      const second = await runGlobalStudentsIntegrityAudit({ skipCloudSync: true });
      assert.equal(second.updatedStudentsCount, 0, "Segunda execução consecutiva deve ser 100% idempotente");
    } finally {
      const cleanup = loadRegistry();
      delete cleanup["x1loop"];
      saveRegistry(cleanup);
    }
  });
});
