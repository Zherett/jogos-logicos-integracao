/**
 * Space Quest - Game Content Engine & Evaluation Logic
 * Browser-safe module for question generation, falling physics rules,
 * aura selection, and score/penalty evaluation.
 */

export type QuestionKind = "logic" | "math";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type AuraType = "normal" | "safira" | "ametista" | "rubi" | "ambar";

export interface SpaceQuestQuestion {
  id: string;
  kind: QuestionKind;
  difficulty: QuestionDifficulty;
  aura: AuraType;
  prompt: string;
  /** Correct answer formatted as string ("V", "F", or numeric string like "7", "24") */
  correctAnswer: string;
  /** Available choices for the player to select from (2 for boolean V/F, 4 for math) */
  options: string[];
  /** Relative speed multiplier: easy is faster (~1.3x), medium is standard (1.0x), hard is slower (~0.75x) */
  speedMultiplier: number;
  /** Points awarded on correct answer */
  pointsOnCorrect: number;
  /** Points deducted on wrong answer */
  penaltyOnWrong: number;
  /** Associated special medal ID if awarded upon correct answer */
  auraMedalId?: string;
}

export interface AuraDefinition {
  type: AuraType;
  name: string;
  badgeLabel: string;
  glowColor: string;
  borderClass: string;
  bgGlowClass: string;
  textColor: string;
  chance: number; // e.g. 0.20 = 20%
  fixedDifficulty?: QuestionDifficulty;
  scoreMultiplier: number;
  wrongPenalty: number;
  medalId?: string;
  medalTitle?: string;
}

export const AURA_CONFIGS: Record<AuraType, AuraDefinition> = {
  normal: {
    type: "normal",
    name: "Comum",
    badgeLabel: "Normal",
    glowColor: "#38bdf8",
    borderClass: "border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.25)]",
    bgGlowClass: "from-sky-950/40 to-slate-900/90",
    textColor: "text-sky-300",
    chance: 0.924, // 92.4%
    scoreMultiplier: 1,
    wrongPenalty: 0,
  },
  safira: {
    type: "safira",
    name: "Safira",
    badgeLabel: "2x Pontos • Safira",
    glowColor: "#2563eb",
    borderClass: "border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.7)] animate-pulse",
    bgGlowClass: "from-blue-950/70 via-indigo-950/50 to-slate-900/90",
    textColor: "text-blue-300 font-extrabold",
    chance: 0.05, // 5%
    fixedDifficulty: "medium",
    scoreMultiplier: 2, // 2x = 20 pts
    wrongPenalty: 20, // -20 pts
    medalId: "sq_safira",
    medalTitle: "Questão Safira",
  },
  ametista: {
    type: "ametista",
    name: "Ametista",
    badgeLabel: "3x Pontos • Ametista",
    glowColor: "#9333ea",
    borderClass: "border-purple-500 shadow-[0_0_22px_rgba(147,51,234,0.75)] animate-pulse",
    bgGlowClass: "from-purple-950/70 via-fuchsia-950/50 to-slate-900/90",
    textColor: "text-purple-300 font-extrabold",
    chance: 0.02, // 2%
    fixedDifficulty: "hard",
    scoreMultiplier: 3, // 3x = 30 pts
    wrongPenalty: 30, // -30 pts
    medalId: "sq_ametista",
    medalTitle: "Questão Ametista",
  },
  rubi: {
    type: "rubi",
    name: "Rubi",
    badgeLabel: "4x Pontos • Rubi",
    glowColor: "#ef4444",
    borderClass: "border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.85)] animate-pulse",
    bgGlowClass: "from-red-950/70 via-rose-950/50 to-slate-900/90",
    textColor: "text-red-300 font-black",
    chance: 0.005, // 0.5%
    fixedDifficulty: "hard",
    scoreMultiplier: 4, // 4x = 40 pts
    wrongPenalty: 30, // 3x = -30 pts
    medalId: "sq_rubi",
    medalTitle: "Questão Rubi",
  },
  ambar: {
    type: "ambar",
    name: "Âmbar",
    badgeLabel: "★ 4x Pontos • Sem Penalidade",
    glowColor: "#f59e0b",
    borderClass: "border-amber-400 shadow-[0_0_28px_rgba(245,158,11,0.9)] animate-pulse",
    bgGlowClass: "from-amber-950/70 via-yellow-950/50 to-slate-900/90",
    textColor: "text-amber-300 font-black",
    chance: 0.001, // 0.1%
    fixedDifficulty: "hard",
    scoreMultiplier: 4, // 4x = 40 pts
    wrongPenalty: 0, // sem penalidade de pontos negativos
    medalId: "sq_ambar",
    medalTitle: "Questão Âmbar",
  },
};

