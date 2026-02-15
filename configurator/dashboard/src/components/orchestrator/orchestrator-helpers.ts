// SPDX-License-Identifier: MIT
/**
 * Orchestrator Helper Functions
 *
 * Utility functions for building job summaries and output formatting.
 */

import type { Job } from '@/types';
import type { useOrchestratorState } from './hooks/useOrchestratorState';

/**
 * Build job summary output for display in console
 */
export function buildJobSummary(
  jobTitle: string,
  jobProjectPath: string,
  jobSubTasks: Array<{ agentId: string; task: string }>
): string[] {
  const output: string[] = [];
  output.push('\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  output.push(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m📋 ${jobTitle}\x1b[0m`);
  output.push('\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
  output.push('');
  output.push(`\x1b[33m📁 Working Directory:\x1b[0m ${jobProjectPath}`);
  output.push('');

  if (jobSubTasks.length > 0) {
    output.push('\x1b[33m🤖 Agents Engaged:\x1b[0m');
    jobSubTasks.forEach((task, index) => {
      const displayName = task.agentId === 'consolidator'
        ? '📊 Consolidator (Summary)'
        : `@${task.agentId}`;
      output.push(`   ${index + 1}. \x1b[35m${displayName}\x1b[0m`);
    });
    output.push('');
  }

  output.push('\x1b[36m─────────────────────────────────────────────────────────────────\x1b[0m');
  output.push('');

  return output;
}

/**
 * Build execution summary output for display in console
 */
export function buildExecutionSummary(
  job: Partial<Job>,
  projectPath: string,
  state: ReturnType<typeof useOrchestratorState>,
  workflows: { builtin: { id: string; name: string }[]; custom: { id: string; name: string }[] },
  availableAgents: { id: string; name: string }[]
): string[] {
  const output: string[] = [];
  output.push('\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  output.push(`\x1b[1m\x1b[36m║\x1b[0m  \x1b[1m🚀 ${job.title}\x1b[0m`);
  output.push('\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
  output.push('');
  output.push(`\x1b[33m📁 Working Directory:\x1b[0m ${projectPath}`);
  output.push('');

  if (state.selectedWorkflow) {
    const [type, id] = state.selectedWorkflow.split(':');
    const workflowList = type === 'builtin' ? workflows.builtin : workflows.custom;
    const workflow = workflowList.find((w) => w.id === id);
    if (workflow) {
      output.push(`\x1b[33m📋 Workflow Template:\x1b[0m ${workflow.name}`);
      output.push('');
    }
  }

  if (state.agentTasks.length > 0) {
    output.push('\x1b[33m🤖 Agent Tasks:\x1b[0m');
    state.agentTasks.forEach((task, index) => {
      const agent = availableAgents.find((a) => a.id === task.agentId);
      const agentName = agent?.name || task.agentId;
      const priorityBadge = task.priority === 'high' ? ' \x1b[31m[HIGH]\x1b[0m' : '';
      output.push(`   ${index + 1}. \x1b[35m@${agentName}\x1b[0m${priorityBadge}`);
      output.push(`      \x1b[90m${task.description.substring(0, 80)}${task.description.length > 80 ? '...' : ''}\x1b[0m`);
    });
    output.push('');
  }

  if (state.jobContext) {
    output.push('\x1b[33m📝 Context:\x1b[0m');
    const contextPreview = state.jobContext.substring(0, 200).replace(/\n/g, ' ');
    output.push(`   \x1b[90m${contextPreview}${state.jobContext.length > 200 ? '...' : ''}\x1b[0m`);
    output.push('');
  }

  if (state.mcpSuggestions.length > 0) {
    output.push(`\x1b[33m🔌 MCP Servers:\x1b[0m ${state.mcpSuggestions.join(', ')}`);
    output.push('');
  }

  output.push('\x1b[36m─────────────────────────────────────────────────────────────────\x1b[0m');
  output.push('');

  return output;
}

/**
 * Build consolidation task prompt for multiple agents
 */
export function buildConsolidationTask(agentCount: number, agentNames: string): string {
  return `## Consolidate Results from ${agentCount} Agents

You are consolidating output from these agents: ${agentNames}.

**CRITICAL: Equal-weight consolidation required.** Every agent's output must be given equal consideration. Do NOT favor the last agent or drop findings from earlier agents.

**Step 1 — Per-Agent Extraction (MANDATORY)**
Before synthesizing, list each agent's key findings separately:
${agentNames.split(', ').map((name) => `- **${name}**: [list their top findings]`).join('\n')}

**Step 2 — Severity-Based Organization**
Organize ALL findings by severity: CRITICAL > HIGH > MEDIUM > LOW > INFO.
Every Critical and High finding from ANY agent MUST appear in the final report — dropping them is not allowed.

**Step 3 — Unified Report**
Produce the final report in this format:

### Executive Summary
- Total issues/findings by severity
- Key areas of concern

### Critical Issues
[ALL critical findings from every agent, with source agent noted]

### High Priority Issues
[ALL high findings from every agent]

### Medium Priority Issues
[Consolidated medium findings, deduplicated]

### Low Priority / Informational
[Consolidated low findings]

### Action Items
[Top recommendations, prioritized]

### Agent Contributions
[Brief summary of what each agent contributed]

**IMPORTANT**: This is a consolidation task — synthesize and summarize, do not re-analyze the code yourself. Do not repeat verbatim. Remove duplicates but NEVER drop unique Critical or High findings.`;
}
