// SPDX-License-Identifier: MIT
/**
 * Tool input schemas. One Zod definition per tool validates arguments at
 * runtime and is converted to the JSON Schema advertised by ListTools, so the
 * two can never drift apart.
 */

import { z } from 'zod';
import { SMELL_TYPES } from './analysis/smells.js';
import { ALL_LINTERS } from './linters/defs.js';

const scope = {
  path: z.string().min(1).max(4096).describe('Absolute path to a file or directory'),
  changedSince: z.string().min(1).max(200).optional().describe('Git ref; report only files changed since its merge-base (diff mode)'),
  exclude: z.array(z.string().min(1).max(300)).max(100).optional().describe('Repo-relative glob patterns to skip'),
  includeTests: z.boolean().optional().describe('Include test files'),
  maxFiles: z.number().int().min(1).max(50000).optional().describe('File cap (default 5000)'),
  maxFileSizeKb: z.number().int().min(1).max(20480).optional().describe('Skip larger files (default 512)'),
  limit: z.number().int().min(1).max(2000).optional().describe('Max items listed; output says when truncated'),
};
const format = z.enum(['markdown', 'json']).optional().describe('Output format (default markdown)');
const formatSarif = z.enum(['markdown', 'json', 'sarif']).optional().describe('Output format (default markdown)');

export const AnalyzeComplexitySchema = z
  .object({
    ...scope,
    threshold: z.number().int().min(1).max(1000).optional().describe('Cyclomatic threshold (default 10)'),
    cognitiveThreshold: z.number().int().min(1).max(1000).optional().describe('Cognitive threshold (default 15)'),
    includeAll: z.boolean().optional().describe('List every function, not only those over threshold'),
    sortBy: z.enum(['cognitive', 'cyclomatic', 'maintainability', 'loc']).optional(),
    format,
  })
  .strict();

export const FindDuplicatesSchema = z
  .object({
    ...scope,
    minLines: z.number().int().min(1).max(10000).optional().describe('Minimum clone length in lines (default 5)'),
    minTokens: z.number().int().min(10).max(10000).optional().describe('Minimum clone length in tokens (default 50)'),
    mode: z.enum(['renamed', 'exact', 'abstract']).optional().describe('renamed (default): identifiers normalised; abstract: literals too; exact: verbatim'),
    format,
  })
  .strict();

const LINTER_IDS = ALL_LINTERS.map((l) => l.id) as [string, ...string[]];

export const CheckStyleSchema = z
  .object({
    ...scope,
    fix: z.boolean().optional().describe('Apply the tools\' autofixes (writes files). Default false = report only'),
    rules: z.array(z.string().min(1).max(200)).max(200).optional().describe('Only report these rule ids (prefix match)'),
    linters: z.array(z.enum(LINTER_IDS)).max(20).optional().describe('Restrict to these tools'),
    timeoutSec: z.number().int().min(10).max(3600).optional().describe('Per-tool timeout'),
    format: formatSarif,
  })
  .strict();

export const DetectAntiPatternsSchema = z
  .object({
    ...scope,
    patterns: z.array(z.enum(SMELL_TYPES)).optional().describe('Only these patterns'),
    thresholds: z
      .object({
        maxCyclomaticComplexity: z.number().min(1).optional(),
        maxCognitiveComplexity: z.number().min(1).optional(),
        maxFunctionLines: z.number().min(1).optional(),
        maxClassLines: z.number().min(1).optional(),
        maxClassMethods: z.number().min(1).optional(),
        maxClassComplexity: z.number().min(1).optional(),
        maxNestingDepth: z.number().min(1).optional(),
        maxParameters: z.number().min(0).optional(),
        maxFileLines: z.number().min(1).optional(),
        maxPrimitiveParameters: z.number().min(1).optional(),
        minDataClumpSize: z.number().int().min(2).max(6).optional(),
        minDataClumpOccurrences: z.number().int().min(2).optional(),
        minForeignAccesses: z.number().int().min(1).optional(),
        minDuplicateLines: z.number().int().min(1).optional(),
        minDuplicateTokens: z.number().int().min(10).optional(),
      })
      .strict()
      .optional(),
    format: formatSarif,
  })
  .strict();

export const FindDeadCodeSchema = z
  .object({
    ...scope,
    confidence: z.enum(['high', 'medium', 'low']).optional().describe('Minimum confidence (default medium)'),
    entries: z.array(z.string().min(1).max(300)).max(200).optional().describe('Extra entry-point globs (repo-relative)'),
    kinds: z.array(z.enum(['file', 'export', 'type', 'dependency', 'unlisted', 'import', 'definition', 'function'])).optional(),
    format,
  })
  .strict();

const matcher = z.object({ path: z.string().max(500).optional(), pathNot: z.string().max(500).optional() }).strict();
const boundaryRule = z
  .object({
    name: z.string().min(1).max(200),
    severity: z.enum(['error', 'warn', 'info']).optional(),
    comment: z.string().max(1000).optional(),
    from: matcher.optional(),
    to: matcher
      .extend({
        external: z.boolean().optional(),
        package: z.string().max(500).optional(),
        circular: z.boolean().optional(),
        typeOnly: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AnalyzeImportGraphSchema = z
  .object({
    ...scope,
    maxDepth: z.number().int().min(1).max(1000).optional().describe('Depth for traversal metrics and focus (default 10)'),
    excludeNodeModules: z.boolean().optional().describe('false lists every external package used'),
    ignoreTypeImports: z.boolean().optional().describe('Ignore type-only imports when finding cycles'),
    focus: z.string().max(4096).optional().describe('File to show dependencies/dependents for'),
    rules: z
      .object({
        forbidden: z.array(boundaryRule).max(200).optional(),
        allowed: z.array(boundaryRule).max(200).optional(),
        allowedSeverity: z.enum(['error', 'warn', 'info']).optional(),
      })
      .strict()
      .optional()
      .describe('dependency-cruiser style rules; paths are regexes on repo-relative paths'),
    format,
  })
  .strict();

export const CodeMetricsSchema = z
  .object({
    ...scope,
    sortBy: z.enum(['loc', 'sloc', 'complexity', 'functions', 'maintainability']).optional(),
    format,
  })
  .strict();

/** JSON Schema for ListTools (drafts are fine for MCP clients; `$schema` is dropped). */
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}
