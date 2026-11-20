import { useEffect, useState } from "react";
import { Sparkles, Trophy, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MedalIcon } from "./MedalIcon";
import { RARITY_INFO, MEDAL_XP_REWARDS, type MedalDefinition } from "@/lib/medals-catalog";
import { playSound } from "@/lib/sound";

export function MedalUnlockNotification() {
  const [queue, setQueue] = useState<MedalDefinition[]>([]);
  const [current, setCurrent] = useState<MedalDefinition | null>(null);

  useEffect(() => {
    function handleMedalUnlocked(e: Event) {
      const custom = e as CustomEvent<{ medals: MedalDefinition[] }>;
      if (custom.detail?.medals?.length) {
        setQueue((prev) => [...prev, ...custom.detail.medals]);
      }
    }

    window.addEventListener("desafios:medal-unlocked", handleMedalUnlocked);
    return () => window.removeEventListener("desafios:medal-unlocked", handleMedalUnlocked);
  }, []);

  useEffect(() => {
    if (!current && queue.length > 0) {
      const next = queue[0];
      setCurrent(next);
      setQueue((prev) => prev.slice(1));
      playSound("victory");
    }
  }, [current, queue]);

  if (!current) return null;

  const rarity = RARITY_INFO[current.rarity];

  return (
    <Dialog open={Boolean(current)} onOpenChange={() => setCurrent(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-2 sm:max-w-md p-6 text-center animate-in zoom-in-95 duration-200">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 font-display text-xl font-extrabold text-primary">
            <Sparkles className="h-5 w-5 text-accent animate-pulse" /> NOVA MEDALHA DESBLOQUEADA!
          </DialogTitle>
        </DialogHeader>

        <div className="my-6 flex flex-col items-center">
          <div
            className={`relative grid h-24 w-24 place-items-center rounded-3xl border-2 bg-gradient-to-br from-card to-secondary/80 ${rarity.neonBorderClass} transition-transform duration-300 hover:scale-105`}
          >
            <div className={rarity.textColor}>
              <MedalIcon name={current.iconName} className="h-12 w-12" />
            </div>
            <span
              className={`absolute -bottom-3.5 z-10 rounded-full border-2 px-3.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-sm ${rarity.badgeBgClass}`}
            >
              {rarity.label}
            </span>
          </div>

          <h3 className="mt-6 font-display text-2xl font-black text-foreground">{current.title}</h3>
          
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-xs font-black text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Recompensa: +{MEDAL_XP_REWARDS[current.rarity]} XP adicionados ao seu perfil!
          </div>

          <p className="mt-2.5 max-w-xs text-xs font-medium text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="lg"
            className="w-full rounded-2xl font-display font-extrabold shadow-lg"
            onClick={() => setCurrent(null)}
          >
            <Trophy className="mr-2 h-4 w-4" /> Continuar Jogando
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
