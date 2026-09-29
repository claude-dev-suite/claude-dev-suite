// SPDX-License-Identifier: MIT
/**
 * docker_compose — Compose v2 (`docker compose`), falling back to a standalone
 * `docker-compose` binary when the plugin is absent.
 *
 * Every action targets an explicit project: `projectDir` becomes the process
 * cwd (and --project-directory when files live elsewhere), `files` become -f,
 * plus -p / --profile / --env-file. Without projectDir the server's cwd — the
 * project it was launched for — is used, never an implicit inherited one.
 */

import { getConfig } from "../lib/config.js";
import { DockerError, classifyFailure, isDaemonUnavailable, runDocker, type RunDockerOptions } from "../lib/exec.js";
import { filterLines, parseJson, parseJsonLines, scrubRow } from "../lib/parse.js";
import { resolveHostPath } from "../lib/paths.js";
import { redactComposeConfig, scrubUrlCredentials } from "../lib/redact.js";
import { ComposeActionSchema, defineHandler, required } from "./types.js";
import { summarizeLabels } from "./containers.js";
import type { z } from "zod";

type ComposeInput = z.output<typeof ComposeActionSchema>;

export interface ComposeVariant {
  kind: "plugin" | "standalone";
  bin: string;
  version?: string;
}

const variantCache = new Map<string, ComposeVariant>();

export function resetComposeVariantCache(): void {
  variantCache.clear();
}

/** Detect `docker compose` (v2 plugin) or fall back to `docker-compose`. Cached per context. */
export async function detectCompose(context?: string): Promise<ComposeVariant> {
  const key = context ?? "";
  const cached = variantCache.get(key);
  if (cached) return cached;
  const cfg = getConfig();

  const plugin = await runDocker(["compose", "version", "--short"], { context, allowNonZero: true, timeoutMs: 15_000 });
  if (plugin.exitCode === 0) {
    const v: ComposeVariant = { kind: "plugin", bin: cfg.cli, version: plugin.stdout.trim() };
    variantCache.set(key, v);
    return v;
  }
  try {
    const standalone = await runDocker(["version", "--short"], { bin: "docker-compose", allowNonZero: true, timeoutMs: 15_000 });
    if (standalone.exitCode === 0) {
      const v: ComposeVariant = { kind: "standalone", bin: "docker-compose", version: standalone.stdout.trim() };
      variantCache.set(key, v);
      return v;
    }
  } catch (e) {
    if (!(e instanceof DockerError && e.code === "DOCKER_CLI_NOT_FOUND")) throw e;
  }
  throw new DockerError(
    "DOCKER_CLI_NOT_FOUND",
    `Docker Compose is not available: '${cfg.cli} compose' failed (${plugin.stderr.trim().slice(0, 300)}) and no 'docker-compose' binary was found.`,
  );
}

/** Build the project-selection flags and cwd shared by every project-scoped action. */
export function composeProjectArgs(input: ComposeInput): { globalArgs: string[]; cwd: string } {
  const cfg = getConfig();
  const cwd = input.projectDir ? resolveHostPath(input.projectDir, "projectDir") : cfg.allowedRoots[0];
  const globalArgs: string[] = [];
  for (const f of input.files ?? []) globalArgs.push("-f", resolveHostPath(f, "compose file"));
  if (input.projectDir && input.files?.length) globalArgs.push("--project-directory", cwd);
  if (input.projectName) globalArgs.push("-p", input.projectName);
  for (const p of input.profiles ?? []) globalArgs.push("--profile", p);
  if (input.envFile) globalArgs.push("--env-file", resolveHostPath(input.envFile, "envFile"));
  return { globalArgs, cwd };
}

function servicesOf(input: ComposeInput): string[] {
  return [...(input.service ? [input.service] : []), ...(input.services ?? [])];
}

