// SPDX-License-Identifier: MIT
/** environment, session, run_scenario, graphql_request, websocket, sse_listen, load_test. */

import { z } from 'zod';
import {
  listEnvironments,
  getEnvironment,
  upsertEnvironment,
  unsetVariables,
  activateEnvironment,
  deleteEnvironment,
} from '../vars/environments.js';
import { listSessions, peekSession, deleteSession } from '../http/cookies.js';
import { clearTokenCache, tokenCacheInfo, AuthSchema } from '../http/auth.js';
import { RequestFields, VariableFields, buildVarContext, executeRequest } from '../http/executor.js';
import { ScenarioSchema, loadScenarioFile, runScenario } from '../scenario/runner.js';
import { INTROSPECTION_QUERY, summariseSchema, schemaToSdl, type IntrospectionSchema } from '../graphql/graphql.js';
import { wsConnect, wsSend, wsReceive, wsClose, wsList } from '../realtime/websocket.js';
import { listenSse } from '../realtime/sse.js';
import { runLoadTest, LOAD_LIMITS } from '../load/load-test.js';
import { truncateText } from '../util/limits.js';
import { jsonResponse, jsonResponseWithStatus, type Handler } from './types.js';

// ---------------------------------------------------------------------------
// environment
// ---------------------------------------------------------------------------

export const EnvironmentSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'set', 'unset', 'activate', 'deactivate', 'delete']),
  name: z.string().optional().describe('Environment name (get defaults to the active one)'),
  variables: z.record(z.string(), z.unknown()).optional().describe('create/set: plain variables'),
  secrets: z.record(z.string(), z.string()).optional().describe('create/set: secret values (stored locally, never shown)'),
  keys: z.array(z.string()).optional().describe('unset: variable names to remove'),
  activate: z.boolean().optional().describe('create/set: make this the active environment'),
  confirm: z.boolean().optional().describe('delete: required to actually delete (otherwise a preview)'),
});

export const handleEnvironment: Handler = async (args) => {
  const input = EnvironmentSchema.parse(args);
  const need = () => {
    if (!input.name) throw new Error(`name is required for ${input.action}`);
    return input.name;
  };
  switch (input.action) {
    case 'list':
      return jsonResponse((await listEnvironments()) as object);
    case 'get':
      return jsonResponse((await getEnvironment(input.name)) as object);
    case 'create':
      return jsonResponse((await upsertEnvironment(need(), { variables: input.variables, secrets: input.secrets, create: true, activate: input.activate })) as object);
    case 'set':
      return jsonResponse((await upsertEnvironment(need(), { variables: input.variables, secrets: input.secrets, activate: input.activate })) as object);
    case 'unset':
      return jsonResponse((await unsetVariables(need(), input.keys ?? [])) as object);
    case 'activate':
      return jsonResponse((await activateEnvironment(need())) as object);
    case 'deactivate':
      return jsonResponse((await activateEnvironment(null)) as object);
    case 'delete':
      return jsonResponse((await deleteEnvironment(need(), input.confirm === true)) as object);
  }
};

// ---------------------------------------------------------------------------
// session (cookie jars + OAuth2 token cache)
// ---------------------------------------------------------------------------

export const SessionSchema = z.object({
  action: z.enum(['list', 'cookies', 'clear', 'clear_tokens']),
  name: z.string().optional().describe('cookies/clear: session name (clear without name clears all)'),
  showValues: z.boolean().optional().describe('cookies: include cookie values (default masked)'),
});

export const handleSession: Handler = async (args) => {
  const input = SessionSchema.parse(args);
  switch (input.action) {
    case 'list':
      return jsonResponse({ sessions: listSessions(), oauthTokens: tokenCacheInfo() });
    case 'cookies': {
      if (!input.name) throw new Error('name is required for cookies');
      const jar = peekSession(input.name);
      if (!jar) throw new Error(`No session "${input.name}"`);
      return jsonResponse({
        session: input.name,
        cookies: jar.list().map((c) => ({
          ...c,
          value: input.showValues ? c.value : c.value.length > 6 ? `${c.value.slice(0, 3)}…(${c.value.length} chars)` : '***',
          expires: c.expires ? new Date(c.expires).toISOString() : undefined,
        })),
      });
    }
    case 'clear':
      return jsonResponse({ cleared: deleteSession(input.name) });
    case 'clear_tokens':
      return jsonResponse({ clearedTokens: clearTokenCache() });
  }
};

