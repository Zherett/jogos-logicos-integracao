import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  claimDailyMissionForProfile,
  generateDailyMissions,
  getDailyMissionsCountForLevel,
  mergeDailyMissionProgress,
  pickLeastPlayedGameForPlayer,
  recordMatchIntoDailyMissions,
} from "./daily-missions.ts";
import { ALL_GAME_IDS } from "./game-storage.ts";

describe("Sistema de Missões Diárias (Faixas de Nível + Missão Personalizada)", () => {
  it("retorna exatamente 5 missões diárias para todas as faixas de nível, com a 5ª sendo personalizada", () => {
    assert.equal(getDailyMissionsCountForLevel(1), 5);
    assert.equal(getDailyMissionsCountForLevel(3), 5);
    assert.equal(getDailyMissionsCountForLevel(4), 5);
    assert.equal(getDailyMissionsCountForLevel(6), 5);
    assert.equal(getDailyMissionsCountForLevel(7), 5);
    assert.equal(getDailyMissionsCountForLevel(10), 5);

    const mNv2 = generateDailyMissions({ profile: { id: "p1", level: 2 }, dateKey: "2026-11-17" });
    assert.equal(mNv2.length, 5);
    assert.equal(mNv2[4].isPersonalized, true);

    const mNv5 = generateDailyMissions({ profile: { id: "p1", level: 5 }, dateKey: "2026-11-17" });
    assert.equal(mNv5.length, 5);
    assert.equal(mNv5[4].isPersonalized, true);

    // Nível 7–10 alterna a 4ª missão entre Zero Erros (dia par) e Espírito Competitivo (dia ímpar)
    const mNv9Odd = generateDailyMissions({ profile: { id: "p1", level: 9 }, dateKey: "2026-11-17" });
    assert.equal(mNv9Odd.length, 5);
    assert.equal(mNv9Odd[3].id, "dm_2026-11-17_competitive");
    assert.equal(mNv9Odd[4].isPersonalized, true);

    const mNv9Even = generateDailyMissions({ profile: { id: "p1", level: 9 }, dateKey: "2026-11-18" });
    assert.equal(mNv9Even.length, 5);
    assert.equal(mNv9Even[3].id, "dm_2026-11-18_flawless");
    assert.equal(mNv9Even[4].isPersonalized, true);
  });

  it("identifica corretamente o jogo com menor número de partidas jogadas para a última missão", () => {
    // Cria stats com >= 5 partidas em todos os jogos, exceto 'robogrid' com 1 partida
    const stats = ALL_GAME_IDS.map((gId) => ({
      game_id: gId,
      mode: "normal" as const,
      plays: gId === "robogrid" ? 1 : 10,
      wins: 1,
      flawless_wins: 0,
      best_score: 100,
      best_level: 1,
      last_played_at: "2026-11-16T10:00:00Z",
    }));

    const picked = pickLeastPlayedGameForPlayer({
      playerId: "aluno1",
      level: 5,
      isAdmin: true,
      stats,
      dateKey: "2026-11-17",
    });

    assert.equal(picked.gameId, "robogrid");
    assert.equal(picked.plays, 1);

    const missions = generateDailyMissions({
      profile: { id: "aluno1", level: 5, isAdmin: true },
      stats,
      dateKey: "2026-11-17",
    });

    const lastMission = missions[missions.length - 1];
    assert.equal(lastMission.isPersonalized, true);
    assert.equal(lastMission.gameId, "robogrid");
    assert.ok(lastMission.title.includes("RoboGrid"));
  });

  it("ignora jogos desabilitados ou em modo apenas ADM para alunos comuns", () => {
    // Deixa apenas 'logica' com 2 partidas e 'spacequest' com 0 partidas, mas 'spacequest' está em modo apenas ADM
    const stats = ALL_GAME_IDS.map((gId) => ({
      game_id: gId,
      mode: "normal" as const,
      plays: gId === "logica" ? 2 : gId === "spacequest" ? 0 : 10,
      wins: 1,
      flawless_wins: 0,
      best_score: 100,
      best_level: 1,
      last_played_at: "2026-11-16T10:00:00Z",
    }));

    const picked = pickLeastPlayedGameForPlayer({
      playerId: "aluno_comum",
      level: 3,
      isAdmin: false,
      stats,
      adminConfig: {
        adminOnlyGames: { spacequest: true },
      },
      dateKey: "2026-11-17",
    });

    assert.equal(picked.gameId, "logica");
    assert.equal(picked.plays, 2);
  });

  it("rastreia progresso real das missões diárias e resgata de forma idempotente atualizando semanal", () => {
    const dateKey = "2026-11-23";
    let prog = recordMatchIntoDailyMissions(undefined, {
      gameId: "logica",
      won: true,
      flawless: true,
      mode: "padrao",
      dateKey,
    });
    prog = recordMatchIntoDailyMissions(prog, {
      gameId: "formas",
      won: false,
      flawless: false,
      mode: "padrao",
      dateKey,
    });

    const prof: any = {
      id: "aluno_dm",
      nick: "AlunoDM",
      level: 2,
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      dailyMissionProgress: prog,
    };

    const missions = generateDailyMissions({ profile: prof, dateKey });
    const playsMission = missions.find((m) => m.id === `dm_${dateKey}_plays`)!;
    assert.equal(playsMission.current, 2);
    assert.equal(playsMission.target, 2);
    assert.equal(playsMission.claimed, false);

    const claim1 = claimDailyMissionForProfile(prof, playsMission.id, { dateKey });
    assert.equal(claim1.ok, true);
    assert.equal(claim1.coinsAwarded, 5);
    assert.equal(prof.coins, 5);
    assert.equal(prof.dailyMissionsCompleted, 1);
    assert.equal(prof.weeklyMissionProgress.dailyMissionsCompleted, 1);

    // Tentativa duplicada bloqueada
    const claim2 = claimDailyMissionForProfile(prof, playsMission.id, { dateKey });
    assert.equal(claim2.ok, false);
    assert.equal(claim2.alreadyClaimed, true);
  });

  it("mantém a 5ª missão pessoal e a faixa de nível travadas no dia mesmo após jogar o jogo menos jogado ou subir de nível", () => {
    const dateKey = "2026-11-24";
    // Empate nos menos jogados: 'porcentagem' e 'formas' com 2 partidas cada
    const stats = ALL_GAME_IDS.map((gId) => ({
      game_id: gId,
      mode: "normal" as const,
      plays: gId === "porcentagem" || gId === "formas" ? 2 : 10,
      wins: 1,
      flawless_wins: 0,
      best_score: 100,
      best_level: 1,
      last_played_at: "2026-11-23T10:00:00Z",
    }));

    const beforeMissions = generateDailyMissions({
      profile: { id: "p_lock", level: 3, isAdmin: true },
      stats,
      dateKey,
    });
    const personalBefore = beforeMissions[4];
    assert.equal(personalBefore.isPersonalized, true);
    const chosenGame = personalBefore.gameId!;
    assert.equal(personalBefore.target, 1);

    // Aluno joga 1 partida do jogo escolhido (seu histórico agora sobe para 3, ultrapassando o empatado que tem 2)
    // E ainda sobe para o Nível 4 nessa mesma partida!
    const updatedStats = stats.map((row) =>
      row.game_id === chosenGame ? { ...row, plays: row.plays + 1 } : row,
    );
    const prog = recordMatchIntoDailyMissions(undefined, {
      gameId: chosenGame,
      won: true,
      flawless: false,
      mode: "padrao",
      dateKey,
      playerLevel: 3,
      personalizedGameId: chosenGame,
    });

    const profAfter: any = {
      id: "p_lock",
      nick: "LockTest",
      level: 4, // subiu de faixa no meio do dia!
      isAdmin: true,
      xp: 500,
      seasonXp: 500,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      dailyMissionProgress: prog,
    };

    const afterMissions = generateDailyMissions({
      profile: profAfter,
      stats: updatedStats,
      dateKey,
    });
    const personalAfter = afterMissions[4];
    assert.equal(personalAfter.gameId, chosenGame);
    assert.equal(personalAfter.target, 1); // faixa Nvl 1-3 preservada no dia
    assert.equal(personalAfter.current, 1);

    // Consegue resgatar normalmente sem o jogo mudar debaixo do pé
    const claim = claimDailyMissionForProfile(profAfter, personalAfter.id, {
      stats: updatedStats,
      dateKey,
    });
    assert.equal(claim.ok, true);
  });

  it("Bloco 1.3 (ECON-18): mergeDailyMissionProgress é comutativo e bloqueia 6/5 resgates por troca de jogo pessoal", () => {
    const dateKey = "2026-11-26";
    const devA: any = {
      dateKey,
      plays: 3,
      wins: 2,
      distinctGameIds: ["logica"],
      flawlessCount: 1,
      competitiveCount: 0,
      playsByGame: { logica: 2, rpg: 2 },
      claimedIds: [`dm_${dateKey}_personal_logica`],
      personalizedGameId: "logica",
    };
    const devB: any = {
      dateKey,
      plays: 3,
      wins: 2,
      distinctGameIds: ["rpg"],
      flawlessCount: 0,
      competitiveCount: 1,
      playsByGame: { rpg: 2 },
      claimedIds: [],
      personalizedGameId: "rpg",
    };

    const mergeAB = mergeDailyMissionProgress(devA, devB)!;
    const mergeBA = mergeDailyMissionProgress(devB, devA)!;
    assert.equal(mergeAB.personalizedGameId, "logica");
    assert.equal(mergeBA.personalizedGameId, "logica", "Merge deve ser comutativo em qualquer ordem");

    // Mesmo que o cache aponte para outro personalizedGameId, qualquer dm_<dateKey>_personal_* já resgatado bloqueia 6º resgate
    const profConflict: any = {
      id: "p_6_5",
      level: 2,
      dailyMissionProgress: {
        ...mergeBA,
        personalizedGameId: "rpg",
      },
    };
    const missions = generateDailyMissions({ profile: profConflict, dateKey });
    assert.equal(missions[4].claimed, true, "5ª missão pessoal já resgatada na conta não pode reabrir");
    const secondClaim = claimDailyMissionForProfile(profConflict, missions[4].id, { dateKey });
    assert.equal(secondClaim.ok, false);
    assert.equal(secondClaim.alreadyClaimed, true);
  });
});
