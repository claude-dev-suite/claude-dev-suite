---
name: nodejs-review
description: |
  Reviewing Node.js runtime code - what to flag beyond the language, and what the toolchain already flags

  USE WHEN: you are reviewing, critiquing or auditing existing Node.js code - a
  "code review" of server code, a CLI, a script, a diff or a PR - and the
  concern is the RUNTIME: the event loop, streams, processes, file handles,
  EventEmitter, unhandled rejections

  DO NOT USE FOR: language-level review - use `review/typescript` for typed code;
  Express/NestJS/Fastify routing - use the framework skills; writing or learning
  Node - use `languages/nodejs`; browser JavaScript, which has none of this
allowed-tools: Read, Grep, Glob
---
# Reviewing Node.js

This skill is about the **runtime**, not the language. Type and syntax findings
belong in `review/typescript`; what follows are defects that exist because the
code runs on a single-threaded event loop with an async I/O layer, and would not
exist in the same code running anywhere else.

The organising fact: **one process, one thread for your code**. Almost every
check below is a way of occupying that thread, or of losing track of work
scheduled on it.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Unhandled promise rejection | the runtime — **crashes the process since Node 15**, so it is loud |
| A promise created and not awaited | `@typescript-eslint/no-floating-promises` — type-aware, so only if configured |
| `require` of a missing module | the runtime, at load |
| Callback called twice, callback never called | nothing |
| Blocking the event loop | nothing |
| A stream written faster than it drains | nothing |
| A listener added per request | nothing until the `MaxListenersExceededWarning`, which is a warning about a symptom |

Rows 4 to 7 are the reason this skill exists: the runtime's most expensive
mistakes have no diagnostic at all.

## The checks that earn their place

### Synchronous I/O on a request path

```js
const cfg = fs.readFileSync(path);        // blocks every other request
const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512');
```

**When you see it**: any `*Sync` call, `execSync`, or a CPU-bound loop inside a
handler, a middleware, or a module that runs per request.

**Ask**: is this on the startup path or the request path? At startup, `Sync` is
often the right choice and worth no comment. Per request, it stops the entire
process — not just this request — and the latency lands on unrelated endpoints,
which is why it is so hard to diagnose from the symptom.

### A stream piped without backpressure

```js
source.on('data', chunk => dest.write(chunk));   // ignores write() returning false
```

**When you see it**: a manual `data`/`write` loop instead of `pipe` or
`pipeline`; `res.write` in a loop over a large result set.

**Ask**: what happens when the destination is slower than the source? `write`
returning `false` means "buffer full"; ignoring it grows the buffer in memory
until the process dies. `pipeline()` also propagates errors and destroys the
streams, which a bare `pipe` does not.

### An error listener that is not attached

```js
const s = fs.createReadStream(p);
s.pipe(res);                                // no 's.on("error", ...)'
```

**When you see it**: a stream, a socket, or a child process without an `error`
handler.

**Ask**: what happens on ENOENT? An `error` event with no listener is rethrown
as an uncaught exception and takes the process down. `pipeline(a, b, cb)` is the
form that routes it.

### A listener added per request or per call

```js
app.get('/x', (req, res) => {
  emitter.on('update', () => res.write('...'));   // never removed
});
```

**When you see it**: `.on(...)` inside a handler, a loop, or a reconnect path;
`process.on('unhandledRejection', ...)` registered in a module loaded many
times.

**Ask**: who removes this? Listeners accumulate on the emitter, hold the closure
and everything it captured, and the only signal is a
`MaxListenersExceededWarning` at 11 — which is a warning about the leak's
*size*, not its existence. `once` or an explicit `off` in a finally.

### `process.exit()` with output still buffered

```js
console.log(report);
process.exit(0);          // stdout to a pipe is async: the write can be lost
```

**When you see it**: `process.exit` immediately after writing output, or inside
a callback.

**Ask**: is stdout a TTY or a pipe here? To a terminal it is synchronous and the
output appears; to a pipe or a file it is asynchronous, and `exit` truncates it.
The bug shows up only when the CLI is used in a script — which is the case that
matters. Setting `process.exitCode` and returning lets the loop drain.

### `spawn` with a shell, or with unvalidated arguments

```js
exec(`convert ${userFile} out.png`);        // a shell parses this
spawn('convert', [userFile, 'out.png']);    // no shell: argv is passed directly
```

**When you see it**: `exec`, `execSync`, or `spawn(..., { shell: true })` with
anything interpolated.

**Ask**: does a shell see this string? `exec` always spawns one, so `;`, `$()`
and backticks in the value are commands. `spawn` with an argv array and
`shell: false` (the default) removes the whole category — and is also faster.

### Unbounded concurrency in a fan-out

```js
await Promise.all(urls.map(u => fetch(u)));   // 10,000 sockets at once
```

**When you see it**: `Promise.all` over an array whose length comes from data
rather than from a constant.

**Ask**: how large can this get? Node will happily open every connection at
once, exhausting file descriptors or the remote's rate limit. A concurrency
limit makes the behaviour a decision instead of an accident. (`Promise.all`'s
partial-failure semantics are a separate concern — see `review/typescript`.)

### A file handle or timer left open on the error path

```js
const fh = await fs.promises.open(p);
const data = await parse(fh);        // throws: the handle is never closed
await fh.close();
```

**When you see it**: `open`, `setInterval`, a socket or a DB connection acquired
without `try/finally`.

**Ask**: does every path release it? An open handle keeps the event loop alive,
so the symptom is often a process that will not exit rather than an error. An
un-`unref`'d `setInterval` does the same thing.

### Module-scope state in a multi-instance deployment

```js
let cache = {};                    // per process, not per app
export function get(k) { return cache[k]; }
```

**When you see it**: mutable module-level state used as a cache, a rate limiter,
a session store, or a lock.

**Ask**: how many processes run this? Under `cluster`, PM2, or any horizontally
scaled deployment, each has its own copy — so a rate limiter allows N times the
limit and a lock locks nothing. It works perfectly on one dev machine.

## Version- and deployment-dependent

| What to read | Why it changes the review |
|---|---|
| `engines` in `package.json`, the CI Node version | Unhandled rejections terminate the process from Node 15; `fetch` is global from 18; `--experimental-strip-types` and stable test runner from 20/22. Do not suggest below the floor |
| `type: module` vs CommonJS | Decides whether top-level `await` exists and whether `__dirname` does |
| Is this clustered or replicated? | Decides whether the module-state finding is real |
| Is it a CLI or a server? | `*Sync` at startup is fine in both; `process.exit` truncation matters mainly for CLIs whose output is piped |
| Worker threads available? | The answer to CPU-bound work, and it changes the advice for the blocking check |

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`pbkdf2Sync` here blocks the event loop for ~100 ms, so every
concurrent request — including health checks — stalls behind it" beats "avoid
sync APIs". If you cannot state the input that fails, it is a preference, not a
defect.

Distinguish startup from request path before commenting on anything synchronous.
That single distinction removes most false positives in Node review.
