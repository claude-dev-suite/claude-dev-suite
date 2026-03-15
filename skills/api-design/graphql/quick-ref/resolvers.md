# GraphQL Resolvers Quick Reference

> **Knowledge Base:** Read `knowledge/graphql/resolvers.md` for complete documentation.

## Resolver Structure

```typescript
interface Resolver {
  (
    parent: any,      // Result from parent resolver
    args: any,        // Arguments passed to field
    context: Context, // Shared context (auth, db, etc.)
    info: GraphQLResolveInfo // Field execution info
  ): any | Promise<any>;
}

interface Context {
  user: User | null;
  prisma: PrismaClient;
  dataSources: DataSources;
}
```

## Basic Resolvers

```typescript
const resolvers = {
  Query: {
    // Simple query
    users: async (_, __, { prisma }) => {
      return prisma.user.findMany();
    },

    // With arguments
    user: async (_, { id }, { prisma }) => {
      return prisma.user.findUnique({ where: { id } });
    },

    // Paginated query
    posts: async (_, { first, after }, { prisma }) => {
      return prisma.post.findMany({
        take: first,
        skip: after ? 1 : 0,
        cursor: after ? { id: after } : undefined,
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Mutation: {
    createUser: async (_, { input }, { prisma }) => {
      return prisma.user.create({ data: input });
    },

    updateUser: async (_, { id, input }, { prisma }) => {
      return prisma.user.update({
        where: { id },
        data: input,
      });
    },

    deleteUser: async (_, { id }, { prisma }) => {
      await prisma.user.delete({ where: { id } });
      return true;
    },
  },

  // Field resolvers
  User: {
    posts: async (parent, _, { prisma }) => {
      return prisma.post.findMany({
        where: { authorId: parent.id },
      });
    },

    fullName: (parent) => {
      return `${parent.firstName} ${parent.lastName}`;
    },
  },

  Post: {
    author: async (parent, _, { prisma }) => {
      return prisma.user.findUnique({
        where: { id: parent.authorId },
      });
    },
  },
};
```

## DataLoader (N+1 Prevention)

```typescript
import DataLoader from 'dataloader';

// Create loaders
function createLoaders(prisma: PrismaClient) {
  return {
    userLoader: new DataLoader<string, User>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: ids as string[] } },
      });
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id)!);
    }),

    postsByAuthorLoader: new DataLoader<string, Post[]>(async (authorIds) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: authorIds as string[] } },
      });
      const postMap = new Map<string, Post[]>();
      posts.forEach(post => {
        const existing = postMap.get(post.authorId) || [];
        postMap.set(post.authorId, [...existing, post]);
      });
      return authorIds.map(id => postMap.get(id) || []);
    }),
  };
}

// Use in resolvers
const resolvers = {
  Post: {
    author: (parent, _, { loaders }) => {
      return loaders.userLoader.load(parent.authorId);
    },
  },
  User: {
    posts: (parent, _, { loaders }) => {
      return loaders.postsByAuthorLoader.load(parent.id);
    },
  },
};
```

## Authentication & Authorization

```typescript
const resolvers = {
  Query: {
    me: async (_, __, { user, prisma }) => {
      if (!user) throw new AuthenticationError('Not authenticated');
      return prisma.user.findUnique({ where: { id: user.id } });
    },

    users: async (_, __, { user, prisma }) => {
      if (!user) throw new AuthenticationError('Not authenticated');
      if (user.role !== 'ADMIN') {
        throw new ForbiddenError('Admin access required');
      }
      return prisma.user.findMany();
    },
  },

  Mutation: {
    deletePost: async (_, { id }, { user, prisma }) => {
      if (!user) throw new AuthenticationError('Not authenticated');

      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) throw new UserInputError('Post not found');

      if (post.authorId !== user.id && user.role !== 'ADMIN') {
        throw new ForbiddenError('Not authorized to delete this post');
      }

      await prisma.post.delete({ where: { id } });
      return true;
    },
  },
};
```

## Input Validation

```typescript
import { z } from 'zod';
import { UserInputError } from 'apollo-server-express';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const resolvers = {
  Mutation: {
    createUser: async (_, { input }, { prisma }) => {
      // Validate input
      const result = createUserSchema.safeParse(input);
      if (!result.success) {
        throw new UserInputError('Validation failed', {
          validationErrors: result.error.flatten().fieldErrors,
        });
      }

      // Check for existing user
      const existing = await prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new UserInputError('Email already registered');
      }

      // Create user
      const hashedPassword = await bcrypt.hash(input.password, 10);
      return prisma.user.create({
        data: {
          ...input,
          password: hashedPassword,
        },
      });
    },
  },
};
```

## Subscriptions

```typescript
import { PubSub, withFilter } from 'graphql-subscriptions';

const pubsub = new PubSub();

const resolvers = {
  Mutation: {
    createPost: async (_, { input }, { user, prisma }) => {
      const post = await prisma.post.create({
        data: { ...input, authorId: user.id },
      });

      // Publish event
      pubsub.publish('POST_CREATED', { postCreated: post });

      return post;
    },
  },

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.asyncIterator(['POST_CREATED']),
    },

    // Filtered subscription
    messageReceived: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MESSAGE_RECEIVED']),
        (payload, variables) => {
          return payload.messageReceived.channelId === variables.channelId;
        }
      ),
    },
  },
};
```

## Error Handling

```typescript
import { ApolloError, UserInputError, AuthenticationError, ForbiddenError } from 'apollo-server-express';

class NotFoundError extends ApolloError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND');
  }
}

const resolvers = {
  Query: {
    user: async (_, { id }, { prisma }) => {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundError('User');
      return user;
    },
  },
};

// Format errors in Apollo Server
const server = new ApolloServer({
  formatError: (error) => {
    // Log error
    console.error(error);

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      if (!error.extensions?.code) {
        return new Error('Internal server error');
      }
    }

    return error;
  },
});
```

**Official docs:** https://graphql.org/learn/execution/
