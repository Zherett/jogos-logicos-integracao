import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { StartScreen } from "./StartScreen";
import { Countdown } from "./Countdown";
import { useRoundClock, BONUS_PER_CORRECT, MAX_BONUS } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { generateQuestion, checkAnswer, type CQuestion } from "@/lib/complete-logic";
import { playCorrect, playWrong } from "@/lib/sound";

const TITLE = "Completando a Lógica";
const DURATION = 120;
const PER_LEVEL = 5;
const MAX_LEVEL = 4;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 5;
const LEVEL_PERFECT_BONUS = 5;

const LEVEL_NAMES: Record<number, string> = {
  1: "Arraste o operador",
  2: "Digite o número",
  3: "Arraste + digite",
  4: "Extra: tudo misturado",
};

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

export function CompleteLogicGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);

  const [finished, setFinished] = useState(false);
  const [running, setRunning] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [stage, setStage] = useState(0); // questions answered in current level
  const [levelHits, setLevelHits] = useState(0);
  const [streak, setStreak] = useState(0);
  const [question, setQuestion] = useState<CQuestion | null>(null);
  const [numVal, setNumVal] = useState("");
  const [opVal, setOpVal] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const used = useRef(new Set<string>());
  const answerBonus = useRef(0);
  const lockRef = useRef(false);

  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  useEffect(() => { setLastMatch(loadLastMatch("completar")); }, []);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
  }, BONUS_PER_CORRECT, MAX_BONUS);

  useEffect(() => {
    if (finished) {
      updateBest("completar", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("completar", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function loadQuestion(lv: number) {
    setQuestion(generateQuestion(lv, used.current));
    setNumVal("");
    setOpVal(null);
  }

  function startGame() {
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    used.current = new Set();
    answerBonus.current = 0;
    setCorrect(0); setWrong(0); setLevel(1); setStage(0); setLevelHits(0); setStreak(0);
    setFinished(false);
    setFeedback(null); setBanner(null);
    lockRef.current = false;
    loadQuestion(1);
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

  function submit() {
    if (lockRef.current || !running || !question) return;
    const n = numVal.trim() === "" ? null : Number(numVal);
    if (question.hasNum && n === null) return;
    if (question.hasOp && !opVal) return;
    lockRef.current = true;
    const ok = checkAnswer(question, n, opVal);
    const hits = levelHits + (ok ? 1 : 0);
    const nextStage = stage + 1;

    if (ok) {
      playCorrect();
      setCorrect((c) => c + 1);
      setStreak((s) => s + 1);
      if (bonusOn && answerBonus.current < MAX_BONUS) {
        const add = Math.min(BONUS_PER_CORRECT, MAX_BONUS - answerBonus.current);
        answerBonus.current += add;
        clock.addBonus(add);
      }
    } else {
      playWrong();
      setWrong((w) => w + 1);
      setStreak(0);
    }
    setFeedback(ok ? "correct" : "wrong");

    let newLevel = level;
    let msg: string | null = null;
    if (nextStage >= PER_LEVEL) {
      const perfect = hits === PER_LEVEL;
      if (perfect && bonusOn) clock.addBonus(LEVEL_PERFECT_BONUS);
      if (level < MAX_LEVEL) {
        newLevel = level + 1;
        msg = `Nível ${newLevel}!`;
      } else if (perfect) {
        msg = "Rodada perfeita!";
      }
      if (perfect && bonusOn) msg = `${msg ?? ""} +${LEVEL_PERFECT_BONUS}s`.trim();
      setStage(0);
      setLevelHits(0);
      setLevel(newLevel);
    } else {
      setStage(nextStage);
      setLevelHits(hits);
    }

    if (msg) setBanner(msg);
    setTimeout(() => {
      setFeedback(null);
      setBanner(null);
      loadQuestion(newLevel);
      lockRef.current = false;
    }, msg ? 1200 : 700);
  }

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title={TITLE} onExit={onExit} />
        <SessionSummary title={TITLE} session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title={TITLE}
        description="Complete a operação para chegar ao resultado. Nível 1: arraste o operador • Nível 2: digite o número • Nível 3: os dois • Nível 4: tudo misturado. Acerto +10 • Erro −5 • Nível perfeito +5s."
        onStart={startGame}
        onExit={onExit}
        lastMatch={lastMatch}
        sessionActive={team.activeSession}
        onFinishSession={sessionEnd.request}
        bonusTime={bonusOn}
        onBonusTimeChange={setBonusOn}
      >
        <TeamSetup value={teamConfig} onChange={setTeamConfig} locked={team.activeSession} />
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="completar"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup} />
        <TeamResults session={team} />
      </div>
    );
  }

  const flashClass = feedback === "correct" ? "animate-flash-correct" : feedback === "wrong" ? "animate-flash-wrong" : "";
  const ready = !!question && (!question.hasNum || numVal.trim() !== "") && (!question.hasOp || !!opVal);
  const resultLabel = question ? (typeof question.result === "boolean" ? (question.result ? "V" : "F") : String(question.result)) : "";

  return (
    <div className="space-y-4">
      <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} level={level} streak={streak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className={`relative rounded-3xl border bg-card p-5 sm:p-8 shadow-lg overflow-hidden ${flashClass}`}>
        {banner && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 backdrop-blur-sm">
            <div className="animate-level-up font-display text-5xl sm:text-6xl font-extrabold text-accent text-center">{banner}</div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-primary">{LEVEL_NAMES[level]}</span>
          <div className="flex gap-1.5">
            {Array.from({ length: PER_LEVEL }).map((_, i) => (
              <span key={i} className={`h-2.5 w-6 rounded-full ${i < stage ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        </div>

        {question && (
          <div key={question.key} className="mt-6 animate-pop-in">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 rounded-2xl bg-secondary px-4 py-6 font-display text-2xl sm:text-4xl font-bold text-secondary-foreground">
              {question.tokens.map((t, i) => {
                if (t.t === "num") return <span key={i}>{t.v}</span>;
                if (t.t === "op") return <span key={i} className="text-primary">{t.v}</span>;
                if (t.t === "slotNum")
                  return (
                    <input
                      key={i}
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      value={numVal}
                      disabled={!!feedback}
                      onChange={(e) => setNumVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                      aria-label="Número que falta"
                      className="w-20 sm:w-24 rounded-xl border-2 border-dashed border-accent bg-background px-2 py-1 text-center text-foreground outline-none focus:border-solid"
                    />
                  );
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label="Espaço do operador"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const v = e.dataTransfer.getData("text/plain"); if (v) setOpVal(v); }}
                    onClick={() => setOpVal(null)}
                    className={`min-w-16 sm:min-w-20 rounded-xl border-2 px-3 py-1 ${opVal ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-primary/60 bg-background text-muted-foreground"}`}
                  >
                    {opVal ?? "?"}
                  </button>
                );
              })}
              <span>=</span>
              <span className="text-accent">{resultLabel}</span>
            </div>

            {question.hasOp && (
              <div className="mt-6">
                <p className="text-center text-sm text-muted-foreground mb-3">Arraste (ou toque) o elemento certo para o espaço</p>
                <div className={`grid gap-3 mx-auto ${question.options.length === 2 ? "grid-cols-2 max-w-xs" : "grid-cols-4 max-w-md"}`}>
                  {question.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      draggable
                      disabled={!!feedback}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", o)}
                      onClick={() => setOpVal(o)}
                      className={`h-16 rounded-2xl border-2 font-display text-2xl font-bold shadow-md transition-transform hover:-translate-y-0.5 cursor-grab ${opVal === o ? "border-primary bg-primary/10" : "bg-card"}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <Button onClick={submit} disabled={!ready || !!feedback} className="h-14 px-10 text-xl font-bold rounded-2xl">
                <Check className="mr-2 h-6 w-6" /> Verificar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
