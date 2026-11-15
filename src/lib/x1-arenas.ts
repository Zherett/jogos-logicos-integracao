// Deterministic visual arena themes for X1 Online matches.
// Both Host and Guest select the exact same theme from the room's shared `seed`.

export interface X1ArenaTheme {
  id: string;
  name: string;
  badgeText: string;
  containerClass: string;
  headerClass: string;
  arenaBgClass: string;
  accentGlowClass: string;
  sparkColorHex: string;
  gridOverlayStyle: string;
}

export const X1_ARENA_THEMES: readonly X1ArenaTheme[] = [
  {
    id: "cyber",
    name: "Arena Cibernética",
    badgeText: "⚡ ARENA CIBERNÉTICA",
    containerClass: "border-cyan-500/40 bg-card",
    headerClass: "border-cyan-500/30 bg-cyan-950/20",
    arenaBgClass: "bg-gradient-to-br from-slate-950 via-cyan-950/60 to-slate-950 border-cyan-500/30",
    accentGlowClass: "shadow-[0_0_24px_rgba(6,182,212,0.35)]",
    sparkColorHex: "#22d3ee",
    gridOverlayStyle:
      "radial-gradient(circle at 50% 0%, rgba(34,211,238,0.16), transparent 65%)",
  },
  {
    id: "volcanic",
    name: "Forja Vulcânica",
    badgeText: "🔥 FORJA VULCÂNICA",
    containerClass: "border-orange-500/40 bg-card",
    headerClass: "border-orange-500/30 bg-orange-950/20",
    arenaBgClass: "bg-gradient-to-br from-stone-950 via-orange-950/60 to-slate-950 border-orange-500/30",
    accentGlowClass: "shadow-[0_0_24px_rgba(249,115,22,0.35)]",
    sparkColorHex: "#fb923c",
    gridOverlayStyle:
      "radial-gradient(circle at 50% 0%, rgba(251,146,60,0.18), transparent 65%)",
  },
  {
    id: "stellar",
    name: "Estádio Estelar",
    badgeText: "🌌 ESTÁDIO ESTELAR",
    containerClass: "border-violet-500/40 bg-card",
    headerClass: "border-violet-500/30 bg-violet-950/20",
    arenaBgClass: "bg-gradient-to-br from-slate-950 via-indigo-950/70 to-purple-950/60 border-violet-500/30",
    accentGlowClass: "shadow-[0_0_24px_rgba(139,92,246,0.35)]",
    sparkColorHex: "#a78bfa",
    gridOverlayStyle:
      "radial-gradient(circle at 50% 0%, rgba(167,139,250,0.18), transparent 65%)",
  },
  {
    id: "quantum",
    name: "Laboratório Quântico",
    badgeText: "🧪 LAB QUÂNTICO",
    containerClass: "border-emerald-500/40 bg-card",
    headerClass: "border-emerald-500/30 bg-emerald-950/20",
    arenaBgClass: "bg-gradient-to-br from-slate-950 via-emerald-950/60 to-teal-950/50 border-emerald-500/30",
    accentGlowClass: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
    sparkColorHex: "#34d399",
    gridOverlayStyle:
      "radial-gradient(circle at 50% 0%, rgba(52,211,153,0.18), transparent 65%)",
  },
  {
    id: "citadel",
    name: "Cidadela Dourada",
    badgeText: "👑 CIDADELA DOURADA",
    containerClass: "border-amber-500/40 bg-card",
    headerClass: "border-amber-500/30 bg-amber-950/20",
    arenaBgClass: "bg-gradient-to-br from-slate-950 via-amber-950/50 to-slate-950 border-amber-500/35",
    accentGlowClass: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    sparkColorHex: "#fbbf24",
    gridOverlayStyle:
      "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18), transparent 65%)",
  },
];

export function getX1ArenaTheme(seed: number): X1ArenaTheme {
  const idx = Math.abs(Math.floor(seed)) % X1_ARENA_THEMES.length;
  return X1_ARENA_THEMES[idx];
}
