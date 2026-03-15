// SPDX-License-Identifier: MIT
/**
 * Flow Storage
 * Save and load recorded HTTP flows
 */

import { readFile, writeFile, readdir, mkdir, unlink, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface FlowRequest {
  id: number;
  timestamp: number; // ms from flow start
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  captureResponse?: Record<string, string>; // JSONPath mappings
}

export interface Flow {
  version: string;
  name: string;
  description?: string;
  recorded: string; // ISO date
  baseUrl: string;
  requests: FlowRequest[];
  variables: Record<string, string>;
}

const FLOW_VERSION = '1.0';
const FLOWS_DIR = join(homedir(), '.performance-profiler', 'flows');

/**
 * Ensure flows directory exists
 */
async function ensureFlowsDir(): Promise<void> {
  try {
    await mkdir(FLOWS_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

/**
 * Get flow file path
 */
function getFlowPath(flowName: string): string {
  // Sanitize flow name
  const safeName = flowName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(FLOWS_DIR, `${safeName}.json`);
}

/**
 * Save a flow to disk
 */
export async function saveFlow(flow: Flow): Promise<string> {
  await ensureFlowsDir();

  const flowPath = getFlowPath(flow.name);
  const flowData = {
    ...flow,
    version: FLOW_VERSION,
    recorded: flow.recorded || new Date().toISOString(),
  };

  await writeFile(flowPath, JSON.stringify(flowData, null, 2), 'utf-8');

  return flowPath;
}

/**
 * Load a flow from disk
 */
export async function loadFlow(flowName: string): Promise<Flow> {
  const flowPath = getFlowPath(flowName);

  try {
    const content = await readFile(flowPath, 'utf-8');
    const flow = JSON.parse(content) as Flow;

    // Validate basic structure
    if (!flow.name || !flow.requests || !Array.isArray(flow.requests)) {
      throw new Error('Invalid flow format');
    }

    return flow;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Flow not found: ${flowName}`);
    }
    throw error;
  }
}

/**
 * List all saved flows
 */
export async function listFlows(): Promise<{
  name: string;
  description?: string;
  recorded: string;
  requestCount: number;
  baseUrl: string;
}[]> {
  await ensureFlowsDir();

  try {
    const files = await readdir(FLOWS_DIR);
    const flows: {
      name: string;
      description?: string;
      recorded: string;
      requestCount: number;
      baseUrl: string;
    }[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const flowPath = join(FLOWS_DIR, file);
        const content = await readFile(flowPath, 'utf-8');
        const flow = JSON.parse(content) as Flow;

        flows.push({
          name: flow.name,
          description: flow.description,
          recorded: flow.recorded,
          requestCount: flow.requests?.length || 0,
          baseUrl: flow.baseUrl,
        });
      } catch {
        // Skip invalid files
      }
    }

    // Sort by recorded date (newest first)
    flows.sort((a, b) => new Date(b.recorded).getTime() - new Date(a.recorded).getTime());

    return flows;
  } catch {
    return [];
  }
}

/**
 * Delete a flow
 */
export async function deleteFlow(flowName: string): Promise<void> {
  const flowPath = getFlowPath(flowName);

  try {
    await unlink(flowPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Flow not found: ${flowName}`);
    }
    throw error;
  }
}

/**
 * Check if a flow exists
 */
export async function flowExists(flowName: string): Promise<boolean> {
  const flowPath = getFlowPath(flowName);

  try {
    await stat(flowPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new flow from scratch
 */
export function createFlow(
  name: string,
  baseUrl: string,
  description?: string
): Flow {
  return {
    version: FLOW_VERSION,
    name,
    description,
    recorded: new Date().toISOString(),
    baseUrl,
    requests: [],
    variables: {},
  };
}

/**
 * Add a request to a flow
 */
export function addRequestToFlow(
  flow: Flow,
  request: Omit<FlowRequest, 'id' | 'timestamp'>,
  timestampOffset: number = 0
): FlowRequest {
  const newRequest: FlowRequest = {
    ...request,
    id: flow.requests.length + 1,
    timestamp: timestampOffset,
  };

  flow.requests.push(newRequest);
  return newRequest;
}

/**
 * Clone a flow with a new name
 */
export async function cloneFlow(
  sourceName: string,
  newName: string
): Promise<Flow> {
  const sourceFlow = await loadFlow(sourceName);

  const clonedFlow: Flow = {
    ...sourceFlow,
    name: newName,
    recorded: new Date().toISOString(),
    description: `Clone of ${sourceName}`,
  };

  await saveFlow(clonedFlow);
  return clonedFlow;
}

/**
 * Get flows directory path
 */
export function getFlowsDirectory(): string {
  return FLOWS_DIR;
}

/**
 * Export flow to a specific path
 */
export async function exportFlow(flowName: string, exportPath: string): Promise<void> {
  const flow = await loadFlow(flowName);

  // Ensure directory exists
  await mkdir(dirname(exportPath), { recursive: true });

  await writeFile(exportPath, JSON.stringify(flow, null, 2), 'utf-8');
}

/**
 * Import flow from a specific path
 */
export async function importFlowFromPath(filePath: string, newName?: string): Promise<Flow> {
  const content = await readFile(filePath, 'utf-8');
  const flow = JSON.parse(content) as Flow;

  if (newName) {
    flow.name = newName;
  }

  flow.recorded = new Date().toISOString();

  await saveFlow(flow);
  return flow;
}
