// SPDX-License-Identifier: MIT
/**
 * Test Generator from OpenAPI Specification
 * Generates test cases and sample requests from OpenAPI/Swagger specs
 */

import { readFile } from 'fs/promises';
import * as yaml from 'yaml';

// OpenAPI Types (simplified)
interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: OpenAPISchema;
  example?: unknown;
  description?: string;
}

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

interface OpenAPIRequestBody {
  required?: boolean;
  content?: Record<string, {
    schema?: OpenAPISchema;
    example?: unknown;
    examples?: Record<string, { value: unknown }>;
  }>;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, {
    schema?: OpenAPISchema;
    example?: unknown;
  }>;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
}

// Generated Test Types
export interface GeneratedTest {
  name: string;
  description?: string;
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  pathParams?: Record<string, string>;
  body?: unknown;
  expectedStatus: number[];
  tags?: string[];
}

export interface GenerateTestsResult {
  apiName: string;
  apiVersion: string;
  baseUrl: string;
  tests: GeneratedTest[];
  totalEndpoints: number;
  totalTests: number;
  coverage: {
    paths: number;
    methods: number;
  };
}

/**
 * Generate sample value from schema
 */
function generateSampleValue(schema: OpenAPISchema, schemas?: Record<string, OpenAPISchema>): unknown {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    const refSchema = schemas?.[refName];
    if (refSchema) {
      return generateSampleValue(refSchema, schemas);
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
      if (schema.format === 'email') return 'test@example.com';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      if (schema.format === 'uri') return 'https://example.com';
      return 'string';

    case 'integer':
      return schema.format === 'int64' ? 1000000 : 1;

    case 'number':
      return 1.5;

    case 'boolean':
      return true;

    case 'array':
      if (schema.items) {
        return [generateSampleValue(schema.items, schemas)];
      }
      return [];

    case 'object':
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = generateSampleValue(propSchema, schemas);
        }
        return obj;
      }
      return {};

    default:
      return null;
  }
}

/**
 * Generate sample value for parameter
 */
function generateParamValue(param: OpenAPIParameter, schemas?: Record<string, OpenAPISchema>): string {
  if (param.example !== undefined) return String(param.example);
  if (param.schema) {
    const value = generateSampleValue(param.schema, schemas);
    return String(value);
  }
  return 'value';
}

/**
 * Replace path parameters in URL
 */
function replacePathParams(path: string, pathParams: Record<string, string>): string {
  let result = path;
  for (const [key, value] of Object.entries(pathParams)) {
    result = result.replace(`{${key}}`, value);
  }
  return result;
}

/**
 * Build query string
 */
function buildQueryString(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/**
 * Generate tests from OpenAPI operation
 */
function generateTestsForOperation(
  method: string,
  path: string,
  operation: OpenAPIOperation,
  pathParams: OpenAPIParameter[],
  baseUrl: string,
  schemas?: Record<string, OpenAPISchema>
): GeneratedTest[] {
  const tests: GeneratedTest[] = [];
  const allParams = [...pathParams, ...(operation.parameters || [])];

  // Separate parameters by location
  const queryParams: Record<string, string> = {};
  const headerParams: Record<string, string> = {};
  const pathParamValues: Record<string, string> = {};

  for (const param of allParams) {
    const value = generateParamValue(param, schemas);
    switch (param.in) {
      case 'query':
        if (param.required) queryParams[param.name] = value;
        break;
      case 'header':
        headerParams[param.name] = value;
        break;
      case 'path':
        pathParamValues[param.name] = value;
        break;
    }
  }

  // Generate request body
  let body: unknown;
  if (operation.requestBody?.content) {
    const jsonContent = operation.requestBody.content['application/json'];
    if (jsonContent) {
      if (jsonContent.example) {
        body = jsonContent.example;
      } else if (jsonContent.examples) {
        const firstExample = Object.values(jsonContent.examples)[0];
        body = firstExample?.value;
      } else if (jsonContent.schema) {
        body = generateSampleValue(jsonContent.schema, schemas);
      }
    }
  }

  // Build URL
  const resolvedPath = replacePathParams(path, pathParamValues);
  const queryString = buildQueryString(queryParams);
  const url = `${baseUrl}${resolvedPath}${queryString}`;

  // Determine expected status codes from responses
  const expectedStatus: number[] = [];
  if (operation.responses) {
    for (const status of Object.keys(operation.responses)) {
      const code = parseInt(status, 10);
      if (!isNaN(code)) expectedStatus.push(code);
    }
  }
  if (expectedStatus.length === 0) {
    expectedStatus.push(method === 'POST' ? 201 : 200);
  }

  // Create main test
  const testName = operation.operationId ||
    `${method.toUpperCase()} ${path}` ||
    operation.summary ||
    `Test ${method} ${path}`;

  tests.push({
    name: testName,
    description: operation.description || operation.summary,
    method: method.toUpperCase(),
    path,
    url,
    headers: {
      'Content-Type': 'application/json',
      ...headerParams,
    },
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    pathParams: Object.keys(pathParamValues).length > 0 ? pathParamValues : undefined,
    body,
    expectedStatus,
    tags: operation.tags,
  });

  // Generate negative test for required parameters
  const requiredParams = allParams.filter(p => p.required && p.in === 'query');
  if (requiredParams.length > 0) {
    // Test without required params - should return 400
    tests.push({
      name: `${testName} - Missing Required Params`,
      description: `Test ${method} ${path} without required parameters`,
      method: method.toUpperCase(),
      path,
      url: `${baseUrl}${resolvedPath}`,
      headers: { 'Content-Type': 'application/json', ...headerParams },
      body,
      expectedStatus: [400, 422],
      tags: operation.tags,
    });
  }

  return tests;
}

/**
 * Load and parse OpenAPI specification
 */
async function loadSpec(filePath: string): Promise<OpenAPISpec> {
  const content = await readFile(filePath, 'utf-8');

  // Try JSON first, then YAML
  try {
    return JSON.parse(content);
  } catch {
    return yaml.parse(content) as OpenAPISpec;
  }
}

/**
 * Generate tests from OpenAPI specification
 */
export async function generateTests(
  specPath: string,
  options?: {
    baseUrl?: string;
    includeNegativeTests?: boolean;
    filterTags?: string[];
    filterPaths?: string[];
  }
): Promise<GenerateTestsResult> {
  const spec = await loadSpec(specPath);

  // Validate spec
  if (!spec.paths) {
    throw new Error('Invalid OpenAPI spec: missing paths');
  }

  // Determine base URL
  let baseUrl = options?.baseUrl || '';
  if (!baseUrl && spec.servers && spec.servers.length > 0) {
    baseUrl = spec.servers[0].url;
  }
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');

  const tests: GeneratedTest[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
  let pathCount = 0;
  let methodCount = 0;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    // Filter by path if specified
    if (options?.filterPaths && !options.filterPaths.some(p => path.includes(p))) {
      continue;
    }

    pathCount++;
    const pathParams = pathItem.parameters || [];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Filter by tags if specified
      if (options?.filterTags) {
        const hasMatchingTag = operation.tags?.some(t =>
          options.filterTags!.includes(t)
        );
        if (!hasMatchingTag) continue;
      }

      methodCount++;

      const generatedTests = generateTestsForOperation(
        method,
        path,
        operation,
        pathParams,
        baseUrl,
        spec.components?.schemas
      );

      // Filter negative tests if not requested
      if (options?.includeNegativeTests === false) {
        tests.push(generatedTests[0]); // Only main test
      } else {
        tests.push(...generatedTests);
      }
    }
  }

  return {
    apiName: spec.info.title,
    apiVersion: spec.info.version,
    baseUrl,
    tests,
    totalEndpoints: methodCount,
    totalTests: tests.length,
    coverage: {
      paths: pathCount,
      methods: methodCount,
    },
  };
}

