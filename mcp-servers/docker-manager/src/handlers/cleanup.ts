// SPDX-License-Identifier: MIT
/**
 * cleanup_unused — prune with a preview that matches the real run.
 *
 * The old dry run listed dangling images while the real run was `prune -a`,
 * listed dangling volumes while the real run was `system prune -a --volumes`,
 * and listed every custom network including ones in use. This module computes
 * each preview with the daemon's own prune semantics, then runs the per-type
 * prune commands with exactly the same filters:
 *
 *   containers  every container in state created / exited / dead
 *   networks    non-predefined, non-ingress networks with no endpoints
 *               (endpoints exist only for running/paused containers)
 *   images      dangling (untagged) images — or, with allImages, every image —
 *               not used by any container that survives the run
 *   volumes     volumes not referenced by any surviving container; since API
 *               1.42 only anonymous ones unless allVolumes (volume prune -a)
 *   buildcache  summary only: the CLI exposes no per-record listing
 *
 * Deletion order is containers → networks → images → volumes → build cache,
 * and the preview is computed "as if" in that order: an image used only by a
 * stopped container that is itself pruned is listed, because it will go.
 */

import { DockerError, classifyFailure, runDocker } from "../lib/exec.js";
import { parseDockerTime, parseJsonLines, parseReclaimed, parseUntil } from "../lib/parse.js";
import { CleanupUnusedSchema, defineHandler } from "./types.js";
import type { z } from "zod";

export type CleanupInput = z.output<typeof CleanupUnusedSchema>;
type Target = "containers" | "networks" | "images" | "volumes" | "buildcache";
const ORDER: Target[] = ["containers", "networks", "images", "volumes", "buildcache"];

const PRUNABLE_CONTAINER_STATES = new Set(["created", "exited", "dead"]);
const PREDEFINED_NETWORKS = new Set(["bridge", "host", "none"]);
const BIG = 64 * 1024 * 1024;

interface ContainerInfo {
  Id: string; Name: string; Image: string; ImageRef?: string; State: string; Created: string;
  Labels: Record<string, string> | null; Mounts: Array<{ Type?: string; Name?: string }> | null;
}
interface ImageInfo { Id: string; RepoTags: string[] | null; Created: string; Labels: Record<string, string> | null; Size: number }
interface NetworkInfo {
  Id: string; Name: string; Driver: string; Scope: string; Created: string;
  Labels: Record<string, string> | null; Containers: Record<string, unknown> | null; Ingress?: boolean;
}
interface VolumeInfo { Name: string; Driver: string; CreatedAt: string; Labels: Record<string, string> | null }

const FORMATS = {
  container:
    '{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"ImageRef":{{json .Config.Image}},' +
    '"State":{{json .State.Status}},"Created":{{json .Created}},"Config":{{json .Config}},"Mounts":{{json .Mounts}}}',
  image: '{"Id":{{json .Id}},"RepoTags":{{json .RepoTags}},"Created":{{json .Created}},"Config":{{json .Config}},"Size":{{json .Size}}}',
  network:
    '{"Id":{{json .Id}},"Name":{{json .Name}},"Driver":{{json .Driver}},"Scope":{{json .Scope}},"Created":{{json .Created}},' +
    '"Labels":{{json .Labels}},"Containers":{{json .Containers}},"Ingress":{{json .Ingress}}}',
  volume: '{"Name":{{json .Name}},"Driver":{{json .Driver}},"CreatedAt":{{json .CreatedAt}},"Labels":{{json .Labels}}}',
};

