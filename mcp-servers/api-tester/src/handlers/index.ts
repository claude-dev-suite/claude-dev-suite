// SPDX-License-Identifier: MIT
/**
 * API Tester handlers registry
 */

// Type exports
export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse, makeRequest } from "./types.js";

// Schema exports
export {
  HttpRequestSchema,
  HealthCheckSchema,
  BatchRequestSchema,
  ImportCollectionSchema,
  GenerateTestsSchema,
  MockServerSchema,
} from "./types.js";

// Handler imports
import type { Handler } from "./types.js";
import {
  handleHttpRequest,
  handleHealthCheck,
  handleBatchRequest,
  handleImportCollection,
  handleGenerateTests,
  handleMockServer,
} from "./api-tester-handlers.js";

// Handler exports
export {
  handleHttpRequest,
  handleHealthCheck,
  handleBatchRequest,
  handleImportCollection,
  handleGenerateTests,
  handleMockServer,
} from "./api-tester-handlers.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  http_request: handleHttpRequest,
  health_check: handleHealthCheck,
  batch_request: handleBatchRequest,
  import_collection: handleImportCollection,
  generate_tests: handleGenerateTests,
  mock_server: handleMockServer,
};
