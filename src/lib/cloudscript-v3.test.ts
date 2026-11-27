import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import {
  clearServerVerifiedAdminTickets,
  fetchTitleDataAdminConfig,
  isServerVerifiedAdminTicket,
  purgeStudentViaCloudScript,
  saveAdminConfigViaCloudScript,
  serverPurchaseCosmetic,
  verifyAdminSessionCloud,
  type PlayFabClientCallFn,
} from "./playfab/cloudscript-v3.ts";

function createCloudScriptSandbox(adminIds: string[] = ["ADMIN_PF_1"]) {
  const titleData: Record<string, string> = {};
  const titleInternalData: Record<string, string> = {
    AdminPlayFabIds: JSON.stringify(adminIds),
  };
  const userData = new Map<string, Record<string, { Value: string; LastUpdated: string }>>();
  const userReadOnlyData = new Map<string, Record<string, { Value: string; LastUpdated: string }>>();
  const userInternalData = new Map<string, Record<string, { Value: string; LastUpdated: string }>>();
  const statsByPlayer = new Map<string, Record<string, number>>();
  const sharedGroups = new Map<string, Record<string, { Value: string; LastUpdated: string }>>();
  const bannedUsers: Array<{ PlayFabId: string; Reason?: string }> = [];

  const getMapBucket = (
    map: Map<string, Record<string, { Value: string; LastUpdated: string }>>,
    id: string,
  ) => {
    let bucket = map.get(id);
    if (!bucket) {
      bucket = {};
      map.set(id, bucket);
    }
    return bucket;
  };

  const pickKeys = (
    bucket: Record<string, { Value: string; LastUpdated: string }>,
    keys?: string[],
  ) => {
    const out: Record<string, { Value: string; LastUpdated: string }> = {};
    for (const [k, v] of Object.entries(bucket)) {
      if (!keys || keys.includes(k)) {
        out[k] = { ...v };
      }
    }
    return out;
  };

  const applyKVUpdate = (
    bucket: Record<string, { Value: string; LastUpdated: string }>,
    data?: Record<string, unknown>,
    keysToRemove?: string[],
  ) => {
    const nowIso = new Date().toISOString();
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        if (v === null || v === undefined) {
          delete bucket[k];
        } else {
          bucket[k] = { Value: String(v), LastUpdated: nowIso };
        }
      }
    }
    if (Array.isArray(keysToRemove)) {
      for (const k of keysToRemove) {
        delete bucket[k];
      }
    }
  };

  const sandbox: {
    handlers: Record<string, (args?: unknown, context?: unknown) => unknown>;
    currentPlayerId: string;
    server: Record<string, (req: Record<string, unknown>) => unknown>;
  } = {
    handlers: {},
    currentPlayerId: "STU_PF_1",
    server: {
      GetTitleData: (req) => {
        const keys = Array.isArray(req.Keys) ? (req.Keys as string[]) : Object.keys(titleData);
        const Data: Record<string, string> = {};
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(titleData, k)) {
            Data[k] = titleData[k];
          }
        }
        return { Data };
      },
      SetTitleData: (req) => {
        const k = String(req.Key ?? "");
        if (req.Value === null || req.Value === undefined) delete titleData[k];
        else titleData[k] = String(req.Value);
        return {};
      },
      GetTitleInternalData: (req) => {
        const keys = Array.isArray(req.Keys)
          ? (req.Keys as string[])
          : Object.keys(titleInternalData);
        const Data: Record<string, string> = {};
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(titleInternalData, k)) {
            Data[k] = titleInternalData[k];
          }
        }
        return { Data };
      },
      SetTitleInternalData: (req) => {
        const k = String(req.Key ?? "");
        if (req.Value === null || req.Value === undefined) delete titleInternalData[k];
        else titleInternalData[k] = String(req.Value);
        return {};
      },
      GetUserData: (req) => ({
        Data: pickKeys(
          getMapBucket(userData, String(req.PlayFabId ?? "")),
          Array.isArray(req.Keys) ? (req.Keys as string[]) : undefined,
        ),
      }),
      UpdateUserData: (req) => {
        applyKVUpdate(
          getMapBucket(userData, String(req.PlayFabId ?? "")),
          req.Data as Record<string, unknown> | undefined,
          req.KeysToRemove as string[] | undefined,
        );
        return {};
      },
      GetUserReadOnlyData: (req) => ({
        Data: pickKeys(
          getMapBucket(userReadOnlyData, String(req.PlayFabId ?? "")),
          Array.isArray(req.Keys) ? (req.Keys as string[]) : undefined,
        ),
      }),
      UpdateUserReadOnlyData: (req) => {
        applyKVUpdate(
          getMapBucket(userReadOnlyData, String(req.PlayFabId ?? "")),
          req.Data as Record<string, unknown> | undefined,
          req.KeysToRemove as string[] | undefined,
        );
        return {};
      },
      GetUserInternalData: (req) => ({
        Data: pickKeys(
          getMapBucket(userInternalData, String(req.PlayFabId ?? "")),
          Array.isArray(req.Keys) ? (req.Keys as string[]) : undefined,
        ),
      }),
      UpdateUserInternalData: (req) => {
        applyKVUpdate(
          getMapBucket(userInternalData, String(req.PlayFabId ?? "")),
          req.Data as Record<string, unknown> | undefined,
          req.KeysToRemove as string[] | undefined,
        );
        return {};
      },
      GetPlayerStatistics: (req) => {
        const map = statsByPlayer.get(String(req.PlayFabId ?? "")) ?? {};
        const names = Array.isArray(req.StatisticNames) ? (req.StatisticNames as string[]) : Object.keys(map);
        return {
          Statistics: names
            .filter((n) => Object.prototype.hasOwnProperty.call(map, n))
            .map((StatisticName) => ({ StatisticName, Value: map[StatisticName] })),
        };
      },
      UpdatePlayerStatistics: (req) => {
        const pid = String(req.PlayFabId ?? "");
        let map = statsByPlayer.get(pid);
        if (!map) {
          map = {};
          statsByPlayer.set(pid, map);
        }
        const list = Array.isArray(req.Statistics)
          ? (req.Statistics as Array<{ StatisticName: string; Value: number }>)
          : [];
        for (const item of list) {
          map[item.StatisticName] = item.Value;
        }
        return {};
      },
      GetSharedGroupData: (req) => ({
        Data: pickKeys(
          getMapBucket(sharedGroups, String(req.SharedGroupId ?? "")),
          Array.isArray(req.Keys) ? (req.Keys as string[]) : undefined,
        ),
      }),
      UpdateSharedGroupData: (req) => {
        applyKVUpdate(
          getMapBucket(sharedGroups, String(req.SharedGroupId ?? "")),
          req.Data as Record<string, unknown> | undefined,
          req.KeysToRemove as string[] | undefined,
        );
        return {};
      },
      BanUsers: (req) => {
        const bans = Array.isArray(req.Bans)
          ? (req.Bans as Array<{ PlayFabId: string; Reason?: string }>)
          : [];
        for (const b of bans) bannedUsers.push(b);
        return {};
      },
    },
  };

  const scriptPath = resolve(process.cwd(), "playfab/cloudscript.js");
  const code = readFileSync(scriptPath, "utf8");
  vm.runInNewContext(code, sandbox, { filename: "cloudscript.js" });

  const callHandler = <T = Record<string, unknown>>(
    name: string,
    playerId: string,
    args?: Record<string, unknown>,
  ): T => {
    sandbox.currentPlayerId = playerId;
    const fn = sandbox.handlers[name];
    assert.equal(typeof fn, "function", `Handler ${name} deve existir`);
    return fn(args ?? {}, {}) as T;
  };

  return {
    sandbox,
    callHandler,
    titleData,
    titleInternalData,
    userData,
    userReadOnlyData,
    userInternalData,
    statsByPlayer,
    sharedGroups,
    bannedUsers,
  };
}

