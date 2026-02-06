// SPDX-License-Identifier: MIT
/**
 * Detection Service (Facade)
 *
 * Main entry point for project detection.
 * Delegates to specialized sub-services for git, database, and environment detection.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DetectionResult, EnvironmentFile, GitRepoInfo } from '../types.js';
import { fileExists, fileContains, EXCLUDED_DIRS } from '../utils/fs-utils.js';
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';

// Import sub-services
import { GitDetectionService } from './detection/git-detection.service.js';
import { DatabaseDetectionService } from './detection/database-detection.service.js';
import { EnvironmentDetectionService } from './detection/environment-detection.service.js';

// Import constants
import {
  COMMON_SUBDIRS,
  MONOREPO_INDICATORS,
  NPM_DB_RULES,
  NPM_ORM_RULES,
  JAVA_DB_RULES,
  PYTHON_DB_RULES,
  STACK_TO_AGENTS,
  STACK_TO_MCP,
} from './detection/detection.constants.js';

const logger = getLogger('DetectionService');

export class DetectionService {
  private readonly gitService: GitDetectionService;
  private readonly databaseService: DatabaseDetectionService;
  private readonly environmentService: EnvironmentDetectionService;

  constructor() {
    this.gitService = new GitDetectionService();
    this.databaseService = new DatabaseDetectionService();
    this.environmentService = new EnvironmentDetectionService();
  }

  /**
   * Detect project stack and technologies
   */
  async detectProject(projectPath: string): Promise<DetectionResult> {
    const endTimer = timeOperation(logger, 'detectProject', TIMING_THRESHOLDS.DETECTION_FULL, { data: { projectPath } });
    const result: DetectionResult = {
      projectType: 'unknown',
      frontend: { framework: '', metaFramework: '', runtime: '' },
      backend: { framework: '', metaFramework: '', runtime: '' },
      database: { dbType: '', orm: '' },
      testing: { unit: '', e2e: '' },
      isMonorepo: false,
      confidence: 0,
    };

    if (!fs.existsSync(projectPath)) {
      endTimer();
      return result;
    }

    // Build list of directories to check
    const dirsToCheck = this.buildDirectoryList(projectPath);

    // Run detectors on each directory
    for (const checkPath of dirsToCheck) {
      const isSubdir = checkPath !== projectPath;

      // Detect from package.json
      const pkgPath = path.join(checkPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf-8');
          this.detectFromPackageJson(content, result, isSubdir);
        } catch (error: unknown) {
          logger.warn('Failed to read package.json', {
            error,
            context: { path: pkgPath }
          });
        }
      }

      // Language-specific detectors
      this.detectJava(checkPath, result, isSubdir);
      this.detectPython(checkPath, result, isSubdir);
      this.detectGo(checkPath, result, isSubdir);
      this.detectRust(checkPath, result, isSubdir);
      this.detectDeno(checkPath, result, isSubdir);
    }

    // Database detection via sub-service
    this.databaseService.detectAll(dirsToCheck, result);

    // Monorepo detection
    this.detectMonorepoTools(projectPath, result);

    // Determine project type and cap confidence
    result.projectType = this.determineProjectType(result);
    result.confidence = Math.min(result.confidence, 100);

    logger.debug('Final detection result', {
      projectType: result.projectType,
      testing: result.testing,
      confidence: result.confidence,
    });

    endTimer();
    return result;
  }

  /**
   * Detect environment files and extract database URLs
   * Delegates to EnvironmentDetectionService
   */
  async detectEnvironments(projectPath: string): Promise<EnvironmentFile[]> {
    return this.environmentService.detectEnvironments(projectPath);
  }

  /**
   * Detect git repositories in the project
   * Delegates to GitDetectionService
   */
  async detectGitRepos(projectPath: string): Promise<GitRepoInfo[]> {
    return this.gitService.detectGitRepos(projectPath);
  }

  /**
   * Get recommendations based on detection results
   */
  getRecommendations(detection: DetectionResult): { agents: string[]; mcpServers: string[] } {
    const agents = new Set<string>();
    const mcpServers = new Set<string>();

    // Always recommend core agents
    agents.add('architect');
    agents.add('code-reviewer');

    // Add based on frontend
    if (detection.frontend?.framework) {
      const recs = STACK_TO_AGENTS[detection.frontend.framework];
      if (recs) recs.forEach((a) => agents.add(a));
    }
    if (detection.frontend?.metaFramework) {
      const recs = STACK_TO_AGENTS[detection.frontend.metaFramework];
      if (recs) recs.forEach((a) => agents.add(a));
    }

    // Add based on backend
    if (detection.backend?.framework) {
      const recs = STACK_TO_AGENTS[detection.backend.framework];
      if (recs) recs.forEach((a) => agents.add(a));
    }
    if (detection.backend?.runtime === 'nodejs') {
      agents.add('nodejs-expert');
      agents.add('typescript-expert');
    }

    // Add based on database
    if (detection.database?.dbType) {
      const recs = STACK_TO_MCP[detection.database.dbType];
      if (recs) recs.forEach((m) => mcpServers.add(m));
    }
    if (detection.database?.orm) {
      const agentRecs = STACK_TO_AGENTS[detection.database.orm];
      if (agentRecs) agentRecs.forEach((a) => agents.add(a));
      const mcpRecs = STACK_TO_MCP[detection.database.orm];
      if (mcpRecs) mcpRecs.forEach((m) => mcpServers.add(m));
    }

    // Add based on testing
    if (detection.testing?.unit) {
      const recs = STACK_TO_AGENTS[detection.testing.unit];
      if (recs) recs.forEach((a) => agents.add(a));
    }
    if (detection.testing?.e2e) {
      const recs = STACK_TO_AGENTS[detection.testing.e2e];
      if (recs) recs.forEach((a) => agents.add(a));
    }

    // Always recommend documentation MCP
    mcpServers.add('documentation');

    return {
      agents: Array.from(agents),
      mcpServers: Array.from(mcpServers),
    };
  }

  // ========== Private methods ==========

  private buildDirectoryList(projectPath: string): string[] {
    const dirsToCheck = [projectPath];
    logger.debug('Building directory list', { projectPath });

    // Add common subdirs if they exist
    for (const subdir of COMMON_SUBDIRS) {
      const subdirPath = path.join(projectPath, subdir);
      try {
        if (fs.existsSync(subdirPath) && fs.statSync(subdirPath).isDirectory()) {
          dirsToCheck.push(subdirPath);
        }
      } catch (error: unknown) {
        logger.warn('Failed to check subdirectory', {
          error,
          context: { subdirPath }
        });
      }
    }

    // Scan immediate subdirectories
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const name = entry.name;
          const entryPath = path.join(projectPath, name);
          if (!name.startsWith('.') && !EXCLUDED_DIRS.includes(name) && !dirsToCheck.includes(entryPath)) {
            dirsToCheck.push(entryPath);
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to scan project directory', {
        error,
        context: { projectPath }
      });
    }

    logger.debug('Directories to check', { count: dirsToCheck.length, directories: dirsToCheck });
    return dirsToCheck;
  }

  private detectFromPackageJson(content: string, result: DetectionResult, isSubdir: boolean): void {
    if (isSubdir) result.isMonorepo = true;

    // Debug: log package name if present
    const nameMatch = content.match(/"name":\s*"([^"]+)"/);
    const packageName = nameMatch ? nameMatch[1] : 'unknown';
    logger.debug('Processing package.json', { packageName, isSubdir });

    // Check for testing frameworks first with detailed logging
    const hasVitest = content.includes('"vitest"');
    const hasPlaywright = content.includes('"playwright"') || content.includes('"@playwright/test"');
    logger.debug('Testing framework check', { packageName, hasVitest, hasPlaywright, currentUnit: result.testing?.unit, currentE2e: result.testing?.e2e });

    // Frontend frameworks
    if (content.includes('"react"') && !result.frontend?.framework) {
      result.frontend = { ...result.frontend, framework: 'react' };
      result.confidence += 20;
    }
    if (content.includes('"vue"') && !result.frontend?.framework) {
      result.frontend = { ...result.frontend, framework: 'vue' };
      result.confidence += 20;
    }
    if (content.includes('"@angular/core"') && !result.frontend?.framework) {
      result.frontend = { ...result.frontend, framework: 'angular' };
      result.confidence += 20;
    }
    if (content.includes('"svelte"') && !result.frontend?.framework) {
      result.frontend = { ...result.frontend, framework: 'svelte' };
      result.confidence += 20;
    }

    // Meta-frameworks
    if (content.includes('"next"') && !result.frontend?.metaFramework) {
      result.frontend = { ...result.frontend, metaFramework: 'nextjs' };
      result.confidence += 15;
    }
    if (content.includes('"nuxt"') && !result.frontend?.metaFramework) {
      result.frontend = { ...result.frontend, metaFramework: 'nuxt' };
      result.confidence += 15;
    }
    if (content.includes('"@sveltejs/kit"') && !result.frontend?.metaFramework) {
      result.frontend = { ...result.frontend, metaFramework: 'sveltekit' };
      result.confidence += 15;
    }

    // Testing - unit
    if (content.includes('"vitest"')) {
      if (!result.testing?.unit) {
        result.testing = { ...result.testing, unit: 'vitest' };
        result.confidence += 10;
        logger.debug('Detected vitest', { confidence: result.confidence });
      }
    }
    if (content.includes('"jest"')) {
      if (!result.testing?.unit) {
        result.testing = { ...result.testing, unit: 'jest' };
        result.confidence += 10;
        logger.debug('Detected jest', { confidence: result.confidence });
      }
    }

    // Testing - e2e
    if (content.includes('"playwright"') || content.includes('"@playwright/test"')) {
      if (!result.testing?.e2e) {
        result.testing = { ...result.testing, e2e: 'playwright' };
        result.confidence += 10;
        logger.debug('Detected playwright', { confidence: result.confidence });
      }
    }
    if (content.includes('"cypress"')) {
      if (!result.testing?.e2e) {
        result.testing = { ...result.testing, e2e: 'cypress' };
        result.confidence += 10;
        logger.debug('Detected cypress', { confidence: result.confidence });
      }
    }

    // ORM
    if ((content.includes('"prisma"') || content.includes('"@prisma/client"')) && !result.database?.orm) {
      result.database = { ...result.database, orm: 'prisma' };
      result.confidence += 15;
    }
    if (content.includes('"drizzle-orm"') && !result.database?.orm) {
      result.database = { ...result.database, orm: 'drizzle' };
      result.confidence += 15;
    }

    // State management & data fetching (indicators of mature frontend)
    if (content.includes('"zustand"') || content.includes('"@tanstack/react-query"') || content.includes('"redux"')) {
      result.confidence += 5;
    }

    // Database drivers from npm packages
    if (!result.database?.dbType) {
      for (const rule of NPM_DB_RULES) {
        if (content.includes(rule.pattern)) {
          result.database = { ...result.database, dbType: rule.value };
          result.confidence += 10;
          // Some packages also indicate ORM (e.g., mongoose)
          if ('orm' in rule && rule.orm && !result.database.orm) {
            result.database = { ...result.database, orm: rule.orm };
            result.confidence += 10;
          }
          break;
        }
      }
    }

    // Additional ORM detection
    if (!result.database?.orm) {
      for (const rule of NPM_ORM_RULES) {
        if (content.includes(rule.pattern)) {
          result.database = { ...result.database, orm: rule.value };
          result.confidence += 10;
          break;
        }
      }
    }

    // Backend frameworks (Node.js)
    if (content.includes('"express"') && !result.backend?.framework) {
      result.backend = { ...result.backend, framework: 'express', runtime: 'nodejs' };
      result.confidence += 15;
    }
    if (content.includes('"fastify"') && !result.backend?.framework) {
      result.backend = { ...result.backend, framework: 'fastify', runtime: 'nodejs' };
      result.confidence += 15;
    }
    if (content.includes('"@nestjs/core"') && !result.backend?.framework) {
      result.backend = { ...result.backend, framework: 'nestjs', runtime: 'nodejs' };
      result.confidence += 15;
    }
    if (content.includes('"hono"') && !result.backend?.framework) {
      result.backend = { ...result.backend, framework: 'hono', runtime: 'nodejs' };
      result.confidence += 15;
    }

    // TypeScript detection - applies to both frontend and backend
    const hasTypescript = content.includes('"typescript"') || content.includes('"ts-node"') || content.includes('"tsx"');
    if (hasTypescript) {
      // Only add confidence once for TypeScript
      if (!result.backend?.metaFramework && result.backend?.metaFramework !== 'typescript') {
        result.confidence += 10;
      }
      // Set runtime if not already set
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'nodejs', metaFramework: 'typescript' };
      } else if (!result.backend?.metaFramework) {
        result.backend = { ...result.backend, metaFramework: 'typescript' };
      }
    }

    // Electron
    if (content.includes('"electron"') && !result.frontend?.framework) {
      result.frontend = { ...result.frontend, framework: 'electron', runtime: 'nodejs' };
      result.confidence += 15;
    }
  }

  private detectJava(checkPath: string, result: DetectionResult, isSubdir: boolean): void {
    const hasPom = fileExists(checkPath, 'pom.xml');
    const hasGradle = fileExists(checkPath, 'build.gradle') || fileExists(checkPath, 'build.gradle.kts');

    if (hasPom || hasGradle) {
      if (isSubdir) result.isMonorepo = true;
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'java' };
        result.confidence += 10;
      }

      // Detect Spring Boot framework
      if (!result.backend?.framework) {
        const isSpringBoot =
          (hasPom && fileContains(checkPath, 'pom.xml', 'spring-boot')) ||
          (hasGradle && (fileContains(checkPath, 'build.gradle', 'spring-boot') || fileContains(checkPath, 'build.gradle.kts', 'spring-boot')));

        if (isSpringBoot) {
          result.backend = { ...result.backend, framework: 'spring-boot' };
          result.confidence += 20;
        }
      }

      // Detect database from Java dependencies
      if (!result.database?.dbType) {
        const buildFiles = [];
        if (hasPom) buildFiles.push('pom.xml');
        if (fileExists(checkPath, 'build.gradle')) buildFiles.push('build.gradle');
        if (fileExists(checkPath, 'build.gradle.kts')) buildFiles.push('build.gradle.kts');

        for (const buildFile of buildFiles) {
          for (const rule of JAVA_DB_RULES) {
            if (fileContains(checkPath, buildFile, rule.pattern)) {
              result.database = { ...result.database, dbType: rule.value };
              result.confidence += 10;
              break;
            }
          }
          if (result.database?.dbType) break;
        }
      }

      // Detect JPA/Hibernate as ORM
      if (!result.database?.orm) {
        const hasJpa =
          (hasPom && (fileContains(checkPath, 'pom.xml', 'spring-boot-starter-data-jpa') || fileContains(checkPath, 'pom.xml', 'hibernate'))) ||
          (hasGradle && (fileContains(checkPath, 'build.gradle', 'spring-boot-starter-data-jpa') || fileContains(checkPath, 'build.gradle.kts', 'spring-boot-starter-data-jpa')));

        if (hasJpa) {
          result.database = { ...result.database, orm: 'jpa' };
          result.confidence += 10;
        }
      }
    }
  }

  private detectPython(checkPath: string, result: DetectionResult, isSubdir: boolean): void {
    const hasPython = fileExists(checkPath, 'requirements.txt') || fileExists(checkPath, 'pyproject.toml');

    if (hasPython) {
      if (isSubdir) result.isMonorepo = true;
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'python' };
        result.confidence += 10;
      }

      if (!result.backend?.framework) {
        if (fileContains(checkPath, 'requirements.txt', 'fastapi') || fileContains(checkPath, 'pyproject.toml', 'fastapi')) {
          result.backend = { ...result.backend, framework: 'fastapi' };
          result.confidence += 15;
        } else if (fileContains(checkPath, 'requirements.txt', 'django') || fileContains(checkPath, 'pyproject.toml', 'django')) {
          result.backend = { ...result.backend, framework: 'django' };
          result.confidence += 15;
        } else if (fileContains(checkPath, 'requirements.txt', 'flask') || fileContains(checkPath, 'pyproject.toml', 'flask')) {
          result.backend = { ...result.backend, framework: 'flask' };
          result.confidence += 15;
        }
      }

      if (!result.testing?.unit) {
        if (fileContains(checkPath, 'requirements.txt', 'pytest') || fileContains(checkPath, 'pyproject.toml', 'pytest')) {
          result.testing = { ...result.testing, unit: 'pytest' };
          result.confidence += 10;
        }
      }

      // Detect database from Python dependencies
      if (!result.database?.dbType) {
        const depFiles = ['requirements.txt', 'pyproject.toml'];
        for (const depFile of depFiles) {
          if (fileExists(checkPath, depFile)) {
            for (const rule of PYTHON_DB_RULES) {
              if (fileContains(checkPath, depFile, rule.pattern)) {
                result.database = { ...result.database, dbType: rule.value };
                result.confidence += 10;
                break;
              }
            }
            if (result.database?.dbType) break;
          }
        }
      }

      // Detect SQLAlchemy ORM
      if (!result.database?.orm) {
        if (fileContains(checkPath, 'requirements.txt', 'sqlalchemy') || fileContains(checkPath, 'pyproject.toml', 'sqlalchemy')) {
          result.database = { ...result.database, orm: 'sqlalchemy' };
          result.confidence += 10;
        }
      }
    }
  }

  private detectGo(checkPath: string, result: DetectionResult, isSubdir: boolean): void {
    if (fileExists(checkPath, 'go.mod')) {
      if (isSubdir) result.isMonorepo = true;
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'go' };
        result.confidence += 10;
      }
      if (!result.backend?.framework) {
        if (fileContains(checkPath, 'go.mod', 'gin-gonic')) {
          result.backend = { ...result.backend, framework: 'gin' };
          result.confidence += 15;
        } else if (fileContains(checkPath, 'go.mod', 'gofiber')) {
          result.backend = { ...result.backend, framework: 'fiber' };
          result.confidence += 15;
        }
      }
    }
  }

  private detectRust(checkPath: string, result: DetectionResult, isSubdir: boolean): void {
    if (fileExists(checkPath, 'Cargo.toml')) {
      if (isSubdir) result.isMonorepo = true;
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'rust' };
        result.confidence += 10;
      }
      if (!result.backend?.framework) {
        if (fileContains(checkPath, 'Cargo.toml', 'actix-web')) {
          result.backend = { ...result.backend, framework: 'actix' };
          result.confidence += 15;
        } else if (fileContains(checkPath, 'Cargo.toml', 'axum')) {
          result.backend = { ...result.backend, framework: 'axum' };
          result.confidence += 15;
        }
      }
    }
  }

  private detectDeno(checkPath: string, result: DetectionResult, isSubdir: boolean): void {
    if (fileExists(checkPath, 'deno.json') || fileExists(checkPath, 'deno.jsonc')) {
      if (isSubdir) result.isMonorepo = true;
      if (!result.backend?.runtime) {
        result.backend = { ...result.backend, runtime: 'deno' };
        result.confidence += 10;
      }
      if (!result.backend?.framework) {
        if (fileContains(checkPath, 'deno.json', 'fresh')) {
          result.backend = { ...result.backend, framework: 'fresh' };
          result.confidence += 15;
        }
      }
    }
  }

  private detectMonorepoTools(projectPath: string, result: DetectionResult): void {
    // Check for monorepo tool config files
    for (const indicator of MONOREPO_INDICATORS) {
      if (fileExists(projectPath, indicator)) {
        if (!result.isMonorepo) {
          result.isMonorepo = true;
          result.confidence += 5;
        }
        return;
      }
    }

    // Check for npm/yarn workspaces
    if (fileExists(projectPath, 'package.json') && fileContains(projectPath, 'package.json', '"workspaces"')) {
      if (!result.isMonorepo) {
        result.isMonorepo = true;
        result.confidence += 5;
      }
    }
  }

  private determineProjectType(result: DetectionResult): string {
    const hasFrontend = !!result.frontend?.framework;
    const hasBackend = !!result.backend?.framework || !!result.backend?.runtime;
    const isMCP = result.backend?.framework === 'mcp';
    const isCLI = result.backend?.framework === 'cli';
    const isElectron = result.frontend?.framework === 'electron';

    if (isMCP) return 'mcp-server';
    if (isCLI) return 'cli-tool';
    if (isElectron) return 'desktop';
    if (hasFrontend && hasBackend) return 'fullstack';
    if (hasFrontend) return 'frontend';
    if (hasBackend) return 'backend';
    if (result.isMonorepo) return 'monorepo';

    return 'unknown';
  }
}
