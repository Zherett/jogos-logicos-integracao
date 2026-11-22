import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateStackedInventorySlots,
  AVATAR_BASIC_COLORS,
  DEFAULT_AURAS,
  DEFAULT_AVATARS,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
  grantCosmeticToProfile,
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
    const res = purchaseStoreCardPack({ coins: 100 }, pack, 2);
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
});
