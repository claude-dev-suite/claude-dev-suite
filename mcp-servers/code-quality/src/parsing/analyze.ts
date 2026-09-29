// SPDX-License-Identifier: MIT
/**
 * Single-pass, tree-sitter based source analysis.
 *
 * One cursor walk per file yields, per function unit:
 *  - cyclomatic complexity (McCabe: decisions + 1, each && / || / ?? counts),
 *  - cognitive complexity following the SonarSource specification
 *    (structural increments with a nesting penalty; `else if`/`else` as
 *    hybrid increments; one increment per sequence of like boolean operators;
 *    labelled jumps; recursion; lambdas nest but do not increment),
 *  - control-flow nesting depth, Halstead measures and a maintainability index,
 * and, per file, exact code/comment/blank line counts from the syntax tree.
 *
 * Nested *named* functions are separate units; anonymous functions nested in a
 * unit belong to it (as SonarQube attributes them).
 */

import type { Node, Tree, TreeCursor } from 'web-tree-sitter';
import type { LanguageId } from '../core/paths.js';
import { withTree } from './parser.js';
import { specFor, isIdentifierLeaf, isLiteralLeaf, isNumberNode, isStringNode, type LangSpec } from './specs.js';
import { className, functionName, isClassLike, parameters, visibilityOf, type ParamInfo } from './naming.js';

export interface Halstead {
  distinctOperators: number;
  distinctOperands: number;
  totalOperators: number;
  totalOperands: number;
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
}

export interface FunctionInfo {
  name: string;
  /** Unqualified name, for recursion detection and reporting. */
  simpleName: string;
  className: string | null;
  line: number;
  endLine: number;
  /** Lines spanned. */
  loc: number;
  /** Lines with code. */
  sloc: number;
  params: ParamInfo[];
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
  halstead: Halstead;
  maintainability: number;
  /** Callable only from its own file/type (Go: package; Rust: crate). */
  isPrivate: boolean;
  /** Has decorators/attributes/annotations (often registered, i.e. called by a framework). */
  decorated: boolean;
  /** Lambda / anonymous function unit. */
  anonymous: boolean;
  /** `this.`/`self.` member uses vs uses of other objects (JS/TS/Python methods). */
  memberAccess?: { own: number; foreign: Record<string, number> };
}

export interface ClassInfo {
  name: string;
  line: number;
  endLine: number;
  loc: number;
  methods: number;
  /** Weighted methods per class: sum of method cyclomatic complexity. */
  wmc: number;
}

export interface TokenStream {
  /** Exact token ids. */
  exact: Int32Array;
  /** Identifiers normalised to one id (renamed variables still match). */
  renamed: Int32Array;
  /** Identifiers and literals normalised. */
  normalized: Int32Array;
  line: Int32Array;
  endLine: Int32Array;
}

export interface FileAnalysis {
  lang: LanguageId;
  loc: number;
  sloc: number;
  commentLines: number;
  blankLines: number;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  halstead: Halstead;
  /** File-level maintainability index (0–100). */
  maintainability: number;
  parseErrors: number;
  firstErrorLine: number | null;
  magicNumbers: Array<{ line: number; value: string }>;
  emptyCatches: number[];
  tokens?: TokenStream;
  identifiers?: Map<string, number>;
}

export class Interner {
  private map = new Map<string, number>();
  id(s: string): number {
    let v = this.map.get(s);
    if (v === undefined) {
      v = this.map.size;
      this.map.set(s, v);
    }
    return v;
  }
}

export interface AnalyzeOptions {
  tokens?: Interner;
  identifiers?: boolean;
  /** Skip magic-number collection (it walks parents per literal). */
  magicNumbers?: boolean;
}

const ALLOWED_NUMBERS = new Set(['0', '1', '2', '-1', '10', '100', '1000', '0.0', '1.0', '0.5', '2.0', '0L', '1L', '0u', '1u', '0.0f', '1.0f', '0f', '1f', '0x0', '0x1', '1_000', '1e3']);
const CLOSERS = new Set([')', ']', '}', '>']);

interface Acc {
  info: FunctionInfo;
  ops: Map<string, number>;
  opnds: Map<string, number>;
  isMethod: boolean;
  classAcc: ClassAcc | null;
}

