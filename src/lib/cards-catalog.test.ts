import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_RARITIES,
  CARD_RARITY_META,
  createCardDefinition,
  DEFAULT_CARD_PACKS,
  editCardDefinition,
  mergeWithDefaultCardPacks,
  openCardPack,
  sumPackProbabilities,
  validatePackProbabilities,
  type CardDefinition,
} from "./cards-catalog.ts";

describe("Sistema de Cartas Colecionáveis e Pacotes", () => {
  it("define os 5 pacotes padrão com 5 cartas e soma de probabilidades igual a 100%", () => {
    assert.equal(DEFAULT_CARD_PACKS.length, 5);
    for (const pack of DEFAULT_CARD_PACKS) {
      assert.equal(pack.cardsPerPack, 5);
      const check = validatePackProbabilities(pack.probabilities);
      assert.equal(check.valid, true, `${pack.name} deve somar 100% (atual: ${check.total}%)`);
      assert.equal(sumPackProbabilities(pack.probabilities), 100);
    }
  });

  it("define as cores de borda corretas para cada raridade", () => {
    assert.equal(CARD_RARITIES.length, 5);
    assert.match(CARD_RARITY_META.incomum.borderClass, /emerald/);
    assert.match(CARD_RARITY_META.rara.borderClass, /blue/);
    assert.match(CARD_RARITY_META.epica.borderClass, /purple/);
    assert.match(CARD_RARITY_META.lendaria.borderClass, /red/);
  });

  it("permite editar nome, descrição e imagem mantendo a raridade imutável", () => {
    const created = createCardDefinition({
      name: "Robô Guardião",
      description: "Defensor da lógica",
      rarity: "epica",
      imageUrl: "https://example.com/robo.gif",
    });
    assert.ok(created.card);

    const edited = editCardDefinition(created.card, {
      name: "Robô Guardião II",
      description: "Nova descrição",
      imageUrl: "https://example.com/robo2.gif",
    });
    assert.ok(edited.card);
    assert.equal(edited.card.name, "Robô Guardião II");
    assert.equal(edited.card.description, "Nova descrição");
    assert.equal(edited.card.imageUrl, "https://example.com/robo2.gif");
    assert.equal(edited.card.rarity, "epica");
  });

  it("bloqueia URLs inseguras ao criar ou editar carta", () => {
    const bad = createCardDefinition({
      name: "Carta XSS",
      description: "Teste",
      rarity: "comum",
      imageUrl: "javascript:alert(1)",
    });
    assert.equal(bad.card, null);
    assert.ok(bad.error);
  });

  it("abre pacote sorteando 5 cartas e acumulando quantidades repetidas", () => {
    const cards: CardDefinition[] = [
      createCardDefinition({ name: "C1", description: "d", rarity: "comum", imageUrl: "https://a.com/1.png" }).card!,
      createCardDefinition({ name: "I1", description: "d", rarity: "incomum", imageUrl: "https://a.com/2.png" }).card!,
      createCardDefinition({ name: "R1", description: "d", rarity: "rara", imageUrl: "https://a.com/3.png" }).card!,
      createCardDefinition({ name: "E1", description: "d", rarity: "epica", imageUrl: "https://a.com/4.gif" }).card!,
      createCardDefinition({ name: "L1", description: "d", rarity: "lendaria", imageUrl: "https://a.com/5.gif" }).card!,
    ];

    const pack = DEFAULT_CARD_PACKS[0];
    const firstOpen = openCardPack(pack, cards, {}, () => 0.1);
    assert.equal(firstOpen.drawnCards.length, 5);
    assert.equal(firstOpen.updatedCardsMap[cards[0].id], 5);
    assert.deepEqual(firstOpen.newlyDiscoveredIds, [cards[0].id]);

    const secondOpen = openCardPack(pack, cards, firstOpen.updatedCardsMap, () => 0.1);
    assert.equal(secondOpen.updatedCardsMap[cards[0].id], 10);
    assert.deepEqual(secondOpen.newlyDiscoveredIds, []);
  });

  it("preserva pacotes padrão ao mesclar com pacotes especiais criados pelo ADM", () => {
    const merged = mergeWithDefaultCardPacks([
      {
        id: "pack_natal",
        name: "Pacote Especial",
        description: "Evento",
        cardsPerPack: 5,
        probabilities: { comum: 20, incomum: 20, rara: 20, epica: 20, lendaria: 20 },
        cardIds: null,
        enabled: true,
        createdAt: "2026-11-18T00:00:00.000Z",
        updatedAt: "2026-11-18T00:00:00.000Z",
      },
    ]);
    assert.equal(merged.length, 6);
  });
});
