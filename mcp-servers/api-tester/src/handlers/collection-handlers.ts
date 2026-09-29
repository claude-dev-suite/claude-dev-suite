// SPDX-License-Identifier: MIT
/** import_collection and export_collection. */

import { z } from 'zod';
import { importAny, type ImportedRequest } from '../importers/index.js';
import { exportPostman, exportHttpFile } from '../exporters/index.js';
import { substituteDeep, referencedVariables } from '../vars/substitute.js';
import { upsertEnvironment } from '../vars/environments.js';
import { Redactor, isSensitiveKey } from '../util/redact.js';
import { resolveWritableProjectFile, writeFileAtomic } from '../util/paths.js';
import { truncateText } from '../util/limits.js';
import { RequestFields } from '../http/executor.js';
import { jsonResponse, type Handler } from './types.js';

export const ImportCollectionSchema = z.object({
  filePath: z.string().describe('Absolute path: collection file, .http/.rest file, HAR, spec, or a Bruno collection directory'),
  format: z.enum(['postman', 'insomnia', 'bruno', 'http', 'har', 'openapi']).optional().describe('Auto-detected if omitted'),
  environmentFile: z.string().optional().describe('Postman environment JSON / http-client.env.json (absolute path)'),
  environmentName: z.string().optional().describe('Environment inside the source (Insomnia sub-env, Bruno env, JetBrains env)'),
  variables: z.record(z.string(), z.string()).optional().describe('Override collection/environment variables'),
  substitute: z.boolean().optional().describe('Substitute non-secret variables into requests (default true)'),
  saveAsEnvironment: z
    .string()
    .optional()
    .describe('Store the imported variables (secrets as secrets) in this project environment'),
  folder: z.string().optional().describe('Only requests in this folder (prefix match)'),
  includeCookies: z.boolean().optional().describe('HAR: keep captured Cookie headers'),
  limit: z.number().int().min(1).max(1000).optional().describe('Max requests returned (default 100)'),
  offset: z.number().int().min(0).optional(),
});

export const handleImportCollection: Handler = async (args) => {
  const input = ImportCollectionSchema.parse(args);
  const result = await importAny(input.filePath, {
    format: input.format,
    environmentFile: input.environmentFile,
    environmentName: input.environmentName,
    includeCookies: input.includeCookies,
  });

  // Merge order: collection/environment < caller overrides — BEFORE any substitution.
  const variables: Record<string, unknown> = { ...result.variables, ...(input.variables ?? {}) };
  const secretNames = new Set([
    ...result.secretKeys,
    ...Object.keys(variables).filter((k) => isSensitiveKey(k)),
  ]);
  const redactor = new Redactor();
  for (const k of secretNames) redactor.add(variables[k]);

  let requests: ImportedRequest[] = result.requests;
  if (input.folder) requests = requests.filter((r) => (r.folder ?? '').startsWith(input.folder!));

  // Secret variables stay as {{templates}} so their values never appear in output.
  const publicVars = Object.fromEntries(Object.entries(variables).filter(([k]) => !secretNames.has(k)));
  const substituted = input.substitute === false ? requests : requests.map((r) => substituteDeep(r, publicVars).value);

  const referenced = new Set(referencedVariables(substituted));
  const unresolved = [...referenced].filter((n) => !(n in variables) && !secretNames.has(n));
  const needsSecret = [...referenced].filter((n) => secretNames.has(n));

  // Literal credentials inside auth blocks are masked in the output.
  let maskedLiterals = 0;
  const safeRequests = substituted.map((r) => {
    if (!r.auth) return r;
    const auth = { ...r.auth } as Record<string, unknown>;
    for (const k of ['token', 'password', 'value', 'clientSecret']) {
      const v = auth[k];
      if (typeof v === 'string' && v && !/^\{\{.*\}\}$/.test(v.trim())) {
        redactor.add(v);
        auth[k] = '***';
        maskedLiterals++;
      }
    }
    return { ...r, auth: auth as ImportedRequest['auth'] };
  });

  let savedEnvironment: unknown;
  if (input.saveAsEnvironment) {
    const plain: Record<string, unknown> = {};
    const secrets: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (secretNames.has(k)) secrets[k] = String(v ?? '');
      else plain[k] = v;
    }
    let created = true;
    try {
      savedEnvironment = await upsertEnvironment(input.saveAsEnvironment, { variables: plain, secrets, create: true });
    } catch {
      created = false;
    }
    if (!created) savedEnvironment = await upsertEnvironment(input.saveAsEnvironment, { variables: plain, secrets });
  }

  const offset = input.offset ?? 0;
  const limit = input.limit ?? 100;
  const page = safeRequests.slice(offset, offset + limit).map((r) => ({
    ...r,
    // Keep each item directly usable as a batch_request entry.
    body: typeof r.body === 'string' ? truncateText(r.body, 20_000).text : r.body,
  }));
  const folders = [...new Set(result.requests.map((r) => r.folder).filter(Boolean))];

  const warnings = [...result.warnings];
  if (maskedLiterals) {
    warnings.push(`${maskedLiterals} literal credential(s) in auth blocks were masked; store them as environment secrets and reference {{variables}}`);
  }
  if (needsSecret.length && !input.saveAsEnvironment) {
    warnings.push(`Requests reference secret variables (${needsSecret.join(', ')}); pass saveAsEnvironment to store them, or supply them at request time`);
  }

  const maskedVars = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, secretNames.has(k) ? '***' : v]));
  return jsonResponse(
    redactor.scrub({
      format: result.format,
      name: result.name,
      // Back-compat keys
      collection: result.format === 'postman' ? result.name : undefined,
      workspace: result.format.startsWith('insomnia') ? result.name : undefined,
      description: result.description,
      totalRequests: requests.length,
      folders,
      environments: result.environments,
      variables: maskedVars,
      secretVariables: [...secretNames].filter((k) => k in variables),
      unresolvedVariables: unresolved,
      savedEnvironment,
      warnings: warnings.slice(0, 50),
      batchRequests: page,
      offset,
      returned: page.length,
      truncated: offset + page.length < safeRequests.length,
      nextOffset: offset + page.length < safeRequests.length ? offset + page.length : undefined,
    })
  );
};

