// SPDX-License-Identifier: MIT
/**
 * A Spectral-style lint ruleset for OpenAPI 2/3.x, in plain TypeScript.
 * Rule ids follow Spectral's `oas` ruleset where one exists so findings are
 * familiar; severities: error > warn > info > hint.
 */

import { collectRefs } from "./loader.js";
import { isLiteralDataKey, isNameMap } from "./refs.js";
import {
  listOperationEntries,
  newDeref,
  reachable,
  refGraph,
  securitySchemes,
  type Json,
  type OpenApiView,
} from "./openapi.js";

export type Severity = "error" | "warn" | "info" | "hint";
export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2, hint: 3 };

export interface LintFinding {
  rule: string;
  severity: Severity;
  message: string;
  location: string;
}

export const LINT_RULES: Record<string, { severity: Severity; description: string }> = {
  "info-contact": { severity: "info", description: "info.contact should be present" },
  "info-description": { severity: "info", description: "info.description should be present" },
  "info-license": { severity: "info", description: "info.license should be present" },
  "servers-defined": { severity: "warn", description: "servers (OAS3) or host (Swagger 2) should be declared" },
  "operation-operationId": { severity: "warn", description: "Every operation should have an operationId" },
  "operation-operationId-unique": { severity: "error", description: "operationIds must be unique" },
  "operation-description": { severity: "warn", description: "Operations should have a summary or description" },
  "operation-tags": { severity: "warn", description: "Operations should have at least one tag" },
  "operation-tag-defined": { severity: "info", description: "Operation tags should be declared in the global tags list" },
  "operation-success-response": { severity: "warn", description: "Operations should define a 2xx/3xx response" },
  "operation-error-response": { severity: "warn", description: "Operations should document error responses (4xx/5xx/default)" },
  "operation-parameters-unique": { severity: "error", description: "A parameter name+location may appear only once per operation" },
  "path-params": { severity: "error", description: "Path template variables and declared path parameters must match; path params must be required" },
  "path-declarations-must-exist": { severity: "error", description: "Path template variables must not be empty ({})" },
  "path-keys-no-trailing-slash": { severity: "warn", description: "Paths should not end with a slash" },
  "path-not-include-query": { severity: "error", description: "Paths must not include a query string" },
  "path-duplicate-template": { severity: "error", description: "Paths that differ only in parameter names are ambiguous" },
  "path-casing-consistent": { severity: "info", description: "Literal path segments should use one naming style" },
  "operationId-casing-consistent": { severity: "info", description: "operationIds should use one naming style" },
  "property-casing-consistent": { severity: "info", description: "Schema property names should use one naming style" },
  "no-invalid-ref": { severity: "error", description: "Every $ref must resolve" },
  "unused-component": { severity: "warn", description: "Components should be referenced somewhere" },
  "security-scheme-defined": { severity: "error", description: "Security requirements must reference defined schemes" },
  "no-request-body-on-get": { severity: "warn", description: "GET/HEAD requests should not have a body" },
  "response-description": { severity: "warn", description: "Responses must have a description" },
  "parameter-description": { severity: "hint", description: "Parameters should have a description" },
  "typed-enum": { severity: "warn", description: "Enum values should match the schema type" },
  "required-property-defined": { severity: "warn", description: "Properties listed in required should be defined" },
};

type Style = "kebab-case" | "snake_case" | "camelCase" | "PascalCase" | "lowercase" | "UPPER_CASE" | "mixed";

export function namingStyle(s: string): Style {
  if (/^[a-z0-9]+$/.test(s)) return "lowercase";
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return "kebab-case";
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return "snake_case";
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(s)) return "camelCase";
  if (/^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$/.test(s)) return "PascalCase";
  if (/^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(s)) return "UPPER_CASE";
  return "mixed";
}

/** Styles in use, ignoring single-word lowercase names that fit any style. */
function inconsistentStyles(names: string[]): Map<Style, string[]> | undefined {
  const byStyle = new Map<Style, string[]>();
  for (const n of names) {
    const st = namingStyle(n);
    if (st === "lowercase") continue;
    const list = byStyle.get(st) ?? [];
    list.push(n);
    byStyle.set(st, list);
  }
  return byStyle.size > 1 ? byStyle : undefined;
}

function typeMatches(type: string, v: unknown): boolean {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "number":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return !!v && typeof v === "object" && !Array.isArray(v);
    case "null":
      return v === null;
    default:
      return true;
  }
}

