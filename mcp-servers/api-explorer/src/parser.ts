// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server - OpenAPI Parser & Utilities
 * Handles normalization and extraction of data from OpenAPI/Swagger specs
 */

import type {
  OpenAPISpec,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPISchema,
  OpenAPIParameter,
  ApiPathInfo,
  ApiModelInfo,
  ApiSearchResult,
} from "./types.js";

// ============================================
// Spec Normalization
// ============================================

/**
 * Get OpenAPI version (normalized)
 */
export function getSpecVersion(spec: OpenAPISpec): string {
  return spec.openapi || spec.swagger || "unknown";
}

/**
 * Check if spec is Swagger 2.x
 */
export function isSwagger2(spec: OpenAPISpec): boolean {
  return !!spec.swagger && spec.swagger.startsWith("2.");
}

/**
 * Check if spec is OpenAPI 3.x
 */
export function isOpenAPI3(spec: OpenAPISpec): boolean {
  return !!spec.openapi && spec.openapi.startsWith("3.");
}

// ============================================
// Path Extraction
// ============================================

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Extract all paths from spec
 */
export function extractPaths(
  spec: OpenAPISpec,
  filters?: {
    tag?: string;
    method?: string;
    deprecated?: boolean;
  }
): ApiPathInfo[] {
  const paths: ApiPathInfo[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as keyof OpenAPIPathItem] as
        | OpenAPIOperation
        | undefined;

      if (!operation) continue;

      // Apply filters
      if (filters?.method && method.toUpperCase() !== filters.method.toUpperCase()) {
        continue;
      }

      if (filters?.tag && !operation.tags?.includes(filters.tag)) {
        continue;
      }

      if (filters?.deprecated === false && operation.deprecated) {
        continue;
      }

      paths.push({
        path,
        method: method.toUpperCase(),
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        operationId: operation.operationId,
        deprecated: operation.deprecated,
      });
    }
  }

  return paths;
}

/**
 * Get operation for a specific path and method
 */
export function getOperation(
  spec: OpenAPISpec,
  path: string,
  method: string
): { operation: OpenAPIOperation; pathItem: OpenAPIPathItem } | null {
  const pathItem = spec.paths[path];
  if (!pathItem) return null;

  const normalizedMethod = method.toLowerCase() as HttpMethod;
  const operation = pathItem[normalizedMethod as keyof OpenAPIPathItem] as
    | OpenAPIOperation
    | undefined;

  if (!operation) return null;

  return { operation, pathItem };
}

/**
 * Get all parameters for a path (including path-level parameters)
 */