// ---------------------------------------------------------------------------
// run_scenario
// ---------------------------------------------------------------------------

export const RunScenarioSchema = z.object({
  scenario: ScenarioSchema.optional().describe('Inline scenario'),
  scenarioPath: z.string().optional().describe('Or: absolute path to a scenario JSON/YAML file'),
  ...VariableFields,
  stopOnFailure: z.boolean().optional().describe('Override the scenario setting'),
  maxBodyChars: z.number().int().min(100).max(100_000).optional().describe('Body cap for failed-step previews (default 1000)'),
});

export const handleRunScenario: Handler = async (args) => {
  const input = RunScenarioSchema.parse(args);
  if (!input.scenario === !input.scenarioPath) throw new Error('Pass exactly one of scenario or scenarioPath');
  const scenario = input.scenario ?? (await loadScenarioFile(input.scenarioPath!));
  const ctx = await buildVarContext({ environment: input.environment });
  ctx.vars = { ...ctx.vars, ...(scenario.variables ?? {}), ...(input.variables ?? {}) };
  const report = await runScenario(scenario, ctx, { maxBodyChars: input.maxBodyChars, stopOnFailure: input.stopOnFailure });
  return jsonResponse(report);
};

// ---------------------------------------------------------------------------
// graphql_request
// ---------------------------------------------------------------------------

export const GraphqlSchema = z.object({
  url: z.string().describe('GraphQL endpoint'),
  action: z.enum(['query', 'introspect', 'sdl']).optional().describe('query (default), introspect (summary), sdl (schema text)'),
  query: z.string().optional().describe('Query or mutation document'),
  variables: z.record(z.string(), z.unknown()).optional().describe('GraphQL variables'),
  operationName: z.string().optional(),
  typeName: z.string().optional().describe('introspect: describe one type in detail'),
  headers: RequestFields.headers,
  auth: AuthSchema.optional(),
  timeout: RequestFields.timeout,
  insecure: RequestFields.insecure,
  session: RequestFields.session,
  environment: VariableFields.environment,
  vars: z.record(z.string(), z.unknown()).optional().describe('{{template}} variables (not GraphQL variables)'),
  maxChars: z.number().int().min(1000).max(1_000_000).optional().describe('Output cap (default 50000)'),
});

export const handleGraphql: Handler = async (args) => {
  const input = GraphqlSchema.parse(args);
  const action = input.action ?? 'query';
  const ctx = await buildVarContext({ environment: input.environment, variables: input.vars });
  const doc = action === 'query' ? input.query : INTROSPECTION_QUERY;
  if (!doc) throw new Error('query is required for action "query"');
  const maxChars = input.maxChars ?? 50_000;

  const r = await executeRequest(
    {
      method: 'POST',
      url: input.url,
      headers: { Accept: 'application/graphql-response+json, application/json', ...(input.headers ?? {}) },
      body: { query: doc, ...(input.variables && action === 'query' ? { variables: input.variables } : {}), ...(input.operationName && action === 'query' ? { operationName: input.operationName } : {}) },
      bodyType: 'json',
      auth: input.auth,
      timeout: input.timeout,
      insecure: input.insecure,
      session: input.session,
      maxResponseBytes: 50 * 1024 * 1024,
    },
    ctx,
    { maxBodyChars: maxChars }
  );
  if (r.error || !r.observed) return jsonResponseWithStatus({ error: r.error, request: r.request }, true);
  const o = r.observed;
  if (!o.bodyIsJson) {
    return jsonResponseWithStatus({ status: o.status, error: 'Response is not JSON', bodyPreview: o.bodyText.slice(0, 1000) }, true);
  }
  const body = o.body as { data?: unknown; errors?: unknown[]; extensions?: unknown };
  if (!body || typeof body !== 'object' || (!('data' in body) && !('errors' in body))) {
    // Not a GraphQL envelope (wrong URL, proxy error page…): never report it as an empty result.
    return jsonResponseWithStatus(
      { status: o.status, error: `Not a GraphQL response (HTTP ${o.status}): no "data" or "errors" field`, bodyPreview: o.bodyText.slice(0, 1000) },
      true
    );
  }

  if (action === 'query') {
    const data = JSON.stringify(body.data ?? null);
    const t = truncateText(data, maxChars);
    return jsonResponse(
      ctx.redactor.scrub({
        status: o.status,
        timeMs: o.timeMs,
        hasErrors: Array.isArray(body.errors) && body.errors.length > 0,
        errors: body.errors,
        data: t.truncated ? t.text : body.data,
        ...(t.truncated ? { dataTruncated: true, dataChars: t.totalChars } : {}),
        extensions: body.extensions,
      })
    );
  }

  const schema = (body.data as { __schema?: IntrospectionSchema } | undefined)?.__schema;
  if (!schema) {
    return jsonResponseWithStatus(
      { status: o.status, error: 'Introspection returned no __schema (disabled on this server?)', errors: body.errors },
      true
    );
  }
  if (action === 'sdl') {
    const t = truncateText(schemaToSdl(schema), maxChars);
    return jsonResponse({ status: o.status, sdl: t.text, truncated: t.truncated, totalChars: t.totalChars });
  }
  return jsonResponse({ status: o.status, ...summariseSchema(schema, { typeName: input.typeName }) });
};

