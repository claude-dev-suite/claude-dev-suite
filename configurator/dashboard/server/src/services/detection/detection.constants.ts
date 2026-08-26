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

// NPM state management detection rules
export const NPM_STATE_RULES = [
  { pattern: '"zustand"', value: 'zustand' },
  { pattern: '"@reduxjs/toolkit"', value: 'redux' },
  { pattern: '"redux"', value: 'redux' },
  { pattern: '"pinia"', value: 'pinia' },
  { pattern: '"@ngrx/store"', value: 'ngrx' },
  { pattern: '"@tanstack/react-query"', value: 'tanstack-query' },
  { pattern: '"@tanstack/vue-query"', value: 'tanstack-query' },
  { pattern: '"@tanstack/svelte-query"', value: 'tanstack-query' },
  { pattern: '"mobx"', value: 'mobx' },
  { pattern: '"jotai"', value: 'jotai' },
  { pattern: '"recoil"', value: 'recoil' },
] as const;

// NPM messaging detection rules
export const NPM_MESSAGING_RULES = [
  { pattern: '"kafkajs"', value: 'kafka' },
  { pattern: '"@confluentinc/kafka-javascript"', value: 'kafka' },
  { pattern: '"amqplib"', value: 'rabbitmq' },
  { pattern: '"rhea"', value: 'rabbitmq' },
  { pattern: '"nats"', value: 'nats' },
  { pattern: '"@aws-sdk/client-sqs"', value: 'sqs' },
  { pattern: '"bullmq"', value: 'redis' },
  { pattern: '"bull"', value: 'redis' },
] as const;

// NPM API/GraphQL detection rules
export const NPM_API_RULES = [
  { pattern: '"graphql"', value: 'graphql' },
  { pattern: '"@apollo/server"', value: 'graphql' },
  { pattern: '"@apollo/client"', value: 'graphql' },
  { pattern: '"type-graphql"', value: 'graphql' },
  { pattern: '"@trpc/server"', value: 'trpc' },
  { pattern: '"@trpc/client"', value: 'trpc' },
  { pattern: '"swagger-jsdoc"', value: 'openapi' },
  { pattern: '"@nestjs/swagger"', value: 'openapi' },
  { pattern: '"swagger-ui-express"', value: 'openapi' },
] as const;

// NPM auth detection rules
export const NPM_AUTH_RULES = [
  { pattern: '"next-auth"', value: 'nextauth' },
  { pattern: '"@auth/core"', value: 'nextauth' },
  { pattern: '"passport"', value: 'passport' },
  { pattern: '"jsonwebtoken"', value: 'jwt' },
  { pattern: '"jose"', value: 'jwt' },
  { pattern: '"@clerk/nextjs"', value: 'clerk' },
  { pattern: '"@supabase/supabase-js"', value: 'supabase' },
] as const;

// Java messaging detection rules
export const JAVA_MESSAGING_RULES = [
  { pattern: 'spring-kafka', value: 'kafka' },
  { pattern: 'kafka-clients', value: 'kafka' },
  { pattern: 'spring-boot-starter-amqp', value: 'rabbitmq' },
  { pattern: 'amqp-client', value: 'rabbitmq' },
] as const;

// Python messaging detection rules
export const PYTHON_MESSAGING_RULES = [
  { pattern: 'confluent-kafka', value: 'kafka' },
  { pattern: 'aiokafka', value: 'kafka' },
  { pattern: 'kafka-python', value: 'kafka' },
  { pattern: 'pika', value: 'rabbitmq' },
  { pattern: 'aio-pika', value: 'rabbitmq' },
  { pattern: 'celery', value: 'rabbitmq' },
] as const;

