// SPDX-License-Identifier: MIT
/**
 * Handler for list_docs tool
 *
 * Returns a compact catalog of all available KB entries,
 * optionally filtered by category.
 */

import { ListDocsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { docsIndex, CATEGORY_MAP } from "../docs-index.js";

export const handleListDocs: Handler = async (args, _ctx): Promise<HandlerResult> => {
  const { category } = ListDocsSchema.parse(args);

  let technologies: readonly string[];
  if (category) {
    technologies = CATEGORY_MAP[category] || [];
    if (technologies.length === 0) {
      return jsonResponse({
        error: `Unknown category: ${category}`,
        available_categories: Object.keys(CATEGORY_MAP),
      });
    }
  } else {
    technologies = Object.keys(docsIndex);
  }

  const catalog: Record<string, string[]> = {};
  let totalTopics = 0;

  for (const tech of technologies) {
    const topics = Object.keys(docsIndex[tech] || {});
    if (topics.length > 0) {
      catalog[tech] = topics;
      totalTopics += topics.length;
    }
  }

  return jsonResponse({
    catalog,
    total_technologies: Object.keys(catalog).length,
    total_topics: totalTopics,
    ...(category ? { category } : {}),
    available_categories: Object.keys(CATEGORY_MAP),
  });
};
