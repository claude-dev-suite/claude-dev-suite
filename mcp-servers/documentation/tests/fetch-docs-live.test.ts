// SPDX-License-Identifier: MIT
import { describe, it, expect } from "vitest";
import { handleFetchDocs } from "../src/handlers/fetch-docs.js";
import type { HandlerContext } from "../src/handlers/types.js";
import { docsIndex } from "../src/docs-index.js";

// Live-only context: no KB, so the handler goes straight to the url fallback.
const liveCtx: HandlerContext = {
  kbMode: "live_only",
  kbCache: null,
  kbFetcher: null,
  versionResolver: null,
  config: { cachePath: "", ttl: 0 },
};

const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

// A few KB articles document proprietary formats or in-house workflows that
// have no upstream page, so their entries carry no `url`. Live mode must say
// so rather than dereference undefined or serve an unrelated page.
describe("fetch_docs live fallback for KB-only topics", () => {
  it("reports no live source when the entry has no url", async () => {
    const result = await handleFetchDocs(
      { technology: "abb-freelance", topic: "dmf-format", source: "live" },
      liveCtx
    );

    const body = parse(result);
    expect(body.error).toMatch(/no live source/i);
    expect(body.hint).toMatch(/knowledge base/i);
    expect(body.content).toBeUndefined();
  });

  it("keeps the url fallback working for topics that do have one", async () => {
    // Only assert the entry shape here — actually fetching would hit the network.
    expect(docsIndex["abb-freelance"].overview.url).toMatch(/^https:\/\//);
    expect(docsIndex["abb-freelance"]["dmf-format"].url).toBeUndefined();
  });

  it("only omits url where a topic genuinely has no upstream", () => {
    const urlless = Object.entries(docsIndex).flatMap(([tech, topics]) =>
      Object.entries(topics)
        .filter(([, entry]) => entry.url === undefined)
        .map(([topic]) => `${tech}/${topic}`)
    );

    // Pin the exhaustive list: adding a url-less entry should be a deliberate
    // act, not something that slips in from a forgotten field.
    expect(urlless.sort()).toEqual([
      "abb-freelance/dmf-format",
      "abb-freelance/prt-format",
      "bulk-engineering/python-generation",
      // Written for the `review/*` skills. Each is KB-only because the
      // comparison it makes is one no vendor publishes: tool authors
      // document their own rules, engines document their own behaviour,
      // and a set defined by the ABSENCE of a diagnostic is not a feature
      // any page describes.
      "code-review/default-analysis-by-language",
      "dcs-platforms/overview",
      "nodejs/runtime-failure-modes",
      "sql-fundamentals/engine-differences",
    ]);
  });
});
