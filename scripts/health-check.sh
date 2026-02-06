#!/bin/bash
# ================================================================
# dev-suite Health Check Script
# ================================================================
# Performs sanity checks on dev-suite installation:
# - npm/node version requirements
# - Workspace configuration
# - MCP server dependencies and builds
# - Schema validation
# - MCP server startup test
#
# Usage: ./scripts/health-check.sh [--quick] [--verbose]
#   --quick   Skip MCP server startup tests (faster)
#   --verbose Show detailed output
#
# Exit codes:
#   0 = All checks passed
#   1 = Critical errors (dev-suite won't work)
#   2 = Warnings (dev-suite may have issues)
# ================================================================

set -e

# Parse arguments
QUICK_MODE=false
VERBOSE=false
for arg in "$@"; do
    case $arg in
        --quick) QUICK_MODE=true ;;
        --verbose) VERBOSE=true ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASSED=0
WARNINGS=0
ERRORS=0

# Determine dev-suite directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_SUITE_DIR="$(dirname "$SCRIPT_DIR")"

# If running from a project, find dev-suite
if [ ! -d "$DEV_SUITE_DIR/mcp-servers" ]; then
    if [ -d "./dev-suite/mcp-servers" ]; then
        DEV_SUITE_DIR="$(pwd)/dev-suite"
    elif [ -d "../dev-suite/mcp-servers" ]; then
        DEV_SUITE_DIR="$(cd ../dev-suite && pwd)"
    fi
fi

# Helper functions
log_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

log_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

log_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$1${NC}"
    fi
}

# ============================================
# HEADER
# ============================================

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║            ${BOLD}Dev-Suite Health Check${NC}${CYAN}                            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}Dev-Suite: $DEV_SUITE_DIR${NC}"
echo ""

# ============================================
# CHECK 1: Node.js & npm versions
# ============================================

echo -e "${CYAN}[1/6] Checking Node.js & npm...${NC}"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | tr -d 'v')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        log_pass "Node.js v$NODE_VERSION (>= 18 required)"
    else
        log_warn "Node.js v$NODE_VERSION (v18+ recommended)"
    fi
else
    log_fail "Node.js not found"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)
    if [ "$NPM_MAJOR" -ge 7 ]; then
        log_pass "npm v$NPM_VERSION (>= 7 required for workspaces)"
    else
        log_fail "npm v$NPM_VERSION (v7+ required for workspaces)"
    fi
else
    log_fail "npm not found"
fi

echo ""

# ============================================
# CHECK 2: Dev-Suite Structure
# ============================================

echo -e "${CYAN}[2/6] Checking dev-suite structure...${NC}"

# Check essential directories
for dir in "mcp-servers" "agents" "skills" "commands" "scripts"; do
    if [ -d "$DEV_SUITE_DIR/$dir" ]; then
        log_pass "$dir/ directory exists"
    else
        log_fail "$dir/ directory missing"
    fi
done

# Check essential files
for file in "init-project.sh" "CLAUDE.md" "README.md"; do
    if [ -f "$DEV_SUITE_DIR/$file" ]; then
        log_pass "$file exists"
    else
        log_warn "$file missing"
    fi
done

echo ""

# ============================================
# CHECK 3: Workspace Configuration
# ============================================

echo -e "${CYAN}[3/6] Checking npm workspaces...${NC}"

MCP_ROOT="$DEV_SUITE_DIR/mcp-servers"

if [ -f "$MCP_ROOT/package.json" ]; then
    if grep -q '"workspaces"' "$MCP_ROOT/package.json" 2>/dev/null; then
        log_pass "Workspaces configured in mcp-servers/package.json"

        # Check root node_modules
        if [ -d "$MCP_ROOT/node_modules" ]; then
            log_pass "Root node_modules exists"

            # Check key dependencies
            if [ -d "$MCP_ROOT/node_modules/@modelcontextprotocol" ]; then
                log_pass "@modelcontextprotocol/sdk installed"
            else
                log_fail "@modelcontextprotocol/sdk not installed (run: cd mcp-servers && npm install)"
            fi

            if [ -d "$MCP_ROOT/node_modules/typescript" ]; then
                log_pass "typescript installed"
            else
                log_warn "typescript not installed"
            fi
        else
            log_fail "Root node_modules missing (run: cd mcp-servers && npm install)"
        fi
    else
        log_warn "Workspaces not configured (legacy mode)"
    fi
else
    log_warn "mcp-servers/package.json not found (legacy mode)"
fi

echo ""

# ============================================
# CHECK 4: MCP Server Builds
# ============================================

