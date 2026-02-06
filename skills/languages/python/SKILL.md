---
name: python
description: |
  Python language (3.10-3.14). Covers typing, async, and modern patterns.
  Use when writing Python applications.

  USE WHEN: user mentions "python", "type hints", "dataclasses", "async/await",
  asks about "asyncio", "context managers", "match statement", "walrus operator",
  "PEP 695", "type parameter", "generic"

  DO NOT USE FOR: FastAPI framework - use `backend-fastapi` skill instead
  DO NOT USE FOR: Django framework - use Django-specific skill
  DO NOT USE FOR: Package management - use `python-packaging` skill
  DO NOT USE FOR: Linting/type checking config - use `python-quality` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Python Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for production patterns: Result types, custom exceptions, structured logging, Pydantic validation, testing patterns, performance optimization, and dependency injection.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python` for comprehensive documentation.

## Python Version Support

| Version | Status | Key Features |
|---------|--------|--------------|
| 3.14 | Current | Type defaults, JIT improvements |
| 3.13 | Stable | Free-threading (experimental), JIT |
| 3.12 | Stable | **PEP 695** type syntax, f-string improvements |
| 3.11 | Stable | Exception groups, 10-60% faster |
| 3.10 | Security | Pattern matching, `\|` union |

## Type Hints (Modern Syntax)

```python
# Python 3.10+ - Use | instead of Union
def greet(name: str | None = None) -> str:
    return f"Hello, {name or 'World'}"

# Python 3.9+ - Use built-in generics
def process(items: list[str]) -> dict[str, int]:
    return {item: len(item) for item in items}

# Python 3.12+ - PEP 695 Type Parameter Syntax
def first[T](items: list[T]) -> T | None:
    return items[0] if items else None

class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

# Type aliases (Python 3.12+)
type Point = tuple[float, float]
type Vector[T] = list[T]
type Handler[T] = Callable[[T], None]

# Callable
def apply(fn: Callable[[int], int], value: int) -> int:
    return fn(value)
```

## Dataclasses

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class User:
    id: int
    name: str
    email: str
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True

    def __post_init__(self):
        self.email = self.email.lower()

# Frozen (immutable)
@dataclass(frozen=True)
class Point:
    x: float
    y: float

# Slots for memory efficiency (Python 3.10+)
@dataclass(slots=True)
class Optimized:
    value: int
```

## Async/Await

```python
import asyncio
import aiohttp

async def fetch_user(id: int) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(f'/api/users/{id}') as response:
            return await response.json()

async def fetch_all_users(ids: List[int]) -> List[dict]:
    tasks = [fetch_user(id) for id in ids]
    return await asyncio.gather(*tasks)

# Run
asyncio.run(fetch_all_users([1, 2, 3]))
```

## Context Managers

```python
from contextlib import contextmanager, asynccontextmanager

@contextmanager
def timer():
    start = time.time()
    yield
    print(f"Elapsed: {time.time() - start:.2f}s")

with timer():
    process_data()

@asynccontextmanager
async def get_db():
    db = await create_connection()
    try:
        yield db
    finally:
        await db.close()
```

## Modern Patterns

```python
# Match (3.10+)
match status:
    case "active":
        handle_active()
    case "inactive" | "pending":
        handle_pending()
    case {"type": "user", "name": name}:  # Dict pattern
        handle_user(name)
    case [first, *rest]:  # Sequence pattern
        handle_sequence(first, rest)
    case _:
        handle_default()

# Walrus operator
if (n := len(items)) > 10:
    print(f"Too many: {n}")

# Exception groups (3.11+)
try:
    async with asyncio.TaskGroup() as tg:
        tg.create_task(task1())
        tg.create_task(task2())
except* ValueError as eg:
    for exc in eg.exceptions:
        print(f"ValueError: {exc}")
except* TypeError as eg:
    for exc in eg.exceptions:
        print(f"TypeError: {exc}")
```

## Static Analysis & Linting

### Official Rules References

| Tool | Rules Count | Documentation |
|------|-------------|---------------|
| **Ruff** | 800+ | https://docs.astral.sh/ruff/rules/ |
| **SonarPython** | 300+ | https://rules.sonarsource.com/python/ |
| **Pylint** | 200+ | https://pylint.readthedocs.io/en/latest/user_guide/messages/messages_overview.html |
| **Mypy** | Type checker | https://mypy.readthedocs.io/en/stable/error_codes.html |

### Style Guides

| Guide | Link |
|-------|------|
| **PEP 8** | https://peps.python.org/pep-0008/ |
| **PEP 20 (Zen)** | https://peps.python.org/pep-0020/ |
| **Google Python Style** | https://google.github.io/styleguide/pyguide.html |

### Ruff Configuration

```toml
# pyproject.toml
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # Pyflakes
    "I",    # isort
    "B",    # flake8-bugbear
    "C4",   # flake8-comprehensions
    "UP",   # pyupgrade
    "S",    # flake8-bandit (security)
]
ignore = ["E501"]  # line too long (handled by formatter)

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S101"]  # allow assert in tests
```

> **Full configuration guide**: See [python-quality skill](../../best-practices/python-quality/SKILL.md)

### Key Rules Categories

| Category | Rule Example | Tool |
|----------|--------------|------|
| Security | Hardcoded passwords | Ruff S105, SonarPython S2068 |
| Bug | Mutable default arg | Ruff B006 |
| Type Safety | Missing return type | Mypy |
| Style | Unused imports | Ruff F401 |
| Complexity | Too complex | Ruff C901 |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| FastAPI-specific features | `backend-fastapi` skill |
| Django framework | Django-specific skill |
| Testing frameworks | `testing-pytest` skill |
| Data science/ML | Data science skills |
| SQLAlchemy ORM | `orm-sqlalchemy` skill |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Mutable default arguments | Shared state across calls | Use None, create in function |
| Bare `except:` clauses | Catches system exits | Catch specific exceptions |
| Using `eval()` or `exec()` | Security risk, code injection | Use safer alternatives |
| Not using context managers | Resource leaks | Use `with` statement |
| Global variables everywhere | Hard to test, maintain | Pass as parameters |
| Mixing sync and async code | Deadlocks, blocking | Use proper async patterns |
| Not using type hints | Hard to maintain | Add type annotations |
| String concatenation in loops | O(n²) complexity | Use join() or f-strings |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "NameError: name 'X' is not defined" | Variable not declared | Check spelling, imports |
| "AttributeError: object has no attribute" | Wrong type or missing attr | Check type, use hasattr() |
| "TypeError: X() takes N positional arguments" | Wrong arg count | Check function signature |
| "ModuleNotFoundError: No module named" | Missing dependency | Install with pip |
| "IndentationError" | Mixed tabs/spaces | Use consistent indentation |
| "RuntimeError: Event loop is closed" | Async misuse | Use asyncio.run() properly |
| "RecursionError: maximum recursion depth" | Infinite recursion | Add base case, use iteration |
| Memory leak with async | Tasks not awaited | Await all tasks or use gather |

## Reference Documentation
- [Typing](quick-ref/typing.md) - Type hints, generics, PEP 695
- [Async](quick-ref/async.md) - asyncio, TaskGroup, patterns
- [CLI](quick-ref/cli.md) - Typer, Click, Rich
- [Packaging](quick-ref/packaging.md) - uv, poetry, pyproject.toml
