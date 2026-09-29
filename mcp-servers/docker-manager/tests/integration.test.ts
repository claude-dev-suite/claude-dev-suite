// SPDX-License-Identifier: MIT
/**
 * Real-daemon smoke test. Skipped unless a daemon is reachable and
 * `alpine:latest` is already present locally (the test never pulls).
 * Every object it creates is named `devsuite-mcp-test-*` and removed.
 */

import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { handleDockerContainer, handleDockerExec, handleDockerRun } from "../src/handlers/containers.js";
import { handleCleanupUnused } from "../src/handlers/cleanup.js";
import { body } from "./helpers.js";

function dockerReady(): boolean {
  try {
    execFileSync("docker", ["image", "inspect", "alpine:latest"], { stdio: "ignore", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const ready = dockerReady();
const name = `devsuite-mcp-test-it-${randomUUID().slice(0, 8)}`;

describe.skipIf(!ready)("docker-manager against a real daemon", () => {
  afterAll(() => {
    try {
      execFileSync("docker", ["rm", "--force", name], { stdio: "ignore", timeout: 30_000 });
    } catch {
      /* already gone */
    }
  });

  it("runs, execs, reads logs, inspects with redaction, previews prune and removes", async () => {
    const run = body(await handleDockerRun({
      image: "alpine:latest", name, pull: "never", labels: { "devsuite.test": name },
      env: { SECRET_TOKEN: "it-secret-value", APP_ENV: "test" },
      command: ["sh", "-c", "echo started; sleep 120"],
    }));
    expect(run.containerId).toMatch(/^[0-9a-f]{64}$/);

    const exec = body(await handleDockerExec({ container: name, command: ["sh", "-c", "echo out; exit 4"] }));
    expect(exec.exitCode).toBe(4);
    expect(exec.stdout.trim()).toBe("out");

    const logs = body(await handleDockerContainer({ container: name, action: "logs", tail: 10 }));
    expect(logs.stdout).toContain("started");

    const inspect = body(await handleDockerContainer({ container: name, action: "inspect" }));
    expect(inspect.output.Config.Env).toContain("SECRET_TOKEN=[REDACTED]");
    expect(inspect.output.Config.Env).toContain("APP_ENV=test");

    await handleDockerContainer({ container: name, action: "kill" });
    const preview = body(await handleCleanupUnused({ target: "containers", labels: [`devsuite.test=${name}`] }));
    expect(preview.dryRun).toBe(true);
    expect(preview.wouldRemove.containers.items.map((c: { name: string }) => c.name)).toEqual([name]);

    const removed = body(await handleDockerContainer({ container: name, action: "remove" }));
    expect(removed.success).toBe(true);
  }, 120_000);
});
