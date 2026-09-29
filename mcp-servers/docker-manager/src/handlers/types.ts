// SPDX-License-Identifier: MIT
/**
 * Docker Manager handler types, input schemas and response helpers.
 *
 * The zod schemas here are the single definition of each tool's input: the
 * ListTools JSON Schema is generated from them in index.ts.
 */

import { z } from "zod";
import { DockerError } from "../lib/exec.js";

/** Validate a Docker name (container, image, service, network, volume) */
export function validateDockerName(name: string): string {
  // Docker names: alphanumeric, hyphens, underscores, periods, colons (for tags), slashes (for registries).
  // The leading-character rule is also what stops a value being read as a CLI flag.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]*$/.test(name)) {
    throw new DockerError("INVALID_ARGUMENT", `Invalid Docker name: ${name}`);
  }
  if (name.length > 256) {
    throw new DockerError("INVALID_ARGUMENT", `Docker name too long: ${name}`);
  }
  return name;
}

// ============================================================================
// HANDLER TYPES
// ============================================================================

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============================================================================
// SHARED FIELD SCHEMAS
// ============================================================================

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:@]*$/;
export const DockerName = z.string().min(1).max(256).regex(NAME_RE, "must start with a letter/digit; letters, digits, _ . - / : @");
export const ServiceName = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "invalid compose service name");
export const ContextName = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "invalid docker context name");
export const EnvKey = z.string().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/, "invalid environment variable name");
export const EnvMap = z.record(EnvKey, z.string().max(32_768));
export const LabelMap = z.record(z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9_.\-/]*$/), z.string().max(4096));
/** A label filter: `key` (label present) or `key=value`. */
export const LabelFilter = z.string().min(1).max(512).regex(/^[A-Za-z0-9][^\s=]*(=\S*)?$/, "label filter must be key or key=value");
/** Time values docker accepts for since/until: durations (10m, 2h30m), Unix timestamps, RFC3339 dates. */
export const TimeValue = z.string().min(1).max(64).regex(/^[0-9A-Za-z:.+\-]+$/, "use a duration (10m), Unix timestamp or RFC3339 date");
/** A command as an argument vector — never a shell string. */
export const Command = z.array(z.string().max(32_768)).min(1).max(256);

const context = ContextName.optional().describe("Docker context for this call (--context); defaults to DOCKER_CONTEXT/current");
const timeoutMs = z.number().int().min(1_000).max(14_400_000).optional().describe("Override the command timeout (ms)");
const maxBytes = z.number().int().min(1_024).max(16 * 1024 * 1024).optional().describe("Cap on returned output bytes");
const limit = z.number().int().min(1).max(5_000).optional().default(200).describe("Max rows returned (truncated:true when cut)");
const revealEnv = z.boolean().optional().default(false).describe("Show env values verbatim (default: redacted)");

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const DockerPsSchema = z.object({
  all: z.boolean().optional().default(false).describe("Include stopped containers"),
  filters: z.object({
    status: z.array(z.enum(["created", "restarting", "running", "removing", "paused", "exited", "dead"])).optional(),
    label: z.array(LabelFilter).optional(),
    name: z.string().min(1).max(256).regex(/^[^\s-][^\s]*$/).optional().describe("Substring/regex of the name"),
    ancestor: DockerName.optional().describe("Image the container was created from"),
    composeProject: ServiceName.optional().describe("Compose project name"),
    network: DockerName.optional(),
    health: z.enum(["starting", "healthy", "unhealthy", "none"]).optional(),
  }).optional(),
  includeLabels: z.boolean().optional().default(false).describe("Return the full Labels string (default: compose project/service only)"),
  limit,
  context,
});

