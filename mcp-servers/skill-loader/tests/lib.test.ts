// SPDX-License-Identifier: MIT
/**
 * Unit tests for the skill-loader pure library.
 *
 * Tests run against a temp skills directory built fresh per `describe` so
 * each test sees a deterministic fixture without filesystem coupling.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildSkillIndex,
  checkSkillInvocable,
  firstSentence,
  loadQuickRefBody,
  loadSkillBody,
  parseFrontmatter,
  resolveSkillPath,
  resolveSkillsDir,
} from '../src/lib.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface FixtureSkill {
  /** Relative path under the fixture skills dir, e.g. "languages/kotlin" */
  path: string;
  /** Frontmatter to write (raw key:value pairs) */
  frontmatter: Record<string, string | boolean>;
  /** Markdown body (without frontmatter delimiters) */
  body?: string;
  /** Optional quick-ref files: filename (without .md) → content */
  quickRefs?: Record<string, string>;
}

function makeSkillsDir(skills: FixtureSkill[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-test-'));
  for (const skill of skills) {
    const dir = path.join(root, ...skill.path.split('/'));
    fs.mkdirSync(dir, { recursive: true });

    const fmLines = ['---'];
    for (const [k, v] of Object.entries(skill.frontmatter)) {
      fmLines.push(`${k}: ${v}`);
    }
    fmLines.push('---', '');
    const fullContent = fmLines.join('\n') + (skill.body ?? '# Skill body\n');
    fs.writeFileSync(path.join(dir, 'SKILL.md'), fullContent);

    if (skill.quickRefs) {
      const qrDir = path.join(dir, 'quick-ref');
      fs.mkdirSync(qrDir, { recursive: true });
      for (const [name, content] of Object.entries(skill.quickRefs)) {
        fs.writeFileSync(path.join(qrDir, `${name}.md`), content);
      }
    }
  }
  return root;
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('extracts simple key/value pairs', () => {
    const fm = parseFrontmatter(`---\nname: kotlin\ndescription: A skill\n---\nbody`);
    expect(fm.name).toBe('kotlin');
    expect(fm.description).toBe('A skill');
  });

  it('coerces boolean literals', () => {
    const fm = parseFrontmatter(
      `---\nname: ops-runbook\ndisable-model-invocation: true\nallow-other: false\n---\n`,
    );
    expect(fm['disable-model-invocation']).toBe(true);
    expect(fm['allow-other']).toBe(false);
  });

  it('handles multi-line literal blocks (`|`) with continuation', () => {
    const fm = parseFrontmatter(`---\nname: x\ndescription: |\n  Line one\n  Line two\n---\n`);
    expect(fm.description).toBe('Line one\nLine two');
  });

  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('# Just a body, no frontmatter\n')).toEqual({});
  });

  it('returns empty object on malformed (only opening ---)', () => {
    expect(parseFrontmatter('---\nname: x\nno closing\n')).toEqual({});
  });

  it('handles CRLF line endings (Windows-authored files)', () => {
    const fm = parseFrontmatter(`---\r\nname: kotlin\r\ndescription: A skill\r\n---\r\nbody`);
    expect(fm.name).toBe('kotlin');
    expect(fm.description).toBe('A skill');
  });

  it('disable-model-invocation defaults to absent (not false) when key missing', () => {
    const fm = parseFrontmatter(`---\nname: x\n---\n`);
    expect(fm['disable-model-invocation']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// firstSentence
// ---------------------------------------------------------------------------

describe('firstSentence', () => {
  it('returns the first line trimmed', () => {
    expect(firstSentence('Hello world\nMore text')).toBe('Hello world');
  });

  it('returns the whole text when no newline', () => {
    expect(firstSentence('  Single line  ')).toBe('Single line');
  });

  it('returns empty string for empty input', () => {
    expect(firstSentence('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveSkillPath
// ---------------------------------------------------------------------------

describe('resolveSkillPath', () => {
  let skillsDir: string;
  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
  });
  afterEach(() => cleanup(skillsDir));

  it('resolves a simple relative path inside the skills dir', () => {
    const resolved = resolveSkillPath('languages/kotlin', skillsDir);
    expect(resolved).toBe(path.resolve(skillsDir, 'languages', 'kotlin'));
  });

  it('rejects path traversal with ".."', () => {
    expect(() => resolveSkillPath('..', skillsDir)).toThrow(/path traversal/i);
    expect(() => resolveSkillPath('languages/../../etc', skillsDir)).toThrow(/path traversal/i);
    expect(() => resolveSkillPath('a/b/../..', skillsDir)).toThrow(/path traversal/i);
  });

  it('rejects absolute paths that escape the skills dir', () => {
    // path.resolve ignores skillsDir if the second arg is absolute, escaping
    const escape = process.platform === 'win32' ? 'C:\\Windows' : '/etc/passwd';
    expect(() => resolveSkillPath(escape, skillsDir)).toThrow(/escapes skills directory/);
  });

  it('returns skillsDir itself when given empty path (allowed)', () => {
    const resolved = resolveSkillPath('', skillsDir);
    expect(resolved).toBe(path.resolve(skillsDir));
  });
});

// ---------------------------------------------------------------------------
// buildSkillIndex
// ---------------------------------------------------------------------------

describe('buildSkillIndex', () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = makeSkillsDir([
      {
        path: 'languages/kotlin',
        frontmatter: { name: 'Kotlin', description: 'JVM language\nMore detail' },
      },
      {
        path: 'languages/typescript',
        frontmatter: { name: 'TypeScript', description: 'Typed JS' },
      },
      {
        path: 'frontend-frameworks/react',
        frontmatter: { name: 'React', description: 'UI library' },
      },
      {
        path: 'ops/release-checklist',
        frontmatter: {
          name: 'Release',
          description: 'Internal checklist',
          'disable-model-invocation': true,
        },
      },
    ]);
  });

  afterEach(() => cleanup(skillsDir));

  it('returns one entry per SKILL.md found', () => {
    const entries = buildSkillIndex(skillsDir);
    expect(entries).toHaveLength(4);
  });

  it('derives category from the top-level directory', () => {
    const entries = buildSkillIndex(skillsDir);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    expect(byPath.get('languages/kotlin')!.category).toBe('languages');
    expect(byPath.get('frontend-frameworks/react')!.category).toBe('frontend-frameworks');
    expect(byPath.get('ops/release-checklist')!.category).toBe('ops');
  });

  it('truncates description to first sentence (line)', () => {
    const entries = buildSkillIndex(skillsDir);
    const kotlin = entries.find((e) => e.path === 'languages/kotlin')!;
    expect(kotlin.description).toBe('JVM language');
  });

  it('marks disable-model-invocation skills', () => {
    const entries = buildSkillIndex(skillsDir);
    const release = entries.find((e) => e.path === 'ops/release-checklist')!;
    expect(release.disableModelInvocation).toBe(true);

    const kotlin = entries.find((e) => e.path === 'languages/kotlin')!;
    expect(kotlin.disableModelInvocation).toBe(false);
  });

  it('returns entries sorted by path', () => {
    const entries = buildSkillIndex(skillsDir);
    const paths = entries.map((e) => e.path);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it('falls back to directory name when frontmatter lacks `name`', () => {
    const noNameDir = path.join(skillsDir, 'misc', 'no-name-skill');
    fs.mkdirSync(noNameDir, { recursive: true });
    fs.writeFileSync(
      path.join(noNameDir, 'SKILL.md'),
      `---\ndescription: anonymous\n---\n# body`,
    );
    const entries = buildSkillIndex(skillsDir);
    const noName = entries.find((e) => e.path === 'misc/no-name-skill')!;
    expect(noName.name).toBe('no-name-skill');
  });

  it('returns empty array for an empty skills tree', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-skills-'));
    try {
      expect(buildSkillIndex(empty)).toEqual([]);
    } finally {
      cleanup(empty);
    }
  });

  it('skips files named other than SKILL.md', () => {
    fs.writeFileSync(
      path.join(skillsDir, 'languages', 'README.md'),
      '# not a skill\n',
    );
    const entries = buildSkillIndex(skillsDir);
    expect(entries).toHaveLength(4); // unchanged
  });
});

// ---------------------------------------------------------------------------
// checkSkillInvocable
// ---------------------------------------------------------------------------

describe('checkSkillInvocable', () => {
  it('does not throw for a regular skill', () => {
    expect(() =>
      checkSkillInvocable('---\nname: x\ndescription: y\n---\nbody', 'x'),
    ).not.toThrow();
  });

  it('throws for disable-model-invocation: true', () => {
    expect(() =>
      checkSkillInvocable(
        '---\nname: ops\ndisable-model-invocation: true\n---\nbody',
        'ops/release',
      ),
    ).toThrow(/disable-model-invocation: true/);
  });

  it('does not throw for disable-model-invocation: false', () => {
    expect(() =>
      checkSkillInvocable(
        '---\nname: x\ndisable-model-invocation: false\n---\n',
        'x',
      ),
    ).not.toThrow();
  });

  it('error message includes the skill path so the caller can debug', () => {
    expect(() =>
      checkSkillInvocable(
        '---\ndisable-model-invocation: true\n---\n',
        'rag-ops/cost-allocation',
      ),
    ).toThrow(/'rag-ops\/cost-allocation'/);
  });
});

// ---------------------------------------------------------------------------
// loadSkillBody
// ---------------------------------------------------------------------------

describe('loadSkillBody', () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = makeSkillsDir([
      {
        path: 'languages/kotlin',
        frontmatter: { name: 'Kotlin', description: 'JVM language' },
        body: '# Kotlin Skill\n\nA Kotlin skill body.\n',
      },
      {
        path: 'ops/release-runbook',
        frontmatter: {
          name: 'Release',
          description: 'Internal',
          'disable-model-invocation': true,
        },
        body: '# Release Runbook\n',
      },
    ]);
  });

  afterEach(() => cleanup(skillsDir));

  it('returns full SKILL.md content for a regular skill', () => {
    const content = loadSkillBody('languages/kotlin', skillsDir);
    expect(content).toContain('# Kotlin Skill');
    expect(content).toContain('A Kotlin skill body.');
    expect(content).toContain('name: Kotlin'); // frontmatter still in output
  });

  it('throws when SKILL.md is missing for the resolved path', () => {
    expect(() => loadSkillBody('languages/nonexistent', skillsDir)).toThrow(/Skill not found/);
  });

  it('throws when the skill has disable-model-invocation: true', () => {
    expect(() => loadSkillBody('ops/release-runbook', skillsDir)).toThrow(
      /disable-model-invocation: true/,
    );
  });

  it('rejects path traversal in skillPath', () => {
    expect(() => loadSkillBody('..', skillsDir)).toThrow(/path traversal/i);
    expect(() => loadSkillBody('languages/../../etc', skillsDir)).toThrow(/path traversal/i);
  });

  it('rejects absolute paths that escape', () => {
    const escape = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc';
    expect(() => loadSkillBody(escape, skillsDir)).toThrow(/escapes skills directory/);
  });
});

// ---------------------------------------------------------------------------
// loadQuickRefBody
// ---------------------------------------------------------------------------

describe('loadQuickRefBody', () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = makeSkillsDir([
      {
        path: 'languages/kotlin',
        frontmatter: { name: 'Kotlin', description: 'JVM language' },
        body: '# Kotlin\n',
        quickRefs: {
          basics: '# Basics\n\nKotlin basics content.',
          patterns: '# Patterns\n\nKotlin patterns content.',
        },
      },
    ]);
  });

  afterEach(() => cleanup(skillsDir));

  it('returns content for an existing quick-ref file', () => {
    const content = loadQuickRefBody('languages/kotlin', 'basics', skillsDir);
    expect(content).toContain('# Basics');
    expect(content).toContain('Kotlin basics content.');
  });

  it('throws for missing quick-ref file', () => {
    expect(() => loadQuickRefBody('languages/kotlin', 'advanced', skillsDir)).toThrow(
      /Quick-ref file not found/,
    );
  });

  it('rejects refs with forward slashes (path separator)', () => {
    expect(() => loadQuickRefBody('languages/kotlin', 'sub/basics', skillsDir)).toThrow(
      /path separators/,
    );
  });

  it('rejects refs with backslashes (Windows path separator)', () => {
    expect(() => loadQuickRefBody('languages/kotlin', 'sub\\basics', skillsDir)).toThrow(
      /path separators/,
    );
  });

  it('rejects refs with `..` traversal', () => {
    expect(() => loadQuickRefBody('languages/kotlin', '..', skillsDir)).toThrow(
      /path separators/,
    );
    expect(() => loadQuickRefBody('languages/kotlin', '..secret', skillsDir)).toThrow(
      /path separators/,
    );
  });

  it('rejects empty ref', () => {
    expect(() => loadQuickRefBody('languages/kotlin', '', skillsDir)).toThrow(/non-empty string/);
    expect(() => loadQuickRefBody('languages/kotlin', '   ', skillsDir)).toThrow(/non-empty string/);
  });

  it('rejects skillPath traversal even when ref is clean', () => {
    expect(() => loadQuickRefBody('..', 'basics', skillsDir)).toThrow(/path traversal/i);
  });
});

