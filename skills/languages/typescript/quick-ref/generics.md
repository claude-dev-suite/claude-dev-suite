# TypeScript Generics

> **Knowledge Base:** Read `knowledge/typescript/generics.md` for complete documentation.

## Basic Generics

```ts
// Generic function
function identity<T>(value: T): T {
  return value;
}

const num = identity<number>(42);
const str = identity('hello'); // Type inferred

// Generic interface
interface Box<T> {
  value: T;
}

const numBox: Box<number> = { value: 42 };
```

## Generic Constraints

```ts
// Extend constraint
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

getLength('hello');     // OK
getLength([1, 2, 3]);   // OK
getLength({ length: 5 }); // OK

// keyof constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'John', age: 30 };
getProperty(user, 'name'); // OK
getProperty(user, 'invalid'); // Error
```

## Generic Classes

```ts
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }
}

const numberStack = new Stack<number>();
numberStack.push(1);
```

## Multiple Type Parameters

```ts
function pair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}

const result = pair('hello', 42); // [string, number]

// Map function
function mapArray<T, U>(arr: T[], fn: (item: T) => U): U[] {
  return arr.map(fn);
}
```

## Default Type Parameters

```ts
interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

const response: ApiResponse = { data: {}, status: 200 };
const userResponse: ApiResponse<User> = { data: user, status: 200 };
```

## Conditional Types

```ts
type NonNullable<T> = T extends null | undefined ? never : T;

type IsArray<T> = T extends any[] ? true : false;

type ElementType<T> = T extends (infer E)[] ? E : never;

type Str = ElementType<string[]>; // string
```

## Generic Utility Functions

```ts
// API wrapper
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

const users = await fetchData<User[]>('/api/users');

// Factory function
function createStore<T>(initial: T) {
  let state = initial;
  return {
    get: () => state,
    set: (value: T) => { state = value; },
  };
}

const counterStore = createStore(0);
```

**Official docs:** https://www.typescriptlang.org/docs/handbook/2/generics.html
