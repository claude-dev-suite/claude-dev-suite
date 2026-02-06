---
name: trpc
description: |
  tRPC for type-safe APIs. Covers routers, procedures, and React Query
  integration. Use for end-to-end type-safe APIs.

  USE WHEN: user mentions "tRPC", "type-safe API", "end-to-end types", "procedures",
  "tRPC router", "tRPC React Query", asks about "how to build type-safe API",
  "tRPC with Next.js", "tRPC middleware", "tRPC context"

  DO NOT USE FOR: REST APIs - use `rest-api` instead; GraphQL - use `graphql` instead;
  OpenAPI specs - use `openapi` instead; Non-TypeScript projects
allowed-tools: Read, Grep, Glob, Write, Edit
---
# tRPC Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `trpc` for comprehensive documentation.

## Router Definition

```typescript
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  user: t.router({
    list: t.procedure.query(async ({ ctx }) => {
      return ctx.db.users.findMany();
    }),

    byId: t.procedure
      .input(z.string())
      .query(async ({ ctx, input }) => {
        const user = await ctx.db.users.find(input);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
        return user;
      }),

    create: t.procedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        return ctx.db.users.create(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;
```

## Client Usage (React)

```tsx
import { trpc } from '../utils/trpc';

function UserList() {
  const { data, isLoading } = trpc.user.list.useQuery();
  const createUser = trpc.user.create.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate();
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {data?.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => createUser.mutate({ name: 'John', email: 'j@example.com' })}>
        Add User
      </button>
    </div>
  );
}
```

## Protected Procedures

```typescript
const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { user: ctx.session.user } });
});

export const appRouter = t.router({
  secret: protectedProcedure.query(({ ctx }) => {
    return `Hello ${ctx.user.name}`;
  }),
});
```

## With Next.js

```typescript
// pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext: ({ req, res }) => ({ req, res, db }),
});
```

## When NOT to Use This Skill

- REST API design (use `rest-api` skill)
- GraphQL APIs (use `graphql` skill)
- OpenAPI documentation (use `openapi` skill)
- Non-TypeScript projects
- Public APIs requiring language-agnostic clients
- APIs consumed by third-party developers

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No input validation | Security risk, runtime errors | Always use Zod schemas for input |
| Sharing database models as output types | Leaks implementation details | Create separate DTOs/response schemas |
| Missing error handling middleware | Inconsistent error responses | Add global error middleware |
| No rate limiting on public procedures | API abuse vulnerability | Add rate limiting middleware |
| Using `any` in context or procedures | Loses type safety | Use proper TypeScript types |
| Not using middleware for auth | Duplicated auth logic | Create reusable protected procedure |
| Missing pagination on list queries | Performance issues | Add pagination to all list endpoints |
| Exposing internal errors to client | Security leak | Use error formatter to sanitize errors |
| No request logging | Hard to debug issues | Add logging middleware |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Type errors in client | Router type not exported/imported | Export `AppRouter` type from server |
| "UNAUTHORIZED" errors | Missing or invalid context | Check createContext, verify token |
| Input validation fails | Input doesn't match Zod schema | Verify request payload matches schema |
| Slow queries | Missing DataLoader or N+1 queries | Add batching/caching in context |
| CORS errors | Missing CORS configuration | Configure CORS in adapter |
| Procedure not found | Router not registered or typo | Check router structure, verify path |
| "Cannot call procedure" | Calling query as mutation or vice versa | Use correct method (query/mutation) |
| Rate limit errors | Too many requests | Implement exponential backoff |
| Type inference not working | Incorrect client setup | Ensure client uses correct AppRouter type |

## Production Readiness

### Error Handling

```typescript
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add custom error data
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

// Custom error handling middleware
const errorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof TRPCError) {
      // Log known errors
      console.warn('tRPC error:', error.code, error.message);
      throw error;
    }

    // Log and transform unknown errors
    console.error('Unexpected error:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export const procedure = t.procedure.use(errorMiddleware);
```

### Rate Limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
});

const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const identifier = ctx.session?.user?.id ?? ctx.ip ?? 'anonymous';
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);

  if (!success) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s`,
    });
  }

  return next();
});

export const rateLimitedProcedure = t.procedure.use(rateLimitMiddleware);
```

### Input Validation

```typescript
import { z } from 'zod';

// Reusable schemas
const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

const idSchema = z.string().uuid();

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const appRouter = t.router({
  user: t.router({
    list: procedure
      .input(paginationSchema)
      .query(async ({ ctx, input }) => {
        const { page, limit } = input;
        return ctx.db.users.findMany({
          skip: (page - 1) * limit,
          take: limit,
        });
      }),

    create: protectedProcedure
      .input(createUserSchema)
      .mutation(async ({ ctx, input }) => {
        return ctx.db.users.create({ data: input });
      }),
  }),
});
```

### Testing

```typescript
// server/routers/__tests__/user.test.ts
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '../_app';
import { createMockContext } from '../../test/context';

const createCaller = createCallerFactory(appRouter);

describe('user router', () => {
  it('lists users', async () => {
    const ctx = createMockContext({
      db: {
        users: {
          findMany: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
        },
      },
    });

    const caller = createCaller(ctx);
    const result = await caller.user.list({ page: 1, limit: 10 });

    expect(result).toHaveLength(1);
    expect(ctx.db.users.findMany).toHaveBeenCalled();
  });

  it('throws on unauthorized access', async () => {
    const ctx = createMockContext({ session: null });
    const caller = createCaller(ctx);

    await expect(caller.user.create({ name: 'Test', email: 'test@example.com' }))
      .rejects.toThrow('UNAUTHORIZED');
  });
});

// E2E testing
import { test, expect } from '@playwright/test';

test('creates user via tRPC', async ({ page }) => {
  await page.goto('/users');
  await page.fill('input[name="name"]', 'John');
  await page.fill('input[name="email"]', 'john@example.com');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=John')).toBeVisible();
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Procedure latency | < 200ms |
| Error rate | < 1% |
| Rate limit hits | Monitor |
| Query cache hit rate | > 80% |

### Checklist

- [ ] Error formatter configured
- [ ] Error logging middleware
- [ ] Rate limiting on mutations
- [ ] Input validation with Zod
- [ ] Protected procedures for auth
- [ ] Pagination on list queries
- [ ] Unit tests with createCaller
- [ ] E2E tests for critical flows
- [ ] Request logging
- [ ] Query invalidation strategy

## Reference Documentation
- [Middleware](quick-ref/middleware.md)
- [Error Handling](quick-ref/errors.md)
