# tRPC Routers Quick Reference

> **Knowledge Base:** Read `knowledge/trpc/routers.md` for complete documentation.

## Setup

```typescript
// server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';

interface Context {
  user: User | null;
  prisma: PrismaClient;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError
          ? error.cause.flatten()
          : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

## Basic Router

```typescript
import { z } from 'zod';
import { router, publicProcedure } from './trpc';

export const userRouter = router({
  // Query (GET)
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany();
  }),

  // Query with input
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findUnique({
        where: { id: input.id },
      });
    }),

  // Mutation (POST/PUT/DELETE)
  create: publicProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.create({ data: input });
    }),

  // Update
  update: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.user.update({
        where: { id },
        data,
      });
    }),

  // Delete
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

## Protected Procedures

```typescript
// Middleware for authentication
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: { ...ctx, user: ctx.user },
  });
});

const protectedProcedure = publicProcedure.use(isAuthed);

// Role-based middleware
const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(isAdmin);

// Usage
export const adminRouter = router({
  users: adminProcedure.query(({ ctx }) => {
    return ctx.prisma.user.findMany();
  }),

  deleteUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.delete({ where: { id: input.id } });
    }),
});
```

## Merge Routers

```typescript
// server/routers/index.ts
import { router } from '../trpc';
import { userRouter } from './user';
import { postRouter } from './post';
import { authRouter } from './auth';

export const appRouter = router({
  user: userRouter,
  post: postRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
```

## Error Handling

```typescript
import { TRPCError } from '@trpc/server';

export const postRouter = router({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.id },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      return post;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.prisma.post.findUnique({
        where: { id: input.id },
      });

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      if (post.authorId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to edit this post',
        });
      }

      return ctx.prisma.post.update({
        where: { id: input.id },
        data: { title: input.title },
      });
    }),
});

// Error codes: PARSE_ERROR, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN,
//              NOT_FOUND, METHOD_NOT_SUPPORTED, TIMEOUT, CONFLICT,
//              PRECONDITION_FAILED, PAYLOAD_TOO_LARGE, TOO_MANY_REQUESTS,
//              CLIENT_CLOSED_REQUEST, INTERNAL_SERVER_ERROR
```

## Context Creation

```typescript
// server/context.ts
import { inferAsyncReturnType } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';
import { prisma } from './db';

export async function createContext({ req, res }: CreateNextContextOptions) {
  const session = await getSession({ req });

  return {
    user: session?.user ?? null,
    prisma,
    req,
    res,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
```

## Next.js API Handler

```typescript
// pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers';
import { createContext } from '../../../server/context';

export default createNextApiHandler({
  router: appRouter,
  createContext,
  onError: ({ path, error }) => {
    console.error(`tRPC error on ${path}:`, error);
  },
});
```

**Official docs:** https://trpc.io/docs/server/routers
