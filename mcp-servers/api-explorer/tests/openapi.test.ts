import { beforeEach, describe, expect, it } from "vitest";
import { call, register, useFixtureRoot } from "./helpers.js";

beforeEach(() => {
  useFixtureRoot();
  register([
    { alias: "pets", path: "specs/petstore.yaml" },
    { alias: "split", path: "specs/split.yaml" },
    { alias: "legacy", path: "specs/swagger2.json" },
    { alias: "v31", path: "specs/openapi-3.1.yaml" },
  ]);
});

describe("local file sources", () => {
  it("loads a project-relative YAML spec (previously only http(s) URLs were accepted)", async () => {
    const r = await call("get_api_schema", { alias: "pets", format: "summary" });
    expect(r.__error).toBeUndefined();
    expect(r.summary.specVersion).toBe("3.0.3");
    expect(r.summary.operationCount).toBe(5);
    expect(r.summary.securitySchemes).toEqual(["bearerAuth", "apiKey"]);
  });

  it("refuses a path outside the project root", async () => {
    const r = await call("add_api_source", { alias: "evil", path: "../../package.json" });
    expect(r.__error).toBe(true);
    expect(r.error).toMatch(/outside the project root/);
  });

  it("registers and removes a source at runtime", async () => {
    const added = await call("add_api_source", { alias: "gql", path: "specs/schema.graphql" });
    expect(added.detectedKind).toBe("graphql");
    const list = await call("list_api_sources");
    expect(list.sources.map((s: { alias: string }) => s.alias)).toContain("gql");
    const removed = await call("remove_api_source", { alias: "gql" });
    expect(removed.remaining).not.toContain("gql");
  });

  it("does not register a source that cannot be loaded", async () => {
    const r = await call("add_api_source", { alias: "nope", path: "specs/does-not-exist.yaml" });
    expect(r.__error).toBe(true);
    const list = await call("list_api_sources");
    expect(list.sources.map((s: { alias: string }) => s.alias)).not.toContain("nope");
  });
});

describe("endpoint details", () => {
  it("does not mutate the cached spec when resolving refs", async () => {
    const before = await call("get_api_schema", { alias: "pets" });
    const details = await call("get_api_endpoint_details", { alias: "pets", path: "/pets", method: "POST" });
    expect(details.requestBody.content["application/json"].schema.properties.name.type).toBe("string");
    const after = await call("get_api_schema", { alias: "pets" });
    // The old handler wrote resolved schemas back into the cached document.
    expect(after.spec.paths["/pets"].post.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/NewPet",
    });
    expect(after.spec).toEqual(before.spec);
  });

  it("marks recursive schemas with $circular instead of silently truncating", async () => {
    const d = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/{petId}", method: "GET" });
    const pet = d.responses["200"].content["application/json"].schema;
    const category = pet.allOf[0].properties.category;
    expect(category.properties.parent).toEqual({ $ref: "#/components/schemas/Category", $circular: "Category" });
    expect(d.refIssues.circular).toContain("Category");
  });

  it("marks depth-limited refs with $truncated and the ref name", async () => {
    const d = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/{petId}", method: "GET", maxDepth: 1 });
    expect(d.truncated).toBe(true);
    expect(JSON.stringify(d)).toMatch(/"\$truncated": ?true/);
    expect(d.refIssues.truncated.length).toBeGreaterThan(0);
  });

  it("resolves parameter refs and merges path-level parameters", async () => {
    const list = await call("get_api_endpoint_details", { alias: "pets", path: "/pets", method: "GET" });
    const names = list.parameters.map((p: { name: string }) => p.name);
    expect(names).toEqual(["limit", "status"]);
    expect(list.parameters[0].schema.maximum).toBe(100);
    const one = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/{petId}", method: "GET" });
    expect(one.parameters[0].name).toBe("petId");
    expect(one.responses.default).toBeUndefined();
    expect(one.responses["404"].content["application/json"].schema.required).toEqual(["code", "message"]);
  });

  it("reports security (operation override, anonymous) and servers", async () => {
    const del = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/{petId}", method: "DELETE" });
    expect(del.security.source).toBe("operation");
    expect(del.security.anonymousAllowed).toBe(true);
    const get = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/{petId}", method: "GET" });
    expect(get.security.source).toBe("document");
    expect(get.security.schemes.bearerAuth.scheme).toBe("bearer");
    expect(get.servers[0].url).toBe("https://api.example.com/v1");
  });

  it("accepts a concrete path instead of the exact template", async () => {
    const d = await call("get_api_endpoint_details", { alias: "pets", path: "/pets/42", method: "GET" });
    expect(d.path).toBe("/pets/{petId}");
    expect(d.matchedFrom).toBe("/pets/42");
  });

  it("finds an operation by operationId", async () => {
    const d = await call("get_api_endpoint_details", { alias: "pets", operationId: "createPet" });
    expect(d.method).toBe("POST");
  });

  it("resolves external file refs, including a path item and nested relative refs", async () => {
    const d = await call("get_api_endpoint_details", { alias: "split", path: "/users", method: "GET" });
    const user = d.responses["200"].content["application/json"].schema.items;
    expect(user.properties.id.format).toBe("uuid");
    expect(user.properties.avatar.properties.url.format).toBe("uri");
    expect(user.properties.manager.$circular).toBe("User");
  });

  it("reports an unloadable external ref as $unresolved rather than a plausible schema", async () => {
    const d = await call("get_api_endpoint_details", { alias: "split", path: "/users/{userId}/avatar", method: "GET" });
    expect(d.parameters[0].name).toBe("userId");
    const missing = d.responses["404"].content["application/json"].schema;
    expect(missing.$unresolved).toBe(true);
    expect(d.refIssues.unresolved[0].ref).toBe("./schemas/missing.yaml#/Nope");
  });

  it("presents Swagger 2 body and formData parameters as a requestBody", async () => {
    const d = await call("get_api_endpoint_details", { alias: "legacy", path: "/orders", method: "POST" });
    expect(d.requestBody.required).toBe(true);
    expect(d.requestBody.content["application/json"].schema.properties.items.items.properties.sku.type).toBe("string");
    expect(d.parameters.map((p: { name: string }) => p.name)).toEqual(["dryRun"]);
    expect(d.parameters[0].schema.type).toBe("boolean");
    expect(d.responses["200"].content["application/json"].schema.required).toEqual(["id"]);
    expect(d.responses["200"].headers["X-Rate"].schema.type).toBe("integer");
    expect(d.servers[0].url).toBe("https://legacy.example.com/api");

    const up = await call("get_api_endpoint_details", { alias: "legacy", path: "/upload", method: "POST" });
    const form = up.requestBody.content["multipart/form-data"].schema;
    expect(form.properties.file).toMatchObject({ type: "string", format: "binary" });
    expect(form.required).toEqual(["file"]);
  });
});

