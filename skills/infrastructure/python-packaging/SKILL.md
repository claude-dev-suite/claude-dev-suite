---
name: python-packaging
description: |
  Python package management with uv, poetry, PDM, and pyproject.toml.

  USE WHEN: "uv", "poetry", "pdm", "dependencies", "virtual environment",
  "pyproject.toml", "pip", "package management", "lockfile", "venv",
  "pip install", "requirements.txt", "pip freeze"

  DO NOT USE FOR: pip commands for running installed tools (use Bash)
  DO NOT USE FOR: conda/mamba environments - different ecosystem
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Python Packaging

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python` topic: `packaging` for complete documentation.

## Tool Comparison (2026)

| Tool | Speed | Lock Files | PEP 621 | Best For |
|------|-------|------------|---------|----------|
| **uv** | Fastest (10-100x pip) | Yes | Full | New projects, speed |
| Poetry | Good | Yes (strong) | Partial | Complex deps |
| PDM | Fast (can use uv) | Yes | Full | Standards compliance |
| pip | Baseline | No | N/A | Basic installation |

**Recommendation**: Use **uv** for new projects.

## uv Quick Start

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Create project
uv init my-project
cd my-project

# Add dependencies
uv add fastapi pydantic
uv add --dev pytest ruff mypy

# Run commands
uv run python main.py
uv run pytest

# Sync dependencies from lock
uv sync
```

### uv Commands Cheatsheet

| Command | Description |
|---------|-------------|
| `uv init` | Create new project |
| `uv add <pkg>` | Add dependency |
| `uv add --dev <pkg>` | Add dev dependency |
| `uv remove <pkg>` | Remove dependency |
| `uv sync` | Install from lockfile |
| `uv lock` | Update lockfile |
| `uv run <cmd>` | Run in venv |
| `uv pip install` | pip-compatible install |
| `uv python install 3.12` | Install Python version |
| `uv tool install ruff` | Install global tool |
| `uvx ruff check .` | Run tool without install |

## pyproject.toml (PEP 621)

```toml
[project]
name = "my-project"
version = "1.0.0"
description = "Project description"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.10"
authors = [
    {name = "Your Name", email = "you@example.com"}
]

dependencies = [
    "fastapi>=0.115.0",
    "pydantic>=2.0",
    "sqlalchemy>=2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-cov>=4.0",
    "ruff>=0.14",
    "mypy>=1.0",
]

[project.scripts]
my-cli = "my_project.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "ruff>=0.14",
]
```

## Virtual Environments

```bash
# uv (recommended)
uv venv
source .venv/bin/activate  # Unix
.venv\Scripts\activate     # Windows

# Standard library
python -m venv .venv
source .venv/bin/activate

# Check active environment
which python  # Unix
where python  # Windows
```

## Poetry (Alternative)

```bash
# Install
curl -sSL https://install.python-poetry.org | python3 -

# Create project
poetry new my-project
poetry init  # In existing directory

# Add dependencies
poetry add fastapi
poetry add --group dev pytest

# Run commands
poetry run python main.py
poetry shell  # Activate venv

# Install from lock
poetry install
```

### Poetry pyproject.toml

```toml
[tool.poetry]
name = "my-project"
version = "1.0.0"
description = ""
authors = ["Your Name <you@example.com>"]

[tool.poetry.dependencies]
python = "^3.10"
fastapi = "^0.115.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
ruff = "^0.14"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

## Dependency Versioning

```toml
# Exact version
"package==1.2.3"

# Minimum version (recommended for apps)
"package>=1.2.0"

# Compatible release (recommended for libraries)
"package>=1.2,<2.0"
"package~=1.2"  # Same as >=1.2,<2.0

# Exclude versions
"package>=1.0,!=1.5.0"
```

## Lock Files

| Tool | Lock File | Purpose |
|------|-----------|---------|
| uv | `uv.lock` | Cross-platform, deterministic |
| Poetry | `poetry.lock` | Strong resolution |
| pip-tools | `requirements.lock` | Simple |

```bash
# Generate lock (uv)
uv lock

# Update all dependencies
uv lock --upgrade

# Update specific package
uv lock --upgrade-package fastapi
```

## Migration Guides

### From requirements.txt to uv

```bash
# In project with requirements.txt
uv init
uv add $(cat requirements.txt | grep -v "^#" | tr '\n' ' ')
rm requirements.txt
```

### From Poetry to uv

```bash
# Export from poetry
poetry export -f requirements.txt > requirements.txt

# Import to uv
uv init
uv add $(cat requirements.txt | cut -d'=' -f1 | tr '\n' ' ')
```

## Project Structure (src Layout)

```
my-project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── __main__.py
│       └── core.py
├── tests/
│   ├── __init__.py
│   └── test_core.py
├── pyproject.toml
├── uv.lock
└── README.md
```

**Benefits of src layout**:
- Tests run against installed package
- Prevents accidental imports from cwd
- Cleaner package distribution

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No lockfile | Non-reproducible builds | Always commit lockfile |
| `pip freeze > requirements.txt` | Includes transitive deps | Use proper tool (uv, poetry) |
| Global pip installs | Version conflicts | Always use virtual environments |
| Pinning to exact versions everywhere | Hard to update | Use ranges for libraries |
| Not separating dev dependencies | Bloated production | Use optional-dependencies or groups |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "No module found" | Not in venv | Activate venv or use `uv run` |
| Version conflicts | Incompatible deps | Check `uv pip compile --dry-run` |
| "Permission denied" | Global install attempt | Use virtual environment |
| Slow install | Using pip | Switch to uv |
| Lock file conflicts | Concurrent edits | Regenerate with `uv lock` |
