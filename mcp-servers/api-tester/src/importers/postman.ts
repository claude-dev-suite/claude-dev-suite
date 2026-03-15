// SPDX-License-Identifier: MIT
/**
 * Postman Collection Importer
 * Supports Postman Collection v2.1 format
 */

import { readFile } from 'fs/promises';

// Postman Collection v2.1 Types
interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryParam[];
  variable?: PostmanVariable[];
}

interface PostmanBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>;
  formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean }>;
  options?: {
    raw?: { language?: string };
  };
}

interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  url: PostmanUrl | string;
  body?: PostmanBody;
  description?: string;
}

interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[]; // For folders
  description?: string;
}

interface PostmanCollection {
  info: {
    name: string;
    _postman_id?: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
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

export interface ImportPostmanResult {
  collectionName: string;
  description?: string;
  requests: ConvertedRequest[];
  variables: Record<string, string>;
  totalRequests: number;
  folders: string[];
}

/**
 * Parse Postman URL to string
 */
function parsePostmanUrl(url: PostmanUrl | string, variables: Record<string, string>): string {
  if (typeof url === 'string') {
    return replaceVariables(url, variables);
  }

  if (url.raw) {
    return replaceVariables(url.raw, variables);
  }

  const protocol = url.protocol || 'http';
  const host = url.host?.join('.') || 'localhost';
  const path = url.path?.join('/') || '';
  const query = url.query
    ?.filter(q => !q.disabled)
    .map(q => `${q.key}=${replaceVariables(q.value, variables)}`)
    .join('&');

  let result = `${protocol}://${host}`;
  if (path) result += `/${path}`;
  if (query) result += `?${query}`;

  return replaceVariables(result, variables);
}

/**
 * Replace {{variable}} with actual values
 */
function replaceVariables(str: string, variables: Record<string, string>): string {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

/**
 * Parse Postman body
 */
function parsePostmanBody(body?: PostmanBody, variables?: Record<string, string>): unknown {
  if (!body) return undefined;

  switch (body.mode) {
    case 'raw':
      if (body.options?.raw?.language === 'json' && body.raw) {
        try {
          const rawWithVars = replaceVariables(body.raw, variables || {});
          return JSON.parse(rawWithVars);
        } catch {
          return body.raw;
        }
      }
      return body.raw;

    case 'urlencoded':
      const urlencoded: Record<string, string> = {};
      body.urlencoded?.filter(p => !p.disabled).forEach(p => {
        urlencoded[p.key] = replaceVariables(p.value, variables || {});
      });
      return urlencoded;

    case 'formdata':
      const formdata: Record<string, string> = {};
      body.formdata?.filter(p => !p.disabled && p.type !== 'file').forEach(p => {
        formdata[p.key] = replaceVariables(p.value, variables || {});
      });
      return formdata;

    default:
      return undefined;
  }
}

/**
 * Parse Postman headers
 */
function parsePostmanHeaders(
  headers?: PostmanHeader[],
  variables?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  headers?.filter(h => !h.disabled).forEach(h => {
    result[h.key] = replaceVariables(h.value, variables || {});
  });

  return result;
}

/**
 * Recursively extract requests from Postman items (handles folders)
 */
function extractRequests(
  items: PostmanItem[],
  variables: Record<string, string>,
  folderPath: string = ''
): ConvertedRequest[] {
  const requests: ConvertedRequest[] = [];

  for (const item of items) {
    const currentPath = folderPath ? `${folderPath}/${item.name}` : item.name;

    if (item.item) {
      // This is a folder, recurse
      requests.push(...extractRequests(item.item, variables, currentPath));
    } else if (item.request) {
      // This is a request
      const req = item.request;
      requests.push({
        name: item.name,
        method: req.method,
        url: parsePostmanUrl(req.url, variables),
        headers: parsePostmanHeaders(req.header, variables),
        body: parsePostmanBody(req.body, variables),
        description: req.description || item.description,
        folder: folderPath || undefined,
      });
    }
  }

  return requests;
}

/**
 * Import a Postman Collection file
 */
export async function importPostmanCollection(
  filePath: string,
  variableOverrides?: Record<string, string>
): Promise<ImportPostmanResult> {
  const content = await readFile(filePath, 'utf-8');
  const collection: PostmanCollection = JSON.parse(content);

  // Validate it's a Postman collection
  if (!collection.info?.schema?.includes('postman')) {
    throw new Error('Invalid Postman collection: missing or invalid schema');
  }

  // Extract variables from collection
  const variables: Record<string, string> = {};
  collection.variable?.forEach(v => {
    variables[v.key] = v.value;
  });

  // Apply variable overrides
  if (variableOverrides) {
    Object.assign(variables, variableOverrides);
  }

  // Extract all requests
  const requests = extractRequests(collection.item, variables);

  // Extract unique folders
  const folders = [...new Set(requests.map(r => r.folder).filter(Boolean))] as string[];

  return {
    collectionName: collection.info.name,
    description: collection.info.description,
    requests,
    variables,
    totalRequests: requests.length,
    folders,
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