describe("OpenAPI 3.1", () => {
  it("lists webhooks alongside paths", async () => {
    const r = await call("list_api_paths", { alias: "v31" });
    expect(r.paths).toContainEqual(expect.objectContaining({ webhook: "thingCreated", method: "POST" }));
    const noHooks = await call("list_api_paths", { alias: "v31", includeWebhooks: false });
    expect(noHooks.total).toBe(1);
  });

  it("keeps type arrays, const and examples in models", async () => {
    const r = await call("get_api_models", { alias: "v31", model: "Thing", includeExample: true });
    const m = r.models[0];
    expect(m.schema.properties.name.type).toEqual(["string", "null"]);
    expect(m.example).toEqual({ kind: "thing", name: "Widget", size: 3, tags: ["string", 0] });
  });
});

describe("matching", () => {
  it("prefers a literal segment over a template and strips the server base path", async () => {
    const me = await call("match_api_operation", { alias: "pets", url: "https://api.example.com/v1/pets/me", method: "GET" });
    expect(me.matches[0].best.path).toBe("/pets/me");
    const id = await call("match_api_operation", { alias: "pets", url: "https://api.example.com/v1/pets/42?x=1", method: "get" });
    expect(id.matches[0].best).toMatchObject({ path: "/pets/{petId}", pathParams: { petId: "42" }, basePath: "/v1" });
  });

  it("matches partially templated segments", async () => {
    const r = await call("match_api_operation", { alias: "v31", url: "/things/abc.json", method: "GET" });
    expect(r.matches[0].best.pathParams).toEqual({ thingId: "abc", format: "json" });
  });

  it("reports method-not-allowed rather than no match", async () => {
    const r = await call("match_api_operation", { alias: "pets", url: "/pets/42", method: "PATCH" });
    expect(r.matched).toBe(false);
    expect(r.attempts[0].methodNotAllowed.allowedMethods.sort()).toEqual(["DELETE", "GET"]);
  });
});

describe("models, search, security", () => {
  it("computes transitive usage", async () => {
    const r = await call("get_api_models", { alias: "pets", model: "Category" });
    // Category is only reached through Pet/NewPet, never referenced directly.
    expect(r.models[0].usedIn).toEqual(expect.arrayContaining(["GET /pets", "POST /pets", "GET /pets/{petId}"]));
  });

  it("paginates models with an explicit truncated marker", async () => {
    const r = await call("get_api_models", { alias: "pets", compact: true, limit: 2 });
    expect(r.models).toHaveLength(2);
    expect(r).toMatchObject({ truncated: true, nextOffset: 2, total: 5 });
  });

  it("ranks exact operationId matches first", async () => {
    const r = await call("search_api", { query: "getPet", alias: "pets" });
    expect(r.results[0]).toMatchObject({ type: "operation", operationId: "getPet" });
  });

  it("searches across all source kinds", async () => {
    register([
      { alias: "pets", path: "specs/petstore.yaml" },
      { alias: "gql", path: "specs/schema.graphql" },
      { alias: "proto", path: "specs/service.proto" },
    ]);
    const r = await call("search_api", { query: "product" });
    expect(r.results.some((h: { alias: string }) => h.alias === "proto")).toBe(true);
  });

  it("exposes security schemes (getSecuritySchemes previously had no tool)", async () => {
    const r = await call("get_api_security", { alias: "pets" });
    expect(Object.keys(r.schemes)).toEqual(["bearerAuth", "apiKey"]);
    expect(r.unauthenticatedOperations.operations).toEqual(["DELETE /pets/{petId}"]);
  });

  it("lists sources honestly (no invented framework detection)", async () => {
    const r = await call("list_api_endpoints");
    expect(r.sources[0]).toEqual({ alias: "pets", location: "specs/petstore.yaml", locationType: "file", kind: "auto", origin: "env" });
  });
});
