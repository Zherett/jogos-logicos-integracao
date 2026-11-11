import { useCallback, useEffect, useRef, useState } from "react";
import {
  Swords,
  Trophy,
  Timer,
  Zap,
  Sparkles,
  Check,
  X,
  LogOut,
  Flame,
  Bomb,
  Gift,
  HelpCircle,
  Clock,
  RotateCcw,
  Heart,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShapeSvg } from "./ShapeSvg";
import { GAME_NAMES, saveLastMatch, updateBest } from "@/lib/game-storage";
import { usePlayerAuth } from "@/lib/player-auth";
import { type ClashQuestion } from "@/lib/rpg-content";
import { playCorrect, playTone, playWrong } from "@/lib/sound";
import {
  X1_MINADO_TURN_SELECT_TIMEOUT_SEC,
  answerX1MinadoQuestion,
  closeX1Room,
  finishX1RoomByTimeout,
  forfeitX1Match,
  generateDeterministicRobotClashQuestion,
  getX1Room,
  openX1MinadoCard,
  startX1MatchAfterCountdown,
  submitX1RobotClashAnswer,
  subscribeX1Updates,
  syncX1WithPlayFabCloud,
  timeoutX1MinadoQuestion,
  timeoutX1MinadoTurnSelection,
  updateX1PlayerProgress,
  type X1Room,
} from "@/lib/x1-challenge";

interface Props {
  initialRoom: X1Room;
  onExitX1: () => void;
}

