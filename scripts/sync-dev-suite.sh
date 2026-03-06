#!/bin/bash

# Don't exit on non-critical errors (grep no match, etc.)
set +e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ============================================
# DETERMINE PROJECT ROOT
# ============================================

# Find the project root (where dev-suite exists as a subfolder)
if [ -d "./dev-suite" ]; then
    PROJECT_ROOT="$(pwd)"
elif [ "$(basename "$(pwd)")" = "dev-suite" ] && [ -d "../.claude" ]; then
    PROJECT_ROOT="$(cd .. && pwd)"
else
    # Search upward through the hierarchy
    PROJECT_ROOT="$(pwd)"
    while [ ! -d "$PROJECT_ROOT/dev-suite" ] && [ "$PROJECT_ROOT" != "/" ]; do
        PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
    done
fi

if [ ! -d "$PROJECT_ROOT/dev-suite" ]; then
    echo -e "${RED}Error: unable to determine the project root${NC}"
    echo "Make sure to run the command from the project directory or from dev-suite"
    exit 1
fi

# Absolute paths based on PROJECT_ROOT
DEV_SUITE_DIR="$PROJECT_ROOT/dev-suite"
CLAUDE_DIR="$PROJECT_ROOT/.claude"
AGENTS_TARGET="$CLAUDE_DIR/agents"
SKILLS_TARGET="$CLAUDE_DIR/skills"
COMMANDS_TARGET="$CLAUDE_DIR/commands"
MCP_TARGET="$PROJECT_ROOT/.mcp-servers"
CONFIG_FILE="$PROJECT_ROOT/.dev-suite.json"

# Tracking arrays
AGENTS_UPDATED=()
AGENTS_NEW=()
AGENTS_UNCHANGED=()
AGENTS_CUSTOM=()

SKILLS_UPDATED=()
SKILLS_NEW=()
SKILLS_UNCHANGED=()

COMMANDS_UPDATED=()
COMMANDS_NEW=()
COMMANDS_UNCHANGED=()

MCP_REBUILT=()
MCP_OK=()

KB_UPDATED=()
KB_NEW=()
KB_UNCHANGED=()

INTEGRITY_ERRORS=()

# ============================================
# VALIDATION
# ============================================

if [ ! -d "$DEV_SUITE_DIR/agents" ]; then
    echo -e "${RED}Error: dev-suite not found in $DEV_SUITE_DIR${NC}"
    echo "Clone the dev-suite repository into the project root."
    exit 1
fi

if [ ! -d "$AGENTS_TARGET" ]; then
    echo -e "${RED}Error: $AGENTS_TARGET not found${NC}"
    echo "Run /init-project first to initialize the project."
    exit 1
fi

# ============================================
# HEADER
# ============================================

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            ${BOLD}Sync Dev-Suite - Full Synchronization${NC}${CYAN}            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}Project root: $PROJECT_ROOT${NC}"
echo ""

# ============================================
# STEP 0: PRE-FLIGHT HEALTH CHECK
# ============================================

echo -e "${CYAN}[0/9] Pre-flight health check...${NC}"

# Run quick health check (skip MCP startup tests for speed)
HEALTH_CHECK_SCRIPT="$DEV_SUITE_DIR/scripts/health-check.sh"
if [ -f "$HEALTH_CHECK_SCRIPT" ]; then
    # Run health check in quick mode, capture exit code
    set +e
    bash "$HEALTH_CHECK_SCRIPT" --quick 2>&1 | while IFS= read -r line; do
        echo -e "  ${DIM}$line${NC}"
    done
    HEALTH_EXIT=${PIPESTATUS[0]}
    set -e

    if [ "$HEALTH_EXIT" -eq 1 ]; then
        echo ""
        echo -e "${RED}Health check failed with critical errors.${NC}"
        echo -e "${YELLOW}Run '/health-check --verbose' for details.${NC}"
        echo -e "${YELLOW}Fix issues before syncing.${NC}"
        exit 1
    elif [ "$HEALTH_EXIT" -eq 2 ]; then
        echo -e "  ${YELLOW}⚠${NC} Health check passed with warnings"
    else
        echo -e "  ${GREEN}✓${NC} Health check passed"
    fi
else
    echo -e "  ${DIM}Health check script not found, skipping${NC}"
fi
echo ""

# ============================================
# STEP 1: GIT UPDATE
# ============================================

