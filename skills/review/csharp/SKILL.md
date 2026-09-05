---
name: csharp-review
description: |
  Reviewing C# code - what to flag, and what Roslyn analyzers and nullable reference types already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing C# code - a
  "code review", a "review" of a .cs file, a diff, a PR or a pull request;
  deciding what to comment on in C#; avoiding false positives on C# code

  DO NOT USE FOR: writing, explaining or learning C# - use `languages/csharp`;
  anything the built-in Roslyn analyzers or nullable reference types already
  report (this skill lists those so you can stay silent about them); ASP.NET
  Core specifics - use the ASP.NET skills; EF Core mapping - use the ORM skills
allowed-tools: Read, Grep, Glob
---
# Reviewing C#

A reviewer's leverage is what the toolchain cannot say. C# ships a large
analyzer set in the SDK, but two of its most valuable guarantees are **opt-in
per project** — nullable reference types and warnings-as-errors — so the first
thing to establish is which of them this project turned on.

The findings that remain cluster around async, disposal, and the places where a
compile-time guarantee is erased at runtime.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Dereferencing a possibly-null reference | `CS8602` — **only when `<Nullable>enable</Nullable>`** |
| An `async` method with no `await` | `CS1998` (warning, on by default) |
| Unawaited task in an `async` method | `CS4014` (warning) |
| Unused local, unreachable code | `CS0219`, `CS0162` |
| Disposable created and not disposed, simple shapes | `CA2000` — **only if code analysis is enabled** |
| `ConfigureAwait` missing in a library | `CA2007` — opt-in, off by default in most templates |
| Sync-over-async (`.Result`, `.Wait()`) | no built-in rule; some analyzer packages add one |
| String comparison without `StringComparison` | `CA1310` — opt-in |

**Read the `.csproj` first.** `<Nullable>`, `<TreatWarningsAsErrors>` and
`<AnalysisLevel>` decide whether rows 1, 5, 6 and 8 exist at all. A project with
nullable disabled has no null guarantees whatsoever, and that is one
architectural comment, not a per-line campaign.

## The checks that earn their place

### `async void` outside an event handler

```csharp
async void ProcessAsync() { await work(); }   // exceptions cannot be caught
```

**When you see it**: `async void` on anything that is not an event handler
matching a delegate signature.

**Ask**: where does an exception from this go? An `async void` method has no
task to carry the failure, so a throw reaches the synchronization context and
terminates the process. The caller cannot await it or catch it. `async Task` is
the fix, and the shape is easy to miss because it compiles and usually works.

### Sync-over-async

```csharp
var user = GetUserAsync(id).Result;   // blocks; deadlocks on a context with affinity
```

**When you see it**: `.Result`, `.Wait()`, `.GetAwaiter().GetResult()` on a task
whose continuation may need the calling thread.

**Ask**: is there a synchronization context here? In ASP.NET Core there is not,
so this is "only" thread-pool starvation under load. In WPF, WinForms and
classic ASP.NET it is a hard deadlock: the continuation waits for a thread the
caller is blocking. The symptom is a hang, not an exception.

### A `CancellationToken` accepted and never passed on

```csharp
async Task<Data> LoadAsync(CancellationToken ct) {
    return await http.GetAsync(url);      // ct not forwarded
}
```

**When you see it**: a method taking a `CancellationToken` whose body calls
other async APIs without it.

**Ask**: does cancellation actually reach the I/O? The signature promises
cooperative cancellation and the body does not deliver it, so a cancelled
request keeps its connection and its thread. Nothing reports it — the parameter
is "used" as far as the compiler is concerned.

### `IDisposable` created inside a using-less path

```csharp
var conn = new SqlConnection(cs);      // no using, no dispose
if (!TryOpen(conn)) return;            // leaks on this path
```

**When you see it**: any `IDisposable` assigned to a local without `using`,
especially where an early return or a throw sits between creation and disposal.

**Ask**: which paths dispose it? `CA2000` catches simple shapes only, and is off
unless code analysis is enabled. Also check the opposite error: `using` on an
injected `HttpClient`, which disposes something the container owns.

### A `struct` mutated through a property or a copy

```csharp
readonly struct Point { public int X { get; init; } }
list[0].X = 5;                          // does not compile for List<T> — but
var p = dict["k"]; p.X = 5;             // mutates a COPY, silently
```

**When you see it**: a mutable `struct`, or any `struct` retrieved from a
collection, a property, or a `foreach` variable and then modified.

**Ask**: is this the original or a copy? Value semantics mean every access
returns a copy, so the write lands somewhere that is discarded. Making structs
`readonly` turns the mistake into a compile error, which is why the guidance
exists.

### A nullable warning suppressed rather than answered

```csharp
var name = user!.Name;                 // `!` asserts; nothing verified it
#nullable disable                      // or the whole file opts out
```

**When you see it**: `!` (null-forgiving), `#nullable disable`, or
`[AllowNull]`/`[MaybeNull]` used to quiet a warning.

**Ask**: what establishes non-null here? `!` is the C# equivalent of a cast: it
changes the compiler's belief and nothing about the value. It is legitimate
right after a check the compiler cannot see; it is a defect when it stands in
for the check itself.

### An `IEnumerable` enumerated more than once

```csharp
var rows = db.Query(sql);              // deferred, not materialised
if (rows.Any()) return rows.First();   // two round trips, two result sets
```

**When you see it**: an `IEnumerable`/`IQueryable` parameter or local used in
more than one LINQ operation, especially across `Any()`/`Count()`/`First()`.

**Ask**: is this deferred? Each enumeration re-executes the query or the
generator, so the cost is silent and the two passes can disagree if the source
changed. `ToList()` at the boundary makes the decision explicit.

### `DateTime` where the kind is not carried

```csharp
var now = DateTime.Now;                // local, kind=Local
Store(now);                            // read back as Unspecified
```

**When you see it**: `DateTime.Now`, or a `DateTime` crossing a persistence or
serialisation boundary.

**Ask**: is the offset preserved? `DateTimeKind` is not stored by most
providers, so a round trip returns `Unspecified` and later arithmetic silently
assumes local. `DateTimeOffset` carries the offset, and `DateTime.UtcNow` is the
minimum.

### A captured loop variable in a closure

```csharp
for (int i = 0; i < n; i++)
    tasks.Add(Task.Run(() => Use(i)));   // all tasks may see the final i
```

**When you see it**: a lambda capturing the iteration variable of a
**three-clause `for`** loop.

**Ask**: is this a `for` or a `foreach`? C# 5 changed `foreach` so each iteration
gets a fresh variable — that case is fixed and not worth a comment. The
three-clause `for` was never changed, and it is the one that still captures a
single shared variable.

## Config-dependent - read the `.csproj` and `Directory.Build.props`

| What to read | Why it changes the review |
|---|---|
| `<Nullable>` | Disabled (still the default in older templates): there are **no** null guarantees, every reference is implicitly nullable, and the `!` findings above do not even apply |
| `<TreatWarningsAsErrors>` | Without it, `CS1998` and `CS4014` are warnings in a build log nobody reads |
| `<AnalysisLevel>` / `<EnableNETAnalyzers>` | Decides whether the `CA` rules ran at all |
| `<LangVersion>` / TFM | `record`, `init`, file-scoped namespaces, `required` members each have a floor — do not suggest below it |
| Whether this is a library | `ConfigureAwait(false)` matters in libraries and is noise in an ASP.NET Core app, which has no synchronization context |

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`.Result` here blocks the request thread, and on a context
with affinity the continuation needs that same thread, so this hangs rather than
throwing" beats "avoid sync-over-async". If you cannot state the input that
fails, it is a preference, not a defect.

If `<Nullable>` is disabled, say that once and stop reporting individual
nullability findings — they are all instances of the same decision.