/**
 * Convert tests to batch request format
 */
export function toBatchFormat(tests: GeneratedTest[]): Array<{
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}> {
  return tests.map(t => ({
    name: t.name,
    method: t.method,
    url: t.url,
    headers: Object.keys(t.headers).length > 0 ? t.headers : undefined,
    body: t.body,
  }));
}

/**
 * Generate test code in various formats
 */
export function generateTestCode(
  tests: GeneratedTest[],
  format: 'vitest' | 'jest' | 'curl' | 'httpie'
): string {
  switch (format) {
    case 'vitest':
    case 'jest':
      return generateJsTestCode(tests, format);
    case 'curl':
      return generateCurlCommands(tests);
    case 'httpie':
      return generateHttpieCommands(tests);
    default:
      return generateCurlCommands(tests);
  }
}

function generateJsTestCode(tests: GeneratedTest[], framework: 'vitest' | 'jest'): string {
  const importStatement = framework === 'vitest'
    ? `import { describe, it, expect } from 'vitest';`
    : `const { describe, it, expect } = require('@jest/globals');`;

  const testCases = tests.map(test => {
    const bodyStr = test.body ? JSON.stringify(test.body, null, 2) : 'undefined';
    const headersStr = JSON.stringify(test.headers, null, 2);

    return `
  it(${JSON.stringify(test.name)}, async () => {
    const response = await fetch('${test.url}', {
      method: '${test.method}',
      headers: ${headersStr},
      ${test.body ? `body: JSON.stringify(${bodyStr}),` : ''}
    });

    expect([${test.expectedStatus.join(', ')}]).toContain(response.status);
  });`;
  }).join('\n');

  return `${importStatement}

describe('API Tests', () => {${testCases}
});
`;
}

function generateCurlCommands(tests: GeneratedTest[]): string {
  return tests.map(test => {
    const headers = Object.entries(test.headers)
      .map(([k, v]) => `-H '${k}: ${v}'`)
      .join(' \\\n  ');

    const body = test.body
      ? `-d '${JSON.stringify(test.body)}'`
      : '';

    return `# ${test.name}
curl -X ${test.method} '${test.url}' \\
  ${headers}${body ? ' \\\n  ' + body : ''}
`;
  }).join('\n');
}

function generateHttpieCommands(tests: GeneratedTest[]): string {
  return tests.map(test => {
    const headers = Object.entries(test.headers)
      .map(([k, v]) => `'${k}:${v}'`)
      .join(' ');

    const body = test.body
      ? Object.entries(test.body as Record<string, unknown>)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ')
      : '';

    return `# ${test.name}
http ${test.method} '${test.url}' ${headers} ${body}
`;
  }).join('\n');
}
