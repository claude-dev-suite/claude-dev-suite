---
name: reconfigure
description: Modify existing dev-suite configuration. Add or remove stacks, agents, or skills.
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Bash
---

# Reconfigure Dev Suite

Modify the existing `.dev-suite.json` configuration.

## Process

1. Read the current `.dev-suite.json` file
2. Ask what the user wants to modify:
   - Add/remove stack components
   - Enable/disable agents
   - Modify skills for an agent
   - Change automation hooks
   - Update documentation strategy

3. Show current configuration for the selected area
4. Make requested changes
5. Re-run the install so the generated files stay consistent (there is no JSON schema for `.dev-suite.json`; the installer is what defines its shape)
6. Save updated configuration
7. Show summary of changes
8. **Analyze sibling projects** for CLAUDE.md updates (see below)

## Validation

Keep the selection logically consistent (e.g. do not enable the NestJS agent without a Node.js backend). Routing is regenerated into `AGENTS.md`; `CLAUDE.md` only imports it, so never hand-edit routing into `CLAUDE.md`.

## Sibling Project CLAUDE.md Analysis

After reconfiguring the dev-suite (especially when adding/removing agents), analyze sibling project folders for CLAUDE.md files that may need updates.

### When to Trigger

This analysis should run when:
- New agents are enabled
- Agents are disabled/removed
- Agent routing might be affected

### Process

1. Find the parent directory of the current project
2. Search recursively for `AGENTS.md` files in sibling folders (excluding dev-suite) —
   routing lives there now; a sibling that only has `CLAUDE.md` predates the migration
   and should be re-synced rather than hand-edited
3. For each found file:
   - Check if it contains a dev-suite agent routing section
   - Compare with the changes made in this reconfiguration
   - Suggest updates if the routing table is missing new agents

### Example

If the user enables `messaging-expert` agent:

```
Found CLAUDE.md files in sibling projects:
  • gestionale-presenze/CLAUDE.md
  • inventory-app/CLAUDE.md

⚠ Agent changes detected that may require CLAUDE.md updates:
  + messaging-expert (newly enabled - may need routing configuration)

📋 Recommended actions:
  1. Review each project's CLAUDE.md agent routing configuration
  2. Add messaging-expert to the routing table if the project handles events/messaging
  3. Update agent descriptions to include new capabilities
```

### Implementation

```bash
# Find sibling CLAUDE.md files
PARENT_DIR="$(dirname "$PROJECT_ROOT")"
find "$PARENT_DIR" -name "CLAUDE.md" -type f 2>/dev/null | grep -v "/dev-suite/"
```

Then for each file, check if it needs updates based on the configuration changes made.
