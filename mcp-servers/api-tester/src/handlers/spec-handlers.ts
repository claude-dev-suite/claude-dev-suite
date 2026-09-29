// SPDX-License-Identifier: MIT
/** generate_tests, mock_server, validate_contract. */

import { z } from 'zod';
import { generateTests, generateTestCode, toBatchFormat, toScenario } from '../generators/test-generator.js';
import { startMockServer, stopMockServer, stopAllMockServers, listMockServers, mockLogs } from '../mock/server.js';
import { validateContract } from '../contract/validate.js';
import { AuthSchema } from '../http/auth.js';
import { buildVarContext, VariableFields } from '../http/executor.js';
import { requireAbsolute, resolveWritableProjectFile, writeFileAtomic } from '../util/paths.js';
import { truncateText } from '../util/limits.js';
import { jsonResponse, jsonResponseWithStatus, type Handler } from './types.js';

/** A spec is an absolute file path or an http(s) URL. */
function specSource(s: string): string {
  if (/^https?:\/\//i.test(s)) return s;
  return requireAbsolute(s);
}

export const GenerateTestsSchema = z.object({
  specPath: z.string().describe('OpenAPI 3.x / Swagger 2.0 spec: absolute path or http(s) URL (JSON or YAML)'),
  baseUrl: z.string().optional().describe('Override the server URL'),
  outputFormat: z
    .enum(['json', 'scenario', 'vitest', 'jest', 'pytest', 'http', 'curl', 'httpie'])
    .optional()
    .default('json')
    .describe('json (tests + batch requests), scenario (run_scenario input), or code'),
  filterTags: z.array(z.string()).optional().describe('Only operations with one of these tags'),
  operations: z.array(z.string()).optional().describe('Only these operations (operationId or "GET /path")'),
  includeNegativeTests: z.boolean().optional().default(true),
  maxTests: z.number().int().min(1).max(5000).optional().describe('Cap on generated tests (default 500)'),
  outputPath: z.string().optional().describe('Write the code/scenario to this project file instead of returning it'),
  overwrite: z.boolean().optional(),
  maxChars: z.number().int().min(1000).max(2_000_000).optional().describe('Returned output cap (default 150000)'),
});

export const handleGenerateTests: Handler = async (args) => {
  const input = GenerateTestsSchema.parse(args);
  const source = specSource(input.specPath);
  const result = await generateTests(source, {
    baseUrl: input.baseUrl,
    filterTags: input.filterTags,
    operations: input.operations,
    includeNegativeTests: input.includeNegativeTests,
    maxTests: input.maxTests,
  });
  const summary = {
    apiName: result.apiName,
    apiVersion: result.apiVersion,
    dialect: result.dialect,
    baseUrl: result.baseUrl,
    totalEndpoints: result.totalEndpoints,
    totalTests: result.totalTests,
    testsTruncated: result.truncated,
    coverage: result.coverage,
    byKind: result.tests.reduce<Record<string, number>>((acc, t) => ((acc[t.kind] = (acc[t.kind] ?? 0) + 1), acc), {}),
    warnings: result.warnings,
  };

  let content: string;
  let extra: Record<string, unknown> = {};
  if (input.outputFormat === 'json') {
    const full = { ...summary, tests: result.tests, batchRequests: toBatchFormat(result.tests) };
    if (!input.outputPath) {
      const text = JSON.stringify(full);
      if (text.length <= (input.maxChars ?? 150_000)) return jsonResponse(full);
      // Too large to inline: drop the heavy fields and say so.
      return jsonResponse({
        ...summary,
        tests: result.tests.map((t) => ({ name: t.name, kind: t.kind, method: t.method, path: t.path, expectedStatus: t.expectedStatus })),
        truncated: true,
        hint: 'Full output exceeds maxChars; pass outputPath, narrow with operations/filterTags, or use outputFormat "scenario"',
      });
    }
    content = JSON.stringify(full, null, 2);
  } else if (input.outputFormat === 'scenario') {
    const scenario = toScenario(result, source);
    if (result.baseUrlIsVariable) extra = { note: 'Steps use {{baseUrl}}; pass variables.baseUrl (or an environment) to run_scenario' };
    content = JSON.stringify(scenario, null, 2);
    extra = { ...extra, usage: 'Pass the scenario object to run_scenario (or its file via scenarioPath)' };
  } else {
    const code = generateTestCode(result, input.outputFormat);
    content = code.code;
    extra = { suggestedFilename: code.filename, requires: code.requires };
  }

  if (input.outputPath) {
    const target = await resolveWritableProjectFile(input.outputPath, input.overwrite === true);
    await writeFileAtomic(target.path, content);
    return jsonResponse({ ...summary, ...extra, written: target.path, replaced: target.exists, bytes: Buffer.byteLength(content) });
  }
  const t = truncateText(content, input.maxChars ?? 150_000);
  const field = input.outputFormat === 'scenario' ? 'scenario' : 'code';
  const value = input.outputFormat === 'scenario' && !t.truncated ? JSON.parse(content) : t.text;
  return jsonResponse({
    ...summary,
    ...extra,
    [field]: value,
    truncated: t.truncated,
    ...(t.truncated ? { totalChars: t.totalChars, hint: 'Pass outputPath to write the full file' } : {}),
  });
};

// ---------------------------------------------------------------------------

export const MockServerSchema = z.object({
  action: z.enum(['start', 'stop', 'list', 'logs']).describe('start | stop | list | logs'),
  specPath: z.string().optional().describe('start: spec path (absolute) or URL'),
  port: z.number().int().min(0).max(65535).optional().describe('start: port (default 4010, 0 = random); stop/logs: which server'),
  host: z.enum(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::']).optional().describe('start: bind address (default 127.0.0.1)'),
  portFallback: z.boolean().optional().describe('start: try the next free ports if taken (default only when port omitted)'),
  delay: z.number().int().min(0).max(120_000).optional().describe('start: response latency ms'),
  delayMax: z.number().int().min(0).max(120_000).optional().describe('start: random latency between delay and delayMax'),
  validateRequests: z.boolean().optional().describe('start: reject invalid requests with 400/415 (default true)'),
  validateAuth: z.boolean().optional().describe('start: require documented credentials, else 401 (default true)'),
  all: z.boolean().optional().describe('stop: stop every mock server'),
  limit: z.number().int().min(1).max(500).optional().describe('logs: entries to return (default 50)'),
  clear: z.boolean().optional().describe('logs: clear after reading'),
});

export const handleMockServer: Handler = async (args) => {
  const input = MockServerSchema.parse(args);
  switch (input.action) {
    case 'start': {
      if (!input.specPath) throw new Error('specPath is required for start');
      const r = await startMockServer(specSource(input.specPath), {
        port: input.port,
        host: input.host,
        portFallback: input.portFallback,
        delay: input.delay,
        delayMax: input.delayMax,
        validateRequests: input.validateRequests,
        validateAuth: input.validateAuth,
      });
      return jsonResponse({
        action: 'started',
        ...r,
        usage: 'Choose a response with header "Prefer: code=404" (or example=<name>), or ?__code=404',
      });
    }
    case 'stop': {
      if (input.all) return jsonResponse({ action: 'stopped', count: await stopAllMockServers() });
      if (input.port === undefined) throw new Error('port (or all: true) is required for stop');
      const ok = await stopMockServer(input.port);
      return jsonResponseWithStatus(
        { action: 'stopped', port: input.port, success: ok, ...(ok ? {} : { error: `No mock server on port ${input.port}` }) },
        !ok
      );
    }
    case 'list': {
      const servers = listMockServers();
      return jsonResponse({ action: 'list', servers, count: servers.length });
    }
    case 'logs': {
      if (input.port === undefined) throw new Error('port is required for logs');
      return jsonResponse({ action: 'logs', ...mockLogs(input.port, input.limit ?? 50, input.clear === true) });
    }
  }
};

// ---------------------------------------------------------------------------

export const ValidateContractSchema = z.object({
  specPath: z.string().describe('OpenAPI/Swagger spec: absolute path or URL'),
  baseUrl: z.string().optional().describe('Live API base URL (default: the spec server)'),
  operations: z.array(z.string()).optional().describe('operationIds or "GET /path" (default: all)'),
  tags: z.array(z.string()).optional(),
  includeWriteMethods: z.boolean().optional().describe('Also call POST/PUT/PATCH/DELETE with generated data (default false)'),
  includeDeprecated: z.boolean().optional(),
  dryRun: z.boolean().optional().describe('Only list the requests that would be sent'),
  auth: AuthSchema.optional(),
  headers: z.record(z.string(), z.string()).optional().describe('Extra headers on every request'),
  pathParams: z.record(z.string(), z.string()).optional().describe('Values for path parameters by name (e.g. real ids)'),
  includeOptionalParams: z.boolean().optional(),
  timeout: z.number().int().positive().max(120_000).optional().describe('Per-request timeout ms (default 15000)'),
  concurrency: z.number().int().min(1).max(10).optional().describe('Parallel requests (default 4)'),
  limit: z.number().int().min(1).max(500).optional().describe('Max operations (default 100)'),
  insecure: z.boolean().optional(),
  ...VariableFields,
});

export const handleValidateContract: Handler = async (args) => {
  const input = ValidateContractSchema.parse(args);
  const ctx = await buildVarContext(input);
  const { environment, variables, specPath, ...rest } = input;
  void environment;
  void variables;
  const result = await validateContract({ ...rest, specPath: specSource(specPath) }, ctx);
  // Violations are a result, not a tool failure: isError stays false.
  return jsonResponse(result);
};
