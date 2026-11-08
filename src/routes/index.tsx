import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Menu } from "@/components/games/Menu";
import { getGameRegistration } from "@/lib/game-registry";
import { CodeGate } from "@/components/games/CodeGate";
import { loadUnlocked } from "@/lib/game-codes";
import { PlayerAuthProvider, usePlayerAuth } from "@/lib/player-auth";
import { PlayerMenu } from "@/components/games/PlayerMenu";
import { PlayerAuthDialog } from "@/components/games/PlayerAuthDialog";
import { X1ArenaDialog } from "@/components/games/X1ArenaDialog";
import { X1MatchOverlay } from "@/components/games/X1MatchOverlay";
import { WeeklyTournamentDialog } from "@/components/games/WeeklyTournamentDialog";
import { MedalUnlockNotification } from "@/components/games/MedalUnlockNotification";
import { GameRecordBanner } from "@/components/games/GameRecordBanner";
import {
  recordGameStageScore,
  seedRecordsFromRegistry,
  syncGameRecordsWithPlayFab,
} from "@/lib/game-records";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Swords } from "lucide-react";
import {
  heartbeatOnlinePlayer,
  getX1LobbySnapshot,
  joinX1RoomAsync,
  rejectX1Invite,
  subscribeX1Updates,
  syncX1WithPlayFabCloud,
  type X1Room,
  type X1DirectInvite,
} from "@/lib/x1-challenge";
import { playTone } from "@/lib/sound";
import {
  getLocalUserLastActiveAt,
  setPlayerCurrentActivity,
  usePresenceTracker,
} from "@/lib/presence";
import {
  getWeekInfo,
  recordWeeklyTournamentAttempt,
  resolveWeeklyTournamentGame,
} from "@/lib/weekly-tournament";
import { awardCareerPoints, RECORD_STAGE_MAX_POINTS } from "@/lib/career-points";
import integracaoPreto from "@/assets/integracao-preto.jpg";
import semed from "@/assets/semed.png";
import {
  ageFrom,
  getLocalDateKey,
  isMatchVictory,
  isX1WindowOpen,
  stageFromBirthdate,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
} from "@/lib/player-profile";
import { getActiveEventBonuses } from "@/lib/custom-events";
import {
  DEFAULT_STATS,
  GAME_NAMES,
  loadLastMatch,
  loadStats,
  type AllStats,
  type GameId,
} from "@/lib/game-storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Desafios de Lógica — Plataforma Educacional" },
      {
        name: "description",
        content:
          "Jogos educativos de lógica matemática e raciocínio para alunos do 5º ao 9º ano.",
      },
      { property: "og:title", content: "Desafios de Lógica" },
      {
        property: "og:description",
        content: "Jogos educativos gamificados — Projeto INTEGRAÇÃO (SEMED Coari).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IndexPage,
});

export function IndexPage() {
  return (
    <PlayerAuthProvider>
      <Index />
    </PlayerAuthProvider>
  );
}