export function getPathParameters(
  spec: OpenAPISpec,
  path: string,
  method: string
): OpenAPIParameter[] {
  const result = getOperation(spec, path, method);
  if (!result) return [];

  const { operation, pathItem } = result;
  const params: OpenAPIParameter[] = [];

  // Path-level parameters
  if (pathItem.parameters) {
    params.push(...resolveParameters(spec, pathItem.parameters));
  }

  // Operation-level parameters
  if (operation.parameters) {
    params.push(...resolveParameters(spec, operation.parameters));
  }

  // Deduplicate by name and location
  const seen = new Set<string>();
  return params.filter((p) => {
    const key = `${p.in}:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve parameter references
 */
function resolveParameters(
  spec: OpenAPISpec,
  params: (OpenAPIParameter | { $ref: string })[]
): OpenAPIParameter[] {
  return params.map((p) => {
    if ("$ref" in p && p.$ref) {
      return resolveRef(spec, p.$ref) as OpenAPIParameter;
    }
    return p as OpenAPIParameter;
  });
}

// ============================================
// Model/Schema Extraction
// ============================================

/**
 * Extract all models/schemas from spec
 */
export function extractModels(spec: OpenAPISpec): ApiModelInfo[] {
  const models: ApiModelInfo[] = [];

  // OpenAPI 3.x: components.schemas
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      models.push({
        name,
        schema: schema as OpenAPISchema,
        usedIn: findSchemaUsage(spec, name),
      });
    }
  }

  // Swagger 2.x: definitions
  if (spec.definitions) {
    for (const [name, schema] of Object.entries(spec.definitions)) {
      models.push({
        name,
        schema: schema as OpenAPISchema,
        usedIn: findSchemaUsage(spec, name),
      });
    }
  }

  return models;
}

/**
 * Get a specific model by name
 */
export function getModel(spec: OpenAPISpec, name: string): OpenAPISchema | null {
  // OpenAPI 3.x
  if (spec.components?.schemas?.[name]) {
    return spec.components.schemas[name] as OpenAPISchema;
  }

  // Swagger 2.x
  if (spec.definitions?.[name]) {
    return spec.definitions[name] as OpenAPISchema;
  }

  return null;
}

/**
 * Find where a schema is used
 */
function findSchemaUsage(spec: OpenAPISpec, schemaName: string): string[] {
  const usage: string[] = [];
  const refPattern = isSwagger2(spec)
    ? `#/definitions/${schemaName}`
    : `#/components/schemas/${schemaName}`;

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as keyof OpenAPIPathItem] as
        | OpenAPIOperation
        | undefined;

      if (!operation) continue;

      const specStr = JSON.stringify(operation);
      if (specStr.includes(refPattern)) {
        usage.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  return usage;
}

// ============================================
// Reference Resolution
// ============================================

/**
 * Resolve a $ref pointer
 */
export function resolveRef(spec: OpenAPISpec, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    // External reference - not supported
    return { $ref: ref, _unresolved: true };
  }

  const parts = ref.slice(2).split("/");
  let current: unknown = spec;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return current;
}

/**
 * Recursively resolve all refs in a schema (with depth limit)
 */
export function resolveSchemaRefs(
  spec: OpenAPISpec,
  schema: OpenAPISchema,
  maxDepth: number = 5,
  currentDepth: number = 0
): OpenAPISchema {
  if (currentDepth >= maxDepth) {
    return schema;
  }

  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    if (resolved && typeof resolved === "object") {
      return resolveSchemaRefs(
        spec,
        resolved as OpenAPISchema,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  const result = { ...schema };

  if (result.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      result.properties[key] = resolveSchemaRefs(
        spec,
        value,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  if (result.items) {
    result.items = resolveSchemaRefs(spec, result.items, maxDepth, currentDepth + 1);
  }

  if (result.allOf) {
    result.allOf = result.allOf.map((s) =>
      resolveSchemaRefs(spec, s, maxDepth, currentDepth + 1)
    );
  }

  if (result.oneOf) {
    result.oneOf = result.oneOf.map((s) =>
      resolveSchemaRefs(spec, s, maxDepth, currentDepth + 1)
    );
  }

  if (result.anyOf) {
    result.anyOf = result.anyOf.map((s) =>
      resolveSchemaRefs(spec, s, maxDepth, currentDepth + 1)
    );
  }

  return result;
}

// ============================================
// Search Functions
// ============================================

/**
 * Search across the spec
 */
export function searchSpec(
  spec: OpenAPISpec,
  query: string,
  searchIn: ("paths" | "models" | "tags" | "descriptions")[] = [
    "paths",
    "models",
    "tags",
    "descriptions",
  ]
): ApiSearchResult[] {
  const results: ApiSearchResult[] = [];
  const queryLower = query.toLowerCase();

  // Search in paths
  if (searchIn.includes("paths")) {
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (!pathItem) continue;

      // Match path itself
      if (path.toLowerCase().includes(queryLower)) {
        for (const method of HTTP_METHODS) {
          const operation = pathItem[method as keyof OpenAPIPathItem] as
            | OpenAPIOperation
            | undefined;
          if (operation) {
            results.push({
              alias: "",
              type: "path",
              match: path,
              path,
              method: method.toUpperCase(),
              context: operation.summary,
            });
          }
        }
      }

      // Match operation ID
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method as keyof OpenAPIPathItem] as
          | OpenAPIOperation
          | undefined;
        if (operation?.operationId?.toLowerCase().includes(queryLower)) {
          results.push({
            alias: "",
            type: "path",
            match: operation.operationId,
            path,
            method: method.toUpperCase(),
            context: operation.summary,
          });
        }
      }
    }
  }

  // Search in models
  if (searchIn.includes("models")) {
    const models = extractModels(spec);
    for (const model of models) {
      if (model.name.toLowerCase().includes(queryLower)) {
        results.push({
          alias: "",
          type: "model",
          match: model.name,
          modelName: model.name,
          context: model.schema.description,
        });
      }
    }
  }

  // Search in tags
  if (searchIn.includes("tags")) {
    for (const tag of spec.tags || []) {
      if (tag.name.toLowerCase().includes(queryLower)) {
        results.push({
          alias: "",
          type: "tag",
          match: tag.name,
          context: tag.description,
        });
      }
    }
  }

  // Search in descriptions
  if (searchIn.includes("descriptions")) {
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (!pathItem) continue;

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method as keyof OpenAPIPathItem] as
          | OpenAPIOperation
          | undefined;
        if (!operation) continue;

        if (
          operation.description?.toLowerCase().includes(queryLower) ||
          operation.summary?.toLowerCase().includes(queryLower)
        ) {
          results.push({
            alias: "",
            type: "description",
            match: operation.summary || operation.description || "",
            path,
            method: method.toUpperCase(),
            context: operation.description?.slice(0, 200),
          });
        }
      }
    }
  }

  return results;
}

// ============================================
// Tags
// ============================================

/**
 * Get all tags from spec
 */
export function extractTags(spec: OpenAPISpec): Array<{
  name: string;
  description?: string;
  pathCount: number;
}> {
  const tagMap = new Map<string, { description?: string; count: number }>();

  // From spec.tags
  for (const tag of spec.tags || []) {
    tagMap.set(tag.name, { description: tag.description, count: 0 });
  }

  // Count from paths
  for (const pathItem of Object.values(spec.paths || {})) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as keyof OpenAPIPathItem] as
        | OpenAPIOperation
        | undefined;
      if (!operation?.tags) continue;

      for (const tag of operation.tags) {
        const existing = tagMap.get(tag);
        if (existing) {
          existing.count++;
        } else {
          tagMap.set(tag, { count: 1 });
        }
      }
    }
  }

  return Array.from(tagMap.entries()).map(([name, data]) => ({
    name,
    description: data.description,
    pathCount: data.count,
  }));
}

// ============================================
// Security
// ============================================

/**
 * Get security schemes from spec
 */
export function getSecuritySchemes(
  spec: OpenAPISpec
): Record<string, unknown> | null {
  // OpenAPI 3.x
  if (spec.components?.securitySchemes) {
    return spec.components.securitySchemes;
  }

  // Swagger 2.x
  const specAny = spec as unknown as Record<string, unknown>;
  if (specAny.securityDefinitions) {
    return specAny.securityDefinitions as Record<string, unknown>;
  }

  return null;
}

// ============================================
// Servers/Base URL
// ============================================

/**
 * Get server URLs from spec
 */
export function getServers(spec: OpenAPISpec): string[] {
  // OpenAPI 3.x
  if (spec.servers) {
    return spec.servers.map((s) => s.url);
  }

  // Swagger 2.x
  if (spec.host) {
    const specAny = spec as unknown as Record<string, unknown>;
    const scheme = (specAny.schemes as string[])?.[0] || "https";
    const basePath = spec.basePath || "";
    return [`${scheme}://${spec.host}${basePath}`];
  }

  return [];
}
