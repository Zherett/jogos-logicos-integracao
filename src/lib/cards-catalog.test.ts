import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_PACK_COLOR_META,
  CARD_PACK_ICONS,
  CARD_RARITIES,
  CARD_RARITY_META,
  consumeAndOpenCardPack,
  createCardBatch,
  createCardDefinition,
  DEFAULT_CARD_FOIL_CHANCE_PERCENT,
  DEFAULT_CARD_PACKS,
  editCardDefinition,
  generateMissingFoilDuplicates,
  mergeWithDefaultCardPacks,
  openCardPack,
  orderPackRevealCards,
  resolveCardBgClass,
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
    assert.match(CARD_RARITY_META.rara.borderClass, /yellow/);
    assert.match(CARD_RARITY_META.rara.cardBgClass, /yellow/);
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

  it("aplica 3 variações de degradê para raridades coloridas e persiste na criação/edição", () => {
    const v1 = resolveCardBgClass("rara", 1);
    const v2 = resolveCardBgClass("rara", 2);
    const v3 = resolveCardBgClass("rara", 3);
    assert.ok(v1.includes("bg-gradient-to-br"));
    assert.notEqual(v1, v2);
    assert.notEqual(v2, v3);

    const created = createCardDefinition({
      name: "Dragão Azul",
      description: "Degradê oceânico",
      rarity: "rara",
      imageUrl: "https://example.com/dragao.png",
      colorVariant: 2,
    });
    assert.ok(created.card);
    assert.equal(created.card.colorVariant, 2);

    const edited = editCardDefinition(created.card, { colorVariant: 3 });
    assert.ok(edited.card);
    assert.equal(edited.card.colorVariant, 3);
  });

  it("cria par Normal + Foil com IDs distintos e duplica cartas existentes sem duplicar repetidamente", () => {
    const pair = createCardBatch({
      name: "Fênix Solar",
      description: "Renascida das chamas",
      rarity: "epica",
      imageUrl: "https://example.com/fenix.png",
      colorVariant: 2,
      createNormal: true,
      createFoil: true,
    });
    assert.equal(pair.cards.length, 2);
    assert.notEqual(pair.cards[0].id, pair.cards[1].id);
    assert.equal(pair.cards[0].isFoil, false);
    assert.equal(pair.cards[1].isFoil, true);
    assert.equal(pair.cards[0].colorVariant, 2);
    assert.equal(pair.cards[1].colorVariant, 2);

    const onlyFoil = createCardBatch({
      name: "Somente Foil",
      description: "Exclusiva",
      rarity: "lendaria",
      imageUrl: "https://example.com/foil.png",
      createNormal: false,
      createFoil: true,
    });
    assert.equal(onlyFoil.cards.length, 1);
    assert.equal(onlyFoil.cards[0].isFoil, true);

    const baseNormal = createCardDefinition({
      name: "Carta Legada",
      description: "Sem foil ainda",
      rarity: "comum",
      imageUrl: "https://example.com/legada.png",
    }).card!;

    const firstSeed = generateMissingFoilDuplicates([baseNormal]);
    assert.equal(firstSeed.addedCount, 1);
    assert.equal(firstSeed.updatedCatalog.length, 2);
    assert.ok(firstSeed.updatedCatalog.some((c) => c.isFoil && c.name === "Carta Legada"));

    // Idempotente na segunda chamada
    const secondSeed = generateMissingFoilDuplicates(firstSeed.updatedCatalog);
    assert.equal(secondSeed.addedCount, 0);
    assert.equal(secondSeed.updatedCatalog.length, 2);

    // Também cria versão Normal (sem Foil) quando a carta existente é Foil
    const baseFoil = createCardDefinition({
      name: "Carta Foil Legada",
      description: "Sem versão normal ainda",
      rarity: "ouro" as any,
      imageUrl: "https://example.com/foil-legada.png",
      isFoil: true,
    });
    const foilCard = createCardDefinition({
      name: "Carta Foil Legada",
      description: "Sem versão normal ainda",
      rarity: "rara",
      imageUrl: "https://example.com/foil-legada.png",
      isFoil: true,
    }).card!;
    assert.equal(baseFoil.card?.isFoil, true);
    const reverseSeed = generateMissingFoilDuplicates([foilCard]);
    assert.equal(reverseSeed.addedCount, 1);
    assert.equal(reverseSeed.updatedCatalog.length, 2);
    assert.ok(reverseSeed.updatedCatalog.some((c) => !c.isFoil && c.name === "Carta Foil Legada"));
  });

  it("sorteia cartas com chance padrão de 30% Foil e 70% Normal (e aceita override de evento)", () => {
    assert.equal(DEFAULT_CARD_FOIL_CHANCE_PERCENT, 30);

    const turingPair = createCardBatch({
      name: "Alan Turing",
      description: "Pai da computação",
      rarity: "lendaria",
      imageUrl: "https://example.com/turing.png",
      createNormal: true,
      createFoil: true,
    }).cards;

    const pack = {
      ...DEFAULT_CARD_PACKS[0],
      cardsPerPack: 1,
      probabilities: { comum: 0, incomum: 0, rara: 0, epica: 0, lendaria: 100 },
    };

    // rng fixo em 0.25 -> 25 < 30 => Foil
    const foilDraw = openCardPack(pack, turingPair, {}, () => 0.25);
    assert.equal(foilDraw.drawnCards.length, 1);
    assert.equal(foilDraw.drawnCards[0].isFoil, true);

    // rng fixo em 0.35 -> 35 >= 30 => Normal
    const normalDraw = openCardPack(pack, turingPair, {}, () => 0.35);
    assert.equal(normalDraw.drawnCards.length, 1);
    assert.equal(normalDraw.drawnCards[0].isFoil, false);

    // Override de evento aumentando chance Foil para 80%: rng 0.50 -> 50 < 80 => Foil
    const eventDraw = openCardPack(pack, turingPair, {}, () => 0.50, 80);
    assert.equal(eventDraw.drawnCards.length, 1);
    assert.equal(eventDraw.drawnCards[0].isFoil, true);
  });
});