// ---------------------------------------------------------------------------
// resolveSkillsDir — chooses between DEV_SUITE_ROOT env override and the
// self-bundled fallback. This is the bridge that lets the skill-loader run
// without configuration in production (Electron + per-project installs).
// ---------------------------------------------------------------------------

describe('resolveSkillsDir', () => {
  let pkgDir: string;

  beforeEach(() => {
    pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-pkg-'));
  });
  afterEach(() => cleanup(pkgDir));

  it('falls back to <packageDir>/skills/ when DEV_SUITE_ROOT is unset', () => {
    fs.mkdirSync(path.join(pkgDir, 'skills'), { recursive: true });
    const r = resolveSkillsDir({}, pkgDir);
    expect(r.source).toBe('bundled');
    expect(r.skillsDir).toBe(path.resolve(pkgDir, 'skills'));
  });

  it('treats empty / whitespace DEV_SUITE_ROOT as unset', () => {
    fs.mkdirSync(path.join(pkgDir, 'skills'), { recursive: true });
    expect(resolveSkillsDir({ DEV_SUITE_ROOT: '' }, pkgDir).source).toBe('bundled');
    expect(resolveSkillsDir({ DEV_SUITE_ROOT: '   ' }, pkgDir).source).toBe('bundled');
  });

  it('uses DEV_SUITE_ROOT/skills when set and present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-root-'));
    fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
    try {
      const r = resolveSkillsDir({ DEV_SUITE_ROOT: root }, pkgDir);
      expect(r.source).toBe('env');
      expect(r.skillsDir).toBe(path.resolve(root, 'skills'));
    } finally {
      cleanup(root);
    }
  });

  it('throws when DEV_SUITE_ROOT is set but skills/ subdir does not exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-root-'));
    try {
      expect(() => resolveSkillsDir({ DEV_SUITE_ROOT: root }, pkgDir)).toThrow(
        /does not exist/,
      );
    } finally {
      cleanup(root);
    }
  });

  it('throws a helpful error when neither env nor bundled copy is available', () => {
    expect(() => resolveSkillsDir({}, pkgDir)).toThrow(/prebuild step skipped/);
  });

  it('env override wins over a bundled copy when both are present', () => {
    fs.mkdirSync(path.join(pkgDir, 'skills'), { recursive: true });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-root-'));
    fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
    try {
      const r = resolveSkillsDir({ DEV_SUITE_ROOT: root }, pkgDir);
      expect(r.source).toBe('env');
      expect(r.skillsDir).toBe(path.resolve(root, 'skills'));
    } finally {
      cleanup(root);
    }
  });
});
