// SPDX-License-Identifier: MIT
/**
 * Anti-pattern Detection Rules
 * Configurable rules for detecting common code smells and anti-patterns
 */

import type { AntiPattern, AntiPatternType, Thresholds, DEFAULT_THRESHOLDS } from '../types.js';

export interface AntiPatternRule {
  type: AntiPatternType;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  check: (context: RuleContext) => AntiPattern[];
}

export interface RuleContext {
  content: string;
  filePath: string;
  thresholds: Thresholds;
  lines: string[];
}

/**
 * Rule: God Class / Large Class
 * Detects classes that are too large or have too many responsibilities
 */
export const godClassRule: AntiPatternRule = {
  type: 'god-class',
  name: 'God Class',
  description: 'Class is too large or has too many responsibilities',
  severity: 'warning',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, thresholds, lines } = ctx;

    // Check for large files (often indicates god class)
    if (lines.length > thresholds.maxFileLines) {
      patterns.push({
        type: 'god-class',
        file: filePath,
        line: 1,
        severity: lines.length > thresholds.maxFileLines * 2 ? 'error' : 'warning',
        message: `File has ${lines.length} lines (threshold: ${thresholds.maxFileLines})`,
        details: { lines: lines.length, threshold: thresholds.maxFileLines },
        suggestion: 'Split into multiple smaller, focused modules'
      });
    }

    return patterns;
  }
};

/**
 * Rule: Long Method
 * Detects methods/functions that are too long
 */
export const longMethodRule: AntiPatternRule = {
  type: 'long-method',
  name: 'Long Method',
  description: 'Method is too long and should be split',
  severity: 'warning',
  enabled: true,
  check: (ctx) => {
    // This is handled by individual language analyzers
    // which have better function extraction capabilities
    return [];
  }
};

/**
 * Rule: Deep Nesting
 * Detects code with excessive nesting depth
 */
export const deepNestingRule: AntiPatternRule = {
  type: 'deep-nesting',
  name: 'Deep Nesting',
  description: 'Code has too many levels of nesting',
  severity: 'warning',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, thresholds, lines } = ctx;

    let maxDepth = 0;
    let currentDepth = 0;
    let maxDepthLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{' || char === '(' && line.includes('=>')) {
          currentDepth++;
          if (currentDepth > maxDepth) {
            maxDepth = currentDepth;
            maxDepthLine = i + 1;
          }
        } else if (char === '}') {
          currentDepth--;
          if (currentDepth < 0) currentDepth = 0;
        }
      }
    }

    if (maxDepth > thresholds.maxNestingDepth) {
      patterns.push({
        type: 'deep-nesting',
        file: filePath,
        line: maxDepthLine,
        severity: maxDepth > thresholds.maxNestingDepth + 2 ? 'error' : 'warning',
        message: `Maximum nesting depth is ${maxDepth} (threshold: ${thresholds.maxNestingDepth})`,
        details: { depth: maxDepth, threshold: thresholds.maxNestingDepth },
        suggestion: 'Use early returns, guard clauses, or extract nested logic into functions'
      });
    }

    return patterns;
  }
};

/**
 * Rule: Excessive Parameters
 * Detects functions with too many parameters
 */
export const excessiveParametersRule: AntiPatternRule = {
  type: 'excessive-parameters',
  name: 'Excessive Parameters',
  description: 'Function has too many parameters',
  severity: 'warning',
  enabled: true,
  check: (ctx) => {
    // Handled by language analyzers
    return [];
  }
};

/**
 * Rule: Magic Numbers
 * Detects unexplained numeric literals in code
 */
export const magicNumbersRule: AntiPatternRule = {
  type: 'magic-numbers',
  name: 'Magic Numbers',
  description: 'Unexplained numeric literals should be named constants',
  severity: 'info',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, lines } = ctx;

    // Allowed magic numbers
    const allowed = new Set(['0', '1', '2', '-1', '100', '1000', '10', '60', '24', '365', '12']);

    // Skip strings and comments
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, '``');

    const cleanLines = cleanContent.split('\n');

    for (let i = 0; i < cleanLines.length; i++) {
      const line = cleanLines[i];

      // Find numbers that aren't part of identifiers or array indices
      const matches = line.matchAll(/(?<![a-zA-Z0-9_.])[0-9]+(?:\.[0-9]+)?(?![a-zA-Z0-9_])/g);

      for (const match of matches) {
        const num = match[0];
        if (!allowed.has(num) && parseFloat(num) !== 0 && parseFloat(num) !== 1) {
          // Skip array indices and common patterns
          const context = line.substring(Math.max(0, match.index! - 10), match.index! + num.length + 10);
          if (!/\[\s*\d+\s*\]/.test(context) && !/:\s*\d+/.test(context)) {
            patterns.push({
              type: 'magic-numbers',
              file: filePath,
              line: i + 1,
              severity: 'info',
              message: `Magic number ${num} should be a named constant`,
              details: { number: num },
              suggestion: `const MEANINGFUL_NAME = ${num};`
            });
          }
        }
      }
    }

    return patterns;
  }
};

/**
 * Rule: Empty Catch
 * Detects empty catch/except blocks that swallow errors
 */
