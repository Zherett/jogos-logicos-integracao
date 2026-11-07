import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Rocket,
  Flame,
  Zap,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Sparkles,
  Shield,
  Award,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useRoundClock } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { ResultPanel } from "./ResultPanel";
import { Countdown } from "./Countdown";
import { StartScreen } from "./StartScreen";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import {
  generateSpaceQuestQuestion,
  resolveAnswer,
  getStageFallDurationSeconds,
  FLOOR_COLLISION_PENALTY,
  AURA_CONFIGS,
  type SpaceQuestQuestion,
  type AuraType,
} from "@/lib/space-quest-content";
import { playCorrect, playWrong, playTone, playVictory, useSoundMuted } from "@/lib/sound";
import { usePlayerAuth } from "@/lib/player-auth";
import type { GameComponentProps } from "@/lib/game-registry";

interface ActiveFallingQuestion {
  instanceId: string;
  data: SpaceQuestQuestion;
  /** Horizontal position 10% to 90% */
  laneXPercent: number;
  /** Vertical position 0 to 100% */
  yPercent: number;
  /** Speed (% per second) */
  speedYPerSec: number;
  hasFallen: boolean;
}

const ROUND_DURATION_SECONDS = 90;

export function SpaceQuestGame({ onExit, onStatsChange, isRanked }: GameComponentProps) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing" | "gameover">("setup");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [floorCollisions, setFloorCollisions] = useState(0);
  const [level, setLevel] = useState(1);
  const [fallingItems, setFallingItems] = useState<ActiveFallingQuestion[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [laserEffect, setLaserEffect] = useState<{
    targetX: number;
    targetY: number;
    color: string;
  } | null>(null);
  const [comboBanner, setComboBanner] = useState<string | null>(null);
  const [specialAuraUnlocked, setSpecialAuraUnlocked] = useState<string | null>(null);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);

  const { muted, toggle: toggleMuted } = useSoundMuted();
  const auth = usePlayerAuth();
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const lastSpawnTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  // Load last match stats
  useEffect(() => {
    setLastMatch(loadLastMatch("spacequest"));
  }, []);

  // Clock
  const { secondsLeft, isFinished: isTimeUp, reset: resetClock } = useRoundClock(
    ROUND_DURATION_SECONDS,
    phase === "playing",
  );

  // Background stars generation (deterministic static positions)
  const stars = useRef(
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      x: (i * 17) % 100,
      y: (i * 23) % 100,
      size: (i % 3) + 1.2,
      opacity: ((i % 5) + 4) / 10,
      blinkDelay: (i % 7) * 0.4,
    })),
  ).current;

  // Level progression derived from score
  useEffect(() => {
    const nextLevel = Math.min(5, Math.floor(score / 70) + 1);
    if (nextLevel > level) {
      setLevel(nextLevel);
      playTone(720, 0.2, "sine", 0.08);
    }
  }, [score, level]);

  // End of match trigger
  useEffect(() => {
    if (phase === "playing" && isTimeUp) {
      finishGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimeUp, phase]);

  const finishGame = useCallback(() => {
    setPhase("gameover");
    playVictory();

    const finalScore = Math.max(0, score);
    const finalLevel = level;

    updateBest("spacequest", finalScore, finalLevel);
    const lastM: LastMatch = {
      score: finalScore,
      correct: correctCount,
      wrong: wrongCount,
      level: finalLevel,
      at: Date.now(),
      mode: isRanked ? "torneio_semanal" : "padrao",
    };
    saveLastMatch("spacequest", lastM);
    setLastMatch(lastM);
    onStatsChange();
  }, [score, level, correctCount, wrongCount, isRanked, onStatsChange]);

  // Start Playing transition from Countdown: Immediately spawn first question
  const handleStartPlaying = useCallback(() => {
    const qData = generateSpaceQuestQuestion(1);
    const duration = getStageFallDurationSeconds(1, qData.difficulty);
    const firstItem: ActiveFallingQuestion = {
      instanceId: `item_${Date.now()}_first`,
      data: qData,
      laneXPercent: 50,
      yPercent: 2,
      speedYPerSec: 100 / duration,
      hasFallen: false,
    };
    setFallingItems([firstItem]);
    setActiveTargetId(firstItem.instanceId);
    lastSpawnTimeRef.current = Date.now();
    setPhase("playing");
  }, []);

  // Main game animation & physics loop
  useEffect(() => {
    if (phase !== "playing") return;

    lastFrameTimeRef.current = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.08, (time - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = time;

      const now = Date.now();
      const maxConcurrent = level >= 4 ? 3 : level >= 2 ? 2 : 1;
      const spawnInterval = Math.max(2400, 4800 - level * 500);

      setFallingItems((prev) => {
        let updated = [...prev];

        // Check if we should spawn another question: either empty or timer elapsed
        if (updated.length < maxConcurrent && (updated.length === 0 || now - lastSpawnTimeRef.current > spawnInterval)) {
          lastSpawnTimeRef.current = now;
          const qData = generateSpaceQuestQuestion(level);
          const duration = getStageFallDurationSeconds(level, qData.difficulty);
          const speedY = 100 / duration; // % per second

          const lanes = [22, 50, 78];
          const chosenLane = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() * 8 - 4);

          updated.push({
            instanceId: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            data: qData,
            laneXPercent: Math.max(16, Math.min(84, chosenLane)),
            yPercent: 0,
            speedYPerSec: speedY,
            hasFallen: false,
          });
        }

        // 2. Move existing items downward
        let floorHits = 0;
        const nextList: ActiveFallingQuestion[] = [];

        for (const item of updated) {
          const nextY = item.yPercent + item.speedYPerSec * dt;

          if (nextY >= 88) {
            // Hit bottom! Floor penalty
            floorHits++;
            playTone(180, 0.18, "sawtooth", 0.05);
          } else {
            nextList.push({ ...item, yPercent: nextY });
          }
        }

        if (floorHits > 0) {
          setScore((s) => Math.max(0, s - FLOOR_COLLISION_PENALTY * floorHits));
          setFloorCollisions((f) => f + floorHits);
        }

        return nextList;
      });

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [phase, level]);

  // Keep target synchronized: default to the lowest question (closest to bottom)
  useEffect(() => {
    if (fallingItems.length === 0) {
      setActiveTargetId(null);
      return;
    }
    const exists = fallingItems.some((it) => it.instanceId === activeTargetId);
    if (!exists) {
      const lowest = [...fallingItems].sort((a, b) => b.yPercent - a.yPercent)[0];
      setActiveTargetId(lowest ? lowest.instanceId : null);
    }
  }, [fallingItems, activeTargetId]);

  // Submit answer handler
  const handleAnswer = useCallback(
    (selectedOption: string) => {
      if (phase !== "playing" || !activeTargetId) return;

      const targetItem = fallingItems.find((it) => it.instanceId === activeTargetId);
      if (!targetItem) return;

      const res = resolveAnswer(targetItem.data, selectedOption, combo);

      // Trigger laser beam from bottom ship to target
      setLaserEffect({
        targetX: targetItem.laneXPercent,
        targetY: targetItem.yPercent,
        color: res.isCorrect ? "#38bdf8" : "#ef4444",
      });
      setTimeout(() => setLaserEffect(null), 250);

      if (res.isCorrect) {
        playCorrect();
        setScore((s) => s + res.scoreDelta);
        setCorrectCount((c) => c + 1);
        setCombo(res.newCombo);
        setMaxCombo((m) => Math.max(m, res.newCombo));

        // Combo bonus announcement
        if (res.comboBonusEarned) {
          playTone(880, 0.25, "triangle", 0.12);
          setComboBanner(`COMBO x${res.newCombo}! +10 PTS BÔNUS! 🔥`);
          setTimeout(() => setComboBanner(null), 1800);
        }

        // Special aura medal grant
        if (res.unlockedMedalId) {
          const auraCfg = targetItem.data.aura;
          const auraName = AURA_CONFIGS[auraCfg].medalTitle;
          setSpecialAuraUnlocked(`Medalha Desbloqueada: ${auraName}! 🎖️`);
          setTimeout(() => setSpecialAuraUnlocked(null), 3500);

          if (auth.awardSpaceQuestMedal) {
            void auth.awardSpaceQuestMedal(
              res.unlockedMedalId as "sq_safira" | "sq_ametista" | "sq_rubi" | "sq_ambar",
            );
          }
        }

        // Remove answered question and immediately trigger next spawn if empty
        setFallingItems((prev) => {
          const remaining = prev.filter((it) => it.instanceId !== activeTargetId);
          if (remaining.length === 0) {
            const nextQ = generateSpaceQuestQuestion(level);
            const nextDur = getStageFallDurationSeconds(level, nextQ.difficulty);
            const lanes = [22, 50, 78];
            const chosen = lanes[Math.floor(Math.random() * lanes.length)];
            const newItem: ActiveFallingQuestion = {
              instanceId: `item_${Date.now()}_auto`,
              data: nextQ,
              laneXPercent: chosen,
              yPercent: 0,
              speedYPerSec: 100 / nextDur,
              hasFallen: false,
            };
            setActiveTargetId(newItem.instanceId);
            return [newItem];
          }
          return remaining;
        });
      } else {
        // Wrong answer
        playWrong();
        setScore((s) => Math.max(0, s + res.scoreDelta));
        setWrongCount((w) => w + 1);
        setCombo(0);
      }
    },
    [phase, activeTargetId, fallingItems, combo, auth, level],
  );

  // Keyboard controls: 1, 2, 3, 4 for math / V, F for logic
  useEffect(() => {
    if (phase !== "playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const currentTarget = fallingItems.find((it) => it.instanceId === activeTargetId);
      if (!currentTarget) return;

      if (currentTarget.data.kind === "logic") {
        if (key === "V" || key === "1") handleAnswer("V");
        else if (key === "F" || key === "2") handleAnswer("F");
      } else {
        const opts = currentTarget.data.options;
        if (key === "1" && opts[0]) handleAnswer(opts[0]);
        else if (key === "2" && opts[1]) handleAnswer(opts[1]);
        else if (key === "3" && opts[2]) handleAnswer(opts[2]);
        else if (key === "4" && opts[3]) handleAnswer(opts[3]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, activeTargetId, fallingItems, handleAnswer]);

  /* --------------------------------- VIEWS --------------------------------- */

  // 1. SETUP / START SCREEN VIEW
  if (phase === "setup") {
    return (
      <StartScreen
        title="Space Quest"
        description="Pilote sua nave e destrua as operações lógicas e matemáticas que caem pelo espaço sideral antes que atinjam a barreira estelar!"
        onStart={() => setPhase("countdown")}
        onExit={onExit}
        lastMatch={lastMatch}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
            <h4 className="font-display text-sm font-bold text-sky-400 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Auras Especiais e Medalhas Cósmicas
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-blue-500/40 bg-blue-950/30 p-2.5">
                <div className="font-extrabold text-blue-400">🔵 Questão Safira (20%)</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  2x Pontos (+20 / -20 pts) • Concede a Medalha Safira (Bronze)
                </div>
              </div>
              <div className="rounded-xl border border-purple-500/40 bg-purple-950/30 p-2.5">
                <div className="font-extrabold text-purple-400">🟣 Questão Ametista (10%)</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  3x Pontos (+30 / -30 pts) • Concede a Medalha Ametista (Prata)
                </div>
              </div>
              <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-2.5">
                <div className="font-extrabold text-red-400">🔴 Questão Rubi (5%)</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  4x Pontos (+40 / -30 pts) • Concede a Medalha Rubi (Ouro)
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-2.5">
                <div className="font-extrabold text-amber-400">🟡 Questão Âmbar (1%)</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  4x Pontos (+40 pts sem penalidade) • Concede a Medalha Âmbar (Platina)
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-secondary/30 p-4 text-xs space-y-2">
            <h4 className="font-display font-bold text-foreground">Instruções de Missão:</h4>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Cada acerto vale <b>+10 pontos</b>.</li>
              <li>A cada combo de <b>5 acertos consecutivos</b> você soma <b>+10 pontos extras</b>!</li>
              <li>Quanto mais difícil a questão, mais lenta ela cai; quanto mais fácil, mais rápido ela cai.</li>
              <li>Se uma operação colidir com a parte inferior da tela, você perde <b>-5 pontos</b>.</li>
            </ul>
          </div>
        </div>
      </StartScreen>
    );
  }

  const currentTarget = fallingItems.find((it) => it.instanceId === activeTargetId);

  // 2. MAIN ACTIVE PLAYING VIEW (ARCADE COSMOS CONTAINER)
  return (
    <div className="space-y-3">
      {/* Top Bar Navigation */}
      <GameTopBar
        title="Space Quest"
        onExit={onExit}
        rightElement={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleMuted}
              className="p-1.5 rounded-lg border border-sky-400/30 bg-slate-900/60 text-sky-300 hover:text-sky-100 cursor-pointer transition-all"
              title={muted ? "Ativar som" : "Desativar som"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 px-3 py-1 flex items-center gap-2 shadow-xs">
              <Rocket className="h-4 w-4 text-sky-400 animate-pulse" />
              <span className="text-xs font-black text-sky-200">Fase {level}</span>
            </div>
          </div>
        }
      />

      {/* Countdown overlay */}
      {phase === "countdown" && <Countdown onComplete={handleStartPlaying} />}

      {/* Main Cosmos Arcade Container (Solid Deep Space Background with Stars) */}
      <div
        ref={gameAreaRef}
        style={{
          backgroundColor: "#050714",
          minHeight: "640px",
          height: "76vh",
          maxHeight: "800px",
        }}
        className="relative w-full rounded-3xl border-2 border-sky-500/40 shadow-[0_0_40px_rgba(56,189,248,0.25)] flex flex-col justify-between overflow-hidden p-4 select-none text-white font-sans"
      >
        {/* Dynamic Starfield Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {stars.map((st) => (
            <div
              key={st.id}
              className="absolute rounded-full bg-white"
              style={{
                left: `${st.x}%`,
                top: `${st.y}%`,
                width: `${st.size}px`,
                height: `${st.size}px`,
                opacity: st.opacity,
                boxShadow: st.size > 2.2 ? "0 0 8px rgba(56,189,248,0.9)" : "0 0 3px rgba(255,255,255,0.7)",
                animation: `pulse ${2 + (st.id % 3)}s infinite ease-in-out`,
                animationDelay: `${st.blinkDelay}s`,
              }}
            />
          ))}

          {/* Deep Space Cosmic Nebula Glows */}
          <div className="absolute top-1/4 -left-20 w-80 h-80 rounded-full bg-indigo-900/25 blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-20 w-96 h-96 rounded-full bg-purple-900/25 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 rounded-full bg-sky-900/25 blur-3xl pointer-events-none" />
        </div>

        {/* HUD Overlay: Score, Combo, Timer, Stats */}
        <div className="relative z-20 flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-sky-500/30 bg-slate-950/85 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                Pontuação
              </span>
              <span className="font-display text-xl sm:text-2xl font-black text-white">
                {score} pts
              </span>
            </div>

            {combo > 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 animate-bounce">
                <Flame className="h-4 w-4 fill-amber-400" />
                <span className="text-xs font-black">x{combo} Combo</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 hidden sm:inline">Tempo:</span>
              <span
                className={`font-mono text-lg sm:text-xl font-black px-2.5 py-0.5 rounded-lg ${
                  secondsLeft <= 15
                    ? "bg-red-500/20 text-red-300 border border-red-500/50 animate-pulse"
                    : "bg-sky-500/15 text-sky-300 border border-sky-400/40"
                }`}
              >
                {secondsLeft}s
              </span>
            </div>

            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] font-black uppercase text-emerald-400">
                Acertos: {correctCount}
              </span>
              <span className="text-[10px] font-black uppercase text-rose-400">
                Erros: {wrongCount}
              </span>
            </div>
          </div>
        </div>

        {/* Alert Banners (Combos, Aura Medals) */}
        {comboBanner && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-6 py-2 rounded-2xl bg-amber-500 text-neutral-950 font-black text-sm sm:text-base shadow-2xl border border-amber-300 animate-in zoom-in-95 duration-200">
            {comboBanner}
          </div>
        )}
        {specialAuraUnlocked && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 text-white font-black text-xs sm:text-sm shadow-2xl border border-white/50 animate-in slide-in-from-top duration-300 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-300" />
            {specialAuraUnlocked}
          </div>
        )}

        {/* Falling Questions Space Track Area */}
        <div className="relative flex-1 w-full my-2 min-h-[340px]">
          {fallingItems.map((item) => {
            const auraCfg = AURA_CONFIGS[item.data.aura];
            const isTarget = item.instanceId === activeTargetId;

            return (
              <div
                key={item.instanceId}
                onClick={() => setActiveTargetId(item.instanceId)}
                className={`absolute -translate-x-1/2 cursor-pointer transition-all duration-75 select-none ${
                  isTarget ? "scale-105 z-20" : "opacity-90 z-10 hover:opacity-100"
                }`}
                style={{
                  left: `${item.laneXPercent}%`,
                  top: `${item.yPercent}%`,
                }}
              >
                <div
                  className={`relative flex flex-col items-center rounded-2xl border-2 px-4 py-2.5 shadow-2xl ${
                    auraCfg.borderClass
                  } ${
                    isTarget ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-neutral-950" : ""
                  }`}
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.94)",
                  }}
                >
                  {/* Aura & Bonus Badge */}
                  {item.data.aura !== "normal" && (
                    <span className="absolute -top-3.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-950 border border-white/40 text-amber-300 shadow-md">
                      {auraCfg.badgeLabel}
                    </span>
                  )}

                  {/* Operation Prompt text */}
                  <span className="font-mono text-base sm:text-xl font-black text-white tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                    {item.data.prompt}
                  </span>

                  {/* Difficulty indicator & points preview */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-sky-300">
                      +{item.data.pointsOnCorrect} pts
                    </span>
                    {item.data.penaltyOnWrong > 0 && (
                      <span className="text-[10px] font-extrabold text-rose-400">
                        -{item.data.penaltyOnWrong} erro
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Laser Beam Shooting Animation */}
          {laserEffect && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <line
                x1="50%"
                y1="90%"
                x2={`${laserEffect.targetX}%`}
                y2={`${laserEffect.targetY + 4}%`}
                stroke={laserEffect.color}
                strokeWidth="4"
                strokeLinecap="round"
                className="animate-pulse"
                style={{
                  filter: `drop-shadow(0 0 10px ${laserEffect.color})`,
                }}
              />
            </svg>
          )}

          {/* Bottom Defense Floor (Collisions Threshold) */}
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600/30 via-red-500/80 to-red-600/30 border-t border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center">
            <span className="text-[8px] uppercase tracking-widest text-red-300/80 font-black">
              Barreira Estelar (-5 pts em impacto)
            </span>
          </div>
        </div>

        {/* Space Ship Cockpit & Controls */}
        <div className="relative z-20 flex flex-col items-center gap-3 pb-2">
          {/* Active Target Info Panel & Options */}
          {currentTarget ? (
            <div className="w-full flex flex-col items-center animate-in fade-in duration-150">
              <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5 mb-2 bg-slate-950/85 px-4 py-1.5 rounded-full border border-sky-400/40 shadow-md">
                <Target className="h-4 w-4 text-sky-400 animate-spin" />
                <span>Alvo na Mira:</span>
                <b className="text-white font-mono text-sm sm:text-base">{currentTarget.data.prompt}</b>
              </div>

              {/* Action Buttons: V/F or Numeric Options */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 w-full max-w-md px-2">
                {currentTarget.data.options.map((opt, idx) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleAnswer(opt)}
                    className={`flex-1 min-w-[75px] py-3 px-3 rounded-2xl font-mono text-lg sm:text-xl font-black transition-all cursor-pointer shadow-xl active:scale-95 border-2 ${
                      currentTarget.data.kind === "logic"
                        ? opt === "V"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/40 border-emerald-400"
                          : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 border-rose-400"
                        : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-600/40 border-sky-400"
                    }`}
                  >
                    <div>{opt}</div>
                    <span className="block text-[10px] font-sans font-normal opacity-80 mt-0.5">
                      [{currentTarget.data.kind === "logic" ? (opt === "V" ? "V / 1" : "F / 2") : idx + 1}]
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-sky-400/80 italic py-2 bg-slate-950/70 px-4 py-1 rounded-full border border-sky-500/20">
              ⚡ Rastreando operações estelares no radar...
            </div>
          )}

          {/* Futuristic Hovering Space Ship (Bottom Center) */}
          <div className="relative flex flex-col items-center">
            {/* Hovering & Swaying Ship Wrapper with CSS keyframe translation */}
            <div className="relative flex flex-col items-center animate-[sway_3s_ease-in-out_infinite]">
              {/* Twin Plasma Cannons Left & Right */}
              <div className="absolute -top-3 left-2 w-1.5 h-4 bg-sky-400 rounded-t-full shadow-[0_0_8px_#38bdf8]" />
              <div className="absolute -top-3 right-2 w-1.5 h-4 bg-sky-400 rounded-t-full shadow-[0_0_8px_#38bdf8]" />

              {/* Spaceship SVG Geometry */}
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]"
              >
                {/* Ship Body */}
                <path
                  d="M32 4L42 28L46 48L32 54L18 48L22 28L32 4Z"
                  fill="url(#shipGrad)"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                {/* Cockpit Canopy */}
                <path
                  d="M32 14L36 26L32 30L28 26L32 14Z"
                  fill="#38bdf8"
                  opacity="0.9"
                  className="animate-pulse"
                />
                {/* Left Wing */}
                <path
                  d="M18 48L4 52L14 36L22 34L18 48Z"
                  fill="#0369a1"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />
                {/* Right Wing */}
                <path
                  d="M46 48L60 52L50 36L42 34L46 48Z"
                  fill="#0369a1"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />
                {/* Center Core Light */}
                <circle cx="32" cy="42" r="3" fill="#67e8f9" />

                <defs>
                  <linearGradient id="shipGrad" x1="32" y1="4" x2="32" y2="54" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#0f172a" />
                    <stop offset="0.5" stopColor="#1e293b" />
                    <stop offset="1" stopColor="#0284c7" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Thrusters Plasma Plume */}
              <div className="w-4 h-6 -mt-1 bg-gradient-to-b from-sky-400 via-cyan-400 to-transparent rounded-b-full blur-[1px] animate-pulse shadow-[0_4px_14px_#38bdf8]" />
            </div>
          </div>
        </div>
      </div>

      {/* Game Over / Result Panel */}
      {phase === "gameover" && (
        <ResultPanel
          score={Math.max(0, score)}
          correct={correctCount}
          wrong={wrongCount}
          onRestart={() => {
            setScore(0);
            setCombo(0);
            setMaxCombo(0);
            setCorrectCount(0);
            setWrongCount(0);
            setFloorCollisions(0);
            setLevel(1);
            setFallingItems([]);
            setActiveTargetId(null);
            resetClock();
            setPhase("countdown");
          }}
          onExit={onExit}
        />
      )}

      {/* Sway animation styling */}
      <style>{`
        @keyframes sway {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          25% {
            transform: translateY(-5px) translateX(-7px) rotate(-1.5deg);
          }
          75% {
            transform: translateY(-4px) translateX(7px) rotate(1.5deg);
          }
        }
      `}</style>
    </div>
  );
}
