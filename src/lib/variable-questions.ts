// Question generator for "Caça às Variáveis" — drag & drop mode
// Each question: an expression with ONE unknown box. Player must find the
// number that satisfies it. We generate 4-8 numeric options including the
// correct answer, unique, positive integers, in shuffled positions.

export type VarOp = "add" | "sub" | "mul" | "div";
export type VarOpSymbol = "+" | "−" | "×" | "÷";
export type VarSlotRole = "left" | "op" | "right" | "result";

export interface VarQuestion {
  left: string;   // number or "?"
  op: VarOpSymbol | "?";
  right: string;  // number or "?"
  result: number | "?"; // right-hand side of "="
  answer: number; // primary numeric answer (compatibility for single-slot)
  slots: VarSlotRole[];
  expectedBySlot: Partial<Record<VarSlotRole, number | VarOpSymbol>>;
  options: number[]; // shuffled numeric list
  opOptions?: VarOpSymbol[];
  rawA: number;
  rawB: number;
  rawOp: VarOpSymbol;
  rawResult: number;
}

const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function opsForLevel(level: number): VarOp[] {
  switch (level) {
    case 1: return ["add"];
    case 2: return ["add", "sub"];
    case 3: return ["mul"];
    case 4: return ["div"];
    default: return ["add", "sub", "mul", "div"];
  }
}

const SYMBOL: Record<VarOp, "+" | "−" | "×" | "÷"> = {
  add: "+", sub: "−", mul: "×", div: "÷",
};

interface RawExpr {
  a: number; b: number; op: VarOp; result: number;
}

function buildExpr(op: VarOp): RawExpr {
  let a: number, b: number, result: number;
  switch (op) {
    case "add":
      a = rng(1, 12); b = rng(1, 12); result = a + b; break;
    case "sub":
      a = rng(3, 20); b = rng(1, a - 1); result = a - b; break;
    case "mul":
      a = rng(2, 10); b = rng(2, 10); result = a * b; break;
    case "div":
      b = rng(2, 10); result = rng(2, 10); a = b * result; break;
  }
  return { a, b, op, result };
}

function makeOptions(answers: number[], count: number): number[] {
  const set = new Set<number>(answers);
  let guard = 0;
  const anchor = answers[0] ?? 5;
  while (set.size < count && guard++ < 200) {
    const base = pick(answers);
    const delta = pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, -7]);
    const cand = base + delta;
    if (cand > 0 && cand <= 100) set.add(cand);
  }
  let extra = 1;
  while (set.size < count && guard++ < 400) {
    const cand = anchor + extra;
    if (cand > 0 && cand <= 100) set.add(cand);
    extra++;
  }
  const arr = Array.from(set);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ALL_VAR_OP_SYMBOLS: VarOpSymbol[] = ["+", "−", "×", "÷"];

function pickSlotsForLevel(level: number): VarSlotRole[] {
  if (level <= 1) {
    return [Math.random() < 0.5 ? "left" : "right"];
  }
  if (level === 2) {
    // Alterna entre operador faltando (mais acessível) e 2 espaços (ex: número + resultado)
    return pick<VarSlotRole[]>([
      ["op"],
      ["op"],
      ["left", "result"],
      ["right", "result"],
    ]);
  }
  if (level === 3) {
    // Dois espaços numéricos alternando entre (left+right), (left+result) e (right+result)
    return pick<VarSlotRole[]>([
      ["left", "right"],
      ["left", "right"],
      ["left", "result"],
      ["right", "result"],
    ]);
  }
  // Nível 4+: combina 2 espaços numéricos e operador + número
  return pick<VarSlotRole[]>([
    ["left", "right"],
    ["left", "result"],
    ["right", "result"],
    ["op", "right"],
    ["op", "left"],
  ]);
}

export function generateVariableQuestion(level: number, previous?: string): VarQuestion {
  const ops = opsForLevel(level);
  let q: VarQuestion | null = null;
  for (let i = 0; i < 16; i++) {
    const op = pick(ops);
    const e = buildExpr(op);
    const opSym = SYMBOL[e.op];
    let slots = pickSlotsForLevel(level);

    // Avoid ambiguous operator-only questions when a=2, b=2, res=4 (+ vs ×)
    if (slots.includes("op") && ((e.a === 2 && e.b === 2) || (e.a === 4 && e.b === 2 && op === "sub"))) {
      slots = ["left", "right"];
    }

    const expectedBySlot: Partial<Record<VarSlotRole, number | VarOpSymbol>> = {};
    const neededNums: number[] = [];
    for (const s of slots) {
      if (s === "left") { expectedBySlot.left = e.a; neededNums.push(e.a); }
      else if (s === "right") { expectedBySlot.right = e.b; neededNums.push(e.b); }
      else if (s === "result") { expectedBySlot.result = e.result; neededNums.push(e.result); }
      else if (s === "op") { expectedBySlot.op = opSym; }
    }

    const primaryAnswer = neededNums[0] ?? e.a;
    const optionCount = Math.max(neededNums.length + 3, rng(5, 8));

    const cand: VarQuestion = {
      left: slots.includes("left") ? "?" : String(e.a),
      op: slots.includes("op") ? "?" : opSym,
      right: slots.includes("right") ? "?" : String(e.b),
      result: slots.includes("result") ? "?" : e.result,
      answer: primaryAnswer,
      slots,
      expectedBySlot,
      options: neededNums.length > 0 ? makeOptions(neededNums, optionCount) : [],
      opOptions: slots.includes("op") ? [...ALL_VAR_OP_SYMBOLS] : undefined,
      rawA: e.a,
      rawB: e.b,
      rawOp: opSym,
      rawResult: e.result,
    };

    const sig = `${cand.left}${cand.op}${cand.right}=${cand.result}`;
    if (sig !== previous) { q = cand; break; }
    q = cand;
  }
  return q!;
}

/**
 * Avalia matematicamente todos os espaços preenchidos da questão.
 * Aceita qualquer combinação que torne a igualdade verdadeira (ex: [4] + [6] = 10).
 */
export function checkVariableSlots(
  q: VarQuestion,
  filled: Partial<Record<VarSlotRole, number | VarOpSymbol>>,
): boolean {
  for (const s of q.slots) {
    if (filled[s] === undefined || filled[s] === null || filled[s] === "") return false;
  }
  const a = q.slots.includes("left") ? Number(filled.left) : q.rawA;
  const b = q.slots.includes("right") ? Number(filled.right) : q.rawB;
  const res = q.slots.includes("result") ? Number(filled.result) : q.rawResult;
  const op = (q.slots.includes("op") ? filled.op : q.rawOp) as VarOpSymbol;

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(res)) return false;

  switch (op) {
    case "+": return a + b === res;
    case "−": return a - b === res;
    case "×": return a * b === res;
    case "÷": return b !== 0 && a / b === res;
    default: return false;
  }
}
