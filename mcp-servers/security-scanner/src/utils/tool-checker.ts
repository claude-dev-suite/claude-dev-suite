// SPDX-License-Identifier: MIT
/**
 * Registry of the external tools this server drives: how to find them, how to
 * read their version, what they enable, and how to install them per OS.
 */

import { tmpdir } from 'os';
import { resolveCommand, runTool, type ResolvedCommand } from './exec.js';

export type ToolId =
  | 'trivy'
  | 'osv-scanner'
  | 'semgrep'
  | 'gitleaks'
  | 'trufflehog'
  | 'syft'
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'pip-audit'
  | 'cargo-audit'
  | 'govulncheck'
  | 'git';

interface ToolConfig {
  id: ToolId;
  bin: string;
  versionArgs: string[];
  versionRegex: RegExp;
  enables: string[];
  install: { windows: string; macos: string; linux: string };
}

export const TOOL_CONFIGS: ToolConfig[] = [
  {
    id: 'trivy',
    bin: 'trivy',
    versionArgs: ['--version'],
    versionRegex: /Version:\s*v?(\d+\.\d+\.\d+)/,
    enables: ['dependencies (all ecosystems)', 'container', 'iac', 'secrets', 'licenses', 'sbom'],
    install: {
      windows: 'winget install AquaSecurity.Trivy  (or: scoop install trivy)',
      macos: 'brew install trivy',
      linux: 'apt/yum repo or install script: https://trivy.dev/latest/getting-started/installation/',
    },
  },
  {
    id: 'osv-scanner',
    bin: 'osv-scanner',
    versionArgs: ['--version'],
    versionRegex: /osv-scanner version:\s*v?(\d+\.\d+\.\d+)/,
    enables: ['dependencies (all ecosystems)', 'licenses', 'sbom'],
    install: {
      windows: 'winget install Google.OSVScanner  (or download from https://github.com/google/osv-scanner/releases)',
      macos: 'brew install osv-scanner',
      linux: 'go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest  (or release binary)',
    },
  },
  {
    id: 'semgrep',
    bin: 'semgrep',
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    enables: ['code (SAST)'],
    install: {
      windows: 'python -m pip install semgrep  (native Windows support is beta; WSL also works)',
      macos: 'brew install semgrep  (or: python3 -m pip install semgrep)',
      linux: 'python3 -m pip install semgrep  (or: pipx install semgrep)',
    },
  },
  {
    id: 'gitleaks',
    bin: 'gitleaks',
    versionArgs: ['version'],
    versionRegex: /v?(\d+\.\d+\.\d+)/,
    enables: ['secrets (working tree + git history)'],
    install: {
      windows: 'winget install Gitleaks.Gitleaks  (or: scoop install gitleaks)',
      macos: 'brew install gitleaks',
      linux: 'download from https://github.com/gitleaks/gitleaks/releases  (or distro package)',
    },
  },
  {
    id: 'trufflehog',
    bin: 'trufflehog',
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/,
    enables: ['secrets (working tree + git history, optional live verification)'],
    install: {
      windows: 'download from https://github.com/trufflesecurity/trufflehog/releases',
      macos: 'brew install trufflehog',
      linux: 'curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | sh -s -- -b /usr/local/bin',
    },
  },
  {
    id: 'syft',
    bin: 'syft',
    versionArgs: ['version'],
    versionRegex: /Version:\s*v?(\d+\.\d+\.\d+)/,
    enables: ['sbom'],
    install: {
      windows: 'scoop install syft  (or download from https://github.com/anchore/syft/releases)',
      macos: 'brew install syft',
      linux: 'curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin',
    },
  },
  {
    id: 'npm',
    bin: 'npm',
    versionArgs: ['--version'],
    versionRegex: /^(\d+\.\d+\.\d+)/m,
    enables: ['dependencies (npm fallback)'],
    install: { windows: 'bundled with Node.js', macos: 'bundled with Node.js', linux: 'bundled with Node.js' },
  },
  {
    id: 'pnpm',
    bin: 'pnpm',
    versionArgs: ['--version'],
    versionRegex: /^(\d+\.\d+\.\d+)/m,
    enables: ['dependencies (pnpm fallback)'],
    install: { windows: 'corepack enable pnpm', macos: 'corepack enable pnpm', linux: 'corepack enable pnpm' },
  },
  {
    id: 'yarn',
    bin: 'yarn',
    versionArgs: ['--version'],
    versionRegex: /^(\d+\.\d+\.\d+)/m,
    enables: ['dependencies (yarn fallback)'],
    install: { windows: 'corepack enable yarn', macos: 'corepack enable yarn', linux: 'corepack enable yarn' },
  },
  {
    id: 'pip-audit',
    bin: 'pip-audit',
    versionArgs: ['--version'],
    versionRegex: /pip-audit\s+(\d+\.\d+\.\d+)/,
    enables: ['dependencies (Python requirements/pyproject fallback)'],
    install: {
      windows: 'pipx install pip-audit  (or: python -m pip install pip-audit)',
      macos: 'pipx install pip-audit  (or: brew install pip-audit)',
      linux: 'pipx install pip-audit',
    },
  },
  {
    id: 'cargo-audit',
    bin: 'cargo-audit',
    versionArgs: ['audit', '--version'],
    versionRegex: /cargo-audit(?:-audit)?\s+(\d+\.\d+\.\d+)/,
    enables: ['dependencies (Rust fallback)'],
    install: { windows: 'cargo install cargo-audit --locked', macos: 'cargo install cargo-audit --locked', linux: 'cargo install cargo-audit --locked' },
  },
  {
    id: 'govulncheck',
    bin: 'govulncheck',
    versionArgs: ['-version'],
    versionRegex: /govulncheck@v?(\d+\.\d+\.\d+)|v?(\d+\.\d+\.\d+)/,
    enables: ['dependencies (Go fallback, with call-graph reachability)'],
    install: {
      windows: 'go install golang.org/x/vuln/cmd/govulncheck@latest',
      macos: 'go install golang.org/x/vuln/cmd/govulncheck@latest',
      linux: 'go install golang.org/x/vuln/cmd/govulncheck@latest',
    },
  },
  {
    id: 'git',
    bin: 'git',
    versionArgs: ['--version'],
    versionRegex: /git version (\d+\.\d+\.\d+)/,
    enables: ['diff-only mode (baseRef)', 'secret history scans'],
    install: { windows: 'winget install Git.Git', macos: 'xcode-select --install  (or: brew install git)', linux: 'apt/dnf install git' },
  },
];