describe("PlayFab CloudScript v3 (sandbox server-side)", () => {
  it("expõe GetCloudScriptInfo e VerifyAdminSession respeitando AdminPlayFabIds", () => {
    const env = createCloudScriptSandbox(["ADMIN_JOSINEY"]);

    const info = env.callHandler<{ ok: boolean; version: string; handlers: string[] }>(
      "GetCloudScriptInfo",
      "STU_1",
    );
    assert.equal(info.ok, true);
    assert.equal(info.version, "3.0.0");
    assert.ok(info.handlers.includes("AdminPurgeStudentAccount"));
    assert.ok(info.handlers.includes("ServerPurchaseCosmetic"));

    const studentCheck = env.callHandler<{ ok: boolean; isAdmin: boolean }>(
      "VerifyAdminSession",
      "STU_1",
    );
    assert.equal(studentCheck.isAdmin, false);

    const adminCheck = env.callHandler<{ ok: boolean; isAdmin: boolean }>(
      "VerifyAdminSession",
      "ADMIN_JOSINEY",
    );
    assert.equal(adminCheck.isAdmin, true);
  });

  it("RecordMatchResult aceita estatísticas versionadas Onda 2 e aplica teto anti-cheat", () => {
    const env = createCloudScriptSandbox();
    const res = env.callHandler<{ ok: boolean; validatedScore: number }>(
      "RecordMatchResult",
      "STU_1",
      {
        gameId: "logica",
        score: 99999,
        statistics: [
          { StatisticName: "XP_Total", Value: 500 },
          { StatisticName: "XP_Season_Current", Value: 250 },
          { StatisticName: "XP_Season_etapa_1", Value: 250 },
          { StatisticName: "Best_logica_Current", Value: 99999 },
          { StatisticName: "Best_robogrid_etapa_2", Value: 1500 },
          { StatisticName: "School_agenor_smith_XP", Value: 300 },
          { StatisticName: "School_hacker_XP", Value: 99999 },
          { StatisticName: "Best_inexistente_Current", Value: 99999 },
          { StatisticName: "XP_Hacker", Value: 99999 },
        ],
      },
    );

    assert.equal(res.ok, true);
    assert.equal(res.validatedScore, 480);
    const st = env.statsByPlayer.get("STU_1")!;
    assert.equal(st.XP_Total, 500);
    assert.equal(st.XP_Season_Current, 250);
    assert.equal(st.XP_Season_etapa_1, 250);
    assert.equal(st.Best_logica_Current, 480);
    assert.equal(st.Best_robogrid_etapa_2, 1000);
    assert.equal(st.School_agenor_smith_XP, 300);
    assert.equal(st.School_hacker_XP, undefined);
    assert.equal(st.Best_inexistente_Current, undefined);
    assert.equal(st.XP_Hacker, undefined);
  });

  it("SavePlatformAdminConfig protege contra não-ADM, conflito de revisão e wipe entre domínios", () => {
    const env = createCloudScriptSandbox(["ADMIN_1"]);

    const denied = env.callHandler<{ ok: boolean; error?: string }>(
      "SavePlatformAdminConfig",
      "STU_1",
      { config: { masterCode: "HACK" } },
    );
    assert.equal(denied.ok, false);

    const save1 = env.callHandler<{ ok: boolean; configRevision: number }>(
      "SavePlatformAdminConfig",
      "ADMIN_1",
      {
        domain: "all",
        config: {
          configRevision: 0,
          seasonId: 2,
          specialEvents: [{ id: "ev_1", title: "Semana da Lógica" }],
          noticeSlides: [{ id: "n_1", title: "Aviso 1" }],
          x1Enabled: true,
        },
      },
    );
    assert.equal(save1.ok, true);
    assert.equal(save1.configRevision, 1);

    // Tentativa desatualizada (rev 0 < existing 1) rejeitada
    const conflict = env.callHandler<{ ok: boolean; conflict?: boolean }>(
      "SavePlatformAdminConfig",
      "ADMIN_1",
      {
        domain: "x1",
        config: { configRevision: 0, x1Enabled: false },
      },
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.conflict, true);

    // Salva domínio x1 na revisão atual mantendo specialEvents e noticeSlides
    const save2 = env.callHandler<{ ok: boolean; configRevision: number }>(
      "SavePlatformAdminConfig",
      "ADMIN_1",
      {
        domain: "x1",
        config: { configRevision: 1, x1Enabled: false, specialEvents: [], noticeSlides: [] },
      },
    );
    assert.equal(save2.ok, true);
    assert.equal(save2.configRevision, 2);

    const got = env.callHandler<{
      ok: boolean;
      config: { x1Enabled: boolean; specialEvents: unknown[]; noticeSlides: unknown[] };
    }>("GetPlatformAdminConfig", "STU_ANY");
    assert.equal(got.ok, true);
    assert.equal(got.config.x1Enabled, false);
    assert.equal(got.config.specialEvents.length, 1);
    assert.equal(got.config.noticeSlides.length, 1);
  });

  it("AdminSavePromoCodes + InspectPromoCode + ClaimPromoCode aplicam rate-limit e limpam SharedGroup legado", () => {
    const env = createCloudScriptSandbox(["ADMIN_1"]);
    env.sandbox.server.UpdateSharedGroupData({
      SharedGroupId: "SEMED_PROMO_CODES_V1",
      Data: { promo_codes_catalog: "[{}]", promo_codes_deleted_ids: "[]" },
    });

    const saveRes = env.callHandler<{ ok: boolean; purgedLegacySharedGroup: boolean }>(
      "AdminSavePromoCodes",
      "ADMIN_1",
      {
        purgeLegacySharedGroup: true,
        catalog: [
          {
            id: "p1",
            code: "SEMED-1234",
            cleanCode: "SEMED1234",
            batchId: "b_1",
            batchName: "Evento 1",
            allowMultiplePerStudent: false,
            status: "active",
            rewards: { xp: 50, points: 25, coins: 10 },
          },
          {
            id: "p2",
            code: "SEMED-5678",
            cleanCode: "SEMED5678",
            batchId: "b_1",
            batchName: "Evento 1",
            allowMultiplePerStudent: false,
            status: "active",
            rewards: { xp: 50, points: 25, coins: 10 },
          },
        ],
        deletedIds: [],
      },
    );
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.purgedLegacySharedGroup, true);
    const sgAfter = env.sharedGroups.get("SEMED_PROMO_CODES_V1")!;
    assert.equal(sgAfter.promo_codes_catalog, undefined);

    // 3 erros seguidos disparam cooldown no servidor
    env.callHandler("InspectPromoCode", "STU_1", { code: "INVALID1" });
    env.callHandler("InspectPromoCode", "STU_1", { code: "INVALID2" });
    const third = env.callHandler<{ valid: boolean; status: string; cooldownSeconds: number }>(
      "InspectPromoCode",
      "STU_1",
      { code: "INVALID3" },
    );
    assert.equal(third.valid, false);
    assert.equal(third.status, "rate_limited");
    assert.ok(third.cooldownSeconds > 0);

    // Outro aluno resgata SEMED-1234 e é bloqueado no segundo código do mesmo lote
    const claim1 = env.callHandler<{ ok: boolean; cleanCode: string }>(
      "ClaimPromoCode",
      "STU_2",
      { code: "SEMED-1234", studentId: "stu_2", nick: "ana" },
    );
    assert.equal(claim1.ok, true);
    assert.equal(claim1.cleanCode, "SEMED1234");

    const claim2 = env.callHandler<{ ok: boolean; errorMessage: string }>(
      "ClaimPromoCode",
      "STU_2",
      { code: "SEMED-5678", studentId: "stu_2", nick: "ana" },
    );
    assert.equal(claim2.ok, false);
    assert.ok(claim2.errorMessage.includes("mesma leva/lote"));
  });

  it("Economia autoritativa valida preço de catálogo, saldo, estoque e registra EconomyLedger", () => {
    const env = createCloudScriptSandbox(["ADMIN_1"]);
    env.titleData.PlatformAdminConfig = JSON.stringify({
      avatarsCatalog: [{ id: "av_robo_ouro", name: "Robô Ouro", priceCoins: 150, enabled: true }],
      cardPacks: [{ id: "pack_beta", name: "Pacote Beta", priceCoins: 80, enabled: true, showInStore: true }],
    });
    env.userData.set("STU_1", {
      PlayerProfile: {
        Value: JSON.stringify({
          id: "STU_1",
          coins: 300,
          pointsBalance: 50,
          careerPoints: 50,
          unlockedAvatars: [],
          unopenedChests: { chest_ouro: 1 },
        }),
        LastUpdated: new Date().toISOString(),
      },
    });

    // Cliente tenta forjar preço 1 moeda -> servidor aplica priceCoins = 150 do catálogo!
    const buyAvatar = env.callHandler<{ ok: boolean; price: number; profile: { coins: number; unlockedAvatars: string[] } }>(
      "ServerPurchaseCosmetic",
      "STU_1",
      { itemId: "av_robo_ouro", kind: "avatar", currency: "coins", price: 1 },
    );
    assert.equal(buyAvatar.ok, true);
    assert.equal(buyAvatar.price, 150);
    assert.equal(buyAvatar.profile.coins, 150);
    assert.deepEqual(Array.from(buyAvatar.profile.unlockedAvatars), ["av_robo_ouro"]);

    // Compra 1 pacote (80 moedas -> sobra 70)
    const buyPack = env.callHandler<{ ok: boolean; profile: { coins: number; unopenedPacks: Record<string, number> } }>(
      "ServerPurchaseCardPack",
      "STU_1",
      { packId: "pack_beta", quantity: 1, unitPrice: 1 },
    );
    assert.equal(buyPack.ok, true);
    assert.equal(buyPack.profile.coins, 70);
    assert.equal(buyPack.profile.unopenedPacks.pack_beta, 1);

    // Abre pacote comprado
    const openPack = env.callHandler<{ ok: boolean; profile: { cards: Record<string, number>; unopenedPacks: Record<string, number> } }>(
      "ServerOpenCardPack",
      "STU_1",
      { packId: "pack_beta", cardIds: ["c1", "c2", "c1"] },
    );
    assert.equal(openPack.ok, true);
    assert.equal(openPack.profile.cards.c1, 2);
    assert.equal(openPack.profile.cards.c2, 1);
    assert.equal(openPack.profile.unopenedPacks.pack_beta, undefined);

    // Tentar abrir novamente falha por estoque zerado
    const openAgain = env.callHandler<{ ok: boolean }>(
      "ServerOpenCardPack",
      "STU_1",
      { packId: "pack_beta", cardIds: ["c1"] },
    );
    assert.equal(openAgain.ok, false);

    // Abre baú e registra EconomyLedger
    const openChest = env.callHandler<{ ok: boolean; profile: { coins: number; pointsBalance: number } }>(
      "ServerOpenChest",
      "STU_1",
      { chestId: "chest_ouro", rewards: { coins: 40, points: 15, packIds: ["pack_beta"] } },
    );
    assert.equal(openChest.ok, true);
    assert.equal(openChest.profile.coins, 110);
    assert.equal(openChest.profile.pointsBalance, 65);

    const ledgerRaw = env.userReadOnlyData.get("STU_1")!.EconomyLedger.Value;
    const ledger = JSON.parse(ledgerRaw) as Array<{ action: string }>;
    assert.equal(ledger.length, 4);
    assert.deepEqual(
      ledger.map((e) => e.action),
      ["purchase_cosmetic", "purchase_card_pack", "open_card_pack", "open_chest"],
    );
  });

  it("AdminPurgeStudentAccount executa exclusão LGPD completa de dados, SharedGroups, ban e auditoria", () => {
    const env = createCloudScriptSandbox(["ADMIN_1"]);
    const nowIso = new Date().toISOString();

    env.userData.set("PF_DEL", {
      PlayerProfile: { Value: '{"nick":"joao"}', LastUpdated: nowIso },
      GameStats: { Value: "[]", LastUpdated: nowIso },
    });
    env.userReadOnlyData.set("PF_DEL", {
      RankedLedger: { Value: "[]", LastUpdated: nowIso },
    });
    env.userInternalData.set("PF_DEL", {
      ClaimedPromoCodes: { Value: '["ABC"]', LastUpdated: nowIso },
    });
    env.sharedGroups.set("SEMED_STUDENT_ROSTER_V1", {
      stu_joao: { Value: "{}", LastUpdated: nowIso },
      stu_maria: { Value: "{}", LastUpdated: nowIso },
    });
    env.sharedGroups.set("TOURNAMENT_SEASON_3", {
      rnk_joao: { Value: "{}", LastUpdated: nowIso },
    });
    env.sharedGroups.set("SEMED_PRESENCE_V3", {
      pres_joao: { Value: "{}", LastUpdated: nowIso },
    });
    env.sharedGroups.set("SEMED_ADMIN_NOTIFICATIONS_V1", {
      inbox_read_joao_m1: { Value: "{}", LastUpdated: nowIso },
      inbox_claim_joao_m1: { Value: "{}", LastUpdated: nowIso },
      inbox_read_maria_m1: { Value: "{}", LastUpdated: nowIso },
    });
    env.sharedGroups.set("SEMED_GAME_RECORDS_V2", {
      Records: {
        Value: JSON.stringify({
          logica: {
            holders: [
              { playerId: "PF_DEL", nick: "joao", score: 400 },
              { playerId: "PF_MARIA", nick: "maria", score: 380 },
            ],
          },
        }),
        LastUpdated: nowIso,
      },
    });

    const denied = env.callHandler<{ ok: boolean }>("AdminPurgeStudentAccount", "PF_OUTRO", {
      targetPlayFabId: "PF_DEL",
    });
    assert.equal(denied.ok, false);

    const purge = env.callHandler<{
      ok: boolean;
      banned: boolean;
      cleanedGroups: string[];
    }>("AdminPurgeStudentAccount", "ADMIN_1", {
      targetPlayFabId: "PF_DEL",
      studentId: "PF_DEL",
      nickNormalized: "joao",
      rankedSeasonId: 3,
    });

    assert.equal(purge.ok, true);
    assert.equal(purge.banned, true);
    assert.equal(Object.keys(env.userData.get("PF_DEL")!).length, 0);
    assert.equal(Object.keys(env.userReadOnlyData.get("PF_DEL")!).length, 0);
    assert.equal(Object.keys(env.userInternalData.get("PF_DEL")!).length, 0);
    assert.equal(env.sharedGroups.get("SEMED_STUDENT_ROSTER_V1")!.stu_joao, undefined);
    assert.ok(env.sharedGroups.get("SEMED_STUDENT_ROSTER_V1")!.stu_maria);
    assert.equal(env.sharedGroups.get("TOURNAMENT_SEASON_3")!.rnk_joao, undefined);
    assert.equal(env.sharedGroups.get("SEMED_PRESENCE_V3")!.pres_joao, undefined);
    assert.equal(
      env.sharedGroups.get("SEMED_ADMIN_NOTIFICATIONS_V1")!.inbox_read_joao_m1,
      undefined,
    );
    assert.ok(env.sharedGroups.get("SEMED_ADMIN_NOTIFICATIONS_V1")!.inbox_read_maria_m1);

    const recordsAfter = JSON.parse(env.sharedGroups.get("SEMED_GAME_RECORDS_V2")!.Records.Value) as {
      logica: { holders: Array<{ playerId: string }> };
    };
    assert.equal(recordsAfter.logica.holders.length, 1);
    assert.equal(recordsAfter.logica.holders[0].playerId, "PF_MARIA");

    assert.equal(env.bannedUsers.length, 1);
    assert.equal(env.bannedUsers[0].PlayFabId, "PF_DEL");
    const log = JSON.parse(env.titleInternalData.LgpdPurgeLog) as Array<{ playFabId: string }>;
    assert.equal(log[0].playFabId, "PF_DEL");
  });

  it("wrappers de cliente cloudscript-v3 conectam ao servidor e respeitam fallback offline/admin-*", async () => {
    clearServerVerifiedAdminTickets();
    const env = createCloudScriptSandbox(["ADMIN_PF"]);

    const callBridge: PlayFabClientCallFn = async <T>(
      endpoint: string,
      body: Record<string, unknown>,
      ticket?: string,
    ) => {
      const playerId = ticket === "REAL_ADMIN_TK" ? "ADMIN_PF" : "STU_PF";
      if (endpoint === "ExecuteCloudScript") {
        const fn = String(body.FunctionName ?? "");
        const param = (body.FunctionParameter ?? {}) as Record<string, unknown>;
        const res = env.callHandler(fn, playerId, param);
        return { data: { FunctionResult: res } as T, error: null };
      }
      if (endpoint === "GetTitleData") {
        const res = env.sandbox.server.GetTitleData(body);
        return { data: res as T, error: null };
      }
      return { data: null, error: "Unsupported" };
    };

    // Tickets placeholder "admin-*" não disparam ExecuteCloudScript
    assert.equal(await verifyAdminSessionCloud(callBridge, "admin-josiney-session-ticket"), null);
    assert.equal(isServerVerifiedAdminTicket("REAL_ADMIN_TK"), false);

    const verified = await verifyAdminSessionCloud(callBridge, "REAL_ADMIN_TK");
    assert.equal(verified?.isAdmin, true);
    assert.equal(isServerVerifiedAdminTicket("REAL_ADMIN_TK"), true);

    const savedCfg = await saveAdminConfigViaCloudScript(
      callBridge,
      { configRevision: 0, masterCode: "M1" } as unknown as import("./game-codes.ts").PlatformAdminConfig,
      { domain: "all" },
      "REAL_ADMIN_TK",
    );
    assert.equal(savedCfg?.ok, true);
    assert.equal(savedCfg?.configRevision, 1);

    const fetchedCfg = await fetchTitleDataAdminConfig(callBridge, "STU_TK");
    assert.equal(fetchedCfg?.masterCode, "M1");

    const eco = await serverPurchaseCosmetic(
      callBridge,
      { itemId: "av_1", kind: "avatar", currency: "coins", price: 10 },
      "REAL_STU_TK",
    );
    assert.equal(eco?.ok, false); // saldo 0

    const purged = await purgeStudentViaCloudScript(
      callBridge,
      { targetPlayFabId: "PF_999", studentId: "PF_999", nickNormalized: "teste999" },
      "REAL_ADMIN_TK",
    );
    assert.equal(purged?.ok, true);
    assert.equal(purged?.banned, true);

    clearServerVerifiedAdminTickets();
    assert.equal(isServerVerifiedAdminTicket("REAL_ADMIN_TK"), false);
  });
});