// ---------------------------------------------------------------------------
// websocket
// ---------------------------------------------------------------------------

export const WebSocketSchema = z.object({
  action: z.enum(['connect', 'send', 'receive', 'close', 'list', 'exchange']),
  url: z.string().optional().describe('connect/exchange: ws:// or wss:// URL'),
  id: z.string().optional().describe('send/receive/close: connection id from connect'),
  headers: z.record(z.string(), z.string()).optional(),
  protocols: z.array(z.string()).optional().describe('Subprotocols'),
  auth: AuthSchema.optional(),
  session: z.string().optional().describe('Send cookies from this session'),
  insecure: z.boolean().optional(),
  caFile: z.string().optional(),
  message: z.unknown().optional().describe('send: text, or a value sent as JSON'),
  binaryBase64: z.string().optional().describe('send: binary frame (base64)'),
  messages: z.array(z.unknown()).max(100).optional().describe('exchange: messages to send after connecting'),
  waitMs: z.number().int().min(0).max(60_000).optional().describe('How long to collect messages (default 2000)'),
  untilCount: z.number().int().min(1).max(1000).optional().describe('Stop collecting after N inbound messages'),
  untilMatch: z.string().optional().describe('Stop collecting when a message matches this regex'),
  maxMessageChars: z.number().int().min(100).max(100_000).optional().describe('Per-message output cap (default 2000)'),
  timeout: z.number().int().positive().max(60_000).optional().describe('Handshake timeout ms (default 10000)'),
  ...VariableFields,
});

export const handleWebSocket: Handler = async (args) => {
  const input = WebSocketSchema.parse(args);
  const recv = (id: string, waitMs?: number) =>
    wsReceive(id, { waitMs: waitMs ?? input.waitMs, untilCount: input.untilCount, untilMatch: input.untilMatch, maxMessageChars: input.maxMessageChars });
  switch (input.action) {
    case 'list':
      return jsonResponse({ connections: wsList() });
    case 'connect':
    case 'exchange': {
      if (!input.url) throw new Error('url is required');
      const ctx = await buildVarContext(input);
      const conn = await wsConnect(
        { url: input.url, headers: input.headers, protocols: input.protocols, auth: input.auth, session: input.session, insecure: input.insecure, caFile: input.caFile, timeout: input.timeout },
        ctx
      );
      if (input.action === 'connect') {
        const initial = await recv(conn.id, input.waitMs ?? 0);
        return jsonResponse({ id: conn.id, url: conn.url, protocol: conn.ws.protocol || undefined, ...initial });
      }
      try {
        for (const m of input.messages ?? []) wsSend(conn.id, m);
        const received = await recv(conn.id, input.waitMs ?? 3000);
        return jsonResponse({ url: conn.url, ...received, id: undefined });
      } finally {
        await wsClose(conn.id).catch(() => undefined);
      }
    }
    case 'send': {
      if (!input.id) throw new Error('id is required');
      if (input.message === undefined && input.binaryBase64 === undefined) throw new Error('message or binaryBase64 is required');
      const sent = wsSend(input.id, input.message, input.binaryBase64);
      const received = await recv(input.id, input.waitMs ?? 1000);
      return jsonResponse({ sent: { seq: sent.seq, bytes: sent.bytes }, ...received });
    }
    case 'receive':
      if (!input.id) throw new Error('id is required');
      return jsonResponse(await recv(input.id));
    case 'close':
      if (!input.id) throw new Error('id is required');
      return jsonResponse(await wsClose(input.id));
  }
};

