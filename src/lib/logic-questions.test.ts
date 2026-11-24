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

  it("gera respostas V/F com aleatoriedade real 50/50 sem padrão previsível após V,V,V ou V,V,V,F,F,F", () => {
    const sampleSize = 400;

    // 1. Mesmo passando histórico [V, V, V], não deve forçar F (deve ficar próximo de 50/50)
    let truesAfterThreeTrues = 0;
    for (let i = 0; i < sampleSize; i++) {
      const q = generateBalanced(2, [], [true, true, true]);
      if (q.answer) truesAfterThreeTrues++;
    }
    assert.ok(
      truesAfterThreeTrues >= sampleSize * 0.35 && truesAfterThreeTrues <= sampleSize * 0.65,
      `Esperado ~50% de Verdadeiras após [V,V,V], obtido ${truesAfterThreeTrues}/${sampleSize}`,
    );

    // 2. Mesmo passando histórico [V, V, V, F, F, F], não deve forçar F (quebra o ciclo de período 7)
    let truesAfterTie = 0;
    for (let i = 0; i < sampleSize; i++) {
      const q = generateBalanced(4, [], [true, true, true, false, false, false]);
      if (q.answer) truesAfterTie++;
    }
    assert.ok(
      truesAfterTie >= sampleSize * 0.35 && truesAfterTie <= sampleSize * 0.65,
      `Esperado ~50% de Verdadeiras após [V,V,V,F,F,F], obtido ${truesAfterTie}/${sampleSize}`,
    );

    // 3. Simulação contínua de 500 questões: a regra antiga (trues < len/2) não deve prever acima do acaso
    const history: boolean[] = [];
    const texts: string[] = [];
    let oldRuleHits = 0;
    let evaluated = 0;
    for (let i = 0; i < 500; i++) {
      const last = history.slice(-6);
      const q = generateBalanced((i % 4) + 1, texts, history);
      if (last.length >= 3) {
        const predictedByOldBug = last.filter(Boolean).length < last.length / 2;
        if (q.answer === predictedByOldBug) oldRuleHits++;
        evaluated++;
      }
      texts.push(q.text);
      if (texts.length > 15) texts.shift();
      history.push(q.answer);
      if (history.length > 15) history.shift();
    }
    const oldRuleRate = oldRuleHits / evaluated;
    assert.ok(
      oldRuleRate >= 0.38 && oldRuleRate <= 0.62,
      `Taxa de previsão do padrão antigo deveria ser ~50% (acaso), mas foi ${(oldRuleRate * 100).toFixed(1)}%`,
    );
  });
});
