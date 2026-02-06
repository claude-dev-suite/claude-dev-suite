---
name: python-profiling
description: |
  Python performance profiling with cProfile, tracemalloc, and line_profiler.
  Use for identifying bottlenecks and memory issues.

  USE WHEN: user mentions "Python profiling", "cProfile", "memory profiling", asks about "Python performance", "tracemalloc", "line_profiler", "py-spy", "Python optimization", "Python memory leak"

  DO NOT USE FOR: Java/Node.js profiling - use respective skills instead
allowed-tools: Read, Grep, Glob, Bash, mcp__performance_profiler__*
---
# Python Performance Profiling

## When NOT to Use This Skill

- **Java/JVM profiling** - Use the `java-profiling` skill for JFR and GC tuning
- **Node.js profiling** - Use the `nodejs-profiling` skill for V8 profiler
- **NumPy/Pandas optimization** - Use library-specific profiling tools and vectorization guides
- **Database query optimization** - Use database-specific profiling tools
- **Web server performance** - Use application-level profiling (Django Debug Toolbar, Flask-DebugToolbar)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python` for comprehensive profiling guides, optimization techniques, and best practices.

## cProfile (CPU Profiling)

### Command Line Usage

```bash
# Profile entire script
python -m cProfile -o output.prof script.py

# Sort by cumulative time
python -m cProfile -s cumtime script.py

# Sort by total time in function
python -m cProfile -s tottime script.py

# Analyze saved profile
python -m pstats output.prof
```

### pstats Analysis

```python
import pstats

# Load and analyze profile
stats = pstats.Stats('output.prof')
stats.strip_dirs()
stats.sort_stats('cumulative')
stats.print_stats(20)  # Top 20 functions

# Filter by module
stats.print_stats('mymodule')

# Show callers
stats.print_callers('slow_function')

# Show callees
stats.print_callees('main')
```

### Programmatic Profiling

```python
import cProfile
import pstats
from io import StringIO

def profile_function(func, *args, **kwargs):
    profiler = cProfile.Profile()
    profiler.enable()

    result = func(*args, **kwargs)

    profiler.disable()

    # Analyze
    stream = StringIO()
    stats = pstats.Stats(profiler, stream=stream)
    stats.sort_stats('cumulative')
    stats.print_stats(10)
    print(stream.getvalue())

    return result

# Context manager
from contextlib import contextmanager

@contextmanager
def profile_block(name='profile'):
    profiler = cProfile.Profile()
    profiler.enable()
    try:
        yield
    finally:
        profiler.disable()
        profiler.dump_stats(f'{name}.prof')
```

## Memory Profiling

### tracemalloc (Built-in)

```python
import tracemalloc

# Start tracking
tracemalloc.start()

# Your code here
result = process_data()

# Get snapshot
snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')

print("Top 10 memory allocations:")
for stat in top_stats[:10]:
    print(stat)

# Compare snapshots
snapshot1 = tracemalloc.take_snapshot()
# ... code ...
snapshot2 = tracemalloc.take_snapshot()

diff = snapshot2.compare_to(snapshot1, 'lineno')
for stat in diff[:10]:
    print(stat)

# Stop tracking
tracemalloc.stop()
```

### memory_profiler (Line-by-line)

```python
# Install: pip install memory_profiler

from memory_profiler import profile

@profile
def my_function():
    a = [1] * 1_000_000
    b = [2] * 2_000_000
    del b
    return a

# Command line usage
# python -m memory_profiler script.py

# Profile specific function
# mprof run script.py
# mprof plot
```

### objgraph (Object References)

```python
# Install: pip install objgraph

import objgraph

# Most common types
objgraph.show_most_common_types(limit=20)

# Growth since last call
objgraph.show_growth()

# Find reference chain (memory leak detection)
objgraph.show_backrefs([leaked_object], filename='refs.png')
```

## Line Profiler

```python
# Install: pip install line_profiler

# Decorate functions to profile
@profile
def slow_function():
    total = 0
    for i in range(1000000):
        total += i
    return total

# Run with: kernprof -l -v script.py
```

## High-Resolution Timing

### time Module

```python
import time

