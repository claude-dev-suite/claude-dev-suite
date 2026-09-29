// SPDX-License-Identifier: MIT
/**
 * Host-side path confinement.
 *
 * Paths the model passes for the HOST side of an operation — `cp` source or
 * destination, a build context, a compose project directory or file, an env
 * file, a bind-mount source, an image archive — must resolve inside one of
 * DOCKER_MCP_ALLOWED_ROOTS (default: the server's working directory, i.e. the
 * project). Relative paths resolve against the first root. Symlinks are
 * resolved on the longest existing prefix so a link cannot point outside.
 */

import * as fs from "fs";
import * as path from "path";
import { assertWithinRoot } from "@dev-suite/shared";
import { getConfig } from "./config.js";
import { DockerError } from "./exec.js";

function realpathOfExistingPrefix(p: string): string {
  let current = p;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(current);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

function realRoot(root: string): string {
  try {
    return fs.realpathSync.native(root);
  } catch {
    return root;
  }
}

/** Resolve a caller-supplied host path and require it to sit inside an allowed root. */
export function resolveHostPath(input: string, what = "path"): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new DockerError("INVALID_ARGUMENT", `${what} must be a non-empty string`);
  }
  if (input.includes("\0")) {
    throw new DockerError("INVALID_ARGUMENT", `${what} contains a null byte`);
  }
  const { allowedRoots } = getConfig();
  const resolved = path.resolve(allowedRoots[0], input);
  const real = realpathOfExistingPrefix(resolved);
  for (const root of allowedRoots) {
    try {
      assertWithinRoot(resolved, root);
      assertWithinRoot(real, realRoot(root));
      return resolved;
    } catch {
      /* try the next root */
    }
  }
  throw new DockerError(
    "INVALID_ARGUMENT",
    `${what} '${input}' resolves outside the allowed directories (${allowedRoots.join(", ")}). ` +
      "Set DOCKER_MCP_ALLOWED_ROOTS to widen them.",
  );
}

/** A path string that looks like a host path rather than a named volume. */
export function looksLikeHostPath(source: string): boolean {
  return (
    path.isAbsolute(source) ||
    source.startsWith(".") ||
    source.startsWith("~") ||
    /^[a-zA-Z]:[\\/]/.test(source) ||
    source.includes("/") ||
    source.includes("\\")
  );
}
