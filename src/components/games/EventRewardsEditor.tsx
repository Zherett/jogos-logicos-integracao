import { Coins, Gift, Plus, Target, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  EventObjectiveConfig,
  EventObjectiveType,
  EventRewardConfig,
} from "@/lib/custom-events";
import type { PlatformAdminConfig } from "@/lib/game-codes";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import { ItemRewardPicker, type SelectedRewardItemValue } from "./ItemRewardPicker";

interface EventRewardsEditorProps {
  objective: EventObjectiveConfig | undefined;
  onChangeObjective: (next: EventObjectiveConfig | undefined) => void;
  rewards: EventRewardConfig[];
  onChangeRewards: (next: EventRewardConfig[]) => void;
  adminConfig?: Partial<PlatformAdminConfig>;
}

const OBJECTIVE_OPTIONS: readonly { id: EventObjectiveType; label: string }[] = [
  { id: "matches", label: "Jogar X partidas (qualquer jogo)" },
  { id: "game_matches", label: "Jogar X partidas de um jogo específico" },
  { id: "ranked_matches", label: "Jogar X partidas ranqueadas" },
  { id: "distinct_games", label: "Jogar X partidas em Y jogos diferentes" },
  { id: "wins", label: "Conquistar X vitórias" },
  { id: "flawless_matches", label: "Concluir X partidas perfeitas (0 erros)" },
  { id: "xp", label: "Acumular X XP no evento" },
];

export function EventRewardsEditor({
  objective,
  onChangeObjective,
  rewards,
  onChangeRewards,
  adminConfig,
}: EventRewardsEditorProps) {
  function addReward(type: "coins" | "xp" | "item") {
    const newItem: EventRewardConfig = {
      id: `evrew_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      amount: type === "coins" ? 20 : type === "xp" ? 50 : undefined,
      itemCategory: type === "item" ? "chest" : undefined,
      itemId: "",
      itemName: "",
      quantity: 1,
    };
    onChangeRewards([...rewards, newItem]);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/35 bg-amber-500/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-xs font-black text-foreground flex items-center gap-1.5">
          <Gift className="h-4 w-4 text-amber-500" />
          Objetivo e Recompensas do Evento (Entrega no Correio • Prévia ADM)
        </div>
      </div>

      {/* Objetivo do Evento */}
      <div className="space-y-2 rounded-xl border bg-background/70 p-2.5">
        <Label className="text-[11px] font-bold flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-primary" /> Objetivo para Receber a Recompensa
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={objective?.type ?? ""}
            onChange={(e) => {
              const val = e.target.value as EventObjectiveType | "";
              if (!val) {
                onChangeObjective(undefined);
              } else {
                onChangeObjective({
                  type: val,
                  target: objective?.target ?? 10,
                  gameId: val === "game_matches" ? objective?.gameId ?? ALL_GAME_IDS[0] : undefined,
                  distinctTarget: val === "distinct_games" ? objective?.distinctTarget ?? 3 : undefined,
                });
              }
            }}
            className="h-9 rounded-xl border bg-background px-2.5 text-xs font-bold sm:col-span-2"
          >
            <option value="">Sem objetivo automático</option>
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          {objective && (
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-bold text-muted-foreground shrink-0">Meta:</Label>
              <Input
                type="number"
                min={1}
                value={objective.target}
                onChange={(e) =>
                  onChangeObjective({
                    ...objective,
                    target: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="h-9 rounded-xl text-xs font-bold"
              />
            </div>
          )}
        </div>

        {objective?.type === "game_matches" && (
          <select
            value={objective.gameId ?? ALL_GAME_IDS[0]}
            onChange={(e) =>
              onChangeObjective({ ...objective, gameId: e.target.value as GameId })
            }
            className="h-8 w-full rounded-lg border bg-background px-2.5 text-xs font-bold"
          >
            {ALL_GAME_IDS.map((gId) => (
              <option key={gId} value={gId}>
                {GAME_NAMES[gId]}
              </option>
            ))}
          </select>
        )}

        {objective?.type === "distinct_games" && (
          <div className="flex items-center gap-2">
            <Label className="text-[11px] font-bold text-muted-foreground">
              Mínimo de jogos diferentes:
            </Label>
            <Input
              type="number"
              min={1}
              max={ALL_GAME_IDS.length}
              value={objective.distinctTarget ?? 3}
              onChange={(e) =>
                onChangeObjective({
                  ...objective,
                  distinctTarget: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="h-8 w-20 rounded-lg text-xs font-bold"
            />
          </div>
        )}
      </div>

      {/* Lista de Recompensas */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-[11px] font-bold">
            Recompensas ({rewards.length})
          </Label>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addReward("coins")}
              className="h-7 rounded-lg text-[11px] font-bold gap-1"
            >
              <Plus className="h-3 w-3" /> <Coins className="h-3 w-3 text-amber-500" /> Moedas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addReward("xp")}
              className="h-7 rounded-lg text-[11px] font-bold gap-1"
            >
              <Plus className="h-3 w-3" /> <Zap className="h-3 w-3 text-primary" /> XP
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addReward("item")}
              className="h-7 rounded-lg text-[11px] font-bold gap-1"
            >
              <Plus className="h-3 w-3" /> <Gift className="h-3 w-3 text-emerald-500" /> Item
            </Button>
          </div>
        </div>

        {rewards.map((rew, idx) => (
          <div key={rew.id} className="rounded-xl border bg-card p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-foreground">
                Recompensa #{idx + 1} •{" "}
                {rew.type === "coins" ? "Moedas" : rew.type === "xp" ? "Experiência (XP)" : "Item"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChangeRewards(rewards.filter((r) => r.id !== rew.id))}
                className="h-6 w-6 rounded-md text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {(rew.type === "coins" || rew.type === "xp") && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] font-bold text-muted-foreground">Quantidade:</Label>
                <Input
                  type="number"
                  min={1}
                  value={rew.amount ?? 10}
                  onChange={(e) =>
                    onChangeRewards(
                      rewards.map((r) =>
                        r.id === rew.id
                          ? { ...r, amount: Math.max(1, Number(e.target.value) || 1) }
                          : r,
                      ),
                    )
                  }
                  className="h-8 w-28 rounded-lg text-xs font-bold"
                />
              </div>
            )}

            {rew.type === "item" && (
              <ItemRewardPicker
                value={{
                  itemCategory: rew.itemCategory ?? "chest",
                  itemId: rew.itemId ?? "",
                  itemName: rew.itemName ?? "",
                  quantity: rew.quantity ?? 1,
                  cosmeticKind: rew.cosmeticKind,
                }}
                onChange={(val: SelectedRewardItemValue) =>
                  onChangeRewards(
                    rewards.map((r) =>
                      r.id === rew.id
                        ? {
                            ...r,
                            itemCategory: val.itemCategory,
                            itemId: val.itemId,
                            itemName: val.itemName,
                            quantity: val.quantity,
                            cosmeticKind: val.cosmeticKind,
                          }
                        : r,
                    ),
                  )
                }
                chestsCatalog={adminConfig?.chestsCatalog}
                cardPacks={adminConfig?.cardPacks}
                avatarsCatalog={adminConfig?.avatarsCatalog}
                aurasCatalog={adminConfig?.aurasCatalog}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
