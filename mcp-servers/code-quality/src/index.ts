#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Code Quality MCP Server
 *
 * Structural analysis on tree-sitter syntax trees (JS/TS/TSX, Python, Go,
 * Java, Rust, C#): complexity, metrics, smells, clones, import graph with
 * boundary rules, dead code; plus the project's own linters/type-checkers,
 * coverage ingestion and a baseline quality gate.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

import {
  AnalyzeComplexitySchema,
  AnalyzeCoverageSchema,
  AnalyzeImportGraphSchema,
  CheckStyleSchema,
  CheckTypesSchema,
  CodeMetricsSchema,
  DetectAntiPatternsSchema,
  FindDeadCodeSchema,
  FindDuplicatesSchema,
  QualityGateSchema,
  jsonSchema,
} from './schemas.js';
import type { ToolResult } from './core/report.js';
import { dispatch } from './dispatch.js';
import { analyzeComplexity } from './tools/complexity.js';
import { findDuplicates } from './tools/duplicates.js';
import { runLintTool } from './tools/lint.js';
import { detectAntiPatterns } from './tools/antipatterns.js';
import { findDeadCode } from './tools/deadcode.js';
import { analyzeImportGraph } from './tools/import-graph.js';
import { codeMetrics } from './tools/metrics.js';
import { analyzeCoverage } from './tools/coverage.js';
import { qualityGate } from './tools/quality-gate.js';

interface ToolSpec {
  tool: Tool;
  schema: z.ZodType;
  run(args: any): Promise<ToolResult>;
}

const SPECS: ToolSpec[] = [
  {
    tool: {
      name: 'analyze_complexity',
      description: 'Per-function cyclomatic, cognitive (Sonar), nesting, Halstead and maintainability index from tree-sitter.',
      inputSchema: jsonSchema(AnalyzeComplexitySchema) as Tool['inputSchema'],
    },
    schema: AnalyzeComplexitySchema,
    run: (a) => analyzeComplexity(a),
  },
  {
    tool: {
      name: 'find_duplicates',
      description: 'Cross-file token clone detection, incl. renamed identifiers; every match re-verified; duplication %.',
      inputSchema: jsonSchema(FindDuplicatesSchema) as Tool['inputSchema'],
    },
    schema: FindDuplicatesSchema,
    run: (a) => findDuplicates(a),
  },
  {
    tool: {
      name: 'check_style',
      description: "Run the project's linters/formatters (ESLint, Biome, Prettier, Ruff, golangci-lint, Clippy…) once per project.",
      inputSchema: jsonSchema(CheckStyleSchema) as Tool['inputSchema'],
    },
    schema: CheckStyleSchema,
    run: (a) => runLintTool(a, ['lint', 'format'], 'Style check', a.format ?? 'markdown'),
  },
  {
    tool: {
      name: 'check_types',
      description: "Run the project's type-checkers (tsc, mypy, pyright) with its own config; normalized diagnostics or SARIF.",
      inputSchema: jsonSchema(CheckTypesSchema) as Tool['inputSchema'],
    },
    schema: CheckTypesSchema,
    run: (a) => runLintTool(a, ['types'], 'Type check', a.format ?? 'markdown'),
  },
  {
    tool: {
      name: 'detect_antipatterns',
      description: 'Code smells: god class, long/complex method, deep nesting, many params, data clumps, empty catch, duplicates…',
      inputSchema: jsonSchema(DetectAntiPatternsSchema) as Tool['inputSchema'],
    },
    schema: DetectAntiPatternsSchema,
    run: (a) => detectAntiPatterns(a, a.format ?? 'markdown'),
  },
  {
    tool: {
      name: 'find_dead_code',
      description: 'Unused files, exports and dependencies (JS/TS), unused imports/definitions (Python), never-called private functions.',
      inputSchema: jsonSchema(FindDeadCodeSchema) as Tool['inputSchema'],
    },
    schema: FindDeadCodeSchema,
    run: (a) => findDeadCode(a),
  },
  {
    tool: {
      name: 'analyze_import_graph',
      description: 'Resolved import graph (tsconfig paths, workspaces, Python/Go/Java/Rust): cycles, orphans, fan-in/out, boundary rules.',
      inputSchema: jsonSchema(AnalyzeImportGraphSchema) as Tool['inputSchema'],
    },
    schema: AnalyzeImportGraphSchema,
    run: (a) => analyzeImportGraph(a),
  },
  {
    tool: {
      name: 'code_metrics',
      description: 'Code/comment/blank lines, functions, classes, imports/exports, complexity and maintainability per file and language.',
      inputSchema: jsonSchema(CodeMetricsSchema) as Tool['inputSchema'],
    },
    schema: CodeMetricsSchema,
    run: (a) => codeMetrics(a),
  },
  {
    tool: {
      name: 'analyze_coverage',
      description: 'Read LCOV/Cobertura/JaCoCo coverage: per-file and patch coverage, risky untested functions ranked by CRAP.',
      inputSchema: jsonSchema(AnalyzeCoverageSchema) as Tool['inputSchema'],
    },
    schema: AnalyzeCoverageSchema,
    run: (a) => analyzeCoverage(a),
  },
  {
    tool: {
      name: 'quality_gate',
      description: 'Save a findings baseline (dry run unless confirm) or check new issues against it and thresholds: pass/fail.',
      inputSchema: jsonSchema(QualityGateSchema) as Tool['inputSchema'],
    },
    schema: QualityGateSchema,
    run: (a) => qualityGate(a),
  },
];

const TOOLS: Tool[] = SPECS.map((s) => s.tool);

const server = new Server(
  {
    name: 'code-quality',
    version: '1.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const spec = SPECS.find((s) => s.tool.name === request.params.name);
  if (!spec) return { content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }], isError: true };
  return dispatch(spec.tool.name, spec.schema, spec.run, request.params.arguments);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Code Quality MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
