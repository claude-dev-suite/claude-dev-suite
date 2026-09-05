---
name: python-review
description: |
  Reviewing Python code - what to flag, and what ruff, mypy and the interpreter already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing Python code - a
  "code review", a "review" of a .py file, a diff, a PR or a pull request;
  deciding what to comment on in Python; avoiding false positives on Python code

  DO NOT USE FOR: writing, explaining or learning Python - use
  `languages/python`; anything ruff's default rules or a configured mypy already
  reports (this skill lists those so you can stay silent about them);
  Django/FastAPI specifics - use the framework skills; test review - use the
  pytest skills
allowed-tools: Read, Grep, Glob
---
# Reviewing Python

A reviewer's leverage is what the toolchain cannot say. Every check below
describes a defect that survives the interpreter and **ruff's default rule
set**, which is narrower than most people assume: `E4`, `E7`, `E9` and `F`.

That default is the crux. Most of the famous Python footguns live in rule
families that are opt-in — `B` (bugbear), `ASYNC`, `DTZ`, `S` (bandit). Read
`pyproject.toml` before deciding whether a finding is yours or the linter's.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Unused import, unused local | ruff `F401` / `F841` (default) |
| Bare `except:` | ruff `E722` (default) |
| `is` compared against a literal | ruff `F632` (default) |
| Undefined or redefined name | ruff `F821` / `F811` (default) |
| f-string with no placeholders | ruff `F541` (default) |
| Duplicate dict key | ruff `F601`-family (default) |
| Mutable default argument | ruff `B006` - **opt-in**, not in the default set |
| Naive `datetime.now()` | ruff `DTZ005` - **opt-in** |
| Blocking call inside `async def` | ruff `ASYNC` family - **opt-in** |
| `subprocess` with `shell=True` | ruff `S602` / bandit - **opt-in** |
| Missing or wrong type annotation | mypy - only if the project runs it, and only where annotations exist |

If a project pins ruff to the default set, the four opt-in rows above are
**your** job. Establish which it is by reading the config, once, rather than
guessing per file.

## The checks that earn their place

### A coroutine created and never awaited

```python
async def handler():
    save_to_db(record)      # returns a coroutine; nothing runs
    return "ok"
```

**When you see it**: a call to an `async def` without `await`, inside another
`async def`.

**Ask**: did this actually execute? Python emits a `RuntimeWarning` at garbage
collection - to stderr, at an unrelated moment, and routinely swallowed by a
logging config. mypy catches it only when the callee is annotated and the result
is unused in a checked context. In practice this ships.

### A task created with no reference held

```python
asyncio.create_task(background_work())   # nothing holds the result
```

**When you see it**: `create_task` whose return value is discarded.

**Ask**: what keeps this alive? The event loop holds only a *weak* reference, so
a task can be garbage-collected mid-flight and simply stop - intermittently,
under load, which is the worst way to find out. The fix is keeping the task in a
set until it completes, or `TaskGroup` on 3.11+.

### A blocking call inside async code

```python
async def fetch_all(urls):
    for u in urls:
        r = requests.get(u)      # blocks the entire event loop
        time.sleep(0.1)          # so does this
```

**When you see it**: `requests`, `time.sleep`, a synchronous DB driver, or file
I/O inside `async def`.

**Ask**: what else is on this loop? One blocking call stalls every other
coroutine in the process, so the symptom appears in unrelated endpoints. The
`ASYNC` rules find these but are opt-in.

### An exception caught and its cause discarded

```python
try:
    parse(payload)
except ValueError:
    raise ApiError("bad request")   # original traceback context is implicit
```

**When you see it**: a `raise` inside an `except` block with no `from`.

**Ask**: will the person debugging this see what actually failed? Python does
chain implicitly ("During handling of the above exception..."), but `raise ...
from err` states the causal link deliberately, and `from None` is how you say
the original genuinely does not matter. Silence leaves the reader unsure which
was meant.

### `except Exception` with nothing distinguishing

```python
try:
    do_work()
except Exception:
    logger.warning("failed")   # a typo in do_work reads the same as a timeout
```

**When you see it**: a broad `except` whose handler does not re-raise and does
not branch on the exception.

**Ask**: which failures is this meant to absorb? `E722` only covers *bare*
`except:` - `except Exception` passes the linter while catching `AttributeError`
from a refactor exactly as it catches the network error it was written for.

### A mutable default argument

