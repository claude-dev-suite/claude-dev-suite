---
name: python-quality
description: |
  Python static analysis with ruff, mypy, pyright. Type checking and linting best practices.

  USE WHEN: "type checking", "mypy", "pyright", "ruff", "linting", "static analysis",
  "type error", "type hints", "pylint", "flake8", "black", "isort", "code quality"

  DO NOT USE FOR: Basic type hint syntax - use languages/python skill
  DO NOT USE FOR: Runtime validation - use Pydantic
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Python Code Quality

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python` topic: `quality` for complete documentation.

## Tool Stack (2026)

| Tool | Purpose | Speed | Recommendation |
|------|---------|-------|----------------|
| **ruff** | Linting + Formatting | Fastest (10-100x) | Primary |
| **mypy** | Type checking | Good | CI gate |
| **pyright** | Type checking | Fast | IDE (Pylance) |
| **ty** | Type checking | Fastest | Emerging |

**Recommended setup**: ruff (lint/format) + pyright (IDE) + mypy (CI)

## ruff Configuration

```toml
# pyproject.toml
[tool.ruff]
line-length = 88
target-version = "py312"
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # Pyflakes
    "I",      # isort
    "B",      # flake8-bugbear
    "C4",     # flake8-comprehensions
    "UP",     # pyupgrade
    "ARG",    # flake8-unused-arguments
    "SIM",    # flake8-simplify
    "TCH",    # flake8-type-checking
    "S",      # flake8-bandit (security)
    "RUF",    # Ruff-specific rules
]
ignore = [
    "E501",   # line too long (formatter handles)
    "S101",   # assert usage (OK in tests)
]

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S101", "ARG"]
"__init__.py" = ["F401"]

[tool.ruff.lint.isort]
known-first-party = ["my_package"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```

### ruff Commands

```bash
# Lint
ruff check .
ruff check --fix .          # Auto-fix

# Format
ruff format .
ruff format --check .       # Check only

# Combined (CI)
ruff check . && ruff format --check .
```

## mypy Configuration

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true
show_error_codes = true
enable_error_code = ["ignore-without-code", "truthy-bool"]

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[[tool.mypy.overrides]]
module = ["third_party_lib.*"]
ignore_missing_imports = true
```

### mypy Commands

```bash
# Check
mypy src/
mypy src/ --strict

# Daemon mode (faster)
dmypy run -- src/

# Generate stubs
stubgen -p my_package -o stubs/
```

## pyright Configuration

```json
// pyrightconfig.json
{
  "include": ["src"],
  "exclude": ["**/node_modules", "**/__pycache__"],
  "typeCheckingMode": "strict",
  "pythonVersion": "3.12",
  "reportMissingImports": true,
  "reportMissingTypeStubs": false,
  "reportUnusedImport": true,
  "reportUnusedVariable": true
}
```

Or in pyproject.toml:
```toml
[tool.pyright]
include = ["src"]
typeCheckingMode = "strict"
pythonVersion = "3.12"
```

## Common Type Errors & Solutions

### Missing return type

```python
# Error: Function is missing a return type annotation
def greet(name: str):  # Bad
    return f"Hello {name}"

def greet(name: str) -> str:  # Good
    return f"Hello {name}"
```

### Optional handling

```python
# Error: "None" is not compatible with "str"
def get_name(user: User | None) -> str:
    return user.name  # Bad - user might be None

def get_name(user: User | None) -> str:
    if user is None:
        return "Unknown"
    return user.name  # Good - narrowed to User
```

### Type narrowing

```python
from typing import TypeGuard

def is_string_list(val: list[object]) -> TypeGuard[list[str]]:
    return all(isinstance(x, str) for x in val)

def process(items: list[object]) -> None:
    if is_string_list(items):
        # items is now list[str]
        print(items[0].upper())
```

### Callable types

```python
from collections.abc import Callable

# Function type
Handler = Callable[[str, int], bool]

def process(handler: Handler) -> None:
    result = handler("test", 42)
```

### Generic variance

```python
from typing import TypeVar

# Invariant (default)
T = TypeVar("T")

# Covariant (read-only)
T_co = TypeVar("T_co", covariant=True)

# Contravariant (write-only)
T_contra = TypeVar("T_contra", contravariant=True)
```

## Strict Mode Migration

### Phase 1: Basic types
```toml
[tool.mypy]
check_untyped_defs = true
```

### Phase 2: Require annotations
```toml
[tool.mypy]
disallow_untyped_defs = true
disallow_incomplete_defs = true
```

### Phase 3: Full strict
```toml
[tool.mypy]
strict = true
```

### Per-module migration
```toml
[[tool.mypy.overrides]]
module = "legacy_module.*"
disallow_untyped_defs = false
```

## CI/CD Integration

```yaml
# GitHub Actions
name: Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Install dependencies
        run: uv sync

      - name: Lint
        run: uv run ruff check .

      - name: Format check
        run: uv run ruff format --check .

      - name: Type check
        run: uv run mypy src/
```

## Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.14.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
```

```bash
# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Type Stubs

```bash
# Install type stubs
uv add --dev types-requests types-redis

# Common stubs packages
# types-requests, types-redis, types-PyYAML
# types-python-dateutil, types-setuptools
```

## Quality Metrics

| Metric | Target | Tool |
|--------|--------|------|
| ruff violations | 0 | `ruff check` |
| mypy errors | 0 | `mypy --strict` |
| Type coverage | 100% | mypy reports |
| Cyclomatic complexity | <10 | `ruff --select=C901` |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| `# type: ignore` without code | Silences all errors | Use `# type: ignore[error-code]` |
| `Any` everywhere | No type safety | Use proper types or generics |
| Ignoring mypy in CI | Regressions slip in | Make it a required check |
| Not using `--strict` | Missing errors | Enable progressively |
| Manual formatting | Inconsistent, slow | Use ruff format |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Module has no attribute" | Missing stubs | Install types-* package |
| "Incompatible types" | Type mismatch | Check expected vs actual type |
| "Cannot infer type" | Complex expression | Add explicit annotation |
| "Unused ignore" | Fixed error | Remove the ignore comment |
| ruff/mypy disagree | Different rules | Configure both consistently |