interface ClassAcc {
  info: ClassInfo;
  /** The unit that was current when the class was entered; methods are its direct children. */
  owner: Acc | null;
}

function bump(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

export function halsteadOf(ops: Map<string, number>, opnds: Map<string, number>): Halstead {
  let N1 = 0;
  let N2 = 0;
  for (const v of ops.values()) N1 += v;
  for (const v of opnds.values()) N2 += v;
  const n1 = ops.size;
  const n2 = opnds.size;
  const vocabulary = n1 + n2;
  const length = N1 + N2;
  const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    distinctOperators: n1,
    distinctOperands: n2,
    totalOperators: N1,
    totalOperands: N2,
    vocabulary,
    length,
    volume: r(volume),
    difficulty: r(difficulty),
    effort: r(volume * difficulty),
  };
}

/** Microsoft's bounded variant: max(0, (171 − 5.2 ln V − 0.23 CC − 16.2 ln SLOC) · 100 / 171). */
export function maintainabilityIndex(volume: number, cyclomatic: number, sloc: number): number {
  if (sloc <= 0) return 100;
  const v = Math.max(volume, 1);
  const mi = ((171 - 5.2 * Math.log(v) - 0.23 * cyclomatic - 16.2 * Math.log(sloc)) * 100) / 171;
  return Math.round(Math.max(0, Math.min(100, mi)) * 10) / 10;
}

class Walker {
  readonly spec: LangSpec;
  readonly code: Uint8Array;
  readonly comment: Uint8Array;
  readonly units: Acc[] = [];
  readonly classes: ClassAcc[] = [];
  readonly fileOps = new Map<string, number>();
  readonly fileOpnds = new Map<string, number>();
  readonly magic: Array<{ line: number; value: string }> = [];
  readonly emptyCatches: number[] = [];
  readonly identifiers: Map<string, number> | null;
  parseErrors = 0;
  firstErrorLine: number | null = null;
  private classStack: ClassAcc[] = [];
  private tokExact: number[] = [];
  private tokRenamed: number[] = [];
  private tokAbstract: number[] = [];
  private tokLine: number[] = [];
  private tokEnd: number[] = [];

  constructor(
    readonly lang: LanguageId,
    readonly lineCount: number,
    readonly opts: AnalyzeOptions
  ) {
    this.spec = specFor(lang);
    this.code = new Uint8Array(lineCount + 1);
    this.comment = new Uint8Array(lineCount + 1);
    this.identifiers = opts.identifiers ? new Map() : null;
  }

  tokens(): TokenStream | undefined {
    if (!this.opts.tokens) return undefined;
    return {
      exact: Int32Array.from(this.tokExact),
      renamed: Int32Array.from(this.tokRenamed),
      normalized: Int32Array.from(this.tokAbstract),
      line: Int32Array.from(this.tokLine),
      endLine: Int32Array.from(this.tokEnd),
    };
  }

  private mark(arr: Uint8Array, from: number, to: number): void {
    for (let r = from; r <= to && r < arr.length; r++) arr[r] = 1;
  }

