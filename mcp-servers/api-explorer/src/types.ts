// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server - Type Definitions
 */

// ============================================
// Configuration Types
// ============================================

export interface ApiEndpointConfig {
  alias: string;
  url: string;
  framework?: string;
  openApiLibrary?: string;
  type?: "openapi" | "swagger" | "auto";
  headers?: Record<string, string>;
  timeout?: number;
}

// ============================================
// Detection Types
// ============================================

export type Ecosystem = "java" | "python" | "node" | "dotnet" | "go" | "ruby" | "php";
export type Confidence = "high" | "medium" | "low";

export interface FrameworkSignature {
  ecosystem: Ecosystem;
  framework: string;
  openApiLibrary: string;
  dependencyPattern: string | RegExp;
  defaultEndpoint: string;
  alternativeEndpoints: string[];
  configFiles?: ConfigFilePattern[];
}

export interface ConfigFilePattern {
  file: string;
  pattern: string | RegExp;
  extractEndpoint?: (match: RegExpMatchArray) => string;
}

export interface DetectedFramework {
  path: string;
  alias: string;
  ecosystem: Ecosystem;
  framework: string;
  openApiLibrary: string;
  suggestedEndpoint: string;
  alternativeEndpoints: string[];
  confidence: Confidence;
  configFile?: string;
  customEndpoint?: string;
}

export interface DetectionResult {
  modules: DetectedFramework[];
  total: number;
  byEcosystem: Record<string, number>;
}

// ============================================
// OpenAPI Spec Types (Simplified)
// ============================================

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface OpenAPIServer {
  url: string;
  description?: string;
  variables?: Record<string, {
    default: string;
    enum?: string[];
    description?: string;
  }>;
}

export interface OpenAPIParameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: OpenAPISchema;
  example?: unknown;
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  $ref?: string;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, {
    schema?: OpenAPISchema;
    example?: unknown;
    examples?: Record<string, { value: unknown; summary?: string }>;
  }>;
}

export interface OpenAPIResponse {
  description: string;
  headers?: Record<string, { description?: string; schema?: OpenAPISchema }>;
  content?: Record<string, {
    schema?: OpenAPISchema;
    example?: unknown;
  }>;
}

export interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIPathItem {
  summary?: string;
  description?: string;
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  trace?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

export interface OpenAPIComponents {
  schemas?: Record<string, OpenAPISchema>;
  responses?: Record<string, OpenAPIResponse>;
  parameters?: Record<string, OpenAPIParameter>;
  requestBodies?: Record<string, OpenAPIRequestBody>;
  securitySchemes?: Record<string, {
    type: "apiKey" | "http" | "oauth2" | "openIdConnect";
    description?: string;
    name?: string;
    in?: "query" | "header" | "cookie";
    scheme?: string;
    bearerFormat?: string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;
  }>;
}

export interface OpenAPISpec {
  openapi?: string;       // OpenAPI 3.x
  swagger?: string;       // Swagger 2.x
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  host?: string;          // Swagger 2.x
  basePath?: string;      // Swagger 2.x
  paths: Record<string, OpenAPIPathItem>;
  components?: OpenAPIComponents;
  definitions?: Record<string, OpenAPISchema>;  // Swagger 2.x
  tags?: Array<{ name: string; description?: string }>;
  externalDocs?: { url: string; description?: string };
}

// ============================================
// Cache Types
// ============================================

export interface CachedSpec {
  spec: OpenAPISpec;
  fetchedAt: number;
  expiresAt: number;
}

// ============================================
// Tool Response Types
// ============================================

export interface ApiEndpointInfo {
  alias: string;
  url: string;
  framework?: string;
  openApiLibrary?: string;
  status: "configured" | "detected";
}

export interface ApiSchemaResponse {
  alias: string;
  url: string;
  spec: OpenAPISpec;
  fetchedAt: string;
}

export interface ApiPathInfo {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  deprecated?: boolean;
}

export interface ApiPathsResponse {
  alias: string;
  paths: ApiPathInfo[];
  total: number;
}

export interface MultiEndpointResponse<T> {
  endpoints: Array<T & { alias: string }>;
}

export interface ApiEndpointDetailsResponse {
  alias: string;
  path: string;
  method: string;
  operation: OpenAPIOperation;
  pathParameters?: OpenAPIParameter[];
}

export interface ApiModelInfo {
  name: string;
  schema: OpenAPISchema;
  usedIn?: string[];
}

export interface ApiModelsResponse {
  alias: string;
  models: ApiModelInfo[];
  total: number;
}

export interface ApiSearchResult {
  alias: string;
  type: "path" | "model" | "tag" | "description";
  match: string;
  context?: string;
  path?: string;
  method?: string;
  modelName?: string;
}

export interface ApiSearchResponse {
  query: string;
  results: ApiSearchResult[];
  total: number;
}

// ============================================
// Error Types
// ============================================

export interface ApiExplorerError {
  error: string;
  hint?: string;
  availableAliases?: string[];
}
