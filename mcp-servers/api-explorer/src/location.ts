// SPDX-License-Identifier: MIT
/**
 * Where a document lives, how to name it in a cache, and how a relative
 * `$ref` inside it resolves.
 *
 * Local files are confined to the project root (API_EXPLORER_PROJECT_ROOT or
 * the server's cwd) — after following symlinks, so a link inside the project
 * cannot expose a file outside it. A document fetched over HTTP can only reach
 * other HTTP documents: a remote spec must never be able to read a local file
 * through a `$ref`.
 */

import { existsSync, realpathSync } from "fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { assertWithinRoot } from "@dev-suite/shared";
import { getSettings } from "./env.js";
import { redactUrl } from "./redact.js";

export type Location =
  | { type: "url"; url: string }
  | { type: "file"; path: string }
  | { type: "git"; ref: string; path: string; repoRoot: string };

export function locationKey(loc: Location): string {
  switch (loc.type) {
    case "url": {
      const u = new URL(loc.url);
      u.hash = "";
      return u.toString();
    }
    case "file":
      return `file:${loc.path}`;
    case "git":
      return `git:${loc.ref}:${loc.path}`;
  }
}

/** Human-readable, credential-free description of a location. */
export function describeLocation(loc: Location): string {
  switch (loc.type) {
    case "url":
      return redactUrl(loc.url);
    case "file":
      return relativeToRoot(loc.path);
    case "git":
      return `${loc.ref}:${loc.path}`;
  }
}

export function projectRoot(): string {
  const root = getSettings().projectRoot;
  try {
    return realpathSync.native(root);
  } catch {
    return root;
  }
}

export function relativeToRoot(abs: string): string {
  const rel = relative(projectRoot(), abs);
  return rel === "" ? "." : rel.split(sep).join("/");
}

/**
 * Resolve a caller-supplied path against the project root and refuse anything
 * that escapes it, including via a symlink.
 */
export function resolveProjectPath(input: string, base?: string): string {
  if (typeof input !== "string" || input.length === 0) throw new Error("Path must be a non-empty string");
  if (input.includes("\0")) throw new Error("Path contains a null byte");
  const root = projectRoot();
  const abs = isAbsolute(input) ? resolve(input) : resolve(base ?? root, input);
  const within = () => {
    try {
      return assertWithinRoot(abs, root);
    } catch {
      throw new Error(
        `Path "${input}" is outside the project root (${root}). Set API_EXPLORER_PROJECT_ROOT to widen it.`
      );
    }
  };
  within();
  if (existsSync(abs)) {
    const real = realpathSync.native(abs);
    try {
      assertWithinRoot(real, root);
    } catch {
      throw new Error(`Path "${input}" resolves through a symlink to a location outside the project root`);
    }
    return real;
  }
  return abs;
}

function decodeRefPath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Resolve the document part of a `$ref` against the document containing it. */
export function resolveRefLocation(base: Location, docPart: string): Location {
  if (/^https?:\/\//i.test(docPart)) {
    return { type: "url", url: docPart };
  }
  if (/^file:/i.test(docPart)) {
    if (base.type !== "file") {
      throw new Error(`file: reference "${docPart}" is not allowed from a ${base.type} document`);
    }
    return { type: "file", path: resolveProjectPath(fileURLToPath(docPart)) };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(docPart) && !/^[a-z]:[\\/]/i.test(docPart)) {
    throw new Error(`Unsupported reference scheme in "${docPart}"`);
  }
  switch (base.type) {
    case "url":
      return { type: "url", url: new URL(docPart, base.url).toString() };
    case "file":
      return { type: "file", path: resolveProjectPath(decodeRefPath(docPart), dirname(base.path)) };
    case "git": {
      const joined = posix.normalize(posix.join(posix.dirname(base.path), decodeRefPath(docPart).replace(/\\/g, "/")));
      if (joined.startsWith("..") || posix.isAbsolute(joined)) {
        throw new Error(`Reference "${docPart}" escapes the repository`);
      }
      return { type: "git", ref: base.ref, path: joined, repoRoot: base.repoRoot };
    }
  }
}
