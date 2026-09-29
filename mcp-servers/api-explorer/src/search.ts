// SPDX-License-Identifier: MIT
/**
 * Ranked search across every kind of source. Each document is flattened into
 * items with weighted fields; a query is split into terms and each term is
 * scored against its best field (exact > word prefix > substring), weighted
 * by the field. Results matching every term rank above partial matches.
 */

import type { LoadedDocument } from "./loader.js";
import { listOperationEntries, openApiView, rawModels, extractTags, type Json } from "./openapi.js";
import { graphqlSchema, listTypes, rootOperations } from "./graphql.js";
import { asyncChannels, asyncMessages, asyncView } from "./asyncapi.js";
import { protoModel } from "./proto.js";

export type SearchScope = "paths" | "models" | "tags" | "descriptions";

interface Field {
  text: string;
  weight: number;
  description?: boolean;
}

interface Item {
  type: string;
  ref: Record<string, unknown>;
  fields: Field[];
  context?: string;
}

function tokenize(q: string): string[] {
  return q.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function scoreField(term: string, text: string): number {
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t === term) return 10;
  const words = t.split(/[^a-z0-9]+|(?<=[a-z])(?=[A-Z])/i).filter(Boolean);
  // camelCase-aware word split on the original text
  const camelWords = text.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).map((w) => w.toLowerCase()).filter(Boolean);
  if ([...words, ...camelWords].includes(term)) return 7;
  if (t.startsWith(term) || [...words, ...camelWords].some((w) => w.startsWith(term))) return 5;
  if (t.includes(term)) return 2;
  return 0;
}

