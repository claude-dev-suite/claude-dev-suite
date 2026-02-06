// SPDX-License-Identifier: MIT
/**
 * Shared types for documentation index
 */

export interface DocEntry {
  local: string;
  url: string;
}

export type DocsRecord = Record<string, Record<string, DocEntry>>;
