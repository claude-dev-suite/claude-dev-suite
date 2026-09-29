// SPDX-License-Identifier: MIT
/**
 * A small, dependency-free JSONPath evaluator (no eval, no code execution).
 *
 * Supported: `$`, `.name`, `['name']`, `[0]`, `[-1]`, `[*]`, `.*`, `..name`,
 * `..*`, `[start:end:step]`, unions `[0,2]` / `['a','b']`, and filters
 * `[?(@.price < 10)]`, `[?(@.name == 'x')]`, `[?(@.tag)]` (existence), with
 * `==  !=  <  <=  >  >=  =~` (regex literal `/re/i`) combined by `&&` / `||`.
 * A path without a leading `$` is treated as relative to the root (`data.id`).
 */

type Segment =
  | { kind: 'child'; names: Array<string | number> }
  | { kind: 'wildcard' }
  | { kind: 'slice'; start?: number; end?: number; step?: number }
  | { kind: 'filter'; expr: FilterExpr }
  | { kind: 'descend'; inner: Segment };

type Operand = { kind: 'path'; segments: Segment[] } | { kind: 'literal'; value: unknown };
type FilterExpr =
  | { kind: 'cmp'; op: string; left: Operand; right: Operand }
  | { kind: 'exists'; path: Operand }
  | { kind: 'and' | 'or'; left: FilterExpr; right: FilterExpr }
  | { kind: 'not'; expr: FilterExpr };

export class JsonPathError extends Error {}

class Parser {
  i = 0;
  constructor(readonly src: string) {}

  peek(n = 0): string {
    return this.src[this.i + n] ?? '';
  }
  eof(): boolean {
    return this.i >= this.src.length;
  }
  skipWs(): void {
    while (/\s/.test(this.peek())) this.i++;
  }
  expect(ch: string): void {
    this.skipWs();
    if (this.peek() !== ch) throw new JsonPathError(`Expected "${ch}" at ${this.i} in ${this.src}`);
    this.i++;
  }

  readIdent(): string {
    const start = this.i;
    while (!this.eof() && /[^.[\]\s()=!<>&|,]/.test(this.peek())) this.i++;
    if (this.i === start) throw new JsonPathError(`Expected a name at ${this.i} in ${this.src}`);
    return this.src.slice(start, this.i);
  }

  readString(): string {
    const q = this.peek();
    this.i++;
    let out = '';
    while (!this.eof() && this.peek() !== q) {
      if (this.peek() === '\\') {
        this.i++;
        out += this.peek();
      } else out += this.peek();
      this.i++;
    }
    if (this.peek() !== q) throw new JsonPathError(`Unterminated string in ${this.src}`);
    this.i++;
    return out;
  }

