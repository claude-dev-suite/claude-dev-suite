// SPDX-License-Identifier: MIT
/**
 * API Tester MCP Server
 *
 * HTTP/GraphQL/WebSocket/SSE requests with auth helpers, environments and
 * assertions; multi-step scenarios; collection import/export (Postman,
 * Insomnia, Bruno, .http, HAR, OpenAPI); OpenAPI test generation, contract
 * validation and mock servers; a light, bounded load test.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { handlers, schemas, errorResponse, toInputSchema, type ToolName } from './handlers/index.js';
import { stopAllMockServers } from './mock/server.js';
import { closeAllWebSockets } from './realtime/websocket.js';

const server = new Server(
  {
    name: 'api-tester-server',
    version: '2.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [
  {
    name: 'http_request',
    description: 'Send an HTTP request (any body type, auth, env vars, cookies, TLS/proxy) and assert on the response',
    inputSchema: toInputSchema(schemas.http_request),
  },
  {
    name: 'health_check',
    description: 'Probe common health endpoints (or given paths) of a base URL and report status and latency',
    inputSchema: toInputSchema(schemas.health_check),
  },
  {
    name: 'batch_request',
    description: 'Run many requests in parallel or in sequence, each with optional assertions',
    inputSchema: toInputSchema(schemas.batch_request),
  },
  {
    name: 'import_collection',
    description: 'Import Postman, Insomnia, Bruno, .http/.rest, HAR or OpenAPI into runnable requests and variables',
    inputSchema: toInputSchema(schemas.import_collection),
  },
  {
    name: 'export_collection',
    description: 'Export requests (or any importable source) as a Postman v2.1 collection or a .http file',
    inputSchema: toInputSchema(schemas.export_collection),
  },
  {
    name: 'generate_tests',
    description: 'Generate positive/negative tests with schema checks from OpenAPI 2/3.x as Vitest, Jest, pytest, .http or scenario',
    inputSchema: toInputSchema(schemas.generate_tests),
  },
  {
    name: 'mock_server',
    description: 'Start/stop/list OpenAPI mock servers with request validation, examples, Prefer codes, latency, logs',
    inputSchema: toInputSchema(schemas.mock_server),
  },
  {
    name: 'validate_contract',
    description: 'Call spec operations on a live API and check status, content type and body schema against OpenAPI',
    inputSchema: toInputSchema(schemas.validate_contract),
  },
  {
    name: 'environment',
    description: 'Manage named environments of {{variables}} stored in the project; secret values are never shown',
    inputSchema: toInputSchema(schemas.environment),
  },
  {
    name: 'session',
    description: 'List or clear cookie-jar sessions and the cached OAuth2 tokens',
    inputSchema: toInputSchema(schemas.session),
  },
  {
    name: 'run_scenario',
    description: 'Run ordered request steps with assertions, value extraction into variables and a per-step report',
    inputSchema: toInputSchema(schemas.run_scenario),
  },
  {
    name: 'graphql_request',
    description: 'Run a GraphQL query/mutation with variables, or introspect the schema (summary or SDL)',
    inputSchema: toInputSchema(schemas.graphql_request),
  },
  {
    name: 'websocket',
    description: 'WebSocket client: connect, send, receive buffered messages, close, or a one-shot exchange',
    inputSchema: toInputSchema(schemas.websocket),
  },
  {
    name: 'sse_listen',
    description: 'Open a Server-Sent Events stream and collect events for a duration or up to a count',
    inputSchema: toInputSchema(schemas.sse_listen),
  },
  {
    name: 'load_test',
    description: 'Short bounded load test (concurrency or RPS, max 60 s) reporting p50/p95/p99 and error rate',
    inputSchema: toInputSchema(schemas.load_test),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name as ToolName];
  if (!handler) return errorResponse(`Unknown tool: ${name}`);
  try {
    return await handler(args ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      return errorResponse(`Invalid arguments for ${name}: ${issues.join('; ')}`);
    }
    return errorResponse(error instanceof Error ? error.message : 'Unknown error');
  }
});

let shuttingDown = false;
async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.race([
    Promise.all([stopAllMockServers(), closeAllWebSockets()]),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  process.exit(code);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Mock servers and sockets keep the event loop alive; exit with the client.
  process.stdin.on('end', () => void shutdown(0));
  process.on('SIGINT', () => void shutdown(130));
  process.on('SIGTERM', () => void shutdown(143));
  console.error('API Tester MCP Server running on stdio');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
