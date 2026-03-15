// SPDX-License-Identifier: MIT
/**
 * Insomnia Workspace Importer
 * Supports Insomnia export format v4
 */

import { readFile } from 'fs/promises';

// Insomnia Export Types
interface InsomniaHeader {
  name: string;
  value: string;
  disabled?: boolean;
}

interface InsomniaParameter {
  name: string;
  value: string;
  disabled?: boolean;
}

interface InsomniaBody {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value: string; disabled?: boolean }>;
}

interface InsomniaRequest {
  _id: string;
  _type: 'request';
  parentId: string;
  name: string;
  method: string;
  url: string;
  headers?: InsomniaHeader[];
  parameters?: InsomniaParameter[];
  body?: InsomniaBody;
  description?: string;
}

interface InsomniaFolder {
  _id: string;
  _type: 'request_group';
  parentId: string;
  name: string;
  description?: string;
}

interface InsomniaWorkspace {
  _id: string;
  _type: 'workspace';
  name: string;
  description?: string;
}

interface InsomniaEnvironment {
  _id: string;
  _type: 'environment';
  parentId: string;
  name: string;
  data: Record<string, unknown>;
}

type InsomniaResource = InsomniaRequest | InsomniaFolder | InsomniaWorkspace | InsomniaEnvironment | { _type: string };

interface InsomniaExport {
  _type: 'export';
  __export_format: number;
  __export_date?: string;
  __export_source?: string;
  resources: InsomniaResource[];
}

// Converted Request Format
export interface ConvertedRequest {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  description?: string;
  folder?: string;
}

export interface ImportInsomniaResult {
  workspaceName: string;
  description?: string;
  requests: ConvertedRequest[];
  variables: Record<string, unknown>;
  totalRequests: number;
  folders: string[];
}

/**
 * Replace {{ variable }} and {% variable %} with actual values
 */
function replaceVariables(str: string, variables: Record<string, unknown>): string {
  // Handle {{ variable }} syntax
  let result = str.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });

  // Handle {% variable %} (Insomnia template tags - simplified)
  result = result.replace(/\{%\s*([^%]+)\s*%\}/g, (_, key) => {
    const value = variables[key.trim()];
    return value !== undefined ? String(value) : `{%${key}%}`;
  });

  return result;
}

/**
 * Build folder path from parent chain
 */
function buildFolderPath(
  parentId: string,
  folders: Map<string, InsomniaFolder>,
  workspaceId: string
): string {
  const parts: string[] = [];
  let currentId = parentId;

  while (currentId && currentId !== workspaceId) {
    const folder = folders.get(currentId);
    if (folder) {
      parts.unshift(folder.name);
      currentId = folder.parentId;
    } else {
      break;
    }
  }

  return parts.join('/');
}

/**
 * Parse Insomnia body
 */
function parseInsomniaBody(body?: InsomniaBody, variables?: Record<string, unknown>): unknown {
  if (!body) return undefined;

  if (body.text) {
    const text = replaceVariables(body.text, variables || {});
    if (body.mimeType === 'application/json') {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }

  if (body.params) {
    const params: Record<string, string> = {};
    body.params.filter(p => !p.disabled).forEach(p => {
      params[p.name] = replaceVariables(p.value, variables || {});
    });
    return params;
  }

  return undefined;
}

/**
 * Parse Insomnia headers
 */
function parseInsomniaHeaders(
  headers?: InsomniaHeader[],
  variables?: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};

  headers?.filter(h => !h.disabled).forEach(h => {
    result[h.name] = replaceVariables(h.value, variables || {});
  });

  return result;
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  parameters?: InsomniaParameter[],
  variables?: Record<string, unknown>
): string {
  let url = replaceVariables(baseUrl, variables || {});

  const activeParams = parameters?.filter(p => !p.disabled) || [];
  if (activeParams.length > 0) {
    const queryString = activeParams
      .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(replaceVariables(p.value, variables || {}))}`)
      .join('&');

    url += url.includes('?') ? '&' : '?';
    url += queryString;
  }

  return url;
}

/**
 * Import an Insomnia workspace export file
 */
export async function importInsomniaWorkspace(filePath: string): Promise<ImportInsomniaResult> {
  const content = await readFile(filePath, 'utf-8');
  const exportData: InsomniaExport = JSON.parse(content);

  // Validate it's an Insomnia export
  if (exportData._type !== 'export') {
    throw new Error('Invalid Insomnia export: missing or invalid _type');
  }

  // Extract workspace
  const workspace = exportData.resources.find(
    r => r._type === 'workspace'
  ) as InsomniaWorkspace | undefined;

  if (!workspace) {
    throw new Error('Invalid Insomnia export: no workspace found');
  }

  // Extract environments and merge variables
  const variables: Record<string, unknown> = {};
  exportData.resources
    .filter(r => r._type === 'environment')
    .forEach(r => {
      const env = r as InsomniaEnvironment;
      Object.assign(variables, env.data);
    });

  // Build folder map
  const folders = new Map<string, InsomniaFolder>();
  exportData.resources
    .filter(r => r._type === 'request_group')
    .forEach(r => {
      const folder = r as InsomniaFolder;
      folders.set(folder._id, folder);
    });

  // Extract requests
  const requests: ConvertedRequest[] = [];
  exportData.resources
    .filter(r => r._type === 'request')
    .forEach(r => {
      const req = r as InsomniaRequest;
      const folderPath = buildFolderPath(req.parentId, folders, workspace._id);

      requests.push({
        name: req.name,
        method: req.method,
        url: buildUrl(req.url, req.parameters, variables),
        headers: parseInsomniaHeaders(req.headers, variables),
        body: parseInsomniaBody(req.body, variables),
        description: req.description,
        folder: folderPath || undefined,
      });
    });

  // Extract unique folders
  const folderNames = [...new Set(requests.map(r => r.folder).filter(Boolean))] as string[];

  return {
    workspaceName: workspace.name,
    description: workspace.description,
    requests,
    variables,
    totalRequests: requests.length,
    folders: folderNames,
  };
}

/**
 * Convert imported requests to batch format for api-tester
 */
export function toBatchFormat(requests: ConvertedRequest[]): Array<{
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}> {
  return requests.map(r => ({
    name: r.name,
    method: r.method,
    url: r.url,
    headers: Object.keys(r.headers).length > 0 ? r.headers : undefined,
    body: r.body,
  }));
}
