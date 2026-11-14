import { useEffect, useRef, useState, useCallback } from "react";
import {
  Trophy,
  Medal,
  School,
  Gamepad2,
  Sparkles,
  CalendarClock,
  Crown,
  Flame,
  Layers,
  ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import {
  getRankingCategoryLabel,
  RANKING_SERIES_OPTIONS,
  resolveDefaultRankingCategory,
  SCHOOLS,
  type RankingFilterCategory,
} from "@/lib/player-profile";
import { usePlayerAuth } from "@/lib/player-auth";
import { fetchLeaderboard, getSchoolStandings, type LeaderboardEntry } from "@/lib/playfab";
import { PlayerInspectModal } from "./PlayerInspectModal";
import { PresenceDot } from "./PresenceDot";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type TabKind = "pontos" | "medalhas" | "geral" | "jogos" | "escolas";

// Cache em memória de sessão para alternância instantânea (0ms) entre abas e etapas
const leaderboardSessionCache = new Map<string, LeaderboardEntry[]>();

function getLeaderboardCacheKey(
  tab: TabKind,
  stage: RankingFilterCategory,
  game: GameId,
  school: string,
  seasonId: number | string,
): string {
  return `${tab}::${stage}::${game}::${school}::${seasonId}`;
}

async function fetchEntriesForFilter(
  targetTab: TabKind,
  stage: RankingFilterCategory,
  game: GameId,
  school: string,
): Promise<LeaderboardEntry[]> {
  if (targetTab === "pontos") {
    return fetchLeaderboard({ kind: "points", stage }, 20);
  }
  if (targetTab === "medalhas") {
    return fetchLeaderboard({ kind: "medals", stage }, 20);
  }
  if (targetTab === "geral") {
    return fetchLeaderboard({ kind: "xp_season", stage }, 20);
  }
  if (targetTab === "jogos") {
    return fetchLeaderboard({ kind: "game", gameId: game, stage }, 20);
  }
  if (targetTab === "escolas" && school !== "TODAS") {
    return fetchLeaderboard({ kind: "school", school, stage }, 20);
  }
  return [];
}

/**
 * Renderiza 10 slots esqueletos com dimensões e proporções físicas exatas dos cards reais,
 * garantindo estabilidade vertical permanente (Zero Layout Shift) enquanto os dados carregam.
 */
function Leaderboard10SlotsSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando classificação...">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 animate-pulse"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Slot de Posição / Medalha */}
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
              {/* Apelido e Nível simulados */}
              <div className="flex items-center gap-2">
                <div
                  className="h-4 rounded-md bg-muted/80"
                  style={{ width: `${70 + (idx % 4) * 22}px` }}
                />
                <div className="h-3.5 w-16 rounded-full bg-muted/50" />
              </div>

              {/* Escola e Etapa simuladas */}
              <div className="flex items-center gap-2">
                <div
                  className="h-3 rounded-md bg-muted/60"
                  style={{ width: `${110 + (idx % 3) * 35}px` }}
                />
                <div className="h-3 w-16 rounded-md bg-muted/40" />
              </div>
            </div>
          </div>

          {/* Lado Direito: Pontuação e Vitórias simuladas */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="h-5 w-20 rounded-md bg-primary/20" />
            <div className="h-3 w-14 rounded-md bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeaderboardDialog({ open, onOpenChange }: Props) {
  const auth = usePlayerAuth();
  const defaultPlayerCategory = resolveDefaultRankingCategory(auth.profile);
  const [selectedStage, setSelectedStage] = useState<RankingFilterCategory>(defaultPlayerCategory);
  const [tab, setTab] = useState<TabKind>("medalhas");
  const [selectedGame, setSelectedGame] = useState<GameId>("logica");
  const [selectedSchool, setSelectedSchool] = useState<string>("TODAS");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [inspectPlayerId, setInspectPlayerId] = useState<string | null>(null);
  const [showStageSelector, setShowStageSelector] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const cfg = auth.adminConfig;
  const schoolStandings = open ? getSchoolStandings() : [];

  const prevOpenRef = useRef(false);

  // Default to the logged-in student's competing series/grade AND the "Medalhas" tab ONLY upon opening the Ranking dialog
  // (Prevents background polling/heartbeat updates to auth.profile from resetting the stage or tab while the user is actively viewing)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedStage(resolveDefaultRankingCategory(auth.profile));
      setTab("medalhas");
    }
    prevOpenRef.current = open;
  }, [open, auth.profile]);

  // Carregamento com Stale-While-Revalidate:
  // Se já há cache, exibe instantaneamente (0ms) e revalida em segundo plano sem apagar a tela.
  // Se não há cache, exibe os 10 slots esqueletos já dimensionados (Zero Cumulative Layout Shift).
  useEffect(() => {
    if (!open) return;
    let active = true;

    // Aba de escolas com visão agregada geral é síncrona local
    if (tab === "escolas" && selectedSchool === "TODAS") {
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

    if (cached && cached.length > 0) {
      // 1. Dados já existentes em cache: exibição instantânea (0ms), mantendo a tela fixa e estável
      setEntries(cached);
      setLoading(false);
    } else {
      // 2. Primeira vez nesta aba: exibe os 10 slots esqueletos com altura já pré-alocada
      setLoading(true);
    }

    const load = async () => {
      try {
        const res = await fetchEntriesForFilter(tab, selectedStage, selectedGame, selectedSchool);
        if (!active) return;
        leaderboardSessionCache.set(currentKey, res);
        setEntries(res);
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [
    open,
    tab,
    selectedGame,
    selectedSchool,
    selectedStage,
    cfg.seasonId,
    refreshCounter,
  ]);

  const scheduledDate = cfg.seasonEndAt
    ? new Date(cfg.seasonEndAt)
    : cfg.scheduledResetAt
      ? new Date(cfg.scheduledResetAt)
      : null;
  const durationLabel = cfg.seasonDurationDays ? `Ciclo de ${cfg.seasonDurationDays} dias • ` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <Trophy className="h-6 w-6 text-yellow-500" /> Ranking — {cfg.seasonName}
          </DialogTitle>
        </DialogHeader>

        {scheduledDate && !Number.isNaN(scheduledDate.getTime()) && (
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

        {/* Top Controls: Etapa selector button on the top-left below title */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowStageSelector((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary hover:bg-primary/20 transition-all shadow-xs"
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

          {scheduledDate && !Number.isNaN(scheduledDate.getTime()) && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 text-accent" />
              <span>
                Reset em <b>{scheduledDate.toLocaleDateString("pt-BR")}</b>
              </span>
            </div>
          )}
        </div>

        {/* Collapsible Stage Selector (1ª Etapa, 2ª Etapa, 3ª Etapa) */}
        {showStageSelector && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2.5 animate-in fade-in-50 duration-200">
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
                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-all ${
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
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
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

        {/* Destaque Principal: 5 Abas de Classificação ("Pontos", "Medalhas", "XP", "Por Jogo", "Escolas") */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-2xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => setTab("pontos")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${
              tab === "pontos"
                ? "bg-amber-500 text-zinc-950 shadow-md font-black"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>🪙</span> Pontos
          </button>
          <button
            type="button"
            onClick={() => setTab("medalhas")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${
              tab === "medalhas"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Medal className="h-4 w-4" /> Medalhas
          </button>
          <button
            type="button"
            onClick={() => setTab("geral")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${
              tab === "geral"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" /> XP
          </button>
          <button
            type="button"
            onClick={() => setTab("jogos")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${
              tab === "jogos"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gamepad2 className="h-4 w-4" /> Por Jogo
          </button>
          <button
            type="button"
            onClick={() => setTab("escolas")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${
              tab === "escolas"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <School className="h-4 w-4" /> Escolas
          </button>
        </div>

        {/* Sub-filters */}
        {tab === "jogos" && (
          <div className="flex flex-wrap gap-1.5">
            {ALL_GAME_IDS.filter((id) => cfg.enabledGames[id] === true).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedGame(id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedGame === id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-background hover:bg-secondary"
                }`}
              >
                {GAME_NAMES[id]}
              </button>
            ))}
          </div>
        )}

        {tab === "escolas" && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedSchool("TODAS")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                selectedSchool === "TODAS"
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "bg-background hover:bg-secondary"
              }`}
            >
              Placar Geral das Escolas
            </button>
            {SCHOOLS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelectedSchool(s.name)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedSchool === s.name
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "bg-background hover:bg-secondary"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* School Standings Overview */}
        {tab === "escolas" && selectedSchool === "TODAS" ? (
          <div className="space-y-2.5">
            {schoolStandings.map((st, idx) => (
              <button
                key={st.school}
                type="button"
                onClick={() => setSelectedSchool(st.school)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all hover:border-primary ${
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
                    {idx === 0 ? <Crown className="h-5 w-5" /> : idx <= 2 ? <Medal className="h-4 w-4" /> : `${idx + 1}º`}
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
        ) : (
          /* Individual Player Leaderboard */
          <div className="space-y-2 min-h-[580px]">
            {loading ? (
              <Leaderboard10SlotsSkeleton />
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center min-h-[300px]">
                <Trophy className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 font-display font-bold">Ainda não há pontuações registradas nesta categoria</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entre com o seu perfil e jogue uma partida para inaugurar o ranking de{" "}
                  <b>{getRankingCategoryLabel(selectedStage)}</b>!
                </p>
              </div>
            ) : (
              entries.map((row) => {
                const displayFullName = (row.fullName || row.nick).toUpperCase();
                return (
                  <div
                    key={`${row.playerId}-${row.rank}`}
                    onClick={() => setInspectPlayerId(row.playerId)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                      row.isCurrentPlayer
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : row.rank === 1
                          ? "border-yellow-400 bg-yellow-400/10 shadow-sm"
                          : "bg-card hover:border-primary/50"
                    }`}
                    title="Clique para ver o perfil e medalhas deste jogador"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Medalha de colocação: 1º Amarelo (Ouro), 2º Cinza (Prata), 3º Bronze */}
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
                        {/* Linha Principal em Destaque: Apelido (Nick) escolhido pelo aluno */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-display text-base font-black text-foreground">
                            {row.nick}
                          </span>
                          <PresenceDot playerId={row.playerId} nick={row.nick} size="xs" />
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                            {row.rankEmoji} Nv. {row.level}
                          </span>
                          {row.isCurrentPlayer && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                              Você
                            </span>
                          )}
                        </div>

                        {/* Logo abaixo do Nick (com menos destaque): Nome Completo do aluno */}
                        {row.fullName && row.fullName.toLowerCase() !== row.nick.toLowerCase() && (
                          <div className="truncate text-[11px] font-semibold uppercase text-muted-foreground/90">
                            {displayFullName}
                          </div>
                        )}

                        {/* Linha de Escola e demais informações */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground/85">
                            {row.school}
                          </span>
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

                        {/* Seta indicativa real de subida (verde) ou descida (vermelha) no ranking */}
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
              })
            )}
          </div>
        )}

        <PlayerInspectModal
          playerId={inspectPlayerId}
          open={Boolean(inspectPlayerId)}
          onOpenChange={(v) => !v && setInspectPlayerId(null)}
          onStudentUpdated={() => {
            leaderboardSessionCache.clear();
            setRefreshCounter((c) => c + 1);
            void auth.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
