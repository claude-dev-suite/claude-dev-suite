// SPDX-License-Identifier: MIT
/**
 * Agents Service
 *
 * Manages agents and MCP servers with caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Agent, McpServer, EnvVarConfig, AgentCategory } from '../types.js';
import { parseYamlDescription } from '../utils/yaml-utils.js';
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';
import { extractEnvVar, EXCLUDED_DIRS } from '../utils/fs-utils.js';
import { parseAgentSkillsStructured } from './installation/file-operations.js';
import { getDevSuiteDir } from '../utils/dev-suite-dir.js';

const logger = getLogger('AgentsService');

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
}

export class AgentsService {
  private agentsCache: CacheEntry<Agent[]> = { data: null, timestamp: 0 };
  private mcpServersCache: CacheEntry<McpServer[]> = { data: null, timestamp: 0 };

  /**
   * Check if cache is still valid
   */
  private isCacheValid<T>(cache: CacheEntry<T>): boolean {
    return cache.data !== null && Date.now() - cache.timestamp < CACHE_TTL_MS;
  }

  /**
   * Invalidate all caches
   */
  invalidateCache(): void {
    this.agentsCache.data = null;
    this.mcpServersCache.data = null;
  }

  /**
   * Get all available agents
   */
  async getAgents(forceRefresh = false): Promise<Agent[]> {
    if (!forceRefresh && this.isCacheValid(this.agentsCache)) {
      const endTimer = timeOperation(logger, 'getAgents', TIMING_THRESHOLDS.LOAD_AGENTS, { data: { forceRefresh, fromCache: true } });
      endTimer();
      return this.agentsCache.data!;
    }

    const endTimer = timeOperation(logger, 'getAgents', TIMING_THRESHOLDS.LOAD_AGENTS, { data: { forceRefresh, fromCache: false } });

    const devSuiteDir = getDevSuiteDir();
    const agentsDir = path.join(devSuiteDir, 'agents');
    const agents: Agent[] = [];

    if (!fs.existsSync(agentsDir)) {
      return agents;
    }

    const scanDir = (dir: string, category: AgentCategory = 'core'): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Use directory name as category
            const dirCategory = this.mapCategory(entry.name);
            scanDir(fullPath, dirCategory);
          } else if (entry.name.endsWith('.md')) {
            const agent = this.parseAgentFile(fullPath, entry.name, category);
            if (agent) {
              agents.push(agent);
            }
          }
        }
      } catch (error: unknown) {
        logger.warn('Failed to scan agents directory', {
          error,
          context: { dir }
        });
      }
    };

    scanDir(agentsDir);

    // Cache results
    this.agentsCache.data = agents;
    endTimer();
    this.agentsCache.timestamp = Date.now();

    return agents;
  }

  /**
   * Get all available MCP servers
   */
  async getMcpServers(forceRefresh = false): Promise<McpServer[]> {
    if (!forceRefresh && this.isCacheValid(this.mcpServersCache)) {
      return this.mcpServersCache.data!;
    }

    const devSuiteDir = getDevSuiteDir();
    const mcpDir = path.join(devSuiteDir, 'mcp-servers');
    const servers: McpServer[] = [];
    const excludedDirs = ['node_modules', 'shared', '.git', 'dist', 'build'];

    if (!fs.existsSync(mcpDir)) {
      return servers;
    }

    try {
      const entries = fs.readdirSync(mcpDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !excludedDirs.includes(entry.name) && !entry.name.startsWith('.')) {
          const serverPath = path.join(mcpDir, entry.name);
          const server = this.parseMcpServer(serverPath, entry.name);
          if (server) {
            servers.push(server);
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to scan MCP servers directory', {
        error,
        context: { mcpDir }
      });
    }

    // Cache results
    this.mcpServersCache.data = servers;
    this.mcpServersCache.timestamp = Date.now();

    return servers;
  }

  /**
   * Get required environment variables for selected MCP servers
   */
  async getRequiredEnvVars(serverNames: string[], projectPath?: string): Promise<EnvVarConfig[]> {
    const devSuiteDir = getDevSuiteDir();
    const mcpDir = path.join(devSuiteDir, 'mcp-servers');
    const envVars: EnvVarConfig[] = [];
    const seen = new Set<string>();

    for (const serverName of serverNames) {
      const metadataPath = path.join(mcpDir, serverName, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          if (metadata.envVars && Array.isArray(metadata.envVars)) {
            for (const envVar of metadata.envVars) {
              if (!seen.has(envVar.name)) {
                seen.add(envVar.name);

                let detectedValue = envVar.default || '';
                let source = detectedValue ? 'default' : 'manual';

                // skill-loader's `DEV_SUITE_ROOT` is a development-time
                // override only — the server self-resolves to its bundled
                // skills/ catalog when unset. We do NOT auto-prefill it
                // here, otherwise we'd bake an absolute path tied to the
                // dashboard's filesystem into the project's `.mcp.json`,
                // breaking portability when the project is moved or shared.

                // Try to detect value from project .env files
                if (projectPath) {
                  const detected = this.detectEnvValue(projectPath, envVar.name);
                  if (detected) {
                    detectedValue = detected.value;
                    source = detected.source;
                  }
                }

                envVars.push({
                  name: envVar.name,
                  description: envVar.description || '',
                  required: envVar.required || false,
                  default: envVar.default || '',
                  detectedValue,
                  source,
                  mcpServer: serverName,
                });
              }
            }
          }
        } catch (error: unknown) {
          logger.warn('Failed to parse MCP server metadata', {
            error,
            context: { metadataPath }
          });
        }
      }
    }

    // Sort: required first, then alphabetically
    envVars.sort((a, b) => {
      if (a.required && !b.required) return -1;
      if (!a.required && b.required) return 1;
      return a.name.localeCompare(b.name);
    });

    return envVars;
  }

  // ========== Private methods ==========

  private mapCategory(dirName: string): AgentCategory {
    const categoryMap: Record<string, AgentCategory> = {
      core: 'core',
      frontend: 'frontend',
      backend: 'backend',
      database: 'database',
      testing: 'testing',
      infrastructure: 'infrastructure',
      messaging: 'messaging',
      security: 'security',
      quality: 'quality',
    };
    return categoryMap[dirName] || 'core';
  }

  private parseAgentFile(filePath: string, fileName: string, category: AgentCategory): Agent | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.startsWith('---')) return null;

      const endIdx = content.indexOf('---', 3);
      if (endIdx < 0) return null;

      const frontmatter = content.substring(3, endIdx);

      // Parse name
      const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?/m);
      const name = nameMatch?.[1]?.trim() ?? '';
      if (!name) return null;

      // Parse description
      const description = parseYamlDescription(frontmatter);

      const agentId = fileName.replace('.md', '');

      // Parse skills with the shared structured parser (handles legacy
      // `skills:` and the new `core_skills:` / `extended_skills:` schema,
      // expands `bundle:<id>` references, deduplicates).
      const { all: skills, core: coreSkills, extended: extendedSkills } =
        parseAgentSkillsStructured(content, agentId);

      // Parse MCP servers from allowed-tools
      const mcpServers: string[] = [];
      const allowedToolsMatch = frontmatter.match(/^allowed-tools:\s*(.+)$/m);
      if (allowedToolsMatch?.[1]) {
        const tools = allowedToolsMatch[1].split(',').map((t) => t.trim());
        for (const tool of tools) {
          const mcpMatch = tool.match(/^mcp__(.+?)__/);
          if (mcpMatch?.[1] && !mcpServers.includes(mcpMatch[1])) {
            mcpServers.push(mcpMatch[1]);
          }
        }
      }

      // Also check mcp_servers field
      const mcpServersMatch = frontmatter.match(/^mcp_servers:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (mcpServersMatch?.[1]) {
        const serverLines = mcpServersMatch[1].match(/^\s+-\s+(.+)$/gm);
        if (serverLines) {
          for (const line of serverLines) {
            const match = line.match(/^\s+-\s+(.+)$/);
            if (match?.[1] && !mcpServers.includes(match[1].trim())) {
              mcpServers.push(match[1].trim());
            }
          }
        }
      }

      return {
        id: agentId,
        name,
        description: description || `${name} agent`,
        category,
        skills,
        coreSkills,
        extendedSkills,
        mcpServers,
        filePath,
      };
    } catch (error: unknown) {
      logger.warn('Failed to parse agent file', {
        error,
        context: { filePath }
      });
      return null;
    }
  }

  private parseMcpServer(serverPath: string, name: string): McpServer | null {
    let description = name;
    let shortDescription = '';
    let category = 'general';
    let tools: string[] = [];
    let envVars: EnvVarConfig[] = [];
    let recommendedFor: string[] = [];
    let detectedWhen: string[] = [];
    let isDefault = false;

    const metadataPath = path.join(serverPath, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        description = metadata.description || name;
        shortDescription = metadata.shortDescription || '';
        category = metadata.category || 'general';
        tools = metadata.tools || [];
        recommendedFor = metadata.recommendedFor || [];
        detectedWhen = metadata.detectedWhen || [];
        isDefault = metadata.isDefault === true;

        if (metadata.envVars && Array.isArray(metadata.envVars)) {
          envVars = metadata.envVars.map((ev: Record<string, unknown>) => ({
            name: ev.name as string,
            description: (ev.description as string) || '',
            required: (ev.required as boolean) || false,
            default: (ev.default as string) || '',
          }));
        }
      } catch (error: unknown) {
        logger.warn('Failed to parse MCP server metadata.json', {
          error,
          context: { metadataPath }
        });
      }
    }

    // Fallback to package.json for description
    if (description === name) {
      const pkgPath = path.join(serverPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          description = pkg.description || name;
        } catch (error: unknown) {
          logger.warn('Failed to read MCP server package.json', {
            error,
            context: { pkgPath }
          });
        }
      }
    }

    return {
      name,
      description,
      shortDescription,
      category,
      tools,
      envVars,
      recommendedFor,
      detectedWhen,
      path: serverPath,
      isDefault,
    };
  }

  private detectEnvValue(projectPath: string, varName: string): { value: string; source: string } | null {
    const envFiles = ['.env', '.env.dev', '.env.development', '.env.local'];
    const searchDirs = [projectPath];

    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          !EXCLUDED_DIRS.includes(entry.name)
        ) {
          searchDirs.push(path.join(projectPath, entry.name));
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to scan project for env files', {
        error,
        context: { projectPath }
      });
    }

    // 1. Search .env* files (KEY=VALUE format)
    for (const dir of searchDirs) {
      for (const envFile of envFiles) {
        const envPath = path.join(dir, envFile);
        if (fs.existsSync(envPath)) {
          try {
            const content = fs.readFileSync(envPath, 'utf-8');
            const value = extractEnvVar(content, varName);
            if (value) {
              const relativePath = path.relative(projectPath, envPath);
              return { value, source: `auto-detected (${relativePath})` };
            }
          } catch (error: unknown) {
            logger.warn('Failed to read env file for value detection', {
              error,
              context: { envPath }
            });
          }
        }
      }
    }

    // 2. For DATABASE_URL, try framework-specific config files
    if (varName === 'DATABASE_URL') {
      const dbUrl = this.detectDatabaseUrlFromConfig(projectPath, searchDirs);
      if (dbUrl) return dbUrl;
    }

    return null;
  }

  /**
   * Detect DATABASE_URL from framework config files:
   * - Spring Boot: application.yml / application.properties
   * - Docker Compose: docker-compose.yml (postgres/mysql services)
   */
  private detectDatabaseUrlFromConfig(
    projectPath: string,
    searchDirs: string[]
  ): { value: string; source: string } | null {
    // Search for Spring Boot config files (also in src/main/resources/)
    const configLocations: string[] = [];
    for (const dir of searchDirs) {
      configLocations.push(dir);
      const resourcesDir = path.join(dir, 'src', 'main', 'resources');
      if (fs.existsSync(resourcesDir)) {
        configLocations.push(resourcesDir);
      }
    }

    // Try application.yml / application.yaml
    for (const dir of configLocations) {
      for (const name of ['application.yml', 'application.yaml']) {
        const filePath = path.join(dir, name);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const url = this.extractJdbcUrlFromYaml(content);
            if (url) {
              const relativePath = path.relative(projectPath, filePath);
              return { value: url, source: `auto-detected (${relativePath})` };
            }
          } catch { /* skip unreadable files */ }
        }
      }

      // Try application.properties
      const propsPath = path.join(dir, 'application.properties');
      if (fs.existsSync(propsPath)) {
        try {
          const content = fs.readFileSync(propsPath, 'utf-8');
          const url = this.extractJdbcUrlFromProperties(content);
          if (url) {
            const relativePath = path.relative(projectPath, propsPath);
            return { value: url, source: `auto-detected (${relativePath})` };
          }
        } catch { /* skip unreadable files */ }
      }
    }

    // Try docker-compose.yml at project root
    for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
      const composePath = path.join(projectPath, name);
      if (fs.existsSync(composePath)) {
        try {
          const content = fs.readFileSync(composePath, 'utf-8');
          const url = this.extractDbUrlFromCompose(content);
          if (url) {
            return { value: url, source: `auto-detected (${name})` };
          }
        } catch { /* skip unreadable files */ }
      }
    }

    return null;
  }

  /**
   * Extract JDBC URL from application.yml and convert to standard DATABASE_URL format.
   * Parses spring.datasource.url, username, password using simple line matching.
   */
  private extractJdbcUrlFromYaml(content: string): string | null {
    // Match spring.datasource.url (handles both inline and nested YAML)
    const urlMatch = content.match(/^\s*url:\s*(.+)$/m);
    if (!urlMatch) return null;

    const jdbcUrl = urlMatch[1]!.trim();
    // Verify it's in a datasource context
    const urlIndex = content.indexOf(urlMatch[0]);
    const preceding = content.substring(0, urlIndex);
    if (!preceding.includes('datasource')) return null;

    const usernameMatch = content.match(/^\s*username:\s*(.+)$/m);
    const passwordMatch = content.match(/^\s*password:\s*(.+)$/m);

    return this.jdbcToStandardUrl(
      jdbcUrl,
      usernameMatch?.[1]?.trim(),
      passwordMatch?.[1]?.trim()
    );
  }

  /**
   * Extract JDBC URL from application.properties and convert to standard DATABASE_URL.
   */
  private extractJdbcUrlFromProperties(content: string): string | null {
    const urlMatch = content.match(/^spring\.datasource\.url\s*=\s*(.+)$/m);
    if (!urlMatch) return null;

    const usernameMatch = content.match(/^spring\.datasource\.username\s*=\s*(.+)$/m);
    const passwordMatch = content.match(/^spring\.datasource\.password\s*=\s*(.+)$/m);

    return this.jdbcToStandardUrl(
      urlMatch[1]!.trim(),
      usernameMatch?.[1]?.trim(),
      passwordMatch?.[1]?.trim()
    );
  }

  /**
   * Convert JDBC URL to standard database URL format.
   * jdbc:postgresql://host:port/db → postgresql://user:pass@host:port/db
   */
  private jdbcToStandardUrl(jdbcUrl: string, username?: string, password?: string): string | null {
    // Strip jdbc: prefix
    const match = jdbcUrl.match(/^jdbc:(\w+):\/\/(.+)$/);
    if (!match) return null;

    const [, protocol, hostAndPath] = match;
    const credentials = username && password
      ? `${username}:${password}@`
      : username
        ? `${username}@`
        : '';

    return `${protocol}://${credentials}${hostAndPath}`;
  }

  /**
   * Extract database URL from docker-compose.yml by finding postgres/mysql services.
   */
  private extractDbUrlFromCompose(content: string): string | null {
    // Detect postgres image
    const pgMatch = content.match(/image:\s*postgres[:\s]/);
    if (pgMatch) {
      const dbMatch = content.match(/POSTGRES_DB:\s*(\S+)/);
      const userMatch = content.match(/POSTGRES_USER:\s*(\S+)/);
      const passMatch = content.match(/POSTGRES_PASSWORD:\s*(\S+)/);
      // Find published port (host:container format)
      const portMatch = content.match(/["']?(\d+):5432["']?/);

      const db = dbMatch?.[1] || 'postgres';
      const user = userMatch?.[1] || 'postgres';
      const pass = passMatch?.[1] || '';
      const port = portMatch?.[1] || '5432';

      const credentials = pass ? `${user}:${pass}@` : `${user}@`;
      return `postgresql://${credentials}localhost:${port}/${db}`;
    }

    // Detect mysql image
    const mysqlMatch = content.match(/image:\s*mysql[:\s]/);
    if (mysqlMatch) {
      const dbMatch = content.match(/MYSQL_DATABASE:\s*(\S+)/);
      const userMatch = content.match(/MYSQL_USER:\s*(\S+)/);
      const passMatch = content.match(/MYSQL_PASSWORD:\s*(\S+)/);
      const rootPassMatch = content.match(/MYSQL_ROOT_PASSWORD:\s*(\S+)/);
      const portMatch = content.match(/["']?(\d+):3306["']?/);

      const db = dbMatch?.[1] || 'mysql';
      const user = userMatch?.[1] || 'root';
      const pass = passMatch?.[1] || rootPassMatch?.[1] || '';
      const port = portMatch?.[1] || '3306';

      const credentials = pass ? `${user}:${pass}@` : `${user}@`;
      return `mysql://${credentials}localhost:${port}/${db}`;
    }

    return null;
  }
}
