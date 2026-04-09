// SPDX-License-Identifier: MIT
/**
 * Skill Generation Prompt Builder
 *
 * Builds the system context prompt for AI-driven custom skill creation.
 * Prepended to the user's first message when chatting with Claude.
 */

const SKILL_TEMPLATE = `# My Custom Skill

## When to Use This Skill
USE WHEN:
- [Describe situations where this skill applies]

DO NOT USE FOR:
- [Describe situations where this skill should NOT be used]

## Key Patterns

### Pattern 1
\`\`\`typescript
// Example code snippet
\`\`\`

### Pattern 2
[Additional patterns and best practices]

## Anti-Patterns
- Never [thing to avoid]
- Do not [another thing to avoid]

## Checklist
- [ ] [Key item to verify]
- [ ] [Another item to verify]`;

export interface RefDoc {
  name: string;
  content: string;
  size: number;
}

const DOC_CONTENT_CAP = 8000;

/**
 * Build the context prompt that gets prepended to the user's first message.
 */
export function buildSkillGenerationContext(
  existingSkills: string[],
  referenceDocs?: RefDoc[],
): string {
  const skillsList = existingSkills.length > 0
    ? existingSkills.map((s) => `  - ${s}`).join('\n')
    : '  (none defined yet)';

  return `You are an expert at creating custom skills for Claude Code (dev-suite framework).
The user will describe the skill they want to create. Your job is to guide them through the process and generate a complete SKILL.md file.

## Workflow

1. Ask clarifying questions if the user's request is vague (technology, patterns, use cases).
2. Propose a structured plan: skill name, sections, key patterns, anti-patterns.
3. Ask for confirmation or adjustments.
4. Generate the complete SKILL.md file inside a \`\`\`markdown code block.

## Skill File Format

Skills are plain markdown files (NO YAML frontmatter). They live in \`.claude/skills/custom/{name}/SKILL.md\`. Here is the template:

\`\`\`markdown
${SKILL_TEMPLATE}
\`\`\`

## Required Sections

- **Title**: H1 heading with skill name
- **USE WHEN**: Clear list of when to apply this skill
- **DO NOT USE FOR**: Clear list of when NOT to apply this skill
- **Key Patterns**: Concrete patterns, code examples, best practices
- **Anti-Patterns**: What to avoid

## Recommended Sections

- **Checklist**: Verification steps
- **Examples**: Code snippets illustrating usage
- **Knowledge Base** references (if relevant docs exist)

## Existing Custom Skills in This Project

${skillsList}${referenceDocs && referenceDocs.length > 0 ? `

## Reference Documentation

The user has uploaded the following reference documents. Use them as primary context when generating the skill — study the APIs, patterns, and terminology they describe:

${referenceDocs.map((doc) => {
  const body = doc.content.length > DOC_CONTENT_CAP
    ? doc.content.slice(0, DOC_CONTENT_CAP) + '\n[... truncated]'
    : doc.content;
  return `### ${doc.name}\n${body}\n---`;
}).join('\n\n')}` : ''}

## Validation Checklist (content is auto-validated — ALL rules MUST pass)

The generated content is validated by an automated checker. If any rule fails, you will be asked to regenerate. To avoid rework, verify EVERY rule before outputting:

1. **USE WHEN section** (severity: warning) — Content MUST contain the exact text "USE WHEN:" or "Use this skill when" or "USARE QUANDO:". Use this heading to list when to apply the skill.
2. **DO NOT USE FOR section** (severity: warning) — Content MUST contain the exact text "DO NOT USE FOR:" or "Not suitable for" or "NON USARE PER:". Use this heading to list when NOT to apply the skill.
3. **Code examples** (severity: info) — Content MUST contain at least one code example inside triple-backtick fences (\`\`\`) or triple-tilde fences (~~~). Even a short snippet counts. Skills without code examples are flagged.
4. **Knowledge Base reference** (severity: info) — If relevant documentation exists, reference it with text like "Knowledge Base" or "knowledge/" or "documentation MCP". Optional but recommended.

## CRITICAL RULES

- **DO NOT use any tools** (Bash, Write, Read, Glob, Grep, Edit, etc.) to create, write, or modify files on disk. You are in a generation-only chat mode — you have NO permission to touch the filesystem.
- Your ONLY job is to OUTPUT the skill content as text inside a \`\`\`markdown code block. The dashboard will automatically detect the block, let the user review/edit it, and handle saving.
- When generating the final skill file, wrap it in a \`\`\`markdown code block so it can be detected and extracted.
- Do NOT create directories, do NOT write files, do NOT run commands. Just output text.

---

User's request:
`;
}

/**
 * Extract skill markdown content from Claude's output.
 * Uses fence-level counting to correctly handle nested code blocks
 * (e.g. ```typescript inside ```markdown).
 */
export function extractSkillContent(fullOutput: string): string | null {
  // Find opening ```markdown or ```md fence
  const openMatch = fullOutput.match(/```(?:markdown|md)\s*\n/);
  if (!openMatch || openMatch.index === undefined) return null;

  const startIndex = openMatch.index + openMatch[0].length;
  const remaining = fullOutput.substring(startIndex);
  const lines = remaining.split('\n');

  // Count fence levels: ``` with language tag = open, standalone ``` = close
  let level = 1;
  let endLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^```\w/.test(trimmed)) {
      level++;
    } else if (trimmed === '```') {
      level--;
      if (level === 0) {
        endLineIndex = i;
        break;
      }
    }
  }

  if (endLineIndex === -1) return null;

  const content = lines.slice(0, endLineIndex).join('\n').trim();

  // Must be a skill (starts with # heading, not --- frontmatter)
  if (content.startsWith('---')) return null;
  if (content.startsWith('#') || content.length > 50) return content;

  return null;
}
