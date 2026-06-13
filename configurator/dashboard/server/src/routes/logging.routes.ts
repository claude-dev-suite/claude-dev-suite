// SPDX-License-Identifier: MIT
/**
 * Logging API Routes
 *
 * Endpoints for receiving, retrieving, and streaming logs.
 */

import { Router, type Request, type Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { getLogger, getLogDirectoryPath } from '../utils/logger.js';
import { validateBody } from '../middleware/validateRequest.js';

const logger = getLogger('Logging');

// ============================================
// VALIDATION SCHEMAS
// ============================================

/** Max allowed values for log message and metadata fields */
const LOG_LIMITS = {
  MESSAGE_MAX: 2000,
  COMPONENT_MAX: 100,
  BATCH_MAX: 100,
} as const;

const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'http', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'HTTP']);

const LogEntryInputSchema = z.object({
  level: LogLevelSchema,
  component: z.string().max(LOG_LIMITS.COMPONENT_MAX).optional(),
  message: z.string().max(LOG_LIMITS.MESSAGE_MAX, `message must be ≤ ${LOG_LIMITS.MESSAGE_MAX} chars`),
  data: z.unknown().optional(),
});

const LogBatchInputSchema = z.object({
  entries: z
    .array(LogEntryInputSchema)
    .max(LOG_LIMITS.BATCH_MAX, `batch must contain ≤ ${LOG_LIMITS.BATCH_MAX} entries`),
});

export const loggingRoutes = Router();

// Log entry interface
export interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  data?: unknown;
  correlationId?: string;
}

// Store SSE clients for real-time streaming
const sseClients = new Set<Response>();

// Get log directory - use AppData on Windows, ~/.dev-suite on others
function getLogDir(): string {
  return getLogDirectoryPath();
}

// Ensure log directory exists
function ensureLogDir(): string {
  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

// Get current log file path
function getLogFilePath(filename = 'frontend.log'): string {
  const logDir = ensureLogDir();
  return path.join(logDir, filename);
}

// Get combined log file path (backend logs)
function getCombinedLogFilePath(): string {
  const logDir = ensureLogDir();
  // Find the most recent combined log file
  const files = fs.readdirSync(logDir).filter(f => f.startsWith('combined-') && f.endsWith('.log'));
  if (files.length === 0) return '';

  // Sort by date (newest first)
  files.sort().reverse();
  return path.join(logDir, files[0] ?? 'combined.log');
}

// Format log entry
function formatLogEntry(level: string, component: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const entry: LogEntry = {
    timestamp,
    level: level.toUpperCase(),
    component,
    message,
    data,
  };
  return JSON.stringify(entry) + '\n';
}

// Parse log entry from JSON line
function parseLogEntry(line: string): LogEntry | null {
  try {
    // Try parsing as JSON first (new format)
    const parsed = JSON.parse(line);
    return {
      timestamp: parsed.timestamp,
      level: parsed.level?.toUpperCase() || 'INFO',
      component: parsed.component || 'Unknown',
      message: parsed.message,
      data: parsed.data,
      correlationId: parsed.correlationId,
    };
  } catch {
    // Try parsing legacy text format: [timestamp] [LEVEL] [component] message
    const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$/);
    if (match?.[1] && match[2] && match[3] && match[4]) {
      return {
        timestamp: match[1],
        level: match[2],
        component: match[3],
        message: match[4],
      };
    }
    return null;
  }
}

// Write log entry to file
function writeLog(level: string, component: string, message: string, data?: unknown): void {
  const logFile = getLogFilePath();
  const entry = formatLogEntry(level, component, message, data);

  // Also log to server console for visibility
  logger.debug('Frontend log', { component, level, message, data });

  // Append to file
  fs.appendFileSync(logFile, entry, 'utf8');

  // Broadcast to SSE clients
  broadcastLogToClients({
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    component,
    message,
    data,
  });
}

// Broadcast log entry to all connected SSE clients
function broadcastLogToClients(entry: LogEntry): void {
  const data = JSON.stringify(entry);
  sseClients.forEach((client) => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      logger.error('Failed to write to SSE client', { error: err });
      sseClients.delete(client);
    }
  });
}

// POST /api/log - Receive log entries from frontend
loggingRoutes.post('/log', validateBody(LogEntryInputSchema), (req: Request, res: Response) => {
  try {
    const { level, component, message, data } = req.body as {
      level: string;
      component?: string;
      message: string;
      data?: unknown;
    };

    writeLog(level, component || 'Frontend', message, data);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Failed to write log', { error: err });
    return res.status(500).json({ error: 'Failed to write log' });
  }
});

// POST /api/log/batch - Receive multiple log entries
loggingRoutes.post('/log/batch', validateBody(LogBatchInputSchema), (req: Request, res: Response) => {
  try {
    const { entries } = req.body as {
      entries: Array<{
        level: string;
        component?: string;
        message: string;
        data?: unknown;
      }>;
    };

    for (const entry of entries) {
      writeLog(entry.level, entry.component || 'Frontend', entry.message, entry.data);
    }

    return res.json({ success: true, count: entries.length });
  } catch (err) {
    logger.error('Failed to write batch logs', { error: err });
    return res.status(500).json({ error: 'Failed to write logs' });
  }
});

