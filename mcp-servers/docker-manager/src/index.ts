// SPDX-License-Identifier: MIT
/**
 * Docker Manager MCP Server
 *
 * Docker and Docker Compose management over the docker CLI: containers,
 * exec/cp, images and builds, registries, compose projects, networks,
 * volumes, system info and prune with an exact preview.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { handlers, errorResponse } from "./handlers/index.js";
import {
  CleanupUnusedSchema,
  ComposeActionSchema,
  ContainerActionSchema,
  DockerBuildSchema,
  DockerCpSchema,
  DockerExecSchema,
  DockerPsSchema,
  DockerRegistrySchema,
  DockerRunSchema,
  DockerStatsSchema,
  ImageActionSchema,
  NetworksSchema,
  SystemSchema,
  VolumesSchema,
} from "./handlers/types.js";

const server = new Server(
  {
    name: "docker-manager-server",
    version: "2.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/** The ListTools input schema is generated from the same zod schema the handler validates with. */
function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

const TOOLS = [
  {
    name: "docker_ps",
    description: "List containers with filters (status, label, name, image, compose project, network, health)",
    schema: DockerPsSchema,
  },
  {
    name: "docker_container",
    description: "Container lifecycle + logs, inspect (env redacted), top, port, diff, wait, health, stats",
    schema: ContainerActionSchema,
  },
  {
    name: "docker_run",
    description: "Run or create a container: ports, env, volumes, network, restart, limits, labels, command",
    schema: DockerRunSchema,
  },
  {
    name: "docker_exec",
    description: "Run a command in a running container (non-interactive; user, workdir, env, timeout, output cap)",
    schema: DockerExecSchema,
  },
  {
    name: "docker_cp",
    description: "Copy files between a container and the host (host path confined to allowed roots)",
    schema: DockerCpSchema,
  },
  {
    name: "docker_compose",
    description: "Docker Compose on a chosen project (dir, files, name, profiles): up, down, ps, logs, exec, run, config…",
    schema: ComposeActionSchema,
  },
  {
    name: "docker_images",
    description: "Images: list, pull, remove, inspect, history, tag, push, search, save, load",
    schema: ImageActionSchema,
  },
  {
    name: "docker_build",
    description: "Build an image (context, Dockerfile, tags, build args, target, platform, no-cache); returns image ID",
    schema: DockerBuildSchema,
  },
  {
    name: "docker_registry",
    description: "Registry login (password via stdin, never echoed) and logout",
    schema: DockerRegistrySchema,
  },
  {
    name: "docker_stats",
    description: "Show resource usage statistics for containers",
    schema: DockerStatsSchema,
  },
  {
    name: "docker_networks",
    description: "Networks: list, inspect, create, remove, connect, disconnect, prune (exact preview)",
    schema: NetworksSchema,
  },
  {
    name: "docker_volumes",
    description: "Volumes: list, inspect, create, remove, prune (exact preview, dry run by default)",
    schema: VolumesSchema,
  },
  {
    name: "docker_system",
    description: "Daemon status, disk usage (df), info, version, bounded event window, contexts",
    schema: SystemSchema,
  },
  {
    name: "cleanup_unused",
    description: "Prune unused resources; dry run (default) lists exactly what would go; volumes need opt-in",
    schema: CleanupUnusedSchema,
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: inputSchema(t.schema) })),
}));

// Handle tool calls using handlers registry
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = handlers[name];
  if (!handler) {
    return errorResponse(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Docker Manager MCP Server running on stdio");
}

main().catch(console.error);
