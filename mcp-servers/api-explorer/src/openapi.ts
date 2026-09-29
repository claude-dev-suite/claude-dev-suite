// SPDX-License-Identifier: MIT
/**
 * Read-only views over an OpenAPI 3.0/3.1 or Swagger 2.0 document.
 *
 * Nothing here mutates the (frozen, cached) document. Swagger 2.0 shapes are
 * presented in OpenAPI 3 form where that is what a caller needs — a `body`
 * or `formData` parameter becomes a `requestBody` with per-media-type
 * content, a response `schema` becomes `content` keyed by `produces` — so
 * callers do not need two code paths, and the old gap where Swagger 2 bodies
 * were never resolved disappears.
 */

import type { LoadedDocument } from "./loader.js";
import { collectRefs } from "./loader.js";
import { contextFor, Dereferencer, evaluatePointer, refName, type DerefOptions } from "./refs.js";
import { redactUrl } from "./redact.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export interface OpenApiView {
  loaded: LoadedDocument;
  doc: Json;
  version: string;
  family: "swagger2" | "openapi3";
  /** "2.0" | "3.0" | "3.1" (3.2 is treated like 3.1) */
  line: "2.0" | "3.0" | "3.1";
}

export function openApiView(loaded: LoadedDocument, alias?: string): OpenApiView {
  if (loaded.kind !== "openapi") {
    const hint =
      loaded.kind === "graphql"
        ? "use list_graphql_operations / get_graphql_type"
        : loaded.kind === "asyncapi"
          ? "use list_asyncapi_channels / list_asyncapi_messages"
          : "use list_grpc_services / get_proto_message";
    throw new Error(`${alias ? `Source "${alias}"` : "This document"} is ${loaded.kind}, not OpenAPI — ${hint}`);
  }
  const doc = loaded.doc as Json;
  const version = String(doc.openapi ?? doc.swagger ?? "");
  const family = doc.swagger ? "swagger2" : "openapi3";
  const line = family === "swagger2" ? "2.0" : version.startsWith("3.0") ? "3.0" : "3.1";
  return { loaded, doc, version, family, line };
}

export function newDeref(view: OpenApiView, opts?: DerefOptions): Dereferencer {
  return new Dereferencer(contextFor(view.loaded), opts);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface OperationEntry {
  kind: "path" | "webhook";
  path: string;
  method: string;
  operation: Json;
  pathItem: Json;
  /** Document the path item (and so its relative refs) came from. */
  docKey: string;
  pathItemError?: string;
}

export function listOperationEntries(view: OpenApiView, opts: { includeWebhooks?: boolean } = {}): OperationEntry[] {
  const d = newDeref(view);
  const out: OperationEntry[] = [];
  const collect = (kind: "path" | "webhook", map: Json) => {
    if (!map || typeof map !== "object") return;
    for (const [path, rawItem] of Object.entries(map)) {
      if (path.startsWith("x-")) continue;
      const item = d.shallow(rawItem, d.rootKey);
      const pathItem = item.value as Json;
      if (!pathItem || typeof pathItem !== "object") continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op || typeof op !== "object") continue;
        out.push({ kind, path, method: method.toUpperCase(), operation: op, pathItem, docKey: item.docKey, pathItemError: item.error });
      }
    }
  };
  collect("path", view.doc.paths);
  if (opts.includeWebhooks !== false) collect("webhook", view.doc.webhooks);
  return out;
}

export function summarizeOperation(e: OperationEntry): Record<string, unknown> {
  const op = e.operation;
  return {
    ...(e.kind === "webhook" ? { webhook: e.path } : { path: e.path }),
    method: e.method,
    ...(op.operationId && { operationId: op.operationId }),
    ...(op.summary && { summary: op.summary }),
    ...(op.tags?.length && { tags: op.tags }),
    ...(op.deprecated && { deprecated: true }),
  };
}

export function findOperation(
  view: OpenApiView,
  q: { path?: string; method?: string; operationId?: string }
): OperationEntry | undefined {
  const entries = listOperationEntries(view);
  if (q.operationId) return entries.find((e) => e.operation.operationId === q.operationId);
  const method = q.method?.toUpperCase();
  return entries.find((e) => e.path === q.path && (!method || e.method === method));
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

export interface ServerInfo {
  url: string;
  template?: string;
  description?: string;
  variables?: Record<string, { default?: string; enum?: string[]; description?: string }>;
}

function expandServer(s: Json, specUrl?: string): ServerInfo {
  const template = String(s?.url ?? "/");
  let url = template.replace(/\{([^}]+)\}/g, (_, name) => String(s?.variables?.[name]?.default ?? `{${name}}`));
  if (specUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      url = new URL(url, specUrl).toString().replace(/\/$/, "");
    } catch {
      /* leave relative */
    }
  }
  return {
    url: redactUrl(url),
    ...(template !== url && { template }),
    ...(s?.description && { description: s.description }),
    ...(s?.variables && { variables: s.variables }),
  };
}

