import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateNewspaperArticles, getNewspaperEditionKey } from "./newspaper.ts";
import type { PlayerProfile } from "./playfab.ts";

function makePlayer(overrides: Partial<PlayerProfile>): PlayerProfile {
  return {
    id: overrides.id ?? "p_1",
    nick: overrides.nick ?? "Aluno1",
    nickNormalized: overrides.nickNormalized ?? "aluno1",
    full_name: overrides.full_name ?? "ALUNO TESTE",
    school: overrides.school ?? "Escola Municipal Teste",
    grade: "6º ano",
    birthdate: "2014-05-10",
    xp: 1000,
    seasonXp: 1000,
    level: 5,
    wins: 10,
    matchesPlayed: 20,
    badges: [],
    seasonId: 1,
    ...overrides,
  };
}

describe("Jornal Dinâmico (newspaper)", () => {
  it("vira a edição diariamente exatamente às 07h00 da manhã", () => {
    const before07 = new Date(2026, 10, 17, 6, 59, 0);
    const at07 = new Date(2026, 10, 17, 7, 0, 0);

    assert.equal(getNewspaperEditionKey(before07), "2026-11-16");
    assert.equal(getNewspaperEditionKey(at07), "2026-11-17");
  });

  it("gera card interativo de Top 3 Nível & XP e destaca o líder", () => {
    const p1 = makePlayer({ id: "p1", nick: "Ana", nickNormalized: "ana", level: 9, xp: 5200 });
    const p2 = makePlayer({ id: "p2", nick: "Bruno", nickNormalized: "bruno", level: 7, xp: 3400 });
    const p3 = makePlayer({ id: "p3", nick: "Carla", nickNormalized: "carla", level: 6, xp: 2500 });

    const articles = generateNewspaperArticles({
      players: [p3, p1, p2],
      now: new Date(2026, 10, 17, 21, 0, 0),
    });

    const top3 = articles.find((a) => a.kind === "top3" && a.badge.includes("NÍVEL"));
    assert.ok(top3, "Deve gerar matéria de Top 3 Nível & XP");
    assert.equal(top3.top3Players?.length, 3);
    assert.equal(top3.top3Players?.[0].nick, "Ana");
    assert.equal(top3.top3Players?.[1].nick, "Bruno");
    assert.equal(top3.top3Players?.[2].nick, "Carla");
  });

  it("coloca conquista recente de medalha rara/misteriosa como Plantão (Última Hora)", () => {
    const now = new Date(2026, 10, 17, 15, 0, 0);
    const recentIso = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const p1 = makePlayer({
      id: "p_carmesim",
      nick: "LucasPro",
      nickNormalized: "lucaspro",
      unlockedMedals: [{ medalId: "m_rpg_carmesim", unlockedAt: recentIso, count: 1 }],
    });

    const articles = generateNewspaperArticles({
      players: [p1],
      now,
    });

    assert.equal(articles[0].isBreaking, true);
    assert.equal(articles[0].kind, "plantao");
    assert.ok(articles[0].headline.includes("LucasPro"));
    assert.equal(articles[0].featuredPlayer?.playerId, "p_carmesim");
  });
});
