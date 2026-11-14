import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchLeaderboard,
  getPlayerPublicProfile,
  getStudentRosterCloudKey,
  syncSinglePlayerFromPlayFab,
} from "./playfab.ts";

const SESSION_KEY = "desafios-playfab-session-v1";
const REGISTRY_KEY = "desafios-playfab-registry-v1";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

interface RecordedFetchCall {
  endpoint: string;
  body: Record<string, unknown>;
}

describe("Otimizações de Performance PlayFab (Perfil, Ranking e ADM)", () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  const originalFetch = globalThis.fetch;

  let storage: ReturnType<typeof createMemoryStorage>;
  let fetchCalls: RecordedFetchCall[];

  beforeEach(() => {
    storage = createMemoryStorage();
    fetchCalls = [];

    (globalThis as Record<string, unknown>).localStorage = storage;
    (globalThis as Record<string, unknown>).window = {
      localStorage: storage,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };

    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        playerId: "aluno_alvo",
        playfabId: "PF_ALVO_1",
        sessionTicket: "TICKET_TESTE",
        nick: "AlunoAlvo",
      }),
    );

    storage.setItem(
      REGISTRY_KEY,
      JSON.stringify({
        aluno_alvo: {
          passwordHash: "hash1",
          unlocked: ["logica"],
          stats: [{ game_id: "logica", mode: "padrao", plays: 1, wins: 1, best_score: 100, best_level: 1 }],
          profile: {
            id: "stu_aluno_alvo",
            playfabId: "PF_ALVO_1",
            nick: "AlunoAlvo",
            nickNormalized: "aluno_alvo",
            full_name: "ALUNO ALVO TESTE",
            school: "E.M. Prof. Raimundo",
            grade: "5º ano",
            turma: "A",
            birthdate: "2015-05-10",
            xp: 120,
            seasonXp: 120,
            seasonId: 1,
            level: 2,
            wins: 1,
            matchesPlayed: 1,
            pointsBalance: 25,
            careerPoints: 25,
            badges: [],
            unlockedMedals: [],
          },
        },
        outro_aluno: {
          passwordHash: "hash2",
          unlocked: ["logica"],
          stats: [],
          profile: {
            id: "stu_outro_aluno",
            playfabId: "PF_OUTRO_2",
            nick: "OutroAluno",
            nickNormalized: "outro_aluno",
            full_name: "OUTRO ALUNO TESTE",
            school: "E.M. Prof. Raimundo",
            grade: "5º ano",
            turma: "B",
            birthdate: "2015-06-15",
            xp: 500,
            seasonXp: 500,
            seasonId: 1,
            level: 4,
            wins: 5,
            matchesPlayed: 5,
            pointsBalance: 100,
            careerPoints: 100,
            badges: [],
            unlockedMedals: [],
          },
        },
      }),
    );
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
  });

  it("syncSinglePlayerFromPlayFab busca apenas 1 chave do aluno e 1 GetUserData (sem varrer todos os alunos nem 24 leaderboards)", async () => {
    const expectedKey = getStudentRosterCloudKey("aluno_alvo");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const endpoint = url.split("/Client/")[1] ?? url;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      fetchCalls.push({ endpoint, body });

      if (endpoint === "GetSharedGroupData") {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              Data: {
                [expectedKey]: {
                  Value: JSON.stringify({
                    xp: 350,
                    seasonXp: 350,
                    level: 3,
                    wins: 4,
                    matchesPlayed: 6,
                    careerPoints: 80,
                    pointsBalance: 80,
                  }),
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (endpoint === "GetUserData") {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              Data: {
                GameStats: {
                  Value: JSON.stringify([
                    {
                      game_id: "logica",
                      mode: "padrao",
                      plays: 6,
                      wins: 4,
                      best_score: 240,
                      best_level: 3,
                    },
                  ]),
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (endpoint === "LoginWithCustomID") {
        return new Response(
          JSON.stringify({ code: 200, data: { SessionTicket: "ADMIN_TICKET_TESTE", PlayFabId: "PF_ADM" } }),
          { status: 200 },
        );
      }

      throw new Error(`Chamada PlayFab inesperada em syncSinglePlayerFromPlayFab: ${endpoint}`);
    }) as typeof fetch;

    const updated = await syncSinglePlayerFromPlayFab("stu_aluno_alvo");

    assert.ok(updated, "Perfil atualizado deve ser retornado");
    assert.ok(updated.xp >= 350, `XP esperado >= 350, recebido ${updated.xp}`);
    assert.equal(updated.matchesPlayed, 6);
    assert.equal(updated.stats?.[0]?.best_score, 240);

    // Garante apenas 1 GetSharedGroupData pontual, 1 GetUserData e 0 GetLeaderboard
    const sharedGroupCalls = fetchCalls.filter((c) => c.endpoint === "GetSharedGroupData");
    const userDataCalls = fetchCalls.filter((c) => c.endpoint === "GetUserData");
    const leaderboardCalls = fetchCalls.filter((c) => c.endpoint === "GetLeaderboard");

    assert.equal(sharedGroupCalls.length, 1, "Deve consultar GetSharedGroupData apenas 1 vez");
    assert.deepEqual(sharedGroupCalls[0].body.Keys, [expectedKey]);
    assert.equal(userDataCalls.length, 1, "Deve consultar GetUserData apenas 1 vez");
    assert.equal(userDataCalls[0].body.PlayFabId, "PF_ALVO_1");
    assert.equal(leaderboardCalls.length, 0, "Não deve disparar GetLeaderboard ao abrir perfil");

    // Garante que o outro aluno local não foi sobrescrito pelo aluno inspecionado
    const other = getPlayerPublicProfile("stu_outro_aluno");
    assert.equal(other?.nick, "OutroAluno");
    assert.equal(other?.matchesPlayed, 5);
    assert.ok((other?.xp ?? 0) >= 500);
  });

  it("fetchLeaderboard envia MaxResultsCount: 20, ProfileConstraints restrito e consulta GetLeaderboardAroundPlayer", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const endpoint = url.split("/Client/")[1] ?? url;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      fetchCalls.push({ endpoint, body });

      if (endpoint === "GetLeaderboard") {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              Leaderboard: [
                { PlayFabId: "PF_OUTRO_2", DisplayName: "OutroAluno", StatValue: 500, Position: 0 },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (endpoint === "GetLeaderboardAroundPlayer") {
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              Leaderboard: [
                { PlayFabId: "PF_ALVO_1", DisplayName: "AlunoAlvo", StatValue: 999, Position: 25 },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (endpoint === "GetSharedGroupData" || endpoint === "CreateSharedGroup") {
        return new Response(JSON.stringify({ code: 200, data: { Data: {} } }), { status: 200 });
      }

      return new Response(JSON.stringify({ code: 200, data: {} }), { status: 200 });
    }) as typeof fetch;

    const entries = await fetchLeaderboard({ kind: "xp_season", stage: "TODAS" }, 20);

    const lbCall = fetchCalls.find((c) => c.endpoint === "GetLeaderboard");
    const aroundCall = fetchCalls.find((c) => c.endpoint === "GetLeaderboardAroundPlayer");

    assert.ok(lbCall, "Deve chamar GetLeaderboard");
    assert.equal(lbCall.body.MaxResultsCount, 20);
    assert.deepEqual(lbCall.body.ProfileConstraints, { ShowDisplayName: true });

    assert.ok(aroundCall, "Deve chamar GetLeaderboardAroundPlayer para centralizar o aluno");
    assert.equal(aroundCall.body.MaxResultsCount, 5);
    assert.deepEqual(aroundCall.body.ProfileConstraints, { ShowDisplayName: true });

    // O valor ao vivo (999) retornado pelo GetLeaderboardAroundPlayer deve prevalecer para o aluno logado
    const alvoEntry = entries.find((e) => e.nick === "AlunoAlvo");
    assert.ok(alvoEntry, "AlunoAlvo deve constar no ranking");
    assert.equal(alvoEntry.value, 999);
  });
});
