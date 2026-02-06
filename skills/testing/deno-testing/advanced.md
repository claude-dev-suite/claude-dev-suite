# Deno Testing Advanced Patterns

## Time Mocking

```typescript
import { FakeTime } from "https://deno.land/std@0.208.0/testing/time.ts";

Deno.test("fake time", () => {
  const time = new FakeTime();

  try {
    let called = false;
    setTimeout(() => {
      called = true;
    }, 1000);

    assertEquals(called, false);

    time.tick(500);
    assertEquals(called, false);

    time.tick(500);
    assertEquals(called, true);
  } finally {
    time.restore();
  }
});

Deno.test("fake time with date", () => {
  const time = new FakeTime(new Date("2024-01-01T00:00:00Z"));

  try {
    assertEquals(Date.now(), new Date("2024-01-01T00:00:00Z").getTime());

    time.tick(86400000); // 1 day
    assertEquals(Date.now(), new Date("2024-01-02T00:00:00Z").getTime());
  } finally {
    time.restore();
  }
});
```

---

## BDD Style Testing

```typescript
import {
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

describe("Calculator", () => {
  let calculator: Calculator;

  beforeAll(() => {
    // Run once before all tests
    console.log("Starting calculator tests");
  });

  afterAll(() => {
    // Run once after all tests
    console.log("Finished calculator tests");
  });

  beforeEach(() => {
    calculator = new Calculator();
  });

  afterEach(() => {
    // Clean up after each test
  });

  describe("add", () => {
    it("should add positive numbers", () => {
      assertEquals(calculator.add(2, 3), 5);
    });

    it("should add negative numbers", () => {
      assertEquals(calculator.add(-1, -1), -2);
    });
  });

  describe("divide", () => {
    it("should divide normally", () => {
      assertEquals(calculator.divide(10, 2), 5);
    });

    it("should throw on division by zero", () => {
      assertThrows(() => calculator.divide(10, 0));
    });
  });
});
```

---

## Snapshot Testing

```typescript
import { assertSnapshot } from "https://deno.land/std@0.208.0/testing/snapshot.ts";

Deno.test("snapshot test", async (t) => {
  const user = {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    createdAt: "2024-01-01",
  };

  await assertSnapshot(t, user);
});

Deno.test("snapshot with options", async (t) => {
  const data = generateComplexData();

  await assertSnapshot(t, data, {
    name: "complex data snapshot",
    serializer: (value) => JSON.stringify(value, null, 2),
  });
});
```

```bash
# Run tests and update snapshots
deno test --allow-read --allow-write -- --update

# Check snapshots without updating
deno test --allow-read
```

---

## HTTP Testing

### Testing HTTP Handlers

```typescript
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

function createApp() {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === "/users" && request.method === "GET") {
      return new Response(JSON.stringify([{ id: 1, name: "Alice" }]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/users" && request.method === "POST") {
      const body = await request.json();
      return new Response(JSON.stringify({ id: 2, ...body }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
}

Deno.test("GET /users", async () => {
  const app = createApp();
  const request = new Request("http://localhost/users");
  const response = await app(request);

  assertEquals(response.status, 200);

  const users = await response.json();
  assertEquals(users.length, 1);
  assertEquals(users[0].name, "Alice");
});

Deno.test("POST /users", async () => {
  const app = createApp();
  const request = new Request("http://localhost/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Bob" }),
  });

  const response = await app(request);

  assertEquals(response.status, 201);

  const user = await response.json();
  assertEquals(user.name, "Bob");
  assertEquals(user.id, 2);
});
```

### Integration Tests with Server

```typescript
Deno.test({
  name: "integration test with server",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const controller = new AbortController();

    // Start server
    const server = Deno.serve(
      { port: 8000, signal: controller.signal },
      () => new Response("Hello")
    );

    try {
      // Make requests
      const response = await fetch("http://localhost:8000");
      assertEquals(await response.text(), "Hello");
    } finally {
      // Stop server
      controller.abort();
      await server.finished;
    }
  },
});
```

---

## Test Utilities

### Test Context

```typescript
interface TestContext {
  db: Database;
  cleanup: (() => void)[];
}

function createTestContext(): TestContext {
  const db = new Database(":memory:");
  return {
    db,
    cleanup: [() => db.close()],
  };
}

function withTestContext(
  fn: (ctx: TestContext) => void | Promise<void>
): () => Promise<void> {
  return async () => {
    const ctx = createTestContext();
    try {
      await fn(ctx);
    } finally {
      for (const cleanup of ctx.cleanup) {
        cleanup();
      }
    }
  };
}

Deno.test("with context", withTestContext(async (ctx) => {
  ctx.db.execute("CREATE TABLE users (id INTEGER, name TEXT)");
  ctx.db.execute("INSERT INTO users VALUES (1, 'Alice')");

  const users = ctx.db.query("SELECT * FROM users");
  assertEquals(users.length, 1);
}));
```

### Custom Assertions

```typescript
function assertValidUser(user: unknown): asserts user is User {
  if (typeof user !== "object" || user === null) {
    throw new Error("Expected user to be an object");
  }

  const u = user as Record<string, unknown>;

  if (typeof u.id !== "string") {
    throw new Error("Expected user.id to be a string");
  }

  if (typeof u.name !== "string") {
    throw new Error("Expected user.name to be a string");
  }

  if (typeof u.email !== "string" || !u.email.includes("@")) {
    throw new Error("Expected user.email to be a valid email");
  }
}

Deno.test("custom assertion", () => {
  const user = { id: "1", name: "Alice", email: "alice@example.com" };
  assertValidUser(user);
  assertEquals(user.name, "Alice");
});
```

---

## Permissions Testing

```typescript
Deno.test({
  name: "requires read permission",
  permissions: { read: true },
  fn: async () => {
    const content = await Deno.readTextFile("./data.txt");
    assertEquals(content.length > 0, true);
  },
});

Deno.test({
  name: "requires network permission",
  permissions: { net: true },
  fn: async () => {
    const response = await fetch("https://example.com");
    assertEquals(response.ok, true);
  },
});

Deno.test({
  name: "no permissions needed",
  permissions: {},
  fn: () => {
    const result = 2 + 2;
    assertEquals(result, 4);
  },
});
```

---

## Coverage

```bash
# Generate coverage
deno test --coverage=coverage

# View coverage summary
deno coverage coverage

# Generate HTML report
deno coverage coverage --html

# Generate LCOV report
deno coverage coverage --lcov > lcov.info

# Exclude files
deno coverage coverage --exclude="test"
```
