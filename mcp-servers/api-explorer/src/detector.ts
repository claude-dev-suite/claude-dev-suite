// SPDX-License-Identifier: MIT
/**
 * API framework detection with real confidence levels.
 *
 *  - high    the OpenAPI library is a declared dependency AND the project
 *            shows it is wired up (a config key, a setup call in source, or
 *            a generated spec file on disk)
 *  - medium  the library is a declared dependency; URLs are the library
 *            defaults
 *  - low     a web framework is present but no OpenAPI library was found —
 *            look for checked-in spec files instead
 *
 * The previous detector marked every dependency hit "high" (so the
 * includeConfidence filter never filtered anything), read Spring config from
 * the module root instead of src/main/resources, and never looked for
 * checked-in spec files.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { basename, extname, join } from "path";
import { parseAllDocuments } from "yaml";
import { relativeToRoot } from "./location.js";
import { discoverSpecFiles, walkProject, SKIP_DIRS, type SpecFile } from "./discovery.js";

export type Ecosystem = "java" | "python" | "node" | "dotnet" | "go" | "ruby" | "php";
export type Confidence = "high" | "medium" | "low";

interface Evidence {
  docsPath?: string;
  uiPath?: string;
  port?: number;
  basePath?: string;
  evidence: string[];
  notes: string[];
  configFile?: string;
  generatedSpecs: string[];
  strong: boolean;
}

interface Signature {
  ecosystem: Ecosystem;
  framework: string;
  openApiLibrary: string;
  /** Tested against the ecosystem's manifest text (node: one dependency name per line). */
  dependency: RegExp;
  docsPath: string;
  uiPath?: string;
  alternativePaths: string[];
  defaultPort: number;
  inspect?: (dir: string) => Promise<Partial<Evidence>>;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function readText(file: string, max = 512 * 1024): Promise<string | undefined> {
  try {
    const t = await readFile(file, "utf-8");
    return t.length > max ? t.slice(0, max) : t;
  } catch {
    return undefined;
  }
}

async function sourceFiles(dir: string, exts: string[], maxFiles = 400, maxDepth = 8): Promise<string[]> {
  const w = await walkProject(dir, maxDepth, 20_000);
  return w.files.filter((f) => exts.includes(extname(f).toLowerCase())).slice(0, maxFiles);
}

async function grep(files: string[], re: RegExp): Promise<{ file: string; match: RegExpMatchArray } | undefined> {
  for (const f of files) {
    const t = await readText(f);
    const m = t?.match(re);
    if (m) return { file: f, match: m };
  }
  return undefined;
}

function flatten(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix && obj !== null && obj !== undefined && typeof obj !== "object" && !out.has(prefix)) {
    out.set(prefix, String(obj));
  }
  return out;
}

/** Spring/Quarkus/Micronaut application config, flattened to dotted keys. */
async function jvmConfig(dir: string): Promise<{ props: Map<string, string>; files: string[] }> {
  const props = new Map<string, string>();
  const files: string[] = [];
  const candidates = [join(dir, "src", "main", "resources"), dir, join(dir, "config")];
  for (const base of candidates) {
    for (const name of ["application.properties", "application.yml", "application.yaml", "application-dev.properties", "application-dev.yml", "application-local.yml", "application-local.properties"]) {
      const f = join(base, name);
      const text = await readText(f);
      if (text === undefined) continue;
      files.push(f);
      if (name.endsWith(".properties")) {
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*([\w.\-[\]]+)\s*[=:]\s*(.*?)\s*$/.exec(line);
          if (m && !line.trim().startsWith("#") && !props.has(m[1])) props.set(m[1], m[2]);
        }
      } else {
        try {
          for (const d of parseAllDocuments(text)) flatten(d.toJS(), "", props);
        } catch {
          /* malformed YAML: ignore */
        }
      }
    }
  }
  return { props, files };
}

function portFrom(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /(\d{2,5})/.exec(v.replace(/\$\{[^:}]+:(\d+)\}/, "$1"));
  return m ? Number(m[1]) : undefined;
}

function joinPath(...parts: Array<string | undefined>): string {
  const p = parts.filter((x) => x && x !== "/").map((x) => `/${String(x).replace(/^\/+|\/+$/g, "")}`).join("");
  return p || "/";
}

// ---------------------------------------------------------------------------
// Inspectors
// ---------------------------------------------------------------------------

