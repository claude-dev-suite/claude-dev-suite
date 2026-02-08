# Hooks Reference Guide

A comprehensive guide to the Git and Claude Code hooks supported by dev-suite.

---

## Table of Contents

1. [Git Hooks - Client-side](#git-hooks---client-side)
2. [Git Hooks - Server-side](#git-hooks---server-side)
3. [Git Hooks - Email](#git-hooks---email)
4. [Git Hooks - Other](#git-hooks---other)
5. [Claude Code Hooks](#claude-code-hooks)
6. [Best Practices](#best-practices)

---

## Git Hooks - Client-side

Client-side hooks run on the developer's machine during normal Git operations.

### pre-commit

**Runs**: Before the commit is created, even before the commit message prompt.

**Arguments**: None

**Exit code**:
- `0` = proceed with the commit
- `non-zero` = abort the commit

**Primary purpose**: Validate code and enforce quality standards before the commit enters the history.

#### Use Cases

**1. Automatic code formatting**
```bash
#!/bin/sh
# Format all staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|jsx|tsx|json|css|md)$')

if [ -n "$staged_files" ]; then
  echo "Formatting staged files..."
  echo "$staged_files" | xargs npx prettier --write
  echo "$staged_files" | xargs git add
fi

exit 0
```

**2. Linting with error blocking**
```bash
#!/bin/sh
# Run ESLint only on staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|jsx|tsx)$')

if [ -n "$staged_files" ]; then
  echo "Running ESLint..."
  echo "$staged_files" | xargs npx eslint --max-warnings=0

  if [ $? -ne 0 ]; then
    echo "ESLint found errors. Fix them before committing."
    exit 1
  fi
fi

exit 0
```

**3. Prevent committing sensitive files**
```bash
#!/bin/sh
# Block commits containing secrets
forbidden_patterns=(
  "\.env$"
  "\.env\.local$"
  "credentials\.json$"
  "\.pem$"
  "id_rsa"
  "\.key$"
)

staged_files=$(git diff --cached --name-only)

for pattern in "${forbidden_patterns[@]}"; do
  if echo "$staged_files" | grep -qE "$pattern"; then
    echo "Error: Attempting to commit sensitive file matching: $pattern"
    echo "If intentional, use: git commit --no-verify"
    exit 1
  fi
done

exit 0
```

**4. Check for critical TODO/FIXME markers**
```bash
#!/bin/sh
# Block commits with critical TODOs
staged_files=$(git diff --cached --name-only --diff-filter=ACM)

if [ -n "$staged_files" ]; then
  # Search for TODO:BLOCK or FIXME:BLOCK in staged files
  if echo "$staged_files" | xargs grep -l "TODO:BLOCK\|FIXME:BLOCK" 2>/dev/null; then
    echo "Error: Found blocking TODO/FIXME markers"
    echo "Resolve them before committing or remove the :BLOCK suffix"
    exit 1
  fi
fi

exit 0
```

**5. TypeScript type checking**
```bash
#!/bin/sh
# Verify TypeScript types
if [ -f "tsconfig.json" ]; then
  echo "Running TypeScript type check..."
  npx tsc --noEmit

  if [ $? -ne 0 ]; then
    echo "TypeScript errors found. Fix them before committing."
    exit 1
  fi
fi

exit 0
```

**6. File size check**
```bash
#!/bin/sh
# Block files that are too large (> 5MB)
max_size=5242880  # 5MB in bytes

staged_files=$(git diff --cached --name-only --diff-filter=ACM)

for file in $staged_files; do
  if [ -f "$file" ]; then
    size=$(wc -c < "$file")
    if [ "$size" -gt "$max_size" ]; then
      echo "Error: File '$file' is too large ($(($size / 1024 / 1024))MB > 5MB)"
      echo "Consider using Git LFS for large files"
      exit 1
    fi
  fi
done

exit 0
```

---

### prepare-commit-msg

**Runs**: After Git prepares the default commit message, but before the editor opens.

**Arguments**:
- `$1` = path to the file containing the message
- `$2` = message source: `message` (with -m), `template`, `merge`, `squash`, `commit` (with -c/-C)
- `$3` = commit SHA (only with -c/-C)

**Exit code**:
- `0` = proceed
- `non-zero` = abort

**Primary purpose**: Automatically modify the commit message before the user sees it.

#### Use Cases

**1. Add ticket number from branch name**
```bash
#!/bin/sh
commit_msg_file=$1
commit_source=$2

# Do not modify for merge or amend
if [ "$commit_source" = "merge" ] || [ "$commit_source" = "commit" ]; then
  exit 0
fi

# Extract ticket from branch name (e.g., feature/PROJ-123-description)
branch=$(git branch --show-current)
ticket=$(echo "$branch" | grep -oE '[A-Z]+-[0-9]+' | head -1)

if [ -n "$ticket" ]; then
  # Check if the ticket is already in the message
  if ! grep -q "$ticket" "$commit_msg_file"; then
    # Prepend ticket to the message
    sed -i "1s/^/[$ticket] /" "$commit_msg_file"
  fi
fi

exit 0
```

**2. Add template for different branch types**
```bash
#!/bin/sh
commit_msg_file=$1
commit_source=$2

# Only for new commits without a message
if [ "$commit_source" != "" ] && [ "$commit_source" != "template" ]; then
  exit 0
fi

branch=$(git branch --show-current)

# Template based on branch type
if echo "$branch" | grep -q "^feature/"; then
  cat > "$commit_msg_file" << 'EOF'
feat:

# Describe the feature you're implementing
# - What does it do?
# - Why is it needed?
EOF
elif echo "$branch" | grep -q "^fix/\|^bugfix/"; then
  cat > "$commit_msg_file" << 'EOF'
fix:

# Describe the bug and the fix
# - What was the problem?
# - How did you fix it?
# - Related issue: #
EOF
elif echo "$branch" | grep -q "^hotfix/"; then
  cat > "$commit_msg_file" << 'EOF'
fix!: URGENT -

# HOTFIX - Describe the critical fix
# - Impact of the bug
# - Root cause
# - Solution applied
EOF
fi

exit 0
```

**3. Automatically add co-author**
```bash
#!/bin/sh
commit_msg_file=$1

# Add co-author when pair programming
# Based on environment variable
if [ -n "$GIT_PAIR" ]; then
  echo "" >> "$commit_msg_file"
  echo "Co-authored-by: $GIT_PAIR" >> "$commit_msg_file"
fi

exit 0
```

**4. Add statistics to the message**
```bash
#!/bin/sh
commit_msg_file=$1

# Add modified file statistics as a comment
stats=$(git diff --cached --stat | tail -1)

echo "" >> "$commit_msg_file"
echo "# Stats: $stats" >> "$commit_msg_file"

exit 0
```

---

### commit-msg

**Runs**: After the user has entered the commit message, before finalization.

**Arguments**:
- `$1` = path to the file containing the commit message

**Exit code**:
- `0` = proceed with the commit
- `non-zero` = abort the commit

**Primary purpose**: Validate the format and content of the commit message.

#### Use Cases

**1. Conventional Commits enforcement**
```bash
#!/bin/sh
commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# Pattern for Conventional Commits
# type(optional scope): description
# type! for breaking changes
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .{1,}'

# Ignore comment lines and merge commits
first_line=$(echo "$commit_msg" | grep -v "^#" | head -1)

# Ignore merge commits
if echo "$first_line" | grep -qE "^Merge "; then
  exit 0
fi

if ! echo "$first_line" | grep -qE "$pattern"; then
  echo ""
  echo "Error: Commit message does not follow Conventional Commits format"
  echo ""
  echo "Format: <type>(<scope>): <description>"
  echo ""
  echo "Types:"
  echo "  feat     - New feature"
  echo "  fix      - Bug fix"
  echo "  docs     - Documentation only"
  echo "  style    - Code style (formatting, semicolons)"
  echo "  refactor - Code refactoring"
  echo "  perf     - Performance improvement"
  echo "  test     - Adding tests"
  echo "  build    - Build system or dependencies"
  echo "  ci       - CI configuration"
  echo "  chore    - Other changes"
  echo "  revert   - Revert previous commit"
  echo ""
  echo "Examples:"
  echo "  feat(auth): add login functionality"
  echo "  fix: resolve memory leak in parser"
  echo "  docs(readme): update installation guide"
  echo "  feat!: drop support for Node 14"
  echo ""
  echo "Your message: $first_line"
  exit 1
fi

exit 0
```

**2. Message length validation**
```bash
#!/bin/sh
commit_msg_file=$1

# Read the first line (subject)
subject=$(grep -v "^#" "$commit_msg_file" | head -1)

# Subject line checks
if [ ${#subject} -gt 72 ]; then
  echo "Error: Subject line too long (${#subject} > 72 characters)"
  echo "Keep it concise and descriptive"
  exit 1
fi

if [ ${#subject} -lt 10 ]; then
  echo "Error: Subject line too short (${#subject} < 10 characters)"
  echo "Provide a meaningful description"
  exit 1
fi

# Verify it does not end with a period
if echo "$subject" | grep -qE '\.$'; then
  echo "Error: Subject line should not end with a period"
  exit 1
fi

# Verify it starts with a capital letter (after the type)
if echo "$subject" | grep -qE '^[a-z]+(\([^)]+\))?: [a-z]'; then
  echo "Warning: Consider capitalizing the description"
  # Do not block, just a warning
fi

exit 0
```

**3. Mandatory issue reference**
```bash
#!/bin/sh
commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# Require issue reference for non-main branches
branch=$(git branch --show-current)

if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
  # Look for patterns like #123, PROJ-123, closes #123, fixes #123
  if ! echo "$commit_msg" | grep -qiE "(#[0-9]+|[A-Z]+-[0-9]+|closes|fixes|resolves)"; then
    echo "Warning: No issue reference found in commit message"
    echo "Consider adding: #123, PROJ-123, or 'Closes #123'"
    # Do not block, just a warning
  fi
fi

exit 0
```

**4. Block generic messages**
```bash
#!/bin/sh
commit_msg_file=$1
subject=$(grep -v "^#" "$commit_msg_file" | head -1 | tr '[:upper:]' '[:lower:]')

# List of generic messages to block
generic_messages=(
  "fix"
  "fixes"
  "fixed"
  "update"
  "updates"
  "updated"
  "change"
  "changes"
  "changed"
  "wip"
  "work in progress"
  "test"
  "testing"
  "temp"
  "tmp"
  "asdf"
  "aaa"
  "."
  "-"
)

for msg in "${generic_messages[@]}"; do
  if [ "$subject" = "$msg" ]; then
    echo "Error: Generic commit message not allowed: '$subject'"
    echo "Please provide a meaningful description of your changes"
    exit 1
  fi
done

exit 0
```

---

### post-commit

**Runs**: After the commit has been successfully created.

**Arguments**: None

**Exit code**: Ignored (the commit is already done)

**Primary purpose**: Notifications, logging, triggering post-commit actions.

#### Use Cases

**1. Desktop notification**
```bash
#!/bin/sh
# Desktop notification for the commit
commit_msg=$(git log -1 --pretty=%B | head -1)
commit_hash=$(git log -1 --pretty=%h)

# Linux (notify-send)
if command -v notify-send &> /dev/null; then
  notify-send "Git Commit" "$commit_hash: $commit_msg"
fi

# macOS (osascript)
if command -v osascript &> /dev/null; then
  osascript -e "display notification \"$commit_hash: $commit_msg\" with title \"Git Commit\""
fi

exit 0
```

**2. Local logging**
```bash
#!/bin/sh
# Log all commits to a local file
log_file="$HOME/.git-commit-log"

commit_hash=$(git log -1 --pretty=%H)
commit_short=$(git log -1 --pretty=%h)
commit_msg=$(git log -1 --pretty=%B | head -1)
commit_date=$(git log -1 --pretty=%ci)
repo_name=$(basename "$(git rev-parse --show-toplevel)")
branch=$(git branch --show-current)

echo "$commit_date | $repo_name | $branch | $commit_short | $commit_msg" >> "$log_file"

exit 0
```

**3. Auto-push for specific branches**
```bash
#!/bin/sh
# Auto-push for documentation branches
branch=$(git branch --show-current)

if echo "$branch" | grep -qE "^docs/|^documentation"; then
  echo "Auto-pushing documentation branch..."
  git push origin "$branch" 2>/dev/null &
fi

exit 0
```

**4. Update time tracking**
```bash
#!/bin/sh
# Integration with time tracking system
commit_msg=$(git log -1 --pretty=%B)

# Extract time from message (e.g., "fix: bug [2h]")
time_spent=$(echo "$commit_msg" | grep -oE '\[[0-9]+[hm]\]' | tr -d '[]')

if [ -n "$time_spent" ]; then
  # Extract ticket
  ticket=$(echo "$commit_msg" | grep -oE '[A-Z]+-[0-9]+')

  if [ -n "$ticket" ]; then
    # Log time (integrate with your system)
    echo "Logging $time_spent for $ticket"
    # curl -X POST "https://timetracker/api/log" -d "ticket=$ticket&time=$time_spent"
  fi
fi

exit 0
```

**5. Trigger background build**
```bash
#!/bin/sh
# Trigger incremental build in background
if [ -f "package.json" ]; then
  # Build in background without blocking
  nohup npm run build > /dev/null 2>&1 &
  echo "Build triggered in background (PID: $!)"
fi

exit 0
```

---

### pre-merge-commit

**Runs**: Before a merge commit, after conflicts have been resolved.

**Arguments**: None

**Exit code**:
- `0` = proceed with the merge commit
- `non-zero` = abort the merge

**Primary purpose**: Validate the merge result before committing.

#### Use Cases

**1. Verify complete conflict resolution**
```bash
#!/bin/sh
# Verify that no residual conflict markers remain
if git diff --cached --name-only | xargs grep -l "<<<<<<\|======\|>>>>>>" 2>/dev/null; then
  echo "Error: Unresolved merge conflicts found"
  echo "Files with conflict markers:"
  git diff --cached --name-only | xargs grep -l "<<<<<<\|======\|>>>>>>" 2>/dev/null
  exit 1
fi

exit 0
```

**2. Run tests on merged code**
```bash
#!/bin/sh
# Run tests to verify the merge did not break anything
echo "Running tests on merged code..."

if [ -f "package.json" ]; then
  npm test

  if [ $? -ne 0 ]; then
    echo "Error: Tests failed after merge"
    echo "Fix the issues before completing the merge"
    exit 1
  fi
fi

exit 0
```

**3. Type check after merge**
```bash
#!/bin/sh
# Verify types after merging branches with TypeScript changes
if [ -f "tsconfig.json" ]; then
  changed_ts=$(git diff --cached --name-only | grep -E '\.(ts|tsx)$')

  if [ -n "$changed_ts" ]; then
    echo "TypeScript files changed, running type check..."
    npx tsc --noEmit

    if [ $? -ne 0 ]; then
      echo "Error: TypeScript errors after merge"
      exit 1
    fi
  fi
fi

exit 0
```

**4. Verify changelog is updated**
```bash
#!/bin/sh
# For merges into main/develop, verify that CHANGELOG is updated
target_branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$target_branch" = "main" ] || [ "$target_branch" = "develop" ]; then
  if ! git diff --cached --name-only | grep -q "CHANGELOG"; then
    echo "Warning: CHANGELOG.md not updated for merge to $target_branch"
    echo "Consider updating the changelog with your changes"
    # Do not block, just a warning
  fi
fi

exit 0
```

---

### pre-push

**Runs**: Before pushing to the remote, after local commits have been determined.

**Arguments**:
- `$1` = remote name (e.g., "origin")
- `$2` = remote URL

**stdin**: Receives lines in the format `<local ref> <local sha> <remote ref> <remote sha>`

**Exit code**:
- `0` = proceed with the push
- `non-zero` = abort the push

**Primary purpose**: Last line of defense before sharing code.

#### Use Cases

**1. Run full test suite**
```bash
#!/bin/sh
remote=$1
url=$2

echo "Running full test suite before push..."

if [ -f "package.json" ]; then
  npm test

  if [ $? -ne 0 ]; then
    echo "Error: Tests failed. Fix before pushing."
    exit 1
  fi
fi

exit 0
```

**2. Prevent push to protected branches**
```bash
#!/bin/sh
remote=$1
url=$2

protected_branches="main master develop"

while read local_ref local_sha remote_ref remote_sha; do
  branch_name=$(echo "$remote_ref" | sed 's|refs/heads/||')

  for protected in $protected_branches; do
    if [ "$branch_name" = "$protected" ]; then
      echo "Error: Direct push to '$protected' not allowed"
      echo "Please create a Pull Request instead"
      exit 1
    fi
  done
done

exit 0
```

**3. Prevent push of WIP branches**
```bash
#!/bin/sh
# Block push of work-in-progress branches
branch=$(git branch --show-current)

if echo "$branch" | grep -qiE "^wip/|^wip-|/wip$|-wip$"; then
  echo "Error: Cannot push WIP branch: $branch"
  echo "Rename your branch or finish your work first"
  echo "Use: git branch -m new-name"
  exit 1
fi

exit 0
```

**4. Verify no local commits have 'WIP' in the message**
```bash
#!/bin/sh
remote=$1

# Check the commits about to be pushed
while read local_ref local_sha remote_ref remote_sha; do
  # Skip delete
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Find commits not yet on the remote
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  # Search for commits with WIP in the message
  wip_commits=$(git log --oneline "$range" | grep -iE "^[a-f0-9]+ wip|^[a-f0-9]+ WIP")

  if [ -n "$wip_commits" ]; then
    echo "Error: Found WIP commits:"
    echo "$wip_commits"
    echo ""
    echo "Squash or amend these commits before pushing"
    exit 1
  fi
done

exit 0
```

**5. Security audit**
```bash
#!/bin/sh
# Run security audit before push
if [ -f "package-lock.json" ]; then
  echo "Running npm security audit..."

  # Block only for high/critical vulnerabilities
  npm audit --audit-level=high

  if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Security vulnerabilities found"
    echo "Run 'npm audit fix' or address the issues"
    exit 1
  fi
fi

exit 0
```

**6. Prevent force push**
```bash
#!/bin/sh
remote=$1

while read local_ref local_sha remote_ref remote_sha; do
  # Skip new branches and deletes
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Check if it's a force push (local is not descendant of remote)
  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    branch_name=$(echo "$remote_ref" | sed 's|refs/heads/||')
    echo "Error: Force push to '$branch_name' not allowed"
    echo "Remote has commits that would be lost"
    exit 1
  fi
done

exit 0
```

**7. Verify push size**
```bash
#!/bin/sh
# Block pushes with too many files or excessively large content
max_files=100
max_size_mb=50

while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  # Count modified files
  file_count=$(git diff --name-only "$range" 2>/dev/null | wc -l)

  if [ "$file_count" -gt "$max_files" ]; then
    echo "Warning: Pushing $file_count files (> $max_files)"
    echo "Consider breaking into smaller commits"
  fi

  # Check total size
  total_size=$(git diff --stat "$range" 2>/dev/null | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+')
  # This is an approximation, not the actual size in bytes
done

exit 0
```

---

### pre-rebase

**Runs**: Before starting a rebase.

**Arguments**:
- `$1` = upstream branch being rebased onto
- `$2` = branch about to be rebased (empty if HEAD)

**Exit code**:
- `0` = proceed with the rebase
- `non-zero` = abort the rebase

**Primary purpose**: Prevent rebase on branches that should not be modified.

#### Use Cases

**1. Protect main branches**
```bash
#!/bin/sh
upstream=$1
branch=${2:-$(git branch --show-current)}

protected_branches="main master develop release"

for protected in $protected_branches; do
  if [ "$branch" = "$protected" ]; then
    echo "Error: Cannot rebase protected branch: $branch"
    echo "Protected branches: $protected_branches"
    exit 1
  fi
done

exit 0
```

**2. Prevent rebase of shared branches**
```bash
#!/bin/sh
branch=${2:-$(git branch --show-current)}

# Check if the branch has been pushed
if git rev-parse --verify "origin/$branch" > /dev/null 2>&1; then
  # Check if there are other contributors
  authors=$(git log "origin/$branch" --format="%ae" | sort -u | wc -l)

  if [ "$authors" -gt 1 ]; then
    echo "Warning: Branch '$branch' has multiple contributors"
    echo "Rebasing shared branches can cause problems for others"
    read -p "Are you sure you want to continue? (y/N) " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
      exit 1
    fi
  fi
fi

exit 0
```

**3. Verify no uncommitted changes exist**
```bash
#!/bin/sh
# Rebase requires a clean working directory
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes"
  echo "Please commit or stash your changes before rebasing"
  git status --short
  exit 1
fi

exit 0
```

---

### post-checkout

**Runs**: After `git checkout` or `git switch`.

**Arguments**:
- `$1` = ref of the previous commit
- `$2` = ref of the new commit
- `$3` = flag: `1` if it is a branch checkout, `0` if it is a file checkout

**Exit code**: Ignored

**Primary purpose**: Set up the environment for the new branch.

#### Use Cases

**1. Reinstall dependencies if changed**
```bash
#!/bin/sh
prev_ref=$1
new_ref=$2
is_branch_checkout=$3

# Only for branch checkout
if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

# Check if package.json has changed
if git diff --name-only "$prev_ref" "$new_ref" | grep -qE "package(-lock)?\.json$"; then
  echo "package.json changed, running npm install..."
  npm install
fi

# Check if requirements.txt has changed (Python)
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "requirements.txt"; then
  echo "requirements.txt changed, running pip install..."
  pip install -r requirements.txt
fi

# Check if go.mod has changed (Go)
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "go.mod"; then
  echo "go.mod changed, running go mod download..."
  go mod download
fi

exit 0
```

**2. Clean cache and temporary files**
```bash
#!/bin/sh
is_branch_checkout=$3

if [ "$is_branch_checkout" = "1" ]; then
  # Clean common caches
  [ -d ".cache" ] && rm -rf .cache
  [ -d "node_modules/.cache" ] && rm -rf node_modules/.cache
  [ -d ".next" ] && rm -rf .next
  [ -d "dist" ] && rm -rf dist
  [ -d "__pycache__" ] && find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

  echo "Cache cleaned for new branch"
fi

exit 0
```

**3. Configure environment per branch**
```bash
#!/bin/sh
is_branch_checkout=$3

if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

branch=$(git branch --show-current)

# Select appropriate .env file
if echo "$branch" | grep -q "^feature/"; then
  [ -f ".env.development" ] && cp .env.development .env.local
elif echo "$branch" | grep -qE "^release/|^hotfix/"; then
  [ -f ".env.staging" ] && cp .env.staging .env.local
fi

exit 0
```

**4. Run database migrations**
```bash
#!/bin/sh
prev_ref=$1
new_ref=$2
is_branch_checkout=$3

if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

# Check if there are new migrations
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "migrations/"; then
  echo "New migrations detected, running database migrations..."
  npm run db:migrate
fi

exit 0
```

---

### post-merge

**Runs**: After a successful merge.

**Arguments**:
- `$1` = flag: `1` if it was a squash merge, `0` otherwise

**Exit code**: Ignored

**Primary purpose**: Post-merge actions such as reinstalling dependencies.

#### Use Cases

**1. Reinstall dependencies**
```bash
#!/bin/sh
is_squash=$1

# Check if dependencies have changed
changed_files=$(git diff HEAD@{1} --name-only)

if echo "$changed_files" | grep -qE "package(-lock)?\.json$"; then
  echo "Dependencies changed, running npm install..."
  npm install
fi

if echo "$changed_files" | grep -q "requirements.txt"; then
  echo "Python dependencies changed, running pip install..."
  pip install -r requirements.txt
fi

exit 0
```

**2. Run migrations**
```bash
#!/bin/sh
changed_files=$(git diff HEAD@{1} --name-only)

if echo "$changed_files" | grep -q "migrations/\|db/migrate"; then
  echo "Database migrations changed"

  if [ -f "package.json" ]; then
    npm run db:migrate
  elif [ -f "manage.py" ]; then
    python manage.py migrate
  fi
fi

exit 0
```

**3. Rebuild after merge**
```bash
#!/bin/sh
# Rebuild if source files have changed
changed_files=$(git diff HEAD@{1} --name-only)

if echo "$changed_files" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  echo "Source files changed, rebuilding..."
  npm run build
fi

exit 0
```

**4. Merge completion notification**
```bash
#!/bin/sh
is_squash=$1
merge_type="merge"
[ "$is_squash" = "1" ] && merge_type="squash merge"

merged_branch=$(git reflog -1 | grep -oE "merge [^:]+:" | sed 's/merge \|://g')
commit_count=$(git rev-list HEAD@{1}..HEAD --count)

echo ""
echo "==================================="
echo "Merge completed!"
echo "Type: $merge_type"
echo "Commits merged: $commit_count"
[ -n "$merged_branch" ] && echo "From: $merged_branch"
echo "==================================="

exit 0
```

---

### post-rewrite

**Runs**: After commands that rewrite commits (`git commit --amend`, `git rebase`).

**Arguments**:
- `$1` = command that caused the rewrite: `amend` or `rebase`

**stdin**: Receives lines in the format `<old sha> <new sha>` for each rewritten commit

**Exit code**: Ignored

**Primary purpose**: Update external references to modified commits.

#### Use Cases

**1. Rewrite logging**
```bash
#!/bin/sh
command=$1
log_file="$HOME/.git-rewrite-log"

echo "$(date) - $command in $(pwd)" >> "$log_file"

while read old_sha new_sha; do
  echo "  $old_sha -> $new_sha" >> "$log_file"
done

exit 0
```

**2. Rewrite notification**
```bash
#!/bin/sh
command=$1

count=0
while read old_sha new_sha; do
  count=$((count + 1))
done

echo ""
echo "Rewrite completed ($command)"
echo "Commits rewritten: $count"

if [ "$command" = "rebase" ] && [ "$count" -gt 5 ]; then
  echo "Warning: Large rebase. Remember to force push if already pushed."
fi

exit 0
```

**3. Update references in files**
```bash
#!/bin/sh
# Update commit references in documentation files
command=$1

while read old_sha new_sha; do
  # Find and replace references in markdown files
  find . -name "*.md" -type f -exec sed -i "s/$old_sha/$new_sha/g" {} \;
done

exit 0
```

---

## Git Hooks - Server-side

Server-side hooks run on the Git server (not used with GitHub/GitLab, which have their own CI systems).

### pre-receive

**Runs**: Before any ref is updated on the server.

**Arguments**: None

**stdin**: Lines in the format `<old sha> <new sha> <ref name>`

**Exit code**:
- `0` = accept the push
- `non-zero` = reject the entire push

**Primary purpose**: Enforce policies at the repository level.

#### Use Cases

**1. Block force push**
```bash
#!/bin/sh
while read old_sha new_sha ref; do
  # Skip new branches and deletes
  if [ "$old_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Check if it's a force push
  if ! git merge-base --is-ancestor "$old_sha" "$new_sha"; then
    echo "Error: Force push not allowed on this repository"
    exit 1
  fi
done

exit 0
```

**2. Require signed commits**
```bash
#!/bin/sh
while read old_sha new_sha ref; do
  # Skip deletes
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Determine commit range
  if [ "$old_sha" = "0000000000000000000000000000000000000000" ]; then
    commits=$(git rev-list "$new_sha")
  else
    commits=$(git rev-list "$old_sha..$new_sha")
  fi

  for commit in $commits; do
    if ! git verify-commit "$commit" 2>/dev/null; then
      echo "Error: Commit $commit is not signed"
      echo "All commits must be GPG signed"
      exit 1
    fi
  done
done

exit 0
```

**3. Validate file size**
```bash
#!/bin/sh
max_size=10485760  # 10MB

while read old_sha new_sha ref; do
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Find large files in the new commits
  if [ "$old_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$new_sha"
  else
    range="$old_sha..$new_sha"
  fi

  large_files=$(git rev-list --objects "$range" | \
    git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' | \
    awk -v max="$max_size" '$1 == "blob" && $2 > max { print $3 " (" int($2/1024/1024) "MB)" }')

  if [ -n "$large_files" ]; then
    echo "Error: Files exceed maximum size (10MB):"
    echo "$large_files"
    echo "Use Git LFS for large files"
    exit 1
  fi
done

exit 0
```

---

### update

**Runs**: Once for each ref that is about to be updated.

**Arguments**:
- `$1` = ref name (e.g., refs/heads/main)
- `$2` = old SHA
- `$3` = new SHA

**Exit code**:
- `0` = accept the update for this ref
- `non-zero` = reject the update for this ref

**Primary purpose**: More granular per-branch validation.

#### Use Cases

**1. Protect specific branches**
```bash
#!/bin/sh
ref=$1
old_sha=$2
new_sha=$3

branch=$(echo "$ref" | sed 's|refs/heads/||')

# Block direct push to main
if [ "$branch" = "main" ]; then
  echo "Error: Direct push to main not allowed"
  echo "Create a pull request instead"
  exit 1
fi

# Release branches: fast-forward only
if echo "$branch" | grep -q "^release/"; then
  if ! git merge-base --is-ancestor "$old_sha" "$new_sha"; then
    echo "Error: Force push not allowed on release branches"
    exit 1
  fi
fi

exit 0
```

**2. Validate branch naming convention**
```bash
#!/bin/sh
ref=$1

# Only for new branches
if echo "$ref" | grep -q "^refs/heads/"; then
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  # Valid patterns: feature/*, bugfix/*, hotfix/*, release/*
  if ! echo "$branch" | grep -qE "^(feature|bugfix|hotfix|release|main|master|develop)/"; then
    # Allow branches without a prefix only if they are main/master/develop
    if [ "$branch" != "main" ] && [ "$branch" != "master" ] && [ "$branch" != "develop" ]; then
      echo "Error: Invalid branch name: $branch"
      echo "Use: feature/*, bugfix/*, hotfix/*, release/*"
      exit 1
    fi
  fi
fi

exit 0
```

---

### post-receive

**Runs**: After all refs have been updated.

**stdin**: Same as pre-receive

**Exit code**: Ignored

**Primary purpose**: Trigger CI/CD, notifications, deployments.

#### Use Cases

**1. Trigger CI/CD**
```bash
#!/bin/sh
while read old_sha new_sha ref; do
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  # Trigger Jenkins
  curl -X POST "http://jenkins/job/build/buildWithParameters?branch=$branch" \
    --user "$JENKINS_USER:$JENKINS_TOKEN"

  echo "CI build triggered for $branch"
done

exit 0
```

**2. Automatic deployment**
```bash
#!/bin/sh
while read old_sha new_sha ref; do
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  case "$branch" in
    main)
      echo "Deploying to production..."
      /opt/deploy/production.sh
      ;;
    develop)
      echo "Deploying to staging..."
      /opt/deploy/staging.sh
      ;;
    release/*)
      echo "Deploying to UAT..."
      /opt/deploy/uat.sh
      ;;
  esac
done

exit 0
```

**3. Slack notification**
```bash
#!/bin/sh
SLACK_WEBHOOK="https://hooks.slack.com/services/xxx"

while read old_sha new_sha ref; do
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  # Skip if it's a delete
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Count commits
  if [ "$old_sha" = "0000000000000000000000000000000000000000" ]; then
    commit_count="new branch"
  else
    commit_count=$(git rev-list --count "$old_sha..$new_sha")
  fi

  # Send notification
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"Push received: $branch ($commit_count commits)\"}" \
    "$SLACK_WEBHOOK"
done

exit 0
```

---

### post-update

**Runs**: After refs have been updated (legacy).

**Arguments**: List of updated refs

**Note**: Prefer post-receive for new implementations.

```bash
#!/bin/sh
# Update info for git-daemon
exec git update-server-info
```

---

### push-to-checkout

**Runs**: When a push updates the currently checked out branch in a non-bare repo.

**Arguments**: Same as update hook

**Purpose**: Handle push to working directory.

```bash
#!/bin/sh
# Default: update working tree
git read-tree -u -m HEAD "$3"
```

---

## Git Hooks - Email

These hooks are used with `git am` (apply patches from email) and `git send-email`.

### applypatch-msg

**Runs**: During `git am`, after extracting the message from the patch.

**Arguments**: `$1` = file with the message

**Purpose**: Validate/modify the commit message from the patch.

```bash
#!/bin/sh
# Same logic as commit-msg
commit_msg_file=$1

# Validate conventional commits
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+'

if ! grep -qE "$pattern" "$commit_msg_file"; then
  echo "Error: Patch commit message doesn't follow conventional format"
  exit 1
fi

exit 0
```

---

### pre-applypatch

**Runs**: After the patch is applied but before the commit.

**Purpose**: Verify that the resulting code is valid.

```bash
#!/bin/sh
# Run tests
npm test

if [ $? -ne 0 ]; then
  echo "Error: Tests failed after applying patch"
  exit 1
fi

exit 0
```

---

### post-applypatch

**Runs**: After the patch has been applied and committed.

**Purpose**: Post-patch notifications.

```bash
#!/bin/sh
echo "Patch applied successfully: $(git log -1 --oneline)"
```

---

### sendemail-validate

**Runs**: Before sending email with `git send-email`.

**Arguments**: `$1` = file containing the email

**Purpose**: Validate email before sending.

```bash
#!/bin/sh
email_file=$1

# Verify recipient
if ! grep -q "^To:.*@company.com" "$email_file"; then
  echo "Error: Email must be sent to company domain"
  exit 1
fi

exit 0
```

---

## Git Hooks - Other

### fsmonitor-watchman

**Purpose**: Integration with Watchman to speed up `git status` on large repos.

Requires specific Watchman configuration. See Git documentation.

---

### reference-transaction

**Runs**: During ref transactions.

**Arguments**: `$1` = state: `prepared`, `committed`, `aborted`

**Purpose**: Low-level hook for tracking ref transactions.

```bash
#!/bin/sh
state=$1

case "$state" in
  prepared)
    echo "Ref transaction prepared"
    ;;
  committed)
    echo "Ref transaction committed"
    ;;
  aborted)
    echo "Ref transaction aborted"
    ;;
esac

exit 0
```

---

## Claude Code Hooks

Claude Code supports hooks that run during interactions with Claude.

### PreToolUse

**Runs**: Before Claude executes a tool.

**Matcher**: Tool name (regex). E.g.: `Write|Edit`, `Bash`, `.*` (all)

**Environment variables**:
- `$CLAUDE_TOOL_INPUT` - JSON with the tool input

**Exit code**:
- `0` = proceed
- `non-zero` = block the tool

#### Use Cases

**1. Block modification of protected files**
```bash
#!/bin/sh
# Block modification of sensitive configuration files
protected_files="\.env|config/secrets|credentials"

if echo "$CLAUDE_TOOL_INPUT" | grep -qE "$protected_files"; then
  echo "Blocked: Cannot modify protected files"
  exit 1
fi

exit 0
```

**2. Require confirmation for dangerous operations**
```bash
#!/bin/sh
# For the Bash tool, require confirmation for dangerous commands
dangerous_commands="rm -rf|drop table|truncate|delete from"

if echo "$CLAUDE_TOOL_INPUT" | grep -qiE "$dangerous_commands"; then
  echo "Warning: Potentially dangerous command detected"
  read -p "Continue? (y/N) " confirm
  [ "$confirm" != "y" ] && exit 1
fi

exit 0
```

**3. Operation logging**
```bash
#!/bin/sh
# Log all Claude operations
log_file="$HOME/.claude-operations.log"

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$timestamp] Tool: $CLAUDE_TOOL - Input: $CLAUDE_TOOL_INPUT" >> "$log_file"

exit 0
```

---

### PostToolUse

**Runs**: After Claude has executed a tool.

**Matcher**: Tool name (regex)

**Environment variables**:
- `$CLAUDE_FILE_PATHS` - Paths of modified files (for Write/Edit)
- `$CLAUDE_TOOL_INPUT` - JSON with the tool input

#### Use Cases

**1. Auto-format after modifications**
```bash
#!/bin/sh
# Automatically format modified files
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  for file in $CLAUDE_FILE_PATHS; do
    if echo "$file" | grep -qE '\.(js|ts|jsx|tsx|json|css|md)$'; then
      npx prettier --write "$file"
    fi
  done
fi

exit 0
```

**2. Automatic linting**
```bash
#!/bin/sh
# Run lint on modified files
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  js_files=$(echo "$CLAUDE_FILE_PATHS" | tr ' ' '\n' | grep -E '\.(js|ts|jsx|tsx)$')

  if [ -n "$js_files" ]; then
    echo "$js_files" | xargs npx eslint --fix
  fi
fi

exit 0
```

**3. Update search index**
```bash
#!/bin/sh
# Update ctags index after modifications
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  ctags -a $CLAUDE_FILE_PATHS 2>/dev/null
fi

exit 0
```

**4. Modification notification**
```bash
#!/bin/sh
# Desktop notification when Claude modifies files
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  count=$(echo "$CLAUDE_FILE_PATHS" | wc -w)
  notify-send "Claude" "Modified $count file(s)"
fi

exit 0
```

---

### Notification

**Runs**: When Claude sends a notification.

**Matcher**: Notification type

**Environment variables**:
- `$CLAUDE_NOTIFICATION` - Notification text

#### Use Cases

**1. Desktop notification**
```bash
#!/bin/sh
# Show Claude notifications as desktop notifications
if [ -n "$CLAUDE_NOTIFICATION" ]; then
  notify-send "Claude" "$CLAUDE_NOTIFICATION"
fi

exit 0
```

**2. Log notifications**
```bash
#!/bin/sh
# Log notifications
echo "$(date): $CLAUDE_NOTIFICATION" >> ~/.claude-notifications.log
exit 0
```

---

### Stop

**Runs**: When Claude finishes responding.

**Matcher**: None

#### Use Cases

**1. Completion notification**
```bash
#!/bin/sh
# Notification sound
paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null

# Or desktop notification
notify-send "Claude" "Response completed"

exit 0
```

**2. Session log**
```bash
#!/bin/sh
# Log end of session
echo "$(date): Session completed" >> ~/.claude-sessions.log
exit 0
```

---

### SubagentStop

**Runs**: When a Claude subagent finishes.

**Matcher**: None

#### Use Cases

**1. Subagent notification**
```bash
#!/bin/sh
notify-send "Claude" "Subagent task completed"
exit 0
```

---

## Best Practices

### General

1. **Correct exit codes**: Use `exit 0` for success, `exit 1` for failure
2. **Clear messages**: Provide descriptive error messages
3. **Performance**: pre-commit/pre-push hooks must be fast
4. **Idempotency**: Hooks must be safe to run multiple times
5. **Portability**: Use `#!/bin/sh` for maximum compatibility

### Security

1. **Do not trust input**: Always validate incoming data
2. **Avoid eval**: Do not use `eval` with user input
3. **Least privilege**: Server-side hooks should have limited permissions
4. **Auditing**: Log sensitive operations

### Recommended structure

```bash
#!/bin/sh
# Name: pre-commit
# Description: Code validation before commit
# Author: Team Name
# Version: 1.0.0

set -e  # Exit on error

# Configuration
MAX_FILE_SIZE=5242880
PROTECTED_FILES="\.env|secrets"

# Functions
log_info() {
  echo "[INFO] $1"
}

log_error() {
  echo "[ERROR] $1" >&2
}

# Main
main() {
  log_info "Running pre-commit checks..."

  # Check 1: File size
  # Check 2: Protected files
  # Check 3: Code quality

  log_info "All checks passed!"
}

main "$@"
```

### Testing hooks

```bash
# Test pre-commit hook manually
.git/hooks/pre-commit

# Test with specific files
git stash
git add file.js
.git/hooks/pre-commit
git stash pop

# Skip hook temporarily
git commit --no-verify -m "Emergency fix"
```

---

## Appendix: Quick Reference

| Hook | When | Can block | Main arguments |
|------|------|-----------|----------------|
| pre-commit | Before commit | Yes | - |
| prepare-commit-msg | Before editor | Yes | $1=msg file |
| commit-msg | After editor | Yes | $1=msg file |
| post-commit | After commit | No | - |
| pre-merge-commit | Before merge | Yes | - |
| pre-push | Before push | Yes | $1=remote, $2=url |
| pre-rebase | Before rebase | Yes | $1=upstream, $2=branch |
| post-checkout | After checkout | No | $1=old, $2=new, $3=flag |
| post-merge | After merge | No | $1=squash flag |
| post-rewrite | After amend/rebase | No | $1=command |
| pre-receive | Server: before update | Yes | stdin |
| update | Server: per ref | Yes | $1=ref, $2=old, $3=new |
| post-receive | Server: after update | No | stdin |
| PreToolUse | Claude: before tool | Yes | $CLAUDE_TOOL_INPUT |
| PostToolUse | Claude: after tool | No | $CLAUDE_FILE_PATHS |
| Notification | Claude: notification | No | $CLAUDE_NOTIFICATION |
| Stop | Claude: end of response | No | - |
| SubagentStop | Claude: end of subagent | No | - |
