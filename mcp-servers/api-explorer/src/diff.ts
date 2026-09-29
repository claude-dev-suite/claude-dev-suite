// SPDX-License-Identifier: MIT
/**
 * Compare two OpenAPI documents and classify every change the way oasdiff
 * does, from the point of view of an existing client:
 *
 *  - breaking      an existing client may now fail (removed endpoint, new
 *                  required parameter, narrowed request enum, removed
 *                  response field, incompatible type change, ...)
 *  - non-breaking  additive or relaxing changes
 *  - info          documentation-level changes worth knowing about
 *
 * Request and response schemas are compared in opposite directions:
 * narrowing what the server ACCEPTS breaks clients, widening what it RETURNS
 * breaks clients. Changes that oasdiff reports as warnings (e.g. a request
 * property removed, a response enum value added) are `breaking` with
 * `potential: true`.
 */

import {
  getServers,
  listOperationEntries,
  operationDetails,
  rawModels,
  securitySchemes,
  type Json,
  type OpenApiView,
  type OperationEntry,
} from "./openapi.js";

export type ChangeLevel = "breaking" | "non-breaking" | "info";

export interface Change {
  id: string;
  level: ChangeLevel;
  potential?: boolean;
  operation?: string;
  location?: string;
  message: string;
}

type Direction = "request" | "response";

function normPath(p: string): string {
  return p.replace(/\{[^}]*\}/g, "{}");
}

function typeSet(s: Json): Set<string> | undefined {
  if (!s || typeof s !== "object") return undefined;
  let types: string[] | undefined;
  if (Array.isArray(s.type)) types = s.type;
  else if (typeof s.type === "string") types = [s.type];
  if (!types) return undefined;
  const set = new Set(types);
  if (s.nullable === true) set.add("null");
  return set;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) {
    if (b.has(x)) continue;
    if (x === "integer" && b.has("number")) continue;
    return false;
  }
  return true;
}

const fmt = (s: Set<string>) => [...s].join("|");

class Differ {
  readonly changes: Change[] = [];
  private seen = new Set<string>();

  add(id: string, level: ChangeLevel, message: string, operation?: string, location?: string, potential = false): void {
    this.changes.push({ id, level, message, ...(potential && { potential }), ...(operation && { operation }), ...(location && { location }) });
  }

