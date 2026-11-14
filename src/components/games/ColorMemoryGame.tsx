import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameHud } from "./GameHud";
import { ResultPanel } from "./ResultPanel";
import { StartScreen, OptionChip } from "./StartScreen";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { Countdown } from "./Countdown";
import { useRoundClock } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { playTone } from "@/lib/sound";

const DURATION = 120;
const POINTS_CORRECT = 10;
const POINTS_WRONG = 5;

type Difficulty = "facil" | "normal" | "dificil";
const DIFFICULTY: Record<Difficulty, { startLen: number; flash: number; gap: number; label: string; hint: string }> = {
  facil:   { startLen: 2, flash: 780, gap: 380, label: "Fácil",  hint: "começa com 2 cores, bem devagar" },
  normal:  { startLen: 3, flash: 620, gap: 300, label: "Normal", hint: "começa com 3 cores" },
  dificil: { startLen: 4, flash: 480, gap: 220, label: "Difícil", hint: "começa com 4 cores, mais rápido" },
};

type Color = "green" | "red" | "blue" | "yellow";
const COLORS: Color[] = ["green", "red", "blue", "yellow"];

const COLOR_STYLES: Record<Color, { base: string; active: string; freq: number; label: string }> = {
  green:  { base: "bg-emerald-500",  active: "bg-emerald-300 shadow-[0_0_60px_20px_rgba(16,185,129,0.7)]", freq: 329.63, label: "Verde" },
  red:    { base: "bg-rose-500",     active: "bg-rose-300 shadow-[0_0_60px_20px_rgba(244,63,94,0.7)]",     freq: 261.63, label: "Vermelho" },
  blue:   { base: "bg-sky-500",      active: "bg-sky-300 shadow-[0_0_60px_20px_rgba(14,165,233,0.7)]",     freq: 220.00, label: "Azul" },
  yellow: { base: "bg-amber-400",    active: "bg-amber-200 shadow-[0_0_60px_20px_rgba(251,191,36,0.75)]",  freq: 392.00, label: "Amarelo" },
};

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

type Phase = "setup" | "countdown" | "playing";
type SubPhase = "showing" | "input" | "correct" | "wrong" | "reveal";

function randomSeq(len: number, avoid?: Color[]): Color[] {
  for (let tries = 0; tries < 10; tries++) {
    const s: Color[] = Array.from({ length: len }, () => COLORS[Math.floor(Math.random() * 4)]);
    if (!avoid || avoid.length !== len || s.some((c, i) => c !== avoid[i])) return s;
  }
  return Array.from({ length: len }, () => COLORS[Math.floor(Math.random() * 4)]);
}

