---
name: typescript-review
description: |
  Reviewing TypeScript code - what to flag, and what the compiler and linter already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing TypeScript or
  TSX code - a "code review", a "review" of a .ts/.tsx file, a diff, a PR or a
  pull request; deciding what to comment on in TypeScript; avoiding false
  positives on typed JavaScript

  DO NOT USE FOR: writing, explaining or learning TypeScript - use
  `languages/typescript`; anything `tsc` under `strict` or a default
  typescript-eslint run already reports (this skill lists those so you can stay
  silent about them); React-specific review - pair with the React skills; lint
  rule configuration - use `quality/typescript-eslint`
allowed-tools: Read, Grep, Glob
---
# Reviewing TypeScript

A reviewer's leverage is what the toolchain cannot say. Every check below
describes a defect that survives `tsc --strict` and a default
`typescript-eslint` run.

TypeScript has a second trap Go does not: **the compiler's strictness is a
setting**. Half of what follows depends on `tsconfig.json`, so read it before
you comment - see the config-dependent section.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Unused local, unused parameter | `noUnusedLocals` / `noUnusedParameters`, `@typescript-eslint/no-unused-vars` |
| Explicit `any` in a signature | `@typescript-eslint/no-explicit-any` (recommended) |
| `==` where `===` belongs | `eqeqeq` |
| A promise created and never used | `@typescript-eslint/no-floating-promises` - **type-aware only**, so absent unless the project enables type-checked linting |
| `await` on a non-thenable | `@typescript-eslint/await-thenable` (type-aware) |
| Unreachable code after `return` | `allowUnreachableCode: false` |
| Missing `return` on some path | `noImplicitReturns` |
| Implicit `any` parameter | `noImplicitAny` (part of `strict`) |

Check whether type-aware linting is on before assuming the promise rules ran:
they need `parserOptions.project`, and many repos never enable it. If they are
off, floating promises **are** worth reviewing by hand - that is a config
finding plus a code finding, not one comment.

> **The table above dates; the tools do not.** Verify a default set with
> `mcp__documentation__fetch_docs` on technology `eslint` — topics `rules`, `typescript-eslint` — and `typescript`/`tsconfig` for the compiler settings.
> Those entries point at the indexes the tool authors maintain, so they follow
> the version the project actually pins rather than the one this skill was
> written against.

## The checks that earn their place

### A type assertion that launders a lie

```ts
const user = JSON.parse(body) as User;   // no validation happened
const el = document.getElementById('x') as HTMLInputElement;  // may be null
```

**When you see it**: `as T` on a value crossing a trust boundary - a parsed
payload, a DOM lookup, a `fetch` result, a database row.

**Ask**: what checked that this is actually a `User`? An assertion changes the
type and nothing else; every downstream `strict` guarantee is now resting on it.
The fix is a validator (zod, a type guard) or accepting `unknown` and narrowing.

`no-explicit-any` does not fire here - the code never says `any`, it says
something worse: a specific type that is not true.

### A type predicate that is not checked

```ts
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null;   // does not check a single field
}
```

**When you see it**: any function returning `x is T`.

**Ask**: does the body actually establish `T`? The compiler takes the predicate
on faith - it verifies the *return type is boolean*, never that the check is
sound. A wrong predicate is an assertion with extra steps, and it silently
poisons every narrowed branch.

### A non-null assertion standing in for a real check

```ts
const cfg = map.get(key)!;   // `!` says "trust me"; the map may not have it
```

**When you see it**: `!` after an indexed access, a `Map.get`, a `find`, or an
optional property.

**Ask**: what guarantees presence *here*? If it is an invariant, an explicit
throw documents it and fails loudly; `!` fails as `undefined` propagating into
something far away. Distinguish the two cases: `!` right after a `has()` check
on the same key is fine, `!` on a lookup whose key came from input is not.

### Optional chaining that swallows the interesting case

```ts
const total = order?.items?.reduce(sum, 0) ?? 0;   // a missing order reads as 0
```

**When you see it**: `?.` on a value the surrounding logic assumes exists,
especially followed by `?? 0`, `?? []` or `?? ''`.

**Ask**: is absence genuinely equivalent to empty? A zero total for a missing
order is not a safer answer than an error - it is a wrong answer that no longer
looks wrong. `?.` is right when absence is a real, expected state.

### `catch (e)` narrowed by assumption

```ts
try { } catch (e) {
  logger.error(e.message);   // e is `unknown`; and anything can be thrown
}
```

