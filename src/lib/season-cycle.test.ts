import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthlyTournamentDates,
  computeMonthlyTournamentDatesForYearMonth,
  computeNextMonthlyTournamentDates,
  computeSeasonDates,
  extendSeasonDate,
  formatOfficialCoariDate,
  getSeasonProgress,
  toDatetimeLocalString,
  parseDatetimeLocal,
  SEASON_DURATION_PRESETS,
} from "./season-cycle.ts";
import {
  PRESERVED_BETA_END_MEDAL_IDS,
  isMedalPreservedOnBetaEnd,
} from "./medals-catalog.ts";
import {
  convertPointsToCoins,
  autoConvertAllPointsToCoins,
} from "./career-points.ts";
import type { PlayerProfile } from "./playfab.ts";

describe("Gestão de Ciclos de Temporada (season-cycle)", () => {
  it("contém os presets padrão de 7, 14 e 30 dias", () => {
    assert.deepEqual(SEASON_DURATION_PRESETS, [7, 14, 30]);
  });

  it("calcula datas de início e término com encerramento às 23:59:59", () => {
    const baseDate = new Date("2026-11-01T00:00:00");
    const { start, end } = computeSeasonDates(baseDate, 14);

    assert.equal(start.getTime(), baseDate.getTime());
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getSeconds(), 59);
    // De 01/11 até 14/11 são exatamente 14 dias (01, 02 ... 14)
    assert.equal(end.getDate(), 14);
  });

  it("estende o prazo da temporada mantendo 23:59:59 e empurrando a data final", () => {
    const currentEnd = new Date("2026-11-14T23:59:59.999Z");
    const extendedEnd = extendSeasonDate(currentEnd, 7);

    assert.equal(extendedEnd.getHours(), 23);
    assert.equal(extendedEnd.getMinutes(), 59);
    const addedDays = Math.round((extendedEnd.getTime() - currentEnd.getTime()) / (24 * 60 * 60 * 1000));
    assert.equal(addedDays, 7);
  });

  it("calcula progresso, dias decorridos e contagem regressiva da temporada", () => {
    const start = new Date("2026-11-01T00:00:00Z");
    const end = new Date("2026-11-15T23:59:59Z");
    // Simulando dia 08 (metade do ciclo)
    const midPoint = new Date("2026-11-08T12:00:00Z").getTime();

    const info = getSeasonProgress(start.toISOString(), end.toISOString(), midPoint);
    assert.equal(info.isExpired, false);
    assert.equal(info.totalDays, 15);
    assert.ok(info.elapsedDays >= 7);
    assert.ok(info.remainingDays >= 7);
    assert.ok(info.progressPercent >= 45 && info.progressPercent <= 55);
    assert.match(info.formattedCountdown, /Termina em 7d/);
  });

  it("detecta temporada concluída quando a data atual ultrapassa a data final", () => {
    const start = new Date("2026-11-01T00:00:00Z");
    const end = new Date("2026-11-10T23:59:59Z");
    const afterEnd = new Date("2026-11-11T00:00:00Z").getTime();

    const info = getSeasonProgress(start.toISOString(), end.toISOString(), afterEnd);
    assert.equal(info.isExpired, true);
    assert.equal(info.remainingDays, 0);
    assert.equal(info.progressPercent, 100);
    assert.match(info.formattedCountdown, /Temporada Concluída/);
  });

  it("formata e converte datas para input datetime-local com segurança", () => {
    const d = new Date(2026, 10, 15, 14, 30); // 15 de Novembro de 2026, 14:30
    const str = toDatetimeLocalString(d);
    assert.equal(str, "2026-11-15T14:30");

    const parsed = parseDatetimeLocal(str);
    assert.ok(parsed);
    assert.equal(parsed?.getFullYear(), 2026);
    assert.equal(parsed?.getMonth(), 10);
    assert.equal(parsed?.getDate(), 15);
  });

  it("calcula ciclos mensais exatos em UTC-4 (28, 29, 30 e 31 dias) e transiciona Beta 31/12/2026 -> 12 meses de 2027", () => {
    // Beta encerra em 31/12/2026 às 23:59:59.999 UTC-4 (= 2027-01-01T03:59:59.999Z)
    const betaEndIso = "2027-01-01T03:59:59.999Z";
    const jan2027 = computeNextMonthlyTournamentDates(betaEndIso, new Date("2027-01-01T04:00:05.000Z"));
    assert.equal(jan2027.monthKey, "2027-01");
    assert.equal(jan2027.monthLabel, "Janeiro/2027");
    assert.equal(jan2027.durationDays, 31);
    assert.equal(jan2027.start.toISOString(), "2027-01-01T04:00:00.000Z");
    assert.equal(jan2027.end.toISOString(), "2027-02-01T03:59:59.999Z");

    // Fevereiro/2027 (ano não bissexto = 28 dias)
    const fev2027 = computeNextMonthlyTournamentDates(jan2027.end.toISOString(), new Date("2027-02-01T04:00:05.000Z"));
    assert.equal(fev2027.monthKey, "2027-02");
    assert.equal(fev2027.durationDays, 28);
    assert.equal(fev2027.start.toISOString(), "2027-02-01T04:00:00.000Z");
    assert.equal(fev2027.end.toISOString(), "2027-03-01T03:59:59.999Z");

    // Abril/2027 (30 dias) e Fevereiro/2028 (ano bissexto = 29 dias)
    const abr2027 = computeMonthlyTournamentDatesForYearMonth(2027, 3);
    assert.equal(abr2027.durationDays, 30);
    assert.equal(abr2027.end.toISOString(), "2027-05-01T03:59:59.999Z");

    const fev2028 = computeMonthlyTournamentDatesForYearMonth(2028, 1);
    assert.equal(fev2028.durationDays, 29);
    assert.equal(fev2028.end.toISOString(), "2028-03-01T03:59:59.999Z");

    // Verifica que 2027-01-31 22:00 UTC-4 (= 2027-02-01T02:00:00Z) ainda pertence a Janeiro/2027 em Coari!
    const lateJanCoari = computeMonthlyTournamentDates(new Date("2027-02-01T02:00:00.000Z"));
    assert.equal(lateJanCoari.monthKey, "2027-01");

    // Verifica que formatOfficialCoariDate nunca desloca 23:59 UTC-4 para o dia seguinte em outros fusos
    assert.equal(formatOfficialCoariDate(betaEndIso), "31/12/2026");
    assert.equal(formatOfficialCoariDate(betaEndIso, { includeYear: false }), "31/12");
    assert.equal(formatOfficialCoariDate(jan2027.end), "31/01/2027");
    assert.equal(formatOfficialCoariDate(jan2027.end, { includeYear: false }), "31/01");
    assert.equal(formatOfficialCoariDate(fev2027.end), "28/02/2027");
  });
});

