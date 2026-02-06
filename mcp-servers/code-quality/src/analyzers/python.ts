// SPDX-License-Identifier: MIT
/**
 * Python Analyzer
 */

import { spawn } from 'child_process';
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
  countLines,
  findDuplicateBlocks,
  extractFunctions,
  removeCommentsAndStrings
} from './base.js';

// Python function patterns
const PY_FUNCTION_PATTERNS = [
  /def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*?)?:/g,
  /async\s+def\s+(\w+)\s*\(([^)]*)\)\s*(?:->.*?)?:/g,
];

// Python class pattern
const PY_CLASS_PATTERN = /class\s+(\w+)(?:\([^)]*\))?\s*:/g;

// Python import patterns
const PY_IMPORT_PATTERN = /(?:from\s+[\w.]+\s+)?import\s+(?:[\w,\s]+|\([\w,\s\n]+\))/g;

export class PythonAnalyzer implements LanguageAnalyzer {
  language: Language = 'python';
  extensions = ['.py', '.pyw'];

  analyzeComplexity(content: string, filePath: string): ComplexityResult {
    const functions = this.extractPythonFunctions(content);
    const functionComplexities: FunctionComplexity[] = [];

    for (const func of functions) {
      const cyclomatic = this.calculatePythonComplexity(func.body);
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

  private extractPythonFunctions(content: string): { name: string; line: number; body: string; parameters: string[] }[] {
    const functions: { name: string; line: number; body: string; parameters: string[] }[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);

      if (match) {
        const name = match[1];
        const params = match[2] ? match[2].split(',').map(p => p.trim().split(':')[0].split('=')[0].trim()) : [];
        const indent = line.match(/^(\s*)/)?.[1].length || 0;

        // Find function end by indentation
        let endLine = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const currentLine = lines[j];
          if (currentLine.trim() === '') continue;
          const currentIndent = currentLine.match(/^(\s*)/)?.[1].length || 0;
          if (currentIndent <= indent && currentLine.trim() !== '') {
            endLine = j;
            break;
          }
          endLine = j + 1;
        }

        const body = lines.slice(i, endLine).join('\n');
        functions.push({ name, line: i + 1, body, parameters: params.filter(p => p && p !== 'self') });
      }
    }

    return functions;
  }

  private calculatePythonComplexity(code: string): number {
    let complexity = 1;

    // Python-specific patterns
    const patterns = [
      /\bif\b/g,
      /\belif\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bexcept\b/g,
      /\band\b/g,
      /\bor\b/g,
      /\bif\s+.*\s+else\b/g, // ternary
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
    // Try Ruff first (fast modern linter)
    const ruffResult = await this.runRuff(filePath);
    if (ruffResult) return ruffResult;

    // Fall back to pylint
    const pylintResult = await this.runPylint(filePath);
    if (pylintResult) return pylintResult;

    // Basic checks
    return this.basicStyleCheck(content, filePath);
  }

  private async runRuff(filePath: string): Promise<StyleResult | null> {
    return new Promise((resolve) => {
      const child = spawn('ruff', ['check', '--output-format', 'json', filePath], {
        shell: true,
        timeout: 30000
      });

      let output = '';

      child.stdout.on('data', (data) => { output += data; });

      child.on('close', () => {
        try {
          const results = JSON.parse(output);
          const issues: CodeIssue[] = results.map((r: any) => ({
            file: r.filename,
            line: r.location?.row || 1,
            column: r.location?.column,
            severity: r.fix ? 'warning' : 'error',
            message: r.message,
            rule: r.code
          }));

          resolve({
            tool: 'ruff',
            issues,
            errorCount: issues.filter(i => i.severity === 'error').length,
            warningCount: issues.filter(i => i.severity === 'warning').length,
            fixableCount: results.filter((r: any) => r.fix).length
          });
        } catch {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));
    });
  }

  private async runPylint(filePath: string): Promise<StyleResult | null> {
    return new Promise((resolve) => {
      const child = spawn('pylint', ['--output-format=json', filePath], {
        shell: true,
        timeout: 60000
      });

      let output = '';

      child.stdout.on('data', (data) => { output += data; });

      child.on('close', () => {
        try {
          const results = JSON.parse(output);
          const issues: CodeIssue[] = results.map((r: any) => ({
            file: filePath,
            line: r.line || 1,
            column: r.column,
            severity: r.type === 'error' ? 'error' : 'warning',
            message: r.message,
            rule: r.symbol
          }));

          resolve({
            tool: 'pylint',
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

      // Line length (PEP 8: 79, relaxed to 100)
      if (line.length > 100) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'warning',
          message: `Line exceeds 100 characters (${line.length})`,
          rule: 'E501'
        });
      }

      // Trailing whitespace
      if (/\s+$/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'Trailing whitespace',
          rule: 'W291'
        });
      }

      // Mixed tabs and spaces
      if (/^\t+ /.test(line) || /^ +\t/.test(line)) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'error',
          message: 'Mixed tabs and spaces in indentation',
          rule: 'E101'
        });
      }

      // print() statements (debug code)
      if (/\bprint\s*\(/.test(line) && !line.trim().startsWith('#')) {
        issues.push({
          file: filePath,
          line: lineNum,
          severity: 'info',
          message: 'print() statement found (consider using logging)',
          rule: 'T201'
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
    const functions = this.extractPythonFunctions(content);
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
          suggestion: 'Extract parts of this function into smaller, focused functions'
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
          suggestion: 'Consider using a dataclass or dict for configuration'
        });
      }

      // High complexity
      const complexity = this.calculatePythonComplexity(func.body);
      if (complexity > 10) {
        patterns.push({
          type: 'god-class',
          file: filePath,
          line: func.line,
          severity: complexity > 20 ? 'error' : 'warning',
          message: `Function '${func.name}' has high complexity (${complexity})`,
          details: { complexity, threshold: 10 },
          suggestion: 'Simplify conditions or extract helper functions'
        });
      }
    }

    // Check for bare except
    for (let i = 0; i < lines.length; i++) {
      if (/\bexcept\s*:/.test(lines[i])) {
        patterns.push({
          type: 'empty-catch',
          file: filePath,
          line: i + 1,
          severity: 'error',
          message: 'Bare except clause catches all exceptions including KeyboardInterrupt',
          details: {},
          suggestion: 'Specify the exception type: except Exception as e:'
        });
      }
    }

    // Check for god classes
    const classMatches = content.matchAll(PY_CLASS_PATTERN);
    for (const match of classMatches) {
      if (match.index === undefined) continue;

      const className = match[1];
      const classStart = content.substring(0, match.index).split('\n').length;
      const indent = lines[classStart - 1].match(/^(\s*)/)?.[1].length || 0;

      // Find class end by indentation
      let classEnd = classStart;
      for (let i = classStart; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;
        const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
        if (currentIndent <= indent && line.trim() !== '') {
          classEnd = i;
          break;
        }
        classEnd = i + 1;
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
          suggestion: 'Split into smaller classes using composition'
        });
      }
    }

