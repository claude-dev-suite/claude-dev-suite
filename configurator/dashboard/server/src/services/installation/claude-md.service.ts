// SPDX-License-Identifier: MIT
/**
 * Instructions File Service
 *
 * Writes the dev-suite instructions section that agents read at session start.
 *
 * `AGENTS.md` is the primary artifact: it is the cross-assistant standard and
 * is read natively by Copilot, Cursor, Codex, Windsurf and others. Claude Code
 * does not read AGENTS.md, so `CLAUDE.md` is written as a thin pointer that
 * pulls it in via the supported `@AGENTS.md` import syntax — one source of
 * truth, no duplicated content.
 *
 * Path-scoped routing for category-specific agents stays out of the shared
 * section: it is written to per-target rule files (`.claude/rules/{category}.md`
 * today) so instructions are only loaded when matching files are open, keeping
 * cold-start token cost low.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import type { Agent } from '../../types.js';
import { HooksService } from '../hooks.service.js';
import { getCategoryPaths, isAlwaysOnCategory } from './category-paths.js';
import { SHARED_INSTRUCTIONS_FILE, getTargetLayout } from '../targets/target-layout.js';
import { targetPaths } from '../targets/target-paths.js';

// Markers for dev-suite section
export const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
export const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';

/** Sentinel embedded in rules file comments so we know it was created by dev-suite */
const RULE_FILE_MARKER = '<!-- dev-suite-managed -->';

interface DetectedStackInfo {
  frontend?: { framework?: string; metaFramework?: string };
  backend?: { framework?: string; runtime?: string };
}

/** Minimal shape of a user-authored custom agent, as listed in instructions. */
export interface CustomAgentSummary {
  id: string;
  name: string;
  description: string;
}

/** Inputs for the generated dev-suite instructions section. */
export interface InstructionsSectionOptions {
  agents: Agent[];
  customAgents?: CustomAgentSummary[];
  detectedStack?: DetectedStackInfo;
  validatorHookConfigured?: boolean;
}

/**
 * Insert or replace the dev-suite marked section in a file.
 *
 * User content outside the markers is always preserved; when the file exists
 * but has no markers the section is appended after a horizontal rule.
 */
function upsertMarkedSection(filePath: string, section: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, section + '\n');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
  const endIdx = content.indexOf(DEV_SUITE_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx + DEV_SUITE_END_MARKER.length);
    fs.writeFileSync(filePath, before + section + after);
  } else {
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(filePath, content + separator + '---\n\n' + section + '\n');
  }
}

/**
 * Remove the dev-suite marked section from a file, deleting the file when
 * nothing but our section was in it.
 */
function removeMarkedSection(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
  const endIdx = content.indexOf(DEV_SUITE_END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

  let before = content.substring(0, startIdx);
  const after = content.substring(endIdx + DEV_SUITE_END_MARKER.length);

  before = before.replace(/\n---\n+$/, '\n').replace(/\n+$/, '\n');
  const newContent = (before + after.replace(/^\n+/, '')).trim();

  if (newContent.length === 0) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, newContent + '\n');
  }
}

/** Validate and normalise a project path before writing into it. */
function assertSafeProjectPath(projectPath: string): string {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  const resolved = resolveProjectPath(projectPath);
  if (!path.isAbsolute(resolved)) throw new PathValidationError('Path must be rooted');
  return resolved;
}

/**
 * Write the dev-suite instructions for every assistant that reads a
 * project-level instructions file.
 *
 * `AGENTS.md` receives the full section (shared across assistants);
 * `CLAUDE.md` receives a pointer that imports it, because Claude Code does not
 * read AGENTS.md natively.
 *
 * @returns relative paths of the files written, for manifest tracking.
 */
export function updateInstructions(
  projectPath: string,
  opts: InstructionsSectionOptions
): string[] {
  const resolved = assertSafeProjectPath(projectPath);

  upsertMarkedSection(
    path.join(resolved, SHARED_INSTRUCTIONS_FILE),
    generateDevSuiteSection(opts)
  );

  const claudeMdFile = getTargetLayout('claude-code').instructionsFile;
  upsertMarkedSection(
    path.join(resolved, claudeMdFile),
    generateSharedInstructionsPointer()
  );

  return [SHARED_INSTRUCTIONS_FILE, claudeMdFile];
}

/**
 * Remove the dev-suite section from every instructions file we write.
 */
export function cleanInstructionsSections(projectPath: string): void {
  const resolved = assertSafeProjectPath(projectPath);
  removeMarkedSection(path.join(resolved, SHARED_INSTRUCTIONS_FILE));
  removeMarkedSection(path.join(resolved, getTargetLayout('claude-code').instructionsFile));
}

/**
 * The CLAUDE.md section: a pointer that imports the shared instructions.
 *
 * `@AGENTS.md` is Claude Code's supported import syntax; it must stay on its
 * own line and outside code spans to be expanded.
 */
