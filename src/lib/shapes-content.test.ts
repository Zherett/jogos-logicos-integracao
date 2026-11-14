import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateQuestion, type Piece } from "./shapes-content.ts";

describe("Formas e Cores — Nível 2 separação dupla", () => {
  it("gera questões mode 4 no nível 2 com azul à esquerda e amarelo à direita", () => {
    for (let i = 0; i < 15; i++) {
      const q = generateQuestion(2, i);
      assert.equal(q.mode, 4);
      if (q.mode === 4) {
        assert.equal(q.leftColor, "azul");
        assert.equal(q.rightColor, "amarelo");
        assert.ok(q.pieces.length >= 6);
        assert.ok(q.pieces.some((it: Piece) => it.color === "azul"));
        assert.ok(q.pieces.some((it: Piece) => it.color === "amarelo"));
        assert.ok(q.leftTargetIds.length > 0);
        assert.ok(q.rightTargetIds.length > 0);
      }
    }
  });
});
