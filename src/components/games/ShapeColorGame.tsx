import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowLeft, Clock, Trophy, Star, ListChecks, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartScreen, OptionChip } from "./StartScreen";
import { Countdown } from "./Countdown";
import { ResultPanel } from "./ResultPanel";
import { useRoundClock, formatTime } from "@/lib/use-countdown";
import { GameTopBar } from "./GameTopBar";
import { BonusTimeToggle } from "./BonusTimeToggle";
import { useTeamSession } from "@/lib/use-team-session";
import { updateBest, saveLastMatch, loadLastMatch, type LastMatch } from "@/lib/game-storage";
import { TeamSetup } from "./TeamSetup";
import { TeamScoreBar, TeamResults } from "./TeamScoreBar";
import { SessionSummary } from "./SessionSummary";
import { useSessionEnd } from "@/lib/use-session-end";
import { NORMAL_CONFIG, type TeamConfig } from "@/lib/teams";
import { ShapeSvg } from "./ShapeSvg";
import {
  generateQuestion,
  SIZE_LABEL,
  type Piece,
  type Question,
  type SizeIdx,
} from "@/lib/shapes-content";
import { playCorrect, playWrong } from "@/lib/sound";

const DURATION = 120;
const POINTS_CORRECT = 10;
const POINTS_CORRECT_L4 = 15;
const POINTS_WRONG = 5;
const QUESTIONS_PER_LEVEL = 5;

interface Props {
  onExit: () => void;
  onStatsChange: () => void;
  isRanked?: boolean;
}

