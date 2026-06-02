// SPDX-License-Identifier: MIT
/**
 * Go Analyzer
 */

import { spawn } from 'child_process';
import { isAbsolute, normalize } from 'path';

/** Reject paths containing null bytes — defence against null-byte injection */
function validateFilePath(filePath: string): void {
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null byte');
  }
  if (!isAbsolute(normalize(filePath))) {
    throw new Error('File path must be absolute');
  }
}
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

// Go function patterns
const GO_FUNC_PATTERN = /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/g;

// Go struct pattern
const GO_STRUCT_PATTERN = /type\s+(\w+)\s+struct\s*{/g;

// Go interface pattern
const GO_INTERFACE_PATTERN = /type\s+(\w+)\s+interface\s*{/g;

// Import pattern
const GO_IMPORT_PATTERN = /import\s+(?:\([\s\S]*?\)|"[^"]+")/g;

export class GoAnalyzer implements LanguageAnalyzer {
  language: Language = 'go';
  extensions = ['.go'];

  analyzeComplexity(content: string, filePath: string): ComplexityResult {
    const functions = this.extractGoFunctions(content);
    const functionComplexities: FunctionComplexity[] = [];

    for (const func of functions) {
      const cyclomatic = this.calculateGoComplexity(func.body);
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

  private extractGoFunctions(content: string): { name: string; line: number; body: string; parameters: string[] }[] {
    const functions: { name: string; line: number; body: string; parameters: string[] }[] = [];
    const lines = content.split('\n');

    let match;
    const regex = /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/g;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2]
        ? match[2].split(',').map(p => p.trim().split(/\s+/)[0]).filter(p => p)
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

  private calculateGoComplexity(code: string): number {
    let complexity = 1;

    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bselect\b/g,
      /&&/g,
      /\|\|/g,
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
    // Try golangci-lint first
    const lintResult = await this.runGolangciLint(filePath);
    if (lintResult) return lintResult;

    // Fallback to basic checks
    return this.basicStyleCheck(content, filePath);
  }

  private async runGolangciLint(filePath: string): Promise<StyleResult | null> {
    validateFilePath(filePath);
    return new Promise((resolve) => {
      // shell:false — prevents shell metacharacter expansion in filePath.
      const child = spawn('golangci-lint', ['run', '--out-format', 'json', filePath], {
        shell: false,
        timeout: 60000
      });

      let output = '';

      child.stdout.on('data', (data) => { output += data; });

      child.on('close', () => {
        try {
          const results = JSON.parse(output);
          const issues: CodeIssue[] = (results.Issues || []).map((i: any) => ({
            file: i.Pos?.Filename || filePath,
            line: i.Pos?.Line || 1,
            column: i.Pos?.Column,
            severity: i.Severity === 'error' ? 'error' : 'warning',
            message: i.Text,
            rule: i.FromLinter
          }));

          resolve({
            tool: 'golangci-lint',
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

      // Line length
      if (line.length > 120) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: `Line exceeds 120 characters (${line.length})`,
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

      // fmt.Println (debug code)
      if (/fmt\.Print/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'fmt.Print found (consider using a logger)',
          rule: 'fmt-print'
        });
      }

      // panic (should be avoided in production)
      if (/\bpanic\s*\(/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: 'panic() found (consider error handling instead)',
          rule: 'no-panic'
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
    const functions = this.extractGoFunctions(content);
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
          suggestion: 'Consider using a config struct'
        });
      }

      // High complexity
      const complexity = this.calculateGoComplexity(func.body);
      if (complexity > 10) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: func.line,
          severity: complexity > 20 ? 'error' : 'warning',
          message: `Function '${func.name}' has high cyclomatic complexity (${complexity})`,
          details: { complexity, threshold: 10 },
          suggestion: 'Reduce complexity by extracting helper functions'
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
          suggestion: 'Use early returns or extract nested logic'
        });
      }
    }

    // Check for ignored errors
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Pattern: _, err := and then no error check
      if (/,\s*_\s*:?=/.test(line) && /err/.test(line)) {
        patterns.push({
          type: 'empty-catch',
          file: filePath,
          line: i + 1,
          severity: 'warning',
          message: 'Error is being ignored',
          details: {},
          suggestion: 'Handle the error or explicitly document why it is ignored'
        });
      }
    }

    // Check for large structs (god class equivalent)
    const structMatches = content.matchAll(GO_STRUCT_PATTERN);
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

      const fieldCount = (lines.slice(structStart, structEnd - 1).join('\n').match(/^\s+\w+\s+/gm) || []).length;
      if (fieldCount > 15) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: structStart,
          severity: fieldCount > 25 ? 'error' : 'warning',
          message: `Struct '${structName}' has too many fields (${fieldCount})`,
          details: { fields: fieldCount, threshold: 15 },
          suggestion: 'Consider breaking into smaller embedded structs'
        });
      }
    }

    return patterns;
  }

  findDeadCode(files: Map<string, string>): DeadCodeItem[] {
    const deadCode: DeadCodeItem[] = [];
    const unexported: Map<string, { file: string; line: number; type: string }> = new Map();
    const usages: Set<string> = new Set();

    for (const [filePath, content] of files) {
      // Find unexported functions (lowercase first letter)
      const funcRegex = /func\s+(?:\([^)]+\)\s+)?([a-z]\w*)\s*\(/g;
      let match;
      while ((match = funcRegex.exec(content)) !== null) {
        const name = match[1];
        if (name !== 'main' && name !== 'init') {
          const line = content.substring(0, match.index).split('\n').length;
          unexported.set(`${filePath}:${name}`, { file: filePath, line, type: 'function' });
        }
      }

      // Collect function calls
      const callRegex = /\b([a-z]\w*)\s*\(/g;
      while ((match = callRegex.exec(content)) !== null) {
        usages.add(match[1]);
      }
    }

    // Check for unused unexported functions
    for (const [key, info] of unexported) {
      const name = key.split(':')[1];
      let count = 0;
      for (const [_, content] of files) {
        const matches = content.match(new RegExp(`\\b${name}\\s*\\(`, 'g'));
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
    const { loc, sloc, comments, blanks } = this.countGoLines(content);
    const functions = this.extractGoFunctions(content);
    const structs = [...content.matchAll(GO_STRUCT_PATTERN)].length;
    const interfaces = [...content.matchAll(GO_INTERFACE_PATTERN)].length;
    const imports = [...content.matchAll(GO_IMPORT_PATTERN)].length;

    let totalComplexity = 0;
    for (const func of functions) {
      totalComplexity += this.calculateGoComplexity(func.body);
    }

    return {
      file: filePath,
      loc,
      sloc,
      comments,
      blanks,
      functions: functions.length,
      classes: structs + interfaces,
      imports,
      exports: 0,
      complexity: functions.length > 0 ? Math.round(totalComplexity / functions.length) : 0
    };
  }

  private countGoLines(content: string): { loc: number; sloc: number; comments: number; blanks: number } {
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
