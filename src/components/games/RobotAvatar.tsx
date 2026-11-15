import type { PlayerAvatarConfig } from "@/lib/avatar";
import type { RobotShapeTheme } from "@/lib/rpg-content";

export type RobotAvatarPose = "idle" | "attack" | "hit" | "victory" | "defeat";

interface RobotAvatarProps {
  avatar: PlayerAvatarConfig;
  side: "left" | "right";
  pose?: RobotAvatarPose;
  className?: string;
}

function renderHeadShape(shape: RobotShapeTheme, fill: string, stroke: string) {
  switch (shape) {
    case "triangle":
      return <polygon points="60,16 96,56 24,56" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "diamond":
      return <polygon points="60,12 94,37 60,60 26,37" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "hexagon":
      return <polygon points="36,16 84,16 98,37 84,58 36,58 22,37" fill={fill} stroke={stroke} strokeWidth="2.5" />;
    case "octagon":
      return (
        <polygon
          points="38,14 82,14 96,28 96,46 82,60 38,60 24,46 24,28"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
        />
      );
    case "star":
      return (
        <polygon
          points="60,10 70,27 90,29 75,42 80,60 60,50 40,60 45,42 30,29 50,27"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
        />
      );
  }
}

function renderVisor(visorId: PlayerAvatarConfig["visorId"], accent: string) {
  switch (visorId) {
    case "laser":
      return (
        <g>
          <rect x="38" y="32" width="44" height="9" rx="4.5" fill="#0f172a" />
          <rect x="42" y="34.5" width="36" height="4" rx="2" fill="#f43f5e" />
        </g>
      );
    case "happy":
      return (
        <g>
          <path d="M43 38 Q49 30 55 38" fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M65 38 Q71 30 77 38" fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" />
        </g>
      );
    case "shield":
      return (
        <g>
          <polygon points="37,31 83,31 78,43 42,43" fill="#0f172a" stroke={accent} strokeWidth="1.5" />
          <line x1="45" y1="37" x2="75" y2="37" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case "star":
      return (
        <g>
          <circle cx="48" cy="36" r="4.5" fill={accent} />
          <circle cx="72" cy="36" r="4.5" fill={accent} />
          <circle cx="48" cy="36" r="2" fill="#ffffff" />
          <circle cx="72" cy="36" r="2" fill="#ffffff" />
        </g>
      );
    case "cyber":
    default:
      return (
        <g>
          <rect x="39" y="31" width="42" height="11" rx="5.5" fill="#0f172a" />
          <circle cx="49" cy="36.5" r="3.2" fill={accent} />
          <circle cx="71" cy="36.5" r="3.2" fill={accent} />
        </g>
      );
  }
}

function renderAccessoryBack(accessoryId: PlayerAvatarConfig["accessoryId"], accent: string) {
  if (accessoryId === "wings") {
    return (
      <g opacity="0.85">
        <polygon points="28,68 4,50 10,82 28,84" fill={accent} />
        <polygon points="92,68 116,50 110,82 92,84" fill={accent} />
      </g>
    );
  }
  return null;
}

function renderAccessoryFront(accessoryId: PlayerAvatarConfig["accessoryId"], accent: string) {
  switch (accessoryId) {
    case "antenna":
      return (
        <g>
          <line x1="60" y1="14" x2="60" y2="4" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="60" cy="4" r="3.5" fill={accent} />
        </g>
      );
    case "halo":
      return (
        <ellipse
          cx="60"
          cy="7"
          rx="18"
          ry="4"
          fill="none"
          stroke="#fde047"
          strokeWidth="2.2"
          opacity="0.9"
        />
      );
    case "horns":
      return (
        <g>
          <polygon points="34,20 22,5 42,16" fill={accent} />
          <polygon points="86,20 98,5 78,16" fill={accent} />
        </g>
      );
    default:
      return null;
  }
}

function renderEmblem(emblemId: PlayerAvatarConfig["emblemId"], accent: string) {
  switch (emblemId) {
    case "bolt":
      return <polygon points="62,71 54,84 61,84 57,96 67,82 60,82" fill={accent} />;
    case "shield":
      return <polygon points="51,72 69,72 67,86 60,94 53,86" fill={accent} opacity="0.9" />;
    case "star":
      return (
        <polygon
          points="60,72 63,79 71,79 65,84 67,91 60,87 53,91 55,84 49,79 57,79"
          fill={accent}
        />
      );
    case "crown":
      return <polygon points="49,88 51,75 56,82 60,73 64,82 69,75 71,88" fill="#fde047" />;
    case "core":
    default:
      return (
        <g>
          <circle cx="60" cy="83" r="8.5" fill="#0f172a" stroke={accent} strokeWidth="2" />
          <circle cx="60" cy="83" r="4" fill={accent} />
        </g>
      );
  }
}

export function RobotAvatar({
  avatar,
  side,
  pose = "idle",
  className = "h-24 w-24",
}: RobotAvatarProps) {
  const poseTransform =
    pose === "attack"
      ? side === "left"
        ? "translate-x-2 -rotate-3 scale-105"
        : "-translate-x-2 rotate-3 scale-105"
      : pose === "hit"
        ? side === "left"
          ? "-translate-x-2 rotate-6 opacity-80"
          : "translate-x-2 -rotate-6 opacity-80"
        : pose === "victory"
          ? "-translate-y-1.5 scale-110"
          : pose === "defeat"
            ? "translate-y-1 opacity-50 grayscale"
            : "";

  const torsoWidth = avatar.chassisId === "titan" ? 56 : avatar.chassisId === "aero" ? 42 : 48;
  const torsoX = 60 - torsoWidth / 2;

  return (
    <div
      className={`inline-flex items-center justify-center transition-transform duration-200 ${poseTransform} ${className}`}
    >
      <svg
        viewBox="0 0 120 120"
        className={`h-full w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)] ${
          side === "right" ? "-scale-x-100" : ""
        }`}
        aria-hidden="true"
      >
        {/* Camada 1: Acessório traseiro */}
        {renderAccessoryBack(avatar.accessoryId, avatar.accentColor)}

        {/* Camada 2: Braços / Canhões laterais */}
        <rect x="20" y="66" width="12" height="26" rx="6" fill="#1e293b" stroke={avatar.accentColor} strokeWidth="1.5" />
        <rect x="88" y="66" width="12" height="26" rx="6" fill="#1e293b" stroke={avatar.accentColor} strokeWidth="1.5" />

        {/* Camada 3: Chassi / Corpo */}
        <rect
          x={torsoX}
          y="62"
          width={torsoWidth}
          height="40"
          rx={avatar.chassisId === "mecha" ? 6 : 12}
          fill={avatar.primaryColor}
          stroke={avatar.accentColor}
          strokeWidth="2.2"
        />

        {/* Camada 4: Emblema peitoral */}
        {renderEmblem(avatar.emblemId, avatar.accentColor)}

        {/* Pescoço */}
        <rect x="53" y="56" width="14" height="8" rx="2" fill="#334155" />

        {/* Camada 5: Cabeça geométrica */}
        {renderHeadShape(avatar.headShape, avatar.primaryColor, avatar.accentColor)}

        {/* Camada 6: Visor / Olhos */}
        {renderVisor(avatar.visorId, avatar.accentColor)}

        {/* Camada 7: Acessório frontal / topo */}
        {renderAccessoryFront(avatar.accessoryId, avatar.accentColor)}

        {/* Base / Propulsores */}
        <rect x="40" y="102" width="14" height="10" rx="4" fill="#1e293b" />
        <rect x="66" y="102" width="14" height="10" rx="4" fill="#1e293b" />
      </svg>
    </div>
  );
}