  schema(base: Json, head: Json, dir: Direction, op: string, loc: string, depth = 0): void {
    if (!base || !head || typeof base !== "object" || typeof head !== "object") return;
    if (depth > 24) return;
    if (base.$circular || head.$circular) {
      if (base.$circular !== head.$circular) this.add(`${dir}-schema-changed`, "breaking", `Recursive schema changed from ${base.$circular ?? "inline"} to ${head.$circular ?? "inline"}`, op, loc, true);
      return;
    }
    const pairKey = `${dir}|${op}|${loc}|${base["x-ref"] ?? ""}|${head["x-ref"] ?? ""}`;
    if ((base["x-ref"] || head["x-ref"]) && this.seen.has(pairKey)) return;
    this.seen.add(pairKey);

    const where = loc || "(root)";
    // --- type
    const bt = typeSet(base);
    const ht = typeSet(head);
    if (bt && ht && fmt(bt) !== fmt(ht)) {
      const compatible = dir === "request" ? isSubset(bt, ht) : isSubset(ht, bt);
      this.add(
        compatible ? (dir === "request" ? "request-type-widened" : "response-type-narrowed") : `${dir}-type-changed`,
        compatible ? "non-breaking" : "breaking",
        `${dir} ${where}: type changed from ${fmt(bt)} to ${fmt(ht)}`,
        op,
        loc
      );
    } else if (!bt && ht && dir === "request") {
      this.add("request-type-added", "breaking", `request ${where}: type constrained to ${fmt(ht)}`, op, loc, true);
    }

    // --- format
    if (base.format !== head.format) {
      const breaking = base.format && head.format ? true : dir === "request" ? !!head.format : !head.format;
      this.add(`${dir}-format-changed`, breaking ? "breaking" : "non-breaking", `${dir} ${where}: format changed from ${base.format ?? "none"} to ${head.format ?? "none"}`, op, loc);
    }

    // --- enum
    const be = Array.isArray(base.enum) ? new Set(base.enum.map((v: unknown) => JSON.stringify(v))) : undefined;
    const he = Array.isArray(head.enum) ? new Set(head.enum.map((v: unknown) => JSON.stringify(v))) : undefined;
    if (be && he) {
      const removed = [...be].filter((v) => !he.has(v));
      const added = [...he].filter((v) => !be.has(v));
      if (removed.length) {
        this.add(`${dir}-enum-value-removed`, dir === "request" ? "breaking" : "non-breaking", `${dir} ${where}: enum value(s) removed: ${removed.join(", ")}`, op, loc);
      }
      if (added.length) {
        this.add(`${dir}-enum-value-added`, dir === "request" ? "non-breaking" : "breaking", `${dir} ${where}: enum value(s) added: ${added.join(", ")}`, op, loc, dir === "response");
      }
    } else if (!be && he && dir === "request") {
      this.add("request-enum-added", "breaking", `request ${where}: values restricted to enum ${[...he].join(", ")}`, op, loc);
    } else if (be && !he && dir === "response") {
      this.add("response-enum-removed", "breaking", `response ${where}: enum restriction removed; any value may now be returned`, op, loc, true);
    }

    // --- numeric/length constraints
    const tighter: Array<[string, (b: number, h: number) => boolean]> = [
      ["maxLength", (b, h) => h < b], ["minLength", (b, h) => h > b], ["maximum", (b, h) => h < b], ["minimum", (b, h) => h > b],
      ["maxItems", (b, h) => h < b], ["minItems", (b, h) => h > b], ["maxProperties", (b, h) => h < b], ["minProperties", (b, h) => h > b],
    ];
    for (const [key, isTighter] of tighter) {
      const b = base[key];
      const h = head[key];
      if (b === h) continue;
      const tightened = typeof b === "number" && typeof h === "number" ? isTighter(b, h) : b === undefined && typeof h === "number";
      const level: ChangeLevel = dir === "request" ? (tightened ? "breaking" : "non-breaking") : tightened ? "non-breaking" : "info";
      this.add(`${dir}-${key}-changed`, level, `${dir} ${where}: ${key} changed from ${b ?? "none"} to ${h ?? "none"}`, op, loc);
    }
    if (base.pattern !== head.pattern && head.pattern) {
      this.add(`${dir}-pattern-changed`, dir === "request" ? "breaking" : "info", `${dir} ${where}: pattern changed to ${head.pattern}`, op, loc, dir === "request" && !!base.pattern);
    }
    if (dir === "request" && base.additionalProperties !== false && head.additionalProperties === false) {
      this.add("request-additional-properties-disallowed", "breaking", `request ${where}: additional properties are no longer allowed`, op, loc);
    }

    // --- properties + required
    const bp = (base.properties ?? {}) as Record<string, Json>;
    const hp = (head.properties ?? {}) as Record<string, Json>;
    const br = new Set<string>(Array.isArray(base.required) ? base.required : []);
    const hr = new Set<string>(Array.isArray(head.required) ? head.required : []);
    for (const name of Object.keys(bp)) {
      const ploc = loc ? `${loc}.${name}` : name;
      if (!(name in hp)) {
        if (dir === "response") {
          if (bp[name]?.writeOnly) continue;
          this.add("response-property-removed", "breaking", `response property "${ploc}" removed`, op, ploc);
        } else {
          if (bp[name]?.readOnly) continue;
          this.add("request-property-removed", "breaking", `request property "${ploc}" removed; clients sending it may be rejected or ignored`, op, ploc, true);
        }
        continue;
      }
      if (dir === "request" && !br.has(name) && hr.has(name)) this.add("request-property-became-required", "breaking", `request property "${ploc}" became required`, op, ploc);
      if (dir === "request" && br.has(name) && !hr.has(name)) this.add("request-property-became-optional", "non-breaking", `request property "${ploc}" became optional`, op, ploc);
      if (dir === "response" && br.has(name) && !hr.has(name)) this.add("response-property-became-optional", "breaking", `response property "${ploc}" is no longer guaranteed`, op, ploc);
      if (dir === "response" && !br.has(name) && hr.has(name)) this.add("response-property-became-required", "non-breaking", `response property "${ploc}" is now always present`, op, ploc);
      this.schema(bp[name], hp[name], dir, op, ploc, depth + 1);
    }
    for (const name of Object.keys(hp)) {
      if (name in bp) continue;
      const ploc = loc ? `${loc}.${name}` : name;
      if (dir === "request") {
        if (hp[name]?.readOnly) continue;
        if (hr.has(name)) this.add("request-required-property-added", "breaking", `new required request property "${ploc}"`, op, ploc);
        else this.add("request-property-added", "non-breaking", `new optional request property "${ploc}"`, op, ploc);
      } else {
        if (hp[name]?.writeOnly) continue;
        this.add("response-property-added", "non-breaking", `new response property "${ploc}"`, op, ploc);
      }
    }

    // --- arrays and compositions
    if (base.items && head.items) this.schema(base.items, head.items, dir, op, `${loc}[]`, depth + 1);
    for (const key of ["oneOf", "anyOf"] as const) {
      const b = base[key];
      const h = head[key];
      if (!Array.isArray(b) || !Array.isArray(h)) continue;
      if (h.length < b.length && dir === "request") this.add(`request-${key}-option-removed`, "breaking", `request ${where}: ${key} now has ${h.length} options instead of ${b.length}`, op, loc);
      if (h.length > b.length && dir === "response") this.add(`response-${key}-option-added`, "breaking", `response ${where}: ${key} now has ${h.length} options instead of ${b.length}`, op, loc, true);
      if (h.length > b.length && dir === "request") this.add(`request-${key}-option-added`, "non-breaking", `request ${where}: ${key} gained options`, op, loc);
      if (h.length < b.length && dir === "response") this.add(`response-${key}-option-removed`, "non-breaking", `response ${where}: ${key} lost options`, op, loc);
      for (let i = 0; i < Math.min(b.length, h.length); i++) this.schema(b[i], h[i], dir, op, `${loc}<${key}[${i}]>`, depth + 1);
    }
    if (Array.isArray(base.allOf) && Array.isArray(head.allOf)) {
      for (let i = 0; i < Math.min(base.allOf.length, head.allOf.length); i++) this.schema(base.allOf[i], head.allOf[i], dir, op, loc, depth + 1);
    }
  }
}