  readNumber(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.i));
    if (!m) throw new JsonPathError(`Expected a number at ${this.i} in ${this.src}`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  parsePath(allowRelativeStart: '$' | '@'): Segment[] {
    this.skipWs();
    const segs: Segment[] = [];
    if (this.peek() === allowRelativeStart) this.i++;
    else if (allowRelativeStart === '$' && !this.eof()) {
      // Relative form: "data.items[0]" == "$.data.items[0]"
      if (this.peek() !== '.' && this.peek() !== '[') segs.push({ kind: 'child', names: [this.readIdent()] });
    }
    for (;;) {
      if (this.eof()) break;
      const c = this.peek();
      if (c === '.' && this.peek(1) === '.') {
        this.i += 2;
        if (this.peek() === '*') {
          this.i++;
          segs.push({ kind: 'descend', inner: { kind: 'wildcard' } });
        } else if (this.peek() === '[') {
          segs.push({ kind: 'descend', inner: this.parseBracket() });
        } else {
          segs.push({ kind: 'descend', inner: { kind: 'child', names: [this.readIdent()] } });
        }
      } else if (c === '.') {
        this.i++;
        if (this.peek() === '*') {
          this.i++;
          segs.push({ kind: 'wildcard' });
        } else segs.push({ kind: 'child', names: [this.readIdent()] });
      } else if (c === '[') {
        segs.push(this.parseBracket());
      } else break;
    }
    return segs;
  }

  parseBracket(): Segment {
    this.expect('[');
    this.skipWs();
    let seg: Segment;
    if (this.peek() === '*') {
      this.i++;
      seg = { kind: 'wildcard' };
    } else if (this.peek() === '?') {
      this.i++;
      this.skipWs();
      const paren = this.peek() === '(';
      if (paren) this.i++;
      const expr = this.parseOr();
      if (paren) this.expect(')');
      seg = { kind: 'filter', expr };
    } else {
      const close = this.src.indexOf(']', this.i);
      const inner = close >= 0 ? this.src.slice(this.i, close) : '';
      const slice = /^\s*(-?\d+)?\s*:\s*(-?\d+)?\s*(?::\s*(-?\d+)?\s*)?$/.exec(inner);
      if (slice) {
        this.i = close;
        const num = (x: string | undefined) => (x === undefined ? undefined : Number(x));
        seg = { kind: 'slice', start: num(slice[1]), end: num(slice[2]), step: num(slice[3]) };
      } else {
        // union of names / indices
        const items: Array<string | number> = [];
        for (;;) {
          this.skipWs();
          const c = this.peek();
          if (c === "'" || c === '"') items.push(this.readString());
          else if (/[-\d]/.test(c)) items.push(this.readNumber());
          else throw new JsonPathError(`Unexpected "${c}" in ${this.src}`);
          this.skipWs();
          if (this.peek() === ',') {
            this.i++;
            continue;
          }
          break;
        }
        seg = { kind: 'child', names: items };
      }
    }
    this.expect(']');
    return seg;
  }

  parseOr(): FilterExpr {
    let left = this.parseAnd();
    for (;;) {
      this.skipWs();
      if (this.src.startsWith('||', this.i)) {
        this.i += 2;
        left = { kind: 'or', left, right: this.parseAnd() };
      } else return left;
    }
  }

  parseAnd(): FilterExpr {
    let left = this.parseUnary();
    for (;;) {
      this.skipWs();
      if (this.src.startsWith('&&', this.i)) {
        this.i += 2;
        left = { kind: 'and', left, right: this.parseUnary() };
      } else return left;
    }
  }

  parseUnary(): FilterExpr {
    this.skipWs();
    if (this.peek() === '!' && this.peek(1) !== '=') {
      this.i++;
      return { kind: 'not', expr: this.parseUnary() };
    }
    if (this.peek() === '(') {
      this.i++;
      const e = this.parseOr();
      this.expect(')');
      return e;
    }
    const left = this.parseOperand();
    this.skipWs();
    const m = /^(==|!=|<=|>=|<|>|=~)/.exec(this.src.slice(this.i));
    if (!m) {
      if (left.kind !== 'path') throw new JsonPathError(`Filter needs a comparison in ${this.src}`);
      return { kind: 'exists', path: left };
    }
    this.i += m[0].length;
    const right = this.parseOperand();
    return { kind: 'cmp', op: m[0], left, right };
  }

  parseOperand(): Operand {
    this.skipWs();
    const c = this.peek();
    if (c === '@' || c === '$') {
      const root = c;
      return { kind: 'path', segments: [{ kind: 'child', names: [root === '$' ? '\u0000root' : '\u0000self'] }, ...this.parsePath(root as '$' | '@')] };
    }
    if (c === "'" || c === '"') return { kind: 'literal', value: this.readString() };
    if (c === '/') {
      const m = /^\/((?:[^/\\]|\\.)*)\/([a-z]*)/.exec(this.src.slice(this.i));
      if (!m) throw new JsonPathError(`Bad regex in ${this.src}`);
      this.i += m[0].length;
      return { kind: 'literal', value: new RegExp(m[1], m[2]) };
    }
    if (/[-\d]/.test(c)) return { kind: 'literal', value: this.readNumber() };
    for (const [word, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (this.src.startsWith(word, this.i)) {
        this.i += word.length;
        return { kind: 'literal', value };
      }
    }
    throw new JsonPathError(`Unexpected "${c}" in filter of ${this.src}`);
  }
}

const cache = new Map<string, { segs: Segment[]; definite: boolean }>();

function compile(path: string): { segs: Segment[]; definite: boolean } {
  let hit = cache.get(path);
  if (hit) return hit;
  const p = new Parser(path.trim());
  const segs = p.parsePath('$');
  p.skipWs();
  if (!p.eof()) throw new JsonPathError(`Unexpected trailing input at ${p.i} in ${path}`);
  const definite = segs.every((s) => s.kind === 'child' && s.names.length === 1);
  hit = { segs, definite };
  if (cache.size > 500) cache.clear();
  cache.set(path, hit);
  return hit;
}

function children(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v as object);
  return [];
}

