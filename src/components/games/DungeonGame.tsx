import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Backpack,
  Check,
  Compass,
  FlaskConical,
  Hammer,
  Layers,
  Lock,
  Play,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Unlock,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD_RARITY_META, mergeWithDefaultCardPacks, type CardDefinition } from "@/lib/cards-catalog";
import { creditCoinMetrics } from "@/lib/career-points";
import { mergeWithDefaultChests } from "@/lib/chests-catalog";
import {
  DUNGEON_BIOMES,
  DUNGEON_CRAFT_RECIPES,
  DUNGEON_FALLBACK_TEST_CARDS,
  DUNGEON_FULL_RECHARGE_DISTINCT_GAMES,
  DUNGEON_FULL_RECHARGE_MATCHES,
  DUNGEON_MATCHES_PER_STAMINA,
  DUNGEON_MAX_STAMINA,
  DUNGEON_MONSTERS,
  DUNGEON_PORTALS,
  DUNGEON_REQUIRED_CARDS,
  DUNGEON_RESOURCES,
  DUNGEON_RESOURCE_IDS,
  DUNGEON_UNLOCK_LEVEL,
} from "@/lib/dungeon-config";
import {
  addResourcesToInventory,
  aggregateDungeonLoadout,
  canStartFromPortal,
  craftDungeonRecipe,
  createDefaultDungeonState,
  extractDungeonRun,
  getDungeonAccessForLevel,
  normalizeDungeonState,
  recordExternalMatchForDungeonStamina,
  resolveCardDungeonBonus,
  startDungeonRun,
  validateDungeonLoadout,
  type DungeonResourceInventory,
  type PlayerDungeonState,
} from "@/lib/dungeon-engine";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import { usePlayerAuth } from "@/lib/player-auth";
import { getLocalDateKey, syncLevelStageProgress } from "@/lib/player-profile";
import { getAllRegisteredPlayers } from "@/lib/playfab";
import { CollectibleCardView } from "./CollectibleCardView";
import { CardPagination, paginateItems } from "./CardPagination";
import { DungeonEncounterStage } from "./DungeonEncounterStage";

interface DungeonGameProps {
  onExit: () => void;
}

type DungeonHubTab = "expedicao" | "forja" | "mochila" | "ranking";