    return patterns;
  }

  findDeadCode(files: Map<string, string>): DeadCodeItem[] {
    const deadCode: DeadCodeItem[] = [];
    const definitions: Map<string, { file: string; line: number; type: string }> = new Map();
    const usages: Set<string> = new Set();

    for (const [filePath, content] of files) {
      // Find function/class definitions
      const funcMatches = content.matchAll(/def\s+(\w+)\s*\(/g);
      for (const match of funcMatches) {
        const name = match[1];
        if (!name.startsWith('_') || name.startsWith('__')) { // Skip private, keep dunder
          const line = content.substring(0, match.index).split('\n').length;
          definitions.set(`${filePath}:${name}`, { file: filePath, line, type: 'function' });
        }
      }

      // Find usages (simple word matching)
      const words = content.match(/\b\w+\b/g) || [];
      for (const word of words) {
        usages.add(word);
      }
    }

    // Check for unused definitions
    for (const [key, info] of definitions) {
      const name = key.split(':')[1];
      // Count occurrences - if only appears once (the definition), likely unused
      let count = 0;
      for (const [_, content] of files) {
        const matches = content.match(new RegExp(`\\b${name}\\b`, 'g'));
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
    const { loc, sloc, comments, blanks } = this.countPythonLines(content);
    const functions = this.extractPythonFunctions(content);
    const classes = [...content.matchAll(PY_CLASS_PATTERN)].length;
    const imports = [...content.matchAll(PY_IMPORT_PATTERN)].length;

    let totalComplexity = 0;
    for (const func of functions) {
      totalComplexity += this.calculatePythonComplexity(func.body);
    }

    return {
      file: filePath,
      loc,
      sloc,
      comments,
      blanks,
      functions: functions.length,
      classes,
      imports,
      exports: 0, // Python doesn't have explicit exports
      complexity: functions.length > 0 ? Math.round(totalComplexity / functions.length) : 0
    };
  }

  private countPythonLines(content: string): { loc: number; sloc: number; comments: number; blanks: number } {
    const lines = content.split('\n');
    let loc = lines.length;
    let blanks = 0;
    let comments = 0;
    let inDocstring = false;
    let docstringChar = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blanks++;
        continue;
      }

      // Docstring handling
      if (inDocstring) {
        comments++;
        if (trimmed.includes(docstringChar)) {
          inDocstring = false;
        }
        continue;
      }

      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        docstringChar = trimmed.substring(0, 3);
        comments++;
        if (trimmed.length > 3 && !trimmed.endsWith(docstringChar)) {
          inDocstring = true;
        }
        continue;
      }

      if (trimmed.startsWith('#')) {
        comments++;
      }
    }

    return { loc, sloc: loc - blanks - comments, comments, blanks };
  }
}
