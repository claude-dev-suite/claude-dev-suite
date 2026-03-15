# Writing Effective Skill Descriptions

## Why It Matters

The `description` field is the MOST important part of a skill. Claude reads ALL skill descriptions at startup and uses them to decide which skill to load. A bad description means the skill never triggers.

## Rules

1. **Third person only** — "Processes files" not "I can help" or "You can use this"
2. **Max 1024 characters**
3. **No XML tags**
4. **Include WHAT it does AND WHEN to use it**
5. **Be "pushy"** — mention specific contexts where the skill should activate

## Template

```yaml
description: |
  [What it does in 1-2 sentences]. Use when [specific trigger contexts].
  Also activates when [additional contexts the user might not think of].
```

## Good Examples

### Specific + When to Use
```yaml
description: |
  Extracts text and tables from PDF files, fills forms, merges documents.
  Use when working with PDF files or when the user mentions PDFs, forms,
  or document extraction.
```

### Pushy with Edge Cases
```yaml
description: |
  Creates and configures Claude Code subagents. Use when the user wants
  to create agents, delegate tasks to isolated contexts, or set up
  specialized workers. Also activates for agent memory, agent hooks,
  or tool restrictions.
```

### Action-Oriented with Trigger Keywords
```yaml
description: |
  Generates descriptive commit messages by analyzing git diffs. Use when
  the user asks for help writing commit messages or reviewing staged changes.
```

## Bad Examples

```yaml
# Too vague — Claude can't distinguish from other skills
description: Helps with documents

# No trigger context — Claude doesn't know WHEN to use it
description: Processes data and generates reports

# First person — inconsistent point of view causes discovery problems
description: I can help you process Excel files

# Too long and repetitive — wastes the 1024 char budget
description: |
  This skill is designed to help users who want to create
  React components. React is a JavaScript library for building
  user interfaces. This skill will assist with...
```

## Testing Descriptions

After writing a description, verify:
1. Ask Claude "What skills are available?" — does yours appear?
2. Make a request that should trigger it — does it load?
3. Make a request that should NOT trigger it — does it stay inactive?
4. Try different phrasings users might use

## USE WHEN / DO NOT USE FOR Pattern

For dev-suite skills, include trigger guidance directly in the description:

```yaml
description: |
  Creates MCP servers for Claude Code. Covers TypeScript implementation
  and MCP SDK patterns.

  USE WHEN: user mentions "MCP server", "create MCP", "external tool"

  DO NOT USE FOR: configuring existing MCP servers; creating skills;
  creating hooks
```

This pattern helps Claude disambiguate between related skills.
