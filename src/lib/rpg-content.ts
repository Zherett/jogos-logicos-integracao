// Batalha de Robôs (RPG da Lógica) — Browser-safe game logic module
// Handles the 5 geometric enemy robot bosses, the Blue-vs-Red Power-Clash bar physics,
// Normal Hit (-1 HP) vs Full-Bar Super Hit (-3 HP), and the mixed True/False question generator.

import { ALL_OPS, generateQuestion, type Question } from "./logic-questions.ts";

export type ClashCategory = "logica" | "matematica" | "porcentagem" | "geometria";

export interface ClashQuestion extends Question {
  category: ClashCategory;
  categoryLabel: string;
}

export type RobotShapeTheme = "triangle" | "hexagon" | "diamond" | "octagon" | "star";

export interface RobotBossDef {
  stage: number;
  name: string;
  title: string;
  maxHp: number; // Quantidade de golpes necessários para derrotar
  /** Velocidade com que o lado vermelho avança para a esquerda (% por segundo) */
  redPushPerSec: number;
  /** Quanto a barra azul avança para a direita a cada resposta correta (%) */
  blueGainOnCorrect: number;
  /** Quanto a barra vermelha empurra para a esquerda quando o jogador erra (%) */
  redPenaltyOnWrong: number;
  rewardPoints: number;
  shapeTheme: RobotShapeTheme;
  accentColor: string;
  isSpecial?: boolean;
  specialType?: "ametista" | "carmesim";
  scoreMultiplier?: number;
}

export const NORMAL_HIT_DAMAGE = 1;
export const SUPER_HIT_DAMAGE = 3;
export const INITIAL_BLUE_SHARE = 50;
export const SUPER_RESET_BLUE_SHARE = 55;

export const ROBOT_BOSSES: RobotBossDef[] = [
  {
    stage: 1,
    name: "Sentinela Tri-Cinza",
    title: "Fase 1 • Robô de Triângulos",
    maxHp: 5,
    redPushPerSec: 1.8,
    blueGainOnCorrect: 24,
    redPenaltyOnWrong: 14,
    rewardPoints: 40,
    shapeTheme: "triangle",
    accentColor: "#64748b",
  },
  {
    stage: 2,
    name: "Destruidor Losango-Cinza",
    title: "Fase 2 • Robô de Losangos",
    maxHp: 7,
    redPushPerSec: 2.5,
    blueGainOnCorrect: 22,
    redPenaltyOnWrong: 15,
    rewardPoints: 60,
    shapeTheme: "diamond",
    accentColor: "#64748b",
  },
  {
    stage: 3,
    name: "Colosso Hexa-Cinza",
    title: "Fase 3 • Robô de Hexágonos",
    maxHp: 9,
    redPushPerSec: 3.4,
    blueGainOnCorrect: 20,
    redPenaltyOnWrong: 16,
    rewardPoints: 80,
    shapeTheme: "hexagon",
    accentColor: "#64748b",
  },
  {
    stage: 4,
    name: "Titã Octa-Cinza",
    title: "Fase 4 • Robô de Octógonos",
    maxHp: 11,
    redPushPerSec: 4.5,
    blueGainOnCorrect: 19,
    redPenaltyOnWrong: 17,
    rewardPoints: 110,
    shapeTheme: "octagon",
    accentColor: "#64748b",
  },
  {
    stage: 5,
    name: "Overlord Estrela-Cinza",
    title: "Chefe Final • Rei das Formas",
    maxHp: 14,
    redPushPerSec: 5.8,
    blueGainOnCorrect: 18,
    redPenaltyOnWrong: 18,
    rewardPoints: 160,
    shapeTheme: "star",
    accentColor: "#64748b",
  },
];

export function getRobotBoss(stage: number, isSpecial = false): RobotBossDef {
  const idx = Math.max(0, Math.min(ROBOT_BOSSES.length - 1, Math.floor(stage) - 1));
  const base = ROBOT_BOSSES[idx];

  if (!isSpecial || stage < 2) {
    return { ...base };
  }

  if (stage === 5) {
    return {
      ...base,
      name: "Robô Carmesim Especial",
      title: "Chefe Final • Robô Carmesim Lendário",
      isSpecial: true,
      specialType: "carmesim",
      scoreMultiplier: 3,
      rewardPoints: base.rewardPoints + 100, // +100 pontos de bônus por derrotá-lo
      accentColor: "#dc2626",
    };
  }

  return {
    ...base,
    name: "Robô Ametista Especial",
    title: `Fase ${stage} • Robô Especial Ametista`,
    isSpecial: true,
    specialType: "ametista",
    scoreMultiplier: 2,
    rewardPoints: base.rewardPoints * 2,
    accentColor: "#a855f7",
  };
}

