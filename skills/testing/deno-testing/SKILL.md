---
name: deno-testing
description: |
  Deno testing with Deno.test and std/testing. Covers unit tests, async tests,
  mocking, snapshots, and BDD-style testing.

  USE WHEN: user mentions "deno test", "deno testing", asks about "Deno.test", "assertSnapshot", "FakeTime", "spy", "stub", "BDD deno"

  DO NOT USE FOR: Node.js projects - use `vitest` or `jest`; Browser-only code - use Playwright; Python - use `pytest`; Java - use `junit`; Non-Deno TypeScript - use `vitest`
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Deno Testing Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `deno` for comprehensive documentation.

> **Full Reference**: See [advanced.md](advanced.md) for FakeTime, BDD Style, Snapshots, HTTP Testing, Integration Tests, Test Context, Custom Assertions, and Permissions Testing.

## When NOT to Use This Skill

- **Node.js Projects** - Use `vitest` or `jest` for Node.js
- **Browser-Only Code** - Use Playwright for browser automation
- **Python Projects** - Use `pytest` for Python
- **Java Projects** - Use `junit` for Java
- **Non-Deno TypeScript** - Use `vitest` for standard TypeScript

## Basic Testing

### Unit Tests

```typescript
// math.ts
export function add(a: number, b: number): number {
  return a + b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

// math_test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { add, divide } from "./math.ts";

Deno.test("add positive numbers", () => {
  assertEquals(add(2, 3), 5);
});

Deno.test("divide by zero throws", () => {
  assertThrows(
    () => divide(10, 0),
    Error,
    "Division by zero"
  );
});
```

### Running Tests

```bash
# Run all tests
deno test

# Run specific file
deno test math_test.ts

# Run tests matching pattern
deno test --filter "add"

# Allow permissions
deno test --allow-read --allow-net

# Watch mode
deno test --watch

# Coverage
deno test --coverage=cov_profile
deno coverage cov_profile --html
```

## Assertions

```typescript
import {
  assertEquals,
  assertNotEquals,
  assertStrictEquals,
  assertExists,
  assertInstanceOf,
  assertArrayIncludes,
  assertStringIncludes,
  assertMatch,
  assertThrows,
  assertRejects,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("assertions examples", () => {
  assertEquals({ a: 1 }, { a: 1 });
  assertNotEquals({ a: 1 }, { a: 2 });
  assertStrictEquals(obj, obj);           // Reference equality
  assertExists("value");                   // Not null/undefined
  assertInstanceOf(new Date(), Date);
  assertArrayIncludes([1, 2, 3], [2, 3]);
  assertStringIncludes("hello world", "world");
  assertMatch("hello123", /\d+/);
  assert(true);
});

Deno.test("error assertions", async () => {
  assertThrows(() => { throw new Error("oops"); }, Error, "oops");
  await assertRejects(async () => { throw new Error("async error"); }, Error);
});
```

## Test Organization

### Test Steps

```typescript
Deno.test("user workflow", async (t) => {
  let userId: string;

  await t.step("create user", async () => {
    const response = await fetch("http://localhost:8000/users", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
    });
    const user = await response.json();
    userId = user.id;
    assertEquals(user.name, "Alice");
  });

  await t.step("get user", async () => {
    const response = await fetch(`http://localhost:8000/users/${userId}`);
    const user = await response.json();
    assertEquals(user.id, userId);
  });
});
```

### Test Options

```typescript
Deno.test({
  name: "test with options",
  permissions: { read: true, net: true },
  fn: async () => {
    const data = await Deno.readTextFile("./data.txt");
    assertEquals(data.length > 0, true);
  },
});

Deno.test({
  name: "ignored test",
  ignore: Deno.build.os === "windows",
  fn: () => { /* Skipped on Windows */ },
});

Deno.test({
  name: "test with sanitizers disabled",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => { /* Test that might leak resources */ },
});
```

## Async Testing

```typescript
Deno.test("async test", async () => {
  const result = await asyncOperation();
  assertEquals(result, "expected");
});

Deno.test("timeout handling", async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("http://example.com", {
      signal: controller.signal,
    });
    assertEquals(response.ok, true);
  } finally {
    clearTimeout(timeout);
  }
});
```

## Mocking

### Spy Functions

```typescript
import { spy, assertSpyCalls, assertSpyCall } from "https://deno.land/std@0.208.0/testing/mock.ts";

Deno.test("spy example", () => {
  const func = spy((x: number) => x * 2);

  assertEquals(func(2), 4);
  assertEquals(func(3), 6);

  assertSpyCalls(func, 2);
  assertSpyCall(func, 0, { args: [2], returned: 4 });
});

Deno.test("spy on object method", () => {
  const obj = {
    greet(name: string) { return `Hello, ${name}!`; },
  };

  const greetSpy = spy(obj, "greet");

  assertEquals(obj.greet("Alice"), "Hello, Alice!");
  assertSpyCalls(greetSpy, 1);

  greetSpy.restore();
});
```

### Stub Functions

```typescript
import { stub, returnsNext } from "https://deno.land/std@0.208.0/testing/mock.ts";

Deno.test("stub example", () => {
  const obj = { getValue: () => Math.random() };

  const stubFn = stub(obj, "getValue", () => 42);

  assertEquals(obj.getValue(), 42);
  assertEquals(obj.getValue(), 42);

  stubFn.restore();
});

Deno.test("stub with different returns", () => {
  const obj = { getValue: () => 0 };

  const stubFn = stub(obj, "getValue", returnsNext([1, 2, 3]));

  assertEquals(obj.getValue(), 1);
  assertEquals(obj.getValue(), 2);
  assertEquals(obj.getValue(), 3);

  stubFn.restore();
});
```

### Mocking Fetch

```typescript
Deno.test("mock fetch", async () => {
  const mockResponse = new Response(JSON.stringify({ id: 1, name: "Alice" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(mockResponse)
  );

  try {
    const response = await fetch("http://api.example.com/users/1");
    const user = await response.json();

    assertEquals(user.name, "Alice");
  } finally {
    fetchStub.restore();
  }
});
```

---

## Checklist

- [ ] Unit tests for all public functions
- [ ] Async tests for async operations
- [ ] BDD-style tests for complex features
- [ ] Mock external dependencies
- [ ] Snapshot tests for complex data
- [ ] HTTP handler tests
- [ ] Test steps for workflows
- [ ] Permission-aware tests
- [ ] Coverage reporting

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not specifying permissions | Tests fail unexpectedly | Use permissions option in test |
| Not restoring stubs/spies | Affects other tests | Always call stub.restore() |
| Over-using snapshots | Hard to review changes | Use snapshots sparingly |
| Disabled sanitizers without reason | Resource leaks | Only disable when necessary |
| Not using test steps | Hard to debug complex flows | Use t.step() for workflows |
| Hardcoded waits | Slow, unreliable tests | Use proper async patterns |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "PermissionDenied" | Missing permission in test | Add permissions: { read: true } etc. |
| "Leaking resources" | Unclosed file/connection | Close resources or disable sanitizer |
| "Leaking async ops" | Unfinished async operation | Await all promises or disable sanitizer |
| Snapshot mismatch | Intentional change | Review diff, update with --update |
| Stub not working | Not restored from previous test | Call stub.restore() in cleanup |
| Test timeout | Infinite loop or slow operation | Add timeout or investigate |

## Reference Documentation

- [Deno Testing](https://docs.deno.com/runtime/fundamentals/testing/)
- [std/testing](https://deno.land/std@0.208.0/testing)
