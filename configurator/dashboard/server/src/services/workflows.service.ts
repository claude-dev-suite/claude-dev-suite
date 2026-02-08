// SPDX-License-Identifier: MIT
/**
 * Orchestrator Workflow Service
 *
 * Manages workflow templates and MCP server suggestions.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { ManagementService } from './management.service.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

// Agent role mapping - roles resolve to actual installed agents
const AGENT_ROLES: Record<string, string[]> = {
  'backend': ['spring-boot-expert', 'nestjs-expert', 'fastapi-expert', 'go-expert', 'rust-expert', 'deno-expert'],
  'frontend': ['react-expert', 'vue-expert', 'svelte-expert', 'nextjs-expert'],
  'testing': ['vitest-expert', 'playwright-expert', 'qa-expert'],
  'testing-backend': ['spring-boot-integration-test-expert', 'qa-expert'],
  'testing-frontend': ['vitest-expert', 'playwright-expert'],
  'database': ['prisma-expert', 'sql-expert', 'mongodb-expert'],
  'infra': ['docker-expert', 'devops-expert']
};

// Map backend agents to their preferred testing agent
const BACKEND_TESTING_MAP: Record<string, string> = {
  'spring-boot-expert': 'spring-boot-integration-test-expert',
  'nestjs-expert': 'vitest-expert',
  'fastapi-expert': 'qa-expert',
  'go-expert': 'qa-expert',
  'rust-expert': 'qa-expert',
  'deno-expert': 'vitest-expert'
};

// MCP keyword mapping for auto-suggestions
const MCP_KEYWORDS: Record<string, { keywords: string[]; agents: string[] }> = {
  'api-tester': {
    keywords: ['api', 'endpoint', 'rest', 'http', 'request', 'response', 'test api', 'postman', 'insomnia'],
    agents: ['nestjs-expert', 'spring-boot-expert', 'fastapi-expert', 'go-expert', 'rust-expert']
  },
  'database-query': {
    keywords: ['database', 'sql', 'query', 'table', 'migration', 'schema', 'postgres', 'mysql', 'mongodb'],
    agents: ['sql-expert', 'prisma-expert', 'mongodb-expert']
  },
  'documentation': {
    keywords: ['docs', 'documentation', 'how to', 'reference', 'guide', 'learn', 'tutorial'],
    agents: ['*'] // All agents benefit
  },
  'docker-manager': {
    keywords: ['docker', 'container', 'compose', 'image', 'deploy', 'kubernetes', 'k8s'],
    agents: ['docker-expert', 'devops-expert']
  },
  'security-scanner': {
    keywords: ['security', 'vulnerability', 'audit', 'owasp', 'authentication', 'auth', 'xss', 'injection'],
    agents: ['security-expert']
  },
  'api-explorer': {
    keywords: ['openapi', 'swagger', 'api schema', 'endpoints', 'spec', 'contract'],
    agents: ['architect', 'nestjs-expert', 'spring-boot-expert', 'fastapi-expert']
  },
  'log-analyzer': {
    keywords: ['logs', 'error', 'debug', 'trace', 'stack', 'exception', 'monitoring'],
    agents: ['log-analyst', 'performance-expert', 'devops-expert']
  },
  'performance-profiler': {
    keywords: ['performance', 'slow', 'optimize', 'profiling', 'memory', 'cpu', 'bottleneck', 'latency'],
    agents: ['performance-expert']
  },
  'code-quality': {
    keywords: ['lint', 'quality', 'code review', 'refactor', 'clean', 'complexity', 'duplication'],
    agents: ['code-reviewer', 'qa-expert', 'architect']
  }
};

interface SubTask {
  agentId: string;
  taskTemplate: string;
  dependencies: string[];
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  category: string;
  subTasks: SubTask[];
  mcpServers: string[];
}

interface ResolvedWorkflow extends Workflow {
  compatible: boolean;
  missingAgents: string[];
  missingMcp: string[];
}

interface McpSuggestion {
  serverName: string;
  score: number;
  reason: string;
  autoSuggested: boolean;
  required: boolean;
}

// Built-in workflow templates
const BUILTIN_WORKFLOWS: Workflow[] = [
  {
    id: 'frontend-feature',
    name: 'Frontend Feature',
    description: 'Implement a frontend feature',
    category: 'builtin',
    subTasks: [
      { agentId: '{frontend}', taskTemplate: 'Implement the UI component for: {feature}', dependencies: [] },
      { agentId: '{testing}', taskTemplate: 'Write unit tests for: {feature}', dependencies: ['{frontend}'] }
    ],
    mcpServers: ['documentation']
  },
  {
    id: 'backend-feature',
    name: 'Backend Feature',
    description: 'Implement a backend feature with API endpoints',
    category: 'builtin',
    subTasks: [
      { agentId: 'architect', taskTemplate: 'Design the API structure for: {feature}', dependencies: [] },
      { agentId: '{backend}', taskTemplate: 'Implement backend logic for: {feature}', dependencies: ['architect'] },
      { agentId: '{testing}', taskTemplate: 'Write integration tests for: {feature}', dependencies: ['{backend}'] }
    ],
    mcpServers: ['documentation', 'api-tester']
  },
  {
    id: 'fullstack-feature',
    name: 'Full Stack Feature',
    description: 'Implement a complete feature with frontend and backend',
    category: 'builtin',
    subTasks: [
      { agentId: 'architect', taskTemplate: 'Design the architecture for: {feature}', dependencies: [] },
      { agentId: '{backend}', taskTemplate: 'Implement backend API for: {feature}', dependencies: ['architect'] },
      { agentId: '{frontend}', taskTemplate: 'Implement frontend UI for: {feature}', dependencies: ['architect'] },
      { agentId: '{testing}', taskTemplate: 'Write unit tests for: {feature}', dependencies: ['{backend}', '{frontend}'] }
    ],
    mcpServers: ['documentation', 'api-tester']
  },
  {
    id: 'testing-suite',
    name: 'Testing Suite',
    description: 'Create comprehensive test coverage',
    category: 'builtin',
    subTasks: [
      { agentId: '{testing}', taskTemplate: 'Write unit/integration tests for: {component}', dependencies: [] }
    ],
    mcpServers: ['documentation']
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review and improve code quality',
    category: 'builtin',
    subTasks: [
      { agentId: 'code-reviewer', taskTemplate: 'Review code quality and patterns in: {scope}', dependencies: [] },
      { agentId: 'qa-expert', taskTemplate: 'Quality analysis for: {scope}', dependencies: [] }
    ],
    mcpServers: ['code-quality', 'documentation']
  },
  {
    id: 'bug-fix',
    name: 'Bug Fix',
    description: 'Investigate and fix a bug',
    category: 'builtin',
    subTasks: [
      { agentId: 'code-reviewer', taskTemplate: 'Analyze and identify the bug: {bug}', dependencies: [] },
      { agentId: '{testing}', taskTemplate: 'Write regression test for: {bug}', dependencies: ['code-reviewer'] }
    ],
    mcpServers: ['documentation', 'code-quality']
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Security review and vulnerability scan',
    category: 'builtin',
    subTasks: [
      { agentId: 'security-expert', taskTemplate: 'Security audit for: {scope}', dependencies: [] },
      { agentId: 'code-reviewer', taskTemplate: 'Review security fixes for: {scope}', dependencies: ['security-expert'] }
    ],
    mcpServers: ['security-scanner', 'documentation']
  }
];

export class WorkflowsService {
  private managementService = new ManagementService();

  /**
   * Resolve a role placeholder to an actual installed agent
   */
  private resolveAgentRole(
    agentIdOrRole: string,
    installedAgents: string[],
    context: { backendAgent?: string; frontendAgent?: string } = {}
  ): string | null {
    // Check if it's a role placeholder like '{backend}'
    const roleMatch = agentIdOrRole.match(/^\{(\w+)\}$/);
    if (roleMatch) {
      const role = roleMatch[1];
      if (!role) return null;

      // Special handling for testing role - prefer backend-specific testing agent
      if (role === 'testing' && context.backendAgent) {
        const preferredTestAgent = BACKEND_TESTING_MAP[context.backendAgent];
        if (preferredTestAgent && installedAgents.includes(preferredTestAgent)) {
          return preferredTestAgent;
        }
      }

      const candidates = AGENT_ROLES[role];
      // Return first installed candidate
      return candidates?.find((a: string) => installedAgents.includes(a)) ?? null;
    }
    // It's a direct agent ID
    return installedAgents.includes(agentIdOrRole) ? agentIdOrRole : null;
  }

  /**
   * Analyze prompt for MCP suggestions
   */
  analyzePromptForMcp(prompt: string, selectedAgents: string[] = []): McpSuggestion[] {
    const suggestions: McpSuggestion[] = [];
    const promptLower = prompt.toLowerCase();

    for (const [serverName, config] of Object.entries(MCP_KEYWORDS)) {
      let score = 0;
      const matchedKeywords: string[] = [];

      // Keyword matching
      for (const keyword of config.keywords) {
        if (promptLower.includes(keyword)) {
          score += 10;
          matchedKeywords.push(keyword);
        }
      }

      // Agent-based boost
      if (config.agents.includes('*') ||
          selectedAgents.some(a => config.agents.includes(a))) {
        score += 5;
      }

      if (score > 0) {
        suggestions.push({
          serverName,
          score,
          reason: matchedKeywords.length > 0
            ? `Matches: ${matchedKeywords.join(', ')}`
            : 'Recommended for selected agents',
          autoSuggested: true,
          required: false
        });
      }
    }

    // Sort by score and return top suggestions
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  /**
   * Load custom workflows from project
   */
  async loadCustomWorkflows(projectPath: string): Promise<Workflow[]> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const workflowsPath = path.join(projectPath, '.dev-suite-workflows.json');
    try {
      const content = await fs.readFile(workflowsPath, 'utf-8');
      const data = JSON.parse(content);
      return data.customWorkflows || [];
    } catch (error: unknown) {
      // No custom workflows file exists or it's invalid - return empty array
      return [];
    }
  }

  /**
   * Save custom workflows to project
   */
  async saveCustomWorkflows(projectPath: string, customWorkflows: Workflow[]): Promise<void> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const workflowsPath = path.join(projectPath, '.dev-suite-workflows.json');
    const data = {
      version: '1.0.0',
      customWorkflows
    };
    await fs.writeFile(workflowsPath, JSON.stringify(data, null, 2));
  }

  /**
   * Get all workflows (builtin + custom) filtered by installed agents
   */
  async getAllWorkflows(projectPath: string): Promise<{ builtin: ResolvedWorkflow[]; custom: Workflow[] }> {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const customWorkflows = await this.loadCustomWorkflows(projectPath);

    // Get installed components
    const installed = await this.managementService.getInstalledComponents(projectPath);
    const installedAgents = installed.agents || [];
    const installedMcp = installed.mcpServers || [];

    // Filter builtin workflows - resolve role placeholders
    const compatibleBuiltin: ResolvedWorkflow[] = BUILTIN_WORKFLOWS.map(workflow => {
      const missingAgents: string[] = [];
      const resolvedSubTasks: SubTask[] = [];

      // First pass: resolve backend and frontend to build context
      const context: { backendAgent?: string; frontendAgent?: string } = {};
      for (const task of workflow.subTasks) {
        if (task.agentId === '{backend}') {
          const resolved = this.resolveAgentRole(task.agentId, installedAgents);
          if (resolved) context.backendAgent = resolved;
        }
        if (task.agentId === '{frontend}') {
          const resolved = this.resolveAgentRole(task.agentId, installedAgents);
          if (resolved) context.frontendAgent = resolved;
        }
      }

      // Second pass: resolve all agents with context
      for (const task of workflow.subTasks) {
        const resolved = this.resolveAgentRole(task.agentId, installedAgents, context);
        if (resolved) {
          // Also resolve dependencies with context
          const resolvedDeps = task.dependencies.map(dep => {
            const resolvedDep = this.resolveAgentRole(dep, installedAgents, context);
            return resolvedDep || dep;
          });
          resolvedSubTasks.push({ ...task, agentId: resolved, dependencies: resolvedDeps });
        } else {
          // Could not resolve - add to missing
          const roleName = task.agentId.match(/^\{(\w+)\}$/)
            ? task.agentId.replace(/[{}]/g, '') + ' expert'
            : task.agentId;
          if (!missingAgents.includes(roleName)) {
            missingAgents.push(roleName);
          }
        }
      }

      const missingMcp = (workflow.mcpServers || []).filter(m => !installedMcp.includes(m));

      return {
        ...workflow,
        subTasks: resolvedSubTasks.length > 0 ? resolvedSubTasks : workflow.subTasks,
        compatible: missingAgents.length === 0,
        missingAgents,
        missingMcp
      };
    });

    // Sort: compatible first, then by name
    compatibleBuiltin.sort((a, b) => {
      if (a.compatible && !b.compatible) return -1;
      if (!a.compatible && b.compatible) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      builtin: compatibleBuiltin,
      custom: customWorkflows
    };
  }
}
