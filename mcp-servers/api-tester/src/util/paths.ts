// SPDX-License-Identifier: MIT
/**
 * Filesystem boundaries.
 *
 * Two different rules apply, on purpose:
 *  - Files that are only PARSED (specs, collections) must be absolute, which is
 *    the long-standing rule every server shares.
 *  - Files whose BYTES leave the machine (multipart uploads, `bodyFile`) or that
 *    the server WRITES (exports, generated tests, environments) must also resolve
 *    — symlinks included — inside the project directory. Otherwise a prompt could
 *    make the model upload `~/.ssh/id_rsa` to an arbitrary endpoint.
 */

import { realpath, stat, writeFile, mkdir, rename } from 'fs/promises';
import { dirname, isAbsolute, resolve, sep, basename, join } from 'path';
import { validateFilePath } from '@dev-suite/shared';

/** The project the server works for: explicit override, then Claude Code's, then cwd. */
export function projectDir(): string {
  return resolve(
    process.env.API_TESTER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  );
}

/** Absolute-path + null-byte check for files that are only parsed. */
export function requireAbsolute(filePath: string): string {
  validateFilePath(filePath);
  return resolve(filePath);
}

function isInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

async function realRoot(): Promise<string> {
  const root = projectDir();
  try {
    return await realpath(root);
  } catch {
    return root;
  }
}

/**
 * Resolve a file that will be read and SENT somewhere. Relative paths resolve
 * against the project directory; the real path must stay inside it.
 */
export async function resolveReadableProjectFile(filePath: string): Promise<string> {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
    throw new Error('Invalid file path');
  }
  const root = await realRoot();
  const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(projectDir(), filePath);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }
  if (!isInside(real, root)) {
    throw new Error(
      `File ${filePath} is outside the project directory (${root}). Only project files can be uploaded; ` +
        'set API_TESTER_PROJECT_DIR to change the project root.'
    );
  }
  const st = await stat(real);
  if (!st.isFile()) throw new Error(`Not a regular file: ${filePath}`);
  return real;
}

/**
 * Resolve a destination the server will WRITE. It must be inside the project
 * (checked against the real path of its nearest existing ancestor, so a
 * symlinked directory cannot redirect the write), and an existing file is only
 * replaced when `overwrite` is true.
 */
export async function resolveWritableProjectFile(
  filePath: string,
  overwrite: boolean
): Promise<{ path: string; exists: boolean }> {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
    throw new Error('Invalid output path');
  }
  const root = await realRoot();
  const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(projectDir(), filePath);

  // Walk up to the nearest existing ancestor and resolve its real path.
  let ancestor = dirname(candidate);
  const tail: string[] = [basename(candidate)];
  for (;;) {
    try {
      const real = await realpath(ancestor);
      const full = join(real, ...tail);
      if (!isInside(full, root)) {
        throw new Error(`Output path ${filePath} is outside the project directory (${root})`);
      }
      let exists = false;
      try {
        const st = await stat(full);
        if (st.isDirectory()) throw new Error(`Output path is a directory: ${filePath}`);
        exists = true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (exists && !overwrite) {
        throw new Error(`Refusing to overwrite existing file ${filePath}; pass overwrite: true to replace it`);
      }
      return { path: full, exists };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        const parent = dirname(ancestor);
        if (parent === ancestor) throw new Error(`Cannot resolve output path ${filePath}`);
        tail.unshift(basename(ancestor));
        ancestor = parent;
        continue;
      }
      throw e;
    }
  }
}

/** Atomic write (temp file + rename) creating parent directories. */
export async function writeFileAtomic(path: string, content: string | Buffer, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, mode !== undefined ? { mode } : undefined);
  await rename(tmp, path);
}