  /** Visit the node under the cursor. */
  visit(c: TreeCursor, unit: Acc | null, nesting: number, depth: number, parentOp: string | null, inImport: boolean): void {
    const type = c.nodeType;
    const spec = this.spec;

    if (type.includes('comment')) {
      this.mark(this.comment, c.startPosition.row, c.endPosition.row);
      return;
    }
    if (type === 'ERROR' || c.nodeIsMissing) {
      this.parseErrors++;
      if (this.firstErrorLine === null) this.firstErrorLine = c.startPosition.row + 1;
    }
    if (this.lang === 'python' && type === 'expression_statement' && this.isDocstring(c)) {
      this.mark(this.comment, c.startPosition.row, c.endPosition.row);
      return;
    }
    if (!c.nodeIsNamed) {
      // Keywords share names with node types (`class`, `function`): never structural.
      if (!c.gotoFirstChild()) {
        this.leaf(c, unit, type, inImport, false);
        return;
      }
      do {
        this.visit(c, unit, nesting, depth, null, inImport);
      } while (c.gotoNextSibling());
      c.gotoParent();
      return;
    }
    if (isStringNode(type)) {
      this.leaf(c, unit, type, inImport, true);
      return;
    }

    // Function units.
    const isFn = spec.functionTypes.has(type);
    const isLambda = spec.lambdaTypes.has(type);
    if (isFn || (isLambda && unit === null)) {
      const node = c.currentNode;
      const hasBody = isLambda || node.childForFieldName('body') !== null;
      if (hasBody) {
        const acc = this.openUnit(node, unit);
        this.children(c, acc, 0, 0, null, inImport);
        this.closeUnit(acc);
        return;
      }
    }
    if (isLambda && unit !== null) {
      this.children(c, unit, nesting + 1, depth, null, inImport);
      return;
    }

    // Classes.
    if (spec.classTypes.has(type)) {
      const node = c.currentNode;
      if (isClassLike(node, this.lang)) {
        const info: ClassInfo = {
          name: className(node, this.lang),
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          loc: node.endPosition.row - node.startPosition.row + 1,
          methods: 0,
          wmc: 0,
        };
        const cls: ClassAcc = { info, owner: unit };
        this.classes.push(cls);
        this.classStack.push(cls);
        this.children(c, unit, nesting, depth, null, inImport);
        this.classStack.pop();
        return;
      }
    }

    const importHere = inImport || spec.importTypes.has(type);

    if (unit !== null) {
      const info = unit.info;
      if (spec.ifTypes.has(type)) {
        this.handleIf(c, unit, nesting, depth, false, importHere);
        return;
      }
      if (spec.loopTypes.has(type)) {
        info.cyclomatic++;
        info.cognitive += 1 + nesting;
        this.depth(unit, depth + 1);
        this.children(c, unit, nesting + 1, depth + 1, null, importHere);
        return;
      }
      if (spec.switchTypes.has(type)) {
        info.cognitive += 1 + nesting;
        this.depth(unit, depth + 1);
        this.children(c, unit, nesting + 1, depth + 1, null, importHere);
        return;
      }
      if (spec.catchTypes.has(type)) {
        info.cyclomatic++;
        info.cognitive += 1 + nesting;
        if (spec.isEmptyCatch(c.currentNode)) this.emptyCatches.push(c.startPosition.row + 1);
        this.children(c, unit, nesting + 1, depth, null, importHere);
        return;
      }
      if (spec.tryTypes.has(type)) {
        this.depth(unit, depth + 1);
        this.children(c, unit, nesting, depth + 1, null, importHere);
        return;
      }
      if (spec.ternaryTypes.has(type)) {
        info.cyclomatic++;
        info.cognitive += 1 + nesting;
        this.children(c, unit, nesting + 1, depth, null, importHere);
        return;
      }
      if (spec.extraDecisionTypes.has(type)) info.cyclomatic++;
      const w = this.caseWeight(c, type);
      if (w) info.cyclomatic += w;
      if ((type.startsWith('break') || type.startsWith('continue') || type.startsWith('goto')) && spec.isJumpToLabel(c.currentNode)) {
        info.cognitive++;
      }
      if (spec.logicalTypes.has(type)) {
        const op = this.operatorOf(c);
        if (op && spec.logicalOps.has(op)) {
          info.cyclomatic++;
          if (parentOp !== op) info.cognitive++;
          this.children(c, unit, nesting, depth, op, importHere);
          return;
        }
      }
      if (unit.isMethod && (type === 'member_expression' || type === 'attribute')) this.memberAccess(c, unit);
    } else if (spec.catchTypes.has(type) && spec.isEmptyCatch(c.currentNode)) {
      this.emptyCatches.push(c.startPosition.row + 1);
    }

    if (!c.gotoFirstChild()) {
      this.leaf(c, unit, type, importHere, false);
      return;
    }
    const passOp = type === 'parenthesized_expression' ? parentOp : null;
    do {
      this.visit(c, unit, nesting, depth, passOp, importHere);
    } while (c.gotoNextSibling());
    c.gotoParent();
  }

  private children(c: TreeCursor, unit: Acc | null, nesting: number, depth: number, op: string | null, inImport: boolean): void {
    if (!c.gotoFirstChild()) return;
    do {
      this.visit(c, unit, nesting, depth, op, inImport);
    } while (c.gotoNextSibling());
    c.gotoParent();
  }

  private caseWeight(c: TreeCursor, type: string): number {
    if (!/case|arm|label|section/.test(type)) return 0;
    return this.spec.caseWeight(c.currentNode);
  }

