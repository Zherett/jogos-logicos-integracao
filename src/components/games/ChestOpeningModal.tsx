import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Coins, FastForward, Gift, HelpCircle, Package, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CardPackDefinition } from "@/lib/cards-catalog";
import {
  DEFAULT_CHEST_OPEN_DURATION_MS,
  type ChestDefinition,
  type ChestOpenOutcome,
  type ChestShape,
} from "@/lib/chests-catalog";
import {
  playChestLidOpen,
  playChestLockpickTick,
  playChestReveal,
  playChestRewardCoins,
  playChestRewardPack,
  playChestRewardPoints,
  playChestRewardXp,
  playChestUnlock,
} from "@/lib/sound";
import { ChestVector } from "./ChestVector";
import { PackArtwork } from "./PackOpeningModal";

interface ChestOpeningModalProps {
  chest: ChestDefinition | null;
  outcome: ChestOpenOutcome | null;
  packsCatalog?: CardPackDefinition[];
  isSimulation?: boolean;
  onClose: () => void;
}

type OpeningStage = "unlocking" | "opening" | "revealed";
type RewardStepKind = "points" | "xp" | "coins" | "cosmetics" | `pack:${number}`;
type RewardStepPhase = "mystery" | "reveal" | "flying";

export function ChestOpeningModal({
  chest,
  outcome,
  packsCatalog = [],
  isSimulation = false,
  onClose,
}: ChestOpeningModalProps) {
  const [stage, setStage] = useState<OpeningStage>("unlocking");
  const [progress, setProgress] = useState(0);
  const [shakeVariant, setShakeVariant] = useState<1 | 2 | 3>(1);

  const [activeStep, setActiveStep] = useState<RewardStepKind | null>(null);
  const [stepPhase, setStepPhase] = useState<RewardStepPhase>("mystery");
  const [settledSteps, setSettledSteps] = useState<Record<string, boolean>>({});
  const [flyTransform, setFlyTransform] = useState<{
    dx: number;
    dy: number;
    scaleX: number;
    scaleY: number;
  }>({ dx: 0, dy: 0, scaleX: 1, scaleY: 1 });

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const lockpickIntervalRef = useRef<number | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<"points" | "xp" | "coins" | "packs", HTMLDivElement | null>>({
    points: null,
    xp: null,
    coins: null,
    packs: null,
  });

  // Agrupa pacotes distintos por packId (ex.: 2 tipos diferentes com 5 unidades cada -> 2 animações)
  const distinctPacks = useMemo(() => {
    if (!outcome?.packs?.length) return [];
    const grouped = new Map<string, number>();
    for (const pk of outcome.packs) {
      if (pk.quantity > 0) {
        grouped.set(pk.packId, (grouped.get(pk.packId) ?? 0) + pk.quantity);
      }
    }
    return Array.from(grouped.entries()).map(([packId, quantity]) => ({
      packId,
      quantity,
      packDef: packsCatalog.find((p) => p.id === packId),
    }));
  }, [outcome, packsCatalog]);

  const hasCosmetics = Boolean(outcome?.cosmetics?.length);
  const hasExtras = distinctPacks.length > 0 || hasCosmetics;

  const rewardQueue = useMemo<RewardStepKind[]>(() => {
    const q: RewardStepKind[] = ["points", "xp", "coins"];
    distinctPacks.forEach((_, idx) => q.push(`pack:${idx}`));
    if (hasCosmetics) q.push("cosmetics");
    return q;
  }, [distinctPacks, hasCosmetics]);

  const allSettled = useMemo(
    () => rewardQueue.every((k) => Boolean(settledSteps[k])),
    [rewardQueue, settledSteps],
  );

  function clearTimers() {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }

  useEffect(() => {
    if (!chest || !outcome) return;

    clearTimers();
    if (lockpickIntervalRef.current !== null) {
      window.clearInterval(lockpickIntervalRef.current);
      lockpickIntervalRef.current = null;
    }

    setStage("unlocking");
    setProgress(0);
    setShakeVariant(1);
    setActiveStep(null);
    setStepPhase("mystery");
    setSettledSteps({});
    setFlyTransform({ dx: 0, dy: 0, scaleX: 1, scaleY: 1 });

    const resolvedShape: ChestShape =
      chest.shape === "largo" || chest.shape === "compacto" ? chest.shape : "padrao";
    let currentVariant: 1 | 2 | 3 = 1;
    playChestLockpickTick(resolvedShape, currentVariant);

    lockpickIntervalRef.current = window.setInterval(() => {
      currentVariant = currentVariant === 1 ? 2 : currentVariant === 2 ? 3 : 1;
      setShakeVariant(currentVariant);
      playChestLockpickTick(resolvedShape, currentVariant);
    }, 340);

    const duration = Math.min(
      6000,
      Math.max(800, Number(chest.openDurationMs) || DEFAULT_CHEST_OPEN_DURATION_MS),
    );
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);

      if (pct < 100) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        if (lockpickIntervalRef.current !== null) {
          window.clearInterval(lockpickIntervalRef.current);
          lockpickIntervalRef.current = null;
        }
        playChestUnlock();
        playChestLidOpen();
        setStage("opening");
        schedule(() => {
          playChestReveal();
          setStage("revealed");
        }, 780);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (lockpickIntervalRef.current !== null) {
        window.clearInterval(lockpickIntervalRef.current);
        lockpickIntervalRef.current = null;
      }
      clearTimers();
    };
  }, [chest, outcome]);

  // Orquestra a revelação 1 a 1 quando o estágio chega em "revealed"
  useEffect(() => {
    if (stage !== "revealed" || !outcome) return;

    clearTimers();
    let cancelled = false;

    const runStep = (idx: number) => {
      if (cancelled) return;
      if (idx >= rewardQueue.length) {
        setActiveStep(null);
        return;
      }
      const kind = rewardQueue[idx];
      const isPackStep = kind.startsWith("pack:");
      setFlyTransform({ dx: 0, dy: 0, scaleX: 1, scaleY: 1 });
      setActiveStep(kind);
      setStepPhase("mystery");

      schedule(() => {
        if (cancelled) return;
        setStepPhase("reveal");
        if (kind === "points") playChestRewardPoints();
        else if (kind === "xp") playChestRewardXp();
        else if (kind === "coins") playChestRewardCoins();
        else playChestRewardPack();

        const revealDurationMs = isPackStep ? 900 : 680;
        const flyDurationMs = isPackStep ? 520 : 460;

        schedule(() => {
          if (cancelled) return;
          setStepPhase("flying");

          schedule(() => {
            if (cancelled) return;
            setSettledSteps((prev) => ({ ...prev, [kind]: true }));
            runStep(idx + 1);
          }, flyDurationMs);
        }, revealDurationMs);
      }, 220);
    };

    runStep(0);

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [stage, outcome, rewardQueue]);

  // Calcula o deslocamento exato do card em destaque até o seu slot de destino no layout
  useLayoutEffect(() => {
    if (stage !== "revealed" || !activeStep || stepPhase !== "flying") return;
    const spotEl = spotlightRef.current;
    const slotKey: "points" | "xp" | "coins" | "packs" =
      activeStep.startsWith("pack:") || activeStep === "cosmetics"
        ? "packs"
        : (activeStep as "points" | "xp" | "coins");
    const targetEl = slotRefs.current[slotKey];
    if (!spotEl || !targetEl) return;

    const spotRect = spotEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const spotCx = spotRect.left + spotRect.width / 2;
    const spotCy = spotRect.top + spotRect.height / 2;
    const targetCx = targetRect.left + targetRect.width / 2;
    const targetCy = targetRect.top + targetRect.height / 2;

    const dx = targetCx - spotCx;
    const dy = targetCy - spotCy;
    const isPackStep = activeStep.startsWith("pack:");
    const scaleX = isPackStep
      ? 0.25
      : spotRect.width > 0
        ? Math.max(0.35, targetRect.width / spotRect.width)
        : 0.7;
    const scaleY = isPackStep
      ? 0.25
      : spotRect.height > 0
        ? Math.max(0.35, targetRect.height / spotRect.height)
        : 0.7;

    setFlyTransform({ dx, dy, scaleX, scaleY });
  }, [stage, activeStep, stepPhase]);

  function handleSkipSequence() {
    clearTimers();
    setActiveStep(null);
    const nextSettled: Record<string, boolean> = {};
    for (const k of rewardQueue) {
      nextSettled[k] = true;
    }
    setSettledSteps(nextSettled);
  }

  if (!chest || !outcome) return null;

  const settledPacksText = distinctPacks
    .filter((_, idx) => settledSteps[`pack:${idx}`])
    .map((pk) => `${pk.quantity}x ${pk.packDef?.name ?? pk.packId}`)
    .join(" • ");

  const extrasLabel = [
    settledPacksText,
    settledSteps.cosmetics && outcome.cosmetics?.length
      ? `${outcome.cosmetics.length} cosmético(s) desbloqueado(s)`
      : "",
  ]
    .filter(Boolean)
    .join(" • ");

  const anyExtraSettled = Boolean(extrasLabel);
  const activePackIdx =
    activeStep && activeStep.startsWith("pack:") ? Number(activeStep.slice(5)) : -1;
  const activePackItem = activePackIdx >= 0 ? distinctPacks[activePackIdx] : undefined;

  return (
    <Dialog
      open={Boolean(chest && outcome)}
      onOpenChange={(v) => {
        if (!v && stage === "revealed" && allSettled) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md p-6 text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 font-display text-xl font-black">
            <Gift className="h-5 w-5 text-amber-500" />
            <span>{chest.name}</span>
            {isSimulation && (
              <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-300">
                Prévia ADM
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Estágios 1 e 2: Baú chacoalhando (3 variações por tamanho) + som de chave -> Tampa sobe + bolinha '?' */}
        {stage !== "revealed" && (
          <div className="py-6 flex flex-col items-center justify-center space-y-6">
            <div className="relative flex items-center justify-center pt-6">
              {stage === "opening" && (
                <div className="absolute -top-6 z-20 animate-chest-orb-rise">
                  <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-amber-300 bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 shadow-[0_0_26px_rgba(251,191,36,0.85)]">
                    <HelpCircle className="h-8 w-8 font-black" />
                  </div>
                </div>
              )}

              <ChestVector
                primaryColor={chest.primaryColor}
                metalColor={chest.metalColor}
                shape={chest.shape}
                isShaking={stage === "unlocking"}
                shakeVariant={shakeVariant}
                isOpen={stage === "opening"}
                size="lg"
              />
            </div>

            <div className="w-full max-w-xs space-y-1.5">
              <div className="h-3 w-full overflow-hidden rounded-full border bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-muted-foreground">
                {stage === "unlocking"
                  ? "Destrancando o baú..."
                  : "Abrindo recompensas..."}
              </p>
            </div>
          </div>
        )}

        {/* Estágio 3: Revelação 1 a 1 com deslize para a posição final */}
        {stage === "revealed" && (
          <div className="relative space-y-4 py-2">
            <div
              className={`mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400 transition-all duration-300 ${
                allSettled ? "opacity-100 scale-100" : "opacity-60 scale-95"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {allSettled ? "Recompensas Recebidas!" : "Revelando Recompensas..."}
            </div>

            {/* Grade definitiva de Pontos, XP e Moedas (slots ocultos até pousarem) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div
                ref={(el) => {
                  slotRefs.current.points = el;
                }}
                className={`rounded-2xl border bg-secondary/40 p-3 transition-all duration-300 ${
                  settledSteps.points
                    ? "opacity-100 scale-100"
                    : "opacity-15 scale-95 border-dashed"
                }`}
              >
                <Coins className="mx-auto mb-1 h-4 w-4 text-primary" />
                <div className="text-[10px] font-bold text-muted-foreground">Pontos</div>
                <div className="font-display text-lg font-black text-primary">
                  {settledSteps.points ? `+${outcome.points}` : "?"}
                </div>
              </div>

              <div
                ref={(el) => {
                  slotRefs.current.xp = el;
                }}
                className={`rounded-2xl border bg-secondary/40 p-3 transition-all duration-300 ${
                  settledSteps.xp
                    ? "opacity-100 scale-100"
                    : "opacity-15 scale-95 border-dashed"
                }`}
              >
                <Zap className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                <div className="text-[10px] font-bold text-muted-foreground">XP</div>
                <div className="font-display text-lg font-black text-emerald-500">
                  {settledSteps.xp ? `+${outcome.xp}` : "?"}
                </div>
              </div>

              <div
                ref={(el) => {
                  slotRefs.current.coins = el;
                }}
                className={`rounded-2xl border bg-secondary/40 p-3 transition-all duration-300 ${
                  settledSteps.coins
                    ? "opacity-100 scale-100"
                    : "opacity-15 scale-95 border-dashed"
                }`}
              >
                <Coins className="mx-auto mb-1 h-4 w-4 text-amber-500" />
                <div className="text-[10px] font-bold text-muted-foreground">Moedas</div>
                <div className="font-display text-lg font-black text-amber-500">
                  {settledSteps.coins ? `+${outcome.coins}` : "?"}
                </div>
              </div>
            </div>

            {/* Espaço inferior reservado para Pacotes / Itens (quando houver) */}
            {hasExtras && (
              <div
                ref={(el) => {
                  slotRefs.current.packs = el;
                }}
                className={`rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs font-bold text-primary flex items-center justify-center gap-2 transition-all duration-300 ${
                  anyExtraSettled
                    ? "opacity-100 scale-100"
                    : "opacity-15 scale-95 border-dashed"
                }`}
              >
                <Package className="h-4 w-4 shrink-0" />
                <span>{anyExtraSettled ? extrasLabel : "Item bônus..."}</span>
              </div>
            )}

            {/* Spotlight central: aparece, revela o valor com som e desliza para o slot de destino */}
            {activeStep && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                {activePackItem ? (
                  <div
                    ref={spotlightRef}
                    className="perspective-1000 flex flex-col items-center justify-center"
                    style={{
                      transform:
                        stepPhase === "flying"
                          ? `translate(${flyTransform.dx}px, ${flyTransform.dy}px) scale(${flyTransform.scaleX}, ${flyTransform.scaleY})`
                          : stepPhase === "mystery"
                            ? "translate(0px, 0px) scale(0.85)"
                            : "translate(0px, 0px) scale(1.06)",
                      transition:
                        stepPhase === "flying"
                          ? "transform 500ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease"
                          : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
                      opacity: stepPhase === "flying" ? 0 : stepPhase === "mystery" ? 0.75 : 1,
                    }}
                  >
                    <div
                      className="preserve-3d transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        transform:
                          stepPhase === "mystery" ? "rotateY(0deg)" : "rotateY(360deg)",
                      }}
                    >
                      <PackArtwork
                        pack={{
                          name: activePackItem.packDef?.name ?? activePackItem.packId,
                          colorTheme: activePackItem.packDef?.colorTheme,
                          icon: activePackItem.packDef?.icon,
                          isFoil: activePackItem.packDef?.isFoil,
                        }}
                        quantity={activePackItem.quantity}
                        className="w-44 sm:w-48"
                        bodyHeightClass="h-56 sm:h-60"
                        iconSizeClass="h-10 w-10"
                        iconBoxSizeClass="h-20 w-20"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    ref={spotlightRef}
                    style={{
                      transform:
                        stepPhase === "flying"
                          ? `translate(${flyTransform.dx}px, ${flyTransform.dy}px) scale(${flyTransform.scaleX}, ${flyTransform.scaleY})`
                          : "translate(0px, 0px) scale(1)",
                      transition:
                        stepPhase === "flying"
                          ? "transform 440ms cubic-bezier(0.22, 1, 0.36, 1), opacity 440ms ease"
                          : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                      opacity: stepPhase === "flying" ? 0.25 : 1,
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-3xl border-2 px-6 py-5 shadow-2xl backdrop-blur-md ${
                      activeStep === "points"
                        ? "w-44 border-primary/60 bg-card/95 shadow-primary/25"
                        : activeStep === "xp"
                          ? "w-44 border-emerald-500/60 bg-card/95 shadow-emerald-500/25"
                          : activeStep === "coins"
                            ? "w-44 border-amber-500/60 bg-card/95 shadow-amber-500/25"
                            : "w-64 border-primary/70 bg-card/95 shadow-primary/30"
                    }`}
                  >
                    {activeStep === "points" && (
                      <>
                        <Coins className="h-7 w-7 text-primary" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                          Pontos
                        </span>
                        <span
                          className={`font-display text-3xl font-black text-primary transition-all duration-200 ${
                            stepPhase === "mystery" ? "scale-75 opacity-60" : "scale-110 opacity-100"
                          }`}
                        >
                          {stepPhase === "mystery" ? "?" : `+${outcome.points}`}
                        </span>
                      </>
                    )}

                    {activeStep === "xp" && (
                      <>
                        <Zap className="h-7 w-7 text-emerald-500" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                          XP
                        </span>
                        <span
                          className={`font-display text-3xl font-black text-emerald-500 transition-all duration-200 ${
                            stepPhase === "mystery" ? "scale-75 opacity-60" : "scale-110 opacity-100"
                          }`}
                        >
                          {stepPhase === "mystery" ? "?" : `+${outcome.xp}`}
                        </span>
                      </>
                    )}

                    {activeStep === "coins" && (
                      <>
                        <Coins className="h-7 w-7 text-amber-500" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                          Moedas
                        </span>
                        <span
                          className={`font-display text-3xl font-black text-amber-500 transition-all duration-200 ${
                            stepPhase === "mystery" ? "scale-75 opacity-60" : "scale-110 opacity-100"
                          }`}
                        >
                          {stepPhase === "mystery" ? "?" : `+${outcome.coins}`}
                        </span>
                      </>
                    )}

                    {activeStep === "cosmetics" && (
                      <>
                        <Sparkles className="h-7 w-7 text-primary" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                          Cosméticos
                        </span>
                        <span
                          className={`font-display text-sm font-black text-primary transition-all duration-200 ${
                            stepPhase === "mystery" ? "scale-75 opacity-60" : "scale-105 opacity-100"
                          }`}
                        >
                          {stepPhase === "mystery"
                            ? "?"
                            : `${outcome.cosmetics?.length ?? 0} cosmético(s) desbloqueado(s)`}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Button
                type="button"
                size="lg"
                disabled={!allSettled}
                onClick={onClose}
                className={`w-full rounded-2xl font-display text-base font-extrabold transition-opacity duration-300 ${
                  allSettled ? "opacity-100" : "opacity-40"
                }`}
              >
                OK
              </Button>
              {!allSettled && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSkipSequence}
                    className="h-7 rounded-xl px-3 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    <FastForward className="mr-1 h-3 w-3" /> Pular animação
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
