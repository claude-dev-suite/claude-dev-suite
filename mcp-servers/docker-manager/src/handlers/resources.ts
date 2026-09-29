// SPDX-License-Identifier: MIT
/**
 * docker_networks, docker_volumes, docker_system.
 */

import { getConfig } from "../lib/config.js";
import { DockerError, isDaemonUnavailable, runDocker } from "../lib/exec.js";
import { limitList, parseJson, parseJsonLines, parseUntil } from "../lib/parse.js";
import { runCleanup } from "./cleanup.js";
import { detectCompose } from "./compose.js";
import { NetworksSchema, SystemSchema, VolumesSchema, defineHandler, required } from "./types.js";

export const handleDockerNetworks = defineHandler(NetworksSchema, async (input) => {
  const { action, context } = input;
  const network = () => required(input.network, "network");
  switch (action) {
    case "list": {
      const args = ["network", "ls", "--no-trunc", "--format", "{{json .}}"];
      const f = input.filters ?? {};
      for (const l of f.label ?? []) args.push(`--filter=label=${l}`);
      if (f.driver) args.push(`--filter=driver=${f.driver}`);
      if (f.name) args.push(`--filter=name=${f.name}`);
      const res = await runDocker(args, { context, maxBytes: 16 * 1024 * 1024 });
      const { items, total, truncated } = limitList(parseJsonLines(res.stdout), input.limit);
      return { networks: items, count: items.length, total, truncated };
    }
    case "inspect": {
      const res = await runDocker(["network", "inspect", network()], { context, maxBytes: 8 * 1024 * 1024 });
      const doc = parseJson<unknown[]>(res.stdout, "network inspect output");
      return { action, network: input.network, output: Array.isArray(doc) && doc.length === 1 ? doc[0] : doc };
    }
    case "create": {
      const args = ["network", "create"];
      if (input.driver) args.push(`--driver=${input.driver}`);
      if (input.subnet) args.push(`--subnet=${input.subnet}`);
      if (input.gateway) args.push(`--gateway=${input.gateway}`);
      if (input.internal) args.push("--internal");
      if (input.attachable) args.push("--attachable");
      for (const [k, v] of Object.entries(input.labels ?? {})) args.push(`--label=${k}=${v}`);
      args.push(network());
      const res = await runDocker(args, { context });
      return { action, network: input.network, id: res.stdout.trim() };
    }
    case "remove":
      await runDocker(["network", "rm", network()], { context });
      return { action, network: input.network, success: true };
    case "connect": {
      const args = ["network", "connect"];
      for (const a of input.aliases ?? []) args.push(`--alias=${a}`);
      if (input.ip) args.push(input.ip.includes(":") ? `--ip6=${input.ip}` : `--ip=${input.ip}`);
      args.push(network(), required(input.container, "container"));
      await runDocker(args, { context });
      return { action, network: input.network, container: input.container, success: true };
    }
    case "disconnect": {
      const args = ["network", "disconnect"];
      if (input.force) args.push("--force");
      args.push(network(), required(input.container, "container"));
      await runDocker(args, { context });
      return { action, network: input.network, container: input.container, success: true };
    }
    case "prune":
      return runCleanup({
        target: "networks",
        dryRun: input.dryRun,
        allImages: false,
        includeVolumes: false,
        allVolumes: false,
        until: input.until,
        labels: input.filters?.label,
        limit: input.limit,
        context,
      });
  }
});

export const handleDockerVolumes = defineHandler(VolumesSchema, async (input) => {
  const { action, context } = input;
  const volume = () => required(input.volume, "volume");
  switch (action) {
    case "list": {
      const args = ["volume", "ls", "--format", "{{json .}}"];
      const f = input.filters ?? {};
      if (f.dangling !== undefined) args.push(`--filter=dangling=${f.dangling}`);
      for (const l of f.label ?? []) args.push(`--filter=label=${l}`);
      if (f.driver) args.push(`--filter=driver=${f.driver}`);
      if (f.name) args.push(`--filter=name=${f.name}`);
      const res = await runDocker(args, { context, maxBytes: 16 * 1024 * 1024 });
      const { items, total, truncated } = limitList(parseJsonLines(res.stdout), input.limit);
      return { volumes: items, count: items.length, total, truncated };
    }
    case "inspect": {
      const res = await runDocker(["volume", "inspect", volume()], { context });
      const doc = parseJson<unknown[]>(res.stdout, "volume inspect output");
      return { action, volume: input.volume, output: Array.isArray(doc) && doc.length === 1 ? doc[0] : doc };
    }
    case "create": {
      const args = ["volume", "create"];
      if (input.driver) args.push(`--driver=${input.driver}`);
      for (const [k, v] of Object.entries(input.labels ?? {})) args.push(`--label=${k}=${v}`);
      for (const [k, v] of Object.entries(input.driverOpts ?? {})) args.push(`--opt=${k}=${v}`);
      args.push(volume());
      const res = await runDocker(args, { context });
      return { action, volume: res.stdout.trim() };
    }
    case "remove": {
      const args = ["volume", "rm"];
      if (input.force) args.push("--force");
      args.push(volume());
      await runDocker(args, { context });
      return { action, volume: input.volume, success: true };
    }
    case "prune":
      return runCleanup({
        target: "volumes",
        dryRun: input.dryRun,
        allImages: false,
        // Calling prune on the volumes tool with dryRun:false is the explicit opt-in.
        includeVolumes: true,
        allVolumes: input.all,
        labels: input.filters?.label,
        limit: input.limit,
        context,
      });
  }
});

