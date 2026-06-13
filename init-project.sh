#!/bin/bash
# ================================================================
# dev-suite Project Initializer
# ================================================================
# Launches the web dashboard for project configuration
# All configuration is done through the UI
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Get script directory (dev-suite root)
DEV_SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

# Convert to absolute path
if [[ "$TARGET_DIR" != /* ]]; then
    TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || TARGET_DIR="$(pwd)/${1}"
fi

# ================================================================
# HEADER
# ================================================================
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}              ${BOLD}dev-suite Project Initializer${NC}                ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}                    ${CYAN}Web Dashboard${NC}                         ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ================================================================
# CHECK REQUIREMENTS
# ================================================================
echo -e "${BLUE}[1/3]${NC} Checking requirements..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗${NC} Node.js is not installed"
    echo -e "${YELLOW}Please install Node.js 18+ from https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗${NC} Node.js 18+ required (found v$NODE_VERSION)"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js v$(node -v | sed 's/v//')"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗${NC} npm is not installed"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm v$(npm -v)"

# ================================================================
# BUILD MCP SERVERS (if needed)
# ================================================================
echo ""
echo -e "${BLUE}[2/3]${NC} Preparing MCP servers..."

if [ -f "$DEV_SUITE_DIR/scripts/setup-mcp-servers.sh" ]; then
    bash "$DEV_SUITE_DIR/scripts/setup-mcp-servers.sh"

    # Verify all MCP servers have dist/index.js
    MCP_DIR="$DEV_SUITE_DIR/mcp-servers"
    MISSING_DIST=""
    if [ -f "$MCP_DIR/package.json" ]; then
        SERVERS=$(node -e "console.log(require('$MCP_DIR/package.json').workspaces.join('\n'))" 2>/dev/null)
        while IFS= read -r server; do
            [ -z "$server" ] && continue
            if [ ! -f "$MCP_DIR/$server/dist/index.js" ]; then
                MISSING_DIST="$MISSING_DIST $server"
            fi
        done <<< "$SERVERS"
    fi

    if [ -n "$MISSING_DIST" ]; then
        echo -e "${YELLOW}⚠${NC} Some servers missing dist/:$MISSING_DIST"
        echo -e "${YELLOW}  Attempting individual builds...${NC}"
        for server in $MISSING_DIST; do
            echo -n "  Building $server... "
            if (cd "$MCP_DIR/$server" && npm run build > /dev/null 2>&1); then
                echo -e "${GREEN}OK${NC}"
            else
                echo -e "${RED}FAILED${NC}"
            fi
        done
    fi
else
    echo -e "${YELLOW}⚠${NC} setup-mcp-servers.sh not found, skipping build"
fi

# ================================================================
# LAUNCH DASHBOARD
# ================================================================
echo ""
echo -e "${BLUE}[3/3]${NC} Launching dashboard..."

DASHBOARD_DIR="$DEV_SUITE_DIR/configurator/dashboard"

if [ ! -f "$DASHBOARD_DIR/server.cjs" ]; then
    echo -e "${RED}✗${NC} Dashboard not found at $DASHBOARD_DIR"
    exit 1
fi

# Find available port
PORT=3456
while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
    PORT=$((PORT + 1))
done

# Export environment variables for the dashboard
export DEV_SUITE_DIR
export DEV_SUITE_PROJECT_PATH="$TARGET_DIR"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Dashboard starting on port $PORT${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}URL:${NC}     ${CYAN}http://localhost:$PORT${NC}"
echo -e "  ${BOLD}Project:${NC} ${TARGET_DIR}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the dashboard${NC}"
echo ""

# Open browser (best effort)
open_browser() {
    local url="http://localhost:$PORT"
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url" 2>/dev/null &
    elif command -v open &> /dev/null; then
        open "$url" 2>/dev/null &
    elif command -v wslview &> /dev/null; then
        wslview "$url" 2>/dev/null &
    elif [ -n "$BROWSER" ] && command -v "$BROWSER" &> /dev/null; then
        "$BROWSER" "$url" 2>/dev/null &
    fi
}

# Give server a moment to start, then open browser
(sleep 1 && open_browser) &

# Start the dashboard server
cd "$DASHBOARD_DIR"
PORT=$PORT node server.cjs
