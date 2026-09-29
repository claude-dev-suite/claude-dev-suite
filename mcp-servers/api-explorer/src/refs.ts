// SPDX-License-Identifier: MIT
/**
 * `$ref` dereferencing: internal pointers, other project files, other URLs
 * (every external document was fetched through the guarded loader) and git
 * revisions — returning NEW objects, never touching the cached document.
 *
 * What used to be silent is now explicit in the output:
 *  - a cycle becomes `{ "$ref": ..., "$circular": "<Name>" }`
 *  - hitting the depth or size budget becomes
 *    `{ "$ref": ..., "$truncated": true, "reason": ... }`
 *  - a target that cannot be found or loaded becomes
 *    `{ "$ref": ..., "$unresolved": true, "error": ... }`
 * and every such case is also listed in the report, so a caller can tell a
 * complete answer from a partial one. The old resolver stopped at depth 5 and
 * returned the raw, un-marked subtree, and returned `_unresolved` for every
 * external reference.
 */

import type { LoadedDocument } from "./loader.js";
import { locationKey, resolveRefLocation, type Location } from "./location.js";

export interface RefContext {
  root: unknown;
  rootKey: string;
  rootLocation: Location;
  externals: ReadonlyMap<string, unknown>;
  externalErrors: ReadonlyMap<string, string>;
}

export function contextFor(doc: LoadedDocument): RefContext {
  return {
    root: doc.doc,
    rootKey: doc.key,
    rootLocation: doc.location,
    externals: doc.externals,
    externalErrors: doc.externalErrors,
  };
}

export interface DerefOptions {
  /** Maximum nesting of `$ref` hops along one path. */
  maxDepth?: number;
  /** Budget of output nodes; refs past it become `$truncated` markers. */
  maxNodes?: number;
  /** Add `x-ref` with the original reference to each resolved object. */
  annotate?: boolean;
}

export interface DerefReport {
  circular: string[];
  truncated: string[];
  unresolved: Array<{ ref: string; error: string }>;
}

type Resolved = { value: unknown; docKey: string; key: string } | { error: string };

