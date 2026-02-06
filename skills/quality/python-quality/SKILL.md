---
name: python-quality
description: |
  Python code quality with Ruff, Black, mypy, and Pylint.
  Covers linting, formatting, type checking, and best practices.

  USE WHEN: user works with "Python", "Django", "FastAPI", "Flask", asks about "Ruff", "Black", "mypy", "Pylint", "Python linting", "Python type hints"

  DO NOT USE FOR: SonarQube - use `sonarqube` skill, testing - use pytest skills, security - use `python-security` skill
allowed-tools: Read, Grep, Glob, Bash
---
# Python Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube setup** - Use `sonarqube` skill
- **pytest configuration** - Use pytest skills
- **Security scanning** - Use `python-security` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fastapi` or `django` for framework-specific patterns.

## Tool Overview

| Tool | Focus | Speed | Use Case |
|------|-------|-------|----------|
| **Ruff** | Linting + formatting | Fastest | All-in-one replacement |
| **Black** | Formatting only | Fast | Opinionated formatting |
| **mypy** | Type checking | Medium | Static type analysis |
| **Pylint** | Deep analysis | Slow | Comprehensive linting |
| **isort** | Import sorting | Fast | Import organization |

**Recommendation**: Use Ruff (replaces Black, isort, Flake8, and many Pylint rules).

## Ruff Setup (Recommended)

### Installation

```bash
pip install ruff

