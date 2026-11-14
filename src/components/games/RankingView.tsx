import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  ChevronDown,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  Layers,
  Medal,
  RefreshCw,
  Search,
  School,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import {
  AGE_STAGES,
  getRankingCategoryLabel,
  RANKING_SERIES_OPTIONS,
  resolveDefaultRankingCategory,
  SCHOOLS,
  stageFromBirthdate,
  type AgeStageId,
  type RankingFilterCategory,
} from "@/lib/player-profile";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  fetchLeaderboard,
  getLeaderboardSnapshotLocal,
  getSchoolStandings,
  type LeaderboardEntry,
  type LeaderboardFilter,
} from "@/lib/playfab";
import {
  getTournamentRank,
  getWeeklyTournamentSnapshot,
  syncWeeklyTournamentWithPlayFab,
} from "@/lib/weekly-tournament";
import { setPlayerCurrentActivity, usePresenceTracker } from "@/lib/presence";
import { PresenceDot } from "./PresenceDot";
import { TournamentRankBadge } from "./TournamentRankBadge";

const PlayerInspectModal = lazy(() =>
  import("./PlayerInspectModal").then((m) => ({ default: m.PlayerInspectModal })),
);

export type RankingTabKind = "pontos" | "medalhas" | "geral" | "jogos" | "escolas" | "torneio";

const PAGE_BATCH_SIZE = 20;

// Cache em memória de sessão para alternância instantânea entre abas e etapas
const leaderboardSessionCache = new Map<string, LeaderboardEntry[]>();

function getLeaderboardCacheKey(
  tab: RankingTabKind,
  stage: RankingFilterCategory,
  game: GameId,
  school: string,
  seasonId: number | string,
): string {
  return `${tab}::${stage}::${game}::${school}::${seasonId}`;
}

function buildLeaderboardFilter(
  targetTab: RankingTabKind,
  stage: RankingFilterCategory,
  game: GameId,
  school: string,
): LeaderboardFilter | null {
  if (targetTab === "pontos") return { kind: "points", stage };
  if (targetTab === "medalhas") return { kind: "medals", stage };
  if (targetTab === "geral") return { kind: "xp_season", stage };
  if (targetTab === "jogos") return { kind: "game", gameId: game, stage };
  if (targetTab === "escolas" && school !== "TODAS") return { kind: "school", school, stage };
  return null;
}

