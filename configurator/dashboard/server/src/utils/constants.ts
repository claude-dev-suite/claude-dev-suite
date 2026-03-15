// SPDX-License-Identifier: MIT
/**
 * Constants and configuration for dev-suite dashboard server
 */

import path from 'node:path';

// ============================================
// DETECTION CONFIDENCE SCORES
// ============================================

export const CONFIDENCE = {
  MAJOR_FRAMEWORK: 20,      // React, Vue, Angular, Spring Boot
  META_FRAMEWORK: 15,       // Next.js, Nuxt, Remix
  DATABASE: 10,             // Database detection
  FULL_STACK: 25,           // Fullstack monorepo detection
  MAX: 100                  // Maximum confidence cap
} as const;

// ============================================
// TIMEOUTS (milliseconds)
// ============================================

export const TIMEOUTS = {
  IO_DEFAULT: 5000,         // Default I/O timeout
  GIT_FETCH: 30000,         // Git fetch operations
  GIT_PULL: 60000,          // Git pull operations
  NPM_INSTALL: 120000,      // npm install timeout
  COMMAND_DEFAULT: 60000    // Default command timeout
} as const;

// ============================================
// MIME TYPES
// ============================================

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ============================================
// PATHS
// ============================================

export const DEV_SUITE_DIR = process.env.DEV_SUITE_PATH ||
  path.resolve(import.meta.dirname, '../../../../..');

export const PORT = parseInt(process.env.PORT || '3456', 10);

export const ORCHESTRATOR_PORT = parseInt(process.env.ORCHESTRATOR_WS_PORT || '3457', 10);

/**
 * Get the project path from CLI args or environment
 */
export function getProjectPath(): string {
  return process.argv[2] || process.env.DEV_SUITE_PROJECT_PATH || path.dirname(DEV_SUITE_DIR);
}

// ============================================
// EXCLUDED DIRECTORIES
// ============================================

export const EXCLUDED_DIRS: readonly string[] = Object.freeze([
  'node_modules',
  'dist',
  'build',
  'target',
  '.git',
  '__pycache__',
  '.mcp-servers',
  'dev-suite'
]);

// ============================================
// FILE PATTERNS
// ============================================

export const ENV_FILE_PATTERNS: readonly { pattern: string; env: string }[] = Object.freeze([
  { pattern: '.env', env: 'default' },
  { pattern: '.env.dev', env: 'dev' },
  { pattern: '.env.development', env: 'dev' },
  { pattern: '.env.test', env: 'test' },
  { pattern: '.env.staging', env: 'staging' },
  { pattern: '.env.prod', env: 'prod' },
  { pattern: '.env.production', env: 'prod' },
  { pattern: '.env.local', env: 'local' },
]);

// ============================================
// CACHE SETTINGS
// ============================================

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// ANALYTICS
// ============================================

export const ANALYTICS_DIR = '.dev-suite-analytics';
export const KB_USAGE_FILE = 'kb-usage.json';

// ============================================
// RATE LIMITING
// ============================================

export const WS_RATE_LIMIT = {
  MAX_MESSAGES: parseInt(process.env.WS_RATE_LIMIT_MAX_MESSAGES || '60', 10),
  WINDOW_MS: parseInt(process.env.WS_RATE_LIMIT_WINDOW_MS || '60000', 10),
  BLOCK_DURATION_MS: parseInt(process.env.WS_RATE_LIMIT_BLOCK_DURATION_MS || '30000', 10),
} as const;
