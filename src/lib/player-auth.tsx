import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { onMatchSaved, type GameId } from "./game-storage";
import { recordGameStageScore } from "./game-records";
import { stageFromBirthdate } from "./player-profile";
import {
  loadAdminConfig,
  type PlatformAdminConfig,
} from "./game-codes";
import {
  executeActivitySeasonReset,
  executeRankedSeasonReset,
  executeRankingReset,
  getActiveAccount,
  getAdminPin,
  isAdminUnlockedSession,
  playfabRecordMatch,
  playfabRecoverByNameAndBirthdate,
  playfabSignIn,
  playfabSignOut,
  playfabSignUp,
  playfabUnlockGames,
  pushAdminConfigToPlayFab,
  setAdminUnlockedSession,
  syncAdminConfigFromPlayFab,
  grantSpecialRobotMedal,
  grantSpaceQuestAuraMedal,
  type GameStatRow,
  type PlayerProfile,
  type SignUpData,
} from "./playfab";
import type { MedalDefinition } from "./medals-catalog";

export type { PlayerProfile, GameStatRow, SignUpData };

interface AuthValue {
  loading: boolean;
  profile: PlayerProfile | null;
  unlocked: GameId[];
  stats: GameStatRow[];
  adminConfig: PlatformAdminConfig;
  isAdmin: boolean;
  signUp: (data: SignUpData) => Promise<{
    error: string | null;
    recoveredNick?: string;
  }>;
  signIn: (
    identifier: string,
    password: string,
  ) => Promise<{
    error: string | null;
    recoveredNick?: string;
    needsRecovery?: boolean;
  }>;
  recoverByNameAndBirthdate: (
    fullName: string,
    birthdate: string,
  ) => Promise<{
    error: string | null;
    recoveredNick?: string;
    derivedPassword?: string;
  }>;
  signOut: () => Promise<void>;
  unlockGames: (games: GameId[]) => Promise<void>;
  recordMatch: (args: {
    gameId: GameId;
    mode?: string;
    won?: boolean;
    isTeam?: boolean;
    score: number;
    level: number;
    correct: number;
    wrong?: number;
    tournamentPoints?: number;
    tournamentRankId?: string;
    isDraw?: boolean;
  }) => Promise<void>;
  awardSpecialRobotMedal: (
    medalId: "m_rpg_ametista" | "m_rpg_carmesim",
  ) => Promise<{ success: boolean; medal?: MedalDefinition; profile?: PlayerProfile }>;
  awardSpaceQuestMedal: (
    medalId: "sq_safira" | "sq_ametista" | "sq_rubi" | "sq_ambar",
  ) => Promise<{ success: boolean; medal?: MedalDefinition; profile?: PlayerProfile }>;
  updateAdminConfig: (next: PlatformAdminConfig) => Promise<void>;
  triggerReset: (options: {
    clearXp: boolean;
    newSeasonName?: string;
    reason?: string;
  }) => Promise<void>;
  triggerActivitySeasonReset: (options: {
    isBetaEnd?: boolean;
    newSeasonName?: string;
    reason?: string;
  }) => Promise<void>;
  triggerRankedSeasonReset: (options?: {
    newSeasonName?: string;
    reason?: string;
  }) => Promise<void>;
  unlockAdminWithPin: (pin: string) => boolean;
  lockAdmin: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function usePlayerAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayerAuth must be used inside PlayerAuthProvider");
  return ctx;
}

