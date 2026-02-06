// SPDX-License-Identifier: MIT
/**
 * Detection Constants
 *
 * Contains all detection rules and mappings used by the detection services.
 */

// Common subdirectories to check
export const COMMON_SUBDIRS = [
  'frontend', 'client', 'web', 'app', 'ui',
  'backend', 'server', 'api', 'service',
  'packages/frontend', 'packages/backend', 'packages/web', 'packages/api',
  'apps/frontend', 'apps/backend', 'apps/web', 'apps/api',
  'src', 'lib',
];

// Monorepo indicators
export const MONOREPO_INDICATORS = ['turbo.json', 'nx.json', 'lerna.json', 'pnpm-workspace.yaml'];

// Docker database detection rules
export const DOCKER_DB_RULES = [
  { pattern: 'postgres', value: 'postgresql' },
  { pattern: 'mysql', value: 'mysql' },
  { pattern: 'mariadb', value: 'mysql' },
  { pattern: 'mongo', value: 'mongodb' },
  { pattern: 'redis', value: 'redis' },
  { pattern: 'sqlite', value: 'sqlite' },
  { pattern: 'mssql', value: 'mssql' },
  { pattern: 'oracle', value: 'oracle' },
] as const;

// NPM package database detection rules
export const NPM_DB_RULES = [
  // PostgreSQL
  { pattern: '"pg"', value: 'postgresql' },
  { pattern: '"postgres"', value: 'postgresql' },
  { pattern: '"@neondatabase/serverless"', value: 'postgresql' },
  // MySQL
  { pattern: '"mysql2"', value: 'mysql' },
  { pattern: '"mysql"', value: 'mysql' },
  // MongoDB
  { pattern: '"mongodb"', value: 'mongodb' },
  { pattern: '"mongoose"', value: 'mongodb', orm: 'mongoose' },
  // Redis
  { pattern: '"redis"', value: 'redis' },
  { pattern: '"ioredis"', value: 'redis' },
  // SQLite
  { pattern: '"better-sqlite3"', value: 'sqlite' },
  { pattern: '"sql.js"', value: 'sqlite' },
  { pattern: '"sqlite3"', value: 'sqlite' },
  // MSSQL
  { pattern: '"mssql"', value: 'mssql' },
  { pattern: '"tedious"', value: 'mssql' },
] as const;

// NPM ORM detection rules
export const NPM_ORM_RULES = [
  { pattern: '"typeorm"', value: 'typeorm' },
  { pattern: '"sequelize"', value: 'sequelize' },
  { pattern: '"knex"', value: 'knex' },
  { pattern: '"kysely"', value: 'kysely' },
  { pattern: '"mikro-orm"', value: 'mikro-orm' },
  { pattern: '"@mikro-orm/core"', value: 'mikro-orm' },
] as const;

// Maven/Gradle database detection rules (for Java projects)
export const JAVA_DB_RULES = [
  { pattern: 'postgresql', value: 'postgresql' },
  { pattern: 'postgres', value: 'postgresql' },
  { pattern: 'mysql-connector', value: 'mysql' },
  { pattern: 'mariadb-java-client', value: 'mysql' },
  { pattern: 'mongodb-driver', value: 'mongodb' },
  { pattern: 'spring-boot-starter-data-mongodb', value: 'mongodb' },
  { pattern: 'spring-data-mongodb', value: 'mongodb' },
  { pattern: 'h2database', value: 'h2' },
  { pattern: 'h2', value: 'h2' },
  { pattern: 'hsqldb', value: 'hsqldb' },
  { pattern: 'mssql-jdbc', value: 'mssql' },
  { pattern: 'ojdbc', value: 'oracle' },
  { pattern: 'oracle-database', value: 'oracle' },
  { pattern: 'spring-boot-starter-data-redis', value: 'redis' },
  { pattern: 'jedis', value: 'redis' },
  { pattern: 'lettuce', value: 'redis' },
] as const;

// Python database detection rules
export const PYTHON_DB_RULES = [
  { pattern: 'psycopg2', value: 'postgresql' },
  { pattern: 'psycopg', value: 'postgresql' },
  { pattern: 'asyncpg', value: 'postgresql' },
  { pattern: 'pymysql', value: 'mysql' },
  { pattern: 'aiomysql', value: 'mysql' },
  { pattern: 'mysqlclient', value: 'mysql' },
  { pattern: 'pymongo', value: 'mongodb' },
  { pattern: 'motor', value: 'mongodb' },
  { pattern: 'redis', value: 'redis' },
  { pattern: 'aioredis', value: 'redis' },
] as const;

// Recommendation mappings
export const STACK_TO_AGENTS: Record<string, string[]> = {
  react: ['react-expert'],
  vue: ['vue-expert'],
  angular: ['angular-expert'],
  svelte: ['svelte-expert'],
  nextjs: ['nextjs-expert'],
  nuxt: ['nuxt-expert'],
  sveltekit: ['svelte-expert'],
  electron: ['electron-expert'],
  express: ['nodejs-expert'],
  fastify: ['nodejs-expert'],
  nestjs: ['nestjs-expert'],
  hono: ['nodejs-expert'],
  'spring-boot': ['spring-boot-expert'],
  fastapi: ['fastapi-expert'],
  django: ['fastapi-expert'],
  flask: ['fastapi-expert'],
  gin: ['go-expert'],
  fiber: ['go-expert'],
  actix: ['rust-expert'],
  axum: ['rust-expert'],
  fresh: ['deno-expert'],
  prisma: ['prisma-expert'],
  drizzle: ['prisma-expert'],
  typeorm: ['prisma-expert', 'typescript-expert'],
  sequelize: ['nodejs-expert'],
  jpa: ['spring-boot-expert'],
  sqlalchemy: ['fastapi-expert'],
  mongoose: ['mongodb-expert'],
  vitest: ['vitest-expert'],
  jest: ['vitest-expert'],
  playwright: ['playwright-expert'],
  cypress: ['playwright-expert'],
};

export const STACK_TO_MCP: Record<string, string[]> = {
  // Databases
  postgresql: ['database-query'],
  mysql: ['database-query'],
  mongodb: ['database-query'],
  redis: ['database-query'],
  sqlite: ['database-query'],
  mssql: ['database-query'],
  oracle: ['database-query'],
  h2: ['database-query'],
  cockroachdb: ['database-query'],
  // ORMs
  prisma: ['database-query'],
  drizzle: ['database-query'],
  typeorm: ['database-query'],
  sequelize: ['database-query'],
  jpa: ['database-query'],
  sqlalchemy: ['database-query'],
  mongoose: ['database-query'],
  // Infrastructure
  docker: ['docker-manager'],
};
