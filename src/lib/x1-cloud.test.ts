import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __setX1ServerClockOffsetForTests,
  confirmX1HostReady,
  createX1Room,
  getX1LobbySnapshot,
  getX1Room,
  joinX1RoomAsync,
  startX1MatchAfterCountdown,
  syncX1ServerClockOffset,
  syncX1WithPlayFabCloud,
  updateX1PlayerProgress,
} from "./x1-challenge.ts";

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
 * PlayFab simulado com verificação REAL de associação a SharedGroup:
 * - Somente MEMBROS do grupo podem fazer UpdateSharedGroupData (senão 403 NotAuthorized 1075).
 * - Fornece Client/GetTime para calibração UTC dos relógios.
 */
function createFakeX1PlayFab(serverClockNow: () => number) {
  const tickets: Record<string, string> = {
    TK_VIEWER: "1B2E1517154B2D49",
    TK_ALUNO_A: "PF_ALUNO_A",
    TK_ALUNO_B: "PF_ALUNO_B",
  };
  const groups = new Map<
    string,
    { members: Set<string>; data: Map<string, { Value: string; LastUpdated: string }> }
  >();
  const calls: Array<{ endpoint: string; ticket: string; status: number; body: Record<string, any> }> = [];

  const ok = (data: unknown) =>
    new Response(JSON.stringify({ code: 200, status: "OK", data }), { status: 200 });
  const fail = (error: string, code = 1000, status = 400) =>
    new Response(
      JSON.stringify({ code: status, status: "Error", error, errorCode: code, errorMessage: error }),
      { status },
    );

  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const endpoint = url.split("/Client/")[1] ?? "";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const ticket = headers["X-Authorization"] ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    const record = (res: Response) => {
      calls.push({ endpoint, ticket, status: res.status, body });
      return res;
    };

    if (endpoint === "LoginWithPlayFab") {
      if (body.Username === "semedvisitante") {
        return record(ok({ SessionTicket: "TK_VIEWER", PlayFabId: tickets.TK_VIEWER }));
      }
      return record(fail("InvalidUsernameOrPassword", 1142, 400));
    }

    const pfId = tickets[ticket];
    if (!pfId) {
      return record(fail("NotAuthenticated", 1074, 401));
    }

    const ts = new Date(serverClockNow()).toISOString();

    if (endpoint === "GetTime") {
      return record(ok({ Time: ts }));
    }
    if (endpoint === "CreateSharedGroup") {
      const id = String(body.SharedGroupId);
      if (groups.has(id)) return record(fail("SharedGroupAlreadyExists", 1088, 400));
      groups.set(id, { members: new Set([pfId]), data: new Map() });
      return record(ok({ SharedGroupId: id }));
    }
    if (endpoint === "GetSharedGroupData") {
      const g = groups.get(String(body.SharedGroupId));
      if (!g) return record(ok({ Data: {} }));
      const Data: Record<string, { Value: string; LastUpdated: string }> = {};
      for (const [k, v] of g.data.entries()) Data[k] = v;
      return record(ok({ Data }));
    }
    if (endpoint === "UpdateSharedGroupData") {
      const id = String(body.SharedGroupId);
      const g = groups.get(id);
      if (!g) return record(fail("SharedGroupNotFound", 1087, 400));
      if (!g.members.has(pfId)) {
        return record(fail("NotAuthorized", 1075, 403));
      }
      for (const [k, v] of Object.entries((body.Data ?? {}) as Record<string, string>)) {
        g.data.set(k, { Value: v, LastUpdated: ts });
      }
      return record(ok({}));
    }
    return record(fail("UnknownEndpoint", 1000, 400));
  };

  return { fetchMock, groups, calls };
}

