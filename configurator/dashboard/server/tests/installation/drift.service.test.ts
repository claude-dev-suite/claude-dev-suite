// SPDX-License-Identifier: MIT
/**
 * Drift detection.
 *
 * The invariants worth pinning down are the ones that decide whether anybody
 * will trust the report:
 *
 *  - An instruction file edited OUTSIDE the dev-suite markers is the user's own
 *    prose and must never be flagged; edited INSIDE them it must always be.
 *  - A manifest written before `sectionHash` existed must produce zero drift,
 *    not a wall of false alarms on the first run after an upgrade.
 *  - A CRLF/LF difference is not a change.
 *  - Content a human ratified is reported but never actionable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  scanDrift,
  readDriftDiff,
  computeSectionHash,
  clearDriftCache,
  DELETED_HASH,
} from '../../src/services/installation/drift.service.js';
import { calculateFileHash } from '../../src/services/installation/file-operations.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import type { ExtendedManifest, TrackedFile } from '../../src/types/index.js';

const START = '<!-- DEV-SUITE-CONFIG-START -->';
const END = '<!-- DEV-SUITE-CONFIG-END -->';

describe('scanDrift', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempDir('drift-');
    clearDriftCache();
  });
  afterEach(() => {
    cleanupTempDir(dir);
    clearDriftCache();
  });

  const write = (rel: string, content: string) => {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
  };

  const manifestOf = (files: TrackedFile[]): ExtendedManifest =>
    ({
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      projectPath: dir,
      agents: [],
      mcpServers: [],
      features: {},
      files,
      upgradeHistory: [],
    }) as unknown as ExtendedManifest;

  const agentsMd = (section: string, prose = '') =>
    `# Project\n${prose}\n${START}\n${section}\n${END}\n`;

  const entryFor = (report: ReturnType<typeof scanDrift>, rel: string) =>
    report.files.find(f => f.path === rel);

  it('flags an agent file an outside process modified', () => {
    const rel = '.claude/agents/typescript-expert.md';
    const original = '---\nname: typescript-expert\n---\nBody.\n';
    write(rel, original);
    const manifest = manifestOf([
      { path: rel, hash: calculateFileHash(original), type: 'agent' },
    ]);

    write(rel, original + '\nAn agent appended this.\n');
    clearDriftCache();

    const report = scanDrift(dir, manifest);
    expect(report.hasActionableDrift).toBe(true);
    expect(report.drifted.map(f => f.path)).toEqual([rel]);
    expect(entryFor(report, rel)?.status).toBe('drift-in-section');
    expect(entryFor(report, rel)?.scope).toBe('file');
  });

  it('reports nothing for an untouched file', () => {
    const rel = '.claude/agents/typescript-expert.md';
    const content = '---\nname: typescript-expert\n---\nBody.\n';
    write(rel, content);

    const report = scanDrift(dir, manifestOf([
      { path: rel, hash: calculateFileHash(content), type: 'agent' },
    ]));

    expect(report.hasActionableDrift).toBe(false);
    expect(entryFor(report, rel)?.status).toBe('unmodified');
  });

  it('ignores an edit OUTSIDE the dev-suite markers — that is the user\'s prose', () => {
    const rel = 'AGENTS.md';
    const section = '## Routing\n- typescript-expert';
    const original = agentsMd(section);
    write(rel, original);
    const manifest = manifestOf([
      {
        path: rel,
        hash: calculateFileHash(original),
        sectionHash: computeSectionHash(original) as string,
        type: 'generated',
      },
    ]);

    // The user adds their own notes around our section.
    write(rel, agentsMd(section, '\n## My notes\nRun the tests before pushing.\n'));
    clearDriftCache();

    const report = scanDrift(dir, manifest);
    expect(report.hasActionableDrift).toBe(false);
    expect(entryFor(report, rel)?.status).toBe('drift-outside-section');
  });

  it('flags an edit INSIDE the markers with managed-section scope', () => {
    const rel = 'AGENTS.md';
    const original = agentsMd('## Routing\n- typescript-expert');
    write(rel, original);
    const manifest = manifestOf([
      {
        path: rel,
        hash: calculateFileHash(original),
        sectionHash: computeSectionHash(original) as string,
        type: 'generated',
      },
    ]);

    write(rel, agentsMd('## Routing\n- typescript-expert\n- an agent added itself here'));
    clearDriftCache();

    const report = scanDrift(dir, manifest);
    expect(report.hasActionableDrift).toBe(true);
    const entry = entryFor(report, rel);
    expect(entry?.status).toBe('drift-in-section');
    expect(entry?.scope).toBe('managed-section');
  });

  it('raises no false positive when the manifest predates sectionHash', () => {
    const rel = 'AGENTS.md';
    const original = agentsMd('## Routing\n- typescript-expert');
    write(rel, original);
    // A pre-upgrade manifest: whole-file hash only, no sectionHash.
    const manifest = manifestOf([
      { path: rel, hash: calculateFileHash(original), type: 'generated' },
    ]);

    // Even a change inside the markers cannot be judged without a baseline.
    write(rel, agentsMd('## Routing\n- something else entirely'));
    clearDriftCache();

    const report = scanDrift(dir, manifest);
    expect(report.hasActionableDrift).toBe(false);
    expect(entryFor(report, rel)?.status).toBe('unknown-baseline');
    expect(report.counts.unknownBaseline).toBe(1);
  });

  it('reports ratified content without making it actionable', () => {
    const rel = '.claude/agents/typescript-expert.md';
    const original = 'canonical\n';
    const adopted = 'adopted by a human\n';
    write(rel, adopted);

    const report = scanDrift(dir, manifestOf([
      {
        path: rel,
        hash: calculateFileHash(original),
        acknowledgedHash: calculateFileHash(adopted),
        acknowledgedAt: '2026-02-02T00:00:00.000Z',
        type: 'agent',
      },
    ]));

    expect(report.hasActionableDrift).toBe(false);
    expect(report.acknowledged.map(f => f.path)).toEqual([rel]);
    const entry = entryFor(report, rel);
    expect(entry?.status).toBe('acknowledged');
    expect(entry?.acknowledged).toBe(true);
    expect(entry?.acknowledgedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('reports a tracked file that is gone as deleted', () => {
    const report = scanDrift(dir, manifestOf([
      { path: '.claude/agents/gone.md', hash: 'abc', type: 'agent' },
    ]));

    expect(report.deleted.map(f => f.path)).toEqual(['.claude/agents/gone.md']);
    expect(report.deleted[0].currentHash).toBe(DELETED_HASH);
    // Absence is not drift: nothing was rewritten, the file simply is not there.
    expect(report.hasActionableDrift).toBe(false);
  });

  it('does not treat a CRLF/LF difference as drift', () => {
    const rel = '.claude/agents/typescript-expert.md';
    const lf = '---\nname: typescript-expert\n---\nBody.\n';
    write(rel, lf);
    const manifest = manifestOf([{ path: rel, hash: calculateFileHash(lf), type: 'agent' }]);

    // A checkout with core.autocrlf=true, or an editor normalising the file.
    write(rel, lf.replace(/\n/g, '\r\n'));
    clearDriftCache();

    expect(scanDrift(dir, manifest).hasActionableDrift).toBe(false);

    // ...and the same in the other direction, for a manifest recorded on Windows.
    const crlf = lf.replace(/\n/g, '\r\n');
    write(rel, lf);
    clearDriftCache();
    expect(
      scanDrift(dir, manifestOf([{ path: rel, hash: calculateFileHash(crlf), type: 'agent' }]))
        .hasActionableDrift
    ).toBe(false);
  });

  it('is CRLF-insensitive inside the markers too', () => {
    const rel = 'AGENTS.md';
    const original = agentsMd('## Routing\n- typescript-expert');
    write(rel, original);
    const manifest = manifestOf([
      {
        path: rel,
        hash: calculateFileHash(original),
        sectionHash: computeSectionHash(original) as string,
        type: 'generated',
      },
    ]);

    write(rel, original.replace(/\n/g, '\r\n'));
    clearDriftCache();

    expect(scanDrift(dir, manifest).hasActionableDrift).toBe(false);
  });

  it('skips directory entries instead of calling them drift', () => {
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'react'), { recursive: true });
    const report = scanDrift(dir, manifestOf([
      { path: '.claude/skills/react', hash: '', type: 'skill' },
    ]));
    expect(report.hasActionableDrift).toBe(false);
    expect(report.counts.drifted).toBe(0);
  });

  it('refuses a manifest path that escapes the project', () => {
    const report = scanDrift(dir, manifestOf([
      { path: '../outside.md', hash: 'abc', type: 'agent' },
    ]));
    expect(report.files).toHaveLength(0);
  });

  it('returns an empty report when there is no manifest', () => {
    const report = scanDrift(dir, null);
    expect(report.hasManifest).toBe(false);
    expect(report.files).toHaveLength(0);
    expect(report.hasActionableDrift).toBe(false);
  });

  it('re-reads a file whose size changed even within the same mtime tick', () => {
    const rel = '.claude/agents/a.md';
    const original = 'one\n';
    write(rel, original);
    const manifest = manifestOf([{ path: rel, hash: calculateFileHash(original), type: 'agent' }]);
    expect(scanDrift(dir, manifest).hasActionableDrift).toBe(false);

    write(rel, 'one\ntwo\n');
    expect(scanDrift(dir, manifest).hasActionableDrift).toBe(true);
  });
});

describe('readDriftDiff', () => {
  let dir: string;
  let catalog: string;

  beforeEach(() => {
    dir = createTempDir('drift-diff-');
    catalog = createTempDir('drift-catalog-');
    process.env.DEV_SUITE_DIR = catalog;
    clearDriftCache();
  });
  afterEach(() => {
    cleanupTempDir(dir);
    cleanupTempDir(catalog);
    delete process.env.DEV_SUITE_DIR;
    clearDriftCache();
  });

  const manifestOf = (files: TrackedFile[]): ExtendedManifest =>
    ({
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      projectPath: dir,
      agents: [],
      mcpServers: [],
      features: {},
      files,
      upgradeHistory: [],
    }) as unknown as ExtendedManifest;

  it('regenerates the canonical side from the catalog source, not the manifest', () => {
    fs.mkdirSync(path.join(catalog, 'agents', 'core'), { recursive: true });
    fs.writeFileSync(path.join(catalog, 'agents', 'core', 'ts.md'), 'canonical body\n');

    const rel = '.claude/agents/ts.md';
    fs.mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, ...rel.split('/')), 'edited body\n');

    const diff = readDriftDiff(
      dir,
      manifestOf([
        { path: rel, hash: 'x', type: 'agent', source: path.join('agents', 'core', 'ts.md') },
      ]),
      rel
    );

    expect(diff.current).toBe('edited body\n');
    expect(diff.canonical).toBe('canonical body\n');
  });

  it('says why a generated file has no canonical side', () => {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'generated\n');
    const diff = readDriftDiff(
      dir,
      manifestOf([{ path: 'AGENTS.md', hash: 'x', type: 'generated' }]),
      'AGENTS.md'
    );
    expect(diff.canonical).toBeNull();
    expect(diff.canonicalUnavailableReason).toContain('No catalog source');
  });

  it('refuses a source path outside the dev-suite catalog', () => {
    const rel = '.claude/agents/ts.md';
    fs.mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, ...rel.split('/')), 'edited\n');

    const diff = readDriftDiff(
      dir,
      manifestOf([
        { path: rel, hash: 'x', type: 'agent', source: '../../../etc/passwd' },
      ]),
      rel
    );
    expect(diff.canonical).toBeNull();
  });
});

describe('files dev-suite merges into rather than owns', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('drift-merged-'); });
  afterEach(() => cleanupTempDir(dir));

  const manifestWith = (files: Array<Record<string, unknown>>) =>
    ({ files, targets: ['claude-code'] }) as never;

  it('never raises drift for an MCP config the user added a server to', () => {
    // The writers exist to preserve exactly this edit, so reporting it as drift
    // meant a clean project failed `--drift` with exit 4 and a Sync refused to
    // run without --yes.
    const rel = '.mcp.json';
    fs.writeFileSync(
      path.join(dir, rel),
      JSON.stringify({ mcpServers: { documentation: {}, 'my-own-server': {} } })
    );

    const report = scanDrift(dir, manifestWith([
      { path: rel, type: 'config', hash: 'whatever-we-wrote-last-time' },
    ]));

    expect(report.hasActionableDrift).toBe(false);
    expect(report.drifted).toHaveLength(0);
    const entry = report.files.find(e => e.path === rel);
    expect(entry?.scope).toBe('merged');
    expect(entry?.status).toBe('unknown-baseline');
  });

  it.each([
    '.claude/settings.json',
    '.codex/config.toml',
    '.gemini/settings.json',
    '.cursor/mcp.json',
    '.vscode/mcp.json',
    '.github/mcp.json',
    '.kimi-code/mcp.json',
  ])('treats %s the same way', rel => {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'user edited this\n');

    const report = scanDrift(dir, manifestWith([{ path: rel, type: 'config', hash: 'stale' }]));

    expect(report.files.find(e => e.path === rel)?.scope).toBe('merged');
    expect(report.hasActionableDrift).toBe(false);
  });

  it('still reports one that disappeared', () => {
    const report = scanDrift(dir, manifestWith([
      { path: '.mcp.json', type: 'config', hash: 'stale' },
    ]));

    const entry = report.files.find(e => e.path === '.mcp.json');
    expect(entry?.status).toBe('deleted');
    // Deleted is informational here too: the file is the user's as much as ours.
    expect(report.hasActionableDrift).toBe(false);
  });

  it('leaves a file dev-suite owns outright fully judged', () => {
    const rel = '.claude/agents/react-expert.md';
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'edited by an agent\n');

    const report = scanDrift(dir, manifestWith([
      { path: rel, type: 'agent', hash: 'what-we-wrote' },
    ]));

    expect(report.hasActionableDrift).toBe(true);
    expect(report.drifted.map(e => e.path)).toContain(rel);
  });
});

