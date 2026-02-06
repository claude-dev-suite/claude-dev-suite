// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server - Framework Detection
 * Multi-level detection system for identifying OpenAPI/Swagger frameworks
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";
import type {
  Ecosystem,
  Confidence,
  DetectedFramework,
  DetectionResult,
  FrameworkSignature,
} from "./types.js";

// ============================================
// Framework Signatures Database
// ============================================

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  // Java Ecosystem
  {
    ecosystem: "java",
    framework: "spring-boot",
    openApiLibrary: "springdoc",
    dependencyPattern: /springdoc-openapi/,
    defaultEndpoint: "/v3/api-docs",
    alternativeEndpoints: ["/v3/api-docs.yaml", "/swagger-ui.html"],
    configFiles: [
      {
        file: "application.properties",
        pattern: /springdoc\.api-docs\.path\s*=\s*(.+)/,
        extractEndpoint: (m) => m[1].trim(),
      },
      {
        file: "application.yml",
        pattern: /api-docs:\s*\n\s*path:\s*(.+)/,
        extractEndpoint: (m) => m[1].trim(),
      },
    ],
  },
  {
    ecosystem: "java",
    framework: "spring-boot",
    openApiLibrary: "springfox",
    dependencyPattern: /springfox-swagger2/,
    defaultEndpoint: "/v2/api-docs",
    alternativeEndpoints: ["/swagger-resources", "/swagger-ui.html"],
  },
  {
    ecosystem: "java",
    framework: "quarkus",
    openApiLibrary: "smallrye-openapi",
    dependencyPattern: /quarkus-smallrye-openapi/,
    defaultEndpoint: "/q/openapi",
    alternativeEndpoints: ["/q/swagger-ui"],
    configFiles: [
      {
        file: "application.properties",
        pattern: /quarkus\.smallrye-openapi\.path\s*=\s*(.+)/,
        extractEndpoint: (m) => m[1].trim(),
      },
    ],
  },
  {
    ecosystem: "java",
    framework: "micronaut",
    openApiLibrary: "micronaut-openapi",
    dependencyPattern: /micronaut-openapi/,
    defaultEndpoint: "/swagger/views/swagger-ui",
    alternativeEndpoints: ["/swagger"],
  },
  {
    ecosystem: "java",
    framework: "javalin",
    openApiLibrary: "javalin-openapi",
    dependencyPattern: /javalin-openapi/,
    defaultEndpoint: "/swagger-docs",
    alternativeEndpoints: ["/openapi"],
  },
  {
    ecosystem: "java",
    framework: "jax-rs",
    openApiLibrary: "swagger-jaxrs2",
    dependencyPattern: /swagger-jaxrs2/,
    defaultEndpoint: "/openapi.json",
    alternativeEndpoints: ["/openapi.yaml"],
  },
  {
    ecosystem: "java",
    framework: "dropwizard",
    openApiLibrary: "dropwizard-swagger",
    dependencyPattern: /dropwizard-swagger/,
    defaultEndpoint: "/swagger.json",
    alternativeEndpoints: ["/swagger.yaml"],
  },

  // Python Ecosystem
  {
    ecosystem: "python",
    framework: "fastapi",
    openApiLibrary: "built-in",
    dependencyPattern: /fastapi/i,
    defaultEndpoint: "/openapi.json",
    alternativeEndpoints: ["/docs", "/redoc"],
    configFiles: [
      {
        file: "main.py",
        pattern: /openapi_url\s*=\s*["'](.+)["']/,
        extractEndpoint: (m) => m[1],
      },
      {
        file: "app.py",
        pattern: /openapi_url\s*=\s*["'](.+)["']/,
        extractEndpoint: (m) => m[1],
      },
    ],
  },
  {
    ecosystem: "python",
    framework: "flask",
    openApiLibrary: "flask-smorest",
    dependencyPattern: /flask-smorest/,
    defaultEndpoint: "/openapi.json",
    alternativeEndpoints: ["/swagger-ui"],
  },
  {
    ecosystem: "python",
    framework: "flask",
    openApiLibrary: "flasgger",
    dependencyPattern: /flasgger/,
    defaultEndpoint: "/apispec_1.json",
    alternativeEndpoints: ["/apidocs"],
  },
  {
    ecosystem: "python",
    framework: "flask",
    openApiLibrary: "apifairy",
    dependencyPattern: /apifairy/,
    defaultEndpoint: "/docs/openapi.json",
    alternativeEndpoints: [],
  },
  {
    ecosystem: "python",
    framework: "django",
    openApiLibrary: "drf-spectacular",
    dependencyPattern: /drf-spectacular/,
    defaultEndpoint: "/api/schema/",
    alternativeEndpoints: ["/api/schema/swagger-ui/"],
  },
  {
    ecosystem: "python",
    framework: "django",
    openApiLibrary: "drf-yasg",
    dependencyPattern: /drf-yasg/,
    defaultEndpoint: "/swagger.json",
    alternativeEndpoints: ["/swagger/"],
  },
  {
    ecosystem: "python",
    framework: "connexion",
    openApiLibrary: "built-in",
    dependencyPattern: /connexion/,
    defaultEndpoint: "/api/openapi.json",
    alternativeEndpoints: ["/api/ui"],
  },
  {
    ecosystem: "python",
    framework: "litestar",
    openApiLibrary: "built-in",
    dependencyPattern: /litestar/,
    defaultEndpoint: "/schema/openapi.json",
    alternativeEndpoints: ["/schema/swagger"],
  },
  {
    ecosystem: "python",
    framework: "blacksheep",
    openApiLibrary: "built-in",
    dependencyPattern: /blacksheep/,
    defaultEndpoint: "/docs",
    alternativeEndpoints: ["/openapi.json"],
  },

  // Node.js Ecosystem
  {
    ecosystem: "node",
    framework: "nestjs",
    openApiLibrary: "@nestjs/swagger",
    dependencyPattern: /@nestjs\/swagger/,
    defaultEndpoint: "/api-docs-json",
    alternativeEndpoints: ["/api-docs", "/api"],
    configFiles: [
      {
        file: "main.ts",
        pattern: /SwaggerModule\.setup\s*\(\s*["'](.+?)["']/,
        extractEndpoint: (m) => `/${m[1]}`,
      },
    ],
  },
  {
    ecosystem: "node",
    framework: "fastify",
    openApiLibrary: "@fastify/swagger",
    dependencyPattern: /@fastify\/swagger/,
    defaultEndpoint: "/documentation/json",
    alternativeEndpoints: ["/documentation"],
  },
  {
    ecosystem: "node",
    framework: "express",
    openApiLibrary: "swagger-jsdoc",
    dependencyPattern: /swagger-jsdoc/,
    defaultEndpoint: "/api-docs",
    alternativeEndpoints: ["/swagger.json"],
  },
  {
    ecosystem: "node",
    framework: "express",
    openApiLibrary: "tsoa",
    dependencyPattern: /"tsoa"/,
    defaultEndpoint: "/docs",
    alternativeEndpoints: ["/swagger.json"],
  },
  {
    ecosystem: "node",
    framework: "hono",
    openApiLibrary: "@hono/zod-openapi",
    dependencyPattern: /@hono\/zod-openapi/,
    defaultEndpoint: "/doc",
    alternativeEndpoints: ["/openapi.json"],
  },
  {
    ecosystem: "node",
    framework: "elysia",
    openApiLibrary: "@elysiajs/swagger",
    dependencyPattern: /@elysiajs\/swagger/,
    defaultEndpoint: "/swagger/json",
    alternativeEndpoints: ["/swagger"],
  },
  {
    ecosystem: "node",
    framework: "koa",
    openApiLibrary: "koa2-swagger-ui",
    dependencyPattern: /koa2-swagger-ui/,
    defaultEndpoint: "/swagger.json",
    alternativeEndpoints: [],
  },
  {
    ecosystem: "node",
    framework: "adonisjs",
    openApiLibrary: "@adonisjs/swagger",
    dependencyPattern: /@adonisjs\/swagger/,
    defaultEndpoint: "/swagger.json",
    alternativeEndpoints: ["/docs"],
  },

  // .NET Ecosystem
  {
    ecosystem: "dotnet",
    framework: "aspnet",
    openApiLibrary: "swashbuckle",
    dependencyPattern: /Swashbuckle\.AspNetCore/,
    defaultEndpoint: "/swagger/v1/swagger.json",
    alternativeEndpoints: ["/swagger"],
  },
  {
    ecosystem: "dotnet",
    framework: "aspnet",
    openApiLibrary: "nswag",
    dependencyPattern: /NSwag\.AspNetCore/,
    defaultEndpoint: "/swagger/v1/swagger.json",
    alternativeEndpoints: [],
  },
  {
    ecosystem: "dotnet",
    framework: "aspnet",
    openApiLibrary: "native",
    dependencyPattern: /Microsoft\.AspNetCore\.OpenApi/,
    defaultEndpoint: "/openapi/v1.json",
    alternativeEndpoints: [],
  },

  // Go Ecosystem
  {
    ecosystem: "go",
    framework: "gin",
    openApiLibrary: "swag",
    dependencyPattern: /swaggo\/gin-swagger/,
    defaultEndpoint: "/swagger/index.html",
    alternativeEndpoints: ["/swagger/doc.json"],
  },
  {
    ecosystem: "go",
    framework: "echo",
    openApiLibrary: "swag",
    dependencyPattern: /swaggo\/echo-swagger/,
    defaultEndpoint: "/swagger",
    alternativeEndpoints: ["/swagger/doc.json"],
  },
  {
    ecosystem: "go",
    framework: "fiber",
    openApiLibrary: "swagger",
    dependencyPattern: /gofiber\/swagger/,
    defaultEndpoint: "/swagger.json",
    alternativeEndpoints: [],
  },

  // Ruby Ecosystem
  {
    ecosystem: "ruby",
    framework: "rails",
    openApiLibrary: "rswag",
    dependencyPattern: /rswag/,
    defaultEndpoint: "/api-docs/v1/swagger.json",
    alternativeEndpoints: [],
  },
  {
    ecosystem: "ruby",
    framework: "grape",
    openApiLibrary: "grape-swagger",
    dependencyPattern: /grape-swagger/,
    defaultEndpoint: "/swagger_doc",
    alternativeEndpoints: [],
  },

  // PHP Ecosystem
  {
    ecosystem: "php",
    framework: "laravel",
    openApiLibrary: "l5-swagger",
    dependencyPattern: /darkaonline\/l5-swagger/,
    defaultEndpoint: "/api/documentation",
    alternativeEndpoints: [],
  },
  {
    ecosystem: "php",
    framework: "symfony",
    openApiLibrary: "nelmio-api-doc",
    dependencyPattern: /nelmio\/api-doc-bundle/,
    defaultEndpoint: "/api/doc.json",
    alternativeEndpoints: [],
  },
];

// ============================================
// Ecosystem Detection Files
// ============================================

const ECOSYSTEM_FILES: Record<Ecosystem, string[]> = {
  java: ["pom.xml", "build.gradle", "build.gradle.kts"],
  python: ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"],
  node: ["package.json"],
  dotnet: ["*.csproj", "*.sln"],
  go: ["go.mod"],
  ruby: ["Gemfile"],
  php: ["composer.json"],
};

// ============================================
// Detection Functions
// ============================================

/**
 * Detect API frameworks in a project directory
 */
export async function detectApiFrameworks(
  projectPath: string,
  maxDepth: number = 3,
  includeConfidence: "all" | "high" | "medium" = "all"
): Promise<DetectionResult> {
  const modules: DetectedFramework[] = [];

  // Find all project modules
  const projectDirs = await findProjectDirectories(projectPath, maxDepth);

  // Detect framework in each module
  for (const dir of projectDirs) {
    const detected = await detectFrameworkInDirectory(dir);
    if (detected) {
      // Filter by confidence if needed
      if (
        includeConfidence === "all" ||
        (includeConfidence === "high" && detected.confidence === "high") ||
        (includeConfidence === "medium" &&
          (detected.confidence === "high" || detected.confidence === "medium"))
      ) {
        modules.push(detected);
      }
    }
  }

  // Count by ecosystem
  const byEcosystem: Record<string, number> = {};
  for (const module of modules) {
    byEcosystem[module.ecosystem] = (byEcosystem[module.ecosystem] || 0) + 1;
  }

  return {
    modules,
    total: modules.length,
    byEcosystem,
  };
}

/**
 * Find all directories containing project files
 */
async function findProjectDirectories(
  basePath: string,
  maxDepth: number,
  currentDepth: number = 0
): Promise<string[]> {
  const dirs: string[] = [];

  if (currentDepth > maxDepth) {
    return dirs;
  }

  try {
    // Check if current directory has project files
    const hasProjectFiles = await hasAnyProjectFile(basePath);
    if (hasProjectFiles) {
      dirs.push(basePath);
    }

    // Scan subdirectories
    const entries = await readdir(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !entry.name.startsWith("node_modules") &&
        !entry.name.startsWith("target") &&
        !entry.name.startsWith("build") &&
        !entry.name.startsWith("dist") &&
        !entry.name.startsWith("vendor") &&
        !entry.name.startsWith("__pycache__") &&
        !entry.name.startsWith("venv") &&
        !entry.name.startsWith(".venv")
      ) {
        const subDirs = await findProjectDirectories(
          join(basePath, entry.name),
          maxDepth,
          currentDepth + 1
        );
        dirs.push(...subDirs);
      }
    }
  } catch {
    // Ignore access errors
  }

  return dirs;
}

/**
 * Check if directory has any project file
 */
async function hasAnyProjectFile(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);

    for (const ecosystem of Object.keys(ECOSYSTEM_FILES) as Ecosystem[]) {
      for (const pattern of ECOSYSTEM_FILES[ecosystem]) {
        if (pattern.includes("*")) {
          // Glob pattern
          const ext = pattern.replace("*", "");
          if (entries.some((e) => e.endsWith(ext))) {
            return true;
          }
        } else {
          if (entries.includes(pattern)) {
            return true;
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Detect framework in a specific directory
 */
async function detectFrameworkInDirectory(
  dirPath: string
): Promise<DetectedFramework | null> {
  // Determine ecosystem
  const ecosystem = await detectEcosystem(dirPath);
  if (!ecosystem) {
    return null;
  }

  // Get dependency file content
  const depContent = await getDependencyFileContent(dirPath, ecosystem);
  if (!depContent) {
    return null;
  }

  // Find matching framework signature
  const signatures = FRAMEWORK_SIGNATURES.filter((s) => s.ecosystem === ecosystem);

  for (const sig of signatures) {
    const pattern =
      typeof sig.dependencyPattern === "string"
        ? new RegExp(sig.dependencyPattern)
        : sig.dependencyPattern;

    if (pattern.test(depContent)) {
      let confidence: Confidence = "medium";
      let customEndpoint: string | undefined;
      let configFile: string | undefined;

      // Try to find custom configuration (Level 3)
      if (sig.configFiles) {
        for (const cf of sig.configFiles) {
          try {
            const cfContent = await readFile(join(dirPath, cf.file), "utf-8");
            const cfPattern =
              typeof cf.pattern === "string" ? new RegExp(cf.pattern) : cf.pattern;
            const match = cfContent.match(cfPattern);
            if (match && cf.extractEndpoint) {
              customEndpoint = cf.extractEndpoint(match);
              configFile = cf.file;
              confidence = "high";
              break;
            }
          } catch {
            // Config file not found, continue
          }
        }
      }

      // If no custom config found but dependency matched, still high confidence
      if (!customEndpoint && depContent) {
        confidence = "high";
      }

      return {
        path: dirPath,
        alias: basename(dirPath),
        ecosystem: sig.ecosystem,
        framework: sig.framework,
        openApiLibrary: sig.openApiLibrary,
        suggestedEndpoint: customEndpoint || sig.defaultEndpoint,
        alternativeEndpoints: sig.alternativeEndpoints,
        confidence,
        configFile,
        customEndpoint,
      };
    }
  }

  return null;
}

/**
 * Detect ecosystem from directory contents
 */
async function detectEcosystem(dirPath: string): Promise<Ecosystem | null> {
  try {
    const entries = await readdir(dirPath);

    // Check each ecosystem in order of specificity
    const ecosystemOrder: Ecosystem[] = [
      "java",
      "dotnet",
      "go",
      "ruby",
      "php",
      "python",
      "node",
    ];

    for (const ecosystem of ecosystemOrder) {
      for (const pattern of ECOSYSTEM_FILES[ecosystem]) {
        if (pattern.includes("*")) {
          const ext = pattern.replace("*", "");
          if (entries.some((e) => e.endsWith(ext))) {
            return ecosystem;
          }
        } else {
          if (entries.includes(pattern)) {
            return ecosystem;
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Get content of dependency file for an ecosystem
 */
async function getDependencyFileContent(
  dirPath: string,
  ecosystem: Ecosystem
): Promise<string | null> {
  const files = ECOSYSTEM_FILES[ecosystem];

  for (const file of files) {
    try {
      if (file.includes("*")) {
        // Handle glob pattern (e.g., *.csproj)
        const ext = file.replace("*", "");
        const entries = await readdir(dirPath);
        const matching = entries.find((e) => e.endsWith(ext));
        if (matching) {
          return await readFile(join(dirPath, matching), "utf-8");
        }
      } else {
        const content = await readFile(join(dirPath, file), "utf-8");
        return content;
      }
    } catch {
      // File not found, try next
    }
  }

  return null;
}

/**
 * Get framework signatures for a specific ecosystem
 */
export function getFrameworkSignatures(
  ecosystem?: Ecosystem
): FrameworkSignature[] {
  if (ecosystem) {
    return FRAMEWORK_SIGNATURES.filter((s) => s.ecosystem === ecosystem);
  }
  return FRAMEWORK_SIGNATURES;
}

/**
 * Get all supported ecosystems
 */
export function getSupportedEcosystems(): Ecosystem[] {
  return Object.keys(ECOSYSTEM_FILES) as Ecosystem[];
}
