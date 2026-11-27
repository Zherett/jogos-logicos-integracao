import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getCoariTimeParts } from "./official-time.ts";
import {
  clearMemoryScheduledRules,
  isRuleDue,
  computeCycleKey,
  computeNextRunDate,
  triggerScheduledRule,
  evaluateAndTriggerScheduledMessages,
  upsertScheduledInboxRule,
  deleteScheduledInboxRule,
  toggleScheduledInboxRuleActive,
  formatRecurrenceLabel,
  type ScheduledInboxRule,
} from "./scheduled-inbox.ts";
import {
  clearMemoryInboxMessages,
  loadAllInboxMessages,
  getMessageReaders,
  getInboxMessagesForPlayer,
  isMessageCanceled,
} from "./inbox-messages.ts";
import type { PlayerProfile } from "./playfab.ts";

function createTestStudent(id = "aluno_1", nick = "Dedé"): PlayerProfile {
  return {
    id,
    nick,
    nickNormalized: nick.toLowerCase(),
    full_name: "ALUNO TESTE",
    school: "Raimundo Bezerra",
    grade: "5º ano",
    birthdate: "2014-05-10",
    xp: 500,
    seasonXp: 500,
    level: 3,
    wins: 10,
    matchesPlayed: 15,
    pointsBalance: 100,
    careerPoints: 250,
    badges: [],
    unlockedMedals: [],
    seasonId: 1,
  };
}

