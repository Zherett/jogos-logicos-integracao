import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Newspaper,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Trophy,
  Sparkles,
  Pause,
  Play,
  ExternalLink,
} from "lucide-react";
import {
  generateNewspaperArticles,
  getNewspaperEditionKey,
  type NewsArticle,
  type NewspaperAccentTone,
} from "@/lib/newspaper";
import { getAllRegisteredPlayers } from "@/lib/playfab";
import { loadGameRecords } from "@/lib/game-records";
import { getCachedMedalPioneers } from "@/lib/medal-pioneers";

const PlayerInspectModal = lazy(() =>
  import("./PlayerInspectModal").then((m) => ({ default: m.PlayerInspectModal })),
);

const TONE_STYLES: Record<
  NewspaperAccentTone,
  { border: string; bg: string; badge: string; bar: string }
> = {
  red: {
    border: "border-rose-500/60",
    bg: "from-rose-950/75 via-slate-900/95 to-red-950/60",
    badge: "bg-rose-500 text-white",
    bar: "bg-rose-400",
  },
  amber: {
    border: "border-amber-500/60",
    bg: "from-amber-950/70 via-slate-900/95 to-orange-950/55",
    badge: "bg-amber-500 text-slate-950",
    bar: "bg-amber-400",
  },
  sky: {
    border: "border-sky-500/60",
    bg: "from-sky-950/75 via-slate-900/95 to-blue-950/60",
    badge: "bg-sky-500 text-white",
    bar: "bg-sky-400",
  },
  emerald: {
    border: "border-emerald-500/60",
    bg: "from-emerald-950/75 via-slate-900/95 to-teal-950/60",
    badge: "bg-emerald-500 text-slate-950",
    bar: "bg-emerald-400",
  },
  purple: {
    border: "border-purple-500/60",
    bg: "from-purple-950/75 via-slate-900/95 to-indigo-950/60",
    badge: "bg-purple-500 text-white",
    bar: "bg-purple-400",
  },
};

const SLIDE_INTERVAL_MS = 15_000;

function renderHighlightedHeadline(headline: string, featuredNick?: string) {
  if (!featuredNick) return headline;
  const idx = headline.indexOf(featuredNick);
  if (idx === -1) return headline;
  const before = headline.slice(0, idx);
  const after = headline.slice(idx + featuredNick.length);
  return (
    <>
      {before}
      <span className="inline-block rounded-lg border border-amber-300/40 bg-amber-400/15 px-1.5 py-0.5 text-amber-300 shadow-2xs">
        {featuredNick}
      </span>
      {after}
    </>
  );
}