/** Effective servers: operation → path item → document (OAS3), or scheme/host/basePath (Swagger 2). */
export function getServers(view: OpenApiView, entry?: OperationEntry): ServerInfo[] {
  const specUrl = view.loaded.location.type === "url" ? view.loaded.location.url : undefined;
  const doc = view.doc;
  if (view.family === "swagger2") {
    const specHost = specUrl ? new URL(specUrl) : undefined;
    const host = doc.host ?? specHost?.host;
    const basePath = doc.basePath ?? "";
    const schemes: string[] = entry?.operation?.schemes ?? doc.schemes ?? [specHost ? specHost.protocol.replace(":", "") : "https"];
    if (!host) return [{ url: basePath || "/", description: "No host declared; relative to wherever the API is served" }];
    return schemes.map((scheme) => ({ url: redactUrl(`${scheme}://${host}${basePath}`) }));
  }
  const list: Json[] =
    (entry?.operation?.servers?.length && entry.operation.servers) ||
    (entry?.pathItem?.servers?.length && entry.pathItem.servers) ||
    (doc.servers?.length && doc.servers) ||
    [{ url: "/" }];
  return list.map((s) => expandServer(s, specUrl));
}

// ---------------------------------------------------------------------------
// Swagger 2 → OAS3-shaped conversions
// ---------------------------------------------------------------------------

const SW2_SCHEMA_KEYS = [
  "type", "format", "items", "enum", "default", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "multipleOf",
];

function sw2ParamSchema(p: Json): Json {
  const schema: Json = {};
  for (const k of SW2_SCHEMA_KEYS) if (p[k] !== undefined) schema[k] = p[k];
  if (p.type === "file") {
    schema.type = "string";
    schema.format = "binary";
  }
  return schema;
}

// ---------------------------------------------------------------------------
// Operation details
// ---------------------------------------------------------------------------

export interface DetailOptions {
  resolveRefs?: boolean;
  maxDepth?: number;
  maxNodes?: number;
}