export const handleDockerSystem = defineHandler(SystemSchema, async (input) => {
  const { action, context } = input;
  const cfg = getConfig();
  switch (action) {
    case "status": {
      const res = await runDocker(["version", "--format", "{{json .}}"], { context, allowNonZero: true });
      let client: unknown;
      let server: unknown;
      try {
        const doc = JSON.parse(res.stdout.trim() || "{}") as { Client?: Record<string, unknown>; Server?: unknown };
        client = doc.Client ? { Version: doc.Client.Version, ApiVersion: doc.Client.ApiVersion, Context: doc.Client.Context, Os: doc.Client.Os, Arch: doc.Client.Arch } : undefined;
        server = doc.Server ?? undefined;
      } catch {
        client = undefined;
      }
      const daemonReachable = res.exitCode === 0 && Boolean(server);
      let compose: unknown;
      try {
        compose = await detectCompose(context);
      } catch (e) {
        compose = { unavailable: e instanceof Error ? e.message : String(e) };
      }
      return {
        cli: cfg.cli,
        client,
        daemonReachable,
        daemonError: daemonReachable ? undefined : (isDaemonUnavailable(res.stderr) ? "Daemon not running or unreachable: " : "") + res.stderr.trim().slice(0, 1000),
        server: daemonReachable ? server : undefined,
        compose,
        endpoint: { DOCKER_HOST: cfg.dockerHost, DOCKER_CONTEXT: cfg.dockerContext, contextArg: context },
        limits: { timeoutMs: cfg.timeoutMs, longTimeoutMs: cfg.longTimeoutMs, maxOutputBytes: cfg.maxOutputBytes },
        allowedRoots: cfg.allowedRoots,
      };
    }
    case "df": {
      if (input.verbose) {
        const res = await runDocker(["system", "df", "--verbose", "--format", "{{json .}}"], { context, maxBytes: 16 * 1024 * 1024, timeoutMs: Math.max(cfg.timeoutMs, 120_000) });
        const doc = parseJson<Record<string, unknown>>(res.stdout.trim(), "system df -v");
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(doc)) {
          out[k] = Array.isArray(v) ? { ...limitList(v, input.limit) } : v;
        }
        return { verbose: true, ...out };
      }
      const res = await runDocker(["system", "df", "--format", "{{json .}}"], { context });
      return { usage: parseJsonLines(res.stdout) };
    }
    case "info": {
      const res = await runDocker(["info", "--format", "{{json .}}"], { context, allowNonZero: true, maxBytes: 4 * 1024 * 1024 });
      const doc = parseJson<Record<string, unknown>>(res.stdout.trim(), "docker info");
      const serverErrors = doc.ServerErrors as string[] | undefined;
      if (serverErrors?.length) {
        throw new DockerError(
          serverErrors.some(isDaemonUnavailable) ? "DOCKER_DAEMON_UNAVAILABLE" : "COMMAND_FAILED",
          serverErrors.join("; "),
        );
      }
      return { info: doc };
    }
    case "version": {
      const res = await runDocker(["version", "--format", "{{json .}}"], { context, allowNonZero: true });
      const doc = parseJson<Record<string, unknown>>(res.stdout.trim() || "{}", "docker version");
      return { ...doc, serverError: res.exitCode === 0 ? undefined : res.stderr.trim().slice(0, 1000) };
    }
    case "events": {
      // A bounded window: `docker events` only returns when --until is set.
      const now = Date.now();
      const since = parseUntil(input.since ?? "10m", now);
      const until = input.until ? parseUntil(input.until, now) : now;
      if (until < since) throw new DockerError("INVALID_ARGUMENT", "'until' is before 'since'");
      const args = ["events", "--format", "{{json .}}", `--since=${Math.floor(since / 1000)}`, `--until=${Math.floor(until / 1000)}`];
      for (const f of input.filters ?? []) args.push(`--filter=${f}`);
      const res = await runDocker(args, { context, maxBytes: 16 * 1024 * 1024, timeoutMs: Math.max(cfg.timeoutMs, 60_000) });
      const events = parseJsonLines(res.stdout);
      // Keep the most recent events when the window holds more than `limit`.
      const items = events.slice(-input.limit);
      return {
        window: { since: new Date(since).toISOString(), until: new Date(until).toISOString() },
        events: items,
        count: items.length,
        total: events.length,
        truncated: events.length > input.limit || res.stdoutTruncated,
      };
    }
    case "contexts": {
      const res = await runDocker(["context", "ls", "--format", "{{json .}}"], {});
      const contexts = parseJsonLines<Record<string, unknown>>(res.stdout);
      return {
        contexts,
        current: contexts.find((c) => c.Current === true)?.Name,
        env: { DOCKER_HOST: cfg.dockerHost, DOCKER_CONTEXT: cfg.dockerContext },
        note: "Select a context per call with the 'context' parameter; the server never changes the global default.",
      };
    }
  }
});
