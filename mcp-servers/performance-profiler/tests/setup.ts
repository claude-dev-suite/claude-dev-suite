// SPDX-License-Identifier: MIT
// Keep run records and artifacts written by tests out of the package directory.
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

if (!process.env.PERF_PROFILER_OUTPUT_DIR) {
  process.env.PERF_PROFILER_OUTPUT_DIR = mkdtempSync(join(tmpdir(), 'pp-test-out-'));
}
