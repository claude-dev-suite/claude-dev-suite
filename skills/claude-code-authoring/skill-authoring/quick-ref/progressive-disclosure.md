# Progressive Disclosure Patterns

## Concept

SKILL.md is the entry point (< 500 lines). Detailed content goes in bundled files that Claude loads only when needed. This saves context tokens.

## Pattern 1: High-Level Guide with References

```markdown
# PDF Processing

## Quick start
[essential code block]

## Advanced features
**Form filling**: See [FORMS.md](FORMS.md) for complete guide
**API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
**Examples**: See [EXAMPLES.md](EXAMPLES.md) for common patterns
```

Claude reads FORMS.md only when the user asks about forms.

## Pattern 2: Domain-Specific Organization

```
bigquery-skill/
├── SKILL.md (overview + navigation)
└── reference/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    ├── product.md (API usage, features)
    └── marketing.md (campaigns, attribution)
```

SKILL.md points to each domain file. Claude reads only the relevant one.

## Pattern 3: Conditional Details

```markdown
# DOCX Processing

## Creating documents
Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents
For simple edits, modify the XML directly.

**For tracked changes**: See [REDLINING.md](REDLINING.md)
**For OOXML details**: See [OOXML.md](OOXML.md)
```

## Rules

1. **One level deep only** — SKILL.md → reference.md (never SKILL.md → A.md → B.md)
2. **Table of contents** for reference files > 100 lines
3. **Descriptive filenames** — `form_validation_rules.md` not `doc2.md`
4. **Forward slashes** in all paths (even on Windows)

## Token Economics

- **Metadata (name + description)**: always loaded (~100 words)
- **SKILL.md body**: loaded when skill triggers
- **Bundled files**: loaded only when Claude reads them (zero cost until accessed)
- **Scripts**: executed without loading into context (only output consumes tokens)

## Anti-Pattern: Too Much in SKILL.md

If your SKILL.md is over 500 lines, split it:

```
Before (700-line SKILL.md):
├── SKILL.md (everything)

After:
├── SKILL.md (~200 lines: overview, quick start, navigation)
├── api-reference.md (~300 lines: detailed API docs)
└── examples.md (~200 lines: usage examples)
```
