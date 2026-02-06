// SPDX-License-Identifier: MIT
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { checkAllTools } from './utils/tool-checker.js';
import { mergeSummaries } from './utils/normalizer.js';
import { scanDependencies } from './scanners/dependencies.js';
import { scanSecrets } from './scanners/secrets.js';
import { scanCode } from './scanners/code.js';
import { scanContainer } from './scanners/container.js';
import type { ScanAllResult, ScanResult } from './types.js';

// Input schemas
const ScanDependenciesSchema = z.object({
  path: z.string().describe('Absolute path to the project root'),
  packageManager: z.enum(['auto', 'npm', 'pip', 'cargo', 'go']).optional().default('auto'),
  severityThreshold: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
});

const ScanSecretsSchema = z.object({
  path: z.string().describe('Absolute path to scan for secrets'),
  tool: z.enum(['gitleaks', 'trufflehog', 'auto']).optional().default('auto'),
  scanHistory: z.boolean().optional().default(false).describe('Scan git history (slower but thorough)'),
  excludePaths: z.array(z.string()).optional().default([]),
});

const ScanCodeSchema = z.object({
  path: z.string().describe('Absolute path to scan'),
  rules: z.array(z.string()).optional().default(['p/security-audit']).describe('Semgrep rule sets'),
});

const ScanContainerSchema = z.object({
  target: z.string().describe('Docker image name or filesystem path'),
  type: z.enum(['image', 'filesystem']),
  severityThreshold: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
});

const ScanAllSchema = z.object({
  path: z.string().describe('Absolute path to the project root'),
  include: z.array(z.enum(['dependencies', 'secrets', 'code', 'container'])).optional(),
  containerTarget: z.string().optional().describe('Docker image to scan (required if container is included)'),
});

// Create server
const server = new Server(
  {
    name: 'security-scanner',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_dependencies',
      description: 'Scan project dependencies for known vulnerabilities using npm audit, pip-audit, cargo audit, or govulncheck',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the project root' },
          packageManager: {
            type: 'string',
            enum: ['auto', 'npm', 'pip', 'cargo', 'go'],
            description: 'Package manager to use (auto-detected if not specified)',
          },
          severityThreshold: {
            type: 'string',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            description: 'Only report vulnerabilities at or above this severity',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'scan_secrets',
      description: 'Scan for hardcoded secrets and credentials using gitleaks, trufflehog, or built-in patterns',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to scan' },
          tool: {
            type: 'string',
            enum: ['gitleaks', 'trufflehog', 'auto'],
            description: 'Secret scanner to use (auto selects best available)',
          },
          scanHistory: {
            type: 'boolean',
            description: 'Scan git history for secrets (slower but more thorough)',
          },
          excludePaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to exclude from scanning',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'scan_code',
      description: 'Static analysis for security vulnerabilities using Semgrep',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to scan' },
          rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Semgrep rule sets (default: p/security-audit)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'scan_container',
      description: 'Scan Docker images or filesystem for vulnerabilities using Trivy',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Docker image name or filesystem path' },
          type: {
            type: 'string',
            enum: ['image', 'filesystem'],
            description: 'Type of scan to perform',
          },
          severityThreshold: {
            type: 'string',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            description: 'Only report vulnerabilities at or above this severity',
          },
        },
        required: ['target', 'type'],
      },
    },
    {
      name: 'check_tools',
      description: 'Check which security scanning tools are installed on the system',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'scan_all',
      description: 'Run all applicable security scans in parallel',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the project root' },
          include: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['dependencies', 'secrets', 'code', 'container'],
            },
            description: 'Scan types to include (default: all except container)',
          },
          containerTarget: {
            type: 'string',
            description: 'Docker image to scan (required if container is included)',
          },
        },
        required: ['path'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'scan_dependencies': {
        const input = ScanDependenciesSchema.parse(args);
        const result = await scanDependencies(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'scan_secrets': {
        const input = ScanSecretsSchema.parse(args);
        const result = await scanSecrets(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'scan_code': {
        const input = ScanCodeSchema.parse(args);
        const result = await scanCode(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'scan_container': {
        const input = ScanContainerSchema.parse(args);
        const result = await scanContainer(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'check_tools': {
        const result = await checkAllTools();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'scan_all': {
        const input = ScanAllSchema.parse(args);
        const include = input.include || ['dependencies', 'secrets', 'code'];
        const startTime = Date.now();

        const scanPromises: Promise<{ type: string; result: ScanResult }>[] = [];

        if (include.includes('dependencies')) {
          scanPromises.push(
            scanDependencies({ path: input.path }).then(r => ({ type: 'dependencies', result: r }))
          );
        }

        if (include.includes('secrets')) {
          scanPromises.push(
            scanSecrets({ path: input.path }).then(r => ({ type: 'secrets', result: r }))
          );
        }

        if (include.includes('code')) {
          scanPromises.push(
            scanCode({ path: input.path }).then(r => ({ type: 'code', result: r }))
          );
        }

        if (include.includes('container') && input.containerTarget) {
          scanPromises.push(
            scanContainer({ target: input.containerTarget, type: 'image' }).then(r => ({ type: 'container', result: r }))
          );
        }

        const scanResults = await Promise.all(scanPromises);

        const results: ScanAllResult['results'] = {};
        const summaries: ScanResult['summary'][] = [];

        for (const { type, result } of scanResults) {
          results[type as keyof ScanAllResult['results']] = result;
          summaries.push(result.summary);
        }

        const scanAllResult: ScanAllResult = {
          timestamp: new Date(),
          totalDuration: Date.now() - startTime,
          results,
          summary: mergeSummaries(summaries),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(scanAllResult, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: errorMessage, tool: name }) }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Security Scanner MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
