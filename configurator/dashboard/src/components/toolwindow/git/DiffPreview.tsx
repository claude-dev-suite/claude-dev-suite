// SPDX-License-Identifier: MIT
/**
 * DiffPreview - Modal component for viewing file diffs
 *
 * Features:
 * - Syntax highlighted diff view
 * - Line-by-line additions/deletions
 * - File stats (additions, deletions)
 * - Close on escape key
 */

import { useEffect, useCallback } from 'react';
import type { FileDiff } from '../../../types/git';

interface DiffPreviewProps {
  diff: FileDiff;
  onClose: () => void;
}

export function DiffPreview({ diff, onClose }: DiffPreviewProps) {
  // Close on escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Parse diff into lines with metadata
  const parsedLines = parseDiff(diff.diff);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-surface-800 rounded-lg shadow-xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-surface-100 truncate max-w-md">
              {diff.path}
            </span>
            <div className="flex items-center gap-2 text-xs">
              {diff.additions > 0 && (
                <span className="text-green-400">+{diff.additions}</span>
              )}
              {diff.deletions > 0 && (
                <span className="text-red-400">-{diff.deletions}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto">
          {diff.isBinary ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <p className="text-sm">Binary file - cannot display diff</p>
            </div>
          ) : diff.diff.trim() === '' ? (
            <div className="flex items-center justify-center h-full text-surface-400">
              <p className="text-sm">No changes to display</p>
            </div>
          ) : (
            <div className="font-mono text-xs">
              {parsedLines.map((line, index) => (
                <DiffLine key={index} line={line} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-700 text-xs text-surface-400">
          Press <kbd className="px-1.5 py-0.5 bg-surface-700 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

// ============================================
// DIFF PARSING
// ============================================

interface ParsedLine {
  type: 'header' | 'hunk' | 'addition' | 'deletion' | 'context' | 'empty';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(diff: string): ParsedLine[] {
  const lines = diff.split('\n');
  const result: ParsedLine[] = [];

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      // Parse hunk header: @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match?.[1] && match[2]) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      result.push({ type: 'hunk', content: line });
    } else if (line.startsWith('+')) {
      result.push({
        type: 'addition',
        content: line.substring(1),
        newLineNum: newLineNum++,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'deletion',
        content: line.substring(1),
        oldLineNum: oldLineNum++,
      });
    } else if (line.startsWith(' ')) {
      result.push({
        type: 'context',
        content: line.substring(1),
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    } else if (line === '') {
      result.push({ type: 'empty', content: '' });
    } else {
      result.push({ type: 'context', content: line });
    }
  }

  return result;
}

// ============================================
// DIFF LINE COMPONENT
// ============================================

interface DiffLineProps {
  line: ParsedLine;
}

function DiffLine({ line }: DiffLineProps) {
  const getLineStyle = () => {
    switch (line.type) {
      case 'header':
        return 'bg-surface-700 text-surface-400';
      case 'hunk':
        return 'bg-blue-500/10 text-blue-400';
      case 'addition':
        return 'bg-green-500/15 text-green-300';
      case 'deletion':
        return 'bg-red-500/15 text-red-300';
      case 'context':
        return 'text-surface-300';
      default:
        return 'text-surface-500';
    }
  };

  const getPrefix = () => {
    switch (line.type) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      case 'context':
        return ' ';
      default:
        return '';
    }
  };

  return (
    <div className={`flex ${getLineStyle()}`}>
      {/* Line numbers */}
      {(line.type === 'addition' || line.type === 'deletion' || line.type === 'context') && (
        <>
          <span className="w-12 px-2 text-right text-surface-500 select-none border-r border-surface-700 flex-shrink-0">
            {line.type !== 'addition' ? line.oldLineNum : ''}
          </span>
          <span className="w-12 px-2 text-right text-surface-500 select-none border-r border-surface-700 flex-shrink-0">
            {line.type !== 'deletion' ? line.newLineNum : ''}
          </span>
        </>
      )}

      {/* Prefix and content */}
      <span className="w-5 px-1 text-center select-none flex-shrink-0">
        {getPrefix()}
      </span>
      <pre className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
        {line.content || ' '}
      </pre>
    </div>
  );
}
