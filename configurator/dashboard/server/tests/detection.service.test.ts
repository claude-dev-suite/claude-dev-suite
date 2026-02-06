/**
 * Detection Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DetectionService } from '../src/services/detection.service.js';
import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';

describe('DetectionService', () => {
  let detectionService: DetectionService;
  let tempDir: string;

  beforeEach(() => {
    detectionService = new DetectionService();
    tempDir = createTempDir('detection-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('detectProject', () => {
    it('should detect a React project', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test-react-app',
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
        },
        hasGit: true,
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.framework).toBe('react');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect a Vue project', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'vue-app',
          dependencies: {
            vue: '^3.4.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.framework).toBe('vue');
    });

    it('should detect Next.js as meta-framework', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'next-app',
          dependencies: {
            next: '^14.0.0',
            react: '^18.2.0',
          },
        },
        hasGit: true,
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.framework).toBe('react');
      expect(result.frontend?.metaFramework).toBe('nextjs');
    });

    it('should detect NestJS backend', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'nest-api',
          dependencies: {
            '@nestjs/core': '^10.0.0',
            '@nestjs/common': '^10.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('nestjs');
    });

    it('should detect Express backend', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'express-api',
          dependencies: {
            express: '^4.18.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('express');
    });

    it('should detect Prisma ORM', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'prisma-app',
          dependencies: {
            '@prisma/client': '^5.0.0',
          },
          devDependencies: {
            prisma: '^5.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.database?.orm).toBe('prisma');
    });

    it('should detect testing frameworks', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'tested-app',
          devDependencies: {
            vitest: '^1.0.0',
            playwright: '^1.40.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.testing?.unit).toBe('vitest');
      expect(result.testing?.e2e).toBe('playwright');
    });

    it('should detect monorepo with pnpm-workspace', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'pnpm-monorepo' },
        files: {
          'pnpm-workspace.yaml': 'packages:\n  - packages/*',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.isMonorepo).toBe(true);
    });

    it('should detect monorepo with workspaces', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'monorepo',
          workspaces: ['packages/*'],
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.isMonorepo).toBe(true);
    });

    it('should return unknown for empty directory', async () => {
      const result = await detectionService.detectProject(tempDir);

      expect(result.projectType).toBe('unknown');
    });

    it('should handle non-existent path', async () => {
      const result = await detectionService.detectProject('/nonexistent/path');

      expect(result.projectType).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectEnvironments', () => {
    it('should detect .env files with DATABASE_URL', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: {
          '.env': 'DATABASE_URL=postgres://localhost/db',
        },
      });

      const envFiles = await detectionService.detectEnvironments(tempDir);

      expect(envFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('should build DATABASE_URL from parts', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: {
          '.env': 'DB_HOST=localhost\nDB_PORT=5432\nDB_NAME=mydb\nDB_USER=admin\nDB_PASSWORD=secret',
        },
      });

      const envFiles = await detectionService.detectEnvironments(tempDir);

      expect(envFiles.length).toBeGreaterThanOrEqual(1);
      if (envFiles.length > 0) {
        expect(envFiles[0].databaseUrl).toContain('postgresql://');
      }
    });

    it('should return empty array when no .env files exist', async () => {
      const envFiles = await detectionService.detectEnvironments(tempDir);

      expect(envFiles).toEqual([]);
    });
  });

  describe('detectGitRepos', () => {
    it('should detect root git repository', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        hasGit: true,
      });

      const repos = await detectionService.detectGitRepos(tempDir);

      expect(repos.length).toBe(1);
      expect(repos[0].path).toBe('.');
    });

    it('should return empty array when no git repo', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        hasGit: false,
      });

      const repos = await detectionService.detectGitRepos(tempDir);

      expect(repos).toEqual([]);
    });
  });

  describe('getRecommendations', () => {
    it('should recommend react-expert for React projects', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'react-app',
          dependencies: { react: '^18.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('react-expert');
    });

    it('should recommend documentation MCP', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'app',
          dependencies: { react: '^18.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.mcpServers).toContain('documentation');
    });

    it('should recommend database-query for Prisma projects', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'prisma-app',
          dependencies: { '@prisma/client': '^5.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.mcpServers).toContain('database-query');
    });
  });
});
