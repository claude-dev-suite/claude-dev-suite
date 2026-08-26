---
name: ui-wizard
description: Launch the Dev-Suite Configurator dashboard for the current project
allowed-tools: Bash
---

Launch the Dev-Suite configuration dashboard for the current project.

Run the launcher from wherever dev-suite is checked out. It builds the dashboard
on first run, picks a free port, and opens the browser:

```bash
if [ -f "./dev-suite/init-project.sh" ]; then
  bash ./dev-suite/init-project.sh "$(pwd)"
elif [ -f "./init-project.sh" ]; then
  bash ./init-project.sh "$(pwd)"
else
  echo "dev-suite not found. Clone it first: git clone https://github.com/claude-dev-suite/claude-dev-suite.git dev-suite"
  exit 1
fi
```

The first run compiles the dashboard server and UI, so it takes a minute; later
runs start immediately. The server keeps running in the foreground — stop it
with Ctrl+C.

Do not add extra logic or checks. Run only the command above.
