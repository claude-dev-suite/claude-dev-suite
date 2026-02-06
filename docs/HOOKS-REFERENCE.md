# Hooks Reference Guide

Guida completa agli hook Git e Claude Code supportati da dev-suite.

---

## Indice

1. [Git Hooks - Client-side](#git-hooks---client-side)
2. [Git Hooks - Server-side](#git-hooks---server-side)
3. [Git Hooks - Email](#git-hooks---email)
4. [Git Hooks - Altri](#git-hooks---altri)
5. [Claude Code Hooks](#claude-code-hooks)
6. [Best Practices](#best-practices)

---

## Git Hooks - Client-side

Gli hook client-side vengono eseguiti sul computer dello sviluppatore durante le normali operazioni Git.

### pre-commit

**Esecuzione**: Prima che il commit venga creato, prima ancora di inserire il messaggio.

**Argomenti**: Nessuno

**Exit code**:
- `0` = procedi con il commit
- `non-zero` = annulla il commit

**Scopo principale**: Validare il codice e applicare standard di qualità prima che il commit entri nella history.

#### Casi d'uso

**1. Formattazione automatica del codice**
```bash
#!/bin/sh
# Formatta tutti i file staged
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|jsx|tsx|json|css|md)$')

if [ -n "$staged_files" ]; then
  echo "Formatting staged files..."
  echo "$staged_files" | xargs npx prettier --write
  echo "$staged_files" | xargs git add
fi

exit 0
```

**2. Linting con blocco su errori**
```bash
#!/bin/sh
# Esegui ESLint solo sui file staged
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

**3. Prevenire commit di file sensibili**
```bash
#!/bin/sh
# Blocca commit di file con segreti
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

**4. Verificare assenza di TODO/FIXME critici**
```bash
#!/bin/sh
# Blocca commit con TODO critici
staged_files=$(git diff --cached --name-only --diff-filter=ACM)

if [ -n "$staged_files" ]; then
  # Cerca TODO:BLOCK o FIXME:BLOCK nei file staged
  if echo "$staged_files" | xargs grep -l "TODO:BLOCK\|FIXME:BLOCK" 2>/dev/null; then
    echo "Error: Found blocking TODO/FIXME markers"
    echo "Resolve them before committing or remove the :BLOCK suffix"
    exit 1
  fi
fi

exit 0
```

**5. Type checking TypeScript**
```bash
#!/bin/sh
# Verifica tipi TypeScript
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

**6. Controllo dimensione file**
```bash
#!/bin/sh
# Blocca file troppo grandi (> 5MB)
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

**Esecuzione**: Dopo che Git prepara il messaggio di commit di default, ma prima che l'editor si apra.

**Argomenti**:
- `$1` = percorso del file contenente il messaggio
- `$2` = sorgente del messaggio: `message` (con -m), `template`, `merge`, `squash`, `commit` (con -c/-C)
- `$3` = SHA del commit (solo con -c/-C)

**Exit code**:
- `0` = procedi
- `non-zero` = annulla

**Scopo principale**: Modificare automaticamente il messaggio di commit prima che l'utente lo veda.

#### Casi d'uso

**1. Aggiungere numero ticket dal branch name**
```bash
#!/bin/sh
commit_msg_file=$1
commit_source=$2

# Non modificare se è un merge o amend
if [ "$commit_source" = "merge" ] || [ "$commit_source" = "commit" ]; then
  exit 0
fi

# Estrai ticket dal nome del branch (es. feature/PROJ-123-description)
branch=$(git branch --show-current)
ticket=$(echo "$branch" | grep -oE '[A-Z]+-[0-9]+' | head -1)

if [ -n "$ticket" ]; then
  # Controlla se il ticket è già nel messaggio
  if ! grep -q "$ticket" "$commit_msg_file"; then
    # Prepend ticket al messaggio
    sed -i "1s/^/[$ticket] /" "$commit_msg_file"
  fi
fi

exit 0
```

**2. Aggiungere template per diversi tipi di branch**
```bash
#!/bin/sh
commit_msg_file=$1
commit_source=$2

# Solo per nuovi commit senza messaggio
if [ "$commit_source" != "" ] && [ "$commit_source" != "template" ]; then
  exit 0
fi

branch=$(git branch --show-current)

# Template basato sul tipo di branch
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

**3. Aggiungere co-author automaticamente**
```bash
#!/bin/sh
commit_msg_file=$1

# Aggiungi co-author se stai facendo pair programming
# Basato su variabile d'ambiente
if [ -n "$GIT_PAIR" ]; then
  echo "" >> "$commit_msg_file"
  echo "Co-authored-by: $GIT_PAIR" >> "$commit_msg_file"
fi

exit 0
```

**4. Aggiungere statistiche al messaggio**
```bash
#!/bin/sh
commit_msg_file=$1

# Aggiungi statistiche dei file modificati come commento
stats=$(git diff --cached --stat | tail -1)

echo "" >> "$commit_msg_file"
echo "# Stats: $stats" >> "$commit_msg_file"

exit 0
```

---

### commit-msg

**Esecuzione**: Dopo che l'utente ha inserito il messaggio di commit, prima della finalizzazione.

**Argomenti**:
- `$1` = percorso del file contenente il messaggio di commit

**Exit code**:
- `0` = procedi con il commit
- `non-zero` = annulla il commit

**Scopo principale**: Validare il formato e il contenuto del messaggio di commit.

#### Casi d'uso

**1. Conventional Commits enforcement**
```bash
#!/bin/sh
commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# Pattern per Conventional Commits
# tipo(scope opzionale): descrizione
# tipo! per breaking changes
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .{1,}'

# Ignora righe di commento e merge commits
first_line=$(echo "$commit_msg" | grep -v "^#" | head -1)

# Ignora merge commits
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

**2. Validazione lunghezza messaggio**
```bash
#!/bin/sh
commit_msg_file=$1

# Leggi prima riga (subject)
subject=$(grep -v "^#" "$commit_msg_file" | head -1)

# Controlli sulla subject line
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

# Verifica che non finisca con punto
if echo "$subject" | grep -qE '\.$'; then
  echo "Error: Subject line should not end with a period"
  exit 1
fi

# Verifica che inizi con maiuscola (dopo il tipo)
if echo "$subject" | grep -qE '^[a-z]+(\([^)]+\))?: [a-z]'; then
  echo "Warning: Consider capitalizing the description"
  # Non bloccare, solo warning
fi

exit 0
```

**3. Riferimento issue obbligatorio**
```bash
#!/bin/sh
commit_msg_file=$1
commit_msg=$(cat "$commit_msg_file")

# Richiedi riferimento a issue per branch non-main
branch=$(git branch --show-current)

if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
  # Cerca pattern come #123, PROJ-123, closes #123, fixes #123
  if ! echo "$commit_msg" | grep -qiE "(#[0-9]+|[A-Z]+-[0-9]+|closes|fixes|resolves)"; then
    echo "Warning: No issue reference found in commit message"
    echo "Consider adding: #123, PROJ-123, or 'Closes #123'"
    # Non bloccare, solo warning
  fi
fi

exit 0
```

**4. Bloccare messaggi generici**
```bash
#!/bin/sh
commit_msg_file=$1
subject=$(grep -v "^#" "$commit_msg_file" | head -1 | tr '[:upper:]' '[:lower:]')

# Lista di messaggi generici da bloccare
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

**Esecuzione**: Dopo che il commit è stato creato con successo.

**Argomenti**: Nessuno

**Exit code**: Ignorato (il commit è già fatto)

**Scopo principale**: Notifiche, logging, trigger di azioni post-commit.

#### Casi d'uso

**1. Notifica desktop**
```bash
#!/bin/sh
# Notifica desktop del commit
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

**2. Logging locale**
```bash
#!/bin/sh
# Log tutti i commit in un file locale
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

**3. Auto-push per branch specifici**
```bash
#!/bin/sh
# Auto-push per branch di documentazione
branch=$(git branch --show-current)

if echo "$branch" | grep -qE "^docs/|^documentation"; then
  echo "Auto-pushing documentation branch..."
  git push origin "$branch" 2>/dev/null &
fi

exit 0
```

**4. Aggiornare time tracking**
```bash
#!/bin/sh
# Integrazione con sistema di time tracking
commit_msg=$(git log -1 --pretty=%B)

# Estrai tempo dal messaggio (es. "fix: bug [2h]")
time_spent=$(echo "$commit_msg" | grep -oE '\[[0-9]+[hm]\]' | tr -d '[]')

if [ -n "$time_spent" ]; then
  # Estrai ticket
  ticket=$(echo "$commit_msg" | grep -oE '[A-Z]+-[0-9]+')

  if [ -n "$ticket" ]; then
    # Log tempo (integrare con il tuo sistema)
    echo "Logging $time_spent for $ticket"
    # curl -X POST "https://timetracker/api/log" -d "ticket=$ticket&time=$time_spent"
  fi
fi

exit 0
```

**5. Trigger build in background**
```bash
#!/bin/sh
# Trigger build incrementale in background
if [ -f "package.json" ]; then
  # Build in background senza bloccare
  nohup npm run build > /dev/null 2>&1 &
  echo "Build triggered in background (PID: $!)"
fi

exit 0
```

---

### pre-merge-commit

**Esecuzione**: Prima di un merge commit, dopo che i conflitti sono stati risolti.

**Argomenti**: Nessuno

**Exit code**:
- `0` = procedi con il merge commit
- `non-zero` = annulla il merge

**Scopo principale**: Validare il risultato del merge prima di committare.

#### Casi d'uso

**1. Verificare risoluzione conflitti completa**
```bash
#!/bin/sh
# Verifica che non ci siano marker di conflitto residui
if git diff --cached --name-only | xargs grep -l "<<<<<<\|======\|>>>>>>" 2>/dev/null; then
  echo "Error: Unresolved merge conflicts found"
  echo "Files with conflict markers:"
  git diff --cached --name-only | xargs grep -l "<<<<<<\|======\|>>>>>>" 2>/dev/null
  exit 1
fi

exit 0
```

**2. Eseguire test sul codice merged**
```bash
#!/bin/sh
# Esegui test per verificare che il merge non abbia rotto nulla
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

**3. Type check dopo merge**
```bash
#!/bin/sh
# Verifica tipi dopo merge di branch con cambiamenti TypeScript
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

**4. Verificare changelog aggiornato**
```bash
#!/bin/sh
# Per merge in main/develop, verifica che CHANGELOG sia aggiornato
target_branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$target_branch" = "main" ] || [ "$target_branch" = "develop" ]; then
  if ! git diff --cached --name-only | grep -q "CHANGELOG"; then
    echo "Warning: CHANGELOG.md not updated for merge to $target_branch"
    echo "Consider updating the changelog with your changes"
    # Non bloccare, solo warning
  fi
fi

exit 0
```

---

### pre-push

**Esecuzione**: Prima di pushare al remote, dopo che i commit locali sono stati determinati.

**Argomenti**:
- `$1` = nome del remote (es. "origin")
- `$2` = URL del remote

**stdin**: Riceve righe nel formato `<local ref> <local sha> <remote ref> <remote sha>`

**Exit code**:
- `0` = procedi con il push
- `non-zero` = annulla il push

**Scopo principale**: Ultima linea di difesa prima di condividere il codice.

#### Casi d'uso

**1. Eseguire test completi**
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

**2. Impedire push a branch protetti**
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

**3. Impedire push di branch WIP**
```bash
#!/bin/sh
# Blocca push di branch work-in-progress
branch=$(git branch --show-current)

if echo "$branch" | grep -qiE "^wip/|^wip-|/wip$|-wip$"; then
  echo "Error: Cannot push WIP branch: $branch"
  echo "Rename your branch or finish your work first"
  echo "Use: git branch -m new-name"
  exit 1
fi

exit 0
```

**4. Verificare che non ci siano commit locali con 'WIP' nel messaggio**
```bash
#!/bin/sh
remote=$1

# Controlla i commit che stanno per essere pushati
while read local_ref local_sha remote_ref remote_sha; do
  # Skip delete
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Trova commit non ancora sul remote
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  # Cerca commit con WIP nel messaggio
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
# Esegui audit di sicurezza prima del push
if [ -f "package-lock.json" ]; then
  echo "Running npm security audit..."

  # Blocca solo per vulnerabilità high/critical
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

**6. Impedire force push**
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

**7. Verificare dimensione del push**
```bash
#!/bin/sh
# Blocca push con troppi file o troppo grandi
max_files=100
max_size_mb=50

while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  # Conta file modificati
  file_count=$(git diff --name-only "$range" 2>/dev/null | wc -l)

  if [ "$file_count" -gt "$max_files" ]; then
    echo "Warning: Pushing $file_count files (> $max_files)"
    echo "Consider breaking into smaller commits"
  fi

  # Controlla dimensione totale
  total_size=$(git diff --stat "$range" 2>/dev/null | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+')
  # Questa è un'approssimazione, non la dimensione reale in byte
done

exit 0
```

---

### pre-rebase

**Esecuzione**: Prima di iniziare un rebase.

**Argomenti**:
- `$1` = branch upstream su cui si sta rebasando
- `$2` = branch che sta per essere rebasato (vuoto se è HEAD)

**Exit code**:
- `0` = procedi con il rebase
- `non-zero` = annulla il rebase

**Scopo principale**: Prevenire rebase su branch che non dovrebbero essere modificati.

#### Casi d'uso

**1. Proteggere branch principali**
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

**2. Prevenire rebase di branch condivisi**
```bash
#!/bin/sh
branch=${2:-$(git branch --show-current)}

# Controlla se il branch è stato pushato
if git rev-parse --verify "origin/$branch" > /dev/null 2>&1; then
  # Controlla se ci sono altri contributor
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

**3. Verificare che non ci siano modifiche non committate**
```bash
#!/bin/sh
# Rebase richiede working directory pulita
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

**Esecuzione**: Dopo `git checkout` o `git switch`.

**Argomenti**:
- `$1` = ref del commit precedente
- `$2` = ref del nuovo commit
- `$3` = flag: `1` se è un branch checkout, `0` se è un file checkout

**Exit code**: Ignorato

**Scopo principale**: Configurare l'ambiente per il nuovo branch.

#### Casi d'uso

**1. Reinstallare dipendenze se cambiate**
```bash
#!/bin/sh
prev_ref=$1
new_ref=$2
is_branch_checkout=$3

# Solo per branch checkout
if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

# Controlla se package.json è cambiato
if git diff --name-only "$prev_ref" "$new_ref" | grep -qE "package(-lock)?\.json$"; then
  echo "package.json changed, running npm install..."
  npm install
fi

# Controlla se requirements.txt è cambiato (Python)
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "requirements.txt"; then
  echo "requirements.txt changed, running pip install..."
  pip install -r requirements.txt
fi

# Controlla se go.mod è cambiato (Go)
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "go.mod"; then
  echo "go.mod changed, running go mod download..."
  go mod download
fi

exit 0
```

**2. Pulire cache e file temporanei**
```bash
#!/bin/sh
is_branch_checkout=$3

if [ "$is_branch_checkout" = "1" ]; then
  # Pulisci cache comuni
  [ -d ".cache" ] && rm -rf .cache
  [ -d "node_modules/.cache" ] && rm -rf node_modules/.cache
  [ -d ".next" ] && rm -rf .next
  [ -d "dist" ] && rm -rf dist
  [ -d "__pycache__" ] && find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

  echo "Cache cleaned for new branch"
fi

exit 0
```

**3. Configurare ambiente per branch**
```bash
#!/bin/sh
is_branch_checkout=$3

if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

branch=$(git branch --show-current)

# Seleziona file .env appropriato
if echo "$branch" | grep -q "^feature/"; then
  [ -f ".env.development" ] && cp .env.development .env.local
elif echo "$branch" | grep -qE "^release/|^hotfix/"; then
  [ -f ".env.staging" ] && cp .env.staging .env.local
fi

exit 0
```

**4. Eseguire migrazioni database**
```bash
#!/bin/sh
prev_ref=$1
new_ref=$2
is_branch_checkout=$3

if [ "$is_branch_checkout" != "1" ]; then
  exit 0
fi

# Controlla se ci sono nuove migrazioni
if git diff --name-only "$prev_ref" "$new_ref" | grep -q "migrations/"; then
  echo "New migrations detected, running database migrations..."
  npm run db:migrate
fi

exit 0
```

---

### post-merge

**Esecuzione**: Dopo un merge riuscito.

**Argomenti**:
- `$1` = flag: `1` se era un squash merge, `0` altrimenti

**Exit code**: Ignorato

**Scopo principale**: Azioni post-merge come reinstallare dipendenze.

#### Casi d'uso

**1. Reinstallare dipendenze**
```bash
#!/bin/sh
is_squash=$1

# Controlla se le dipendenze sono cambiate
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

**2. Eseguire migrazioni**
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

**3. Rebuild dopo merge**
```bash
#!/bin/sh
# Ricompila se file sorgente sono cambiati
changed_files=$(git diff HEAD@{1} --name-only)

if echo "$changed_files" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  echo "Source files changed, rebuilding..."
  npm run build
fi

exit 0
```

**4. Notifica merge completato**
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

**Esecuzione**: Dopo comandi che riscrivono commit (`git commit --amend`, `git rebase`).

**Argomenti**:
- `$1` = comando che ha causato la riscrittura: `amend` o `rebase`

**stdin**: Riceve righe nel formato `<old sha> <new sha>` per ogni commit riscritto

**Exit code**: Ignorato

**Scopo principale**: Aggiornare riferimenti esterni ai commit modificati.

#### Casi d'uso

**1. Logging delle riscritture**
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

**2. Notifica riscrittura**
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

**3. Aggiornare riferimenti in file**
```bash
#!/bin/sh
# Aggiorna riferimenti a commit in file di documentazione
command=$1

while read old_sha new_sha; do
  # Cerca e sostituisci riferimenti nei file markdown
  find . -name "*.md" -type f -exec sed -i "s/$old_sha/$new_sha/g" {} \;
done

exit 0
```

---

## Git Hooks - Server-side

Gli hook server-side vengono eseguiti sul server Git (non usati con GitHub/GitLab che hanno le loro CI).

### pre-receive

**Esecuzione**: Prima che qualsiasi ref venga aggiornato sul server.

**Argomenti**: Nessuno

**stdin**: Righe nel formato `<old sha> <new sha> <ref name>`

**Exit code**:
- `0` = accetta il push
- `non-zero` = rifiuta tutto il push

**Scopo principale**: Enforce policy a livello di repository.

#### Casi d'uso

**1. Bloccare force push**
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

**2. Richiedere commit firmati**
```bash
#!/bin/sh
while read old_sha new_sha ref; do
  # Skip deletes
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Determina range di commit
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

**3. Validare dimensione file**
```bash
#!/bin/sh
max_size=10485760  # 10MB

while read old_sha new_sha ref; do
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Trova file grandi nei nuovi commit
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

**Esecuzione**: Una volta per ogni ref che sta per essere aggiornato.

**Argomenti**:
- `$1` = nome del ref (es. refs/heads/main)
- `$2` = old SHA
- `$3` = new SHA

**Exit code**:
- `0` = accetta l'update per questo ref
- `non-zero` = rifiuta l'update per questo ref

**Scopo principale**: Validazione per-branch più granulare.

#### Casi d'uso

**1. Proteggere branch specifici**
```bash
#!/bin/sh
ref=$1
old_sha=$2
new_sha=$3

branch=$(echo "$ref" | sed 's|refs/heads/||')

# Blocca push diretto a main
if [ "$branch" = "main" ]; then
  echo "Error: Direct push to main not allowed"
  echo "Create a pull request instead"
  exit 1
fi

# Release branches: solo fast-forward
if echo "$branch" | grep -q "^release/"; then
  if ! git merge-base --is-ancestor "$old_sha" "$new_sha"; then
    echo "Error: Force push not allowed on release branches"
    exit 1
  fi
fi

exit 0
```

**2. Validare naming convention branch**
```bash
#!/bin/sh
ref=$1

# Solo per nuovi branch
if echo "$ref" | grep -q "^refs/heads/"; then
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  # Pattern validi: feature/*, bugfix/*, hotfix/*, release/*
  if ! echo "$branch" | grep -qE "^(feature|bugfix|hotfix|release|main|master|develop)/"; then
    # Permetti branch senza prefisso solo se sono main/master/develop
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

**Esecuzione**: Dopo che tutti i ref sono stati aggiornati.

**stdin**: Come pre-receive

**Exit code**: Ignorato

**Scopo principale**: Trigger CI/CD, notifiche, deploy.

#### Casi d'uso

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

**2. Deploy automatico**
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

**3. Notifica Slack**
```bash
#!/bin/sh
SLACK_WEBHOOK="https://hooks.slack.com/services/xxx"

while read old_sha new_sha ref; do
  branch=$(echo "$ref" | sed 's|refs/heads/||')

  # Skip se è un delete
  if [ "$new_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  # Conta commit
  if [ "$old_sha" = "0000000000000000000000000000000000000000" ]; then
    commit_count="new branch"
  else
    commit_count=$(git rev-list --count "$old_sha..$new_sha")
  fi

  # Invia notifica
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"Push received: $branch ($commit_count commits)\"}" \
    "$SLACK_WEBHOOK"
done

exit 0
```

---

### post-update

**Esecuzione**: Dopo che i ref sono stati aggiornati (legacy).

**Argomenti**: Lista di ref aggiornati

**Note**: Preferire post-receive per nuove implementazioni.

```bash
#!/bin/sh
# Aggiorna info per git-daemon
exec git update-server-info
```

---

### push-to-checkout

**Esecuzione**: Quando un push aggiorna il branch correntemente checked out in un repo non-bare.

**Argomenti**: Come update hook

**Scopo**: Gestire push a working directory.

```bash
#!/bin/sh
# Default: aggiorna working tree
git read-tree -u -m HEAD "$3"
```

---

## Git Hooks - Email

Questi hook sono usati con `git am` (applica patch da email) e `git send-email`.

### applypatch-msg

**Esecuzione**: Durante `git am`, dopo aver estratto il messaggio dalla patch.

**Argomenti**: `$1` = file con il messaggio

**Scopo**: Validare/modificare il messaggio del commit dalla patch.

```bash
#!/bin/sh
# Stessa logica di commit-msg
commit_msg_file=$1

# Valida conventional commits
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+'

if ! grep -qE "$pattern" "$commit_msg_file"; then
  echo "Error: Patch commit message doesn't follow conventional format"
  exit 1
fi

exit 0
```

---

### pre-applypatch

**Esecuzione**: Dopo che la patch è applicata ma prima del commit.

**Scopo**: Verificare che il codice risultante sia valido.

```bash
#!/bin/sh
# Esegui test
npm test

if [ $? -ne 0 ]; then
  echo "Error: Tests failed after applying patch"
  exit 1
fi

exit 0
```

---

### post-applypatch

**Esecuzione**: Dopo che la patch è stata applicata e committata.

**Scopo**: Notifiche post-patch.

```bash
#!/bin/sh
echo "Patch applied successfully: $(git log -1 --oneline)"
```

---

### sendemail-validate

**Esecuzione**: Prima di inviare email con `git send-email`.

**Argomenti**: `$1` = file contenente l'email

**Scopo**: Validare email prima dell'invio.

```bash
#!/bin/sh
email_file=$1

# Verifica destinatario
if ! grep -q "^To:.*@company.com" "$email_file"; then
  echo "Error: Email must be sent to company domain"
  exit 1
fi

exit 0
```

---

## Git Hooks - Altri

### fsmonitor-watchman

**Scopo**: Integrazione con Watchman per velocizzare `git status` su repo grandi.

Richiede configurazione specifica di Watchman. Vedere documentazione Git.

---

### reference-transaction

**Esecuzione**: Durante transazioni sui ref.

**Argomenti**: `$1` = stato: `prepared`, `committed`, `aborted`

**Scopo**: Hook a basso livello per tracking transazioni ref.

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

Claude Code supporta hook che vengono eseguiti durante le interazioni con Claude.

### PreToolUse

**Esecuzione**: Prima che Claude esegua un tool.

**Matcher**: Nome del tool (regex). Es: `Write|Edit`, `Bash`, `.*` (tutti)

**Variabili ambiente**:
- `$CLAUDE_TOOL_INPUT` - JSON con l'input del tool

**Exit code**:
- `0` = procedi
- `non-zero` = blocca il tool

#### Casi d'uso

**1. Bloccare modifica file protetti**
```bash
#!/bin/sh
# Blocca modifica a file di configurazione sensibili
protected_files="\.env|config/secrets|credentials"

if echo "$CLAUDE_TOOL_INPUT" | grep -qE "$protected_files"; then
  echo "Blocked: Cannot modify protected files"
  exit 1
fi

exit 0
```

**2. Richiedere conferma per operazioni pericolose**
```bash
#!/bin/sh
# Per tool Bash, richiedi conferma per comandi pericolosi
dangerous_commands="rm -rf|drop table|truncate|delete from"

if echo "$CLAUDE_TOOL_INPUT" | grep -qiE "$dangerous_commands"; then
  echo "Warning: Potentially dangerous command detected"
  read -p "Continue? (y/N) " confirm
  [ "$confirm" != "y" ] && exit 1
fi

exit 0
```

**3. Logging delle operazioni**
```bash
#!/bin/sh
# Log tutte le operazioni di Claude
log_file="$HOME/.claude-operations.log"

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$timestamp] Tool: $CLAUDE_TOOL - Input: $CLAUDE_TOOL_INPUT" >> "$log_file"

exit 0
```

---

### PostToolUse

**Esecuzione**: Dopo che Claude ha eseguito un tool.

**Matcher**: Nome del tool (regex)

**Variabili ambiente**:
- `$CLAUDE_FILE_PATHS` - Percorsi dei file modificati (per Write/Edit)
- `$CLAUDE_TOOL_INPUT` - JSON con l'input del tool

#### Casi d'uso

**1. Auto-format dopo modifiche**
```bash
#!/bin/sh
# Formatta automaticamente i file modificati
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  for file in $CLAUDE_FILE_PATHS; do
    if echo "$file" | grep -qE '\.(js|ts|jsx|tsx|json|css|md)$'; then
      npx prettier --write "$file"
    fi
  done
fi

exit 0
```

**2. Lint automatico**
```bash
#!/bin/sh
# Esegui lint sui file modificati
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  js_files=$(echo "$CLAUDE_FILE_PATHS" | tr ' ' '\n' | grep -E '\.(js|ts|jsx|tsx)$')

  if [ -n "$js_files" ]; then
    echo "$js_files" | xargs npx eslint --fix
  fi
fi

exit 0
```

**3. Aggiornare indice di ricerca**
```bash
#!/bin/sh
# Aggiorna indice ctags dopo modifiche
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  ctags -a $CLAUDE_FILE_PATHS 2>/dev/null
fi

exit 0
```

**4. Notifica modifiche**
```bash
#!/bin/sh
# Notifica desktop quando Claude modifica file
if [ -n "$CLAUDE_FILE_PATHS" ]; then
  count=$(echo "$CLAUDE_FILE_PATHS" | wc -w)
  notify-send "Claude" "Modified $count file(s)"
fi

exit 0
```

---

### Notification

**Esecuzione**: Quando Claude invia una notifica.

**Matcher**: Tipo di notifica

**Variabili ambiente**:
- `$CLAUDE_NOTIFICATION` - Testo della notifica

#### Casi d'uso

**1. Notifica desktop**
```bash
#!/bin/sh
# Mostra notifiche di Claude come notifiche desktop
if [ -n "$CLAUDE_NOTIFICATION" ]; then
  notify-send "Claude" "$CLAUDE_NOTIFICATION"
fi

exit 0
```

**2. Log notifiche**
```bash
#!/bin/sh
# Log delle notifiche
echo "$(date): $CLAUDE_NOTIFICATION" >> ~/.claude-notifications.log
exit 0
```

---

### Stop

**Esecuzione**: Quando Claude finisce di rispondere.

**Matcher**: Nessuno

#### Casi d'uso

**1. Notifica completamento**
```bash
#!/bin/sh
# Suono di notifica
paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null

# O notifica desktop
notify-send "Claude" "Response completed"

exit 0
```

**2. Log sessione**
```bash
#!/bin/sh
# Log fine sessione
echo "$(date): Session completed" >> ~/.claude-sessions.log
exit 0
```

---

### SubagentStop

**Esecuzione**: Quando un subagent di Claude termina.

**Matcher**: Nessuno

#### Casi d'uso

**1. Notifica subagent**
```bash
#!/bin/sh
notify-send "Claude" "Subagent task completed"
exit 0
```

---

## Best Practices

### Generali

1. **Exit codes corretti**: Usa `exit 0` per successo, `exit 1` per fallimento
2. **Messaggi chiari**: Fornisci messaggi di errore descrittivi
3. **Performance**: Gli hook pre-commit/pre-push devono essere veloci
4. **Idempotenza**: Gli hook devono essere sicuri da eseguire multiple volte
5. **Portabilità**: Usa `#!/bin/sh` per massima compatibilità

### Sicurezza

1. **Non fidarti dell'input**: Valida sempre i dati in ingresso
2. **Evita eval**: Non usare `eval` con input utente
3. **Permessi minimi**: Gli hook server-side devono avere permessi limitati
4. **Audit**: Log delle operazioni sensibili

### Struttura consigliata

```bash
#!/bin/sh
# Nome: pre-commit
# Descrizione: Validazione codice prima del commit
# Autore: Team Name
# Versione: 1.0.0

set -e  # Exit on error

# Configurazione
MAX_FILE_SIZE=5242880
PROTECTED_FILES="\.env|secrets"

# Funzioni
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

### Testing hook

```bash
# Test pre-commit hook manualmente
.git/hooks/pre-commit

# Test con file specifici
git stash
git add file.js
.git/hooks/pre-commit
git stash pop

# Skip hook temporaneamente
git commit --no-verify -m "Emergency fix"
```

---

## Appendice: Quick Reference

| Hook | Quando | Può bloccare | Argomenti principali |
|------|--------|--------------|---------------------|
| pre-commit | Prima del commit | Sì | - |
| prepare-commit-msg | Prima dell'editor | Sì | $1=file msg |
| commit-msg | Dopo l'editor | Sì | $1=file msg |
| post-commit | Dopo il commit | No | - |
| pre-merge-commit | Prima del merge | Sì | - |
| pre-push | Prima del push | Sì | $1=remote, $2=url |
| pre-rebase | Prima del rebase | Sì | $1=upstream, $2=branch |
| post-checkout | Dopo checkout | No | $1=old, $2=new, $3=flag |
| post-merge | Dopo merge | No | $1=squash flag |
| post-rewrite | Dopo amend/rebase | No | $1=command |
| pre-receive | Server: prima update | Sì | stdin |
| update | Server: per ref | Sì | $1=ref, $2=old, $3=new |
| post-receive | Server: dopo update | No | stdin |
| PreToolUse | Claude: prima tool | Sì | $CLAUDE_TOOL_INPUT |
| PostToolUse | Claude: dopo tool | No | $CLAUDE_FILE_PATHS |
| Notification | Claude: notifica | No | $CLAUDE_NOTIFICATION |
| Stop | Claude: fine risposta | No | - |
| SubagentStop | Claude: fine subagent | No | - |
