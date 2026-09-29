// SPDX-License-Identifier: MIT
/**
 * Example generation: a sample value that satisfies a JSON Schema (OpenAPI
 * 3.0 and 3.1 — `type` arrays, `const`, `examples`, `prefixItems`), and
 * ready-to-run request snippets for an operation (curl, HTTPie, fetch,
 * Python requests). Credentials are never inlined: snippets read them from
 * environment variables such as $API_TOKEN.
 */

import { refName } from "./refs.js";
import { operationDetails, type Json, type OpenApiView, type OperationEntry } from "./openapi.js";

export interface SampleOptions {
  mode?: "request" | "response";
  maxDepth?: number;
  /** Include optional properties (default true). */
  includeOptional?: boolean;
}

const FORMAT_SAMPLES: Record<string, unknown> = {
  "date-time": "2024-01-15T09:30:00Z",
  date: "2024-01-15",
  time: "09:30:00Z",
  duration: "P1D",
  email: "user@example.com",
  "idn-email": "user@example.com",
  hostname: "example.com",
  ipv4: "192.0.2.10",
  ipv6: "2001:db8::10",
  uri: "https://example.com/resource",
  "uri-reference": "/resource",
  url: "https://example.com/resource",
  uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  byte: "ZXhhbXBsZQ==",
  binary: "<binary>",
  password: "********",
  "json-pointer": "/path",
  regex: "^.*$",
};

function pickType(schema: Json): string | undefined {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x: string) => x !== "null") ?? "null";
  if (t) return t;
  if (schema.properties || schema.additionalProperties || schema.patternProperties) return "object";
  if (schema.items || schema.prefixItems) return "array";
  return undefined;
}

export function sampleFromSchema(schema: Json, opts: SampleOptions = {}, depth = 0): unknown {
  const maxDepth = opts.maxDepth ?? 8;
  if (schema === true || schema === undefined) return "value";
  if (!schema || typeof schema !== "object") return null;
  if (schema.$circular || schema.$truncated || schema.$unresolved) return null;
  if (depth > maxDepth) return null;

  if (schema.const !== undefined) return schema.const;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum.find((v: unknown) => v !== null) ?? schema.enum[0];

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const parts = schema.allOf.map((s: Json) => sampleFromSchema(s, opts, depth + 1));
    const { allOf: _a, ...rest } = schema;
    const own = Object.keys(rest).some((k) => ["properties", "type", "items"].includes(k)) ? sampleFromSchema(rest, opts, depth + 1) : undefined;
    const objects = [...parts, own].filter((p) => p && typeof p === "object" && !Array.isArray(p));
    if (objects.length > 0) return Object.assign({}, ...objects);
    return parts.find((p: unknown) => p !== null && p !== undefined) ?? null;
  }
  for (const key of ["oneOf", "anyOf"] as const) {
    const list = schema[key];
    if (Array.isArray(list) && list.length > 0) {
      const choice = list.find((s: Json) => pickType(s) !== "null") ?? list[0];
      const value = sampleFromSchema(choice, opts, depth + 1);
      const prop = schema.discriminator?.propertyName;
      if (prop && value && typeof value === "object" && !Array.isArray(value)) {
        const ref = choice?.["x-ref"] as string | undefined;
        const mapped = Object.entries(schema.discriminator.mapping ?? {}).find(([, v]) => v === ref)?.[0];
        (value as Record<string, unknown>)[prop] = mapped ?? (ref ? refName(ref) : (value as Record<string, unknown>)[prop]);
      }
      if (!schema.properties) return value;
    }
  }

  const type = pickType(schema);
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
      for (const [name, prop] of Object.entries((schema.properties ?? {}) as Record<string, Json>)) {
        if (opts.mode === "request" && prop?.readOnly) continue;
        if (opts.mode === "response" && prop?.writeOnly) continue;
        if (opts.includeOptional === false && !required.has(name)) continue;
        out[name] = sampleFromSchema(prop, opts, depth + 1);
      }
      if (Object.keys(out).length === 0 && schema.additionalProperties && typeof schema.additionalProperties === "object") {
        out.key = sampleFromSchema(schema.additionalProperties, opts, depth + 1);
      }
      return out;
    }
    case "array": {
      if (Array.isArray(schema.prefixItems)) return schema.prefixItems.map((s: Json) => sampleFromSchema(s, opts, depth + 1));
      const item = sampleFromSchema(schema.items ?? {}, opts, depth + 1);
      const n = Math.max(1, Math.min(Number(schema.minItems ?? 1), 3));
      return Array.from({ length: n }, () => item);
    }
    case "string": {
      if (schema.format && FORMAT_SAMPLES[schema.format] !== undefined) return FORMAT_SAMPLES[schema.format];
      let s = "string";
      const min = Number(schema.minLength ?? 0);
      const max = Number(schema.maxLength ?? Infinity);
      if (s.length < min) s = s.padEnd(min, "x");
      if (s.length > max) s = s.slice(0, Math.max(0, max));
      return s;
    }
    case "integer":
    case "number": {
      let n = 0;
      if (typeof schema.minimum === "number") n = schema.minimum;
      if (typeof schema.exclusiveMinimum === "number") n = schema.exclusiveMinimum + (type === "integer" ? 1 : 0.5);
      else if (schema.exclusiveMinimum === true) n += type === "integer" ? 1 : 0.5;
      if (typeof schema.maximum === "number" && n > schema.maximum) n = schema.maximum;
      if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) n = Math.ceil(n / schema.multipleOf) * schema.multipleOf;
      return type === "integer" ? Math.round(n) : n;
    }
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      return schema.properties ? {} : null;
  }
}

