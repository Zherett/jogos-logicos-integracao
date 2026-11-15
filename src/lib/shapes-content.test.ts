import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateQuestion, type ColorName, type Piece } from "./shapes-content.ts";

describe("Formas e Cores — Nível 2 separação dupla", () => {
  it("gera questões mode 4 no nível 2 com duas cores distintas e varia a cada conclusão", () => {
    let prevPair: [ColorName, ColorName] | undefined;
    const seenPairs = new Set<string>();

    for (let i = 0; i < 15; i++) {
      const q = generateQuestion(2, i, 4, prevPair);
      assert.equal(q.mode, 4);
      if (q.mode === 4) {
        assert.notEqual(q.leftColor, q.rightColor);
        if (prevPair) {
          assert.ok(q.leftColor !== prevPair[0] && q.leftColor !== prevPair[1]);
          assert.ok(q.rightColor !== prevPair[0] && q.rightColor !== prevPair[1]);
        }
        assert.ok(q.pieces.length >= 6);
        assert.ok(q.pieces.some((it: Piece) => it.color === q.leftColor));
        assert.ok(q.pieces.some((it: Piece) => it.color === q.rightColor));
        assert.ok(q.leftTargetIds.length > 0);
        assert.ok(q.rightTargetIds.length > 0);

        seenPairs.add(`${q.leftColor}-${q.rightColor}`);
        prevPair = [q.leftColor, q.rightColor];
      }
    }

    assert.ok(seenPairs.size > 1, "as cores exibidas devem variar entre rodadas");
  });
});
