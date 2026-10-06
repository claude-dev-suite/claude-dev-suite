// SPDX-License-Identifier: MIT
/**
 * Headless install — the wizard without the dashboard.
 *
 * Detects the project's stack, selects what the wizard would pre-select, shows
 * the plan, and installs it through the same InstallationService the dashboard
 * calls. Shipped as `npx @claude-dev-suite/cli init` (see `cli/` at the repo
 * root), and runnable from a checkout as `node dist/cli/dev-suite.js init`.
 *
 * Usage:
 *   dev-suite init [path] [--yes] [--dry-run] [--json]
 *                  [--targets a,b] [--agents a,b] [--mcp a,b] [--rules a,b]
 *                  [--no-backup]
 *
 *   path         Project directory (default: the current directory).
 *   --yes, -y    Install without asking. Required when stdin is not a TTY.
 *   --dry-run    Print the plan and exit; writes nothing.
 *   --json       Machine-readable output on stdout (plan, or install result).
 *   --targets    Assistants to configure, replacing the detected ones.
 *   --agents     Agents to install, replacing the recommended ones.
 *   --mcp        MCP servers, replacing the recommended ones (`none` for none;
 *                skill-loader is still added by the installer, as in the wizard).
 *   --rules      Rule templates, replacing the recommended ones (`none` for none).
 *   --no-backup  Skip the pre-install snapshot (not recommended).
 *
 * Exit codes: 0 installed / dry run / declined, 1 install failed,
 * 3 usage error (unknown flag or id, missing path, no TTY without --yes).
 *
 * The services are imported lazily, inside run(): the logger reads
 * DEV_SUITE_HEADLESS when the first service module loads, so the entry point
 * must be able to set it before anything that logs is evaluated.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

type Lib = typeof import('../lib.js');
type DetectionResult = import('../lib.js').DetectionResult;
type TargetId = import('../lib.js').TargetId;

export interface InitArgs {
  project?: string;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  backup: boolean;
  targets?: string[];
  agents?: string[];
  mcp?: string[];
  rules?: string[];
  help: boolean;
  error?: string;
}

export interface InitPlan {
  projectPath: string;
  detection: DetectionResult;
  targets: TargetId[];
  agents: string[];
  mcpServers: string[];
  rules: string[];
  /** Values the wizard would prefill on its own: metadata defaults and the project's .env. */
  envVars: Record<string, string>;
  /** Required variables nothing could fill; the servers that need them start unconfigured. */
  missingEnvVars: Array<{ name: string; mcpServer?: string; secret: boolean }>;
}

export function parseInitArgs(argv: string[]): InitArgs {
  const args: InitArgs = { yes: false, dryRun: false, json: false, backup: true, help: false };
  const list = (v: string | undefined): string[] =>
    v === undefined || v === 'none' ? [] : v.split(',').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const needValue = (): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) {
        args.error ??= `${a} needs a value`;
        return undefined;
      }
      i++;
      return v;
    };
    switch (a) {
      case '--yes': case '-y': args.yes = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--json': args.json = true; break;
      case '--no-backup': args.backup = false; break;
      case '--help': case '-h': args.help = true; break;
      case '--targets': args.targets = list(needValue()); break;
      case '--agents': args.agents = list(needValue()); break;
      case '--mcp': args.mcp = list(needValue()); break;
      case '--rules': args.rules = list(needValue()); break;
      default:
        if (a.startsWith('-')) args.error ??= `Unknown flag: ${a}`;
        else if (args.project === undefined) args.project = a;
        else args.error ??= `Unexpected argument: ${a}`;
    }
  }
  return args;
}

export const INIT_USAGE = `Usage: dev-suite init [path] [options]

Detects the project's stack and installs the matching agents, skills,
MCP servers and rules for the AI assistants the project uses.

Options:
  -y, --yes          Install without asking (required without a TTY)
      --dry-run      Show what would be installed, write nothing
      --json         Machine-readable output
      --targets a,b  Assistants to configure, e.g. claude-code,cursor
      --agents a,b   Agents to install instead of the recommended ones
      --mcp a,b      MCP servers instead of the recommended ones ('none' for none)
      --rules a,b    Rule templates instead of the recommended ones ('none' for none)
      --no-backup    Skip the pre-install snapshot
  -h, --help         Show this help
`;

