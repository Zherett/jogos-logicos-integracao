import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  claimWeeklyMissionForProfile,
  generateWeeklyMissions,
  getEligibleGamesForWeeklyMissions,
  recordMatchIntoWeeklyMissions,
  WEEKLY_MISSIONS_COUNT,
} from "./weekly-missions.ts";

describe("Sistema de Missões Semanais (4 Missões + Faixas de Nível + Ciclo Segunda-Domingo)", () => {
  it("gera exatamente 4 missões semanais para todas as faixas de nível", () => {
    for (const level of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
      const missions = generateWeeklyMissions({
        profile: { id: "p1", level },
        weekKey: "2026-W47",
        weekIndex: 107425,
      });
      assert.equal(missions.length, WEEKLY_MISSIONS_COUNT);
    }
  });

  it("não inclui missão de subir ranks na ranqueada para níveis 1 a 3 e inclui a partir do nível 4", () => {
    const nv3 = generateWeeklyMissions({ profile: { id: "p1", level: 3 }, weekKey: "2026-W47", weekIndex: 10 });
    assert.equal(nv3.some((m) => m.type === "weekly_ranked_ranks"), false);

    const nv4 = generateWeeklyMissions({ profile: { id: "p1", level: 4 }, weekKey: "2026-W47", weekIndex: 10 });
    const rank4 = nv4.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rank4);
    assert.equal(rank4.target, 2);

    const nv8 = generateWeeklyMissions({ profile: { id: "p1", level: 8 }, weekKey: "2026-W47", weekIndex: 10 });
    const rank8 = nv8.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rank8);
    assert.equal(rank8.target, 3);
  });

  it("respeita o nível mínimo exigido pelos jogos ao calcular jogos elegíveis e meta de jogos distintos", () => {
    const adminConfig = {
      gameLevelRequirements: {
        logica: 1,
        completar: 1,
        formas: 1,
        porcentagem: 5,
        fracoes: 6,
        variaveis: 7,
        cartesiano: 8,
        memoria: 9,
        minado: 10,
        robogrid: 10,
        rpg: 10,
        spacequest: 10,
      },
    };

    const eligibleNv2 = getEligibleGamesForWeeklyMissions({ level: 2, isAdmin: false, adminConfig });
    assert.deepEqual(eligibleNv2, ["logica", "formas", "completar"]);

    const missionsNv2 = generateWeeklyMissions({
      profile: { id: "p1", level: 2 },
      adminConfig,
      weekKey: "2026-W47",
      weekIndex: 10,
    });
    const distinctMission = missionsNv2.find((m) => m.type === "weekly_distinct_games");
    assert.ok(distinctMission);
    assert.equal(distinctMission.target, 3);
  });

  it("alterna a semana corretamente no fechamento de domingo 23:59 para segunda-feira 00:00", () => {
    const sundayNight = new Date(2026, 10, 22, 23, 59, 0); // Domingo 22/11/2026 23:59
    const mondayMorning = new Date(2026, 10, 23, 0, 0, 0); // Segunda 23/11/2026 00:00

    const mSunday = generateWeeklyMissions({ profile: { id: "p1", level: 5 }, now: sundayNight });
    const mMonday = generateWeeklyMissions({ profile: { id: "p1", level: 5 }, now: mondayMorning });

    assert.notEqual(mSunday[0].id, mMonday[0].id);
  });

  it("balanceia a missão ranqueada conforme o rank atual do jogador (baixo, médio, alto e máximo)", () => {
    // Rank baixo (Bronze I): até 3 ranks no Nível 7-10 e 2 no Nível 4-6
    const bronzeNv8 = generateWeeklyMissions({
      profile: { id: "p1", level: 8, tournamentPoints: 0, tournamentRankId: "bronze_1" },
      weekKey: "2026-W47",
      weekIndex: 10,
    });
    const rBronze = bronzeNv8.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rBronze);
    assert.equal(rBronze.target, 3);

    // Rank médio (Ouro II): no máximo 2 ranks mesmo no Nível 7-10
    const ouroNv8 = generateWeeklyMissions({
      profile: { id: "p1", level: 8, tournamentPoints: 320, tournamentRankId: "ouro_2" },
      weekKey: "2026-W47",
      weekIndex: 10,
    });
    const rOuro = ouroNv8.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rOuro);
    assert.equal(rOuro.target, 2);

    // Rank muito alto (Diamante III): no máximo 1 rank
    const diamanteNv8 = generateWeeklyMissions({
      profile: { id: "p1", level: 8, tournamentRankId: "diamante_3" },
      weekKey: "2026-W47",
      weekIndex: 10,
    });
    const rDiamante = diamanteNv8.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rDiamante);
    assert.equal(rDiamante.target, 1);

    // Rank máximo (Mestre): vira missão apenas de jogar partidas ranqueadas
    const mestreNv8 = generateWeeklyMissions({
      profile: { id: "p1", level: 8, tournamentRankId: "mestre" },
      weekKey: "2026-W47",
      weekIndex: 10,
    });
    assert.equal(mestreNv8.some((m) => m.type === "weekly_ranked_ranks"), false);
    const rMestre = mestreNv8.find((m) => m.type === "weekly_ranked_matches");
    assert.ok(rMestre);
    assert.equal(rMestre.target, 10);
  });

  it("rastreia progresso real das missões semanais e permite resgate idempotente", () => {
    const weekKey = "2026-W47";
    let wProg = recordMatchIntoWeeklyMissions(undefined, {
      gameId: "logica",
      earnedXp: 350,
      mode: "padrao",
      weekKey,
    });
    wProg = recordMatchIntoWeeklyMissions(wProg, {
      gameId: "formas",
      earnedXp: 300,
      mode: "padrao",
      weekKey,
    });

    const prof: any = {
      id: "aluno_wm",
      nick: "AlunoWM",
      level: 2,
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      weeklyMissionProgress: wProg,
    };

    const missions = generateWeeklyMissions({ profile: prof, weekKey, weekIndex: 10 });
    const xpMission = missions.find((m) => m.type === "weekly_xp")!;
    assert.equal(xpMission.current, 600);
    assert.equal(xpMission.target, 600);
    assert.equal(xpMission.claimed, false);

    const claim1 = claimWeeklyMissionForProfile(prof, xpMission.id, { weekKey, weekIndex: 10 });
    assert.equal(claim1.ok, true);
    assert.equal(claim1.coinsAwarded, 10);
    assert.equal(prof.coins, 10);
    assert.equal(prof.weeklyMissionsCompleted, 1);

    const claim2 = claimWeeklyMissionForProfile(prof, xpMission.id, { weekKey, weekIndex: 10 });
    assert.equal(claim2.ok, false);
    assert.equal(claim2.alreadyClaimed, true);
  });

  it("mantém a missão ranqueada e a faixa de nível travadas na semana mesmo ao atingir o Rank Máximo ou subir de faixa", () => {
    const weekKey = "2026-W48";
    // Começa a semana em Nível 6, Diamante V (820 pts; falta 1 rank para Mestre em 850 pts)
    const wProg = recordMatchIntoWeeklyMissions(undefined, {
      gameId: "logica",
      earnedXp: 100,
      mode: "torneio_semanal",
      playerLevel: 6,
      tournamentRankIdBefore: "diamante_5",
      tournamentPointsBefore: 820,
      tournamentRankIdAfter: "mestre", // atingiu o rank máximo nesta partida!
      tournamentPointsAfter: 860,
      weekKey,
    });

    const prof: any = {
      id: "aluno_mestre",
      nick: "MestreSemana",
      level: 7, // também subiu para Nível 7 na mesma semana
      tournamentRankId: "mestre",
      tournamentPoints: 860,
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      weeklyMissionProgress: wProg,
    };

    const missions = generateWeeklyMissions({ profile: prof, weekKey, weekIndex: 10 });
    const rankMission = missions.find((m) => m.type === "weekly_ranked_ranks");
    assert.ok(rankMission, "a missão de subir 1 rank não pode sumir ao alcançar Mestre");
    assert.equal(rankMission.target, 1);
    assert.equal(rankMission.current, 1);
    // Faixa Nível 4-6 travada: meta de partidas continua 25 (não pulou para 35)
    const matchesMission = missions.find((m) => m.type === "weekly_matches")!;
    assert.equal(matchesMission.target, 25);

    const claim = claimWeeklyMissionForProfile(prof, rankMission.id, { weekKey, weekIndex: 10 });
    assert.equal(claim.ok, true);
  });
});
