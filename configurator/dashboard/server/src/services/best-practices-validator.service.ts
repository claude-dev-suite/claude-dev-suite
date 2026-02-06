// SPDX-License-Identifier: MIT
/**
 * Best Practices Validator Service
 *
 * Validates custom agents and skills against Claude Code best practices.
 * Returns warnings that are bypassable (not blocking).
 */

import type { BestPracticeWarning, BestPracticeSeverity } from '../types/custom-agents.js';
import type { CustomAgentFrontmatter } from '../validation/schemas.js';

/**
 * Validation rule definition
 */
interface ValidationRule {
  id: string;
  severity: BestPracticeSeverity;
  check: (content: string, frontmatter?: CustomAgentFrontmatter) => string | null;
}

export class BestPracticesValidatorService {
  /**
   * Validation rules for agents
   */
  private agentRules: ValidationRule[] = [
    {
      id: 'description-length',
      severity: 'warning',
      check: (_content, frontmatter) => {
        if (!frontmatter?.description) {
          return 'Missing description in frontmatter';
        }
        if (frontmatter.description.length < 50) {
          return `Description is too short (${frontmatter.description.length} chars). Should be at least 50 characters to clearly explain the agent's role.`;
        }
        return null;
      },
    },
    {
      id: 'action-vs-analysis',
      severity: 'warning',
      check: (content) => {
        const hasActionGuidelines =
          content.toLowerCase().includes('execute') ||
          content.toLowerCase().includes('modify') ||
          content.toLowerCase().includes('write code') ||
          content.toLowerCase().includes('directly') ||
          content.toLowerCase().includes('action');

        const hasAnalysisGuidelines =
          content.toLowerCase().includes('analysis') ||
          content.toLowerCase().includes('research') ||
          content.toLowerCase().includes('investigate') ||
          content.toLowerCase().includes('examine');

        if (!hasActionGuidelines && !hasAnalysisGuidelines) {
          return 'Should define when the agent should take action vs. perform analysis only';
        }
        return null;
      },
    },
    {
      id: 'skills-defined',
      severity: 'warning',
      check: (_content, frontmatter) => {
        if (!frontmatter?.skills || frontmatter.skills.length === 0) {
          return 'No skills referenced. Consider adding relevant skills for domain expertise.';
        }
        return null;
      },
    },
    {
      id: 'allowed-tools-safe',
      severity: 'warning',
      check: (content, frontmatter) => {
        const allowedTools = frontmatter?.['allowed-tools'] || '';
        const hasBash = allowedTools.toLowerCase().includes('bash');

        if (hasBash) {
          // Check if there are security guidelines
          const hasSecurityGuidelines =
            content.toLowerCase().includes('security') ||
            content.toLowerCase().includes('safe') ||
            content.toLowerCase().includes('caution') ||
            content.toLowerCase().includes('avoid destructive') ||
            content.toLowerCase().includes('do not') ||
            content.toLowerCase().includes('never');

          if (!hasSecurityGuidelines) {
            return 'Agent has Bash access but no security guidelines. Add instructions about safe command usage.';
          }
        }
        return null;
      },
    },
    {
      id: 'behavior-section',
      severity: 'warning',
      check: (content) => {
        const hasBehaviorSection =
          content.includes('## Behavior') ||
          content.includes('## Comportamento') ||
          content.includes('## Guidelines') ||
          content.includes('## Linee Guida') ||
          content.includes('## Rules') ||
          content.includes('## Regole');

        if (!hasBehaviorSection) {
          return 'Missing behavior/guidelines section. Add ## Behavior or ## Guidelines to define expected agent behavior.';
        }
        return null;
      },
    },
    {
      id: 'anti-patterns',
      severity: 'info',
      check: (content) => {
        const hasAntiPatterns =
          content.toLowerCase().includes('anti-pattern') ||
          content.toLowerCase().includes('avoid') ||
          content.toLowerCase().includes('do not') ||
          content.toLowerCase().includes('never') ||
          content.toLowerCase().includes('non fare') ||
          content.toLowerCase().includes('evitare');

        if (!hasAntiPatterns) {
          return 'Consider adding anti-patterns section to clarify what the agent should NOT do.';
        }
        return null;
      },
    },
    {
      id: 'documentation-protocol',
      severity: 'info',
      check: (content, frontmatter) => {
        const hasMcpDocs =
          frontmatter?.mcp_servers?.includes('documentation') ||
          frontmatter?.['allowed-tools']?.includes('documentation');

        if (hasMcpDocs) {
          const hasDocProtocol =
            content.toLowerCase().includes('knowledge base') ||
            content.toLowerCase().includes('documentation') ||
            content.toLowerCase().includes('docs') ||
            content.toLowerCase().includes('load') ||
            content.toLowerCase().includes('fetch') ||
            content.toLowerCase().includes('read');

          if (!hasDocProtocol) {
            return 'Agent has documentation MCP access. Consider specifying when and how to use the knowledge base.';
          }
        }
        return null;
      },
    },
    {
      id: 'role-section',
      severity: 'info',
      check: (content) => {
        const hasRoleSection =
          content.includes('## Role') ||
          content.includes('## Ruolo') ||
          content.includes('# ') && content.toLowerCase().includes('expert');

        if (!hasRoleSection) {
          return 'Consider adding a ## Role section to clearly define the agent\'s purpose.';
        }
        return null;
      },
    },
  ];

