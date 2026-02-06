// SPDX-License-Identifier: MIT
/**
 * Tool: find_duplicates
 * Detects code duplication across files
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import type { DuplicationResult, DuplicateBlock, FindDuplicatesInput } from '../types.js';
import { isFileSupported } from '../analyzers/index.js';

interface TokenizedBlock {
  hash: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

/**
 * Find duplicate code blocks
 */
export async function findDuplicates(input: FindDuplicatesInput): Promise<DuplicationResult> {
  const { path: targetPath, minLines = 6, minTokens = 50 } = input;

  const stats = await fs.stat(targetPath);
  const files: Map<string, string> = new Map();

  if (stats.isDirectory()) {
    const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go', '**/*.rs'];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: targetPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**', '**/vendor/**', '**/*.test.*', '**/*.spec.*'],
        absolute: true
      });

      for (const filePath of matches) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          files.set(filePath, content);
        } catch {
          // Skip unreadable files
        }
      }
    }
  } else if (isFileSupported(targetPath)) {
    const content = await fs.readFile(targetPath, 'utf-8');
    files.set(path.resolve(targetPath), content);
  }

  return detectDuplicates(files, minLines, minTokens);
}

/**
 * Detect duplicate blocks across files using sliding window approach
 */
function detectDuplicates(
  files: Map<string, string>,
  minLines: number,
  minTokens: number
): DuplicationResult {
  const blocks: Map<string, TokenizedBlock[]> = new Map();

  // Extract and hash blocks from all files
  for (const [filePath, content] of files) {
    const lines = content.split('\n');

    // Sliding window of minLines
    for (let start = 0; start <= lines.length - minLines; start++) {
      const blockLines = lines.slice(start, start + minLines);

      // Normalize the block
      const normalized = normalizeBlock(blockLines);

      // Skip blocks that are too short or trivial
      if (normalized.tokens < minTokens) continue;
      if (isTrivialBlock(normalized.content)) continue;

      if (!blocks.has(normalized.hash)) {
        blocks.set(normalized.hash, []);
      }

      blocks.get(normalized.hash)!.push({
        hash: normalized.hash,
        file: filePath,
        startLine: start + 1,
        endLine: start + minLines,
        content: blockLines.join('\n')
      });
    }
  }

  // Find actual duplicates (blocks that appear in multiple places)
  const duplicates: DuplicateBlock[] = [];
  let totalDuplicateLines = 0;

  for (const [hash, locations] of blocks) {
    // Filter to unique locations (not overlapping in same file)
    const uniqueLocations = filterOverlapping(locations);

    if (uniqueLocations.length > 1) {
      // Check for extended duplicates (blocks that continue beyond minLines)
      const extended = extendDuplicates(uniqueLocations, files, minLines);

      duplicates.push({
        files: extended.locations.map(loc => ({
          file: loc.file,
          startLine: loc.startLine,
          endLine: loc.endLine
        })),
        lines: extended.lines,
        tokens: extended.tokens,
        fragment: extended.content.substring(0, 200) + (extended.content.length > 200 ? '...' : '')
      });

      totalDuplicateLines += extended.lines * (extended.locations.length - 1);
    }
  }

  // Calculate total lines
  let totalLines = 0;
  for (const [_, content] of files) {
    totalLines += content.split('\n').length;
  }

  // Remove subset duplicates (smaller blocks that are part of larger ones)
  const filteredDuplicates = removeSubsetDuplicates(duplicates);

  // Sort by impact (lines * occurrences)
  filteredDuplicates.sort((a, b) => (b.lines * b.files.length) - (a.lines * a.files.length));

  return {
    duplicates: filteredDuplicates.slice(0, 50), // Top 50 duplicates
    totalDuplicateLines,
    duplicationPercentage: totalLines > 0
      ? Math.round((totalDuplicateLines / totalLines) * 10000) / 100
      : 0
  };
}

/**
 * Normalize a block for comparison
 */
function normalizeBlock(lines: string[]): { content: string; hash: string; tokens: number } {
  const normalized = lines
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('*'))
    .join('\n')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove string literals
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/`[^`]*`/g, '``');

  const tokens = normalized.split(/\s+/).length;
  const hash = simpleHash(normalized);

  return { content: normalized, hash, tokens };
}

/**
 * Check if a block is trivial (import statements, empty blocks, etc.)
 */
function isTrivialBlock(content: string): boolean {
  // Skip import-only blocks
  if (/^(import|from|use|#include|require)/.test(content.trim())) return true;

  // Skip blocks that are mostly braces
  const braceRatio = (content.match(/[{}()[\]]/g) || []).length / content.length;
  if (braceRatio > 0.3) return true;

  // Skip very short content
  if (content.replace(/\s/g, '').length < 30) return true;

  return false;
}

/**
 * Simple hash function
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
 * Filter overlapping blocks in the same file
 */
function filterOverlapping(locations: TokenizedBlock[]): TokenizedBlock[] {
  const result: TokenizedBlock[] = [];

  for (const loc of locations) {
    const overlaps = result.some(r =>
      r.file === loc.file &&
      Math.abs(r.startLine - loc.startLine) < (r.endLine - r.startLine)
    );

    if (!overlaps) {
      result.push(loc);
    }
  }

  return result;
}

/**
 * Try to extend duplicate blocks beyond the minimum
 */
function extendDuplicates(
  locations: TokenizedBlock[],
  files: Map<string, string>,
  minLines: number
): { locations: TokenizedBlock[]; lines: number; tokens: number; content: string } {
  if (locations.length < 2) {
    return {
      locations,
      lines: minLines,
      tokens: 0,
      content: locations[0]?.content || ''
    };
  }

  // Try to extend forward
  let extendedLines = minLines;
  let canExtend = true;

  while (canExtend && extendedLines < 100) { // Max 100 lines
    const nextLines: string[] = [];

    for (const loc of locations) {
      const content = files.get(loc.file);
      if (!content) {
        canExtend = false;
        break;
      }

      const lines = content.split('\n');
      const nextLineIndex = loc.startLine - 1 + extendedLines;

      if (nextLineIndex >= lines.length) {
        canExtend = false;
        break;
      }

      nextLines.push(lines[nextLineIndex].trim());
    }

    if (canExtend && new Set(nextLines).size === 1 && nextLines[0].length > 0) {
      extendedLines++;
    } else {
      canExtend = false;
    }
  }

  // Update locations with extended end lines
  const extendedLocations = locations.map(loc => ({
    ...loc,
    endLine: loc.startLine + extendedLines - 1
  }));

  // Get the content
  const firstLoc = locations[0];
  const content = files.get(firstLoc.file)?.split('\n')
    .slice(firstLoc.startLine - 1, firstLoc.startLine - 1 + extendedLines)
    .join('\n') || '';

  return {
    locations: extendedLocations,
    lines: extendedLines,
    tokens: content.split(/\s+/).length,
    content
  };
}

/**
 * Remove duplicates that are subsets of larger duplicates
 */
function removeSubsetDuplicates(duplicates: DuplicateBlock[]): DuplicateBlock[] {
  return duplicates.filter((dup, index) => {
    // Check if this duplicate is a subset of any other larger duplicate
    return !duplicates.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      if (other.lines <= dup.lines) return false;

      // Check if locations overlap
      return dup.files.every(dupLoc =>
        other.files.some(otherLoc =>
          dupLoc.file === otherLoc.file &&
          dupLoc.startLine >= otherLoc.startLine &&
          dupLoc.endLine <= otherLoc.endLine
        )
      );
    });
  });
}

/**
 * Format duplication report as text
 */
export function formatDuplicationReport(result: DuplicationResult): string {
  const lines: string[] = [];

  lines.push('# Code Duplication Report\n');

  lines.push('## Summary');
  lines.push(`- Duplicate blocks found: ${result.duplicates.length}`);
  lines.push(`- Total duplicate lines: ${result.totalDuplicateLines}`);
  lines.push(`- Duplication percentage: ${result.duplicationPercentage}%`);
  lines.push('');

  if (result.duplicates.length > 0) {
    lines.push('## Duplicate Blocks\n');

    for (let i = 0; i < result.duplicates.length; i++) {
      const dup = result.duplicates[i];
      lines.push(`### Block ${i + 1} (${dup.lines} lines, ${dup.files.length} occurrences)`);
      lines.push('');
      lines.push('Locations:');
      for (const loc of dup.files) {
        lines.push(`- ${path.basename(loc.file)}:${loc.startLine}-${loc.endLine}`);
      }
      lines.push('');
      lines.push('Fragment:');
      lines.push('```');
      lines.push(dup.fragment);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}