# Or with project
pip install "ruff>=0.3.0"
```

### pyproject.toml

```toml
[tool.ruff]
target-version = "py312"
line-length = 100
exclude = [".venv", "migrations", "__pycache__"]

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
    "PTH",    # flake8-use-pathlib
    "ERA",    # eradicate (commented code)
    "PL",     # Pylint
    "RUF",    # Ruff-specific
]
ignore = [
    "PLR0913",  # Too many arguments (configure separately)
    "PLR2004",  # Magic value comparison
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101"]  # Allow assert in tests

[tool.ruff.lint.pylint]
max-args = 5
max-branches = 10
max-returns = 3

[tool.ruff.lint.isort]
known-first-party = ["myapp"]
force-single-line = true

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true
```

### Commands

```bash
# Lint
ruff check .

# Fix auto-fixable
ruff check --fix .

# Format
ruff format .

# Check format without changing
ruff format --check .

# Watch mode
ruff check --watch .
```

## mypy Setup

### Installation

```bash
pip install mypy
```

### pyproject.toml

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_unreachable = true

# Per-module overrides
[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[[tool.mypy.overrides]]
module = "migrations.*"
ignore_errors = true
```

### Commands

```bash
# Type check
mypy src/

# Show error codes
mypy src/ --show-error-codes

# Generate stubs for library
stubgen -p some_library
```

### Common mypy Errors

| Error | Description | Fix |
|-------|-------------|-----|
| `[arg-type]` | Wrong argument type | Fix type or add annotation |
| `[return-value]` | Wrong return type | Fix return or annotation |
| `[assignment]` | Incompatible assignment | Fix type or use cast |
| `[no-untyped-def]` | Missing type annotations | Add annotations |
| `[union-attr]` | Optional access without check | Add None check |

## Pylint Setup (Optional - Deep Analysis)

### Installation

```bash
pip install pylint
```

### pyproject.toml

```toml
[tool.pylint.main]
py-version = "3.12"
jobs = 0  # Auto-detect CPU count
ignore-patterns = ["migrations", "__pycache__"]

[tool.pylint.messages_control]
disable = [
    "missing-module-docstring",
    "missing-class-docstring",
    "missing-function-docstring",
    "too-few-public-methods",
]

[tool.pylint.design]
max-args = 5
max-locals = 15
max-branches = 10
max-statements = 50
max-attributes = 10
max-public-methods = 20

[tool.pylint.format]
max-line-length = 100

[tool.pylint.similarities]
min-similarity-lines = 5
ignore-imports = true
```

### Commands

```bash
# Full check
pylint src/

# Specific file
pylint src/main.py

# Generate config
pylint --generate-rcfile > .pylintrc
```

## Type Hints Best Practices

### Basic Types

```python
from typing import Any

# Primitives
name: str = "John"
age: int = 30
active: bool = True
score: float = 95.5

# Collections
names: list[str] = ["Alice", "Bob"]
scores: dict[str, int] = {"Alice": 95, "Bob": 87}
unique_ids: set[int] = {1, 2, 3}
coordinates: tuple[float, float] = (1.0, 2.0)

# Optional (can be None)
middle_name: str | None = None

# Union types
identifier: str | int = "abc123"

# Any (avoid when possible)
data: Any = get_dynamic_data()
```

### Function Signatures

```python
from collections.abc import Callable, Iterable

def greet(name: str) -> str:
    return f"Hello, {name}"

def process_items(items: Iterable[int]) -> list[int]:
    return [item * 2 for item in items]

def apply_func(func: Callable[[int], int], value: int) -> int:
    return func(value)

# Generic functions
from typing import TypeVar

T = TypeVar("T")

def first(items: list[T]) -> T | None:
    return items[0] if items else None
```

### Classes

```python
from dataclasses import dataclass
from typing import Self

@dataclass
class User:
    id: int
    email: str
    name: str | None = None

    def with_name(self, name: str) -> Self:
        return User(id=self.id, email=self.email, name=name)
```

### Protocols (Structural Typing)

```python
from typing import Protocol

class Drawable(Protocol):
    def draw(self) -> None: ...

def render(item: Drawable) -> None:
    item.draw()

# Any class with draw() method works
class Circle:
    def draw(self) -> None:
        print("Drawing circle")

render(Circle())  # OK
```

## Common Code Smells & Fixes

### 1. Mutable Default Arguments

```python
# BAD - Mutable default
def append_to(item, target=[]):
    target.append(item)
    return target

# GOOD - Use None
def append_to(item: str, target: list[str] | None = None) -> list[str]:
    if target is None:
        target = []
    target.append(item)
    return target
```

### 2. Bare Except

```python
# BAD
try:
    do_something()
except:
    pass

# GOOD - Specific exceptions
try:
    do_something()
except ValueError as e:
    logger.warning(f"Invalid value: {e}")
except IOError as e:
    logger.error(f"IO error: {e}")
    raise
```

### 3. God Class

```python
# BAD
class OrderProcessor:
    def create_order(self): ...
    def send_email(self): ...
    def generate_pdf(self): ...
    def calculate_tax(self): ...
    def update_inventory(self): ...

# GOOD - Single responsibility
class OrderService:
    def __init__(
        self,
        email_service: EmailService,
        pdf_generator: PdfGenerator,
        tax_calculator: TaxCalculator,
    ):
        self._email = email_service
        self._pdf = pdf_generator
        self._tax = tax_calculator

    def create_order(self, request: OrderRequest) -> Order:
        order = self._build_order(request)
        order.tax = self._tax.calculate(order)
        return order
```

### 4. Long Functions

```python
# BAD - 100+ line function
def process_order(order):
    # validation
    # calculation
    # database
    # notifications
    pass

# GOOD - Extracted functions
def process_order(order: Order) -> ProcessedOrder:
    validate_order(order)
    total = calculate_total(order)
    saved = save_order(order, total)
    notify_user(saved)
    return saved
```

### 5. Magic Numbers

```python
# BAD
if user.age >= 18:
    if len(password) >= 8:
        pass

# GOOD - Named constants
MINIMUM_AGE = 18
MIN_PASSWORD_LENGTH = 8

if user.age >= MINIMUM_AGE:
    if len(password) >= MIN_PASSWORD_LENGTH:
        pass
```

## Pre-commit Setup

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies:
          - types-requests
          - pydantic
```

### Commands

```bash
# Install hooks
pre-commit install

# Run on all files
pre-commit run --all-files

# Update hooks
pre-commit autoupdate
```

## VS Code Settings

```json
// .vscode/settings.json
{
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "explicit",
      "source.organizeImports.ruff": "explicit"
    }
  },
  "python.analysis.typeCheckingMode": "strict",
  "mypy-type-checker.importStrategy": "fromEnvironment"
}
```

## Quality Metrics Targets

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | Ruff (PLR0912) |
| Cognitive Complexity | < 15 | Ruff (C901) |
| Function Length | < 50 lines | Ruff (PLR0915) |
| Arguments | < 5 | Ruff (PLR0913) |
| Returns | < 3 | Ruff (PLR0911) |
| Type Coverage | 100% | mypy |

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

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: |
          pip install ruff mypy
          pip install -e ".[dev]"

      - name: Ruff check
        run: ruff check .

      - name: Ruff format check
        run: ruff format --check .

      - name: mypy
        run: mypy src/
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `# type: ignore` everywhere | Defeats type checking | Fix types or be specific |
| `Any` overuse | No type safety | Use proper types or TypeVar |
| Mutable default args | Shared state bugs | Use `None` with check |
| Bare `except:` | Catches everything | Catch specific exceptions |
| `noqa` without code | Ignores all rules | Use `noqa: E501` specifically |
| No type hints | Hard to maintain | Add progressive typing |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| mypy can't find module | Missing stubs | Install `types-*` package |
| Ruff conflicts with Black | Both formatting | Use only Ruff format |
| Type error in library code | Library not typed | Add to mypy ignore list |
| Pre-commit too slow | Running all checks | Use `--files` for changed only |
| Import order conflicts | Multiple tools | Use only Ruff isort |

## Related Skills
- [SonarQube](../sonarqube/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
- [Python Security](../../security/python-security/SKILL.md)
