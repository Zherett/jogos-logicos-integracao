import { useMemo, useState } from "react";
import { Award, Coins, Gift, Package, Plus, RotateCcw, Save, Sparkles, Star, Trash2, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_TOURNAMENT_PODIUM_REWARDS,
  resolveTournamentPodiumRewards,
  TOURNAMENT_PODIUM_RANKS,
  type PlatformAdminConfig,
  type TournamentPodiumRank,
  type TournamentPodiumRewardItem,
  type TournamentPodiumRewardsConfig,
  type TournamentPodiumRewardSlot,
} from "@/lib/game-codes";
import { getAllAvailableMedals } from "@/lib/medals-catalog";
import { ItemRewardPicker, type SelectedRewardItemValue } from "./ItemRewardPicker";

interface AdminTournamentPodiumRewardsProps {
  draft: PlatformAdminConfig;
  onChange: (nextRewards: TournamentPodiumRewardsConfig) => void;
  onSave?: () => Promise<void> | void;
  saving?: boolean;
}

const DEFAULT_ITEM_DRAFT: SelectedRewardItemValue = {
  itemCategory: "chest",
  itemId: "",
  itemName: "",
  quantity: 1,
};

const RANK_META: Record<
  TournamentPodiumRank,
  {
    title: string;
    trophyBadge?: string;
    accentBorder: string;
    accentBg: string;
    badgeColor: string;
  }
> = {
  1: {
    title: "1º Lugar (Ouro)",
    trophyBadge: "Troféu de Ouro automático no perfil",
    accentBorder: "border-amber-500/50",
    accentBg: "bg-amber-500/10",
    badgeColor: "text-amber-600 dark:text-amber-400",
  },
  2: {
    title: "2º Lugar (Prata)",
    trophyBadge: "Troféu de Prata automático no perfil",
    accentBorder: "border-slate-400/50",
    accentBg: "bg-slate-400/10",
    badgeColor: "text-slate-600 dark:text-slate-300",
  },
  3: {
    title: "3º Lugar (Bronze)",
    trophyBadge: "Troféu de Bronze automático no perfil",
    accentBorder: "border-orange-500/50",
    accentBg: "bg-orange-500/10",
    badgeColor: "text-orange-600 dark:text-orange-400",
  },
  4: {
    title: "4º Lugar (Top 5)",
    accentBorder: "border-primary/35",
    accentBg: "bg-primary/5",
    badgeColor: "text-primary",
  },
  5: {
    title: "5º Lugar (Top 5)",
    accentBorder: "border-primary/35",
    accentBg: "bg-primary/5",
    badgeColor: "text-primary",
  },
};

