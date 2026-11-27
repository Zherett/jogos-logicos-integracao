import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DUNGEON_BIOMES,
  DUNGEON_CARD_SKILLS,
  DUNGEON_CARD_SKILL_LIST,
  DUNGEON_CRAFT_RECIPES,
  DUNGEON_FALLBACK_TEST_CARDS,
  DUNGEON_MAX_FLOOR,
  DUNGEON_MONSTERS,
  DUNGEON_PORTALS,
  getBiomeForFloor,
} from "./dungeon-config.ts";

describe("Configuração da Masmorra Lógica (dungeon-config)", () => {
  it("resolve biomas corretamente para andares válidos e aplica clamp nos extremos", () => {
    assert.equal(DUNGEON_BIOMES.length, 3);
    assert.equal(getBiomeForFloor(0).id, "crypt");
    assert.equal(getBiomeForFloor(1).id, "crypt");
    assert.equal(getBiomeForFloor(5).id, "crypt");
    assert.equal(getBiomeForFloor(6).id, "forge");
    assert.equal(getBiomeForFloor(10).id, "forge");
    assert.equal(getBiomeForFloor(11).id, "observatory");
    assert.equal(getBiomeForFloor(DUNGEON_MAX_FLOOR).id, "observatory");
    assert.equal(getBiomeForFloor(99).id, "observatory");
  });

  it("mantém portais, monstros, habilidades, receitas e cartas fallback íntegros", () => {
    const biomeIds = new Set(DUNGEON_BIOMES.map((b) => b.id));
    assert.equal(DUNGEON_PORTALS.length, 3);
    for (const p of DUNGEON_PORTALS) {
      assert.ok(biomeIds.has(p.biomeId));
      assert.ok(p.startFloor >= 1 && p.startFloor <= DUNGEON_MAX_FLOOR);
    }

    assert.ok(DUNGEON_MONSTERS.length >= 9);
    assert.equal(new Set(DUNGEON_MONSTERS.map((m) => m.id)).size, DUNGEON_MONSTERS.length);
    for (const m of DUNGEON_MONSTERS) {
      assert.ok(biomeIds.has(m.biomeId));
      assert.ok(m.hitsRequired >= 1);
    }

    assert.equal(DUNGEON_CARD_SKILL_LIST.length, Object.keys(DUNGEON_CARD_SKILLS).length);
    assert.ok(DUNGEON_CRAFT_RECIPES.length > 0);
    for (const recipe of DUNGEON_CRAFT_RECIPES) {
      assert.ok(recipe.quantity >= 1);
      assert.ok(Object.keys(recipe.cost).length >= 1);
    }

    assert.equal(DUNGEON_FALLBACK_TEST_CARDS.length, 5);
    assert.equal(
      new Set(DUNGEON_FALLBACK_TEST_CARDS.map((c) => c.id)).size,
      DUNGEON_FALLBACK_TEST_CARDS.length,
    );
  });
});
