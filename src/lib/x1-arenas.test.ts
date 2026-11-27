import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { X1_ARENA_THEMES, getX1ArenaTheme } from "./x1-arenas.ts";

describe("Temas determinísticos da Arena X1 (x1-arenas)", () => {
  it("contém catálogo válido com 5 temas distintos", () => {
    assert.equal(X1_ARENA_THEMES.length, 5);
    assert.equal(new Set(X1_ARENA_THEMES.map((t) => t.id)).size, 5);
    for (const theme of X1_ARENA_THEMES) {
      assert.ok(theme.name.length > 0);
      assert.ok(theme.sparkColorHex.startsWith("#"));
    }
  });

  it("seleciona o mesmo tema para a mesma seed e trata valores negativos ou NaN com segurança", () => {
    const a = getX1ArenaTheme(42);
    const b = getX1ArenaTheme(42);
    assert.equal(a.id, b.id);

    const neg = getX1ArenaTheme(-7);
    assert.equal(neg.id, getX1ArenaTheme(7).id);

    const nanTheme = getX1ArenaTheme(Number.NaN);
    assert.equal(nanTheme.id, X1_ARENA_THEMES[0].id);
  });
});
