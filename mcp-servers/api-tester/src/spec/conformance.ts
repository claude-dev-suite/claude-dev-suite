// SPDX-License-Identifier: MIT
/**
 * Does a response conform to its OpenAPI operation? Status documented,
 * content type documented, body valid against the schema, required headers
 * present. Used by `validate_contract` and the `openapi` assertion.
 */

import { pickMedia, responseFor, serverBasePaths, findOperation, type ApiModel, type ApiOperation } from './model.js';
import { validateAgainst, type SchemaIssue } from './schema.js';

export interface ObservedResponse {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON when the body is JSON, else the text. */
  body: unknown;
  bodyIsJson: boolean;
  bodyText: string;
}

export interface ConformanceResult {
  conforms: boolean;
  matchedResponse?: string;
  mediaType?: string;
  issues: string[];
  warnings: string[];
  schemaErrors: SchemaIssue[];
}

function mimeOf(ct: string | undefined): string {
  return (ct ?? '').split(';')[0].trim().toLowerCase();
}

function mediaMatches(documented: string, actual: string): boolean {
  const d = mimeOf(documented);
  if (d === actual || d === '*/*') return true;
  const [dt, ds] = d.split('/');
  const [at, as] = actual.split('/');
  return (ds === '*' && dt === at) || (dt === at && ds === as);
}

export function checkConformance(model: ApiModel, op: ApiOperation, res: ObservedResponse): ConformanceResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  let schemaErrors: SchemaIssue[] = [];
  const documented = Object.keys(op.responses);
  const match = responseFor(op, res.status);
  if (!match) {
    issues.push(`Status ${res.status} is not documented (documented: ${documented.join(', ') || 'none'})`);
    return { conforms: false, issues, warnings, schemaErrors };
  }
  const { key, res: def } = match;
  const actualMime = mimeOf(res.headers['content-type']);
  const hasBody = res.bodyText.length > 0;
  const mediaEntries = Object.entries(def.content);
  let mediaType: string | undefined;

  if (mediaEntries.length === 0) {
    if (hasBody) warnings.push(`Response ${key} documents no body but ${res.bodyText.length} bytes were returned`);
  } else if (!hasBody) {
    if (res.status !== 204 && res.status !== 304) {
      issues.push(`Response ${key} documents a body (${mediaEntries.map(([m]) => m).join(', ')}) but none was returned`);
    }
  } else {
    const hit = mediaEntries.find(([m]) => mediaMatches(m, actualMime));
    if (!hit) {
      issues.push(
        `Content-Type "${actualMime || '(none)'}" is not documented for ${key} (documented: ${mediaEntries.map(([m]) => m).join(', ')})`
      );
    } else {
      mediaType = hit[0];
      const schema = hit[1].schema;
      const jsonish = /json/i.test(mimeOf(hit[0])) || mimeOf(hit[0]) === '*/*';
      if (schema && jsonish) {
        if (!res.bodyIsJson) {
          issues.push(`Body is not valid JSON although ${hit[0]} is documented`);
        } else {
          const v = validateAgainst(schema, res.body, model.dialect, { mode: 'response' });
          if (v.schemaError) warnings.push(v.schemaError);
          if (!v.valid && !v.schemaError) {
            schemaErrors = v.errors;
            issues.push(`Body does not match the ${key} schema (${v.errors.length} error${v.errors.length === 1 ? '' : 's'})`);
          }
        }
      }
    }
  }

  for (const [name, h] of Object.entries(def.headers)) {
    if (h.required && res.headers[name.toLowerCase()] === undefined) {
      issues.push(`Required response header "${name}" is missing`);
    }
  }

  return { conforms: issues.length === 0, matchedResponse: key, mediaType, issues, warnings, schemaErrors };
}

/** Locate the operation for a concrete request URL, stripping server base paths. */
export function locateOperation(
  model: ApiModel,
  method: string,
  url: string,
  operationId?: string
): { op: ApiOperation; params: Record<string, string> } | undefined {
  if (operationId) {
    const op = model.operations.find((o) => o.operationId === operationId);
    return op ? { op, params: {} } : undefined;
  }
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split('?')[0];
  }
  const direct = findOperation(model, method, pathname);
  if (direct) return direct;
  for (const base of serverBasePaths(model)) {
    if (pathname === base || pathname.startsWith(base + '/')) {
      const hit = findOperation(model, method, pathname.slice(base.length) || '/');
      if (hit) return hit;
    }
  }
  return undefined;
}

export { pickMedia };
