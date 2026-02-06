// SPDX-License-Identifier: MIT
/**
 * Code Quality MCP - Type Definitions
 * Unified interfaces for multi-language code analysis
 */

// Supported languages
export type Language = 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust';

// File extensions mapping
export const LANGUAGE_EXTENSIONS: Record<Language, string[]> = {
  javascript: ['.js', '.mjs', '.cjs', '.jsx'],
  typescript: ['.ts', '.mts', '.cts', '.tsx'],
  python: ['.py', '.pyw'],
  java: ['.java'],
  go: ['.go'],
  rust: ['.rs']
};

// Severity levels
export type Severity = 'error' | 'warning' | 'info';

// Base issue interface
export interface CodeIssue {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: Severity;
  message: string;
  rule?: string;
  suggestion?: string;
}

// Complexity analysis
export interface ComplexityResult {
  file: string;
  functions: FunctionComplexity[];
  averageCyclomatic: number;
  averageCognitive: number;
  totalFunctions: number;
}

export interface FunctionComplexity {
  name: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  loc: number;
  parameters: number;
}

// Duplication detection
export interface DuplicateBlock {
  files: DuplicateLocation[];
  lines: number;
  tokens: number;
  fragment: string;
}

export interface DuplicateLocation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface DuplicationResult {
  duplicates: DuplicateBlock[];
  totalDuplicateLines: number;
  duplicationPercentage: number;
}

// Style checking
export interface StyleResult {
  tool: string;
  issues: CodeIssue[];
  errorCount: number;
  warningCount: number;
  fixableCount: number;
}

// Anti-pattern detection
export type AntiPatternType =
  | 'god-class'
  | 'long-method'
  | 'deep-nesting'
  | 'excessive-parameters'
  | 'magic-numbers'
  | 'empty-catch'
  | 'duplicate-code'
  | 'feature-envy'
  | 'data-clump'
  | 'primitive-obsession';

export interface AntiPattern {
  type: AntiPatternType;
  file: string;
  line: number;
  endLine?: number;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  suggestion: string;
}

export interface AntiPatternResult {
  patterns: AntiPattern[];
  summary: Record<AntiPatternType, number>;
}

// Dead code detection
export interface DeadCodeItem {
  type: 'function' | 'variable' | 'class' | 'export' | 'import' | 'type';
  name: string;
  file: string;
  line: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface DeadCodeResult {
  items: DeadCodeItem[];
  totalUnused: number;
  byType: Record<string, number>;
}

// Dependency analysis
export interface DependencyNode {
  file: string;
  imports: string[];
  importedBy: string[];
  depth: number;
}

export interface CircularDependency {
  cycle: string[];
  length: number;
}

export interface DependencyResult {
  graph: Record<string, DependencyNode>;
  circularDependencies: CircularDependency[];
  orphanFiles: string[];
  mostImported: { file: string; count: number }[];
  mostDependent: { file: string; count: number }[];
}

// Code metrics
export interface FileMetrics {
  file: string;
  loc: number;
  sloc: number;
  comments: number;
  blanks: number;
  functions: number;
  classes: number;
  imports: number;
  exports: number;
  complexity: number;
}

export interface MetricsResult {
  files: FileMetrics[];
  totals: {
    files: number;
    loc: number;
    sloc: number;
    comments: number;
    blanks: number;
    functions: number;
    classes: number;
  };
  averages: {
    locPerFile: number;
    functionsPerFile: number;
    commentsRatio: number;
  };
  largest: FileMetrics[];
  mostComplex: FileMetrics[];
}

// Analyzer interface
export interface LanguageAnalyzer {
  language: Language;
  extensions: string[];

  analyzeComplexity(content: string, filePath: string): ComplexityResult;
  findDuplicates(files: Map<string, string>, minLines?: number): DuplicationResult;
  checkStyle(filePath: string, content: string): Promise<StyleResult>;
  detectAntiPatterns(content: string, filePath: string): AntiPattern[];
  findDeadCode(files: Map<string, string>): DeadCodeItem[];
  calculateMetrics(content: string, filePath: string): FileMetrics;
}

// Thresholds for anti-pattern detection
export interface Thresholds {
  maxCyclomaticComplexity: number;
  maxCognitiveComplexity: number;
  maxFunctionLines: number;
  maxClassLines: number;
  maxNestingDepth: number;
  maxParameters: number;
  minDuplicateLines: number;
  maxFileLines: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  maxCyclomaticComplexity: 10,
  maxCognitiveComplexity: 15,
  maxFunctionLines: 50,
  maxClassLines: 300,
  maxNestingDepth: 4,
  maxParameters: 5,
  minDuplicateLines: 6,
  maxFileLines: 500
};

// Tool input schemas
export interface AnalyzeComplexityInput {
  path: string;
  threshold?: number;
  includeAll?: boolean;
}

export interface FindDuplicatesInput {
  path: string;
  minLines?: number;
  minTokens?: number;
}

export interface CheckStyleInput {
  path: string;
  fix?: boolean;
  rules?: string[];
}

export interface DetectAntiPatternsInput {
  path: string;
  patterns?: AntiPatternType[];
  thresholds?: Partial<Thresholds>;
}

export interface FindDeadCodeInput {
  path: string;
  includeTests?: boolean;
  confidence?: 'high' | 'medium' | 'low';
}

export interface AnalyzeDependenciesInput {
  path: string;
  maxDepth?: number;
  excludeNodeModules?: boolean;
}

export interface CodeMetricsInput {
  path: string;
  sortBy?: 'loc' | 'complexity' | 'functions';
  limit?: number;
}

// Utility functions
export function detectLanguage(filePath: string): Language | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) {
      return lang as Language;
    }
  }
  return null;
}

export function formatIssue(issue: CodeIssue): string {
  const loc = issue.column
    ? `${issue.file}:${issue.line}:${issue.column}`
    : `${issue.file}:${issue.line}`;
  const severity = issue.severity.toUpperCase().padEnd(7);
  return `${loc} ${severity} ${issue.message}${issue.rule ? ` (${issue.rule})` : ''}`;
}
