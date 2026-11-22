import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatPresenceTimeAgo,
  getPlayerPresenceData,
  getPlayerPresenceStatus,
  LEGACY_PRESENCE_SHARED_GROUP_ID,
  markPlayerDisconnected,
  PRESENCE_SHARED_GROUP_ID,
  pushPresenceToPlayFab,
  recordPlayerHeartbeat,
  setPlayerCurrentActivity,
  syncPresenceFromPlayFab,
  syncPresenceFromUserData,
  type PlayerPresenceRecord,
} from "./presence.ts";
import {
  callPlayFabClient,
  clearExpiredStoredSessionTicket,
  CLOUD_SESSION_EXPIRED_EVENT,
  getLeaderboardSnapshotLocal,
  getPlayerPublicProfile,
  hasValidCloudSessionTicket,
  playfabSignIn,
  playfabUpdatePlayerCards,
  ROSTER_SHARED_GROUP_ID,
  syncAdminConfigFromPlayFab,
  syncSinglePlayerFromPlayFab,
  syncStudentRosterFromPlayFab,
} from "./playfab.ts";

const SESSION_KEY = "desafios-playfab-session-v1";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

/**
 * PlayFab simulado com as regras reais relevantes:
 * - Só MEMBROS do SharedGroup podem escrever; Public libera só leitura.
 * - A conta de serviço semedvisitante (TK_VIEWER / 1B2E1517154B2D49) e o ADM (FB6662558A38ACAD) são membros de SEMED_PRESENCE_V3.
 * - Tickets de alunos com mais de 24h retornam 401 NotAuthenticated.
 */
function createFakePlayFab() {
  const tickets: Record<string, string> = {
    TK_ADMIN: "FB6662558A38ACAD",
    TK_VIEWER: "1B2E1517154B2D49",
    TK_ALUNO: "PF_ALUNO_1",
  };
  const users = new Map<string, { password: string; playfabId: string; ticket: string; displayName?: string }>();
  const groups = new Map<string, { members: Set<string>; data: Map<string, { Value: string; LastUpdated: string }> }>();
  const userData = new Map<string, Map<string, { Value: string; LastUpdated: string }>>();
  const calls: Array<{ endpoint: string; ticket: string; keepalive: boolean; body: Record<string, any> }> = [];
  let writeTimeOverride: string | null = null;
  let forceRateLimit = false;

  const ok = (data: unknown) => new Response(JSON.stringify({ code: 200, status: "OK", data }), { status: 200 });
  const fail = (error: string, code = 1000, status = 400) =>
    new Response(JSON.stringify({ code: status, status: "BadRequest", error, errorCode: code, errorMessage: error }), {
      status,
    });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = String(input).split("/Client/")[1];
    const ticket = String((init?.headers as Record<string, string>)?.["X-Authorization"] ?? "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ endpoint, ticket, keepalive: Boolean((init as any)?.keepalive), body });

    if (endpoint === "LoginWithPlayFab") {
      if (forceRateLimit) {
        return fail("APIClientRequestRateLimitExceeded", 1199, 429);
      }
      if (body.Username === "semedvisitante") {
        return ok({ PlayFabId: "1B2E1517154B2D49", SessionTicket: "TK_VIEWER" });
      }
      const user = users.get(String(body.Username ?? "").toLowerCase());
      if (user) {
        if (user.password === body.Password) {
          tickets[user.ticket] = user.playfabId;
          return ok({
            PlayFabId: user.playfabId,
            SessionTicket: user.ticket,
            InfoResultPayload: {
              AccountInfo: {
                Username: String(body.Username),
                TitleInfo: { DisplayName: user.displayName ?? String(body.Username) },
              },
              UserData: Object.fromEntries(userData.get(user.playfabId) ?? new Map()),
            },
          });
        }
        return fail("InvalidUsernameOrPassword", 1142, 400);
      }
      if (users.size > 0) {
        return fail("AccountNotFound", 1001, 400);
      }
      return fail("InvalidUsernameOrPassword", 1142, 401);
    }
    if (endpoint === "LoginWithCustomID") {
      return ok({
        PlayFabId: `PF_${body.CustomId}`,
        SessionTicket: `TK_${body.CustomId}`,
      });
    }

    const me = tickets[ticket];
    if (!me) return fail("NotAuthenticated", 1074, 401);
    const nowIso = writeTimeOverride ?? new Date().toISOString();

    switch (endpoint) {
      case "GetTime":
        return ok({ Time: new Date().toISOString() });
      case "CreateSharedGroup":
        if (groups.has(body.SharedGroupId)) return fail("SharedGroupAlreadyExists", 1176);
        groups.set(body.SharedGroupId, { members: new Set([me, "1B2E1517154B2D49", "FB6662558A38ACAD"]), data: new Map() });
        return ok({ SharedGroupId: body.SharedGroupId });
      case "AddSharedGroupMembers": {
        const g = groups.get(body.SharedGroupId);
        if (!g) return fail("SharedGroupNotFound", 1175);
        for (const id of body.PlayFabIds ?? []) g.members.add(id);
        return ok({});
      }
      case "GetSharedGroupData": {
        const g = groups.get(body.SharedGroupId);
        if (!g) return fail("SharedGroupNotFound", 1175);
        return ok({ Data: Object.fromEntries(g.data) });
      }
      case "UpdateSharedGroupData": {
        const g = groups.get(body.SharedGroupId);
        if (!g) return fail("SharedGroupNotFound", 1175);
        if (!g.members.has(me)) return fail("NotAuthorized", 1075, 401);
        for (const [k, v] of Object.entries(body.Data ?? {})) {
          g.data.set(k, { Value: String(v), LastUpdated: nowIso });
        }
        return ok({});
      }
      case "UpdateUserData": {
        const m = userData.get(me) ?? new Map();
        for (const [k, v] of Object.entries(body.Data ?? {})) {
          m.set(k, { Value: String(v), LastUpdated: nowIso });
        }
        userData.set(me, m);
        return ok({ DataVersion: 1 });
      }
      case "GetUserData": {
        const m = userData.get(body.PlayFabId ?? me) ?? new Map();
        const out: Record<string, unknown> = {};
        for (const k of body.Keys ?? []) if (m.has(k)) out[k] = m.get(k);
        return ok({ Data: out });
      }
      default:
        return fail(`Endpoint inesperado: ${endpoint}`);
    }
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    groups,
    userData,
    users,
    setWriteTime: (iso: string | null) => (writeTimeOverride = iso),
    setRateLimit: (v: boolean) => (forceRateLimit = v),
  };
}

