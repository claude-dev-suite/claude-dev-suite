// SPDX-License-Identifier: MIT
/**
 * OpenAPI / Swagger document loader: JSON or YAML, local file or http(s) URL,
 * with full `$ref` dereferencing.
 *
 * Dereferencing produces a GRAPH, not a tree: every `$ref` to the same target
 * yields the same JS object, so a recursive schema (`Node.children: Node[]`)
 * becomes a cycle instead of an infinite expansion. Consumers that walk it
 * (sample generation, JSON-Schema conversion) carry their own cycle guards.
 *
 * NOTE: this is a candidate for `@dev-suite/shared` (api-explorer needs the same
 * loader); it lives here until shared grows one.
 *
 * Security: a document fetched from a URL may only reference other URLs (never
 * local files), and every fetch goes through the SSRF-guarded client.
 */

import { readFile, stat } from 'fs/promises';
import { dirname, resolve as resolvePath, isAbsolute } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import * as yaml from 'yaml';
import { send } from '../http/client.js';
import { requireAbsolute } from '../util/paths.js';

export const MAX_SPEC_BYTES = 20 * 1024 * 1024;
const URL_CACHE_TTL_MS = 60_000;

export interface LoadedSpec {
  /** Dereferenced document (may contain cycles). */
  doc: Record<string, unknown>;
  source: string;
  warnings: string[];
}

export function parseDocument(text: string, source: string): unknown {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Fall through: YAML is a superset of JSON and gives better errors for near-JSON.
      try {
        return yaml.parse(trimmed, { maxAliasCount: 1000 });
      } catch {
        throw new Error(`${source}: invalid JSON — ${(e as Error).message}`);
      }
    }
  }
  try {
    return yaml.parse(trimmed, { maxAliasCount: 1000 });
  } catch (e) {
    throw new Error(`${source}: invalid YAML — ${(e as Error).message}`);
  }
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

async function fetchText(source: string): Promise<string> {
  if (isUrl(source)) {
    const res = await send({
      method: 'GET',
      url: source,
      headers: { Accept: 'application/json, application/yaml, text/yaml, */*' },
      timeoutMs: 30_000,
      maxResponseBytes: MAX_SPEC_BYTES,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`GET ${source} returned HTTP ${res.status}`);
    if (res.bodyTruncated) throw new Error(`${source} exceeds ${MAX_SPEC_BYTES} bytes`);
    return res.body.toString('utf8');
  }
  const path = source.startsWith('file:') ? fileURLToPath(source) : source;
  const st = await stat(path);
  if (st.size > MAX_SPEC_BYTES) throw new Error(`${path} exceeds ${MAX_SPEC_BYTES} bytes`);
  return readFile(path, 'utf8');
}

function decodePointerToken(t: string): string {
  return decodeURIComponent(t).replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(doc: unknown, pointer: string): { found: boolean; value?: unknown } {
  if (!pointer || pointer === '/') return { found: true, value: doc };
  if (!pointer.startsWith('/')) return { found: false };
  let cur: unknown = doc;
  for (const raw of pointer.slice(1).split('/')) {
    const tok = decodePointerToken(raw);
    if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, tok)) {
      cur = (cur as Record<string, unknown>)[tok];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: cur };
}

/** Canonical id for a document location: absolute URL string or file:// URL. */
function canonical(source: string): string {
  if (isUrl(source) || source.startsWith('file:')) return source.split('#')[0];
  return pathToFileURL(isAbsolute(source) ? source : resolvePath(source)).toString();
}

function resolveRelative(ref: string, baseDoc: string): string {
  if (isUrl(ref) || ref.startsWith('file:')) return ref;
  if (isUrl(baseDoc)) return new URL(ref, baseDoc).toString();
  const basePath = fileURLToPath(baseDoc);
  return pathToFileURL(resolvePath(dirname(basePath), decodeURIComponent(ref))).toString();
}

class Dereferencer {
  private readonly docs = new Map<string, unknown>();
  private readonly memo = new Map<object, unknown>();
  readonly warnings: string[] = [];

  constructor(private readonly remoteRoot: boolean) {}

  async loadDoc(id: string): Promise<unknown> {
    if (this.docs.has(id)) return this.docs.get(id);
    if (this.remoteRoot && !isUrl(id)) {
      throw new Error(`A document loaded from a URL cannot reference a local file (${id})`);
    }
    const text = await fetchText(id);
    const parsed = parseDocument(text, id);
    this.docs.set(id, parsed);
    return parsed;
  }

  seed(id: string, doc: unknown): void {
    this.docs.set(id, doc);
  }

  /** Pre-load every external document reachable through $ref (async), so deref can be sync. */
  async preload(id: string, seen = new Set<string>()): Promise<void> {
    if (seen.has(id)) return;
    seen.add(id);
    const doc = await this.loadDoc(id);
    const refs = new Set<string>();
    const walk = (v: unknown, depth: number) => {
      if (depth > 200 || !v || typeof v !== 'object') return;
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      const r = (v as Record<string, unknown>).$ref;
      if (typeof r === 'string' && !r.startsWith('#')) refs.add(resolveRelative(r.split('#')[0], id));
      for (const x of Object.values(v)) walk(x, depth + 1);
    };
    walk(doc, 0);
    if (seen.size + refs.size > 200) throw new Error('Too many external $ref documents (max 200)');
    for (const r of refs) {
      try {
        await this.preload(r, seen);
      } catch (e) {
        this.warnings.push(`Could not load referenced document ${r}: ${(e as Error).message}`);
      }
    }
  }

  private target(ref: string, docId: string): { node: unknown; docId: string } | undefined {
    const [file, pointer = ''] = ref.split('#');
    const id = file ? resolveRelative(file, docId) : docId;
    if (!this.docs.has(id)) return undefined;
    const r = resolvePointer(this.docs.get(id), pointer);
    return r.found ? { node: r.value, docId: id } : undefined;
  }

  deref(node: unknown, docId: string, chain: Set<string> = new Set()): unknown {
    if (!node || typeof node !== 'object') return node;
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === 'string') {
      const ref = obj.$ref;
      const key = `${docId}|${ref}`;
      if (chain.has(key)) {
        this.warnings.push(`$ref loop with no concrete target: ${ref}`);
        return {};
      }
      const t = this.target(ref, docId);
      if (!t) {
        this.warnings.push(`Unresolvable $ref "${ref}"`);
        return { 'x-unresolved-ref': ref };
      }
      const nextChain = new Set(chain).add(key);
      const resolved = this.deref(t.node, t.docId, nextChain);
      const siblings = Object.keys(obj).filter((k) => k !== '$ref' && k !== 'description' && k !== 'summary');
      if (siblings.length === 0 || !resolved || typeof resolved !== 'object') return resolved;
      // OAS 3.1 allows keywords beside $ref: combine without mutating the shared target.
      const extra: Record<string, unknown> = {};
      for (const k of siblings) extra[k] = this.deref(obj[k], docId);
      return { allOf: [resolved], ...extra };
    }
    const hit = this.memo.get(obj);
    if (hit !== undefined) return hit;
    if (Array.isArray(obj)) {
      const out: unknown[] = [];
      this.memo.set(obj, out);
      for (const v of obj) out.push(this.deref(v, docId));
      return out;
    }
    const out: Record<string, unknown> = {};
    this.memo.set(obj, out);
    for (const [k, v] of Object.entries(obj)) {
      // Example payloads are data, not schema: never chase $ref-looking keys inside them.
      out[k] = k === 'example' || (k === 'examples' && !Array.isArray(v) && isValueMap(v)) ? v : this.deref(v, docId);
    }
    return out;
  }
}

