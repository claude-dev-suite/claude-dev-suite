// SPDX-License-Identifier: MIT
/**
 * Tool handlers. Each validates its input with the matching Zod schema,
 * never mutates a cached document, bounds its output, and reports partial
 * results (a source that failed to load, a truncated walk) explicitly.
 */

import { z } from "zod";
import { basename, extname } from "path";
import { Schemas, type ToolName } from "./schemas.js";
import type { LoadedDocument } from "../loader.js";
import { describeLocation, projectRoot, resolveProjectPath } from "../location.js";
import {
  addSource,
  aliases,
  getConfigErrors,
  listSources,
  loadSource,
  loadSpecRef,
  describeSpecRef,
  publicSource,
  putSource,
  removeSource,
  requireOne,
  selectSources,
  type ApiSource,
} from "../sources.js";
import {
  effectiveSecurity,
  findOperation,
  getServers,
  listOperationEntries,
  modelUsage,
  newDeref,
  openApiView,
  operationDetails,
  overview,
  rawModels,
  securitySchemes,
  summarizeOperation,
  type Json,
  type OpenApiView,
  type OperationEntry,
} from "../openapi.js";
import { matchOperation } from "../match.js";
import { sampleFromSchema, buildRequest, renderSnippet } from "../samples.js";
import { lintOpenApi, LINT_RULES, SEVERITY_ORDER } from "../lint.js";
import { diffOpenApi } from "../diff.js";
import { graphqlOverview, graphqlSchema, listTypes, rootOperations, typeDetails } from "../graphql.js";
import { asyncChannels, asyncMessages, asyncOverview, asyncView, messageDetails } from "../asyncapi.js";
import { protoModel, protoOverview, protoTypeDetails } from "../proto.js";
import { rankHits, searchDocument, tokenize, type SearchHit } from "../search.js";
import { detectApiFrameworks } from "../detector.js";
import { discoverSpecFiles, walkProject } from "../discovery.js";
import { redactText } from "../redact.js";

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

const MAX_OUTPUT_CHARS = 400_000;

export function jsonResponse(data: unknown): HandlerResult {
  let text = JSON.stringify(data, null, 2);
  if (text.length > MAX_OUTPUT_CHARS) {
    text = JSON.stringify(
      {
        truncated: true,
        reason: `Response was ${text.length} characters, over the ${MAX_OUTPUT_CHARS} limit`,
        hint: "Narrow the request: pass alias, lower limit, use compact=true or format=summary",
        preview: text.slice(0, 20_000),
      },
      null,
      2
    );
  }
  return { content: [{ type: "text", text }] };
}

export function errorResponse(message: string, extra?: Record<string, unknown>): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: redactText(message), ...extra }, null, 2) }],
    isError: true,
  };
}

function page<T>(items: T[], limit: number, offset: number): { items: T[]; total: number; offset: number; truncated?: true; nextOffset?: number } {
  const slice = items.slice(offset, offset + limit);
  const more = offset + slice.length < items.length;
  return { items: slice, total: items.length, offset, ...(more && { truncated: true as const, nextOffset: offset + slice.length }) };
}

function errMsg(e: unknown): string {
  return redactText(e instanceof Error ? e.message : String(e));
}

/** Run `fn` for each selected source; failures are reported per source, not dropped. */
async function perSource<T>(
  alias: string | undefined,
  fn: (source: ApiSource, doc: LoadedDocument) => T | Promise<T>,
  acceptKinds?: Array<LoadedDocument["kind"]>
): Promise<{ results: Array<{ alias: string } & T>; errors: Array<{ alias: string; error: string }>; skipped: Array<{ alias: string; reason: string }> }> {
  const sources = selectSources(alias);
  const results: Array<{ alias: string } & T> = [];
  const errors: Array<{ alias: string; error: string }> = [];
  const skipped: Array<{ alias: string; reason: string }> = [];
  await Promise.all(
    sources.map(async (s) => {
      try {
        const doc = await loadSource(s);
        if (acceptKinds && !acceptKinds.includes(doc.kind)) {
          if (alias) throw new Error(`Source "${s.alias}" is ${doc.kind}; this tool supports ${acceptKinds.join(", ")}`);
          skipped.push({ alias: s.alias, reason: `${doc.kind} source` });
          return;
        }
        results.push({ alias: s.alias, ...(await fn(s, doc)) });
      } catch (e) {
        if (alias) throw e;
        errors.push({ alias: s.alias, error: errMsg(e) });
      }
    })
  );
  const order = aliases();
  results.sort((a, b) => order.indexOf(a.alias) - order.indexOf(b.alias));
  return { results, errors, skipped };
}