export function X1MatchOverlay({ initialRoom, onExitX1 }: Props) {
  const auth = usePlayerAuth();
  const rawMyId = auth.profile?.id ?? initialRoom.host.playerId;
  const rawMyNick = (auth.profile?.nick ?? "").trim().toLowerCase();

  const [room, setRoom] = useState<X1Room>(initialRoom);
  const isHost =
    room.host.playerId === rawMyId ||
    Boolean(rawMyNick && room.host.nick.trim().toLowerCase() === rawMyNick);
  const myId = isHost ? room.host.playerId : (room.guest?.playerId ?? rawMyId);
  const me = isHost ? room.host : (room.guest ?? room.host);
  const opponent = isHost ? room.guest : room.host;

  const [secondsLeft, setSecondsLeft] = useState(initialRoom.durationSec);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [question, setQuestion] = useState<ClashQuestion>(() =>
    generateDeterministicRobotClashQuestion(initialRoom.seed, me.correct + me.wrong),
  );
  const [stunned, setStunned] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [minadoFeedback, setMinadoFeedback] = useState<string | null>(null);
  const rewardSavedRef = useRef(false);
  const [myQuestionIdx, setMyQuestionIdx] = useState(() => me.currentQuestionIdx ?? 0);
  const [confirmForfeitOpen, setConfirmForfeitOpen] = useState(false);

  // Cleanup imediato por desistência ao recarregar ou fechar a aba durante partida ativa
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (room.status === "playing" || room.status === "countdown") {
        forfeitX1Match(room.code, myId);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [room.status, room.code, myId]);

  const handleRequestExit = () => {
    if (room.status === "finished") {
      closeX1Room(room.code);
      onExitX1();
    } else {
      setConfirmForfeitOpen(true);
    }
  };

  const handleConfirmForfeit = () => {
    forfeitX1Match(room.code, myId);
    setConfirmForfeitOpen(false);
    onExitX1();
  };

  // Real-time updates subscription (BroadcastChannel, localStorage, PlayFab SharedGroup)
  useEffect(() => {
    const refresh = () => {
      const latest = getX1Room(initialRoom.code);
      if (latest) setRoom({ ...latest });
    };
    const unsub = subscribeX1Updates(refresh);
    void syncX1WithPlayFabCloud(initialRoom.code).then(refresh);
    const cloudInterval = window.setInterval(() => {
      void syncX1WithPlayFabCloud(initialRoom.code).then(refresh);
    }, 1200);

    return () => {
      unsub();
      window.clearInterval(cloudInterval);
    };
  }, [initialRoom.code]);

  // Synchronized countdown timer (10s) transition to playing
  useEffect(() => {
    if (room.status !== "countdown") return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      const endsAt = room.countdownEndsAt ?? (now + 10_000);
      if (now >= endsAt) {
        const started = startX1MatchAfterCountdown(room.code);
        if (started) setRoom({ ...started });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [room.status, room.code, room.countdownEndsAt]);

  // Main match timer
  useEffect(() => {
    if (room.status !== "playing") return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      const start = room.startedAt ?? room.createdAt;
      const elapsed = Math.floor((now - start) / 1000);
      const rem = Math.max(0, room.durationSec - elapsed);
      setSecondsLeft(rem);

      if (rem <= 0) {
        const finishedRoom = finishX1RoomByTimeout(room.code);
        if (finishedRoom) setRoom({ ...finishedRoom });
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [room.status, room.code, room.durationSec, room.startedAt, room.createdAt]);

  // Campo Minado active question timer (20s)
  useEffect(() => {
    if (room.gameId !== "minado" || room.status !== "playing") return;
    const activeQ = room.minadoState?.activeQuestion;
    if (!activeQ || activeQ.answered) return;

    // O jogador que abriu a carta dispara o timeout em expiresAt; o oponente aguarda +5s de margem caso haja desconexão
    const isMyActiveQuestion = activeQ.openedBy === myId;
    const effectiveDeadline = isMyActiveQuestion ? activeQ.expiresAt : activeQ.expiresAt + 5_000;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= effectiveDeadline) {
        playWrong();
        const updated = timeoutX1MinadoQuestion(room.code);
        if (updated.room) setRoom({ ...updated.room });
      }
    }, 400);

    return () => window.clearInterval(timer);
  }, [room.gameId, room.status, room.minadoState?.activeQuestion, room.code, myId]);

  // Campo Minado turn selection timer (25s sem abrir carta)
  useEffect(() => {
    if (room.gameId !== "minado" || room.status !== "playing") return;
    const minado = room.minadoState;
    if (!minado || minado.activeQuestion) return;

    const turnStartedAt = minado.turnStartedAt || room.startedAt || room.createdAt;
    const isMyTurn = minado.currentTurnPlayerId === myId;
    const deadline =
      turnStartedAt +
      X1_MINADO_TURN_SELECT_TIMEOUT_SEC * 1000 +
      (isMyTurn ? 0 : 3000);

    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= deadline) {
        playWrong();
        setMinadoFeedback("⏱️ Tempo de escolha esgotado! (−2 pts, vez passada)");
        window.setTimeout(() => setMinadoFeedback(null), 2200);
        const updated = timeoutX1MinadoTurnSelection(room.code);
        if (updated.room) setRoom({ ...updated.room });
      }
    }, 400);

    return () => window.clearInterval(timer);
  }, [
    room.gameId,
    room.status,
    room.minadoState?.activeQuestion,
    room.minadoState?.currentTurnPlayerId,
    room.minadoState?.turnStartedAt,
    room.startedAt,
    room.createdAt,
    room.code,
    myId,
  ]);

  // Auto-close countdown (1 minute) on finished screen
  useEffect(() => {
    if (room.status !== "finished") return;

    const autoCloseTimer = window.setInterval(() => {
      const autoCloseAt = room.autoCloseAt ?? (Date.now() + 60_000);
      if (Date.now() >= autoCloseAt) {
        closeX1Room(room.code);
        onExitX1();
      }
    }, 1000);

    return () => window.clearInterval(autoCloseTimer);
  }, [room.status, room.autoCloseAt, room.code, onExitX1]);

  // Save XP / victory / defeat / draw in profile when match finishes
  useEffect(() => {
    if (room.status !== "finished" || rewardSavedRef.current) return;
    rewardSavedRef.current = true;

    const wonX1 = room.winnerId === myId;
    const isDraw = room.winnerId === "draw";
    const finalScore = Math.max(me.score, wonX1 ? me.score + 40 : me.score);

    updateBest(room.gameId, finalScore, 2);
    saveLastMatch(room.gameId, {
      score: finalScore,
      level: 2,
      correct: me.correct,
      wrong: me.wrong,
      won: wonX1,
      mode: "x1_online",
    });

    if (auth.profile) {
      void auth.recordMatch({
        gameId: room.gameId,
        mode: "x1_online",
        won: wonX1,
        isDraw,
        score: finalScore,
        level: 2,
        correct: me.correct,
        wrong: me.wrong,
      });
    }
  }, [room.status, room.winnerId, room.gameId, myId, me.score, me.correct, me.wrong, auth]);

  // Robot battle answer handler
  const handleRobotAnswer = useCallback(
    (chosen: boolean) => {
      if (room.status !== "playing" || stunned) return;
      const isCorrect = chosen === question.answer;

      if (!isCorrect) {
        playWrong();
        setStunned(true);
        window.setTimeout(() => setStunned(false), 800);
      } else {
        playCorrect();
      }

      const res = submitX1RobotClashAnswer({
        code: room.code,
        playerId: myId,
        isCorrect,
      });

      if (res.isSuperHit) {
        playTone(980, 0.2, "sawtooth");
        setBanner("⚡ SUPER RAIO! Você tirou 3 de vida do oponente de uma vez!");
        window.setTimeout(() => setBanner(null), 2200);
      }

      if (res.room) setRoom({ ...res.room });

      const nextStep = me.correct + me.wrong + 1;
      const nextQ = generateDeterministicRobotClashQuestion(room.seed, nextStep);
      setQuestion(nextQ);
    },
    [room.status, room.code, room.seed, stunned, question, myId, me.correct, me.wrong],
  );

  // Score-race deterministic question answer handler (Logica / Porcentagem)
  const handleRaceAnswer = useCallback(
    (chosenAnswer: string) => {
      if (room.status !== "playing" || !room.questionList || stunned) return;
      const curQ = room.questionList[myQuestionIdx];
      if (!curQ) return;

      const isCorrect = chosenAnswer === curQ.answer;
      if (isCorrect) {
        playCorrect();
      } else {
        playWrong();
        setStunned(true);
        window.setTimeout(() => setStunned(false), 600);
      }

      const nextIdx = myQuestionIdx + 1;
      setMyQuestionIdx(nextIdx);

      const qPoints = Number.isFinite(curQ.points) ? curQ.points : 15;
      const newScore = isCorrect ? me.score + qPoints : Math.max(0, me.score - 5);
      const newCorrect = me.correct + (isCorrect ? 1 : 0);
      const newWrong = me.wrong + (isCorrect ? 0 : 1);
      const finished = nextIdx >= (room.questionList.length ?? 25);

      const updated = updateX1PlayerProgress({
        code: room.code,
        playerId: myId,
        score: newScore,
        correct: newCorrect,
        wrong: newWrong,
        currentQuestionIdx: nextIdx,
        finished,
      });

      if (updated) {
        setRoom({ ...updated });
      }
    },
    [room.status, room.questionList, room.code, myQuestionIdx, myId, me.score, me.correct, me.wrong, stunned],
  );

  // Campo Minado card click handler
  const handleMinadoCardClick = (cardIdx: number) => {
    if (room.status !== "playing" || !room.minadoState) return;
    if (room.minadoState.currentTurnPlayerId !== myId) return;
    if (room.minadoState.activeQuestion && !room.minadoState.activeQuestion.answered) return;

    const card = room.minadoState.board[cardIdx];
    if (!card || room.minadoState.revealed[card.id]) return;

    const res = openX1MinadoCard({
      code: room.code,
      playerId: myId,
      cardId: card.id,
    });
    if (!res.room) return;
    setRoom({ ...res.room });

    if (card.kind === "bonus") {
      if (card.points > 0) {
        playCorrect();
        setMinadoFeedback(`🎁 Bônus Encontrado! +${card.points} pontos.`);
        window.setTimeout(() => setMinadoFeedback(null), 2000);
      } else {
        playWrong();
        setMinadoFeedback(`💥 MINA ATIVADA! ${card.points} pontos.`);
        window.setTimeout(() => setMinadoFeedback(null), 2000);
      }
    }
  };

  // Campo Minado question answer handler
  const handleMinadoAnswer = (chosenOpt: string) => {
    if (room.status !== "playing" || !room.minadoState?.activeQuestion) return;
    const isCorrect = chosenOpt === room.minadoState.activeQuestion.answer;
    if (isCorrect) {
      playCorrect();
      setMinadoFeedback("✅ Resposta Correta! +5 pontos somados.");
    } else {
      playWrong();
      setMinadoFeedback("❌ Resposta Incorreta! −3 pontos e erro contabilizado.");
    }
    window.setTimeout(() => setMinadoFeedback(null), 2000);

    const res = answerX1MinadoQuestion({
      code: room.code,
      playerId: myId,
      option: chosenOpt,
    });
    if (res.room) setRoom({ ...res.room });
  };

  const redShare = Math.max(0, 100 - room.blueShare);
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  // Modal de confirmação de desistência reutilizável em todas as modalidades
  const forfeitModal = confirmForfeitOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <LogOut className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-black text-foreground">
            Desistir do Desafio X1?
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se você sair agora, seu oponente vencerá a partida por desistência (W.O.) e a sala será encerrada imediatamente.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmForfeitOpen(false)}
            className="h-10 rounded-xl font-bold"
          >
            Continuar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmForfeit}
            className="h-10 rounded-xl font-bold"
          >
            Sim, Desistir
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  // ==========================================
  // 1. TELA DE CONTAGEM REGRESSIVA SINCRONIZADA (10s)
  // ==========================================
  if (room.status === "countdown") {
    const endsAt = room.countdownEndsAt ?? (nowTick + 10_000);
    const countdownRem = Math.max(0, Math.ceil((endsAt - nowTick) / 1000));

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="mx-auto max-w-lg w-full rounded-3xl border-2 border-primary/50 bg-card p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 border border-primary/40 px-3.5 py-1 text-xs font-black uppercase text-primary animate-pulse">
            <Swords className="h-4 w-4" /> Desafio Aceito • Arena X1
          </span>

          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-black text-foreground">
              Prepare-se para o Duelo!
            </h2>
            <p className="text-xs text-muted-foreground">
              Modalidade: <b className="text-primary">{GAME_NAMES[room.gameId]}</b> • Sala #{room.code}
            </p>
          </div>

          {/* Confronto dos Jogadores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-sky-500/50 bg-sky-500/10 p-4">
              <span className="text-[10px] font-black uppercase text-sky-400">Lado Azul</span>
              <p className="font-display text-base font-black truncate">{room.host.nick}</p>
              <p className="text-[11px] text-muted-foreground truncate">{room.host.school}</p>
            </div>
            <div className="rounded-2xl border-2 border-red-500/50 bg-red-500/10 p-4">
              <span className="text-[10px] font-black uppercase text-red-400">Lado Vermelho</span>
              <p className="font-display text-base font-black truncate">{room.guest?.nick ?? "Oponente"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{room.guest?.school ?? ""}</p>
            </div>
          </div>

          {/* Contador Regressivo Gigante */}
          <div className="relative py-4">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border-4 border-primary bg-primary/10 text-primary shadow-xl shadow-primary/20 animate-bounce">
              <span className="font-mono text-5xl font-black">
                {countdownRem > 0 ? countdownRem : "VAI!"}
              </span>
            </div>
            <p className="mt-3 text-xs font-bold text-muted-foreground">
              A partida começará simultaneamente para os dois jogadores!
            </p>
          </div>

          <div className="pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestExit}
              className="h-9 rounded-xl text-xs text-muted-foreground hover:text-destructive"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sair / Desistir do Duelo
            </Button>
          </div>
        </div>
        {forfeitModal}
      </div>
    );
  }

  // ==========================================
  // 2. TELA DE RESULTADO DO X1 (FINALIZADA)
  // ==========================================
  if (room.status === "finished") {
    const iWon = room.winnerId === myId;
    const isDraw = room.winnerId === "draw";
    const autoCloseAt = room.autoCloseAt ?? (Date.now() + 60_000);
    const autoCloseRem = Math.max(0, Math.ceil((autoCloseAt - Date.now()) / 1000));

    return (
      <div className="mx-auto max-w-2xl rounded-3xl border-2 bg-card p-6 sm:p-8 shadow-2xl space-y-6 animate-pop-in">
        <div className="text-center space-y-2">
          <div
            className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${
              iWon
                ? "bg-success/15 text-success"
                : isDraw
                  ? "bg-accent/15 text-accent"
                  : "bg-destructive/15 text-destructive"
            }`}
          >
            <Trophy className="h-9 w-9" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
            {iWon
              ? "🏆 Você Venceu o Desafio X1!"
              : isDraw
                ? "🤝 Empate Épico no X1!"
                : `💪 ${opponent?.nick ?? "Oponente"} venceu este duelo!`}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Sala <b>#{room.code}</b> • {GAME_NAMES[room.gameId]}
          </p>
          {room.gameId === "minado" && isDraw && (
            <p className="text-xs text-muted-foreground italic">
              Critério: Pontuação e erros idênticos.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Card Anfitrião (Azul) */}
          <div
            className={`rounded-2xl border-2 p-4 text-center ${
              room.winnerId === room.host.playerId
                ? "border-sky-500 bg-sky-500/10"
                : "bg-secondary/40"
            }`}
          >
            <span className="text-[11px] font-extrabold uppercase text-sky-500">
              Lado Azul {isHost ? "(Você)" : ""}
            </span>
            <p className="mt-1 font-display text-lg font-extrabold truncate">{room.host.nick}</p>
            <p className="text-xs text-muted-foreground truncate">{room.host.school}</p>
            <p className="mt-3 font-display text-2xl font-extrabold text-sky-500">
              {room.host.score} pts
            </p>
            <p className="text-xs text-muted-foreground">
              {room.host.correct} acertos •{" "}
              {room.gameId === "rpg" ? `${room.host.hp} HP restante` : `${room.host.wrong} erros`}
            </p>
          </div>

          {/* Card Desafiante (Vermelho) */}
          <div
            className={`rounded-2xl border-2 p-4 text-center ${
              room.winnerId === room.guest?.playerId
                ? "border-red-500 bg-red-500/10"
                : "bg-secondary/40"
            }`}
          >
            <span className="text-[11px] font-extrabold uppercase text-red-500">
              Lado Vermelho {!isHost ? "(Você)" : ""}
            </span>
            <p className="mt-1 font-display text-lg font-extrabold truncate">
              {room.guest?.nick ?? "Oponente"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{room.guest?.school ?? ""}</p>
            <p className="mt-3 font-display text-2xl font-extrabold text-red-500">
              {room.guest?.score ?? 0} pts
            </p>
            <p className="text-xs text-muted-foreground">
              {room.guest?.correct ?? 0} acertos •{" "}
              {room.gameId === "rpg"
                ? `${room.guest?.hp ?? 0} HP restante`
                : `${room.guest?.wrong ?? 0} erros`}
            </p>
          </div>
        </div>

        {/* Aviso de Encerramento Automático em 1 Minuto */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-semibold">
          <Clock className="h-3.5 w-3.5 text-accent" />
          <span>Esta sala será encerrada automaticamente em <b>{autoCloseRem}s</b> (limite de 1 min).</span>
        </div>

        {/* Ações: Encerrar Partida ou Voltar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              closeX1Room(room.code);
              onExitX1();
            }}
            className="h-12 rounded-2xl font-bold"
          >
            <LogOut className="mr-2 h-4 w-4" /> Encerrar Partida
          </Button>
          <Button
            size="lg"
            onClick={() => {
              closeX1Room(room.code);
              onExitX1();
            }}
            className="h-12 rounded-2xl font-display text-base font-extrabold"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Voltar para o Menu
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. CAMPO MINADO 1V1 POR TURNOS (`gameId === "minado"`)
  // ==========================================
  if (room.gameId === "minado" && room.minadoState) {
    const mState = room.minadoState;
    const isMyTurn = mState.currentTurnPlayerId === myId;
    const activeQ = mState.activeQuestion;
    const isQActive = Boolean(activeQ && !activeQ.answered);
    const qSecsLeft = activeQ ? Math.max(0, Math.ceil((activeQ.expiresAt - nowTick) / 1000)) : 0;
    const turnStartedAt = mState.turnStartedAt || room.startedAt || room.createdAt;
    const turnSelectLeftSec = !isQActive
      ? Math.max(
          0,
          Math.ceil(
            (turnStartedAt + X1_MINADO_TURN_SELECT_TIMEOUT_SEC * 1000 - nowTick) / 1000,
          ),
        )
      : 0;

    return (
      <div className="mx-auto max-w-3xl rounded-3xl border-2 bg-card p-4 sm:p-6 shadow-xl space-y-4">
        {/* Header Superior com Pontuação e Vez */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/40 px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-xl bg-sky-500/15 px-3 py-1 font-display text-xs font-extrabold text-sky-500">
              🔵 {room.host.nick}: {room.host.score} pts ({room.host.wrong} erros)
            </span>
            <span className="font-display text-xs font-extrabold text-muted-foreground">VS</span>
            <span className="rounded-xl bg-red-500/15 px-3 py-1 font-display text-xs font-extrabold text-red-500">
              🔴 {room.guest?.nick ?? "Oponente"}: {room.guest?.score ?? 0} pts ({room.guest?.wrong ?? 0} erros)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 font-mono text-xs font-extrabold border">
              <Timer className="h-3.5 w-3.5 text-accent" /> {mins}:{secs}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestExit}
              className="h-8 rounded-xl text-xs"
            >
              <LogOut className="mr-1 h-3.5 w-3.5" /> Sair
            </Button>
          </div>
        </div>

        {/* Indicador de Vez */}
        <div
          className={`rounded-2xl border p-3 text-center transition-all ${
            isMyTurn
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold"
              : "border-border bg-secondary/30 text-muted-foreground font-semibold"
          }`}
        >
          {isMyTurn ? (
            <div className="flex items-center justify-center gap-2 text-sm sm:text-base flex-wrap">
              <Sparkles className="h-4 w-4 animate-bounce" />
              <span>🎯 SUA VEZ DE JOGAR! Escolha uma carta do tabuleiro abaixo.</span>
              {!isQActive && (
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-xs font-black">
                  ⏱️ {turnSelectLeftSec}s
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Vez de <b>{opponent?.nick ?? "Oponente"}</b>... Aguardando jogada.</span>
              {!isQActive && (
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold">
                  ⏱️ {turnSelectLeftSec}s
                </span>
              )}
            </div>
          )}
        </div>

        {minadoFeedback && (
          <div className="rounded-2xl bg-accent/15 border border-accent/30 p-2.5 text-center font-display text-xs sm:text-sm font-extrabold text-accent animate-pop-in">
            {minadoFeedback}
          </div>
        )}

        {/* MODAL / OVERLAY DA QUESTÃO DE 20S */}
        {isQActive && activeQ && (
          <div className="rounded-3xl border-2 border-primary/50 bg-gradient-to-b from-primary/10 via-card to-card p-5 sm:p-6 shadow-xl space-y-4 animate-pop-in">
            {isMyTurn ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-black text-primary">
                      DESAFIO DE 20 SEGUNDOS
                    </span>
                    <span className="text-xs text-muted-foreground">Vale +5 pts (erro: −3 pts)</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-sm font-black text-amber-500">
                    <Clock className="h-4 w-4" /> {qSecsLeft}s
                  </div>
                </div>

                <div className="py-2 text-center space-y-2">
                  {activeQ.shape && (
                    <div className="my-2 grid place-items-center">
                      <ShapeSvg shape={activeQ.shape} color="azul" size={2} />
                    </div>
                  )}
                  <p className="font-display text-lg sm:text-xl font-extrabold text-foreground">
                    {activeQ.prompt || activeQ.question}
                  </p>
                  {activeQ.expr && (
                    <p className="font-mono text-2xl sm:text-3xl font-black text-primary">
                      {activeQ.expr}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {activeQ.options.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      size="lg"
                      onClick={() => handleMinadoAnswer(opt)}
                      className="h-14 rounded-2xl font-display text-base font-extrabold hover:scale-[1.02] transition-transform"
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-6 text-center space-y-3">
                <Shield className="h-12 w-12 text-primary mx-auto animate-pulse" />
                <h3 className="font-display text-lg sm:text-xl font-black text-foreground">
                  🛡️ Oponente resolvendo desafio... [{qSecsLeft}s restantes]
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  A questão está visível apenas para o oponente neste turno. Aguarde a resposta dele!
                </p>
              </div>
            )}
          </div>
        )}

        {/* GRADE DO CAMPO MINADO (4x4 = 16 CARTAS) */}
        {!isQActive && (
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5 py-2">
            {mState.board.map((card, idx) => {
              const rev = mState.revealed[card.id];
              const isRevealed = Boolean(rev);
              const isMine = card.kind === "bonus" && card.points < 0;
              const isBonus = card.kind === "bonus" && card.points > 0;
              const isHostRevealed =
                rev?.openedByRole === "host" || rev?.openedBy === room.host.nick;

              if (isRevealed && rev) {
                return (
                  <div
                    key={card.id}
                    className={`h-20 sm:h-24 rounded-2xl border-2 flex flex-col items-center justify-center p-2 text-center transition-all ${
                      isMine
                        ? "border-destructive bg-destructive/15 text-destructive"
                        : isBonus
                          ? "border-amber-400 bg-amber-400/15 text-amber-500"
                          : "border-primary bg-primary/10 text-primary"
                    }`}
                  >
                    {isMine ? (
                      <>
                        <Bomb className="h-6 w-6 sm:h-7 sm:w-7 animate-bounce" />
                        <span className="font-mono text-xs font-extrabold mt-1">{card.points} pts</span>
                      </>
                    ) : isBonus ? (
                      <>
                        <Gift className="h-6 w-6 sm:h-7 sm:w-7" />
                        <span className="font-mono text-xs font-extrabold mt-1">+{card.points} pts</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-5 w-5 sm:h-6 sm:w-6" />
                        <span className="font-mono text-[11px] font-extrabold mt-1 truncate max-w-full">
                          {rev.resultText}
                        </span>
                      </>
                    )}
                    <span className="text-[9px] font-bold opacity-75">
                      {isHostRevealed ? "🔵 Azul" : "🔴 Vermelho"}
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => handleMinadoCardClick(idx)}
                  className={`h-20 sm:h-24 rounded-2xl border-2 flex flex-col items-center justify-center p-2 text-center transition-all ${
                    isMyTurn
                      ? "border-primary/50 bg-gradient-to-br from-secondary/80 to-card hover:border-primary hover:scale-[1.03] hover:shadow-lg cursor-pointer"
                      : "border-border bg-secondary/30 opacity-70 cursor-not-allowed"
                  }`}
                >
                  <HelpCircle className="h-6 w-6 sm:h-7 sm:w-7 text-primary/70" />
                  <span className="text-[10px] font-bold text-muted-foreground mt-1">
                    Carta #{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {forfeitModal}
      </div>
    );
  }

  // ==========================================
  // 4. BATALHA DOS ROBÔS (5 VIDAS / CABO DE GUERRA) (`gameId === "rpg"`)
  // ==========================================
  if (room.gameId === "rpg") {
    return (
      <div className="rounded-3xl border-2 bg-card p-4 sm:p-6 shadow-xl space-y-5">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-sky-500/15 px-3 py-1 font-display text-xs font-extrabold text-sky-500">
              🔵 {room.host.nick} ({room.host.hp}/5 HP)
            </span>
            <span className="font-display text-xs font-extrabold text-muted-foreground">VS</span>
            <span className="rounded-xl bg-red-500/15 px-3 py-1 font-display text-xs font-extrabold text-red-500">
              🔴 {room.guest?.nick ?? "Oponente"} ({room.guest?.hp ?? 5}/5 HP)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 font-mono text-xs font-extrabold border">
              <Timer className="h-3.5 w-3.5 text-accent" /> {mins}:{secs}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestExit}
              className="h-8 rounded-xl text-xs"
            >
              <LogOut className="mr-1 h-3.5 w-3.5" /> Sair
            </Button>
          </div>
        </div>

        {banner && (
          <div className="animate-pop-in rounded-2xl bg-accent/15 px-4 py-2 text-center font-display text-xs sm:text-sm font-extrabold">
            {banner}
          </div>
        )}

        {/* Indicador de 5 Vidas (Corações) */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-sky-500">{room.host.nick}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Heart
                  key={i}
                  className={`h-4 w-4 ${
                    i < room.host.hp
                      ? "text-sky-500 fill-sky-500"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-red-500">{room.guest?.nick ?? "Oponente"}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Heart
                  key={i}
                  className={`h-4 w-4 ${
                    i < (room.guest?.hp ?? 5)
                      ? "text-red-500 fill-red-500"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Questão Acima da Barra */}
        <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-secondary/60 to-card p-5 text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-0.5 text-[11px] font-extrabold uppercase text-primary">
            <Swords className="h-3.5 w-3.5" /> Desafio X1 • Você é o Robô{" "}
            {isHost ? "AZUL (Esquerda)" : "VERMELHO (Direita)"}
          </span>
          <p className="font-display text-2xl sm:text-3xl font-extrabold">{question.text}</p>
        </div>

        {/* Barra de Cabo de Guerra com Faíscas */}
        <div className="rounded-3xl border-2 bg-slate-950 p-5 text-white space-y-3">
          <div className="flex items-center justify-between text-xs font-extrabold">
            <span className="text-sky-400 flex items-center gap-1">
              <Zap className="h-4 w-4" /> {room.host.nick}: {room.host.hp}/5 Vidas ({room.blueShare}%)
            </span>
            <span className="text-red-400 flex items-center gap-1">
              {room.guest?.nick}: {room.guest?.hp}/5 Vidas ({redShare}%) <Flame className="h-4 w-4" />
            </span>
          </div>

          <div className="relative h-12 w-full rounded-2xl border-2 border-white/20 bg-slate-900 overflow-visible">
            <div
              className="absolute inset-y-0 left-0 rounded-l-xl bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-300 shadow-[0_0_20px_rgba(56,189,248,0.8)] transition-[width] duration-150 ease-out"
              style={{ width: `${room.blueShare}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-xl bg-gradient-to-l from-red-800 via-red-600 to-orange-500 shadow-[0_0_20px_rgba(239,68,68,0.8)] transition-[width] duration-150 ease-out"
              style={{ width: `${redShare}%` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 transition-[left] duration-150 ease-out"
              style={{ left: `${Math.max(4, Math.min(96, room.blueShare))}%` }}
            >
              <div className="relative flex items-center justify-center">
                <div className="h-14 w-5 rounded-full bg-white blur-[2px] animate-pulse shadow-[0_0_24px_#fff,0_0_40px_#facc15]" />
                <Sparkles className="absolute h-8 w-8 text-yellow-200 animate-bounce" />
              </div>
            </div>
          </div>
        </div>

        {/* Botões Verdadeiro / Falso */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            type="button"
            size="lg"
            disabled={stunned}
            onClick={() => handleRobotAnswer(true)}
            className="h-16 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-display text-xl sm:text-2xl font-extrabold shadow-lg"
          >
            <Check className="mr-2 h-7 w-7 stroke-[3]" /> VERDADEIRO
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={stunned}
            onClick={() => handleRobotAnswer(false)}
            className="h-16 sm:h-20 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display text-xl sm:text-2xl font-extrabold shadow-lg"
          >
            <X className="mr-2 h-7 w-7 stroke-[3]" /> FALSO
          </Button>
        </div>
        {forfeitModal}
      </div>
    );
  }

  // ==========================================
  // 5. CORRIDA DETERMINÍSTICA DE QUESTÕES (LÓGICA / PORCENTAGEM)
  // ==========================================
  const qList = room.questionList ?? [];
  const currentQ = qList[myQuestionIdx];
  const totalQ = qList.length || 25;
  const oppQIdx = isHost
    ? (room.guest?.currentQuestionIdx ?? 0)
    : (room.host.currentQuestionIdx ?? 0);

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border-2 bg-card p-4 sm:p-6 shadow-xl space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/40 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-xl bg-sky-500/15 px-3 py-1 font-display text-xs font-extrabold text-sky-500">
            🔵 {room.host.nick}: {room.host.score} pts (Q{Math.min(totalQ, (room.host.currentQuestionIdx ?? 0) + 1)}/{totalQ})
          </span>
          <span className="font-display text-xs font-extrabold text-muted-foreground">VS</span>
          <span className="rounded-xl bg-red-500/15 px-3 py-1 font-display text-xs font-extrabold text-red-500">
            🔴 {room.guest?.nick ?? "Oponente"}: {room.guest?.score ?? 0} pts (Q{Math.min(totalQ, oppQIdx + 1)}/{totalQ})
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 font-mono text-xs font-extrabold border">
            <Timer className="h-3.5 w-3.5 text-accent" /> {mins}:{secs}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRequestExit}
            className="h-8 rounded-xl text-xs"
          >
            <LogOut className="mr-1 h-3.5 w-3.5" /> Sair
          </Button>
        </div>
      </div>

      {/* Barra de Progresso Comparativo */}
      <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-primary font-display">
            Você: Questão {Math.min(totalQ, myQuestionIdx + 1)} de {totalQ}
          </span>
          <span className="text-muted-foreground">
            Oponente: Questão {Math.min(totalQ, oppQIdx + 1)} de {totalQ}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${Math.min(100, ((myQuestionIdx + 1) / totalQ) * 100)}%` }}
          />
        </div>
      </div>

      {/* Questão Ativa da Lista Determinística */}
      {currentQ ? (
        <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-secondary/50 to-card p-6 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-black uppercase text-primary">
            Questão {myQuestionIdx + 1} • {GAME_NAMES[room.gameId]}
          </span>
          {currentQ.prompt && currentQ.prompt !== currentQ.question && (
            <p className="text-sm font-bold text-muted-foreground">{currentQ.prompt}</p>
          )}
          <p className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
            {currentQ.question || currentQ.expr || currentQ.prompt}
          </p>

          <div className="grid grid-cols-2 gap-3 pt-3">
            {currentQ.options.map((opt) => (
              <Button
                key={opt}
                type="button"
                size="lg"
                disabled={stunned}
                onClick={() => handleRaceAnswer(opt)}
                className="h-14 sm:h-16 rounded-2xl font-display text-lg font-extrabold hover:scale-[1.02] transition-transform"
              >
                {opt}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center space-y-3">
          <Check className="h-12 w-12 text-success mx-auto" />
          <h3 className="font-display text-xl font-black">Você completou todas as questões!</h3>
          <p className="text-xs text-muted-foreground">
            Aguardando o oponente concluir ou o tempo da sala se encerrar...
          </p>
        </div>
      )}
      {forfeitModal}
    </div>
  );
}
