// SPDX-License-Identifier: MIT
/**
 * Review Job Builder
 *
 * Builds orchestrator jobs for code review.
 */

import type { ReviewJob, SubTask } from './types.js';
import { REVIEW_OPTIONS } from './constants.js';

/**
 * Validate review options against available options
 */
export function validateReviewOptions(options: string[]): string[] {
  if (!Array.isArray(options)) return [];
  return options.filter((opt) => typeof opt === 'string' && opt in REVIEW_OPTIONS);
}

/**
 * Build a review job for the orchestrator
 */
export function buildReviewJob(options: {
  scope: 'uncommitted' | 'full-project';
  selectedAgents: string[];
  paths?: string[];
  repo?: string;
}): ReviewJob {
  const { scope, selectedAgents, paths } = options;
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

  const subTasks: SubTask[] = validOptions.map((optionKey) => {
    const option = REVIEW_OPTIONS[optionKey];
    if (!option) {
      throw new Error(`Invalid review option: ${optionKey}`);
    }
    return {
      agentId: option.agentId,
      task: option.taskPrompt + pathRestriction,
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

Your task is to create a **single, unified code review report** that consolidates all findings.

**Instructions:**
1. DO NOT re-analyze the code yourself. Use ONLY the findings from the previous agents.
2. Organize all issues by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO)
3. Remove any duplicate findings (same file, same line, same issue)
4. Group related issues together when they affect the same file or component
5. Provide a brief executive summary at the top with:
   - Total issues found by severity
   - Most critical areas that need attention
   - Overall code health assessment

**Output Format:**
\`\`\`
## Code Review Summary

### Executive Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues
- Total: X issues

**Key Areas of Concern:** [brief list]

### Critical Issues
[List all CRITICAL issues with file:line - description]

### High Priority Issues
[List all HIGH issues]

### Medium Priority Issues
[List all MEDIUM issues]

### Low Priority / Informational
[List all LOW and INFO issues]

### Recommendations
[Top 3-5 actionable recommendations based on findings]
\`\`\`

Start consolidating the review results now.`;
}