/** One document of a given kind: the named source, or the only source of that kind. */
async function oneOfKind(alias: string | undefined, kind: LoadedDocument["kind"]): Promise<{ source: ApiSource; doc: LoadedDocument }> {
  if (alias || listSources().length <= 1) {
    const source = requireOne(alias);
    return { source, doc: await loadSource(source) };
  }
  const matches: Array<{ source: ApiSource; doc: LoadedDocument }> = [];
  const failed: string[] = [];
  for (const source of listSources()) {
    try {
      const doc = await loadSource(source);
      if (doc.kind === kind) matches.push({ source, doc });
    } catch {
      failed.push(source.alias);
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No ${kind} source is registered${failed.length ? ` (failed to load: ${failed.join(", ")})` : ""}. Add one with add_api_source.`);
  }
  throw new Error(`Several ${kind} sources are registered; pass alias (one of ${matches.map((m) => m.source.alias).join(", ")})`);
}

function resolveEntry(view: OpenApiView, q: { path?: string; method?: string; operationId?: string }): { entry: OperationEntry; matchedFrom?: string } {
  if (q.operationId) {
    const e = findOperation(view, { operationId: q.operationId });
    if (!e) throw new Error(`No operation with operationId "${q.operationId}"`);
    return { entry: e };
  }
  if (!q.path) throw new Error("Pass path (+ method) or operationId");
  const exact = findOperation(view, { path: q.path, method: q.method });
  if (exact) return { entry: exact };
  // Not a template in the spec: treat it as a concrete URL/path.
  const m = matchOperation(view, q.path, q.method);
  if (m.matched && m.best) {
    const e = findOperation(view, { path: m.best.path as string, method: m.best.method as string });
    if (e) return { entry: e, matchedFrom: q.path };
  }
  if (m.methodNotAllowed) {
    throw new Error(`${q.path} matches ${m.methodNotAllowed.path}, which supports ${m.methodNotAllowed.allowedMethods.join(", ")} but not ${q.method}`);
  }
  const samePath = listOperationEntries(view).filter((e) => e.path === q.path).map((e) => e.method);
  if (samePath.length && !q.method) {
    throw new Error(`method is required: ${q.path} has ${samePath.join(", ")}`);
  }
  throw new Error(`No operation matches ${q.method ?? ""} ${q.path}. Use list_api_paths or search_api to find it.`.replace("  ", " "));
}

function sourceOverview(doc: LoadedDocument): Record<string, unknown> {
  switch (doc.kind) {
    case "openapi":
      return overview(openApiView(doc));
    case "graphql":
      return graphqlOverview(graphqlSchema(doc));
    case "asyncapi":
      return asyncOverview(asyncView(doc));
    case "proto":
      return protoOverview(protoModel(doc));
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const listSourcesHandler: Handler = async () => {
  const configErrors = getConfigErrors();
  return jsonResponse({
    projectRoot: projectRoot(),
    sources: listSources().map(publicSource),
    total: listSources().length,
    ...(configErrors.length && { configErrors }),
  });
};

export const handlers: Record<ToolName, Handler> = {
  list_api_endpoints: listSourcesHandler,
  list_api_sources: listSourcesHandler,

  add_api_source: async (args) => {
    const p = Schemas.add_api_source.parse(args);
    if (!p.url && !p.path) throw new Error("Pass url or path");
    const previous = listSources().find((s) => s.alias === p.alias);
    const source = addSource({ alias: p.alias, url: p.url, path: p.path, kind: p.kind, headers: p.headers, timeout: p.timeout }, p.replace);
    if (!p.validate) return jsonResponse({ added: publicSource(source), validated: false });
    try {
      const doc = await loadSource(source, true);
      return jsonResponse({ added: publicSource(source), detectedKind: doc.kind, overview: sourceOverview(doc) });
    } catch (e) {
      // Roll back: a source that cannot be read should not linger.
      removeSource(source.alias);
      if (previous) putSource(previous);
      throw new Error(`Could not load ${describeLocation(source.location)}: ${errMsg(e)} (source not added; pass validate=false to add anyway)`);
    }
  },

  remove_api_source: async (args) => {
    const p = Schemas.remove_api_source.parse(args);
    const removed = removeSource(p.alias);
    return jsonResponse({ removed: publicSource(removed), remaining: aliases() });
  },

  get_api_schema: async (args) => {
    const p = Schemas.get_api_schema.parse(args);
    const one = async (s: ApiSource) => {
      const doc = await loadSource(s, p.refresh);
      const base = { alias: s.alias, location: describeLocation(s.location), kind: doc.kind, fetchedAt: new Date(doc.loadedAt).toISOString() };
      if (p.format === "summary") return { ...base, summary: sourceOverview(doc) };
      const full = typeof doc.doc === "string" ? doc.doc : JSON.stringify(doc.doc);
      if (full.length > p.maxChars) {
        return {
          ...base,
          truncated: true,
          sizeChars: full.length,
          hint: `Document is ${full.length} chars (maxChars ${p.maxChars}); showing the summary. Use list_api_paths / get_api_endpoint_details / get_api_models, or raise maxChars.`,
          summary: sourceOverview(doc),
        };
      }
      return { ...base, spec: doc.doc, ...(doc.warnings.length && { warnings: doc.warnings }) };
    };
    if (p.alias) return jsonResponse(await one(requireOne(p.alias)));
    const out = await Promise.all(selectSources().map((s) => one(s).catch((e) => ({ alias: s.alias, error: errMsg(e) }))));
    return jsonResponse(out.length === 1 ? out[0] : { sources: out });
  },

  list_api_paths: async (args) => {
    const p = Schemas.list_api_paths.parse(args);
    const r = await perSource(
      p.alias,
      (_s, doc) => {
        const view = openApiView(doc);
        const entries = listOperationEntries(view, { includeWebhooks: p.includeWebhooks }).filter(
          (e) =>
            (!p.method || e.method === p.method) &&
            (!p.tag || (e.operation.tags ?? []).includes(p.tag)) &&
            (p.includeDeprecated || !e.operation.deprecated) &&
            (!p.pathPrefix || e.path.startsWith(p.pathPrefix))
        );
        const pg = page(entries.map(summarizeOperation), p.limit, p.offset);
        return { paths: pg.items, total: pg.total, ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }) };
      },
      ["openapi"]
    );
    if (p.alias || (r.results.length === 1 && !r.errors.length)) return jsonResponse(r.results[0] ?? { paths: [], total: 0, skipped: r.skipped });
    return jsonResponse({ endpoints: r.results, ...(r.errors.length && { errors: r.errors }), ...(r.skipped.length && { skipped: r.skipped }) });
  },

  get_api_endpoint_details: async (args) => {
    const p = Schemas.get_api_endpoint_details.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "openapi");
    const view = openApiView(doc, source.alias);
    const { entry, matchedFrom } = resolveEntry(view, p);
    const details = operationDetails(view, entry, { resolveRefs: p.resolveRefs, maxDepth: p.maxDepth });
    return jsonResponse({ alias: source.alias, ...(matchedFrom && { matchedFrom }), ...details });
  },

  match_api_operation: async (args) => {
    const p = Schemas.match_api_operation.parse(args);
    const r = await perSource(p.alias, (_s, doc) => matchOperation(openApiView(doc), p.url, p.method), ["openapi"]);
    const matched = r.results.filter((x) => x.matched);
    return jsonResponse({
      matched: matched.length > 0,
      ...(matched.length ? { matches: matched } : { attempts: r.results }),
      ...(r.errors.length && { errors: r.errors }),
      ...(r.skipped.length && { skipped: r.skipped }),
    });
  },

  get_api_models: async (args) => {
    const p = Schemas.get_api_models.parse(args);
    const r = await perSource(
      p.alias,
      (_s, doc) => {
        const view = openApiView(doc);
        const models = rawModels(view);
        const d = newDeref(view, { annotate: true });
        const example = (schema: Json) => sampleFromSchema(newDeref(view, { annotate: true }).deref(schema), { mode: "response" });
        if (p.model) {
          const raw = models[p.model];
          if (raw === undefined) {
            const similar = Object.keys(models).filter((n) => n.toLowerCase().includes(p.model!.toLowerCase())).slice(0, 10);
            throw new Error(`Model "${p.model}" not found${similar.length ? `. Similar: ${similar.join(", ")}` : ""}`);
          }
          if (p.compact) return { models: [{ name: p.model, properties: Object.keys(raw?.properties ?? {}) }], total: 1 };
          const schema = p.resolveRefs ? d.deref(raw) : raw;
          return {
            models: [{ name: p.model, schema, usedIn: modelUsage(view).get(p.model) ?? [], ...(p.includeExample && { example: example(raw) }) }],
            total: 1,
            ...(d.summary() && { refIssues: d.summary() }),
          };
        }
        const names = Object.keys(models);
        const pg = page(names, p.limit, p.offset);
        const usage = p.compact ? undefined : modelUsage(view);
        const items = pg.items.map((name) =>
          p.compact
            ? { name, properties: Object.keys(models[name]?.properties ?? {}) }
            : {
                name,
                schema: p.resolveRefs ? d.deref(models[name]) : models[name],
                usedIn: usage!.get(name) ?? [],
                ...(p.includeExample && { example: example(models[name]) }),
              }
        );
        return { models: items, total: pg.total, ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }), ...(d.summary() && { refIssues: d.summary() }) };
      },
      ["openapi"]
    );
    if (p.alias || (r.results.length === 1 && !r.errors.length)) return jsonResponse(r.results[0] ?? { models: [], total: 0, skipped: r.skipped });
    return jsonResponse({ endpoints: r.results, ...(r.errors.length && { errors: r.errors }), ...(r.skipped.length && { skipped: r.skipped }) });
  },

  get_api_security: async (args) => {
    const p = Schemas.get_api_security.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "openapi");
    const view = openApiView(doc, source.alias);
    const schemes = securitySchemes(view);
    const global = effectiveSecurity(view, {});
    const byScheme: Record<string, string[]> = {};
    const anonymous: string[] = [];
    for (const e of listOperationEntries(view)) {
      const sec = effectiveSecurity(view, e.operation);
      const label = `${e.method} ${e.path}`;
      if (sec.anonymousAllowed) anonymous.push(label);
      for (const req of sec.requirements as Json[]) for (const n of Object.keys(req ?? {})) (byScheme[n] ??= []).push(label);
    }
    return jsonResponse({
      alias: source.alias,
      schemes,
      globalRequirements: global.requirements,
      ...(global.undefinedSchemes ? { undefinedSchemes: global.undefinedSchemes } : {}),
      operationsByScheme: Object.fromEntries(Object.entries(byScheme).map(([k, v]) => [k, { count: v.length, operations: v.slice(0, 50) }])),
      unauthenticatedOperations: { count: anonymous.length, operations: anonymous.slice(0, 50) },
      servers: getServers(view),
    });
  },

  search_api: async (args) => {
    const p = Schemas.search_api.parse(args);
    const r = await perSource(p.alias, (s, doc) => ({ hits: searchDocument(s.alias, doc, p.query, p.searchIn) }));
    const all: SearchHit[] = r.results.flatMap((x) => x.hits);
    const ranked = rankHits(all, tokenize(p.query).length);
    return jsonResponse({
      query: p.query,
      results: ranked.slice(0, p.limit),
      total: ranked.length,
      ...(ranked.length > p.limit && { truncated: true }),
      ...(r.errors.length && { errors: r.errors }),
    });
  },

  lint_api_spec: async (args) => {
    const p = Schemas.lint_api_spec.parse(args);
    const hasTarget = p.alias || p.url || p.path || p.gitRef;
    const doc = hasTarget ? await loadSpecRef(p) : await loadSource(requireOne());
    const view = openApiView(doc);
    const unknown = [...(p.rules ?? []), ...(p.disableRules ?? [])].filter((r) => !LINT_RULES[r]);
    if (unknown.length) throw new Error(`Unknown rule id(s): ${unknown.join(", ")}. Known: ${Object.keys(LINT_RULES).join(", ")}`);
    const findings = lintOpenApi(view)
      .filter((f) => SEVERITY_ORDER[f.severity] <= SEVERITY_ORDER[p.minSeverity])
      .filter((f) => !p.rules || p.rules.includes(f.rule))
      .filter((f) => !p.disableRules?.includes(f.rule))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const counts = { error: 0, warn: 0, info: 0, hint: 0 };
    for (const f of findings) counts[f.severity]++;
    const pg = page(findings, p.limit, p.offset);
    return jsonResponse({
      spec: hasTarget ? describeSpecRef(p) : describeLocation(doc.location),
      specVersion: view.version,
      valid: counts.error === 0,
      counts,
      findings: pg.items,
      total: pg.total,
      ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }),
      ...(doc.warnings.length && { loadWarnings: doc.warnings }),
    });
  },

  diff_api_specs: async (args) => {
    const p = Schemas.diff_api_specs.parse(args);
    const [base, head] = await Promise.all([loadSpecRef(p.base), loadSpecRef(p.head)]);
    const result = diffOpenApi(openApiView(base), openApiView(head));
    const changes = p.onlyBreaking ? result.changes.filter((c) => c.level === "breaking") : result.changes;
    const pg = page(changes, p.limit, p.offset);
    return jsonResponse({
      base: describeSpecRef(p.base),
      head: describeSpecRef(p.head),
      breaking: result.summary.breaking > 0,
      summary: result.summary,
      changes: pg.items,
      ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }),
    });
  },

  generate_api_request: async (args) => {
    const p = Schemas.generate_api_request.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "openapi");
    const view = openApiView(doc, source.alias);
    const { entry } = resolveEntry(view, p);
    if (entry.kind === "webhook") throw new Error("Webhooks are called by the API provider; there is no request to generate");
    const { request } = buildRequest(view, entry, { baseUrl: p.baseUrl, includeOptional: p.includeOptional, mediaType: p.mediaType });
    const snippets = Object.fromEntries(p.formats.map((f) => [f, renderSnippet(request, f)]));
    const secrets = [...request.secretHeaders.values(), ...request.secretQuery.values()].map((v) => v.replace(/^(bearer|basic):/, ""));
    return jsonResponse({
      alias: source.alias,
      operation: summarizeOperation(entry),
      url: request.url,
      ...(request.body && { body: request.body }),
      snippets,
      ...(secrets.length && { credentialEnvVars: [...new Set(secrets)] }),
      ...(request.notes.length && { notes: request.notes }),
    });
  },

  list_graphql_operations: async (args) => {
    const p = Schemas.list_graphql_operations.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "graphql");
    const ops = rootOperations(graphqlSchema(doc, source.alias), p.operationType);
    const pg = page(ops, p.limit, p.offset);
    return jsonResponse({ alias: source.alias, operations: pg.items, total: pg.total, ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }) });
  },

  list_graphql_types: async (args) => {
    const p = Schemas.list_graphql_types.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "graphql");
    const pg = page(listTypes(graphqlSchema(doc, source.alias), p.kind, p.includeBuiltins), p.limit, p.offset);
    return jsonResponse({ alias: source.alias, types: pg.items, total: pg.total, ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }) });
  },

  get_graphql_type: async (args) => {
    const p = Schemas.get_graphql_type.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "graphql");
    return jsonResponse({ alias: source.alias, ...typeDetails(graphqlSchema(doc, source.alias), p.name) });
  },

  list_asyncapi_channels: async (args) => {
    const p = Schemas.list_asyncapi_channels.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "asyncapi");
    const view = asyncView(doc, source.alias);
    const pg = page(asyncChannels(view), p.limit, p.offset);
    return jsonResponse({ alias: source.alias, specVersion: view.version, channels: pg.items, total: pg.total, ...(pg.truncated && { truncated: true, nextOffset: pg.nextOffset }) });
  },

  get_asyncapi_message: async (args) => {
    const p = Schemas.get_asyncapi_message.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "asyncapi");
    const view = asyncView(doc, source.alias);
    if (!p.name) {
      return jsonResponse({ alias: source.alias, messages: [...asyncMessages(view)].map(([name, m]) => ({ name, location: m.where, ...((m.raw as Json)?.summary && { summary: (m.raw as Json).summary }) })) });
    }
    return jsonResponse({ alias: source.alias, ...messageDetails(view, p.name) });
  },

  list_grpc_services: async (args) => {
    const p = Schemas.list_grpc_services.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "proto");
    const model = protoModel(doc, source.alias);
    return jsonResponse({ alias: source.alias, ...(model.package && { package: model.package }), services: model.services, imports: model.imports });
  },

  get_proto_message: async (args) => {
    const p = Schemas.get_proto_message.parse(args);
    const { source, doc } = await oneOfKind(p.alias, "proto");
    return jsonResponse({ alias: source.alias, ...protoTypeDetails(protoModel(doc, source.alias), p.name) });
  },

  discover_api_specs: async (args) => {
    const p = Schemas.discover_api_specs.parse(args);
    const dir = p.path ? resolveProjectPath(p.path) : projectRoot();
    const walk = await walkProject(dir, p.maxDepth);
    const { specFiles, truncated } = await discoverSpecFiles(walk, p.limit);
    const registered: Array<Record<string, unknown>> = [];
    const failed: Array<{ path: string; error: string }> = [];
    if (p.register) {
      const taken = new Set(aliases());
      for (const f of specFiles) {
        const stem = basename(f.path, extname(f.path)).replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "spec";
        let alias = stem;
        for (let i = 2; taken.has(alias); i++) alias = `${stem}-${i}`;
        try {
          const s = addSource({ alias, path: f.path, kind: f.kind });
          taken.add(alias);
          registered.push(publicSource(s));
        } catch (e) {
          failed.push({ path: f.path, error: errMsg(e) });
        }
      }
    }
    return jsonResponse({
      root: describeLocation({ type: "file", path: dir }),
      specFiles,
      total: specFiles.length,
      ...(truncated && { truncated: true }),
      ...(walk.skipped.length && { skipped: walk.skipped.slice(0, 20) }),
      ...(p.register && { registered, ...(failed.length && { registerErrors: failed }) }),
    });
  },

  detect_api_frameworks: async (args) => {
    const p = Schemas.detect_api_frameworks.parse(args);
    const dir = p.path ? resolveProjectPath(p.path) : projectRoot();
    return jsonResponse(await detectApiFrameworks(dir, p.maxDepth, p.includeConfidence));
  },
};

export function formatError(error: unknown): HandlerResult {
  if (error instanceof z.ZodError) {
    return errorResponse("Invalid arguments", {
      issues: error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    });
  }
  const available = aliases();
  return errorResponse(errMsg(error), available.length ? { availableAliases: available } : undefined);
}
