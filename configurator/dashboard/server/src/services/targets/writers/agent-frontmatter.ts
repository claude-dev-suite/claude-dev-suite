// SPDX-License-Identifier: MIT
/**
 * Shared helpers for native per-target agent writers.
 *
 * Every assistant that needs its own agent file wants the same two primitives:
 * a description safe to drop into YAML, and the source agent's body without the
 * dev-suite frontmatter. The *frontmatter shape* differs per target — that part
 * stays in each writer, where its golden test can pin it.
 */

/** Collapse to a single line and double-quote for a safe YAML scalar. */
export function yamlDoubleQuoted(value: string): string {
  const oneLine = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return JSON.stringify(oneLine); // JSON strings are valid YAML double-quoted scalars
}

/** Strip a leading `---`-delimited frontmatter block, returning the body. */
export function stripFrontmatter(source: string): string {
  if (!source.startsWith('---')) return source.trim();
  const end = source.indexOf('\n---', 3);
  if (end === -1) return source.trim();
  const afterClose = source.indexOf('\n', end + 1);
  return afterClose === -1 ? '' : source.slice(afterClose + 1).trim();
}
