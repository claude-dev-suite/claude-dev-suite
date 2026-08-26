// SPDX-License-Identifier: MIT
/**
 * Job Prompt Service
 *
 * Generates prompts for job and subtask execution.
 */

import type { Job, JobContextSummary } from '../../types/orchestrator.js';
import type { TrackedJob } from './types.js';
import type { AgentSDKService } from './agent-sdk.service.js';

export class JobPromptService {
  constructor(private sdkService: AgentSDKService) {}

  /**
   * Generate prompt for a specific subtask, including context from completed dependencies
   */
  generateSubTaskPrompt(job: TrackedJob): string {
    const task = job.subTasks![job.currentSubTaskIndex];
    if (!task) {
      throw new Error(`Subtask at index ${job.currentSubTaskIndex} is undefined`);
    }

    let prompt = `Execute the following task: "${job.title}"\n\n`;

    // Add working directory context
    if (job.projectPath) {
      prompt += `**Working Directory:** \`${job.projectPath}\`\nAll file paths are relative to this directory.\n\n`;
    }

    if (job.context) {
      prompt += `Context: ${job.context}\n\n`;
    }

    prompt += `## Task Overview\n`;
    prompt += `This is part of a multi-step workflow. You are executing step ${job.currentSubTaskIndex + 1} of ${job.subTasks!.length}.\n\n`;

    prompt += `## Current Task\n`;
    // Special agent IDs like 'consolidator' run with base Claude (no agent delegation)
    if (task.agentId === 'consolidator') {
      prompt += `${task.task}\n\n`;
    } else {
      prompt += `Use the ${task.agentId} agent to: ${task.task}\n\n`;
    }

    // Inject context from completed dependent tasks
    if (task.dependencies && task.dependencies.length > 0) {
      prompt += `## Context from Previous Tasks\n\n`;
      prompt += `The following tasks have been completed. Use their output as context:\n\n`;

      const isConsolidation = task.agentId === 'consolidator';
      const depBudget = isConsolidation ? 12000 : 8000;

      task.dependencies.forEach((depId: string) => {
        const output = job.completedSubTasks[depId];
        if (output) {
          prompt += `### ${depId} output:\n`;
          prompt += `\`\`\`\n${this.sdkService.truncateOutput(output, depBudget)}\n\`\`\`\n\n`;
        }
      });
    } else if (job.currentSubTaskIndex > 0) {
      // Even without explicit dependencies, include previous task output for context
      const prevIndex = job.currentSubTaskIndex - 1;
      const prevTask = job.subTasks![prevIndex];
      if (prevTask) {
        // By position, not by agent: with the same agent at two steps the
        // agentId lookup returned whichever ran last, not the previous step.
        const prevOutput =
          job.completedSubTaskOutputs?.[prevIndex] ?? job.completedSubTasks[prevTask.agentId];
        if (prevOutput) {
          prompt += `## Context from Previous Task\n\n`;
          prompt += `The previous task (${prevTask.agentId}) produced this output:\n`;
          prompt += `\`\`\`\n${this.sdkService.truncateOutput(prevOutput, 4000)}\n\`\`\`\n\n`;
        }
      }
    }

    prompt += `Start working on this task now.`;
    return prompt;
  }

  /**
   * Generate prompt for job (single task or first subtask)
   */
  generateJobPrompt(job: Job): string {
    if (job.prompt && (!job.subTasks || job.subTasks.length === 0)) {
      let prompt = job.prompt;
      // Add working directory context
      if (job.projectPath) {
        prompt = `**Working Directory:** \`${job.projectPath}\`\nAll file paths are relative to this directory.\n\n${prompt}`;
      }
      if (job.context) {
        prompt = `Context: ${job.context}\n\n${prompt}`;
      }
      return prompt;
    }

    let prompt = `Execute the following task: "${job.title}"\n\n`;

    // Add working directory context
    if (job.projectPath) {
      prompt += `**Working Directory:** \`${job.projectPath}\`\nAll file paths are relative to this directory.\n\n`;
    }

    if (job.context) {
      prompt += `Context: ${job.context}\n\n`;
    }

    if (!job.subTasks || job.subTasks.length === 0) {
      prompt += `Start working on this task now.`;
      return prompt;
    }

    // Multi-subtask job - generate first subtask prompt
    const firstTask = job.subTasks[0];
    if (!firstTask) {
      throw new Error('No subtasks defined');
    }

    prompt += `## Task Overview\n`;
    prompt += `This is part of a multi-step workflow. You are executing step 1 of ${job.subTasks.length}.\n\n`;
    prompt += `## Current Task\n`;
    prompt += `Use the ${firstTask.agentId} agent to: ${firstTask.task}\n\n`;
    prompt += `Start working on this task now.`;

    return prompt;
  }

  /**
   * Generate a token-efficient context summary for job-to-chat continuity
   * This replaces full session resume (~50k tokens) with a structured summary (~5k tokens)
   */
  generateJobContextSummary(job: Job, outputBuffer: string): JobContextSummary {
    // Use generous limit to capture full multi-agent reports (~5000 tokens)
    const maxFindingsLength = 20000;

    // Strip ANSI codes for cleaner summary
    const cleanOutput = outputBuffer.replace(/\x1b\[[0-9;]*m/g, '').trim();

    // Use the full output directly — the consolidator output IS the structured summary.
    // Previous regex-based extraction was fragile and missed non-English content,
    // emoji-prefixed headers, and multi-agent reports, causing only partial context injection.
    let findings = cleanOutput;

    // If output exceeds max, keep beginning (structure/overview) + end (summary/conclusion)
    if (findings.length > maxFindingsLength) {
      const halfMax = Math.floor(maxFindingsLength / 2);
      const beginning = findings.substring(0, halfMax);
      const end = findings.substring(findings.length - halfMax);
      findings = beginning + '\n\n...[middle section truncated for brevity]...\n\n' + end;
    }

    // Determine action type from job title/prompt
    const action = this.inferJobAction(job);

    return {
      jobId: job.id,
      title: job.title,
      action,
      findings,
      projectPath: job.projectPath,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Infer the action type from job title/prompt
   */
  private inferJobAction(job: Job): string {
    const titleLower = job.title.toLowerCase();
    const promptLower = (job.prompt || '').toLowerCase();
    const combined = `${titleLower} ${promptLower}`;

    if (combined.includes('code review') || combined.includes('review')) {
      return 'code review analysis';
    }
    if (combined.includes('security') || combined.includes('vulnerability')) {
      return 'security analysis';
    }
    if (combined.includes('test') || combined.includes('testing')) {
      return 'test execution/analysis';
    }
    if (combined.includes('performance') || combined.includes('profil')) {
      return 'performance analysis';
    }
    if (combined.includes('refactor')) {
      return 'code refactoring';
    }
    if (combined.includes('fix') || combined.includes('bug')) {
      return 'bug fix';
    }
    if (combined.includes('implement') || combined.includes('feature')) {
      return 'feature implementation';
    }

    return 'task execution';
  }
}
