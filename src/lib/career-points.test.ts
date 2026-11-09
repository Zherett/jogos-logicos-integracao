import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  awardCareerPoints,
  spendCareerPoints,
  checkAndApplyDailyLoginPoints,
  checkAndApplyFirstGameOfDayPoints,
  checkTournamentTierPromotion,
  checkLevelPromotionPoints,
  calculateRetroactivePoints,
  ensurePlayerCareerPointsInitialized,
  sanitizeInflatedCareerPoints,
  MEDAL_POINTS_REWARDS,
  LEVEL_POINTS_REWARDS,
  DAILY_LOGIN_POINTS,
  DAILY_FIRST_GAME_POINTS,
  RANKED_WIN_POINTS,
} from "./career-points.ts";
import type { PlayerProfile } from "./playfab.ts";

function createMockProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "p_test",
    nick: "AlunoTeste",
    nickNormalized: "alunoteste",
    full_name: "ALUNO TESTE",
    school: "Raimundo Bezerra",
    grade: "6º Ano",
    birthdate: "2012-05-10",
    xp: 500,
    seasonXp: 500,
    level: 3,
    wins: 10,
    matchesPlayed: 15,
    badges: [],
    seasonId: 1,
    pointsBalance: 0,
    careerPoints: 0,
    ...overrides,
  };
}

