#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { callTool, jsonSchemaFor, type ToolName } from './tools.js';
import { redactText } from './utils/redact.js';

const server = new Server(
  {
    name: 'security-scanner',
    version: '1.1.0',
  },
  { capabilities: { tools: {} } }
);

// Names and descriptions live here, literally, so the catalog gates can read them.
const TOOLS: Array<{ name: ToolName; description: string }> = [
  {
    name: 'scan_dependencies',
    description: 'SCA across ecosystems and monorepos: trivy or osv-scanner, native auditors as fallback, uncovered files listed',
  },
  {
    name: 'scan_secrets',
    description: 'Find hardcoded secrets in the working tree and optionally git history (gitleaks, trufflehog, trivy, built-in)',
  },
  {
    name: 'scan_code',
    description: 'SAST with Semgrep: configurable rulesets, severity filter, optional diff-only mode against a git ref',
  },
  {
    name: 'scan_container',
    description: 'Scan a container image or filesystem with Trivy for vulnerabilities, secrets and misconfigurations',
  },
  {
    name: 'scan_iac',
    description: 'Scan IaC (Dockerfile, Kubernetes, Helm, Terraform, CloudFormation) for misconfigurations with Trivy',
  },
  {
    name: 'scan_licenses',
    description: 'Inventory dependency licenses and flag violations of an allow/deny policy (osv-scanner or trivy)',
  },
  {
    name: 'generate_sbom',
    description: 'Generate a CycloneDX or SPDX SBOM for a directory or container image (trivy, syft or osv-scanner)',
  },
  {
    name: 'check_tools',
    description: 'Report installed security tools, their versions, which scans they enable, and per-OS install hints',
  },
  {
    name: 'scan_all',
    description: 'Run every applicable scan; each sub-scan is reported as ok, partial, failed or skipped with the reason',
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ ...t, inputSchema: jsonSchemaFor(t.name) })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await callTool(name, args);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `Invalid arguments: ${error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: redactText(message), tool: name }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Security Scanner MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
