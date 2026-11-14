import React, { lazy, Suspense, useState, useEffect } from "react";
import {
  Trophy,
  Star,
  Sparkles,
  KeyRound,
  Medal,
  Lock,
  Clock,
  Calendar,
  Swords,
  Zap,
  Award,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Flame,
  Rocket,
  Target,
  LogIn,
} from "lucide-react";
import type { AllStats, GameId } from "@/lib/game-storage";
import { GAME_NAMES } from "@/lib/game-storage";
import { GAME_REGISTRY, type GameRegistration } from "@/lib/game-registry";
import { isAdminOrTestAccount, TOURNAMENT_MIN_LEVEL, X1_MIN_LEVEL } from "@/lib/player-profile";
import {
  getAllActiveEvents,
  calculateCumulativeActiveBonuses,
  type ActiveEventDisplayItem,
  type CumulativeActiveBonuses,
} from "@/lib/custom-events";
import type { PlayerProfile } from "@/lib/playfab";
import { stageFromBirthdate } from "@/lib/player-profile";
import {
  formatRecordDateBR,
  getGameStageRecord,
  loadGameRecords,
  type AllGameRecords,
} from "@/lib/game-records";
import type { PlatformNoticeSlide } from "@/lib/game-codes";
import { NoticeBoard } from "./NoticeBoard";

const GameDetailDialog = lazy(() =>
  import("./GameDetailDialog").then((m) => ({ default: m.GameDetailDialog })),
);

interface Props {
  stats: AllStats;
  unlocked: GameId[];
  enabledGames: Record<GameId, boolean>;
  requireCodeGate: boolean;
  showCodeGateCardOnHome?: boolean;
  x1Enabled?: boolean;
  x1ArenaClosed?: boolean;
  x1OpenNow?: boolean;
  x1HoursLabel?: string;
  tournamentEnabled?: boolean;
  weeklyGameName?: string;
  playerLevel?: number;
  playerProfile?: PlayerProfile | null;
  noticeSlides?: PlatformNoticeSlide[];
  enabledDefaultNotices?: Record<string, boolean>;
  hideAllDefaultNotices?: boolean;
  pauseNoticeBoard?: boolean;
  adminOnlyGames?: Partial<Record<GameId, boolean>>;
  gameLevelRequirements?: Record<GameId, number>;
  isAdmin?: boolean;
  onSelect: (id: GameId) => void;
  onAddCode: () => void;
  onOpenX1Arena?: () => void;
  onOpenWeeklyTournament?: () => void;
  onOpenAuth?: () => void;
}

