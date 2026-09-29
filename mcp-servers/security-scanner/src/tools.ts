// SPDX-License-Identifier: MIT
/** Tool definitions and dispatch, separate from the stdio wiring so tests can call them directly. */
import { z } from 'zod';

import { checkAllTools } from './utils/tool-checker.js';
import { redactDeep } from './utils/redact.js';
import type { ScanResult } from './types.js';
import { scanDependencies } from './scanners/dependencies.js';
import { scanSecrets } from './scanners/secrets.js';
import { scanCode } from './scanners/code.js';
import { scanContainer } from './scanners/container.js';
import { ALL_SCAN_TYPES, scanAll } from './scanners/all.js';

// ---------------------------------------------------------------------------
// Input schemas (validation and the advertised JSON Schema come from one source)
// ---------------------------------------------------------------------------

const Severity = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

const common = {
  severityThreshold: Severity.optional().describe('Only report findings at or above this severity (UNKNOWN-severity findings are kept)'),
  maxResults: z.number().int().min(1).max(1000).optional().describe('Maximum findings returned (default 100); the result says when it was truncated'),
  timeoutSeconds: z.number().int().min(10).max(3600).optional().describe('Per-tool timeout in seconds (default 600)'),
};

const absPath = (what: string) => z.string().min(1).describe(`Absolute path to ${what}`);
const excludePaths = z
  .array(z.string().max(500))
  .max(200)
  .optional()
  .describe('Paths to exclude: a directory/sub-path (e.g. "dist", "src/gen") or a glob with * (e.g. "*.min.js")');
const baseRef = z.string().max(200).optional().describe('Diff-only mode: only files changed since this git ref (branch, tag or commit)');

export const schemas = {
  scan_dependencies: z.object({
    path: absPath('the project or monorepo root'),
    packageManager: z.enum(['auto', 'npm', 'yarn', 'pnpm', 'pip', 'cargo', 'go']).optional().describe('Restrict to one ecosystem (default: all found)'),
    engine: z
      .enum(['auto', 'trivy', 'osv-scanner', 'native'])
      .optional()
      .describe('auto: trivy, else osv-scanner, then native auditors for anything left uncovered'),
    excludePaths,
    ...common,
  }),
  scan_secrets: z.object({
    path: absPath('the directory to scan'),
    tool: z.enum(['auto', 'gitleaks', 'trufflehog', 'trivy', 'builtin']).optional().describe('Secret scanner (auto picks the best installed)'),
    scanHistory: z.boolean().optional().describe('Also scan git history (gitleaks/trufflehog only)'),
    excludePaths,
    baseRef,
    verifySecrets: z.boolean().optional().describe('trufflehog only: verify candidates against provider APIs (sends them over the network)'),
    ...common,
  }),
  scan_code: z.object({
    path: absPath('the directory or file to scan'),
    rules: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe('Semgrep configs: registry packs (p/security-audit, p/owasp-top-ten, p/secrets) or rule file paths'),
    excludePaths,
    baseRef,
    ...common,
  }),
  scan_container: z.object({
    target: z.string().min(1).max(512).describe('Image reference (e.g. nginx:1.27) or absolute filesystem path'),
    type: z.enum(['image', 'filesystem']).describe('What target is'),
    includeLicenses: z.boolean().optional().describe('Also report package licenses'),
    ...common,
  }),
  check_tools: z.object({}),
  scan_all: z.object({
    path: absPath('the project root'),
    include: z.array(z.enum(ALL_SCAN_TYPES as [string, ...string[]])).optional().describe('Scans to run (default: all; container needs containerTarget)'),
    containerTarget: z.string().max(512).optional().describe('Image to scan when container is included'),
    scanHistory: z.boolean().optional().describe('Include git history in the secrets scan'),
    baseRef,
    rules: z.array(z.string().max(500)).max(20).optional().describe('Semgrep configs for the code scan'),
    excludePaths,
    ...common,
  }),
};

export type ToolName = keyof typeof schemas;

export function jsonSchemaFor(name: ToolName): { type: 'object'; [k: string]: unknown } {
  const js = z.toJSONSchema(schemas[name], { io: 'input' }) as Record<string, unknown>;
  delete js.$schema;
  return js as { type: 'object'; [k: string]: unknown };
}

function render(r: ScanResult) {
  return [{ type: 'text' as const, text: JSON.stringify(redactDeep(r), null, 2) }];
}

export async function callTool(name: string, args: unknown) {
  switch (name) {
    case 'scan_dependencies': {
      const i = schemas.scan_dependencies.parse(args ?? {});
      return { content: render(await scanDependencies(i)) };
    }
    case 'scan_secrets': {
      const i = schemas.scan_secrets.parse(args ?? {});
      return { content: render(await scanSecrets(i)) };
    }
    case 'scan_code': {
      const i = schemas.scan_code.parse(args ?? {});
      return { content: render(await scanCode(i)) };
    }
    case 'scan_container': {
      const i = schemas.scan_container.parse(args ?? {});
      return { content: render(await scanContainer(i)) };
    }
    case 'check_tools': {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await checkAllTools(), null, 2) }] };
    }
    case 'scan_all': {
      const i = schemas.scan_all.parse(args ?? {});
      const r = await scanAll({ ...i, include: i.include as Parameters<typeof scanAll>[0]['include'] });
      return { content: [{ type: 'text' as const, text: JSON.stringify(redactDeep(r), null, 2) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

