// SPDX-License-Identifier: MIT
/**
 * Utility functions for HooksConfig component
 */

import type { ClaudeHookCommand } from '@/types';

export function getHookDescription(hookType: string): string {
  const descriptions: Record<string, string> = {
    'pre-commit': 'Run before committing changes',
    'commit-msg': 'Validate commit message format',
    'post-commit': 'Run after commit is created',
    'pre-push': 'Run before pushing to remote',
    'post-merge': 'Run after merge completes',
    'post-checkout': 'Run after checkout completes',
    'pre-merge-commit': 'Run before merge commit',
    'prepare-commit-msg': 'Prepare commit message',
  };
  return descriptions[hookType] || 'Git hook';
}

function getHumanReadableCommand(cmd: ClaudeHookCommand): string {
  if (typeof cmd === 'string') {
    if (cmd.includes('tsc --noEmit')) {
      return 'TypeScript type-check';
    }
    if (cmd.includes('prettier --write') || cmd.includes('biome format')) {
      if (cmd.includes('prettier') && cmd.includes('biome')) {
        return 'Auto-format (Prettier/Biome)';
      }
      if (cmd.includes('prettier')) return 'Auto-format (Prettier)';
      if (cmd.includes('biome')) return 'Auto-format (Biome)';
    }
    if (cmd.includes('eslint')) {
      return 'ESLint check';
    }
    if (cmd.includes('npm test') || cmd.includes('vitest') || cmd.includes('jest')) {
      return 'Run tests';
    }
    if (cmd.includes('npm run build')) {
      return 'Build project';
    }
    if (cmd.length > 40) {
      return cmd.substring(0, 37) + '...';
    }
    return cmd;
  }
  if (cmd.type === 'prompt') {
    return 'Integration Validator (prompt-based)';
  }
  return String(cmd);
}

export function formatHookCommands(commands: ClaudeHookCommand[]): string {
  if (!commands || commands.length === 0) return 'No commands';
  return commands.map(getHumanReadableCommand).join(', ');
}

export function hasPromptHook(commands: ClaudeHookCommand[]): boolean {
  return commands.some(cmd => typeof cmd === 'object' && cmd.type === 'prompt');
}
