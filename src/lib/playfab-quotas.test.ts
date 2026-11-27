import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getGameBestStatName,
  getSeasonXpStatName,
  playfabSignIn,
  playfabSignUp,
  pruneExpiredInboxReceiptsFromData,
  splitIntoPlayFabKeyBatches,
  splitRecordIntoPlayFabBatches,
} from "./playfab.ts";
import { DEFAULT_ADMIN_CONFIG, saveAdminConfig } from "./game-codes.ts";

describe("Blindagem de Quotas do PlayFab (Bloco 2.2)", () => {
  it("QUOTA-04: divide listas e registros em lotes de no máximo 10 chaves por UpdateSharedGroupData", () => {
    const keys = Array.from({ length: 25 }, (_, i) => `stu_aluno_${i}`);
    const keyBatches = splitIntoPlayFabKeyBatches(keys, 10);
    assert.equal(keyBatches.length, 3);
    assert.deepEqual(keyBatches.map((b) => b.length), [10, 10, 5]);

    const record: Record<string, string> = {};
    for (const k of keys) record[k] = "{}";
    const recBatches = splitRecordIntoPlayFabBatches(record, 10);
    assert.equal(recBatches.length, 3);
    assert.deepEqual(recBatches.map((b) => Object.keys(b).length), [10, 10, 5]);
  });

  it("QUOTA-03: alterna entre estatísticas legadas (_S<N>) e nomes fixos versionáveis sem duplicar por temporada", () => {
    assert.equal(getSeasonXpStatName({ seasonId: 4, useVersionedSeasonStats: false }), "XP_Season_S4");
    assert.equal(
      getSeasonXpStatName({ seasonId: 4, useVersionedSeasonStats: false }, "etapa_1"),
      "XP_Season_S4_etapa_1",
    );
    assert.equal(getSeasonXpStatName({ seasonId: 4, useVersionedSeasonStats: true }), "XP_Season_Current");
    assert.equal(
      getSeasonXpStatName({ seasonId: 4, useVersionedSeasonStats: true }, "etapa_2"),
      "XP_Season_etapa_2",
    );

    assert.equal(
      getGameBestStatName("logica", { seasonId: 4, useVersionedSeasonStats: true }),
      "Best_logica_Current",
    );
    assert.equal(
      getGameBestStatName("logica", { seasonId: 4, useVersionedSeasonStats: true }, "etapa_1"),
      "Best_logica_etapa_1",
    );
  });

  it("QUOTA-02: identifica recibos inbox_read_* / inbox_claim_* expirados (> 90d) fora de mensagens ativas", () => {
    const nowMs = Date.UTC(2026, 10, 27, 12, 0, 0);
    const oldIso = new Date(nowMs - 100 * 86_400_000).toISOString();
    const freshIso = new Date(nowMs - 5 * 86_400_000).toISOString();

    const expired = pruneExpiredInboxReceiptsFromData(
      {
        inbox_read_a_m1: { Value: JSON.stringify({ messageId: "m1", readAt: oldIso }), LastUpdated: oldIso },
        inbox_claim_a_m2: { Value: JSON.stringify({ messageId: "m2", claimedAt: oldIso }), LastUpdated: oldIso },
        inbox_read_b_m3: { Value: JSON.stringify({ messageId: "m3", readAt: freshIso }), LastUpdated: freshIso },
        outro_campo: { Value: "{}", LastUpdated: oldIso },
      },
      new Set(["m1"]),
      nowMs,
      90,
    );
    assert.deepEqual(expired, ["inbox_claim_a_m2"]);
  });

  it("SYNC-05: autentica no modo local/offline usando hash da senha literal (8+ chars) ou normalizada", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
    const store = new Map<string, string>();
    const fakeStorage = {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    const fakeWindow = {
      localStorage: fakeStorage,
      sessionStorage: fakeStorage,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as { window: unknown }).window = fakeWindow;
    (globalThis as { localStorage: unknown }).localStorage = fakeStorage;

    try {
      // Desativa Title ID na config local para exercitar exatamente o fluxo local/offline-first
      saveAdminConfig({ ...DEFAULT_ADMIN_CONFIG, playfabTitleId: "0" });

      const signUpRes = await playfabSignUp({
        nick: "aluno_offline",
        password: "20/01/2014",
        fullName: "Aluno Teste",
        school: "Raimundo Bezerra",
        grade: "6º ano",
        turma: "A",
        ageStage: "etapa_2",
      });
      assert.equal(signUpRes.error, null);
      assert.ok(signUpRes.account);

      // Login offline com exatamente o rawPassword cadastrado (com barras)
      const signInRaw = await playfabSignIn("aluno_offline", "20/01/2014");
      assert.equal(signInRaw.error, null);
      assert.equal(signInRaw.account?.profile.nickNormalized, "aluno_offline");

      // Senha incorreta retorna erro claro sem mencionar formulário inexistente de data
      const wrongPass = await playfabSignIn("aluno_offline", "999999");
      assert.equal(wrongPass.account, null);
      assert.ok(wrongPass.error && wrongPass.error.includes("coordenação/ADM"));
      assert.equal(wrongPass.needsRecovery, undefined);
    } finally {
      const g = globalThis as Record<string, unknown>;
      if (originalWindow === undefined) delete g.window;
      else g.window = originalWindow;
      if (originalLocalStorage === undefined) delete g.localStorage;
      else g.localStorage = originalLocalStorage;
    }
  });
});
