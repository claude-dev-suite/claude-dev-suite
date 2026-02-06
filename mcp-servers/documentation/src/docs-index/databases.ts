// SPDX-License-Identifier: MIT
/**
 * Databases and ORM/ODM documentation
 * Includes: PostgreSQL, MongoDB, Redis, MySQL, Prisma, Drizzle, TypeORM, SQLAlchemy
 */

import type { DocsRecord } from "./types.js";

export const DATABASE_TECHNOLOGIES = [
  // Databases
  "postgresql",
  "mongodb",
  "redis",
  "mysql",
  "elasticsearch",
  // ORM/ODM
  "prisma",
  "drizzle",
  "typeorm",
  "sqlalchemy",
  // Spring Data
  "spring-data-mongodb",
  "spring-data-redis",
  "spring-data-elasticsearch",
  "spring-data-neo4j",
  "spring-data-jdbc",
] as const;

export const databaseDocs: DocsRecord = {
  postgresql: {
    basics: {
      local: "postgresql/basics.md",
      url: "https://www.postgresql.org/docs/current/tutorial.html",
    },
    production: {
      local: "postgresql/production.md",
      url: "https://www.postgresql.org/docs/current/admin.html",
    },
  },

  mongodb: {
    queries: {
      local: "mongodb/queries.md",
      url: "https://www.mongodb.com/docs/manual/crud/",
    },
    indexes: {
      local: "mongodb/indexes.md",
      url: "https://www.mongodb.com/docs/manual/indexes/",
    },
    aggregation: {
      local: "mongodb/aggregation.md",
      url: "https://www.mongodb.com/docs/manual/aggregation/",
    },
    production: {
      local: "mongodb/production.md",
      url: "https://www.mongodb.com/docs/manual/administration/production-notes/",
    },
  },

  mysql: {
    queries: {
      local: "mysql/queries.md",
      url: "https://dev.mysql.com/doc/refman/8.0/en/sql-statements.html",
    },
    indexes: {
      local: "mysql/indexes.md",
      url: "https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html",
    },
    production: {
      local: "mysql/production.md",
      url: "https://dev.mysql.com/doc/refman/8.0/en/optimization.html",
    },
  },

  redis: {
    commands: {
      local: "redis/commands.md",
      url: "https://redis.io/commands/",
    },
    patterns: {
      local: "redis/patterns.md",
      url: "https://redis.io/docs/manual/patterns/",
    },
    production: {
      local: "redis/production.md",
      url: "https://redis.io/docs/management/optimization/",
    },
  },

  elasticsearch: {
    basics: {
      local: "elasticsearch/basics.md",
      url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/getting-started.html",
    },
    queries: {
      local: "elasticsearch/queries.md",
      url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html",
    },
    aggregations: {
      local: "elasticsearch/aggregations.md",
      url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations.html",
    },
    mapping: {
      local: "elasticsearch/mapping.md",
      url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html",
    },
    "nodejs-client": {
      local: "elasticsearch/nodejs-client.md",
      url: "https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/introduction.html",
    },
  },

  prisma: {
    schema: {
      local: "prisma/schema.md",
      url: "https://www.prisma.io/docs/orm/prisma-schema",
    },
    queries: {
      local: "prisma/queries.md",
      url: "https://www.prisma.io/docs/orm/prisma-client/queries",
    },
    relations: {
      local: "prisma/relations.md",
      url: "https://www.prisma.io/docs/orm/prisma-schema/data-model/relations",
    },
    migrations: {
      local: "prisma/migrations.md",
      url: "https://www.prisma.io/docs/orm/prisma-migrate",
    },
  },

  drizzle: {
    schema: {
      local: "drizzle/schema.md",
      url: "https://orm.drizzle.team/docs/sql-schema-declaration",
    },
    queries: {
      local: "drizzle/queries.md",
      url: "https://orm.drizzle.team/docs/select",
    },
  },

  typeorm: {
    entities: {
      local: "typeorm/entities.md",
      url: "https://typeorm.io/entities",
    },
    queries: {
      local: "typeorm/queries.md",
      url: "https://typeorm.io/find-options",
    },
  },

  sqlalchemy: {
    basics: {
      local: "sqlalchemy/basics.md",
      url: "https://docs.sqlalchemy.org/en/20/orm/quickstart.html",
    },
  },

  "spring-data-mongodb": {
    repositories: {
      local: "spring-data-mongodb/repositories.md",
      url: "https://docs.spring.io/spring-data/mongodb/reference/mongodb/repositories/repositories.html",
    },
    template: {
      local: "spring-data-mongodb/template.md",
      url: "https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-api.html",
    },
    aggregation: {
      local: "spring-data-mongodb/aggregation.md",
      url: "https://docs.spring.io/spring-data/mongodb/reference/mongodb/aggregation-framework.html",
    },
    transactions: {
      local: "spring-data-mongodb/transactions.md",
      url: "https://docs.spring.io/spring-data/mongodb/reference/mongodb/client-session-transactions.html",
    },
  },

  "spring-data-redis": {
    basics: {
      local: "spring-data-redis/basics.md",
      url: "https://docs.spring.io/spring-data/redis/reference/",
    },
    repositories: {
      local: "spring-data-redis/repositories.md",
      url: "https://docs.spring.io/spring-data/redis/reference/redis/redis-repositories.html",
    },
    template: {
      local: "spring-data-redis/template.md",
      url: "https://docs.spring.io/spring-data/redis/reference/redis/template.html",
    },
    cache: {
      local: "spring-data-redis/cache.md",
      url: "https://docs.spring.io/spring-data/redis/reference/redis/support.html#redis:support:cache-abstraction",
    },
    pubsub: {
      local: "spring-data-redis/pubsub.md",
      url: "https://docs.spring.io/spring-data/redis/reference/redis/pubsub.html",
    },
  },

  "spring-data-elasticsearch": {
    basics: {
      local: "spring-data-elasticsearch/basics.md",
      url: "https://docs.spring.io/spring-data/elasticsearch/reference/",
    },
    repositories: {
      local: "spring-data-elasticsearch/repositories.md",
      url: "https://docs.spring.io/spring-data/elasticsearch/reference/elasticsearch/repositories.html",
    },
    template: {
      local: "spring-data-elasticsearch/template.md",
      url: "https://docs.spring.io/spring-data/elasticsearch/reference/elasticsearch/template.html",
    },
    queries: {
      local: "spring-data-elasticsearch/queries.md",
      url: "https://docs.spring.io/spring-data/elasticsearch/reference/elasticsearch/repositories/elasticsearch-repository-queries.html",
    },
    mapping: {
      local: "spring-data-elasticsearch/mapping.md",
      url: "https://docs.spring.io/spring-data/elasticsearch/reference/elasticsearch/object-mapping.html",
    },
  },

  "spring-data-neo4j": {
    basics: {
      local: "spring-data-neo4j/basics.md",
      url: "https://docs.spring.io/spring-data/neo4j/reference/",
    },
    repositories: {
      local: "spring-data-neo4j/repositories.md",
      url: "https://docs.spring.io/spring-data/neo4j/reference/repositories.html",
    },
    mapping: {
      local: "spring-data-neo4j/mapping.md",
      url: "https://docs.spring.io/spring-data/neo4j/reference/object-mapping.html",
    },
    cypher: {
      local: "spring-data-neo4j/cypher.md",
      url: "https://docs.spring.io/spring-data/neo4j/reference/repositories/custom-queries.html",
    },
    relationships: {
      local: "spring-data-neo4j/relationships.md",
      url: "https://docs.spring.io/spring-data/neo4j/reference/object-mapping.html#mapping.annotations.relationship",
    },
  },

  "spring-data-jdbc": {
    basics: {
      local: "spring-data-jdbc/basics.md",
      url: "https://docs.spring.io/spring-data/jdbc/reference/",
    },
    repositories: {
      local: "spring-data-jdbc/repositories.md",
      url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/query-methods.html",
    },
    aggregates: {
      local: "spring-data-jdbc/aggregates.md",
      url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/domain-driven-design.html",
    },
    queries: {
      local: "spring-data-jdbc/queries.md",
      url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/query-methods.html#jdbc.query-methods.at-query",
    },
    events: {
      local: "spring-data-jdbc/events.md",
      url: "https://docs.spring.io/spring-data/jdbc/reference/jdbc/entity-callbacks.html",
    },
  },
};
