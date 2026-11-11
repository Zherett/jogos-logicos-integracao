import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePresenceStatus,
  formatPresenceTooltip,
  formatPresenceTimeAgo,
  computePresenceSummary,
  formatPlayerActivity,
  getPlayerActivityDetails,
  setPlayerCurrentActivity,
  getPlayerCurrentActivity,
  recordPlayerHeartbeat,
  compareStudentsByPresenceAndLevel,
  sortStudentsByPresenceAndLevel,
  PRESENCE_SORT_PRIORITY,
  PRESENCE_ONLINE_MAX_AGE_MS,
  PRESENCE_IDLE_MAX_AGE_MS,
  PRESENCE_DISCONNECT_MAX_AGE_MS,
} from "./presence.ts";

describe("Player Presence System (computePresenceStatus)", () => {
  const BASE_NOW = 1_000_000_000_000;

  it("returns offline for missing or invalid record", () => {
    assert.equal(computePresenceStatus(null, BASE_NOW), "offline");
    assert.equal(computePresenceStatus(undefined, BASE_NOW), "offline");
    assert.equal(computePresenceStatus({ lastSeenAt: 0 }, BASE_NOW), "offline");
  });

  it("returns offline if tab disconnected (lastSeenAt older than 2 minutes)", () => {
    // Interacted 1 minute ago, but heartbeat stopped 3 minutes ago
    const record = {
      lastSeenAt: BASE_NOW - (PRESENCE_DISCONNECT_MAX_AGE_MS + 1000),
      lastActiveAt: BASE_NOW - 60_000,
    };
    assert.equal(computePresenceStatus(record, BASE_NOW), "offline");
  });

  it("returns online (green) when user interacted within 2 minutes and heartbeat is alive", () => {
    // Interacted 1 minute ago, heartbeat 10 seconds ago
    const record = {
      lastSeenAt: BASE_NOW - 10_000,
      lastActiveAt: BASE_NOW - 60 * 1000,
    };
    assert.equal(computePresenceStatus(record, BASE_NOW), "online");

    // Exactly at 2 minute threshold
    const boundaryRecord = {
      lastSeenAt: BASE_NOW - 5_000,
      lastActiveAt: BASE_NOW - PRESENCE_ONLINE_MAX_AGE_MS,
    };
    assert.equal(computePresenceStatus(boundaryRecord, BASE_NOW), "online");
  });

  it("returns idle (yellow/amber) when user is connected but has had no interaction between 2 and 10 minutes", () => {
    // Interacted 6 minutes ago, heartbeat 15 seconds ago
    const record = {
      lastSeenAt: BASE_NOW - 15_000,
      lastActiveAt: BASE_NOW - 6 * 60 * 1000,
    };
    assert.equal(computePresenceStatus(record, BASE_NOW), "idle");

    // Exactly at 10 minute threshold
    const boundaryRecord = {
      lastSeenAt: BASE_NOW - 5_000,
      lastActiveAt: BASE_NOW - PRESENCE_IDLE_MAX_AGE_MS,
    };
    assert.equal(computePresenceStatus(boundaryRecord, BASE_NOW), "idle");
  });

  it("returns offline (red) when user has not interacted for over 10 minutes even if heartbeat was pulsed", () => {
    // Interacted 10 minutes and 1 second ago
    const record = {
      lastSeenAt: BASE_NOW - 10_000,
      lastActiveAt: BASE_NOW - (PRESENCE_IDLE_MAX_AGE_MS + 1000),
    };
    assert.equal(computePresenceStatus(record, BASE_NOW), "offline");
  });

  it("formats human-readable tooltips and time-ago strings accurately", () => {
    const onlineTooltip = formatPresenceTooltip("online");
    assert.ok(onlineTooltip.includes("Online — Ativo agora"));

    const idleTooltip = formatPresenceTooltip("idle", {
      lastActiveAt: BASE_NOW - 7 * 60 * 1000,
      lastSeenAt: BASE_NOW,
    }, BASE_NOW);
    assert.ok(idleTooltip.includes("Inativo"));
    assert.ok(idleTooltip.includes("7 min"));

    // Online há 15 minutos
    const fifteenMinAgo = formatPresenceTimeAgo({
      lastActiveAt: BASE_NOW - 15 * 60 * 1000,
      lastSeenAt: 0,
      disconnected: true,
    }, BASE_NOW);
    assert.equal(fifteenMinAgo, "Online há 15 minutos");

    // Online há 2 horas
    const twoHoursAgo = formatPresenceTimeAgo({
      lastActiveAt: BASE_NOW - 2 * 3600 * 1000,
      lastSeenAt: 0,
      disconnected: true,
    }, BASE_NOW);
    assert.equal(twoHoursAgo, "Online há 2 horas");

    // Online há 3 dias
    const threeDaysAgo = formatPresenceTimeAgo({
      lastActiveAt: BASE_NOW - 3 * 86400 * 1000,
      lastSeenAt: 0,
      disconnected: true,
    }, BASE_NOW);
    assert.equal(threeDaysAgo, "Online há 3 dias");

    // Nunca conectou
    assert.equal(formatPresenceTimeAgo(null, BASE_NOW), "Nunca conectou");
  });

  it("handles clock-skew-proof idleMs and explicit disconnect flag accurately", () => {
    // Disconnected explicitly -> immediately offline even if lastSeenAt was recent
    assert.equal(
      computePresenceStatus(
        {
          lastSeenAt: BASE_NOW - 5_000,
          lastActiveAt: BASE_NOW - 5_000,
          idleMs: 0,
          disconnected: true,
        },
        BASE_NOW,
      ),
      "offline",
    );

    // Heartbeat seen 10s ago on server, student was active 1 min ago on their own clock (idleMs = 60_000) -> online
    assert.equal(
      computePresenceStatus(
        {
          lastSeenAt: BASE_NOW - 10_000,
          lastActiveAt: BASE_NOW - 70_000,
          idleMs: 60_000,
        },
        BASE_NOW,
      ),
      "online",
    );

    // Heartbeat seen 10s ago on server, student was idle for 6 min on their own clock (idleMs = 360_000) -> idle
    assert.equal(
      computePresenceStatus(
        {
          lastSeenAt: BASE_NOW - 10_000,
          lastActiveAt: BASE_NOW - 370_000,
          idleMs: 6 * 60 * 1000,
        },
        BASE_NOW,
      ),
      "idle",
    );
  });

  describe("Player Activity Tracking (Rich Presence - O que o aluno está fazendo)", () => {
    it("mantém o offline intacto retornando null para formatPlayerActivity e getPlayerActivityDetails quando offline", () => {
      // Aluno offline
      const offlineRecord = {
        lastSeenAt: 0,
        disconnected: true,
        activity: { type: "game" as const, gameId: "memoria", gameName: "Memória das Cores" },
      };
      assert.equal(computePresenceStatus(offlineRecord, BASE_NOW), "offline");
      assert.equal(formatPlayerActivity(offlineRecord.activity, "offline"), null);
      assert.equal(getPlayerActivityDetails(offlineRecord, BASE_NOW), null);
    });

    it("formata corretamente atividade de jogos educativos (ex: Memória das Cores, Plano Cartesiano)", () => {
      const actMemoria = { type: "game" as const, gameId: "memoria" };
      assert.equal(formatPlayerActivity(actMemoria, "online"), "Jogando Memória das Cores");

      const actCartesiano = { type: "game" as const, gameId: "cartesiano", level: 3 };
      assert.equal(formatPlayerActivity(actCartesiano, "online"), "Jogando Plano Cartesiano (Nível 3)");

      const actSpaceQuestRanked = {
        type: "game" as const,
        gameId: "spacequest",
        mode: "torneio_semanal" as const,
        level: 5,
      };
      assert.equal(
        formatPlayerActivity(actSpaceQuestRanked, "online"),
        "Jogando Space Quest (Nível 5) • Ranqueada"
      );
    });

    it("formata corretamente atividades de navegação (ranking, perfil, medalhas, caixa de entrada, x1 e menu)", () => {
      assert.equal(formatPlayerActivity({ type: "ranking" }, "online"), "Visualizando o Ranking");
      assert.equal(formatPlayerActivity({ type: "profile" }, "online"), "Olhando o Perfil");
      assert.equal(formatPlayerActivity({ type: "medals" }, "online"), "Olhando Medalhas");
      assert.equal(formatPlayerActivity({ type: "inbox" }, "online"), "Na Caixa de Entrada");
      assert.equal(formatPlayerActivity({ type: "x1_arena" }, "online"), "Na Arena X1");
      assert.equal(formatPlayerActivity({ type: "tournament" }, "online"), "No Torneio Ranqueado");
      assert.equal(formatPlayerActivity({ type: "menu" }, "online"), "No Menu Principal");
    });

    it("getPlayerActivityDetails gera badge com ícone, cor e sufixo de inatividade se estiver idle", () => {
      const activeRecord = {
        lastSeenAt: BASE_NOW - 5000,
        lastActiveAt: BASE_NOW - 10000,
        activity: { type: "game" as const, gameId: "memoria" },
      };
      const activeDetails = getPlayerActivityDetails(activeRecord, BASE_NOW);
      assert.ok(activeDetails);
      assert.equal(activeDetails?.label, "Jogando Memória das Cores");
      assert.equal(activeDetails?.icon, "🎮");
      assert.equal(activeDetails?.isIdle, false);

      const idleRecord = {
        lastSeenAt: BASE_NOW - 5000,
        lastActiveAt: BASE_NOW - 5 * 60 * 1000,
        activity: { type: "ranking" as const },
      };
      const idleDetails = getPlayerActivityDetails(idleRecord, BASE_NOW);
      assert.ok(idleDetails);
      assert.equal(idleDetails?.label, "Visualizando o Ranking (inativo)");
      assert.equal(idleDetails?.icon, "🏆");
      assert.equal(idleDetails?.isIdle, true);
    });

    it("setPlayerCurrentActivity e getPlayerCurrentActivity armazenam e recuperam o estado", () => {
      setPlayerCurrentActivity({
        type: "game",
        gameId: "cartesiano",
        level: 2,
      });

      const current = getPlayerCurrentActivity();
      assert.equal(current.type, "game");
      assert.equal(current.gameId, "cartesiano");
      assert.equal(current.gameName, "Plano Cartesiano");
      assert.equal(current.level, 2);
    });

    it("recordPlayerHeartbeat armazena a atividade no registro do jogador", () => {
      const rec = recordPlayerHeartbeat("aluno_teste_act_1", {
        nick: "TesteAluno",
        activity: { type: "game", gameId: "rpg", level: 1 },
      });

      assert.ok(rec);
      assert.equal(rec?.activity?.gameId, "rpg");
      assert.equal(rec?.activity?.level, 1);
    });
  });

  describe("Student List Sorting (Online Priority + Level)", () => {
    it("prioritizes online > idle > offline and sorts by level descending within each status", () => {
      assert.equal(PRESENCE_SORT_PRIORITY.online, 0);
      assert.equal(PRESENCE_SORT_PRIORITY.idle, 1);
      assert.equal(PRESENCE_SORT_PRIORITY.offline, 2);

      const students = [
        { id: "off_high", nick: "Carlos", presenceStatus: "offline" as const, level: 10, xp: 9000 },
        { id: "idle_mid", nick: "Bruna", presenceStatus: "idle" as const, level: 5, xp: 2000 },
        { id: "on_low", nick: "Ana", presenceStatus: "online" as const, level: 1, xp: 10 },
        { id: "on_high", nick: "Diego", presenceStatus: "online" as const, level: 7, xp: 4000 },
        { id: "off_low", nick: "Eduardo", presenceStatus: "offline" as const, level: 2, xp: 300 },
        { id: "idle_high", nick: "Fernanda", presenceStatus: "idle" as const, level: 8, xp: 5200 },
      ];

      const originalOrder = students.map((s) => s.id);
      const sorted = sortStudentsByPresenceAndLevel(students, (s) => s);

      assert.deepEqual(
        sorted.map((s) => s.id),
        ["on_high", "on_low", "idle_high", "idle_mid", "off_high", "off_low"]
      );
      // Garante que o array original não foi mutado
      assert.deepEqual(
        students.map((s) => s.id),
        originalOrder
      );
    });

    it("prioritizes level over raw XP when missions lock a student at a lower level, and uses XP and nick as tiebreakers", () => {
      const students = [
        { id: "locked_xp", nick: "Zeca", presenceStatus: "online" as const, level: 3, xp: 2500 },
        { id: "unlocked_lvl", nick: "Bia", presenceStatus: "online" as const, level: 5, xp: 1800 },
        { id: "same_lvl_less_xp", nick: "Caio", presenceStatus: "online" as const, level: 5, xp: 1200 },
        { id: "same_lvl_tie_b", nick: "Lucas", presenceStatus: "offline" as const, level: 4, xp: 800 },
        { id: "same_lvl_tie_a", nick: "Alice", presenceStatus: "offline" as const, level: 4, xp: 800 },
      ];

      const sorted = sortStudentsByPresenceAndLevel(students, (s) => s);

      assert.deepEqual(
        sorted.map((s) => s.id),
        ["unlocked_lvl", "same_lvl_less_xp", "locked_xp", "same_lvl_tie_a", "same_lvl_tie_b"]
      );
      assert.ok(
        compareStudentsByPresenceAndLevel(
          { presenceStatus: "online", level: 1, xp: 0, nick: "A" },
          { presenceStatus: "offline", level: 10, xp: 9999, nick: "B" }
        ) < 0
      );
    });
  });
});
