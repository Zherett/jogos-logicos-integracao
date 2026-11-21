import { useMemo, useState } from "react";
import { Award, Check, Coins, Gift, Lock, Package, Sparkles, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RankedMilestoneReward } from "@/lib/game-codes";
import { mergeWithDefaultCardPacks, type CardPackDefinition } from "@/lib/cards-catalog";
import {
  countUnlockedTournamentRanks,
  getRankedMilestoneKey,
  RANKED_MASTERY_MEDAL_BY_RANK,
  TOURNAMENT_RANKS,
  type TournamentRankDefinition,
  type TournamentRankId,
} from "@/lib/weekly-tournament";
import { TournamentRankBadge } from "./TournamentRankBadge";

interface RankedPathTrackProps {
  mode: "player" | "admin";
  currentPoints?: number;
  seasonId?: number;
  claimedMilestones?: string[];
  rewardsMap?: Partial<Record<string, RankedMilestoneReward>>;
  cardPacks?: CardPackDefinition[];
  onClaimReward?: (rankId: TournamentRankId, reward: RankedMilestoneReward) => Promise<void> | void;
  onSaveAdminReward?: (
    rankId: TournamentRankId,
    reward: RankedMilestoneReward | null,
  ) => Promise<void> | void;
}

const COL_1_IDS: TournamentRankId[] = [
  "prata_3",
  "prata_2",
  "prata_1",
  "bronze_3",
  "bronze_2",
  "bronze_1",
];
const COL_2_IDS: TournamentRankId[] = [
  "ouro_1",
  "ouro_2",
  "ouro_3",
  "platina_1",
  "platina_2",
  "platina_3",
];
const COL_3_IDS: TournamentRankId[] = [
  "mestre",
  "diamante_5",
  "diamante_4",
  "diamante_3",
  "diamante_2",
  "diamante_1",
  "platina_4",
];

const RANK_BY_ID = new Map<TournamentRankId, TournamentRankDefinition>(
  TOURNAMENT_RANKS.map((r) => [r.id, r]),
);

