// SPDX-License-Identifier: MIT
/**
 * Image tools: docker_images, docker_build, docker_registry.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { getConfig } from "../lib/config.js";
import { DockerError, runDocker } from "../lib/exec.js";
import { limitList, parseJson, parseJsonLines } from "../lib/parse.js";
import { resolveHostPath } from "../lib/paths.js";
import { redactInspect } from "../lib/redact.js";
import {
  DockerBuildSchema,
  DockerRegistrySchema,
  ImageActionSchema,
  defineHandler,
  required,
} from "./types.js";

export const handleDockerImages = defineHandler(ImageActionSchema, async (input) => {
  const { action, context } = input;
  const cfg = getConfig();
  const image = () => required(input.image, "image");

  switch (action) {
    case "list": {
      const args = ["images", "--format", "{{json .}}"];
      if (input.all) args.push("--all");
      const f = input.filters ?? {};
      if (f.dangling !== undefined) args.push(`--filter=dangling=${f.dangling}`);
      if (f.reference) args.push(`--filter=reference=${f.reference}`);
      for (const l of f.label ?? []) args.push(`--filter=label=${l}`);
      if (f.before) args.push(`--filter=before=${f.before}`);
      if (f.since) args.push(`--filter=since=${f.since}`);
      const res = await runDocker(args, { context, maxBytes: 16 * 1024 * 1024 });
      const { items, total, truncated } = limitList(parseJsonLines(res.stdout), input.limit);
      return { action, images: items, count: items.length, total, truncated };
    }
    case "pull": {
      const args = ["pull"];
      if (input.platform) args.push(`--platform=${input.platform}`);
      args.push(image());
      const res = await runDocker(args, { context, timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs, keep: "tail" });
      return { action, image: input.image, success: true, output: res.stdout.trim().slice(-4000) };
    }
    case "remove": {
      const args = ["rmi"];
      if (input.force) args.push("--force");
      if (input.noPrune) args.push("--no-prune");
      args.push(image());
      const res = await runDocker(args, { context });
      const lines = res.stdout.split(/\r?\n/).filter(Boolean);
      return {
        action,
        image: input.image,
        untagged: lines.filter((l) => l.startsWith("Untagged:")).map((l) => l.slice(9).trim()),
        deleted: lines.filter((l) => l.startsWith("Deleted:")).map((l) => l.slice(8).trim()),
      };
    }
    case "inspect": {
      const res = await runDocker(["image", "inspect", image()], { context, maxBytes: 8 * 1024 * 1024 });
      const doc = parseJson<unknown[]>(res.stdout, "image inspect output");
      return {
        action,
        image: input.image,
        output: redactInspect(Array.isArray(doc) && doc.length === 1 ? doc[0] : doc, input.revealEnv),
        envRedacted: !input.revealEnv,
      };
    }
    case "history": {
      const res = await runDocker(["history", "--no-trunc", "--format", "{{json .}}", image()], { context });
      return { action, image: input.image, layers: parseJsonLines(res.stdout) };
    }
    case "tag": {
      await runDocker(["tag", image(), required(input.targetTag, "targetTag")], { context });
      return { action, source: input.image, target: input.targetTag, success: true };
    }
    case "push": {
      const res = await runDocker(["push", image()], { context, timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs, keep: "tail" });
      const digest = /digest:\s*(sha256:[0-9a-f]{64})/.exec(res.stdout)?.[1];
      return { action, image: input.image, success: true, digest, output: res.stdout.trim().slice(-4000) };
    }
    case "search": {
      const term = required(input.term ?? input.image, "term");
      const res = await runDocker(
        ["search", "--no-trunc", `--limit=${Math.min(input.limit, 100)}`, "--format", "{{json .}}", term],
        { context, timeoutMs: input.timeoutMs ?? cfg.timeoutMs },
      );
      return { action, term, results: parseJsonLines(res.stdout) };
    }
    case "save": {
      const out = resolveHostPath(required(input.path, "path"), "path");
      await runDocker(["save", `--output=${out}`, image()], { context, timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs });
      const size = fs.statSync(out).size;
      return { action, image: input.image, path: out, bytes: size };
    }
    case "load": {
      const inp = resolveHostPath(required(input.path, "path"), "path");
      if (!fs.existsSync(inp)) throw new DockerError("INVALID_ARGUMENT", `Archive not found: ${inp}`);
      const res = await runDocker(["load", `--input=${inp}`], { context, timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs });
      const loaded = res.stdout.split(/\r?\n/).filter((l) => l.startsWith("Loaded image")).map((l) => l.replace(/^Loaded image( ID)?:\s*/, ""));
      return { action, path: inp, loaded };
    }
  }
});

