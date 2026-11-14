import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { StartScreen } from "./StartScreen";
import { Countdown } from "./Countdown";
import { useRoundClock } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import {
  COLS, ROWS, COLOR_BG, COLOR_TEXT, COLOR_LABEL,
  type Board, type Coord, type Question,
  randomBoard, coordLabel, makeQuestionForLevel,
} from "@/lib/robogrid";
import { playTone } from "@/lib/sound";

const DURATION = 120;
const LEVEL_UP_STREAK = 4;
const MAX_LEVEL = 4;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 5;

const beep = playTone;

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

export function RoboGridGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);
  useEffect(() => { setLastMatch(loadLastMatch("robogrid")); }, []);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [board, setBoard] = useState<Board>(() => randomBoard());
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [highlight, setHighlight] = useState<Coord | null>(null);
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const lockRef = useRef(false);

  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
  });

  useEffect(() => {
    if (finished) {
      updateBest("robogrid", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("robogrid", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function startGame() {
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    setCorrect(0); setWrong(0); setLevel(1); setStreak(0);
    setFinished(false);
    const b = randomBoard();
    setBoard(b);
    setQuestion(makeQuestionForLevel(1, b));
    setHighlight(null);
    setPhase("playing");
    setRunning(true);
  }

  function replayWithCountdown() {
    team.advance();
    setFinished(false); setRunning(false); setPhase("countdown");
  }

  function backToSetup() {
    setRunning(false); setFinished(false); setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  function nextRound(lvl: number) {
    const b = randomBoard();
    setBoard(b);
    setQuestion(makeQuestionForLevel(lvl, b));
    setHighlight(null);
    setFeedback(null);
  }

  function resolve(ok: boolean, revealCoord?: Coord) {
    setFeedback(ok ? "correct" : "wrong");
    if (ok) {
      beep(660, 0.1, "triangle");
      window.setTimeout(() => beep(990, 0.16, "triangle"), 90);
      setCorrect((c) => c + 1);
      if (bonusOn) clock.addBonus();
      const next = streak + 1;
      const willLevelUp = next >= LEVEL_UP_STREAK && level < MAX_LEVEL;
      if (willLevelUp) {
        const nl = level + 1;
        setLevel(nl);
        setStreak(0);
        setShowLevelUp(nl);
        setTimeout(() => {
          setShowLevelUp(null);
          nextRound(nl);
          lockRef.current = false;
        }, 1100);
        return;
      }
      setStreak(next);
    } else {
      beep(170, 0.28, "sawtooth");
      setWrong((w) => w + 1);
      setStreak(0);
      if (revealCoord) setHighlight(revealCoord);
    }
    setTimeout(() => {
      nextRound(level);
      lockRef.current = false;
    }, ok ? 700 : 1000);
  }

  function onCellClick(col: number, row: number) {
    if (!running || !question || feedback) return;
    beep(520, 0.06, "triangle", 0.05);
    if (question.kind !== "position") return;
    if (lockRef.current) return;
    lockRef.current = true;
    const ok = col === question.target.col && row === question.target.row;
    setHighlight(question.target);
    resolve(ok, question.target);
  }

  function onColorAnswer(colorId: string) {
    if (!running || !question || feedback) return;
    if (question.kind !== "color") return;
    if (lockRef.current) return;
    lockRef.current = true;
    const ok = colorId === question.color;
    setHighlight(question.target);
    resolve(ok, question.target);
  }

  function onRobotAnswer(idx: number) {
    if (!running || !question || feedback) return;
    if (question.kind !== "robot") return;
    if (lockRef.current) return;
    lockRef.current = true;
    const ok = idx === question.correctIndex;
    setHighlight(question.answer);
    resolve(ok, question.answer);
  }

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="RoboGrid" onExit={onExit} />
        <SessionSummary title="RoboGrid" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="RoboGrid"
        description="Localização espacial em um tabuleiro 10x10 com cores. Acerto: +10 • Erro: −5"
        onStart={startGame}
        onExit={onExit}
        lastMatch={lastMatch}
        sessionActive={team.activeSession}
        onFinishSession={sessionEnd.request}
        bonusTime={bonusOn}
        onBonusTimeChange={setBonusOn}
      >
        <div className="mb-4">
          <TeamSetup value={teamConfig} onChange={setTeamConfig} locked={team.activeSession} />
        </div>
        <div className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
          <p className="font-semibold mb-2">Como jogar:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Nível 1:</b> clique na posição indicada (ex.: D7).</li>
            <li><b>Nível 2:</b> descubra a cor de uma posição.</li>
            <li><b>Nível 3:</b> siga o movimento do robô e escolha a coordenada final.</li>
            <li><b>Nível 4:</b> desafio misto com todos os tipos.</li>
          </ul>
        </div>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-2">
        <GameTopBar title="RoboGrid" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="RoboGrid" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="robogrid"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
      </div>
    );
  }

  const q = question!;
  const robotAt = q.kind === "robot" ? q.start : null;
  const flashClass = feedback === "correct" ? "animate-flash-correct" : feedback === "wrong" ? "animate-flash-wrong" : "";

  return (
    <div className="space-y-2 sm:space-y-3">
      <GameTopBar title="RoboGrid" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} wrong={wrong} level={level} streak={streak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className={`relative rounded-3xl border bg-card p-2 sm:p-3 shadow-lg overflow-hidden ${flashClass}`}>
        {showLevelUp && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 backdrop-blur-sm">
            <div className="animate-level-up text-center">
              <div className="font-display text-5xl sm:text-7xl font-extrabold text-accent">Nível {showLevelUp}!</div>
              <div className="mt-2 text-muted-foreground">Continue assim! 🤖</div>
            </div>
          </div>
        )}

        {/* Question banner */}
        <div className="rounded-xl bg-secondary px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {q.kind === "position" && "Clique na posição"}
            {q.kind === "color" && "Qual é a cor da posição"}
            {q.kind === "robot" && "Movimento do robô"}
          </p>
          <div key={JSON.stringify(q)} className="animate-pop-in font-display text-xl sm:text-2xl font-extrabold text-primary leading-tight">
            {q.kind === "position" && coordLabel(q.target)}
            {q.kind === "color" && `${coordLabel(q.target)}?`}
            {q.kind === "robot" && q.moves.text}
          </div>
        </div>

        {/* Board */}
        <div className="mt-2 mx-auto w-full max-w-[420px] sm:max-w-[460px]">
          <Grid
            board={board}
            robotAt={robotAt}
            highlight={highlight}
            clickable={q.kind === "position" && !feedback}
            onCellClick={onCellClick}
          />
        </div>

        {/* Answer area */}
        {q.kind === "color" && (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {q.options.map((c) => (
              <button
                key={c}
                onClick={() => onColorAnswer(c)}
                disabled={!!feedback}
                className={`h-10 sm:h-12 rounded-xl border-2 border-black/10 font-display font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed ${COLOR_BG[c]} ${COLOR_TEXT[c]}`}
              >
                {COLOR_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        {q.kind === "robot" && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {q.options.map((opt, i) => {
              const isCorrect = feedback && i === q.correctIndex;
              const isWrong = feedback === "wrong" && highlight && !isCorrect && opt.col === highlight.col && opt.row === highlight.row;
              const cls = isCorrect
                ? "bg-success text-success-foreground border-success"
                : isWrong
                ? "bg-destructive text-destructive-foreground border-destructive"
                : "bg-card hover:bg-secondary border-border";
              return (
                <button
                  key={i}
                  onClick={() => onRobotAnswer(i)}
                  disabled={!!feedback}
                  className={`h-12 rounded-xl border-2 font-display text-lg sm:text-xl font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed ${cls}`}
                >
                  {coordLabel(opt)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Grid({
  board, robotAt, highlight, clickable, onCellClick,
}: {
  board: Board;
  robotAt: Coord | null;
  highlight: Coord | null;
  clickable: boolean;
  onCellClick: (col: number, row: number) => void;
}) {
  // Layout: label column + 10 cells per row; header row on top.
  return (
    <div className="select-none">
      {/* Header row: empty corner + column letters */}
      <div className="grid" style={{ gridTemplateColumns: `1.25rem repeat(${COLS.length}, minmax(0,1fr))`, gap: "2px" }}>
        <div />
        {COLS.map((c) => (
          <div key={c} className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground py-1">{c}</div>
        ))}
      </div>
      {board.map((row, rIdx) => (
        <div
          key={rIdx}
          className="grid"
          style={{ gridTemplateColumns: `1.25rem repeat(${COLS.length}, minmax(0,1fr))`, gap: "2px", marginTop: "2px" }}
        >
          <div className="grid place-items-center text-[10px] sm:text-xs font-bold text-muted-foreground">{rIdx + 1}</div>
          {row.map((color, cIdx) => {
            const isHi = highlight && highlight.col === cIdx && highlight.row === rIdx;
            const hasRobot = robotAt && robotAt.col === cIdx && robotAt.row === rIdx;
            return (
              <button
                key={cIdx}
                onClick={() => onCellClick(cIdx, rIdx)}
                disabled={!clickable}
                className={`relative aspect-square rounded-sm sm:rounded-md ${COLOR_BG[color]} transition-transform ${
                  clickable ? "hover:scale-[1.08] cursor-pointer" : "cursor-default"
                } ${isHi ? "ring-2 sm:ring-4 ring-offset-1 ring-slate-900 z-10" : ""}`}
                aria-label={`${COLS[cIdx]}${rIdx + 1}`}
              >
                {hasRobot && (
                  <span className="absolute inset-0 grid place-items-center">
                    <Bot className="h-3 w-3 sm:h-4 sm:w-4 text-slate-900 drop-shadow" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

