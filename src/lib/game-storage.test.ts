import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_GAME_IDS,
  DEFAULT_STATS,
  clearLocalStats,
  loadLastMatch,
  loadStats,
  onMatchSaved,
  saveLastMatch,
  saveStats,
  updateBest,
} from "./game-storage.ts";

describe("Persistência local de estatísticas de jogos (game-storage)", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    onMatchSaved(null);
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  describe("operações padrão com localStorage simulado", () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = new Map();
      (globalThis as { window: unknown }).window = {
        localStorage: {
          get length() {
            return store.size;
          },
          key: (i: number) => Array.from(store.keys())[i] ?? null,
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
        },
      };
    });

    it("salva e atualiza recordes mantendo monotonicidade de bestScore/bestLevel e notificando listener", () => {
      assert.deepEqual(loadStats().logica, DEFAULT_STATS.logica);

      const s1 = updateBest("logica", 250, 3);
      assert.equal(s1.logica.bestScore, 250);
      assert.equal(s1.logica.bestLevel, 3);
      assert.equal(s1.logica.plays, 1);

      const s2 = updateBest("logica", 120, 2);
      assert.equal(s2.logica.bestScore, 250);
      assert.equal(s2.logica.bestLevel, 3);
      assert.equal(s2.logica.plays, 2);

      let notified = false;
      onMatchSaved((id, match) => {
        notified = id === "rpg" && match.score === 400 && match.won === true;
      });
      saveLastMatch("rpg", { score: 400, correct: 8, wrong: 1, level: 4, won: true });
      assert.equal(notified, true);
      assert.equal(loadLastMatch("rpg")?.score, 400);

      clearLocalStats();
      assert.equal(loadStats().logica.bestScore, 0);
      assert.equal(loadLastMatch("rpg"), null);
    });

    it("lida com JSON corrompido retornando DEFAULT_STATS sem lançar exceção", () => {
      store.set("desafios-logica-stats-v1", "{invalid-json");
      const loaded = loadStats();
      assert.equal(Object.keys(loaded).length, ALL_GAME_IDS.length);
      assert.equal(loaded.cartesiano.bestScore, 0);
    });
  });

  it("recupera de QuotaExceededError ao salvar stats e última partida removendo caches descartáveis", () => {
    const store = new Map<string, string>([
      ["desafios-remote-admin-config-v1", "x".repeat(700)],
      ["desafios-presence-store-v1", "y".repeat(700)],
      ["desafios-playfab-session-v1", '{"playerId":"ana"}'],
    ]);
    const MAX_LEN = 1900;

    (globalThis as { window: unknown }).window = {
      localStorage: {
        get length() {
          return store.size;
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
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
      },
    };

    saveStats({ ...DEFAULT_STATS, logica: { bestScore: 999, bestLevel: 5, plays: 10 } });
    saveLastMatch("logica", { score: 999, correct: 10, wrong: 0, level: 5 });

    assert.equal(loadStats().logica.bestScore, 999);
    assert.equal(loadLastMatch("logica")?.score, 999);
    assert.equal(store.get("desafios-playfab-session-v1"), '{"playerId":"ana"}');
    assert.equal(store.has("desafios-remote-admin-config-v1"), false);
  });
});