export const handleDockerBuild = defineHandler(DockerBuildSchema, async (input) => {
  const cfg = getConfig();
  const contextDir = resolveHostPath(input.path, "path");
  const iidFile = path.join(os.tmpdir(), `docker-mcp-iid-${randomUUID()}`);
  const args = ["build", "--progress=plain", `--iidfile=${iidFile}`];
  if (input.dockerfile) args.push(`--file=${resolveHostPath(input.dockerfile, "dockerfile")}`);
  for (const t of input.tags ?? []) args.push(`--tag=${t}`);
  for (const [k, v] of Object.entries(input.buildArgs ?? {})) args.push(`--build-arg=${k}=${v}`);
  for (const [k, v] of Object.entries(input.labels ?? {})) args.push(`--label=${k}=${v}`);
  if (input.target) args.push(`--target=${input.target}`);
  if (input.platform) args.push(`--platform=${input.platform}`);
  if (input.noCache) args.push("--no-cache");
  if (input.pull) args.push("--pull");
  args.push(contextDir);

  try {
    // BuildKit writes progress to stderr; the tail is where failures are.
    const res = await runDocker(args, {
      context: input.context,
      cwd: contextDir,
      timeoutMs: input.timeoutMs ?? cfg.longTimeoutMs,
      maxBytes: input.maxBytes,
      keep: "tail",
      secrets: Object.values(input.buildArgs ?? {}),
    });
    let imageId: string | undefined;
    try {
      imageId = fs.readFileSync(iidFile, "utf8").trim() || undefined;
    } catch {
      imageId = undefined;
    }
    return {
      success: true,
      imageId,
      tags: input.tags ?? [],
      durationMs: res.durationMs,
      output: (res.stdout + "\n" + res.stderr).trim(),
      truncated: res.stdoutTruncated || res.stderrTruncated,
    };
  } finally {
    fs.rmSync(iidFile, { force: true });
  }
});

export const handleDockerRegistry = defineHandler(DockerRegistrySchema, async (input) => {
  if (input.action === "logout") {
    const args = ["logout"];
    if (input.registry) args.push(input.registry);
    const res = await runDocker(args, { context: input.context });
    return { action: "logout", registry: input.registry ?? "docker.io", output: res.stdout.trim() };
  }
  const username = required(input.username, "username");
  let password = input.password;
  if (!password && input.passwordEnv) {
    password = process.env[input.passwordEnv];
    if (!password) throw new DockerError("INVALID_ARGUMENT", `Environment variable ${input.passwordEnv} is not set on the server`);
  }
  if (!password) throw new DockerError("INVALID_ARGUMENT", "Provide 'password' or 'passwordEnv'");
  const args = ["login", `--username=${username}`, "--password-stdin"];
  if (input.registry) args.push(input.registry);
  // The password only ever travels on stdin, and is scrubbed from anything echoed back.
  const res = await runDocker(args, { context: input.context, stdin: password, secrets: [password] });
  return {
    action: "login",
    registry: input.registry ?? "docker.io",
    username,
    success: true,
    output: res.stdout.trim(),
  };
});
