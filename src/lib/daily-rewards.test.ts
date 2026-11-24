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
  applyRetroactiveDay1CheckIn,
  canAccessDailyRewardsPreview,
  canAccessDailyRoutine,
  canAccessShopAndCustomization,
  canUseDefaultAvatar,
  canViewCoinsWallet,
  claimDailyRewardForProfile,
  evaluateRetroactiveDay1CheckIn,
  getDailyRewardClaimState,
  resolveDailyRewardsSchedule,
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

  it("resgata recompensa diária de forma idempotente e abre o Baú Semanal configurável no Dia 7", () => {
    const prof: any = {
      id: "p_claim",
      nick: "TesteDia7",
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      lifetimeCoins: 0,
      peakCoins: 0,
      streakDays: 3,
      dailyCheckInCount: 6, // próximo check-in é o Dia 7
      activeDates: [],
    };
    const cfg: any = {
      weeklyRoutineConfig: {
        day7ChestId: "quantum_logic",
        streakPointsStep: 10,
        streakPointsCap: 100,
        dailyLoginCoins: 5,
      },
    };

    const sched = resolveDailyRewardsSchedule(cfg.weeklyRoutineConfig);
    assert.equal(sched[6].chestReward?.chestId, "quantum_logic");
    assert.equal(sched[6].chestReward?.label, "Baú de Lógica Quântica");

    const res1 = claimDailyRewardForProfile(prof, cfg, { todayKey: "2026-11-23", rng: () => 0.5 });
    assert.equal(res1.ok, true);
    assert.equal(res1.claimedDay, 7);
    assert.equal(res1.streakBonusPoints, 20); // (3 - 1) * 10
    assert.equal(res1.coinsAwarded, 5);
    assert.equal(res1.chestDefinition?.id, "quantum_logic");
    assert.ok(res1.chestOutcome && res1.chestOutcome.coins > 0);
    assert.equal(prof.dailyCheckInCount, 7);
    assert.equal(prof.chestsOpenedTotal, 1);

    // Tentativa duplicada no mesmo dia é bloqueada
    const res2 = claimDailyRewardForProfile(prof, cfg, { todayKey: "2026-11-23", rng: () => 0.5 });
    assert.equal(res2.ok, false);
    assert.equal(res2.alreadyClaimed, true);
  });

  it("mantém flags desacopladas bloqueadas para alunos comuns por padrão e permite liberar sem abrir a Loja", () => {
    const student: any = { id: "s1", nick: "aluno_comum", nickNormalized: "aluno_comum", isAdmin: false };
    assert.equal(canAccessDailyRoutine(student, false, {}), false);
    assert.equal(canViewCoinsWallet(student, false, {}), false);
    assert.equal(canUseDefaultAvatar(student, false, {}), false);
    assert.equal(canAccessShopAndCustomization(student, false, {}), false);

    const rolloutCfg: any = {
      rolloutFlags: {
        enableDailyRoutineForStudents: true,
        enableCoinsWalletForStudents: true,
        enableDefaultAvatarForStudents: true,
        enableShopForStudents: false,
      },
    };
    assert.equal(canAccessDailyRoutine(student, false, rolloutCfg), true);
    assert.equal(canViewCoinsWallet(student, false, rolloutCfg), true);
    assert.equal(canUseDefaultAvatar(student, false, rolloutCfg), true);
    assert.equal(canAccessShopAndCustomization(student, false, rolloutCfg), false);
  });

  it("concede/empilha a medalha de marco ao resgatar o Dia 3 com ofensiva seguida, mas NÃO concede se faltou dia antes", () => {
    const prof: any = {
      id: "p_milestone",
      nick: "Constante",
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      streakDays: 3,
      dailyCheckInCount: 2, // próximo check-in é Dia 3
      unlockedMedals: [],
    };
    const res = claimDailyRewardForProfile(prof, {}, { todayKey: "2026-11-24" });
    assert.equal(res.ok, true);
    assert.equal(res.claimedDay, 3);
    const m3 = prof.unlockedMedals.find((m: any) => m.medalId === "streak_3_days");
    assert.ok(m3);
    assert.equal(m3.count, 1);
    assert.equal(prof.coinRewardedMedalIds?.streak_3_days, 1);

    // Se faltou 1 dia antes de completar o Dia 5 ou Dia 7, recebe os prêmios e o Baú, mas NÃO recebe a medalha
    const profBroken7: any = {
      id: "p_broken_7",
      nick: "FaltouUmDia",
      xp: 0,
      seasonXp: 0,
      careerPoints: 0,
      pointsBalance: 0,
      coins: 0,
      streakDays: 3,
      dailyCheckInCount: 6, // próximo check-in é Dia 7
      activeDates: ["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"], // faltou dia 18 e dia 23
      unlockedMedals: [],
    };
    const res7 = claimDailyRewardForProfile(profBroken7, {}, { todayKey: "2026-11-24", rng: () => 0.5 });
    assert.equal(res7.ok, true);
    assert.equal(res7.claimedDay, 7);
    assert.ok(res7.chestDefinition, "Baú do Dia 7 continua sendo entregue na trilha acumulativa");
    assert.equal(profBroken7.streakDays, 1);
    assert.equal(profBroken7.unlockedMedals.some((m: any) => m.medalId === "streak_7_days"), false);
    assert.equal(res7.medalCoinsAwarded ?? 0, 0);
  });

  it("aplica retrocoleta idempotente do Dia 1 apenas para alunos ativos nos últimos 3 dias e libera Dia 2 hoje", () => {
    const todayKey = "2026-11-24"; // Terça-feira
    const activeStudent: any = {
      id: "s_active",
      nick: "AlunoAtivo",
      xp: 100,
      seasonXp: 100,
      careerPoints: 50,
      pointsBalance: 50,
      coins: 0,
      lastActiveDate: "2026-11-23",
      lastDailyLoginPointsDate: "2026-11-23", // já ganhou +25 pts ontem
      activeDates: ["2026-11-23"],
    };
    const inactiveStudent: any = {
      id: "s_inactive",
      nick: "AlunoInativo",
      xp: 100,
      lastActiveDate: "2026-11-18",
      activeDates: ["2026-11-18"],
    };

    // Mesmo se acc.updatedAt tiver sido atualizado hoje (ex.: logo após a Retroatribuição de Moedas),
    // um aluno inativo NÃO pode ser promovido a elegível
    const evalInactive = evaluateRetroactiveDay1CheckIn(inactiveStudent, {}, {
      todayKey,
      daysWindow: 3,
      accountUpdatedAt: "2026-11-24T12:00:00.000Z",
    });
    assert.equal(evalInactive.eligible, false);
    assert.equal(evalInactive.latestActivityDate, "2026-11-18");

    const applied = applyRetroactiveDay1CheckIn(activeStudent, {}, { todayKey, daysWindow: 3 });
    assert.equal(applied.eligible, true);
    assert.equal(applied.day1DateKey, "2026-11-23");
    assert.equal(applied.pointsToAward, 0); // não duplicou +25 pts do login de ontem
    assert.equal(applied.xpToAward, 10); // creditou XP faltante do Dia 1
    assert.equal(activeStudent.dailyCheckInCount, 1);
    assert.equal(activeStudent.lastDailyRewardClaimDate, "2026-11-23");

    // Hoje (terça-feira), o aluno vê Dia 1 Coletado e Dia 2 liberado para coleta manual!
    const stateToday = getDailyRewardClaimState(activeStudent, todayKey);
    assert.equal(stateToday.isTodayClaimed, false);
    assert.equal(stateToday.currentDay, 2);
    assert.equal(getDayStatus(1, stateToday.currentDay, stateToday.isTodayClaimed), "collected");
    assert.equal(getDayStatus(2, stateToday.currentDay, stateToday.isTodayClaimed), "today");

    // Segunda execução é 100% idempotente
    const applied2 = applyRetroactiveDay1CheckIn(activeStudent, {}, { todayKey, daysWindow: 3 });
    assert.equal(applied2.eligible, false);
  });
});