```python
def add(item, target=[]):    # one list, shared by every call
    target.append(item)
    return target
```

**When you see it**: `[]`, `{}`, `set()` or a call expression as a default.

**Ask**: is the default meant to be per-call? The default is evaluated once at
function definition. `B006` reports it but is **not** in ruff's default set, so
in most repos this is a review finding.

### A class attribute shared as if it were per-instance

```python
class Session:
    items: list[str] = []    # one list for the whole class
```

**When you see it**: a mutable value assigned at class level, especially with an
annotation that makes it look like a field declaration.

**Ask**: was a dataclass field or `__init__` assignment intended? The annotation
reads like a per-instance declaration and behaves like the opposite. No default
linter reports it.

### A collection mutated while it is being iterated

```python
for item in items:
    if item.expired:
        items.remove(item)   # skips the element after each removal
```

**When you see it**: `.remove()`, `.pop()`, `del` or a dict assignment inside a
loop over the same collection.

**Ask**: does the loop still visit every element? Removing shifts the index the
iterator is holding, so it silently skips - no exception for lists, and
`RuntimeError` only for dicts and sets. A comprehension building a new list is
the fix.

### A generator consumed twice

```python
rows = (parse(line) for line in f)
total = sum(r.amount for r in rows)
count = len(list(rows))       # 0: the generator is already exhausted
```

**When you see it**: a generator expression or `map`/`filter` result used in more
than one place.

**Ask**: is this iterated once? The second pass yields nothing and produces a
plausible wrong number rather than an error. Materialise with `list()` if it is
needed twice.

### A naive datetime crossing a boundary

```python
created = datetime.now()          # no tzinfo; means whatever the host is set to
if created > deadline_utc:        # TypeError, or a silent 2-hour error
```

**When you see it**: `datetime.now()`, `utcnow()`, or `fromtimestamp()` without
`tz=`, on a value that is stored, compared or serialised.

**Ask**: whose clock is this? `utcnow()` is the sharpest edge - it returns a
naive datetime holding UTC, so it compares wrongly against both aware datetimes
and local naive ones. `datetime.now(timezone.utc)` is the version that says what
it means. The `DTZ` rules cover this and are opt-in.

### A shallow copy treated as a deep one

```python
new_cfg = dict(cfg)
new_cfg["tags"].append("x")   # mutates the original's nested list
```

**When you see it**: `dict(...)`, `.copy()`, `list(...)` or a slice, followed by
a write into a nested member.

**Ask**: does anything else hold the nested object? `copy.deepcopy` is the fix
when it genuinely needs isolation - and worth a second look, since it is often
reached for when restructuring the data would be better.

### `dict.get` whose `None` flows onward

```python
timeout = config.get("timeout")    # None when absent
sock.settimeout(timeout * 2)       # TypeError, far from the missing key
```

**When you see it**: `.get()` with no default, on a path that uses the result
arithmetically or as an attribute.

**Ask**: is absence expected here? If it is, give the default at the lookup;
if it is not, `config["timeout"]` raises `KeyError` at the line that is actually
wrong, naming the key.

## Config-dependent - read `pyproject.toml` before commenting

Python's review surface is set almost entirely by configuration. Read it once,
state what you find once, and let it decide which findings above are yours.

| What to read | Why it changes the review |
|---|---|
| `[tool.ruff.lint] select` | The default is `E4, E7, E9, F`. If the project has not widened it, the `B`, `ASYNC`, `DTZ` and `S` findings above are unreported and worth raising |
| `[tool.mypy] strict` / `disallow_untyped_defs` | Without them, annotations are decoration: an unannotated function is not checked at all, so a wrong type hint elsewhere is never contradicted |
| `requires-python` | Decides whether `TaskGroup` and `except*` (3.11+), or `Self` and `override` (3.12+) are available - do not suggest what the floor forbids |
| Presence of a mypy/pyright config at all | If neither runs, every type annotation in the diff is unverified prose |

`# type: ignore` without a rule code silences everything on that line, forever.
A bare one in a diff is worth a comment even when the surrounding change is fine.

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`utcnow()` returns a naive datetime, so this comparison
against an aware `deadline` raises `TypeError` at request time" beats "use
timezone-aware datetimes". If you cannot state the input that fails, it is a
preference, not a defect.

When the finding exists only because a rule family is disabled, say so and point
at the config. One comment about `select` is worth more than ten about mutable
defaults.