// ---------------------------------------------------------------------------
// Request snippets
// ---------------------------------------------------------------------------

export type SnippetFormat = "curl" | "httpie" | "fetch" | "python";

interface BuiltRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  /** Header values that are env-var placeholders: header name → env var. */
  secretHeaders: Map<string, string>;
  secretQuery: Map<string, string>;
  body?: { mediaType: string; value: unknown };
  notes: string[];
}

function paramValue(p: Json): unknown {
  if (p.example !== undefined) return p.example;
  if (p.examples && typeof p.examples === "object") {
    const first = Object.values(p.examples as Record<string, Json>)[0];
    if (first?.value !== undefined) return first.value;
  }
  const schema = p.schema ?? (p.content ? (Object.values(p.content)[0] as Json)?.schema : undefined);
  const v = sampleFromSchema(schema ?? { type: "string" }, { mode: "request" });
  return v === null || v === "string" ? (p.in === "path" ? `${p.name}` : "value") : v;
}

function envName(scheme: string, suffix: string): string {
  return `${scheme.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}_${suffix}`;
}

export function buildRequest(
  view: OpenApiView,
  entry: OperationEntry,
  opts: { baseUrl?: string; includeOptional?: boolean; mediaType?: string } = {}
): { request: BuiltRequest; details: Record<string, Json> } {
  const details = operationDetails(view, entry, { resolveRefs: true }) as Record<string, Json>;
  const notes: string[] = [];
  const server = opts.baseUrl ?? details.servers?.[0]?.url ?? "http://localhost";
  if (!opts.baseUrl && /\{[^}]+\}|^\//.test(server)) notes.push(`Server URL "${server}" is relative or templated; pass baseUrl to override.`);

  let path = entry.path;
  const query: Array<[string, string]> = [];
  const headers: Array<[string, string]> = [];
  const cookies: string[] = [];
  for (const p of (details.parameters ?? []) as Json[]) {
    if (!p?.name) continue;
    const include = p.in === "path" || p.required || opts.includeOptional;
    if (!include) continue;
    const value = paramValue(p);
    const asString = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
    if (p.in === "path") path = path.split(`{${p.name}}`).join(encodeURIComponent(asString(value)));
    else if (p.in === "query") {
      if (Array.isArray(value) && p.explode !== false) for (const v of value) query.push([p.name, asString(v)]);
      else query.push([p.name, Array.isArray(value) ? value.map(asString).join(",") : asString(value)]);
    } else if (p.in === "header") headers.push([p.name, asString(value)]);
    else if (p.in === "cookie") cookies.push(`${p.name}=${encodeURIComponent(asString(value))}`);
  }

  // Security: the first alternative, as env-var placeholders.
  const secretHeaders = new Map<string, string>();
  const secretQuery = new Map<string, string>();
  const sec = details.security as Json;
  const firstReq = (sec?.requirements ?? []).find((r: Json) => r && Object.keys(r).length > 0);
  if (firstReq) {
    for (const name of Object.keys(firstReq)) {
      const scheme = sec.schemes?.[name];
      if (!scheme) {
        notes.push(`Security scheme "${name}" is not defined in the document.`);
        continue;
      }
      const type = scheme.type;
      if (type === "apiKey") {
        const env = envName(name, "API_KEY");
        if (scheme.in === "header") secretHeaders.set(scheme.name, env);
        else if (scheme.in === "query") secretQuery.set(scheme.name, env);
        else if (scheme.in === "cookie") cookies.push(`${scheme.name}=\${${env}}`);
      } else if ((type === "http" && String(scheme.scheme).toLowerCase() === "basic") || type === "basic") {
        secretHeaders.set("Authorization", `basic:${envName(name, "CREDENTIALS")}`);
      } else if (type === "http" || type === "oauth2" || type === "openIdConnect" || type === "mutualTLS") {
        if (type === "mutualTLS") notes.push(`"${name}" requires a client TLS certificate.`);
        else secretHeaders.set("Authorization", `bearer:${envName(name, "TOKEN")}`);
      }
    }
  }
  if (cookies.length) headers.push(["Cookie", cookies.join("; ")]);

  let body: BuiltRequest["body"];
  const content = details.requestBody?.content as Record<string, Json> | undefined;
  if (content && Object.keys(content).length > 0) {
    const types = Object.keys(content);
    const mediaType =
      (opts.mediaType && types.find((t) => t === opts.mediaType)) ||
      types.find((t) => /json/i.test(t)) ||
      types[0];
    if (opts.mediaType && mediaType !== opts.mediaType) notes.push(`Media type ${opts.mediaType} not offered; using ${mediaType}.`);
    const media = content[mediaType] ?? {};
    let value: unknown;
    if (media.example !== undefined) value = media.example;
    else if (media.examples && typeof media.examples === "object") {
      const first = Object.values(media.examples as Record<string, Json>)[0];
      value = first?.value;
    }
    if (value === undefined) value = sampleFromSchema(media.schema ?? {}, { mode: "request", includeOptional: opts.includeOptional !== false });
    body = { mediaType, value };
    headers.push(["Content-Type", mediaType.startsWith("multipart/") ? "" : mediaType]);
  }

  let full = server.replace(/\/$/, "") + path;
  const qs = new URLSearchParams(query).toString();
  if (qs) full += `?${qs}`;

  return {
    request: {
      method: entry.method,
      url: full,
      headers: headers.filter(([, v]) => v !== ""),
      secretHeaders,
      secretQuery,
      body,
      notes,
    },
    details,
  };
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function secretHeaderValue(spec: string, style: "sh" | "js" | "py"): string {
  const [kind, env] = spec.includes(":") ? (spec.split(":") as [string, string]) : ["raw", spec];
  const ref = style === "sh" ? `\${${env}}` : style === "js" ? `\${process.env.${env}}` : `{os.environ['${env}']}`;
  if (kind === "bearer") return `Bearer ${ref}`;
  if (kind === "basic") return `Basic ${ref}`;
  return ref;
}

function urlWithSecretQuery(url: string, secretQuery: Map<string, string>, style: "sh" | "js" | "py"): string {
  if (secretQuery.size === 0) return url;
  const parts = [...secretQuery].map(([k, env]) => {
    const ref = style === "sh" ? `\${${env}}` : style === "js" ? `\${process.env.${env}}` : `{os.environ['${env}']}`;
    return `${encodeURIComponent(k)}=${ref}`;
  });
  return url + (url.includes("?") ? "&" : "?") + parts.join("&");
}

function formFields(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [["value", JSON.stringify(value)]];
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
}

function toPython(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent + 1);
  const end = "    ".repeat(indent);
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => pad + toPython(v, indent + 1)).join(",\n")},\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${toPython(v, indent + 1)}`).join(",\n")},\n${end}}`;
}

