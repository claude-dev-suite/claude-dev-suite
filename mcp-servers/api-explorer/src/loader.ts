// SPDX-License-Identifier: MIT
/**
 * Load API description documents from URLs, project files or git revisions,
 * detect what they are (OpenAPI/Swagger, AsyncAPI, GraphQL, protobuf), pull in
 * every external `$ref` target, and cache the result.
 *
 * Cached documents are deep-frozen. The previous implementation handed the
 * cached object to handlers that then wrote dereferenced schemas back into it,
 * so the second call on the same spec returned a different (partially
 * resolved) document than the first. Freezing makes any such write throw
 * instead of silently corrupting the cache; every view builds new objects.
 */

import { readFile, stat } from "fs/promises";
import { extname } from "path";
import { getIntrospectionQuery } from "graphql";
import { parse as parseYaml } from "yaml";
import { getSettings } from "./env.js";
import { fetchText } from "./http.js";
import { gitShow } from "./git.js";
import { isLiteralDataKey, isNameMap } from "./refs.js";
import { describeLocation, locationKey, resolveRefLocation, type Location } from "./location.js";

export type DocKind = "openapi" | "asyncapi" | "graphql" | "proto";
export type KindHint = DocKind | "auto";
export type DocFormat = "json" | "yaml" | "graphql-sdl" | "graphql-introspection" | "proto";

export interface LoadedDocument {
  kind: DocKind;
  format: DocFormat;
  location: Location;
  key: string;
  /** Parsed structure (OpenAPI/AsyncAPI/introspection); raw text for SDL and proto. */
  doc: unknown;
  /** Documents reached through external `$ref`s, keyed by locationKey. */
  externals: ReadonlyMap<string, unknown>;
  externalErrors: ReadonlyMap<string, string>;
  warnings: string[];
  loadedAt: number;
}

export interface LoadOptions {
  kind?: KindHint;
  headers?: Record<string, string>;
  timeoutMs?: number;
  refresh?: boolean;
}

const MAX_EXTERNAL_DOCS = 64;

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Raw text
// ---------------------------------------------------------------------------

interface RawText {
  text: string;
  contentType?: string;
  mtimeMs?: number;
}

async function readRaw(loc: Location, opts: LoadOptions, post?: string): Promise<RawText> {
  const settings = getSettings();
  switch (loc.type) {
    case "url": {
      const headers: Record<string, string> = {
        Accept: post
          ? "application/json"
          : "application/json, application/yaml, application/vnd.oai.openapi, text/yaml, text/plain;q=0.8, */*;q=0.5",
        ...(post ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      };
      const res = await fetchText(loc.url, {
        method: post ? "POST" : "GET",
        body: post,
        headers,
        timeoutMs: opts.timeoutMs,
      });
      return { text: res.text, contentType: res.contentType };
    }
    case "file": {
      let st;
      try {
        st = await stat(loc.path);
      } catch {
        throw new Error(`File not found: ${describeLocation(loc)}`);
      }
      if (!st.isFile()) throw new Error(`Not a file: ${describeLocation(loc)}`);
      if (st.size > settings.maxSpecBytes) {
        throw new Error(`${describeLocation(loc)} is ${st.size} bytes, over the API_EXPLORER_MAX_SPEC_BYTES limit`);
      }
      return { text: await readFile(loc.path, "utf-8"), mtimeMs: st.mtimeMs };
    }
    case "git":
      return { text: await gitShow(loc.ref, loc.path, loc.repoRoot) };
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function locationPath(loc: Location): string {
  if (loc.type === "url") {
    try {
      return new URL(loc.url).pathname;
    } catch {
      return loc.url;
    }
  }
  return loc.path;
}

export function parseStructured(text: string, name = "document"): { value: unknown; format: "json" | "yaml" } {
  const body = text.replace(/^﻿/, "");
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { value: JSON.parse(body), format: "json" };
    } catch {
      // Could still be YAML flow style; fall through.
    }
  }
  try {
    const value = parseYaml(body, { merge: true, uniqueKeys: false, maxAliasCount: 10_000 });
    return { value, format: "yaml" };
  } catch (error) {
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new Error(`Could not parse ${name} as JSON or YAML: ${msg}`);
  }
}

function detectStructuredKind(value: unknown): DocKind | "graphql-introspection" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.openapi === "string" || typeof v.swagger === "string") return "openapi";
  if (typeof v.asyncapi === "string") return "asyncapi";
  if (v.__schema || (v.data && typeof v.data === "object" && (v.data as Record<string, unknown>).__schema)) {
    return "graphql-introspection";
  }
  return null;
}