describe("Regras do Reset de Temporada e Economia de Moedas", () => {
  it("preserva estritamente as 25 medalhas especiais acordadas e revoga as medalhas comuns de atividades", () => {
    assert.equal(PRESERVED_BETA_END_MEDAL_IDS.length, 25);

    // Medalhas preservadas
    for (const preservedId of PRESERVED_BETA_END_MEDAL_IDS) {
      assert.equal(isMedalPreservedOnBetaEnd(preservedId), true, `Deveria preservar ${preservedId}`);
    }

    // Medalhas revogadas (jogos, fases, auras comuns)
    const revokedSample = [
      "spacequest_safira",
      "spacequest_ametista",
      "spacequest_rubi",
      "spacequest_ambar",
      "logica_bronze",
      "logica_prata",
      "quiz_ouro",
      "padroes_bronze",
      "memoria_ouro",
      "labirinto_prata",
    ];

    for (const revokedId of revokedSample) {
      assert.equal(isMedalPreservedOnBetaEnd(revokedId), false, `Deveria revogar ${revokedId}`);
    }
  });

  it("converte saldo de pontos em moedas debitando pointsBalance sem reduzir careerPoints", () => {
    const initialProfile: PlayerProfile = {
      id: "p_test_student",
      nick: "AlunoTeste",
      nickNormalized: "alunoteste",
      full_name: "ALUNO TESTE",
      school: "Nenhuma",
      grade: null,
      birthdate: "2013-05-10",
      xp: 1500,
      seasonXp: 1500,
      level: 4,
      wins: 10,
      matchesPlayed: 20,
      distinctGamesPlayed: 5,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
      pointsBalance: 500,
      careerPoints: 1200,
      coins: 50,
    };

    // Conversão voluntária de 200 pontos na proporção 1:1
    const res = convertPointsToCoins(initialProfile, 200, 1);

    assert.equal(res.success, true);
    assert.equal(res.coinsAwarded, 200);
    assert.equal(res.remainingBalance, 300);
    assert.equal(initialProfile.pointsBalance, 300); // 500 - 200
    assert.equal(initialProfile.coins, 250); // 50 + 200
    assert.equal(initialProfile.careerPoints, 1200); // rigorosamente intocado!
  });

  it("auto-converte todo o saldo de pontos em moedas no encerramento de temporada", () => {
    const profile: PlayerProfile = {
      id: "p_test_student_2",
      nick: "AlunoAuto",
      nickNormalized: "alunoauto",
      full_name: "ALUNO AUTO",
      school: "Nenhuma",
      grade: null,
      birthdate: "2013-05-10",
      xp: 1000,
      seasonXp: 1000,
      level: 3,
      wins: 5,
      matchesPlayed: 10,
      distinctGamesPlayed: 3,
      badges: [],
      seasonId: 1,
      unlockedMedals: [],
      pointsBalance: 750,
      careerPoints: 2500,
      coins: 100,
    };

    // Encerramento da temporada converte todo o saldo
    const res = autoConvertAllPointsToCoins(profile, 1);

    assert.equal(res.coinsAwarded, 750);
    assert.equal(res.newCoinsBalance, 850); // 100 + 750 moedas disponíveis para cosméticos
    assert.equal(profile.pointsBalance, 0); // saldo zerado para a nova temporada
    assert.equal(profile.coins, 850);
    assert.equal(profile.careerPoints, 2500); // ranking histórico preservado intacto!
  });

  it("Bloco 1.1 (RANK-06): getSeasonProgress não mostra 'Última hora' a 1h45m nem '0 min' a 1h00m e extendSeasonDate usa Coari UTC-4", () => {
    // End = 2026-11-30T23:59:59.000-04:00 (= 2026-12-01T03:59:59.000Z)
    const startIso = "2026-11-01T04:00:00.000Z";
    const endIso = "2026-12-01T03:59:59.000Z";
    const endMs = new Date(endIso).getTime();

    // 1h45m antes do fim
    const prog1h45 = getSeasonProgress(startIso, endIso, endMs - (105 * 60 * 1000));
    assert.ok(!prog1h45.formattedCountdown.includes("Última hora"));
    assert.match(prog1h45.formattedCountdown, /1h e 45min/);

    // 1h00m exata antes do fim
    const prog1h00 = getSeasonProgress(startIso, endIso, endMs - (60 * 60 * 1000));
    assert.ok(!prog1h00.formattedCountdown.includes("Última hora"));
    assert.ok(!prog1h00.formattedCountdown.includes("0 min"));
    assert.match(prog1h00.formattedCountdown, /1h/);

    // 45m antes do fim (abaixo de 1h -> última hora)
    const prog45m = getSeasonProgress(startIso, endIso, endMs - (45 * 60 * 1000));
    assert.match(prog45m.formattedCountdown, /Última hora! Termina em 45 min/);

    // extendSeasonDate com 30/11/2026 23:59:59 Coari UTC-4 + 7 dias -> 07/12/2026 23:59:59.999 Coari UTC-4
    const extended = extendSeasonDate(new Date(endIso), 7);
    assert.equal(formatOfficialCoariDate(extended), "07/12/2026");
    assert.equal(extended.toISOString(), "2026-12-08T03:59:59.999Z");
  });
});
