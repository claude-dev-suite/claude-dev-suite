// SPDX-License-Identifier: MIT
/**
 * quality_gate — snapshot findings as a baseline, then report only what is
 * new against it and pass/fail on thresholds.
 *
 * Findings are keyed by a line-independent fingerprint (tool, file, rule,
 * symbol, message with numbers blanked), counted as a multiset, so moving code
 * around does not make old issues "new". Saving a baseline writes a file and
 * therefore needs `confirm: true`; without it the call is a dry run that
 * shows exactly what would be written.
 */

import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { assertWithinRoot } from '@dev-suite/shared';
import { resolveScope, type ScopeOptions } from '../core/files.js';
import { fingerprint, type Diagnostic, type Severity } from '../core/diagnostics.js';
import { bound, mdTable, notesSection, round, truncatedLine, type ToolResult } from '../core/report.js';
import { collectSmells } from './antipatterns.js';
import { computeClones } from './duplicates.js';
import { collectDeadCode } from './deadcode.js';
import { collectLint } from './lint.js';
import { computeCoverage } from './coverage.js';

export const GATE_CHECKS = ['antipatterns', 'duplicates', 'deadcode', 'lint', 'types', 'coverage'] as const;
export type GateCheck = (typeof GATE_CHECKS)[number];

export interface GateThresholds {
  maxNewIssues?: number;
  maxNewErrors?: number;
  maxTotalErrors?: number;
  maxDuplicationPercent?: number;
  minCoverage?: number;
  minPatchCoverage?: number;
}

export interface QualityGateInput extends ScopeOptions {
  action?: 'check' | 'save';
  baselineFile?: string;
  confirm?: boolean;
  overwrite?: boolean;
  checks?: GateCheck[];
  thresholds?: GateThresholds;
  limit?: number;
}

export interface GateItem {
  fp: string;
  check: GateCheck;
  tool: string;
  rule: string;
  file: string;
  line: number;
  severity: Severity;
  message: string;
}

interface Baseline {
  version: 1;
  createdAt: string;
  generator: string;
  checks: GateCheck[];
  metrics: Record<string, number | null>;
  items: GateItem[];
}

export const GATE_VERSION = 'code-quality/1.1.0';

function toItem(check: GateCheck, d: Diagnostic): GateItem {
  return { fp: fingerprint(d), check, tool: d.tool, rule: d.rule, file: d.file, line: d.line, severity: d.severity, message: d.message.split('\n')[0].slice(0, 300) };
}

async function collect(input: QualityGateInput, checks: GateCheck[]): Promise<{ items: GateItem[]; metrics: Record<string, number | null>; notes: string[]; failures: string[] }> {
  const items: GateItem[] = [];
  const metrics: Record<string, number | null> = {};
  const notes: string[] = [];
  const failures: string[] = [];
  const scope: ScopeOptions = { path: input.path, changedSince: input.changedSince, exclude: input.exclude, maxFiles: input.maxFiles, maxFileSizeKb: input.maxFileSizeKb, includeTests: input.includeTests };

  if (checks.includes('antipatterns')) {
    const r = await collectSmells({ ...scope, patterns: undefined });
    for (const d of r.diagnostics) {
      // Duplicates are gated by their own check, with a location-independent key.
      if (d.rule !== 'duplicate-code') items.push(toItem('antipatterns', d));
    }
    notes.push(...r.notes);
  }
  if (checks.includes('duplicates')) {
    const r = await computeClones({ ...scope });
    metrics.duplicationPercent = r.result.percentage;
    for (const g of r.groups) {
      const h = createHash('sha1').update(g.fragment.replace(/\s+/g, ' ')).digest('hex').slice(0, 12);
      for (const l of g.locations) {
        items.push({
          fp: fingerprint({ tool: 'code-quality', file: l.file, rule: 'duplicate-code', symbol: h, message: '' }),
          check: 'duplicates', tool: 'code-quality', rule: 'duplicate-code', file: l.file, line: l.startLine, severity: 'warning',
          message: `${g.lines} duplicated lines (${g.locations.length} copies)`,
        });
      }
    }
  }
  if (checks.includes('deadcode')) {
    const r = await collectDeadCode({ ...scope, confidence: 'medium' });
    for (const d of r.items) {
      items.push({
        fp: fingerprint({ tool: 'code-quality', file: d.file, rule: `unused-${d.kind}`, symbol: d.name, message: '' }),
        check: 'deadcode', tool: 'code-quality', rule: `unused-${d.kind}`, file: d.file, line: d.line, severity: 'info', message: `${d.kind} ${d.name}: ${d.reason}`,
      });
    }
  }
  for (const [check, cats] of [['lint', ['lint', 'format']], ['types', ['types']]] as const) {
    if (!checks.includes(check)) continue;
    const r = await collectLint({ ...scope }, [...cats]);
    for (const run of r.runs) {
      if (run.status === 'failed' || run.status === 'timeout') failures.push(`${run.tool}@${run.project}: ${run.status}${run.message ? ` — ${run.message}` : ''}`);
      else if (run.status !== 'ran') notes.push(`${check}: ${run.tool}@${run.project} ${run.status}${run.message ? ` (${run.message})` : ''}`);
    }
    if (!r.runs.some((x) => x.status === 'ran')) notes.push(`${check}: no tool ran — this check contributed nothing.`);
    for (const d of r.diagnostics) items.push(toItem(check, d));
  }
  if (checks.includes('coverage')) {
    const c = await computeCoverage({ ...scope });
    metrics.lineCoverage = c.totals.lineRate;
    metrics.branchCoverage = c.totals.branchRate;
    if (c.patch) metrics.patchCoverage = c.patch.rate;
    notes.push(...c.notes);
  }
  return { items, metrics, notes: [...new Set(notes)], failures };
}

