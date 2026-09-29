// SPDX-License-Identifier: MIT
/**
 * Zod input schemas for every tool. index.ts derives each tool's JSON Schema
 * from these, so the advertised schema and the validation cannot drift.
 */

import { z } from "zod";

const alias = z.string().min(1).optional().describe("Source alias. Optional when exactly one source applies.");
const limit = (def: number, max: number) => z.number().int().min(1).max(max).optional().default(def).describe(`Max items (default ${def}, max ${max})`);
const offset = z.number().int().min(0).optional().default(0).describe("Items to skip (pagination)");
const kind = z.enum(["openapi", "asyncapi", "graphql", "proto", "auto"]).optional().describe("Document kind (default: auto-detect)");
const method = z
  .string()
  .transform((m) => m.toUpperCase())
  .pipe(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"]))
  .describe("HTTP method");

export const SpecRefSchema = z
  .object({
    alias: z.string().min(1).optional().describe("Registered source alias"),
    url: z.string().min(1).optional().describe("http(s) URL of a spec"),
    path: z.string().min(1).optional().describe("Spec file path, relative to the project root"),
    gitRef: z.string().min(1).optional().describe("Read path (or the alias's file) at this git revision, e.g. main, HEAD~1, v1.2.0"),
    kind,
  })
  .describe("A spec: one of alias, url or path, optionally with gitRef");

export const Schemas = {
  list_api_endpoints: z.object({}),
  list_api_sources: z.object({}),
  add_api_source: z.object({
    alias: z.string().min(1).describe("Name for the source (letters, digits, . _ -)"),
    url: z.string().min(1).optional().describe("http(s) URL: an OpenAPI/AsyncAPI document, or a GraphQL endpoint with kind=graphql"),
    path: z.string().min(1).optional().describe("Project file: .json/.yaml spec, .graphql SDL, or .proto"),
    kind,
    headers: z.record(z.string(), z.string()).optional().describe("Request headers for URL sources (never echoed back)"),
    timeout: z.number().int().min(1000).max(300000).optional().describe("Request timeout in ms"),
    replace: z.boolean().optional().default(false).describe("Overwrite an existing alias"),
    validate: z.boolean().optional().default(true).describe("Load the document now and fail if it cannot be read"),
  }),
  remove_api_source: z.object({ alias: z.string().min(1) }),
  get_api_schema: z.object({
    alias,
    format: z.enum(["full", "summary"]).optional().default("full").describe("full: the raw document (size-capped); summary: overview"),
    refresh: z.boolean().optional().default(false).describe("Bypass the cache"),
    maxChars: z.number().int().min(1000).max(2_000_000).optional().default(200_000).describe("Size cap for format=full"),
  }),
  list_api_paths: z.object({
    alias,
    tag: z.string().optional().describe("Only operations with this tag"),
    method: method.optional(),
    pathPrefix: z.string().optional().describe("Only paths starting with this prefix"),
    includeDeprecated: z.boolean().optional().default(true),
    includeWebhooks: z.boolean().optional().default(true).describe("Include OpenAPI 3.1 webhooks"),
    limit: limit(100, 500),
    offset,
  }),
  get_api_endpoint_details: z.object({
    alias,
    path: z.string().min(1).optional().describe("Path template ('/users/{id}') or a concrete path/URL ('/users/42')"),
    method: method.optional(),
    operationId: z.string().min(1).optional().describe("Alternative to path+method"),
    resolveRefs: z.boolean().optional().default(true).describe("Dereference $refs (cycles and limits are marked)"),
    maxDepth: z.number().int().min(1).max(64).optional().default(32).describe("Max nested $ref hops"),
  }),
  match_api_operation: z.object({
    alias,
    url: z.string().min(1).describe("Concrete URL or path, e.g. https://api.x.com/v1/users/42?x=1"),
    method: method.optional(),
  }),
  get_api_models: z.object({
    alias,
    model: z.string().optional().describe("One model by name; omit to list"),
    resolveRefs: z.boolean().optional().default(false),
    compact: z.boolean().optional().default(false).describe("Names and property names only"),
    includeExample: z.boolean().optional().default(false).describe("Add a generated example value"),
    limit: limit(100, 500),
    offset,
  }),
  get_api_security: z.object({ alias }),
  search_api: z.object({
    query: z.string().min(1).describe("Search terms (all terms must match to rank first)"),
    alias,
    searchIn: z
      .array(z.enum(["paths", "models", "tags", "descriptions"]))
      .optional()
      .default(["paths", "models", "tags", "descriptions"])
      .describe("paths = operations/fields/rpcs/channels; models = schemas/types/messages"),
    limit: limit(20, 200),
  }),
  lint_api_spec: SpecRefSchema.extend({
    minSeverity: z.enum(["error", "warn", "info", "hint"]).optional().default("hint"),
    rules: z.array(z.string()).optional().describe("Only run these rule ids"),
    disableRules: z.array(z.string()).optional().describe("Skip these rule ids"),
    limit: limit(100, 1000),
    offset,
  }),
  diff_api_specs: z.object({
    base: SpecRefSchema.describe("The old spec"),
    head: SpecRefSchema.describe("The new spec"),
    onlyBreaking: z.boolean().optional().default(false),
    limit: limit(200, 2000),
    offset,
  }),
  generate_api_request: z.object({
    alias,
    path: z.string().min(1).optional().describe("Path template or concrete path"),
    method: method.optional(),
    operationId: z.string().min(1).optional(),
    formats: z.array(z.enum(["curl", "httpie", "fetch", "python"])).optional().default(["curl", "httpie", "fetch", "python"]),
    baseUrl: z.string().optional().describe("Override the server URL"),
    includeOptional: z.boolean().optional().default(false).describe("Also fill optional query/header params and body fields"),
    mediaType: z.string().optional().describe("Request media type to use"),
  }),
  list_graphql_operations: z.object({
    alias,
    operationType: z.enum(["query", "mutation", "subscription"]).optional(),
    limit: limit(100, 1000),
    offset,
  }),
  list_graphql_types: z.object({
    alias,
    kind: z.enum(["object", "interface", "union", "enum", "input", "scalar"]).optional(),
    includeBuiltins: z.boolean().optional().default(false),
    limit: limit(200, 2000),
    offset,
  }),
  get_graphql_type: z.object({ alias, name: z.string().min(1) }),
  list_asyncapi_channels: z.object({ alias, limit: limit(100, 1000), offset }),
  get_asyncapi_message: z.object({ alias, name: z.string().optional().describe("Message name; omit to list all") }),
  list_grpc_services: z.object({ alias }),
  get_proto_message: z.object({ alias, name: z.string().min(1).describe("Message or enum name (short or fully qualified)") }),
  discover_api_specs: z.object({
    path: z.string().optional().describe("Directory to scan, relative to the project root (default: root)"),
    maxDepth: z.number().int().min(0).max(12).optional().default(6),
    limit: limit(100, 1000),
    register: z.boolean().optional().default(false).describe("Register every file found as a source"),
  }),
  detect_api_frameworks: z.object({
    path: z.string().optional().describe("Directory to scan, relative to the project root (default: root)"),
    maxDepth: z.number().int().min(0).max(10).optional().default(3),
    includeConfidence: z.enum(["all", "high", "medium", "low"]).optional().default("all").describe("high: only high; medium: high+medium; all/low: everything"),
  }),
} as const;

export type ToolName = keyof typeof Schemas;