function Leaderboard10SlotsSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando classificação...">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 animate-pulse"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold border shadow-xs ${
                idx === 0
                  ? "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                  : idx === 1
                    ? "bg-slate-300/25 text-slate-500 border-slate-400/30"
                    : idx === 2
                      ? "bg-amber-700/20 text-amber-600 border-amber-800/30"
                      : "bg-secondary/70 text-muted-foreground/60 border-border/50"
              }`}
            >
              {idx <= 2 ? <Medal className="h-5 w-5 opacity-40" /> : `${idx + 1}º`}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-4 rounded-md bg-muted/80"
                  style={{ width: `${70 + (idx % 4) * 22}px` }}
                />
                <div className="h-3.5 w-16 rounded-full bg-muted/50" />
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 rounded-md bg-muted/60"
                  style={{ width: `${110 + (idx % 3) * 35}px` }}
                />
                <div className="h-3 w-16 rounded-md bg-muted/40" />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="h-5 w-20 rounded-md bg-primary/20" />
            <div className="h-3 w-14 rounded-md bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface RankingViewProps {
  initialTab?: RankingTabKind;
}

export function RankingView({ initialTab = "medalhas" }: RankingViewProps) {
  const auth = usePlayerAuth();
  const defaultPlayerCategory = resolveDefaultRankingCategory(auth.profile);
  const myAgeStageId: AgeStageId = auth.profile
    ? stageFromBirthdate(auth.profile.birthdate, new Date(), auth.profile.school).id
    : "etapa_1";

  const [tab, setTab] = useState<RankingTabKind>(initialTab);
  const [selectedStage, setSelectedStage] = useState<RankingFilterCategory>(defaultPlayerCategory);
  const [tournamentStage, setTournamentStage] = useState<AgeStageId | "TODAS">(myAgeStageId);
  const [selectedGame, setSelectedGame] = useState<GameId>("logica");
  const [selectedSchool, setSelectedSchool] = useState<string>("TODAS");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingBackground, setSyncingBackground] = useState(false);
  const [inspectPlayerId, setInspectPlayerId] = useState<string | null>(null);
  const [showStageSelector, setShowStageSelector] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [forceSyncTick, setForceSyncTick] = useState(0);
  const [tournamentTick, setTournamentTick] = useState(0);

  const cfg = auth.adminConfig;

  // Sincroniza tab quando a URL muda (ex.: ?tab=torneio)
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Mantém a etapa padrão sincronizada caso o perfil carregue após o primeiro render
  useEffect(() => {
    if (auth.profile) {
      setSelectedStage(resolveDefaultRankingCategory(auth.profile));
      setTournamentStage(
        stageFromBirthdate(auth.profile.birthdate, new Date(), auth.profile.school).id,
      );
    }
  }, [auth.profile?.id]);

  // Rastreia presença e atividade do aluno enquanto visualiza a página do Ranking
  usePresenceTracker(
    auth.profile
      ? {
          playerId: auth.profile.id,
          playfabId: auth.profile.playfabId,
          nick: auth.profile.nick,
          nickNormalized: auth.profile.nickNormalized,
        }
      : null,
  );

  useEffect(() => {
    setPlayerCurrentActivity({ type: "ranking" });
  }, []);

  // Recalcula o placar geral das escolas SOMENTE quando o aluno está visualizando "Escolas -> Placar Geral"
  const schoolStandings = useMemo(() => {
    if (tab !== "escolas" || selectedSchool !== "TODAS") return [];
    return getSchoolStandings();
  }, [tab, selectedSchool, refreshCounter, syncingBackground]);

  // Snapshot síncrono local do Torneio Ranqueado (somente quando na aba "torneio")
  const effectiveTournamentStage: AgeStageId | "TODAS" = auth.isAdmin
    ? tournamentStage
    : myAgeStageId;

  const tournamentSnap = useMemo(() => {
    if (tab !== "torneio") return null;
    return getWeeklyTournamentSnapshot(auth.profile, effectiveTournamentStage);
  }, [tab, auth.profile, effectiveTournamentStage, tournamentTick, refreshCounter]);

  // Reseta paginação e busca ao mudar de filtro
  useEffect(() => {
    setVisibleLimit(PAGE_BATCH_SIZE);
  }, [tab, selectedStage, tournamentStage, selectedGame, selectedSchool]);

  // Carregamento instantâneo local + revalidação leve em segundo plano (sem bloquear a UI)
  useEffect(() => {
    let active = true;

    if (tab === "torneio") {
      setLoading(false);
      setSyncingBackground(true);
      const isForced = forceSyncTick > 0;
      void syncWeeklyTournamentWithPlayFab(isForced)
        .then(() => {
          if (active) setTournamentTick((t) => t + 1);
        })
        .finally(() => {
          if (active) setSyncingBackground(false);
        });

      const handleTourUpdate = () => setTournamentTick((t) => t + 1);
      window.addEventListener("desafios:weekly-tournament-updated", handleTourUpdate);
      return () => {
        active = false;
        window.removeEventListener("desafios:weekly-tournament-updated", handleTourUpdate);
      };
    }

    if (tab === "escolas" && selectedSchool === "TODAS") {
      setLoading(false);
      // Ainda assim sincroniza suavemente em segundo plano para garantir escolas atualizadas
      setSyncingBackground(true);
      void fetchLeaderboard({ kind: "xp_season", stage: selectedStage }, PAGE_BATCH_SIZE, {
        forceCloudSync: forceSyncTick > 0,
      })
        .then(() => {
          if (active) setRefreshCounter((c) => c + 1);
        })
        .finally(() => {
          if (active) setSyncingBackground(false);
        });
      return () => {
        active = false;
      };
    }

    const filter = buildLeaderboardFilter(tab, selectedStage, selectedGame, selectedSchool);
    if (!filter) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const currentKey = getLeaderboardCacheKey(
      tab,
      selectedStage,
      selectedGame,
      selectedSchool,
      cfg.seasonId,
    );
    const cached = leaderboardSessionCache.get(currentKey);
    const localSnapshot =
      cached && cached.length > 0 ? cached : getLeaderboardSnapshotLocal(filter, PAGE_BATCH_SIZE);

    if (localSnapshot.length > 0) {
      leaderboardSessionCache.set(currentKey, localSnapshot);
      setEntries(localSnapshot);
      setLoading(false);
    } else {
      setEntries([]);
      setLoading(true);
    }

    setSyncingBackground(true);
    const isForced = forceSyncTick > 0;
    void fetchLeaderboard(filter, PAGE_BATCH_SIZE, { forceCloudSync: isForced })
      .then((res) => {
        if (!active) return;
        leaderboardSessionCache.set(currentKey, res);
        setEntries(res);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      })
      .finally(() => {
        if (active) setSyncingBackground(false);
      });

    return () => {
      active = false;
    };
  }, [
    tab,
    selectedGame,
    selectedSchool,
    selectedStage,
    cfg.seasonId,
    forceSyncTick,
  ]);

  const handleManualRefresh = useCallback(() => {
    leaderboardSessionCache.clear();
    setForceSyncTick((t) => t + 1);
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!normalizedQuery) return entries;
    return entries.filter(
      (r) =>
        r.nick.toLowerCase().includes(normalizedQuery) ||
        (r.fullName && r.fullName.toLowerCase().includes(normalizedQuery)) ||
        r.school.toLowerCase().includes(normalizedQuery),
    );
  }, [entries, normalizedQuery]);

  const displayedEntries = useMemo(
    () => filteredEntries.slice(0, visibleLimit),
    [filteredEntries, visibleLimit],
  );

  const filteredTournamentStandings = useMemo(() => {
    if (!tournamentSnap) return [];
    const list = tournamentSnap.allStandings;
    if (!normalizedQuery) return list;
    return list.filter(
      (r) =>
        r.nick.toLowerCase().includes(normalizedQuery) ||
        r.school.toLowerCase().includes(normalizedQuery),
    );
  }, [tournamentSnap, normalizedQuery]);

  const displayedTournamentStandings = useMemo(
    () => filteredTournamentStandings.slice(0, visibleLimit),
    [filteredTournamentStandings, visibleLimit],
  );

  const scheduledDate = cfg.seasonEndAt
    ? new Date(cfg.seasonEndAt)
    : cfg.scheduledResetAt
      ? new Date(cfg.scheduledResetAt)
      : null;
  const durationLabel = cfg.seasonDurationDays ? `Ciclo de ${cfg.seasonDurationDays} dias • ` : "";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Cabeçalho Fixo da Página de Ranking */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-sm px-3 sm:px-6 py-3 shadow-xs">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border bg-secondary/80 hover:bg-secondary px-3 py-2 text-xs font-bold text-foreground transition-all active:scale-95 shadow-2xs shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar aos Jogos</span>
            </Link>

            <div className="h-5 w-px bg-border hidden sm:block shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
                <Trophy className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-sm sm:text-lg font-black leading-tight truncate">
                  Ranking — {cfg.seasonName}
                </h1>
                <p className="text-[11px] text-muted-foreground truncate">
                  Classificação oficial dos alunos por etapa, escola e torneio
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {syncingBackground && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={syncingBackground}
              className="rounded-xl text-xs font-bold gap-1.5"
              title="Buscar atualização na nuvem"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingBackground ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal com Rolagem Nativa Fluida */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {scheduledDate && !Number.isNaN(scheduledDate.getTime()) && tab !== "torneio" && (
          <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-xs font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 shrink-0 text-accent" />
            <span>
              {durationLabel}Encerramento da temporada agendado para{" "}
              <b>
                {scheduledDate.toLocaleDateString("pt-BR")} às{" "}
                {scheduledDate.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </span>
          </div>
        )}

        {/* 6 Abas Principais (Medalhas, Pontos, XP, Por Jogo, Escolas, Torneio Ranqueado) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 rounded-2xl bg-secondary p-1.5 border">
          <button
            type="button"
            onClick={() => setTab("medalhas")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "medalhas"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Medal className="h-4 w-4 shrink-0" /> Medalhas
          </button>
          <button
            type="button"
            onClick={() => setTab("pontos")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "pontos"
                ? "bg-amber-500 text-zinc-950 shadow-md font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Coins className="h-4 w-4 shrink-0" /> Pontos
          </button>
          <button
            type="button"
            onClick={() => setTab("geral")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "geral"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 shrink-0" /> XP
          </button>
          <button
            type="button"
            onClick={() => setTab("jogos")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "jogos"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gamepad2 className="h-4 w-4 shrink-0" /> Por Jogo
          </button>
          <button
            type="button"
            onClick={() => setTab("escolas")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "escolas"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <School className="h-4 w-4 shrink-0" /> Escolas
          </button>
          <button
            type="button"
            onClick={() => setTab("torneio")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs sm:text-sm font-black transition-all cursor-pointer ${
              tab === "torneio"
                ? "bg-accent text-accent-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Swords className="h-4 w-4 shrink-0" /> Ranqueado
          </button>
        </div>

        {/* Controles de Etapa e Busca */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {tab !== "torneio" ? (
            <button
              type="button"
              onClick={() => setShowStageSelector((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-black text-primary hover:bg-primary/20 transition-all shadow-2xs cursor-pointer"
              title="Clique para alternar entre as etapas"
            >
              <Layers className="h-4 w-4" />
              <span>Etapa: {getRankingCategoryLabel(selectedStage)}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  showStageSelector ? "rotate-180" : ""
                }`}
              />
            </button>
          ) : (
            <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-accent" />
              <span>
                Torneio Semanal:{" "}
                <b className="text-foreground">{tournamentSnap?.gameName ?? "Carregando..."}</b>
              </span>
            </div>
          )}

          {/* Busca rápida por apelido, nome ou escola */}
          {!(tab === "escolas" && selectedSchool === "TODAS") && (
            <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar aluno ou escola..."
                className="h-9 w-full rounded-xl border bg-card pl-8 pr-8 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Seletor Expansível de Etapas (para as 5 abas gerais) */}
        {showStageSelector && tab !== "torneio" && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-black uppercase tracking-wider text-primary">
                Selecione a Etapa:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedStage("TODAS");
                  setShowStageSelector(false);
                }}
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                  selectedStage === "TODAS"
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                🌐 Todas as Etapas (Geral)
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {RANKING_SERIES_OPTIONS.map((opt) => {
                const isSelected =
                  selectedStage === opt.id ||
                  (opt.id === "etapa_1" && selectedStage === "5º ano");
                const isMyCategory =
                  Boolean(auth.profile) && defaultPlayerCategory === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedStage(opt.id);
                      setShowStageSelector(false);
                    }}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "bg-card hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="font-display text-xs sm:text-sm font-extrabold">
                        {opt.emoji} {opt.shortLabel}
                      </span>
                      {isMyCategory && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                            isSelected
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          Sua Etapa
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold leading-tight mt-0.5 ${
                        isSelected ? "text-primary-foreground/90" : "text-muted-foreground"
                      }`}
                    >
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-filtros de Jogos */}
        {tab === "jogos" && (
          <div className="flex flex-wrap gap-1.5">
            {ALL_GAME_IDS.filter((id) => cfg.enabledGames[id] === true).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedGame(id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  selectedGame === id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-card hover:bg-secondary"
                }`}
              >
                {GAME_NAMES[id]}
              </button>
            ))}
          </div>
        )}

        {/* Sub-filtros de Escolas */}
        {tab === "escolas" && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedSchool("TODAS")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                selectedSchool === "TODAS"
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "bg-card hover:bg-secondary"
              }`}
            >
              Placar Geral das Escolas
            </button>
            {SCHOOLS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelectedSchool(s.name)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  selectedSchool === s.name
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-card hover:bg-secondary"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Conteúdo da Aba: TORNEIO SEMANAL RANQUEADO */}
        {tab === "torneio" && tournamentSnap && (
          <div className="space-y-4">
            {/* Banner resumo da semana + Atalho de retorno para jogar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent/40 bg-gradient-to-r from-accent/10 via-card to-primary/10 p-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-black text-accent">
                    <Calendar className="h-3 w-3" /> Semana {tournamentSnap.weekKey}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Encerra {tournamentSnap.endsAtLabel}
                  </span>
                </div>
                <div className="font-display text-base sm:text-lg font-black text-foreground">
                  {tournamentSnap.seasonLabel} • {tournamentSnap.gameName}
                </div>
                {auth.profile && (
                  <div className="text-xs text-muted-foreground">
                    {tournamentSnap.myStanding ? (
                      <span>
                        Sua colocação na {tournamentSnap.playerStage.shortLabel}:{" "}
                        <b className="text-accent">
                          #{tournamentSnap.myStanding.rank} (
                          {tournamentSnap.myStanding.tournamentPoints ??
                            tournamentSnap.myStanding.totalRankedPoints}{" "}
                          pts)
                        </b>
                      </span>
                    ) : (
                      <span>
                        Patente atual:{" "}
                        <b className="text-foreground">
                          {tournamentSnap.rankInfo.currentRank.name}
                        </b>{" "}
                        ({tournamentSnap.tournamentPoints} pts)
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 shrink-0"
              >
                <Swords className="h-4 w-4" /> Jogar Ranqueada na Home
              </Link>
            </div>

            {/* Seletor de Etapa do Torneio: ADM alterna livremente; aluno vê sua faixa oficial */}
            {auth.isAdmin ? (
              <div className="space-y-2 rounded-2xl border bg-secondary/30 p-3">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary" /> Visualização do Administrador
                    (Todas as Etapas)
                  </span>
                  <button
                    type="button"
                    onClick={() => setTournamentStage("TODAS")}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      tournamentStage === "TODAS"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🌐 Visão Geral
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {AGE_STAGES.map((st) => {
                    const isSelected = tournamentStage === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setTournamentStage(st.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground shadow-xs"
                            : "bg-background hover:bg-secondary/60"
                        }`}
                      >
                        <div className="font-display text-xs font-black">
                          {st.emoji} {st.shortLabel}
                        </div>
                        <div
                          className={`text-[10px] ${
                            isSelected ? "text-primary-foreground/90" : "text-muted-foreground"
                          }`}
                        >
                          {st.ageRangeLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-secondary/30 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{tournamentSnap.playerStage.emoji}</span>
                  <div>
                    <div className="font-display text-sm font-black text-foreground">
                      Ranking da {tournamentSnap.playerStage.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Disputa oficial ranqueada entre alunos da sua faixa escolar (
                      {tournamentSnap.playerStage.shortLabel})
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Lista do Ranking do Torneio */}
            {displayedTournamentStandings.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center min-h-[260px]">
                <Trophy className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 font-display font-bold">
                  {normalizedQuery
                    ? "Nenhum competidor encontrado para esta busca"
                    : "Ninguém pontuou no torneio desta semana ainda"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Volte para os jogos e dispute uma entrada ranqueada para assumir o 1º lugar!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedTournamentStandings.map((row) => {
                  const isMe =
                    Boolean(auth.profile) &&
                    (row.playerId === auth.profile?.id ||
                      row.nick.toLowerCase() === auth.profile?.nick.toLowerCase());
                  const rowPoints = row.tournamentPoints ?? row.totalRankedPoints;
                  const rowRankDef = getTournamentRank(rowPoints).currentRank;

                  return (
                    <div
                      key={`${row.playerId}-${row.rank}`}
                      onClick={() => setInspectPlayerId(row.playerId)}
                      title="Clique para inspecionar o perfil e patente deste aluno"
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all hover:border-primary/60 ${
                        isMe
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : row.rank === 1
                            ? "border-yellow-400 bg-yellow-400/10 shadow-sm"
                            : "bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold border shadow-xs ${
                            row.rank === 1
                              ? "bg-yellow-400 text-yellow-950 border-yellow-500"
                              : row.rank === 2
                                ? "bg-slate-300 text-slate-800 border-slate-400"
                                : row.rank === 3
                                  ? "bg-amber-700 text-amber-50 border-amber-800"
                                  : "bg-secondary text-foreground border-border"
                          }`}
                        >
                          {row.rank <= 3 ? <Medal className="h-5 w-5" /> : `${row.rank}º`}
                        </span>

                        <TournamentRankBadge rankId={rowRankDef.id} points={rowPoints} size="xs" />

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-display text-base font-black truncate text-foreground">
                              {row.nick}
                            </span>
                            <PresenceDot
                              playerId={row.playerId}
                              nick={row.nick}
                              size="xs"
                              showPingAnimation={false}
                            />
                            {isMe && (
                              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                                Você
                              </span>
                            )}
                            <span className={`text-[11px] font-bold ${rowRankDef.textColor}`}>
                              {rowRankDef.name}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {row.school} • Nv. {row.level} • {row.stageLabel}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-display text-base sm:text-lg font-black text-primary">
                          {rowPoints} pts
                        </div>
                        {row.rank <= 5 && (
                          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            Zona de Pódio Top 5
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredTournamentStandings.length > visibleLimit && (
                  <div className="pt-2 text-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVisibleLimit((v) => v + 30)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Mostrar mais ({displayedTournamentStandings.length} de{" "}
                      {filteredTournamentStandings.length})
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border bg-secondary/30 p-3.5 text-xs text-muted-foreground flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <b className="text-foreground">Medalhas de Superação e Top 5:</b> Ao alcançar a
                divisão mais alta de cada liga (Bronze III, Prata III, Ouro III, Platina IV,
                Diamante V e Mestre) você recebe a medalha permanente de maestria. Terminar a
                semana no Top 5 acumula medalhas semanais no seu perfil!
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo da Aba: PLACAR GERAL DAS ESCOLAS */}
        {tab === "escolas" && selectedSchool === "TODAS" && (
          <div className="space-y-2.5">
            {schoolStandings.map((st, idx) => (
              <button
                key={st.school}
                type="button"
                onClick={() => setSelectedSchool(st.school)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all hover:border-primary cursor-pointer ${
                  idx === 0 ? "border-yellow-400 bg-yellow-400/10 shadow-sm" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold border shadow-xs ${
                      idx === 0
                        ? "bg-yellow-400 text-yellow-950 border-yellow-500"
                        : idx === 1
                          ? "bg-slate-300 text-slate-800 border-slate-400"
                          : idx === 2
                            ? "bg-amber-700 text-amber-50 border-amber-800"
                            : "bg-secondary text-foreground border-border"
                    }`}
                  >
                    {idx === 0 ? (
                      <Crown className="h-5 w-5" />
                    ) : idx <= 2 ? (
                      <Medal className="h-4 w-4" />
                    ) : (
                      `${idx + 1}º`
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-extrabold">
                      {st.school}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {st.studentsCount}{" "}
                      {st.studentsCount === 1 ? "aluno cadastrado" : "alunos cadastrados"} •{" "}
                      {st.totalWins} {st.totalWins === 1 ? "vitória" : "vitórias"}
                      {st.topStudent && ` • Destaque: ${st.topStudent}`}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg font-extrabold text-primary">
                    {st.totalXp} XP
                  </div>
                  <div className="text-[11px] text-muted-foreground">ver alunos →</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Conteúdo das Abas Individuais (Medalhas, Pontos, XP, Por Jogo, Escola Específica) */}
        {tab !== "torneio" && !(tab === "escolas" && selectedSchool === "TODAS") && (
          <div className="space-y-2">
            {loading ? (
              <Leaderboard10SlotsSkeleton />
            ) : displayedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center min-h-[280px]">
                <Trophy className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 font-display font-bold">
                  {normalizedQuery
                    ? "Nenhum aluno encontrado para esta busca"
                    : "Ainda não há pontuações registradas nesta categoria"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {normalizedQuery
                    ? "Tente limpar ou alterar o termo buscado."
                    : `Entre com o seu perfil e jogue uma partida para inaugurar o ranking de ${getRankingCategoryLabel(selectedStage)}!`}
                </p>
              </div>
            ) : (
              <>
                {displayedEntries.map((row) => {
                  const displayFullName = (row.fullName || row.nick).toUpperCase();
                  return (
                    <div
                      key={`${row.playerId}-${row.rank}`}
                      onClick={() => setInspectPlayerId(row.playerId)}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all hover:border-primary/50 ${
                        row.isCurrentPlayer
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : row.rank === 1
                            ? "border-yellow-400 bg-yellow-400/10 shadow-sm"
                            : "bg-card"
                      }`}
                      title="Clique para ver o perfil e medalhas deste jogador"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold border shadow-xs ${
                            row.rank === 1
                              ? "bg-yellow-400 text-yellow-950 border-yellow-500"
                              : row.rank === 2
                                ? "bg-slate-300 text-slate-800 border-slate-400"
                                : row.rank === 3
                                  ? "bg-amber-700 text-amber-50 border-amber-800"
                                  : "bg-secondary text-foreground border-border"
                          }`}
                        >
                          {row.rank <= 3 ? <Medal className="h-5 w-5" /> : `${row.rank}º`}
                        </span>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-display text-base font-black text-foreground">
                              {row.nick}
                            </span>
                            <PresenceDot
                              playerId={row.playerId}
                              nick={row.nick}
                              size="xs"
                              showPingAnimation={false}
                            />
                            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                              {row.rankEmoji} Nv. {row.level}
                            </span>
                            {row.isCurrentPlayer && (
                              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                                Você
                              </span>
                            )}
                          </div>

                          {row.fullName && row.fullName.toLowerCase() !== row.nick.toLowerCase() && (
                            <div className="truncate text-[11px] font-semibold uppercase text-muted-foreground/90">
                              {displayFullName}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground/85">{row.school}</span>
                            {row.grade && (
                              <span className="rounded-md bg-secondary px-1.5 py-0.2 text-[10px] font-bold text-foreground">
                                {row.grade}
                                {row.turma ? ` • Turma ${row.turma}` : ""}
                              </span>
                            )}
                            <span className="text-[11px]">
                              • {row.age} anos ({row.stageLabel})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-display text-base sm:text-lg font-extrabold text-primary whitespace-nowrap">
                            {tab === "pontos"
                              ? `🪙 ${row.value} pts`
                              : tab === "medalhas"
                                ? `🏅 ${row.value} ${row.value === 1 ? "medalha" : "medalhas"}`
                                : tab === "jogos"
                                  ? `${row.value} pts`
                                  : `${row.value} XP`}
                          </span>

                          {row.rankTrend === "up" ? (
                            <span
                              className="font-black text-emerald-500 text-xs sm:text-sm drop-shadow-xs"
                              title={
                                row.previousRank && row.previousRank > row.rank
                                  ? `Subiu da ${row.previousRank}ª para a ${row.rank}ª posição!`
                                  : "Liderando no topo do ranking!"
                              }
                            >
                              ▲
                            </span>
                          ) : row.rankTrend === "down" && row.rank > 1 ? (
                            <span
                              className="font-black text-rose-500 text-xs sm:text-sm drop-shadow-xs"
                              title={
                                row.previousRank && row.previousRank < row.rank
                                  ? `Caiu da ${row.previousRank}ª para a ${row.rank}ª posição`
                                  : "Caiu posições no ranking"
                              }
                            >
                              ▼
                            </span>
                          ) : (
                            <span
                              className="font-bold text-muted-foreground text-xs"
                              title="Posição mantida"
                            >
                              —
                            </span>
                          )}
                        </div>

                        <div className="inline-flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                          {tab === "medalhas" && row.xpValue !== undefined && (
                            <span>{row.xpValue} XP •</span>
                          )}
                          <span className="inline-flex items-center gap-0.5">
                            <Flame className="h-3 w-3 text-accent" /> {row.wins}{" "}
                            {row.wins === 1 ? "vitória" : "vitórias"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredEntries.length > visibleLimit && (
                  <div className="pt-2 text-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVisibleLimit((v) => v + 30)}
                      className="rounded-xl text-xs font-bold"
                    >
                      Mostrar mais ({displayedEntries.length} de {filteredEntries.length})
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {inspectPlayerId && (
        <Suspense fallback={null}>
          <PlayerInspectModal
            playerId={inspectPlayerId}
            open={Boolean(inspectPlayerId)}
            onOpenChange={(v) => !v && setInspectPlayerId(null)}
            onStudentUpdated={() => {
              leaderboardSessionCache.clear();
              setRefreshCounter((c) => c + 1);
              setForceSyncTick((t) => t + 1);
              void auth.refresh();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
