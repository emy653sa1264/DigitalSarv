/**
 * Safe arithmetic for price formulas (spec §35): numbers, variables, + − * /, parentheses, unary minus and
 * min/max/round/floor/ceil. Hand-written tokenizer + recursive-descent parser — never eval/Function.
 */
export const FORMULA_VARS = ['base_price', 'provider_price', 'paper_cost', 'quantity', 'markup', 'discount'] as const;
export type FormulaVar = (typeof FORMULA_VARS)[number];

export class FormulaError extends Error {}

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: FormulaNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: FormulaNode; b: FormulaNode }
  | { t: 'call'; fn: FnName; args: FormulaNode[] };

type FnName = 'min' | 'max' | 'round' | 'floor' | 'ceil';
const FNS: Record<FnName, { arity: [number, number]; run: (...a: number[]) => number }> = {
  min: { arity: [2, 10], run: (...a) => Math.min(...a) },
  max: { arity: [2, 10], run: (...a) => Math.max(...a) },
  round: { arity: [1, 1], run: (x) => Math.round(x) },
  floor: { arity: [1, 1], run: (x) => Math.floor(x) },
  ceil: { arity: [1, 1], run: (x) => Math.ceil(x) },
};
const MAX_LEN = 200;
const MAX_DEPTH = 50;

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function toAscii(src: string): string {
  return src
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
}

function tokenize(input: string): Tok[] {
  const src = toAscii(input);
  if (!src.trim()) throw new FormulaError('فرمول خالی است');
  if (src.length > MAX_LEN) throw new FormulaError('فرمول بیش از حد طولانی است');
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ('+-*/(),'.includes(c)) {
      if (c === '*' && src[i + 1] === '*') throw new FormulaError('عملگر «**» مجاز نیست');
      out.push({ k: 'op', v: c }); i++; continue;
    }
    throw new FormulaError(`نویسه «${c}» در فرمول مجاز نیست`);
  }
  return out;
}

export function parseFormula(src: string): FormulaNode {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`«${v}» در فرمول انتظار می‌رفت`);
    pos++;
  };
  const expr = (d: number): FormulaNode => {
    if (d > MAX_DEPTH) throw new FormulaError('فرمول بیش از حد تودرتو است');
    let a = term(d + 1);
    while (isOp('+') || isOp('-')) {
      const op = toks[pos++].v as '+' | '-';
      a = { t: 'bin', op, a, b: term(d + 1) };
    }
    return a;
  };
  const term = (d: number): FormulaNode => {
    let a = unary(d + 1);
    while (isOp('*') || isOp('/')) {
      const op = toks[pos++].v as '*' | '/';
      a = { t: 'bin', op, a, b: unary(d + 1) };
    }
    return a;
  };
  const unary = (d: number): FormulaNode => {
    if (d > MAX_DEPTH) throw new FormulaError('فرمول بیش از حد تودرتو است');
    if (isOp('-')) { pos++; return { t: 'neg', a: unary(d + 1) }; }
    if (isOp('+')) { pos++; return unary(d + 1); }
    return primary(d + 1);
  };
  const primary = (d: number): FormulaNode => {
    const tok = peek();
    if (!tok) throw new FormulaError('فرمول ناقص است');
    if (tok.k === 'num') { pos++; return { t: 'num', v: tok.v }; }
    if (tok.k === 'id') {
      pos++;
      if (isOp('(')) {
        if (!(tok.v in FNS)) throw new FormulaError(`تابع «${tok.v}» شناخته‌شده نیست`);
        pos++;
        const args: FormulaNode[] = [];
        if (!isOp(')')) {
          args.push(expr(d + 1));
          while (isOp(',')) { pos++; args.push(expr(d + 1)); }
        }
        expect(')');
        const [lo, hi] = FNS[tok.v as FnName].arity;
        if (args.length < lo || args.length > hi) throw new FormulaError(`تعداد ورودی‌های «${tok.v}» نادرست است`);
        return { t: 'call', fn: tok.v as FnName, args };
      }
      return { t: 'var', name: tok.v };
    }
    if (isOp('(')) { pos++; const e = expr(d + 1); expect(')'); return e; }
    throw new FormulaError(`«${tok.v}» در این جای فرمول مجاز نیست`);
  };
  const node = expr(0);
  if (pos !== toks.length) throw new FormulaError('بخشی از فرمول قابل فهم نیست');
  return node;
}

export function formulaVariables(node: FormulaNode): string[] {
  const out = new Set<string>();
  const walk = (n: FormulaNode): void => {
    if (n.t === 'var') out.add(n.name);
    else if (n.t === 'neg') walk(n.a);
    else if (n.t === 'bin') { walk(n.a); walk(n.b); }
    else if (n.t === 'call') n.args.forEach(walk);
  };
  walk(node);
  return [...out];
}

/** Persian error message, or null when the formula is valid and only uses `allowed` variables. */
export function validateFormula(src: string, allowed: readonly string[] = FORMULA_VARS): string | null {
  try {
    const unknown = formulaVariables(parseFormula(src)).filter((v) => !allowed.includes(v));
    return unknown.length ? `متغیر «${unknown[0]}» در این فرمول مجاز نیست` : null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : 'فرمول نامعتبر است';
  }
}

export function evalFormula(src: string | FormulaNode, vars: Partial<Record<string, number>>): number {
  const node = typeof src === 'string' ? parseFormula(src) : src;
  const run = (n: FormulaNode): number => {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': {
        const v = vars[n.name];
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormulaError(`مقدار «${n.name}» تعیین نشده است`);
        return v;
      }
      case 'neg': return -run(n.a);
      case 'call': return FNS[n.fn].run(...n.args.map(run));
      case 'bin': {
        const a = run(n.a);
        const b = run(n.b);
        if (n.op === '/' && b === 0) throw new FormulaError('تقسیم بر صفر');
        return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b;
      }
    }
  };
  const out = run(node);
  if (!Number.isFinite(out)) throw new FormulaError('نتیجه فرمول معتبر نیست');
  return out;
}
