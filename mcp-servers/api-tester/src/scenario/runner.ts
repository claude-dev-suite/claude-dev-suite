// SPDX-License-Identifier: MIT
/**
 * Scenario runner: ordered steps, per-step assertions, value extraction into
 * variables (JSONPath / header / regex / status / body / cookie), retries for
 * polling, stop-on-failure, and a per-step report. All steps share one cookie
 * jar, so login-then-call flows work.
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { RequestFields, AssertionSchema, executeRequest, type VarContext, type ObservedResponse, type RequestInput } from '../http/executor.js';
import { AuthSchema } from '../http/auth.js';
import { getSessionJar, deleteSession } from '../http/cookies.js';
import { query } from '../assertions/jsonpath.js';
import { substituteString } from '../vars/substitute.js';
import { parseDocument } from '../spec/loader.js';
import { requireAbsolute } from '../util/paths.js';
import { previewValue } from '../util/limits.js';

export const ExtractSchema = z.object({
  var: z.string().min(1).describe('Variable to set'),
  from: z.enum(['jsonpath', 'header', 'regex', 'status', 'body', 'cookie']),
  path: z.string().optional().describe('JSONPath, header name or cookie name'),
  pattern: z.string().optional().describe('regex: applied to the body text'),
  group: z.number().int().min(0).optional().describe('regex capture group (default 1, or 0 if none)'),
  secret: z.boolean().optional().describe('Mask the value in the report'),
  optional: z.boolean().optional().describe('Do not fail the step when nothing matches'),
});

const StepRequestSchema = z.object({
  ...RequestFields,
  method: RequestFields.method.optional().describe('Default GET'),
});

export const StepSchema = z.object({
  name: z.string().min(1),
  request: StepRequestSchema,
  assert: z.array(AssertionSchema).max(50).optional(),
  extract: z.array(ExtractSchema).max(50).optional(),
  skip: z.boolean().optional(),
  delayMs: z.number().int().min(0).max(60_000).optional().describe('Wait before the step'),
  retry: z
    .object({
      count: z.number().int().min(1).max(20),
      delayMs: z.number().int().min(0).max(60_000).optional(),
    })
    .optional()
    .describe('Retry until assertions pass (polling)'),
  continueOnFailure: z.boolean().optional(),
});

export const ScenarioSchema = z.object({
  name: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  stopOnFailure: z.boolean().optional().describe('Default true'),
  session: z.string().max(64).optional().describe('Reuse a named cookie session (default: fresh per run)'),
  defaults: z
    .object({
      baseUrl: z.string().optional().describe('Prefix for step URLs starting with "/"'),
      headers: z.record(z.string(), z.string()).optional(),
      auth: AuthSchema.optional(),
      timeout: z.number().int().positive().max(300_000).optional(),
      insecure: z.boolean().optional(),
    })
    .optional(),
  steps: z.array(StepSchema).min(1).max(200),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
type Step = z.infer<typeof StepSchema>;

export async function loadScenarioFile(path: string): Promise<Scenario> {
  const abs = requireAbsolute(path);
  const doc = parseDocument(await readFile(abs, 'utf8'), abs);
  return ScenarioSchema.parse(doc);
}

function extractValue(e: z.infer<typeof ExtractSchema>, o: ObservedResponse, jarCookies: () => Record<string, string>): { found: boolean; value?: unknown; error?: string } {
  switch (e.from) {
    case 'status':
      return { found: true, value: o.status };
    case 'body':
      return { found: true, value: o.bodyIsJson ? o.body : o.bodyText };
    case 'header': {
      if (!e.path) return { found: false, error: 'header extraction needs path' };
      const v = o.headers[e.path.toLowerCase()];
      return { found: v !== undefined, value: v };
    }
    case 'jsonpath': {
      if (!e.path) return { found: false, error: 'jsonpath extraction needs path' };
      if (!o.bodyIsJson) return { found: false, error: 'response body is not JSON' };
      try {
        const q = query(o.body, e.path);
        return { found: q.found, value: q.value };
      } catch (err) {
        return { found: false, error: `Invalid JSONPath: ${(err as Error).message}` };
      }
    }
    case 'regex': {
      if (!e.pattern) return { found: false, error: 'regex extraction needs pattern' };
      let re: RegExp;
      try {
        re = new RegExp(e.pattern);
      } catch (err) {
        return { found: false, error: `Invalid regex: ${(err as Error).message}` };
      }
      const m = re.exec(o.bodyText);
      if (!m) return { found: false };
      const g = e.group ?? (m.length > 1 ? 1 : 0);
      return { found: m[g] !== undefined, value: m[g] };
    }
    case 'cookie': {
      if (!e.path) return { found: false, error: 'cookie extraction needs path (cookie name)' };
      const all = jarCookies();
      if (e.path in all) return { found: true, value: all[e.path] };
      for (const sc of o.setCookie) {
        const [pair] = sc.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0 && pair.slice(0, idx).trim() === e.path) return { found: true, value: pair.slice(idx + 1).trim() };
      }
      return { found: false };
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runScenario(
  scenario: Scenario,
  ctx: VarContext,
  opts: { maxBodyChars?: number; stopOnFailure?: boolean } = {}
): Promise<Record<string, unknown>> {
  const started = Date.now();
  // Precedence (caller-built): environment < scenario.variables < run-time variables < extracted values.
  const vars = ctx.vars;
  const ownSession = !scenario.session;
  const session = scenario.session ?? `scenario-${randomUUID()}`;
  const jar = getSessionJar(session);
  const stopOnFailure = opts.stopOnFailure ?? scenario.stopOnFailure ?? true;
  const d = scenario.defaults ?? {};
  const steps: Array<Record<string, unknown>> = [];
  let stopped = false;

  try {
    for (const step of scenario.steps as Step[]) {
      if (stopped || step.skip) {
        steps.push({ name: step.name, status: 'skipped', reason: step.skip ? 'skip: true' : 'a previous step failed (stopOnFailure)' });
        continue;
      }
      if (step.delayMs) await sleep(step.delayMs);

      // Resolve first, so an extracted relative path ({{next}} = "/users/7") also gets the base URL.
      let url = substituteString(step.request.url, vars).value;
      if (d.baseUrl && url.startsWith('/')) url = substituteString(d.baseUrl, vars).value.replace(/\/+$/, '') + url;
      const request: RequestInput = {
        ...step.request,
        method: step.request.method ?? 'GET',
        url,
        headers: { ...(d.headers ?? {}), ...(step.request.headers ?? {}) },
        auth: step.request.auth ?? d.auth,
        timeout: step.request.timeout ?? d.timeout,
        insecure: step.request.insecure ?? d.insecure,
        session,
      };

      const attempts = (step.retry?.count ?? 0) + 1;
      let result = await executeRequest(request, ctx, { assert: step.assert, maxBodyChars: opts.maxBodyChars ?? 1000 });
      let attempt = 1;
      while (attempt < attempts && (result.error || !result.passed)) {
        await sleep(step.retry?.delayMs ?? 1000);
        attempt++;
        result = await executeRequest(request, ctx, { assert: step.assert, maxBodyChars: opts.maxBodyChars ?? 1000 });
      }

      const report: Record<string, unknown> = {
        name: step.name,
        request: result.request,
        ...(attempts > 1 ? { attempts: attempt } : {}),
      };
      if (result.error || !result.observed) {
        report.status = 'error';
        report.error = result.error;
        steps.push(report);
        if (stopOnFailure && !step.continueOnFailure) stopped = true;
        continue;
      }
      const o = result.observed;
      report.httpStatus = o.status;
      report.timeMs = o.timeMs;
      const assertions = result.assertions ?? [];
      const failedAssertions = assertions.filter((a) => !a.passed);
      // Without assertions, a step passes on any non-error HTTP status.
      let passed = step.assert?.length ? failedAssertions.length === 0 : o.status < 400;

      const extracted: Record<string, unknown> = {};
      const extractErrors: string[] = [];
      for (const e of step.extract ?? []) {
        const r = extractValue(e, o, () => Object.fromEntries(jar.list().map((c) => [c.name, c.value])));
        if (r.error || !r.found) {
          if (!e.optional) extractErrors.push(`${e.var}: ${r.error ?? `nothing matched (${e.from}${e.path ? ` ${e.path}` : ''}${e.pattern ? ` /${e.pattern}/` : ''})`}`);
          continue;
        }
        vars[e.var] = r.value;
        if (e.secret) ctx.redactor.add(typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
        extracted[e.var] = e.secret ? '***' : previewValue(r.value, 200);
      }
      if (extractErrors.length) passed = false;

      report.status = passed ? 'passed' : 'failed';
      if (assertions.length) {
        report.assertions = { total: assertions.length, passed: assertions.length - failedAssertions.length };
        if (failedAssertions.length) report.failedAssertions = failedAssertions;
      }
      if (Object.keys(extracted).length) report.extracted = extracted;
      if (extractErrors.length) report.extractErrors = extractErrors;
      if (!passed) {
        const resp = result.output.response as Record<string, unknown> | undefined;
        report.responseBody = resp?.body;
      }
      steps.push(ctx.redactor.scrub(report));
      if (!passed && stopOnFailure && !step.continueOnFailure) stopped = true;
    }
  } finally {
    if (ownSession) deleteSession(session);
  }

  const count = (s: string) => steps.filter((x) => x.status === s).length;
  return {
    scenario: scenario.name ?? 'scenario',
    ...(ctx.environment ? { environment: ctx.environment } : {}),
    passed: count('failed') === 0 && count('error') === 0,
    summary: {
      steps: steps.length,
      passed: count('passed'),
      failed: count('failed'),
      errors: count('error'),
      skipped: count('skipped'),
      durationMs: Date.now() - started,
    },
    steps,
    ...(scenario.session ? { session } : {}),
  };
}