export function RankedPathTrack({
  mode,
  currentPoints = 0,
  seasonId = 1,
  claimedMilestones = [],
  rewardsMap = {},
  cardPacks,
  onClaimReward,
  onSaveAdminReward,
}: RankedPathTrackProps) {
  const [selectedRankId, setSelectedRankId] = useState<TournamentRankId | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Admin editor local state
  const availablePacks = useMemo(
    () => mergeWithDefaultCardPacks(cardPacks).filter((p) => p.enabled),
    [cardPacks],
  );
  const [editType, setEditType] = useState<"none" | "card_pack" | "points">("none");
  const [editPackId, setEditPackId] = useState<string>(availablePacks[0]?.id ?? "pack_basico");
  const [editQty, setEditQty] = useState<number>(1);

  const { unlockedCount, totalCount, unlockedIds } = useMemo(
    () => countUnlockedTournamentRanks(currentPoints),
    [currentPoints],
  );

  const claimedSet = useMemo(() => new Set(claimedMilestones), [claimedMilestones]);

  function openNode(rankId: TournamentRankId) {
    setSelectedRankId(rankId);
    if (mode === "admin") {
      const existing = rewardsMap?.[rankId];
      if (!existing) {
        setEditType("none");
        setEditPackId(availablePacks[0]?.id ?? "pack_basico");
        setEditQty(1);
      } else {
        setEditType(existing.type);
        setEditPackId(existing.packId ?? availablePacks[0]?.id ?? "pack_basico");
        setEditQty(Math.max(1, existing.quantity || 1));
      }
    }
  }

  function renderRewardSummary(reward?: RankedMilestoneReward) {
    if (!reward) return null;
    if (reward.type === "card_pack") {
      const pack = availablePacks.find((p) => p.id === reward.packId);
      const packName = pack?.name ?? reward.label ?? "Pacote de Cartas";
      return `${reward.quantity}x ${packName}`;
    }
    return `+${reward.quantity} Pontos`;
  }

  function renderNode(rankId: TournamentRankId, isMasterNode = false) {
    const rank = RANK_BY_ID.get(rankId);
    if (!rank) return null;

    const isUnlocked = mode === "admin" ? true : unlockedIds.has(rank.id);
    const masteryMedal = RANKED_MASTERY_MEDAL_BY_RANK[rank.id];
    const reward = rewardsMap?.[rank.id];
    const milestoneKey = getRankedMilestoneKey(seasonId, rank.id);
    const isClaimed = claimedSet.has(milestoneKey);
    const canClaim = mode === "player" && isUnlocked && Boolean(reward) && !isClaimed;
    const isSelected = selectedRankId === rank.id;

    return (
      <div className="relative flex flex-col items-center">
        <button
          type="button"
          onClick={() => openNode(rank.id)}
          title={`${rank.name} (${rank.minPoints}+ pts)${reward ? ` • Recompensa: ${renderRewardSummary(reward)}` : ""}`}
          className={`group relative flex flex-col items-center justify-center rounded-full transition-all cursor-pointer focus:outline-none ${
            isMasterNode ? "p-1.5" : "p-1"
          } ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${
            mode === "player" && isUnlocked ? "animate-ranked-aura rounded-2xl" : ""
          } ${mode === "player" && !isUnlocked ? "opacity-40 grayscale hover:opacity-70" : "hover:scale-105"}`}
        >
          <TournamentRankBadge
            rankId={rank.id}
            size={isMasterNode ? "lg" : "md"}
          />

          {/* Indicador de Medalha de Maestria vinculada ao elo */}
          {masteryMedal && (
            <span
              className={`absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full border shadow-xs ${
                isUnlocked
                  ? "bg-amber-400 text-zinc-950 border-background"
                  : "bg-muted text-muted-foreground border-border"
              }`}
              title={`Medalha: ${masteryMedal.title}`}
            >
              <Award className="h-3 w-3" />
            </span>
          )}

          {/* Indicador de Recompensa configurada pelo ADM */}
          {reward && (
            <span
              className={`absolute -top-1.5 -right-1.5 grid h-5 min-w-5 px-1 place-items-center rounded-full border text-[9px] font-black shadow-xs ${
                isClaimed
                  ? "bg-emerald-500 text-white border-background"
                  : canClaim
                    ? "bg-amber-500 text-zinc-950 border-background animate-bounce"
                    : "bg-primary text-primary-foreground border-background"
              }`}
              title={renderRewardSummary(reward) ?? "Recompensa"}
            >
              {isClaimed ? <Check className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
            </span>
          )}
        </button>

        <span
          className={`mt-1 text-center font-display text-[10px] leading-tight font-extrabold ${
            isMasterNode ? "text-xs text-rose-500" : isUnlocked ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {rank.name}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{rank.minPoints}+</span>
      </div>
    );
  }

  const selectedRank = selectedRankId ? RANK_BY_ID.get(selectedRankId) : null;
  const selectedMastery = selectedRank ? RANKED_MASTERY_MEDAL_BY_RANK[selectedRank.id] : undefined;
  const selectedReward = selectedRank ? rewardsMap?.[selectedRank.id] : undefined;
  const selectedUnlocked = selectedRank ? unlockedIds.has(selectedRank.id) : false;
  const selectedClaimed = selectedRank
    ? claimedSet.has(getRankedMilestoneKey(seasonId, selectedRank.id))
    : false;

  return (
    <div className="space-y-4">
      {/* Pílula Superior de Progresso */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-extrabold text-primary shadow-2xs">
          <Trophy className="h-3.5 w-3.5 text-accent" />
          {mode === "player" ? (
            <span>
              {unlockedCount} de {totalCount} ranks alcançados
            </span>
          ) : (
            <span>Clique em qualquer rank para definir ou editar sua recompensa ({totalCount} marcos)</span>
          )}
        </div>
      </div>

      {/* Diagrama Serpentina em 3 Colunas (6 + 6 + 7 = 19 Ranks) */}
      <div className="rounded-3xl border bg-card/60 p-3 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
          {/* Coluna 1: sobe de baixo para cima (Bronze I -> Prata III) */}
          <div className="flex flex-col items-center">
            {COL_1_IDS.map((id, idx) => (
              <div key={id} className="relative flex flex-col items-center w-full">
                {/* Conector horizontal no topo (Prata III -> Ouro I) */}
                {idx === 0 && (
                  <div
                    aria-hidden="true"
                    className="hidden sm:block absolute left-1/2 top-6 w-full h-0.5 bg-border/80 -z-0"
                  />
                )}
                <div className="relative z-10">{renderNode(id)}</div>
                {idx < COL_1_IDS.length - 1 && (
                  <div className="my-1 h-4 w-0.5 bg-border/80 rounded-full" />
                )}
              </div>
            ))}
          </div>

          {/* Coluna 2: desce de cima para baixo (Ouro I -> Platina III) */}
          <div className="flex flex-col items-center">
            {COL_2_IDS.map((id, idx) => (
              <div key={id} className="relative flex flex-col items-center w-full">
                {/* Conector horizontal na base (Platina III -> Platina IV) */}
                {idx === COL_2_IDS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="hidden sm:block absolute left-1/2 top-6 w-full h-0.5 bg-border/80 -z-0"
                  />
                )}
                <div className="relative z-10">{renderNode(id)}</div>
                {idx < COL_2_IDS.length - 1 && (
                  <div className="my-1 h-4 w-0.5 bg-border/80 rounded-full" />
                )}
              </div>
            ))}
          </div>

          {/* Coluna 3: sobe de baixo para cima até Mestre maior no topo direito */}
          <div className="flex flex-col items-center">
            {COL_3_IDS.map((id, idx) => (
              <div key={id} className="relative flex flex-col items-center w-full">
                <div className="relative z-10">{renderNode(id, id === "mestre")}</div>
                {idx < COL_3_IDS.length - 1 && (
                  <div className="my-1 h-3.5 w-0.5 bg-border/80 rounded-full" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Painel de Detalhes / Resgate (Jogador) ou Edição (ADM) */}
      {selectedRank && (
        <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <TournamentRankBadge rankId={selectedRank.id} size="sm" />
              <div>
                <h4 className="font-display text-sm font-black text-foreground">
                  {selectedRank.name}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Requer {selectedRank.minPoints}+ pontos ranqueados
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRankId(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-secondary cursor-pointer"
              aria-label="Fechar detalhes do rank"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedMastery && (
            <div className="flex items-center gap-2 rounded-xl border bg-amber-500/10 border-amber-500/30 px-3 py-2 text-xs">
              <Award className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <span className="font-bold text-foreground">Medalha do Marco: </span>
                <span className="font-extrabold text-amber-600 dark:text-amber-400">
                  {selectedMastery.title}
                </span>
              </div>
            </div>
          )}

          {mode === "player" && (
            <>
              {selectedReward ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/40 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    {selectedReward.type === "card_pack" ? (
                      <Package className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Coins className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">
                        Recompensa deste Marco
                      </div>
                      <div className="font-display font-black text-foreground">
                        {renderRewardSummary(selectedReward)}
                      </div>
                    </div>
                  </div>

                  {selectedClaimed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Resgatado no Inventário
                    </span>
                  ) : selectedUnlocked ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={claiming}
                      onClick={async () => {
                        if (!onClaimReward) return;
                        setClaiming(true);
                        try {
                          await onClaimReward(selectedRank.id, selectedReward);
                        } finally {
                          setClaiming(false);
                        }
                      }}
                      className="rounded-xl font-bold gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {claiming ? "Resgatando..." : "Resgatar Agora"}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
                      <Lock className="h-3 w-3" /> Alcance {selectedRank.minPoints} pts
                    </span>
                  )}
                </div>
              ) : (
                !selectedMastery && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma recompensa extra configurada para este marco nesta temporada.
                  </p>
                )
              )}
            </>
          )}

          {mode === "admin" && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted-foreground">
                    Tipo de Recompensa
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as "none" | "card_pack" | "points")}
                    className="h-9 w-full rounded-xl border bg-background px-2.5 text-xs font-bold"
                  >
                    <option value="none">Sem recompensa</option>
                    <option value="card_pack">Pacote de Cartas / Baú</option>
                    <option value="points">Pontos</option>
                  </select>
                </div>

                {editType === "card_pack" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">
                      Pacote / Baú
                    </label>
                    <select
                      value={editPackId}
                      onChange={(e) => setEditPackId(e.target.value)}
                      className="h-9 w-full rounded-xl border bg-background px-2.5 text-xs font-bold"
                    >
                      {availablePacks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {editType !== "none" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={editType === "points" ? 500 : 20}
                      value={editQty}
                      onChange={(e) => setEditQty(Math.max(1, Number(e.target.value) || 1))}
                      className="h-9 w-full rounded-xl border bg-background px-2.5 text-xs font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={savingAdmin}
                  onClick={async () => {
                    if (!onSaveAdminReward) return;
                    setSavingAdmin(true);
                    try {
                      if (editType === "none") {
                        await onSaveAdminReward(selectedRank.id, null);
                      } else if (editType === "card_pack") {
                        const pack = availablePacks.find((p) => p.id === editPackId);
                        await onSaveAdminReward(selectedRank.id, {
                          type: "card_pack",
                          packId: editPackId,
                          quantity: Math.max(1, Math.floor(editQty)),
                          label: pack?.name,
                        });
                      } else {
                        await onSaveAdminReward(selectedRank.id, {
                          type: "points",
                          quantity: Math.max(1, Math.floor(editQty)),
                        });
                      }
                    } finally {
                      setSavingAdmin(false);
                    }
                  }}
                  className="rounded-xl text-xs font-bold"
                >
                  {savingAdmin ? "Salvando..." : "Salvar Recompensa do Marco"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