# Monotonic clock (best for measuring durations)
start = time.perf_counter()
result = do_work()
duration = time.perf_counter() - start
print(f"Duration: {duration:.4f}s")

# Nanosecond precision (Python 3.7+)
start = time.perf_counter_ns()
result = do_work()
duration_ns = time.perf_counter_ns() - start
print(f"Duration: {duration_ns}ns")
```

### timeit Module

```python
import timeit

# Time small code snippets
duration = timeit.timeit('sum(range(1000))', number=10000)
print(f"Average: {duration / 10000:.6f}s")

# Compare implementations
setup = "data = list(range(10000))"
time1 = timeit.timeit('sum(data)', setup, number=1000)
time2 = timeit.timeit('sum(x for x in data)', setup, number=1000)
print(f"sum(): {time1:.4f}s, generator: {time2:.4f}s")
```

## Common Bottleneck Patterns

### List Operations

```python
# ❌ Bad: Concatenating lists in loop
result = []
for item in items:
    result = result + [process(item)]  # O(n²)

# ✅ Good: Use append
result = []
for item in items:
    result.append(process(item))  # O(n)

# ✅ Better: List comprehension
result = [process(item) for item in items]

# ❌ Bad: Checking membership in list
if item in large_list:  # O(n)
    pass

# ✅ Good: Use set for membership
large_set = set(large_list)
if item in large_set:  # O(1)
    pass
```

### String Operations

```python
# ❌ Bad: String concatenation in loop
result = ""
for s in strings:
    result += s  # Creates new string each time

# ✅ Good: Use join
result = "".join(strings)

# ❌ Bad: Format in loop
for item in items:
    log(f"Processing {item}")

# ✅ Good: Lazy formatting
import logging
for item in items:
    logging.debug("Processing %s", item)  # Only formats if needed
```

### Dictionary Operations

```python
# ❌ Bad: Repeated key lookup
if key in d:
    value = d[key]
    process(value)

# ✅ Good: Use get or setdefault
value = d.get(key)
if value is not None:
    process(value)

# ❌ Bad: Checking then setting
if key not in d:
    d[key] = []
d[key].append(value)

# ✅ Good: Use defaultdict
from collections import defaultdict
d = defaultdict(list)
d[key].append(value)
```

### Generator vs List

```python
# ❌ Bad: Creating large intermediate lists
result = sum([x * 2 for x in range(10_000_000)])  # Uses memory

# ✅ Good: Use generator
result = sum(x * 2 for x in range(10_000_000))  # Lazy evaluation

# Process large files
# ❌ Bad
data = open('large.csv').readlines()  # All in memory
for line in data:
    process(line)

# ✅ Good
with open('large.csv') as f:  # Stream line by line
    for line in f:
        process(line)
```

## NumPy Optimization

```python
import numpy as np

# ❌ Bad: Python loops over arrays
result = []
for i in range(len(arr)):
    result.append(arr[i] * 2)

# ✅ Good: Vectorized operations
result = arr * 2  # SIMD operations

# ❌ Bad: Creating many temporary arrays
result = (arr1 + arr2) * arr3 / arr4  # 3 temporaries

# ✅ Good: In-place operations when possible
result = arr1.copy()
result += arr2
result *= arr3
result /= arr4

# Use appropriate dtypes
arr = np.array(data, dtype=np.float32)  # Half memory of float64
```

## Async Optimization

```python
import asyncio
import aiohttp

# ❌ Bad: Sequential async
async def fetch_all_sequential(urls):
    results = []
    async with aiohttp.ClientSession() as session:
        for url in urls:
            async with session.get(url) as resp:
                results.append(await resp.text())
    return results

