// SPDX-License-Identifier: MIT
/**
 * Request-body encoding.
 *
 * The old client forced `Content-Type: application/json` on every request and
 * sent `JSON.stringify(body)` when the body was truthy — so form posts, raw
 * text and XML went out as JSON strings, and `0`, `false` and `""` bodies were
 * silently dropped. Each body type is now encoded as itself.
 */

import { randomBytes } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { basename, extname } from 'path';
import { resolveReadableProjectFile } from '../util/paths.js';

export type BodyType = 'auto' | 'json' | 'text' | 'form' | 'multipart' | 'binary' | 'file' | 'none';

export interface MultipartFile {
  field: string;
  path: string;
  filename?: string;
  contentType?: string;
}

export interface BodyInput {
  body?: unknown;
  bodyType?: BodyType;
  /** Multipart file parts (bodyType multipart). Paths must be inside the project. */
  files?: MultipartFile[];
  /** Raw request body read from a project file (bodyType file). */
  bodyFile?: string;
  contentType?: string;
}

export interface EncodedBody {
  data?: Buffer;
  contentType?: string;
  /** How the body was encoded, for the request echo. */
  kind: Exclude<BodyType, 'auto'>;
  /** Human-readable summary of what was sent (never the file bytes). */
  summary?: unknown;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.js': 'text/javascript',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function guessMime(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function encodeForm(fields: unknown): string {
  if (typeof fields === 'string') return fields; // already encoded
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('bodyType "form" needs an object of fields (or a pre-encoded string)');
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (Array.isArray(v)) for (const item of v) params.append(k, scalarToString(item));
    else params.append(k, scalarToString(v));
  }
  return params.toString();
}

function quoteParam(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

async function readUpload(path: string): Promise<{ data: Buffer; real: string }> {
  const real = await resolveReadableProjectFile(path);
  const st = await stat(real);
  if (st.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File ${path} is ${st.size} bytes; the upload limit is ${MAX_UPLOAD_BYTES}`);
  }
  return { data: await readFile(real), real };
}

export async function encodeMultipart(
  fields: unknown,
  files: MultipartFile[] = []
): Promise<{ data: Buffer; contentType: string; summary: unknown }> {
  if (fields !== undefined && fields !== null && (typeof fields !== 'object' || Array.isArray(fields))) {
    throw new Error('bodyType "multipart" needs `body` to be an object of text fields (files go in `files`)');
  }
  const boundary = `----apitester${randomBytes(12).toString('hex')}`;
  const chunks: Buffer[] = [];
  const fieldNames: string[] = [];
  for (const [k, v] of Object.entries((fields ?? {}) as Record<string, unknown>)) {
    const values = Array.isArray(v) ? v : [v];
    for (const item of values) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${quoteParam(k)}"\r\n\r\n${scalarToString(item)}\r\n`
        )
      );
    }
    fieldNames.push(k);
  }
  const fileSummaries: unknown[] = [];
  let total = 0;
  for (const f of files) {
    const { data, real } = await readUpload(f.path);
    total += data.length;
    if (total > MAX_UPLOAD_BYTES) throw new Error(`Multipart uploads exceed ${MAX_UPLOAD_BYTES} bytes`);
    const filename = f.filename ?? basename(real);
    const ct = f.contentType ?? guessMime(real);
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quoteParam(f.field)}"; ` +
          `filename="${quoteParam(filename)}"\r\nContent-Type: ${ct}\r\n\r\n`
      ),
      data,
      Buffer.from('\r\n')
    );
    fileSummaries.push({ field: f.field, filename, contentType: ct, bytes: data.length });
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    data: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
    summary: { fields: fieldNames, files: fileSummaries },
  };
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encode a body. `auto`: a string is sent verbatim (JSON-looking strings get
 * application/json, others text/plain); any other defined value — including
 * 0, false and null — is JSON.
 */
export async function encodeBody(input: BodyInput): Promise<EncodedBody> {
  const type: BodyType = input.bodyType ?? 'auto';
  const { body } = input;

  switch (type) {
    case 'none':
      return { kind: 'none' };

    case 'auto': {
      if (input.files && input.files.length > 0) {
        const mp = await encodeMultipart(body, input.files);
        return { kind: 'multipart', data: mp.data, contentType: mp.contentType, summary: mp.summary };
      }
      if (input.bodyFile !== undefined) return encodeBody({ ...input, bodyType: 'file' });
      if (body === undefined) return { kind: 'none' };
      if (typeof body === 'string') {
        return {
          kind: 'text',
          data: Buffer.from(body, 'utf8'),
          contentType: input.contentType ?? (looksLikeJson(body) ? 'application/json' : 'text/plain; charset=utf-8'),
          summary: body,
        };
      }
      return encodeBody({ ...input, bodyType: 'json' });
    }

    case 'json': {
      if (body === undefined) return { kind: 'none' };
      const text = JSON.stringify(body);
      return {
        kind: 'json',
        data: Buffer.from(text, 'utf8'),
        contentType: input.contentType ?? 'application/json',
        summary: body,
      };
    }

    case 'text': {
      if (body === undefined) return { kind: 'none' };
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      return {
        kind: 'text',
        data: Buffer.from(text, 'utf8'),
        contentType: input.contentType ?? 'text/plain; charset=utf-8',
        summary: text,
      };
    }

    case 'form': {
      const text = encodeForm(body ?? {});
      return {
        kind: 'form',
        data: Buffer.from(text, 'utf8'),
        contentType: input.contentType ?? 'application/x-www-form-urlencoded',
        summary: body,
      };
    }

    case 'multipart': {
      const mp = await encodeMultipart(body, input.files);
      return { kind: 'multipart', data: mp.data, contentType: mp.contentType, summary: mp.summary };
    }

    case 'binary': {
      if (typeof body !== 'string') throw new Error('bodyType "binary" needs `body` as a base64 string');
      const data = Buffer.from(body, 'base64');
      return {
        kind: 'binary',
        data,
        contentType: input.contentType ?? 'application/octet-stream',
        summary: { bytes: data.length },
      };
    }

    case 'file': {
      const p = input.bodyFile ?? (typeof body === 'string' ? body : undefined);
      if (!p) throw new Error('bodyType "file" needs `bodyFile` (a path inside the project)');
      const { data, real } = await readUpload(p);
      return {
        kind: 'file',
        data,
        contentType: input.contentType ?? guessMime(real),
        summary: { file: basename(real), bytes: data.length },
      };
    }
  }
}
