// SPDX-License-Identifier: MIT
/**
 * Version Resolver
 *
 * Handles versioned documentation requests by:
 * 1. Loading base content (latest version)
 * 2. Applying delta transformations for older versions
 */

import fs from "fs/promises";
import path from "path";
import type {
  TechnologyManifest,
  VersionedDocRequest,
  VersionedDocResponse,
} from "./types/versioning.js";
import type { KBFetcher } from "./kb-fetcher.js";
import type { KBCache } from "./kb-cache.js";

export class VersionResolver {
  private fetcher: KBFetcher;
  private cache: KBCache;
  private manifestCache: Map<string, TechnologyManifest> = new Map();

  constructor(fetcher: KBFetcher, cache: KBCache) {
    this.fetcher = fetcher;
    this.cache = cache;
  }

  /**
   * Fetch documentation with version support
   */
  async fetchVersioned(request: VersionedDocRequest): Promise<VersionedDocResponse> {
    const { technology, topic, version } = request;

    // Load manifest for this technology
    const manifest = await this.getManifest(technology);

    // Determine target version
    const targetVersion = version || manifest?.latest || "latest";
    const isLatest = !version || version === manifest?.latest;

    // Fetch base content (always latest)
    const baseContent = await this.fetcher.getFile(technology, `${topic}.md`);

    let finalContent = baseContent;
    let deltaApplied = false;

    // If requesting older version and delta exists, apply it
    if (!isLatest && manifest) {
      const topicInfo = manifest.topics[topic];

      if (topicInfo?.has_delta?.includes(targetVersion)) {
        const deltaContent = await this.loadDelta(technology, topic, targetVersion);
        if (deltaContent) {
          finalContent = this.applyDelta(baseContent, deltaContent, targetVersion);
          deltaApplied = true;
        }
      } else if (topicInfo?.not_in?.includes(targetVersion)) {
        // Topic doesn't exist in this version
        return {
          content: `# Not Available\n\nThe "${topic}" feature is not available in ${technology} ${targetVersion}.\n\nThis feature was introduced in a later version.`,
          technology,
          topic,
          version: targetVersion,
          is_latest: false,
          latest_version: manifest.latest,
          supported_versions: manifest.supported,
          delta_applied: false,
          upgrade_available: manifest.latest,
        };
      }
    }

    return {
      content: finalContent,
      technology,
      topic,
      version: targetVersion,
      is_latest: isLatest,
      latest_version: manifest?.latest || targetVersion,
      supported_versions: manifest?.supported || [targetVersion],
      delta_applied: deltaApplied,
      upgrade_available: isLatest ? undefined : manifest?.latest,
    };
  }

  /**
   * Get manifest for a technology
   */
  async getManifest(technology: string): Promise<TechnologyManifest | null> {
    // Check cache
    if (this.manifestCache.has(technology)) {
      return this.manifestCache.get(technology)!;
    }

    try {
      const manifestPath = this.cache.getCachePath(technology, "manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as TechnologyManifest;
      this.manifestCache.set(technology, manifest);
      return manifest;
    } catch {
      // No manifest = no versioning for this technology
      return null;
    }
  }

  /**
   * Load delta file for a specific version
   */
  private async loadDelta(
    technology: string,
    topic: string,
    version: string
  ): Promise<string | null> {
    try {
      const deltaPath = `_versions/${version}/${topic}.md`;
      return await this.fetcher.getFile(technology, deltaPath);
    } catch {
      // Try alternative path format
      try {
        const altPath = `_versions/${topic}@${version}.md`;
        return await this.fetcher.getFile(technology, altPath);
      } catch {
        return null;
      }
    }
  }

  /**
   * Apply delta transformations to base content
   */
  private applyDelta(baseContent: string, deltaContent: string, version: string): string {
    // Parse delta sections
    const sections = this.parseDeltaSections(deltaContent);

    let result = baseContent;

    // Add version header
    const versionHeader = `> **Note:** This documentation is for version ${version}. Some features may differ from the latest version.\n\n`;

    // Remove sections marked as "not available"
    if (sections.notAvailable.length > 0) {
      for (const feature of sections.notAvailable) {
        // Remove section headers and content for unavailable features
        const patterns = [
          new RegExp(`^##+ .*${this.escapeRegex(feature)}.*$[\\s\\S]*?(?=^##|$(?!.))`, "gmi"),
          new RegExp(`^\\*\\*${this.escapeRegex(feature)}\\*\\*[\\s\\S]*?(?=^##|^\\*\\*|$(?!.))`, "gmi"),
        ];
        for (const pattern of patterns) {
          result = result.replace(pattern, "");
        }
      }
    }

    // Add deprecation notices for features deprecated in newer versions
    if (sections.deprecatedInNewer.length > 0) {
      const deprecationNote = `\n\n---\n\n## Still Current in ${version}\n\nThe following features are still the recommended approach in ${version}:\n\n${sections.deprecatedInNewer.map((f) => `- ${f}`).join("\n")}\n\n`;
      result += deprecationNote;
    }

    // Append differences section if present
    if (sections.differences) {
      result += `\n\n---\n\n## Version ${version} Notes\n\n${sections.differences}`;
    }

    return versionHeader + result;
  }

  /**
   * Parse delta file into structured sections
   */
  private parseDeltaSections(deltaContent: string): {
    notAvailable: string[];
    deprecatedInNewer: string[];
    differences: string | null;
  } {
    const notAvailable: string[] = [];
    const deprecatedInNewer: string[] = [];
    let differences: string | null = null;

    // Parse "Not available" section
    const notAvailableMatch = deltaContent.match(
      /##\s*Not [Aa]vailable.*?\n([\s\S]*?)(?=\n##|$)/
    );
    if (notAvailableMatch) {
      const items = notAvailableMatch[1].match(/^[-*]\s*`?([^`\n]+)`?/gm);
      if (items) {
        notAvailable.push(
          ...items.map((item) => item.replace(/^[-*]\s*`?/, "").replace(/`?$/, "").trim())
        );
      }
    }

    // Parse "Deprecated in newer" section
    const deprecatedMatch = deltaContent.match(
      /##\s*(?:Deprecated|Still [Cc]urrent).*?\n([\s\S]*?)(?=\n##|$)/
    );
    if (deprecatedMatch) {
      const items = deprecatedMatch[1].match(/^[-*]\s*`?([^`\n]+)`?/gm);
      if (items) {
        deprecatedInNewer.push(
          ...items.map((item) => item.replace(/^[-*]\s*`?/, "").replace(/`?$/, "").trim())
        );
      }
    }

    // Parse "Differences" section
    const differencesMatch = deltaContent.match(
      /##\s*(?:Differences?|Syntax|API).*?\n([\s\S]*?)(?=\n##\s*(?:Not|Deprecated|Still)|$)/i
    );
    if (differencesMatch) {
      differences = differencesMatch[1].trim();
    }

    return { notAvailable, deprecatedInNewer, differences };
  }

  /**
   * List supported versions for a technology
   */
  async listVersions(technology: string): Promise<{
    latest: string;
    supported: string[];
    eol: string[];
  }> {
    const manifest = await this.getManifest(technology);

    if (!manifest) {
      return {
        latest: "latest",
        supported: ["latest"],
        eol: [],
      };
    }

    return {
      latest: manifest.latest,
      supported: manifest.supported,
      eol: manifest.eol || [],
    };
  }

  /**
   * Clear manifest cache
   */
  clearCache(): void {
    this.manifestCache.clear();
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