export function operationDetails(view: OpenApiView, entry: OperationEntry, opts: DetailOptions = {}): Record<string, unknown> {
  const resolve = opts.resolveRefs !== false;
  const d = newDeref(view, { maxDepth: opts.maxDepth, maxNodes: opts.maxNodes, annotate: true });
  const R = (node: unknown, docKey = entry.docKey) => (resolve ? d.deref(node, docKey) : node);
  const op = entry.operation;
  const doc = view.doc;

  // Parameters: path-level merged with operation-level (operation wins on name+in).
  const merged = new Map<string, { raw: Json; resolved: Json }>();
  const unresolvedParams: string[] = [];
  for (const list of [entry.pathItem.parameters, op.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const s = d.shallow(raw, entry.docKey);
      const p = s.value as Json;
      if (s.error || !p || typeof p !== "object" || !p.name) {
        unresolvedParams.push(s.ref ?? JSON.stringify(raw).slice(0, 80));
        merged.set(`?:${merged.size}`, { raw, resolved: R(raw) });
        continue;
      }
      merged.set(`${p.in}:${p.name}`, { raw: p, resolved: resolve ? d.deref(p, s.docKey) : raw });
    }
  }

  let parameters: Json[] = [...merged.values()].map((m) => m.resolved);
  let requestBody: Json | undefined;

  if (view.family === "swagger2") {
    const consumes: string[] = op.consumes ?? doc.consumes ?? ["application/json"];
    const body = parameters.find((p) => p?.in === "body");
    const form = parameters.filter((p) => p?.in === "formData");
    parameters = parameters
      .filter((p) => p?.in !== "body" && p?.in !== "formData")
      .map((p) => (p?.schema || !p?.in ? p : { ...p, schema: sw2ParamSchema(p) }));
    if (body) {
      requestBody = {
        ...(body.description && { description: body.description }),
        required: body.required === true,
        content: Object.fromEntries(consumes.map((mt) => [mt, { schema: body.schema }])),
        "x-swagger2-body-param": body.name,
      };
    } else if (form.length > 0) {
      const multipart = form.some((p) => p.type === "file") || consumes.some((c) => c.startsWith("multipart/"));
      const mt = multipart ? "multipart/form-data" : "application/x-www-form-urlencoded";
      requestBody = {
        required: form.some((p) => p.required),
        content: {
          [mt]: {
            schema: {
              type: "object",
              properties: Object.fromEntries(
                form.map((p) => [p.name, { ...sw2ParamSchema(p), ...(p.description && { description: p.description }) }])
              ),
              required: form.filter((p) => p.required).map((p) => p.name),
            },
          },
        },
      };
    }
  } else if (op.requestBody) {
    requestBody = R(op.requestBody);
  }

  // Responses
  const responses: Record<string, Json> = {};
  const produces: string[] = op.produces ?? doc.produces ?? ["application/json"];
  for (const [code, raw] of Object.entries(op.responses ?? {})) {
    if (code.startsWith("x-")) continue;
    if (view.family === "swagger2") {
      const s = d.shallow(raw, entry.docKey);
      const r = s.value as Json;
      if (s.error) {
        responses[code] = R(raw);
        continue;
      }
      const headers = r.headers
        ? Object.fromEntries(
            Object.entries(r.headers as Record<string, Json>).map(([h, def]) => [
              h,
              { ...(def.description && { description: def.description }), schema: sw2ParamSchema(def) },
            ])
          )
        : undefined;
      responses[code] = {
        description: r.description,
        ...(headers && { headers }),
        ...(r.schema && {
          content: Object.fromEntries(
            produces.map((mt) => [
              mt,
              { schema: resolve ? d.deref(r.schema, s.docKey) : r.schema, ...(r.examples?.[mt] !== undefined && { example: r.examples[mt] }) },
            ])
          ),
        }),
      };
    } else {
      responses[code] = R(raw);
    }
  }

  const security = effectiveSecurity(view, op);

  const result: Record<string, unknown> = {
    ...(entry.kind === "webhook" ? { webhook: entry.path } : { path: entry.path }),
    method: entry.method,
    ...(op.operationId && { operationId: op.operationId }),
    ...(op.summary && { summary: op.summary }),
    ...(op.description && { description: op.description }),
    ...(op.tags?.length && { tags: op.tags }),
    ...(op.deprecated && { deprecated: true }),
    servers: getServers(view, entry),
    parameters,
    ...(requestBody && { requestBody }),
    responses,
    security,
    ...(op.callbacks && { callbacks: R(op.callbacks) }),
    ...(op.externalDocs && { externalDocs: op.externalDocs }),
  };
  const ext = Object.fromEntries(Object.entries(op).filter(([k]) => k.startsWith("x-")));
  if (Object.keys(ext).length) result.extensions = ext;
  const refIssues = d.summary();
  if (refIssues || unresolvedParams.length || entry.pathItemError) {
    result.refIssues = {
      ...refIssues,
      ...(unresolvedParams.length && { unresolvedParameters: unresolvedParams }),
      ...(entry.pathItemError && { pathItem: entry.pathItemError }),
    };
    if (refIssues?.truncated) result.truncated = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export function securitySchemes(view: OpenApiView): Record<string, Json> {
  const raw = view.family === "swagger2" ? view.doc.securityDefinitions : view.doc.components?.securitySchemes;
  if (!raw || typeof raw !== "object") return {};
  const d = newDeref(view, { annotate: false });
  return d.deref(raw) as Record<string, Json>;
}

export function effectiveSecurity(view: OpenApiView, op: Json): Record<string, unknown> {
  const source = Array.isArray(op?.security) ? "operation" : Array.isArray(view.doc.security) ? "document" : "none";
  const requirements: Json[] = source === "operation" ? op.security : source === "document" ? view.doc.security : [];
  const schemes = securitySchemes(view);
  const used = new Set<string>();
  for (const req of requirements) for (const name of Object.keys(req ?? {})) used.add(name);
  const undefinedSchemes = [...used].filter((n) => !schemes[n]);
  return {
    source,
    // An empty requirement object `{}` means "anonymous access allowed".
    anonymousAllowed: requirements.length === 0 || requirements.some((r) => r && Object.keys(r).length === 0),
    requirements,
    schemes: Object.fromEntries([...used].filter((n) => schemes[n]).map((n) => [n, schemes[n]])),
    ...(undefinedSchemes.length && { undefinedSchemes }),
  };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function modelPrefix(view: OpenApiView): string {
  return view.family === "swagger2" ? "#/definitions/" : "#/components/schemas/";
}

export function rawModels(view: OpenApiView): Record<string, Json> {
  const m = view.family === "swagger2" ? view.doc.definitions : view.doc.components?.schemas;
  return m && typeof m === "object" ? m : {};
}

/**
 * Internal reference graph: for each component pointer, the pointers it
 * references; plus the pointers each operation reaches. Used for transitive
 * `usedIn` and for the unused-component lint rule.
 */
export interface RefGraph {
  edges: Map<string, Set<string>>;
  operationRefs: Map<string, Set<string>>;
  rootRefs: Set<string>;
}

const graphCache = new WeakMap<LoadedDocument, RefGraph>();

function internalRefs(node: unknown): Set<string> {
  const out = new Set<string>();
  for (const r of collectRefs(node)) if (r.startsWith("#/")) out.add(r);
  return out;
}

export function refGraph(view: OpenApiView): RefGraph {
  const cached = graphCache.get(view.loaded);
  if (cached) return cached;
  const edges = new Map<string, Set<string>>();
  const expand = (ptr: string) => {
    if (edges.has(ptr)) return;
    const hit = evaluatePointer(view.doc, ptr.slice(1));
    const refs = hit.found ? internalRefs(hit.value) : new Set<string>();
    edges.set(ptr, refs);
    for (const r of refs) expand(r);
  };
  const operationRefs = new Map<string, Set<string>>();
  for (const e of listOperationEntries(view)) {
    const refs = new Set<string>([...internalRefs(e.operation), ...internalRefs(e.pathItem.parameters ?? [])]);
    operationRefs.set(`${e.method} ${e.path}`, refs);
    for (const r of refs) expand(r);
  }
  // Everything outside the component sections counts as a use.
  const { components: _c, definitions: _d, parameters: _p, responses: _r, ...rest } = view.doc;
  const rootRefs = internalRefs(rest);
  for (const r of rootRefs) expand(r);
  const graph = { edges, operationRefs, rootRefs };
  graphCache.set(view.loaded, graph);
  return graph;
}

export function reachable(graph: RefGraph, start: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    for (const n of graph.edges.get(p) ?? []) stack.push(n);
  }
  return seen;
}

export function modelUsage(view: OpenApiView): Map<string, string[]> {
  const graph = refGraph(view);
  const prefix = modelPrefix(view);
  const usage = new Map<string, string[]>();
  for (const [opKey, refs] of graph.operationRefs) {
    for (const ptr of reachable(graph, refs)) {
      if (!ptr.startsWith(prefix)) continue;
      const name = refName(ptr);
      const list = usage.get(name) ?? [];
      list.push(opKey);
      usage.set(name, list);
    }
  }
  return usage;
}

// ---------------------------------------------------------------------------
// Tags / overview
// ---------------------------------------------------------------------------

export function extractTags(view: OpenApiView): Array<{ name: string; description?: string; operationCount: number; declared: boolean }> {
  const tags = new Map<string, { description?: string; count: number; declared: boolean }>();
  for (const t of view.doc.tags ?? []) {
    if (t?.name) tags.set(t.name, { description: t.description, count: 0, declared: true });
  }
  for (const e of listOperationEntries(view)) {
    for (const t of e.operation.tags ?? []) {
      const cur = tags.get(t) ?? { count: 0, declared: false };
      cur.count++;
      tags.set(t, cur);
    }
  }
  return [...tags.entries()].map(([name, v]) => ({
    name,
    ...(v.description && { description: v.description }),
    operationCount: v.count,
    declared: v.declared,
  }));
}

export function overview(view: OpenApiView): Record<string, unknown> {
  const entries = listOperationEntries(view);
  const webhooks = entries.filter((e) => e.kind === "webhook");
  const doc = view.doc;
  return {
    kind: "openapi",
    specVersion: view.version,
    info: doc.info ? { title: doc.info.title, version: doc.info.version, ...(doc.info.description && { description: String(doc.info.description).slice(0, 500) }) } : undefined,
    servers: getServers(view),
    pathCount: Object.keys(doc.paths ?? {}).filter((k) => !k.startsWith("x-")).length,
    operationCount: entries.length - webhooks.length,
    ...(webhooks.length && { webhooks: webhooks.map((w) => `${w.method} ${w.path}`) }),
    modelCount: Object.keys(rawModels(view)).length,
    securitySchemes: Object.keys(securitySchemes(view)),
    tags: extractTags(view),
    ...(doc.jsonSchemaDialect && { jsonSchemaDialect: doc.jsonSchemaDialect }),
    ...(view.loaded.warnings.length && { warnings: view.loaded.warnings }),
  };
}
