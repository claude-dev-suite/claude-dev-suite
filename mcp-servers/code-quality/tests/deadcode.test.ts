// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { collectDeadCode } from '../src/tools/deadcode.js';
import { makeFixture } from './helpers.js';

let cleanup = () => {};
afterEach(() => cleanup());

const names = (items: Array<{ kind: string; name: string }>) => items.map((i) => `${i.kind}:${i.name}`).sort();

describe('find_dead_code', () => {
  it('JS/TS: unused files, exports (through named and star re-exports), unused and unlisted dependencies', async () => {
    const fx = makeFixture({
      'package.json': JSON.stringify({
        name: 'app',
        main: 'dist/index.js',
        scripts: { lint: 'eslint .' },
        dependencies: { lodash: '1', 'left-pad': '1' },
        devDependencies: { eslint: '9', '@types/node': '20' },
      }),
      'src/index.ts': "import { used, viaStar } from './barrel.js';\nimport chalk from 'chalk';\nimport _ from 'lodash';\nexport const main = () => [used, viaStar, chalk, _];\n",
      'src/barrel.ts': "export { used, unusedReexport } from './lib.js';\nexport * from './star.js';\n",
      'src/lib.ts': 'export const used = 1;\nexport const unusedReexport = 2;\nexport function neverImported() { return 3; }\n',
      'src/star.ts': 'export const viaStar = 1;\nexport const starUnused = 2;\n',
      'src/orphan.ts': 'export const nobody = 1;\n',
      'src/local.ts': 'export const onlyLocal = 1;\nexport const y = onlyLocal + 1;\n',
    });
    cleanup = fx.cleanup;
    const r = await collectDeadCode({ path: fx.dir, confidence: 'low' });
    const got = names(r.items);
    expect(got).toContain('file:src/orphan.ts');
    expect(got).toContain('file:src/local.ts');
    expect(got).toContain('export:unusedReexport');
    expect(got).toContain('export:neverImported');
    expect(got).toContain('export:starUnused');
    expect(got).not.toContain('export:used');
    expect(got).not.toContain('export:viaStar');
    expect(got).not.toContain('export:main'); // entry file exports are public API
    expect(got).toContain('dependency:left-pad');
    expect(got).not.toContain('dependency:lodash');
    expect(got).not.toContain('dependency:eslint'); // used by a script
    expect(got).not.toContain('dependency:@types/node');
    expect(got).toContain('unlisted:chalk');
  });

  it('Python: a function used from another module is not dead (Windows-path regression), unused ones are', async () => {
    // The old analyzers keyed definitions as `${filePath}:${name}` and took
    // split(':')[1] — on Windows that is the path, so every function was "dead".
    const fx = makeFixture({
      'pkg/__init__.py': '',
      'pkg/helpers.py': 'import os\nimport sys\n\ndef helper():\n    return sys.argv\n\ndef orphan_fn():\n    return 1\n\ndef _private():\n    return 2\n',
      'main.py': 'from pkg.helpers import helper\n\nif __name__ == "__main__":\n    helper()\n',
    });
    cleanup = fx.cleanup;
    const r = await collectDeadCode({ path: fx.dir, confidence: 'low' });
    const got = names(r.items);
    expect(got).toContain('definition:orphan_fn');
    expect(got).toContain('import:os');
    expect(got).not.toContain('definition:helper');
    expect(got).not.toContain('import:sys');
    expect(r.items.every((i) => !i.file.includes(':') && !i.file.includes('\\'))).toBe(true);
  });

  it('Go/Java/Rust/C#: private functions never referenced', async () => {
    const fx = makeFixture({
      'go/a.go': 'package a\nfunc Exported() int { return used() }\nfunc used() int { return 1 }\nfunc unused() int { return 2 }\n',
      'go/b.go': 'package a\nfunc other() int { return used() }\nvar _ = other\n',
      'java/A.java': 'class A { public int run() { return helper(); } private int helper() { return 1; } private int dead() { return 2; } }\n',
      'rs/Cargo.toml': '[package]\nname="x"\n',
      'rs/src/lib.rs': 'pub fn api() -> i32 { inner() }\nfn inner() -> i32 { 1 }\nfn dead() -> i32 { 2 }\nimpl std::fmt::Display for S { fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { Ok(()) } }\n',
      'cs/C.cs': 'class C { public int Run() => Helper(); private int Helper() { return 1; } private int Dead() { return 2; } }\n',
    });
    cleanup = fx.cleanup;
    const r = await collectDeadCode({ path: fx.dir, confidence: 'low', kinds: ['function'] });
    expect(r.items.map((i) => `${i.file}:${i.name}`).sort()).toEqual(['cs/C.cs:C.Dead', 'go/a.go:unused', 'java/A.java:A.dead', 'rs/src/lib.rs:dead']);
  });

  it('diff mode reports only changed files', async () => {
    const fx = makeFixture({
      'pkg/__init__.py': '',
      'pkg/a.py': 'def dead_a():\n    return 1\n',
      'pkg/b.py': 'def dead_b():\n    return 1\n',
    });
    cleanup = fx.cleanup;
    await expect(collectDeadCode({ path: fx.dir, changedSince: 'HEAD' })).rejects.toThrow(/git work tree/);
  });
});
