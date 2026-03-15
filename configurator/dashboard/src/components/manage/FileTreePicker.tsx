// SPDX-License-Identifier: MIT
import clsx from 'clsx';

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  depth: number;
  fileCount?: number;
}

export interface FileTreePickerProps {
  tree: FileTreeNode[];
  selectedPaths: string[];
  collapsedDirs: Set<string>;
  onTogglePath: (path: string) => void;
  onToggleCollapse: (path: string) => void;
  totalFiles: number;
}

export function FileTreePicker({
  tree,
  selectedPaths,
  collapsedDirs,
  onTogglePath,
  onToggleCollapse,
  totalFiles,
}: FileTreePickerProps) {
  if (tree.length === 0) {
    return (
      <div className="text-center py-8 text-surface-400 text-sm">
        No files found
      </div>
    );
  }

  // Check if a node should be visible (no collapsed ancestor)
  const isNodeVisible = (nodePath: string): boolean => {
    // Check if any ancestor directory is collapsed
    for (const collapsedPath of collapsedDirs) {
      // If the node's path starts with a collapsed directory path + '/', it's hidden
      if (nodePath.startsWith(collapsedPath + '/')) {
        return false;
      }
    }
    return true;
  };

  // Filter visible nodes
  const visibleTree = tree.filter((node) => isNodeVisible(node.path));

  return (
    <div className="border border-surface-700 rounded-lg">
      <div className="p-3 bg-surface-800/50 border-b border-surface-700 flex items-center justify-between">
        <span className="text-sm text-surface-300 font-medium">Select Files/Directories</span>
        <span className="text-xs text-surface-400">{totalFiles} files</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-2">
        {visibleTree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            isSelected={selectedPaths.includes(node.path)}
            isCollapsed={collapsedDirs.has(node.path)}
            onTogglePath={onTogglePath}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
      </div>
    </div>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  isSelected: boolean;
  isCollapsed: boolean;
  onTogglePath: (path: string) => void;
  onToggleCollapse: (path: string) => void;
}

function FileTreeItem({
  node,
  isSelected,
  isCollapsed,
  onTogglePath,
  onToggleCollapse,
}: FileTreeItemProps) {
  const isDirectory = node.type === 'directory';
  const paddingLeft = node.depth * 16;

  return (
    <div
      className={clsx(
        'flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-800/50 transition-colors group',
        isSelected && 'bg-primary-500/10'
      )}
      style={{ paddingLeft: `${paddingLeft + 8}px` }}
    >
      {isDirectory && (
        <button
          onClick={() => onToggleCollapse(node.path)}
          className="w-4 h-4 flex items-center justify-center text-surface-400 hover:text-white transition-colors"
        >
          <span className="text-xs">
            {isCollapsed ? '▶' : '▼'}
          </span>
        </button>
      )}
      {!isDirectory && (
        <span className="w-4 h-4 flex items-center justify-center text-xs">
          📄
        </span>
      )}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onTogglePath(node.path)}
        className="rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
      />
      <label
        onClick={() => onTogglePath(node.path)}
        className="flex-1 text-sm text-surface-200 cursor-pointer select-none"
      >
        {node.name}
      </label>
      {isDirectory && node.fileCount !== undefined && (
        <span className="text-xs text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity">
          {node.fileCount} files
        </span>
      )}
    </div>
  );
}
