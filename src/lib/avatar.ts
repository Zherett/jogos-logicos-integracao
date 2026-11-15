// Browser-safe Avatar configuration & deterministic fallback resolver.
// Prepares the RPG / X1 ecosystem for a future full Avatar Customization system.

import type { RobotShapeTheme } from "./rpg-content.ts";

export type AvatarVisorStyle = "cyber" | "laser" | "happy" | "shield" | "star";
export type AvatarChassisStyle = "standard" | "titan" | "aero" | "mecha";
export type AvatarAccessoryStyle = "none" | "antenna" | "wings" | "halo" | "horns";
export type AvatarEmblemStyle = "core" | "bolt" | "shield" | "star" | "crown";

export interface PlayerAvatarConfig {
  chassisId: AvatarChassisStyle;
  headShape: RobotShapeTheme;
  visorId: AvatarVisorStyle;
  primaryColor: string;
  accentColor: string;
  accessoryId?: AvatarAccessoryStyle;
  emblemId?: AvatarEmblemStyle;
}

const HEAD_SHAPES: readonly RobotShapeTheme[] = [
  "triangle",
  "hexagon",
  "diamond",
  "octagon",
  "star",
];

const VISOR_STYLES: readonly AvatarVisorStyle[] = [
  "cyber",
  "laser",
  "happy",
  "shield",
  "star",
];

const CHASSIS_STYLES: readonly AvatarChassisStyle[] = [
  "standard",
  "titan",
  "aero",
  "mecha",
];

const ACCESSORY_STYLES: readonly AvatarAccessoryStyle[] = [
  "none",
  "antenna",
  "wings",
  "halo",
  "horns",
];

const EMBLEM_STYLES: readonly AvatarEmblemStyle[] = [
  "core",
  "bolt",
  "shield",
  "star",
  "crown",
];

const HOST_PALETTES: readonly { primary: string; accent: string }[] = [
  { primary: "#0ea5e9", accent: "#38bdf8" },
  { primary: "#2563eb", accent: "#60a5fa" },
  { primary: "#06b6d4", accent: "#22d3ee" },
  { primary: "#4f46e5", accent: "#818cf8" },
];

const GUEST_PALETTES: readonly { primary: string; accent: string }[] = [
  { primary: "#ef4444", accent: "#fb923c" },
  { primary: "#e11d48", accent: "#f43f5e" },
  { primary: "#dc2626", accent: "#f87171" },
  { primary: "#ea580c", accent: "#fbbf24" },
];

/**
 * Resolves a player's custom avatar if defined, or generates a rich, deterministic
 * robot appearance per match seed & side (left/blue vs right/red) so every X1 match
 * has distinct visual variations out of the box.
 */
export function resolvePlayerAvatar(
  custom: PlayerAvatarConfig | undefined | null,
  seed: number,
  side: "left" | "right",
): PlayerAvatarConfig {
  if (custom && custom.headShape && custom.primaryColor) {
    return {
      chassisId: custom.chassisId ?? "standard",
      headShape: custom.headShape,
      visorId: custom.visorId ?? "cyber",
      primaryColor: custom.primaryColor,
      accentColor: custom.accentColor || custom.primaryColor,
      accessoryId: custom.accessoryId ?? "none",
      emblemId: custom.emblemId ?? "core",
    };
  }

  const salt = side === "left" ? 17 : 53;
  const h = Math.abs((seed * 2654435761 + salt * 97) | 0);
  const palettes = side === "left" ? HOST_PALETTES : GUEST_PALETTES;
  const palette = palettes[h % palettes.length];

  return {
    chassisId: CHASSIS_STYLES[(h >> 2) % CHASSIS_STYLES.length],
    headShape: HEAD_SHAPES[(h >> 4) % HEAD_SHAPES.length],
    visorId: VISOR_STYLES[(h >> 6) % VISOR_STYLES.length],
    primaryColor: palette.primary,
    accentColor: palette.accent,
    accessoryId: ACCESSORY_STYLES[(h >> 8) % ACCESSORY_STYLES.length],
    emblemId: EMBLEM_STYLES[(h >> 10) % EMBLEM_STYLES.length],
  };
}
