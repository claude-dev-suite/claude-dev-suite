// SPDX-License-Identifier: MIT
/**
 * Recover install parameters that live in generated files.
 *
 * Env vars and the skill-loading mode are not stored in the manifest — they are
 * baked into each assistant's MCP config. Both were recovered from Claude Code's
 * `.mcp.json` alone, so a Cursor- or Gemini-only project (which has no
 * `.mcp.json` at all) came back with `{}` and every API key the user had entered
 * in the wizard was wiped on the next reinstall, silently.
 *
 * Reading across every selected target fixes that, and makes the Manage tab able
 * to re-run an install without losing credentials.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import {
  DEFAULT_TARGET,
  mcpConfigFilesFor,
  type TargetId,
} from '../targets/target-layout.js';

const logger = getLogger('InstallRecovery');

function mcpFilesFor(targets: readonly TargetId[]): string[] {
  // Every surface a target reads, from the descriptor — Copilot's second one
  // used to live in a local table here, invisible to the coverage gate.
  const files = new Set<string>();
  for (const target of targets) {
    for (const file of mcpConfigFilesFor(target)) files.add(file);
  }
  return [...files];
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The server map in a config, whichever key this assistant uses. */
function serverMap(root: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['mcpServers', 'servers']) {
    const value = root[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

/**
 * Every environment variable dev-suite baked into any selected assistant's MCP
 * config. Later targets do not overwrite an earlier non-empty value.
 */
export function recoverEnvVars(
  projectPath: string,
  targets: readonly TargetId[] = [DEFAULT_TARGET]
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rel of mcpFilesFor(targets)) {
    const abs = path.join(projectPath, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const root = readJson(abs);
    if (!root) {
      logger.warn('Could not read an MCP config while recovering env vars', { context: { file: rel } });
      continue;
    }
    for (const entry of Object.values(serverMap(root))) {
      if (!entry || typeof entry !== 'object') continue;
      const env = (entry as { env?: unknown }).env;
      if (!env || typeof env !== 'object') continue;
      for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
        if (typeof value === 'string' && value.length > 0 && !out[key]) out[key] = value;
      }
    }
  }

  // Codex stores its servers as TOML, so the JSON pass above cannot see them.
  const codexToml = path.join(projectPath, '.codex', 'config.toml');
  if (targets.includes('codex') && fs.existsSync(codexToml)) {
    try {
      const content = fs.readFileSync(codexToml, 'utf-8');
      // `[mcp_servers.<name>.env]` sections hold plain `KEY = "value"` pairs.
      const sections = content.split(/^\s*\[/m);
      for (const section of sections) {
        if (!/^mcp_servers\.[^.\]]+\.env\]/.test(section)) continue;
        for (const line of section.split('\n').slice(1)) {
          const kv = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/);
          if (kv?.[1] && kv[2] !== undefined && !out[kv[1]]) {
            out[kv[1]] = kv[2].replace(/\\(.)/g, '$1');
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Could not read .codex/config.toml while recovering env vars', { error });
    }
  }

  return out;
}

/**
 * Whether skills were installed lazily, i.e. whether `skill-loader` is present
 * in any selected assistant's MCP config.
 */
export function recoverSkillLoadingMode(
  projectPath: string,
  targets: readonly TargetId[] = [DEFAULT_TARGET]
): 'eager' | 'lazy' {
  for (const rel of mcpFilesFor(targets)) {
    const abs = path.join(projectPath, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const root = readJson(abs);
    if (root && Object.prototype.hasOwnProperty.call(serverMap(root), 'skill-loader')) {
      return 'lazy';
    }
  }

  const codexToml = path.join(projectPath, '.codex', 'config.toml');
  if (targets.includes('codex') && fs.existsSync(codexToml)) {
    try {
      if (/^\s*\[mcp_servers\."?skill-loader"?\]/m.test(fs.readFileSync(codexToml, 'utf-8'))) {
        return 'lazy';
      }
    } catch {
      /* unreadable — fall through to eager */
    }
  }

  return 'eager';
}
