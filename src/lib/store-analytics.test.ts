import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CARD_PACKS } from "./cards-catalog.ts";
import { DEFAULT_AURAS, DEFAULT_AVATARS } from "./cosmetics-catalog.ts";
import {
  computeStoreSalesReport,
  filterAndSortStoreReportItems,
  type StoreAnalyticsPlayerSlice,
} from "./store-analytics.ts";

describe("Relatório de Vendas da Loja (store-analytics)", () => {
  it("agrega avatares, auras e pacotes de múltiplos alunos com totais e compradores", () => {
    const avatar1 = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const aura1 = DEFAULT_AURAS.find((a) => a.id === "aura_azul_pulse")!;
    const pack1 = { ...DEFAULT_CARD_PACKS[0], priceCoins: 50 };

    const players: StoreAnalyticsPlayerSlice[] = [
      {
        id: "p1",
        nick: "Ana",
        school: "Raimundo Bezerra",
        coinsSpentTotal: 250,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`, `aura:${aura1.id}`],
        purchasedPackCounts: { [pack1.id]: 2 },
        storeCoinsSpentByItem: {
          [`avatar:${avatar1.id}`]: 100,
          [`aura:${aura1.id}`]: 50,
          [`pack:${pack1.id}`]: 100,
        },
      },
      {
        id: "p2",
        nick: "Bruno",
        school: "Agenor Smith",
        coinsSpentTotal: 150,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`],
        purchasedPackCounts: { [pack1.id]: 1 },
        storeCoinsSpentByItem: {
          [`avatar:${avatar1.id}`]: 100,
          [`pack:${pack1.id}`]: 50,
        },
      },
    ];

    const report = computeStoreSalesReport(players, { cardPacks: [pack1] });

    assert.equal(report.analyzedPlayersCount, 2);
    assert.equal(report.excludedAdminAndTestCount, 0);
    assert.equal(report.totalCoinsSpent, 400);
    assert.equal(report.totalItemsPurchased, 6);
    assert.equal(report.distinctItemsPurchased, 3);
    assert.equal(report.uniqueBuyersCount, 2);
    assert.equal(report.untrackedLegacyCoins, 0);

    assert.deepEqual(report.byKind.pack, { units: 3, coinsSpent: 150, distinctItems: 1 });
    assert.deepEqual(report.byKind.avatar, { units: 2, coinsSpent: 200, distinctItems: 1 });
    assert.deepEqual(report.byKind.aura, { units: 1, coinsSpent: 50, distinctItems: 1 });

    // Ordenado por quantidade comprada desc: pack (3), avatar (2), aura (1)
    assert.equal(report.items[0].key, `pack:${pack1.id}`);
    assert.equal(report.items[0].quantitySold, 3);
    assert.equal(report.items[0].coinsSpent, 150);
    assert.equal(report.items[0].hasEstimatedCoins, false);
    assert.equal(report.items[0].buyers.length, 2);
    assert.equal(report.items[0].buyers[0].nick, "Ana");
    assert.equal(report.items[0].buyers[0].quantity, 2);

    assert.equal(report.items[1].key, `avatar:${avatar1.id}`);
    assert.equal(report.items[1].quantitySold, 2);
    assert.equal(report.items[1].coinsSpent, 200);
  });

  it("estima moedas de compras legadas sem storeCoinsSpentByItem e aponta saldo legado não detalhado", () => {
    const avatar1 = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const players: StoreAnalyticsPlayerSlice[] = [
      {
        id: "p_legacy",
        nick: "Carlos",
        coinsSpentTotal: avatar1.priceCoins + 120,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`],
        // Sem storeCoinsSpentByItem e sem purchasedPackCounts (ex.: pacote antigo já aberto)
      },
    ];

    const report = computeStoreSalesReport(players);
    assert.equal(report.totalCoinsSpent, avatar1.priceCoins + 120);
    assert.equal(report.totalItemsPurchased, 1);
    assert.equal(report.untrackedLegacyCoins, 120);
    assert.equal(report.items[0].coinsSpent, avatar1.priceCoins);
    assert.equal(report.items[0].hasEstimatedCoins, true);
    assert.equal(report.items[0].buyers[0].hasEstimatedCoins, true);
  });

  it("exclui contas ADM e de teste por padrão e permite incluí-las via opção", () => {
    const avatar1 = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const players: StoreAnalyticsPlayerSlice[] = [
      {
        id: "adm1",
        nick: "JOSINEY",
        isAdmin: true,
        coinsSpentTotal: 500,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`],
        storeCoinsSpentByItem: { [`avatar:${avatar1.id}`]: 500 },
      },
      {
        id: "test1",
        nick: "ZHERET",
        coinsSpentTotal: 300,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`],
        storeCoinsSpentByItem: { [`avatar:${avatar1.id}`]: 300 },
      },
      {
        id: "test2",
        nick: "LORD",
        coinsSpentTotal: 200,
        purchasedPackCounts: { pack_basico: 2 },
        storeCoinsSpentByItem: { "pack:pack_basico": 200 },
      },
      {
        id: "st1",
        nick: "Maria",
        coinsSpentTotal: 100,
        purchasedCosmeticIds: [`avatar:${avatar1.id}`],
        storeCoinsSpentByItem: { [`avatar:${avatar1.id}`]: 100 },
      },
    ];

    const defaultReport = computeStoreSalesReport(players);
    assert.equal(defaultReport.analyzedPlayersCount, 1);
    assert.equal(defaultReport.excludedAdminAndTestCount, 3);
    assert.equal(defaultReport.totalCoinsSpent, 100);
    assert.equal(defaultReport.totalItemsPurchased, 1);

    const fullReport = computeStoreSalesReport(players, {}, { includeAdminAndTest: true });
    assert.equal(fullReport.analyzedPlayersCount, 4);
    assert.equal(fullReport.excludedAdminAndTestCount, 0);
    assert.equal(fullReport.totalCoinsSpent, 1100);
    assert.equal(fullReport.totalItemsPurchased, 5);
  });

  it("trata itens removidos do catálogo e deduplica purchasedCosmeticIds repetidos no mesmo perfil", () => {
    const players: StoreAnalyticsPlayerSlice[] = [
      {
        id: "st_dup",
        nick: "Lucas",
        coinsSpentTotal: 180,
        purchasedCosmeticIds: [
          "avatar:avatar_custom_removido",
          "avatar:avatar_custom_removido",
          "invalid_without_prefix",
          "aura:",
        ],
        purchasedPackCounts: {
          pacote_extinto: 2,
          pacote_zero: 0,
        },
        storeCoinsSpentByItem: {
          "avatar:avatar_custom_removido": 80,
          "pack:pacote_extinto": 100,
        },
      },
    ];

    const report = computeStoreSalesReport(players);
    assert.equal(report.totalItemsPurchased, 3);
    assert.equal(report.distinctItemsPurchased, 2);
    assert.equal(report.untrackedLegacyCoins, 0);

    const removedPack = report.items.find((i) => i.key === "pack:pacote_extinto");
    assert.ok(removedPack);
    assert.equal(removedPack.isRemovedFromCatalog, true);
    assert.equal(removedPack.currentPriceCoins, null);
    assert.equal(removedPack.quantitySold, 2);
    assert.equal(removedPack.coinsSpent, 100);

    const removedAvatar = report.items.find((i) => i.key === "avatar:avatar_custom_removido");
    assert.ok(removedAvatar);
    assert.equal(removedAvatar.isRemovedFromCatalog, true);
    assert.equal(removedAvatar.quantitySold, 1);
    assert.equal(removedAvatar.coinsSpent, 80);
  });

  it("filtra por categoria e busca sem acento e ordena por quantidade, moedas e nome", () => {
    const avatarBot = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const auraAzul = DEFAULT_AURAS.find((a) => a.id === "aura_azul_pulse")!;
    const packBasico = { ...DEFAULT_CARD_PACKS[0], name: "Pacote Básico", priceCoins: 50 };

    const players: StoreAnalyticsPlayerSlice[] = [
      {
        id: "p1",
        nick: "Pedro",
        coinsSpentTotal: 600,
        purchasedCosmeticIds: [`avatar:${avatarBot.id}`, `aura:${auraAzul.id}`],
        purchasedPackCounts: { [packBasico.id]: 4 },
        storeCoinsSpentByItem: {
          [`avatar:${avatarBot.id}`]: 300,
          [`aura:${auraAzul.id}`]: 100,
          [`pack:${packBasico.id}`]: 200,
        },
      },
      {
        id: "p2",
        nick: "Sofia",
        coinsSpentTotal: 100,
        purchasedCosmeticIds: [`aura:${auraAzul.id}`],
        storeCoinsSpentByItem: { [`aura:${auraAzul.id}`]: 100 },
      },
    ];

    const report = computeStoreSalesReport(players, { cardPacks: [packBasico] });

    const onlyAuras = filterAndSortStoreReportItems(report.items, { kind: "aura" });
    assert.equal(onlyAuras.length, 1);
    assert.equal(onlyAuras[0].kind, "aura");

    const searchPack = filterAndSortStoreReportItems(report.items, { search: "basico" });
    assert.equal(searchPack.length, 1);
    assert.equal(searchPack[0].key, `pack:${packBasico.id}`);

    const byCoins = filterAndSortStoreReportItems(report.items, { sortBy: "coins" });
    assert.equal(byCoins[0].key, `avatar:${avatarBot.id}`); // 300 moedas

    const byQuantity = filterAndSortStoreReportItems(report.items, { sortBy: "quantity" });
    assert.equal(byQuantity[0].key, `pack:${packBasico.id}`); // 4 unidades

    const byName = filterAndSortStoreReportItems(report.items, { sortBy: "name" });
    assert.deepEqual(
      byName.map((i) => i.name),
      [...byName.map((i) => i.name)].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    );
  });

  it("Bloco 1.3 (ECON-23): exclui lixeira (deletedAt), deduplica snapshots por nickSlug, normaliza pacotes legados e calcula untrackedLegacyCoins por aluno", () => {
    const avatarBot = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const packBasico = { ...DEFAULT_CARD_PACKS[0], priceCoins: 50 };

    const players: StoreAnalyticsPlayerSlice[] = [
      // Mesmo aluno salvo duas vezes (pf_local_* + PlayFab ID) -> mantém snapshot mais completo
      {
        id: "pf_local_joao",
        nick: "João",
        coinsSpentTotal: 100,
        purchasedCosmeticIds: [`avatar:${avatarBot.id}`],
        storeCoinsSpentByItem: { [`avatar:${avatarBot.id}`]: 100 },
      },
      {
        id: "PF_999",
        nick: "João",
        nickNormalized: "joao",
        coinsSpentTotal: 150,
        purchasedCosmeticIds: [`avatar:${avatarBot.id}`],
        purchasedPackCounts: { pack_avancado: 1 }, // ID legado -> normaliza para pack_mestre
        storeCoinsSpentByItem: {
          [`avatar:${avatarBot.id}`]: 100,
          "pack:pack_avancado": 50,
        },
      },
      // Conta na lixeira deve ser ignorada
      {
        id: "p_lixeira",
        nick: "Excluido",
        deletedAt: "2026-11-20T00:00:00.000Z",
        coinsSpentTotal: 500,
        purchasedCosmeticIds: [`avatar:${avatarBot.id}`],
      },
      // Aluno com moedas legadas não rastreadas (+80 sem item) e João não mascara Maria
      {
        id: "p_maria",
        nick: "Maria",
        coinsSpentTotal: 80,
      },
    ];

    const report = computeStoreSalesReport(players, { cardPacks: DEFAULT_CARD_PACKS });
    assert.equal(report.analyzedPlayersCount, 2, "Deve excluir deletedAt e deduplicar João");
    assert.equal(report.totalCoinsSpent, 230); // 150 + 80
    assert.equal(report.untrackedLegacyCoins, 80, "Apenas as 80 moedas não rastreadas de Maria contam como legadas");
    assert.ok(report.items.some((i) => i.key === "pack:pack_mestre" && i.quantitySold === 1));
  });
});
