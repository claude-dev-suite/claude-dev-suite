// SPDX-License-Identifier: MIT
/**
 * A counting semaphore for bounding fan-out to an external resource.
 *
 * Single-flight removes *duplicate* work; this bounds *distinct* work. A burst
 * of subagents asking for a dozen different technologies at once would still
 * spawn a dozen simultaneous `git clone` processes against the same remote —
 * each one a network round trip, a process, and a chunk of disk. Queuing them
 * behind a small limit costs a little latency and avoids being throttled.
 *
 * FIFO: waiters are released in the order they arrived, so no caller starves.
 */

export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be a positive integer, got ${limit}`);
    }
    this.available = limit;
  }

  /** Acquire a slot, waiting if all are taken. Release with the returned fn. */
  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return this.makeRelease();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return this.makeRelease();
  }

  /** Run `fn` holding a slot; the slot is released even if `fn` throws. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Slots currently free. */
  get free(): number {
    return this.available;
  }

  /** Callers currently queued for a slot. */
  get queued(): number {
    return this.waiters.length;
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      // Guard double-release: it would inflate the limit permanently.
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        next();
      } else {
        this.available = Math.min(this.available + 1, this.limit);
      }
    };
  }
}
