import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateWeeklyMissions,
  getEligibleGamesForWeeklyMissions,
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
      gameMinLevels: {
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
});
