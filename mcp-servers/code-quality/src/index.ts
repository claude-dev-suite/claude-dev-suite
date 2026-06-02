#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Code Quality MCP Server
 * Provides code analysis tools: complexity, duplication, style, anti-patterns, dead code, dependencies, metrics
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  analyzeComplexity,
  formatComplexityReport,
  findDuplicates,
  formatDuplicationReport,
  checkStyle,
  formatStyleReport,
  detectAntiPatterns,
  formatAntiPatternReport,
  findDeadCode,
  formatDeadCodeReport,
  analyzeDependencies,
  formatDependencyReport,
  calculateMetrics,
  formatMetricsReport,
} from './tools/index.js';

// ── Runtime Zod schemas (mirroring JSON Schema declared in TOOLS below) ────────

const AnalyzeComplexitySchema = z.object({
  path: z.string().min(1),
  threshold: z.number().optional(),
  includeAll: z.boolean().optional(),
});

const FindDuplicatesSchema = z.object({
  path: z.string().min(1),
  minLines: z.number().optional(),
  minTokens: z.number().optional(),
});

const CheckStyleSchema = z.object({
  path: z.string().min(1),
  fix: z.boolean().optional(),
  rules: z.array(z.string()).optional(),
});

const AntiPatternTypeSchema = z.enum([
  'god-class', 'long-method', 'deep-nesting', 'excessive-parameters',
  'magic-numbers', 'empty-catch', 'duplicate-code', 'feature-envy',
  'data-clump', 'primitive-obsession',
]);

const DetectAntiPatternsSchema = z.object({
  path: z.string().min(1),
  patterns: z.array(AntiPatternTypeSchema).optional(),
  thresholds: z.object({
    maxCyclomaticComplexity: z.number().optional(),
    maxCognitiveComplexity: z.number().optional(),
    maxFunctionLines: z.number().optional(),
    maxClassLines: z.number().optional(),
    maxNestingDepth: z.number().optional(),
    maxParameters: z.number().optional(),
    maxFileLines: z.number().optional(),
  }).optional(),
});

const FindDeadCodeSchema = z.object({
  path: z.string().min(1),
  includeTests: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

const AnalyzeImportGraphSchema = z.object({
  path: z.string().min(1),
  maxDepth: z.number().optional(),
  excludeNodeModules: z.boolean().optional(),
});

const CodeMetricsSchema = z.object({
  path: z.string().min(1),
  sortBy: z.enum(['loc', 'complexity', 'functions']).optional(),
  limit: z.number().optional(),
});

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'analyze_complexity',
    description: 'Analyze cyclomatic and cognitive complexity of functions. Finds functions that are too complex and should be refactored.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to analyze'
        },
        threshold: {
          type: 'number',
          description: 'Complexity threshold to flag (default: 10)',
          default: 10
        },
        includeAll: {
          type: 'boolean',
          description: 'Include all files in report, not just complex ones',
          default: false
        }
      },
      required: ['path']
    }
  },
  {
    name: 'find_duplicates',
    description: 'Detect code duplication across files. Finds repeated code blocks that should be refactored into shared functions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to analyze'
        },
        minLines: {
          type: 'number',
          description: 'Minimum lines for duplicate detection (default: 6)',
          default: 6
        },
        minTokens: {
          type: 'number',
          description: 'Minimum tokens for duplicate detection (default: 50)',
          default: 50
        }
      },
      required: ['path']
    }
  },
  {
    name: 'check_style',
    // audit-justification: must enumerate supported linters across 5 languages so Claude routes correctly
    description: 'Run unified linting using ESLint/Biome (JS/TS), Ruff/Pylint (Python), Checkstyle (Java), golangci-lint (Go), or Clippy (Rust). Falls back to basic checks if no linter is installed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to check'
        },
        fix: {
          type: 'boolean',
          description: 'Attempt to auto-fix issues (if supported)',
          default: false
        },
        rules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only report specific rules (e.g., ["no-console", "max-line-length"])'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'detect_antipatterns',
    description: 'Detect anti-patterns: god-class, long-method, deep-nesting, excessive-parameters, magic-numbers, empty-catch, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to analyze'
        },
        patterns: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['god-class', 'long-method', 'deep-nesting', 'excessive-parameters', 'magic-numbers', 'empty-catch', 'duplicate-code', 'feature-envy', 'data-clump', 'primitive-obsession']
          },
          description: 'Only detect specific patterns'
        },
        thresholds: {
          type: 'object',
          properties: {
            maxCyclomaticComplexity: { type: 'number' },
            maxCognitiveComplexity: { type: 'number' },
            maxFunctionLines: { type: 'number' },
            maxClassLines: { type: 'number' },
            maxNestingDepth: { type: 'number' },
            maxParameters: { type: 'number' },
            maxFileLines: { type: 'number' }
          },
          description: 'Custom thresholds for detection'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'find_dead_code',
    description: 'Find unused exports, functions, variables, and imports. Identifies code that can be safely removed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to analyze'
        },
        includeTests: {
          type: 'boolean',
          description: 'Include test files in analysis',
          default: false
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Minimum confidence level for results (default: medium)',
          default: 'medium'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'analyze_import_graph',
    description: 'Analyze import graph and detect circular dependencies. Shows which files are most imported and most dependent.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to directory to analyze'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 10)',
          default: 10
        },
        excludeNodeModules: {
          type: 'boolean',
          description: 'Exclude node_modules from analysis (default: true)',
          default: true
        }
      },
      required: ['path']
    }
  },
  {
    name: 'code_metrics',
    description: 'Calculate code metrics (LOC, SLOC, comments ratio, function/class counts) for codebase size overview.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file or directory to analyze'
        },
        sortBy: {
          type: 'string',
          enum: ['loc', 'complexity', 'functions'],
          description: 'Sort files by metric (default: loc)',
          default: 'loc'
        },
        limit: {
          type: 'number',
          description: 'Limit number of files in report (default: 20)',
          default: 20
        }
      },
      required: ['path']
    }
  }
];

// Create MCP server
const server = new Server(
  {
    name: 'code-quality',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Helper: return a clean MCP error without crashing the server
  function validationError(toolName: string, issues: z.ZodIssue[]): { content: { type: 'text'; text: string }[]; isError: boolean } {
    const detail = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      content: [{ type: 'text', text: `Invalid arguments for ${toolName}: ${detail}` }],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'analyze_complexity': {
        const parsed = AnalyzeComplexitySchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await analyzeComplexity(parsed.data);
        const report = formatComplexityReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'find_duplicates': {
        const parsed = FindDuplicatesSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await findDuplicates(parsed.data);
        const report = formatDuplicationReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'check_style': {
        const parsed = CheckStyleSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await checkStyle(parsed.data);
        const report = formatStyleReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'detect_antipatterns': {
        const parsed = DetectAntiPatternsSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await detectAntiPatterns(parsed.data);
        const report = formatAntiPatternReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'find_dead_code': {
        const parsed = FindDeadCodeSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await findDeadCode(parsed.data);
        const report = formatDeadCodeReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'analyze_import_graph': {
        const parsed = AnalyzeImportGraphSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await analyzeDependencies(parsed.data);
        const report = formatDependencyReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'code_metrics': {
        const parsed = CodeMetricsSchema.safeParse(args);
        if (!parsed.success) return validationError(name, parsed.error.issues);
        const result = await calculateMetrics(parsed.data);
        const report = formatMetricsReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Code Quality MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
