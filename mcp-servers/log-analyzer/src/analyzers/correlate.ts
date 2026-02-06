// SPDX-License-Identifier: MIT
/**
 * Event Correlator
 * Correlates events across multiple log files using request IDs, trace IDs, etc.
 */

import { parseLogFile } from '../parsers/index.js';
import type {
  LogFormat,
  LogEntry,
  CorrelateEventsInput,
  CorrelateEventsResult,
  CorrelatedEvent,
  CorrelationChain,
} from '../types.js';

/**
 * Correlate events across multiple log files
 */
export async function correlateEvents(input: CorrelateEventsInput): Promise<CorrelateEventsResult> {
  const {
    filePaths,
    correlationField,
    customField,
    targetValue,
    startTime,
    endTime,
  } = input;

  // Determine field to use
  const fieldName = correlationField === 'custom' ? customField : correlationField;
  if (!fieldName) {
    throw new Error('Correlation field is required');
  }

  // Parse all log files and collect entries
  const allEvents: CorrelatedEvent[] = [];

  for (const filePath of filePaths) {
    const { result } = await parseLogFile(filePath, 'auto', {
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    });

    for (const entry of result.entries) {
      const correlationValue = getCorrelationValue(entry, fieldName);

      if (correlationValue) {
        // If targeting specific value, filter
        if (targetValue && correlationValue !== targetValue) {
          continue;
        }

        allEvents.push({
          file: filePath,
          entry,
        });
      }
    }
  }

  // Group events by correlation value
  const chains = new Map<string, CorrelatedEvent[]>();

  for (const event of allEvents) {
    const value = getCorrelationValue(event.entry, fieldName)!;
    const existing = chains.get(value) || [];
    existing.push(event);
    chains.set(value, existing);
  }

  // Build correlation chains
  const correlationChains: CorrelationChain[] = [];

  for (const [value, events] of chains) {
    // Sort events by timestamp
    events.sort((a, b) => a.entry.timestamp.getTime() - b.entry.timestamp.getTime());

    const timestamps = events.map((e) => e.entry.timestamp.getTime());
    const timespan = Math.max(...timestamps) - Math.min(...timestamps);

    const hasError = events.some(
      (e) => e.entry.level === 'ERROR' || e.entry.level === 'FATAL'
    );

    // Build summary
    const summary = buildChainSummary(events);

    correlationChains.push({
      correlationValue: value,
      events,
      timespan,
      hasError,
      summary,
    });
  }

  // Sort chains - errors first, then by event count
  correlationChains.sort((a, b) => {
    if (a.hasError !== b.hasError) {
      return a.hasError ? -1 : 1;
    }
    return b.events.length - a.events.length;
  });

  // Calculate stats
  const chainsWithErrors = correlationChains.filter((c) => c.hasError).length;
  const totalEvents = correlationChains.reduce((sum, c) => sum + c.events.length, 0);
  const avgEventsPerChain = correlationChains.length > 0
    ? Math.round((totalEvents / correlationChains.length) * 100) / 100
    : 0;

  return {
    correlationField: fieldName,
    totalChains: correlationChains.length,
    chains: correlationChains.slice(0, 100), // Limit output
    chainsWithErrors,
    avgEventsPerChain,
  };
}

/**
 * Get correlation value from entry
 */
function getCorrelationValue(entry: LogEntry, field: string): string | undefined {
  switch (field) {
    case 'requestId':
      return entry.requestId;
    case 'traceId':
      return entry.traceId;
    case 'spanId':
      return entry.spanId;
    case 'sessionId':
      return entry.sessionId;
    case 'userId':
      return entry.userId;
    default:
      // Try metadata
      if (entry.metadata && typeof entry.metadata === 'object') {
        const value = (entry.metadata as Record<string, unknown>)[field];
        return value ? String(value) : undefined;
      }
      return undefined;
  }
}

/**
 * Build a human-readable summary of the correlation chain
 */
function buildChainSummary(events: CorrelatedEvent[]): string {
  if (events.length === 0) return 'No events';

  const files = new Set(events.map((e) => e.file.split('/').pop() || e.file));
  const levels = new Set(events.map((e) => e.entry.level));

  const parts: string[] = [];

  // Files involved
  parts.push(`${files.size} file(s)`);

  // Event count
  parts.push(`${events.length} events`);

  // Time range
  const first = events[0].entry.timestamp;
  const last = events[events.length - 1].entry.timestamp;
  const duration = last.getTime() - first.getTime();

  if (duration < 1000) {
    parts.push(`${duration}ms`);
  } else if (duration < 60000) {
    parts.push(`${Math.round(duration / 1000)}s`);
  } else {
    parts.push(`${Math.round(duration / 60000)}min`);
  }

  // Error indicator
  if (levels.has('ERROR') || levels.has('FATAL')) {
    parts.push('HAS ERRORS');
  }

  return parts.join(' | ');
}

/**
 * Find related events for a specific correlation value
 */
export async function findRelatedEvents(
  filePaths: string[],
  correlationValue: string,
  fields: string[] = ['requestId', 'traceId', 'sessionId']
): Promise<{
  correlationValue: string;
  matchedField: string;
  events: CorrelatedEvent[];
  timeline: Array<{
    timestamp: Date;
    file: string;
    level: string;
    message: string;
  }>;
}> {
  for (const field of fields) {
    const result = await correlateEvents({
      filePaths,
      correlationField: field as any,
      targetValue: correlationValue,
    });

    if (result.chains.length > 0) {
      const chain = result.chains[0];

      return {
        correlationValue,
        matchedField: field,
        events: chain.events,
        timeline: chain.events.map((e) => ({
          timestamp: e.entry.timestamp,
          file: e.file.split('/').pop() || e.file,
          level: e.entry.level,
          message: e.entry.message.slice(0, 100),
        })),
      };
    }
  }

  return {
    correlationValue,
    matchedField: '',
    events: [],
    timeline: [],
  };
}

/**
 * Analyze request flow from correlated events
 */
export function analyzeRequestFlow(chain: CorrelationChain): {
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  phases: Array<{
    name: string;
    duration: number;
    file: string;
    level: string;
  }>;
  bottleneck?: {
    phase: string;
    duration: number;
    percentage: number;
  };
} {
  const events = chain.events;

  if (events.length === 0) {
    return {
      startTime: new Date(),
      endTime: new Date(),
      totalDuration: 0,
      phases: [],
    };
  }

  const startTime = events[0].entry.timestamp;
  const endTime = events[events.length - 1].entry.timestamp;
  const totalDuration = endTime.getTime() - startTime.getTime();

  const phases: Array<{
    name: string;
    duration: number;
    file: string;
    level: string;
  }> = [];

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const duration = next.entry.timestamp.getTime() - current.entry.timestamp.getTime();

    phases.push({
      name: `${current.entry.logger || 'unknown'} → ${next.entry.logger || 'unknown'}`,
      duration,
      file: current.file.split('/').pop() || current.file,
      level: current.entry.level,
    });
  }

  // Find bottleneck
  let bottleneck: { phase: string; duration: number; percentage: number } | undefined;
  if (phases.length > 0 && totalDuration > 0) {
    const maxPhase = phases.reduce((max, p) =>
      p.duration > max.duration ? p : max
    );

    if (maxPhase.duration > totalDuration * 0.3) {
      bottleneck = {
        phase: maxPhase.name,
        duration: maxPhase.duration,
        percentage: Math.round((maxPhase.duration / totalDuration) * 100),
      };
    }
  }

  return {
    startTime,
    endTime,
    totalDuration,
    phases,
    bottleneck,
  };
}
