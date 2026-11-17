import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateDailyMissions,
  getDailyMissionsCountForLevel,
  pickLeastPlayedGameForPlayer,
} from "./daily-missions.ts";
import { ALL_GAME_IDS } from "./game-storage.ts";

describe("Sistema de Missões Diárias (Faixas de Nível + Missão Personalizada)", () => {
  it("retorna a quantidade correta de missões para cada faixa de nível (4, 5 e 6)", () => {
    assert.equal(getDailyMissionsCountForLevel(1), 4);
    assert.equal(getDailyMissionsCountForLevel(3), 4);
    assert.equal(getDailyMissionsCountForLevel(4), 5);
    assert.equal(getDailyMissionsCountForLevel(6), 5);
    assert.equal(getDailyMissionsCountForLevel(7), 6);
    assert.equal(getDailyMissionsCountForLevel(10), 6);

    const mNv2 = generateDailyMissions({ profile: { id: "p1", level: 2 }, dateKey: "2026-11-17" });
    assert.equal(mNv2.length, 4);
    assert.equal(mNv2[mNv2.length - 1].isPersonalized, true);

    const mNv5 = generateDailyMissions({ profile: { id: "p1", level: 5 }, dateKey: "2026-11-17" });
    assert.equal(mNv5.length, 5);
    assert.equal(mNv5[mNv5.length - 1].isPersonalized, true);

    const mNv9 = generateDailyMissions({ profile: { id: "p1", level: 9 }, dateKey: "2026-11-17" });
    assert.equal(mNv9.length, 6);
    assert.equal(mNv9[mNv9.length - 1].isPersonalized, true);
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
});
