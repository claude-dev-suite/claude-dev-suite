import { beforeEach, describe, expect, it } from "vitest";
import { call, useFixtureRoot, register } from "./helpers.js";

type Mod = { path: string; framework: string; openApiLibrary?: string; confidence: string; candidateUrls: Array<{ url: string; kind: string }>; specFiles: string[]; portSource?: string };

beforeEach(() => {
  useFixtureRoot();
  register([]);
});

describe("detect_api_frameworks", () => {
  it("assigns real confidence levels", async () => {
    const r = await call("detect_api_frameworks", { path: "projects", maxDepth: 4 });
    const by = Object.fromEntries((r.modules as Mod[]).map((m) => [m.path.split("/").pop(), m]));
    expect(by["spring-svc"].confidence).toBe("high");
    expect(by["nest-app"].confidence).toBe("high");
    expect(by["fastapi-svc"].confidence).toBe("high");
    expect(by["legacy"].confidence).toBe("medium"); // springfox declared, nothing wired up
    expect(by["plain-express"].confidence).toBe("low"); // no OpenAPI library
  });

  it("reads Spring config from src/main/resources (port, context path, custom docs path)", async () => {
    const r = await call("detect_api_frameworks", { path: "projects/spring-svc" });
    const m = r.modules[0] as Mod;
    expect(m.candidateUrls[0]).toEqual({ url: "http://localhost:9090/svc/api-spec", kind: "spec" });
    expect(m.portSource).toBe("config");
  });

  it("derives the NestJS JSON URL from SwaggerModule.setup", async () => {
    const r = await call("detect_api_frameworks", { path: "projects/nest-app" });
    expect((r.modules[0] as Mod).candidateUrls[0].url).toBe("http://localhost:4000/docs-json");
  });

  it("reads FastAPI openapi_url", async () => {
    const r = await call("detect_api_frameworks", { path: "projects/fastapi-svc", maxDepth: 2 });
    expect((r.modules[0] as Mod).candidateUrls[0].url).toBe("http://localhost:8000/api/openapi.json");
  });

  it("filters by confidence (includeConfidence was a no-op)", async () => {
    const high = await call("detect_api_frameworks", { path: "projects", maxDepth: 4, includeConfidence: "high" });
    expect((high.modules as Mod[]).every((m) => m.confidence === "high")).toBe(true);
    const medium = await call("detect_api_frameworks", { path: "projects", maxDepth: 4, includeConfidence: "medium" });
    expect((medium.modules as Mod[]).some((m) => m.confidence === "medium")).toBe(true);
    expect((medium.modules as Mod[]).some((m) => m.confidence === "low")).toBe(false);
  });

  it("returns checked-in spec files attached to their module", async () => {
    const r = await call("detect_api_frameworks", { path: "projects", maxDepth: 4 });
    const express = (r.modules as Mod[]).find((m) => m.path.endsWith("plain-express"))!;
    expect(express.specFiles).toEqual(["projects/plain-express/docs/openapi.yaml"]);
    expect(r.specFiles.map((s: { path: string }) => s.path)).toContain("projects/plain-express/docs/openapi.yaml");
  });

  it("refuses to scan outside the project root", async () => {
    const r = await call("detect_api_frameworks", { path: "../../.." });
    expect(r.__error).toBe(true);
  });
});

describe("discover_api_specs", () => {
  it("classifies spec files by content and registers them on request", async () => {
    const r = await call("discover_api_specs", { path: "specs", register: true });
    const kinds = Object.fromEntries(r.specFiles.map((s: { path: string; kind: string }) => [s.path.split("/").pop(), s.kind]));
    expect(kinds).toMatchObject({
      "petstore.yaml": "openapi",
      "swagger2.json": "openapi",
      "asyncapi-2.yaml": "asyncapi",
      "schema.graphql": "graphql",
      "service.proto": "proto",
    });
    // A YAML fragment without a version field is not reported as a spec.
    expect(kinds["common.yaml"]).toBeUndefined();
    expect(r.registered.length).toBe(r.specFiles.length);
    const list = await call("list_api_sources");
    expect(list.sources.map((s: { alias: string }) => s.alias)).toContain("petstore");
  });
});
