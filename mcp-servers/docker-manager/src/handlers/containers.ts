// SPDX-License-Identifier: MIT
/**
 * Container tools: docker_ps, docker_container, docker_run, docker_exec, docker_cp, docker_stats.
 */

import { getConfig } from "../lib/config.js";
import { DockerError, classifyFailure, isDaemonUnavailable, runDocker } from "../lib/exec.js";
import { filterLines, limitList, parseJson, parseJsonLines, parseTable, scrubRow } from "../lib/parse.js";
import { looksLikeHostPath, resolveHostPath } from "../lib/paths.js";
import { redactInspect, scrubUrlCredentials } from "../lib/redact.js";
import {
  ContainerActionSchema,
  DockerCpSchema,
  DockerExecSchema,
  DockerPsSchema,
  DockerRunSchema,
  DockerStatsSchema,
  defineHandler,
  required,
} from "./types.js";

/** Pull compose project/service out of docker's comma-joined Labels string. */
export function summarizeLabels(row: Record<string, unknown>, includeLabels: boolean): Record<string, unknown> {
  const labels = typeof row.Labels === "string" ? row.Labels : "";
  const project = /(?:^|,)com\.docker\.compose\.project=([^,]*)/.exec(labels)?.[1];
  const service = /(?:^|,)com\.docker\.compose\.service=([^,]*)/.exec(labels)?.[1];
  const out: Record<string, unknown> = { ...row };
  if (!includeLabels) delete out.Labels;
  if (project) out.ComposeProject = project;
  if (service) out.ComposeService = service;
  return out;
}

export const handleDockerPs = defineHandler(DockerPsSchema, async ({ all, filters, includeLabels, limit, context }) => {
  const args = ["ps", "--no-trunc", "--format", "{{json .}}"];
  if (all) args.push("--all");
  const f = filters ?? {};
  for (const s of f.status ?? []) args.push(`--filter=status=${s}`);
  for (const l of f.label ?? []) args.push(`--filter=label=${l}`);
  if (f.name) args.push(`--filter=name=${f.name}`);
  if (f.ancestor) args.push(`--filter=ancestor=${f.ancestor}`);
  if (f.composeProject) args.push(`--filter=label=com.docker.compose.project=${f.composeProject}`);
  if (f.network) args.push(`--filter=network=${f.network}`);
  if (f.health) args.push(`--filter=health=${f.health}`);
  // A status filter other than running implies --all, as it does for the CLI user.
  if (f.status?.some((s) => s !== "running") && !all) args.push("--all");

  const { stdout, stdoutTruncated } = await runDocker(args, { context, maxBytes: 16 * 1024 * 1024 });
  const rows = parseJsonLines(stdout).map((r) => summarizeLabels(scrubRow(r), includeLabels));
  const { items, total, truncated } = limitList(rows, limit);
  return { containers: items, count: items.length, total, truncated: truncated || stdoutTruncated };
});

async function logs(
  container: string,
  opts: {
    tail: number; since?: string; until?: string; timestamps: boolean;
    grep?: string; grepIgnoreCase: boolean; followSeconds?: number; maxBytes?: number; context?: string;
  },
) {
  const args = ["logs", `--tail=${opts.tail}`];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.until) args.push(`--until=${opts.until}`);
  if (opts.timestamps) args.push("--timestamps");
  if (opts.followSeconds) args.push("--follow");
  args.push(container);
  const res = await runDocker(args, {
    context: opts.context,
    keep: "tail",
    maxBytes: opts.maxBytes,
    timeoutMs: opts.followSeconds ? opts.followSeconds * 1000 : undefined,
    allowTimeout: Boolean(opts.followSeconds),
  });
  // Container stdout arrives on the CLI's stdout, container stderr on its stderr.
  const out = filterLines(scrubUrlCredentials(res.stdout), opts.grep, opts.grepIgnoreCase);
  const err = filterLines(scrubUrlCredentials(res.stderr), opts.grep, opts.grepIgnoreCase);
  return {
    stdout: out.text,
    stderr: err.text,
    matchedLines: opts.grep ? (out.matched ?? 0) + (err.matched ?? 0) : undefined,
    truncated: res.stdoutTruncated || res.stderrTruncated,
    followedSeconds: opts.followSeconds,
  };
}

