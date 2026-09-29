// SPDX-License-Identifier: MIT
/**
 * Error fingerprinting: collapse the variable parts of a message (ids, numbers,
 * UUIDs, paths, addresses) so that occurrences of the same defect group
 * together, then hash type + normalised message + the top frames.
 */

import { createHash } from 'crypto';
import type { LogEntry } from '../types.js';
import { inlineExceptionType, rootCause } from './exceptions.js';

const RULES: Array<[RegExp, string]> = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>'],
  [/\bhttps?:\/\/[^\s"'<>]+/g, '<url>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>'],
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '<ip6>'],
  [/(?:^|(?<=[\s=:"'(]))(?:\/[\w.@-]+){2,}\/?/g, '<path>'],
  [/\b(?:[A-Za-z]:)?(?:\\[\w.@-]+){2,}/g, '<path>'],
  [/\b0x[0-9a-f]+\b/gi, '<hex>'],
  [/\b[0-9a-f]{12,}\b/gi, '<hex>'],
  [/"[^"]{1,200}"/g, '"<str>"'],
  [/'[^']{1,200}'/g, "'<str>'"],
  [/-?\b\d+(?:\.\d+)?\b/g, '<num>'],
];

/** Replace variable tokens with placeholders. */
export function normalizeMessage(message: string, maxLength = 300): string {
  let out = message.split('\n')[0];
  for (const [re, repl] of RULES) {
    out = out.replace(re, repl);
  }
  // Mixed alphanumeric ids (order_8f3k2, req-12ab) → <id>
  out = out.replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{6,}\b/g, (m) =>
    /^[A-Za-z]+\d{1,2}$/.test(m) ? m : '<id>');
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Normalise a stack frame so line numbers and lambda indices do not split groups. */
export function normalizeFrame(frame: string): string {
  return frame
    .replace(/:\d+(?::\d+)?\)?$/, '')
    .replace(/:line \d+/, '')
    .replace(/\$\$Lambda\$\d+\/0x[0-9a-f]+/g, '$$Lambda')
    .replace(/\+0x[0-9a-f]+/g, '')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .trim();
}

export interface Fingerprint {
  fingerprint: string;
  type: string;
  message: string;
  normalizedMessage: string;
  frames: string[];
}

/** Compute the error fingerprint for an entry. */
export function fingerprintEntry(entry: LogEntry): Fingerprint {
  let type = 'Unknown';
  let message = entry.message.split('\n')[0];
  let frames: string[] = [];
  if (entry.exception) {
    const root = rootCause(entry.exception);
    type = entry.exception.type;
    message = entry.exception.message || message;
    // Group on the outermost type + root cause, which is stable across wrappers.
    if (root !== entry.exception) type = `${entry.exception.type} <- ${root.type}`;
    frames = (root.stackTrace.length ? root.stackTrace : entry.exception.stackTrace).slice(0, 3).map(normalizeFrame);
  } else {
    const inline = inlineExceptionType(entry.message);
    if (inline) {
      type = inline.type;
      if (inline.message) message = inline.message;
    }
  }
  const normalizedMessage = normalizeMessage(message);
  const hash = createHash('sha1')
    .update(type).update('\0').update(normalizedMessage).update('\0').update(frames.join('\n'))
    .digest('hex')
    .slice(0, 12);
  return { fingerprint: hash, type, message, normalizedMessage, frames };
}
