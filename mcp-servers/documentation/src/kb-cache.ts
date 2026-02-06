// SPDX-License-Identifier: MIT
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CacheMetadata {
  [technology: string]: {
    lastFetched: number;      // Unix timestamp (ms)
    files: string[];          // List of cached files
    commit?: string;          // Git commit hash
  };
}

export interface KBCacheConfig {
  cachePath: string;          // Cache directory path
  ttl: number;                // TTL in seconds (default 7200 = 2h)
}

export class KBCache {
  private config: KBCacheConfig;
  private timestampsFile: string;

  constructor(config: KBCacheConfig) {
    this.config = config;
    this.timestampsFile = path.join(config.cachePath, '.timestamps.json');
  }

  /**
   * Initialize cache directory
   */
  async init(): Promise<void> {
    await fs.mkdir(this.config.cachePath, { recursive: true });

    // Create timestamps file if not exists
    try {
      await fs.access(this.timestampsFile);
    } catch {
      await this.writeMetadata({});
    }
  }

  /**
   * Check if cached technology is still fresh
   */
  async isFresh(technology: string): Promise<boolean> {
    const metadata = await this.readMetadata();
    const entry = metadata[technology];

    if (!entry) {
      return false;
    }

    // Check if cache directory exists
    const cachePath = path.join(this.config.cachePath, technology);
    try {
      await fs.access(cachePath);
    } catch {
      return false;
    }

    // Check TTL
    const age = Date.now() - entry.lastFetched;
    const isFresh = age < this.config.ttl * 1000;

    return isFresh;
  }

  /**
   * Get cached file path
   */
  getCachePath(technology: string, file?: string): string {
    const basePath = path.join(this.config.cachePath, technology);
    return file ? path.join(basePath, file) : basePath;
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
    } catch (error) {
      return [];
    }
  }

  /**
   * Update cache metadata for a technology
   */
  async updateMetadata(technology: string, files: string[], commit?: string): Promise<void> {
    const metadata = await this.readMetadata();

    metadata[technology] = {
      lastFetched: Date.now(),
      files,
      commit,
    };

    await this.writeMetadata(metadata);
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

    // Remove from metadata
    const metadata = await this.readMetadata();
    delete metadata[technology];
    await this.writeMetadata(metadata);
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

    await this.init();
  }

  /**
   * List all cached technologies
   */
  async listCachedTechnologies(): Promise<string[]> {
    const metadata = await this.readMetadata();
    return Object.keys(metadata);
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
    const metadata = await this.readMetadata();
    const technologies = Object.keys(metadata);

    let totalFiles = 0;
    let oldestCache: number | null = null;
    let newestCache: number | null = null;

    for (const tech of technologies) {
      totalFiles += metadata[tech].files.length;

      if (oldestCache === null || metadata[tech].lastFetched < oldestCache) {
        oldestCache = metadata[tech].lastFetched;
      }

      if (newestCache === null || metadata[tech].lastFetched > newestCache) {
        newestCache = metadata[tech].lastFetched;
      }
    }

    return {
      technologies: technologies.length,
      totalFiles,
      oldestCache,
      newestCache,
    };
  }

  /**
   * Read cache metadata
   */
  private async readMetadata(): Promise<CacheMetadata> {
    try {
      const content = await fs.readFile(this.timestampsFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Write cache metadata
   */
  private async writeMetadata(metadata: CacheMetadata): Promise<void> {
    await fs.writeFile(
      this.timestampsFile,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }
}