export const handleDockerContainer = defineHandler(ContainerActionSchema, async (input) => {
  const { container, action, context } = input;
  const simple = async (args: string[]) => {
    const res = await runDocker(args, { context });
    return { action, container, success: true, output: res.stdout.trim() || undefined };
  };

  switch (action) {
    case "start":
    case "pause":
    case "unpause":
      return simple([action, container]);
    case "stop":
    case "restart": {
      const args: string[] = [action];
      if (input.stopTimeout !== undefined) args.push(`--time=${input.stopTimeout}`);
      args.push(container);
      const t = input.stopTimeout !== undefined ? (input.stopTimeout + 30) * 1000 : undefined;
      const res = await runDocker(args, { context, timeoutMs: t && Math.max(t, getConfig().timeoutMs) });
      return { action, container, success: true, output: res.stdout.trim() || undefined };
    }
    case "kill":
      return simple(["kill", `--signal=${input.signal ?? "KILL"}`, container]);
    case "remove": {
      const args = ["rm"];
      if (input.force) args.push("--force");
      if (input.removeVolumes) args.push("--volumes");
      args.push(container);
      return { ...(await simple(args)), force: input.force, removedVolumes: input.removeVolumes };
    }
    case "rename":
      return { ...(await simple(["rename", container, required(input.newName, "newName")])), newName: input.newName };
    case "logs":
      return { action, container, ...(await logs(container, input)) };
    case "inspect": {
      const res = await runDocker(["container", "inspect", container], { context, maxBytes: 8 * 1024 * 1024 });
      const doc = parseJson<unknown[]>(res.stdout, "docker inspect output");
      return {
        action,
        container,
        output: redactInspect(Array.isArray(doc) && doc.length === 1 ? doc[0] : doc, input.revealEnv),
        envRedacted: !input.revealEnv,
      };
    }
    case "top": {
      const res = await runDocker(["top", container], { context });
      return { action, container, processes: parseTable(res.stdout).map(scrubRow) };
    }
    case "port": {
      const res = await runDocker(["port", container], { context });
      const ports = res.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
        const [containerPort, host] = line.split(" -> ");
        return { containerPort: containerPort?.trim(), host: host?.trim() };
      });
      return { action, container, ports };
    }
    case "diff": {
      const res = await runDocker(["diff", container], { context });
      const kinds: Record<string, string> = { A: "added", C: "changed", D: "deleted" };
      const all = res.stdout.split(/\r?\n/).filter(Boolean).map((line) => ({
        kind: kinds[line[0]] ?? line[0],
        path: line.slice(2),
      }));
      const { items, total, truncated } = limitList(all, 1000);
      return { action, container, changes: items, total, truncated: truncated || res.stdoutTruncated };
    }
    case "wait": {
      const timeout = input.waitTimeoutMs ?? getConfig().timeoutMs;
      const res = await runDocker(["wait", container], { context, timeoutMs: timeout, allowTimeout: true });
      if (res.timedOut) return { action, container, exited: false, waitedMs: timeout };
      return { action, container, exited: true, exitCode: Number.parseInt(res.stdout.trim(), 10) };
    }
    case "health": {
      const res = await runDocker(["container", "inspect", "--format", "{{json .State}}", container], { context });
      const state = parseJson<Record<string, unknown>>(res.stdout.trim(), "container state");
      const health = state.Health as { Status?: string; FailingStreak?: number; Log?: Array<Record<string, unknown>> } | undefined;
      return {
        action,
        container,
        status: state.Status,
        running: state.Running,
        exitCode: state.ExitCode,
        startedAt: state.StartedAt,
        restarting: state.Restarting,
        oomKilled: state.OOMKilled,
        health: health
          ? {
              status: health.Status,
              failingStreak: health.FailingStreak,
              log: (health.Log ?? []).slice(-5).map((l) => ({
                ...l,
                Output: typeof l.Output === "string" ? scrubUrlCredentials(l.Output).slice(-2000) : l.Output,
              })),
            }
          : { status: "none", note: "The container defines no HEALTHCHECK" },
      };
    }
    case "stats": {
      const res = await runDocker(["stats", "--no-stream", "--no-trunc", "--format", "{{json .}}", container], { context });
      return { action, container, stats: parseJsonLines(res.stdout)[0] };
    }
  }
});

