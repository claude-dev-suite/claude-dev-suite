// SPDX-License-Identifier: MIT
/**
 * Helpers for writing an assistant's MCP config file to disk.
 *
 * The *rendering* (which key, which entry shape) lives in the pure writers
 * under targets/writers/mcp-config.writer.ts; this is only the filesystem side —
 * reading the current content for a merge, creating parent directories, and
 * recording the file in the manifest under the right target.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InstallManifest } from '../../types.js';
import type { ExtendedManifest } from '../../types/index.js';
import { trackManifestFile } from './manifest-tracking.js';
import type { TargetId } from '../targets/target-layout.js';
import type { SkippedCapability } from '../targets/target-adapter.js';
import { McpConfigParseError } from '../targets/writers/mcp-config.writer.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('McpConfigFile');

/** Read a config file for merging, or `null` when it does not exist yet. */
export function readExistingConfig(projectPath: string, relPath: string): string | null {
  const abs = path.join(projectPath, ...relPath.split('/'));
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
}

/**
 * Write a rendered MCP config file, creating parent directories and recording
 * it in the manifest tagged with its target.
 */
export function writeMcpConfigFile(args: {
  projectPath: string;
  relPath: string;
  content: string;
  target: TargetId;
  manifest: InstallManifest;
  extendedManifest: ExtendedManifest;
}): void {
  const { projectPath, relPath, content, target, manifest, extendedManifest } = args;
  const abs = path.join(projectPath, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  manifest.files.push({ path: relPath, type: 'config', source: 'generated' });
  trackManifestFile(extendedManifest, projectPath, relPath, 'config', undefined, target);
}

/**
 * Render, merge and write one assistant's MCP config, reporting an unparseable
 * file as a skipped capability instead of destroying it.
 *
 * Four adapters carried a hand-rolled copy of this render → read → merge →
 * catch → skip block, and Codex's copy omitted the catch. That omission cannot
 * fire today (the TOML writer parses no JSON and throws nothing), but a latent
 * "one of five is different" is exactly how the next bug gets in.
 */
export function writeMergedMcpConfig(args: {
  projectPath: string;
  relPath: string;
  target: TargetId;
  manifest: InstallManifest;
  extendedManifest: ExtendedManifest;
  /** Renders the merged content; may throw McpConfigParseError. */
  render: (existing: string | null) => string;
}): SkippedCapability[] {
  const { projectPath, relPath, target, manifest, extendedManifest, render } = args;
  try {
    const content = render(readExistingConfig(projectPath, relPath));
    writeMcpConfigFile({ projectPath, relPath, content, target, manifest, extendedManifest });
    return [];
  } catch (error) {
    if (error instanceof McpConfigParseError) {
      logger.warn('Existing MCP config is unparseable — left untouched', {
        error,
        context: { file: relPath, target },
      });
      return [{
        capability: 'mcp',
        reason: `${relPath} exists but could not be parsed; it was left untouched and dev-suite's servers were not added`,
      }];
    }
    throw error;
  }
}
