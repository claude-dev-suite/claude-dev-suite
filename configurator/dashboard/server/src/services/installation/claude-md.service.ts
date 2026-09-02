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
import { validatePathWithinBase } from './security-helpers.js';
import { getLogger } from '../../utils/logger.js';
import { targetPaths } from '../targets/target-paths.js';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import type { Agent } from '../../types.js';
import { HooksService } from '../hooks.service.js';
import { isAlwaysOnCategory } from './category-paths.js';
import {
  SHARED_INSTRUCTIONS_FILE,
  getTargetLayout,
  listImplementedTargets,
  type TargetId,
  anyTargetLoadsAgents,
  anyTargetSupportsGlobs,
  DEFAULT_TARGET,
} from '../targets/target-layout.js';
import { writePathScopedRules } from './path-scoped-rules.js';
import { projectCommandFiles } from './commands.js';
import { getDevSuiteDir } from '../../utils/dev-suite-dir.js';

const logger = getLogger('ClaudeMdService');
import { RULE_FILE_MARKER } from '../targets/writers/path-scoped-rules.writer.js';

// Markers for dev-suite section
export const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
export const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';



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
  /**
   * Selected assistants. The `CLAUDE.md` import pointer is written only when
   * `claude-code` is among them — every other Tier 1 assistant reads `AGENTS.md`
   * natively. Omitted means Claude Code (the historical single-target default).
   */
  targets?: TargetId[];
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
  const written = [SHARED_INSTRUCTIONS_FILE];

  // CLAUDE.md is a shim so Claude Code (which doesn't read AGENTS.md) picks up
  // the shared section. Write it only when Claude Code is actually a target.
  const includesClaude = !opts.targets || opts.targets.includes('claude-code');
  if (!includesClaude) {
    // Claude Code is no longer a target. Skipping the file left a legacy routing
    // section in it from a previous install — stale routing that Claude Code
    // would still read if the user opened the project with it. Strip our
    // section; anything of theirs in the file is untouched.
    removeMarkedSection(path.join(resolved, getTargetLayout('claude-code').instructionsFile));
  }
  if (includesClaude) {
    const claudeMdFile = getTargetLayout('claude-code').instructionsFile;
    upsertMarkedSection(
      path.join(resolved, claudeMdFile),
      generateSharedInstructionsPointer()
    );
    written.push(claudeMdFile);
  }

  return written;
}

/**
 * Remove the dev-suite section from every instructions file we write.
 *
 * Both files are always cleaned regardless of target: an uninstall shouldn't
 * have to know which assistants were selected to leave the project clean, and
 * removeMarkedSection is a no-op when the file or section is absent.
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

  let out = description
    .replace(/[\r\n]+/g, ' ')
    .replace(/`{3,}/g, '')
    .replace(/~{3,}/g, '')
    .replace(/`+/g, '');

  // Comment markers are stripped to a FIXED POINT, not in a single pass.
  //
  // One `.replace(/<!--/g, '')` is defeated by an input where deleting a match
  // splices its neighbours into a new one: in `<<!--!--` the `<!--` at index 1
  // is removed, and the leftover `<` and `!--` join back into `<!--`. The whole
  // job of this function is to guarantee no comment marker survives — AGENTS.md
  // is delimited by `<!-- DEV-SUITE-CONFIG-START/END -->` and
  // `upsertMarkedSection` finds that range with `indexOf`, so a description that
  // smuggles a marker through can make the next install rewrite the wrong span
  // of the user's file.
  //
  // Descriptions are short and every iteration strictly shrinks the string, so
  // this settles in a couple of passes.
  let previous: string;
  do {
    previous = out;
    out = out
      .replace(/<!--[\s\S]*?(?:-->|--!>)/g, '')
      .replace(/<!--/g, '')
      .replace(/(?:-->|--!>)/g, '');
  } while (out !== previous);

  return out.replace(/^#+\s*/g, '').trim();
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
/**
 * First sentence of a description, bounded.
 *
 * The always-on routing block carries a full multi-line description per agent,
 * and that block is inherited by every subagent the session spawns — so it is
 * one of the few parts of this file whose size is multiplied by the width of a
 * fan-out. The first sentence is what routing actually needs; the rest is in
 * the agent file, which the assistant loads when it delegates.
 */
function firstSentence(text: string, maxLen = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const stop = flat.search(/\.(\s|$)/);
  const sentence = stop > 0 ? flat.slice(0, stop + 1) : flat;
  if (sentence.length <= maxLen) return sentence;
  return sentence.slice(0, maxLen - 1).trimEnd() + '…';
}

/**
 * Compact capability tag for the agent index, e.g. ` [exec · deleg · haiku]`.
 *
 * An orchestrator picking an agent needs to know whether it can run a command
 * or delegate before handing it work: several specialists have no `Bash`, so
 * asking one of them to "run the tests and fix what fails" cannot succeed. The
 * model is included because an agent's `model:` frontmatter overrides the
 * session model, which is otherwise invisible from here.
 */
