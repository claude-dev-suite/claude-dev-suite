// SPDX-License-Identifier: MIT
/**
 * Java Analyzer
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
  findEmptyCatches,
  removeCommentsAndStrings
} from './base.js';

// Java method patterns
const JAVA_METHOD_PATTERNS = [
  /(?:public|private|protected|static|final|abstract|synchronized|native|strictfp|\s)*\s+(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*{/g,
];

// Java class pattern
const JAVA_CLASS_PATTERN = /(?:public|private|protected|abstract|final|\s)*\s*class\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w\s,]+)?\s*{/g;

// Import pattern
const JAVA_IMPORT_PATTERN = /import\s+(?:static\s+)?[\w.]+(?:\.\*)?;/g;

export class JavaAnalyzer implements LanguageAnalyzer {
  language: Language = 'java';
  extensions = ['.java'];

  analyzeComplexity(content: string, filePath: string): ComplexityResult {
    const methods = this.extractJavaMethods(content);
    const functionComplexities: FunctionComplexity[] = [];

    for (const method of methods) {
      const cyclomatic = calculateCyclomaticComplexity(method.body);
      const cognitive = calculateCognitiveComplexity(method.body);
      const lines = method.body.split('\n').length;

      functionComplexities.push({
        name: method.name,
        line: method.line,
        cyclomatic,
        cognitive,
        loc: lines,
        parameters: method.parameters.length
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

  private extractJavaMethods(content: string): { name: string; line: number; body: string; parameters: string[] }[] {
    const methods: { name: string; line: number; body: string; parameters: string[] }[] = [];
    const lines = content.split('\n');

    // Simplified method detection
    const methodRegex = /(?:public|private|protected|static|final|abstract|synchronized|\s)*\s+(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*{/g;

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      const params = match[2] ? match[2].split(',').map(p => p.trim().split(/\s+/).pop() || '') : [];
      const startLine = content.substring(0, match.index).split('\n').length;

      // Find method end
      let braceCount = 0;
      let inMethod = false;
      let endLine = startLine;

      for (let i = startLine - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inMethod = true;
          } else if (char === '}') {
            braceCount--;
            if (inMethod && braceCount === 0) {
              endLine = i + 1;
              break;
            }
          }
        }
        if (inMethod && braceCount === 0) break;
      }

      const body = lines.slice(startLine - 1, endLine).join('\n');
      methods.push({ name, line: startLine, body, parameters: params.filter(p => p) });
    }

    return methods;
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
    // Try Checkstyle first
    const checkstyleResult = await this.runCheckstyle(filePath);
    if (checkstyleResult) return checkstyleResult;

    // Fallback to basic checks
    return this.basicStyleCheck(content, filePath);
  }

  private async runCheckstyle(filePath: string): Promise<StyleResult | null> {
    validateFilePath(filePath);
    return new Promise((resolve) => {
      // shell:false — prevents shell metacharacter expansion in filePath.
      const child = spawn('checkstyle', ['-f', 'xml', filePath], {
        shell: false,
        timeout: 60000
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => { error += data; });

      child.on('close', () => {
        if (error.includes('not found') || error.includes('command not found')) {
          resolve(null);
          return;
        }

        // Parse XML output (simplified)
        const issues: CodeIssue[] = [];
        const errorMatches = output.matchAll(/<error\s+line="(\d+)".*?message="([^"]+)".*?severity="(\w+)"/g);

        for (const match of errorMatches) {
          issues.push({
            file: filePath,
            line: parseInt(match[1], 10),
            severity: match[3] === 'error' ? 'error' : 'warning',
            message: match[2],
            rule: 'checkstyle'
          });
        }

        if (issues.length === 0 && !output.includes('<error')) {
          resolve(null);
          return;
        }

        resolve({
          tool: 'checkstyle',
          issues,
          errorCount: issues.filter(i => i.severity === 'error').length,
          warningCount: issues.filter(i => i.severity === 'warning').length,
          fixableCount: 0
        });
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
          rule: 'LineLength'
        });
      }

      // Trailing whitespace
      if (/\s+$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'Trailing whitespace',
          rule: 'TrailingWhitespace'
        });
      }

      // System.out.println (debug code)
      if (/System\.out\.print/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: 'System.out.print found (use a logger instead)',
          rule: 'SystemPrint'
        });
      }

      // Multiple statements on one line
      if ((line.match(/;/g) || []).length > 1 && !line.includes('for')) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'Multiple statements on one line',
          rule: 'MultipleStatements'
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
    const methods = this.extractJavaMethods(content);
    const lines = content.split('\n');

    // Check for long methods
    for (const method of methods) {
      const methodLines = method.body.split('\n').length;
      if (methodLines > 50) {
        patterns.push({
          type: 'long-method',
          file: filePath,
          line: method.line,
          severity: methodLines > 100 ? 'error' : 'warning',
          message: `Method '${method.name}' is too long (${methodLines} lines)`,
          details: { lines: methodLines, threshold: 50 },
          suggestion: 'Extract parts into smaller, focused methods'
        });
      }

      // Too many parameters
      if (method.parameters.length > 5) {
        patterns.push({
          type: 'excessive-parameters',
          file: filePath,
          line: method.line,
          severity: method.parameters.length > 7 ? 'error' : 'warning',
          message: `Method '${method.name}' has too many parameters (${method.parameters.length})`,
          details: { count: method.parameters.length, threshold: 5 },
          suggestion: 'Consider using a Builder pattern or parameter object'
        });
      }

      // High complexity
      const complexity = calculateCyclomaticComplexity(method.body);
      if (complexity > 10) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: method.line,
          severity: complexity > 20 ? 'error' : 'warning',
          message: `Method '${method.name}' has high cyclomatic complexity (${complexity})`,
          details: { complexity, threshold: 10 },
          suggestion: 'Reduce complexity by extracting conditions or using strategy pattern'
        });
      }

      // Deep nesting
      const depth = calculateNestingDepth(method.body);
      if (depth > 4) {
        patterns.push({
          type: 'deep-nesting',
          file: filePath,
          line: method.line,
          severity: depth > 6 ? 'error' : 'warning',
          message: `Method '${method.name}' has deep nesting (${depth} levels)`,
          details: { depth, threshold: 4 },
          suggestion: 'Use early returns or extract nested logic into methods'
        });
      }
    }

    // Check for god classes
    const classMatches = content.matchAll(JAVA_CLASS_PATTERN);
    for (const match of classMatches) {
      if (match.index === undefined) continue;

      const className = match[1];
      const classStart = content.substring(0, match.index).split('\n').length;

      // Find class end
      let braceCount = 0;
      let inClass = false;
      let classEnd = classStart;

      for (let i = classStart - 1; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            braceCount++;
            inClass = true;
          } else if (char === '}') {
            braceCount--;
            if (inClass && braceCount === 0) {
              classEnd = i + 1;
              break;
            }
          }
        }
        if (inClass && braceCount === 0) break;
      }

      const classLines = classEnd - classStart;
      if (classLines > 300) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: classStart,
          endLine: classEnd,
          severity: classLines > 500 ? 'error' : 'warning',
          message: `Class '${className}' is too large (${classLines} lines)`,
          details: { lines: classLines, threshold: 300 },
          suggestion: 'Apply Single Responsibility Principle: split into focused classes'
        });
      }

      // Count methods in class
      const classContent = lines.slice(classStart - 1, classEnd).join('\n');
      const methodCount = (classContent.match(/(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w\s,]+)?\s*{/g) || []).length;

      if (methodCount > 20) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: classStart,
          severity: methodCount > 30 ? 'error' : 'warning',
          message: `Class '${className}' has too many methods (${methodCount})`,
          details: { methods: methodCount, threshold: 20 },
          suggestion: 'Extract related methods into separate classes'
        });
      }
    }

    // Empty catch blocks
    patterns.push(...findEmptyCatches(content, filePath));

    return patterns;
  }

  findDeadCode(files: Map<string, string>): DeadCodeItem[] {
    const deadCode: DeadCodeItem[] = [];
    const privateMethods: Map<string, { file: string; line: number }> = new Map();
    const usages: Set<string> = new Set();

    for (const [filePath, content] of files) {
      // Find private methods
      const privateMethodRegex = /private\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g;
      let match;
      while ((match = privateMethodRegex.exec(content)) !== null) {
        const name = match[1];
        const line = content.substring(0, match.index).split('\n').length;
        privateMethods.set(`${filePath}:${name}`, { file: filePath, line });
      }

      // Collect all method calls
      const callRegex = /\.(\w+)\s*\(/g;
      while ((match = callRegex.exec(content)) !== null) {
        usages.add(match[1]);
      }

      // Direct calls
      const directCallRegex = /\b(\w+)\s*\(/g;
      while ((match = directCallRegex.exec(content)) !== null) {
        usages.add(match[1]);
      }
    }

    // Check for unused private methods
    for (const [key, info] of privateMethods) {
      const name = key.split(':')[1];
      // Count occurrences
      let count = 0;
      for (const [_, content] of files) {
        const matches = content.match(new RegExp(`\\b${name}\\s*\\(`, 'g'));
        count += matches ? matches.length : 0;
      }

      // If only appears once (the definition), it's unused
      if (count <= 1) {
        deadCode.push({
          type: 'function',
          name,
          file: info.file,
          line: info.line,
          confidence: 'high'
        });
      }
    }

    return deadCode;
  }

  calculateMetrics(content: string, filePath: string): FileMetrics {
    const { loc, sloc, comments, blanks } = countLines(content);
    const methods = this.extractJavaMethods(content);
    const classes = [...content.matchAll(JAVA_CLASS_PATTERN)].length;
    const imports = [...content.matchAll(JAVA_IMPORT_PATTERN)].length;

    let totalComplexity = 0;
    for (const method of methods) {
      totalComplexity += calculateCyclomaticComplexity(method.body);
    }

    return {
      file: filePath,
      loc,
      sloc,
      comments,
      blanks,
      functions: methods.length,
      classes,
      imports,
      exports: 0, // Java doesn't have exports like JS
      complexity: methods.length > 0 ? Math.round(totalComplexity / methods.length) : 0
    };
  }
}
