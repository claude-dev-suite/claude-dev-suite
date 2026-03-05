// SPDX-License-Identifier: MIT
/**
 * Architecture patterns documentation
 * Includes: DDD, Event Sourcing/CQRS, Multitenancy
 */

import type { DocsRecord } from "./types.js";

export const ARCHITECTURE_TECHNOLOGIES = [
  "ddd",
  "event-sourcing-cqrs",
  "multitenancy",
] as const;

export const architectureDocs: DocsRecord = {
  ddd: {
    "bounded-contexts": {
      local: "ddd/bounded-contexts.md",
      url: "https://martinfowler.com/bliki/BoundedContext.html",
    },
    "tactical-patterns": {
      local: "ddd/tactical-patterns.md",
      url: "https://martinfowler.com/tags/domain%20driven%20design.html",
    },
    aggregates: {
      local: "ddd/aggregates.md",
      url: "https://martinfowler.com/bliki/DDD_Aggregate.html",
    },
    "domain-events": {
      local: "ddd/domain-events.md",
      url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation",
    },
    repositories: {
      local: "ddd/repositories.md",
      url: "https://martinfowler.com/eaaCatalog/repository.html",
    },
  },

  "event-sourcing-cqrs": {
    "event-store": {
      local: "event-sourcing-cqrs/event-store.md",
      url: "https://www.eventstore.com/event-sourcing",
    },
    commands: {
      local: "event-sourcing-cqrs/commands.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs",
    },
    projections: {
      local: "event-sourcing-cqrs/projections.md",
      url: "https://www.eventstore.com/blog/projections-in-event-sourcing",
    },
    snapshots: {
      local: "event-sourcing-cqrs/snapshots.md",
      url: "https://www.eventstore.com/blog/snapshots-in-event-sourcing",
    },
    sagas: {
      local: "event-sourcing-cqrs/sagas.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga",
    },
  },

  multitenancy: {
    strategies: {
      local: "multitenancy/strategies.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models",
    },
    "row-level-security": {
      local: "multitenancy/row-level-security.md",
      url: "https://www.postgresql.org/docs/current/ddl-rowsecurity.html",
    },
    "schema-per-tenant": {
      local: "multitenancy/schema-per-tenant.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data",
    },
    migration: {
      local: "multitenancy/migration.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/updates",
    },
  },
};
