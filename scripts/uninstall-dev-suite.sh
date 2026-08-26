#!/usr/bin/env bash
# ================================================================
# dev-suite uninstaller (wrapper)
# ================================================================
# Manifest parsing lives with the code that writes the manifest:
# configurator/dashboard/server/src/cli/uninstall.ts, which calls the same
# InstallationService.uninstall() the dashboard uses.
#
# The previous standalone implementation parsed `.actions.files_copied[]` and
# other keys the manifest has never contained, so it removed nothing while
# reporting success. This wrapper exists so the documented entry point keeps
# working.
#
# Usage: ./scripts/uninstall-dev-suite.sh [--project <path>] [--dry-run] [--json]
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_SUITE_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$DEV_SUITE_DIR/configurator/dashboard/server"
CLI="$SERVER_DIR/dist/cli/uninstall.js"

# Default to the current directory when no --project is given.
ARGS=("$@")
HAS_PROJECT=false
for a in "${ARGS[@]:-}"; do
    if [ "$a" = "--project" ] || [ "$a" = "-p" ]; then HAS_PROJECT=true; fi
done
if [ "$HAS_PROJECT" = false ]; then
    ARGS+=(--project "$(pwd)")
fi

if [ ! -f "$CLI" ]; then
    echo "Building the dashboard server (first run)..."
    (
        cd "$SERVER_DIR" || exit 1
        [ -d node_modules ] || npm install --silent
        npm run build --silent
    ) || {
        echo "Failed to build the dashboard server." >&2
        echo "Run manually: cd \"$SERVER_DIR\" && npm install && npm run build" >&2
        exit 1
    }
fi

exec node "$CLI" "${ARGS[@]}"
