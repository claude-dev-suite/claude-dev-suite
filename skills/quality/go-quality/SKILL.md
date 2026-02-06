---
name: go-quality
description: |
  Go code quality with golangci-lint, staticcheck, and go vet.
  Covers linting, formatting, and best practices.

  USE WHEN: user works with "Go", "Golang", "Gin", "Fiber", "Echo", asks about "golangci-lint", "staticcheck", "go vet", "Go linting", "Go best practices"

  DO NOT USE FOR: SonarQube - use `sonarqube` skill, testing - use Go test skills, security - use `go-security` skill
allowed-tools: Read, Grep, Glob, Bash
---
# Go Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube setup** - Use `sonarqube` skill
- **Security scanning** - Use `go-security` skill
- **Testing** - Use Go testing skills

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `go` for comprehensive documentation.

## Tool Overview

| Tool | Focus | Included In |
|------|-------|-------------|
| **go fmt** | Formatting | Go toolchain |
| **go vet** | Bug detection | Go toolchain |
| **staticcheck** | Advanced analysis | golangci-lint |
| **golangci-lint** | Meta-linter | Standalone |
| **gofumpt** | Stricter formatting | golangci-lint |

**Recommendation**: Use golangci-lint - it runs 100+ linters in parallel.

## golangci-lint Setup

### Installation

```bash
# Binary installation (recommended)
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.56.0

# Go install
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# macOS
brew install golangci-lint
```

### .golangci.yml

```yaml
run:
  timeout: 5m
  tests: true
  go: "1.22"

linters:
  enable:
    # Bugs
    - bodyclose
    - durationcheck
    - errcheck
    - exportloopref
    - gosec
    - nilerr
    - sqlclosecheck

    # Performance
    - prealloc

    # Style
    - gofumpt
    - goimports
    - misspell

    # Complexity
    - cyclop
    - gocognit
    - gocyclo
    - funlen
    - nestif

    # Best Practices
    - goconst
    - gocritic
    - godot
    - ineffassign
    - revive
    - staticcheck
    - unconvert
    - unparam
    - unused

linters-settings:
  cyclop:
    max-complexity: 10

  gocognit:
    min-complexity: 15

  gocyclo:
    min-complexity: 10

  funlen:
    lines: 60
    statements: 40

  nestif:
    min-complexity: 4

  goconst:
    min-len: 3
    min-occurrences: 3

  gocritic:
    enabled-tags:
      - diagnostic
      - style
      - performance
    disabled-checks:
      - hugeParam

  revive:
    rules:
      - name: blank-imports
      - name: context-as-argument
      - name: context-keys-type
      - name: dot-imports
      - name: error-naming
      - name: error-return
      - name: error-strings
      - name: exported
      - name: increment-decrement
      - name: indent-error-flow
      - name: package-comments
      - name: range
      - name: receiver-naming
      - name: time-naming
      - name: unexported-return
      - name: var-declaration
      - name: var-naming

issues:
  exclude-rules:
    # Exclude some linters from tests
    - path: _test\.go
      linters:
        - funlen
        - gocognit

    # Exclude generated files
    - path: \.pb\.go
      linters:
        - all

  max-same-issues: 0
  max-issues-per-linter: 0
```

### Commands

```bash
# Run all linters
golangci-lint run

# Run on specific path
golangci-lint run ./pkg/...

# Fix auto-fixable issues
golangci-lint run --fix

# Show enabled linters
golangci-lint linters

# Run specific linter
golangci-lint run --enable=gosec --disable-all

# Verbose output
golangci-lint run -v
```

## Built-in Go Tools

### go fmt / gofmt

```bash
# Format file
go fmt ./...

# Check without changing
gofmt -l .

# Simplify code
gofmt -s -w .
```

### go vet

```bash
# Run vet
go vet ./...

# Specific checks
go vet -printf ./...
```

### gofumpt (Stricter Formatting)

```bash
# Install
go install mvdan.cc/gofumpt@latest

# Format
gofumpt -w .
```

## Common Linter Errors

### errcheck - Unhandled Errors

```go
// BAD - Error ignored
file, _ := os.Open("file.txt")

// GOOD - Error handled
file, err := os.Open("file.txt")
if err != nil {
    return fmt.Errorf("failed to open file: %w", err)
}
defer file.Close()
```

### bodyclose - Unclosed Response Body

```go
// BAD - Body not closed
resp, err := http.Get(url)
if err != nil {
    return err
}
data, _ := io.ReadAll(resp.Body)

// GOOD - Body closed
resp, err := http.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close()
data, err := io.ReadAll(resp.Body)
```

### gosec - Security Issues

```go
// BAD - Hardcoded credentials (G101)
const password = "secret123"

// GOOD - Environment variable
password := os.Getenv("DB_PASSWORD")
if password == "" {
    return errors.New("DB_PASSWORD not set")
}
```

### ineffassign - Ineffective Assignment

```go
// BAD - Assignment overwritten
x := 5
x = 10  // Previous value never used

// GOOD - Remove or use
x := 10
```

### cyclop/gocyclo - High Complexity