export function decodePointerSegment(seg: string): string {
  let s = seg;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function evaluatePointer(doc: unknown, pointer: string): { found: boolean; value?: unknown } {
  if (pointer === "" || pointer === "/") return { found: pointer === "" || doc !== undefined, value: doc };
  if (!pointer.startsWith("/")) return { found: false };
  let current: unknown = doc;
  for (const raw of pointer.slice(1).split("/")) {
    const seg = decodePointerSegment(raw);
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return { found: false };
      current = current[idx];
    } else if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, seg)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

/** "#/components/schemas/User" → "User"; "common.yaml#/Pet" → "Pet"; "user.yaml" → "user.yaml". */
export function refName(ref: string): string {
  const hash = ref.indexOf("#");
  const pointer = hash === -1 ? "" : ref.slice(hash + 1);
  if (pointer && pointer !== "/") {
    const segs = pointer.split("/");
    return decodePointerSegment(segs[segs.length - 1]);
  }
  const doc = hash === -1 ? ref : ref.slice(0, hash);
  return doc.split(/[\\/]/).pop() || ref;
}

const DATA_KEYS = new Set(["example", "const", "default", "enum", "value"]);

/**
 * Keys whose value is a map from user-chosen names to objects. Under these a
 * key called "default", "example" or "value" is a name (a `default` response,
 * a property called `value`), not literal data.
 */
const NAME_MAPS = new Set([
  "properties", "patternProperties", "$defs", "definitions", "schemas", "dependentSchemas",
  "responses", "examples", "parameters", "headers", "content", "callbacks", "links",
  "requestBodies", "securitySchemes", "pathItems", "webhooks", "paths", "encoding",
  "channels", "messages", "operations", "servers", "variables", "messageTraits",
  "operationTraits", "serverBindings", "channelBindings", "operationBindings",
  "messageBindings", "correlationIds", "replies", "replyAddresses", "tags",
]);

export function isNameMap(key: string): boolean {
  return NAME_MAPS.has(key);
}

/** True when `key` (inside an object found under `parentKey`) holds literal data. */
export function isLiteralDataKey(key: string, parentKey: string): boolean {
  if (NAME_MAPS.has(parentKey)) return false;
  return DATA_KEYS.has(key) || key.startsWith("x-");
}

export class Dereferencer {
  readonly report: DerefReport = { circular: [], truncated: [], unresolved: [] };
  private nodes = 0;
  private readonly maxDepth: number;
  private readonly maxNodes: number;
  private readonly annotate: boolean;
  private readonly locations = new Map<string, Location>();

  constructor(private readonly ctx: RefContext, opts: DerefOptions = {}) {
    this.maxDepth = opts.maxDepth ?? 32;
    this.maxNodes = opts.maxNodes ?? 50_000;
    this.annotate = opts.annotate ?? true;
    this.locations.set(ctx.rootKey, ctx.rootLocation);
  }

  /** True when a document's location is known (root, or a loaded external document). */
  knows(docKey: string): boolean {
    return this.locations.has(docKey) || this.locationFromKey(docKey) !== undefined;
  }

  /** Rebuild the Location of a loaded external document from its cache key. */
  private locationFromKey(docKey: string): Location | undefined {
    if (docKey !== this.ctx.rootKey && !this.ctx.externals.has(docKey)) return undefined;
    let loc: Location | undefined;
    if (docKey.startsWith("file:")) loc = { type: "file", path: docKey.slice(5) };
    else if (docKey.startsWith("git:") && this.ctx.rootLocation.type === "git") {
      const rest = docKey.slice(4);
      const i = rest.indexOf(":");
      loc = { type: "git", ref: rest.slice(0, i), path: rest.slice(i + 1), repoRoot: this.ctx.rootLocation.repoRoot };
    } else if (/^https?:/.test(docKey)) loc = { type: "url", url: docKey };
    if (loc) this.locations.set(docKey, loc);
    return loc;
  }

  get rootKey(): string {
    return this.ctx.rootKey;
  }

  hasIssues(): boolean {
    return this.report.circular.length + this.report.truncated.length + this.report.unresolved.length > 0;
  }

  /** Summary suitable for inclusion in a tool response (undefined when clean). */
  summary(): Record<string, unknown> | undefined {
    if (!this.hasIssues()) return undefined;
    const uniq = (a: string[]) => [...new Set(a)];
    return {
      ...(this.report.circular.length && { circular: uniq(this.report.circular) }),
      ...(this.report.truncated.length && { truncated: uniq(this.report.truncated) }),
      ...(this.report.unresolved.length && { unresolved: this.report.unresolved.slice(0, 50) }),
    };
  }

  private docValue(docKey: string): { found: boolean; value?: unknown; error?: string } {
    if (docKey === this.ctx.rootKey) return { found: true, value: this.ctx.root };
    if (this.ctx.externals.has(docKey)) return { found: true, value: this.ctx.externals.get(docKey) };
    return { found: false, error: this.ctx.externalErrors.get(docKey) ?? "external document was not loaded" };
  }

  /** Resolve one `$ref` string relative to the document it appears in. */
  resolve(ref: string, docKey: string = this.ctx.rootKey): Resolved {
    const hash = ref.indexOf("#");
    const docPart = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? "" : ref.slice(hash + 1);
    let targetKey = docKey;
    if (docPart) {
      const base = this.locations.get(docKey) ?? this.locationFromKey(docKey);
      if (!base) return { error: `unknown base document for ${ref}` };
      let loc: Location;
      try {
        loc = resolveRefLocation(base, docPart);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
      targetKey = locationKey(loc);
      this.locations.set(targetKey, loc);
    }
    if (pointer && !pointer.startsWith("/")) {
      return { error: `anchor/plain-name fragments ("#${pointer}") are not supported` };
    }
    const doc = this.docValue(targetKey);
    if (!doc.found) return { error: doc.error ?? "document not found" };
    const hit = evaluatePointer(doc.value, pointer);
    if (!hit.found) return { error: `JSON pointer "#${pointer}" not found` };
    return { value: hit.value, docKey: targetKey, key: `${targetKey}#${pointer}` };
  }

  /**
   * Follow a chain of `$ref`s at one node without expanding its children.
   * Used for path items / parameters / responses before inspecting them.
   */
  shallow(node: unknown, docKey: string = this.ctx.rootKey): { value: unknown; docKey: string; error?: string; ref?: string } {
    let current = node;
    let key = docKey;
    let firstRef: string | undefined;
    for (let i = 0; i < 16; i++) {
      if (!current || typeof current !== "object" || typeof (current as { $ref?: unknown }).$ref !== "string") {
        return { value: current, docKey: key, ref: firstRef };
      }
      const ref = (current as { $ref: string }).$ref;
      firstRef ??= ref;
      const r = this.resolve(ref, key);
      if ("error" in r) return { value: current, docKey: key, error: r.error, ref: firstRef };
      current = r.value;
      key = r.docKey;
    }
    return { value: current, docKey: key, error: "reference chain longer than 16 hops", ref: firstRef };
  }

  /** Fully dereference a subtree. */
  deref(node: unknown, docKey: string = this.ctx.rootKey): unknown {
    return this.walk(node, docKey, [], "");
  }

  private walk(node: unknown, docKey: string, stack: string[], parentKey: string): unknown {
    if (Array.isArray(node)) {
      this.nodes++;
      if (parentKey === "examples") return node; // JSON Schema `examples` is data
      return node.map((v) => this.walk(v, docKey, stack, ""));
    }
    if (!node || typeof node !== "object") return node;
    this.nodes++;
    const obj = node as Record<string, unknown>;

    if (typeof obj.$ref === "string") {
      const ref = obj.$ref;
      const { $ref: _ignored, ...siblings } = obj;
      const r = this.resolve(ref, docKey);
      if ("error" in r) {
        this.report.unresolved.push({ ref, error: r.error });
        return { ...siblings, $ref: ref, $unresolved: true, error: r.error };
      }
      if (stack.includes(r.key)) {
        const name = refName(ref);
        this.report.circular.push(name);
        return { $ref: ref, $circular: name };
      }
      if (stack.length >= this.maxDepth) {
        this.report.truncated.push(refName(ref));
        return { $ref: ref, $truncated: true, reason: `reference depth limit (${this.maxDepth}) reached` };
      }
      if (this.nodes >= this.maxNodes) {
        this.report.truncated.push(refName(ref));
        return { $ref: ref, $truncated: true, reason: `output size budget (${this.maxNodes} nodes) reached` };
      }
      const resolved = this.walk(r.value, r.docKey, [...stack, r.key], parentKey);
      if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
        const extra = Object.keys(siblings).length > 0 ? (this.walk(siblings, docKey, stack, parentKey) as Record<string, unknown>) : {};
        return this.annotate ? { ...(resolved as object), ...extra, "x-ref": ref } : { ...(resolved as object), ...extra };
      }
      return resolved;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isLiteralDataKey(k, parentKey)) out[k] = v;
      else out[k] = this.walk(v, docKey, stack, NAME_MAPS.has(parentKey) ? "" : k);
    }
    return out;
  }
}
