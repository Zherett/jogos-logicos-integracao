import { lazy, Suspense, useState, useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  User,
  LogOut,
  Cake,
  School,
  Trophy,
  Star,
  Award,
  Gamepad2,
  ShieldCheck,
  Volume2,
  VolumeX,
  Flame,
  Lock,
  CheckCircle2,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Send,
  RotateCw,
  Mail,
  Swords,
  Ticket,
  Calendar,
  Backpack,
  BadgeDollarSign,
  Coins,
  Palette,
} from "lucide-react";
import {
  canAccessDailyRoutine,
  canAccessShopAndCustomization,
  canUseDefaultAvatar,
  canViewCoinsWallet,
  getDailyRewardClaimState,
} from "@/lib/daily-rewards";
import { generateDailyMissions } from "@/lib/daily-missions";
import { generateWeeklyMissions } from "@/lib/weekly-missions";
import { canAccessPromoCodeRedeem } from "@/lib/promo-codes";
import { loadSpecialEvents, loadRecurringEvents } from "@/lib/custom-events";
import { resolveEquippedAura, resolveEquippedAvatar } from "@/lib/cosmetics-catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuraPresentation, PlayerAvatarBadge } from "./PlayerAvatarBadge";

const ShopModal = lazy(() =>
  import("./ShopModal").then((m) => ({ default: m.ShopModal })),
);
const CustomizeProfileModal = lazy(() =>
  import("./CustomizeProfileModal").then((m) => ({ default: m.CustomizeProfileModal })),
);

const PromoCodeRedeemDialog = lazy(() =>
  import("./PromoCodeRedeemDialog").then((m) => ({ default: m.PromoCodeRedeemDialog })),
);
const DailyRewardsModal = lazy(() =>
  import("./DailyRewardsModal").then((m) => ({ default: m.DailyRewardsModal })),
);
const PlayerItemsInventory = lazy(() =>
  import("./PlayerItemsInventory").then((m) => ({ default: m.PlayerItemsInventory })),
);
const PlayerAuthDialog = lazy(() =>
  import("./PlayerAuthDialog").then((m) => ({ default: m.PlayerAuthDialog })),
);
const PlayerMedalsInventory = lazy(() =>
  import("./PlayerMedalsInventory").then((m) => ({ default: m.PlayerMedalsInventory })),
);
const PlayerInboxModal = lazy(() =>
  import("./PlayerInboxModal").then((m) => ({ default: m.PlayerInboxModal })),
);
import { TournamentRankBadge } from "./TournamentRankBadge";
import {
  getTournamentStoreRecord,
  getWeeklyTournamentSnapshot,
  resolveCanonicalTournamentPoints,
  syncWeeklyTournamentWithPlayFab,
} from "@/lib/weekly-tournament";
import { ThemeToggle } from "./ThemeToggle";
import {
  aggregateStatsByGame,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
  getGameMedalsProgress,
  getMedalProgressStyle,
} from "@/lib/medals-catalog";
import {
  getInboxCountsForPlayer,
  isMessageEligibleForPlayer,
  subscribeToInboxSync,
} from "@/lib/inbox-messages";
import { setPlayerCurrentActivity } from "@/lib/presence";
import { PresenceDot } from "./PresenceDot";
import { OPEN_REAUTH_LOGIN_EVENT, usePlayerAuth } from "@/lib/player-auth";
import {
  DEFAULT_DAILY_XP_CAP,
  is5thGradeSchool,
  isOfficialSemedSchool,
  isSecondStageSchool,
  levelProgress,
  MAX_LEVEL,
  RAIMUNDO_GRADES,
  resolveDefaultRankingCategory,
  schoolNeedsGrade,
  SCHOOLS,
  stageForPlayer,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  VALID_TURMAS,
  X1_DAILY_EXTRA_XP_CAP,
  type TurmaCode,
} from "@/lib/player-profile";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import { useSoundMuted, playNotificationChime } from "@/lib/sound";
import {
  fetchLeaderboard,
  getAuthoritativeDateKey,
  getAuthoritativeNow,
  playfabCompleteInitialSchoolSetup,
  playfabSetInitialTurma,
  playfabRequestTurmaChange,
  syncAdminConfigFromPlayFab,
} from "@/lib/playfab";

interface Props {
  onConfigChanged?: () => void;
  leftSlot?: React.ReactNode;
}

/** Discreet explanation tooltip */
function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted/90 text-[10px] font-black text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none"
        title={text}
        aria-label="Mais informações"
      >
        ?
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 w-52 rounded-xl border bg-popover px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-popover-foreground shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}