function Index() {
  const [view, setView] = useState<"menu" | GameId>("menu");
  const [stats, setStats] = useState<AllStats>(DEFAULT_STATS);
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState<GameId[]>([]);
  const [addingCode, setAddingCode] = useState(false);
  const [x1Open, setX1Open] = useState(false);
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [activeX1Room, setActiveX1Room] = useState<X1Room | null>(null);
  const [activeRankedGameId, setActiveRankedGameId] = useState<GameId | null>(null);
  const [confirmAbandonOpen, setConfirmAbandonOpen] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<X1DirectInvite | null>(null);
  const [rejectNotice, setRejectNotice] = useState<string | null>(null);
  const auth = usePlayerAuth();

  const refreshLocal = () => {
    setStats(loadStats());
    setUnlocked(loadUnlocked());
  };

  async function finishRankedEntry(exitToMenu = true) {
    if (!activeRankedGameId) {
      if (exitToMenu) setView("menu");
      return;
    }
    const gId = activeRankedGameId;
    const latestStats = loadStats();
    const last = loadLastMatch(gId);
    const score = last?.score ?? latestStats[gId]?.bestScore ?? 0;
    const level = last?.level ?? latestStats[gId]?.bestLevel ?? 1;
    setActiveRankedGameId(null);

    if (auth.profile) {
      const correct = last?.correct ?? 0;
      const wrong = last?.wrong ?? 0;
      const safeScore = Math.max(0, score);
      const pStage = stageFromBirthdate(auth.profile.birthdate, new Date(), auth.profile.school).id;
      const stageRecRes = recordGameStageScore({
        gameId: gId,
        stage: pStage,
        playerId: auth.profile.id,
        nick: auth.profile.nick,
        fullName: auth.profile.full_name,
        school: auth.profile.school,
        score: safeScore,
        achievedAt: Date.now(),
      });
      if (stageRecRes.isNewRecord) {
        awardCareerPoints(auth.profile, RECORD_STAGE_MAX_POINTS, "Novo Recorde da Escola/Etapa");
      }
      const attemptRes = await recordWeeklyTournamentAttempt({
        profile: auth.profile,
        score: safeScore,
        correct,
        wrong,
      });
      const wonRanked = isMatchVictory(safeScore, correct, wrong);
      await auth.recordMatch({
        gameId: gId,
        mode: "torneio_semanal",
        won: wonRanked,
        score: safeScore,
        level,
        correct,
        wrong,
        tournamentPoints: attemptRes.newTournamentPoints,
        tournamentRankId: attemptRes.currentRank.id,
      });
    }
    refreshLocal();
    void auth.refresh();
    if (exitToMenu) {
      setView("menu");
      setTournamentOpen(true);
    }
  }

  useEffect(() => {
    setMounted(true);
    refreshLocal();
    seedRecordsFromRegistry();
    void syncGameRecordsWithPlayFab();
  }, [view]);

  // Instantly re-render when ADM updates enabled/disabled games or lock gates
  useEffect(() => {
    const handleCfgUpdate = () => {
      refreshLocal();
      void auth.refresh();
    };
    window.addEventListener("desafios:admin-config-updated", handleCfgUpdate);
    return () => window.removeEventListener("desafios:admin-config-updated", handleCfgUpdate);
  }, [auth]);

  // Track user presence and activity (Verde < 5min, Cinza 5-10min, Vermelho > 10min)
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

  // Rastreia e atualiza a atividade atual do aluno para exibição em tempo real ao ADM
  useEffect(() => {
    if (view !== "menu") {
      const mode = activeRankedGameId
        ? "torneio_semanal"
        : activeX1Room
          ? "duelo_x1"
          : "normal";
      const currentLevel = stats[view]?.bestLevel || 1;
      setPlayerCurrentActivity({
        type: "game",
        gameId: view,
        gameName: GAME_NAMES[view] || view,
        mode,
        level: currentLevel,
      });
    } else if (tournamentOpen) {
      setPlayerCurrentActivity({ type: "tournament" });
    } else if (x1Open) {
      setPlayerCurrentActivity({ type: "x1_arena" });
    } else {
      setPlayerCurrentActivity({ type: "menu" });
    }
  }, [view, activeRankedGameId, activeX1Room, tournamentOpen, x1Open, stats]);

  // Keep logged-in student visible in the online players list across the platform
  useEffect(() => {
    if (!auth.profile) return;
    const p = auth.profile;
    const pulse = () => {
      heartbeatOnlinePlayer({
        playerId: p.id,
        nick: p.nick,
        fullName: p.full_name,
        school: p.school,
        level: p.level,
        age: ageFrom(p.birthdate),
        stage: stageFromBirthdate(p.birthdate, new Date(), p.school).id,
        inRoomCode: activeX1Room?.code ?? null,
        lastActiveAt: getLocalUserLastActiveAt(),
      });
      void syncX1WithPlayFabCloud(activeX1Room?.code ?? null);
    };
    pulse();
    const id = window.setInterval(pulse, 5000);
    return () => window.clearInterval(id);
  }, [auth.profile, activeX1Room?.code]);

  // Monitor incoming X1 challenge invites in real-time
  useEffect(() => {
    if (!auth.profile) return;
    const myId = auth.profile.id;

    const checkInvites = () => {
      const snap = getX1LobbySnapshot(myId);
      const pending = snap.myInvites.find((i) => !i.status || i.status === "pending");
      if (pending && (!incomingInvite || incomingInvite.id !== pending.id)) {
        playTone(880, 0.25, "sine");
        setIncomingInvite(pending);
      } else if (!pending && incomingInvite) {
        setIncomingInvite(null);
      }
    };

    checkInvites();
    const unsub = subscribeX1Updates(checkInvites);
    const pollId = window.setInterval(checkInvites, 3000);

    const handleReject = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.rejectedByNick) {
        setRejectNotice(`${detail.rejectedByNick} recusou o desafio X1.`);
        window.setTimeout(() => setRejectNotice(null), 4000);
      }
    };
    window.addEventListener("desafios:x1-invite-rejected", handleReject);

    return () => {
      unsub();
      window.clearInterval(pollId);
      window.removeEventListener("desafios:x1-invite-rejected", handleReject);
    };
  }, [auth.profile, incomingInvite]);

  useEffect(() => {
    if (auth.unlocked.length === 0) return;
    setUnlocked((cur) => [...new Set([...cur, ...auth.unlocked])]);
  }, [auth.unlocked]);

  // Merge local stats with logged-in player's PlayFab stats
  const displayStats = useMemo<AllStats>(() => {
    if (!mounted) return DEFAULT_STATS;
    const merged: AllStats = { ...stats };
    for (const row of auth.stats) {
      const cur = merged[row.game_id] ?? { bestScore: 0, bestLevel: 1 };
      merged[row.game_id] = {
        bestScore: Math.max(cur.bestScore, row.best_score),
        bestLevel: Math.max(cur.bestLevel, row.best_level),
      };
    }
    return merged;
  }, [mounted, stats, auth.stats]);

  const cfg = auth.adminConfig;
  const isGameEnabled = (id: GameId) => Boolean(cfg.enabledGames && cfg.enabledGames[id] === true);
  const visibleUnlockedCount = unlocked.filter((id) => isGameEnabled(id)).length;
  const showGate =
    mounted &&
    !auth.loading &&
    (addingCode || (cfg.requireCodeGate && visibleUnlockedCount === 0));

  const openHour = cfg.x1OpenHour ?? 7;
  const closeHour = cfg.x1CloseHour ?? 19;
  const x1OpenNow =
    Boolean(cfg.x1ForceOpen) || isX1WindowOpen(new Date(), openHour, closeHour);
  const x1HoursLabel = cfg.x1ForceOpen
    ? "Liberado pelo ADM"
    : `${String(openHour).padStart(2, "0")}:00 às ${String(closeHour).padStart(2, "0")}:00`;
  const { weekIndex } = getWeekInfo();
  const weeklyGameId = resolveWeeklyTournamentGame(
    weekIndex,
    cfg.tournamentGameOverride,
    cfg.enabledGames,
  );
  const weeklyGameName = GAME_NAMES[weeklyGameId] ?? weeklyGameId;

  const todayKey = getLocalDateKey();
  const isTodayRecord = auth.profile && auth.profile.dailyXpDate === todayKey;
  const dailyTournamentEntries = isTodayRecord
    ? Math.max(0, auth.profile?.dailyTournamentEntries ?? 0)
    : 0;
  const dailyTournamentXp = isTodayRecord
    ? Math.max(0, auth.profile?.dailyTournamentXp ?? 0)
    : 0;

  const handleExitGame = () => {
    if (activeRankedGameId) {
      setConfirmAbandonOpen(true);
    } else {
      setView("menu");
    }
  };

  const handleConfirmAbandon = () => {
    setActiveRankedGameId(null);
    setConfirmAbandonOpen(false);
    setView("menu");
  };

  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-6">
      {/* Cabeçalho Unificado: Logos Institucionais à Esquerda (Empilhadas) e Controles à Direita */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 shrink-0">
          <img
            src={integracaoPreto}
            alt="Logo do Projeto INTEGRAÇÃO"
            className="h-6 sm:h-7 w-auto object-contain rounded-sm dark:brightness-110"
          />
          <img
            src={semed}
            alt="Logo da SEMED Coari"
            className="h-6 sm:h-7 w-auto object-contain rounded-sm dark:brightness-110"
          />
        </div>

        <div className="flex items-center gap-2">
          <PlayerMenu
            onConfigChanged={() => {
              refreshLocal();
              void auth.refresh();
            }}
          />
        </div>
      </div>

      {view === "menu" && showGate && (
        <CodeGate
          hasGames={visibleUnlockedCount > 0}
          onUnlocked={(game) => {
            const list = loadUnlocked();
            setUnlocked(list);
            void auth.unlockGames(game ? [game] : list);
            setAddingCode(false);
          }}
          onBack={() => setAddingCode(false)}
        />
      )}
      {view === "menu" && (!mounted || auth.loading) && (
        <div className="py-24 text-center text-sm font-semibold text-muted-foreground">
          Carregando jogos disponíveis...
        </div>
      )}
      {view === "menu" && mounted && !auth.loading && !showGate && (
        <Menu
          stats={displayStats}
          unlocked={unlocked}
          enabledGames={cfg.enabledGames}
          requireCodeGate={cfg.requireCodeGate}
          showCodeGateCardOnHome={cfg.showCodeGateCardOnHome}
          x1Enabled={cfg.x1Enabled ?? true}
          x1ArenaClosed={cfg.x1ArenaClosed ?? false}
          x1OpenNow={x1OpenNow}
          x1HoursLabel={x1HoursLabel}
          tournamentEnabled={cfg.tournamentEnabled ?? true}
          weeklyGameName={weeklyGameName}
          playerLevel={auth.profile?.level}
          playerProfile={auth.profile}
          noticeSlides={cfg.noticeSlides}
          enabledDefaultNotices={cfg.enabledDefaultNotices}
          hideAllDefaultNotices={cfg.hideAllDefaultNotices}
          pauseNoticeBoard={cfg.pauseNoticeBoard}
          adminOnlyGames={cfg.adminOnlyGames}
          gameLevelRequirements={cfg.gameLevelRequirements}
          isAdmin={auth.isAdmin}
          onSelect={(id) => {
            setActiveRankedGameId(null);
            setView(id);
          }}
          onAddCode={() => setAddingCode(true)}
          onOpenX1Arena={() => setX1Open(true)}
          onOpenWeeklyTournament={() => setTournamentOpen(true)}
          onOpenAuth={() => setAuthDialogOpen(true)}
        />
      )}

      {/* Banner Ao Vivo Informativo do Torneio Semanal Ranqueado */}
      {activeRankedGameId && view === activeRankedGameId && (() => {
        const eventBonuses = getActiveEventBonuses(
          activeRankedGameId,
          1000,
          20,
          undefined,
          undefined,
          undefined,
          true,
        );
        const rankedMult = eventBonuses.rankedMultiplier ?? 1;
        const isFree = dailyTournamentEntries < TOURNAMENT_DAILY_FREE_ENTRIES;
        return (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary bg-primary/10 px-4 py-3 shadow-sm">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-extrabold text-primary">
                  🏆 PARTIDA RANQUEADA EM ANDAMENTO — {GAME_NAMES[activeRankedGameId]}
                </span>
                {rankedMult > 1 && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[11px] font-black text-amber-500 animate-pulse">
                    ⚡ {rankedMult}x Pontos
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {isFree ? (
                  <span>
                    Entrada Gratuita: <b>{dailyTournamentEntries + 1}/{TOURNAMENT_DAILY_FREE_ENTRIES}</b> • Conclua a partida para somar seus pontos ranqueados (10 base - 1 por erro).
                  </span>
                ) : (
                  <span>
                    Entrada Extra Paga (5 pts) • Conclua a partida para somar seus pontos ranqueados (10 base - 1 por erro).
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-primary/30 bg-background/60 px-3 py-1.5 text-right">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Regra Ranqueada</div>
              <div className="text-xs font-black text-foreground">Conclusão Obrigatória</div>
            </div>
          </div>
        );
      })()}

      {/* Overlay Ao Vivo do Desafio X1 (1v1) */}
      {activeX1Room && (
        <X1MatchOverlay
          initialRoom={activeX1Room}
          onExitX1={() => {
            setActiveX1Room(null);
            setView("menu");
            refreshLocal();
          }}
        />
      )}

      {/* Execução Dinâmica de Qualquer Jogo Registrado */}
      {!activeX1Room && view !== "menu" && (() => {
        const reg = getGameRegistration(view);
        if (!reg) return null;
        const GameComponent = reg.component;
        const personalBest = displayStats[view]?.bestScore ?? 0;
        return (
          <GameComponent
            onExit={handleExitGame}
            onStatsChange={() => {
              refreshLocal();
              if (activeRankedGameId && view === activeRankedGameId) {
                void finishRankedEntry(false);
              }
            }}
            isRanked={Boolean(activeRankedGameId && view === activeRankedGameId)}
          />
        );
      })()}

      <X1ArenaDialog
        open={x1Open}
        onOpenChange={setX1Open}
        onStartX1Match={(room) => {
          setActiveRankedGameId(null);
          setActiveX1Room(room);
          setView(room.gameId);
        }}
        onRequireLogin={() => setAuthDialogOpen(true)}
      />

      <WeeklyTournamentDialog
        open={tournamentOpen}
        onOpenChange={setTournamentOpen}
        onStartRankedEntry={(gameId) => {
          setActiveX1Room(null);
          setActiveRankedGameId(gameId);
          setView(gameId);
        }}
        onRequireLogin={() => setAuthDialogOpen(true)}
      />

      <PlayerAuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />

      <MedalUnlockNotification />

      {/* Modal Sobreposto de Desafio Direto X1 Recebido */}
      <Dialog
        open={Boolean(incomingInvite)}
        onOpenChange={(v) => {
          if (!v && incomingInvite && auth.profile) {
            rejectX1Invite(incomingInvite.id, auth.profile.nick);
            setIncomingInvite(null);
          }
        }}
      >
        <DialogContent className="rounded-3xl border-2 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl sm:text-2xl font-extrabold text-foreground">
              <Swords className="h-6 w-6 text-accent animate-bounce" /> Desafio X1 Recebido!
            </DialogTitle>
          </DialogHeader>

          {incomingInvite && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-4 text-center space-y-2">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-black text-accent-foreground uppercase">
                  {GAME_NAMES[incomingInvite.gameId]}
                </span>
                <p className="font-display text-xl font-black text-foreground">
                  {incomingInvite.fromNick} desafiou você!
                </p>
                <p className="text-xs text-muted-foreground">
                  Escola: <b>{incomingInvite.fromSchool}</b> • Sala: <b>#{incomingInvite.roomCode}</b>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (auth.profile) rejectX1Invite(incomingInvite.id, auth.profile.nick);
                    setIncomingInvite(null);
                  }}
                  className="h-12 rounded-2xl font-bold"
                >
                  Recusar
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!auth.profile) return;
                    const res = await joinX1RoomAsync({
                      code: incomingInvite.roomCode,
                      guest: {
                        playerId: auth.profile.id,
                        nick: auth.profile.nick,
                        school: auth.profile.school,
                        level: auth.profile.level,
                      },
                    });
                    if (res.room) {
                      setIncomingInvite(null);
                      setX1Open(false);
                      setActiveRankedGameId(null);
                      setActiveX1Room(res.room);
                      setView(res.room.gameId);
                    } else {
                      setIncomingInvite(null);
                      setRejectNotice(res.error || "Esta sala X1 já foi desfeita ou expirou.");
                      window.setTimeout(() => setRejectNotice(null), 4000);
                    }
                  }}
                  className="h-12 rounded-2xl font-display font-extrabold text-sm"
                >
                  Aceitar Desafio
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alerta de Recusa de Desafio */}
      {rejectNotice && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-destructive text-destructive-foreground px-4 py-3 shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2">
          <span>❌ {rejectNotice}</span>
        </div>
      )}

      {/* Confirmação de Abandono de Partida Ranqueada */}
      <AlertDialog open={confirmAbandonOpen} onOpenChange={setConfirmAbandonOpen}>
        <AlertDialogContent className="rounded-3xl border-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-black text-destructive">
              Abandonar Desafio Ranqueado?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Você está disputando uma partida oficial do <b>Torneio Semanal Ranqueado</b>.
              Se sair agora antes de finalizar a atividade, o seu progresso não será computado no ranking e a tentativa será perdida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl font-bold">
              Continuar Jogando
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAbandon}
              className="rounded-xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, Abandonar Partida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
