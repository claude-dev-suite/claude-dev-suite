---
name: git-workflow
description: |
  Git workflow best practices. Covers branching, commits, and
  collaboration. Use for version control guidance.

  USE WHEN: user mentions "git", "commit", "branch", "pull request", "PR", "merge", "rebase",
  "version control", asks about "commit message", "branching strategy", "git best practices",
  "conventional commits", "how to write PR description"

  DO NOT USE FOR: Git commands syntax - use git documentation,
  GitHub Actions CI/CD - use ci-cd skills,
  Code review quality - use `code-reviewer` agent
allowed-tools: Read, Grep, Glob
---
# Git Workflow Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `git-workflow` for comprehensive documentation.

## When NOT to Use This Skill

This skill focuses on Git workflow and collaboration. Do NOT use for:

- **Git command syntax** - Use Git official documentation or `man git`
- **CI/CD pipelines** - Use `ci-cd` or GitHub Actions specific skills
- **Code quality review** - Use `code-reviewer` agent or `clean-code` skill
- **Deployment strategies** - Use DevOps or infrastructure skills
- **Project management** - Use issue tracking and planning tools documentation

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Best Practice |
|--------------|--------------|---------------|
| **Giant commits** | Hard to review, risky to revert | Atomic commits with single purpose |
| **Vague commit messages** | "fix", "update" | Conventional commits with context |
| **Committing directly to main** | No review, breaks builds | Feature branches + PR workflow |
| **Force push to shared branches** | Destroys history, breaks others | Use `--force-with-lease`, communicate |
| **Merge commits everywhere** | Cluttered history | Rebase feature branches before merge |
| **No PR description** | Reviewers don't know context | Clear description with why/what/how |
| **Large PRs (1000+ lines)** | Impossible to review | Small, focused PRs |
| **Mixing refactor + feature** | Hard to review, hard to revert | Separate refactor and feature PRs |
| **WIP commits in main** | Unprofessional history | Squash before merge |

## Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| **Accidental commit to main** | `git status` | `git reset --soft HEAD~1`, create branch, commit there |
| **Need to undo last commit** | Keep changes? | `git reset --soft HEAD~1` (keep) or `--hard` (discard) |
| **Merge conflict** | Conflicting changes | Resolve manually, `git add`, `git commit` |
| **Pushed wrong code** | Already pushed? | `git revert <commit>` (safe) or coordinate force push |
| **Lost commits** | Deleted branch? | `git reflog`, find SHA, `git cherry-pick` or `checkout` |
| **Want to change commit message** | Last commit? | `git commit --amend` (if not pushed) |
| **PR too large** | > 500 lines | Split into multiple PRs with dependencies |

## Branch Naming

```
feature/add-user-authentication
bugfix/fix-login-redirect
hotfix/critical-security-patch
release/v1.2.0
chore/update-dependencies
docs/api-documentation
```

## Conventional Commits

```
<type>(<scope>): <description>

feat: add user authentication
fix: resolve login redirect issue
docs: update API documentation
style: format code with prettier
refactor: extract validation logic
test: add user service tests
chore: update dependencies
perf: optimize database queries
```

## Common Commands

```bash
# Branch operations
git checkout -b feature/new-feature
git branch -d feature/merged-branch
git push -u origin feature/new-feature

# Stashing
git stash
git stash pop
git stash list
git stash drop

# History
git log --oneline -20
git log --graph --oneline
git reflog

# Undo changes
git checkout -- file.txt           # Discard file changes
git reset HEAD file.txt            # Unstage file
git reset --soft HEAD~1            # Undo last commit, keep changes
git reset --hard HEAD~1            # Undo last commit, discard changes
git revert <commit>                # Create undo commit
```

## Rebase vs Merge

```bash
# Rebase (clean history)
git checkout feature
git rebase main
git push --force-with-lease

# Merge (preserve history)
git checkout main
git merge feature

# Interactive rebase
git rebase -i HEAD~3  # Squash, reorder, edit
```

## Pull Request Best Practices

| Do | Don't |
|----|----|
| Small, focused PRs | Giant PRs with unrelated changes |
| Clear description | Empty description |
| Self-review before requesting | Push broken code |
| Respond to feedback promptly | Ignore comments |
| Squash fixup commits | Leave WIP commits |

## Protected Branch Rules

```
- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- No force pushes
- No deletions
```

## Production Readiness

### Branch Strategy

```
main (production)
  └── develop
        ├── feature/user-auth
        ├── feature/payment
        └── bugfix/login-issue

Release Flow:
develop → release/v1.2.0 → main (tag v1.2.0)

Hotfix Flow:
main → hotfix/critical-fix → main + develop
```

### Commit Hooks

```bash
# .husky/commit-msg
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit $1
```

```javascript
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'test', 'chore', 'perf', 'ci', 'revert'
    ]],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
```

### Automated Changelog

```javascript
// release.config.js (semantic-release)
export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'package.json'],
      message: 'chore(release): ${nextRelease.version}'
    }]
  ]
};
```

### Code Review Checklist

```markdown
## PR Review Checklist

### Code Quality
- [ ] Follows project conventions
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] No security vulnerabilities

### Testing
- [ ] Unit tests for new code
- [ ] Integration tests if needed
- [ ] All tests passing

### Documentation
- [ ] Code is self-documenting
- [ ] Complex logic has comments
- [ ] API changes documented

### Performance
- [ ] No N+1 queries
- [ ] No memory leaks
- [ ] Appropriate caching
```

### GitHub Actions Integration

```yaml
# .github/workflows/pr-check.yml
name: PR Check

on: pull_request

jobs:
  lint-commits:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Lint commits
        uses: wagoid/commitlint-github-action@v5

  validate-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check PR title
        uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Git Configuration

```bash
# ~/.gitconfig
[user]
    name = Your Name
    email = your.email@example.com
    signingkey = YOUR_GPG_KEY

[commit]
    gpgsign = true

[pull]
    rebase = true

[fetch]
    prune = true

[init]
    defaultBranch = main

[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    lg = log --oneline --graph --decorate
    undo = reset --soft HEAD~1
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| PR merge time | < 24h |
| Review turnaround | < 4h |
| Failed CI on PR | < 10% |
| Commit message compliance | 100% |

### Checklist

- [ ] Branch naming convention
- [ ] Conventional commits
- [ ] Commit message linting
- [ ] Pre-commit hooks
- [ ] PR template
- [ ] Code review checklist
- [ ] Branch protection rules
- [ ] Automated changelog
- [ ] Semantic versioning
- [ ] GPG commit signing

## Reference Documentation
- [Rebasing](quick-ref/rebasing.md)
- [Merge Strategies](quick-ref/merging.md)
