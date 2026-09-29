import { beforeEach, describe, expect, it } from "vitest";
import { call, register, useFixtureRoot } from "./helpers.js";
import { sampleFromSchema } from "../src/samples.js";

beforeEach(() => {
  useFixtureRoot();
  register([
    { alias: "pets", path: "specs/petstore.yaml" },
    { alias: "legacy", path: "specs/swagger2.json" },
    { alias: "gql", path: "specs/schema.graphql" },
    { alias: "events2", path: "specs/asyncapi-2.yaml" },
    { alias: "events3", path: "specs/asyncapi-3.yaml" },
    { alias: "grpc", path: "specs/service.proto" },
  ]);
});

describe("sampleFromSchema", () => {
  it("honours readOnly in requests, formats, enums and bounds", () => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: {
        id: { type: "integer", readOnly: true },
        name: { type: "string", minLength: 8 },
        when: { type: "string", format: "date-time" },
        state: { type: "string", enum: ["a", "b"] },
        n: { type: "number", exclusiveMinimum: 10 },
      },
    };
    expect(sampleFromSchema(schema, { mode: "request" })).toEqual({
      name: "stringxx",
      when: "2024-01-15T09:30:00Z",
      state: "a",
      n: 10.5,
    });
    expect(sampleFromSchema(schema, { mode: "request", includeOptional: false })).toEqual({ name: "stringxx" });
  });

  it("returns null for circular markers instead of recursing forever", () => {
    expect(sampleFromSchema({ type: "object", properties: { self: { $ref: "#/x", $circular: "X" } } })).toEqual({ self: null });
  });
});

