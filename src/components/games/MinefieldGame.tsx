import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, LayoutGrid, Flag, Timer, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartScreen, OptionChip } from "./StartScreen";
import { Countdown } from "./Countdown";
import { ResultPanel } from "./ResultPanel";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { ShapeSvg } from "./ShapeSvg";
import { NORMAL_CONFIG, teamColor, TEAM_COLOR_CLASSES, type TeamConfig } from "@/lib/teams";
import { GameTopBar } from "./GameTopBar";
import { useTeamSession } from "@/lib/use-team-session";
import { useSessionEnd } from "@/lib/use-session-end";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import {
  buildBoard,
  ANSWER_SECONDS,
  ANSWER_TIME_OPTIONS,
  POINTS_CORRECT,
  POINTS_WRONG,
  COLS,
  type MineCard,
  evaluateQuestionAnswer,
  evaluateTimeout,
  evaluateBonusCard,
} from "@/lib/minefield-content";
import { playTone } from "@/lib/sound";

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

const beep = playTone;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MinefieldGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [runId, setRunId] = useState(0);
  const answerSeconds = ANSWER_SECONDS; // Tempo fixo em 20 segundos

  useEffect(() => { setLastMatch(loadLastMatch("minado")); }, []);

  const [board, setBoard] = useState<MineCard[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [flipping, setFlipping] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<MineCard | null>(null);
  const [answered, setAnswered] = useState<{ chosen: string; ok: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState(answerSeconds);
  const [toast, setToast] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [finished, setFinished] = useState(false);
  const currentLevel = Math.min(4, 1 + Math.floor(correct / 4));

  const timerRef = useRef<number | null>(null);
  const opening = useRef<Set<string>>(new Set());
  const answerLockRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }
  useEffect(() => () => clearTimer(), []);

  // Elapsed match clock
  useEffect(() => {
    if (phase !== "playing" || finished) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase, finished]);

  useEffect(() => {
    if (finished) {
      updateBest("minado", score, currentLevel);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level: currentLevel,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("minado", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function startGame() {
    clearTimer();
    answerLockRef.current = false;
    setBoard(buildBoard());
    setRevealed(new Set());
    opening.current = new Set();
    setOpenCard(null); setAnswered(null); setFlipping(null);
    setScore(0); setCorrect(0); setWrong(0);
    setElapsed(0);
    setFinished(false);
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    setPhase("playing");
  }

  function nextTeam() {
    team.advance();
  }

  function openCell(card: MineCard) {
    if (openCard || revealed.has(card.id) || finished || opening.current.size > 0) return;
    opening.current.add(card.id);
    beep(520, 0.1, "triangle");
    setFlipping(card.id);
    window.setTimeout(() => {
      setFlipping(null);
      opening.current.delete(card.id);
      setRevealed((r) => new Set(r).add(card.id));
      if (card.kind === "bonus") {
        const evalRes = evaluateBonusCard(card);
        setScore((s) => Math.max(0, s + evalRes.scoreDelta));
        team.credit(evalRes.scoreDelta);
        if (evalRes.isCorrect) {
          setCorrect((c) => c + 1);
          beep(760, 0.16, "triangle");
        } else {
          setWrong((w) => w + 1);
          beep(180, 0.2, "sawtooth");
        }
        setToast(
          `Carta ${card.label}: ${card.points > 0 ? "+" : ""}${card.points} ${
            Math.abs(card.points) === 1 ? "ponto" : "pontos"
          }`,
        );
        window.setTimeout(() => setToast(null), 2400);
        nextTeam();
      } else {
        answerLockRef.current = false;
        setOpenCard(card);
        setAnswered(null);
        setTimeLeft(answerSeconds);
        clearTimer();
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) { clearTimer(); handleTimeout(); return 0; }
            return t - 1;
          });
        }, 1000);
      }
    }, 420);
  }

  function handleTimeout() {
    if (answerLockRef.current) return;
    answerLockRef.current = true;
    const evalRes = evaluateTimeout();
    setAnswered({ chosen: "", ok: false });
    setWrong((w) => w + 1);
    setScore((s) => Math.max(0, s + evalRes.scoreDelta));
    team.credit(evalRes.scoreDelta);
    beep(160, 0.3, "sawtooth");
    window.setTimeout(closeCard, 1800);
  }

  function answer(option: string) {
    if (answerLockRef.current || !openCard || openCard.kind === "bonus" || answered) return;
    answerLockRef.current = true;
    clearTimer();
    const evalRes = evaluateQuestionAnswer(openCard, option);
    setAnswered({ chosen: option, ok: evalRes.isCorrect });
    if (evalRes.isCorrect) {
      setScore((s) => s + evalRes.scoreDelta);
      setCorrect((c) => c + 1);
      team.credit(evalRes.scoreDelta);
      beep(660, 0.1, "triangle");
      window.setTimeout(() => beep(990, 0.16, "triangle"), 90);
    } else {
      setScore((s) => Math.max(0, s + evalRes.scoreDelta));
      setWrong((w) => w + 1);
      team.credit(evalRes.scoreDelta);
      beep(170, 0.28, "sawtooth");
    }
    window.setTimeout(closeCard, 1500);
  }

  function closeCard() {
    clearTimer();
    answerLockRef.current = false;
    setOpenCard(null);
    setAnswered(null);
    nextTeam();
  }

  const allDone =
    board.length > 0 &&
    revealed.size >= board.length &&
    !openCard &&
    !flipping &&
    opening.current.size === 0;

  useEffect(() => {
    if (allDone && !finished) {
      // Se for uma carta bônus com toast visível, aguarda 2.2s para o jogador ler a pontuação.
      // Se foi uma questão recém-respondida e fechada, aguarda 1.2s para contemplar o tabuleiro completo.
      const delay = toast ? 2200 : 1200;
      const timer = window.setTimeout(() => {
        setFinished(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
  }, [allDone, finished, toast]);

  function replayWithCountdown() {
    setFinished(false);
    nextTeam();
    setPhase("countdown");
  }
  function backToSetup() {
    clearTimer();
    setFinished(false);
    setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  const remainingCards = useMemo(() => board.length - revealed.size, [board, revealed]);
  const activeTeam = team.activeSession ? team.order[team.current] : undefined;
  const colors = TEAM_COLOR_CLASSES[teamColor(activeTeam)];

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Campo Minado Lógico" onExit={onExit} />
        <SessionSummary title="Campo Minado Lógico" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="Campo Minado Lógico"
        description="Escolha uma carta do tabuleiro e responda o desafio. Acerto: +5 • Erro: −3"
        onStart={startGame}
        onExit={onExit}
        lastMatch={lastMatch}
        sessionActive={team.activeSession}
        onFinishSession={sessionEnd.request}
      >
        <div className="space-y-4">
          <TeamSetup value={teamConfig} onChange={setTeamConfig} locked={team.activeSession} />

          <div className="flex items-center gap-2 rounded-2xl border bg-secondary/30 p-3 text-xs font-bold text-muted-foreground">
            <Timer className="h-4 w-4 text-primary" />
            <span>Tempo por questão: <b className="text-foreground">20 segundos</b> (Respostas incorretas ou tempo esgotado contam como erro)</span>
          </div>

          <div className="rounded-2xl border bg-secondary/40 p-4 text-sm">
            <p className="font-semibold mb-1">Como jogar</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Tabuleiro 8×8 com colunas A–H e linhas 1–8.</li>
              <li>Ao clicar, a carta vira e revela um desafio (V ou F, conta misteriosa ou forma geométrica).</li>
              <li>Você tem 20 segundos para responder cada questão. Acertos somam +5 pontos; respostas incorretas ou tempo esgotado descontam 3 pontos e contam erro.</li>
              <li>Algumas cartas são bônus ou minas: valem de +1 a +3 ou de −1 a −3 pontos no placar, sem pergunta.</li>
              <li>No modo equipes, a vez passa automaticamente e as cartas ficam na cor da equipe.</li>
            </ul>
          </div>
        </div>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title="Campo Minado Lógico" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Campo Minado Lógico" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="minado"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={currentLevel}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GameTopBar title="Campo Minado Lógico" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Clock className="h-4 w-4" />} label="Tempo de partida" value={fmt(elapsed)} />
        <Stat icon={<Star className="h-4 w-4" />} label="Pontos" value={String(score)} />
        <Stat icon={<LayoutGrid className="h-4 w-4" />} label="Cartas restantes" value={String(remainingCards)} />
      </div>

      <TeamScoreBar key={runId} session={team} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="order-2 lg:order-1 rounded-3xl border bg-card p-2 sm:p-3 shadow-lg">
          <div className="mx-auto w-full max-w-[520px]">
            <div className="grid gap-1" style={{ gridTemplateColumns: "1.1rem repeat(8, minmax(0,1fr))" }}>
              <div />
              {COLS.map((c) => (
                <div key={c} className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground">{c}</div>
              ))}
              {board.length > 0 && Array.from({ length: 8 }, (_, row) => (
                <FragmentRow
                  key={row}
                  row={row}
                  board={board}
                  revealed={revealed}
                  flipping={flipping}
                  disabled={!!openCard || flipping !== null}
                  cardClass={colors.card}
                  onOpen={openCell}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-3">
          {toast && (
            <div className="animate-pop-in mb-3 rounded-2xl border bg-accent/15 px-4 py-3 text-center font-display font-bold text-accent">
              {toast}
            </div>
          )}

          {openCard && openCard.kind !== "bonus" ? (
            <div className="animate-card-reveal rounded-3xl border-2 border-primary bg-card p-4 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  Carta {openCard.label}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                  timeLeft <= 5 ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground"
                }`}>
                  <Clock className="h-4 w-4" /> {timeLeft}s
                </span>
              </div>

              {openCard.kind === "shape" && openCard.shape && (
                <div className="mt-3 grid place-items-center">
                  <ShapeSvg shape={openCard.shape} color="azul" size={2} />
                </div>
              )}

              <p className="mt-3 text-center font-display text-lg font-bold text-muted-foreground">
                {openCard.prompt}
              </p>
              {openCard.expr && (
                <p className="mt-1 rounded-2xl bg-primary/10 px-3 py-3 text-center font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-primary">
                  {openCard.expr}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                {openCard.options.map((o) => {
                  const chosen = answered?.chosen === o;
                  const isRight = answered && o === openCard.answer;
                  const tone = isRight
                    ? "border-success bg-success/15 text-success"
                    : chosen
                      ? "border-destructive bg-destructive/15 text-destructive animate-shake-x"
                      : "border-border bg-background hover:bg-secondary";
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={!!answered}
                      onClick={() => answer(o)}
                      className={`rounded-2xl border-2 px-3 py-3 font-display text-base font-bold transition-all active:scale-95 ${tone}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>

              {answered && (
                <p className="mt-3 text-center text-sm font-bold">
                  {answered.ok
                    ? `Correto! +${POINTS_CORRECT} pontos`
                    : `Resposta certa: ${openCard.answer} (−${POINTS_WRONG} pontos)`}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Escolha uma carta no tabuleiro — o desafio aparece aqui.
            </div>
          )}

          <div className="mt-3 flex justify-center">
            <Button variant="outline" className="rounded-2xl" onClick={() => setFinished(true)}>
              <Flag className="mr-2 h-4 w-4" /> Encerrar partida
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ row, board, revealed, flipping, disabled, cardClass, onOpen }: {
  row: number;
  board: MineCard[];
  revealed: Set<string>;
  flipping: string | null;
  disabled: boolean;
  cardClass: string;
  onOpen: (c: MineCard) => void;
}) {
  return (
    <>
      <div className="grid place-items-center text-[10px] sm:text-xs font-bold text-muted-foreground">{row + 1}</div>
      {Array.from({ length: 8 }, (_, col) => {
        const card = board[row * 8 + col];
        const isRevealed = revealed.has(card.id);
        const isFlipping = flipping === card.id;
        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled || isRevealed}
            onClick={() => onOpen(card)}
            aria-label={`Carta ${card.label}`}
            className={`aspect-square rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
              isFlipping ? "animate-card-flip" : ""
            } ${
              isRevealed
                ? card.kind === "bonus"
                  ? `border ${card.points > 0 ? "border-success/40 bg-success/15 text-success" : "border-destructive/40 bg-destructive/15 text-destructive"}`
                  : "bg-muted text-muted-foreground/60 border border-border"
                : `${cardClass} shadow-sm hover:-translate-y-0.5 active:scale-95`
            }`}
            style={{ transformStyle: "preserve-3d" }}
          >
            {isRevealed
              ? card.kind === "bonus"
                ? `${card.points > 0 ? "+" : ""}${card.points}`
                : "✓"
              : card.label}
          </button>
        );
      })}
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate font-display text-base font-bold">{value}</div>
      </div>
    </div>
  );
}