export const handleDockerCompose = defineHandler(ComposeActionSchema, async (input) => {
  const cfg = getConfig();
  const variant = await detectCompose(input.context);
  const { globalArgs, cwd } = composeProjectArgs(input);
  const services = servicesOf(input);

  const run = (sub: string[], opts: RunDockerOptions = {}) => {
    const base = variant.kind === "plugin" ? ["compose", ...globalArgs] : [...globalArgs];
    return runDocker([...base, ...sub], {
      cwd,
      bin: variant.bin,
      context: variant.kind === "plugin" ? input.context : undefined,
      extraEnv: variant.kind === "standalone" && input.context ? { DOCKER_CONTEXT: input.context } : undefined,
      maxBytes: input.maxBytes,
      ...opts,
    });
  };
  const meta = {
    action: input.action,
    projectDir: cwd,
    projectName: input.projectName,
    services: services.length ? services : "all",
    compose: `${variant.kind}${variant.version ? ` ${variant.version}` : ""}`,
  };
  const longTimeout = input.timeoutMs ?? cfg.longTimeoutMs;
  const short = input.timeoutMs ?? cfg.timeoutMs;
  const tailText = (s: string) => s.trim().slice(-8000) || undefined;

  switch (input.action) {
    case "up": {
      const sub = ["up"];
      if (input.detach) sub.push("--detach");
      if (input.build) sub.push("--build");
      if (input.forceRecreate) sub.push("--force-recreate");
      if (input.removeOrphans) sub.push("--remove-orphans");
      if (input.noDeps) sub.push("--no-deps");
      if (input.wait) {
        if (!input.detach) throw new DockerError("INVALID_ARGUMENT", "'wait' requires detach: true");
        sub.push("--wait");
        if (input.waitTimeoutSeconds) sub.push("--wait-timeout", String(input.waitTimeoutSeconds));
      }
      sub.push(...services);
      const res = await run(sub, { timeoutMs: longTimeout, keep: "tail" });
      return { ...meta, success: true, output: tailText(res.stdout + "\n" + res.stderr), truncated: res.stderrTruncated };
    }
    case "down": {
      const sub = ["down"];
      if (input.volumes) sub.push("--volumes");
      if (input.removeOrphans) sub.push("--remove-orphans");
      if (input.stopTimeout !== undefined) sub.push("--timeout", String(input.stopTimeout));
      sub.push(...services);
      const res = await run(sub, { timeoutMs: longTimeout, keep: "tail" });
      return { ...meta, success: true, volumesRemoved: input.volumes, output: tailText(res.stdout + "\n" + res.stderr) };
    }
    case "ps": {
      const sub = ["ps", "--format", "json"];
      if (input.all) sub.push("--all");
      sub.push(...services);
      const res = await run(sub, { timeoutMs: short, maxBytes: 16 * 1024 * 1024 });
      const containers = parseJsonLines(res.stdout).map((r) => summarizeLabels(scrubRow(r), false));
      return { ...meta, containers, count: containers.length };
    }
    case "logs": {
      const sub = ["logs", "--no-color", `--tail=${input.tail}`];
      if (input.since) sub.push(`--since=${input.since}`);
      if (input.until) sub.push(`--until=${input.until}`);
      if (input.timestamps) sub.push("--timestamps");
      if (input.followSeconds) sub.push("--follow");
      sub.push(...services);
      const res = await run(sub, {
        keep: "tail",
        timeoutMs: input.followSeconds ? input.followSeconds * 1000 : short,
        allowTimeout: Boolean(input.followSeconds),
      });
      const out = filterLines(scrubUrlCredentials(res.stdout), input.grep, input.grepIgnoreCase);
      const err = filterLines(scrubUrlCredentials(res.stderr), input.grep, input.grepIgnoreCase);
      return {
        ...meta,
        output: out.text,
        stderr: err.text || undefined,
        matchedLines: input.grep ? (out.matched ?? 0) + (err.matched ?? 0) : undefined,
        truncated: res.stdoutTruncated || res.stderrTruncated,
        followedSeconds: input.followSeconds,
      };
    }
    case "build": {
      const sub = ["build"];
      if (input.noCache) sub.push("--no-cache");
      sub.push(...services);
      const res = await run(sub, { timeoutMs: longTimeout, keep: "tail" });
      return { ...meta, success: true, output: tailText(res.stdout + "\n" + res.stderr), truncated: res.stdoutTruncated || res.stderrTruncated };
    }
    case "pull": {
      const res = await run(["pull", ...services], { timeoutMs: longTimeout, keep: "tail" });
      return { ...meta, success: true, output: tailText(res.stdout + "\n" + res.stderr) };
    }
    case "restart":
    case "stop": {
      const sub: string[] = [input.action];
      if (input.stopTimeout !== undefined) sub.push("--timeout", String(input.stopTimeout));
      sub.push(...services);
      const res = await run(sub, { timeoutMs: longTimeout });
      return { ...meta, success: true, output: tailText(res.stdout + "\n" + res.stderr) };
    }
    case "start": {
      const res = await run(["start", ...services], { timeoutMs: longTimeout });
      return { ...meta, success: true, output: tailText(res.stdout + "\n" + res.stderr) };
    }
    case "exec":
    case "run": {
      const service = required(services[0], "service");
      if (services.length > 1) throw new DockerError("INVALID_ARGUMENT", `${input.action} takes exactly one service`);
      const sub: string[] = [input.action, "-T"];
      if (input.action === "run") {
        if (input.rm) sub.push("--rm");
        if (input.noDeps) sub.push("--no-deps");
      }
      if (input.user) sub.push("--user", input.user);
      if (input.workdir) sub.push("--workdir", input.workdir);
      for (const [k, v] of Object.entries(input.env ?? {})) sub.push("-e", `${k}=${v}`);
      sub.push(service, ...(input.command ?? []));
      if (input.action === "exec" && !input.command?.length) {
        throw new DockerError("INVALID_ARGUMENT", "'command' is required for exec");
      }
      const res = await run(sub, {
        timeoutMs: input.timeoutMs ?? (input.action === "run" ? cfg.longTimeoutMs : cfg.timeoutMs),
        keep: "tail",
        allowNonZero: true,
        secrets: Object.values(input.env ?? {}),
      });
      if (res.exitCode !== 0 && (isDaemonUnavailable(res.stderr) || /service .* is not running|no such service|no container found/i.test(res.stderr))) {
        throw classifyFailure(res);
      }
      return {
        ...meta,
        service,
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        truncated: res.stdoutTruncated || res.stderrTruncated,
      };
    }
    case "config": {
      if (input.validateOnly) {
        const res = await run(["config", "--quiet"], { timeoutMs: short, allowNonZero: true });
        if (res.exitCode !== 0 && isDaemonUnavailable(res.stderr)) throw classifyFailure(res);
        return { ...meta, valid: res.exitCode === 0, errors: res.exitCode === 0 ? undefined : res.stderr.trim().slice(-4000) };
      }
      const res = await run(["config", "--format", "json"], { timeoutMs: short, maxBytes: 8 * 1024 * 1024 });
      const doc = parseJson(res.stdout, "compose config");
      return { ...meta, valid: true, config: redactComposeConfig(doc, input.revealEnv), envRedacted: !input.revealEnv };
    }
    case "top": {
      const res = await run(["top", ...services], { timeoutMs: short });
      return { ...meta, output: scrubUrlCredentials(res.stdout), truncated: res.stdoutTruncated };
    }
    case "images": {
      const res = await run(["images", "--format", "json", ...services], { timeoutMs: short });
      return { ...meta, images: parseJsonLines(res.stdout) };
    }
    case "ls": {
      // Not project-scoped: list every compose project the daemon knows about.
      const base = variant.kind === "plugin" ? ["compose", "ls", "--format", "json"] : ["ls", "--format", "json"];
      if (input.all) base.push("--all");
      const res = await runDocker(base, {
        cwd,
        bin: variant.bin,
        context: variant.kind === "plugin" ? input.context : undefined,
        timeoutMs: short,
      });
      const projects = parseJsonLines(res.stdout);
      return { action: "ls", compose: meta.compose, projects, count: projects.length };
    }
  }
});
