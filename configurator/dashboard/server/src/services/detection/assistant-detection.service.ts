// SPDX-License-Identifier: MIT
/**
 * Assistant Detection Service
 *
 * Probes a project for signs that a given AI coding assistant is already in use,
 * so the install wizard can pre-select the right targets. Standalone (returns
 * its own typed array) because this axis is orthogonal to stack detection —
 * `DetectionResult` has no natural slot for it.
 *
 * Presence markers are tool-specific files and directories (config dirs,
 * instruction files, legacy rule files). `AGENTS.md` is deliberately *not* a
 * marker: it is shared across assistants, so it says nothing about which one is
 * in use.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import { readJsonSync } from '../../utils/fs-utils.js';
import { getLogger } from '../../utils/logger.js';
import {
  DEFAULT_TARGET,
  getTargetLayout,
  isImplemented,
  type TargetId,
} from '../targets/target-layout.js';

const logger = getLogger('AssistantDetectionService');

/** A supported/known assistant and the project files that betray its use. */
interface AssistantSpec {
  target: TargetId;
  displayName: string;
  /** Project-relative files/dirs whose presence indicates this assistant. */
  markers: string[];
}

/**
 * Known assistants and their presence markers. Implemented targets list their
 * layout paths plus legacy signals; Tier 2/3 targets are detected too (so the
 * UI can note "seen, but not yet supported") but carry no adapter.
 *
 * A test cross-checks each implemented target's markers against its layout
 * descriptor, so the two cannot silently drift.
 */
const ASSISTANT_SPECS: readonly AssistantSpec[] = Object.freeze([
  { target: 'claude-code', displayName: 'Claude Code', markers: ['.claude', 'CLAUDE.md'] },
  { target: 'copilot', displayName: 'GitHub Copilot', markers: ['.github/copilot-instructions.md', '.github/agents', '.github/instructions', '.vscode/mcp.json'] },
  { target: 'cursor', displayName: 'Cursor', markers: ['.cursor', '.cursorrules'] },
  { target: 'codex', displayName: 'OpenAI Codex CLI', markers: ['.codex'] },
  { target: 'gemini', displayName: 'Gemini CLI', markers: ['.gemini', 'GEMINI.md'] },
  { target: 'cline', displayName: 'Cline', markers: ['.clinerules', '.cline'] },
  { target: 'windsurf', displayName: 'Devin Desktop (Windsurf)', markers: ['.devin', '.windsurf', '.windsurfrules'] },
]);

/** One assistant's detection result. */
export interface DetectedAssistant {
  target: TargetId;
  displayName: string;
  /** True when any presence marker was found in the project. */
  present: boolean;
  /** Project-relative marker paths that were found. */
  markers: string[];
  /** True when the project's dev-suite manifest already lists this target. */
  devSuiteInstalled: boolean;
  /** True when dev-suite can generate configuration for this assistant. */
  implemented: boolean;
  /** True when the wizard should pre-select this target (see recommendation logic). */
  recommended: boolean;
}

export class AssistantDetectionService {
  /**
   * Detect which assistants a project already uses.
   *
   * Recommendation: pre-select every *implemented* assistant that was detected.
   * If none was detected, fall back to Claude Code (the default target) so a
   * fresh project still gets a working install. An assistant dev-suite already
   * installed for is always recommended, even if its marker files were removed.
   */
  async detectAssistants(projectPath: string): Promise<DetectedAssistant[]> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const installedTargets = this.readManifestTargets(projectPath);

    const results: DetectedAssistant[] = ASSISTANT_SPECS.map(spec => {
      const found = spec.markers.filter(m => this.markerExists(projectPath, m));
      const devSuiteInstalled = installedTargets.includes(spec.target);
      return {
        target: spec.target,
        displayName: spec.displayName,
        present: found.length > 0,
        markers: found,
        devSuiteInstalled,
        implemented: isImplemented(spec.target),
        recommended: false, // filled in below
      };
    });

    const anyImplementedDetected = results.some(
      r => r.implemented && (r.present || r.devSuiteInstalled)
    );

    for (const r of results) {
      if (!r.implemented) continue;
      r.recommended = anyImplementedDetected
        ? r.present || r.devSuiteInstalled
        : r.target === DEFAULT_TARGET;
    }

    return results;
  }

  /** Presence check that tolerates unreadable paths (treated as absent). */
  private markerExists(projectPath: string, relMarker: string): boolean {
    try {
      return fs.existsSync(path.join(projectPath, ...relMarker.split('/')));
    } catch {
      return false;
    }
  }

  /** Targets recorded in the project's dev-suite manifest, or [] when none. */
  private readManifestTargets(projectPath: string): TargetId[] {
    try {
      const manifest = readJsonSync<{ targets?: TargetId[] }>(
        path.join(projectPath, '.dev-suite-manifest.json')
      );
      return manifest?.targets ?? [];
    } catch (error) {
      logger.warn('Failed to read manifest targets during assistant detection', {
        error,
        context: { projectPath },
      });
      return [];
    }
  }
}

/** Marker specs, exported for the drift-guard test only. */
export const __ASSISTANT_SPECS_FOR_TEST = ASSISTANT_SPECS;
/** Re-export so tests can assert markers match the layout without re-importing. */
export { getTargetLayout };
