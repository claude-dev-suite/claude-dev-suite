// SPDX-License-Identifier: MIT
/**
 * Agents Service
 *
 * Manages agents and MCP servers with caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Agent, McpServer, EnvVarConfig, AgentCategory } from '../types.js';
import { parseYamlDescription } from '../utils/yaml-utils.js';
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';
import { getLogger } from '../utils/logger.js';
import { extractEnvVar, EXCLUDED_DIRS } from '../utils/fs-utils.js';

const logger = getLogger('AgentsService');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
}

// Get dev-suite directory
function getDevSuiteDir(): string {
  // Use DEV_SUITE_DIR env var if set (Electron packaged mode)
  if (process.env.DEV_SUITE_DIR) {
    return process.env.DEV_SUITE_DIR;
  }
  // Fallback: Navigate from server/src/services to dev-suite root (development)
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
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

      // Parse skills
      const skills: string[] = [];
      const skillsMatch = frontmatter.match(/^skills:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (skillsMatch?.[1]) {
        const skillLines = skillsMatch[1].match(/^\s+-\s+(.+)$/gm);
        if (skillLines) {
          for (const line of skillLines) {
            const match = line.match(/^\s+-\s+(.+)$/);
            if (match?.[1]) skills.push(match[1].trim());
          }
        }
      }

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
        id: fileName.replace('.md', ''),
        name,
        description: description || `${name} agent`,
        category,
        skills,
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
    let requiredFor: string[] = [];
    let detectedWhen: string[] = [];

    const metadataPath = path.join(serverPath, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        description = metadata.description || name;
        shortDescription = metadata.shortDescription || '';
        category = metadata.category || 'general';
        tools = metadata.tools || [];
        requiredFor = metadata.requiredFor || [];
        detectedWhen = metadata.detectedWhen || [];

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
      requiredFor,
      detectedWhen,
      path: serverPath,
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

    return null;
  }
}
