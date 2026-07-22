/**
 * Assistant Detection Service tests.
 *
 * Cover the recommendation logic (which targets the wizard pre-selects) and a
 * drift guard tying the marker table back to the layout descriptors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AssistantDetectionService,
  __ASSISTANT_SPECS_FOR_TEST,
  getTargetLayout,
} from '../../src/services/detection/assistant-detection.service.js';
import { isImplemented } from '../../src/services/targets/target-layout.js';

describe('AssistantDetectionService', () => {
  let projectPath: string;
  const svc = new AssistantDetectionService();

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-detect-'));
  });
  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  const touch = (rel: string) => {
    const abs = path.join(projectPath, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  };
  const mkdir = (rel: string) => fs.mkdirSync(path.join(projectPath, rel), { recursive: true });
  const byTarget = (rows: Awaited<ReturnType<typeof svc.detectAssistants>>) =>
    Object.fromEntries(rows.map(r => [r.target, r]));

  it('recommends only Claude Code for a project with no assistant markers', async () => {
    const rows = byTarget(await svc.detectAssistants(projectPath));
    expect(rows['claude-code'].recommended).toBe(true);
    expect(rows['copilot'].recommended).toBe(false);
    expect(rows['cursor'].recommended).toBe(false);
    expect(rows['claude-code'].present).toBe(false);
  });

  it('detects and recommends the assistants actually present', async () => {
    mkdir('.cursor');
    touch('.github/copilot-instructions.md');
    const rows = byTarget(await svc.detectAssistants(projectPath));

    expect(rows['cursor'].present).toBe(true);
    expect(rows['cursor'].markers).toContain('.cursor');
    expect(rows['copilot'].present).toBe(true);
    expect(rows['copilot'].markers).toContain('.github/copilot-instructions.md');

    // Both present → both recommended; Claude Code (not present) is not.
    expect(rows['cursor'].recommended).toBe(true);
    expect(rows['copilot'].recommended).toBe(true);
    expect(rows['claude-code'].recommended).toBe(false);
  });

  it('recommends an already-installed target even without marker files', async () => {
    // A prior dev-suite install for Cursor, but its config was cleaned away.
    fs.writeFileSync(
      path.join(projectPath, '.dev-suite-manifest.json'),
      JSON.stringify({ targets: ['cursor'] })
    );
    const rows = byTarget(await svc.detectAssistants(projectPath));
    expect(rows['cursor'].present).toBe(false);
    expect(rows['cursor'].devSuiteInstalled).toBe(true);
    expect(rows['cursor'].recommended).toBe(true);
    // Claude Code is not installed and not present → not recommended.
    expect(rows['claude-code'].recommended).toBe(false);
  });

  it('never recommends a target without an adapter, even if detected', async () => {
    mkdir('.codex');
    const rows = byTarget(await svc.detectAssistants(projectPath));
    expect(rows['codex'].present).toBe(true);
    expect(rows['codex'].implemented).toBe(false);
    expect(rows['codex'].recommended).toBe(false);
  });

  it('does not treat the shared AGENTS.md as an assistant marker', async () => {
    touch('AGENTS.md');
    const rows = byTarget(await svc.detectAssistants(projectPath));
    // AGENTS.md alone tells us nothing about which assistant is in use.
    for (const r of Object.values(rows)) {
      expect(r.markers).not.toContain('AGENTS.md');
    }
    expect(rows['claude-code'].recommended).toBe(true); // fell back to default
  });

  it('marks implemented vs not-yet-supported targets correctly', async () => {
    const rows = byTarget(await svc.detectAssistants(projectPath));
    expect(rows['claude-code'].implemented).toBe(true);
    expect(rows['copilot'].implemented).toBe(true);
    expect(rows['cursor'].implemented).toBe(true);
    expect(rows['codex'].implemented).toBe(false);
    expect(rows['gemini'].implemented).toBe(false);
  });
});

describe('assistant marker / layout consistency', () => {
  it('anchors every implemented target to its own config dir or instructions file', () => {
    // Guards against markers drifting away from the layout — each implemented
    // target must be identifiable by something under its config directory or by
    // its instructions file (a bare `.github` is too weak to count for Copilot).
    for (const spec of __ASSISTANT_SPECS_FOR_TEST) {
      if (!isImplemented(spec.target)) continue;
      const layout = getTargetLayout(spec.target);
      const underConfig = spec.markers.some(
        m => layout.configDir && (m === layout.configDir || m.startsWith(`${layout.configDir}/`))
      );
      const isInstructions = spec.markers.includes(layout.instructionsFile);
      expect(underConfig || isInstructions).toBe(true);
    }
  });
});
