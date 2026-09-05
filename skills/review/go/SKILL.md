---
name: go-review
description: |
  Reviewing Go code - what to flag, and what the toolchain already flags for you

  USE WHEN: you are reviewing, critiquing or auditing existing Go code - a "code
  review", a "review" of a .go file, a diff, a PR or a pull request; deciding
  what to comment on in Go; avoiding false positives on Go code

  DO NOT USE FOR: writing, explaining or learning Go - use `languages/go`;
  anything `go vet` or a default golangci-lint run already reports (this skill
  lists those so you can stay silent about them); framework specifics - use the
  Gin/Echo/Fiber skills
allowed-tools: Read, Grep, Glob
---
# Reviewing Go

A reviewer's leverage is what the toolchain cannot say. Every check below
describes a defect that survives the compiler, `go vet`, and a default
golangci-lint run (`errcheck`, `govet`, `ineffassign`, `staticcheck`, `unused`).

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered — do not spend review on it

| Defect | Reported by |
|---|---|
| Unchecked error return | `errcheck` (default) |
| Copying a `sync.Mutex` or any lock by value | `go vet` (`copylocks`) |
| `Printf` verb/argument mismatch | `go vet` (`printf`) |
| Unused variable, unused import | the compiler |
| Unreachable code | `go vet` (`unreachable`) |
| `wg.Add` called inside the goroutine it counts | staticcheck `SA2000` (default); `go vet` (`waitgroup`) from Go 1.25 |
| `defer` inside `for … range <channel>` with no `break`/`return` | staticcheck `SA9001` |
| Pre-1.22 loop variable captured by a `go`/`defer` as the last statement of the body | `go vet` (`loopclosure`) |
| Struct field alignment and padding | `fieldalignment` (opt-in, but a linter question either way) |

If the project has no linter configured, that is one review comment about CI —
not thirty comments doing the linter's job by hand.

> **The table above dates; the tools do not.** Verify a default set with
> `mcp__documentation__fetch_docs` on technology `go-quality` — topics `go-vet`, `staticcheck-checks`, `golangci-lint-linters`.
> Those entries point at the indexes the tool authors maintain, so they follow
> the version the project actually pins rather than the one this skill was
> written against.

## The checks that earn their place

### A typed nil in an interface is not a nil interface

```go
type MyError struct{ msg string }

func (e *MyError) Error() string { return e.msg }

func find() *MyError { return nil }   // a typed nil

var err error = find()   // err != nil: the interface holds (*MyError, nil)
if err != nil { /* taken */ }
```

**When you see it**: a function returning a concrete pointer type whose result is
assigned to `error` or any interface; an interface-typed struct field assigned
from a typed nil.

**Ask**: does any path put a typed nil into an interface? Return the interface
type, or return a literal `nil` on the success path.

Not reported by anything in the default set. (`nilness` catches a narrow subset,
but it is an opt-in x/tools pass, not part of `go vet`.)

### Errors compared instead of matched

```go
if err == sql.ErrNoRows { }          // breaks as soon as anything wraps it
if errors.Is(err, sql.ErrNoRows) { } // survives %w
```

**When you see it**: `==` against a sentinel error, or a type assertion
`err.(*MyError)` where `errors.As` belongs.

**Ask**: does any layer between the source and this comparison wrap with `%w`?
When a wrap is added later, `==` silently stops matching: the branch quietly
stops being taken and nothing fails loudly. (`errorlint` would catch this, but it
is not in the default set.)

### The iteration error is never checked

```go
for rows.Next() {
    // scan
}
return items, nil   // a network error ended the loop exactly like a full result set
```

**When you see it**: `for rows.Next()`, `for scanner.Scan()` — any iterator with a
separate `Err()` — and no `rows.Err()` / `scanner.Err()` after the loop.

**Ask**: how does this function distinguish "read everything" from "stopped
early"? It cannot, and the caller gets a truncated result with a nil error.

No linter can report this: `errcheck` only inspects calls that are written, and
here the call is missing.

### A mutation applied to the range copy

```go
for _, cfg := range configs {
    cfg.Enabled = true   // writes to a copy; discarded at the next iteration
}
```

**When you see it**: an assignment to a field of the value variable of a
`range` over a slice or map of structs.

