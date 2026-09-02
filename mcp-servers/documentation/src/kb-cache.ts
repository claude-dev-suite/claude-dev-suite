// SPDX-License-Identifier: MIT
/**
 * On-disk cache for knowledge-base technologies.
 *
 * Metadata used to live in a single `.timestamps.json` rewritten with a
 * read-modify-write on every fetch. The MCP SDK dispatches requests
 * concurrently, so two technologies finishing at once lost one of the two
 * updates, and a write interrupted mid-file left JSON that the reader could
 * only swallow — reporting the ENTIRE cache as stale and sending every agent
 * back to the network at the same moment.
 *
 * Metadata is now one small file per technology under `.meta/`, written
 * tmp+rename so a reader sees either the old file or the new one and never a
 * truncated one. Two technologies can no longer clobber each other because
 * they no longer share a file. The old `.timestamps.json` is still read as a
 * fallback and migrates forward on the next write, so an existing cache
 * directory keeps working.
 */

import fs from 'fs/promises';
import path from 'path';

export interface CacheEntry {
  lastFetched: number;      // Unix timestamp (ms)
  files: string[];          // List of cached files
  commit?: string;          // Git commit hash
}

export interface CacheMetadata {
  [technology: string]: CacheEntry;
}

export interface KBCacheConfig {
  cachePath: string;          // Cache directory path
  ttl: number;                // TTL in seconds (default 7200 = 2h)
}

/** Directory holding one metadata file per technology. */
const META_DIR = '.meta';
/** Single metadata file used before per-technology files; read-only now. */
const LEGACY_FILE = '.timestamps.json';
const JSON_EXT = '.json';

