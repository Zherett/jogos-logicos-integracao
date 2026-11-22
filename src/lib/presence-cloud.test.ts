import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPlayerPresenceData,
  getPlayerPresenceStatus,
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
  hasValidCloudSessionTicket,
  playfabSignIn,
  playfabUpdatePlayerCards,
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
  const groups = new Map<string, { members: Set<string>; data: Map<string, { Value: string; LastUpdated: string }> }>();
  const userData = new Map<string, Map<string, { Value: string; LastUpdated: string }>>();
  const calls: Array<{ endpoint: string; ticket: string; keepalive: boolean; body: Record<string, any> }> = [];
  let writeTimeOverride: string | null = null;

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
      if (body.Username === "semedvisitante") {
        return ok({ PlayFabId: "1B2E1517154B2D49", SessionTicket: "TK_VIEWER" });
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
    setWriteTime: (iso: string | null) => (writeTimeOverride = iso),
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
});
