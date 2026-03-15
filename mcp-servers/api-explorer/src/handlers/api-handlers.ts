// SPDX-License-Identifier: MIT
/**
 * API Explorer tool handlers
 */

import type { ApiEndpointConfig, ApiEndpointInfo, ApiSchemaResponse, ApiPathsResponse, ApiEndpointDetailsResponse, ApiModelsResponse, ApiSearchResponse } from "../types.js";
import { getEndpointByAlias, getAvailableAliases } from "../config.js";
import { fetchSpec, fetchSpecs } from "../fetcher.js";
import {
  extractPaths,
  getOperation,
  getPathParameters,
  extractModels,
  getModel,
  searchSpec,
  extractTags,
  getSpecVersion,
  getServers,
  resolveSchemaRefs,
} from "../parser.js";
import { detectApiFrameworks } from "../detector.js";
import {
  GetSchemaSchema,
  ListPathsSchema,
  GetEndpointDetailsSchema,
  GetModelsSchema,
  SearchApiSchema,
  DetectFrameworksSchema,
  jsonResponse,
  type Handler,
  type HandlerResult,
} from "./types.js";

// Module-level endpoints reference (set by index.ts)
let endpoints: ApiEndpointConfig[] = [];

export function setEndpoints(e: ApiEndpointConfig[]): void {
  endpoints = e;
}

export function getEndpoints(): ApiEndpointConfig[] {
  return endpoints;
}

export const handleListApiEndpoints: Handler = async (): Promise<HandlerResult> => {
  const endpointInfos: ApiEndpointInfo[] = endpoints.map((e) => ({
    alias: e.alias,
    url: e.url,
    framework: e.framework,
    openApiLibrary: e.openApiLibrary,
    status: "configured" as const,
  }));

  return jsonResponse({
    endpoints: endpointInfos,
    total: endpointInfos.length,
  });
};