/**
 * Names that are safe to use as a path segment. Technology names come from a
 * fixed enum, but the cache is also reachable through `invalidate`, so the
 * check is applied at the one place every metadata path is built.
 */
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export class KBCache {
  private config: KBCacheConfig;
  private metaDir: string;
  private legacyFile: string;
  /** Legacy metadata, read at most once per process. */
  private legacy: CacheMetadata | null = null;
  private legacyLoaded = false;

  constructor(config: KBCacheConfig) {
    this.config = config;
    this.metaDir = path.join(config.cachePath, META_DIR);
    this.legacyFile = path.join(config.cachePath, LEGACY_FILE);
  }

  /** Absolute cache root. Used by the fetcher for lock and staging paths. */
  get root(): string {
    return path.resolve(this.config.cachePath);
  }

  /**
   * Initialize cache directory
   */
  async init(): Promise<void> {
    await fs.mkdir(this.config.cachePath, { recursive: true });
    await fs.mkdir(this.metaDir, { recursive: true });
  }

  /**
   * Check if cached technology is still fresh
   */
  async isFresh(technology: string): Promise<boolean> {
    const entry = await this.readEntry(technology);
    if (!entry) return false;

    // Check if cache directory exists
    let cachePath: string;
    try {
      cachePath = this.getCachePath(technology);
    } catch {
      return false;
    }
    try {
      await fs.access(cachePath);
    } catch {
      return false;
    }

    // Check TTL
    const age = Date.now() - entry.lastFetched;
    return age < this.config.ttl * 1000;
  }

  /**
   * Get cached file path
   */
  getCachePath(technology: string, file?: string): string {
    const root = this.root;
    const basePath = path.join(root, technology);
    const target = file ? path.join(basePath, file) : basePath;

    // `path.join` resolves `..` rather than rejecting it, so a traversing
    // technology or file name silently produced a path outside the cache root.
    // Containment is asserted here, at the one place every cache path is built.
    const resolved = path.resolve(target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error("Cache path escapes the cache directory");
    }
    return resolved;
  }

  /**
   * List cached files for a technology
   */
  async listFiles(technology: string): Promise<string[]> {
    const cachePath = this.getCachePath(technology);

    try {
      const entries = await fs.readdir(cachePath, { withFileTypes: true, recursive: true });
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => {
          // Build relative path from cache root
          const fullPath = path.join(e.parentPath || cachePath, e.name);
          return path.relative(cachePath, fullPath);
        });
    } catch {
      return [];
    }
  }

  /**
   * Update cache metadata for a technology.
   *
   * Touches only this technology's file, so concurrent updates for different
   * technologies cannot lose each other's writes.
   */
  async updateMetadata(technology: string, files: string[], commit?: string): Promise<void> {
    await this.writeEntry(technology, {
      lastFetched: Date.now(),
      files,
      commit,
    });
  }

  /** Timestamp of the last successful fetch, or null when never fetched. */
  async getLastFetched(technology: string): Promise<number | null> {
    const entry = await this.readEntry(technology);
    return entry ? entry.lastFetched : null;
  }

  /**
   * A cheap value that changes whenever any technology is re-fetched.
   *
   * Consumers that build an expensive derived structure over the whole cache
   * (the search index) memoize against this instead of rebuilding per call.
   */
  async getSignature(): Promise<string> {
    const techs = (await this.listCachedTechnologies()).sort();
    const parts: string[] = [];
    for (const tech of techs) {
      const entry = await this.readEntry(tech);
      parts.push(tech + ':' + (entry ? entry.lastFetched : 0));
    }
    return parts.join('|');
  }

  /**
   * Invalidate cache for a specific technology
   */
  async invalidate(technology: string): Promise<void> {
    const cachePath = this.getCachePath(technology);

    try {
      await fs.rm(cachePath, { recursive: true, force: true });
    } catch {
      // Ignore if already deleted
    }

    try {
      await fs.rm(this.metaPathFor(technology), { force: true });
    } catch {
      // Ignore if already deleted
    }

    // Drop the legacy entry too, otherwise a migrated cache would resurrect it.
    const legacy = await this.readLegacy();
    if (legacy && technology in legacy) {
      delete legacy[technology];
      await this.writeLegacy(legacy);
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.config.cachePath, { recursive: true, force: true });
    } catch {
      // Ignore if already deleted
    }

    this.legacy = null;
    this.legacyLoaded = false;
    await this.init();
  }

  /**
   * List all cached technologies
   */
  async listCachedTechnologies(): Promise<string[]> {
    const names = new Set<string>();

    try {
      for (const name of await fs.readdir(this.metaDir)) {
        if (name.endsWith(JSON_EXT)) {
          names.add(name.slice(0, name.length - JSON_EXT.length));
        }
      }
    } catch {
      // Meta directory not created yet
    }

    const legacy = await this.readLegacy();
    if (legacy) {
      for (const tech of Object.keys(legacy)) names.add(tech);
    }

    return [...names];
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    technologies: number;
    totalFiles: number;
    oldestCache: number | null;
    newestCache: number | null;
  }> {
    const technologies = await this.listCachedTechnologies();

    let totalFiles = 0;
    let oldestCache: number | null = null;
    let newestCache: number | null = null;
    let counted = 0;

    for (const tech of technologies) {
      const entry = await this.readEntry(tech);
      if (!entry) continue;
      counted++;
      totalFiles += entry.files.length;

      if (oldestCache === null || entry.lastFetched < oldestCache) {
        oldestCache = entry.lastFetched;
      }
      if (newestCache === null || entry.lastFetched > newestCache) {
        newestCache = entry.lastFetched;
      }
    }

    return {
      technologies: counted,
      totalFiles,
      oldestCache,
      newestCache,
    };
  }

  // ── Per-technology metadata ────────────────────────────────────────────────

  /** Path of one technology's metadata file, asserted inside `.meta/`. */
  private metaPathFor(technology: string): string {
    if (!SAFE_SEGMENT_RE.test(technology)) {
      throw new Error('Invalid technology name for cache metadata');
    }
    const dir = path.resolve(this.metaDir);
    const resolved = path.resolve(path.join(dir, technology + JSON_EXT));
    if (!resolved.startsWith(dir + path.sep)) {
      throw new Error('Cache path escapes the cache directory');
    }
    return resolved;
  }

  /** Read one technology's entry, falling back to the legacy file. */
  private async readEntry(technology: string): Promise<CacheEntry | null> {
    let metaPath: string;
    try {
      metaPath = this.metaPathFor(technology);
    } catch {
      return null;
    }

    try {
      const parsed = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as CacheEntry;
      if (parsed && typeof parsed.lastFetched === 'number') {
        return { ...parsed, files: Array.isArray(parsed.files) ? parsed.files : [] };
      }
    } catch {
      // Missing or unreadable — fall through to the legacy file.
    }

    const legacy = await this.readLegacy();
    const entry = legacy ? legacy[technology] : undefined;
    return entry && typeof entry.lastFetched === 'number' ? entry : null;
  }

  /**
   * Write one technology's entry atomically.
   *
   * tmp+rename: a concurrent reader sees the previous complete file or the new
   * complete file, never a half-written one.
   */
  private async writeEntry(technology: string, entry: CacheEntry): Promise<void> {
    const metaPath = this.metaPathFor(technology);
    await fs.mkdir(path.dirname(metaPath), { recursive: true });

    const tmpPath = metaPath + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
    try {
      await fs.writeFile(tmpPath, JSON.stringify(entry), 'utf-8');
      await fs.rename(tmpPath, metaPath);
    } catch (error) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async readLegacy(): Promise<CacheMetadata | null> {
    if (this.legacyLoaded) return this.legacy;
    this.legacyLoaded = true;
    try {
      const parsed = JSON.parse(await fs.readFile(this.legacyFile, 'utf-8'));
      this.legacy = parsed && typeof parsed === 'object' ? (parsed as CacheMetadata) : null;
    } catch {
      this.legacy = null;
    }
    return this.legacy;
  }

  private async writeLegacy(metadata: CacheMetadata): Promise<void> {
    this.legacy = metadata;
    const tmpPath =
      this.legacyFile + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
    try {
      await fs.writeFile(tmpPath, JSON.stringify(metadata, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.legacyFile);
    } catch {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
    }
  }
}
