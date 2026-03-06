// SPDX-License-Identifier: MIT
/**
 * Docker Manager handler types and schemas
 */

import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Validate a Docker name (container, image, service, network, volume) */
export function validateDockerName(name: string): string {
  // Docker names: alphanumeric, hyphens, underscores, periods, colons (for tags), slashes (for registries)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]*$/.test(name)) {
    throw new Error(`Invalid Docker name: ${name}`);
  }
  if (name.length > 256) {
    throw new Error(`Docker name too long: ${name}`);
  }
  return name;
}

// ============================================================================
// HANDLER TYPES
// ============================================================================

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const DockerPsSchema = z.object({
  all: z.boolean().optional().default(false),
});

export const ContainerActionSchema = z.object({
  container: z.string().describe("Container name or ID"),
  action: z.enum(["start", "stop", "restart", "logs", "inspect"]),
  tail: z.number().optional().default(100).describe("Number of log lines (for logs action)"),
});

export const ComposeActionSchema = z.object({
  action: z.enum(["up", "down", "ps", "logs", "build", "restart"]),
  service: z.string().optional().describe("Specific service name"),
  detach: z.boolean().optional().default(true),
  build: z.boolean().optional().describe("Build images before starting (for up)"),
});

export const ImageActionSchema = z.object({
  action: z.enum(["list", "pull", "remove", "inspect"]),
  image: z.string().optional().describe("Image name (required for pull/remove/inspect)"),
});

export const DockerStatsSchema = z.object({
  container: z.string().optional(),
});

export const CleanupUnusedSchema = z.object({
  target: z.enum(["all", "images", "containers", "volumes", "networks"]).optional().default("all"),
  force: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
});

// ============================================================================
// HELPERS
// ============================================================================

export function jsonResponse(data: object): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function errorResponse(message: string): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export async function runDockerCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return { stdout, stderr };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const execError = error as { stdout: string; stderr: string; message: string };
      throw new Error(`Docker command failed: ${execError.stderr || execError.message}`);
    }
    throw error;
  }
}
