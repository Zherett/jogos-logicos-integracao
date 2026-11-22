import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consumeAndOpenChest,
  DEFAULT_CHESTS,
  mergeWithDefaultChests,
  openChest,
  type ChestDefinition,
} from "./chests-catalog.ts";

describe("Catálogo e Abertura de Baús", () => {
  it("mescla os baús padrão com baús customizados pelo ADM", () => {
    const custom: ChestDefinition = {
      id: "chest_custom_1",
      name: "Baú de Olimpíada",
      description: "Teste",
      rarity: "rara",
      enabled: true,
      rewards: { points: { min: 50, max: 50 } },
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    };
    const merged = mergeWithDefaultChests([custom]);
    assert.equal(merged.length, DEFAULT_CHESTS.length + 1);
    assert.ok(merged.some((c) => c.id === "chest_custom_1"));
  });

  it("sorteia recompensas dentro das faixas configuradas e respeita chance de pacote", () => {
    const chest: ChestDefinition = {
      id: "test_chest",
      name: "Baú Teste",
      description: "Teste",
      rarity: "epica",
      enabled: true,
      rewards: {
        points: { min: 10, max: 20 },
        xp: { min: 30, max: 40 },
        coins: { min: 5, max: 15 },
        cardPacks: [{ packId: "pack_basico", quantity: 2, chancePercent: 50 }],
      },
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    };

    const lowRoll = openChest(chest, () => 0); // 0% -> min range + ganha pacote (< 50)
    assert.equal(lowRoll.points, 10);
    assert.equal(lowRoll.xp, 30);
    assert.equal(lowRoll.coins, 5);
    assert.deepEqual(lowRoll.packs, [{ packId: "pack_basico", quantity: 2 }]);

    const highRoll = openChest(chest, () => 0.99); // 99% -> max range + não ganha pacote (>= 50)
    assert.equal(highRoll.points, 20);
    assert.equal(highRoll.xp, 40);
    assert.equal(highRoll.coins, 15);
    assert.deepEqual(highRoll.packs, []);
  });

  it("consome 1 unidade do baú ao abrir e bloqueia quando quantidade é zero", () => {
    const chest = DEFAULT_CHESTS[0];
    const failRes = consumeAndOpenChest(chest, {});
    assert.equal(failRes.ok, false);

    const okRes = consumeAndOpenChest(chest, { [chest.id]: 2 }, () => 0.1);
    assert.equal(okRes.ok, true);
    assert.equal(okRes.updatedUnopenedChests[chest.id], 1);

    const lastRes = consumeAndOpenChest(chest, okRes.updatedUnopenedChests, () => 0.1);
    assert.equal(lastRes.ok, true);
    assert.equal(lastRes.updatedUnopenedChests[chest.id], undefined);
  });

  it("permite múltiplas entradas de pacotes no mesmo baú (inclusive mesmo pacote com quantidades e chances diferentes)", () => {
    const chest = {
      ...DEFAULT_CHESTS[0],
      rewards: {
        cardPacks: [
          { packId: "pack_iniciante", quantity: 1, chancePercent: 100 },
          { packId: "pack_iniciante", quantity: 2, chancePercent: 25 },
          { packId: "pack_explorador", quantity: 1, chancePercent: 25 },
        ],
      },
    };

    const onlyGuaranteed = openChest(chest, () => 0.5); // 50 >= 25 -> só o de 100%
    assert.deepEqual(onlyGuaranteed.packs, [{ packId: "pack_iniciante", quantity: 1 }]);

    const luckyRoll = openChest(chest, () => 0.1); // 10 < 25 -> ganha todos!
    assert.deepEqual(luckyRoll.packs, [
      { packId: "pack_iniciante", quantity: 1 },
      { packId: "pack_iniciante", quantity: 2 },
      { packId: "pack_explorador", quantity: 1 },
    ]);
  });
});
