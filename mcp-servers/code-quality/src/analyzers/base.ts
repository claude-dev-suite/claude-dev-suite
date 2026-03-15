// SPDX-License-Identifier: MIT
/**
 * Base Analyzer - Common analysis logic shared across languages
 */

import type {
  Language,
  ComplexityResult,
  FunctionComplexity,
  DuplicationResult,
  DuplicateBlock,
  StyleResult,
  AntiPattern,
  DeadCodeItem,
  FileMetrics,
  LanguageAnalyzer,
  Thresholds,
  DEFAULT_THRESHOLDS
} from '../types.js';

// Common regex patterns
export const PATTERNS = {
  // Comments
  singleLineComment: /\/\/.*$/gm,
  multiLineComment: /\/\*[\s\S]*?\*\//g,
  hashComment: /#.*$/gm,

  // Control flow (for complexity)
  ifStatement: /\bif\s*\(/g,
  elseIfStatement: /\belse\s+if\s*\(/g,
  elseStatement: /\belse\s*{/g,
  forLoop: /\bfor\s*\(/g,
  whileLoop: /\bwhile\s*\(/g,
  doWhile: /\bdo\s*{/g,
  switchCase: /\bcase\s+/g,
  catchBlock: /\bcatch\s*\(/g,
  ternary: /\?[^?:]*:/g,
  logicalAnd: /&&/g,
  logicalOr: /\|\|/g,
  nullCoalesce: /\?\?/g,

  // Nesting detection
  openBrace: /{/g,
  closeBrace: /}/g,

  // Magic numbers
  magicNumber: /(?<![a-zA-Z0-9_])[0-9]+(?:\.[0-9]+)?(?![a-zA-Z0-9_])/g,

  // Empty catch
  emptyCatch: /catch\s*\([^)]*\)\s*{\s*}/g,
};

// Allowed magic numbers (common constants)
export const ALLOWED_NUMBERS = new Set([
  '0', '1', '2', '-1', '100', '1000', '10', '60', '24', '365', '12',
  '0.0', '1.0', '0.5', '2.0'
]);

/**
 * Calculate cyclomatic complexity from code
 */
export function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Remove comments and strings to avoid false positives
  const cleanCode = removeCommentsAndStrings(code);

  // Count decision points
  complexity += (cleanCode.match(PATTERNS.ifStatement) || []).length;
  complexity += (cleanCode.match(PATTERNS.elseIfStatement) || []).length;
  complexity += (cleanCode.match(PATTERNS.forLoop) || []).length;
  complexity += (cleanCode.match(PATTERNS.whileLoop) || []).length;
  complexity += (cleanCode.match(PATTERNS.doWhile) || []).length;
  complexity += (cleanCode.match(PATTERNS.switchCase) || []).length;
  complexity += (cleanCode.match(PATTERNS.catchBlock) || []).length;
  complexity += (cleanCode.match(PATTERNS.ternary) || []).length;
  complexity += (cleanCode.match(PATTERNS.logicalAnd) || []).length;
  complexity += (cleanCode.match(PATTERNS.logicalOr) || []).length;
  complexity += (cleanCode.match(PATTERNS.nullCoalesce) || []).length;

  return complexity;
}

/**
 * Calculate cognitive complexity (more nuanced than cyclomatic)
 */
export function calculateCognitiveComplexity(code: string): number {
  const cleanCode = removeCommentsAndStrings(code);
  const lines = cleanCode.split('\n');

  let complexity = 0;
  let nestingLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track nesting
    const opens = (trimmed.match(PATTERNS.openBrace) || []).length;
    const closes = (trimmed.match(PATTERNS.closeBrace) || []).length;

    // Add complexity with nesting penalty
    if (/\b(if|for|while|switch)\b/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
    if (/\belse\s+if\b/.test(trimmed)) {
      complexity += 1;
    }
    if (/\belse\b/.test(trimmed) && !/\belse\s+if\b/.test(trimmed)) {
      complexity += 1;
    }
    if (/\bcatch\b/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }
    if (/(\?\?|&&|\|\|)/.test(trimmed)) {
      complexity += 1;
    }
    if (/\?[^?:]+:/.test(trimmed)) {
      complexity += 1 + nestingLevel;
    }

    // Recursion adds extra complexity
    if (/\bfunction\s+(\w+).*\1\s*\(/.test(trimmed)) {
      complexity += 1;
    }

    nestingLevel += opens - closes;
    if (nestingLevel < 0) nestingLevel = 0;
  }

  return complexity;
}

/**
 * Calculate max nesting depth
 */
export function calculateNestingDepth(code: string): number {
  const cleanCode = removeCommentsAndStrings(code);
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of cleanCode) {
    if (char === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}') {
      currentDepth--;
    }
  }

  return maxDepth;
}

/**
 * Remove comments and string literals from code
 */
export function removeCommentsAndStrings(code: string): string {
  // Remove multi-line comments
  let result = code.replace(PATTERNS.multiLineComment, '');
  // Remove single-line comments
  result = result.replace(PATTERNS.singleLineComment, '');
  // Remove string literals
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``');

  return result;
}

/**
 * Find duplicate code blocks using token-based comparison
 */
export function findDuplicateBlocks(
  files: Map<string, string>,
  minLines: number = 6,
  minTokens: number = 50
): DuplicateBlock[] {
  const duplicates: DuplicateBlock[] = [];
  const blocks: Map<string, { file: string; startLine: number; endLine: number }[]> = new Map();

  for (const [filePath, content] of files) {
    const lines = content.split('\n');

    // Sliding window to find blocks
    for (let start = 0; start <= lines.length - minLines; start++) {
      const blockLines = lines.slice(start, start + minLines);
      const normalized = blockLines
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .join('\n');

      // Skip blocks that are too short
      if (normalized.split(/\s+/).length < minTokens / 2) continue;

      const hash = simpleHash(normalized);

      if (!blocks.has(hash)) {
        blocks.set(hash, []);
      }

      blocks.get(hash)!.push({
        file: filePath,
        startLine: start + 1,
        endLine: start + minLines
      });
    }
  }

  // Filter to only actual duplicates
  for (const [hash, locations] of blocks) {
    if (locations.length > 1) {
      // Verify they're not from the same location
      const unique = locations.filter((loc, i, arr) =>
        !arr.slice(0, i).some(other =>
          other.file === loc.file &&
          Math.abs(other.startLine - loc.startLine) < minLines
        )
      );

      if (unique.length > 1) {
        duplicates.push({
          files: unique,
          lines: minLines,
          tokens: minLines * 10, // Approximate
          fragment: '' // Would need to store actual content
        });
      }
    }
  }

  return duplicates;
}

/**
 * Simple hash function for duplicate detection
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Count lines of code metrics
 */
export function countLines(content: string): { loc: number; sloc: number; comments: number; blanks: number } {
  const lines = content.split('\n');
  let loc = lines.length;
  let blanks = 0;
  let comments = 0;

  let inMultiLineComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      blanks++;
      continue;
    }

    // Multi-line comment handling
    if (inMultiLineComment) {
      comments++;
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*')) {
      comments++;
      if (!trimmed.includes('*/')) {
        inMultiLineComment = true;
      }
      continue;
    }

    // Single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      comments++;
    }
  }

  const sloc = loc - blanks - comments;

  return { loc, sloc, comments, blanks };
}

/**
 * Find magic numbers in code
 */
export function findMagicNumbers(
  content: string,
  filePath: string,
  line: number
): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  const cleanCode = removeCommentsAndStrings(content);

  const matches = cleanCode.matchAll(PATTERNS.magicNumber);
  for (const match of matches) {
    const num = match[0];
    if (!ALLOWED_NUMBERS.has(num)) {
      patterns.push({
        type: 'magic-numbers',
        file: filePath,
        line: line,
        severity: 'info',
        message: `Magic number ${num} should be extracted to a named constant`,
        details: { number: num },
        suggestion: `const MEANINGFUL_NAME = ${num};`
      });
    }
  }

  return patterns;
}