function diffItems(current: GateItem[], baseline: GateItem[]): { added: GateItem[]; fixed: GateItem[] } {
  const base = new Map<string, number>();
  for (const b of baseline) base.set(b.fp, (base.get(b.fp) ?? 0) + 1);
  const added: GateItem[] = [];
  const seen = new Map<string, number>();
  for (const c of current) {
    const n = (seen.get(c.fp) ?? 0) + 1;
    seen.set(c.fp, n);
    if (n > (base.get(c.fp) ?? 0)) added.push(c);
  }
  const fixed: GateItem[] = [];
  const cur = new Map<string, number>();
  for (const c of current) cur.set(c.fp, (cur.get(c.fp) ?? 0) + 1);
  const used = new Map<string, number>();
  for (const b of baseline) {
    const n = (used.get(b.fp) ?? 0) + 1;
    used.set(b.fp, n);
    if (n > (cur.get(b.fp) ?? 0)) fixed.push(b);
  }
  return { added, fixed };
}

export async function qualityGate(input: QualityGateInput): Promise<ToolResult> {
  const limit = input.limit ?? 50;
  const scope = await resolveScope({ ...input, maxFiles: 1 });
  const root = scope.root;
  const baselinePath = assertWithinRoot(path.resolve(root, input.baselineFile ?? '.code-quality-baseline.json'), root);
  const checks: GateCheck[] = input.checks?.length ? [...new Set(input.checks)] : ['antipatterns', 'duplicates'];
  const action = input.action ?? 'check';

  if (action === 'save' && input.changedSince) {
    throw new Error('A baseline must describe the whole codebase: do not combine action "save" with changedSince.');
  }
  const { items, metrics, notes, failures } = await collect(input, checks);
  if (failures.length) notes.push(...failures.map((f) => `tool failure: ${f}`));

  if (action === 'save') {
    const exists = existsSync(baselinePath);
    const baseline: Baseline = { version: 1, createdAt: new Date().toISOString(), generator: GATE_VERSION, checks, metrics, items };
    const byCheck: Record<string, number> = {};
    for (const i of items) byCheck[i.check] = (byCheck[i.check] ?? 0) + 1;
    const rel = path.relative(root, baselinePath);
    const willWrite = input.confirm === true && (!exists || input.overwrite === true) && failures.length === 0;
    if (willWrite) {
      await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    }
    const status = willWrite
      ? 'written'
      : input.confirm && failures.length
        ? 'refused-tool-failures'
        : exists && input.confirm && !input.overwrite
          ? 'refused-exists'
          : 'dry-run';
    const data = { action, status, baselineFile: rel, exists, checks, metrics, items: items.length, byCheck, notes };
    const md = [
      '# Quality gate — baseline',
      '',
      status === 'written'
        ? `Baseline **written** to \`${rel}\` (${items.length} findings).`
        : status === 'refused-tool-failures'
          ? `**Not written**: ${failures.length} tool(s) failed, so the baseline would be incomplete. Fix them or drop those checks.`
          : status === 'refused-exists'
          ? `**Not written**: \`${rel}\` already exists. Pass \`overwrite: true\` to replace it.`
          : `**Dry run** — would ${exists ? 'overwrite' : 'create'} \`${rel}\` with ${items.length} findings. Pass \`confirm: true\`${exists ? ' and `overwrite: true`' : ''} to write it.`,
      '',
      mdTable(['Check', 'Findings'], Object.entries(byCheck)),
      '',
      `Metrics: ${Object.entries(metrics).map(([k, v]) => `${k}=${v ?? 'n/a'}`).join(', ') || 'none'}`,
      notesSection(notes),
    ];
    return { data, markdown: md.join('\n') };
  }

  let baseline: Baseline | null = null;
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8')) as Baseline;
      if (baseline.version !== 1 || !Array.isArray(baseline.items)) throw new Error('unsupported format');
    } catch (e) {
      throw new Error(`Baseline ${baselinePath} is unreadable: ${e instanceof Error ? e.message : String(e)}`);
    }
    const missing = checks.filter((c) => !baseline!.checks.includes(c));
    if (missing.length) notes.push(`The baseline was saved without check(s) ${missing.join(', ')}: all of their findings count as new.`);
  } else {
    notes.push('No baseline found — every finding counts as new. Save one with action "save" and confirm: true.');
  }
  const baseItems = (baseline?.items ?? []).filter((i) => checks.includes(i.check));
  // In diff mode only changed files were analysed: compare against the same slice of the baseline.
  const currentFiles = new Set(items.map((i) => i.file));
  const scopedBase = input.changedSince ? baseItems.filter((i) => currentFiles.has(i.file)) : baseItems;
  const { added, fixed } = diffItems(items, scopedBase);

  const t = input.thresholds ?? {};
  const reasons: string[] = [];
  const maxNew = t.maxNewIssues ?? 0;
  if (added.length > maxNew) reasons.push(`${added.length} new issue(s) (allowed ${maxNew})`);
  const newErrors = added.filter((a) => a.severity === 'error').length;
  if (t.maxNewErrors !== undefined && newErrors > t.maxNewErrors) reasons.push(`${newErrors} new error(s) (allowed ${t.maxNewErrors})`);
  const totalErrors = items.filter((a) => a.severity === 'error').length;
  if (t.maxTotalErrors !== undefined && totalErrors > t.maxTotalErrors) reasons.push(`${totalErrors} error(s) in total (allowed ${t.maxTotalErrors})`);
  const need = (metric: string, check: GateCheck) => {
    if (metrics[metric] === undefined) reasons.push(`threshold on ${metric} needs the "${check}" check`);
    else if (metrics[metric] === null) reasons.push(`${metric} could not be measured`);
  };
  if (t.maxDuplicationPercent !== undefined) {
    need('duplicationPercent', 'duplicates');
    if (typeof metrics.duplicationPercent === 'number' && metrics.duplicationPercent > t.maxDuplicationPercent) reasons.push(`duplication ${metrics.duplicationPercent}% > ${t.maxDuplicationPercent}%`);
  }
  if (t.minCoverage !== undefined) {
    need('lineCoverage', 'coverage');
    if (typeof metrics.lineCoverage === 'number' && metrics.lineCoverage < t.minCoverage) reasons.push(`line coverage ${metrics.lineCoverage}% < ${t.minCoverage}%`);
  }
  if (t.minPatchCoverage !== undefined) {
    if (!input.changedSince) reasons.push('minPatchCoverage needs changedSince');
    else {
      need('patchCoverage', 'coverage');
      if (typeof metrics.patchCoverage === 'number' && metrics.patchCoverage < t.minPatchCoverage) reasons.push(`patch coverage ${metrics.patchCoverage}% < ${t.minPatchCoverage}%`);
    }
  }
  if (failures.length) reasons.push(`${failures.length} tool(s) failed to run`);
  const passed = reasons.length === 0;

  const deltas: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(metrics)) {
    const b = baseline?.metrics?.[k];
    deltas[k] = typeof v === 'number' && typeof b === 'number' ? round(v - b, 2) : null;
  }
  const ba = bound(added, limit);
  const data = {
    action,
    passed,
    reasons,
    baselineFile: path.relative(root, baselinePath),
    baselineCreatedAt: baseline?.createdAt ?? null,
    checks,
    counts: { current: items.length, baseline: scopedBase.length, new: added.length, fixed: fixed.length },
    metrics,
    metricDeltas: deltas,
    newIssues: ba.items,
    truncated: ba.truncated,
    notes,
  };
  const md: string[] = [`# Quality gate: ${passed ? 'PASSED' : 'FAILED'}`, ''];
  md.push(`Baseline: \`${data.baselineFile}\`${baseline ? ` (${baseline.createdAt})` : ' (none)'} · checks: ${checks.join(', ')}`);
  md.push(`- Findings now ${items.length} · in baseline ${scopedBase.length} · **new ${added.length}** · fixed ${fixed.length}`);
  if (Object.keys(metrics).length) {
    md.push(`- Metrics: ${Object.entries(metrics).map(([k, v]) => `${k} ${v ?? 'n/a'}${deltas[k] !== null && deltas[k] !== undefined ? ` (${deltas[k]! >= 0 ? '+' : ''}${deltas[k]})` : ''}`).join(' · ')}`);
  }
  if (reasons.length) md.push('', '## Why it failed', '', ...reasons.map((r) => `- ${r}`));
  if (ba.items.length) {
    md.push('', '## New issues', '');
    md.push(mdTable(['Severity', 'Check', 'Location', 'Rule', 'Message'], ba.items.map((i) => [i.severity, i.check, `${i.file}:${i.line}`, i.rule, i.message])));
    md.push(truncatedLine(ba, 'new issues'));
  }
  md.push(notesSection(notes));
  return { data, markdown: md.join('\n') };
}