**Ask**: was this meant to mutate the collection? Then it needs `configs[i]` or a
slice of pointers. Worth checking deliberately since Go 1.22: people now assume
"the loop variable problem" is fixed, and this is the part that never changed.

### A lock held across something that can block

```go
mu.Lock()
if err := callService(ctx); err != nil {   // I/O inside the critical section
    return err                             // and an early return with no Unlock
}
mu.Unlock()
```

**When you see it**: `Lock()` without an immediate `defer Unlock()`, or a
critical section containing I/O, a channel send, or a second lock.

**Ask**: does every path release it, and what is the worst case for a caller
waiting on this mutex while that call hangs? `copylocks` covers copying a lock,
never how long one is held.

### A goroutine with no way to stop

```go
go func() {
    for range ticker.C { poll() }   // lives until the process exits
}()
```

**When you see it**: `go func` containing a loop, with no `ctx.Done()`, no quit
channel, and no way for the caller to observe completion.

**Ask**: who stops this, and how does the caller learn that it stopped? A leaked
goroutine holding a connection or a lock is invisible until the process is.

### `err` shadowed by an inner declaration

```go
var err error
if err := do(); err != nil {   // inner err shadows the outer one
    log.Print(err)
}
return err                      // always nil
```

**When you see it**: `:=` binding `err` inside an `if`, `for` or block where an
outer `err` is the one returned.

**Ask**: which `err` does the return statement see? `go vet`'s `shadow` analyzer
finds these, but it is **not** in the default set and golangci-lint requires
`govet: enable: shadow`, so in most repositories nothing reports it.

### `defer` in a loop over an unbounded input

```go
for _, path := range paths {
    f, err := os.Open(path)
    if err != nil { return err }
    defer f.Close()   // runs at function exit, not iteration exit
}
```

**When you see it**: a `defer` whose enclosing block is a loop body — over a
slice, a map, or a paginated source. (`SA9001` already covers the channel-range
form, so that one is not yours.)

**Ask**: is the input bounded? Over a large or unbounded one this is a file
descriptor leak. The fix is a closure per iteration, or an explicit `Close()` on
both paths.

### A sub-slice handed to a second owner

```go
b := a[:1]
b = append(b, x)   // capacity permitting, this overwrites a[1]
```

**When you see it**: a slice expression (`s[:n]`, `s[i:j]`) stored somewhere else
or returned, and later appended to by either owner.

**Ask**: do two owners now share one backing array? The aliasing stays invisible
until one of them appends within capacity and silently rewrites the other's data.

### `context.Background()` below the entry point

**When you see it**: `context.Background()` or `context.TODO()` in a function
that — or whose immediate caller — already has a `ctx context.Context` parameter.

**Ask**: why is the in-scope context not threaded through? Starting a fresh one
mid-stack opts that call out of every deadline and cancellation the caller set
up. (`contextcheck` would find it; not in the default set.)

## Version-dependent — read `go.mod` before commenting

**Loop variable capture.** Before Go 1.22 the loop variable was shared across
iterations — for `range` loops *and* three-clause `for` loops — so a closure
capturing it saw the final value.

```go
for _, v := range items {
    go func() { use(v) }()   // pre-1.22: every goroutine sees the last v
}
```

Since Go 1.22 each iteration gets its own variable and **this is no longer a
defect**. Three things decide whether it applies:

- The module's `go` directive, not the installed toolchain, selects the
  semantics; a single file can override it with a `//go:build go1.21` constraint.
- On pre-1.22 modules the common shape above is already reported by
  `loopclosure`, which is in `go vet`'s default set — so the residual value here
  is narrow.
- **It still bites on any version** when the variable is declared *outside* the
  loop (`v := …; for v = range …`): that one is still shared, and it is the case
  worth looking for now.

**Timers from `time.After` in a loop.** On modules with `go >= 1.23` an
unreferenced timer becomes collectable immediately, so the old "leaks until it
fires" framing is wrong. What remains is a timer allocated per iteration:

```go
for {
    select {
    case v := <-ch:  handle(v)
    case <-time.After(time.Second):
    }
}
```

On a hot channel that is allocation and CPU per message, worth a comment as
cost — and on a pre-1.23 module, still retention until each timer fires.

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "this returns a typed nil into an `error`, so `if err != nil` is
always true for callers" beats "avoid typed nils". If you cannot state the input
that fails, it is a preference, not a defect.
