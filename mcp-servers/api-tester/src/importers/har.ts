// SPDX-License-Identifier: MIT
/** HAR 1.2 importer (browser DevTools / proxy captures). */

import { normaliseMethod, type ImportedRequest, type ImportResult } from './types.js';

type Rec = Record<string, unknown>;
function obj(v: unknown): Rec {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {};
}
function arr(v: unknown): Rec[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Rec[]) : [];
}

export function isHar(doc: unknown): boolean {
  return Array.isArray(obj(obj(doc).log).entries);
}

// Headers the client computes itself, or that only make sense on the original connection.
const DROP_HEADERS = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'cookie', 'te', 'upgrade-insecure-requests']);

export function importHar(doc: unknown, opts: { includeCookies?: boolean; filter?: string } = {}): ImportResult {
  const log = obj(obj(doc).log);
  if (!Array.isArray(log.entries)) throw new Error('Not a HAR file (log.entries missing)');
  const warnings: string[] = [];
  const requests: ImportedRequest[] = [];
  let droppedCookies = false;
  let skippedStatic = 0;

  for (const entry of arr(log.entries)) {
    const r = obj(entry.request);
    const url = String(r.url ?? '');
    if (!/^https?:/i.test(url)) continue;
    if (opts.filter && !url.includes(opts.filter)) continue;
    const mime = String(obj(obj(entry.response).content).mimeType ?? '');
    const resourceType = String(entry._resourceType ?? '');
    if (['image', 'font', 'stylesheet', 'media', 'script'].includes(resourceType) || /^(image|font)\//.test(mime)) {
      skippedStatic++;
      continue;
    }
    const headers: Record<string, string> = {};
    for (const h of arr(r.headers)) {
      const name = String(h.name ?? '');
      if (!name || name.startsWith(':')) continue;
      const lower = name.toLowerCase();
      if (lower === 'cookie') {
        if (opts.includeCookies) headers[name] = String(h.value ?? '');
        else droppedCookies = true;
        continue;
      }
      if (DROP_HEADERS.has(lower)) continue;
      headers[name] = String(h.value ?? '');
    }
    let pathname = url;
    try {
      const u = new URL(url);
      pathname = u.pathname;
    } catch {
      /* keep raw */
    }
    const method = String(r.method ?? 'GET');
    const req: ImportedRequest = {
      name: `${method.toUpperCase()} ${pathname}`,
      method: normaliseMethod(method, warnings, pathname),
      url,
      headers,
    };
    const post = obj(r.postData);
    if (typeof post.text === 'string' && post.text !== '') {
      req.body = post.text;
      req.bodyType = 'text';
      if (typeof post.mimeType === 'string' && post.mimeType) req.contentType = post.mimeType;
    } else if (Array.isArray(post.params) && post.params.length) {
      const fields: Record<string, string> = {};
      for (const p of arr(post.params)) if (typeof p.name === 'string') fields[p.name] = String(p.value ?? '');
      req.body = fields;
      req.bodyType = String(post.mimeType ?? '').includes('multipart') ? 'multipart' : 'form';
      if (arr(post.params).some((p) => p.fileName)) warnings.push(`${req.name}: file parts in the capture have no file content`);
    }
    requests.push(req);
  }
  if (droppedCookies) warnings.push('Cookie headers were dropped (captured session cookies); pass includeCookies: true to keep them');
  if (skippedStatic) warnings.push(`${skippedStatic} static-asset requests (images, fonts, scripts, styles) were skipped`);
  const creator = obj(log.creator);
  return {
    format: 'har',
    name: `HAR capture${creator.name ? ` (${String(creator.name)})` : ''}`,
    requests,
    variables: {},
    secretKeys: [],
    warnings,
  };
}