function paramKey(p: Json, entry: OperationEntry): string {
  if (p.in === "path") {
    const vars = [...entry.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const idx = vars.indexOf(p.name);
    return `path#${idx === -1 ? p.name : idx}`;
  }
  return `${p.in}:${p.in === "header" ? String(p.name).toLowerCase() : p.name}`;
}

function paramSchema(p: Json): Json {
  return p.schema ?? (p.content ? (Object.values(p.content)[0] as Json)?.schema : undefined);
}

function securityAlternatives(sec: Json): { anonymous: boolean; alts: Map<string, Set<string>> } {
  const alts = new Map<string, Set<string>>();
  const reqs: Json[] = sec?.requirements ?? [];
  for (const r of reqs) {
    const names = Object.keys(r ?? {}).sort();
    if (names.length === 0) continue;
    const scopes = new Set<string>(names.flatMap((n) => (r[n] ?? []).map((s: string) => `${n}:${s}`)));
    alts.set(names.join("+"), scopes);
  }
  return { anonymous: sec?.anonymousAllowed === true, alts };
}

function compareOperation(d: Differ, bView: OpenApiView, bEntry: OperationEntry, hView: OpenApiView, hEntry: OperationEntry): void {
  const op = `${hEntry.method} ${hEntry.path}`;
  const b = operationDetails(bView, bEntry, { resolveRefs: true }) as Json;
  const h = operationDetails(hView, hEntry, { resolveRefs: true }) as Json;

  if (bEntry.path !== hEntry.path) d.add("path-parameter-renamed", "info", `Path template changed from ${bEntry.path} to ${hEntry.path}`, op);
  if (!b.deprecated && h.deprecated) d.add("operation-deprecated", "info", "Operation is now deprecated", op);
  if (b.deprecated && !h.deprecated) d.add("operation-undeprecated", "info", "Operation is no longer deprecated", op);
  if (b.operationId !== h.operationId) {
    d.add("operation-id-changed", "breaking", `operationId changed from ${b.operationId ?? "none"} to ${h.operationId ?? "none"} (breaks generated clients)`, op, undefined, true);
  }

  // Parameters
  const bParams = new Map<string, Json>((b.parameters ?? []).filter((p: Json) => p?.name).map((p: Json) => [paramKey(p, bEntry), p]));
  const hParams = new Map<string, Json>((h.parameters ?? []).filter((p: Json) => p?.name).map((p: Json) => [paramKey(p, hEntry), p]));
  for (const [k, bp] of bParams) {
    const hp = hParams.get(k);
    const label = `${bp.in} parameter "${bp.name}"`;
    if (!hp) {
      d.add("request-parameter-removed", "breaking", `${label} removed`, op, `parameters.${bp.name}`, true);
      continue;
    }
    if (bp.in === "path" && bp.name !== hp.name) d.add("request-path-parameter-renamed", "info", `path parameter "${bp.name}" renamed to "${hp.name}"`, op);
    if (!bp.required && hp.required) d.add("request-parameter-became-required", "breaking", `${label} became required`, op, `parameters.${bp.name}`);
    if (bp.required && !hp.required) d.add("request-parameter-became-optional", "non-breaking", `${label} became optional`, op, `parameters.${bp.name}`);
    if (!bp.deprecated && hp.deprecated) d.add("request-parameter-deprecated", "info", `${label} deprecated`, op);
    d.schema(paramSchema(bp), paramSchema(hp), "request", op, `parameters.${bp.name}`);
  }
  for (const [k, hp] of hParams) {
    if (bParams.has(k)) continue;
    if (hp.required) d.add("request-required-parameter-added", "breaking", `new required ${hp.in} parameter "${hp.name}"`, op, `parameters.${hp.name}`);
    else d.add("request-parameter-added", "non-breaking", `new optional ${hp.in} parameter "${hp.name}"`, op, `parameters.${hp.name}`);
  }

  // Request body
  const bb = b.requestBody;
  const hb = h.requestBody;
  if (!bb && hb) {
    d.add(hb.required ? "request-body-added-required" : "request-body-added", hb.required ? "breaking" : "non-breaking", `request body added${hb.required ? " (required)" : ""}`, op, "requestBody");
  } else if (bb && !hb) {
    d.add("request-body-removed", "breaking", "request body removed", op, "requestBody", true);
  } else if (bb && hb) {
    if (!bb.required && hb.required) d.add("request-body-became-required", "breaking", "request body became required", op, "requestBody");
    if (bb.required && !hb.required) d.add("request-body-became-optional", "non-breaking", "request body became optional", op, "requestBody");
    const bc = (bb.content ?? {}) as Record<string, Json>;
    const hc = (hb.content ?? {}) as Record<string, Json>;
    for (const mt of Object.keys(bc)) {
      if (!(mt in hc)) d.add("request-media-type-removed", "breaking", `request media type ${mt} no longer accepted`, op, `requestBody.${mt}`);
      else d.schema(bc[mt]?.schema, hc[mt]?.schema, "request", op, "body");
    }
    for (const mt of Object.keys(hc)) if (!(mt in bc)) d.add("request-media-type-added", "non-breaking", `request media type ${mt} now accepted`, op, `requestBody.${mt}`);
  }

  // Responses
  const br = (b.responses ?? {}) as Record<string, Json>;
  const hr = (h.responses ?? {}) as Record<string, Json>;
  for (const code of Object.keys(br)) {
    const success = /^[23]/.test(code);
    if (!(code in hr)) {
      d.add(success ? "response-success-status-removed" : "response-non-success-status-removed", success ? "breaking" : "info", `response ${code} removed`, op, `responses.${code}`);
      continue;
    }
    const bc = (br[code]?.content ?? {}) as Record<string, Json>;
    const hc = (hr[code]?.content ?? {}) as Record<string, Json>;
    for (const mt of Object.keys(bc)) {
      if (!(mt in hc)) d.add("response-media-type-removed", success ? "breaking" : "info", `response ${code} no longer returns ${mt}`, op, `responses.${code}.${mt}`);
      else d.schema(bc[mt]?.schema, hc[mt]?.schema, "response", op, `${code}`);
    }
    for (const mt of Object.keys(hc)) if (!(mt in bc)) d.add("response-media-type-added", "non-breaking", `response ${code} may now return ${mt}`, op, `responses.${code}.${mt}`);
    const bh = Object.keys(br[code]?.headers ?? {}).map((x) => x.toLowerCase());
    const hh = new Set(Object.keys(hr[code]?.headers ?? {}).map((x) => x.toLowerCase()));
    for (const name of bh) if (!hh.has(name)) d.add("response-header-removed", success ? "breaking" : "info", `response ${code} header ${name} removed`, op, `responses.${code}.headers.${name}`, true);
  }
  for (const code of Object.keys(hr)) {
    if (code in br) continue;
    d.add(/^[23]/.test(code) ? "response-success-status-added" : "response-non-success-status-added", /^[23]/.test(code) ? "info" : "non-breaking", `response ${code} added`, op, `responses.${code}`);
  }

  // Security
  const bs = securityAlternatives(b.security);
  const hs = securityAlternatives(h.security);
  if (bs.anonymous && !hs.anonymous) d.add("security-authentication-required", "breaking", "authentication is now required", op, "security");
  if (!bs.anonymous && hs.anonymous) d.add("security-authentication-optional", "non-breaking", "authentication is no longer required", op, "security");
  if (!bs.anonymous || !hs.anonymous) {
    for (const [names, scopes] of bs.alts) {
      const now = hs.alts.get(names);
      if (!now) {
        if (!hs.anonymous) d.add("security-requirement-removed", "breaking", `security alternative "${names}" is no longer accepted`, op, "security");
        continue;
      }
      const addedScopes = [...now].filter((s) => !scopes.has(s));
      if (addedScopes.length) d.add("security-scope-added", "breaking", `additional scopes required: ${addedScopes.join(", ")}`, op, "security");
    }
    for (const names of hs.alts.keys()) if (!bs.alts.has(names)) d.add("security-requirement-added", bs.alts.size === 0 && !bs.anonymous ? "breaking" : "non-breaking", `security alternative "${names}" added`, op, "security");
  }

  const bsv = (b.servers ?? []).map((s: Json) => s.url).join(",");
  const hsv = (h.servers ?? []).map((s: Json) => s.url).join(",");
  if (bsv !== hsv) d.add("operation-servers-changed", "info", `servers changed from [${bsv}] to [${hsv}]`, op);
}

export interface DiffResult {
  summary: Record<ChangeLevel, number> & { total: number; endpointsAdded: number; endpointsRemoved: number };
  changes: Change[];
}

export function diffOpenApi(base: OpenApiView, head: OpenApiView): DiffResult {
  const d = new Differ();
  const index = (v: OpenApiView) => {
    const m = new Map<string, OperationEntry>();
    for (const e of listOperationEntries(v)) m.set(`${e.kind}|${e.method} ${e.kind === "path" ? normPath(e.path) : e.path}`, e);
    return m;
  };
  const bOps = index(base);
  const hOps = index(head);
  let added = 0;
  let removed = 0;
  for (const [k, be] of bOps) {
    const he = hOps.get(k);
    const label = `${be.method} ${be.path}`;
    if (!he) {
      removed++;
      d.add(be.kind === "webhook" ? "webhook-removed" : "endpoint-removed", "breaking", `${be.kind === "webhook" ? "webhook" : "endpoint"} removed${be.operation.deprecated ? " (was deprecated)" : ""}`, label);
      continue;
    }
    compareOperation(d, base, be, head, he);
  }
  for (const [k, he] of hOps) {
    if (bOps.has(k)) continue;
    added++;
    d.add(he.kind === "webhook" ? "webhook-added" : "endpoint-added", "non-breaking", `${he.kind === "webhook" ? "webhook" : "endpoint"} added`, `${he.method} ${he.path}`);
  }

  // Document-level
  if (base.doc.info?.version !== head.doc.info?.version) d.add("api-version-changed", "info", `info.version changed from ${base.doc.info?.version} to ${head.doc.info?.version}`);
  if (base.version !== head.version) d.add("spec-version-changed", "info", `Spec version changed from ${base.version} to ${head.version}`);
  const bsrv = getServers(base).map((s) => s.url).join(",");
  const hsrv = getServers(head).map((s) => s.url).join(",");
  if (bsrv !== hsrv) d.add("servers-changed", "info", `servers changed from [${bsrv}] to [${hsrv}]`);
  const bModels = Object.keys(rawModels(base));
  const hModels = new Set(Object.keys(rawModels(head)));
  for (const m of bModels) if (!hModels.has(m)) d.add("component-schema-removed", "info", `schema ${m} removed from components`);
  for (const m of hModels) if (!bModels.includes(m)) d.add("component-schema-added", "info", `schema ${m} added to components`);
  const bSec = Object.keys(securitySchemes(base));
  const hSec = new Set(Object.keys(securitySchemes(head)));
  for (const s of bSec) if (!hSec.has(s)) d.add("security-scheme-removed", "info", `security scheme ${s} removed`);

  const count = (lvl: ChangeLevel) => d.changes.filter((c) => c.level === lvl).length;
  const order: Record<ChangeLevel, number> = { breaking: 0, "non-breaking": 1, info: 2 };
  const changes = [...d.changes].sort((a, b) => order[a.level] - order[b.level]);
  return {
    summary: {
      breaking: count("breaking"),
      "non-breaking": count("non-breaking"),
      info: count("info"),
      total: changes.length,
      endpointsAdded: added,
      endpointsRemoved: removed,
    },
    changes,
  };
}
