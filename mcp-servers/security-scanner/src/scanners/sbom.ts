// SPDX-License-Identifier: MIT
/**
 * SBOM generation (CycloneDX JSON or SPDX JSON) for a directory or an image.
 * Engines: trivy → syft → osv-scanner (directories only).
 *
 * The document is returned inline only when it is small; otherwise pass
 * `outputFile`. Writing is opt-in and never overwrites an existing file
 * unless `overwrite: true`.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { validateFilePath } from '@dev-suite/shared';
import { runTool, stderrTail } from '../utils/exec.js';
import { withTempDir } from '../utils/report-file.js';
import { getTool, unavailableMessage } from '../utils/tool-checker.js';
import { validateScanPath } from '../utils/paths.js';
import { runOsvScanner, runTrivyJson, timeoutMs } from './engines.js';

export interface GenerateSbomInput {
  path?: string;
  image?: string;
  format?: 'cyclonedx' | 'spdx';
  engine?: 'auto' | 'trivy' | 'syft' | 'osv-scanner';
  outputFile?: string;
  overwrite?: boolean;
  maxInlineBytes?: number;
  timeoutSeconds?: number;
}

const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:@+]*$/;

export function validateOutputFile(file: string, overwrite: boolean): string {
  validateFilePath(file);
  const abs = resolve(file);
  if (!isAbsolute(abs)) throw new Error('outputFile must be absolute');
  if (!existsSync(dirname(abs)) || !statSync(dirname(abs)).isDirectory()) {
    throw new Error(`outputFile directory does not exist: ${dirname(abs)}`);
  }
  if (existsSync(abs) && !overwrite) throw new Error(`outputFile already exists: ${abs} (pass overwrite: true to replace it)`);
  return abs;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function summarize(doc: any, format: string): { componentCount: number; sample: string[] } {
  const list: any[] = format === 'cyclonedx' ? doc?.components ?? [] : doc?.packages ?? [];
  return {
    componentCount: list.length,
    sample: list.slice(0, 20).map((c) => `${c.name}${c.version ?? c.versionInfo ? `@${c.version ?? c.versionInfo}` : ''}`),
  };
}

export async function generateSbom(input: GenerateSbomInput): Promise<Record<string, unknown>> {
  const format = input.format ?? 'cyclonedx';
  if (!input.path === !input.image) throw new Error('Pass exactly one of "path" or "image"');
  let target: string;
  if (input.image) {
    if (!IMAGE_RE.test(input.image) || input.image.length > 512) throw new Error(`Invalid image reference: "${input.image}"`);
    target = input.image;
  } else {
    target = validateScanPath(input.path!);
  }
  const outFile = input.outputFile ? validateOutputFile(input.outputFile, input.overwrite ?? false) : undefined;
  const maxInline = Math.min(Math.max(input.maxInlineBytes ?? 200_000, 0), 2_000_000);

  const requested = input.engine ?? 'auto';
  const order = requested === 'auto' ? (['trivy', 'syft', 'osv-scanner'] as const) : ([requested] as const);
  const errors: string[] = [];

  for (const e of order) {
    if (e === 'osv-scanner' && input.image) {
      errors.push('osv-scanner: cannot build an SBOM for an image');
      continue;
    }
    const t = await getTool(e);
    if (!t.available || !t.command) {
      errors.push(unavailableMessage(e, t));
      continue;
    }
    try {
      const raw = await withTempDir(async (dir) => {
        if (e === 'trivy') {
          const fmt = format === 'cyclonedx' ? 'cyclonedx' : 'spdx-json';
          const r = await runTrivyJson(input.image ? 'image' : 'fs', input.image ? [] : ['--skip-dirs', '**/.git'], target, {
            cwd: input.image ? tmpdir() : statSync(target).isDirectory() ? target : dirname(target),
            timeoutSeconds: input.timeoutSeconds,
            format: fmt,
          });
          return r.raw;
        }
        if (e === 'syft') {
          const file = join(dir, 'sbom.json');
          const fmt = format === 'cyclonedx' ? 'cyclonedx-json' : 'spdx-json';
          const src = input.image ? `registry:${target}` : `dir:${target}`;
          const r = await runTool(t.command!, ['scan', src, '-o', `${fmt}=${file}`, '-q'], {
            cwd: input.image ? tmpdir() : target,
            timeoutMs: timeoutMs(input.timeoutSeconds),
          }, 'syft');
          if (r.exitCode !== 0 || !existsSync(file)) throw new Error(`syft exited with ${r.exitCode}: ${stderrTail(r.stderr)}`);
          return readFileSync(file, 'utf8');
        }
        const r = await runOsvScanner(target, [], { timeoutSeconds: input.timeoutSeconds, format: format === 'cyclonedx' ? 'cyclonedx-1-5' : 'spdx-2-3' });
        if (r.noPackages) throw new Error('osv-scanner found no packages');
        return r.raw;
      });
      let doc: unknown;
      try {
        doc = JSON.parse(raw);
      } catch {
        throw new Error(`${e} produced an SBOM that is not valid JSON`);
      }
      const { componentCount, sample } = summarize(doc, format);
      let written: string | undefined;
      if (outFile) {
        writeFileSync(outFile, raw, { flag: input.overwrite ? 'w' : 'wx' });
        written = outFile;
      }
      const inline = Buffer.byteLength(raw) <= maxInline;
      return {
        status: 'ok',
        engine: e,
        engineVersion: t.version,
        format: format === 'cyclonedx' ? 'CycloneDX JSON' : 'SPDX JSON',
        target: input.image ?? target,
        componentCount,
        componentSample: sample,
        bytes: Buffer.byteLength(raw),
        outputFile: written,
        document: inline ? doc : undefined,
        truncated: !inline,
        note: inline || written ? undefined : `SBOM is ${Buffer.byteLength(raw)} bytes (inline limit ${maxInline}); pass outputFile to save the full document`,
        warnings: errors.length ? errors : undefined,
      };
    } catch (err) {
      errors.push(`${e}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { status: errors.every((m) => /not available/.test(m)) ? 'unavailable' : 'failed', error: errors.join('; ') };
}
