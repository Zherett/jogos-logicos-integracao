import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTheme, getInitialTheme } from "./theme.ts";

describe("Gerenciamento de Tema (theme)", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

  let store: Map<string, string>;
  let classes: Set<string>;
  let dispatchedEvents: Array<{ type: string; detail: unknown }>;
  let prefersLight = false;
  let quotaLimit = Number.POSITIVE_INFINITY;

  beforeEach(() => {
    store = new Map();
    classes = new Set();
    dispatchedEvents = [];
    prefersLight = false;
    quotaLimit = Number.POSITIVE_INFINITY;

    const fakeStorage = {
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
        if (total > quotaLimit) {
          throw new Error("QuotaExceededError");
        }
        store.set(k, v);
      },
    };

    class FakeCustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }

    (globalThis as { CustomEvent: unknown }).CustomEvent = FakeCustomEvent;
    (globalThis as { localStorage: unknown }).localStorage = fakeStorage;
    (globalThis as { document: unknown }).document = {
      documentElement: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      },
    };
    (globalThis as { window: unknown }).window = {
      localStorage: fakeStorage,
      matchMedia: (q: string) => ({ matches: q.includes("light") && prefersLight }),
      dispatchEvent: (ev: { type: string; detail?: unknown }) => {
        dispatchedEvents.push({ type: ev.type, detail: ev.detail });
        return true;
      },
    };
  });

  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
    if (originalDocument === undefined) delete g.document;
    else g.document = originalDocument;
    if (originalLocalStorage === undefined) delete g.localStorage;
    else g.localStorage = originalLocalStorage;
    if (originalCustomEvent === undefined) delete g.CustomEvent;
    else g.CustomEvent = originalCustomEvent;
  });

  it("respeita preferência salva e fallback de prefers-color-scheme em getInitialTheme", () => {
    assert.equal(getInitialTheme(), "dark");
    prefersLight = true;
    assert.equal(getInitialTheme(), "light");
    store.set("desafios-theme-v1", "dark");
    assert.equal(getInitialTheme(), "dark");
  });

  it("aplica classe CSS e dispara desafios:theme-changed exatamente uma vez por chamada", () => {
    applyTheme("dark");
    assert.equal(classes.has("dark"), true);
    assert.equal(store.get("desafios-theme-v1"), "dark");
    assert.deepEqual(dispatchedEvents, [{ type: "desafios:theme-changed", detail: "dark" }]);

    applyTheme("light");
    assert.equal(classes.has("dark"), false);
    assert.equal(store.get("desafios-theme-v1"), "light");
    assert.equal(dispatchedEvents.length, 2);
    assert.deepEqual(dispatchedEvents[1], { type: "desafios:theme-changed", detail: "light" });

    applyTheme("dark", { emitEvent: false });
    assert.equal(classes.has("dark"), true);
    assert.equal(dispatchedEvents.length, 2);
  });

  it("recupera de QuotaExceededError ao persistir tema usando safeLocalStorageSet", () => {
    store.set("desafios-remote-admin-config-v1", "x".repeat(400));
    quotaLimit = 100;

    applyTheme("light");
    assert.equal(store.get("desafios-theme-v1"), "light");
    assert.equal(store.has("desafios-remote-admin-config-v1"), false);
    assert.equal(dispatchedEvents.length, 1);
  });
});
