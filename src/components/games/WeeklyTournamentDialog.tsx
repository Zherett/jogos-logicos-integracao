import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Trophy,
  Flame,
  Lock,
  Play,
  Medal,
  Zap,
  Calendar,
  Star,
  ArrowRight,
  HelpCircle,
  Award,
  Map as MapIcon,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { GameId } from "@/lib/game-storage";
import type { RankedMilestoneReward } from "@/lib/game-codes";
import { canAccessShopAndCustomization, canViewCoinsWallet } from "@/lib/daily-rewards";
import { usePlayerAuth } from "@/lib/player-auth";
import {
  getActiveAccount,
  isAdminUnlockedSession,
  syncActiveProfileChangeToPlayFab,
  syncSinglePlayerFromPlayFab,
} from "@/lib/playfab";
import {
  claimRankedMilestoneReward,
  countUnlockedRankedMedals,
  getTournamentRank,
  getWeeklyTournamentSnapshot,
  syncWeeklyTournamentWithPlayFab,
  spendPaidTournamentEntry,
  TOURNAMENT_DAILY_EXTRA_XP_CAP,
  TOURNAMENT_MIN_LEVEL,
  type TournamentRankId,
} from "@/lib/weekly-tournament";
import { stageForPlayer } from "@/lib/player-profile";
import { RankedPathTrack } from "./RankedPathTrack";
import { TournamentRankBadge } from "./TournamentRankBadge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStartRankedEntry: (gameId: GameId) => void;
  onRequireLogin: () => void;
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
  const [activeTab, setActiveTab] = useState<"geral" | "trilha">("geral");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [claimingMilestone, setClaimingMilestone] = useState(false);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [spendingEntry, setSpendingEntry] = useState(false);

  const myStageId = profile
    ? stageForPlayer(profile.school, profile.birthdate, new Date(), profile.ageStage).id
    : "etapa_1";

  useEffect(() => {
    if (!open) return;
    let active = true;
    void syncWeeklyTournamentWithPlayFab().then(() => {
      if (active) setTick((t) => t + 1);
    });
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("desafios:weekly-tournament-updated", handleUpdate);
    return () => {
      active = false;
      window.removeEventListener("desafios:weekly-tournament-updated", handleUpdate);
    };
  }, [open]);

  if (!profile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Trophy className="h-6 w-6 text-accent" /> Torneio Mensal Ranqueado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-muted-foreground">
              Entre no seu perfil de jogador para disputar o Torneio Mensal Ranqueado da sua etapa,
              subir de divisão e conquistar troféus e medalhas!
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

  const snap = getWeeklyTournamentSnapshot(profile, myStageId);

  if (!snap.canEnterLevel) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Lock className="h-6 w-6 text-accent" /> Torneio Mensal (Nível {TOURNAMENT_MIN_LEVEL}+)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-center">
            <div className="rounded-2xl border bg-secondary/40 p-5 space-y-2">
              <p className="font-display text-lg font-extrabold text-foreground">
                Alcance o Nível {TOURNAMENT_MIN_LEVEL} para participar!
              </p>
              <p className="text-xs text-muted-foreground">
                Você está no <b>Nível {profile.level}</b> ({profile.xp} XP). O Torneio Mensal
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

  const currentPoints = snap.tournamentPoints;
  const rankInfo = getTournamentRank(currentPoints);
  const rankedMedalsSummary = countUnlockedRankedMedals(profile);
  const rankedSeasonId = auth.adminConfig.rankedSeasonId ?? 1;
  const allowShopRewards = canAccessShopAndCustomization(
    profile,
    isAdminUnlockedSession(),
    auth.adminConfig,
  );
  const allowCoinsRewards = canViewCoinsWallet(
    profile,
    isAdminUnlockedSession(),
    auth.adminConfig,
  );

  async function handleClaimMilestone(rankId: TournamentRankId, reward: RankedMilestoneReward) {
    if (!profile || claimingMilestone) return;
    if (reward.type === "card_pack" && !allowShopRewards) {
      setClaimFeedback({
        tone: "error",
        text: "Pacotes de cartas da Trilha serão liberados assim que a Loja abrir para os alunos!",
      });
      return;
    }
    if (reward.type === "coins" && !allowCoinsRewards) {
      setClaimFeedback({
        tone: "error",
        text: "Recompensas em Moedas serão liberadas assim que a Carteira de Moedas abrir para os alunos!",
      });
      return;
    }
    setClaimingMilestone(true);
    setClaimFeedback(null);
    try {
      await syncSinglePlayerFromPlayFab(profile.nickNormalized || profile.id).catch(() => null);
      const liveProfile = getActiveAccount()?.profile ?? profile;
      const res = claimRankedMilestoneReward({
        profile: liveProfile,
        rankId,
        seasonId: rankedSeasonId,
        reward,
        currentPoints: Math.max(currentPoints, liveProfile.bestTournamentPoints ?? 0),
      });
      if (!res.ok || !res.updatedProfile) {
        setClaimFeedback({
          tone: "error",
          text: res.error ?? "Não foi possível resgatar a recompensa.",
        });
        return;
      }
      await syncActiveProfileChangeToPlayFab(res.updatedProfile, { requireServerSync: true });
      await auth.refresh();
      setClaimFeedback({
        tone: "success",
        text: "Recompensa resgatada e adicionada à sua conta!",
      });
      setTick((t) => t + 1);
    } catch (err) {
      setClaimFeedback({
        tone: "error",
        text:
          err instanceof Error && err.message
            ? err.message
            : "Sem conexão ou sessão expirada. Faça login novamente para resgatar.",
      });
    } finally {
      setClaimingMilestone(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl p-4 sm:p-6">
        <DialogHeader className="pr-7">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-secondary/70 text-foreground hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
              title="Como funciona o Torneio Ranqueado"
              aria-label="Regras do Torneio Ranqueado"
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            <DialogTitle className="flex items-center justify-center gap-1.5 font-display text-lg sm:text-xl font-extrabold text-center truncate">
              <Trophy className="h-5 w-5 text-accent shrink-0" />
              <span className="truncate">Torneio Mensal Ranqueado</span>
            </DialogTitle>

            <div
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-600 dark:text-amber-400"
              title="Medalhas exclusivas da Ranqueada conquistadas"
            >
              <Award className="h-3.5 w-3.5" />
              <span>
                {rankedMedalsSummary.unlockedCount}/{rankedMedalsSummary.totalCount}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Navegação em Pílulas */}
        <div
          role="tablist"
          aria-label="Seções do Torneio Ranqueado"
          className="grid grid-cols-2 items-center rounded-full border border-border/70 bg-secondary/40 p-1 shadow-2xs gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "geral"}
            onClick={() => setActiveTab("geral")}
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "geral"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Visão Geral</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "trilha"}
            onClick={() => setActiveTab("trilha")}
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "trilha"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span>Trilha de Ranks</span>
          </button>
        </div>

        {activeTab === "geral" ? (
          <div className="space-y-4">
            {/* Bloco Superior: Pontuação | Rank Atual Grande | Colocação */}
            <div className="grid grid-cols-3 items-center gap-2 rounded-3xl border-2 border-primary/25 bg-gradient-to-b from-primary/10 via-card to-card p-3 sm:p-4">
              <div className="flex flex-col items-center text-center space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Pontuação
                </span>
                <div className="w-full rounded-2xl bg-sky-500/15 border border-sky-500/40 px-2 py-2 font-display text-base sm:text-lg font-black text-sky-600 dark:text-sky-300">
                  {currentPoints} pts
                </div>
              </div>

              <div className="flex flex-col items-center text-center">
                <TournamentRankBadge
                  rankId={rankInfo.currentRank.id}
                  points={currentPoints}
                  size="lg"
                />
                <span className="mt-1.5 font-display text-sm sm:text-base font-black text-foreground leading-tight">
                  {rankInfo.currentRank.name}
                </span>
              </div>

              <div className="flex flex-col items-center text-center space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Colocação
                </span>
                <div className="w-full rounded-2xl bg-sky-500/15 border border-sky-500/40 px-2 py-2 font-display text-base sm:text-lg font-black text-sky-600 dark:text-sky-300">
                  {snap.myStanding ? `#${snap.myStanding.rank}` : "--"}
                </div>
              </div>
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
                    {snap.myStanding.rank <= 3
                      ? `Mantenha sua posição até o fim da temporada (${snap.endsAtLabel}) para faturar o troféu e os prêmios definitivos!`
                      : `Mantenha sua posição até o fim da temporada (${snap.endsAtLabel}) para faturar os prêmios do Top 5 no Correio!`}
                  </span>
                </div>
              </div>
            )}

            {/* Progresso para o próximo Rank */}
            <div className="rounded-2xl border bg-card/95 p-4 space-y-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center shrink-0 w-16 text-center">
                  <TournamentRankBadge rankId={rankInfo.currentRank.id} points={currentPoints} size="sm" />
                  <span className="mt-1 font-display text-[11px] font-black truncate max-w-full text-foreground">
                    {rankInfo.currentRank.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {rankInfo.currentRank.minPoints} pts
                  </span>
                </div>

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

                <div className="flex flex-col items-center shrink-0 w-16 text-center">
                  {rankInfo.nextRank ? (
                    <>
                      <TournamentRankBadge rankId={rankInfo.nextRank.id} size="sm" />
                      <span className="mt-1 font-display text-[11px] font-black truncate max-w-full text-muted-foreground">
                        {rankInfo.nextRank.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {rankInfo.nextRank.minPoints} pts
                      </span>
                    </>
                  ) : (
                    <>
                      <TournamentRankBadge rankId="mestre" size="sm" />
                      <span className="mt-1 font-display text-[11px] font-black truncate max-w-full text-rose-500">
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

            {/* Botão de Jogar Entrada Grátis / Entrada Paga (-5 pts) */}
            {snap.isFreeEntry ? (
              <div className="flex items-center gap-2">
                <Button
                  size="lg"
                  disabled={snap.freeRemainingToday <= 0}
                  onClick={() => {
                    onOpenChange(false);
                    onStartRankedEntry(snap.gameId);
                  }}
                  className="h-13 flex-1 rounded-2xl font-display text-base font-extrabold shadow-md"
                >
                  <Play className="mr-2 h-5 w-5" /> Jogar Entrada Grátis
                </Button>
                <div
                  className="shrink-0 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-center"
                  title="Entradas gratuitas restantes hoje"
                >
                  <div className="font-mono text-sm font-black text-primary">
                    {snap.freeRemainingToday}/10
                  </div>
                  <div className="text-[9px] font-bold uppercase text-muted-foreground">grátis</div>
                </div>
              </div>
            ) : snap.paidRemainingToday > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  size="lg"
                  disabled={!snap.canAffordPaid}
                  onClick={() => setConfirmPaidOpen(true)}
                  className={`h-13 flex-1 rounded-2xl font-display text-base font-extrabold shadow-md ${
                    snap.canAffordPaid
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  {snap.canAffordPaid ? (
                    <>
                      <Star className="mr-2 h-5 w-5" /> Jogar Entrada Paga
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" /> Saldo insuficiente ({currentPoints} pts)
                    </>
                  )}
                </Button>
                <div
                  className="shrink-0 rounded-2xl border-2 border-rose-500/50 bg-rose-500/15 px-3.5 py-2 text-center"
                  title={`Custo por entrada paga (${snap.paidRemainingToday}/50 restantes hoje)`}
                >
                  <div className="font-mono text-sm font-black text-rose-500">
                    -{snap.paidCost} pts
                  </div>
                  <div className="text-[9px] font-bold text-muted-foreground">
                    {snap.paidRemainingToday}/50
                  </div>
                </div>
              </div>
            ) : (
              <Button
                size="lg"
                disabled
                className="h-13 w-full rounded-2xl font-display text-sm sm:text-base font-extrabold shadow-md opacity-60 cursor-not-allowed"
              >
                Limite de 60 entradas diárias concluído hoje! Volte amanhã
              </Button>
            )}

            {/* Jogo Oficial Desta Semana */}
            <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Jogo Oficial Desta Semana
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/20 px-2.5 py-0.5 text-[10px] font-black text-primary">
                  {snap.playerStage.emoji} {snap.playerStage.shortLabel}
                </span>
              </div>
              <h3 className="font-display text-2xl font-black text-foreground">
                {snap.gameName}
              </h3>
              <p className="text-xs text-muted-foreground">
                Dispute partidas ranqueadas exclusivas para a sua etapa ({snap.playerStage.shortLabel}).
                Vença partidas para subir de divisão, desbloquear medalhas de maestria e figurar no Top 5!
              </p>
            </div>

            {/* Rodapé de Informações da Semana, Entradas e XP */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary/40 border px-3 py-2.5 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary" /> {snap.weekKey} • Até {snap.endsAtLabel}
              </span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-bold text-foreground">
                  <Flame className="h-3.5 w-3.5 text-accent" /> Grátis:{" "}
                  <b className="font-mono text-primary">{snap.freeRemainingToday}/10</b>
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-foreground">
                  <Zap className="h-3.5 w-3.5 text-success" /> XP Extra:{" "}
                  <b className="font-mono text-success">
                    +{snap.extraXpEarnedToday}/{TOURNAMENT_DAILY_EXTRA_XP_CAP} XP
                  </b>
                </span>
              </div>
            </div>

            {/* Atalho direto para a página dedicada de Ranking (aba Ranqueado) */}
            <Link
              to="/ranking"
              search={{ tab: "torneio" }}
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-xs font-extrabold text-foreground transition-all hover:bg-accent/20 active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <Medal className="h-4 w-4 text-accent shrink-0" />
                <span>Ver Ranking Completo e Top 5 do Torneio</span>
              </span>
              <ArrowRight className="h-4 w-4 text-accent shrink-0" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {claimFeedback && (
              <div
                className={`rounded-2xl border px-3 py-2 text-center text-xs font-bold ${
                  claimFeedback.tone === "error"
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {claimFeedback.text}
              </div>
            )}
            <RankedPathTrack
              mode="player"
              currentPoints={Math.max(currentPoints, profile.bestTournamentPoints ?? 0)}
              seasonId={rankedSeasonId}
              claimedMilestones={profile.claimedRankedMilestones ?? []}
              rewardsMap={auth.adminConfig.rankedMilestoneRewards ?? {}}
              cardPacks={auth.adminConfig.cardPacks}
              allowShopRewards={allowShopRewards}
              allowCoinsRewards={allowCoinsRewards}
              onClaimReward={handleClaimMilestone}
            />
          </div>
        )}
      </DialogContent>

      {/* Modal de Regras Gerais (?) */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold">
              <HelpCircle className="h-5 w-5 text-primary" /> Como Funciona a Ranqueada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <div className="rounded-2xl border bg-secondary/30 p-3 space-y-1">
              <div className="font-bold text-foreground">🎯 Pontuação Ranqueada</div>
              <p>
                Cada partida finalizada garante até <b>10 pontos</b> (-1 ponto por erro cometido, piso
                mínimo garantido de 1 ponto ao concluir).
              </p>
            </div>
            {snap.rankedMultiplier > 1 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-300 font-bold">
                ⚡ Evento Ativo: <b>{snap.rankedMultiplier}x Pontos</b> em cada partida ranqueada!
              </div>
            )}
            <div className="rounded-2xl border bg-secondary/30 p-3 space-y-1">
              <div className="font-bold text-foreground">🎟️ Entradas Diárias e Bônus</div>
              <p>
                Você recebe <b>10 entradas gratuitas por dia</b> (+ até 50 entradas extras por{" "}
                <b>{snap.paidCost} pontos</b> cada) e ganha <b>+10 XP extra por entrada</b> (até{" "}
                {TOURNAMENT_DAILY_EXTRA_XP_CAP} XP/dia), além de um bônus de <b>+25 pontos</b> ao
                fechar 10 partidas no dia sem nenhum erro.
              </p>
            </div>
            <div className="rounded-2xl border bg-secondary/30 p-3 space-y-1">
              <div className="font-bold text-foreground">🏆 Top 5 e Trilha de Ranks</div>
              <p>
                Suba pelos 19 ranks da temporada para desbloquear medalhas de maestria e resgatar
                recompensas exclusivas na aba <b>Trilha de Ranks</b>. No fechamento da temporada ({snap.endsAtLabel}),
                o Top 5 de cada etapa recebe prêmios oficiais no Correio!
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Entrada Paga */}
      <Dialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold text-foreground">
              <Star className="h-5 w-5 text-amber-500" /> Confirmar Entrada Ranqueada
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
                  await auth.refresh();
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
