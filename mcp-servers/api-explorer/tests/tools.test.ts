import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Schemas } from "../src/handlers/schemas.js";
import { handlers } from "../src/handlers/handlers.js";

const metadata = JSON.parse(readFileSync(new URL("../metadata.json", import.meta.url), "utf-8"));
const indexSrc = readFileSync(new URL("../src/index.ts", import.meta.url), "utf-8");
const registered = [...indexSrc.matchAll(/name:\s*"([a-z_]+)",\s*description/g)].map((m) => m[1]);

describe("tool registry", () => {
  it("metadata.json, ListTools, handlers and schemas agree", () => {
    expect([...registered].sort()).toEqual([...metadata.tools].sort());
    expect(Object.keys(handlers).sort()).toEqual([...metadata.tools].sort());
    expect(Object.keys(Schemas).sort()).toEqual([...metadata.tools].sort());
  });

  it("every input schema converts to JSON Schema without dropping fields", () => {
    for (const [name, schema] of Object.entries(Schemas)) {
      const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as { type: string; properties?: object };
      expect(json.type, name).toBe("object");
    }
    const details = z.toJSONSchema(Schemas.get_api_endpoint_details, { io: "input" }) as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(details.properties)).toContain("method");
    expect(details.required ?? []).toEqual([]);
  });

  it("declares every env var the source reads", () => {
    const declared = metadata.envVars.map((v: { name: string }) => v.name).sort();
    expect(declared).toEqual([
      "API_EXPLORER_ALLOW_PRIVATE_URLS",
      "API_EXPLORER_CACHE_TTL",
      "API_EXPLORER_ENDPOINTS",
      "API_EXPLORER_MAX_SPEC_BYTES",
      "API_EXPLORER_PROJECT_ROOT",
      "API_EXPLORER_RETRY_COUNT",
      "API_EXPLORER_TIMEOUT",
    ]);
  });

  it("lower-cases a method argument", () => {
    expect(Schemas.match_api_operation.parse({ url: "/x", method: "get" }).method).toBe("GET");
  });
});
