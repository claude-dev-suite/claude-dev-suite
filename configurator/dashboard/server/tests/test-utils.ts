/**
 * Test utilities for server tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Create a temporary directory for tests
 */
export function createTempDir(prefix: string): string {
  const tmpBase = os.tmpdir();
  const dirPath = path.join(tmpBase, `${prefix}${Date.now()}`);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors in tests
  }
}

/**
 * Options for creating a mock project
 */
export interface MockProjectOptions {
  packageJson?: Record<string, unknown>;
  hasGit?: boolean;
  files?: Record<string, string>;
}

/**
 * Create a mock project structure for testing
 */
export function createMockProject(
  dir: string,
  options: MockProjectOptions = {}
): void {
  const { packageJson, hasGit = false, files = {} } = options;

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write package.json if provided
  if (packageJson) {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  // Create .git directory if requested
  if (hasGit) {
    const gitDir = path.join(dir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    // Create minimal git structure
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(
      path.join(gitDir, 'config'),
      '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n'
    );
  }

  // Write additional files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    const dirName = path.dirname(fullPath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }
}

/**
 * Create a mock dev-suite directory for testing
 */
export function createMockDevSuiteDir(dir: string): void {
  // Create directory structure
  fs.mkdirSync(dir, { recursive: true });

  // Create agents directory with sample agents
  const agentsDir = path.join(dir, 'agents');
  fs.mkdirSync(path.join(agentsDir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(agentsDir, 'testing'), { recursive: true });

  // Sample typescript-expert agent
  fs.writeFileSync(
    path.join(agentsDir, 'core', 'typescript-expert.md'),
    `---
name: typescript-expert
description: TypeScript language expert
skills:
  - typescript
mcp_servers:
  - documentation
---

# TypeScript Expert

Expert in TypeScript patterns and best practices.
`
  );

  // Sample vitest-expert agent
  fs.writeFileSync(
    path.join(agentsDir, 'testing', 'vitest-expert.md'),
    `---
name: vitest-expert
description: Vitest testing expert
skills:
  - testing
mcp_servers:
  - documentation
---

# Vitest Expert

Expert in Vitest testing framework.
`
  );

  // Create mcp-servers directory with sample servers
  const mcpServersDir = path.join(dir, 'mcp-servers');
  fs.mkdirSync(mcpServersDir, { recursive: true });

  // Create package.json for workspaces
  fs.writeFileSync(
    path.join(mcpServersDir, 'package.json'),
    JSON.stringify(
      {
        name: '@dev-suite/mcp-servers',
        private: true,
        workspaces: ['documentation', 'api-tester'],
      },
      null,
      2
    )
  );

  // Create documentation server
  const docsDir = path.join(mcpServersDir, 'documentation');
  fs.mkdirSync(path.join(docsDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'package.json'),
    JSON.stringify(
      {
        name: '@dev-suite/documentation',
        version: '1.0.0',
        main: 'dist/index.js',
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(docsDir, 'metadata.json'),
    JSON.stringify(
      {
        name: 'documentation',
        description: 'Documentation fetcher',
        shortDescription: 'Fetch docs',
        category: 'knowledge',
        tools: ['fetch_docs'],
        envVars: [],
        recommendedFor: ['typescript-expert'],
        detectedWhen: [],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(docsDir, 'dist', 'index.js'),
    '#!/usr/bin/env node\nconsole.log("documentation server");'
  );

  // Create api-tester server
  const apiDir = path.join(mcpServersDir, 'api-tester');
  fs.mkdirSync(path.join(apiDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(apiDir, 'package.json'),
    JSON.stringify(
      {
        name: '@dev-suite/api-tester',
        version: '1.0.0',
        main: 'dist/index.js',
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(apiDir, 'metadata.json'),
    JSON.stringify(
      {
        name: 'api-tester',
        description: 'API testing tool',
        shortDescription: 'Test APIs',
        category: 'api',
        tools: ['http_request'],
        envVars: [],
        recommendedFor: [],
        detectedWhen: [],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(apiDir, 'dist', 'index.js'),
    '#!/usr/bin/env node\nconsole.log("api-tester server");'
  );

  // Create skills directory
  const skillsDir = path.join(dir, 'skills');
  fs.mkdirSync(path.join(skillsDir, 'typescript'), { recursive: true });
  fs.writeFileSync(
    path.join(skillsDir, 'typescript', 'SKILL.md'),
    `# TypeScript Skill

TypeScript fundamentals and patterns.
`
  );

  // Create registry directory
  const registryDir = path.join(dir, 'registry');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(
    path.join(registryDir, 'frameworks.json'),
    JSON.stringify(
      {
        frontend: [
          {
            id: 'react',
            name: 'React',
            detection: {
              packages: ['react'],
            },
          },
        ],
        backend: [],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(registryDir, 'detection.json'),
    JSON.stringify({ patterns: [] }, null, 2)
  );
}

/**
 * Claude hook event names
 */
const CLAUDE_HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop'];

/**
 * Create mock Claude settings file
 * If settings contain hook event keys (PreToolUse, PostToolUse, etc.), they are wrapped in a `hooks` property
 */
export function createMockClaudeSettings(
  dir: string,
  settings: Record<string, unknown> = {}
): void {
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Check if any top-level keys are hook event names
  const hookKeys = Object.keys(settings).filter(key => CLAUDE_HOOK_EVENTS.includes(key));

  let finalSettings: Record<string, unknown>;
  if (hookKeys.length > 0) {
    // Extract hook-related keys into a hooks property
    const hooks: Record<string, unknown> = {};
    const otherSettings: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(settings)) {
      if (CLAUDE_HOOK_EVENTS.includes(key)) {
        hooks[key] = value;
      } else {
        otherSettings[key] = value;
      }
    }

    finalSettings = { ...otherSettings, hooks };
  } else {
    finalSettings = settings;
  }

  fs.writeFileSync(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify(finalSettings, null, 2)
  );
}

/**
 * Create mock analytics data for testing
 */
export function createMockAnalyticsData(dir: string): void {
  const analyticsDir = path.join(dir, '.dev-suite-analytics');
  fs.mkdirSync(analyticsDir, { recursive: true });

  const now = new Date();
  // Create timestamps: very recent (within 5 seconds), recent (within hour), and older (2 hours ago)
  const veryRecentTime = new Date(now.getTime() - 5000); // 5 seconds ago (for job correlation tests)
  const recentTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 mins ago
  const olderTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

  const mockData = {
    version: '1.0.0',
    entries: [
      {
        id: '1',
        timestamp: veryRecentTime.toISOString(), // Very recent for job correlation
        technology: 'react',
        tool: 'fetch_docs',
        topic: 'hooks',
        success: true,
        durationMs: 150,
        source: 'kb',
      },
      {
        id: '2',
        timestamp: recentTime.toISOString(),
        technology: 'react',
        tool: 'fetch_docs',
        topic: 'components',
        success: true,
        durationMs: 200,
        source: 'kb',
      },
      {
        id: '3',
        timestamp: olderTime.toISOString(), // Older entry for date filtering tests
        technology: 'typescript',
        tool: 'search_docs',
        topic: 'generics',
        success: false,
        durationMs: 500,
        source: 'kb',
        error: 'Not found',
      },
    ],
  };

  fs.writeFileSync(
    path.join(analyticsDir, 'kb-usage.json'),
    JSON.stringify(mockData, null, 2)
  );
}