describe("Sistema de Pontuação e Moeda de Carreira (career-points)", () => {
  it("concede pontos adicionando ao saldo atual e ao total histórico de carreira", () => {
    const profile = createMockProfile({ pointsBalance: 100, careerPoints: 100 });
    const { pointsAwarded } = awardCareerPoints(profile, 50, "Medalha de Ouro");

    assert.equal(pointsAwarded, 50);
    assert.equal(profile.pointsBalance, 150);
    assert.equal(profile.careerPoints, 150);
  });

  it("aplica multiplicador de pontos corretamente (ex: evento 2x)", () => {
    const profile = createMockProfile({ pointsBalance: 0, careerPoints: 0 });
    const { pointsAwarded } = awardCareerPoints(profile, 50, "Medalha Ouro", 2);

    assert.equal(pointsAwarded, 100);
    assert.equal(profile.pointsBalance, 100);
    assert.equal(profile.careerPoints, 100);
  });

  it("gasta saldo sem diminuir o total histórico arrecadado (careerPoints)", () => {
    const profile = createMockProfile({ pointsBalance: 1000, careerPoints: 1000 });
    const res = spendCareerPoints(profile, 300);

    assert.equal(res.success, true);
    assert.equal(res.newBalance, 700);
    assert.equal(profile.pointsBalance, 700);
    assert.equal(profile.careerPoints, 1000); // TOTAL HISTÓRICO INTACTO!
  });

  it("impede gasto se o saldo for insuficiente", () => {
    const profile = createMockProfile({ pointsBalance: 200, careerPoints: 1000 });
    const res = spendCareerPoints(profile, 500);

    assert.equal(res.success, false);
    assert.equal(profile.pointsBalance, 200);
    assert.equal(profile.careerPoints, 1000);
  });

  it("concede 25 pontos no login diário apenas uma vez por dia", () => {
    const profile = createMockProfile();
    const today = new Date("2026-11-06T10:00:00Z");

    // Primeiro login do dia
    const res1 = checkAndApplyDailyLoginPoints(profile, today);
    assert.equal(res1.pointsAwarded, DAILY_LOGIN_POINTS);
    assert.equal(profile.pointsBalance, 25);
    assert.equal(profile.careerPoints, 25);

    // Segundo login no mesmo dia -> 0 pontos adicionais
    const res2 = checkAndApplyDailyLoginPoints(profile, today);
    assert.equal(res2.pointsAwarded, 0);
    assert.equal(profile.pointsBalance, 25);
  });

  it("concede 10 pontos ao jogar o primeiro jogo do dia apenas uma vez", () => {
    const profile = createMockProfile();
    const today = new Date("2026-11-06T10:00:00Z");

    const res1 = checkAndApplyFirstGameOfDayPoints(profile, today);
    assert.equal(res1.pointsAwarded, DAILY_FIRST_GAME_POINTS);
    assert.equal(profile.pointsBalance, 10);

    // Segundo jogo do dia
    const res2 = checkAndApplyFirstGameOfDayPoints(profile, today);
    assert.equal(res2.pointsAwarded, 0);
    assert.equal(profile.pointsBalance, 10);
  });

  it("concede pontos ao subir de nível e impede recompensas duplicadas", () => {
    const profile = createMockProfile({ level: 1, achievedLevelsPoints: [] });

    // Subiu para nível 3 -> recebe Nível 2 (30 pts) + Nível 3 (40 pts) = 70 pts
    const res = checkLevelPromotionPoints(3, profile);
    assert.equal(res.pointsAwarded, 70);
    assert.equal(profile.pointsBalance, 70);
    assert.deepEqual(profile.achievedLevelsPoints?.sort(), [2, 3]);

    // Checa novamente para o mesmo nível 3 -> 0 pontos
    const resDupe = checkLevelPromotionPoints(3, profile);
    assert.equal(resDupe.pointsAwarded, 0);
  });

  it("concede pontos ao alcançar uma nova classe na ranqueada (Prata, Ouro, etc)", () => {
    const profile = createMockProfile({ achievedTournamentTiers: [] });

    // Entrou em Prata I -> +50 pts
    const resPrata = checkTournamentTierPromotion("prata_1", profile);
    assert.equal(resPrata.pointsAwarded, 50);
    assert.deepEqual(profile.achievedTournamentTiers, ["prata"]);

    // Entrou em Prata II -> 0 pts (já atingiu a classe prata)
    const resPrata2 = checkTournamentTierPromotion("prata_2", profile);
    assert.equal(resPrata2.pointsAwarded, 0);

    // Entrou em Ouro I -> +100 pts
    const resOuro = checkTournamentTierPromotion("ouro_1", profile);
    assert.equal(resOuro.pointsAwarded, 100);
    assert.deepEqual(profile.achievedTournamentTiers, ["prata", "ouro"]);
  });

  it("reconcilia pontuação retroativa para alunos existentes garantindo que não comecem do zero", () => {
    const existingStudent = createMockProfile({
      level: 4, // Nível 2 (30) + Nível 3 (40) + Nível 4 (50) = 120 pts
      x1Wins: 3, // 3 * 10 = 30 pts
      unlockedMedals: [
        { id: "m1", rarity: "bronze" }, // +20
        { id: "m2", rarity: "prata" },  // +30
        { id: "m3", rarity: "ouro" },   // +50
      ] as any,
      careerPoints: 0,
      pointsBalance: 0,
    });

    const retro = calculateRetroactivePoints(existingStudent);
    // 120 (níveis) + 30 (x1) + 20 + 30 + 50 (medalhas) = 250 pts
    assert.equal(retro, 250);

    ensurePlayerCareerPointsInitialized(existingStudent);
    assert.equal(existingStudent.careerPoints, 250);
    assert.equal(existingStudent.pointsBalance, 250);
  });

  it("corrige automaticamente pontuações infladas pelo bug de loop de sincronização de jogadores offline", () => {
    const inflatedOfflineStudent = createMockProfile({
      level: 1,
      wins: 0,
      matchesPlayed: 0,
      unlockedMedals: [],
      stats: [],
      activeDates: [],
      careerPoints: 13250,
      pointsBalance: 13250,
    });

    const { wasSanitized } = sanitizeInflatedCareerPoints(inflatedOfflineStudent);
    assert.equal(wasSanitized, true);
    assert.equal(inflatedOfflineStudent.careerPoints, 25); // 1 dia de login inicial (25 pts)
    assert.equal(inflatedOfflineStudent.pointsBalance, 25);
  });

  it("sanitiza aluno nível 2 com apenas 2 partidas e 1485 pontos (caso banana123)", () => {
    const banana123 = createMockProfile({
      nick: "banana123",
      nickNormalized: "banana123",
      full_name: "VITOR GABRIEL",
      school: "Ursulina Souza",
      level: 2,
      wins: 3,
      matchesPlayed: 2,
      totalMatches: 2,
      stats: [{ game_id: "logica", plays: 2, wins: 2, best_level: 1, best_score: 50 }],
      unlockedMedals: [
        { medalId: "beta_tester_ouro", count: 5 } as any,
        { medalId: "m_rpg_ametista", count: 1 } as any,
        { medalId: "streak_7_days", count: 1 } as any,
      ],
      careerPoints: 1485,
      pointsBalance: 1485,
    });

    const { wasSanitized } = sanitizeInflatedCareerPoints(banana123);
    assert.equal(wasSanitized, true);
    // Pontuação deve ser reduzida para o teto físico legítimo (< 250 pts)
    assert.ok(banana123.careerPoints! <= 250);
    assert.ok(banana123.pointsBalance! <= 250);
    // Medalhas incompatíveis com 2 partidas devem ser removidas
    assert.ok(!banana123.unlockedMedals?.some((m) => m.medalId === "beta_tester_ouro"));
    assert.ok(!banana123.unlockedMedals?.some((m) => m.medalId === "m_rpg_ametista"));
    assert.ok(!banana123.unlockedMedals?.some((m) => m.medalId === "streak_7_days"));
  });
});