// ---------------------------------------------------------------------------

const ExportRequestSchema = z.object({
  name: z.string(),
  folder: z.string().optional(),
  description: z.string().optional(),
  method: RequestFields.method,
  url: z.string(),
  query: RequestFields.query,
  headers: RequestFields.headers,
  body: RequestFields.body,
  bodyType: RequestFields.bodyType,
  files: RequestFields.files,
  bodyFile: RequestFields.bodyFile,
  contentType: RequestFields.contentType,
  auth: RequestFields.auth,
});

export const ExportCollectionSchema = z.object({
  format: z.enum(['postman', 'http']).describe('Postman v2.1 JSON or .http (REST Client / JetBrains)'),
  requests: z.array(ExportRequestSchema).max(2000).optional().describe('Requests to export (batch_request shape)'),
  sourcePath: z.string().optional().describe('Or: convert any importable file/directory (absolute path)'),
  sourceFormat: z.enum(['postman', 'insomnia', 'bruno', 'http', 'har', 'openapi']).optional(),
  name: z.string().optional().describe('Collection name'),
  variables: z.record(z.string(), z.string()).optional().describe('Collection variables to include'),
  outputPath: z.string().optional().describe('Write to this file inside the project instead of returning it'),
  overwrite: z.boolean().optional().describe('Replace outputPath if it exists'),
  maxChars: z.number().int().min(1000).max(2_000_000).optional().describe('Returned content cap (default 100000)'),
});

export const handleExportCollection: Handler = async (args) => {
  const input = ExportCollectionSchema.parse(args);
  let requests: ImportedRequest[];
  let name = input.name;
  let variables: Record<string, unknown> = { ...(input.variables ?? {}) };
  const warnings: string[] = [];

  if (input.requests && input.sourcePath) throw new Error('Pass either requests or sourcePath, not both');
  if (input.requests) {
    requests = input.requests as ImportedRequest[];
  } else if (input.sourcePath) {
    const imported = await importAny(input.sourcePath, { format: input.sourceFormat });
    requests = imported.requests;
    name = name ?? imported.name;
    // Never write secret values into an exported file.
    const secret = new Set([...imported.secretKeys, ...Object.keys(imported.variables).filter((k) => isSensitiveKey(k))]);
    variables = {
      ...Object.fromEntries(Object.entries(imported.variables).map(([k, v]) => [k, secret.has(k) ? '' : v])),
      ...variables,
    };
    if (secret.size) warnings.push(`Secret variable values were blanked in the export: ${[...secret].join(', ')}`);
    warnings.push(...imported.warnings);
  } else {
    throw new Error('Pass `requests` or `sourcePath`');
  }

  const collectionName = name ?? 'API collection';
  const content =
    input.format === 'postman'
      ? JSON.stringify(exportPostman(collectionName, requests, variables, warnings), null, 2)
      : exportHttpFile(requests, variables, warnings);

  if (input.outputPath) {
    const target = await resolveWritableProjectFile(input.outputPath, input.overwrite === true);
    await writeFileAtomic(target.path, content);
    return jsonResponse({
      format: input.format,
      written: target.path,
      replaced: target.exists,
      requests: requests.length,
      bytes: Buffer.byteLength(content),
      warnings,
    });
  }
  const t = truncateText(content, input.maxChars ?? 100_000);
  return jsonResponse({
    format: input.format,
    requests: requests.length,
    content: t.text,
    truncated: t.truncated,
    totalChars: t.totalChars,
    ...(t.truncated ? { hint: 'Pass outputPath to write the full export to a file' } : {}),
    warnings,
  });
};
