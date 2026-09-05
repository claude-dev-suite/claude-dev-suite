/**
 * Golden-file tests for the Gemini settings writer.
 *
 * Gemini uniquely needs `context.fileName` set to read AGENTS.md, and keeps MCP
 * config in the same JSON file — both are silent-failure surfaces (a missing
 * context entry means Gemini never reads the shared instructions).
 *
 * Format claims are sourced from docs/ASSISTANT-FORMAT-REFERENCE.md section 3.5.
 */

import { describe, it, expect } from 'vitest';
import { writeGeminiSettings } from '../../../src/services/targets/writers/gemini-settings.writer.js';
import { McpConfigParseError } from '../../../src/services/targets/writers/mcp-config.writer.js';
import type { McpServerEntry } from '../../../src/services/targets/target-adapter.js';

const SERVERS: Record<string, McpServerEntry> = {
  documentation: { command: 'node', args: ['/abs/dist/index.js'], env: { KB: '1' } },
};

describe('writeGeminiSettings', () => {
  it('sets mcpServers (no type field) and an AGENTS.md-aware context on a fresh file', () => {
    const parsed = JSON.parse(writeGeminiSettings(SERVERS));

    expect(parsed.mcpServers.documentation).toEqual({
      command: 'node',
      args: ['/abs/dist/index.js'],
      env: { KB: '1' },
    });
    // No `type` field — Gemini's stdio entry is command/args/env.
    expect(parsed.mcpServers.documentation).not.toHaveProperty('type');
    // Must read AGENTS.md; GEMINI.md kept explicitly since setting it replaces the default.
    expect(parsed.context.fileName).toEqual(['AGENTS.md', 'GEMINI.md']);
  });

  it('preserves unrelated settings and the user\'s own context files', () => {
    const existing = JSON.stringify({
      theme: 'dark',
      context: { fileName: 'NOTES.md' },
      mcpServers: { 'user-own': { command: 'python', args: ['s.py'] } },
    });

    const parsed = JSON.parse(writeGeminiSettings(SERVERS, { existing }));

    expect(parsed.theme).toBe('dark');
    // Existing string context is upgraded to an array, keeping the user's file first.
    expect(parsed.context.fileName).toEqual(['NOTES.md', 'AGENTS.md', 'GEMINI.md']);
    expect(parsed.mcpServers['user-own']).toEqual({ command: 'python', args: ['s.py'] });
    expect(parsed.mcpServers.documentation).toBeDefined();
  });

  it('does not duplicate AGENTS.md when it is already present', () => {
    const existing = JSON.stringify({ context: { fileName: ['AGENTS.md'] } });
    const parsed = JSON.parse(writeGeminiSettings(SERVERS, { existing }));
    expect(parsed.context.fileName).toEqual(['AGENTS.md', 'GEMINI.md']);
  });

  it('drops a previously-managed server that is no longer installed', () => {
    const existing = JSON.stringify({
      mcpServers: {
        documentation: { command: 'node', args: ['old'] },
        'api-tester': { command: 'node', args: ['stale'] },
        'user-own': { command: 'python', args: ['s.py'] },
      },
    });

    const parsed = JSON.parse(
      writeGeminiSettings(SERVERS, { existing, previouslyManaged: ['documentation', 'api-tester'] })
    );

    expect(parsed.mcpServers['api-tester']).toBeUndefined();
    expect(parsed.mcpServers['user-own']).toBeDefined();
    expect(parsed.mcpServers.documentation.args).toEqual(['/abs/dist/index.js']);
  });

  it('refuses to discard an unparseable settings file', () => {
    expect(() => writeGeminiSettings(SERVERS, { existing: '{ broken', file: '.gemini/settings.json' }))
      .toThrow(McpConfigParseError);
  });
});

/**
 * Portability. `$VAR` expansion is confirmed inside `env` but not in `args`, so
 * this surface can hide the credential but cannot express the project root —
 * the path is left relative rather than absolute, which a clone can resolve.
 */
describe('writeGeminiSettings — portable output', () => {
  const PORTABLE: Record<string, McpServerEntry> = {
    'database-query': {
      command: 'node',
      args: ['/abs/project/.mcp-servers/database-query/dist/index.js'],
      env: { DATABASE_URL: 'postgres://u:pw@h/db', DB_POOL_SIZE: '5' },
      entryRelPath: '.mcp-servers/database-query/dist/index.js',
      secretEnvNames: ['DATABASE_URL'],
    },
  };

  it('references the secret with $VAR and keeps the path project-relative', () => {
    const out = writeGeminiSettings(PORTABLE);
    const entry = JSON.parse(out).mcpServers['database-query'];

    expect(entry.args).toEqual(['.mcp-servers/database-query/dist/index.js']);
    expect(entry.env).toEqual({ DATABASE_URL: '$DATABASE_URL', DB_POOL_SIZE: '5' });
    expect(out).not.toContain('postgres://');
  });
});
