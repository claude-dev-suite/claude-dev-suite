// SPDX-License-Identifier: MIT
/**
 * Category-to-Path Mapping for Path-Scoped Rules
 *
 * Maps agent categories to glob patterns used by Claude Code's
 * `.claude/rules/{category}.md` path-scoped rule system.
 *
 * Categories with an empty paths array are "always-on" — their agents
 * are routed inline in CLAUDE.md regardless of which files are open.
 */

export type RuleCategory =
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'testing'
  | 'infrastructure'
  | 'database'
  | 'security'
  | 'data'
  | 'cloud'
  | 'gamedev'
  | 'industrial'
  | 'messaging'
  | 'bitcoin'
  | 'quality'
  | 'core'
  | 'mcp-config';

/**
 * Glob patterns that activate a category's rule file.
 *
 * An empty array means the category is always-on (no path scoping):
 * those agents are embedded directly in CLAUDE.md so they load on
 * every Claude Code session without a file-match gate.
 */
export const CATEGORY_PATHS: Record<RuleCategory, string[]> = {
  /** UI layer: React, Vue, Svelte, Angular, plain JS/TS components */
  frontend: [
    '**/*.tsx',
    '**/*.jsx',
    '**/*.vue',
    '**/*.svelte',
    '**/*.astro',
    'src/frontend/**',
    'src/client/**',
    'src/ui/**',
    'src/web/**',
    'frontend/**',
    'client/**',
  ],

  /** Server-side: Java, Kotlin, Go, Python, Rust, C# back-end code */
  backend: [
    '**/*.java',
    '**/*.kt',
    '**/*.go',
    '**/*.py',
    '**/*.rs',
    '**/*.cs',
    'src/backend/**',
    'src/main/**',
    'src/server/**',
    'backend/**',
    'server/**',
    'api/**',
  ],

  /** Native mobile: Swift/Obj-C (iOS) and Kotlin/Java (Android) */
  mobile: [
    '**/*.swift',
    '**/*.m',
    '**/*.mm',
    'apps/android/**',
    'apps/ios/**',
    '**/android/**',
    '**/ios/**',
    '**/AndroidManifest.xml',
    '**/Info.plist',
    '**/Podfile',
    '**/build.gradle',
    '**/build.gradle.kts',
  ],

  /** Test files across all frameworks */
  testing: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/test/**',
    '**/tests/**',
    '**/e2e/**',
    '**/cypress/**',
    '**/playwright/**',
  ],

  /** Container, CI/CD, IaC files */
  infrastructure: [
    'Dockerfile*',
    'docker-compose*.yml',
    'docker-compose*.yaml',
    '.github/workflows/**',
    '.gitlab-ci.yml',
    '**/*.tf',
    '**/*.tfvars',
    '**/k8s/**',
    '**/kubernetes/**',
    '**/helm/**',
    '**/charts/**',
    'Makefile',
    '**/*.sh',
  ],

  /** SQL, ORM migrations, schema files */
  database: [
    '**/*.sql',
    '**/migrations/**',
    '**/migration/**',
    '**/schema.prisma',
    '**/flyway/**',
    '**/liquibase/**',
    '**/seeds/**',
    '**/seeders/**',
  ],

  /**
   * Security — always-on: security concerns apply to every file.
   * No path scoping; agents go inline in CLAUDE.md.
   */
  security: [],

  /** Data engineering: pipelines, notebooks, ML scripts */
  data: [
    '**/*.ipynb',
    '**/notebooks/**',
    '**/pipelines/**',
    '**/dbt/**',
    '**/airflow/**',
    '**/spark/**',
    '**/*.parquet',
    '**/*.csv',
    '**/etl/**',
  ],

  /** Cloud-provider SDKs and serverless configs */
  cloud: [
    '**/aws/**',
    '**/gcp/**',
    '**/azure/**',
    '**/cdk/**',
    '**/*.sam.yaml',
    '**/*.sam.yml',
    'serverless.yml',
    'serverless.yaml',
    'template.yaml',
    'template.yml',
  ],

  /** Game engines and game-specific assets */
  gamedev: [
    '**/*.unity',
    '**/*.unitypackage',
    '**/Assets/**',
    '**/Packages/**',
    '**/ProjectSettings/**',
    '**/*.gd',
    '**/*.tscn',
    '**/*.godot',
    '**/*.cs',
    '**/game/**',
    '**/games/**',
  ],

  /** Industrial / embedded / SCADA */
  industrial: [
    '**/*.st',
    '**/*.scl',
    '**/*.iec',
    '**/*.plc',
    '**/*.ladder',
    '**/plc/**',
    '**/scada/**',
    '**/industrial/**',
    '**/firmware/**',
    '**/embedded/**',
  ],

  /** Message brokers: Kafka, RabbitMQ, NATS */
  messaging: [
    '**/kafka/**',
    '**/rabbitmq/**',
    '**/nats/**',
    '**/queue/**',
    '**/queues/**',
    '**/events/**',
    '**/messaging/**',
    '**/pubsub/**',
  ],

  /** Bitcoin / Lightning / blockchain */
  bitcoin: [
    '**/bitcoin/**',
    '**/lightning/**',
    '**/blockchain/**',
    '**/wallet/**',
    '**/nostr/**',
    '**/*.bolt**',
  ],

  /**
   * Code quality / linting — always-on: applies across the whole codebase.
   * No path scoping; agents go inline in CLAUDE.md.
   */
  quality: [],

  /**
   * Core / architect / orchestrator agents — always-on.
   * No path scoping; agents go inline in CLAUDE.md.
   */
  core: [],

  /**
   * MCP configuration — always-on: affects global project setup.
   * No path scoping; agents go inline in CLAUDE.md.
   */
  'mcp-config': [],
};

/**
 * Returns true when a category is always-on (no path scoping).
 * Always-on agents are embedded in CLAUDE.md instead of a rules file.
 */
export function isAlwaysOnCategory(category: string): boolean {
  const paths = CATEGORY_PATHS[category as RuleCategory];
  return paths !== undefined && paths.length === 0;
}

/**
 * Returns the glob patterns for a category, or null if the category
 * is always-on or unknown.
 */
export function getCategoryPaths(category: string): string[] | null {
  const paths = CATEGORY_PATHS[category as RuleCategory];
  if (paths === undefined || paths.length === 0) return null;
  return paths;
}
