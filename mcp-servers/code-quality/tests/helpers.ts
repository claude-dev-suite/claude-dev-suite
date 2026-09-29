// SPDX-License-Identifier: MIT
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

/** Create a throw-away project from a { 'rel/path': 'content' } map. */
export function makeFixture(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'cq-fixture-')));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const hasGit = spawnSync('git', ['--version']).status === 0;

export function git(dir: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export function onPath(bin: string): boolean {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf-8' });
  return r.status === 0;
}