  private depth(unit: Acc, d: number): void {
    if (d > unit.info.maxNesting) unit.info.maxNesting = d;
  }

  private operatorOf(c: TreeCursor): string | null {
    let op: string | null = null;
    if (c.gotoFirstChild()) {
      do {
        if (!c.nodeIsNamed && (c.currentFieldName === 'operator' || this.spec.logicalOps.has(c.nodeType))) {
          op = c.nodeType;
          if (this.spec.logicalOps.has(op)) break;
        }
      } while (c.gotoNextSibling());
      c.gotoParent();
    }
    return op;
  }

  /** `if` chains: `else if` and `else` are hybrid increments (no nesting penalty). */
  private handleIf(c: TreeCursor, unit: Acc, nesting: number, depth: number, isElseIf: boolean, inImport: boolean): void {
    const info = unit.info;
    info.cyclomatic++;
    info.cognitive += isElseIf ? 1 : 1 + nesting;
    this.depth(unit, depth + 1);
    if (!c.gotoFirstChild()) return;
    do {
      const f = c.currentFieldName;
      if (f === 'alternative') this.handleAlternative(c, unit, nesting, depth, inImport);
      else if (f === 'condition' || f === 'initializer') this.visit(c, unit, nesting, depth, null, inImport);
      else this.visit(c, unit, nesting + 1, depth + 1, null, inImport);
    } while (c.gotoNextSibling());
    c.gotoParent();
  }

  private handleAlternative(c: TreeCursor, unit: Acc, nesting: number, depth: number, inImport: boolean): void {
    const spec = this.spec;
    const type = c.nodeType;
    const info = unit.info;
    if (type.includes('comment')) {
      this.visit(c, unit, nesting, depth, null, inImport);
      return;
    }
    if (spec.ifTypes.has(type)) {
      this.handleIf(c, unit, nesting, depth, true, inImport);
      return;
    }
    if (spec.elifTypes.has(type)) {
      info.cyclomatic++;
      info.cognitive++;
      if (!c.gotoFirstChild()) return;
      do {
        if (c.currentFieldName === 'condition') this.visit(c, unit, nesting, depth, null, inImport);
        else this.visit(c, unit, nesting + 1, depth + 1, null, inImport);
      } while (c.gotoNextSibling());
      c.gotoParent();
      return;
    }
    if (spec.elseTypes.has(type)) {
      // `else if` wraps the nested if in an else clause in JS and Rust.
      const node = c.currentNode;
      const inner = node.namedChildren.filter((n) => n && !n.type.includes('comment'));
      if (inner.length === 1 && spec.ifTypes.has(inner[0]!.type)) {
        if (!c.gotoFirstChild()) return;
        do {
          if (spec.ifTypes.has(c.nodeType)) this.handleIf(c, unit, nesting, depth, true, inImport);
          else this.visit(c, unit, nesting, depth, null, inImport);
        } while (c.gotoNextSibling());
        c.gotoParent();
        return;
      }
      info.cognitive++;
      this.children(c, unit, nesting + 1, depth + 1, null, inImport);
      return;
    }
    // Go / Java / C#: the alternative is the else body itself.
    info.cognitive++;
    this.visit(c, unit, nesting + 1, depth + 1, null, inImport);
  }

  private memberAccess(c: TreeCursor, unit: Acc): void {
    if (!c.gotoFirstChild()) return;
    if (c.currentFieldName === 'object') {
      const t = c.nodeType;
      const acc = (unit.info.memberAccess ??= { own: 0, foreign: {} });
      if (t === 'this' || (t === 'identifier' && (c.nodeText === 'self' || c.nodeText === 'cls') && this.lang === 'python')) {
        acc.own++;
      } else if (t === 'identifier') {
        const name = c.nodeText;
        acc.foreign[name] = (acc.foreign[name] ?? 0) + 1;
      }
    }
    c.gotoParent();
  }

  private isDocstring(c: TreeCursor): boolean {
    const node = c.currentNode;
    if (node.namedChildCount !== 1 || node.namedChild(0)?.type !== 'string') return false;
    const parent = node.parent;
    if (!parent || (parent.type !== 'module' && parent.type !== 'block')) return false;
    const first = parent.namedChildren.find((n) => n && !n.type.includes('comment'));
    return first?.startIndex === node.startIndex;
  }