export function ColorMemoryGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [difficulty, setDifficulty] = useState<Difficulty>(isRanked ? "dificil" : "facil");
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const diffRef = useRef(DIFFICULTY[isRanked ? "dificil" : "facil"]);
  diffRef.current = DIFFICULTY[isRanked ? "dificil" : difficulty];

  useEffect(() => {
    if (isRanked) {
      setDifficulty("dificil");
    }
  }, [isRanked]);

  useEffect(() => { setLastMatch(loadLastMatch("memoria")); }, []);

  const [finished, setFinished] = useState(false);
  const [running, setRunning] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [bestStreak, setBestStreak] = useState(0);

  const [seq, setSeq] = useState<Color[]>([]);
  const [userIdx, setUserIdx] = useState(0);
  const [active, setActive] = useState<Color | null>(null);
  const [sub, setSub] = useState<SubPhase>("showing");
  const [shake, setShake] = useState(false);
  const seqRef = useRef<Color[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  /** How many rounds were already played with the current sequence length. */
  const roundAtLenRef = useRef(0);

  const score = Math.max(0, correct * POINTS_CORRECT - wrong * POINTS_WRONG);

  const clock = useRoundClock(DURATION, running, () => {
    setRunning(false);
    setFinished(true);
    clearTimeouts();
  });

  function clearTimeouts() {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
  }

  useEffect(() => {
    if (finished) {
      updateBest("memoria", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("memoria", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => () => clearTimeouts(), []);

  function startGame() {
    clearTimeouts();
    team.begin(teamConfig);
    setCorrect(0); setWrong(0); setLevel(1); setBestStreak(0);
    roundAtLenRef.current = 0;
    setFinished(false);
    setRunId((r) => r + 1);
    const first = randomSeq(DIFFICULTY[difficulty].startLen);
    seqRef.current = first;
    setSeq(first);
    setUserIdx(0);
    setPhase("playing");
    setRunning(true);
    playSequence(first);
  }

  function replayWithCountdown() {
    team.advance();
    clearTimeouts();
    setFinished(false);
    setRunning(false);
    setPhase("countdown");
  }

  function backToSetup() {
    clearTimeouts();
    setRunning(false);
    setFinished(false);
    setPhase("setup");
  }

  const sessionEnd = useSessionEnd(team, backToSetup);

  function playSequence(sequence: Color[], onDone?: () => void) {
    setSub("showing");
    setActive(null);
    // Speed scales gently with level
    const d = diffRef.current;
    const flashDur = Math.max(300, d.flash - (level - 1) * 25);
    const gap = Math.max(140, d.gap - (level - 1) * 12);
    let t = 400;
    sequence.forEach((c) => {
      const onT = window.setTimeout(() => {
        setActive(c);
        playTone(COLOR_STYLES[c].freq, flashDur / 1000);
      }, t);
      const offT = window.setTimeout(() => setActive(null), t + flashDur);
      timeoutsRef.current.push(onT, offT);
      t += flashDur + gap;
    });
    const doneT = window.setTimeout(() => {
      setActive(null);
      setSub("input");
      setUserIdx(0);
      onDone?.();
    }, t + 100);
    timeoutsRef.current.push(doneT);
  }

  function handleClick(c: Color) {
    if (!running || sub !== "input") return;
    const target = seqRef.current[userIdx];
    setActive(c);
    playTone(COLOR_STYLES[c].freq, 0.25);
    window.setTimeout(() => setActive(null), 200);

    if (c !== target) {
      // Wrong: repeat the SAME sequence and wait for the answer again
      setSub("wrong");
      setUserIdx(0);
      setWrong((w) => w + 1);
      setShake(true);
      playTone(120, 0.5, "sawtooth");
      window.setTimeout(() => setShake(false), 450);
      const revealT = window.setTimeout(() => {
        setSub("reveal");
        playSequence(seqRef.current);
      }, 800);
      timeoutsRef.current.push(revealT);
      return;
    }

    const nextIdx = userIdx + 1;
    if (nextIdx >= seqRef.current.length) {
      // Full sequence correct
      setSub("correct");
      setCorrect((n) => n + 1);
      if (bonusOn) clock.addBonus();
      // Each length is played twice before growing
      const currentLen = seqRef.current.length;
      const grow = roundAtLenRef.current >= 1;
      roundAtLenRef.current = grow ? 0 : roundAtLenRef.current + 1;
      const newLen = grow ? currentLen + 1 : currentLen;
      setBestStreak((b) => Math.max(b, currentLen));
      setLevel((l) => l + 1);
      playTone(523.25, 0.15);
      window.setTimeout(() => playTone(659.25, 0.15), 150);
      window.setTimeout(() => playTone(783.99, 0.2), 300);
      const nextT = window.setTimeout(() => {
        const next = randomSeq(newLen, seqRef.current);
        seqRef.current = next;
        setSeq(next);
        playSequence(next);
      }, 900);
      timeoutsRef.current.push(nextT);

    } else {
      setUserIdx(nextIdx);
    }
  }

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Memória das Cores" onExit={onExit} />
        <SessionSummary title="Memória das Cores" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="Memória das Cores"
        description="Memorize e repita a sequência de cores. Acerto: +10 • Erro: −5"
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
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
              Dificuldade {isRanked && "• 🔒 Travada no Máximo (Torneio Ranqueado)"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                <OptionChip
                  key={d}
                  active={difficulty === d}
                  onClick={() => {
                    if (!isRanked) setDifficulty(d);
                  }}
                >
                  {DIFFICULTY[d].label} {isRanked && d === "dificil" ? "🔒" : ""}
                </OptionChip>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isRanked
                ? "Nos Desafios Ranqueados a dificuldade é travada no modo Difícil (começa com 4 cores, mais rápido)."
                : DIFFICULTY[difficulty].hint}
            </p>
          </div>

          <TeamSetup value={teamConfig} onChange={setTeamConfig} locked={team.activeSession} />

        <div className="rounded-2xl border bg-secondary/40 p-4 text-sm text-secondary-foreground">
          <p className="font-semibold mb-1">Como jogar</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Observe a sequência de cores acender.</li>
            <li>Quando aparecer <b>Sua vez!</b>, repita a sequência clicando nos quadrantes.</li>
            <li>Cada acerto aumenta o tamanho da sequência.</li>
            <li>Você tem 2 minutos — quanto mais acertar, maior a pontuação.</li>
          </ul>
        </div>
        </div>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title="Memória das Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Memória das Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="memoria"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
      </div>
    );
  }

  const centerText =
    sub === "showing" ? "Observe" :
    sub === "reveal" ? "Sequência correta" :
    sub === "wrong" ? "Errou!" :
    sub === "correct" ? "Muito bem!" :
    "Sua vez!";

  return (
    <div className="space-y-4">
      <GameTopBar title="Memória das Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <GameHud time={clock.time} score={score} wrong={wrong} level={level} streak={bestStreak} />
      <TeamScoreBar key={runId} session={team} score={score} />

      <div className={`relative rounded-3xl border bg-card p-3 sm:p-5 shadow-lg ${shake ? "animate-shake-x" : ""}`}>
        <div className="text-center text-sm text-muted-foreground mb-3">
          Sequência: <b className="text-foreground">{seq.length}</b> cores
          {sub === "input" && (
            <> • Progresso: <b className="text-foreground">{userIdx}/{seq.length}</b></>
          )}
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[min(46vh,460px)]">
          <div className="absolute inset-0 rounded-full overflow-hidden grid grid-cols-2 grid-rows-2 gap-2 bg-background shadow-2xl border-4 border-background">
            <Quadrant color="green"  active={active === "green"}  disabled={sub !== "input"} onClick={() => handleClick("green")} />
            <Quadrant color="red"    active={active === "red"}    disabled={sub !== "input"} onClick={() => handleClick("red")} />
            <Quadrant color="yellow" active={active === "yellow"} disabled={sub !== "input"} onClick={() => handleClick("yellow")} />
            <Quadrant color="blue"   active={active === "blue"}   disabled={sub !== "input"} onClick={() => handleClick("blue")} />
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className={`grid place-items-center rounded-full border-4 border-background bg-card shadow-2xl h-24 w-24 sm:h-32 sm:w-32 text-center px-3
              ${sub === "correct" ? "animate-pop-in ring-4 ring-success" : ""}
              ${sub === "wrong" ? "ring-4 ring-destructive" : ""}
            `}>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Nível {level}</div>
                <div className="font-display text-xl sm:text-2xl font-extrabold leading-tight">{centerText}</div>
                <div className="text-xs text-muted-foreground mt-1">Maior: {bestStreak}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Quadrant({
  color, active, disabled, onClick,
}: {
  color: Color;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const styles = COLOR_STYLES[color];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={styles.label}
      className={`transition-all duration-150
        ${active ? `${styles.active} brightness-125` : `${styles.base} hover:brightness-110`}
        ${disabled ? "cursor-not-allowed" : "cursor-pointer active:brightness-125"}
      `}
    />
  );
}

