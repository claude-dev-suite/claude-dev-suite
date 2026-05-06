// SPDX-License-Identifier: MIT
/**
 * CLAUDE.md Management Service
 *
 * Handles reading, updating, and cleaning the dev-suite section in CLAUDE.md.
 * Path-scoped routing for category-specific agents is written to
 * `.claude/rules/{category}.md` so that Claude Code only loads those
 * instructions when matching files are open, reducing cold-start token cost.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import type { Agent } from '../../types.js';
import { HooksService } from '../hooks.service.js';
import { getCategoryPaths, isAlwaysOnCategory } from './category-paths.js';

// Markers for dev-suite section
export const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
export const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';

/** Sentinel embedded in rules file comments so we know it was created by dev-suite */
const RULE_FILE_MARKER = '<!-- dev-suite-managed -->';

interface DetectedStackInfo {
  frontend?: { framework?: string; metaFramework?: string };
  backend?: { framework?: string; runtime?: string };
}

/**
 * Update CLAUDE.md with agent routing instructions and validation workflow.
 *
 * Always-on agents (security, core, quality, mcp-config) are written inline.
 * Category-scoped agents are listed only as a cross-reference; the detailed
 * routing for them lives in `.claude/rules/{category}.md`.
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
 * Generate the dev-suite section content for CLAUDE.md.
 *
 * Only always-on agents (security, core, quality, mcp-config) appear in the
 * full routing block. Category-scoped agents are listed in a compact index
 * that references the corresponding `.claude/rules/{category}.md` file.
 */
export function generateDevSuiteSection(
  agents: Agent[],
  detectedStack?: DetectedStackInfo,
  validatorHookConfigured = false
): string {
  // Split agents into always-on and path-scoped groups
  const alwaysOnAgents = agents.filter(a => isAlwaysOnCategory(a.category));
  const scopedAgents = agents.filter(a => !isAlwaysOnCategory(a.category));

  // Full agent list (for the Installed Agents index)
  const agentList = agents.length > 0
    ? agents.map((a) => `- \`@${a.id}\``).join('\n')
    : '- No agents installed';

  // Always-on routing block (security, core, quality, mcp-config)
  let alwaysOnRouting = '';
  if (alwaysOnAgents.length > 0) {
    const lines = alwaysOnAgents.map(a => `- Use \`@${a.id}\` for: ${a.description}`);
    alwaysOnRouting = `\n\n## Agent Routing (Always Active)\n\nThese agents apply to every file in the project:\n\n${lines.join('\n')}\n\n**Important**: Always delegate tasks to the most appropriate specialist agent.`;
  }

  // Path-scoped summary: group by category and reference the rule file
  let scopedSection = '';
  if (scopedAgents.length > 0) {
    // Group by category
    const byCategory = new Map<string, Agent[]>();
    for (const agent of scopedAgents) {
      const cat = agent.category as string;
      const bucket = byCategory.get(cat) ?? [];
      bucket.push(agent);
      byCategory.set(cat, bucket);
    }

    const categoryLines: string[] = [];
    for (const [cat, catAgents] of byCategory) {
      const agentIds = catAgents.map(a => `\`@${a.id}\``).join(', ');
      categoryLines.push(`- **${cat}**: ${agentIds} — see \`.claude/rules/${cat}.md\``);
    }

    scopedSection = `\n\n## Path-Scoped Agent Rules\n\nThe following agents activate automatically when you open matching files.\nFull routing details are in the rule files listed below:\n\n${categoryLines.join('\n')}`;
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

    validationSection = `\n\n## API Integration Validation\n\nThis project uses \`integration-validator-expert\` to validate API contract consistency between frontend and backend.\n\n### How It Works\nAn automatic hook (\`.claude/settings.json\`) detects when API endpoints or frontend integrations are modified and triggers validation automatically.\n\n### Monitored Agents\n- **Backend**: ${backendList}\n- **Frontend**: ${frontendList}\n\n### What Gets Validated\n- Path/method correspondence between frontend calls and OpenAPI spec\n- Request/response type alignment\n- Required/optional field correctness\n\n### Trigger Conditions\nThe validator is triggered when:\n- Backend: Controller/route/handler modifications, new REST/GraphQL endpoints, DTO changes\n- Frontend: New API calls (fetch, axios, useQuery), API type modifications\n\nThe validator is NOT triggered for:\n- CSS/styling changes only\n- Text/label changes only\n- Internal refactoring without API changes\n- UI components without data fetching`;
  }

  return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

## Installed Agents

${agentList}${alwaysOnRouting}${scopedSection}${validationSection}

## Commands

- \`/init-project\` - Reconfigure dev-suite
- \`/uninstall-dev-suite\` - Remove dev-suite
${DEV_SUITE_END_MARKER}`;
}

