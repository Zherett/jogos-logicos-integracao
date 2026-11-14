// Content generator for the "Formas e Cores" game

export type Shape =
  | "square" | "circle" | "oval" | "triangle"
  | "rectH" | "rectV"
  | "pentagon" | "diamond" | "hexagon" | "trapezoid"
  | "triIsosceles" | "triScalene" | "triEquilateral";

export type ColorName =
  | "vermelho" | "azul" | "verde" | "amarelo" | "roxo"
  | "laranja" | "rosa" | "preto" | "branco" | "marrom";

export const COLOR_HEX: Record<ColorName, string> = {
  vermelho: "#ef4444",
  azul:     "#3b82f6",
  verde:    "#22c55e",
  amarelo:  "#eab308",
  roxo:     "#a855f7",
  laranja:  "#f97316",
  rosa:     "#ec4899",
  preto:    "#111827",
  branco:   "#ffffff",
  marrom:   "#78350f",
};

export const SHAPES: Shape[] = [
  "square", "circle", "oval", "triangle", "rectH", "rectV",
];

/** Extra shapes introduced at level 4. */
export const ADVANCED_SHAPES: Shape[] = [
  "pentagon", "diamond", "hexagon", "trapezoid",
  "triIsosceles", "triScalene", "triEquilateral",
];

export const SHAPE_LABEL: Record<Shape, string> = {
  square: "quadrado",
  circle: "círculo",
  oval: "oval",
  triangle: "triângulo",
  rectH: "retângulo horizontal",
  rectV: "retângulo vertical",
  pentagon: "pentágono",
  diamond: "losango",
  hexagon: "hexágono",
  trapezoid: "trapézio",
  triIsosceles: "triângulo isósceles",
  triScalene: "triângulo escaleno",
  triEquilateral: "triângulo equilátero",
};

// Four size steps (in pixels of the visual box)
export const SIZE_PX = [46, 68, 96, 128] as const;
export const SIZE_LABEL = ["Pequeno", "Médio", "Grande", "Muito Grande"] as const;
export type SizeIdx = 0 | 1 | 2 | 3;

export interface Piece {
  id: string;
  shape: Shape;
  color: ColorName;
  size: SizeIdx;
}

export interface Mode1Question {
  mode: 1;
  targetColor: ColorName;
  pieces: Piece[];
  targetIds: string[]; // pieces that are of targetColor
}

export interface Mode2Slot { id: string; shape: Shape; }
export interface Mode2Question {
  mode: 2;
  slots: Mode2Slot[];
  pieces: Piece[]; // includes matching + distractor
}

export interface Mode3Slot { id: string; shape: Shape; size: SizeIdx; }
export interface Mode3Question {
  mode: 3;
  slots: Mode3Slot[];
  pieces: Piece[];
}

export interface Mode4Question {
  mode: 4;
  leftColor: ColorName;
  rightColor: ColorName;
  pieces: Piece[];
  leftTargetIds: string[];
  rightTargetIds: string[];
}

export type Question = Mode1Question | Mode2Question | Mode3Question | Mode4Question;

const COLORS = Object.keys(COLOR_HEX) as ColorName[];

