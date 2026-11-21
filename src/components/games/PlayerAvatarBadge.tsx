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
  type AuraDefinition,
  type AvatarDefinition,
  type AvatarIconKey,
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

interface PlayerAvatarBadgeProps {
  avatar?: AvatarDefinition | null;
  color?: string;
  aura?: AuraDefinition | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarBadgeProps["size"]>, { box: string; icon: string }> = {
  xs: { box: "h-8 w-8 rounded-xl", icon: "h-4 w-4" },
  sm: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
  md: { box: "h-14 w-14 rounded-2xl", icon: "h-7 w-7" },
  lg: { box: "h-18 w-18 sm:h-20 sm:w-20 rounded-2xl", icon: "h-9 w-9 sm:h-10 sm:w-10" },
};

export function PlayerAvatarBadge({
  avatar,
  color = DEFAULT_AVATAR_COLOR,
  aura,
  size = "md",
  className = "",
}: PlayerAvatarBadgeProps) {
  const activeAvatar = avatar ?? DEFAULT_AVATARS[0];
  const dims = SIZE_CLASSES[size];
  const auraPres = getAuraPresentation(aura);

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
      {activeAvatar.imageUrl ? (
        <img
          src={activeAvatar.imageUrl}
          alt={activeAvatar.name}
          className="h-full w-full object-cover"
        />
      ) : (
        renderBuiltInIcon(activeAvatar.iconKey, dims.icon)
      )}
    </div>
  );
}
