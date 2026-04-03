// SPDX-License-Identifier: MIT
/* eslint-disable react-refresh/only-export-components -- buildFileTree utility and FileTreeNode type are co-located with the component that uses them */
/**
 * FileTree component for displaying git changes in a tree structure
 */

import { getStatusBadgeClass } from '../../../types/git';

// File tree node type
export interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, FileTreeNode>;
  file?: { path: string; status: string; staged: boolean };
}

// Build a tree structure from flat file list
export function buildFileTree(files: { path: string; status: string; staged: boolean }[]): FileTreeNode {
  const root: FileTreeNode = {
    name: '',
    path: '',
    isFolder: true,
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isLastPart = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isFolder: !isLastPart,
          children: new Map(),
          file: isLastPart ? file : undefined,
        });
      }

      const next = current.children.get(part);
      if (!next) continue;
      current = next;
    }
  }

  return root;
}

// Count files recursively in a tree node
function countFiles(node: FileTreeNode): number {
  let count = 0;
  for (const child of node.children.values()) {
    if (child.isFolder) {
      count += countFiles(child);
    } else {
      count += 1;
    }
  }
  return count;
}

interface FileTreeProps {
  node: FileTreeNode;
  depth?: number;
  staged?: boolean;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onDiscard?: (path: string) => void;
  onViewDiff?: (path: string, staged: boolean) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

export function FileTree({
  node,
  depth = 0,
  staged = false,
  onStage,
  onUnstage,
  onDiscard,
  onViewDiff,
  expandedFolders,
  onToggleFolder,
}: FileTreeProps) {
  // Sort children: folders first, then files, both alphabetically
  const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sortedChildren.map((child) => {
        if (child.isFolder) {
          const isExpanded = expandedFolders.has(child.path);
          const fileCount = countFiles(child);

          return (
            <div key={child.path}>
              <button
                onClick={() => onToggleFolder(child.path)}
                className="w-full flex items-center gap-1 px-1 py-0.5 rounded hover:bg-surface-700/50 text-left"
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
              >
                <svg
                  className={`w-3 h-3 text-surface-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-xs text-surface-300 truncate flex-1">{child.name}</span>
                <span className="text-xs text-surface-400">{fileCount}</span>
              </button>
              {isExpanded && (
                <FileTree
                  node={child}
                  depth={depth + 1}
                  staged={staged}
                  onStage={onStage}
                  onUnstage={onUnstage}
                  onDiscard={onDiscard}
                  onViewDiff={onViewDiff}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                />
              )}
            </div>
          );
        }

        // Render file
        const file = child.file!;
        const canViewDiff = file.status !== '?' && onViewDiff;

        return (
          <div
            key={child.path}
            className="group flex items-center gap-1 px-1 py-0.5 rounded hover:bg-surface-700/50"
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            <span className={`text-xs font-mono ${getStatusBadgeClass(file.status as 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?')} px-1 rounded`}>
              {file.status}
            </span>
            <button
              onClick={() => canViewDiff && onViewDiff(file.path, staged)}
              className={`text-xs text-surface-200 truncate flex-1 text-left ${canViewDiff ? 'hover:text-accent-400 hover:underline cursor-pointer' : ''}`}
              disabled={!canViewDiff}
              title={canViewDiff ? 'Click to view diff' : child.name}
            >
              {child.name}
            </button>
            <div className="hidden group-hover:flex items-center gap-0.5">
              {canViewDiff && (
                <button
                  onClick={() => onViewDiff(file.path, staged)}
                  className="p-0.5 text-surface-400 hover:text-accent-400"
                  title="View diff"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              )}
              {onStage && (
                <button
                  onClick={() => onStage(file.path)}
                  className="p-0.5 text-surface-400 hover:text-green-400"
                  title="Stage"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              {onUnstage && (
                <button
                  onClick={() => onUnstage(file.path)}
                  className="p-0.5 text-surface-400 hover:text-yellow-400"
                  title="Unstage"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
              )}
              {onDiscard && (
                <button
                  onClick={() => onDiscard(file.path)}
                  className="p-0.5 text-surface-400 hover:text-red-400"
                  title="Discard"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
