---
name: graphql
description: |
  GraphQL API design. Covers schema, queries, mutations, and resolvers.
  Use when building or consuming GraphQL APIs.

  USE WHEN: user mentions "GraphQL", "schema definition", "resolvers", "mutations", "queries",
  "DataLoader", "N+1 problem", asks about "how to design GraphQL API", "GraphQL schema",
  "GraphQL authentication", "GraphQL pagination", "Apollo Server"

  DO NOT USE FOR: REST APIs - use `rest-api` instead; tRPC - use `trpc` instead;
  GraphQL code generation - use `graphql-codegen` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# GraphQL Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `graphql` for comprehensive documentation.

## Schema Definition

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String
  author: User!
  published: Boolean!
}

type Query {
  user(id: ID!): User
  users(limit: Int, offset: Int): [User!]!
  post(id: ID!): Post
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
}

input CreateUserInput {
  name: String!
  email: String!
}
```

## Resolvers

```typescript
const resolvers = {
  Query: {
    user: (_, { id }, context) => {
      return context.db.users.findUnique({ where: { id } });
    },
    users: (_, { limit, offset }, context) => {
      return context.db.users.findMany({ take: limit, skip: offset });
    },
  },
  Mutation: {
    createUser: (_, { input }, context) => {
      return context.db.users.create({ data: input });
    },
  },
  User: {
    posts: (parent, _, context) => {
      return context.db.posts.findMany({ where: { authorId: parent.id } });
    },
  },
};
```

## Queries

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    posts {
      title
      published
    }
  }
}

mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    name
  }
}
```

## When NOT to Use This Skill

- REST API design (use `rest-api` skill)
- OpenAPI/Swagger documentation (use `openapi` skill)
- tRPC type-safe APIs (use `trpc` skill)
- Generating GraphQL types from schema (use `graphql-codegen` skill)
- Simple CRUD operations where REST is sufficient

## Best Practices

| Do | Don't |
|----|----|
| Use input types for mutations | N+1 queries (use DataLoader) |
| Implement pagination | Return unbounded lists |
| Add field-level auth | Expose sensitive data |
| Use fragments for reuse | Over-fetch data |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| N+1 queries | Causes performance issues, database overload | Use DataLoader for batching |
| Exposing implementation details in schema | Tight coupling, hard to refactor | Use domain-driven schema design |
| No pagination on lists | Memory issues, slow responses | Implement cursor or offset pagination |
| Allowing unbounded query depth | DoS vulnerability | Add depth limiting |
| No query complexity limits | Resource exhaustion | Add complexity analysis |
| Exposing sensitive fields without auth | Security vulnerability | Add field-level authorization |
| Using `String` for IDs | Type safety issues | Use `ID!` scalar type |
| Returning null instead of errors | Poor error handling | Use proper GraphQL error responses |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Slow query performance | N+1 queries | Implement DataLoader, check resolver patterns |
| High memory usage | Large unbounded lists | Add pagination, limit query depth |
| "Cannot return null for non-nullable field" | Missing data or resolver error | Check database queries, add error handling |
| Query rejected | Depth or complexity limit exceeded | Optimize query, reduce nesting |
| Authentication errors | Missing or invalid token | Check context creation, verify token |
| Type mismatch errors | Schema/resolver mismatch | Ensure resolver return types match schema |
| CORS errors | Server configuration issue | Configure CORS in Apollo Server |
| Introspection disabled | Production security setting | Enable for development, disable in production |

## Production Readiness

### Security Configuration

```typescript
// Query depth limiting
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(10)], // Max 10 levels deep
});

// Query complexity limiting
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const complexityLimitRule = createComplexityLimitRule(1000, {
  scalarCost: 1,
  objectCost: 10,
  listFactor: 10,
});

// Disable introspection in production
const server = new ApolloServer({
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    process.env.NODE_ENV === 'production'
      ? ApolloServerPluginLandingPageDisabled()
      : ApolloServerPluginLandingPageLocalDefault(),
  ],
});
```

### N+1 Query Prevention (DataLoader)

```typescript
import DataLoader from 'dataloader';

// Create loader per request (in context)
function createLoaders(db: PrismaClient) {
  return {
    userLoader: new DataLoader<string, User>(async (ids) => {
      const users = await db.user.findMany({
        where: { id: { in: [...ids] } },
      });
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) || null);
    }),

    postsByUserLoader: new DataLoader<string, Post[]>(async (userIds) => {
      const posts = await db.post.findMany({
        where: { authorId: { in: [...userIds] } },
      });
      const postsByUser = new Map<string, Post[]>();
      posts.forEach(p => {
        const existing = postsByUser.get(p.authorId) || [];
        postsByUser.set(p.authorId, [...existing, p]);
      });
      return userIds.map(id => postsByUser.get(id) || []);
    }),
  };
}

// Use in resolvers
const resolvers = {
  User: {
    posts: (parent, _, context) => {
      return context.loaders.postsByUserLoader.load(parent.id);
    },
  },
};
```

