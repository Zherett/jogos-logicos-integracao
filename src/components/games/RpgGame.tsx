import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  X,
  Zap,
  Heart,
  ShieldAlert,
  Sparkles,
  Trophy,
  Flame,
  Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameTopBar } from "./GameTopBar";
import { Countdown } from "./Countdown";
import { ResultPanel } from "./ResultPanel";
import { saveLastMatch, updateBest } from "@/lib/game-storage";
import {
  playCorrect,
  playRpgAttackHit,
  playRpgEnemyDefeated,
  playRpgPlayerHit,
  playTone,
  playWrong,
} from "@/lib/sound";
import {
  applyClashTick,
  evaluateClashAnswer,
  generateClashQuestion,
  getRobotBoss,
  INITIAL_BLUE_SHARE,
  ROBOT_BOSSES,
  SUPER_HIT_DAMAGE,
  type ClashQuestion,
  type RobotBossDef,
  type RobotShapeTheme,
} from "@/lib/rpg-content";
import { MedalIcon } from "./MedalIcon";
import type { MedalDefinition } from "@/lib/medals-catalog";
import { usePlayerAuth } from "@/lib/player-auth";

interface Props {
  onExit: () => void;
  onStatsChange?: () => void;
}

const MAX_PLAYER_LIVES = 3;

