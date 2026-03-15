---
name: ruff
description: |
  Ruff Python linter and formatter. Covers configuration in pyproject.toml,
  rule selection, auto-fix, and integration with editors and CI.
  Use when configuring or troubleshooting Python code quality tooling.

  USE WHEN: user mentions "ruff", "ruff check", "ruff format", "python linting",
  "pyproject.toml linting", "isort alternative", "black alternative",
  "flake8 replacement", "python formatter"

  DO NOT USE FOR: ESLint/Prettier (JavaScript), mypy type checking
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Ruff: Python Linter & Formatter

## Installation

```bash
pip install ruff>=0.4.0
# or
uv add --dev ruff
```

## CLI Usage

```bash
# Lint
ruff check .                    # check all Python files
ruff check src/ tests/          # specific directories
ruff check --fix .              # auto-fix fixable issues
ruff check --fix --unsafe-fixes . # also apply unsafe fixes

# Format
ruff format .                   # format all files
ruff format --check .           # check only (no write)
ruff format --diff .            # show diff

# Combined (typical workflow)
ruff check --fix . && ruff format .

# Check single file
ruff check src/main.py
```

## pyproject.toml Configuration

```toml
[tool.ruff]
line-length = 100
target-version = "py310"
# Directories to exclude
exclude = [
    ".git", ".venv", "__pycache__", "dist", "build",
    "*.egg-info", ".mypy_cache",
]

[tool.ruff.lint]
# Rule sets to enable
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes (undefined names, unused imports)
    "I",   # isort (import ordering)
    "B",   # bugbear (common bugs)
    "C4",  # flake8-comprehensions
    "UP",  # pyupgrade (modern Python syntax)
    "S",   # bandit (security)
    "RUF", # Ruff-specific rules
]

# Rules to ignore globally
ignore = [
    "E501",  # line too long (handled by formatter)
    "S101",  # assert statements (fine in tests)
    "B008",  # do not perform function calls in default args
]

# Per-file ignores
[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101", "S105", "S106"]  # allow assert + hardcoded passwords in tests
"scripts/**/*.py" = ["S603", "S607"]         # allow subprocess in scripts

[tool.ruff.lint.isort]
known-first-party = ["driftwire", "mypackage"]
force-sort-within-sections = true

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
skip-magic-trailing-comma = false
line-ending = "auto"
```

## Common Rule Sets

| Set | Code | What It Checks |
|-----|------|----------------|
| pycodestyle | E, W | PEP 8 style (spacing, indentation) |
| pyflakes | F | Undefined/unused names, imports |
| isort | I | Import order and grouping |
| bugbear | B | Common Python bugs and anti-patterns |
| pyupgrade | UP | Upgrade to modern Python syntax |
| flake8-comprehensions | C4 | Unnecessary comprehensions |
| bandit | S | Security vulnerabilities |
| flake8-simplify | SIM | Code simplification |
| McCabe complexity | C90 | Function complexity |
| Ruff-specific | RUF | Ruff's own rules |

## Frequently Needed Rules

```toml
# Ignore specific rules
[tool.ruff.lint]
ignore = [
    "E501",   # line length (let formatter handle it)
    "S101",   # assert usage
    "S603",   # subprocess without shell=True
    "S607",   # subprocess partial executable path
    "B904",   # raise ... from err (too strict sometimes)
    "UP007",  # use X | Y instead of Optional[X] (if on Python <3.10)
]
```

## Integration with pyproject.toml (full example for Python 3.10+ project)

```toml
[project]
name = "driftwire"
version = "0.1.0"
requires-python = ">=3.10"

[project.optional-dependencies]
dev = ["ruff>=0.4.0", "pytest>=8.0.0"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "C4", "UP", "RUF"]
ignore = ["E501", "B008"]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101"]

[tool.ruff.format]
quote-style = "double"
```

## Pre-commit Integration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```

## CI/CD (GitHub Actions)

```yaml
- name: Lint with ruff
  run: |
    pip install ruff
    ruff check . --output-format=github
    ruff format --check .
```

## Ruff vs Legacy Tools

| Old Tool | Ruff Equivalent | Notes |
|----------|----------------|-------|
| flake8 | `ruff check` | 10-100x faster |
| isort | `ruff check --select I` | Built-in |
| black | `ruff format` | Compatible formatting |
| bandit | `ruff check --select S` | Subset of bandit rules |
| pyupgrade | `ruff check --select UP` | Built-in |
| autoflake | `ruff check --select F401 --fix` | Remove unused imports |

## Quick Fixes Reference

```bash
# Remove unused imports
ruff check --select F401 --fix .

# Sort imports
ruff check --select I --fix .

# Upgrade old-style type hints (Optional[X] -> X | None)
ruff check --select UP007 --fix .

# All auto-fixable issues
ruff check --fix .
```

## noqa Comments

```python
import os  # noqa: F401          # ignore specific rule on this line
import sys  # noqa                # ignore all rules on this line

def f(x=datetime.now()):  # noqa: B008  # allow function call in default
    pass
```
