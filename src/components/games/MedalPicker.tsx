import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  filterMedalsByQuery,
  RARITY_INFO,
  type MedalDefinition,
} from "@/lib/medals-catalog";

interface MedalPickerProps {
  medals: MedalDefinition[];
  value: string;
  onChange: (medalId: string) => void;
  id?: string;
}

export function MedalPicker({ medals, value, onChange, id }: MedalPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedMedal = useMemo(
    () => medals.find((m) => m.id === value) ?? medals[0] ?? null,
    [medals, value]
  );

  const filteredMedals = useMemo(
    () => filterMedalsByQuery(medals, query),
    [medals, query]
  );

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) setQuery("");
    }}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 text-left text-xs font-bold hover:bg-secondary/40 transition-colors cursor-pointer"
        >
          {selectedMedal ? (
            <span className="flex items-center gap-2 truncate">
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                  RARITY_INFO[selectedMedal.rarity]?.badgeBgClass ?? "bg-secondary"
                } ${RARITY_INFO[selectedMedal.rarity]?.textColor ?? "text-foreground"}`}
              >
                {RARITY_INFO[selectedMedal.rarity]?.label ?? selectedMedal.rarity}
              </span>
              <span className="truncate text-foreground">{selectedMedal.title}</span>
              <span className="hidden sm:inline truncate text-muted-foreground font-normal">
                — {selectedMedal.description}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Selecione uma medalha...</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 rounded-2xl border shadow-xl bg-popover z-[100]"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar medalha por nome ou raridade (prata, ouro, platina...)"
            autoFocus
            className="h-8 border-0 bg-transparent px-0 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Limpar pesquisa"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
          {filteredMedals.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma medalha encontrada para &quot;{query}&quot;.
            </div>
          ) : (
            filteredMedals.map((m) => {
              const isSelected = m.id === (selectedMedal?.id ?? value);
              const rarity = RARITY_INFO[m.rarity];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-start justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-secondary/70 text-foreground"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                          rarity?.badgeBgClass ?? "bg-secondary"
                        } ${rarity?.textColor ?? "text-foreground"}`}
                      >
                        {rarity?.label ?? m.rarity}
                      </span>
                      <span className="font-bold truncate">{m.title}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {m.description}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