// GET /api/logs - Get filtered and paginated log entries
loggingRoutes.get('/logs', (req: Request, res: Response) => {
  try {
    const level = req.query.level as string | undefined;
    const component = req.query.component as string | undefined;
    const search = req.query.search as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);
    const source = req.query.source as string || 'frontend'; // 'frontend', 'backend', or 'all'

    let allEntries: LogEntry[] = [];

    // Read frontend logs
    if (source === 'frontend' || source === 'all') {
      const frontendLogFile = getLogFilePath('frontend.log');
      if (fs.existsSync(frontendLogFile)) {
        const content = fs.readFileSync(frontendLogFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const parsed = lines.map(parseLogEntry).filter((e): e is LogEntry => e !== null);
        allEntries.push(...parsed);
      }
    }

    // Read backend logs
    if (source === 'backend' || source === 'all') {
      const backendLogFile = getCombinedLogFilePath();
      if (backendLogFile && fs.existsSync(backendLogFile)) {
        const content = fs.readFileSync(backendLogFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const parsed = lines.map(parseLogEntry).filter((e): e is LogEntry => e !== null);
        allEntries.push(...parsed);
      }
    }

    // Filter by level
    if (level) {
      const levels = level.split(',').map(l => l.toUpperCase());
      allEntries = allEntries.filter(e => levels.includes(e.level));
    }

    // Filter by component
    if (component) {
      const components = component.split(',');
      allEntries = allEntries.filter(e => components.includes(e.component));
    }

    // Filter by search text
    if (search) {
      const searchLower = search.toLowerCase();
      allEntries = allEntries.filter(e =>
        e.message.toLowerCase().includes(searchLower) ||
        e.component.toLowerCase().includes(searchLower) ||
        JSON.stringify(e.data || {}).toLowerCase().includes(searchLower)
      );
    }

    // Filter by time range
    if (from) {
      const fromDate = new Date(from);
      allEntries = allEntries.filter(e => new Date(e.timestamp) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      allEntries = allEntries.filter(e => new Date(e.timestamp) <= toDate);
    }

    // Sort by timestamp (newest first)
    allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    const limitedEntries = allEntries.slice(0, limit);

    return res.json({
      success: true,
      data: {
        logs: limitedEntries,
        total: allEntries.length,
        limit,
      },
    });
  } catch (err) {
    logger.error('Failed to read logs', { error: err });
    return res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
});

// GET /api/logs/stream - SSE endpoint for real-time logs
loggingRoutes.get('/logs/stream', (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add client to set
  sseClients.add(res);
  logger.info('SSE client connected', { clientCount: sseClients.size });

  // Send initial ping
  res.write('data: {"type":"connected"}\n\n');

  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(res);
    logger.info('SSE client disconnected', { clientCount: sseClients.size });
  });
});

// GET /api/logs/stats - Get log statistics
loggingRoutes.get('/logs/stats', (req: Request, res: Response) => {
  try {
    const source = req.query.source as string || 'frontend';

    let allEntries: LogEntry[] = [];

    // Read logs based on source
    if (source === 'frontend' || source === 'all') {
      const frontendLogFile = getLogFilePath('frontend.log');
      if (fs.existsSync(frontendLogFile)) {
        const content = fs.readFileSync(frontendLogFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const parsed = lines.map(parseLogEntry).filter((e): e is LogEntry => e !== null);
        allEntries.push(...parsed);
      }
    }

    if (source === 'backend' || source === 'all') {
      const backendLogFile = getCombinedLogFilePath();
      if (backendLogFile && fs.existsSync(backendLogFile)) {
        const content = fs.readFileSync(backendLogFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const parsed = lines.map(parseLogEntry).filter((e): e is LogEntry => e !== null);
        allEntries.push(...parsed);
      }
    }

    // Calculate statistics
    const byLevel: Record<string, number> = {};
    const byComponent: Record<string, number> = {};
    const recentErrors: LogEntry[] = [];

    for (const entry of allEntries) {
      // Count by level
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;

      // Count by component
      byComponent[entry.component] = (byComponent[entry.component] || 0) + 1;

      // Collect recent errors
      if (entry.level === 'ERROR') {
        recentErrors.push(entry);
      }
    }

    // Sort errors by timestamp (newest first)
    recentErrors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.json({
      success: true,
      data: {
        total: allEntries.length,
        byLevel,
        byComponent,
        recentErrorCount: recentErrors.length,
        recentErrors: recentErrors.slice(0, 10),
      },
    });
  } catch (err) {
    logger.error('Failed to get log stats', { error: err });
    return res.status(500).json({ success: false, error: 'Failed to get log stats' });
  }
});

// Legacy endpoint - Get recent log entries
loggingRoutes.get('/log', (req: Request, res: Response) => {
  try {
    const lines = Math.min(parseInt(req.query.lines as string) || 100, 1000);
    const logFile = getLogFilePath();

    if (!fs.existsSync(logFile)) {
      return res.json({ logs: [], file: logFile });
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(l => l.trim());
    const recentLines = allLines.slice(-lines);

    return res.json({
      logs: recentLines,
      file: logFile,
      totalLines: allLines.length
    });
  } catch (err) {
    logger.error('Failed to read logs', { error: err });
    return res.status(500).json({ error: 'Failed to read logs' });
  }
});

// DELETE /api/logs - Clear logs
loggingRoutes.delete('/logs', (_req: Request, res: Response) => {
  try {
    const logFile = getLogFilePath();
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '', 'utf8');
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error('Failed to clear logs', { error: err });
    return res.status(500).json({ success: false, error: 'Failed to clear logs' });
  }
});

// Legacy endpoint
loggingRoutes.delete('/log', (_req: Request, res: Response) => {
  try {
    const logFile = getLogFilePath();
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '', 'utf8');
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error('Failed to clear logs', { error: err });
    return res.status(500).json({ error: 'Failed to clear logs' });
  }
});
