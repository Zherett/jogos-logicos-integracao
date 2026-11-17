import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_REWARDS_SCHEDULE,
  getCurrentCycleDay,
  getCompletedCyclesCount,
  getDayStatus,
  canAccessDailyRewardsPreview,
} from "./daily-rewards.ts";
import { evaluatePlayerMedals, getAllAvailableMedals } from "./medals-catalog.ts";

describe("Sistema de Recompensa Diária Progressiva (7 Dias)", () => {
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

  it("calcula corretamente o dia atual do ciclo (1 a 7)", () => {
    assert.equal(getCurrentCycleDay(0), 1);
    assert.equal(getCurrentCycleDay(1), 1);
    assert.equal(getCurrentCycleDay(2), 2);
    assert.equal(getCurrentCycleDay(3), 3);
    assert.equal(getCurrentCycleDay(6), 6);
    assert.equal(getCurrentCycleDay(7), 7);
    assert.equal(getCurrentCycleDay(8), 1); // Novo ciclo
    assert.equal(getCurrentCycleDay(14), 7); // Fim do 2º ciclo
    assert.equal(getCurrentCycleDay(15), 1); // 3º ciclo
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
    // No Dia 3, sem ter coletado hoje:
    // Dia 1 e 2 = collected
    // Dia 3 = today
    // Dia 4..7 = locked
    assert.equal(getDayStatus(1, 3, false), "collected");
    assert.equal(getDayStatus(2, 3, false), "collected");
    assert.equal(getDayStatus(3, 3, false), "today");
    assert.equal(getDayStatus(4, 3, false), "locked");
    assert.equal(getDayStatus(7, 3, false), "locked");

    // Se o Dia 3 já foi resgatado hoje:
    assert.equal(getDayStatus(3, 3, true), "collected");
  });

  it("controla permissão de acesso garantindo que alunos comuns fiquem bloqueados", () => {
    // Aluno comum
    const student = { id: "p1", nick: "aluno_joao", nickNormalized: "aluno_joao", isAdmin: false };
    assert.equal(canAccessDailyRewardsPreview(student, false), false);

    // Flag isAdmin do auth
    assert.equal(canAccessDailyRewardsPreview(student, true), true);

    // Conta com profile.isAdmin
    const adminProfile = { id: "p2", nick: "admin_master", nickNormalized: "admin_master", isAdmin: true };
    assert.equal(canAccessDailyRewardsPreview(adminProfile, false), true);

    // Contas de teste da equipe (zheret, etc)
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

    // Jogador com 2 coletas do dia 3 (não desbloqueia ainda)
    const profNotYet = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_3_days", count: 2 }],
    };
    const eval1 = evaluatePlayerMedals({ profile: profNotYet as any, stats: [] });
    assert.equal(eval1.some((m: any) => m.id === "secret_streak_day3_x3"), false);

    // Jogador que atingiu 3 coletas do dia 3 (desbloqueia Tríade do Hábito)
    const profReady = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_3_days", count: 3 }],
    };
    const eval2 = evaluatePlayerMedals({ profile: profReady as any, stats: [] });
    assert.equal(eval2.some((m: any) => m.id === "secret_streak_day3_x3"), true);

    // Jogador que atingiu 7 coletas do dia 7 (desbloqueia Guardião da Constância)
    const profEpic = {
      id: "p1",
      nick: "teste",
      unlockedMedals: [{ medalId: "streak_7_days", count: 7 }],
    };
    const eval3 = evaluatePlayerMedals({ profile: profEpic as any, stats: [] });
    assert.equal(eval3.some((m: any) => m.id === "secret_streak_day7_x7"), true);
  });
});