export function DungeonGame({ onExit }: DungeonGameProps) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const [activeTab, setActiveTab] = useState<DungeonHubTab>("expedicao");
  const [cardsPage, setCardsPage] = useState(1);
  const [inRunView, setInRunView] = useState(false);
  const [admPanelOpen, setAdmPanelOpen] = useState(false);
  const [simulatedLevel, setSimulatedLevel] = useState<number | null>(null);
  const [simGameId, setSimGameId] = useState<GameId>("logica");
  const [statusBanner, setStatusBanner] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Fallback local para caso o ADM esteja testando com PIN sem conta de jogador logada
  const [guestDungeonState, setGuestDungeonState] = useState<PlayerDungeonState>(() =>
    createDefaultDungeonState(),
  );
  const [guestCardsMap, setGuestCardsMap] = useState<Record<string, number>>(() => ({
    [DUNGEON_FALLBACK_TEST_CARDS[0].id]: 1,
    [DUNGEON_FALLBACK_TEST_CARDS[1].id]: 1,
    [DUNGEON_FALLBACK_TEST_CARDS[2].id]: 1,
  }));

  const cardCatalog = useMemo<CardDefinition[]>(() => {
    const adminCards = auth.adminConfig.cardsCatalog ?? [];
    if (adminCards.length >= 3) return adminCards;
    const merged = [...adminCards];
    for (const sample of DUNGEON_FALLBACK_TEST_CARDS) {
      if (!merged.some((c) => c.id === sample.id)) {
        merged.push(sample);
      }
    }
    return merged;
  }, [auth.adminConfig.cardsCatalog]);

  const packsCatalog = useMemo(
    () => mergeWithDefaultCardPacks(auth.adminConfig.cardPacks),
    [auth.adminConfig.cardPacks],
  );
  const chestsCatalog = useMemo(
    () => mergeWithDefaultChests(auth.adminConfig.chestsCatalog),
    [auth.adminConfig.chestsCatalog],
  );

  const dungeonState = useMemo(
    () =>
      profile
        ? normalizeDungeonState(profile.dungeonState)
        : normalizeDungeonState(guestDungeonState),
    [profile, guestDungeonState],
  );

  const ownedCardsMap = useMemo(
    () => (profile ? (profile.cards ?? {}) : guestCardsMap),
    [profile, guestCardsMap],
  );

  const effectiveLevel = simulatedLevel ?? (profile?.level ?? 10);
  const access = useMemo(() => getDungeonAccessForLevel(effectiveLevel), [effectiveLevel]);

  const ownedCardDefinitions = useMemo(
    () => cardCatalog.filter((c) => (ownedCardsMap[c.id] ?? 0) >= 1),
    [cardCatalog, ownedCardsMap],
  );

  const savedEquippedIds = dungeonState.loadout.equippedCardIds;
  const activeEquippedIds = useMemo(
    () =>
      savedEquippedIds.filter(
        (id) => (ownedCardsMap[id] ?? 0) >= 1 && cardCatalog.some((c) => c.id === id),
      ),
    [savedEquippedIds, ownedCardsMap, cardCatalog],
  );
  const equippedValidation = useMemo(
    () => validateDungeonLoadout(activeEquippedIds, ownedCardsMap, cardCatalog),
    [activeEquippedIds, ownedCardsMap, cardCatalog],
  );

  const aggregatedBonuses = useMemo(
    () => aggregateDungeonLoadout(equippedValidation.cards),
    [equippedValidation.cards],
  );

  const allPlayersRankings = useMemo(() => {
    const playersList = getAllRegisteredPlayers(false).map((p) => {
      const ds =
        profile && p.id === profile.id
          ? dungeonState
          : normalizeDungeonState(p.dungeonState);
      return {
        id: p.id,
        nick: p.nick,
        school: p.school,
        level: p.level,
        highestFloor: ds.progression.highestFloorReached,
        bossesDefeated: ds.progression.bossesDefeated.length,
        totalFloorsCleared: ds.progression.totalFloorsCleared,
        flawlessFloorsCleared: ds.progression.flawlessFloorsCleared,
      };
    });

    const depthRanking = [...playersList]
      .filter((p) => p.highestFloor > 0)
      .sort(
        (a, b) =>
          b.highestFloor - a.highestFloor ||
          b.bossesDefeated - a.bossesDefeated ||
          b.totalFloorsCleared - a.totalFloorsCleared,
      )
      .slice(0, 20);

    const explorerRanking = [...playersList]
      .filter((p) => p.totalFloorsCleared > 0 || p.flawlessFloorsCleared > 0)
      .sort(
        (a, b) =>
          b.flawlessFloorsCleared - a.flawlessFloorsCleared ||
          b.totalFloorsCleared - a.totalFloorsCleared ||
          b.highestFloor - a.highestFloor,
      )
      .slice(0, 20);

    return { depthRanking, explorerRanking };
  }, [profile, dungeonState, activeTab]);

  async function persistDungeonState(
    nextState: PlayerDungeonState,
    extraRewards?: {
      coins?: number;
      xp?: number;
      chestId?: string;
      packId?: string;
      packQty?: number;
      cardsAdd?: Record<string, number>;
    },
  ) {
    if (!profile) {
      setGuestDungeonState(nextState);
      if (extraRewards?.cardsAdd) {
        setGuestCardsMap((prev) => ({ ...prev, ...extraRewards.cardsAdd }));
      }
      return;
    }

    await auth.updateDungeonProfile((p) => {
      const nextProfile = {
        ...p,
        dungeonState: nextState,
      };

      if (extraRewards?.coins && extraRewards.coins > 0) {
        creditCoinMetrics(nextProfile, extraRewards.coins);
      }

      if (extraRewards?.xp && extraRewards.xp > 0) {
        const nextXp = (nextProfile.xp ?? 0) + extraRewards.xp;
        nextProfile.xp = nextXp;
        nextProfile.seasonXp = (nextProfile.seasonXp ?? 0) + extraRewards.xp;
        const synced = syncLevelStageProgress({
          xp: nextXp,
          lifetimeMatches: nextProfile.matchesPlayed ?? 0,
          lifetimeWins: nextProfile.wins ?? 0,
          lifetimeDistinctGames: nextProfile.distinctGamesPlayed ?? 0,
          currentLevel: nextProfile.level,
          existingStage: nextProfile.levelStageProgress,
        });
        nextProfile.level = synced.level;
        nextProfile.levelStageProgress = synced.stageProgress;
      }

      if (extraRewards?.chestId) {
        const curChests = { ...(nextProfile.unopenedChests ?? {}) };
        curChests[extraRewards.chestId] = (curChests[extraRewards.chestId] ?? 0) + 1;
        nextProfile.unopenedChests = curChests;
      }

      if (extraRewards?.packId && extraRewards.packQty) {
        const curPacks = { ...(nextProfile.unopenedPacks ?? {}) };
        curPacks[extraRewards.packId] =
          (curPacks[extraRewards.packId] ?? 0) + extraRewards.packQty;
        nextProfile.unopenedPacks = curPacks;
      }

      if (extraRewards?.cardsAdd) {
        const curCards = { ...(nextProfile.cards ?? {}) };
        for (const [cId, qty] of Object.entries(extraRewards.cardsAdd)) {
          curCards[cId] = Math.max(curCards[cId] ?? 0, qty);
        }
        nextProfile.cards = curCards;
      }

      return nextProfile;
    });
  }

  function handleToggleEquipCard(cardId: string) {
    const current = [...activeEquippedIds];
    const existsIdx = current.indexOf(cardId);
    let nextIds: string[];
    if (existsIdx >= 0) {
      nextIds = current.filter((id) => id !== cardId);
    } else if (current.length >= DUNGEON_REQUIRED_CARDS) {
      nextIds = [...current.slice(1), cardId];
    } else {
      nextIds = [...current, cardId];
    }

    const nextState: PlayerDungeonState = {
      ...dungeonState,
      loadout: { equippedCardIds: nextIds },
      updatedAt: new Date().toISOString(),
    };
    void persistDungeonState(nextState);
  }

  function handleStartPortal(startFloor: number) {
    if (!equippedValidation.valid) {
      setStatusBanner({
        tone: "error",
        text:
          equippedValidation.error ??
          "Selecione exatamente 3 cartas da sua coleção antes de entrar na masmorra.",
      });
      return;
    }
    const res = startDungeonRun({
      state: dungeonState,
      startFloor,
      level: effectiveLevel,
      equippedCards: equippedValidation.cards,
    });
    if (!res.ok) {
      setStatusBanner({
        tone: "error",
        text: res.error ?? "Não foi possível iniciar a expedição.",
      });
      return;
    }
    setStatusBanner(null);
    void persistDungeonState(res.state);
    setInRunView(true);
  }

  function handleResumeRun() {
    if (!dungeonState.currentRun?.active) return;
    if (!equippedValidation.valid) {
      setStatusBanner({
        tone: "error",
        text: "Equipe 3 cartas válidas para retomar sua expedição.",
      });
      return;
    }
    setStatusBanner(null);
    setInRunView(true);
  }

  function handleCraft(recipeId: string) {
    const res = craftDungeonRecipe(dungeonState, recipeId);
    if (!res.ok || !res.recipe) {
      setStatusBanner({
        tone: "error",
        text: res.error ?? "Não foi possível forjar este item.",
      });
      return;
    }
    const recipe = res.recipe;
    if (recipe.category === "pack") {
      void persistDungeonState(res.state, {
        packId: recipe.targetId,
        packQty: recipe.quantity,
      });
    } else if (recipe.category === "chest") {
      void persistDungeonState(res.state, { chestId: recipe.targetId });
    } else {
      void persistDungeonState(res.state, { coins: recipe.quantity });
    }
    setStatusBanner({
      tone: "success",
      text: `⚗️ Forja concluída! Você recebeu ${recipe.quantity}× ${recipe.name}.`,
    });
  }

  /* ------------------ Renderização da Run Ativa (Andar) ------------------ */
  if (inRunView) {
    const runCards = equippedValidation.valid
      ? equippedValidation.cards
      : cardCatalog.slice(0, 3);
    return (
      <div className="space-y-4">
        <DungeonEncounterStage
          dungeonState={dungeonState}
          equippedCards={runCards}
          effectiveLevel={effectiveLevel}
          onUpdateState={(nextState) => void persistDungeonState(nextState)}
          onFloorClearExtract={(nextState, coinsEarned, xpEarned, summaryTitle) => {
            void persistDungeonState(nextState, { coins: coinsEarned, xp: xpEarned });
            setInRunView(false);
            setStatusBanner({
              tone: "success",
              text: `📜 ${summaryTitle}: +${coinsEarned} Moedas, +${xpEarned} XP e 100% dos itens salvos no inventário!`,
            });
          }}
          onGuardianClear={(
            nextState,
            chestId,
            coinsEarned,
            xpEarned,
            unlockedCheckpoint,
          ) => {
            void persistDungeonState(nextState, {
              chestId,
              coins: coinsEarned,
              xp: xpEarned,
            });
            setStatusBanner({
              tone: "success",
              text: `👑 Guardião do Andar ${unlockedCheckpoint} derrotado! Portal desbloqueado e Baú entregue na mochila.`,
            });
          }}
          onDefeatResolved={(nextState, keptCoins, summary) => {
            void persistDungeonState(nextState, { coins: keptCoins });
            setStatusBanner({
              tone: "info",
              text: `💫 Expedição encerrada por falta de HP. Você resgatou ${Math.round(summary.retentionRate * 100)}% da mochila (+${keptCoins} Moedas).`,
            });
          }}
          onPauseAndExit={() => setInRunView(false)}
        />
      </div>
    );
  }

  /* --------------------- Renderização do Hub da Masmorra --------------------- */
  return (
    <div className="space-y-5">
      {/* Cabeçalho do Hub */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-purple-500/40 bg-gradient-to-br from-slate-950 via-indigo-950/90 to-purple-950/80 p-4 sm:p-5 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onExit}
            className="rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 font-bold"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Menu
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-purple-500/30 border border-purple-400/50 px-2.5 py-0.5 text-[10px] font-black uppercase text-purple-200">
                🧪 Exclusivo ADM • Nv. {DUNGEON_UNLOCK_LEVEL}+
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-slate-200">
                Nível Simulado/Atual: {effectiveLevel}
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-black tracking-tight mt-0.5">
              🏰 Masmorra: Expedição Lógica
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs font-black text-amber-200 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
            Estamina: {dungeonState.stamina.current} / {dungeonState.stamina.max}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAdmPanelOpen((v) => !v)}
            className="rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 text-xs font-bold"
          >
            <Wrench className="h-3.5 w-3.5 mr-1" /> Ferramentas ADM
          </Button>
        </div>
      </div>

      {/* Painel Retrátil de Testes ADM */}
      {admPanelOpen && (
        <div className="rounded-3xl border-2 border-dashed border-purple-500/50 bg-purple-500/5 p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-black text-purple-600 dark:text-purple-300">
                🧪 Painel de Simulação & Testes do Administrador
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Teste bloqueios de nível, estamina cross-game, cartas, checkpoints e crafting sem
                afetar os alunos.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: `Real (Nv.${profile?.level ?? 10})`, val: null },
                { label: "Nv. 4 (Bloqueado)", val: 4 },
                { label: "Nv. 7 (Andares 1–10)", val: 7 },
                { label: "Nv. 10 (Andares 1–15)", val: 10 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setSimulatedLevel(opt.val)}
                  className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                    simulatedLevel === opt.val
                      ? "border-purple-500 bg-purple-500 text-white"
                      : "bg-card text-foreground hover:border-purple-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const next = {
                  ...dungeonState,
                  stamina: {
                    ...dungeonState.stamina,
                    current: Math.min(DUNGEON_MAX_STAMINA, dungeonState.stamina.current + 1),
                  },
                };
                void persistDungeonState(next);
              }}
              className="rounded-xl text-xs font-bold"
            >
              +1 Estamina
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const next = {
                  ...dungeonState,
                  stamina: {
                    ...dungeonState.stamina,
                    current: DUNGEON_MAX_STAMINA,
                    matchesSinceLastPoint: 0,
                  },
                };
                void persistDungeonState(next);
              }}
              className="rounded-xl text-xs font-bold"
            >
              Recarregar 5/5
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const grantCards: Record<string, number> = {};
                for (const c of cardCatalog.slice(0, 5)) {
                  grantCards[c.id] = Math.max(ownedCardsMap[c.id] ?? 0, 1);
                }
                void persistDungeonState(dungeonState, { cardsAdd: grantCards });
                setStatusBanner({
                  tone: "info",
                  text: "🃏 5 cartas concedidas ao seu perfil para testar o Deck de Expedição!",
                });
              }}
              className="rounded-xl text-xs font-bold"
            >
              Conceder Cartas de Teste
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const grantRes: DungeonResourceInventory = {};
                for (const rId of DUNGEON_RESOURCE_IDS) grantRes[rId] = 5;
                void persistDungeonState({
                  ...dungeonState,
                  permanentResources: addResourcesToInventory(
                    dungeonState.permanentResources,
                    grantRes,
                  ),
                });
                setStatusBanner({
                  tone: "info",
                  text: "🎒 +5 de cada recurso da masmorra adicionados para testar a Forja!",
                });
              }}
              className="rounded-xl text-xs font-bold"
            >
              +5 Recursos (Forja)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void persistDungeonState({
                  ...dungeonState,
                  progression: {
                    ...dungeonState.progression,
                    unlockedCheckpoints: [1, 5, 10],
                    highestFloorReached: Math.max(
                      dungeonState.progression.highestFloorReached,
                      10,
                    ),
                  },
                });
              }}
              className="rounded-xl text-xs font-bold"
            >
              Liberar Portais 5 & 10
            </Button>

            <div className="flex items-center gap-1.5 ml-auto">
              <select
                value={simGameId}
                onChange={(e) => setSimGameId(e.target.value as GameId)}
                className="h-8 rounded-xl border bg-background px-2 text-xs font-semibold"
              >
                {ALL_GAME_IDS.map((g) => (
                  <option key={g} value={g}>
                    {GAME_NAMES[g]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const res = recordExternalMatchForDungeonStamina(
                    dungeonState,
                    simGameId,
                    getLocalDateKey(),
                  );
                  void persistDungeonState(res.state);
                  setStatusBanner({
                    tone: "info",
                    text: res.triggeredFullRecharge
                      ? "⚡ Meta de 10 partidas em 3+ jogos atingida! Estamina recarregada para 5/5!"
                      : res.staminaGained > 0
                        ? `⚡ +${res.staminaGained} Estamina recuperada após 3 partidas!`
                        : `🎮 Partida simulada em ${GAME_NAMES[simGameId]} contabilizada na recarga.`,
                  });
                }}
                className="h-8 rounded-xl text-xs font-bold"
              >
                Simular Partida
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Feedback */}
      {statusBanner && (
        <div
          className={`rounded-2xl border-2 px-4 py-3 text-xs sm:text-sm font-bold flex items-center justify-between gap-2 ${
            statusBanner.tone === "error"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : statusBanner.tone === "success"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Navegação em Pílulas (Aba Pílula) da Masmorra */}
      <div
        role="tablist"
        aria-label="Seções da Masmorra"
        className="grid grid-cols-2 sm:grid-cols-4 items-center gap-1 rounded-full border border-border/80 bg-card/80 p-1.5 shadow-sm backdrop-blur-sm"
      >
        {[
          { id: "expedicao" as const, label: "Expedição", icon: Compass },
          { id: "forja" as const, label: "Forja & Alquimia", icon: FlaskConical },
          { id: "mochila" as const, label: "Mochila & Bestiário", icon: Backpack },
          { id: "ranking" as const, label: "Exploradores", icon: Trophy },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                active
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= ABA 1: EXPEDIÇÃO ================= */}
      {activeTab === "expedicao" && (
        <div className="space-y-5">
          {/* Bloqueio por Nível < 5 */}
          {!access.unlocked && (
            <div className="rounded-3xl border-2 border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-2">
              <Lock className="mx-auto h-10 w-10 text-amber-500" />
              <h3 className="font-display text-lg font-black text-foreground">
                Masmorra Bloqueada (Exige Nível {DUNGEON_UNLOCK_LEVEL})
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {access.reason} Continue jogando os desafios da plataforma para alcançar o Nível 5 e
                destravar a Expedição Lógica!
              </p>
            </div>
          )}

          {/* Barra de Estamina e Progresso de Recarga Cross-Game */}
          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm sm:text-base font-black text-foreground flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-amber-500" /> Energia de Entrada (Estamina)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cada novo andar iniciado consome <b>1 de estamina</b>. Jogue outros modos da
                  plataforma para recarregar!
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: DUNGEON_MAX_STAMINA }, (_, idx) => (
                  <div
                    key={idx}
                    className={`h-4 w-8 rounded-full border transition-all ${
                      idx < dungeonState.stamina.current
                        ? "border-amber-400 bg-gradient-to-r from-amber-400 to-orange-500 shadow-sm"
                        : "border-border bg-muted"
                    }`}
                  />
                ))}
                <span className="ml-1 font-mono text-sm font-black">
                  {dungeonState.stamina.current}/{dungeonState.stamina.max}
                </span>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-2xl border bg-background/70 p-3 flex items-center justify-between">
                <div className="text-xs">
                  <div className="font-extrabold text-foreground">Recarga Rápida (+1 Estamina)</div>
                  <div className="text-muted-foreground">
                    Conclua <b>{DUNGEON_MATCHES_PER_STAMINA} partidas</b> em qualquer jogo
                  </div>
                </div>
                <span className="rounded-xl bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 font-mono text-xs font-black text-amber-600 dark:text-amber-300">
                  {dungeonState.stamina.matchesSinceLastPoint}/{DUNGEON_MATCHES_PER_STAMINA}
                </span>
              </div>

              <div className="rounded-2xl border bg-background/70 p-3 flex items-center justify-between">
                <div className="text-xs">
                  <div className="font-extrabold text-foreground">Recarga Total (5/5)</div>
                  <div className="text-muted-foreground">
                    <b>{DUNGEON_FULL_RECHARGE_MATCHES} partidas</b> em pelo menos{" "}
                    <b>{DUNGEON_FULL_RECHARGE_DISTINCT_GAMES} jogos diferentes</b>
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] font-black text-sky-600 dark:text-sky-300">
                  <div>
                    {dungeonState.stamina.crossGameCycle.totalMatches}/
                    {DUNGEON_FULL_RECHARGE_MATCHES} part.
                  </div>
                  <div>
                    {dungeonState.stamina.crossGameCycle.distinctGamesPlayed.length}/
                    {DUNGEON_FULL_RECHARGE_DISTINCT_GAMES} jogos
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Banner de Retomada caso exista Run Pausada */}
          {dungeonState.currentRun?.active && (
            <div className="rounded-3xl border-2 border-emerald-500/60 bg-gradient-to-r from-emerald-500/15 via-card to-teal-500/15 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div className="space-y-1">
                <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                  Expedição em Andamento (Pausada)
                </span>
                <h3 className="font-display text-lg font-black text-foreground">
                  Andar {dungeonState.currentRun.currentFloor} • HP {dungeonState.currentRun.hp}/
                  {dungeonState.currentRun.maxHp}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Retomar não gasta estamina adicional! Você também pode extrair sua mochila atual
                  com segurança (100%).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const ext = extractDungeonRun(dungeonState);
                    void persistDungeonState(ext.state, {
                      coins: ext.coinsEarned,
                      xp: ext.xpEarned,
                    });
                    setStatusBanner({
                      tone: "success",
                      text: `📜 Mochila extraída com 100% de segurança (+${ext.coinsEarned} Moedas, +${ext.xpEarned} XP).`,
                    });
                  }}
                  className="rounded-xl font-bold"
                >
                  Extrair Mochila (100%)
                </Button>
                <Button
                  type="button"
                  onClick={handleResumeRun}
                  className="rounded-xl font-display font-black"
                >
                  <Play className="h-4 w-4 mr-1.5" /> Retomar Andar{" "}
                  {dungeonState.currentRun.currentFloor}
                </Button>
              </div>
            </div>
          )}

          {/* Deck de Expedição (3 Cartas Obrigatórias com Memória Automática) */}
          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-black text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Deck de Expedição (3 Cartas
                  Obrigatórias)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Suas 3 cartas escolhidas ficam salvas automaticamente para as próximas incursões.
                  Raridade e carta única definem seus bônus!
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-black ${
                  equippedValidation.valid
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                    : "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                }`}
              >
                {activeEquippedIds.length}/{DUNGEON_REQUIRED_CARDS} Equipadas
              </span>
            </div>

            {/* Resumo dos Bônus Agregados das 3 Cartas */}
            {equippedValidation.cards.length > 0 && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-primary">
                  Bônus Ativos do Trio Selecionado
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {aggregatedBonuses.cardBonuses.map((cb) => (
                    <div
                      key={cb.cardId}
                      className="rounded-xl border bg-background/90 px-3 py-2 text-xs space-y-0.5"
                    >
                      <div className="font-extrabold text-foreground flex items-center justify-between gap-1">
                        <span className="truncate">
                          {cb.skillEmoji} {cb.cardName}
                        </span>
                        <span className="text-primary font-black">+{cb.totalPowerPercent}%</span>
                      </div>
                      <div className="text-[10px] font-semibold text-muted-foreground">
                        {CARD_RARITY_META[cb.rarity].label}
                        {cb.isFoil ? " • Foil (+3%)" : ""} • {cb.skillName}
                      </div>
                      <div className="text-[11px] font-bold text-foreground/90">
                        {cb.effectSummary}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-bold">
                  <span className="rounded-lg bg-background px-2 py-0.5 border">
                    ❤️ HP Máx: {100 + aggregatedBonuses.bonusMaxHp}
                  </span>
                  {aggregatedBonuses.extraTimerSeconds > 0 && (
                    <span className="rounded-lg bg-background px-2 py-0.5 border">
                      ⏳ +{aggregatedBonuses.extraTimerSeconds}s Timer
                    </span>
                  )}
                  {aggregatedBonuses.errorShieldsPerFloor > 0 && (
                    <span className="rounded-lg bg-background px-2 py-0.5 border">
                      🛡️ {aggregatedBonuses.errorShieldsPerFloor} Escudo(s)/Andar
                    </span>
                  )}
                  {aggregatedBonuses.critChancePercent > 0 && (
                    <span className="rounded-lg bg-background px-2 py-0.5 border">
                      ⚡ {aggregatedBonuses.critChancePercent}% Crítico
                    </span>
                  )}
                  {aggregatedBonuses.extraLootChancePercent > 0 && (
                    <span className="rounded-lg bg-background px-2 py-0.5 border">
                      ⛏️ +{aggregatedBonuses.extraLootChancePercent}% Drop Extra
                    </span>
                  )}
                  {aggregatedBonuses.revealProgressIcons && (
                    <span className="rounded-lg bg-background px-2 py-0.5 border">
                      🔮 Radar de Barra Ativo
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Galeria de Cartas Disponíveis para Equipar */}
            {ownedCardDefinitions.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                Você ainda não possui cartas na coleção. Abra pacotes ou use{" "}
                <b>Ferramentas ADM → Conceder Cartas de Teste</b> para testar.
              </div>
            ) : (
              (() => {
                const cardsPagination = paginateItems(ownedCardDefinitions, cardsPage);
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {cardsPagination.pageItems.map((card) => {
                        const isEquipped = activeEquippedIds.includes(card.id);
                        const bonus = resolveCardDungeonBonus(card);
                        return (
                          <div
                            key={card.id}
                            onClick={() => handleToggleEquipCard(card.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleToggleEquipCard(card.id);
                              }
                            }}
                            className={`relative rounded-2xl p-1.5 border-2 transition-all cursor-pointer ${
                              isEquipped
                                ? "border-primary bg-primary/15 ring-2 ring-primary/30 scale-[1.02]"
                                : "border-transparent hover:border-border bg-background/40"
                            }`}
                          >
                            {isEquipped && (
                              <span className="absolute -top-2 -right-2 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                              </span>
                            )}
                            <CollectibleCardView
                              card={card}
                              count={ownedCardsMap[card.id]}
                              compact
                            />
                            <div className="mt-1.5 text-center space-y-0.5">
                              <div className="text-[10px] font-black text-primary truncate">
                                {bonus.skillEmoji} {bonus.skillName} (+{bonus.totalPowerPercent}%)
                              </div>
                              <div className="text-[9px] text-muted-foreground line-clamp-2 leading-tight">
                                {bonus.effectSummary}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <CardPagination
                      totalItems={ownedCardDefinitions.length}
                      currentPage={cardsPagination.currentPage}
                      totalPages={cardsPagination.totalPages}
                      startItem={cardsPagination.startItem}
                      endItem={cardsPagination.endItem}
                      onPageChange={setCardsPage}
                    />
                  </div>
                );
              })()
            )}
          </div>

          {/* Seletor de Portais / Biomas */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-black text-foreground">
                Portais da Masmorra (Profundidade Máxima: Andar {access.maxAllowedFloor || 0})
              </h3>
              <span className="text-xs text-muted-foreground">{access.reason}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {DUNGEON_PORTALS.map((portal) => {
                const biome = DUNGEON_BIOMES.find((b) => b.id === portal.biomeId)!;
                const check = canStartFromPortal(portal.id, effectiveLevel, dungeonState);
                const checkpointUnlocked =
                  dungeonState.progression.unlockedCheckpoints.includes(portal.requiredCheckpoint);
                const canClick =
                  check.ok && equippedValidation.valid && !dungeonState.currentRun?.active;

                return (
                  <div
                    key={portal.id}
                    className={`flex flex-col justify-between rounded-3xl border-2 ${biome.accentBorderClass} bg-gradient-to-br ${biome.gradientClass} p-4 text-white shadow-lg space-y-4`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${biome.badgeClass}`}
                        >
                          Andares {biome.minFloor}–{biome.maxFloor}
                        </span>
                        {checkpointUnlocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-300">
                            <Unlock className="h-3 w-3" /> Portal Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-white/70">
                            <Lock className="h-3 w-3" /> Checkpoint {portal.requiredCheckpoint}
                          </span>
                        )}
                      </div>

                      <h4 className="font-display text-lg font-black leading-tight">
                        {portal.name}
                      </h4>
                      <p className="text-xs text-white/80 leading-snug">{portal.description}</p>

                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-white/70">
                          Recursos deste Bioma:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {biome.lootTable.map((rId) => {
                            const rm = DUNGEON_RESOURCES[rId];
                            return (
                              <span
                                key={rId}
                                className="rounded-lg bg-black/35 border border-white/15 px-2 py-0.5 text-[10px] font-bold"
                              >
                                {rm.emoji} {rm.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="text-[11px] font-bold text-amber-300">
                        👑 Guardião (Andar {biome.guardianFloor}): {biome.guardianName}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Button
                        type="button"
                        disabled={!canClick}
                        onClick={() => handleStartPortal(portal.startFloor)}
                        className="w-full h-11 rounded-2xl bg-white text-slate-950 hover:bg-white/90 font-display font-black text-xs disabled:opacity-50"
                      >
                        {dungeonState.currentRun?.active
                          ? "Finalize ou pause a run atual"
                          : !equippedValidation.valid
                            ? "Equipe 3 cartas acima"
                            : !check.ok
                              ? check.reason
                              : `Entrar no Andar ${portal.startFloor} (1 Estamina) →`}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= ABA 2: FORJA & ALQUIMIA ================= */}
      {activeTab === "forja" && (
        <div className="space-y-4">
          {/* Saldo de Recursos Permanentes */}
          <div className="rounded-3xl border bg-card p-4 space-y-2">
            <h3 className="font-display text-sm font-black text-foreground flex items-center gap-1.5">
              <Hammer className="h-4 w-4 text-amber-500" /> Seus Recursos Extraídos da Masmorra
            </h3>
            <div className="flex flex-wrap gap-2">
              {DUNGEON_RESOURCE_IDS.map((rId) => {
                const rm = DUNGEON_RESOURCES[rId];
                const qty = dungeonState.permanentResources[rId] ?? 0;
                return (
                  <span
                    key={rId}
                    className={`rounded-xl border px-2.5 py-1 text-xs font-bold ${
                      qty > 0 ? rm.badgeClass : "border-border bg-muted/40 text-muted-foreground opacity-60"
                    }`}
                  >
                    {rm.emoji} {rm.name}: <b>{qty}</b>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Receitas de Crafting */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DUNGEON_CRAFT_RECIPES.map((recipe) => {
              const canAfford = Object.entries(recipe.cost).every(
                ([rId, req]) =>
                  (dungeonState.permanentResources[rId as keyof DungeonResourceInventory] ?? 0) >=
                  (req ?? 0),
              );
              const targetHint =
                recipe.category === "pack"
                  ? packsCatalog.find((p) => p.id === recipe.targetId)?.description ??
                    recipe.description
                  : recipe.category === "chest"
                    ? chestsCatalog.find((c) => c.id === recipe.targetId)?.description ??
                      recipe.description
                    : recipe.description;

              return (
                <div
                  key={recipe.id}
                  className={`flex flex-col justify-between rounded-3xl border-2 ${recipe.accentClass} bg-card p-4 shadow-xs space-y-3`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{recipe.emoji}</span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary">
                        {recipe.category === "pack"
                          ? "Pacote de Cartas"
                          : recipe.category === "chest"
                            ? "Baú da Plataforma"
                            : "Moedas"}
                      </span>
                    </div>
                    <h4 className="font-display text-base font-black text-foreground">
                      {recipe.name}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-snug">{targetHint}</p>

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-black uppercase text-muted-foreground">
                        Custo de Forja:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(recipe.cost).map(([rId, req]) => {
                          const rm = DUNGEON_RESOURCES[rId as keyof typeof DUNGEON_RESOURCES];
                          const have =
                            dungeonState.permanentResources[
                              rId as keyof DungeonResourceInventory
                            ] ?? 0;
                          const ok = have >= (req ?? 0);
                          return (
                            <span
                              key={rId}
                              className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                                ok
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                  : "border-destructive/40 bg-destructive/10 text-destructive"
                              }`}
                            >
                              {rm.emoji} {have}/{req} {rm.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => handleCraft(recipe.id)}
                    className="w-full h-10 rounded-xl font-display font-black text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Forjar Agora
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= ABA 3: MOCHILA & BESTIÁRIO ================= */}
      {activeTab === "mochila" && (
        <div className="space-y-5">
          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-black text-foreground flex items-center gap-2">
              <Backpack className="h-4 w-4 text-primary" /> Inventário Permanente de Recursos
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {DUNGEON_RESOURCE_IDS.map((rId) => {
                const rm = DUNGEON_RESOURCES[rId];
                const qty = dungeonState.permanentResources[rId] ?? 0;
                return (
                  <div
                    key={rId}
                    className="rounded-2xl border bg-background/70 p-3 flex items-start gap-3"
                  >
                    <span className="text-2xl">{rm.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display text-xs font-black text-foreground truncate">
                          {rm.name}
                        </span>
                        <span className="font-mono text-sm font-black text-primary">{qty}</span>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {rm.rarityLabel}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {rm.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-black text-foreground flex items-center gap-2">
              <Swords className="h-4 w-4 text-rose-500" /> Bestiário da Masmorra
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DUNGEON_MONSTERS.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-3.5 space-y-1.5 ${
                    m.isGuardian
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-border bg-background/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{m.emoji}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        m.isGuardian
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.isGuardian ? "👑 Guardião" : `${m.hitsRequired} golpes`}
                    </span>
                  </div>
                  <div className="font-display text-sm font-black text-foreground">{m.name}</div>
                  <p className="text-xs text-muted-foreground leading-snug">{m.lore}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= ABA 4: EXPLORADORES (RANKING DUPLO) ================= */}
      {activeTab === "ranking" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-black text-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Ranking de Profundidade
            </h3>
            <p className="text-xs text-muted-foreground">
              Quem chegou mais fundo na masmorra e derrotou mais Guardiões.
            </p>
            {allPlayersRankings.depthRanking.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                Nenhum explorador registrou profundidade ainda. Inicie uma expedição para estrear o
                placar!
              </div>
            ) : (
              <div className="space-y-2">
                {allPlayersRankings.depthRanking.map((row, idx) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-2xl border bg-background/70 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-black text-primary">#{idx + 1}</span>
                      <div className="truncate">
                        <div className="font-extrabold text-foreground truncate">{row.nick}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {row.school} • Nv.{row.level}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-amber-500">Andar {row.highestFloor}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.bossesDefeated} Guardiões
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border bg-card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-black text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" /> Ranking de Explorador
            </h3>
            <p className="text-xs text-muted-foreground">
              Maiores mestres em andares concluídos sem erros (100% perfeitos).
            </p>
            {allPlayersRankings.explorerRanking.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                Nenhum andar concluído ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {allPlayersRankings.explorerRanking.map((row, idx) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-2xl border bg-background/70 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-black text-emerald-500">#{idx + 1}</span>
                      <div className="truncate">
                        <div className="font-extrabold text-foreground truncate">{row.nick}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {row.school} • Nv.{row.level}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-emerald-500">
                        {row.flawlessFloorsCleared} Perfeitos
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.totalFloorsCleared} andares totais
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