export function Menu({
  stats,
  unlocked,
  enabledGames,
  requireCodeGate,
  showCodeGateCardOnHome = false,
  x1Enabled = true,
  x1ArenaClosed = false,
  x1OpenNow = true,
  x1HoursLabel = "07:00 às 19:00",
  tournamentEnabled = true,
  weeklyGameName = "Batalha de Robôs",
  playerLevel = 1,
  playerProfile = null,
  noticeSlides = [],
  enabledDefaultNotices,
  hideAllDefaultNotices = false,
  pauseNoticeBoard = false,
  adminOnlyGames,
  gameLevelRequirements,
  isAdmin = false,
  onSelect,
  onAddCode,
  onOpenX1Arena,
  onOpenWeeklyTournament,
  onOpenAuth,
}: Props) {
  const isGameEnabled = (id: GameId) => Boolean(enabledGames && enabledGames[id] === true);
  const isGameAllowedForUser = (id: GameId) => {
    // Se o jogo for restrito a ADM, só exibe para o Administrador logado
    if (adminOnlyGames?.[id] && !isAdmin) return false;
    return true;
  };
  const visible = GAME_REGISTRY.filter(
    (g) =>
      isGameEnabled(g.id) &&
      isGameAllowedForUser(g.id) &&
      (!requireCodeGate || unlocked.includes(g.id)),
  );
  const isAdminBypass = isAdminOrTestAccount(playerProfile, isAdmin);
  const effectiveX1Enabled = Boolean(x1Enabled || isAdminBypass);
  const effectiveX1ArenaClosed = Boolean(x1ArenaClosed && !isAdminBypass);
  const canTournament = Boolean(playerProfile && (isAdminBypass || playerLevel >= TOURNAMENT_MIN_LEVEL));
  const canX1 = Boolean(playerProfile && (isAdminBypass || (playerLevel >= X1_MIN_LEVEL && x1OpenNow)));

  const stageId = playerProfile
    ? stageFromBirthdate(playerProfile.birthdate, new Date(), playerProfile.school).id
    : "etapa_1";

  const [gameRecords, setGameRecords] = useState<AllGameRecords>(() => loadGameRecords());

  useEffect(() => {
    const handler = () => setGameRecords(loadGameRecords());
    window.addEventListener("desafios:game-records-updated", handler);
    return () => window.removeEventListener("desafios:game-records-updated", handler);
  }, []);

  const [activeEvents, setActiveEvents] = useState<ActiveEventDisplayItem[]>(() =>
    getAllActiveEvents(),
  );
  const [cumulativeBonuses, setCumulativeBonuses] = useState<CumulativeActiveBonuses>(() =>
    calculateCumulativeActiveBonuses(),
  );
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [eventsPanelOpen, setEventsPanelOpen] = useState(false);
  const [selectedGameForDetail, setSelectedGameForDetail] = useState<GameRegistration | null>(null);

  useEffect(() => {
    const update = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setActiveEvents(getAllActiveEvents());
      setCumulativeBonuses(calculateCumulativeActiveBonuses());
    };
    window.addEventListener("desafios:special-events-updated", update);
    const id = window.setInterval(update, 30000);
    return () => {
      window.removeEventListener("desafios:special-events-updated", update);
      window.clearInterval(id);
    };
  }, []);

  // Auto-avanço sutil quando há múltiplos eventos ativos
  useEffect(() => {
    if (activeEvents.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentEventIndex((prev) => (prev + 1) % activeEvents.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeEvents.length]);

  const handleTournamentClick = () => {
    if (!playerProfile) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    if (onOpenWeeklyTournament) onOpenWeeklyTournament();
  };

  const handleX1Click = () => {
    if (effectiveX1ArenaClosed) return;
    if (!playerProfile) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    if (onOpenX1Arena) onOpenX1Arena();
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Título e Subtítulo Compactos da Plataforma */}
      <header className="text-center space-y-1">
        <div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary shadow-2xs">
          <Sparkles className="h-3 w-3" /> Plataforma Educacional
        </div>
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold leading-none tracking-tight text-foreground">
          Desafios de <span className="text-primary">Lógica</span>
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto font-medium">
          Jogos rápidos para treinar raciocínio lógico, matemática e coordenação motora. Escolha um desafio e comece!
        </p>
      </header>

      {/* 2. Painel Retrátil Minimalista: Bônus Acumulados + Faixa de Eventos da Semana */}
      {(cumulativeBonuses.hasActiveBonuses || activeEvents.length > 0) && (() => {
        const currentEv =
          activeEvents.length > 0 ? activeEvents[currentEventIndex % activeEvents.length] : null;
        const handlePrev = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (activeEvents.length <= 1) return;
          setCurrentEventIndex((prev) => (prev - 1 + activeEvents.length) % activeEvents.length);
        };
        const handleNext = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (activeEvents.length <= 1) return;
          setCurrentEventIndex((prev) => (prev + 1) % activeEvents.length);
        };

        return (
          <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-r from-amber-500/10 via-card to-amber-500/10 shadow-2xs overflow-hidden transition-all">
            {/* Barra Superior Minimalista (Sempre Visível — Clique para Abrir/Fechar) */}
            <button
              type="button"
              onClick={() => setEventsPanelOpen((v) => !v)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-left transition-colors hover:bg-amber-500/10 cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-2xs">
                  <Zap className="h-3 w-3 fill-white" /> Bônus & Eventos Ativos
                </span>

                {/* Resumo Minimalista dos Bônus em Pílulas Compactas */}
                {cumulativeBonuses.totalMultiplier > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                    <Flame className="h-3 w-3 text-amber-500 fill-amber-500" />
                    {cumulativeBonuses.totalMultiplier}x XP
                  </span>
                )}
                {cumulativeBonuses.totalDailyCap > 1000 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-extrabold text-cyan-700 dark:text-cyan-300">
                    <Rocket className="h-3 w-3 text-cyan-500" />
                    {cumulativeBonuses.totalDailyCap.toLocaleString("pt-BR")} XP/dia
                  </span>
                )}
                {cumulativeBonuses.totalMatchCap > 20 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                    <Target className="h-3 w-3" />
                    {cumulativeBonuses.totalMatchCap} XP/partida
                  </span>
                )}

                {currentEv && (
                  <span className="truncate text-xs font-bold text-muted-foreground hidden lg:inline">
                    • {currentEv.title} ({currentEv.remainingTime})
                  </span>
                )}
              </div>

              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-card px-2.5 py-0.5 text-[11px] font-extrabold text-foreground shadow-2xs shrink-0">
                {eventsPanelOpen ? (
                  <>
                    Ocultar detalhes <ChevronUp className="h-3 w-3 text-amber-500" />
                  </>
                ) : (
                  <>
                    Visualizar detalhes <ChevronDown className="h-3 w-3 text-amber-500" />
                  </>
                )}
              </span>
            </button>

            {/* Conteúdo Retrátil: Bloquinhos Menores de Bônus + Faixa de Eventos da Semana */}
            {eventsPanelOpen && (
              <div className="border-t border-amber-400/30 p-3 sm:p-4 space-y-3 bg-card/60 animate-in fade-in-50 duration-200">
                {cumulativeBonuses.hasActiveBonuses && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {cumulativeBonuses.totalMultiplier > 1 && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-card px-3 py-2 shadow-2xs">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500 text-white">
                          <Flame className="h-3.5 w-3.5 fill-white" />
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Multiplicador Ativo
                          </p>
                          <p className="font-display text-sm font-black text-foreground">
                            {cumulativeBonuses.totalMultiplier}x de XP
                          </p>
                        </div>
                      </div>
                    )}

                    {cumulativeBonuses.totalDailyCap > 1000 && (
                      <div className="flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-card px-3 py-2 shadow-2xs">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-500 text-white">
                          <Rocket className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="text-[9px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                            Limite Diário Total
                          </p>
                          <p className="font-display text-sm font-black text-foreground">
                            {cumulativeBonuses.totalDailyCap.toLocaleString("pt-BR")} XP/dia
                          </p>
                        </div>
                      </div>
                    )}

                    {cumulativeBonuses.totalMatchCap > 20 && (
                      <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-card px-3 py-2 shadow-2xs">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                          <Target className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="text-[9px] font-black uppercase tracking-wider text-primary">
                            Teto por Partida
                          </p>
                          <p className="font-display text-sm font-black text-foreground">
                            {cumulativeBonuses.totalMatchCap} XP/partida
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Faixa de Eventos da Semana com Altura Mínima Estável (Zero Oscilação) */}
                {currentEv && (
                  <div className="relative overflow-hidden rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-500/10 via-primary/5 to-amber-500/10 p-3 pl-8 pr-8 min-h-[105px] sm:min-h-[95px] flex flex-col justify-center">
                    {activeEvents.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrev}
                          title="Evento anterior"
                          aria-label="Evento anterior"
                          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/70 text-white shadow-xs transition-all hover:bg-neutral-900 cursor-pointer"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleNext}
                          title="Próximo evento"
                          aria-label="Próximo evento"
                          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/70 text-white shadow-xs transition-all hover:bg-neutral-900 cursor-pointer"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </>
                    )}

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider">
                            <Zap className="h-2.5 w-2.5 fill-white" /> {currentEv.badgeLabel}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 dark:bg-card border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-300">
                            <Clock className="h-2.5 w-2.5 text-amber-500" /> {currentEv.remainingTime}
                          </span>
                          {currentEv.activePeriodLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 dark:bg-card/80 border border-amber-200/60 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              <Calendar className="h-2.5 w-2.5 text-primary" /> {currentEv.activePeriodLabel}
                            </span>
                          )}
                          {currentEv.linkedMedalId && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                              <Award className="h-2.5 w-2.5 text-amber-500" /> Recompensa: Medalha
                            </span>
                          )}
                        </div>

                        <h3 className="font-display text-sm sm:text-base font-black text-foreground tracking-tight line-clamp-1">
                          {currentEv.title}
                        </h3>

                        <p className="text-xs text-muted-foreground font-medium line-clamp-2 min-h-[32px]">
                          {currentEv.description}
                        </p>
                      </div>

                      {/* Resumo dos Bônus deste Evento Específico */}
                      <div className="shrink-0 w-full sm:w-auto">
                        <div className="rounded-xl border border-amber-300 dark:border-amber-600 bg-white dark:bg-card px-2.5 py-1.5 shadow-2xs text-center flex flex-col items-center justify-center min-w-[150px] gap-0.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-500">
                            {currentEv.bonusTitle}
                          </span>
                          <div className="flex flex-wrap justify-center gap-1 w-full">
                            {currentEv.bonusBadges && currentEv.bonusBadges.length > 0 ? (
                              currentEv.bonusBadges.map((badge, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="flex items-center justify-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-black text-foreground"
                                >
                                  <span>{badge.icon}</span>
                                  <span className="whitespace-nowrap">{badge.label}</span>
                                </div>
                              ))
                            ) : (
                              <span className="font-display text-xs font-black text-foreground whitespace-nowrap">
                                {currentEv.bonusHighlight}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-muted-foreground font-semibold">
                            {currentEv.bonusScopeText}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. Quadro de Avisos & Novidades (Sempre Aberto e em Destaque) */}
      <NoticeBoard
        slides={noticeSlides}
        enabledDefaultNotices={enabledDefaultNotices}
        hideAllDefaultNotices={hideAllDefaultNotices}
        pauseNoticeBoard={pauseNoticeBoard}
        weeklyGameName={weeklyGameName}
        onSelectGame={(gameId) => {
          const g = GAME_REGISTRY.find((item) => item.id === gameId);
          if (g) {
            setSelectedGameForDetail(g);
          } else {
            onSelect(gameId);
          }
        }}
        onOpenWeeklyTournament={handleTournamentClick}
        onOpenX1Arena={handleX1Click}
      />

      {/* 4. Modos Competitivos Especiais: Torneio Semanal (Nv 3+) & Arena X1 (Nv 5+, 07h–19h) com Cores Diferenciadas */}
      {(tournamentEnabled || effectiveX1Enabled) && (
        <div className="grid sm:grid-cols-2 gap-3.5 sm:gap-4">
          {tournamentEnabled && (
            <button
              type="button"
              onClick={handleTournamentClick}
              className="group flex flex-col justify-between rounded-3xl border-2 border-sky-500/70 bg-gradient-to-br from-blue-950/80 via-slate-900/90 to-sky-950/60 p-4.5 sm:p-5 text-left shadow-[0_4px_25px_rgba(14,165,233,0.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(14,165,233,0.3)] hover:border-sky-400 cursor-pointer min-h-[160px]"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 border border-sky-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-sky-300">
                    <Medal className="h-3 w-3" /> Nível {TOURNAMENT_MIN_LEVEL}+ • +100 XP Extra/Dia
                  </span>
                  {!playerProfile ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/50 px-2 py-0.5 text-[10px] font-extrabold text-amber-300">
                      <Lock className="h-3 w-3" /> Requer Login
                    </span>
                  ) : !canTournament ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      <Lock className="h-3 w-3" /> Requer Nv. {TOURNAMENT_MIN_LEVEL}
                    </span>
                  ) : null}
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-black flex items-center gap-2 text-white">
                  🏆 Torneio Semanal Ranqueado
                </h2>
                <p className="text-xs text-slate-300 leading-snug">
                  Jogo da semana: <b className="text-white">{weeklyGameName}</b>. Você tem{" "}
                  <b className="text-white">10 entradas por dia</b> para subir de Rank e disputar o Top 5!
                </p>
              </div>

              <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-xs font-black text-white shadow-md shadow-sky-500/30 w-fit group-hover:scale-[1.02] transition-transform">
                {!playerProfile ? (
                  <>
                    <LogIn className="h-3.5 w-3.5" /> Entrar para Competir →
                  </>
                ) : canTournament ? (
                  "Ver Top 5 & Jogar Ranqueada →"
                ) : (
                  `Bloqueado (Alcance o Nível ${TOURNAMENT_MIN_LEVEL})`
                )}
              </div>
            </button>
          )}

          {effectiveX1Enabled && (
            <button
              type="button"
              onClick={handleX1Click}
              disabled={effectiveX1ArenaClosed}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 p-4.5 sm:p-5 text-left transition-all min-h-[160px] ${
                effectiveX1ArenaClosed
                  ? "border-destructive/60 bg-gradient-to-br from-red-950/70 via-slate-900/95 to-neutral-950/90 cursor-not-allowed opacity-90 shadow-none"
                  : "border-orange-500/70 bg-gradient-to-br from-orange-950/80 via-slate-900/90 to-amber-950/60 shadow-[0_4px_25px_rgba(249,115,22,0.18)] hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(249,115,22,0.3)] hover:border-orange-400 cursor-pointer"
              }`}
            >
              {/* Faixa Vermelha de Aviso quando a Arena for Fechada pela Coordenação */}
              {effectiveX1ArenaClosed && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-950/85 backdrop-blur-[2px] p-4 text-center border-2 border-destructive animate-in fade-in duration-200">
                  <span className="rounded-full bg-destructive/30 px-3 py-1 font-mono text-xs font-black uppercase text-red-200 border border-destructive/50">
                    ⛔ ARENA FECHADA PELA COORDENAÇÃO
                  </span>
                  <p className="mt-2 text-xs sm:text-sm font-extrabold text-white max-w-xs leading-snug">
                    O modo de duelos X1 está temporariamente fechado pelo administrador.
                  </p>
                  <span className="mt-1 text-[11px] text-red-300 font-medium">Aguarde a reabertura para novos desafios.</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 border border-orange-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-orange-300">
                    <Swords className="h-3 w-3" /> Nível {X1_MIN_LEVEL}+ • +100 XP Extra/Dia
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/40 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-200">
                    <Clock className="h-3 w-3 text-orange-400" /> {x1HoursLabel}
                  </span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-black flex items-center gap-2 text-white">
                  ⚔️ Arena de Batalha X1 Online
                </h2>
                <p className="text-xs text-slate-300 leading-snug">
                  Crie uma sala ou desafie colegas online no 1 vs 1 ao vivo com bônus diários de até <b className="text-white">+100 XP extras</b>.
                </p>
              </div>

              <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 px-4 py-2 text-xs font-black text-white shadow-md shadow-orange-500/30 w-fit group-hover:scale-[1.02] transition-transform">
                {effectiveX1ArenaClosed ? (
                  "Arena Fechada pela Coordenação"
                ) : !playerProfile ? (
                  <>
                    <LogIn className="h-3.5 w-3.5" /> Entrar para Duelar →
                  </>
                ) : isAdminBypass && (!x1OpenNow || playerLevel < X1_MIN_LEVEL || x1ArenaClosed || !x1Enabled) ? (
                  "🔓 Abrir Arena X1 (Modo ADM/Teste) →"
                ) : playerLevel < X1_MIN_LEVEL ? (
                  `Bloqueado (Alcance o Nível ${X1_MIN_LEVEL})`
                ) : !x1OpenNow ? (
                  `Fechada agora (Abre ${x1HoursLabel})`
                ) : (
                  "Abrir Arena X1 (1 vs 1) →"
                )}
              </div>
            </button>
          )}
        </div>
      )}

      {/* 5. Grade de Jogos em 4 Colunas (Alinhada: 2 Jogos sob Torneio Ranqueado e 2 sob Arena X1) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {visible.map((g) => {
          const isLocked = requireCodeGate && !unlocked.includes(g.id);
          const reqLevel = gameLevelRequirements?.[g.id] ?? 1;
          const isLevelLocked = Boolean(playerProfile && !isAdmin && playerLevel < reqLevel);
          const isAdminOnly = Boolean(adminOnlyGames?.[g.id]);

          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGameForDetail(g)}
              className="group relative flex flex-col items-center justify-center rounded-3xl border-2 border-border/70 bg-card p-4 sm:p-5 text-center shadow-xs transition-all hover:scale-[1.03] hover:border-primary hover:shadow-xl hover:bg-accent/10 active:scale-95 cursor-pointer min-h-[155px]"
            >
              {/* Ícone no Centro em Quadrado Arredondado Vibrante */}
              <div
                className={`grid h-16 w-16 sm:h-20 sm:w-20 place-items-center rounded-2xl bg-gradient-to-br ${g.gradient} text-white shadow-md group-hover:scale-105 group-hover:shadow-primary/30 transition-all mb-2.5`}
              >
                {React.isValidElement(g.icon)
                  ? React.cloneElement(g.icon as React.ReactElement<{ className?: string }>, {
                      className: "h-9 w-9 sm:h-11 sm:w-11",
                    })
                  : g.icon}
              </div>

              {/* Nome do Jogo Abaixo do Ícone */}
              <span className="font-display text-sm sm:text-base font-black text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2">
                {g.title}
              </span>

              {/* Badges de Status (Apenas ADM, Bloqueio por Nível ou Código) */}
              <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5">
                {isAdminOnly && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-[9px] font-black uppercase text-purple-300">
                    🧪 Testes ADM
                  </span>
                )}
                {isLevelLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Nível {reqLevel}+
                  </span>
                )}
                {isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Bloqueado
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Card Opcional para Inserir Novo Código de Jogo (Configurável no Painel ADM) */}
        {showCodeGateCardOnHome && (
          <button
            type="button"
            onClick={onAddCode}
            className="group flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary/40 bg-card/40 p-4 sm:p-5 text-center transition-all hover:border-primary hover:bg-card hover:shadow-md cursor-pointer min-h-[155px]"
          >
            <div className="grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 transition-transform mb-2">
              <KeyRound className="h-7 w-7" />
            </div>
            <span className="font-display text-xs sm:text-sm font-black text-foreground group-hover:text-primary transition-colors leading-tight">
              Inserir Código
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
              Liberar novos desafios
            </span>
          </button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground font-medium pt-2">
        Idealizado para alunos do 5º ao 9º ano • Funciona no celular, tablet e computador. Projeto INTEGRAÇÃO — SEMED-COARI.
      </p>

      {/* 6. Modal de Detalhes do Jogo (Instruções, Recorde Pessoal, Recorde da Etapa, Modalidades e Botão Jogar) */}
      {selectedGameForDetail && (
        <Suspense fallback={null}>
          <GameDetailDialog
            game={selectedGameForDetail}
            open={Boolean(selectedGameForDetail)}
            onOpenChange={(isOpen) => {
              if (!isOpen) setSelectedGameForDetail(null);
            }}
            onPlay={(gameId) => {
              setSelectedGameForDetail(null);
              onSelect(gameId);
            }}
            personalStats={stats[selectedGameForDetail.id] ?? { bestScore: 0, bestLevel: 1 }}
            stageRecord={getGameStageRecord(selectedGameForDetail.id, stageId, gameRecords)}
            stageName={playerProfile ? undefined : "1ª Etapa (5º ano)"}
            isGuest={!playerProfile}
            isLevelLocked={Boolean(
              playerProfile &&
                !isAdmin &&
                playerLevel < (gameLevelRequirements?.[selectedGameForDetail.id] ?? 1),
            )}
            requiredLevel={gameLevelRequirements?.[selectedGameForDetail.id] ?? 1}
            isUnlocked={!requireCodeGate || unlocked.includes(selectedGameForDetail.id)}
            onOpenCodeGate={() => {
              setSelectedGameForDetail(null);
              onAddCode();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function Badge({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "accent";
}) {
  const cls = tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {icon}
      <span className="opacity-80">{label}:</span> <span className="font-extrabold">{value}</span>
    </span>
  );
}
