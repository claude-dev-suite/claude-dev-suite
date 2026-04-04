---
id: conventional-commits
name: Conventional Commits
description: All commits must follow the Conventional Commits specification
category: git
recommended: true
---

# Conventional Commits

All commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

Format: `type(scope): description`

**Types:**
- `feat` — new feature → triggers MINOR version bump
- `fix` — bug fix → triggers PATCH version bump
- `docs` — documentation only
- `refactor` — restructuring without behaviour change
- `test` — adding or updating tests
- `chore` — maintenance, dependency updates, build changes
- `perf` — performance improvements
- `ci` — CI/CD configuration changes

**Rules:**
- Description must be lowercase, imperative mood ("add feature" not "added feature")
- Scope is optional but recommended for larger projects
- Breaking changes: append `!` after type/scope (e.g. `feat!: remove endpoint`) or add `BREAKING CHANGE:` footer
- Never use generic messages like "fix", "update", "changes", or "WIP" as the entire commit message
