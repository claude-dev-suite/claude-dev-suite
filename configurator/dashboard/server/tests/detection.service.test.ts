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

    it('should recommend messaging-expert for Kafka projects', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'kafka-app',
          dependencies: { kafkajs: '^2.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('messaging-expert');
    });

    it('should recommend docker-expert for Docker projects', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'docker-app' },
        files: { 'Dockerfile': 'FROM node:20' },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('docker-expert');
    });

    it('should recommend tauri-expert for Tauri projects', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'tauri-app',
          dependencies: { '@tauri-apps/api': '^2.0.0', react: '^18.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('tauri-expert');
    });

    it('should recommend devops-expert for GitHub Actions projects', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'ci-app' },
        files: { '.github/workflows/ci.yml': 'name: CI\non: push' },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('devops-expert');
    });

    it('should recommend typescript-expert for GraphQL projects', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'graphql-app',
          dependencies: { graphql: '^16.0.0', '@apollo/server': '^4.0.0' },
        },
      });

      const detection = await detectionService.detectProject(tempDir);
      const recommendations = detectionService.getRecommendations(detection);

      expect(recommendations.agents).toContain('typescript-expert');
      expect(recommendations.mcpServers).toContain('api-tester');
    });
  });

  describe('detectProject - new frameworks', () => {
    it('should detect Solid.js frontend', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'solid-app',
          dependencies: { 'solid-js': '^1.8.0' },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.framework).toBe('solid');
    });

    it('should detect Remix as meta-framework', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'remix-app',
          dependencies: { '@remix-run/react': '^2.0.0', '@remix-run/node': '^2.0.0' },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.metaFramework).toBe('remix');
      expect(result.frontend?.framework).toBe('react');
    });

    it('should detect Astro as meta-framework', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'astro-app',
          dependencies: { astro: '^4.0.0' },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.frontend?.metaFramework).toBe('astro');
    });

    it('should detect Echo Go framework', async () => {
      createMockProject(tempDir, {
        files: {
          'go.mod': 'module myapp\n\ngo 1.21\n\nrequire github.com/labstack/echo/v4 v4.11.0',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('echo');
      expect(result.backend?.runtime).toBe('go');
    });

    it('should detect Chi Go framework', async () => {
      createMockProject(tempDir, {
        files: {
          'go.mod': 'module myapp\n\ngo 1.21\n\nrequire github.com/go-chi/chi/v5 v5.0.0',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('chi');
    });

    it('should detect Rocket Rust framework', async () => {
      createMockProject(tempDir, {
        files: {
          'Cargo.toml': '[dependencies]\nrocket = "0.5"',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('rocket');
      expect(result.backend?.runtime).toBe('rust');
    });

    it('should detect Warp Rust framework', async () => {
      createMockProject(tempDir, {
        files: {
          'Cargo.toml': '[dependencies]\nwarp = "0.3"',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('warp');
    });

    it('should detect Oak Deno framework', async () => {
      createMockProject(tempDir, {
        files: {
          'deno.json': '{ "imports": { "oak": "https://deno.land/x/oak/mod.ts" } }',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.framework).toBe('oak');
      expect(result.backend?.runtime).toBe('deno');
    });
  });

  describe('detectProject - .NET', () => {
    it('should detect ASP.NET Core project', async () => {
      createMockProject(tempDir, {
        files: {
          'MyApi.csproj': `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`,
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.backend?.runtime).toBe('dotnet');
      expect(result.backend?.framework).toBe('dotnet');
    });

    it('should detect Entity Framework Core ORM', async () => {
      createMockProject(tempDir, {
        files: {
          'MyApi.csproj': `<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="8.0.0" />
  </ItemGroup>
</Project>`,
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.database?.orm).toBe('efcore');
      expect(result.database?.dbType).toBe('postgresql');
    });

    it('should detect xUnit testing', async () => {
      createMockProject(tempDir, {
        files: {
          'Tests.csproj': `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="xunit" Version="2.6.0" />
  </ItemGroup>
</Project>`,
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.testing?.unit).toBe('xunit');
    });
  });

  describe('detectProject - additional technologies', () => {
    it('should detect state management libraries', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'state-app',
          dependencies: {
            react: '^18.0.0',
            zustand: '^4.0.0',
            '@tanstack/react-query': '^5.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('zustand');
      expect(result.additionalTechnologies).toContain('tanstack-query');
    });

    it('should detect messaging from npm packages', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'msg-app',
          dependencies: { kafkajs: '^2.0.0', amqplib: '^0.10.0' },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('kafka');
      expect(result.additionalTechnologies).toContain('rabbitmq');
    });

    it('should detect messaging from Java dependencies', async () => {
      createMockProject(tempDir, {
        files: {
          'pom.xml': `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>
  </dependencies>
</project>`,
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('kafka');
    });

    it('should detect messaging from Python dependencies', async () => {
      createMockProject(tempDir, {
        files: {
          'requirements.txt': 'fastapi==0.100.0\ncelery==5.3.0\nredis==5.0.0',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('rabbitmq');
    });

    it('should detect GraphQL and tRPC', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'api-app',
          dependencies: {
            '@trpc/server': '^10.0.0',
            graphql: '^16.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('graphql');
      expect(result.additionalTechnologies).toContain('trpc');
    });

    it('should detect auth libraries', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'auth-app',
          dependencies: {
            'next-auth': '^5.0.0',
            next: '^14.0.0',
            react: '^18.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('nextauth');
    });

    it('should detect Docker infrastructure', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'docker-app' },
        files: {
          'Dockerfile': 'FROM node:20\nWORKDIR /app',
          'docker-compose.yml': 'services:\n  app:\n    build: .',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('docker');
    });

    it('should detect GitHub Actions', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'ci-app' },
        files: {
          '.github/workflows/ci.yml': 'name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('github-actions');
    });

    it('should detect Tauri from Cargo.toml', async () => {
      createMockProject(tempDir, {
        files: {
          'src-tauri/Cargo.toml': '[dependencies]\ntauri = { version = "2", features = [] }',
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('tauri');
    });

    it('should detect Tauri from npm packages', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'tauri-app',
          dependencies: {
            '@tauri-apps/api': '^2.0.0',
            react: '^18.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('tauri');
    });

    it('should detect OpenAPI/Swagger', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'openapi-app',
          dependencies: {
            '@nestjs/core': '^10.0.0',
            '@nestjs/swagger': '^7.0.0',
          },
        },
      });

      const result = await detectionService.detectProject(tempDir);

      expect(result.additionalTechnologies).toContain('openapi');
    });
  });
});
