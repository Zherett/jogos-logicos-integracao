import type { CSSProperties } from "react";
import {
  Bomb,
  Bot,
  Crown,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Ghost,
  Headphones,
  Heart,
  Rocket,
  Shield,
  Smile,
  Star,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import {
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATARS,
  isSafeCosmeticImageUrl,
  type AuraDefinition,
  type AvatarDefinition,
  type AvatarIconKey,
  type AvatarLetterVariant,
} from "@/lib/cosmetics-catalog";

export function getAuraPresentation(aura?: AuraDefinition | null): {
  className: string;
  style: CSSProperties;
} {
  if (!aura) return { className: "", style: {} };
  const c1 = aura.primaryColor || "#3b82f6";
  const c2 = aura.secondaryColor || c1;

  if (aura.kind === "bicolor") {
    return {
      className: "animate-profile-aura-bicolor",
      style: {
        "--aura-c1": c1,
        "--aura-c2": c2,
        borderColor: c1,
      } as CSSProperties,
    };
  }
  if (aura.kind === "pulsing") {
    return {
      className: "animate-profile-aura-pulse",
      style: {
        "--aura-c1": c1,
        borderColor: c1,
      } as CSSProperties,
    };
  }
  return {
    className: "",
    style: {
      borderColor: c1,
      boxShadow: `0 0 0 2px ${c1}, 0 0 12px 1px ${c1}`,
    },
  };
}

function renderBuiltInIcon(iconKey: AvatarIconKey | undefined, className: string) {
  switch (iconKey) {
    case "smile":
      return <Smile className={className} />;
    case "heart":
      return <Heart className={className} />;
    case "flower":
      return <Flower2 className={className} />;
    case "star":
      return <Star className={className} />;
    case "headphones":
      return <Headphones className={className} />;
    case "gamepad":
      return <Gamepad2 className={className} />;
    case "bomb":
      return <Bomb className={className} />;
    case "zap":
      return <Zap className={className} />;
    case "shield":
      return <Shield className={className} />;
    case "rocket":
      return <Rocket className={className} />;
    case "flame":
      return <Flame className={className} />;
    case "ghost":
      return <Ghost className={className} />;
    case "bot":
      return <Bot className={className} />;
    case "bot_cyber":
      return (
        <svg viewBox="0 0 36 36" className={className} fill="none">
          <rect x="6" y="10" width="24" height="19" rx="6" stroke="currentColor" strokeWidth="2.4" />
          <path d="M18 4v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="18" cy="4" r="2" fill="currentColor" />
          <rect x="10" y="15" width="16" height="6" rx="3" fill="currentColor" fillOpacity="0.28" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="14.5" cy="18" r="1.5" fill="currentColor" />
          <circle cx="21.5" cy="18" r="1.5" fill="currentColor" />
          <path d="M13 24h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "bot_crown":
      return (
        <svg viewBox="0 0 36 36" className={className} fill="none">
          <path d="M10 10l3-5 5 3.5L23 5l3 5H10z" fill="currentColor" fillOpacity="0.85" />
          <rect x="7" y="11" width="22" height="18" rx="6" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="14" cy="19" r="2" fill="currentColor" />
          <circle cx="22" cy="19" r="2" fill="currentColor" />
          <path d="M13 24.5h10" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case "trophy":
      return <Trophy className={className} />;
    case "gem":
      return <Gem className={className} />;
    case "crown":
      return <Crown className={className} />;
    case "user":
    default:
      return <User className={className} />;
  }
}

function renderLetterAvatar(
  letterChar: string,
  variant: AvatarLetterVariant | undefined,
  textClass: string,
) {
  const ch = letterChar.trim().toUpperCase().slice(0, 1) || "A";

  if (variant === "round") {
    return (
      <span
        aria-hidden="true"
        className={`relative z-10 select-none leading-none ${textClass}`}
        style={{
          fontFamily: '"Fredoka", system-ui, sans-serif',
          fontWeight: 700,
          WebkitTextStroke: "0.03em currentColor",
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.14))",
        }}
      >
        {ch}
      </span>
    );
  }

  if (variant === "square") {
    return (
      <span className="relative grid h-full w-full place-items-center select-none">
        <svg
          aria-hidden="true"
          viewBox="0 0 36 36"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-22"
          fill="none"
        >
          <polygon
            points="6,3 30,3 33,6 33,30 30,33 6,33 3,30 3,6"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <rect x="6.5" y="6.5" width="4" height="4" fill="currentColor" opacity="0.45" />
          <rect x="25.5" y="25.5" width="4" height="4" fill="currentColor" opacity="0.45" />
        </svg>
        <span
          aria-hidden="true"
          className={`relative z-10 leading-none tracking-tight ${textClass}`}
          style={{
            fontFamily: '"Chakra Petch", system-ui, sans-serif',
            fontWeight: 700,
            WebkitTextStroke: "0.025em currentColor",
            paintOrder: "stroke fill",
          }}
        >
          {ch}
        </span>
      </span>
    );
  }

  // Variação "simple" (padrão): letra normal, fininha, fonte simples
  return (
    <span
      aria-hidden="true"
      className={`relative z-10 select-none leading-none ${textClass}`}
      style={{
        fontFamily: '"Nunito", system-ui, sans-serif',
        fontWeight: 400,
      }}
    >
      {ch}
    </span>
  );
}

function renderAvatarContent(
  av: AvatarDefinition,
  iconClass: string,
  letterClass: string,
) {
  if (av.imageUrl && isSafeCosmeticImageUrl(av.imageUrl)) {
    return (
      <img
        src={av.imageUrl.trim()}
        alt={av.name}
        className="h-full w-full object-cover"
      />
    );
  }
  if (av.letterChar) {
    return renderLetterAvatar(av.letterChar, av.letterVariant, letterClass);
  }
  return renderBuiltInIcon(av.iconKey, iconClass);
}

interface PlayerAvatarBadgeProps {
  avatar?: AvatarDefinition | null;
  secondaryAvatar?: AvatarDefinition | null;
  color?: string;
  aura?: AuraDefinition | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<
  NonNullable<PlayerAvatarBadgeProps["size"]>,
  { box: string; icon: string; letter: string }
> = {
  xs: { box: "h-8 w-8 rounded-xl", icon: "h-4 w-4", letter: "text-base" },
  sm: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5", letter: "text-xl" },
  md: { box: "h-14 w-14 rounded-2xl", icon: "h-7 w-7", letter: "text-3xl" },
  lg: {
    box: "h-18 w-18 sm:h-20 sm:w-20 rounded-2xl",
    icon: "h-9 w-9 sm:h-10 sm:w-10",
    letter: "text-4xl sm:text-[2.6rem]",
  },
};

export function PlayerAvatarBadge({
  avatar,
  secondaryAvatar,
  color = DEFAULT_AVATAR_COLOR,
  aura,
  size = "md",
  className = "",
}: PlayerAvatarBadgeProps) {
  const activeAvatar = avatar ?? DEFAULT_AVATARS[0];
  const hasDual = Boolean(secondaryAvatar && secondaryAvatar.id !== activeAvatar.id);
  const dims = SIZE_CLASSES[size];
  const auraPres = getAuraPresentation(aura);

  if (!hasDual || !secondaryAvatar) {
    return (
      <div
        className={`relative grid shrink-0 place-items-center overflow-hidden border-2 shadow-sm transition-all ${dims.box} ${auraPres.className} ${className}`}
        style={{
          backgroundColor: activeAvatar.imageUrl ? undefined : `${color}22`,
          borderColor: aura ? aura.primaryColor : `${color}88`,
          color,
          ...auraPres.style,
        }}
        title={activeAvatar.name}
      >
        {renderAvatarContent(activeAvatar, dims.icon, dims.letter)}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden border-2 shadow-sm transition-all perspective-1000 ${dims.box} ${auraPres.className} ${className}`}
      style={{
        backgroundColor: `${color}18`,
        borderColor: aura ? aura.primaryColor : `${color}88`,
        color,
        ...auraPres.style,
      }}
      title={`${activeAvatar.name} ⇄ ${secondaryAvatar.name}`}
    >
      <div className="relative h-full w-full preserve-3d animate-avatar-dual-spin">
        {/* Face A (Avatar Principal) */}
        <div
          className="absolute inset-0 grid place-items-center backface-hidden animate-avatar-dual-face-a"
          style={{
            backgroundColor: activeAvatar.imageUrl ? undefined : `${color}22`,
          }}
        >
          {renderAvatarContent(activeAvatar, dims.icon, dims.letter)}
        </div>

        {/* Face B (Avatar Secundário) */}
        <div
          className="absolute inset-0 grid place-items-center backface-hidden animate-avatar-dual-face-b"
          style={{
            backgroundColor: secondaryAvatar.imageUrl ? undefined : `${color}22`,
          }}
        >
          {renderAvatarContent(secondaryAvatar, dims.icon, dims.letter)}
        </div>
      </div>

      {/* Efeito Foil acionado logo ao completar cada giro */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden animate-avatar-dual-foil-overlay"
      >
        <div className="card-foil-gradient absolute inset-0 opacity-90" />
        <div className="card-foil-shimmer absolute inset-y-0 w-3/5 opacity-95 animate-avatar-dual-foil-sweep" />
      </div>
    </div>
  );
}