async function inspectSpring(dir: string, sourceHint: RegExp): Promise<Partial<Evidence>> {
  const { props, files } = await jvmConfig(dir);
  const ev: Partial<Evidence> = { evidence: [], notes: [] };
  const docs = props.get("springdoc.api-docs.path");
  const ui = props.get("springdoc.swagger-ui.path");
  const ctx = props.get("server.servlet.context-path") ?? props.get("spring.webflux.base-path");
  ev.port = portFrom(props.get("server.port"));
  if (ctx) ev.basePath = ctx;
  if (docs) {
    ev.docsPath = docs;
    ev.evidence!.push(`springdoc.api-docs.path=${docs}`);
    ev.strong = true;
  }
  if (ui) ev.uiPath = ui;
  if (props.get("springdoc.api-docs.enabled") === "false") ev.notes!.push("springdoc.api-docs.enabled=false: the docs endpoint is disabled in this profile");
  if (files.length) ev.configFile = relativeToRoot(files[0]);
  if (!ev.strong) {
    const src = await sourceFiles(join(dir, "src"), [".java", ".kt"], 600);
    const hit = await grep(src, sourceHint);
    if (hit) {
      ev.strong = true;
      ev.evidence!.push(`${hit.match[0]} in ${relativeToRoot(hit.file)}`);
    }
  }
  return ev;
}

async function inspectQuarkus(dir: string): Promise<Partial<Evidence>> {
  const { props, files } = await jvmConfig(dir);
  const ev: Partial<Evidence> = { evidence: [], notes: [] };
  ev.port = portFrom(props.get("quarkus.http.port"));
  const root = props.get("quarkus.http.root-path");
  const p = props.get("quarkus.smallrye-openapi.path");
  if (p) {
    // A relative path is served under the non-application root (/q).
    ev.docsPath = p.startsWith("/") ? p : `/q/${p}`;
    ev.evidence!.push(`quarkus.smallrye-openapi.path=${p}`);
    ev.strong = true;
  }
  if (root) ev.basePath = root;
  if (files.length) ev.configFile = relativeToRoot(files[0]);
  return ev;
}

async function inspectPython(dir: string, re: RegExp, extract?: (m: RegExpMatchArray, text: string) => Partial<Evidence>): Promise<Partial<Evidence>> {
  const files = await sourceFiles(dir, [".py"], 400);
  const hit = await grep(files, re);
  if (!hit) return {};
  const text = (await readText(hit.file)) ?? "";
  const ev: Partial<Evidence> = { strong: true, evidence: [`${hit.match[0].trim().slice(0, 80)} in ${relativeToRoot(hit.file)}`], notes: [], ...(extract?.(hit.match, text) ?? {}) };
  const port = /(?:uvicorn\.run|app\.run|\.run)\([^)]*port\s*=\s*(\d{2,5})/.exec(text);
  if (port) ev.port = Number(port[1]);
  return ev;
}