/**
 * Work out what to install. Read-only: detection, catalog and recommendations.
 * Throws a UsageError for an id that does not exist in the catalog, so a typo
 * never silently installs less than was asked for.
 */
export async function buildInitPlan(lib: Lib, projectPath: string, args: InitArgs): Promise<InitPlan> {
  const detectionService = new lib.DetectionService();
  const agentsService = new lib.AgentsService();

  const detection = await detectionService.detectProject(projectPath);
  const recommended = detectionService.getRecommendations(detection);

  const [catalogAgents, catalogMcp, catalogRules, assistants] = await Promise.all([
    agentsService.getAgents(),
    agentsService.getMcpServers(),
    new lib.RulesService().getRules(),
    new lib.AssistantDetectionService().detectAssistants(projectPath),
  ]);

  const known = (kind: string, ids: string[], valid: Set<string>): string[] => {
    const unknown = ids.filter(id => !valid.has(id));
    if (unknown.length > 0) {
      throw new UsageError(`Unknown ${kind}: ${unknown.join(', ')}`);
    }
    return ids;
  };

  const agentIds = new Set(catalogAgents.map(a => a.id));
  const mcpIds = new Set(catalogMcp.map(m => m.name));
  const ruleIds = new Set(catalogRules.map(r => r.id));
  const implemented = new Set(lib.listImplementedTargets().map(t => t.id));

  const agents = args.agents
    ? known('agent', args.agents, agentIds)
    : recommended.agents.filter(id => agentIds.has(id));
  const mcpServers = args.mcp
    ? known('MCP server', args.mcp, mcpIds)
    : recommended.mcpServers.filter(id => mcpIds.has(id));
  const rules = args.rules
    ? known('rule', args.rules, ruleIds)
    : catalogRules.filter(r => r.recommended).map(r => r.id);

  let targets: TargetId[];
  if (args.targets) {
    targets = known('assistant', args.targets, implemented as Set<string>) as TargetId[];
    if (targets.length === 0) throw new UsageError('--targets needs at least one assistant');
  } else {
    targets = assistants.filter(a => a.recommended).map(a => a.target);
    if (targets.length === 0) targets = [lib.DEFAULT_TARGET];
  }

  // Same prefill as the wizard's environment step: only values it can find on
  // its own. Nothing is asked for — a missing credential is reported, and the
  // server it belongs to starts unconfigured until the user sets it.
  const envConfigs = await agentsService.getRequiredEnvVars(
    // skill-loader is added by install() itself; its variables are prefilled there.
    mcpServers,
    projectPath
  );
  const envVars: Record<string, string> = {};
  const missingEnvVars: InitPlan['missingEnvVars'] = [];
  for (const cfg of envConfigs) {
    if (cfg.detectedValue) envVars[cfg.name] = cfg.detectedValue;
    else if (cfg.required) {
      missingEnvVars.push({ name: cfg.name, mcpServer: cfg.mcpServer, secret: cfg.secret === true });
    }
  }

  return { projectPath, detection, targets, agents, mcpServers, rules, envVars, missingEnvVars };
}

export class UsageError extends Error {}

function describeStack(d: DetectionResult): string {
  const parts = [
    d.frontend?.metaFramework || d.frontend?.framework,
    d.backend?.framework || d.backend?.runtime,
    d.database?.dbType,
    d.database?.orm,
    d.testing?.unit,
    d.testing?.e2e,
    ...(d.additionalTechnologies ?? []),
  ].filter((p): p is string => !!p);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(', ') : 'nothing recognised';
}

