import { useMemo, useState } from "react";
import { Check, Gift, Package, Palette, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import { mergeWithDefaultChests, type ChestDefinition } from "@/lib/chests-catalog";
import {
  mergeWithDefaultAuras,
  mergeWithDefaultAvatars,
  type AuraDefinition,
  type AvatarDefinition,
  type CosmeticKind,
} from "@/lib/cosmetics-catalog";

export type RewardItemCategory = "chest" | "card_pack" | "cosmetic";

export interface SelectedRewardItemValue {
  itemCategory: RewardItemCategory;
  itemId: string;
  itemName: string;
  quantity: number;
  cosmeticKind?: CosmeticKind;
}

interface ItemRewardPickerProps {
  value: SelectedRewardItemValue;
  onChange: (next: SelectedRewardItemValue) => void;
  chestsCatalog?: ChestDefinition[];
  cardPacks?: CardPackDefinition[];
  avatarsCatalog?: AvatarDefinition[];
  aurasCatalog?: AuraDefinition[];
}

export function ItemRewardPicker({
  value,
  onChange,
  chestsCatalog,
  cardPacks,
  avatarsCatalog,
  aurasCatalog,
}: ItemRewardPickerProps) {
  const [search, setSearch] = useState("");

  const chests = useMemo(() => mergeWithDefaultChests(chestsCatalog), [chestsCatalog]);
  const packs = useMemo(() => mergeWithDefaultCardPacks(cardPacks), [cardPacks]);
  const avatars = useMemo(
    () => mergeWithDefaultAvatars(avatarsCatalog).filter((a) => !a.isDefault || a.priceCoins > 0),
    [avatarsCatalog],
  );
  const auras = useMemo(() => mergeWithDefaultAuras(aurasCatalog), [aurasCatalog]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (value.itemCategory === "chest") {
      return chests
        .map((c) => ({
          id: c.id,
          name: c.name,
          subtitle: `Baú • ${c.rarity}`,
        }))
        .filter((o) => !q || o.name.toLowerCase().includes(q));
    }
    if (value.itemCategory === "card_pack") {
      return packs
        .map((p) => ({
          id: p.id,
          name: p.name,
          subtitle: `Pacote • ${p.cardsPerPack} cartas`,
        }))
        .filter((o) => !q || o.name.toLowerCase().includes(q));
    }
    const mergedCosmetics = [
      ...avatars.map((a) => ({
        id: a.id,
        name: a.name,
        subtitle: "Avatar",
        cosmeticKind: "avatar" as const,
      })),
      ...auras.map((a) => ({
        id: a.id,
        name: a.name,
        subtitle: "Aura do Perfil",
        cosmeticKind: "aura" as const,
      })),
    ];
    return mergedCosmetics.filter(
      (o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        o.subtitle.toLowerCase().includes(q),
    );
  }, [value.itemCategory, search, chests, packs, avatars, auras]);

  return (
    <div className="space-y-2.5 rounded-xl border bg-background/60 p-3">
      {/* Subcategorias */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border bg-secondary/40 p-1">
        {(
          [
            { id: "chest", label: "Baú", icon: Gift },
            { id: "card_pack", label: "Pacote", icon: Package },
            { id: "cosmetic", label: "Cosmético", icon: Palette },
          ] as const
        ).map((cat) => {
          const Icon = cat.icon;
          const active = value.itemCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSearch("");
                onChange({
                  itemCategory: cat.id,
                  itemId: "",
                  itemName: "",
                  quantity: cat.id === "cosmetic" ? 1 : Math.max(1, value.quantity || 1),
                  cosmeticKind: cat.id === "cosmetic" ? "avatar" : undefined,
                });
              }}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Busca por nome + Quantidade */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite o nome do item..."
            className="h-8 rounded-lg pl-8 text-xs"
          />
        </div>
        {value.itemCategory !== "cosmetic" && (
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground">Qtd:</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={value.quantity}
              onChange={(e) =>
                onChange({
                  ...value,
                  quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                })
              }
              className="h-8 w-16 rounded-lg text-xs text-center font-bold"
            />
          </div>
        )}
      </div>

      {/* Lista filtrada */}
      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
        {options.length === 0 ? (
          <div className="py-3 text-center text-[11px] text-muted-foreground">
            Nenhum item encontrado para &ldquo;{search}&rdquo;.
          </div>
        ) : (
          options.map((opt) => {
            const selected = value.itemId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    itemId: opt.id,
                    itemName: opt.name,
                    cosmeticKind: "cosmeticKind" in opt ? opt.cosmeticKind : undefined,
                  })
                }
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all cursor-pointer ${
                  selected
                    ? "border-primary bg-primary/10 font-bold text-foreground"
                    : "border-border/50 bg-card hover:bg-secondary/40 text-foreground"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{opt.name}</div>
                  <div className="text-[10px] text-muted-foreground">{opt.subtitle}</div>
                </div>
                {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      {value.itemId && (
        <div className="rounded-lg bg-primary/10 border border-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">
          Selecionado:{" "}
          {value.itemCategory === "cosmetic"
            ? value.itemName
            : `${value.quantity}x ${value.itemName}`}
        </div>
      )}
    </div>
  );
}
