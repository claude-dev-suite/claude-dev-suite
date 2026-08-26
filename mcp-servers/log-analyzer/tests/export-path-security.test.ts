// SPDX-License-Identifier: MIT
/**
 * 2026-08 audit, Tier 3 #27 — `export_report` is the only tool in this server
 * that creates a file, and its `outputPath` went unvalidated while the read
 * side (`filePath`) was checked.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import { validateExportPath, validateLogPath } from '../src/utils.js';

const ROOT = path.resolve('/srv/reports');

afterEach(() => {
  delete process.env.LOG_EXPORT_DIR;
});

describe('validateExportPath', () => {
  it('requires an absolute path, as validateLogPath does', () => {
    expect(() => validateExportPath('relative/report.html')).toThrow(/absolute/i);
  });

  it('canonicalises traversal rather than rejecting it — confinement is what stops escape', () => {
    // Worth pinning explicitly: `validateLogPath` normalises `..` away instead
    // of refusing it, so on its own it does NOT keep a path anywhere in
    // particular. Only LOG_EXPORT_DIR does that (next test).
    const traversing = `${ROOT}${path.sep}..${path.sep}passwd`;
    expect(() => validateExportPath(traversing)).not.toThrow();

    process.env.LOG_EXPORT_DIR = ROOT;
    expect(() => validateExportPath(traversing)).toThrow(/LOG_EXPORT_DIR/);
  });

  it('accepts an absolute path when no root is configured', () => {
    expect(() => validateExportPath(path.join(ROOT, 'report.html'))).not.toThrow();
  });

  it('confines the output to LOG_EXPORT_DIR when it is set', () => {
    process.env.LOG_EXPORT_DIR = ROOT;
    expect(() => validateExportPath(path.join(ROOT, 'report.html'))).not.toThrow();
    expect(() => validateExportPath(path.resolve('/etc/cron.d/evil'))).toThrow(
      /LOG_EXPORT_DIR/
    );
  });

  it('does not accept a sibling directory that merely shares the prefix', () => {
    process.env.LOG_EXPORT_DIR = ROOT;
    expect(() => validateExportPath(ROOT + '-evil/report.html')).toThrow(/LOG_EXPORT_DIR/);
  });

  it('leaves validateLogPath unchanged for reads', () => {
    expect(() => validateLogPath(path.resolve('/var/log/app.log'))).not.toThrow();
  });
});
