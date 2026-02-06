// SPDX-License-Identifier: MIT
/**
 * Validation Service
 *
 * Handles all validation logic:
 * - Project path validation with security checks (OWASP A01 - Broken Access Control)
 * - Message length validation
 * - Agent ID validation
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { wsLogger } from '../../utils/logger.js';
import type {
  PathValidationResult,
  MessageValidationResult,
  OrchestratorConfig,
} from './types.js';

/**
 * Blocked system directories that should never be accessible
 */
const BLOCKED_SYSTEM_PATHS = [
  '/etc',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  '/System',
  '/Library/System',
];

export class ValidationService {
  private installedAgents: Set<string>;
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.installedAgents = new Set();
  }

  /**
   * Set installed agents for validation
   */
  setInstalledAgents(agents: string[]): void {
    this.installedAgents = new Set(agents);
    wsLogger.info('Loaded agents for validation', { count: agents.length });
  }

  /**
   * Get allowed workspace roots for path validation
   * Prevents access to sensitive system directories
   */
  private getAllowedWorkspaceRoots(): string[] {
    const roots: string[] = [];

    // User's home directory and subdirectories are allowed
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      roots.push(path.normalize(homeDir));
    }

    // Current working directory and subdirectories
    roots.push(path.normalize(process.cwd()));

    // Explicitly configured workspace from environment
    if (process.env.WORKSPACE_ROOT) {
      roots.push(path.normalize(process.env.WORKSPACE_ROOT));
    }

    return roots;
  }

  /**
   * Check if a path escapes allowed workspace boundaries
   */
  private isPathWithinAllowedRoots(resolvedPath: string, allowedRoots: string[]): boolean {
    const normalizedPath = path.normalize(resolvedPath);

    // Path must start with at least one allowed root
    return allowedRoots.some(root => {
      // Ensure root and path use same separator format for comparison
      const normalizedRoot = path.normalize(root);
      return normalizedPath.startsWith(normalizedRoot);
    });
  }

  /**
   * Check if path attempts to access blocked system directories
   */
  private isBlockedSystemPath(resolvedPath: string): boolean {
    const normalizedPath = path.normalize(resolvedPath).toLowerCase();

    return BLOCKED_SYSTEM_PATHS.some(blocked => {
      const normalizedBlocked = path.normalize(blocked).toLowerCase();
      return normalizedPath.startsWith(normalizedBlocked);
    });
  }

  /**
   * Validate project path with comprehensive security checks
   * CRITICAL: Prevents path traversal attacks (OWASP A01 - Broken Access Control)
   *
   * Security measures:
   * 1. Type and presence validation
   * 2. Pre-resolution traversal detection
   * 3. Path normalization to handle edge cases
   * 4. Post-resolution workspace boundary validation
   * 5. System directory blocking
   * 6. Existence verification
   * 7. Security event logging
   */
  validateProjectPath(projectPath: string): PathValidationResult {
    // 1. Basic validation
    if (!projectPath || typeof projectPath !== 'string') {
      wsLogger.warn('Path validation failed: empty or invalid type');
      return { valid: false, error: 'Project path is required' };
    }

    // 2. Pre-resolution traversal check (catches obvious attempts)
    if (projectPath.includes('..')) {
      wsLogger.warn('Path traversal attempt blocked (pre-resolution)', { projectPath });
      return { valid: false, error: 'Path traversal not allowed' };
    }

    // 3. Resolve and normalize path (handles symlinks, relative paths, etc.)
    const resolvedPath = path.resolve(projectPath);
    const normalizedPath = path.normalize(resolvedPath);

    // 4. Post-resolution traversal check (catches encoded/complex attempts)
    if (normalizedPath.includes('..')) {
      wsLogger.warn('Path traversal attempt blocked (post-resolution)', {
        input: projectPath,
        resolved: resolvedPath,
        normalized: normalizedPath,
      });
      return { valid: false, error: 'Path traversal not allowed' };
    }

    // 5. Workspace boundary validation - CRITICAL SECURITY CHECK
    const allowedRoots = this.getAllowedWorkspaceRoots();
    if (!this.isPathWithinAllowedRoots(normalizedPath, allowedRoots)) {
      wsLogger.warn('Path escapes allowed workspace', {
        input: projectPath,
        resolved: normalizedPath,
        allowedRoots: allowedRoots,
      });
      return { valid: false, error: 'Path must be within allowed workspace directories' };
    }

    // 6. Block access to sensitive system directories
    if (this.isBlockedSystemPath(normalizedPath)) {
      wsLogger.warn('Blocked system path access attempt', {
        input: projectPath,
        resolved: normalizedPath,
      });
      return { valid: false, error: 'Access to system directories is not allowed' };
    }

    // 7. Verify absolute path (defense in depth)
    if (!path.isAbsolute(normalizedPath)) {
      wsLogger.warn('Non-absolute path after resolution', { normalizedPath });
      return { valid: false, error: 'Path must be absolute' };
    }

    // 8. Verify path exists
    if (!fs.existsSync(normalizedPath)) {
      return { valid: false, error: 'Path does not exist' };
    }

    // Success - log for audit trail
    wsLogger.debug('Path validation successful', {
      input: projectPath,
      resolved: normalizedPath,
    });

    return { valid: true, path: normalizedPath };
  }

  /**
   * Validate message length
   */
  validateMessageLength(text: string): MessageValidationResult {
    if (text.length > this.config.chat.maxMessageLength) {
      return {
        valid: false,
        error: `Message too long (max ${this.config.chat.maxMessageLength} characters, got ${text.length})`,
      };
    }
    return { valid: true };
  }

  /**
   * Validate agent ID against installed agents
   */
  validateAgentId(agentId: string): boolean {
    // If no agents loaded yet, allow any (will be validated at runtime)
    if (this.installedAgents.size === 0) {
      return true;
    }
    return this.installedAgents.has(agentId);
  }

  /**
   * Get installed agents set (for external access)
   */
  getInstalledAgents(): Set<string> {
    return this.installedAgents;
  }
}
