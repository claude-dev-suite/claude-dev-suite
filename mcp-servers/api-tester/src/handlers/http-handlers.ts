// SPDX-License-Identifier: MIT
/** http_request, health_check, batch_request. */

import { z } from 'zod';
import {
  RequestFields,
  VariableFields,
  OutputFields,
  AssertionSchema,
  buildVarContext,
  executeRequest,
  HTTP_METHODS,
} from '../http/executor.js';
import { jsonResponse, jsonResponseWithStatus, type Handler } from './types.js';

export const HttpRequestSchema = z.object({
  ...RequestFields,
  ...VariableFields,
  ...OutputFields,
  assert: z.array(AssertionSchema).max(100).optional().describe('Assertions evaluated on the response'),
});

export const HealthCheckSchema = z.object({
  url: z.string().min(1).describe('Base URL to check'),
  endpoints: z.array(z.string()).max(50).optional().describe('Paths to check (default: common health endpoints)'),
  timeout: z.number().int().positive().max(60_000).optional().describe('Per-endpoint timeout ms (default 5000)'),
  headers: z.record(z.string(), z.string()).optional(),
  insecure: z.boolean().optional(),
  ...VariableFields,
});

const BatchItemSchema = z.object({
  name: z.string().describe('Request name for identification'),
  ...RequestFields,
  assert: z.array(AssertionSchema).max(50).optional(),
});

export const BatchRequestSchema = z.object({
  requests: z.array(BatchItemSchema).max(200).describe('Requests to execute'),
  sequential: z.boolean().optional().default(false).describe('Run one after another instead of in parallel'),
  concurrency: z.number().int().min(1).max(20).optional().describe('Parallel mode: max in flight (default 5)'),
  stopOnFailure: z.boolean().optional().describe('Sequential mode: stop at the first failure'),
  ...VariableFields,
  maxBodyChars: z.number().int().min(0).max(100_000).optional().describe('Per-response body cap in output (default 2000)'),
});

export const handleHttpRequest: Handler = async (args) => {
  const input = HttpRequestSchema.parse(args);
  const ctx = await buildVarContext(input);
  const result = await executeRequest(input, ctx, { assert: input.assert, maxBodyChars: input.maxBodyChars });
  // A failed assertion is a result (passed: false); only a request that could not be made is an error.
  const failed = Boolean(result.error);
  return jsonResponseWithStatus(
    { ...result.output, ...(ctx.environment ? { environment: ctx.environment } : {}) },
    failed
  );
};

export const handleHealthCheck: Handler = async (args) => {
  const { url, endpoints, timeout, headers, insecure, environment, variables } = HealthCheckSchema.parse(args);
  const ctx = await buildVarContext({ environment, variables });
  const list = endpoints ?? ['/health', '/healthz', '/api/health', '/status', '/ping', '/'];
  const base = url.replace(/\/+$/, '');

  const results = await Promise.all(
    list.map(async (endpoint) => {
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const r = await executeRequest(
        { method: 'GET', url: `${base}${path}`, headers, insecure, timeout: timeout ?? 5000, maxResponseBytes: 64 * 1024 },
        ctx,
        { maxBodyChars: 300 }
      );
      const resp = r.output.response as { status: number; statusText: string; timing: { totalMs: number }; body?: unknown } | undefined;
      return {
        endpoint: path,
        status: resp?.status ?? 0,
        statusText: resp?.statusText ?? '',
        timing: resp?.timing.totalMs ?? 0,
        healthy: resp ? resp.status >= 200 && resp.status < 300 : false,
        ...(r.error ? { error: r.error } : { body: resp?.body }),
      };
    })
  );

  const healthy = results.filter((r) => r.healthy);
  return jsonResponse({
    baseUrl: ctx.redactor.scrubString(base),
    results,
    summary: {
      total: results.length,
      healthy: healthy.length,
      unhealthy: results.length - healthy.length,
      avgResponseTime: healthy.length ? Math.round(healthy.reduce((s, r) => s + r.timing, 0) / healthy.length) : 0,
    },
  });
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const handleBatchRequest: Handler = async (args) => {
  const input = BatchRequestSchema.parse(args);
  const ctx = await buildVarContext(input);
  const maxBodyChars = input.maxBodyChars ?? 2000;

  const run = async (req: z.infer<typeof BatchItemSchema>) => {
    const { name, assert, ...request } = req;
    const r = await executeRequest(request, ctx, { assert, maxBodyChars: Math.max(100, maxBodyChars) });
    const resp = r.output.response as Record<string, unknown> | undefined;
    return {
      name,
      method: r.request.method,
      url: r.request.url,
      success: r.passed,
      status: (resp?.status as number | undefined) ?? 0,
      timing: (resp?.timing as { totalMs: number } | undefined)?.totalMs ?? 0,
      ...(r.error ? { error: r.error } : {}),
      ...(maxBodyChars > 0 && resp ? { body: resp.body, bodyTruncated: resp.bodyTruncated } : {}),
      ...(r.assertions ? { assertions: r.assertions } : {}),
    };
  };

  let results: Array<Awaited<ReturnType<typeof run>> | { name: string; skipped: true; reason: string }>;
  if (input.sequential) {
    results = [];
    let stopped = false;
    for (const req of input.requests) {
      if (stopped) {
        results.push({ name: req.name, skipped: true, reason: 'stopOnFailure' });
        continue;
      }
      const r = await run(req);
      results.push(r);
      if (input.stopOnFailure && !r.success) stopped = true;
    }
  } else {
    results = await mapLimit(input.requests, input.concurrency ?? 5, run);
  }

  const executed = results.filter((r): r is Awaited<ReturnType<typeof run>> => !('skipped' in r));
  return jsonResponse({
    mode: input.sequential ? 'sequential' : 'parallel',
    ...(ctx.environment ? { environment: ctx.environment } : {}),
    results,
    summary: {
      total: results.length,
      successful: executed.filter((r) => r.success).length,
      failed: executed.filter((r) => !r.success).length,
      skipped: results.length - executed.length,
    },
  });
};

export { HTTP_METHODS };
