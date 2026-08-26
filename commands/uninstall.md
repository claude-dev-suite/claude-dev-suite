---
name: uninstall
description: Alias for /uninstall-dev-suite. Removes dev-suite components preserving user content.
allowed-tools: Bash
---

# Uninstall

Alias for `/uninstall-dev-suite`. See that command for the full description of what is
removed and what is preserved.

Preview:

```bash
cd ./dev-suite/configurator/dashboard/server && npm run uninstall -- --project "$OLDPWD" --dry-run
```

Remove:

```bash
cd ./dev-suite/configurator/dashboard/server && npm run uninstall -- --project "$OLDPWD"
```