export function DynamicNewspaper() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    window.addEventListener("desafios:game-records-updated", bump);
    window.addEventListener("desafios:registry-updated", bump);
    // Verifica periodicamente se virou a edição das 20h
    const editionCheck = window.setInterval(bump, 60_000);
    return () => {
      window.removeEventListener("desafios:game-records-updated", bump);
      window.removeEventListener("desafios:registry-updated", bump);
      window.clearInterval(editionCheck);
    };
  }, []);

  const articles: NewsArticle[] = useMemo(() => {
    void refreshTick;
    const players = getAllRegisteredPlayers();
    const records = loadGameRecords();
    const pioneers = getCachedMedalPioneers(players);
    return generateNewspaperArticles({
      players,
      records,
      pioneers,
      now: new Date(),
    });
  }, [refreshTick]);

  const editionKey = useMemo(() => {
    void refreshTick;
    return getNewspaperEditionKey(new Date());
  }, [refreshTick]);

  const safeIndex = articles.length > 0 ? activeIndex % articles.length : 0;

  useEffect(() => {
    if (paused || articles.length <= 1 || inspectedPlayerId) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % articles.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, articles.length, inspectedPlayerId]);

  const goPrev = () => {
    if (articles.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + articles.length) % articles.length);
  };

  const goNext = () => {
    if (articles.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % articles.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(diff) < 40) return;
    if (diff < 0) goNext();
    else goPrev();
  };

  if (articles.length === 0) return null;

  const currentTone = TONE_STYLES[articles[safeIndex].accentTone] ?? TONE_STYLES.sky;

  return (
    <section
      aria-label="Jornal Dinâmico Integração"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden rounded-3xl border-2 ${currentTone.border} bg-gradient-to-br ${currentTone.bg} shadow-lg transition-colors duration-500`}
    >
      {/* Cabeçalho do Jornal */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/10 text-white">
            <Newspaper className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Jornal Integração
            </h2>
            <p className="text-[10px] font-semibold text-slate-300">
              Edição das 07h • {editionKey.split("-").reverse().join("/")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {articles.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                title={paused ? "Retomar rotação" : "Pausar para ler"}
                aria-label={paused ? "Retomar rotação" : "Pausar para ler"}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={goPrev}
                title="Notícia anterior"
                aria-label="Notícia anterior"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                title="Próxima notícia"
                aria-label="Próxima notícia"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Trilha Horizontal Fluida do Carrossel */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {articles.map((article) => {
            const tone = TONE_STYLES[article.accentTone] ?? TONE_STYLES.sky;
            return (
              <article key={article.id} className="w-full shrink-0 p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-xs ${tone.badge} ${
                      article.isBreaking ? "animate-pulse" : ""
                    }`}
                  >
                    {article.badge}
                  </span>

                  {article.featuredPlayer && (
                    <button
                      type="button"
                      onClick={() => setInspectedPlayerId(article.featuredPlayer!.playerId)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-extrabold text-white hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Ver perfil de {article.featuredPlayer.nick}
                      <ExternalLink className="h-3 w-3 opacity-80" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="font-display text-base sm:text-xl font-black text-white leading-snug">
                    {renderHighlightedHeadline(article.headline, article.featuredPlayer?.nick)}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed">
                    {article.summary}
                  </p>
                </div>

                {/* Métricas Rápidas da Matéria */}
                {article.metrics && article.metrics.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {article.metrics.map((m, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-left"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {m.label}
                        </div>
                        <div className="font-display text-xs sm:text-sm font-black text-white">
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Card Interativo Top 3 */}
                {article.top3Players && article.top3Players.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {article.top3Players.map((pl, idx) => {
                      const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                      return (
                        <button
                          key={pl.playerId}
                          type="button"
                          onClick={() => setInspectedPlayerId(pl.playerId)}
                          className="group flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-black/30 px-3 py-2.5 text-left transition-all hover:border-white/40 hover:bg-white/10 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{rankEmoji}</span>
                            <div className="min-w-0">
                              <div className="truncate font-display text-xs sm:text-sm font-black text-white group-hover:underline">
                                {pl.nick}
                              </div>
                              <div className="truncate text-[10px] font-medium text-slate-300">
                                {pl.school}
                              </div>
                              {pl.metricLabel && (
                                <div className="text-[10px] font-extrabold text-amber-300 mt-0.5">
                                  {pl.metricLabel}
                                </div>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-white" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Rodapé com Bolinhas Indicadoras */}
      {articles.length > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/20 px-4 py-2">
          <div className="flex items-center gap-1.5">
            {articles.map((art, idx) => (
              <button
                key={art.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`Ir para matéria ${idx + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === safeIndex
                    ? `w-6 ${currentTone.bar}`
                    : "w-2 bg-white/25 hover:bg-white/45"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] font-bold text-slate-300">
            {safeIndex + 1} / {articles.length} {paused ? "• Pausado" : ""}
          </span>
        </div>
      )}

      {/* Modal de Inspeção de Perfil ao Clicar em um Jogador */}
      {inspectedPlayerId && (
        <Suspense fallback={null}>
          <PlayerInspectModal
            playerId={inspectedPlayerId}
            open={Boolean(inspectedPlayerId)}
            onOpenChange={(open) => {
              if (!open) setInspectedPlayerId(null);
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
