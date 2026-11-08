import { useEffect, useRef, useState } from "react";
import {
  Swords,
  Users,
  PlusCircle,
  Hash,
  Play,
  Copy,
  Check,
  Sparkles,
  Trophy,
  Loader2,
  X,
  Zap,
  Lock,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_GAME_IDS, GAME_NAMES, type GameId } from "@/lib/game-storage";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  ageFrom,
  getAgeStageInfo,
  getLocalDateKey,
  isX1WindowOpen,
  stageFromBirthdate,
  X1_DAILY_EXTRA_XP_CAP,
  X1_MIN_LEVEL,
} from "@/lib/player-profile";
import {
  closeX1Room,
  cancelAllWaitingRoomsForHost,
  cancelWaitingX1Room,
  createX1Room,
  dismissX1Invite,
  getX1LobbySnapshot,
  getX1Room,
  heartbeatOnlinePlayer,
  joinX1Room,
  joinX1RoomAsync,
  subscribeX1Updates,
  syncX1WithPlayFabCloud,
  type X1Room,
} from "@/lib/x1-challenge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStartX1Match: (room: X1Room) => void;
  onRequireLogin: () => void;
}

type LobbyTab = "online" | "criar" | "codigo";

export function X1ArenaDialog({
  open,
  onOpenChange,
  onStartX1Match,
  onRequireLogin,
}: Props) {
  const auth = usePlayerAuth();
  const profile = auth.profile;

  const [tab, setTab] = useState<LobbyTab>("online");
  const allowedX1Games = (auth.adminConfig.x1AvailableGames ?? ["rpg", "logica", "porcentagem", "minado"]).filter(
    (id) => auth.adminConfig.enabledGames[id] !== false,
  );
  const [selectedGame, setSelectedGame] = useState<GameId>(allowedX1Games[0] ?? "rpg");
  const [waitingRoomCode, setWaitingRoomCode] = useState<string | null>(null);
  const waitingRoomCodeRef = useRef<string | null>(null);
  const matchStartedRef = useRef(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [onlyMyStage, setOnlyMyStage] = useState(false);
  const [tick, setTick] = useState(0);

  const enabledGameIds = ALL_GAME_IDS.filter((id) => auth.adminConfig.enabledGames[id]);

  // Se o jogador estiver fora da tela de espera da sala, destrói imediatamente qualquer sala em espera órfã criada por ele
  useEffect(() => {
    waitingRoomCodeRef.current = waitingRoomCode;
    if (!profile?.id) return;
    if (!open || !waitingRoomCode) {
      if (!matchStartedRef.current) {
        cancelAllWaitingRoomsForHost(profile.id);
      }
    }
  }, [open, waitingRoomCode, profile?.id]);

  // Se o jogador convidado recusar o desafio direto, encerra a sala de espera do anfitrião e avisa
  useEffect(() => {
    if (!open || !waitingRoomCode || !profile?.id) return;
    const handleRejected = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { roomCode?: string; rejectedByNick?: string }
        | undefined;
      if (!detail?.roomCode || detail.roomCode === waitingRoomCode) {
        cancelWaitingX1Room(waitingRoomCode, profile.id);
        waitingRoomCodeRef.current = null;
        setWaitingRoomCode(null);
        setError(`${detail?.rejectedByNick || "O colega"} recusou o seu desafio X1.`);
      }
    };
    window.addEventListener("desafios:x1-invite-rejected", handleRejected);
    return () => window.removeEventListener("desafios:x1-invite-rejected", handleRejected);
  }, [open, waitingRoomCode, profile?.id]);

  // Keep player presence heartbeat active and listen for room updates (fast 1.2s polling when waiting for challenger)
  useEffect(() => {
    if (!open || !profile) return;

    const sendHeartbeat = () => {
      const pStage = stageFromBirthdate(profile.birthdate, new Date(), profile.school);
      heartbeatOnlinePlayer({
        playerId: profile.id,
        nick: profile.nick,
        fullName: profile.full_name,
        school: profile.school,
        level: profile.level,
        age: ageFrom(profile.birthdate),
        stage: pStage.id,
        inRoomCode: waitingRoomCode,
      });
      void syncX1WithPlayFabCloud(waitingRoomCode).then(() => {
        setTick((t) => t + 1);
      });
      setTick((t) => t + 1);
    };

    sendHeartbeat();
    const unsub = subscribeX1Updates(() => setTick((t) => t + 1));
    const pollMs = waitingRoomCode ? 1200 : 2500;
    const timer = window.setInterval(sendHeartbeat, pollMs);

    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [open, profile, waitingRoomCode]);

  // Watch waiting room: check 2-min expiry and when guest joins (countdown/playing), launch X1 match!
  useEffect(() => {
    if (!waitingRoomCode) return;
    const room = getX1Room(waitingRoomCode);
    if (!room) {
      waitingRoomCodeRef.current = null;
      setWaitingRoomCode(null);
      return;
    }
    const expiresAt = room.expiresAt ?? (room.createdAt + 120_000);
    if (Date.now() >= expiresAt && room.status === "waiting") {
      if (profile) cancelWaitingX1Room(waitingRoomCode, profile.id);
      waitingRoomCodeRef.current = null;
      setWaitingRoomCode(null);
      setError("Tempo limite de espera de 2 minutos esgotado. A sala foi removida automaticamente.");
      return;
    }
    if ((room.status === "countdown" || room.status === "playing") && room.guest) {
      matchStartedRef.current = true;
      waitingRoomCodeRef.current = null;
      setWaitingRoomCode(null);
      onOpenChange(false);
      onStartX1Match(room);
    }
  }, [waitingRoomCode, tick, profile, onOpenChange, onStartX1Match]);

  // Cleanup imediato da sala de espera ao fechar aba, recarregar página ou desmontar diálogo
  useEffect(() => {
    const handleUnload = () => {
      const code = waitingRoomCodeRef.current;
      if (code && !matchStartedRef.current && profile?.id) {
        cancelWaitingX1Room(code, profile.id);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      const code = waitingRoomCodeRef.current;
      if (code && !matchStartedRef.current && profile?.id) {
        cancelWaitingX1Room(code, profile.id);
        waitingRoomCodeRef.current = null;
      }
    };
  }, [profile?.id]);

  if (!profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Swords className="h-6 w-6 text-accent" /> Arena de Desafio X1 Online
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              Para criar uma sala X1, ver seus colegas online e disputar partidas 1 contra 1, entre
              primeiro no seu perfil de jogador!
            </p>
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl font-bold"
              onClick={() => {
                onOpenChange(false);
                onRequireLogin();
              }}
            >
              Entrar no meu perfil agora
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const cfg = auth.adminConfig;
  const openHour = cfg.x1OpenHour ?? 7;
  const closeHour = cfg.x1CloseHour ?? 19;
  const isTimeOpen = isX1WindowOpen(new Date(), openHour, closeHour, cfg.x1ForceOpen ?? false);
  const meetsLevel = profile.level >= X1_MIN_LEVEL;
  const todayKey = getLocalDateKey();
  const dailyX1Xp =
    profile.dailyXpDate === todayKey ? Math.max(0, profile.dailyX1Xp ?? 0) : 0;

  if (!meetsLevel) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Lock className="h-6 w-6 text-accent" /> Arena X1 Bloqueada (Nível {X1_MIN_LEVEL}+)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <div className="rounded-2xl border bg-secondary/40 p-5 space-y-2">
              <p className="font-display text-lg font-extrabold text-foreground">
                Alcance o Nível {X1_MIN_LEVEL} (🤖 Programador Júnior) para liberar!
              </p>
              <p className="text-xs text-muted-foreground">
                Você está atualmente no <b>Nível {profile.level}</b> ({profile.xp} XP). Continue
                jogando os desafios da plataforma e completando suas missões de nível para
                desbloquear a Arena X1 de Batalha!
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => onOpenChange(false)}
              className="h-12 w-full rounded-2xl font-bold"
            >
              Continuar Subindo de Nível
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isTimeOpen) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Clock className="h-6 w-6 text-accent" /> Arena X1 Fechada Agora
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <div className="rounded-2xl border bg-secondary/40 p-5 space-y-2">
              <p className="font-display text-lg font-extrabold text-foreground">
                Horário de Funcionamento: {String(openHour).padStart(2, "0")}:00 às{" "}
                {String(closeHour).padStart(2, "0")}:00
              </p>
              <p className="text-xs text-muted-foreground">
                A Arena X1 de Batalha funciona exclusivamente das{" "}
                <b>{String(openHour).padStart(2, "0")}h da manhã</b> até as{" "}
                <b>{String(closeHour).padStart(2, "0")}h da noite</b>. Volte dentro desse horário
                para desafiar seus colegas!
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => onOpenChange(false)}
              className="h-12 w-full rounded-2xl font-bold"
            >
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const myStage = stageFromBirthdate(profile.birthdate, new Date(), profile.school);
  const snapshot = getX1LobbySnapshot(profile.id);
  const allOtherOnline = snapshot.onlinePlayers.filter((p) => p.playerId !== profile.id);
  const otherOnlinePlayers = onlyMyStage
    ? allOtherOnline.filter((p) => (p.stage ?? "etapa_1") === myStage.id)
    : allOtherOnline;
  const visibleOpenRooms = onlyMyStage
    ? snapshot.openRooms.filter((r) => (r.host.stage ?? "etapa_1") === myStage.id)
    : snapshot.openRooms;
  const waitingRoom = waitingRoomCode ? getX1Room(waitingRoomCode) : null;

  function handleCreateRoom(inviteTargetPlayerId?: string) {
    if (!profile) return;
    setError(null);
    matchStartedRef.current = false;
    const room = createX1Room({
      host: {
        playerId: profile.id,
        nick: profile.nick,
        school: profile.school,
        level: profile.level,
        age: ageFrom(profile.birthdate),
        stage: myStage.id,
      },
      gameId: selectedGame,
      inviteTargetPlayerId,
    });
    waitingRoomCodeRef.current = room.code;
    setWaitingRoomCode(room.code);
  }

  async function handleJoinRoomByCode(codeToJoin: string) {
    if (!profile || isJoining) return;
    setError(null);
    setIsJoining(true);
    try {
      const res = await joinX1RoomAsync({
        code: codeToJoin,
        guest: {
          playerId: profile.id,
          nick: profile.nick,
          school: profile.school,
          level: profile.level,
        },
      });
      if (res.error || !res.room) {
        setError(res.error ?? "Não foi possível entrar na sala.");
        return;
      }
      matchStartedRef.current = true;
      waitingRoomCodeRef.current = null;
      setWaitingRoomCode(null);
      onOpenChange(false);
      onStartX1Match(res.room);
    } finally {
      setIsJoining(false);
    }
  }

  async function copyRoomCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          const codeToCancel = waitingRoomCodeRef.current ?? waitingRoomCode;
          if (codeToCancel && !matchStartedRef.current) {
            cancelWaitingX1Room(codeToCancel, profile?.id);
          }
          if (profile?.id && !matchStartedRef.current) {
            cancelAllWaitingRoomsForHost(profile.id);
          }
          waitingRoomCodeRef.current = null;
          setWaitingRoomCode(null);
        } else {
          matchStartedRef.current = false;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <Swords className="h-6 w-6 text-accent" /> Arena de Desafio X1 (1 vs 1)
          </DialogTitle>
        </DialogHeader>

        {/* Modalidades Disponíveis na Arena X1 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-display font-extrabold text-foreground">
            <Zap className="h-4 w-4 text-accent" />
            <span>
              Jogos da Arena:{" "}
              <b className="text-primary font-black">
                {allowedX1Games.map((g) => GAME_NAMES[g]).join(" • ")}
              </b>
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-semibold">
            Duelos 1v1 em tempo real
          </span>
        </div>

        {/* TELA DE ESPERA DA SALA CRIADA */}
        {waitingRoom ? (
          <div className="space-y-5 py-2">
            <div className="rounded-3xl border-2 border-primary/40 bg-gradient-to-b from-primary/10 to-card p-6 text-center space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-extrabold uppercase text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando Oponente Entrar...
              </span>
              <div className="text-xs text-muted-foreground">
                Passe este código de 4 dígitos para o colega que vai duelar com você ou peça para
                ele clicar na sua sala na aba <b>Salas & Online</b>:
              </div>

              <div className="flex items-center justify-center gap-3">
                <span className="rounded-2xl border-2 border-primary bg-background px-6 py-3 font-mono text-4xl font-extrabold tracking-[0.25em] text-primary shadow-sm">
                  {waitingRoom.code}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyRoomCode(waitingRoom.code)}
                  className="h-12 rounded-2xl px-4 font-bold"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4 text-success" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" /> Copiar
                    </>
                  )}
                </Button>
              </div>

              {/* Temporizador regressivo de expiração da sala (2 minutos) */}
              {(() => {
                const exp = waitingRoom.expiresAt ?? (waitingRoom.createdAt + 120_000);
                const rem = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
                const m = Math.floor(rem / 60);
                const s = String(rem % 60).padStart(2, "0");
                return (
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-500">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Tempo restante para oponente entrar: <b>{m}:{s}</b> (expira em 2 min)</span>
                  </div>
                );
              })()}

              <div className="pt-1 text-xs font-bold text-foreground">
                Modalidade escolhida:{" "}
                <span className="text-accent">{GAME_NAMES[waitingRoom.gameId]}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center space-y-1.5">
              <span className="font-display text-xs font-bold text-primary flex items-center justify-center gap-1.5">
                <Users className="h-4 w-4" /> Desafio Online 1v1 entre Alunos
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Compartilhe o código de 4 dígitos <b>#{waitingRoom.code}</b> com seu colega ou peça para ele entrar pela lista de salas da Arena X1!
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                cancelWaitingX1Room(waitingRoom.code, profile?.id);
                if (profile?.id) cancelAllWaitingRoomsForHost(profile.id);
                waitingRoomCodeRef.current = null;
                setWaitingRoomCode(null);
              }}
              className="w-full rounded-2xl text-destructive"
            >
              <X className="mr-1.5 h-4 w-4" /> Cancelar Sala
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Convites Diretos Recebidos */}
            {snapshot.myInvites.length > 0 && (
              <div className="space-y-2">
                {snapshot.myInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="animate-pop-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent bg-accent/15 p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-accent" /> {inv.fromNick} desafiou você para um
                        X1!
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Jogo: <b>{GAME_NAMES[inv.gameId]}</b> • Sala <b>#{inv.roomCode}</b> (
                        {inv.fromSchool})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleJoinRoomByCode(inv.roomCode)}
                        className="rounded-xl font-bold"
                      >
                        Aceitar X1
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          dismissX1Invite(inv.id);
                          setTick((t) => t + 1);
                        }}
                        className="rounded-xl"
                      >
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Abas do Lobby */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-1">
              <button
                type="button"
                onClick={() => {
                  setTab("online");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-bold transition-colors ${
                  tab === "online" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Users className="h-4 w-4" /> Salas & Online
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("criar");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-bold transition-colors ${
                  tab === "criar" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                }`}
              >
                <PlusCircle className="h-4 w-4" /> Criar Sala X1
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("codigo");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs sm:text-sm font-bold transition-colors ${
                  tab === "codigo" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Hash className="h-4 w-4" /> Digitar Código
              </button>
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive">
                {error}
              </p>
            )}

            {/* ABA 1: SALAS ABERTAS & JOGADORES ONLINE */}
            {tab === "online" && (
              <div className="space-y-4">
                {/* Filtro Principal de Etapa por Faixa Etária */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
                  <div className="text-xs">
                    <span className="font-display font-extrabold text-primary">
                      {myStage.emoji} Sua Etapa: {myStage.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {onlyMyStage
                        ? "Pareando apenas com oponentes da sua faixa etária"
                        : "Exibindo todas as faixas etárias"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOnlyMyStage(true)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                        onlyMyStage
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground"
                      }`}
                    >
                      {myStage.shortLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOnlyMyStage(false)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                        !onlyMyStage
                          ? "border-accent bg-accent text-accent-foreground"
                          : "bg-card text-muted-foreground"
                      }`}
                    >
                      🌐 Todas
                    </button>
                  </div>
                </div>

                {/* Salas Abertas */}
                <div className="rounded-2xl border bg-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-extrabold flex items-center gap-1.5">
                      <Swords className="h-4 w-4 text-accent" /> Salas Abertas Aguardando Oponente (
                      {visibleOpenRooms.length})
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setTab("criar")}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      + Nova Sala
                    </Button>
                  </div>

                  {visibleOpenRooms.length === 0 ? (
                    <div className="rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
                      Nenhuma sala aguardando no momento. Clique em <b>Criar Sala X1</b> para abrir
                      um desafio!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {visibleOpenRooms.map((r) => {
                        const roomExpiresAt = r.expiresAt ?? (r.createdAt + 120_000);
                        const roomSecs = Math.max(0, Math.ceil((roomExpiresAt - Date.now()) / 1000));
                        return (
                          <div
                            key={r.code}
                            className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-lg bg-primary/15 px-2 py-0.5 font-mono text-xs font-extrabold text-primary">
                                  #{r.code}
                                </span>
                                <span className="font-display text-sm font-bold truncate">
                                  {r.host.nick}
                                </span>
                                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold">
                                  {getAgeStageInfo(r.host.stage ?? "etapa_1").shortLabel}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  Nv. {r.host.level}
                                </span>
                                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                                  ⏱️ {Math.floor(roomSecs / 60)}:{String(roomSecs % 60).padStart(2, "0")}
                                </span>
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                Jogo: <b className="text-foreground">{GAME_NAMES[r.gameId]}</b> •{" "}
                                {r.host.school}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isJoining}
                              onClick={() => void handleJoinRoomByCode(r.code)}
                              className="rounded-xl font-bold shrink-0"
                            >
                              {isJoining ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Play className="mr-1 h-3.5 w-3.5" />
                              )}
                              Entrar no X1
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Jogadores Online Agora */}
                <div className="rounded-2xl border bg-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-extrabold flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-primary" /> Jogadores Disponíveis Online (
                      {otherOnlinePlayers.length})
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <span className="h-2 w-2 rounded-full bg-success animate-ping" /> Ao vivo
                    </span>
                  </div>

                  {otherOnlinePlayers.length === 0 ? (
                    <div className="rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
                      Nenhum outro colega com a Arena aberta neste instante. Você também pode criar
                      uma sala e passar o <b>código de 4 dígitos</b> para o colega ao lado!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {otherOnlinePlayers.map((p) => (
                        <div
                          key={p.playerId}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-display text-sm font-bold truncate">
                              {p.nick}{" "}
                              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold">
                                {getAgeStageInfo(p.stage ?? "etapa_1").shortLabel}
                              </span>{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                • Nv. {p.level}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{p.school}</div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCreateRoom(p.playerId)}
                            className="rounded-xl font-bold shrink-0"
                          >
                            <Swords className="mr-1.5 h-3.5 w-3.5 text-accent" /> Desafiar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 2: CRIAR SALA X1 */}
            {tab === "criar" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-secondary/30 p-3.5 text-xs text-muted-foreground">
                  Escolha qual jogo será disputado no X1. Na <b>Batalha de Robôs</b>, um jogador
                  controla o Raio Azul e o outro controla o Raio Vermelho em um cabo de guerra! Nos
                  demais jogos, vence quem fizer mais pontos na corrida ao vivo!
                </div>

                <div className="space-y-1.5">
                  <Label className="font-display font-bold">
                    Jogos Habilitados para a Arena X1 (Definidos pela Coordenação)
                  </Label>
                  <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {allowedX1Games.map((id) => {
                      const active = selectedGame === id;
                      const isRobotClash = id === "rpg";
                      const isMinado = id === "minado";
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedGame(id)}
                          className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                            active
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "bg-card hover:bg-secondary/50"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full gap-1">
                            <span className="font-display text-sm font-extrabold">
                              {GAME_NAMES[id]}
                            </span>
                            {isRobotClash && (
                              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                                5 Vidas (Cabo de Guerra)
                              </span>
                            )}
                            {isMinado && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                1v1 por Turnos
                              </span>
                            )}
                          </div>
                          <span className="mt-0.5 text-[11px] text-muted-foreground">
                            {isRobotClash
                              ? "5 vidas para cada! Super raio tira 3 vidas."
                              : isMinado
                                ? "Tabuleiro compartilhado, bombas, bônus e 20s por questão."
                                : "Mesmas questões na mesma ordem geradas pela sala."}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  onClick={() => handleCreateRoom()}
                  className="h-13 w-full rounded-2xl font-display text-base font-extrabold"
                >
                  <Sparkles className="mr-2 h-5 w-5" /> Abrir Sala X1 ({GAME_NAMES[selectedGame]})
                </Button>
              </div>
            )}

            {/* ABA 3: ENTRAR COM CÓDIGO DE 4 DÍGITOS */}
            {tab === "codigo" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleJoinRoomByCode(joinCodeInput);
                }}
                className="space-y-4 py-2"
              >
                <div className="space-y-1.5 text-center">
                  <Label htmlFor="x1-room-code" className="text-sm font-bold">
                    Digite o código de 4 dígitos da sala do seu colega
                  </Label>
                  <Input
                    id="x1-room-code"
                    inputMode="numeric"
                    maxLength={4}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                    autoFocus
                    required
                    disabled={isJoining}
                    className="mx-auto h-16 max-w-[220px] rounded-2xl text-center font-mono text-3xl font-extrabold tracking-[0.3em]"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={joinCodeInput.length < 4 || isJoining}
                  className="h-13 w-full rounded-2xl font-display text-base font-extrabold"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Conectando à Sala...
                    </>
                  ) : (
                    <>
                      <Swords className="mr-2 h-5 w-5" /> Entrar na Sala e Começar X1!
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="rounded-2xl bg-accent/10 px-3.5 py-2.5 text-center text-xs space-y-1">
              <div className="font-bold text-foreground flex items-center justify-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-accent" />
                XP Extra Diário do X1:{" "}
                <span className="text-primary">
                  {dailyX1Xp} / {X1_DAILY_EXTRA_XP_CAP} XP hoje
                </span>{" "}
                (Partidas Ilimitadas)
              </div>
              <div className="text-[11px] text-muted-foreground">
                Aberta das {String(openHour).padStart(2, "0")}:00 às{" "}
                {String(closeHour).padStart(2, "0")}:00 para alunos Nível {X1_MIN_LEVEL}+.
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