// .NET database detection rules
export const DOTNET_DB_RULES = [
  { pattern: 'Npgsql', value: 'postgresql' },
  { pattern: 'Pomelo.EntityFrameworkCore.MySql', value: 'mysql' },
  { pattern: 'MySqlConnector', value: 'mysql' },
  { pattern: 'MongoDB.Driver', value: 'mongodb' },
  { pattern: 'Microsoft.Data.SqlClient', value: 'mssql' },
  { pattern: 'System.Data.SqlClient', value: 'mssql' },
  { pattern: 'Microsoft.Data.Sqlite', value: 'sqlite' },
  { pattern: 'StackExchange.Redis', value: 'redis' },
  { pattern: 'Oracle.EntityFrameworkCore', value: 'oracle' },
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
  // Frontend frameworks
  react: ['react-expert'],
  vue: ['vue-expert'],
  angular: ['angular-expert'],
  svelte: ['svelte-expert'],
  solid: ['typescript-expert'],
  // Meta-frameworks
  nextjs: ['nextjs-expert'],
  // `nuxt-expert` never existed, so a detected Nuxt project got no frontend
  // recommendation at all. Nuxt is Vue's meta-framework, matching how
  // `sveltekit` maps to `svelte-expert` and `remix` to `react-expert`.
  nuxt: ['vue-expert'],
  sveltekit: ['svelte-expert'],
  remix: ['react-expert'],
  astro: ['typescript-expert'],
  // Desktop frameworks
  electron: ['electron-expert'],
  tauri: ['tauri-expert'],
  // Mobile - native
  'android-native': ['mobile-expert'],
  kotlin: ['mobile-expert'],
  'jetpack-compose': ['mobile-expert'],
  room: ['mobile-expert'],
  // Game development - Unity
  unity: ['unity-expert'],
  'unity-2d': ['unity-expert'],
  'unity-urp': ['unity-expert'],
  'unity-hdrp': ['unity-expert'],
  'unity-netcode': ['unity-expert'],
  'unity-dots': ['unity-expert'],
  'unity-ar': ['unity-expert'],
  'unity-xr': ['unity-expert'],
  'unity-addressables': ['unity-expert'],
  'unity-input-system': ['unity-expert'],
  'unity-cinemachine': ['unity-expert'],
  'unity-timeline': ['unity-expert'],
  'unity-localization': ['unity-expert'],
  // Node.js backend frameworks
  express: ['nodejs-expert'],
  fastify: ['nodejs-expert'],
  nestjs: ['nestjs-expert'],
  hono: ['nodejs-expert'],
  // Java
  'spring-boot': ['spring-boot-expert'],
  // Python
  fastapi: ['fastapi-expert'],
  django: ['fastapi-expert'],
  flask: ['fastapi-expert'],
  // Go
  gin: ['go-expert'],
  fiber: ['go-expert'],
  echo: ['go-expert'],
  chi: ['go-expert'],
  // Rust
  actix: ['rust-expert'],
  axum: ['rust-expert'],
  rocket: ['rust-expert'],
  warp: ['rust-expert'],
  // Deno
  fresh: ['deno-expert'],
  oak: ['deno-expert'],
  // .NET
  dotnet: ['dotnet-expert'],
  // ORM
  prisma: ['prisma-expert'],
  drizzle: ['prisma-expert'],
  typeorm: ['prisma-expert', 'typescript-expert'],
  sequelize: ['nodejs-expert'],
  jpa: ['spring-boot-expert'],
  sqlalchemy: ['fastapi-expert'],
  mongoose: ['mongodb-expert'],
  efcore: ['dotnet-expert'],
  // Testing
  vitest: ['vitest-expert'],
  jest: ['vitest-expert'],
  playwright: ['playwright-expert'],
  cypress: ['playwright-expert'],
  pytest: ['qa-expert'],
  junit: ['spring-boot-integration-test-expert'],
  xunit: ['dotnet-expert'],
  // Messaging
  kafka: ['messaging-expert'],
  rabbitmq: ['messaging-expert'],
  nats: ['messaging-expert'],
  sqs: ['messaging-expert'],
  // API design
  graphql: ['typescript-expert'],
  trpc: ['typescript-expert'],
  // Infrastructure
  docker: ['docker-expert'],
  'github-actions': ['devops-expert'],
  // Bitcoin / Lightning / L2 / Metaprotocols
  // The Bitcoin agents are domain-experts, not language-experts: language
  // skills are loaded onto the existing rust/typescript/python/go/java agents
  // via skill detection. Bitcoin domain agents handle protocol/Lightning/wallet/
  // node-ops/testing reasoning across languages.
  'bitcoin-rust': ['bitcoin-protocol-expert', 'bitcoin-wallet-expert', 'rust-expert'],
  'bitcoin-bdk': ['bitcoin-wallet-expert', 'bitcoin-protocol-expert'],
  'bitcoin-ldk': ['lightning-expert'],
  'bitcoin-miniscript': ['bitcoin-wallet-expert', 'bitcoin-protocol-expert'],
  'bitcoin-cryptography': ['bitcoin-protocol-expert'],
  'bitcoin-dlc': ['bitcoin-protocol-expert', 'bitcoin-wallet-expert'],
  'bitcoin-taproot-assets': ['lightning-expert', 'bitcoin-protocol-expert'],
  'bitcoin-rgb': ['lightning-expert', 'bitcoin-protocol-expert'],
  'bitcoin-ts': ['bitcoin-wallet-expert', 'bitcoin-protocol-expert', 'typescript-expert'],
  'bitcoin-mempool-js': ['bitcoin-core-expert'],
  'bitcoin-lightning-ts': ['lightning-expert', 'typescript-expert'],
  'bitcoin-cashu': ['lightning-expert', 'bitcoin-wallet-expert'],
  'bitcoin-nwc': ['lightning-expert'],
  'bitcoin-webln': ['lightning-expert'],
  'bitcoin-stacks': ['bitcoin-protocol-expert'],
  'bitcoin-rsk': ['bitcoin-protocol-expert'],
  'bitcoin-python': ['bitcoin-wallet-expert', 'bitcoin-protocol-expert'],
  'bitcoin-embit': ['bitcoin-wallet-expert'],
  'bitcoin-go': ['bitcoin-protocol-expert', 'go-expert'],
  'bitcoin-lnd': ['lightning-expert'],
  'bitcoin-cln': ['lightning-expert'],
  'bitcoin-eclair': ['lightning-expert'],
  'bitcoin-phoenixd': ['lightning-expert'],
  bitcoinj: ['bitcoin-wallet-expert'],
  'bitcoin-nbitcoin': ['bitcoin-wallet-expert'],
  'bitcoin-btcpay': ['bitcoin-core-expert', 'lightning-expert'],
  'bitcoin-core': ['bitcoin-core-expert'],
  'bitcoin-electrs': ['bitcoin-core-expert'],
  'bitcoin-fulcrum': ['bitcoin-core-expert'],
  'bitcoin-esplora': ['bitcoin-core-expert'],
  'bitcoin-mempool-space': ['bitcoin-core-expert'],
  'bitcoin-fedimint': ['lightning-expert', 'bitcoin-wallet-expert'],
  'bitcoin-ark': ['bitcoin-wallet-expert', 'bitcoin-protocol-expert'],
  'bitcoin-metaprotocols': ['bitcoin-protocol-expert'],
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
  efcore: ['database-query'],
  // Infrastructure
  docker: ['docker-manager'],
  // API
  graphql: ['api-tester'],
  trpc: ['api-tester'],
  openapi: ['api-explorer'],
};
