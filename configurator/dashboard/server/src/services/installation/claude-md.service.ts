// SPDX-License-Identifier: MIT
/**
 * CLAUDE.md Management Service
 *
 * Handles reading, updating, and cleaning the dev-suite section in CLAUDE.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import type { Agent } from '../../types.js';
import { HooksService } from '../hooks.service.js';

// Markers for dev-suite section
export const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
export const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';

interface DetectedStackInfo {
  frontend?: { framework?: string; metaFramework?: string };
  backend?: { framework?: string; runtime?: string };
}

/**
 * Update CLAUDE.md with agent routing instructions and validation workflow
 */
export function updateClaudeMd(
  projectPath: string,
  agents: Agent[],
  detectedStack?: DetectedStackInfo,
  validatorHookConfigured = false
): void {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const section = generateDevSuiteSection(agents, detectedStack, validatorHookConfigured);

  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, section + '\n');
    return;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
  const endIdx = content.indexOf(DEV_SUITE_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx + DEV_SUITE_END_MARKER.length);
    fs.writeFileSync(claudeMdPath, before + section + after);
  } else {
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(claudeMdPath, content + separator + '---\n\n' + section + '\n');
  }
}

/**
 * Remove the dev-suite section from CLAUDE.md
 */
export function cleanClaudeMdSection(projectPath: string): void {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
  const endIdx = content.indexOf(DEV_SUITE_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    let before = content.substring(0, startIdx);
    const after = content.substring(endIdx + DEV_SUITE_END_MARKER.length);

    before = before.replace(/\n---\n+$/, '\n').replace(/\n+$/, '\n');
    const newContent = (before + after.replace(/^\n+/, '')).trim();

    if (newContent.length === 0) {
      fs.unlinkSync(claudeMdPath);
    } else {
      fs.writeFileSync(claudeMdPath, newContent + '\n');
    }
  }
}

/**
 * Generate the dev-suite section content for CLAUDE.md
 */
export function generateDevSuiteSection(
  agents: Agent[],
  detectedStack?: DetectedStackInfo,
  validatorHookConfigured = false
): string {
  const agentList = agents.length > 0
    ? agents.map((a) => `- \`@${a.id}\``).join('\n')
    : '- No agents installed';

  // Generate routing instructions based on agent descriptions
  let routingInstructions = '';
  if (agents.length > 0) {
    const routingLines = agents.map((a) => {
      return `- Use \`@${a.id}\` for: ${a.description}`;
    });
    routingInstructions = `

## Agent Routing

When working on tasks that match an agent's expertise, you MUST use the appropriate agent. Use the Task tool with the corresponding subagent_type.

${routingLines.join('\n')}

**Important**: Always delegate tasks to the most appropriate specialist agent. Do not attempt to handle specialized tasks directly when a relevant agent is available.`;
  }

  // Generate API validation section if hook was configured
  let validationSection = '';
  if (validatorHookConfigured && detectedStack) {
    const hooksService = new HooksService();
    const monitoredAgents = hooksService.getMonitoredAgentsList(detectedStack);
    const backendList = monitoredAgents.backend.length > 0
      ? monitoredAgents.backend.map(a => `\`${a}\``).join(', ')
      : 'None detected';
    const frontendList = monitoredAgents.frontend.length > 0
      ? monitoredAgents.frontend.map(a => `\`${a}\``).join(', ')
      : 'None detected';

    validationSection = `

## API Integration Validation

This project uses \`integration-validator-expert\` to validate API contract consistency between frontend and backend.

### How It Works
An automatic hook (\`.claude/settings.json\`) detects when API endpoints or frontend integrations are modified and triggers validation automatically.

### Monitored Agents
- **Backend**: ${backendList}
- **Frontend**: ${frontendList}

### What Gets Validated
- Path/method correspondence between frontend calls and OpenAPI spec
- Request/response type alignment
- Required/optional field correctness

### Trigger Conditions
The validator is triggered when:
- Backend: Controller/route/handler modifications, new REST/GraphQL endpoints, DTO changes
- Frontend: New API calls (fetch, axios, useQuery), API type modifications

The validator is NOT triggered for:
- CSS/styling changes only
- Text/label changes only
- Internal refactoring without API changes
- UI components without data fetching`;
  }

  return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

## Installed Agents

${agentList}${routingInstructions}${validationSection}

## Commands

- \`/init-project\` - Reconfigure dev-suite
- \`/uninstall-dev-suite\` - Remove dev-suite
${DEV_SUITE_END_MARKER}`;
}