/* ---------------- Power-Clash Energy Bar Physics & Evaluation ---------------- */

export interface ClashTickResult {
  /** New blue share (0..100). Red share is `100 - blueShare`. */
  blueShare: number;
  /** True when the red side has pushed all the way to the left (`blueShare <= 0`). */
  redOvertookAll: boolean;
}

/**
 * Advances the red side of the bar toward the left according to elapsed time (`dtSeconds`).
 */
export function applyClashTick(
  currentBlueShare: number,
  dtSeconds: number,
  boss: RobotBossDef,
): ClashTickResult {
  const safeDt = Math.max(0, dtSeconds);
  const nextBlue = Math.max(0, Math.min(100, currentBlueShare - boss.redPushPerSec * safeDt));
  return {
    blueShare: nextBlue,
    redOvertookAll: nextBlue <= 0,
  };
}

export interface ClashAnswerOutcome {
  isCorrect: boolean;
  /** True when the player's answer filled the blue bar to 100%, triggering a Super Hit (-3 HP) */
  isSuperHit: boolean;
  /** Damage dealt to the enemy robot (`0` on wrong, `1` on normal hit, `3` on super hit) */
  damageToEnemy: number;
  /** Updated enemy HP (`0..boss.maxHp`) */
  nextEnemyHp: number;
  /** True if the enemy robot was defeated by this hit */
  enemyDefeated: boolean;
  /** Updated blue share on the clash bar (`0..100`) */
  nextBlueShare: number;
  /** True if the wrong answer caused the red bar to reach 100% on the left */
  redOvertookAll: boolean;
  /** Score delta from this answer */
  scoreDelta: number;
}

/**
 * Evaluates a player's True/False answer in the Power-Clash battle.
 * - Correct answer pushes the blue bar right and deals 1 damage to the enemy.
 * - If the blue bar reaches 100%, triggers a SUPER HIT (3 damage) and resets the bar to 55% so the player can charge again!
 * - Wrong answer pushes the bar toward the red side (`-redPenaltyOnWrong`).
 */
export function evaluateClashAnswer(args: {
  question: ClashQuestion;
  chosenAnswer: boolean;
  currentBlueShare: number;
  currentEnemyHp: number;
  boss: RobotBossDef;
}): ClashAnswerOutcome {
  const isCorrect = args.chosenAnswer === args.question.answer;
  const mult = args.boss.scoreMultiplier ?? 1;

  if (!isCorrect) {
    const nextBlue = Math.max(0, args.currentBlueShare - args.boss.redPenaltyOnWrong);
    return {
      isCorrect: false,
      isSuperHit: false,
      damageToEnemy: 0,
      nextEnemyHp: Math.max(0, args.currentEnemyHp),
      enemyDefeated: false,
      nextBlueShare: nextBlue,
      redOvertookAll: nextBlue <= 0,
      scoreDelta: -5 * mult,
    };
  }

  const rawNextBlue = args.currentBlueShare + args.boss.blueGainOnCorrect;
  const isSuperHit = rawNextBlue >= 100;
  const damageToEnemy = isSuperHit ? SUPER_HIT_DAMAGE : NORMAL_HIT_DAMAGE;
  const nextEnemyHp = Math.max(0, args.currentEnemyHp - damageToEnemy);
  const enemyDefeated = nextEnemyHp <= 0;
  const nextBlueShare = isSuperHit ? SUPER_RESET_BLUE_SHARE : Math.min(99, rawNextBlue);
  const scoreDelta = 10 * mult;

  return {
    isCorrect: true,
    isSuperHit,
    damageToEnemy,
    nextEnemyHp,
    enemyDefeated,
    nextBlueShare,
    redOvertookAll: false,
    scoreDelta,
  };
}

/* ---------------- Mixed True / False Question Generator ---------------- */

