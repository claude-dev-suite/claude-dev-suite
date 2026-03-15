# GraphQL Schema Quick Reference

> **Knowledge Base:** Read `knowledge/graphql/schema.md` for complete documentation.

## Type Definitions

```graphql
# Scalar types
type User {
  id: ID!
  name: String!
  email: String!
  age: Int
  balance: Float
  isActive: Boolean!
  createdAt: DateTime
}

# Object type
type Post {
  id: ID!
  title: String!
  content: String
  author: User!
  comments: [Comment!]!
  tags: [String!]
  createdAt: DateTime!
}

# Enum
enum Role {
  USER
  ADMIN
  MODERATOR
}

# Interface
interface Node {
  id: ID!
}

type User implements Node {
  id: ID!
  name: String!
}

# Union
union SearchResult = User | Post | Comment

# Input type
input CreateUserInput {
  name: String!
  email: String!
  password: String!
  role: Role = USER
}

input UpdateUserInput {
  name: String
  email: String
}
```

## Query & Mutation

```graphql
type Query {
  # Single item
  user(id: ID!): User
  post(id: ID!): Post

  # Lists
  users(
    first: Int
    after: String
    filter: UserFilter
    orderBy: UserOrderBy
  ): UserConnection!

  # Search
  search(query: String!): [SearchResult!]!
}

type Mutation {
  # Create
  createUser(input: CreateUserInput!): User!

  # Update
  updateUser(id: ID!, input: UpdateUserInput!): User!

  # Delete
  deleteUser(id: ID!): Boolean!

  # Actions
  login(email: String!, password: String!): AuthPayload!
  logout: Boolean!
}

# Subscription
type Subscription {
  postCreated: Post!
  messageReceived(channelId: ID!): Message!
}
```

## Pagination (Relay Cursor)

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Query
type Query {
  users(
    first: Int
    after: String
    last: Int
    before: String
  ): UserConnection!
}
```

## Directives

```graphql
# Built-in
type User {
  id: ID!
  password: String! @deprecated(reason: "Use auth service")
  secretField: String @skip(if: $skipSecret)
  publicField: String @include(if: $includePublic)
}

# Custom directives
directive @auth(requires: Role = USER) on FIELD_DEFINITION
directive @rateLimit(limit: Int!, duration: Int!) on FIELD_DEFINITION
directive @cacheControl(maxAge: Int!) on FIELD_DEFINITION

type Query {
  me: User! @auth
  users: [User!]! @auth(requires: ADMIN)
  posts: [Post!]! @rateLimit(limit: 100, duration: 60)
  publicData: Data @cacheControl(maxAge: 3600)
}
```

## Custom Scalars

```graphql
scalar DateTime
scalar JSON
scalar Upload
scalar Email
scalar URL

type User {
  createdAt: DateTime!
  metadata: JSON
  avatar: Upload
  email: Email!
  website: URL
}
```

## Error Handling

```graphql
# Union for result types
type CreateUserSuccess {
  user: User!
}

type CreateUserError {
  message: String!
  code: String!
  field: String
}

union CreateUserResult = CreateUserSuccess | CreateUserError

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
}

# Query usage
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    ... on CreateUserSuccess {
      user {
        id
        email
      }
    }
    ... on CreateUserError {
      message
      code
      field
    }
  }
}
```

## Full Schema Example

```graphql
scalar DateTime

enum Role {
  USER
  ADMIN
}

type User {
  id: ID!
  email: String!
  name: String!
  role: Role!
  posts: [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  published: Boolean!
  createdAt: DateTime!
}

input CreatePostInput {
  title: String!
  content: String!
  published: Boolean = false
}

type Query {
  me: User
  user(id: ID!): User
  users: [User!]!
  post(id: ID!): Post
  posts(published: Boolean): [Post!]!
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  updatePost(id: ID!, input: CreatePostInput!): Post!
  deletePost(id: ID!): Boolean!
  publishPost(id: ID!): Post!
}

type Subscription {
  postPublished: Post!
}
```

**Official docs:** https://graphql.org/learn/schema/
