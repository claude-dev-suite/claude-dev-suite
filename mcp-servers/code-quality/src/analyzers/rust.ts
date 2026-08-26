// SPDX-License-Identifier: MIT
/**
 * Rust Analyzer
 */

import { spawn } from 'child_process';
import { validateFilePath } from '../utils/paths.js';

import type {
  Language,
  ComplexityResult,
  FunctionComplexity,
  DuplicationResult,
  StyleResult,
  AntiPattern,
  DeadCodeItem,
  FileMetrics,
  LanguageAnalyzer,
  CodeIssue
} from '../types.js';
import {
  calculateCyclomaticComplexity,
  calculateCognitiveComplexity,
  calculateNestingDepth,
  countLines,
  findDuplicateBlocks,
  removeCommentsAndStrings
} from './base.js';

// Rust function patterns
const RUST_FN_PATTERN = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/g;

// Rust struct pattern
const RUST_STRUCT_PATTERN = /(?:pub\s+)?struct\s+(\w+)(?:<[^>]+>)?/g;

// Rust impl pattern
const RUST_IMPL_PATTERN = /impl(?:<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/g;

// Rust trait pattern
const RUST_TRAIT_PATTERN = /(?:pub\s+)?trait\s+(\w+)/g;

// Use/import pattern
const RUST_USE_PATTERN = /use\s+[\w:]+(?:::\{[^}]+\})?;/g;

export class RustAnalyzer implements LanguageAnalyzer {
  language: Language = 'rust';
  extensions = ['.rs'];

  analyzeComplexity(content: string, filePath: string): ComplexityResult {
    const functions = this.extractRustFunctions(content);
    const functionComplexities: FunctionComplexity[] = [];

    for (const func of functions) {
      const cyclomatic = this.calculateRustComplexity(func.body);
      const cognitive = calculateCognitiveComplexity(func.body);
      const lines = func.body.split('\n').length;

      functionComplexities.push({
        name: func.name,
        line: func.line,
        cyclomatic,
        cognitive,
        loc: lines,
        parameters: func.parameters.length
      });
    }

    const avgCyclomatic = functionComplexities.length > 0
      ? functionComplexities.reduce((sum, f) => sum + f.cyclomatic, 0) / functionComplexities.length
      : 0;
    const avgCognitive = functionComplexities.length > 0
      ? functionComplexities.reduce((sum, f) => sum + f.cognitive, 0) / functionComplexities.length
      : 0;

    return {
      file: filePath,
      functions: functionComplexities,
      averageCyclomatic: Math.round(avgCyclomatic * 100) / 100,
      averageCognitive: Math.round(avgCognitive * 100) / 100,
      totalFunctions: functionComplexities.length
    };
  }

  private extractRustFunctions(content: string): { name: string; line: number; body: string; parameters: string[] }[] {
    const functions: { name: string; line: number; body: string; parameters: string[] }[] = [];
    const lines = content.split('\n');

    let match;
    const regex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/g;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2]
        ? match[2].split(',').map(p => p.trim().split(':')[0].replace(/^&\s*(?:mut\s+)?/, '').trim()).filter(p => p && p !== 'self')
        : [];
      const startLine = content.substring(0, match.index).split('\n').length;

      // Find function end
      let braceCount = 0;
      let inFunc = false;
      let endLine = startLine;

