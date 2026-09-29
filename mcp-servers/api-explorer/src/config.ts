// SPDX-License-Identifier: MIT
/**
 * API_EXPLORER_ENDPOINTS parsing.
 *
 * Accepted shapes:
 *  1. A single URL or project-relative file path
 *       http://localhost:8080/v3/api-docs        docs/openapi.yaml
 *  2. A comma-separated list of those
 *  3. A JSON array of strings or objects:
 *       [{"alias":"api","url":"http://localhost:8080/v3/api-docs"},
 *        {"alias":"events","path":"docs/asyncapi.yaml","kind":"asyncapi"},
 *        {"alias":"gql","url":"http://localhost:4000/graphql","kind":"graphql"}]
 *
 * One bad entry no longer discards the whole list: it is reported in
 * `errors` (and by list_api_sources) while the valid entries load.
 */

import type { KindHint } from "./loader.js";
import { resolveProjectPath, type Location } from "./location.js";

export interface SourceInput {
  alias?: string;
  url?: string;
  path?: string;
  kind?: KindHint;
  headers?: Record<string, string>;
  timeout?: number;
  framework?: string;
  openApiLibrary?: string;
}

export interface ParsedSource {
  alias: string;
  location: Location;
  kind: KindHint;
  headers?: Record<string, string>;
  timeoutMs?: number;
  framework?: string;
  openApiLibrary?: string;
}

export interface ParsedConfig {
  sources: ParsedSource[];
  errors: string[];
}

const KINDS = new Set(["openapi", "asyncapi", "graphql", "proto", "auto"]);
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validateAlias(alias: string): string {
  if (!ALIAS_RE.test(alias)) {
    throw new Error(`Invalid alias "${alias}": use 1-64 letters, digits, '.', '_' or '-'`);
  }
  return alias;
}

/** Build a Location from a URL or a project path. */
export function toLocation(input: { url?: string; path?: string }): Location {
  const url = input.url?.trim();
  const path = input.path?.trim();
  if (url && path) throw new Error("Give either url or path, not both");
  if (url) {
    if (/^https?:\/\//i.test(url)) {
      try {
        return { type: "url", url: new URL(url).toString() };
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^file:/i.test(url)) {
      throw new Error(`Unsupported URL scheme in "${url}": use http(s) or a project file path`);
    }
    // A non-http "url" is treated as a file path (including file:// URLs).
    return toLocation({ path: url.replace(/^file:\/\//i, "") });
  }
  if (path) return { type: "file", path: resolveProjectPath(path) };
  throw new Error("A source needs a url or a path");
}

function normaliseKind(raw: unknown): KindHint {
  if (raw === undefined || raw === null || raw === "") return "auto";
  const k = String(raw).toLowerCase();
  if (k === "swagger") return "openapi";
  if (k === "grpc" || k === "protobuf") return "proto";
  if (!KINDS.has(k)) throw new Error(`Unknown kind "${raw}" (expected openapi, asyncapi, graphql, proto or auto)`);
  return k as KindHint;
}

export function buildSource(input: SourceInput, fallbackAlias: string): ParsedSource {
  const alias = validateAlias((input.alias ?? fallbackAlias).trim());
  const source: ParsedSource = {
    alias,
    location: toLocation(input),
    kind: normaliseKind(input.kind),
  };
  if (input.headers) {
    if (typeof input.headers !== "object" || Array.isArray(input.headers)) throw new Error(`headers for "${alias}" must be an object`);
    source.headers = Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k, String(v)]));
  }
  if (input.timeout !== undefined) {
    const t = Number(input.timeout);
    if (!Number.isFinite(t) || t <= 0) throw new Error(`timeout for "${alias}" must be a positive number of milliseconds`);
    source.timeoutMs = t;
  }
  if (input.framework) source.framework = String(input.framework);
  if (input.openApiLibrary) source.openApiLibrary = String(input.openApiLibrary);
  return source;
}

function fromString(value: string, fallbackAlias: string): ParsedSource {
  const v = value.trim();
  return buildSource(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? { url: v } : { path: v }, fallbackAlias);
}

export function parseEndpointsConfig(envValue: string | undefined): ParsedConfig {
  const result: ParsedConfig = { sources: [], errors: [] };
  if (!envValue || envValue.trim() === "") return result;
  const trimmed = envValue.trim();

  const push = (make: () => ParsedSource, label: string) => {
    try {
      const s = make();
      if (result.sources.some((x) => x.alias === s.alias)) throw new Error(`duplicate alias "${s.alias}"`);
      result.sources.push(s);
    } catch (error) {
      result.errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      result.errors.push(`API_EXPLORER_ENDPOINTS is not valid JSON: ${(error as Error).message}`);
      return result;
    }
    if (!Array.isArray(parsed)) {
      result.errors.push("API_EXPLORER_ENDPOINTS JSON must be an array");
      return result;
    }
    parsed.forEach((item, index) => {
      const label = `API_EXPLORER_ENDPOINTS[${index}]`;
      const fallback = `api-${index + 1}`;
      if (typeof item === "string") {
        push(() => fromString(item, fallback), label);
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(
          () =>
            buildSource(
              {
                alias: o.alias as string | undefined,
                url: o.url as string | undefined,
                path: (o.path ?? o.file) as string | undefined,
                kind: (o.kind ?? o.type) as KindHint | undefined,
                headers: o.headers as Record<string, string> | undefined,
                timeout: o.timeout as number | undefined,
                framework: o.framework as string | undefined,
                openApiLibrary: o.openApiLibrary as string | undefined,
              },
              fallback
            ),
          label
        );
      } else {
        result.errors.push(`${label}: must be a string or an object`);
      }
    });
    return result;
  }

  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    push(() => fromString(parts[0], "default"), "API_EXPLORER_ENDPOINTS");
  } else {
    parts.forEach((p, i) => push(() => fromString(p, `api-${i + 1}`), `API_EXPLORER_ENDPOINTS entry ${i + 1}`));
  }
  return result;
}
