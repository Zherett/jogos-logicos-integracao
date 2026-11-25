import { useState, useMemo, useEffect } from "react";
import {
  Trophy,
  Award,
  Medal,
  Star,
  Sparkles,
  Lock,
  Search,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import {
  getAllAvailableMedals,
  getTopShowcaseMedals,
  calculateMedalProgress,
  RARITY_INFO,
  CATEGORY_LABELS,
  type MedalCategory,
  type MedalDefinition,
  type MedalRarity,
  type PlayerUnlockedMedal,
} from "@/lib/medals-catalog";
import { MEDAL_POINTS_REWARDS } from "@/lib/career-points";
import { MedalIcon } from "./MedalIcon";
import { MedalDetailModal } from "./MedalDetailModal";
import { Input } from "@/components/ui/input";
import { loadRegistryReadOnly, type PlayerProfile, type GameStatRow } from "@/lib/playfab";
import { getCachedMedalPioneers } from "@/lib/medal-pioneers";

interface Props {
  unlockedMedals?: PlayerUnlockedMedal[];
  customMedals?: MedalDefinition[];
  profile?: PlayerProfile | null;
  stats?: GameStatRow[];
  isOwner?: boolean;
  alwaysShowShowcase?: boolean;
}

export function PlayerMedalsInventory({
  unlockedMedals = [],
  customMedals = [],
  profile,
  stats = [],
  isOwner = false,
  alwaysShowShowcase = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedRarity, setSelectedRarity] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"vitrine" | "catalogo" | "eventos">(
    alwaysShowShowcase ? "catalogo" : "vitrine",
  );
  const [catalogVisibleLimit, setCatalogVisibleLimit] = useState<number>(24);

  // Selected medal for detail modal
  const [selectedMedal, setSelectedMedal] = useState<MedalDefinition | null>(null);

  useEffect(() => {
    setCatalogVisibleLimit(24);
  }, [activeTab, search, selectedCategory, selectedRarity]);

  const allMedals = useMemo(() => getAllAvailableMedals(customMedals), [customMedals]);
  const eventMedalsList = useMemo(
    () => allMedals.filter((m) => m.category === "evento" || Boolean(m.eventId)),
    [allMedals],
  );
  const unlockedMap = useMemo(() => {
    const map = new Map<string, PlayerUnlockedMedal>();
    (unlockedMedals ?? []).forEach((u) => {
      if (u && u.medalId) map.set(u.medalId, u);
    });
    return map;
  }, [unlockedMedals]);

  const pioneers = useMemo(() => {
    try {
      const reg = loadRegistryReadOnly();
      const players = Object.values(reg)
        .map((a) => a?.profile)
        .filter((p): p is PlayerProfile => Boolean(p));
      return getCachedMedalPioneers(players) ?? {};
    } catch {
      return getCachedMedalPioneers() ?? {};
    }
  }, [unlockedMedals, profile?.id, profile?.xp]);

  const showcase = useMemo(
    () => getTopShowcaseMedals(unlockedMedals ?? [], allMedals, 8),
    [unlockedMedals, allMedals],
  );

  // Map each medal to its progress and unlock state (deferred until catalog/events tab or modal is opened)
  const needsFullCatalogProgress = activeTab !== "vitrine" || Boolean(selectedMedal);
  const sortedMedals = useMemo(() => {
    if (!needsFullCatalogProgress) return [];
    const medalsWithProgress = allMedals.map((m) => {
      const unlocked = unlockedMap.get(m.id) ?? null;
      const progress = calculateMedalProgress(m, profile, stats);
      return {
        medal: m,
        unlocked,
        progress,
      };
    });

    // Smart sorting:
    // 1º) Conquistadas (obtidas) primeiro
    // 2º) Mais próximas de serem obtidas (maior percentual de progresso)
    // 3º) Raridade / Título
    return [...medalsWithProgress].sort((a, b) => {
      const aUnlocked = Boolean(a.unlocked);
      const bUnlocked = Boolean(b.unlocked);
      if (aUnlocked && !bUnlocked) return -1;
      if (!aUnlocked && bUnlocked) return 1;

      // Both locked: sort by highest progress percent
      if (!aUnlocked && !bUnlocked) {
        if (b.progress.percent !== a.progress.percent) {
          return b.progress.percent - a.progress.percent;
        }
      }

      // Both unlocked: sort by rarity weight (Diamante -> Platina -> Ouro -> Prata -> Bronze)
      const wA = RARITY_INFO[a.medal.rarity]?.weight ?? 0;
      const wB = RARITY_INFO[b.medal.rarity]?.weight ?? 0;
      if (wB !== wA) return wB - wA;

      return a.medal.title.localeCompare(b.medal.title);
    });
  }, [needsFullCatalogProgress, allMedals, unlockedMap, profile, stats]);

  const filtered = sortedMedals.filter(({ medal: m }) => {
    if (activeTab === "eventos" && m.category !== "evento" && !m.eventId) return false;
    if (selectedCategory !== "ALL" && m.category !== selectedCategory) return false;
    if (selectedRarity !== "ALL" && m.rarity !== selectedRarity) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const isSecLocked = Boolean(m.isSecret && !unlockedMap.has(m.id));
      const effectiveTitle = isSecLocked ? "medalha secreta" : m.title.toLowerCase();
      const effectiveDesc = isSecLocked ? "medalha secreta jogue e descubra" : m.description.toLowerCase();
      const rLabel = RARITY_INFO[m.rarity]?.label.toLowerCase() ?? "";
      return (
        effectiveTitle.includes(q) ||
        effectiveDesc.includes(q) ||
        rLabel.includes(q)
      );
    }
    return true;
  });

  const selectedMedalEntry = selectedMedal
    ? sortedMedals.find((e) => e.medal.id === selectedMedal.id)
    : null;

  return (
    <div className="space-y-4">
      {/* Abas: Vitrine de Honra (se não estiver fixa acima), Catálogo Geral & Catálogo de Eventos */}
      {!alwaysShowShowcase && (
        <div className="flex flex-wrap items-center gap-2 border-b pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("vitrine")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-display text-xs font-black transition-all ${
              activeTab === "vitrine"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vitrine de Honra ({unlockedMedals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("catalogo")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-display text-xs font-black transition-all ${
              activeTab === "catalogo"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            Catálogo Geral ({allMedals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("eventos")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-display text-xs font-black transition-all ${
              activeTab === "eventos"
                ? "bg-amber-500 text-amber-950 shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            🎪 Medalhas de Eventos ({eventMedalsList.length})
          </button>
        </div>
      )}

      {(alwaysShowShowcase || activeTab === "vitrine") && (
        <div className="space-y-4">
          {/* Vitrine de Destaque Automático */}
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display text-xs font-black uppercase tracking-wider text-primary">
                <Sparkles className="h-4 w-4 text-accent" /> Vitrine de Honra (Medalhas de Maior Prestígio)
              </span>
              <span className="rounded-full bg-primary/20 px-2.5 py-0.5 font-display text-xs font-bold text-primary">
                {unlockedMedals.length} de {allMedals.length} Conquistadas
              </span>
            </div>

            {showcase.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-primary/30 p-6 text-center text-xs text-muted-foreground">
                <Medal className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="font-bold text-foreground">Inventário Vazio no Momento</p>
                <p>
                  Jogue partidas, atinja novos níveis e vença na Arena X1 para desbloquear medalhas!
                  Clique na aba <b>"Catálogo Completo"</b> para ver os objetivos de cada uma.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                {showcase.map((m, idx) => {
                  const rarity = RARITY_INFO[m.rarity];
                  const unlocked = unlockedMap.get(m.id);
                  const isSecretRevealed = Boolean(m.isSecret && unlocked);
                  const stackCount = unlocked?.count ?? 1;
                  const showStackBadge = Boolean(unlocked) && (m.isStackable || stackCount > 1);
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMedal(m)}
                      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 px-2.5 pt-4 pb-2.5 text-center bg-card/90 cursor-pointer transition-all hover:scale-[1.03] active:scale-95 ${
                        isSecretRevealed
                          ? "border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_24px_rgba(34,197,94,0.85)] animate-pulse"
                          : rarity.neonBorderClass
                      }`}
                      style={{
                        boxShadow: isSecretRevealed
                          ? "0 0 24px rgba(34, 197, 94, 0.85), inset 0 0 14px rgba(34, 197, 94, 0.35)"
                          : `0 0 15px ${rarity.glowHex}`,
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {/* Efeito de brilho reluzente igual ao das cartas colecionáveis */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl"
                      >
                        <div className="card-foil-shimmer absolute inset-y-0 w-1/2 opacity-70" />
                      </div>

                      <span className="absolute -top-2.5 left-2.5 z-10 rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase text-primary-foreground shadow-sm">
                        #{idx + 1}<span className="hidden sm:inline"> Vitrine</span>
                      </span>
                      {isSecretRevealed && (
                        <span
                          className={`absolute -top-2.5 z-10 ${
                            showStackBadge ? "right-5" : "right-2.5"
                          } rounded-full bg-emerald-950/90 border border-emerald-400 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-emerald-300 shadow-sm flex items-center gap-0.5 animate-pulse`}
                        >
                          <span>✨</span>
                          <span className="hidden sm:inline">Secreta</span>
                        </span>
                      )}
                      {showStackBadge && (
                        <span
                          className="absolute -top-2.5 -right-2 flex h-5 min-w-5 sm:h-6 sm:min-w-6 px-1 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-mono text-[10px] sm:text-[11px] font-black border-2 border-background shadow-lg z-10"
                          title={`${stackCount}x medalha(s) conquistada(s)`}
                        >
                          {stackCount}
                        </span>
                      )}
                      <div className={`relative z-10 mb-1.5 mt-0.5 ${isSecretRevealed ? "text-emerald-400" : rarity.textColor}`}>
                        <MedalIcon name={m.iconName} className="h-8 w-8 sm:h-9 sm:w-9" />
                      </div>
                      <span
                        className={`relative z-10 rounded-full border px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wide ${
                          isSecretRevealed
                            ? "border-emerald-400/80 bg-emerald-950/60 text-emerald-300"
                            : rarity.badgeBgClass
                        }`}
                      >
                        {rarity.label}
                      </span>
                      <h4 className="relative z-10 mt-1.5 px-0.5 line-clamp-2 font-display text-[11px] sm:text-xs font-black leading-tight text-foreground">
                        {m.title}
                      </h4>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Troféus do Torneio Mensal (3 slots fixos em formato de pódio: Prata | Ouro | Bronze) */}
          {(() => {
            const podiumEntries = Array.isArray(profile?.tournamentMedals)
              ? profile.tournamentMedals
              : [];
            const countForRank = (targetRank: 1 | 2 | 3): number =>
              podiumEntries.reduce((sum, tm) => {
                if (tm && tm.rank === targetRank) {
                  return sum + Math.max(1, Math.floor(Number(tm.count ?? 1) || 1));
                }
                return sum;
              }, 0);

            const silverCount = countForRank(2);
            const goldCount = countForRank(1);
            const bronzeCount = countForRank(3);

            const slots: Array<{
              rank: 1 | 2 | 3;
              label: string;
              placeLabel: string;
              count: number;
              isCenter: boolean;
              activeCardClass: string;
              activeIconClass: string;
              activeBadgeClass: string;
              activeLabelClass: string;
            }> = [
              {
                rank: 2,
                label: "Prata",
                placeLabel: "2º Lugar",
                count: silverCount,
                isCenter: false,
                activeCardClass:
                  "border-slate-400/60 dark:border-slate-300/60 bg-gradient-to-b from-slate-400/20 via-slate-400/10 to-card shadow-sm ring-1 ring-slate-400/30",
                activeIconClass:
                  "text-slate-500 dark:text-slate-300 drop-shadow-[0_2px_6px_rgba(148,163,184,0.45)]",
                activeBadgeClass:
                  "bg-slate-500/15 dark:bg-slate-200/20 border-slate-400/60 dark:border-slate-300/50 text-slate-700 dark:text-slate-100",
                activeLabelClass: "text-slate-700 dark:text-slate-200",
              },
              {
                rank: 1,
                label: "Ouro",
                placeLabel: "1º Lugar",
                count: goldCount,
                isCenter: true,
                activeCardClass:
                  "border-amber-400/75 bg-gradient-to-b from-amber-400/25 via-amber-500/10 to-card shadow-md ring-2 ring-amber-400/35",
                activeIconClass: "text-amber-400 drop-shadow-[0_2px_10px_rgba(251,191,36,0.55)]",
                activeBadgeClass:
                  "bg-amber-500/25 border-amber-400/60 text-amber-700 dark:text-amber-300",
                activeLabelClass: "text-amber-600 dark:text-amber-300",
              },
              {
                rank: 3,
                label: "Bronze",
                placeLabel: "3º Lugar",
                count: bronzeCount,
                isCenter: false,
                activeCardClass:
                  "border-orange-500/60 bg-gradient-to-b from-orange-500/20 via-amber-700/10 to-card shadow-sm ring-1 ring-orange-500/30",
                activeIconClass: "text-orange-400 drop-shadow-[0_2px_6px_rgba(251,146,60,0.45)]",
                activeBadgeClass:
                  "bg-orange-500/20 border-orange-500/50 text-orange-700 dark:text-orange-300",
                activeLabelClass: "text-orange-600 dark:text-orange-300",
              },
            ];

            return (
              <div className="rounded-2xl border bg-card/80 p-4 space-y-3">
                <div className="text-center">
                  <span className="font-display text-xs font-black uppercase tracking-wide text-amber-500">
                    Troféus do Torneio Mensal (Top 3)
                  </span>
                </div>

                <div className="grid grid-cols-3 items-end gap-2 sm:gap-3 pt-1">
                  {slots.map((slot) => {
                    const earned = slot.count > 0;
                    return (
                      <div
                        key={slot.rank}
                        title={
                          earned
                            ? `Top ${slot.rank} (${slot.label}) • ${slot.count} ${slot.count === 1 ? "troféu conquistado" : "troféus conquistados"}`
                            : `Slot vago — Conquiste o ${slot.placeLabel} no fechamento do Torneio Mensal`
                        }
                        className={`relative flex flex-col items-center justify-center rounded-2xl border transition-all ${
                          slot.isCenter ? "px-2 py-4 sm:py-5 min-h-[112px]" : "px-2 py-3 sm:py-3.5 min-h-[92px]"
                        } ${
                          earned
                            ? slot.activeCardClass
                            : "border-border/50 bg-muted/35 dark:bg-zinc-950/60 opacity-60"
                        }`}
                      >
                        {earned ? (
                          <>
                            <span
                              className={`absolute top-1.5 right-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-black leading-none ${slot.activeBadgeClass}`}
                            >
                              x{slot.count}
                            </span>
                            <Trophy
                              className={`${slot.isCenter ? "h-8 w-8 sm:h-9 sm:w-9" : "h-6 w-6 sm:h-7 sm:w-7"} ${slot.activeIconClass}`}
                            />
                            <span
                              className={`mt-1.5 font-display font-black leading-tight ${
                                slot.isCenter ? "text-xs sm:text-sm" : "text-[11px] sm:text-xs"
                              } ${slot.activeLabelClass}`}
                            >
                              {slot.placeLabel}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              Troféu {slot.label}
                            </span>
                          </>
                        ) : (
                          <>
                            <Trophy
                              className={`${slot.isCenter ? "h-7 w-7 sm:h-8 sm:w-8" : "h-5 w-5 sm:h-6 sm:w-6"} text-muted-foreground/30`}
                            />
                            <span className="mt-1.5 font-display text-[11px] font-bold text-muted-foreground/60">
                              {slot.placeLabel}
                            </span>
                            <span className="text-[9px] font-medium text-muted-foreground/45 uppercase">
                              Vago
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Quick link to catalogue (apenas quando a vitrine é aba separada) */}
          {!alwaysShowShowcase && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab("catalogo")}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2 font-display text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95"
              >
                <Trophy className="h-4 w-4" />
                Ver Todas as {allMedals.length} Medalhas e Próximos Desbloqueios ▾
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botões de Catálogo Geral & Eventos abaixo da Vitrine fixa */}
      {alwaysShowShowcase && (
        <div className="flex flex-wrap items-center gap-2 border-b pb-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab("catalogo")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-display text-xs font-black transition-all ${
              activeTab === "catalogo"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            Catálogo Geral ({allMedals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("eventos")}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-display text-xs font-black transition-all ${
              activeTab === "eventos"
                ? "bg-amber-500 text-amber-950 shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            🎪 Medalhas de Eventos ({eventMedalsList.length})
          </button>
        </div>
      )}

      {(activeTab === "catalogo" || activeTab === "eventos") && (
        <div className="space-y-3">
          {activeTab === "eventos" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5">
                <Star className="h-4 w-4" /> Medalhas Exclusivas de Eventos
              </p>
              <p className="text-[11px] opacity-90 mt-0.5">
                Estas medalhas possuem objetivos e missões especiais vinculadas aos eventos temporários e recorrentes da plataforma.
              </p>
            </div>
          )}

          {/* Barra de Busca e Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou objetivo..."
                className="pl-9 h-9 rounded-xl text-xs"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 rounded-xl border bg-card px-2.5 text-xs font-bold text-foreground"
            >
              <option value="ALL">Todas as Categorias</option>
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                <option key={cat} value={cat}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="h-9 rounded-xl border bg-card px-2.5 text-xs font-bold text-foreground"
            >
              <option value="ALL">Todas as Raridades</option>
              {(["bronze", "prata", "ouro", "platina", "diamante", "heroi"] as MedalRarity[]).map((r) => (
                <option key={r} value={r}>
                  {RARITY_INFO[r].label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-muted-foreground">
            💡 <b>Dica:</b> As medalhas já conquistadas aparecem primeiro, seguidas pelas mais próximas de serem desbloqueadas. <b>Clique em qualquer medalha</b> para ver seus detalhes e data de conquista!
          </p>

          {/* Grade Geral de Medalhas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {filtered.slice(0, catalogVisibleLimit).map(({ medal: m, unlocked, progress }) => {
              const isUnlocked = Boolean(unlocked);
              const isSecretLocked = Boolean(m.isSecret && !isUnlocked);
              const isSecretRevealed = Boolean(m.isSecret && isUnlocked);
              const rarity = RARITY_INFO[m.rarity];
              const stackCount = unlocked?.count ?? 1;
              const showStackBadge = isUnlocked && (m.isStackable || stackCount > 1);

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMedal(m)}
                  className={`group relative flex flex-col justify-between rounded-2xl border-2 p-3 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
                    isSecretRevealed
                      ? "bg-card border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(34,197,94,0.8)] animate-pulse"
                      : isUnlocked
                        ? `bg-card ${rarity.neonBorderClass}`
                        : isSecretLocked
                          ? "border-dashed border-amber-500/30 bg-secondary/15 hover:border-amber-500/60"
                          : "border-border/50 bg-secondary/20 hover:border-border hover:bg-secondary/40"
                  }`}
                  style={
                    isSecretRevealed
                      ? { boxShadow: "0 0 20px rgba(34, 197, 94, 0.8), inset 0 0 10px rgba(34, 197, 94, 0.25)" }
                      : undefined
                  }
                  role="button"
                  tabIndex={0}
                >
                  {/* Bolinha travada no canto superior direito sobre a borda da medalha */}
                  {showStackBadge && (
                    <span
                      className="absolute -top-2.5 -right-2.5 flex h-6 min-w-6 px-1.5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-mono text-[11px] font-black border-2 border-background shadow-md z-10"
                      title={`${stackCount}x medalha(s) conquistada(s)`}
                    >
                      {stackCount}
                    </span>
                  )}

                  <div className="flex items-start gap-2.5">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
                        isSecretRevealed
                          ? "border-emerald-400 bg-emerald-950/40 text-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse"
                          : isUnlocked
                            ? rarity.badgeBgClass
                            : isSecretLocked
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                              : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {isUnlocked ? (
                        <div className={isSecretRevealed ? "text-emerald-400" : rarity.textColor}>
                          <MedalIcon name={m.iconName} className="h-5 w-5" />
                        </div>
                      ) : isSecretLocked ? (
                        <HelpCircle className="h-5 w-5 text-amber-500 animate-pulse" />
                      ) : (
                        <MedalIcon name={m.iconName} className="h-5 w-5 opacity-40" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider ${
                              isUnlocked ? rarity.textColor : "text-muted-foreground"
                            }`}
                          >
                            {rarity.label}
                          </span>
                          <span className="text-[9px] font-extrabold text-amber-500">
                            +{MEDAL_POINTS_REWARDS[m.rarity] ?? 20} pts
                          </span>
                        </div>
                        {isUnlocked ? (
                          <span className="flex items-center gap-1 text-[9px] font-extrabold text-emerald-500">
                            <CheckCircle className="h-3 w-3" />
                            {showStackBadge ? `${stackCount}x Obtida` : "Obtida"}
                          </span>
                        ) : isSecretLocked ? (
                          <span className="text-[10px] font-black text-amber-500">
                            ?
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-muted-foreground">
                            {progress.percent}%
                          </span>
                        )}
                      </div>
                      <h5 className="truncate font-display text-xs font-black text-foreground">
                        {isSecretLocked ? "Medalha Secreta" : m.title}
                      </h5>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {(m.category === "evento" || m.eventName) && !isSecretLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-600 dark:text-amber-400">
                            🎪 {m.eventName ? `Evento: ${m.eventName}` : "Evento Especial"}
                          </span>
                        )}
                        {pioneers?.[m.id] && !isSecretLocked && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400"
                            title={`Pioneiro: ${pioneers[m.id].studentNick || "Aluno"} (${pioneers[m.id].studentSchool || ""})`}
                          >
                            🌟 1º: {pioneers[m.id].studentNick || "Aluno"}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {isSecretLocked
                          ? "Medalha secreta. Jogue e descubra como conquistá-la!"
                          : m.description}
                      </p>
                    </div>
                  </div>

                  {/* Barra de progresso apenas para medalhas normais não desbloqueadas */}
                  {!isUnlocked && !isSecretLocked && progress.percent > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <p className="truncate text-[9px] font-medium text-muted-foreground">
                        {progress.progressText}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length > catalogVisibleLimit && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setCatalogVisibleLimit((prev) => prev + 24)}
                className="rounded-xl border border-border bg-secondary/40 px-4 py-1.5 text-xs font-bold text-foreground hover:bg-secondary/70 transition-colors"
              >
                Mostrar mais medalhas (exibindo {Math.min(catalogVisibleLimit, filtered.length)} de {filtered.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Detalhes da Medalha */}
      <MedalDetailModal
        open={Boolean(selectedMedal)}
        onOpenChange={(v) => {
          if (!v) setSelectedMedal(null);
        }}
        medal={selectedMedal}
        unlockedInfo={selectedMedalEntry?.unlocked}
        pioneer={selectedMedal ? (pioneers[selectedMedal.id] ?? null) : null}
        progressText={selectedMedalEntry?.progress.progressText}
        percentComplete={selectedMedalEntry?.progress.percent}
      />
    </div>
  );
}
