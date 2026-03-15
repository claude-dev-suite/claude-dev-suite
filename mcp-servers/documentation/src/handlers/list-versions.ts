// SPDX-License-Identifier: MIT
/**
 * Handler for list_versions tool
 */

import { ListVersionsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";

export const handleListVersions: Handler = async (args, ctx): Promise<HandlerResult> => {
  const { technology } = ListVersionsSchema.parse(args);

  if (ctx.kbMode === "git" && ctx.versionResolver) {
    const versions = await ctx.versionResolver.listVersions(technology);
    return jsonResponse({
      technology,
      ...versions,
    });
  }

  return jsonResponse({
    technology,
    latest: "latest",
    supported: ["latest"],
    eol: [],
    hint: "Version info requires Git mode",
  });
};