**When you see it**: property access on a catch binding.

**Ask**: is this reachable with a non-`Error` throw? A rejected promise carrying
a string, a `throw` from a library, a DOMException. Under
`useUnknownInCatchVariables` (on with `strict` since 4.4) the compiler stops the
direct access - but an `as Error` right after it is the same defect wearing a
hat, and that compiles.

### An `await` that was never written inside a callback

```ts
items.forEach(async (item) => {
  await save(item);          // forEach ignores the returned promise
});
done();                      // runs before any save finishes
```

**When you see it**: an `async` callback handed to `forEach`, `map` without
`Promise.all`, or any API whose signature returns `void`.

**Ask**: does the caller need these to be finished? `no-floating-promises` does
not fire, because `forEach` swallows the promise rather than the code
discarding it. `for...of` with `await`, or `Promise.all(items.map(...))`, is the
fix - and those two differ in concurrency, so pick deliberately.

### `Promise.all` where partial failure is the normal case

```ts
const results = await Promise.all(userIds.map(fetchProfile));
```

**When you see it**: `Promise.all` over anything that can fail independently -
network calls, per-tenant work, a fan-out over user input.

**Ask**: what should happen when one fails? `all` rejects on the first
rejection, abandons the results of everything that succeeded, and leaves the
other promises running unobserved. If partial success is meaningful, that is
`allSettled`.

### A shallow copy treated as a deep one

```ts
const next = { ...state };
next.filters.tags.push('new');   // mutates the original's nested array
```

**When you see it**: spread or `Object.assign` followed by a write to a nested
property; `readonly` on a type whose members are objects.

**Ask**: is anything else holding the nested reference? `readonly` in TypeScript
is one level deep and erased at runtime - it stops `next.filters = ...` and says
nothing about `next.filters.tags.push(...)`.

### An index access typed as present

```ts
const first = rows[0];      // typed `Row`, not `Row | undefined`
first.id;                   // no error, throws at runtime on an empty array
```

**When you see it**: indexing an array or a `Record<string, T>` by a computed
key, then using the result directly.

**Ask**: is `noUncheckedIndexedAccess` on? It is **not** part of `strict`, so in
most projects this is invisible to the compiler and every array access is a
claim that the index exists.

### A discriminated union with no exhaustiveness guard

```ts
switch (action.type) {
  case 'add':    return add(action);
  case 'remove': return remove(action);
}   // a third variant added later returns undefined, silently
```

**When you see it**: a `switch` over a union discriminant with no `default`.

**Ask**: what happens when a variant is added? A `default` that assigns to
`never` turns that future change into a compile error at exactly the right
place. Without it the function's return type quietly becomes `T | undefined`.

### Numeric sort left to the default comparator

```ts
[10, 9, 100].sort();   // [10, 100, 9] - compares as strings
```

**When you see it**: `.sort()` with no comparator on anything not already
strings.

**Ask**: are these numbers? Nothing reports it; the signature is satisfied.

## Config-dependent - read `tsconfig.json` before commenting

Half the checks above are only defects under a given configuration. Read the
config the reviewed file actually resolves to - a monorepo has several, and
`extends` chains matter.

| Setting | In `strict`? | What its absence means for the review |
|---|---|---|
| `strict` | - | Off: implicit `any` and unchecked null are everywhere; that is one architectural comment, not a per-line campaign |
| `strictNullChecks` | yes | Off: **every** nullability finding above is invisible to the compiler and worth reviewing by hand |
| `useUnknownInCatchVariables` | yes (4.4+) | Off: `catch (e)` is `any`, so `e.message` compiles and the catch check applies |
| `noUncheckedIndexedAccess` | **no** | Off (the common case): array and record access lie about presence |
| `exactOptionalPropertyTypes` | **no** | Off: an optional property silently accepts an explicit `undefined`, which behaves differently from an absent key in `Object.keys`, spread and JSON |
| `verbatimModuleSyntax` | **no** | Off: a type-only import can survive into emitted JS and drag a runtime dependency with it |

If the project sets `skipLibCheck` (most do), remember that nothing verified the
`.d.ts` files a third-party type assertion is resting on.

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`rows[0]` is typed `Row` but `noUncheckedIndexedAccess` is off,
so an empty result throws on `.id` here" beats "be careful with array access".
If you cannot state the input that fails, it is a preference, not a defect.

State configuration findings once, at the top, not once per line they enable.
