import { useEffect, useRef, useState } from "react";
import { Check, X, Sparkles, Percent, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { StartScreen } from "./StartScreen";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { Countdown } from "./Countdown";
import { useRoundClock, formatTime } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { PercentBar } from "./percent/PercentBar";
import { PieDiagram } from "./percent/PieDiagram";
import { PercentSliders } from "./percent/PercentSliders";
import { FractionPizza } from "./percent/FractionPizza";
import {
  makeQuestion, LEVEL_LABELS, QUESTIONS_PER_LEVEL,
  type PercentLevel, type PercentQuestion,
} from "@/lib/percent-content";
import {
  makeFractionQuestion, FRACTION_LEVEL_LABELS, FRACTION_QUESTIONS_PER_LEVEL,
  type FractionLevel, type FractionQuestion,
} from "@/lib/fraction-content";
import { playClick as soundClick, playCorrect as soundCorrect, playWrong as soundWrong } from "@/lib/sound";

const DURATION = 120;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 5;
const BONUS_STEP = 10;
const BONUS_MAX = 30;
const STREAK_MARKS = [5, 10, 15];

const MODE_KEY = "desafios-partes-mode-v1";
type Mode = "porcentagem" | "fracoes";
const MODE_LABEL: Record<Mode, string> = {
  porcentagem: "Desafio da Porcentagem",
  fracoes: "Desafio das Frações",
};

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

type Phase = "setup" | "countdown" | "playing";

const TITLE = "Desafio das Partes";

export function PercentGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [mode, setMode] = useState<Mode>("porcentagem");
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [lastMode, setLastMode] = useState<Mode | null>(null);

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [done, setDone] = useState(0); // questions answered in the current level
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [question, setQuestion] = useState<PercentQuestion | null>(null);
  const [fracQuestion, setFracQuestion] = useState<FractionQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"ok" | "bad" | null>(null);
  const [slices, setSlices] = useState<boolean[]>([]);
  const [pizzas, setPizzas] = useState<boolean[][]>([]);
  const [mixedPizzas, setMixedPizzas] = useState<boolean[][]>([]);
  const [bonusFlash, setBonusFlash] = useState(0);
  const [sliderValues, setSliderValues] = useState<number[]>([]);
  const [sliderResults, setSliderResults] = useState<(boolean | null)[] | null>(null);
  const [sliderMsg, setSliderMsg] = useState<string | null>(null);

  const timersRef = useRef<number[]>([]);
  const lockRef = useRef(false);
  const modeRef = useRef<Mode>("porcentagem");
  modeRef.current = mode;

  const maxLevel = mode === "fracoes" ? 6 : 5;
  const perLevel = mode === "fracoes" ? FRACTION_QUESTIONS_PER_LEVEL : QUESTIONS_PER_LEVEL;
  const levelLabel = mode === "fracoes"
    ? FRACTION_LEVEL_LABELS[level as FractionLevel]
    : LEVEL_LABELS[level as PercentLevel];

  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
    clearTimers();
  }, BONUS_STEP, BONUS_MAX);

  const usedTime = Math.max(0, DURATION + clock.bonus - clock.time);

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }

  useEffect(() => {
    setLastMatch(loadLastMatch("porcentagem"));
    try {
      const saved = window.localStorage.getItem(MODE_KEY) as Mode | null;
      if (saved === "porcentagem" || saved === "fracoes") {
        setMode(saved);
        setLastMode(saved);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!finished) return;
    updateBest("porcentagem", score, level);
    const m: LastMatch = {
      score,
      correct,
      wrong,
      level,
      at: Date.now(),
      mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : mode,
      isTeam: team.activeSession,
    };
    saveLastMatch("porcentagem", m);
    setLastMatch(m);
    setLastMode(mode);
    try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
    onStatsChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function loadNext(lvl: number, prev?: PercentQuestion) {
    if (modeRef.current === "fracoes") {
      const q = makeFractionQuestion(lvl as FractionLevel);
      setFracQuestion(q);
      setQuestion(null);
      setPizzas(q.kind === "frac-build" ? q.pizzas.map((p) => [...p.initial]) : []);
    } else {
      const q = makeQuestion(lvl as PercentLevel, prev);
      setQuestion(q);
      setFracQuestion(null);
      setSlices(q.kind === "pie-build" ? Array.from({ length: q.parts }, () => false) : []);
      setSliderValues(
        q.kind === "slider"
          ? q.targets.map(() => 0)
          : q.kind === "mixed-build"
            ? q.bars.map(() => 0)
            : [],
      );
      setMixedPizzas(
        q.kind === "mixed-build"
          ? q.pizzas.map((p) => Array.from({ length: p.parts }, () => false))
          : [],
      );
      setSliderResults(null);
      setSliderMsg(null);
    }
    setPicked(null);
    setFeedback(null);
    lockRef.current = false;
  }

  function startGame() {
    clearTimers();
    lockRef.current = false;
    team.begin(teamConfig);
    try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
    setCorrect(0); setWrong(0); setStreak(0); setBestStreak(0);
    setLevel(1); setDone(0);
    setFinished(false);
    setRunId((r) => r + 1);
    setPhase("playing");
    setRunning(true);
    loadNext(1);
  }

  function replayWithCountdown() {
    team.advance();
    clearTimers();
    setFinished(false);
    setRunning(false);
    setPhase("countdown");
  }

  function backToSetup() {
    clearTimers();
    setRunning(false);
    setFinished(false);
    setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  function register(isRight: boolean) {
    if (isRight) {
      setCorrect((c) => c + 1);
      soundCorrect();
      setStreak((s) => {
        const n = s + 1;
        setBestStreak((b) => Math.max(b, n));
        if (bonusOn && STREAK_MARKS.includes(n) && clock.bonus < BONUS_MAX) {
          clock.addBonus(BONUS_STEP);
          setBonusFlash(Date.now());
        }
        return n;
      });
    } else {
      setWrong((w) => w + 1);
      setStreak(0);
      soundWrong();
    }
    setFeedback(isRight ? "ok" : "bad");

    const t = window.setTimeout(() => {
      const nextDone = done + 1;
      let nextLevel = level;
      if (level < maxLevel && nextDone >= perLevel) {
        nextLevel = level + 1;
        setLevel(nextLevel);
        setDone(0);
      } else {
        setDone(level === maxLevel ? (nextDone % perLevel) : nextDone);
      }
      loadNext(nextLevel, question ?? undefined);
    }, isRight ? 950 : 1500);
    timersRef.current.push(t);
  }

  function answer(opt: string) {
    if (lockRef.current || !running || picked || feedback) return;
    const q = mode === "fracoes" ? fracQuestion : question;
    if (!q || (q.kind !== "frac-id" && q.kind !== "bar" && q.kind !== "pie" && q.kind !== "word")) return;
    lockRef.current = true;
    soundClick();
    setPicked(opt);
    register(opt === q.answer);
  }

  function toggleSlice(i: number) {
    if (!running || !question || question.kind !== "pie-build" || feedback) return;
    soundClick();
    setSlices((s) => s.map((v, idx) => (idx === i ? !v : v)));
  }

  function confirmBuild() {
    if (lockRef.current || !running || !question || question.kind !== "pie-build" || feedback) return;
    lockRef.current = true;
    const count = slices.filter(Boolean).length;
    register(count === question.target);
  }

  function validateSliders() {
    if (lockRef.current || !running || !question || question.kind !== "slider" || feedback) return;
    lockRef.current = true;
    const res = question.targets.map((t, i) => (sliderValues[i] ?? 0) === t);
    const misses = res.filter((r) => !r).length;
    setSliderResults(res);
    if (misses === 0) {
      setSliderMsg(null);
      register(true);
      return;
    }
    setSliderMsg(`${misses}/${question.targets.length} barras incorretas.`);
    register(false);
  }

  function toggleMixedPizza(p: number, i: number) {
    if (!running || !question || question.kind !== "mixed-build" || feedback) return;
    soundClick();
    setMixedPizzas((all) => all.map((arr, pi) => (pi === p ? arr.map((v, idx) => (idx === i ? !v : v)) : arr)));
  }

  function validateMixed() {
    if (lockRef.current || !running || !question || question.kind !== "mixed-build" || feedback) return;
    lockRef.current = true;
    const barRes = question.bars.map((t, i) => (sliderValues[i] ?? 0) === t);
    const barMisses = barRes.filter((r) => !r).length;
    const pizzaMisses = question.pizzas.filter(
      (spec, i) => (mixedPizzas[i]?.filter(Boolean).length ?? 0) !== spec.target,
    ).length;
    setSliderResults(barRes);
    if (barMisses === 0 && pizzaMisses === 0) {
      setSliderMsg(null);
      register(true);
      return;
    }
    const parts: string[] = [];
    if (barMisses > 0) parts.push(`${barMisses} barra(s) incorreta(s)`);
    if (pizzaMisses > 0) parts.push(`${pizzaMisses} pizza(s) incorreta(s)`);
    setSliderMsg(parts.join(" • "));
    register(false);
  }

  function togglePizza(p: number, i: number) {
    if (!running || !fracQuestion || fracQuestion.kind !== "frac-build" || feedback) return;
    soundClick();
    setPizzas((all) => all.map((arr, pi) => (pi === p ? arr.map((v, idx) => (idx === i ? !v : v)) : arr)));
  }

  function confirmPizzas() {
    if (lockRef.current || !running || !fracQuestion || fracQuestion.kind !== "frac-build" || feedback) return;
    lockRef.current = true;
    const ok = fracQuestion.pizzas.every((spec, i) => (pizzas[i]?.filter(Boolean).length ?? -1) === spec.target);
    register(ok);
  }

  /* --------------------------------- Views --------------------------------- */

  if (sessionEnd.showing) {
    return (
      <div className="space-y-3">
        <GameTopBar title={TITLE} onExit={onExit} />
        <SessionSummary title={TITLE} session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title={TITLE}
        description="Descubra, represente e complete partes de um todo usando porcentagens e frações."
        onStart={startGame}
        onExit={onExit}
        lastMatch={lastMatch}
        sessionActive={team.activeSession}
        onFinishSession={sessionEnd.request}
        bonusTime={bonusOn}
        onBonusTimeChange={setBonusOn}
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Escolha o modo</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                active={mode === "porcentagem"}
                onClick={() => setMode("porcentagem")}
                icon={<Percent className="h-6 w-6" />}
                title="Desafio da Porcentagem"
                text="Barras, diagramas, réguas e situações do dia a dia."
              />
              <ModeCard
                active={mode === "fracoes"}
                onClick={() => setMode("fracoes")}
                icon={<PieChart className="h-6 w-6" />}
                title="Desafio das Frações"
                text="Pizzas de 3, 4, 5, 8 e 10 partes para montar frações."
              />
            </div>
            {lastMode && (
              <p className="mt-2 text-xs text-muted-foreground">
                Último modo jogado: <b>{MODE_LABEL[lastMode]}</b>
              </p>
            )}
          </div>

          <TeamSetup value={teamConfig} onChange={setTeamConfig} locked={team.activeSession} />
          <div className="rounded-2xl border bg-secondary/40 p-4 text-sm text-secondary-foreground">
            <p className="font-semibold mb-1">Como jogar</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Cada nível tem 5 questões; termine as 5 para avançar.</li>
              <li>Acerto: <b>+10</b> • Erro: <b>−5</b> (nunca abaixo de zero).</li>
              <li>A cada 5 acertos seguidos você ganha <b>+10 segundos</b> (até 2:30).</li>
              <li>No fim dos níveis começa o <b>modo desafio</b>, com tudo misturado.</li>
            </ul>
          </div>
        </div>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-3">
        <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    const total = correct + wrong;
    const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
    return (
      <div className="space-y-3">
        <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="porcentagem"
          mode={mode}
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-4 text-center shadow-sm">
          <p className="font-display text-lg font-bold">
            {mode === "fracoes" ? `Você acertou ${pct}% das frações.` : `Você dominou ${pct}% dos desafios.`}
          </p>
          <p className="text-sm text-muted-foreground">
            Modo: <b>{MODE_LABEL[mode]}</b> • Maior sequência: <b>{bestStreak}</b> • Tempo utilizado: <b>{formatTime(usedTime)}</b> • Nível: <b>{levelLabel}</b>
          </p>
        </div>
        <TeamResults session={team} />
      </div>
    );
  }

  const activeQuestion = mode === "fracoes" ? fracQuestion : question;
  const pizzaSize = fracQuestion?.kind === "frac-build"
    ? (fracQuestion.pizzas.length >= 3 ? 150 : fracQuestion.pizzas.length === 2 ? 180 : 230)
    : 220;

  return (
    <div className="space-y-3">
      <GameTopBar title={TITLE} onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} level={level} streak={streak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-2 text-sm shadow-sm">
        <span className="font-display font-bold">
          {MODE_LABEL[mode]} • Nível {level} — {levelLabel}
        </span>
        <span className="text-muted-foreground">
          {level === maxLevel ? "Questões misturadas" : `Questões: ${done}/${perLevel}`}
        </span>
      </div>

      {bonusFlash > 0 && Date.now() - bonusFlash < 1600 && (
        <div key={bonusFlash} className="pointer-events-none fixed left-1/2 top-24 z-40 -translate-x-1/2 animate-pop-in rounded-2xl bg-success px-5 py-2 font-display text-xl font-extrabold text-white shadow-xl">
          +{BONUS_STEP} SEGUNDOS!
        </div>
      )}

      <div
        className={`rounded-3xl border-4 bg-card p-4 sm:p-5 shadow-lg transition-colors ${
          feedback === "ok" ? "border-success" : feedback === "bad" ? "border-destructive animate-shake-x" : "border-transparent"
        }`}
      >
        {activeQuestion && (
          <>
            <div className="text-center">
              <h2 className="font-display text-xl sm:text-2xl font-extrabold">{activeQuestion.prompt}</h2>
              {"highlight" in activeQuestion && activeQuestion.highlight && (
                <div className="mx-auto mt-2 inline-block rounded-2xl bg-primary/10 px-5 py-2 font-display text-2xl sm:text-3xl font-extrabold text-primary">
                  {activeQuestion.highlight}
                </div>
              )}
            </div>

            <div className="mt-4 grid place-items-center">
              {question?.kind === "bar" && (
                <PercentBar variant={question.variant} parts={question.parts} filled={question.filled} />
              )}
              {question?.kind === "pie" && (
                <PieDiagram parts={question.parts} filled={question.filled} />
              )}
              {question?.kind === "pie-build" && (
                <div className="flex flex-col items-center gap-3">
                  <PieDiagram parts={question.parts} filled={0} selected={slices} onToggle={toggleSlice} size={220} />
                  <p className="text-sm text-muted-foreground">
                    Toque nas partes • selecionadas: <b className="text-foreground">{slices.filter(Boolean).length}</b> de {question.parts}
                  </p>
                  <Button size="lg" className="h-12 rounded-2xl px-8 text-base font-bold" onClick={confirmBuild} disabled={!!feedback}>
                    Confirmar
                  </Button>
                </div>
              )}
              {question?.kind === "slider" && (
                <div className="flex w-full flex-col items-center gap-4">
                  <PercentSliders
                    targets={question.targets}
                    values={sliderValues}
                    results={sliderResults ?? undefined}
                    disabled={!!feedback}
                    onChange={(i, v) =>
                      setSliderValues((arr) => arr.map((old, idx) => (idx === i ? v : old)))
                    }
                  />
                  {sliderMsg && (
                    <div className="animate-shake-x rounded-2xl bg-destructive/15 px-4 py-2 font-semibold text-destructive">
                      {sliderMsg}
                    </div>
                  )}
                  <Button size="lg" className="h-12 rounded-2xl px-8 text-base font-bold" onClick={validateSliders} disabled={!!feedback}>
                    Validar
                  </Button>
                </div>
              )}
              {question?.kind === "word" && (
                <div className="text-5xl sm:text-6xl">{question.emoji}</div>
              )}
              {question?.kind === "mixed-build" && (
                <div className="flex w-full flex-col items-center gap-4">
                  <PercentSliders
                    targets={question.bars}
                    values={sliderValues}
                    results={sliderResults ?? undefined}
                    disabled={!!feedback}
                    onChange={(i, v) =>
                      setSliderValues((arr) => arr.map((old, idx) => (idx === i ? v : old)))
                    }
                  />
                  <div className="flex flex-wrap items-start justify-center gap-4">
                    {question.pizzas.map((spec, pi) => {
                      const count = mixedPizzas[pi]?.filter(Boolean).length ?? 0;
                      const state = !feedback ? "idle" : count === spec.target ? "ok" : "bad";
                      return (
                        <FractionPizza
                          key={pi}
                          parts={spec.parts}
                          selected={mixedPizzas[pi] ?? []}
                          onToggle={(i) => toggleMixedPizza(pi, i)}
                          label={`${spec.pct}% (${spec.parts} partes)`}
                          state={state}
                          size={question.pizzas.length >= 2 ? 175 : 200}
                        />
                      );
                    })}
                  </div>
                  {sliderMsg && (
                    <div className="animate-shake-x rounded-2xl bg-destructive/15 px-4 py-2 font-semibold text-destructive">
                      {sliderMsg}
                    </div>
                  )}
                  <Button size="lg" className="h-12 rounded-2xl px-8 text-base font-bold" onClick={validateMixed} disabled={!!feedback}>
                    Confirmar
                  </Button>
                </div>
              )}

              {fracQuestion?.kind === "frac-id" && (
                <FractionPizza
                  parts={fracQuestion.parts}
                  selected={Array.from({ length: fracQuestion.parts }, (_, i) => i < fracQuestion.filled)}
                  size={220}
                />
              )}
              {fracQuestion?.kind === "frac-build" && (
                <div className="flex w-full flex-col items-center gap-3">
                  <div className="flex flex-wrap items-start justify-center gap-4">
                    {fracQuestion.pizzas.map((spec, pi) => {
                      const count = pizzas[pi]?.filter(Boolean).length ?? 0;
                      const state = !feedback ? "idle" : count === spec.target ? "ok" : "bad";
                      return (
                        <FractionPizza
                          key={pi}
                          parts={spec.parts}
                          selected={pizzas[pi] ?? []}
                          onToggle={(i) => togglePizza(pi, i)}
                          label={`${spec.target}/${spec.parts}`}
                          state={state}
                          size={pizzaSize}
                        />
                      );
                    })}
                  </div>
                  <Button size="lg" className="h-12 rounded-2xl px-8 text-base font-bold" onClick={confirmPizzas} disabled={!!feedback}>
                    Confirmar
                  </Button>
                </div>
              )}
            </div>

            {"options" in activeQuestion && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {activeQuestion.options.map((opt) => {
                  const isAnswer = opt === activeQuestion.answer;
                  const isPicked = opt === picked;
                  const state = !feedback
                    ? "bg-card hover:bg-secondary border-border"
                    : isAnswer
                      ? "bg-success/15 border-success text-success"
                      : isPicked
                        ? "bg-destructive/15 border-destructive text-destructive"
                        : "bg-card border-border opacity-60";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => answer(opt)}
                      disabled={!!feedback}
                      className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 font-display text-2xl font-extrabold shadow-sm transition-all hover:scale-[1.02] active:scale-95 ${state}`}
                    >
                      {feedback && isAnswer && <Check className="h-5 w-5" />}
                      {feedback && isPicked && !isAnswer && <X className="h-5 w-5" />}
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {feedback && (
              <div
                className={`mt-3 flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-center font-semibold animate-pop-in ${
                  feedback === "ok" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                }`}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>
                  {feedback === "ok" ? "Muito bem! " : "Quase! "}
                  {activeQuestion.tip}
                  {feedback === "bad" && "answer" in activeQuestion && ` Resposta: ${activeQuestion.answer}.`}
                  {feedback === "bad" && question?.kind === "pie-build" && ` Eram ${question.target} de ${question.parts} partes.`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ModeCard({
  active, onClick, icon, title, text,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all hover:scale-[1.01] active:scale-95 ${
        active ? "border-primary bg-primary/10 shadow-md" : "border-border bg-card hover:bg-secondary"
      }`}
    >
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-display font-bold leading-tight">{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
    </button>
  );
}
