// SPDX-License-Identifier: MIT
/**
 * Agent Generation Prompts
 *
 * Template prompts for AI-based custom agent generation via the orchestrator.
 */

/**
 * System prompt for agent generation
 */
export const AGENT_GENERATION_SYSTEM_PROMPT = `You are an expert at creating Claude Code custom agents. Your task is to generate a high-quality agent definition file in markdown format with YAML frontmatter.

A Claude Code agent is a specialized assistant that focuses on a specific domain or technology. The agent file must:

1. Have valid YAML frontmatter between --- markers
2. Include all required fields: name, description, model
3. Follow best practices for Claude Code agents
4. Be actionable and specific about when to use the agent

REQUIRED FRONTMATTER STRUCTURE:
\`\`\`yaml
---
name: agent-name-in-kebab-case
description: |
  Clear, detailed description of what this agent does.
  Should be at least 50 characters and explain the role.
model: sonnet
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
skills:
  - skill-reference-1
  - skill-reference-2
mcp_servers:
  - documentation
  - api-tester
---
\`\`\`

REQUIRED CONTENT SECTIONS:
1. # Agent Title (H1)
2. ## Role - What the agent is responsible for
3. ## Behavior - How the agent should act (execute vs analyze)
4. ## Guidelines - Specific rules and best practices
5. ## Anti-patterns - What the agent should NOT do

BEST PRACTICES:
- Description should clearly state when to use this agent
- Include specific technologies or domains of expertise
- Define clear boundaries (what it does vs doesn't do)
- Include security considerations if it has Bash access
- Reference relevant skills and MCP servers`;

/**
 * User prompt template for agent generation
 */
export function generateAgentPrompt(params: {
  name: string;
  description: string;
  techFocus?: string[];
  skills?: string[];
  mcpServers?: string[];
  model?: string;
}): string {
  const { name, description, techFocus = [], skills = [], mcpServers = [], model = 'sonnet' } = params;

  const techFocusText = techFocus.length > 0
    ? `\nTechnology focus areas: ${techFocus.join(', ')}`
    : '';

  const skillsText = skills.length > 0
    ? `\nSelected skills to reference: ${skills.join(', ')}`
    : '';

  const mcpText = mcpServers.length > 0
    ? `\nSelected MCP servers: ${mcpServers.join(', ')}`
    : '';

  return `Create a custom Claude Code agent with the following specifications:

Agent name: ${name}
Description/Purpose: ${description}
Model: ${model}${techFocusText}${skillsText}${mcpText}

Generate a complete agent markdown file with:
1. Valid YAML frontmatter with all required fields
2. Detailed role description
3. Clear behavior guidelines (when to execute vs analyze)
4. Specific guidelines for the domain
5. Anti-patterns to avoid

The agent should be production-ready and follow all Claude Code best practices.`;
}

/**
 * Prompt for refining an existing agent
 */
export function refineAgentPrompt(currentContent: string, feedback: string): string {
  return `I have an existing Claude Code agent that needs improvement based on the following feedback:

CURRENT AGENT:
\`\`\`markdown
${currentContent}
\`\`\`

FEEDBACK/REQUESTED CHANGES:
${feedback}

Please generate an improved version of this agent that:
1. Addresses all the feedback points
2. Maintains the existing structure and YAML frontmatter format
3. Keeps the same name unless specifically requested to change
4. Follows Claude Code agent best practices

Generate the complete improved agent file.`;
}

/**
 * Prompt for generating a skill for a custom agent
 */
export const SKILL_GENERATION_SYSTEM_PROMPT = `You are an expert at creating Claude Code skills. A skill is a focused knowledge module that agents can reference.

A skill file (SKILL.md) must include:

1. Title and description
2. USE WHEN: section - when to apply this skill
3. DO NOT USE FOR: section - when NOT to use it
4. Core concepts and patterns
5. Code examples where relevant

STRUCTURE:
\`\`\`markdown
# Skill Name

Brief description of what this skill covers.

## USE WHEN:

- Scenario 1 where this skill applies
- Scenario 2 where this skill applies

## DO NOT USE FOR:

- Scenario where a different skill is better
- Out of scope scenarios

## Core Concepts

### Concept 1

Explanation and examples...

### Concept 2

Explanation and examples...

## Best Practices

- Practice 1
- Practice 2

## Examples

\\\`\\\`\\\`language
// Code example
\\\`\\\`\\\`
\`\`\`

Make skills focused, actionable, and easy to reference.`;

/**
 * User prompt for skill generation
 */
export function generateSkillPrompt(params: {
  name: string;
  description: string;
  relatedAgent?: string;
}): string {
  const { name, description, relatedAgent } = params;

  const agentContext = relatedAgent
    ? `\nThis skill will be used by the "${relatedAgent}" custom agent.`
    : '';

  return `Create a Claude Code skill with the following specifications:

Skill name: ${name}
Description/Purpose: ${description}${agentContext}

Generate a complete SKILL.md file with:
1. Clear USE WHEN and DO NOT USE FOR sections
2. Core concepts relevant to the skill
3. Best practices
4. Code examples where appropriate

The skill should be focused and easy for agents to reference.`;
}

/**
 * Job configuration for agent generation via orchestrator
 */
export interface AgentGenerationJobConfig {
  type: 'generate-custom-agent';
  projectPath: string;
  name: string;
  description: string;
  techFocus?: string[];
  skills?: string[];
  mcpServers?: string[];
  model?: string;
}

/**
 * Build orchestrator prompt for agent generation
 */
export function buildAgentGenerationOrchestratorPrompt(config: AgentGenerationJobConfig): string {
  return `${AGENT_GENERATION_SYSTEM_PROMPT}

---

${generateAgentPrompt({
    name: config.name,
    description: config.description,
    techFocus: config.techFocus,
    skills: config.skills,
    mcpServers: config.mcpServers,
    model: config.model,
  })}

After generating the agent content, save it to:
${config.projectPath}/.claude/agents/custom/${config.name}.md

Make sure to create the custom directory if it doesn't exist.`;
}
