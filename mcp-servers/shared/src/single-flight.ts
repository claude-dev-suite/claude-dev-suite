// SPDX-License-Identifier: MIT
/**
 * Single-flight: collapse concurrent work on the same key into one execution.
 *
 * The MCP SDK dispatches requests concurrently — `Protocol._onresponse` calls
 * `_onrequest` without awaiting it — so a server talking to up to a dozen
 * subagents can be inside the same expensive operation a dozen times at once.
 * Every one of those calls did the same `git clone`, rebuilt the same index,
 * or probed the same socket.
 *
 * `SingleFlight` gives the first caller for a key the real work and hands
 * every concurrent caller the *same* promise. The entry is dropped as soon as
 * the promise settles, so this is a de-duplicator, not a cache: a later call
 * runs the work again.
 *
 * Failures propagate to every waiter. That is deliberate — a shared failure is
 * still one attempt rather than N, and callers that want a cooled-off retry
 * layer a negative cache on top.
 */

export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  /**
   * Run `fn` for `key`, or join the run already in progress for it.
   *
   * `fn` is invoked at most once per concurrent group. It is called
   * synchronously inside `run`, so a synchronous throw is turned into a
   * rejected promise shared by the whole group.
   */
  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    let promise: Promise<T>;
    try {
      promise = fn();
    } catch (err) {
      // A synchronous throw never registers an entry, so the next caller
      // retries instead of joining a group that never existed.
      return Promise.reject(err);
    }

    // `finally` runs before the waiters' handlers, so the key is free again
    // by the time anyone can observe the result.
    const tracked = promise.finally(() => {
      if (this.inFlight.get(key) === tracked) {
        this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, tracked);
    return tracked;
  }

  /** Whether work for `key` is currently in flight. */
  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  /** The in-flight promise for `key`, if any. */
  peek(key: string): Promise<T> | undefined {
    return this.inFlight.get(key);
  }

  /** Number of distinct keys currently in flight. */
  get size(): number {
    return this.inFlight.size;
  }
}