export const handleDockerRun = defineHandler(DockerRunSchema, async (input) => {
  const { context } = input;
  const cfg = getConfig();
  const args: string[] = [input.create ? "create" : "run"];
  if (!input.create && input.detach) args.push("--detach");
  if (input.rm) args.push("--rm");
  if (input.name) args.push(`--name=${input.name}`);
  for (const p of input.ports ?? []) args.push(`--publish=${p}`);
  for (const [k, v] of Object.entries(input.env ?? {})) args.push(`--env=${k}=${v}`);
  if (input.envFile) args.push(`--env-file=${resolveHostPath(input.envFile, "envFile")}`);
  for (const vol of input.volumes ?? []) {
    let source = vol.source;
    if (looksLikeHostPath(source)) source = resolveHostPath(source, "volume source");
    else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(source)) {
      throw new DockerError("INVALID_ARGUMENT", `Invalid volume name: ${source}`);
    }
    args.push(`--volume=${source}:${vol.target}${vol.readOnly ? ":ro" : ""}`);
  }
  if (input.network) args.push(`--network=${input.network}`);
  if (input.restart) args.push(`--restart=${input.restart}`);
  if (input.cpus !== undefined) args.push(`--cpus=${input.cpus}`);
  if (input.memory) args.push(`--memory=${input.memory}`);
  for (const [k, v] of Object.entries(input.labels ?? {})) args.push(`--label=${k}=${v}`);
  if (input.workdir) args.push(`--workdir=${input.workdir}`);
  if (input.user) args.push(`--user=${input.user}`);
  if (input.platform) args.push(`--platform=${input.platform}`);
  if (input.hostname) args.push(`--hostname=${input.hostname}`);
  if (input.pull) args.push(`--pull=${input.pull}`);
  if (input.entrypoint) args.push(`--entrypoint=${input.entrypoint}`);
  args.push(input.image, ...(input.command ?? []));

  const attached = !input.create && !input.detach;
  const secrets = Object.values(input.env ?? {});
  const res = await runDocker(args, {
    context,
    secrets,
    keep: attached ? "tail" : "head",
    maxBytes: input.maxBytes,
    // A first run may pull the image, so it gets the long timeout.
    timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs,
    allowNonZero: attached,
  });

  if (attached) {
    // `docker run` exits 125 for daemon errors, 126/127 when the command cannot run.
    if (res.exitCode === 125 || (res.exitCode !== 0 && isDaemonUnavailable(res.stderr))) throw classifyFailure(res);
    return {
      mode: "attached",
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      truncated: res.stdoutTruncated || res.stderrTruncated,
      removed: input.rm,
    };
  }
  const id = res.stdout.trim().split(/\r?\n/).pop();
  return {
    mode: input.create ? "created" : "detached",
    containerId: id,
    name: input.name,
    pullOutput: res.stderr.trim() ? res.stderr.trim().slice(-2000) : undefined,
  };
});

export const handleDockerExec = defineHandler(DockerExecSchema, async (input) => {
  const args = ["exec"];
  if (input.user) args.push(`--user=${input.user}`);
  if (input.workdir) args.push(`--workdir=${input.workdir}`);
  if (input.privileged) args.push("--privileged");
  for (const [k, v] of Object.entries(input.env ?? {})) args.push(`--env=${k}=${v}`);
  args.push(input.container, ...input.command);
  const timeout = input.timeoutMs ?? getConfig().timeoutMs;
  const res = await runDocker(args, {
    context: input.context,
    timeoutMs: timeout,
    maxBytes: input.maxBytes,
    keep: "tail",
    allowNonZero: true,
    allowTimeout: true,
    secrets: Object.values(input.env ?? {}),
  });
  if (res.timedOut) {
    return {
      timedOut: true,
      timeoutMs: timeout,
      note: "The docker CLI was stopped; the process inside the container may still be running.",
      stdout: res.stdout,
      stderr: res.stderr,
      truncated: res.stdoutTruncated || res.stderrTruncated,
    };
  }
  // Docker-level failures (no such container, not running, daemon down) exit
  // non-zero with an "Error response from daemon" — those are errors, not the command's result.
  if (res.exitCode !== 0 && (/^Error response from daemon/m.test(res.stderr) || isDaemonUnavailable(res.stderr))) {
    throw classifyFailure(res);
  }
  return {
    exitCode: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
    truncated: res.stdoutTruncated || res.stderrTruncated,
  };
});

export const handleDockerCp = defineHandler(DockerCpSchema, async (input) => {
  const host = resolveHostPath(input.hostPath, "hostPath");
  const remote = `${input.container}:${input.containerPath}`;
  const args = ["cp"];
  if (input.followLink) args.push("--follow-link");
  if (input.direction === "to") args.push(host, remote);
  else args.push(remote, host);
  const res = await runDocker(args, { context: input.context, timeoutMs: getConfig().longTimeoutMs });
  return {
    success: true,
    direction: input.direction,
    from: input.direction === "to" ? host : remote,
    to: input.direction === "to" ? remote : host,
    output: (res.stdout + res.stderr).trim() || undefined,
  };
});

export const handleDockerStats = defineHandler(DockerStatsSchema, async ({ container, containers, all, context }) => {
  const args = ["stats", "--no-stream", "--no-trunc", "--format", "{{json .}}"];
  if (all) args.push("--all");
  const targets = [...(container ? [container] : []), ...(containers ?? [])];
  args.push(...targets);
  const res = await runDocker(args, { context, timeoutMs: Math.max(getConfig().timeoutMs, 30_000) });
  const stats = parseJsonLines(res.stdout);
  return { stats, count: stats.length };
});
