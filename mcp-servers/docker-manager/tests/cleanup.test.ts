// SPDX-License-Identifier: MIT
/**
 * cleanup_unused: the preview must be exactly what the real prune deletes.
 *
 * Every test here fails on the pre-2.3.0 handler, which listed dangling images
 * while running `image prune -a`, listed all custom networks including in-use
 * ones, defaulted to dryRun:false and wiped volumes under target "all".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { handleCleanupUnused } from "../src/handlers/cleanup.js";
import { CleanupUnusedSchema } from "../src/handlers/types.js";
import { handleDockerNetworks, handleDockerVolumes } from "../src/handlers/resources.js";
import { body, fakeDocker, jsonl, restoreRunner, type Call, type Route } from "./helpers.js";

const OLD = "2020-01-01T00:00:00.000000000Z";
const NEW = new Date().toISOString();

const containers = [
  { Id: "c-run", Name: "/run", Image: "sha256:img-dangling-inuse", ImageRef: "x", State: "running", Created: OLD, Config: { Labels: { keep: "1" } }, Mounts: [{ Type: "volume", Name: "v-used" }] },
  { Id: "c-exited", Name: "/exited", Image: "sha256:img-stopped-only", ImageRef: "old:1", State: "exited", Created: OLD, Config: { Labels: { team: "a" } }, Mounts: [{ Type: "volume", Name: "v-stopped-anon" }] },
  { Id: "c-created", Name: "/created", Image: "sha256:img-used", ImageRef: "app:1", State: "created", Created: NEW, Config: { Labels: {} }, Mounts: [] },
];
const images = [
  { Id: "sha256:img-dangling-inuse", RepoTags: [], Created: OLD, Config: {}, Size: 10 },
  { Id: "sha256:img-stopped-only", RepoTags: ["old:1"], Created: OLD, Config: { Labels: { team: "a" } }, Size: 20 },
  { Id: "sha256:img-used", RepoTags: ["app:1"], Created: OLD, Config: { Labels: null }, Size: 30 },
  { Id: "sha256:img-dangling", RepoTags: [], Created: OLD, Config: { Env: ["X=1"] }, Size: 40 },
  { Id: "sha256:img-unused-tagged", RepoTags: ["unused:1"], Created: NEW, Config: {}, Size: 50 },
];
const networks = [
  { Id: "n-bridge", Name: "bridge", Driver: "bridge", Scope: "local", Created: OLD, Labels: {}, Containers: {} },
  { Id: "n-host", Name: "host", Driver: "host", Scope: "local", Created: OLD, Labels: {}, Containers: {} },
  { Id: "n-none", Name: "none", Driver: "null", Scope: "local", Created: OLD, Labels: {}, Containers: {} },
  { Id: "n-inuse", Name: "app_default", Driver: "bridge", Scope: "local", Created: OLD, Labels: {}, Containers: { "c-run": {} } },
  { Id: "n-free", Name: "stale_default", Driver: "bridge", Scope: "local", Created: OLD, Labels: { team: "a" }, Containers: {} },
  { Id: "n-ingress", Name: "ingress", Driver: "overlay", Scope: "swarm", Created: OLD, Labels: {}, Containers: null, Ingress: true },
];
const ANON = { "com.docker.volume.anonymous": "" };
const volumes = [
  { Name: "v-used", Driver: "local", CreatedAt: OLD, Labels: ANON },
  { Name: "v-stopped-anon", Driver: "local", CreatedAt: OLD, Labels: ANON },
  { Name: "v-named-free", Driver: "local", CreatedAt: OLD, Labels: null },
  { Name: "v-anon-free", Driver: "local", CreatedAt: OLD, Labels: ANON },
];

function inspectReply<T extends Record<string, unknown>>(rows: T[], key: "Id" | "Name") {
  return (call: Call) => {
    const ids = call.args.slice(call.args.indexOf("--format") + 2);
    return { stdout: jsonl(rows.filter((r) => ids.includes(String(r[key])))) };
  };
}

function routes(extra: Route[] = []): Route[] {
  return [
    ...extra,
    ["ps -aq --no-trunc", { stdout: containers.map((c) => c.Id).join("\n") }],
    ["container inspect", inspectReply(containers, "Id")],
    ["images -q --no-trunc", { stdout: images.map((i) => i.Id).join("\n") }],
    ["image inspect", inspectReply(images, "Id")],
    ["network ls -q", { stdout: networks.map((n) => n.Id).join("\n") }],
    ["network inspect", inspectReply(networks, "Id")],
    ["volume ls -q", { stdout: volumes.map((v) => v.Name).join("\n") }],
    ["volume inspect", inspectReply(volumes, "Name")],
    ["version --format", { stdout: "1.52\n" }],
    ["system df", { stdout: jsonl([{ Type: "Build Cache", Size: "2GB", Reclaimable: "1.5GB" }]) }],
    [/prune/, { stdout: "Deleted Things:\nobj1\nobj2\n\nTotal reclaimed space: 1.2GB\n" }],
  ];
}

const short = (a: string[]) => a.map((s) => s.slice(0, 12));
const names = (section: { items: Array<{ name?: string; id?: string; tags?: string[] }> }) =>
  section.items.map((i) => i.name ?? i.id);

beforeEach(() => {
  process.env.DOCKER_MCP_ALLOWED_ROOTS = process.cwd();
});
afterEach(() => restoreRunner());

describe("cleanup_unused dry run", () => {
  it("defaults to a dry run and never invokes prune", async () => {
    const fake = fakeDocker(routes());
    const res = body(await handleCleanupUnused({}));
    expect(res.dryRun).toBe(true);
    expect(fake.find(/prune/)).toHaveLength(0);
    expect(fake.find(/system prune/)).toHaveLength(0);
  });

  it("excludes volumes from target all unless includeVolumes is set", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "all" }));
    expect(res.wouldRemove.volumes).toBeUndefined();
    expect(res.skipped.volumes).toMatch(/includeVolumes/);
  });

  it("lists prunable containers: created, exited, dead — never running", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "containers" }));
    expect(names(res.wouldRemove.containers).sort()).toEqual(["created", "exited"]);
  });

  it("lists only dangling images not used by a container (image prune default)", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "images" }));
    const ids = res.wouldRemove.images.items.map((i: { id: string }) => i.id);
    // The dangling image a running container uses is kept by prune, so it is not previewed.
    expect(ids).toEqual(short(["img-dangling"]));
  });

  it("with allImages lists every unused image, as prune -a deletes", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "images", allImages: true }));
    const ids = res.wouldRemove.images.items.map((i: { id: string }) => i.id).sort();
    // img-used and img-stopped-only are still referenced by (non-pruned) containers.
    expect(ids).toEqual(short(["img-dangling", "img-unused-tagged"]));
  });

  it("previews as if containers were pruned first (target all)", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "all", allImages: true }));
    const ids = res.wouldRemove.images.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(short(["img-dangling", "img-stopped-only", "img-unused-tagged", "img-used"]));
  });

  it("lists only unused, non-predefined, non-ingress networks", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "networks" }));
    expect(names(res.wouldRemove.networks)).toEqual(["stale_default"]);
  });

  it("lists only unreferenced anonymous volumes by default (API >= 1.42)", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "volumes" }));
    // v-stopped-anon is still referenced by the stopped container, which this run does not remove.
    expect(names(res.wouldRemove.volumes)).toEqual(["v-anon-free"]);
  });

  it("includes named volumes with allVolumes, and volumes freed by the container prune", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "all", includeVolumes: true, allVolumes: true }));
    expect(names(res.wouldRemove.volumes).sort()).toEqual(["v-anon-free", "v-named-free", "v-stopped-anon"]);
  });

  it("uses legacy all-dangling volume semantics on an old daemon", async () => {
    fakeDocker(routes([["version --format", { stdout: "1.41\n" }]]));
    const res = body(await handleCleanupUnused({ target: "volumes" }));
    expect(names(res.wouldRemove.volumes).sort()).toEqual(["v-anon-free", "v-named-free"]);
  });

  it("applies label and until filters with prune semantics", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "all", labels: ["team=a"], until: "24h", allImages: true }));
    expect(names(res.wouldRemove.containers)).toEqual(["exited"]);
    expect(names(res.wouldRemove.networks)).toEqual(["stale_default"]);
    expect(res.wouldRemove.images.items.map((i: { id: string }) => i.id)).toEqual(short(["img-stopped-only"]));
  });

  it("rejects until for volumes, which volume prune does not support", async () => {
    fakeDocker(routes());
    const res = await handleCleanupUnused({ target: "volumes", until: "24h" });
    expect(res.isError).toBe(true);
    expect(body(res).code).toBe("INVALID_ARGUMENT");
  });

  it("tolerates an object that vanished between listing and inspect", async () => {
    fakeDocker(routes([
      ["ps -aq --no-trunc", { stdout: "c-run\nc-gone" }],
      ["container inspect", (call) => ({
        stdout: jsonl(containers.filter((c) => call.args.includes(c.Id))),
        stderr: "Error response from daemon: No such container: c-gone",
        exitCode: 1,
      })],
    ]));
    const res = await handleCleanupUnused({ target: "containers" });
    expect(res.isError).toBeFalsy();
  });

  it("reports the build cache as a labelled summary, not an empty list", async () => {
    fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "buildcache" }));
    expect(res.wouldRemove.buildcache.reclaimable).toBe("1.5GB");
    expect(res.wouldRemove.buildcache.note).toMatch(/Summary only/);
  });
});

describe("cleanup_unused real run", () => {
  it("runs only per-type prunes — never system prune -a --volumes — with no preview round trips", async () => {
    const fake = fakeDocker(routes());
    const res = body(await handleCleanupUnused({ target: "all", dryRun: false }));
    const prunes = fake.find(/prune/).map((c) => c.joined);
    expect(prunes).toEqual([
      "container prune --force",
      "network prune --force",
      "image prune --force",
      "builder prune --force",
    ]);
    expect(fake.calls).toHaveLength(prunes.length);
    expect(res.results.images.reclaimedSpace).toBe("1.2GB");
    expect(res.results.images.deleted).toEqual(["obj1", "obj2"]);
  });

  it("forwards allImages, allVolumes, until and label filters", async () => {
    const fake = fakeDocker(routes());
    await handleCleanupUnused({ target: "images", dryRun: false, allImages: true, until: "24h", labels: ["team=a"] });
    await handleCleanupUnused({ target: "volumes", dryRun: false, includeVolumes: true, allVolumes: true, labels: ["team=a"] });
    const prunes = fake.find(/prune/).map((c) => c.joined);
    expect(prunes).toEqual([
      "image prune --force --all --filter=until=24h --filter=label=team=a",
      "volume prune --force --all --filter=label=team=a",
    ]);
  });

  it("refuses to delete volumes without includeVolumes", async () => {
    const fake = fakeDocker(routes());
    const res = await handleCleanupUnused({ target: "volumes", dryRun: false });
    expect(res.isError).toBe(true);
    // Refused before any docker call, so it holds even with the daemon down.
    expect(fake.calls).toHaveLength(0);
  });

  it("no longer advertises a force flag that silently did nothing", () => {
    const schema = z.toJSONSchema(CleanupUnusedSchema, { io: "input" }) as { properties: Record<string, unknown> };
    expect(schema.properties).not.toHaveProperty("force");
    expect(schema.properties.dryRun).toMatchObject({ default: true });
  });
});

describe("prune via the network and volume tools", () => {
  it("docker_networks prune defaults to the same exact preview", async () => {
    const fake = fakeDocker(routes());
    const res = body(await handleDockerNetworks({ action: "prune" }));
    expect(res.dryRun).toBe(true);
    expect(names(res.wouldRemove.networks)).toEqual(["stale_default"]);
    expect(fake.find(/prune/)).toHaveLength(0);
  });

  it("docker_volumes prune defaults to a dry run", async () => {
    const fake = fakeDocker(routes());
    const res = body(await handleDockerVolumes({ action: "prune", all: true }));
    expect(res.dryRun).toBe(true);
    expect(names(res.wouldRemove.volumes).sort()).toEqual(["v-anon-free", "v-named-free"]);
    expect(fake.find(/prune/)).toHaveLength(0);
  });
});
