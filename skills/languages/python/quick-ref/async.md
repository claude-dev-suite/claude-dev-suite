# Python Async/Await

> **Knowledge Base:** Read `knowledge/python/async.md` for complete documentation.

## Basic Async

```python
import asyncio

async def fetch_data() -> str:
    await asyncio.sleep(1)  # Simulate I/O
    return "data"

async def main():
    result = await fetch_data()
    print(result)

# Run
asyncio.run(main())
```

## Concurrent Tasks

```python
import asyncio

async def fetch_user(user_id: int) -> dict:
    await asyncio.sleep(0.5)
    return {"id": user_id, "name": f"User {user_id}"}

async def main():
    # Run concurrently with gather
    users = await asyncio.gather(
        fetch_user(1),
        fetch_user(2),
        fetch_user(3)
    )
    print(users)

    # TaskGroup (Python 3.11+) - PREFERRED
    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_user(1))
        task2 = tg.create_task(fetch_user(2))
    # All tasks complete when exiting context
    print(task1.result(), task2.result())
```

## TaskGroup Error Handling (3.11+)

```python
import asyncio

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(might_fail_1())
            tg.create_task(might_fail_2())
    except* ValueError as eg:
        # Handle all ValueErrors
        for exc in eg.exceptions:
            print(f"ValueError: {exc}")
    except* TypeError as eg:
        # Handle all TypeErrors
        for exc in eg.exceptions:
            print(f"TypeError: {exc}")
```

## AnyIO (Portable Async)

```python
import anyio

async def fetch_all(urls: list[str]) -> list[str]:
    results = []

    async def fetch_one(url: str) -> None:
        async with anyio.open_url(url) as response:
            results.append(await response.read())

    async with anyio.create_task_group() as tg:
        for url in urls:
            tg.start_soon(fetch_one, url)

    return results

# Works on asyncio OR trio
anyio.run(fetch_all, ["https://example.com"])
```

## Async Context Manager

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def database_connection():
    conn = await create_connection()
    try:
        yield conn
    finally:
        await conn.close()

async def main():
    async with database_connection() as conn:
        await conn.execute("SELECT * FROM users")
```

## Async Generators

```python
async def async_range(count: int):
    for i in range(count):
        await asyncio.sleep(0.1)
        yield i

async def main():
    async for num in async_range(5):
        print(num)
```

## Timeouts & Cancellation

```python
import asyncio

async def slow_operation():
    await asyncio.sleep(10)
    return "done"

async def main():
    # Timeout
    try:
        result = await asyncio.wait_for(slow_operation(), timeout=2.0)
    except asyncio.TimeoutError:
        print("Operation timed out")

    # Cancellation
    task = asyncio.create_task(slow_operation())
    await asyncio.sleep(1)
    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        print("Task was cancelled")
```

## Semaphore (Rate Limiting)

```python
import asyncio

async def fetch_with_limit(semaphore: asyncio.Semaphore, url: str):
    async with semaphore:
        # Only N concurrent requests
        return await fetch(url)

async def main():
    semaphore = asyncio.Semaphore(10)  # Max 10 concurrent

    urls = [f"https://api.example.com/{i}" for i in range(100)]
    tasks = [fetch_with_limit(semaphore, url) for url in urls]
    results = await asyncio.gather(*tasks)
```

## Event & Queue

```python
import asyncio

# Event for signaling
async def waiter(event: asyncio.Event):
    await event.wait()
    print("Event triggered!")

async def setter(event: asyncio.Event):
    await asyncio.sleep(1)
    event.set()

# Queue for producer/consumer
async def producer(queue: asyncio.Queue):
    for i in range(5):
        await queue.put(i)
    await queue.put(None)  # Signal end

async def consumer(queue: asyncio.Queue):
    while True:
        item = await queue.get()
        if item is None:
            break
        print(f"Processing {item}")
```

## With aiohttp

```python
import aiohttp
import asyncio

async def fetch_url(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url) as response:
        return await response.text()

async def main():
    async with aiohttp.ClientSession() as session:
        html = await fetch_url(session, "https://example.com")
        print(len(html))

asyncio.run(main())
```

**Official docs:** https://docs.python.org/3/library/asyncio.html
