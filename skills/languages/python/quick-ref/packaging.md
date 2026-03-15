# Python Packaging Quick Reference

> **Knowledge Base:** Read `knowledge/python/packaging.md` for complete documentation.
> **Full Reference:** See [python-packaging skill](../../../infrastructure/python-packaging/SKILL.md) for complete guide.

## uv (Recommended)

```bash
# Install
curl -LsSf https://astral.sh/uv/install.sh | sh

# New project
uv init my-project && cd my-project

# Add dependencies
uv add fastapi pydantic
uv add --dev pytest ruff

# Run
uv run python main.py
uv run pytest

# Sync from lock
uv sync
```

## pyproject.toml (PEP 621)

```toml
[project]
name = "my-project"
version = "1.0.0"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.115.0",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "ruff>=0.14"]

[project.scripts]
my-cli = "my_project.cli:main"
```

## Virtual Environments

```bash
# uv
uv venv && source .venv/bin/activate

# stdlib
python -m venv .venv && source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

## Poetry (Alternative)

```bash
poetry init
poetry add fastapi
poetry add --group dev pytest
poetry run python main.py
```

## Version Specifiers

```
package==1.2.3     # Exact
package>=1.2.0     # Minimum (apps)
package>=1.2,<2.0  # Range (libs)
package~=1.2       # Compatible (~>=1.2,<2.0)
```

## Commands Comparison

| Task | uv | Poetry | pip |
|------|-----|--------|-----|
| Install all | `uv sync` | `poetry install` | `pip install -r requirements.txt` |
| Add dep | `uv add pkg` | `poetry add pkg` | Edit + pip install |
| Dev dep | `uv add --dev pkg` | `poetry add -G dev pkg` | N/A |
| Run | `uv run cmd` | `poetry run cmd` | Activate + cmd |
| Lock | `uv lock` | `poetry lock` | `pip-compile` |

**Official docs:** https://docs.astral.sh/uv/
