import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __setX1ServerClockOffsetForTests,
  applyX1RobotBattleAnswer,
  buildX1Board,
  cancelAllWaitingRoomsForHost,
  cancelWaitingX1Room,
  canonicalizeRoomForSyncComparison,
  clearX1MatchHistory,
  computeScoreRaceBlueShare,
  confirmX1HostReady,
  createX1Room,
  finishX1RoomByTimeout,
  forfeitX1DisconnectedOpponent,
  forfeitX1Match,
  generateDeterministicRobotClashQuestion,
  generateRoomCode,
  getActiveRotatedX1Game,
  getX1DurationForGame,
  getX1LobbySnapshot,
  getX1Room,
  getX1ServerNow,
  heartbeatOnlinePlayer,
  joinX1Room,
  loadX1HistoryMeta,
  loadX1MatchHistory,
  markAllX1MatchesRead,
  mergeX1RoomStates,
  recordX1MatchFinished,
  resolveX1Winner,
  sanitizeX1AvailableGames,
  saveX1MatchHistory,
  startX1MatchAfterCountdown,
  timeoutX1MinadoTurnSelection,
  touchX1MatchHeartbeat,
  updateX1PlayerProgress,
  X1_COUNTDOWN_DURATION_SEC,
  X1_MATCH_DISCONNECT_TIMEOUT_MS,
  X1_MINADO_TURN_SELECT_TIMEOUT_SEC,
  X1_ROBOT_INITIAL_HP,
  X1_VICTORY_BONUS_XP,
  type X1Room,
} from "./x1-challenge.ts";
import { resolvePlayerAvatar } from "./avatar.ts";
import { getX1ArenaTheme } from "./x1-arenas.ts";
import { isAdminOrTestAccount } from "./player-profile.ts";

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

  it("impede o criador de entrar na própria sala e oculta sua sala da lista de salas abertas dele", () => {
    const created = createX1Room({
      host: { playerId: "host_self_check", nick: "Criador", school: "Escola A", level: 6 },
      gameId: "rpg",
    });

    // Na visão do próprio criador, a sala não aparece como disponível para entrar
    const mySnap = getX1LobbySnapshot("host_self_check");
    assert.equal(
      mySnap.openRooms.some((r) => r.code === created.code),
      false,
    );

    // Na visão de outro colega, a sala aparece aberta normalmente
    const otherSnap = getX1LobbySnapshot("other_challenger");
    assert.equal(
      otherSnap.openRooms.some((r) => r.code === created.code),
      true,
    );

    // Se o próprio criador tentar entrar por código, recebe erro explícito e room null
    const selfJoin = joinX1Room({
      code: created.code,
      guest: { playerId: "host_self_check", nick: "Criador", school: "Escola A", level: 6 },
    });
    assert.equal(selfJoin.room, null);
    assert.ok(selfJoin.error?.includes("não pode entrar na própria sala"));

    cancelWaitingX1Room(created.code, "host_self_check");
  });

  it("destrói automaticamente sala anterior se o anfitrião criar outra ou sair da tela de espera", () => {
    const first = createX1Room({
      host: { playerId: "host_multi", nick: "Anfitriao", school: "Escola A", level: 6 },
      gameId: "rpg",
    });
    assert.ok(getX1Room(first.code));

    const second = createX1Room({
      host: { playerId: "host_multi", nick: "Anfitriao", school: "Escola A", level: 6 },
      gameId: "logica",
    });
    // A primeira sala deve ter sido imediatamente destruída
    assert.equal(getX1Room(first.code), null);
    assert.ok(getX1Room(second.code));

    // Ao sair da tela de espera, cancelAllWaitingRoomsForHost destrói a sala ativa
    const removedCount = cancelAllWaitingRoomsForHost("host_multi");
    assert.equal(removedCount, 1);
    assert.equal(getX1Room(second.code), null);
  });

  it("sincroniza entrada do desafiante e jogadas via mergeX1RoomStates mesmo com relógios dessincronizados", () => {
    const now = 1_700_000_000_000;
    const hostWaiting: X1Room = {
      ...makeSampleRoom(),
      status: "waiting",
      revision: 1,
      guest: null,
      host: {
        ...makeSampleRoom().host,
        // Relógio do anfitrião estava 30 segundos adiantado!
        updatedAt: now + 30_000,
      },
    };

    const guestJoinedRemote: X1Room = {
      ...hostWaiting,
      status: "countdown",
      revision: 11,
      countdownEndsAt: now - 15_000, // Relógio do desafiante atrasado
      guest: {
        ...makeSampleRoom().guest!,
        updatedAt: now - 25_000,
      },
    };

    // O anfitrião deve aceitar imediatamente a entrada do desafiante e normalizar os 10s localmente
    const mergedCountdown = mergeX1RoomStates(hostWaiting, guestJoinedRemote, now);
    assert.equal(mergedCountdown.status, "countdown");
    assert.ok(mergedCountdown.guest);
    assert.equal(mergedCountdown.countdownEndsAt, now + 10_000);

    // Durante o jogo (Score-Race), mescla o progresso de cada lado sem perder pontos de nenhum jogador
    const localPlaying: X1Room = {
      ...makeSampleRoom(),
      gameId: "logica",
      status: "playing",
      revision: 15,
      host: { ...makeSampleRoom().host, score: 45, correct: 3, wrong: 0, currentQuestionIdx: 3 },
      guest: { ...makeSampleRoom().guest!, score: 15, correct: 1, wrong: 0, currentQuestionIdx: 1 },
    };
    const remotePlaying: X1Room = {
      ...makeSampleRoom(),
      gameId: "logica",
      status: "playing",
      revision: 15,
      host: { ...makeSampleRoom().host, score: 30, correct: 2, wrong: 0, currentQuestionIdx: 2 },
      guest: { ...makeSampleRoom().guest!, score: 60, correct: 4, wrong: 0, currentQuestionIdx: 4 },
    };

    const mergedPlaying = mergeX1RoomStates(localPlaying, remotePlaying, now);
    assert.equal(mergedPlaying.host.score, 45);
    assert.equal(mergedPlaying.host.currentQuestionIdx, 3);
    assert.equal(mergedPlaying.guest?.score, 60);
    assert.equal(mergedPlaying.guest?.currentQuestionIdx, 4);

    // Na Batalha de Robôs (rpg), respostas simultâneas em dispositivos distintos preservam o deslocamento líquido de blueShare
    const localRpg: X1Room = {
      ...makeSampleRoom(),
      gameId: "rpg",
      status: "playing",
      revision: 20,
      blueShare: 68, // Host acertou 1 (+18 sobre 50)
      host: { ...makeSampleRoom().host, score: 15, correct: 1, wrong: 0, hp: 5 },
      guest: { ...makeSampleRoom().guest!, score: 0, correct: 0, wrong: 0, hp: 4 },
    };
    const remoteRpg: X1Room = {
      ...makeSampleRoom(),
      gameId: "rpg",
      status: "playing",
      revision: 21,
      blueShare: 32, // Guest acertou 1 (-18 sobre 50)
      host: { ...makeSampleRoom().host, score: 0, correct: 0, wrong: 0, hp: 4 },
      guest: { ...makeSampleRoom().guest!, score: 15, correct: 1, wrong: 0, hp: 5 },
    };
    const mergedRpg = mergeX1RoomStates(localRpg, remoteRpg, now);
    assert.equal(mergedRpg.host.correct, 1);
    assert.equal(mergedRpg.guest?.correct, 1);
    assert.equal(mergedRpg.host.hp, 4);
    assert.equal(mergedRpg.guest?.hp, 4);
    assert.equal(mergedRpg.blueShare, 50); // +18 do host e -18 do guest voltam ao equilíbrio 50%

    // Na transição countdown -> playing, normaliza startedAt se o relógio do outro aparelho estiver mais de 3s adiantado/atrasado
    const localCountdown: X1Room = {
      ...makeSampleRoom(),
      status: "countdown",
      revision: 11,
      countdownEndsAt: now + 1000,
    };
    const remoteStartedSkewed: X1Room = {
      ...localCountdown,
      status: "playing",
      revision: 12,
      startedAt: now - 8_000, // 8s atrasado no outro relógio
    };
    const mergedStarted = mergeX1RoomStates(localCountdown, remoteStartedSkewed, now);
    assert.equal(mergedStarted.status, "playing");
    assert.equal(mergedStarted.startedAt, now);
  });

  it("normaliza jogos fora dos 4 suportados no X1 para rpg e gera questionList para logica e porcentagem", () => {
    for (const gid of ["operacoes", "sequencias", "binario"] as const) {
      const r = createX1Room({
        host: { playerId: "h_extra", nick: "HostExtra", school: "SEMED", level: 7 },
        gameId: gid as never,
      });
      assert.equal(r.gameId, "rpg");
    }

    for (const gid of ["logica", "porcentagem"] as const) {
      const r = createX1Room({
        host: { playerId: `h_${gid}`, nick: `Host_${gid}`, school: "SEMED", level: 7 },
        gameId: gid,
      });
      const joined = joinX1Room({
        code: r.code,
        guest: { playerId: `g_${gid}`, nick: `Guest_${gid}`, school: "SEMED", level: 7 },
      });
      assert.equal(joined.error, null);
      assert.ok(joined.room?.questionList);
      assert.equal(joined.room?.questionList?.length, 25);
      assert.ok(joined.room?.questionList?.[0]?.options.length >= 2);
    }
  });

  it("localiza convites diretos mesmo se o ID de sessão do convidado mudar mantendo o mesmo nick", () => {
    const r = createX1Room({
      host: { playerId: "h_inv", nick: "Desafiante1", school: "SEMED", level: 8 },
      gameId: "rpg",
      inviteTargetPlayerId: "old_target_session",
      inviteTargetNick: "AlvoX1",
    });
    const snap = getX1LobbySnapshot("new_target_session", "alvox1");
    assert.ok(snap.myInvites.some((i) => i.roomCode === r.code));
  });

  it("gera questões determinísticas específicas para Lógica, Porcentagem e Batalha de Robôs", () => {
    const allRaceGames = ["logica", "porcentagem"] as const;

    for (const gid of allRaceGames) {
      const r = createX1Room({
        host: { playerId: `h_${gid}`, nick: `Host_${gid}`, school: "SEMED", level: 6 },
        gameId: gid,
      });
      const joined = joinX1Room({
        code: r.code,
        guest: { playerId: `g_${gid}`, nick: `Guest_${gid}`, school: "SEMED", level: 6 },
      });
      assert.equal(joined.error, null);
      assert.equal(joined.room?.questionList?.length, 25);
      const q0 = joined.room!.questionList![0]!;
      assert.ok(q0.options.includes(q0.answer));
    }

    // Batalha de Robôs gera a mesma questão para a mesma seed + passo
    const rq1 = generateDeterministicRobotClashQuestion(777888, 0);
    const rq2 = generateDeterministicRobotClashQuestion(777888, 0);
    assert.equal(rq1.text, rq2.text);
    assert.equal(rq1.answer, rq2.answer);
  });

  it("filtra entradas legadas de 'Robô Desafiante' e persiste limpar / marcar como lido no histórico do ADM", () => {
    clearX1MatchHistory();
    const room = makeSampleRoom();
    room.code = "9911";
    room.status = "finished";
    room.finishedAt = Date.now() + 2000;
    room.winnerId = "host_1";
    recordX1MatchFinished(room);

    // Tenta injetar um registro legado com Robô Desafiante
    const current = loadX1MatchHistory();
    assert.equal(current.length, 1);
    saveX1MatchHistory([
      ...current,
      {
        id: "legacy_bot_1",
        roomCode: "0001",
        gameId: "rpg",
        gameName: "Batalha de Robôs",
        hostNick: "QUEMUEL",
        hostSchool: "SEMED - Gestão Central",
        hostScore: 130,
        guestNick: "Robô Desafiante",
        guestSchool: "SEMED - Gestão Central",
        guestScore: 70,
        winnerId: "host_legacy",
        winnerNick: "QUEMUEL",
        finishedAt: new Date(Date.now() + 3000).toISOString(),
        read: false,
      },
    ]);

    // O filtro sanitizador remove automaticamente qualquer registro de Robô Desafiante
    const afterFilter = loadX1MatchHistory();
    assert.equal(afterFilter.some((e) => e.guestNick.includes("Robô")), false);
    assert.equal(afterFilter.length, 1);
    assert.equal(afterFilter[0]?.read, false);

    // Marcar todos como lidos atualiza read = true e persiste readUpToAt
    markAllX1MatchesRead();
    const afterRead = loadX1MatchHistory();
    assert.equal(afterRead[0]?.read, true);
    assert.ok(loadX1HistoryMeta().readUpToAt > 0);

    // Limpar histórico zera a lista e grava clearedAt para impedir ressurreição da nuvem
    clearX1MatchHistory();
    assert.equal(loadX1MatchHistory().length, 0);
    assert.ok(loadX1HistoryMeta().clearedAt > 0);
  });

  it("libera acesso irrestrito aos perfis ADM e de teste (JOSINEY, QUEMUEL, ZHERET, LORD) mesmo abaixo do Nível 5 e oculta jogadores já em partida ativa", () => {
    for (const nick of ["JOSINEY", "QUEMUEL", "ZHERET", "LORD"]) {
      assert.equal(isAdminOrTestAccount({ nick }), true);
    }
    assert.equal(isAdminOrTestAccount({ nick: "ALUNO_COMUM" }), false);

    // ZHERET e LORD no Nível 1 aparecem na lista online da Arena X1
    heartbeatOnlinePlayer({
      playerId: "test_zheret",
      nick: "ZHERET",
      fullName: "Zheret Test",
      school: "SEMED",
      level: 1,
    });
    heartbeatOnlinePlayer({
      playerId: "test_lord",
      nick: "LORD",
      fullName: "Lord Test",
      school: "SEMED",
      level: 2,
    });
    const snapBefore = getX1LobbySnapshot("viewer_1", "Viewer");
    assert.equal(snapBefore.onlinePlayers.some((p) => p.nick === "ZHERET"), true);
    assert.equal(snapBefore.onlinePlayers.some((p) => p.nick === "LORD"), true);

    // Quando ZHERET e LORD entram em uma partida ativa, deixam de aparecer como livres para convite
    const matchRoom = createX1Room({
      host: { playerId: "test_zheret", nick: "ZHERET", school: "SEMED", level: 1 },
      gameId: "rpg",
    });
    joinX1Room({
      code: matchRoom.code,
      guest: { playerId: "test_lord", nick: "LORD", school: "SEMED", level: 2 },
    });
    const snapDuring = getX1LobbySnapshot("viewer_1", "Viewer");
    assert.equal(snapDuring.onlinePlayers.some((p) => p.nick === "ZHERET"), false);
    assert.equal(snapDuring.onlinePlayers.some((p) => p.nick === "LORD"), false);
  });

  it("passa a vez automaticamente no Campo Minado 1v1 após 25s de inatividade na escolha de carta", () => {
    const created = createX1Room({
      host: { playerId: "min_h", nick: "MinHost", school: "SEMED", level: 5 },
      gameId: "minado",
    });
    joinX1Room({
      code: created.code,
      guest: { playerId: "min_g", nick: "MinGuest", school: "SEMED", level: 5 },
    });
    const started = startX1MatchAfterCountdown(created.code)!;
    assert.equal(started.status, "playing");
    const initialTurn = started.minadoState!.currentTurnPlayerId;

    // Simula que o turno começou há 26 segundos
    started.minadoState!.turnStartedAt = Date.now() - (X1_MINADO_TURN_SELECT_TIMEOUT_SEC + 1) * 1000;
    const afterTimeout = timeoutX1MinadoTurnSelection(created.code);
    assert.ok(afterTimeout.room);
    assert.notEqual(afterTimeout.room!.minadoState!.currentTurnPlayerId, initialTurn);
  });

  it("desempata corrida de pontos pelo menor tempo de conclusão quando ambos concluem todas as questões empatados", () => {
    const room = makeSampleRoom();
    room.gameId = "logica";
    room.host.score = 200;
    room.guest!.score = 200;
    room.host.correct = 20;
    room.guest!.correct = 20;
    room.host.wrong = 5;
    room.guest!.wrong = 5;
    room.host.finished = true;
    room.guest!.finished = true;
    room.host.updatedAt = 1_000_000;
    room.guest!.updatedAt = 1_005_000; // Guest terminou 5s depois

    assert.equal(resolveX1Winner(room), "host_1");
  });

  it("restringe X1 apenas aos 4 jogos permitidos e define durações corretas (Minado sem limite, Lógica/Porcentagem 90s, RPG 5min)", () => {
    const sanitized = sanitizeX1AvailableGames(["memoria", "spacequest", "rpg", "minado", "cartesiano"]);
    assert.deepEqual(sanitized, ["rpg", "minado"]);

    assert.equal(getX1DurationForGame("minado"), 0);
    assert.equal(getX1DurationForGame("logica"), 90);
    assert.equal(getX1DurationForGame("porcentagem"), 90);
    assert.equal(getX1DurationForGame("rpg"), 300);

    const minadoRoom = createX1Room({
      host: { playerId: "h_dur", nick: "HostDur", school: "SEMED", level: 5 },
      gameId: "minado",
    });
    assert.equal(minadoRoom.durationSec, 0);
    // Campo Minado não deve encerrar via finishX1RoomByTimeout
    const afterTimeout = finishX1RoomByTimeout(minadoRoom.code);
    assert.equal(afterTimeout?.status, "waiting");
  });

  it("gera tabuleiros de Campo Minado 4x4 (16), 6x6 padrão (36) e 8x8 (64)", () => {
    assert.equal(buildX1Board(1234, 4).length, 16);
    assert.equal(buildX1Board(1234, 6).length, 36);
    assert.equal(buildX1Board(1234, 8).length, 64);

    const created = createX1Room({
      host: { playerId: "h_6x6", nick: "Host6", school: "SEMED", level: 5 },
      gameId: "minado",
    });
    joinX1Room({
      code: created.code,
      guest: { playerId: "g_6x6", nick: "Guest6", school: "SEMED", level: 5 },
    });
    const room6 = getX1Room(created.code)!;
    assert.equal(room6.minadoState?.gridSize, 6);
    assert.equal(room6.minadoState?.board.length, 36);
  });

  it("converge deterministicamente o merge do RPG mesmo com Super Hit concorrente", () => {
    const base = makeSampleRoom();
    base.rpgEvents = [];

    // Host acerta 3 vezes seguidas (+18, +18, +18 => 50 -> 68 -> 86 -> Super Hit 55, guest HP 5->4->3->0)
    let hostView = structuredClone(base);
    hostView = applyX1RobotBattleAnswer({ room: hostView, role: "host", isCorrect: true }).room;
    hostView = applyX1RobotBattleAnswer({ room: hostView, role: "host", isCorrect: true }).room;
    hostView = applyX1RobotBattleAnswer({ room: hostView, role: "host", isCorrect: true }).room;

    // Guest respondeu simultaneamente antes de receber as respostas do host
    let guestView = structuredClone(base);
    guestView = applyX1RobotBattleAnswer({ room: guestView, role: "guest", isCorrect: true }).room;

    const mergedFromHost = mergeX1RoomStates(hostView, guestView);
    const mergedFromGuest = mergeX1RoomStates(guestView, hostView);

    assert.equal(mergedFromHost.blueShare, mergedFromGuest.blueShare);
    assert.equal(mergedFromHost.host.hp, mergedFromGuest.host.hp);
    assert.equal(mergedFromHost.guest?.hp, mergedFromGuest.guest?.hp);
    assert.equal(mergedFromHost.status, mergedFromGuest.status);
  });

  it("gera temas de arena determinísticos pela seed e preserva avatar personalizado com fallback", () => {
    const t1 = getX1ArenaTheme(42);
    const t2 = getX1ArenaTheme(42);
    assert.equal(t1.id, t2.id);

    const customAvatar = {
      chassisId: "titan" as const,
      headShape: "star" as const,
      visorId: "laser" as const,
      primaryColor: "#9333ea",
      accentColor: "#facc15",
      accessoryId: "wings" as const,
      emblemId: "crown" as const,
    };
    const resolvedCustom = resolvePlayerAvatar(customAvatar, 99, "left");
    assert.equal(resolvedCustom.headShape, "star");
    assert.equal(resolvedCustom.primaryColor, "#9333ea");

    const fallbackLeft = resolvePlayerAvatar(undefined, 99, "left");
    const fallbackRight = resolvePlayerAvatar(undefined, 99, "right");
    assert.ok(fallbackLeft.headShape);
    assert.notEqual(fallbackLeft.primaryColor, fallbackRight.primaryColor);
  });

  it("não declara W.O. falso logo após iniciar partida mesmo com relógio dessincronizado e ancora relógio na transição", () => {
    const r = createX1Room({
      host: { playerId: "h_sync", nick: "HostSync", school: "SEMED", level: 7 },
      gameId: "logica",
    });
    const joined = joinX1Room({
      code: r.code,
      guest: { playerId: "g_sync", nick: "GuestSync", school: "SEMED", level: 7 },
    });
    assert.ok(joined.room);

    // Simula diferença de relógio de 1 minuto no guest durante a transição waiting -> countdown
    const localNow = Date.now();
    const skewedRemote = structuredClone(joined.room!);
    skewedRemote.countdownEndsAt = localNow - 50_000;
    const hostCountdown = mergeX1RoomStates(r, skewedRemote, localNow);
    assert.equal(hostCountdown.status, "countdown");
    assert.ok(
      Math.abs((hostCountdown.countdownEndsAt ?? 0) - (localNow + X1_COUNTDOWN_DURATION_SEC * 1000)) <= 50,
    );

    const started = startX1MatchAfterCountdown(r.code)!;
    assert.equal(started.status, "playing");

    // Mesmo que opp.lastSeenAt esteja atrasado, não pode dar W.O. antes de X1_MATCH_DISCONNECT_TIMEOUT_MS reais
    const earlyWo = forfeitX1DisconnectedOpponent(r.code, "h_sync", X1_MATCH_DISCONNECT_TIMEOUT_MS);
    assert.equal(earlyWo, null);

    // Heartbeat de partida atualiza lastSeenAt sem incrementar revision (evita sobrescrever respostas)
    const prevRev = started.revision ?? 1;
    const touched = touchX1MatchHeartbeat(r.code, "g_sync")!;
    assert.equal(touched.revision ?? 1, prevRev);
    assert.ok((touched.guest?.lastSeenAt ?? 0) > 0);
  });

  it("contagem regressiva simultânea (handshake + UTC): Host (+45s) e Guest (-30s) chegam em VAI! exatamente no mesmo instante", async () => {
    try {
      const realServerTime = 1_750_000_000_000;
      const hostLocalNow = realServerTime + 45_000; // Relógio do Host 45s adiantado
      const guestLocalNow = realServerTime - 30_000; // Relógio do Guest 30s atrasado

      // 1. Guest entra com awaitHostHandshake=true -> aguarda confirmação do Host (countdownEndsAt ainda null)
      const created = createX1Room({
        host: { playerId: "h_sim", nick: "HostSim", school: "SEMED", level: 7 },
        gameId: "logica",
      });
      __setX1ServerClockOffsetForTests(realServerTime - guestLocalNow); // +30s offset no Guest
      const joined = joinX1Room({
        code: created.code,
        guest: { playerId: "g_sim", nick: "GuestSim", school: "SEMED", level: 7 },
        awaitHostHandshake: true,
      });
      assert.ok(joined.room);
      assert.equal(joined.room!.hostReady, false);
      assert.equal(joined.room!.countdownEndsAtServerMs, null);

      // 2. Host recebe a sala e confirma prontidão (calibrado com offset -45s)
      __setX1ServerClockOffsetForTests(realServerTime - hostLocalNow);
      const hostConfirmed = await confirmX1HostReady(created.code);
      assert.ok(hostConfirmed);
      assert.equal(hostConfirmed!.hostReady, true);
      assert.ok(typeof hostConfirmed!.countdownEndsAtServerMs === "number");
      const targetStartUtc = hostConfirmed!.countdownEndsAtServerMs!;

      // 3. Guest recebe a sala confirmada 800ms depois (no relógio UTC real)
      __setX1ServerClockOffsetForTests(realServerTime - guestLocalNow);
      const guestMerged = mergeX1RoomStates(joined.room!, hostConfirmed!, guestLocalNow + 800);
      // NÃO pode ter reiniciado os 10s! Ambos devem apontar para o MESMO timestamp absoluto UTC!
      assert.equal(guestMerged.countdownEndsAtServerMs, targetStartUtc);

      // No mesmo instante real (realServerTime + 4000ms), ambos veem exatamente o mesmo tempo restante!
      const checkUtc = realServerTime + 4000;
      __setX1ServerClockOffsetForTests(realServerTime - hostLocalNow);
      const hostRemMs = hostConfirmed!.countdownEndsAtServerMs! - getX1ServerNow(hostLocalNow + 4000);
      __setX1ServerClockOffsetForTests(realServerTime - guestLocalNow);
      const guestRemMs = guestMerged.countdownEndsAtServerMs! - getX1ServerNow(guestLocalNow + 4000);
      assert.equal(hostRemMs, guestRemMs);
      assert.ok(checkUtc > 0);
    } finally {
      __setX1ServerClockOffsetForTests(null);
    }
  });

  it("encerramento por timeout preserva últimas respostas do oponente no merge (sem descartar pontos finais) e W.O. explícito preserva vencedor", () => {
    const base = makeSampleRoom();
    base.gameId = "logica";
    base.status = "playing";
    base.host.score = 60;
    base.host.correct = 4;
    base.guest!.score = 30;
    base.guest!.correct = 2;

    // Host encerra por timeout usando snapshot desatualizado do Guest (30 pts) -> acha que Host venceu
    const hostFinished: X1Room = structuredClone(base);
    hostFinished.status = "finished";
    hostFinished.finishedAt = Date.now();
    hostFinished.winnerId = hostFinished.host.playerId;

    // Guest tinha acabado de responder mais 3 questões (75 pts) nos últimos 1.2s
    const guestStillPlaying: X1Room = structuredClone(base);
    guestStillPlaying.guest!.score = 75;
    guestStillPlaying.guest!.correct = 5;
    guestStillPlaying.guest!.currentQuestionIdx = 5;

    // Tanto Guest recebendo hostFinished quanto Host recebendo guestStillPlaying devem convergir para Guest (75 > 60)!
    const mergedOnGuest = mergeX1RoomStates(guestStillPlaying, hostFinished);
    const mergedOnHost = mergeX1RoomStates(hostFinished, guestStillPlaying);
    assert.equal(mergedOnGuest.guest?.score, 75);
    assert.equal(mergedOnHost.guest?.score, 75);
    assert.equal(mergedOnGuest.winnerId, "guest_2");
    assert.equal(mergedOnHost.winnerId, "guest_2");

    // Já em desistência explícita (W.O.), mesmo que o desistente tivesse mais pontos, o oponente continua vencedor
    const guestForfeited: X1Room = structuredClone(guestStillPlaying);
    guestForfeited.status = "finished";
    guestForfeited.forfeitByPlayerId = "guest_2";
    guestForfeited.winnerId = "host_1";
    const mergedWo = mergeX1RoomStates(guestStillPlaying, guestForfeited);
    assert.equal(mergedWo.winnerId, "host_1");
  });

  it("desempate por velocidade usa finishedAtServerMs imutável e não é corrompido por touchX1MatchHeartbeat", () => {
    try {
      const baseUtc = 1_760_000_000_000;
      const created = createX1Room({
        host: { playerId: "h_spd", nick: "HostSpd", school: "SEMED", level: 7 },
        gameId: "logica",
      });
      joinX1Room({
        code: created.code,
        guest: { playerId: "g_spd", nick: "GuestSpd", school: "SEMED", level: 7 },
      });
      startX1MatchAfterCountdown(created.code);

      // Host termina todas as questões em baseUtc + 40s
      __setX1ServerClockOffsetForTests(baseUtc + 40_000 - Date.now());
      updateX1PlayerProgress({
        code: created.code,
        playerId: "h_spd",
        score: 300,
        correct: 20,
        wrong: 5,
        currentQuestionIdx: 25,
        finished: true,
      });

      // Heartbeat do Host roda 15s depois enquanto espera o Guest: NÃO pode alterar updatedAt nem finishedAtServerMs!
      __setX1ServerClockOffsetForTests(baseUtc + 55_000 - Date.now());
      const afterHb = touchX1MatchHeartbeat(created.code, "h_spd")!;
      assert.equal(afterHb.host.finished, true);
      const hostFinServer = afterHb.host.finishedAtServerMs!;

      // Guest termina 20s depois do Host empatado em pontos/acertos/erros
      __setX1ServerClockOffsetForTests(baseUtc + 60_000 - Date.now());
      const finalRoom = updateX1PlayerProgress({
        code: created.code,
        playerId: "g_spd",
        score: 300,
        correct: 20,
        wrong: 5,
        currentQuestionIdx: 25,
        finished: true,
      })!;

      assert.equal(finalRoom.status, "finished");
      assert.ok(hostFinServer < finalRoom.guest!.finishedAtServerMs!);
      assert.equal(finalRoom.winnerId, "h_spd");
    } finally {
      __setX1ServerClockOffsetForTests(null);
    }
  });

  it("Campo Minado 1v1: turnSeq impede perda de timeout de 25s na mesclagem mesmo com mesmo número de cartas reveladas", () => {
    const created = createX1Room({
      host: { playerId: "m_h2", nick: "MinH2", school: "SEMED", level: 6 },
      gameId: "minado",
    });
    joinX1Room({
      code: created.code,
      guest: { playerId: "m_g2", nick: "MinG2", school: "SEMED", level: 6 },
    });
    const started = startX1MatchAfterCountdown(created.code)!;
    const staleLocal = structuredClone(started);
    const initialTurn = started.minadoState!.currentTurnPlayerId;

    // Estoura os 25s no aparelho ativo -> turnSeq vai de 0 para 1 e passa a vez
    started.minadoState!.turnStartedAt = Date.now() - (X1_MINADO_TURN_SELECT_TIMEOUT_SEC + 2) * 1000;
    started.minadoState!.turnStartedAtServerMs =
      Date.now() - (X1_MINADO_TURN_SELECT_TIMEOUT_SEC + 2) * 1000;
    const timedOut = timeoutX1MinadoTurnSelection(created.code).room!;
    assert.equal((timedOut.minadoState?.turnSeq ?? 0) > (staleLocal.minadoState?.turnSeq ?? 0), true);

    // Mesmo se staleLocal tiver revision igual/alta, o estado com turnSeq maior vence
    staleLocal.revision = (timedOut.revision ?? 1) + 5;
    const merged = mergeX1RoomStates(staleLocal, timedOut);
    assert.notEqual(merged.minadoState?.currentTurnPlayerId, initialTurn);
  });

  it("Bloco 1.4 (X1-01/03/04/05/06/12): matchInstanceId, reentrada, canonical sync, F5 sem W.O., RPG consenso e bonus XP/tema", () => {
    // X1-12: constante alinhada com XP real de vitória (25) e getX1ArenaTheme seguro para NaN
    assert.equal(X1_VICTORY_BONUS_XP, 25);
    const nanTheme = getX1ArenaTheme(Number.NaN);
    assert.ok(nanTheme && typeof nanTheme.id === "string" && nanTheme.id.length > 0);

    // X1-01: instâncias diferentes com o mesmo código não misturam placar nem side-states antigos
    const oldInst: ReturnType<typeof makeSampleRoom> = {
      ...makeSampleRoom(),
      code: "7777",
      matchInstanceId: "inst_old",
      createdAt: 1_000_000,
      createdAtServerMs: 1_000_000,
      status: "finished",
      winnerId: "host_1",
      host: { ...makeSampleRoom().host, score: 90, correct: 6 },
    };
    const newInst: ReturnType<typeof makeSampleRoom> = {
      ...makeSampleRoom(),
      code: "7777",
      matchInstanceId: "inst_new",
      createdAt: 2_000_000,
      createdAtServerMs: 2_000_000,
      status: "waiting",
      guest: null,
      winnerId: null,
      host: { ...makeSampleRoom().host, score: 0, correct: 0 },
    };
    const separated = mergeX1RoomStates(oldInst, newInst, 2_000_000);
    assert.equal(separated.matchInstanceId, "inst_new");
    assert.equal(separated.status, "waiting");
    assert.equal(separated.host.score, 0);

    // X1-03: bloqueia 3º convidado, bloqueia sala encerrada e preserva progresso na reconexão do mesmo convidado
    const room = createX1Room({
      host: { playerId: "h_14", nick: "Host14", school: "SEMED", level: 7 },
      gameId: "logica",
    });
    const j1 = joinX1Room({
      code: room.code,
      guest: { playerId: "g_14", nick: "Guest14", school: "SEMED", level: 7 },
    });
    assert.equal(j1.error, null);
    startX1MatchAfterCountdown(room.code);
    updateX1PlayerProgress({
      code: room.code,
      playerId: "g_14",
      score: 45,
      correct: 3,
      wrong: 0,
      currentQuestionIdx: 3,
    });
    const jThird = joinX1Room({
      code: room.code,
      guest: { playerId: "intruder", nick: "Intruso", school: "SEMED", level: 7 },
    });
    assert.ok(jThird.error);
    const jReenter = joinX1Room({
      code: room.code,
      guest: { playerId: "g_14", nick: "Guest14", school: "SEMED", level: 7 },
    });
    assert.equal(jReenter.error, null);
    assert.equal(jReenter.room?.guest?.score, 45);
    assert.equal(jReenter.room?.status, "playing");

    // X1-04: canonicalizeRoomForSyncComparison ignora espelhos locais quando *ServerMs coincide
    const remoteSample: ReturnType<typeof makeSampleRoom> = {
      ...makeSampleRoom(),
      countdownEndsAtServerMs: 1_700_000_010_000,
      countdownEndsAt: 1_700_000_010_000,
      startedAtServerMs: 1_700_000_020_000,
      startedAt: 1_700_000_020_000,
    };
    const localSkewedMirror = structuredClone(remoteSample);
    localSkewedMirror.countdownEndsAt = 1_700_000_055_000;
    localSkewedMirror.startedAt = 1_700_000_065_000;
    assert.equal(
      canonicalizeRoomForSyncComparison(remoteSample),
      canonicalizeRoomForSyncComparison(localSkewedMirror),
    );

    // X1-05: após F5 (código novo sem observação local), primeiro check NÃO declara W.O. instantâneo
    const freshRoom = createX1Room({
      host: { playerId: "h_f5", nick: "HostF5", school: "SEMED", level: 7 },
      gameId: "logica",
    });
    joinX1Room({
      code: freshRoom.code,
      guest: { playerId: "g_f5", nick: "GuestF5", school: "SEMED", level: 7 },
    });
    const activeF5 = startX1MatchAfterCountdown(freshRoom.code)!;
    // Mesmo que startedAt esteja 60s atrás (como após reload longo), a 1ª verificação ancora localOppObservedAt em now
    activeF5.startedAt = Date.now() - 60_000;
    const woFirstPass = forfeitX1DisconnectedOpponent(
      activeF5.code,
      "h_f5",
      X1_MATCH_DISCONNECT_TIMEOUT_MS,
    );
    assert.equal(woFirstPass, null);

    // X1-06: consenso de término no RPG X1 congela vencedor contra eventos atrasados
    const rpgBase: ReturnType<typeof makeSampleRoom> = {
      ...makeSampleRoom(),
      code: "8844",
      gameId: "rpg",
      status: "finished",
      finishedAt: 1_700_000_100_000,
      finishedAtServerMs: 1_700_000_100_000,
      winnerId: "host_1",
      blueShare: 100,
      rpgEvents: [
        { id: "host:1", role: "host", seq: 1, isCorrect: true, serverTs: 1_700_000_010_000 },
        { id: "host:2", role: "host", seq: 2, isCorrect: true, serverTs: 1_700_000_020_000 },
        { id: "host:3", role: "host", seq: 3, isCorrect: true, serverTs: 1_700_000_030_000 },
      ],
    };
    const lateGuestEventRoom = structuredClone(rpgBase);
    lateGuestEventRoom.finishedAt = 1_700_000_105_000;
    lateGuestEventRoom.finishedAtServerMs = 1_700_000_105_000;
    lateGuestEventRoom.rpgEvents = [
      ...(rpgBase.rpgEvents ?? []),
      { id: "guest:1", role: "guest", seq: 1, isCorrect: true, serverTs: 1_700_000_011_000 },
    ];
    const rpgConsensus = mergeX1RoomStates(rpgBase, lateGuestEventRoom);
    assert.equal(rpgConsensus.status, "finished");
    assert.equal(rpgConsensus.winnerId, "host_1");
  });
});
