// SPDX-License-Identifier: MIT
/**
 * Parser Index
 * Exports all parsers and provides format auto-detection
 */

import { readFile } from 'fs/promises';
import { BaseParser, type ParseOptions, type ParseResult } from './base.js';
import { SpringBootParser, Log4j2Parser, LogbackParser } from './spring-boot.js';
import { WinstonParser, PinoParser, MorganParser, JsonLinesParser } from './nodejs.js';
import { PythonParser } from './python.js';
import { NginxCombinedParser, NginxAccessParser, NginxErrorParser } from './nginx.js';
import { ApacheCombinedParser, ApacheAccessParser, ApacheErrorParser } from './apache.js';
import { KubernetesParser, KubectlLogsParser } from './kubernetes.js';
import { SyslogCombinedParser, Rfc5424Parser, Rfc3164Parser, SystemdJournalParser } from './syslog.js';
import type { LogFormat } from '../types.js';

// Export all parsers
export { BaseParser, type ParseOptions, type ParseResult };
export { SpringBootParser, Log4j2Parser, LogbackParser };
export { WinstonParser, PinoParser, MorganParser, JsonLinesParser };
export { PythonParser };
export { NginxCombinedParser, NginxAccessParser, NginxErrorParser };
export { ApacheCombinedParser, ApacheAccessParser, ApacheErrorParser };
export { KubernetesParser, KubectlLogsParser };
export { SyslogCombinedParser, Rfc5424Parser, Rfc3164Parser, SystemdJournalParser };

/**
 * Get parser instance for a specific format
 */
export function getParser(format: LogFormat): BaseParser {
  switch (format) {
    case 'spring-boot':
      return new SpringBootParser();
    case 'log4j':
      return new Log4j2Parser();
    case 'logback':
      return new LogbackParser();
    case 'winston':
      return new WinstonParser();
    case 'pino':
      return new PinoParser();
    case 'morgan':
      return new MorganParser();
    case 'python':
      return new PythonParser();
    case 'json':
      return new JsonLinesParser();
    case 'clf':
      return new MorganParser(); // CLF is similar to Morgan common format
    case 'nginx':
      return new NginxCombinedParser();
    case 'apache':
      return new ApacheCombinedParser();
    case 'kubernetes':
      return new KubernetesParser();
    case 'syslog':
      return new SyslogCombinedParser();
    case 'auto':
      // Will be detected later
      return new JsonLinesParser();
    default:
      return new JsonLinesParser();
  }
}

/**
 * Auto-detect log format from file content
 */