  /**
   * Validation rules for skills
   */
  private skillRules: ValidationRule[] = [
    {
      id: 'use-when-defined',
      severity: 'warning',
      check: (content) => {
        const hasUseWhen =
          content.includes('USE WHEN:') ||
          content.includes('Use when:') ||
          content.includes('Use this skill when') ||
          content.includes('USARE QUANDO:');

        if (!hasUseWhen) {
          return 'Missing "USE WHEN:" section to clarify when this skill should be applied.';
        }
        return null;
      },
    },
    {
      id: 'do-not-use-defined',
      severity: 'warning',
      check: (content) => {
        const hasDoNotUse =
          content.includes('DO NOT USE FOR:') ||
          content.includes('Do not use for:') ||
          content.includes('Not suitable for') ||
          content.includes('NON USARE PER:');

        if (!hasDoNotUse) {
          return 'Missing "DO NOT USE FOR:" section to clarify when this skill should NOT be applied.';
        }
        return null;
      },
    },
    {
      id: 'kb-reference',
      severity: 'info',
      check: (content) => {
        const hasKbRef =
          content.includes('Knowledge Base') ||
          content.includes('knowledge/') ||
          content.includes('kb/') ||
          content.includes('documentation MCP');

        if (!hasKbRef) {
          return 'Consider referencing the Knowledge Base if relevant documentation exists.';
        }
        return null;
      },
    },
    {
      id: 'examples-included',
      severity: 'info',
      check: (content) => {
        const hasExamples =
          content.includes('```') ||
          content.includes('Example:') ||
          content.includes('example:') ||
          content.includes('Esempio:');

        if (!hasExamples) {
          return 'Consider including code examples to illustrate usage patterns.';
        }
        return null;
      },
    },
  ];

  /**
   * Validate agent content against best practices
   */
  validateAgent(content: string, frontmatter?: CustomAgentFrontmatter): BestPracticeWarning[] {
    const warnings: BestPracticeWarning[] = [];

    for (const rule of this.agentRules) {
      const message = rule.check(content, frontmatter);
      if (message) {
        warnings.push({
          rule: rule.id,
          message,
          severity: rule.severity,
          line: this.findLineNumber(content, rule.id),
        });
      }
    }

    return warnings;
  }

  /**
   * Validate skill content against best practices
   */
  validateSkill(content: string): BestPracticeWarning[] {
    const warnings: BestPracticeWarning[] = [];

    for (const rule of this.skillRules) {
      const message = rule.check(content);
      if (message) {
        warnings.push({
          rule: rule.id,
          message,
          severity: rule.severity,
          line: this.findLineNumber(content, rule.id),
        });
      }
    }

    return warnings;
  }

  /**
   * Get all available rule IDs
   */
  getAgentRuleIds(): string[] {
    return this.agentRules.map((r) => r.id);
  }

  /**
   * Get all available skill rule IDs
   */
  getSkillRuleIds(): string[] {
    return this.skillRules.map((r) => r.id);
  }

  /**
   * Find the line number where a rule violation might occur
   */
  private findLineNumber(content: string, ruleId: string): number | undefined {
    // For certain rules, we can pinpoint where the issue is
    const lines = content.split('\n');

    switch (ruleId) {
      case 'behavior-section':
        // Look for where ## sections start
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.startsWith('## ')) {
            return i + 1;
          }
        }
        break;

      case 'description-length':
        // Description is in frontmatter, usually near the top
        for (let i = 0; i < Math.min(lines.length, 15); i++) {
          if (lines[i]?.startsWith('description:')) {
            return i + 1;
          }
        }
        break;

      case 'skills-defined':
        // Skills array in frontmatter
        for (let i = 0; i < Math.min(lines.length, 20); i++) {
          if (lines[i]?.startsWith('skills:')) {
            return i + 1;
          }
        }
        break;
    }

    return undefined;
  }
}
