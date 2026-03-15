# GraphQL Codegen Client Preset

> See [GraphQL Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset
```

## Configuration

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.tsx', 'src/**/*.ts'],
  ignoreNoDocuments: true,
  generates: {
    './src/gql/': {
      preset: 'client',
      config: {
        documentMode: 'string',
      },
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: {
          unmaskFunctionName: 'getFragmentData',
        },
      },
    },
  },
};

export default config;
```

## Generated Output

```
src/gql/
├── fragment-masking.ts  # Fragment utilities
├── gql.ts               # gql tag function
├── graphql.ts           # Types and documents
└── index.ts             # Re-exports
```

## Usage

### Queries

```typescript
import { gql } from '../gql';
import { useQuery } from '@apollo/client';

const GET_USERS = gql(`
  query GetUsers($limit: Int) {
    users(limit: $limit) {
      id
      name
      email
    }
  }
`);

function UserList() {
  const { data, loading } = useQuery(GET_USERS, {
    variables: { limit: 10 },
  });

  // data.users is fully typed as User[]
}
```

### Mutations

```typescript
const CREATE_USER = gql(`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
      email
    }
  }
`);

function CreateUserForm() {
  const [createUser] = useMutation(CREATE_USER);

  const handleSubmit = async (input: CreateUserInput) => {
    await createUser({ variables: { input } });
  };
}
```

### Fragments

```typescript
import { gql, FragmentType, getFragmentData } from '../gql';

// Define fragment
export const USER_CARD_FRAGMENT = gql(`
  fragment UserCard on User {
    id
    name
    avatarUrl
  }
`);

// Component using fragment
interface Props {
  user: FragmentType<typeof USER_CARD_FRAGMENT>;
}

export function UserCard({ user }: Props) {
  const data = getFragmentData(USER_CARD_FRAGMENT, user);
  return (
    <div>
      <img src={data.avatarUrl} />
      <span>{data.name}</span>
    </div>
  );
}

// Parent query includes fragment
const GET_USER = gql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      ...UserCard
    }
  }
`);

function UserProfile({ id }: { id: string }) {
  const { data } = useQuery(GET_USER, { variables: { id } });
  return data?.user ? <UserCard user={data.user} /> : null;
}
```

## Config Options

```typescript
{
  preset: 'client',
  config: {
    // Use string instead of DocumentNode
    documentMode: 'string',

    // Strict scalar types
    strictScalars: true,
    scalars: {
      DateTime: 'string',
      JSON: 'Record<string, unknown>',
    },

    // Skip typename
    skipTypename: true,

    // Enum as types
    enumsAsTypes: true,
  },
  presetConfig: {
    // gql tag function name
    gqlTagName: 'gql',

    // Fragment masking config
    fragmentMasking: {
      unmaskFunctionName: 'getFragmentData',
    },
  },
}
```

## With urql

```typescript
import { gql } from '../gql';
import { useQuery } from 'urql';

const GET_USER = gql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
    }
  }
`);

function UserProfile({ id }: { id: string }) {
  const [result] = useQuery({
    query: GET_USER,
    variables: { id },
  });

  // result.data is typed
}
```

## Watch Mode

```bash
npx graphql-codegen --watch
```

## Package Scripts

```json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "codegen:watch": "graphql-codegen --watch"
  }
}
```
