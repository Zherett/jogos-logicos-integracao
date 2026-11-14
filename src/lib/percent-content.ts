// Dynamic question generator for "Desafio das Porcentagens" (5th grade)

export type PercentLevel = 1 | 2 | 3 | 4 | 5; // 5 = modo desafio

export type BarVariant = "bateria" | "carregamento" | "tanque" | "medidor" | "barra";

export interface BaseQuestion {
  id: number;
  prompt: string;
  /** Small highlighted line under the prompt (expression / context). */
  highlight?: string;
  options: string[];
  answer: string;
  tip: string;
}

export interface BarQuestion extends BaseQuestion {
  kind: "bar";
  variant: BarVariant;
  parts: number;
  filled: number;
}

export interface PieQuestion extends BaseQuestion {
  kind: "pie";
  parts: number;
  filled: number;
}

export interface PieBuildQuestion {
  kind: "pie-build";
  id: number;
  prompt: string;
  highlight?: string;
  parts: number;
  /** Number of slices the player must paint. */
  target: number;
  tip: string;
}

export interface SliderQuestion {
  kind: "slider";
  id: number;
  prompt: string;
  highlight?: string;
  /** Percentages the player must set on each bar. */
  targets: number[];
  tip: string;
}

export interface WordQuestion extends BaseQuestion {
  kind: "word";
  emoji: string;
}

export interface MixedBuildPizza {
  parts: 4 | 5 | 10;
  target: number;
  pct: number;
}

export interface MixedBuildQuestion {
  kind: "mixed-build";
  id: number;
  prompt: string;
  highlight?: string;
  /** Percentages the player must set on each bar. */
  bars: number[];
  /** Pizzas the player must mark to match each percentage. */
  pizzas: MixedBuildPizza[];
  tip: string;
}

export type PercentQuestion =
  | BarQuestion
  | PieQuestion
  | PieBuildQuestion
  | SliderQuestion
  | MixedBuildQuestion
  | WordQuestion;

export const PERCENTS = [10, 25, 50, 75, 100] as const;

export const TIPS: Record<number, string> = {
  10: "10% é uma décima parte (1 de 10 partes).",
  20: "20% é o dobro de 10%.",
  25: "25% significa 1 de 4 partes.",
  30: "30% são 3 décimos do total.",
  40: "40% são 4 décimos do total.",
  50: "50% significa metade.",
  60: "60% são 6 décimos do total.",
  70: "70% são 7 décimos do total.",
  75: "75% significa 3 de 4 partes.",
  80: "80% são 8 décimos do total.",
  90: "90% são 9 décimos do total.",
  100: "100% significa o todo.",
};

let uid = 1;
const nextId = () => uid++;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function pickAvoid<T>(list: readonly T[], avoid: T | undefined): T {
  if (list.length < 2) return list[0];
  for (let i = 0; i < 12; i++) {
    const v = pick(list);
    if (v !== avoid) return v;
  }
  return pick(list);
}

