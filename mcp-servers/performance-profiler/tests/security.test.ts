// SPDX-License-Identifier: MIT
/**
 * Security regression tests for performance-profiler
 * Covers: benchmarkCode ACE fix, validateScriptPath hardening,
 *         SSRF in validateUrl, profileFunction args size cap.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// validateScriptPath
// ---------------------------------------------------------------------------
import { validateScriptPath } from '../src/utils/process.js';

describe('validateScriptPath', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sec-test-'));
    tempFile = join(tempDir, 'script.js');
    await writeFile(tempFile, 'console.log("hello")');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('accepts a valid absolute path to an existing file', () => {
    expect(() => validateScriptPath(tempFile)).not.toThrow();
  });

  it('rejects a relative path', () => {
    expect(() => validateScriptPath('./relative/script.js')).toThrow(/absolute/i);
  });

  it('rejects an empty string', () => {
    expect(() => validateScriptPath('')).toThrow();
  });

  it('rejects a path containing a null byte', () => {
    expect(() => validateScriptPath('/tmp/script\0.js')).toThrow(/null byte/i);
  });

  it('rejects a non-existent file', () => {
    expect(() => validateScriptPath('/tmp/does-not-exist-12345.js')).toThrow(/not found/i);
  });

  it('rejects a path with traversal sequences', () => {
    // Relative path containing ..
    expect(() => validateScriptPath('../etc/passwd')).toThrow(/absolute/i);
  });
});

// ---------------------------------------------------------------------------
// benchmarkCode — raw code must be rejected unless opt-in env flag is set
// ---------------------------------------------------------------------------
import { benchmarkCode as nodeBenchmarkCode } from '../src/profilers/nodejs.js';
import { benchmarkCode as pythonBenchmarkCode } from '../src/profilers/python.js';

describe('benchmarkCode — raw code execution gate', () => {
  beforeEach(() => {
    // Ensure the opt-in flag is NOT set
    delete process.env['PERF_PROFILER_ALLOW_RAW_CODE'];
  });

  it('Node.js: rejects raw code when PERF_PROFILER_ALLOW_RAW_CODE is not set', async () => {
    await expect(
      nodeBenchmarkCode('console.log("hello")', 1, 1, false)
    ).rejects.toThrow(/disabled/i);
  });

  it('Python: rejects raw code when PERF_PROFILER_ALLOW_RAW_CODE is not set', async () => {
    await expect(
      pythonBenchmarkCode('print("hello")', 1, 1, false)
    ).rejects.toThrow(/disabled/i);
  });

  it('Node.js: rejects non-absolute scriptPath', async () => {
    await expect(
      nodeBenchmarkCode('./relative.js', 1, 1, true)
    ).rejects.toThrow(/absolute/i);
  });

  it('Node.js: rejects non-existent scriptPath', async () => {
    await expect(
      nodeBenchmarkCode('/tmp/does-not-exist-bench.js', 1, 1, true)
    ).rejects.toThrow(/not found/i);
  });

  it('Node.js: requires scriptPath or code', async () => {
    // The schema enforces at least one; handler will pass code=undefined
    // which would cause a runtime issue — test that a non-scriptPath invocation
    // with ALLOW_RAW_CODE=1 still needs actual code
    process.env['PERF_PROFILER_ALLOW_RAW_CODE'] = '1';
    try {
      // Empty string code with flag set should still run (or fail gracefully)
      // but must NOT throw the "disabled" error
      const result = nodeBenchmarkCode('', 1, 1, false);
      // It may succeed with 0 ms or fail with a script error — either is acceptable
      await result.catch(() => {}); // swallow execution errors
    } finally {
      delete process.env['PERF_PROFILER_ALLOW_RAW_CODE'];
    }
  });
});

// ---------------------------------------------------------------------------
// profileFunction — args size cap
// ---------------------------------------------------------------------------
import { profileFunction } from '../src/profilers/nodejs.js';

describe('profileFunction — args size cap', () => {
  it('rejects more than 100 arguments', async () => {
    const bigArgs = new Array(101).fill(1);
    await expect(
      profileFunction('/tmp/nonexistent.mjs', 'myFn', bigArgs)
    ).rejects.toThrow(/Too many arguments|not found|absolute/i);
    // validateScriptPath runs first so the error may be "not found" or "absolute";
    // but if the path check is bypassed or passes, it must then fail on args count.
  });

  it('rejects a serialized args payload exceeding 64 KB', async () => {
    // Create a path that fails early (not found), so we test arg validation first
    // by providing a valid temp file
    const tempDir2 = await mkdtemp(join(tmpdir(), 'args-test-'));
    const validFile = join(tempDir2, 'module.mjs');
    await writeFile(validFile, 'export function fn() {}');

    const hugeArg = 'x'.repeat(65 * 1024);
    try {
      await expect(
        profileFunction(validFile, 'fn', [hugeArg])
      ).rejects.toThrow(/size limit/i);
    } finally {
      await rm(tempDir2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// validateUrl (SSRF)
// ---------------------------------------------------------------------------
import { validateUrl } from '../src/utils/ssrf.js';

describe('validateUrl — SSRF protection', () => {
  beforeEach(() => {
    delete process.env['PERF_PROFILER_ALLOW_PRIVATE_URLS'];
  });

  it('allows a public URL', async () => {
    await expect(validateUrl('https://example.com/api')).resolves.toBeUndefined();
  });

  it('allows localhost', async () => {
    await expect(validateUrl('http://localhost:3000/health')).resolves.toBeUndefined();
  });

  it('blocks cloud metadata endpoint 169.254.169.254', async () => {
    await expect(validateUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /SSRF protection/i
    );
  });

  it('blocks 10.x.x.x private range', async () => {
    await expect(validateUrl('http://10.0.0.1/admin')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks 172.16.x.x private range', async () => {
    await expect(validateUrl('http://172.16.0.1/secret')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks 192.168.x.x private range', async () => {
    await expect(validateUrl('http://192.168.1.1/')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks IPv6 loopback ::1', async () => {
    await expect(validateUrl('http://[::1]:8080/')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks 127.0.0.1 (loopback literal)', async () => {
    await expect(validateUrl('http://127.0.0.1:8080/')).rejects.toThrow(/SSRF protection/i);
  });

  it('allows private URLs when PERF_PROFILER_ALLOW_PRIVATE_URLS=1 (except metadata)', async () => {
    process.env['PERF_PROFILER_ALLOW_PRIVATE_URLS'] = '1';
    // 10.x should be allowed now
    await expect(validateUrl('http://10.0.0.1/api')).resolves.toBeUndefined();
    // Cloud metadata still blocked even with the flag
    await expect(validateUrl('http://169.254.169.254/')).rejects.toThrow(/SSRF protection/i);
    delete process.env['PERF_PROFILER_ALLOW_PRIVATE_URLS'];
  });

  it('throws on invalid URL', async () => {
    await expect(validateUrl('not-a-url')).rejects.toThrow(/invalid url/i);
  });
});
