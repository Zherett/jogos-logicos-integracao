import { useEffect, useMemo, useState } from "react";
import {
  User,
  School,
  Trophy,
  Flame,
  Award,
  Shield,
  Star,
  Pencil,
  Check,
  X,
  Loader2,
  Lock,
  CheckCircle2,
  Clock,
  Sparkles,
  Gamepad2,
  Trash2,
  AlertTriangle,
  RotateCcw,
  FileText,
  PlusCircle,
  MinusCircle,
  Filter,
  Search,
  ArrowUpRight,
} from "lucide-react";
import {
  getPlayerScoreLedger,
  calculateStudentScoreBreakdown,
  recordScoreLedgerEntry,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_TYPE_LABELS,
  type ScoreTransactionType,
} from "@/lib/score-history-ledger";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPlayerPublicProfile,
  moveStudentToTrash,
  restoreStudentFromTrash,
  permanentlyDeleteStudent,
  playfabCompleteInitialSchoolSetup,
  syncStudentRosterFromPlayFab,
  updateStudentProfileByAdmin,
  type PlayerProfile,
} from "@/lib/playfab";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  ageFrom,
  formatBirthdateBR,
  getAvailableSchoolsForAge,
  is5thGradeSchool,
  isEtapa3OrOlder,
  isOlderThanEtapa1,
  isOfficialSemedSchool,
  levelProgress,
  MAX_LEVEL,
  RAIMUNDO_GRADES,
  schoolNeedsGrade,
  SCHOOLS,
  VALID_TURMAS,
  type TurmaCode,
} from "@/lib/player-profile";
import {
  aggregateStatsByGame,
  getDistinctGamesPlayed,
  getEffectivePlayerProgression,
} from "@/lib/medals-catalog";
import { ALL_GAME_IDS, GAME_NAMES } from "@/lib/game-storage";
import { PlayerMedalsInventory } from "./PlayerMedalsInventory";
import { PresenceDot } from "./PresenceDot";
import { PlayerActivityBadge } from "./PlayerActivityBadge";
import { TournamentRankBadge } from "./TournamentRankBadge";
import {
  getTournamentStoreRecord,
  resolveCanonicalTournamentPoints,
  syncWeeklyTournamentWithPlayFab,
} from "@/lib/weekly-tournament";

interface Props {
  playerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStudentUpdated?: () => void;
}

