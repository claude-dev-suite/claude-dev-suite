// SPDX-License-Identifier: MIT
/**
 * Review Job Builder
 *
 * Builds orchestrator jobs for code review.
 */

import type { ReviewJob, ReviewDepth, SubTask } from './types.js';
import { REVIEW_OPTIONS } from './constants.js';

/**
 * Validate review options against available options
 */
export function validateReviewOptions(options: string[]): string[] {
  if (!Array.isArray(options)) return [];
  return options.filter((opt) => typeof opt === 'string' && opt in REVIEW_OPTIONS);
}

/**
 * Deep mode prefix injected before each agent's task prompt.
 * Instructs the agent to load KB docs for the detected stack before reviewing.
 */
const DEEP_MODE_PREFIX = `## Deep Review Mode

Before starting the review, identify the technologies used in this project:
1. Read \`package.json\` (if present) to detect frontend/backend JS dependencies
2. Read \`pom.xml\` or \`build.gradle\` (if present) to detect Java/Spring dependencies
3. Read \`requirements.txt\` or \`pyproject.toml\` (if present) to detect Python dependencies

Then use the \`fetch_docs\` tool from the documentation MCP server to load knowledge for each relevant technology you found (e.g. \`react\`, \`spring-boot\`, \`postgresql\`, \`prisma\`, \`typescript\`, etc.).

This context will make your review significantly more precise and actionable.

---

`;

/**
 * Build a review job for the orchestrator
 */
export function buildReviewJob(options: {
  scope: 'uncommitted' | 'full-project';
  selectedAgents: string[];
  paths?: string[];
  repo?: string;
  depth?: ReviewDepth;
}): ReviewJob {
  const { scope, selectedAgents, paths, depth = 'quick' } = options;
  const validOptions = validateReviewOptions(selectedAgents);

  let context = '## Review Instructions\n\n';

  if (scope === 'uncommitted') {
    context += 'Focus on **uncommitted changes**. Run `git diff HEAD` to see what has changed.\n\n';
  } else if (scope === 'full-project') {
    if (paths && paths.length > 0) {
      context += 'Review **ONLY the specific files/directories listed below**. Do NOT review any other files.\n\n';
    } else {
      context += 'Analyze the **entire project codebase**.\n\n';
    }
  }

  if (paths && paths.length > 0) {
    context += '### Files to Review (ONLY these)\n';
    context += 'IMPORTANT: Review ONLY these paths, nothing else:\n';
    paths.slice(0, 20).forEach((p) => {
      context += `- \`${p}\`\n`;
    });
    if (paths.length > 20) {
      context += `- ... and ${paths.length - 20} more\n`;
    }
    context += '\n';
  }

  context += '### Methodology\n';
  context += '1. Use Glob to find relevant source files\n';
  context += '2. Use Read to examine file contents\n';
  context += '3. Use Grep to search for patterns\n';
  context += '4. Report findings with file:line references\n';

  // Build path restriction to add to each subtask
  let pathRestriction = '';
  if (paths && paths.length > 0) {
    pathRestriction = '\n\n**IMPORTANT - FILE RESTRICTION:**\n';
    pathRestriction += 'You MUST ONLY analyze the following files. Do NOT read, search, or analyze any other files:\n';
    paths.slice(0, 20).forEach((p) => {
      pathRestriction += `- ${p}\n`;
    });
    if (paths.length > 20) {
      pathRestriction += `- ... and ${paths.length - 20} more files\n`;
    }
    pathRestriction += '\nIgnore all other files in the project.';
  } else if (scope === 'uncommitted') {
    pathRestriction = '\n\n**IMPORTANT:** Only analyze files shown in `git diff HEAD`. Do not analyze unchanged files.';
  }

  const taskPrefix = depth === 'deep' ? DEEP_MODE_PREFIX : '';

  const subTasks: SubTask[] = validOptions.map((optionKey) => {
    const option = REVIEW_OPTIONS[optionKey];
    if (!option) {
      throw new Error(`Invalid review option: ${optionKey}`);
    }
    return {
      agentId: option.agentId,
      task: taskPrefix + option.taskPrompt + pathRestriction,
      dependencies: [] as string[],
    };
  });

  // If multiple review types selected, add a consolidation subtask at the end
  if (subTasks.length > 1) {
    const reviewAgentIds = subTasks.map((t) => t.agentId);
    const reviewTypeNames = validOptions
      .map((key) => {
        const option = REVIEW_OPTIONS[key];
        return option?.label ?? key;
      })
      .join(', ');

    subTasks.push({
      agentId: 'consolidator',
      task: buildConsolidationTask(reviewTypeNames),
      dependencies: reviewAgentIds,
    });
  }

  return {
    title: 'Code Review',
    context,
    subTasks,
  };
}

/**
 * Build the consolidation task prompt
 */
function buildConsolidationTask(reviewTypeNames: string): string {
  return `## Consolidate Code Review Results

You have received the outputs from multiple specialized code review agents (${reviewTypeNames}).

**CRITICAL: Equal-weight consolidation required.** Every agent's output must be given equal consideration. Do NOT favor the last agent or drop findings from earlier agents.

**Step 1 — Per-Agent Extraction (MANDATORY)**
Before producing the unified report, first enumerate each review agent's findings separately:
${reviewTypeNames.split(', ').map((name) => `- **${name}**: [list their findings]`).join('\n')}
This ensures no agent's findings are lost.

**Step 2 — Unified Report**
Create a **single, unified code review report** consolidating ALL findings:

1. DO NOT re-analyze the code yourself. Use ONLY the findings from the previous agents.
2. Organize all issues by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO)
3. Every Critical and High finding from ANY agent MUST appear — dropping them is not allowed
4. Remove duplicate findings (same file, same line, same issue) but NEVER drop unique Critical/High issues
5. Group related issues together when they affect the same file or component

**Output Format:**

## Code Review Summary

### Executive Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues
- Total: X issues

**Key Areas of Concern:** [brief list]

### Critical Issues
[ALL CRITICAL issues from every agent with file:line - description and source agent]

### High Priority Issues
[ALL HIGH issues from every agent]

### Medium Priority Issues
[Consolidated MEDIUM issues, deduplicated]

### Low Priority / Informational
[Consolidated LOW and INFO issues]

### Recommendations
[Top 3-5 actionable recommendations based on findings]

Start consolidating the review results now.`;
}