export function AdminTournamentPodiumRewards({
  draft,
  onChange,
  onSave,
  saving = false,
}: AdminTournamentPodiumRewardsProps) {
  const resolved = useMemo(
    () => resolveTournamentPodiumRewards(draft.tournamentPodiumRewards),
    [draft.tournamentPodiumRewards],
  );

  const allMedals = useMemo(() => {
    const base = getAllAvailableMedals();
    return [...base].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [draft.customMedals]);

  const [addingItemRank, setAddingItemRank] = useState<TournamentPodiumRank | null>(null);
  const [itemDraft, setItemDraft] = useState<SelectedRewardItemValue>(DEFAULT_ITEM_DRAFT);

  function updateSlot(rank: TournamentPodiumRank, patch: Partial<TournamentPodiumRewardSlot>) {
    const next: TournamentPodiumRewardsConfig = {
      ...resolved,
      [rank]: {
        ...resolved[rank],
        ...patch,
      },
    };
    onChange(next);
  }

  function handleAddItemToSlot(rank: TournamentPodiumRank) {
    if (!itemDraft.itemId) return;
    const currentItems = resolved[rank].items;
    const nextItem: TournamentPodiumRewardItem = {
      itemCategory: itemDraft.itemCategory,
      itemId: itemDraft.itemId,
      itemName: itemDraft.itemName || itemDraft.itemId,
      quantity: itemDraft.itemCategory === "cosmetic" ? 1 : Math.max(1, Math.floor(itemDraft.quantity || 1)),
      ...(itemDraft.cosmeticKind ? { cosmeticKind: itemDraft.cosmeticKind } : {}),
    };
    updateSlot(rank, { items: [...currentItems, nextItem] });
    setAddingItemRank(null);
    setItemDraft(DEFAULT_ITEM_DRAFT);
  }

  function handleRemoveItem(rank: TournamentPodiumRank, idx: number) {
    const nextItems = resolved[rank].items.filter((_, i) => i !== idx);
    updateSlot(rank, { items: nextItems });
  }

  function handleRestoreDefaults() {
    onChange({
      1: { ...DEFAULT_TOURNAMENT_PODIUM_REWARDS[1], items: [] },
      2: { ...DEFAULT_TOURNAMENT_PODIUM_REWARDS[2], items: [] },
      3: { ...DEFAULT_TOURNAMENT_PODIUM_REWARDS[3], items: [] },
      4: { ...DEFAULT_TOURNAMENT_PODIUM_REWARDS[4], items: [] },
      5: { ...DEFAULT_TOURNAMENT_PODIUM_REWARDS[5], items: [] },
    });
  }

  const anyCoinsConfigured = TOURNAMENT_PODIUM_RANKS.some((r) => resolved[r].coins > 0);
  const anyItemsConfigured = TOURNAMENT_PODIUM_RANKS.some((r) => resolved[r].items.length > 0);
  const coinsHidden = !draft.rolloutFlags?.enableCoinsWalletForStudents;
  const shopHidden = !draft.rolloutFlags?.enableShopForStudents;

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="flex items-center gap-2 font-display text-sm sm:text-base font-black text-foreground">
            <Gift className="h-4 w-4 text-amber-500 shrink-0" />
            Premiações de Encerramento do Torneio Mensal (Top 1 a Top 5)
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configure os prêmios entregues no <b>Correio (Inbox)</b> para cada uma das 5 colocações de cada etapa.
            Os <b>Troféus do Top 3</b> são aplicados <b>automaticamente</b> no perfil ao encerrar o mês. Campos com{" "}
            <b>0</b> não enviam recompensa daquela categoria.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRestoreDefaults}
          className="rounded-xl text-xs font-bold shrink-0"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restaurar Padrão
        </Button>
      </div>

      {((anyCoinsConfigured && coinsHidden) || (anyItemsConfigured && shopHidden)) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          💡 Aviso de liberação gradual: moedas ou itens configurados abaixo serão entregues com segurança ao inventário/carteira do aluno no resgate pelo Correio e ficarão visíveis assim que as chaves da Carteira/Loja forem ativadas.
        </div>
      )}

      <div className="space-y-3">
        {TOURNAMENT_PODIUM_RANKS.map((rank) => {
          const meta = RANK_META[rank];
          const slot = resolved[rank];
          const isAddingItem = addingItemRank === rank;

          return (
            <div
              key={rank}
              className={`rounded-2xl border ${meta.accentBorder} ${meta.accentBg} p-4 space-y-3`}
            >
              {/* Cabeçalho da Posição */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-display text-sm font-black ${meta.badgeColor}`}>
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏅"} {meta.title}
                  </span>
                  {meta.trophyBadge && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                      <Trophy className="h-3 w-3" /> {meta.trophyBadge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  📬 Coletável no Correio
                </span>
              </div>

              {/* Medalha + XP + Pontos + Moedas */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6 space-y-1">
                  <Label className="text-[11px] font-bold flex items-center gap-1 text-foreground">
                    <Award className="h-3.5 w-3.5 text-primary" /> Medalha do Correio
                  </Label>
                  <select
                    value={slot.medalId ?? ""}
                    onChange={(e) =>
                      updateSlot(rank, {
                        medalId: e.target.value ? e.target.value : null,
                      })
                    }
                    className="w-full h-9 rounded-xl border bg-background px-2.5 text-xs font-semibold"
                  >
                    <option value="">— Nenhuma medalha —</option>
                    {allMedals.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.rarity})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[11px] font-bold flex items-center gap-1 text-sky-600 dark:text-sky-400">
                    <Zap className="h-3 w-3" /> XP
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={50000}
                    value={slot.xp}
                    onChange={(e) =>
                      updateSlot(rank, {
                        xp: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                    className="h-9 rounded-xl bg-background font-mono text-xs font-bold"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[11px] font-bold flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Star className="h-3 w-3" /> Pontos
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={50000}
                    value={slot.points}
                    onChange={(e) =>
                      updateSlot(rank, {
                        points: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                    className="h-9 rounded-xl bg-background font-mono text-xs font-bold"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-[11px] font-bold flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <Coins className="h-3 w-3" /> Moedas
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={50000}
                    value={slot.coins}
                    onChange={(e) =>
                      updateSlot(rank, {
                        coins: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                    className="h-9 rounded-xl bg-background font-mono text-xs font-bold"
                  />
                </div>
              </div>

              {/* Itens Extras (Baús, Pacotes de Cartas e Cosméticos) */}
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-primary" />
                    Itens Extras ({slot.items.length})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={isAddingItem ? "secondary" : "outline"}
                    onClick={() => {
                      if (isAddingItem) {
                        setAddingItemRank(null);
                      } else {
                        setItemDraft(DEFAULT_ITEM_DRAFT);
                        setAddingItemRank(rank);
                      }
                    }}
                    className="h-7 rounded-xl text-[11px] font-bold px-2.5"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {isAddingItem ? "Cancelar" : "Adicionar Item"}
                  </Button>
                </div>

                {slot.items.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {slot.items.map((it, idx) => (
                      <span
                        key={`${it.itemCategory}-${it.itemId}-${idx}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border bg-background/90 px-2.5 py-1 text-[11px] font-bold text-foreground"
                      >
                        {it.itemCategory === "chest" ? (
                          <Gift className="h-3 w-3 text-amber-500" />
                        ) : it.itemCategory === "card_pack" ? (
                          <Package className="h-3 w-3 text-primary" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-purple-500" />
                        )}
                        <span>
                          {it.itemCategory === "cosmetic"
                            ? it.itemName
                            : `${it.quantity}x ${it.itemName}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(rank, idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          title="Remover item"
                          aria-label={`Remover ${it.itemName}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {isAddingItem && (
                  <div className="rounded-xl border bg-background/95 p-3 space-y-2.5">
                    <ItemRewardPicker
                      value={itemDraft}
                      onChange={setItemDraft}
                      chestsCatalog={draft.chestsCatalog}
                      cardPacks={draft.cardPacks}
                      avatarsCatalog={draft.avatarsCatalog}
                      aurasCatalog={draft.aurasCatalog}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAddingItemRank(null)}
                        className="h-8 rounded-xl text-xs"
                      >
                        Fechar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!itemDraft.itemId}
                        onClick={() => handleAddItemToSlot(rank)}
                        className="h-8 rounded-xl text-xs font-bold"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Confirmar Item no {rank}º Lugar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onSave && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground">
            As alterações só passam a valer para o próximo encerramento após salvar na nuvem.
          </span>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void onSave()}
            className="rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar Premiações do Torneio"}
          </Button>
        </div>
      )}
    </div>
  );
}