function uid() { return Math.random().toString(36).slice(2, 10); }
function ri(n: number) { return Math.floor(Math.random() * n); }
function rand<T>(a: readonly T[]): T { return a[ri(a.length)]; }
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = ri(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function newPiece(shape?: Shape, color?: ColorName, size?: SizeIdx): Piece {
  return {
    id: uid(),
    shape: shape ?? rand(SHAPES),
    color: color ?? rand(COLORS),
    size: (size ?? ri(4)) as SizeIdx,
  };
}

/* ---------- Mode 1: color recognition ---------- */
function genMode1(qInLevel: number): Mode1Question {
  // count grows: 6, 6, 10, 10, 15
  const count = qInLevel <= 1 ? 6 : qInLevel <= 3 ? 10 : 15;
  const targetColor = rand(COLORS);
  const others = COLORS.filter((c) => c !== targetColor);
  const targetCount = Math.max(2, Math.min(count - 2, 2 + ri(3)));
  const pieces: Piece[] = [];
  for (let i = 0; i < targetCount; i++) pieces.push(newPiece(undefined, targetColor));
  for (let i = 0; i < count - targetCount; i++) pieces.push(newPiece(undefined, rand(others)));
  const shuffled = shuffle(pieces);
  return {
    mode: 1,
    targetColor,
    pieces: shuffled,
    targetIds: shuffled.filter((p) => p.color === targetColor).map((p) => p.id),
  };
}

/* ---------- Mode 2: shape matching ---------- */
function genMode2(qInLevel: number, pool: Shape[] = SHAPES): Mode2Question {
  const slotCount = qInLevel <= 1 ? 1 : qInLevel <= 3 ? 2 : 3;
  const chosen = shuffle([...pool]).slice(0, slotCount);
  const slots: Mode2Slot[] = chosen.map((s) => ({ id: uid(), shape: s }));
  const correctPieces = chosen.map((s) => newPiece(s));
  const otherShapes = pool.filter((s) => !chosen.includes(s));
  const distractorCount = Math.max(2, slotCount + 1);
  const distractors: Piece[] = Array.from({ length: distractorCount }, () =>
    newPiece(otherShapes.length ? rand(otherShapes) : rand(pool)),
  );
  return { mode: 2, slots, pieces: shuffle([...correctPieces, ...distractors]) };
}

/* ---------- Mode 3: shape + size ---------- */
function genMode3(qInLevel: number, pool: Shape[] = SHAPES): Mode3Question {
  const slotCount = qInLevel <= 1 ? 1 : qInLevel <= 3 ? 2 : 3;
  const slots: Mode3Slot[] = Array.from({ length: slotCount }, () => ({
    id: uid(),
    shape: rand(pool),
    size: ri(4) as SizeIdx,
  }));
  const correctPieces = slots.map((sl) => {
    // Start with size different from target so player must adjust
    let sz: SizeIdx;
    do { sz = ri(4) as SizeIdx; } while (sz === sl.size);
    return newPiece(sl.shape, undefined, sz);
  });
  const extras: Piece[] = Array.from({ length: slotCount + 2 }, () => newPiece(rand(pool)));
  return { mode: 3, slots, pieces: shuffle([...correctPieces, ...extras]) };
}

/* ---------- Mode 4: dual color separation (left: azul, right: amarelo) ---------- */
function genMode4(qInLevel: number): Mode4Question {
  const count = qInLevel <= 1 ? 8 : qInLevel <= 3 ? 12 : 16;
  const leftColor: ColorName = "azul";
  const rightColor: ColorName = "amarelo";
  const others = COLORS.filter((c) => c !== leftColor && c !== rightColor);
  const leftCount = Math.max(2, Math.min(4, 2 + ri(2)));
  const rightCount = Math.max(2, Math.min(4, 2 + ri(2)));
  const distractorCount = Math.max(2, count - leftCount - rightCount);

  const pieces: Piece[] = [];
  for (let i = 0; i < leftCount; i++) pieces.push(newPiece(undefined, leftColor));
  for (let i = 0; i < rightCount; i++) pieces.push(newPiece(undefined, rightColor));
  for (let i = 0; i < distractorCount; i++) pieces.push(newPiece(undefined, rand(others)));

  const shuffled = shuffle(pieces);
  return {
    mode: 4,
    leftColor,
    rightColor,
    pieces: shuffled,
    leftTargetIds: shuffled.filter((p) => p.color === leftColor).map((p) => p.id),
    rightTargetIds: shuffled.filter((p) => p.color === rightColor).map((p) => p.id),
  };
}

/**
 * Level → mode mapping:
 *   1 → 1 cor, 2 → 2 cores simultâneas (azul e amarelo),
 *   3 → formas, 4 → forma + tamanho,
 *   5+ → formas avançadas (pentágono, losango, hexágono, trapézio, triângulos)
 */
export function generateQuestion(level: number, qInLevel: number, prevMode?: 1 | 2 | 3 | 4): Question {
  if (level >= 5) {
    const pool = ADVANCED_SHAPES;
    const mode: 2 | 3 = prevMode === 2 ? 3 : prevMode === 3 ? 2 : (ri(2) + 2) as 2 | 3;
    return mode === 2 ? genMode2(qInLevel, pool) : genMode3(qInLevel, pool);
  }
  if (level === 1) return genMode1(qInLevel);
  if (level === 2) return genMode4(qInLevel);
  if (level === 3) return genMode2(qInLevel);
  return genMode3(qInLevel);
}
