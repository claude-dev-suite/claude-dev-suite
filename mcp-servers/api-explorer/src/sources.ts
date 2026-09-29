// SPDX-License-Identifier: MIT
/**
 * The registry of API sources: those configured through
 * API_EXPLORER_ENDPOINTS at startup plus any registered at runtime with
 * add_api_source. Runtime registrations live for the server process only.
 */

import { buildSource, parseEndpointsConfig, type ParsedSource, type SourceInput } from "./config.js";
import { loadDocument, type KindHint, type LoadedDocument } from "./loader.js";
import { describeLocation, type Location } from "./location.js";
import { toRepoPath } from "./git.js";
import { describeHeaders } from "./redact.js";

export interface ApiSource extends ParsedSource {
  origin: "env" | "runtime";
}

const registry = new Map<string, ApiSource>();
let configErrors: string[] = [];

export function initSourcesFromEnv(envValue: string | undefined): string[] {
  registry.clear();
  const parsed = parseEndpointsConfig(envValue);
  for (const s of parsed.sources) registry.set(s.alias, { ...s, origin: "env" });
  configErrors = parsed.errors;
  return parsed.errors;
}

export function getConfigErrors(): string[] {
  return [...configErrors];
}

export function listSources(): ApiSource[] {
  return [...registry.values()];
}

export function aliases(): string[] {
  return [...registry.keys()];
}

export function addSource(input: SourceInput & { alias: string }, replace = false): ApiSource {
  const parsed = buildSource(input, input.alias);
  if (registry.has(parsed.alias) && !replace) {
    throw new Error(`Alias "${parsed.alias}" already exists; pass replace=true to overwrite it`);
  }
  const source: ApiSource = { ...parsed, origin: "runtime" };
  registry.set(source.alias, source);
  return source;
}

/** Reinstate a source exactly as it was (used to roll back a failed replace). */
export function putSource(source: ApiSource): void {
  registry.set(source.alias, source);
}

export function removeSource(alias: string): ApiSource {
  const s = registry.get(alias);
  if (!s) throw new Error(`Alias "${alias}" not found. Available: ${aliases().join(", ") || "(none)"}`);
  registry.delete(alias);
  return s;
}

function noSourcesError(): Error {
  return new Error(
    "No API sources configured. Register one with add_api_source (url or project file path), " +
      "find spec files with discover_api_specs, or set API_EXPLORER_ENDPOINTS."
  );
}

export function getSource(alias: string): ApiSource {
  const s = registry.get(alias);
  if (!s) {
    throw new Error(`Alias "${alias}" not found. Available: ${aliases().join(", ") || "(none)"}`);
  }
  return s;
}

/** All sources, or the one named. */
export function selectSources(alias?: string): ApiSource[] {
  if (alias) return [getSource(alias)];
  if (registry.size === 0) throw noSourcesError();
  return listSources();
}

/** Exactly one source: the one named, or the only one registered. */
export function requireOne(alias?: string): ApiSource {
  if (alias) return getSource(alias);
  if (registry.size === 0) throw noSourcesError();
  if (registry.size === 1) return listSources()[0];
  throw new Error(`alias is required when several sources are registered. Available: ${aliases().join(", ")}`);
}

export function loadSource(source: ApiSource, refresh = false): Promise<LoadedDocument> {
  return loadDocument(source.location, {
    kind: source.kind,
    headers: source.headers,
    timeoutMs: source.timeoutMs,
    refresh,
  });
}

export function publicSource(s: ApiSource): Record<string, unknown> {
  return {
    alias: s.alias,
    location: describeLocation(s.location),
    locationType: s.location.type,
    kind: s.kind,
    origin: s.origin,
    ...(s.framework && { framework: s.framework }),
    ...(s.openApiLibrary && { openApiLibrary: s.openApiLibrary }),
    ...(describeHeaders(s.headers) && { headerNames: describeHeaders(s.headers) }),
  };
}

// ---------------------------------------------------------------------------
// Ad-hoc spec references (lint/diff can target a file, URL or git revision
// that is not a registered source)
// ---------------------------------------------------------------------------

export interface SpecRef {
  alias?: string;
  url?: string;
  path?: string;
  gitRef?: string;
  kind?: KindHint;
}

export function describeSpecRef(ref: SpecRef): string {
  if (ref.gitRef) return `${ref.gitRef}:${ref.path ?? (ref.alias ? `<${ref.alias}>` : "?")}`;
  if (ref.alias) return ref.alias;
  return ref.url ?? ref.path ?? "?";
}

export async function loadSpecRef(ref: SpecRef, refresh = false): Promise<LoadedDocument> {
  const given = [ref.alias, ref.url, ref.path].filter(Boolean).length;
  if (ref.gitRef) {
    // A git revision of a file: of `path`, or of the file a file-based alias points at.
    let pathInput = ref.path;
    if (!pathInput && ref.alias) {
      const s = getSource(ref.alias);
      if (s.location.type !== "file") throw new Error(`gitRef needs a file-based source; "${ref.alias}" is a ${s.location.type}`);
      pathInput = s.location.path;
    }
    if (!pathInput) throw new Error("gitRef requires path (or a file-based alias)");
    const { repoRoot, repoPath } = await toRepoPath(pathInput);
    const loc: Location = { type: "git", ref: ref.gitRef, path: repoPath, repoRoot };
    return loadDocument(loc, { kind: ref.kind ?? "auto", refresh });
  }
  if (given !== 1) throw new Error("Specify exactly one of alias, url or path (optionally with gitRef)");
  if (ref.alias) return loadSource(getSource(ref.alias), refresh);
  const loc = ref.url
    ? buildSource({ url: ref.url }, "adhoc").location
    : buildSource({ path: ref.path }, "adhoc").location;
  return loadDocument(loc, { kind: ref.kind ?? "auto", refresh });
}
