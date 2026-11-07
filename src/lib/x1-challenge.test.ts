import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyX1RobotBattleAnswer,
  cancelWaitingX1Room,
  computeScoreRaceBlueShare,
  createX1Room,
  forfeitX1Match,
  generateRoomCode,
  getActiveRotatedX1Game,
  getX1Room,
  joinX1Room,
  resolveX1Winner,
  X1_ROBOT_INITIAL_HP,
  type X1Room,
} from "./x1-challenge.ts";

function makeSampleRoom(): X1Room {
  return {
    code: "4829",
    gameId: "rpg",
    status: "playing",
    seed: 12345,
    createdAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
    durationSec: 90,
    blueShare: 50,
    host: {
      playerId: "host_1",
      nick: "JoaoAzul",
      school: "Raimundo Bezerra",
      level: 3,
      score: 0,
      correct: 0,
      wrong: 0,
      hp: X1_ROBOT_INITIAL_HP,
      maxHp: X1_ROBOT_INITIAL_HP,
      finished: false,
      updatedAt: Date.now(),
    },
    guest: {
      playerId: "guest_2",
      nick: "MariaVermelha",
      school: "Elisângela Litaiff",
      level: 3,
      score: 0,
      correct: 0,
      wrong: 0,
      hp: X1_ROBOT_INITIAL_HP,
      maxHp: X1_ROBOT_INITIAL_HP,
      finished: false,
      updatedAt: Date.now(),
    },
    winnerId: null,
  };
}

