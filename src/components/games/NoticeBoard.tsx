import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Gamepad2,
  Trophy,
  Swords,
  Award,
  Zap,
  ArrowRight,
  Flame,
} from "lucide-react";
import { type GameId, GAME_NAMES } from "@/lib/game-storage";
import { GAME_REGISTRY } from "@/lib/game-registry";
import type { PlatformNoticeSlide } from "@/lib/game-codes";
import { MedalIcon } from "./MedalIcon";
import { MedalDetailModal } from "./MedalDetailModal";
import { buildBaseMedalsCatalog, type MedalDefinition } from "@/lib/medals-catalog";

export interface NoticeBoardProps {
  slides?: PlatformNoticeSlide[];
  enabledDefaultNotices?: Record<string, boolean>;
  hideAllDefaultNotices?: boolean;
  pauseNoticeBoard?: boolean;
  weeklyGameName?: string;
  onSelectGame?: (gameId: GameId) => void;
  onOpenWeeklyTournament?: () => void;
  onOpenX1Arena?: () => void;
  className?: string;
}

export const NoticeBoard: React.FC<NoticeBoardProps> = ({
  slides = [],
  enabledDefaultNotices,
  hideAllDefaultNotices = false,
  pauseNoticeBoard = false,
  weeklyGameName = "Batalha de Robôs",
  onSelectGame,
  onOpenWeeklyTournament,
  onOpenX1Arena,
  className = "",
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [inspectMedal, setInspectMedal] = useState<MedalDefinition | null>(null);

  const medalsCatalog = useMemo<MedalDefinition[]>(() => buildBaseMedalsCatalog(), []);

  // Slides efetivos: customizados ativos pelo ADM e slides informativos padrão selecionados
  const effectiveSlides = useMemo<PlatformNoticeSlide[]>(() => {
    // 1. Slides customizados ativos criados pelo ADM
    const activeCustom = (slides || []).filter((s) => s.active !== false);

    // 2. Slides padrão do sistema (caso não estejam ocultados globalmente)
    const defaults: PlatformNoticeSlide[] = [];
    if (!hideAllDefaultNotices) {
      if (enabledDefaultNotices?.default_weekly_tournament !== false) {
        defaults.push({
          id: "default_weekly_tournament",
          title: `Desafio da Semana: ${weeklyGameName}`,
          message:
            "Participe do Torneio Semanal Ranqueado! Dispute as 10 entradas diárias, garanta +100 XP extras e suba de Rank da Liga Bronze até o Mestre!",
          badgeLabel: "TORNEIO RANQUEADO",
          type: "event_challenge",
          featuredGameId: null,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (enabledDefaultNotices?.default_x1_arena !== false) {
        defaults.push({
          id: "default_x1_arena",
          title: "Arena X1 Online: Desafie seus colegas!",
          message:
            "Duelos 1 vs 1 ao vivo das 07:00 às 19:00 com rotação de jogos e barra de vantagem dinâmica. Conquiste até +100 XP extras por dia!",
          badgeLabel: "BATALHA AO VIVO",
          type: "announcement",
          featuredGameId: null,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (enabledDefaultNotices?.default_new_games !== false) {
        defaults.push({
          id: "default_new_games",
          title: "Explore Todos os Desafios de Lógica",
          message:
            "Pratique raciocínio lógico, geometria no plano cartesiano, porcentagens e labirintos matemáticos para subir do Nível 1 ao Nível Máximo 10!",
          badgeLabel: "NOVIDADE & DESTAQUE",
          type: "game_highlight",
          featuredGameId: "rpg",
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
    }

    return [...activeCustom, ...defaults];
  }, [slides, hideAllDefaultNotices, enabledDefaultNotices, weeklyGameName]);

  const count = effectiveSlides.length;

  useEffect(() => {
    if (currentIndex >= count && count > 0) {
      setCurrentIndex(0);
    }
  }, [count, currentIndex]);

  const currentSlide = effectiveSlides[currentIndex % count] || effectiveSlides[0];
  const slideDurationSeconds = Math.max(2, currentSlide?.durationSeconds ?? 7);

  // Auto-slide com duração individual definida pelo ADM para cada aviso
  // Pausa automaticamente se o usuário passar o mouse/tocar (hover/touch) ou se pausado pelo ADM
  useEffect(() => {
    if (count <= 1 || isPaused || pauseNoticeBoard) return;
    const durationMs = slideDurationSeconds * 1000;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [count, currentIndex, isPaused, pauseNoticeBoard, slideDurationSeconds]);

  if (count === 0) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + count) % count);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % count);
  };

  const featuredGameObj = currentSlide.featuredGameId
    ? GAME_REGISTRY.find((g) => g.id === currentSlide.featuredGameId)
    : null;

  const linkedMedalObj = currentSlide.linkedMedalId
    ? medalsCatalog.find((m) => m.id === currentSlide.linkedMedalId)
    : null;

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-r from-primary/10 via-card to-amber-500/10 p-4 sm:p-5 shadow-md transition-all hover:border-primary/60 hover:shadow-lg ${className}`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Fundo com brilho suave e sutil */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/10" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-amber-500/10" />

        {/* Setas de Navegação Manual */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              title="Aviso anterior"
              aria-label="Aviso anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-card/90 text-foreground border shadow-sm transition-all hover:bg-primary hover:text-primary-foreground active:scale-90"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              title="Próximo aviso"
              aria-label="Próximo aviso"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-card/90 text-foreground border shadow-sm transition-all hover:bg-primary hover:text-primary-foreground active:scale-90"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Conteúdo do Slide com Altura Mínima Estável (Zero Oscilação / Layout Shift) */}
        <div className="relative z-10 px-6 sm:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 min-h-[136px] sm:min-h-[105px]">
          <div className="space-y-1.5 flex-1 min-w-0 flex flex-col justify-center min-h-[72px]">
            {/* Tag / Badge de Identificação */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-2xs">
                <Sparkles className="h-3 w-3" />
                {currentSlide.badgeLabel || "AVISO & NOVIDADE"}
              </span>

              {currentSlide.type === "game_highlight" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  <Gamepad2 className="h-3 w-3" /> Jogo em Destaque
                </span>
              )}

              {currentSlide.type === "event_challenge" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                  <Trophy className="h-3 w-3" /> Desafio Especial
                </span>
              )}
            </div>

            {/* Título do Slide */}
            <h3 className="font-display text-lg sm:text-2xl font-black text-foreground tracking-tight leading-snug line-clamp-1 sm:line-clamp-2">
              {currentSlide.title}
            </h3>

            {/* Mensagem / Descrição */}
            <p className="text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed max-w-2xl line-clamp-2">
              {currentSlide.message}
            </p>
          </div>

          {/* Área de Ação / Medalha / Botão de Acesso Rápido */}
          <div className="shrink-0 flex flex-wrap items-center gap-3 w-full md:w-auto justify-end pt-1 md:pt-0 min-h-[44px]">
            {/* Medalha Vinculada ao Evento (Clicável para Inspeção) */}
            {linkedMedalObj && (
              <button
                type="button"
                onClick={() => setInspectMedal(linkedMedalObj)}
                title={`Clique para inspecionar a medalha: ${linkedMedalObj.title}`}
                className="group/medal flex items-center gap-2.5 rounded-2xl border border-amber-400/60 bg-amber-500/15 px-3 py-2 text-left shadow-sm transition-all hover:bg-amber-500/25 active:scale-95 cursor-pointer"
              >
                <div className="relative">
                  <MedalIcon name={linkedMedalObj.iconName} className="h-6 w-6 text-amber-500" />
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                </div>
                <div className="min-w-0 pr-1">
                  <div className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Recompensa do Desafio
                  </div>
                  <div className="font-display text-xs font-bold text-foreground truncate max-w-[120px]">
                    {linkedMedalObj.title}
                  </div>
                </div>
              </button>
            )}

            {/* Botão de Ação do Jogo em Destaque */}
            {currentSlide.featuredGameId && onSelectGame && (
              <button
                type="button"
                onClick={() => onSelectGame(currentSlide.featuredGameId!)}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 font-display text-xs sm:text-sm font-black text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-95 cursor-pointer"
                title="Abre as instruções e detalhes deste jogo antes de jogar"
              >
                <Gamepad2 className="h-4 w-4" />
                Ver Informações do Jogo
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Ação padrão para Torneio Semanal */}
            {!currentSlide.featuredGameId && currentSlide.id === "default_weekly_tournament" && onOpenWeeklyTournament && (
              <button
                type="button"
                onClick={onOpenWeeklyTournament}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 font-display text-xs sm:text-sm font-black text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-95"
              >
                <Trophy className="h-4 w-4 text-amber-300" />
                Abrir Torneio Ranqueado
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Ação padrão para Arena X1 */}
            {!currentSlide.featuredGameId && currentSlide.id === "default_x1_arena" && onOpenX1Arena && (
              <button
                type="button"
                onClick={onOpenX1Arena}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 font-display text-xs sm:text-sm font-black text-white shadow-md transition-all hover:bg-sky-700 hover:scale-[1.02] active:scale-95"
              >
                <Swords className="h-4 w-4" />
                Acessar Arena X1
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Indicadores de Paginação (Bolinhas) */}
        {count > 1 && (
          <div className="relative z-10 mt-3 flex justify-center gap-1.5">
            {effectiveSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                title={`Ir para slide ${idx + 1}`}
                aria-label={`Ir para slide ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex % count
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de Detalhe da Medalha caso o jogador clique no slide */}
      <MedalDetailModal
        medal={inspectMedal}
        open={Boolean(inspectMedal)}
        onOpenChange={(v) => {
          if (!v) setInspectMedal(null);
        }}
      />
    </>
  );
};
