import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fetchText, setFetchImpl } from "../src/http.js";
import { parseEndpointsConfig } from "../src/config.js";
import { redactUrl } from "../src/redact.js";
import { call, register, SPECS, useFixtureRoot } from "./helpers.js";

const petstore = readFileSync(join(SPECS, "petstore.yaml"), "utf-8");

let restore: (() => void) | undefined;
const calls: Array<{ url: string; headers: Record<string, string> }> = [];

function fakeFetch(routes: Record<string, () => Response>) {
  restore = setFetchImpl(async (url, init) => {
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    const route = routes[url];
    if (!route) throw new TypeError("fetch failed");
    return route();
  });
}

beforeEach(() => {
  calls.length = 0;
  useFixtureRoot();
  delete process.env.API_EXPLORER_ALLOW_PRIVATE_URLS;
  process.env.API_EXPLORER_RETRY_COUNT = "1";
});
afterEach(() => {
  restore?.();
  restore = undefined;
  delete process.env.API_EXPLORER_RETRY_COUNT;
});

describe("SSRF guard (shared)", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://2852039166/",
    "http://0xa9fea9fe/",
    "http://[::ffff:169.254.169.254]/",
    "http://0251.0376.0251.0376/",
  ])("blocks cloud metadata in any encoding: %s", async (url) => {
    fakeFetch({});
    await expect(fetchText(url)).rejects.toThrow(/SSRF protection/);
    expect(calls).toHaveLength(0);
  });

  it("allows local dev servers by default, blocks them when API_EXPLORER_ALLOW_PRIVATE_URLS=0", async () => {
    fakeFetch({ "http://127.0.0.1:8080/v3/api-docs": () => new Response("{}") });
    await expect(fetchText("http://127.0.0.1:8080/v3/api-docs")).resolves.toMatchObject({ text: "{}" });
    process.env.API_EXPLORER_ALLOW_PRIVATE_URLS = "0";
    await expect(fetchText("http://127.0.0.1:8080/v3/api-docs")).rejects.toThrow(/SSRF protection/);
    await expect(fetchText("http://[fd00::1]/")).rejects.toThrow(/SSRF protection/);
  });

  it("re-validates every redirect hop (a public URL redirecting to metadata is refused)", async () => {
    fakeFetch({
      "http://8.8.8.8/spec": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    });
    await expect(fetchText("http://8.8.8.8/spec")).rejects.toThrow(/SSRF protection/);
    expect(calls.map((c) => c.url)).toEqual(["http://8.8.8.8/spec"]);
  });

  it("drops configured headers on a cross-origin redirect", async () => {
    fakeFetch({
      "http://8.8.8.8/spec": () => new Response(null, { status: 301, headers: { location: "http://8.8.4.4/spec" } }),
      "http://8.8.4.4/spec": () => new Response("ok"),
    });
    await fetchText("http://8.8.8.8/spec", { headers: { Authorization: "Bearer secret" } });
    expect(calls[0].headers.Authorization).toBe("Bearer secret");
    expect(calls[1].headers.Authorization).toBeUndefined();
  });

  it("caps the response size", async () => {
    fakeFetch({ "http://8.8.8.8/big": () => new Response("x".repeat(5000)) });
    await expect(fetchText("http://8.8.8.8/big", { maxBytes: 1000 })).rejects.toThrow(/limit/);
  });

  it("retries 5xx but not 404", async () => {
    let n = 0;
    fakeFetch({ "http://8.8.8.8/flaky": () => (++n === 1 ? new Response("", { status: 503 }) : new Response("ok")), "http://8.8.8.8/missing": () => new Response("", { status: 404 }) });
    await expect(fetchText("http://8.8.8.8/flaky")).resolves.toMatchObject({ text: "ok" });
    await expect(fetchText("http://8.8.8.8/missing")).rejects.toThrow(/HTTP 404/);
    expect(calls.filter((c) => c.url.endsWith("missing"))).toHaveLength(1);
  });
});

describe("URL sources", () => {
  it("loads a spec over HTTP and caches per source (no shared 'probe' key)", async () => {
    fakeFetch({
      "http://8.8.8.8/a.yaml": () => new Response(petstore, { headers: { "content-type": "application/yaml" } }),
      "http://8.8.8.8/b.json": () => new Response(JSON.stringify({ openapi: "3.0.0", info: { title: "B", version: "1" }, paths: {} })),
    });
    register([{ alias: "a", url: "http://8.8.8.8/a.yaml" }, { alias: "b", url: "http://8.8.8.8/b.json" }]);
    const a = await call("get_api_schema", { alias: "a", format: "summary" });
    const b = await call("get_api_schema", { alias: "b", format: "summary" });
    expect(a.summary.info.title).toBe("Petstore");
    expect(b.summary.info.title).toBe("B");
    await call("get_api_schema", { alias: "a", format: "summary" });
    expect(calls.filter((c) => c.url.endsWith("a.yaml"))).toHaveLength(1);
  });

  it("reports a per-source error when one of several sources fails", async () => {
    fakeFetch({ "http://8.8.8.8/a.yaml": () => new Response(petstore) });
    register([{ alias: "a", url: "http://8.8.8.8/a.yaml" }, { alias: "down", url: "http://8.8.8.8/down" }]);
    const r = await call("list_api_paths", {});
    expect(r.endpoints[0].alias).toBe("a");
    expect(r.errors[0].alias).toBe("down");
  });

  it("never echoes header values or URL credentials", async () => {
    register([{ alias: "x", url: "https://user:pw@8.8.8.8/spec?api_key=abc&v=1", headers: { Authorization: "Bearer topsecret" } }]);
    const r = await call("list_api_sources");
    const text = JSON.stringify(r);
    expect(text).not.toContain("topsecret");
    expect(text).not.toContain("pw@");
    expect(text).not.toContain("abc");
    expect(r.sources[0].headerNames).toEqual(["Authorization"]);
  });
});

describe("API_EXPLORER_ENDPOINTS parsing", () => {
  it("accepts file paths, kinds and reports bad entries without dropping good ones", () => {
    const r = parseEndpointsConfig(
      JSON.stringify([
        { alias: "api", url: "http://localhost:8080/v3/api-docs" },
        { alias: "events", path: "specs/asyncapi-2.yaml", kind: "asyncapi" },
        { alias: "bad", url: "ftp://x" },
        { alias: "escape", path: "../../../etc/passwd" },
      ])
    );
    expect(r.sources.map((s) => s.alias)).toEqual(["api", "events"]);
    expect(r.sources[1]).toMatchObject({ kind: "asyncapi", location: { type: "file" } });
    expect(r.errors).toHaveLength(2);
  });

  it("supports a CSV of URLs and paths", () => {
    const r = parseEndpointsConfig("http://localhost:1/a, specs/petstore.yaml");
    expect(r.sources.map((s) => s.location.type)).toEqual(["url", "file"]);
  });

  it("redacts sensitive query parameters", () => {
    expect(redactUrl("https://x.com/a?token=1&page=2")).toBe("https://x.com/a?token=***&page=2");
  });
});
