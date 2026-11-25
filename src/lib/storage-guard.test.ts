import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { measureLocalStorageUsage, safeLocalStorageSet } from "./storage-guard.ts";

describe("Proteção de cota do localStorage (storage-guard)", () => {
  it("recupera automaticamente de QuotaExceededError removendo caches descartáveis", () => {
    const store = new Map<string, string>([
      ["desafios-remote-admin-config-v1", "x".repeat(500)],
      ["desafios-presence-store-v1", "y".repeat(500)],
      ["desafios-playfab-session-v1", '{"playerId":"aluno1"}'],
    ]);
    const MAX_LEN = 1100;

    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        let total = v.length;
        for (const [ek, ev] of store.entries()) {
          if (ek !== k) total += ev.length;
        }
        if (total > MAX_LEN) {
          throw new Error("QuotaExceededError");
        }
        store.set(k, v);
      },
    };

    const res = safeLocalStorageSet("desafios-logica-admin-config-v1", "z".repeat(400), fakeStorage);
    assert.equal(res.ok, true);
    assert.ok(res.evictedKeys.includes("desafios-remote-admin-config-v1"));
    // Sessão do aluno jamais é removida
    assert.equal(store.get("desafios-playfab-session-v1"), '{"playerId":"aluno1"}');
    assert.equal(store.get("desafios-logica-admin-config-v1"), "z".repeat(400));
  });

  it("calcula uso total e top chaves do armazenamento local", () => {
    const entries: Array<[string, string]> = [
      ["k_small", "abc"],
      ["k_big", "x".repeat(1000)],
    ];
    const fakeStorage = {
      length: entries.length,
      key: (i: number) => entries[i]?.[0] ?? null,
      getItem: (k: string) => entries.find(([ek]) => ek === k)?.[1] ?? null,
    };

    const report = measureLocalStorageUsage(fakeStorage, 5);
    assert.equal(report.totalKeys, 2);
    assert.equal(report.topKeys[0].key, "k_big");
    assert.equal(report.warningLevel, "ok");
  });
});
