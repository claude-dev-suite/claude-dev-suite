# Python CLI Development

> **Knowledge Base:** Read `knowledge/python/cli.md` for complete documentation.

## Tool Comparison

| Tool | Type Hints | Completion | Best For |
|------|------------|------------|----------|
| **Typer** | Native | Auto | Modern CLIs |
| Click | Decorators | Manual | Complex CLIs |
| argparse | Manual | Manual | No dependencies |
| Rich | N/A | N/A | Beautiful output |

**Recommendation**: Typer + Rich

## Typer Quick Start

```python
import typer

app = typer.Typer()

@app.command()
def hello(name: str, count: int = 1):
    """Greet NAME, COUNT times."""
    for _ in range(count):
        print(f"Hello {name}!")

if __name__ == "__main__":
    app()
```

```bash
# Usage
python main.py hello World --count 3
python main.py --help
```

## Typer Arguments & Options

```python
from typing import Annotated
import typer

app = typer.Typer()

@app.command()
def process(
    # Required argument
    path: str,
    # Optional argument with default
    output: str = "output.txt",
    # Option with short flag
    verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False,
    # Option with prompt
    name: Annotated[str, typer.Option(prompt=True)] = ...,
    # Option with env var
    token: Annotated[str, typer.Option(envvar="API_TOKEN")] = "",
):
    if verbose:
        print(f"Processing {path}")
    # ...
```

## Multiple Commands

```python
import typer

app = typer.Typer()

@app.command()
def create(name: str):
    """Create a new item."""
    print(f"Creating {name}")

@app.command()
def delete(name: str, force: bool = False):
    """Delete an item."""
    if force or typer.confirm(f"Delete {name}?"):
        print(f"Deleted {name}")

@app.command()
def list():
    """List all items."""
    print("Items: a, b, c")

if __name__ == "__main__":
    app()
```

```bash
python main.py create foo
python main.py delete foo --force
python main.py list
```

## Subcommands (Groups)

```python
import typer

app = typer.Typer()
users_app = typer.Typer()
app.add_typer(users_app, name="users")

@users_app.command("list")
def list_users():
    print("Listing users...")

@users_app.command("create")
def create_user(name: str):
    print(f"Creating user {name}")
```

```bash
python main.py users list
python main.py users create john
```

## Rich Integration

```python
import typer
from rich.console import Console
from rich.table import Table
from rich.progress import track
from rich import print as rprint

console = Console()

@app.command()
def show_table():
    table = Table(title="Users")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="green")
    table.add_row("1", "Alice")
    table.add_row("2", "Bob")
    console.print(table)

@app.command()
def process_items():
    for item in track(range(100), description="Processing..."):
        # do work
        pass

@app.command()
def styled_output():
    rprint("[bold green]Success![/bold green]")
    rprint("[red]Error:[/red] Something went wrong")
    console.print("Info", style="blue")
```

## Rich Output Patterns

```python
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.tree import Tree

console = Console()

# Panel
console.print(Panel("Hello World", title="Greeting"))

# Syntax highlighting
code = '''def hello():
    print("Hello")'''
console.print(Syntax(code, "python", theme="monokai"))

# Tree
tree = Tree("Root")
tree.add("Child 1").add("Grandchild")
tree.add("Child 2")
console.print(tree)

# Status spinner
with console.status("Working..."):
    # long operation
    pass
```

## Error Handling

```python
import typer
from typing import NoReturn

def error_exit(message: str) -> NoReturn:
    typer.echo(typer.style(f"Error: {message}", fg=typer.colors.RED))
    raise typer.Exit(code=1)

@app.command()
def process(path: str):
    if not Path(path).exists():
        error_exit(f"File not found: {path}")
    # continue processing
```

## Async Commands

```python
import asyncio
import typer

app = typer.Typer()

async def async_task(name: str) -> str:
    await asyncio.sleep(1)
    return f"Hello {name}"

@app.command()
def greet(name: str):
    result = asyncio.run(async_task(name))
    print(result)
```

## Testing CLI

```python
from typer.testing import CliRunner
from myapp.cli import app

runner = CliRunner()

def test_hello():
    result = runner.invoke(app, ["hello", "World"])
    assert result.exit_code == 0
    assert "Hello World" in result.stdout

def test_hello_with_count():
    result = runner.invoke(app, ["hello", "World", "--count", "3"])
    assert result.stdout.count("Hello World") == 3
```

## Click (Alternative)

```python
import click

@click.group()
def cli():
    """My CLI application."""
    pass

@cli.command()
@click.argument("name")
@click.option("--count", "-c", default=1, help="Number of greetings")
def hello(name: str, count: int):
    """Greet NAME."""
    for _ in range(count):
        click.echo(f"Hello {name}!")

if __name__ == "__main__":
    cli()
```

## Packaging CLI

```toml
# pyproject.toml
[project.scripts]
my-cli = "my_package.cli:app"
```

```bash
# After install
my-cli hello World
my-cli --help
```

## Best Practices

| Do | Don't |
|----|-------|
| Use Annotated for options | Use positional args for options |
| Add help text to commands | Leave commands undocumented |
| Use Rich for complex output | Use plain print for tables |
| Handle errors with Exit codes | Let exceptions crash |
| Test with CliRunner | Skip CLI tests |

**Official docs:**
- Typer: https://typer.tiangolo.com/
- Rich: https://rich.readthedocs.io/
- Click: https://click.palletsprojects.com/
