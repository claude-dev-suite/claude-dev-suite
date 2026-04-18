// SPDX-License-Identifier: MIT
/**
 * Documentation server handlers
 *
 * Each tool has its own handler file for maintainability.
 */

export { handleFetchDocs } from "./fetch-docs.js";
export { handleSearchDocs } from "./search-docs.js";
export { handleListVersions } from "./list-versions.js";
export { handleListTopics } from "./list-topics.js";
export { handleListDocs } from "./list-docs.js";

export type { Handler, HandlerContext, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse } from "./types.js";

import type { Handler } from "./types.js";
import { handleFetchDocs } from "./fetch-docs.js";
import { handleSearchDocs } from "./search-docs.js";
import { handleListVersions } from "./list-versions.js";
import { handleListTopics } from "./list-topics.js";
import { handleListDocs } from "./list-docs.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  fetch_docs: handleFetchDocs,
  search_docs: handleSearchDocs,
  list_versions: handleListVersions,
  list_topics: handleListTopics,
  list_docs: handleListDocs,
};