  private leaf(c: TreeCursor, unit: Acc | null, type: string, inImport: boolean, isString: boolean): void {
    const startRow = c.startPosition.row;
    const endRow = c.endPosition.row;
    if (c.endIndex === c.startIndex) return; // zero-width (MISSING) token
    this.mark(this.code, startRow, endRow);
    const named = c.nodeIsNamed;
    let kind: 'operand' | 'operator' | 'literal';
    let text: string;
    let isIdent = false;
    if (isString) {
      kind = 'literal';
      text = c.nodeText;
    } else if (named && isLiteralLeaf(type)) {
      kind = 'literal';
      text = c.nodeText;
      if (this.opts.magicNumbers !== false && isNumberNode(type) && !ALLOWED_NUMBERS.has(text)) {
        this.checkMagic(c, text, startRow + 1);
      }
    } else if (named) {
      // Identifiers, but also named leaves such as `predefined_type` or `jsx_text`.
      kind = 'operand';
      text = c.nodeText;
      isIdent = isIdentifierLeaf(type);
      if (isIdent && this.identifiers) bump(this.identifiers, text);
    } else {
      kind = 'operator';
      text = type;
    }

    if (kind === 'operator') {
      if (!CLOSERS.has(text)) {
        bump(this.fileOps, text);
        if (unit) bump(unit.ops, text);
      }
    } else {
      bump(this.fileOpnds, text);
      if (unit) bump(unit.opnds, text);
    }

    if (this.opts.tokens && !inImport) {
      const interner = this.opts.tokens;
      const exactId = interner.id(text);
      const renamedId = isIdent ? interner.id('\u0001ID') : exactId;
      this.tokExact.push(exactId);
      this.tokRenamed.push(renamedId);
      this.tokAbstract.push(kind === 'literal' ? interner.id('\u0001LIT') : renamedId);
      this.tokLine.push(startRow + 1);
      this.tokEnd.push(endRow + 1);
    }

    // Recursion: a call whose callee is the enclosing unit's own name.
    if (unit && isIdent && text === unit.info.simpleName) {
      const f = c.currentFieldName;
      if (f === 'function' || f === 'name' || f === 'property' || f === 'field' || f === 'method' || f === 'attribute') {
        const parent = c.currentNode.parent;
        const call = parent && (this.spec.callTypes.has(parent.type) ? parent : parent.parent);
        if (call && this.spec.callTypes.has(call.type) && !(unit as Acc & { recursive?: boolean }).recursive) {
          (unit as Acc & { recursive?: boolean }).recursive = true;
          unit.info.cognitive++;
        }
      }
    }
  }

  private checkMagic(c: TreeCursor, value: string, line: number): void {
    let n: Node | null = c.currentNode;
    // Negative allowed numbers (`-1`) are fine.
    if (n.parent?.type === 'unary_expression' && ALLOWED_NUMBERS.has('-' + value)) return;
    for (let i = 0; i < 8 && n; i++) {
      const t: string = n.type;
      if (this.spec.constantContextTypes.has(t)) return;
      if (/^(literal_type|enum|default_parameter|typed_default_parameter|assignment_pattern|optional_parameter|required_parameter|parameter|subscript_expression|subscript|index_expression|element_access_expression|array_access|case_pattern|switch_label|switch_case|match_pattern|range_expression|slice)/.test(t)) return;
      if (t === 'lexical_declaration' || t === 'variable_declaration' || t === 'local_declaration_statement' || t === 'field_declaration' || t === 'local_variable_declaration') {
        const text = n.text;
        if (/^\s*(export\s+)?const\b/.test(text) || /\b(final|const|readonly)\b/.test(text.slice(0, 80))) return;
        break;
      }
      if (t === 'assignment' && this.lang === 'python') {
        const left = n.childForFieldName('left');
        if (left && /^[A-Z][A-Z0-9_]*$/.test(left.text)) return;
        break;
      }
      if (t === 'expression_statement' || t.endsWith('_statement') || this.spec.functionTypes.has(t)) break;
      n = n.parent;
    }
    if (this.magic.length < 500) this.magic.push({ line, value });
  }