export function ShapeColorGame({ onExit, onStatsChange, isRanked }: Props) {
  const [phase, setPhase] = useState<"setup" | "countdown" | "playing">("countdown");
  const [startLevel, setStartLevel] = useState(isRanked ? 4 : 1);

  useEffect(() => {
    if (isRanked) {
      setStartLevel(4);
    }
  }, [isRanked]);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(NORMAL_CONFIG);
  const team = useTeamSession();
  const [bonusOn, setBonusOn] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => { setLastMatch(loadLastMatch("formas")); }, []);

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [level, setLevel] = useState(1);
  const [qInLevel, setQInLevel] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const prevModeRef = useRef<1 | 2 | 3 | undefined>(undefined);
  const solveLockRef = useRef(false);

  // Per-question runtime state
  const [droppedIds, setDroppedIds] = useState<Set<string>>(new Set());              // mode 1
  const [placed, setPlaced] = useState<Record<string, string>>({});                  // mode 2/3: slotId -> pieceId
  const [adjustPiece, setAdjustPiece] = useState<Piece | null>(null);                // mode 3
  const [flashSlot, setFlashSlot] = useState<string | null>(null);
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const [timeAtEnd, setTimeAtEnd] = useState(0);

  const clock = useRoundClock(DURATION, running, () => {
    setTimeAtEnd(0);
    endGame(0);
  });

  function endGame(remaining: number) {
    setRunning(false);
    setTimeAtEnd(remaining);
    setFinished(true);
  }

  useEffect(() => {
    if (finished) {
      updateBest("formas", score, level);
      const m: LastMatch = {
        score,
        correct,
        wrong,
        level,
        at: Date.now(),
        isTeam: team.activeSession,
        mode: isRanked ? "torneio_semanal" : team.activeSession ? "equipes" : "padrao",
      };
      saveLastMatch("formas", m);
      setLastMatch(m);
      onStatsChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function loadNewQuestion(lvl: number, qi: number) {
    solveLockRef.current = false;
    const q = generateQuestion(lvl, qi, prevModeRef.current);
    prevModeRef.current = q.mode;
    setQuestion(q);
    setDroppedIds(new Set());
    setPlaced({});
    setAdjustPiece(null);
    setFlashSlot(null);
  }

  function startGame() {
    solveLockRef.current = false;
    setRunId((r) => r + 1);
    team.begin(teamConfig);
    setScore(0); setCorrect(0); setWrong(0);
    setLevel(startLevel); setQInLevel(0);
    setFinished(false);
    prevModeRef.current = undefined;
    loadNewQuestion(startLevel, 0);
    setPhase("playing");
    setRunning(true);
  }

  function advanceQuestion() {
    const nextQ = qInLevel + 1;
    if (nextQ >= QUESTIONS_PER_LEVEL) {
      const newLevel = level + 1;
      setLevel(newLevel);
      setQInLevel(0);
      setShowLevelUp(newLevel);
      setTimeout(() => {
        setShowLevelUp(null);
        loadNewQuestion(newLevel, 0);
      }, 1000);
    } else {
      setQInLevel(nextQ);
      setTimeout(() => loadNewQuestion(level, nextQ), 500);
    }
  }

  /** Placement feedback only — points are awarded when the question is solved. */
  function registerPlacement() {
    playCorrect();
  }

  /** Awards the points for a fully solved question. */
  function solveQuestion() {
    if (solveLockRef.current) return;
    solveLockRef.current = true;
    const pts = level >= 4 ? POINTS_CORRECT_L4 : POINTS_CORRECT;
    setScore((s) => s + pts);
    setCorrect((c) => c + 1);
    if (bonusOn) clock.addBonus();
    advanceQuestion();
  }
  function registerWrong(slotId?: string) {
    if (solveLockRef.current) return;
    playWrong();
    setScore((s) => Math.max(0, s - POINTS_WRONG));
    setWrong((w) => w + 1);
    if (slotId) {
      setFlashSlot(slotId);
      setTimeout(() => setFlashSlot((cur) => (cur === slotId ? null : cur)), 500);
    }
  }

  function handleMode1Drop(pieceId: string) {
    if (solveLockRef.current || !question || question.mode !== 1) return;
    if (droppedIds.has(pieceId)) return;
    const isTarget = question.targetIds.includes(pieceId);
    if (isTarget) {
      registerPlacement();
      const next = new Set(droppedIds);
      next.add(pieceId);
      setDroppedIds(next);
      if (next.size >= question.targetIds.length) solveQuestion();
    } else {
      registerWrong("m1-dropzone");
    }
  }

  function handleMode2Drop(slotId: string, pieceId: string) {
    if (solveLockRef.current || !question || question.mode !== 2) return;
    if (Object.values(placed).includes(pieceId)) return;
    const slot = question.slots.find((s) => s.id === slotId);
    const piece = question.pieces.find((p) => p.id === pieceId);
    if (!slot || !piece) return;
    if (slot.shape === piece.shape && !placed[slotId]) {
      registerPlacement();
      const next = { ...placed, [slotId]: pieceId };
      setPlaced(next);
      if (Object.keys(next).length >= question.slots.length) solveQuestion();
    } else {
      registerWrong(slotId);
    }
  }

  function handleMode3DropToAdjust(pieceId: string) {
    if (!question || question.mode !== 3) return;
    if (Object.values(placed).includes(pieceId)) return;
    const p = question.pieces.find((pi) => pi.id === pieceId);
    if (p) setAdjustPiece(p);
  }

  function handleMode3DropToSlot(slotId: string, pieceId: string) {
    if (!question || question.mode !== 3) return;
    if (placed[slotId]) return;
    const slot = question.slots.find((s) => s.id === slotId);
    // Only the adjusted piece can be placed
    if (!adjustPiece || adjustPiece.id !== pieceId || !slot) {
      registerWrong(slotId);
      return;
    }
    if (adjustPiece.shape === slot.shape && adjustPiece.size === slot.size) {
      registerPlacement();
      const next = { ...placed, [slotId]: pieceId };
      setPlaced(next);
      setAdjustPiece(null);
      if (Object.keys(next).length >= question.slots.length) solveQuestion();
    } else {
      registerWrong(slotId);
    }
  }

  function adjustSize(delta: 1 | -1) {
    if (!adjustPiece) return;
    const next = Math.max(0, Math.min(3, adjustPiece.size + delta)) as SizeIdx;
    if (next === adjustPiece.size) return;
    setAdjustPiece({ ...adjustPiece, size: next });
    // Reflect the change back into the question tray as well
    if (question && question.mode === 3) {
      setQuestion({
        ...question,
        pieces: question.pieces.map((p) => (p.id === adjustPiece.id ? { ...p, size: next } : p)),
      });
    }
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

  /* ------------------------------ Screens ------------------------------- */

  if (sessionEnd.showing) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Formas e Cores" onExit={onExit} />
        <SessionSummary title="Formas e Cores" session={team} onClose={sessionEnd.close} />
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <StartScreen
        title="Formas e Cores"
        description="Arraste as figuras para as áreas corretas. Questão resolvida: +10 (nível 4: +15) • Erro: −5"
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
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
            Nível inicial {isRanked && "• 🔒 Travado no Nível 4 (Torneio Ranqueado)"}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <OptionChip
                key={n}
                active={startLevel === n}
                onClick={() => {
                  if (!isRanked) setStartLevel(n);
                }}
              >
                {n} {isRanked && n === 4 ? "🔒" : ""}
              </OptionChip>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs text-muted-foreground text-center">
            <div>1: cores</div>
            <div>2: formas</div>
            <div>3: forma + tamanho</div>
            <div>4+: formas avançadas (15 pts)</div>
          </div>
        </div>
      </StartScreen>
    );
  }

  if (phase === "countdown") {
    return (
      <div className="space-y-4">
        <GameTopBar title="Formas e Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <Countdown onDone={startGame} />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <GameTopBar title="Formas e Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
        <ResultPanel
          gameId="formas"
          isTeam={team.activeSession}
          score={score} correct={correct} wrong={wrong} level={level}
          onReplay={replayWithCountdown} onMenu={onExit} onChangeSettings={backToSetup}
        />
        <TeamResults session={team} />
        <div className="mx-auto max-w-2xl">
          <ExtraStat icon={<Clock className="h-5 w-5" />} label="Tempo restante" value={formatTime(timeAtEnd)} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GameTopBar title="Formas e Cores" onExit={onExit} sessionActive={team.activeSession} onFinishSession={sessionEnd.request} />
      <Hud time={clock.time} score={score} level={level} qInLevel={qInLevel} />
      <TeamScoreBar key={runId} session={team} score={score} />
      {question && (
        <PlayArea
          question={question}
          droppedIds={droppedIds}
          placed={placed}
          adjustPiece={adjustPiece}
          flashSlot={flashSlot}
          showLevelUp={showLevelUp}
          onMode1Drop={handleMode1Drop}
          onMode2Drop={handleMode2Drop}
          onMode3DropToAdjust={handleMode3DropToAdjust}
          onMode3DropToSlot={handleMode3DropToSlot}
          onAdjustSize={adjustSize}
        />
      )}
    </div>
  );
}

/* ------------------------------ Chrome ------------------------------- */


function Hud({ time, score, level, qInLevel }: {
  time: number; score: number; level: number; qInLevel: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-3 select-none">
      <Stat icon={<Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Tempo" value={formatTime(time)} tone="primary" />
      <Stat icon={<Trophy className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Pontos" value={String(score)} tone="accent" />
      <Stat icon={<Star className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Nível" value={String(level)} tone="primary" />
      <Stat icon={<ListChecks className="h-3.5 w-3.5 sm:h-5 sm:w-5" />} label="Questões" value={`${qInLevel}/${QUESTIONS_PER_LEVEL}`} tone="accent" />
    </div>
  );
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone: "primary" | "accent";
}) {
  const bg = tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent";
  return (
    <div className="flex items-center gap-1.5 sm:gap-3 rounded-xl sm:rounded-2xl border bg-card p-1.5 sm:p-2.5 shadow-2xs min-w-0">
      <div className={`grid h-7 w-7 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg sm:rounded-xl ${bg}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate font-semibold leading-tight">{label}</div>
        <div className="truncate text-xs sm:text-base font-black font-display text-foreground leading-tight">{value}</div>
      </div>
    </div>
  );
}

function ExtraStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-lg font-bold font-display">{value}</div>
      </div>
    </div>
  );
}

/** Shrinks pieces when there are many on screen so nothing overflows. */
function scaleFor(n: number) {
  if (n <= 6) return 1;
  if (n <= 10) return 0.72;
  if (n <= 14) return 0.6;
  return 0.5;
}

/* ------------------------------ Play area ------------------------------- */

interface PlayProps {
  question: Question;
  droppedIds: Set<string>;
  placed: Record<string, string>;
  adjustPiece: Piece | null;
  flashSlot: string | null;
  showLevelUp: number | null;
  onMode1Drop: (pieceId: string) => void;
  onMode2Drop: (slotId: string, pieceId: string) => void;
  onMode3DropToAdjust: (pieceId: string) => void;
  onMode3DropToSlot: (slotId: string, pieceId: string) => void;
  onAdjustSize: (delta: 1 | -1) => void;
}

function PlayArea(p: PlayProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 6 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const activePiece = useMemo(() => {
    if (!activeId) return null;
    if (p.adjustPiece && p.adjustPiece.id === activeId) return p.adjustPiece;
    return p.question.pieces.find((pi) => pi.id === activeId) ?? null;
  }, [activeId, p.question, p.adjustPiece]);

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleEnd(e: DragEndEvent) {
    const pieceId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    setActiveId(null);
    if (!overId) return;
    if (p.question.mode === 1) {
      if (overId === "m1-dropzone") p.onMode1Drop(pieceId);
    } else if (p.question.mode === 2) {
      if (overId.startsWith("slot-")) p.onMode2Drop(overId.slice(5), pieceId);
    } else {
      if (overId === "adjust-zone") p.onMode3DropToAdjust(pieceId);
      else if (overId.startsWith("slot-")) p.onMode3DropToSlot(overId.slice(5), pieceId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className="relative">
        {p.showLevelUp && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background/85 backdrop-blur-sm rounded-3xl">
            <div className="animate-level-up text-center">
              <div className="font-display text-5xl sm:text-7xl font-extrabold text-accent">
                Nível {p.showLevelUp}!
              </div>
            </div>
          </div>
        )}
        {p.question.mode === 1 && (
          <Mode1View q={p.question} droppedIds={p.droppedIds} flashSlot={p.flashSlot} />
        )}
        {p.question.mode === 2 && (
          <Mode2View q={p.question} placed={p.placed} flashSlot={p.flashSlot} />
        )}
        {p.question.mode === 3 && (
          <Mode3View
            q={p.question}
            placed={p.placed}
            adjustPiece={p.adjustPiece}
            flashSlot={p.flashSlot}
            onAdjustSize={p.onAdjustSize}
          />
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(.2,.9,.3,1.3)" }}>
        {activePiece && (
          <div className="pointer-events-none scale-110 opacity-90">
            <ShapeSvg shape={activePiece.shape} color={activePiece.color} size={activePiece.size} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* -------- Mode 1: color pick -------- */
function Mode1View({ q, droppedIds, flashSlot }: {
  q: Extract<Question, { mode: 1 }>; droppedIds: Set<string>; flashSlot: string | null;
}) {
  const flashing = flashSlot === "m1-dropzone";
  const collected = q.pieces.filter((p) => droppedIds.has(p.id));
  const sc = scaleFor(q.pieces.length);
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border bg-card p-3 sm:p-4 shadow-lg text-center">
        <div className="text-sm uppercase tracking-wider text-muted-foreground">Arraste todos os objetos da cor</div>
        <div
          className="mt-2 inline-flex items-center gap-3 font-display text-3xl sm:text-4xl font-extrabold uppercase"
          style={{ color: q.targetColor === "branco" ? "#64748b" : "inherit" }}
        >
          <span
            className="inline-block h-8 w-8 rounded-full border-2"
            style={{ background: colorFor(q.targetColor), borderColor: "rgba(0,0,0,0.2)" }}
          />
          {q.targetColor}
        </div>
      </div>

      <ColorDropZone flashing={flashing}>
        {collected.length === 0 && (
          <span className="text-muted-foreground text-sm">Solte as figuras aqui</span>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {collected.map((pc) => (
            <div key={pc.id} className="animate-snap-in">
              <ShapeSvg shape={pc.shape} color={pc.color} size={pc.size} scale={sc * 0.8} />
            </div>
          ))}
        </div>
      </ColorDropZone>

      <Tray>
        {q.pieces.filter((p) => !droppedIds.has(p.id)).map((piece) => (
          <DraggablePiece key={piece.id} piece={piece} scale={sc} />
        ))}
      </Tray>
    </div>
  );
}

function ColorDropZone({ children, flashing }: { children: React.ReactNode; flashing: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: "m1-dropzone" });
  const tone = flashing
    ? "border-destructive bg-destructive/10 animate-shake-x"
    : isOver
      ? "border-primary bg-primary/10 animate-glow-pulse"
      : "border-primary/40 bg-primary/5";
  return (
    <div
      ref={setNodeRef}
      className={`rounded-3xl border-4 border-dashed p-3 min-h-[110px] grid place-items-center transition-all ${tone}`}
    >
      {children}
    </div>
  );
}

/* -------- Mode 2: shape matching -------- */
function Mode2View({ q, placed, flashSlot }: {
  q: Extract<Question, { mode: 2 }>; placed: Record<string, string>; flashSlot: string | null;
}) {
  const usedIds = new Set(Object.values(placed));
  const sc = scaleFor(q.pieces.length);
  return (
    <div className="space-y-3">
      <div className="rounded-3xl border bg-card p-3 shadow-lg text-center">
        <div className="font-display text-lg sm:text-xl font-bold">
          Arraste cada figura para o contorno correspondente
        </div>
      </div>

      <div className="rounded-3xl border-4 border-dashed border-primary/30 bg-primary/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
          {q.slots.map((slot) => {
            const pieceId = placed[slot.id];
            const piece = pieceId ? q.pieces.find((p) => p.id === pieceId) : null;
            return (
              <ShapeSlot
                key={slot.id}
                slotId={slot.id}
                targetShape={slot.shape}
                targetSize={2}
                filledPiece={piece ?? null}
                flashing={flashSlot === slot.id}
              />
            );
          })}
        </div>
      </div>

      <Tray>
        {q.pieces.filter((p) => !usedIds.has(p.id)).map((piece) => (
          <DraggablePiece key={piece.id} piece={piece} scale={sc} />
        ))}
      </Tray>
    </div>
  );
}

/* -------- Mode 3: shape + size -------- */
function Mode3View({ q, placed, adjustPiece, flashSlot, onAdjustSize }: {
  q: Extract<Question, { mode: 3 }>;
  placed: Record<string, string>;
  adjustPiece: Piece | null;
  flashSlot: string | null;
  onAdjustSize: (d: 1 | -1) => void;
}) {
  const usedIds = new Set(Object.values(placed));
  const sc = scaleFor(q.pieces.length);
  return (
    <div className="space-y-3">
      <div className="rounded-3xl border bg-card p-3 shadow-lg text-center">
        <div className="font-display text-lg sm:text-xl font-bold">
          Ajuste a forma e o tamanho até caberem no contorno
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border-4 border-dashed border-primary/30 bg-primary/5 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            {q.slots.map((slot) => {
              const pieceId = placed[slot.id];
              const piece = pieceId ? q.pieces.find((p) => p.id === pieceId) : null;
              return (
                <ShapeSlot
                  key={slot.id}
                  slotId={slot.id}
                  targetShape={slot.shape}
                  targetSize={slot.size}
                  filledPiece={piece ?? null}
                  flashing={flashSlot === slot.id}
                />
              );
            })}
          </div>
        </div>

        <AdjustZone piece={adjustPiece} onAdjustSize={onAdjustSize} />
      </div>

      <Tray>
        {q.pieces
          .filter((p) => !usedIds.has(p.id) && p.id !== adjustPiece?.id)
          .map((piece) => (
            <DraggablePiece key={piece.id} piece={piece} scale={sc} />
          ))}
      </Tray>
    </div>
  );
}

function AdjustZone({ piece, onAdjustSize }: {
  piece: Piece | null; onAdjustSize: (d: 1 | -1) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "adjust-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-3xl border-4 border-dashed p-3 min-h-[190px] flex flex-col items-center justify-center gap-3 transition-all ${
        isOver ? "border-accent bg-accent/10" : "border-accent/50 bg-accent/5"
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        Área de ajuste
      </div>
      <div className="grid place-items-center min-h-[140px]">
        {piece ? (
          <DraggablePiece piece={piece} key={piece.id + "-adj"} />
        ) : (
          <span className="text-sm text-muted-foreground">Arraste uma peça aqui</span>
        )}
      </div>
      {piece && (
        <>
          <div className="text-sm font-bold">{SIZE_LABEL[piece.size]}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onAdjustSize(-1)}
              disabled={piece.size === 0}
              className="grid h-11 w-11 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md disabled:opacity-40 hover:scale-105 active:scale-95 transition"
              aria-label="Diminuir"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onAdjustSize(1)}
              disabled={piece.size === 3}
              className="grid h-11 w-11 place-items-center rounded-full bg-success text-success-foreground shadow-md disabled:opacity-40 hover:scale-105 active:scale-95 transition"
              aria-label="Aumentar"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Shared ------------------------------- */

function Tray({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-card p-3 shadow-md min-h-[110px]">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {children}
      </div>
    </div>
  );
}

function DraggablePiece({ piece, scale = 1 }: { piece: Piece; scale?: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: piece.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none", opacity: isDragging ? 0 : 1 }}
      className="cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
    >
      <ShapeSvg shape={piece.shape} color={piece.color} size={piece.size} scale={scale} />
    </div>
  );
}

function ShapeSlot({ slotId, targetShape, targetSize, filledPiece, flashing }: {
  slotId: string;
  targetShape: Piece["shape"];
  targetSize: SizeIdx;
  filledPiece: Piece | null;
  flashing: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot-${slotId}` });
  const px = SIZE_PX_FOR_SLOT[targetSize];
  const tone = flashing
    ? "ring-4 ring-destructive/60 animate-shake-x"
    : filledPiece
      ? "ring-2 ring-success/50"
      : isOver
        ? "ring-4 ring-primary/60 animate-glow-pulse"
        : "";
  return (
    <div
      ref={setNodeRef}
      className={`relative grid place-items-center rounded-2xl transition-all ${tone}`}
      style={{ width: px + 20, height: px + 20 }}
    >
      {filledPiece ? (
        <div className="animate-snap-in">
          <ShapeSvg shape={filledPiece.shape} color={filledPiece.color} size={filledPiece.size} />
        </div>
      ) : (
        <ShapeSvg shape={targetShape} size={targetSize} outline />
      )}
    </div>
  );
}

// Same px table as SIZE_PX exported from content
const SIZE_PX_FOR_SLOT = [46, 68, 96, 128] as const;

function colorFor(name: string) {
  const map: Record<string, string> = {
    vermelho: "#ef4444", azul: "#3b82f6", verde: "#22c55e", amarelo: "#eab308",
    roxo: "#a855f7", laranja: "#f97316", rosa: "#ec4899", preto: "#111827",
    branco: "#ffffff", marrom: "#78350f",
  };
  return map[name] ?? "#3b82f6";
}