/** Top navigation bar with Ranking, Sound Mute, Admin Panel and Player Profile. */
export function PlayerMenu({ onConfigChanged, leftSlot }: Props) {
  const auth = usePlayerAuth();
  const sound = useSoundMuted();
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [promoCodeOpen, setPromoCodeOpen] = useState(false);
  const [dailyRewardsOpen, setDailyRewardsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [inboxCounts, setInboxCounts] = useState({ unreadCount: 0, unclaimedRewardsCount: 0, totalAlerts: 0 });

  // Accordion collapsible & profile tab states
  const [levelExpanded, setLevelExpanded] = useState(false);
  const [profileTab, setProfileTab] = useState<"perfil" | "medalhas" | "inventario">("perfil");

  // Turma change request dialog state
  const [turmaModalOpen, setTurmaModalOpen] = useState(false);
  const [selectedNewTurma, setSelectedNewTurma] = useState<TurmaCode>("A");
  const [turmaMsg, setTurmaMsg] = useState<string | null>(null);

  // One-time initial School / Grade / Turma setup states (for regular players who left them blank at signup)
  const [initialSchool, setInitialSchool] = useState<string>("Nenhuma");
  const [initialGrade, setInitialGrade] = useState<string>(RAIMUNDO_GRADES[0]);
  const [initialTurma, setInitialTurma] = useState<string>("");
  const [savingInitialSetup, setSavingInitialSetup] = useState(false);
  const [initialSetupMsg, setInitialSetupMsg] = useState<string | null>(null);

  // Player rank position in their competing series
  const [playerRank, setPlayerRank] = useState<number | null>(null);

  const profile = auth.profile;
  const stageInfo = profile
    ? stageForPlayer(profile.school, profile.birthdate, new Date(), profile.ageStage)
    : null;
  const bday: { isToday: boolean; daysUntil: number } | null = null;
  const effProg = useMemo(
    () =>
      profile
        ? getEffectivePlayerProgression(
            profile,
            auth.stats,
            auth.adminConfig.enabledGames,
          )
        : null,
    [profile, auth.stats, auth.adminConfig.enabledGames],
  );
  const distinctGames = effProg ? effProg.distinctGames : 0;
  const matchesCount = effProg ? effProg.matchesPlayed : 0;
  const statsByGameMap = useMemo(
    () => aggregateStatsByGame(auth.stats, auth.adminConfig.enabledGames),
    [auth.stats, auth.adminConfig.enabledGames],
  );
  const progress = useMemo(
    () =>
      effProg
        ? levelProgress({
            xp: effProg.xp,
            matchesPlayed: effProg.matchesPlayed,
            wins: effProg.wins,
            distinctGames: effProg.distinctGames,
            currentLevel: effProg.level,
            stageProgress: effProg.stageProgress,
            maxAvailableGames: effProg.maxAvailableGames,
          })
        : null,
    [effProg],
  );
  const dailyCap = auth.adminConfig.dailyXpCap ?? DEFAULT_DAILY_XP_CAP;
  const authoritativeNow = getAuthoritativeNow();
  const todayKey = getAuthoritativeDateKey(authoritativeNow);
  const isTodayRecord = profile && profile.dailyXpDate === todayKey;
  const dailyXp = isTodayRecord ? Math.max(0, profile.dailyXp ?? 0) : 0;
  const dailyX1Xp = isTodayRecord ? Math.max(0, profile.dailyX1Xp ?? 0) : 0;
  const dailyTournamentXp = isTodayRecord ? Math.max(0, profile.dailyTournamentXp ?? 0) : 0;
  const dailyTournamentEntries = isTodayRecord
    ? Math.max(0, profile.dailyTournamentEntries ?? 0)
    : 0;
  const dailyPercent = Math.min(100, Math.round((dailyXp / Math.max(1, dailyCap)) * 100));
  const isDailyCapped = dailyXp >= dailyCap;
  const showDailyRoutine = canAccessDailyRoutine(profile, auth.isAdmin, auth.adminConfig);
  const showCoinsWallet = canViewCoinsWallet(profile, auth.isAdmin, auth.adminConfig);
  const showDefaultAvatar = canUseDefaultAvatar(profile, auth.isAdmin, auth.adminConfig);
  const showShopAndCosmetics = canAccessShopAndCustomization(profile, auth.isAdmin, auth.adminConfig);
  const dailyClaimState = getDailyRewardClaimState(profile, todayKey);
  const currentCycleDay = dailyClaimState.currentDay;
  const pendingRoutineRewardsCount = useMemo(() => {
    if (!showDailyRoutine || !profile) return 0;
    let count = dailyClaimState.isTodayClaimed ? 0 : 1;
    const dMissions = generateDailyMissions({
      profile,
      stats: auth.stats,
      adminConfig: auth.adminConfig,
      dateKey: todayKey,
    });
    count += dMissions.filter((m) => m.current >= m.target && !m.claimed).length;
    const wMissions = generateWeeklyMissions({
      profile,
      adminConfig: auth.adminConfig,
      now: authoritativeNow,
    });
    count += wMissions.filter((m) => m.current >= m.target && !m.claimed).length;
    return count;
  }, [showDailyRoutine, profile, dailyClaimState.isTodayClaimed, auth.stats, auth.adminConfig, todayKey]);

  // Retrieve player's official weekly tournament ranking position in their stage
  useEffect(() => {
    if (!profileOpen || !profile) return;
    setProfileTab("perfil");
    setInitialSchool(profile.school || "Nenhuma");
    setInitialGrade(profile.grade || RAIMUNDO_GRADES[0]);
    setInitialTurma(profile.turma || "");
    setInitialSetupMsg(null);

    let active = true;
    const refreshRank = () => {
      if (!active) return;
      const snap = getWeeklyTournamentSnapshot(profile);
      setPlayerRank(snap.myStanding?.rank ?? null);
    };

    refreshRank();
    void syncWeeklyTournamentWithPlayFab()
      .then(() => {
        refreshRank();
      })
      .catch(() => {
        /* ignore network errors */
      });

    window.addEventListener("desafios:weekly-tournament-updated", refreshRank);
    return () => {
      active = false;
      window.removeEventListener("desafios:weekly-tournament-updated", refreshRank);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, profile?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenReauth = () => {
      setProfileOpen(false);
      setAuthOpen(true);
    };
    window.addEventListener(OPEN_REAUTH_LOGIN_EVENT, onOpenReauth);
    return () => window.removeEventListener(OPEN_REAUTH_LOGIN_EVENT, onOpenReauth);
  }, []);

  // Em tablets compartilhados, fecha automaticamente modais abertos quando o aluno sai ou troca de conta
  useEffect(() => {
    setShopOpen(false);
    setDailyRewardsOpen(false);
    setCustomizeOpen(false);
    setPromoCodeOpen(false);
  }, [profile?.id]);

  // Atualiza em tempo real a atividade do aluno quando ele visualiza perfil, medalhas ou caixa de entrada
  const hadOverlayOpenRef = useRef(false);
  useEffect(() => {
    if (inboxOpen) {
      hadOverlayOpenRef.current = true;
      setPlayerCurrentActivity({ type: "inbox" });
    } else if (profileOpen) {
      hadOverlayOpenRef.current = true;
      if (profileTab === "medalhas") {
        setPlayerCurrentActivity({ type: "medals" });
      } else {
        setPlayerCurrentActivity({ type: "profile" });
      }
    } else if (hadOverlayOpenRef.current) {
      hadOverlayOpenRef.current = false;
      const isOnRankingPage =
        typeof window !== "undefined" && window.location.pathname.includes("ranking");
      setPlayerCurrentActivity({ type: isOnRankingPage ? "ranking" : "menu" });
    }
  }, [inboxOpen, profileOpen, profileTab]);
  useEffect(() => {
    if (!profile) {
      setInboxCounts({ unreadCount: 0, unclaimedRewardsCount: 0, totalAlerts: 0 });
      return;
    }

    let previousUnread = 0;

    const updateCounts = () => {
      const counts = getInboxCountsForPlayer(profile);
      setInboxCounts(counts);
      return counts;
    };

    const currentCounts = updateCounts();
    previousUnread = currentCounts.unreadCount;

    // Se o jogador acabou de logar (ou carregou a sessão) e possui mensagens não lidas:
    // Notifica com o som suave e atualiza o badge no botão do correio
    if (currentCounts.unreadCount > 0) {
      const sessionKey = `desafios_notified_inbox_${profile.id}_${currentCounts.unreadCount}`;
      try {
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, "1");
          playNotificationChime();
        }
      } catch {
        /* ignore */
      }
    }

    // Função de sincronização com o PlayFab Cloud a cada 20 segundos (apenas quando a aba está visível)
    const syncInboxCloud = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        await syncAdminConfigFromPlayFab();
        const counts = updateCounts();
        if (counts.unreadCount > previousUnread) {
          playNotificationChime();
        }
        previousUnread = counts.unreadCount;
      } catch {
        /* ignore */
      }
    };

    // 1. Sincronização periódica da nuvem a cada 60 segundos (foco e BroadcastChannel já atualizam na hora)
    const pollTimer = setInterval(syncInboxCloud, 60000);

    // 2. Sincronização imediata ao focar na janela/aba
    const handleFocus = () => {
      void syncInboxCloud();
    };
    window.addEventListener("focus", handleFocus);

    // 3. Sincronização instantânea (0ms) via BroadcastChannel (entre abas)
    const unsubscribeSync = subscribeToInboxSync((payload) => {
      if (payload.type === "new_message") {
        const counts = updateCounts();
        if (counts.unreadCount > 0 && (!payload.message || isMessageEligibleForPlayer(payload.message, profile))) {
          playNotificationChime();
        }
        previousUnread = counts.unreadCount;
      } else if (payload.type === "message_read" || payload.type === "rewards_claimed") {
        updateCounts();
      }
    });

    // 4. Escuta evento CustomEvent dentro da mesma janela
    const handleNewMessageOnline = (evt: Event) => {
      const counts = updateCounts();
      const customEvt = evt as CustomEvent;
      const msg = customEvt.detail;

      if (counts.unreadCount > 0 && (!msg || isMessageEligibleForPlayer(msg, profile))) {
        playNotificationChime();
      }
      previousUnread = counts.unreadCount;
    };

    window.addEventListener("desafios:inbox-message-received", handleNewMessageOnline);

    return () => {
      clearInterval(pollTimer);
      unsubscribeSync();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("desafios:inbox-message-received", handleNewMessageOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, inboxOpen]);

  async function handleSaveInitialSchoolAndGrade() {
    if (!profile) return;
    setSavingInitialSetup(true);
    setInitialSetupMsg(null);
    const targetSchool =
      profile.school && profile.school !== "Nenhuma" ? profile.school : initialSchool;
    const targetGrade = profile.grade
      ? profile.grade
      : is5thGradeSchool(targetSchool)
        ? "5º ano"
        : schoolNeedsGrade(targetSchool)
          ? initialGrade
          : null;
    const targetTurma = (profile.turma || initialTurma || null) as TurmaCode | null;

    const res = await playfabCompleteInitialSchoolSetup({
      school: targetSchool,
      grade: targetGrade,
      turma: targetTurma,
    });
    setSavingInitialSetup(false);
    if (res.error) {
      setInitialSetupMsg(res.error);
      return;
    }
    setInitialSetupMsg("Vínculo escolar salvo e fixado com sucesso!");
    await auth.refresh();
  }

  async function handleSetInitialTurma(t: TurmaCode) {
    await playfabSetInitialTurma(t);
    void auth.refresh();
  }

  async function handleSubmitTurmaRequest() {
    if (!selectedNewTurma) return;
    await playfabRequestTurmaChange(selectedNewTurma);
    setTurmaMsg(`Solicitação para Turma ${selectedNewTurma} enviada ao Administrador!`);
    void auth.refresh();
    setTimeout(() => {
      setTurmaModalOpen(false);
      setTurmaMsg(null);
    }, 2000);
  }

  return (
    <>
      <div
        className={
          leftSlot
            ? "flex w-full flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-2.5 sm:gap-3"
            : "flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 sm:gap-2"
        }
      >
        {leftSlot && (
          <div className="order-1 sm:order-none flex flex-1 sm:flex-initial items-center gap-2 sm:gap-3 min-w-0">
            {leftSlot}
          </div>
        )}

        <div
          className={
            leftSlot
              ? "order-3 flex w-full items-center justify-around gap-1 rounded-2xl border bg-card/85 px-1.5 py-1 shadow-xs sm:order-none sm:ml-auto sm:w-auto sm:justify-end sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
              : "contents"
          }
        >
          {/* Alternador de Tema (Modo Escuro / Modo Claro) */}
          <ThemeToggle />

          {/* Sound Mute Toggle */}
          <button
            type="button"
            onClick={sound.toggle}
            title={sound.muted ? "Ativar som" : "Silenciar som"}
            aria-label={sound.muted ? "Ativar som" : "Silenciar som"}
            className="grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border bg-card text-foreground shadow-sm transition-all hover:bg-secondary active:scale-95"
          >
            {sound.muted ? (
              <VolumeX className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            )}
          </button>

          {/* Ranking Page Link */}
          <Link
            to="/ranking"
            className="grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border bg-card text-foreground shadow-sm transition-all hover:bg-secondary active:scale-95"
            aria-label="Abrir Ranking"
            title="Ranking da Temporada (Por Etapa, Geral e Torneio)"
          >
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
          </Link>

          {/* Loja de Moedas (Restrita ao ADM / Testes até liberação futura) */}
          {showShopAndCosmetics && profile && (
            <button
              type="button"
              onClick={() => setShopOpen(true)}
              className="grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border border-amber-500/50 bg-gradient-to-br from-amber-500/20 to-yellow-500/10 text-amber-600 dark:text-amber-400 shadow-sm transition-all hover:bg-amber-500/30 active:scale-95 cursor-pointer"
              aria-label="Abrir Loja"
              title={
                auth.adminConfig.rolloutFlags?.enableShopForStudents
                  ? "Loja de Moedas"
                  : "Loja de Moedas (Prévia ADM)"
              }
            >
              <BadgeDollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}

          {/* Central Diária: Recompensa Progressiva + Missões Diárias e Semanais */}
          {showDailyRoutine && (
            <button
              type="button"
              onClick={() => setDailyRewardsOpen(true)}
              className="relative grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-500/5 text-foreground shadow-sm transition-all hover:bg-amber-500/20 active:scale-95 cursor-pointer"
              aria-label="Abrir Recompensas Diárias"
              title={`Central Diária e Missões (Dia ${currentCycleDay} do Ciclo)`}
            >
              <span className="flex items-center justify-center gap-0.5">
                <span className="font-mono text-[10px] sm:text-[11px] font-black text-amber-600 dark:text-amber-400 leading-none">
                  {currentCycleDay}
                </span>
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
              </span>
              {pendingRoutineRewardsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 sm:h-5 sm:min-w-5 px-1 place-items-center rounded-full bg-amber-500 text-[9px] sm:text-[10px] font-black text-zinc-950 shadow-md animate-pulse">
                  {pendingRoutineRewardsCount}
                </span>
              )}
            </button>
          )}

          {/* Caixa de Entrada e Correio do Aluno */}
          {profile && (
            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              className="relative grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border bg-card text-foreground shadow-sm transition-all hover:bg-secondary active:scale-95"
              aria-label="Abrir Caixa de Entrada"
              title="Caixa de Entrada & Correio (Comunicados e Recompensas)"
            >
              <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              {inboxCounts.unclaimedRewardsCount > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 sm:h-5 sm:w-5 place-items-center rounded-full bg-amber-500 text-[9px] sm:text-[10px] font-black text-zinc-950 shadow-md animate-bounce">
                  🎁
                </span>
              ) : inboxCounts.unreadCount > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 sm:h-5 sm:min-w-5 px-1 place-items-center rounded-full bg-primary text-[9px] sm:text-[10px] font-black text-primary-foreground shadow-md animate-pulse">
                  {inboxCounts.unreadCount}
                </span>
              ) : null}
            </button>
          )}

          {/* Admin Panel Button — Only visible when Admin is already logged in */}
          {auth.isAdmin && (
            <Link
              to="/admin"
              className="grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl sm:rounded-2xl border border-primary/50 bg-primary/10 text-primary shadow-sm transition-all hover:bg-primary/20 active:scale-95 cursor-pointer"
              aria-label="Painel do Administrador"
              title="Abrir Painel do Administrador em tela cheia rápida"
            >
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </Link>
          )}
        </div>

        {/* Player Profile / Login Button */}
        {profile && auth.cloudSessionExpired && (
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="order-4 w-full justify-center sm:order-none sm:w-auto inline-flex items-center gap-1.5 rounded-2xl border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs font-extrabold text-amber-700 dark:text-amber-300 shadow-sm transition-all hover:bg-amber-500/25 active:scale-95"
            title="Sua sessão na nuvem expirou (24h). Clique para renovar o login e abrir pacotes/baús."
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Sessão expirada — Renovar login</span>
          </button>
        )}
        {(() => {
          const topEquippedAv =
            profile && showDefaultAvatar
              ? resolveEquippedAvatar(profile, auth.adminConfig.avatarsCatalog)
              : null;
          const topEquippedAura =
            profile && showShopAndCosmetics
              ? resolveEquippedAura(profile, auth.adminConfig.aurasCatalog)
              : null;
          const topAuraPres = getAuraPresentation(topEquippedAura);
          return (
            <button
              type="button"
              onClick={() => (profile ? setProfileOpen(true) : setAuthOpen(true))}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-2xl border bg-card px-2 py-1 sm:px-3 sm:py-1.5 text-left shadow-sm transition-all hover:bg-secondary active:scale-95 ${
                leftSlot ? "order-2 shrink-0 max-w-[46vw] sm:order-none sm:max-w-none" : ""
              } ${topAuraPres.className}`}
              style={topAuraPres.style}
              aria-label={profile ? "Abrir meu perfil" : "Entrar na minha conta"}
            >
              {topEquippedAv ? (
                <span className="relative shrink-0">
                  <PlayerAvatarBadge
                    avatar={topEquippedAv.avatar}
                    secondaryAvatar={topEquippedAv.secondaryAvatar}
                    color={topEquippedAv.color}
                    aura={topEquippedAura}
                    size="sm"
                  />
                  {profile && (
                    <PresenceDot
                      playerId={profile.id}
                      size="sm"
                      className="absolute -bottom-0.5 -right-0.5 z-20"
                    />
                  )}
                </span>
              ) : (
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <User className="h-5 w-5" />
                  {profile && (
                    <PresenceDot
                      playerId={profile.id}
                      size="sm"
                      className="absolute -bottom-0.5 -right-0.5 z-10"
                    />
                  )}
                </span>
              )}
              <span className="min-w-0 pr-1">
                <span className="flex items-center gap-1.5 max-w-[9rem]">
                  <span className="truncate font-display text-sm font-bold leading-tight">
                    {profile ? profile.nick : "Entrar"}
                  </span>
                </span>
                <span className="block text-[11px] leading-tight text-muted-foreground">
                  {profile ? `Nível ${progress?.level} • ${profile.xp} XP` : "criar perfil"}
                </span>
              </span>
            </button>
          );
        })()}
      </div>

      {authOpen && (
        <Suspense fallback={null}>
          <PlayerAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </Suspense>
      )}
      {inboxOpen && (
        <Suspense fallback={null}>
          <PlayerInboxModal open={inboxOpen} onOpenChange={setInboxOpen} />
        </Suspense>
      )}
      {promoCodeOpen && (
        <Suspense fallback={null}>
          <PromoCodeRedeemDialog
            open={promoCodeOpen}
            onOpenChange={setPromoCodeOpen}
            onRewardClaimed={() => {
              auth.refresh();
            }}
          />
        </Suspense>
      )}
      {dailyRewardsOpen && showDailyRoutine && (
        <Suspense fallback={null}>
          <DailyRewardsModal
            open={dailyRewardsOpen}
            onOpenChange={setDailyRewardsOpen}
            profile={profile}
            stats={auth.stats}
            adminConfig={auth.adminConfig}
            onProfileUpdated={() => auth.refresh()}
          />
        </Suspense>
      )}
      {shopOpen && showShopAndCosmetics && (
        <Suspense fallback={null}>
          <ShopModal open={shopOpen} onOpenChange={setShopOpen} />
        </Suspense>
      )}
      {customizeOpen && showShopAndCosmetics && (
        <Suspense fallback={null}>
          <CustomizeProfileModal open={customizeOpen} onOpenChange={setCustomizeOpen} />
        </Suspense>
      )}

      {/* Modal de Perfil do Jogador — Espaçoso, Estável e com Altura Fixa */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="w-[95vw] md:w-[90vw] max-w-4xl h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-3xl border bg-background shadow-2xl">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="font-display text-2xl font-extrabold text-foreground">
              Meu Perfil
            </DialogTitle>
          </DialogHeader>

          {profile && progress && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              {/* Navegação em Abas do Perfil (Estilo Página Inicial) */}
              <div
                role="tablist"
                aria-label="Seções do perfil"
                className={`grid items-center rounded-full border border-border/70 bg-card/70 p-1.5 shadow-2xs backdrop-blur-sm ${
                  showShopAndCosmetics ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === "perfil"}
                  onClick={() => setProfileTab("perfil")}
                  className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                    profileTab === "perfil"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="h-4 w-4" />
                  <span>Perfil</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={profileTab === "medalhas"}
                  onClick={() => setProfileTab("medalhas")}
                  className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                    profileTab === "medalhas"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Award className="h-4 w-4" />
                  <span>Medalhas</span>
                </button>

                {showShopAndCosmetics && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={profileTab === "inventario"}
                    onClick={() => setProfileTab("inventario")}
                    className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                      profileTab === "inventario"
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Backpack className="h-4 w-4" />
                    <span>Inventário</span>
                  </button>
                )}
              </div>

              {profileTab === "perfil" && (() => {
                const equippedAv = showDefaultAvatar
                  ? resolveEquippedAvatar(profile, auth.adminConfig.avatarsCatalog)
                  : null;
                const equippedAura = showShopAndCosmetics
                  ? resolveEquippedAura(profile, auth.adminConfig.aurasCatalog)
                  : null;
                const cardAuraPres = getAuraPresentation(equippedAura);
                const isMaxLevel = progress.level >= MAX_LEVEL;
                const canonicalTournamentPoints = (() => {
                  const rec =
                    getTournamentStoreRecord(profile.id, profile.nick) ||
                    (profile.playfabId ? getTournamentStoreRecord(profile.playfabId, profile.nick) : null) ||
                    (profile.nickNormalized ? getTournamentStoreRecord(profile.nickNormalized, profile.nickNormalized) : null);
                  return resolveCanonicalTournamentPoints({
                    level: profile.level,
                    isAdmin: profile.isAdmin,
                    tournamentPoints: profile.tournamentPoints,
                    bestTournamentPoints: profile.bestTournamentPoints,
                    record: rec,
                  });
                })();
                return (
                <div className="space-y-4">
              {/* CARTÃO UNIFICADO DO JOGADOR */}
              <div
                className={`relative mt-3 w-full rounded-3xl border-2 bg-card px-4 sm:px-5 pt-6 pb-4 sm:pb-5 shadow-sm space-y-3.5 transition-all ${cardAuraPres.className}`}
                style={cardAuraPres.style}
              >
                    {/* Pílula Superior Centralizada sobre a Borda: NVL X (com Aura + Foil no Nível 10) */}
                    <div
                      className={`absolute -top-4 left-1/2 -translate-x-1/2 z-20 inline-flex items-center justify-center rounded-full border-2 border-primary/60 bg-card px-4 sm:px-5 py-1 shadow-md ${cardAuraPres.className}`}
                      style={cardAuraPres.style}
                      title={`Nível ${progress.level} — ${progress.title}`}
                    >
                      {isMaxLevel && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                        >
                          <div className="card-foil-gradient absolute inset-0 opacity-85" />
                          <div className="card-foil-shimmer absolute inset-y-0 w-1/2 opacity-80" />
                        </div>
                      )}
                      <span className="relative z-10 font-display text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
                        NVL {progress.level}
                      </span>
                    </div>

                    {/* Topo: Avatar à esquerda, Dados Pessoais no centro e Rank da Ranqueada ampliado à direita */}
                    <div className="flex flex-row items-center gap-3 sm:gap-4">
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        {showDefaultAvatar && equippedAv ? (
                          <PlayerAvatarBadge
                            avatar={equippedAv.avatar}
                            secondaryAvatar={equippedAv.secondaryAvatar}
                            color={equippedAv.color}
                            aura={equippedAura}
                            size="lg"
                          />
                        ) : (
                          <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-2xl border-2 border-primary/40 bg-primary/10 text-primary shadow-sm">
                            <User className="h-8 w-8 sm:h-10 sm:w-10" />
                          </div>
                        )}
                        {showShopAndCosmetics && (
                          <button
                            type="button"
                            onClick={() => setCustomizeOpen(true)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[9.5px] font-extrabold text-primary transition-all cursor-pointer"
                            title="Personalizar Avatar e Aura do Perfil"
                          >
                            <Palette className="h-2.5 w-2.5" /> Personalizar
                          </button>
                        )}
                      </div>

                      {/* Informações Pessoais ao Centro */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <h2 className="truncate font-display text-lg sm:text-2xl font-black text-foreground">
                            {profile.nick}
                          </h2>
                          <PresenceDot playerId={profile.id} size="sm" />
                          {profile.turma && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-primary shrink-0">
                              <Lock className="h-2.5 w-2.5" /> Turma {profile.turma}
                            </span>
                          )}
                        </div>

                        <p className="truncate text-[11px] sm:text-xs font-semibold uppercase text-muted-foreground">
                          {profile.full_name}
                        </p>

                        <p className="text-[11px] sm:text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                          <span>
                            {profile.school}
                            {profile.grade ? ` • ${profile.grade}` : ""}
                            {stageInfo ? ` • ${stageInfo.shortLabel}` : ""}
                          </span>
                          {profile.school && profile.school !== "Nenhuma" && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground" title="Escola e série fixadas no perfil. Somente o ADM pode alterar.">
                              <Lock className="h-2 w-2" /> Fixado
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Ícone da Ranqueada Ampliado à Direita (com Nome e Pontuação embaixo) */}
                      <div className="shrink-0 flex flex-col items-center justify-center pl-1">
                        <TournamentRankBadge
                          points={canonicalTournamentPoints}
                          size="lg"
                          layout="vertical"
                          showLabel
                          showPoints
                        />
                      </div>
                    </div>

                    {/* Badges de Informações Compactas */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                      <span
                        title="Total de medalhas e troféus desbloqueados em partidas, níveis e desafios."
                        className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-extrabold text-amber-500 dark:text-amber-400"
                      >
                        🏅 {profile.unlockedMedals?.length ?? 0} Medalhas
                      </span>

                      <span
                        title="Pontuação acumulada em partidas, medalhas e desafios."
                        className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-extrabold text-amber-600 dark:text-amber-400"
                      >
                        ⭐ {profile.careerPoints ?? profile.pointsBalance ?? 0} Pontos
                      </span>

                      {showCoinsWallet &&
                        (showShopAndCosmetics ? (
                          <button
                            type="button"
                            onClick={() => setShopOpen(true)}
                            title="Saldo de Moedas para usar na Loja"
                            className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/40 px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-extrabold text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/25 transition-colors cursor-pointer"
                          >
                            <Coins className="h-3 w-3" /> {profile.coins ?? 0} Moedas
                          </button>
                        ) : (
                          <span
                            title="Seu saldo acumulado de Moedas (a Loja será liberada em breve!)"
                            className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/40 px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-extrabold text-yellow-600 dark:text-yellow-400"
                          >
                            <Coins className="h-3 w-3" /> {profile.coins ?? 0} Moedas
                          </span>
                        ))}

                      <span
                        title="Sua colocação oficial na temporada atual do Torneio Semanal da sua Etapa."
                        className="inline-flex items-center rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-extrabold text-primary"
                      >
                        🏆 {playerRank ? `#${playerRank} no Ranking` : "Sem colocação"}
                      </span>
                    </div>

                    {/* Aviso de solicitação de turma pendente */}
                    {profile.pendingTurmaRequest && (
                      <p className="text-[10px] sm:text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        ⏳ Solicitação para mudar para a <b>Turma {profile.pendingTurmaRequest}</b> enviada ao Administrador.
                      </p>
                    )}

                    {/* Divisória Interna Elegante para a Seção de Nível e Requisitos */}
                    <div className="border-t border-border/60 pt-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                        <span className="flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
                          Nível {progress.level}/{MAX_LEVEL} — {progress.title}
                        </span>
                        <span className="text-primary font-mono font-black">{profile.xp} XP</span>
                      </div>

                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
                        <span>
                          {progress.current}/{progress.needed} XP na faixa atual
                        </span>
                        <button
                          type="button"
                          onClick={() => setLevelExpanded(!levelExpanded)}
                          className="inline-flex items-center gap-1 font-display font-extrabold text-primary hover:underline"
                        >
                          {levelExpanded ? (
                            <>
                              Ocultar Detalhes Diários & X1 <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              Ver Detalhes Diários & X1 <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>

                      {/* Conteúdo Expansível do Nível */}
                      {levelExpanded && (
                        <div className="mt-3 space-y-3 border-t pt-3 animate-in fade-in-50 duration-200">
                          {/* Barra de Limite Diário de XP */}
                          <div className="rounded-2xl border bg-secondary/30 p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="flex items-center gap-1.5">
                                <Zap className="h-3.5 w-3.5 text-accent" /> XP Diário de Hoje
                                <HelpTip text="Limite diário de XP comum para garantir ritmo saudável de estudos." />
                              </span>
                              <span className={isDailyCapped ? "text-accent" : "text-foreground"}>
                                {dailyXp} / {dailyCap} XP
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isDailyCapped ? "bg-accent" : "bg-success"
                                }`}
                                style={{ width: `${dailyPercent}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {isDailyCapped
                                ? `Limite diário de ${dailyCap} XP atingido hoje. O limite renova amanhã!`
                                : `Você ainda pode ganhar até ${dailyCap - dailyXp} XP hoje.`}
                            </p>

                            {/* Bônus extras diários: Torneio & X1 */}
                            <div className="grid grid-cols-1 gap-1.5 border-t pt-2 text-[11px] sm:grid-cols-2">
                              <div className="rounded-xl bg-background/80 p-2">
                                <div className="font-bold text-primary">
                                  🏆 XP Extra Torneio: {dailyTournamentXp}/{TOURNAMENT_DAILY_EXTRA_XP_CAP} XP
                                </div>
                                <div className="text-muted-foreground">
                                  Entradas hoje: <b>{dailyTournamentEntries}/{TOURNAMENT_DAILY_ENTRIES_LIMIT}</b>
                                </div>
                              </div>
                              <div className="rounded-xl bg-background/80 p-2">
                                <div className="font-bold text-accent">
                                  ⚔️ XP Extra Arena X1: {dailyX1Xp}/{X1_DAILY_EXTRA_XP_CAP} XP
                                </div>
                                <div className="text-muted-foreground">
                                  Partidas ilimitadas (Nível 5+)
                                </div>
                              </div>
                            </div>

                            {/* Histórico Pessoal na Arena X1 (Privado do Aluno) */}
                            <div className="rounded-2xl border bg-background/90 p-3 space-y-2 mt-2">
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span className="flex items-center gap-1.5 font-display text-accent uppercase tracking-wider">
                                  <Swords className="h-3.5 w-3.5" /> Meu Histórico na Arena X1
                                </span>
                                <span className="text-[11px] text-muted-foreground font-semibold">
                                  {(profile.x1Matches ?? (profile.x1Wins ?? 0))} partidas disputadas
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2">
                                  <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-base">
                                    {profile.x1Wins ?? 0}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-semibold">Vitórias</div>
                                </div>
                                <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-2">
                                  <div className="font-extrabold text-destructive text-base">
                                    {profile.x1Losses ?? 0}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-semibold">Derrotas</div>
                                </div>
                                <div className="rounded-xl bg-secondary/70 border p-2">
                                  <div className="font-extrabold text-foreground text-base">
                                    {profile.x1Draws ?? 0}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-semibold">Empates</div>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground text-center italic">
                                🔒 Seu histórico de vitórias/derrotas é privado e visível apenas para você.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Requisitos para o Próximo Nível (Sempre visível para o próprio jogador) */}
                      {!progress.isMaxLevel && progress.nextRequirement && (
                        <div className="rounded-2xl border bg-background p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wider text-primary">
                              <Lock className="h-3.5 w-3.5" /> Requisitos para o Nível{" "}
                              {progress.nextRequirement.level} ({progress.nextRequirement.emoji}{" "}
                              {progress.nextRequirement.title})
                            </span>
                          </div>

                          {progress.isLockedByMissions && (
                            <div className="rounded-xl bg-accent/15 px-2.5 py-1.5 text-[11px] font-semibold text-foreground">
                              🔒 Você já tem o XP necessário! Conclua os requisitos pendentes abaixo para
                              destravar o Nível {progress.nextRequirement.level}.
                            </div>
                          )}

                          <ul className="space-y-1.5 text-xs">
                            {progress.checklist.map((item) => (
                              <li
                                key={item.key}
                                className="flex items-center justify-between gap-2 rounded-xl bg-secondary/40 px-2.5 py-1.5"
                              >
                                <span className="flex items-center gap-1.5 font-medium">
                                  {item.met ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                                  ) : (
                                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  {item.label}
                                </span>
                                <span
                                  className={`font-display font-bold ${
                                    item.met ? "text-success" : "text-muted-foreground"
                                  }`}
                                >
                                  {item.current} / {item.required}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Botão de Resgate de Código Promocional (Closed Beta: Zheret, Lord, ADM) */}
                    {canAccessPromoCodeRedeem(profile) && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          setPromoCodeOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border-2 border-fuchsia-500/40 py-3 px-4 font-display text-xs font-black text-fuchsia-600 dark:text-fuchsia-400 transition-all active:scale-95 shadow-xs cursor-pointer"
                      >
                        <Ticket className="h-4 w-4 text-fuchsia-500" />
                        <span>Resgatar Código Promocional</span>
                        <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[9px] uppercase tracking-wider font-black">
                          Closed Beta
                        </span>
                      </button>
                    )}
              </div>

              {/* Painel de Seleção Única de Escola, Série e Turma (Disponível APENAS se o jogador não selecionou na criação) */}
              {(() => {
                const isOver15 = stageInfo?.id === "etapa_3";
                if (isOver15) return null;

                const schoolNotSelected = !profile.school || profile.school === "Nenhuma" || profile.school === "Outro";
                const effectiveSchool = schoolNotSelected ? initialSchool : profile.school;
                const needsGradeSelection =
                  !profile.grade && schoolNeedsGrade(effectiveSchool);
                const needsTurmaSelection =
                  !profile.turma && isOfficialSemedSchool(effectiveSchool);

                const hasUnselectedFields =
                  schoolNotSelected || needsGradeSelection || needsTurmaSelection;

                if (!hasUnselectedFields) return null;

                const availableSchoolsForStudent = SCHOOLS.filter((s) => {
                  if (s.name === "Nenhuma") return false;
                  if (stageInfo?.id === "etapa_2") return !is5thGradeSchool(s.name);
                  if (stageInfo?.id === "etapa_1") return !isSecondStageSchool(s.name);
                  return s.name === "Outro";
                });

                return (
                  <div className="rounded-3xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display text-sm font-extrabold text-primary">
                        <School className="h-4 w-4" />
                        <span>Completar Vínculo Escolar (Seleção Única)</span>
                      </div>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Após confirmar, a escola e a série ficam fixas (somente o ADM poderá alterar)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 1. Seleção de Escola (Disponível apenas se ainda estiver como "Nenhuma") */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                          Instituição (Escola):
                          {!schoolNotSelected && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </label>
                        {schoolNotSelected ? (
                          <select
                            value={initialSchool}
                            onChange={(e) => {
                              const nextS = e.target.value;
                              setInitialSchool(nextS);
                              if (is5thGradeSchool(nextS)) {
                                setInitialGrade("5º ano");
                              } else if (schoolNeedsGrade(nextS)) {
                                setInitialGrade(RAIMUNDO_GRADES[0]);
                              }
                            }}
                            className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                          >
                            <option value="Nenhuma">Selecione sua escola...</option>
                            {availableSchoolsForStudent.map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                            🔒 {profile.school} (Já fixada)
                          </div>
                        )}
                      </div>

                      {/* 2. Seleção de Série / Ano (Disponível apenas se ainda não selecionada) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                          Série / Ano:
                          {Boolean(profile.grade) && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </label>
                        {profile.grade ? (
                          <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                            🔒 {profile.grade} (Já fixada)
                          </div>
                        ) : is5thGradeSchool(effectiveSchool) ? (
                          <div className="h-9 flex items-center rounded-xl border bg-primary/10 px-3 text-xs font-extrabold text-primary">
                            5º ano (Automático)
                          </div>
                        ) : schoolNeedsGrade(effectiveSchool) ? (
                          <select
                            value={initialGrade}
                            onChange={(e) => setInitialGrade(e.target.value)}
                            className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                          >
                            {RAIMUNDO_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="h-9 flex items-center rounded-xl border bg-muted/40 px-3 text-xs text-muted-foreground">
                            Selecione a escola primeiro
                          </div>
                        )}
                      </div>

                      {/* 3. Seleção de Turma (Disponível apenas se ainda não selecionada) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                          Turma (A até F):
                          {Boolean(profile.turma) && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </label>
                        {profile.turma ? (
                          <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                            🔒 Turma {profile.turma} (Já fixada)
                          </div>
                        ) : isOfficialSemedSchool(effectiveSchool) ? (
                          <select
                            value={initialTurma}
                            onChange={(e) => setInitialTurma(e.target.value)}
                            className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                          >
                            <option value="">Selecione a turma...</option>
                            {VALID_TURMAS.map((t) => (
                              <option key={t} value={t}>
                                Turma {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="h-9 flex items-center rounded-xl border bg-muted/40 px-3 text-xs text-muted-foreground">
                            Não se aplica
                          </div>
                        )}
                      </div>
                    </div>

                    {initialSetupMsg && (
                      <p className="text-xs font-bold text-primary">{initialSetupMsg}</p>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          savingInitialSetup ||
                          (schoolNotSelected && initialSchool === "Nenhuma")
                        }
                        onClick={() => void handleSaveInitialSchoolAndGrade()}
                        className="rounded-xl text-xs font-extrabold"
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Confirmar e Fixar Escola / Série
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* LISTA DE JOGOS & PARTIDAS JOGADAS (Sempre expandida) */}
              <div className="rounded-3xl border bg-card p-4 space-y-3 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                    <Gamepad2 className="h-5 w-5 text-primary" />
                    <span>Partidas por Jogo</span>
                    <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-xs font-bold text-primary">
                      {matchesCount} partida{matchesCount === 1 ? "" : "s"} no total
                    </span>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_GAME_IDS.map((gId) => {
                      const gName = GAME_NAMES[gId];
                      const statRow = statsByGameMap.get(gId);
                      const plays = statRow ? statRow.plays : 0;
                      const bestScore = statRow ? statRow.best_score : 0;
                      const bestLevel = statRow ? statRow.best_level : 1;
                      const isEnabled = auth.adminConfig.enabledGames[gId] !== false;
                      const events = [...loadSpecialEvents(), ...loadRecurringEvents()];
                      const gameMedalProg = getGameMedalsProgress(
                        gId,
                        profile.unlockedMedals ?? [],
                        auth.adminConfig.customMedals,
                        events,
                      );

                      return (
                        <div
                          key={gId}
                          className={`flex items-center justify-between gap-2 rounded-2xl border p-2.5 transition-all ${
                            plays > 0
                              ? "bg-card border-primary/30"
                              : "bg-muted/30 border-dashed opacity-75"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-display text-xs font-black truncate text-foreground flex items-center gap-1.5">
                              <span>{gName}</span>
                              {!isEnabled && (
                                <span className="rounded bg-muted px-1 text-[9px] font-bold text-muted-foreground">
                                  Oculto
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {bestScore > 0 ? (
                                <span>Recorde: {bestScore} pts • Nv. {bestLevel}</span>
                              ) : (
                                <span>Nenhuma partida registrada</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              title={`${gameMedalProg.earned} de ${gameMedalProg.total} medalhas conquistadas neste jogo`}
                              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-black transition-colors ${
                                getMedalProgressStyle(gameMedalProg.earned, gameMedalProg.total).pillClass
                              }`}
                            >
                              <Award className="h-3 w-3" />
                              {gameMedalProg.earned}/{gameMedalProg.total}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black ${
                                plays > 0
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Gamepad2 className="h-3 w-3" />
                              {plays} partida{plays === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botão de Logout */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full rounded-2xl py-2.5 font-display text-xs font-bold"
                  onClick={async () => {
                    await auth.signOut();
                    setProfileOpen(false);
                    onConfigChanged?.();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sair da conta
                </Button>
              </div>
                </div>
                );
              })()}

              {/* ABA 2: MEDALHAS (Vitrine fixa de 6 + Catálogo Geral & Eventos) */}
              {profileTab === "medalhas" && (
                <Suspense
                  fallback={
                    <div className="py-10 text-center text-xs font-semibold text-muted-foreground">
                      Carregando medalhas...
                    </div>
                  }
                >
                  <PlayerMedalsInventory
                    unlockedMedals={profile.unlockedMedals}
                    customMedals={auth.adminConfig.customMedals}
                    profile={profile}
                    stats={auth.stats}
                    isOwner={true}
                    alwaysShowShowcase={true}
                  />
                </Suspense>
              )}

              {/* ABA 3: INVENTÁRIO (Oculta para alunos comuns, visível apenas para ADM / Testes no próprio perfil) */}
              {profileTab === "inventario" && showShopAndCosmetics && (
                <Suspense
                  fallback={
                    <div className="py-10 text-center text-xs font-semibold text-muted-foreground">
                      Carregando inventário...
                    </div>
                  }
                >
                  <PlayerItemsInventory />
                </Suspense>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Solicitação de Troca de Turma para o ADM */}
      <Dialog open={turmaModalOpen} onOpenChange={setTurmaModalOpen}>
        <DialogContent className="w-[90vw] max-w-sm rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Solicitar Troca de Turma
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Sua turma atual é <b>Turma {profile?.turma || "Não definida"}</b>. Escolha a nova turma
              desejada. A solicitação será enviada para aprovação do Administrador/Professor.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="new-turma" className="text-xs font-bold text-foreground">
                Nova Turma Desejada
              </label>
              <select
                id="new-turma"
                value={selectedNewTurma}
                onChange={(e) => setSelectedNewTurma(e.target.value as TurmaCode)}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm font-bold"
              >
                {VALID_TURMAS.map((t) => (
                  <option key={t} value={t}>
                    Turma {t}
                  </option>
                ))}
              </select>
            </div>

            {turmaMsg && (
              <div className="rounded-xl bg-success/15 p-2 text-center text-xs font-bold text-success">
                {turmaMsg}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl text-xs"
                onClick={() => setTurmaModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl text-xs font-bold"
                onClick={() => void handleSubmitTurmaRequest()}
              >
                <Send className="mr-1 h-3.5 w-3.5" /> Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
