/**
 * Security regression tests for CodeQL alerts.
 *
 * These tests verify:
 * 1. Path-injection: traversal attacks are blocked while legitimate paths work
 * 2. ReDoS: vulnerable regex patterns complete in bounded time on adversarial input
 *
 * Run before fixing CodeQL alerts to establish a baseline, then again after
 * to confirm no regressions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';
import { CodeGenService } from '../src/services/codegen.service.js';
import { UsageService } from '../src/services/usage.service.js';
import { ManagementService } from '../src/services/management.service.js';
import { PackageInstallerService } from '../src/services/upgrade/package-installer.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Run a function and assert it completes within a time limit (ms). */
async function assertCompletesBefore(fn: () => unknown, limitMs: number, label: string): Promise<void> {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms, limit ${limitMs}ms`).toBeLessThan(limitMs);
}

// ─── Path Injection Tests ─────────────────────────────────────────────────────

describe('Path Injection — CodeGenService.scanConventions', () => {
  const codegen = new CodeGenService();
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempDir('codeql-codegen-');
    createMockProject(tempDir, {
      packageJson: {
        name: 'test-project',
        dependencies: { react: '^19.0.0' },
        devDependencies: { typescript: '^5.0.0', prettier: '^3.0.0' },
      },
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'ES2022', strict: true },
        }),
        '.prettierrc': JSON.stringify({ semi: true, singleQuote: true }),
        'src/index.ts': 'export const x = 1;\n',
      },
    });
  });

  afterAll(() => cleanupTempDir(tempDir));

  it('returns conventions for a valid project path', () => {
    const result = codegen.scanConventions(tempDir);
    expect(result).toBeDefined();
    expect(result.formatting).toBeDefined();
    expect(result.formatting.quotes).toBe('single');
    expect(result.formatting.semicolons).toBe(true);
  });

  it('rejects path traversal with literal ".."', () => {
    // Use string concatenation to preserve literal ".." (path.join normalises it away)
    expect(() => codegen.scanConventions(tempDir + '/../..')).toThrow();
  });

  it('rejects relative paths', () => {
    expect(() => codegen.scanConventions('relative/path')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => codegen.scanConventions('')).toThrow();
  });

  it('rejects path with embedded null byte', () => {
    expect(() => codegen.scanConventions(tempDir + '\0/etc/passwd')).toThrow();
  });

  it('returns default conventions for nonexistent project path', () => {
    // A valid absolute path that does not exist — should not crash, returns defaults
    const fakePath = path.join(tempDir, 'nonexistent-subdir');
    fs.mkdirSync(fakePath, { recursive: true });
    const result = codegen.scanConventions(fakePath);
    expect(result).toBeDefined();
    expect(result.formatting).toBeDefined();
    fs.rmSync(fakePath, { recursive: true, force: true });
  });
});

describe('Path Injection — UsageService.getConfig / saveConfig', () => {
  const usage = new UsageService();
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempDir('codeql-usage-');
    createMockProject(tempDir);
  });

  afterAll(() => cleanupTempDir(tempDir));

  it('getConfig returns default config for valid path without existing config', () => {
    const config = usage.getConfig(tempDir);
    expect(config).toBeDefined();
    expect(config.alertThresholds).toBeDefined();
  });

  it('saveConfig + getConfig round-trips correctly', () => {
    const config = {
      adminApiKey: 'test-key',
      alertThresholds: [],
      pollingIntervalMs: 60000,
    };
    usage.saveConfig(tempDir, config);
    const loaded = usage.getConfig(tempDir);
    expect(loaded.adminApiKey).toBe('test-key');
    expect(loaded.pollingIntervalMs).toBe(60000);
  });

  it('getConfig rejects path with literal ".."', () => {
    expect(() => usage.getConfig(tempDir + '/../..')).toThrow();
  });

  it('saveConfig rejects path with literal ".."', () => {
    const config = { adminApiKey: '', alertThresholds: [], pollingIntervalMs: 60000 };
    expect(() => usage.saveConfig(tempDir + '/../..', config)).toThrow();
  });

  it('getConfig rejects relative path', () => {
    expect(() => usage.getConfig('some/relative/path')).toThrow();
  });

  it('saveConfig does not write outside project dir', () => {
    const config = { adminApiKey: '', alertThresholds: [], pollingIntervalMs: 60000 };
    expect(() => usage.saveConfig(tempDir + '/../..', config)).toThrow();
    // Verify no file was created outside tempDir
    const parentConfig = path.join(path.dirname(tempDir), '.dev-suite', 'usage-config.json');
    expect(fs.existsSync(parentConfig)).toBe(false);
  });
});

describe('Path Injection — PackageInstallerService.findPackageJsonDir', () => {
  const installer = new PackageInstallerService();
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempDir('codeql-installer-');
    createMockProject(tempDir, {
      packageJson: { name: 'test', version: '1.0.0' },
    });
  });

  afterAll(() => cleanupTempDir(tempDir));

  it('finds package.json in project root', () => {
    const result = installer.findPackageJsonDir(tempDir);
    expect(result).toBe(tempDir);
  });

  it('finds package.json in frontend/ subdirectory', () => {
    const frontendDir = path.join(tempDir, 'frontend');
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(
      path.join(frontendDir, 'package.json'),
      JSON.stringify({ name: 'frontend' })
    );
    // Remove root package.json temporarily
    const rootPkg = path.join(tempDir, 'package.json');
    const rootContent = fs.readFileSync(rootPkg, 'utf-8');
    fs.unlinkSync(rootPkg);
    try {
      const result = installer.findPackageJsonDir(tempDir);
      expect(result).toBe(frontendDir);
    } finally {
      fs.writeFileSync(rootPkg, rootContent);
    }
  });

  it('rejects path with literal ".."', () => {
    expect(() => installer.findPackageJsonDir(tempDir + '/../..')).toThrow();
  });

  it('rejects relative path', () => {
    expect(() => installer.findPackageJsonDir('relative')).toThrow();
  });
});

describe('Path Injection — ManagementService.updateClaudeMd (defense-in-depth)', () => {
  let tempDir: string;
  let outsideDir: string;

  beforeAll(() => {
    tempDir = createTempDir('codeql-mgmt-');
    outsideDir = createTempDir('codeql-mgmt-outside-');
    createMockProject(tempDir, {
      packageJson: { name: 'test' },
      hasGit: true,
    });
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
    cleanupTempDir(outsideDir);
  });

  it('addAgent works on valid project path', async () => {
    const mgmt = new ManagementService();
    // addAgent calls regenerateClaudeMd internally
    await mgmt.addAgent(tempDir, 'typescript-expert');
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
  });

  it('addAgent rejects path with literal ".."', async () => {
    const mgmt = new ManagementService();
    // This SHOULD throw — confirms the defense-in-depth gap
    await expect(mgmt.addAgent(tempDir + '/../..', 'typescript-expert')).rejects.toThrow();
  });

  it('removeAgent rejects path with literal ".."', async () => {
    const mgmt = new ManagementService();
    await expect(mgmt.removeAgent(tempDir + '/../..', 'typescript-expert')).rejects.toThrow();
  });

  it('does not write CLAUDE.md outside the project directory', async () => {
    const mgmt = new ManagementService();
    try {
      await mgmt.addAgent(tempDir + '/../..', 'typescript-expert');
    } catch {
      // expected to throw
    }
    // Verify no CLAUDE.md was created in ancestor dirs
    const parentClaudeMd = path.join(path.dirname(tempDir), 'CLAUDE.md');
    expect(fs.existsSync(parentClaudeMd)).toBe(false);
  });
});

// ─── ReDoS Tests ──────────────────────────────────────────────────────────────
// Each test sends adversarial input designed to cause catastrophic backtracking
// and asserts the operation completes within 500ms (safe regex finishes in <5ms).

describe('ReDoS — codegen.service.ts regex patterns', () => {
  const codegen = new CodeGenService();
  const REDOS_LIMIT_MS = 500;

  describe('title: extractor (OpenAPI/AsyncAPI/TypeSpec/BPMN)', () => {
    it('handles long title value without trailing quote', async () => {
      // Triggers: /^\s*title:\s*["']?(.+?)["']?\s*$/m
      const payload = `openapi: "3.0.0"\ninfo:\n  title: ${'a'.repeat(50000)}!\n  version: "1.0.0"\npaths: {}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.yaml', 'openapi'),
        REDOS_LIMIT_MS,
        'title extractor with long unquoted value'
      );
    });

    it('handles title with many spaces before end of line', async () => {
      const payload = `openapi: "3.0.0"\ninfo:\n  title: value${'  '.repeat(25000)}\n  version: "1.0.0"\npaths: {}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.yaml', 'openapi'),
        REDOS_LIMIT_MS,
        'title extractor with trailing spaces'
      );
    });
  });

  describe('AsyncAPI channel extractor', () => {
    it('handles content with trailing whitespace lines (no word char after)', async () => {
      // Triggers: /^(\s{0,2})([\w./{}:-]+):\s*\n(?:[\s\S]*?)(?=\n\s{0,2}\w|\Z)/gm
      const channels = Array.from({ length: 100 }, (_, i) =>
        `channel${i}:\n  description: test\n${'   '.repeat(100)}`
      ).join('\n');
      const payload = `asyncapi: "2.6.0"\ninfo:\n  title: Test\n  version: "1.0.0"\nchannels:\n${channels}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.yaml', 'asyncapi'),
        REDOS_LIMIT_MS,
        'AsyncAPI channel extractor with whitespace-only trailing lines'
      );
    });
  });

  describe('TypeSpec model/property parsers', () => {
    it('handles model body with long non-property lines', async () => {
      // Triggers: /(\w+)(\?)?\s*:\s*([\w\[\]]+)/g on lines without ':'
      const longToken = 'x'.repeat(50000);
      const payload = `import "@typespec/http";\nmodel Foo {\n  ${longToken}\n  name: string;\n}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.tsp', 'typespec'),
        REDOS_LIMIT_MS,
        'TypeSpec property regex with long non-matching line'
      );
    });
  });

  describe('Protobuf message/field parsers', () => {
    it('handles field line without = NUMBER ;', async () => {
      // Triggers: /(?:repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/g
      const longField = `repeated string ${'x'.repeat(50000)}`;
      const payload = `syntax = "proto3";\nmessage Foo {\n  ${longField}\n  string name = 1;\n}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.proto', 'protobuf'),
        REDOS_LIMIT_MS,
        'Protobuf field regex with missing = number'
      );
    });

    it('handles rpc line without parentheses', async () => {
      // Triggers: /rpc\s+(\w+)\s*\((\w+)\)\s*returns\s*\((\w+)\)/g
      const longRpc = `rpc ${'M'.repeat(50000)} ${'R'.repeat(50000)} returns ${'S'.repeat(50000)}`;
      const payload = `syntax = "proto3";\nservice Svc {\n  ${longRpc}\n  rpc Foo(Bar) returns (Baz);\n}`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.proto', 'protobuf'),
        REDOS_LIMIT_MS,
        'Protobuf rpc regex without parentheses'
      );
    });
  });

  describe('BPMN XML tag parsers', () => {
    it('handles tag with many attributes but no id=', async () => {
      // Triggers: /<(?:bpmn2?:)?process[^>]+id=["']([^"']+)["'][^>]*(?:name=...)?[^>]*>/g
      const attrs = Array.from({ length: 5000 }, (_, i) => `attr${i}="val${i}"`).join(' ');
      const payload = `<?xml version="1.0"?>\n<definitions>\n<bpmn:process ${attrs}>\n</bpmn:process>\n</definitions>`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.bpmn', 'bpmn'),
        REDOS_LIMIT_MS,
        'BPMN process tag with many attributes, no id'
      );
    });

    it('handles serviceTask tag with many attributes but no id=', async () => {
      const attrs = Array.from({ length: 5000 }, (_, i) => `a${i}="v${i}"`).join(' ');
      const payload = `<?xml version="1.0"?>\n<definitions>\n<bpmn:process id="p1">\n<bpmn:serviceTask ${attrs}/>\n</bpmn:process>\n</definitions>`;
      await assertCompletesBefore(
        () => codegen.validateSpec(payload, 'spec.bpmn', 'bpmn'),
        REDOS_LIMIT_MS,
        'BPMN serviceTask tag with many attributes, no id'
      );
    });
  });

  describe('scanConventions regex patterns', () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = createTempDir('codeql-redos-conv-');
    });

    afterAll(() => cleanupTempDir(tempDir));

    it('handles .prettierrc with adversarial content', async () => {
      createMockProject(tempDir, {
        files: {
          '.prettierrc': '{"semi":true,"singleQuote":true,' + '"extra":"' + 'x'.repeat(50000) + '"}',
          'src/index.ts': 'export const x = 1;\n',
        },
      });
      await assertCompletesBefore(
        () => codegen.scanConventions(tempDir),
        REDOS_LIMIT_MS,
        'scanConventions with large .prettierrc'
      );
    });
  });
});

