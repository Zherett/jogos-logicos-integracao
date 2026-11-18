import { useState } from "react";
import { ImageOff, Lock, Sparkles } from "lucide-react";
import {
  CARD_RARITY_META,
  isValidCardMediaUrl,
  type CardDefinition,
} from "@/lib/cards-catalog";

interface CollectibleCardViewProps {
  card: Pick<
    CardDefinition,
    "name" | "description" | "rarity" | "imageUrl" | "imageFit" | "isFoil"
  >;
  count?: number;
  isNew?: boolean;
  locked?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function CollectibleCardView({
  card,
  count,
  isNew = false,
  locked = false,
  compact = false,
  onClick,
}: CollectibleCardViewProps) {
  const [imgError, setImgError] = useState(false);
  const meta = CARD_RARITY_META[card.rarity] ?? CARD_RARITY_META.comum;
  const hasValidUrl = isValidCardMediaUrl(card.imageUrl) && !imgError;
  const isFoil = Boolean(card.isFoil) && !locked;
  const useContainBlur = (card.imageFit ?? "contain-blur") === "contain-blur";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 isolate transition-all ${meta.cardBgClass} ${meta.borderClass} ${
        locked ? "opacity-55 grayscale" : meta.glowClass
      } ${compact ? "gap-1.5 p-2 pb-1.5" : "gap-1.5 p-2.5 pb-2"} ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl" : ""
      }`}
    >
      {/* Camadas de Efeito Foil (Degradê Holográfico + Feixe de Brilho) */}
      {isFoil && (
        <>
          <div
            aria-hidden="true"
            className="card-foil-gradient pointer-events-none absolute inset-0 z-10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          >
            <div className="card-foil-shimmer absolute inset-y-0 w-1/2 opacity-75" />
          </div>
        </>
      )}

      {/* 1. Nome da Carta no Topo */}
      <div
        className={`relative z-20 mx-auto w-full rounded-xl border px-2.5 py-1 text-center shadow-inner ${meta.innerBoxClass}`}
      >
        <h4
          className={`font-display font-extrabold tracking-tight line-clamp-1 ${
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"
          }`}
        >
          {card.name.trim() || "Nome da Carta"}
        </h4>
      </div>

      {/* 2. Moldura da Imagem / GIF ao Centro */}
      <div
        className={`relative z-20 mx-auto w-full overflow-hidden rounded-xl border border-slate-300/80 dark:border-black/40 shadow-sm aspect-[4/3] ${
          hasValidUrl ? "bg-slate-950/20" : "bg-white dark:bg-slate-950/75"
        }`}
      >
        {hasValidUrl ? (
          <>
            {useContainBlur && (
              <img
                src={card.imageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-150 brightness-90"
              />
            )}
            <img
              src={card.imageUrl}
              alt={card.name || "Carta colecionável"}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              className={`relative z-10 h-full w-full transition-transform duration-300 ${
                useContainBlur ? "object-contain" : "object-cover"
              } ${onClick && !locked ? "group-hover:scale-105" : ""}`}
            />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-slate-500">
            <ImageOff className="h-6 w-6 opacity-50" />
            <span className="text-[10px] font-semibold text-center">
              {card.imageUrl ? "Imagem indisponível" : "Prévia da Imagem/GIF"}
            </span>
          </div>
        )}

        {locked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/55 backdrop-blur-[2px]">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
        )}

        {/* Badge de quantidade acumulada */}
        {typeof count === "number" && count > 0 && (
          <span className="absolute top-1.5 right-1.5 z-20 rounded-full bg-white/95 dark:bg-slate-950/90 border border-slate-300 dark:border-white/20 px-2 py-0.5 font-mono text-[10px] font-black text-slate-900 dark:text-white shadow-sm">
            x{count}
          </span>
        )}

        {/* Badge NOVA! na abertura de pacote */}
        {isNew && (
          <span className="absolute top-1.5 left-1.5 z-20 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-sm">
            <Sparkles className="h-2.5 w-2.5" /> Nova!
          </span>
        )}
      </div>

      {/* 3. Caixa de Descrição Ampliada (estendida para cima e para baixo) */}
      <div
        className={`relative z-20 flex flex-1 flex-col justify-start rounded-xl border shadow-inner ${meta.innerBoxClass} ${
          compact ? "min-h-[3.25rem] p-2" : "min-h-[6.75rem] p-2.5"
        }`}
      >
        <p
          className={`text-justify leading-snug text-slate-700 dark:text-slate-200/95 ${
            compact ? "text-[10px] line-clamp-3" : "text-[11px] sm:text-xs line-clamp-6"
          }`}
        >
          {card.description.trim() || "Descrição da carta colecionável."}
        </p>
      </div>
    </div>
  );
}