export const ContainerActionSchema = z.object({
  container: DockerName.describe("Container name or ID"),
  action: z.enum([
    "start", "stop", "restart", "kill", "pause", "unpause", "remove", "rename",
    "logs", "inspect", "top", "port", "diff", "wait", "health", "stats",
  ]),
  tail: z.number().int().min(1).max(10000).optional().default(100).describe(
    "Number of log lines to return (for logs action). Min 1, max 10000."
  ),
  since: TimeValue.optional().describe("logs: only lines since (10m, RFC3339, Unix ts)"),
  until: TimeValue.optional().describe("logs: only lines before this time"),
  timestamps: z.boolean().optional().default(false).describe("logs: prefix lines with timestamps"),
  grep: z.string().min(1).max(512).optional().describe("logs: keep only lines containing this text"),
  grepIgnoreCase: z.boolean().optional().default(false),
  followSeconds: z.number().int().min(1).max(300).optional().describe("logs: follow for N seconds, then stop"),
  maxBytes,
  stopTimeout: z.number().int().min(0).max(600).optional().describe("stop/restart: seconds before SIGKILL"),
  signal: z.string().regex(/^[A-Z0-9+]{1,16}$/).optional().describe("kill: signal (default KILL)"),
  force: z.boolean().optional().default(false).describe("remove: kill a running container first"),
  removeVolumes: z.boolean().optional().default(false).describe("remove: also delete its anonymous volumes"),
  newName: DockerName.optional().describe("rename: the new name"),
  revealEnv,
  waitTimeoutMs: z.number().int().min(1_000).max(3_600_000).optional().describe("wait: give up after (ms)"),
  context,
});

