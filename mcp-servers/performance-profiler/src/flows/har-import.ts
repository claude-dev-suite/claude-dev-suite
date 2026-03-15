// SPDX-License-Identifier: MIT
/**
 * HAR Import
 * Import HTTP Archive files exported from Chrome DevTools
 */

import { readFile } from 'fs/promises';
import { createFlow, addRequestToFlow, saveFlow, type Flow, type FlowRequest } from './storage.js';

/**
 * HAR file structure (simplified)
 */
interface HarFile {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text?: string;
      params?: Array<{ name: string; value: string }>;
    };
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
  };
}

export interface ImportHarInput {
  harPath: string;
  flowName: string;
  filterHost?: string;
  excludeStaticAssets?: boolean;
  excludePatterns?: string[];
}

export interface ImportHarResult {
  flowName: string;
  savedPath: string;
  totalEntries: number;
  importedRequests: number;
  skippedRequests: number;
  baseUrl: string;
  requests: Array<{
    method: string;
    path: string;
    status: number;
  }>;
}

// Common static asset extensions to filter
const STATIC_EXTENSIONS = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp', '.avif',
];

// Headers to exclude from imported requests
const EXCLUDED_HEADERS = [
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'cookie', // Will be handled separately if needed
  'host',
  'origin',
  'referer',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'upgrade-insecure-requests',
  'user-agent',
];

/**
 * Import a HAR file and create a flow
 */
export async function importHar(input: ImportHarInput): Promise<ImportHarResult> {
  const {
    harPath,
    flowName,
    filterHost,
    excludeStaticAssets = true,
    excludePatterns = [],
  } = input;

  // Read and parse HAR file
  const content = await readFile(harPath, 'utf-8');
  const har: HarFile = JSON.parse(content);

  if (!har.log?.entries) {
    throw new Error('Invalid HAR file: missing log.entries');
  }

  const entries = har.log.entries;
  let baseUrl = '';
  let skippedCount = 0;

  // Find first entry to determine base URL
  for (const entry of entries) {
    try {
      const url = new URL(entry.request.url);
      if (!filterHost || url.host === filterHost) {
        baseUrl = `${url.protocol}//${url.host}`;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!baseUrl) {
    throw new Error('Could not determine base URL from HAR entries');
  }

  // Create flow
  const flow = createFlow(flowName, baseUrl, `Imported from ${harPath}`);

  // Track first request time for relative timestamps
  let firstRequestTime: number | null = null;
  const importedRequests: Array<{ method: string; path: string; status: number }> = [];

  for (const entry of entries) {
    const { request, response, startedDateTime } = entry;

    // Parse URL
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      skippedCount++;
      continue;
    }

    // Filter by host if specified
    if (filterHost && url.host !== filterHost) {
      skippedCount++;
      continue;
    }

    // Skip static assets if configured
    if (excludeStaticAssets) {
      const pathname = url.pathname.toLowerCase();
      if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
        skippedCount++;
        continue;
      }
    }

    // Skip patterns
    if (excludePatterns.some((pattern) => request.url.includes(pattern))) {
      skippedCount++;
      continue;
    }

    // Calculate timestamp
    const requestTime = new Date(startedDateTime).getTime();
    if (firstRequestTime === null) {
      firstRequestTime = requestTime;
    }
    const timestampOffset = requestTime - firstRequestTime;

    // Process headers
    const headers: Record<string, string> = {};
    for (const header of request.headers) {
      const lowerName = header.name.toLowerCase();
      if (!EXCLUDED_HEADERS.includes(lowerName)) {
        headers[header.name] = header.value;
      }
    }

    // Process body
    let body: unknown;
    if (request.postData?.text) {
      try {
        body = JSON.parse(request.postData.text);
      } catch {
        body = request.postData.text;
      }
    } else if (request.postData?.params) {
      body = Object.fromEntries(
        request.postData.params.map((p) => [p.name, p.value])
      );
    }

    // Build path with query string
    const path = url.pathname + url.search;

    // Add request to flow
    const flowRequest: Omit<FlowRequest, 'id' | 'timestamp'> = {
      method: request.method,
      path,
      headers: Object.keys(headers).length > 0 ? headers : {},
    };

    if (body) {
      flowRequest.body = body;
    }

    addRequestToFlow(flow, flowRequest, timestampOffset);

    importedRequests.push({
      method: request.method,
      path,
      status: response.status,
    });
  }

  // Save flow
  const savedPath = await saveFlow(flow);

  return {
    flowName,
    savedPath,
    totalEntries: entries.length,
    importedRequests: importedRequests.length,
    skippedRequests: skippedCount,
    baseUrl,
    requests: importedRequests,
  };
}

