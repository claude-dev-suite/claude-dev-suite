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
  return `## Consolidate Results from Multiple Agents

You are receiving the output from ${agentCount} different agents: ${agentNames}.

Your task is to create a **unified summary report** that:

1. **Executive Summary**: Provide a brief overview of what was accomplished
2. **Key Findings/Results**: Consolidate the main outputs from each agent
3. **Action Items**: List any follow-up tasks or recommendations
4. **Agent Contributions**: Brief summary of what each agent contributed

Format the output in a clear, readable manner. Remove any redundant information and highlight the most important points.

**IMPORTANT**: This is a consolidation task - synthesize and summarize, do not repeat verbatim.`;
}
