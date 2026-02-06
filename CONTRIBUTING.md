# Contributing to Dev-Suite

Thank you for your interest in contributing to Dev-Suite! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

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
# Dashboard tests
cd configurator/dashboard
npm test

# Server tests
cd configurator/dashboard/server
npm test
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
├── types/          # TypeScript types
└── utils/          # Utility functions
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