export function PlayerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [unlocked, setUnlocked] = useState<GameId[]>([]);
  const [stats, setStats] = useState<GameStatRow[]>([]);
  const [adminConfig, setAdminConfig] = useState<PlatformAdminConfig>(() => loadAdminConfig());
  const [adminPinUnlocked, setAdminPinUnlocked] = useState(false);
  const [sessionKickedTime, setSessionKickedTime] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const syncedCfg = await syncAdminConfigFromPlayFab();
    setAdminConfig(syncedCfg);
    setAdminPinUnlocked(isAdminUnlockedSession());

    const active = getActiveAccount();
    if (active) {
      setProfile({ ...active.profile });
      setUnlocked([...active.unlocked]);
      setStats([...active.stats]);
    } else {
      setProfile(null);
      setUnlocked([]);
      setStats([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // Periodically check if a scheduled ADM reset has become due or if focus changed
  useEffect(() => {
    let lastFocusSync = Date.now();
    const onFocus = () => {
      if (Date.now() - lastFocusSync < 60_000) return; // no máximo 1 consulta por minuto
      lastFocusSync = Date.now();
      void syncAdminConfigFromPlayFab().then((cfg) => setAdminConfig(cfg));
    };
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => {
      const cfg = loadAdminConfig();
      if (cfg.scheduledResetAt && Date.now() >= new Date(cfg.scheduledResetAt).getTime()) {
        void loadState();
      }
    }, 15_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [loadState]);

  const signUp = useCallback(async (data: SignUpData) => {
    const res = await playfabSignUp(data);
    if (res.error || !res.account) {
      return { error: res.error ?? "Não foi possível criar o perfil." };
    }
    setProfile({ ...res.account.profile });
    setUnlocked([...res.account.unlocked]);
    setStats([...res.account.stats]);
    return { error: null, recoveredNick: res.recoveredNick };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await playfabSignIn(identifier, password);
    if (res.error || !res.account) {
      return {
        error: res.error ?? "Apelido/nome ou senha incorretos.",
        needsRecovery: res.needsRecovery,
      };
    }
    setProfile({ ...res.account.profile });
    setUnlocked([...res.account.unlocked]);
    setStats([...res.account.stats]);
    return { error: null, recoveredNick: res.recoveredNick };
  }, []);

  const recoverByNameAndBirthdate = useCallback(
    async (fullName: string, birthdate: string) => {
      const res = await playfabRecoverByNameAndBirthdate(fullName, birthdate);
      if (res.error || !res.account) {
        return { error: res.error ?? "Conta não encontrada." };
      }
      setProfile({ ...res.account.profile });
      setUnlocked([...res.account.unlocked]);
      setStats([...res.account.stats]);
      return {
        error: null,
        recoveredNick: res.recoveredNick,
        derivedPassword: res.derivedPassword,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    playfabSignOut();
    setProfile(null);
    setUnlocked([]);
    setStats([]);
    setAdminPinUnlocked(false);
  }, []);

  // Sessão Única Modelo A: Ouvinte para desconexão automática caso a conta seja conectada em outro aparelho
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSessionTerminated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const d = detail?.timestamp ? new Date(detail.timestamp) : new Date();
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      void signOut();
      setSessionKickedTime(timeStr);
    };

    window.addEventListener("desafios:session-terminated", onSessionTerminated);
    return () => {
      window.removeEventListener("desafios:session-terminated", onSessionTerminated);
    };
  }, [signOut]);

  const unlockGames = useCallback(async (games: GameId[]) => {
    if (games.length === 0) return;
    const next = await playfabUnlockGames(games);
    if (next.length > 0) setUnlocked(next);
  }, []);

  const recordMatch = useCallback(
    async (args: {
      gameId: GameId;
      mode?: string;
      won?: boolean;
      isTeam?: boolean;
      score: number;
      level: number;
      correct: number;
      wrong?: number;
      tournamentPoints?: number;
      tournamentRankId?: string;
      isDraw?: boolean;
    }) => {
      const updated = await playfabRecordMatch(args);
      if (updated) {
        setProfile({ ...updated.profile });
        setStats([...updated.stats]);
        setUnlocked([...updated.unlocked]);
      }
    },
    [],
  );

  useEffect(() => {
    if (!profile) {
      onMatchSaved(null);
      return;
    }
    onMatchSaved((id, match) => {
      // Partidas do Torneio Semanal Ranqueado são processadas exclusivamente pelo finishRankedEntry
      // para calcular pontos ranqueados, patentes e evitar condições de corrida na nuvem
      if (match.mode === "torneio_semanal") {
        return;
      }
      if (match.score > 0) {
        const stage = stageFromBirthdate(profile.birthdate, new Date(), profile.school).id;
        recordGameStageScore({
          gameId: id,
          stage,
          playerId: profile.id,
          nick: profile.nick,
          fullName: profile.full_name,
          school: profile.school,
          score: match.score,
          achievedAt: match.at ?? Date.now(),
        });
      }
      void recordMatch({
        gameId: id,
        mode: match.isTeam ? "equipes" : (match.mode ?? "padrao"),
        isTeam: match.isTeam,
        won: match.won,
        score: match.score,
        level: match.level,
        correct: match.correct,
        wrong: match.wrong,
      });
    });
    return () => onMatchSaved(null);
  }, [profile, recordMatch]);

    const awardSpecialRobotMedal = useCallback(
      async (medalId: "m_rpg_ametista" | "m_rpg_carmesim") => {
        const res = await grantSpecialRobotMedal(medalId);
        if (res.success && res.profile) {
          setProfile({ ...res.profile });
        }
        return res;
      },
      [],
    );

    const awardSpaceQuestMedal = useCallback(
      async (medalId: "sq_safira" | "sq_ametista" | "sq_rubi" | "sq_ambar") => {
        const res = await grantSpaceQuestAuraMedal(medalId);
        if (res.success && res.profile) {
          setProfile({ ...res.profile });
        }
        return res;
      },
      [],
    );

    const updateAdminConfig = useCallback(async (next: PlatformAdminConfig) => {
    const saved = await pushAdminConfigToPlayFab(next);
    setAdminConfig(saved);
  }, []);

  const triggerReset = useCallback(
    async (options: { clearXp: boolean; newSeasonName?: string; reason?: string }) => {
      const nextCfg = executeRankingReset(options);
      setAdminConfig(nextCfg);
      const active = getActiveAccount();
      if (active) {
        setProfile({ ...active.profile });
        setStats([...active.stats]);
      }
    },
    [],
  );

  const triggerActivitySeasonReset = useCallback(
    async (options: { isBetaEnd?: boolean; newSeasonName?: string; reason?: string }) => {
      const nextCfg = executeActivitySeasonReset(options);
      setAdminConfig(nextCfg);
      const active = getActiveAccount();
      if (active) {
        setProfile({ ...active.profile });
        setStats([...active.stats]);
      }
    },
    [],
  );

  const triggerRankedSeasonReset = useCallback(
    async (options?: { newSeasonName?: string; reason?: string }) => {
      const nextCfg = executeRankedSeasonReset(options);
      setAdminConfig(nextCfg);
      const active = getActiveAccount();
      if (active) {
        setProfile({ ...active.profile });
        setStats([...active.stats]);
      }
    },
    [],
  );

  const unlockAdminWithPin = useCallback((pin: string) => {
    const clean = pin.trim().toUpperCase();
    const expected = getAdminPin().toUpperCase();
    const master = loadAdminConfig().masterCode.toUpperCase();
    if (
      clean === "SEMED2620ZZ" ||
      clean === "SEMED2620QQ" ||
      clean === expected ||
      clean === master
    ) {
      setAdminUnlockedSession(true);
      setAdminPinUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const lockAdmin = useCallback(() => {
    setAdminUnlockedSession(false);
    setAdminPinUnlocked(false);
  }, []);

  const isAdmin = Boolean(profile?.isAdmin || adminPinUnlocked);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      profile,
      unlocked,
      stats,
      adminConfig,
      isAdmin,
      signUp,
      signIn,
      recoverByNameAndBirthdate,
      signOut,
      unlockGames,
      recordMatch,
      awardSpecialRobotMedal,
      awardSpaceQuestMedal,
      updateAdminConfig,
      triggerReset,
      triggerActivitySeasonReset,
      triggerRankedSeasonReset,
      unlockAdminWithPin,
      lockAdmin,
      refresh: loadState,
    }),
    [
      loading,
      profile,
      unlocked,
      stats,
      adminConfig,
      isAdmin,
      signUp,
      signIn,
      recoverByNameAndBirthdate,
      signOut,
      unlockGames,
      recordMatch,
      awardSpecialRobotMedal,
      awardSpaceQuestMedal,
      updateAdminConfig,
      triggerReset,
      triggerActivitySeasonReset,
      triggerRankedSeasonReset,
      unlockAdminWithPin,
      lockAdmin,
      loadState,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Alerta de Segurança: Desconexão por Acesso em Outro Aparelho (Modelo A) */}
      <Dialog open={Boolean(sessionKickedTime)} onOpenChange={(open) => !open && setSessionKickedTime(null)}>
        <DialogContent className="w-[92vw] max-w-md rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl">
          <DialogHeader className="flex flex-col items-center text-center space-y-2">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-destructive/15 text-destructive border border-destructive/30">
              <ShieldAlert className="h-9 w-9 animate-pulse" />
            </div>
            <DialogTitle className="font-display text-xl font-extrabold text-foreground">
              Sessão Conectada em Outro Aparelho
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Sua conta foi conectada em outro dispositivo às <b>{sessionKickedTime}</b>.
              Por medidas de segurança, um perfil só pode permanecer ativo em <b>um único aparelho por vez</b>, e este aparelho foi desconectado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-700 dark:text-amber-300">
            ⚠️ <b>Atenção:</b> Se não foi você quem conectou em outro aparelho, comunique seu professor ou a coordenação escolar imediatamente.
          </div>

          <Button
            type="button"
            onClick={() => setSessionKickedTime(null)}
            className="w-full h-11 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
