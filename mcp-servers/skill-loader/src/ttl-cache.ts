// SPDX-License-Identifier: MIT
/**
 * A TTL cache with a bound on how much it may hold.
 *
 * The original cache had a TTL but no bound and no eviction: entries were only
 * ever dropped when someone happened to ask for an expired key again. A long
 * session that loaded a few hundred skill bodies kept every one of them alive
 * in a server that is meant to be the lightweight alternative to copying those
 * files into the project.
 *
 * Eviction is least-recently-used: `get` moves the key to the end of the Map's
 * insertion order, so the oldest key is the first one iteration yields.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  /**
   * @param ttlMs   How long an entry stays valid.
   * @param maxEntries Hard bound on retained entries; the least recently used
   *   is evicted past it.
   */
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 256
  ) {
    if (maxEntries < 1) throw new Error("maxEntries must be at least 1");
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Re-insert to mark it as most recently used.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Delete first so an update also refreshes recency.
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }

  /** Entries currently retained, expired ones included. */
  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
