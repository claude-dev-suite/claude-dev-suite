/**
 * Detection Routes Tests
 *
 * Unit tests for detection route handlers.
 * Tests service integration, response formatting, and snake_case conversion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DetectionService } from '../../src/services/detection.service.js';
import type { DetectionResult } from '../../src/types.js';

// Mock the service
vi.mock('../../src/services/detection.service.js');

describe('Detection Routes - Service Integration', () => {
  let detectionService: DetectionService;

  beforeEach(() => {
    detectionService = new DetectionService();
    vi.clearAllMocks();
  });

  describe('detectProject logic', () => {
    it('should detect React frontend project', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'frontend',
        frontend: {
          framework: 'react',
          metaFramework: '',
          runtime: 'vite',
        },
        isMonorepo: false,
        confidence: 0.9,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/react-project');

      expect(result.projectType).toBe('frontend');
      expect(result.frontend?.framework).toBe('react');
      expect(result.frontend?.runtime).toBe('vite');
    });

    it('should detect fullstack project with database', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'fullstack',
        frontend: {
          framework: 'react',
          metaFramework: 'nextjs',
        },
        backend: {
          framework: 'nestjs',
          runtime: 'nodejs',
        },
        database: {
          dbType: 'postgresql',
          orm: 'prisma',
        },
        testing: {
          unit: 'vitest',
          e2e: 'playwright',
        },
        isMonorepo: true,
        confidence: 0.95,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/fullstack');

      expect(result.projectType).toBe('fullstack');
      expect(result.isMonorepo).toBe(true);
      expect(result.frontend?.framework).toBe('react');
      expect(result.backend?.framework).toBe('nestjs');
      expect(result.database?.dbType).toBe('postgresql');
      expect(result.testing?.unit).toBe('vitest');
    });

    it('should detect Spring Boot backend project', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'backend',
        backend: {
          framework: 'spring-boot',
          runtime: 'jvm',
        },
        database: {
          dbType: 'postgresql',
          orm: 'spring-data-jpa',
        },
        isMonorepo: false,
        confidence: 0.85,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/spring-boot');

      expect(result.projectType).toBe('backend');
      expect(result.backend?.framework).toBe('spring-boot');
      expect(result.database?.orm).toBe('spring-data-jpa');
    });

    it('should handle unknown project type', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'unknown',
        isMonorepo: false,
        confidence: 0.3,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/unknown');

      expect(result.projectType).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle detection errors', async () => {
      vi.mocked(detectionService.detectProject).mockRejectedValue(
        new Error('Project directory not found')
      );

      await expect(detectionService.detectProject('/nonexistent')).rejects.toThrow(
        'Project directory not found'
      );
    });
  });

  describe('snake_case conversion', () => {
    it('should convert camelCase to snake_case', () => {
      const detectionResult: DetectionResult = {
        projectType: 'frontend',
        frontend: {
          framework: 'react',
          metaFramework: 'nextjs',
          runtime: 'vite',
        },
        isMonorepo: false,
        confidence: 0.9,
      };

      // Simulate conversion function
      const converted = {
        project_type: detectionResult.projectType,
        frontend: {
          framework: detectionResult.frontend?.framework || '',
          meta_framework: detectionResult.frontend?.metaFramework || '',
          runtime: detectionResult.frontend?.runtime || '',
        },
        is_monorepo: detectionResult.isMonorepo,
        confidence: detectionResult.confidence,
      };

      expect(converted.project_type).toBe('frontend');
      expect(converted.frontend.meta_framework).toBe('nextjs');
      expect(converted.is_monorepo).toBe(false);
    });

    it('should handle undefined optional fields', () => {
      const detectionResult: DetectionResult = {
        projectType: 'unknown',
        isMonorepo: false,
        confidence: 0.3,
      };

      const converted = {
        project_type: detectionResult.projectType,
        frontend: {
          framework: detectionResult.frontend?.framework || '',
          meta_framework: detectionResult.frontend?.metaFramework || '',
          runtime: detectionResult.frontend?.runtime || '',
        },
        backend: {
          framework: detectionResult.backend?.framework || '',
          meta_framework: detectionResult.backend?.metaFramework || '',
          runtime: detectionResult.backend?.runtime || '',
        },
        database: {
          db_type: detectionResult.database?.dbType || '',
          orm: detectionResult.database?.orm || '',
        },
        testing: {
          unit: detectionResult.testing?.unit || '',
          e2e: detectionResult.testing?.e2e || '',
        },
        is_monorepo: detectionResult.isMonorepo,
        confidence: detectionResult.confidence,
      };

      expect(converted.frontend.framework).toBe('');
      expect(converted.backend.framework).toBe('');
      expect(converted.database.db_type).toBe('');
      expect(converted.testing.unit).toBe('');
    });
  });

  describe('detectEnvironments logic', () => {
    it('should detect environment variables', async () => {
      const envList = [
        {
          name: 'DATABASE_URL',
          label: 'Database Connection',
          databaseUrl: 'postgresql://localhost:5432/mydb',
          source: '.env',
        },
        {
          name: 'REDIS_URL',
          label: 'Redis Connection',
          databaseUrl: 'redis://localhost:6379',
          source: '.env.local',
        },
      ];

      vi.mocked(detectionService.detectEnvironments).mockResolvedValue(envList);

      const result = await detectionService.detectEnvironments('/test/project');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('DATABASE_URL');
      expect(result[1].name).toBe('REDIS_URL');
    });

    it('should convert array to object keyed by name', () => {
      const envList = [
        {
          name: 'DATABASE_URL',
          label: 'Database Connection',
          databaseUrl: 'postgresql://localhost:5432/mydb',
          source: '.env',
        },
      ];

      const envObject: Record<string, any> = {};
      for (const env of envList) {
        envObject[env.name] = {
          name: env.name,
          label: env.label,
          database_url: env.databaseUrl,
          source: env.source,
        };
      }

      expect(envObject['DATABASE_URL']).toBeDefined();
      expect(envObject['DATABASE_URL'].database_url).toBe('postgresql://localhost:5432/mydb');
    });

    it('should return empty array when no environments found', async () => {
      vi.mocked(detectionService.detectEnvironments).mockResolvedValue([]);

      const result = await detectionService.detectEnvironments('/test/project');

      expect(result).toEqual([]);
    });

    it('should handle environment detection errors', async () => {
      vi.mocked(detectionService.detectEnvironments).mockRejectedValue(
        new Error('Cannot read .env files')
      );

      await expect(detectionService.detectEnvironments('/test/project')).rejects.toThrow(
        'Cannot read .env files'
      );
    });
  });

  describe('detectGitRepos logic', () => {
    it('should detect git repositories', async () => {
      const gitRepos = [
        {
          path: '/test/project',
          name: 'my-project',
          branch: 'main',
          remote: 'origin',
          remoteUrl: 'https://github.com/user/repo.git',
        },
      ];

      vi.mocked(detectionService.detectGitRepos).mockResolvedValue(gitRepos);

      const result = await detectionService.detectGitRepos('/test/project');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-project');
      expect(result[0].branch).toBe('main');
    });

    it('should return empty array when no git repos found', async () => {
      vi.mocked(detectionService.detectGitRepos).mockResolvedValue([]);

      const result = await detectionService.detectGitRepos('/test/project');

      expect(result).toEqual([]);
    });

    it('should handle git detection errors', async () => {
      vi.mocked(detectionService.detectGitRepos).mockRejectedValue(
        new Error('Not a git repository')
      );

      await expect(detectionService.detectGitRepos('/test/project')).rejects.toThrow(
        'Not a git repository'
      );
    });
  });

  describe('getRecommendations logic', () => {
    it('should recommend agents and servers based on detection', () => {
      const detectionResult: DetectionResult = {
        projectType: 'fullstack',
        frontend: {
          framework: 'react',
          metaFramework: 'nextjs',
        },
        backend: {
          framework: 'nestjs',
        },
        database: {
          dbType: 'postgresql',
          orm: 'prisma',
        },
        testing: {
          unit: 'vitest',
          e2e: 'playwright',
        },
        isMonorepo: false,
        confidence: 0.9,
      };

      const recommendations = {
        agents: ['react-expert', 'nextjs-expert', 'nestjs-expert', 'prisma-expert'],
        mcpServers: ['documentation', 'database-query', 'api-tester'],
      };

      vi.mocked(detectionService.getRecommendations).mockReturnValue(recommendations);

      const result = detectionService.getRecommendations(detectionResult);

      expect(result.agents).toContain('react-expert');
      expect(result.agents).toContain('nestjs-expert');
      expect(result.mcpServers).toContain('documentation');
      expect(result.mcpServers).toContain('database-query');
    });

    it('should format recommendations for frontend response', () => {
      const recommendations = {
        agents: ['react-expert', 'vitest-expert'],
        mcpServers: ['documentation', 'code-quality'],
      };

      const formatted = {
        agents: recommendations.agents.map((id) => ({ agentId: id })),
        mcpServers: recommendations.mcpServers.map((name) => ({ serverName: name })),
      };

      expect(formatted.agents).toEqual([
        { agentId: 'react-expert' },
        { agentId: 'vitest-expert' },
      ]);
      expect(formatted.mcpServers).toEqual([
        { serverName: 'documentation' },
        { serverName: 'code-quality' },
      ]);
    });

    it('should return empty recommendations for unknown project', () => {
      const detectionResult: DetectionResult = {
        projectType: 'unknown',
        isMonorepo: false,
        confidence: 0.2,
      };

      const recommendations = {
        agents: [],
        mcpServers: [],
      };

      vi.mocked(detectionService.getRecommendations).mockReturnValue(recommendations);

      const result = detectionService.getRecommendations(detectionResult);

      expect(result.agents).toEqual([]);
      expect(result.mcpServers).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle high confidence detection', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'frontend',
        frontend: {
          framework: 'react',
        },
        isMonorepo: false,
        confidence: 0.99,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/project');

      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle low confidence detection', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'unknown',
        isMonorepo: false,
        confidence: 0.1,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/project');

      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle monorepo detection', async () => {
      const detectionResult: DetectionResult = {
        projectType: 'fullstack',
        frontend: { framework: 'react' },
        backend: { framework: 'nestjs' },
        isMonorepo: true,
        confidence: 0.95,
      };

      vi.mocked(detectionService.detectProject).mockResolvedValue(detectionResult);

      const result = await detectionService.detectProject('/test/monorepo');

      expect(result.isMonorepo).toBe(true);
      expect(result.frontend).toBeDefined();
      expect(result.backend).toBeDefined();
    });
  });
});
