// SPDX-License-Identifier: MIT
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { KBCache } from './kb-cache.js';

const exec = promisify(execCallback);

export interface KBFetcherConfig {
  repoUrl: string;           // KB Git repository URL
  branch?: string;           // Git branch (default: main)
  cache: KBCache;            // Cache manager instance
}

export class KBFetcher {
  private config: KBFetcherConfig;

  constructor(config: KBFetcherConfig) {
    this.config = config;
    this.config.branch = config.branch || 'main';
  }

  /**
   * Fetch knowledge base for a technology
   * Returns list of markdown files available
   */
  async fetch(technology: string, force = false): Promise<string[]> {
    // Check cache freshness (unless forced refresh)
    if (!force && await this.config.cache.isFresh(technology)) {
      console.error(`[KB] Cache hit for ${technology}`);
      return await this.config.cache.listFiles(technology);
    }

    console.error(`[KB] Cache miss for ${technology}, fetching from Git...`);

    try {
      // Fetch from Git using sparse checkout
      const files = await this.sparseCheckout(technology);

      console.error(`[KB] Fetched ${files.length} files for ${technology}`);

      return files;
    } catch (error) {
      console.error(`[KB] Failed to fetch ${technology}:`, error);

      // Fallback: try to use stale cache if available
      const staleFiles = await this.config.cache.listFiles(technology);
      if (staleFiles.length > 0) {
        console.error(`[KB] Using stale cache for ${technology} (${staleFiles.length} files)`);
        return staleFiles;
      }

      throw new Error(`Failed to fetch knowledge base for ${technology}: ${error}`);
    }
  }

  /**
   * Perform Git sparse checkout for a specific technology
   */
  private async sparseCheckout(technology: string): Promise<string[]> {
    const tmpDir = path.join(os.tmpdir(), `kb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const cachePath = this.config.cache.getCachePath(technology);

    try {
      // 1. Clone with sparse checkout enabled
      console.error(`[KB] Cloning ${this.config.repoUrl} (sparse)...`);

      await exec(
        `git clone --depth 1 --filter=blob:none --sparse --branch ${this.config.branch} "${this.config.repoUrl}" "${tmpDir}"`,
        { timeout: 30000 } // 30s timeout
      );

      // 2. Configure sparse checkout to only include specific technology
      console.error(`[KB] Sparse checkout: knowledge/${technology}/`);

      await exec(
        `git -C "${tmpDir}" sparse-checkout set "knowledge/${technology}/"`,
        { timeout: 10000 }
      );

      // 3. Get current commit hash
      const { stdout: commitHash } = await exec(
        `git -C "${tmpDir}" rev-parse HEAD`,
        { timeout: 5000 }
      );

      const commit = commitHash.trim();

      // 4. Check if technology directory exists
      const techPath = path.join(tmpDir, 'knowledge', technology);
      try {
        await fs.access(techPath);
      } catch {
        throw new Error(`Technology '${technology}' not found in knowledge base`);
      }

      // 5. Copy to cache
      console.error(`[KB] Copying to cache: ${cachePath}`);

      await fs.rm(cachePath, { recursive: true, force: true });
      await fs.mkdir(cachePath, { recursive: true });

      await this.copyDirectory(techPath, cachePath);

      // 6. List copied files
      const files = await this.config.cache.listFiles(technology);

      // 7. Update cache metadata
      await this.config.cache.updateMetadata(technology, files, commit);

      return files;
    } finally {
      // Cleanup temporary directory
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`[KB] Failed to cleanup temp dir ${tmpDir}:`, error);
      }
    }
  }

  /**
   * Recursively copy directory contents
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Check if Git and repository are accessible
   */
  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      // Check if git is installed
      await exec('git --version', { timeout: 5000 });

      // Try to check remote repository (ls-remote is lightweight)
      await exec(
        `git ls-remote "${this.config.repoUrl}" ${this.config.branch}`,
        { timeout: 10000 }
      );

      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get file content from cache
   */
  async getFile(technology: string, file: string): Promise<string> {
    // Ensure we have the technology cached
    await this.fetch(technology);

    const filePath = this.config.cache.getCachePath(technology, file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`File '${file}' not found in ${technology} knowledge base`);
    }
  }

  /**
   * Search for files matching a pattern
   */
  async findFiles(technology: string, pattern: string): Promise<string[]> {
    const files = await this.fetch(technology);

    // Simple pattern matching (case-insensitive)
    const regex = new RegExp(pattern, 'i');
    return files.filter(f => regex.test(f));
  }
}
