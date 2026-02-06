// SPDX-License-Identifier: MIT
/**
 * API Explorer handlers registry
 */

// Type exports
export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse } from "./types.js";

// Schema exports
export {
  GetSchemaSchema,
  ListPathsSchema,
  GetEndpointDetailsSchema,
  GetModelsSchema,
  SearchApiSchema,
  DetectFrameworksSchema,
} from "./types.js";

// Handler imports
import type { Handler } from "./types.js";
import {
  handleListApiEndpoints,
  handleGetApiSchema,
  handleListApiPaths,
  handleGetApiEndpointDetails,
  handleGetApiModels,
  handleSearchApi,
  handleDetectApiFrameworks,
  setEndpoints,
  getEndpoints,
} from "./api-handlers.js";

// Handler exports
export {
  handleListApiEndpoints,
  handleGetApiSchema,
  handleListApiPaths,
  handleGetApiEndpointDetails,
  handleGetApiModels,
  handleSearchApi,
  handleDetectApiFrameworks,
  setEndpoints,
  getEndpoints,
} from "./api-handlers.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  list_api_endpoints: handleListApiEndpoints,
  get_api_schema: handleGetApiSchema,
  list_api_paths: handleListApiPaths,
  get_api_endpoint_details: handleGetApiEndpointDetails,
  get_api_models: handleGetApiModels,
  search_api: handleSearchApi,
  detect_api_frameworks: handleDetectApiFrameworks,
};
