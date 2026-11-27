import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeQuestion, type MixedBuildQuestion } from "./percent-content.ts";
import { generateDeterministicQuestionList } from "./x1-challenge.ts";

describe("Desafio das Partes — Nível 4 misto (barras + pizzas)", () => {
  it("gera questões mixed-build alternando layouts e pizzas de 4, 5 e 10 partes", () => {
    const mixed: MixedBuildQuestion[] = [];
    for (let i = 0; i < 30; i++) {
      const q = makeQuestion(4);
      if (q.kind === "mixed-build") mixed.push(q);
    }
    assert.ok(mixed.length >= 6);

    const layouts = new Set(mixed.map((m) => `${m.bars.length}b-${m.pizzas.length}p`));
    assert.ok(layouts.has("1b-1p"));
    assert.ok(layouts.has("2b-1p"));
    assert.ok(layouts.has("1b-2p"));

    const parts = new Set(mixed.flatMap((m) => m.pizzas.map((p) => p.parts)));
    assert.ok(parts.has(4));
    assert.ok(parts.has(5));
    assert.ok(parts.has(10));
  });

  it("Onda 0 (GAME-03): todas as questões word e X1 de porcentagem geram gabaritos inteiros matematicamente exatos", () => {
    let checkedWords = 0;
    for (let i = 0; i < 1000; i++) {
      const q = makeQuestion(4);
      if (q.kind === "word" && q.highlight) {
        const match = q.highlight.match(/^(\d+)% de (?:R\$ )?(\d+)/);
        if (match) {
          const pct = Number(match[1]);
          const total = Number(match[2]);
          assert.equal((pct * total) % 100, 0, `Porcentagem inexata gerada: ${q.highlight}`);
          assert.equal(Number(q.answer), (pct * total) / 100);
          checkedWords++;
        }
      }
    }
    assert.ok(checkedWords >= 50);

    for (let seed = 1; seed <= 40; seed++) {
      const list = generateDeterministicQuestionList(seed * 97, "porcentagem");
      for (const item of list) {
        const expr = item.expr ?? "";
        const match = expr.match(/^(\d+)% de (\d+)$/);
        assert.ok(match);
        const pct = Number(match![1]);
        const total = Number(match![2]);
        assert.equal((pct * total) % 100, 0, `X1 porcentagem inexata: ${expr}`);
        assert.equal(Number(item.answer), (pct * total) / 100);
      }
    }
  });
});