echo -e "${CYAN}[4/6] Checking MCP server builds...${NC}"

# Dynamically discover MCP servers (directories with package.json, excluding node_modules and shared)
MCP_SERVERS=()
for dir in "$MCP_ROOT"/*/; do
    server_name=$(basename "$dir")
    # Skip non-server directories
    if [[ "$server_name" == "node_modules" ]] || [[ "$server_name" == "shared" ]]; then
        continue
    fi
    # Only include if it has a package.json (is an actual server)
    if [ -f "$dir/package.json" ]; then
        MCP_SERVERS+=("$server_name")
    fi
done

log_info "Found ${#MCP_SERVERS[@]} MCP servers: ${MCP_SERVERS[*]}"

for server in "${MCP_SERVERS[@]}"; do
    SERVER_DIR="$MCP_ROOT/$server"

    if [ ! -d "$SERVER_DIR" ]; then
        log_warn "$server/ directory not found"
        continue
    fi

    # Check package.json
    if [ ! -f "$SERVER_DIR/package.json" ]; then
        log_fail "$server: package.json missing"
        continue
    fi

    # Check dist
    if [ -f "$SERVER_DIR/dist/index.js" ]; then
        log_pass "$server: built (dist/index.js exists)"
    else
        log_fail "$server: not built (run: cd mcp-servers && npm run build)"
    fi
done

echo ""

# ============================================
# CHECK 5: MCP Server Startup Test
# ============================================

if [ "$QUICK_MODE" = false ]; then
    echo -e "${CYAN}[5/6] Testing MCP server startup...${NC}"

    for server in "${MCP_SERVERS[@]}"; do
        SERVER_DIR="$MCP_ROOT/$server"

        if [ ! -f "$SERVER_DIR/dist/index.js" ]; then
            continue
        fi

        # Try to start the server with a timeout
        # MCP servers should start and wait for stdio, so we just check they don't crash immediately
        log_info "Testing $server..."

        # Start server in background, wait 2 seconds, check if still running
        (cd "$SERVER_DIR" && timeout 3 node dist/index.js 2>/dev/null &)
        SERVER_PID=$!
        sleep 1

        if kill -0 $SERVER_PID 2>/dev/null; then
            log_pass "$server: starts successfully"
            kill $SERVER_PID 2>/dev/null || true
        else
            # Server exited - check if it was a clean exit or error
            wait $SERVER_PID 2>/dev/null
            EXIT_CODE=$?
            if [ $EXIT_CODE -eq 124 ]; then
                # Timeout - server ran but didn't get input
                log_pass "$server: starts successfully"
            else
                log_warn "$server: exits immediately (may need env vars)"
            fi
        fi
    done
else
    echo -e "${CYAN}[5/6] MCP server startup test...${NC}"
    echo -e "  ${DIM}Skipped (--quick mode)${NC}"
fi

echo ""

# ============================================
# CHECK 6: Documentation Server
# ============================================

echo -e "${CYAN}[6/6] Checking documentation server...${NC}"

# Check docs-index.ts (technology registry)
DOCS_INDEX="$MCP_ROOT/documentation/src/docs-index.ts"
if [ -f "$DOCS_INDEX" ]; then
    # Count quoted strings in SUPPORTED_TECHNOLOGIES array
    TECH_COUNT=$(grep -oE '"[a-z0-9-]+"' "$DOCS_INDEX" 2>/dev/null | wc -l | tr -d ' ')
    if [ -z "$TECH_COUNT" ] || [ "$TECH_COUNT" = "0" ]; then
        TECH_COUNT="unknown"
    fi
    log_pass "docs-index.ts: $TECH_COUNT technologies registered"
else
    log_fail "docs-index.ts not found"
fi

# Check KB fetcher exists (fetches from git on-demand)
KB_FETCHER="$MCP_ROOT/documentation/src/kb-fetcher.ts"
if [ -f "$KB_FETCHER" ]; then
    log_pass "Knowledge base: git-based fetcher configured"
else
    log_warn "kb-fetcher.ts not found (KB may not work)"
fi

echo ""

# ============================================
# SUMMARY
# ============================================

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Summary${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${RED}Errors:${NC}   $ERRORS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  HEALTH CHECK FAILED - Critical issues found               ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Suggested fixes:${NC}"
    echo -e "  1. cd $DEV_SUITE_DIR/mcp-servers"
    echo -e "  2. npm install"
    echo -e "  3. npm run build"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  HEALTH CHECK PASSED with warnings                         ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 2
else
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  HEALTH CHECK PASSED - All systems operational             ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
