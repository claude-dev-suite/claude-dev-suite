---
name: uninstall-dev-suite
description: Remove dev-suite components from a project. Only removes tracked components, preserves user content.
allowed-tools: Bash, Read, Glob, AskUserQuestion
argument-hint: [project-path]
---

# Uninstall Dev-Suite Command

Removes dev-suite components from a project while preserving any user-created content.

## IMPORTANT: User Content Preservation

This command ONLY removes components tracked in the manifest (`.dev-suite-manifest.json`).

**Preserved (never deleted):**
- User-created agents (not in manifest)
- User-created skills (not in manifest)
- User-created commands (not in manifest)
- User's MCP servers in `.mcp.json` (only dev-suite servers removed)
- User's MCP server directories in `.mcp-servers/` (only dev-suite servers removed)
- User content in `CLAUDE.md` (only dev-suite section removed)
- `.claude/settings.json` and `.claude/settings.local.json`

## What Gets Removed (With Manifest)

| Component | What's Removed |
|-----------|----------------|
| Agents | Only files listed in `manifest.files` under `.claude/agents/` |
| Skills | Only files listed in `manifest.files` under `.claude/skills/` |
| Commands | Only files listed in `manifest.files` under `.claude/commands/` |
| MCP Servers | Only servers in `manifest.mcpServers` |
| `.mcp.json` | Only dev-suite server entries (file kept if user has other servers) |
| `.dev-suite.json` | Always removed |
| `.dev-suite-manifest.json` | Always removed |
| `.kb-cache/` | Always removed (just cache) |
| `CLAUDE.md` | Only the dev-suite section between markers |

## What Gets Removed (Without Manifest)

Only minimal safe files are removed:
- `.dev-suite.json`
- `.dev-suite-manifest.json`
- `.kb-cache/`
- Dev-suite section from `CLAUDE.md`

**Everything else is preserved** because we can't know what's user content.

---

## Step 1: Determine Target Path

```bash
# If argument provided, use it; otherwise use current directory
TARGET_PATH="${1:-.}"

# Resolve to absolute path
TARGET_PATH="$(cd "$TARGET_PATH" 2>/dev/null && pwd)"
echo "Target: $TARGET_PATH"
```

---

## Step 2: Check for Manifest

Read the manifest to understand what dev-suite installed:

```bash
MANIFEST_PATH="$TARGET_PATH/.dev-suite-manifest.json"

if [ -f "$MANIFEST_PATH" ]; then
    echo "✓ Found manifest - will remove only tracked components"
    HAS_MANIFEST=true
else
    echo "⚠ No manifest found - will do minimal safe cleanup only"
    HAS_MANIFEST=false
fi
```

---

## Step 3: Show What Will Be Removed

### With Manifest:
```bash
if [ "$HAS_MANIFEST" = true ]; then
    echo ""
    echo "Components to remove (from manifest):"

    # Count tracked files
    AGENT_COUNT=$(cat "$MANIFEST_PATH" | grep -o '".claude/agents/[^"]*"' | wc -l)
    SKILL_COUNT=$(cat "$MANIFEST_PATH" | grep -o '".claude/skills/[^"]*"' | wc -l)
    COMMAND_COUNT=$(cat "$MANIFEST_PATH" | grep -o '".claude/commands/[^"]*"' | wc -l)

    [ "$AGENT_COUNT" -gt 0 ] && echo "  - $AGENT_COUNT tracked agent files"
    [ "$SKILL_COUNT" -gt 0 ] && echo "  - $SKILL_COUNT tracked skill files"
    [ "$COMMAND_COUNT" -gt 0 ] && echo "  - $COMMAND_COUNT tracked command files"

    # MCP servers from manifest
    echo "  - MCP servers from manifest.mcpServers"
    echo "  - Dev-suite entries from .mcp.json (user servers preserved)"
    echo "  - Dev-suite section from CLAUDE.md (user content preserved)"
    echo "  - .dev-suite.json, .dev-suite-manifest.json, .kb-cache/"
fi
```

### Without Manifest:
```bash
if [ "$HAS_MANIFEST" = false ]; then
    echo ""
    echo "Minimal cleanup (no manifest):"
    echo "  - .dev-suite.json (if exists)"
    echo "  - .dev-suite-manifest.json (if exists)"
    echo "  - .kb-cache/ (if exists)"
    echo "  - Dev-suite section from CLAUDE.md"
    echo ""
    echo "⚠ User content will be preserved:"
    echo "  - .claude/agents/ (may contain user agents)"
    echo "  - .claude/skills/ (may contain user skills)"
    echo "  - .mcp.json (may contain user servers)"
    echo "  - .mcp-servers/ (may contain user servers)"
fi
```

---

## Step 4: Ask for Confirmation

Use `AskUserQuestion` to confirm:

**Question**: "Proceed with uninstallation?"
**Header**: "Confirm"
**Options**:
1. `Yes, proceed` - "Remove dev-suite components (user content preserved)"
2. `Cancel` - "Don't remove anything"

---

## Step 5: Execute Removal

