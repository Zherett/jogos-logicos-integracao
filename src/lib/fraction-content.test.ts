import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PARTS,
  FRACTION_LEVEL_LABELS,
  FRACTION_QUESTIONS_PER_LEVEL,
  makeFractionQuestion,
  type FractionLevel,
} from "./fraction-content.ts";

describe("Gerador de questões de Frações (fraction-content)", () => {
  it("expõe metadados consistentes para os 6 níveis", () => {
    assert.deepEqual([...ALL_PARTS], [3, 4, 5, 8, 10]);
    assert.equal(FRACTION_QUESTIONS_PER_LEVEL, 5);
    for (const lv of [1, 2, 3, 4, 5, 6] as const) {
      assert.equal(typeof FRACTION_LEVEL_LABELS[lv], "string");
      assert.ok(FRACTION_LEVEL_LABELS[lv].length > 0);
    }
  });

  it("garante invariantes válidos em frac-build e frac-id em todos os níveis (1..6)", () => {
    const levels: FractionLevel[] = [1, 2, 3, 4, 5, 6];
    let seenBuild = 0;
    let seenId = 0;

    for (const level of levels) {
      for (let i = 0; i < 40; i++) {
        const q = makeFractionQuestion(level);
        assert.ok(q.id > 0);
        assert.ok(q.prompt.length > 0);
        assert.ok(q.tip.length > 0);

        if (q.kind === "frac-build") {
          seenBuild++;
          assert.ok(q.pizzas.length >= 1 && q.pizzas.length <= 3);
          const inKeepMode = q.prompt.startsWith("Mantenha");
          for (const pizza of q.pizzas) {
            assert.ok(ALL_PARTS.includes(pizza.parts as (typeof ALL_PARTS)[number]));
            assert.equal(pizza.initial.length, pizza.parts);
            assert.ok(pizza.target >= 1 && pizza.target <= pizza.parts);
            const startSelected = pizza.initial.filter(Boolean).length;
            if (inKeepMode) {
              assert.notEqual(startSelected, pizza.target);
            } else {
              assert.equal(startSelected, 0);
            }
          }
        } else {
          seenId++;
          assert.ok(q.filled >= 1 && q.filled <= q.parts);
          assert.equal(q.answer, `${q.filled}/${q.parts}`);
          const expectedOptionCount = Math.min(4, q.parts);
          assert.equal(q.options.length, expectedOptionCount);
          assert.equal(new Set(q.options).size, expectedOptionCount);
          assert.ok(q.options.includes(q.answer));
        }
      }
    }

    assert.ok(seenBuild > 0);
    assert.ok(seenId > 0);
  });
});
