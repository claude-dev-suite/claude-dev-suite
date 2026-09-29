// SPDX-License-Identifier: MIT
/**
 * Architecture boundary rules in the style of dependency-cruiser.
 *
 * `forbidden` rules flag every dependency matching both `from` and `to`;
 * with `allowed` rules, every dependency matching none of them is flagged.
 * Paths are regular expressions over repo-relative POSIX paths; `$1`…`$9` in a
 * `to` pattern refer to groups captured by `from.path` (e.g. "a feature may
 * only import its own folder").
 */

import type { Severity } from '../core/diagnostics.js';

export interface PathMatcher {
  path?: string;
  pathNot?: string;
}

export interface BoundaryRule {
  name: string;
  severity?: 'error' | 'warn' | 'info';
  comment?: string;
  from?: PathMatcher;
  to?: PathMatcher & {
    /** Match third-party packages (true) or only internal files (false). */
    external?: boolean;
    /** Regex on the external package name. */
    package?: string;
    /** Only dependencies that are part of an import cycle. */
    circular?: boolean;
    /** Only type-only imports (true) or only runtime imports (false). */
    typeOnly?: boolean;
  };
}

export interface BoundaryConfig {
  forbidden?: BoundaryRule[];
  allowed?: BoundaryRule[];
  allowedSeverity?: 'error' | 'warn' | 'info';
}

export interface Dependency {
  from: string;
  /** Repo-relative path for files, package name for externals. */
  to: string;
  external: boolean;
  circular: boolean;
  typeOnly: boolean;
  line: number;
}

export interface Violation {
  rule: string;
  severity: Severity;
  from: string;
  to: string;
  line: number;
  comment?: string;
}

const MAX_PATTERN = 500;

function compile(re: string | undefined, where: string): RegExp | null {
  if (re === undefined) return null;
  if (re.length > MAX_PATTERN) throw new Error(`Boundary rule ${where}: pattern longer than ${MAX_PATTERN} characters`);
  try {
    return new RegExp(re);
  } catch (e) {
    throw new Error(`Boundary rule ${where}: invalid regular expression: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledRule {
  rule: BoundaryRule;
  from: RegExp | null;
  fromNot: RegExp | null;
  to: string | undefined;
  toNot: string | undefined;
  pkg: RegExp | null;
}

function compileRule(rule: BoundaryRule, kind: string, i: number): CompiledRule {
  const where = `${kind}[${i}] "${rule.name}"`;
  // `to` patterns may reference `from` groups, so they are compiled per match.
  if (rule.to?.path) compile(rule.to.path.replace(/\$\d/g, 'x'), `${where}.to.path`);
  if (rule.to?.pathNot) compile(rule.to.pathNot.replace(/\$\d/g, 'x'), `${where}.to.pathNot`);
  return {
    rule,
    from: compile(rule.from?.path, `${where}.from.path`),
    fromNot: compile(rule.from?.pathNot, `${where}.from.pathNot`),
    to: rule.to?.path,
    toNot: rule.to?.pathNot,
    pkg: compile(rule.to?.package, `${where}.to.package`),
  };
}

function substitute(pattern: string, groups: RegExpExecArray | null): RegExp {
  const s = pattern.replace(/\$(\d)/g, (_, d) => (groups && groups[Number(d)] !== undefined ? escapeRe(groups[Number(d)]) : ''));
  return new RegExp(s);
}

function matches(c: CompiledRule, dep: Dependency): boolean {
  let groups: RegExpExecArray | null = null;
  if (c.from) {
    groups = c.from.exec(dep.from);
    if (!groups) return false;
  }
  if (c.fromNot && c.fromNot.test(dep.from)) return false;
  const to = c.rule.to ?? {};
  const externalOnly = to.external === true || c.pkg !== null;
  const internalOnly = to.external === false || (!externalOnly && Boolean(c.to || c.toNot));
  if (externalOnly && !dep.external) return false;
  if (internalOnly && dep.external) return false;
  if (c.pkg && !c.pkg.test(dep.to)) return false;
  if (c.to && !substitute(c.to, groups).test(dep.to)) return false;
  if (c.toNot && substitute(c.toNot, groups).test(dep.to)) return false;
  if (to.circular !== undefined && to.circular !== dep.circular) return false;
  if (to.typeOnly !== undefined && to.typeOnly !== dep.typeOnly) return false;
  return true;
}

function sev(s: string | undefined, fallback: Severity): Severity {
  return s === 'error' ? 'error' : s === 'info' ? 'info' : s === 'warn' ? 'warning' : fallback;
}

export function checkBoundaries(config: BoundaryConfig, deps: Dependency[]): Violation[] {
  const forbidden = (config.forbidden ?? []).map((r, i) => compileRule(r, 'forbidden', i));
  const allowed = (config.allowed ?? []).map((r, i) => compileRule(r, 'allowed', i));
  const allowedCoversExternal = allowed.some((c) => c.rule.to?.external === true || c.pkg !== null);
  const out: Violation[] = [];
  for (const dep of deps) {
    for (const c of forbidden) {
      if (matches(c, dep)) {
        out.push({ rule: c.rule.name, severity: sev(c.rule.severity, 'error'), from: dep.from, to: dep.to, line: dep.line, comment: c.rule.comment });
      }
    }
    if (allowed.length && (!dep.external || allowedCoversExternal) && !allowed.some((c) => matches(c, dep))) {
      out.push({ rule: 'not-in-allowed', severity: sev(config.allowedSeverity, 'warning'), from: dep.from, to: dep.to, line: dep.line });
    }
  }
  return out;
}
