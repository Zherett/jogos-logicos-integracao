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
}

export function PlayerMedalsInventory({
  unlockedMedals = [],
  customMedals = [],
  profile,
  stats = [],
  isOwner = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedRarity, setSelectedRarity] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"vitrine" | "catalogo" | "eventos">("vitrine");
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
      const cached = getCachedMedalPioneers();
      if (cached && Object.keys(cached).length > 0) return cached;
      const reg = loadRegistryReadOnly();
      const players = Object.values(reg)
        .map((a) => a?.profile)
        .filter((p): p is PlayerProfile => Boolean(p));
      return getCachedMedalPioneers(players) ?? {};
    } catch {
      return getCachedMedalPioneers() ?? {};
    }
  }, []);

  const showcase = useMemo(
    () => getTopShowcaseMedals(unlockedMedals ?? [], allMedals),
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
      {/* Abas: Vitrine de Honra, Catálogo Geral & Catálogo de Eventos */}
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

      {activeTab === "vitrine" && (
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
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
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-2xl border-2 p-2.5 sm:p-3.5 text-center bg-card/90 cursor-pointer transition-all hover:scale-[1.03] active:scale-95 ${
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
                      <span className="absolute -top-2.5 left-2.5 sm:left-3.5 rounded-full bg-primary px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-primary-foreground shadow-sm">
                        #{idx + 1}<span className="hidden sm:inline"> Vitrine</span>
                      </span>
                      {isSecretRevealed && (
                        <span
                          className={`absolute -top-2.5 ${
                            showStackBadge ? "right-5 sm:right-7" : "right-2.5 sm:right-3.5"
                          } rounded-full bg-emerald-950/90 border border-emerald-400 px-2 sm:px-2.5 py-0.5 text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-300 shadow-sm flex items-center gap-0.5 sm:gap-1 animate-pulse`}
                        >
                          <span>✨</span>
                          <span className="hidden sm:inline">Secreta</span>
                        </span>
                      )}
                      {showStackBadge && (
                        <span
                          className="absolute -top-2.5 -right-2.5 flex h-6 min-w-6 sm:h-7 sm:min-w-7 px-1.5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 font-mono text-[11px] sm:text-xs font-black border-2 border-background shadow-lg z-10"
                          title={`${stackCount}x medalha(s) conquistada(s)`}
                        >
                          {stackCount}
                        </span>
                      )}
                      <div className={`mb-2.5 sm:mb-3.5 mt-1 ${isSecretRevealed ? "text-emerald-400" : rarity.textColor}`}>
                        <MedalIcon name={m.iconName} className="h-12 w-12 sm:h-16 sm:w-16" />
                      </div>
                      <span
                        className={`rounded-full border px-2.5 sm:px-3.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-black uppercase tracking-wide ${
                          isSecretRevealed
                            ? "border-emerald-400/80 bg-emerald-950/60 text-emerald-300"
                            : rarity.badgeBgClass
                        }`}
                      >
                        {rarity.label}
                      </span>
                      <h4 className="mt-2 sm:mt-3 px-1 line-clamp-2 font-display text-[13px] sm:text-base font-black leading-snug text-foreground">
                        {m.title}
                      </h4>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Medalhas do Torneio Semanal Ranqueado (Top 5 com contadores acumulativos) */}
          {profile?.tournamentMedals && profile.tournamentMedals.length > 0 && (
            <div className="rounded-2xl border bg-card/80 p-4 space-y-2.5">
              <span className="font-display text-xs font-black uppercase text-amber-500 flex items-center gap-1.5">
                <Trophy className="h-4 w-4" /> Medalhas do Torneio Semanal (Top 5)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.tournamentMedals.map((tm) => (
                  <div
                    key={tm.id}
                    className="flex items-center justify-between gap-2 rounded-xl border bg-secondary/30 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {tm.rank === 1 ? "🥇" : tm.rank === 2 ? "🥈" : tm.rank === 3 ? "🥉" : "🏅"}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 font-display text-xs font-black">
                          <span>Top {tm.rank} Semanal</span>
                          {(tm.count ?? 1) > 1 && (
                            <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.2 text-[10px] font-black text-amber-600 dark:text-amber-400">
                              x{tm.count}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{tm.label}</div>
                      </div>
                    </div>
                    {(tm.count ?? 1) > 1 && (
                      <span className="rounded-lg bg-primary/10 px-2 py-1 font-mono text-xs font-extrabold text-primary">
                        {tm.count}x Conquistada
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick link to catalogue */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[48vh] overflow-y-auto pr-1">
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
        progressText={selectedMedalEntry?.progress.progressText}
        percentComplete={selectedMedalEntry?.progress.percent}
      />
    </div>
  );
}
