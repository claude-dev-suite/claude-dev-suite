// SPDX-License-Identifier: MIT
/**
 * Tests for stack-compatibility.service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { checkStackCompatibility } from '../../src/services/upgrade/stack-compatibility.service.js';
import type { Feature, StackInfo } from '../../src/types/index.js';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'test-feature',
    version: '1.0.0',
    type: 'hook',
    name: 'Test Feature',
    description: 'A test feature',
    addedInVersion: '1.0.0',
    apply: {
      type: 'hook-merge',
      target: '.claude/settings.json',
      event: 'PostToolUse',
      config: {},
    },
    ...overrides,
  };
}

describe('checkStackCompatibility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('stack-compat-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('no requirements', () => {
    it('returns compatible when feature has no stackRequirements', () => {
      const feature = makeFeature();
      const result = checkStackCompatibility(undefined, undefined, tempDir);
      expect(result.compatible).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns compatible when stackRequirements is undefined', () => {
      const result = checkStackCompatibility(
        { frontend: { framework: 'react' } } as StackInfo,
        undefined,
        tempDir
      );
      expect(result.compatible).toBe(true);
    });
  });

  describe('requiresAny — frontend', () => {
    it('matches when stack has required frontend framework', () => {
      const stack = { frontend: { framework: 'react' } } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { frontend: ['react'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('returns incompatible when frontend does not match', () => {
      const stack = { frontend: { framework: 'vue' } } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { frontend: ['react', 'nextjs'] } },
        tempDir
      );
      expect(result.compatible).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('matches with case-insensitive comparison', () => {
      const stack = { frontend: { framework: 'React' } } as unknown as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { frontend: ['react'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('matches via meta_framework', () => {
      const stack = {
        frontend: { framework: 'react', meta_framework: 'nextjs' },
      } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { frontend: ['nextjs'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });
  });

  describe('requiresAny — backend', () => {
    it('matches when stack has required backend', () => {
      const stack = {
        backend: { framework: 'nestjs' },
      } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { backend: ['nestjs'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('returns incompatible when backend does not match', () => {
      const stack = {
        backend: { framework: 'express' },
      } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { backend: ['nestjs', 'fastapi'] } },
        tempDir
      );
      expect(result.compatible).toBe(false);
    });
  });

  describe('requiresAny — database', () => {
    it('matches when stack has required database', () => {
      const stack = {
        database: { db_type: 'postgresql' },
      } as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { database: ['postgresql'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });
  });

  describe('requiresAny — legacy array format', () => {
    it('matches with legacy array format for frontend', () => {
      const stack = { frontend: ['react', 'nextjs'] } as unknown as StackInfo;
      const result = checkStackCompatibility(
        stack,
        { requiresAny: { frontend: ['react'] } },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });
  });

  describe('requiresAny — agent inference fallback', () => {
    it('infers react stack from react-expert agent', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { frontend: ['react'] } },
        tempDir,
        ['react-expert']
      );
      expect(result.compatible).toBe(true);
    });

    it('infers nextjs stack from nextjs-expert agent', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { frontend: ['nextjs'] } },
        tempDir,
        ['nextjs-expert']
      );
      expect(result.compatible).toBe(true);
    });

    it('infers spring-boot from spring-boot-expert agent', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { backend: ['spring-boot'] } },
        tempDir,
        ['spring-boot-expert']
      );
      expect(result.compatible).toBe(true);
    });

    it('infers postgresql from sql-expert agent', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { database: ['postgresql'] } },
        tempDir,
        ['sql-expert']
      );
      expect(result.compatible).toBe(true);
    });

    it('infers mongodb from mongodb-expert agent', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { database: ['mongodb'] } },
        tempDir,
        ['mongodb-expert']
      );
      expect(result.compatible).toBe(true);
    });

    it('returns incompatible when no agents infer the required stack', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { frontend: ['svelte'] } },
        tempDir,
        ['react-expert']
      );
      expect(result.compatible).toBe(false);
    });

    it('returns incompatible when no agents are installed', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresAny: { backend: ['nestjs'] } },
        tempDir,
        []
      );
      expect(result.compatible).toBe(false);
    });
  });

  describe('requiresPackage', () => {
    it('returns compatible when required package is in dependencies', () => {
      const pkgJson = { dependencies: { vitest: '^1.0.0' } };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['vitest'] },
        tempDir
      );
      expect(result.compatible).toBe(true);
      expect(result.missingPackages).toBeUndefined();
    });

    it('returns compatible when required package is in devDependencies', () => {
      const pkgJson = { devDependencies: { vitest: '^1.0.0' } };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['vitest'] },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('returns compatible with missingPackages when none of the alternatives are installed', () => {
      const pkgJson = { dependencies: { express: '^4.0.0' } };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['vitest', 'jest'] },
        tempDir
      );
      expect(result.compatible).toBe(true);
      expect(result.missingPackages).toEqual(['vitest', 'jest']);
    });

    it('returns incompatible when no package.json exists', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['vitest'] },
        tempDir
      );
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('No package.json');
    });

    it('checks frontend/ subdirectory package.json for monorepos', () => {
      const frontendDir = path.join(tempDir, 'frontend');
      fs.mkdirSync(frontendDir, { recursive: true });
      const pkgJson = { dependencies: { react: '^18.0.0' } };
      fs.writeFileSync(path.join(frontendDir, 'package.json'), JSON.stringify(pkgJson));
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['react'] },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('checks client/ subdirectory package.json for monorepos', () => {
      const clientDir = path.join(tempDir, 'client');
      fs.mkdirSync(clientDir, { recursive: true });
      const pkgJson = { dependencies: { react: '^18.0.0' } };
      fs.writeFileSync(path.join(clientDir, 'package.json'), JSON.stringify(pkgJson));
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: ['react'] },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });

    it('returns compatible when requiresPackage is empty array', () => {
      const result = checkStackCompatibility(
        undefined,
        { requiresPackage: [] },
        tempDir
      );
      expect(result.compatible).toBe(true);
    });
  });
});
