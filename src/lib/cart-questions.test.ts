import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateCartQuestion } from "./cart-questions.ts";

describe("Gerador de questões do Plano Cartesiano (cart-questions)", () => {
  it("nível 1 gera modo findLetter com 4 pontos únicos e alternativa correta correspondente", () => {
    for (let i = 0; i < 20; i++) {
      const q = generateCartQuestion(1);
      assert.equal(q.mode, "findLetter");
      assert.equal(q.points.length, 4);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.points.map((p) => `${p.x},${p.y}`)).size, 4);
      assert.equal(q.options[q.correctIndex], q.targetLabel);
      assert.ok(q.points.some((p) => p.label === q.targetLabel));
    }
  });

  it("nível 2 gera modo findPosition com 4 pontos e 4 opções de coordenadas distintas", () => {
    for (let i = 0; i < 20; i++) {
      const q = generateCartQuestion(2);
      assert.equal(q.mode, "findPosition");
      assert.equal(q.points.length, 4);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      const target = q.points.find((p) => p.label === q.targetLabel);
      assert.ok(target);
      assert.equal(q.options[q.correctIndex], `(${target.x}, ${target.y})`);
      for (const p of q.points) {
        assert.ok(p.x >= -8 && p.x <= 8 && p.y >= -8 && p.y <= 8);
      }
    }
  });

  it("nível 3+ gera 6 pontos únicos e respeita o range customizado", () => {
    for (let i = 0; i < 20; i++) {
      const q = generateCartQuestion(3, 5);
      assert.equal(q.mode, "findPosition");
      assert.equal(q.points.length, 6);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(new Set(q.points.map((p) => `${p.x},${p.y}`)).size, 6);
      const target = q.points.find((p) => p.label === q.targetLabel);
      assert.ok(target);
      assert.equal(q.options[q.correctIndex], `(${target.x}, ${target.y})`);
      for (const p of q.points) {
        assert.ok(p.x >= -5 && p.x <= 5 && p.y >= -5 && p.y <= 5);
      }
    }
  });
});