describe("Sistema de Mensagens Programadas e Recorrentes (scheduled-inbox)", () => {
  beforeEach(() => {
    clearMemoryScheduledRules();
    clearMemoryInboxMessages();
  });

  it("identifica corretamente quando uma regra semanal deve disparar no dia e hora corretos", () => {
    // Sábado às 08:00 (dia 6)
    const rule: ScheduledInboxRule = {
      id: "regra_sabado",
      title: "Bônus de Fim de Semana Ativo!",
      body: "Aproveite o bônus de XP hoje!",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [6], // Sábado
      timeOfDay: "08:00",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    // Cenário 1: Sábado às 07:30 em Coari (ainda não deu o horário)
    const sabadoCedo = new Date("2026-11-07T07:30:00-04:00"); // 07/11/2026 é Sábado
    assert.equal(getCoariTimeParts(sabadoCedo.getTime()).dayOfWeek, 6);
    assert.equal(isRuleDue(rule, sabadoCedo), false);

    // Cenário 2: Sexta-feira às 09:00 em Coari (dia errado)
    const sexta = new Date("2026-11-06T09:00:00-04:00"); // 06/11/2026 é Sexta
    assert.equal(isRuleDue(rule, sexta), false);

    // Cenário 3: Sábado às 08:05 em Coari (horário atingido)
    const sabadoNaHora = new Date("2026-11-07T08:05:00-04:00");
    assert.equal(isRuleDue(rule, sabadoNaHora), true);
  });

  it("impede disparo duplicado dentro do mesmo ciclo semanal", () => {
    const rule: ScheduledInboxRule = {
      id: "regra_sabado",
      title: "Aviso de Sábado",
      body: "Texto",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [6],
      timeOfDay: "08:00",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    const sabado8h = new Date("2026-11-07T08:00:00-04:00");
    assert.equal(isRuleDue(rule, sabado8h), true);

    // Dispara a regra no sábado
    const { updatedRule } = triggerScheduledRule(rule, sabado8h);
    assert.ok(updatedRule.lastTriggeredAt);
    assert.ok(updatedRule.lastTriggeredCycleKey);

    // Tentativa de disparar novamente no mesmo sábado às 10:00
    const sabado10h = new Date("2026-11-07T10:00:00-04:00");
    assert.equal(isRuleDue(updatedRule, sabado10h), false);

    // No PRÓXIMO sábado (14/11/2026 às 08:00 Coari), deve estar apta novamente!
    const proximoSabado = new Date("2026-11-14T08:00:00-04:00");
    assert.equal(isRuleDue(updatedRule, proximoSabado), true);
  });

  it("renovação de ciclo semanal: apaga dados do ciclo anterior e zera leituras para a nova semana", () => {
    const s1 = createTestStudent("aluno_1", "Pedrinho");
    const s2 = createTestStudent("aluno_2", "Maria");
    const allStudents = [s1, s2];

    const rule: ScheduledInboxRule = {
      id: "regra_fds",
      title: "Evento do Fim de Semana",
      body: "Mensagem da semana",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [6],
      timeOfDay: "08:00",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    // 1º SÁBADO (07/11/2026): 1º disparo
    const sabado1 = new Date(2026, 10, 7, 8, 0);
    const { updatedRule: ruleSemana1, message: msgSemana1 } = triggerScheduledRule(rule, sabado1);

    // Verifica que mensagem foi criada na caixa dos alunos
    let msgsAluno = getInboxMessagesForPlayer(s1);
    assert.equal(msgsAluno.length, 1);
    assert.equal(msgsAluno[0].id, msgSemana1.id);

    // 2º SÁBADO (14/11/2026): novo disparo (novo ciclo semanal)
    const sabado2 = new Date(2026, 10, 14, 8, 0);
    const { updatedRule: ruleSemana2, message: msgSemana2 } = triggerScheduledRule(ruleSemana1, sabado2);

    // A mensagem anterior deve ter sido removida do repositório global e substituída pela nova
    const allMsgs = loadAllInboxMessages();
    assert.equal(allMsgs.some((m) => m.id === msgSemana1.id), false);
    assert.equal(allMsgs.some((m) => m.id === msgSemana2.id), true);

    // Os leitores da nova semana iniciam estritamente ZERADOS (0 leituras, 2 pendentes)
    const leitoresNovaSemana = getMessageReaders(msgSemana2, allStudents);
    assert.equal(leitoresNovaSemana.readCount, 0);
    assert.equal(leitoresNovaSemana.unreadStudents.length, 2);
    assert.equal(leitoresNovaSemana.totalTargeted, 2);

    // O aluno agora possui a nova mensagem da semana como não lida
    msgsAluno = getInboxMessagesForPlayer(s1);
    assert.equal(msgsAluno.length, 1);
    assert.equal(msgsAluno[0].id, msgSemana2.id);
    assert.equal(msgsAluno[0].read, false);
  });

  it("calcula corretamente a próxima data de envio (computeNextRunDate)", () => {
    const rule: ScheduledInboxRule = {
      id: "regra_segunda",
      title: "Início de Semana",
      body: "Bom estudo!",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [1], // Segunda-feira
      timeOfDay: "07:30",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    // Se hoje for Sábado 07/11/2026 às 10:00 Coari, a próxima segunda é dia 09/11/2026 às 07:30 Coari
    const sabado = new Date("2026-11-07T10:00:00-04:00");
    const nextRun = computeNextRunDate(rule, sabado);
    assert.ok(nextRun);
    const nextCoari = getCoariTimeParts(nextRun.getTime());
    assert.equal(nextCoari.dayOfWeek, 1); // Segunda
    assert.equal(nextCoari.day, 9); // Dia 9
    assert.equal(nextCoari.hour, 7);
    assert.equal(nextCoari.minute, 30);
  });

  it("suporta regra de disparo pontual (once) e a desativa após o envio", () => {
    const rule: ScheduledInboxRule = {
      id: "regra_pontual",
      title: "Feriado Municipal",
      body: "Não haverá aula amanhã.",
      active: true,
      recurrence: "once",
      specificDate: "2026-11-20",
      timeOfDay: "14:00",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    const diaFeriado = new Date("2026-11-20T14:00:00-04:00");
    assert.equal(isRuleDue(rule, diaFeriado), true);

    const { updatedRule } = triggerScheduledRule(rule, diaFeriado);
    assert.equal(updatedRule.active, false); // Desativou após execução única
    assert.equal(isRuleDue(updatedRule, diaFeriado), false);
  });

  it("gerencia CRUD de regras (upsert, toggle e delete)", () => {
    const r1: ScheduledInboxRule = {
      id: "regra_1",
      title: "Regra 1",
      body: "Texto 1",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [5], // Sexta
      timeOfDay: "12:00",
      recipientMode: "all",
      createdAt: new Date().toISOString(),
    };

    upsertScheduledInboxRule(r1);
    let list = toggleScheduledInboxRuleActive("regra_1", false);
    assert.equal(list.find((r) => r.id === "regra_1")?.active, false);

    list = deleteScheduledInboxRule("regra_1");
    assert.equal(list.some((r) => r.id === "regra_1"), false);
  });

  it("formata rótulos de frequência de forma amigável", () => {
    const rSemanal: ScheduledInboxRule = {
      id: "r1",
      title: "T",
      body: "B",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [0, 6],
      timeOfDay: "08:00",
      recipientMode: "all",
      createdAt: "",
    };
    assert.equal(formatRecurrenceLabel(rSemanal), "Fins de Semana (Sáb e Dom) às 08:00");

    const rMensal: ScheduledInboxRule = {
      id: "r2",
      title: "T",
      body: "B",
      active: true,
      recurrence: "monthly",
      dayOfMonth: 1,
      timeOfDay: "09:00",
      recipientMode: "all",
      createdAt: "",
    };
    assert.equal(formatRecurrenceLabel(rMensal), "Todo dia 1 do mês às 09:00");
  });

  it("Bloco 1.3 (ECON-14): evita overflow em meses curtos (dia 31 -> 28/29/30), ancora validFrom >14d e gera ID determinístico com tombstone", () => {
    const monthly31: ScheduledInboxRule = {
      id: "rule_m31",
      title: "Fechamento do Mês",
      body: "Aviso mensal",
      active: true,
      recurrence: "monthly",
      dayOfMonth: 31,
      timeOfDay: "08:00",
      recipientMode: "all",
      createdAt: "2026-01-01T12:00:00.000Z",
    };

    // Fevereiro 2026 (28 dias) às 08:30 Coari (12:30Z) deve disparar em 28/02 e NÃO pular!
    const feb28Due = new Date("2026-02-28T12:30:00.000Z");
    assert.equal(isRuleDue(monthly31, feb28Due), true);

    // Próxima execução após 01/02 deve cair em 28/02/2026 (nunca overflow para 03/03!)
    const nextFeb = computeNextRunDate(monthly31, new Date("2026-02-01T12:00:00.000Z"));
    assert.ok(nextFeb);
    assert.equal(nextFeb.toISOString(), "2026-02-28T12:00:00.000Z");

    // Semanal com validFrom > 14 dias no futuro encontra próxima ocorrência válida
    const futureWeekly: ScheduledInboxRule = {
      id: "rule_w_future",
      title: "Semanal Futura",
      body: "Teste",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [6], // sábado
      timeOfDay: "09:00",
      validFrom: "2026-08-01",
      recipientMode: "all",
      createdAt: "2026-07-01T12:00:00.000Z",
    };
    const nextW = computeNextRunDate(futureWeekly, new Date("2026-07-01T12:00:00.000Z"));
    assert.ok(nextW);
    assert.equal(nextW.toISOString().startsWith("2026-08-01"), true);

    // triggerScheduledRule gera ID determinístico sched_<cycleKey>, preenche metadata e cancela ciclo anterior
    const ruleDet: ScheduledInboxRule = {
      id: "rule_det",
      title: "Ciclo",
      body: "Corpo",
      active: true,
      recurrence: "weekly",
      daysOfWeek: [6],
      timeOfDay: "08:00",
      recipientMode: "all",
      lastTriggeredMessageId: "msg_ciclo_antigo",
      createdAt: "2026-11-01T12:00:00.000Z",
    };
    const { updatedRule, message } = triggerScheduledRule(ruleDet, new Date("2026-11-28T12:30:00.000Z"));
    assert.equal(message.id, "sched_rule_det_weekly_2026-11-28");
    assert.equal(updatedRule.lastTriggeredMessageId, message.id);
    assert.equal((message.metadata as any)?.scheduledRuleId, "rule_det");
    assert.equal((message.metadata as any)?.cycleKey, "rule_det_weekly_2026-11-28");
    assert.equal(isMessageCanceled("msg_ciclo_antigo"), true);
    assert.equal(isMessageCanceled(message.id), false);
  });
});
