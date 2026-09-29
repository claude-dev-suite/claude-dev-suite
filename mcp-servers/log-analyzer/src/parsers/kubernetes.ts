// SPDX-License-Identifier: MIT
/**
 * Kubernetes component logs: klog text (`I1210 10:30:45.123456  12345 file.go:123] msg`)
 * and structured JSON (`{"ts":..., "msg":..., "v":0}`).
 *
 * Container logs written by the runtime (docker json-file, CRI) are envelopes
 * handled in `envelopes.ts`; with `format: "kubernetes"` the pipeline unwraps
 * them and auto-detects the application format inside.
 */

import { BaseParser } from './base.js';
import { JsonParser } from './json.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';
import { parseYearless } from '../core/timestamp.js';
import { parseLogfmt } from '../core/logfmt.js';

const KLOG_LEVEL: Record<string, LogLevel> = { I: 'INFO', W: 'WARN', E: 'ERROR', F: 'FATAL' };

export class KubernetesParser extends BaseParser {
  readonly format: LogFormat = 'kubernetes';
  private readonly klog = /^([IWEF])(\d{2})(\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+([^:\]]+):(\d+)\]\s?(.*)$/;
  private readonly json = new JsonParser('kubernetes');

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = line.match(this.klog);
    if (m) {
      const [, lvl, mm, dd, hms, pid, file, fileLine, message] = m;
      const ts = parseYearless(parseInt(mm, 10) - 1, parseInt(dd, 10), hms);
      // klog structured: msg="..." key="value"
      const structured = message.match(/^"((?:[^"\\]|\\.)*)"(.*)$/);
      return {
        timestamp: ts,
        level: KLOG_LEVEL[lvl],
        message: structured ? structured[1].replace(/\\"/g, '"') : message,
        logger: file,
        line: parseInt(fileLine, 10),
        metadata: {
          ...(structured ? parseLogfmt(structured[2].trim()).pairs : {}),
          pid: parseInt(pid, 10),
          timestampYearInferred: true,
        },
        raw: line,
        lineNumber,
      };
    }
    return this.json.parseLine(line, lineNumber);
  }
}
