// SPDX-License-Identifier: MIT
/**
 * The process layer: real child processes (node itself stands in for docker)
 * for timeout, output caps and stdin; the fake runner for error classification.
 */

import { afterEach, describe, expect, it } from "vitest";
import * as os from "os";
import { DockerError, runDocker, spawnRunner } from "../src/lib/exec.js";
import { fakeDocker, restoreRunner } from "./helpers.js";

const node = process.execPath;
const base = { cwd: os.tmpdir(), timeoutMs: 10_000, maxBytes: 1024 * 1024, keep: "head" as const };

afterEach(() => {
  restoreRunner();
  delete process.env.DOCKER_CLI;
});

describe("spawnRunner", () => {
  it("kills a command that exceeds its timeout (the old runner had none)", async () => {
    const started = Date.now();
    const res = await spawnRunner(node, ["-e", "setTimeout(() => {}, 60000)"], { ...base, timeoutMs: 500 });
    expect(res.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("caps output from the head and marks it truncated", async () => {
    const res = await spawnRunner(node, ["-e", "process.stdout.write('a'.repeat(50000) + 'END')"], { ...base, maxBytes: 1000 });
    expect(res.stdout.length).toBe(1000);
    expect(res.stdoutTruncated).toBe(true);
    expect(res.stdout.endsWith("END")).toBe(false);
  });

  it("keeps the tail when asked (logs, builds)", async () => {
    const res = await spawnRunner(node, ["-e", "process.stdout.write('a'.repeat(50000) + 'END')"], { ...base, maxBytes: 1000, keep: "tail" });
    expect(res.stdout.length).toBe(1000);
    expect(res.stdout.endsWith("END")).toBe(true);
    expect(res.stdoutTruncated).toBe(true);
  });

  it("feeds stdin (registry passwords never go in argv)", async () => {
    const res = await spawnRunner(node, ["-e", "process.stdin.pipe(process.stdout)"], { ...base, stdin: "s3cret" });
    expect(res.stdout).toBe("s3cret");
  });

  it("runs in the explicit cwd", async () => {
    const res = await spawnRunner(node, ["-e", "process.stdout.write(process.cwd())"], base);
    expect(res.stdout.toLowerCase()).toBe(os.tmpdir().toLowerCase());
  });
});

describe("runDocker error classification", () => {
  it("reports a missing CLI distinctly", async () => {
    process.env.DOCKER_CLI = "definitely-not-a-docker-binary-xyz";
    await expect(runDocker(["ps"])).rejects.toMatchObject({ code: "DOCKER_CLI_NOT_FOUND" });
  });

  it("reports a stopped daemon distinctly from a command failure", async () => {
    fakeDocker([["ps", {
      exitCode: 1,
      stderr: "failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running",
    }]]);
    await expect(runDocker(["ps"])).rejects.toMatchObject({ code: "DOCKER_DAEMON_UNAVAILABLE" });

    fakeDocker([["ps", { exitCode: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" }]]);
    await expect(runDocker(["ps"])).rejects.toMatchObject({ code: "DOCKER_DAEMON_UNAVAILABLE" });
  });

  it("classifies a missing object as NOT_FOUND", async () => {
    fakeDocker([["inspect", { exitCode: 1, stderr: "Error response from daemon: No such container: x" }]]);
    await expect(runDocker(["inspect", "x"])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turns a timeout into a TIMEOUT error with partial output", async () => {
    fakeDocker([["compose up", { timedOut: true, exitCode: null, stdout: "pulling…" }]]);
    const err = await runDocker(["compose", "up"]).catch((e) => e);
    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("TIMEOUT");
    expect(err.details.partialStdout).toContain("pulling");
  });

  it("scrubs caller secrets and ANSI codes from output and the echoed command", async () => {
    fakeDocker([["run", { exitCode: 1, stderr: "\u001b[31mbad value hunter22\u001b[0m" }]]);
    const err = await runDocker(["run", "--env=PW=hunter22", "img"], { secrets: ["hunter22"] }).catch((e) => e);
    expect(err.message).toBe("bad value ***");
    expect(err.details.command).not.toContain("hunter22");
  });

  it("prefixes --context and passes a timeout and cap on every call", async () => {
    const fake = fakeDocker([["--context", { stdout: "" }]]);
    await runDocker(["ps"], { context: "remote" });
    expect(fake.calls[0].args.slice(0, 3)).toEqual(["--context", "remote", "ps"]);
    expect(fake.calls[0].opts.timeoutMs).toBeGreaterThan(0);
    expect(fake.calls[0].opts.maxBytes).toBeGreaterThan(0);
    expect(fake.calls[0].opts.cwd).toBeTruthy();
  });
});