export function PlayerInspectModal({ playerId, open, onOpenChange, onStudentUpdated }: Props) {
  const auth = usePlayerAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  const effectiveTournamentPoints = useMemo(() => {
    if (!profile) return 0;
    const tourRecord =
      getTournamentStoreRecord(profile.id, profile.nick) ||
      (profile.playfabId ? getTournamentStoreRecord(profile.playfabId, profile.nick) : null) ||
      (profile.nickNormalized ? getTournamentStoreRecord(profile.nickNormalized, profile.nickNormalized) : null);

    return resolveCanonicalTournamentPoints({
      level: profile.level,
      isAdmin: profile.isAdmin,
      tournamentPoints: profile.tournamentPoints,
      bestTournamentPoints: profile.bestTournamentPoints,
      record: tourRecord,
    });
  }, [profile]);

  // Estados de edição pelo Administrador
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editGrade, setEditGrade] = useState<string>(RAIMUNDO_GRADES[0]);
  const [editTurma, setEditTurma] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Estados de seleção única para o próprio jogador comum (caso ainda não tenha escolhido escola/série)
  const [selfSchool, setSelfSchool] = useState<string>("Nenhuma");
  const [selfGrade, setSelfGrade] = useState<string>(RAIMUNDO_GRADES[0]);
  const [selfTurma, setSelfTurma] = useState<string>("");
  const [savingSelf, setSavingSelf] = useState(false);

  // Estados para o fluxo de exclusão pelo Administrador (Lixeira de 7 dias)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [confirmNickInput, setConfirmNickInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  // Estados para o Histórico de Pontuação & Auditoria (Score Ledger)
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerFilterType, setLedgerFilterType] = useState<ScoreTransactionType | "all">("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerVersion, setLedgerVersion] = useState(0);

  // Estados para ajuste manual de pontuação pelo Administrador
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjType, setAdjType] = useState<"xp" | "career_points">("xp");
  const [adjAmount, setAdjAmount] = useState<number>(50);
  const [adjReason, setAdjReason] = useState<string>("");
  const [adjSaving, setAdjSaving] = useState(false);

  useEffect(() => {
    if (open && playerId) {
      const found = getPlayerPublicProfile(playerId);
      setProfile(found);
      setIsEditing(false);
      setIsDeleteModalOpen(false);
      setDeleteStep(1);
      setConfirmNickInput("");
      setDeleteFeedback(null);
      if (found) {
        setSelfSchool(found.school || "Nenhuma");
        setSelfGrade(found.grade || RAIMUNDO_GRADES[0]);
        setSelfTurma(found.turma || "");
      }
      let cancelled = false;
      void Promise.all([
        syncStudentRosterFromPlayFab(undefined, true),
        syncWeeklyTournamentWithPlayFab(),
      ]).then(() => {
        if (cancelled) return;
        const refreshed = getPlayerPublicProfile(playerId);
        if (refreshed) {
          setProfile(refreshed);
          onStudentUpdated?.();
        }
      });
      const onTourUpdated = () => {
        if (cancelled) return;
        const refreshed = getPlayerPublicProfile(playerId);
        if (refreshed) setProfile(refreshed);
      };
      if (typeof window !== "undefined") {
        window.addEventListener("desafios:weekly-tournament-updated", onTourUpdated);
      }
      return () => {
        cancelled = true;
        if (typeof window !== "undefined") {
          window.removeEventListener("desafios:weekly-tournament-updated", onTourUpdated);
        }
      };
    } else {
      setProfile(null);
      setIsEditing(false);
    }
  }, [open, playerId]);

  useEffect(() => {
    if (isEditing) {
      const available = getAvailableSchoolsForAge(editBirthdate);
      if (!available.some((s) => s.name === editSchool)) {
        setEditSchool("Nenhuma");
        setEditTurma("");
      }
    }
  }, [editBirthdate, editSchool, isEditing]);

  const ledgerEntries = useMemo(() => {
    if (!profile) return [];
    const pId = profile.id || profile.nickNormalized || profile.nick;
    return getPlayerScoreLedger(
      pId,
      {
        type: ledgerFilterType === "all" ? undefined : ledgerFilterType,
        search: ledgerSearch,
        limit: 60,
      },
      profile,
    );
  }, [profile, ledgerFilterType, ledgerSearch, ledgerVersion]);

  const ledgerBreakdown = useMemo(() => {
    if (!profile) return null;
    const pId = profile.id || profile.nickNormalized || profile.nick;
    return calculateStudentScoreBreakdown(pId, profile);
  }, [profile, ledgerVersion]);

  if (!profile) return null;

  const age = ageFrom(profile.birthdate);
  const effProg = getEffectivePlayerProgression(
    profile,
    profile.stats ?? [],
    auth.adminConfig.enabledGames,
  );
  const distinctGames = effProg.distinctGames;
  const matchesCount = effProg.matchesPlayed;
  const totalWins = effProg.wins;
  const progress = levelProgress({
    xp: effProg.xp,
    matchesPlayed: matchesCount,
    wins: totalWins,
    distinctGames,
    currentLevel: effProg.level,
    stageProgress: effProg.stageProgress,
    maxAvailableGames: effProg.maxAvailableGames,
  });
  const isMe = auth.profile?.id === profile.id;

  async function handleApplyAdminAdjustment() {
    if (!profile || !adjAmount || !adjReason.trim()) return;
    setAdjSaving(true);
    try {
      const pId = profile.id || profile.nickNormalized || profile.nick;
      recordScoreLedgerEntry({
        playerId: pId,
        playerNick: profile.nick,
        type: adjType,
        source: "ajuste_adm",
        amount: adjAmount,
        reason: `Ajuste ADM: ${adjReason.trim()}`,
        metadata: { adminUser: auth.profile?.nick || "ADM" },
      });
      if (adjType === "xp") {
        profile.xp = Math.max(0, (profile.xp ?? 0) + adjAmount);
        profile.seasonXp = Math.max(0, (profile.seasonXp ?? 0) + adjAmount);
      } else {
        profile.careerPoints = Math.max(0, (profile.careerPoints ?? 0) + adjAmount);
        profile.pointsBalance = Math.max(0, (profile.pointsBalance ?? 0) + adjAmount);
      }
      setLedgerVersion((v) => v + 1);
      setIsAdjustmentOpen(false);
      setAdjReason("");
      onStudentUpdated?.();
    } finally {
      setAdjSaving(false);
    }
  }

  async function handleSaveAdminEdit() {
    if (!profile) return;
    setSavingEdit(true);
    const resolvedGrade =
      editSchool === "Nenhuma" || editSchool === "Outro"
        ? null
        : is5thGradeSchool(editSchool)
          ? "5º ano"
          : schoolNeedsGrade(editSchool)
            ? editGrade
            : profile.grade;
    const updated = await updateStudentProfileByAdmin({
      playerId: profile.id,
      fullName: editFullName.trim(),
      birthdate: editBirthdate,
      school: editSchool,
      turma: editSchool === "Nenhuma" || editSchool === "Outro" ? null : (editTurma ? editTurma : null),
      grade: resolvedGrade,
    });
    setSavingEdit(false);
    if (updated) {
      setProfile(updated);
      setIsEditing(false);
      onStudentUpdated?.();
    }
  }

  async function handleSaveSelfInitialSetup() {
    if (!profile) return;
    setSavingSelf(true);
    const targetSchool =
      profile.school && profile.school !== "Nenhuma" ? profile.school : selfSchool;
    const targetGrade = profile.grade
      ? profile.grade
      : is5thGradeSchool(targetSchool)
        ? "5º ano"
        : schoolNeedsGrade(targetSchool)
          ? selfGrade
          : null;
    const targetTurma = (profile.turma || selfTurma || null) as TurmaCode | null;

    const res = await playfabCompleteInitialSchoolSetup({
      school: targetSchool,
      grade: targetGrade,
      turma: targetTurma,
    });
    setSavingSelf(false);
    if (res.profile) {
      setProfile(res.profile);
      await auth.refresh();
      onStudentUpdated?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:w-[90vw] max-w-4xl h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
            <User className="h-5 w-5 text-primary" /> Perfil & Medalhas do Jogador
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Cabeçalho do Perfil Inspecionado */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border bg-secondary/30 p-4">
            <div className="flex items-center gap-3.5">
              {/* Nível destacado no lugar do ícone */}
              <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary/95 to-primary/80 text-primary-foreground shadow-md border-2 border-primary/40">
                <div className="flex flex-col items-center justify-center leading-none text-center">
                  <span className="text-[9px] font-black uppercase text-primary-foreground/80">
                    NÍVEL
                  </span>
                  <span className="font-display text-2xl font-black">
                    {progress.level}
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-display text-xl font-black text-foreground">
                    {profile.nick}
                  </h3>
                  <PresenceDot
                    playerId={profile.id}
                    playfabId={profile.playfabId}
                    nick={profile.nick}
                    nickNormalized={profile.nickNormalized}
                    size="sm"
                    showTimeAgoText
                  />
                  {isMe && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-accent-foreground">
                      VOCÊ
                    </span>
                  )}
                  {Boolean(
                    profile.turma &&
                      profile.school &&
                      profile.school !== "Nenhuma" &&
                      profile.school !== "Outro"
                  ) && (
                    <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                      {profile.grade ? `${profile.grade} ` : ""}Turma {profile.turma}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs font-semibold text-muted-foreground uppercase">{profile.full_name}</p>
                
                {/* Status Extra de Atividade em Tempo Real (Separado do Online/Offline) */}
                <PlayerActivityBadge
                  playerId={profile.id}
                  playfabId={profile.playfabId}
                  nick={profile.nick}
                  nickNormalized={profile.nickNormalized}
                  mode="banner"
                  className="mt-1.5 mb-0.5"
                />

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {/* Rank Ranqueado do Torneio */}
                  <TournamentRankBadge
                    points={effectiveTournamentPoints}
                    size="xs"
                    showLabel
                  />
                  <span className="text-muted-foreground">•</span>
                  <span className="font-extrabold text-primary">
                    {profile.xp} XP
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-semibold text-foreground">
                    {age} anos
                  </span>
                  {Boolean(auth.profile?.isAdmin || isMe) && profile.birthdate && (
                    <span className="text-muted-foreground font-medium text-[11px]">
                      (Nasc: {formatBirthdateBR(profile.birthdate)})
                    </span>
                  )}
                  {auth.profile?.isAdmin && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditFullName(profile.full_name || "");
                        setEditBirthdate(profile.birthdate || "");
                        setEditSchool(profile.school || "Outro");
                        setEditGrade(profile.grade || RAIMUNDO_GRADES[0]);
                        setEditTurma(profile.turma || "");
                        setIsEditing(true);
                      }}
                      className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary underline hover:text-primary/80"
                      title="Editar data de nascimento, nome, escola, série e turma deste aluno"
                    >
                      <Pencil className="h-3 w-3" /> Editar (ADM)
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-right">
              <div className="rounded-xl border bg-card px-3 py-1.5">
                <span className="block text-[10px] font-bold text-muted-foreground">Escola</span>
                <span className="truncate font-display text-xs font-black text-foreground">
                  {profile.school}
                </span>
              </div>
              <div className="rounded-xl border bg-card px-3 py-1.5">
                <span className="block text-[10px] font-bold text-muted-foreground">Vitórias</span>
                <span className="font-display text-xs font-black text-accent">
                  {totalWins}
                </span>
              </div>
            </div>
          </div>

          {/* Carteira e Pontos de Conquista do Aluno */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/20 text-base">
                🪙
              </span>
              <div>
                <div className="text-xs font-black text-foreground">
                  {profile.pointsBalance ?? 0} Pontos Conquistados
                </div>
                <div className="text-[10px] text-muted-foreground font-medium">
                  Pontuação acumulada em partidas e desafios
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLedger((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all shadow-xs ${
                  showLedger
                    ? "bg-amber-500 text-white border-amber-600"
                    : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                }`}
                title="Exibir histórico completo de pontuações, medalhas e extrato de auditoria"
              >
                <FileText className="h-3.5 w-3.5" />
                {showLedger ? "Fechar Extrato" : "Extrato & Auditoria"}
              </button>
              <div className="text-right">
                <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-black text-amber-600 dark:text-amber-400">
                  {profile.careerPoints ?? 0} pts totais
                </span>
                <div className="text-[9px] text-muted-foreground">
                  Hall da Fama
                </div>
              </div>
            </div>
          </div>

          {/* Seção Extrato de Pontuação e Ledger de Auditoria */}
          {showLedger && (
            <div className="rounded-2xl border-2 border-amber-500/40 bg-card p-4 space-y-3.5 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/20 text-sm">
                    📜
                  </span>
                  <div>
                    <h4 className="font-display text-sm font-black text-foreground">
                      Extrato de Auditoria & Histórico de Pontuação
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Registro de todas as pontuações, medalhas e bonificações recebidas pelo aluno
                    </p>
                  </div>
                </div>

                {auth.profile?.isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsAdjustmentOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> Ajuste Manual (ADM)
                  </button>
                )}
              </div>

              {/* Resumo Consolidado de Origens */}
              {ledgerBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-xl border bg-secondary/30 p-2">
                    <span className="block text-[10px] font-bold text-muted-foreground">XP em Partidas</span>
                    <span className="font-mono text-sm font-extrabold text-primary">
                      +{ledgerBreakdown.totalXpFromMatches} XP
                    </span>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-2">
                    <span className="block text-[10px] font-bold text-muted-foreground">XP em Medalhas</span>
                    <span className="font-mono text-sm font-extrabold text-purple-600 dark:text-purple-400">
                      +{ledgerBreakdown.totalXpFromMedals} XP
                    </span>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-2">
                    <span className="block text-[10px] font-bold text-muted-foreground">Pontos Conquistados</span>
                    <span className="font-mono text-sm font-extrabold text-amber-600 dark:text-amber-400">
                      +{ledgerBreakdown.totalCareerPoints} pts
                    </span>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-2">
                    <span className="block text-[10px] font-bold text-muted-foreground">Transações Registradas</span>
                    <span className="font-mono text-sm font-extrabold text-foreground">
                      {ledgerBreakdown.transactionsCount} registros
                    </span>
                  </div>
                </div>
              )}

              {/* Barra de Filtros e Busca */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto text-xs">
                  <span className="text-[11px] font-bold text-muted-foreground mr-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Tipo:
                  </span>
                  {(
                    [
                      { id: "all", label: "Todos" },
                      { id: "xp", label: "XP" },
                      { id: "career_points", label: "Pontos" },
                      { id: "tournament_pts", label: "Ranqueada" },
                      { id: "medal", label: "Medalhas" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLedgerFilterType(f.id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        ledgerFilterType === f.id
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Filtrar por jogo, medalha ou motivo..."
                    className="h-8 w-full rounded-xl border bg-background pl-8 pr-3 text-xs"
                  />
                </div>
              </div>

              {/* Modal de Concessão de Ajuste pelo ADM */}
              {isAdjustmentOpen && auth.profile?.isAdmin && (
                <div className="rounded-xl border-2 border-primary/40 bg-secondary/40 p-3 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-black text-primary">
                    <span>Novo Ajuste Manual de Pontuação (Auditoria ADM)</span>
                    <button
                      type="button"
                      onClick={() => setIsAdjustmentOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground">Tipo de Recurso:</label>
                      <select
                        value={adjType}
                        onChange={(e) => setAdjType(e.target.value as any)}
                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-semibold"
                      >
                        <option value="xp">⚡ Experiência (XP)</option>
                        <option value="career_points">🪙 Pontos de Carreira</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground">Quantidade (+ ou -):</label>
                      <input
                        type="number"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(Number(e.target.value))}
                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground">Motivo / Justificativa:</label>
                      <input
                        type="text"
                        value={adjReason}
                        onChange={(e) => setAdjReason(e.target.value)}
                        placeholder="Ex: Correção de bug em sala, bônus de gincana..."
                        className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAdjustmentOpen(false)}
                      className="h-7 text-xs"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={adjSaving || !adjAmount || !adjReason.trim()}
                      onClick={handleApplyAdminAdjustment}
                      className="h-7 text-xs font-bold"
                    >
                      {adjSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmar e Gravar no Extrato"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Feed de Transações */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {ledgerEntries.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma movimentação de pontuação registrada com os filtros selecionados.
                  </div>
                ) : (
                  ledgerEntries.map((tx) => {
                    const srcInfo = TRANSACTION_SOURCE_LABELS[tx.source] || {
                      label: tx.source,
                      badgeColor: "bg-secondary text-muted-foreground",
                    };
                    const typeInfo = TRANSACTION_TYPE_LABELS[tx.type] || {
                      symbol: "•",
                      unit: "",
                    };
                    const isPositive = tx.amount >= 0;
                    const dateFormatted = new Date(tx.timestamp).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-card/60 p-2 text-xs hover:bg-card transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-base shrink-0">{typeInfo.symbol}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-foreground truncate">{tx.reason}</span>
                              <span
                                className={`rounded-md border px-1.5 py-0.2 text-[9px] font-black uppercase ${srcInfo.badgeColor}`}
                              >
                                {srcInfo.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{dateFormatted}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-mono font-extrabold text-xs ${
                              isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {isPositive ? `+${tx.amount}` : tx.amount} {typeInfo.unit}
                          </span>
                          {tx.balanceAfter !== undefined && (
                            <span className="block text-[9px] text-muted-foreground font-mono">
                              Saldo: {tx.balanceAfter}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Painel de Edição Rápida para o Administrador */}
          {isEditing && (
            <div className="rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-primary">
                <span className="flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar Cadastro do Aluno (ADM)
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Nível ({progress.level}), XP ({profile.xp}) e Medalhas não são alterados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Nome Completo */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground">Nome Completo:</label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value.toUpperCase())}
                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold uppercase"
                    placeholder="NOME DO ALUNO"
                  />
                </div>

                {/* 2. Data de Nascimento */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground">Data de Nascimento:</label>
                  <input
                    type="date"
                    value={editBirthdate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setEditBirthdate(newDate);
                      if (isEtapa3OrOlder(newDate) && isOfficialSemedSchool(editSchool)) {
                        setEditSchool("Nenhuma");
                        setEditTurma("");
                      } else if (newDate) {
                        if (isOlderThanEtapa1(newDate) && is5thGradeSchool(editSchool)) {
                          setEditSchool("Nenhuma");
                          setEditTurma("");
                        }
                      }
                    }}
                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                  />
                  {editBirthdate && (
                    <div className="text-[10px] text-muted-foreground">
                      Idade calculada: <b>{ageFrom(editBirthdate)} anos</b>
                    </div>
                  )}
                </div>

                {/* 3. Instituição (Escola) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground">Instituição (Escola):</label>
                  <select
                    value={editSchool}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditSchool(val);
                      if (val === "Nenhuma" || val === "Outro") {
                        setEditTurma("");
                      } else if (schoolNeedsGrade(val) && !RAIMUNDO_GRADES.includes(editGrade as any)) {
                        setEditGrade(RAIMUNDO_GRADES[0]);
                      }
                    }}
                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                  >
                    {getAvailableSchoolsForAge(editBirthdate).map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Série / Ano (para Raimundo Bezerra) */}
                {schoolNeedsGrade(editSchool) && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-foreground">Série / Ano:</label>
                    <select
                      value={editGrade}
                      onChange={(e) => setEditGrade(e.target.value)}
                      className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                    >
                      {RAIMUNDO_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 5. Turma */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground">Turma:</label>
                  <select
                    value={editTurma}
                    onChange={(e) => setEditTurma(e.target.value)}
                    disabled={editSchool === "Nenhuma" || editSchool === "Outro"}
                    className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <option value="">Sem turma</option>
                    {VALID_TURMAS.map((t) => (
                      <option key={t} value={t}>
                        Turma {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={savingEdit}
                  className="rounded-xl border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary"
                >
                  <X className="inline h-3.5 w-3.5 mr-1" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdminEdit}
                  disabled={savingEdit}
                  className="rounded-xl bg-primary px-4 py-1.5 text-xs font-black text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow"
                >
                  {savingEdit ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Salvar Alterações
                </button>
              </div>
            </div>
          )}

          {/* Seleção Única para o próprio jogador comum caso ainda não tenha definido Escola / Série na criação */}
          {isMe && !auth.profile?.isAdmin && !isEtapa3OrOlder(profile.birthdate) && (() => {
            const schoolNotSelected = !profile.school || profile.school === "Nenhuma";
            const effectiveSchool = schoolNotSelected ? selfSchool : profile.school;
            const needsGrade = !profile.grade && schoolNeedsGrade(effectiveSchool);
            const needsTurma = !profile.turma && isOfficialSemedSchool(effectiveSchool);
            if (!schoolNotSelected && !needsGrade && !needsTurma) return null;

            const availableSchools = getAvailableSchoolsForAge(profile.birthdate).filter(
              (s) => s.name !== "Nenhuma",
            );

            return (
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-primary">
                  <span className="flex items-center gap-1.5">
                    <School className="h-3.5 w-3.5" /> Completar Escola e Série (Seleção Única)
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    Após selecionar, ficará fixo e somente o ADM poderá alterar
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-foreground">Instituição (Escola):</label>
                    {schoolNotSelected ? (
                      <select
                        value={selfSchool}
                        onChange={(e) => setSelfSchool(e.target.value)}
                        className="h-9 w-full rounded-xl border bg-background px-3 text-xs font-semibold"
                      >
                        <option value="Nenhuma">Selecione sua escola...</option>
                        {availableSchools.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                        🔒 {profile.school} (Fixada)
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-foreground">Série / Ano:</label>
                    {profile.grade ? (
                      <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                        🔒 {profile.grade} (Fixada)
                      </div>
                    ) : is5thGradeSchool(effectiveSchool) ? (
                      <div className="h-9 flex items-center rounded-xl border bg-primary/10 px-3 text-xs font-extrabold text-primary">
                        5º ano
                      </div>
                    ) : schoolNeedsGrade(effectiveSchool) ? (
                      <select
                        value={selfGrade}
                        onChange={(e) => setSelfGrade(e.target.value)}
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
                        Selecione a escola
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-foreground">Turma:</label>
                    {profile.turma ? (
                      <div className="h-9 flex items-center rounded-xl border bg-muted/60 px-3 text-xs font-bold text-muted-foreground">
                        🔒 Turma {profile.turma} (Fixada)
                      </div>
                    ) : isOfficialSemedSchool(effectiveSchool) ? (
                      <select
                        value={selfTurma}
                        onChange={(e) => setSelfTurma(e.target.value)}
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

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={savingSelf || (schoolNotSelected && selfSchool === "Nenhuma")}
                    onClick={() => void handleSaveSelfInitialSetup()}
                    className="rounded-xl bg-primary px-4 py-1.5 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shadow"
                  >
                    {savingSelf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirmar e Fixar no Perfil
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Barra de Progresso de XP */}
          <div className="rounded-2xl border bg-card p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-foreground">
                <Star className="h-4 w-4 text-accent fill-accent" />
                Nível {progress.level}/{MAX_LEVEL} — {progress.title}
              </span>
              <span className="text-primary font-mono font-black">{profile.xp} XP</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {progress.isMaxLevel
                  ? "Nível Máximo alcançado!"
                  : `${progress.current}/${progress.needed} XP para o Nível ${progress.level + 1}`}
              </span>
              <span className="font-semibold text-foreground">{progress.percent}%</span>
            </div>
          </div>

          {/* Requisitos e Missões para o Próximo Nível (Visível para ADM e Jogador) */}
          {progress.nextRequirement ? (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-display text-xs font-black uppercase tracking-wider text-primary">
                  <Lock className="h-3.5 w-3.5" /> Requisitos para o Nível {progress.nextRequirement.level} ({progress.nextRequirement.emoji} {progress.nextRequirement.title})
                </span>
                {progress.isLockedByMissions ? (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                    Trava de Missões Ativa
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Em progresso
                  </span>
                )}
              </div>

              {progress.isLockedByMissions && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-semibold text-foreground flex items-start gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-600 dark:text-amber-400">XP Suficiente! </span>
                    O aluno já atingiu o XP necessário ({profile.xp} XP), mas ainda precisa cumprir as missões pendentes abaixo para destravar o Nível {progress.nextRequirement.level}.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {progress.checklist.map((item) => {
                  const diff = Math.max(0, item.required - item.current);
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                        item.met
                          ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.met ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${item.met ? "text-foreground" : "text-foreground/90"}`}>
                            {item.label}
                          </div>
                          {!item.met && (
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              {item.key === "xp"
                                ? `Faltam ${diff} XP`
                                : item.key === "matches"
                                  ? `Falta(m) ${diff} partida(s)`
                                  : item.key === "wins"
                                    ? `Falta(m) ${diff} vitória(s)`
                                    : `Falta(m) ${diff} jogo(s)`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-display font-black text-xs ${
                            item.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                          }`}
                        >
                          {item.current} / {item.required}
                        </span>
                        {item.met && (
                          <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            Concluído
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center space-y-1">
              <div className="font-display text-sm font-black text-primary flex items-center justify-center gap-1.5">
                <Trophy className="h-4 w-4" /> Nível Máximo Alcançado!
              </div>
              <p className="text-xs text-muted-foreground">
                Este jogador já atingiu o Nível 10 (Lenda da Lógica) e cumpriu todos os requisitos da plataforma.
              </p>
            </div>
          )}

          {/* Histórico e Partidas Jogadas por Jogo */}
          {(() => {
            const statsMap = aggregateStatsByGame(profile.stats ?? [], auth.adminConfig.enabledGames);
            return (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-display text-sm font-black text-foreground">
                    <Gamepad2 className="h-4 w-4 text-primary" />
                    <span>Partidas Jogadas por Jogo</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      {matchesCount} partida{matchesCount === 1 ? "" : "s"} no total
                    </span>
                    {(profile.x1Matches ?? 0) > 0 && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                        ⚔️ {profile.x1Matches} duelo{(profile.x1Matches ?? 0) === 1 ? "" : "s"} X1
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_GAME_IDS.map((gId) => {
                    const gName = GAME_NAMES[gId];
                    const statRow = statsMap.get(gId);
                    const plays = statRow ? statRow.plays : 0;
                    const bestScore = statRow ? statRow.best_score : 0;
                    const bestLevel = statRow ? statRow.best_level : 1;
                    const isEnabled = auth.adminConfig.enabledGames[gId] !== false;

                    return (
                      <div
                        key={gId}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all ${
                          plays > 0
                            ? "bg-card border-primary/30"
                            : "bg-muted/30 border-dashed opacity-70"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-display text-xs font-bold truncate text-foreground flex items-center gap-1.5">
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

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-black ${
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
            );
          })()}

          {/* Inventário Completo de Medalhas */}
          <PlayerMedalsInventory
            unlockedMedals={profile.unlockedMedals}
            customMedals={auth.adminConfig.customMedals}
            profile={profile}
            stats={profile.stats ?? []}
            isOwner={isMe}
          />

          {/* Zona de Exclusão / Mover para Lixeira pelo Administrador */}
          {auth.isAdmin && !profile.isAdmin && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-display text-xs font-black text-destructive uppercase tracking-wider">
                    <Trash2 className="h-4 w-4" /> Zona de Gestão de Perfil: Exclusão
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Ao mover para a lixeira, o perfil some de rankings, recordes e modos de jogo. Fica retido na Lixeira do ADM por 7 dias.
                  </p>
                </div>

                {profile.deletedAt ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res = await restoreStudentFromTrash(profile.id);
                        if (res.success) {
                          onStudentUpdated?.();
                          onOpenChange(false);
                        }
                      }}
                      className="rounded-xl border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Recuperar da Lixeira
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (
                          confirm(
                            `Excluir permanentemente agora o perfil de "${profile.nick}"? Esta ação não pode ser desfeita!`,
                          )
                        ) {
                          const res = await permanentlyDeleteStudent(profile.id);
                          if (res.success) {
                            onStudentUpdated?.();
                            onOpenChange(false);
                          }
                        }
                      }}
                      className="rounded-xl font-bold text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Excluir Definitivamente
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setIsDeleteModalOpen(true);
                      setDeleteStep(1);
                      setConfirmNickInput("");
                      setDeleteFeedback(null);
                    }}
                    className="rounded-xl font-bold text-xs shadow-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Excluir Aluno (Lixeira)
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Modal de Confirmação em 2 Etapas para Excluir Aluno */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="max-w-md rounded-3xl border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {deleteStep === 1
                ? "Deseja realmente excluir este perfil?"
                : "Confirmação Obrigatória de Exclusão"}
            </DialogTitle>
          </DialogHeader>

          {deleteStep === 1 && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-foreground">
                Você solicitou a exclusão do perfil do aluno:
              </p>
              <div className="rounded-2xl border bg-secondary/30 p-3.5 text-center space-y-1">
                <span className="font-display text-base font-black text-foreground block">
                  {profile.nick}
                </span>
                <span className="text-xs text-muted-foreground block">
                  {profile.full_name} • {profile.school} • Nv. {profile.level}
                </span>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Retenção de 7 dias na Lixeira do ADM
                </p>
                <p className="text-[11px] opacity-90">
                  O aluno será enviado para a <b>Lixeira</b> e sumirá de todos os rankings, recordes e modos de jogo. Durante 7 dias, apenas você (ADM) poderá visualizá-lo ou recuperá-lo. Após 7 dias, a exclusão será permanente.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteStep(2)}
                  className="rounded-xl font-bold text-xs"
                >
                  Sim, Desejo Excluir
                </Button>
              </div>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                Para confirmar a exclusão e evitar cliques acidentais, digite o nome de usuário (apelido) exatamente como exibido acima da caixa:
              </p>

              <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/10 p-3.5 text-center space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Nome do Usuário:
                </span>
                <span className="font-mono text-lg font-black text-destructive tracking-wider select-all block">
                  {profile.nick}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Digite o nome do usuário para confirmar:</Label>
                <Input
                  value={confirmNickInput}
                  onChange={(e) => setConfirmNickInput(e.target.value)}
                  placeholder={`Digite "${profile.nick}" aqui...`}
                  className="rounded-xl text-center font-mono font-bold text-sm h-10 border-destructive/50 focus-visible:ring-destructive"
                  autoFocus
                />
              </div>

              {deleteFeedback && (
                <div className="rounded-xl bg-destructive/15 p-2.5 text-center text-xs font-bold text-destructive">
                  {deleteFeedback}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteStep(1)}
                  disabled={isDeleting}
                  className="rounded-xl text-xs font-bold"
                >
                  ← Voltar
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={isDeleting}
                    className="rounded-xl text-xs font-bold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={confirmNickInput.trim() !== profile.nick.trim() || isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      setDeleteFeedback(null);
                      const res = await moveStudentToTrash(profile.id);
                      setIsDeleting(false);
                      if (res.success) {
                        setIsDeleteModalOpen(false);
                        onStudentUpdated?.();
                        onOpenChange(false);
                      } else {
                        setDeleteFeedback(res.error || "Erro ao mover para a lixeira.");
                      }
                    }}
                    className="rounded-xl font-bold text-xs"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Confirmar e Mover para Lixeira
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
