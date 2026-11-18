import { Trophy, Award, Sparkles, User, Calendar, CheckCircle2 } from "lucide-react";
import type { GameId } from "@/lib/game-storage";
import { GAME_NAMES } from "@/lib/game-storage";
import { stageForPlayer, splitStudentNameForPrivacy, type AgeStageId } from "@/lib/player-profile";
import type { PlayerProfile } from "@/lib/playfab";
import {
  formatRecordDateBR,
  getGameStageRecord,
  type StageGameRecord,
} from "@/lib/game-records";

interface Props {
  gameId: GameId;
  profile?: PlayerProfile | null;
  personalBest?: number;
  className?: string;
}

export function GameRecordBanner({
  gameId,
  profile,
  personalBest = 0,
  className = "",
}: Props) {
  const stageInfo = profile
    ? stageForPlayer(profile.school, profile.birthdate, new Date(), profile.ageStage)
    : { id: "etapa_1" as AgeStageId, label: "1ª Etapa (1º ao 5º Ano)", shortLabel: "1ª Etapa", emoji: "🌱" };

  const stageRecord: StageGameRecord | null = getGameStageRecord(gameId, stageInfo.id);
  const gameName = GAME_NAMES[gameId] ?? gameId;

  const isHolder = Boolean(
    profile &&
      stageRecord &&
      stageRecord.holders.some(
        (h) =>
          h.playerId === profile.id ||
          h.nick.toLowerCase() === profile.nick.toLowerCase(),
      ),
  );

  return (
    <div
      className={`rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-card to-primary/10 p-4 sm:p-5 shadow-md ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Recorde da Etapa e Detentores */}
        <div className="flex items-start gap-3.5 min-w-0 max-w-2xl">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-amber-950 shadow-md">
            <Trophy className="h-6 w-6" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm sm:text-base font-black text-foreground">
                Recorde Oficial da Etapa — {gameName}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-foreground">
                {stageInfo.emoji} {stageInfo.shortLabel}
              </span>
            </div>

            {stageRecord && stageRecord.holders.length > 0 ? (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                    {stageRecord.score} pontos
                  </span>
                  {isHolder && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Você é detentor deste recorde!
                    </span>
                  )}
                </div>

                {/* Exibição dos Detentores na ordem em que alcançaram */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">
                    {stageRecord.holders.length > 1
                      ? "Detentores empatados (em ordem de conquista):"
                      : "Detentor do recorde:"}
                  </span>{" "}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {stageRecord.holders.map((holder, idx) => (
                      <span
                        key={holder.playerId + idx}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${
                          profile && holder.playerId === profile.id
                            ? "border-primary bg-primary/15 text-primary shadow-xs"
                            : "border-border bg-card/90 text-foreground"
                        }`}
                        title={(() => {
                          const canSeeFull = Boolean(profile?.isAdmin || (profile && holder.playerId === profile.id));
                          const displayName = canSeeFull
                            ? (holder.fullName ?? holder.nick)
                            : (splitStudentNameForPrivacy(holder.fullName).firstName || holder.nick);
                          return holder.school ? `${displayName} (${holder.school})` : displayName;
                        })()}
                      >
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-amber-500/20 text-[10px] font-black text-amber-700 dark:text-amber-300">
                          {idx + 1}º
                        </span>
                        <span>{holder.nick}</span>
                        {holder.achievedAt > 0 && (
                          <span className="font-mono font-normal text-[10px] text-muted-foreground">
                            ({formatRecordDateBR(holder.achievedAt)})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum recorde registrado nesta etapa ainda. Jogue agora e faça história como o primeiro detentor!
              </p>
            )}
          </div>
        </div>

        {/* Lado Direito: Recorde Pessoal do Jogador */}
        <div className="rounded-2xl border bg-card/90 p-3 sm:p-3.5 text-right shrink-0 min-w-[130px] space-y-0.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Seu Recorde Pessoal
          </div>
          <div className="font-mono text-lg sm:text-xl font-black text-primary">
            {personalBest > 0 ? `${personalBest} pts` : "—"}
          </div>
          {stageRecord && personalBest > 0 && personalBest < stageRecord.score && (
            <div className="text-[10px] text-muted-foreground">
              Faltam <b>{stageRecord.score - personalBest} pts</b> para empatar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
