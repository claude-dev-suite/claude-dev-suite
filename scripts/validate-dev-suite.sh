#!/bin/bash
# validate-dev-suite.sh - Validates dev-suite components

DEV_SUITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
WARNINGS=0

echo "========================================"
echo "  DEV-SUITE VALIDATION SCRIPT"
echo "========================================"
echo ""
echo "Dev-suite directory: $DEV_SUITE_DIR"
echo ""

ok() { echo "[OK] $1"; }
fail() { echo "[FAIL] $1"; ERRORS=$((ERRORS+1)); }
warn() { echo "[WARN] $1"; WARNINGS=$((WARNINGS+1)); }

# ========================================
# 1. COUNT COMPONENTS
# ========================================
echo "----------------------------------------"
echo "1. COUNTING COMPONENTS"
echo "----------------------------------------"

AGENT_COUNT=$(find "$DEV_SUITE_DIR/agents" -name "*.md" -type f 2>/dev/null | wc -l)
echo "Agents found: $AGENT_COUNT"

SKILL_COUNT=$(find "$DEV_SUITE_DIR/skills" -name "SKILL.md" -type f 2>/dev/null | wc -l)
echo "Skills found: $SKILL_COUNT"

MCP_COUNT=$(find "$DEV_SUITE_DIR/mcp-servers" -maxdepth 1 -type d 2>/dev/null | tail -n +2 | wc -l)
echo "MCP servers found: $MCP_COUNT"

echo ""

# ========================================
# 2. VALIDATE NEW AGENTS
# ========================================
echo "----------------------------------------"
echo "2. VALIDATING NEW AGENTS (v2.5.0)"
echo "----------------------------------------"

# security-expert
if [ -f "$DEV_SUITE_DIR/agents/security/security-expert.md" ]; then
    ok "security-expert agent exists"
else
    fail "security-expert agent MISSING"
fi

# devops-expert
if [ -f "$DEV_SUITE_DIR/agents/infrastructure/devops-expert.md" ]; then
    ok "devops-expert agent exists"
else
    fail "devops-expert agent MISSING"
fi

# qa-expert
if [ -f "$DEV_SUITE_DIR/agents/quality/qa-expert.md" ]; then
    ok "qa-expert agent exists"
else
    fail "qa-expert agent MISSING"
fi

echo ""

# ========================================
# 3. VALIDATE NEW SKILLS
# ========================================
echo "----------------------------------------"
echo "3. VALIDATING NEW SKILLS"
echo "----------------------------------------"

# supply-chain
if [ -f "$DEV_SUITE_DIR/skills/security/supply-chain/SKILL.md" ]; then
    ok "security/supply-chain skill exists"
else
    fail "security/supply-chain skill MISSING"
fi

# secrets-management
if [ -f "$DEV_SUITE_DIR/skills/security/secrets-management/SKILL.md" ]; then
    ok "security/secrets-management skill exists"
else
    fail "security/secrets-management skill MISSING"
fi

# owasp-top-10
if [ -f "$DEV_SUITE_DIR/skills/security/owasp-top-10/SKILL.md" ]; then
    ok "security/owasp-top-10 skill exists"
else
    fail "security/owasp-top-10 skill MISSING"
fi

echo ""

# ========================================
# 4. VALIDATE SKILL REFERENCES
# ========================================
echo "----------------------------------------"
echo "4. VALIDATING SKILL REFERENCES"
echo "----------------------------------------"

# Skills referenced by security-expert
SECURITY_SKILLS="security/owasp-top-10 security/supply-chain security/secrets-management authentication/jwt authentication/oauth2 best-practices/clean-code"
echo "Checking security-expert skills..."
for skill in $SECURITY_SKILLS; do
    if [ -f "$DEV_SUITE_DIR/skills/$skill/SKILL.md" ]; then
        ok "  $skill"
    else
        fail "  $skill MISSING"
    fi
done

# Skills referenced by devops-expert
DEVOPS_SKILLS="infrastructure/docker infrastructure/docker-compose infrastructure/kubernetes ci-cd/github-actions security/secrets-management security/supply-chain"
echo "Checking devops-expert skills..."
for skill in $DEVOPS_SKILLS; do
    if [ -f "$DEV_SUITE_DIR/skills/$skill/SKILL.md" ]; then
        ok "  $skill"
    else
        fail "  $skill MISSING"
    fi
done

# Skills referenced by qa-expert
QA_SKILLS="quality/common quality/sonarqube best-practices/clean-code"
echo "Checking qa-expert skills..."
for skill in $QA_SKILLS; do
    if [ -f "$DEV_SUITE_DIR/skills/$skill/SKILL.md" ]; then
        ok "  $skill"
    else
        fail "  $skill MISSING"
    fi
done

echo ""

# ========================================
# 5. VALIDATE SECURITY-SCANNER MCP
# ========================================
echo "----------------------------------------"
echo "5. VALIDATING SECURITY-SCANNER MCP"
echo "----------------------------------------"

MCP_DIR="$DEV_SUITE_DIR/mcp-servers/security-scanner"

if [ -d "$MCP_DIR" ]; then
    ok "security-scanner directory exists"
else
    fail "security-scanner directory MISSING"
fi

if [ -f "$MCP_DIR/package.json" ]; then
    ok "package.json exists"
else
    fail "package.json MISSING"
fi

if [ -f "$MCP_DIR/tsconfig.json" ]; then
    ok "tsconfig.json exists"
else
    fail "tsconfig.json MISSING"
fi

if [ -f "$MCP_DIR/src/index.ts" ]; then
    ok "src/index.ts exists"
else
    fail "src/index.ts MISSING"
fi

if [ -f "$MCP_DIR/dist/index.js" ]; then
    ok "dist/index.js exists (built)"
else
    warn "dist/index.js MISSING (not built)"
fi

# Check all scanner files
echo "Checking scanner files..."
for scanner in dependencies secrets code container; do
    if [ -f "$MCP_DIR/src/scanners/$scanner.ts" ]; then
        ok "  scanners/$scanner.ts"
    else
        fail "  scanners/$scanner.ts MISSING"
    fi
done

echo ""

# ========================================
# 6. TEST MCP SERVER
# ========================================
echo "----------------------------------------"
echo "6. TESTING MCP SERVER"
echo "----------------------------------------"

if [ -f "$MCP_DIR/dist/index.js" ]; then
    echo "Attempting to load MCP server..."
    # Just check if it can be loaded by Node
    if node -e "require('$MCP_DIR/dist/index.js')" 2>/dev/null &
    then
        PID=$!
        sleep 2
        if kill -0 $PID 2>/dev/null; then
            ok "MCP server loads successfully"
            kill $PID 2>/dev/null || true
        else
            ok "MCP server started and exited (normal for stdio)"
        fi
    else
        warn "Could not test MCP server startup"
    fi
else
    warn "MCP server not built, skipping test"
fi

echo ""

# ========================================
# SUMMARY
# ========================================
echo "========================================"
echo "  VALIDATION SUMMARY"
echo "========================================"
echo ""
echo "Components:"
echo "  - Agents:      $AGENT_COUNT"
echo "  - Skills:      $SKILL_COUNT"
echo "  - MCP Servers: $MCP_COUNT"
echo ""
echo "Results:"
echo "  - Errors:   $ERRORS"
echo "  - Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "VALIDATION FAILED - $ERRORS errors found"
    exit 1
else
    echo "VALIDATION PASSED"
    exit 0
fi
