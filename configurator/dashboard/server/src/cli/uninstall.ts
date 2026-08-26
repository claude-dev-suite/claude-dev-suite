// SPDX-License-Identifier: MIT
/**
 * Headless uninstall CLI
 *
 * Removes dev-suite from a project using the real installation manifest, via
 * the same `InstallationService.uninstall()` the dashboard calls.
 *
 * This exists because the two shell uninstallers that shipped before it parsed
 * manifest shapes that never existed — one grepped `"files": [` line-by-line out
 * of a pretty-printed JSON array of objects, the other read `.actions.files_copied[]`
 * — so both removed nothing and printed success. Manifest parsing belongs next to
 * the code that writes the manifest.
 *
 * Usage:
 *   node dist/cli/uninstall.js --project <path> [--dry-run] [--json]
 *
 *   --dry-run   List what would be removed and exit without touching anything.
 *   --json      Emit machine-readable JSON instead of human text.
 *
 * Exit codes: 0 success / dry-run, 1 failure, 3 usage error.
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { InstallationService } from '../services/installation.service.js';

interface ParsedArgs {
  project?: string;
  dryRun: boolean;
  json: boolean;
  unknownFlag?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--project':
      case '-p':
        args.project = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--json':
        args.json = true;
        break;
      default:
        if (a && a.startsWith('-')) args.unknownFlag = a;
    }
  }
  return args;
}

function out(json: boolean, human: string, obj: unknown): void {
  process.stdout.write(json ? `${JSON.stringify(obj, null, 2)}\n` : `${human}\n`);
}

/** Read the manifest the way the installer writes it — objects, not strings. */
function readManifest(projectPath: string): { files: string[]; rules: string[] } | null {
  const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      files?: Array<string | { path?: string }>;
      installedRuleFiles?: string[];
    };
    const files = (raw.files ?? [])
      .map((f) => (typeof f === 'string' ? f : f?.path))
      .filter((p): p is string => Boolean(p));
    return { files, rules: raw.installedRuleFiles ?? [] };
  } catch {
    return null;
  }
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.unknownFlag) {
    process.stderr.write(`Unknown flag: ${args.unknownFlag}\n`);
    return 3;
  }
  if (!args.project) {
    process.stderr.write('Error: --project <path> is required\n');
    return 3;
  }

  const manifest = readManifest(args.project);
  if (!manifest) {
    out(
      args.json,
      'No readable .dev-suite-manifest.json in that project — nothing to uninstall.',
      { removed: [], errors: ['manifest missing or unparseable'] }
    );
    return 1;
  }

  if (args.dryRun) {
    const lines = [
      'Uninstall preview (dry run):',
      `  tracked files: ${manifest.files.length}`,
      ...manifest.files.map((f) => `    - ${f}`),
      `  rule files:    ${manifest.rules.length}`,
      ...manifest.rules.map((f) => `    - ${f}`),
      '  directories removed when empty of user content: .mcp-servers/, .claude/agents/, .claude/skills/, .kb-cache/',
    ];
    out(args.json, lines.join('\n'), { dryRun: true, ...manifest });
    return 0;
  }

  const service = new InstallationService();
  const result = await service.uninstall(args.project);

  const lines = [
    `Uninstall complete: ${result.removed.length} path(s) removed.`,
    ...result.removed.map((r) => `  - ${r}`),
    ...result.errors.map((e) => `  error: ${e}`),
  ];
  out(args.json, lines.join('\n'), result);
  return result.errors.length > 0 ? 1 : 0;
}

// Auto-execute only when invoked directly (not when imported by tests).
const invokedPath = process.argv[1];
const isMain = invokedPath != null && import.meta.url === pathToFileURL(invokedPath).href;
if (isMain) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      process.exit(1);
    });
}
