// SPDX-License-Identifier: MIT
/**
 * Match a concrete request (`GET https://api.example.com/v1/users/123?x=1`)
 * to the operation that serves it (`GET /users/{id}`), the way a router
 * would: strip the server base path, compare segment by segment, prefer
 * literal segments over templated ones (`/users/me` beats `/users/{id}`).
 */

import { getServers, listOperationEntries, summarizeOperation, type OpenApiView } from "./openapi.js";

interface Compiled {
  segments: Array<{ literal: string } | { regex: RegExp; names: string[]; fixed: number }>;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTemplate(path: string): Compiled {
  const segs = path.split("/").filter((s, i, a) => !(s === "" && (i === 0 || i === a.length - 1)));
  return {
    segments: segs.map((seg) => {
      if (!seg.includes("{")) return { literal: seg };
      const names: string[] = [];
      let re = "^";
      let last = 0;
      for (const m of seg.matchAll(/\{([^}]+)\}/g)) {
        re += escapeRe(seg.slice(last, m.index));
        names.push(m[1]);
        re += "([^/]+?)";
        last = (m.index ?? 0) + m[0].length;
      }
      re += escapeRe(seg.slice(last)) + "$";
      return { regex: new RegExp(re), names, fixed: seg.replace(/\{[^}]+\}/g, "").length };
    }),
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function splitPath(p: string): string[] {
  return p.split("/").filter((s, i, a) => !(s === "" && (i === 0 || i === a.length - 1)));
}

export function matchTemplate(template: string, concretePath: string): { params: Record<string, string>; score: number } | null {
  const compiled = compileTemplate(template);
  const parts = splitPath(concretePath);
  if (parts.length !== compiled.segments.length) return null;
  const params: Record<string, string> = {};
  let score = 0;
  for (let i = 0; i < parts.length; i++) {
    const seg = compiled.segments[i];
    const part = parts[i];
    if ("literal" in seg) {
      if (safeDecode(seg.literal) !== safeDecode(part)) return null;
      score += 3;
    } else {
      const m = seg.regex.exec(part);
      if (!m) return null;
      seg.names.forEach((n, j) => (params[n] = safeDecode(m[j + 1])));
      // Partially literal segments (`{name}.json`) are more specific than `{name}`.
      score += seg.fixed > 0 ? 2 : 1;
    }
  }
  return { params, score };
}

function basePaths(view: OpenApiView): string[] {
  const out = new Set<string>([""]);
  for (const s of getServers(view)) {
    try {
      const u = new URL(s.url, "http://placeholder.invalid");
      const p = u.pathname.replace(/\/$/, "");
      if (p && !p.includes("{")) out.add(safeDecode(p));
    } catch {
      /* ignore */
    }
  }
  // Operation/path-level servers too.
  for (const e of listOperationEntries(view, { includeWebhooks: false })) {
    for (const s of [...(e.operation.servers ?? []), ...(e.pathItem.servers ?? [])]) {
      try {
        const u = new URL(String(s.url).replace(/\{[^}]+\}/g, "x"), "http://placeholder.invalid");
        const p = u.pathname.replace(/\/$/, "");
        if (p) out.add(safeDecode(p));
      } catch {
        /* ignore */
      }
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export interface MatchResult {
  matched: boolean;
  request: { method?: string; path: string; query?: Record<string, string> };
  best?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
  methodNotAllowed?: { path: string; allowedMethods: string[] };
}

export function matchOperation(view: OpenApiView, input: string, method?: string): MatchResult {
  let pathname: string;
  let query: Record<string, string> | undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    const u = new URL(input);
    pathname = u.pathname;
    if ([...u.searchParams.keys()].length) query = Object.fromEntries(u.searchParams);
  } else {
    const q = input.indexOf("?");
    pathname = q === -1 ? input : input.slice(0, q);
    if (q !== -1) query = Object.fromEntries(new URLSearchParams(input.slice(q + 1)));
    if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  }
  const upper = method?.toUpperCase();
  const entries = listOperationEntries(view, { includeWebhooks: false });

  const hits: Array<{ entry: (typeof entries)[number]; params: Record<string, string>; score: number; base: string }> = [];
  for (const base of basePaths(view)) {
    if (base && !(pathname === base || pathname.startsWith(`${base}/`))) continue;
    const rest = base ? pathname.slice(base.length) || "/" : pathname;
    for (const entry of entries) {
      const m = matchTemplate(entry.path, rest);
      if (m) hits.push({ entry, params: m.params, score: m.score + base.length / 1000, base });
    }
    if (hits.length) break; // longest base path that yields any match wins
  }

  const request = { ...(upper && { method: upper }), path: pathname, ...(query && { query }) };
  const withMethod = upper ? hits.filter((h) => h.entry.method === upper) : hits;
  if (withMethod.length === 0) {
    if (hits.length > 0 && upper) {
      const top = Math.max(...hits.map((h) => h.score));
      const best = hits.filter((h) => h.score === top);
      return {
        matched: false,
        request,
        methodNotAllowed: { path: best[0].entry.path, allowedMethods: [...new Set(best.map((h) => h.entry.method))] },
      };
    }
    return { matched: false, request };
  }
  withMethod.sort((a, b) => b.score - a.score);
  const describe = (h: (typeof withMethod)[number]) => ({
    ...summarizeOperation(h.entry),
    pathParams: h.params,
    ...(h.base && { basePath: h.base }),
  });
  return {
    matched: true,
    request,
    best: describe(withMethod[0]),
    ...(withMethod.length > 1 && { candidates: withMethod.slice(1, 10).map(describe) }),
  };
}