export const FLOOR_COLLISION_PENALTY = 5; // -5 pontos se a questão bater no fundo da tela
export const BASE_CORRECT_POINTS = 10;
export const COMBO_BONUS_POINTS = 10;
export const COMBO_THRESHOLD = 5; // a cada 5 acertos consecutivos

// Novas constantes de jogabilidade do Space Quest
export const STARTING_LIVES = 5;
export const RECOVER_LIFE_CHANCE = 0.10; // 10% de chance de restaurar 1 vida com 1 coração
export const DOUBLE_WAVE_CHANCE = 0.05; // 5% de chance de vir 2 questões juntas
export const SLOW_MOTION_DURATION_MS = 10000; // 10s de lentidão
export const SLOW_MOTION_COOLDOWN_MS = 5000; // 5s de cooldown em vermelho
export const SLOW_MOTION_SPEED_MULT = 0.5; // -50% velocidade
export const AMPULHETA_COMBO_REQ = 5; // 5 acertos seguidos
export const SHIELD_COMBO_REQ = 10; // 10 acertos seguidos
export const SHIELD_COOLDOWN_MS = 10000; // 10s de cooldown após ativação do escudo
export const SPECIAL_AURA_COOLDOWN_QUESTIONS = 5; // Mínimo de 5 questões normais entre especiais

/**
 * Randomly rolls an aura based on the exact probabilities:
 * 0.1% ambar (dourada), 0.5% rubi (vermelha), 2% ametista (roxa), 5% safira (azul), 92.4% normal.
 * Suporta restrições anti-consecutivas e caps de partida.
 */
export function rollAura(
  forcedRandom?: number,
  options?: {
    allowSpecial?: boolean;
    excludedAuras?: Set<AuraType>;
  },
): AuraType {
  if (options?.allowSpecial === false) {
    return "normal";
  }

  const roll = typeof forcedRandom === "number" ? forcedRandom : Math.random();
  let candidate: AuraType = "normal";

  if (roll < 0.001) candidate = "ambar"; // 0.1%
  else if (roll < 0.006) candidate = "rubi"; // 0.5%
  else if (roll < 0.026) candidate = "ametista"; // 2.0%
  else if (roll < 0.076) candidate = "safira"; // 5.0%

  if (options?.excludedAuras && options.excludedAuras.has(candidate)) {
    return "normal";
  }

  return candidate;
}

/**
 * Speed multiplier inversely proportional to difficulty:
 * - easy: falls faster (1.25x)
 * - medium: normal pace (1.00x)
 * - hard: falls slower (0.75x) to give more time for complex logic
 */
export function getDifficultySpeedMultiplier(diff: QuestionDifficulty): number {
  switch (diff) {
    case "easy":
      return 1.25;
    case "medium":
      return 1.0;
    case "hard":
      return 0.75;
  }
}

/**
 * Base falling duration (seconds from top to bottom) depending on stage/level
 * As level increases, operations fall faster globally.
 */
export function getStageFallDurationSeconds(level: number, diff: QuestionDifficulty): number {
  // Level 1: 15s base, Level 5: 11s base, Level 10: 7s base
  const baseSeconds = Math.max(7, 15 - (level - 1) * 0.85);
  const speedMult = getDifficultySpeedMultiplier(diff);
  return baseSeconds / speedMult;
}

