# TypeScript Utility Types

> **Knowledge Base:** Read `knowledge/typescript/utility-types.md` for complete documentation.

## Object Types

```ts
interface User {
  id: number;
  name: string;
  email: string;
  password: string;
}

// Partial - all optional
type PartialUser = Partial<User>;
// { id?: number; name?: string; ... }

// Required - all required
type RequiredUser = Required<PartialUser>;

// Readonly - immutable
type ReadonlyUser = Readonly<User>;

// Pick - select properties
type UserPreview = Pick<User, 'id' | 'name'>;
// { id: number; name: string }

// Omit - exclude properties
type PublicUser = Omit<User, 'password'>;
// { id: number; name: string; email: string }
```

## Record & Extract

```ts
// Record - object with keys of K and values of T
type UserMap = Record<string, User>;
type StatusCode = Record<number, string>;

const codes: StatusCode = {
  200: 'OK',
  404: 'Not Found',
};

// Extract - types assignable to U
type T = Extract<'a' | 'b' | 'c', 'a' | 'f'>; // 'a'

// Exclude - types not assignable to U
type T = Exclude<'a' | 'b' | 'c', 'a'>; // 'b' | 'c'
```

## Function Types

```ts
function greet(name: string, age: number): string {
  return `Hello ${name}, age ${age}`;
}

// Parameters - tuple of param types
type GreetParams = Parameters<typeof greet>;
// [name: string, age: number]

// ReturnType - return type
type GreetReturn = ReturnType<typeof greet>;
// string

// Awaited - unwrap Promise
type Data = Awaited<Promise<User>>;
// User
```

## NonNullable & Conditional

```ts
// NonNullable - exclude null/undefined
type T = NonNullable<string | null | undefined>;
// string

// Custom conditional
type IsString<T> = T extends string ? true : false;

type A = IsString<'hello'>; // true
type B = IsString<42>;      // false
```

## Template Literal Types

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Endpoint = `/api/${string}`;

type Route = `${HttpMethod} ${Endpoint}`;
// 'GET /api/...' | 'POST /api/...' | ...

// Uppercase/Lowercase
type Upper = Uppercase<'hello'>; // 'HELLO'
type Lower = Lowercase<'HELLO'>; // 'hello'
type Cap = Capitalize<'hello'>;  // 'Hello'
```

## Practical Examples

```ts
// API response wrapper
type ApiResponse<T> = {
  data: T;
  error?: string;
  status: number;
};

// Update function type
type UpdateUser = (
  id: number,
  data: Partial<Omit<User, 'id'>>
) => Promise<User>;

// Event handler types
type EventMap = {
  click: MouseEvent;
  keydown: KeyboardEvent;
  submit: Event;
};

type EventHandler<K extends keyof EventMap> = (
  event: EventMap[K]
) => void;

// Deep partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

**Official docs:** https://www.typescriptlang.org/docs/handbook/utility-types.html
