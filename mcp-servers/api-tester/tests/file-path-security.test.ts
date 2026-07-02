// SPDX-License-Identifier: MIT
/**
 * Regression tests for api-tester file-path validation (MEDIUM – arbitrary file read)
 * Tests: handleImportCollection and handleGenerateTests reject non-absolute / null-byte paths
 */

import { describe, it, expect } from 'vitest';

// Import the validateFilePath logic indirectly by calling the handlers which
// now call validateFilePath internally.  We can also test it by importing
// the handlers directly — they will throw before touching the filesystem.

// Since the handlers do real I/O we test the validation early-exit behaviour
// by passing paths that should be rejected before any fs.readFile is called.

import { handleImportCollection, handleGenerateTests } from '../src/handlers/api-tester-handlers.js';

describe('handleImportCollection — path validation', () => {
  it('rejects a relative filePath', async () => {
    await expect(
      handleImportCollection({ filePath: './collections/postman.json', format: 'postman' })
    ).rejects.toThrow(/absolute/i);
  });

  it('rejects a filePath with a null byte', async () => {
    await expect(
      handleImportCollection({ filePath: '/tmp/collection\0.json', format: 'postman' })
    ).rejects.toThrow(/null byte/i);
  });

  it('rejects an empty filePath', async () => {
    await expect(
      handleImportCollection({ filePath: '', format: 'postman' })
    ).rejects.toThrow();
  });
});

describe('handleGenerateTests — path validation', () => {
  it('rejects a relative specPath', async () => {
    await expect(
      handleGenerateTests({ specPath: '../openapi/spec.yaml' })
    ).rejects.toThrow(/absolute/i);
  });

  it('rejects a specPath with a null byte', async () => {
    await expect(
      handleGenerateTests({ specPath: '/tmp/spec\0.yaml' })
    ).rejects.toThrow(/null byte/i);
  });

  it('rejects an empty specPath', async () => {
    await expect(
      handleGenerateTests({ specPath: '' })
    ).rejects.toThrow();
  });
});