# ✅ Good: Concurrent async
async def fetch_all_concurrent(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [session.get(url) for url in urls]
        responses = await asyncio.gather(*tasks)
        return [await r.text() for r in responses]

# ✅ Better: With concurrency limit
from asyncio import Semaphore

async def fetch_with_limit(urls, limit=10):
    semaphore = Semaphore(limit)

    async def fetch_one(url):
        async with semaphore:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    return await resp.text()

    return await asyncio.gather(*[fetch_one(url) for url in urls])
```

## Multiprocessing

```python
from multiprocessing import Pool, cpu_count
from concurrent.futures import ProcessPoolExecutor

# CPU-bound work
def cpu_intensive(x):
    return sum(i * i for i in range(x))

# Using Pool
with Pool(cpu_count()) as pool:
    results = pool.map(cpu_intensive, range(100))

# Using ProcessPoolExecutor
with ProcessPoolExecutor() as executor:
    results = list(executor.map(cpu_intensive, range(100)))

# Shared memory (Python 3.8+)
from multiprocessing import shared_memory
import numpy as np

# Create shared array
shm = shared_memory.SharedMemory(create=True, size=arr.nbytes)
shared_arr = np.ndarray(arr.shape, dtype=arr.dtype, buffer=shm.buf)
shared_arr[:] = arr[:]
```

## Profiling Checklist

| Check | Tool | Command |
|-------|------|---------|
| CPU hotspots | cProfile | `python -m cProfile script.py` |
| Line-by-line | line_profiler | `kernprof -l -v script.py` |
| Memory usage | tracemalloc | `tracemalloc.start()` |
| Memory per line | memory_profiler | `@profile` decorator |
| Object references | objgraph | `objgraph.show_growth()` |
| Quick benchmarks | timeit | `timeit.timeit()` |

## py-spy (Sampling Profiler)

```bash
# Install: pip install py-spy

# Record profile
py-spy record -o profile.svg -- python script.py

# Top-like view of running process
py-spy top --pid <pid>

# Dump current stack
py-spy dump --pid <pid>

# Profile subprocesses
py-spy record --subprocesses -o profile.svg -- python script.py
```

## Production Optimization

```python
# Use __slots__ for memory efficiency
class Point:
    __slots__ = ['x', 'y']
    def __init__(self, x, y):
        self.x = x
        self.y = y

# Use lru_cache for memoization
from functools import lru_cache

@lru_cache(maxsize=1000)
def expensive_computation(x):
    return x ** 2

# Use dataclasses with slots (Python 3.10+)
from dataclasses import dataclass

@dataclass(slots=True)
class Point:
    x: float
    y: float
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Using `+` to concatenate strings in loop | O(n²) time complexity | Use `''.join()` or list comprehension |
| List comprehension when generator suffices | Unnecessary memory allocation | Use generator expression for one-time iteration |
| `range()` when `enumerate()` needed | Manual index tracking, error-prone | Use `enumerate()` for index and value |
| Checking membership in list | O(n) lookup | Use `set` for O(1) membership testing |
| `global` variables everywhere | Hard to profile, side effects | Pass parameters, return values |
| Not using NumPy for numerical work | Orders of magnitude slower | Vectorize with NumPy for array operations |
| Premature optimization | Wasted effort, harder to maintain | Profile first, optimize bottlenecks |
| Using `import *` | Namespace pollution, slower imports | Import specific names |
| `.append()` in loop when size known | Multiple reallocations | Pre-allocate with list comprehension or `[None] * size` |
| Not using `__slots__` for many instances | Higher memory usage | Use `__slots__` for classes with many instances |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Slow loops over large data | Python loops are slow | Vectorize with NumPy, use list comprehensions |
| High memory usage | Creating large intermediate objects | Use generators, process in chunks |
| GIL contention | Multi-threading doesn't speed up CPU work | Use `multiprocessing` for CPU-bound tasks |
| Slow imports | Large modules with side effects | Lazy import, reduce module-level code |
| Memory leak | Objects not being garbage collected | Check for circular references, use `weakref` |
| `RecursionError` | Recursion too deep | Increase limit with `sys.setrecursionlimit()` or refactor to iteration |
| Slow dictionary operations | Hash collisions | Ensure keys are hashable and well-distributed |
| High CPU in profiler | C extensions not showing | Use sampling profiler like `py-spy` |
| Out of memory with large file | Loading entire file | Use `with open()` and iterate line by line |
| Slow JSON parsing | Large JSON file | Use streaming parser (ijson) or pandas |

## Related Skills

- [FastAPI](../../backend-frameworks/fastapi/SKILL.md)
- [Django](../../backend-frameworks/django/SKILL.md)
- [NumPy/Pandas](../../data-science/)