describe("Desafio X1 Online na Nuvem PlayFab (permissões entre 2 alunos, GetTime, chaves separadas e lobby limpo)", () => {
  const prevWindow = (globalThis as any).window;
  const prevLocalStorage = (globalThis as any).localStorage;
  const prevFetch = globalThis.fetch;

  let storage: ReturnType<typeof createMemoryStorage>;
  let fakeNowMs = Date.now();
  let pf: ReturnType<typeof createFakeX1PlayFab>;

  beforeEach(() => {
    fakeNowMs = Date.now();
    storage = createMemoryStorage();
    pf = createFakeX1PlayFab(() => fakeNowMs);
    (globalThis as any).window = {
      localStorage: storage,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    (globalThis as any).localStorage = storage;
    globalThis.fetch = pf.fetchMock;
    __setX1ServerClockOffsetForTests(null);
  });

  afterEach(() => {
    __setX1ServerClockOffsetForTests(null);
    (globalThis as any).window = prevWindow;
    (globalThis as any).localStorage = prevLocalStorage;
    globalThis.fetch = prevFetch;
  });

  const loginAs = (ticket: string, playerId: string) => {
    storage.setItem(SESSION_KEY, JSON.stringify({ playerId, sessionTicket: ticket }));
  };

  it("dois alunos diferentes criam, entram, sincronizam chaves isoladas (HostState/GuestState) sem 403 NotAuthorized e sem Lost Update", async () => {
    // Calibra relógio UTC via Client/GetTime
    loginAs("TK_ALUNO_A", "aluno_a");
    await syncX1ServerClockOffset(true);
    assert.ok(pf.calls.some((c) => c.endpoint === "GetTime" && c.status === 200));

    // 1. Aluno A cria a sala (deve usar conta compartilhada semedvisitante, evitando 403 para o Aluno B!)
    const roomA = createX1Room({
      host: { playerId: "aluno_a", nick: "AlunoA", school: "SEMED", level: 6 },
      gameId: "logica",
    });
    await syncX1WithPlayFabCloud(roomA.code);

    // 2. Aluno B entra na sala em outro navegador (storage limpo) usando seu próprio sessionTicket (TK_ALUNO_B)
    storage.clear();
    loginAs("TK_ALUNO_B", "aluno_b");
    const joined = await joinX1RoomAsync({
      code: roomA.code,
      guest: { playerId: "aluno_b", nick: "AlunoB", school: "SEMED", level: 6 },
    });
    assert.equal(joined.error, null);
    assert.ok(joined.room);
    assert.equal(joined.room!.hostReady, false);
    assert.equal(joined.room!.countdownEndsAtServerMs, null);

    // Nenhum 403 NotAuthorized pode ter ocorrido!
    const forbiddenCalls = pf.calls.filter((c) => c.status === 403);
    assert.equal(forbiddenCalls.length, 0);

    // 3. Aluno A confirma handshake -> define countdownEndsAtServerMs oficial UTC e inicia partida
    loginAs("TK_ALUNO_A", "aluno_a");
    await syncX1WithPlayFabCloud(roomA.code);
    const confirmed = await confirmX1HostReady(roomA.code);
    assert.ok(confirmed?.countdownEndsAtServerMs);
    startX1MatchAfterCountdown(roomA.code);
    await syncX1WithPlayFabCloud(roomA.code);

    // 4. Ambos respondem simultaneamente: Host grava HostState e Guest grava GuestState em chaves SEPARADAS!
    updateX1PlayerProgress({
      code: roomA.code,
      playerId: "aluno_a",
      score: 45,
      correct: 3,
      wrong: 0,
      currentQuestionIdx: 3,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Simula Guest respondendo em outro aparelho (sem saber ainda dos 45 pts do Host)
    loginAs("TK_ALUNO_B", "aluno_b");
    await syncX1WithPlayFabCloud(roomA.code);
    updateX1PlayerProgress({
      code: roomA.code,
      playerId: "aluno_b",
      score: 60,
      correct: 4,
      wrong: 0,
      currentQuestionIdx: 4,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Verifica que HostState e GuestState existem separadamente no SharedGroup da sala!
    const roomGroup = pf.groups.get(`x1_room_${roomA.code.toLowerCase()}`);
    assert.ok(roomGroup?.data.has("HostState"));
    assert.ok(roomGroup?.data.has("GuestState"));

    // Ao sincronizar de volta no aparelho do Host, os dois placares coexistem sem Lost Update!
    loginAs("TK_ALUNO_A", "aluno_a");
    await syncX1WithPlayFabCloud(roomA.code);
    const finalMerged = getX1Room(roomA.code)!;
    assert.equal(finalMerged.host.score, 45);
    assert.equal(finalMerged.guest?.score, 60);
  });

  it("LobbySnapshot com jogadores de 5 horas atrás NÃO forja falso online na Arena X1", async () => {
    loginAs("TK_ALUNO_A", "aluno_a");
    const fiveHoursAgo = fakeNowMs - 5 * 3_600_000;
    const recent = fakeNowMs - 15_000;

    pf.groups.set("X1_LOBBY_SEMED_V2", {
      members: new Set(["1B2E1517154B2D49"]),
      data: new Map([
        [
          "LobbySnapshot",
          {
            LastUpdated: new Date(fakeNowMs).toISOString(),
            Value: JSON.stringify({
              players: {
                old_player: {
                  playerId: "old_player",
                  nick: "Offline5h",
                  fullName: "Offline 5h",
                  school: "SEMED",
                  level: 8,
                  lastSeenAt: fiveHoursAgo,
                  lastSeenServerMs: fiveHoursAgo,
                },
                fresh_player: {
                  playerId: "fresh_player",
                  nick: "OnlineAgora",
                  fullName: "Online Agora",
                  school: "SEMED",
                  level: 8,
                  lastSeenAt: recent,
                  lastSeenServerMs: recent,
                },
              },
              rooms: {},
              deletedRooms: {},
              invites: [],
            }),
          },
        ],
      ]),
    });

    await syncX1WithPlayFabCloud();
    const snap = getX1LobbySnapshot("viewer_x", "ViewerX");
    assert.equal(snap.onlinePlayers.some((p) => p.nick === "Offline5h"), false);
    assert.equal(snap.onlinePlayers.some((p) => p.nick === "OnlineAgora"), true);
  });
});
