// SPDX-License-Identifier: MIT
/**
 * Every environment variable the server reads lives here, so `metadata.json`
 * can be checked against one file instead of a grep across the tree.
 *
 *  - API_EXPLORER_ENDPOINTS        sources to load at startup (see config.ts)
 *  - API_EXPLORER_PROJECT_ROOT     directory local spec files are confined to
 *  - API_EXPLORER_CACHE_TTL        seconds a loaded URL spec is cached
 *  - API_EXPLORER_TIMEOUT          per-request HTTP timeout in milliseconds
 *  - API_EXPLORER_RETRY_COUNT      retries for transient HTTP failures
 *  - API_EXPLORER_MAX_SPEC_BYTES   hard cap on a fetched/read document
 *  - API_EXPLORER_ALLOW_PRIVATE_URLS  "0" blocks loopback/private hosts
 *    (cloud metadata 169.254.0.0/16 is blocked regardless)
 */

import { resolve } from "path";

function envInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export interface Settings {
  cacheTtlMs: number;
  timeoutMs: number;
  retryCount: number;
  maxSpecBytes: number;
  allowPrivate: boolean;
  projectRoot: string;
}

export function getSettings(): Settings {
  const allowRaw = (process.env.API_EXPLORER_ALLOW_PRIVATE_URLS ?? "1").trim().toLowerCase();
  return {
    cacheTtlMs: envInt("API_EXPLORER_CACHE_TTL", 300, 0, 86_400) * 1000,
    timeoutMs: envInt("API_EXPLORER_TIMEOUT", 30_000, 1_000, 300_000),
    retryCount: envInt("API_EXPLORER_RETRY_COUNT", 2, 0, 5),
    maxSpecBytes: envInt("API_EXPLORER_MAX_SPEC_BYTES", 20 * 1024 * 1024, 1024, 200 * 1024 * 1024),
    // Local dev servers (localhost, 127.0.0.1, LAN hosts) are the primary use
    // case, so private ranges are allowed unless the operator turns them off.
    allowPrivate: !["0", "false", "no", "off"].includes(allowRaw),
    projectRoot: resolve(process.env.API_EXPLORER_PROJECT_ROOT?.trim() || process.cwd()),
  };
}
