import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeQuestion, type MixedBuildQuestion } from "./percent-content.ts";

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
});
