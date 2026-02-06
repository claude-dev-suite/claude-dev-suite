// SPDX-License-Identifier: MIT
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolInfo, CheckToolsResult } from '../types.js';

const execAsync = promisify(exec);

interface ToolConfig {
  name: string;
  versionCmd: string;
  versionRegex: RegExp;
  installCmd: string;
}

const TOOL_CONFIGS: ToolConfig[] = [
  {
    name: 'npm-audit',
    versionCmd: 'npm --version',
    versionRegex: /^(\d+\.\d+\.\d+)/,
    installCmd: 'npm is bundled with Node.js',
  },
  {
    name: 'pip-audit',
    versionCmd: 'pip-audit --version',
    versionRegex: /pip-audit\s+(\d+\.\d+\.\d+)/,
    installCmd: 'pip install pip-audit',
  },
  {
    name: 'cargo-audit',
    versionCmd: 'cargo audit --version',
    versionRegex: /cargo-audit\s+(\d+\.\d+\.\d+)/,
    installCmd: 'cargo install cargo-audit',
  },
  {
    name: 'govulncheck',
    versionCmd: 'govulncheck -version',
    versionRegex: /v?(\d+\.\d+\.\d+)/,
    installCmd: 'go install golang.org/x/vuln/cmd/govulncheck@latest',
  },
  {
    name: 'gitleaks',
    versionCmd: 'gitleaks version',
    versionRegex: /v?(\d+\.\d+\.\d+)/,
    installCmd: 'brew install gitleaks (macOS) or https://github.com/gitleaks/gitleaks/releases',
  },
  {
    name: 'trufflehog',
    versionCmd: 'trufflehog --version',
    versionRegex: /(\d+\.\d+\.\d+)/,
    installCmd: 'brew install trufflehog (macOS) or pip install trufflehog',
  },
  {
    name: 'semgrep',
    versionCmd: 'semgrep --version',
    versionRegex: /(\d+\.\d+\.\d+)/,
    installCmd: 'pip install semgrep',
  },
  {
    name: 'trivy',
    versionCmd: 'trivy --version',
    versionRegex: /Version:\s*(\d+\.\d+\.\d+)/,
    installCmd: 'brew install trivy (macOS) or https://aquasecurity.github.io/trivy/latest/getting-started/installation/',
  },
];

async function checkTool(config: ToolConfig): Promise<ToolInfo> {
  try {
    const { stdout } = await execAsync(config.versionCmd, { timeout: 5000 });
    const match = stdout.match(config.versionRegex);
    return {
      name: config.name,
      available: true,
      version: match ? match[1] : 'unknown',
    };
  } catch {
    return {
      name: config.name,
      available: false,
      installCmd: config.installCmd,
    };
  }
}

export async function checkAllTools(): Promise<CheckToolsResult> {
  const results = await Promise.all(TOOL_CONFIGS.map(checkTool));

  const tools: Record<string, ToolInfo> = {};
  for (const result of results) {
    tools[result.name] = result;
  }

  return { tools };
}

export async function isToolAvailable(toolName: string): Promise<boolean> {
  const config = TOOL_CONFIGS.find(c => c.name === toolName);
  if (!config) return false;

  const result = await checkTool(config);
  return result.available;
}

export function getInstallCommand(toolName: string): string | undefined {
  const config = TOOL_CONFIGS.find(c => c.name === toolName);
  return config?.installCmd;
}