      for (let i = startLine - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inFunc = true;
          } else if (char === '}') {
            braceCount--;
            if (inFunc && braceCount === 0) {
              endLine = i + 1;
              break;
            }
          }
        }
        if (inFunc && braceCount === 0) break;
      }

      const body = lines.slice(startLine - 1, endLine).join('\n');
      functions.push({ name, line: startLine, body, parameters: params });
    }

    return functions;
  }

  private calculateRustComplexity(code: string): number {
    let complexity = 1;

    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bwhile\b/g,
      /\bloop\b/g,
      /\bfor\b/g,
      /\bmatch\b/g,
      /=>/g, // match arms
      /&&/g,
      /\|\|/g,
      /\?/g, // error propagation adds complexity
    ];

    for (const pattern of patterns) {
      complexity += (code.match(pattern) || []).length;
    }

    return complexity;
  }

  findDuplicates(files: Map<string, string>, minLines = 6): DuplicationResult {
    const duplicates = findDuplicateBlocks(files, minLines);

    let totalDuplicateLines = 0;
    let totalLines = 0;

    for (const [_, content] of files) {
      totalLines += content.split('\n').length;
    }

    for (const dup of duplicates) {
      totalDuplicateLines += dup.lines * (dup.files.length - 1);
    }

    return {
      duplicates,
      totalDuplicateLines,
      duplicationPercentage: totalLines > 0
        ? Math.round((totalDuplicateLines / totalLines) * 10000) / 100
        : 0
    };
  }

  async checkStyle(filePath: string, content: string): Promise<StyleResult> {
    // Try clippy first
    const clippyResult = await this.runClippy(filePath);
    if (clippyResult) return clippyResult;

    // Fallback to basic checks
    return this.basicStyleCheck(content, filePath);
  }

  private async runClippy(filePath: string): Promise<StyleResult | null> {
    validateFilePath(filePath);
    return new Promise((resolve) => {
      // shell:false — cargo reads the workspace context via cwd, filePath is only
      // used to filter its JSON output and is NOT passed as a shell argument.
      const child = spawn('cargo', ['clippy', '--message-format=json', '--', '-W', 'clippy::all'], {
        shell: false,
        timeout: 120000
      });

      let output = '';

      child.stdout.on('data', (data) => { output += data; });

      child.on('close', () => {
        try {
          const issues: CodeIssue[] = [];

          // Parse NDJSON output
          const jsonLines = output.split('\n').filter(l => l.trim());
          for (const line of jsonLines) {
            try {
              const msg = JSON.parse(line);
              if (msg.reason === 'compiler-message' && msg.message?.spans?.[0]) {
                const span = msg.message.spans[0];
                if (span.file_name?.includes(filePath)) {
                  issues.push({
                    file: span.file_name,
                    line: span.line_start || 1,
                    column: span.column_start,
                    severity: msg.message.level === 'error' ? 'error' : 'warning',
                    message: msg.message.message,
                    rule: msg.message.code?.code
                  });
                }
              }
            } catch {
              // Skip malformed lines
            }
          }

          if (issues.length === 0) {
            resolve(null);
            return;
          }

          resolve({
            tool: 'clippy',
            issues,
            errorCount: issues.filter(i => i.severity === 'error').length,
            warningCount: issues.filter(i => i.severity === 'warning').length,
            fixableCount: 0
          });
        } catch {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));
    });
  }

  private basicStyleCheck(content: string, filePath: string): StyleResult {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Line length (Rust style guide suggests 100)
      if (line.length > 100) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: `Line exceeds 100 characters (${line.length})`,
          rule: 'line-length'
        });
      }

      // Trailing whitespace
      if (/\s+$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'Trailing whitespace',
          rule: 'trailing-whitespace'
        });
      }

      // println! (debug code)
      if (/println!\s*\(/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'println! found (consider using tracing or log crate)',
          rule: 'println'
        });
      }

      // unwrap() without comment
      if (/\.unwrap\(\)/.test(line) && !line.includes('//')) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: 'unwrap() can panic - consider using expect() with a message or proper error handling',
          rule: 'unwrap-used'
        });
      }

      // expect() with empty message
      if (/\.expect\(\s*""\s*\)/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: 'expect() with empty message - provide a meaningful error message',
          rule: 'expect-empty'
        });
      }
    }

    return {
      tool: 'basic',
      issues,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      fixableCount: 0
    };
  }

  detectAntiPatterns(content: string, filePath: string): AntiPattern[] {
    const patterns: AntiPattern[] = [];
    const functions = this.extractRustFunctions(content);
    const lines = content.split('\n');

    // Check for long methods
    for (const func of functions) {
      const funcLines = func.body.split('\n').length;
      if (funcLines > 50) {
        patterns.push({
          type: 'long-method',
          file: filePath,
          line: func.line,
          severity: funcLines > 100 ? 'error' : 'warning',
          message: `Function '${func.name}' is too long (${funcLines} lines)`,
          details: { lines: funcLines, threshold: 50 },
          suggestion: 'Extract parts into smaller, focused functions'
        });
      }

      // Too many parameters
      if (func.parameters.length > 5) {
        patterns.push({
          type: 'excessive-parameters',
          file: filePath,
          line: func.line,
          severity: func.parameters.length > 7 ? 'error' : 'warning',
          message: `Function '${func.name}' has too many parameters (${func.parameters.length})`,
          details: { count: func.parameters.length, threshold: 5 },
          suggestion: 'Consider using a builder pattern or config struct'
        });
      }

      // High complexity
      const complexity = this.calculateRustComplexity(func.body);
      if (complexity > 10) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: func.line,
          severity: complexity > 20 ? 'error' : 'warning',
          message: `Function '${func.name}' has high cyclomatic complexity (${complexity})`,
          details: { complexity, threshold: 10 },
          suggestion: 'Reduce complexity by extracting helper functions or using traits'
        });
      }

      // Deep nesting
      const depth = calculateNestingDepth(func.body);
      if (depth > 4) {
        patterns.push({
          type: 'deep-nesting',
          file: filePath,
          line: func.line,
          severity: depth > 6 ? 'error' : 'warning',
          message: `Function '${func.name}' has deep nesting (${depth} levels)`,
          details: { depth, threshold: 4 },
          suggestion: 'Use early returns with ? operator or extract nested logic'
        });
      }
    }

    // Check for large structs
    const structMatches = content.matchAll(RUST_STRUCT_PATTERN);
    for (const match of structMatches) {
      if (match.index === undefined) continue;

      const structName = match[1];
      const structStart = content.substring(0, match.index).split('\n').length;

      // Find struct end
      let braceCount = 0;
      let inStruct = false;
      let structEnd = structStart;

      for (let i = structStart - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inStruct = true;
          } else if (char === '}') {
            braceCount--;
            if (inStruct && braceCount === 0) {
              structEnd = i + 1;
              break;
            }
          }
        }
        if (inStruct && braceCount === 0) break;
      }

      const structLines = structEnd - structStart;
      const fieldCount = (lines.slice(structStart, structEnd - 1).join('\n').match(/^\s+(?:pub\s+)?\w+\s*:/gm) || []).length;

      if (fieldCount > 15) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: structStart,
          severity: fieldCount > 25 ? 'error' : 'warning',
          message: `Struct '${structName}' has too many fields (${fieldCount})`,
          details: { fields: fieldCount, threshold: 15 },
          suggestion: 'Consider using nested structs or the newtype pattern'
        });
      }
    }

    // Check for large impl blocks (god class indicator)
    const implMatches = content.matchAll(RUST_IMPL_PATTERN);
    for (const match of implMatches) {
      if (match.index === undefined) continue;

      const typeName = match[1];
      const implStart = content.substring(0, match.index).split('\n').length;

      // Find impl end
      let braceCount = 0;
      let inImpl = false;
      let implEnd = implStart;

      for (let i = implStart - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inImpl = true;
          } else if (char === '}') {
            braceCount--;
            if (inImpl && braceCount === 0) {
              implEnd = i + 1;
              break;
            }
          }
        }
        if (inImpl && braceCount === 0) break;
      }

      const implLines = implEnd - implStart;
      if (implLines > 300) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: implStart,
          endLine: implEnd,
          severity: implLines > 500 ? 'error' : 'warning',
          message: `impl block for '${typeName}' is too large (${implLines} lines)`,
          details: { lines: implLines, threshold: 300 },
          suggestion: 'Split into multiple impl blocks or extract functionality into traits'
        });
      }
    }

    return patterns;
  }

  findDeadCode(files: Map<string, string>): DeadCodeItem[] {
    const deadCode: DeadCodeItem[] = [];
    const privateFns: Map<string, { file: string; line: number }> = new Map();
    const usages: Set<string> = new Set();

    for (const [filePath, content] of files) {
      // Find non-pub functions
      const fnRegex = /(?<!pub\s+)fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(/g;
      let match;
      while ((match = fnRegex.exec(content)) !== null) {
        const name = match[1];
        if (name !== 'main' && name !== 'new') {
          const line = content.substring(0, match.index).split('\n').length;
          privateFns.set(`${filePath}:${name}`, { file: filePath, line });
        }
      }

      // Collect function calls
      const callRegex = /\b(\w+)\s*(?::<[^>]+>)?\s*\(/g;
      while ((match = callRegex.exec(content)) !== null) {
        usages.add(match[1]);
      }

      // Also check for method calls
      const methodRegex = /\.(\w+)\s*\(/g;
      while ((match = methodRegex.exec(content)) !== null) {
        usages.add(match[1]);
      }
    }

    // Check for unused private functions
    for (const [key, info] of privateFns) {
      const name = key.split(':')[1];
      let count = 0;
      for (const [_, content] of files) {
        const matches = content.match(new RegExp(`\\b${name}\\s*(?::<[^>]+>)?\\s*\\(`, 'g'));
        count += matches ? matches.length : 0;
      }

      if (count <= 1) {
        deadCode.push({
          type: 'function',
          name,
          file: info.file,
          line: info.line,
          confidence: 'medium'
        });
      }
    }

    return deadCode;
  }

  calculateMetrics(content: string, filePath: string): FileMetrics {
    const { loc, sloc, comments, blanks } = this.countRustLines(content);
    const functions = this.extractRustFunctions(content);
    const structs = [...content.matchAll(RUST_STRUCT_PATTERN)].length;
    const traits = [...content.matchAll(RUST_TRAIT_PATTERN)].length;
    const uses = [...content.matchAll(RUST_USE_PATTERN)].length;

    let totalComplexity = 0;
    for (const func of functions) {
      totalComplexity += this.calculateRustComplexity(func.body);
    }

    return {
      file: filePath,
      loc,
      sloc,
      comments,
      blanks,
      functions: functions.length,
      classes: structs + traits,
      imports: uses,
      exports: 0,
      complexity: functions.length > 0 ? Math.round(totalComplexity / functions.length) : 0
    };
  }

  private countRustLines(content: string): { loc: number; sloc: number; comments: number; blanks: number } {
    const lines = content.split('\n');
    let loc = lines.length;
    let blanks = 0;
    let comments = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blanks++;
        continue;
      }

      if (inBlockComment) {
        comments++;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*')) {
        comments++;
        if (!trimmed.includes('*/')) {
          inBlockComment = true;
        }
        continue;
      }

      if (trimmed.startsWith('//')) {
        comments++;
      }
    }

    return { loc, sloc: loc - blanks - comments, comments, blanks };
  }
}