describe("Arena de Desafio X1 Online (1v1 Versus Mode)", () => {
  it("gera códigos de sala de 4 dígitos únicos", () => {
    const code = generateRoomCode(["1000", "1001"]);
    assert.equal(code.length, 4);
    assert.match(code, /^\d{4}$/);
  });

  it("rotaciona 1 a 3 jogos da Arena X1 a cada 10 minutos (ou intervalo customizado)", () => {
    const games = ["rpg", "logica", "porcentagem"] as const;
    const t0 = new Date("2026-10-31T10:00:00.000Z"); // minuto 0 -> jogo 0 (rpg)
    const t1 = new Date("2026-10-31T10:10:00.000Z"); // minuto 10 -> jogo 1 (logica)
    const t2 = new Date("2026-10-31T10:20:00.000Z"); // minuto 20 -> jogo 2 (porcentagem)
    const t3 = new Date("2026-10-31T10:30:00.000Z"); // minuto 30 -> volta para jogo 0 (rpg)

    const r0 = getActiveRotatedX1Game({ availableGames: [...games], rotationMinutes: 10, now: t0 });
    assert.equal(r0.currentGame, "rpg");
    assert.equal(r0.nextGame, "logica");
    assert.equal(r0.secondsUntilNextRotation, 600);

    const r1 = getActiveRotatedX1Game({ availableGames: [...games], rotationMinutes: 10, now: t1 });
    assert.equal(r1.currentGame, "logica");
    assert.equal(r1.nextGame, "porcentagem");

    const r2 = getActiveRotatedX1Game({ availableGames: [...games], rotationMinutes: 10, now: t2 });
    assert.equal(r2.currentGame, "porcentagem");
    assert.equal(r2.nextGame, "rpg");

    const r3 = getActiveRotatedX1Game({ availableGames: [...games], rotationMinutes: 10, now: t3 });
    assert.equal(r3.currentGame, "rpg");
  });

  it("calcula a barra de vantagem Azul vs Vermelho na corrida de pontos", () => {
    assert.equal(computeScoreRaceBlueShare(50, 50), 50);
    assert.ok(computeScoreRaceBlueShare(90, 40) > 50);
    assert.ok(computeScoreRaceBlueShare(20, 80) < 50);
  });

  it("empurra a barra para a direita quando o Anfitrião (Azul) acerta e para a esquerda quando o Desafiante (Vermelho) acerta", () => {
    const initial = makeSampleRoom();

    // Host (Azul) acerta -> blueShare sobe de 50% para 68% e Guest perde 1 HP
    const afterHost = applyX1RobotBattleAnswer({
      room: initial,
      role: "host",
      isCorrect: true,
    });
    assert.equal(afterHost.room.blueShare, 68);
    assert.equal(afterHost.room.guest?.hp, X1_ROBOT_INITIAL_HP - 1);
    assert.equal(afterHost.damageDealt, 1);

    // Guest (Vermelho) acerta -> blueShare cai de 68% para 50% e Host perde 1 HP
    const afterGuest = applyX1RobotBattleAnswer({
      room: afterHost.room,
      role: "guest",
      isCorrect: true,
    });
    assert.equal(afterGuest.room.blueShare, 50);
    assert.equal(afterGuest.room.host.hp, X1_ROBOT_INITIAL_HP - 1);
  });

  it("dispara Super Golpe (-3 HP) quando o Azul chega em 100% ou o Vermelho chega em 0% e encerra quando a vida zera", () => {
    const room = makeSampleRoom();
    room.blueShare = 88;
    room.guest!.hp = 3;

    const superRes = applyX1RobotBattleAnswer({
      room,
      role: "host",
      isCorrect: true,
    });
    assert.equal(superRes.isSuperHit, true);
    assert.equal(superRes.damageDealt, 3);
    assert.equal(superRes.room.guest?.hp, 0);
    assert.equal(superRes.room.status, "finished");
    assert.equal(superRes.room.winnerId, "host_1");
    assert.equal( resolveX1Winner(superRes.room), "host_1");
  });

  it("determina vencedor de forma justa por pontuação e desempate por acertos", () => {
    const room = makeSampleRoom();
    room.gameId = "logica";

    // Host com mais pontos vence
    room.host.score = 120;
    room.guest!.score = 80;
    assert.equal(resolveX1Winner(room), "host_1");

    // Guest com mais pontos vence
    room.host.score = 90;
    room.guest!.score = 110;
    assert.equal(resolveX1Winner(room), "guest_2");

    // Empate em pontos -> desempata por maior número de acertos
    room.host.score = 100;
    room.guest!.score = 100;
    room.host.correct = 10;
    room.guest!.correct = 8;
    assert.equal(resolveX1Winner(room), "host_1");

    // Ambos empatados em pontos e acertos -> empate legítimo
    room.guest!.correct = 10;
    assert.equal(resolveX1Winner(room), "draw");
  });

  it("garante 5 vidas iniciais para cada jogador no Robô X1", () => {
    assert.equal(X1_ROBOT_INITIAL_HP, 5);
  });

  it("permite desistência (forfeit) concedendo vitória por W.O. ao oponente e finalizando a partida", () => {
    const created = createX1Room({
      host: { playerId: "host_test_1", nick: "HostTest", school: "Escola A", level: 5 },
      gameId: "rpg",
    });
    joinX1Room({
      code: created.code,
      guest: { playerId: "guest_test_2", nick: "GuestTest", school: "Escola B", level: 5 },
    });

    // Host desiste da partida
    const updated = forfeitX1Match(created.code, "host_test_1");
    assert.ok(updated);
    assert.equal(updated.status, "finished");
    assert.equal(updated.winnerId, "guest_test_2");
  });

  it("permite cancelar sala de espera antes de ser iniciada", () => {
    const created = createX1Room({
      host: { playerId: "host_cancel_me", nick: "HostCancel", school: "Escola A", level: 5 },
      gameId: "logica",
    });
    assert.ok(getX1Room(created.code));

    const ok = cancelWaitingX1Room(created.code, "host_cancel_me");
    assert.equal(ok, true);
    assert.equal(getX1Room(created.code), null);
  });

  it("determina vencedor no Campo Minado por pontos e desempata por MENOS erros", () => {
    const room = makeSampleRoom();
    room.gameId = "minado";

    // Host com mais pontos vence
    room.host.score = 50;
    room.guest!.score = 30;
    assert.equal(resolveX1Winner(room), "host_1");

    // Empate em pontos -> vence quem cometeu MENOS erros
    room.host.score = 40;
    room.guest!.score = 40;
    room.host.wrong = 2;
    room.guest!.wrong = 1;
    assert.equal(resolveX1Winner(room), "guest_2");

    // Empate em pontos e menos erros -> vence quem tiver mais acertos
    room.host.wrong = 1;
    room.guest!.wrong = 1;
    room.host.correct = 4;
    room.guest!.correct = 3;
    assert.equal(resolveX1Winner(room), "host_1");

    // Empate em tudo -> empate
    room.guest!.correct = 4;
    assert.equal(resolveX1Winner(room), "draw");
  });
});
