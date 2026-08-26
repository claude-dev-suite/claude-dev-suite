// SPDX-License-Identifier: MIT
/**
 * `removeMcpServer` could delete the entire project directory.
 *
 * Found by narrowing `js/path-injection` with a barrier model (3253244): once
 * ~130 false positives stopped burying the signal, four alerts remained and this
 * was one of them.
 *
 * The chain:
 *
 *   1. `serverName` is checked against `/^[a-zA-Z0-9_.-]+$/`, which **admits
 *      `..`** — the class is a character set, and `.` is in it.
 *   2. `mcpServerDir('..')` builds `path.join(projectPath, '.mcp-servers', '..')`,
 *      and `path.join` resolves `..` rather than rejecting it → `projectPath`.
 *   3. `fs.existsSync(projectPath)` is of course true.
 *   4. `fs.rmSync(serverDir, { recursive: true, force: true })`.
 *
 * The Tier 0 audit fixed exactly this class for `agentId` and `skillId`, but
 * `serverName` is guarded by a different, weaker regex that was not touched.
 * `addAgent`/`removeAgent` share that regex and are not exposed the same way:
 * `agentFile()` appends `.md`, so `'..'` becomes the filename `...md` rather
 * than a directory reference — which is luck, not design, and is pinned below.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';
import { ManagementService } from '../src/services/management.service.js';

describe('MCP server name cannot escape .mcp-servers/', () => {
  let mgmt: ManagementService;
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir('mcp-name-');
    createMockProject(projectDir, { packageJson: { name: 'p' } });
    // Something worth losing, so a regression is unmistakable.
    fs.writeFileSync(path.join(projectDir, 'IMPORTANT.txt'), 'the user\'s work');
    fs.mkdirSync(path.join(projectDir, '.mcp-servers'), { recursive: true });
    mgmt = new ManagementService();
  });

  afterEach(() => cleanupTempDir(projectDir));

  it.each(['..', '.'])('removeMcpServer refuses %j and deletes nothing', async (name) => {
    await expect(mgmt.removeMcpServer(projectDir, name)).rejects.toThrow(/invalid server name/i);

    // The project — and the file that stands in for the user's work — survives.
    expect(fs.existsSync(projectDir)).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'IMPORTANT.txt'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.mcp-servers'))).toBe(true);
  });

  it.each(['..', '.', 'a/b', 'a\\b', ''])(
    'addMcpServer refuses %j',
    async (name) => {
      await expect(mgmt.addMcpServer(projectDir, name, {})).rejects.toThrow();
    }
  );

  it('still accepts a real server name', async () => {
    // Rejected for a reason about the catalog, not about the name itself.
    await expect(mgmt.removeMcpServer(projectDir, 'documentation')).rejects.toThrow(
      /not found/i
    );
    expect(fs.existsSync(path.join(projectDir, 'IMPORTANT.txt'))).toBe(true);
  });

  it('accepts the hyphenated names the catalog actually ships', async () => {
    for (const name of ['api-tester', 'code-quality', 'skill-loader']) {
      await expect(mgmt.removeMcpServer(projectDir, name)).rejects.toThrow(/not found/i);
    }
  });

  it('agent ids with .. resolve to a filename, not a parent directory', async () => {
    // Pinning the luck: `agentFile()` appends `.md`, so `..` cannot traverse
    // here even though it passes the same weak regex. If the extension ever
    // stops being appended, this test is the tripwire.
    await expect(mgmt.removeAgent(projectDir, '..')).rejects.toThrow();
    expect(fs.existsSync(path.join(projectDir, 'IMPORTANT.txt'))).toBe(true);
  });
});
