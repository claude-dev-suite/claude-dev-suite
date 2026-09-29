// SPDX-License-Identifier: MIT
/**
 * File readers: streaming lines (plain or gzip), head sampling, and tail
 * reading by seeking from the end.
 */

import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import type { Readable } from 'stream';

/** One physical input line. */
export interface RawLine {
  text: string;
  lineNumber: number;
  stream?: string;
}

/** Lines longer than this are cut (with a marker) before parsing. */
export const MAX_LINE_CHARS = 256 * 1024;

export async function isGzip(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(2);
    const { bytesRead } = await fh.read(buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  } finally {
    await fh.close();
  }
}

function openStream(path: string, gz: boolean, start?: number): Readable {
  const raw = createReadStream(path, start !== undefined ? { start } : {});
  if (!gz) return raw;
  const gunzip = createGunzip();
  raw.on('error', (e) => gunzip.destroy(e));
  return raw.pipe(gunzip);
}

function clip(text: string): string {
  return text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) + ' …[line truncated]' : text;
}

/** Stream a file's lines (gzip detected by magic bytes, BOM stripped). */
export async function* readFileLines(path: string, opts: { gz?: boolean } = {}): AsyncGenerator<RawLine> {
  const gz = opts.gz ?? (await isGzip(path));
  const input = openStream(path, gz);
  const rl = createInterface({ input, crlfDelay: Infinity });
  let n = 0;
  try {
    for await (const line of rl) {
      n++;
      yield { text: clip(n === 1 ? line.replace(/^﻿/, '') : line), lineNumber: n };
    }
  } catch (err) {
    if (gz) throw new Error(`Failed to decompress ${path}: ${(err as Error).message}`);
    throw err;
  } finally {
    rl.close();
    input.destroy();
  }
}

/**
 * First lines of a file, reading at most `maxBytes` (decompressed). Used for
 * format detection so a multi-GB file is never read in full just to sniff it.
 */
export async function readHead(path: string, maxBytes = 64 * 1024, maxLines = 200): Promise<string[]> {
  const gz = await isGzip(path);
  const input = openStream(path, gz);
  const chunks: Buffer[] = [];
  let total = 0;
  let complete = true;
  try {
    for await (const chunk of input) {
      const b = chunk as Buffer;
      chunks.push(b);
      total += b.length;
      if (total >= maxBytes) { complete = false; break; }
    }
  } finally {
    input.destroy();
  }
  let text = Buffer.concat(chunks).subarray(0, maxBytes).toString('utf-8').replace(/^﻿/, '');
  if (!complete) {
    const lastNl = text.lastIndexOf('\n');
    if (lastNl > 0) text = text.slice(0, lastNl); // drop the partial last line
  }
  return text.split(/\r?\n/).slice(0, maxLines).map(clip);
}

export interface TailWindow {
  lines: string[];
  /** True when the window reaches the start of the file. */
  reachedStart: boolean;
  bytesRead: number;
  fileSize: number;
}

/**
 * Read the last `bytes` bytes of a plain (non-gzip) file and split into lines,
 * dropping the first (likely partial) line unless the window starts at byte 0.
 */
export async function readTailWindow(path: string, bytes: number): Promise<TailWindow> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - bytes);
    const length = size - start;
    const buf = Buffer.alloc(length);
    let off = 0;
    while (off < length) {
      const { bytesRead } = await fh.read(buf, off, length - off, start + off);
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    let text = buf.subarray(0, off).toString('utf-8');
    if (start === 0) text = text.replace(/^﻿/, '');
    const lines = text.split(/\r?\n/);
    if (start > 0) lines.shift();
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return { lines: lines.map(clip), reachedStart: start === 0, bytesRead: off, fileSize: size };
  } finally {
    await fh.close();
  }
}
