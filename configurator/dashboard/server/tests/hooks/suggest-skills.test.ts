/**
 * The skill-suggestion hook, executed.
 *
 * It exists because the extended skill tier depends on a model choosing, unprompted,
 * to notice a gap and then to guess a search term. This hook is the one place code
 * sees the task text first, so it does the match and hands over the answer.
 *
 * Every assertion here runs the real script against a real `PreToolUse` payload,
 * which is the only way to catch what this file's siblings were written for: a
 * payload contract that does not match what Claude Code sends. Two rules matter
 * more than the matching quality — it must print JSON and nothing else, and it
 * must never make a delegation fail. Both are asserted on the malformed inputs
 * as well as the good ones.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'
);
const SCRIPT = path.join(repoRoot, 'templates', 'hooks', 'suggest-skills.mjs');

/** Vitest injects its own loader through NODE_OPTIONS; a hook subprocess gets none. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  return env;
}

describe('suggest-skills.mjs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('suggest-skills-');
  });
  afterEach(() => cleanupTempDir(tempDir));

  /** The bundled catalog the server serves from, as install lays it out. */
  function seedCatalog(skills: Record<string, string>): void {
    for (const [skillPath, description] of Object.entries(skills)) {
      const [category, name] = skillPath.split('/');
      const dir = path.join(tempDir, '.mcp-servers', 'skill-loader', 'skills', category!, name!);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: |\n  ${description}\n---\n\n# ${name}\n\nBody.\n`
      );
    }
  }

  function preload(flatName: string): void {
    fs.mkdirSync(path.join(tempDir, '.claude', 'skills', flatName), { recursive: true });
  }

  function run(payload: unknown) {
    const proc = spawnSync(process.execPath, [SCRIPT], {
      input: JSON.stringify(payload),
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });
    return proc;
  }

  function task(toolInput: unknown, toolName = 'Task') {
    return run({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, cwd: tempDir });
  }

  function parse(stdout: string) {
    return JSON.parse(stdout) as {
      hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
      updatedInput?: Record<string, unknown>;
    };
  }

  describe('a delegation it can help with', () => {
    beforeEach(() => {
      seedCatalog({
        'state-management/zustand': 'Zustand store patterns. USE WHEN: user mentions "zustand", "store", "global state"',
        'frontend-frameworks/react': 'React components and hooks. USE WHEN: "useState", "useEffect", "JSX"',
        'industrial/membrane-nf': 'Nanofiltration membrane sizing and fouling.',
      });
    });

    it('names the skill that matches the task', () => {
      const out = parse(
        task({ prompt: 'Migrate the zustand store to a slice pattern and keep the devtools middleware' }).stdout
      );

      expect(out.hookSpecificOutput?.additionalContext).toContain('state-management/zustand');
      expect(out.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    });

    it('does not name a skill with nothing to do with the task', () => {
      const out = parse(task({ prompt: 'Migrate the zustand store to a slice pattern' }).stdout);

      expect(out.hookSpecificOutput?.additionalContext).not.toContain('membrane-nf');
    });

    it('appends to the subagent prompt without replacing it', () => {
      const original = 'Migrate the zustand store to a slice pattern';
      const out = parse(task({ prompt: original, subagent_type: 'react-expert' }).stdout);

      expect(out.updatedInput?.prompt).toContain(original);
      expect(out.updatedInput?.prompt).toContain('state-management/zustand');
      // Every other key survives: this rewrites one field, it does not rebuild
      // the call.
      expect(out.updatedInput?.subagent_type).toBe('react-expert');
    });

    it('says the match was by keyword, so a bad suggestion can be ignored', () => {
      const out = parse(task({ prompt: 'Migrate the zustand store to a slice pattern' }).stdout);

      expect(out.hookSpecificOutput?.additionalContext).toMatch(/ignore any that do not fit/i);
    });

    it('stays silent about skills already on disk', () => {
      // The core tier is already in the agent's context; naming it is noise.
      preload('state-management-zustand');
      const out = parse(task({ prompt: 'Migrate the zustand store to a slice pattern' }).stdout);

      expect(out.hookSpecificOutput).toBeUndefined();
    });

    it('does not append twice if it sees its own note come back', () => {
      const first = parse(task({ prompt: 'Migrate the zustand store to a slice pattern' }).stdout);
      const second = parse(task({ prompt: first.updatedInput?.prompt }).stdout);

      expect(second.hookSpecificOutput).toBeUndefined();
      expect(second.updatedInput).toBeUndefined();
    });
  });

  describe('when it has nothing to say', () => {
    beforeEach(() => {
      seedCatalog({ 'industrial/membrane-nf': 'Nanofiltration membrane sizing and fouling.' });
    });

    it('is silent on a single weak keyword rather than guessing', () => {
      // One token in common across hundreds of skills is noise. A suggestion
      // the agent then loads and finds useless is worse than none.
      const out = parse(task({ prompt: 'Rename the membrane variable in the UI' }).stdout);
      expect(out).toEqual({});
    });

    it('ignores every tool that is not Task', () => {
      const out = parse(task({ prompt: 'zustand membrane fouling' }, 'Bash').stdout);
      expect(out).toEqual({});
    });

    it('says nothing when the catalog is not installed', () => {
      cleanupTempDir(tempDir);
      tempDir = createTempDir('suggest-skills-empty-');
      const out = parse(task({ prompt: 'Migrate the zustand store' }).stdout);
      expect(out).toEqual({});
    });
  });

  describe('it cannot break a delegation', () => {
    const bad: Array<[string, unknown]> = [
      ['no tool_input at all', { hook_event_name: 'PreToolUse', tool_name: 'Task' }],
      ['tool_input as a string', { tool_name: 'Task', tool_input: 'just text' }],
      ['tool_input as an array', { tool_name: 'Task', tool_input: ['a', 'b'] }],
      ['tool_input nested deeply', { tool_name: 'Task', tool_input: { a: { b: { c: { d: 'zustand' } } } } }],
      ['a null payload', null],
      ['an empty object', {}],
    ];

    it.each(bad)('exits 0 and prints JSON for %s', (_label, payload) => {
      const proc = run(payload);

      expect(proc.status).toBe(0);
      expect(() => JSON.parse(proc.stdout)).not.toThrow();
    });

    it('exits 0 and prints JSON on input that is not JSON', () => {
      const proc = spawnSync(process.execPath, [SCRIPT], {
        input: 'not json at all',
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      });

      expect(proc.status).toBe(0);
      expect(JSON.parse(proc.stdout)).toEqual({});
    });

    it('exits 0 and prints JSON on empty stdin', () => {
      const proc = spawnSync(process.execPath, [SCRIPT], {
        input: '',
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      });

      expect(proc.status).toBe(0);
      expect(JSON.parse(proc.stdout)).toEqual({});
    });

    it('writes nothing to stdout but the JSON object', () => {
      // A Gemini hook that prints a stray line degrades to "Allow"; Claude Code
      // parses stdout the same way. Anything else here is a parse failure.
      seedCatalog({ 'state-management/zustand': 'Zustand store patterns for global state' });
      const proc = task({ prompt: 'Refactor the zustand store for global state' });

      expect(proc.stdout.trimEnd()).toBe(proc.stdout.trim());
      expect(proc.stdout.trim().startsWith('{')).toBe(true);
      expect(proc.stdout.trim().endsWith('}')).toBe(true);
    });
  });

  describe('a catalog nested deeper than two levels', () => {
    it('finds a skill under <category>/<area>/<name>', () => {
      // A quarter of the real catalog lives here — every bitcoin skill is
      // `bitcoin/<area>/<name>` — and the server's own index walks the whole
      // tree. A two-level scan suggested from 74% of what `load_skill` can
      // actually serve, and the gap was invisible: a miss looks like "nothing
      // matched".
      const dir = path.join(
        tempDir, '.mcp-servers', 'skill-loader', 'skills', 'bitcoin', 'lightning', 'channels'
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        '---\nname: channels\ndescription: |\n  Lightning channel lifecycle and liquidity management\n---\n\n# Channels\n'
      );

      const out = parse(task({ prompt: 'Rebalance the lightning channel liquidity' }).stdout);
      expect(out.hookSpecificOutput?.additionalContext).toContain('bitcoin/lightning/channels');
    });

    it('does not suggest a nested skill that is already installed', () => {
      // The installed directory is the path flattened with every separator
      // replaced, not just the first.
      const dir = path.join(
        tempDir, '.mcp-servers', 'skill-loader', 'skills', 'bitcoin', 'lightning', 'channels'
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        '---\nname: channels\ndescription: |\n  Lightning channel lifecycle and liquidity management\n---\n'
      );
      preload('bitcoin-lightning-channels');

      const out = parse(task({ prompt: 'Rebalance the lightning channel liquidity' }).stdout);
      expect(out).toEqual({});
    });
  });

  describe('a skill whose frontmatter is not a block scalar', () => {
    it('is still matched', () => {
      const dir = path.join(tempDir, '.mcp-servers', 'skill-loader', 'skills', 'languages', 'kotlin');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        '---\nname: kotlin\ndescription: Kotlin coroutines and flow patterns\n---\n\n# Kotlin\n'
      );

      const out = parse(task({ prompt: 'Rewrite the coroutines in this kotlin module to use flow' }).stdout);
      expect(out.hookSpecificOutput?.additionalContext).toContain('languages/kotlin');
    });
  });
});
