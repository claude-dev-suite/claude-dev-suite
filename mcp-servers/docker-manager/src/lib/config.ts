// SPDX-License-Identifier: MIT
/**
 * Runtime configuration, read from the environment once per call so tests can
 * change it without re-importing the module.
 *
 * DOCKER_HOST and DOCKER_CONTEXT are not interpreted here: the docker CLI reads
 * them itself, and the child process inherits the server's environment. They
 * are read only to report which endpoint is in effect.
 */

import * as path from "path";

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export interface DockerMcpConfig {
  /** CLI binary: `docker` by default, `podman` works for most tools. */
  cli: string;
  /** Default timeout for short commands (list, inspect, start, stop…). */
  timeoutMs: number;
  /** Timeout for long commands (build, pull, push, compose up/build/pull). */
  longTimeoutMs: number;
  /** Per-stream output cap for a single command. */
  maxOutputBytes: number;
  /** Host directories that host-side paths (cp, build context, compose dir, env files, bind mounts) must stay inside. */
  allowedRoots: string[];
  /** Endpoint overrides the CLI will honour, reported by docker_system status. */
  dockerHost?: string;
  dockerContext?: string;
}

export function getConfig(): DockerMcpConfig {
  const rootsRaw = process.env.DOCKER_MCP_ALLOWED_ROOTS;
  const roots = (rootsRaw && rootsRaw.trim() !== ""
    ? rootsRaw.split(path.delimiter)
    : [process.cwd()])
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => path.resolve(r));

  const cli = (process.env.DOCKER_CLI ?? "").trim() || "docker";

  return {
    cli,
    timeoutMs: intFromEnv("DOCKER_MCP_TIMEOUT_MS", 60_000, 1_000, 3_600_000),
    longTimeoutMs: intFromEnv("DOCKER_MCP_LONG_TIMEOUT_MS", 1_800_000, 10_000, 14_400_000),
    maxOutputBytes: intFromEnv("DOCKER_MCP_MAX_OUTPUT_BYTES", 256 * 1024, 4 * 1024, 16 * 1024 * 1024),
    allowedRoots: roots.length > 0 ? roots : [process.cwd()],
    dockerHost: process.env.DOCKER_HOST || undefined,
    dockerContext: process.env.DOCKER_CONTEXT || undefined,
  };
}