export const DockerRunSchema = z.object({
  image: DockerName,
  name: DockerName.optional(),
  command: z.array(z.string().max(32_768)).max(256).optional().describe("Command + args (argument vector)"),
  entrypoint: z.string().min(1).max(1024).optional(),
  create: z.boolean().optional().default(false).describe("Create without starting (docker create)"),
  detach: z.boolean().optional().default(true).describe("Run in background; false waits for exit (bounded)"),
  rm: z.boolean().optional().default(false).describe("Remove the container when it exits (--rm)"),
  ports: z.array(z.string().regex(/^[0-9A-Za-z.:[\]/-]{1,64}$/)).max(64).optional().describe("e.g. 8080:80, 127.0.0.1:5432:5432/tcp"),
  env: EnvMap.optional(),
  envFile: z.string().min(1).max(4096).optional().describe("Host env file (confined to allowed roots)"),
  volumes: z.array(z.object({
    source: z.string().min(1).max(4096).describe("Named volume, or host path (confined to allowed roots)"),
    target: z.string().min(1).max(4096).regex(/^[^,\0]+$/),
    readOnly: z.boolean().optional(),
  })).max(64).optional(),
  network: DockerName.optional(),
  restart: z.string().regex(/^(no|always|unless-stopped|on-failure(:\d{1,4})?)$/).optional(),
  cpus: z.union([z.number().positive().max(1024), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
  memory: z.string().regex(/^\d+[bkmgBKMG]?$/).optional().describe("e.g. 512m, 2g"),
  labels: LabelMap.optional(),
  workdir: z.string().min(1).max(4096).optional(),
  user: z.string().regex(/^[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$/).optional(),
  platform: z.string().regex(/^[a-z0-9]+\/[a-z0-9_]+(\/[a-z0-9]+)?$/).optional(),
  hostname: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/).optional(),
  pull: z.enum(["always", "missing", "never"]).optional(),
  timeoutMs,
  maxBytes,
  context,
});

export const DockerExecSchema = z.object({
  container: DockerName,
  command: Command.describe("Command + args (argument vector, no shell)"),
  user: z.string().regex(/^[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$/).optional(),
  workdir: z.string().min(1).max(4096).optional(),
  env: EnvMap.optional(),
  privileged: z.boolean().optional().default(false),
  timeoutMs,
  maxBytes,
  context,
});

export const DockerCpSchema = z.object({
  container: DockerName,
  direction: z.enum(["to", "from"]).describe("to: host→container, from: container→host"),
  containerPath: z.string().min(1).max(4096).regex(/^[^\0-][^\0]*$/),
  hostPath: z.string().min(1).max(4096).describe("Host path (confined to allowed roots)"),
  followLink: z.boolean().optional().default(false),
  context,
});

const composeCommon = {
  projectDir: z.string().min(1).max(4096).optional().describe("Compose project directory (default: server cwd)"),
  files: z.array(z.string().min(1).max(4096)).max(16).optional().describe("Compose files (-f), in order"),
  projectName: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/).optional().describe("Project name (-p)"),
  profiles: z.array(ServiceName).max(32).optional(),
  envFile: z.string().min(1).max(4096).optional().describe("--env-file for interpolation"),
};

export const ComposeActionSchema = z.object({
  action: z.enum([
    "up", "down", "ps", "logs", "build", "pull", "restart", "stop", "start",
    "exec", "run", "config", "top", "images", "ls",
  ]),
  ...composeCommon,
  service: ServiceName.optional().describe("Specific service name"),
  services: z.array(ServiceName).max(64).optional().describe("Subset of services"),
  detach: z.boolean().optional().default(true),
  build: z.boolean().optional().describe("Build images before starting (for up)"),
  forceRecreate: z.boolean().optional(),
  wait: z.boolean().optional().describe("up: wait until services are running/healthy"),
  waitTimeoutSeconds: z.number().int().min(1).max(3600).optional(),
  removeOrphans: z.boolean().optional(),
  volumes: z.boolean().optional().default(false).describe("down: ALSO delete named + anonymous volumes"),
  all: z.boolean().optional().describe("ps: include stopped; ls: include stopped projects"),
  noCache: z.boolean().optional(),
  stopTimeout: z.number().int().min(0).max(600).optional(),
  tail: z.number().int().min(1).max(10000).optional().default(100),
  since: TimeValue.optional(),
  until: TimeValue.optional(),
  timestamps: z.boolean().optional().default(false),
  grep: z.string().min(1).max(512).optional(),
  grepIgnoreCase: z.boolean().optional().default(false),
  followSeconds: z.number().int().min(1).max(300).optional(),
  command: z.array(z.string().max(32_768)).max(256).optional().describe("exec/run: command + args"),
  user: z.string().regex(/^[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$/).optional(),
  workdir: z.string().min(1).max(4096).optional(),
  env: EnvMap.optional(),
  rm: z.boolean().optional().default(true).describe("run: remove the one-off container after"),
  noDeps: z.boolean().optional(),
  validateOnly: z.boolean().optional().default(false).describe("config: only validate"),
  revealEnv,
  timeoutMs,
  maxBytes,
  context,
});

export const ImageActionSchema = z.object({
  action: z.enum(["list", "pull", "remove", "inspect", "history", "tag", "push", "search", "save", "load"]),
  image: DockerName.optional().describe("Image name (required for pull/remove/inspect)"),
  targetTag: DockerName.optional().describe("tag: the new reference"),
  all: z.boolean().optional().default(false),
  filters: z.object({
    dangling: z.boolean().optional(),
    reference: z.string().regex(/^[a-zA-Z0-9*][a-zA-Z0-9_.\-/:@*]*$/).optional(),
    label: z.array(LabelFilter).optional(),
    before: DockerName.optional(),
    since: DockerName.optional(),
  }).optional(),
  platform: z.string().regex(/^[a-z0-9]+\/[a-z0-9_]+(\/[a-z0-9]+)?$/).optional(),
  force: z.boolean().optional().default(false).describe("remove: force (untag from all references)"),
  noPrune: z.boolean().optional().default(false),
  term: z.string().min(1).max(256).regex(/^[^-\s][^\s]*$/).optional().describe("search: registry search term"),
  path: z.string().min(1).max(4096).optional().describe("save/load: tar archive on the host (confined)"),
  revealEnv,
  limit,
  timeoutMs,
  context,
});

export const DockerBuildSchema = z.object({
  path: z.string().min(1).max(4096).optional().default(".").describe("Build context directory (confined)"),
  dockerfile: z.string().min(1).max(4096).optional().describe("Dockerfile path (confined)"),
  tags: z.array(DockerName).max(32).optional(),
  buildArgs: EnvMap.optional(),
  target: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/).optional(),
  platform: z.string().regex(/^[a-z0-9]+\/[a-z0-9_]+(\/[a-z0-9]+)?(,[a-z0-9]+\/[a-z0-9_]+(\/[a-z0-9]+)?)*$/).optional(),
  noCache: z.boolean().optional().default(false),
  pull: z.boolean().optional().default(false),
  labels: LabelMap.optional(),
  timeoutMs,
  maxBytes,
  context,
});

export const DockerRegistrySchema = z.object({
  action: z.enum(["login", "logout"]),
  registry: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.\-:/]*$/).optional().describe("Registry host (default Docker Hub)"),
  username: z.string().min(1).max(256).regex(/^[^\s-][^\s]*$/).optional(),
  password: z.string().min(1).max(8192).optional().describe("Sent via stdin, never echoed"),
  passwordEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional().describe("Read the password from this server env var"),
  context,
});

export const DockerStatsSchema = z.object({
  container: DockerName.optional(),
  containers: z.array(DockerName).max(100).optional(),
  all: z.boolean().optional().default(false).describe("Include stopped containers"),
  context,
});