export function formatPlan(plan: InitPlan): string {
  const line = (label: string, items: string[]) =>
    `  ${label.padEnd(13)}${items.length > 0 ? items.join(', ') : '(none)'}`;
  const lines = [
    `Project:       ${plan.projectPath}`,
    `Detected:      ${describeStack(plan.detection)}${plan.detection.isMonorepo ? ' (monorepo)' : ''}`,
    '',
    'Will install:',
    line('assistants', plan.targets),
    line('agents', plan.agents),
    line('mcp servers', plan.mcpServers),
    line('rules', plan.rules),
  ];
  if (plan.missingEnvVars.length > 0) {
    lines.push('', 'Not set (the server starts unconfigured until you set it):');
    for (const v of plan.missingEnvVars) {
      lines.push(`  ${v.name}${v.mcpServer ? `  — ${v.mcpServer}` : ''}${v.secret ? ' (secret)' : ''}`);
    }
  }
  lines.push('', 'A backup of every file it overwrites goes to .dev-suite-backup/.');
  return lines.join('\n');
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise<string>(resolve => rl.question(question, resolve));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export interface InitIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  isTTY: boolean;
  confirm: (question: string) => Promise<boolean>;
}

const defaultIO: InitIO = {
  stdout: s => process.stdout.write(s),
  stderr: s => process.stderr.write(s),
  isTTY: process.stdin.isTTY === true,
  confirm,
};

export async function runInit(argv: string[], io: InitIO = defaultIO): Promise<number> {
  const args = parseInitArgs(argv);
  if (args.help) {
    io.stdout(INIT_USAGE);
    return 0;
  }
  if (args.error) {
    io.stderr(`${args.error}\n\n${INIT_USAGE}`);
    return 3;
  }

  const projectPath = path.resolve(args.project ?? process.cwd());
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    io.stderr(`Not a directory: ${projectPath}\n`);
    return 3;
  }
  if (!args.dryRun && !args.yes && !io.isTTY) {
    io.stderr('No terminal to confirm on: pass --yes to install, or --dry-run to preview.\n');
    return 3;
  }

  const lib: Lib = await import('../lib.js');

  let plan: InitPlan;
  try {
    plan = await buildInitPlan(lib, projectPath, args);
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(`${err.message}\n`);
      return 3;
    }
    throw err;
  }

  if (args.dryRun) {
    io.stdout(args.json ? `${JSON.stringify({ dryRun: true, plan }, null, 2)}\n` : `${formatPlan(plan)}\n`);
    return 0;
  }

  if (!args.json) io.stderr(`${formatPlan(plan)}\n\n`);
  if (!args.yes && !(await io.confirm('Install? [y/N] '))) {
    io.stderr('Nothing installed.\n');
    return 0;
  }

  const installer = new lib.InstallationService();
  const { failed } = await installer.prepareServers(plan.mcpServers);
  if (failed.length > 0) {
    io.stderr(`Warning: could not prepare MCP servers: ${failed.join(', ')} — they will be skipped.\n`);
  }

  try {
    const manifest = await installer.install({
      projectPath,
      agents: plan.agents,
      mcpServers: plan.mcpServers,
      envVars: plan.envVars,
      rules: plan.rules,
      targets: plan.targets,
      detectedStack: plan.detection,
      createBackup: args.backup,
    });
    if (args.json) {
      io.stdout(`${JSON.stringify({ installed: true, plan, manifest }, null, 2)}\n`);
    } else {
      io.stdout(
        [
          'Installed.',
          `  agents:      ${manifest.agents.length}`,
          `  mcp servers: ${manifest.mcpServers.length}`,
          `  files:       ${manifest.files.length}`,
          '',
          'Open the project in your assistant. To change the selection later, run this',
          'again with different flags, or use the Dev-Suite desktop app.',
        ].join('\n') + '\n'
      );
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) io.stdout(`${JSON.stringify({ installed: false, error: message }, null, 2)}\n`);
    io.stderr(
      args.backup
        ? `Install failed; the files it touched were restored: ${message}\n`
        : `Install failed, and with --no-backup some files may be partly written: ${message}\n`
    );
    return 1;
  }
}
