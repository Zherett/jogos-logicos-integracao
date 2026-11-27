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
    const before07 = new Date("2026-11-17T06:59:00-04:00");
    const at07 = new Date("2026-11-17T07:00:00-04:00");

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

  it("Bloco 1.3 (ECON-17): inclui medalha 'heroi'/'sq_*', ignora 'projected_' no total, evita plantão com timestamp futuro, ignora holder ADM em empates e usa stageForPlayer em pioneiros", () => {
    // 2026-11-17T10:30:00Z = 06:30 UTC-4 (antes das 07h00 Coari) -> edição ainda de 2026-11-16
    assert.equal(getNewspaperEditionKey(new Date("2026-11-17T10:30:00.000Z")), "2026-11-16");
    // 2026-11-17T11:00:00Z = 07:00 UTC-4 -> vira para 2026-11-17
    assert.equal(getNewspaperEditionKey(new Date("2026-11-17T11:00:00.000Z")), "2026-11-17");

    const now = new Date("2026-11-17T16:00:00.000Z"); // 12:00 UTC-4
    const futureSkewIso = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();

    const aluno = makePlayer({
      id: "aluno_sq",
      nick: "Estelar",
      nickNormalized: "estelar",
      birthdate: "",
      ageStage: "etapa_2",
      unlockedMedals: [{ medalId: "sq_hero_medal", unlockedAt: futureSkewIso, count: 1 }],
      tournamentMedals: [
        { id: "projected_week", weekKey: "2026-W47", gameId: "logica", tier: "ouro", rank: 1, label: "Ouro", heldMinutes: 10, earnedAt: now.toISOString(), count: 1, historyWeeks: ["2026-W47"] } as any,
      ],
    });
    const adm = makePlayer({
      id: "adm_1",
      nick: "JOSINEY",
      nickNormalized: "josiney",
      isAdmin: true,
    });

    const medals = [
      {
        id: "sq_hero_medal",
        title: "Herói Galáctico",
        description: "Space Quest",
        category: "especial" as any,
        rarity: "heroi" as any,
        iconName: "trophy" as any,
        condition: { type: "player_level" as const, threshold: 1 },
      },
    ];

    const articles = generateNewspaperArticles({
      players: [aluno, adm],
      medals: medals as any,
      records: {
        "logica:etapa_2": {
          gameId: "logica",
          stage: "etapa_2",
          score: 480,
          updatedAt: now.getTime(),
          holders: [
            { playerId: "aluno_sq", nick: "Estelar", school: "Escola Teste", achievedAt: now.getTime() - 1000 },
            { playerId: "adm_1", nick: "JOSINEY", school: "ADM", achievedAt: now.getTime() },
          ],
        },
      },
      pioneers: {
        sq_hero_medal: {
          medalId: "sq_hero_medal",
          studentId: "aluno_sq",
          studentNick: "Estelar",
          studentFullName: "ALUNO ESTELAR",
          studentSchool: "Escola Teste",
          unlockedAt: now.toISOString(),
          timestampMs: now.getTime(),
        },
      },
      now,
    });

    // Timestamp futuro NÃO deve marcar a medalha como Plantão "🚨 ÚLTIMA HORA"
    const sqArticle = articles.find((a) => a.id.startsWith("rare_medal_sq_hero_medal"));
    assert.ok(sqArticle, "Medalha herói/sq_* deve aparecer no jornal");
    assert.equal(sqArticle.isBreaking, false);
    assert.equal(sqArticle.featuredPlayer?.medalsCount, 1, "projected_ não deve ser contado em medalsCount");

    // Recorde do aluno NÃO deve ser ocultado pelo ADM empatando por último
    const recArticle = articles.find((a) => a.id.startsWith("record_break_"));
    assert.ok(recArticle);
    assert.equal(recArticle.featuredPlayer?.nick, "Estelar");

    // Pioneiro usa stageForPlayer (etapa_2 mesmo sem birthdate)
    const pioneerArticle = articles.find((a) => a.id.startsWith("pioneer_sq_hero_medal_"));
    assert.ok(pioneerArticle);
    assert.ok(pioneerArticle.summary.includes("2ª Etapa"));
  });
});
