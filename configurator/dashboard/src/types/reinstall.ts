// SPDX-License-Identifier: MIT
/**
 * Reinstall (erase-and-replace) Types — client mirror of the server types.
 */

export type ReinstallFileResolution = 'overwrite' | 'keep';

export interface ReinstallModifiedFile {
  path: string;
  type: 'agent' | 'skill' | 'mcp-server' | 'config' | 'generated';
  manifestHash: string;
  currentHash: string;
}

export interface ReinstallPreviewResult {
  hasValidManifest: boolean;
  reason?: string;
  selection: {
    agents: string[];
    mcpServers: string[];
    rules: string[];
  };
  modifiedManagedFiles: ReinstallModifiedFile[];
  orphansToRemove: string[];
  filesToReplace: string[];
  skillDirsToRebuild: number;
  requiresIntervention: boolean;
}

export interface ReinstallExecuteRequest {
  projectPath: string;
  resolutions?: Record<string, ReinstallFileResolution>;
  createBackup?: boolean;
}

export interface ReinstallExecuteResult {
  success: boolean;
  error?: string;
  rolledBack?: boolean;
  backupDir?: string;
  agentsReinstalled: string[];
  mcpReinstalled: string[];
  orphansRemoved: string[];
  keptFiles: string[];
  verifyWarnings: string[];
}

export interface ReinstallHistoryEntry {
  timestamp: string;
  devSuiteVersion: string;
  agentsReinstalled: string[];
  mcpReinstalled: string[];
  orphansRemoved: string[];
  keptFiles: string[];
  backupDir?: string;
}
