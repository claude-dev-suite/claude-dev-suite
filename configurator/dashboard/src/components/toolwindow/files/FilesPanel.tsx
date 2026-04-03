// SPDX-License-Identifier: MIT
/**
 * FilesPanel - Read-only file viewer tool window
 *
 * Left pane: collapsible directory tree
 * Right pane: syntax-highlighted file content via shiki (github-dark theme)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BundledLanguage, HighlighterGeneric } from 'shiki';
import { useProjectStore } from '../../../stores/project.store';
import { API_BASE } from '@/utils/api';

// ============================================
// TYPES
// ============================================

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

// ============================================
// LANGUAGE DETECTION
// ============================================

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
  cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  md: 'markdown', mdx: 'mdx', json: 'json', jsonc: 'jsonc',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  sql: 'sql', graphql: 'graphql', proto: 'proto',
  dockerfile: 'dockerfile', tf: 'hcl', hcl: 'hcl',
  vue: 'vue', svelte: 'svelte',
  swift: 'swift', rb: 'ruby', php: 'php', lua: 'lua',
  r: 'r', dart: 'dart', ex: 'elixir', exs: 'elixir',
  env: 'bash', gitignore: 'bash', prettierrc: 'json',
};

function detectLang(filePath: string): BundledLanguage | 'text' {
  const name = filePath.split('/').pop() ?? '';
  // Match filenames like Dockerfile, .gitignore (no extension)
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile' as BundledLanguage;

  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : lower;
  return EXT_TO_LANG[ext] ?? 'text';
}

// ============================================
// FILE TREE COMPONENT
// ============================================

interface TreeNodeProps {
  node: FileTreeNode;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  depth: number;
}

function TreeNode({ node, selectedFile, onSelectFile, depth }: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0);

  const indent = depth * 12;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 w-full text-left py-0.5 px-2 rounded
            text-surface-300 hover:text-surface-100 hover:bg-surface-700
            transition-colors duration-100 text-xs"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          {/* Chevron */}
          <svg
            className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {/* Folder icon */}
          <svg className="w-3.5 h-3.5 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const isSelected = node.path === selectedFile;
  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={`flex items-center gap-1.5 w-full text-left py-0.5 rounded
        text-xs transition-colors duration-100
        ${isSelected
          ? 'bg-accent-600 text-white'
          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700'
        }`}
      style={{ paddingLeft: `${20 + indent}px`, paddingRight: '8px' }}
      title={node.path}
    >
      {/* File icon */}
      <svg className="w-3.5 h-3.5 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// ============================================
// MAIN PANEL
// ============================================

export function FilesPanel() {
  const projectPath = useProjectStore((s) => s.projectPath);

  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Persist the shiki highlighter across renders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlighterRef = useRef<HighlighterGeneric<any, any> | null>(null);
  const loadedLangs = useRef<Set<string>>(new Set());

  // ---- Load tree ----
  useEffect(() => {
    if (!projectPath) return;
    setTreeLoading(true);
    setTreeError(null);

    fetch(`${API_BASE}/api/files/tree?path=${encodeURIComponent(projectPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setTree(data.data);
        } else {
          setTreeError(data.error ?? 'Failed to load files');
        }
      })
      .catch(() => setTreeError('Could not connect to server'))
      .finally(() => setTreeLoading(false));
  }, [projectPath]);

  // ---- Highlight helper ----
  const highlight = useCallback(async (filePath: string, content: string) => {
    const lang = detectLang(filePath);

    // Lazy-create the highlighter on first use
    if (!highlighterRef.current) {
      const { getSingletonHighlighter } = await import('shiki');
      highlighterRef.current = await getSingletonHighlighter({
        themes: ['github-dark'],
        langs: lang !== 'text' ? [lang] : [],
      });
      if (lang !== 'text') loadedLangs.current.add(lang);
    }

    // Load language on demand if not yet available
    if (lang !== 'text' && !loadedLangs.current.has(lang)) {
      try {
        await highlighterRef.current.loadLanguage(lang);
        loadedLangs.current.add(lang);
      } catch {
        // Language not bundled — fall back to plain text
      }
    }

    const effectiveLang = loadedLangs.current.has(lang) ? lang : 'text';

    return highlighterRef.current.codeToHtml(content, {
      lang: effectiveLang,
      theme: 'github-dark',
    });
  }, []);

  // ---- Open file ----
  const handleSelectFile = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    setSelectedFile(filePath);
    setHighlightedHtml(null);
    setFileError(null);
    setFileLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/files/read?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(filePath)}`
      );
      const data = await res.json();

      if (!data.success) {
        setFileError(data.error ?? 'Failed to read file');
        return;
      }

      const html = await highlight(filePath, data.data.content);
      setHighlightedHtml(html);
    } catch {
      setFileError('Could not load file');
    } finally {
      setFileLoading(false);
    }
  }, [projectPath, highlight]);

  // ---- Empty state ----
  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full text-surface-500 text-xs p-4 text-center">
        Open a project to browse files.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── File Tree ── */}
      <div className="w-44 shrink-0 border-r border-surface-700 overflow-y-auto overflow-x-hidden py-1">
        {treeLoading && (
          <div className="flex items-center justify-center py-4">
            <svg className="w-4 h-4 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {treeError && (
          <p className="text-red-400 text-xs p-2">{treeError}</p>
        )}
        {!treeLoading && !treeError && tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            depth={0}
          />
        ))}
      </div>

      {/* ── File Content ── */}
      <div className="flex-1 overflow-auto relative">
        {/* No file selected */}
        {!selectedFile && !fileLoading && (
          <div className="flex items-center justify-center h-full text-surface-500 text-xs">
            Select a file to view
          </div>
        )}

        {/* Loading spinner */}
        {fileLoading && (
          <div className="flex items-center justify-center h-full">
            <svg className="w-5 h-5 animate-spin text-surface-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Error */}
        {fileError && !fileLoading && (
          <div className="p-4 text-red-400 text-xs">{fileError}</div>
        )}

        {/* Highlighted content */}
        {highlightedHtml && !fileLoading && (
          <>
            {/* File path breadcrumb */}
            <div className="sticky top-0 z-10 px-3 py-1.5 bg-surface-900 border-b border-surface-700
              text-surface-400 text-xs font-mono truncate">
              {selectedFile}
            </div>
            {/* Shiki output — background already set by github-dark theme */}
            <div
              className="text-xs [&_pre]:p-4 [&_pre]:min-h-full [&_pre]:!bg-transparent
                [&_.shiki]:!bg-transparent [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5"
              // File content is read from user's own local project via path-validated backend
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </>
        )}
      </div>
    </div>
  );
}
