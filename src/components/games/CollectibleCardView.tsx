import { useState } from "react";
import { ImageOff, Lock, Sparkles } from "lucide-react";
import {
  CARD_RARITY_META,
  isValidCardMediaUrl,
  type CardDefinition,
} from "@/lib/cards-catalog";

interface CollectibleCardViewProps {
  card: Pick<CardDefinition, "name" | "description" | "rarity" | "imageUrl">;
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
      className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-all ${meta.borderClass} ${
        locked ? "opacity-55 grayscale" : meta.glowClass
      } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : ""}`}
    >
      {/* Imagem / GIF da Carta */}
      <div
        className={`relative w-full overflow-hidden bg-muted/40 ${
          compact ? "aspect-[4/3]" : "aspect-square"
        }`}
      >
        {hasValidUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name || "Carta colecionável"}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className={`h-full w-full object-cover transition-transform duration-300 ${
              onClick && !locked ? "group-hover:scale-105" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
            <ImageOff className="h-6 w-6 opacity-50" />
            <span className="text-[10px] font-semibold text-center">
              {card.imageUrl ? "Imagem indisponível" : "Prévia da Imagem/GIF"}
            </span>
          </div>
        )}

        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px]">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
        )}

        {/* Badge de quantidade acumulada */}
        {typeof count === "number" && count > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-background/90 border px-2 py-0.5 font-mono text-[10px] font-black text-foreground shadow-sm">
            x{count}
          </span>
        )}

        {/* Badge NOVA! na abertura de pacote */}
        {isNew && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-sm">
            <Sparkles className="h-2.5 w-2.5" /> Nova!
          </span>
        )}
      </div>

      {/* Rodapé da Carta */}
      <div className={`flex flex-1 flex-col justify-between gap-1 ${compact ? "p-2.5" : "p-3"}`}>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${meta.badgeClass}`}
            >
              {meta.label}
            </span>
          </div>
          <h4 className="font-display text-xs sm:text-sm font-extrabold text-foreground line-clamp-1">
            {card.name.trim() || "Nome da Carta"}
          </h4>
          {!compact && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
              {card.description.trim() || "Descrição da carta colecionável."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
