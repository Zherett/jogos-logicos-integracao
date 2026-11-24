import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ADMIN_CONFIG, saveAdminConfig } from "./game-codes.ts";
import {
  canAccessDailyRoutine,
  canAccessShopAndCustomization,
  canUseDefaultAvatar,
  canViewCoinsWallet,
  claimDailyRewardForProfile,
} from "./daily-rewards.ts";
import {
  isAdminOrTestAccount,
  isReservedPlayerNick,
} from "./player-profile.ts";
import {
  DEFAULT_AVATAR_ID,
  DEFAULT_AVATARS,
  extractCustomAurasForStorage,
  extractCustomAvatarsForStorage,
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  purchaseStoreCardPack,
  purchaseStoreCosmetic,
} from "./cosmetics-catalog.ts";
import { DEFAULT_CARD_PACKS } from "./cards-catalog.ts";
import {
  calculateDuplicateCosmeticCompensation,
  consumeAndOpenChestsBatch,
  DEFAULT_CHESTS,
  DUPLICATE_COSMETIC_MIN_COINS,
  normalizeCardPackId,
} from "./chests-catalog.ts";
import {
  awardCoins,
  creditCoinMetrics,
  sanitizeInflatedCareerPoints,
} from "./career-points.ts";
import { recordMatchIntoDailyMissions } from "./daily-missions.ts";
import { recordMatchIntoWeeklyMissions } from "./weekly-missions.ts";
import {
  finalizeRankedSeasonAndAwardMedalsViaInbox,
  getWeekInfo,
  recordWeeklyTournamentAttempt,
  type WeeklyTournamentStore,
} from "./weekly-tournament.ts";
import {
  claimPromoCode,
  generatePromoCodesBatch,
  getPromoCodesSnapshot,
  inspectPromoCode,
  restorePromoCodesSnapshot,
} from "./promo-codes.ts";
import {
  claimInboxReward,
  clearMemoryInboxMessages,
  commitInboxClaimLocally,
  createInboxMessage,
  deleteInboxMessageForPlayer,
  getInboxMessagesForPlayer,
} from "./inbox-messages.ts";
import { saveSpecialEvents, type SpecialEvent } from "./custom-events.ts";
import {
  __setPlayFabServerClockOffsetForTests,
  ensurePlayerSeasonAligned,
  getAuthoritativeDateKey,
  getAuthoritativeNow,
  playfabRecordMatch,
  playfabSignUp,
  syncActiveProfileChangeToPlayFab,
  type PlayerProfile,
  type StoredAccount,
} from "./playfab.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

function makeStudent(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "stu_teste",
    nick: "AlunoTeste",
    nickNormalized: "alunoteste",
    full_name: "ALUNO TESTE DA SILVA",
    school: "E.M. Prof. Raimundo",
    grade: "6º ano",
    birthdate: "2014-05-10",
    xp: 350,
    seasonXp: 350,
    seasonId: 1,
    rankedSeasonId: 1,
    level: 2,
    wins: 6,
    matchesPlayed: 10,
    distinctGamesPlayed: 3,
    pointsBalance: 250,
    careerPoints: 250,
    coins: 50,
    lifetimeCoins: 50,
    peakCoins: 50,
    coinsSpentTotal: 0,
    badges: [],
    unlockedMedals: [],
    ...overrides,
  };
}