export const handleGetApiSchema: Handler = async (args): Promise<HandlerResult> => {
  const params = GetSchemaSchema.parse(args);
  const targetEndpoints = getEndpointByAlias(endpoints, params.alias);

  if (Array.isArray(targetEndpoints)) {
    // Multiple endpoints
    const results: Array<ApiSchemaResponse | { alias: string; error: string }> = [];
    const specs = await fetchSpecs(targetEndpoints, params.refresh);

    for (const endpoint of targetEndpoints) {
      const specOrError = specs.get(endpoint.alias);
      if (specOrError instanceof Error) {
        results.push({ alias: endpoint.alias, error: specOrError.message });
      } else if (specOrError) {
        if (params.format === "summary") {
          results.push({
            alias: endpoint.alias,
            url: endpoint.url,
            spec: {
              openapi: getSpecVersion(specOrError),
              info: specOrError.info,
              servers: getServers(specOrError),
              pathCount: Object.keys(specOrError.paths || {}).length,
              tags: extractTags(specOrError),
            } as any,
            fetchedAt: new Date().toISOString(),
          });
        } else {
          results.push({
            alias: endpoint.alias,
            url: endpoint.url,
            spec: specOrError,
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    }

    return jsonResponse({ endpoints: results });
  } else {
    // Single endpoint
    const spec = await fetchSpec(targetEndpoints, params.refresh);

    const response: ApiSchemaResponse = {
      alias: targetEndpoints.alias,
      url: targetEndpoints.url,
      spec: params.format === "summary"
        ? ({
            openapi: getSpecVersion(spec),
            info: spec.info,
            servers: getServers(spec),
            pathCount: Object.keys(spec.paths || {}).length,
            tags: extractTags(spec),
          } as any)
        : spec,
      fetchedAt: new Date().toISOString(),
    };

    return jsonResponse(response);
  }
};

export const handleListApiPaths: Handler = async (args): Promise<HandlerResult> => {
  const params = ListPathsSchema.parse(args);
  const targetEndpoints = getEndpointByAlias(endpoints, params.alias);

  const processEndpoint = async (endpoint: ApiEndpointConfig): Promise<ApiPathsResponse & { truncated?: boolean }> => {
    const spec = await fetchSpec(endpoint);
    const allPaths = extractPaths(spec, {
      tag: params.tag,
      method: params.method,
      deprecated: params.includeDeprecated ? undefined : false,
    });

    // Apply limit
    const paths = allPaths.slice(0, params.limit);
    const truncated = allPaths.length > params.limit;

    return {
      alias: endpoint.alias,
      paths,
      total: allPaths.length,
      ...(truncated && { truncated, showing: params.limit }),
    };
  };

  if (Array.isArray(targetEndpoints)) {
    const results = await Promise.all(targetEndpoints.map(processEndpoint));
    return jsonResponse({ endpoints: results });
  } else {
    const result = await processEndpoint(targetEndpoints);
    return jsonResponse(result);
  }
};

export const handleGetApiEndpointDetails: Handler = async (args): Promise<HandlerResult> => {
  const params = GetEndpointDetailsSchema.parse(args);

  // For endpoint details, we need a specific endpoint if multiple exist
  let targetEndpoint: ApiEndpointConfig;
  if (params.alias) {
    const result = getEndpointByAlias(endpoints, params.alias);
    if (Array.isArray(result)) {
      throw new Error("Alias is required when multiple endpoints are configured");
    }
    targetEndpoint = result;
  } else if (endpoints.length === 1) {
    targetEndpoint = endpoints[0];
  } else {
    throw new Error(
      `Alias is required. Available: ${getAvailableAliases(endpoints).join(", ")}`
    );
  }

  const spec = await fetchSpec(targetEndpoint);
  const result = getOperation(spec, params.path, params.method);

  if (!result) {
    throw new Error(`Endpoint not found: ${params.method} ${params.path}`);
  }

  let operation = result.operation;
  if (params.resolveRefs && operation.requestBody?.content) {
    // Resolve refs in request body schemas
    for (const [, mediaType] of Object.entries(operation.requestBody.content)) {
      if (mediaType.schema) {
        mediaType.schema = resolveSchemaRefs(spec, mediaType.schema);
      }
    }
  }

  if (params.resolveRefs && operation.responses) {
    // Resolve refs in response schemas
    for (const [, response] of Object.entries(operation.responses)) {
      if (response.content) {
        for (const [, mediaType] of Object.entries(response.content)) {
          if (mediaType.schema) {
            mediaType.schema = resolveSchemaRefs(spec, mediaType.schema);
          }
        }
      }
    }
  }

  const response: ApiEndpointDetailsResponse = {
    alias: targetEndpoint.alias,
    path: params.path,
    method: params.method,
    operation,
    pathParameters: getPathParameters(spec, params.path, params.method),
  };

  return jsonResponse(response);
};

export const handleGetApiModels: Handler = async (args): Promise<HandlerResult> => {
  const params = GetModelsSchema.parse(args);
  const targetEndpoints = getEndpointByAlias(endpoints, params.alias);

  const processEndpoint = async (endpoint: ApiEndpointConfig): Promise<ApiModelsResponse & { truncated?: boolean }> => {
    const spec = await fetchSpec(endpoint);

    if (params.model) {
      const model = getModel(spec, params.model);
      if (!model) {
        throw new Error(`Model not found: ${params.model}`);
      }

      // Compact mode for single model: only property names
      if (params.compact) {
        const properties = model.properties ? Object.keys(model.properties) : [];
        return {
          alias: endpoint.alias,
          models: [{ name: params.model, properties }] as any,
          total: 1,
        };
      }

      const resolvedModel = params.resolveRefs
        ? resolveSchemaRefs(spec, model)
        : model;

      return {
        alias: endpoint.alias,
        models: [{ name: params.model, schema: resolvedModel }],
        total: 1,
      };
    }

    let allModels = extractModels(spec);

    // Compact mode: only model names and property names
    if (params.compact) {
      const compactModels = allModels.slice(0, params.limit).map((m) => ({
        name: m.name,
        properties: m.schema?.properties ? Object.keys(m.schema.properties) : [],
      }));
      const truncated = allModels.length > params.limit;

      return {
        alias: endpoint.alias,
        models: compactModels as any,
        total: allModels.length,
        ...(truncated && { truncated, showing: params.limit }),
      };
    }

    // Full mode with limit
    if (params.resolveRefs) {
      allModels = allModels.map((m) => ({
        ...m,
        schema: resolveSchemaRefs(spec, m.schema),
      }));
    }

    const models = allModels.slice(0, params.limit);
    const truncated = allModels.length > params.limit;

    return {
      alias: endpoint.alias,
      models,
      total: allModels.length,
      ...(truncated && { truncated, showing: params.limit }),
    };
  };

  if (Array.isArray(targetEndpoints)) {
    const results = await Promise.all(targetEndpoints.map(processEndpoint));
    return jsonResponse({ endpoints: results });
  } else {
    const result = await processEndpoint(targetEndpoints);
    return jsonResponse(result);
  }
};

export const handleSearchApi: Handler = async (args): Promise<HandlerResult> => {
  const params = SearchApiSchema.parse(args);
  const targetEndpoints = getEndpointByAlias(endpoints, params.alias);

  const allResults: ApiSearchResponse["results"] = [];

  const processEndpoint = async (endpoint: ApiEndpointConfig) => {
    const spec = await fetchSpec(endpoint);
    const results = searchSpec(spec, params.query, params.searchIn);

    // Add alias to results
    for (const result of results) {
      result.alias = endpoint.alias;
      allResults.push(result);
    }
  };

  if (Array.isArray(targetEndpoints)) {
    await Promise.all(targetEndpoints.map(processEndpoint));
  } else {
    await processEndpoint(targetEndpoints);
  }

  // Limit results
  const limitedResults = allResults.slice(0, params.limit);

  const response: ApiSearchResponse = {
    query: params.query,
    results: limitedResults,
    total: allResults.length,
  };

  return jsonResponse(response);
};

export const handleDetectApiFrameworks: Handler = async (args): Promise<HandlerResult> => {
  const params = DetectFrameworksSchema.parse(args);
  const scanPath = params.path || process.cwd();

  const result = await detectApiFrameworks(
    scanPath,
    params.maxDepth,
    params.includeConfidence
  );

  return jsonResponse(result);
};
