import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __setOfficialClockOffsetForTests,
  formatCoariDateBR,
  formatCoariTimeBR,
  getCoariDateKey,
  getCoariTimeParts,
  getOfficialClockOffsetMs,
  getOfficialNowMs,
  hasOfficialClockSync,
  isSameCoariDay,
  makeCoariDate,
  resetOfficialClockForTests,
  setOfficialClockSample,
  shiftDateKeyUTC,
  syncOfficialClock,
} from "./official-time.ts";
import { computeRateLimitBackoffMs, parseRetryAfterMs } from "./rate-limit.ts";
import { isSafeHttpOrRelativeMediaUrl } from "./media-url.ts";

describe("Relógio Oficial Unificado (official-time), Rate Limit e Mídia Segura (Bloco 2.1)", () => {
  afterEach(() => {
    resetOfficialClockForTests();
  });

  it("QUOTA-08: compartilha amostra do servidor e deduplica chamadas concorrentes respeitando TTL e force", async () => {
    let calls = 0;
    const serverIso = "2026-11-27T02:30:00.000Z"; // 22:30 do dia 26 em Coari (UTC-4)
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return serverIso;
    };

    // Duas chamadas simultâneas sem force compartilham a mesma requisição
    const [t1, t2] = await Promise.all([
      syncOfficialClock(fetcher),
      syncOfficialClock(fetcher),
    ]);
    assert.equal(calls, 1);
    assert.ok(t1 !== null && t2 !== null);
    assert.equal(hasOfficialClockSync(), true);

    // Chamada subsequente dentro do TTL reaproveita o relógio sem bater na rede
    const t3 = await syncOfficialClock(fetcher, { ttlMs: 60_000 });
    assert.equal(calls, 1);
    assert.ok(t3 !== null);

    // Chamada com force: true ignora cache e consulta novamente
    const t4 = await syncOfficialClock(fetcher, { force: true });
    assert.equal(calls, 2);
    assert.ok(t4 !== null);
  });

  it("ECON-26: converte timestamps UTC corretamente para o fuso oficial Coari/AM (UTC-4)", () => {
    // 2026-11-27 02:30 UTC === 2026-11-26 22:30 em Coari (UTC-4)
    const utcMs = Date.UTC(2026, 10, 27, 2, 30, 0);
    setOfficialClockSample(utcMs, 0);

    assert.equal(getCoariDateKey(utcMs), "2026-11-26");
    assert.equal(formatCoariDateBR(utcMs), "26/11/2026");
    assert.equal(formatCoariTimeBR(utcMs), "22:30");

    const parts = getCoariTimeParts(utcMs);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 11);
    assert.equal(parts.day, 26);
    assert.equal(parts.hour, 22);
    assert.equal(parts.minute, 30);

    const coariBuilt = makeCoariDate(2026, 10, 26, 22, 30, 0, 0);
    assert.equal(coariBuilt.getTime(), utcMs);
    assert.equal(isSameCoariDay(utcMs, Date.UTC(2026, 10, 27, 3, 59, 59)), true);
    assert.equal(isSameCoariDay(utcMs, Date.UTC(2026, 10, 27, 4, 0, 0)), false);

    assert.equal(shiftDateKeyUTC("2026-12-01", -1), "2026-11-30");
    assert.equal(shiftDateKeyUTC("2026-02-28", 1), "2026-03-01");
  });

  it("resiste a salto de Date.now() após calibragem via __setOfficialClockOffsetForTests", () => {
    const fixedServerUtc = Date.UTC(2026, 10, 27, 14, 0, 0);
    __setOfficialClockOffsetForTests(fixedServerUtc - Date.now());
    assert.ok(Math.abs(getOfficialNowMs() - fixedServerUtc) < 250);
    assert.equal(typeof getOfficialClockOffsetMs(), "number");

    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 3 * 86_400_000;
      // Relógio ancorado em performance.now() continua marcando 2026-11-27 em Coari
      assert.equal(getCoariDateKey(), "2026-11-27");
    } finally {
      Date.now = realNow;
    }
  });

  it("QUOTA-01: calcula backoff exponencial e interpreta Retry-After com teto seguro", () => {
    assert.equal(parseRetryAfterMs("2"), 2000);
    assert.equal(parseRetryAfterMs("60"), 3000);
    assert.equal(computeRateLimitBackoffMs(0, null, () => 0), 400);
    assert.equal(computeRateLimitBackoffMs(1, null, () => 0.5), 900);
    assert.equal(computeRateLimitBackoffMs(0, "1.5", () => 0), 1500);
  });

  it("SEC-09: bloqueia /\\evil.com, //evil.com, traversal, controles e espaços em URLs de mídia", () => {
    assert.equal(isSafeHttpOrRelativeMediaUrl("https://cdn.semed.gov.br/carta.png"), true);
    assert.equal(isSafeHttpOrRelativeMediaUrl("/assets/robot-hero.png"), true);
    assert.equal(isSafeHttpOrRelativeMediaUrl("/\\evil.com/x.png"), false);
    assert.equal(isSafeHttpOrRelativeMediaUrl("//evil.com/x.png"), false);
    assert.equal(isSafeHttpOrRelativeMediaUrl("/assets/../secrets"), false);
    assert.equal(isSafeHttpOrRelativeMediaUrl("https://example.com/a b.png"), false);
    assert.equal(isSafeHttpOrRelativeMediaUrl("https://example.com/a\n.png"), false);
    assert.equal(isSafeHttpOrRelativeMediaUrl("javascript:alert(1)"), false);
  });
});
