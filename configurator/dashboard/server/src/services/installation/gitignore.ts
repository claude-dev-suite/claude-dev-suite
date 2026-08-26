// SPDX-License-Identifier: MIT
/**
 * Keep secrets and local backups out of version control.
 *
 * Wizard env values — API keys, database URLs — are written verbatim into every
 * selected assistant's MCP config, and two of those (`.vscode/mcp.json`,
 * `.github/mcp.json`) are files teams routinely commit. Dev-suite also drops
 * timestamped `.dev-suite-backup-*` directories in the project root, which
 * contain the same values and accumulate unboundedly.
 *
 * Nothing warned about either. This appends a marked block to `.gitignore` so a
 * config carrying a credential is not committed by accident, and leaves any
 * existing content untouched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import { mcpConfigFilesFor, type TargetId } from '../targets/target-layout.js';

const logger = getLogger('Gitignore');

const START = '# --- dev-suite (managed) ---';
const END = '# --- end dev-suite ---';

/**
 * Backups and runtime artifacts always; MCP configs only when they can hold a
 * credential.
 *
 * `.dev-suite-analytics/` (written by the `documentation` MCP server at runtime)
 * and `.dev-suite-live.json` (written by the Live Performance panel) are
 * produced *after* an install, by processes the install pipeline does not own.
 * They belong to the project's working state, not its committed configuration,
 * and were previously in no ignore list, no backup and no uninstall path.
 */
function entriesFor(targets: readonly TargetId[], hasSecrets: boolean): string[] {
  const entries = [
    '.dev-suite-backup-*/',
    '.dev-suite-analytics/',
    '.dev-suite-live.json',
  ];
  if (!hasSecrets) return entries;

  for (const target of targets) {
    // Both of Copilot's MCP surfaces come from the descriptor now; this used to
    // special-case `.github/mcp.json` inline.
    entries.push(...mcpConfigFilesFor(target));
  }
  return [...new Set(entries)];
}

/**
 * Append (or refresh) dev-suite's block in the project `.gitignore`.
 *
 * Returns the relative path when the file was written, so the caller can track
 * it. A user who deliberately commits their MCP config can delete the block:
 * dev-suite only rewrites what is between its own markers.
 */
export function updateGitignore(
  projectPath: string,
  targets: readonly TargetId[],
  hasSecrets: boolean
): string | null {
  const entries = entriesFor(targets, hasSecrets);
  if (entries.length === 0) return null;

  const file = path.join(projectPath, '.gitignore');
  let existing = '';
  try {
    if (fs.existsSync(file)) existing = fs.readFileSync(file, 'utf-8');
  } catch (error: unknown) {
    logger.warn('Could not read .gitignore', { error, context: { file } });
    return null;
  }

  const note = hasSecrets
    ? '# MCP configs below hold environment values you entered in the wizard.'
    : '# Local backups created before an install or reinstall.';
  const block = [START, note, ...entries, END].join('\n');

  let next: string;
  const startIdx = existing.indexOf(START);
  const endIdx = existing.indexOf(END);
  if (startIdx >= 0 && endIdx > startIdx) {
    next = existing.slice(0, startIdx) + block + existing.slice(endIdx + END.length);
  } else {
    const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    next = `${existing}${separator}${existing.length > 0 ? '\n' : ''}${block}\n`;
  }

  if (next === existing) return '.gitignore';

  try {
    fs.writeFileSync(file, next, 'utf-8');
    logger.info('Updated .gitignore with dev-suite entries', {
      context: { entries: entries.length, hasSecrets },
    });
    return '.gitignore';
  } catch (error: unknown) {
    logger.warn('Could not write .gitignore', { error, context: { file } });
    return null;
  }
}

/**
 * Strip dev-suite's block from `.gitignore` on uninstall.
 *
 * Never deletes the file: it is the user's, and everything outside the markers
 * is theirs. Returns true when something was removed.
 */
export function removeGitignoreBlock(projectPath: string): boolean {
  const file = path.join(projectPath, '.gitignore');
  if (!fs.existsSync(file)) return false;
  try {
    const existing = fs.readFileSync(file, 'utf-8');
    const startIdx = existing.indexOf(START);
    const endIdx = existing.indexOf(END);
    if (startIdx < 0 || endIdx <= startIdx) return false;

    const next = (existing.slice(0, startIdx) + existing.slice(endIdx + END.length))
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '');
    fs.writeFileSync(file, next, 'utf-8');
    return true;
  } catch (error: unknown) {
    logger.warn('Could not strip the dev-suite block from .gitignore', { error });
    return false;
  }
}
