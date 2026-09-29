import { execFileSync } from "child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, register, SPECS, useFixtureRoot } from "./helpers.js";

beforeEach(() => {
  useFixtureRoot();
  register([
    { alias: "pets", path: "specs/petstore.yaml" },
    { alias: "pets2", path: "specs/petstore-v2.yaml" },
    { alias: "split", path: "specs/split.yaml" },
  ]);
});

type Finding = { rule: string; severity: string; message: string };

describe("lint_api_spec", () => {
  it("reports the built-in rules with severities", async () => {
    const r = await call("lint_api_spec", { alias: "pets", limit: 500 });
    const rules = (r.findings as Finding[]).map((f) => f.rule);
    expect(rules).toContain("operation-operationId"); // DELETE /pets/{petId}
    expect(rules).toContain("unused-component"); // Orphan, apiKey
    expect(rules).toContain("operation-error-response"); // GET /pets/me
    expect(rules).toContain("operation-tags"); // DELETE has no tags
    // Only one multi-word style (unused_field) is in use, so no casing finding.
    expect(rules).not.toContain("property-casing-consistent");
    const orphan = (r.findings as Finding[]).find((f) => f.rule === "unused-component" && f.message.includes("Orphan"));
    expect(orphan?.severity).toBe("warn");
    // Components reached only through other components are NOT unused.
    expect((r.findings as Finding[]).some((f) => f.rule === "unused-component" && f.message.includes('"Category"'))).toBe(false);
    expect(r.valid).toBe(true);
  });

  it("flags invalid refs and path parameter mismatches as errors", async () => {
    const r = await call("lint_api_spec", { path: "specs/split.yaml", minSeverity: "error" });
    expect(r.valid).toBe(false);
    expect((r.findings as Finding[]).every((f) => f.severity === "error")).toBe(true);
    expect((r.findings as Finding[]).some((f) => f.rule === "no-invalid-ref" && f.message.includes("missing.yaml"))).toBe(true);
  });

  it("detects duplicate operationIds, duplicate templates and undeclared path params", async () => {
    const dir = mkdtempSync(join(SPECS, "tmp-lint-"));
    try {
      writeFileSync(
        join(dir, "bad.yaml"),
        [
          "openapi: 3.0.0",
          "info: {title: t, version: '1'}",
          "paths:",
          "  /a/{id}:",
          "    get: {operationId: dup, responses: {'200': {description: ok}}}",
          "  /a/{name}:",
          "    get:",
          "      operationId: dup",
          "      parameters: [{name: other, in: path, required: true, schema: {type: string}}]",
          "      responses: {'200': {description: ok}}",
          "components:",
          "  schemas:",
          "    Mixed: {type: object, properties: {firstName: {type: string}, last_name: {type: string}}}",
        ].join("\n")
      );
      const r = await call("lint_api_spec", { path: `specs/${dir.split(/[\\/]/).pop()}/bad.yaml`, minSeverity: "error" });
      const rules = (r.findings as Finding[]).map((f) => f.rule);
      expect(rules).toContain("operation-operationId-unique");
      expect(rules).toContain("path-duplicate-template");
      expect(rules.filter((x) => x === "path-params").length).toBeGreaterThanOrEqual(3);
      const all = await call("lint_api_spec", { path: `specs/${dir.split(/[\\/]/).pop()}/bad.yaml`, rules: ["property-casing-consistent"] });
      expect(all.findings[0].message).toMatch(/camelCase.*snake_case|snake_case.*camelCase/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown rule ids instead of silently returning nothing", async () => {
    const r = await call("lint_api_spec", { alias: "pets", rules: ["no-such-rule"] });
    expect(r.__error).toBe(true);
  });
});

type Change = { id: string; level: string; operation?: string; message: string; potential?: boolean };

describe("diff_api_specs", () => {
  it("classifies breaking, non-breaking and info changes", async () => {
    const r = await call("diff_api_specs", { base: { alias: "pets" }, head: { alias: "pets2" }, limit: 500 });
    expect(r.breaking).toBe(true);
    const ids = (r.changes as Change[]).map((c) => `${c.level}:${c.id}:${c.operation ?? ""}`);
    const has = (s: string) => expect(ids.some((x) => x.startsWith(s))).toBe(true);
    has("breaking:endpoint-removed:GET /pets/me");
    has("non-breaking:endpoint-added:GET /owners");
    has("breaking:request-required-parameter-added:GET /pets");
    has("breaking:request-enum-value-removed:GET /pets");
    has("breaking:request-maximum-changed:GET /pets");
    has("breaking:request-required-property-added:POST /pets");
    has("breaking:request-media-type-removed:POST /pets");
    has("breaking:response-type-changed:GET /pets/{id}");
    has("breaking:response-property-became-optional:GET /pets");
    has("breaking:response-enum-value-added:GET /pets");
    has("breaking:request-type-changed:GET /pets/{id}"); // path param integer -> string
    has("info:path-parameter-renamed:GET /pets/{id}");
    has("info:response-non-success-status-removed:GET /pets/{id}");
    has("breaking:security-authentication-required:DELETE /pets/{id}");
    has("info:api-version-changed");
    const enumAdded = (r.changes as Change[]).find((c) => c.id === "response-enum-value-added");
    expect(enumAdded?.potential).toBe(true);
  });

  it("onlyBreaking filters but keeps the full summary", async () => {
    const r = await call("diff_api_specs", { base: { alias: "pets" }, head: { alias: "pets2" }, onlyBreaking: true });
    expect((r.changes as Change[]).every((c) => c.level === "breaking")).toBe(true);
    expect(r.summary["non-breaking"]).toBeGreaterThan(0);
  });

  it("reports no changes for identical specs", async () => {
    const r = await call("diff_api_specs", { base: { alias: "pets" }, head: { path: "specs/petstore.yaml" } });
    expect(r.summary.total).toBe(0);
    expect(r.breaking).toBe(false);
  });

  it("rejects an ambiguous spec reference", async () => {
    const r = await call("diff_api_specs", { base: { alias: "pets", path: "specs/petstore.yaml" }, head: { alias: "pets2" } });
    expect(r.__error).toBe(true);
  });
});

let gitAvailable = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  gitAvailable = false;
}

describe.skipIf(!gitAvailable)("diff against a git revision", () => {
  const repo = mkdtempSync(join(tmpdir(), "api-explorer-git-"));
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("compares the working file with HEAD via git show", async () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    cpSync(join(SPECS, "petstore.yaml"), join(repo, "api.yaml"));
    git("add", "api.yaml");
    git("commit", "-q", "-m", "v1");
    cpSync(join(SPECS, "petstore-v2.yaml"), join(repo, "api.yaml"));

    useFixtureRoot(repo);
    register([{ alias: "api", path: "api.yaml" }]);
    const r = await call("diff_api_specs", { base: { alias: "api", gitRef: "HEAD" }, head: { alias: "api" } });
    expect(r.__error).toBeUndefined();
    expect(r.base).toBe("HEAD:<api>");
    expect(r.breaking).toBe(true);
    expect(r.summary.endpointsRemoved).toBe(1);

    const bad = await call("diff_api_specs", { base: { path: "api.yaml", gitRef: "--output=/tmp/x" }, head: { alias: "api" } });
    expect(bad.__error).toBe(true);
    expect(bad.error).toMatch(/Invalid git ref/);
  });
});