const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function generatePercentageQuestion(stage: number): ClashQuestion {
  const templates: { text: string; answer: boolean }[] = [
    { text: "50% de um valor é exatamente a metade dele", answer: true },
    { text: "25% representa um quarto (1/4) do total", answer: true },
    { text: "75% é menor do que a metade (50%)", answer: false },
    { text: "100% representa o todo completo", answer: true },
  ];

  const bases = stage <= 2 ? [20, 40, 60, 80, 100] : [30, 50, 80, 120, 160, 200];
  const pcts = [10, 20, 25, 50, 75] as const;
  const base = pick(bases);
  const pct = pick(pcts);
  const exact = (base * pct) / 100;

  if (Number.isInteger(exact) && Math.random() < 0.75) {
    const truth = Math.random() < 0.5;
    const deltas = [-10, -5, -4, 4, 5, 10].filter((d) => exact + d >= 0 && exact + d !== exact);
    const shown = truth ? exact : exact + pick(deltas.length > 0 ? deltas : [4, 5, 10]);
    return {
      text: `${pct}% de ${base} é igual a ${shown}`,
      answer: shown === exact,
      category: "porcentagem",
      categoryLabel: "Porcentagem",
    };
  }

  const chosen = pick(templates);
  return {
    text: chosen.text,
    answer: chosen.answer,
    category: "porcentagem",
    categoryLabel: "Porcentagem",
  };
}

function generateGeometryQuestion(): ClashQuestion {
  const pool: { text: string; answer: boolean }[] = [
    { text: "Um triângulo possui exatamente 3 lados", answer: true },
    { text: "Um quadrado tem 4 lados de mesmo tamanho", answer: true },
    { text: "Um pentágono é uma forma com 6 lados", answer: false },
    { text: "Um hexágono possui exatamente 6 lados", answer: true },
    { text: "Um octógono possui 8 lados e 8 vértices", answer: true },
    { text: "Um círculo possui 4 cantos retos", answer: false },
    { text: "Um retângulo possui 4 ângulos retos", answer: true },
    { text: "Um triângulo possui 5 vértices", answer: false },
    { text: "No par ordenado (4, 7), o número 4 é a coordenada X", answer: true },
    { text: "No par ordenado (3, 9), o número 3 é a coordenada Y", answer: false },
    { text: "Um losango é um quadrilátero de 4 lados", answer: true },
    { text: "Um hexágono tem mais lados que um octógono", answer: false },
  ];
  const item = pick(pool);
  return {
    text: item.text,
    answer: item.answer,
    category: "geometria",
    categoryLabel: "Formas & Geometria",
  };
}

function generateLogicOrMathQuestion(stage: number, recent: string[]): ClashQuestion {
  const level = Math.min(4, Math.max(1, Math.ceil(stage * 0.8)));
  const q = generateQuestion(level, recent, ALL_OPS);
  const isLogic = q.text.includes(" e ") || q.text.includes(" ou ") || q.text.includes("V") || q.text.includes("F");
  return {
    text: q.text,
    answer: q.answer,
    category: isLogic ? "logica" : "matematica",
    categoryLabel: isLogic ? "Lógica Booleana" : "Cálculo Rápido",
  };
}

/**
 * Generates a balanced True/False question for the Power-Clash battle,
 * mixing Boolean Logic, Fast Math, Percentages, and Geometric Shapes.
 */
export function generateClashQuestion(
  stage: number,
  recent: string[] = [],
  recentAnswers: boolean[] = [],
): ClashQuestion {
  const last = recentAnswers.slice(-6);
  const trues = last.filter(Boolean).length;
  const wantTrue = trues < last.length / 2;

  for (let attempt = 0; attempt < 16; attempt++) {
    const roll = Math.random();
    let candidate: ClashQuestion;
    if (roll < 0.45) {
      candidate = generateLogicOrMathQuestion(stage, recent);
    } else if (roll < 0.75) {
      candidate = generatePercentageQuestion(stage);
    } else {
      candidate = generateGeometryQuestion();
    }

    if (recent.includes(candidate.text)) continue;
    if (last.length >= 3 && candidate.answer !== wantTrue && attempt < 10) continue;
    return candidate;
  }

  return generateLogicOrMathQuestion(stage, recent);
}
