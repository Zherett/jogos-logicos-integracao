import React from "react";
import { usePlayerPresence, type PresenceStatus } from "@/lib/presence";

export interface PresenceDotProps {
  playerId?: string;
  playfabId?: string;
  nick?: string;
  nickNormalized?: string;
  status?: PresenceStatus;
  tooltipText?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
  showPingAnimation?: boolean;
  showTimeAgoText?: boolean;
}

export const PresenceDot: React.FC<PresenceDotProps> = ({
  playerId,
  playfabId,
  nick,
  nickNormalized,
  status: explicitStatus,
  tooltipText: explicitTooltip,
  size = "sm",
  className = "",
  showPingAnimation = true,
  showTimeAgoText = false,
}) => {
  const presence = usePlayerPresence(playerId, {
    playfabId,
    nick,
    nickNormalized,
  });

  const status: PresenceStatus = explicitStatus ?? presence.status;
  const tooltip = explicitTooltip ?? presence.tooltip;

  const sizeClasses = {
    xs: "h-2 w-2",
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
  }[size];

  // Cores do Usuário:
  // Verde = Online (< 2 min com interação)
  // Amarelo/Âmbar = Inativo (2 a 10 min de inatividade com aba aberta)
  // Vermelho = Offline (> 10 min ou aba fechada)
  const colorClasses = {
    online: "bg-emerald-500 ring-emerald-500/40 shadow-[0_0_6px_rgba(16,185,129,0.8)]",
    idle: "bg-amber-400 dark:bg-amber-400 ring-amber-400/40 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    offline: "bg-rose-500 ring-rose-500/30",
  }[status];

  const badgeBgClasses = {
    online: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    idle: "bg-amber-400/15 border-amber-400/40 text-amber-600 dark:text-amber-400",
    offline: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
  }[status];

  const isAbsolute = className.includes("absolute");

  const dot = (
    <span
      className={`${isAbsolute ? "" : "relative"} inline-flex shrink-0 items-center justify-center`}
      title={tooltip}
      aria-label={tooltip}
    >
      {/* Ping suave se estiver online, ativado e fora de listas compactas */}
      {status === "online" && showPingAnimation && size !== "xs" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60`}
        />
      )}
      <span
        className={`relative inline-block rounded-full ring-2 ring-card transition-colors duration-300 ${sizeClasses} ${colorClasses}`}
      />
    </span>
  );

  if (showTimeAgoText) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badgeBgClasses} ${className}`}
        title={tooltip}
      >
        {dot}
        <span className="truncate">{presence.timeAgo}</span>
      </span>
    );
  }

  return (
    <span
      className={`${isAbsolute ? "" : "relative"} inline-flex shrink-0 items-center justify-center ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {dot}
    </span>
  );
};
