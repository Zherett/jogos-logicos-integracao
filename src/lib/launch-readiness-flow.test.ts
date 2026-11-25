import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __setPlayFabServerClockOffsetForTests,
  callPlayFabClient,
  claimCurrentPlayerDailyReward,
  formatUtcMsToOfficialDateKey,
  getLastAdminCloudSyncError,
  isBlockedRealPlayFabCallInTest,
  playfabRecoverByNameAndBirthdate,
  playfabSignIn,
  pushAdminConfigToPlayFab,
  reconcileCurrentPlayerFromCloudRoster,
  ROSTER_SHARED_GROUP_ID,
  runRetroactiveCoinsAudit,
  runRetroactiveDay1CheckInAudit,
  setCachedAdminPlayFabTicket,
  syncActiveProfileChangeToPlayFab,
  syncAdminConfigFromPlayFab,
  syncSinglePlayerFromPlayFab,
  type PlayerProfile,
} from "./playfab.ts";
import {
  canAccessDailyRoutine,
  canAccessShopAndCustomization,
  canUseDefaultAvatar,
  canViewCoinsWallet,
  getDailyRewardClaimState,
  getDayStatus,
  shiftDateKey,
} from "./daily-rewards.ts";
import {
  DEFAULT_ADMIN_CONFIG,
  saveAdminConfig,
  type PlatformAdminConfig,
} from "./game-codes.ts";
import { studentCustomId } from "./player-profile.ts";
import {
  mergeWithDefaultAuras,
  purchaseStoreCardPack,
  purchaseStoreCosmetic,
} from "./cosmetics-catalog.ts";
import { DEFAULT_CARD_PACKS } from "./cards-catalog.ts";

const REGISTRY_KEY = "desafios-playfab-registry-v1";
const SESSION_KEY = "desafios-playfab-session-v1";
const VIEWER_PF_ID = "1B2E1517154B2D49";
const VIEWER_TICKET = `${VIEWER_PF_ID}-186F63-VIEWER`;

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

interface FakeUserRecord {
  playfabId: string;
  username: string;
  password: string;
  customId?: string;
  sessionTicket: string;
  userData: Record<string, { Value: string; LastUpdated: string }>;
}

/**
 * Emulador fiel do PlayFab Client API para validar de ponta a ponta o dia de lançamento:
 * - Exige associação real ao ROSTER_SHARED_GROUP_ID (somente semedvisitante pode escrever, senão 403 NotAuthorized).
 * - Mantém UserData privado separado do Roster (reproduzindo a arquitetura real de produção).
 * - Suporta LoginWithPlayFab, LoginWithCustomID, GetUserData, UpdateUserData, GetSharedGroupData e UpdateSharedGroupData.
 */
function createLaunchPlayFabMock() {
  const usersByTicket = new Map<string, FakeUserRecord>();
  const usersByUsername = new Map<string, FakeUserRecord>();
  const usersByCustomId = new Map<string, FakeUserRecord>();
  const usersByPfId = new Map<string, FakeUserRecord>();

  const rosterMembers = new Set<string>([VIEWER_PF_ID]);
  const rosterData = new Map<string, { Value: string; LastUpdated: string }>();
  let forceRosterWriteError: { status: number; error: string; errorCode: number } | null = null;
  let serverTimeMsProvider: () => number = () => Date.now();
  let forceGetTimeError = false;

  const registerUser = (u: FakeUserRecord) => {
    usersByTicket.set(u.sessionTicket, u);
    usersByUsername.set(u.username.toLowerCase(), u);
    usersByPfId.set(u.playfabId, u);
    if (u.customId) usersByCustomId.set(u.customId, u);
  };

  // Registra a conta oficial dona da configuração global (semedvisitante = 1B2E1517154B2D49)
  registerUser({
    playfabId: VIEWER_PF_ID,
    username: "semedvisitante",
    password: "SemedVisitante2026",
    sessionTicket: VIEWER_TICKET,
    userData: {},
  });

  const ok = (data: unknown) =>
    new Response(JSON.stringify({ code: 200, status: "OK", data }), { status: 200 });
  const fail = (error: string, errorCode = 1000, status = 400) =>
    new Response(
      JSON.stringify({ code: status, status: "Error", error, errorCode, errorMessage: error }),
      { status },
    );

  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const endpoint = url.split("/Client/")[1] ?? "";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const ticket = headers["X-Authorization"] ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const nowIso = new Date().toISOString();

    if (endpoint === "LoginWithPlayFab") {
      const uname = String(body.Username ?? "").toLowerCase();
      if (uname === "semedvisitante") {
        return ok({ SessionTicket: VIEWER_TICKET, PlayFabId: VIEWER_PF_ID });
      }
      const user = usersByUsername.get(uname);
      if (!user || user.password !== String(body.Password ?? "")) {
        return fail("InvalidUsernameOrPassword", 1142, 400);
      }
      return ok({
        SessionTicket: user.sessionTicket,
        PlayFabId: user.playfabId,
        InfoResultPayload: {
          UserData: user.userData,
          PlayerStatistics: [],
          AccountInfo: {
            Username: user.username,
            TitleInfo: { DisplayName: user.username },
          },
        },
      });
    }

    if (endpoint === "LoginWithCustomID") {
      const cid = String(body.CustomId ?? "");
      const user = usersByCustomId.get(cid);
      if (!user) return fail("AccountNotFound", 1001, 400);
      return ok({
        SessionTicket: user.sessionTicket,
        PlayFabId: user.playfabId,
        InfoResultPayload: {
          UserData: user.userData,
          PlayerStatistics: [],
          AccountInfo: {
            Username: user.username,
            TitleInfo: { DisplayName: user.username },
          },
        },
      });
    }

    const callerPfId =
      ticket === VIEWER_TICKET ? VIEWER_PF_ID : usersByTicket.get(ticket)?.playfabId;
    if (!callerPfId) {
      return fail("NotAuthenticated", 1074, 401);
    }

    if (endpoint === "GetTime") {
      if (forceGetTimeError) {
        return fail("ServiceUnavailable", 1110, 503);
      }
      return ok({ Time: new Date(serverTimeMsProvider()).toISOString() });
    }

    if (endpoint === "GetUserData") {
      const targetPfId = String(body.PlayFabId ?? callerPfId);
      const user = usersByPfId.get(targetPfId);
      const data: Record<string, { Value: string; LastUpdated: string }> = {};
      if (user) {
        const keys: string[] | undefined = body.Keys;
        for (const [k, v] of Object.entries(user.userData)) {
          if (!keys || keys.includes(k)) data[k] = v;
        }
      }
      return ok({ Data: data });
    }

    if (endpoint === "UpdateUserData") {
      const user = usersByPfId.get(callerPfId);
      if (user && body.Data && typeof body.Data === "object") {
        for (const [k, v] of Object.entries(body.Data)) {
          user.userData[k] = { Value: String(v), LastUpdated: nowIso };
        }
      }
      return ok({ DataVersion: 1 });
    }

    if (endpoint === "GetSharedGroupData") {
      if (body.SharedGroupId === ROSTER_SHARED_GROUP_ID) {
        const keys: string[] | undefined = body.Keys;
        const out: Record<string, { Value: string; LastUpdated: string }> = {};
        for (const [k, v] of rosterData.entries()) {
          if (!keys || keys.includes(k)) out[k] = v;
        }
        return ok({ Data: out });
      }
      return ok({ Data: {} });
    }

    if (endpoint === "UpdateSharedGroupData") {
      if (body.SharedGroupId === ROSTER_SHARED_GROUP_ID) {
        if (forceRosterWriteError) {
          return fail(
            forceRosterWriteError.error,
            forceRosterWriteError.errorCode,
            forceRosterWriteError.status,
          );
        }
        if (!rosterMembers.has(callerPfId)) {
          return fail("NotAuthorized", 1075, 403);
        }
        if (body.Data && typeof body.Data === "object") {
          for (const [k, v] of Object.entries(body.Data)) {
            rosterData.set(k, { Value: String(v), LastUpdated: nowIso });
          }
        }
        return ok({});
      }
      return ok({});
    }

    return ok({});
  };

  return {
    fetchMock,
    registerUser,
    rosterData,
    usersByPfId,
    setForceRosterWriteError: (err: { status: number; error: string; errorCode: number } | null) => {
      forceRosterWriteError = err;
    },
    setServerTimeMs: (fn: () => number) => {
      serverTimeMsProvider = fn;
    },
    setForceGetTimeError: (flag: boolean) => {
      forceGetTimeError = flag;
    },
  };
}