/** Helper random integer inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generates boolean logic question */
export function generateLogicQuestion(
  diff: QuestionDifficulty,
  aura: AuraType,
): SpaceQuestQuestion {
  let prompt = "";
  let answerBool = false;

  if (diff === "easy") {
    // Ex: V OU F, V E V, F E F
    const p1 = Math.random() < 0.5;
    const p2 = Math.random() < 0.5;
    const op = Math.random() < 0.5 ? "OU" : "E";
    prompt = `${p1 ? "V" : "F"} ${op} ${p2 ? "V" : "F"}`;
    answerBool = op === "OU" ? p1 || p2 : p1 && p2;
  } else if (diff === "medium") {
    // Ex: 5 > 3 OU 3 < 3, 7 = 7 E 4 > 2
    const op = Math.random() < 0.5 ? "OU" : "E";
    const comp1 = generateSimpleComparison();
    const comp2 = generateSimpleComparison();
    prompt = `${comp1.text} ${op} ${comp2.text}`;
    answerBool = op === "OU" ? comp1.val || comp2.val : comp1.val && comp2.val;
  } else {
    // Hard: 4+1 < 7 OU 3+1 = 4, (6 - 2 = 4) E (5 * 2 > 8)
    const op = Math.random() < 0.5 ? "OU" : "E";
    const comp1 = generateArithmeticComparison();
    const comp2 = generateArithmeticComparison();
    prompt = `${comp1.text} ${op} ${comp2.text}`;
    answerBool = op === "OU" ? comp1.val || comp2.val : comp1.val && comp2.val;
  }

  const correctAnswer = answerBool ? "V" : "F";
  const auraCfg = AURA_CONFIGS[aura];
  const pointsOnCorrect = BASE_CORRECT_POINTS * auraCfg.scoreMultiplier;
  const penaltyOnWrong = auraCfg.wrongPenalty;

  return {
    id: `sq_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: "logic",
    difficulty: diff,
    aura,
    prompt,
    correctAnswer,
    options: ["V", "F"],
    speedMultiplier: getDifficultySpeedMultiplier(diff),
    pointsOnCorrect,
    penaltyOnWrong,
    auraMedalId: auraCfg.medalId,
  };
}

function generateSimpleComparison(): { text: string; val: boolean } {
  const ops = [">", "<", "="];
  const op = ops[randInt(0, 2)];
  const a = randInt(1, 9);
  let b = randInt(1, 9);
  if (op === "=" && Math.random() < 0.5) {
    b = a;
  }
  let val = false;
  if (op === ">") val = a > b;
  else if (op === "<") val = a < b;
  else val = a === b;

  return { text: `${a} ${op} ${b}`, val };
}

function generateArithmeticComparison(): { text: string; val: boolean } {
  const arithOps = ["+", "-", "x"];
  const arithOp = arithOps[randInt(0, 2)];
  let leftRes = 0;
  let leftText = "";

  if (arithOp === "+") {
    const a = randInt(1, 6);
    const b = randInt(1, 6);
    leftRes = a + b;
    leftText = `${a} + ${b}`;
  } else if (arithOp === "-") {
    const a = randInt(5, 12);
    const b = randInt(1, a - 1);
    leftRes = a - b;
    leftText = `${a} - ${b}`;
  } else {
    const a = randInt(2, 4);
    const b = randInt(2, 4);
    leftRes = a * b;
    leftText = `${a} × ${b}`;
  }

  const compOps = ["<", ">", "="];
  const compOp = compOps[randInt(0, 2)];
  let rightVal = leftRes + randInt(-2, 2);
  if (compOp === "=" && Math.random() < 0.5) {
    rightVal = leftRes;
  }

  let val = false;
  if (compOp === ">") val = leftRes > rightVal;
  else if (compOp === "<") val = leftRes < rightVal;
  else val = leftRes === rightVal;

  return { text: `${leftText} ${compOp} ${rightVal}`, val };
}

/** Generates simple math question with 4 multiple-choice alternatives */
export function generateMathQuestion(
  diff: QuestionDifficulty,
  aura: AuraType,
): SpaceQuestQuestion {
  let prompt = "";
  let answerNum = 0;

  if (diff === "easy") {
    // 3 + 4 = ?, 9 - 5 = ?
    const isAdd = Math.random() < 0.6;
    if (isAdd) {
      const a = randInt(1, 15);
      const b = randInt(1, 15);
      prompt = `${a} + ${b} = ?`;
      answerNum = a + b;
    } else {
      const a = randInt(5, 20);
      const b = randInt(1, a - 1);
      prompt = `${a} - ${b} = ?`;
      answerNum = a - b;
    }
  } else if (diff === "medium") {
    // 4 x 5 = ?, 14 ÷ 2 = ?
    const isMult = Math.random() < 0.5;
    if (isMult) {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      prompt = `${a} × ${b} = ?`;
      answerNum = a * b;
    } else {
      const b = randInt(2, 8);
      const ans = randInt(2, 9);
      const a = b * ans;
      prompt = `${a} ÷ ${b} = ?`;
      answerNum = ans;
    }
  } else {
    // Hard: ((4 x 5) + 4 = ?), ((18 ÷ 2) - 3 = ?)
    const isMultAdd = Math.random() < 0.5;
    if (isMultAdd) {
      const a = randInt(2, 6);
      const b = randInt(2, 6);
      const c = randInt(1, 10);
      prompt = `(${a} × ${b}) + ${c} = ?`;
      answerNum = a * b + c;
    } else {
      const b = randInt(2, 6);
      const ansDiv = randInt(4, 9);
      const a = b * ansDiv;
      const c = randInt(1, ansDiv - 1);
      prompt = `(${a} ÷ ${b}) - ${c} = ?`;
      answerNum = ansDiv - c;
    }
  }

  // Generate 4 distinct options with plausible distractors
  const optionsSet = new Set<number>();
  optionsSet.add(answerNum);
  const deltas = [-3, -2, -1, 1, 2, 3, 4, -4, 5, -5];
  // Shuffle deltas
  deltas.sort(() => Math.random() - 0.5);

  for (const d of deltas) {
    if (optionsSet.size >= 4) break;
    const candidate = answerNum + d;
    if (candidate >= 0 && candidate !== answerNum) {
      optionsSet.add(candidate);
    }
  }

  while (optionsSet.size < 4) {
    optionsSet.add(answerNum + optionsSet.size);
  }

  const options = Array.from(optionsSet)
    .sort(() => Math.random() - 0.5)
    .map(String);

  const auraCfg = AURA_CONFIGS[aura];
  const pointsOnCorrect = BASE_CORRECT_POINTS * auraCfg.scoreMultiplier;
  const penaltyOnWrong = auraCfg.wrongPenalty;

  return {
    id: `sq_math_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: "math",
    difficulty: diff,
    aura,
    prompt,
    correctAnswer: String(answerNum),
    options,
    speedMultiplier: getDifficultySpeedMultiplier(diff),
    pointsOnCorrect,
    penaltyOnWrong,
    auraMedalId: auraCfg.medalId,
  };
}