describe("Regressão da Auditoria Profunda Pré-Lançamento (Waves 1-4)", () => {
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
      CustomEvent: class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    };
    clearMemoryInboxMessages();
    restorePromoCodesSnapshot(null);
    __setPlayFabServerClockOffsetForTests(null);
  });

  afterEach(() => {
    __setPlayFabServerClockOffsetForTests(null);
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it("mantém todas as 4 rolloutFlags OFF por padrão e acopla Avatar quando a Loja é ligada", () => {
    const flags = DEFAULT_ADMIN_CONFIG.rolloutFlags ?? {};
    assert.equal(Boolean(flags.enableDailyRoutineForStudents), false);
    assert.equal(Boolean(flags.enableCoinsWalletForStudents), false);
    assert.equal(Boolean(flags.enableDefaultAvatarForStudents), false);
    assert.equal(Boolean(flags.enableShopForStudents), false);

    const student = makeStudent();
    assert.equal(canAccessDailyRoutine(student, false, DEFAULT_ADMIN_CONFIG), false);
    assert.equal(canViewCoinsWallet(student, false, DEFAULT_ADMIN_CONFIG), false);
    assert.equal(canUseDefaultAvatar(student, false, DEFAULT_ADMIN_CONFIG), false);
    assert.equal(canAccessShopAndCustomization(student, false, DEFAULT_ADMIN_CONFIG), false);

    // Se ADM ligar enableShopForStudents, Avatar também fica habilitado para evitar experiência quebrada
    const shopOnlyCfg = {
      ...DEFAULT_ADMIN_CONFIG,
      rolloutFlags: { enableShopForStudents: true },
    };
    assert.equal(canUseDefaultAvatar(student, false, shopOnlyCfg), true);
  });

  it("bloqueia bypass por substring em isAdminOrTestAccount e cadastro com apelidos reservados", async () => {
    // Substring bypass deve retornar FALSE
    assert.equal(isAdminOrTestAccount({ nick: "pedro_lord", isAdmin: false }), false);
    assert.equal(isAdminOrTestAccount({ nick: "joao_admin", isAdmin: false }), false);
    assert.equal(isAdminOrTestAccount({ nick: "maria_zheret_2", isAdmin: false }), false);
    assert.equal(isAdminOrTestAccount({ nick: "lucas_semed", isAdmin: false }), false);

    // Apenas slugs exatos oficiais são aceitos
    assert.equal(isAdminOrTestAccount({ nick: "JOSINEY", isAdmin: false }), true);
    assert.equal(isAdminOrTestAccount({ nick: "QUEMUEL", isAdmin: false }), true);
    assert.equal(isAdminOrTestAccount({ nick: "ZHERET", isAdmin: false }), true);
    assert.equal(isAdminOrTestAccount({ nick: "LORD", isAdmin: false }), true);

    // Apelidos reservados bloqueados no cadastro
    assert.equal(isReservedPlayerNick("admin"), true);
    assert.equal(isReservedPlayerNick("semed_admin"), true);
    assert.equal(isReservedPlayerNick("semedvisitante"), true);
    assert.equal(isReservedPlayerNick("JOSINEY"), true);
    assert.equal(isReservedPlayerNick("LucasCoari"), false);

    const blockedSignUp = await playfabSignUp({
      nick: "semed_admin",
      fullName: "Aluno Curioso",
      school: "E.M. Prof. Raimundo",
      grade: "6º ano",
      birthdate: "2014-05-10",
    });
    assert.equal(blockedSignUp.account, null);
    assert.ok(blockedSignUp.error);
  });

  it("valida referências de pacotes em DEFAULT_CHESTS, trava compras inválidas e compensa cosmético duplicado", () => {
    const validPackIds = new Set(DEFAULT_CARD_PACKS.map((p) => p.id));
    for (const chest of DEFAULT_CHESTS) {
      for (const drop of chest.rewards.cardPacks ?? []) {
        assert.ok(
          validPackIds.has(drop.packId),
          `Baú ${chest.id} referencia pacote inexistente: ${drop.packId}`,
        );
      }
    }
    assert.equal(normalizeCardPackId("pack_avancado"), "pack_mestre");
    assert.equal(normalizeCardPackId("pack_epico"), "pack_mestre");
    assert.equal(normalizeCardPackId("pack_lendario"), "pack_supremo");

    // Quantidades e preços inválidos na Loja devem ser rejeitados
    const pack = { ...DEFAULT_CARD_PACKS[0], priceCoins: 40 };
    assert.equal(purchaseStoreCardPack({ coins: 500 }, pack, Number.NaN).ok, false);
    assert.equal(purchaseStoreCardPack({ coins: 500 }, pack, -2).ok, false);
    assert.equal(purchaseStoreCardPack({ coins: 500 }, pack, 1.5).ok, false);
    assert.equal(purchaseStoreCardPack({ coins: 500 }, { ...pack, showInStore: false }, 1).ok, false);
    assert.equal(purchaseStoreCardPack({ coins: 500 }, { ...pack, priceCoins: 0 }, 1).ok, false);

    const avatar = DEFAULT_AVATARS.find((a) => a.priceCoins > 0)!;
    assert.equal(purchaseStoreCosmetic({ coins: 500 }, "avatar", { ...avatar, priceCoins: 0 }).ok, false);
    const okBuy = purchaseStoreCosmetic({ coins: 500 }, "avatar", avatar);
    assert.equal(okBuy.ok, true);
    assert.equal(okBuy.pricePaid, avatar.priceCoins);

    // Baú em lote rejeita quantidade inválida
    const badChestBatch = consumeAndOpenChestsBatch(DEFAULT_CHESTS[0], Number.NaN, {
      [DEFAULT_CHESTS[0].id]: 2,
    });
    assert.equal(badChestBatch.ok, false);

    // Compensação de cosmético duplicado = max(25, 50% do preço)
    assert.equal(calculateDuplicateCosmeticCompensation(100), 50);
    assert.equal(calculateDuplicateCosmeticCompensation(30), DUPLICATE_COSMETIC_MIN_COINS);

    // Invariante lifetimeCoins >= coins + coinsSpentTotal
    const prof = makeStudent({ coins: 80, lifetimeCoins: 40, coinsSpentTotal: 50 });
    creditCoinMetrics(prof, 20);
    assert.equal(prof.coins, 100);
    assert.ok((prof.lifetimeCoins ?? 0) >= (prof.coins ?? 0) + (prof.coinsSpentTotal ?? 0));
    awardCoins(prof, Number.NaN, "Teste NaN");
    assert.equal(prof.coins, 100);

    // Compactação de catálogos padrão para economizar cota de 100 KB do PlayFab
    assert.equal(extractCustomAvatarsForStorage(mergeWithDefaultAvatars()).length, 0);
    assert.equal(extractCustomAurasForStorage(mergeWithDefaultAuras()).length, 0);
    const modified = mergeWithDefaultAvatars().map((a) =>
      a.id === DEFAULT_AVATAR_ID ? a : a.id === avatar.id ? { ...a, priceCoins: 999 } : a,
    );
    assert.equal(extractCustomAvatarsForStorage(modified).length, 1);
  });

  it("não confisca XP/pontos de rotina nem causa loop de moedas em best_level === 3 e preserva Nível 5+", async () => {
    // 1. best_level === 3 deve preservar game_logica_lvl_master sem loop de moedas
    const studentLvl3 = makeStudent({
      level: 3,
      xp: 900,
      seasonXp: 900,
      matchesPlayed: 15,
      wins: 10,
      pointsBalance: 800,
      careerPoints: 800,
      dailyCheckInCount: 7,
      dailyMissionsCompleted: 10,
      weeklyMissionsCompleted: 4,
      chestsOpenedTotal: 2,
      unlockedMedals: [
        { medalId: "game_logica_lvl_master", unlockedAt: "2026-11-20T10:00:00.000Z" },
      ],
      coinRewardedMedalIds: { game_logica_lvl_master: 1 },
      stats: [
        { game_id: "logica", mode: "padrao", plays: 15, wins: 10, best_score: 200, best_level: 3 },
      ],
    });
    sanitizeInflatedCareerPoints(studentLvl3);
    assert.ok(
      studentLvl3.unlockedMedals?.some((m) => m.medalId === "game_logica_lvl_master"),
      "Medalha lvl_master com best_level === 3 nunca pode ser removida",
    );
    assert.equal(studentLvl3.careerPoints, 800, "Pontos legítimos de rotina/missões não devem ser confiscados");

    // 2. Nível 5 não pode regredir para Nível 1 ao salvar perfil via syncActiveProfileChangeToPlayFab
    const regKey = "desafios-playfab-registry-v1";
    const sessKey = "desafios-playfab-session-v1";
    const lvl5Student = makeStudent({
      id: "lvl5_student",
      nick: "NivelCinco",
      nickNormalized: "nivelcinco",
      level: 5,
      xp: 2600,
      seasonXp: 2600,
      matchesPlayed: 60,
      wins: 45,
      distinctGamesPlayed: 6,
      coins: 120,
      lifetimeCoins: 120,
      coinsSpentTotal: 0,
    });
    const acc: StoredAccount = {
      profile: lvl5Student,
      passwordHash: "h",
      unlocked: ["logica", "minado", "rpg"],
      stats: [{ game_id: "logica", mode: "padrao", plays: 60, wins: 45, best_score: 300, best_level: 3 }],
      updatedAt: "2026-11-23T12:00:00.000Z",
    };
    window.localStorage.setItem(regKey, JSON.stringify({ nivelcinco: acc }));
    window.localStorage.setItem(sessKey, JSON.stringify({ playerId: "nivelcinco" }));

    // Executa sem PlayFab remoto (sem fetch real) para validar apenas a persistência local e grantPassiveMedalsForAccount
    const alignedBefore = ensurePlayerSeasonAligned(structuredClone(acc), DEFAULT_ADMIN_CONFIG);
    assert.ok(alignedBefore.profile.level >= 5);

    const updated = { ...lvl5Student, equippedAvatar: { id: DEFAULT_AVATAR_ID, color: "#3b82f6" } };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 200, status: "OK", data: {} }), { status: 200 })) as any;
    await syncActiveProfileChangeToPlayFab(updated);
    const savedReg = JSON.parse(window.localStorage.getItem(regKey)!);
    assert.ok(
      savedReg.nivelcinco.profile.level >= 5,
      `Nível 5 não pode regredir após grantPassiveMedalsForAccount (ficou ${savedReg.nivelcinco.profile.level})`,
    );
  });

  it("executa playfabRecordMatch com Evento Especial ativo sem ReferenceError e rastreia winsCount/rankedMatchesCount", async () => {
    const regKey = "desafios-playfab-registry-v1";
    const sessKey = "desafios-playfab-session-v1";
    const student = makeStudent({
      id: "ev_student",
      nick: "AlunoEvento",
      nickNormalized: "alunoevento",
      level: 3,
      xp: 450,
      seasonXp: 450,
    });
    const acc: StoredAccount = {
      profile: student,
      passwordHash: "h",
      unlocked: ["logica"],
      stats: [],
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(regKey, JSON.stringify({ alunoevento: acc }));
    window.localStorage.setItem(sessKey, JSON.stringify({ playerId: "alunoevento" }));

    const now = new Date();
    const activeEv: SpecialEvent = {
      id: "ev_regressao_ativo",
      title: "Evento Teste Regressão",
      description: "Teste de integridade durante partida",
      scope: "todos",
      bonusType: "personalizado",
      xpMultiplier: 2,
      startsAt: new Date(now.getTime() - 3600_000).toISOString(),
      endsAt: new Date(now.getTime() + 3600_000).toISOString(),
      active: true,
      rewardObjective: { type: "wins", target: 1 },
      rewards: [{ id: "rew_ev_1", type: "coins", amount: 50 }],
      createdAt: now.toISOString(),
    };
    saveSpecialEvents([activeEv]);
    saveAdminConfig({
      ...DEFAULT_ADMIN_CONFIG,
      specialEvents: [activeEv],
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 200, status: "OK", data: {} }), { status: 200 })) as any;

    const result = await playfabRecordMatch({
      gameId: "logica",
      score: 120,
      level: 2,
      correct: 8,
      wrong: 1,
      won: true,
      mode: "torneio_semanal",
    });

    assert.ok(result, "Partida durante evento ativo deve retornar resultado");
    assert.ok(result.profile, "Partida durante evento ativo deve concluir sem erro");
    const evProg = result.profile.eventProgress?.ev_regressao_ativo;
    assert.ok(evProg);
    assert.equal(evProg.winsCount, 1);
    assert.equal(evProg.rankedMatchesCount, 1);
  });

  it("corrige semana ISO-8601 na virada de ano, bloqueia AFK no torneio/missões e evita duplicata de carta do pódio", async () => {
    // 1. ISO-8601 week consistency across year boundary (2026-12-31 Thu & 2027-01-01 Fri -> both 2026-W53)
    const wDec31 = getWeekInfo(new Date(2026, 11, 31, 12, 0, 0));
    const wJan01 = getWeekInfo(new Date(2027, 0, 1, 12, 0, 0));
    assert.equal(wDec31.weekKey, wJan01.weekKey);

    // 2. AFK zero-effort no Torneio Ranqueado ganha 0 pontos e não conta como perfeita
    const student = makeStudent({ id: "afk_1", nick: "AfkTeste", nickNormalized: "afkteste", level: 4 });
    const afkRes = await recordWeeklyTournamentAttempt({
      profile: student,
      score: 0,
      correct: 0,
      wrong: 0,
    });
    assert.equal(afkRes.pointsDelta, 0);

    // Participação real com erros mantém piso de 1 ponto
    const realRes = await recordWeeklyTournamentAttempt({
      profile: student,
      score: 0,
      correct: 0,
      wrong: 12,
    });
    assert.equal(realRes.pointsDelta, 1);

    // 3. Missões diárias e semanais ignoram partidas sem participação real
    const dailyProg = recordMatchIntoDailyMissions(undefined, {
      gameId: "minado",
      mode: "padrao",
      won: false,
      flawless: false,
      hasRealParticipation: false,
      dateKey: "2026-11-24",
    });
    assert.equal(dailyProg.plays, 0);

    const weeklyProg = recordMatchIntoWeeklyMissions(undefined, {
      gameId: "minado",
      mode: "padrao",
      earnedXp: 0,
      hasRealParticipation: false,
      weekKey: "2026-W48",
    });
    assert.equal(weeklyProg.matches, 0);

    // 4. Fechamento da temporada envia EXATAMENTE 1 mensagem por vencedor (não 2)
    const mockStore: WeeklyTournamentStore = {
      seasonId: 2,
      weekKey: "2026-W48",
      gameId: "logica",
      records: {
        campeao_unico: {
          playerId: "pf_campeao_unico",
          nick: "CampeaoUnico",
          fullName: "CAMPEAO UNICO",
          school: "E.M. Prof. Raimundo",
          age: 12,
          stage: "etapa_2",
          level: 6,
          bestScore: 220,
          totalEntries: 15,
          tournamentPoints: 220,
          activeTop5Since: null,
          accumulatedTop5Ms: 60_000,
          updatedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    };
    await finalizeRankedSeasonAndAwardMedalsViaInbox(2, mockStore);
    const champProfile = makeStudent({
      id: "pf_campeao_unico",
      nick: "CampeaoUnico",
      nickNormalized: "campeaounico",
    });
    const inboxMsgs = getInboxMessagesForPlayer(champProfile).filter((m) =>
      m.title.includes("Temporada 2"),
    );
    assert.equal(inboxMsgs.length, 1, "Cada vencedor deve receber exatamente 1 carta oficial no correio");
  });

  it("entrega baús/moedas em códigos promocionais, faz rollback de memória e valida commit adiado no Correio", () => {
    // 1. Promo code com baú e moedas + rollback atômico do cache em memória
    const batch = generatePromoCodesBatch({
      batchName: "Lote Baú Regressão",
      pattern: "padrao_1",
      count: 1,
      createdBy: "ADM",
      rewards: {
        xp: 20,
        points: 30,
        coins: 45,
        chestName: DEFAULT_CHESTS[0].name,
        chestQuantity: 2,
        rewardItem: {
          category: "chest",
          itemId: DEFAULT_CHESTS[0].id,
          label: DEFAULT_CHESTS[0].name,
          quantity: 2,
        },
      },
    });
    const code = batch[0].code;
    const prevRaw = getPromoCodesSnapshot();

    const stu = makeStudent({ id: "promo_stu", coins: 10, lifetimeCoins: 10 });
    const claimRes = claimPromoCode(code, stu);
    assert.equal(claimRes.success, true);
    assert.equal(claimRes.updatedProfile?.coins, 55);
    assert.equal(claimRes.updatedProfile?.unopenedChests?.[DEFAULT_CHESTS[0].id], 2);
    assert.ok(claimRes.updatedProfile?.claimedPromoCodeIds?.includes(batch[0].cleanCode));
    assert.ok(batch[0].batchId);
    assert.ok(claimRes.updatedProfile?.claimedPromoBatchIds?.includes(batch[0].batchId));

    // Código agora aparece como usado; após restorePromoCodesSnapshot volta a ficar válido em memória
    assert.equal(inspectPromoCode(code, stu.id).valid, false);
    restorePromoCodesSnapshot(prevRaw);
    assert.equal(inspectPromoCode(code, stu.id).valid, true);

    // 2. Correio: deferLocalCommit não grava em localStorage até commitInboxClaimLocally e exclusão cross-device funciona
    const inboxStudent = makeStudent({ id: "inbox_stu", nick: "InboxStu", nickNormalized: "inboxstu" });
    const msg = createInboxMessage({
      recipientId: inboxStudent.id,
      sender: "adm",
      category: "recompensa_especial",
      title: "Prêmio Atômico",
      body: "Teste de commit adiado",
      reward: {
        id: "rew_atomic_1",
        type: "coins",
        pointsAmount: 35,
        isSecret: false,
        claimed: false,
      },
    });

    const deferred = claimInboxReward(msg.id, structuredClone(inboxStudent), { deferLocalCommit: true });
    assert.equal(deferred.success, true);
    assert.equal(deferred.profile.coins, 85);
    assert.ok(deferred.profile.claimedInboxRewardIds?.includes(msg.id));
    // Sem commit local, a mensagem ainda não está marcada localmente para outro perfil sem claimedInboxRewardIds
    const beforeCommitMsgs = getInboxMessagesForPlayer(inboxStudent);
    assert.equal(beforeCommitMsgs.find((m) => m.id === msg.id)?.reward?.claimed, false);

    // Após commit local, fica marcada e permite exclusão inclusive via claimedInboxRewardIds (cross-device)
    commitInboxClaimLocally(msg.id, deferred.profile, deferred.claimedAt);
    const delRes = deleteInboxMessageForPlayer(msg.id, deferred.profile);
    assert.equal(delRes.success, true);
  });

  it("resiste a alteração de Date.now() no meio da sessão usando relógio monotônico e corrige ofensiva quebrada", () => {
    // 1. Relógio monotônico: ancora em 2026-11-24 14:00 UTC (10:00 AM UTC-4 -> 2026-11-24)
    const fixedUtcMs = Date.UTC(2026, 10, 24, 14, 0, 0);
    const offset = fixedUtcMs - Date.now();
    __setPlayFabServerClockOffsetForTests(offset);
    assert.equal(getAuthoritativeDateKey(), "2026-11-24");

    const realDateNow = Date.now;
    try {
      // Simula aluno pulando +5 dias no relógio do aparelho no meio da sessão
      Date.now = () => realDateNow() + 5 * 24 * 60 * 60 * 1000;
      const nowAfterTamper = getAuthoritativeNow();
      assert.equal(
        getAuthoritativeDateKey(nowAfterTamper),
        "2026-11-24",
        "Relógio monotônico deve ignorar salto manual de Date.now()",
      );
    } finally {
      Date.now = realDateNow;
    }

    // 2. Ofensiva quebrada (gap de dias em activeDates) deve regredir para 1 no check-in diário
    const staleStreakProf = makeStudent({
      streakDays: 6,
      dailyCheckInCount: 2,
      activeDates: ["2026-11-10", "2026-11-11"],
      lastDailyRewardClaimDate: "2026-11-11",
    });
    const res = claimDailyRewardForProfile(staleStreakProf, DEFAULT_ADMIN_CONFIG, {
      todayKey: "2026-11-24",
      now: new Date(Date.UTC(2026, 10, 24, 14, 0, 0)),
    });
    assert.equal(res.ok, true);
    assert.equal(staleStreakProf.streakDays, 1, "Ofensiva antiga quebrada deve voltar para 1");
    assert.equal(res.streakBonusPoints, 0);
    assert.equal(
      res.medalCoinsAwarded ?? 0,
      0,
      "Ofensiva quebrada no Dia 3 NÃO deve conceder medalha de 3 dias seguidos",
    );
    assert.equal(
      staleStreakProf.unlockedMedals?.some((m) => m.medalId === "streak_3_days") ?? false,
      false,
    );

    // 3. Com 3 dias realmente consecutivos no Dia 3, a medalha e suas moedas são concedidas
    const consecutiveProf = makeStudent({
      streakDays: 2,
      dailyCheckInCount: 2,
      activeDates: ["2026-11-22", "2026-11-23"],
      lastDailyRewardClaimDate: "2026-11-23",
    });
    const resConsecutive = claimDailyRewardForProfile(consecutiveProf, DEFAULT_ADMIN_CONFIG, {
      todayKey: "2026-11-24",
      now: new Date(Date.UTC(2026, 10, 24, 14, 0, 0)),
    });
    assert.equal(resConsecutive.ok, true);
    assert.equal(consecutiveProf.streakDays, 3);
    assert.equal(resConsecutive.medalCoinsAwarded, 5, "Dia 3 consecutivo concede medalha bronze (+5 moedas)");

    saveAdminConfig(DEFAULT_ADMIN_CONFIG);
  });
});