export function renderSnippet(req: BuiltRequest, format: SnippetFormat): string {
  const isJson = req.body && /json/i.test(req.body.mediaType);
  const isForm = req.body?.mediaType === "application/x-www-form-urlencoded";
  const isMultipart = req.body?.mediaType.startsWith("multipart/");
  const bodyText = req.body
    ? isJson
      ? JSON.stringify(req.body.value, null, 2)
      : isForm
        ? new URLSearchParams(formFields(req.body.value)).toString()
        : typeof req.body.value === "string"
          ? req.body.value
          : JSON.stringify(req.body.value)
    : undefined;

  switch (format) {
    case "curl": {
      const lines = [`curl -X ${req.method} ${req.secretQuery.size ? `"${urlWithSecretQuery(req.url, req.secretQuery, "sh")}"` : shQuote(req.url)}`];
      for (const [k, v] of req.headers) lines.push(`  -H ${shQuote(`${k}: ${v}`)}`);
      for (const [k, spec] of req.secretHeaders) lines.push(`  -H "${k}: ${secretHeaderValue(spec, "sh")}"`);
      if (isMultipart) for (const [k, v] of formFields(req.body!.value)) lines.push(`  -F ${shQuote(`${k}=${v}`)}`);
      else if (bodyText !== undefined) lines.push(`  --data-raw ${shQuote(bodyText)}`);
      return lines.join(" \\\n");
    }
    case "httpie": {
      const parts: string[] = [];
      for (const [k, v] of req.headers) parts.push(shQuote(`${k}:${v}`));
      for (const [k, spec] of req.secretHeaders) parts.push(`"${k}:${secretHeaderValue(spec, "sh")}"`);
      const url = req.secretQuery.size ? `"${urlWithSecretQuery(req.url, req.secretQuery, "sh")}"` : shQuote(req.url);
      if (isMultipart) {
        return `http --multipart ${req.method} ${url} ${[...parts, ...formFields(req.body!.value).map(([k, v]) => shQuote(`${k}=${v}`))].join(" ")}`.trim();
      }
      if (isForm) {
        return `http --form ${req.method} ${url} ${[...parts, ...formFields(req.body!.value).map(([k, v]) => shQuote(`${k}=${v}`))].join(" ")}`.trim();
      }
      const cmd = `http ${req.method} ${url} ${parts.join(" ")}`.trim();
      return bodyText !== undefined ? `printf '%s' ${shQuote(bodyText)} | ${cmd}` : cmd;
    }
    case "fetch": {
      const headerLines = [
        ...req.headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
        ...[...req.secretHeaders].map(([k, spec]) => `    ${JSON.stringify(k)}: \`${secretHeaderValue(spec, "js")}\`,`),
      ];
      const url = req.secretQuery.size ? `\`${urlWithSecretQuery(req.url, req.secretQuery, "js")}\`` : JSON.stringify(req.url);
      let bodyLine = "";
      if (isMultipart) {
        const fd = formFields(req.body!.value).map(([k, v]) => `form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n");
        return `const form = new FormData();\n${fd}\n\nconst response = await fetch(${url}, {\n  method: ${JSON.stringify(req.method)},\n  headers: {\n${headerLines.join("\n")}\n  },\n  body: form,\n});\nconsole.log(response.status, await response.text());`;
      }
      if (bodyText !== undefined) {
        bodyLine = isJson
          ? `  body: JSON.stringify(${JSON.stringify(req.body!.value, null, 2).replace(/\n/g, "\n  ")}),\n`
          : `  body: ${JSON.stringify(bodyText)},\n`;
      }
      return `const response = await fetch(${url}, {\n  method: ${JSON.stringify(req.method)},\n  headers: {\n${headerLines.join("\n")}\n  },\n${bodyLine}});\nconsole.log(response.status, await response.text());`;
    }
    case "python": {
      const hdr = [
        ...req.headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
        ...[...req.secretHeaders].map(([k, spec]) => `    ${JSON.stringify(k)}: f"${secretHeaderValue(spec, "py")}",`),
      ];
      const url = req.secretQuery.size ? `f"${urlWithSecretQuery(req.url, req.secretQuery, "py")}"` : JSON.stringify(req.url);
      const args = [url, "headers=headers"];
      let pre = "";
      if (req.body) {
        if (isJson) {
          pre = `payload = ${toPython(req.body.value)}\n`;
          args.push("json=payload");
        } else if (isForm || isMultipart) {
          pre = `payload = ${toPython(Object.fromEntries(formFields(req.body.value)))}\n`;
          args.push(isMultipart ? "files={k: (None, v) for k, v in payload.items()}" : "data=payload");
        } else {
          pre = `payload = ${JSON.stringify(bodyText)}\n`;
          args.push("data=payload");
        }
      }
      const needsOs = req.secretHeaders.size > 0 || req.secretQuery.size > 0;
      return `${needsOs ? "import os\n" : ""}import requests\n\nheaders = {\n${hdr.join("\n")}\n}\n${pre}response = requests.request(${JSON.stringify(req.method)}, ${args.join(", ")})\nprint(response.status_code, response.text)`;
    }
  }
}
