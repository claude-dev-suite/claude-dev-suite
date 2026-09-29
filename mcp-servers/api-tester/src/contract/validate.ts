// SPDX-License-Identifier: MIT
/**
 * Contract testing: call each selected operation of a spec against a live
 * base URL and check status, content type and body schema.
 *
 * Only safe methods (GET/HEAD/OPTIONS) run by default. Write methods hit a
 * real API with generated data, so they need `includeWriteMethods: true`;
 * otherwise they are listed as skipped, and `dryRun` previews every request
 * exactly as it would be sent.
 */

import type { AuthSpec } from '../http/auth.js';
import { executeRequest, type VarContext, type RequestInput } from '../http/executor.js';
import { loadModel, operationLabel, matchesSelector, type ApiOperation } from '../spec/index.js';
import { buildSampleRequest, resolveBaseUrl, AUTH_VARS } from '../spec/request-builder.js';
import { checkConformance } from '../spec/conformance.js';
import { referencedVariables } from '../vars/substitute.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ContractOptions {
  specPath: string;
  baseUrl?: string;
  operations?: string[];
  tags?: string[];
  includeWriteMethods?: boolean;
  includeDeprecated?: boolean;
  dryRun?: boolean;
  auth?: AuthSpec;
  headers?: Record<string, string>;
  pathParams?: Record<string, string>;
  includeOptionalParams?: boolean;
  timeout?: number;
  concurrency?: number;
  limit?: number;
  insecure?: boolean;
}

export async function validateContract(opts: ContractOptions, ctx: VarContext): Promise<Record<string, unknown>> {
  const model = await loadModel(opts.specPath);
  const { baseUrl, needsVariable } = resolveBaseUrl(model, opts.baseUrl);
  if (needsVariable && !('baseUrl' in ctx.vars)) {
    throw new Error('The spec has no absolute server URL: pass baseUrl (or a baseUrl variable)');
  }

  let ops = model.operations;
  if (opts.operations?.length) ops = ops.filter((o) => opts.operations!.some((s) => matchesSelector(o, s)));
  if (opts.tags?.length) ops = ops.filter((o) => o.tags.some((t) => opts.tags!.includes(t)));
  if (!opts.includeDeprecated) ops = ops.filter((o) => !o.deprecated);
  if (ops.length === 0) {
    throw new Error(
      model.operations.length === 0
        ? 'The spec defines no operations'
        : 'No operation matched the given operations/tags (deprecated ones need includeDeprecated: true)'
    );
  }
  const limit = opts.limit ?? 100;
  const truncated = ops.length > limit;
  ops = ops.slice(0, limit);

  type Plan = { op: ApiOperation; request?: RequestInput; skip?: string; notes: string[] };
  const plans: Plan[] = ops.map((op) => {
    const notes: string[] = [];
    if (!SAFE.has(op.method) && !opts.includeWriteMethods) {
      return { op, skip: `${op.method} is a write method; pass includeWriteMethods: true to call it`, notes };
    }
    // Placeholders only when every credential variable they need is defined.
    const withPlaceholders = buildSampleRequest(model, op, { baseUrl, pathParams: opts.pathParams, includeOptionalParams: opts.includeOptionalParams, authMode: 'placeholders', explicitAuth: opts.auth });
    const needed = referencedVariables({ h: withPlaceholders.headers, q: withPlaceholders.query, a: withPlaceholders.auth }).filter((n) => Object.values(AUTH_VARS).includes(n));
    const canAuth = needed.every((n) => n in ctx.vars);
    const s = canAuth ? withPlaceholders : buildSampleRequest(model, op, { baseUrl, pathParams: opts.pathParams, includeOptionalParams: opts.includeOptionalParams, authMode: 'none' });
    if (s.authRequirements.length && !opts.auth && !canAuth) {
      notes.push(`Operation requires ${s.authRequirements.map((a) => a.scheme).join(' + ')}; no credentials given (pass auth or define ${needed.map((n) => `{{${n}}}`).join(', ')})`);
    }
    for (const p of op.parameters.filter((x) => x.in === 'path')) {
      if (!opts.pathParams?.[p.name]) notes.push(`Path parameter "${p.name}" uses a generated value (${s.pathParams[p.name]}); pass pathParams for a real id`);
    }
    return {
      op,
      notes,
      request: {
        method: op.method as RequestInput['method'],
        url: s.url,
        query: Object.keys(s.query).length ? s.query : undefined,
        headers: { ...s.headers, ...(opts.headers ?? {}) },
        body: s.body,
        bodyType: s.bodyType,
        contentType: s.contentType,
        auth: s.auth,
        timeout: opts.timeout ?? 15_000,
        insecure: opts.insecure,
        maxResponseBytes: 5 * 1024 * 1024,
      },
    };
  });

  if (opts.dryRun) {
    return {
      dryRun: true,
      spec: model.title,
      baseUrl,
      operations: plans.map((p) => ({
        operation: operationLabel(p.op),
        ...(p.skip ? { skipped: p.skip } : { wouldSend: ctx.redactor.scrub(p.request) }),
        notes: p.notes.length ? p.notes : undefined,
      })),
      truncated,
    };
  }

  const results: Array<Record<string, unknown>> = new Array(plans.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= plans.length) return;
      const p = plans[i];
      const label = operationLabel(p.op);
      if (p.skip) {
        results[i] = { operation: label, status: 'skipped', reason: p.skip };
        continue;
      }
      const r = await executeRequest(p.request!, ctx, { maxBodyChars: 500 });
      if (r.error || !r.observed) {
        results[i] = { operation: label, status: 'error', request: r.request, error: r.error, notes: p.notes.length ? p.notes : undefined };
        continue;
      }
      const c = checkConformance(model, p.op, { ...r.observed });
      results[i] = ctx.redactor.scrub({
        operation: label,
        status: c.conforms ? 'conforms' : 'violates',
        request: r.request,
        httpStatus: r.observed.status,
        matchedResponse: c.matchedResponse,
        timeMs: r.observed.timeMs,
        issues: c.issues.length ? c.issues : undefined,
        schemaErrors: c.schemaErrors.length ? c.schemaErrors : undefined,
        warnings: c.warnings.length ? c.warnings : undefined,
        notes: p.notes.length ? p.notes : undefined,
        bodyPreview: c.conforms ? undefined : r.observed.bodyText.slice(0, 300) || undefined,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, Math.max(1, plans.length)) }, worker));

  const count = (s: string) => results.filter((r) => r.status === s).length;
  const tested = count('conforms') + count('violates');
  return {
    spec: `${model.title} ${model.version}`.trim(),
    dialect: model.dialect,
    baseUrl,
    summary: {
      operations: results.length,
      conforming: count('conforms'),
      violating: count('violates'),
      errors: count('error'),
      skipped: count('skipped'),
      conformance: tested ? `${Math.round((count('conforms') / tested) * 100)}%` : 'n/a',
    },
    results,
    truncated,
    warnings: model.warnings.slice(0, 20),
  };
}
