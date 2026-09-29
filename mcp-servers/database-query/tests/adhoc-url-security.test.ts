// SPDX-License-Identifier: MIT
/**
 * Ad-hoc URLs passed as tool arguments are untrusted (the model chose the
 * host); operator-configured connections are trusted. Ports the old
 * db-url-security suite onto the shared SSRF guard.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { openAdhoc } from '../src/drivers/index.js';
import { callTool } from '../src/handlers/dispatch.js';
import { installFakes, parse, resetFakes } from './helpers.js';

afterEach(resetFakes);

describe('openAdhoc', () => {
  it.each([
    'postgresql://u:p@169.254.169.254/db',
    'postgresql://u:p@10.0.0.1/db',
    'postgresql://u:p@172.16.0.1/db',
    'postgresql://u:p@192.168.1.1/db',
    'postgresql://u:p@[fc00::1]/db',
    'postgresql://u:p@[fe80::1]/db',
    'postgresql://u:p@[::ffff:10.0.0.1]/db',
    'mysql://u:p@2852039166/db', // decimal-encoded 169.254.169.254
  ])('blocks %s by default', async (url) => {
    await expect(openAdhoc(url)).rejects.toThrow(/SSRF protection/);
  });

  it('DB_ALLOW_PRIVATE_ADHOC_URLS opens private ranges but never cloud metadata', async () => {
    process.env.DB_ALLOW_PRIVATE_ADHOC_URLS = 'true';
    const d = await openAdhoc('postgresql://u:p@10.0.0.1/db');
    expect(d.config.readOnly).toBe(true);
    await d.close();
    await expect(openAdhoc('postgresql://u:p@169.254.169.254/db')).rejects.toThrow(/SSRF protection/);
  });

  it('allows explicit localhost (shared policy) and forces read-only', async () => {
    const d = await openAdhoc('mysql://u:p@localhost:3306/db');
    expect(d.engine).toBe('mysql');
    expect(d.config.readOnly).toBe(true);
    await d.close();
  });

  it('refuses SQLite paths and unsupported schemes', async () => {
    await expect(openAdhoc('sqlite:///etc/passwd')).rejects.toThrow(/not accepted as tool arguments/);
    await expect(openAdhoc('http://example.com/db')).rejects.toThrow(/Unsupported connection URL scheme/);
    await expect(openAdhoc('mongodb://h/db')).rejects.toThrow(/MongoDB is not supported/);
  });

  it('never echoes the password in errors', async () => {
    const secret = 's3cr3tP@$$w0rd!';
    let msg = '';
    try {
      await openAdhoc(`postgresql://admin:${encodeURIComponent(secret)}@10.0.0.1/prod`);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/SSRF/);
    expect(msg).not.toContain(secret);
    expect(msg).not.toContain(encodeURIComponent(secret));
  });
});

describe('compare_schemas / generate_migration argument handling', () => {
  it('guards the ad-hoc target before connecting anywhere', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u@h/d' });
    const r = await callTool('compare_schemas', { targetDatabaseUrl: 'postgresql://u:p@169.254.169.254/db' });
    expect(parse(r).error).toMatch(/SSRF protection/);
    expect(fakes.get('default')?.sessions.length ?? 0).toBe(0);
  });

  it('refuses to compare different engines', async () => {
    installFakes({ DATABASE_URLS: JSON.stringify({ default: 'postgres://h/a', other: 'mysql://h/b' }) });
    const r = await callTool('generate_migration', { targetConnection: 'other' });
    expect(parse(r).error).toMatch(/same engine/);
  });

  it('refuses to compare a schema with itself', async () => {
    installFakes({ DATABASE_URL: 'postgres://h/a' }, (sql) => (/current_schema/.test(sql) ? { rows: [{ s: 'public' }] } : { rows: [] }));
    const r = await callTool('compare_schemas', {});
    expect(parse(r).error).toMatch(/same schema/);
  });
});
