#!/bin/bash
# ================================================================
# dev-suite MCP Servers Setup Script
# ================================================================
# This script builds all MCP servers so they're ready to be copied
# to target projects during /init-project
#
# Uses npm workspaces for shared dependencies (~75% less disk space)
#
# Usage: ./scripts/setup-mcp-servers.sh
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_SUITE_ROOT="$(dirname "$SCRIPT_DIR")"
MCP_SERVERS_DIR="$DEV_SUITE_ROOT/mcp-servers"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  dev-suite MCP Servers Setup (Workspaces)${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed or not in PATH${NC}"
    exit 1
fi

# Check npm version for workspaces support (npm 7+)
NPM_VERSION=$(npm --version | cut -d. -f1)
if [ "$NPM_VERSION" -lt 7 ]; then
    echo -e "${RED}Error: npm 7+ required for workspaces (found npm $NPM_VERSION)${NC}"
    exit 1
fi

cd "$MCP_SERVERS_DIR"

# Check if workspaces are configured
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: mcp-servers/package.json not found${NC}"
    exit 1
fi

# Get list of servers dynamically from workspaces in package.json
# Uses node to parse JSON properly — read into array to avoid word-splitting issues
readarray -t SERVERS < <(node -e "require('./package.json').workspaces.forEach(w => console.log(w))" 2>/dev/null)
if [ ${#SERVERS[@]} -eq 0 ]; then
    echo -e "${RED}Error: Could not read workspaces from package.json${NC}"
    exit 1
fi

SERVER_COUNT=${#SERVERS[@]}
echo -e "${BLUE}Found ${SERVER_COUNT} MCP servers:${NC} ${SERVERS[*]}"
echo ""

# Check if already built and up to date
NEEDS_BUILD=false
MISSING_DIST=""

# Check for any missing dist directories
for dir in "${SERVERS[@]}"; do
    if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
        if [ ! -d "$dir/dist" ] || [ ! -f "$dir/dist/index.js" ]; then
            NEEDS_BUILD=true
            MISSING_DIST="$MISSING_DIST $dir"
        fi
    fi
done

# Check if source is newer than any dist
if [ "$NEEDS_BUILD" = false ]; then
    for dir in "${SERVERS[@]}"; do
        if [ -d "$dir/src" ] && [ -f "$dir/dist/index.js" ]; then
            NEWEST_SRC=$(find "$dir/src" -name "*.ts" -newer "$dir/dist/index.js" 2>/dev/null | head -1)
            if [ -n "$NEWEST_SRC" ]; then
                NEEDS_BUILD=true
                break
            fi
        fi
    done
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    NEEDS_BUILD=true
fi

if [ "$NEEDS_BUILD" = false ]; then
    echo -e "${GREEN}✓${NC} All MCP servers already built and up to date"
    echo ""
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${GREEN}  Setup Complete${NC}"
    echo -e "${BLUE}================================================================${NC}"
    exit 0
fi

if [ -n "$MISSING_DIST" ]; then
    echo -e "${YELLOW}Missing dist/:${NC}$MISSING_DIST"
    echo ""
fi

# Install dependencies (shared via workspaces)
echo -e "${BLUE}[1/2]${NC} Installing dependencies (workspaces)..."
if ! npm install 2>&1 | grep -v "^npm warn"; then
    echo -e "${RED}✗${NC} Failed to install dependencies"
    exit 1
fi
echo -e "${GREEN}✓${NC} Dependencies installed"

# Build all servers in parallel via workspaces
echo -e "${BLUE}[2/2]${NC} Building all MCP servers..."
if ! npm run build 2>&1; then
    echo -e "${YELLOW}⚠${NC} Some servers may have failed to build (check output above)"
fi
echo -e "${GREEN}✓${NC} Build completed"

# Verify builds
echo ""
echo -e "${BLUE}Build Status:${NC}"
BUILT_COUNT=0
FAILED_COUNT=0
for dir in "${SERVERS[@]}"; do
    if [ -f "$dir/dist/index.js" ]; then
        echo -e "  ${GREEN}✓${NC} $dir"
        BUILT_COUNT=$((BUILT_COUNT + 1))
    else
        echo -e "  ${RED}✗${NC} $dir (missing dist/index.js)"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done

cd "$DEV_SUITE_ROOT"

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}  Setup Complete${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "  Servers: ${GREEN}$BUILT_COUNT${NC} built, ${RED}$FAILED_COUNT${NC} failed"
echo -e "  Mode:    ${GREEN}npm workspaces${NC} (shared dependencies)"
echo ""
if [ "$FAILED_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}Some servers failed to build. Check their src/index.ts for errors.${NC}"
else
    echo -e "${GREEN}All MCP servers are ready for /init-project${NC}"
fi