export const NetworksSchema = z.object({
  action: z.enum(["list", "inspect", "create", "remove", "connect", "disconnect", "prune"]).optional().default("list"),
  network: DockerName.optional(),
  container: DockerName.optional(),
  driver: z.string().regex(/^[a-z0-9][a-z0-9_.\-/]*$/).optional(),
  subnet: z.string().regex(/^[0-9a-fA-F.:]+\/\d{1,3}$/).optional(),
  gateway: z.string().regex(/^[0-9a-fA-F.:]+$/).optional(),
  internal: z.boolean().optional(),
  attachable: z.boolean().optional(),
  labels: LabelMap.optional(),
  aliases: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/)).max(32).optional(),
  ip: z.string().regex(/^[0-9a-fA-F.:]+$/).optional(),
  force: z.boolean().optional().default(false),
  filters: z.object({
    label: z.array(LabelFilter).optional(),
    driver: z.string().regex(/^[a-z0-9][a-z0-9_.\-/]*$/).optional(),
    name: z.string().regex(/^[^\s-][^\s]*$/).optional(),
  }).optional(),
  dryRun: z.boolean().optional().default(true).describe("prune: preview only (default true)"),
  until: TimeValue.optional(),
  limit,
  context,
});

export const VolumesSchema = z.object({
  action: z.enum(["list", "inspect", "create", "remove", "prune"]).optional().default("list"),
  volume: DockerName.optional(),
  driver: z.string().regex(/^[a-z0-9][a-z0-9_.\-/]*$/).optional(),
  labels: LabelMap.optional(),
  driverOpts: z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/), z.string().max(4096)).optional(),
  force: z.boolean().optional().default(false),
  filters: z.object({
    dangling: z.boolean().optional(),
    label: z.array(LabelFilter).optional(),
    driver: z.string().regex(/^[a-z0-9][a-z0-9_.\-/]*$/).optional(),
    name: z.string().regex(/^[^\s-][^\s]*$/).optional(),
  }).optional(),
  dryRun: z.boolean().optional().default(true).describe("prune: preview only (default true)"),
  all: z.boolean().optional().default(false).describe("prune: named volumes too, not only anonymous"),
  limit,
  context,
});

export const SystemSchema = z.object({
  action: z.enum(["status", "df", "info", "version", "events", "contexts"]),
  verbose: z.boolean().optional().default(false).describe("df: per-object breakdown"),
  since: TimeValue.optional().describe("events: window start (default 10m)"),
  until: TimeValue.optional().describe("events: window end (default now)"),
  filters: z.array(z.string().regex(/^(type|container|image|event|label|network|volume|daemon|scope)=\S+$/)).max(16).optional(),
  limit,
  context,
});

export const CleanupUnusedSchema = z.object({
  target: z.enum(["all", "images", "containers", "volumes", "networks", "buildcache"]).optional().default("all"),
  dryRun: z.boolean().optional().default(true).describe("Preview only (default true)"),
  allImages: z.boolean().optional().default(false).describe("Images: all unused, not only dangling (prune -a)"),
  includeVolumes: z.boolean().optional().default(false).describe("Required to delete volumes (data loss)"),
  allVolumes: z.boolean().optional().default(false).describe("Volumes: named too, not only anonymous"),
  until: TimeValue.optional().describe("Only objects created before (24h, RFC3339, Unix ts)"),
  labels: z.array(LabelFilter).max(16).optional(),
  limit,
  context,
});

// ============================================================================
// HELPERS
// ============================================================================

export function jsonResponse(data: object): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function errorResponse(message: string, extra: Record<string, unknown> = {}): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }) }],
    isError: true,
  };
}

/** Wrap a handler: validate input, turn DockerError/ZodError into structured error results. */
export function defineHandler<S extends z.ZodType>(
  schema: S,
  fn: (input: z.output<S>) => Promise<object>,
): Handler {
  return async (args) => {
    const parsed = schema.safeParse(args ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      return errorResponse(`Invalid arguments: ${issues.join("; ")}`, { code: "INVALID_ARGUMENT" });
    }
    try {
      return jsonResponse(await fn(parsed.data));
    } catch (e) {
      if (e instanceof DockerError) {
        return errorResponse(e.message, { code: e.code, ...e.details });
      }
      return errorResponse(e instanceof Error ? e.message : String(e));
    }
  };
}

/** Throw INVALID_ARGUMENT unless `value` is present. */
export function required<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null || value === "") {
    throw new DockerError("INVALID_ARGUMENT", `'${what}' is required for this action`);
  }
  return value;
}
