// SPDX-License-Identifier: MIT
/**
 * Knowledge Base Versioning Types
 *
 * Architecture: Base (latest) + Delta (version differences)
 * - Main files contain complete documentation for latest version
 * - Delta files contain only differences for previous versions
 */

export interface TechnologyManifest {
  /** Technology identifier (e.g., "react", "svelte") */
  technology: string;

  /** Latest stable version */
  latest: string;

  /** Supported versions (latest + LTS) */
  supported: string[];

  /** End-of-life versions (no longer maintained) */
  eol?: string[];

  /** Per-topic version information */
  topics: Record<string, TopicVersionInfo>;

  /** Optional: Breaking changes summary between versions */
  breaking_changes?: Record<string, string[]>;
}

export interface TopicVersionInfo {
  /** Versions that have delta files for this topic */
  has_delta: string[];

  /** Optional: Topic renamed in certain versions */
  renamed_from?: Record<string, string>;

  /** Optional: Topic doesn't exist in certain versions */
  not_in?: string[];
}

export interface DeltaContent {
  /** Version this delta applies to */
  version: string;

  /** Features not available in this version */
  not_available?: string[];

  /** Syntax/API differences */
  differences?: DeltaDifference[];

  /** Features deprecated in newer versions */
  deprecated_in_newer?: string[];

  /** Migration notes */
  migration_notes?: string;
}

export interface DeltaDifference {
  /** Feature or API name */
  feature: string;

  /** How it works in this version */
  in_this_version: string;

  /** How it works in latest */
  in_latest: string;
}

export interface VersionedDocRequest {
  technology: string;
  topic: string;
  version?: string;  // Optional, defaults to latest
}

export interface VersionedDocResponse {
  content: string;
  technology: string;
  topic: string;
  version: string;
  is_latest: boolean;
  latest_version: string;
  supported_versions: string[];
  delta_applied?: boolean;
  upgrade_available?: string;
}
