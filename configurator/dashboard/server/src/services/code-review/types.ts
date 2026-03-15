// SPDX-License-Identifier: MIT
/**
 * Code Review Types
 */

export interface ReviewOption {
  label: string;
  agentId: string;
  description: string;
  taskPrompt: string;
}

export interface SubTask {
  agentId: string;
  task: string;
  dependencies: string[];
}

export interface ReviewJob {
  title: string;
  context: string;
  subTasks: SubTask[];
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  depth: number;
  fileCount?: number;
}

export interface SourceFilesResult {
  tree: FileTreeNode[];
  files: string[];
  totalFiles: number;
}

export interface DiffResult {
  diff: string;
  files: string[];
}

export interface ReviewIssue {
  agentId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line: number;
  message: string;
}

export interface ReviewSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}
