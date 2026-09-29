// SPDX-License-Identifier: MIT
/**
 * API Tester handlers registry + input schemas.
 */

export type { Handler, HandlerResult } from './types.js';
export { jsonResponse, errorResponse, toInputSchema } from './types.js';

import type { Handler } from './types.js';
import { HttpRequestSchema, HealthCheckSchema, BatchRequestSchema } from './http-handlers.js';
import { ImportCollectionSchema, ExportCollectionSchema } from './collection-handlers.js';
import { GenerateTestsSchema, MockServerSchema, ValidateContractSchema } from './spec-handlers.js';
import {
  EnvironmentSchema,
  SessionSchema,
  RunScenarioSchema,
  GraphqlSchema,
  WebSocketSchema,
  SseSchema,
  LoadTestSchema,
} from './advanced-handlers.js';
import {
  handleHttpRequest,
  handleHealthCheck,
  handleBatchRequest,
  handleImportCollection,
  handleExportCollection,
  handleGenerateTests,
  handleMockServer,
  handleValidateContract,
  handleEnvironment,
  handleSession,
  handleRunScenario,
  handleGraphql,
  handleWebSocket,
  handleSse,
  handleLoadTest,
} from './api-tester-handlers.js';

export * from './api-tester-handlers.js';

export const schemas = {
  http_request: HttpRequestSchema,
  health_check: HealthCheckSchema,
  batch_request: BatchRequestSchema,
  import_collection: ImportCollectionSchema,
  export_collection: ExportCollectionSchema,
  generate_tests: GenerateTestsSchema,
  mock_server: MockServerSchema,
  validate_contract: ValidateContractSchema,
  environment: EnvironmentSchema,
  session: SessionSchema,
  run_scenario: RunScenarioSchema,
  graphql_request: GraphqlSchema,
  websocket: WebSocketSchema,
  sse_listen: SseSchema,
  load_test: LoadTestSchema,
} as const;

export type ToolName = keyof typeof schemas;

/** Handler registry — maps tool names to their handlers. */
export const handlers: Record<ToolName, Handler> = {
  http_request: handleHttpRequest,
  health_check: handleHealthCheck,
  batch_request: handleBatchRequest,
  import_collection: handleImportCollection,
  export_collection: handleExportCollection,
  generate_tests: handleGenerateTests,
  mock_server: handleMockServer,
  validate_contract: handleValidateContract,
  environment: handleEnvironment,
  session: handleSession,
  run_scenario: handleRunScenario,
  graphql_request: handleGraphql,
  websocket: handleWebSocket,
  sse_listen: handleSse,
  load_test: handleLoadTest,
};