/**
 * Detect empty catch blocks
 */
export function findEmptyCatches(
  content: string,
  filePath: string
): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PATTERNS.emptyCatch.test(line)) {
      patterns.push({
        type: 'empty-catch',
        file: filePath,
        line: i + 1,
        severity: 'warning',
        message: 'Empty catch block swallows errors silently',
        details: {},
        suggestion: 'Log the error or handle it appropriately'
      });
    }
  }

  // Also check multi-line empty catches
  const multiLineMatch = content.match(/catch\s*\([^)]*\)\s*{\s*\n?\s*}/g);
  if (multiLineMatch) {
    for (const match of multiLineMatch) {
      const index = content.indexOf(match);
      const line = content.substring(0, index).split('\n').length;
      patterns.push({
        type: 'empty-catch',
        file: filePath,
        line,
        severity: 'warning',
        message: 'Empty catch block swallows errors silently',
        details: {},
        suggestion: 'Log the error or handle it appropriately'
      });
    }
  }

  return patterns;
}

/**
 * Parse function declarations and extract metadata
 */
export interface ParsedFunction {
  name: string;
  line: number;
  endLine: number;
  parameters: string[];
  body: string;
}

export function extractFunctions(
  content: string,
  patterns: RegExp[]
): ParsedFunction[] {
  const functions: ParsedFunction[] = [];
  const lines = content.split('\n');

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match.index === undefined) continue;

      const startLine = content.substring(0, match.index).split('\n').length;
      const name = match[1] || 'anonymous';
      const params = match[2] ? match[2].split(',').map(p => p.trim()) : [];

      // Find function body
      let braceCount = 0;
      let inFunction = false;
      let endLine = startLine;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            inFunction = true;
          } else if (char === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) {
              endLine = i + 1;
              break;
            }
          }
        }
        if (inFunction && braceCount === 0) break;
      }

      const body = lines.slice(startLine - 1, endLine).join('\n');

      functions.push({
        name,
        line: startLine,
        endLine,
        parameters: params,
        body
      });
    }
  }

  return functions;
}
