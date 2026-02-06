// SPDX-License-Identifier: MIT
#!/usr/bin/env node
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

import type {
  AnalyzeComplexityInput,
  FindDuplicatesInput,
  CheckStyleInput,
  DetectAntiPatternsInput,
  FindDeadCodeInput,
  AnalyzeDependenciesInput,
  CodeMetricsInput,
} from './types.js';

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
    description: 'Calculate code metrics: LOC, SLOC, comments ratio, function counts, class counts. Provides an overview of codebase size and structure.',
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

  try {
    switch (name) {
      case 'analyze_complexity': {
        const input = args as unknown as AnalyzeComplexityInput;
        const result = await analyzeComplexity(input);
        const report = formatComplexityReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'find_duplicates': {
        const input = args as unknown as FindDuplicatesInput;
        const result = await findDuplicates(input);
        const report = formatDuplicationReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'check_style': {
        const input = args as unknown as CheckStyleInput;
        const result = await checkStyle(input);
        const report = formatStyleReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'detect_antipatterns': {
        const input = args as unknown as DetectAntiPatternsInput;
        const result = await detectAntiPatterns(input);
        const report = formatAntiPatternReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'find_dead_code': {
        const input = args as unknown as FindDeadCodeInput;
        const result = await findDeadCode(input);
        const report = formatDeadCodeReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'analyze_import_graph': {
        const input = args as unknown as AnalyzeDependenciesInput;
        const result = await analyzeDependencies(input);
        const report = formatDependencyReport(result);
        return {
          content: [{ type: 'text', text: report }]
        };
      }

      case 'code_metrics': {
        const input = args as unknown as CodeMetricsInput;
        const result = await calculateMetrics(input);
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
