// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { analyzeImportGraph } from '../src/tools/import-graph.js';
import { runParse } from '../src/analysis/pipeline.js';
import { buildGraph, stronglyConnected } from '../src/analysis/graph.js';
import { checkBoundaries } from '../src/analysis/boundaries.js';
import { relPath } from '../src/core/paths.js';
import { makeFixture } from './helpers.js';

let cleanup = () => {};
afterEach(() => cleanup());

async function edges(dir: string): Promise<string[]> {
  const run = await runParse({ path: dir }, { modules: true, magicNumbers: false });
  const g = buildGraph(run.parsed, run.scope.root);
  const out: string[] = [];
  for (const list of g.out.values()) for (const e of list) out.push(`${relPath(run.scope.root, e.from)} -> ${relPath(run.scope.root, e.to)}`);
  return out.sort();
}

describe('JS/TS resolution', () => {
  it('maps ESM ./x.js specifiers to .ts sources, resolves index files, tsconfig paths (with extends) and workspace exports', async () => {
    const fx = makeFixture({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } } }),
      'tsconfig.json': '// comments are allowed\n{ "extends": "./tsconfig.base.json", }',
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'src/main.ts': "import { a } from './a.js';\nimport { u } from './util';\nimport { c } from '@app/deep/c';\nimport { lib } from '@acme/lib';\nimport fs from 'node:fs';\nimport React from 'react';\nexport const x = [a, u, c, lib, fs, React];\n",
      'src/a.ts': "export const a = 1;\n",
      'src/util/index.ts': "export const u = 2;\n",
      'src/deep/c.ts': "export const c = 3;\n",
      'packages/lib/package.json': JSON.stringify({ name: '@acme/lib', exports: { '.': { import: './dist/index.js' } } }),
      'packages/lib/src/index.ts': "export const lib = 4;\n",
    });
    cleanup = fx.cleanup;
    expect(await edges(fx.dir)).toEqual([
      'src/main.ts -> packages/lib/src/index.ts',
      'src/main.ts -> src/a.ts',
      'src/main.ts -> src/deep/c.ts',
      'src/main.ts -> src/util/index.ts',
    ]);
    const r = await analyzeImportGraph({ path: fx.dir, format: undefined } as never);
    const data = r.data as { summary: { unresolvedImports: number; externalPackages: number } };
    expect(data.summary.unresolvedImports).toBe(0);
    expect(data.summary.externalPackages).toBe(1); // react; node:fs is a builtin
  });
});

describe('other languages', () => {
  it('Python absolute, relative and submodule imports', async () => {
    const fx = makeFixture({
      'app/__init__.py': '',
      'app/main.py': 'from .models import User\nfrom app import services\nimport app.utils.text as t\nimport requests\n',
      'app/models.py': 'class User: pass\n',
      'app/services.py': 'x = 1\n',
      'app/utils/__init__.py': '',
      'app/utils/text.py': 'def f(): pass\n',
    });
    cleanup = fx.cleanup;
    expect(await edges(fx.dir)).toEqual([
      'app/main.py -> app/__init__.py',
      'app/main.py -> app/models.py',
      'app/main.py -> app/services.py',
      'app/main.py -> app/utils/text.py',
    ]);
  });

  it('Go module packages, Java imports, Rust mod/use', async () => {
    const fx = makeFixture({
      'go.mod': 'module example.com/demo\n\ngo 1.22\n',
      'cmd/main.go': 'package main\nimport (\n  "fmt"\n  "example.com/demo/internal/store"\n)\nfunc main() { fmt.Println(store.X) }\n',
      'internal/store/store.go': 'package store\nvar X = 1\n',
      'java/src/main/java/com/acme/App.java': 'package com.acme;\nimport com.acme.util.Strings;\nimport java.util.List;\npublic class App {}\n',
      'java/src/main/java/com/acme/util/Strings.java': 'package com.acme.util;\npublic class Strings {}\n',
      'rs/Cargo.toml': '[package]\nname = "demo"\n',
      'rs/src/main.rs': 'mod net;\nuse crate::net::client::Client;\nfn main() {}\n',
      'rs/src/net/mod.rs': 'pub mod client;\n',
      'rs/src/net/client.rs': 'pub struct Client;\n',
    });
    cleanup = fx.cleanup;
    const e = await edges(fx.dir);
    expect(e).toContain('cmd/main.go -> internal/store/store.go');
    expect(e).toContain('java/src/main/java/com/acme/App.java -> java/src/main/java/com/acme/util/Strings.java');
    expect(e).toContain('rs/src/main.rs -> rs/src/net/mod.rs');
    expect(e).toContain('rs/src/main.rs -> rs/src/net/client.rs');
    expect(e).toContain('rs/src/net/mod.rs -> rs/src/net/client.rs');
  });
});

describe('cycles and rules', () => {
  it('finds cycles (ignoring type-only imports on request) and reports them repo-relative', async () => {
    const fx = makeFixture({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': "import { c } from './c';\nexport const b = c;\n",
      'src/c.ts': "import type { A } from './a';\nexport const c = 1;\nexport type C = A;\n",
    });
    cleanup = fx.cleanup;
    const run = await runParse({ path: fx.dir }, { modules: true });
    const g = buildGraph(run.parsed, run.scope.root);
    expect(stronglyConnected(g)).toHaveLength(1);
    expect(stronglyConnected(g, { ignoreTypeOnly: true })).toHaveLength(0);
    const r = await analyzeImportGraph({ path: fx.dir });
    expect(r.markdown).toContain('src/a.ts → src/b.ts → src/c.ts → src/a.ts');
  });

  it('checks forbidden/allowed rules with $1 back-references and external packages', () => {
    const deps = [
      { from: 'src/features/cart/ui.ts', to: 'src/features/cart/model.ts', external: false, circular: false, typeOnly: false, line: 1 },
      { from: 'src/features/cart/ui.ts', to: 'src/features/user/model.ts', external: false, circular: false, typeOnly: false, line: 2 },
      { from: 'src/domain/order.ts', to: 'react', external: true, circular: false, typeOnly: false, line: 3 },
    ];
    const v = checkBoundaries(
      {
        forbidden: [
          { name: 'no-cross-feature', from: { path: '^src/features/([^/]+)/' }, to: { path: '^src/features/', pathNot: '^src/features/$1/' } },
          { name: 'domain-is-pure', severity: 'warn', from: { path: '^src/domain/' }, to: { external: true } },
        ],
      },
      deps
    );
    expect(v.map((x) => [x.rule, x.from, x.to, x.severity])).toEqual([
      ['no-cross-feature', 'src/features/cart/ui.ts', 'src/features/user/model.ts', 'error'],
      ['domain-is-pure', 'src/domain/order.ts', 'react', 'warning'],
    ]);
    const allowed = checkBoundaries({ allowed: [{ name: 'same-feature', from: { path: '^src/features/([^/]+)/' }, to: { path: '^src/features/$1/' } }] }, deps);
    expect(allowed.map((x) => x.to)).toEqual(['src/features/user/model.ts']); // externals unchecked: no allowed rule covers them
  });

  it('rejects an invalid rule regex with a clear error', () => {
    expect(() => checkBoundaries({ forbidden: [{ name: 'bad', from: { path: '([' } }] }, [])).toThrow(/invalid regular expression/);
  });
});
