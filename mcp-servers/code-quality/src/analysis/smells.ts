// SPDX-License-Identifier: MIT
/**
 * Structural code smells computed from the parsed units. Every threshold is
 * honoured (the old analyzers hard-coded theirs and ignored the argument).
 */

import type { Diagnostic, Severity } from '../core/diagnostics.js';
import type { LanguageId } from '../core/paths.js';
import type { ParsedFile } from './pipeline.js';

export const SMELL_TYPES = [
  'god-class',
  'long-method',
  'complex-method',
  'deep-nesting',
  'excessive-parameters',
  'magic-numbers',
  'empty-catch',
  'duplicate-code',
  'feature-envy',
  'data-clump',
  'primitive-obsession',
  'large-file',
] as const;
export type SmellType = (typeof SMELL_TYPES)[number];

export interface SmellThresholds {
  maxCyclomaticComplexity: number;
  maxCognitiveComplexity: number;
  maxFunctionLines: number;
  maxClassLines: number;
  maxClassMethods: number;
  maxClassComplexity: number;
  maxNestingDepth: number;
  maxParameters: number;
  maxFileLines: number;
  maxPrimitiveParameters: number;
  minDataClumpSize: number;
  minDataClumpOccurrences: number;
  minForeignAccesses: number;
}

export const DEFAULT_SMELL_THRESHOLDS: SmellThresholds = {
  maxCyclomaticComplexity: 10,
  maxCognitiveComplexity: 15,
  maxFunctionLines: 50,
  maxClassLines: 300,
  maxClassMethods: 20,
  maxClassComplexity: 50,
  maxNestingDepth: 4,
  maxParameters: 5,
  maxFileLines: 500,
  maxPrimitiveParameters: 3,
  minDataClumpSize: 3,
  minDataClumpOccurrences: 3,
  minForeignAccesses: 5,
};