export async function detectFormat(filePath: string): Promise<LogFormat> {
  // Read first 20 lines
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').slice(0, 20).filter((l) => l.trim());

  if (lines.length === 0) {
    return 'json';
  }

  // Score each format
  const scores: Record<LogFormat, number> = {
    'spring-boot': 0,
    'log4j': 0,
    'logback': 0,
    'winston': 0,
    'pino': 0,
    'morgan': 0,
    'python': 0,
    'json': 0,
    'clf': 0,
    'nginx': 0,
    'apache': 0,
    'kubernetes': 0,
    'syslog': 0,
    'auto': 0,
  };

  const parsers: Array<{ format: LogFormat; parser: BaseParser }> = [
    { format: 'spring-boot', parser: new SpringBootParser() },
    { format: 'log4j', parser: new Log4j2Parser() },
    { format: 'logback', parser: new LogbackParser() },
    { format: 'winston', parser: new WinstonParser() },
    { format: 'pino', parser: new PinoParser() },
    { format: 'morgan', parser: new MorganParser() },
    { format: 'python', parser: new PythonParser() },
    { format: 'json', parser: new JsonLinesParser() },
    { format: 'nginx', parser: new NginxCombinedParser() },
    { format: 'apache', parser: new ApacheCombinedParser() },
    { format: 'kubernetes', parser: new KubernetesParser() },
    { format: 'syslog', parser: new SyslogCombinedParser() },
  ];

  // Test each line with each parser
  for (const line of lines) {
    for (const { format, parser } of parsers) {
      const entry = parser.parseLine(line, 0);
      if (entry) {
        scores[format]++;
      }
    }
  }

  // Find best match
  let bestFormat: LogFormat = 'json';
  let bestScore = 0;

  for (const [format, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestFormat = format as LogFormat;
    }
  }

  // Additional heuristics
  const sampleLine = lines[0];

  // Spring Boot specific patterns
  if (sampleLine.includes(' --- [') && sampleLine.includes('] ')) {
    return 'spring-boot';
  }

  // Pino specific (has numeric level)
  if (sampleLine.startsWith('{') && /"level":\s*\d+/.test(sampleLine)) {
    return 'pino';
  }

  // JSON format detection (Winston vs generic JSON)
  if (sampleLine.startsWith('{')) {
    // Winston: has lowercase "level" values like "info", "error", "warn", "debug"
    if (/"level":\s*"(info|error|warn|debug|verbose|silly)"/.test(sampleLine)) {
      return 'winston';
    }
    // Generic JSON: has uppercase levels or other structures
    if (/"level":\s*"(INFO|ERROR|WARN|DEBUG|TRACE|FATAL)"/.test(sampleLine)) {
      return 'json';
    }
    // Default to winston for JSON with string level
    if (/"level":\s*"/.test(sampleLine)) {
      return 'winston';
    }
  }

  // Python (comma separator for ms, with " - " after logger name)
  if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}\s+-\s+\S+\s+-\s+\w+\s+-/.test(sampleLine)) {
    return 'python';
  }

  // Log4j vs Logback detection
  // Log4j: uses comma for ms, pattern: date,ms [thread] LEVEL logger - message
  if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}\s+\[/.test(sampleLine)) {
    return 'log4j';
  }

  // Logback: uses dot for ms, pattern: date.ms [thread] LEVEL logger - message
  if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\[/.test(sampleLine)) {
    return 'logback';
  }

  // Nginx error log (YYYY/MM/DD HH:MM:SS [level]) - check before access logs
  if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[\w+\]/.test(sampleLine)) {
    return 'nginx';
  }

  // Apache error log ([Day Mon DD HH:MM:SS.us YYYY] [module:level])
  if (/^\[\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\d{4}\]\s+\[[^\]]+\]/.test(sampleLine)) {
    return 'apache';
  }

  // Access log formats (CLF, Morgan, Nginx, Apache) - detect by structure
  // Common pattern: IP - user [date] "request" status bytes ...
  const accessLogPattern = /^(?:::1|\d+\.\d+\.\d+\.\d+)\s+-\s+\S+\s+\[[^\]]+\]\s+"[^"]*"\s+\d+\s+\d+/;
  if (accessLogPattern.test(sampleLine)) {
    // Count quoted strings to distinguish formats
    const quotedStrings = (sampleLine.match(/"[^"]*"/g) || []).length;

    // Check for Nginx-specific trailing field (response time like "0.123" or "-")
    // Nginx format: ... "user-agent" "0.123" or ... "user-agent" "-"
    const nginxTrailingPattern = /"\s+"[^"]*"\s*$/;
    const hasThreeOrMoreQuoted = quotedStrings >= 3;

    // Nginx typically has response time at end: ... "user-agent" "response_time"
    // or extra field like upstream time
    if (hasThreeOrMoreQuoted && nginxTrailingPattern.test(sampleLine)) {
      // Check if the trailing field looks like nginx (ends with "-" or a number)
      const trailingMatch = sampleLine.match(/"\s*([^"]*)"?\s*$/);
      if (trailingMatch) {
        const trailing = trailingMatch[1];
        // Nginx often has "-" or numeric values (response time) as last field
        if (trailing === '-' || /^\d+\.?\d*$/.test(trailing) || trailing === '') {
          return 'nginx';
        }
      }
    }

    // CLF has exactly 1 quoted string (the request)
    if (quotedStrings === 1) {
      return 'clf';
    }

    // Apache/Morgan have 3 quoted strings (request, referer, user-agent)
    // Check for Apache-specific patterns in referrer
    if (quotedStrings === 3) {
      // Apache logs often have full URLs in referrer
      if (/https?:\/\/[^"]+"\s+"[^"]*"$/.test(sampleLine)) {
        return 'apache';
      }
    }

    // Default to morgan for combined format
    return 'morgan';
  }

  // Kubernetes JSON log (has "log", "stream", "time" fields)
  if (sampleLine.startsWith('{') && /"log":\s*"/.test(sampleLine) && /"stream":\s*"/.test(sampleLine)) {
    return 'kubernetes';
  }

  // Kubernetes klog format (I1210 10:30:45.123456)
  if (/^[IWEF]\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+/.test(sampleLine)) {
    return 'kubernetes';
  }

  // RFC 5424 Syslog (<PRI>VERSION TIMESTAMP)
  if (/^<\d{1,3}>\d+\s+\d{4}-\d{2}-\d{2}T/.test(sampleLine)) {
    return 'syslog';
  }

  // RFC 3164 Syslog (<PRI>Mon DD HH:MM:SS)
  if (/^<\d{1,3}>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(sampleLine)) {
    return 'syslog';
  }

  // Systemd journal JSON format (has __REALTIME_TIMESTAMP)
  if (sampleLine.startsWith('{') && /"__REALTIME_TIMESTAMP"/.test(sampleLine)) {
    return 'syslog';
  }

  return bestFormat;
}

/**
 * Parse a log file with auto-detection
 */
export async function parseLogFile(
  filePath: string,
  format: LogFormat = 'auto',
  options: ParseOptions = {}
): Promise<{ format: LogFormat; result: ParseResult }> {
  // Detect format if needed
  const detectedFormat = format === 'auto' ? await detectFormat(filePath) : format;

  // Get appropriate parser
  const parser = getParser(detectedFormat);

  // Parse file
  const result = await parser.parseFile(filePath, options);

  return {
    format: detectedFormat,
    result,
  };
}

/**
 * Parse a single log line with auto-detection
 */
export function parseLogLine(line: string, format: LogFormat = 'auto', lineNumber: number = 1) {
  const parsers: BaseParser[] = [
    new SpringBootParser(),
    new WinstonParser(),
    new PinoParser(),
    new PythonParser(),
    new MorganParser(),
    new NginxCombinedParser(),
    new ApacheCombinedParser(),
    new KubernetesParser(),
    new SyslogCombinedParser(),
    new JsonLinesParser(),
  ];

  if (format !== 'auto') {
    const parser = getParser(format);
    return parser.parseLine(line, lineNumber);
  }

  // Try each parser until one works
  for (const parser of parsers) {
    const entry = parser.parseLine(line, lineNumber);
    if (entry) {
      return entry;
    }
  }

  return null;
}