function applySeg(seg: Segment, nodes: unknown[], root: unknown): unknown[] {
  const out: unknown[] = [];
  for (const node of nodes) {
    switch (seg.kind) {
      case 'child':
        for (const name of seg.names) {
          if (name === '\u0000root') out.push(root);
          else if (name === '\u0000self') out.push(node);
          else if (Array.isArray(node) && typeof name === 'number') {
            const idx = name < 0 ? node.length + name : name;
            if (idx >= 0 && idx < node.length) out.push(node[idx]);
          } else if (Array.isArray(node) && typeof name === 'string' && /^-?\d+$/.test(name)) {
            const n = Number(name);
            const idx = n < 0 ? node.length + n : n;
            if (idx >= 0 && idx < node.length) out.push(node[idx]);
          } else if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, String(name))) {
            out.push((node as Record<string, unknown>)[String(name)]);
          }
        }
        break;
      case 'wildcard':
        out.push(...children(node));
        break;
      case 'slice': {
        if (!Array.isArray(node)) break;
        const len = node.length;
        const step = seg.step ?? 1;
        if (step === 0) break;
        const norm = (i: number | undefined, def: number) =>
          i === undefined ? def : i < 0 ? Math.max(0, len + i) : Math.min(len, i);
        if (step > 0) {
          for (let i = norm(seg.start, 0); i < norm(seg.end, len); i += step) out.push(node[i]);
        } else {
          const s = seg.start === undefined ? len - 1 : norm(seg.start, len - 1);
          const e = seg.end === undefined ? -1 : norm(seg.end, -1);
          for (let i = Math.min(s, len - 1); i > e; i += step) out.push(node[i]);
        }
        break;
      }
      case 'filter':
        for (const c of children(node)) if (evalFilter(seg.expr, c, root)) out.push(c);
        break;
      case 'descend': {
        // Document order (depth-first, pre-order), as in the reference implementation.
        const stack: unknown[] = [node];
        const all: unknown[] = [];
        let guard = 0;
        while (stack.length && guard++ < 100_000) {
          const cur = stack.pop();
          all.push(cur);
          const kids = children(cur);
          for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
        }
        out.push(...applySeg(seg.inner, all, root));
        break;
      }
    }
  }
  return out;
}

function evalOperand(op: Operand, self: unknown, root: unknown): { values: unknown[]; literal: boolean } {
  if (op.kind === 'literal') return { values: [op.value], literal: true };
  const [first, ...rest] = op.segments;
  let nodes = applySeg(first, [self], root);
  for (const s of rest) nodes = applySeg(s, nodes, root);
  return { values: nodes, literal: false };
}

function compare(op: string, a: unknown, b: unknown): boolean {
  switch (op) {
    case '==':
      return deepEqual(a, b);
    case '!=':
      return !deepEqual(a, b);
    case '=~':
      return b instanceof RegExp && typeof a === 'string' && b.test(a);
    default: {
      if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) return false;
      if (op === '<') return a < b;
      if (op === '<=') return a <= b;
      if (op === '>') return a > b;
      return a >= b;
    }
  }
}

function evalFilter(e: FilterExpr, self: unknown, root: unknown): boolean {
  switch (e.kind) {
    case 'and':
      return evalFilter(e.left, self, root) && evalFilter(e.right, self, root);
    case 'or':
      return evalFilter(e.left, self, root) || evalFilter(e.right, self, root);
    case 'not':
      return !evalFilter(e.expr, self, root);
    case 'exists':
      return evalOperand(e.path, self, root).values.length > 0;
    case 'cmp': {
      const l = evalOperand(e.left, self, root).values;
      const r = evalOperand(e.right, self, root).values;
      return l.some((a) => r.some((b) => compare(e.op, a, b)));
    }
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return (
    ka.length === kb.length &&
    ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/** All matches of `path` in `doc`. */
export function queryAll(doc: unknown, path: string): unknown[] {
  const { segs } = compile(path);
  let nodes: unknown[] = [doc];
  for (const s of segs) nodes = applySeg(s, nodes, doc);
  return nodes;
}

/**
 * The value at `path`: for a definite path (only single names/indices) the one
 * match, else the array of all matches. `found` distinguishes "absent" from a
 * present `null`/`undefined`.
 */
export function query(doc: unknown, path: string): { found: boolean; value: unknown; definite: boolean } {
  const { definite } = compile(path);
  const matches = queryAll(doc, path);
  if (definite) return { found: matches.length > 0, value: matches[0], definite };
  return { found: matches.length > 0, value: matches, definite };
}
