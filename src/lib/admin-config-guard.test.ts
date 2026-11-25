import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADMIN_CONFIG, type PlatformAdminConfig } from "./game-codes.ts";
import {
  exportFullAdminBackup,
  mergeAdminConfigForCloudWrite,
  parseFullAdminBackup,
} from "./admin-config-guard.ts";

function makePopulatedRemote(): PlatformAdminConfig {
  return {
    ...DEFAULT_ADMIN_CONFIG,
    playfabTitleId: "186F63",
    configRevision: 7,
    rankedSeasonId: 1,
    rankedSeasonName: "Temporada 1 Ranqueada • SEMED Coari",
    cardsCatalog: [
      {
        id: "card_1",
        name: "Robô Alfa",
        description: "Carta 1",
        rarity: "rara",
        imageUrl: "https://example.com/1.png",
        createdAt: "2026-11-24T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
      },
    ],
    customMedals: [
      { id: "m1", title: "Medalha 1" } as any,
      { id: "m2", title: "Medalha 2" } as any,
    ],
    specialEvents: [
      { id: "ev1", title: "Evento 1" } as any,
      { id: "ev2", title: "Evento 2" } as any,
    ],
    noticeSlides: [
      { id: "n1", title: "Aviso 1", message: "Msg", type: "announcement", active: true, createdAt: "2026-11-24T00:00:00.000Z" },
      { id: "n2", title: "Aviso 2", message: "Msg", type: "announcement", active: true, createdAt: "2026-11-24T00:00:00.000Z" },
    ],
    inboxMessages: [
      { id: "msg_1", title: "Bem-vindo" },
      { id: "msg_2", title: "Novidades" },
    ],
    canceledInboxMessageIds: ["old_1", "old_2"],
    adminMedalNotifications: [{ id: "notif_1" } as any, { id: "notif_2" } as any],
  };
}

describe("Blindagem de PlatformAdminConfig (Isolamento, Anti-Wipe, Revisão e Backup Global)", () => {
  it("evita Lost Update entre dois ADMs editando abas diferentes simultaneamente", () => {
    const remote = makePopulatedRemote();
    // ADM B (com rascunho velho sem os 2 eventos/avisos/mensagens) salva apenas na aba Rotina
    const staleDraftFromRoutine: PlatformAdminConfig = {
      ...DEFAULT_ADMIN_CONFIG,
      playfabTitleId: "",
      rankedSeasonId: 2, // tentativa acidental de temporada diferente fora de domain: "season"
      specialEvents: [],
      noticeSlides: [],
      inboxMessages: [],
      customMedals: [],
      cardsCatalog: [],
      rolloutFlags: {
        enableDailyRoutineForStudents: true,
        enableCoinsWalletForStudents: true,
        enableDefaultAvatarForStudents: true,
        enableShopForStudents: true,
      },
    };

    const res = mergeAdminConfigForCloudWrite(remote, staleDraftFromRoutine, {
      domain: "routine",
    });

    assert.equal(res.blockedError, undefined);
    assert.equal(res.nextRevision, 8);
    assert.equal(res.merged.configRevision, 8);
    // Aplicou rolloutFlags da aba Rotina
    assert.equal(res.merged.rolloutFlags?.enableShopForStudents, true);
    // Preservou TODOS os outros domínios do servidor sem Lost Update!
    assert.equal(res.merged.cardsCatalog?.length, 1);
    assert.equal(res.merged.specialEvents?.length, 2);
    assert.equal(res.merged.noticeSlides?.length, 2);
    assert.equal(res.merged.inboxMessages?.length, 2);
    assert.equal(res.merged.customMedals?.length, 2);
    assert.equal(res.merged.rankedSeasonId, 1, "Fora de domain=season não pode alterar rankedSeasonId");
    assert.equal(res.merged.playfabTitleId, "186F63", "Não pode zerar playfabTitleId válido");
  });

  it("aplica anti-wipe universal em gravação genérica (domain='all') preservando todas as coleções populadas", () => {
    const remote = makePopulatedRemote();
    const emptyIncoming: PlatformAdminConfig = {
      ...DEFAULT_ADMIN_CONFIG,
      cardsCatalog: [],
      inboxMessages: [],
      specialEvents: [],
      noticeSlides: [],
      customMedals: [],
      canceledInboxMessageIds: [],
      adminMedalNotifications: [],
      rankedSeasonId: 2,
    };

    const res = mergeAdminConfigForCloudWrite(remote, emptyIncoming, { domain: "all" });
    assert.equal(res.blockedError, undefined);
    assert.equal(res.merged.cardsCatalog?.length, 1);
    assert.equal(res.merged.inboxMessages?.length, 2);
    assert.equal(res.merged.specialEvents?.length, 2);
    assert.equal(res.merged.noticeSlides?.length, 2);
    assert.equal(res.merged.customMedals?.length, 2);
    assert.equal(res.merged.canceledInboxMessageIds?.length, 2);
    assert.equal(res.merged.adminMedalNotifications?.length, 2);
    assert.equal(res.merged.rankedSeasonId, 1);
    assert.ok(res.preservedCollections.includes("inboxMessages"));
    assert.ok(res.preservedCollections.includes("specialEvents"));
  });

  it("permite alterar temporada apenas com domain='season' e allowSeasonChange=true", () => {
    const remote = makePopulatedRemote();
    const res = mergeAdminConfigForCloudWrite(
      remote,
      {
        ...remote,
        rankedSeasonId: 2,
        rankedSeasonName: "Temporada 2 Ranqueada • SEMED Coari",
      },
      { domain: "season", allowSeasonChange: true },
    );
    assert.equal(res.blockedError, undefined);
    assert.equal(res.merged.rankedSeasonId, 2);
    assert.equal(res.merged.rankedSeasonName, "Temporada 2 Ranqueada • SEMED Coari");
    // Mesmo em reset de temporada, cartas e eventos continuam preservados!
    assert.equal(res.merged.cardsCatalog?.length, 1);
    assert.equal(res.merged.specialEvents?.length, 2);
  });

  it("exporta e importa Backup Completo Unificado da plataforma com resumo exato", () => {
    const remote = makePopulatedRemote();
    const fakePromos = [{ code: "TESTE-1234", cleanCode: "TESTE1234" }];
    const raw = exportFullAdminBackup(remote, fakePromos);
    const parsed = parseFullAdminBackup(raw);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.summary?.cardsCount, 1);
    assert.equal(parsed.summary?.customMedalsCount, 2);
    assert.equal(parsed.summary?.specialEventsCount, 2);
    assert.equal(parsed.summary?.noticeSlidesCount, 2);
    assert.equal(parsed.summary?.inboxMessagesCount, 2);
    assert.equal(parsed.summary?.promoCodesCount, 1);
    assert.equal(parsed.promoCodes?.length, 1);
  });
});