/**
 * Preview HAR import without saving
 */
export async function previewHarImport(input: Omit<ImportHarInput, 'flowName'>): Promise<{
  totalEntries: number;
  previewRequests: Array<{
    method: string;
    url: string;
    status: number;
    willImport: boolean;
    skipReason?: string;
  }>;
  suggestedBaseUrl: string;
  hosts: string[];
}> {
  const {
    harPath,
    filterHost,
    excludeStaticAssets = true,
    excludePatterns = [],
  } = input;

  const content = await readFile(harPath, 'utf-8');
  const har: HarFile = JSON.parse(content);

  if (!har.log?.entries) {
    throw new Error('Invalid HAR file: missing log.entries');
  }

  const entries = har.log.entries;
  const hosts = new Set<string>();
  const previewRequests: Array<{
    method: string;
    url: string;
    status: number;
    willImport: boolean;
    skipReason?: string;
  }> = [];

  for (const entry of entries) {
    const { request, response } = entry;

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      previewRequests.push({
        method: request.method,
        url: request.url,
        status: response.status,
        willImport: false,
        skipReason: 'Invalid URL',
      });
      continue;
    }

    hosts.add(url.host);

    let willImport = true;
    let skipReason: string | undefined;

    // Check filters
    if (filterHost && url.host !== filterHost) {
      willImport = false;
      skipReason = `Host mismatch (${url.host} != ${filterHost})`;
    } else if (excludeStaticAssets) {
      const pathname = url.pathname.toLowerCase();
      if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
        willImport = false;
        skipReason = 'Static asset';
      }
    } else if (excludePatterns.some((p) => request.url.includes(p))) {
      willImport = false;
      skipReason = 'Matched exclude pattern';
    }

    previewRequests.push({
      method: request.method,
      url: request.url,
      status: response.status,
      willImport,
      skipReason,
    });
  }

  // Suggest base URL (most common host or first API host)
  const hostCounts = new Map<string, number>();
  for (const entry of entries) {
    try {
      const url = new URL(entry.request.url);
      hostCounts.set(url.host, (hostCounts.get(url.host) || 0) + 1);
    } catch {
      continue;
    }
  }

  const sortedHosts = [...hostCounts.entries()].sort((a, b) => b[1] - a[1]);
  const suggestedHost = sortedHosts[0]?.[0] || '';
  const firstEntry = entries.find((e) => {
    try {
      return new URL(e.request.url).host === suggestedHost;
    } catch {
      return false;
    }
  });

  let suggestedBaseUrl = '';
  if (firstEntry) {
    try {
      const url = new URL(firstEntry.request.url);
      suggestedBaseUrl = `${url.protocol}//${url.host}`;
    } catch {
      // Ignore
    }
  }

  return {
    totalEntries: entries.length,
    previewRequests: previewRequests.slice(0, 50), // Limit preview
    suggestedBaseUrl,
    hosts: [...hosts],
  };
}

/**
 * Detect variables in HAR entries (common patterns like tokens, IDs)
 */
export function detectVariables(har: HarFile): {
  detectedVariables: Array<{
    name: string;
    value: string;
    foundIn: string;
    suggestion: string;
  }>;
} {
  const detected: Array<{
    name: string;
    value: string;
    foundIn: string;
    suggestion: string;
  }> = [];

  const bearerTokens = new Set<string>();
  const uuids = new Set<string>();

  for (const entry of har.log.entries) {
    // Check Authorization header
    const authHeader = entry.request.headers.find(
      (h) => h.name.toLowerCase() === 'authorization'
    );
    if (authHeader?.value.startsWith('Bearer ')) {
      const token = authHeader.value.slice(7);
      if (!bearerTokens.has(token)) {
        bearerTokens.add(token);
        detected.push({
          name: 'AUTH_TOKEN',
          value: token.slice(0, 20) + '...',
          foundIn: 'Authorization header',
          suggestion: '{{AUTH_TOKEN}}',
        });
      }
    }

    // Check for UUIDs in URL
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const urlUuids = entry.request.url.match(uuidRegex);
    if (urlUuids) {
      for (const uuid of urlUuids) {
        if (!uuids.has(uuid)) {
          uuids.add(uuid);
          detected.push({
            name: `ID_${uuids.size}`,
            value: uuid,
            foundIn: 'URL path',
            suggestion: `{{ID_${uuids.size}}}`,
          });
        }
      }
    }
  }

  return { detectedVariables: detected };
}
