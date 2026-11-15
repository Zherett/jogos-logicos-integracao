import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyX1RobotBattleAnswer,
  buildX1Board,
  cancelAllWaitingRoomsForHost,
  cancelWaitingX1Room,
  clearX1MatchHistory,
  computeScoreRaceBlueShare,
  createX1Room,
  finishX1RoomByTimeout,
  forfeitX1Match,
  generateDeterministicRobotClashQuestion,
  generateRoomCode,
  getActiveRotatedX1Game,
  getX1DurationForGame,
  getX1LobbySnapshot,
  getX1Room,
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
  X1_MINADO_TURN_SELECT_TIMEOUT_SEC,
  X1_ROBOT_INITIAL_HP,
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
        hostNick: "QUEMUEL",
        hostSchool: "SEMED - Gestão Central",
        hostScore: 130,
        guestNick: "Robô Desafiante",
        guestSchool: "SEMED - Gestão Central",
        guestScore: 70,
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
});
