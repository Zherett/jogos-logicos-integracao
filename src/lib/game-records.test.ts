import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStageGameRecordUpdate,
  formatRecordDateBR,
  getRecordKey,
  type StageGameRecord,
} from "./game-records.ts";

describe("Sistema de Recordes de Pontuação por Jogo e por Etapa", () => {
  it("cria a chave única de jogo e etapa", () => {
    assert.equal(getRecordKey("logica", "etapa_1"), "logica:etapa_1");
    assert.equal(getRecordKey("rpg", "etapa_2"), "rpg:etapa_2");
  });

  it("estabelece o primeiro recorde para um jogo e etapa", () => {
    const res = evaluateStageGameRecordUpdate(null, {
      gameId: "logica",
      stage: "etapa_1",
      playerId: "p1",
      nick: "Maria10",
      fullName: "MARIA SILVA",
      school: "Elisângela Litaiff",
      score: 150,
      achievedAt: 1_000_000_000,
    });

    assert.equal(res.isNewRecord, true);
    assert.equal(res.isTiedRecord, false);
    assert.equal(res.updatedRecord.score, 150);
    assert.equal(res.updatedRecord.holders.length, 1);
    assert.equal(res.updatedRecord.holders[0].nick, "Maria10");
    assert.equal(res.updatedRecord.holders[0].achievedAt, 1_000_000_000);
  });

  it("substitui o recorde por um novo detentor quando a pontuação for superada", () => {
    const existing: StageGameRecord = {
      gameId: "logica",
      stage: "etapa_1",
      score: 150,
      holders: [
        {
          playerId: "p1",
          nick: "Maria10",
          school: "Elisângela Litaiff",
          achievedAt: 1_000_000_000,
        },
      ],
      updatedAt: 1_000_000_000,
    };

    const res = evaluateStageGameRecordUpdate(existing, {
      gameId: "logica",
      stage: "etapa_1",
      playerId: "p2",
      nick: "Joao11",
      fullName: "JOAO SOUZA",
      school: "Raimundo Bezerra",
      score: 180, // Superou 150!
      achievedAt: 2_000_000_000,
    });

    assert.equal(res.isNewRecord, true);
    assert.equal(res.isTiedRecord, false);
    assert.equal(res.updatedRecord.score, 180);
    assert.equal(res.updatedRecord.holders.length, 1);
    assert.equal(res.updatedRecord.holders[0].nick, "Joao11");
    assert.equal(res.updatedRecord.holders[0].achievedAt, 2_000_000_000);
  });

  it("exibe detentores empatados no recorde máximo na ordem cronológica que cada um alcançou", () => {
    const record150: StageGameRecord = {
      gameId: "cartesiano",
      stage: "etapa_1",
      score: 150,
      holders: [
        {
          playerId: "p1",
          nick: "MariaPrimeira",
          achievedAt: 1_000_000, // 1ª a alcançar
        },
      ],
      updatedAt: 1_000_000,
    };

    // 2º jogador empata com os mesmos 150 pontos em momento posterior
    const res2 = evaluateStageGameRecordUpdate(record150, {
      gameId: "cartesiano",
      stage: "etapa_1",
      playerId: "p2",
      nick: "JoaoSegundo",
      score: 150,
      achievedAt: 2_000_000, // 2º a alcançar
    });

    assert.equal(res2.isNewRecord, false);
    assert.equal(res2.isTiedRecord, true);
    assert.equal(res2.updatedRecord.score, 150);
    assert.equal(res2.updatedRecord.holders.length, 2);
    // Ordenados estritamente pela ordem de conquista
    assert.equal(res2.updatedRecord.holders[0].nick, "MariaPrimeira");
    assert.equal(res2.updatedRecord.holders[1].nick, "JoaoSegundo");

    // 3º jogador também empata com 150 pontos
    const res3 = evaluateStageGameRecordUpdate(res2.updatedRecord, {
      gameId: "cartesiano",
      stage: "etapa_1",
      playerId: "p3",
      nick: "AnaTerceira",
      score: 150,
      achievedAt: 3_000_000, // 3ª a alcançar
    });

    assert.equal(res3.updatedRecord.holders.length, 3);
    assert.equal(res3.updatedRecord.holders[0].nick, "MariaPrimeira");
    assert.equal(res3.updatedRecord.holders[1].nick, "JoaoSegundo");
    assert.equal(res3.updatedRecord.holders[2].nick, "AnaTerceira");
  });

  it("não duplica detentor se a mesma pessoa alcançar a mesma pontuação novamente", () => {
    const record: StageGameRecord = {
      gameId: "rpg",
      stage: "etapa_2",
      score: 200,
      holders: [
        {
          playerId: "p1",
          nick: "GamerPro",
          achievedAt: 1_000_000,
        },
      ],
      updatedAt: 1_000_000,
    };

    const res = evaluateStageGameRecordUpdate(record, {
      gameId: "rpg",
      stage: "etapa_2",
      playerId: "p1",
      nick: "GamerPro",
      score: 200,
      achievedAt: 5_000_000,
    });

    assert.equal(res.updatedRecord.holders.length, 1);
    assert.equal(res.updatedRecord.holders[0].achievedAt, 1_000_000);
  });

  it("não altera o recorde se a pontuação for menor", () => {
    const record: StageGameRecord = {
      gameId: "rpg",
      stage: "etapa_1",
      score: 200,
      holders: [
        {
          playerId: "p1",
          nick: "Campeao",
          achievedAt: 1_000_000,
        },
      ],
      updatedAt: 1_000_000,
    };

    const res = evaluateStageGameRecordUpdate(record, {
      gameId: "rpg",
      stage: "etapa_1",
      playerId: "p2",
      nick: "Desafiante",
      score: 140, // menor que 200
      achievedAt: 2_000_000,
    });

    assert.equal(res.isNewRecord, false);
    assert.equal(res.isTiedRecord, false);
    assert.equal(res.updatedRecord.score, 200);
    assert.equal(res.updatedRecord.holders.length, 1);
    assert.equal(res.updatedRecord.holders[0].nick, "Campeao");
  });

  it("rejeita e sanitiza recordes de Lógica Matemática acima de 480 pontos", () => {
    const existing: StageGameRecord = {
      gameId: "logica",
      stage: "etapa_2",
      score: 410,
      holders: [{ playerId: "p1", nick: "Legitimo", achievedAt: 1_000_000 }],
      updatedAt: 1_000_000,
    };

    const rejected = evaluateStageGameRecordUpdate(existing, {
      gameId: "logica",
      stage: "etapa_2",
      playerId: "p2",
      nick: "Anomalo",
      score: 485,
      achievedAt: 2_000_000,
    });
    assert.equal(rejected.isNewRecord, false);
    assert.equal(rejected.updatedRecord.score, 410);

    const accepted = evaluateStageGameRecordUpdate(existing, {
      gameId: "logica",
      stage: "etapa_2",
      playerId: "p3",
      nick: "Permitido",
      score: 480,
      achievedAt: 2_000_000,
    });
    assert.equal(accepted.isNewRecord, true);
    assert.equal(accepted.updatedRecord.score, 480);
  });

  it("formata a data brasileira de conquista de recorde", () => {
    const d = new Date("2026-11-04T12:00:00Z");
    const formatted = formatRecordDateBR(d.getTime());
    assert.match(formatted, /\d{2}\/\d{2}\/2026/);
  });
});
