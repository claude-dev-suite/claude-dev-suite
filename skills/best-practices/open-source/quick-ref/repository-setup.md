# Repository Setup Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/repository-setup.md` for complete documentation.

## Essential Root Files

| File | Purpose | Required |
|------|---------|----------|
| `LICENSE` | Legal license text | Yes |
| `README.md` | Project overview | Yes |
| `CONTRIBUTING.md` | Contribution guide | Yes |
| `CODE_OF_CONDUCT.md` | Community standards | Yes |
| `SECURITY.md` | Disclosure policy | Yes |
| `CHANGELOG.md` | Version history | Recommended |
| `.gitignore` | Ignored files | Yes |
| `.editorconfig` | Editor settings | Recommended |
| `GOVERNANCE.md` | Decision process | Optional |
| `CITATION.cff` | Citation metadata | Optional |
| `NOTICE` | Third-party attributions | If Apache 2.0 |

## Complete .github/ Directory Structure

```
.github/
  ISSUE_TEMPLATE/
    bug_report.yml
    feature_request.yml
    config.yml
  workflows/
    ci.yml
    release.yml
    codeql.yml
    scorecard.yml
    stale.yml
  PULL_REQUEST_TEMPLATE.md
  CODEOWNERS
  FUNDING.yml
  dependabot.yml
  SECURITY.md              (alternative location)
  CODE_OF_CONDUCT.md       (alternative location)
  CONTRIBUTING.md           (alternative location)
```

## .editorconfig Template

```ini
# .editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_size = 2

[*.py]
indent_size = 4

[*.java]
indent_size = 4

[*.go]
indent_style = tab

[Makefile]
indent_style = tab
```

## CODEOWNERS File

### Syntax
```
# .github/CODEOWNERS

# Default owners for everything
*                       @org/maintainers

# Frontend
/src/components/        @org/frontend-team
/src/styles/            @org/frontend-team
*.tsx                   @org/frontend-team
*.css                   @org/frontend-team

# Backend
/src/api/               @org/backend-team
/src/services/          @org/backend-team
/src/database/          @org/backend-team

# Infrastructure
/.github/               @org/devops-team
/docker/                @org/devops-team
Dockerfile              @org/devops-team

# Documentation
/docs/                  @org/docs-team
*.md                    @org/docs-team

# Dependencies
package.json            @org/maintainers
package-lock.json       @org/maintainers
```

### Best Practices
- Always have at least 2 owners per path
- Use team mentions (@org/team) instead of individuals
- Keep rules specific (more specific rules override general ones)
- Last matching pattern takes precedence

## Issue Templates

### Bug Report (`bug_report.yml`)
```yaml
name: Bug Report
description: Report a bug or unexpected behavior
title: "[Bug]: "
labels: ["bug", "triage"]
assignees: []
body:
  - type: markdown
    attributes:
      value: |
        Thank you for reporting this issue!

  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear description of the bug
      placeholder: What happened?
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Steps to reproduce the behavior
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What you expected to happen
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happened
    validations:
      required: true

  - type: dropdown
    id: version
    attributes:
      label: Version
      description: What version are you using?
      options:
        - Latest (main branch)
        - v2.x
        - v1.x
    validations:
      required: true

  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - Windows
        - macOS
        - Linux
        - Other

  - type: textarea
    id: logs
    attributes:
      label: Relevant Log Output
      description: Paste any relevant log output
      render: shell

  - type: checkboxes
    id: terms
    attributes:
      label: Checklist
      options:
        - label: I have searched existing issues
          required: true
        - label: I have provided reproduction steps
          required: true
```

### Feature Request (`feature_request.yml`)
```yaml
name: Feature Request
description: Suggest a new feature or enhancement
title: "[Feature]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem Statement
      description: What problem does this solve?
      placeholder: I'm frustrated when...
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: How should this work?
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: Other solutions you have considered

  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Any other context, screenshots, or mockups

  - type: checkboxes
    id: terms
    attributes:
      label: Checklist
      options:
        - label: I have searched existing issues and discussions
          required: true
```

### Config (`config.yml`)
```yaml
blank_issues_enabled: false
contact_links:
  - name: Question
    url: https://github.com/org/repo/discussions/categories/q-a
    about: Ask questions in GitHub Discussions
  - name: Documentation
    url: https://docs.example.com
    about: Check our documentation first
```

## PR Template

