// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { isAbsolute } from 'path';
import { loadRegistry, parseNetworkUrl, parseSqliteUrl, redactText, redactUrl } from '../src/config.js';
import { pgPoolConfig } from '../src/drivers/postgres.js';
import { mysqlPoolConfig } from '../src/drivers/mysql.js';

describe('parseNetworkUrl', () => {
  it('percent-decodes the password (was passed through encoded)', () => {
    const t = parseNetworkUrl('postgres://app:p%40ss%3Aw0rd%2F@db.example.com:6543/shop', 'postgres');
    expect(t.password).toBe('p@ss:w0rd/');
    expect(t.user).toBe('app');
    expect(t.port).toBe(6543);
    expect(t.database).toBe('shop');
  });

  it('keeps sslmode (was dropped) with libpq semantics', () => {
    expect(parseNetworkUrl('postgres://u@h/d?sslmode=require', 'postgres').ssl.mode).toBe('require');
    expect(parseNetworkUrl('postgres://u@h/d?sslmode=verify-full', 'postgres').ssl.mode).toBe('verify-full');
    expect(parseNetworkUrl('postgres://u@h/d?sslmode=disable', 'postgres').ssl.mode).toBe('disable');
    const prefer = parseNetworkUrl('postgres://u@h/d?sslmode=prefer', 'postgres');
    expect(prefer.ssl.mode).toBe('disable');
    expect(prefer.notes.join(' ')).toMatch(/prefer/);
  });

  it('maps MySQL ssl-mode names', () => {
    expect(parseNetworkUrl('mysql://u@h/d?ssl-mode=REQUIRED', 'mysql').ssl.mode).toBe('require');
    expect(parseNetworkUrl('mysql://u@h/d?ssl-mode=VERIFY_IDENTITY', 'mysql').ssl.mode).toBe('verify-full');
  });

  it('reports parameters it does not apply instead of silently dropping them', () => {
    const t = parseNetworkUrl('postgres://u@h/d?application_name=x&frobnicate=1', 'postgres');
    expect(t.options.application_name).toBe('x');
    expect(t.ignoredParams).toEqual(['frobnicate']);
  });

  it('fails clearly when an SSL certificate file is missing', () => {
    expect(() => parseNetworkUrl('postgres://u@h/d?sslmode=verify-ca&sslrootcert=/nope/ca.pem', 'postgres')).toThrow(/root certificate/);
  });
});

describe('driver configs honour SSL', () => {
  const reg = (url: string) => loadRegistry({ DATABASE_URL: url }).connections.get('default')!;
  it('pg: require encrypts without verifying, verify-full verifies', () => {
    expect(pgPoolConfig(reg('postgres://u:p@h/d?sslmode=require')).ssl).toEqual({ rejectUnauthorized: false });
    expect(pgPoolConfig(reg('postgres://u:p@h/d?sslmode=verify-full')).ssl).toMatchObject({ rejectUnauthorized: true });
    expect(pgPoolConfig(reg('postgres://u:p@h/d')).ssl).toBe(false);
  });
  it('pg: gets the DECODED password', () => {
    expect(pgPoolConfig(reg('postgres://u:a%25b@h/d')).password).toBe('a%b');
  });
  it('mysql: multipleStatements stays off', () => {
    expect(mysqlPoolConfig(reg('mysql://u:p@h/d')).multipleStatements).toBe(false);
  });
});

describe('parseSqliteUrl', () => {
  it('accepts the common spellings', () => {
    expect(parseSqliteUrl('sqlite::memory:').memory).toBe(true);
    expect(isAbsolute(parseSqliteUrl('sqlite:./dev.db').file)).toBe(true);
    expect(isAbsolute(parseSqliteUrl('file:dev.db').file)).toBe(true);
    if (process.platform === 'win32') {
      expect(parseSqliteUrl('sqlite:///C:/data/app.db').file).toBe('C:/data/app.db');
    }
    expect(parseSqliteUrl('sqlite:///srv/app.db?mode=ro').file.replace(/\\/g, '/')).toMatch(/\/srv\/app\.db$/);
  });
});

describe('loadRegistry', () => {
  it('DATABASE_URL is read-only unless DATABASE_ALLOW_WRITES=true', () => {
    expect(loadRegistry({ DATABASE_URL: 'postgres://u@h/d' }).connections.get('default')!.readOnly).toBe(true);
    expect(
      loadRegistry({ DATABASE_URL: 'postgres://u@h/d', DATABASE_ALLOW_WRITES: 'true' }).connections.get('default')!.readOnly
    ).toBe(false);
  });

  it('parses DATABASE_URLS with per-connection readOnly (default true)', () => {
    const r = loadRegistry({
      DATABASE_URLS: JSON.stringify({ a: 'mysql://u@h/d', b: { url: 'sqlite::memory:', readOnly: false } }),
    });
    expect(r.errors).toEqual([]);
    expect(r.connections.get('a')!.engine).toBe('mysql');
    expect(r.connections.get('a')!.readOnly).toBe(true);
    expect(r.connections.get('b')!.readOnly).toBe(false);
    expect(r.defaultName).toBeNull(); // two connections, none called default
  });

  it('collects configuration errors instead of throwing, without leaking passwords', () => {
    const r = loadRegistry({ DATABASE_URLS: '{not json', DATABASE_URL: 'mongodb://u:hunter2@h/d' });
    expect(r.errors.join(' ')).toMatch(/not valid JSON/);
    expect(r.errors.join(' ')).toMatch(/MongoDB is not supported/);
    expect(r.errors.join(' ')).not.toContain('hunter2');
  });

  it('single connection becomes the default', () => {
    expect(loadRegistry({ DATABASE_URLS: '{"only":"postgres://h/d"}' }).defaultName).toBe('only');
  });
});

describe('redaction', () => {
  it('redacts URL passwords and password params', () => {
    const r = redactUrl('postgres://u:secret@h/d?password=other');
    expect(r).not.toContain('secret');
    expect(r).not.toContain('other');
  });
  it('redacts known secrets from free text', () => {
    expect(redactText('failed for mysql://u:pw123@h and pw123', ['pw123'])).not.toContain('pw123');
  });
});
