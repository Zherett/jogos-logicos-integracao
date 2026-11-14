import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { StartScreen } from "./StartScreen";
import { Countdown } from "./Countdown";
import { useRoundClock } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { generateBalanced, type Question } from "@/lib/logic-questions";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { playCorrect, playWrong } from "@/lib/sound";

const DURATION = 120;
const LEVEL_UP_STREAK = 5;
const MAX_LEVEL = 4;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 10;
const WRONG_STUN_MS = 1500;

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

export function LogicGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setLastMatch(loadLastMatch("logica"));
  }, []);

  const [finished, setFinished] = useState(false);
  const [running, setRunning] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const [floaters, setFloaters] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  const recentTexts = useRef<string[]>([]);
  const recentAnswers = useRef<boolean[]>([]);
  const lockRef = useRef(false);

  // Derived score keeps hits and misses always in sync (floored at 0).
  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
  });

  useEffect(() => {
    if (finished) {
      updateBest("logica", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("logica", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function startGame() {
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    recentTexts.current = [];
    recentAnswers.current = [];
    lockRef.current = false;
    setFeedback(null);
    setShowLevelUp(null);
    setCorrect(0); setWrong(0); setLevel(1); setStreak(0);
    setFinished(false);
    setQuestion(generateBalanced(1, [], []));
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
    setRunning(false);
    setFinished(false);
    setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  function nextQuestion(currentLevel: number) {
    const q = generateBalanced(currentLevel, recentTexts.current, recentAnswers.current);
    recentTexts.current = [...recentTexts.current.slice(-15), q.text];
    recentAnswers.current = [...recentAnswers.current.slice(-15), q.answer];
    setQuestion(q);
  }

  function answer(value: boolean) {
    if (lockRef.current || !running || !question) return;
    lockRef.current = true;
    const ok = value === question.answer;
    const id = Date.now();
    setFloaters((f) => [...f, { id, text: ok ? `+${POINTS_CORRECT}` : `−${POINTS_WRONG}`, ok }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);

    if (ok) {
      playCorrect();
      setFeedback("correct");
      setCorrect((c) => c + 1);
      if (bonusOn) clock.addBonus();
      const newStreak = streak + 1;
      const willLevelUp = newStreak >= LEVEL_UP_STREAK && level < MAX_LEVEL;
      if (willLevelUp) {
        const newLevel = level + 1;
        setLevel(newLevel);
        setStreak(0);
        setShowLevelUp(newLevel);
        setTimeout(() => {
          setShowLevelUp(null);
          setFeedback(null);
          nextQuestion(newLevel);
          lockRef.current = false;
        }, 1100);
      } else {
        setStreak(newStreak);
        setTimeout(() => {
          setFeedback(null);
          nextQuestion(level);
          lockRef.current = false;
        }, 500);
      }
    } else {
      playWrong();
      setFeedback("wrong");
      setWrong((w) => w + 1);
      setStreak(0);
      setTimeout(() => {
        setFeedback(null);
        nextQuestion(level);
        lockRef.current = false;
      }, WRONG_STUN_MS);
    }
  }

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Lógica Matemática" onExit={onExit} />
        <SessionSummary title="Lógica Matemática" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="Lógica Matemática"
        description="Responda Verdadeiro ou Falso antes o tempo acabar. Acerto: +10 • Erro: −10"
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
          As operações matemáticas (+, −, ×, ÷) são liberadas e escalam automaticamente conforme você avança de nível.
        </p>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title="Lógica Matemática" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Lógica Matemática" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="logica"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
      </div>
    );
  }

  const flashClass = feedback === "correct" ? "animate-flash-correct" : feedback === "wrong" ? "animate-flash-wrong" : "";

  return (
    <div className="space-y-4">
      <GameTopBar title="Lógica Matemática" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} level={level} streak={streak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className={`relative rounded-3xl border bg-card p-6 sm:p-10 shadow-lg overflow-hidden ${flashClass}`}>
        {showLevelUp && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 backdrop-blur-sm">
            <div className="animate-level-up text-center">
              <div className="font-display text-5xl sm:text-7xl font-extrabold text-accent">Nível {showLevelUp}!</div>
              <div className="mt-2 text-muted-foreground">Você está indo muito bem 🚀</div>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">A proposição abaixo é...</p>
          <div key={question?.text} className="mt-4 mx-auto inline-block animate-pop-in rounded-2xl bg-secondary px-6 py-5 sm:px-10 sm:py-8">
            <div className="font-display text-3xl sm:text-5xl font-bold text-secondary-foreground break-words">
              {question?.text}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
          <Button
            onClick={() => answer(true)}
            disabled={!!feedback}
            className="h-20 text-2xl font-bold rounded-2xl bg-success hover:bg-success/90 text-success-foreground shadow-lg"
          >
            <Check className="mr-2 h-7 w-7" /> Verdadeiro
          </Button>
          <Button
            onClick={() => answer(false)}
            disabled={!!feedback}
            className="h-20 text-2xl font-bold rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
          >
            <X className="mr-2 h-7 w-7" /> Falso
          </Button>

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            {floaters.map((f) => (
              <div
                key={f.id}
                className={`absolute animate-float-up font-display text-3xl font-extrabold ${f.ok ? "text-success" : "text-destructive"}`}
              >
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