### Field-Level Authorization

```typescript
import { rule, shield, and, or } from 'graphql-shield';

const isAuthenticated = rule()((parent, args, context) => {
  return context.user !== null;
});

const isAdmin = rule()((parent, args, context) => {
  return context.user?.role === 'ADMIN';
});

const isOwner = rule()((parent, args, context) => {
  return parent.authorId === context.user?.id;
});

const permissions = shield({
  Query: {
    users: isAuthenticated,
    user: isAuthenticated,
  },
  Mutation: {
    deleteUser: and(isAuthenticated, or(isAdmin, isOwner)),
    updateUser: and(isAuthenticated, or(isAdmin, isOwner)),
  },
  User: {
    email: or(isAdmin, isOwner), // Only owner or admin can see email
  },
});

const server = new ApolloServer({
  schema: applyMiddleware(schema, permissions),
});
```

### Rate Limiting

```typescript
import { rateLimitDirective } from 'graphql-rate-limit-directive';

const { rateLimitDirectiveTypeDefs, rateLimitDirectiveTransformer } =
  rateLimitDirective();

const typeDefs = gql`
  ${rateLimitDirectiveTypeDefs}

  type Query {
    users: [User!]! @rateLimit(limit: 100, duration: 60)
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
      @rateLimit(limit: 10, duration: 60)
  }
`;
```

### Error Handling

```typescript
// Custom error formatting
const server = new ApolloServer({
  formatError: (formattedError, error) => {
    // Log original error
    logger.error(error);

    // Don't leak internal errors
    if (formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
      return {
        message: 'Internal server error',
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
        },
      };
    }

    // Remove stack trace in production
    if (process.env.NODE_ENV === 'production') {
      delete formattedError.extensions?.stacktrace;
    }

    return formattedError;
  },
});
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Query duration p99 | > 500ms |
| Error rate | > 1% |
| Complexity score (avg) | > 500 |
| Depth exceeded errors | > 10/min |
| DataLoader cache hit ratio | < 50% |

### Pagination (Relay-style)

```graphql
type Query {
  users(first: Int, after: String, last: Int, before: String): UserConnection!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  cursor: String!
  node: User!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

### Request Logging

```typescript
const server = new ApolloServer({
  plugins: [
    {
      async requestDidStart(requestContext) {
        const start = Date.now();

        return {
          async willSendResponse(ctx) {
            logger.info({
              operationName: ctx.request.operationName,
              query: ctx.request.query,
              variables: ctx.request.variables,
              duration: Date.now() - start,
              errors: ctx.errors?.length || 0,
            });
          },
        };
      },
    },
  ],
});
```

### Checklist

- [ ] Query depth limiting
- [ ] Query complexity limiting
- [ ] Introspection disabled in production
- [ ] DataLoader for N+1 prevention
- [ ] Field-level authorization
- [ ] Rate limiting on mutations
- [ ] Custom error formatting
- [ ] Relay-style pagination
- [ ] Request logging with timing
- [ ] Input validation
- [ ] Persisted queries (optional)
- [ ] APQ (Automatic Persisted Queries) enabled

## Code Generation

GraphQL Codegen generates TypeScript types and hooks from your GraphQL schema and operations.

### Quick Setup

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset
```

```typescript
// codegen.ts
import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql', 'src/**/*.tsx'],
  generates: {
    './src/gql/': {
      preset: 'client',
      plugins: [],
    },
  },
};

export default config;
```

### Generated Usage

```typescript
import { graphql } from '@/gql';
import { useQuery } from '@tanstack/react-query';

const UserQuery = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`);

function UserProfile({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['user', id],
    queryFn: () => request(endpoint, UserQuery, { id }),
  });

  return <div>{data?.user?.name}</div>;
}
```

### Related Skills

| Skill | Purpose |
|-------|---------|
| [GraphQL Codegen](../../api-integration/graphql-codegen/SKILL.md) | Full codegen setup |
| [TanStack Query](../../state-management/tanstack-query/SKILL.md) | Data fetching hooks |
| [React API](../../frontend-frameworks/react-api/SKILL.md) | Alternative data patterns |

## Reference Documentation
- [DataLoader](quick-ref/dataloader.md)
- [Authentication](quick-ref/auth.md)
- [Code Generation](quick-ref/codegen.md)
