import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_PACK_COLOR_META,
  CARD_PACK_ICONS,
  CARD_RARITIES,
  CARD_RARITY_META,
  consumeAndOpenCardPack,
  createCardDefinition,
  DEFAULT_CARD_PACKS,
  editCardDefinition,
  mergeWithDefaultCardPacks,
  openCardPack,
  orderPackRevealCards,
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

  it("define as cores de borda e fundo interno corretas para cada raridade", () => {
    assert.equal(CARD_RARITIES.length, 5);
    assert.match(CARD_RARITY_META.incomum.borderClass, /emerald/);
    assert.match(CARD_RARITY_META.incomum.cardBgClass, /emerald/);
    assert.match(CARD_RARITY_META.rara.borderClass, /blue/);
    assert.match(CARD_RARITY_META.rara.cardBgClass, /blue/);
    assert.match(CARD_RARITY_META.epica.borderClass, /purple/);
    assert.match(CARD_RARITY_META.epica.cardBgClass, /purple/);
    assert.match(CARD_RARITY_META.lendaria.borderClass, /red/);
    assert.match(CARD_RARITY_META.lendaria.cardBgClass, /red/);
  });

  it("permite editar nome, descrição, imagem e flag foil mantendo a raridade imutável", () => {
    const created = createCardDefinition({
      name: "Robô Guardião",
      description: "Defensor da lógica",
      rarity: "epica",
      imageUrl: "https://example.com/robo.gif",
      isFoil: true,
    });
    assert.ok(created.card);
    assert.equal(created.card.isFoil, true);

    const edited = editCardDefinition(created.card, {
      name: "Robô Guardião II",
      description: "Nova descrição",
      imageUrl: "https://example.com/robo2.gif",
      isFoil: false,
    });
    assert.ok(edited.card);
    assert.equal(edited.card.name, "Robô Guardião II");
    assert.equal(edited.card.description, "Nova descrição");
    assert.equal(edited.card.imageUrl, "https://example.com/robo2.gif");
    assert.equal(edited.card.isFoil, false);
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

  it("ordena cartas do pacote da menor para a maior raridade por padrão e suporta surpresa", () => {
    const cards: CardDefinition[] = [
      createCardDefinition({ name: "L1", description: "d", rarity: "lendaria", imageUrl: "https://a.com/5.gif" }).card!,
      createCardDefinition({ name: "C1", description: "d", rarity: "comum", imageUrl: "https://a.com/1.png" }).card!,
      createCardDefinition({ name: "R1", description: "d", rarity: "rara", imageUrl: "https://a.com/3.png" }).card!,
      createCardDefinition({ name: "I1", description: "d", rarity: "incomum", imageUrl: "https://a.com/2.png" }).card!,
      createCardDefinition({ name: "E1", description: "d", rarity: "epica", imageUrl: "https://a.com/4.gif" }).card!,
    ];

    // Padrão (sem surpresa): menor raridade primeiro, lendária por último
    const normalOrder = orderPackRevealCards(cards, () => 0.9);
    assert.deepEqual(
      normalOrder.map((c) => c.rarity),
      ["comum", "incomum", "rara", "epica", "lendaria"],
    );

    // Surpresa na frente (roll < 0.04)
    const frontSurprise = orderPackRevealCards(cards, () => 0.01);
    assert.equal(frontSurprise[0].rarity, "lendaria");

    // Surpresa no meio (0.04 <= roll < 0.16)
    const midSurprise = orderPackRevealCards(cards, () => 0.1);
    assert.equal(midSurprise[2].rarity, "lendaria");
  });

  it("consome 1 pacote fechado atomicamente e bloqueia quando não há estoque", () => {
    const card = createCardDefinition({
      name: "C1",
      description: "d",
      rarity: "comum",
      imageUrl: "https://a.com/1.png",
    }).card!;
    const pack = DEFAULT_CARD_PACKS[0];

    const emptyRes = consumeAndOpenCardPack(pack, [card], {}, {});
    assert.equal(emptyRes.drawnCards.length, 0);
    assert.ok(emptyRes.error);

    const okRes = consumeAndOpenCardPack(pack, [card], {}, { [pack.id]: 2 }, () => 0.1);
    assert.equal(okRes.drawnCards.length, 5);
    assert.equal(okRes.updatedUnopenedPacks[pack.id], 1);
    assert.equal(okRes.updatedCardsMap[card.id], 5);

    const lastRes = consumeAndOpenCardPack(pack, [card], okRes.updatedCardsMap, okRes.updatedUnopenedPacks, () => 0.1);
    assert.equal(lastRes.updatedUnopenedPacks[pack.id], undefined);
    assert.equal(lastRes.updatedCardsMap[card.id], 10);

    assert.ok(CARD_PACK_ICONS.length >= 9);
    assert.ok(CARD_PACK_COLOR_META.aurora.gradientClass.includes("bg-gradient-to-b"));
  });
});
