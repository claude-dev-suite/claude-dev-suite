// SPDX-License-Identifier: MIT
/**
 * Mock Server from OpenAPI Specification
 * Creates a mock HTTP server based on OpenAPI/Swagger specs
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { readFile } from 'fs/promises';
import * as yaml from 'yaml';

// OpenAPI Types (simplified)
interface OpenAPISchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  $ref?: string;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, {
    schema?: OpenAPISchema;
    example?: unknown;
    examples?: Record<string, { value: unknown }>;
  }>;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
}

// Mock Server Types
interface MockRoute {
  method: string;
  pathPattern: RegExp;
  pathTemplate: string;
  responses: Map<number, unknown>;
  defaultResponse: { status: number; body: unknown };
}

interface MockServerInstance {
  server: Server;
  port: number;
  routes: MockRoute[];
}

// Active servers map
const activeServers = new Map<number, MockServerInstance>();

/**
 * Generate sample response from schema
 */
function generateSampleResponse(
  schema: OpenAPISchema,
  schemas?: Record<string, OpenAPISchema>
): unknown {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    const refSchema = schemas?.[refName];
    if (refSchema) {
      return generateSampleResponse(refSchema, schemas);
    }
    return {};
  }

  // Use example if available
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  // Generate based on type
  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'mock@example.com';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return 'mock-string';

    case 'integer':
      return 42;

    case 'number':
      return 3.14;

    case 'boolean':
      return true;

    case 'array':
      if (schema.items) {
        return [
          generateSampleResponse(schema.items, schemas),
          generateSampleResponse(schema.items, schemas),
        ];
      }
      return [];

    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateSampleResponse(propSchema, schemas);
        }
        return obj;
      }
      return {};

    default:
      return null;
  }
}

/**
 * Extract response body from OpenAPI response
 */
function extractResponseBody(
  response: OpenAPIResponse,
  schemas?: Record<string, OpenAPISchema>
): unknown {
  if (!response.content) return null;

  const jsonContent = response.content['application/json'];
  if (!jsonContent) return null;

  // Use example if available
  if (jsonContent.example) return jsonContent.example;

  // Use first example from examples
  if (jsonContent.examples) {
    const firstExample = Object.values(jsonContent.examples)[0];
    if (firstExample?.value) return firstExample.value;
  }

  // Generate from schema
  if (jsonContent.schema) {
    return generateSampleResponse(jsonContent.schema, schemas);
  }

  return null;
}

/**
 * Convert OpenAPI path to regex pattern
 */
function pathToRegex(path: string): RegExp {
  // Convert {param} to named capture groups
  const pattern = path
    .replace(/\{([^}]+)\}/g, '(?<$1>[^/]+)')
    .replace(/\//g, '\\/');
  return new RegExp(`^${pattern}$`);
}

/**
 * Build routes from OpenAPI spec
 */
function buildRoutes(spec: OpenAPISpec): MockRoute[] {
  const routes: MockRoute[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      const responses = new Map<number, unknown>();
      let defaultStatus = 200;
      let defaultBody: unknown = { message: 'OK' };

      if (operation.responses) {
        for (const [statusStr, response] of Object.entries(operation.responses)) {
          const status = parseInt(statusStr, 10);
          if (isNaN(status)) continue;

          const body = extractResponseBody(response, spec.components?.schemas);
          responses.set(status, body);

          // Use first successful response as default
          if (status >= 200 && status < 300 && defaultStatus === 200) {
            defaultStatus = status;
            defaultBody = body;
          }
        }
      }

      routes.push({
        method: method.toUpperCase(),
        pathPattern: pathToRegex(path),
        pathTemplate: path,
        responses,
        defaultResponse: { status: defaultStatus, body: defaultBody },
      });
    }
  }

  return routes;
}

/**
 * Parse request body
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        resolve(body);
      }
    });
  });
}

/**
 * Handle incoming request
 */
function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  routes: MockRoute[],
  options?: { delay?: number; logRequests?: boolean }
): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // Log request if enabled
  if (options?.logRequests) {
    console.error(`[Mock] ${method} ${path}`);
  }

  // Find matching route
  const route = routes.find(r =>
    r.method === method && r.pathPattern.test(path)
  );

  // Handle CORS preflight (localhost-only for mock server)
  const allowedOrigin = req.headers.origin?.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)
    ? req.headers.origin
    : 'http://localhost:3000';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const sendResponse = () => {
    // Set CORS headers (localhost-only)
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Content-Type', 'application/json');

    if (!route) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found', path, method }));
      return;
    }

    // Check for custom status code in query
    const requestedStatus = url.searchParams.get('_status');
    if (requestedStatus) {
      const status = parseInt(requestedStatus, 10);
      const body = route.responses.get(status);
      if (body !== undefined) {
        res.writeHead(status);
        res.end(JSON.stringify(body));
        return;
      }
    }

    // Return default response
    const { status, body } = route.defaultResponse;
    res.writeHead(status);
    res.end(JSON.stringify(body));
  };

  // Apply delay if configured
  if (options?.delay && options.delay > 0) {
    setTimeout(sendResponse, options.delay);
  } else {
    sendResponse();
  }
}

/**
 * Load OpenAPI spec from file
 */
async function loadSpec(specPath: string): Promise<OpenAPISpec> {
  const content = await readFile(specPath, 'utf-8');

  try {
    return JSON.parse(content);
  } catch {
    return yaml.parse(content) as OpenAPISpec;
  }
}

/**
 * Start mock server
 */
export async function startMockServer(
  specPath: string,
  options?: {
    port?: number;
    delay?: number;
    logRequests?: boolean;
  }
): Promise<{
  port: number;
  url: string;
  routes: number;
  endpoints: Array<{ method: string; path: string }>;
}> {
  const spec = await loadSpec(specPath);
  const routes = buildRoutes(spec);

  // Find available port
  let port = options?.port || 3000;
  while (activeServers.has(port)) {
    port++;
  }

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, routes, {
        delay: options?.delay,
        logRequests: options?.logRequests,
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use, try next
        port++;
        server.listen(port);
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      activeServers.set(port, { server, port, routes });

      resolve({
        port,
        url: `http://localhost:${port}`,
        routes: routes.length,
        endpoints: routes.map(r => ({
          method: r.method,
          path: r.pathTemplate,
        })),
      });
    });
  });
}

/**
 * Stop mock server
 */
export async function stopMockServer(port: number): Promise<boolean> {
  const instance = activeServers.get(port);
  if (!instance) return false;

  return new Promise((resolve) => {
    instance.server.close(() => {
      activeServers.delete(port);
      resolve(true);
    });
  });
}

/**
 * List active mock servers
 */
export function listMockServers(): Array<{
  port: number;
  routes: number;
}> {
  return Array.from(activeServers.values()).map(s => ({
    port: s.port,
    routes: s.routes.length,
  }));
}

/**
 * Stop all mock servers
 */
export async function stopAllMockServers(): Promise<number> {
  const ports = Array.from(activeServers.keys());
  await Promise.all(ports.map(p => stopMockServer(p)));
  return ports.length;
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  await stopAllMockServers();
});

process.on('SIGTERM', async () => {
  await stopAllMockServers();
});