const SDL_HINT = /(^|\n)\s*(type|schema|interface|input|enum|union|scalar|directive|extend)\s+[A-Za-z_@{]/;
const PROTO_HINT = /(^|\n)\s*(syntax\s*=|package\s+[\w.]+\s*;|service\s+\w+\s*\{|message\s+\w+\s*\{)/;

function validateOpenApi(value: Record<string, unknown>, warnings: string[]): void {
  const version = String(value.openapi ?? value.swagger ?? "");
  const isSwagger2 = typeof value.swagger === "string";
  if (isSwagger2 && !version.startsWith("2.")) throw new Error(`Unsupported Swagger version "${version}" (expected 2.x)`);
  if (!isSwagger2 && !version.startsWith("3.")) throw new Error(`Unsupported OpenAPI version "${version}" (expected 3.x)`);
  if (!value.info || typeof value.info !== "object") warnings.push("Missing required 'info' object");
  const is31 = version.startsWith("3.1") || version.startsWith("3.2");
  if (!value.paths && !is31) warnings.push("Missing required 'paths' object");
  if (is31 && !value.paths && !value.webhooks && !value.components) {
    warnings.push("OpenAPI 3.1 document has none of 'paths', 'webhooks' or 'components'");
  }
}

// ---------------------------------------------------------------------------
// External references
// ---------------------------------------------------------------------------

/** Every distinct `$ref` string in a document, skipping literal example data. */
export function collectRefs(value: unknown, out = new Set<string>(), parentKey = ""): Set<string> {
  if (Array.isArray(value)) {
    if (parentKey === "examples") return out; // JSON Schema `examples` is data
    for (const v of value) collectRefs(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "$ref" && typeof v === "string") out.add(v);
      else if (isLiteralDataKey(k, parentKey)) continue;
      else collectRefs(v, out, isNameMap(parentKey) ? "" : k);
    }
  }
  return out;
}

async function loadExternals(
  root: unknown,
  rootLoc: Location,
  opts: LoadOptions
): Promise<{ externals: Map<string, unknown>; errors: Map<string, string> }> {
  const externals = new Map<string, unknown>();
  const errors = new Map<string, string>();
  const rootKey = locationKey(rootLoc);
  const queue: Array<{ value: unknown; loc: Location }> = [{ value: root, loc: rootLoc }];

  while (queue.length > 0) {
    const { value, loc } = queue.shift()!;
    for (const ref of collectRefs(value)) {
      const hash = ref.indexOf("#");
      const docPart = hash === -1 ? ref : ref.slice(0, hash);
      if (!docPart) continue;
      let target: Location;
      try {
        target = resolveRefLocation(loc, docPart);
      } catch (error) {
        errors.set(`${locationKey(loc)}|${docPart}`, error instanceof Error ? error.message : String(error));
        continue;
      }
      const key = locationKey(target);
      if (key === rootKey || externals.has(key) || errors.has(key)) continue;
      if (externals.size + errors.size >= MAX_EXTERNAL_DOCS) {
        errors.set(key, `External document limit (${MAX_EXTERNAL_DOCS}) reached`);
        continue;
      }
      try {
        // Headers are only forwarded to the same origin as the root document.
        const sameOrigin =
          rootLoc.type === "url" && target.type === "url" && new URL(rootLoc.url).origin === new URL(target.url).origin;
        const raw = await readRaw(target, { ...opts, headers: sameOrigin ? opts.headers : undefined });
        const parsed = parseStructured(raw.text, describeLocation(target)).value;
        externals.set(key, deepFreeze(parsed));
        queue.push({ value: parsed, loc: target });
      } catch (error) {
        errors.set(key, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return { externals, errors };
}

// ---------------------------------------------------------------------------
// Public API + cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  doc: LoadedDocument;
  expiresAt: number;
  mtimeMs?: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(loc: Location, opts: LoadOptions): string {
  const headerNames = Object.keys(opts.headers ?? {}).sort().join(",");
  return `${opts.kind ?? "auto"}|${locationKey(loc)}|${headerNames}`;
}

export function clearDocumentCache(): void {
  cache.clear();
}

export async function loadDocument(loc: Location, opts: LoadOptions = {}): Promise<LoadedDocument> {
  const key = cacheKey(loc, opts);
  const settings = getSettings();
  const hit = cache.get(key);
  if (hit && !opts.refresh) {
    if (loc.type === "file") {
      // A local file is re-read as soon as it changes — no stale TTL window.
      const st = await stat(loc.path).catch(() => undefined);
      if (st && st.mtimeMs === hit.mtimeMs) return hit.doc;
    } else if (Date.now() < hit.expiresAt) {
      return hit.doc;
    }
  }

  const doc = await loadUncached(loc, opts);
  const raw = doc as LoadedDocument & { _mtimeMs?: number };
  cache.set(key, {
    doc,
    expiresAt: Date.now() + settings.cacheTtlMs,
    mtimeMs: raw._mtimeMs,
  });
  delete raw._mtimeMs;
  return doc;
}

async function loadUncached(loc: Location, opts: LoadOptions): Promise<LoadedDocument> {
  const hint = opts.kind ?? "auto";
  const name = describeLocation(loc);
  const ext = extname(locationPath(loc)).toLowerCase();
  const warnings: string[] = [];
  const base = { location: loc, key: locationKey(loc), warnings, loadedAt: Date.now() };
  const empty = { externals: new Map<string, unknown>(), externalErrors: new Map<string, string>() };

  // GraphQL endpoint: run the standard introspection query.
  if (loc.type === "url" && (hint === "graphql" || (hint === "auto" && /\/graphql\/?$/i.test(locationPath(loc))))) {
    const raw = await readRaw(loc, opts, JSON.stringify({ query: getIntrospectionQuery({ descriptions: true }) }));
    const parsed = parseStructured(raw.text, name).value as Record<string, unknown>;
    if (Array.isArray(parsed?.errors) && !parsed?.data) {
      const first = (parsed.errors as Array<{ message?: string }>)[0]?.message ?? "unknown error";
      throw new Error(`GraphQL introspection failed at ${name}: ${first} (is introspection disabled?)`);
    }
    if (detectStructuredKind(parsed) !== "graphql-introspection") {
      throw new Error(`${name} did not return a GraphQL introspection result`);
    }
    return { ...base, ...empty, kind: "graphql", format: "graphql-introspection", doc: deepFreeze(parsed) };
  }

  const raw = await readRaw(loc, opts);
  const withMtime = <T extends LoadedDocument>(d: T): T => Object.assign(d, { _mtimeMs: raw.mtimeMs });

  if (hint === "proto" || ext === ".proto") {
    return withMtime({ ...base, ...empty, kind: "proto", format: "proto", doc: raw.text });
  }
  if ([".graphql", ".gql", ".graphqls", ".sdl"].includes(ext) || (hint === "graphql" && !raw.text.trimStart().startsWith("{"))) {
    return withMtime({ ...base, ...empty, kind: "graphql", format: "graphql-sdl", doc: raw.text });
  }

  // Text formats that are not JSON/YAML objects, recognised by content.
  const sniffText = (): LoadedDocument | undefined => {
    if (hint !== "auto") return undefined;
    if (PROTO_HINT.test(raw.text)) return withMtime({ ...base, ...empty, kind: "proto", format: "proto", doc: raw.text });
    if (SDL_HINT.test(raw.text)) return withMtime({ ...base, ...empty, kind: "graphql", format: "graphql-sdl", doc: raw.text });
    return undefined;
  };

  let parsed: { value: unknown; format: "json" | "yaml" };
  try {
    parsed = parseStructured(raw.text, name);
  } catch (error) {
    const sniffed = sniffText();
    if (sniffed) return sniffed;
    throw error;
  }
  const detected = detectStructuredKind(parsed.value);
  if (detected === "graphql-introspection") {
    return withMtime({ ...base, ...empty, kind: "graphql", format: "graphql-introspection", doc: deepFreeze(parsed.value) });
  }
  if (!detected) {
    const sniffed = typeof parsed.value === "object" && parsed.value !== null ? undefined : sniffText();
    if (sniffed) return sniffed;
    const snippet = raw.text.trimStart().slice(0, 60).replace(/\s+/g, " ");
    throw new Error(
      `${name} is not an OpenAPI/Swagger, AsyncAPI or GraphQL introspection document ` +
        `(no 'openapi', 'swagger' or 'asyncapi' field). Starts with: "${snippet}"`
    );
  }
  if (hint !== "auto" && hint !== detected) {
    throw new Error(`${name} is an ${detected} document, but kind "${hint}" was requested`);
  }
  if (detected === "openapi") validateOpenApi(parsed.value as Record<string, unknown>, warnings);

  const { externals, errors } = await loadExternals(parsed.value, loc, opts);
  for (const [k, e] of errors) warnings.push(`External reference ${k.includes("|") ? k.split("|")[1] : k} could not be loaded: ${e}`);
  return withMtime({
    ...base,
    kind: detected,
    format: parsed.format,
    doc: deepFreeze(parsed.value),
    externals,
    externalErrors: errors,
  });
}
