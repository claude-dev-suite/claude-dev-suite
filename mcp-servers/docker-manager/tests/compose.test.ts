// SPDX-License-Identifier: MIT
/**
 * docker_compose targets an explicit project, bounded logs, and v1 fallback.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { handleDockerCompose, resetComposeVariantCache } from "../src/handlers/compose.js";
import { body, fakeDocker, jsonl, restoreRunner, type Route } from "./helpers.js";

let root: string;
const pluginOk: Route = ["compose version --short", { stdout: "2.40.3\n" }];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dm-compose-")));
  fs.mkdirSync(path.join(root, "app"));
  fs.writeFileSync(path.join(root, "app", "compose.yaml"), "services: {}\n");
  process.env.DOCKER_MCP_ALLOWED_ROOTS = root;
  resetComposeVariantCache();
});
afterEach(() => {
  restoreRunner();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("docker_compose project targeting", () => {
  it("runs in projectDir and passes -f/-p/--profile/--env-file (old code passed no cwd)", async () => {
    const fake = fakeDocker([pluginOk, [/^compose .* ps/, { stdout: jsonl([{ Name: "web", State: "running" }]) }]]);
    const res = body(await handleDockerCompose({
      action: "ps",
      projectDir: "app",
      files: ["app/compose.yaml"],
      projectName: "shop",
      profiles: ["dev"],
      envFile: "app/.env",
    }));
    const call = fake.find(/ ps /)[0];
    expect(call.opts.cwd).toBe(path.join(root, "app"));
    expect(call.args).toEqual([
      "compose",
      "-f", path.join(root, "app", "compose.yaml"),
      "--project-directory", path.join(root, "app"),
      "-p", "shop",
      "--profile", "dev",
      "--env-file", path.join(root, "app", ".env"),
      "ps", "--format", "json",
    ]);
    expect(res.containers).toEqual([{ Name: "web", State: "running" }]);
  });

  it("defaults to the server's project root, not an inherited cwd", async () => {
    const fake = fakeDocker([pluginOk, [/^compose ps/, { stdout: "[]" }]]);
    await handleDockerCompose({ action: "ps" });
    expect(fake.find(/^compose ps/)[0].opts.cwd).toBe(root);
  });

  it("refuses a project directory outside the allowed roots", async () => {
    fakeDocker([pluginOk]);
    const res = await handleDockerCompose({ action: "up", projectDir: path.dirname(root) });
    expect(res.isError).toBe(true);
    expect(body(res).code).toBe("INVALID_ARGUMENT");
  });

  it("parses both NDJSON and legacy array output from compose ps", async () => {
    fakeDocker([pluginOk, [/^compose ps/, { stdout: '[{"Name":"a"},{"Name":"b"}]' }]]);
    expect(body(await handleDockerCompose({ action: "ps" })).count).toBe(2);
  });
});

describe("docker_compose logs", () => {
  it("forwards tail/since/until/timestamps instead of a fixed 100 lines", async () => {
    const fake = fakeDocker([pluginOk, [/^compose logs/, { stdout: "web-1 | hello\nweb-1 | error: boom\n" }]]);
    const res = body(await handleDockerCompose({
      action: "logs", services: ["web"], tail: 20, since: "10m", until: "1m", timestamps: true, grep: "error",
    }));
    expect(fake.find(/^compose logs/)[0].args).toEqual([
      "compose", "logs", "--no-color", "--tail=20", "--since=10m", "--until=1m", "--timestamps", "web",
    ]);
    expect(res.output).toBe("web-1 | error: boom");
    expect(res.matchedLines).toBe(1);
  });

  it("bounds a follow with a timeout that is not an error", async () => {
    const fake = fakeDocker([pluginOk, [/^compose logs/, { timedOut: true, exitCode: null, stdout: "line\n" }]]);
    const res = await handleDockerCompose({ action: "logs", followSeconds: 2 });
    expect(res.isError).toBeFalsy();
    expect(fake.find(/^compose logs/)[0].opts.timeoutMs).toBe(2000);
    expect(body(res).followedSeconds).toBe(2);
  });
});

describe("docker_compose actions", () => {
  it("up detaches by default, supports --wait, and uses the long timeout", async () => {
    const fake = fakeDocker([pluginOk, [/^compose up/, { stderr: "Container web-1  Started\n" }]]);
    await handleDockerCompose({ action: "up", services: ["web"], wait: true, build: true });
    const call = fake.find(/^compose up/)[0];
    expect(call.args).toEqual(["compose", "up", "--detach", "--build", "--wait", "web"]);
    expect(call.opts.timeoutMs).toBeGreaterThanOrEqual(600_000);
  });

  it("down keeps volumes unless explicitly asked", async () => {
    const fake = fakeDocker([pluginOk, [/^compose down/, {}]]);
    await handleDockerCompose({ action: "down" });
    await handleDockerCompose({ action: "down", volumes: true });
    const downs = fake.find(/^compose down/).map((c) => c.joined);
    expect(downs).toEqual(["compose down", "compose down --volumes"]);
  });

  it("exec is non-interactive and returns the command's exit code", async () => {
    const fake = fakeDocker([pluginOk, [/^compose exec/, { exitCode: 3, stdout: "out\n" }]]);
    const res = body(await handleDockerCompose({ action: "exec", service: "web", command: ["sh", "-c", "exit 3"], env: { TOKEN: "abcdef" } }));
    expect(fake.find(/^compose exec/)[0].args).toEqual(["compose", "exec", "-T", "-e", "TOKEN=abcdef", "web", "sh", "-c", "exit 3"]);
    expect(res.exitCode).toBe(3);
  });

  it("run is a one-off removed afterwards by default", async () => {
    const fake = fakeDocker([pluginOk, [/^compose run/, { stdout: "ok\n" }]]);
    await handleDockerCompose({ action: "run", service: "web", command: ["echo", "ok"] });
    expect(fake.find(/^compose run/)[0].args).toEqual(["compose", "run", "-T", "--rm", "web", "echo", "ok"]);
  });

  it("config redacts resolved environment values", async () => {
    fakeDocker([pluginOk, [/^compose config --format json/, {
      stdout: JSON.stringify({
        services: { web: { environment: { DB_PASSWORD: "pw", NODE_ENV: "production" }, build: { args: { NPM_TOKEN: "t" } } } },
        secrets: { s: { content: "inline" } },
      }),
    }]]);
    const res = body(await handleDockerCompose({ action: "config" }));
    expect(res.config.services.web.environment).toEqual({ DB_PASSWORD: "[REDACTED]", NODE_ENV: "production" });
    expect(res.config.services.web.build.args.NPM_TOKEN).toBe("[REDACTED]");
    expect(res.config.secrets.s.content).toBe("[REDACTED]");
  });

  it("config validateOnly reports errors as a result, not a crash", async () => {
    fakeDocker([pluginOk, [/^compose config --quiet/, { exitCode: 1, stderr: "services.web.ports must be a list" }]]);
    const res = body(await handleDockerCompose({ action: "config", validateOnly: true }));
    expect(res.valid).toBe(false);
    expect(res.errors).toMatch(/must be a list/);
  });

  it("falls back to a standalone docker-compose binary when the plugin is missing", async () => {
    const fake = fakeDocker([
      ["compose version", { exitCode: 1, stderr: "docker: 'compose' is not a docker command." }],
      ["version --short", { stdout: "1.29.2\n" }],
      [/^ps/, { stdout: "[]" }],
    ]);
    const res = body(await handleDockerCompose({ action: "ps", context: "other" }));
    const call = fake.find(/^ps/)[0];
    expect(call.bin).toBe("docker-compose");
    expect(call.opts.env?.DOCKER_CONTEXT).toBe("other");
    expect(res.compose).toBe("standalone 1.29.2");
  });
});
