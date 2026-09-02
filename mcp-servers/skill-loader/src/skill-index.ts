// SPDX-License-Identifier: MIT
/**
 * The in-memory catalog of skills, and when it is (re)built.
 *
 * `buildSkillIndex` walks the whole skills tree and reads the frontmatter of
 * every SKILL.md. It is synchronous, so while it runs nothing else in this
 * process makes progress — including the other tool calls the MCP SDK has
 * already dispatched.
 *
 * Two changes follow from that:
 *
 * 1. The first build happens at startup, before the server accepts a request,
 *    so no agent ever pays for it.
 * 2. Expiry no longer rebuilds on the hot path. `get()` always answers from
 *    the index it has and schedules the rebuild for the next turn of the event
 *    loop, so a caller that arrives the moment the TTL lapses gets a
 *    marginally stale catalog instead of a stall. Rebuilds do not overlap.
 */

import { buildSkillIndex, type SkillEntry } from "./lib.js";

export const DEFAULT_INDEX_TTL_MS = 5 * 60 * 1000;

export interface SkillIndexOptions {
  ttlMs?: number;
  /** Injectable for tests; defaults to the real filesystem walk. */
  build?: (skillsDir: string) => SkillEntry[];
  /** Injectable for tests; defaults to `setImmediate`. */
  schedule?: (fn: () => void) => void;
}

export class SkillIndex {
  private entries: SkillEntry[] = [];
  private builtAt = 0;
  private refreshScheduled = false;
  private buildCount = 0;

  private readonly ttlMs: number;
  private readonly build: (skillsDir: string) => SkillEntry[];
  private readonly schedule: (fn: () => void) => void;

  constructor(
    private readonly skillsDir: string,
    options: SkillIndexOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_INDEX_TTL_MS;
    this.build = options.build ?? buildSkillIndex;
    this.schedule = options.schedule ?? ((fn) => void setImmediate(fn));
  }

  /**
   * Build the index if it has never been built. Called once at startup, before
   * the transport is connected.
   */
  ensureBuilt(): void {
    if (this.builtAt !== 0) return;
    this.rebuild();
  }

  /**
   * The current catalog. Never blocks on a rebuild: a stale-but-present index
   * is returned immediately and refreshed behind the caller.
   */
  get(): SkillEntry[] {
    if (this.builtAt === 0) {
      // Only reachable if startup was skipped; better a slow first call than
      // an empty catalog.
      this.rebuild();
      return this.entries;
    }

    if (Date.now() - this.builtAt >= this.ttlMs) {
      this.scheduleRefresh();
    }
    return this.entries;
  }

  /** How many times the underlying walk has run. Exposed for tests. */
  get builds(): number {
    return this.buildCount;
  }

  private scheduleRefresh(): void {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    // Mark the index fresh right away so callers arriving before the rebuild
    // runs do not each queue their own.
    this.builtAt = Date.now();
    this.schedule(() => {
      this.refreshScheduled = false;
      try {
        this.rebuild();
      } catch (err) {
        // Keep serving the previous catalog: a transient read error on one
        // skill should not empty the index for everyone.
        console.error(`[skill-loader] Index refresh failed: ${(err as Error).message}`);
      }
    });
  }

  private rebuild(): void {
    this.buildCount++;
    this.entries = this.build(this.skillsDir);
    this.builtAt = Date.now();
  }
}