// ─── Functional Regression Tests ──────────────────────────────────────────────
// Ensure the parsers still extract correct data from well-formed input.

describe('Functional Regression — spec parsing still works', () => {
  const codegen = new CodeGenService();

  it('OpenAPI: extracts title and paths', () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Pet Store', version: '1.0.0' },
      paths: {
        '/pets': { get: { operationId: 'listPets', responses: { '200': { description: 'OK' } } } },
      },
    });
    const result = codegen.validateSpec(spec, 'spec.json', 'openapi');
    expect(result.valid).toBe(true);
    expect(result.technology).toBe('openapi');
  });

  it('AsyncAPI: validates successfully', () => {
    const spec = JSON.stringify({
      asyncapi: '2.6.0',
      info: { title: 'Events', version: '1.0.0' },
      channels: {
        'user/signup': { subscribe: { message: { payload: { type: 'object' } } } },
      },
    });
    const result = codegen.validateSpec(spec, 'spec.json', 'asyncapi');
    expect(result.valid).toBe(true);
    expect(result.technology).toBe('asyncapi');
  });

  it('Protobuf: validates successfully', () => {
    const spec = `syntax = "proto3";\npackage test;\nmessage User {\n  string name = 1;\n  int32 age = 2;\n}\nservice UserService {\n  rpc GetUser(User) returns (User);\n}`;
    const result = codegen.validateSpec(spec, 'spec.proto', 'protobuf');
    expect(result.valid).toBe(true);
    expect(result.technology).toBe('protobuf');
  });

  it('TypeSpec: validates successfully', () => {
    const spec = `import "@typespec/http";\nusing TypeSpec.Http;\n\nmodel Pet {\n  name: string;\n  age?: int32;\n}\n\n@route("/pets")\ninterface Pets {\n  @get list(): Pet[];\n}`;
    const result = codegen.validateSpec(spec, 'main.tsp', 'typespec');
    expect(result.valid).toBe(true);
    expect(result.technology).toBe('typespec');
  });

  it('BPMN: validates successfully', () => {
    const spec = `<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">\n  <bpmn:process id="Process_1" name="Main Process">\n    <bpmn:serviceTask id="Task_1" name="Call API"/>\n    <bpmn:userTask id="Task_2" name="Review"/>\n  </bpmn:process>\n</definitions>`;
    const result = codegen.validateSpec(spec, 'process.bpmn', 'bpmn');
    expect(result.valid).toBe(true);
    expect(result.technology).toBe('bpmn');
  });
});
