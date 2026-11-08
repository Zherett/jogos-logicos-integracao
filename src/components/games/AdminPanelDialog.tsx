import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Gamepad2,
  KeyRound,
  CalendarClock,
  RotateCcw,
  Save,
  Copy,
  Check,
  Sparkles,
  Cloud,
  Users,
  Lock,
  Unlock,
  Trash2,
  Award,
  Compass,
  Mail,
  Plus,
  Zap,
  Clock,
  School,
  Flame,
  Swords,
  UserCheck,
  ChevronRight,
  Calendar,
  RefreshCw,
  Trophy,
  Pause,
  Play,
  Eye,
  EyeOff,
  Pencil,
  FastForward,
  Coins,
  AlertTriangle,
  Info,
  Beaker,
  CheckCircle2,
} from "lucide-react";
import {
  computeSeasonDates,
  extendSeasonDate,
  getSeasonProgress,
  toDatetimeLocalString,
  parseDatetimeLocal,
  SEASON_DURATION_PRESETS,
} from "@/lib/season-cycle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import {
  DEFAULT_ENABLED_GAMES,
  DEFAULT_GAME_CODES,
  DEFAULT_MASTER_CODE,
  DEFAULT_GAME_LEVEL_REQUIREMENTS,
  DEFAULT_ADMIN_ONLY_GAMES,
  DEFAULT_ENABLED_DEFAULT_NOTICES,
  SYSTEM_DEFAULT_NOTICES,
  normalizeCode,
  type PlatformAdminConfig,
  type PlatformNoticeSlide,
} from "@/lib/game-codes";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  ageFrom,
  levelProgress,
  stageFromBirthdate,
  SCHOOLS,
  VALID_TURMAS,
  type TurmaCode,
} from "@/lib/player-profile";
import {
  getAllRegisteredPlayers,
  getTrashPlayers,
  moveStudentToTrash,
  restoreStudentFromTrash,
  permanentlyDeleteStudent,
  emptyStudentTrash,
  getLastAdminCloudSyncError,
  getPlayFabTitleId,
  grantPlayerMedalManually,
  isPlayFabConfigured,
  setAdminPin,
  syncStudentRosterFromPlayFab,
  syncAdminMedalNotificationsFromPlayFab,
  playfabApproveTurmaRequest,
  playfabRejectTurmaRequest,
  runRetroactiveMedalsAudit,
  type MedalsAuditResult,
  type PlayerProfile,
} from "@/lib/playfab";
import { getCachedMedalPioneers, formatPioneerLabel } from "@/lib/medal-pioneers";
import {
  loadTurmaRequests,
  type TurmaChangeRequest,
} from "@/lib/player-profile";
import {
  loadSpecialEvents,
  saveSpecialEvents,
  createSpecialEvent,
  formatEventRemainingTime,
  formatDateOnlyBR,
  formatDateTimeBR,
  isEventActive,
  loadRecurringEvents,
  saveRecurringEvents,
  createRecurringEvent,
  isRecurringEventActive,
  DAYS_OF_WEEK,
  getEventLinkedMedalIds,
  formatEventScopeText,
  type SpecialEvent,
  type RecurringEvent,
  type EventBonusType,
  type EventScope,
} from "@/lib/custom-events";
import {
  AVAILABLE_MEDAL_ICONS,
  getAllAvailableMedals,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
  RARITY_INFO,
  formatEventRequirementLabel,
  type MedalDefinition,
  type MedalRarity,
  type EventRequirementType,
  type EventMedalRequirement,
} from "@/lib/medals-catalog";
import {
  getActiveRotatedX1Game,
  loadX1MatchHistory,
  markAllX1MatchesRead,
  clearX1MatchHistory,
  type X1MatchLogEntry,
} from "@/lib/x1-challenge";
import { MedalIcon } from "./MedalIcon";
import { PlayerInspectModal } from "./PlayerInspectModal";
import { PresenceDot } from "./PresenceDot";
import {
  computePresenceSummary,
  PRESENCE_UPDATED_EVENT,
  syncPresenceFromPlayFab,
} from "@/lib/presence";
import { TournamentRankBadge } from "./TournamentRankBadge";
import { AdminInboxTab } from "./AdminInboxTab";
import {
  AGE_STAGES,
  getTournamentRank,
  getWeeklyTournamentSnapshot,
  syncWeeklyTournamentWithPlayFab,
  type AgeStageId,
} from "@/lib/weekly-tournament";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfigSaved?: () => void;
}

type AdminTab = "jogos" | "arena_x1" | "torneio" | "eventos" | "avisos" | "correio" | "medalhas" | "turmas" | "resets" | "sistema" | "lixeira";

function randomGameCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = prefix.slice(0, 1).toUpperCase();
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const EVENT_REQUIREMENT_OPTIONS: {
  type: EventRequirementType;
  label: string;
  unit: string;
  defaultVal: number;
}[] = [
  { type: "event_matches", label: "Partidas Jogadas no Evento", unit: "partida(s)", defaultVal: 5 },
  { type: "event_xp", label: "XP Acumulado no Evento", unit: "XP", defaultVal: 300 },
  { type: "event_score", label: "Pontuação Máxima em uma Partida", unit: "pontos", defaultVal: 50 },
  { type: "event_level", label: "Nível Alcançado no Jogo", unit: "Nível", defaultVal: 3 },
  { type: "event_flawless", label: "Vitória com Zero Erros (Partida Perfeita)", unit: "partida(s) com 0 erros", defaultVal: 1 },
  { type: "event_x1_wins", label: "Gladiador do X1 (Vitórias no Versus Online)", unit: "vitória(s)", defaultVal: 3 },
  { type: "event_combo", label: "Sequência de Acertos (Combo sem Erros)", unit: "acertos seguidos", defaultVal: 10 },
  { type: "event_daily_cap", label: "Constância (Bater Limite Diário de XP)", unit: "dia(s)", defaultVal: 1 },
  { type: "event_team_matches", label: "Espírito de Equipe (Modo Grupos)", unit: "partida(s)", defaultVal: 3 },
  { type: "event_distinct_games", label: "Explorador Multijogos do Evento", unit: "jogos diferentes", defaultVal: 3 },
];

