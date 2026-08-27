// SPDX-License-Identifier: MIT
/**
 * A topic whose index entry declares no `local` has no KB article. Git mode
 * must not sparse-check-out a directory to rediscover that: the fetch throws,
 * the handler falls through to the live url, and the only trace is a wasted
 * checkout and an error log on every single request.
 */
import { describe, it, expect, vi } from "vitest";
import { handleFetchDocs } from "../src/handlers/fetch-docs.js";
import { handleListTopics } from "../src/handlers/list-topics.js";
import type { HandlerContext } from "../src/handlers/types.js";
import { docsIndex } from "../src/docs-index.js";

/** Git-mode context whose KB calls are recorded rather than performed. */
function gitCtx() {
  const fetch = vi.fn(async () => ["placeholder.md"]);
  const fetchVersioned = vi.fn(async () => ({
    content: "# from the KB",
    version: "latest",
    is_latest: true,
    latest_version: "latest",
    supported_versions: [],
    delta_applied: false,
    upgrade_available: false,
  }));
  const ctx = {
    kbMode: "git",
    kbCache: null,
    kbFetcher: { fetch },
    versionResolver: { fetchVersioned, listVersions: vi.fn(async () => null) },
    config: { cachePath: "", ttl: 0 },
  } as unknown as HandlerContext;
  return { ctx, fetch, fetchVersioned };
}

const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

describe("fetch_docs git mode", () => {
  it("skips the KB entirely for a topic that declares no local", async () => {
    expect(docsIndex["vite"]["basics"].local).toBeUndefined();
    expect(docsIndex["vite"]["basics"].url).toMatch(/^https:\/\//);

    const { ctx, fetch, fetchVersioned } = gitCtx();
    const liveFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("# vite guide", { status: 200 }));

    try {
      const body = parse(await handleFetchDocs({ technology: "vite", topic: "basics" }, ctx));
      expect(body.source).toBe("live");
    } finally {
      liveFetch.mockRestore();
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(fetchVersioned).not.toHaveBeenCalled();
  });

  it("still uses the KB for a topic that has one", async () => {
    expect(docsIndex["vite"]["config"].local).toBe("vite/quick-ref/config.md");

    const { ctx, fetch, fetchVersioned } = gitCtx();
    const body = parse(await handleFetchDocs({ technology: "vite", topic: "config" }, ctx));

    expect(body.source).toBe("git_cache");
    expect(fetch).toHaveBeenCalledWith("vite", undefined);
    expect(fetchVersioned).toHaveBeenCalledWith(
      expect.objectContaining({ technology: "vite", topic: "quick-ref/config" })
    );
  });

  it("still tries the key-derived path for a topic the index does not list", async () => {
    expect(docsIndex["vite"]["not-indexed-yet"]).toBeUndefined();

    const { ctx, fetch } = gitCtx();
    await handleFetchDocs({ technology: "vite", topic: "not-indexed-yet" }, ctx);

    expect(fetch).toHaveBeenCalledWith("vite", undefined);
  });
});

describe("list_topics KB directory resolution", () => {
  it("takes the directory from the first topic that has a local, not the first topic", async () => {
    // `vite/basics` comes first in the record and is now local-less; the KB
    // directory still has to come out as `vite`, from a later entry.
    const { ctx, fetch } = gitCtx();
    await handleListTopics({ technology: "vite" }, ctx);

    expect(fetch).toHaveBeenCalledWith("vite");
  });

  it("keeps resolving a technology whose key differs from its KB directory", async () => {
    // `tailwindcss` is indexed under the KB directory `tailwind`.
    const { ctx, fetch } = gitCtx();
    await handleListTopics({ technology: "tailwindcss" }, ctx);

    expect(fetch).toHaveBeenCalledWith("tailwind");
  });

  it("skips the KB for a technology no topic of which declares a local", async () => {
    // `server-hardening` is a single-topic key with no KB article. Its `local`
    // used to name a file under `linux/` that never existed — the file was
    // missing but the *directory* was real, so the fetch succeeded and listed
    // articles belonging to `linux-server`. With the fake `local` gone, going to
    // git mode would clone the whole KB only to fail the `fs.access` check, with
    // nothing caching the failure — once per call.
    expect(Object.values(docsIndex["server-hardening"]).some((e) => e.local)).toBe(false);

    const { ctx, fetch } = gitCtx();
    const body = parse(await handleListTopics({ technology: "server-hardening" }, ctx));

    expect(fetch).not.toHaveBeenCalled();
    expect(body.mode).toBe("live_only");
    expect(body.topics).toEqual(["cis-benchmark"]);
  });
});
