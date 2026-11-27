import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consumeAndOpenChest,
  consumeAndOpenChestsBatch,
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

  it("abre vários baús em lote atomicamente somando bônus, agrupando pacotes e preservando duplicatas de cosméticos para compensação", () => {
    const chest = {
      ...DEFAULT_CHESTS[0],
      rewards: {
        points: { min: 10, max: 10 },
        xp: { min: 25, max: 25 },
        coins: { min: 5, max: 5 },
        cardPacks: [{ packId: "pack_iniciante", quantity: 2, chancePercent: 100 }],
        cosmetics: [{ kind: "aura" as const, itemId: "aura_gold", chancePercent: 100 }],
      },
    };

    const res = consumeAndOpenChestsBatch(chest, 4, { [chest.id]: 4 }, () => 0.1);
    assert.equal(res.ok, true);
    assert.equal(res.openedCount, 4);
    assert.equal(res.updatedUnopenedChests[chest.id], undefined);
    assert.equal(res.outcome?.points, 40);
    assert.equal(res.outcome?.xp, 100);
    assert.equal(res.outcome?.coins, 20);
    assert.deepEqual(res.outcome?.packs, [{ packId: "pack_iniciante", quantity: 8 }]);
    // Todas as 4 ocorrências sorteadas são mantidas para compensação em moedas das 3 duplicatas
    assert.equal(res.outcome?.cosmetics.length, 4);
    assert.deepEqual(res.outcome?.cosmetics[0], { kind: "aura", itemId: "aura_gold" });
  });

  it("Onda 0 (ECON-05): nunca retorna NaN ou acima de max em rollRange com limites inválidos ou rng() === 1", () => {
    const brokenChest = {
      ...DEFAULT_CHESTS[0],
      rewards: {
        points: { min: Number.NaN, max: 100 },
        xp: { min: 10, max: Number.POSITIVE_INFINITY },
        coins: { min: 5, max: 15 },
        cosmetics: [{ kind: "aura" as const, itemId: "aura_gold", chancePercent: Number.NaN }],
      },
    };

    const out = openChest(brokenChest, () => 1);
    assert.equal(Number.isFinite(out.points), true);
    assert.equal(out.points, 0);
    assert.equal(Number.isFinite(out.xp), true);
    assert.equal(out.xp, 0);
    assert.equal(out.coins, 15);
    assert.deepEqual(out.cosmetics, []);
  });

  it("Bloco 1.3 (ECON-24): mergeWithDefaultChests preserva rewards padrão quando override contém undefined", () => {
    const def0 = DEFAULT_CHESTS[0];
    const merged = mergeWithDefaultChests([
      {
        ...def0,
        name: "Baú Atualizado",
        rewards: {
          points: { min: 77, max: 77 },
          xp: undefined as any,
          coins: undefined as any,
          cardPacks: undefined as any,
        },
      },
    ]);
    const updated = merged.find((c) => c.id === def0.id)!;
    assert.equal(updated.name, "Baú Atualizado");
    assert.deepEqual(updated.rewards.points, { min: 77, max: 77 });
    assert.deepEqual(updated.rewards.xp, def0.rewards.xp);
    assert.deepEqual(updated.rewards.coins, def0.rewards.coins);
  });
});
