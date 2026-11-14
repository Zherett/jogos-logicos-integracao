// Question generators for Jogo 1 - Lógica Matemática
// Levels 1-4, with support for selecting arithmetic operations.

export interface Question {
  text: string;
  answer: boolean;
}

export type OpKind = "add" | "sub" | "mul" | "div";
export const ALL_OPS: OpKind[] = ["add", "sub", "mul", "div"];

const OP_SYMBOL: Record<OpKind, string> = {
  add: "+",
  sub: "−",
  mul: "×",
  div: "÷",
};

const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function maybeFlip(actual: number): { shown: number; truth: boolean } {
  if (Math.random() < 0.5) return { shown: actual, truth: true };
  const delta = pick([-3, -2, -1, 1, 2, 3]);
  return { shown: actual + delta, truth: false };
}

function boolExpr(): { text: string; value: boolean } {
  const a = Math.random() < 0.5;
  const b = Math.random() < 0.5;
  const op = pick(["e", "ou"] as const);
  const val = op === "e" ? a && b : a || b;
  const s = (x: boolean) => (x ? "V" : "F");
  return { text: `${s(a)} ${op} ${s(b)}`, value: val };
}

// Build one arithmetic operation from allowed ops. Returns text + value.
function arithOp(ops: OpKind[]): { text: string; value: number } {
  const op = pick(ops.length ? ops : (["add"] as OpKind[]));
  let a: number, b: number, value: number;
  switch (op) {
    case "add":
      a = rng(1, 12); b = rng(1, 12); value = a + b; break;
    case "sub":
      a = rng(1, 15); b = rng(1, 15); if (b > a) [a, b] = [b, a]; value = a - b; break;
    case "mul":
      a = rng(1, 10); b = rng(1, 10); value = a * b; break;
    case "div":
      b = rng(1, 10); value = rng(1, 10); a = b * value; break; // a / b = value (inteiro)
  }
  return { text: `${a} ${OP_SYMBOL[op]} ${b}`, value };
}

function simpleArith(ops: OpKind[]): { text: string; value: boolean } {
  const e = arithOp(ops);
  const { shown, truth } = maybeFlip(e.value);
  return { text: `${e.text} = ${shown}`, value: truth };
}

function level1(ops: OpKind[]): Question {
  const kind = pick(["bool", "arith", "arith"]);
  if (kind === "bool") {
    const e = boolExpr();
    return { text: e.text, answer: e.value };
  }
  const a = simpleArith(ops);
  return { text: a.text, answer: a.value };
}

function level2(ops: OpKind[]): Question {
  const left = simpleArith(ops);
  const right = simpleArith(ops);
  const op = pick(["e", "ou"] as const);
  const value = op === "e" ? left.value && right.value : left.value || right.value;
  return { text: `${left.text} ${op} ${right.text}`, answer: value };
}

function comparison(): { text: string; value: boolean } {
  const a = rng(0, 12), b = rng(0, 12);
  const op = pick(["<", ">", "<=", ">=", "="] as const);
  let v = false;
  switch (op) {
    case "<": v = a < b; break;
    case ">": v = a > b; break;
    case "<=": v = a <= b; break;
    case ">=": v = a >= b; break;
    case "=": v = a === b; break;
  }
  return { text: `${a} ${op} ${b}`, value: v };
}

export function getOpsForLevel(level: number): OpKind[] {
  if (level <= 1) return ["add", "sub"];
  if (level === 2) return ["add", "sub", "mul"];
  if (level === 3) return ["add", "sub", "mul", "div"];
  // Level 4+: all operations active with higher frequency of multiplication and division
  return ["mul", "mul", "div", "div", "add", "sub"];
}

function level3(ops: OpKind[]): Question {
  const variant = pick(["arithCompare", "arithAndCmp"]);
  if (variant === "arithCompare") {
    const left = simpleArith(ops);
    const right = comparison();
    const op = pick(["e", "ou"] as const);
    const value = op === "e" ? left.value && right.value : left.value || right.value;
    return { text: `${left.text} ${op} ${right.text}`, answer: value };
  }
  const l = arithOp(ops);
  const target = l.value + pick([-2, -1, 0, 1, 2]);
  const cmp = pick(["<", ">", "<=", ">=", "="] as const);
  let lv = false;
  switch (cmp) {
    case "<": lv = l.value < target; break;
    case ">": lv = l.value > target; break;
    case "<=": lv = l.value <= target; break;
    case ">=": lv = l.value >= target; break;
    case "=": lv = l.value === target; break;
  }
  const right = simpleArith(ops);
  const op = pick(["e", "ou"] as const);
  const value = op === "e" ? lv && right.value : lv || right.value;
  return { text: `${l.text} ${cmp} ${target} ${op} ${right.text}`, answer: value };
}

function level4(ops: OpKind[]): Question {
  const variant = pick(["compare", "combined"]);
  if (variant === "compare") {
    const l = arithOp(ops), r = arithOp(ops);
    const op = pick(["<", ">", "<=", ">=", "="] as const);
    let v = false;
    switch (op) {
      case "<": v = l.value < r.value; break;
      case ">": v = l.value > r.value; break;
      case "<=": v = l.value <= r.value; break;
      case ">=": v = l.value >= r.value; break;
      case "=": v = l.value === r.value; break;
    }
    return { text: `${l.text} ${op} ${r.text}`, answer: v };
  }
  const l = arithOp(ops);
  const target = l.value + pick([-2, -1, 0, 0, 1, 2]);
  const leftCmp = pick(["<", ">", "<=", ">=", "="] as const);
  let lv = false;
  switch (leftCmp) {
    case "<": lv = l.value < target; break;
    case ">": lv = l.value > target; break;
    case "<=": lv = l.value <= target; break;
    case ">=": lv = l.value >= target; break;
    case "=": lv = l.value === target; break;
  }
  const right = comparison();
  const op = pick(["e", "ou"] as const);
  const value = op === "e" ? lv && right.value : lv || right.value;
  return { text: `${l.text} ${leftCmp} ${target} ${op} ${right.text}`, answer: value };
}

const GENERATORS = [level1, level2, level3, level4];

export function generateQuestion(level: number, recent: string[], ops?: OpKind[]): Question {
  const safeOps = ops && ops.length ? ops : getOpsForLevel(level);
  const idx = Math.min(GENERATORS.length, Math.max(1, level)) - 1;
  const gen = GENERATORS[idx];
  for (let i = 0; i < 20; i++) {
    const q = gen(safeOps as OpKind[]);
    if (!recent.includes(q.text)) return q;
  }
  return gen(safeOps as OpKind[]);
}

export function generateBalanced(
  level: number,
  recent: string[],
  recentAnswers: boolean[],
  ops?: OpKind[],
): Question {
  const last = recentAnswers.slice(-6);
  const trues = last.filter(Boolean).length;
  const wantTrue = trues < last.length / 2;
  for (let i = 0; i < 8; i++) {
    const q = generateQuestion(level, recent, ops);
    if (last.length < 3) return q;
    if (q.answer === wantTrue) return q;
  }
  return generateQuestion(level, recent, ops);
}
