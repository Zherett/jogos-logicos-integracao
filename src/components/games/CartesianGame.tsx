import { useEffect, useRef, useState } from "react";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { CartesianPlane } from "./CartesianPlane";
import { StartScreen } from "./StartScreen";
import { Countdown } from "./Countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useRoundClock } from "@/lib/use-countdown";
import { generateCartQuestion, type CartQuestion } from "@/lib/cart-questions";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { useTeamSession } from "@/lib/use-team-session";
import { playCorrect, playWrong } from "@/lib/sound";

const DURATION = 120;
const LEVEL_UP_STREAK = 4;
const MAX_LEVEL = 3;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 5;

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

const rangeForLevel = (lvl: number) => (lvl <= 1 ? 8 : lvl === 2 ? 10 : 15);

export function CartesianGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setLastMatch(loadLastMatch("cartesiano"));
  }, []);

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [question, setQuestion] = useState<CartQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const lockRef = useRef(false);

  // Score is always derived from hits/misses so errors are never lost (floored at 0).
  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
  });

  useEffect(() => {
    if (finished) {
      updateBest("cartesiano", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("cartesiano", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function startGame() {
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    lockRef.current = false;
    setCorrect(0); setWrong(0); setLevel(1); setStreak(0);
    setSelected(null); setFinished(false);
    setQuestion(generateCartQuestion(1, rangeForLevel(1)));
    setPhase("playing");
    setRunning(true);
  }

  function replayWithCountdown() {
    team.advance();
    setFinished(false);
    setRunning(false);
    setPhase("countdown");
  }

  function backToSetup() {
    setRunning(false); setFinished(false); setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  function nextQuestion(lvl: number) {
    setSelected(null);
    setQuestion(generateCartQuestion(lvl, rangeForLevel(lvl)));
  }

  function answer(idx: number) {
    if (lockRef.current || !running || !question) return;
    lockRef.current = true;
    setSelected(idx);
    const ok = idx === question.correctIndex;
    if (ok) {
      playCorrect();
      setCorrect((c) => c + 1);
      if (bonusOn) clock.addBonus();
      const next = streak + 1;
      if (next >= LEVEL_UP_STREAK && level < MAX_LEVEL) {
        const nl = level + 1;
        setLevel(nl);
        setStreak(0);
        setShowLevelUp(nl);
        setTimeout(() => setShowLevelUp(null), 1100);
        setTimeout(() => { nextQuestion(nl); lockRef.current = false; }, 700);
        return;
      }
      setStreak(next);
      setTimeout(() => { nextQuestion(level); lockRef.current = false; }, 700);
    } else {
      playWrong();
      setWrong((w) => w + 1);
      setStreak(0);
      setTimeout(() => { nextQuestion(level); lockRef.current = false; }, 800);
    }
  }

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Plano Cartesiano" onExit={onExit} />
        <SessionSummary title="Plano Cartesiano" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="Plano Cartesiano"
        description="Interprete posições no plano. Acerto: +10 • Erro: −5"
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
        <p className="text-center text-xs text-muted-foreground">
          O tamanho do plano escala automaticamente conforme você avança de nível: 8×8 (Nível 1) → 10×10 (Nível 2) → 15×15 (Nível 3).
        </p>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title="Plano Cartesiano" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Plano Cartesiano" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="cartesiano"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
      </div>
    );
  }


  const target = question?.points.find((p) => p.label === question.targetLabel);

  return (
    <div className="space-y-4">
      <GameTopBar title="Plano Cartesiano" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} wrong={wrong} level={level} streak={streak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className="relative rounded-3xl border bg-card p-4 sm:p-6 shadow-lg overflow-hidden">
        {showLevelUp && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 backdrop-blur-sm">
            <div className="animate-level-up text-center">
              <div className="font-display text-5xl sm:text-7xl font-extrabold text-accent">Nível {showLevelUp}!</div>
              <div className="mt-2 text-muted-foreground">Mandou bem! 🎯</div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-center">
          {question && (
            <CartesianPlane
              points={question.points}
              range={rangeForLevel(level)}
              highlightLabel={question.mode === "findPosition" ? question.targetLabel : null}
            />
          )}

          <div>
            <div className="rounded-2xl bg-secondary p-4 sm:p-6 text-center">
              {question?.mode === "findLetter" ? (
                <>
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Qual letra está em</p>
                  <div key={`${target?.x},${target?.y}`} className="animate-pop-in mt-2 font-display text-4xl sm:text-5xl font-extrabold text-primary">
                    ({target?.x}, {target?.y})?
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm uppercase tracking-wider text-muted-foreground">Em qual posição está a letra</p>
                  <div key={question?.targetLabel} className="animate-pop-in mt-2 font-display text-5xl sm:text-6xl font-extrabold text-primary">
                    {question?.targetLabel}?
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {question?.options.map((opt, i) => {
                const isCorrect = selected !== null && i === question.correctIndex;
                const isWrongChoice = selected === i && i !== question.correctIndex;
                const cls = isCorrect
                  ? "bg-success text-success-foreground border-success"
                  : isWrongChoice
                  ? "bg-destructive text-destructive-foreground border-destructive"
                  : "bg-card hover:bg-secondary border-border";
                return (
                  <button
                    key={i}
                    onClick={() => answer(i)}
                    disabled={selected !== null}
                    className={`h-16 rounded-2xl border-2 font-display text-xl sm:text-2xl font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