function itemsFor(loaded: LoadedDocument, scopes: Set<SearchScope>): Item[] {
  const items: Item[] = [];
  const desc = scopes.has("descriptions");
  const trim = (s: unknown) => (typeof s === "string" ? s.slice(0, 160) : undefined);
  switch (loaded.kind) {
    case "openapi": {
      const view = openApiView(loaded);
      if (scopes.has("paths") || desc) {
        for (const e of listOperationEntries(view)) {
          const op = e.operation as Json;
          const fields: Field[] = [];
          if (scopes.has("paths")) {
            fields.push({ text: e.path, weight: 3 }, { text: op.operationId ?? "", weight: 3 }, { text: op.summary ?? "", weight: 2 });
            for (const t of op.tags ?? []) fields.push({ text: t, weight: 1.5 });
            for (const p of [...(op.parameters ?? []), ...(e.pathItem.parameters ?? [])]) if (p?.name) fields.push({ text: p.name, weight: 1 });
          }
          if (desc) fields.push({ text: op.description ?? "", weight: 1, description: true }, { text: op.summary ?? "", weight: 1, description: true });
          items.push({ type: e.kind === "webhook" ? "webhook" : "operation", ref: { method: e.method, path: e.path, ...(op.operationId && { operationId: op.operationId }) }, fields, context: trim(op.summary ?? op.description) });
        }
      }
      if (scopes.has("models")) {
        for (const [name, schema] of Object.entries(rawModels(view))) {
          const s = schema as Json;
          const fields: Field[] = [{ text: name, weight: 3 }];
          for (const p of Object.keys(s?.properties ?? {})) fields.push({ text: p, weight: 1 });
          if (desc) fields.push({ text: s?.description ?? "", weight: 1, description: true });
          items.push({ type: "model", ref: { model: name }, fields, context: trim(s?.description) });
        }
      }
      if (scopes.has("tags")) {
        for (const t of extractTags(view)) {
          items.push({ type: "tag", ref: { tag: t.name }, fields: [{ text: t.name, weight: 3 }, ...(desc ? [{ text: t.description ?? "", weight: 1, description: true }] : [])], context: trim(t.description) });
        }
      }
      break;
    }
    case "graphql": {
      const schema = graphqlSchema(loaded);
      if (scopes.has("paths") || desc) {
        for (const f of rootOperations(schema)) {
          const fields: Field[] = [{ text: String(f.name), weight: 3 }, { text: String(f.type), weight: 1 }];
          if (desc) fields.push({ text: String(f.description ?? ""), weight: 1, description: true });
          items.push({ type: String(f.operationType), ref: { field: f.name }, fields, context: trim(f.description) });
        }
      }
      if (scopes.has("models")) {
        for (const t of listTypes(schema)) {
          const fields: Field[] = [{ text: String(t.name), weight: 3 }];
          if (desc) fields.push({ text: String(t.description ?? ""), weight: 1, description: true });
          items.push({ type: `type:${t.kind}`, ref: { typeName: t.name }, fields, context: trim(t.description) });
        }
      }
      break;
    }
    case "asyncapi": {
      const view = asyncView(loaded);
      if (scopes.has("paths") || desc) {
        for (const ch of asyncChannels(view)) {
          const key = String(ch.name ?? ch.id);
          const fields: Field[] = [{ text: key, weight: 3 }, { text: String(ch.address ?? ""), weight: 2 }];
          for (const op of ch.operations as Array<Record<string, unknown>>) fields.push({ text: String(op.id ?? ""), weight: 2 });
          if (desc) fields.push({ text: String(ch.description ?? ""), weight: 1, description: true });
          items.push({ type: "channel", ref: { channel: key }, fields, context: trim(ch.description) });
        }
      }
      if (scopes.has("models")) {
        for (const [name, m] of asyncMessages(view)) {
          items.push({ type: "message", ref: { message: name }, fields: [{ text: name, weight: 3 }, ...(desc ? [{ text: String((m.raw as Json)?.summary ?? ""), weight: 1, description: true }] : [])], context: trim((m.raw as Json)?.summary) });
        }
      }
      break;
    }
    case "proto": {
      const model = protoModel(loaded);
      if (scopes.has("paths") || desc) {
        for (const s of model.services) {
          for (const r of s.rpcs) {
            items.push({
              type: "rpc",
              ref: { service: s.fullName, rpc: r.name },
              fields: [{ text: String(r.name), weight: 3 }, { text: s.name, weight: 1.5 }, { text: String(r.requestType), weight: 1 }, { text: String(r.responseType), weight: 1 }, ...(desc ? [{ text: String(r.comment ?? ""), weight: 1, description: true }] : [])],
              context: trim(r.comment),
            });
          }
        }
      }
      if (scopes.has("models")) {
        for (const [full, m] of [...model.messages, ...model.enums]) {
          const fields: Field[] = [{ text: String(m.name), weight: 3 }];
          for (const f of (m.fields as Array<Record<string, unknown>>) ?? []) fields.push({ text: String(f.name), weight: 1 });
          items.push({ type: model.messages.has(full) ? "message" : "enum", ref: { typeName: full }, fields, context: trim(m.comment) });
        }
      }
      break;
    }
  }
  return items;
}

export interface SearchHit {
  alias: string;
  type: string;
  score: number;
  matchedTerms: number;
  context?: string;
  [key: string]: unknown;
}

export function searchDocument(alias: string, loaded: LoadedDocument, query: string, scopes: SearchScope[]): SearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const item of itemsFor(loaded, new Set(scopes))) {
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      let best = 0;
      for (const f of item.fields) best = Math.max(best, scoreField(term, f.text) * f.weight);
      if (best > 0) matched++;
      score += best;
    }
    if (matched === 0) continue;
    hits.push({ alias, type: item.type, ...item.ref, score: Math.round(score * 10) / 10, matchedTerms: matched, ...(item.context && { context: item.context }) });
  }
  return hits;
}

export function rankHits(hits: SearchHit[], termCount: number): SearchHit[] {
  const full = hits.filter((h) => h.matchedTerms === termCount);
  const pool = full.length > 0 ? full : hits;
  return pool.sort((a, b) => b.matchedTerms - a.matchedTerms || b.score - a.score);
}

export { tokenize };