export function generateSharedInstructionsPointer(): string {
  return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

Project instructions are maintained in ${SHARED_INSTRUCTIONS_FILE}, shared across AI coding
assistants. The import below pulls them into context — edit that file, not this section.

@${SHARED_INSTRUCTIONS_FILE}
${DEV_SUITE_END_MARKER}`;
}

/**
 * Sanitize an agent description for safe embedding in a generated instructions
 * file.
 *
 * Strips constructs that could be used for prompt injection or that would break
 * the surrounding Markdown structure: fenced code blocks, bare backtick runs,
 * HTML comment markers (which could forge our own section markers), leading
 * heading markers, and newlines.
 */
export function sanitizeAgentDescription(description: string): string {
  if (!description) return '';
  return description
    .replace(/[\r\n]+/g, ' ')
    .replace(/`{3,}/g, '')
    .replace(/~{3,}/g, '')
    .replace(/`+/g, '')
    .replace(/<!--[\s\S]*?(?:-->|--!>)/g, '')
    .replace(/<!--/g, '')
    .replace(/(?:-->|--!>)/g, '')
    .replace(/^#+\s*/g, '')
    .trim();
}

/**
 * Generate the shared dev-suite instructions section.
 *
 * Only always-on agents (security, core, quality, mcp-config) get a full inline
 * routing block. Category-scoped agents appear as a compact one-line-per-category
 * index — their detailed routing lives in per-target rule files that the
 * assistant loads only when matching files are open. The index deliberately
 * avoids naming tool-specific rule paths so the section stays portable.
 */
export function generateDevSuiteSection(opts: InstructionsSectionOptions): string {
  const { agents, customAgents = [], detectedStack, validatorHookConfigured = false } = opts;

  // Split agents into always-on and path-scoped groups
  const alwaysOnAgents = agents.filter(a => isAlwaysOnCategory(a.category));
  const scopedAgents = agents.filter(a => !isAlwaysOnCategory(a.category));

  // Full agent list (for the Installed Agents index)
  const agentList = agents.length > 0
    ? agents.map((a) => `- \`@${a.id}\``).join('\n')
    : '- No agents installed';

  // Custom (user-authored) agents are listed separately and never overwritten
  const customAgentsSection = customAgents.length > 0
    ? `\n\n## Custom Agents\n\nProject-specific custom agents:\n\n${customAgents
        .map(a => `- \`@custom:${a.id}\` — ${sanitizeAgentDescription(a.description)}`)
        .join('\n')}`
    : '';

  // Always-on routing block (security, core, quality, mcp-config)
  let alwaysOnRouting = '';
  if (alwaysOnAgents.length > 0) {
    const lines = alwaysOnAgents.map(
      a => `- Use \`@${a.id}\` for: ${sanitizeAgentDescription(a.description)}`
    );
    alwaysOnRouting = `\n\n## Agent Routing (Always Active)\n\nThese agents apply to every file in the project:\n\n${lines.join('\n')}\n\n**Important**: Always delegate tasks to the most appropriate specialist agent.`;
  }

  // Path-scoped summary: one line per category, no tool-specific paths
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
      categoryLines.push(`- **${cat}**: ${agentIds}`);
    }

    scopedSection = `\n\n## Path-Scoped Agent Rules\n\nThese agents cover specific parts of the codebase and activate automatically\nwhen you work on matching files:\n\n${categoryLines.join('\n')}`;
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

    validationSection = `\n\n## API Integration Validation\n\nThis project uses \`integration-validator-expert\` to validate API contract consistency between frontend and backend.\n\n### How It Works\nAn automatic hook detects when API endpoints or frontend integrations are modified and triggers validation automatically.\n\n### Monitored Agents\n- **Backend**: ${backendList}\n- **Frontend**: ${frontendList}\n\n### What Gets Validated\n- Path/method correspondence between frontend calls and OpenAPI spec\n- Request/response type alignment\n- Required/optional field correctness\n\n### Trigger Conditions\nThe validator is triggered when:\n- Backend: Controller/route/handler modifications, new REST/GraphQL endpoints, DTO changes\n- Frontend: New API calls (fetch, axios, useQuery), API type modifications\n\nThe validator is NOT triggered for:\n- CSS/styling changes only\n- Text/label changes only\n- Internal refactoring without API changes\n- UI components without data fetching`;
  }

  return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

## Installed Agents

${agentList}${customAgentsSection}${alwaysOnRouting}${scopedSection}${validationSection}

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

  const paths = targetPaths(projectPath);
  fs.mkdirSync(paths.rulesDir, { recursive: true });

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

    const relPath = paths.relRuleFile(category);
    const absPath = paths.abs(relPath);
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

  const rulesPrefix = `${targetPaths(projectPath).relRulesDir}/`;
  for (const relPath of trackedRuleFiles) {
    // Safety: only touch files inside the target's rules directory
    if (!relPath.startsWith(rulesPrefix)) {
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