export function lintOpenApi(view: OpenApiView): LintFinding[] {
  const findings: LintFinding[] = [];
  const add = (rule: string, message: string, location: string) =>
    findings.push({ rule, severity: LINT_RULES[rule].severity, message, location });
  const doc = view.doc;

  // --- info / servers
  if (!doc.info?.contact) add("info-contact", "info.contact is missing", "info");
  if (!doc.info?.description) add("info-description", "info.description is missing", "info");
  if (!doc.info?.license) add("info-license", "info.license is missing", "info");
  if (view.family === "openapi3" ? !doc.servers?.length : !doc.host) {
    add("servers-defined", view.family === "openapi3" ? "No servers declared (clients default to '/')" : "No host declared", view.family === "openapi3" ? "servers" : "host");
  }

  // --- paths
  const entries = listOperationEntries(view);
  const d = newDeref(view, { annotate: false });
  const declaredTags = new Set<string>((doc.tags ?? []).map((t: Json) => t?.name));
  const opIds = new Map<string, string[]>();
  const pathSegments: string[] = [];
  const normalized = new Map<string, string[]>();

  for (const path of Object.keys(doc.paths ?? {})) {
    if (path.startsWith("x-")) continue;
    const loc = `paths.${path}`;
    if (path.includes("?")) add("path-not-include-query", `Path "${path}" contains a query string`, loc);
    if (path.length > 1 && path.endsWith("/")) add("path-keys-no-trailing-slash", `Path "${path}" ends with a slash`, loc);
    if (/\{\s*\}/.test(path)) add("path-declarations-must-exist", `Path "${path}" has an empty parameter declaration`, loc);
    const norm = path.replace(/\{[^}]*\}/g, "{}");
    normalized.set(norm, [...(normalized.get(norm) ?? []), path]);
    for (const seg of path.split("/")) if (seg && !seg.includes("{") && !seg.startsWith("x-")) pathSegments.push(seg);
  }
  for (const [, paths] of normalized) {
    if (paths.length > 1) add("path-duplicate-template", `Paths ${paths.map((p) => `"${p}"`).join(" and ")} are equivalent`, `paths.${paths[1]}`);
  }

  const schemes = securitySchemes(view);
  const checkSecurity = (reqs: Json, loc: string) => {
    if (!Array.isArray(reqs)) return;
    for (const r of reqs) {
      for (const name of Object.keys(r ?? {})) {
        if (!schemes[name]) add("security-scheme-defined", `Security scheme "${name}" is not defined`, loc);
      }
    }
  };
  checkSecurity(doc.security, "security");

  for (const e of entries) {
    const op = e.operation;
    const loc = `${e.kind === "webhook" ? "webhooks" : "paths"}.${e.path}.${e.method.toLowerCase()}`;
    const label = `${e.method} ${e.path}`;
    if (!op.operationId) add("operation-operationId", `${label} has no operationId`, loc);
    else opIds.set(op.operationId, [...(opIds.get(op.operationId) ?? []), label]);
    if (!op.summary && !op.description) add("operation-description", `${label} has neither summary nor description`, loc);
    if (!op.tags?.length) add("operation-tags", `${label} has no tags`, loc);
    else if (declaredTags.size > 0) {
      for (const t of op.tags) if (!declaredTags.has(t)) add("operation-tag-defined", `Tag "${t}" on ${label} is not declared in the global tags`, loc);
    }
    checkSecurity(op.security, `${loc}.security`);

    const codes = Object.keys(op.responses ?? {}).filter((c) => !c.startsWith("x-"));
    if (!codes.some((c) => /^[23]/.test(c)) && !codes.includes("default")) {
      add("operation-success-response", `${label} defines no 2xx/3xx response`, `${loc}.responses`);
    }
    if (!codes.some((c) => /^[45]/.test(c)) && !codes.includes("default")) {
      add("operation-error-response", `${label} documents no 4xx/5xx or default response`, `${loc}.responses`);
    }
    for (const c of codes) {
      const r = d.shallow(op.responses[c], e.docKey).value as Json;
      if (r && typeof r === "object" && !r.$ref && !r.description) add("response-description", `Response ${c} of ${label} has no description`, `${loc}.responses.${c}`);
    }

    // Parameters: merged view (operation overrides path level).
    const opParams = new Map<string, Json>();
    const seenInList = (list: Json[] | undefined, where: string) => {
      const keys = new Set<string>();
      for (const raw of list ?? []) {
        const p = d.shallow(raw, e.docKey).value as Json;
        if (!p?.name) continue;
        const k = `${p.in}:${p.name}`;
        if (keys.has(k)) add("operation-parameters-unique", `Parameter "${p.name}" (${p.in}) is declared twice`, where);
        keys.add(k);
        opParams.set(k, p);
      }
    };
    seenInList(e.pathItem.parameters, `paths.${e.path}.parameters`);
    seenInList(op.parameters, `${loc}.parameters`);
    for (const p of opParams.values()) {
      if (!p.description) add("parameter-description", `Parameter "${p.name}" of ${label} has no description`, `${loc}.parameters`);
    }
    if (e.kind === "path") {
      const templateVars = [...e.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const declared = [...opParams.values()].filter((p) => p.in === "path");
      for (const v of templateVars) {
        if (v && !declared.some((p) => p.name === v)) add("path-params", `${label}: path variable "{${v}}" is not declared as a path parameter`, loc);
      }
      for (const p of declared) {
        if (!templateVars.includes(p.name)) add("path-params", `${label}: path parameter "${p.name}" does not appear in the path template`, loc);
        else if (p.required !== true) add("path-params", `${label}: path parameter "${p.name}" must be required: true`, loc);
      }
    }
    const hasBody =
      op.requestBody || [...opParams.values()].some((p) => p.in === "body" || p.in === "formData");
    if (hasBody && (e.method === "GET" || e.method === "HEAD")) add("no-request-body-on-get", `${label} declares a request body`, loc);
  }

  for (const [id, where] of opIds) {
    if (where.length > 1) add("operation-operationId-unique", `operationId "${id}" is used by ${where.join(", ")}`, "paths");
  }
  const pathStyles = inconsistentStyles([...new Set(pathSegments)]);
  if (pathStyles) {
    add("path-casing-consistent", `Path segments mix ${[...pathStyles.entries()].map(([st, n]) => `${st} (e.g. "${n[0]}")`).join(", ")}`, "paths");
  }
  const idStyles = inconsistentStyles([...opIds.keys()]);
  if (idStyles) {
    add("operationId-casing-consistent", `operationIds mix ${[...idStyles.entries()].map(([st, n]) => `${st} (e.g. "${n[0]}")`).join(", ")}`, "paths");
  }

  // --- references
  const rootRefs = collectRefs(doc);
  for (const ref of rootRefs) {
    const r = d.resolve(ref);
    if ("error" in r) add("no-invalid-ref", `$ref "${ref}" does not resolve: ${r.error}`, "$ref");
  }
  for (const [extKey, ext] of view.loaded.externals) {
    if (!d.knows(extKey)) continue;
    for (const ref of collectRefs(ext)) {
      const r = d.resolve(ref, extKey);
      if ("error" in r) add("no-invalid-ref", `$ref "${ref}" in ${extKey} does not resolve: ${r.error}`, "$ref");
    }
  }
  for (const [key, err] of view.loaded.externalErrors) {
    add("no-invalid-ref", `External document ${key.includes("|") ? key.split("|")[1] : key} could not be loaded: ${err}`, "$ref");
  }

  // --- unused components
  const graph = refGraph(view);
  const used = reachable(graph, [...graph.rootRefs, ...[...graph.operationRefs.values()].flatMap((s) => [...s])]);
  const sections: Array<[string, Json]> =
    view.family === "swagger2"
      ? [["definitions", doc.definitions], ["parameters", doc.parameters], ["responses", doc.responses]]
      : Object.entries(doc.components ?? {})
          .filter(([k]) => k !== "securitySchemes" && !k.startsWith("x-"))
          .map(([k, v]) => [`components/${k}`, v]);
  for (const [section, map] of sections) {
    if (!map || typeof map !== "object") continue;
    for (const name of Object.keys(map)) {
      const ptr = `#/${section}/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (!used.has(ptr)) add("unused-component", `${section.replace("components/", "")} "${name}" is never referenced`, ptr.slice(2).replace(/\//g, "."));
    }
  }
  const usedSchemes = new Set<string>();
  for (const reqs of [doc.security, ...entries.map((e) => e.operation.security)]) {
    for (const r of Array.isArray(reqs) ? reqs : []) for (const n of Object.keys(r ?? {})) usedSchemes.add(n);
  }
  for (const name of Object.keys(schemes)) {
    if (!usedSchemes.has(name)) add("unused-component", `securityScheme "${name}" is never used by a security requirement`, `securitySchemes.${name}`);
  }

  // --- schemas (walk the root document)
  const propertyNames = new Set<string>();
  const walk = (node: unknown, path: string, parentKey: string) => {
    if (Array.isArray(node)) {
      if (parentKey === "examples") return;
      node.forEach((v, i) => walk(v, `${path}[${i}]`, ""));
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Json;
    const inNameMap = isNameMap(parentKey);
    if (!inNameMap && o.properties && typeof o.properties === "object" && !Array.isArray(o.properties)) {
      for (const p of Object.keys(o.properties)) propertyNames.add(p);
      if (Array.isArray(o.required)) {
        const combined = o.allOf || o.oneOf || o.anyOf || o.additionalProperties;
        if (!combined) {
          for (const r of o.required) if (typeof r === "string" && !(r in o.properties)) add("required-property-defined", `"${r}" is required but not defined in properties`, path);
        }
      }
    }
    if (!inNameMap && Array.isArray(o.enum) && typeof o.type === "string") {
      const bad = o.enum.filter((v: unknown) => !typeMatches(o.type, v) && !(v === null && o.nullable));
      if (bad.length) add("typed-enum", `Enum values ${bad.slice(0, 3).map((v: unknown) => JSON.stringify(v)).join(", ")} do not match type "${o.type}"`, path);
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === "$ref" || isLiteralDataKey(k, parentKey)) continue;
      walk(v, path ? `${path}.${k}` : k, inNameMap ? "" : k);
    }
  };
  walk(doc, "", "");
  const propStyles = inconsistentStyles([...propertyNames]);
  if (propStyles) {
    add(
      "property-casing-consistent",
      `Schema properties mix ${[...propStyles.entries()].map(([st, n]) => `${st} (e.g. "${n[0]}")`).join(", ")}`,
      view.family === "swagger2" ? "definitions" : "components.schemas"
    );
  }

  return findings;
}
