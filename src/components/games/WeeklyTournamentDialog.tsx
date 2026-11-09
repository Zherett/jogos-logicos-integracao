import { useEffect, useRef, useState } from "react";
import {
  Trophy,
  Flame,
  Clock,
  Lock,
  Play,
  Medal,
  Zap,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Shield,
  Coins,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { GameId } from "@/lib/game-storage";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  AGE_STAGES,
  getTournamentRank,
  getWeeklyTournamentSnapshot,
  syncWeeklyTournamentWithPlayFab,
  spendPaidTournamentEntry,
  TOURNAMENT_DAILY_FREE_ENTRIES,
  TOURNAMENT_PAID_ENTRY_COST,
  TOURNAMENT_DAILY_ENTRIES_LIMIT,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  TOURNAMENT_XP_PER_ENTRY,
} from "@/lib/weekly-tournament";
import { stageFromBirthdate, type AgeStageId } from "@/lib/player-profile";
import { TournamentRankBadge } from "./TournamentRankBadge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStartRankedEntry: (gameId: GameId) => void;
  onRequireLogin: () => void;
}

function WeeklyTournamentTop5Skeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando Top 5 da semana...">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 animate-pulse"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black border shadow-xs ${
                idx === 0
                  ? "bg-yellow-400/20 text-yellow-600 border-yellow-500/30"
                  : idx === 1
                    ? "bg-slate-300/25 text-slate-500 border-slate-400/30"
                    : idx === 2
                      ? "bg-amber-700/20 text-amber-600 border-amber-800/30"
                      : "bg-secondary/70 text-muted-foreground/60 border-border/50"
              }`}
            >
              {idx + 1}º
            </span>
            <div className="h-6 w-14 rounded-lg bg-muted/60" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-3.5 rounded-md bg-muted/80"
                  style={{ width: `${60 + idx * 16}px` }}
                />
                <div className="h-3 w-12 rounded-md bg-muted/50" />
              </div>
              <div className="h-2.5 w-32 rounded-md bg-muted/40" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="h-4 w-14 rounded-md bg-accent/20" />
            <div className="h-2.5 w-10 rounded-md bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeeklyTournamentDialog({
  open,
  onOpenChange,
  onStartRankedEntry,
  onRequireLogin,
}: Props) {
  const auth = usePlayerAuth();
  const profile = auth.profile;
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"desafio" | "ranking">("desafio");
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [spendingEntry, setSpendingEntry] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const myStageId = profile
    ? stageFromBirthdate(profile.birthdate, new Date(), profile.school).id
    : "etapa_1";
  const [selectedStage, setSelectedStage] = useState<AgeStageId | "TODAS">(myStageId);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current && profile) {
      const sId = stageFromBirthdate(profile.birthdate, new Date(), profile.school).id;
      // Normal students are locked to their own stage; ADM can switch
      setSelectedStage(sId);
      setActiveTab("desafio");
    }
    prevOpenRef.current = open;
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setInitialLoading(true);
    void syncWeeklyTournamentWithPlayFab()
      .then(() => {
        if (active) setTick((t) => t + 1);
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("desafios:weekly-tournament-updated", handleUpdate);
    const id = window.setInterval(() => {
      void syncWeeklyTournamentWithPlayFab().then(() => setTick((t) => t + 1));
    }, 5000);
    return () => {
      active = false;
      window.removeEventListener("desafios:weekly-tournament-updated", handleUpdate);
      window.clearInterval(id);
    };
  }, [open]);

  if (!profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Trophy className="h-6 w-6 text-accent" /> Torneio Semanal Ranqueado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              Entre no seu perfil de jogador para disputar o Torneio Semanal Ranqueado da sua etapa,
              subir de divisão e conquistar medalhas!
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

  // Non-admin students are strictly restricted to their stage
  const effectiveStage = auth.isAdmin ? selectedStage : myStageId;
  const snap = getWeeklyTournamentSnapshot(profile, effectiveStage);

  if (!snap.canEnterLevel) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Lock className="h-6 w-6 text-accent" /> Torneio Semanal (Nível {TOURNAMENT_MIN_LEVEL}+)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <div className="rounded-2xl border bg-secondary/40 p-5 space-y-2">
              <p className="font-display text-lg font-extrabold text-foreground">
                Alcance o Nível {TOURNAMENT_MIN_LEVEL} para participar!
              </p>
              <p className="text-xs text-muted-foreground">
                Você está no <b>Nível {profile.level}</b> ({profile.xp} XP). O Torneio Semanal
                Ranqueado é liberado automaticamente ao atingir o Nível {TOURNAMENT_MIN_LEVEL}.
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

  const currentPoints = profile.tournamentPoints ?? 0;
  const rankInfo = getTournamentRank(currentPoints);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <Trophy className="h-6 w-6 text-accent" /> Torneio Semanal Ranqueado
          </DialogTitle>
        </DialogHeader>

        {/* Abas Superiores: Desafio da Semana vs Ranking do Torneio */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary/80 p-1 border">
          <button
            type="button"
            onClick={() => setActiveTab("desafio")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-display text-xs sm:text-sm font-black transition-all ${
              activeTab === "desafio"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Play className="h-4 w-4 text-primary" /> Desafio da Semana
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ranking")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-display text-xs sm:text-sm font-black transition-all ${
              activeTab === "ranking"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Medal className="h-4 w-4 text-accent" /> Ranking do Torneio
          </button>
        </div>

        {/* Conteúdo da Aba: DESAFIO DA SEMANA */}
        {activeTab === "desafio" && (
          <div className="space-y-4">
            {/* Medidores Discretos na parte Superior */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary/40 border px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary" /> {snap.weekKey} • Até {snap.endsAtLabel}
              </span>
              <div className="flex items-center gap-3">
                {snap.isFreeEntry ? (
                  <span className="inline-flex items-center gap-1 font-bold text-foreground">
                    <Flame className="h-3.5 w-3.5 text-accent" /> Grátis:{" "}
                    <b className="font-mono text-primary">
                      {snap.freeRemainingToday}/10 restantes
                    </b>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                    <Coins className="h-3.5 w-3.5 text-amber-500" /> Pagas:{" "}
                    <b className="font-mono text-amber-500">
                      {snap.paidRemainingToday}/50 restantes
                    </b>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 font-bold text-foreground">
                  <Zap className="h-3.5 w-3.5 text-success" /> XP Extra:{" "}
                  <b className="font-mono text-success">
                    +{snap.extraXpEarnedToday}/{TOURNAMENT_DAILY_EXTRA_XP_CAP} XP
                  </b>
                </span>
              </div>
            </div>

            {/* Card Principal do Desafio da Semana */}
            <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/20 px-3 py-0.5 text-xs font-black text-primary">
                  {snap.playerStage.emoji} {snap.playerStage.label} ({snap.playerStage.shortLabel})
                </span>
                {snap.myStanding && (
                  <span className="rounded-full bg-accent/20 px-3 py-0.5 text-xs font-extrabold text-accent">
                    Sua colocação: #{snap.myStanding.rank} ({snap.myStanding.tournamentPoints ?? snap.myStanding.totalRankedPoints} pts)
                  </span>
                )}
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Jogo Oficial Desta Semana
                </div>
                <h3 className="font-display text-2xl sm:text-3xl font-black text-foreground">
                  {snap.gameName}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dispute partidas ranqueadas exclusivas para a sua etapa ({snap.playerStage.shortLabel}).
                  Vença partidas para subir de divisão, desbloquear medalhas de maestria e figurar no Top 5!
                </p>
              </div>

              {snap.myStanding && snap.myStanding.rank <= 5 && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3 text-xs flex items-center gap-2.5 text-amber-800 dark:text-amber-300 shadow-2xs">
                  <span className="text-xl shrink-0">
                    {snap.myStanding.rank === 1 ? "🥇" : snap.myStanding.rank === 2 ? "🥈" : snap.myStanding.rank === 3 ? "🥉" : "🏅"}
                  </span>
                  <div>
                    <span className="font-display font-extrabold block">
                      Projeção Atual: Top {snap.myStanding.rank} da {snap.playerStage.shortLabel}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Mantenha sua posição até o encerramento no <b>domingo às 23:59</b> para consolidar e faturar a medalha definitiva!
                    </span>
                  </div>
                </div>
              )}

              {/* PROGRESSO DO RANK DO TORNEIO (Diretamente acima do botão de jogar) */}
              <div className="rounded-2xl border bg-card/95 p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Seu Rank Ranqueado
                  </span>
                  <span className="font-mono text-xs font-black text-primary">
                    {currentPoints} pts
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Rank Atual */}
                  <div className="flex flex-col items-center shrink-0 w-20 text-center">
                    <TournamentRankBadge rankId={rankInfo.currentRank.id} points={currentPoints} size="md" />
                    <span className="mt-1 font-display text-xs font-black truncate max-w-full text-foreground">
                      {rankInfo.currentRank.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {rankInfo.currentRank.minPoints} pts
                    </span>
                  </div>

                  {/* Barra de Progresso Central */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground">
                        {rankInfo.nextRank ? `Rumo a ${rankInfo.nextRank.name}` : "Divisão Máxima"}
                      </span>
                      <span className="font-mono text-primary font-extrabold">
                        {Math.round(rankInfo.progressPercent)}%
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted border border-border/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(6, rankInfo.progressPercent))}%` }}
                      />
                    </div>
                    <div className="text-center text-[10px] text-muted-foreground font-medium">
                      {rankInfo.pointsToNext > 0 ? (
                        <span>
                          Faltam <b>{rankInfo.pointsToNext} pts</b> para {rankInfo.nextRank?.name}
                        </span>
                      ) : (
                        <span className="text-rose-500 font-extrabold">👑 Divisão Mestre Alcançada!</span>
                      )}
                    </div>
                  </div>

                  {/* Próximo Rank */}
                  <div className="flex flex-col items-center shrink-0 w-20 text-center">
                    {rankInfo.nextRank ? (
                      <>
                        <TournamentRankBadge rankId={rankInfo.nextRank.id} size="md" />
                        <span className="mt-1 font-display text-xs font-black truncate max-w-full text-muted-foreground">
                          {rankInfo.nextRank.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {rankInfo.nextRank.minPoints} pts
                        </span>
                      </>
                    ) : (
                      <>
                        <TournamentRankBadge rankId="mestre" size="md" />
                        <span className="mt-1 font-display text-xs font-black truncate max-w-full text-rose-500">
                          Mestre
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          850+ pts
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Jogar */}
              {snap.isFreeEntry ? (
                <Button
                  size="lg"
                  disabled={snap.freeRemainingToday <= 0}
                  onClick={() => {
                    onOpenChange(false);
                    onStartRankedEntry(snap.gameId);
                  }}
                  className="h-13 w-full rounded-2xl font-display text-base font-extrabold shadow-md"
                >
                  <Play className="mr-2 h-5 w-5" /> Jogar Entrada Grátis ({snap.freeRemainingToday}/10 restantes)
                </Button>
              ) : snap.paidRemainingToday > 0 ? (
                <Button
                  size="lg"
                  disabled={!snap.canAffordPaid}
                  onClick={() => setConfirmPaidOpen(true)}
                  className={`h-13 w-full rounded-2xl font-display text-base font-extrabold shadow-md ${
                    snap.canAffordPaid
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  {snap.canAffordPaid ? (
                    <>
                      <Coins className="mr-2 h-5 w-5" /> Jogar Entrada Paga (Custo: 5 pts • {snap.paidRemainingToday}/50 restantes)
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" /> Pontos insuficientes para entrada paga (Saldo: {currentPoints} pts / Necessário: 5 pts)
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled
                  className="h-13 w-full rounded-2xl font-display text-base font-extrabold shadow-md opacity-60 cursor-not-allowed"
                >
                  Limite de 60 entradas diárias concluído hoje! Volte amanhã
                </Button>
              )}

              {/* Regras de Pontos Ranqueados */}
              <div className="rounded-xl border bg-secondary/30 p-2.5 text-[11px] text-muted-foreground text-center space-y-1">
                <div>
                  🎯 <b>Pontuação Ranqueada:</b> Cada partida finalizada garante até 10 pontos (-1 ponto por erro cometido, piso mínimo garantido de 1 ponto ao concluir).
                </div>
                {snap.rankedMultiplier > 1 && (
                  <div className="text-amber-500 font-extrabold">
                    ⚡ Evento Ativo: <b>{snap.rankedMultiplier}x Pontos</b> em cada partida ranqueada!
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/80">
                  10 entradas gratuitas por dia + até 50 entradas extras por 5 pontos cada • Bônus de +25 pontos ao fechar 10 partidas no dia sem nenhum erro.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo da Aba: RANKING DO TORNEIO */}
        {activeTab === "ranking" && (
          <div className="space-y-4">
            {/* Visualização de Etapas: Apenas ADM pode alternar; Aluno comum vê exclusivamente sua etapa */}
            {auth.isAdmin ? (
              <div className="space-y-2 rounded-2xl border bg-secondary/30 p-3">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary" /> Visualização do Administrador (Todas as Etapas)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedStage("TODAS")}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      selectedStage === "TODAS"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🌐 Visão Geral
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {AGE_STAGES.map((st) => {
                    const isSelected = selectedStage === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStage(st.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground shadow-xs"
                            : "bg-background hover:bg-secondary/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-display text-xs font-black">
                          <span>
                            {st.emoji} {st.shortLabel}
                          </span>
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
                  <span className="text-xl">{snap.playerStage.emoji}</span>
                  <div>
                    <div className="font-display text-sm font-black text-foreground">
                      Ranking da {snap.playerStage.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Disputa oficial ranqueada entre alunos da sua faixa escolar ({snap.playerStage.shortLabel})
                    </div>
                  </div>
                </div>
                {snap.myStanding && (
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Sua Posição</div>
                    <div className="font-display text-base font-black text-accent">
                      #{snap.myStanding.rank} ({snap.myStanding.tournamentPoints ?? snap.myStanding.totalRankedPoints} pts)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lista do Top Ranking */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 min-h-[380px]">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-extrabold flex items-center gap-1.5">
                  <Medal className="h-4 w-4 text-accent" /> Top Jogadores da Semana
                </span>
                <span className="text-xs text-muted-foreground">
                  Semana {snap.weekKey}
                </span>
              </div>

              {initialLoading && snap.top5.length === 0 ? (
                <WeeklyTournamentTop5Skeleton />
              ) : snap.top5.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-secondary/40 p-8 text-center text-xs text-muted-foreground space-y-1 min-h-[260px]">
                  <p className="font-bold text-foreground">Ninguém pontuou no torneio desta semana ainda.</p>
                  <p>Jogue sua 1ª entrada ranqueada para assumir o <b>1º lugar</b> da sua etapa!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {snap.top5.map((row) => {
                    const isMe = row.playerId === profile.id;
                    const rowPoints = row.tournamentPoints ?? row.totalRankedPoints;
                    const rowRankDef = getTournamentRank(rowPoints).currentRank;

                    return (
                      <div
                        key={row.playerId}
                        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors ${
                          isMe ? "border-primary bg-primary/10 shadow-xs" : "bg-background"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Posição no Torneio */}
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-xs font-black border shadow-xs ${
                              row.rank === 1
                                ? "bg-yellow-400 text-yellow-950 border-yellow-500"
                                : row.rank === 2
                                  ? "bg-slate-300 text-slate-800 border-slate-400"
                                  : row.rank === 3
                                    ? "bg-amber-700 text-amber-50 border-amber-800"
                                    : "bg-secondary text-foreground border-border"
                            }`}
                          >
                            {row.rank <= 3 ? <Medal className="h-4 w-4" /> : `${row.rank}º`}
                          </span>

                          {/* Badge do Rank do Jogador */}
                          <TournamentRankBadge rankId={rowRankDef.id} points={rowPoints} size="xs" />

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-display text-sm font-black truncate text-foreground">
                                {row.nick}
                              </span>
                              {isMe && (
                                <span className="rounded-md bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                                  VOCÊ
                                </span>
                              )}
                              <span className={`text-[10px] font-bold ${rowRankDef.textColor}`}>
                                {rowRankDef.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {row.school} • Nv. {row.level} • {row.stageLabel}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-display text-base font-black text-primary">
                            {rowPoints} pts
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Informações sobre Medalhas */}
            <div className="rounded-2xl border bg-secondary/30 p-3.5 text-xs text-muted-foreground flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <b className="text-foreground">Medalhas de Superação e Top 5:</b> Ao alcançar a divisão mais alta de cada liga (Bronze III, Prata III, Ouro III, Platina IV, Diamante V e Mestre) você recebe a medalha permanente de maestria. E terminar a semana no Top 5 acumula medalhas semanais no seu perfil!
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modal de Confirmação de Entrada Paga */}
      <Dialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
              <Coins className="h-5 w-5 text-amber-500" /> Confirmar Entrada Ranqueada
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              As suas entradas gratuitas acabaram. Você deseja gastar <b>{snap.paidCost} pontos</b> para entrar na partida?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-secondary/30 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Seu saldo atual:</span>
              <span className="font-bold font-mono text-sm">{currentPoints} pts</span>
            </div>
            <div className="flex justify-between items-center text-amber-500 font-bold">
              <span>Custo desta entrada:</span>
              <span className="font-mono text-sm">-{snap.paidCost} pts</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2 font-extrabold">
              <span>Saldo restante após entrar:</span>
              <span className="font-mono text-sm text-primary">
                {Math.max(0, currentPoints - snap.paidCost)} pts
              </span>
            </div>
            <div className="rounded-xl bg-background/60 p-2 text-[11px] text-muted-foreground">
              💡 Partida concluída: ganhe até <b>10 pontos</b> (-1 ponto por erro cometido, mínimo 1 ponto).
              {snap.rankedMultiplier > 1 && (
                <div className="text-amber-500 font-bold mt-0.5">
                  ⚡ Multiplicador do evento ativo: <b>{snap.rankedMultiplier}x</b>!
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-2xl"
              onClick={() => setConfirmPaidOpen(false)}
              disabled={spendingEntry}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-2xl font-bold bg-amber-600 hover:bg-amber-700 text-white"
              disabled={spendingEntry}
              onClick={async () => {
                if (!profile) return;
                setSpendingEntry(true);
                try {
                  const res = await spendPaidTournamentEntry(profile.id, snap.paidCost);
                  if (!res.ok) {
                    alert(res.error ?? "Não foi possível deduzir os pontos.");
                    setSpendingEntry(false);
                    return;
                  }
                  setConfirmPaidOpen(false);
                  onOpenChange(false);
                  onStartRankedEntry(snap.gameId);
                } catch (e: any) {
                  alert(e?.message ?? "Erro ao iniciar partida paga.");
                } finally {
                  setSpendingEntry(false);
                }
              }}
            >
              {spendingEntry ? "Entrando..." : `Confirmar (-${snap.paidCost} pts)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
