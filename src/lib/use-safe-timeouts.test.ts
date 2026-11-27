import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTimeoutRegistry } from "./use-safe-timeouts.ts";

describe("use-safe-timeouts — createTimeoutRegistry", () => {
  it("executa callbacks normalmente e remove o ID do conjunto ativo após o disparo", () => {
    const callbacks = new Map<number, () => void>();
    let nextId = 1;
    const reg = createTimeoutRegistry(
      (fn) => {
        const id = nextId++;
        callbacks.set(id, fn);
        return id;
      },
      (id) => {
        callbacks.delete(id);
      },
    );

    let count = 0;
    reg.schedule(() => {
      count += 1;
    }, 500);
    assert.equal(reg.size(), 1);

    const fn = callbacks.get(1);
    assert.ok(fn);
    fn();
    assert.equal(count, 1);
    assert.equal(reg.size(), 0);
  });

  it("cancela todos os timeouts pendentes ao chamar clearAll()", () => {
    const cleared: number[] = [];
    const callbacks = new Map<number, () => void>();
    let nextId = 10;
    const reg = createTimeoutRegistry(
      (fn) => {
        const id = nextId++;
        callbacks.set(id, fn);
        return id;
      },
      (id) => {
        cleared.push(id);
        callbacks.delete(id);
      },
    );

    let fired = 0;
    reg.schedule(() => {
      fired += 1;
    }, 100);
    reg.schedule(() => {
      fired += 1;
    }, 200);
    reg.schedule(() => {
      fired += 1;
    }, 300);

    assert.equal(reg.size(), 3);
    reg.clearAll();
    assert.equal(reg.size(), 0);
    assert.deepEqual(cleared, [10, 11, 12]);
    assert.equal(callbacks.size, 0);
    assert.equal(fired, 0);
  });
});