echo -e "${CYAN}[1/9] Updating dev-suite from git...${NC}"

BEFORE_COMMIT=$(git -C "$DEV_SUITE_DIR" rev-parse HEAD 2>/dev/null)

# Get current branch name
CURRENT_BRANCH=$(git -C "$DEV_SUITE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo -e "  ${DIM}Branch: $CURRENT_BRANCH${NC}"

# Reset any local changes (dev-suite should always match remote)
# This handles CRLF/LF issues on Windows and any accidental modifications
HAS_CHANGES=$(git -C "$DEV_SUITE_DIR" status --porcelain 2>/dev/null)
if [ -n "$HAS_CHANGES" ]; then
    echo -e "  ${YELLOW}⚠${NC} Local changes detected, resetting..."
    git -C "$DEV_SUITE_DIR" reset --hard HEAD 2>/dev/null
fi

git -C "$DEV_SUITE_DIR" fetch origin 2>/dev/null
git -C "$DEV_SUITE_DIR" pull origin "$CURRENT_BRANCH" 2>&1 | grep -v "Already up to date" || true
AFTER_COMMIT=$(git -C "$DEV_SUITE_DIR" rev-parse HEAD 2>/dev/null)

if [ "$BEFORE_COMMIT" != "$AFTER_COMMIT" ]; then
    echo -e "  ${GREEN}✓${NC} Dev-suite updated"
    echo -e "  ${DIM}New commits:${NC}"
    git -C "$DEV_SUITE_DIR" log --oneline "$BEFORE_COMMIT".."$AFTER_COMMIT" 2>/dev/null | head -5 | while read line; do
        echo -e "    ${GREEN}+${NC} $line"
    done
else
    echo -e "  ${GREEN}✓${NC} Dev-suite already up to date"
fi
echo ""

# ============================================
# STEP 2: ANALYZE DEPENDENCIES
# ============================================

echo -e "${CYAN}[2/9] Analyzing dependencies...${NC}"

# Collect all skills referenced by agents (from SOURCE, not target)
# Use regular arrays instead of associative arrays for better compatibility
REQUIRED_SKILLS_LIST=()
REQUIRED_MCP_LIST=()

# First, get list of agents to sync (from target + enabled in config)
AGENTS_TO_SYNC=()

# Add all agents currently in target (ONLY existing agents, never add new ones)
# sync-dev-suite should only UPDATE existing agents, not ADD new ones
# Use /init-project or /reconfigure to add/remove agents
for agent_file in "$AGENTS_TARGET"/*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file" .md)
    AGENTS_TO_SYNC+=("$agent_name")
done

echo -e "  Agents to sync: ${#AGENTS_TO_SYNC[@]}"

# For each agent, analyze dependencies from SOURCE
for agent_name in "${AGENTS_TO_SYNC[@]}"; do
    # Find source file
    source_file=$(find "$DEV_SUITE_DIR/agents" -name "${agent_name}.md" -type f 2>/dev/null | head -1)

    if [ -n "$source_file" ] && [ -f "$source_file" ]; then
        # Extract skills from YAML frontmatter (improved parsing)
        # Read between first two --- lines, find skills section, extract paths
        # Use tr -d '\r' to handle Windows CRLF line endings
        while IFS= read -r skill; do
            skill=$(echo "$skill" | tr -d '\r')  # Remove Windows carriage return
            [ -n "$skill" ] && REQUIRED_SKILLS_LIST+=("$skill")
        done < <(awk '/^---$/{p++} p==1 && /^skills:/{found=1; next} p==1 && found && /^[^ ]/{found=0} p==1 && found && /^  - /{gsub(/^  - /,""); print}' "$source_file" 2>/dev/null | tr -d '\r')

        # Extract MCP tools
        while IFS= read -r mcp; do
            if [ -n "$mcp" ]; then
                server_name=$(echo "$mcp" | sed 's/mcp__\([^_]*\).*/\1/')
                REQUIRED_MCP_LIST+=("$server_name")
            fi
        done < <(grep "allowed-tools:" "$source_file" 2>/dev/null | grep -oE "mcp__[a-zA-Z0-9_-]+" || true)
    fi
done

# Deduplicate arrays
REQUIRED_SKILLS=($(printf '%s\n' "${REQUIRED_SKILLS_LIST[@]}" | sort -u))
REQUIRED_MCP=($(printf '%s\n' "${REQUIRED_MCP_LIST[@]}" | sort -u))

echo -e "  Required skills: ${#REQUIRED_SKILLS[@]}"
echo -e "  Required MCP servers: ${#REQUIRED_MCP[@]}"
echo ""

# ============================================
# STEP 3: SYNC AGENTS
# ============================================

echo -e "${CYAN}[3/9] Syncing agents...${NC}"

for agent_name in "${AGENTS_TO_SYNC[@]}"; do
    agent_file="${agent_name}.md"
    target_file="$AGENTS_TARGET/$agent_file"

    # Find source file in dev-suite (check all subfolders)
    source_file=$(find "$DEV_SUITE_DIR/agents" -name "$agent_file" -type f 2>/dev/null | head -1)

    if [ -z "$source_file" ]; then
        # Custom agent (not in dev-suite)
        AGENTS_CUSTOM+=("$agent_file")
        continue
    fi

    if [ ! -f "$target_file" ]; then
        # New agent
        cp "$source_file" "$target_file"
        AGENTS_NEW+=("$agent_file")
    elif ! diff -q "$source_file" "$target_file" > /dev/null 2>&1; then
        # Updated
        cp "$source_file" "$target_file"
        AGENTS_UPDATED+=("$agent_file")
    else
        AGENTS_UNCHANGED+=("$agent_file")
    fi
done

echo -e "  ${GREEN}+${NC} New: ${#AGENTS_NEW[@]}"
echo -e "  ${YELLOW}↻${NC} Updated: ${#AGENTS_UPDATED[@]}"
echo -e "  ${DIM}-${NC} Unchanged: ${#AGENTS_UNCHANGED[@]}"
echo -e "  ${CYAN}★${NC} Custom: ${#AGENTS_CUSTOM[@]}"
echo ""

# ============================================
# STEP 4: SYNC SKILLS (Dependency-Aware)
# ============================================

echo -e "${CYAN}[4/9] Syncing skills (dependency-aware)...${NC}"

for skill in "${REQUIRED_SKILLS[@]}"; do
    source_dir="$DEV_SUITE_DIR/skills/$skill"
    target_dir="$SKILLS_TARGET/$skill"

    if [ ! -d "$source_dir" ]; then
        INTEGRITY_ERRORS+=("Missing skill in source: $skill")
        continue
    fi

    # Create target directory if needed
    mkdir -p "$target_dir"

    # Sync SKILL.md
    source_file="$source_dir/SKILL.md"
    target_file="$target_dir/SKILL.md"

    if [ ! -f "$source_file" ]; then
        continue
    fi

    if [ ! -f "$target_file" ]; then
        cp "$source_file" "$target_file"
        SKILLS_NEW+=("$skill")
    elif ! diff -q "$source_file" "$target_file" > /dev/null 2>&1; then
        cp "$source_file" "$target_file"
        SKILLS_UPDATED+=("$skill")
    else
        SKILLS_UNCHANGED+=("$skill")
    fi
done

echo -e "  ${GREEN}+${NC} New: ${#SKILLS_NEW[@]}"
echo -e "  ${YELLOW}↻${NC} Updated: ${#SKILLS_UPDATED[@]}"
echo -e "  ${DIM}-${NC} Unchanged: ${#SKILLS_UNCHANGED[@]}"
echo ""

# ============================================
# STEP 5: SYNC COMMANDS
# ============================================

echo -e "${CYAN}[5/9] Syncing commands...${NC}"

mkdir -p "$COMMANDS_TARGET"

for cmd_file in "$DEV_SUITE_DIR/commands"/*.md; do
    [ -f "$cmd_file" ] || continue
    cmd_name=$(basename "$cmd_file")
    target_file="$COMMANDS_TARGET/$cmd_name"

    if [ ! -f "$target_file" ]; then
        cp "$cmd_file" "$target_file"
        COMMANDS_NEW+=("$cmd_name")
    elif ! diff -q "$cmd_file" "$target_file" > /dev/null 2>&1; then
        cp "$cmd_file" "$target_file"
        COMMANDS_UPDATED+=("$cmd_name")
    else
        COMMANDS_UNCHANGED+=("$cmd_name")
    fi
done

echo -e "  ${GREEN}+${NC} New: ${#COMMANDS_NEW[@]}"
echo -e "  ${YELLOW}↻${NC} Updated: ${#COMMANDS_UPDATED[@]}"
echo -e "  ${DIM}-${NC} Unchanged: ${#COMMANDS_UNCHANGED[@]}"
echo ""

# ============================================
# STEP 6: SYNC KNOWLEDGE BASES
# ============================================

echo -e "${CYAN}[6/9] Syncing knowledge bases...${NC}"

KB_NEEDS_REBUILD=false

# Sync knowledge bases for documentation MCP server
SOURCE_KB="$DEV_SUITE_DIR/mcp-servers/documentation/knowledge"
TARGET_KB="$MCP_TARGET/documentation/knowledge"

if [ -d "$SOURCE_KB" ]; then
    # Find all .md files recursively
    while IFS= read -r source_file; do
        rel_path="${source_file#$SOURCE_KB/}"
        target_file="$TARGET_KB/$rel_path"
        target_dir=$(dirname "$target_file")

        mkdir -p "$target_dir"

        if [ ! -f "$target_file" ]; then
            cp "$source_file" "$target_file"
            KB_NEW+=("$rel_path")
            KB_NEEDS_REBUILD=true
        elif ! diff -q "$source_file" "$target_file" > /dev/null 2>&1; then
            cp "$source_file" "$target_file"
            KB_UPDATED+=("$rel_path")
            KB_NEEDS_REBUILD=true
        else
            KB_UNCHANGED+=("$rel_path")
        fi
    done < <(find "$SOURCE_KB" -name "*.md" -type f 2>/dev/null)

    # Also sync docs-index.ts if changed
    SOURCE_INDEX="$DEV_SUITE_DIR/mcp-servers/documentation/src/docs-index.ts"
    TARGET_INDEX="$MCP_TARGET/documentation/src/docs-index.ts"

    if [ -f "$SOURCE_INDEX" ]; then
        if [ ! -f "$TARGET_INDEX" ] || ! diff -q "$SOURCE_INDEX" "$TARGET_INDEX" > /dev/null 2>&1; then
            mkdir -p "$(dirname "$TARGET_INDEX")"
            cp "$SOURCE_INDEX" "$TARGET_INDEX"
            KB_NEEDS_REBUILD=true
            echo -e "  ${YELLOW}↻${NC} docs-index.ts updated"
        fi
    fi
fi

echo -e "  ${GREEN}+${NC} New: ${#KB_NEW[@]}"
echo -e "  ${YELLOW}↻${NC} Updated: ${#KB_UPDATED[@]}"
echo -e "  ${DIM}-${NC} Unchanged: ${#KB_UNCHANGED[@]}"
echo ""

# ============================================
# STEP 7: VERIFY/REBUILD MCP SERVERS
# ============================================

echo -e "${CYAN}[7/9] Verifying MCP servers...${NC}"

# Read MCP servers from .mcp.json (not from agent dependencies)
# This ensures all CONFIGURED servers are synced, regardless of agent usage
MCP_JSON="$PROJECT_ROOT/.mcp.json"
CONFIGURED_MCP=()

if [ -f "$MCP_JSON" ]; then
    # Extract server names from paths in .mcp.json
    # Looks for patterns like ".mcp-servers/server-name/" or "mcp-servers/server-name/"
    while IFS= read -r server_name; do
        [ -n "$server_name" ] && CONFIGURED_MCP+=("$server_name")
    done < <(grep -oE '\.?mcp-servers/[^/]+' "$MCP_JSON" 2>/dev/null | sed 's|\.mcp-servers/||;s|mcp-servers/||;s|".*||' | sort -u)
fi

# Also add servers required by agents (for completeness)
for mcp in "${REQUIRED_MCP[@]}"; do
    if [[ ! " ${CONFIGURED_MCP[*]} " =~ " ${mcp} " ]]; then
        CONFIGURED_MCP+=("$mcp")
    fi
done

echo -e "  ${DIM}Configured servers: ${CONFIGURED_MCP[*]:-none}${NC}"

# Check if workspaces are used (npm 7+ monorepo structure)
MCP_SERVERS_ROOT="$DEV_SUITE_DIR/mcp-servers"
USES_WORKSPACES=false
if [ -f "$MCP_SERVERS_ROOT/package.json" ] && grep -q '"workspaces"' "$MCP_SERVERS_ROOT/package.json" 2>/dev/null; then
    USES_WORKSPACES=true
    echo -e "  ${DIM}Mode: npm workspaces${NC}"
fi

# Track servers that need rebuild
SERVERS_TO_REBUILD=()

for server_name in "${CONFIGURED_MCP[@]}"; do
    source_dir="$DEV_SUITE_DIR/mcp-servers/$server_name"
    target_dir="$MCP_TARGET/$server_name"

    if [ ! -d "$source_dir" ]; then
        echo -e "  ${DIM}⊘${NC} $server_name (not in dev-suite, skip)"
        continue
    fi

    needs_rebuild=false
    rebuild_reason=""

    # Check if target exists
    if [ ! -d "$target_dir" ] || [ ! -f "$target_dir/dist/index.js" ]; then
        needs_rebuild=true
        rebuild_reason="not present"
    else
        # Check if source code changed (compare src/ timestamps)
        source_src_time=$(find "$source_dir/src" -name "*.ts" -type f -exec stat -c %Y {} \; 2>/dev/null | sort -rn | head -1 || echo "0")
        target_src_time=$(find "$target_dir/src" -name "*.ts" -type f -exec stat -c %Y {} \; 2>/dev/null | sort -rn | head -1 || echo "0")

        if [ "$source_src_time" -gt "$target_src_time" ] 2>/dev/null; then
            needs_rebuild=true
            rebuild_reason="source updated"
        fi

        # Check if package.json changed (new dependencies)
        if [ -f "$source_dir/package.json" ] && [ -f "$target_dir/package.json" ]; then
            if ! diff -q "$source_dir/package.json" "$target_dir/package.json" > /dev/null 2>&1; then
                needs_rebuild=true
                rebuild_reason="dependencies updated"
            fi
        fi
    fi

    # For documentation server, also check if knowledge base changed
    if [ "$server_name" = "documentation" ] && [ "$KB_NEEDS_REBUILD" = true ]; then
        needs_rebuild=true
        rebuild_reason="knowledge base updated"
    fi

    if [ "$needs_rebuild" = true ]; then
        SERVERS_TO_REBUILD+=("$server_name:$rebuild_reason")
    else
        MCP_OK+=("$server_name")
    fi
done

# Build servers that need rebuilding
if [ ${#SERVERS_TO_REBUILD[@]} -gt 0 ]; then
    if [ "$USES_WORKSPACES" = true ]; then
        # With workspaces: install once from root, then build each server
        echo -e "  ${YELLOW}⟳${NC} Installing workspace dependencies..."
        (cd "$MCP_SERVERS_ROOT" && npm install --silent 2>/dev/null)

        for entry in "${SERVERS_TO_REBUILD[@]}"; do
            server_name="${entry%%:*}"
            rebuild_reason="${entry#*:}"
            source_dir="$DEV_SUITE_DIR/mcp-servers/$server_name"
            target_dir="$MCP_TARGET/$server_name"

            echo -e "  ${YELLOW}⟳${NC} Building $server_name... ($rebuild_reason)"

            # Build using workspace command
            (cd "$MCP_SERVERS_ROOT" && npm run build -w "$server_name" --silent 2>/dev/null)

            # Copy to target (excluding node_modules which has symlinks in workspaces)
            rm -rf "$target_dir"
            mkdir -p "$target_dir"

            # Copy everything except node_modules
            for item in "$source_dir"/*; do
                item_name=$(basename "$item")
                if [ "$item_name" != "node_modules" ]; then
                    cp -r "$item" "$target_dir/" 2>/dev/null || true
                fi
            done

            # Copy hidden files
            for item in "$source_dir"/.*; do
                item_name=$(basename "$item")
                if [ "$item_name" != "." ] && [ "$item_name" != ".." ]; then
                    cp -r "$item" "$target_dir/" 2>/dev/null || true
                fi
            done

            # Install dependencies in target
            if [ -f "$target_dir/package.json" ]; then
                (cd "$target_dir" && npm install --silent 2>/dev/null)
            fi

            if [ -f "$target_dir/dist/index.js" ]; then
                MCP_REBUILT+=("$server_name")
            else
                INTEGRITY_ERRORS+=("MCP build failed: $server_name")
            fi
        done
    else
        # Without workspaces: build each server individually (legacy mode)
        for entry in "${SERVERS_TO_REBUILD[@]}"; do
            server_name="${entry%%:*}"
            rebuild_reason="${entry#*:}"
            source_dir="$DEV_SUITE_DIR/mcp-servers/$server_name"
            target_dir="$MCP_TARGET/$server_name"

            echo -e "  ${YELLOW}⟳${NC} Rebuilding $server_name... ($rebuild_reason)"

            # Build source first (using subshell to avoid changing directory)
            (cd "$source_dir" && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null)

            # Copy to target
            rm -rf "$target_dir"
            cp -r "$source_dir" "$target_dir"

            if [ -f "$target_dir/dist/index.js" ]; then
                MCP_REBUILT+=("$server_name")
            else
                INTEGRITY_ERRORS+=("MCP build failed: $server_name")
            fi
        done
    fi
fi

echo -e "  ${GREEN}✓${NC} OK: ${#MCP_OK[@]}"
echo -e "  ${YELLOW}↻${NC} Rebuilt: ${#MCP_REBUILT[@]}"
echo ""

# ============================================
# STEP 7b: UPDATE .mcp.json (remove obsolete env placeholders)
# ============================================

# Servers that use dotenv don't need env vars in .mcp.json
# Remove ${VAR_NAME} placeholders that Claude Code can't expand
MCP_JSON_UPDATED=false

if [ -f "$MCP_JSON" ]; then
    for server_name in "${CONFIGURED_MCP[@]}"; do
        source_dir="$DEV_SUITE_DIR/mcp-servers/$server_name"
        target_dir="$MCP_TARGET/$server_name"

        # Check if server uses dotenv (loads .env automatically)
        # Check both source and target package.json
        uses_dotenv=false
        if [ -f "$source_dir/package.json" ] && grep -q '"dotenv"' "$source_dir/package.json" 2>/dev/null; then
            uses_dotenv=true
        elif [ -f "$target_dir/package.json" ] && grep -q '"dotenv"' "$target_dir/package.json" 2>/dev/null; then
            uses_dotenv=true
        fi

        if [ "$uses_dotenv" = true ]; then
            # Check if .mcp.json has placeholder env vars for this server
            # Pattern: "${VAR_NAME}" - these don't work and should be removed
            if grep -q "\"$server_name\"" "$MCP_JSON" && grep -A20 "\"$server_name\"" "$MCP_JSON" | grep -q '\${[A-Z_]*}'; then
                echo -e "  ${YELLOW}⚙${NC} $server_name uses dotenv - cleaning .mcp.json..."

                # Create backup
                cp "$MCP_JSON" "$MCP_JSON.backup"

                # Remove env vars with ${} placeholders for this server
                # This is a simplified approach - removes the entire env block if it only contains placeholders
                # More sophisticated: use jq if available
                if command -v jq &> /dev/null; then
                    # Use jq to clean env vars with ${} placeholders
                    jq --arg srv "$server_name" '
                        .mcpServers[$srv].env |= with_entries(
                            select(.value | test("^\\$\\{") | not)
                        )
                    ' "$MCP_JSON" > "$MCP_JSON.tmp" && mv "$MCP_JSON.tmp" "$MCP_JSON"
                    MCP_JSON_UPDATED=true
                    echo -e "    ${GREEN}✓${NC} Removed \${...} placeholders from $server_name"
                else
                    # Fallback: use sed to remove lines with ${} placeholders
                    # This is less precise but works without jq
                    # Remove lines like: "VAR_NAME": "${VAR_NAME}"
                    # SECURITY: escape sed special characters in server_name before interpolation
                    server_name_escaped=$(printf '%s\n' "$server_name" | sed 's/[[\.*^$()+?{|]/\\&/g')
                    sed -i.bak '/"'"$server_name_escaped"'":/,/^[[:space:]]*}/ {
                        /"\${[A-Z_]*}"/d
                    }' "$MCP_JSON"
                    # Clean up trailing commas that might break JSON
                    sed -i 's/,\([[:space:]]*\)}/\1}/g' "$MCP_JSON"
                    MCP_JSON_UPDATED=true
                    echo -e "    ${GREEN}✓${NC} Removed \${...} placeholders from $server_name (via sed)"
                fi
            fi
        fi
    done
fi

if [ "$MCP_JSON_UPDATED" = true ]; then
    echo -e "  ${GREEN}✓${NC} .mcp.json updated"
fi

# ============================================
# STEP 8: INTEGRITY CHECK
# ============================================

echo -e "${CYAN}[8/9] Verifying integrity...${NC}"

# Check each agent has all its skills
for agent_file in "$AGENTS_TARGET"/*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file" .md)

    # Extract skills from agent
    skills=$(awk '/^---$/,/^---$/' "$agent_file" | grep -A100 "^skills:" | grep "^\s*-" | sed 's/.*- //' | tr -d ' ')

    for skill in $skills; do
        if [ ! -f "$SKILLS_TARGET/$skill/SKILL.md" ]; then
            INTEGRITY_ERRORS+=("Agent '$agent_name' requires missing skill: $skill")
        fi
    done

    # Check MCP tools
    mcp_tools=$(grep "allowed-tools:" "$agent_file" | grep -oE "mcp__[a-zA-Z0-9_-]+" | sort -u)
    for mcp in $mcp_tools; do
        server_name=$(echo "$mcp" | sed 's/mcp__\([^_]*\).*/\1/')
        if [ ! -f "$MCP_TARGET/$server_name/dist/index.js" ]; then
            INTEGRITY_ERRORS+=("Agent '$agent_name' requires missing MCP server: $server_name")
        fi
    done
done

if [ ${#INTEGRITY_ERRORS[@]} -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All dependencies satisfied"
else
    echo -e "  ${RED}✗${NC} Issues detected:"
    for err in "${INTEGRITY_ERRORS[@]}"; do
        echo -e "    ${RED}!${NC} $err"
    done
fi
echo ""

# ============================================
# STEP 9: Analyze Sibling Projects CLAUDE.md
# ============================================
# Search for CLAUDE.md files in sibling project folders
# and suggest updates based on synced changes

echo -e "${YELLOW}[9/9] Analyzing sibling projects CLAUDE.md...${NC}"

# Find parent directory (where sibling projects are)
PARENT_DIR="$(dirname "$PROJECT_ROOT")"
# DEV_SUITE_DIR is set at the top of this script; use it here
DEV_SUITE_NAME="$(basename "$DEV_SUITE_DIR")"

# Arrays for sibling analysis
declare -a SIBLING_CLAUDE_FILES=()
declare -a SIBLING_NEEDS_UPDATE=()

# Find CLAUDE.md files in sibling folders (excluding dev-suite)
while IFS= read -r -d '' claude_file; do
    # Skip files inside dev-suite folder
    if [[ "$claude_file" != *"/$DEV_SUITE_NAME/"* ]] && [[ "$claude_file" != "$DEV_SUITE_DIR/"* ]]; then
        SIBLING_CLAUDE_FILES+=("$claude_file")
    fi
done < <(find "$PARENT_DIR" -name "CLAUDE.md" -type f -print0 2>/dev/null)

# Analyze each CLAUDE.md if there are changes to report
if [ ${#SIBLING_CLAUDE_FILES[@]} -gt 0 ]; then
    # Build list of new/updated agents for reporting
    declare -a AGENT_CHANGES=()
    for agent in "${AGENTS_NEW[@]}"; do
        AGENT_CHANGES+=("NEW:$agent")
    done
    for agent in "${AGENTS_UPDATED[@]}"; do
        AGENT_CHANGES+=("UPDATED:$agent")
    done

    if [ ${#AGENT_CHANGES[@]} -gt 0 ]; then
        echo ""
        echo -e "${CYAN}Found ${#SIBLING_CLAUDE_FILES[@]} CLAUDE.md files in sibling projects:${NC}"
        for claude_file in "${SIBLING_CLAUDE_FILES[@]}"; do
            project_name="$(basename "$(dirname "$claude_file")")"
            echo -e "  ${DIM}• $project_name/CLAUDE.md${NC}"
            SIBLING_NEEDS_UPDATE+=("$claude_file")
        done

        echo ""
        echo -e "${YELLOW}⚠ Agent changes detected that may require CLAUDE.md updates:${NC}"
        for change in "${AGENT_CHANGES[@]}"; do
            change_type="${change%%:*}"
            agent_name="${change#*:}"
            if [ "$change_type" = "NEW" ]; then
                echo -e "  ${GREEN}+ $agent_name${NC} (new agent - may need routing configuration)"
            else
                echo -e "  ${YELLOW}↻ $agent_name${NC} (updated - verify routing still valid)"
            fi
        done

        echo ""
        echo -e "${CYAN}📋 Recommended actions for sibling projects:${NC}"
        echo -e "  1. Review each project's CLAUDE.md agent routing configuration"
        echo -e "  2. Add new agents to the routing table if applicable"
        echo -e "  3. Verify updated agents haven't changed their purpose/scope"
        echo ""
        echo -e "${DIM}Example: If messaging-expert was added, projects that handle"
        echo -e "events/messaging should update their CLAUDE.md to route to it.${NC}"
    else
        echo -e "  ${DIM}No agent changes requiring sibling project updates${NC}"
    fi
else
    echo -e "  ${DIM}No sibling project CLAUDE.md files found${NC}"
fi

# ============================================
# SUMMARY
# ============================================

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Sync Complete                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}Agents:${NC}"
[ ${#AGENTS_NEW[@]} -gt 0 ] && for f in "${AGENTS_NEW[@]}"; do echo -e "  ${GREEN}+ $f${NC}"; done
[ ${#AGENTS_UPDATED[@]} -gt 0 ] && for f in "${AGENTS_UPDATED[@]}"; do echo -e "  ${YELLOW}↻ $f${NC}"; done
[ ${#AGENTS_CUSTOM[@]} -gt 0 ] && for f in "${AGENTS_CUSTOM[@]}"; do echo -e "  ${CYAN}★ $f (custom)${NC}"; done

echo ""
echo -e "${BOLD}Skills:${NC}"
[ ${#SKILLS_NEW[@]} -gt 0 ] && for f in "${SKILLS_NEW[@]}"; do echo -e "  ${GREEN}+ $f${NC}"; done
[ ${#SKILLS_UPDATED[@]} -gt 0 ] && for f in "${SKILLS_UPDATED[@]}"; do echo -e "  ${YELLOW}↻ $f${NC}"; done

echo ""
echo -e "${BOLD}Commands:${NC}"
[ ${#COMMANDS_NEW[@]} -gt 0 ] && for f in "${COMMANDS_NEW[@]}"; do echo -e "  ${GREEN}+ $f${NC}"; done
[ ${#COMMANDS_UPDATED[@]} -gt 0 ] && for f in "${COMMANDS_UPDATED[@]}"; do echo -e "  ${YELLOW}↻ $f${NC}"; done

echo ""
echo -e "${BOLD}Knowledge Bases:${NC}"
[ ${#KB_NEW[@]} -gt 0 ] && for f in "${KB_NEW[@]}"; do echo -e "  ${GREEN}+ $f${NC}"; done
[ ${#KB_UPDATED[@]} -gt 0 ] && for f in "${KB_UPDATED[@]}"; do echo -e "  ${YELLOW}↻ $f${NC}"; done
[ ${#KB_NEW[@]} -eq 0 ] && [ ${#KB_UPDATED[@]} -eq 0 ] && echo -e "  ${DIM}No changes${NC}"

echo ""
echo -e "${BOLD}MCP Servers:${NC}"
[ ${#MCP_REBUILT[@]} -gt 0 ] && for f in "${MCP_REBUILT[@]}"; do echo -e "  ${YELLOW}↻ $f${NC}"; done
[ ${#MCP_OK[@]} -gt 0 ] && echo -e "  ${DIM}${#MCP_OK[@]} server OK${NC}"

echo ""

# Final counts
total_changes=$((${#AGENTS_NEW[@]} + ${#AGENTS_UPDATED[@]} + ${#SKILLS_NEW[@]} + ${#SKILLS_UPDATED[@]} + ${#COMMANDS_NEW[@]} + ${#COMMANDS_UPDATED[@]} + ${#KB_NEW[@]} + ${#KB_UPDATED[@]} + ${#MCP_REBUILT[@]}))

if [ $total_changes -eq 0 ]; then
    echo -e "${GREEN}No updates needed. Everything is in sync.${NC}"
else
    echo -e "${GREEN}Total: $total_changes components updated${NC}"
fi

if [ ${#INTEGRITY_ERRORS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠ ${#INTEGRITY_ERRORS[@]} integrity issues detected. Verify manually.${NC}"
fi

if [ ${#MCP_REBUILT[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠ MCP servers updated. Restart Claude Code to load them.${NC}"
fi

# Ensure clean exit code
exit 0
