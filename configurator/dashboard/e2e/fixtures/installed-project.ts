// SPDX-License-Identifier: MIT
/**
 * Shared fixture for tests that require a pre-installed dev-suite project.
 *
 * Extracts the duplicated `createInstalledTestProject()` pattern from
 * job-submission.spec.ts, manage-panel.spec.ts, and code-review-panel.spec.ts.
 */

import { test as base } from './electron-app.fixture';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

export { expect } from '@playwright/test';

export interface InstalledProjectOpts {
  /** Project name used in package.json (default: 'e2e-installed-project') */
  projectName?: string;
  /** Temp dir prefix (default: 'devsuite-e2e-inst-') */
  tmpPrefix?: string;
  /** Agents to install (default: ['react-expert']) */
  agents?: string[];
  /** Extra dependencies for package.json */
  extraDependencies?: Record<string, string>;
}

/**
 * Create a temp directory that looks like a fully installed dev-suite project.
 * The dashboard will skip the wizard and go straight to the orchestrator.
 */
export function createInstalledTestProject(opts?: InstalledProjectOpts): string {
  const {
    projectName = 'e2e-installed-project',
    tmpPrefix = 'devsuite-e2e-inst-',
    agents = ['react-expert'],
    extraDependencies = {},
  } = opts ?? {};

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));

  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: projectName,
        version: '1.0.0',
        dependencies: { react: '^19.0.0', ...extraDependencies },
      },
      null,
      2,
    ),
  );

  // .dev-suite.json — marks the project as installed
  fs.writeFileSync(
    path.join(dir, '.dev-suite.json'),
    JSON.stringify(
      {
        version: '1.1.0',
        agents: { enabled: agents },
        mcpServers: { enabled: [] },
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // Actual agent files on disk (the server checks filesystem)
  fs.mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
  for (const agent of agents) {
    fs.writeFileSync(
      path.join(dir, '.claude', 'agents', `${agent}.md`),
      `---\nname: ${agent}\ndescription: ${agent} specialist\n---\n${agent} agent.\n`,
    );
  }

  // Minimal project files
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\nDev-suite configured.\n');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'console.log("hello");\n');
  fs.writeFileSync(
    path.join(dir, 'src', 'App.tsx'),
    'export default function App() { return <div>Hello</div>; }\n',
  );

  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init with dev-suite"', { cwd: dir, stdio: 'pipe' });

  return dir;
}

/**
 * Returns a Playwright test instance with `testProjectDir` overridden
 * to point at an installed project. Cleans up after each test.
 */
export function createInstalledTest(opts?: InstalledProjectOpts) {
  return base.extend({
    testProjectDir: async ({}, use) => {
      const dir = createInstalledTestProject(opts);
      await use(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  });
}
