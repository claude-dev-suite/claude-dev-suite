// SPDX-License-Identifier: MIT
/**
 * Diff Viewer Component
 *
 * Displays a side-by-side or unified diff of two text contents.
 */

import { useState, useMemo } from 'react';
import clsx from 'clsx';

export interface DiffViewerProps {
  original: string;
  modified: string;
  title?: string;
  maxHeight?: string;
}

type ViewMode = 'split' | 'unified';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNumber: {
    original?: number;
    modified?: number;
  };
}

/**
 * Simple line-by-line diff algorithm
 */
function computeDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(originalLines, modifiedLines);

  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;

  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    if (lcsIdx < lcs.length && origIdx < originalLines.length && originalLines[origIdx] === lcs[lcsIdx]) {
      // Common line - advance both
      while (modIdx < modifiedLines.length && modifiedLines[modIdx] !== lcs[lcsIdx]) {
        result.push({
          type: 'added',
          content: modifiedLines[modIdx] || '',
          lineNumber: { modified: modIdx + 1 },
        });
        modIdx++;
      }

      result.push({
        type: 'unchanged',
        content: originalLines[origIdx] || '',
        lineNumber: { original: origIdx + 1, modified: modIdx + 1 },
      });

      origIdx++;
      modIdx++;
      lcsIdx++;
    } else if (origIdx < originalLines.length && (lcsIdx >= lcs.length || originalLines[origIdx] !== lcs[lcsIdx])) {
      // Line only in original - removed
      result.push({
        type: 'removed',
        content: originalLines[origIdx] || '',
        lineNumber: { original: origIdx + 1 },
      });
      origIdx++;
    } else if (modIdx < modifiedLines.length) {
      // Line only in modified - added
      result.push({
        type: 'added',
        content: modifiedLines[modIdx] || '',
        lineNumber: { modified: modIdx + 1 },
      });
      modIdx++;
    }
  }

  return result;
}

/**
 * Compute Longest Common Subsequence
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = (dp[i - 1]?.[j - 1] || 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]?.[j] || 0, dp[i]?.[j - 1] || 0);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]!);
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] || 0) > (dp[i]?.[j - 1] || 0)) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

export function DiffViewer({
  original,
  modified,
  title,
  maxHeight = '300px',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [isExpanded, setIsExpanded] = useState(false);

  const diffLines = useMemo(() => computeDiff(original, modified), [original, modified]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="border border-surface-600 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-800 border-b border-surface-700">
        <div className="flex items-center gap-3">
          {title && (
            <span className="text-sm font-mono text-surface-300">{title}</span>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">+{stats.added}</span>
            <span className="text-red-400">-{stats.removed}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('unified')}
            className={clsx(
              'px-2 py-1 text-xs rounded',
              viewMode === 'unified'
                ? 'bg-surface-600 text-white'
                : 'text-surface-400 hover:text-white'
            )}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={clsx(
              'px-2 py-1 text-xs rounded',
              viewMode === 'split'
                ? 'bg-surface-600 text-white'
                : 'text-surface-400 hover:text-white'
            )}
          >
            Split
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-1 text-xs text-surface-400 hover:text-white"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div
        className="overflow-auto bg-surface-900"
        style={{ maxHeight: isExpanded ? 'none' : maxHeight }}
      >
        {viewMode === 'unified' ? (
          <UnifiedView lines={diffLines} />
        ) : (
          <SplitView lines={diffLines} />
        )}
      </div>
    </div>
  );
}

interface ViewProps {
  lines: DiffLine[];
}

function UnifiedView({ lines }: ViewProps) {
  return (
    <table className="w-full text-xs font-mono">
      <tbody>
        {lines.map((line, idx) => (
          <tr
            key={idx}
            className={clsx(
              line.type === 'added' && 'bg-green-500/10',
              line.type === 'removed' && 'bg-red-500/10'
            )}
          >
            <td className="w-12 px-2 py-0.5 text-right text-surface-500 select-none border-r border-surface-700">
              {line.lineNumber.original || ''}
            </td>
            <td className="w-12 px-2 py-0.5 text-right text-surface-500 select-none border-r border-surface-700">
              {line.lineNumber.modified || ''}
            </td>
            <td className="w-6 px-1 py-0.5 text-center select-none">
              {line.type === 'added' && <span className="text-green-400">+</span>}
              {line.type === 'removed' && <span className="text-red-400">-</span>}
            </td>
            <td className="px-2 py-0.5 whitespace-pre">
              <span
                className={clsx(
                  line.type === 'added' && 'text-green-300',
                  line.type === 'removed' && 'text-red-300',
                  line.type === 'unchanged' && 'text-surface-300'
                )}
              >
                {line.content}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SplitView({ lines }: ViewProps) {
  // Group lines for split view
  const pairs: Array<{ left?: DiffLine; right?: DiffLine }> = [];

  const leftQueue: DiffLine[] = [];
  const rightQueue: DiffLine[] = [];

  for (const line of lines) {
    if (line.type === 'removed') {
      leftQueue.push(line);
    } else if (line.type === 'added') {
      rightQueue.push(line);
    } else {
      // Flush queues
      while (leftQueue.length || rightQueue.length) {
        pairs.push({
          left: leftQueue.shift(),
          right: rightQueue.shift(),
        });
      }
      // Add unchanged line to both sides
      pairs.push({ left: line, right: line });
    }
  }

  // Flush remaining
  while (leftQueue.length || rightQueue.length) {
    pairs.push({
      left: leftQueue.shift(),
      right: rightQueue.shift(),
    });
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-surface-700">
      {/* Left side (original) */}
      <div>
        <div className="px-2 py-1 bg-surface-800 text-xs text-surface-400 border-b border-surface-700">
          Original
        </div>
        <table className="w-full text-xs font-mono">
          <tbody>
            {pairs.map((pair, idx) => (
              <tr
                key={idx}
                className={clsx(
                  pair.left?.type === 'removed' && 'bg-red-500/10'
                )}
              >
                <td className="w-10 px-2 py-0.5 text-right text-surface-500 select-none border-r border-surface-700">
                  {pair.left?.lineNumber.original || ''}
                </td>
                <td className="px-2 py-0.5 whitespace-pre">
                  <span
                    className={clsx(
                      pair.left?.type === 'removed' && 'text-red-300',
                      pair.left?.type === 'unchanged' && 'text-surface-300'
                    )}
                  >
                    {pair.left?.content || ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right side (modified) */}
      <div>
        <div className="px-2 py-1 bg-surface-800 text-xs text-surface-400 border-b border-surface-700">
          Modified
        </div>
        <table className="w-full text-xs font-mono">
          <tbody>
            {pairs.map((pair, idx) => (
              <tr
                key={idx}
                className={clsx(
                  pair.right?.type === 'added' && 'bg-green-500/10'
                )}
              >
                <td className="w-10 px-2 py-0.5 text-right text-surface-500 select-none border-r border-surface-700">
                  {pair.right?.lineNumber.modified || ''}
                </td>
                <td className="px-2 py-0.5 whitespace-pre">
                  <span
                    className={clsx(
                      pair.right?.type === 'added' && 'text-green-300',
                      pair.right?.type === 'unchanged' && 'text-surface-300'
                    )}
                  >
                    {pair.right?.content || ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
