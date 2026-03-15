// SPDX-License-Identifier: MIT
/**
 * Log Report Generator
 * Generate comprehensive log analysis reports in various formats
 */

import { writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { parseLogFile } from '../parsers/index.js';
import { findErrors } from './errors.js';
import { analyzePatterns } from './patterns.js';
import { aggregateStats } from './stats.js';
import type {
  ExportReportInput,
  ExportReportResult,
  LogLevel,
  ErrorGroup,
  Pattern,
  LogStats,
} from '../types.js';

/**
 * Export a log analysis report
 */
export async function exportReport(input: ExportReportInput): Promise<ExportReportResult> {
  const {
    filePath,
    format = 'auto',
    outputFormat,
    outputPath,
    includeCharts = true,
    title,
  } = input;

  // Gather all analysis data
  const [parseResult, errorsResult, patternsResult, statsResult] = await Promise.all([
    parseLogFile(filePath, format),
    findErrors({ filePath, format, groupByException: true }),
    analyzePatterns({ filePath, format }),
    aggregateStats({ filePath, format }),
  ]);

  // Build report data
  const reportData = {
    title: title || `Log Analysis Report: ${basename(filePath)}`,
    generatedAt: new Date().toISOString(),
    filePath,
    format: parseResult.format,
    summary: {
      totalLines: parseResult.result.totalLines,
      parsedEntries: parseResult.result.parsedEntries,
      failedLines: parseResult.result.failedLines,
      timeRange: statsResult.timeRange,
    },
    stats: statsResult.stats,
    errors: {
      totalErrors: errorsResult.totalErrors,
      totalWarnings: errorsResult.totalWarnings,
      groups: errorsResult.errorGroups,
      timeline: errorsResult.errorTimeline,
    },
    patterns: {
      total: patternsResult.summary.totalPatterns,
      critical: patternsResult.summary.criticalPatterns,
      warning: patternsResult.summary.warningPatterns,
      patterns: patternsResult.patterns,
      recommendations: patternsResult.recommendations,
    },
  };

  // Generate report content
  let content: string;
  let extension: string;

  switch (outputFormat) {
    case 'html':
      content = generateHtmlReport(reportData, includeCharts);
      extension = '.html';
      break;
    case 'json':
      content = JSON.stringify(reportData, null, 2);
      extension = '.json';
      break;
    case 'markdown':
      content = generateMarkdownReport(reportData, includeCharts);
      extension = '.md';
      break;
  }

  // Determine output path
  const finalOutputPath = outputPath || join(
    dirname(filePath),
    `${basename(filePath, '.log')}-report${extension}`
  );

  // Write report
  await writeFile(finalOutputPath, content, 'utf-8');

  // Calculate sections included
  const sections = ['Summary', 'Statistics'];
  if (errorsResult.totalErrors > 0) sections.push('Errors');
  if (patternsResult.patterns.length > 0) sections.push('Patterns');
  if (patternsResult.recommendations.length > 0) sections.push('Recommendations');

  return {
    outputPath: finalOutputPath,
    format: outputFormat,
    size: Buffer.byteLength(content, 'utf-8'),
    sections,
  };
}

/**
 * Generate HTML report
 */
function generateHtmlReport(data: ReportData, includeCharts: boolean): string {
  const { title, generatedAt, filePath, summary, stats, errors, patterns } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --primary: #0f3460;
      --accent: #e94560;
      --text: #eaeaea;
      --text-dim: #a0a0a0;
      --success: #4ade80;
      --warning: #fbbf24;
      --error: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: var(--accent); margin-bottom: 0.5rem; }
    h2 { color: var(--text); margin: 2rem 0 1rem; border-bottom: 2px solid var(--primary); padding-bottom: 0.5rem; }
    h3 { color: var(--text-dim); margin: 1.5rem 0 0.5rem; }
    .meta { color: var(--text-dim); font-size: 0.9rem; margin-bottom: 2rem; }
    .card {
      background: var(--surface);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .stat {
      text-align: center;
      padding: 1rem;
      background: var(--primary);
      border-radius: 8px;
    }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: var(--text-dim); font-size: 0.85rem; }
    .stat-trace { color: #94a3b8; }
    .stat-debug { color: #60a5fa; }
    .stat-info { color: var(--success); }
    .stat-warn { color: var(--warning); }
    .stat-error { color: var(--error); }
    .stat-fatal { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--primary); }
    th { color: var(--text-dim); font-weight: 500; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-critical { background: var(--error); }
    .badge-warning { background: var(--warning); color: #000; }
    .badge-info { background: var(--primary); }
    .chart { font-family: monospace; background: var(--primary); padding: 1rem; border-radius: 4px; overflow-x: auto; }
    .recommendation {
      background: var(--primary);
      border-left: 4px solid var(--accent);
      padding: 1rem;
      margin: 0.5rem 0;
    }
    pre { background: var(--bg); padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">
      Generated: ${new Date(generatedAt).toLocaleString()}<br>
      File: ${escapeHtml(filePath)}
    </p>

    <h2>📊 Summary</h2>
    <div class="card">
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${summary.totalLines.toLocaleString()}</div>
          <div class="stat-label">Total Lines</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.parsedEntries.toLocaleString()}</div>
          <div class="stat-label">Parsed Entries</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.failedLines.toLocaleString()}</div>
          <div class="stat-label">Failed Lines</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Math.round(stats.errorRate * 10) / 10}</div>
          <div class="stat-label">Error Rate (per 1000)</div>
        </div>
      </div>
    </div>

    <h2>📈 Log Levels</h2>
    <div class="card">
      <div class="grid">
        ${Object.entries(stats.byLevel).map(([level, count]) => `
          <div class="stat">
            <div class="stat-value stat-${level.toLowerCase()}">${count.toLocaleString()}</div>
            <div class="stat-label">${level}</div>
          </div>
        `).join('')}
      </div>
      ${includeCharts ? `
        <h3>Level Distribution</h3>
        <div class="chart"><pre>${generateAsciiBarChart(stats.byLevel)}</pre></div>
      ` : ''}
    </div>

    ${errors.totalErrors > 0 ? `
      <h2>🚨 Errors (${errors.totalErrors})</h2>
      <div class="card">
        ${errors.groups.slice(0, 10).map((group) => `
          <h3>${escapeHtml(group.exceptionType)}</h3>
          <p><strong>Count:</strong> ${group.count} | <strong>Message:</strong> ${escapeHtml(group.message.substring(0, 200))}</p>
          ${group.stackTrace.length > 0 ? `<pre>${escapeHtml(group.stackTrace.slice(0, 5).join('\n'))}</pre>` : ''}
        `).join('<hr style="border-color: var(--primary); margin: 1rem 0;">')}
      </div>
    ` : ''}

    ${patterns.patterns.length > 0 ? `
      <h2>🔍 Patterns Detected</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Category</th>
              <th>Count</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            ${patterns.patterns.slice(0, 15).map((p) => `
              <tr>
                <td>${escapeHtml(p.pattern.substring(0, 60))}${p.pattern.length > 60 ? '...' : ''}</td>
                <td>${p.category}</td>
                <td>${p.count}</td>
                <td><span class="badge badge-${p.severity}">${p.severity}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${patterns.recommendations.length > 0 ? `
      <h2>💡 Recommendations</h2>
      <div class="card">
        ${patterns.recommendations.map((rec) => `
          <div class="recommendation">${escapeHtml(rec)}</div>
        `).join('')}
      </div>
    ` : ''}

    ${includeCharts && stats.byHour.length > 0 ? `
      <h2>📅 Hourly Distribution</h2>
      <div class="card">
        <div class="chart"><pre>${generateTimelineChart(stats.byHour)}</pre></div>
      </div>
    ` : ''}

    <h2>📋 Top Loggers</h2>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Logger</th>
            <th>Total</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          ${stats.topLoggers.slice(0, 10).map((l) => `
            <tr>
              <td>${escapeHtml(l.logger)}</td>
              <td>${l.count.toLocaleString()}</td>
              <td style="color: ${l.errorCount > 0 ? 'var(--error)' : 'var(--text-dim)'}">${l.errorCount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(data: ReportData, includeCharts: boolean): string {
  const { title, generatedAt, filePath, summary, stats, errors, patterns } = data;

  const lines: string[] = [
    `# ${title}`,
    '',
    `> Generated: ${new Date(generatedAt).toLocaleString()}`,
    `> File: \`${filePath}\``,
    '',
    '## 📊 Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Lines | ${summary.totalLines.toLocaleString()} |`,
    `| Parsed Entries | ${summary.parsedEntries.toLocaleString()} |`,
    `| Failed Lines | ${summary.failedLines.toLocaleString()} |`,
    `| Error Rate | ${Math.round(stats.errorRate * 10) / 10} per 1000 |`,
    '',
    '## 📈 Log Levels',
    '',
    '| Level | Count |',
    '|-------|-------|',
  ];

  for (const [level, count] of Object.entries(stats.byLevel)) {
    lines.push(`| ${level} | ${count.toLocaleString()} |`);
  }

  if (includeCharts) {
    lines.push('', '```', generateAsciiBarChart(stats.byLevel), '```', '');
  }

  if (errors.totalErrors > 0) {
    lines.push(
      '',
      `## 🚨 Errors (${errors.totalErrors})`,
      ''
    );

    for (const group of errors.groups.slice(0, 10)) {
      lines.push(
        `### ${group.exceptionType}`,
        '',
        `- **Count:** ${group.count}`,
        `- **Message:** ${group.message.substring(0, 200)}${group.message.length > 200 ? '...' : ''}`,
        ''
      );
      if (group.stackTrace.length > 0) {
        lines.push('```', ...group.stackTrace.slice(0, 5), '```', '');
      }
    }
  }

  if (patterns.patterns.length > 0) {
    lines.push(
      '',
      '## 🔍 Patterns Detected',
      '',
      '| Pattern | Category | Count | Severity |',
      '|---------|----------|-------|----------|'
    );

    for (const p of patterns.patterns.slice(0, 15)) {
      const shortPattern = p.pattern.substring(0, 50) + (p.pattern.length > 50 ? '...' : '');
      lines.push(`| ${shortPattern} | ${p.category} | ${p.count} | ${p.severity} |`);
    }
  }

  if (patterns.recommendations.length > 0) {
    lines.push(
      '',
      '## 💡 Recommendations',
      ''
    );
    for (const rec of patterns.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  lines.push(
    '',
    '## 📋 Top Loggers',
    '',
    '| Logger | Total | Errors |',
    '|--------|-------|--------|'
  );

  for (const l of stats.topLoggers.slice(0, 10)) {
    lines.push(`| ${l.logger} | ${l.count.toLocaleString()} | ${l.errorCount} |`);
  }

  if (includeCharts && stats.byHour.length > 0) {
    lines.push(
      '',
      '## 📅 Hourly Distribution',
      '',
      '```',
      generateTimelineChart(stats.byHour),
      '```'
    );
  }

  return lines.join('\n');
}

/**
 * Generate ASCII bar chart
 */
function generateAsciiBarChart(data: Record<string, number>): string {
  const maxValue = Math.max(...Object.values(data));
  const maxBarLength = 40;
  const lines: string[] = [];

  for (const [label, value] of Object.entries(data)) {
    const barLength = maxValue > 0 ? Math.round((value / maxValue) * maxBarLength) : 0;
    const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
    lines.push(`${label.padEnd(6)} ${bar} ${value.toLocaleString()}`);
  }

  return lines.join('\n');
}

/**
 * Generate timeline chart
 */
function generateTimelineChart(byHour: Array<{ hour: string; total: number; errors: number }>): string {
  const maxTotal = Math.max(...byHour.map((h) => h.total));
  const maxBarLength = 50;
  const lines: string[] = [];

  for (const { hour, total, errors } of byHour.slice(-24)) {
    const hourLabel = hour.split('T')[1] || hour;
    const barLength = maxTotal > 0 ? Math.round((total / maxTotal) * maxBarLength) : 0;
    const errorBar = errors > 0 ? '!' : ' ';
    const bar = '█'.repeat(barLength);
    lines.push(`${hourLabel} ${errorBar}${bar.padEnd(maxBarLength)} ${total}`);
  }

  return lines.join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Type for report data
interface ReportData {
  title: string;
  generatedAt: string;
  filePath: string;
  format: string;
  summary: {
    totalLines: number;
    parsedEntries: number;
    failedLines: number;
    timeRange: { start: Date | null; end: Date | null; durationMinutes: number };
  };
  stats: LogStats;
  errors: {
    totalErrors: number;
    totalWarnings: number;
    groups: ErrorGroup[];
    timeline: Array<{ hour: string; count: number }>;
  };
  patterns: {
    total: number;
    critical: number;
    warning: number;
    patterns: Pattern[];
    recommendations: string[];
  };
}
