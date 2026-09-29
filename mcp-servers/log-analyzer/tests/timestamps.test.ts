// SPDX-License-Identifier: MIT
/**
 * Audit: an unparseable timestamp became `new Date()` (base.ts), and Python's
 * basicConfig format always did (python.ts). Such entries silently passed or
 * failed time filters. They must be `null`, excluded from time filters, and
 * counted as excluded.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { parseTimestamp, parseTimeBound, fromEpoch } from '../src/core/timestamp.js';
import { entriesOf, call } from './helpers.js';
import { writeFixtures } from './fixtures.js';

describe('parseTimestamp', () => {
  it('returns null instead of "now" for garbage', () => {
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('99:99:99')).toBeNull();
  });

  it('reads common notations', () => {
    expect(parseTimestamp('2024-12-13T10:30:45.123456789Z')?.toISOString()).toBe('2024-12-13T10:30:45.123Z');
    expect(parseTimestamp('2024-12-13 10:30:45,123+0100')?.toISOString()).toBe('2024-12-13T09:30:45.123Z');
    expect(parseTimestamp('13/Dec/2024:10:30:45 -0700')?.toISOString()).toBe('2024-12-13T17:30:45.000Z');
    expect(parseTimestamp('Fri Dec 13 10:30:45.123456 2024')).not.toBeNull();
    expect(parseTimestamp('2024/12/13 10:30:45')).not.toBeNull();
  });

  it('reads epoch seconds, millis, micros and nanos', () => {
    const iso = '2023-12-13T10:30:45.000Z';
    expect(fromEpoch(1702463445)?.toISOString()).toBe(iso);
    expect(fromEpoch(1702463445000)?.toISOString()).toBe(iso);
    expect(fromEpoch(1702463445000000)?.toISOString()).toBe(iso);
    expect(fromEpoch(1702463445000000000)?.toISOString()).toBe(iso);
  });

  it('parses relative bounds and rejects invalid ones', () => {
    const now = Date.parse('2024-12-13T12:00:00Z');
    expect(parseTimeBound('15m', now)?.toISOString()).toBe('2024-12-13T11:45:00.000Z');
    expect(() => parseTimeBound('yesterday-ish')).toThrow(/Invalid time/);
  });
});

describe('entries without a timestamp', () => {
  it('Python basicConfig lines have timestamp null (was "now")', async () => {
    const { entries } = await entriesOf('WARNING:root:disk almost full\nERROR:app.db:connection lost\n');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.timestamp === null)).toBe(true);
    expect(entries[1].level).toBe('ERROR');
    expect(entries[1].logger).toBe('app.db');
  });

  it('are excluded from time filters and counted', async () => {
    const dir = writeFixtures({
      'mixed.log': [
        '2024-12-13 10:00:00,000 - app - INFO - in range',
        'WARNING:root:no timestamp here',
        '2024-12-13 12:00:00,000 - app - INFO - out of range',
      ].join('\n') + '\n',
    });
    const r = await call('parse_logs', {
      filePath: join(dir, 'mixed.log'), format: 'python',
      startTime: '2024-12-13T00:00:00', endTime: '2024-12-13T11:00:00',
    });
    expect(r.matchedEntries).toBe(1);
    expect(r.entries[0].message).toBe('in range');
    expect(r.scan.excludedNoTimestamp).toBe(1);
    expect(r.scan.note).toMatch(/no parseable timestamp/);
  });

  it('take the envelope time when the payload has none (docker json-file)', async () => {
    const line = JSON.stringify({ log: 'plain message without time\n', stream: 'stdout', time: '2024-12-13T10:30:45.5Z' });
    const { entries } = await entriesOf(line + '\n');
    expect(entries[0].timestamp?.toISOString()).toBe('2024-12-13T10:30:45.500Z');
    expect(entries[0].metadata?.timestampSource).toBe('envelope');
  });
});
