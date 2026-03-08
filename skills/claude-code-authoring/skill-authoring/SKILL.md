---
name: skill-authoring
description: |
  Creates and improves Claude Code Skills (SKILL.md files). Covers frontmatter,
  descriptions, progressive disclosure, bundled resources, and content guidelines.
  Follows official Anthropic best practices.

  USE WHEN: user mentions "create skill", "write skill", "SKILL.md", "skill file",
  "slash command", "custom command", "extend Claude", "skill description",
  "skill not triggering", "skill authoring"

  DO NOT USE FOR: creating agents/subagents - use `agent-authoring`;
  creating hooks - use `hook-authoring`; creating MCP servers - use `mcp-authoring`;
  creating plugins - use `plugin-authoring`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Skill Authoring — Official Best Practices

## File Structure

```
skill-name/
├── SKILL.md              # Main instructions (< 500 lines)
├── reference.md          # Detailed docs (loaded on demand)
├── examples.md           # Usage examples (loaded on demand)
└── scripts/
    └── helper.py         # Utility scripts (executed, not loaded)
```

## YAML Frontmatter

```yaml
---
name: my-skill                      # max 64 chars, lowercase + hyphens only
description: |                      # max 1024 chars, THIRD PERSON, no XML tags
  Processes PDF files and extracts text. Use when working with
  PDF files or when the user mentions document extraction.
disable-model-invocation: false     # true = only user can invoke via /name
user-invocable: true                # false = hidden from / menu, Claude-only
allowed-tools: Read, Grep, Glob     # restrict tools when skill is active
model: sonnet                       # model override (sonnet, opus, haiku)
context: fork                       # run in isolated subagent context
agent: Explore                      # agent type when context: fork
---
```

Required: only `description` is recommended. `name` defaults to directory name.

## Description — The Most Critical Field

Claude uses the description to decide which skill to load from 100+ available.

**Rules:**
- Write in **third person** ("Processes files", NOT "I can help" or "You can use")
- Include **what** it does AND **when** to use it
- Be "pushy" — mention specific trigger contexts
- Include key terms users would naturally say

**Good:**
```yaml
description: Generates commit messages by analyzing git diffs. Use when
  the user asks for help writing commit messages or reviewing staged changes.
```

**Bad:**
```yaml
description: Helps with git stuff
```

## Core Content Principles

### Claude is already smart — only add what it doesn't know

Challenge every line: "Does Claude need this explanation?" Remove basics.

**Good** (~50 tokens):
````markdown
## Extract PDF text
Use pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

**Bad** (~150 tokens): explaining what PDFs are, what libraries are, how pip works.

### One recommended approach, not many alternatives

Provide a **default** tool/library. Only mention alternatives when the choice is context-dependent.

### Consistent terminology

Pick one term and use it throughout. Don't mix "endpoint", "URL", "route", "path".

### No time-sensitive information

Don't write "as of 2025" or "before August, use the old API".

## Progressive Disclosure

SKILL.md is a table of contents. Detailed content goes in separate files.

**Pattern 1: References**
```markdown
## Quick start
[essential code here]

## Advanced features
- **Form filling**: See [FORMS.md](FORMS.md)
- **API reference**: See [REFERENCE.md](REFERENCE.md)
```

**Pattern 2: Domain-specific**
```text
bigquery-skill/
├── SKILL.md (overview + navigation)
└── reference/
    ├── finance.md
    ├── sales.md
    └── product.md
```

**Rules:**
- Keep references **one level deep** from SKILL.md (no nested chains)
- Reference files > 100 lines need a **table of contents** at top
- Claude loads referenced files only when needed — no context penalty

## String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to skill |
| `$ARGUMENTS[N]` or `$N` | Specific argument by index |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Directory containing SKILL.md |

Dynamic injection: `` !`shell command` `` runs before Claude sees the content.

## Invocation Control

| Config | User invokes | Claude invokes |
|--------|-------------|----------------|
| Default | Yes | Yes |
| `disable-model-invocation: true` | Yes | No |
| `user-invocable: false` | No | Yes |

## Workflows & Feedback Loops

For complex tasks, provide a checklist Claude can track:

```markdown
## Deploy workflow
- [ ] Step 1: Run tests
- [ ] Step 2: Build artifacts
- [ ] Step 3: Deploy to staging
- [ ] Step 4: Verify deployment
- [ ] Step 5: Deploy to production
```

Implement validation loops: Run validator → fix → re-validate → proceed only when passing.

## Anti-Patterns to Avoid

| Anti-Pattern | Fix |
|--------------|-----|
| Body > 500 lines | Split into SKILL.md + reference files |
| Deeply nested references (A→B→C) | Keep all refs one level from SKILL.md |
| Too many options | Provide one default, mention alternative only when needed |
| First/second person description | Always third person |
| Vague description | Include what + when + trigger keywords |
| Windows-style paths (`\`) | Always use forward slashes |
| Explaining basics Claude knows | Remove — Claude is already smart |

## Checklist Before Shipping

- [ ] Description is specific, third person, includes trigger terms
- [ ] SKILL.md body < 500 lines
- [ ] Additional details in separate reference files
- [ ] No time-sensitive info
- [ ] Consistent terminology throughout
- [ ] Concrete examples, not abstract
- [ ] References one level deep
- [ ] Tested with at least 3 real scenarios

## Reference
- [Progressive disclosure patterns](quick-ref/progressive-disclosure.md)
- [Writing effective descriptions](quick-ref/description-triggers.md)
