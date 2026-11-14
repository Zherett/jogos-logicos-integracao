import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateVariableQuestion,
  checkVariableSlots,
  type VarSlotRole,
  type VarOpSymbol,
} from "./variable-questions.ts";

describe("Caça às Variáveis — múltiplos espaços e operadores", () => {
  it("nível 2 gera espaços de operador ou 2 espaços numéricos e valida corretamente", () => {
    for (let i = 0; i < 20; i++) {
      const q = generateVariableQuestion(2);
      assert.ok(q.slots.length === 1 || q.slots.length === 2);

      const ans: Partial<Record<VarSlotRole, number | VarOpSymbol>> = {};
      for (const role of q.slots) ans[role] = q.expectedBySlot[role];
      assert.equal(checkVariableSlots(q, ans), true);

      const wrong: Partial<Record<VarSlotRole, number | VarOpSymbol>> = {};
      for (const role of q.slots) wrong[role] = role === "op" ? (q.expectedBySlot.op === "+" ? "÷" : "+") : 999;
      assert.equal(checkVariableSlots(q, wrong), false);
    }
  });

  it("nível 3 alterna pares de espaços numéricos entre left, right e result", () => {
    const seenRoles = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = generateVariableQuestion(3);
      assert.equal(q.slots.length, 2);
      seenRoles.add(q.slots.join(","));
      const ans: Partial<Record<VarSlotRole, number | VarOpSymbol>> = {};
      for (const role of q.slots) ans[role] = q.expectedBySlot[role];
      assert.equal(checkVariableSlots(q, ans), true);
    }
    assert.ok(seenRoles.size >= 2);
  });

  it("nível 4 inclui espaço de operador e aceita operador válido", () => {
    let hasOpSlot = false;
    for (let i = 0; i < 30; i++) {
      const q = generateVariableQuestion(4);
      if (q.slots.includes("op")) {
        hasOpSlot = true;
        const ans: Partial<Record<VarSlotRole, number | VarOpSymbol>> = {};
        for (const role of q.slots) ans[role] = q.expectedBySlot[role];
        assert.equal(checkVariableSlots(q, ans), true);
      }
    }
    assert.equal(hasOpSlot, true);
  });
});
