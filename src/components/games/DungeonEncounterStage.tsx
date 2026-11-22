import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Backpack,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Heart,
  HelpCircle,
  KeyRound,
  LogOut,
  PauseCircle,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardDefinition } from "@/lib/cards-catalog";
import {
  DUNGEON_MONSTERS,
  DUNGEON_RESOURCES,
  DUNGEON_RESOURCE_IDS,
  getBiomeForFloor,
  type DungeonResourceId,
} from "@/lib/dungeon-config";
import {
  addResourcesToInventory,
  advanceToNextDungeonFloor,
  aggregateDungeonLoadout,
  applyEncounterDamage,
  canAdvanceToFloor,
  completeGuardianFloor,
  extractDungeonRun,
  generateDungeonInteraction,
  generateDungeonPuzzle,
  generateDungeonQuestion,
  getFloorProgressStats,
  resolveDungeonDefeat,
  rollEncounterLoot,
  validateAlignNotes,
  validateFitKey,
  validateTrapTiles,
  type DungeonActiveRun,
  type DungeonEncounterKind,
  type DungeonFloorEncounter,
  type DungeonInteractionChallenge,
  type DungeonPuzzleChallenge,
  type DungeonQuestionChallenge,
  type DungeonResourceInventory,
  type PlayerDungeonState,
} from "@/lib/dungeon-engine";
import { playTone } from "@/lib/sound";

interface DungeonEncounterStageProps {
  dungeonState: PlayerDungeonState;
  equippedCards: CardDefinition[];
  effectiveLevel: number;
  onUpdateState: (nextState: PlayerDungeonState) => void;
  onFloorClearExtract: (
    nextState: PlayerDungeonState,
    coinsEarned: number,
    xpEarned: number,
    summaryTitle: string,
  ) => void;
  onGuardianClear: (
    nextState: PlayerDungeonState,
    chestId: string,
    coinsEarned: number,
    xpEarned: number,
    unlockedCheckpoint: number,
  ) => void;
  onDefeatResolved: (
    nextState: PlayerDungeonState,
    keptCoins: number,
    summary: {
      retentionRate: number;
      keptResources: DungeonResourceInventory;
      lostResources: DungeonResourceInventory;
    },
  ) => void;
  onPauseAndExit: () => void;
}

type StepPhase = "narrative" | "active" | "result";

function encounterIcon(kind: DungeonEncounterKind): string {
  switch (kind) {
    case "combat":
      return "⚔️";
    case "puzzle":
      return "🧩";
    case "question":
      return "❓";
    case "interaction":
      return "🖐️";
    case "fork":
      return "🚪";
    case "shrine":
      return "⛲";
    case "guardian":
      return "👑";
  }
}