export interface ToolStatus {
  id: ToolId;
  available: boolean;
  version?: string;
  path?: string;
  command?: ResolvedCommand;
  error?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<ToolId, { at: number; status: ToolStatus }>();

/** Test hook. */
export function clearToolCache(): void {
  cache.clear();
}

function configFor(id: ToolId): ToolConfig {
  const c = TOOL_CONFIGS.find((t) => t.id === id);
  if (!c) throw new Error(`Unknown tool ${id}`);
  return c;
}

async function probe(config: ToolConfig): Promise<ToolStatus> {
  const command = resolveCommand(config.bin);
  if (!command) return { id: config.id, available: false, error: `${config.bin} not found on PATH` };
  try {
    const r = await runTool(command, config.versionArgs, { cwd: tmpdir(), timeoutMs: 20000, maxOutputBytes: 1024 * 1024 }, config.bin);
    const text = `${r.stdout}\n${r.stderr}`;
    if (r.exitCode !== 0) {
      return {
        id: config.id,
        available: false,
        path: command.source,
        error: `${config.bin} ${config.versionArgs.join(' ')} exited with ${r.exitCode}`,
      };
    }
    const m = text.match(config.versionRegex);
    const version = m ? (m.slice(1).find(Boolean) ?? 'unknown') : 'unknown';
    return { id: config.id, available: true, version, path: command.source, command };
  } catch (err) {
    return { id: config.id, available: false, path: command.source, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getTool(id: ToolId): Promise<ToolStatus> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < (hit.status.available ? CACHE_TTL_MS : 30000)) return hit.status;
  const status = await probe(configFor(id));
  cache.set(id, { at: Date.now(), status });
  return status;
}

export function currentOsKey(): 'windows' | 'macos' | 'linux' {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

export function getInstallCommand(id: ToolId): string {
  return configFor(id).install[currentOsKey()];
}

export function unavailableMessage(id: ToolId, status?: ToolStatus): string {
  const why = status?.error ? ` (${status.error})` : '';
  return `${id} is not available${why}. Install: ${getInstallCommand(id)}`;
}

/** Compare dotted versions; returns true when `version` >= `min`. Unknown versions compare as true. */
export function versionAtLeast(version: string | undefined, min: string): boolean {
  if (!version || !/^\d/.test(version)) return true;
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export async function checkAllTools(): Promise<Record<string, unknown>> {
  clearToolCache(); // an explicit check must see tools installed since the last probe
  const os = currentOsKey();
  const statuses = await Promise.all(TOOL_CONFIGS.map((c) => getTool(c.id)));
  const tools: Record<string, unknown> = {};
  for (const [i, s] of statuses.entries()) {
    const c = TOOL_CONFIGS[i];
    tools[c.id] = {
      available: s.available,
      version: s.version,
      path: s.path,
      enables: c.enables,
      ...(s.available ? {} : { reason: s.error, install: c.install[os], installAllPlatforms: c.install }),
    };
  }
  const has = (id: ToolId) => statuses.find((s) => s.id === id)?.available ?? false;
  const capabilities = {
    dependencies: has('trivy') || has('osv-scanner')
      ? 'full (broad engine present)'
      : ['npm', 'pnpm', 'yarn', 'pip-audit', 'cargo-audit', 'govulncheck'].some((t) => has(t as ToolId))
        ? 'partial (native auditors only; ecosystems without one are reported as not scanned)'
        : 'unavailable',
    secrets: has('gitleaks') || has('trufflehog')
      ? 'full (working tree + history)'
      : has('trivy')
        ? 'working tree only (trivy)'
        : 'built-in patterns only (working tree, no history)',
    code: has('semgrep') ? 'available' : 'unavailable (install semgrep)',
    iac: has('trivy') ? 'available' : 'unavailable (install trivy)',
    container: has('trivy') ? 'available' : 'unavailable (install trivy)',
    licenses: has('osv-scanner') || has('trivy') ? 'available' : 'unavailable (install osv-scanner or trivy)',
    sbom: has('trivy') || has('syft') || has('osv-scanner') ? 'available' : 'unavailable (install trivy or syft)',
    diffMode: has('git') ? 'available' : 'unavailable (install git)',
  };
  return { os, tools, capabilities };
}
