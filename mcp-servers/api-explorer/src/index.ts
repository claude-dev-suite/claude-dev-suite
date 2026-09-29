// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server
 *
 * Explore, lint and diff API descriptions: OpenAPI 3.0/3.1 and Swagger 2.0
 * (URL, project file or git revision), GraphQL (SDL or introspection),
 * AsyncAPI 2/3 and protobuf/gRPC. Sources come from API_EXPLORER_ENDPOINTS
 * and can be added at runtime.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Schemas, type ToolName } from "./handlers/schemas.js";
import { handlers, formatError, errorResponse } from "./handlers/handlers.js";
import { initSourcesFromEnv, listSources } from "./sources.js";

const configErrors = initSourcesFromEnv(process.env.API_EXPLORER_ENDPOINTS);
for (const e of configErrors) console.error(`[api-explorer] config: ${e}`);

const server = new Server({ name: "api-explorer", version: "2.3.0" }, { capabilities: { tools: {} } });

function input(name: ToolName): Record<string, unknown> {
  const schema = z.toJSONSchema(Schemas[name], { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

const TOOLS = [
  {
    name: "list_api_endpoints",
    description: "List registered API sources (alias, location, kind, origin). Same as list_api_sources; kept for compatibility.",
    inputSchema: input("list_api_endpoints"),
  },
  {
    name: "list_api_sources",
    description: "List registered API sources (env + runtime) with alias, location, kind, and any config errors",
    inputSchema: input("list_api_sources"),
  },
  {
    name: "add_api_source",
    description: "Register a spec at runtime: URL or project file (OpenAPI/Swagger, AsyncAPI, GraphQL SDL/endpoint, .proto)",
    inputSchema: input("add_api_source"),
  },
  {
    name: "remove_api_source",
    description: "Unregister an API source by alias for the rest of this session",
    inputSchema: input("remove_api_source"),
  },
  {
    name: "get_api_schema",
    description: "Get a source's full document (size-capped) or a summary: version, servers, tags, counts, webhooks",
    inputSchema: input("get_api_schema"),
  },
  {
    name: "list_api_paths",
    description: "List OpenAPI operations and webhooks, filtered by tag/method/prefix, paginated",
    inputSchema: input("list_api_paths"),
  },
  {
    name: "get_api_endpoint_details",
    description: "Operation details: params, bodies per media type, responses, headers, security, servers, callbacks; refs resolved",
    inputSchema: input("get_api_endpoint_details"),
  },
  {
    name: "match_api_operation",
    description: "Match a concrete URL and method (GET /users/42) to its OpenAPI operation (/users/{id}) with path params",
    inputSchema: input("match_api_operation"),
  },
  {
    name: "get_api_models",
    description: "List or get schema models (components.schemas / definitions) with usage, optional $ref resolution and examples",
    inputSchema: input("get_api_models"),
  },
  {
    name: "get_api_security",
    description: "Security schemes, global requirements, operations per scheme and unauthenticated operations",
    inputSchema: input("get_api_security"),
  },
  {
    name: "search_api",
    description: "Ranked search across sources: operations, models, tags, GraphQL fields/types, channels, messages, rpcs",
    inputSchema: input("search_api"),
  },
  {
    name: "lint_api_spec",
    description: "Lint an OpenAPI spec with a Spectral-style ruleset (operationIds, path params, refs, unused components...)",
    inputSchema: input("lint_api_spec"),
  },
  {
    name: "diff_api_specs",
    description: "Diff two OpenAPI specs (alias, file, URL or git ref) and classify changes as breaking/non-breaking/info",
    inputSchema: input("diff_api_specs"),
  },
  {
    name: "generate_api_request",
    description: "Generate curl, HTTPie, fetch and Python requests snippets plus a sample body for an operation",
    inputSchema: input("generate_api_request"),
  },
  {
    name: "list_graphql_operations",
    description: "List GraphQL queries, mutations and subscriptions with arguments and return types",
    inputSchema: input("list_graphql_operations"),
  },
  {
    name: "list_graphql_types",
    description: "List GraphQL types, optionally filtered by kind (object, interface, union, enum, input, scalar)",
    inputSchema: input("list_graphql_types"),
  },
  {
    name: "get_graphql_type",
    description: "Get a GraphQL type: fields with args, interfaces, implementations, enum values, input fields and SDL",
    inputSchema: input("get_graphql_type"),
  },
  {
    name: "list_asyncapi_channels",
    description: "List AsyncAPI 2/3 channels with their operations (publish/subscribe or send/receive) and messages",
    inputSchema: input("list_asyncapi_channels"),
  },
  {
    name: "get_asyncapi_message",
    description: "Get an AsyncAPI message with resolved payload and headers, or list all messages",
    inputSchema: input("get_asyncapi_message"),
  },
  {
    name: "list_grpc_services",
    description: "List gRPC services in a .proto source with RPCs, request/response types and streaming mode",
    inputSchema: input("list_grpc_services"),
  },
  {
    name: "get_proto_message",
    description: "Get a protobuf message (fields, numbers, oneofs, maps) or enum from a .proto source",
    inputSchema: input("get_proto_message"),
  },
  {
    name: "discover_api_specs",
    description: "Find OpenAPI/Swagger, AsyncAPI, GraphQL and .proto files in the project; optionally register them",
    inputSchema: input("discover_api_specs"),
  },
  {
    name: "detect_api_frameworks",
    description: "Detect API frameworks per module with confidence, evidence, candidate docs URLs and checked-in spec files",
    inputSchema: input("detect_api_frameworks"),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name as ToolName];
  if (!handler) return errorResponse(`Unknown tool: ${name}`);
  try {
    return await handler(args ?? {});
  } catch (error) {
    return formatError(error);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`API Explorer MCP server running on stdio (${listSources().length} source(s) configured)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
