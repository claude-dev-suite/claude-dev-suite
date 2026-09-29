// SPDX-License-Identifier: MIT
/**
 * Read a file as it was at a git revision (`git show <ref>:<path>`), so a
 * spec can be diffed against main, a tag or HEAD~1 without a checkout.
 *
 * `execFile` with an argument array, no shell, an explicit cwd, a timeout and
 * an output cap. The ref is validated so it can never be read as an option.
 */

import { execFile } from "child_process";
import { realpathSync } from "fs";
import { relative, sep } from "path";
import { getSettings } from "./env.js";
import { projectRoot, resolveProjectPath } from "./location.js";

export type ExecFileFn = (
  file: string,
  args: string[],
  opts: { cwd: string; timeout: number; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFileFn = (file, args, opts) =>
  new Promise((resolvePromise, reject) => {
    execFile(file, args, { ...opts, shell: false, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const e = error as NodeJS.ErrnoException & { stderr?: string };
        e.stderr = String(stderr ?? "");
        reject(e);
        return;
      }
      resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

let execImpl: ExecFileFn = defaultExec;

export function setGitExec(fn: ExecFileFn): () => void {
  const prev = execImpl;
  execImpl = fn;
  return () => {
    execImpl = prev;
  };
}

const SAFE_REF = /^[A-Za-z0-9._/~^@{}+-]+$/;

export function validateGitRef(ref: string): string {
  const r = ref.trim();
  if (!r || r.startsWith("-") || !SAFE_REF.test(r) || r.includes("..")) {
    // ".." is allowed in git range syntax but meaningless for `git show ref:path`.
    throw new Error(`Invalid git ref "${ref}": use a branch, tag, commit or rev like HEAD~1`);
  }
  return r;
}

function gitError(error: unknown): Error {
  const e = error as NodeJS.ErrnoException & { stderr?: string };
  if (e.code === "ENOENT") return new Error("git is not installed or not on PATH; git-ref diffs are unavailable");
  const detail = (e.stderr || e.message || String(error)).trim().split("\n")[0];
  return new Error(`git failed: ${detail}`);
}

let repoRootCache: { cwd: string; root: string } | undefined;

export async function gitRepoRoot(): Promise<string> {
  const cwd = projectRoot();
  if (repoRootCache?.cwd === cwd) return repoRootCache.root;
  const settings = getSettings();
  try {
    const { stdout } = await execImpl("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      timeout: settings.timeoutMs,
      maxBuffer: 64 * 1024,
    });
    let root = stdout.trim();
    try {
      root = realpathSync.native(root);
    } catch {
      /* keep git's spelling */
    }
    repoRootCache = { cwd, root };
    return root;
  } catch (error) {
    throw gitError(error);
  }
}

/** Convert a project path into the repo-relative POSIX path git expects. */
export async function toRepoPath(pathInput: string): Promise<{ repoRoot: string; repoPath: string }> {
  const abs = resolveProjectPath(pathInput);
  const repoRoot = await gitRepoRoot();
  const rel = relative(repoRoot, abs);
  if (rel.startsWith("..")) throw new Error(`"${pathInput}" is not inside the git repository`);
  return { repoRoot, repoPath: rel.split(sep).join("/") };
}

export async function gitShow(ref: string, repoPath: string, repoRoot: string): Promise<string> {
  const safeRef = validateGitRef(ref);
  if (repoPath.includes("\0") || repoPath.startsWith("-")) throw new Error(`Invalid repository path "${repoPath}"`);
  const settings = getSettings();
  try {
    const { stdout } = await execImpl("git", ["show", `${safeRef}:${repoPath}`], {
      cwd: repoRoot,
      timeout: settings.timeoutMs,
      maxBuffer: settings.maxSpecBytes,
    });
    return stdout;
  } catch (error) {
    throw gitError(error);
  }
}