/**
 * Generate and write path-scoped rule files to `.claude/rules/{category}.md`.
 *
 * Each file uses Claude Code's `paths:` frontmatter so the rule is only
 * injected into the context when matching files are open. Categories with
 * an empty paths list (always-on: security, core, quality, mcp-config)
 * do not get a rule file — their routing stays in CLAUDE.md.
 *
 * Returns the list of relative paths for rule files that were written
 * (relative to projectPath), for tracking in the manifest.
 */
export function generatePathScopedRules(
  installedAgents: Agent[],
  projectPath: string
): string[] {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
  if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

  const rulesDir = path.join(projectPath, '.claude', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  // Group path-scoped agents by category (skip always-on categories)
  const byCategory = new Map<string, Agent[]>();
  for (const agent of installedAgents) {
    const cat = agent.category as string;
    if (isAlwaysOnCategory(cat)) continue;
    const bucket = byCategory.get(cat) ?? [];
    bucket.push(agent);
    byCategory.set(cat, bucket);
  }

  const writtenFiles: string[] = [];

  for (const [category, agents] of byCategory) {
    const globs = getCategoryPaths(category);
    if (!globs || globs.length === 0) continue; // safety guard

    const pathsYaml = globs.map(g => `  - "${g}"`).join('\n');
    const agentLines = agents
      .map(a => `- \`@${a.id}\` — ${a.description}`)
      .join('\n');

    const displayCategory = category.charAt(0).toUpperCase() + category.slice(1);

    const content = `---
paths:
${pathsYaml}
---
${RULE_FILE_MARKER}

# ${displayCategory} Agents

When working on files matching the paths above, prefer these agents:

${agentLines}

Use the Task tool with the corresponding subagent_type to delegate work to these specialists.
`;

    const relPath = `.claude/rules/${category}.md`;
    const absPath = path.join(projectPath, relPath);
    fs.writeFileSync(absPath, content, 'utf-8');
    writtenFiles.push(relPath);
  }

  return writtenFiles;
}

/**
 * Remove dev-suite managed rule files from `.claude/rules/`.
 *
 * Only files that contain the RULE_FILE_MARKER sentinel are removed —
 * user-created rule files in the same directory are left untouched.
 */
export function removePathScopedRules(
  projectPath: string,
  trackedRuleFiles: string[]
): { removed: string[]; errors: string[] } {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
  if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

  const removed: string[] = [];
  const errors: string[] = [];

  for (const relPath of trackedRuleFiles) {
    // Safety: only touch files inside .claude/rules/
    if (!relPath.startsWith('.claude/rules/')) {
      errors.push(`Skipped unexpected path: ${relPath}`);
      continue;
    }

    const absPath = path.join(projectPath, relPath);
    if (!fs.existsSync(absPath)) continue;

    try {
      const content = fs.readFileSync(absPath, 'utf-8');
      // Only remove files we created — never touch user rule files
      if (!content.includes(RULE_FILE_MARKER)) {
        errors.push(`Skipped non-managed file: ${relPath}`);
        continue;
      }
      fs.unlinkSync(absPath);
      removed.push(relPath);
    } catch (e) {
      errors.push(`Failed to remove ${relPath}: ${e}`);
    }
  }

  return { removed, errors };
}
