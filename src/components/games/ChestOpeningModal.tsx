import { useEffect, useRef, useState } from "react";
import { Coins, Gift, HelpCircle, Package, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CardPackDefinition } from "@/lib/cards-catalog";
import {
  DEFAULT_CHEST_OPEN_DURATION_MS,
  type ChestDefinition,
  type ChestOpenOutcome,
} from "@/lib/chests-catalog";
import { playChestLidOpen, playChestReveal, playChestUnlock } from "@/lib/sound";
import { ChestVector } from "./ChestVector";

interface ChestOpeningModalProps {
  chest: ChestDefinition | null;
  outcome: ChestOpenOutcome | null;
  packsCatalog?: CardPackDefinition[];
  isSimulation?: boolean;
  onClose: () => void;
}

type OpeningStage = "unlocking" | "opening" | "revealed";

export function ChestOpeningModal({
  chest,
  outcome,
  packsCatalog = [],
  isSimulation = false,
  onClose,
}: ChestOpeningModalProps) {
  const [stage, setStage] = useState<OpeningStage>("unlocking");
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!chest || !outcome) return;

    setStage("unlocking");
    setProgress(0);

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
        playChestUnlock();
        playChestLidOpen();
        setStage("opening");
        timerRef.current = window.setTimeout(() => {
          playChestReveal();
          setStage("revealed");
        }, 780);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [chest, outcome]);

  if (!chest || !outcome) return null;

  return (
    <Dialog open={Boolean(chest && outcome)} onOpenChange={(v) => !v && onClose()}>
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

        {/* Estágios 1 e 2: Baú chacoalhando + barra carregando -> Tampa sobe + bolinha '?' emerge */}
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

        {/* Estágio 3: Bolinha se expande para o modal de premiação */}
        {stage === "revealed" && (
          <div className="space-y-4 py-2 animate-in zoom-in-90 duration-300">
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" /> Recompensas Recebidas!
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border bg-secondary/40 p-3">
                <Coins className="mx-auto mb-1 h-4 w-4 text-primary" />
                <div className="text-[10px] font-bold text-muted-foreground">Pontos</div>
                <div className="font-display text-lg font-black text-primary">
                  +{outcome.points}
                </div>
              </div>
              <div className="rounded-2xl border bg-secondary/40 p-3">
                <Zap className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                <div className="text-[10px] font-bold text-muted-foreground">XP</div>
                <div className="font-display text-lg font-black text-emerald-500">
                  +{outcome.xp}
                </div>
              </div>
              <div className="rounded-2xl border bg-secondary/40 p-3">
                <Coins className="mx-auto mb-1 h-4 w-4 text-amber-500" />
                <div className="text-[10px] font-bold text-muted-foreground">Moedas</div>
                <div className="font-display text-lg font-black text-amber-500">
                  +{outcome.coins}
                </div>
              </div>
            </div>

            {outcome.packs.length > 0 && (
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs font-bold text-primary flex items-center justify-center gap-2">
                <Package className="h-4 w-4 shrink-0" />
                <span>
                  {outcome.packs
                    .map((pk) => {
                      const pName =
                        packsCatalog.find((p) => p.id === pk.packId)?.name ?? pk.packId;
                      return `${pk.quantity}x ${pName}`;
                    })
                    .join(" • ")}
                </span>
              </div>
            )}

            <Button
              type="button"
              size="lg"
              onClick={onClose}
              className="w-full rounded-2xl font-display text-base font-extrabold"
            >
              OK
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
