// SPDX-License-Identifier: MIT
/**
 * Log Search Analyzer
 * Search for text or patterns across multiple log files
 */

import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { parseLogFile, parseLogLine } from '../parsers/index.js';
import type {
  SearchLogsInput,
  SearchLogsResult,
  SearchMatch,
  LogFormat,
  LogEntry,
} from '../types.js';

/**
 * Search logs for a query across multiple files
 */
export async function searchLogs(input: SearchLogsInput): Promise<SearchLogsResult> {
  const startTime = Date.now();
  const {
    filePaths,
    query,
    caseSensitive = false,
    useRegex = false,
    context = 0,
    limit = 100,
    format = 'auto',
  } = input;

  const matches: SearchMatch[] = [];
  let filesSearched = 0;
  const filesWithMatches = new Set<string>();

  // Build search pattern
  let searchPattern: RegExp;
  if (useRegex) {
    searchPattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
  } else {
    // Escape regex special characters for literal search
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchPattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
  }

  // Process each file
  for (const filePath of filePaths) {
    if (matches.length >= limit) break;

    try {
      filesSearched++;
      const fileMatches = await searchFile(filePath, searchPattern, context, limit - matches.length, format);

      if (fileMatches.length > 0) {
        filesWithMatches.add(filePath);
        matches.push(...fileMatches);
      }
    } catch (error) {
      // Skip files that can't be read
      console.error(`Error searching file ${filePath}:`, error);
    }
  }

  return {
    query,
    totalMatches: matches.length,
    filesSearched,
    filesWithMatches: filesWithMatches.size,
    matches: matches.slice(0, limit),
    searchTime: Date.now() - startTime,
  };
}

/**
 * Search a single file for matches
 */
async function searchFile(
  filePath: string,
  pattern: RegExp,
  contextLines: number,
  maxMatches: number,
  format: LogFormat
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = [];
  const lines: string[] = [];
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  // Read all lines first for context support
  for await (const line of rl) {
    lines.push(line);
  }

  // Search through lines
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Reset pattern lastIndex for global regex
    pattern.lastIndex = 0;
    const match = pattern.exec(line);

    if (match) {
      // Get context lines
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];

      if (contextLines > 0) {
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          contextBefore.push(lines[j]);
        }
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + contextLines); j++) {
          contextAfter.push(lines[j]);
        }
      }

      // Try to parse as log entry
      let entry: LogEntry | undefined;
      try {
        entry = parseLogLine(line, format, lineNumber) ?? undefined;
      } catch {
        // Not a parseable log entry
      }

      matches.push({
        file: filePath,
        lineNumber,
        line,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        contextBefore,
        contextAfter,
        entry,
      });
    }
  }

  return matches;
}

/**
 * Search with streaming for large files
 */
export async function searchLogsStream(
  filePath: string,
  pattern: RegExp,
  callback: (match: SearchMatch) => void,
  maxMatches = 1000
): Promise<number> {
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let matchCount = 0;

  for await (const line of rl) {
    lineNumber++;

    if (matchCount >= maxMatches) break;

    pattern.lastIndex = 0;
    const match = pattern.exec(line);

    if (match) {
      matchCount++;
      callback({
        file: filePath,
        lineNumber,
        line,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        contextBefore: [],
        contextAfter: [],
      });
    }
  }

  return matchCount;
}

/**
 * Highlight matches in a line for display
 */
export function highlightMatches(line: string, pattern: RegExp): string {
  return line.replace(pattern, (match) => `**${match}**`);
}

/**
 * Build summary of search results
 */
export function summarizeSearchResults(result: SearchLogsResult): string {
  const lines = [
    `Search Results for: "${result.query}"`,
    `─`.repeat(50),
    `Files searched: ${result.filesSearched}`,
    `Files with matches: ${result.filesWithMatches}`,
    `Total matches: ${result.totalMatches}`,
    `Search time: ${result.searchTime}ms`,
    '',
  ];

  if (result.matches.length > 0) {
    lines.push('Matches:');
    lines.push('');

    // Group matches by file
    const byFile = new Map<string, SearchMatch[]>();
    for (const match of result.matches) {
      if (!byFile.has(match.file)) {
        byFile.set(match.file, []);
      }
      byFile.get(match.file)!.push(match);
    }

    for (const [file, fileMatches] of byFile) {
      lines.push(`📁 ${file} (${fileMatches.length} matches)`);
      for (const match of fileMatches.slice(0, 5)) {
        const truncatedLine = match.line.length > 80
          ? match.line.substring(0, 77) + '...'
          : match.line;
        lines.push(`  L${match.lineNumber}: ${truncatedLine}`);
      }
      if (fileMatches.length > 5) {
        lines.push(`  ... and ${fileMatches.length - 5} more matches`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