export function AdminPanelDialog({ open, onOpenChange, onConfigSaved }: Props) {
  const auth = usePlayerAuth();
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("jogos");
  const [draft, setDraft] = useState<PlatformAdminConfig>(auth.adminConfig);
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [, setPresenceTick] = useState(0);
  const [tournamentStageFilter, setTournamentStageFilter] = useState<AgeStageId | "TODAS">("TODAS");
  const [syncingTournament, setSyncingTournament] = useState(false);

  // Varredura e retroatribuição de medalhas
  const [isAuditingMedals, setIsAuditingMedals] = useState(false);
  const [auditProgress, setAuditProgress] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<MedalsAuditResult | null>(null);

  const handleRunMedalsAudit = async () => {
    setIsAuditingMedals(true);
    setAuditProgress("Iniciando varredura no banco de dados...");
    try {
      const res = await runRetroactiveMedalsAudit((info) => {
        setAuditProgress(info.message);
      });
      setAuditResult(res);
      await auth.refresh();
      flashSaved(
        `Varredura concluída: ${res.medalsAwardedCount} medalha(s) retroatribuída(s) para ${res.updatedStudentsCount} aluno(s).`,
      );
    } catch (err: any) {
      console.error("Erro na varredura de medalhas:", err);
      flashSaved("Erro ao processar varredura de medalhas.");
    } finally {
      setIsAuditingMedals(false);
      setAuditProgress(null);
    }
  };

  // Special Events states (with 3 simultaneous lines of bonus)
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [editingSpecialEventId, setEditingSpecialEventId] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evScope, setEvScope] = useState<EventScope>("todos");
  const [evBonusType, setEvBonusType] = useState<EventBonusType>("personalizado");
  const [evHasMultiplier, setEvHasMultiplier] = useState(true);
  const [evMultiplier, setEvMultiplier] = useState<number>(2);
  const [evHasMatchCap, setEvHasMatchCap] = useState(false);
  const [evMatchXpCap, setEvMatchXpCap] = useState<number>(30);
  const [evHasDailyCap, setEvHasDailyCap] = useState(false);
  const [evDailyExtraXp, setEvDailyExtraXp] = useState<number>(500);
  const [evHasRankedMultiplier, setEvHasRankedMultiplier] = useState(false);
  const [evRankedMultiplier, setEvRankedMultiplier] = useState<number>(2);
  const [evHasPointsMultiplier, setEvHasPointsMultiplier] = useState(false);
  const [evPointsMultiplier, setEvPointsMultiplier] = useState<number>(2);
  const [evDurationHours, setEvDurationHours] = useState<number>(24);
  const [evLinkedMedalId, setEvLinkedMedalId] = useState<string>("");
  const [evObjective, setEvObjective] = useState<string>("");

  // Event Medals state for punctual events
  const [evAttachedMedals, setEvAttachedMedals] = useState<MedalDefinition[]>([]);
  const [isAddingMedalToEv, setIsAddingMedalToEv] = useState(false);
  const [evMedalMode, setEvMedalMode] = useState<"novo" | "existente">("novo");
  const [evNewMedalTitle, setEvNewMedalTitle] = useState("");
  const [evNewMedalDesc, setEvNewMedalDesc] = useState("");
  const [evNewMedalRarity, setEvNewMedalRarity] = useState<MedalRarity>("ouro");
  const [evNewMedalIcon, setEvNewMedalIcon] = useState("Award");
  const [evNewMedalReqType, setEvNewMedalReqType] = useState<EventRequirementType>("event_matches");
  const [evNewMedalScope, setEvNewMedalScope] = useState<"todos" | GameId>("todos");
  const [evNewMedalThreshold, setEvNewMedalThreshold] = useState<number>(5);
  const [evNewMedalMinScore, setEvNewMedalMinScore] = useState<number>(30);
  const [evNewMedalIsStackable, setEvNewMedalIsStackable] = useState<boolean>(true);
  const [evSelectedExistingMedalId, setEvSelectedExistingMedalId] = useState("");

  // Eventos Sub-Abas: "criacao" e "recorrentes"
  const [eventosSubTab, setEventosSubTab] = useState<"criacao" | "recorrentes">("criacao");
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>([]);
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false);
  const [editingRecurringEventId, setEditingRecurringEventId] = useState<string | null>(null);
  const [recTitle, setRecTitle] = useState("");
  const [recDesc, setRecDesc] = useState("");
  const [recScope, setRecScope] = useState<EventScope>("todos");
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>([6, 0]); // Padrão: Sábado e Domingo
  const [recSpecificDates, setRecSpecificDates] = useState<string[]>([]);
  const [recDateInput, setRecDateInput] = useState("");
  const [recHasMultiplier, setRecHasMultiplier] = useState(true);
  const [recMultiplier, setRecMultiplier] = useState<number>(1.5);
  const [recHasMatchCap, setRecHasMatchCap] = useState(false);
  const [recMatchCap, setRecMatchCap] = useState<number>(30);
  const [recHasDailyCap, setRecHasDailyCap] = useState(false);
  const [recDailyExtraXp, setRecDailyExtraXp] = useState<number>(500);
  const [recHasRankedMultiplier, setRecHasRankedMultiplier] = useState(false);
  const [recRankedMultiplier, setRecRankedMultiplier] = useState<number>(2);
  const [recHasPointsMultiplier, setRecHasPointsMultiplier] = useState(false);
  const [recPointsMultiplier, setRecPointsMultiplier] = useState<number>(2);
  const [recLinkedMedal, setRecLinkedMedal] = useState<string>("");
  const [recObjective, setRecObjective] = useState<string>("");

  // Event Medals state for recurring events
  const [recAttachedMedals, setRecAttachedMedals] = useState<MedalDefinition[]>([]);
  const [isAddingMedalToRec, setIsAddingMedalToRec] = useState(false);
  const [recMedalMode, setRecMedalMode] = useState<"novo" | "existente">("novo");
  const [recNewMedalTitle, setRecNewMedalTitle] = useState("");
  const [recNewMedalDesc, setRecNewMedalDesc] = useState("");
  const [recNewMedalRarity, setRecNewMedalRarity] = useState<MedalRarity>("ouro");
  const [recNewMedalIcon, setRecNewMedalIcon] = useState("Award");
  const [recNewMedalReqType, setRecNewMedalReqType] = useState<EventRequirementType>("event_matches");
  const [recNewMedalScope, setRecNewMedalScope] = useState<"todos" | GameId>("todos");
  const [recNewMedalThreshold, setRecNewMedalThreshold] = useState<number>(5);
  const [recNewMedalMinScore, setRecNewMedalMinScore] = useState<number>(30);
  const [recSelectedExistingMedalId, setRecSelectedExistingMedalId] = useState("");

  // Arena X1 Caixa de Entrada / Histórico e Estados de Edição de Horário
  const [x1History, setX1History] = useState<X1MatchLogEntry[]>([]);
  const [x1OpenInput, setX1OpenInput] = useState<string>(() => String(draft.x1OpenHour ?? 7));
  const [x1CloseInput, setX1CloseInput] = useState<string>(() => String(draft.x1CloseHour ?? 19));

  // Turmas & Escolas states (2 Sub-abas: 1 = Visão por Escolas & Turmas, 2 = Solicitações de Troca)
  const [turmaSubTab, setTurmaSubTab] = useState<"visao" | "solicitacoes">("visao");
  const [selectedAdminSchool, setSelectedAdminSchool] = useState<string>("TODAS");
  const [selectedAdminTurma, setSelectedAdminTurma] = useState<TurmaCode | "TODAS">("TODAS");
  const [registeredStudents, setRegisteredStudents] = useState<PlayerProfile[]>([]);
  const [trashPlayers, setTrashPlayers] = useState<PlayerProfile[]>([]);
  const [turmaRequests, setTurmaRequests] = useState<TurmaChangeRequest[]>([]);

  const refreshRoster = () => {
    setRegisteredStudents(getAllRegisteredPlayers());
    setTrashPlayers(getTrashPlayers());
  };

  // Reset schedule states
  const [scheduleInput, setScheduleInput] = useState("");
  const [scheduleClearXp, setScheduleClearXp] = useState(false);
  const [nextSeasonName, setNextSeasonName] = useState("");
  const [nowClearXp, setNowClearXp] = useState(false);
  const [confirmResetNow, setConfirmResetNow] = useState(false);

  // Season Cycle states (Duração, Início, Fim, Presets e Renovação Automática)
  const [seasonDurationDays, setSeasonDurationDays] = useState<number>(14);
  const [seasonStartInput, setSeasonStartInput] = useState<string>("");
  const [seasonEndInput, setSeasonEndInput] = useState<string>("");
  const [autoRenewSeason, setAutoRenewSeason] = useState<boolean>(true);

  const seasonProgress = useMemo(() => {
    return getSeasonProgress(seasonStartInput, seasonEndInput);
  }, [seasonStartInput, seasonEndInput]);

  // --- ATIVIDADES (GERAL & BETA) STATES ---
  const [activityDurationDays, setActivityDurationDays] = useState<number>(60);
  const [activityStartInput, setActivityStartInput] = useState<string>("");
  const [activityEndInput, setActivityEndInput] = useState<string>("");
  const [activitySeasonName, setActivitySeasonName] = useState<string>("");
  const [confirmBetaResetNow, setConfirmBetaResetNow] = useState<boolean>(false);
  const [confirmActivityResetNow, setConfirmActivityResetNow] = useState<boolean>(false);

  const activitySeasonProgress = useMemo(() => {
    return getSeasonProgress(activityStartInput, activityEndInput);
  }, [activityStartInput, activityEndInput]);

  // --- RANQUEADA (COMPETITIVO) STATES ---
  const [rankedDurationDays, setRankedDurationDays] = useState<number>(14);
  const [rankedStartInput, setRankedStartInput] = useState<string>("");
  const [rankedEndInput, setRankedEndInput] = useState<string>("");
  const [rankedSeasonName, setRankedSeasonName] = useState<string>("");
  const [confirmRankedResetNow, setConfirmRankedResetNow] = useState<boolean>(false);

  const rankedSeasonProgress = useMemo(() => {
    return getSeasonProgress(rankedStartInput, rankedEndInput);
  }, [rankedStartInput, rankedEndInput]);

  // System states
  const [newAdminPin, setNewAdminPin] = useState("");

  // Notice Slides states (Quadro de Avisos)
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeMsg, setNewNoticeMsg] = useState("");
  const [newNoticeBadge, setNewNoticeBadge] = useState("NOVIDADE");
  const [newNoticeType, setNewNoticeType] = useState<"announcement" | "game_highlight" | "event_challenge">("announcement");
  const [newNoticeGame, setNewNoticeGame] = useState<GameId>("rpg");
  const [newNoticeMedal, setNewNoticeMedal] = useState<string>("");
  const [newNoticeDuration, setNewNoticeDuration] = useState<number>(7);

  // Custom Medal Form states
  const [isCreatingMedal, setIsCreatingMedal] = useState(false);
  const [newMedalTitle, setNewMedalTitle] = useState("");
  const [newMedalDesc, setNewMedalDesc] = useState("");
  const [newMedalRarity, setNewMedalRarity] = useState<MedalRarity>("ouro");
  const [newMedalIcon, setNewMedalIcon] = useState("Award");
  const [newMedalMode, setNewMedalMode] = useState<"manual" | "evento">("evento");
  const [newMedalReqType, setNewMedalReqType] = useState<EventRequirementType>("event_matches");
  const [newMedalScope, setNewMedalScope] = useState<"todos" | GameId>("todos");
  const [newMedalThreshold, setNewMedalThreshold] = useState<number>(5);
  const [newMedalIsStackable, setNewMedalIsStackable] = useState<boolean>(true);

  // Manual Grant Modal state
  const [grantMedalTarget, setGrantMedalTarget] = useState<MedalDefinition | null>(null);
  const [selectedStudentForGrant, setSelectedStudentForGrant] = useState<string>("");
  const [inspectStudentId, setInspectStudentId] = useState<string | null>(null);
  const [syncingRoster, setSyncingRoster] = useState(false);

  // Consolidação de partidas jogadas por jogo para a Lista de Jogos do ADM
  const gameStatsSummary = useMemo(() => {
    const counts: Record<GameId, { totalPlays: number; admPlays: number }> = {} as any;
    for (const gId of ALL_GAME_IDS) {
      counts[gId] = { totalPlays: 0, admPlays: 0 };
    }

    // 1. Partidas disputadas pelos alunos cadastrados no sistema
    for (const st of registeredStudents) {
      if (Array.isArray(st.stats)) {
        for (const row of st.stats) {
          if (row && row.game_id && counts[row.game_id]) {
            counts[row.game_id].totalPlays += Math.max(0, row.plays ?? 0);
          }
        }
      }
    }

    // 2. Partidas jogadas pela conta do próprio ADM
    if (Array.isArray(auth.stats)) {
      const admAlreadyInStudents = registeredStudents.some((s) => s.id === auth.profile?.id);
      for (const row of auth.stats) {
        if (row && row.game_id && counts[row.game_id]) {
          const p = Math.max(0, row.plays ?? 0);
          counts[row.game_id].admPlays += p;
          if (!admAlreadyInStudents) {
            counts[row.game_id].totalPlays += p;
          }
        }
      }
    }

    return counts;
  }, [registeredStudents, auth.stats, auth.profile?.id]);

  // Pioneiros de medalhas (primeiro aluno da rede a conquistar cada medalha)
  const pioneersMap = useMemo(() => {
    return getCachedMedalPioneers(registeredStudents);
  }, [registeredStudents]);

  // Identificação de medalhas já atreladas a eventos ativos
  const activeLinkedMedalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ev of specialEvents) {
      if (ev.active) {
        getEventLinkedMedalIds(ev).forEach((id) => ids.add(id));
      }
    }
    for (const ev of recurringEvents) {
      if (ev.active) {
        getEventLinkedMedalIds(ev).forEach((id) => ids.add(id));
      }
    }
    return ids;
  }, [specialEvents, recurringEvents]);

  // Medalhas de eventos disponíveis que não estão atualmente em uso em eventos ativos
  const availableExistingEventMedals = useMemo(() => {
    return getAllAvailableMedals(draft.customMedals).filter(
      (m) =>
        (m.category === "evento" || Boolean(m.eventRequirement)) &&
        !activeLinkedMedalIds.has(m.id)
    );
  }, [draft.customMedals, activeLinkedMedalIds]);

  useEffect(() => {
    if (!open) return;
    setDraft(auth.adminConfig);
    setSpecialEvents(loadSpecialEvents());
    setRecurringEvents(loadRecurringEvents());
    setX1History(loadX1MatchHistory());
    setTurmaRequests(loadTurmaRequests());
    refreshRoster();

    // Automatically sync cloud student roster, presence and medal notifications from PlayFab when opening ADM
    setSyncingRoster(true);
    void syncPresenceFromPlayFab(true);
    void syncStudentRosterFromPlayFab()
      .then(() => refreshRoster())
      .finally(() => setSyncingRoster(false));
    void syncAdminMedalNotificationsFromPlayFab().then((notifs) => {
      setDraft((prev) => ({ ...prev, adminMedalNotifications: notifs }));
    });

    const onPresenceChange = () => {
      setPresenceTick((t) => t + 1);
    };
    window.addEventListener(PRESENCE_UPDATED_EVENT, onPresenceChange);
    const presencePoll = window.setInterval(() => {
      void syncPresenceFromPlayFab();
      setPresenceTick((t) => t + 1);
    }, 8000);

    setScheduleClearXp(auth.adminConfig.scheduledResetClearXp);
    setAutoRenewSeason(auth.adminConfig.autoRenewSeason !== false);
    setSeasonDurationDays(auth.adminConfig.seasonDurationDays || 14);
    setX1OpenInput(String(auth.adminConfig.x1OpenHour ?? 7));
    setX1CloseInput(String(auth.adminConfig.x1CloseHour ?? 19));

    // Initialize Activity Season states
    setActivityDurationDays(auth.adminConfig.activitySeasonDurationDays || 60);
    setActivitySeasonName(
      auth.adminConfig.activitySeasonName ||
        (auth.adminConfig.isBetaActive !== false
          ? "Temporada 1 Beta • SEMED Coari"
          : "Temporada 1 de Atividades • SEMED Coari"),
    );
    const actStart = auth.adminConfig.activitySeasonStartAt
      ? new Date(auth.adminConfig.activitySeasonStartAt)
      : new Date("2026-11-01T00:00:00.000Z");
    setActivityStartInput(toDatetimeLocalString(actStart));
    const actEnd = auth.adminConfig.activitySeasonEndAt
      ? new Date(auth.adminConfig.activitySeasonEndAt)
      : new Date("2026-11-15T23:59:59.999Z");
    setActivityEndInput(toDatetimeLocalString(actEnd));

    // Initialize Ranked Season states
    setRankedDurationDays(auth.adminConfig.rankedSeasonDurationDays || 14);
    setRankedSeasonName(
      auth.adminConfig.rankedSeasonName || "Temporada 1 Ranqueada • SEMED Coari",
    );
    const rnkStart = auth.adminConfig.rankedSeasonStartAt
      ? new Date(auth.adminConfig.rankedSeasonStartAt)
      : new Date("2026-11-01T00:00:00.000Z");
    setRankedStartInput(toDatetimeLocalString(rnkStart));
    const rnkEnd = auth.adminConfig.rankedSeasonEndAt
      ? new Date(auth.adminConfig.rankedSeasonEndAt)
      : new Date("2026-11-15T23:59:59.999Z");
    setRankedEndInput(toDatetimeLocalString(rnkEnd));

    const sStart = auth.adminConfig.seasonStartAt
      ? new Date(auth.adminConfig.seasonStartAt)
      : new Date(auth.adminConfig.lastResetAt || Date.now());
    setSeasonStartInput(toDatetimeLocalString(sStart));

    const targetEndStr = auth.adminConfig.seasonEndAt || auth.adminConfig.scheduledResetAt;
    if (targetEndStr) {
      const d = new Date(targetEndStr);
      if (!Number.isNaN(d.getTime())) {
        const localIso = toDatetimeLocalString(d);
        setSeasonEndInput(localIso);
        setScheduleInput(localIso);
      }
    } else {
      const { end } = computeSeasonDates(sStart, auth.adminConfig.seasonDurationDays || 14);
      const localEndIso = toDatetimeLocalString(end);
      setSeasonEndInput(localEndIso);
      setScheduleInput(localEndIso);
    }
    setNextSeasonName(`Temporada ${auth.adminConfig.seasonId + 1} • SEMED Coari`);
    setConfirmResetNow(false);
    setConfirmBetaResetNow(false);
    setConfirmActivityResetNow(false);
    setConfirmRankedResetNow(false);
    setSavedMsg(null);
    return () => {
      window.removeEventListener(PRESENCE_UPDATED_EVENT, onPresenceChange);
      window.clearInterval(presencePoll);
    };
  }, [open, auth.adminConfig]);

  async function handleRefreshRoster() {
    setSyncingRoster(true);
    try {
      await syncPresenceFromPlayFab(true);
      const players = await syncStudentRosterFromPlayFab();
      setRegisteredStudents(players);
      setPresenceTick((t) => t + 1);
      flashSaved(`${players.length} alunos sincronizados com a nuvem!`);
    } finally {
      setSyncingRoster(false);
    }
  }

  function flashSaved(msg: string) {
    setSavedMsg(msg);
    window.setTimeout(() => setSavedMsg(null), 3000);
  }

  /** Mostra sucesso apenas se a configuração foi publicada na nuvem para todos os dispositivos. */
  function flashCloudResult(successMsg: string) {
    const err = getLastAdminCloudSyncError();
    if (err) {
      setSavedMsg(`⚠️ Salvo só neste dispositivo — falha ao publicar para todos: ${err}`);
      window.setTimeout(() => setSavedMsg(null), 7000);
    } else {
      flashSaved(`${successMsg} (publicado para todos os dispositivos)`);
    }
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (auth.unlockAdminWithPin(pinInput)) {
      setPinInput("");
      setPinError(null);
    } else {
      setPinError("Código de administrador incorreto.");
    }
  }

  async function saveGamesAndCodes() {
    await auth.updateAdminConfig(draft);
    onConfigSaved?.();
    flashCloudResult("Jogos e códigos salvos com sucesso!");
  }

  async function handleToggleRequireCodeGate() {
    const nextState = !draft.requireCodeGate;
    const updated: PlatformAdminConfig = { ...draft, requireCodeGate: nextState };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      nextState
        ? `🔒 Jogos travados com código Master (${draft.masterCode || "SEMED26"})!`
        : "🔓 Jogos liberados para todos sem necessidade de código!",
    );
  }

  async function handleToggleGame(id: GameId, nextVal: boolean) {
    const updated: PlatformAdminConfig = {
      ...draft,
      enabledGames: { ...draft.enabledGames, [id]: nextVal },
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      nextVal
        ? `✅ "${GAME_NAMES[id]}" ativado e visível na página inicial!`
        : `🚫 "${GAME_NAMES[id]}" desmarcado e ocultado da página inicial!`,
    );
  }

  async function handleToggleAdminOnly(id: GameId, nextVal: boolean) {
    const updated: PlatformAdminConfig = {
      ...draft,
      adminOnlyGames: { ...(draft.adminOnlyGames ?? {}), [id]: nextVal },
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      nextVal
        ? `🧪 "${GAME_NAMES[id]}" restrito apenas para o Administrador (Modo de Testes)!`
        : `🌍 "${GAME_NAMES[id]}" liberado para todos os alunos!`,
    );
  }

  async function handleSetGameLevel(id: GameId, nextLevel: number) {
    const clamped = Math.max(1, Math.min(10, nextLevel));
    const updated: PlatformAdminConfig = {
      ...draft,
      gameLevelRequirements: {
        ...(draft.gameLevelRequirements ?? {}),
        [id]: clamped,
      },
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(`⭐ Nível exigido para "${GAME_NAMES[id]}": Nível ${clamped}+!`);
  }

  async function handleToggleX1Game(id: GameId) {
    const cur = (draft.x1AvailableGames && draft.x1AvailableGames.length > 0)
      ? draft.x1AvailableGames
      : ["rpg", "logica", "porcentagem", "minado"];
    const isSelected = cur.includes(id);
    let nextGames: GameId[];
    if (isSelected) {
      if (cur.length <= 1) {
        flashSaved("⚠️ Selecione pelo menos 1 jogo para a Arena X1.");
        return;
      }
      nextGames = cur.filter((g) => g !== id);
    } else {
      nextGames = [...cur, id];
    }
    const updated: PlatformAdminConfig = {
      ...draft,
      x1AvailableGames: nextGames,
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      isSelected
        ? `🚫 "${GAME_NAMES[id]}" desmarcado da Arena X1!`
        : `⚔️ "${GAME_NAMES[id]}" ativado na Arena X1!`,
    );
  }

  async function handleSaveX1Hour(which: "open" | "close", valStr: string) {
    let num = parseInt(valStr, 10);
    if (Number.isNaN(num)) {
      num = which === "open" ? (draft.x1OpenHour ?? 7) : (draft.x1CloseHour ?? 19);
    }
    if (which === "open") {
      num = Math.max(0, Math.min(23, num));
      setX1OpenInput(String(num));
      const updated: PlatformAdminConfig = { ...draft, x1OpenHour: num };
      setDraft(updated);
      await auth.updateAdminConfig(updated);
      onConfigSaved?.();
      flashCloudResult(`⏰ Horário de abertura da Arena X1 salvo: ${String(num).padStart(2, "0")}:00h!`);
    } else {
      num = Math.max(1, Math.min(24, num));
      setX1CloseInput(String(num));
      const updated: PlatformAdminConfig = { ...draft, x1CloseHour: num };
      setDraft(updated);
      await auth.updateAdminConfig(updated);
      onConfigSaved?.();
      flashCloudResult(`⏰ Horário de fechamento da Arena X1 salvo: ${String(num).padStart(2, "0")}:00h!`);
    }
  }

  async function handleToggleX1ForceOpen(val: boolean) {
    const updated: PlatformAdminConfig = { ...draft, x1ForceOpen: val };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      val
        ? "🌐 Modo 24 Horas ativado no X1 (sem restrição de horário)!"
        : "⏰ Horário restrito ativado no X1!",
    );
  }

  async function handleToggleX1Enabled(val: boolean) {
    const updated: PlatformAdminConfig = { ...draft, x1Enabled: val };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    onConfigSaved?.();
    flashCloudResult(
      val
        ? "⚔️ Arena X1 Online ativada para alunos nível 5+!"
        : "🔒 Arena X1 Online desativada temporariamente!",
    );
  }

  async function restoreDefaultCodes() {
    const restored: PlatformAdminConfig = {
      ...draft,
      enabledGames: { ...DEFAULT_ENABLED_GAMES },
      gameCodes: { ...DEFAULT_GAME_CODES },
      gameLevelRequirements: { ...DEFAULT_GAME_LEVEL_REQUIREMENTS },
      adminOnlyGames: { ...DEFAULT_ADMIN_ONLY_GAMES },
      masterCode: DEFAULT_MASTER_CODE,
    };
    setDraft(restored);
    await auth.updateAdminConfig(restored);
    onConfigSaved?.();
    flashCloudResult("Códigos e jogos restaurados para o padrão com sucesso!");
  }

  async function copyCodesList() {
    const lines = ALL_GAME_IDS.filter((id) => draft.enabledGames[id]).map(
      (id) => `• ${GAME_NAMES[id]}: ${draft.gameCodes[id]}`,
    );
    const text = [
      "🔑 CÓDIGOS DOS JOGOS — DESAFIOS DE LÓGICA (SEMED)",
      ...lines,
      `⭐ Código Mestre (Professor): ${draft.masterCode}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const handleSelectPreset = (days: number) => {
    setSeasonDurationDays(days);
    const baseStart = parseDatetimeLocal(seasonStartInput) || new Date();
    const { start, end } = computeSeasonDates(baseStart, days);
    const startStr = toDatetimeLocalString(start);
    const endStr = toDatetimeLocalString(end);
    setSeasonStartInput(startStr);
    setSeasonEndInput(endStr);
    setScheduleInput(endStr);
  };

  const handleExtendSeason = (additionalDays: number) => {
    const currentEnd = parseDatetimeLocal(seasonEndInput) || new Date();
    const newEnd = extendSeasonDate(currentEnd, additionalDays);
    const newEndStr = toDatetimeLocalString(newEnd);
    setSeasonEndInput(newEndStr);
    setScheduleInput(newEndStr);
    const baseStart = parseDatetimeLocal(seasonStartInput) || new Date();
    const totalDays = Math.max(1, Math.round((newEnd.getTime() - baseStart.getTime()) / (24 * 60 * 60 * 1000)));
    setSeasonDurationDays(totalDays);
    flashSaved(`Temporada estendida em +${additionalDays} dias! Próxima temporada empurrada para iniciar após ${newEnd.toLocaleDateString("pt-BR")}.`);
  };

  const handleSaveSeasonConfig = async () => {
    const start = parseDatetimeLocal(seasonStartInput) || new Date();
    const end = parseDatetimeLocal(seasonEndInput);

    if (end && end.getTime() <= start.getTime()) {
      flashSaved("A data final da temporada deve ser posterior à data de início.");
      return;
    }

    const updated: PlatformAdminConfig = {
      ...draft,
      seasonName: draft.seasonName.trim() || `Temporada ${draft.seasonId} • SEMED Coari`,
      seasonStartAt: start.toISOString(),
      seasonEndAt: end ? end.toISOString() : null,
      scheduledResetAt: end ? end.toISOString() : null,
      seasonDurationDays,
      autoRenewSeason,
      scheduledResetClearXp: scheduleClearXp,
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    flashSaved(
      end
        ? `Configuração da Temporada salva! Término em ${end.toLocaleDateString("pt-BR")} às ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
        : "Configuração de ciclo contínuo salva com sucesso!"
    );
  };

  async function cancelScheduledReset() {
    setScheduleInput("");
    setSeasonEndInput("");
    const updated: PlatformAdminConfig = {
      ...draft,
      seasonEndAt: null,
      scheduledResetAt: null,
      scheduledResetClearXp: false,
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    flashSaved("Agendamento de encerramento cancelado.");
  }

  async function executeImmediateReset() {
    await auth.triggerReset({
      clearXp: nowClearXp,
      newSeasonName: nextSeasonName,
      reason: "Reset imediato acionado pelo painel ADM",
    });
    setConfirmResetNow(false);
    onConfigSaved?.();
    flashSaved("Ranking resetado e nova temporada iniciada!");
  }

  // --- ATIVIDADES (GERAL & BETA) HANDLERS ---
  const handleSelectActivityPreset = (days: number) => {
    setActivityDurationDays(days);
    const baseStart = parseDatetimeLocal(activityStartInput) || new Date();
    const { start, end } = computeSeasonDates(baseStart, days);
    setActivityStartInput(toDatetimeLocalString(start));
    setActivityEndInput(toDatetimeLocalString(end));
  };

  const handleExtendActivityDays = (additionalDays: number) => {
    const currentEnd = parseDatetimeLocal(activityEndInput) || new Date();
    const newEnd = extendSeasonDate(currentEnd, additionalDays);
    setActivityEndInput(toDatetimeLocalString(newEnd));
    const baseStart = parseDatetimeLocal(activityStartInput) || new Date();
    const totalDays = Math.max(1, Math.round((newEnd.getTime() - baseStart.getTime()) / (24 * 60 * 60 * 1000)));
    setActivityDurationDays(totalDays);
    flashSaved(`Temporada de Atividades estendida em +${additionalDays} dias!`);
  };

  const saveActivitySeasonSettings = async () => {
    const start = parseDatetimeLocal(activityStartInput) || new Date();
    const end = parseDatetimeLocal(activityEndInput);
    const updated: PlatformAdminConfig = {
      ...draft,
      activitySeasonName: activitySeasonName.trim() || draft.activitySeasonName,
      activitySeasonStartAt: start.toISOString(),
      activitySeasonEndAt: end ? end.toISOString() : null,
      activitySeasonDurationDays: activityDurationDays,
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    flashSaved("Configurações da Temporada de Atividades salvas com sucesso!");
  };

  const executeBetaResetAction = async () => {
    await auth.triggerActivitySeasonReset({
      isBetaEnd: true,
      newSeasonName: `Temporada ${(draft.activitySeasonId ?? 1) + 1} de Atividades • SEMED Coari`,
      reason: "Encerramento oficial da fase Beta pelo Administrador",
    });
    setConfirmBetaResetNow(false);
    onConfigSaved?.();
    flashSaved("Fase Beta finalizada com sucesso! 120 medalhas revogadas, 25 preservadas e pontos convertidos em moedas!");
  };

  const executeRegularActivityResetAction = async () => {
    await auth.triggerActivitySeasonReset({
      isBetaEnd: false,
      newSeasonName: `Temporada ${(draft.activitySeasonId ?? 1) + 1} de Atividades • SEMED Coari`,
      reason: "Reset regular da Temporada de Atividades pelo Administrador",
    });
    setConfirmActivityResetNow(false);
    onConfigSaved?.();
    flashSaved("Nova Temporada de Atividades iniciada! Nível reiniciado e pontos convertidos em moedas.");
  };

  // --- RANQUEADA HANDLERS ---
  const handleSelectRankedPreset = (days: number) => {
    setRankedDurationDays(days);
    const baseStart = parseDatetimeLocal(rankedStartInput) || new Date();
    const { start, end } = computeSeasonDates(baseStart, days);
    setRankedStartInput(toDatetimeLocalString(start));
    setRankedEndInput(toDatetimeLocalString(end));
  };

  const handleExtendRankedDays = (additionalDays: number) => {
    const currentEnd = parseDatetimeLocal(rankedEndInput) || new Date();
    const newEnd = extendSeasonDate(currentEnd, additionalDays);
    setRankedEndInput(toDatetimeLocalString(newEnd));
    const baseStart = parseDatetimeLocal(rankedStartInput) || new Date();
    const totalDays = Math.max(1, Math.round((newEnd.getTime() - baseStart.getTime()) / (24 * 60 * 60 * 1000)));
    setRankedDurationDays(totalDays);
    flashSaved(`Temporada de Ranqueada estendida em +${additionalDays} dias!`);
  };

  const saveRankedSeasonSettings = async () => {
    const start = parseDatetimeLocal(rankedStartInput) || new Date();
    const end = parseDatetimeLocal(rankedEndInput);
    const updated: PlatformAdminConfig = {
      ...draft,
      rankedSeasonName: rankedSeasonName.trim() || draft.rankedSeasonName,
      rankedSeasonStartAt: start.toISOString(),
      rankedSeasonEndAt: end ? end.toISOString() : null,
      rankedSeasonDurationDays: rankedDurationDays,
    };
    setDraft(updated);
    await auth.updateAdminConfig(updated);
    flashSaved("Configurações da Temporada de Ranqueada salvas com sucesso!");
  };

  const executeRankedResetAction = async () => {
    await auth.triggerRankedSeasonReset({
      newSeasonName: `Temporada ${(draft.rankedSeasonId ?? 1) + 1} Ranqueada • SEMED Coari`,
      reason: "Reset da Temporada de Ranqueada pelo Administrador",
    });
    setConfirmRankedResetNow(false);
    onConfigSaved?.();
    flashSaved("Temporada de Ranqueada resetada com sucesso! Pontos zerados e medalhas preservadas.");
  };



  async function saveSystemSettings() {
    await auth.updateAdminConfig(draft);
    if (newAdminPin.trim().length >= 4) {
      setAdminPin(newAdminPin.trim());
      setNewAdminPin("");
    }
    onConfigSaved?.();
    flashSaved("Configurações da plataforma atualizadas!");
  }

  function renderActiveBonusesLabel(ev: {
    xpMultiplier?: number;
    matchXpCap?: number;
    dailyXpCap?: number;
    rankedMultiplier?: number;
    bonusType?: string;
    bonusValue?: number;
    linkedMedalIds?: string[];
    linkedMedalId?: string | null;
  }): string {
    const parts: string[] = [];
    if (ev.xpMultiplier && ev.xpMultiplier > 1) {
      parts.push(
        ev.xpMultiplier === 2
          ? "2x XP (Dobro)"
          : `${ev.xpMultiplier}x XP (+${Math.round((ev.xpMultiplier - 1) * 100)}%)`,
      );
    }
    if (ev.rankedMultiplier && ev.rankedMultiplier > 1) {
      parts.push(`${ev.rankedMultiplier}x Pontos Ranqueados`);
    }
    if (ev.pointsMultiplier && ev.pointsMultiplier > 1) {
      parts.push(`${ev.pointsMultiplier}x Pontos de Conquista`);
    }
    if (ev.matchXpCap && ev.matchXpCap > 20) {
      parts.push(`Max ${ev.matchXpCap} XP/partida`);
    }
    if (ev.dailyXpCap && ev.dailyXpCap > 1000) {
      parts.push(`+${ev.dailyXpCap - 1000} XP/dia (${ev.dailyXpCap} total)`);
    } else if (ev.bonusType === "aumentar_limite_diario" && ev.bonusValue && ev.bonusValue > 1000) {
      parts.push(`+${ev.bonusValue - 1000} XP/dia (${ev.bonusValue} total)`);
    }
    if (parts.length === 0) {
      if (ev.bonusType === "dobro_xp") parts.push("2x XP (Dobro)");
      else if (ev.bonusType === "xp_1_5x") parts.push("1.5x XP (+50%)");
      else if ((ev.linkedMedalIds && ev.linkedMedalIds.length > 0) || ev.linkedMedalId) {
        parts.push("Medalha de Evento");
      } else {
        parts.push("Bônus Ativo");
      }
    }
    return parts.join(" • ");
  }

  function handleStartEditSpecialEvent(ev: SpecialEvent) {
    setEditingSpecialEventId(ev.id);
    setEvTitle(ev.title);
    setEvDesc(ev.description || "");
    setEvScope(ev.scope);
    const durationHours =
      Math.max(
        1,
        Math.round((new Date(ev.endsAt).getTime() - new Date(ev.startsAt).getTime()) / (3600 * 1000))
      ) || 24;
    setEvDurationHours(durationHours);
    setEvHasMultiplier(Boolean(ev.xpMultiplier && ev.xpMultiplier > 1));
    setEvMultiplier(ev.xpMultiplier || 2);
    setEvHasMatchCap(Boolean(ev.matchXpCap && ev.matchXpCap > 20));
    setEvMatchXpCap(ev.matchXpCap || 30);
    setEvHasDailyCap(Boolean(ev.dailyXpCap && ev.dailyXpCap > 1000));
    setEvDailyExtraXp(ev.dailyXpCap ? Math.max(100, ev.dailyXpCap - 1000) : 500);
    setEvHasRankedMultiplier(Boolean(ev.rankedMultiplier && ev.rankedMultiplier > 1));
    setEvRankedMultiplier(ev.rankedMultiplier || 2);
    setEvHasPointsMultiplier(Boolean(ev.pointsMultiplier && ev.pointsMultiplier > 1));
    setEvPointsMultiplier(ev.pointsMultiplier || 2);
    setEvObjective(ev.objectiveDescription || "");
    setEvLinkedMedalId(ev.linkedMedalId || "");
    setIsCreatingEvent(true);
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitle.trim()) {
      flashSaved("Informe o título do evento.");
      return;
    }
    const hasAnyBonus = evHasMultiplier || evHasMatchCap || evHasDailyCap || evHasRankedMultiplier || evHasPointsMultiplier;
    const hasAnyMedal = evAttachedMedals.length > 0 || Boolean(evLinkedMedalId);
    if (!hasAnyBonus && !hasAnyMedal) {
      flashSaved("Marque pelo menos uma caixa de bônus ou vincule uma medalha ao evento.");
      return;
    }
    const newCustoms = [...(draft.customMedals ?? [])];
    const linkedIds: string[] = [];
    for (const m of evAttachedMedals) {
      if (!newCustoms.some((c) => c.id === m.id)) {
        newCustoms.push(m);
      }
      linkedIds.push(m.id);
    }

    if (editingSpecialEventId) {
      const list = specialEvents.map((existing) => {
        if (existing.id !== editingSpecialEventId) return existing;
        const startsAtTime = new Date(existing.startsAt).getTime();
        const nextEndsAt = new Date(startsAtTime + Number(evDurationHours) * 3600 * 1000).toISOString();
        return {
          ...existing,
          title: evTitle.trim(),
          description: evDesc.trim(),
          scope: evScope,
          bonusType: (evHasDailyCap
            ? "aumentar_limite_diario"
            : evHasMultiplier
              ? evMultiplier === 2
                ? "dobro_xp"
                : "xp_1_5x"
              : "personalizado") as EventBonusType,
          bonusValue: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
          xpMultiplier: evHasMultiplier ? Number(evMultiplier) : undefined,
          rankedMultiplier: evHasRankedMultiplier ? Number(evRankedMultiplier) : undefined,
          pointsMultiplier: evHasPointsMultiplier ? Number(evPointsMultiplier) : undefined,
          matchXpCap: evHasMatchCap ? Number(evMatchXpCap) : undefined,
          dailyXpCap: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
          endsAt: nextEndsAt,
          linkedMedalId: linkedIds[0] ?? (evLinkedMedalId || existing.linkedMedalId || null),
          linkedMedalIds: linkedIds.length > 0 ? linkedIds : existing.linkedMedalIds,
          objectiveDescription: evObjective?.trim() || null,
        };
      });
      setSpecialEvents(list);
      saveSpecialEvents(list);
      setIsCreatingEvent(false);
      setEditingSpecialEventId(null);
      setEvTitle("");
      setEvDesc("");
      setEvObjective("");
      setEvAttachedMedals([]);
      const nextCfg = { ...draft, specialEvents: list, customMedals: newCustoms };
      setDraft(nextCfg);
      await auth.updateAdminConfig(nextCfg);
      flashSaved("✅ Evento especial atualizado com sucesso!");
      onConfigSaved?.();
      return;
    }

    createSpecialEvent({
      title: evTitle,
      description: evDesc,
      scope: evScope,
      bonusType: evHasDailyCap
        ? "aumentar_limite_diario"
        : evHasMultiplier
          ? evMultiplier === 2
            ? "dobro_xp"
            : "xp_1_5x"
          : "personalizado",
      bonusValue: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
      xpMultiplier: evHasMultiplier ? Number(evMultiplier) : undefined,
      rankedMultiplier: evHasRankedMultiplier ? Number(evRankedMultiplier) : undefined,
      pointsMultiplier: evHasPointsMultiplier ? Number(evPointsMultiplier) : undefined,
      matchXpCap: evHasMatchCap ? Number(evMatchXpCap) : undefined,
      dailyXpCap: evHasDailyCap ? 1000 + Number(evDailyExtraXp) : undefined,
      durationHours: Number(evDurationHours),
      linkedMedalId: linkedIds[0] ?? (evLinkedMedalId || null),
      linkedMedalIds: linkedIds,
      objectiveDescription: evObjective || null,
    });
    const updated = loadSpecialEvents();
    setSpecialEvents(updated);
    setIsCreatingEvent(false);
    setEditingSpecialEventId(null);
    setEvTitle("");
    setEvDesc("");
    setEvObjective("");
    setEvAttachedMedals([]);
    const nextCfg = { ...draft, specialEvents: updated, customMedals: newCustoms };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento especial salvo no Banco de Dados (PlayFab) e ativado!"
        : "💾 Evento especial salvo localmente neste navegador!"
    );
    onConfigSaved?.();
  }

  async function handleToggleEventActive(id: string) {
    const list = specialEvents.map((ev) =>
      ev.id === id ? { ...ev, active: !ev.active } : ev,
    );
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Status sincronizado com o Banco de Dados (PlayFab)!"
        : "💾 Status do evento atualizado localmente!"
    );
    onConfigSaved?.();
  }

  async function handleToggleSpecialScope(id: string) {
    const list = specialEvents.map((ev) => {
      if (ev.id !== id) return ev;
      const nextScope: EventScope = ev.scope === "modo_ranqueado" ? "todos" : "modo_ranqueado";
      return { ...ev, scope: nextScope };
    });
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved("✅ Escopo do evento atualizado com sucesso!");
    onConfigSaved?.();
  }

  async function handleDeleteEvent(id: string) {
    const list = specialEvents.filter((ev) => ev.id !== id);
    setSpecialEvents(list);
    saveSpecialEvents(list);
    const nextCfg = { ...draft, specialEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento excluído do Banco de Dados (PlayFab)!"
        : "💾 Evento excluído localmente."
    );
    onConfigSaved?.();
  }

  function handleStartEditRecurringEvent(ev: RecurringEvent) {
    setEditingRecurringEventId(ev.id);
    setRecTitle(ev.title);
    setRecDesc(ev.description || "");
    setRecScope(ev.scope);
    setRecDaysOfWeek(ev.daysOfWeek || []);
    setRecSpecificDates(ev.specificDates || []);
    setRecHasMultiplier(Boolean(ev.xpMultiplier && ev.xpMultiplier > 1));
    setRecMultiplier(ev.xpMultiplier || 1.5);
    setRecHasMatchCap(Boolean(ev.matchXpCap && ev.matchXpCap > 20));
    setRecMatchCap(ev.matchXpCap || 30);
    setRecHasDailyCap(Boolean(ev.dailyXpCap && ev.dailyXpCap > 1000));
    setRecDailyExtraXp(ev.dailyXpCap ? Math.max(100, ev.dailyXpCap - 1000) : 500);
    setRecHasRankedMultiplier(Boolean(ev.rankedMultiplier && ev.rankedMultiplier > 1));
    setRecRankedMultiplier(ev.rankedMultiplier || 2);
    setRecHasPointsMultiplier(Boolean(ev.pointsMultiplier && ev.pointsMultiplier > 1));
    setRecPointsMultiplier(ev.pointsMultiplier || 2);
    setRecObjective(ev.objectiveDescription || "");
    setRecLinkedMedal(ev.linkedMedalId || "");
    setIsCreatingRecurring(true);
  }

  async function handleCreateRecurringEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!recTitle.trim()) {
      flashSaved("Informe o título do evento recorrente.");
      return;
    }
    if (recDaysOfWeek.length === 0 && recSpecificDates.length === 0) {
      flashSaved("Selecione pelo menos um dia da semana ou uma data específica.");
      return;
    }
    const hasAnyBonus = recHasMultiplier || recHasMatchCap || recHasDailyCap || recHasRankedMultiplier || recHasPointsMultiplier;
    const hasAnyMedal = recAttachedMedals.length > 0 || Boolean(recLinkedMedal);
    if (!hasAnyBonus && !hasAnyMedal) {
      flashSaved("Marque pelo menos uma caixa de bônus ou vincule uma medalha ao evento.");
      return;
    }
    const newCustoms = [...(draft.customMedals ?? [])];
    const linkedIds: string[] = [];
    for (const m of recAttachedMedals) {
      if (!newCustoms.some((c) => c.id === m.id)) {
        newCustoms.push(m);
      }
      linkedIds.push(m.id);
    }

    if (editingRecurringEventId) {
      const list = recurringEvents.map((existing) => {
        if (existing.id !== editingRecurringEventId) return existing;
        return {
          ...existing,
          title: recTitle.trim(),
          description: recDesc.trim(),
          scope: recScope,
          daysOfWeek: recDaysOfWeek,
          specificDates: recSpecificDates,
          xpMultiplier: recHasMultiplier ? Number(recMultiplier) : undefined,
          rankedMultiplier: recHasRankedMultiplier ? Number(recRankedMultiplier) : undefined,
          pointsMultiplier: recHasPointsMultiplier ? Number(recPointsMultiplier) : undefined,
          matchXpCap: recHasMatchCap ? Number(recMatchCap) : undefined,
          dailyXpCap: recHasDailyCap ? 1000 + Number(recDailyExtraXp) : undefined,
          linkedMedalId: linkedIds[0] ?? (recLinkedMedal || existing.linkedMedalId || null),
          linkedMedalIds: linkedIds.length > 0 ? linkedIds : existing.linkedMedalIds,
          objectiveDescription: recObjective?.trim() || null,
        };
      });
      setRecurringEvents(list);
      saveRecurringEvents(list);
      setIsCreatingRecurring(false);
      setEditingRecurringEventId(null);
      setRecTitle("");
      setRecDesc("");
      setRecObjective("");
      setRecSpecificDates([]);
      setRecDaysOfWeek([6, 0]);
      setRecAttachedMedals([]);
      const nextCfg = { ...draft, recurringEvents: list, customMedals: newCustoms };
      setDraft(nextCfg);
      await auth.updateAdminConfig(nextCfg);
      flashSaved("✅ Evento recorrente atualizado com sucesso!");
      onConfigSaved?.();
      return;
    }

    createRecurringEvent({
      title: recTitle,
      description: recDesc,
      scope: recScope,
      daysOfWeek: recDaysOfWeek,
      specificDates: recSpecificDates,
      xpMultiplier: recHasMultiplier ? Number(recMultiplier) : undefined,
      rankedMultiplier: recHasRankedMultiplier ? Number(recRankedMultiplier) : undefined,
      pointsMultiplier: recHasPointsMultiplier ? Number(recPointsMultiplier) : undefined,
      matchXpCap: recHasMatchCap ? Number(recMatchCap) : undefined,
      dailyXpCap: recHasDailyCap ? 1000 + Number(recDailyExtraXp) : undefined,
      linkedMedalId: linkedIds[0] ?? (recLinkedMedal || null),
      linkedMedalIds: linkedIds,
      objectiveDescription: recObjective || null,
    });
    const updated = loadRecurringEvents();
    setRecurringEvents(updated);
    setIsCreatingRecurring(false);
    setRecTitle("");
    setRecDesc("");
    setRecObjective("");
    setRecSpecificDates([]);
    setRecDaysOfWeek([6, 0]);
    setRecAttachedMedals([]);
    const nextCfg = { ...draft, recurringEvents: updated, customMedals: newCustoms };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento recorrente salvo no Banco de Dados (PlayFab) e ativado!"
        : "💾 Evento recorrente salvo localmente neste navegador!"
    );
    onConfigSaved?.();
  }

  async function handleToggleRecurringActive(id: string) {
    const list = recurringEvents.map((ev) =>
      ev.id === id ? { ...ev, active: !ev.active } : ev,
    );
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Status recorrente sincronizado com o Banco de Dados (PlayFab)!"
        : "💾 Status do evento recorrente atualizado localmente!"
    );
    onConfigSaved?.();
  }

  async function handleToggleRecurringScope(id: string) {
    const list = recurringEvents.map((ev) => {
      if (ev.id !== id) return ev;
      const nextScope: EventScope = ev.scope === "modo_ranqueado" ? "todos" : "modo_ranqueado";
      return { ...ev, scope: nextScope };
    });
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved("✅ Escopo do evento recorrente atualizado com sucesso!");
    onConfigSaved?.();
  }

  async function handleDeleteRecurringEvent(id: string) {
    const list = recurringEvents.filter((ev) => ev.id !== id);
    setRecurringEvents(list);
    saveRecurringEvents(list);
    const nextCfg = { ...draft, recurringEvents: list };
    setDraft(nextCfg);
    await auth.updateAdminConfig(nextCfg);
    flashSaved(
      isPlayFabConfigured()
        ? "✅ Evento recorrente excluído do Banco de Dados (PlayFab)!"
        : "💾 Evento recorrente excluído localmente."
    );
    onConfigSaved?.();
  }

  async function handleApproveTurma(requestId: string) {
    await playfabApproveTurmaRequest(requestId);
    setTurmaRequests(loadTurmaRequests());
    flashSaved("Troca de turma aprovada!");
    onConfigSaved?.();
  }

  async function handleRejectTurma(requestId: string) {
    await playfabRejectTurmaRequest(requestId);
    setTurmaRequests(loadTurmaRequests());
    flashSaved("Solicitação de troca recusada.");
    onConfigSaved?.();
  }

  const players = open && auth.isAdmin ? getAllRegisteredPlayers() : [];
  const pendingTurmaCount = turmaRequests.filter((r) => r.status === "pendente").length;
  const activeEventsCount =
    specialEvents.filter((e) => isEventActive(e)).length +
    recurringEvents.filter((e) => isRecurringEventActive(e)).length;
  const unreadNotifsCount = draft.adminMedalNotifications?.filter((n) => !n.read).length ?? 0;
  const unreadX1Count = x1History.filter((h) => !h.read).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:w-[92vw] max-w-5xl h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <ShieldCheck className="h-6 w-6 text-primary" /> Painel do Administrador (ADM)
          </DialogTitle>
        </DialogHeader>

        {!auth.isAdmin ? (
          <form onSubmit={handlePinSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            <div className="rounded-2xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
              Insira a chave de Administrador ou o Código Mestre do Professor para configurar os
              jogos disponíveis, códigos de acesso e agendamentos de reset do ranking.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-pin">Chave / Senha de Administrador</Label>
              <Input
                id="admin-pin"
                type="password"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(null);
                }}
                placeholder="Digite o código ADM (ex: SEMED26)"
                className="rounded-xl"
                autoFocus
                required
              />
            </div>
            {pinError && (
              <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive">
                {pinError}
              </p>
            )}
            <Button type="submit" size="lg" className="h-12 w-full rounded-2xl font-bold">
              <Lock className="mr-2 h-4 w-4" /> Acessar Painel ADM
            </Button>
          </form>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Header Tabs */}
            <div className="px-6 py-3 border-b shrink-0 bg-secondary/30">
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-1.5 rounded-2xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setTab("jogos")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "jogos" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Gamepad2 className="h-4 w-4" /> Jogos
                </button>
                <button
                  type="button"
                  onClick={() => setTab("arena_x1")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "arena_x1" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Swords className="h-4 w-4 text-accent" /> Arena X1
                  {unreadX1Count > 0 && (
                    <span className="rounded-full bg-accent text-accent-foreground px-1.5 py-0.2 text-[10px] font-black">
                      {unreadX1Count}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("torneio")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "torneio" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Trophy className="h-4 w-4 text-accent" /> Torneio & Ranqueada
                </button>
                <button
                  type="button"
                  onClick={() => setTab("eventos")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "eventos" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Zap className="h-4 w-4 text-amber-500" /> Eventos
                  {activeEventsCount > 0 && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("avisos")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "avisos" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Sparkles className="h-4 w-4 text-primary" /> Avisos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("correio");
                    refreshRoster();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "correio" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Mail className="h-4 w-4 text-amber-500" /> Correio
                </button>
                <button
                  type="button"
                  onClick={() => setTab("medalhas")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "medalhas" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Award className="h-4 w-4 text-accent" /> Medalhas
                  {unreadNotifsCount > 0 && (
                    <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("turmas")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "turmas" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <School className="h-4 w-4 text-primary" /> Turmas & Escolas
                  {pendingTurmaCount > 0 && (
                    <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.2 text-[10px] font-black">
                      {pendingTurmaCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("resets")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "resets" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <CalendarClock className="h-4 w-4" /> Temporadas & Resets
                </button>
                <button
                  type="button"
                  onClick={() => setTab("sistema")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "sistema" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Cloud className="h-4 w-4" /> PlayFab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("lixeira");
                    refreshRoster();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors ${
                    tab === "lixeira"
                      ? "bg-card text-destructive shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" /> Lixeira
                  {trashPlayers.length > 0 && (
                    <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.2 text-[10px] font-black">
                      {trashPlayers.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Stable Internal Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {savedMsg && (
                <div className="animate-pop-in rounded-2xl bg-success/15 px-4 py-2.5 text-center text-sm font-bold text-success">
                  {savedMsg}
                </div>
              )}

            {/* TAB 1: JOGOS & CÓDIGOS */}
            {tab === "jogos" && (
              <div className="space-y-4">
                {/* Status e Controle de Acesso aos Jogos (Liberado Inicialmente / Travado com SEMED26) */}
                <div
                  className={`rounded-2xl border p-4 transition-all ${
                    draft.requireCodeGate
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-emerald-500/10 border-emerald-500/30"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-display text-base font-black">
                        {draft.requireCodeGate ? (
                          <>
                            <Lock className="h-5 w-5 text-amber-500 shrink-0" />
                            <span className="text-amber-600 dark:text-amber-400">
                              Jogos Travados com Código ({draft.masterCode || "SEMED26"})
                            </span>
                          </>
                        ) : (
                          <>
                            <Unlock className="h-5 w-5 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Jogos Liberados Inicialmente (Acesso Livre)
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                        {draft.requireCodeGate
                          ? `Acesso travado. Alunos precisam inserir o código Master (${draft.masterCode || "SEMED26"}) ou o código individual para liberar os jogos marcados.`
                          : "Todos os jogos marcados abaixo já ficam liberados e prontos para jogar na página inicial desde o início."}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant={draft.requireCodeGate ? "default" : "outline"}
                      onClick={() => void handleToggleRequireCodeGate()}
                      className={`shrink-0 rounded-xl font-black text-xs gap-1.5 shadow-sm ${
                        draft.requireCodeGate
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                      }`}
                    >
                      {draft.requireCodeGate ? (
                        <>
                          <Unlock className="h-4 w-4" /> Liberar Jogos para Todos
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" /> Travar com Código {draft.masterCode || "SEMED26"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Exibir ou Ocultar Card de Inserir Código na Tela Inicial */}
                <div className="rounded-2xl border bg-card p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      Card "Inserir Código" na Tela Inicial
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Quando ativado, exibe um botão pontilhado na grade de jogos da página inicial para os alunos inserirem códigos de liberação.
                    </div>
                  </div>
                  <Switch
                    checked={draft.showCodeGateCardOnHome ?? false}
                    onCheckedChange={(v) => {
                      const updated = { ...draft, showCodeGateCardOnHome: v };
                      setDraft(updated);
                      void auth.updateAdminConfig(updated);
                      onConfigSaved?.();
                    }}
                  />
                </div>

                {/* Arena X1 Online Config (Nível 5+ e Atalho para Aba Arena X1) */}
                <div className="rounded-2xl border bg-accent/10 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        Arena de Batalha X1 Online (Nível 5+ • +100 XP Extra/dia)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Liberada apenas para alunos a partir do Nível 5 nos horários configurados
                        (padrão: 07h às 19h).
                      </div>
                    </div>
                    <Switch
                      checked={draft.x1Enabled ?? true}
                      onCheckedChange={(v) => void handleToggleX1Enabled(v)}
                    />
                  </div>

                  {(draft.x1Enabled ?? true) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/80 p-3 text-xs">
                      <div>
                        <span className="font-bold text-foreground">Status do Horário: </span>
                        {draft.x1ForceOpen ? (
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                            Liberado 24 Horas (Sem restrição)
                          </span>
                        ) : (
                          <span className="font-bold text-primary">
                            Aberto das {String(draft.x1OpenHour ?? 7).padStart(2, "0")}:00h às {String(draft.x1CloseHour ?? 19).padStart(2, "0")}:00h
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setTab("arena_x1")}
                        className="h-8 rounded-lg text-xs font-bold"
                      >
                        <Swords className="mr-1.5 h-3.5 w-3.5 text-accent" />
                        Configurar Jogos e Horários da Arena X1 →
                      </Button>
                    </div>
                  )}
                </div>

                {/* Torneio Semanal Ranqueado Config (Nível 3+ e 1 Jogo/Semana) */}
                <div className="rounded-2xl border bg-primary/10 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        Torneio Semanal Ranqueado (Nível 3+ • Top 5 & Medalhas)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        1 jogo por semana, até 10 entradas/dia (+100 XP extra/dia) e bônus de
                        permanência no Top 5.
                      </div>
                    </div>
                    <Switch
                      checked={draft.tournamentEnabled ?? true}
                      onCheckedChange={(v) => setDraft({ ...draft, tournamentEnabled: v })}
                    />
                  </div>

                  {(draft.tournamentEnabled ?? true) && (
                    <div className="rounded-xl border bg-background/80 p-3 space-y-1.5">
                      <Label className="text-xs font-bold">Jogo do Torneio desta Semana</Label>
                      <select
                        value={draft.tournamentGameOverride ?? "auto"}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            tournamentGameOverride:
                              e.target.value === "auto" ? null : (e.target.value as GameId),
                          })
                        }
                        className="h-10 w-full rounded-xl border bg-card px-3 font-display text-sm font-bold"
                      >
                        <option value="auto">🔄 Rotação Automática Semanal (1 jogo por semana)</option>
                        {ALL_GAME_IDS.map((id) => (
                          <option key={id} value={id}>
                            🎯 Fixar manualmente: {GAME_NAMES[id]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-card p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-1.5 font-display font-bold text-primary">
                      <KeyRound className="h-4 w-4" /> Código Mestre (Professor — libera todos)
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyCodesList}
                      className="h-8 rounded-xl text-xs"
                    >
                      {copied ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5 text-success" /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copiar códigos
                        </>
                      )}
                    </Button>
                  </div>
                  <Input
                    value={draft.masterCode}
                    onChange={(e) =>
                      setDraft({ ...draft, masterCode: normalizeCode(e.target.value) })
                    }
                    maxLength={12}
                    className="rounded-xl font-display font-bold uppercase tracking-widest"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                    <div className="flex items-center gap-2">
                      <span>Jogo (Ativar / Desativar)</span>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary lowercase tracking-normal">
                        {ALL_GAME_IDS.filter((id) => Boolean(draft.enabledGames[id])).length} de {ALL_GAME_IDS.length} visíveis na página inicial
                      </span>
                    </div>
                    <span>Código de Acesso</span>
                  </div>

                  {ALL_GAME_IDS.map((id) => {
                    const enabled = Boolean(draft.enabledGames[id]);
                    const isAdminOnly = Boolean(draft.adminOnlyGames?.[id]);
                    const reqLevel = draft.gameLevelRequirements?.[id] ?? 1;
                    const gStats = gameStatsSummary[id] ?? { totalPlays: 0, admPlays: 0 };
                    return (
                      <div
                        key={id}
                        className={`flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 rounded-2xl border p-3 transition-colors ${
                          enabled ? "bg-card border-primary/20" : "bg-muted/40 opacity-70 border-dashed"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Switch
                            checked={enabled}
                            onCheckedChange={(v) => void handleToggleGame(id, v)}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-display text-sm font-bold flex items-center gap-2">
                              {GAME_NAMES[id]}
                              {!enabled && (
                                <span className="rounded bg-destructive/15 text-destructive px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-normal">
                                  Oculto
                                </span>
                              )}
                              {isAdminOnly && (
                                <span className="rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-normal">
                                  🧪 Só ADM (Testes)
                                </span>
                              )}
                              {reqLevel > 1 && (
                                <span className="rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-normal">
                                  ⭐ Nv {reqLevel}+
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {enabled
                                ? isAdminOnly
                                  ? "Visível exclusivamente para o ADM (Testes preliminares)"
                                  : "Liberado e visível na página inicial para todos"
                                : "Desmarcado (Oculto da página inicial para todos)"}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black ${
                                  gStats.totalPlays > 0
                                    ? "bg-primary/15 border border-primary/30 text-primary"
                                    : "bg-muted text-muted-foreground border border-border"
                                }`}
                              >
                                🎮 {gStats.totalPlays} partida{gStats.totalPlays === 1 ? "" : "s"} jogada{gStats.totalPlays === 1 ? "" : "s"}
                              </span>
                              {gStats.admPlays > 0 && (
                                <span className="text-[10px] font-bold text-muted-foreground">
                                  ({gStats.admPlays} pelo seu perfil)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Controles de Nível Mínimo e Modo Apenas ADM */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Toggle Apenas ADM / Testes */}
                          <button
                            type="button"
                            onClick={() => void handleToggleAdminOnly(id, !isAdminOnly)}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black cursor-pointer transition-all ${
                              isAdminOnly
                                ? "bg-purple-500 text-white shadow-xs hover:bg-purple-600"
                                : "bg-secondary text-muted-foreground hover:bg-secondary/80 border border-border"
                            }`}
                            title="Alternar entre modo aberto para alunos ou exclusivo para testes do ADM"
                          >
                            🧪 {isAdminOnly ? "Apenas ADM" : "Aberto"}
                          </button>

                          {/* Seletor de Nível Mínimo Necessário (1 a 10) */}
                          <div className="flex items-center gap-1 rounded-xl border bg-secondary/40 px-2 py-0.5">
                            <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                              Nível Req:
                            </span>
                            <select
                              value={reqLevel}
                              onChange={(e) => void handleSetGameLevel(id, Number(e.target.value))}
                              className="h-7 rounded-lg bg-card px-1.5 text-xs font-black font-display text-foreground border border-border cursor-pointer"
                            >
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  Nível {lvl} {lvl === 1 ? "(Padrão)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Código de Acesso */}
                          <div className="flex items-center gap-1">
                            <Input
                              value={draft.gameCodes[id] ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  gameCodes: {
                                    ...draft.gameCodes,
                                    [id]: normalizeCode(e.target.value),
                                  },
                                })
                              }
                              maxLength={10}
                              className="h-8 w-24 rounded-xl text-center font-display text-xs font-extrabold uppercase tracking-wider"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              title="Sortear novo código"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  gameCodes: {
                                    ...draft.gameCodes,
                                    [id]: randomGameCode(id),
                                  },
                                })
                              }
                              className="h-8 px-2 rounded-xl"
                            >
                              <Sparkles className="h-3.5 w-3.5 text-accent" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={saveGamesAndCodes}
                    className="flex-1 h-12 rounded-2xl font-bold"
                  >
                    <Save className="mr-2 h-4 w-4" /> Salvar alterações
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={restoreDefaultCodes}
                    className="h-12 rounded-2xl"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrão
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 2: CONFIGURAÇÕES DA ARENA X1 (1 A 3 JOGOS COM ROTAÇÃO PROGRAMADA) */}
            {tab === "arena_x1" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-secondary/30 p-4">
                  <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                    <Swords className="h-5 w-5 text-accent" /> Arena de Desafio X1 Online (1 vs 1)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure os jogos disponíveis nas batalhas 1 contra 1 e o status de funcionamento da arena.
                  </p>
                </div>

                {/* Status e Horários */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        Habilitar Arena X1 para os Alunos (Nível 5+)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Disponibiliza o recurso de duelos em tempo real para os alunos.
                      </div>
                    </div>
                    <Switch
                      checked={draft.x1Enabled ?? true}
                      onCheckedChange={(v) => void handleToggleX1Enabled(v)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-3 border-t">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                        Status da Arena: {draft.x1ArenaClosed ? (
                          <span className="text-destructive font-extrabold">⛔ FECHADA</span>
                        ) : (
                          <span className="text-emerald-500 font-extrabold">🟢 ABERTA</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Quando fechada, exibe uma faixa vermelha de aviso informando que a arena foi fechada pela coordenação.
                      </div>
                    </div>
                    <Switch
                      checked={!(draft.x1ArenaClosed ?? false)}
                      onCheckedChange={async (aberta) => {
                        const updated = { ...draft, x1ArenaClosed: !aberta };
                        setDraft(updated);
                        await auth.updateAdminConfig(updated);
                        onConfigSaved?.();
                        flashCloudResult(!aberta ? "⛔ Arena X1 fechada pela coordenação!" : "🟢 Arena X1 reaberta!");
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t">
                    <div>
                      <Label className="text-xs font-bold">Abertura da Arena (0-23h)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={x1OpenInput}
                        onChange={(e) => setX1OpenInput(e.target.value)}
                        onBlur={() => void handleSaveX1Hour("open", x1OpenInput)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSaveX1Hour("open", x1OpenInput);
                          }
                        }}
                        className="mt-1 h-9 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold">Fechamento da Arena (1-24h)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={x1CloseInput}
                        onChange={(e) => setX1CloseInput(e.target.value)}
                        onBlur={() => void handleSaveX1Hour("close", x1CloseInput)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSaveX1Hour("close", x1CloseInput);
                          }
                        }}
                        className="mt-1 h-9 rounded-xl font-bold"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border bg-secondary/30 p-2.5">
                      <div className="text-xs">
                        <div className="font-bold">Modo 24 Horas</div>
                        <div className="text-[10px] text-muted-foreground">Sem restrição de horário</div>
                      </div>
                      <Switch
                        checked={draft.x1ForceOpen ?? false}
                        onCheckedChange={(v) => void handleToggleX1ForceOpen(v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Seleção dos Jogos Permitidos no X1 */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-bold text-foreground">
                        Jogos Permitidos no Modo X1
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Selecione quais jogos os alunos podem escolher ao criar salas ou desafios 1v1.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    {ALL_GAME_IDS.map((id) => {
                      const cur = (draft.x1AvailableGames && draft.x1AvailableGames.length > 0)
                        ? draft.x1AvailableGames
                        : ["rpg", "logica", "porcentagem", "minado"];
                      const selected = cur.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => void handleToggleX1Game(id)}
                          className={`rounded-xl border p-3 text-xs font-extrabold text-left transition-all ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background hover:bg-secondary/50 text-muted-foreground"
                          }`}
                        >
                          <div className="truncate text-sm">{GAME_NAMES[id]}</div>
                          <div className="text-[11px] opacity-90 mt-1">
                            {selected ? "✓ Habilitado no X1" : "+ Clique para Ativar"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    onClick={async () => {
                      await handleSaveX1Hour("open", x1OpenInput);
                      await handleSaveX1Hour("close", x1CloseInput);
                      await saveSystemSettings();
                    }}
                    className="w-full h-11 rounded-xl font-bold mt-2"
                  >
                    <Save className="mr-2 h-4 w-4" /> Salvar Configurações da Arena X1
                  </Button>
                </div>

                {/* Caixa de Entrada: Desafios X1 Realizados Entre Alunos */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-accent" />
                      <div>
                        <h4 className="font-display text-sm font-bold text-foreground">
                          Caixa de Entrada: Desafios X1 Realizados Entre Alunos
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Histórico de confrontos 1 contra 1 disputados pelos alunos na Arena.
                        </p>
                      </div>
                      {unreadX1Count > 0 && (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-black text-accent-foreground">
                          {unreadX1Count} novo(s)
                        </span>
                      )}
                    </div>
                    {x1History.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            markAllX1MatchesRead();
                            setX1History(loadX1MatchHistory());
                            flashSaved("Todos os confrontos marcados como lidos!");
                          }}
                          className="h-8 rounded-xl text-xs"
                        >
                          Marcar todos como lidos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            clearX1MatchHistory();
                            setX1History([]);
                            flashSaved("Histórico de confrontos limpo.");
                          }}
                          className="h-8 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar
                        </Button>
                      </div>
                    )}
                  </div>

                  {x1History.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Nenhum confronto registrado na Arena X1 ainda. Conforme os alunos disputarem partidas 1v1, os relatórios aparecerão aqui em tempo real.
                    </div>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {x1History.map((m) => (
                        <div
                          key={m.id}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-xs transition-colors ${
                            m.read ? "bg-background/60 opacity-80" : "bg-card border-accent/40 shadow-sm"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold">
                              <Swords className="h-5 w-5 text-accent" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-foreground">
                                  {m.hostNick} ({m.hostSchool})
                                </span>
                                <span className="font-black text-accent">VS</span>
                                <span className="font-extrabold text-foreground">
                                  {m.guestNick} ({m.guestSchool})
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                Jogo: <b>{m.gameName}</b> • Placar: <b>{m.hostScore} pts</b> × <b>{m.guestScore} pts</b> •{" "}
                                {new Date(m.finishedAt).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                          <div>
                            <span
                              className={`rounded-xl px-2.5 py-1 text-[11px] font-black ${
                                m.winnerId === "draw"
                                  ? "bg-secondary text-secondary-foreground"
                                  : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              }`}
                            >
                              {m.winnerId === "draw" ? "🤝 Empate" : `🏆 Vencedor: ${m.winnerNick}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: TORNEIO SEMANAL RANQUEADO (CONFIGURAÇÃO & VISUALIZAÇÃO POR ETAPA) */}
            {tab === "torneio" && (() => {
              const snap = getWeeklyTournamentSnapshot(auth.profile, tournamentStageFilter);

              return (
                <div className="space-y-4">
                  {/* Cabeçalho e Ações do Torneio */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-secondary/30 p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                        <Trophy className="h-5 w-5 text-accent" /> Torneio Semanal Ranqueado
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Gerencie o jogo oficial da semana, ative/desative o torneio e inspecione a classificação e ranks de todas as etapas escolares.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={syncingTournament}
                        onClick={async () => {
                          setSyncingTournament(true);
                          await syncWeeklyTournamentWithPlayFab();
                          setSyncingTournament(false);
                          flashSaved("Dados do Torneio sincronizados com a nuvem!");
                        }}
                        className="rounded-xl font-bold"
                      >
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncingTournament ? "animate-spin" : ""}`} />
                        Sincronizar Torneio
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          await auth.updateAdminConfig(draft);
                          onConfigSaved?.();
                          flashSaved("Configurações do Torneio salvas com sucesso!");
                        }}
                        className="rounded-xl font-bold"
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Alterações
                      </Button>
                    </div>
                  </div>

                  {/* Painel de Configurações do Torneio */}
                  <div className="rounded-2xl border bg-card p-5 space-y-4">
                    <h4 className="font-display text-sm font-black text-foreground">
                      Parâmetros da Semana ({snap.weekKey} • Até {snap.endsAtLabel})
                    </h4>

                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Ativar / Desativar Torneio */}
                      <div className="flex items-center justify-between rounded-xl border bg-secondary/20 p-3.5">
                        <div className="space-y-0.5">
                          <Label className="font-bold text-xs">Torneio Semanal Ativo</Label>
                          <p className="text-[11px] text-muted-foreground">
                            Permite aos alunos a partir do Nível 3 entrarem na disputa ranqueada.
                          </p>
                        </div>
                        <Switch
                          checked={draft.tournamentEnabled !== false}
                          onCheckedChange={(checked) =>
                            setDraft((d) => ({ ...d, tournamentEnabled: checked }))
                          }
                        />
                      </div>

                      {/* Escolha do Jogo da Semana */}
                      <div className="rounded-xl border bg-secondary/20 p-3.5 space-y-1.5">
                        <Label className="font-bold text-xs">Jogo Oficial da Semana</Label>
                        <select
                          value={draft.tournamentGameOverride || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraft((d) => ({
                              ...d,
                              tournamentGameOverride: val ? (val as GameId) : null,
                            }));
                          }}
                          className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold"
                        >
                          <option value="">🔄 Rotação Automática Semanal (Pelo Calendário)</option>
                          {ALL_GAME_IDS.map((gId) => (
                            <option key={gId} value={gId}>
                              🎯 {GAME_NAMES[gId]}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground">
                          Jogo atualmente ativo nesta semana: <b>{snap.gameName}</b>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status da Temporada de Ranqueada (Somente Leitura) */}
                  <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-accent/10 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Trophy className="h-5 w-5 text-accent" />
                          <span className="font-display text-base font-extrabold text-foreground">
                            {draft.rankedSeasonName || "Temporada 1 Ranqueada • SEMED Coari"}
                          </span>
                          <span className="rounded-full bg-accent/20 border border-accent/40 px-2.5 py-0.5 text-[10px] font-black text-accent uppercase">
                            Ciclo de 2 Semanas (14 Dias)
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Domingo 08/11/2026 completa metade da Temporada 1. O encerramento oficial e reset ocorrerão no próximo domingo, <b>15/11/2026 às 23:59:59</b>.
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setTab("resets")}
                        className="rounded-xl font-bold text-xs"
                      >
                        ⚙️ Configurar Datas e Resets na Aba Resets →
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/50 text-xs">
                      <div className="rounded-xl bg-background/80 p-2.5 border">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">Início da Temporada</span>
                        <span className="font-bold text-foreground">
                          {new Date(draft.rankedSeasonStartAt || "2026-11-01T00:00:00.000Z").toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="rounded-xl bg-background/80 p-2.5 border">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">Término & Reset</span>
                        <span className="font-bold text-primary font-mono">
                          {new Date(draft.rankedSeasonEndAt || "2026-11-15T23:59:59.999Z").toLocaleDateString("pt-BR")} às 23:59
                        </span>
                      </div>
                      <div className="rounded-xl bg-background/80 p-2.5 border">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block">Regra de Reset</span>
                        <span className="font-bold text-foreground">
                          Zera pontos ranqueados • Mantém todas as medalhas
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Horário de Funcionamento das Partidas Ranqueadas */}
                  <div className="rounded-2xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-display text-sm font-bold text-foreground">
                          Horário de Funcionamento das Partidas Ranqueadas
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Defina a janela de horários em que os alunos podem disputar partidas ranqueadas.
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <Label className="text-xs font-bold">Abertura (0-23h)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={draft.rankedOpenHour ?? 7}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              rankedOpenHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)),
                            })
                          }
                          className="mt-1 h-9 rounded-xl font-bold"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-bold">Fechamento (1-24h)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={draft.rankedCloseHour ?? 22}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              rankedCloseHour: Math.max(1, Math.min(24, Number(e.target.value) || 22)),
                            })
                          }
                          className="mt-1 h-9 rounded-xl font-bold"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-xl border bg-secondary/30 p-2.5">
                        <div className="text-xs">
                          <div className="font-bold">Modo 24 Horas</div>
                          <div className="text-[10px] text-muted-foreground">Sem restrição de horário</div>
                        </div>
                        <Switch
                          checked={draft.rankedForceOpen ?? true}
                          onCheckedChange={(v) => setDraft({ ...draft, rankedForceOpen: v })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inspeção do Ranking por Etapa Escolar */}
                  <div className="rounded-2xl border bg-card p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-display text-sm font-black text-foreground flex items-center gap-1.5">
                          <Award className="h-4 w-4 text-accent" /> Classificação Geral e por Etapas
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Inspecione o progresso, pontos ranqueados e divisão de cada aluno participante.
                        </p>
                      </div>

                      {/* Seletor de Etapas para o ADM */}
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setTournamentStageFilter("TODAS")}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                            tournamentStageFilter === "TODAS"
                              ? "border-accent bg-accent text-accent-foreground shadow-xs"
                              : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          🌐 Todas as Etapas
                        </button>
                        {AGE_STAGES.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setTournamentStageFilter(st.id)}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                              tournamentStageFilter === st.id
                                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {st.emoji} {st.shortLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tabela de Classificação do Torneio */}
                    {snap.allStandings.length === 0 ? (
                      <div className="rounded-xl bg-secondary/40 p-8 text-center text-xs text-muted-foreground">
                        Nenhum jogador pontuou no torneio semanal nesta etapa até o momento.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b bg-secondary/50 font-bold text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2.5">Posição</th>
                              <th className="px-3 py-2.5">Aluno</th>
                              <th className="px-3 py-2.5">Escola & Etapa</th>
                              <th className="px-3 py-2.5 text-center">Divisão / Rank</th>
                              <th className="px-3 py-2.5 text-right">Pontos Ranqueados</th>
                              <th className="px-3 py-2.5 text-center">Top 5</th>
                              <th className="px-3 py-2.5 text-right">Recorde (Tentativas)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {snap.allStandings.map((row) => {
                              const pts = row.tournamentPoints ?? row.totalRankedPoints;
                              const rDef = getTournamentRank(pts).currentRank;

                              return (
                                <tr key={row.playerId} className="hover:bg-secondary/20 transition-colors">
                                  <td className="px-3 py-2.5 font-display font-black">
                                    <span
                                      className={`inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-black ${
                                        row.rank === 1
                                          ? "bg-yellow-400 text-yellow-950"
                                          : row.rank === 2
                                            ? "bg-slate-300 text-slate-800"
                                            : row.rank === 3
                                              ? "bg-amber-700 text-amber-50"
                                              : "bg-secondary text-foreground"
                                      }`}
                                    >
                                      {row.rank}º
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 min-w-[140px]">
                                    <div className="font-bold text-foreground truncate">{row.nick}</div>
                                    {row.fullName && row.fullName.toLowerCase() !== row.nick.toLowerCase() && (
                                      <div className="text-[10px] uppercase text-muted-foreground truncate">
                                        {row.fullName}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="truncate font-medium">{row.school}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {row.stageLabel} • Nv. {row.level}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <div className="inline-flex items-center gap-1.5">
                                      <TournamentRankBadge rankId={rDef.id} points={pts} size="xs" />
                                      <span className={`font-bold ${rDef.textColor}`}>{rDef.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-black text-primary">
                                    {pts} pts
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-muted-foreground">
                                    {row.holdMinutes > 0 ? (
                                      <span className="font-semibold text-accent">
                                        {row.holdMinutes} min
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-muted-foreground">
                                    <b>{row.bestScore}</b> ({row.totalEntries}x)
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* TAB 3: EVENTOS ESPECIAIS & EVENTOS RECORRENTES (2 SUB-ABAS) */}
            {tab === "eventos" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-secondary/30 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Zap className="h-5 w-5 text-amber-500" /> Eventos & Linhas de Bônus
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerencie eventos pontuais manuais ou programe eventos recorrentes por dias da semana e datas específicas!
                    </p>
                  </div>

                  {/* Alternador das 2 Sub-abas de Eventos */}
                  <div className="flex items-center gap-1 rounded-xl bg-background border p-1">
                    <button
                      type="button"
                      onClick={() => setEventosSubTab("criacao")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        eventosSubTab === "criacao"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Zap className="inline mr-1 h-3.5 w-3.5" /> 1. Criação de Eventos
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventosSubTab("recorrentes")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        eventosSubTab === "recorrentes"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Calendar className="inline mr-1 h-3.5 w-3.5" /> 2. Eventos Recorrentes
                      {recurringEvents.filter((e) => isRecurringEventActive(e)).length > 0 && (
                        <span className="ml-1.5 rounded-full bg-emerald-500 text-white px-1.5 py-0.2 text-[9px] font-black animate-pulse">
                          Ao Vivo
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Indicador de Status do Banco de Dados / PlayFab Cloud */}
                {isPlayFabConfigured() ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="font-bold">
                        Banco de Dados Ativo: Microsoft Azure PlayFab (Title ID: {getPlayFabTitleId()})
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400">
                      ☁️ Sincronização em nuvem ativa: todos os eventos são salvos no banco de dados e sincronizados em todos os computadores.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-bold">
                        Modo Local (Banco de Dados Offline)
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-400">
                      💾 Salvo no navegador local. Para salvar no banco de dados da nuvem para todos os computadores, configure o Title ID na aba <b>PlayFab</b>.
                    </span>
                  </div>
                )}

                {/* SUB-ABA 1: CRIAÇÃO DE EVENTOS PONTUAIS / MANUAIS */}
                {eventosSubTab === "criacao" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          if (isCreatingEvent) {
                            setIsCreatingEvent(false);
                            setEditingSpecialEventId(null);
                          } else {
                            setEditingSpecialEventId(null);
                            setEvTitle("");
                            setEvDesc("");
                            setEvObjective("");
                            setEvAttachedMedals([]);
                            setIsCreatingEvent(true);
                          }
                        }}
                        className="rounded-xl font-bold h-9 text-xs"
                      >
                        {isCreatingEvent ? (editingSpecialEventId ? "Cancelar Edição" : "Fechar Formulário") : "+ Criar Novo Evento Pontual"}
                      </Button>
                    </div>

                    {isCreatingEvent && (
                      <form onSubmit={handleCreateEvent} className="rounded-3xl border-2 border-primary/40 bg-card p-4 space-y-3 animate-in fade-in-50">
                        <h4 className="font-display text-sm font-black text-primary">
                          {editingSpecialEventId ? `Editar Evento Pontual: ${evTitle || "Sem título"}` : "Novo Evento Especial Turbinado"}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Nome do Evento</Label>
                            <Input
                              value={evTitle}
                              onChange={(e) => setEvTitle(e.target.value)}
                              placeholder="Ex: Super Fim de Semana 2x XP"
                              className="rounded-xl h-9 text-xs font-semibold"
                              required
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Escopo (Jogos Participantes)</Label>
                            <select
                              value={evScope}
                              onChange={(e) => setEvScope(e.target.value as EventScope)}
                              className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                            >
                              <option value="todos">🌟 Todos os Jogos da Plataforma</option>
                              <option value="modo_ranqueado">🏆 Apenas Jogo do Modo Ranqueado (Torneio Semanal)</option>
                              {ALL_GAME_IDS.map((id) => (
                                <option key={id} value={id}>
                                  🎮 Somente: {GAME_NAMES[id]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Descrição / Detalhes para os Alunos</Label>
                          <Input
                            value={evDesc}
                            onChange={(e) => setEvDesc(e.target.value)}
                            placeholder="Ex: Jogue qualquer partida e ganhe o dobro de XP com teto expandido!"
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>

                        {/* As 3 Linhas de Bônus com Caixinhas para Marcar */}
                        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="font-display text-xs font-black uppercase text-amber-500 flex items-center gap-1.5">
                              <Zap className="h-4 w-4" /> Bônus do Evento (Marque as caixinhas que deseja ativar)
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              Escolha 1, 2 ou os 3 bônus (opcional se vincular medalha)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Bônus 1: Multiplicador */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasMultiplier}
                                  onChange={(e) => setEvHasMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  1. Multiplicador de XP
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasMultiplier}
                                  value={evMultiplier}
                                  onChange={(e) => setEvMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% bônus)</option>
                                  <option value={2}>2x (Dobro de XP)</option>
                                  <option value={2.5}>2.5x (+150% bônus)</option>
                                  <option value={3}>3x (Triplo de XP)</option>
                                  <option value={4}>4x (4x de XP)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica o XP das partidas</p>
                              </div>
                            </div>

                            {/* Bônus 2: Teto por Partida */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasMatchCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasMatchCap}
                                  onChange={(e) => setEvHasMatchCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  2. Teto por Partida (XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!evHasMatchCap}
                                  min={10}
                                  max={200}
                                  step={5}
                                  value={evMatchXpCap}
                                  onChange={(e) => setEvMatchXpCap(Number(e.target.value))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!evHasMatchCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 50 XP"
                                />
                                <p className="text-[10px] text-muted-foreground">Normal: 20 XP por partida</p>
                              </div>
                            </div>

                            {/* Bônus 3: Adicionar ao Limite Diário Geral */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasDailyCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasDailyCap}
                                  onChange={(e) => setEvHasDailyCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  3. Limite Diário (+XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!evHasDailyCap}
                                  min={50}
                                  max={5000}
                                  step={50}
                                  value={evDailyExtraXp}
                                  onChange={(e) => setEvDailyExtraXp(Math.max(0, Number(e.target.value)))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!evHasDailyCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 500 XP adicionais"
                                />
                                <p className="text-[10px] text-muted-foreground font-semibold">
                                  {evHasDailyCap
                                    ? `Base (1.000 XP) + ${evDailyExtraXp} = ${1000 + evDailyExtraXp} XP/dia`
                                    : "Normal: 1.000 XP/dia"}
                                </p>
                              </div>
                            </div>

                            {/* Bônus 4: Multiplicador na Ranqueada */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasRankedMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasRankedMultiplier}
                                  onChange={(e) => {
                                    setEvHasRankedMultiplier(e.target.checked);
                                  }}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  4. Ranqueada (Pontos)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasRankedMultiplier}
                                  value={evRankedMultiplier}
                                  onChange={(e) => setEvRankedMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasRankedMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos no torneio</p>
                              </div>
                            </div>

                            {/* Bônus 5: Multiplicador de Pontos de Conquista / Moedas */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${evHasPointsMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={evHasPointsMultiplier}
                                  onChange={(e) => setEvHasPointsMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  5. Pontos (Moedas)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!evHasPointsMultiplier}
                                  value={evPointsMultiplier}
                                  onChange={(e) => setEvPointsMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!evHasPointsMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos de conquista</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Duração do Evento</Label>
                          <select
                            value={evDurationHours}
                            onChange={(e) => setEvDurationHours(Number(e.target.value))}
                            className="h-9 w-full max-w-sm rounded-xl border bg-background px-3 text-xs font-bold"
                          >
                            <option value={12}>12 Horas</option>
                            <option value={24}>1 Dia (24 horas)</option>
                            <option value={48}>2 Dias (Fim de Semana)</option>
                            <option value={72}>3 Dias (72 horas)</option>
                            <option value={168}>1 Semana Completa (7 dias)</option>
                          </select>
                        </div>

                        {/* Seção de Medalhas Atribuídas ao Evento */}
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h5 className="font-display text-xs font-black uppercase text-primary flex items-center gap-1.5">
                                <Award className="h-4 w-4 text-primary" /> Medalhas do Evento ({evAttachedMedals.length})
                              </h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Crie ou vincule medalhas exclusivas com objetivos e missões a serem cumpridos durante o evento.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={isAddingMedalToEv ? "secondary" : "default"}
                              onClick={() => setIsAddingMedalToEv(!isAddingMedalToEv)}
                              className="rounded-xl font-bold text-xs h-8"
                            >
                              {isAddingMedalToEv ? "Fechar Seletor" : "+ Adicionar Medalha ao Evento"}
                            </Button>
                          </div>

                          {/* Lista das Medalhas já anexadas */}
                          {evAttachedMedals.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {evAttachedMedals.map((m, idx) => {
                                const rarity = RARITY_INFO[m.rarity];
                                return (
                                  <div
                                    key={m.id || idx}
                                    className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                        <div className={rarity.textColor}>
                                          <MedalIcon name={m.iconName} className="h-4 w-4" />
                                        </div>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="truncate font-display text-xs font-black text-foreground">
                                            {m.title}
                                          </span>
                                          <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase ${rarity.badgeBgClass}`}>
                                            {rarity.label}
                                          </span>
                                        </div>
                                        <p className="line-clamp-1 text-[10px] text-muted-foreground">
                                          {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEvAttachedMedals(evAttachedMedals.filter((_, i) => i !== idx))}
                                      className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Remover medalha deste evento"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-primary/20 p-3 text-center text-[11px] text-muted-foreground">
                              Nenhuma medalha vinculada ainda. Clique em <b>"+ Adicionar Medalha ao Evento"</b> para criar novas medalhas com requisitos específicos ou escolher existentes.
                            </div>
                          )}

                          {/* Sub-painel para Adicionar Medalha */}
                          {isAddingMedalToEv && (
                            <div className="rounded-2xl border bg-card p-3 space-y-3 animate-in fade-in-50">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <button
                                  type="button"
                                  onClick={() => setEvMedalMode("novo")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    evMedalMode === "novo"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  ✨ Criar Nova Medalha
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvMedalMode("existente")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    evMedalMode === "existente"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  📂 Utilizar Medalha Existente ({availableExistingEventMedals.length})
                                </button>
                              </div>

                              {evMedalMode === "novo" ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Título da Medalha</Label>
                                      <Input
                                        value={evNewMedalTitle}
                                        onChange={(e) => setEvNewMedalTitle(e.target.value)}
                                        placeholder="Ex: Campeão da Arena 2x"
                                        className="h-8 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Raridade</Label>
                                      <select
                                        value={evNewMedalRarity}
                                        onChange={(e) => setEvNewMedalRarity(e.target.value as MedalRarity)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        <option value="bronze">Bronze</option>
                                        <option value="prata">Prata</option>
                                        <option value="ouro">Ouro</option>
                                        <option value="platina">Platina</option>
                                        <option value="diamante">Diamante</option>
                                        <option value="heroi">Herói</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Requisito do Evento</Label>
                                      <select
                                        value={evNewMedalReqType}
                                        onChange={(e) => {
                                          const t = e.target.value as EventRequirementType;
                                          setEvNewMedalReqType(t);
                                          const opt = EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === t);
                                          if (opt) setEvNewMedalThreshold(opt.defaultVal);
                                        }}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        {EVENT_REQUIREMENT_OPTIONS.map((opt) => (
                                          <option key={opt.type} value={opt.type}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Jogo Vinculado</Label>
                                      <select
                                        disabled={["event_x1_wins", "event_distinct_games", "event_daily_cap", "event_team_matches"].includes(evNewMedalReqType)}
                                        value={evNewMedalScope}
                                        onChange={(e) => setEvNewMedalScope(e.target.value as "todos" | GameId)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold disabled:opacity-50"
                                      >
                                        <option value="todos">🌟 Qualquer Jogo</option>
                                        {ALL_GAME_IDS.map((id) => (
                                          <option key={id} value={id}>
                                            🎮 {GAME_NAMES[id]}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">
                                        Meta ({EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === evNewMedalReqType)?.unit})
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={evNewMedalThreshold}
                                        onChange={(e) => setEvNewMedalThreshold(Math.max(1, Number(e.target.value)))}
                                        className="h-8 rounded-lg text-xs font-bold bg-background"
                                      />
                                    </div>
                                  </div>

                                  {/* Ícones Selector Compact */}
                                  <div className="space-y-1">
                                    <Label className="text-[11px] font-bold">Ícone</Label>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto rounded-lg border bg-background p-1.5">
                                      {AVAILABLE_MEDAL_ICONS.map((ic) => (
                                        <button
                                          key={ic}
                                          type="button"
                                          onClick={() => setEvNewMedalIcon(ic)}
                                          className={`grid h-7 w-7 place-items-center rounded-md border transition-all ${
                                            evNewMedalIcon === ic
                                              ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                                              : "hover:bg-secondary text-muted-foreground"
                                          }`}
                                          title={ic}
                                        >
                                          <MedalIcon name={ic} className="h-3.5 w-3.5" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Preview do Requisito */}
                                  <div className="rounded-xl border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
                                    <b>Descrição automática:</b> {formatEventRequirementLabel({
                                      type: evNewMedalReqType,
                                      threshold: evNewMedalThreshold,
                                      gameId: evNewMedalScope === "todos" ? undefined : evNewMedalScope,
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between rounded-xl border bg-card p-2.5">
                                    <div>
                                      <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer" htmlFor="ev-medal-stackable">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        Medalha Empilhável / Cumulativa
                                      </Label>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Alunos podem acumular esta medalha múltiplas vezes com contador no canto superior direito.
                                      </p>
                                    </div>
                                    <input
                                      id="ev-medal-stackable"
                                      type="checkbox"
                                      checked={evNewMedalIsStackable}
                                      onChange={(e) => setEvNewMedalIsStackable(e.target.checked)}
                                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        if (!evNewMedalTitle.trim()) {
                                          flashSaved("Informe o título da medalha.");
                                          return;
                                        }
                                        const req: EventMedalRequirement = {
                                          type: evNewMedalReqType,
                                          threshold: Number(evNewMedalThreshold) || 1,
                                          gameId: evNewMedalScope === "todos" ? undefined : evNewMedalScope,
                                        };
                                        const medalId = `ev_medal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                                        const newM: MedalDefinition = {
                                          id: medalId,
                                          title: evNewMedalTitle.trim(),
                                          description: `${evNewMedalTitle.trim()} — Exclusiva do evento "${evTitle.trim() || "Especial"}". ${formatEventRequirementLabel(req)}`,
                                          rarity: evNewMedalRarity,
                                          category: "evento",
                                          iconName: evNewMedalIcon,
                                          condition: {
                                            type: evNewMedalReqType,
                                            threshold: req.threshold,
                                            gameId: req.gameId,
                                          },
                                          isCustom: true,
                                          isStackable: evNewMedalIsStackable,
                                          createdByAdmin: true,
                                          eventName: evTitle.trim() || "Evento Especial",
                                          eventRequirement: req,
                                        };
                                        setEvAttachedMedals([...evAttachedMedals, newM]);
                                        setIsAddingMedalToEv(false);
                                        setEvNewMedalTitle("");
                                        flashSaved(`Medalha "${newM.title}" adicionada ao evento!`);
                                      }}
                                      className="rounded-xl font-bold text-xs h-8 bg-primary"
                                    >
                                      + Adicionar Medalha ao Evento
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Modo Existente */
                                <div className="space-y-3">
                                  {availableExistingEventMedals.length === 0 ? (
                                    <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                                      Nenhuma medalha de evento disponível que não esteja em uso em outro evento ativo. Crie uma nova medalha na aba acima!
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <Label className="text-[11px] font-bold">Selecione uma Medalha Existente</Label>
                                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                        {availableExistingEventMedals.map((m) => {
                                          const rarity = RARITY_INFO[m.rarity];
                                          const isAlreadyAttached = evAttachedMedals.some((a) => a.id === m.id);
                                          return (
                                            <div
                                              key={m.id}
                                              className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-colors ${
                                                isAlreadyAttached ? "opacity-40 bg-muted" : "bg-card hover:border-primary"
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                                  <div className={rarity.textColor}>
                                                    <MedalIcon name={m.iconName} className="h-3.5 w-3.5" />
                                                  </div>
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-bold truncate">{m.title}</span>
                                                    <span className={`text-[8px] font-extrabold uppercase px-1 rounded ${rarity.badgeBgClass}`}>
                                                      {rarity.label}
                                                    </span>
                                                  </div>
                                                  <p className="text-[10px] text-muted-foreground truncate">
                                                    {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                                  </p>
                                                </div>
                                              </div>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={isAlreadyAttached}
                                                onClick={() => {
                                                  const cloned: MedalDefinition = {
                                                    ...m,
                                                    eventName: evTitle.trim() || m.eventName || "Evento Especial",
                                                    description: m.description.includes("—")
                                                      ? m.description
                                                      : `${m.title} — Exclusiva do evento "${evTitle.trim() || "Especial"}". ${m.description}`,
                                                  };
                                                  setEvAttachedMedals([...evAttachedMedals, cloned]);
                                                  setIsAddingMedalToEv(false);
                                                  flashSaved(`Medalha "${m.title}" vinculada ao evento!`);
                                                }}
                                                className="rounded-lg text-[10px] font-bold h-7 px-2"
                                              >
                                                {isAlreadyAttached ? "Já Vinculada" : "+ Vincular"}
                                              </Button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingEvent(false);
                              setEditingSpecialEventId(null);
                            }}
                            className="rounded-xl text-xs"
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" size="sm" className="rounded-xl font-bold text-xs bg-primary">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {editingSpecialEventId ? "Salvar Alterações" : "Criar e Ativar Evento"}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Lista de Eventos Pontuais */}
                    <div className="space-y-2">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Eventos Pontuais Ativos / Agendados ({specialEvents.length})
                      </h4>

                      {specialEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          Nenhum evento pontual cadastrado. Clique no botão acima para criar um evento temporário.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {specialEvents.map((ev) => {
                            const activeNow = isEventActive(ev);
                            const remaining = formatEventRemainingTime(ev.endsAt);
                            return (
                              <div
                                key={ev.id}
                                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                                  activeNow
                                    ? "border-amber-500/50 bg-amber-500/5"
                                    : "border-border/60 bg-muted/20 opacity-75"
                                }`}
                              >
                                <div className="min-w-0 space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                        activeNow
                                          ? "bg-amber-500 text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {activeNow ? "AO VIVO NO MENU" : "ENCERRADO / INATIVO"}
                                    </span>
                                    <h5 className="font-display text-sm font-black text-foreground truncate">
                                      {ev.title}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleSpecialScope(ev.id)}
                                      title="Clique para alternar o escopo do evento (Todos os Jogos ⇄ Apenas Ranqueada)"
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-all border hover:scale-105 ${
                                        ev.scope === "modo_ranqueado"
                                          ? "bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30"
                                          : "bg-secondary text-muted-foreground border-border/60 hover:text-foreground"
                                      }`}
                                    >
                                      {formatEventScopeText(ev.scope)} ⇄
                                    </button>
                                  </div>

                                  {ev.description && (
                                    <p className="text-xs text-muted-foreground">{ev.description}</p>
                                  )}

                                  <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                    <span className="font-bold text-amber-500 flex items-center gap-1">
                                      <Zap className="h-3.5 w-3.5" />
                                      {renderActiveBonusesLabel(ev)}
                                    </span>
                                    <span className="flex items-center gap-1 font-semibold text-foreground">
                                      <Calendar className="h-3.5 w-3.5 text-primary" />
                                      Período: <b>{formatDateTimeBR(ev.startsAt)}</b> até <b>{formatDateTimeBR(ev.endsAt)}</b>
                                    </span>
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                                      {activeNow ? remaining : "Expirado"}
                                    </span>
                                    {ev.linkedMedalId && (
                                      <span className="font-medium text-primary flex items-center gap-1">
                                        <Award className="h-3.5 w-3.5" />
                                        Medalha vinculada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartEditSpecialEvent(ev)}
                                    className="rounded-xl text-xs h-8 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                    title="Editar evento"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={ev.active ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => handleToggleEventActive(ev.id)}
                                    className="rounded-xl text-xs h-8"
                                  >
                                    {ev.active ? "Desativar" : "Ativar"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEvent(ev.id)}
                                    className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10"
                                    title="Excluir evento"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-ABA 2: EVENTOS RECORRENTES (DIAS DA SEMANA E DATAS ESPECÍFICAS) */}
                {eventosSubTab === "recorrentes" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          if (isCreatingRecurring) {
                            setIsCreatingRecurring(false);
                            setEditingRecurringEventId(null);
                          } else {
                            setEditingRecurringEventId(null);
                            setRecTitle("");
                            setRecDesc("");
                            setRecObjective("");
                            setRecSpecificDates([]);
                            setRecDaysOfWeek([6, 0]);
                            setRecAttachedMedals([]);
                            setIsCreatingRecurring(true);
                          }
                        }}
                        className="rounded-xl font-bold h-9 text-xs"
                      >
                        {isCreatingRecurring ? (editingRecurringEventId ? "Cancelar Edição" : "Fechar Formulário") : "+ Criar Evento Recorrente"}
                      </Button>
                    </div>

                    {isCreatingRecurring && (
                      <form onSubmit={handleCreateRecurringEvent} className="rounded-3xl border-2 border-primary/40 bg-card p-4 space-y-3 animate-in fade-in-50">
                        <h4 className="font-display text-sm font-black text-primary flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" /> {editingRecurringEventId ? `Editar Evento Recorrente: ${recTitle || "Sem título"}` : "Novo Evento Recorrente (Dias da Semana / Datas)"}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Título do Evento Recorrente</Label>
                            <Input
                              value={recTitle}
                              onChange={(e) => setRecTitle(e.target.value)}
                              placeholder="Ex: Fim de Semana Turbinado"
                              className="rounded-xl h-9 text-xs font-semibold"
                              required
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-bold">Escopo (Jogos)</Label>
                            <select
                              value={recScope}
                              onChange={(e) => setRecScope(e.target.value as EventScope)}
                              className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-bold"
                            >
                              <option value="todos">🌟 Todos os Jogos da Plataforma</option>
                              <option value="modo_ranqueado">🏆 Apenas Jogo do Modo Ranqueado (Torneio Semanal)</option>
                              {ALL_GAME_IDS.map((id) => (
                                <option key={id} value={id}>
                                  🎮 Somente: {GAME_NAMES[id]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Descrição</Label>
                          <Input
                            value={recDesc}
                            onChange={(e) => setRecDesc(e.target.value)}
                            placeholder="Ex: Ativação automática todo sábado e domingo com XP em dobro!"
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>

                        {/* Seleção de Dias da Semana */}
                        <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
                          <Label className="text-xs font-bold flex items-center justify-between">
                            <span>Dias da Semana com Ativação Automática</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              Clique para marcar/desmarcar
                            </span>
                          </Label>
                          <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
                            {DAYS_OF_WEEK.map((d) => {
                              const isSelected = recDaysOfWeek.includes(d.value);
                              return (
                                <button
                                  key={d.value}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setRecDaysOfWeek(recDaysOfWeek.filter((w) => w !== d.value));
                                    } else {
                                      setRecDaysOfWeek([...recDaysOfWeek, d.value]);
                                    }
                                  }}
                                  className={`rounded-xl py-2 px-1 text-center font-bold text-xs transition-all ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "border bg-card text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  <div>{d.short}</div>
                                  <div className="text-[9px] opacity-80">{isSelected ? "✓ Ativo" : "-"}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Seleção de Datas Específicas */}
                        <div className="rounded-2xl border bg-secondary/20 p-3 space-y-2">
                          <Label className="text-xs font-bold">Datas Específicas Adicionais (Feriados, Gincanas, etc.)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={recDateInput}
                              onChange={(e) => setRecDateInput(e.target.value)}
                              className="h-9 w-48 rounded-xl text-xs font-semibold bg-background"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (recDateInput && !recSpecificDates.includes(recDateInput)) {
                                  setRecSpecificDates([...recSpecificDates, recDateInput]);
                                  setRecDateInput("");
                                }
                              }}
                              className="h-9 rounded-xl text-xs font-bold"
                            >
                              + Adicionar Data
                            </Button>
                          </div>
                          {recSpecificDates.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {recSpecificDates.map((dt) => (
                                <span
                                  key={dt}
                                  className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-0.5 text-xs font-bold text-primary"
                                >
                                  {formatDateOnlyBR(dt)}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRecSpecificDates(recSpecificDates.filter((d) => d !== dt))
                                    }
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* As 3 Linhas de Bônus para o Evento Recorrente com Caixinhas para Marcar */}
                        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="font-display text-xs font-black uppercase text-amber-500 flex items-center gap-1.5">
                              <Zap className="h-4 w-4" /> Bônus Recorrentes (Marque as caixinhas que deseja ativar)
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              Escolha 1, 2 ou os 3 bônus (opcional se vincular medalha)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* Bônus 1: Multiplicador */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasMultiplier}
                                  onChange={(e) => setRecHasMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  1. Multiplicador de XP
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasMultiplier}
                                  value={recMultiplier}
                                  onChange={(e) => setRecMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% bônus)</option>
                                  <option value={2}>2x (Dobro de XP)</option>
                                  <option value={2.5}>2.5x (+150% bônus)</option>
                                  <option value={3}>3x (Triplo de XP)</option>
                                  <option value={4}>4x (4x de XP)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica o XP das partidas</p>
                              </div>
                            </div>

                            {/* Bônus 2: Teto por Partida */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasMatchCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasMatchCap}
                                  onChange={(e) => setRecHasMatchCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  2. Teto por Partida (XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!recHasMatchCap}
                                  min={10}
                                  max={200}
                                  step={5}
                                  value={recMatchCap}
                                  onChange={(e) => setRecMatchCap(Number(e.target.value))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!recHasMatchCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 30 XP"
                                />
                                <p className="text-[10px] text-muted-foreground">Normal: 20 XP por partida</p>
                              </div>
                            </div>

                            {/* Bônus 3: Adicionar ao Limite Diário Geral */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasDailyCap ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasDailyCap}
                                  onChange={(e) => setRecHasDailyCap(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  3. Limite Diário (+XP)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <Input
                                  type="number"
                                  disabled={!recHasDailyCap}
                                  min={50}
                                  max={5000}
                                  step={50}
                                  value={recDailyExtraXp}
                                  onChange={(e) => setRecDailyExtraXp(Math.max(0, Number(e.target.value)))}
                                  className={`h-8 rounded-lg text-xs font-bold bg-background ${!recHasDailyCap && "opacity-40 cursor-not-allowed"}`}
                                  placeholder="Ex: 500 XP adicionais"
                                />
                                <p className="text-[10px] text-muted-foreground font-semibold">
                                  {recHasDailyCap
                                    ? `Base (1.000 XP) + ${recDailyExtraXp} = ${1000 + recDailyExtraXp} XP/dia`
                                    : "Normal: 1.000 XP/dia"}
                                </p>
                              </div>
                            </div>

                            {/* Bônus 4: Multiplicador na Ranqueada */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasRankedMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasRankedMultiplier}
                                  onChange={(e) => {
                                    setRecHasRankedMultiplier(e.target.checked);
                                  }}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  4. Ranqueada (Pontos)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasRankedMultiplier}
                                  value={recRankedMultiplier}
                                  onChange={(e) => setRecRankedMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasRankedMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos no torneio</p>
                              </div>
                            </div>

                            {/* Bônus 5: Multiplicador de Pontos de Conquista / Moedas */}
                            <div className={`rounded-xl border p-2.5 space-y-2 transition-all ${recHasPointsMultiplier ? "border-amber-500/60 bg-card shadow-xs" : "border-border/60 bg-muted/20 opacity-60"}`}>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={recHasPointsMultiplier}
                                  onChange={(e) => setRecHasPointsMultiplier(e.target.checked)}
                                  className="h-4 w-4 rounded accent-amber-500 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-foreground">
                                  5. Pontos (Moedas)
                                </span>
                              </label>
                              <div className="space-y-1">
                                <select
                                  disabled={!recHasPointsMultiplier}
                                  value={recPointsMultiplier}
                                  onChange={(e) => setRecPointsMultiplier(Number(e.target.value))}
                                  className={`h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold text-amber-500 ${!recHasPointsMultiplier && "opacity-40 cursor-not-allowed"}`}
                                >
                                  <option value={1.5}>1.5x (+50% pontos)</option>
                                  <option value={2}>2x (Dobro de pontos)</option>
                                  <option value={3}>3x (Triplo de pontos)</option>
                                </select>
                                <p className="text-[10px] text-muted-foreground">Multiplica pontos de conquista</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Seção de Medalhas Atribuídas ao Evento Recorrente */}
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h5 className="font-display text-xs font-black uppercase text-primary flex items-center gap-1.5">
                                <Award className="h-4 w-4 text-primary" /> Medalhas do Evento ({recAttachedMedals.length})
                              </h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Crie ou vincule medalhas com metas a serem cumpridas a cada edição deste evento recorrente.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={isAddingMedalToRec ? "secondary" : "default"}
                              onClick={() => setIsAddingMedalToRec(!isAddingMedalToRec)}
                              className="rounded-xl font-bold text-xs h-8"
                            >
                              {isAddingMedalToRec ? "Fechar Seletor" : "+ Adicionar Medalha ao Evento"}
                            </Button>
                          </div>

                          {/* Lista das Medalhas já anexadas ao evento recorrente */}
                          {recAttachedMedals.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {recAttachedMedals.map((m, idx) => {
                                const rarity = RARITY_INFO[m.rarity];
                                return (
                                  <div
                                    key={m.id || idx}
                                    className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                        <div className={rarity.textColor}>
                                          <MedalIcon name={m.iconName} className="h-4 w-4" />
                                        </div>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="truncate font-display text-xs font-black text-foreground">
                                            {m.title}
                                          </span>
                                          <span className={`rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase ${rarity.badgeBgClass}`}>
                                            {rarity.label}
                                          </span>
                                        </div>
                                        <p className="line-clamp-1 text-[10px] text-muted-foreground">
                                          {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setRecAttachedMedals(recAttachedMedals.filter((_, i) => i !== idx))}
                                      className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Remover medalha deste evento"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-primary/20 p-3 text-center text-[11px] text-muted-foreground">
                              Nenhuma medalha vinculada ainda. Clique em <b>"+ Adicionar Medalha ao Evento"</b> para criar novas medalhas com requisitos específicos ou escolher existentes.
                            </div>
                          )}

                          {/* Sub-painel para Adicionar Medalha ao Evento Recorrente */}
                          {isAddingMedalToRec && (
                            <div className="rounded-2xl border bg-card p-3 space-y-3 animate-in fade-in-50">
                              <div className="flex items-center gap-2 border-b pb-2">
                                <button
                                  type="button"
                                  onClick={() => setRecMedalMode("novo")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    recMedalMode === "novo"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  ✨ Criar Nova Medalha
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRecMedalMode("existente")}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                                    recMedalMode === "existente"
                                      ? "bg-primary text-primary-foreground shadow-xs"
                                      : "text-muted-foreground hover:bg-secondary"
                                  }`}
                                >
                                  📂 Utilizar Medalha Existente ({availableExistingEventMedals.length})
                                </button>
                              </div>

                              {recMedalMode === "novo" ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Título da Medalha</Label>
                                      <Input
                                        value={recNewMedalTitle}
                                        onChange={(e) => setRecNewMedalTitle(e.target.value)}
                                        placeholder="Ex: Guerreiro de Fim de Semana"
                                        className="h-8 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Raridade</Label>
                                      <select
                                        value={recNewMedalRarity}
                                        onChange={(e) => setRecNewMedalRarity(e.target.value as MedalRarity)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        <option value="bronze">Bronze</option>
                                        <option value="prata">Prata</option>
                                        <option value="ouro">Ouro</option>
                                        <option value="platina">Platina</option>
                                        <option value="diamante">Diamante</option>
                                        <option value="heroi">Herói</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Requisito do Evento</Label>
                                      <select
                                        value={recNewMedalReqType}
                                        onChange={(e) => {
                                          const t = e.target.value as EventRequirementType;
                                          setRecNewMedalReqType(t);
                                          const opt = EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === t);
                                          if (opt) setRecNewMedalThreshold(opt.defaultVal);
                                        }}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                                      >
                                        {EVENT_REQUIREMENT_OPTIONS.map((opt) => (
                                          <option key={opt.type} value={opt.type}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">Jogo Vinculado</Label>
                                      <select
                                        disabled={["event_x1_wins", "event_distinct_games", "event_daily_cap", "event_team_matches"].includes(recNewMedalReqType)}
                                        value={recNewMedalScope}
                                        onChange={(e) => setRecNewMedalScope(e.target.value as "todos" | GameId)}
                                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold disabled:opacity-50"
                                      >
                                        <option value="todos">🌟 Qualquer Jogo</option>
                                        {ALL_GAME_IDS.map((id) => (
                                          <option key={id} value={id}>
                                            🎮 {GAME_NAMES[id]}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-bold">
                                        Meta ({EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === recNewMedalReqType)?.unit})
                                      </Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={recNewMedalThreshold}
                                        onChange={(e) => setRecNewMedalThreshold(Math.max(1, Number(e.target.value)))}
                                        className="h-8 rounded-lg text-xs font-bold bg-background"
                                      />
                                    </div>
                                  </div>

                                  {/* Ícones Selector Compact */}
                                  <div className="space-y-1">
                                    <Label className="text-[11px] font-bold">Ícone</Label>
                                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto rounded-lg border bg-background p-1.5">
                                      {AVAILABLE_MEDAL_ICONS.map((ic) => (
                                        <button
                                          key={ic}
                                          type="button"
                                          onClick={() => setRecNewMedalIcon(ic)}
                                          className={`grid h-7 w-7 place-items-center rounded-md border transition-all ${
                                            recNewMedalIcon === ic
                                              ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                                              : "hover:bg-secondary text-muted-foreground"
                                          }`}
                                          title={ic}
                                        >
                                          <MedalIcon name={ic} className="h-3.5 w-3.5" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Preview do Requisito */}
                                  <div className="rounded-xl border bg-secondary/30 p-2 text-[11px] text-muted-foreground">
                                    <b>Descrição automática:</b> {formatEventRequirementLabel({
                                      type: recNewMedalReqType,
                                      threshold: recNewMedalThreshold,
                                      gameId: recNewMedalScope === "todos" ? undefined : recNewMedalScope,
                                    })}
                                  </div>

                                  <div className="flex items-center justify-between rounded-xl border bg-card p-2.5">
                                    <div>
                                      <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer" htmlFor="ev-medal-stackable">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        Medalha Empilhável / Cumulativa
                                      </Label>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Alunos podem acumular esta medalha múltiplas vezes com contador no canto superior direito.
                                      </p>
                                    </div>
                                    <input
                                      id="ev-medal-stackable"
                                      type="checkbox"
                                      checked={evNewMedalIsStackable}
                                      onChange={(e) => setEvNewMedalIsStackable(e.target.checked)}
                                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                                    />
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        if (!recNewMedalTitle.trim()) {
                                          flashSaved("Informe o título da medalha.");
                                          return;
                                        }
                                        const req: EventMedalRequirement = {
                                          type: recNewMedalReqType,
                                          threshold: Number(recNewMedalThreshold) || 1,
                                          gameId: recNewMedalScope === "todos" ? undefined : recNewMedalScope,
                                        };
                                        const medalId = `rec_medal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                                        const newM: MedalDefinition = {
                                          id: medalId,
                                          title: recNewMedalTitle.trim(),
                                          description: `${recNewMedalTitle.trim()} — Exclusiva do evento "${recTitle.trim() || "Recorrente"}". ${formatEventRequirementLabel(req)}`,
                                          rarity: recNewMedalRarity,
                                          category: "evento",
                                          iconName: recNewMedalIcon,
                                          condition: {
                                            type: recNewMedalReqType,
                                            threshold: req.threshold,
                                            gameId: req.gameId,
                                          },
                                          isCustom: true,
                                          isStackable: evNewMedalIsStackable,
                                          createdByAdmin: true,
                                          eventName: recTitle.trim() || "Evento Recorrente",
                                          eventRequirement: req,
                                        };
                                        setRecAttachedMedals([...recAttachedMedals, newM]);
                                        setIsAddingMedalToRec(false);
                                        setRecNewMedalTitle("");
                                        flashSaved(`Medalha "${newM.title}" adicionada ao evento recorrente!`);
                                      }}
                                      className="rounded-xl font-bold text-xs h-8 bg-primary"
                                    >
                                      + Adicionar Medalha ao Evento
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Modo Existente para Recorrente */
                                <div className="space-y-3">
                                  {availableExistingEventMedals.length === 0 ? (
                                    <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                                      Nenhuma medalha de evento disponível que não esteja em uso em outro evento ativo. Crie uma nova medalha na aba acima!
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <Label className="text-[11px] font-bold">Selecione uma Medalha Existente</Label>
                                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                        {availableExistingEventMedals.map((m) => {
                                          const rarity = RARITY_INFO[m.rarity];
                                          const isAlreadyAttached = recAttachedMedals.some((a) => a.id === m.id);
                                          return (
                                            <div
                                              key={m.id}
                                              className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-colors ${
                                                isAlreadyAttached ? "opacity-40 bg-muted" : "bg-card hover:border-primary"
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                                                  <div className={rarity.textColor}>
                                                    <MedalIcon name={m.iconName} className="h-3.5 w-3.5" />
                                                  </div>
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="font-bold truncate">{m.title}</span>
                                                    <span className={`text-[8px] font-extrabold uppercase px-1 rounded ${rarity.badgeBgClass}`}>
                                                      {rarity.label}
                                                    </span>
                                                  </div>
                                                  <p className="text-[10px] text-muted-foreground truncate">
                                                    {m.eventRequirement ? formatEventRequirementLabel(m.eventRequirement) : m.description}
                                                  </p>
                                                </div>
                                              </div>
                                              <Button
                                                type="button"
                                                size="sm"
                                                disabled={isAlreadyAttached}
                                                onClick={() => {
                                                  const cloned: MedalDefinition = {
                                                    ...m,
                                                    eventName: recTitle.trim() || m.eventName || "Evento Recorrente",
                                                    description: m.description.includes("—")
                                                      ? m.description
                                                      : `${m.title} — Exclusiva do evento "${recTitle.trim() || "Recorrente"}". ${m.description}`,
                                                  };
                                                  setRecAttachedMedals([...recAttachedMedals, cloned]);
                                                  setIsAddingMedalToRec(false);
                                                  flashSaved(`Medalha "${m.title}" vinculada ao evento recorrente!`);
                                                }}
                                                className="rounded-lg text-[10px] font-bold h-7 px-2"
                                              >
                                                {isAlreadyAttached ? "Já Vinculada" : "+ Vincular"}
                                              </Button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingRecurring(false);
                              setEditingRecurringEventId(null);
                            }}
                            className="rounded-xl text-xs"
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" size="sm" className="rounded-xl font-bold text-xs bg-primary">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {editingRecurringEventId ? "Salvar Alterações" : "Salvar Evento Recorrente"}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Lista de Eventos Recorrentes Cadastrados */}
                    <div className="space-y-2">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Eventos Recorrentes Cadastrados ({recurringEvents.length})
                      </h4>

                      {recurringEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          Nenhum evento recorrente configurado. Crie um evento para ser ativado automaticamente nos fins de semana ou dias específicos.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {recurringEvents.map((ev) => {
                            const activeToday = isRecurringEventActive(ev);
                            const dayLabels = (ev.daysOfWeek ?? [])
                              .map((w) => DAYS_OF_WEEK.find((d) => d.value === w)?.short ?? String(w))
                              .join(", ");
                            return (
                              <div
                                key={ev.id}
                                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                                  activeToday
                                    ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm"
                                    : "border-border/60 bg-muted/20 opacity-80"
                                }`}
                              >
                                <div className="min-w-0 space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                        activeToday
                                          ? "bg-emerald-500 text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {activeToday ? "✓ ATIVO HOJE" : "AGUARDANDO DIA PROGRAMADO"}
                                    </span>
                                    <h5 className="font-display text-sm font-black text-foreground truncate">
                                      {ev.title}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleRecurringScope(ev.id)}
                                      title="Clique para alternar o escopo do evento (Todos os Jogos ⇄ Apenas Ranqueada)"
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-all border hover:scale-105 ${
                                        ev.scope === "modo_ranqueado"
                                          ? "bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30"
                                          : "bg-secondary text-muted-foreground border-border/60 hover:text-foreground"
                                      }`}
                                    >
                                      {formatEventScopeText(ev.scope)} ⇄
                                    </button>
                                  </div>

                                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                                    {dayLabels && (
                                      <span>
                                        Dias: <b>{dayLabels}</b>
                                      </span>
                                    )}
                                    {ev.specificDates?.length > 0 && (
                                      <span>
                                        Datas: <b>{ev.specificDates.map(formatDateOnlyBR).join(", ")}</b>
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                    <span className="font-bold text-amber-500 flex items-center gap-1">
                                      <Zap className="h-3.5 w-3.5" />
                                      {renderActiveBonusesLabel(ev)}
                                    </span>
                                    {ev.linkedMedalId && (
                                      <span className="font-medium text-primary flex items-center gap-1">
                                        <Award className="h-3.5 w-3.5" />
                                        Medalha vinculada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartEditRecurringEvent(ev)}
                                    className="rounded-xl text-xs h-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    title="Editar evento recorrente"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={ev.active ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => handleToggleRecurringActive(ev.id)}
                                    className="rounded-xl text-xs h-8"
                                  >
                                    {ev.active ? "Desativar" : "Ativar"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRecurringEvent(ev.id)}
                                    className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10"
                                    title="Excluir evento recorrente"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: QUADRO DE AVISOS & DESTAQUES */}
            {tab === "avisos" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-secondary/30 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Sparkles className="h-5 w-5 text-primary" /> Quadro de Avisos & Destaques
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gerencie os informativos, destaques de jogos e novidades que aparecem no slide da página inicial para todos os alunos.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                      {(draft.noticeSlides || []).filter((s) => s.active).length} aviso(s) personalizado(s)
                    </span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-foreground">
                      {draft.hideAllDefaultNotices
                        ? "Avisos padrão: Pausados"
                        : `${
                            SYSTEM_DEFAULT_NOTICES.filter(
                              (n) => (draft.enabledDefaultNotices ?? DEFAULT_ENABLED_DEFAULT_NOTICES)[n.id] !== false
                            ).length
                          }/3 padrão ativos`}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        draft.pauseNoticeBoard
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {draft.pauseNoticeBoard ? "⏸️ Carrossel Pausado" : "▶️ Carrossel Ativo (7s)"}
                    </span>
                  </div>
                </div>

                {/* Controles Globais do Carrossel */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <h4 className="font-display text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" /> Controles Globais de Exibição
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-secondary/20 p-3">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-display text-xs font-bold text-foreground block">
                          Pausar Rotação Automática
                        </span>
                        <span className="text-[11px] text-muted-foreground block line-clamp-1">
                          Mantém o slide fixo sem avançar a cada 7 segundos
                        </span>
                      </div>
                      <Switch
                        checked={Boolean(draft.pauseNoticeBoard)}
                        onCheckedChange={async (checked) => {
                          const nextCfg = { ...draft, pauseNoticeBoard: checked };
                          setDraft(nextCfg);
                          await auth.updateAdminConfig(nextCfg);
                          onConfigSaved?.();
                          flashSaved(
                            checked
                              ? "⏸️ Rotação automática do quadro de avisos pausada!"
                              : "▶️ Rotação automática reativada a cada 7 segundos!"
                          );
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-secondary/20 p-3">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-display text-xs font-bold text-foreground block">
                          Ocultar Todos os Avisos Padrão
                        </span>
                        <span className="text-[11px] text-muted-foreground block line-clamp-1">
                          Exibe exclusivamente os avisos personalizados que você criar
                        </span>
                      </div>
                      <Switch
                        checked={Boolean(draft.hideAllDefaultNotices)}
                        onCheckedChange={async (checked) => {
                          const nextCfg = { ...draft, hideAllDefaultNotices: checked };
                          setDraft(nextCfg);
                          await auth.updateAdminConfig(nextCfg);
                          onConfigSaved?.();
                          flashSaved(
                            checked
                              ? "🚫 Todos os avisos padrão foram ocultados da página inicial!"
                              : "✅ Avisos padrão restabelecidos na página inicial!"
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Avisos Padrão do Sistema (Controle Individual: Marcar / Desmarcar) */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-extrabold text-foreground flex items-center gap-2">
                        <span>📌 Avisos Padrão da Plataforma (3 Disponíveis)</span>
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Marque ou desmarque individualmente quais avisos padrão deseja exibir ou ocultar no carrossel.
                      </p>
                    </div>
                    {draft.hideAllDefaultNotices && (
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                        Pausados Globalmente
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {SYSTEM_DEFAULT_NOTICES.map((notice) => {
                      const currentMap = draft.enabledDefaultNotices ?? DEFAULT_ENABLED_DEFAULT_NOTICES;
                      const isEnabled = currentMap[notice.id] !== false && !draft.hideAllDefaultNotices;
                      const isIndividuallyActive = currentMap[notice.id] !== false;

                      return (
                        <div
                          key={notice.id}
                          className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                            isEnabled
                              ? "bg-secondary/40 border-primary/40 shadow-xs"
                              : "bg-muted/30 border-dashed opacity-60"
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase text-primary">
                                {notice.badgeLabel}
                              </span>
                              <span
                                className={`text-[10px] font-bold ${
                                  isIndividuallyActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                }`}
                              >
                                {isIndividuallyActive ? "Marcado" : "Desmarcado"}
                              </span>
                            </div>
                            <h5 className="font-display text-xs font-bold text-foreground">
                              {notice.title}
                            </h5>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {notice.description}
                            </p>
                          </div>

                          <div className="pt-3 mt-2 border-t flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {isEnabled ? "Exibindo na Home" : "Oculto na Home"}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant={isIndividuallyActive ? "outline" : "default"}
                              onClick={async () => {
                                const nextMap = {
                                  ...DEFAULT_ENABLED_DEFAULT_NOTICES,
                                  ...currentMap,
                                  [notice.id]: !isIndividuallyActive,
                                };
                                const nextCfg = { ...draft, enabledDefaultNotices: nextMap };
                                setDraft(nextCfg);
                                await auth.updateAdminConfig(nextCfg);
                                onConfigSaved?.();
                                flashSaved(
                                  !isIndividuallyActive
                                    ? `✅ "${notice.title}" ativado no carrossel e salvo na nuvem!`
                                    : `🚫 "${notice.title}" desmarcado e ocultado!`
                                );
                              }}
                              className="rounded-xl text-xs h-7 px-2.5 font-bold cursor-pointer"
                            >
                              {isIndividuallyActive ? (
                                <>
                                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Desmarcar
                                </>
                              ) : (
                                <>
                                  <Eye className="h-3.5 w-3.5 mr-1" /> Marcar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Formulário de Criação de Novo Aviso com Envio Imediato para PlayFab */}
                <div className="rounded-2xl border bg-card p-4 space-y-3.5">
                  <h4 className="font-display text-sm font-extrabold text-foreground flex items-center gap-2">
                    <span>➕ Criar Novo Aviso Personalizado (Salva Imediatamente na Nuvem)</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground">Título do Aviso:</label>
                      <input
                        type="text"
                        value={newNoticeTitle}
                        onChange={(e) => setNewNoticeTitle(e.target.value)}
                        placeholder="Ex: Conheça o novo jogo da plataforma!"
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground">Tag / Etiqueta do Slide:</label>
                      <input
                        type="text"
                        value={newNoticeBadge}
                        onChange={(e) => setNewNoticeBadge(e.target.value)}
                        placeholder="Ex: NOVIDADE, DESTAQUE, DESAFIO, FEIRA"
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-medium uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground">Mensagem / Descrição:</label>
                    <textarea
                      rows={2}
                      value={newNoticeMsg}
                      onChange={(e) => setNewNoticeMsg(e.target.value)}
                      placeholder="Descreva a novidade ou as instruções do desafio para os jogadores..."
                      className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground">Tipo de Destaque:</label>
                      <select
                        value={newNoticeType}
                        onChange={(e) =>
                          setNewNoticeType(e.target.value as "announcement" | "game_highlight" | "event_challenge")
                        }
                        className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="announcement">📢 Comunicado / Aviso Geral</option>
                        <option value="game_highlight">🎮 Jogo em Destaque (Botão direto de Jogar)</option>
                        <option value="event_challenge">🏆 Desafio Especial (Com Medalha)</option>
                      </select>
                    </div>

                    {newNoticeType === "game_highlight" && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-foreground">Selecione o Jogo em Destaque:</label>
                        <select
                          value={newNoticeGame}
                          onChange={(e) => setNewNoticeGame(e.target.value as GameId)}
                          className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {ALL_GAME_IDS.map((id) => (
                            <option key={id} value={id}>
                              {GAME_NAMES[id] || id}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {newNoticeType === "event_challenge" && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-foreground">Vincular Medalha de Recompensa (Opcional):</label>
                        <select
                          value={newNoticeMedal}
                          onChange={(e) => setNewNoticeMedal(e.target.value)}
                          className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Nenhuma medalha vinculada</option>
                          {getAllAvailableMedals(draft.customMedals).map((m) => (
                            <option key={m.id} value={m.id}>
                              🏅 {m.title} ({RARITY_INFO[m.rarity]?.label})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Configuração do Tempo de Duração do Slide em Segundos */}
                  <div className="space-y-1.5 rounded-xl border bg-secondary/30 p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" /> Tempo de Exibição deste Aviso (segundos):
                      </label>
                      <span className="font-mono text-xs font-black text-primary">
                        {newNoticeDuration}s
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={120}
                        step={1}
                        value={newNoticeDuration}
                        onChange={(e) =>
                          setNewNoticeDuration(Math.max(2, Math.min(120, Number(e.target.value) || 7)))
                        }
                        className="h-8 w-24 rounded-lg border bg-background px-2.5 text-xs font-bold font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex flex-wrap gap-1">
                        {[4, 6, 8, 10, 15, 20].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setNewNoticeDuration(sec)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                              newNoticeDuration === sec
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "bg-card border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Digite ou selecione quantos segundos este aviso vai ficar disponível na tela até pular para o próximo slide.
                    </p>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      disabled={!newNoticeTitle.trim() || !newNoticeMsg.trim()}
                      onClick={async () => {
                        const durationVal = Math.max(2, Math.min(120, Number(newNoticeDuration) || 7));
                        const slide: PlatformNoticeSlide = {
                          id: `notice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          title: newNoticeTitle.trim(),
                          message: newNoticeMsg.trim(),
                          badgeLabel: newNoticeBadge.trim() || "AVISO",
                          type: newNoticeType,
                          featuredGameId: newNoticeType === "game_highlight" ? newNoticeGame : null,
                          linkedMedalId: newNoticeType === "event_challenge" && newNoticeMedal ? newNoticeMedal : null,
                          durationSeconds: durationVal,
                          active: true,
                          createdAt: new Date().toISOString(),
                        };
                        const nextSlides = [...(draft.noticeSlides || []), slide];
                        const nextCfg: PlatformAdminConfig = { ...draft, noticeSlides: nextSlides };
                        setDraft(nextCfg);
                        await auth.updateAdminConfig(nextCfg);
                        onConfigSaved?.();
                        setNewNoticeTitle("");
                        setNewNoticeMsg("");
                        setNewNoticeBadge("NOVIDADE");
                        setNewNoticeMedal("");
                        setNewNoticeDuration(7);
                        flashSaved(
                          isPlayFabConfigured()
                            ? "✅ Novo aviso publicado no Quadro de Avisos e sincronizado com o PlayFab!"
                            : "💾 Novo aviso salvo no Quadro de Avisos localmente!"
                        );
                      }}
                      className="rounded-xl px-4 py-2 font-display text-xs font-extrabold cursor-pointer"
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Publicar no Quadro de Avisos
                    </Button>
                  </div>
                </div>

                {/* Lista de Avisos Personalizados Cadastrados */}
                <div className="space-y-2">
                  <h4 className="font-display text-sm font-extrabold text-foreground">
                    Avisos Personalizados Cadastrados ({(draft.noticeSlides || []).length})
                  </h4>

                  {(!draft.noticeSlides || draft.noticeSlides.length === 0) ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                      Nenhum aviso personalizado cadastrado ainda. Use o formulário acima para criar comunicados, jogos em destaque ou desafios de medalhas.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {draft.noticeSlides.map((slide) => (
                        <div
                          key={slide.id}
                          className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all ${
                            slide.active ? "bg-card border-primary/30" : "bg-muted/40 border-dashed opacity-60"
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-primary px-2 py-0.2 text-[9px] font-black uppercase text-primary-foreground">
                                {slide.badgeLabel || "AVISO"}
                              </span>
                              <span className="font-display text-sm font-extrabold text-foreground truncate">
                                {slide.title}
                              </span>
                              {!slide.active && (
                                <span className="rounded-full bg-muted px-2 py-0.2 text-[9px] font-bold text-muted-foreground">
                                  Inativo
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">{slide.message}</p>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                              <span className="inline-flex items-center gap-1 text-primary font-bold">
                                ⏱️ Duração: {slide.durationSeconds ?? 7}s
                              </span>
                              {slide.featuredGameId && (
                                <span className="text-primary font-bold">
                                  🎮 Jogo: {GAME_NAMES[slide.featuredGameId] || slide.featuredGameId}
                                </span>
                              )}
                              {slide.linkedMedalId && (
                                <span className="text-amber-500 font-bold">
                                  🏅 Medalha Vinculada ({slide.linkedMedalId})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 rounded-lg border bg-background/80 px-2 py-1">
                              <span className="text-[10px] font-bold text-muted-foreground">Tempo:</span>
                              <input
                                type="number"
                                min={2}
                                max={120}
                                value={slide.durationSeconds ?? 7}
                                onChange={async (e) => {
                                  const val = Math.max(2, Math.min(120, Number(e.target.value) || 7));
                                  const next = (draft.noticeSlides || []).map((s) =>
                                    s.id === slide.id ? { ...s, durationSeconds: val } : s
                                  );
                                  const nextCfg: PlatformAdminConfig = { ...draft, noticeSlides: next };
                                  setDraft(nextCfg);
                                  await auth.updateAdminConfig(nextCfg);
                                  onConfigSaved?.();
                                }}
                                className="h-6 w-12 rounded border bg-background px-1 text-[11px] font-mono font-bold text-center"
                                title="Editar duração deste aviso em segundos"
                              />
                              <span className="text-[10px] font-bold text-muted-foreground">s</span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const next = (draft.noticeSlides || []).map((s) =>
                                  s.id === slide.id ? { ...s, active: !s.active } : s
                                );
                                const nextCfg: PlatformAdminConfig = { ...draft, noticeSlides: next };
                                setDraft(nextCfg);
                                await auth.updateAdminConfig(nextCfg);
                                onConfigSaved?.();
                                flashSaved(
                                  slide.active
                                    ? "🚫 Aviso desativado e sincronizado!"
                                    : "✅ Aviso ativado e sincronizado!"
                                );
                              }}
                              className="rounded-xl text-xs h-8 cursor-pointer"
                            >
                              {slide.active ? "Desativar" : "Ativar"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const next = (draft.noticeSlides || []).filter((s) => s.id !== slide.id);
                                const nextCfg: PlatformAdminConfig = { ...draft, noticeSlides: next };
                                setDraft(nextCfg);
                                await auth.updateAdminConfig(nextCfg);
                                onConfigSaved?.();
                                flashSaved("🗑️ Aviso excluído e sincronizado com o PlayFab!");
                              }}
                              className="rounded-xl text-xs h-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                              title="Excluir aviso"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botão de Garantia de Sincronização Geral */}
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    onClick={async () => {
                      await auth.updateAdminConfig(draft);
                      onConfigSaved?.();
                      flashSaved(
                        isPlayFabConfigured()
                          ? "✅ Configuração completa do Quadro de Avisos sincronizada no PlayFab!"
                          : "💾 Configuração salva localmente!"
                      );
                    }}
                    className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                  >
                    <Save className="h-4 w-4" /> Salvar Configurações do Quadro de Avisos na Nuvem
                  </Button>
                </div>
              </div>
            )}

            {/* TAB: CORREIO & TRANSMISSÃO DE MENSAGENS */}
            {tab === "correio" && (
              <AdminInboxTab
                registeredStudents={registeredStudents}
                onBroadcastSent={(msg) => flashSaved(msg)}
              />
            )}

            {/* TAB 4: GESTÃO DE TURMAS & ESCOLAS (2 SUB-ABAS) */}
            {tab === "turmas" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-secondary/30 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <School className="h-5 w-5 text-primary" /> Turmas & Escolas da Rede SEMED
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Acesse alunos por escola e turma ou gerencie as solicitações de mudança de turma.
                    </p>
                  </div>

                  {/* Alternador das 2 Sub-abas e Botão de Sincronizar Nuvem */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshRoster}
                      disabled={syncingRoster}
                      className="rounded-xl font-bold gap-1.5 text-xs h-9"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${syncingRoster ? "animate-spin text-primary" : "text-muted-foreground"}`}
                      />
                      {syncingRoster ? "Sincronizando..." : "Sincronizar Nuvem"}
                    </Button>

                    <div className="flex items-center gap-1 rounded-xl bg-background border p-1">
                      <button
                        type="button"
                        onClick={() => setTurmaSubTab("visao")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          turmaSubTab === "visao"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Users className="inline mr-1 h-3.5 w-3.5" /> 1. Escolas & Turmas
                      </button>
                      <button
                        type="button"
                        onClick={() => setTurmaSubTab("solicitacoes")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          turmaSubTab === "solicitacoes"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <UserCheck className="inline mr-1 h-3.5 w-3.5" /> 2. Solicitações de Troca
                        {pendingTurmaCount > 0 && (
                          <span className="ml-1.5 rounded-full bg-accent text-accent-foreground px-1.5 py-0.2 text-[9px] font-black">
                            {pendingTurmaCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SUB-ABA 1: VISÃO POR ESCOLAS & TURMAS */}
                {turmaSubTab === "visao" && (
                  <div className="space-y-4">
                    {/* Seletor de Instituições e Escolas */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground uppercase">
                        Selecione a Instituição:
                      </Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2">
                        {/* Bloco Geral: Todas as Instituições / Escolas */}
                        {(() => {
                          const active = selectedAdminSchool === "TODAS";
                          return (
                            <button
                              key="TODAS"
                              type="button"
                              onClick={() => setSelectedAdminSchool("TODAS")}
                              className={`rounded-xl border p-2.5 text-left transition-all ${
                                active
                                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                  : "border-border bg-card hover:bg-secondary/40"
                              }`}
                            >
                              <div className="font-display text-xs font-black truncate text-foreground flex items-center gap-1">
                                <span>Todas</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                                {registeredStudents.length} aluno(s)
                              </div>
                            </button>
                          );
                        })()}
                        {SCHOOLS.map((s) => {
                          const active = selectedAdminSchool === s.name;
                          const schoolStudents = registeredStudents.filter((st) => st.school === s.name);
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => setSelectedAdminSchool(s.name)}
                              className={`rounded-xl border p-2.5 text-left transition-all ${
                                active
                                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                  : "border-border bg-card hover:bg-secondary/40"
                              }`}
                            >
                              <div className="font-display text-xs font-black truncate text-foreground">
                                {s.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {schoolStudents.length} aluno(s)
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Seletor de Turma (A - F + TODAS) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground uppercase">
                        Filtrar Turma ({selectedAdminSchool === "TODAS" ? "Todas as Escolas" : selectedAdminSchool}):
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedAdminTurma("TODAS")}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                            selectedAdminTurma === "TODAS"
                              ? "border-primary bg-primary text-primary-foreground shadow-xs"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          Todas as Turmas
                        </button>
                        {VALID_TURMAS.map((t: TurmaCode) => {
                          const active = selectedAdminTurma === t;
                          const countInTurma = registeredStudents.filter(
                            (st) =>
                              (selectedAdminSchool === "TODAS" || st.school === selectedAdminSchool) &&
                              st.turma === t,
                          ).length;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setSelectedAdminTurma(t)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                                active
                                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                  : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
                              }`}
                            >
                              Turma {t} ({countInTurma})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Lista dos Alunos Encontrados */}
                    {(() => {
                      const filtered = registeredStudents.filter((st) => {
                        const matchSchool =
                          selectedAdminSchool === "TODAS" || st.school === selectedAdminSchool;
                        const matchTurma =
                          selectedAdminTurma === "TODAS" || st.turma === selectedAdminTurma;
                        return matchSchool && matchTurma;
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                            Nenhum aluno cadastrado nesta escola e turma ainda.
                          </div>
                        );
                      }

                      const presenceSummary = computePresenceSummary(filtered);

                      return (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-muted-foreground">
                              Exibindo {filtered.length} aluno(s) de {selectedAdminSchool === "TODAS" ? "Todas as Escolas" : selectedAdminSchool}
                              {selectedAdminTurma !== "TODAS" ? ` • Turma ${selectedAdminTurma}` : ""}:
                            </div>

                            {/* Indicadores de Presenca Online / Inativo / Offline para o ADM */}
                            <div className="flex items-center gap-2.5 rounded-lg border bg-secondary/30 px-2.5 py-1 text-[11px] font-bold">
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Alunos ativos interagindo nos ultimos 5 minutos">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.9)]" />
                                {presenceSummary.online} Online
                              </span>
                              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400" title="Alunos conectados sem interacao entre 5 e 10 minutos">
                                <span className="h-2 w-2 rounded-full bg-slate-400" />
                                {presenceSummary.idle} Inativo
                              </span>
                              <span className="flex items-center gap-1 text-rose-500" title="Alunos desconectados ou sem interacao ha mais de 10 minutos">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                {presenceSummary.offline} Offline
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                            {filtered.map((st) => {
                              const stEff = getEffectivePlayerProgression(
                                st,
                                st.stats ?? [],
                                auth.adminConfig.enabledGames,
                              );
                              const stProg = levelProgress({
                                xp: stEff.xp,
                                matchesPlayed: stEff.matchesPlayed,
                                wins: stEff.wins,
                                distinctGames: stEff.distinctGames,
                                currentLevel: stEff.level,
                                stageProgress: stEff.stageProgress,
                                maxAvailableGames: stEff.maxAvailableGames,
                              });

                              return (
                                <div
                                  key={st.id}
                                  onClick={() => setInspectStudentId(st.id)}
                                  className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3.5 cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.01]"
                                  title="Clique para inspecionar perfil, requisitos pendentes de nível e medalhas deste aluno"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-display text-sm font-black text-foreground truncate">
                                        {st.nick}
                                      </span>
                                      <PresenceDot
                                        playerId={st.id}
                                        playfabId={st.playfabId}
                                        nick={st.nick}
                                        nickNormalized={st.nickNormalized}
                                        size="xs"
                                      />
                                      <span className="rounded-full bg-primary/15 px-2 py-0.2 text-[10px] font-bold text-primary">
                                        Nv. {stProg.level}
                                      </span>
                                      {stProg.isLockedByMissions && (
                                        <span
                                          className="rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-600 dark:text-amber-400"
                                          title={`XP atingido (${st.xp} XP), mas faltam missões para destravar o Nível ${stProg.nextRequirement?.level}`}
                                        >
                                          🔒 Faltam missões (Nv. {stProg.nextRequirement?.level})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground uppercase truncate mt-0.5">
                                      {st.full_name}
                                    </div>
                                    {(selectedAdminSchool === "TODAS" ||
                                      Boolean(
                                        st.turma &&
                                          st.grade &&
                                          st.school &&
                                          st.school !== "Nenhuma" &&
                                          st.school !== "Outro"
                                      )) && (
                                      <div className="text-[11px] text-muted-foreground mt-0.5 font-semibold truncate">
                                        {selectedAdminSchool === "TODAS" && (
                                          <span className="font-bold text-primary mr-1.5">
                                            🏫 {st.school || "Sem escola"}
                                          </span>
                                        )}
                                        {st.grade ? `${st.grade} ` : ""}
                                        {st.turma ? `Turma ${st.turma}` : ""}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="font-display text-sm font-extrabold text-primary">
                                      {st.xp} XP
                                    </div>
                                    <span className="text-[10px] text-primary flex items-center justify-end gap-0.5 mt-0.5 font-bold">
                                      Ver perfil <ChevronRight className="h-3 w-3" />
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* SUB-ABA 2: SOLICITAÇÕES DE TROCA DE TURMA */}
                {turmaSubTab === "solicitacoes" && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Alunos que solicitaram mudar de turma (Turmas A até F). Ao aprovar, o perfil do aluno é atualizado automaticamente.
                    </p>

                    {turmaRequests.length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                        Nenhuma solicitação de troca de turma registrada no momento.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {turmaRequests.map((req) => (
                          <div
                            key={req.id}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                              req.status === "pendente"
                                ? "border-primary/50 bg-primary/5"
                                : req.status === "aprovada"
                                ? "border-success/30 bg-success/5"
                                : "border-border/40 bg-muted/20 opacity-70"
                            }`}
                          >
                            <div className="min-w-0 space-y-1 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                    req.status === "pendente"
                                      ? "bg-primary text-primary-foreground"
                                      : req.status === "aprovada"
                                      ? "bg-success text-success-foreground"
                                      : "bg-destructive text-destructive-foreground"
                                  }`}
                                >
                                  {req.status.toUpperCase()}
                                </span>
                                <span className="font-display text-sm font-black text-foreground">
                                  {req.playerNick}
                                </span>
                                <span className="text-xs text-muted-foreground uppercase">
                                  ({req.playerFullName})
                                </span>
                              </div>

                              <div className="text-xs text-muted-foreground">
                                Escola: <b>{req.school}</b> {req.grade ? `• ${req.grade}` : ""}
                              </div>

                              <div className="flex items-center gap-2 pt-1 font-display text-xs">
                                <span className="rounded-lg bg-card border px-2 py-0.5 text-muted-foreground font-bold">
                                  Turma Atual: {req.currentTurma ? `Turma ${req.currentTurma}` : "Nenhuma"}
                                </span>
                                <span className="text-primary font-bold">➔</span>
                                <span className="rounded-lg bg-primary/20 border border-primary/40 px-2.5 py-0.5 font-black text-primary">
                                  Nova Turma Solicitada: Turma {req.requestedTurma}
                                </span>
                              </div>

                              <p className="text-[10px] text-muted-foreground pt-0.5">
                                Solicitado em: {new Date(req.requestedAt).toLocaleString("pt-BR")}
                              </p>
                            </div>

                            {req.status === "pendente" && (
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleApproveTurma(req.id)}
                              className="rounded-xl text-xs font-bold bg-success hover:bg-success/90 text-white h-9"
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Aprovar Troca
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleRejectTurma(req.id)}
                              className="rounded-xl text-xs text-destructive hover:bg-destructive/10 h-9"
                            >
                              Recusar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

            {/* TAB 2: RESETS PERIÓDICOS & GESTÃO DE TEMPORADAS (CONTAINERS SEPARADOS) */}
            {tab === "resets" && (
              <div className="space-y-6">
                {/* ========================================================= */}
                {/* CONTAINER 1: TEMPORADA DE ATIVIDADES (GERAL & FASE BETA)  */}
                {/* ========================================================= */}
                <div className="rounded-3xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-card to-purple-500/5 p-5 space-y-4 shadow-sm">
                  {/* Cabeçalho do Bloco 1 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-base font-black text-foreground">
                            1. Temporada de Atividades (Geral & Nível)
                          </h2>
                          {draft.isBetaActive !== false ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
                              <Beaker className="h-3 w-3" /> FASE BETA ATIVA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> TEMPORADA REGULAR
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {draft.isBetaActive !== false
                            ? "Fase Beta em andamento • Encerramento previsto para domingo, 15/11/2026 às 23:59:59"
                            : "Ciclo padrão bimestral (2 meses / 60 dias) de evolução de atividades e níveis"}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold text-muted-foreground bg-secondary/50 rounded-xl px-3 py-1.5 border">
                      Temporada #{draft.activitySeasonId ?? 1}
                    </div>
                  </div>

                  {/* Nome da Temporada de Atividades */}
                  <div className="space-y-1.5">
                    <Label htmlFor="activity-season-name-input" className="text-xs font-bold text-muted-foreground">
                      Nome da Temporada de Atividades
                    </Label>
                    <Input
                      id="activity-season-name-input"
                      value={activitySeasonName}
                      onChange={(e) => setActivitySeasonName(e.target.value)}
                      placeholder="Ex: Temporada 1 Beta • SEMED Coari"
                      className="rounded-xl font-display font-bold text-sm bg-background"
                    />
                  </div>

                  {/* Barra de Progresso Visual */}
                  <div className="rounded-2xl border bg-background/80 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-muted-foreground">
                        {activitySeasonProgress.formattedRangeLabel}
                      </span>
                      <span className={`font-mono font-black ${activitySeasonProgress.isExpired ? "text-rose-500" : "text-indigo-600 dark:text-indigo-400"}`}>
                        {activitySeasonProgress.formattedCountdown}
                      </span>
                    </div>

                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted border border-border/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          activitySeasonProgress.isExpired
                            ? "bg-rose-500"
                            : "bg-gradient-to-r from-indigo-500 to-purple-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, activitySeasonProgress.progressPercent))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Dia {activitySeasonProgress.elapsedDays} de {activitySeasonProgress.totalDays}</span>
                      <span>{Math.round(activitySeasonProgress.progressPercent)}% decorrido</span>
                    </div>
                  </div>

                  {/* Regras e Diretrizes do Reset de Atividades */}
                  <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2 text-xs">
                    <div className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                      <Info className="h-4 w-4" /> Diretrizes e Regras de Reset da Temporada de Atividades
                    </div>
                    {draft.isBetaActive !== false ? (
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground leading-relaxed">
                        <li>
                          <b className="text-foreground">Fase Beta finaliza em 15/11 às 23:59:59:</b> No reset do Beta, todos os níveis e XPs voltam para 1 (0 XP).
                        </li>
                        <li>
                          <b className="text-foreground">Revogação de 120 medalhas de atividades:</b> As medalhas de jogos e níveis são retiradas para permitir novos pioneiros na temporada seguinte.
                        </li>
                        <li>
                          <b className="text-foreground">25 Medalhas Especiais Preservadas:</b> Apenas medalhas Beta Tester, Robôs Raros (Ametista, Rubi, Safira, etc.), Streaks de Login e pioneiros de nível são mantidas permanentemente.
                        </li>
                        <li>
                          <b className="text-foreground">Conversão de Pontos em Moedas:</b> Todo saldo de pontos dos alunos é convertido em Moedas de Cosméticos. A pontuação histórica no ranking (<code className="font-mono text-[11px]">careerPoints</code>) nunca é perdida!
                        </li>
                      </ul>
                    ) : (
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground leading-relaxed">
                        <li>
                          <b className="text-foreground">Temporadas Oficiais Regulares (2 Meses / 60 Dias):</b> As medalhas conquistadas NÃO são mais removidas; passam a ser acumuladas definitivamente no perfil.
                        </li>
                        <li>
                          <b className="text-foreground">Reset de Nível & XP:</b> A cada 2 meses, os níveis reiniciam em 1 para estimular novo avanço educacional.
                        </li>
                        <li>
                          <b className="text-foreground">Conversão em Moedas:</b> O saldo de pontos é convertido em moedas de cosméticos para gastar na loja do jogo.
                        </li>
                      </ul>
                    )}
                  </div>

                  {/* Configuração de Duração e Datas */}
                  <div className="space-y-3 pt-1">
                    <Label className="text-xs font-bold text-foreground">
                      Duração Padrão da Temporada de Atividades
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[30, 60, 90].map((days) => {
                        const isSelected = activityDurationDays === days;
                        return (
                          <button
                            key={days}
                            type="button"
                            onClick={() => handleSelectActivityPreset(days)}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/30 shadow-xs"
                                : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            }`}
                          >
                            <span className="font-display text-base font-black">
                              {days === 30 ? "🗓️ 30 Dias" : days === 60 ? "⭐ 60 Dias" : "📅 90 Dias"}
                            </span>
                            <span className="text-[10px] font-semibold mt-0.5">
                              {days === 30 ? "Mensal" : days === 60 ? "Bimestral (Padrão)" : "Trimestral"}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setActivityDurationDays(-1)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                          ![30, 60, 90].includes(activityDurationDays)
                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/30 shadow-xs"
                            : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        <span className="font-display text-base font-black">✏️ Livre</span>
                        <span className="text-[10px] font-semibold mt-0.5">Personalizado</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="act-season-start" className="text-xs font-bold text-muted-foreground">
                          Data e Hora de Início
                        </Label>
                        <Input
                          id="act-season-start"
                          type="datetime-local"
                          value={activityStartInput}
                          onChange={(e) => setActivityStartInput(e.target.value)}
                          className="rounded-xl font-mono text-xs bg-background"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="act-season-end" className="text-xs font-bold text-muted-foreground">
                          Data e Hora de Encerramento
                        </Label>
                        <Input
                          id="act-season-end"
                          type="datetime-local"
                          value={activityEndInput}
                          onChange={(e) => setActivityEndInput(e.target.value)}
                          className="rounded-xl font-mono text-xs bg-background"
                        />
                      </div>
                    </div>

                    {/* Extensão rápida da Temporada de Atividades */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/20 p-3">
                      <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        <FastForward className="h-4 w-4 text-indigo-500" />
                        Estender término da temporada de atividades:
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendActivityDays(7)}
                          className="rounded-xl text-xs font-bold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                        >
                          +7 Dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendActivityDays(14)}
                          className="rounded-xl text-xs font-bold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                        >
                          +14 Dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendActivityDays(30)}
                          className="rounded-xl text-xs font-bold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                        >
                          +30 Dias
                        </Button>
                      </div>
                    </div>

                    {/* Taxa de Conversão de Moedas */}
                    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-secondary/30 p-3.5">
                      <div className="text-xs space-y-0.5">
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <Coins className="h-4 w-4 text-amber-500" />
                          Taxa de Conversão de Pontos em Moedas
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Quantidade de moedas geradas para cada ponto convertido no reset ou resgate voluntário.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground">1 pt =</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={draft.pointsToCoinsRate ?? 1}
                          onChange={(e) => setDraft({ ...draft, pointsToCoinsRate: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-18 h-9 text-center font-bold rounded-xl bg-background"
                        />
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">moeda(s)</span>
                      </div>
                    </div>

                    {/* Botão Salvar Configuração de Atividades */}
                    <Button
                      type="button"
                      onClick={saveActivitySeasonSettings}
                      className="w-full h-11 rounded-xl font-display font-extrabold text-sm gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                    >
                      <Save className="h-4 w-4" /> Salvar Configurações da Temporada de Atividades
                    </Button>
                  </div>

                  {/* Reset da Temporada de Atividades */}
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 mt-2">
                    <div className="font-display text-sm font-black text-destructive flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      {draft.isBetaActive !== false
                        ? "Ação de Encerramento da Fase Beta (Reset Especial)"
                        : "Iniciar Nova Temporada de Atividades (Reset Regular)"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {draft.isBetaActive !== false
                        ? "Atenção: Ao executar o encerramento do Beta, 120 medalhas de atividades serão revogadas, níveis voltam para 1, pioneiros são reiniciados e todo saldo de pontos é convertido em moedas. As 25 medalhas especiais acordadas são preservadas."
                        : "Ao iniciar nova temporada bimestral, os níveis voltam para 1 e os pontos são convertidos em moedas. Todas as medalhas conquistadas são mantidas."}
                    </p>

                    {draft.isBetaActive !== false ? (
                      !confirmBetaResetNow ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setConfirmBetaResetNow(true)}
                          className="w-full rounded-xl font-bold cursor-pointer"
                        >
                          🧪 Finalizar Fase Beta e Executar Reset de Atividades Agora
                        </Button>
                      ) : (
                        <div className="rounded-xl border border-destructive/40 bg-background p-3.5 space-y-2.5">
                          <div className="text-xs font-bold text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" /> Confirmação de Encerramento Definitivo do Beta:
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Você tem certeza que deseja finalizar a Fase Beta agora? Essa ação revogará 120 medalhas de atividades, manterá 25 especiais, converterá os pontos em moedas e iniciará a Temporada 2 oficial.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={executeBetaResetAction}
                              className="flex-1 rounded-xl font-bold cursor-pointer"
                            >
                              Sim, Confirmar e Finalizar Fase Beta
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setConfirmBetaResetNow(false)}
                              className="rounded-xl cursor-pointer"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )
                    ) : (
                      !confirmActivityResetNow ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setConfirmActivityResetNow(true)}
                          className="w-full rounded-xl font-bold cursor-pointer"
                        >
                          Iniciar Nova Temporada de Atividades (Reset Bimestral)
                        </Button>
                      ) : (
                        <div className="rounded-xl border border-destructive/40 bg-background p-3.5 space-y-2.5">
                          <div className="text-xs font-bold text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" /> Confirmar Novo Ciclo Bimestral:
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Os níveis serão reiniciados para 1 e os pontos convertidos em moedas. As medalhas dos alunos serão preservadas.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={executeRegularActivityResetAction}
                              className="flex-1 rounded-xl font-bold cursor-pointer"
                            >
                              Confirmar Novo Ciclo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setConfirmActivityResetNow(false)}
                              className="rounded-xl cursor-pointer"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* ========================================================= */}
                {/* CONTAINER 2: TEMPORADA DE RANQUEADA (MODO COMPETITIVO)    */}
                {/* ========================================================= */}
                <div className="rounded-3xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-orange-500/5 p-5 space-y-4 shadow-sm">
                  {/* Cabeçalho do Bloco 2 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        <Trophy className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-base font-black text-foreground">
                            2. Temporada de Ranqueada (Modo Competitivo)
                          </h2>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
                            ⚡ CICLO DE 2 SEMANAS
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ciclo quinzenal fixo (14 dias) • Domingo 08/11 marca metade do período • Encerramento no domingo seguinte, 15/11 às 23:59:59
                        </p>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold text-muted-foreground bg-secondary/50 rounded-xl px-3 py-1.5 border">
                      Temporada #{draft.rankedSeasonId ?? 1}
                    </div>
                  </div>

                  {/* Nome da Temporada de Ranqueada */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ranked-season-name-input" className="text-xs font-bold text-muted-foreground">
                      Nome Oficial da Temporada de Ranqueada
                    </Label>
                    <Input
                      id="ranked-season-name-input"
                      value={rankedSeasonName}
                      onChange={(e) => setRankedSeasonName(e.target.value)}
                      placeholder="Ex: Temporada 1 Ranqueada • SEMED Coari"
                      className="rounded-xl font-display font-bold text-sm bg-background"
                    />
                  </div>

                  {/* Barra de Progresso Visual da Ranqueada */}
                  <div className="rounded-2xl border bg-background/80 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-muted-foreground">
                        {rankedSeasonProgress.formattedRangeLabel}
                      </span>
                      <span className={`font-mono font-black ${rankedSeasonProgress.isExpired ? "text-rose-500" : "text-amber-600 dark:text-amber-400"}`}>
                        {rankedSeasonProgress.formattedCountdown}
                      </span>
                    </div>

                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted border border-border/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          rankedSeasonProgress.isExpired
                            ? "bg-rose-500"
                            : "bg-gradient-to-r from-amber-500 to-orange-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, rankedSeasonProgress.progressPercent))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Dia {rankedSeasonProgress.elapsedDays} de {rankedSeasonProgress.totalDays}</span>
                      <span>{Math.round(rankedSeasonProgress.progressPercent)}% decorrido</span>
                    </div>
                  </div>

                  {/* Regras e Diretrizes da Ranqueada */}
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 text-xs">
                    <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <Info className="h-4 w-4" /> Diretrizes e Regras de Reset da Ranqueada
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground leading-relaxed">
                      <li>
                        <b className="text-foreground">Duração Quinzenal (14 Dias):</b> O ciclo reinicia a cada duas semanas, permitindo novas disputas pelos primeiros lugares do pódio escolar.
                      </li>
                      <li>
                        <b className="text-foreground">Zera Apenas Pontos Ranqueados:</b> No reset, somente a pontuação do torneio (<code className="font-mono text-[11px]">tournamentPoints</code>) volta a zero e a divisão retorna para Bronze I.
                      </li>
                      <li>
                        <b className="text-foreground">Nenhum Nível ou XP Perdido:</b> O nível escolar, XP geral e moedas dos alunos NÃO são alterados no reset de ranqueada.
                      </li>
                      <li>
                        <b className="text-foreground">Medalhas de Pódio Empilham (Cumulativas):</b> As medalhas de 1º, 2º e 3º lugar são dinâmicas. Ao conquistar novamente, o aluno acumula um contador (<code className="font-mono text-[11px]">2x, 3x...</code>) e todo o histórico de temporadas conquistadas fica gravado na mesma medalha!
                      </li>
                    </ul>
                  </div>

                  {/* Presets e Datas da Ranqueada */}
                  <div className="space-y-3 pt-1">
                    <Label className="text-xs font-bold text-foreground">
                      Duração Padrão da Temporada de Ranqueada
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[7, 14, 21].map((days) => {
                        const isSelected = rankedDurationDays === days;
                        return (
                          <button
                            key={days}
                            type="button"
                            onClick={() => handleSelectRankedPreset(days)}
                            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/30 shadow-xs"
                                : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            }`}
                          >
                            <span className="font-display text-base font-black">
                              {days === 7 ? "⚡ 7 Dias" : days === 14 ? "⭐ 14 Dias" : "🗓️ 21 Dias"}
                            </span>
                            <span className="text-[10px] font-semibold mt-0.5">
                              {days === 7 ? "Semanal" : days === 14 ? "Quinzenal (Padrão)" : "3 Semanas"}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setRankedDurationDays(-1)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                          ![7, 14, 21].includes(rankedDurationDays)
                            ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/30 shadow-xs"
                            : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        <span className="font-display text-base font-black">✏️ Livre</span>
                        <span className="text-[10px] font-semibold mt-0.5">Personalizado</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="ranked-season-start" className="text-xs font-bold text-muted-foreground">
                          Data e Hora de Início
                        </Label>
                        <Input
                          id="ranked-season-start"
                          type="datetime-local"
                          value={rankedStartInput}
                          onChange={(e) => setRankedStartInput(e.target.value)}
                          className="rounded-xl font-mono text-xs bg-background"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ranked-season-end" className="text-xs font-bold text-muted-foreground">
                          Data e Hora de Encerramento
                        </Label>
                        <Input
                          id="ranked-season-end"
                          type="datetime-local"
                          value={rankedEndInput}
                          onChange={(e) => setRankedEndInput(e.target.value)}
                          className="rounded-xl font-mono text-xs bg-background"
                        />
                      </div>
                    </div>

                    {/* Extensão rápida da Temporada de Ranqueada */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/20 p-3">
                      <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        <FastForward className="h-4 w-4 text-amber-500" />
                        Estender término da ranqueada:
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendRankedDays(3)}
                          className="rounded-xl text-xs font-bold border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          +3 Dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendRankedDays(7)}
                          className="rounded-xl text-xs font-bold border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          +7 Dias
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtendRankedDays(14)}
                          className="rounded-xl text-xs font-bold border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          +14 Dias
                        </Button>
                      </div>
                    </div>

                    {/* Botão Salvar Configurações da Ranqueada */}
                    <Button
                      type="button"
                      onClick={saveRankedSeasonSettings}
                      className="w-full h-11 rounded-xl font-display font-extrabold text-sm gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer"
                    >
                      <Save className="h-4 w-4" /> Salvar Configurações da Temporada de Ranqueada
                    </Button>
                  </div>

                  {/* Reset Imediato de Ranqueada */}
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 mt-2">
                    <div className="font-display text-sm font-black text-destructive flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" /> Reiniciar Temporada de Ranqueada Imediatamente
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Zera os pontos do torneio de todos os competidores (retornando todos para Bronze I, 0 pts). Todas as medalhas e níveis escolares são rigorosamente mantidos.
                    </p>

                    {!confirmRankedResetNow ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setConfirmRankedResetNow(true)}
                        className="w-full rounded-xl font-bold cursor-pointer"
                      >
                        Reiniciar Temporada de Ranqueada Agora (Zerar Pontos de Torneio)
                      </Button>
                    ) : (
                      <div className="rounded-xl border border-destructive/40 bg-background p-3.5 space-y-2.5">
                        <div className="text-xs font-bold text-destructive flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" /> Confirmar Reinício da Ranqueada:
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Tem certeza de que deseja zerar a pontuação ranqueada agora e iniciar a Temporada {(draft.rankedSeasonId ?? 1) + 1}? Nenhuma medalha será excluída.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={executeRankedResetAction}
                            className="flex-1 rounded-xl font-bold cursor-pointer"
                          >
                            Sim, Zerar Ranqueada e Iniciar Nova Temporada
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmRankedResetNow(false)}
                            className="rounded-xl cursor-pointer"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ========================================================= */}
                {/* CONTAINER 3: HISTÓRICO DE RESETS REALIZADOS               */}
                {/* ========================================================= */}
                {draft.resetHistory.length > 0 && (
                  <div className="rounded-3xl border bg-card p-5 space-y-3 shadow-xs">
                    <div className="font-display text-sm font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Histórico Geral de Resets de Temporada
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {draft.resetHistory.map((h) => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between rounded-xl bg-secondary/40 px-3.5 py-2.5"
                        >
                          <div>
                            <span className="font-bold text-foreground">{h.seasonName}</span>
                            <span className="text-muted-foreground ml-2">
                              ({h.resetXp ? "Reset de Atividades / Nível" : "Reset de Temporada"})
                            </span>
                            {h.reason && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                Motivo: {h.reason}
                              </div>
                            )}
                          </div>
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {new Date(h.executedAt).toLocaleString("pt-BR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB MEDALHAS: GERENCIAMENTO, CRIAÇÃO, CONCESSÃO MANUAL E CAIXA DE ENTRADA */}
            {tab === "medalhas" && (
              <div className="space-y-4">
                {/* 0. Varredura e Retroatribuição de Medalhas no Banco de Dados */}
                <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                        <Sparkles className="h-5 w-5 text-primary" /> Varredura e Retroatribuição de Medalhas
                      </div>
                      <p className="text-xs text-muted-foreground max-w-2xl">
                        Escaneia todos os perfis de alunos no banco de dados local e na nuvem PlayFab, reavaliando todas as partidas
                        concluídas em qualquer modo (inclusive partidas do Modo Ranqueado / Torneio), níveis e critérios especiais. Atribui retroativamente
                        todas as medalhas legítimas devidas (ex: 10 partidas de cada jogo, maestria, zero erros) com os respectivos Pontos de Carreira e bônus de XP.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleRunMedalsAudit}
                      disabled={isAuditingMedals}
                      className="rounded-xl font-bold h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 shadow-sm"
                    >
                      <RefreshCw className={`h-4 w-4 ${isAuditingMedals ? "animate-spin" : ""}`} />
                      {isAuditingMedals ? "Escaneando Banco de Dados..." : "Iniciar Varredura e Retroatribuir"}
                    </Button>
                  </div>

                  {auditProgress && (
                    <div className="text-xs font-semibold text-primary animate-pulse bg-primary/10 border border-primary/20 px-3 py-2 rounded-xl flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" /> {auditProgress}
                    </div>
                  )}

                  {auditResult && (
                    <div className="rounded-xl border border-primary/30 bg-card p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Relatório da Última Varredura
                        </div>
                        <div className="flex gap-2 text-[11px]">
                          <span className="bg-secondary px-2 py-0.5 rounded-md text-foreground font-semibold">
                            {auditResult.auditedStudentsCount} alunos auditados
                          </span>
                          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md font-semibold">
                            {auditResult.updatedStudentsCount} com medalhas atribuídas
                          </span>
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold">
                            +{auditResult.medalsAwardedCount} medalhas retroatribuídas
                          </span>
                        </div>
                      </div>

                      {auditResult.details.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                          Todos os alunos já estavam com 100% de suas medalhas e pontos em dia! Nenhuma pendência encontrada.
                        </p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                          {auditResult.details.map((st) => (
                            <div key={st.studentId} className="rounded-lg border bg-background/80 p-2 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-foreground">
                                  {st.nick} <span className="font-normal text-muted-foreground">({st.fullName} • {st.school})</span>
                                </span>
                                <span className="text-[10px] font-bold text-primary">
                                  +{st.medalsAwarded.length} medalha(s)
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {st.medalsAwarded.map((m) => (
                                  <span
                                    key={m.id}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground border"
                                  >
                                    🏅 {m.title}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 1. Caixa de Entrada de Notificações de Medalhas Conquistadas */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Mail className="h-5 w-5 text-accent" /> Caixa de Entrada: Medalhas Conquistadas por Alunos
                    </div>
                    {(draft.adminMedalNotifications?.length ?? 0) > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const cleared = (draft.adminMedalNotifications ?? []).map((n) => ({
                            ...n,
                            read: true,
                          }));
                          const updated = { ...draft, adminMedalNotifications: cleared };
                          setDraft(updated);
                          await auth.updateAdminConfig(updated);
                          flashSaved("Mensagens marcadas como lidas.");
                        }}
                        className="text-[11px] h-7"
                      >
                        Marcar todas como lidas
                      </Button>
                    )}
                  </div>

                  {(draft.adminMedalNotifications?.length ?? 0) === 0 ? (
                    <div className="rounded-xl border border-dashed bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
                      Nenhuma notificação na caixa de entrada ainda. Quando os alunos desbloquearem
                      medalhas no jogo, as mensagens aparecerão aqui em tempo real.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {draft.adminMedalNotifications!.map((notif) => {
                        const rarity = RARITY_INFO[notif.medalRarity];
                        return (
                          <div
                            key={notif.id}
                            className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                              notif.read ? "bg-background/60 opacity-80" : "bg-card border-accent/40 shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}
                              >
                                <div className={rarity.textColor}>
                                  <MedalIcon name={notif.medalIcon} className="h-4 w-4" />
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold truncate text-foreground">
                                  <b>{notif.studentNick}</b> ({notif.studentFullName}) conquistou a medalha:{" "}
                                  <span className={rarity.textColor}>{notif.medalTitle}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {notif.studentSchool} • Raridade: <b>{rarity.label}</b> •{" "}
                                  {new Date(notif.unlockedAt).toLocaleString("pt-BR")}
                                </div>
                              </div>
                            </div>
                            {!notif.read && (
                              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-black uppercase text-accent-foreground">
                                Nova
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 1.1 Hall dos Pioneiros de Medalhas */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Compass className="h-5 w-5 text-amber-500" /> Hall dos Pioneiros: 1º Aluno a Conquistar Cada Medalha
                    </div>
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {Object.keys(pioneersMap).length} medalha(s) desbravada(s)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Histórico oficial dos alunos pioneiros que foram os primeiros a desbloquear cada medalha.
                    <span className="block mt-0.5 text-amber-600 dark:text-amber-400 font-medium">
                      🛡️ Contas de teste ZHERET e LORD (e contas ADM) são automaticamente desconsideradas para garantir a autenticidade dos alunos.
                    </span>
                  </p>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {getAllAvailableMedals(draft.customMedals).map((m) => {
                      const pioneer = pioneersMap[m.id];
                      const rarity = RARITY_INFO[m.rarity];
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 p-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}>
                              <div className={rarity.textColor}>
                                <MedalIcon name={m.iconName} className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold truncate text-foreground flex items-center gap-1.5">
                                <span>{m.title}</span>
                                <span className={`text-[10px] font-black uppercase ${rarity.textColor}`}>• {rarity.label}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {pioneer ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                    🌟 1º: <b>{pioneer.studentFullName}</b> (@{pioneer.studentNick}) • {pioneer.studentSchool} • {new Date(pioneer.timestampMs).toLocaleDateString("pt-BR")} às {new Date(pioneer.timestampMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                ) : (
                                  <span className="italic text-muted-foreground/70">Ainda não conquistada por nenhum aluno da rede</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Criação de Novas Medalhas (Eventos Especiais & Competições) */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-display text-base font-extrabold text-foreground">
                      <Award className="h-5 w-5 text-primary" /> Criar Medalha de Evento Especial
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsCreatingMedal(!isCreatingMedal)}
                      className="rounded-xl font-bold h-8 text-xs"
                    >
                      {isCreatingMedal ? "Fechar Formulário" : "+ Nova Medalha"}
                    </Button>
                  </div>

                  {isCreatingMedal && (
                    <div className="space-y-3 rounded-2xl border bg-secondary/30 p-4 animate-in fade-in-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Título da Medalha</Label>
                          <Input
                            value={newMedalTitle}
                            onChange={(e) => setNewMedalTitle(e.target.value)}
                            placeholder="Ex: Campeão da Gincana de Lógica"
                            className="rounded-xl h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Raridade & Brilho Neon</Label>
                          <select
                            value={newMedalRarity}
                            onChange={(e) => setNewMedalRarity(e.target.value as MedalRarity)}
                            className="h-9 w-full rounded-xl border bg-card px-2.5 text-xs font-bold text-foreground"
                          >
                            <option value="bronze">Bronze (Glow Marrom/Cobre)</option>
                            <option value="prata">Prata (Glow Prateado)</option>
                            <option value="ouro">Ouro (Glow Dourado)</option>
                            <option value="platina">Platina (Glow Ciano)</option>
                            <option value="diamante">Diamante (Glow Magenta)</option>
                            <option value="heroi">Herói (Brilho Vermelho Radiante)</option>
                          </select>
                        </div>
                      </div>

                      {/* Modo de Atribuição: Automático por Requisitos ou Manual */}
                      <div className="rounded-xl border bg-card p-3 space-y-2.5">
                        <Label className="text-xs font-bold">Tipo de Atribuição da Medalha</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewMedalMode("evento")}
                            className={`rounded-lg py-1.5 px-2 text-xs font-bold transition-all ${
                              newMedalMode === "evento"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "border bg-muted/30 text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            ⚡ Automática por Requisito de Evento
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewMedalMode("manual")}
                            className={`rounded-lg py-1.5 px-2 text-xs font-bold transition-all ${
                              newMedalMode === "manual"
                                ? "bg-primary text-primary-foreground shadow-xs"
                                : "border bg-muted/30 text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            👤 Concessão Manual pelo ADM
                          </button>
                        </div>

                        {newMedalMode === "evento" && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Requisito Especial</Label>
                              <select
                                value={newMedalReqType}
                                onChange={(e) => {
                                  const t = e.target.value as EventRequirementType;
                                  setNewMedalReqType(t);
                                  const opt = EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === t);
                                  if (opt) setNewMedalThreshold(opt.defaultVal);
                                }}
                                className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold"
                              >
                                {EVENT_REQUIREMENT_OPTIONS.map((opt) => (
                                  <option key={opt.type} value={opt.type}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">Jogo Vinculado</Label>
                              <select
                                disabled={["event_x1_wins", "event_distinct_games", "event_daily_cap", "event_team_matches"].includes(newMedalReqType)}
                                value={newMedalScope}
                                onChange={(e) => setNewMedalScope(e.target.value as "todos" | GameId)}
                                className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-bold disabled:opacity-50"
                              >
                                <option value="todos">🌟 Qualquer Jogo</option>
                                {ALL_GAME_IDS.map((id) => (
                                  <option key={id} value={id}>
                                    🎮 {GAME_NAMES[id]}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold">
                                Meta ({EVENT_REQUIREMENT_OPTIONS.find((o) => o.type === newMedalReqType)?.unit})
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                value={newMedalThreshold}
                                onChange={(e) => setNewMedalThreshold(Math.max(1, Number(e.target.value)))}
                                className="h-8 rounded-lg text-xs font-bold bg-background"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-bold">Descrição da Conquista (Opcional)</Label>
                        <Input
                          value={newMedalDesc}
                          onChange={(e) => setNewMedalDesc(e.target.value)}
                          placeholder="Ex: Concedida por cumprir os requisitos especiais do evento."
                          className="rounded-xl h-9 text-xs"
                        />
                      </div>

                      {/* Seletor de Ícones Visual */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Selecione o Ícone da Medalha</Label>
                        <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5 max-h-32 overflow-y-auto rounded-xl border bg-card p-2">
                          {AVAILABLE_MEDAL_ICONS.map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => setNewMedalIcon(ic)}
                              className={`grid h-8 w-8 place-items-center rounded-lg border transition-all ${
                                newMedalIcon === ic
                                  ? "border-primary bg-primary text-primary-foreground shadow-sm scale-110"
                                  : "hover:bg-secondary text-muted-foreground"
                              }`}
                              title={ic}
                            >
                              <MedalIcon name={ic} className="h-4 w-4" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Opção Medalha Empilhável / Cumulativa */}
                      <div className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-xs">
                        <div>
                          <Label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer" htmlFor="new-medal-stackable">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            Medalha Empilhável / Cumulativa
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Permite ao aluno conquistar esta medalha múltiplas vezes. Ficará alocada em um único card com contador circular no canto superior direito.
                          </p>
                        </div>
                        <input
                          id="new-medal-stackable"
                          type="checkbox"
                          checked={newMedalIsStackable}
                          onChange={(e) => setNewMedalIsStackable(e.target.checked)}
                          className="h-5 w-5 rounded accent-primary cursor-pointer"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={async () => {
                          if (!newMedalTitle.trim()) {
                            flashSaved("Informe o título da medalha.");
                            return;
                          }

                          let eventReq: EventMedalRequirement | null = null;
                          if (newMedalMode === "evento") {
                            eventReq = {
                              type: newMedalReqType,
                              threshold: Number(newMedalThreshold) || 1,
                              gameId: newMedalScope === "todos" ? undefined : newMedalScope,
                            };
                          }

                          const newMedal: MedalDefinition = {
                            id: `custom_${Date.now()}`,
                            title: newMedalTitle.trim(),
                            description:
                              newMedalDesc.trim() ||
                              (eventReq
                                ? `${newMedalTitle.trim()} — ${formatEventRequirementLabel(eventReq)}`
                                : "Medalha concedida manualmente pelo administrador."),
                            rarity: newMedalRarity,
                            category: "evento",
                            iconName: newMedalIcon,
                            condition: eventReq
                              ? {
                                  type: newMedalReqType,
                                  threshold: eventReq.threshold,
                                  gameId: eventReq.gameId,
                                }
                              : { type: "manual_event" },
                            isCustom: true,
                            isStackable: newMedalIsStackable,
                            createdByAdmin: true,
                            eventRequirement: eventReq,
                          };
                          const updatedCustoms = [...(draft.customMedals ?? []), newMedal];
                          const updatedConfig = { ...draft, customMedals: updatedCustoms };
                          setDraft(updatedConfig);
                          await auth.updateAdminConfig(updatedConfig);
                          setNewMedalTitle("");
                          setNewMedalDesc("");
                          setIsCreatingMedal(false);
                          flashSaved(`Medalha "${newMedal.title}" criada com sucesso!`);
                        }}
                        className="w-full rounded-xl font-bold h-10"
                      >
                        Salvar e Adicionar ao Catálogo de Medalhas
                      </Button>
                    </div>
                  )}
                </div>

                {/* 3. Catálogo Geral e Botão de Concessão Manual */}
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-sm font-extrabold text-foreground">
                      Todas as Medalhas do Sistema ({getAllAvailableMedals(draft.customMedals).length})
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Clique em "Conceder a Aluno" para premiar manualmente
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {getAllAvailableMedals(draft.customMedals).map((m) => {
                      const rarity = RARITY_INFO[m.rarity];
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-background p-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${rarity.badgeBgClass}`}
                            >
                              <div className={rarity.textColor}>
                                <MedalIcon name={m.iconName} className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold truncate text-foreground">{m.title}</span>
                                <span className={`text-[10px] font-black uppercase ${rarity.textColor}`}>
                                  ({rarity.label})
                                </span>
                                {m.isCustom && (
                                  <span className="rounded bg-primary/20 px-1 text-[9px] font-black uppercase text-primary">
                                    ADM
                                  </span>
                                )}
                                {m.isStackable && (
                                  <span className="rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 px-1 text-[9px] font-black uppercase">
                                    Empilhável
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{m.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setGrantMedalTarget(m);
                                setSelectedStudentForGrant(players[0]?.id ?? "");
                              }}
                              className="h-7 rounded-lg text-[11px] font-bold"
                            >
                              Conceder a Aluno
                            </Button>
                            {m.isCustom && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  const filtered = (draft.customMedals ?? []).filter((cm) => cm.id !== m.id);
                                  const updated = { ...draft, customMedals: filtered };
                                  setDraft(updated);
                                  await auth.updateAdminConfig(updated);
                                  flashSaved(`Medalha "${m.title}" excluída.`);
                                }}
                                className="h-7 w-7 p-0 text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modal Sub-diálogo para Conceder Medalha a Aluno */}
                {grantMedalTarget && (
                  <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4 space-y-3 animate-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <div className="font-display text-sm font-extrabold text-foreground">
                        Conceder Medalha: <b>{grantMedalTarget.title}</b>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setGrantMedalTarget(null)}
                        className="h-7 w-7 p-0"
                      >
                        ✕
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Selecione o Aluno</Label>
                      <select
                        value={selectedStudentForGrant}
                        onChange={(e) => setSelectedStudentForGrant(e.target.value)}
                        className="h-9 w-full rounded-xl border bg-card px-2.5 text-xs font-bold text-foreground"
                      >
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nick} ({p.full_name}) • {p.school} • Nv. {p.level}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const st = registeredStudents.find((s) => s.id === selectedStudentForGrant) || players.find((p) => p.id === selectedStudentForGrant);
                      const existing = st?.unlockedMedals?.find((um) => um.medalId === grantMedalTarget.id);
                      if (existing) {
                        const curCount = existing.count ?? 1;
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                            <p className="font-bold flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                              O aluno já possui esta medalha ({curCount}x conquistada).
                            </p>
                            <p className="text-[11px] opacity-90 mt-0.5">
                              {grantMedalTarget.isStackable
                                ? `Como esta medalha é empilhável, confirmar a concessão aumentará a contagem para ${curCount + 1}x no inventário.`
                                : "Como esta medalha é de concessão única, seu contador permanecerá em 1x."}
                            </p>
                          </div>
                        );
                      }
                      return (
                        <p className="text-[11px] text-muted-foreground">
                          O aluno ainda não possui esta medalha. Ela será adicionada com contador inicial 1x.
                        </p>
                      );
                    })()}

                    <Button
                      type="button"
                      onClick={async () => {
                        if (!selectedStudentForGrant) return;
                        const res = await grantPlayerMedalManually(selectedStudentForGrant, grantMedalTarget);
                        if (res.success) {
                          flashSaved(`Medalha "${grantMedalTarget.title}" concedida ao aluno com sucesso!`);
                          setGrantMedalTarget(null);
                        } else {
                          flashSaved(res.error || "Erro ao conceder medalha.");
                        }
                      }}
                      className="w-full rounded-xl font-bold h-10"
                    >
                      Confirmar e Enviar Medalha ao Inventário do Aluno
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SISTEMA, PLAYFAB & ALUNOS */}
            {tab === "sistema" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-base font-extrabold flex items-center gap-2">
                      <Cloud className="h-5 w-5 text-primary" /> Microsoft Azure PlayFab
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isPlayFabConfigured()
                          ? "bg-success/15 text-success"
                          : "bg-accent/15 text-accent"
                      }`}
                    >
                      {isPlayFabConfigured()
                        ? `Ativo (Title ID: ${getPlayFabTitleId()})`
                        : "Modo Local / Offline-First"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe o <b>Title ID</b> do seu projeto no Azure PlayFab Game Manager (ex:{" "}
                    <code>1A2B3</code>) ou defina <code>VITE_PLAYFAB_TITLE_ID</code> no GitHub
                    Actions.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-title-id">PlayFab Title ID</Label>
                    <Input
                      id="pf-title-id"
                      value={draft.playfabTitleId ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, playfabTitleId: e.target.value.trim().toUpperCase() })
                      }
                      placeholder="Ex: 9F8E7 (deixe vazio para modo local)"
                      className="rounded-xl font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="daily-xp-cap">
                      Limite Diário de XP por Aluno (padrão: 1.000 XP/dia)
                    </Label>
                    <Input
                      id="daily-xp-cap"
                      type="number"
                      min={100}
                      max={50000}
                      step={50}
                      value={draft.dailyXpCap ?? 1000}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dailyXpCap: Math.max(100, Number(e.target.value) || 1000),
                        })
                      }
                      className="rounded-xl font-display font-bold"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Com 1.000 XP/dia, o aluno alcança no máximo o Nível 4 no 1º dia (795 XP) e
                      precisa de ~9 dias de atividades para atingir o Nível Máximo (10 — 8.433 XP).
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="new-admin-pin">Alterar Senha/PIN do Painel ADM (opcional)</Label>
                    <Input
                      id="new-admin-pin"
                      type="password"
                      value={newAdminPin}
                      onChange={(e) => setNewAdminPin(e.target.value)}
                      placeholder="Nova senha ADM (mínimo 4 caracteres)"
                      className="rounded-xl"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={saveSystemSettings}
                    className="w-full rounded-xl font-bold"
                  >
                    <Save className="mr-2 h-4 w-4" /> Salvar Configurações do Sistema
                  </Button>
                </div>

                {/* Lista de Alunos Cadastrados */}
                <div className="rounded-2xl border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-primary" /> Alunos Cadastrados ({players.length})
                    </span>
                  </div>
                  {players.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhum aluno cadastrado neste navegador ainda.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {players.map((p) => {
                        const pEff = getEffectivePlayerProgression(
                          p,
                          p.stats ?? [],
                          auth.adminConfig.enabledGames,
                        );
                        const pProg = levelProgress({
                          xp: pEff.xp,
                          matchesPlayed: pEff.matchesPlayed,
                          wins: pEff.wins,
                          distinctGames: pEff.distinctGames,
                          currentLevel: pEff.level,
                          stageProgress: pEff.stageProgress,
                          maxAvailableGames: pEff.maxAvailableGames,
                        });

                        return (
                          <div
                            key={p.id}
                            onClick={() => setInspectStudentId(p.id)}
                            className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs cursor-pointer hover:border-primary/50 transition-colors"
                            title="Clique para inspecionar perfil e requisitos de nível deste aluno"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-bold truncate flex-wrap">
                                <span className="truncate">{p.nick}</span>
                                <PresenceDot
                                  playerId={p.id}
                                  playfabId={p.playfabId}
                                  nick={p.nick}
                                  nickNormalized={p.nickNormalized}
                                  size="xs"
                                />
                                <span className="font-normal text-muted-foreground truncate">({p.full_name})</span>
                                {pProg.isLockedByMissions && (
                                  <span
                                    className="rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400"
                                    title={`Faltam missões para o Nível ${pProg.nextRequirement?.level}`}
                                  >
                                    🔒 Faltam missões (Nv. {pProg.nextRequirement?.level})
                                  </span>
                                )}
                              </div>
                              <div className="text-muted-foreground truncate">
                                {p.school}
                                {p.grade ? ` • ${p.grade}` : ""} •{" "}
                                <b className="text-foreground">
                                  {stageFromBirthdate(p.birthdate).shortLabel} ({ageFrom(p.birthdate)}{" "}
                                  anos)
                                </b>{" "}
                                • Nasc:{" "}
                                {new Date(`${p.birthdate}T00:00:00`).toLocaleDateString("pt-BR")}
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-display font-bold text-primary">
                              Nv. {pProg.level} ({p.xp} XP)
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB LIXEIRA: GERENCIAMENTO DE PERFIS EXCLUÍDOS / RETENÇÃO DE 7 DIAS */}
            {tab === "lixeira" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-display text-base font-extrabold text-destructive">
                        <Trash2 className="h-5 w-5" /> Lixeira de Perfis de Alunos ({trashPlayers.length})
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                        Os perfis nesta lixeira estão <b>invisíveis</b> em todos os rankings, recordes e modos de jogo. Eles serão <b>excluídos definitivamente de forma automática após 7 dias</b> da data de exclusão. Você pode recuperá-los ou excluí-los permanentemente a qualquer momento.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={trashPlayers.length === 0}
                      onClick={async () => {
                        if (
                          confirm(
                            `Tem certeza de que deseja esvaziar a lixeira e apagar DEFINITIVAMENTE todos os ${trashPlayers.length} aluno(s)? Esta ação é irreversível!`,
                          )
                        ) {
                          const res = await emptyStudentTrash();
                          flashSaved(
                            `Lixeira esvaziada: ${res.count} perfil(is) excluído(s) permanentemente.`,
                          );
                          refreshRoster();
                          void syncStudentRosterFromPlayFab().then(() => refreshRoster());
                        }
                      }}
                      className="rounded-xl font-bold text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Esvaziar Lixeira
                    </Button>
                  </div>
                </div>

                {trashPlayers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center space-y-2">
                    <Trash2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="font-bold text-sm text-foreground">A lixeira está vazia</p>
                    <p className="text-xs text-muted-foreground">
                      Nenhum perfil de aluno foi movido para a lixeira nos últimos 7 dias.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {trashPlayers.map((st) => {
                      const msLeft = st.deleteScheduledPermanentAt
                        ? new Date(st.deleteScheduledPermanentAt).getTime() - Date.now()
                        : 0;
                      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
                      const delDateStr = st.deletedAt
                        ? new Date(st.deletedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Data desconhecida";

                      return (
                        <div
                          key={st.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition-all hover:border-destructive/40"
                        >
                          <div
                            className="min-w-0 cursor-pointer flex-1"
                            onClick={() => setInspectStudentId(st.id)}
                            title="Clique para inspecionar os detalhes deste perfil"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display text-sm font-black text-foreground">
                                {st.nick}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                ({st.full_name})
                              </span>
                              <span className="rounded-full bg-destructive/15 border border-destructive/30 px-2 py-0.5 font-mono text-[10px] font-black text-destructive">
                                {daysLeft <= 0 ? "Expira hoje" : `Expira em ${daysLeft} dia(s)`}
                              </span>
                            </div>

                            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                              <span>{st.school}</span>
                              {st.grade && <span>• {st.grade}</span>}
                              {st.turma && <span>Turma {st.turma}</span>}
                              <span>• Nv. {st.level} ({st.xp} XP)</span>
                              <span className="text-destructive font-medium">• Excluído em: {delDateStr}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const res = await restoreStudentFromTrash(st.id);
                                if (res.success) {
                                  flashSaved(`Perfil de "${st.nick}" recuperado com sucesso!`);
                                  refreshRoster();
                                  void syncStudentRosterFromPlayFab().then(() => refreshRoster());
                                }
                              }}
                              className="rounded-xl border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs h-8"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Recuperar
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Deseja apagar DEFINITIVAMENTE o perfil de "${st.nick}" agora? Esta ação não pode ser desfeita.`,
                                  )
                                ) {
                                  const res = await permanentlyDeleteStudent(st.id);
                                  if (res.success) {
                                    flashSaved(`Perfil de "${st.nick}" excluído permanentemente.`);
                                    refreshRoster();
                                    void syncStudentRosterFromPlayFab().then(() => refreshRoster());
                                  }
                                }
                              }}
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                              title="Excluir permanentemente agora"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}

        <PlayerInspectModal
          playerId={inspectStudentId}
          open={Boolean(inspectStudentId)}
          onOpenChange={(v) => {
            if (!v) {
              setInspectStudentId(null);
              refreshRoster();
            }
          }}
          onStudentUpdated={() => {
            refreshRoster();
            void syncStudentRosterFromPlayFab().then(() => refreshRoster());
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