```go
// BAD - Complex function
func process(data Data) error {
    if data.Type == "A" {
        if data.Status == "active" {
            if data.Value > 0 {
                // deep nesting
            }
        }
    }
    // ... many more conditions
}

// GOOD - Extract and simplify
func process(data Data) error {
    if !data.isValid() {
        return ErrInvalidData
    }

    switch data.Type {
    case "A":
        return processTypeA(data)
    case "B":
        return processTypeB(data)
    default:
        return ErrUnknownType
    }
}
```

## Common Code Smells & Fixes

### 1. Error Handling

```go
// BAD - Ignoring errors
data, _ := json.Marshal(obj)

// BAD - Generic error message
if err != nil {
    return errors.New("error occurred")
}

// GOOD - Wrap with context
data, err := json.Marshal(obj)
if err != nil {
    return fmt.Errorf("failed to marshal user %d: %w", user.ID, err)
}
```

### 2. Context Propagation

```go
// BAD - No context
func fetchUser(id int) (*User, error) {
    return db.Query("SELECT * FROM users WHERE id = ?", id)
}

// GOOD - Context first parameter
func fetchUser(ctx context.Context, id int) (*User, error) {
    return db.QueryContext(ctx, "SELECT * FROM users WHERE id = ?", id)
}
```

### 3. Interface Pollution

```go
// BAD - Interface with many methods
type UserService interface {
    GetUser(id int) (*User, error)
    CreateUser(u *User) error
    UpdateUser(u *User) error
    DeleteUser(id int) error
    ListUsers() ([]*User, error)
    SearchUsers(q string) ([]*User, error)
    // ... 10 more methods
}

// GOOD - Small, focused interfaces
type UserGetter interface {
    GetUser(ctx context.Context, id int) (*User, error)
}

type UserCreator interface {
    CreateUser(ctx context.Context, u *User) error
}

// Compose when needed
type UserService interface {
    UserGetter
    UserCreator
}
```

### 4. Package Structure

```go
// BAD - God package
package app

func CreateUser() {}
func CreateOrder() {}
func SendEmail() {}
func GeneratePDF() {}

// GOOD - Focused packages
// user/service.go
package user
func Create(ctx context.Context, u *User) error {}

// order/service.go
package order
func Create(ctx context.Context, o *Order) error {}
```

### 5. Receiver Naming

```go
// BAD - Long receiver names
func (userService *UserService) GetUser(id int) {}
func (this *UserService) CreateUser(u *User) {}

// GOOD - Short, consistent names
func (s *UserService) GetUser(id int) {}
func (s *UserService) CreateUser(u *User) {}

// Or even shorter for simple types
func (u *User) FullName() string {}
```

## Pre-commit Setup

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/golangci/golangci-lint
    rev: v1.56.0
    hooks:
      - id: golangci-lint

  - repo: local
    hooks:
      - id: go-fmt
        name: go fmt
        entry: gofmt -w
        language: system
        types: [go]

      - id: go-vet
        name: go vet
        entry: go vet ./...
        language: system
        types: [go]
        pass_filenames: false
```

## Makefile

```makefile
.PHONY: lint fmt vet test quality

lint:
	golangci-lint run

fmt:
	gofumpt -w .

vet:
	go vet ./...

test:
	go test -race -cover ./...

quality: fmt vet lint test
```

## VS Code Settings

```json
// .vscode/settings.json
{
  "go.lintTool": "golangci-lint",
  "go.lintFlags": ["--fast"],
  "go.formatTool": "gofumpt",
  "[go]": {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },
  "gopls": {
    "staticcheck": true,
    "analyses": {
      "unusedparams": true,
      "shadow": true
    }
  }
}
```

## Quality Metrics Targets

| Metric | Target | Linter |
|--------|--------|--------|
| Cyclomatic Complexity | < 10 | cyclop, gocyclo |
| Cognitive Complexity | < 15 | gocognit |
| Function Lines | < 60 | funlen |
| Nesting Depth | < 4 | nestif |
| Test Coverage | > 80% | go test |

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: "1.22"

      - name: golangci-lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: v1.56.0

      - name: Run tests
        run: go test -race -coverprofile=coverage.txt ./...

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage.txt
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `_ = err` (ignoring) | Hides failures | Handle or log errors |
| No context in functions | Can't cancel/timeout | Pass context as first param |
| Giant interfaces | Hard to mock/test | Small, focused interfaces |
| Package-level vars | Global state | Dependency injection |
| `//nolint` without reason | Hides issues | Add comment explaining why |
| init() abuse | Hidden initialization | Explicit setup functions |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| golangci-lint timeout | Too many linters | Increase timeout or use `--fast` |
| Conflicting linter rules | Multiple formatters | Disable duplicates |
| False positive | Linter bug or edge case | Add `//nolint:linter` with comment |
| Missing go.sum entries | Incomplete module | Run `go mod tidy` |
| Import grouping wrong | goimports config | Configure in `.golangci.yml` |

## Related Skills
- [SonarQube](../sonarqube/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
- [Go Security](../../security/go-security/SKILL.md)