export function DungeonEncounterStage({
  dungeonState,
  equippedCards,
  effectiveLevel,
  onUpdateState,
  onFloorClearExtract,
  onGuardianClear,
  onDefeatResolved,
  onPauseAndExit,
}: DungeonEncounterStageProps) {
  const run = dungeonState.currentRun;
  const bonuses = useMemo(() => aggregateDungeonLoadout(equippedCards), [equippedCards]);

  const [stepPhase, setStepPhase] = useState<StepPhase>("narrative");
  const [showBackpack, setShowBackpack] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [lastLoot, setLastLoot] = useState<{
    resources: DungeonResourceInventory;
    coins: number;
    xp: number;
    note?: string;
  } | null>(null);

  // Estado para combate / questões / puzzles
  const [questionData, setQuestionData] = useState<DungeonQuestionChallenge | null>(null);
  const [puzzleData, setPuzzleData] = useState<DungeonPuzzleChallenge | null>(null);
  const [interactionData, setInteractionData] = useState<DungeonInteractionChallenge | null>(
    null,
  );
  const [monsterHp, setMonsterHp] = useState(3);
  const [monsterMaxHp, setMonsterMaxHp] = useState(3);
  const [encounterErrors, setEncounterErrors] = useState(0);
  const [combatTimer, setCombatTimer] = useState(0);

  // Estado das microinterações
  const [keyPins, setKeyPins] = useState<number[]>([]);
  const [notesOrder, setNotesOrder] = useState<number[]>([]);
  const [selectedNoteIdx, setSelectedNoteIdx] = useState<number | null>(null);
  const [trapPreviewing, setTrapPreviewing] = useState(false);
  const [trapPicked, setTrapPicked] = useState<number[]>([]);
  const [trapHitIndex, setTrapHitIndex] = useState<number | null>(null);
  const [cleanedSpots, setCleanedSpots] = useState<string[]>([]);

  // Estado do Guardião (3 fases)
  const [bossPhase, setBossPhase] = useState<1 | 2 | 3>(1);
  const [bossPhase1Remaining, setBossPhase1Remaining] = useState(2);

  // Estado de Derrota / Vitória do Guardião na própria tela
  const [defeatSummary, setDefeatSummary] = useState<{
    retentionRate: number;
    keptResources: DungeonResourceInventory;
    lostResources: DungeonResourceInventory;
    keptCoins: number;
  } | null>(null);
  const [guardianVictory, setGuardianVictory] = useState<{
    checkpoint: number;
    chestId: string;
    coinsEarned: number;
    xpEarned: number;
    extractedResources: DungeonResourceInventory;
  } | null>(null);

  const trapTimerRef = useRef<number | null>(null);

  const currentEncounter: DungeonFloorEncounter | null = useMemo(() => {
    if (!run || !run.active) return null;
    return (
      run.encounters.find((e) => !e.completed) ??
      run.encounters[run.floorProgressIndex] ??
      null
    );
  }, [run]);

  const floorProgress = useMemo(() => getFloorProgressStats(run), [run]);
  const isFloorCompleted = Boolean(
    run && run.encounters.length > 0 && run.encounters.every((e) => e.completed),
  );

  // Limpa timers auxiliares ao desmontar
  useEffect(() => {
    return () => {
      if (trapTimerRef.current) window.clearTimeout(trapTimerRef.current);
    };
  }, []);

  // Cronômetro de combate / questões rápidas
  useEffect(() => {
    if (defeatSummary || guardianVictory || stepPhase !== "active" || !currentEncounter) return;
    const isTimed =
      currentEncounter.kind === "combat" ||
      (currentEncounter.kind === "guardian" && bossPhase === 1);
    if (!isTimed) return;

    const id = window.setInterval(() => {
      setCombatTimer((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [defeatSummary, guardianVictory, stepPhase, currentEncounter, bossPhase]);

  // Aplica dano quando o tempo do combate zera
  useEffect(() => {
    if (defeatSummary || guardianVictory || stepPhase !== "active" || !currentEncounter || !run) {
      return;
    }
    const isTimed =
      currentEncounter.kind === "combat" ||
      (currentEncounter.kind === "guardian" && bossPhase === 1);
    if (!isTimed || combatTimer !== 0) return;

    const nextTimer =
      (currentEncounter.kind === "guardian" ? 16 : 14) + bonuses.extraTimerSeconds;
    setCombatTimer(nextTimer);
    handleDamage(15, "⏱️ Tempo esgotado! O inimigo contra-atacou.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatTimer]);

  function appendLog(prevRun: DungeonActiveRun, entry: string): DungeonActiveRun {
    return {
      ...prevRun,
      narrativeLog: [...prevRun.narrativeLog.slice(-30), entry],
    };
  }

  function handleDamage(rawDamage: number, reason: string) {
    if (!run) return;
    playTone(210, 0.18, "sawtooth", 0.08);
    setEncounterErrors((e) => e + 1);
    const dmgRes = applyEncounterDamage(run, rawDamage, bonuses);
    const logMsg = dmgRes.absorbedByShield
      ? `🛡️ Égide Lógica absorveu o dano! (${reason})`
      : `💥 -${dmgRes.damageTaken} HP! (${reason})`;
    setFeedbackMsg(logMsg);

    const updatedRun = appendLog(dmgRes.run, logMsg);
    if (updatedRun.hp <= 0) {
      const stateWithDeadRun: PlayerDungeonState = {
        ...dungeonState,
        currentRun: updatedRun,
      };
      const defRes = resolveDungeonDefeat(stateWithDeadRun, equippedCards);
      setDefeatSummary({
        retentionRate: defRes.retentionRate,
        keptResources: defRes.keptResources,
        lostResources: defRes.lostResources,
        keptCoins: defRes.keptCoins,
      });
      onDefeatResolved(defRes.state, defRes.keptCoins, {
        retentionRate: defRes.retentionRate,
        keptResources: defRes.keptResources,
        lostResources: defRes.lostResources,
      });
      return;
    }

    onUpdateState({
      ...dungeonState,
      currentRun: updatedRun,
      updatedAt: new Date().toISOString(),
    });
  }

  function completeCurrentEncounter(
    note?: string,
    extraResource?: Partial<Record<DungeonResourceId, number>>,
    overrideMult?: number,
    options?: { healAmount?: number; nextPendingMult?: number },
  ) {
    if (!run || !currentEncounter) return;
    playTone(660, 0.14, "triangle", 0.08);

    const mult = overrideMult ?? run.pendingLootMultiplier ?? 1;
    const rolled = rollEncounterLoot({
      floor: run.currentFloor,
      kind: currentEncounter.kind,
      bonusMultiplier: mult,
      bonuses,
    });
    const combinedRes = extraResource
      ? addResourcesToInventory(rolled.resources, extraResource)
      : rolled.resources;

    let nextHp = Math.min(run.maxHp, run.hp + Math.max(0, options?.healAmount ?? 0));
    let healNote = "";
    if (
      encounterErrors === 0 &&
      bonuses.flawlessHealPercent > 0 &&
      (currentEncounter.kind === "combat" || currentEncounter.kind === "puzzle")
    ) {
      const heal = Math.max(2, Math.round((run.maxHp * bonuses.flawlessHealPercent) / 100));
      const before = nextHp;
      nextHp = Math.min(run.maxHp, nextHp + heal);
      if (nextHp > before) {
        healNote = ` • 💚 +${nextHp - before} HP (Regeneração)`;
      }
    }

    if (currentEncounter.kind === "guardian") {
      const runBeforeBoss: DungeonActiveRun = {
        ...run,
        hp: nextHp,
        tempBackpack: addResourcesToInventory(run.tempBackpack, combinedRes),
        tempCoins: run.tempCoins + rolled.coins,
        tempXp: run.tempXp + rolled.xp,
        encounters: run.encounters.map((e) =>
          e.id === currentEncounter.id
            ? { ...e, completed: true, flawless: encounterErrors === 0 }
            : e,
        ),
      };
      const bossRes = completeGuardianFloor(
        { ...dungeonState, currentRun: runBeforeBoss },
        run.currentFloor,
      );
      setGuardianVictory({
        checkpoint: bossRes.unlockedCheckpoint,
        chestId: bossRes.chestId,
        coinsEarned: bossRes.coinsEarned,
        xpEarned: bossRes.xpEarned,
        extractedResources: bossRes.extractedResources,
      });
      onGuardianClear(
        bossRes.state,
        bossRes.chestId,
        bossRes.coinsEarned,
        bossRes.xpEarned,
        bossRes.unlockedCheckpoint,
      );
      return;
    }

    const updatedEncounters = run.encounters.map((e) =>
      e.id === currentEncounter.id
        ? { ...e, completed: true, flawless: encounterErrors === 0 }
        : e,
    );
    const nextIdx = updatedEncounters.findIndex((e) => !e.completed);

    let nextRun: DungeonActiveRun = {
      ...run,
      hp: nextHp,
      encounters: updatedEncounters,
      floorProgressIndex: nextIdx === -1 ? updatedEncounters.length : nextIdx,
      tempBackpack: addResourcesToInventory(run.tempBackpack, combinedRes),
      tempCoins: run.tempCoins + rolled.coins,
      tempXp: run.tempXp + rolled.xp,
      pendingLootMultiplier: options?.nextPendingMult ?? 1,
    };
    nextRun = appendLog(
      nextRun,
      `✅ Concluiu: ${currentEncounter.title}${note ? ` (${note})` : ""}${healNote}`,
    );

    setLastLoot({
      resources: combinedRes,
      coins: rolled.coins,
      xp: rolled.xp,
      note: `${note ?? ""}${healNote}`.trim() || undefined,
    });
    setFeedbackMsg(null);
    setStepPhase("result");
    onUpdateState({
      ...dungeonState,
      currentRun: nextRun,
      updatedAt: new Date().toISOString(),
    });
  }

  function startEncounterInteraction(enc: DungeonFloorEncounter) {
    setFeedbackMsg(null);
    setEncounterErrors(0);
    setQuestionData(null);
    setPuzzleData(null);
    setInteractionData(null);

    if (enc.kind === "combat") {
      const m = DUNGEON_MONSTERS.find((item) => item.id === enc.monsterId);
      const hits = m?.hitsRequired ?? 3;
      setMonsterMaxHp(hits);
      setMonsterHp(hits);
      setCombatTimer(14 + bonuses.extraTimerSeconds);
      const qTypes = ["arithmetic", "comparison", "variable", "percent"];
      setQuestionData(
        generateDungeonQuestion(
          run!.currentFloor,
          qTypes[Math.floor(Math.random() * qTypes.length)],
        ),
      );
      setStepPhase("active");
      return;
    }

    if (enc.kind === "question") {
      setQuestionData(generateDungeonQuestion(run!.currentFloor, enc.subType));
      setStepPhase("active");
      return;
    }

    if (enc.kind === "shrine") {
      setQuestionData(generateDungeonQuestion(run!.currentFloor, "comparison"));
      setStepPhase("active");
      return;
    }

    if (enc.kind === "puzzle") {
      setPuzzleData(generateDungeonPuzzle(run!.currentFloor, enc.subType));
      setStepPhase("active");
      return;
    }

    if (enc.kind === "interaction") {
      const inter = generateDungeonInteraction(run!.currentFloor, enc.subType);
      setInteractionData(inter);
      if (inter.kind === "fit_key") {
        setKeyPins(inter.targetPins.map(() => 1));
      } else if (inter.kind === "align_notes") {
        setNotesOrder([...inter.initialNotes]);
        setSelectedNoteIdx(null);
      } else if (inter.kind === "trap_tiles") {
        setTrapPicked([]);
        setTrapHitIndex(null);
        setTrapPreviewing(true);
        if (trapTimerRef.current) window.clearTimeout(trapTimerRef.current);
        trapTimerRef.current = window.setTimeout(() => {
          setTrapPreviewing(false);
        }, 1800);
      } else if (inter.kind === "clean_crystal") {
        setCleanedSpots([]);
      }
      setStepPhase("active");
      return;
    }

    if (enc.kind === "guardian") {
      setBossPhase(1);
      setBossPhase1Remaining(2);
      setCombatTimer(16 + bonuses.extraTimerSeconds);
      setQuestionData(generateDungeonQuestion(run!.currentFloor, "arithmetic"));
      setStepPhase("active");
      return;
    }

    // fork
    setStepPhase("active");
  }

  function handleAnswerQuestion(selectedIndex: number) {
    if (!questionData || !currentEncounter || !run) return;
    const isCorrect = selectedIndex === questionData.correctIndex;

    if (currentEncounter.kind === "shrine") {
      if (isCorrect) {
        const heal = Math.max(8, Math.round(run.maxHp * 0.25));
        completeCurrentEncounter(`Fonte ativada! +${heal} HP restaurado`, undefined, 1, {
          healAmount: heal,
        });
      } else {
        completeCurrentEncounter("Selo da fonte falhou (sem cura)", undefined, 1);
      }
      return;
    }

    if (currentEncounter.kind === "question") {
      if (isCorrect) {
        completeCurrentEncounter("Resposta correta!");
      } else {
        handleDamage(12, "Resposta incorreta no corredor.");
      }
      return;
    }

    if (currentEncounter.kind === "combat") {
      if (isCorrect) {
        const isCrit = Math.random() * 100 < bonuses.critChancePercent;
        const dmg = isCrit ? 2 : 1;
        const nextMonsterHp = Math.max(0, monsterHp - dmg);
        setMonsterHp(nextMonsterHp);
        playTone(isCrit ? 880 : 580, 0.12, "triangle", 0.08);
        setFeedbackMsg(
          isCrit
            ? "⚡ GOLPE CRÍTICO! (-2 de vida no inimigo)"
            : "⚔️ Acertou o golpe! (-1 de vida no inimigo)",
        );
        if (nextMonsterHp <= 0) {
          completeCurrentEncounter(
            isCrit ? "Vitória com Golpe Crítico!" : "Inimigo derrotado!",
          );
        } else {
          setCombatTimer(14 + bonuses.extraTimerSeconds);
          const qTypes = ["arithmetic", "comparison", "variable", "percent"];
          setQuestionData(
            generateDungeonQuestion(
              run.currentFloor,
              qTypes[Math.floor(Math.random() * qTypes.length)],
            ),
          );
        }
      } else {
        handleDamage(18, "Erro durante o combate!");
      }
      return;
    }

    if (currentEncounter.kind === "guardian" && bossPhase === 1) {
      if (isCorrect) {
        playTone(620, 0.12, "triangle", 0.08);
        const rem = bossPhase1Remaining - 1;
        if (rem <= 0) {
          setBossPhase(2);
          setFeedbackMsg("🔓 Escudo do Guardião quebrado! Agora alinhe a chave rúnica.");
          const inter = generateDungeonInteraction(run.currentFloor, "fit_key");
          setInteractionData(inter);
          if (inter.kind === "fit_key") {
            setKeyPins(inter.targetPins.map(() => 1));
          }
        } else {
          setBossPhase1Remaining(rem);
          setCombatTimer(16 + bonuses.extraTimerSeconds);
          setFeedbackMsg(`⚔️ Escudo trincado! Falta ${rem} golpe(s) na Fase 1.`);
          setQuestionData(generateDungeonQuestion(run.currentFloor, "variable"));
        }
      } else {
        handleDamage(20, "Contra-ataque do Guardião!");
      }
    }
  }

  function handleAnswerPuzzle(selectedIndex: number) {
    if (!puzzleData || !currentEncounter) return;
    if (selectedIndex === puzzleData.correctIndex) {
      if (currentEncounter.kind === "guardian" && bossPhase === 3) {
        completeCurrentEncounter("Guardião derrotado com maestria!");
      } else {
        completeCurrentEncounter("Enigma decifrado!");
      }
    } else {
      handleDamage(
        currentEncounter.kind === "guardian" ? 20 : 15,
        "Combinação incorreta no enigma.",
      );
    }
  }

  /* ------------------ Tela de Vitória sobre o Guardião ------------------ */
  if (guardianVictory) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border-2 border-amber-500/60 bg-card p-6 shadow-2xl space-y-5 text-center animate-in fade-in duration-300">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/20 text-4xl border border-amber-500/40">
          👑
        </div>
        <div className="space-y-1">
          <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-0.5 text-[11px] font-black uppercase text-amber-500">
            Checkpoint Desbloqueado • Andar {guardianVictory.checkpoint}
          </span>
          <h2 className="font-display text-2xl font-black text-foreground">
            Guardião Derrotado!
          </h2>
          <p className="text-xs text-muted-foreground">
            Todos os recursos da sua Mochila Temporária foram salvos com segurança (100%) e o
            Portal de Checkpoint foi ativado.
          </p>
        </div>

        <div className="rounded-2xl border bg-background/70 p-4 space-y-2 text-left">
          <div className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Recompensas Extraídas com Sucesso
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-600 dark:text-amber-300">
              🪙 +{guardianVictory.coinsEarned} Moedas
            </span>
            <span className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-black text-sky-600 dark:text-sky-300">
              ⚡ +{guardianVictory.xpEarned} XP
            </span>
            <span className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-2.5 py-1 text-xs font-black text-purple-600 dark:text-purple-300">
              🧰 +1 Baú do Bioma
            </span>
            {DUNGEON_RESOURCE_IDS.map((rId) => {
              const qty = guardianVictory.extractedResources[rId] ?? 0;
              if (qty <= 0) return null;
              const meta = DUNGEON_RESOURCES[rId];
              return (
                <span
                  key={rId}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}
                >
                  {meta.emoji} {qty}× {meta.name}
                </span>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          onClick={onPauseAndExit}
          className="w-full h-12 rounded-2xl font-display font-black text-sm"
        >
          Voltar ao Hub da Masmorra
        </Button>
      </div>
    );
  }

  /* -------------------------- Tela de Derrota -------------------------- */
  if (defeatSummary) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border-2 border-destructive/60 bg-card p-6 shadow-2xl space-y-5 text-center animate-in fade-in duration-300">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-destructive/15 text-3xl border border-destructive/30">
          💫
        </div>
        <div className="space-y-1">
          <span className="rounded-full bg-destructive/15 px-3 py-0.5 text-[11px] font-black uppercase text-destructive">
            Energia da Expedição Esgotada
          </span>
          <h2 className="font-display text-2xl font-black text-foreground">
            Retirada de Emergência
          </h2>
          <p className="text-xs text-muted-foreground">
            Você conseguiu salvar <b>{Math.round(defeatSummary.retentionRate * 100)}%</b> dos
            recursos da Mochila Temporária graças à extração segura.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-left">
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1.5">
            <div className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400">
              ✅ Itens Salvos no Inventário
            </div>
            <div className="flex flex-wrap gap-1.5">
              {defeatSummary.keptCoins > 0 && (
                <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold">
                  🪙 +{defeatSummary.keptCoins} Moedas
                </span>
              )}
              {DUNGEON_RESOURCE_IDS.map((id) => {
                const q = defeatSummary.keptResources[id] ?? 0;
                if (q <= 0) return null;
                const m = DUNGEON_RESOURCES[id];
                return (
                  <span key={id} className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold">
                    {m.emoji} {q}× {m.name}
                  </span>
                );
              })}
              {defeatSummary.keptCoins === 0 &&
                Object.keys(defeatSummary.keptResources).length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum item salvo.</span>
                )}
            </div>
          </div>

          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 space-y-1.5">
            <div className="text-[11px] font-black uppercase text-destructive">
              ❌ Perdidos na Masmorra
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DUNGEON_RESOURCE_IDS.map((id) => {
                const q = defeatSummary.lostResources[id] ?? 0;
                if (q <= 0) return null;
                const m = DUNGEON_RESOURCES[id];
                return (
                  <span key={id} className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-bold">
                    {m.emoji} {q}× {m.name}
                  </span>
                );
              })}
              {Object.keys(defeatSummary.lostResources).length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhuma perda.</span>
              )}
            </div>
          </div>
        </div>

        <Button
          type="button"
          onClick={onPauseAndExit}
          className="w-full h-12 rounded-2xl font-display font-black text-sm"
        >
          Retornar ao Hub da Masmorra
        </Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border bg-card p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">
          Expedição finalizada.
        </p>
        <Button type="button" onClick={onPauseAndExit} className="rounded-xl font-bold">
          Voltar ao Hub da Masmorra
        </Button>
      </div>
    );
  }

  const biome = getBiomeForFloor(run.currentFloor);
  const currentMonster = currentEncounter?.monsterId
    ? DUNGEON_MONSTERS.find((m) => m.id === currentEncounter.monsterId)
    : undefined;

  const nextFloorCheck = canAdvanceToFloor(
    run.currentFloor + 1,
    effectiveLevel,
    dungeonState,
  );

  return (
    <div className="space-y-4">
      {/* 1. Barra Superior Fixa da Expedição + Barra de Progresso do Andar */}
      <div
        className={`rounded-3xl border-2 ${biome.accentBorderClass} bg-gradient-to-br ${biome.gradientClass} p-4 text-white shadow-xl space-y-3`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase ${biome.badgeClass}`}
            >
              {biome.name}
            </span>
            <h2 className="font-display text-lg sm:text-xl font-black">
              Andar {run.currentFloor} / 15
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-xl bg-black/35 border border-white/15 px-2.5 py-1 text-xs font-black">
              <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
              {run.hp}/{run.maxHp}
            </span>
            {run.shieldsRemaining > 0 && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-blue-500/25 border border-blue-400/50 px-2.5 py-1 text-xs font-black text-blue-200">
                <Shield className="h-3.5 w-3.5" /> {run.shieldsRemaining}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/25 border border-amber-400/50 px-2.5 py-1 text-xs font-black text-amber-200">
              <Zap className="h-3.5 w-3.5" /> {dungeonState.stamina.current}/{dungeonState.stamina.max}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowBackpack((v) => !v)}
              className="h-8 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20"
            >
              <Backpack className="h-3.5 w-3.5 mr-1" /> Mochila
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onPauseAndExit}
              className="h-8 rounded-xl text-xs font-bold bg-black/40 hover:bg-black/60 text-white border border-white/20"
            >
              <PauseCircle className="h-3.5 w-3.5 mr-1" /> Pausar
            </Button>
          </div>
        </div>

        {/* Barra de Progresso Real do Andar */}
        <div className="space-y-1.5 rounded-2xl bg-black/30 p-3 border border-white/10">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-sky-300" />
              Exploração da Sala/Andar ({floorProgress.completed} de {floorProgress.total} eventos)
            </span>
            <span className="font-mono font-black text-sky-300">{floorProgress.percent}%</span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 transition-all duration-500"
              style={{ width: `${floorProgress.percent}%` }}
            />
          </div>

          {/* Marcos Visuais dos Encontros Sorteados */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
            {run.encounters.map((enc) => {
              const isCurrent = currentEncounter?.id === enc.id && !isFloorCompleted;
              const showSymbol =
                enc.completed || isCurrent || bonuses.revealProgressIcons || enc.kind === "guardian";
              return (
                <div
                  key={enc.id}
                  title={showSymbol ? enc.title : "Evento Desconhecido"}
                  className={`flex h-7 min-w-[28px] items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                    enc.completed
                      ? "border-emerald-400/60 bg-emerald-500/30 text-emerald-100"
                      : isCurrent
                        ? "border-amber-300 bg-amber-400/30 text-white ring-2 ring-amber-300/60 scale-105"
                        : "border-white/15 bg-white/10 text-white/75"
                  }`}
                >
                  {enc.completed ? "✓" : showSymbol ? encounterIcon(enc.kind) : "?"}
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo Compacto das 3 Cartas Equipadas */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-bold text-white/75">Deck Ativo:</span>
          {bonuses.cardBonuses.map((cb) => (
            <span
              key={cb.cardId}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 border border-white/15 px-2 py-0.5 font-semibold"
            >
              {cb.skillEmoji} {cb.cardName} (+{cb.totalPowerPercent}%)
            </span>
          ))}
        </div>
      </div>

      {/* Gaveta Retrátil da Mochila Temporária */}
      {showBackpack && (
        <div className="rounded-2xl border-2 border-amber-500/40 bg-card p-4 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-black text-foreground flex items-center gap-1.5">
              <Backpack className="h-4 w-4 text-amber-500" /> Mochila Temporária da Expedição
            </h3>
            <span className="text-[11px] font-bold text-muted-foreground">
              Extraia ou chegue ao Guardião para salvar 100%
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold">
              🪙 {run.tempCoins} Moedas
            </span>
            <span className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-bold">
              ⚡ {run.tempXp} XP
            </span>
            {DUNGEON_RESOURCE_IDS.map((rId) => {
              const qty = run.tempBackpack[rId] ?? 0;
              if (qty <= 0) return null;
              const m = DUNGEON_RESOURCES[rId];
              return (
                <span key={rId} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${m.badgeClass}`}>
                  {m.emoji} {qty}× {m.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Conteúdo Principal do Andar: Andar Concluído OU Encontro Atual */}
      {isFloorCompleted ? (
        <div className="rounded-3xl border-2 border-emerald-500/50 bg-card p-6 shadow-xl space-y-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-2xl font-black text-foreground">
              Andar {run.currentFloor} Explorado (100%)!
            </h3>
            <p className="text-xs text-muted-foreground">
              Você encontrou a saída deste andar. Escolha entre continuar descendo ou extrair seus
              recursos agora.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              disabled={!nextFloorCheck.ok}
              onClick={() => {
                const res = advanceToNextDungeonFloor({
                  state: dungeonState,
                  level: effectiveLevel,
                  equippedCards,
                });
                if (!res.ok) {
                  setFeedbackMsg(res.error ?? "Não foi possível avançar.");
                  return;
                }
                setStepPhase("narrative");
                setLastLoot(null);
                setFeedbackMsg(null);
                onUpdateState(res.state);
              }}
              className="h-14 rounded-2xl font-display font-black text-sm flex-col gap-0.5"
            >
              <span>Descer para Andar {run.currentFloor + 1} →</span>
              <span className="text-[10px] font-semibold opacity-85">
                Consome 1 de Estamina • Cura +10% HP
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const ext = extractDungeonRun(dungeonState);
                onFloorClearExtract(
                  ext.state,
                  ext.coinsEarned,
                  ext.xpEarned,
                  `Extração Segura após o Andar ${run.currentFloor}`,
                );
              }}
              className="h-14 rounded-2xl border-2 border-emerald-500/50 font-display font-black text-sm text-emerald-600 dark:text-emerald-400 flex-col gap-0.5"
            >
              <span className="flex items-center gap-1.5">
                <LogOut className="h-4 w-4" /> Pergaminho de Retorno (100%)
              </span>
              <span className="text-[10px] font-semibold opacity-85">
                Guarda toda a mochila sem perder nada
              </span>
            </Button>
          </div>

          {!nextFloorCheck.ok && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300 space-y-2">
              <p>{nextFloorCheck.reason}</p>
              {dungeonState.stamina.current === 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onPauseAndExit}
                  className="rounded-xl font-bold"
                >
                  Pausar no Andar {run.currentFloor} e Jogar Outros Jogos
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        currentEncounter && (
          <div className="rounded-3xl border-2 border-border bg-card p-5 sm:p-6 shadow-xl space-y-4">
            {/* Notificação Procedural de Entrada do Evento */}
            {stepPhase === "narrative" && (
              <div className="space-y-4 text-center py-4 animate-in fade-in duration-200">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-3xl border border-primary/30">
                  {encounterIcon(currentEncounter.kind)}
                </div>
                <div className="space-y-1.5 max-w-lg mx-auto">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                    Descoberta no Corredor • Passo {currentEncounter.index + 1}/
                    {run.encounters.length}
                  </span>
                  <h3 className="font-display text-xl font-black text-foreground">
                    {currentEncounter.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentEncounter.narrativeIntro}
                  </p>
                  {run.pendingLootMultiplier && run.pendingLootMultiplier > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-black text-amber-500">
                      <Flame className="h-3 w-3" /> Bônus da Passagem Sombria: {run.pendingLootMultiplier}× Loot!
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => startEncounterInteraction(currentEncounter)}
                  className="h-12 px-8 rounded-2xl font-display font-black text-sm"
                >
                  {currentEncounter.kind === "combat" || currentEncounter.kind === "guardian"
                    ? "Iniciar Combate →"
                    : currentEncounter.kind === "fork"
                      ? "Examinar Passagens →"
                      : "Investigar →"}
                </Button>
              </div>
            )}

            {/* Fase Ativa do Evento */}
            {stepPhase === "active" && (
              <div className="space-y-4">
                {feedbackMsg && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                    {feedbackMsg}
                  </div>
                )}

                {/* COMBATE */}
                {currentEncounter.kind === "combat" && questionData && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-background/70 p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-3xl">{currentMonster?.emoji ?? "👾"}</span>
                        <div>
                          <div className="font-display text-sm font-black text-foreground">
                            {currentMonster?.name ?? currentEncounter.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            HP do Inimigo: <b>{monsterHp}/{monsterMaxHp}</b>
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1 font-mono text-xs font-black text-rose-500">
                        <Clock className="h-3.5 w-3.5" /> {combatTimer}s
                      </span>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${Math.round((monsterHp / monsterMaxHp) * 100)}%` }}
                      />
                    </div>

                    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                        {questionData.categoryLabel}
                      </span>
                      <p className="font-display text-base sm:text-lg font-black text-foreground">
                        {questionData.prompt}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {questionData.options.map((opt, idx) => (
                          <Button
                            key={idx}
                            type="button"
                            variant="outline"
                            onClick={() => handleAnswerQuestion(idx)}
                            className="h-12 rounded-xl text-sm font-extrabold hover:border-primary hover:bg-primary/10"
                          >
                            {opt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* QUESTÃO RÁPIDA OU FONTE */}
                {(currentEncounter.kind === "question" ||
                  currentEncounter.kind === "shrine") &&
                  questionData && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary">
                          <HelpCircle className="h-3 w-3" /> {questionData.categoryLabel}
                        </span>
                        {currentEncounter.kind === "shrine" && (
                          <span className="text-xs font-bold text-emerald-500">
                            Acerte para recuperar +25% HP!
                          </span>
                        )}
                      </div>
                      <p className="font-display text-lg font-black text-foreground">
                        {questionData.prompt}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {questionData.options.map((opt, idx) => (
                          <Button
                            key={idx}
                            type="button"
                            variant="outline"
                            onClick={() => handleAnswerQuestion(idx)}
                            className="h-12 rounded-xl text-sm font-extrabold hover:border-primary hover:bg-primary/10"
                          >
                            {opt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* PUZZLES (SEQUÊNCIA, CIRCUITO LÓGICO, MATRIZ MÁGICA) */}
                {currentEncounter.kind === "puzzle" && puzzleData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-purple-500/15 border border-purple-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-purple-500">
                        Enigma Lógico
                      </span>
                      <span className="text-[11px] text-muted-foreground">{puzzleData.hint}</span>
                    </div>
                    <p className="font-display text-base sm:text-lg font-black text-foreground">
                      {puzzleData.prompt}
                    </p>

                    {puzzleData.kind === "number_sequence" && (
                      <div className="flex flex-wrap items-center justify-center gap-2 py-2">
                        {puzzleData.sequence.map((val, idx) => (
                          <div
                            key={idx}
                            className={`grid h-12 w-12 place-items-center rounded-xl border-2 font-mono text-base font-black ${
                              val === null
                                ? "border-amber-500 bg-amber-500/15 text-amber-500 animate-pulse"
                                : "border-border bg-background"
                            }`}
                          >
                            {val === null ? "?" : val}
                          </div>
                        ))}
                      </div>
                    )}

                    {puzzleData.kind === "logic_circuit" && (
                      <div className="rounded-2xl border bg-background/70 p-4 space-y-2 text-xs sm:text-sm font-mono">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className="rounded-lg border bg-card px-2.5 py-1 font-bold">
                            A = {puzzleData.inputs.A ? "V" : "F"}
                          </span>
                          <span className="rounded-lg bg-primary/15 px-2.5 py-1 font-black text-primary">
                            Porta 1: {puzzleData.gate1}
                          </span>
                          <span className="rounded-lg border bg-card px-2.5 py-1 font-bold">
                            B = {puzzleData.inputs.B ? "V" : "F"}
                          </span>
                        </div>
                        <div className="text-center text-muted-foreground">↓</div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className="rounded-lg border bg-card px-2.5 py-1 font-bold">
                            Saída 1
                          </span>
                          <span className="rounded-lg bg-purple-500/15 px-2.5 py-1 font-black text-purple-500">
                            Porta 2: {puzzleData.gate2}
                          </span>
                          <span className="rounded-lg border bg-card px-2.5 py-1 font-bold">
                            C = {puzzleData.inputs.C ? "V" : "F"}
                          </span>
                          <span>=</span>
                          <span className="rounded-lg border-2 border-amber-500 bg-amber-500/15 px-3 py-1 font-black text-amber-500">
                            ?
                          </span>
                        </div>
                      </div>
                    )}

                    {puzzleData.kind === "magic_grid" && (
                      <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
                        {puzzleData.cells.map((cell, idx) => (
                          <div
                            key={idx}
                            className={`grid h-14 place-items-center rounded-xl border-2 font-mono text-base font-black ${
                              cell === null
                                ? "border-amber-500 bg-amber-500/15 text-amber-500 animate-pulse"
                                : "border-border bg-background"
                            }`}
                          >
                            {cell === null ? "?" : cell}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      {puzzleData.options.map((opt, idx) => (
                        <Button
                          key={idx}
                          type="button"
                          variant="outline"
                          onClick={() => handleAnswerPuzzle(idx)}
                          className="h-12 rounded-xl text-sm font-extrabold hover:border-primary hover:bg-primary/10"
                        >
                          {opt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* MICROINTERAÇÕES TÁTEIS */}
                {currentEncounter.kind === "interaction" && interactionData && (
                  <div className="space-y-4">
                    <span className="rounded-full bg-teal-500/15 border border-teal-500/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-teal-500">
                      Interação Tátil
                    </span>
                    <p className="font-display text-base sm:text-lg font-black text-foreground">
                      {interactionData.prompt}
                    </p>

                    {interactionData.kind === "fit_key" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-background/70 p-4">
                          <div className="space-y-1.5 text-center">
                            <div className="text-[10px] font-black uppercase text-muted-foreground">
                              Molde da Fechadura
                            </div>
                            <div className="flex items-end justify-center gap-2 h-24">
                              {interactionData.targetPins.map((h, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-1">
                                  <div
                                    className="w-7 rounded-t-md bg-amber-500/70 border border-amber-400"
                                    style={{ height: `${h * 18}px` }}
                                  />
                                  <span className="text-[10px] font-mono font-bold">{h}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1.5 text-center">
                            <div className="text-[10px] font-black uppercase text-primary">
                              Sua Chave (Clique para ajustar)
                            </div>
                            <div className="flex items-end justify-center gap-2 h-24">
                              {keyPins.map((h, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    setKeyPins((prev) =>
                                      prev.map((v, i) =>
                                        i === idx
                                          ? (v % interactionData.maxPinHeight) + 1
                                          : v,
                                      ),
                                    )
                                  }
                                  className="flex flex-col items-center gap-1 cursor-pointer group"
                                >
                                  <div
                                    className="w-7 rounded-t-md bg-primary transition-all group-hover:bg-primary/80"
                                    style={{ height: `${h * 18}px` }}
                                  />
                                  <span className="text-[10px] font-mono font-black text-primary">
                                    {h}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            if (validateFitKey(keyPins, interactionData.targetPins)) {
                              completeCurrentEncounter("Fechadura destrancada!");
                            } else {
                              handleDamage(10, "Os pinos não encaixaram na fechadura.");
                            }
                          }}
                          className="w-full h-11 rounded-xl font-bold"
                        >
                          <KeyRound className="h-4 w-4 mr-1.5" /> Girar Chave
                        </Button>
                      </div>
                    )}

                    {interactionData.kind === "align_notes" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-2 rounded-2xl border bg-background/70 p-4">
                          {notesOrder.map((val, idx) => {
                            const selected = selectedNoteIdx === idx;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (selectedNoteIdx === null) {
                                    setSelectedNoteIdx(idx);
                                  } else if (selectedNoteIdx === idx) {
                                    setSelectedNoteIdx(null);
                                  } else {
                                    setNotesOrder((prev) => {
                                      const copy = [...prev];
                                      const tmp = copy[selectedNoteIdx];
                                      copy[selectedNoteIdx] = copy[idx];
                                      copy[idx] = tmp;
                                      return copy;
                                    });
                                    setSelectedNoteIdx(null);
                                  }
                                }}
                                className={`flex flex-col items-center justify-end gap-2 rounded-xl border-2 p-3 h-28 cursor-pointer transition-all ${
                                  selected
                                    ? "border-amber-500 bg-amber-500/20 scale-105"
                                    : "border-border bg-card hover:border-primary"
                                }`}
                              >
                                <div
                                  className="w-full rounded-md bg-gradient-to-t from-sky-500 to-teal-400"
                                  style={{ height: `${Math.min(72, val * 3)}px` }}
                                />
                                <span className="font-mono text-sm font-black">{val}</span>
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            if (validateAlignNotes(notesOrder)) {
                              completeCurrentEncounter("Notas alinhadas em harmonia!");
                            } else {
                              handleDamage(10, "A sequência ainda não está crescente.");
                            }
                          }}
                          className="w-full h-11 rounded-xl font-bold"
                        >
                          Confirmar Ordem Crescente
                        </Button>
                      </div>
                    )}

                    {interactionData.kind === "gear_calibration" && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs font-black text-amber-600 dark:text-amber-300">
                          ⚙️ Regra do Eixo: {interactionData.ruleLabel}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {interactionData.gearOptions.map((teeth, idx) => (
                            <Button
                              key={idx}
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (idx === interactionData.correctIndex) {
                                  completeCurrentEncounter(`Engrenagem ${teeth} calibrada!`);
                                } else {
                                  handleDamage(10, "Engrenagem incompatível travou o mecanismo!");
                                }
                              }}
                              className="h-16 rounded-2xl flex-col gap-0.5 font-mono font-black hover:border-primary"
                            >
                              <span className="text-lg">⚙️</span>
                              <span className="text-xs">{teeth} dentes</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {interactionData.kind === "trap_tiles" && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-center text-muted-foreground">
                          {trapPreviewing
                            ? "👀 Memorize os 3 ladrilhos vermelhos!"
                            : `Clique em 3 ladrilhos seguros (${trapPicked.length}/3)`}
                        </div>
                        <div className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
                          {Array.from({ length: 9 }, (_, idx) => {
                            const isTrap = interactionData.trapIndices.includes(idx);
                            const isPickedSafe = trapPicked.includes(idx);
                            const isBlownTrap = trapHitIndex === idx;
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={trapPreviewing || isPickedSafe}
                                onClick={() => {
                                  if (isTrap) {
                                    setTrapHitIndex(idx);
                                    handleDamage(14, "Você pisou em uma placa de pressão!");
                                    return;
                                  }
                                  const nextPicked = Array.from(new Set([...trapPicked, idx]));
                                  setTrapPicked(nextPicked);
                                  if (
                                    validateTrapTiles(
                                      nextPicked,
                                      interactionData.trapIndices,
                                      interactionData.safePickGoal,
                                    )
                                  ) {
                                    completeCurrentEncounter("Armadilhas contornadas!");
                                  }
                                }}
                                className={`h-14 rounded-xl border-2 text-sm font-black transition-all ${
                                  (trapPreviewing && isTrap) || isBlownTrap
                                    ? "border-rose-500 bg-rose-500/30 text-rose-200"
                                    : isPickedSafe
                                      ? "border-emerald-500 bg-emerald-500/25 text-emerald-500"
                                      : "border-border bg-background hover:border-primary cursor-pointer"
                                }`}
                              >
                                {(trapPreviewing && isTrap) || isBlownTrap
                                  ? "⚠️"
                                  : isPickedSafe
                                    ? "✓"
                                    : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {interactionData.kind === "clean_crystal" && (
                      <div className="space-y-3">
                        <div className="relative mx-auto h-44 w-full max-w-sm rounded-2xl border-2 border-purple-500/40 bg-gradient-to-br from-slate-900 via-purple-950/70 to-slate-900 overflow-hidden grid place-items-center">
                          <div className="text-center pointer-events-none select-none">
                            <span className="text-4xl">
                              {DUNGEON_RESOURCES[interactionData.rewardResourceId].emoji}
                            </span>
                            <p className="text-[11px] font-bold text-purple-200 mt-1">
                              Limpe os pontos brilhantes ({cleanedSpots.length}/
                              {interactionData.dustSpots.length})
                            </p>
                          </div>
                          {interactionData.dustSpots.map((spot) => {
                            if (cleanedSpots.includes(spot.id)) return null;
                            return (
                              <button
                                key={spot.id}
                                type="button"
                                onClick={() => {
                                  playTone(720, 0.08, "sine", 0.06);
                                  const next = [...cleanedSpots, spot.id];
                                  setCleanedSpots(next);
                                  if (next.length >= interactionData.dustSpots.length) {
                                    const resName =
                                      DUNGEON_RESOURCES[interactionData.rewardResourceId].name;
                                    completeCurrentEncounter(
                                      `Extraiu +1 ${resName}!`,
                                      { [interactionData.rewardResourceId]: 1 },
                                    );
                                  }
                                }}
                                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                                className="absolute -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full border-2 border-amber-300 bg-amber-500/80 text-white shadow-lg animate-pulse cursor-pointer hover:scale-110"
                              >
                                <Sparkles className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* BIFURCAÇÃO DE CORREDOR */}
                {currentEncounter.kind === "fork" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        const heal = Math.min(8, run.maxHp - run.hp);
                        completeCurrentEncounter(
                          heal > 0
                            ? `Passagem Segura (+${heal} HP)`
                            : "Passagem Segura escolhida",
                          undefined,
                          1,
                          { healAmount: heal },
                        );
                      }}
                      className="rounded-2xl border-2 border-sky-500/50 bg-sky-500/10 p-4 text-left hover:bg-sky-500/20 transition-all cursor-pointer space-y-1"
                    >
                      <div className="font-display text-sm font-black text-sky-600 dark:text-sky-300">
                        🕯️ Passagem Iluminada (Segura)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Caminho tranquilo que recupera até +8 HP sem armadilhas.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        completeCurrentEncounter(
                          "Passagem Sombria (Próximo evento 2× Loot!)",
                          undefined,
                          1,
                          { nextPendingMult: 2 },
                        );
                      }}
                      className="rounded-2xl border-2 border-purple-500/50 bg-purple-500/10 p-4 text-left hover:bg-purple-500/20 transition-all cursor-pointer space-y-1"
                    >
                      <div className="font-display text-sm font-black text-purple-600 dark:text-purple-300">
                        🌑 Passagem Sombria (2× Recompensas)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O próximo desafio do andar concederá o dobro de recursos, moedas e XP!
                      </p>
                    </button>
                  </div>
                )}

                {/* GUARDIÃO DO BIOMA (3 FASES) */}
                {currentEncounter.kind === "guardian" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-red-500/40 bg-red-500/10 p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-3xl">{currentMonster?.emoji ?? "👑"}</span>
                        <div>
                          <div className="font-display text-sm font-black text-foreground">
                            {currentMonster?.name ?? currentEncounter.title}
                          </div>
                          <div className="text-[11px] font-bold text-red-500">
                            Fase {bossPhase} de 3 •{" "}
                            {bossPhase === 1
                              ? `Quebre o Escudo (${bossPhase1Remaining} restantes)`
                              : bossPhase === 2
                                ? "Destrave o Selo Rúnico"
                                : "Golpe Final de Lógica"}
                          </div>
                        </div>
                      </div>
                      {bossPhase === 1 && (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1 font-mono text-xs font-black text-rose-500">
                          <Clock className="h-3.5 w-3.5" /> {combatTimer}s
                        </span>
                      )}
                    </div>

                    {bossPhase === 1 && questionData && (
                      <div className="space-y-3">
                        <p className="font-display text-lg font-black text-foreground">
                          {questionData.prompt}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {questionData.options.map((opt, idx) => (
                            <Button
                              key={idx}
                              type="button"
                              variant="outline"
                              onClick={() => handleAnswerQuestion(idx)}
                              className="h-12 rounded-xl text-sm font-extrabold"
                            >
                              {opt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {bossPhase === 2 && interactionData?.kind === "fit_key" && (
                      <div className="space-y-4">
                        <p className="text-sm font-bold text-foreground">
                          Alinhe os pinos da chave para desativar o núcleo do Guardião:
                        </p>
                        <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-background/70 p-4">
                          <div className="flex items-end justify-center gap-2 h-24">
                            {interactionData.targetPins.map((h, idx) => (
                              <div key={idx} className="flex flex-col items-center gap-1">
                                <div
                                  className="w-7 rounded-t-md bg-amber-500/70"
                                  style={{ height: `${h * 18}px` }}
                                />
                                <span className="text-[10px] font-mono">{h}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-end justify-center gap-2 h-24">
                            {keyPins.map((h, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  setKeyPins((prev) =>
                                    prev.map((v, i) =>
                                      i === idx ? (v % interactionData.maxPinHeight) + 1 : v,
                                    ),
                                  )
                                }
                                className="flex flex-col items-center gap-1 cursor-pointer"
                              >
                                <div
                                  className="w-7 rounded-t-md bg-primary"
                                  style={{ height: `${h * 18}px` }}
                                />
                                <span className="text-[10px] font-mono font-black text-primary">
                                  {h}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            if (validateFitKey(keyPins, interactionData.targetPins)) {
                              playTone(700, 0.14, "triangle", 0.08);
                              setBossPhase(3);
                              setFeedbackMsg("⚡ Selo quebrado! Resolva o enigma final para derrotar o Guardião!");
                              setPuzzleData(
                                generateDungeonPuzzle(run.currentFloor, "logic_circuit"),
                              );
                            } else {
                              handleDamage(15, "O selo do Guardião repeliu a chave!");
                            }
                          }}
                          className="w-full h-11 rounded-xl font-bold"
                        >
                          <Swords className="h-4 w-4 mr-1.5" /> Quebrar Selo do Guardião
                        </Button>
                      </div>
                    )}

                    {bossPhase === 3 && puzzleData && puzzleData.kind === "logic_circuit" && (
                      <div className="space-y-3">
                        <p className="font-display text-base font-black text-foreground">
                          {puzzleData.prompt}
                        </p>
                        <div className="rounded-2xl border bg-background/70 p-4 space-y-2 text-xs font-mono text-center">
                          <div>
                            A={puzzleData.inputs.A ? "V" : "F"} [{puzzleData.gate1}] B=
                            {puzzleData.inputs.B ? "V" : "F"} → [{puzzleData.gate2}] C=
                            {puzzleData.inputs.C ? "V" : "F"} = ?
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {puzzleData.options.map((opt, idx) => (
                            <Button
                              key={idx}
                              type="button"
                              variant="outline"
                              onClick={() => handleAnswerPuzzle(idx)}
                              className="h-12 rounded-xl text-sm font-extrabold"
                            >
                              {opt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Resultado do Evento + Loot */}
            {stepPhase === "result" && lastLoot && (
              <div className="space-y-4 text-center py-3 animate-in fade-in duration-200">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-500">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-display text-lg font-black text-foreground">
                    Evento Concluído!
                  </h4>
                  {lastLoot.note && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {lastLoot.note}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <span className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-bold">
                    🪙 +{lastLoot.coins} Moedas
                  </span>
                  <span className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-bold">
                    ⚡ +{lastLoot.xp} XP
                  </span>
                  {DUNGEON_RESOURCE_IDS.map((rId) => {
                    const qty = lastLoot.resources[rId] ?? 0;
                    if (qty <= 0) return null;
                    const meta = DUNGEON_RESOURCES[rId];
                    return (
                      <span
                        key={rId}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}
                      >
                        {meta.emoji} +{qty} {meta.name}
                      </span>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    setLastLoot(null);
                    setStepPhase("narrative");
                  }}
                  className="h-11 px-6 rounded-2xl font-display font-black text-sm"
                >
                  Continuar Exploração <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            )}
          </div>
        )
      )}

      {/* Diário de Exploração Retrátil */}
      <div className="rounded-2xl border bg-card/70 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <span>📜 Diário de Exploração ({run.narrativeLog.length} registros)</span>
          <span>{showLog ? "Ocultar" : "Ver histórico"}</span>
        </button>
        {showLog && (
          <div className="mt-2 max-h-36 overflow-y-auto space-y-1 border-t pt-2 text-xs text-muted-foreground">
            {run.narrativeLog.slice(-12).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
