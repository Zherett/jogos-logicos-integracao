import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateStackedInventorySlots,
  AVATAR_BASIC_COLORS,
  buildLetterAvatarId,
  canUseDualAvatar,
  DEFAULT_AURAS,
  DEFAULT_AVATARS,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
  ensureLevel5InitialLetterUnlock,
  getAvatarCategory,
  getInitialLetterAvatarIdForNick,
  getInitialLetterFromNick,
  getUnlockedAvatarIds,
  grantCosmeticToProfile,
  isSafeCosmeticImageUrl,
  mergeMonotonicCountRecords,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  paginateUnifiedInventorySlots,
  purchaseStoreCardPack,
  purchaseStoreCosmetic,
  resolveEquippedAura,
  resolveEquippedAvatar,
  type AvatarDefinition,
  type CosmeticProfileSlice,
} from "./cosmetics-catalog.ts";
import { DEFAULT_CARD_PACKS } from "./cards-catalog.ts";

describe("Catálogo de Cosméticos e Regras da Loja", () => {
  it("disponibiliza o avatar padrão e 6 cores básicas gratuitas", () => {
    assert.equal(AVATAR_BASIC_COLORS.length, 6);
    const profile: CosmeticProfileSlice = { coins: 0 };
    const resolved = resolveEquippedAvatar(profile);
    assert.equal(resolved.avatar.id, DEFAULT_AVATAR_ID);
    assert.equal(resolved.avatar.priceCoins, 0);
    assert.equal(resolved.color, DEFAULT_AVATAR_COLOR);
  });

  it("permite mesclar avatares customizados por URL/GIF do ADM com os padrões", () => {
    const custom: AvatarDefinition[] = [
      {
        id: "avatar_gif_adm",
        name: "Mascote GIF",
        description: "Criado pelo ADM",
        imageUrl: "https://example.com/robot.gif",
        priceCoins: 400,
        enabled: true,
      },
    ];
    const merged = mergeWithDefaultAvatars(custom);
    assert.equal(merged.length, DEFAULT_AVATARS.length + 1);
    const found = merged.find((a) => a.id === "avatar_gif_adm");
    assert.equal(found?.imageUrl, "https://example.com/robot.gif");
  });

  it("compra avatar e aura descontando moedas e bloqueando compra duplicada", () => {
    const targetAvatar = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const targetAura = DEFAULT_AURAS.find((a) => a.id === "aura_azul_pulse")!;

    let profile: CosmeticProfileSlice = { coins: 100 };
    const fail = purchaseStoreCosmetic(profile, "avatar", targetAvatar);
    assert.equal(fail.ok, false);
    assert.equal(fail.profile.coins, 100);

    profile = { coins: 500 };
    const buyAvatar = purchaseStoreCosmetic(profile, "avatar", targetAvatar);
    assert.equal(buyAvatar.ok, true);
    assert.equal(buyAvatar.profile.coins, 500 - targetAvatar.priceCoins);
    assert.ok(buyAvatar.profile.unlockedAvatars?.includes("avatar_bot"));

    const dupAvatar = purchaseStoreCosmetic(buyAvatar.profile, "avatar", targetAvatar);
    assert.equal(dupAvatar.ok, false);

    const buyAura = purchaseStoreCosmetic(buyAvatar.profile, "aura", targetAura);
    assert.equal(buyAura.ok, true);
    assert.equal(
      buyAura.profile.coins,
      500 - targetAvatar.priceCoins - targetAura.priceCoins,
    );
    assert.ok(buyAura.profile.unlockedAuras?.includes("aura_azul_pulse"));
  });

  it("não equipa cosmético que não esteja desbloqueado no perfil", () => {
    const profile: CosmeticProfileSlice = {
      unlockedAvatars: [DEFAULT_AVATAR_ID],
      equippedAvatar: { id: "avatar_crown", color: "#ec4899" },
      unlockedAuras: [],
      equippedAuraId: "aura_bicolor_real",
    };
    const av = resolveEquippedAvatar(profile);
    assert.equal(av.avatar.id, DEFAULT_AVATAR_ID);
    assert.equal(av.color, "#ec4899");
    const aura = resolveEquippedAura(profile);
    assert.equal(aura, null);

    const granted = grantCosmeticToProfile(profile, "aura", "aura_bicolor_real");
    assert.equal(granted.alreadyOwned, false);
    const resolvedAura = resolveEquippedAura(granted.profile);
    assert.equal(resolvedAura?.id, "aura_bicolor_real");
  });

  it("compra pacote de cartas na loja adicionando ao unopenedPacks", () => {
    const pack = { ...DEFAULT_CARD_PACKS[0], priceCoins: 40 };
    const res = purchaseStoreCardPack({ coins: 100 } as CosmeticProfileSlice, pack, 2);
    assert.equal(res.ok, true);
    assert.equal(res.totalCost, 80);
    assert.equal(res.profile.coins, 20);
    assert.equal(res.profile.unopenedPacks?.[pack.id], 2);
  });

  it("inclui todas as 15 auras padrão (estáticas, pulsantes e bicolores)", () => {
    const auras = mergeWithDefaultAuras();
    assert.equal(auras.length, 15);
    assert.equal(auras.filter((a) => a.kind === "static").length, 5);
    assert.equal(auras.filter((a) => a.kind === "pulsing").length, 5);
    assert.equal(auras.filter((a) => a.kind === "bicolor").length, 5);
  });

  it("aloca itens iguais no mesmo slot com quantidade ilimitada e tipos diferentes em slots separados até 15", () => {
    const p1 = DEFAULT_CARD_PACKS[0];
    const p2 = DEFAULT_CARD_PACKS[1];
    const slots = allocateStackedInventorySlots(
      DEFAULT_CARD_PACKS,
      { [p1.id]: 999, [p2.id]: 4 },
      15,
    );
    assert.equal(slots.length, 15);
    assert.equal(slots[0].item?.id, p1.id);
    assert.equal(slots[0].quantity, 999);
    assert.equal(slots[1].item?.id, p2.id);
    assert.equal(slots[1].quantity, 4);
    assert.equal(slots[2].item, null);
    assert.equal(slots[14].item, null);
  });

  it("pagina a mochila unificada de 12 em 12 slots quando há mais de 12 itens diferentes", () => {
    const items = Array.from({ length: 14 }, (_, idx) => ({ id: `item_${idx + 1}` }));

    const page1 = paginateUnifiedInventorySlots(items, 1, 12);
    assert.equal(page1.page, 1);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.slots.length, 12);
    assert.equal(page1.slots[0].item?.id, "item_1");
    assert.equal(page1.slots[11].item?.id, "item_12");

    const page2 = paginateUnifiedInventorySlots(items, 2, 12);
    assert.equal(page2.page, 2);
    assert.equal(page2.slots.length, 12);
    assert.equal(page2.slots[0].slotNumber, 13);
    assert.equal(page2.slots[0].item?.id, "item_13");
    assert.equal(page2.slots[1].item?.id, "item_14");
    assert.equal(page2.slots[2].item, null);

    // Clamp automático se a página pedida for maior que totalPages
    const clamped = paginateUnifiedInventorySlots(items, 5, 12);
    assert.equal(clamped.page, 2);
  });

  it("preserva lifetimeCoins >= coins + coinsSpentTotal em compras de contas legadas para evitar desconto em dobro no sync", () => {
    const legacyProfile: { coins: number; lifetimeCoins?: number; coinsSpentTotal?: number } = {
      coins: 200,
    };
    const aura = mergeWithDefaultAuras()[0];
    const buyAura = purchaseStoreCosmetic(legacyProfile, "aura", aura);
    assert.equal(buyAura.ok, true);
    assert.equal(buyAura.profile.lifetimeCoins, 200);
    assert.equal(buyAura.profile.coinsSpentTotal, aura.priceCoins);
    assert.equal(
      buyAura.profile.coins,
      (buyAura.profile.lifetimeCoins ?? 0) - (buyAura.profile.coinsSpentTotal ?? 0),
    );

    const pack = { ...DEFAULT_CARD_PACKS[0], priceCoins: 40 };
    const buyPack = purchaseStoreCardPack(buyAura.profile, pack, 1);
    assert.equal(buyPack.ok, true);
    assert.equal(buyPack.profile.lifetimeCoins, 200);
    assert.equal(buyPack.profile.coinsSpentTotal, aura.priceCoins + 40);
    assert.equal(
      buyPack.profile.coins,
      (buyPack.profile.lifetimeCoins ?? 0) - (buyPack.profile.coinsSpentTotal ?? 0),
    );
  });

  it("gera 78 avatares de letras (A-Z em 3 variações) com preços e subcategorias corretos", () => {
    const letters = DEFAULT_AVATARS.filter((a) => getAvatarCategory(a) === "letter");
    const icons = DEFAULT_AVATARS.filter((a) => getAvatarCategory(a) === "icon");
    assert.equal(letters.length, 26 * 3);
    assert.ok(icons.length >= 19);

    const simple = letters.filter((a) => a.letterVariant === "simple");
    const round = letters.filter((a) => a.letterVariant === "round");
    const square = letters.filter((a) => a.letterVariant === "square");
    assert.equal(simple.length, 26);
    assert.equal(round.length, 26);
    assert.equal(square.length, 26);

    assert.ok(simple.every((a) => a.priceCoins === 50));
    assert.ok(round.every((a) => a.priceCoins === 80));
    assert.ok(square.every((a) => a.priceCoins === 100));
    assert.equal(buildLetterAvatarId("J", "simple"), "avatar_letter_simple_j");
  });

  it("desbloqueia gratuitamente a letra inicial simples ao atingir Nível 5+ (incluindo retroativo)", () => {
    assert.equal(getInitialLetterFromNick("José"), "J");
    assert.equal(getInitialLetterFromNick("Ágata"), "A");
    assert.equal(getInitialLetterFromNick("_lucas99"), "L");
    assert.equal(getInitialLetterFromNick("12345"), null);
    assert.equal(getInitialLetterAvatarIdForNick("José"), "avatar_letter_simple_j");

    // Nível 4 ainda não recebe
    const lvl4: CosmeticProfileSlice = { nick: "José", level: 4, coins: 100, unlockedAvatars: [] };
    const res4 = ensureLevel5InitialLetterUnlock(lvl4);
    assert.equal(res4.grantedAvatarId, null);
    assert.equal(getUnlockedAvatarIds(lvl4).includes("avatar_letter_simple_j"), false);

    // Nível 5 recebe automaticamente sem descontar moedas
    const lvl5: CosmeticProfileSlice = { nick: "José", level: 5, coins: 100, coinsSpentTotal: 0 };
    const res5 = ensureLevel5InitialLetterUnlock(lvl5);
    assert.equal(res5.grantedAvatarId, "avatar_letter_simple_j");
    assert.equal(res5.profile.coins, 100);
    assert.equal(res5.profile.coinsSpentTotal, 0);
    assert.ok(res5.profile.unlockedAvatars?.includes("avatar_letter_simple_j"));
    assert.equal(res5.profile.level5InitialAvatarGrantedId, "avatar_letter_simple_j");

    // Jogador já no Nível 8 (retroativo) também recebe automaticamente
    const lvl8: CosmeticProfileSlice = { nick: "Érica", level: 8, coins: 250 };
    assert.ok(getUnlockedAvatarIds(lvl8).includes("avatar_letter_simple_e"));
    const res8 = ensureLevel5InitialLetterUnlock(lvl8);
    assert.equal(res8.grantedAvatarId, "avatar_letter_simple_e");

    // Idempotente: não concede novamente
    const res8Again = ensureLevel5InitialLetterUnlock(res8.profile);
    assert.equal(res8Again.grantedAvatarId, null);
  });

  it("permite equipar 2 avatares distintos apenas no Nível 10 (e desativa animação se só 1)", () => {
    assert.equal(canUseDualAvatar({ level: 9 }), false);
    assert.equal(canUseDualAvatar({ level: 10 }), true);

    // Nível 9 com secondaryId configurado: ignora o segundo avatar
    const lvl9: CosmeticProfileSlice = {
      level: 9,
      unlockedAvatars: [DEFAULT_AVATAR_ID, "avatar_bot", "avatar_crown"],
      equippedAvatar: { id: "avatar_bot", secondaryId: "avatar_crown", color: "#3b82f6" },
    };
    const resolved9 = resolveEquippedAvatar(lvl9);
    assert.equal(resolved9.avatar.id, "avatar_bot");
    assert.equal(resolved9.secondaryAvatar, null);

    // Nível 10 com 2 avatares desbloqueados distintos: retorna ambos
    const lvl10: CosmeticProfileSlice = {
      level: 10,
      unlockedAvatars: [DEFAULT_AVATAR_ID, "avatar_bot", "avatar_crown"],
      equippedAvatar: { id: "avatar_bot", secondaryId: "avatar_crown", color: "#8b5cf6" },
    };
    const resolved10 = resolveEquippedAvatar(lvl10);
    assert.equal(resolved10.avatar.id, "avatar_bot");
    assert.equal(resolved10.secondaryAvatar?.id, "avatar_crown");
    assert.equal(resolved10.color, "#8b5cf6");

    // Nível 10 com apenas 1 avatar (ou duplicado ou não desbloqueado): secondaryAvatar é null
    const resolvedSame = resolveEquippedAvatar({
      ...lvl10,
      equippedAvatar: { id: "avatar_bot", secondaryId: "avatar_bot", color: "#8b5cf6" },
    });
    assert.equal(resolvedSame.secondaryAvatar, null);

    const resolvedLocked = resolveEquippedAvatar({
      ...lvl10,
      equippedAvatar: { id: "avatar_bot", secondaryId: "avatar_gem", color: "#8b5cf6" },
    });
    assert.equal(resolvedLocked.secondaryAvatar, null);
  });

  it("bloqueia URLs perigosas (http:, javascript:, data:image/svg+xml, protocol-relative) em avatares customizados", () => {
    assert.equal(isSafeCosmeticImageUrl("https://cdn.exemplo.com/avatar.gif"), true);
    assert.equal(isSafeCosmeticImageUrl("http://cdn.exemplo.com/avatar.png"), false);
    assert.equal(isSafeCosmeticImageUrl("/assets/avatar.webp"), true);
    assert.equal(
      isSafeCosmeticImageUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"),
      true,
    );

    assert.equal(isSafeCosmeticImageUrl("javascript:alert(1)"), false);
    assert.equal(isSafeCosmeticImageUrl("  JAVASCRIPT:alert(1) "), false);
    assert.equal(isSafeCosmeticImageUrl("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4="), false);
    assert.equal(isSafeCosmeticImageUrl("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(isSafeCosmeticImageUrl("//evil.example/a.png"), false);
    assert.equal(isSafeCosmeticImageUrl("vbscript:msgbox(1)"), false);
    assert.equal(isSafeCosmeticImageUrl(""), false);

    const malicious: AvatarDefinition[] = [
      {
        id: "avatar_xss_1",
        name: "XSS JS",
        description: "Tentativa XSS via javascript:",
        priceCoins: 50,
        enabled: true,
        imageUrl: "javascript:alert(1)",
      },
      {
        id: "avatar_xss_2",
        name: "XSS SVG",
        description: "Tentativa XSS via SVG",
        priceCoins: 50,
        enabled: true,
        imageUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      },
      {
        id: "avatar_ok",
        name: "Seguro",
        description: "Avatar com URL HTTPS válida",
        priceCoins: 50,
        enabled: true,
        imageUrl: "https://cdn.exemplo.com/ok.png",
      },
    ];
    const merged = mergeWithDefaultAvatars(malicious);
    assert.equal(merged.some((a) => a.id === "avatar_xss_1"), false);
    assert.equal(merged.some((a) => a.id === "avatar_xss_2"), false);
    assert.equal(merged.some((a) => a.id === "avatar_ok"), true);
  });

  it("registra purchasedPackCounts, storeCoinsSpentByItem e mescla contadores monotonicamente", () => {
    const targetAvatar = DEFAULT_AVATARS.find((a) => a.id === "avatar_bot")!;
    const targetAura = DEFAULT_AURAS.find((a) => a.id === "aura_azul_pulse")!;
    const pack = { ...DEFAULT_CARD_PACKS[0], priceCoins: 40 };

    const start: CosmeticProfileSlice = { coins: 1000 };
    const buyAvatar = purchaseStoreCosmetic(start, "avatar", targetAvatar);
    assert.equal(buyAvatar.ok, true);
    assert.equal(buyAvatar.profile.storeCoinsSpentByItem?.[`avatar:${targetAvatar.id}`], targetAvatar.priceCoins);

    const buyAura = purchaseStoreCosmetic(buyAvatar.profile, "aura", targetAura);
    assert.equal(buyAura.ok, true);
    assert.equal(buyAura.profile.storeCoinsSpentByItem?.[`aura:${targetAura.id}`], targetAura.priceCoins);

    const buyPack1 = purchaseStoreCardPack(buyAura.profile, pack, 2);
    assert.equal(buyPack1.ok, true);
    assert.equal(buyPack1.profile.purchasedPackCounts?.[pack.id], 2);
    assert.equal(buyPack1.profile.storeCoinsSpentByItem?.[`pack:${pack.id}`], 80);

    // Nova compra do mesmo pacote soma na quantidade comprada e nas moedas gastas por item
    const buyPack2 = purchaseStoreCardPack(buyPack1.profile, pack, 3);
    assert.equal(buyPack2.ok, true);
    assert.equal(buyPack2.profile.purchasedPackCounts?.[pack.id], 5);
    assert.equal(buyPack2.profile.storeCoinsSpentByItem?.[`pack:${pack.id}`], 200);
    assert.equal(
      buyPack2.profile.coinsSpentTotal,
      targetAvatar.priceCoins + targetAura.priceCoins + 200,
    );

    const mergedCounts = mergeMonotonicCountRecords(
      { [pack.id]: 2, invalid_neg: -3, invalid_zero: 0 },
      { [pack.id]: 5, other: 1.9 },
      null,
    );
    assert.deepEqual(mergedCounts, { [pack.id]: 5, other: 1 });
  });
});
