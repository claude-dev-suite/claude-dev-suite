// SPDX-License-Identifier: MIT
/**
 * Argument validation, error wrapping and output rendering for tool calls.
 */

import type { z } from 'zod';
import type { ToolResult } from './core/report.js';

export const MAX_TEXT = 400_000;

export interface CallResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function render(result: ToolResult, format: string | undefined): string {
  let text: string;
  if (format === 'sarif' && result.sarif !== undefined) text = JSON.stringify(result.sarif, null, 2);
  else if (format === 'json') text = JSON.stringify(result.data, null, 2);
  else text = result.markdown;
  if (text.length > MAX_TEXT) {
    text = text.slice(0, MAX_TEXT) + `\n\n[truncated: output exceeded ${MAX_TEXT} characters — lower \`limit\` or narrow \`path\`]`;
  }
  return text;
}

export async function dispatch(
  name: string,
  schema: z.ZodType,
  run: (args: any) => Promise<ToolResult>,
  args: unknown
): Promise<CallResult> {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { content: [{ type: 'text', text: `Invalid arguments for ${name}: ${detail}` }], isError: true };
  }
  try {
    const data = parsed.data as { format?: string };
    const result = await run(data);
    return { content: [{ type: 'text', text: render(result, data.format) }], ...(result.isError ? { isError: true } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}