function makeBaseProfile(overrides: Partial<PlayerProfile>): PlayerProfile {
  return {
    id: "pf_base",
    playfabId: "PF_BASE",
    nick: "BaseStudent",
    nickNormalized: "basestudent",
    full_name: "ALUNO BASE",
    school: "E.M. Raimundo da Silva",
    grade: "5º ano",
    turma: "A",
    birthdate: "2014-01-20",
    xp: 200,
    seasonXp: 200,
    level: 2,
    wins: 5,
    matchesPlayed: 8,
    pointsBalance: 100,
    careerPoints: 100,
    coins: 0,
    lifetimeCoins: 0,
    peakCoins: 0,
    coinsSpentTotal: 0,
    dailyCheckInCount: 0,
    badges: [],
    unlockedMedals: [],
    seasonId: 1,
    ...overrides,
  };
}

describe("Simulação Ponta-a-Ponta do Dia de Lançamento (Moedas + Dia 1 + Rollout + Nuvem)", () => {
  const originalWindow = (globalThis as any).window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const ls = createMemoryStorage();
    const ss = createMemoryStorage();
    (globalThis as any).window = {
      localStorage: ls,
      sessionStorage: ss,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    saveAdminConfig({ ...DEFAULT_ADMIN_CONFIG });
  });

  afterEach(() => {
    __setPlayFabServerClockOffsetForTests(null);
    (globalThis as any).window = originalWindow;
    globalThis.fetch = originalFetch;
  });

  it("executa a sequência oficial de lançamento sem vazar flags, sem duplicar prêmios e preservando inventário no PlayFab", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;
    const fixedServerUtcMs = Date.now();
    pf.setServerTimeMs(() => fixedServerUtcMs);

    const todayKey = formatUtcMsToOfficialDateKey(fixedServerUtcMs);
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const twoDaysAgoKey = shiftDateKey(todayKey, -2);
    const tenDaysAgoKey = shiftDateKey(todayKey, -10);
    const oldUserDataIso = `${yesterdayKey}T15:00:00.000Z`;

    // 3 perfis realistas com stats coerentes com suas medalhas (validados pelo anti-fraude do Roster):
    const statsAtivo1 = [
      {
        game_id: "logica" as const,
        mode: "padrao",
        plays: 40,
        wins: 25,
        flawless_wins: 5,
        best_score: 120,
        best_level: 3,
        last_played_at: `${yesterdayKey}T14:30:00.000Z`,
      },
    ];
    const statsAtivo2 = [
      {
        game_id: "logica" as const,
        mode: "padrao",
        plays: 100,
        wins: 60,
        flawless_wins: 10,
        best_score: 150,
        best_level: 3,
        last_played_at: `${twoDaysAgoKey}T10:00:00.000Z`,
      },
    ];
    const statsInativo = [
      {
        game_id: "logica" as const,
        mode: "padrao",
        plays: 10,
        wins: 5,
        flawless_wins: 1,
        best_score: 90,
        best_level: 2,
        last_played_at: `${tenDaysAgoKey}T09:00:00.000Z`,
      },
    ];

    const pAtivo1 = makeBaseProfile({
      id: "PF_ATIVO_1",
      playfabId: "PF_ATIVO_1",
      nick: "MariaAtiva",
      nickNormalized: "mariaativa",
      full_name: "MARIA SILVA",
      level: 1,
      xp: 40,
      seasonXp: 40,
      matchesPlayed: 40,
      wins: 25,
      lastActiveDate: yesterdayKey,
      lastDailyLoginPointsDate: yesterdayKey,
      activeDates: [yesterdayKey],
      lastKnownActivityAt: `${yesterdayKey}T14:30:00.000Z`,
      cards: { card_1: 2 },
      unopenedPacks: { pack_basico: 1 },
      unlockedMedals: [
        { medalId: "game_logica_matches_10", unlockedAt: oldUserDataIso, count: 1 }, // bronze (+5)
        { medalId: "game_logica_matches_20", unlockedAt: oldUserDataIso, count: 1 }, // prata (+10)
        { medalId: "game_logica_matches_40", unlockedAt: oldUserDataIso, count: 1 }, // ouro (+20)
      ],
    });

    const pAtivo2 = makeBaseProfile({
      id: "PF_ATIVO_2",
      playfabId: "PF_ATIVO_2",
      nick: "JoaoRecente",
      nickNormalized: "joaorecente",
      full_name: "JOAO SOUZA",
      level: 1,
      xp: 40,
      seasonXp: 40,
      matchesPlayed: 100,
      wins: 60,
      lastActiveDate: twoDaysAgoKey,
      lastDailyLoginPointsDate: twoDaysAgoKey,
      activeDates: [twoDaysAgoKey],
      lastKnownActivityAt: `${twoDaysAgoKey}T10:00:00.000Z`,
      unlockedMedals: [
        { medalId: "game_logica_matches_100", unlockedAt: oldUserDataIso, count: 1 }, // diamante (+50)
      ],
    });

    const pInativo = makeBaseProfile({
      id: "PF_INATIVO",
      playfabId: "PF_INATIVO",
      nick: "PedroSumido",
      nickNormalized: "pedrosumido",
      full_name: "PEDRO PEREIRA",
      level: 1,
      xp: 40,
      seasonXp: 40,
      matchesPlayed: 10,
      wins: 5,
      lastActiveDate: tenDaysAgoKey,
      lastDailyLoginPointsDate: tenDaysAgoKey,
      activeDates: [tenDaysAgoKey],
      lastKnownActivityAt: `${tenDaysAgoKey}T09:00:00.000Z`,
      unlockedMedals: [
        { medalId: "game_logica_matches_10", unlockedAt: `${tenDaysAgoKey}T09:00:00.000Z`, count: 1 }, // bronze (+5)
      ],
    });

    // Pré-lançamento: todas as 4 flags DESLIGADAS para alunos comuns e LIGADAS para ADM
    const preLaunchCfg = saveAdminConfig({ ...DEFAULT_ADMIN_CONFIG });
    assert.equal(canAccessDailyRoutine(pAtivo1, false, preLaunchCfg), false);
    assert.equal(canViewCoinsWallet(pAtivo1, false, preLaunchCfg), false);
    assert.equal(canUseDefaultAvatar(pAtivo1, false, preLaunchCfg), false);
    assert.equal(canAccessShopAndCustomization(pAtivo1, false, preLaunchCfg), false);
    assert.equal(canAccessDailyRoutine({ nick: "JOSINEY", isAdmin: true }, true, preLaunchCfg), true);

    // Popula UserData antigo (pré-auditoria) + Roster inicial no PlayFab simulado
    pf.registerUser({
      playfabId: "PF_ATIVO_1",
      username: "mariaativa",
      password: "200114",
      sessionTicket: "PF_ATIVO_1-186F63-TK1",
      userData: {
        PlayerProfile: {
          Value: JSON.stringify({ ...pAtivo1, updatedAt: oldUserDataIso }),
          LastUpdated: oldUserDataIso,
        },
        GameStats: { Value: JSON.stringify(statsAtivo1), LastUpdated: oldUserDataIso },
        UnlockedGames: { Value: "[]", LastUpdated: oldUserDataIso },
      },
    });

    // Calcula CustomId oficial para recuperação de conta por Nome + Data de Nascimento
    const recoveryCustomId = studentCustomId("JOAO SOUZA", "200114");
    pf.registerUser({
      playfabId: "PF_ATIVO_2",
      username: "joaorecente",
      password: "200114",
      customId: recoveryCustomId,
      sessionTicket: "PF_ATIVO_2-186F63-TK2",
      userData: {
        PlayerProfile: {
          Value: JSON.stringify({ ...pAtivo2, updatedAt: `${twoDaysAgoKey}T10:00:00.000Z` }),
          LastUpdated: `${twoDaysAgoKey}T10:00:00.000Z`,
        },
        GameStats: { Value: JSON.stringify(statsAtivo2), LastUpdated: `${twoDaysAgoKey}T10:00:00.000Z` },
        UnlockedGames: { Value: "[]", LastUpdated: `${twoDaysAgoKey}T10:00:00.000Z` },
      },
    });

    const rosterPairs = [
      { p: pAtivo1, stats: statsAtivo1 },
      { p: pAtivo2, stats: statsAtivo2 },
      { p: pInativo, stats: statsInativo },
    ];
    for (const { p, stats } of rosterPairs) {
      pf.rosterData.set(`stu_${p.nickNormalized}`, {
        Value: JSON.stringify({ ...p, stats, updatedAt: p.lastKnownActivityAt }),
        LastUpdated: p.lastKnownActivityAt!,
      });
    }

    // PASSO 1 DO LANÇAMENTO: Simular e Aplicar Retroatribuição de Moedas por Medalhas (1 única vez)
    // Tabela padrão: bronze=5, prata=10, ouro=15, diamante=50 -> Maria=30, João=50, Pedro=5 (total=85)
    const coinsDry = await runRetroactiveCoinsAudit({ dryRun: true });
    assert.equal(coinsDry.eligibleStudentsCount, 3);
    assert.equal(coinsDry.totalCoinsToAward, 30 + 50 + 5);
    const mariaDry = coinsDry.students.find((s) => s.nick === "MariaAtiva")!;
    const joaoDry = coinsDry.students.find((s) => s.nick === "JoaoRecente")!;
    assert.equal(mariaDry.coinsToAward, 30);
    assert.equal(joaoDry.coinsToAward, 50);

    const coinsApplied = await runRetroactiveCoinsAudit({ dryRun: false });
    assert.equal(coinsApplied.eligibleStudentsCount, 3);
    assert.equal(coinsApplied.totalCoinsToAward, coinsDry.totalCoinsToAward);
    assert.equal(coinsApplied.cloudPushedCount, 3);
    assert.equal(coinsApplied.cloudFailedCount, 0);
    assert.equal(coinsApplied.cloudSyncError, undefined);
    const mariaExpectedCoins = coinsApplied.students.find((s) => s.nick === "MariaAtiva")!.coinsAfter;
    const joaoExpectedCoins = coinsApplied.students.find((s) => s.nick === "JoaoRecente")!.coinsAfter;

    // Garante que o Roster na nuvem preservou cartas, pacotes fechados e última atividade de Maria
    const mariaRosterAfterCoins = JSON.parse(pf.rosterData.get("stu_mariaativa")!.Value);
    assert.equal(mariaRosterAfterCoins.coins, mariaExpectedCoins);
    assert.deepEqual(mariaRosterAfterCoins.cards, { card_1: 2 });
    assert.deepEqual(mariaRosterAfterCoins.unopenedPacks, { pack_basico: 1 });
    assert.equal(mariaRosterAfterCoins.lastKnownActivityAt, oldUserDataIso);

    // 2ª execução de Moedas é 100% idempotente
    const coinsSecond = await runRetroactiveCoinsAudit({ dryRun: false });
    assert.equal(coinsSecond.eligibleStudentsCount, 0);
    assert.equal(coinsSecond.totalCoinsToAward, 0);

    // PASSO 2 DO LANÇAMENTO (logo após Moedas!): Retrocoleta do Dia 1 (ativos nos últimos 3 dias)
    const day1Dry = await runRetroactiveDay1CheckInAudit({ dryRun: true, grantMissingRewards: true });
    assert.equal(day1Dry.eligibleStudentsCount, 2, "PedroSumido NÃO pode entrar mesmo após Moedas alterar acc.updatedAt");
    assert.equal(day1Dry.students.some((s) => s.nick === "PedroSumido"), false);

    const day1Applied = await runRetroactiveDay1CheckInAudit({ dryRun: false, grantMissingRewards: true });
    assert.equal(day1Applied.eligibleStudentsCount, 2);
    assert.equal(day1Applied.cloudPushedCount, 2);
    assert.equal(day1Applied.cloudFailedCount, 0);

    const mariaSummary = day1Applied.students.find((s) => s.nick === "MariaAtiva")!;
    const joaoSummary = day1Applied.students.find((s) => s.nick === "JoaoRecente")!;
    assert.equal(mariaSummary.pointsToAward, 0, "Maria já recebeu +25 pts no login de ontem");
    assert.equal(mariaSummary.xpToAward, 10);
    assert.equal(joaoSummary.pointsToAward, 25, "João não logou ontem, recebe +25 pts do Dia 1");
    assert.equal(joaoSummary.xpToAward, 10);

    // 2ª execução do Dia 1 é 100% idempotente
    const day1Second = await runRetroactiveDay1CheckInAudit({ dryRun: false, grantMissingRewards: true });
    assert.equal(day1Second.eligibleStudentsCount, 0);

    // PASSO 3 DO LANÇAMENTO: ADM liga as 4 chaves de liberação
    const liveCfg: PlatformAdminConfig = saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      rolloutFlags: {
        enableDailyRoutineForStudents: true,
        enableCoinsWalletForStudents: true,
        enableDefaultAvatarForStudents: true,
        enableShopForStudents: true,
      },
    });
    assert.equal(canAccessDailyRoutine(pAtivo1, false, liveCfg), true);
    assert.equal(canViewCoinsWallet(pAtivo1, false, liveCfg), true);
    assert.equal(canUseDefaultAvatar(pAtivo1, false, liveCfg), true);
    assert.equal(canAccessShopAndCustomization(pAtivo1, false, liveCfg), true);

    // PASSO 4: Maria entra em um DISPOSITIVO LIMPO via playfabSignIn (UserData ainda tinha coins=0 e dailyCheckInCount=0!)
    window.localStorage.clear();
    saveAdminConfig(liveCfg);
    const mariaLogin = await playfabSignIn("MariaAtiva", "200114");
    assert.equal(mariaLogin.error, null);
    assert.ok(mariaLogin.account);
    assert.equal(mariaLogin.account.profile.coins, mariaExpectedCoins, "Moedas retroativas preservadas no login em dispositivo limpo");
    assert.equal(mariaLogin.account.profile.dailyCheckInCount, 1);
    assert.equal(mariaLogin.account.profile.lastDailyRewardClaimDate, yesterdayKey);
    assert.ok(mariaLogin.account.profile.xp >= 50, "XP do Dia 1 preservado mesmo com UserData antigo");

    // Hoje, Maria vê Dia 1 Coletado e Dia 2 disponível para coleta manual
    const stateToday = getDailyRewardClaimState(mariaLogin.account.profile, todayKey);
    assert.equal(stateToday.isTodayClaimed, false);
    assert.equal(stateToday.currentDay, 2);
    assert.equal(getDayStatus(1, stateToday.currentDay, stateToday.isTodayClaimed), "collected");
    assert.equal(getDayStatus(2, stateToday.currentDay, stateToday.isTodayClaimed), "today");

    // Maria coleta manualmente o Dia 2 (exige sync no servidor)
    const claimDay2 = await claimCurrentPlayerDailyReward();
    assert.equal(claimDay2.ok, true);
    assert.equal(claimDay2.claimedDay, 2);
    assert.equal(claimDay2.profile?.dailyCheckInCount, 2);
    assert.equal(claimDay2.profile?.lastDailyRewardClaimDate, todayKey);

    // Tentativa duplicada no mesmo dia é bloqueada
    const claimDay2Dup = await claimCurrentPlayerDailyReward();
    assert.equal(claimDay2Dup.ok, false);
    assert.equal(claimDay2Dup.alreadyClaimed, true);

    // PASSO 5: João entra em um DISPOSITIVO LIMPO via Recuperação (Nome Completo + Data de Nascimento)
    window.localStorage.clear();
    saveAdminConfig(liveCfg);
    const joaoRec = await playfabRecoverByNameAndBirthdate("JOAO SOUZA", "2014-01-20");
    assert.equal(joaoRec.error, null);
    assert.ok(joaoRec.account);
    assert.equal(joaoRec.account.profile.coins, joaoExpectedCoins, "Moedas retroativas preservadas na recuperação por Nome+Data");
    assert.equal(joaoRec.account.profile.dailyCheckInCount, 1, "Dia 1 preservado na recuperação por Nome+Data");
    assert.ok((joaoRec.account.profile.pointsBalance ?? 0) >= 125, "+25 pts do Dia 1 preservados na recuperação");
    assert.ok(joaoRec.account.profile.xp >= 50, "+10 XP do Dia 1 preservados na recuperação");

    // Confirma que a recuperação NÃO sobrescreveu o Roster com zeros
    const joaoRosterAfterRec = JSON.parse(pf.rosterData.get("stu_joaorecente")!.Value);
    assert.equal(joaoRosterAfterRec.coins, joaoExpectedCoins);
    assert.equal(joaoRosterAfterRec.dailyCheckInCount, 1);
  });

  it("protege compras na Loja, desequipar Aura, sessão expirada e reporta falha real de nuvem nos lotes", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;

    const student = makeBaseProfile({
      id: "PF_SHOP",
      playfabId: "PF_SHOP",
      nick: "LucasLoja",
      nickNormalized: "lucasloja",
      full_name: "LUCAS MENDES",
      level: 1,
      xp: 40,
      seasonXp: 40,
      matchesPlayed: 1,
      wins: 1,
      coins: 200,
      lifetimeCoins: 200,
      peakCoins: 200,
      coinsSpentTotal: 0,
      unlockedMedals: [{ medalId: "first_match", unlockedAt: "2026-11-20T10:00:00.000Z", count: 1 }],
    });

    pf.registerUser({
      playfabId: "PF_SHOP",
      username: "lucasloja",
      password: "200114",
      sessionTicket: "PF_SHOP-186F63-TKS",
      userData: {
        PlayerProfile: {
          Value: JSON.stringify({ ...student, updatedAt: "2026-11-20T10:00:00.000Z" }),
          LastUpdated: "2026-11-20T10:00:00.000Z",
        },
        GameStats: { Value: "[]", LastUpdated: "2026-11-20T10:00:00.000Z" },
        UnlockedGames: { Value: "[]", LastUpdated: "2026-11-20T10:00:00.000Z" },
      },
    });
    pf.rosterData.set("stu_lucasloja", {
      Value: JSON.stringify({ ...student, updatedAt: "2026-11-20T10:00:00.000Z" }),
      LastUpdated: "2026-11-20T10:00:00.000Z",
    });

    const loginRes = await playfabSignIn("LucasLoja", "200114");
    assert.equal(loginRes.error, null);
    let current = loginRes.account!.profile;

    // 1. Compra pacote + aura na Loja
    const pack = DEFAULT_CARD_PACKS[0];
    const packPrice = Math.max(1, Math.floor(Number(pack.priceCoins) || 40));
    const buyPack = purchaseStoreCardPack(current, pack, 1);
    assert.equal(buyPack.ok, true);
    current = buyPack.profile;

    const aura = mergeWithDefaultAuras()[0];
    const buyAura = purchaseStoreCosmetic(current, "aura", aura);
    assert.equal(buyAura.ok, true);
    current = { ...buyAura.profile, equippedAuraId: aura.id };

    await syncActiveProfileChangeToPlayFab(current, { requireServerSync: true });
    // Recarrega o perfil atualizado (que também inclui +10 moedas das medalhas passivas coins_spent_50 e cosmetics_bought_1)
    const afterShopReg = JSON.parse(window.localStorage.getItem(REGISTRY_KEY)!);
    const afterShopProfile: PlayerProfile = afterShopReg.lucasloja.profile;
    const expectedCoinsAfterShopAndPassiveMedals =
      (afterShopProfile.lifetimeCoins ?? 200) - (packPrice + aura.priceCoins);
    assert.equal(afterShopProfile.coins, expectedCoinsAfterShopAndPassiveMedals);
    assert.equal(afterShopProfile.coinsSpentTotal, packPrice + aura.priceCoins);

    // 2. Desequipa a Aura (grava "") e força um Roster defasado com a aura antiga e moedas antigas (200)
    const unequipped = { ...afterShopProfile, equippedAuraId: "" };
    await syncActiveProfileChangeToPlayFab(unequipped, { requireServerSync: true });

    pf.rosterData.set("stu_lucasloja", {
      Value: JSON.stringify({
        ...student,
        coins: 200,
        lifetimeCoins: 200,
        coinsSpentTotal: 0,
        equippedAuraId: aura.id,
        updatedAt: "2026-11-20T10:00:00.000Z",
      }),
      LastUpdated: "2026-11-20T10:00:00.000Z",
    });

    const synced = await syncSinglePlayerFromPlayFab("lucasloja");
    assert.ok(synced);
    assert.equal(
      synced.coins,
      expectedCoinsAfterShopAndPassiveMedals,
      "Moedas gastas nunca podem ressuscitar no sync",
    );
    assert.equal(synced.equippedAuraId, "", "Aura desequipada não pode ressuscitar no sync");

    // 3. Sessão expirada (sem sessionTicket) bloqueia resgate diário sem mutar o perfil local
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ playerId: "lucasloja", playfabId: "PF_SHOP" }),
    );
    const expiredClaim = await claimCurrentPlayerDailyReward();
    assert.equal(expiredClaim.ok, false);
    const regAfterExpired = JSON.parse(window.localStorage.getItem(REGISTRY_KEY)!);
    assert.equal(regAfterExpired.lucasloja.profile.dailyCheckInCount ?? 0, 0);

    // 4. Falha HTTP 500 no PlayFab durante auditoria em lote é reportada com precisão (sem falso positivo)
    pf.setForceRosterWriteError({ status: 500, error: "InternalServerError", errorCode: 1110 });
    const failAudit = await runRetroactiveCoinsAudit({ dryRun: false });
    assert.equal(failAudit.cloudPushedCount, 0);
    assert.ok((failAudit.cloudFailedCount ?? 0) > 0);
    assert.ok(failAudit.cloudSyncError?.includes("InternalServerError"));
  });

  it("publica rolloutFlags no PlayFabId oficial (1B2E1517154B2D49) mesmo com ticket pessoal de ADM cacheado", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;

    // Simula ADM logado com conta própria (PlayFabId DIFERENTE de 1B2E1517154B2D49)
    pf.registerUser({
      playfabId: "FB6662558A38ACAD",
      username: "adminjosiney",
      password: "ADM",
      sessionTicket: "FB6662558A38ACAD-186F63-ADM",
      userData: {},
    });
    setCachedAdminPlayFabTicket("FB6662558A38ACAD-186F63-ADM");

    await pushAdminConfigToPlayFab({
      ...DEFAULT_ADMIN_CONFIG,
      rolloutFlags: {
        enableDailyRoutineForStudents: true,
        enableCoinsWalletForStudents: true,
        enableDefaultAvatarForStudents: true,
        enableShopForStudents: true,
      },
    });
    assert.equal(getLastAdminCloudSyncError(), null);

    // Garante que gravou na conta oficial dona do config (1B2E1517154B2D49) e NÃO na conta pessoal do ADM
    assert.ok(
      pf.usersByPfId.get(VIEWER_PF_ID)?.userData.PlatformAdminConfig?.Value,
      "PlatformAdminConfig deve ser gravado em 1B2E1517154B2D49",
    );
    assert.equal(
      pf.usersByPfId.get("FB6662558A38ACAD")?.userData.PlatformAdminConfig,
      undefined,
    );

    // Um aluno em dispositivo completamente limpo sincroniza e recebe todas as 4 flags ligadas!
    window.localStorage.clear();
    setCachedAdminPlayFabTicket(null);
    const syncedCfg = await syncAdminConfigFromPlayFab();
    assert.equal(syncedCfg.rolloutFlags?.enableDailyRoutineForStudents, true);
    assert.equal(syncedCfg.rolloutFlags?.enableCoinsWalletForStudents, true);
    assert.equal(syncedCfg.rolloutFlags?.enableDefaultAvatarForStudents, true);
    assert.equal(syncedCfg.rolloutFlags?.enableShopForStudents, true);
  });

  it("bloqueia fraude de adiantar o relógio do aparelho via PlayFab Client/GetTime e falha segura sem servidor", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;

    // Servidor PlayFab fixado em 2026-11-24 14:00 UTC (= 10:00 AM em Coari/AM UTC-4 -> "2026-11-24")
    const fixedServerUtcMs = Date.UTC(2026, 10, 24, 14, 0, 0);
    pf.setServerTimeMs(() => fixedServerUtcMs);
    const expectedServerDateKey = formatUtcMsToOfficialDateKey(fixedServerUtcMs);
    assert.equal(expectedServerDateKey, "2026-11-24");

    const cheater = makeBaseProfile({
      id: "PF_CLOCK",
      playfabId: "PF_CLOCK",
      nick: "RelogioEsperto",
      nickNormalized: "relogioesperto",
      full_name: "ALUNO RELOGIO",
      level: 1,
      xp: 40,
      seasonXp: 40,
      matchesPlayed: 1,
      wins: 1,
      dailyCheckInCount: 1,
      lastDailyRewardClaimDate: "2026-11-23",
    });

    pf.registerUser({
      playfabId: "PF_CLOCK",
      username: "relogioesperto",
      password: "200114",
      sessionTicket: "PF_CLOCK-186F63-TKC",
      userData: {
        PlayerProfile: {
          Value: JSON.stringify({ ...cheater, updatedAt: "2026-11-23T15:00:00.000Z" }),
          LastUpdated: "2026-11-23T15:00:00.000Z",
        },
        GameStats: { Value: "[]", LastUpdated: "2026-11-23T15:00:00.000Z" },
        UnlockedGames: { Value: "[]", LastUpdated: "2026-11-23T15:00:00.000Z" },
      },
    });

    const loginRes = await playfabSignIn("RelogioEsperto", "200114");
    assert.equal(loginRes.error, null);

    // 0. Com rolloutFlag OFF, resgate direto por aluno comum é bloqueado por segurança
    const blockedBeforeRollout = await claimCurrentPlayerDailyReward();
    assert.equal(blockedBeforeRollout.ok, false);

    // ADM libera a Central Diária para alunos
    saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      rolloutFlags: {
        ...DEFAULT_ADMIN_CONFIG.rolloutFlags,
        enableDailyRoutineForStudents: true,
      },
    });

    // 1. Coleta legítima do Dia 2 em 2026-11-24 (horário oficial do servidor)
    const claim1 = await claimCurrentPlayerDailyReward();
    assert.equal(claim1.ok, true);
    assert.equal(claim1.claimedDay, 2);
    assert.equal(claim1.profile?.lastDailyRewardClaimDate, "2026-11-24");

    // 2. Aluno tenta adiantar o relógio local em +5 dias (simulando troca manual da data no Android/Windows)
    const realDateNow = Date.now;
    try {
      Date.now = () => realDateNow() + 5 * 24 * 60 * 60 * 1000;
      const cheatAttempt = await claimCurrentPlayerDailyReward();
      assert.equal(cheatAttempt.ok, false, "Adiantar o relógio local NÃO pode liberar o Dia 3!");
      assert.equal(cheatAttempt.alreadyClaimed, true);
    } finally {
      Date.now = realDateNow;
    }

    // 3. Mesmo se o servidor GetTime estiver fora do ar, o resgate recusa em vez de confiar no relógio local
    pf.setServerTimeMs(() => fixedServerUtcMs + 24 * 60 * 60 * 1000); // dia seguinte
    pf.setForceGetTimeError(true);
    const offlineAttempt = await claimCurrentPlayerDailyReward();
    assert.equal(offlineAttempt.ok, false);
    assert.ok(offlineAttempt.error?.includes("data oficial"));

    // 4. Quando o servidor confirma realmente o dia seguinte (2026-11-25), o Dia 3 libera normalmente!
    pf.setForceGetTimeError(false);
    const nextDayClaim = await claimCurrentPlayerDailyReward();
    assert.equal(nextDayClaim.ok, true);
    assert.equal(nextDayClaim.claimedDay, 3);
    assert.equal(nextDayClaim.profile?.lastDailyRewardClaimDate, "2026-11-25");
  });

  it("reconcilia Retrocoleta do Dia 1 do Roster ANTES do resgate em sessão já aberta, coletando o Dia 2 em vez do Dia 1", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;
    const fixedServerUtcMs = Date.UTC(2026, 10, 24, 15, 0, 0); // 2026-11-24 11:00 UTC-4
    pf.setServerTimeMs(() => fixedServerUtcMs);

    const student = makeBaseProfile({
      id: "PF_ALREADY_LOGGED",
      playfabId: "PF_ALREADY_LOGGED",
      nick: "SessaoAberta",
      nickNormalized: "sessaoaberta",
      full_name: "ALUNO SESSAO ABERTA",
      xp: 40,
      seasonXp: 40,
      careerPoints: 50,
      pointsBalance: 50,
      activeDates: ["2026-11-23"],
      lastActiveDate: "2026-11-23",
      dailyCheckInCount: 0,
      lastDailyRewardClaimDate: undefined,
    });

    pf.registerUser({
      playfabId: "PF_ALREADY_LOGGED",
      username: "sessaoaberta",
      password: "200114",
      sessionTicket: "PF_ALREADY_LOGGED-186F63-TKS",
      userData: {
        PlayerProfile: {
          Value: JSON.stringify({ ...student, updatedAt: "2026-11-23T18:00:00.000Z" }),
          LastUpdated: "2026-11-23T18:00:00.000Z",
        },
        GameStats: { Value: "[]", LastUpdated: "2026-11-23T18:00:00.000Z" },
        UnlockedGames: { Value: "[]", LastUpdated: "2026-11-23T18:00:00.000Z" },
      },
    });

    saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      rolloutFlags: {
        ...DEFAULT_ADMIN_CONFIG.rolloutFlags,
        enableDailyRoutineForStudents: true,
      },
    });

    // Aluno faz login ANTES de o ADM aplicar a Retrocoleta do Dia 1
    const loginRes = await playfabSignIn("SessaoAberta", "200114");
    assert.equal(loginRes.error, null);
    assert.equal(loginRes.account?.profile.dailyCheckInCount, 0);

    // Enquanto o aluno continua logado, o ADM aplica a Retrocoleta do Dia 1 no Roster na nuvem
    pf.rosterData.set("stu_sessaoaberta", {
      Value: JSON.stringify({
        ...student,
        dailyCheckInCount: 1,
        lastDailyRewardClaimDate: "2026-11-23",
        retroactiveDay1GrantedAt: "2026-11-24T12:00:00.000Z",
        xp: 50,
        seasonXp: 50,
        updatedAt: "2026-11-24T12:00:00.000Z",
      }),
      LastUpdated: "2026-11-24T12:00:00.000Z",
    });

    // 1) Se o modal chamar reconcileCurrentPlayerFromCloudRoster, o cache local já avança para o Dia 2
    const storedSession = JSON.parse(window.localStorage.getItem(SESSION_KEY)!);
    const playerId = storedSession.playerId as string;
    const updatedOnOpen = await reconcileCurrentPlayerFromCloudRoster(true);
    assert.equal(updatedOnOpen, true);
    const regAfterOpen = JSON.parse(window.localStorage.getItem(REGISTRY_KEY)!);
    const profAfterOpen = regAfterOpen[playerId].profile as PlayerProfile;
    const stateAfterOpen = getDailyRewardClaimState(profAfterOpen, "2026-11-24");
    assert.equal(stateAfterOpen.currentDay, 2);
    assert.equal(stateAfterOpen.isTodayClaimed, false);

    // 2) Mesmo se o cache local estivesse defasado (sem ter aberto o modal), claimCurrentPlayerDailyReward
    // reconcilia antes de resgatar e entrega o Dia 2 (e não o Dia 1 novamente)
    regAfterOpen[playerId].profile.dailyCheckInCount = 0;
    regAfterOpen[playerId].profile.lastDailyRewardClaimDate = undefined;
    regAfterOpen[playerId].profile.retroactiveDay1GrantedAt = undefined;
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(regAfterOpen));

    const claimRes = await claimCurrentPlayerDailyReward();
    assert.equal(claimRes.ok, true);
    assert.equal(claimRes.claimedDay, 2, "Deve resgatar o Dia 2 após reconciliar a retrocoleta do Roster");
    assert.equal(claimRes.profile?.dailyCheckInCount, 2);
    assert.equal(claimRes.profile?.lastDailyRewardClaimDate, "2026-11-24");
    assert.equal(claimRes.streakBonusPoints, 5, "2º dia seguido deve conceder bônus de ofensiva (+5 pts)");
  });

  it("blinda cardsCatalog em chaves dedicadas com anti-wipe, isolamento entre abas e parse resiliente", async () => {
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;

    const sampleCards = Array.from({ length: 6 }, (_, i) => ({
      id: `card_shield_${i}`,
      name: `Carta Blindada ${i}`,
      description: `Descrição segura da carta ${i}`,
      rarity: "rara" as const,
      imageUrl: `https://example.com/c_${i}.png`,
      imageFit: "contain-blur" as const,
      colorVariant: 1 as const,
      isFoil: i % 2 === 0,
      createdAt: "2026-11-24T00:00:00.000Z",
      updatedAt: "2026-11-24T00:00:00.000Z",
    }));

    // 1. Publica catálogo de cartas pela aba Cartas & Pacotes (allowCardsCatalogWrite: true)
    await pushAdminConfigToPlayFab(
      {
        ...DEFAULT_ADMIN_CONFIG,
        cardsCatalog: sampleCards,
      },
      { allowCardsCatalogWrite: true },
    );
    assert.equal(getLastAdminCloudSyncError(), null);

    const viewerData = pf.usersByPfId.get(VIEWER_PF_ID)!.userData;
    assert.ok(viewerData.PlatformAdminCardsMeta?.Value, "Deve gravar PlatformAdminCardsMeta");
    assert.ok(viewerData.PlatformAdminCards_0?.Value, "Deve gravar PlatformAdminCards_0");
    // PlatformAdminCatalogs não mistura mais cardsCatalog quando gravado em chaves dedicadas
    const catJson = JSON.parse(viewerData.PlatformAdminCatalogs.Value);
    assert.equal(catJson.cardsCatalog, undefined);

    // 2. Outra aba (ex.: Correio / Torneio / Rotina) salva com cardsCatalog: [] (sem allowCardsCatalogWrite)
    //    -> NÃO pode apagar o catálogo de cartas na nuvem!
    await pushAdminConfigToPlayFab({
      ...DEFAULT_ADMIN_CONFIG,
      cardsCatalog: [],
      rolloutFlags: {
        enableDailyRoutineForStudents: true,
        enableCoinsWalletForStudents: true,
        enableDefaultAvatarForStudents: true,
        enableShopForStudents: true,
      },
    });
    assert.equal(getLastAdminCloudSyncError(), null);

    // Dispositivo limpo sincroniza e recupera TODAS as 6 cartas + as novas rolloutFlags!
    window.localStorage.clear();
    const syncedAfterOtherTab = await syncAdminConfigFromPlayFab();
    assert.equal(syncedAfterOtherTab.cardsCatalog?.length, 6);
    assert.equal(syncedAfterOtherTab.rolloutFlags?.enableShopForStudents, true);

    // 3. Mesmo com allowCardsCatalogWrite: true, tentar enviar 0 cartas sem allowEmptyCardsCatalog é bloqueado!
    await pushAdminConfigToPlayFab(
      {
        ...DEFAULT_ADMIN_CONFIG,
        cardsCatalog: [],
      },
      { allowCardsCatalogWrite: true },
    );
    assert.ok(
      getLastAdminCloudSyncError()?.includes("Proteção anti-perda"),
      "Deve bloquear apagamento acidental com catálogo vazio",
    );
    window.localStorage.clear();
    const syncedAfterBlockedWipe = await syncAdminConfigFromPlayFab();
    assert.equal(syncedAfterBlockedWipe.cardsCatalog?.length, 6);

    // 4. Corromper PlatformAdminInbox no servidor NÃO pode impedir leitura de cardsCatalog!
    viewerData.PlatformAdminInbox = { Value: "{json-quebrado", LastUpdated: "2026-11-24T12:00:00.000Z" };
    window.localStorage.clear();
    const syncedWithBrokenInbox = await syncAdminConfigFromPlayFab();
    assert.equal(syncedWithBrokenInbox.cardsCatalog?.length, 6);

    // 5. Esvaziamento explícito (allowEmptyCardsCatalog: true) é permitido quando confirmado pelo ADM
    await pushAdminConfigToPlayFab(
      {
        ...DEFAULT_ADMIN_CONFIG,
        cardsCatalog: [],
      },
      { allowCardsCatalogWrite: true, allowEmptyCardsCatalog: true },
    );
    assert.equal(getLastAdminCloudSyncError(), null);
    window.localStorage.clear();
    const syncedAfterExplicitClear = await syncAdminConfigFromPlayFab();
    assert.equal(syncedAfterExplicitClear.cardsCatalog?.length, 0);
  });

  it("bloqueia chamadas reais ao PlayFab em testes sem mock e protege domínios ADM contra Lost Update", async () => {
    // 1. Com globalThis.fetch nativo (sem mock), callPlayFabClient DEVE bloquear antes de tocar na rede!
    globalThis.fetch = originalFetch;
    assert.equal(isBlockedRealPlayFabCallInTest(), true);
    const blockedRes = await callPlayFabClient("GetTime", {});
    assert.equal(blockedRes.errorCode, "RealPlayFabBlockedInTest");

    // 2. Com mock ativo, dois ADMs salvando domínios diferentes preservam ambos os dados e avançam configRevision
    const pf = createLaunchPlayFabMock();
    globalThis.fetch = pf.fetchMock;
    assert.equal(isBlockedRealPlayFabCallInTest(), false);

    // ADM 1 salva eventos e avisos
    await pushAdminConfigToPlayFab(
      {
        ...DEFAULT_ADMIN_CONFIG,
        specialEvents: [{ id: "ev_1", title: "Semana da Lógica" } as any],
        noticeSlides: [
          {
            id: "not_1",
            title: "Aviso Importante",
            message: "Participe!",
            type: "announcement",
            active: true,
            createdAt: "2026-11-25T00:00:00.000Z",
          },
        ],
        inboxMessages: [{ id: "m_1", title: "Comunicado 1" }, { id: "m_2", title: "Comunicado 2" }],
      },
      { domain: "all" },
    );

    // ADM 2 (em outro dispositivo com draft desatualizado sem eventos/avisos/mensagens) salva apenas na aba Rotina
    await pushAdminConfigToPlayFab(
      {
        ...DEFAULT_ADMIN_CONFIG,
        specialEvents: [],
        noticeSlides: [],
        inboxMessages: [],
        rankedSeasonId: 99, // tentativa acidental fora de domain: "season"
        rolloutFlags: {
          enableDailyRoutineForStudents: true,
          enableCoinsWalletForStudents: true,
          enableDefaultAvatarForStudents: true,
          enableShopForStudents: true,
        },
      },
      { domain: "routine" },
    );

    window.localStorage.clear();
    const synced = await syncAdminConfigFromPlayFab();
    assert.equal(synced.rolloutFlags?.enableShopForStudents, true);
    assert.equal(synced.specialEvents?.length, 1, "Eventos do ADM 1 devem permanecer intactos");
    assert.equal(synced.noticeSlides?.length, 1, "Avisos do ADM 1 devem permanecer intactos");
    assert.equal(synced.inboxMessages?.length, 2, "Mensagens do ADM 1 devem permanecer intactas");
    assert.equal(synced.rankedSeasonId, 1, "Temporada não pode ser alterada fora de domain='season'");
    assert.ok((synced.configRevision ?? 0) >= 2, "configRevision deve avançar monotonicamente");
  });
});