/**
 * Creates a next question for the player taking into account current stage and aura roll.
 */
export function generateSpaceQuestQuestion(
  level: number,
  forcedAura?: AuraType,
  options?: {
    allowSpecial?: boolean;
    excludedAuras?: Set<AuraType>;
  },
): SpaceQuestQuestion {
  const aura = forcedAura ?? rollAura(undefined, options);
  const auraCfg = AURA_CONFIGS[aura];

  let diff: QuestionDifficulty = "easy";
  if (auraCfg.fixedDifficulty) {
    diff = auraCfg.fixedDifficulty;
  } else {
    // Normal aura difficulty scales with level
    if (level === 1) {
      diff = Math.random() < 0.7 ? "easy" : "medium";
    } else if (level === 2) {
      const r = Math.random();
      diff = r < 0.35 ? "easy" : r < 0.75 ? "medium" : "hard";
    } else {
      const r = Math.random();
      diff = r < 0.2 ? "easy" : r < 0.5 ? "medium" : "hard";
    }
  }

  const kind: QuestionKind = Math.random() < 0.5 ? "logic" : "math";
  return kind === "logic"
    ? generateLogicQuestion(diff, aura)
    : generateMathQuestion(diff, aura);
}

/**
 * Generates two questions guaranteed to have DIFFERENT difficulties for the double wave (5% chance).
 * e.g., one easy and one medium or hard.
 * Regra Anti-Consecutiva: Se a questão 1 vier com aura especial, a questão 2 é OBRIGATORIAMENTE normal!
 */
export function generateDoubleWaveQuestions(
  level: number,
  options?: {
    allowSpecial?: boolean;
    excludedAuras?: Set<AuraType>;
  },
): [SpaceQuestQuestion, SpaceQuestQuestion] {
  const q1 = generateSpaceQuestQuestion(level, undefined, options);
  const allDiffs: QuestionDifficulty[] = ["easy", "medium", "hard"];
  const otherDiffs = allDiffs.filter((d) => d !== q1.difficulty);
  const diff2 = otherDiffs[Math.floor(Math.random() * otherDiffs.length)];

  // Se q1 foi especial, q2 é obrigatoriamente normal!
  const allowSpecialForQ2 = q1.aura === "normal" && options?.allowSpecial !== false;
  const aura2 = allowSpecialForQ2 ? rollAura(undefined, options) : "normal";

  const kind2: QuestionKind = Math.random() < 0.5 ? "logic" : "math";
  const q2 =
    kind2 === "logic"
      ? generateLogicQuestion(diff2, aura2)
      : generateMathQuestion(diff2, aura2);

  return [q1, q2];
}

export interface AnswerResolutionResult {
  isCorrect: boolean;
  scoreDelta: number;
  comboIncreased: boolean;
  newCombo: number;
  comboBonusEarned: boolean;
  unlockedMedalId?: string;
}

/**
 * Pure evaluator for a submitted answer.
 */
export function resolveAnswer(
  question: SpaceQuestQuestion,
  selectedAnswer: string,
  currentCombo: number,
): AnswerResolutionResult {
  const isCorrect = question.correctAnswer.trim().toUpperCase() === selectedAnswer.trim().toUpperCase();

  if (isCorrect) {
    const nextCombo = currentCombo + 1;
    const comboBonusEarned = nextCombo > 0 && nextCombo % COMBO_THRESHOLD === 0;
    const scoreDelta = question.pointsOnCorrect + (comboBonusEarned ? COMBO_BONUS_POINTS : 0);

    return {
      isCorrect: true,
      scoreDelta,
      comboIncreased: true,
      newCombo: nextCombo,
      comboBonusEarned,
      unlockedMedalId: question.auraMedalId,
    };
  } else {
    // Wrong answer
    return {
      isCorrect: false,
      scoreDelta: question.penaltyOnWrong === 0 ? 0 : -question.penaltyOnWrong,
      comboIncreased: false,
      newCombo: 0,
      comboBonusEarned: false,
      // Âmbar: se errar não ganha medalha
      unlockedMedalId: undefined,
    };
  }
}