async function inspectNest(dir: string): Promise<Partial<Evidence>> {
  const files = await sourceFiles(join(dir, "src"), [".ts", ".js"], 300);
  const hit = await grep(files, /SwaggerModule\.setup\(\s*['"`]([^'"`]*)['"`]/);
  if (!hit) return {};
  const text = (await readText(hit.file)) ?? "";
  const path = hit.match[1].replace(/^\/+/, "");
  const jsonUrl = /jsonDocumentUrl\s*:\s*['"`]([^'"`]+)['"`]/.exec(text);
  const port = /\.listen\(\s*(?:process\.env\.\w+\s*(?:\?\?|\|\|)\s*)?(\d{2,5})/.exec(text);
  const ev: Partial<Evidence> = {
    strong: true,
    evidence: [`SwaggerModule.setup('${path}') in ${relativeToRoot(hit.file)}`],
    docsPath: jsonUrl ? jsonUrl[1] : `/${path}-json`,
    uiPath: `/${path}`,
    notes: [],
  };
  if (port) ev.port = Number(port[1]);
  if (/useGlobalPrefix\s*:\s*true/.test(text)) {
    const prefix = /setGlobalPrefix\(\s*['"`]([^'"`]+)/.exec(text);
    if (prefix) ev.basePath = prefix[1];
  }
  return ev;
}

async function inspectNodeRoutes(dir: string, uiRe: RegExp): Promise<Partial<Evidence>> {
  const files = await sourceFiles(dir, [".ts", ".js", ".mjs", ".cjs"], 300);
  const ev: Partial<Evidence> = { evidence: [], notes: [] };
  const json = await grep(files, /\.(?:get|route)\(\s*['"`](\/[^'"`]*(?:swagger|openapi|api-docs)[^'"`]*\.(?:json|ya?ml)|\/[^'"`]*(?:swagger|openapi)\.json)['"`]/i);
  if (json) {
    ev.docsPath = json.match[1];
    ev.strong = true;
    ev.evidence!.push(`route ${json.match[1]} in ${relativeToRoot(json.file)}`);
  }
  const ui = await grep(files, uiRe);
  if (ui) {
    ev.uiPath = ui.match[1];
    ev.strong = true;
    ev.evidence!.push(`docs UI mounted at ${ui.match[1]} in ${relativeToRoot(ui.file)}`);
    if (!json) ev.notes!.push("Only the Swagger UI mount was found; the JSON route is usually the spec passed to swaggerUi.setup()");
  }
  const port = await grep(files, /\.listen\(\s*(?:process\.env\.\w+\s*(?:\?\?|\|\|)\s*)?(\d{2,5})/);
  if (port) ev.port = Number(port.match[1]);
  return ev;
}

async function inspectDotnet(dir: string): Promise<Partial<Evidence>> {
  const ev: Partial<Evidence> = { evidence: [], notes: [] };
  const launch = await readText(join(dir, "Properties", "launchSettings.json"));
  if (launch) {
    const m = /"applicationUrl"\s*:\s*"([^"]+)"/.exec(launch);
    const url = m?.[1].split(";").find((u) => u.startsWith("http://")) ?? m?.[1].split(";")[0];
    if (url) {
      ev.port = portFrom(url.replace(/^https?:\/\/[^:]+/, ""));
      ev.configFile = relativeToRoot(join(dir, "Properties", "launchSettings.json"));
    }
  }
  const files = await sourceFiles(dir, [".cs"], 300);
  const mapOpenApi = await grep(files, /MapOpenApi\(\s*(?:"([^"]+)")?\s*\)/);
  if (mapOpenApi) {
    ev.strong = true;
    ev.docsPath = (mapOpenApi.match[1] ?? "/openapi/{documentName}.json").replace("{documentName}", "v1");
    ev.evidence!.push(`MapOpenApi() in ${relativeToRoot(mapOpenApi.file)}`);
  }
  const swagger = await grep(files, /UseSwagger\(|UseOpenApi\(/);
  if (swagger) {
    ev.strong = true;
    ev.evidence!.push(`${swagger.match[0]} in ${relativeToRoot(swagger.file)}`);
    const text = (await readText(swagger.file)) ?? "";
    const tpl = /RouteTemplate\s*=\s*"([^"]+)"/.exec(text) ?? /\.Path\s*=\s*"([^"]+)"/.exec(text);
    if (tpl) ev.docsPath = `/${tpl[1].replace(/^\//, "").replace("{documentName}", "v1")}`;
  }
  return ev;
}

async function inspectGenerated(dir: string, rels: string[]): Promise<Partial<Evidence>> {
  const found = rels.filter((r) => existsSync(join(dir, r)));
  if (!found.length) return {};
  return { strong: true, generatedSpecs: found.map((r) => relativeToRoot(join(dir, r))), evidence: found.map((r) => `generated spec ${r}`) };
}

async function inspectTsoa(dir: string): Promise<Partial<Evidence>> {
  const cfg = await readText(join(dir, "tsoa.json"));
  if (!cfg) return {};
  try {
    const j = JSON.parse(cfg);
    const out = j?.spec?.outputDirectory;
    const name = j?.spec?.specFileBaseName ?? "swagger";
    const ev: Partial<Evidence> = { strong: true, configFile: relativeToRoot(join(dir, "tsoa.json")), evidence: ["tsoa.json"] };
    if (out) {
      const g = await inspectGenerated(dir, [`${out}/${name}.json`, `${out}/${name}.yaml`]);
      ev.generatedSpecs = g.generatedSpecs;
    }
    return ev;
  } catch {
    return {};
  }
}

async function inspectDjango(dir: string, view: string): Promise<Partial<Evidence>> {
  const files = (await sourceFiles(dir, [".py"], 400)).filter((f) => basename(f) === "urls.py");
  const re = new RegExp(`(?:re_)?path\\(\\s*r?['"]\\^?([^'"$]*)\\$?['"]\\s*,\\s*${view}`);
  const hit = await grep(files, re);
  if (!hit) return {};
  const p = hit.match[1].replace(/\(\?P<format>[^)]*\)/, ".json");
  return { strong: true, docsPath: `/${p.replace(/^\//, "")}`, evidence: [`${view} routed at /${p} in ${relativeToRoot(hit.file)}`] };
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const JAVA_SPRINGDOC_SRC = /@OpenAPIDefinition|GroupedOpenApi|new OpenAPI\(\)|OpenAPI\(\)/;

const SIGNATURES: Signature[] = [
  // Java
  { ecosystem: "java", framework: "spring-boot", openApiLibrary: "springdoc", dependency: /springdoc-openapi/, docsPath: "/v3/api-docs", uiPath: "/swagger-ui.html", alternativePaths: ["/v3/api-docs.yaml"], defaultPort: 8080, inspect: (d) => inspectSpring(d, JAVA_SPRINGDOC_SRC) },
  { ecosystem: "java", framework: "spring-boot", openApiLibrary: "springfox", dependency: /springfox-(swagger2|boot-starter)/, docsPath: "/v2/api-docs", uiPath: "/swagger-ui/", alternativePaths: ["/swagger-resources"], defaultPort: 8080, inspect: (d) => inspectSpring(d, /@EnableSwagger2|new Docket\(/) },
  { ecosystem: "java", framework: "quarkus", openApiLibrary: "smallrye-openapi", dependency: /quarkus-smallrye-openapi/, docsPath: "/q/openapi", uiPath: "/q/swagger-ui", alternativePaths: ["/q/openapi?format=json"], defaultPort: 8080, inspect: inspectQuarkus },
  { ecosystem: "java", framework: "micronaut", openApiLibrary: "micronaut-openapi", dependency: /micronaut-openapi/, docsPath: "/swagger", alternativePaths: [], defaultPort: 8080, inspect: (d) => inspectGenerated(d, ["build/classes/java/main/META-INF/swagger", "target/classes/META-INF/swagger"]) },
  { ecosystem: "java", framework: "javalin", openApiLibrary: "javalin-openapi", dependency: /javalin-openapi/, docsPath: "/openapi", alternativePaths: ["/swagger-docs"], defaultPort: 8080 },
  { ecosystem: "java", framework: "jax-rs", openApiLibrary: "swagger-jaxrs2", dependency: /swagger-jaxrs2/, docsPath: "/openapi.json", alternativePaths: ["/openapi.yaml"], defaultPort: 8080 },
  { ecosystem: "java", framework: "dropwizard", openApiLibrary: "dropwizard-swagger", dependency: /dropwizard-swagger/, docsPath: "/swagger.json", alternativePaths: ["/swagger.yaml"], defaultPort: 8080 },

  // Python
  {
    ecosystem: "python", framework: "fastapi", openApiLibrary: "built-in", dependency: /\bfastapi\b/i, docsPath: "/openapi.json", uiPath: "/docs", alternativePaths: ["/redoc"], defaultPort: 8000,
    inspect: (d) =>
      inspectPython(d, /FastAPI\(([^)]*)\)/, (m) => {
        const args = m[1] ?? "";
        const url = /openapi_url\s*=\s*(None|["']([^"']*)["'])/.exec(args);
        const root = /root_path\s*=\s*["']([^"']*)["']/.exec(args);
        const docs = /docs_url\s*=\s*["']([^"']*)["']/.exec(args);
        return {
          ...(url && url[1] !== "None" && { docsPath: url[2] }),
          ...(url && url[1] === "None" && { notes: ["openapi_url=None: the schema endpoint is disabled"] }),
          ...(root && { basePath: root[1] }),
          ...(docs && { uiPath: docs[1] }),
        };
      }),
  },
  {
    ecosystem: "python", framework: "flask", openApiLibrary: "flask-smorest", dependency: /flask[-_]smorest/i, docsPath: "/openapi.json", alternativePaths: [], defaultPort: 5000,
    inspect: (d) =>
      inspectPython(d, /OPENAPI_URL_PREFIX['"]?\s*[\]=:]+\s*['"]([^'"]*)['"]/, (m, text) => {
        const json = /OPENAPI_JSON_PATH['"]?\s*[\]=:]+\s*['"]([^'"]*)['"]/.exec(text);
        return { docsPath: joinPath(m[1], json?.[1] ?? "openapi.json") };
      }),
  },
  { ecosystem: "python", framework: "flask", openApiLibrary: "flasgger", dependency: /flasgger/i, docsPath: "/apispec_1.json", uiPath: "/apidocs", alternativePaths: [], defaultPort: 5000, inspect: (d) => inspectPython(d, /Swagger\(\s*app/) },
  { ecosystem: "python", framework: "flask", openApiLibrary: "apifairy", dependency: /apifairy/i, docsPath: "/apispec.json", uiPath: "/docs", alternativePaths: [], defaultPort: 5000, inspect: (d) => inspectPython(d, /APIFairy\(/) },
  { ecosystem: "python", framework: "django", openApiLibrary: "drf-spectacular", dependency: /drf[-_]spectacular/i, docsPath: "/api/schema/", uiPath: "/api/schema/swagger-ui/", alternativePaths: [], defaultPort: 8000, inspect: (d) => inspectDjango(d, "SpectacularAPIView") },
  { ecosystem: "python", framework: "django", openApiLibrary: "drf-yasg", dependency: /drf[-_]yasg/i, docsPath: "/swagger.json", uiPath: "/swagger/", alternativePaths: ["/swagger.yaml"], defaultPort: 8000, inspect: (d) => inspectDjango(d, "schema_view\\.without_ui") },
  { ecosystem: "python", framework: "django-ninja", openApiLibrary: "built-in", dependency: /django[-_]ninja/i, docsPath: "/api/openapi.json", uiPath: "/api/docs", alternativePaths: [], defaultPort: 8000, inspect: (d) => inspectPython(d, /NinjaAPI\(/) },
  { ecosystem: "python", framework: "connexion", openApiLibrary: "built-in", dependency: /\bconnexion\b/i, docsPath: "/openapi.json", uiPath: "/ui/", alternativePaths: [], defaultPort: 8000 },
  { ecosystem: "python", framework: "litestar", openApiLibrary: "built-in", dependency: /\blitestar\b/i, docsPath: "/schema/openapi.json", uiPath: "/schema/swagger", alternativePaths: [], defaultPort: 8000, inspect: (d) => inspectPython(d, /Litestar\(/) },
  { ecosystem: "python", framework: "blacksheep", openApiLibrary: "built-in", dependency: /\bblacksheep\b/i, docsPath: "/openapi.json", uiPath: "/docs", alternativePaths: [], defaultPort: 8000 },

  // Node
  { ecosystem: "node", framework: "nestjs", openApiLibrary: "@nestjs/swagger", dependency: /^@nestjs\/swagger$/m, docsPath: "/api-json", uiPath: "/api", alternativePaths: ["/api-yaml"], defaultPort: 3000, inspect: inspectNest },
  { ecosystem: "node", framework: "fastify", openApiLibrary: "@fastify/swagger", dependency: /^@fastify\/swagger$|^fastify-swagger$/m, docsPath: "/documentation/json", uiPath: "/documentation", alternativePaths: ["/documentation/yaml"], defaultPort: 3000,
    inspect: async (d) => {
      const files = await sourceFiles(d, [".ts", ".js", ".mjs"], 300);
      const hit = await grep(files, /routePrefix\s*:\s*['"`]([^'"`]+)['"`]/);
      return hit ? { strong: true, docsPath: `${hit.match[1].replace(/\/$/, "")}/json`, uiPath: hit.match[1], evidence: [`routePrefix ${hit.match[1]} in ${relativeToRoot(hit.file)}`] } : {};
    } },
  { ecosystem: "node", framework: "express", openApiLibrary: "tsoa", dependency: /^tsoa$|^@tsoa\/runtime$/m, docsPath: "/swagger.json", alternativePaths: ["/docs"], defaultPort: 3000, inspect: inspectTsoa },
  { ecosystem: "node", framework: "express", openApiLibrary: "swagger-jsdoc", dependency: /^swagger-jsdoc$/m, docsPath: "/swagger.json", uiPath: "/api-docs", alternativePaths: ["/api-docs.json"], defaultPort: 3000, inspect: (d) => inspectNodeRoutes(d, /\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*swaggerUi\.serve/) },
  { ecosystem: "node", framework: "express", openApiLibrary: "swagger-ui-express", dependency: /^swagger-ui-express$/m, docsPath: "/swagger.json", uiPath: "/api-docs", alternativePaths: [], defaultPort: 3000, inspect: (d) => inspectNodeRoutes(d, /\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*swaggerUi\.serve/) },
  { ecosystem: "node", framework: "hono", openApiLibrary: "@hono/zod-openapi", dependency: /^@hono\/zod-openapi$/m, docsPath: "/doc", alternativePaths: [], defaultPort: 3000,
    inspect: async (d) => {
      const files = await sourceFiles(d, [".ts", ".js"], 300);
      const hit = await grep(files, /\.doc(?:31)?\(\s*['"`]([^'"`]+)['"`]/);
      return hit ? { strong: true, docsPath: hit.match[1], evidence: [`app.doc('${hit.match[1]}') in ${relativeToRoot(hit.file)}`] } : {};
    } },
  { ecosystem: "node", framework: "elysia", openApiLibrary: "@elysiajs/swagger", dependency: /^@elysiajs\/(swagger|openapi)$/m, docsPath: "/swagger/json", uiPath: "/swagger", alternativePaths: ["/openapi/json"], defaultPort: 3000 },
  { ecosystem: "node", framework: "koa", openApiLibrary: "koa2-swagger-ui", dependency: /^koa2-swagger-ui$/m, docsPath: "/swagger.json", uiPath: "/docs", alternativePaths: [], defaultPort: 3000 },
  { ecosystem: "node", framework: "adonisjs", openApiLibrary: "adonis-autoswagger", dependency: /^adonis-autoswagger$|^@adonisjs\/swagger$/m, docsPath: "/swagger", uiPath: "/docs", alternativePaths: [], defaultPort: 3333 },

  // .NET
  { ecosystem: "dotnet", framework: "aspnet", openApiLibrary: "swashbuckle", dependency: /Swashbuckle\.AspNetCore/, docsPath: "/swagger/v1/swagger.json", uiPath: "/swagger", alternativePaths: [], defaultPort: 5000, inspect: inspectDotnet },
  { ecosystem: "dotnet", framework: "aspnet", openApiLibrary: "nswag", dependency: /NSwag\.AspNetCore/, docsPath: "/swagger/v1/swagger.json", uiPath: "/swagger", alternativePaths: [], defaultPort: 5000, inspect: inspectDotnet },
  { ecosystem: "dotnet", framework: "aspnet", openApiLibrary: "microsoft-openapi", dependency: /Microsoft\.AspNetCore\.OpenApi/, docsPath: "/openapi/v1.json", alternativePaths: [], defaultPort: 5000, inspect: inspectDotnet },

  // Go
  { ecosystem: "go", framework: "gin", openApiLibrary: "swag", dependency: /swaggo\/gin-swagger/, docsPath: "/swagger/doc.json", uiPath: "/swagger/index.html", alternativePaths: [], defaultPort: 8080, inspect: (d) => inspectGenerated(d, ["docs/swagger.json", "docs/swagger.yaml"]) },
  { ecosystem: "go", framework: "echo", openApiLibrary: "swag", dependency: /swaggo\/echo-swagger/, docsPath: "/swagger/doc.json", uiPath: "/swagger/index.html", alternativePaths: [], defaultPort: 8080, inspect: (d) => inspectGenerated(d, ["docs/swagger.json", "docs/swagger.yaml"]) },
  { ecosystem: "go", framework: "fiber", openApiLibrary: "swag", dependency: /gofiber\/(swagger|contrib\/swagger)/, docsPath: "/swagger/doc.json", uiPath: "/swagger/index.html", alternativePaths: [], defaultPort: 3000, inspect: (d) => inspectGenerated(d, ["docs/swagger.json", "docs/swagger.yaml"]) },
  { ecosystem: "go", framework: "net/http", openApiLibrary: "swag", dependency: /swaggo\/(swag|http-swagger)/, docsPath: "/swagger/doc.json", uiPath: "/swagger/index.html", alternativePaths: [], defaultPort: 8080, inspect: (d) => inspectGenerated(d, ["docs/swagger.json", "docs/swagger.yaml"]) },

  // Ruby
  { ecosystem: "ruby", framework: "rails", openApiLibrary: "rswag", dependency: /['"]rswag(-api|-specs)?['"]/, docsPath: "/api-docs/v1/swagger.yaml", uiPath: "/api-docs", alternativePaths: ["/api-docs/v1/openapi.yaml"], defaultPort: 3000, inspect: (d) => inspectGenerated(d, ["swagger/v1/swagger.yaml", "swagger/v1/swagger.json", "swagger/v1/openapi.yaml", "openapi/v1/openapi.yaml"]) },
  { ecosystem: "ruby", framework: "grape", openApiLibrary: "grape-swagger", dependency: /['"]grape-swagger['"]/, docsPath: "/swagger_doc.json", alternativePaths: ["/swagger_doc"], defaultPort: 3000 },

  // PHP
  { ecosystem: "php", framework: "laravel", openApiLibrary: "l5-swagger", dependency: /darkaonline\/l5-swagger/, docsPath: "/docs/api-docs.json", uiPath: "/api/documentation", alternativePaths: ["/docs"], defaultPort: 8000, inspect: (d) => inspectGenerated(d, ["storage/api-docs/api-docs.json", "storage/api-docs/api-docs.yaml"]) },
  { ecosystem: "php", framework: "laravel", openApiLibrary: "scramble", dependency: /dedoc\/scramble/, docsPath: "/docs/api.json", uiPath: "/docs/api", alternativePaths: [], defaultPort: 8000 },
  { ecosystem: "php", framework: "symfony", openApiLibrary: "nelmio-api-doc", dependency: /nelmio\/api-doc-bundle/, docsPath: "/api/doc.json", uiPath: "/api/doc", alternativePaths: [], defaultPort: 8000 },
  { ecosystem: "php", framework: "api-platform", openApiLibrary: "built-in", dependency: /api-platform\/(core|symfony|laravel)/, docsPath: "/api/docs.jsonopenapi", uiPath: "/api/docs", alternativePaths: ["/api/docs.json"], defaultPort: 8000 },
];

/** Web frameworks with no OpenAPI library: reported at low confidence. */
const BARE_FRAMEWORKS: Array<{ ecosystem: Ecosystem; framework: string; dependency: RegExp }> = [
  { ecosystem: "java", framework: "spring-boot", dependency: /spring-boot-starter-web(flux)?/ },
  { ecosystem: "java", framework: "quarkus", dependency: /quarkus-(rest|resteasy)/ },
  { ecosystem: "node", framework: "nestjs", dependency: /^@nestjs\/core$/m },
  { ecosystem: "node", framework: "express", dependency: /^express$/m },
  { ecosystem: "node", framework: "fastify", dependency: /^fastify$/m },
  { ecosystem: "node", framework: "koa", dependency: /^koa$/m },
  { ecosystem: "python", framework: "django", dependency: /\bdjango\b/i },
  { ecosystem: "python", framework: "flask", dependency: /\bflask\b/i },
  { ecosystem: "go", framework: "gin", dependency: /gin-gonic\/gin/ },
  { ecosystem: "go", framework: "echo", dependency: /labstack\/echo/ },
  { ecosystem: "go", framework: "fiber", dependency: /gofiber\/fiber/ },
  { ecosystem: "ruby", framework: "rails", dependency: /['"]rails['"]/ },
  { ecosystem: "php", framework: "laravel", dependency: /laravel\/framework/ },
  { ecosystem: "dotnet", framework: "aspnet", dependency: /Microsoft\.NET\.Sdk\.Web/ },
];

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

const MANIFESTS: Record<Ecosystem, (entries: string[]) => string[]> = {
  java: (e) => e.filter((n) => ["pom.xml", "build.gradle", "build.gradle.kts"].includes(n)),
  python: (e) => e.filter((n) => /^requirements.*\.txt$/.test(n) || ["pyproject.toml", "Pipfile", "setup.py", "setup.cfg"].includes(n)),
  node: (e) => e.filter((n) => n === "package.json"),
  dotnet: (e) => e.filter((n) => n.endsWith(".csproj") || n === "Directory.Packages.props"),
  go: (e) => e.filter((n) => n === "go.mod"),
  ruby: (e) => e.filter((n) => n === "Gemfile"),
  php: (e) => e.filter((n) => n === "composer.json"),
};

async function manifestText(dir: string, eco: Ecosystem, files: string[]): Promise<string> {
  const parts: string[] = [];
  for (const f of files) {
    const t = await readText(join(dir, f));
    if (t === undefined) continue;
    if (eco === "node") {
      try {
        const j = JSON.parse(t);
        parts.push(...Object.keys({ ...j.dependencies, ...j.devDependencies, ...j.peerDependencies, ...j.optionalDependencies }));
      } catch {
        parts.push(t);
      }
    } else {
      parts.push(t);
    }
  }
  if (eco === "java") {
    const catalog = await readText(join(dir, "gradle", "libs.versions.toml"));
    if (catalog) parts.push(catalog);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface CandidateUrl {
  url: string;
  kind: "spec" | "ui";
}

export interface DetectedModule {
  path: string;
  alias: string;
  ecosystem: Ecosystem;
  framework: string;
  openApiLibrary?: string;
  confidence: Confidence;
  evidence: string[];
  suggestedEndpoint?: string;
  alternativeEndpoints: string[];
  candidateUrls: CandidateUrl[];
  portSource?: "config" | "default";
  configFile?: string;
  customEndpoint?: string;
  specFiles: string[];
  notes?: string[];
}

export interface DetectionResult {
  root: string;
  modules: DetectedModule[];
  total: number;
  byEcosystem: Record<string, number>;
  specFiles: SpecFile[];
  specFilesTruncated?: boolean;
  skipped?: Array<{ path: string; reason: string }>;
  truncated?: boolean;
  hint?: string;
}

const CONF_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export async function detectApiFrameworks(
  root: string,
  maxDepth = 3,
  includeConfidence: "all" | "high" | "medium" | "low" = "all",
  specLimit = 50
): Promise<DetectionResult> {
  const walk = await walkProject(root, maxDepth);
  const modules: DetectedModule[] = [];

  for (const { path: dir, entries } of walk.dirs) {
    for (const eco of Object.keys(MANIFESTS) as Ecosystem[]) {
      const files = MANIFESTS[eco](entries);
      if (!files.length) continue;
      const text = await manifestText(dir, eco, files);
      let matchedAny = false;
      for (const sig of SIGNATURES.filter((s) => s.ecosystem === eco)) {
        if (!sig.dependency.test(text)) continue;
        matchedAny = true;
        const found: Evidence = { evidence: [`${sig.openApiLibrary} declared in ${files.join(", ")}`], notes: [], generatedSpecs: [], strong: false };
        if (sig.inspect) {
          try {
            const extra = await sig.inspect(dir);
            Object.assign(found, {
              ...extra,
              evidence: [...found.evidence, ...(extra.evidence ?? [])],
              notes: [...found.notes, ...(extra.notes ?? [])],
              generatedSpecs: [...found.generatedSpecs, ...(extra.generatedSpecs ?? [])],
              strong: !!extra.strong,
            });
          } catch (error) {
            found.notes.push(`Inspection failed: ${(error as Error).message}`);
          }
        }
        const port = found.port ?? sig.defaultPort;
        const docsPath = found.docsPath ?? sig.docsPath;
        const base = `http://localhost:${port}`;
        const candidateUrls: CandidateUrl[] = [
          { url: base + joinPath(found.basePath, docsPath), kind: "spec" },
          ...sig.alternativePaths.map((p) => ({ url: base + joinPath(found.basePath, p), kind: "spec" as const })),
          ...(found.uiPath ?? sig.uiPath ? [{ url: base + joinPath(found.basePath, found.uiPath ?? sig.uiPath), kind: "ui" as const }] : []),
        ];
        modules.push({
          path: relativeToRoot(dir),
          alias: basename(dir),
          ecosystem: eco,
          framework: sig.framework,
          openApiLibrary: sig.openApiLibrary,
          confidence: found.strong ? "high" : "medium",
          evidence: found.evidence,
          suggestedEndpoint: docsPath,
          alternativeEndpoints: sig.alternativePaths,
          candidateUrls,
          portSource: found.port ? "config" : "default",
          ...(found.configFile && { configFile: found.configFile }),
          ...(found.docsPath && found.docsPath !== sig.docsPath && { customEndpoint: found.docsPath }),
          specFiles: found.generatedSpecs,
          ...(found.notes.length && { notes: found.notes }),
        });
      }
      if (!matchedAny) {
        for (const bare of BARE_FRAMEWORKS.filter((b) => b.ecosystem === eco)) {
          if (!bare.dependency.test(text)) continue;
          modules.push({
            path: relativeToRoot(dir),
            alias: basename(dir),
            ecosystem: eco,
            framework: bare.framework,
            confidence: "low",
            evidence: [`${bare.framework} declared in ${files.join(", ")}`],
            alternativeEndpoints: [],
            candidateUrls: [],
            specFiles: [],
            notes: ["No OpenAPI library found; the API may be documented by a checked-in spec file (see specFiles)"],
          });
          break;
        }
      }
    }
  }

  const discovered = await discoverSpecFiles(walk, specLimit);
  // Attach checked-in spec files to the nearest module.
  for (const spec of discovered.specFiles) {
    const owner = modules
      .filter((m) => m.path === "." || spec.path.startsWith(`${m.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (owner && !owner.specFiles.includes(spec.path)) owner.specFiles.push(spec.path);
  }

  const threshold = includeConfidence === "all" || includeConfidence === "low" ? 2 : CONF_RANK[includeConfidence];
  const filtered = modules.filter((m) => CONF_RANK[m.confidence] <= threshold).sort((a, b) => CONF_RANK[a.confidence] - CONF_RANK[b.confidence]);
  const byEcosystem: Record<string, number> = {};
  for (const m of filtered) byEcosystem[m.ecosystem] = (byEcosystem[m.ecosystem] ?? 0) + 1;

  return {
    root: relativeToRoot(root),
    modules: filtered,
    total: filtered.length,
    byEcosystem,
    specFiles: discovered.specFiles,
    ...(discovered.truncated && { specFilesTruncated: true }),
    ...(walk.skipped.length && { skipped: walk.skipped.slice(0, 20) }),
    ...(walk.truncated && { truncated: true }),
    ...(filtered.length === 0 && discovered.specFiles.length === 0 && {
      hint: `Nothing found within depth ${maxDepth}. Increase maxDepth, or point path at the service directory.`,
    }),
  };
}

export { SKIP_DIRS };
