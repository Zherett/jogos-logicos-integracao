import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isEventActive,
  calculateEventXpMultiplier,
  getEffectiveDailyXpCap,
  getActiveEventBonuses,
  formatEventRemainingTime,
  formatDateOnlyBR,
  formatDateTimeBR,
  isRecurringEventActive,
  getAllActiveEvents,
  getEventLinkedMedalIds,
  getEventCycleKey,
  DEFAULT_RECURRING_EVENTS,
  type SpecialEvent,
  type RecurringEvent,
} from "./custom-events.ts";

describe("Eventos Personalizados Criados pelo Administrador", () => {
  it("detecta se um evento está ativo dentro do período de início e fim", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const activeEv: SpecialEvent = {
      id: "ev_1",
      title: "Fim de Semana 2x XP",
      description: "Ganhe o dobro de XP em todos os jogos!",
      scope: "todos",
      bonusType: "dobro_xp",
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    assert.equal(isEventActive(activeEv, now), true);

    // Evento desativado pelo ADM
    const inactiveEv = { ...activeEv, active: false };
    assert.equal(isEventActive(inactiveEv, now), false);

    // Evento que ainda não começou
    const futureEv = {
      ...activeEv,
      startsAt: "2026-11-05T00:00:00Z",
      endsAt: "2026-11-06T00:00:00Z",
    };
    assert.equal(isEventActive(futureEv, now), false);

    // Evento expirado
    const expiredEv = {
      ...activeEv,
      startsAt: "2026-10-20T00:00:00Z",
      endsAt: "2026-10-25T00:00:00Z",
    };
    assert.equal(isEventActive(expiredEv, now), false);
  });

  it("calcula o multiplicador de XP para todos os jogos ou para jogo específico", () => {
    const testNow = new Date("2026-10-31T12:00:00Z");
    const evTodos: SpecialEvent = {
      id: "ev_all",
      title: "Festival da SEMED",
      description: "",
      scope: "todos",
      bonusType: "dobro_xp",
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const res = calculateEventXpMultiplier("logica", [evTodos], testNow);
    assert.equal(res.multiplier, 2);
    assert.equal(res.eventName, "Festival da SEMED");

    // Evento específico para outro jogo não afeta este
    const evCartesiano: SpecialEvent = {
      id: "ev_cart",
      title: "Desafio Cartesiano",
      description: "",
      scope: "cartesiano",
      bonusType: "dobro_xp",
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const resLogica = calculateEventXpMultiplier("logica", [evCartesiano], testNow);
    assert.equal(resLogica.multiplier, 1);

    const resCartesiano = calculateEventXpMultiplier("cartesiano", [evCartesiano], testNow);
    assert.equal(resCartesiano.multiplier, 2);
  });

  it("sobrescreve o limite diário de XP caso haja evento de aumento", () => {
    const testNow = new Date("2026-10-31T12:00:00Z");
    const evCap: SpecialEvent = {
      id: "ev_cap",
      title: "Mega Limite de XP",
      description: "",
      scope: "todos",
      bonusType: "aumentar_limite_diario",
      bonusValue: 2500,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const cap = getEffectiveDailyXpCap(1000, [evCap], testNow);
    assert.equal(cap, 2500);
  });

  it("combina até 3 linhas simultâneas de bônus em eventos especiais (multiplicador, limite por partida e limite diário)", () => {
    const testNow = new Date("2026-10-31T12:00:00Z");
    const multiBonusEv: SpecialEvent = {
      id: "ev_triple",
      title: "Super Fim de Semana Turbinado",
      description: "2x XP, limite por partida de 50 XP e limite diário de 2500 XP!",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: 2,
      matchXpCap: 50,
      dailyXpCap: 2500,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-11-01T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const bonuses = getActiveEventBonuses("logica", 1000, 20, [multiBonusEv], testNow);
    assert.equal(bonuses.multiplier, 2);
    assert.equal(bonuses.matchXpCap, 50);
    assert.equal(bonuses.dailyXpCap, 2500);
    assert.ok(bonuses.activeEventNames.includes("Super Fim de Semana Turbinado"));
  });

  it("formata o tempo restante de forma amigável em português", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    assert.equal(
      formatEventRemainingTime("2026-11-02T15:00:00Z", now),
      "2d 3h restantes",
    );
    assert.equal(
      formatEventRemainingTime("2026-10-31T14:30:00Z", now),
      "2h 30m restantes",
    );
    assert.equal(
      formatEventRemainingTime("2026-10-31T12:15:00Z", now),
      "15 min restantes",
    );
    assert.equal(
      formatEventRemainingTime("2026-10-31T11:59:00Z", now),
      "Encerrado",
    );
  });

  it("ativa eventos recorrentes por dias da semana e datas específicas", () => {
    // 2026-10-31 is a Saturday (getDay() === 6)
    const saturday = new Date("2026-10-31T12:00:00Z");
    // 2026-11-02 is a Monday (getDay() === 1)
    const monday = new Date("2026-11-02T12:00:00Z");

    const weekendEv: RecurringEvent = {
      id: "rec_1",
      title: "Fim de Semana Premiado",
      description: "Bônus nos finais de semana",
      scope: "todos",
      daysOfWeek: [6, 0], // Saturday and Sunday
      specificDates: [],
      xpMultiplier: 2,
      matchXpCap: 50,
      dailyXpCap: 2500,
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    assert.equal(isRecurringEventActive(weekendEv, saturday), true);
    assert.equal(isRecurringEventActive(weekendEv, monday), false);

    // Specific date override (e.g. holiday on Monday 2026-11-02)
    const holidayEv: RecurringEvent = {
      ...weekendEv,
      daysOfWeek: [],
      specificDates: ["2026-11-02"],
    };
    assert.equal(isRecurringEventActive(holidayEv, monday), true);
    assert.equal(isRecurringEventActive(holidayEv, saturday), false);
  });

  it("unifica eventos pontuais e recorrentes ativos para exibição no carrossel do menu", () => {
    const saturday = new Date("2026-10-31T12:00:00Z");

    const specialEv: SpecialEvent = {
      id: "sp_1",
      title: "Desafio Especial Relâmpago",
      description: "Ganhe XP em dobro agora!",
      scope: "todos",
      bonusType: "dobro_xp",
      xpMultiplier: 2,
      dailyXpCap: 2000,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-10-31T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const saturdayEv: RecurringEvent = {
      id: "rec_sabado_xp",
      title: "+50% de XP do SÁBADO",
      description: "jogue qualquer partida e ganhe mais 50% de XP e um limite diário de 1500 XP",
      scope: "todos",
      daysOfWeek: [6],
      specificDates: [],
      xpMultiplier: 1.5,
      dailyXpCap: 1500,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const items = getAllActiveEvents([specialEv], [saturdayEv], saturday);
    assert.equal(items.length, 2);

    // Evento pontual
    assert.equal(items[0].title, "Desafio Especial Relâmpago");
    assert.equal(items[0].bonusTitle, "BÔNUS DO EVENTO");
    assert.equal(items[0].bonusBadges.length, 2);
    assert.equal(items[0].bonusBadges[0].label, "2x de XP (+100%)");
    assert.equal(items[0].bonusBadges[1].label, "+1000 XP/dia (2000 total)");
    assert.equal(items[0].bonusScopeText, "Todos os Jogos");

    // Evento recorrente de sábado
    assert.equal(items[1].title, "+50% de XP do SÁBADO");
    assert.equal(items[1].bonusTitle, "BÔNUS DO EVENTO");
    assert.equal(items[1].bonusBadges.length, 2);
    assert.equal(items[1].bonusBadges[0].label, "1.5x de XP (+50%)");
    assert.equal(items[1].bonusBadges[1].label, "+500 XP/dia (1500 total)");
    assert.equal(items[1].bonusScopeText, "Todos os Jogos");
    assert.equal(items[1].isRecurring, true);
  });

  it("possui eventos recorrentes pré-configurados para os fins de semana (Sábado e Domingo)", () => {
    assert.ok(DEFAULT_RECURRING_EVENTS.length >= 2);
    const sabado = DEFAULT_RECURRING_EVENTS.find((e) => e.daysOfWeek.includes(6));
    assert.ok(sabado);
    assert.equal(sabado?.title, "+50% de XP do SÁBADO");
    assert.equal(sabado?.dailyXpCap, 1500);
    assert.equal(sabado?.xpMultiplier, 1.5);
  });

  it("formata datas no padrão brasileiro DD/MM/AAAA e DD/MM/AAAA às HH:mm", () => {
    assert.equal(formatDateOnlyBR("2026-11-02"), "02/11/2026");
    assert.equal(formatDateOnlyBR("2026-05-18"), "18/05/2026");
    assert.equal(formatDateOnlyBR("2026-10-31T20:00:00Z"), "31/10/2026");

    // Formato com hora
    const dt = formatDateTimeBR("2026-11-02T15:30:00");
    assert.ok(dt.startsWith("02/11/2026 às "));
  });

  it("permite selecionar apenas um ou dois bônus (ex: apenas multiplicador de XP)", () => {
    const saturday = new Date("2026-10-31T12:00:00Z");

    // Evento com APENAS multiplicador de XP (sem teto da partida e sem teto diário)
    const multOnlyEv: SpecialEvent = {
      id: "sp_mult_only",
      title: "Hora do Dobro de XP",
      description: "Apenas multiplicador 2x",
      scope: "todos",
      bonusType: "dobro_xp",
      xpMultiplier: 2,
      matchXpCap: undefined,
      dailyXpCap: undefined,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-10-31T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const items = getAllActiveEvents([multOnlyEv], [], saturday);
    assert.equal(items.length, 1);
    assert.equal(items[0].bonusBadges.length, 1);
    assert.equal(items[0].bonusBadges[0].label, "2x de XP (+100%)");

    // Evento com APENAS teto por partida
    const matchOnlyEv: RecurringEvent = {
      id: "rec_match_only",
      title: "Desafio de Teto Alto",
      description: "Apenas limite por partida",
      scope: "todos",
      daysOfWeek: [6],
      specificDates: [],
      xpMultiplier: undefined,
      matchXpCap: 50,
      dailyXpCap: undefined,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const itemsMatch = getAllActiveEvents([], [matchOnlyEv], saturday);
    assert.equal(itemsMatch.length, 1);
    assert.equal(itemsMatch[0].bonusBadges.length, 1);
    assert.equal(itemsMatch[0].bonusBadges[0].label, "+30 XP/partida (50 máx)");

    // Evento com APENAS medalha vinculada (sem multiplicador, sem teto e sem limite diário)
    const medalOnlyEv: SpecialEvent = {
      id: "sp_medal_only",
      title: "Desafio da Medalha Especial",
      description: "Evento focado em missão de medalha",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: undefined,
      matchXpCap: undefined,
      dailyXpCap: undefined,
      linkedMedalIds: ["medal_campeao"],
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-10-31T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const itemsMedal = getAllActiveEvents([medalOnlyEv], [], saturday);
    assert.equal(itemsMedal.length, 1);
    assert.equal(itemsMedal[0].bonusBadges.length, 1);
    assert.equal(itemsMedal[0].bonusBadges[0].label, "🏅 Medalha Especial de Evento");
  });

  it("soma os bônus adicionais de múltiplos eventos ativos simultâneos (XP e Limites)", () => {
    const saturday = new Date("2026-10-31T12:00:00Z");

    // Evento A: +50% de XP (1.5x) e +500 XP no limite diário (1500)
    const eventA: SpecialEvent = {
      id: "ev_a",
      title: "Evento A",
      description: "",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: 1.5,
      dailyXpCap: 1500,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-10-31T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    // Evento B: 2.0x (+1.0x de XP) e +200 XP no limite diário (1200)
    const eventB: SpecialEvent = {
      id: "ev_b",
      title: "Evento B",
      description: "",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: 2.0,
      dailyXpCap: 1200,
      startsAt: "2026-10-31T00:00:00Z",
      endsAt: "2026-10-31T23:59:59Z",
      active: true,
      createdAt: "2026-10-31T00:00:00Z",
    };

    const bonuses = getActiveEventBonuses("todos" as any, 1000, 20, [eventA, eventB], saturday);
    // Base 1.0 + 0.5 (A) + 1.0 (B) = 2.5x total
    assert.equal(bonuses.multiplier, 2.5);
    // Base 1000 + 500 (A) + 200 (B) = 1700 total
    assert.equal(bonuses.dailyXpCap, 1700);
  });

  it("extrai corretamente múltiplos IDs de medalhas vinculadas e gera chave de ciclo única", () => {
    const punctual: SpecialEvent = {
      id: "ev_special_1",
      title: "Gincana 2026",
      description: "",
      scope: "todos",
      bonusType: "dobro_xp",
      startsAt: "2026-11-05T08:00:00Z",
      endsAt: "2026-11-05T18:00:00Z",
      active: true,
      linkedMedalId: "medal_old",
      linkedMedalIds: ["medal_old", "medal_new_1", "medal_new_2"],
      createdAt: "2026-11-05T08:00:00Z",
    };

    const medalIds = getEventLinkedMedalIds(punctual);
    assert.deepEqual(medalIds, ["medal_old", "medal_new_1", "medal_new_2"]);

    // Chave de ciclo de evento pontual é indexada pelo startsAt
    const cycleKeyPunctual = getEventCycleKey(punctual);
    assert.equal(cycleKeyPunctual, "ev_special_1_2026-11-05T08:00:00Z");

    // Chave de ciclo de evento recorrente varia por data
    const recEv: RecurringEvent = {
      id: "rec_weekend",
      title: "Fim de Semana",
      description: "",
      scope: "todos",
      daysOfWeek: [6, 0],
      specificDates: [],
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const dateSat = new Date("2026-11-07T14:00:00");
    const dateSun = new Date("2026-11-08T14:00:00");
    assert.equal(getEventCycleKey(recEv, dateSat), "rec_weekend_2026-11-07");
    assert.equal(getEventCycleKey(recEv, dateSun), "rec_weekend_2026-11-08");
    assert.notEqual(getEventCycleKey(recEv, dateSat), getEventCycleKey(recEv, dateSun));
  });

  it("aplica bônus de escopo 'modo_ranqueado' exclusivamente em partidas ranqueadas e não no modo normal", () => {
    const testNow = new Date("2026-11-05T12:00:00Z");
    const rankedEvent: SpecialEvent = {
      id: "ev_ranked_double",
      title: "Torneio Ranqueado 2x Pontos",
      description: "Ganhe o dobro de pontos de rank nesta semana!",
      scope: "modo_ranqueado",
      bonusType: "personalizado",
      rankedMultiplier: 2,
      xpMultiplier: 1.5,
      startsAt: "2026-11-05T00:00:00Z",
      endsAt: "2026-11-05T23:59:59Z",
      active: true,
      createdAt: "2026-11-05T00:00:00Z",
    };

    // 1. Partida Ranqueada (isRankedMatch = true) -> Multiplicadores aplicados!
    const rankedBonuses = getActiveEventBonuses(
      "minado",
      1000,
      20,
      [rankedEvent],
      testNow,
      [],
      true, // isRankedMatch = true
    );
    assert.equal(rankedBonuses.rankedMultiplier, 2);
    assert.equal(rankedBonuses.multiplier, 1.5);
    assert.equal(rankedBonuses.activeEventNames.includes("Torneio Ranqueado 2x Pontos"), true);

    // 2. Partida Normal do mesmo jogo (isRankedMatch = false) -> Bônus NÃO aplicados!
    const normalBonuses = getActiveEventBonuses(
      "minado",
      1000,
      20,
      [rankedEvent],
      testNow,
      [],
      false, // isRankedMatch = false
    );
    assert.equal(normalBonuses.rankedMultiplier, 1);
    assert.equal(normalBonuses.multiplier, 1);
    assert.equal(normalBonuses.activeEventNames.length, 0);
  });

  it("garante que evento com scope 'todos' aplica XP e diário para partidas normais, mas reserva multiplicador de ranqueada para a ranqueada", () => {
    const testNow = new Date("2026-11-07T12:00:00Z");
    const weekendEvent: SpecialEvent = {
      id: "ev_weekend_combined",
      title: "3X de XP do Fim de Semana",
      description: "Super evento",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: 3,
      rankedMultiplier: 1.5,
      pointsMultiplier: 1.5,
      dailyXpCap: 1700,
      startsAt: "2026-11-07T00:00:00Z",
      endsAt: "2026-11-07T23:59:59Z",
      active: true,
      createdAt: "2026-11-07T00:00:00Z",
    };

    // Partida Normal: recebe 3x XP, teto diário 1700, 1.5x moedas, MAS rankedMultiplier fica 1
    const normalBonuses = getActiveEventBonuses(
      "logica",
      1000,
      20,
      [weekendEvent],
      testNow,
      [],
      false, // normal
    );
    assert.equal(normalBonuses.multiplier, 3);
    assert.equal(normalBonuses.dailyXpCap, 1700);
    assert.equal(normalBonuses.pointsMultiplier, 1.5);
    assert.equal(normalBonuses.rankedMultiplier, 1);

    // Partida Ranqueada: recebe 3x XP, teto 1700 E o rankedMultiplier 1.5x
    const rankedBonuses = getActiveEventBonuses(
      "logica",
      1000,
      20,
      [weekendEvent],
      testNow,
      [],
      true, // ranqueada
    );
    assert.equal(rankedBonuses.multiplier, 3);
    assert.equal(rankedBonuses.dailyXpCap, 1700);
    assert.equal(rankedBonuses.pointsMultiplier, 1.5);
    assert.equal(rankedBonuses.rankedMultiplier, 1.5);
  });
});