// ---------------------------------------------------------------------------
// sse_listen
// ---------------------------------------------------------------------------

export const SseSchema = z.object({
  url: RequestFields.url,
  method: z.enum(['GET', 'POST']).optional().describe('Default GET'),
  headers: RequestFields.headers,
  query: RequestFields.query,
  body: RequestFields.body,
  auth: AuthSchema.optional(),
  session: RequestFields.session,
  insecure: RequestFields.insecure,
  durationMs: z.number().int().min(100).max(60_000).optional().describe('Listen for this long (default 5000)'),
  maxEvents: z.number().int().min(1).max(1000).optional().describe('Stop after N events (default 50)'),
  events: z.array(z.string()).optional().describe('Only collect these event types'),
  lastEventId: z.string().optional().describe('Resume with Last-Event-ID'),
  maxDataChars: z.number().int().min(100).max(100_000).optional().describe('Per-event data cap (default 2000)'),
  ...VariableFields,
});

export const handleSse: Handler = async (args) => {
  const input = SseSchema.parse(args);
  const ctx = await buildVarContext(input);
  const result = await listenSse(
    {
      method: input.method ?? 'GET',
      url: input.url,
      headers: input.headers,
      query: input.query,
      body: input.body,
      auth: input.auth,
      session: input.session,
      insecure: input.insecure,
    },
    ctx,
    {
      durationMs: input.durationMs ?? 5000,
      maxEvents: input.maxEvents ?? 50,
      lastEventId: input.lastEventId,
      maxDataChars: input.maxDataChars ?? 2000,
      eventFilter: input.events,
    }
  );
  return jsonResponseWithStatus(result, typeof result.error === 'string' && !Array.isArray(result.events));
};

// ---------------------------------------------------------------------------
// load_test
// ---------------------------------------------------------------------------

export const LoadTestSchema = z.object({
  ...RequestFields,
  mode: z.enum(['concurrency', 'rps']).optional().describe('Fixed concurrency (default) or target requests/second'),
  concurrency: z.number().int().min(1).max(LOAD_LIMITS.maxConcurrency).optional().describe('Workers (default 5, max 50)'),
  rps: z.number().int().min(1).max(LOAD_LIMITS.maxRps).optional().describe('Target rate for mode rps (default 10, max 200)'),
  durationSec: z.number().int().min(1).max(LOAD_LIMITS.maxDurationSec).optional().describe('Default 10, max 60'),
  maxRequests: z.number().int().min(1).max(LOAD_LIMITS.maxRequests).optional().describe('Default and max 10000'),
  expectStatus: z.array(z.number().int()).optional().describe('Statuses counted as success (default < 400)'),
  ...VariableFields,
});

export const handleLoadTest: Handler = async (args) => {
  const input = LoadTestSchema.parse(args);
  const ctx = await buildVarContext(input);
  const { mode, concurrency, rps, durationSec, maxRequests, expectStatus, environment, variables, ...request } = input;
  void environment;
  void variables;
  const result = await runLoadTest(request, ctx, {
    mode: mode ?? 'concurrency',
    concurrency: concurrency ?? 5,
    rps: rps ?? 10,
    durationSec: durationSec ?? 10,
    maxRequests: maxRequests ?? LOAD_LIMITS.maxRequests,
    expectStatus,
  });
  return jsonResponse(result);
};