export const emptyCatchRule: AntiPatternRule = {
  type: 'empty-catch',
  name: 'Empty Catch Block',
  description: 'Catch blocks should not be empty',
  severity: 'warning',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, lines } = ctx;

    // JS/TS/Java/C#: catch (e) { }
    const jsCatchRegex = /catch\s*\([^)]*\)\s*{\s*}/g;
    let match;
    while ((match = jsCatchRegex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      patterns.push({
        type: 'empty-catch',
        file: filePath,
        line,
        severity: 'warning',
        message: 'Empty catch block silently swallows errors',
        details: {},
        suggestion: 'Log the error or handle it appropriately'
      });
    }

    // Python: except:
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';

      // Bare except or except with no meaningful body
      if (/^\s*except\s*:/.test(line) || /^\s*except\s+\w+\s*:/.test(line)) {
        if (nextLine.trim() === 'pass' || nextLine.trim() === '') {
          patterns.push({
            type: 'empty-catch',
            file: filePath,
            line: i + 1,
            severity: 'warning',
            message: 'Empty except block silently swallows errors',
            details: {},
            suggestion: 'Log the exception or handle it appropriately'
          });
        }
      }
    }

    // Go: if err != nil { } or _, _ = (ignoring error)
    const goIgnoreErr = /,\s*_\s*:?=.*err/g;
    while ((match = goIgnoreErr.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      patterns.push({
        type: 'empty-catch',
        file: filePath,
        line,
        severity: 'warning',
        message: 'Error is being ignored',
        details: {},
        suggestion: 'Handle the error or explicitly document why it is ignored'
      });
    }

    return patterns;
  }
};

/**
 * Rule: Duplicate Code
 * Placeholder - actual detection is in find_duplicates tool
 */
export const duplicateCodeRule: AntiPatternRule = {
  type: 'duplicate-code',
  name: 'Duplicate Code',
  description: 'Code duplication should be refactored',
  severity: 'warning',
  enabled: true,
  check: () => [] // Handled by find_duplicates tool
};

/**
 * Rule: Feature Envy
 * Detects methods that use data from other classes more than their own
 */
export const featureEnvyRule: AntiPatternRule = {
  type: 'feature-envy',
  name: 'Feature Envy',
  description: 'Method uses data from another class more than its own',
  severity: 'info',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, lines } = ctx;

    // Simple heuristic: method chains of 3+ calls
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const chainMatch = line.match(/(\w+(?:\.\w+){3,})/g);

      if (chainMatch) {
        for (const chain of chainMatch) {
          // Skip common patterns like console.log, Promise.resolve, etc.
          if (!/^(console|Promise|Object|Array|Math|JSON)\./i.test(chain)) {
            patterns.push({
              type: 'feature-envy',
              file: filePath,
              line: i + 1,
              severity: 'info',
              message: `Long method chain: ${chain.substring(0, 50)}...`,
              details: { chain },
              suggestion: 'Consider Law of Demeter - move logic to the appropriate class'
            });
          }
        }
      }
    }

    return patterns;
  }
};

/**
 * Rule: Data Clump
 * Detects groups of data that appear together in multiple places
 */
export const dataClumpRule: AntiPatternRule = {
  type: 'data-clump',
  name: 'Data Clump',
  description: 'Related data items should be grouped into a class/struct',
  severity: 'info',
  enabled: true,
  check: (ctx) => {
    // Complex analysis - would need multi-file context
    // This is a placeholder for future enhancement
    return [];
  }
};

/**
 * Rule: Primitive Obsession
 * Detects overuse of primitives instead of small objects
 */
export const primitiveObsessionRule: AntiPatternRule = {
  type: 'primitive-obsession',
  name: 'Primitive Obsession',
  description: 'Consider using value objects instead of primitives',
  severity: 'info',
  enabled: true,
  check: (ctx) => {
    const patterns: AntiPattern[] = [];
    const { content, filePath, lines } = ctx;

    // Detect functions with many string/number parameters
    const funcPattern = /(?:function|def|fn|func)\s+\w+\s*\(([^)]+)\)/g;
    let match;

    while ((match = funcPattern.exec(content)) !== null) {
      const params = match[1];
      const primitiveParams = params.split(',').filter(p =>
        /:\s*(?:string|number|int|float|str|bool|boolean)\b/i.test(p)
      );

      if (primitiveParams.length >= 4) {
        const line = content.substring(0, match.index).split('\n').length;
        patterns.push({
          type: 'primitive-obsession',
          file: filePath,
          line,
          severity: 'info',
          message: `Function has ${primitiveParams.length} primitive parameters`,
          details: { count: primitiveParams.length },
          suggestion: 'Consider using a value object or options pattern'
        });
      }
    }

    return patterns;
  }
};

// Export all rules
export const ALL_RULES: AntiPatternRule[] = [
  godClassRule,
  longMethodRule,
  deepNestingRule,
  excessiveParametersRule,
  magicNumbersRule,
  emptyCatchRule,
  duplicateCodeRule,
  featureEnvyRule,
  dataClumpRule,
  primitiveObsessionRule
];

/**
 * Run all enabled rules on a file
 */
export function runRules(
  content: string,
  filePath: string,
  thresholds: Thresholds,
  enabledPatterns?: AntiPatternType[]
): AntiPattern[] {
  const context: RuleContext = {
    content,
    filePath,
    thresholds,
    lines: content.split('\n')
  };

  const results: AntiPattern[] = [];

  for (const rule of ALL_RULES) {
    if (!rule.enabled) continue;
    if (enabledPatterns && !enabledPatterns.includes(rule.type)) continue;

    try {
      const patterns = rule.check(context);
      results.push(...patterns);
    } catch (error) {
      // Rule failed - skip silently
    }
  }

  return results;
}

/**
 * Get rule by type
 */
export function getRule(type: AntiPatternType): AntiPatternRule | undefined {
  return ALL_RULES.find(r => r.type === type);
}

/**
 * Get all rule descriptions
 */
export function getRuleDescriptions(): { type: AntiPatternType; name: string; description: string }[] {
  return ALL_RULES.map(r => ({
    type: r.type,
    name: r.name,
    description: r.description
  }));
}
