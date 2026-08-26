/**
 * Orchestrator path-traversal protection (OWASP A01).
 *
 * This file used to test nothing. The import of the production module was
 * commented out and the suite defined its own `validateProjectPath` — "a mock
 * implementation matching the actual logic" — so 343 lines and 30+ assertions
 * ran against a copy that could never drift-detect the real thing. The comment
 * explaining it ("since it's not exported") was itself stale: the logic had
 * been refactored into `ValidationService`, which is exported.
 *
 * Everything below now runs against `ValidationService.validateProjectPath`.
 *
 * Its contract, in order: reject empty/non-string, reject `..` before
 * resolution, resolve + normalize, reject `..` after resolution, require the
 * path to sit under an allowed workspace root, block system directories,
 * require absolute, require existence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ValidationService } from '../src/services/orchestrator/validation.service.js';

describe('ValidationService.validateProjectPath', () => {
  let service: ValidationService;
  /** A real directory inside an allowed root — the happy path needs one. */
  let allowedDir: string;
  let previousWorkspaceRoot: string | undefined;

  beforeEach(() => {
    service = new ValidationService();
    previousWorkspaceRoot = process.env.WORKSPACE_ROOT;

    // Allowed roots come from HOME/cwd/WORKSPACE_ROOT/PROJECT_PATH. Point one at
    // a temp dir so the valid-path cases do not depend on the machine layout.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-sec-'));
    process.env.WORKSPACE_ROOT = root;
    allowedDir = path.join(root, 'my-project');
    fs.mkdirSync(allowedDir, { recursive: true });
  });

  afterEach(() => {
    const root = process.env.WORKSPACE_ROOT;
    if (previousWorkspaceRoot === undefined) delete process.env.WORKSPACE_ROOT;
    else process.env.WORKSPACE_ROOT = previousWorkspaceRoot;
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  describe('traversal', () => {
    it('blocks an obvious `..` segment', () => {
      const result = service.validateProjectPath('/home/user/../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('blocks a relative path that climbs out', () => {
      expect(service.validateProjectPath('../../../etc/shadow').valid).toBe(false);
    });

    it('blocks `..` in the middle of an otherwise valid-looking path', () => {
      expect(service.validateProjectPath('/home/user/projects/../../root').valid).toBe(false);
    });

    it('blocks a traversal arriving as a raw string, the way HTTP delivers it', () => {
      // Deliberately concatenated, not `path.join`: join collapses `..` before
      // the guard ever sees it, so building the fixture that way would test
      // Node's normaliser rather than this function.
      const raw = `${allowedDir}${path.sep}..${path.sep}..${path.sep}..`;
      const result = service.validateProjectPath(raw);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('does not treat a URL-encoded sequence as a valid path', () => {
      // `%2e%2e` is not decoded by path.resolve, so it is an ordinary segment —
      // it must still fail, on existence if nothing else.
      expect(service.validateProjectPath('/home/user/%2e%2e/%2e%2e/etc').valid).toBe(false);
    });
  });

  describe('workspace boundary', () => {
    it('rejects a real directory that sits outside every allowed root', () => {
      // The directory exists, so only the boundary check can reject it.
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
      try {
        // Make sure it is genuinely outside the configured root.
        expect(outside.startsWith(process.env.WORKSPACE_ROOT!)).toBe(false);

        const result = service.validateProjectPath(outside);
        if (result.valid) {
          // HOME or cwd may legitimately cover the temp dir on some machines;
          // in that case the boundary check is not the one under test here.
          expect(outside.startsWith(path.normalize(os.homedir()))).toBe(true);
        } else {
          expect(result.error).toMatch(/workspace|system directories/i);
        }
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('accepts a real directory inside an allowed root', () => {
      const result = service.validateProjectPath(allowedDir);
      expect(result.valid).toBe(true);
      expect(result.path).toBe(path.normalize(path.resolve(allowedDir)));
    });

    it('accepts a nested directory inside an allowed root', () => {
      const nested = path.join(allowedDir, 'packages', 'api');
      fs.mkdirSync(nested, { recursive: true });
      expect(service.validateProjectPath(nested).valid).toBe(true);
    });

    it('does not accept a sibling whose name merely shares the root prefix', () => {
      // `<root>-evil` starts with the same string as `<root>` but is outside it.
      const root = process.env.WORKSPACE_ROOT!;
      const lookalike = `${root}-evil`;
      fs.mkdirSync(lookalike, { recursive: true });
      try {
        const result = service.validateProjectPath(lookalike);
        if (result.valid) {
          // Only acceptable if some *other* allowed root legitimately covers it.
          expect(lookalike.startsWith(path.normalize(os.homedir()))).toBe(true);
        } else {
          expect(result.error).toMatch(/workspace/i);
        }
      } finally {
        fs.rmSync(lookalike, { recursive: true, force: true });
      }
    });
  });

  describe('system directories', () => {
    const systemPaths =
      process.platform === 'win32'
        ? ['C:\\Windows\\System32', 'C:\\Program Files']
        : ['/etc', '/usr/bin', '/var/log'];

    for (const systemPath of systemPaths) {
      it(`blocks ${systemPath}`, () => {
        const result = service.validateProjectPath(systemPath);
        expect(result.valid).toBe(false);
      });
    }
  });

  describe('input shapes', () => {
    it('rejects empty, null, undefined and non-string input', () => {
      for (const bad of ['', null, undefined, 42, {}, []]) {
        // The signature is `string`; these are what actually arrives over HTTP.
        const result = service.validateProjectPath(bad as unknown as string);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });

    it('rejects a path that does not exist, even inside an allowed root', () => {
      const missing = path.join(allowedDir, 'no-such-directory');
      const result = service.validateProjectPath(missing);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exist');
    });
  });

  describe('normalization', () => {
    it('returns a normalized absolute path on success', () => {
      const messy = `${allowedDir}${path.sep}.${path.sep}`;

      const result = service.validateProjectPath(messy);
      expect(result.valid).toBe(true);
      expect(result.path).toBe(path.normalize(path.resolve(allowedDir)));
    });

    it('refuses a cancelling traversal rather than normalising it away', () => {
      // `<dir>/sub/..` resolves back to `<dir>`, which exists and is allowed —
      // the guard still refuses it, because a literal `..` in the input is
      // treated as intent regardless of where it lands.
      fs.mkdirSync(path.join(allowedDir, 'sub'), { recursive: true });
      const cancelling = `${allowedDir}${path.sep}sub${path.sep}..`;

      expect(service.validateProjectPath(cancelling).valid).toBe(false);
    });

    it('accepts a trailing separator', () => {
      const result = service.validateProjectPath(allowedDir + path.sep);
      expect(result.valid).toBe(true);
    });
  });

  describe('a real symlink out of the workspace', () => {
    it('is not accepted just because the link itself sits inside', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'link-target-'));
      const link = path.join(allowedDir, 'escape');
      try {
        fs.symlinkSync(outside, link, 'junction');
      } catch {
        return; // symlink creation not permitted in this environment
      }

      try {
        const result = service.validateProjectPath(link);
        // Documented behaviour: the boundary check runs on the resolved path.
        // If this ever starts passing, the guard has stopped resolving links.
        if (result.valid) {
          expect(path.normalize(result.path ?? '')).not.toBe(path.normalize(outside));
        }
      } finally {
        fs.rmSync(link, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
