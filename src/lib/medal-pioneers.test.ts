import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMedalPioneers,
  formatPioneerLabel,
  getCachedMedalPioneers,
  invalidatePioneersCache,
} from "./medal-pioneers.ts";
import type { PlayerProfile } from "./playfab.ts";

function createMockPlayer(data: Partial<PlayerProfile>): PlayerProfile {
  return {
    id: data.id ?? "mock_id",
    nick: data.nick ?? "MockNick",
    nickNormalized: data.nickNormalized ?? (data.nick ?? "MockNick").toLowerCase(),
    full_name: data.full_name ?? "MOCK STUDENT",
    school: data.school ?? "Raimundo Bezerra",
    grade: "6º ano",
    turma: "A",
    birthdate: "2013-05-10",
    xp: 100,
    seasonXp: 100,
    level: 1,
    wins: 5,
    matchesPlayed: 10,
    badges: [],
    seasonId: 1,
    unlockedMedals: data.unlockedMedals ?? [],
    isAdmin: data.isAdmin ?? false,
    deletedAt: data.deletedAt,
  };
}

describe("Detecção de Pioneiros de Medalhas (medal-pioneers)", () => {
  it("identifica corretamente o primeiro aluno a conquistar cada medalha por data cronológica", () => {
    const p1 = createMockPlayer({
      id: "p1",
      nick: "lucas_1",
      full_name: "LUCAS SILVA",
      school: "Escola A",
      unlockedMedals: [
        { medalId: "ouro_matematica", unlockedAt: "2026-11-03T10:00:00.000Z" },
        { medalId: "bronze_logica", unlockedAt: "2026-11-04T12:00:00.000Z" },
      ],
    });

    const p2 = createMockPlayer({
      id: "p2",
      nick: "maria_2",
      full_name: "MARIA CLARA",
      school: "Escola B",
      unlockedMedals: [
        { medalId: "ouro_matematica", unlockedAt: "2026-11-03T09:00:00.000Z" }, // Conquistou 1 hora antes de Lucas!
        { medalId: "bronze_logica", unlockedAt: "2026-11-04T15:00:00.000Z" },
      ],
    });

    const pioneers = computeMedalPioneers([p1, p2]);

    assert.equal(pioneers["ouro_matematica"].studentNick, "maria_2");
    assert.equal(pioneers["ouro_matematica"].studentSchool, "Escola B");

    assert.equal(pioneers["bronze_logica"].studentNick, "lucas_1");
    assert.equal(pioneers["bronze_logica"].studentSchool, "Escola A");
  });

  it("ignora estritamente contas de teste ZHERET e LORD (mesmo sendo perfis de jogadores comuns)", () => {
    const admTest1 = createMockPlayer({
      id: "test_zheret",
      nick: "ZHERET",
      nickNormalized: "zheret",
      full_name: "ZHERET ADMINISTRADOR TESTE",
      isAdmin: false, // Perfil comum usado pelo ADM
      unlockedMedals: [
        { medalId: "diamante_mestre", unlockedAt: "2026-11-01T08:00:00.000Z" },
      ],
    });

    const admTest2 = createMockPlayer({
      id: "test_lord",
      nick: "LORD",
      nickNormalized: "lord",
      full_name: "LORD JOGADOR TESTE",
      isAdmin: false, // Perfil comum usado pelo ADM
      unlockedMedals: [
        { medalId: "diamante_mestre", unlockedAt: "2026-11-01T09:00:00.000Z" },
      ],
    });

    const realStudent = createMockPlayer({
      id: "real_aluno",
      nick: "ana_beatriz",
      full_name: "ANA BEATRIZ SOUZA",
      school: "Raimundo Bezerra",
      unlockedMedals: [
        { medalId: "diamante_mestre", unlockedAt: "2026-11-02T14:30:00.000Z" }, // Ganhou depois do teste do ADM
      ],
    });

    const pioneers = computeMedalPioneers([admTest1, admTest2, realStudent]);

    // O pioneiro oficial deve ser a aluna real Ana Beatriz!
    assert.equal(pioneers["diamante_mestre"].studentNick, "ana_beatriz");
    assert.equal(pioneers["diamante_mestre"].studentFullName, "ANA BEATRIZ SOUZA");
  });

  it("ignora contas na lixeira ou suspensas", () => {
    const deletedPlayer = createMockPlayer({
      id: "del_1",
      nick: "excluido",
      deletedAt: "2026-11-05T10:00:00.000Z",
      unlockedMedals: [
        { medalId: "platina_fogo", unlockedAt: "2026-11-01T10:00:00.000Z" },
      ],
    });

    const activePlayer = createMockPlayer({
      id: "act_1",
      nick: "ativo_real",
      full_name: "ALUNO ATIVO",
      unlockedMedals: [
        { medalId: "platina_fogo", unlockedAt: "2026-11-03T10:00:00.000Z" },
      ],
    });

    const pioneers = computeMedalPioneers([deletedPlayer, activePlayer]);
    assert.equal(pioneers["platina_fogo"].studentNick, "ativo_real");
  });

  it("formata o texto do pioneiro corretamente para medalhas obtidas e inéditas", () => {
    const emptyLabel = formatPioneerLabel(null);
    assert.equal(emptyLabel.hasPioneer, false);
    assert.ok(emptyLabel.description.includes("Seja o primeiro"));

    const filledLabel = formatPioneerLabel({
      medalId: "m1",
      studentId: "s1",
      studentNick: "joaozinho",
      studentFullName: "JOÃO SILVA",
      studentSchool: "Ursulina Souza",
      unlockedAt: "2026-11-04T10:30:00.000Z",
      timestampMs: Date.parse("2026-11-04T10:30:00.000Z"),
    });

    assert.equal(filledLabel.hasPioneer, true);
    assert.ok(filledLabel.description.includes("JOÃO SILVA"));
    assert.ok(filledLabel.description.includes("Ursulina Souza"));
  });

  it("recalcula o cache automaticamente quando um aluno conquista nova medalha mesmo mantendo o mesmo total de alunos", () => {
    invalidatePioneersCache();
    const student = createMockPlayer({
      id: "s1",
      nick: "aluno_1",
      full_name: "ALUNO UM",
      unlockedMedals: [{ medalId: "lvl_2", unlockedAt: "2026-11-16T09:00:00.000Z" }],
    });

    const first = getCachedMedalPioneers([student]);
    assert.ok(first["lvl_2"]);
    assert.equal(first["complete_1_game"], undefined);

    const updatedStudent = {
      ...student,
      unlockedMedals: [
        ...(student.unlockedMedals ?? []),
        { medalId: "complete_1_game", unlockedAt: "2026-11-16T10:43:00.000Z" },
      ],
    };

    const second = getCachedMedalPioneers([updatedStudent]);
    assert.equal(second["complete_1_game"]?.studentNick, "aluno_1");
  });
});
