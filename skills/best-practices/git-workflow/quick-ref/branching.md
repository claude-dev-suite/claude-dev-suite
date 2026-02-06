# Git Branching Strategies Quick Reference

> **Knowledge Base:** Read `knowledge/git/branching.md` for complete documentation.

## Git Flow

```
main (production)
  └── develop (integration)
        ├── feature/add-login
        ├── feature/user-profile
        └── release/1.0.0
              └── hotfix/fix-login
```

```bash
# Feature branch
git checkout develop
git checkout -b feature/add-login
# ... work on feature
git checkout develop
git merge --no-ff feature/add-login
git branch -d feature/add-login

# Release branch
git checkout develop
git checkout -b release/1.0.0
# ... final fixes
git checkout main
git merge --no-ff release/1.0.0
git tag -a v1.0.0 -m "Release 1.0.0"
git checkout develop
git merge --no-ff release/1.0.0
git branch -d release/1.0.0

# Hotfix
git checkout main
git checkout -b hotfix/fix-login
# ... fix bug
git checkout main
git merge --no-ff hotfix/fix-login
git tag -a v1.0.1
git checkout develop
git merge --no-ff hotfix/fix-login
```

## GitHub Flow (Simplified)

```
main (production, always deployable)
  ├── feature/add-login
  └── fix/user-bug
```

```bash
# 1. Create branch from main
git checkout main
git pull origin main
git checkout -b feature/add-login

# 2. Work and commit
git add .
git commit -m "feat: add login page"
git push -u origin feature/add-login

# 3. Open Pull Request

# 4. Review, discuss, test

# 5. Merge PR (via GitHub UI)

# 6. Delete branch
git branch -d feature/add-login
git push origin --delete feature/add-login
```

## Trunk-Based Development

```
main (trunk)
  ├── short-lived feature branches (< 1 day)
  └── releases via tags or release branches
```

```bash
# Very short-lived branches
git checkout main
git pull
git checkout -b feature/small-change

# Quick work (hours, not days)
git add .
git commit -m "feat: small change"

# Merge back quickly
git checkout main
git pull
git merge feature/small-change
git push
git branch -d feature/small-change

# Or use feature flags for larger changes
```

## Conventional Commits

```bash
# Format: <type>(<scope>): <description>

# Types
feat:     # New feature
fix:      # Bug fix
docs:     # Documentation
style:    # Formatting, no code change
refactor: # Code restructure
perf:     # Performance improvement
test:     # Tests
build:    # Build system
ci:       # CI config
chore:    # Maintenance

# Examples
feat(auth): add login with Google
fix(api): handle null response from server
docs(readme): update installation steps
refactor(users): extract validation logic
test(cart): add unit tests for checkout
chore(deps): update dependencies

# Breaking changes
feat(api)!: change user endpoint response format

# With body and footer
git commit -m "feat(auth): add OAuth2 support

Implements OAuth2 authentication with Google and GitHub providers.

BREAKING CHANGE: removed legacy session-based auth
Closes #123"
```

## Branch Naming Conventions

```bash
# Feature branches
feature/add-login
feature/user-profile
feature/JIRA-123-add-payment

# Bug fixes
fix/login-error
fix/user-redirect
bugfix/JIRA-456-null-pointer

# Hotfixes
hotfix/security-patch
hotfix/v1.0.1

# Releases
release/1.0.0
release/2024-01

# Other
docs/api-documentation
refactor/auth-module
test/payment-integration
chore/update-dependencies
```

## Pull Request Best Practices

```markdown
## PR Title
feat(auth): add OAuth2 support

## Description
- Added Google OAuth2 provider
- Added GitHub OAuth2 provider
- Updated user model with provider field

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing completed

## Screenshots (if applicable)
...

## Checklist
- [x] Code follows style guide
- [x] Self-reviewed
- [x] Comments added for complex code
- [x] Documentation updated
- [x] No new warnings
```

## Merge Strategies

```bash
# Merge commit (preserves history)
git merge --no-ff feature/branch

# Squash merge (clean history)
git merge --squash feature/branch
git commit -m "feat: add feature"

# Rebase (linear history)
git checkout feature/branch
git rebase main
git checkout main
git merge feature/branch  # Fast-forward

# GitHub PR merge options:
# - Create merge commit (--no-ff)
# - Squash and merge (--squash)
# - Rebase and merge (linear)
```

## Protected Branches

```yaml
# GitHub branch protection rules
# Settings > Branches > Branch protection rules

- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- Require signed commits
- Include administrators
- Restrict who can push
- Allow force pushes (disable!)
- Allow deletions (disable!)
```

**Official docs:** https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows
