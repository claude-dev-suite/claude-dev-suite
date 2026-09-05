---
name: rust-review
description: |
  Reviewing Rust code - what to flag, and what rustc and clippy already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing Rust code - a
  "code review", a "review" of a .rs file, a diff, a PR or a pull request;
  deciding what to comment on in Rust; avoiding false positives on Rust code

  DO NOT USE FOR: writing, explaining or learning Rust - use `languages/rust`;
  anything rustc or a default clippy run already reports (this skill lists those
  so you can stay silent about them); async runtime specifics - use the tokio
  material; FFI binding generation - use `languages/uniffi`
allowed-tools: Read, Grep, Glob
---
# Reviewing Rust

A reviewer's leverage is what the toolchain cannot say — and in Rust the
toolchain says an unusual amount. `rustc` plus a default `clippy` run covers
most of what a reviewer would flag in other languages, so **the "already
covered" list is long and the check list is short**. Reviewing Rust as if it
were C++ produces almost entirely noise.

What remains clusters in four places the compiler cannot reach by construction:
runtime-checked interior mutability, reference cycles, deadlock, and `unsafe`.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Use after move, use after free, dangling reference | `rustc` — borrow checker |
| Data race between threads | `rustc` — `Send`/`Sync` |
| Unhandled `Result` | `rustc` `unused_must_use` (deny-by-default warning) |
| Non-exhaustive `match` | `rustc` |
| Unused variable, unused import | `rustc` |
| `unwrap()` on an `Option` in obvious shapes | clippy `unnecessary_unwrap`, `option_map_unit_fn` |
| Needless clone, needless borrow, needless range loop | clippy `redundant_clone`, `needless_borrow`, `needless_range_loop` |
| Inefficient string building, `&String` parameters | clippy `ptr_arg`, `format_push_string` |
| Integer overflow in debug builds | runtime panic — but **silent wrap in release** |
| Missing `#[must_use]` on a builder | clippy `return_self_not_must_use` |

Clippy's default set is broad and on in most CI. Before commenting, assume it
ran; check `#![allow(...)]` at crate root and `clippy.toml` for what was
switched off, because that is where the interesting exemptions hide.

> **The table above dates; the tools do not.** Verify a default set with
> `mcp__documentation__fetch_docs` on technology `rust-quality` — topics `clippy-lints`, `rustc-lints`, `cargo-profiles`.
> Those entries point at the indexes the tool authors maintain, so they follow
> the version the project actually pins rather than the one this skill was
> written against.

## The checks that earn their place

### `RefCell` moving an aliasing error to runtime

```rust
let a = cell.borrow_mut();
let b = cell.borrow();      // panics: already mutably borrowed
```

**When you see it**: two `borrow`/`borrow_mut` calls whose guards can be alive at
once — often one held across a function call that reaches back into the same
cell.

**Ask**: what is the longest a guard lives here? `RefCell` does not remove the
aliasing rule, it moves the check from compile time to a panic — so the review
question is whether every path releases before re-entering. Re-entrancy through
a callback or an observer is the usual source, and it is invisible locally.

### An `Rc` cycle that never drops

```rust
struct Node { parent: Rc<Node>, children: Vec<Rc<Node>> }   // both strong
```

**When you see it**: `Rc` (or `Arc`) in both directions of a relationship —
parent/child, observer/subject, a graph edge stored on both nodes.

**Ask**: which direction should be `Weak`? Reference counting cannot collect a
cycle, so this is a leak the borrow checker is entirely happy with. Nothing in
the default toolchain reports it.

### A lock held across an `await`

```rust
let guard = state.lock().unwrap();      // std::sync::Mutex
do_io(&guard).await;                    // task can be parked while holding it
```

**When you see it**: a `std::sync` guard alive across an `.await`, or two locks
acquired in different orders in different functions.

**Ask**: can another task need this lock while the first is parked? A blocking
mutex held across a yield point stalls the executor thread; clippy's
`await_holding_lock` catches the direct shape, but not the case where the guard
is passed into a helper that awaits. Lock ordering it cannot see at all.

### Integer arithmetic that wraps in release

```rust
let remaining = total - used;   // panics in debug, wraps silently in release
```

**When you see it**: subtraction on unsigned types, or any arithmetic on values
derived from input, in code that ships as `--release`.

**Ask**: is underflow reachable? Overflow checks are on in debug and **off in
release by default**, so the test suite proves nothing about production. This is
the one Rust defect that behaves differently in the two profiles, which makes it
worth flagging even when tests pass. `checked_sub`/`saturating_sub` say which
behaviour was meant.

### `unsafe` whose invariant is not written down

```rust
unsafe { slice::from_raw_parts(ptr, len) }   // no comment on why this is sound
```

**When you see it**: any `unsafe` block without a `// SAFETY:` comment stating
the invariant the caller must uphold.

**Ask**: what makes this sound, and who guarantees it? The compiler verifies
nothing inside `unsafe`; the block is a claim, and an unstated claim cannot be
re-checked when the surrounding code changes. `clippy::undocumented_unsafe_blocks`
exists but is **not** in the default set.

### `unwrap` on a value whose invariant lives elsewhere

```rust
let cfg = map.get("timeout").unwrap();   // sound only if some other code inserted it
```

**When you see it**: `unwrap`/`expect` on a lookup, a parse, or an index whose
success depends on state established in a different function.

**Ask**: is the invariant enforced or assumed? `unwrap` right after an
`is_some()` on the same value is fine and clippy often rewrites it. `unwrap` on
a map key that came from configuration is a panic waiting for a deployment. An
`expect` with a message naming the invariant is the minimum; propagating the
error is usually better.

### A blocking call inside an async task

```rust
async fn handler() {
    std::fs::read_to_string(path).unwrap();   // blocks the executor thread
}
```

**When you see it**: `std::fs`, `std::net`, `thread::sleep`, or a CPU-heavy loop
inside an `async fn`.

**Ask**: which executor thread runs this? Tokio's worker count is small, so one
blocking call stalls unrelated tasks. `spawn_blocking` is the escape hatch. No
default lint covers this — `tokio::task::block_in_place` misuse included.

### `Drop` order relied upon, or a guard bound to `_`

```rust
let _ = mutex.lock();          // dropped IMMEDIATELY: the lock is not held
let _guard = mutex.lock();     // held to end of scope
```

**When you see it**: `let _ =` on anything returning a guard, a
`tempfile::TempDir`, or a span/tracing handle.

**Ask**: was this meant to live to the end of the scope? `_` and `_name` differ
here and read almost identically — `let _ =` drops at the end of the statement.
This is the single most common way a lock silently stops locking.

### An error type that erases the cause

```rust
.map_err(|_| MyError::Failed)?;   // the original error is discarded
```

**When you see it**: `map_err` with a closure that ignores its argument, or a
`From` impl that drops the source.

**Ask**: how will this be debugged in production? `#[source]` (thiserror) or
`.context(...)` (anyhow) preserves the chain. Discarding it turns a specific
I/O error into a message that names only the layer that gave up.

## Config-dependent - read `Cargo.toml` and the crate root before commenting

| What to read | Why it changes the review |
|---|---|
| `[profile.release] overflow-checks` | Off by default. On, the arithmetic check above becomes a panic rather than a silent wrap, and the finding changes shape |
| `edition` | 2021 changed closure capture to per-field and made `IntoIterator` for arrays work; 2024 changed `unsafe` attribute rules and RPIT lifetime capture. Do not suggest what the edition forbids |
| `#![allow(...)]` at crate root, `clippy.toml` | Where the interesting exemptions hide. A crate-wide `allow(clippy::unwrap_used)` tells you the unwrap findings are deliberate policy, not oversight |
| `unsafe_code = "forbid"` in `[lints]` | If present, the `unsafe` check does not apply — and if absent in a crate that has `unsafe`, that is worth one comment |
| Whether CI runs `cargo clippy -- -D warnings` | If it does not, the entire "already covered" table above moves into your column |

`cargo` has no equivalent of a "default lint set is narrow" problem, but it does
have a **default profile** problem: `cargo test` runs in debug, so overflow
panics there and wraps in the binary users run.

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`let _ = mutex.lock()` drops the guard at the end of this
statement, so the critical section below is unlocked" beats "be careful with
guards". If you cannot state the input that fails, it is a preference, not a
defect.

Rust rewards restraint more than most languages here. The compiler has already
made the review; the value you add is the handful of things it structurally
cannot check, not a second opinion on what it approved.
