# Documentation Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/documentation.md` for complete documentation.

## README.md Best Practices

### Essential Sections

| Section | Purpose | Required |
|---------|---------|----------|
| Title + Description | What this project does | Yes |
| Badges | Quick status indicators | Yes |
| Installation | How to install/setup | Yes |
| Usage | Basic examples | Yes |
| Contributing | Link to CONTRIBUTING.md | Yes |
| License | License name + link | Yes |
| Documentation | Link to full docs | Recommended |
| API Reference | For libraries | Recommended |
| Roadmap | Future plans | Optional |
| Acknowledgments | Credits | Optional |

### README Template

```markdown
# Project Name

[![CI](https://github.com/org/repo/actions/workflows/ci.yml/badge.svg)](https://github.com/org/repo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/package-name.svg)](https://www.npmjs.com/package/package-name)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/org/repo/badge)](https://securityscorecards.dev/viewer/?uri=github.com/org/repo)

One-line description of what this project does and why it exists.

## Features

- Feature 1: brief description
- Feature 2: brief description
- Feature 3: brief description

## Prerequisites

- Node.js >= 20
- npm >= 10

## Installation

### npm
\`\`\`bash
npm install package-name
\`\`\`

### From source
\`\`\`bash
git clone https://github.com/org/repo.git
cd repo
npm install
\`\`\`

## Quick Start

\`\`\`typescript
import { something } from 'package-name';

const result = something({ option: true });
console.log(result);
\`\`\`

## Documentation

Full documentation is available at [docs.example.com](https://docs.example.com).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```

### Badge Best Practices

| Badge | Shields.io URL Pattern |
|-------|----------------------|
| CI Status | `https://github.com/ORG/REPO/actions/workflows/ci.yml/badge.svg` |
| npm Version | `https://img.shields.io/npm/v/PACKAGE.svg` |
| License | `https://img.shields.io/badge/License-MIT-yellow.svg` |
| Coverage | `https://img.shields.io/codecov/c/github/ORG/REPO` |
| Downloads | `https://img.shields.io/npm/dm/PACKAGE.svg` |
| OpenSSF | `https://api.securityscorecards.dev/projects/github.com/ORG/REPO/badge` |
| PRs Welcome | `https://img.shields.io/badge/PRs-welcome-brightgreen.svg` |

## CONTRIBUTING.md Template

```markdown
# Contributing to [Project Name]

Thank you for your interest in contributing! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Issues

- Use the [issue tracker](https://github.com/org/repo/issues)
- Search existing issues before creating a new one
- Use the provided issue templates

### Suggesting Features

- Open a [feature request](https://github.com/org/repo/issues/new?template=feature_request.yml)
- Describe the problem you want to solve
- Explain your proposed solution

### Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write or update tests
5. Ensure all tests pass: `npm test`
6. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `git commit -m "feat: add new feature"`
7. Push to your fork: `git push origin feature/my-feature`
8. Open a Pull Request

### Development Setup

\`\`\`bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/repo.git
cd repo

# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint
\`\`\`

## Pull Request Guidelines

- Keep PRs focused and small (under 400 lines when possible)
- Update documentation for any changed behavior
- Add tests for new features
- Ensure CI passes before requesting review
- Reference related issues in the PR description

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

\`\`\`
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
\`\`\`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

## Release Process

Releases are automated via [semantic-release/Release Please]. Version numbers
follow [Semantic Versioning](https://semver.org/).

## Questions?

- Open a [Discussion](https://github.com/org/repo/discussions)
- Join our [Discord/Slack](link)

## License

By contributing, you agree that your contributions will be licensed
under the same license as the project.
```

## CODE_OF_CONDUCT.md

Use Contributor Covenant v2.1 (the most widely adopted):

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, caste, color, religion, or sexual
identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment:
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

Examples of unacceptable behavior:
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

## Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards
of acceptable behavior and will take appropriate and fair corrective action
in response to any behavior that they deem inappropriate, threatening,
offensive, or harmful.

## Scope

This Code of Conduct applies within all community spaces, and also applies
when an individual is officially representing the community in public spaces.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the community leaders responsible for enforcement at
[INSERT CONTACT METHOD].

All complaints will be reviewed and investigated promptly and fairly.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
version 2.1, available at
https://www.contributor-covenant.org/version/2/1/code_of_conduct.html
```

## CHANGELOG.md (Keep a Changelog)

### Format
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description

### Changed
- Modified behavior description

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fix description

## [1.0.0] - 2024-01-15

### Added
- Initial release

[Unreleased]: https://github.com/org/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/org/repo/releases/tag/v1.0.0
```

### Conventional Commits to Changelog Mapping

| Commit Type | Changelog Section |
|-------------|-------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `docs:` | Changed (or skip) |
| `refactor:` | Changed |
| `perf:` | Changed |
| `BREAKING CHANGE:` | Changed (major) |
| `deprecate:` | Deprecated |
| `revert:` | Removed |

## SECURITY.md Template

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x.x | Yes |
| 1.x.x | Critical fixes only |
| < 1.0 | No |

## Reporting

If you discover a security issue, please report it responsibly:

1. **Do NOT open a public issue**
2. Email: security@example.com
3. Or use [GitHub Security Advisories](https://github.com/org/repo/security/advisories/new)

### What to include:
- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | 48 hours |
| Initial assessment | 1 week |
| Fix development | 2-4 weeks |
| Public disclosure | After fix is released |

## Recognition

We maintain a [Hall of Fame](SECURITY-ACKNOWLEDGMENTS.md) for responsible reporters.
```

## Architecture Decision Records (ADR)

### MADR Template (Markdown Any Decision Records)

```markdown
# ADR-NNNN: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context

[What is the issue that we are seeing that is motivating this decision?]

## Decision

[What is the change that we are proposing and/or doing?]

## Consequences

### Positive
- [benefit 1]
- [benefit 2]

### Negative
- [drawback 1]
- [drawback 2]

### Neutral
- [observation]
```

### ADR Directory Structure
```
docs/
  adr/
    0001-use-typescript.md
    0002-choose-react-over-vue.md
    0003-adopt-monorepo.md
    template.md
```

## Documentation Site Tools

| Tool | Language | Best For |
|------|----------|----------|
| Docusaurus | React/MDX | Large projects, versioned docs |
| MkDocs Material | Python/Markdown | Clean docs, search, i18n |
| VitePress | Vue/Markdown | Vue ecosystem, fast builds |
| Starlight | Astro | Modern, multilingual docs |
| mdBook | Rust | Rust ecosystem, book-style |
| Nextra | Next.js/MDX | Next.js ecosystem |

### Docusaurus Quick Setup
```bash
npx create-docusaurus@latest docs classic
cd docs
npm start
```

### MkDocs Material Quick Setup
```bash
pip install mkdocs-material
mkdocs new docs
cd docs
mkdocs serve
```