async function listIds(args: string[], context?: string): Promise<string[]> {
  const res = await runDocker(args, { context, maxBytes: BIG });
  return [...new Set(res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}

async function inspectMany<T>(kind: keyof typeof FORMATS, ids: string[], context?: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    // An object can disappear between the listing and the inspect (a --rm
    // container exiting): docker still prints the others and reports the missing
    // one on stderr. A vanished object cannot be pruned, so only other errors count.
    const res = await runDocker([kind, "inspect", "--format", FORMATS[kind], ...chunk], { context, maxBytes: BIG, allowNonZero: true });
    if (res.exitCode !== 0) {
      const other = res.stderr.split(/\r?\n/).filter((l) => l.trim() && !/no such (container|image|network|volume|object)/i.test(l));
      if (other.length > 0) throw classifyFailure(res);
    }
    // `.Config.Labels` fails to template on containerd-store images whose
    // Config has no Labels key, so the whole Config is fetched and reduced here.
    for (const row of parseJsonLines<Record<string, unknown>>(res.stdout)) {
      if ("Config" in row) {
        const cfg = row.Config as { Labels?: Record<string, string> | null } | null;
        row.Labels = cfg?.Labels ?? null;
        delete row.Config;
      }
      out.push(row as T);
    }
  }
  return out;
}

export function matchesLabels(labels: Record<string, string> | null | undefined, filters: string[] | undefined): boolean {
  if (!filters || filters.length === 0) return true;
  const l = labels ?? {};
  return filters.every((f) => {
    const eq = f.indexOf("=");
    if (eq < 0) return Object.prototype.hasOwnProperty.call(l, f);
    return l[f.slice(0, eq)] === f.slice(eq + 1);
  });
}

function createdBefore(created: string, cutoff: number | undefined): boolean {
  if (cutoff === undefined) return true;
  const t = parseDockerTime(created);
  return t !== undefined && t < cutoff;
}

function isDangling(img: ImageInfo): boolean {
  const tags = (img.RepoTags ?? []).filter((t) => t && t !== "<none>:<none>");
  return tags.length === 0;
}

async function serverApiVersion(context?: string): Promise<number | undefined> {
  const res = await runDocker(["version", "--format", "{{.Server.APIVersion}}"], { context, allowNonZero: true });
  const v = Number.parseFloat(res.stdout.trim());
  return Number.isFinite(v) ? v : undefined;
}

export interface Plan {
  targets: Target[];
  cutoff?: number;
  containers?: ContainerInfo[];
  networks?: NetworkInfo[];
  images?: ImageInfo[];
  volumes?: VolumeInfo[];
  volumesAnonymousOnly?: boolean;
  buildcache?: { reclaimable?: string; size?: string; note: string };
  skipped: Record<string, string>;
}

function selectTargets(input: CleanupInput): { targets: Target[]; skipped: Record<string, string> } {
  const skipped: Record<string, string> = {};
  if (input.target !== "all") return { targets: [input.target], skipped };
  const targets = ORDER.filter((t) => t !== "volumes" || input.includeVolumes);
  if (!input.includeVolumes) skipped.volumes = "not included: set includeVolumes: true to prune volumes (deletes data)";
  return { targets, skipped };
}

/** Compute exactly what the real run would delete. */
export async function planCleanup(input: CleanupInput): Promise<Plan> {
  const { context } = input;
  const { targets, skipped } = selectTargets(input);
  const cutoff = input.until ? parseUntil(input.until) : undefined;
  const labels = input.labels;
  if (cutoff !== undefined && targets.includes("volumes")) {
    throw new DockerError("INVALID_ARGUMENT", "'until' is not supported by volume prune; drop 'until' or exclude volumes");
  }
  const plan: Plan = { targets, cutoff, skipped };

  const needContainers = targets.some((t) => t === "containers" || t === "images" || t === "volumes");
  const allContainers = needContainers
    ? await inspectMany<ContainerInfo>("container", await listIds(["ps", "-aq", "--no-trunc"], context), context)
    : [];

  const prunedContainerIds = new Set<string>();
  if (targets.includes("containers")) {
    plan.containers = allContainers.filter(
      (c) => PRUNABLE_CONTAINER_STATES.has(c.State) && createdBefore(c.Created, cutoff) && matchesLabels(c.Labels, labels),
    );
    for (const c of plan.containers) prunedContainerIds.add(c.Id);
  }
  const surviving = allContainers.filter((c) => !prunedContainerIds.has(c.Id));

  if (targets.includes("networks")) {
    const nets = await inspectMany<NetworkInfo>("network", await listIds(["network", "ls", "-q", "--no-trunc"], context), context);
    plan.networks = nets.filter(
      (n) =>
        !PREDEFINED_NETWORKS.has(n.Name) &&
        !n.Ingress &&
        Object.keys(n.Containers ?? {}).length === 0 &&
        createdBefore(n.Created, cutoff) &&
        matchesLabels(n.Labels, labels),
    );
  }

  if (targets.includes("images")) {
    const used = new Set(surviving.map((c) => c.Image));
    const imgs = await inspectMany<ImageInfo>("image", await listIds(["images", "-q", "--no-trunc"], context), context);
    plan.images = imgs.filter(
      (img) =>
        !used.has(img.Id) &&
        (input.allImages || isDangling(img)) &&
        createdBefore(img.Created, cutoff) &&
        matchesLabels(img.Labels, labels),
    );
  }

  if (targets.includes("volumes")) {
    const referenced = new Set<string>();
    for (const c of surviving) for (const m of c.Mounts ?? []) if (m.Type === "volume" && m.Name) referenced.add(m.Name);
    const vols = await inspectMany<VolumeInfo>("volume", await listIds(["volume", "ls", "-q"], context), context);
    const api = await serverApiVersion(context);
    // Docker 23 / API 1.42 changed volume prune to anonymous-only by default.
    const anonymousOnly = !input.allVolumes && (api === undefined || api >= 1.42);
    plan.volumesAnonymousOnly = anonymousOnly;
    plan.volumes = vols.filter(
      (v) =>
        !referenced.has(v.Name) &&
        (!anonymousOnly || Object.prototype.hasOwnProperty.call(v.Labels ?? {}, "com.docker.volume.anonymous")) &&
        matchesLabels(v.Labels, labels),
    );
  }

  if (targets.includes("buildcache")) {
    const res = await runDocker(["system", "df", "--format", "{{json .}}"], { context });
    const row = parseJsonLines<Record<string, string>>(res.stdout).find((r) => /build cache/i.test(r.Type ?? ""));
    plan.buildcache = {
      size: row?.Size,
      reclaimable: row?.Reclaimable,
      note: "Summary only: docker has no per-record build-cache listing. The real run is `builder prune` (unused cache)" +
        (cutoff !== undefined || labels?.length ? "; until/label filters apply there but not to this summary." : "."),
    };
  }
  return plan;
}

function limited<T>(items: T[], limit: number) {
  return { count: items.length, items: items.slice(0, limit), truncated: items.length > limit };
}

export function renderPlan(plan: Plan, limit: number) {
  const out: Record<string, unknown> = {};
  if (plan.containers) {
    out.containers = limited(plan.containers.map((c) => ({ id: c.Id.slice(0, 12), name: c.Name.replace(/^\//, ""), state: c.State, image: c.ImageRef, created: c.Created })), limit);
  }
  if (plan.networks) {
    out.networks = limited(plan.networks.map((n) => ({ id: n.Id.slice(0, 12), name: n.Name, driver: n.Driver, created: n.Created })), limit);
  }
  if (plan.images) {
    const totalBytes = plan.images.reduce((s, i) => s + (i.Size ?? 0), 0);
    out.images = {
      ...limited(plan.images.map((i) => ({ id: i.Id.replace(/^sha256:/, "").slice(0, 12), tags: i.RepoTags ?? [], sizeBytes: i.Size, created: i.Created })), limit),
      totalSizeBytes: totalBytes,
      note: "Sizes include layers shared with other images, so actual reclaimed space can be lower.",
    };
  }
  if (plan.volumes) {
    out.volumes = {
      ...limited(plan.volumes.map((v) => ({ name: v.Name, driver: v.Driver, created: v.CreatedAt, anonymous: Object.prototype.hasOwnProperty.call(v.Labels ?? {}, "com.docker.volume.anonymous") })), limit),
      scope: plan.volumesAnonymousOnly ? "anonymous volumes only (set allVolumes for named)" : "anonymous and named volumes",
    };
  }
  if (plan.buildcache) out.buildcache = plan.buildcache;
  return out;
}

function pruneArgs(target: Target, input: CleanupInput, apiVersion: number | undefined): string[] {
  const filters: string[] = [];
  if (input.until && target !== "volumes") filters.push(`--filter=until=${input.until}`);
  if (target !== "buildcache") for (const l of input.labels ?? []) filters.push(`--filter=label=${l}`);
  switch (target) {
    case "containers": return ["container", "prune", "--force", ...filters];
    case "networks": return ["network", "prune", "--force", ...filters];
    case "images": return ["image", "prune", "--force", ...(input.allImages ? ["--all"] : []), ...filters];
    case "volumes":
      return ["volume", "prune", "--force", ...(input.allVolumes && (apiVersion === undefined || apiVersion >= 1.42) ? ["--all"] : []), ...filters];
    case "buildcache": return ["builder", "prune", "--force", ...filters];
  }
}

/** Lines of a prune report that name deleted objects. */
export function parsePruneOutput(stdout: string): { deleted: string[]; reclaimed?: string } {
  // Section headers ("Deleted Containers:") end with a colon; object lines never do.
  const deleted = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith(":") && !/^(Total reclaimed space|WARNING)/i.test(l) && !/^ID\s+RECLAIMABLE/i.test(l));
  return { deleted, reclaimed: parseReclaimed(stdout) };
}

export async function runCleanup(input: CleanupInput) {
  const plan = await planCleanup(input);
  if (input.dryRun) {
    return {
      dryRun: true,
      target: input.target,
      order: plan.targets,
      wouldRemove: renderPlan(plan, input.limit),
      skipped: Object.keys(plan.skipped).length ? plan.skipped : undefined,
      howToApply: "Re-run with dryRun: false to delete exactly these (objects created meanwhile follow the same rules).",
    };
  }

  if (plan.targets.includes("volumes") && !input.includeVolumes) {
    throw new DockerError("INVALID_ARGUMENT", "Deleting volumes destroys data: set includeVolumes: true to confirm (run with dryRun first).");
  }

  const api = plan.targets.includes("volumes") ? await serverApiVersion(input.context) : undefined;
  const results: Record<string, unknown> = {};
  for (const t of plan.targets) {
    const res = await runDocker(pruneArgs(t, input, api), { context: input.context, timeoutMs: 600_000, maxBytes: BIG });
    const parsed = parsePruneOutput(res.stdout);
    results[t] = {
      deletedCount: parsed.deleted.length,
      deleted: parsed.deleted.slice(0, input.limit),
      truncated: parsed.deleted.length > input.limit,
      reclaimedSpace: parsed.reclaimed,
    };
  }
  return {
    dryRun: false,
    target: input.target,
    results,
    skipped: Object.keys(plan.skipped).length ? plan.skipped : undefined,
  };
}

export const handleCleanupUnused = defineHandler(CleanupUnusedSchema, runCleanup);
