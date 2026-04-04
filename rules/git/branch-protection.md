---
id: branch-protection
name: Branch Protection
description: Never commit directly to main/master — use feature branches and pull requests
category: git
recommended: false
---

# Branch Protection

Never commit directly to `main` or `master`. All changes go through a feature branch and pull request.

**Branch naming:** `type/short-description`
Examples: `feat/user-auth`, `fix/login-crash`, `chore/update-deps`

**Before opening a PR:**
- Rebase or merge latest `main` to avoid conflicts
- Ensure all CI checks pass
- Clean up WIP commits before requesting review