function rec(partial: Partial<PlayerPresenceRecord> = {}): PlayerPresenceRecord {
  const now = Date.now();
  return {
    playerId: "PF_ALUNO_1",
    playfabId: "PF_ALUNO_1",
    nick: "AlunoTeste",
    nickNormalized: "alunoteste",
    lastSeenAt: now,
    lastActiveAt: now,
    idleMs: 0,
    disconnected: false,
    ...partial,
  };
}

const target = { id: "stu_alunoteste", playfabId: "PF_ALUNO_1", nick: "AlunoTeste", nickNormalized: "alunoteste" };

describe("Presença online/offline na nuvem (fluxo aluno → ADM)", () => {
  const g = globalThis as Record<string, any>;
  const original = { window: g.window, localStorage: g.localStorage, fetch: g.fetch };
  let storage: ReturnType<typeof createMemoryStorage>;
  let pf: ReturnType<typeof createFakePlayFab>;

  const loginAs = (ticket: string, playerId: string) =>
    storage.setItem(SESSION_KEY, JSON.stringify({ playerId, sessionTicket: ticket }));

  beforeEach(() => {
    storage = createMemoryStorage();
    pf = createFakePlayFab();
    g.localStorage = storage;
    g.window = {
      localStorage: storage,
      sessionStorage: createMemoryStorage(),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    g.fetch = pf.fetchImpl;
  });

  afterEach(() => {
    g.window = original.window;
    g.localStorage = original.localStorage;
    g.fetch = original.fetch;
  });

  it("aluno grava no SEMED_PRESENCE_V3 via conta viewer e aparece ONLINE imediatamente no ADM", async () => {
    loginAs("TK_ALUNO", "alunoteste");
    await pushPresenceToPlayFab(rec());

    assert.equal(pf.groups.get(PRESENCE_SHARED_GROUP_ID)?.data.has("pres_alunoteste"), true);

    // ADM abre o painel (mesmo que o ADM esteja com ticket local expirado "admin-josiney-session-ticket"):
    loginAs("admin-josiney-session-ticket", "josiney");
    await syncPresenceFromPlayFab(true);
    assert.equal(getPlayerPresenceStatus(target), "online");
  });

  it("aluno logado no celular há mais de 24h (sessionTicket expirado 401) limpa ticket vencido e aparece ONLINE no ADM", async () => {
    loginAs("TK_EXPIRADO_401", "alunoteste");
    await pushPresenceToPlayFab(rec());

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);
    assert.equal(getPlayerPresenceStatus(target), "online");
  });

  it("aluno que parou há 4 dias aparece offline; ao voltar fica online mesmo com relógio do celular adiantado", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
    loginAs("TK_ALUNO", "alunoteste");
    pf.setWriteTime(fourDaysAgo);
    await pushPresenceToPlayFab(rec({ lastSeenAt: Date.now() - 4 * 86_400_000, lastActiveAt: Date.now() - 4 * 86_400_000 }));

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);
    assert.equal(getPlayerPresenceStatus(target), "offline");

    loginAs("TK_ALUNO", "alunoteste");
    pf.setWriteTime(null);
    const skewed = Date.now() + 3 * 3_600_000;
    await pushPresenceToPlayFab(rec({ lastSeenAt: skewed, lastActiveAt: skewed }));
    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);
    await syncPresenceFromUserData([{ playfabId: "PF_ALUNO_1" }], { force: true });
    assert.equal(getPlayerPresenceStatus(target), "online");
  });

  it("aviso de saída (disconnected) usa keepalive e deixa o aluno offline", async () => {
    loginAs("TK_ALUNO", "alunoteste");
    await pushPresenceToPlayFab(rec());
    await pushPresenceToPlayFab(rec({ disconnected: true, lastSeenAt: 0 }));

    const exit = pf.calls.filter((c) => c.endpoint === "UpdateUserData").pop()!;
    assert.equal(exit.keepalive, true);

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);
    assert.equal(getPlayerPresenceStatus(target), "offline");
  });

  it("registro disconnected antigo no SharedGroup NÃO sobrescreve presença online mais recente do UserData", async () => {
    const fourDaysAgoIso = new Date(Date.now() - 4 * 86_400_000).toISOString();
    loginAs("TK_ALUNO", "alunoteste");
    pf.setWriteTime(fourDaysAgoIso);
    await pushPresenceToPlayFab(
      rec({ disconnected: true, lastSeenAt: 0, lastActiveAt: Date.now() - 4 * 86_400_000 }),
    );

    // Simula aluno voltando agora com registro apenas no UserData (ex.: antes do SharedGroup propagar)
    pf.setWriteTime(null);
    const now = Date.now();
    const g = pf.groups.get(PRESENCE_SHARED_GROUP_ID);
    const oldEntry = g?.data.get("pres_alunoteste");
    await pushPresenceToPlayFab(rec({ lastSeenAt: now, lastActiveAt: now, disconnected: false }));
    if (g && oldEntry) {
      // Força o SharedGroup a ainda conter o disconnected antigo de 4 dias atrás
      g.data.set("pres_alunoteste", oldEntry);
    }

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromUserData([{ playfabId: "PF_ALUNO_1" }], { force: true });
    assert.equal(getPlayerPresenceStatus(target), "online");

    await syncPresenceFromPlayFab(true);
    assert.equal(getPlayerPresenceStatus(target), "online");
  });

  it("preserva o sessionTicket do aluno após múltiplos pulsos e sincroniza troca imediata de atividade (Jogo Nv.1 → Perfil → Ranking)", async () => {
    // Cria o grupo antes como ADM para que o aluno comum receba NotAuthorized (1075) ao tentar com seu próprio ticket
    loginAs("TK_ADMIN", "admin");
    await pushPresenceToPlayFab(
      rec({ playerId: "admin", playfabId: "FB6662558A38ACAD", nick: "Admin", nickNormalized: "admin" }),
    );

    loginAs("TK_ALUNO", "alunoteste");
    // 1. Entrou em Lógica Matemática Nível 1
    await pushPresenceToPlayFab(
      rec({ activity: { type: "game", gameId: "logica", gameName: "Lógica Matemática", level: 1 } }),
    );
    // O sessionTicket do aluno NÃO pode ter sido apagado pelo NotAuthorized do SharedGroup!
    const sessAfter1 = JSON.parse(storage.getItem(SESSION_KEY) || "{}");
    assert.equal(sessAfter1.sessionTicket, "TK_ALUNO");

    // 2. Abriu o Perfil
    await pushPresenceToPlayFab(rec({ activity: { type: "profile" } }));
    // 3. Abriu o Ranking
    await pushPresenceToPlayFab(rec({ activity: { type: "ranking" } }));
    const sessAfter3 = JSON.parse(storage.getItem(SESSION_KEY) || "{}");
    assert.equal(sessAfter3.sessionTicket, "TK_ALUNO");

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);
    await syncPresenceFromUserData([{ playfabId: "PF_ALUNO_1" }], { force: true });
    const data = getPlayerPresenceData("stu_alunoteste", target);
    assert.equal(data?.activity?.type, "ranking");
  });

  it("recordPlayerHeartbeat para outro jogador NÃO contamina com a atividade local do ADM ('ranking')", () => {
    loginAs("TK_ADMIN", "josiney");
    setPlayerCurrentActivity({ type: "ranking" });

    const recOutro = recordPlayerHeartbeat("stu_marechxxx", {
      nick: "marechxxx",
      lastSeenAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    assert.equal(recOutro?.activity, undefined);
  });

  it("getPlayerPresenceData ignora cache antigo do lobby X1 e NÃO forja falso online", async () => {
    const fourDaysAgoIso = new Date(Date.now() - 4 * 86_400_000).toISOString();
    loginAs("TK_ALUNO", "alunoteste");
    pf.setWriteTime(fourDaysAgoIso);
    await pushPresenceToPlayFab(
      rec({ lastSeenAt: Date.now() - 4 * 86_400_000, lastActiveAt: Date.now() - 4 * 86_400_000 }),
    );

    loginAs("TK_ADMIN", "admin");
    await syncPresenceFromPlayFab(true);

    // Mesmo que o cache local do X1 contenha um timestamp recente/adiantado, o status deve permanecer offline
    storage.setItem(
      "desafios-x1-lobby-state-v1",
      JSON.stringify({
        players: {
          stu_alunoteste: {
            playerId: "stu_alunoteste",
            nick: "AlunoTeste",
            lastSeenAt: Date.now() + 60_000,
            lastActiveAt: Date.now() + 60_000,
          },
        },
      }),
    );

    assert.equal(getPlayerPresenceStatus(target), "offline");
  });

  it("markPlayerDisconnected marca imediatamente o jogador como offline e envia disconnected com keepalive", async () => {
    loginAs("TK_ALUNO", "alunoteste");
    const onlineRec = recordPlayerHeartbeat("stu_alunoteste", {
      playfabId: "PF_ALUNO_1",
      nick: "AlunoTeste",
      nickNormalized: "alunoteste",
      lastSeenAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    if (onlineRec) await pushPresenceToPlayFab(onlineRec);
    assert.equal(getPlayerPresenceStatus(target), "online");

    markPlayerDisconnected({
      playerId: "stu_alunoteste",
      playfabId: "PF_ALUNO_1",
      nick: "AlunoTeste",
      nickNormalized: "alunoteste",
    });

    assert.equal(getPlayerPresenceStatus(target), "offline");
    await new Promise((r) => setTimeout(r, 15));
    const exitCalls = pf.calls.filter((c) => c.endpoint === "UpdateUserData" && c.keepalive);
    assert.ok(exitCalls.length >= 1);
  });

  it("clearExpiredStoredSessionTicket dispara evento de sessão expirada e playfabUpdatePlayerCards exige ticket válido", async () => {
    let expiredEventCount = 0;
    const prevDispatch = (globalThis as any).window.dispatchEvent;
    (globalThis as any).window.dispatchEvent = (ev: Event) => {
      if (ev?.type === CLOUD_SESSION_EXPIRED_EVENT) expiredEventCount++;
      return prevDispatch ? prevDispatch(ev) : true;
    };

    try {
      storage.setItem(
        "desafios-playfab-registry-v1",
        JSON.stringify({
          josiney: {
            profile: {
              id: "admin-josiney",
              nick: "JOSINEY",
              nickNormalized: "josiney",
              full_name: "JOSINEY - ADM",
              school: "SEMED",
              birthdate: "1990-01-01",
              xp: 100,
              seasonXp: 100,
              level: 1,
              wins: 0,
              matchesPlayed: 0,
              badges: [],
              isAdmin: true,
              cards: {},
              unopenedPacks: { pack_basico: 2 },
            },
            passwordHash: "h",
            unlocked: [],
            stats: [],
            updatedAt: new Date().toISOString(),
          },
        }),
      );

      // Placeholder admin-* deve ser limpo e disparar evento de sessão expirada
      loginAs("admin-josiney-session-ticket", "josiney");
      await assert.rejects(
        () =>
          playfabUpdatePlayerCards({
            cards: { c1: 1 },
            unopenedPacks: { pack_basico: 1 },
            requireServerSync: true,
          }),
        /Sessão expirada/,
      );

      clearExpiredStoredSessionTicket("admin-josiney-session-ticket");
      assert.equal(expiredEventCount, 1);

      // Com ticket válido do PlayFab, abre e sincroniza com sucesso (incluindo unopenedChests)
      loginAs("TK_ADMIN", "josiney");
      const updated = await playfabUpdatePlayerCards({
        cards: { c1: 1 },
        unopenedPacks: { pack_basico: 1 },
        unopenedChests: { bau_ouro: 3 },
        packsOpenedDelta: 1,
        requireServerSync: true,
      });
      assert.equal(updated?.cards?.c1, 1);
      assert.equal(updated?.unopenedPacks?.pack_basico, 1);
      assert.equal(updated?.unopenedChests?.bau_ouro, 3);
    } finally {
      (globalThis as any).window.dispatchEvent = prevDispatch;
    }
  });

  it("HTTP 401 com NotAuthorized (1075) em SharedGroup NUNCA apaga o sessionTicket do jogador recém-logado", async () => {
    // Cria grupo como ADM para que o aluno comum receba HTTP 401 NotAuthorized (1075)
    loginAs("TK_ADMIN", "admin");
    await callPlayFabClient("CreateSharedGroup", { SharedGroupId: "SEMED_STUDENT_ROSTER_V1" }, "TK_ADMIN");

    loginAs("TK_ALUNO", "alunoteste");
    assert.equal(hasValidCloudSessionTicket(), true);

    await callPlayFabClient(
      "UpdateSharedGroupData",
      { SharedGroupId: "SEMED_STUDENT_ROSTER_V1", Data: { stu_alunoteste: "{}" } },
      "TK_ALUNO",
    );

    // O sessionTicket do aluno deve permanecer 100% intacto!
    const sess = JSON.parse(storage.getItem(SESSION_KEY) || "{}");
    assert.equal(sess.sessionTicket, "TK_ALUNO");
    assert.equal(hasValidCloudSessionTicket(), true);
  });

  it("contas ADM JOSINEY e QUEMUEL autenticam com suas credenciais oficiais e obtêm SessionTicket válido do PlayFab", async () => {
    const resJ = await playfabSignIn("JOSINEY", "SEMED2620ZZ");
    assert.equal(resJ.error, null);
    assert.equal(resJ.account?.profile.nick, "JOSINEY");
    assert.equal(resJ.account?.profile.isAdmin, true);
    assert.equal(hasValidCloudSessionTicket(), true);

    const resQ = await playfabSignIn("QUEMUEL", "SEMED2620QQ");
    assert.equal(resQ.error, null);
    assert.equal(resQ.account?.profile.nick, "QUEMUEL");
    assert.equal(resQ.account?.profile.isAdmin, true);
    assert.equal(hasValidCloudSessionTicket(), true);

    const resWrong = await playfabSignIn("JOSINEY", "SENHA_ERRADA");
    assert.equal(resWrong.account, null);
    assert.ok(resWrong.error);
  });

  it("alunos com senha padrão de 6 dígitos (DDMMAA ou DD/MM/AAAA) autenticam em 1 chamada e preservam sessão válida", async () => {
    pf.users.set("alunopadrao", {
      password: "200114",
      playfabId: "PF_PADRAO_1",
      ticket: "TK_PADRAO_1",
      displayName: "AlunoPadrao",
    });

    const res1 = await playfabSignIn("AlunoPadrao", "200114");
    assert.equal(res1.error, null);
    assert.equal(res1.account?.profile.playfabId, "PF_PADRAO_1");
    assert.equal(hasValidCloudSessionTicket(), true);

    const loginCalls1 = pf.calls.filter((c) => c.endpoint === "LoginWithPlayFab" && c.body.Username === "alunopadrao");
    assert.equal(loginCalls1.length, 1);

    // Também aceita data formatada DD/MM/AAAA (normalizada para 200114 na 1ª chamada)
    const res2 = await playfabSignIn("alunopadrao", "20/01/2014");
    assert.equal(res2.error, null);
    assert.equal(res2.account?.profile.playfabId, "PF_PADRAO_1");
    assert.equal(hasValidCloudSessionTicket(), true);
  });

  it("conta criada com senha numérica de 8 dígitos ou alfanumérica com 6 dígitos faz login sem corromper a senha", async () => {
    pf.users.set("zheret", {
      password: "12345678",
      playfabId: "PF_ZHERET",
      ticket: "TK_ZHERET",
      displayName: "ZHERET",
    });
    pf.users.set("alunoalfa", {
      password: "teste123456",
      playfabId: "PF_ALFA",
      ticket: "TK_ALFA",
      displayName: "AlunoAlfa",
    });

    // 8 dígitos literais: tenta 123478 (DDMMAA) e faz fallback automático para 12345678
    const res8 = await playfabSignIn("ZHERET", "12345678");
    assert.equal(res8.error, null);
    assert.equal(res8.account?.profile.playfabId, "PF_ZHERET");
    assert.equal(hasValidCloudSessionTicket(), true);

    // Alfanumérica com 6 dígitos: não remove letras e entra na 1ª tentativa
    const resAlfa = await playfabSignIn("AlunoAlfa", "teste123456");
    assert.equal(resAlfa.error, null);
    assert.equal(resAlfa.account?.profile.playfabId, "PF_ALFA");
    const alfaCalls = pf.calls.filter((c) => c.endpoint === "LoginWithPlayFab" && c.body.Username === "alunoalfa");
    assert.equal(alfaCalls.length, 1);
    assert.equal(alfaCalls[0].body.Password, "teste123456");
  });

  it("conta antiga com underline '_' cadastrada sem codificação '0u' autentica via fallback legado", async () => {
    pf.users.set("joaosilva", {
      password: "150815",
      playfabId: "PF_JOAO_LEGADO",
      ticket: "TK_JOAO_LEGADO",
      displayName: "joao_silva",
    });

    const res = await playfabSignIn("joao_silva", "150815");
    assert.equal(res.error, null);
    assert.equal(res.account?.profile.playfabId, "PF_JOAO_LEGADO");
    assert.equal(hasValidCloudSessionTicket(), true);
  });

  it("HTTP 429 (APIClientRequestRateLimitExceeded) interrompe tentativas imediatamente e informa mensagem clara de espera", async () => {
    pf.users.set("alunorate", {
      password: "12345678",
      playfabId: "PF_RATE",
      ticket: "TK_RATE",
    });
    pf.setRateLimit(true);

    const res = await playfabSignIn("alunorate", "12345678");
    assert.equal(res.account, null);
    assert.match(res.error ?? "", /Aguarde|tentativas/i);
    assert.doesNotMatch(res.error ?? "", /Apelido ou senha incorretos/i);

    const rateCalls = pf.calls.filter((c) => c.endpoint === "LoginWithPlayFab");
    assert.equal(rateCalls.length, 1);
  });

  it("caso Quimquim: syncStudentRosterFromPlayFab NÃO apaga activeSessionUpdatedAt nem causa oscilação 'há 5 dias' ↔ 'há 2 dias'", async () => {
    const now = Date.now();
    const fiveDaysAgoIso = new Date(now - 5.2 * 86_400_000).toISOString();
    const fourDaysAgoIso = new Date(now - 4.0 * 86_400_000).toISOString();
    const twoDaysAgoIso = new Date(now - 2.6 * 86_400_000).toISOString();

    // Roster congelado em 5 dias atrás (sem activeSessionUpdatedAt)
    pf.groups.set(ROSTER_SHARED_GROUP_ID, {
      members: new Set(["1B2E1517154B2D49", "FB6662558A38ACAD"]),
      data: new Map([
        [
          "stu_quimquim",
          {
            Value: JSON.stringify({
              id: "B6F7125B9A97C2E7",
              playfabId: "B6F7125B9A97C2E7",
              nick: "Quimquim",
              nickNormalized: "quimquim",
              full_name: "JOAQUIM G.",
              school: "Raimundo Bezerra",
              level: 10,
              xp: 12120,
              seasonXp: 12120,
              matchesPlayed: 293,
              wins: 288,
              careerPoints: 7236,
              pointsBalance: 7236,
              updatedAt: fiveDaysAgoIso,
              stats: [{ game_id: "logica", plays: 293, wins: 288, best_score: 200, best_level: 3, last_played_at: fiveDaysAgoIso }],
            }),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
      ]),
    });

    // Presença legada V2 congelada em 5 dias atrás
    pf.groups.set(LEGACY_PRESENCE_SHARED_GROUP_ID, {
      members: new Set(["1B2E1517154B2D49"]),
      data: new Map([
        [
          "pres_quimquim",
          {
            Value: JSON.stringify({
              playerId: "B6F7125B9A97C2E7",
              playfabId: "B6F7125B9A97C2E7",
              nick: "Quimquim",
              nickNormalized: "quimquim",
              lastSeenAt: now - 5.2 * 86_400_000,
              lastActiveAt: now - 5.2 * 86_400_000,
              idleMs: 0,
              disconnected: false,
            }),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
      ]),
    });

    // UserData individual mais recente (2 dias atrás, sem campo updatedAt no JSON — apenas LastUpdated do servidor)
    pf.userData.set(
      "B6F7125B9A97C2E7",
      new Map([
        [
          "PlayerProfile",
          {
            Value: JSON.stringify({
              nick: "Quimquim",
              xp: 13305,
              seasonXp: 13305,
              level: 10,
              matchesPlayed: 314,
              wins: 309,
              careerPoints: 7756,
              pointsBalance: 7756,
              activeSessionId: "sess_quim_recent",
              activeSessionUpdatedAt: twoDaysAgoIso,
            }),
            LastUpdated: twoDaysAgoIso,
          },
        ],
        [
          "GameStats",
          {
            Value: JSON.stringify([
              { game_id: "logica", plays: 314, wins: 309, best_score: 210, best_level: 3, last_played_at: fourDaysAgoIso },
            ]),
            LastUpdated: twoDaysAgoIso,
          },
        ],
      ]),
    );

    loginAs("TK_ADMIN", "josiney");
    await syncPresenceFromPlayFab(true);
    await syncStudentRosterFromPlayFab(undefined, true, { lightweight: true });

    // Abre perfil do Quimquim -> baixa UserData (2 dias atrás) e preserva XP maior do UserData (13.305+)
    const afterInspect = await syncSinglePlayerFromPlayFab("Quimquim");
    assert.ok((afterInspect?.xp ?? 0) >= 13305);
    assert.equal(afterInspect?.activeSessionUpdatedAt, twoDaysAgoIso);

    const presAfterInspect = getPlayerPresenceData(afterInspect!.id, {
      playfabId: afterInspect!.playfabId,
      nick: afterInspect!.nick,
      nickNormalized: afterInspect!.nickNormalized,
      activeSessionUpdatedAt: afterInspect!.activeSessionUpdatedAt,
      lastKnownActivityAt: afterInspect!.lastKnownActivityAt,
    });
    assert.equal(formatPresenceTimeAgo(presAfterInspect, now), "Online há 2 dias");

    // Novo ciclo do Roster (antes apagava activeSessionUpdatedAt e voltava para "Online há 5 dias"!)
    await syncStudentRosterFromPlayFab(undefined, true, { lightweight: true });
    const afterSecondRosterSync = getPlayerPublicProfile("Quimquim");
    assert.equal(afterSecondRosterSync?.activeSessionUpdatedAt, twoDaysAgoIso);
    assert.ok((afterSecondRosterSync?.xp ?? 0) >= 13305);

    const presAfterRoster = getPlayerPresenceData(afterSecondRosterSync!.id, {
      playfabId: afterSecondRosterSync!.playfabId,
      nick: afterSecondRosterSync!.nick,
      nickNormalized: afterSecondRosterSync!.nickNormalized,
      activeSessionUpdatedAt: afterSecondRosterSync!.activeSessionUpdatedAt,
      lastKnownActivityAt: afterSecondRosterSync!.lastKnownActivityAt,
    });
    assert.equal(formatPresenceTimeAgo(presAfterRoster, now), "Online há 2 dias");

    // Ranking local também carrega activeSessionUpdatedAt / lastKnownActivityAt idênticos
    const board = getLeaderboardSnapshotLocal({ kind: "xp_total", stage: "TODAS" });
    const row = board.find((r) => r.nick === "Quimquim");
    assert.ok(row);
    assert.equal(row.activeSessionUpdatedAt, twoDaysAgoIso);
    assert.equal(row.playfabId, "B6F7125B9A97C2E7");
  });

  it("caso ana-banana: recupera histórico legado de SEMED_PRESENCE_V2 (sem sobrescrever V3) e preserva progresso maior do Roster", async () => {
    const now = Date.now();
    const sixteenDaysAgoIso = new Date(now - 16.5 * 86_400_000).toISOString();
    const sixDaysAgoIso = new Date(now - 6.5 * 86_400_000).toISOString();
    const fiveDaysAgoIso = new Date(now - 5.5 * 86_400_000).toISOString();
    const oneHourAgoIso = new Date(now - 65 * 60_000).toISOString();

    pf.groups.set(LEGACY_PRESENCE_SHARED_GROUP_ID, {
      members: new Set(["1B2E1517154B2D49"]),
      data: new Map([
        [
          "pres_anabanana",
          {
            Value: JSON.stringify({
              playerId: "F5CE5DE0323AE361",
              playfabId: "F5CE5DE0323AE361",
              nick: "ana-banana",
              nickNormalized: "anabanana",
              lastSeenAt: now - 5.5 * 86_400_000,
              lastActiveAt: now - 5.5 * 86_400_000,
              idleMs: 0,
              disconnected: false,
            }),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
        [
          "pres_kaylon",
          {
            Value: JSON.stringify({
              playerId: "PF_KAYLON",
              playfabId: "PF_KAYLON",
              nick: "kaylon",
              nickNormalized: "kaylon",
              lastSeenAt: now - 5.5 * 86_400_000,
              lastActiveAt: now - 5.5 * 86_400_000,
              idleMs: 0,
              disconnected: false,
            }),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
      ]),
    });

    // V3 tem kaylon há 1h (NÃO pode ser sobrescrito pelo V2 de 5 dias atrás) e NÃO tem ana-banana
    pf.groups.set(PRESENCE_SHARED_GROUP_ID, {
      members: new Set(["1B2E1517154B2D49"]),
      data: new Map([
        [
          "pres_kaylon",
          {
            Value: JSON.stringify({
              playerId: "PF_KAYLON",
              playfabId: "PF_KAYLON",
              nick: "kaylon",
              nickNormalized: "kaylon",
              lastSeenAt: now - 3_600_000,
              lastActiveAt: now - 3_600_000,
              idleMs: 0,
              disconnected: false,
            }),
            LastUpdated: oneHourAgoIso,
          },
        ],
      ]),
    });

    pf.groups.set(ROSTER_SHARED_GROUP_ID, {
      members: new Set(["1B2E1517154B2D49"]),
      data: new Map([
        [
          "stu_anabanana",
          {
            Value: JSON.stringify({
              id: "F5CE5DE0323AE361",
              playfabId: "F5CE5DE0323AE361",
              nick: "ana-banana",
              nickNormalized: "anabanana",
              full_name: "LUIZZI",
              school: "Raimundo Bezerra",
              level: 10,
              xp: 10500,
              seasonXp: 10500,
              matchesPlayed: 241,
              wins: 191,
              careerPoints: 7474,
              pointsBalance: 7474,
              updatedAt: oneHourAgoIso, // regravação de auditoria (NÃO deve virar "Online há 1 hora"!)
              stats: [{ game_id: "logica", plays: 241, wins: 191, best_score: 180, best_level: 3, last_played_at: sixDaysAgoIso }],
            }),
            LastUpdated: oneHourAgoIso,
          },
        ],
      ]),
    });

    // UserData da ana-banana congelado em 5,9 dias atrás com XP antigo (2260) e GameStats de 16 dias atrás
    pf.userData.set(
      "F5CE5DE0323AE361",
      new Map([
        [
          "PlayerProfile",
          {
            Value: JSON.stringify({
              nick: "ana-banana",
              xp: 2260,
              seasonXp: 2260,
              level: 5,
              matchesPlayed: 49,
              wins: 48,
              careerPoints: 375,
              pointsBalance: 375,
            }),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
        [
          "GameStats",
          {
            Value: JSON.stringify([
              { game_id: "logica", plays: 6, wins: 5, best_score: 100, best_level: 2, last_played_at: sixteenDaysAgoIso },
            ]),
            LastUpdated: fiveDaysAgoIso,
          },
        ],
      ]),
    );

    loginAs("TK_ADMIN", "josiney");
    await syncPresenceFromPlayFab(true);
    await syncStudentRosterFromPlayFab(undefined, true, { lightweight: true });
    const prof = await syncSinglePlayerFromPlayFab("ana-banana");

    // Progresso maior do Roster (10.500+ XP) preservado; não regride para 2.260 do UserData
    assert.ok((prof?.xp ?? 0) >= 10500);
    assert.equal(prof?.matchesPlayed, 241);

    // Presença da ana-banana recuperada do SEMED_PRESENCE_V2 ("Online há 5 dias") e NÃO contaminada pelo updatedAt de 1h atrás do Roster!
    const anaPres = getPlayerPresenceData(prof!.id, {
      playfabId: prof!.playfabId,
      nick: prof!.nick,
      nickNormalized: prof!.nickNormalized,
      activeSessionUpdatedAt: prof!.activeSessionUpdatedAt,
      lastKnownActivityAt: prof!.lastKnownActivityAt,
    });
    assert.equal(formatPresenceTimeAgo(anaPres, now), "Online há 5 dias");

    // Kaylon no V3 (1h atrás) NÃO foi sobrescrito pelo V2 (5 dias atrás)
    const kaylonPres = getPlayerPresenceData("PF_KAYLON", { nick: "kaylon", nickNormalized: "kaylon" });
    assert.equal(formatPresenceTimeAgo(kaylonPres, now), "Online há 1 hora");
  });

  it("sessão ADM (JOSINEY) NÃO expira após syncAdminConfig, 401 de visitante ou nova aba, e abre pacotes de cartas com persistência na nuvem", async () => {
    let expiredEvents = 0;
    const prevDispatch = (globalThis as any).window.dispatchEvent;
    (globalThis as any).window.dispatchEvent = (ev: Event) => {
      if (ev?.type === CLOUD_SESSION_EXPIRED_EVENT) expiredEvents++;
      return prevDispatch ? prevDispatch(ev) : true;
    };

    try {
      // 1. Login oficial do ADM JOSINEY (cai no fallback admin-josiney-session-ticket quando LoginWithPlayFab falha)
      const signRes = await playfabSignIn("JOSINEY", "SEMED2620ZZ");
      assert.equal(signRes.error, null);
      assert.equal(hasValidCloudSessionTicket(), true);

      // 2. Rotinas em segundo plano após login (syncAdminConfig + chamada direta com admin-*)
      await syncAdminConfigFromPlayFab();
      await callPlayFabClient("GetUserData", { PlayFabId: "FB6662558A38ACAD", Keys: ["PlayerProfile"] }, "admin-josiney-session-ticket");

      // 3. Erro 401 em um ticket antigo do visitante NUNCA deve apagar a sessão do JOSINEY
      clearExpiredStoredSessionTicket("TK_VIEWER_EXPIRADO");

      // 4. Simula abertura de nova aba (sessionStorage zerado)
      (globalThis as any).window.sessionStorage.clear();
      assert.equal(hasValidCloudSessionTicket(), true);
      assert.equal(expiredEvents, 0);

      // 5. Garante que NENHUMA requisição HTTP enviou "admin-josiney-session-ticket" para o PlayFab
      const leakedAdminCalls = pf.calls.filter((c) => c.ticket.startsWith("admin-"));
      assert.equal(leakedAdminCalls.length, 0);

      // 5.1. Simula cache residual de ticket fallback não-canônico ("semedv...") que NÃO é membro do SharedGroup (causava NotAuthorized)
      storage.setItem(
        "desafios-playfab-viewer-ticket-v1",
        JSON.stringify({ ticket: "9F123456789ABCDE-186F63-FALLBACK", at: Date.now() }),
      );

      // 6. Abrir pacote de cartas com requireServerSync: true descarta o ticket não-canônico, usa semedvisitante sem erro NotAuthorized e persiste após F5
      const opened = await playfabUpdatePlayerCards({
        cards: { carta_rara_1: 1, carta_comum_2: 3 },
        unopenedPacks: { pack_basico: 0 },
        packsOpenedDelta: 1,
        requireServerSync: true,
      });
      assert.equal(opened?.cards?.carta_rara_1, 1);
      assert.equal(opened?.cards?.carta_comum_2, 3);
      assert.equal(opened?.unopenedPacks?.pack_basico, 0);
      assert.equal(opened?.packsOpenedTotal, 1);
      assert.equal(pf.groups.get(ROSTER_SHARED_GROUP_ID)?.data.has("stu_josiney"), true);

      // 7. Simula reload (F5) chamando syncSinglePlayerFromPlayFab -> cartas abertas e pacote consumido permanecem intactos
      const afterReload = await syncSinglePlayerFromPlayFab("JOSINEY");
      assert.equal(afterReload?.cards?.carta_rara_1, 1);
      assert.equal(afterReload?.cards?.carta_comum_2, 3);
      assert.equal(afterReload?.unopenedPacks?.pack_basico, 0);
      assert.equal(afterReload?.packsOpenedTotal, 1);
    } finally {
      (globalThis as any).window.dispatchEvent = prevDispatch;
    }
  });

  it("jogador comum recém-logado NÃO recebe falso aviso de sessão expirada ao usar Ranking, Presença, Nova Aba ou Pacotes (só expira se o próprio ticket vencer)", async () => {
    let expiredEvents = 0;
    const prevDispatch = (globalThis as any).window.dispatchEvent;
    (globalThis as any).window.dispatchEvent = (ev: Event) => {
      if (ev?.type === CLOUD_SESSION_EXPIRED_EVENT) expiredEvents++;
      return prevDispatch ? prevDispatch(ev) : true;
    };

    try {
      pf.users.set("alunonormal", {
        password: "200114",
        playfabId: "PF_ALUNO_COMUM",
        ticket: "TK_ALUNO_COMUM",
        displayName: "AlunoNormal",
      });

      // Cria SharedGroups como ADM antes para forçar 401 NotAuthorized (1075) se o aluno tocar neles
      await callPlayFabClient("CreateSharedGroup", { SharedGroupId: ROSTER_SHARED_GROUP_ID }, "TK_ADMIN");
      await callPlayFabClient("CreateSharedGroup", { SharedGroupId: PRESENCE_SHARED_GROUP_ID }, "TK_ADMIN");

      // 1. Login do aluno comum
      const loginRes = await playfabSignIn("AlunoNormal", "200114");
      assert.equal(loginRes.error, null);
      assert.equal(hasValidCloudSessionTicket(), true);

      // 2. Fluxo completo pós-login: config, presença (com NotAuthorized no SharedGroup), perfil e erro 401 de ticket visitante
      await syncAdminConfigFromPlayFab();
      await pushPresenceToPlayFab(
        rec({
          playerId: "PF_ALUNO_COMUM",
          playfabId: "PF_ALUNO_COMUM",
          nick: "AlunoNormal",
          nickNormalized: "alunonormal",
        }),
      );
      await syncSinglePlayerFromPlayFab("AlunoNormal");
      clearExpiredStoredSessionTicket("TK_VIEWER_EXPIRADO");

      // 3. Simula nova aba / F5 (sessionStorage vazio) -> sessão do aluno comum continua 100% válida!
      (globalThis as any).window.sessionStorage.clear();
      assert.equal(hasValidCloudSessionTicket(), true);
      assert.equal(expiredEvents, 0);

      // 4. Abre pacote de cartas com requireServerSync: true normalmente
      const opened = await playfabUpdatePlayerCards({
        cards: { carta_comum_1: 2 },
        unopenedPacks: { pack_basico: 0 },
        packsOpenedDelta: 1,
        requireServerSync: true,
      });
      assert.equal(opened?.cards?.carta_comum_1, 2);
      assert.equal(expiredEvents, 0);
      assert.equal(hasValidCloudSessionTicket(), true);

      // 5. Apenas quando o PRÓPRIO ticket do aluno vencer (401 NotAuthenticated) é que dispara sessão expirada
      clearExpiredStoredSessionTicket("TK_ALUNO_COMUM");
      assert.equal(expiredEvents, 1);
      assert.equal(hasValidCloudSessionTicket(), false);
    } finally {
      (globalThis as any).window.dispatchEvent = prevDispatch;
    }
  });
});