function shuffle<T>(list: T[]): T[] {
  const r = [...list];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Builds 4 unique options containing the answer. */
function optionsFrom(answer: string, pool: string[]): string[] {
  const set: string[] = [answer];
  for (const p of shuffle(pool)) {
    if (set.length >= 4) break;
    if (!set.includes(p)) set.push(p);
  }
  return shuffle(set);
}

const PCT_POOL = ["10%", "25%", "50%", "75%", "100%"];

function pctOptions(answer: number) {
  return optionsFrom(`${answer}%`, PCT_POOL.concat(["20%", "40%", "60%", "90%"]));
}

function numberOptions(answer: number, total: number) {
  const pool = [
    total / 10, total / 4, total / 2, (total * 3) / 4, total,
    answer + 1, Math.max(1, answer - 1), answer * 2,
  ]
    .filter((n) => Number.isInteger(n) && n > 0 && n !== answer)
    .map(String);
  return optionsFrom(String(answer), pool);
}

/* ------------------------- Level 1: bars & battery ------------------------- */

const BAR_VARIANTS: BarVariant[] = ["bateria", "carregamento", "tanque", "medidor", "barra"];

const BAR_PROMPTS: Record<BarVariant, string> = {
  bateria: "Qual é a porcentagem aproximada da bateria?",
  carregamento: "Quanto já foi carregado?",
  tanque: "Qual porcentagem do tanque está cheia?",
  medidor: "Qual porcentagem o medidor está marcando?",
  barra: "Qual porcentagem está pintada na barra?",
};

function makeBar(avoid?: number): BarQuestion {
  const useTenths = Math.random() < 0.4;
  const parts = useTenths ? 10 : 4;
  const value = useTenths
    ? pickAvoid([10, 20, 30, 50, 70, 90, 100] as const, avoid)
    : pickAvoid([25, 50, 75, 100] as const, avoid);
  const filled = Math.round((value / 100) * parts);
  const variant = pick(BAR_VARIANTS);
  return {
    kind: "bar",
    id: nextId(),
    variant,
    parts,
    filled,
    prompt: BAR_PROMPTS[variant],
    options: pctOptions(value),
    answer: `${value}%`,
    tip: TIPS[value] ?? `${value}% de ${parts} partes = ${filled} partes.`,
  };
}

/* ---------------------------- Level 2: diagrams ---------------------------- */

function makePie(avoid?: number): PieQuestion | PieBuildQuestion {
  const useTenths = Math.random() < 0.35;
  const parts = useTenths ? 10 : 4;
  const value = useTenths
    ? pickAvoid([10, 20, 30, 50, 60, 80, 90] as const, avoid)
    : pickAvoid([25, 50, 75, 100] as const, avoid);
  const filled = Math.round((value / 100) * parts);

  if (Math.random() < 0.4) {
    return {
      kind: "pie-build",
      id: nextId(),
      prompt: "Represente a porcentagem no diagrama",
      highlight: `${value}%`,
      parts,
      target: filled,
      tip: TIPS[value] ?? `${value}% = ${filled} de ${parts} partes.`,
    };
  }

  return {
    kind: "pie",
    id: nextId(),
    parts,
    filled,
    prompt: "Qual porcentagem está representada?",
    options: pctOptions(value),
    answer: `${value}%`,
    tip: TIPS[value] ?? `${filled} de ${parts} partes = ${value}%.`,
  };
}

/* --------------------------- Level 3: sliders ------------------------------ */

const SLIDER_VALUES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

function makeSliders(): SliderQuestion {
  const targets: number[] = [];
  while (targets.length < 3) {
    const v = pick(SLIDER_VALUES);
    if (!targets.includes(v)) targets.push(v);
  }
  return {
    kind: "slider",
    id: nextId(),
    prompt: "Arraste cada barra até a porcentagem indicada",
    highlight: targets.map((t) => `${t}%`).join(" • "),
    targets,
    tip: "Cada marca da régua vale 10%. Metade da barra é 50%.",
  };
}

/* ----------------------- Level 4: mixed + everyday ------------------------- */

const MIXED_LAYOUTS: ReadonlyArray<{ bars: number; pizzas: number }> = [
  { bars: 1, pizzas: 1 },
  { bars: 2, pizzas: 1 },
  { bars: 1, pizzas: 2 },
];
const MIXED_PARTS = [4, 5, 10] as const;
let mixedLayoutIdx = 0;
let mixedPartIdx = 0;

function makeMixedBuild(): MixedBuildQuestion {
  const layout = MIXED_LAYOUTS[mixedLayoutIdx % MIXED_LAYOUTS.length];
  mixedLayoutIdx++;

  const bars: number[] = [];
  while (bars.length < layout.bars) {
    const v = pick(SLIDER_VALUES);
    if (!bars.includes(v)) bars.push(v);
  }

  const pizzas: MixedBuildPizza[] = [];
  for (let i = 0; i < layout.pizzas; i++) {
    const parts = MIXED_PARTS[(mixedPartIdx + i) % MIXED_PARTS.length];
    const target = 1 + Math.floor(Math.random() * (parts - 1));
    const pct = Math.round((target / parts) * 100);
    pizzas.push({ parts, target, pct });
  }
  mixedPartIdx++;

  const barDesc = bars.map((b) => `Barra ${b}%`).join(" • ");
  const pizzaDesc = pizzas.map((p) => `Pizza ${p.pct}%`).join(" • ");
  return {
    kind: "mixed-build",
    id: nextId(),
    prompt: "Ajuste as barras e marque as pizzas conforme a porcentagem",
    highlight: `${barDesc} | ${pizzaDesc}`,
    bars,
    pizzas,
    tip: `Na pizza de ${pizzas[0].parts} partes, cada fatia vale ${Math.round(100 / pizzas[0].parts)}%.`,
  };
}

function makeWord(avoid?: number): WordQuestion {
  const pct = pickAvoid([10, 25, 50, 75] as const, avoid);
  const type = Math.floor(Math.random() * 5);

  if (type === 0) {
    const price = pick([40, 60, 80, 100, 200]);
    const answer = Math.round((pct / 100) * price);
    return {
      kind: "word", id: nextId(), emoji: "🎒",
      prompt: `Uma mochila custa R$ ${price} e está com ${pct}% de desconto. Qual é o valor do desconto?`,
      highlight: `${pct}% de R$ ${price}`,
      options: numberOptions(answer, price),
      answer: String(answer),
      tip: `${TIPS[pct]} O desconto é R$ ${answer}.`,
    };
  }

  if (type === 1) {
    const level = pick([10, 25, 50, 75]);
    const answer = 100 - level;
    return {
      kind: "word", id: nextId(), emoji: "🔋",
      prompt: `A bateria do celular está com ${level}%. Quanto falta para chegar a 100%?`,
      highlight: `100% − ${level}%`,
      options: pctOptions(answer),
      answer: `${answer}%`,
      tip: `100% − ${level}% = ${answer}%.`,
    };
  }

  if (type === 2) {
    const total = pick([20, 40, 60, 80]);
    const answer = Math.round((pct / 100) * total);
    return {
      kind: "word", id: nextId(), emoji: "✏️",
      prompt: `Uma caixa possui ${total} lápis. ${pct}% são azuis. Quantos lápis azuis existem?`,
      highlight: `${pct}% de ${total}`,
      options: numberOptions(answer, total),
      answer: String(answer),
      tip: `${TIPS[pct]} São ${answer} lápis azuis.`,
    };
  }

  if (type === 3) {
    const total = pick([20, 24, 28, 32]);
    const answer = Math.round((pct / 100) * total);
    return {
      kind: "word", id: nextId(), emoji: "🧒",
      prompt: `Uma turma possui ${total} alunos e ${pct}% faltaram. Quantos alunos faltaram?`,
      highlight: `${pct}% de ${total} alunos`,
      options: numberOptions(answer, total),
      answer: String(answer),
      tip: `${TIPS[pct]} Faltaram ${answer} alunos.`,
    };
  }

  const total = pick([20, 40, 50, 100]);
  const answer = Math.round((pct / 100) * total);
  return {
    kind: "word", id: nextId(), emoji: "🛒",
    prompt: `A loja tinha ${total} brinquedos e vendeu ${pct}%. Quantos brinquedos foram vendidos?`,
    highlight: `${pct}% de ${total}`,
    options: numberOptions(answer, total),
    answer: String(answer),
    tip: `${TIPS[pct]} Foram ${answer} brinquedos.`,
  };
}

/* --------------------------------- Public --------------------------------- */

function valueOf(q: PercentQuestion): number | undefined {
  if (q.kind === "pie-build") return (q.target / q.parts) * 100;
  if (q.kind === "bar" || q.kind === "pie") return parseInt(q.answer, 10);
  if (q.kind === "slider") return q.targets[0];
  if (q.kind === "mixed-build") return q.bars[0];
  const m = q.highlight?.match(/(\d+)%/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Generates the next question, avoiding repeating the previous one. */
export function makeQuestion(level: PercentLevel, previous?: PercentQuestion): PercentQuestion {
  const avoid = previous ? valueOf(previous) : undefined;
  const kinds: PercentLevel[] = [1, 2, 3, 4];
  const target: PercentLevel =
    level === 5
      ? (pickAvoid(kinds, previous ? kindToLevel(previous) : undefined) as PercentLevel)
      : level;

  switch (target) {
    case 1: return makeBar(avoid);
    case 2: return makePie(avoid);
    case 3: return makeSliders();
    default:
      if (previous?.kind === "word" || Math.random() < 0.7) {
        return makeMixedBuild();
      }
      return makeWord(avoid);
  }
}

function kindToLevel(q: PercentQuestion): PercentLevel {
  if (q.kind === "bar") return 1;
  if (q.kind === "pie" || q.kind === "pie-build") return 2;
  if (q.kind === "slider") return 3;
  return 4;
}

export const LEVEL_LABELS: Record<PercentLevel, string> = {
  1: "Barras e Bateria",
  2: "Diagramas de Pizza",
  3: "Ajuste as Barras",
  4: "Situações do Cotidiano",
  5: "Modo Desafio",
};

export const QUESTIONS_PER_LEVEL = 5;
