/**
 * Tests for the multi-target plumbing added in slice 2.3.
 *
 * Two of these lock defects that are latent today — only Claude Code has a
 * write path, so a Copilot-tagged manifest can't be produced in production yet.
 * They matter because reinstall must already be correct for the moment it can:
 *  - `managedSurfaces` must back up Copilot's `.vscode/mcp.json`, which lives
 *    outside its config dir and would otherwise be silently missed on rollback.
 *  - the install request must reject targets whose adapter hasn't landed.
 */

import { describe, it, expect } from 'vitest';
import { managedSurfaces } from '../../src/services/reinstall.service.js';
import { InstallRequestSchema } from '../../src/validation/schemas.js';

describe('managedSurfaces', () => {
  it('is unchanged for a Claude-only manifest', () => {
    const { dirs, files } = managedSurfaces(['claude-code']);

    expect(dirs).toEqual(['.claude']);
    // The set that reinstall backs up outside the .claude tree.
    expect(files.sort()).toEqual(
      ['.dev-suite-manifest.json', '.dev-suite.json', '.mcp.json', 'AGENTS.md', 'CLAUDE.md'].sort()
    );
    // .claude/settings.json is inside the .claude tree, so it is NOT listed as
    // a standalone file — the tree copy covers it.
    expect(files).not.toContain('.claude/settings.json');
  });

  it('backs up Copilot config that lives outside its config dir', () => {
    const { dirs, files } = managedSurfaces(['copilot']);

    // Copilot's config dir is .github, but its VS Code MCP file is under .vscode.
    expect(dirs).toContain('.github');
    expect(files).toContain('.vscode/mcp.json');
    // This is the whole point: copying the .github tree would miss it.
    expect(dirs).not.toContain('.vscode');
  });

  it('keeps Cursor MCP inside the tree copy', () => {
    const { dirs, files } = managedSurfaces(['cursor']);
    // .cursor/mcp.json is under .cursor, so the tree copy covers it.
    expect(dirs).toContain('.cursor');
    expect(files).not.toContain('.cursor/mcp.json');
  });

  it('unions surfaces across multiple targets', () => {
    const { dirs, files } = managedSurfaces(['claude-code', 'copilot', 'cursor']);
    expect(dirs.sort()).toEqual(['.claude', '.cursor', '.github'].sort());
    expect(files).toContain('.mcp.json'); // claude
    expect(files).toContain('.vscode/mcp.json'); // copilot
    expect(files).toContain('AGENTS.md'); // shared, listed once
    expect(files.filter(f => f === 'AGENTS.md')).toHaveLength(1);
  });

  it('treats an empty target list as Claude Code', () => {
    expect(managedSurfaces([]).dirs).toEqual(['.claude']);
  });

  it('skips an unknown/future target rather than throwing', () => {
    // A manifest written by a newer dev-suite might name a target this build
    // doesn't know. Backup should degrade, not crash.
    expect(() => managedSurfaces(['codex' as never])).not.toThrow();
  });
});

describe('InstallRequestSchema targets', () => {
  const base = { projectPath: '/tmp/p' };

  it('accepts an omitted targets field', () => {
    const parsed = InstallRequestSchema.parse(base);
    expect(parsed.targets).toBeUndefined();
  });

  it('accepts the implemented target', () => {
    expect(() => InstallRequestSchema.parse({ ...base, targets: ['claude-code'] })).not.toThrow();
  });

  it('rejects a target whose adapter has not landed', () => {
    // Copilot has a descriptor but no adapter yet — the API must not promise
    // output it cannot produce.
    const result = InstallRequestSchema.safeParse({ ...base, targets: ['copilot'] });
    expect(result.success).toBe(false);
  });

  it('rejects a garbage target', () => {
    expect(InstallRequestSchema.safeParse({ ...base, targets: ['not-a-tool'] }).success).toBe(false);
  });

  it('accepts the previously-missing rules and skillLoadingMode fields', () => {
    const parsed = InstallRequestSchema.parse({
      ...base,
      rules: ['security'],
      skillLoadingMode: 'lazy',
    });
    expect(parsed.rules).toEqual(['security']);
    expect(parsed.skillLoadingMode).toBe('lazy');
  });
});