### `.github/PULL_REQUEST_TEMPLATE.md`
```markdown
## Description

Brief description of the changes.

Fixes #(issue number)

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Checklist

- [ ] My code follows the project style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
- [ ] I have updated documentation as needed
- [ ] My changes generate no new warnings

## Screenshots (if applicable)

## Additional Notes
```

## Labels Strategy

### Type Labels
| Label | Color | Description |
|-------|-------|-------------|
| `bug` | `#d73a4a` | Something is not working |
| `enhancement` | `#a2eeef` | New feature or request |
| `documentation` | `#0075ca` | Documentation improvements |
| `refactor` | `#e4e669` | Code improvement, no behavior change |
| `performance` | `#fbca04` | Performance improvement |
| `dependencies` | `#0366d6` | Dependency updates |

### Priority Labels
| Label | Color | Description |
|-------|-------|-------------|
| `priority: critical` | `#b60205` | Must fix immediately |
| `priority: high` | `#d93f0b` | Fix in current sprint |
| `priority: medium` | `#fbca04` | Fix in next sprint |
| `priority: low` | `#0e8a16` | Nice to have |

### Status Labels
| Label | Color | Description |
|-------|-------|-------------|
| `triage` | `#ededed` | Needs triage |
| `confirmed` | `#0e8a16` | Confirmed by maintainer |
| `wontfix` | `#ffffff` | Will not be addressed |
| `duplicate` | `#cfd3d7` | Duplicate of another issue |
| `needs-info` | `#d876e3` | Waiting for more information |

### Community Labels
| Label | Color | Description |
|-------|-------|-------------|
| `good first issue` | `#7057ff` | Good for newcomers |
| `help wanted` | `#008672` | Extra attention needed |
| `hacktoberfest` | `#ff6f00` | Hacktoberfest eligible |

### GitHub CLI for Creating Labels
```bash
# Create labels from a script
gh label create "bug" --color "d73a4a" --description "Something is not working"
gh label create "enhancement" --color "a2eeef" --description "New feature or request"
gh label create "good first issue" --color "7057ff" --description "Good for newcomers"
gh label create "help wanted" --color "008672" --description "Extra attention needed"
gh label create "priority: critical" --color "b60205" --description "Must fix immediately"
gh label create "priority: high" --color "d93f0b" --description "Fix in current sprint"
gh label create "triage" --color "ededed" --description "Needs triage"
```

## Branch Rulesets (GitHub)

### Recommended Configuration for `main`

```
Ruleset name: Protect main
Target: main branch

Rules:
 - Restrict deletions: ON
 - Require linear history: ON
 - Require a pull request before merging:
   - Required approvals: 1 (2 for large projects)
   - Dismiss stale reviews: ON
   - Require review from CODEOWNERS: ON
 - Require status checks to pass:
   - ci (required)
   - lint (required)
 - Require signed commits: ON (recommended)
 - Block force pushes: ON
```

### GitHub CLI
```bash
# View rulesets
gh api repos/{owner}/{repo}/rulesets

# Create ruleset via API
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --field name="Protect main" \
  --field target="branch" \
  --field enforcement="active" \
  --field 'conditions[ref_name][include][]=refs/heads/main'
```

## Signed Commits Setup

### GPG Signing
```bash
# Generate GPG key
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, no expiration (or 1-2 years)

# List keys
gpg --list-secret-keys --keyid-format=long

# Get key ID (after "sec rsa4096/")
# Example: sec rsa4096/ABC123DEF456 2024-01-01

# Configure Git
git config --global user.signingkey ABC123DEF456
git config --global commit.gpgsign true

# Export public key for GitHub
gpg --armor --export ABC123DEF456
# Paste output in GitHub > Settings > SSH and GPG keys
```

### SSH Signing (Simpler Alternative)
```bash
# Configure Git to use SSH for signing
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true

# Add SSH key as signing key in GitHub Settings
```

## .gitignore Best Practices

### Universal Entries
```gitignore
# OS files
.DS_Store
Thumbs.db
*.swp
*~

# IDE files
.idea/
.vscode/
*.code-workspace
*.sublime-*

# Environment
.env
.env.local
.env.*.local

# Dependencies (language-specific)
node_modules/
vendor/
__pycache__/
*.pyc
target/

# Build output
dist/
build/
out/
*.o
*.class

# Logs
*.log
npm-debug.log*

# Coverage
coverage/
.nyc_output/
htmlcov/

# Temporary files
tmp/
temp/
```

> **Tip**: Use `npx gitignore node` or `npx gitignore python` to generate language-specific .gitignore files. See [gitignore.io](https://www.toptal.com/developers/gitignore) for comprehensive templates.
