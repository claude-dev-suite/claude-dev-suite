// SPDX-License-Identifier: MIT
/** Format detection + dispatch for import_collection. */

import { readFile, stat } from 'fs/promises';
import { extname } from 'path';
import { parseDocument } from '../spec/loader.js';
import { loadModel, operationLabel } from '../spec/index.js';
import { buildSampleRequest } from '../spec/request-builder.js';
import { importPostman, isPostmanCollection, isPostmanEnvironment } from './postman.js';
import { importInsomniaV4, importInsomniaV5, isInsomniaV4, isInsomniaV5 } from './insomnia.js';
import { importBruno } from './bruno.js';
import { importHttpFile } from './http-file.js';
import { importHar, isHar } from './har.js';
import type { ImportResult, ImportedRequest } from './types.js';
import { requireAbsolute } from '../util/paths.js';

export type ImportFormat = 'postman' | 'insomnia' | 'bruno' | 'http' | 'har' | 'openapi';

const MAX_COLLECTION_BYTES = 25 * 1024 * 1024;

async function readText(path: string): Promise<string> {
  const st = await stat(path);
  if (st.size > MAX_COLLECTION_BYTES) throw new Error(`${path} exceeds ${MAX_COLLECTION_BYTES} bytes`);
  return readFile(path, 'utf8');
}

export async function detectFormat(path: string): Promise<{ format: ImportFormat; doc?: unknown }> {
  const st = await stat(path);
  if (st.isDirectory()) return { format: 'bruno' };
  const ext = extname(path).toLowerCase();
  if (ext === '.bru') return { format: 'bruno' };
  if (ext === '.http' || ext === '.rest') return { format: 'http' };
  const doc = parseDocument(await readText(path), path);
  if (isPostmanCollection(doc)) return { format: 'postman', doc };
  if (isInsomniaV4(doc) || isInsomniaV5(doc)) return { format: 'insomnia', doc };
  if (isHar(doc)) return { format: 'har', doc };
  const d = doc as Record<string, unknown>;
  if (d && (typeof d.openapi === 'string' || typeof d.swagger === 'string')) return { format: 'openapi', doc };
  if (isPostmanEnvironment(doc)) {
    throw new Error('This is a Postman environment file; pass it as `environmentFile` together with the collection');
  }
  throw new Error(
    'Could not detect the format. Supported: Postman v2.x, Insomnia v4 (JSON) / v5 (YAML), Bruno (.bru or directory), ' +
      '.http/.rest, HAR, OpenAPI/Swagger. Pass `format` to force one.'
  );
}

async function importOpenApi(path: string): Promise<ImportResult> {
  const model = await loadModel(path);
  const server = model.servers.find((s) => /^https?:\/\//i.test(s));
  const relBase = !server && model.servers[0] && model.servers[0] !== '/' ? model.servers[0] : '';
  const requests: ImportedRequest[] = model.operations.map((op) => {
    const s = buildSampleRequest(model, op, { baseUrl: `{{baseUrl}}${relBase}`, authMode: 'placeholders' });
    return {
      name: operationLabel(op),
      folder: op.tags[0],
      method: s.method,
      url: s.url,
      headers: s.headers,
      query: Object.keys(s.query).length ? s.query : undefined,
      body: s.body,
      bodyType: s.bodyType,
      contentType: s.contentType,
      auth: s.auth,
      description: op.summary ?? op.description,
    };
  });
  return {
    format: 'openapi',
    name: `${model.title} ${model.version}`.trim(),
    requests,
    variables: server ? { baseUrl: server } : {},
    secretKeys: [],
    warnings: model.warnings,
  };
}

export async function importAny(
  filePath: string,
  opts: { format?: ImportFormat; environmentFile?: string; environmentName?: string; includeCookies?: boolean }
): Promise<ImportResult> {
  const path = requireAbsolute(filePath);
  const detected = opts.format ? { format: opts.format, doc: undefined as unknown } : await detectFormat(path);
  const load = async () => detected.doc ?? parseDocument(await readText(path), path);

  switch (detected.format) {
    case 'postman': {
      const env = opts.environmentFile ? parseDocument(await readText(requireAbsolute(opts.environmentFile)), opts.environmentFile) : undefined;
      return importPostman(await load(), env);
    }
    case 'insomnia': {
      const doc = await load();
      if (isInsomniaV5(doc)) return importInsomniaV5(doc, opts.environmentName);
      return importInsomniaV4(doc, opts.environmentName);
    }
    case 'bruno':
      return importBruno(path, opts.environmentName);
    case 'http':
      return importHttpFile(path, opts.environmentName, opts.environmentFile ? requireAbsolute(opts.environmentFile) : undefined);
    case 'har':
      return importHar(await load(), { includeCookies: opts.includeCookies });
    case 'openapi':
      return importOpenApi(path);
  }
}

export type { ImportResult, ImportedRequest };
