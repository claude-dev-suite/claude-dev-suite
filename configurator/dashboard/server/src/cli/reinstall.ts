// SPDX-License-Identifier: MIT
/**
 * Headless reinstall CLI
 *
 * Runs the erase-and-replace reinstall against a project without the dashboard
 * UI — usable from CI, batch jobs, or the `/reinstall-dev-suite` slash command.
 *
 * Usage:
 *   node dist/cli/reinstall.js --project <path> [--dry-run] [--drift] [--yes]
 *        [--keep <relPath>]... [--promote <relPath>]... [--no-backup]
 *        [--dev-suite-dir <path>] [--json]
 *
 *   --dry-run          Preview only; print the report and exit 0.
 *   --drift            Scan only: report managed files that changed since
 *                      dev-suite wrote them, and exit 4 if any are unratified.
 *                      Meant for gating — a CI step or a multi-agent fan-out can
 *                      refuse to continue while its own edits are still pending
 *                      a decision.
 *   --yes              Proceed even when there are locally modified managed
 *                      files (they are overwritten unless --keep'd).
 *   --keep <relPath>   Preserve a locally modified managed file for this run
 *                      only; it is reported again next time (repeatable).
 *   --promote <path>   Preserve the file AND ratify its content, so it stops
 *                      being reported as drift (repeatable).
 *   --no-backup        Skip the safety backup (not recommended).
 *   --dev-suite-dir    Override DEV_SUITE_DIR (source catalog root).
 *   --json             Emit machine-readable JSON instead of human text.
 *
 * Exit codes: 0 success / dry-run / clean drift scan, 1 failure, 2 needs --yes
 * (unresolved edits), 3 usage error, 4 unratified drift found (--drift).
 */

import { pathToFileURL } from 'url';
import { ReinstallService } from '../services/reinstall.service.js';
import type { ReinstallFileResolution } from '../types/index.js';

interface ParsedArgs {
  project?: string;
  dryRun: boolean;
  drift: boolean;
  yes: boolean;
  keep: string[];
  promote: string[];
  backup: boolean;
  devSuiteDir?: string;
  json: boolean;
  unknownFlag?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    dryRun: false,
    drift: false,
    yes: false,
    keep: [],
    promote: [],
    backup: true,
    json: false,
  };
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
      case '--drift':
        args.drift = true;
        break;
      case '--yes':
      case '-y':
        args.yes = true;
        break;
      case '--keep':
        { const v = argv[++i]; if (v) args.keep.push(v); }
        break;
      case '--promote':
        { const v = argv[++i]; if (v) args.promote.push(v); }
        break;
      case '--no-backup':
        args.backup = false;
        break;
      case '--dev-suite-dir':
        args.devSuiteDir = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      default:
        if (a && a.startsWith('-')) {
          args.unknownFlag = a;
        }
    }
  }
  return args;
}

