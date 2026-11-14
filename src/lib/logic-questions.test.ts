import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateQuestion,
  generateBalanced,
  getOpsForLevel,
} from "./logic-questions.ts";

describe("Lógica Matemática — Escalonamento Progressivo de Operações (logic-questions)", () => {
  it("libera apenas adição e subtração no nível 1, sem multiplicação ou divisão", () => {
    assert.deepEqual(getOpsForLevel(1), ["add", "sub"]);
    for (let i = 0; i < 60; i++) {
      const q = generateQuestion(1, []);
      assert.equal(q.text.includes("×"), false, `Nível 1 não deve conter × (${q.text})`);
      assert.equal(q.text.includes("÷"), false, `Nível 1 não deve conter ÷ (${q.text})`);
    }
  });

  it("inclui multiplicação no nível 2, mas ainda sem divisão", () => {
    const ops2 = getOpsForLevel(2);
    assert.equal(ops2.includes("mul"), true);
    assert.equal(ops2.includes("div"), false);

    let sawMul = false;
    for (let i = 0; i < 80; i++) {
      const q = generateQuestion(2, []);
      assert.equal(q.text.includes("÷"), false, `Nível 2 não deve conter ÷ (${q.text})`);
      if (q.text.includes("×")) sawMul = true;
    }
    assert.equal(sawMul, true, "Nível 2 deve gerar questões com multiplicação (×)");
  });

  it("inclui todas as 4 operações no nível 3 (incluindo divisão)", () => {
    const ops3 = getOpsForLevel(3);
    assert.equal(ops3.includes("add"), true);
    assert.equal(ops3.includes("sub"), true);
    assert.equal(ops3.includes("mul"), true);
    assert.equal(ops3.includes("div"), true);

    let sawDiv = false;
    let sawMul = false;
    for (let i = 0; i < 120; i++) {
      const q = generateQuestion(3, []);
      if (q.text.includes("÷")) sawDiv = true;
      if (q.text.includes("×")) sawMul = true;
    }
    assert.equal(sawMul, true, "Nível 3 deve gerar questões com multiplicação (×)");
    assert.equal(sawDiv, true, "Nível 3 deve gerar questões com divisão (÷)");
  });

  it("prioriza multiplicação e divisão no nível 4 mantendo todas as operações", () => {
    const ops4 = getOpsForLevel(4);
    assert.equal(ops4.filter((o) => o === "mul" || o === "div").length > ops4.filter((o) => o === "add" || o === "sub").length, true);

    let sawMul = false;
    let sawDiv = false;
    for (let i = 0; i < 100; i++) {
      const q = generateBalanced(4, [], []);
      if (q.text.includes("×")) sawMul = true;
      if (q.text.includes("÷")) sawDiv = true;
    }
    assert.equal(sawMul, true, "Nível 4 deve gerar questões com ×");
    assert.equal(sawDiv, true, "Nível 4 deve gerar questões com ÷");
  });
});
