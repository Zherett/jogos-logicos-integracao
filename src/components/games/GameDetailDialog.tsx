import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Trophy,
  Star,
  Play,
  User,
  Sparkles,
  Gamepad2,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  KeyRound,
  Target,
  ChevronDown,
  Lock,
} from "lucide-react";
import type { GameRegistration } from "@/lib/game-registry";
import type { GameId } from "@/lib/game-storage";
import type { StageGameRecord, RecordHolder } from "@/lib/game-records";
import { getGameInstructions } from "@/lib/game-instructions";

interface GameDetailDialogProps {
  game: GameRegistration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlay: (gameId: GameId) => void;
  personalStats: { bestScore: number; bestLevel: number };
  stageRecord?: StageGameRecord | null;
  stageName?: string;
  isUnlocked?: boolean;
  onOpenCodeGate?: () => void;
  isLevelLocked?: boolean;
  requiredLevel?: number;
  isGuest?: boolean;
}

export function GameDetailDialog({
  game,
  open,
  onOpenChange,
  onPlay,
  personalStats,
  stageRecord,
  stageName,
  isUnlocked = true,
  onOpenCodeGate,
  isLevelLocked = false,
  requiredLevel = 1,
  isGuest = false,
}: GameDetailDialogProps) {
  const [expandedDetails, setExpandedDetails] = useState(false);

  useEffect(() => {
    if (open) {
      setExpandedDetails(false);
    }
  }, [open, game?.id]);

  if (!game) return null;

  const instructions = getGameInstructions(game.id);

  function handleStartPlay() {
    onOpenChange(false);
    onPlay(game!.id);
  }

  function handleUnlock() {
    onOpenChange(false);
    onOpenCodeGate?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-3xl border-2 border-primary/30 shadow-2xl">
        <DialogHeader className="space-y-3 text-left">
          {/* Topo: Ícone grande + Título + Subtítulo */}
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div
              className={`grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${game.gradient} text-white shadow-lg ring-4 ring-primary/10`}
            >
              {React.isValidElement(game.icon)
                ? React.cloneElement(game.icon as React.ReactElement<{ className?: string }>, {
                    className: "h-9 w-9 sm:h-11 sm:w-11",
                  })
                : game.icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                  <Gamepad2 className="h-3 w-3" /> Desafio Educativo
                </span>
                {!isUnlocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    <KeyRound className="h-3 w-3" /> Bloqueado por Código
                  </span>
                )}
                {isLevelLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" /> Requer Nível {requiredLevel}
                  </span>
                )}
              </div>
              <DialogTitle className="font-display text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                {game.title}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground font-medium line-clamp-2 mt-0.5">
                {game.subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 1. Estatísticas: Recorde Pessoal x Recorde da Plataforma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Seu Desempenho */}
            <div className="rounded-2xl border bg-card p-3 shadow-2xs flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <User className="h-3.5 w-3.5 text-primary" /> Seu Desempenho
                </div>
                <div className="font-display text-lg font-black text-foreground flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  {personalStats.bestScore.toLocaleString("pt-BR")} pts
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-black text-primary border border-primary/20">
                  Nível {personalStats.bestLevel}
                </span>
              </div>
            </div>

            {/* Maior Ranking / Recorde Atual da Plataforma */}
            <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-card to-amber-500/5 p-3 shadow-2xs flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" /> Recorde da Plataforma
                </div>
                <div className="font-display text-lg font-black text-amber-600 dark:text-amber-400">
                  {stageRecord && stageRecord.score > 0
                    ? `${stageRecord.score.toLocaleString("pt-BR")} pts`
                    : "Sem recorde"}
                </div>
                <p className="text-[10px] text-muted-foreground truncate font-medium">
                  {stageRecord && stageRecord.holders.length > 0
                    ? `Detentor: ${stageRecord.holders.map((h: RecordHolder) => h.nick).join(", ")}`
                    : "Seja o primeiro a marcar!"}
                </p>
              </div>
              {stageName && (
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center rounded-lg bg-amber-500/15 px-2 py-0.5 text-[9px] font-extrabold text-amber-700 dark:text-amber-300">
                    {stageName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Objetivo do Jogo & Detalhes Expansíveis */}
          <div className="rounded-2xl border bg-secondary/30 p-3.5 sm:p-4 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 font-display text-xs sm:text-sm font-extrabold text-foreground uppercase tracking-wide">
                <Target className="h-4 w-4 text-primary" /> Objetivo do Jogo
              </div>
              <p className="text-xs sm:text-sm text-foreground/90 font-medium leading-relaxed mt-1">
                {instructions.objective}
              </p>
            </div>

            {/* Gatilho Expansível para Detalhes */}
            <button
              type="button"
              onClick={() => setExpandedDetails((prev) => !prev)}
              className="w-full flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5" />
                {expandedDetails
                  ? "Recolher detalhes de como jogar"
                  : "Ver detalhes de como jogar, comandos e dicas"}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  expandedDetails ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Conteúdo Expansível (Passo a passo, Comandos e Dicas) */}
            {expandedDetails && (
              <div className="space-y-3 pt-1 border-t border-border/60 animate-in fade-in duration-200">
                <div>
                  <div className="flex items-center gap-1.5 font-display text-xs font-extrabold text-foreground uppercase tracking-wide mb-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Passo a Passo de Como Jogar
                  </div>
                  <ul className="space-y-1.5">
                    {instructions.howToPlay.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="rounded-xl border bg-card p-2.5 space-y-1">
                    <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-primary">
                      <Gamepad2 className="h-3 w-3" /> Comandos & Controles
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      {instructions.controls}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-2.5 space-y-1">
                    <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-500">
                      <Lightbulb className="h-3 w-3" /> Dica & Pontuação
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      {instructions.tips}{" "}
                      <span className="block mt-1 font-bold text-foreground">
                        {instructions.scoring}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Informação Progressiva: Lógica Matemática */}
          {game.id === "logica" && (
            <div className="rounded-2xl border border-primary/20 bg-card p-3.5 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Operações Progressivas
              </span>
              <p className="text-xs text-muted-foreground">
                Todas as operações (+, −, ×, ÷) são liberadas e aumentam de dificuldade automaticamente conforme você avança de nível.
              </p>
            </div>
          )}

          {/* 4. Informação Progressiva: Plano Cartesiano */}
          {game.id === "cartesiano" && (
            <div className="rounded-2xl border border-primary/20 bg-card p-3.5 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Grade Progressiva
              </span>
              <p className="text-xs text-muted-foreground">
                O tamanho do plano escala automaticamente conforme você avança de nível: <b>8×8</b> (Nível 1) → <b>10×10</b> (Nível 2) → <b>15×15</b> (Nível 3).
              </p>
            </div>
          )}

          {/* Mensagem Informativa para Alunos em Modo Visitante */}
          {isGuest && (
            <div className="rounded-2xl border border-sky-400/40 bg-sky-500/10 p-3 text-center text-xs text-sky-800 dark:text-sky-300 font-medium">
              💡 <b>Modo Visitante:</b> Você pode jogar à vontade para praticar! Para salvar pontuações, subir de nível e conquistar medalhas, entre com sua conta de aluno.
            </div>
          )}

          {/* 5. Ação Principal / Botão Jogar */}
          <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border px-4 py-2.5 font-display text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
            >
              Fechar
            </button>

            <div className="flex-1 flex justify-center">
              {isLevelLocked ? (
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-muted border border-border px-8 py-3.5 sm:py-4 font-display text-sm sm:text-base font-black text-muted-foreground cursor-not-allowed opacity-80"
                >
                  <Lock className="h-5 w-5" />
                  Bloqueado (Alcance o Nível {requiredLevel})
                </button>
              ) : isUnlocked ? (
                <button
                  type="button"
                  onClick={handleStartPlay}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-2xl bg-primary px-10 py-3.5 sm:py-4 font-display text-lg sm:text-xl font-black text-primary-foreground shadow-xl shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="h-6 w-6 fill-current" />
                  JOGAR
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-3.5 font-display text-sm font-black text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <KeyRound className="h-5 w-5" />
                  Inserir Código para Liberar Jogo
                </button>
              )}
            </div>

            {/* Elemento fantasma para manter simetria do botão central no desktop */}
            <div className="hidden sm:block w-[72px]" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
