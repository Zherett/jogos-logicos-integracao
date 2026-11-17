import { Backpack, Lock, Sparkles, Gift, Palette, Ticket } from "lucide-react";

const INVENTORY_SLOTS_COUNT = 12;

export function PlayerItemsInventory() {
  const slots = Array.from({ length: INVENTORY_SLOTS_COUNT }, (_, idx) => idx + 1);

  return (
    <div className="space-y-4">
      {/* Banner de Prévia do Inventário */}
      <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Backpack className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-sm sm:text-base font-black text-foreground">
                Mochila de Colecionáveis &amp; Itens
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Seus cosméticos de robô, baús fechados e passes especiais ficarão armazenados aqui.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3 w-3" /> Prévia ADM • Em Estruturação
          </span>
        </div>

        {/* Categorias futuras */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-bold text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
            <Palette className="h-3 w-3 text-primary" /> Visores &amp; Pinturas
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
            <Gift className="h-3 w-3 text-emerald-500" /> Baús Semanais
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-background/70 border px-2 py-0.5">
            <Ticket className="h-3 w-3 text-amber-500" /> Passes &amp; Boosters
          </span>
        </div>
      </div>

      {/* Grade de Slots de Inventário */}
      <div className="rounded-3xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-foreground">Espaços do Inventário</span>
          <span className="font-mono text-muted-foreground">0 / {INVENTORY_SLOTS_COUNT} ocupados</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {slots.map((slotNum) => (
            <div
              key={slotNum}
              title={`Slot #${slotNum} — Vazio (Reservado para itens futuros)`}
              className="aspect-square flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground/60 transition-colors hover:border-primary/40 hover:bg-secondary/40 select-none"
            >
              <Lock className="h-4 w-4 opacity-50" />
              <span className="font-mono text-[10px] font-bold opacity-60">Slot {slotNum}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-1">
          🔒 Esta aba é privada e visível apenas para você. Outros jogadores não podem acessar seu inventário.
        </p>
      </div>
    </div>
  );
}