function isValueMap(v: unknown): boolean {
  // OAS 3 `examples` is a map of Example Objects (may contain $ref); keep those dereferenced.
  if (!v || typeof v !== 'object') return false;
  return !Object.values(v as Record<string, unknown>).some((x) => x && typeof x === 'object' && ('value' in (x as object) || '$ref' in (x as object)));
}

const cache = new Map<string, { key: string; loaded: LoadedSpec; at: number }>();

/**
 * Load and dereference a spec from an absolute path or an http(s) URL.
 * Cached per source (files by mtime+size, URLs for 60 s).
 */
export async function loadSpec(source: string): Promise<LoadedSpec> {
  const remote = isUrl(source);
  const location = remote ? source : requireAbsolute(source);
  let cacheKey = location;
  if (!remote) {
    const st = await stat(location);
    cacheKey = `${location}|${st.mtimeMs}|${st.size}`;
  }
  const hit = cache.get(location);
  if (hit && hit.key === cacheKey && (!remote || Date.now() - hit.at < URL_CACHE_TTL_MS)) return hit.loaded;

  const id = canonical(location);
  const d = new Dereferencer(remote);
  await d.preload(id);
  const raw = await d.loadDoc(id);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${source}: not an OpenAPI document`);
  const doc = d.deref(raw, id) as Record<string, unknown>;
  const loaded: LoadedSpec = { doc, source: location, warnings: d.warnings.slice(0, 50) };
  if (cache.size > 20) cache.clear();
  cache.set(location, { key: cacheKey, loaded, at: Date.now() });
  return loaded;
}

/** Load from an in-memory document (tests, imported collections). */
export async function loadSpecFromObject(raw: Record<string, unknown>, sourceId = 'memory://spec'): Promise<LoadedSpec> {
  const d = new Dereferencer(false);
  const id = sourceId.includes('://') ? sourceId : canonical(sourceId);
  d.seed(id, raw);
  const doc = d.deref(raw, id) as Record<string, unknown>;
  return { doc, source: sourceId, warnings: d.warnings };
}
