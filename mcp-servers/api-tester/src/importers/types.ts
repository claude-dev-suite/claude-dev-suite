// SPDX-License-Identifier: MIT
/** The shape every importer produces: requests ready for batch_request / run_scenario. */

import type { AuthSpec } from '../http/auth.js';
import type { BodyType, MultipartFile } from '../http/body.js';

export interface ImportedRequest {
  name: string;
  folder?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: unknown;
  bodyType?: BodyType;
  contentType?: string;
  files?: MultipartFile[];
  bodyFile?: string;
  auth?: AuthSpec;
  description?: string;
}

export interface ImportResult {
  format: string;
  name: string;
  description?: string;
  requests: ImportedRequest[];
  /** Variables defined by the collection/environment (collection < environment). */
  variables: Record<string, unknown>;
  /** Variable names the source marks as secret. */
  secretKeys: string[];
  /** Environments the source defines (select one with `environmentName`). */
  environments?: string[];
  warnings: string[];
}

export interface ImportOptions {
  /** Environment file (Postman env, http-client.env.json) or env name inside the source. */
  environmentFile?: string;
  environmentName?: string;
}

export function headerListToRecord(
  list: Array<{ key?: string; name?: string; value?: unknown; disabled?: boolean; enabled?: boolean }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of list ?? []) {
    if (h.disabled === true || h.enabled === false) continue;
    const k = h.key ?? h.name;
    if (!k) continue;
    out[k] = h.value === undefined || h.value === null ? '' : String(h.value);
  }
  return out;
}

export function normaliseMethod(m: unknown, warnings: string[], name: string): string {
  const method = String(m ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    warnings.push(`"${name}": method ${method} is not supported by the request tools`);
  }
  return method;
}