export function RpgGame({ onExit, onStatsChange }: Props) {
  const auth = usePlayerAuth();
  const [phase, setPhase] = useState<"countdown" | "playing" | "victory" | "gameover">("countdown");
  const [stage, setStage] = useState(1);
  const [boss, setBoss] = useState<RobotBossDef>(() => getRobotBoss(1, false));
  const [unlockedSpecialMedal, setUnlockedSpecialMedal] = useState<MedalDefinition | null>(null);

  const [enemyHp, setEnemyHp] = useState(boss.maxHp);
  const [playerLives, setPlayerLives] = useState(MAX_PLAYER_LIVES);
  const [blueShare, setBlueShare] = useState(INITIAL_BLUE_SHARE);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  const [question, setQuestion] = useState<ClashQuestion>(() => generateClashQuestion(1));
  const [stunnedUntil, setStunnedUntil] = useState(0);
  const [isStunned, setIsStunned] = useState(false);

  // Visual combat feedback states
  const [enemyHitKind, setEnemyHitKind] = useState<null | "normal" | "super">(null);
  const [enemyDefeatedAnim, setEnemyDefeatedAnim] = useState(false);
  const [enemyEnteringAnim, setEnemyEnteringAnim] = useState(false);
  const [playerHitFlash, setPlayerHitFlash] = useState(false);
  const [clashBanner, setClashBanner] = useState<string | null>(null);

  const recentTextsRef = useRef<string[]>([]);
  const recentAnsRef = useRef<boolean[]>([]);
  const blueShareRef = useRef(INITIAL_BLUE_SHARE);
  const displayedBlueRef = useRef(INITIAL_BLUE_SHARE);
  const stunnedUntilRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const unlockedMedalRef = useRef<MedalDefinition | null>(null);
  const blueBarRef = useRef<HTMLDivElement | null>(null);
  const redBarRef = useRef<HTMLDivElement | null>(null);
  const clashSparkRef = useRef<HTMLDivElement | null>(null);
  const blueGlowRef = useRef<HTMLDivElement | null>(null);
  const redGlowRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef(1);
  const bossRef = useRef<RobotBossDef>(boss);
  const specialSpawnedRef = useRef(false);
  const livesRef = useRef(MAX_PLAYER_LIVES);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  stunnedUntilRef.current = stunnedUntil;
  unlockedMedalRef.current = unlockedSpecialMedal;
  stageRef.current = stage;
  bossRef.current = boss;
  livesRef.current = playerLives;
  scoreRef.current = score;
  correctRef.current = correctCount;
  wrongRef.current = wrongCount;

  /**
   * Atualiza diretamente no DOM a largura das barras, o divisor de faíscas e o brilho
   * em 60 FPS sem transição CSS concorrente; re-renderiza o estado React apenas quando
   * o percentual inteiro exibido muda.
   */
  const applyVisualShare = useCallback((rawBlue: number) => {
    const clampedBlue = Math.max(0, Math.min(100, rawBlue));
    const clampedRed = Math.max(0, 100 - clampedBlue);
    blueShareRef.current = clampedBlue;

    if (blueBarRef.current) {
      blueBarRef.current.style.width = `${clampedBlue}%`;
    }
    if (redBarRef.current) {
      redBarRef.current.style.width = `${clampedRed}%`;
    }
    if (clashSparkRef.current) {
      clashSparkRef.current.style.left = `${Math.max(2, Math.min(98, clampedBlue))}%`;
    }
    if (blueGlowRef.current) {
      blueGlowRef.current.style.width = `${clampedBlue}%`;
    }
    if (redGlowRef.current) {
      redGlowRef.current.style.width = `${clampedRed}%`;
    }

    const rounded = Math.round(clampedBlue);
    if (rounded !== displayedBlueRef.current) {
      displayedBlueRef.current = rounded;
      setBlueShare(rounded);
    }
  }, []);

  const nextQuestion = useCallback((targetStage: number) => {
    const q = generateClashQuestion(
      targetStage,
      recentTextsRef.current,
      recentAnsRef.current,
    );
    recentTextsRef.current = [...recentTextsRef.current.slice(-12), q.text];
    setQuestion(q);
  }, []);

  const finishMatch = useCallback(
    (finalPhase: "victory" | "gameover", finalScore: number, reachedStage: number) => {
      const safeScore = Math.max(0, finalScore);
      updateBest("rpg", safeScore, reachedStage);
      saveLastMatch("rpg", {
        score: safeScore,
        level: reachedStage,
        correct: correctRef.current,
        wrong: wrongRef.current,
        mode: "padrao",
      });
      onStatsChange?.();
      setPhase(finalPhase);
    },
    [onStatsChange],
  );

  const startBattle = () => {
    specialSpawnedRef.current = false;
    const firstBoss = getRobotBoss(1, false);
    setBoss(firstBoss);
    bossRef.current = firstBoss;
    recentTextsRef.current = [];
    recentAnsRef.current = [];
    setStage(1);
    setEnemyHp(firstBoss.maxHp);
    setPlayerLives(MAX_PLAYER_LIVES);
    applyVisualShare(INITIAL_BLUE_SHARE);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setWrongCount(0);
    stunnedUntilRef.current = 0;
    isTransitioningRef.current = false;
    setEnemyDefeatedAnim(false);
    setEnemyEnteringAnim(false);
    setStunnedUntil(0);
    setIsStunned(false);
    setClashBanner(null);
    nextQuestion(1);
    setPhase("playing");
  };

  // Continuous time loop: red side pushes from the middle toward the left
  useEffect(() => {
    if (phase !== "playing") return;

    let lastTime = performance.now();
    let frameId = 0;

    const loop = (now: number) => {
      if (unlockedMedalRef.current || isTransitioningRef.current) {
        lastTime = now;
        frameId = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const currentlyStunned = now < stunnedUntilRef.current;
      setIsStunned((prev) => (prev !== currentlyStunned ? currentlyStunned : prev));

      const currentBoss = bossRef.current;
      const tickRes = applyClashTick(blueShareRef.current, dt, currentBoss);

      if (tickRes.redOvertookAll) {
        // Red bar reached 100% on the left! Player robot suffers an overload shock
        playRpgPlayerHit();
        setPlayerHitFlash(true);
        window.setTimeout(() => setPlayerHitFlash(false), 550);

        const nextLives = livesRef.current - 1;
        setPlayerLives(nextLives);
        setStreak(0);

        if (nextLives <= 0) {
          applyVisualShare(0);
          finishMatch("gameover", scoreRef.current, stageRef.current);
          return;
        }

        setClashBanner("⚠️ SOBRECARGA INIMIGA! Você perdeu 1 escudo!");
        window.setTimeout(() => setClashBanner(null), 1800);
        applyVisualShare(INITIAL_BLUE_SHARE);
      } else {
        applyVisualShare(tickRes.blueShare);
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [phase, finishMatch, applyVisualShare]);

  const handleAnswer = useCallback(
    (chosen: boolean) => {
      if (phase !== "playing" || isTransitioningRef.current) return;
      if (performance.now() < stunnedUntilRef.current) return;

      const currentBoss = bossRef.current;
      const outcome = evaluateClashAnswer({
        question,
        chosenAnswer: chosen,
        currentBlueShare: blueShareRef.current,
        currentEnemyHp: enemyHp,
        boss: currentBoss,
      });

      recentAnsRef.current = [...recentAnsRef.current.slice(-8), question.answer];

      if (!outcome.isCorrect) {
        playRpgPlayerHit();
        setWrongCount((w) => w + 1);
        setStreak(0);
        setScore((s) => Math.max(0, s + outcome.scoreDelta));
        setPlayerHitFlash(true);
        window.setTimeout(() => setPlayerHitFlash(false), 450);

        // Stun for 0.9s to prevent button mashing
        const until = performance.now() + 900;
        stunnedUntilRef.current = until;
        setStunnedUntil(until);
        setIsStunned(true);

        if (outcome.redOvertookAll) {
          const nextLives = playerLives - 1;
          setPlayerLives(nextLives);
          if (nextLives <= 0) {
            applyVisualShare(0);
            finishMatch("gameover", Math.max(0, score + outcome.scoreDelta), stage);
            return;
          }
          setClashBanner("⚠️ ERRO CRÍTICO! O raio inimigo atingiu seu robô (-1 escudo)!");
          window.setTimeout(() => setClashBanner(null), 1800);
          applyVisualShare(INITIAL_BLUE_SHARE);
        } else {
          applyVisualShare(outcome.nextBlueShare);
        }

        nextQuestion(stage);
        return;
      }

      // Correct answer!
      if (outcome.isSuperHit) {
        playRpgAttackHit(true);
        setEnemyHitKind("super");
        setClashBanner(
          `⚡ SUPER RAIO AZUL (100%)! Golpe Triplo causou -${SUPER_HIT_DAMAGE} de vida no inimigo!`,
        );
      } else {
        playRpgAttackHit(false);
        setEnemyHitKind("normal");
        setClashBanner(null);
      }

      window.setTimeout(() => setEnemyHitKind(null), 500);
      if (outcome.isSuperHit) {
        window.setTimeout(() => setClashBanner(null), 2200);
      }

      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setCorrectCount((c) => c + 1);

      const comboBonus = Math.min(15, Math.floor(nextStreak / 3) * 5);
      const nextScore = Math.max(0, score + outcome.scoreDelta + comboBonus);

      if (outcome.enemyDefeated) {
        playRpgEnemyDefeated();
        // Concede medalha platina se derrotou robô especial e dispara celebração visual
        if (currentBoss.isSpecial) {
          const medalId = currentBoss.specialType === "carmesim" ? "m_rpg_carmesim" : "m_rpg_ametista";
          void auth.awardSpecialRobotMedal(medalId).then((res) => {
            if (res.success && res.medal) {
              setUnlockedSpecialMedal(res.medal);
              playTone(523, 0.12, "triangle");
              window.setTimeout(() => playTone(659, 0.12, "triangle"), 120);
              window.setTimeout(() => playTone(784, 0.16, "triangle"), 240);
              window.setTimeout(() => playTone(1046, 0.35, "sine"), 360);
            }
          });
        }

        const stageClearScore = nextScore + currentBoss.rewardPoints;
        setScore(stageClearScore);

        if (stage >= ROBOT_BOSSES.length) {
          // Derrotou todos os 5 robôs da partida!
          setEnemyHp(0);
          applyVisualShare(100);
          finishMatch("victory", stageClearScore, stage);
          return;
        }

        // Congela a barra e exibe transição clara de derrota + entrada do próximo robô
        isTransitioningRef.current = true;
        setEnemyHp(0);
        setEnemyDefeatedAnim(true);
        setClashBanner(`💥 ${currentBoss.name} DERROTADO! (+${currentBoss.rewardPoints} pts)`);

        const nextStage = stage + 1;
        let isSpecial = false;
        if (!specialSpawnedRef.current && Math.random() < 0.10) {
          isSpecial = true;
          specialSpawnedRef.current = true;
        }
        const nextBoss = getRobotBoss(nextStage, isSpecial);

        window.setTimeout(() => {
          setEnemyDefeatedAnim(false);
          setEnemyEnteringAnim(true);
          setBoss(nextBoss);
          bossRef.current = nextBoss;
          setStage(nextStage);
          setEnemyHp(nextBoss.maxHp);
          applyVisualShare(INITIAL_BLUE_SHARE);

          if (isSpecial) {
            setClashBanner(
              nextBoss.specialType === "carmesim"
                ? `🔥 FASE ${nextStage}: Robô Carmesim Lendário! (HP ${nextBoss.maxHp})`
                : `✨ FASE ${nextStage}: Robô Ametista Especial! (HP ${nextBoss.maxHp})`,
            );
          } else {
            setClashBanner(`🤖 FASE ${nextStage}: Novo Inimigo — ${nextBoss.name} (HP ${nextBoss.maxHp})`);
          }

          window.setTimeout(() => {
            setEnemyEnteringAnim(false);
            isTransitioningRef.current = false;
            nextQuestion(nextStage);
            window.setTimeout(() => setClashBanner(null), 2000);
          }, 700);
        }, 700);
        return;
      }

      setScore(nextScore);
      setEnemyHp(outcome.nextEnemyHp);
      applyVisualShare(outcome.nextBlueShare);
      nextQuestion(stage);
    },
    [
      phase,
      stage,
      question,
      enemyHp,
      playerLives,
      score,
      streak,
      finishMatch,
      nextQuestion,
      applyVisualShare,
    ],
  );

  // Keyboard shortcuts: V / ArrowLeft = Verdadeiro, F / ArrowRight = Falso
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "v" || e.key === "ArrowLeft") {
        e.preventDefault();
        handleAnswer(true);
      } else if (k === "f" || e.key === "ArrowRight") {
        e.preventDefault();
        handleAnswer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleAnswer]);

  const displayBlue = Math.max(0, Math.min(100, Math.round(blueShare)));
  const displayRed = Math.max(0, 100 - displayBlue);

  return (
    <div className="space-y-5">
      <GameTopBar title="Batalha de Robôs" onExit={onExit} />

      {/* CONTAGEM REGRESSIVA 3, 2, 1 */}
      {phase === "countdown" && (
        <div className="space-y-4">
          <Countdown onDone={startBattle} />
        </div>
      )}

      {/* ARENA DE BATALHA */}
      {phase === "playing" && (
        <div className="rounded-3xl border bg-card p-4 sm:p-6 shadow-xl space-y-5">
          {/* HUD Superior: Escudos do Jogador, Fase Atual e Vida do Robô Inimigo */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-secondary/40 px-4 py-3">
            {/* Player Shields */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Seus Escudos:
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: MAX_PLAYER_LIVES }).map((_, idx) => (
                  <Heart
                    key={idx}
                    className={`h-5 w-5 transition-all ${
                      idx < playerLives
                        ? "fill-sky-500 text-sky-500 scale-100"
                        : "text-muted-foreground/30 scale-90"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Stage Indicator & Score */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-card px-3.5 py-1 text-xs font-extrabold border shadow-sm">
                Fase {stage}/{ROBOT_BOSSES.length} •{" "}
                <span className="text-destructive">{boss.name}</span>
              </div>
              <div className="rounded-full bg-primary/15 px-3 py-1 text-xs font-extrabold text-primary flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" /> {score} pts
              </div>
              {streak >= 2 && (
                <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-extrabold text-accent">
                  🔥 Sequência {streak}x
                </div>
              )}
            </div>

            {/* Enemy HP Bar */}
            <div className="flex items-center gap-2.5 min-w-[180px]">
              <span className="text-xs font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                Vida Inimiga:
              </span>
              <div className="flex-1 h-4 rounded-full bg-red-950/30 border border-red-500/40 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-600 transition-all duration-300"
                  style={{ width: `${Math.max(0, (enemyHp / boss.maxHp) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs font-extrabold text-red-600 dark:text-red-400">
                {enemyHp}/{boss.maxHp}
              </span>
            </div>
          </div>

          {/* Banner de Evento (Super Raio / Chefe Derrotado / Alerta) */}
          {clashBanner && (
            <div className="animate-pop-in rounded-2xl border border-accent/40 bg-accent/15 px-4 py-2 text-center font-display text-xs sm:text-sm font-extrabold text-foreground">
              {clashBanner}
            </div>
          )}

          {/* QUESTÃO ACIMA DA BARRA DE DISPUTA */}
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-secondary/60 to-card p-5 text-center shadow-md space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {question.categoryLabel} • Questão para Golpear
            </div>
            <p className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {question.text}
            </p>
          </div>

          {/* CENTRO: ROBÔ COLORIDO (ESQUERDA) + BARRA DE PODER COM FAÍSCAS + ROBÔ VERMELHO (DIREITA) */}
          <div className="relative rounded-3xl border-2 bg-slate-950 px-3 py-6 sm:px-6 sm:py-8 text-white shadow-inner overflow-hidden">
            {/* Ambient background glow (atualizado diretamente em 60 FPS sem transition concorrente) */}
            <div
              ref={blueGlowRef}
              className="pointer-events-none absolute inset-y-0 left-0 bg-sky-500/15 blur-2xl"
              style={{ width: `${blueShareRef.current}%` }}
            />
            <div
              ref={redGlowRef}
              className="pointer-events-none absolute inset-y-0 right-0 bg-red-600/20 blur-2xl"
              style={{ width: `${Math.max(0, 100 - blueShareRef.current)}%` }}
            />

            <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-4">
              {/* LADO ESQUERDO: ROBÔ COLORIDO DE FORMAS GEOMÉTRICAS (JOGADOR) */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`transition-transform duration-200 ${
                    playerHitFlash
                      ? "-translate-x-2 scale-95 brightness-150"
                      : enemyHitKind
                        ? "translate-x-1.5 scale-105"
                        : ""
                  }`}
                >
                  <PlayerGeoRobot hit={playerHitFlash} superCharging={displayBlue >= 75} />
                </div>
                <span className="mt-1.5 font-display text-[11px] sm:text-xs font-extrabold text-sky-400">
                  ROBÔ PRISMA
                </span>
                <span className="font-mono text-[10px] font-bold text-sky-300/80">
                  {displayBlue}% AZUL
                </span>
              </div>

              {/* BARRA CENTRAL DE DISPUTA DE PODER COM FAÍSCAS */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider">
                  <span className="text-sky-400 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> Poder Azul ({displayBlue}%)
                  </span>
                  <span className="hidden sm:inline text-amber-300">
                    Encha 100% = Super Golpe (-{SUPER_HIT_DAMAGE} Vida)!
                  </span>
                  <span className="text-red-400 flex items-center gap-1">
                    Poder Vermelho ({displayRed}%) <Flame className="h-3.5 w-3.5" />
                  </span>
                </div>

                {/* A Barra de Energia controlada em 60 FPS via ref direta (sem transition-all concorrente) */}
                <div className="relative h-11 sm:h-13 w-full">
                  <div className="relative h-full w-full rounded-2xl border-2 border-white/20 bg-slate-950 shadow-[0_0_30px_rgba(0,0,0,0.9)] overflow-hidden">
                    {/* Lado Azul (Jogador - Esquerda) */}
                    <div
                      ref={blueBarRef}
                      className="absolute inset-y-0 left-0 rounded-l-xl overflow-hidden will-change-[width]"
                      style={{
                        width: `${blueShareRef.current}%`,
                        boxShadow: "0 0 25px rgba(56,189,248,0.85), inset 0 0 15px rgba(255,255,255,0.4)",
                        background: "linear-gradient(90deg, #1e3a8a, #2563eb, #0284c7, #38bdf8, #67e8f9)",
                        backgroundSize: "200% 100%",
                        animation: "blueEnergyPulse 2.2s ease-in-out infinite alternate",
                      }}
                    />

                    {/* Lado Vermelho (Inimigo - Direita) */}
                    <div
                      ref={redBarRef}
                      className="absolute inset-y-0 right-0 rounded-r-xl overflow-hidden will-change-[width]"
                      style={{
                        width: `${Math.max(0, 100 - blueShareRef.current)}%`,
                        boxShadow: "0 0 25px rgba(239,68,68,0.85), inset 0 0 15px rgba(255,255,255,0.4)",
                        background: "linear-gradient(270deg, #7f1d1d, #b91c1c, #dc2626, #ef4444, #f97316)",
                        backgroundSize: "200% 100%",
                        animation: "redEnergyPulse 2.2s ease-in-out infinite alternate",
                      }}
                    />
                  </div>

                  {/* Faísca / Ponto de Choque Central acompanhando o percentual exato */}
                  <div
                    ref={clashSparkRef}
                    className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 will-change-[left]"
                    style={{ left: `${Math.max(2, Math.min(98, blueShareRef.current))}%` }}
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="h-14 w-3 rounded-full bg-white/95 blur-[1px] shadow-[0_0_18px_#fff,0_0_28px_#facc15]" />
                      <Sparkles className="absolute h-6 w-6 text-yellow-200" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>← Se chegar a 0% você perde 1 escudo</span>
                  <span>100% Azul = Golpe Triplo (-{SUPER_HIT_DAMAGE} HP) →</span>
                </div>
              </div>

              {/* LADO DIREITO: ROBÔ INIMIGO DE FORMAS GEOMÉTRICAS */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`relative transition-all duration-300 ${
                    enemyDefeatedAnim
                      ? "scale-75 rotate-6 opacity-25 grayscale"
                      : enemyEnteringAnim
                        ? "animate-pop-in scale-105"
                        : enemyHitKind === "super"
                          ? "translate-x-3 scale-90 brightness-150"
                          : enemyHitKind === "normal"
                            ? "translate-x-2 scale-95 brightness-125"
                            : ""
                  }`}
                >
                  <EnemyGeoRobot boss={boss} hit={enemyHitKind} />
                  {enemyDefeatedAnim && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="rounded-xl bg-rose-600/95 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-lg">
                        💥 DERROTADO!
                      </span>
                    </div>
                  )}
                  {enemyHitKind && (
                    <span
                      className={`animate-pop-in absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 font-display text-xs font-extrabold shadow-lg ${
                        enemyHitKind === "super"
                          ? "bg-yellow-400 text-slate-950"
                          : "bg-sky-400 text-slate-950"
                      }`}
                    >
                      {enemyHitKind === "super" ? `💥 -${SUPER_HIT_DAMAGE} VIDA!` : "⚡ -1 VIDA!"}
                    </span>
                  )}
                </div>
                <span
                  className={`mt-1.5 font-display text-[11px] sm:text-xs font-extrabold ${
                    boss.isSpecial
                      ? boss.specialType === "carmesim"
                        ? "text-red-400"
                        : "text-purple-300"
                      : "text-slate-300"
                  }`}
                >
                  {boss.name.toUpperCase()}
                </span>
                {boss.isSpecial && (
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black text-slate-950 shadow">
                    ★ {boss.scoreMultiplier}x PONTOS
                  </span>
                )}
                <span className="font-mono text-[10px] font-bold text-red-300/80">
                  {enemyHp} {enemyHp === 1 ? "GOLPE RESTANTE" : "GOLPES RESTANTES"}
                </span>
              </div>
            </div>
          </div>

          {/* ALTERNATIVAS ABAIXO DA BARRA (VERDADEIRO OU FALSO) */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                size="lg"
                disabled={isStunned}
                onClick={() => handleAnswer(true)}
                className="h-16 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-display text-xl sm:text-2xl font-extrabold shadow-lg active:scale-95 transition-all"
              >
                <Check className="mr-2 h-7 w-7 stroke-[3]" />
                VERDADEIRO
              </Button>

              <Button
                type="button"
                size="lg"
                disabled={isStunned}
                onClick={() => handleAnswer(false)}
                className="h-16 sm:h-20 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-display text-xl sm:text-2xl font-extrabold shadow-lg active:scale-95 transition-all"
              >
                <X className="mr-2 h-7 w-7 stroke-[3]" />
                FALSO
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {isStunned ? (
                <span className="font-bold text-destructive">
                  ⚡ Curto-circuito por resposta errada! Aguarde um instante...
                </span>
              ) : (
                <>
                  Atalhos do teclado: <b>V</b> (ou Seta ←) para Verdadeiro • <b>F</b> (ou Seta →)
                  para Falso
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* TELA DE VITÓRIA OU FIM DE JOGO */}
      {(phase === "victory" || phase === "gameover") && (
        <div className="space-y-4">
          <div
            className={`rounded-3xl border p-5 text-center ${
              phase === "victory"
                ? "border-success/40 bg-success/10 text-foreground"
                : "border-destructive/40 bg-destructive/10 text-foreground"
            }`}
          >
            <h3 className="font-display text-xl sm:text-2xl font-extrabold">
              {phase === "victory"
                ? "🎉 Vitória Total! Todos os 5 Robôs Vermelhos Derrotados!"
                : "💥 Sobrecarga! O Raio Vermelho Venceu Desta Vez"}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {phase === "victory"
                ? `Seu Robô Prisma dominou a disputa de poder do início ao fim! (Melhor sequência: ${bestStreak}x)`
                : `Você chegou até a Fase ${stage} (${boss.name}). Tente novamente para derrotar todos os 5 chefes!`}
            </p>
          </div>
          <ResultPanel
            gameId="rpg"
            score={score}
            correct={correctCount}
            wrong={wrongCount}
            level={stage}
            onReplay={() => setPhase("countdown")}
            onMenu={onExit}
          />
        </div>
      )}

      {/* Modal Celebratório de Conquista de Medalha Especial Platina */}
      {unlockedSpecialMedal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl border-2 border-purple-400/80 bg-gradient-to-b from-slate-900 via-purple-950/40 to-slate-950 p-6 sm:p-7 text-center shadow-2xl animate-pop-in">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-purple-400 bg-purple-500/20 text-purple-300 shadow-xl shadow-purple-500/30">
              <MedalIcon
                iconName={unlockedSpecialMedal.iconName}
                rarity={unlockedSpecialMedal.rarity}
                className="h-12 w-12 text-purple-300"
              />
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 border border-purple-500/40 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-purple-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Medalha Platina Conquistada!
            </div>

            <h3 className="mt-2.5 font-display text-2xl font-black text-white">
              {unlockedSpecialMedal.title}
            </h3>
            <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
              {unlockedSpecialMedal.description}
            </p>

            <div className="mt-6">
              <Button
                size="lg"
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 hover:from-purple-600 hover:to-indigo-600 text-white shadow-lg shadow-purple-500/25"
                onClick={() => setUnlockedSpecialMedal(null)}
              >
                Continuar Batalha ⚔️
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * ROBÔ COLORIDO DO JOGADOR (ESQUERDA) — FEITO DE FORMAS GEOMÉTRICAS
 * ========================================================================== */
function PlayerGeoRobot({
  hit,
  superCharging,
}: {
  hit: boolean;
  superCharging: boolean;
}) {
  return (
    <svg
      viewBox="0 0 130 150"
      className="h-24 w-24 sm:h-32 sm:w-32 drop-shadow-[0_0_12px_rgba(56,189,248,0.55)]"
      style={{
        animation: hit ? "none" : "robotIdleFloatBlue 2.6s ease-in-out infinite",
        transformOrigin: "bottom center",
      }}
      aria-label="Robô colorido de formas geométricas do jogador"
    >
      {/* Antena Circular + Triângulo Dourado (brilhando e pulsando luz) */}
      <g style={{ animation: "prismAntennaGlow 2s ease-in-out infinite" }}>
        <circle
          cx="55"
          cy="12"
          r="7"
          fill={superCharging ? "#facc15" : "#38bdf8"}
          stroke="#fff"
          strokeWidth="2"
        />
        <polygon points="55,19 45,32 65,32" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
        {/* Ponto focal de brilho da antena */}
        <circle cx="53" cy="10" r="2.5" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Cabeça Hexagonal / Retangular Colorida */}
      <polygon
        points="32,32 78,32 86,48 78,64 32,64 24,48"
        fill={hit ? "#f43f5e" : "#6366f1"}
        stroke="#e0f2fe"
        strokeWidth="2.5"
      />
      {/* Visor Luminoso Ciano com brilho suave */}
      <rect
        x="38"
        y="41"
        width="38"
        height="12"
        rx="4"
        fill="#22d3ee"
        style={{ filter: "drop-shadow(0 0 4px #38bdf8)" }}
      />
      
      {/* Olhos do Robô Prisma que piscam dinamicamente */}
      <g
        style={{
          animation: "prismEyeBlink 3.2s infinite",
          transformOrigin: "55px 47px",
        }}
      >
        {/* Olho Esquerdo */}
        <circle cx="48" cy="47" r="3.5" fill="#0f172a" />
        <circle cx="47" cy="46" r="1.3" fill="#67e8f9" />
        <circle cx="49" cy="48" r="0.7" fill="#ffffff" />
        {/* Olho Direito */}
        <circle cx="66" cy="47" r="3.5" fill="#0f172a" />
        <circle cx="65" cy="46" r="1.3" fill="#67e8f9" />
        <circle cx="67" cy="48" r="0.7" fill="#ffffff" />
      </g>

      {/* Tronco de Formas Geométricas (Quadrado + Losango Esmeralda + Triângulos) */}
      <rect
        x="26"
        y="68"
        width="58"
        height="48"
        rx="6"
        fill="#0ea5e9"
        stroke="#e0f2fe"
        strokeWidth="2.5"
      />
      {/* Losango Central Verde/Amarelo com pulso contínuo de brilho neon (partes do corpo brilhando) */}
      <g
        style={{
          animation: "prismCoreGlow 1.8s ease-in-out infinite",
          transformOrigin: "55px 92px",
        }}
      >
        <polygon
          points="55,73 73,92 55,111 37,92"
          fill="#10b981"
          stroke="#fef08a"
          strokeWidth="2"
        />
        <circle cx="55" cy="92" r="7" fill="#facc15" />
        <polygon points="55,87 59,92 55,97 51,92" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Ombro Esquerdo (Triângulo Roxo/Rosa com brilho pulsante) */}
      <polygon
        points="10,70 26,68 26,94"
        fill="#ec4899"
        stroke="#fff"
        strokeWidth="1.5"
        style={{ animation: "prismShoulderGlow 2.4s ease-in-out infinite" }}
      />

      {/* Braço Direito Disparador do Raio Azul (Polígonos + Círculo Emissor) */}
      <rect x="84" y="78" width="24" height="14" rx="4" fill="#a855f7" stroke="#fff" strokeWidth="1.5" />
      <polygon
        points="108,74 124,85 108,96"
        fill="#38bdf8"
        stroke="#fff"
        strokeWidth="1.5"
        style={{ filter: "drop-shadow(0 0 5px #38bdf8)" }}
      />
      <circle
        cx="123"
        cy="85"
        r="6"
        fill="#e0f2fe"
        className="animate-ping"
        style={{ animationDuration: "1.4s" }}
      />

      {/* Pernas Geométricas (Trapézio Laranja e Verde) */}
      <polygon points="32,116 50,116 46,144 28,144" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
      <polygon points="60,116 78,116 82,144 64,144" fill="#22c55e" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/* ============================================================================
 * RENDERIZADORES DE FORMAS GEOMÉTRICAS DO ROBÔ INIMIGO (CABEÇA E NÚCLEO PEITORAL)
 * ========================================================================== */
function renderEnemyHead(theme: RobotShapeTheme, fill: string, stroke: string) {
  switch (theme) {
    case "triangle":
      return <polygon points="65,22 102,64 28,64" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "diamond":
      return <polygon points="65,18 100,43 65,66 30,43" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "hexagon":
      return <polygon points="40,22 90,22 104,44 90,66 40,66 26,44" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "octagon":
      return (
        <polygon
          points="42,20 88,20 102,34 102,52 88,66 42,66 28,52 28,34"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
        />
      );
    case "star":
      return (
        <polygon
          points="65,16 75,32 95,34 80,48 85,66 65,56 45,66 50,48 35,34 55,32"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
        />
      );
  }
}

function renderEnemyChestCore(
  theme: RobotShapeTheme,
  outerFill: string,
  outerStroke: string,
  innerFill: string,
  centerFill: string,
) {
  switch (theme) {
    case "triangle":
      return (
        <>
          <polygon points="65,74 86,112 44,112" fill={outerFill} stroke={outerStroke} strokeWidth="2" />
          <polygon points="65,82 78,106 52,106" fill={innerFill} />
          <polygon points="65,88 73,101 57,101" fill={centerFill} />
        </>
      );
    case "diamond":
      return (
        <>
          <polygon points="65,73 85,93 65,113 45,93" fill={outerFill} stroke={outerStroke} strokeWidth="2" />
          <polygon points="65,81 75,93 65,105 55,93" fill={innerFill} />
          <polygon points="65,86 70,93 65,100 60,93" fill={centerFill} />
        </>
      );
    case "hexagon":
      return (
        <>
          <polygon points="53,75 77,75 87,93 77,111 53,111 43,93" fill={outerFill} stroke={outerStroke} strokeWidth="2" />
          <polygon points="57,81 73,81 79,93 73,105 57,105 51,93" fill={innerFill} />
          <polygon points="60,86 70,86 74,93 70,100 60,100 56,93" fill={centerFill} />
        </>
      );
    case "octagon":
      return (
        <>
          <polygon
            points="52,75 78,75 87,84 87,102 78,111 52,111 43,102 43,84"
            fill={outerFill}
            stroke={outerStroke}
            strokeWidth="2"
          />
          <polygon points="56,81 74,81 80,87 80,99 74,105 56,105 50,99 50,87" fill={innerFill} />
          <polygon points="59,86 71,86 75,90 75,96 71,100 59,100 55,96 55,90" fill={centerFill} />
        </>
      );
    case "star":
      return (
        <>
          <polygon
            points="65,72 72,84 86,85 75,96 79,110 65,102 51,110 55,96 44,85 58,84"
            fill={outerFill}
            stroke={outerStroke}
            strokeWidth="2"
          />
          <polygon
            points="65,79 70,87 79,88 72,95 75,104 65,99 55,104 58,95 51,88 60,87"
            fill={innerFill}
          />
          <circle cx="65" cy="93" r="4" fill={centerFill} />
        </>
      );
  }
}

/* ============================================================================
 * ROBÔ INIMIGO (DIREITA) — FORMAS GEOMÉTRICAS DISTINTAS POR FASE
 * ========================================================================== */
function EnemyGeoRobot({
  boss,
  hit,
}: {
  boss: RobotBossDef;
  hit: null | "normal" | "super";
}) {
  const isAmetista = boss.isSpecial && boss.specialType === "ametista";
  const isCarmesim = boss.isSpecial && boss.specialType === "carmesim";

  const dropShadowStyle = isCarmesim
    ? "drop-shadow(0 0 20px rgba(168,85,247,0.95))"
    : isAmetista
      ? "drop-shadow(0 0 20px rgba(250,204,21,0.95))"
      : "drop-shadow(0 0 12px rgba(239,68,68,0.45))";

  const headBodyFill = hit
    ? "#fde047"
    : isCarmesim
      ? "#dc2626"
      : isAmetista
        ? "#9333ea"
        : "#475569";

  const headBodyStroke = isCarmesim
    ? "#fca5a5"
    : isAmetista
      ? "#fef08a"
      : "#94a3b8";

  const hornFill = isCarmesim
    ? "#b91c1c"
    : isAmetista
      ? "#7e22ce"
      : "#334155";

  const hornStroke = isCarmesim
    ? "#c084fc"
    : isAmetista
      ? "#facc15"
      : "#ef4444";

  const eyeColor = isCarmesim
    ? "#e879f9"
    : isAmetista
      ? "#fde047"
      : "#ef4444";

  const pupilColor = isCarmesim
    ? "#581c87"
    : isAmetista
      ? "#713f12"
      : "#7f1d1d";

  const coreOuterFill = isCarmesim
    ? "#7f1d1d"
    : isAmetista
      ? "#581c87"
      : "#1e293b";

  const coreOuterStroke = isCarmesim
    ? "#c084fc"
    : isAmetista
      ? "#facc15"
      : "#ef4444";

  const coreInnerFill = isCarmesim
    ? "#ef4444"
    : isAmetista
      ? "#a855f7"
      : "#dc2626";

  const coreCenterFill = isCarmesim
    ? "#f0abfc"
    : isAmetista
      ? "#fef08a"
      : "#fca5a5";

  const cannonFill = isCarmesim
    ? "#991b1b"
    : isAmetista
      ? "#6b21a8"
      : "#334155";

  const legFill1 = isCarmesim
    ? "#b91c1c"
    : isAmetista
      ? "#7e22ce"
      : "#334155";

  const legFill2 = isCarmesim
    ? "#7f1d1d"
    : isAmetista
      ? "#581c87"
      : "#1e293b";

  return (
    <svg
      viewBox="0 0 130 150"
      className="h-24 w-24 sm:h-32 sm:w-32"
      style={{
        filter: dropShadowStyle,
        animation: hit ? "none" : "robotIdleFloatRed 2.3s ease-in-out infinite",
        transformOrigin: "bottom center",
      }}
      aria-label={`Robô inimigo ${boss.name}`}
    >
      {/* Chifres / Crista Geométrica com tremor agressivo */}
      <g style={{ animation: "angryHornsTremble 2.8s ease-in-out infinite", transformOrigin: "65px 32px" }}>
        <polygon points="48,14 36,32 54,32" fill={hornFill} stroke={hornStroke} strokeWidth="1.5" />
        <polygon points="82,14 76,32 94,32" fill={hornFill} stroke={hornStroke} strokeWidth="1.5" />
      </g>

      {/* Cabeça Geométrica (Formato exclusivo por fase: triângulo, losango, hexágono, octógono ou estrela) */}
      {renderEnemyHead(boss.shapeTheme, headBodyFill, headBodyStroke)}

      {/* Sobrancelhas Angulares de Bravo (fechadas, agressivas) */}
      <polygon points="40,38 64,44 64,41 40,35" fill={headBodyStroke} opacity="0.9" />
      <polygon points="90,38 66,44 66,41 90,35" fill={headBodyStroke} opacity="0.9" />

      {/* Visor / Olhos Agressivos (Vermelhos para robôs comuns, Dourados para Ametista, Magenta para Carmesim) */}
      <g
        style={{
          animation: "redEyeBlinkAngry 2.8s infinite",
          transformOrigin: "65px 49px",
        }}
      >
        {/* Olho Esquerdo Agressivo */}
        <polygon points="43,43 62,49 45,55" fill={eyeColor} stroke={pupilColor} strokeWidth="1" />
        <polygon points="50,47 58,49 52,51" fill={pupilColor} />

        {/* Olho Direito Agressivo */}
        <polygon points="87,43 68,49 85,55" fill={eyeColor} stroke={pupilColor} strokeWidth="1" />
        <polygon points="80,47 72,49 78,51" fill={pupilColor} />
      </g>

      {/* Boca com Expressão de Bravo (boca metálica cerrando dentes pontudos geométricos) */}
      <g style={{ animation: "angryMouthGrimace 2s ease-in-out infinite", transformOrigin: "65px 59px" }}>
        <polygon points="50,58 80,58 76,62 54,62" fill="#0f172a" stroke={headBodyStroke} strokeWidth="1" />
        {/* Dentes metálicos afiados */}
        <polygon points="54,58 57,60 60,58" fill="#f8fafc" />
        <polygon points="61,58 64,60 67,58" fill="#ffffff" />
        <polygon points="68,58 71,60 74,58" fill="#f8fafc" />
        <polygon points="57,62 60,60 63,62" fill="#ffffff" />
        <polygon points="64,62 67,60 70,62" fill="#ffffff" />
      </g>

      {/* Corpo de Formas Geométricas */}
      <polygon
        points="32,68 98,68 106,94 92,118 38,118 24,94"
        fill={hit === "super" ? "#fff" : headBodyFill}
        stroke={headBodyStroke}
        strokeWidth="2.5"
      />

      {/* Núcleo Peitoral Geométrico Interno com mesma forma da cabeça (Triângulo, Losango, Hexágono, Octógono ou Estrela) */}
      <g
        style={{
          animation: "redCorePulseAngry 1.6s ease-in-out infinite",
          transformOrigin: "65px 93px",
        }}
      >
        {renderEnemyChestCore(boss.shapeTheme, coreOuterFill, coreOuterStroke, coreInnerFill, coreCenterFill)}
      </g>

      {/* Canhão Esquerdo Apontado para a Barra Central */}
      <rect x="18" y="78" width="22" height="14" rx="3" fill={cannonFill} stroke={headBodyStroke} strokeWidth="1.5" />
      <polygon points="22,74 4,85 22,96" fill={coreInnerFill} stroke={headBodyStroke} strokeWidth="1.5" />
      <circle
        cx="7"
        cy="85"
        r="6"
        fill={coreCenterFill}
        className="animate-ping"
        style={{ animationDuration: "1.2s" }}
      />

      {/* Braço Direito de Espinhos */}
      <polygon points="98,72 120,82 102,98" fill={cannonFill} stroke={headBodyStroke} strokeWidth="1.5" />

      {/* Pernas Geométricas */}
      <polygon points="42,118 58,118 52,145 34,145" fill={legFill1} stroke={headBodyStroke} strokeWidth="1.5" />
      <polygon points="72,118 88,118 96,145 78,145" fill={legFill2} stroke={headBodyStroke} strokeWidth="1.5" />
    </svg>
  );
}
