// SPDX-License-Identifier: MIT
/**
 * Handler plumbing shared by every tool: result helpers, the JSON-Schema view
 * of each Zod schema (ListTools advertises exactly what the handler parses),
 * and the URL guard re-export used by the SSRF regression tests.
 */

import { z } from 'zod';
import { validateTargetUrl } from '../http/ssrf-policy.js';

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

export function jsonResponse(data: object): HandlerResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** A result that completed but reports failure (e.g. an assertion failed). */
export function jsonResponseWithStatus(data: object, isError: boolean): HandlerResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], ...(isError ? { isError: true } : {}) };
}

export function errorResponse(message: string): HandlerResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

/** JSON Schema for ListTools, generated from the same Zod schema the handler parses. */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/**
 * Validate a URL against the server's SSRF policy (loopback allowed, private
 * ranges behind API_TESTER_ALLOW_PRIVATE, cloud metadata always blocked).
 */
export async function validateUrl(rawUrl: string): Promise<void> {
  await validateTargetUrl(rawUrl);
}