function capabilityTag(agent: Agent): string {
  const caps = agent.capabilities;
  const parts: string[] = [];
  if (caps) {
    if (caps.unrestricted) parts.push('all-tools');
    else {
      if (caps.canExecute) parts.push('exec');
      if (caps.canDelegate) parts.push('deleg');
      if (!caps.canEdit) parts.push('read-only');
    }
  }
  if (agent.model) parts.push(agent.model);
  return parts.length > 0 ? ` [${parts.join(' · ')}]` : '';
}

export function generateDevSuiteSection(opts: InstructionsSectionOptions): string {
  const { agents, customAgents = [], detectedStack, validatorHookConfigured = false } = opts;

  // Split agents into always-on and path-scoped groups
  const alwaysOnAgents = agents.filter(a => isAlwaysOnCategory(a.category));
  const scopedAgents = agents.filter(a => !isAlwaysOnCategory(a.category));

  // Full agent list (for the Installed Agents index)
  const agentList = agents.length > 0
    ? agents.map((a) => `- \`@${a.id}\`${capabilityTag(a)}`).join('\n')
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
    // Trimming to the first sentence is a saving only where the full text can
    // still be reached: assistants that load agent files have it one hop away.
    // Codex and Cline load none, so AGENTS.md is the *only* routing signal they
    // ever see, and the USE WHEN / DO NOT USE FOR triggers live past the first
    // sentence. There, the full description stays.
    const canRecoverDetail = anyTargetLoadsAgents(opts.targets ?? [DEFAULT_TARGET]);
    const lines = alwaysOnAgents.map(a => {
      const description = sanitizeAgentDescription(a.description);
      const text = canRecoverDetail ? firstSentence(description) : description;
      return `- Use \`@${a.id}\` for: ${text}`;
    });
    // Codex and Cline read AGENTS.md but load no agent files, so `@id` is not
    // invocable there — presenting these as delegation targets described
    // something they cannot do. For them the same list is guidance: which
    // expertise to apply, not whom to hand off to.
    const closing = anyTargetLoadsAgents(opts.targets ?? [DEFAULT_TARGET])
      ? '**Important**: Always delegate tasks to the most appropriate specialist agent.'
      : '**Important**: These are areas of expertise to apply, not separate agents to call — this assistant loads no agent files. Follow the guidance of whichever entry matches the work.';
    alwaysOnRouting = `

## Agent Routing (Always Active)

These agents apply to every file in the project:

${lines.join('\n')}

${closing}`;
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

    // Only targets with a glob mechanism actually get automatic activation; for
    // the others this is a plain index, and saying otherwise was false.
    const intro = anyTargetSupportsGlobs(opts.targets ?? [DEFAULT_TARGET])
      ? 'These agents cover specific parts of the codebase and activate automatically\nwhen you work on matching files:'
      : 'These agents cover specific parts of the codebase. This assistant has no\nglob-activated rules, so consult the matching entry when you touch that area:';
    scopedSection = `

## Path-Scoped Agent Rules

${intro}

${categoryLines.join('\n')}`;
  }

  // Generate API validation section if hook was configured
  // Only Claude Code runs the validator hook, so describing it in the shared
  // AGENTS.md told six other assistants about automation that will never fire
  // for them.
  let validationSection = '';
  const validationApplies =
    validatorHookConfigured && (opts.targets ?? [DEFAULT_TARGET]).includes('claude-code');
  if (validationApplies && detectedStack) {
    const hooksService = new HooksService();
    const monitoredAgents = hooksService.getMonitoredAgentsList(detectedStack);
    const backendList = monitoredAgents.backend.length > 0
      ? monitoredAgents.backend.map(a => `\`${a}\``).join(', ')
      : 'None detected';
    const frontendList = monitoredAgents.frontend.length > 0
      ? monitoredAgents.frontend.map(a => `\`${a}\``).join(', ')
      : 'None detected';

    // Describes the mechanism that actually exists. The previous text told
    // every reader that "an automatic hook … triggers validation
    // automatically", which was untrue twice over: the hook matched on
    // subagent *name* so it never fired for a generically typed agent, and a
    // prompt hook returning {"ok": false} feeds a reason back to the agent —
    // it cannot invoke `integration-validator-expert` at all.
    validationSection = `

## API Integration Validation

When a change touches the API surface — controllers, routes, handlers, DTOs,
OpenAPI/GraphQL schemas, API clients, data-fetching code — this project asks for
an integration check before the turn ends.

Detection is path-based and runs after every file write, in the main session and
inside subagents alike. The check itself runs **once per turn**, however many
agents did the writing.

When it fires, delegate to \`integration-validator-expert\`, which reconciles:
- path and method correspondence between frontend calls and the backend contract
- request/response type alignment
- required vs optional field correctness

It coordinates with the specialists detected for this stack — backend: ${backendList}; frontend: ${frontendList}.

Nothing is asked for CSS-only, copy-only, internal refactors, or UI changes
without data fetching: those paths never match. Set \`integrationValidation\` to
\`"off"\` in \`.dev-suite.json\` to switch the check off entirely.`;
  }

  // Slash commands are Claude-Code-only: `installation/commands.ts` writes them
  // into `.claude/commands` and nothing else reads that directory. Advertising
  // them in the shared AGENTS.md promised six other assistants commands they
  // cannot run — the same mistake already corrected twenty lines above for the
  // validation section.
  //
  // The list is also derived rather than hardcoded: the two names below were
  // stale, while `projectCommandFiles()` installs every non-maintainer command.
  let commandsSection = '';
  if ((opts.targets ?? [DEFAULT_TARGET]).includes('claude-code')) {
    const commandNames = listProjectCommandNames();
    if (commandNames.length > 0) {
      const list = commandNames.map(name => `- \`/${name}\``).join('\n');
      commandsSection = `\n\n## Commands\n\n${list}`;
    }
  }

  return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

