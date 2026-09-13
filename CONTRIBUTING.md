# Contributing to Dev-Suite

Thank you for your interest in contributing to Dev-Suite! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Your First Contribution](#your-first-contribution)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Your First Contribution

You do **not** need to understand the dashboard, the installer or the target adapters to contribute something
useful. The four tracks below are self-contained, reviewed quickly, and validated by scripts you can run locally
in seconds.

| Track | What you add | Where | Node build needed? | Typical time |
|-------|--------------|-------|--------------------|--------------|
| **A — Quick-ref guide** | A focused guide for a skill that has none | `skills/{category}/{tech}/quick-ref/*.md` | No | ~20 min |
| **B — New skill** | Coverage for a technology we're missing | `skills/{category}/{tech}/SKILL.md` | No | ~45 min |
| **C — New agent** | A domain expert wired to existing skills | `agents/{category}/{name}-expert.md` | No | ~1 h |
| **D — Code fix** | Dashboard / server / MCP server bug | `configurator/`, `mcp-servers/` | Yes | varies |

### Track A — add a quick-ref guide (easiest)

Most skills ship with only a `SKILL.md`. A `quick-ref/` directory next to it holds short, task-shaped guides the
agent loads on demand — this is the highest-value, lowest-friction contribution in the repo.

```bash
# 1. Find a skill with no quick-ref yet
for d in $(find skills -name SKILL.md -printf '%h\n'); do [ -d "$d/quick-ref" ] || echo "$d"; done | head -20

# 2. Read its SKILL.md, then add focused guides next to it
mkdir -p skills/<category>/<tech>/quick-ref
$EDITOR skills/<category>/<tech>/quick-ref/patterns.md
```

Keep each guide under ~200 lines, code-first, no marketing prose. Common filenames: `basics.md`, `patterns.md`,
`testing.md`, `troubleshooting.md`.

### Track B — add a new skill

```bash
mkdir -p skills/<category>/<technology>
$EDITOR skills/<category>/<technology>/SKILL.md   # copy the frontmatter shape from a neighbouring skill
```

Pick an existing category (`ls skills`) unless the technology genuinely fits none. If an agent should get the
skill on install, add the full path (`<category>/<technology>`) to that agent's `extended_skills`.

### Track C — add a new agent

See the frontmatter contract in [CLAUDE.md](CLAUDE.md#agent-frontmatter-fields). Two rules that the CI gate
enforces and that trip up most first PRs:

- `allowed-tools` is **required** — an agent without it silently inherits every tool.
- Prefer **one** `core_skills` entry; everything else goes to `extended_skills`. Each `core_skills` entry injects
  the full skill body into every subagent spawned from that agent (~1.8k tokens each), so the cost multiplies.

### Validate before opening the PR

These are the same gates CI runs. They need only Node — no `npm install`, no build:

```bash
node scripts/validate-frontmatter.mjs     # YAML frontmatter shape across agents, commands, skills
node scripts/validate-catalog.mjs         # agent/skill/MCP metadata consistency (fails on a skill path that doesn't exist)
node scripts/audit-mcp-descriptions.mjs   # MCP tool descriptions <= 120 chars
node scripts/check-docs-sync.mjs          # prose matches the code
```

For Track D, additionally run the unit tests from `configurator/dashboard/server` (`npm test`).

### Claiming work

Comment on the issue before you start so two people don't write the same skill. If an issue has been idle for a
week after someone claimed it, it's fair game again — say so in a comment and go ahead.

No open issue matches what you want to add? Open one, or start a
[Discussion](https://github.com/claude-dev-suite/claude-dev-suite/discussions) — proposals for new technology
coverage are always welcome and rarely refused.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/dev-suite.git
   cd dev-suite
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/claude-dev-suite/claude-dev-suite.git
   ```

## Development Setup

### Prerequisites

- Node.js 20+
- npm 9+
- Git

### MCP Servers

```bash
cd mcp-servers
npm install
npm run build
```

### Dashboard

```bash
cd configurator/dashboard
npm install

# Start development server
npm run dev

# Start backend server (separate terminal)
cd server && npm run dev
```

### Running Tests

```bash
# Dashboard unit tests
cd configurator/dashboard
npm test

# Server unit tests
cd configurator/dashboard/server
npm test

# E2E tests (requires server + frontend builds)
cd configurator/dashboard
npm run build && cd server && npm run build && cd ..
npm run test:e2e
```

## How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include reproduction steps, expected vs actual behavior

### Suggesting Features

1. Check existing issues and discussions
2. Use the feature request template
3. Describe the use case and benefits

### Contributing Code

1. Look for issues labeled `good first issue` or `help wanted`
2. Comment on the issue to express interest
3. Wait for assignment before starting work

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Write/update tests** for your changes

4. **Run tests locally**:
   ```bash
   npm test
   ```

5. **Commit your changes** using conventional commits

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request** using the PR template

### PR Requirements

- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions
- [ ] PR description explains the changes

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for new code
- Follow existing code style
- Use ESLint configuration provided
- Prefer functional patterns

### File Organization

```
src/
├── components/     # React components
├── hooks/          # Custom React hooks
├── services/       # Business logic
├── stores/         # Zustand state stores
├── types/          # TypeScript types
├── utils/          # Utility functions
└── validation/     # Zod request schemas
```

### Naming Conventions

- **Files**: kebab-case (`my-component.tsx`)
- **Components**: PascalCase (`MyComponent`)
- **Functions**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/Interfaces**: PascalCase (`MyInterface`)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(dashboard): add code review panel
fix(orchestrator): correct WebSocket reconnection
docs(readme): update installation instructions
```

## Adding New Components

### New MCP Server

1. Create directory: `mcp-servers/{server-name}/`
2. Add `package.json` with scoped name
3. Add `metadata.json` with tool descriptions
4. Implement in `src/index.ts`
5. Add to workspace in `mcp-servers/package.json`

### New Agent

1. Create file: `agents/{category}/{name}-expert.md`
2. Add YAML frontmatter with skills and MCP servers
3. Write agent instructions

### New Skill

1. Create directory: `skills/{category}/{technology}/`
2. Add `SKILL.md` with skill definition
3. Optionally add `quick-ref/` guides

## Questions?

- Open a [Discussion](https://github.com/claude-dev-suite/claude-dev-suite/discussions)
- Check existing documentation in `/docs`

Thank you for contributing!
