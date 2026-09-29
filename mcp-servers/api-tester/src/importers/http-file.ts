// SPDX-License-Identifier: MIT
/**
 * `.http` / `.rest` importer — the VS Code REST Client and JetBrains HTTP
 * Client format:
 *
 *   @baseUrl = http://localhost:3000          file variables
 *   ### Create user                            request separator (+ optional name)
 *   # @name createUser                         REST Client request name
 *   POST {{baseUrl}}/users HTTP/1.1            request line (method optional → GET)
 *     ?page=1                                  query continuation lines
 *   Content-Type: application/json             headers until the first blank line
 *
 *   { "name": "Ada" }                          body until the next ###
 *   > {% client.global.set(…) %}               JetBrains response handler (skipped)
 *
 * JetBrains environments come from `http-client.env.json` (+ the
 * `.private.env.json` secrets file) next to the .http file.
 */

import { readFile } from 'fs/promises';
import { dirname, join, resolve, isAbsolute } from 'path';
import { normaliseMethod, type ImportedRequest, type ImportResult } from './types.js';

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S.*?)(?:\s+HTTP\/[\d.]+)?\s*$/i;
const URL_ONLY_RE = /^(https?:\/\/|\{\{)\S*(?:\s+HTTP\/[\d.]+)?\s*$/i;

export function parseHttpFile(text: string, baseDir?: string): { requests: ImportedRequest[]; variables: Record<string, string>; warnings: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const variables: Record<string, string> = {};
  const warnings: string[] = [];
  const requests: ImportedRequest[] = [];

  // Split into blocks on ### lines.
  const blocks: Array<{ title?: string; lines: string[] }> = [{ lines: [] }];
  for (const line of lines) {
    const sep = /^###(.*)$/.exec(line);
    if (sep) blocks.push({ title: sep[1].trim() || undefined, lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }

  let counter = 0;
  for (const block of blocks) {
    let name = block.title;
    let i = 0;
    const ls = block.lines;
    // Preamble: comments, @var lines, blank lines.
    let requestLine: RegExpExecArray | null = null;
    for (; i < ls.length; i++) {
      const l = ls[i].trim();
      if (!l) continue;
      const v = /^@([\w.-]+)\s*=\s*(.*)$/.exec(l);
      if (v) {
        variables[v[1]] = v[2].trim();
        continue;
      }
      if (l.startsWith('#') || l.startsWith('//')) {
        const n = /^(?:#|\/\/)\s*@name\s+(\S+)/.exec(l);
        if (n) name = n[1];
        continue;
      }
      const m = METHOD_RE.exec(l);
      if (m) {
        requestLine = m;
        i++;
        break;
      }
      if (URL_ONLY_RE.test(l)) {
        requestLine = Object.assign(['', 'GET', l.replace(/\s+HTTP\/[\d.]+\s*$/i, '')], { index: 0, input: l }) as unknown as RegExpExecArray;
        i++;
        break;
      }
      warnings.push(`Unrecognised line skipped: "${l.slice(0, 80)}"`);
    }
    if (!requestLine) continue;

    let url = requestLine[2].trim();
    // Query continuation lines (REST Client): lines starting with ? or &
    while (i < ls.length && /^\s+[?&]/.test(ls[i])) {
      url += ls[i].trim();
      i++;
    }
    const headers: Record<string, string> = {};
    for (; i < ls.length; i++) {
      const l = ls[i];
      if (!l.trim()) {
        i++;
        break;
      }
      if (/^\s*(#|\/\/)/.test(l)) continue;
      const idx = l.indexOf(':');
      if (idx > 0) headers[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
    }
    // Body: until end of block, minus response handlers / redirects and trailing blanks.
    const bodyLines: string[] = [];
    for (; i < ls.length; i++) {
      const l = ls[i];
      if (/^>\s*(\{%|\S)/.test(l) || /^<>\s/.test(l) || /^>>!?\s/.test(l)) {
        if (/^>\s*\{%/.test(l)) {
          warnings.push(`${name ?? url}: response handler script not executed`);
          // Skip until %}
          while (i < ls.length && !ls[i].includes('%}')) i++;
        }
        continue;
      }
      bodyLines.push(l);
    }
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();

    counter++;
    const reqName = name ?? `${requestLine[1].toUpperCase()} ${url}`;
    const req: ImportedRequest = {
      name: reqName,
      method: normaliseMethod(requestLine[1], warnings, reqName),
      url,
      headers,
    };
    if (bodyLines.length) {
      const fileRef = bodyLines.length === 1 ? /^<@?\s+(.+)$/.exec(bodyLines[0].trim()) : null;
      if (fileRef) {
        const p = fileRef[1].trim();
        req.bodyType = 'file';
        req.bodyFile = baseDir && !isAbsolute(p) ? resolve(baseDir, p) : p;
      } else {
        req.body = bodyLines.join('\n');
        const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
        // Sent verbatim: the author wrote the exact bytes, whatever the content type.
        req.bodyType = 'text';
        if (/multipart\/form-data/i.test(ct)) {
          warnings.push(`${reqName}: raw multipart bodies are sent verbatim; keep the boundary in Content-Type`);
        }
      }
    }
    requests.push(req);
  }
  if (counter === 0) warnings.push('No requests found');

  // REST Client request variables ({{login.response.body.$.token}}) have no import equivalent.
  if (JSON.stringify(requests).match(/\{\{\s*[\w-]+\.(response|request)\./)) {
    warnings.push('Request variables ({{name.response…}}) are not resolved on import; use run_scenario `extract` to chain requests');
  }
  if (JSON.stringify(requests).match(/\{\{\s*\$(processEnv|dotenv|aadToken)/)) {
    warnings.push('{{$processEnv}}/{{$dotenv}}/{{$aadToken}} are not supported (the server never reads its own environment into requests)');
  }
  return { requests, variables, warnings };
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`${path}: ${(e as Error).message}`);
  }
}

export async function importHttpFile(path: string, environmentName?: string, environmentFile?: string): Promise<ImportResult> {
  const text = await readFile(path, 'utf8');
  const dir = dirname(path);
  const parsed = parseHttpFile(text, dir);
  const variables: Record<string, unknown> = {};
  const secretKeys: string[] = [];

  // JetBrains env files: public + private (secrets).
  const envPath = environmentFile ?? join(dir, 'http-client.env.json');
  const pub = await readJsonIfExists(envPath);
  const priv = await readJsonIfExists(envPath.replace(/\.env\.json$/, '.private.env.json'));
  const environments = [...new Set([...Object.keys(pub ?? {}), ...Object.keys(priv ?? {})])].filter((k) => k !== '$shared');
  if (environmentName) {
    if (!environments.includes(environmentName)) {
      throw new Error(`Environment "${environmentName}" not found in ${envPath} (available: ${environments.join(', ') || 'none'})`);
    }
    Object.assign(variables, (pub?.$shared as object) ?? {}, (pub?.[environmentName] as object) ?? {});
    const secrets = (priv?.[environmentName] as Record<string, unknown>) ?? {};
    Object.assign(variables, secrets);
    secretKeys.push(...Object.keys(secrets));
  }
  // File variables win over env vars only when defined literally in the file (REST Client semantics).
  Object.assign(variables, parsed.variables);

  return {
    format: 'http',
    name: path.split(/[\\/]/).pop() ?? 'requests.http',
    requests: parsed.requests,
    variables,
    secretKeys,
    environments,
    warnings: parsed.warnings,
  };
}