## Installed Agents

${agentList}${customAgentsSection}${alwaysOnRouting}${scopedSection}${validationSection}${commandsSection}
${DEV_SUITE_END_MARKER}`;
}

/**
 * Slash command names dev-suite installs into `.claude/commands`, without the
 * `.md` extension.
 *
 * Derived from the same source `installCommands()` copies from, so the AGENTS.md
 * list can never drift from what is actually on disk. Degrades to an empty list
 * (and therefore no section) if the catalog cannot be read.
 */
function listProjectCommandNames(): string[] {
  try {
    return projectCommandFiles(getDevSuiteDir())
      .map(f => f.replace(/\.md$/, ''))
      .sort();
  } catch (error) {
    logger.warn('Could not list project commands — omitting the Commands section', { error });
    return [];
  }
}

/**
 * Generate and write Claude Code path-scoped rule files
 * (`.claude/rules/{category}.md`, `paths:` frontmatter).
 *
 * Thin wrapper over the per-target writer for backward compatibility; the
 * generic implementation and the Copilot/Cursor variants live in
 * `installation/path-scoped-rules.ts`.
 */
export function generatePathScopedRules(
  installedAgents: Agent[],
  projectPath: string
): string[] {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
  if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

  const result = writePathScopedRules('claude-code', installedAgents, projectPath);
  // A drifted file is still installed; the caller uses this list to decide what
  // to prune, so leaving it out would delete it.
  return [...result.written, ...result.drifted];
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

  // Rule files can belong to any implemented target's rules directory
  // (`.claude/rules`, `.github/instructions`, `.cursor/rules`). Accept a path
  // under any of them; the sentinel check below is the real safety guard.
  const rulesPrefixes = listImplementedTargets()
    .map(l => l.rulesDir)
    .filter((d): d is string => Boolean(d))
    .map(d => `${d}/`);

  for (const relPath of trackedRuleFiles) {
    // Resolve first, THEN test containment. A bare `startsWith` on the raw
    // string let `.claude/rules/../../../x.md` through, and the only remaining
    // barrier was a marker every dev-suite rule file on the machine carries —
    // so it deleted rule files in the user's *other* projects.
    let absPath: string;
    try {
      absPath = validatePathWithinBase(path.join(projectPath, relPath), projectPath, false);
    } catch {
      errors.push(`Skipped unexpected path: ${relPath}`);
      continue;
    }

    // `path.relative` returns backslashes on Windows; normalise before the
    // prefix test or every legitimate file would be skipped there.
    const normalized = path.relative(projectPath, absPath).split(path.sep).join('/');
    if (!rulesPrefixes.some(prefix => normalized.startsWith(prefix))) {
      errors.push(`Skipped unexpected path: ${relPath}`);
      continue;
    }

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

/**
 * Custom agents a user created in this project, for the routing section.
 *
 * Lives here rather than in `management.service` because `install()` needs it
 * too: a fresh install (or a Manage-tab resync, which now delegates to one)
 * regenerated the routing from the catalog alone and dropped every custom agent
 * the user had written.
 */
export function listCustomAgents(projectPath: string): CustomAgentSummary[] {
  const customAgentsDir = targetPaths(projectPath).customAgentsDir;
  const agents: CustomAgentSummary[] = [];
  if (!fs.existsSync(customAgentsDir)) return agents;

  try {
    for (const entry of fs.readdirSync(customAgentsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const content = fs.readFileSync(path.join(customAgentsDir, entry.name), 'utf-8');
      if (!content.startsWith('---')) continue;
      const endIdx = content.indexOf('---', 3);
      if (endIdx <= 0) continue;

      const frontmatter = content.substring(3, endIdx);
      const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?/m);
      const descMatch = frontmatter.match(/^description:\s*["']?([^"'\n]+)["']?/m);
      if (!nameMatch?.[1]) continue;

      agents.push({
        id: entry.name.replace('.md', ''),
        name: nameMatch[1].trim(),
        description: descMatch?.[1]?.trim() || `Custom agent: ${nameMatch[1].trim()}`,
      });
    }
  } catch (error: unknown) {
    logger.warn('Failed to read custom agents', { error, context: { customAgentsDir } });
  }

  return agents;
}