const PRIMITIVE: Record<string, RegExp> = {
  javascript: /^(string|number|boolean|bigint)$/,
  typescript: /^(string|number|boolean|bigint)$/,
  tsx: /^(string|number|boolean|bigint)$/,
  python: /^(str|int|float|bool|bytes)$/,
  java: /^(int|long|short|byte|double|float|boolean|char|String|Integer|Long|Double|Float|Boolean)$/,
  csharp: /^(int|long|short|byte|double|float|decimal|bool|char|string|String)\??$/,
  go: /^(string|u?int(8|16|32|64)?|float(32|64)|bool|byte|rune|uintptr)$/,
  rust: /^&?(mut\s+)?('\w+\s+)?(str|String|[iu](8|16|32|64|128|size)|f32|f64|bool|char)$/,
};

function grade(value: number, limit: number): Severity {
  return value > limit * 2 ? 'error' : 'warning';
}

export function detectSmells(
  parsed: ParsedFile[],
  t: SmellThresholds,
  enabled: (type: SmellType) => boolean,
  reportable: (rel: string) => boolean
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const push = (d: Omit<Diagnostic, 'tool'>) => out.push({ ...d, tool: 'code-quality' });

  for (const p of parsed) {
    const rel = p.file.rel;
    if (!reportable(rel)) continue;
    const a = p.analysis;

    if (enabled('large-file') && a.loc > t.maxFileLines) {
      push({
        file: rel, line: 1, severity: grade(a.loc, t.maxFileLines), rule: 'large-file',
        message: `File has ${a.loc} lines (threshold ${t.maxFileLines})`,
        suggestion: 'Split the module by responsibility', details: { lines: a.loc, threshold: t.maxFileLines },
      });
    }

    for (const c of a.classes) {
      const reasons: string[] = [];
      if (c.loc > t.maxClassLines) reasons.push(`${c.loc} lines (> ${t.maxClassLines})`);
      if (c.methods > t.maxClassMethods) reasons.push(`${c.methods} methods (> ${t.maxClassMethods})`);
      if (c.wmc > t.maxClassComplexity) reasons.push(`total method complexity ${c.wmc} (> ${t.maxClassComplexity})`);
      if (enabled('god-class') && reasons.length) {
        push({
          file: rel, line: c.line, endLine: c.endLine, symbol: c.name,
          severity: reasons.length > 1 ? 'error' : 'warning', rule: 'god-class',
          message: `Class '${c.name}' is too large: ${reasons.join(', ')}`,
          suggestion: 'Split into smaller classes with single responsibilities',
          details: { lines: c.loc, methods: c.methods, wmc: c.wmc },
        });
      }
    }

    for (const f of a.functions) {
      const base = { file: rel, line: f.line, endLine: f.endLine, symbol: f.name };
      if (enabled('long-method') && f.loc > t.maxFunctionLines) {
        push({
          ...base, severity: grade(f.loc, t.maxFunctionLines), rule: 'long-method',
          message: `Function '${f.name}' is ${f.loc} lines long (threshold ${t.maxFunctionLines})`,
          suggestion: 'Extract cohesive blocks into well-named functions', details: { lines: f.loc },
        });
      }
      if (enabled('complex-method') && (f.cyclomatic > t.maxCyclomaticComplexity || f.cognitive > t.maxCognitiveComplexity)) {
        const worst = Math.max(f.cyclomatic / t.maxCyclomaticComplexity, f.cognitive / t.maxCognitiveComplexity);
        push({
          ...base, severity: worst > 2 ? 'error' : 'warning', rule: 'complex-method',
          message: `Function '${f.name}' is too complex (cyclomatic ${f.cyclomatic}/${t.maxCyclomaticComplexity}, cognitive ${f.cognitive}/${t.maxCognitiveComplexity})`,
          suggestion: 'Use guard clauses, extract conditions, or replace branching with polymorphism/lookup tables',
          details: { cyclomatic: f.cyclomatic, cognitive: f.cognitive },
        });
      }
      if (enabled('deep-nesting') && f.maxNesting > t.maxNestingDepth) {
        push({
          ...base, severity: f.maxNesting > t.maxNestingDepth + 2 ? 'error' : 'warning', rule: 'deep-nesting',
          message: `Function '${f.name}' nests control flow ${f.maxNesting} levels deep (threshold ${t.maxNestingDepth})`,
          suggestion: 'Return early, invert conditions, or extract the inner block', details: { depth: f.maxNesting },
        });
      }
      if (enabled('excessive-parameters') && f.params.length > t.maxParameters) {
        push({
          ...base, severity: f.params.length > t.maxParameters + 2 ? 'error' : 'warning', rule: 'excessive-parameters',
          message: `Function '${f.name}' takes ${f.params.length} parameters (threshold ${t.maxParameters})`,
          suggestion: 'Group related parameters into an object/struct', details: { count: f.params.length },
        });
      }
      if (enabled('primitive-obsession')) {
        const re = PRIMITIVE[p.file.lang as LanguageId];
        const prim = f.params.filter((x) => x.type && re.test(x.type.trim()));
        if (prim.length > t.maxPrimitiveParameters && prim.length / f.params.length >= 0.75) {
          push({
            ...base, severity: 'info', rule: 'primitive-obsession',
            message: `Function '${f.name}' takes ${prim.length} primitive parameters (${prim.map((x) => `${x.name}: ${x.type}`).slice(0, 6).join(', ')})`,
            suggestion: 'Introduce a value object for the concept these primitives describe',
            details: { primitives: prim.length },
          });
        }
      }
      if (enabled('feature-envy') && f.memberAccess) {
        const paramNames = new Set(f.params.map((x) => x.name.replace(/^\.\.\./, '')));
        let target = '';
        let max = 0;
        for (const [name, n] of Object.entries(f.memberAccess.foreign)) {
          if (paramNames.has(name) && n > max) {
            max = n;
            target = name;
          }
        }
        if (max >= t.minForeignAccesses && max > f.memberAccess.own * 2) {
          push({
            ...base, severity: 'info', rule: 'feature-envy',
            message: `Method '${f.name}' uses '${target}' ${max} times but its own members ${f.memberAccess.own} times`,
            suggestion: `Consider moving this logic onto ${target}'s type`,
            details: { target, foreign: max, own: f.memberAccess.own },
          });
        }
      }
    }

    if (enabled('empty-catch')) {
      for (const lineNo of a.emptyCatches) {
        push({
          file: rel, line: lineNo, severity: 'warning', rule: 'empty-catch',
          message: 'Empty catch/except block silently swallows errors',
          suggestion: 'Handle, log or rethrow the error — or add a comment explaining why it is ignored',
        });
      }
    }
    if (enabled('magic-numbers') && !p.file.isTest && a.magicNumbers.length) {
      const byValue = new Map<string, number[]>();
      for (const m of a.magicNumbers) byValue.set(m.value, [...(byValue.get(m.value) ?? []), m.line]);
      for (const [value, lines] of byValue) {
        push({
          file: rel, line: lines[0], severity: 'info', rule: 'magic-numbers', symbol: value,
          message: `Magic number ${value}${lines.length > 1 ? ` used ${lines.length} times (lines ${lines.slice(0, 6).join(', ')})` : ''}`,
          suggestion: 'Extract to a named constant', details: { value, lines },
        });
      }
    }
  }

  if (enabled('data-clump')) out.push(...dataClumps(parsed, t, reportable));
  return out;
}

function combos(names: string[], k: number): string[][] {
  const out: string[][] = [];
  const rec = (start: number, acc: string[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < names.length; i++) rec(i + 1, [...acc, names[i]]);
  };
  rec(0, []);
  return out;
}

/** The same group of parameter names recurring across functions: a missing type. */
function dataClumps(parsed: ParsedFile[], t: SmellThresholds, reportable: (rel: string) => boolean): Diagnostic[] {
  const k = Math.max(2, t.minDataClumpSize);
  const byCombo = new Map<string, Array<{ file: string; name: string; line: number }>>();
  for (const p of parsed) {
    for (const f of p.analysis.functions) {
      const names = [...new Set(f.params.map((x) => x.name.replace(/^[.*&]+/, '').trim()).filter((n) => n.length > 1 && !/[^\w$]/.test(n)))].sort();
      if (names.length < k) continue;
      for (const c of combos(names.slice(0, 8), k)) {
        const key = c.join(',');
        const list = byCombo.get(key) ?? [];
        list.push({ file: p.file.rel, name: f.name, line: f.line });
        byCombo.set(key, list);
      }
    }
  }
  // Merge combos shared by exactly the same functions into one clump.
  const bySig = new Map<string, { names: Set<string>; members: Array<{ file: string; name: string; line: number }> }>();
  for (const [key, members] of byCombo) {
    const uniq = [...new Map(members.map((m) => [`${m.file}:${m.name}:${m.line}`, m])).values()];
    if (uniq.length < t.minDataClumpOccurrences) continue;
    const sig = uniq.map((m) => `${m.file}:${m.line}`).sort().join('|');
    const entry = bySig.get(sig) ?? { names: new Set<string>(), members: uniq };
    for (const n of key.split(',')) entry.names.add(n);
    bySig.set(sig, entry);
  }
  const out: Diagnostic[] = [];
  for (const { names, members } of bySig.values()) {
    const first = members.find((m) => reportable(m.file));
    if (!first) continue;
    const others = members.filter((m) => m !== first).slice(0, 5).map((m) => `${m.file}:${m.line} ${m.name}`);
    out.push({
      tool: 'code-quality', file: first.file, line: first.line, symbol: [...names].sort().join(','), severity: 'info', rule: 'data-clump',
      message: `Parameters (${[...names].sort().join(', ')}) travel together in ${members.length} functions: ${others.join('; ')}`,
      suggestion: 'Introduce a parameter object/type for this group',
      details: { names: [...names], occurrences: members.length },
    });
  }
  return out;
}
