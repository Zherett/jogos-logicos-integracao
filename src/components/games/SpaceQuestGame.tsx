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
  RotateCcw,
  Heart,
  Hourglass,
} from "lucide-react";
import { useRoundClock, formatTime } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { ResultPanel } from "./ResultPanel";
import { Countdown } from "./Countdown";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import {
  generateSpaceQuestQuestion,
  generateDoubleWaveQuestions,
  resolveAnswer,
  getStageFallDurationSeconds,
  FLOOR_COLLISION_PENALTY,
  AURA_CONFIGS,
  STARTING_LIVES,
  RECOVER_LIFE_CHANCE,
  DOUBLE_WAVE_CHANCE,
  SLOW_MOTION_DURATION_MS,
  SLOW_MOTION_COOLDOWN_MS,
  SLOW_MOTION_SPEED_MULT,
  AMPULHETA_COMBO_REQ,
  SHIELD_COMBO_REQ,
  SHIELD_COOLDOWN_MS,
  SPECIAL_AURA_COOLDOWN_QUESTIONS,
  type SpaceQuestQuestion,
  type AuraType,
} from "@/lib/space-quest-content";
import { playCorrect, playWrong, playTone, playVictory, useSoundMuted } from "@/lib/sound";
import { usePlayerAuth } from "@/lib/player-auth";
import type { GameComponentProps } from "@/lib/game-registry";

interface ActiveFallingQuestion {
  instanceId: string;
  data: SpaceQuestQuestion;
  laneXPercent: number;
  yPercent: number;
  speedYPerSec: number;
  hasFallen: boolean;
  isDestroying?: boolean;
}

interface ExplosionParticle {
  id: string;
  dx: number;
  dy: number;
  size: number;
  color: string;
}

interface ExplosionEvent {
  id: string;
  xPercent: number;
  yPercent: number;
  particles: ExplosionParticle[];
}