### Removal Script (With Manifest)

```bash
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TARGET_PATH="${1:-.}"
TARGET_PATH="$(cd "$TARGET_PATH" 2>/dev/null && pwd)"
MANIFEST_PATH="$TARGET_PATH/.dev-suite-manifest.json"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            ${BOLD}Uninstall Dev-Suite${NC}${CYAN}                              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Target: ${BOLD}$TARGET_PATH${NC}"
echo ""

# Track results
declare -a REMOVED_FILES
declare -a REMOVED_DIRS
declare -a PRESERVED
declare -a ERRORS

# --- STEP 1: Remove tracked files from manifest ---
if [ -f "$MANIFEST_PATH" ]; then
    echo -e "${BOLD}Removing tracked files...${NC}"

    # Parse files from manifest using grep/sed (portable)
    FILES=$(cat "$MANIFEST_PATH" | grep -oP '"files"\s*:\s*\[\K[^\]]*' | tr ',' '\n' | grep -oP '"\K[^"]+')

    for file in $FILES; do
        filepath="$TARGET_PATH/$file"
        if [ -f "$filepath" ]; then
            rm -f "$filepath"
            REMOVED_FILES+=("$file")
            echo -e "  ${RED}✗${NC} $file"
        fi
    done

    # --- STEP 2: Handle .mcp.json - remove only dev-suite servers ---
    MCP_JSON="$TARGET_PATH/.mcp.json"
    if [ -f "$MCP_JSON" ]; then
        echo ""
        echo -e "${BOLD}Cleaning .mcp.json...${NC}"

        # Get dev-suite servers from manifest
        MCP_SERVERS=$(cat "$MANIFEST_PATH" | grep -oP '"mcpServers"\s*:\s*\[\K[^\]]*' | tr ',' '\n' | grep -oP '"\K[^"]+')

        # Create temp file for modification
        TEMP_MCP=$(mktemp)
        cp "$MCP_JSON" "$TEMP_MCP"

        for server in $MCP_SERVERS; do
            # Remove server entry using jq if available, otherwise note for manual cleanup
            if command -v jq &> /dev/null; then
                jq "del(.mcpServers.\"$server\")" "$TEMP_MCP" > "$TEMP_MCP.new" && mv "$TEMP_MCP.new" "$TEMP_MCP"
                echo -e "  ${RED}✗${NC} Removed server: $server"
            else
                echo -e "  ${YELLOW}⚠${NC} jq not available, please manually remove: $server"
            fi
        done

        if command -v jq &> /dev/null; then
            # Check if any servers remain
            REMAINING=$(jq '.mcpServers | length' "$TEMP_MCP" 2>/dev/null || echo "0")
            if [ "$REMAINING" = "0" ] || [ "$REMAINING" = "null" ]; then
                rm -f "$MCP_JSON"
                REMOVED_FILES+=(".mcp.json")
                echo -e "  ${RED}✗${NC} Removed .mcp.json (no servers remaining)"
            else
                mv "$TEMP_MCP" "$MCP_JSON"
                PRESERVED+=(".mcp.json ($REMAINING user servers)")
                echo -e "  ${GREEN}✓${NC} Preserved .mcp.json ($REMAINING user servers)"
            fi
        fi
        rm -f "$TEMP_MCP" "$TEMP_MCP.new" 2>/dev/null
    fi

    # --- STEP 3: Remove dev-suite MCP server directories ---
    MCP_SERVERS_DIR="$TARGET_PATH/.mcp-servers"
    if [ -d "$MCP_SERVERS_DIR" ]; then
        echo ""
        echo -e "${BOLD}Removing MCP server directories...${NC}"

        MCP_SERVERS=$(cat "$MANIFEST_PATH" | grep -oP '"mcpServers"\s*:\s*\[\K[^\]]*' | tr ',' '\n' | grep -oP '"\K[^"]+')

        for server in $MCP_SERVERS; do
            serverdir="$MCP_SERVERS_DIR/$server"
            if [ -d "$serverdir" ]; then
                rm -rf "$serverdir"
                REMOVED_DIRS+=(".mcp-servers/$server")
                echo -e "  ${RED}✗${NC} .mcp-servers/$server"
            fi
        done

        # Remove .mcp-servers only if empty
        if [ -d "$MCP_SERVERS_DIR" ]; then
            remaining=$(ls -1 "$MCP_SERVERS_DIR" 2>/dev/null | wc -l)
            if [ "$remaining" -eq 0 ]; then
                rmdir "$MCP_SERVERS_DIR"
                REMOVED_DIRS+=(".mcp-servers")
                echo -e "  ${RED}✗${NC} .mcp-servers/ (empty)"
            else
                PRESERVED+=(".mcp-servers/ ($remaining user servers)")
                echo -e "  ${GREEN}✓${NC} Preserved .mcp-servers/ ($remaining user servers)"
            fi
        fi
    fi
fi

# --- STEP 4: Remove dev-suite config files (always safe) ---
echo ""
echo -e "${BOLD}Removing config files...${NC}"

for config in ".dev-suite-manifest.json" ".dev-suite.json"; do
    filepath="$TARGET_PATH/$config"
    if [ -f "$filepath" ]; then
        rm -f "$filepath"
        REMOVED_FILES+=("$config")
        echo -e "  ${RED}✗${NC} $config"
    fi
done

# --- STEP 5: Remove .kb-cache (always safe - just cache) ---
KB_CACHE="$TARGET_PATH/.kb-cache"
if [ -d "$KB_CACHE" ]; then
    rm -rf "$KB_CACHE"
    REMOVED_DIRS+=(".kb-cache")
    echo -e "  ${RED}✗${NC} .kb-cache/"
fi

# --- STEP 6: Clean CLAUDE.md (remove only dev-suite section) ---
CLAUDE_MD="$TARGET_PATH/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
    echo ""
    echo -e "${BOLD}Cleaning CLAUDE.md...${NC}"

    START_MARKER="<!-- DEV-SUITE-CONFIG-START -->"
    END_MARKER="<!-- DEV-SUITE-CONFIG-END -->"

    if grep -q "$START_MARKER" "$CLAUDE_MD"; then
        # Remove section between markers (inclusive)
        sed -i "/$START_MARKER/,/$END_MARKER/d" "$CLAUDE_MD"

        # Remove trailing empty lines
        sed -i -e :a -e '/^\s*$/d;N;ba' "$CLAUDE_MD" 2>/dev/null || true

        # Check if file is now empty
        if [ ! -s "$CLAUDE_MD" ]; then
            rm -f "$CLAUDE_MD"
            REMOVED_FILES+=("CLAUDE.md (was only dev-suite section)")
            echo -e "  ${RED}✗${NC} CLAUDE.md (was only dev-suite section)"
        else
            echo -e "  ${GREEN}✓${NC} Cleaned dev-suite section from CLAUDE.md"
            PRESERVED+=("CLAUDE.md (user content)")
        fi
    else
        echo -e "  ${DIM}No dev-suite section found in CLAUDE.md${NC}"
        PRESERVED+=("CLAUDE.md (no dev-suite section)")
    fi
fi

# --- STEP 7: Clean up empty .claude directories ---
echo ""
echo -e "${BOLD}Cleaning empty directories...${NC}"

for subdir in "commands" "skills" "agents"; do
    dirpath="$TARGET_PATH/.claude/$subdir"
    if [ -d "$dirpath" ]; then
        remaining=$(ls -1 "$dirpath" 2>/dev/null | wc -l)
        if [ "$remaining" -eq 0 ]; then
            rmdir "$dirpath"
            REMOVED_DIRS+=(".claude/$subdir")
            echo -e "  ${RED}✗${NC} .claude/$subdir/ (empty)"
        else
            PRESERVED+=(".claude/$subdir/ ($remaining user files)")
            echo -e "  ${GREEN}✓${NC} Preserved .claude/$subdir/ ($remaining user files)"
        fi
    fi
done

# Check if .claude itself is empty (except settings)
CLAUDE_DIR="$TARGET_PATH/.claude"
if [ -d "$CLAUDE_DIR" ]; then
    remaining=$(ls -1 "$CLAUDE_DIR" 2>/dev/null | grep -v "settings" | wc -l)
    if [ "$remaining" -eq 0 ]; then
        echo -e "  ${DIM}.claude/ contains only settings files, preserved${NC}"
    fi
fi

# --- SUMMARY ---
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Uninstall Complete                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ${#REMOVED_FILES[@]} -gt 0 ] || [ ${#REMOVED_DIRS[@]} -gt 0 ]; then
    echo -e "${BOLD}Removed:${NC}"
    for item in "${REMOVED_FILES[@]}"; do
        echo -e "  ${RED}✗${NC} $item"
    done
    for item in "${REMOVED_DIRS[@]}"; do
        echo -e "  ${RED}✗${NC} $item/"
    done
else
    echo -e "  ${DIM}Nothing to remove${NC}"
fi

if [ ${#PRESERVED[@]} -gt 0 ]; then
    echo ""
    echo -e "${BOLD}Preserved (user content):${NC}"
    for item in "${PRESERVED[@]}"; do
        echo -e "  ${GREEN}✓${NC} $item"
    done
fi

echo ""
echo -e "${DIM}To reinstall dev-suite, run: /init-project${NC}"
```

---

## Usage Examples

```bash
# From project root
/uninstall-dev-suite

# For a specific project
/uninstall-dev-suite ./my-project
```

## Comparison: With vs Without Manifest

| Scenario | Behavior |
|----------|----------|
| Has manifest | Removes exactly what was installed, preserves user content |
| No manifest | Minimal cleanup only, all potentially user content preserved |

## Technical Notes

- Manifest location: `.dev-suite-manifest.json`
- CLAUDE.md markers: `<!-- DEV-SUITE-CONFIG-START -->` and `<!-- DEV-SUITE-CONFIG-END -->`
- Uses `jq` for .mcp.json manipulation if available
- Empty directories are removed after their contents
