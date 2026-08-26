// SPDX-License-Identifier: MIT
/**
 * Slash command installer.
 *
 * `commands/*.md` in the dev-suite source are Claude Code slash commands. Only
 * Claude Code reads `.claude/commands`, so unlike the agent+skill substrate
 * these are written for that target alone — the other assistants declare a
 * commands directory with an incompatible format (Copilot wants
 * `.github/prompts/*.prompt.md`) that dev-suite does not generate.
 *
 * Files are tracked as `generated`, which makes an uninstall remove exactly the
 * commands dev-suite wrote and a reinstall overwrite them in place, leaving any
 * command the user authored in the same directory untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import type { InstallManifest } from '../../types.js';
import type { ExtendedManifest } from '../../types/index.js';
import { trackManifestFile } from './manifest-tracking.js';
import { targetPaths } from '../targets/target-paths.js';
import type { InstallPlan } from '../targets/target-adapter.js';

const logger = getLogger('CommandsInstaller');

/**
 * Commands that operate on the dev-suite repository itself (release and
 * community workflows) rather than on a configured project. Installing them
 * into a user's project would offer actions that cannot work there.
 */
const MAINTAINER_ONLY = new Set([
  'awesome-list-pr.md',
  'community-draft.md',
  'release-promote.md',
  'README.md',
]);

/** Command files a target project should receive, sorted for stable output. */
export function projectCommandFiles(devSuiteDir: string): string[] {
  const dir = path.join(devSuiteDir, 'commands');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !MAINTAINER_ONLY.has(f))
    .sort();
}

/**
 * Copy the project-facing slash commands into `.claude/commands`.
 *
 * No-op unless Claude Code is one of the selected targets. Returns the relative
 * paths written.
 */
export function installCommands(
  plan: InstallPlan,
  manifest: InstallManifest,
  extendedManifest: ExtendedManifest
): string[] {
  if (!plan.targets.includes('claude-code')) return [];

  const { projectPath, devSuiteDir } = plan;
  const files = projectCommandFiles(devSuiteDir);
  if (files.length === 0) {
    logger.warn('No slash commands found in dev-suite source', {
      context: { dir: path.join(devSuiteDir, 'commands') },
    });
    return [];
  }

  const paths = targetPaths(projectPath, 'claude-code');
  fs.mkdirSync(paths.commandsDir, { recursive: true });

  const written: string[] = [];
  for (const file of files) {
    const source = path.join(devSuiteDir, 'commands', file);
    const dest = path.join(paths.commandsDir, file);
    try {
      fs.copyFileSync(source, dest);
      const rel = `${paths.relCommandsDir}/${file}`;
      trackManifestFile(extendedManifest, projectPath, rel, 'generated', source, 'claude-code');
      manifest.files.push({ path: rel, type: 'config', source });
      written.push(rel);
    } catch (error: unknown) {
      logger.warn('Failed to install slash command', { error, context: { file } });
    }
  }

  logger.info('Installed slash commands', { context: { count: written.length } });
  return written;
}