export function SpaceQuestGame({ onExit, onStatsChange, isRanked }: GameComponentProps) {
  const [phase, setPhase] = useState<"countdown" | "playing" | "gameover">("countdown");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [floorCollisions, setFloorCollisions] = useState(0);
  const [level, setLevel] = useState(1);
  const [fallingItems, setFallingItems] = useState<ActiveFallingQuestion[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  // Sistema de Vidas (5 vidas iniciais)
  const [lives, setLives] = useState(STARTING_LIVES);

  // Escudo / Blindagem (10 acertos seguidos, 10s cooldown)
  const [shieldProgress, setShieldProgress] = useState(0);
  const [hasShield, setHasShield] = useState(false);
  const [shieldCooldownEndsAt, setShieldCooldownEndsAt] = useState<number | null>(null);
  const [shieldActivationsCount, setShieldActivationsCount] = useState(0);

  // Ampulheta / Dilatação Temporal (5 acertos seguidos, 10s lentidão, 5s cooldown vermelho)
  const [hourglassProgress, setHourglassProgress] = useState(0);
  const [hourglassActiveEndsAt, setHourglassActiveEndsAt] = useState<number | null>(null);
  const [hourglassCooldownEndsAt, setHourglassCooldownEndsAt] = useState<number | null>(null);
  const [hourglassActivationsCount, setHourglassActivationsCount] = useState(0);

  // Efeitos visuais: Laser animado e Explosões procedurais de partículas
  const [laserEffect, setLaserEffect] = useState<{
    targetX: number;
    targetY: number;
    color: string;
    isCorrect: boolean;
  } | null>(null);
  const [explosions, setExplosions] = useState<ExplosionEvent[]>([]);

  // Banners & Notificações
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);

  const { muted, toggle: toggleMuted } = useSoundMuted();
  const auth = usePlayerAuth();
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const lastSpawnTimeRef = useRef<number>(Date.now());
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  // Rastreamento estrito de auras especiais: cooldown de 5 questões e limite de 1 por tipo na partida
  const questionsSinceSpecialAuraRef = useRef<number>(10);
  const spawnedAurasThisMatchRef = useRef<Set<AuraType>>(new Set());

  // Rastreamento de tempo atual para animação suave dos anéis
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());

  // Load last match stats
  useEffect(() => {
    setLastMatch(loadLastMatch("spacequest"));
  }, []);

  const finishGame = useCallback((reason?: "timeout" | "no_lives") => {
    setPhase("gameover");
    playVictory();

    const finalScore = Math.max(0, score);
    const finalLevel = level;

    // Conquista Platina: "Piloto Purista" (vencer com mais de 1 vida e sem ativar escudo ou ampulheta nenhuma vez)
    if (
      lives > 1 &&
      hourglassActivationsCount === 0 &&
      shieldActivationsCount === 0 &&
      finalScore > 0
    ) {
      if (auth.awardSpaceQuestMedal) {
        void auth.awardSpaceQuestMedal("sq_purist_pilot");
      }
    }

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
  }, [
    score,
    level,
    correctCount,
    wrongCount,
    isRanked,
    onStatsChange,
    lives,
    hourglassActivationsCount,
    shieldActivationsCount,
    auth,
  ]);

  // Clock padronizado: 1 minuto (60s base), +3s por acerto, máx 90s
  const clock = useRoundClock(
    60,
    phase === "playing",
    () => finishGame("timeout"),
    3,
    30,
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

  // Start Playing transition from Countdown: Immediately spawn first question
  const handleStartPlaying = useCallback(() => {
    questionsSinceSpecialAuraRef.current = 10;
    spawnedAurasThisMatchRef.current = new Set();

    const allowSpecial = questionsSinceSpecialAuraRef.current >= SPECIAL_AURA_COOLDOWN_QUESTIONS;
    const qData = generateSpaceQuestQuestion(1, {
      allowSpecial,
      excludedAuras: spawnedAurasThisMatchRef.current,
    });
    if (qData.aura !== "normal") {
      questionsSinceSpecialAuraRef.current = 0;
      spawnedAurasThisMatchRef.current.add(qData.aura);
    } else {
      questionsSinceSpecialAuraRef.current += 1;
    }

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
      const now = Date.now();
      setNowTimestamp(now);

      // Efeito da ampulheta: se ativa, velocidade cai 50%
      const isSlowMotion = hourglassActiveEndsAt !== null && now < hourglassActiveEndsAt;
      const speedFactor = isSlowMotion ? SLOW_MOTION_SPEED_MULT : 1.0;

      const dt = Math.min(0.08, (time - lastFrameTimeRef.current) / 1000) * speedFactor;
      lastFrameTimeRef.current = time;

      // Limite estrito de no máximo 2 questões ao mesmo tempo
      const maxConcurrent = 2;
      const spawnInterval = Math.max(2200, 4200 - level * 400);

      setFallingItems((prev) => {
        let updated = [...prev];

        // 1. Spawning com chance de 5% de onda dupla quando houver espaço
        if (
          updated.length < maxConcurrent &&
          (updated.length === 0 || now - lastSpawnTimeRef.current > spawnInterval)
        ) {
          lastSpawnTimeRef.current = now;

          const allowSpecial =
            questionsSinceSpecialAuraRef.current >= SPECIAL_AURA_COOLDOWN_QUESTIONS;

          if (updated.length === 0 && Math.random() < DOUBLE_WAVE_CHANCE) {
            // Onda Dupla: 2 questões de dificuldades distintas em pistas opostas (24% e 76%)
            const [q1, q2] = generateDoubleWaveQuestions(level, {
              allowSpecial,
              excludedAuras: spawnedAurasThisMatchRef.current,
            });
            const specialInWave =
              q1.aura !== "normal" ? q1.aura : q2.aura !== "normal" ? q2.aura : null;
            if (specialInWave) {
              questionsSinceSpecialAuraRef.current = 0;
              spawnedAurasThisMatchRef.current.add(specialInWave);
            } else {
              questionsSinceSpecialAuraRef.current += 2;
            }

            const dur1 = getStageFallDurationSeconds(level, q1.difficulty);
            const dur2 = getStageFallDurationSeconds(level, q2.difficulty);

            updated.push(
              {
                instanceId: `item_${now}_w1`,
                data: q1,
                laneXPercent: 24,
                yPercent: 0,
                speedYPerSec: 100 / dur1,
                hasFallen: false,
              },
              {
                instanceId: `item_${now}_w2`,
                data: q2,
                laneXPercent: 76,
                yPercent: 0,
                speedYPerSec: 100 / dur2,
                hasFallen: false,
              },
            );
          } else if (updated.length < maxConcurrent) {
            // Questão Única: posiciona na pista oposta à questão existente para não sobrepor
            const qData = generateSpaceQuestQuestion(level, {
              allowSpecial,
              excludedAuras: spawnedAurasThisMatchRef.current,
            });
            if (qData.aura !== "normal") {
              questionsSinceSpecialAuraRef.current = 0;
              spawnedAurasThisMatchRef.current.add(qData.aura);
            } else {
              questionsSinceSpecialAuraRef.current += 1;
            }

            const duration = getStageFallDurationSeconds(level, qData.difficulty);
            const speedY = 100 / duration;

            let chosenLane = 50;
            if (updated.length === 1) {
              const existingLane = updated[0].laneXPercent;
              chosenLane = existingLane < 50 ? 76 : 24;
            } else {
              const possibleLanes = [24, 50, 76];
              chosenLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
            }

            updated.push({
              instanceId: `item_${now}_${Math.random().toString(36).slice(2, 6)}`,
              data: qData,
              laneXPercent: chosenLane,
              yPercent: 0,
              speedYPerSec: speedY,
              hasFallen: false,
            });
          }
        }

        // 2. Mover questões para baixo & Detecção da Linha Vermelha (yPercent >= 88)
        let floorHits = 0;
        const nextList: ActiveFallingQuestion[] = [];

        for (const item of updated) {
          if (item.isDestroying) {
            nextList.push(item);
            continue;
          }

          const nextY = item.yPercent + item.speedYPerSec * dt;

          if (nextY >= 88) {
            // Encostou na barreira vermelha! Invalidada imediatamente
            floorHits++;
            playTone(180, 0.18, "sawtooth", 0.05);
          } else {
            nextList.push({ ...item, yPercent: nextY });
          }
        }

        // 3. Processamento de impacto com a Barreira Estelar
        if (floorHits > 0) {
          // Erro/impacto na barreira reseta o progresso da ampulheta e do escudo
          setHourglassProgress(0);
          setShieldProgress(0);

          setHasShield((prevShield) => {
            if (prevShield) {
              // Escudo tanka o impacto! Nenhuma vida perdida
              playTone(440, 0.25, "square", 0.08);
              setNotificationBanner("🛡️ Escudo de Blindagem absorveu o impacto!");
              setTimeout(() => setNotificationBanner(null), 2500);
              return false; // Escudo quebra
            } else {
              // Sem escudo: perde vida e perde -5 pontos
              setLives((prevLives) => {
                const nextLives = Math.max(0, prevLives - floorHits);
                if (nextLives <= 0) {
                  setTimeout(() => finishGame("no_lives"), 50);
                }
                return nextLives;
              });
              setScore((s) => Math.max(0, s - FLOOR_COLLISION_PENALTY * floorHits));
              setFloorCollisions((f) => f + floorHits);
              return false;
            }
          });
        }

        return nextList;
      });

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [phase, level, hourglassActiveEndsAt, finishGame]);

  // Sincronização do alvo ativo: mira sempre na questão válida mais próxima da base
  useEffect(() => {
    const validItems = fallingItems.filter((it) => !it.isDestroying && it.yPercent < 88);
    if (validItems.length === 0) {
      setActiveTargetId(null);
      return;
    }
    const exists = validItems.some((it) => it.instanceId === activeTargetId);
    if (!exists) {
      const lowest = [...validItems].sort((a, b) => b.yPercent - a.yPercent)[0];
      setActiveTargetId(lowest ? lowest.instanceId : null);
    }
  }, [fallingItems, activeTargetId]);

  // Submit answer handler
  const handleAnswer = useCallback(
    (selectedOption: string) => {
      if (phase !== "playing" || !activeTargetId) return;

      const targetItem = fallingItems.find((it) => it.instanceId === activeTargetId);
      // Blindagem atômica: se encostou na barreira ou está explodindo, não responde
      if (!targetItem || targetItem.yPercent >= 88 || targetItem.hasFallen || targetItem.isDestroying) {
        return;
      }

      const res = resolveAnswer(targetItem.data, selectedOption, combo);
      const now = Date.now();

      if (res.isCorrect) {
        // Disparo do feixe laser animado até o alvo
        const auraCfg = AURA_CONFIGS[targetItem.data.aura];
        setLaserEffect({
          targetX: targetItem.laneXPercent,
          targetY: targetItem.yPercent,
          color: auraCfg.glowColor,
          isCorrect: true,
        });

        // Marca a questão como em processo de destruição para não aceitar outros cliques
        setFallingItems((prev) =>
          prev.map((it) => (it.instanceId === activeTargetId ? { ...it, isDestroying: true } : it)),
        );

        // Pontuação e tempo bônus (+3s no relógio padrão)
        playCorrect();
        setScore((s) => s + res.scoreDelta);
        setCorrectCount((c) => c + 1);
        setCombo(res.newCombo);
        setMaxCombo((m) => Math.max(m, res.newCombo));
        clock.addBonus(3);

        // 1. Mecânica de "Sorte Divina": 10% de chance de restaurar vida com 1 coração
        if (lives === 1 && Math.random() < RECOVER_LIFE_CHANCE) {
          setLives(2);
          playTone(660, 0.3, "sine", 0.15);
          setNotificationBanner("❤️ Sorte Divina! Vida Recuperada (+1 Coração)!");
          setTimeout(() => setNotificationBanner(null), 3000);
          if (auth.awardSpaceQuestMedal) {
            void auth.awardSpaceQuestMedal("sq_divine_luck");
          }
        }

        // 2. Mecânica da Ampulheta: 5 acertos seguidos
        const isHourglassActive = hourglassActiveEndsAt !== null && now < hourglassActiveEndsAt;
        const isHourglassCooldown = hourglassCooldownEndsAt !== null && now < hourglassCooldownEndsAt;

        if (!isHourglassActive && !isHourglassCooldown) {
          const nextHProg = hourglassProgress + 1;
          if (nextHProg >= AMPULHETA_COMBO_REQ) {
            const endsAt = now + SLOW_MOTION_DURATION_MS;
            setHourglassActiveEndsAt(endsAt);
            setHourglassCooldownEndsAt(endsAt + SLOW_MOTION_COOLDOWN_MS);
            setHourglassProgress(0);
            setHourglassActivationsCount((cnt) => {
              const nextCnt = cnt + 1;
              if (nextCnt >= 3 && auth.awardSpaceQuestMedal) {
                void auth.awardSpaceQuestMedal("sq_hourglass_3x");
              }
              return nextCnt;
            });
            playTone(520, 0.35, "sine", 0.1);
            setNotificationBanner("⏳ Dilatação Temporal Ativada: Questões 50% Mais Lentas!");
            setTimeout(() => setNotificationBanner(null), 2500);
          } else {
            setHourglassProgress(nextHProg);
          }
        }

        // 3. Mecânica do Escudo: 10 acertos seguidos
        const isShieldCooldown = shieldCooldownEndsAt !== null && now < shieldCooldownEndsAt;

        if (!hasShield && !isShieldCooldown) {
          const nextSProg = shieldProgress + 1;
          if (nextSProg >= SHIELD_COMBO_REQ) {
            setHasShield(true);
            setShieldCooldownEndsAt(now + SHIELD_COOLDOWN_MS);
            setShieldProgress(0);
            setShieldActivationsCount((cnt) => {
              const nextCnt = cnt + 1;
              if (nextCnt >= 2 && auth.awardSpaceQuestMedal) {
                void auth.awardSpaceQuestMedal("sq_shield_2x");
              }
              return nextCnt;
            });
            playTone(780, 0.3, "triangle", 0.12);
            setNotificationBanner("🛡️ Blindagem de Vida Ativada! Próximo impacto neutralizado!");
            setTimeout(() => setNotificationBanner(null), 2500);
          } else {
            setShieldProgress(nextSProg);
          }
        }

        // Concessão de medalhas de aura especiais
        if (res.unlockedMedalId && auth.awardSpaceQuestMedal) {
          void auth.awardSpaceQuestMedal(res.unlockedMedalId as any);
          setNotificationBanner(`Medalha Desbloqueada: ${AURA_CONFIGS[targetItem.data.aura].medalTitle}! 🎖️`);
          setTimeout(() => setNotificationBanner(null), 3000);
        }

        // Impacto do laser e explosão procedural de partículas
        setTimeout(() => {
          // Desativa o feixe laser
          setLaserEffect(null);

          // Gera 14 partículas vetoriais procedurais que expandem 360°
          const particleCount = 14;
          const particles: ExplosionParticle[] = Array.from({ length: particleCount }).map((_, i) => {
            const angle = (i / particleCount) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
            const dist = 26 + Math.random() * 32;
            return {
              id: `part_${i}`,
              dx: Math.cos(angle) * dist,
              dy: Math.sin(angle) * dist,
              size: 2.5 + Math.random() * 4,
              color: auraCfg.glowColor,
            };
          });

          const expEvent: ExplosionEvent = {
            id: `exp_${Date.now()}`,
            xPercent: targetItem.laneXPercent,
            yPercent: targetItem.yPercent,
            particles,
          };

          setExplosions((prev) => [...prev, expEvent]);

          // Remove a questão do jogo exatamente no impacto
          setFallingItems((prev) => prev.filter((it) => it.instanceId !== targetItem.instanceId));

          // Limpa a explosão após a animação de dispersão de 350ms
          setTimeout(() => {
            setExplosions((prev) => prev.filter((e) => e.id !== expEvent.id));
          }, 360);
        }, 120);
      } else {
        // Resposta Incorreta: Reseta progresso de escudo e ampulheta
        playWrong();
        setLaserEffect({
          targetX: targetItem.laneXPercent,
          targetY: targetItem.yPercent,
          color: "#ef4444",
          isCorrect: false,
        });
        setTimeout(() => setLaserEffect(null), 200);

        setScore((s) => Math.max(0, s + res.scoreDelta));
        setWrongCount((w) => w + 1);
        setCombo(0);
        setHourglassProgress(0);
        setShieldProgress(0);
      }
    },
    [
      phase,
      activeTargetId,
      fallingItems,
      combo,
      clock,
      lives,
      hourglassProgress,
      hourglassActiveEndsAt,
      hourglassCooldownEndsAt,
      shieldProgress,
      hasShield,
      shieldCooldownEndsAt,
      auth,
    ],
  );

  // Keyboard controls: 1, 2, 3, 4 for math / V, F for logic
  useEffect(() => {
    if (phase !== "playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const currentTarget = fallingItems.find((it) => it.instanceId === activeTargetId);
      if (!currentTarget || currentTarget.isDestroying) return;

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

  const currentTarget = fallingItems.find((it) => it.instanceId === activeTargetId && !it.isDestroying);

  // Cálculo dos tempos da ampulheta
  const isHourglassActive = hourglassActiveEndsAt !== null && nowTimestamp < hourglassActiveEndsAt;
  const isHourglassCooldown =
    !isHourglassActive &&
    hourglassCooldownEndsAt !== null &&
    nowTimestamp < hourglassCooldownEndsAt;

  const hourglassRemainingSec = isHourglassActive
    ? Math.max(0, Math.ceil((hourglassActiveEndsAt! - nowTimestamp) / 1000))
    : isHourglassCooldown
      ? Math.max(0, Math.ceil((hourglassCooldownEndsAt! - nowTimestamp) / 1000))
      : 0;

  const hourglassProgressPercent = isHourglassActive
    ? ((hourglassActiveEndsAt! - nowTimestamp) / SLOW_MOTION_DURATION_MS) * 100
    : isHourglassCooldown
      ? ((hourglassCooldownEndsAt! - nowTimestamp) / SLOW_MOTION_COOLDOWN_MS) * 100
      : 0;

  // Cálculo dos tempos do escudo
  const isShieldCooldown = shieldCooldownEndsAt !== null && nowTimestamp < shieldCooldownEndsAt;
  const shieldCooldownSec = isShieldCooldown
    ? Math.max(0, Math.ceil((shieldCooldownEndsAt! - nowTimestamp) / 1000))
    : 0;

  return (
    <div className="space-y-3">
      {/* Top Bar Navigation */}
      <GameTopBar
        title="Space Quest"
        onExit={onExit}
        rightElement={
          <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 px-3 py-1 flex items-center gap-2 shadow-xs">
            <Rocket className="h-4 w-4 text-sky-400 animate-pulse" />
            <span className="text-xs font-black text-sky-200">Fase {level}</span>
          </div>
        }
      />

      {/* Countdown overlay: 3, 2, 1, VAI! - clica para iniciar imediatamente ou aguarda término */}
      {phase === "countdown" && (
        <div onClick={handleStartPlaying} className="cursor-pointer" title="Clique para iniciar imediatamente">
          <Countdown onDone={handleStartPlaying} />
        </div>
      )}

      {/* Main Cosmos Arcade Container */}
      <div
        ref={gameAreaRef}
        style={{
          backgroundColor: "#050714",
          minHeight: "640px",
          height: "76vh",
          maxHeight: "820px",
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

        {/* HUD Superior: Vidas, Pontuação, Ampulheta, Escudo, Tempo */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl border border-sky-500/30 bg-slate-950/85 backdrop-blur-md shadow-xl">
          {/* Lado Esquerdo: Pontuação e Combo */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                Pontos
              </span>
              <span className="font-display text-xl sm:text-2xl font-black text-white">
                {score}
              </span>
            </div>

            {combo > 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-300 animate-bounce">
                <Flame className="h-4 w-4 fill-amber-400" />
                <span className="text-xs font-black">x{combo}</span>
              </div>
            )}
          </div>

          {/* Centro: Indicadores da Ampulheta e do Escudo */}
          <div className="flex items-center gap-3">
            {/* Widget da Ampulheta com Anel Reverso de Carregamento */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                isHourglassActive
                  ? "border-cyan-400 bg-cyan-950/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                  : isHourglassCooldown
                    ? "border-rose-500 bg-rose-950/40"
                    : "border-sky-500/20 bg-slate-900/50"
              }`}
            >
              {/* Anel Circular SVG */}
              <div className="relative flex items-center justify-center w-7 h-7">
                <svg className="w-7 h-7 -rotate-90">
                  <circle
                    cx="14"
                    cy="14"
                    r="11"
                    className="stroke-slate-800"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  {(isHourglassActive || isHourglassCooldown) && (
                    <circle
                      cx="14"
                      cy="14"
                      r="11"
                      className={isHourglassActive ? "stroke-cyan-400" : "stroke-rose-500"}
                      strokeWidth="2.5"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 11}
                      strokeDashoffset={2 * Math.PI * 11 * (1 - hourglassProgressPercent / 100)}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <Hourglass
                  className={`absolute h-3.5 w-3.5 ${
                    isHourglassActive
                      ? "text-cyan-400 animate-spin"
                      : isHourglassCooldown
                        ? "text-rose-400"
                        : "text-slate-400"
                  }`}
                />
              </div>

              <div className="flex flex-col text-[11px] leading-tight">
                {isHourglassActive ? (
                  <>
                    <span className="font-black text-cyan-300">LENTO (-50%)</span>
                    <span className="font-mono text-[10px] text-cyan-200">{hourglassRemainingSec}s restantes</span>
                  </>
                ) : isHourglassCooldown ? (
                  <>
                    <span className="font-bold text-rose-400">COOLDOWN</span>
                    <span className="font-mono text-[10px] text-rose-300">{hourglassRemainingSec}s</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-400">Ampulheta</span>
                    <span className="font-mono text-[10px] text-sky-400">{hourglassProgress}/5</span>
                  </>
                )}
              </div>
            </div>

            {/* Widget do Escudo de Blindagem */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all ${
                hasShield
                  ? "border-sky-400 bg-sky-950/60 shadow-[0_0_15px_rgba(56,189,248,0.5)] animate-pulse"
                  : isShieldCooldown
                    ? "border-amber-500/40 bg-amber-950/30"
                    : "border-sky-500/20 bg-slate-900/50"
              }`}
            >
              <Shield
                className={`h-4 w-4 ${
                  hasShield ? "text-sky-300 fill-sky-400/40" : isShieldCooldown ? "text-amber-400" : "text-slate-400"
                }`}
              />
              <div className="flex flex-col text-[11px] leading-tight">
                {hasShield ? (
                  <>
                    <span className="font-black text-sky-300">BLINDADO</span>
                    <span className="text-[10px] text-sky-200">Tank 1 impacto</span>
                  </>
                ) : isShieldCooldown ? (
                  <>
                    <span className="font-bold text-amber-400">RECARGA</span>
                    <span className="font-mono text-[10px] text-amber-300">{shieldCooldownSec}s</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-400">Escudo</span>
                    <span className="font-mono text-[10px] text-sky-400">{shieldProgress}/10</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Lado Direito: Vidas (5 Corações) e Tempo Padronizado */}
          <div className="flex items-center gap-4">
            {/* 5 Vidas (Corações) */}
            <div className="flex items-center gap-1 bg-slate-900/60 px-2.5 py-1 rounded-xl border border-rose-500/30">
              {Array.from({ length: STARTING_LIVES }).map((_, i) => (
                <Heart
                  key={i}
                  className={`h-4 w-4 transition-all duration-300 ${
                    i < lives
                      ? "fill-rose-500 text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.7)]"
                      : "text-slate-700"
                  } ${lives === 1 && i === 0 ? "animate-ping" : ""}`}
                />
              ))}
            </div>

            {/* Tempo Padronizado (ex: 1:00) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 hidden sm:inline">Tempo:</span>
              <span
                className={`font-mono text-lg sm:text-xl font-black px-2.5 py-0.5 rounded-lg ${
                  clock.time <= 15
                    ? "bg-red-500/20 text-red-300 border border-red-500/50 animate-pulse"
                    : "bg-sky-500/15 text-sky-300 border border-sky-400/40"
                }`}
              >
                {formatTime(clock.time)}
              </span>
            </div>
          </div>
        </div>

        {/* Notificações de Alerta */}
        {notificationBanner && (
          <div className="absolute top-18 left-1/2 -translate-x-1/2 z-30 px-6 py-2 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-black text-xs sm:text-sm shadow-2xl border border-sky-300 animate-in zoom-in-95 duration-150">
            {notificationBanner}
          </div>
        )}

        {/* Área de Trilha Espacial com Questões em Queda */}
        <div className="relative flex-1 w-full my-2 min-h-[340px]">
          {fallingItems.map((item) => {
            const auraCfg = AURA_CONFIGS[item.data.aura];
            const isTarget = item.instanceId === activeTargetId && !item.isDestroying;

            return (
              <div
                key={item.instanceId}
                onClick={() => {
                  if (!item.isDestroying) setActiveTargetId(item.instanceId);
                }}
                className={`absolute -translate-x-1/2 cursor-pointer transition-all duration-75 select-none ${
                  item.isDestroying ? "scale-90 opacity-20 pointer-events-none" : isTarget ? "scale-105 z-20" : "opacity-90 z-10 hover:opacity-100"
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

          {/* Animação do Feixe Laser com Gradiente de Opacidade Realista */}
          {laserEffect && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
              <defs>
                <linearGradient
                  id="plasmaLaserGrad"
                  gradientUnits="userSpaceOnUse"
                  x1="50%"
                  y1="82%"
                  x2={`${laserEffect.targetX}%`}
                  y2={`${laserEffect.targetY + 4}%`}
                >
                  <stop offset="0%" stopColor={laserEffect.color} stopOpacity="0.25" />
                  <stop offset="65%" stopColor={laserEffect.color} stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
                </linearGradient>
              </defs>
              <line
                x1="50%"
                y1="82%"
                x2={`${laserEffect.targetX}%`}
                y2={`${laserEffect.targetY + 4}%`}
                stroke="url(#plasmaLaserGrad)"
                strokeWidth="5"
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 12px ${laserEffect.color})`,
                }}
              />
            </svg>
          )}

          {/* Explosões Procedurais de Partículas Vetoriais */}
          {explosions.map((exp) => (
            <div
              key={exp.id}
              className="absolute pointer-events-none z-40"
              style={{
                left: `${exp.xPercent}%`,
                top: `${exp.yPercent}%`,
              }}
            >
              {exp.particles.map((p) => (
                <div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: p.color,
                    boxShadow: `0 0 8px ${p.color}`,
                    transform: `translate(${p.dx}px, ${p.dy}px)`,
                    opacity: 0,
                    transition: "all 350ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              ))}
            </div>
          ))}

          {/* Nave Estelar Pairando com Escudo Visual (Acima da Barreira Estelar) */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
            {/* Cúpula de Plasma Protetora do Escudo */}
            {hasShield && (
              <div className="absolute -inset-4 rounded-full border-2 border-sky-300 bg-sky-500/15 shadow-[0_0_25px_rgba(56,189,248,0.85)] animate-pulse" />
            )}

            <div className="relative flex flex-col items-center animate-[sway_3s_ease-in-out_infinite]">
              {/* Canhões de Plasma */}
              <div className="absolute -top-3 left-2 w-1.5 h-4 bg-sky-400 rounded-t-full shadow-[0_0_8px_#38bdf8]" />
              <div className="absolute -top-3 right-2 w-1.5 h-4 bg-sky-400 rounded-t-full shadow-[0_0_8px_#38bdf8]" />

              {/* Geometria Vetorial SVG da Nave */}
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-[0_0_14px_rgba(56,189,248,0.6)]"
              >
                <path
                  d="M32 4L42 28L46 48L32 54L18 48L22 28L32 4Z"
                  fill="url(#shipGrad)"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <path
                  d="M32 14L36 26L32 30L28 26L32 14Z"
                  fill="#38bdf8"
                  opacity="0.9"
                  className="animate-pulse"
                />
                <path
                  d="M18 48L4 52L14 36L22 34L18 48Z"
                  fill="#0369a1"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />
                <path
                  d="M46 48L60 52L50 36L42 34L46 48Z"
                  fill="#0369a1"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />
                <circle cx="32" cy="42" r="3" fill="#67e8f9" />

                <defs>
                  <linearGradient id="shipGrad" x1="32" y1="4" x2="32" y2="54" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#0f172a" />
                    <stop offset="0.5" stopColor="#1e293b" />
                    <stop offset="1" stopColor="#0284c7" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Propulsor de Plasma */}
              <div className="w-4 h-6 -mt-1 bg-gradient-to-b from-sky-400 via-cyan-400 to-transparent rounded-b-full blur-[1px] animate-pulse shadow-[0_4px_14px_#38bdf8]" />
            </div>
          </div>

          {/* Barreira Estelar Inferior (Linha Vermelha de Impacto na Base da Arena) */}
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600/30 via-red-500/80 to-red-600/30 border-t border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center z-10">
            <span className="text-[8px] uppercase tracking-widest text-red-300/80 font-black">
              Barreira Estelar (-1 Vida • -5 pts em colisão)
            </span>
          </div>
        </div>

        {/* Cockpit / Dock de Controle com Altura Estritamente Fixa (Elimina Recuo Visual) */}
        <div className="relative z-20 w-full h-[105px] min-h-[105px] max-h-[105px] flex flex-col justify-center items-center rounded-2xl bg-slate-950/90 border border-sky-500/20 px-3 py-1 shadow-2xl">
          {currentTarget ? (
            <div className="w-full flex flex-col items-center justify-center h-full animate-in fade-in duration-100">
              <div className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5 mb-1.5 bg-slate-900/80 px-3 py-0.5 rounded-full border border-sky-400/30 shadow-xs">
                <Target className="h-3.5 w-3.5 text-sky-400 animate-spin" />
                <span>Alvo na Mira:</span>
                <b className="text-white font-mono text-sm">{currentTarget.data.prompt}</b>
              </div>

              {/* Botões de Ação: V/F ou Alternativas Numéricas */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 w-full max-w-md">
                {currentTarget.data.options.map((opt, idx) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleAnswer(opt)}
                    className={`flex-1 min-w-[70px] h-12 rounded-xl font-mono text-lg sm:text-xl font-black transition-all cursor-pointer shadow-lg active:scale-95 border-2 flex flex-col items-center justify-center leading-none ${
                      currentTarget.data.kind === "logic"
                        ? opt === "V"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border-emerald-400"
                          : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 border-rose-400"
                        : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-600/30 border-sky-400"
                    }`}
                  >
                    <span>{opt}</span>
                    <span className="text-[9px] font-sans font-normal opacity-80 mt-0.5">
                      [{currentTarget.data.kind === "logic" ? (opt === "V" ? "V/1" : "F/2") : idx + 1}]
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-1.5 text-sky-400/80 animate-in fade-in duration-100">
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/70 border border-sky-500/30">
                <Target className="h-3.5 w-3.5 animate-spin text-sky-400" />
                <span className="text-xs font-semibold">Rastreando operações estelares no radar...</span>
              </div>
              <span className="text-[10px] text-slate-500">Mire e dispare no teclado (1-4 ou V/F)</span>
            </div>
          )}
        </div>
      </div>

      {/* Game Over / Painel de Resultados */}
      {phase === "gameover" && (
        <ResultPanel
          score={Math.max(0, score)}
          correct={correctCount}
          wrong={wrongCount}
          level={level}
          gameId="spacequest"
          onReplay={() => {
            questionsSinceSpecialAuraRef.current = 10;
            spawnedAurasThisMatchRef.current = new Set();
            setScore(0);
            setCombo(0);
            setMaxCombo(0);
            setCorrectCount(0);
            setWrongCount(0);
            setFloorCollisions(0);
            setLevel(1);
            setLives(STARTING_LIVES);
            setShieldProgress(0);
            setHasShield(false);
            setShieldCooldownEndsAt(null);
            setShieldActivationsCount(0);
            setHourglassProgress(0);
            setHourglassActiveEndsAt(null);
            setHourglassCooldownEndsAt(null);
            setHourglassActivationsCount(0);
            setFallingItems([]);
            setActiveTargetId(null);
            setPhase("countdown");
          }}
          onMenu={onExit}
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