function out(json: boolean, human: string, obj: unknown): void {
  process.stdout.write(json ? `${JSON.stringify(obj, null, 2)}\n` : `${human}\n`);
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
  if (args.devSuiteDir) {
    process.env.DEV_SUITE_DIR = args.devSuiteDir;
  }

  const service = new ReinstallService();

  // Drift scan: read-only, and the only mode with a gating exit code. It runs
  // before the preview because it must work (and stay cheap) on a project that
  // is otherwise fine — the point is to answer "did anything change under us?"
  // without implying a reinstall is wanted.
  if (args.drift) {
    const report = await service.getDrift(args.project);
    if (!report.hasManifest) {
      out(args.json, 'No dev-suite manifest found — nothing to scan.', report);
      return 1;
    }
    const lines = [
      'Drift scan:',
      `  scanned:      ${report.counts.scanned}`,
      `  drifted:      ${report.counts.drifted}`,
      ...report.drifted.map(
        f => `    - ${f.path}${f.scope === 'managed-section' ? ' (inside the dev-suite markers)' : ''}`
      ),
      `  acknowledged: ${report.counts.acknowledged}`,
      `  deleted:      ${report.counts.deleted}`,
      ...report.deleted.map(f => `    - ${f.path} (missing)`),
      `  no baseline:  ${report.counts.unknownBaseline}`,
    ];
    out(args.json, lines.join('\n'), report);
    return report.hasActionableDrift ? 4 : 0;
  }

  // Always preview first.
  const preview = await service.previewReinstall(args.project);

  if (!preview.hasValidManifest) {
    out(args.json, `Cannot reinstall: ${preview.reason ?? 'no manifest'}`, preview);
    return 1;
  }

  if (args.dryRun) {
    const lines = [
      'Reinstall preview (dry run):',
      `  agents:       ${preview.selection.agents.length}`,
      `  mcp servers:  ${preview.selection.mcpServers.length}`,
      `  rules:        ${preview.selection.rules.length}`,
      `  skill dirs:   ${preview.skillDirsToRebuild} (rebuilt)`,
      `  orphans:      ${preview.orphansToRemove.length}${preview.orphansToRemove.length ? ` (${preview.orphansToRemove.join(', ')})` : ''}`,
      `  modified:     ${preview.modifiedManagedFiles.length}`,
      ...preview.modifiedManagedFiles.map(f =>
        f.acknowledged
          ? `    - ${f.path} (adopted earlier — left alone)`
          : `    - ${f.path} (locally modified — will be overwritten unless --keep/--promote)`
      ),
    ];
    out(args.json, lines.join('\n'), preview);
    return 0;
  }

  // Block if there are unresolved local modifications and the user hasn't
  // acknowledged via --yes.
  const keepSet = new Set([...args.keep, ...args.promote]);
  const unacknowledged = preview.modifiedManagedFiles.filter(
    f => !keepSet.has(f.path) && !f.acknowledged
  );
  if (unacknowledged.length > 0 && !args.yes) {
    const lines = [
      'Refusing to reinstall: these managed files have local modifications.',
      ...unacknowledged.map(f => `  - ${f.path}`),
      '',
      'Re-run with --yes to overwrite them, --keep <path> to preserve one for this run,',
      'or --promote <path> to adopt its current content permanently.',
    ];
    out(args.json, lines.join('\n'), { needsConfirmation: true, modified: preview.modifiedManagedFiles });
    return 2;
  }

  const resolutions: Record<string, ReinstallFileResolution> = {};
  for (const p of args.keep) resolutions[p] = 'keep';
  // Applied last so an explicit --promote wins over a --keep for the same path.
  for (const p of args.promote) resolutions[p] = 'promote';

  const result = await service.executeReinstall({
    projectPath: args.project,
    resolutions,
    createBackup: args.backup,
  });

  if (result.success) {
    const lines = [
      'Reinstall complete.',
      `  agents reinstalled: ${result.agentsReinstalled.length}`,
      `  mcp reinstalled:    ${result.mcpReinstalled.length}`,
      `  orphans removed:    ${result.orphansRemoved.length}`,
      `  kept (opt-out):     ${result.keptFiles.length}`,
      `  adopted (promoted): ${result.promotedFiles?.length ?? 0}`,
      result.backupDir ? `  backup:             ${result.backupDir}` : '  backup:             (skipped)',
      ...result.verifyWarnings.map(w => `  warning: ${w}`),
    ];
    out(args.json, lines.join('\n'), result);
    return 0;
  }

  const human = result.rolledBack
    ? `Reinstall failed and was rolled back (no changes applied): ${result.error}`
    : `Reinstall failed: ${result.error}`;
  out(args.json, human, result);
  return 1;
}

// Auto-execute only when invoked directly (not when imported by tests).
const invokedPath = process.argv[1];
const isMain = invokedPath != null && import.meta.url === pathToFileURL(invokedPath).href;
if (isMain) {
  run(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(err => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    });
}
