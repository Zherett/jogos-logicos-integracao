import React from "react";
import { usePlayerPresence } from "@/lib/presence";

export interface PlayerActivityBadgeProps {
  playerId?: string;
  playfabId?: string;
  nick?: string;
  nickNormalized?: string;
  size?: "xs" | "sm" | "md";
  mode?: "chip" | "banner";
  className?: string;
}

export const PlayerActivityBadge: React.FC<PlayerActivityBadgeProps> = ({
  playerId,
  playfabId,
  nick,
  nickNormalized,
  size = "xs",
  mode = "chip",
  className = "",
}) => {
  const { activityDetails, status } = usePlayerPresence(playerId, {
    playfabId,
    nick,
    nickNormalized,
  });

  // O status offline continua do jeito que está: se o aluno estiver offline ou sem atividade, não renderiza nada no espaço extra
  if (status === "offline" || !activityDetails) {
    return null;
  }

  if (mode === "banner") {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 shadow-2xs transition-all ${activityDetails.colorClass} ${className}`}
        title={`Atividade em tempo real: ${activityDetails.label}`}
      >
        <span className="text-base select-none shrink-0">{activityDetails.icon}</span>
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase opacity-75 tracking-wider block">
            Fazendo agora
          </span>
          <span className="font-extrabold text-xs truncate block">
            {activityDetails.label}
          </span>
        </div>
      </div>
    );
  }

  const sizeClasses = {
    xs: "text-[10px] px-2 py-0.5",
    sm: "text-xs px-2.5 py-1",
    md: "text-sm px-3 py-1.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold tracking-tight shrink-0 shadow-2xs select-none transition-all ${activityDetails.colorClass} ${sizeClasses} ${className}`}
      title={`Atividade em tempo real: ${activityDetails.label}`}
    >
      <span className="text-xs leading-none">{activityDetails.icon}</span>
      <span className="truncate max-w-[170px] sm:max-w-none">{activityDetails.label}</span>
    </span>
  );
};