  private openUnit(node: Node, parent: Acc | null): Acc {
    const cls = this.classStack.length ? this.classStack[this.classStack.length - 1] : null;
    const isMethod = cls !== null && cls.owner === parent;
    const simple = functionName(node, this.lang);
    const name = isMethod && cls && this.lang !== 'go' ? `${cls.info.name}.${simple}` : simple;
    const bareName = simple.includes('.') ? simple.slice(simple.lastIndexOf('.') + 1) : simple;
    const vis = visibilityOf(node, this.lang, bareName);
    const info: FunctionInfo = {
      name,
      simpleName: bareName,
      className: isMethod && cls ? cls.info.name : null,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      loc: node.endPosition.row - node.startPosition.row + 1,
      sloc: 0,
      params: parameters(node, this.lang, isMethod),
      cyclomatic: 1,
      cognitive: 0,
      maxNesting: 0,
      halstead: halsteadOf(new Map(), new Map()),
      maintainability: 100,
      isPrivate: vis.private,
      decorated: vis.decorated,
      anonymous: this.spec.lambdaTypes.has(node.type),
    };
    const acc: Acc = { info, ops: new Map(), opnds: new Map(), isMethod, classAcc: isMethod ? cls : null };
    this.units.push(acc);
    return acc;
  }

  private closeUnit(acc: Acc): void {
    if (acc.classAcc) {
      acc.classAcc.info.methods++;
      acc.classAcc.info.wmc += acc.info.cyclomatic;
    }
  }

  finish(): void {
    for (const u of this.units) {
      const info = u.info;
      let sloc = 0;
      for (let r = info.line - 1; r <= info.endLine - 1; r++) if (this.code[r]) sloc++;
      info.sloc = sloc;
      info.halstead = halsteadOf(u.ops, u.opnds);
      info.maintainability = maintainabilityIndex(info.halstead.volume, info.cyclomatic, sloc);
    }
    // Go methods live outside the struct: attach them by receiver type.
    if (this.lang === 'go') {
      const byName = new Map(this.classes.map((c) => [c.info.name, c.info]));
      for (const u of this.units) {
        const dot = u.info.name.indexOf('.');
        if (dot > 0) {
          const cls = byName.get(u.info.name.slice(0, dot));
          if (cls) {
            cls.methods++;
            cls.wmc += u.info.cyclomatic;
            u.info.className = cls.name;
          }
        }
      }
    }
  }
}

export function analyzeTree(tree: Tree, lang: LanguageId, content: string, opts: AnalyzeOptions = {}): FileAnalysis {
  const lines = content.split('\n');
  const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length;
  const w = new Walker(lang, Math.max(lineCount, 1), opts);
  const cursor = tree.walk();
  try {
    w.visit(cursor, null, 0, 0, null, false);
  } finally {
    cursor.delete();
  }
  w.finish();

  let sloc = 0;
  let commentLines = 0;
  let blankLines = 0;
  for (let r = 0; r < lineCount; r++) {
    if (w.code[r]) sloc++;
    else if (w.comment[r]) commentLines++;
    else blankLines++;
  }
  const halstead = halsteadOf(w.fileOps, w.fileOpnds);
  // File MI: SLOC-weighted mean of its functions (the whole-file formula drives
  // any large module to 0 regardless of quality); module-level code only when
  // there are no functions.
  const weight = w.units.reduce((s, u) => s + Math.max(1, u.info.sloc), 0);
  const fileMI = weight
    ? Math.round((w.units.reduce((s, u) => s + u.info.maintainability * Math.max(1, u.info.sloc), 0) / weight) * 10) / 10
    : maintainabilityIndex(halstead.volume, 1, sloc);
  return {
    lang,
    loc: lineCount,
    sloc,
    commentLines,
    blankLines,
    functions: w.units.map((u) => u.info),
    classes: w.classes.map((c) => c.info),
    halstead,
    maintainability: fileMI,
    parseErrors: w.parseErrors,
    firstErrorLine: w.firstErrorLine,
    magicNumbers: w.magic,
    emptyCatches: [...new Set(w.emptyCatches)],
    tokens: w.tokens(),
    identifiers: w.identifiers ?? undefined,
  };
}

export async function analyzeSource(lang: LanguageId, content: string, opts: AnalyzeOptions = {}): Promise<FileAnalysis> {
  return withTree(lang, content, (tree) => analyzeTree(tree, lang, content, opts));
}
