// SPDX-License-Identifier: MIT
/**
 * Container, image and registry tools against the fake CLI.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  handleDockerContainer,
  handleDockerCp,
  handleDockerExec,
  handleDockerPs,
  handleDockerRun,
} from "../src/handlers/containers.js";
import { handleDockerBuild, handleDockerImages, handleDockerRegistry } from "../src/handlers/images.js";
import { handleDockerSystem } from "../src/handlers/resources.js";
import { body, fakeDocker, jsonl, restoreRunner } from "./helpers.js";

let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dm-ctr-")));
  process.env.DOCKER_MCP_ALLOWED_ROOTS = root;
});
afterEach(() => {
  restoreRunner();
  fs.rmSync(root, { recursive: true, force: true });
});

const inspectDoc = [{
  Id: "abc",
  Config: {
    Env: ["PATH=/usr/bin", "DB_PASSWORD=hunter2", "API_TOKEN=tok", "NODE_ENV=production", "REDIS_URL=redis://u:p@r:6379"],
    Image: "app:1",
  },
  State: { Status: "running" },
}];

describe("docker_container inspect", () => {
  it("redacts env values by default (old code returned Config.Env verbatim)", async () => {
    fakeDocker([["container inspect", { stdout: JSON.stringify(inspectDoc) }]]);
    const res = body(await handleDockerContainer({ container: "app", action: "inspect" }));
    expect(res.output.Config.Env).toEqual([
      "PATH=/usr/bin",
      "DB_PASSWORD=[REDACTED]",
      "API_TOKEN=[REDACTED]",
      "NODE_ENV=production",
      "REDIS_URL=[REDACTED]",
    ]);
    expect(res.envRedacted).toBe(true);
    expect(JSON.stringify(res)).not.toContain("hunter2");
  });

  it("reveals env only on explicit opt-in", async () => {
    fakeDocker([["container inspect", { stdout: JSON.stringify(inspectDoc) }]]);
    const res = body(await handleDockerContainer({ container: "app", action: "inspect", revealEnv: true }));
    expect(res.output.Config.Env).toContain("DB_PASSWORD=hunter2");
  });

  it("image inspect redacts too", async () => {
    fakeDocker([["image inspect", { stdout: JSON.stringify(inspectDoc) }]]);
    const res = body(await handleDockerImages({ action: "inspect", image: "app:1" }));
    expect(JSON.stringify(res)).not.toContain("hunter2");
  });
});

describe("docker_container logs and lifecycle", () => {
  it("forwards since/until/timestamps and filters lines client-side", async () => {
    const fake = fakeDocker([["logs", { stdout: "ok 1\nERROR x\nok 2\n", stderr: "error y\n" }]]);
    const res = body(await handleDockerContainer({
      container: "app", action: "logs", tail: 50, since: "10m", until: "2024-01-01T00:00:00Z", timestamps: true, grep: "error", grepIgnoreCase: true,
    }));
    expect(fake.calls[0].args).toEqual(["logs", "--tail=50", "--since=10m", "--until=2024-01-01T00:00:00Z", "--timestamps", "app"]);
    expect(res.stdout).toBe("ERROR x");
    expect(res.stderr).toBe("error y");
    expect(res.matchedLines).toBe(2);
  });

  it("remove only forces or deletes volumes when asked", async () => {
    const fake = fakeDocker([["rm", {}]]);
    await handleDockerContainer({ container: "app", action: "remove" });
    await handleDockerContainer({ container: "app", action: "remove", force: true, removeVolumes: true });
    expect(fake.calls.map((c) => c.joined)).toEqual(["rm app", "rm --force --volumes app"]);
  });

  it("parses top, port, diff and health", async () => {
    fakeDocker([
      ["top", { stdout: "UID PID PPID C STIME TTY TIME CMD\nroot 1 0 0 10:00 ? 00:00:00 sh -c sleep 100\n" }],
      ["port", { stdout: "80/tcp -> 0.0.0.0:8080\n" }],
      ["diff", { stdout: "C /tmp\nA /tmp/x\n" }],
      ["container inspect --format", { stdout: JSON.stringify({ Status: "running", Running: true, Health: { Status: "unhealthy", FailingStreak: 3, Log: [{ ExitCode: 1, Output: "curl: postgres://a:b@db failed" }] } }) }],
    ]);
    expect(body(await handleDockerContainer({ container: "c", action: "top" })).processes[0].CMD).toBe("sh -c sleep 100");
    expect(body(await handleDockerContainer({ container: "c", action: "port" })).ports).toEqual([{ containerPort: "80/tcp", host: "0.0.0.0:8080" }]);
    expect(body(await handleDockerContainer({ container: "c", action: "diff" })).changes).toEqual([
      { kind: "changed", path: "/tmp" }, { kind: "added", path: "/tmp/x" },
    ]);
    const health = body(await handleDockerContainer({ container: "c", action: "health" }));
    expect(health.health.status).toBe("unhealthy");
    expect(health.health.log[0].Output).toBe("curl: postgres://a:***@db failed");
  });

  it("rejects names that would be read as CLI flags", async () => {
    const res = await handleDockerContainer({ container: "--privileged", action: "start" });
    expect(res.isError).toBe(true);
    expect(body(res).code).toBe("INVALID_ARGUMENT");
  });
});

describe("docker_ps", () => {
  it("translates filters and hides the Labels blob unless asked", async () => {
    const fake = fakeDocker([["ps", { stdout: jsonl([{ Names: "web", Labels: "a=b,com.docker.compose.project=shop,com.docker.compose.service=web" }]) }]]);
    const res = body(await handleDockerPs({ filters: { status: ["exited"], composeProject: "shop", label: ["tier=db"] } }));
    expect(fake.calls[0].args).toEqual([
      "ps", "--no-trunc", "--format", "{{json .}}",
      "--filter=status=exited", "--filter=label=tier=db", "--filter=label=com.docker.compose.project=shop", "--all",
    ]);
    expect(res.containers[0]).toEqual({ Names: "web", ComposeProject: "shop", ComposeService: "web" });
  });

  it("limits rows and says so", async () => {
    fakeDocker([["ps", { stdout: jsonl(Array.from({ length: 5 }, (_, i) => ({ Names: `c${i}` }))) }]]);
    const res = body(await handleDockerPs({ limit: 2 }));
    expect(res.count).toBe(2);
    expect(res.total).toBe(5);
    expect(res.truncated).toBe(true);
  });
});

describe("docker_run / docker_exec / docker_cp", () => {
  it("builds run arguments with --flag=value and confines bind mounts", async () => {
    fs.mkdirSync(path.join(root, "data"));
    const fake = fakeDocker([["run", { stdout: "deadbeef\n" }]]);
    const res = body(await handleDockerRun({
      image: "nginx:alpine", name: "web", ports: ["8080:80"], env: { SECRET_KEY: "abcd1234" },
      volumes: [{ source: "./data", target: "/data", readOnly: true }, { source: "pgdata", target: "/var/lib/pg" }],
      restart: "unless-stopped", memory: "256m", cpus: 0.5, labels: { team: "x" }, command: ["nginx", "-g", "daemon off;"],
    }));
    expect(fake.calls[0].args).toEqual([
      "run", "--detach", "--name=web", "--publish=8080:80", "--env=SECRET_KEY=abcd1234",
      `--volume=${path.join(root, "data")}:/data:ro`, "--volume=pgdata:/var/lib/pg",
      "--restart=unless-stopped", "--cpus=0.5", "--memory=256m", "--label=team=x",
      "nginx:alpine", "nginx", "-g", "daemon off;",
    ]);
    expect(res.containerId).toBe("deadbeef");
  });

  it("refuses a bind mount outside the allowed roots", async () => {
    fakeDocker([]);
    const res = await handleDockerRun({ image: "alpine", volumes: [{ source: "/", target: "/host" }] });
    expect(res.isError).toBe(true);
  });

  it("exec returns the command's non-zero exit instead of throwing, and scrubs env values", async () => {
    const fake = fakeDocker([["exec", { exitCode: 2, stdout: "value=abcd1234\n", stderr: "warn\n" }]]);
    const res = body(await handleDockerExec({ container: "web", command: ["sh", "-c", "exit 2"], user: "node", workdir: "/app", env: { TOKEN: "abcd1234" } }));
    expect(fake.calls[0].args).toEqual(["exec", "--user=node", "--workdir=/app", "--env=TOKEN=abcd1234", "web", "sh", "-c", "exit 2"]);
    expect(res.exitCode).toBe(2);
    expect(res.stdout).toBe("value=***\n");
  });

  it("exec turns a daemon error into an error", async () => {
    fakeDocker([["exec", { exitCode: 1, stderr: "Error response from daemon: container abc is not running" }]]);
    const res = await handleDockerExec({ container: "web", command: ["true"] });
    expect(res.isError).toBe(true);
  });

  it("exec reports a timeout with the partial output", async () => {
    fakeDocker([["exec", { timedOut: true, exitCode: null, stdout: "partial" }]]);
    const res = body(await handleDockerExec({ container: "web", command: ["sleep", "100"], timeoutMs: 1000 }));
    expect(res.timedOut).toBe(true);
    expect(res.stdout).toBe("partial");
  });

  it("cp confines the host side", async () => {
    const fake = fakeDocker([["cp", {}]]);
    const ok = body(await handleDockerCp({ container: "web", direction: "from", containerPath: "/etc/hosts", hostPath: "hosts.txt" }));
    expect(fake.calls[0].args).toEqual(["cp", "web:/etc/hosts", path.join(root, "hosts.txt")]);
    expect(ok.success).toBe(true);
    const bad = await handleDockerCp({ container: "web", direction: "from", containerPath: "/etc/hosts", hostPath: "../escape.txt" });
    expect(bad.isError).toBe(true);
  });
});

describe("images, build, registry", () => {
  it("build passes context, Dockerfile, tags, args, target and returns the image id", async () => {
    fs.mkdirSync(path.join(root, "svc"));
    const fake = fakeDocker([["build", (call) => {
      const iid = call.args.find((a) => a.startsWith("--iidfile="))!.slice(10);
      fs.writeFileSync(iid, "sha256:feed\n");
      return { stderr: "#5 RUN echo s3cr3tv4lue\n#6 DONE\n" };
    }]]);
    const res = body(await handleDockerBuild({
      path: "svc", dockerfile: "svc/Dockerfile.prod", tags: ["app:dev"], buildArgs: { NPM_TOKEN: "s3cr3tv4lue" },
      target: "runtime", platform: "linux/amd64", noCache: true,
    }));
    const args = fake.calls[0].args;
    expect(args).toContain(`--file=${path.join(root, "svc", "Dockerfile.prod")}`);
    expect(args).toContain("--tag=app:dev");
    expect(args).toContain("--build-arg=NPM_TOKEN=s3cr3tv4lue");
    expect(args).toContain("--target=runtime");
    expect(args).toContain("--no-cache");
    expect(args[args.length - 1]).toBe(path.join(root, "svc"));
    expect(res.imageId).toBe("sha256:feed");
    expect(res.output).not.toContain("s3cr3tv4lue");
    expect(fake.calls[0].opts.keep).toBe("tail");
  });

  it("login sends the password on stdin only and never echoes it", async () => {
    const fake = fakeDocker([["login", { stdout: "Login Succeeded\n" }]]);
    const res = body(await handleDockerRegistry({ action: "login", registry: "ghcr.io", username: "me", password: "pa55word!" }));
    expect(fake.calls[0].args).toEqual(["login", "--username=me", "--password-stdin", "ghcr.io"]);
    expect(fake.calls[0].args.join(" ")).not.toContain("pa55word!");
    expect(fake.calls[0].opts.stdin).toBe("pa55word!");
    expect(JSON.stringify(res)).not.toContain("pa55word!");
  });

  it("image list applies filters and a limit", async () => {
    const fake = fakeDocker([["images", { stdout: jsonl([{ Repository: "a" }, { Repository: "b" }]) }]]);
    const res = body(await handleDockerImages({ action: "list", filters: { dangling: true, label: ["x=1"] }, limit: 1 }));
    expect(fake.calls[0].args).toEqual(["images", "--format", "{{json .}}", "--filter=dangling=true", "--filter=label=x=1"]);
    expect(res.truncated).toBe(true);
  });
});

describe("docker_system", () => {
  it("status reports an unreachable daemon without failing", async () => {
    fakeDocker([
      ["version --format", { exitCode: 1, stdout: JSON.stringify({ Client: { Version: "29.0.1" } }), stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" }],
      ["compose version", { stdout: "2.40.0" }],
    ]);
    const res = body(await handleDockerSystem({ action: "status" }));
    expect(res.daemonReachable).toBe(false);
    expect(res.client.Version).toBe("29.0.1");
    expect(res.daemonError).toMatch(/not running/);
  });

  it("events always runs over a bounded window", async () => {
    const fake = fakeDocker([["events", { stdout: jsonl([{ Action: "start" }, { Action: "die" }]) }]]);
    const res = body(await handleDockerSystem({ action: "events", since: "5m", filters: ["type=container"], limit: 1 }));
    const args = fake.calls[0].args;
    expect(args.some((a) => a.startsWith("--since="))).toBe(true);
    expect(args.some((a) => a.startsWith("--until="))).toBe(true);
    expect(res.events).toEqual([{ Action: "die" }]);
    expect(res.truncated).toBe(true);
  });
});