describe("generate_api_request", () => {
  it("renders curl/httpie/fetch/python with credentials as env vars", async () => {
    const r = await call("generate_api_request", { alias: "pets", operationId: "createPet" });
    expect(r.url).toBe("https://api.example.com/v1/pets");
    // Minimal body by default: required fields only.
    expect(r.body).toEqual({ mediaType: "application/json", value: { name: "Rex" } });
    const full = await call("generate_api_request", { alias: "pets", operationId: "createPet", includeOptional: true, formats: ["curl"] });
    expect(full.body.value).toEqual({ name: "Rex", tag: "string", category: { id: 0, name: "string", parent: null } });
    expect(r.snippets.curl).toContain("curl -X POST 'https://api.example.com/v1/pets'");
    expect(r.snippets.curl).toContain('-H "Authorization: Bearer ${BEARERAUTH_TOKEN}"');
    expect(r.snippets.curl).toContain(`--data-raw '{`);
    expect(r.snippets.httpie).toMatch(/^printf '%s' '\{/);
    expect(r.snippets.fetch).toContain("process.env.BEARERAUTH_TOKEN");
    expect(r.snippets.python).toContain("import os");
    expect(r.snippets.python).toContain('"name": "Rex"');
    expect(r.credentialEnvVars).toEqual(["BEARERAUTH_TOKEN"]);
  });

  it("fills path params and required query params", async () => {
    const r = await call("generate_api_request", { alias: "pets", path: "/pets/{petId}", method: "GET", formats: ["curl"] });
    expect(r.url).toBe("https://api.example.com/v1/pets/0");
    const opt = await call("generate_api_request", { alias: "pets", path: "/pets", method: "GET", includeOptional: true, formats: ["python"] });
    expect(opt.url).toBe("https://api.example.com/v1/pets?limit=1&status=available");
  });

  it("uses apiKey headers and multipart for Swagger 2", async () => {
    const r = await call("generate_api_request", { alias: "legacy", operationId: "upload", formats: ["curl", "python"] });
    expect(r.snippets.curl).toContain('-H "X-Key: ${KEY_API_KEY}"');
    expect(r.snippets.curl).toContain("-F 'file=<binary>'");
    expect(r.snippets.python).toContain("files=");
  });

  it("quotes single quotes safely for POSIX shells", async () => {
    const { renderSnippet } = await import("../src/samples.js");
    const s = renderSnippet(
      { method: "POST", url: "http://x/a", headers: [], secretHeaders: new Map(), secretQuery: new Map(), body: { mediaType: "text/plain", value: "it's" }, notes: [] },
      "curl"
    );
    expect(s).toContain(`--data-raw 'it'\\''s'`);
  });
});

describe("GraphQL", () => {
  it("lists operations by type with arguments", async () => {
    const r = await call("list_graphql_operations", { alias: "gql" });
    expect(r.operations.map((o: { operationType: string; name: string }) => `${o.operationType}.${o.name}`)).toEqual([
      "query.user",
      "query.search",
      "mutation.createPost",
      "subscription.postPublished",
    ]);
    expect(r.operations[0].args[0]).toEqual({ name: "id", type: "ID!" });
  });

  it("describes a type including implementations and SDL", async () => {
    const node = await call("get_graphql_type", { alias: "gql", name: "Node" });
    expect(node.implementations.sort()).toEqual(["Post", "User"]);
    const status = await call("get_graphql_type", { alias: "gql", name: "PostStatus" });
    expect(status.values.find((v: { name: string }) => v.name === "ARCHIVED").deprecated).toBe("use DRAFT");
    const types = await call("list_graphql_types", { alias: "gql", kind: "union" });
    expect(types.types).toEqual([{ name: "SearchResult", kind: "union" }]);
  });

  it("errors on the wrong kind instead of returning empty results", async () => {
    const r = await call("list_graphql_operations", { alias: "pets" });
    expect(r.__error).toBe(true);
    expect(r.error).toMatch(/not GraphQL/);
  });
});

describe("AsyncAPI", () => {
  it("reads 2.x channels, operations and messages", async () => {
    const r = await call("list_asyncapi_channels", { alias: "events2" });
    expect(r.channels[0]).toMatchObject({ name: "orders/created", operations: [{ id: "onOrderCreated", action: "subscribe", messages: ["OrderCreated"] }] });
    expect(r.channels[1].parameters).toEqual(["orderId"]);
    const msg = await call("get_asyncapi_message", { alias: "events2", name: "OrderCreated" });
    expect(msg.payload.properties.total.type).toBe("number");
    const all = await call("get_asyncapi_message", { alias: "events2" });
    expect(all.messages.map((m: { name: string }) => m.name).sort()).toEqual(["CancelOrder", "OrderCreated"]);
  });

  it("reads 3.x operations that point at channels", async () => {
    const r = await call("list_asyncapi_channels", { alias: "events3" });
    expect(r.channels[0]).toMatchObject({
      id: "lightingMeasured",
      address: "smartylighting/{streetlightId}/measured",
      operations: [{ id: "receiveLightMeasurement", action: "receive", messages: ["lightMeasured"] }],
    });
  });
});

describe("protobuf", () => {
  it("lists services with streaming modes", async () => {
    const r = await call("list_grpc_services", { alias: "grpc" });
    expect(r.package).toBe("shop.v1");
    expect(r.services[0].rpcs.map((x: { name: string; streaming: string }) => `${x.name}:${x.streaming}`)).toEqual(["GetProduct:unary", "WatchPrices:bidi"]);
    expect(r.imports).toEqual(["google/protobuf/timestamp.proto"]);
  });

  it("describes messages with maps, oneofs and nested enums", async () => {
    const r = await call("get_proto_message", { alias: "grpc", name: "Product" });
    const fields = Object.fromEntries(r.fields.map((f: { name: string }) => [f.name, f]));
    expect(fields.attributes.type).toBe("map<string, string>");
    expect(fields.tags.repeated).toBe(true);
    expect(fields.cents.oneof).toBe("price");
    const e = await call("get_proto_message", { alias: "grpc", name: "shop.v1.Product.Status" });
    expect(e).toMatchObject({ kind: "enum", values: { STATUS_UNSPECIFIED: 0, ACTIVE: 1 } });
  });
});
