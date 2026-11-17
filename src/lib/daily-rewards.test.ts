import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_REWARDS_SCHEDULE,
  DAILY_STREAK_BONUS_CAP,
  DAILY_STREAK_BONUS_STEP,
  getCumulativeCheckInDay,
  getCompletedCyclesCount,
  getStreakBonusPoints,
  getDayStatus,
  canAccessDailyRewardsPreview,
} from "./daily-rewards.ts";
import { evaluatePlayerMedals, getAllAvailableMedals } from "./medals-catalog.ts";

describe("Sistema de Recompensa Diária Progressiva (Check-in Acumulativo + Ofensiva)", () => {
  it("contém exatamente 7 dias com escala progressiva correta de pontos e XP", () => {
    assert.equal(DAILY_REWARDS_SCHEDULE.length, 7);

    // Dia 1: 25 pts, 10 XP
    assert.equal(DAILY_REWARDS_SCHEDULE[0].day, 1);
    assert.equal(DAILY_REWARDS_SCHEDULE[0].points, 25);
    assert.equal(DAILY_REWARDS_SCHEDULE[0].xp, 10);

    // Dia 3: 40 pts, 25 XP + Marco Hábito Formado
    assert.equal(DAILY_REWARDS_SCHEDULE[2].day, 3);
    assert.equal(DAILY_REWARDS_SCHEDULE[2].points, 40);
    assert.equal(DAILY_REWARDS_SCHEDULE[2].xp, 25);
    assert.equal(DAILY_REWARDS_SCHEDULE[2].milestoneMedalId, "streak_3_days");

    // Dia 5: 65 pts, 50 XP + Marco Disciplina de Campeão
    assert.equal(DAILY_REWARDS_SCHEDULE[4].day, 5);
    assert.equal(DAILY_REWARDS_SCHEDULE[4].points, 65);
    assert.equal(DAILY_REWARDS_SCHEDULE[4].xp, 50);
    assert.equal(DAILY_REWARDS_SCHEDULE[4].milestoneMedalId, "streak_5_days");

    // Dia 7: 120 pts, 100 XP + Marco Constância Lendária + Baú Preparado
    assert.equal(DAILY_REWARDS_SCHEDULE[6].day, 7);
    assert.equal(DAILY_REWARDS_SCHEDULE[6].points, 120);
    assert.equal(DAILY_REWARDS_SCHEDULE[6].xp, 100);
    assert.equal(DAILY_REWARDS_SCHEDULE[6].milestoneMedalId, "streak_7_days");
    assert.ok(DAILY_REWARDS_SCHEDULE[6].chestReward);
    assert.equal(DAILY_REWARDS_SCHEDULE[6].chestReward?.enabled, true);
  });

  it("calcula corretamente o passo acumulativo de check-in (1 a 7) sem perder avanço ao faltar", () => {
    // 0 coletas -> Dia 1 disponível
    assert.equal(getCumulativeCheckInDay(0, false), 1);
    // Acabou de coletar o Dia 1 hoje -> mantém Dia 1 marcado como coletado hoje
    assert.equal(getCumulativeCheckInDay(1, true), 1);
    // Entrou outro dia (amanhã ou daqui a 3 dias) com 1 coleta acumulada -> Dia 2 disponível
    assert.equal(getCumulativeCheckInDay(1, false), 2);
    // 6 coletas acumuladas, próximo dia -> Dia 7 disponível
    assert.equal(getCumulativeCheckInDay(6, false), 7);
    // Coletou o Dia 7 hoje -> mantém Dia 7 exibido
    assert.equal(getCumulativeCheckInDay(7, true), 7);
    // 7 coletas acumuladas, entrou em um novo dia -> reinicia ciclo no Dia 1
    assert.equal(getCumulativeCheckInDay(7, false), 1);
    assert.equal(getCumulativeCheckInDay(8, false), 2);
  });

  it("calcula o bônus extra de ofensiva (+5 pts por dia seguido) com teto máximo de 100 pontos", () => {
    assert.equal(DAILY_STREAK_BONUS_STEP, 5);
    assert.equal(DAILY_STREAK_BONUS_CAP, 100);

    // 1º dia (ou retorno após falta): +0 pts
    assert.equal(getStreakBonusPoints(0), 0);
    assert.equal(getStreakBonusPoints(1), 0);
    // 2º dia seguido: +5 pts
    assert.equal(getStreakBonusPoints(2), 5);
    // 3º dia seguido: +10 pts
    assert.equal(getStreakBonusPoints(3), 10);
    // 4º dia seguido: +15 pts
    assert.equal(getStreakBonusPoints(4), 15);
    // 7º dia seguido: +30 pts
    assert.equal(getStreakBonusPoints(7), 30);
    // 21º dia seguido: atinge exatamente o teto de 100 pts
    assert.equal(getStreakBonusPoints(21), 100);
    // 30º dia seguido: permanece travado no teto de 100 pts
    assert.equal(getStreakBonusPoints(30), 100);
  });

  it("calcula ciclos completos concluídos", () => {
    assert.equal(getCompletedCyclesCount(0), 0);
    assert.equal(getCompletedCyclesCount(6), 0);
    assert.equal(getCompletedCyclesCount(7), 1);
    assert.equal(getCompletedCyclesCount(13), 1);
    assert.equal(getCompletedCyclesCount(14), 2);
    assert.equal(getCompletedCyclesCount(21), 3);
  });

  it("determina o status visual correto de cada dia", () => {
    assert.equal(getDayStatus(1, 3, false), "collected");
    assert.equal(getDayStatus(2, 3, false), "collected");
    assert.equal(getDayStatus(3, 3, false), "today");
    assert.equal(getDayStatus(4, 3, false), "locked");
    assert.equal(getDayStatus(7, 3, false), "locked");

    assert.equal(getDayStatus(3, 3, true), "collected");
  });

  it("controla permissão de acesso garantindo que alunos comuns fiquem bloqueados", () => {
    const student = { id: "p1", nick: "aluno_joao", nickNormalized: "aluno_joao", isAdmin: false };
    assert.equal(canAccessDailyRewardsPreview(student, false), false);

    assert.equal(canAccessDailyRewardsPreview(student, true), true);

    const adminProfile = { id: "p2", nick: "admin_master", nickNormalized: "admin_master", isAdmin: true };
    assert.equal(canAccessDailyRewardsPreview(adminProfile, false), true);

    const devProfile = { id: "p3", nick: "Zheret", nickNormalized: "zheret", isAdmin: false };
    assert.equal(canAccessDailyRewardsPreview(devProfile, false), true);
  });

  it("avalia e desbloqueia as medalhas secretas da constância diária por acúmulo de marcos", () => {
    const catalog = getAllAvailableMedals();

    const m3 = catalog.find((m: any) => m.id === "secret_streak_day3_x3");
    const m5 = catalog.find((m: any) => m.id === "secret_streak_day5_x5");
    const m7 = catalog.find((m: any) => m.id === "secret_streak_day7_x7");

    assert.ok(m3, "Medalha secreta do Dia 3 (Tríade do Hábito) deve existir");
    assert.ok(m5, "Medalha secreta do Dia 5 (Pilar da Disciplina) deve existir");
    assert.ok(m7, "Medalha secreta do Dia 7 (Guardião da Constância) deve existir");

    assert.equal(m3.rarity, "prata");
    assert.equal(m5.rarity, "ouro");
    assert.equal(m7.rarity, "platina");
    assert.equal(m3.isSecret, true);
    assert.equal(m5.isSecret, true);
    assert.equal(m7.isSecret, true);

    const profNotYet = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_3_days", count: 2 }],
    };
    const eval1 = evaluatePlayerMedals({ profile: profNotYet as any, stats: [] });
    assert.equal(eval1.some((m: any) => m.id === "secret_streak_day3_x3"), false);

    const profReady = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_3_days", count: 3 }],
    };
    const eval2 = evaluatePlayerMedals({ profile: profReady as any, stats: [] });
    assert.equal(eval2.some((m: any) => m.id === "secret_streak_day3_x3"), true);

    const profEpic = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_7_days", count: 7 }],
    };
    const eval3 = evaluatePlayerMedals({ profile: profEpic as any, stats: [] });
    assert.equal(eval3.some((m: any) => m.id === "secret_streak_day7_x7"), true);
  });
});
