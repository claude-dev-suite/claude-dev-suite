// SPDX-License-Identifier: MIT
/**
 * Backend frameworks documentation
 * Includes: Express, Fastify, NestJS, Hono, FastAPI, Django, Flask,
 *           Spring Boot ecosystem, Rust/Go/Deno frameworks
 */

import type { DocsRecord } from "./types.js";

export const BACKEND_TECHNOLOGIES = [
  // Node.js
  "express",
  "fastify",
  "nestjs",
  "hono",
  // Python
  "fastapi",
  "django",
  "flask",
  // Java/Spring Core
  "spring-boot",
  "spring-data-jpa",
  "spring-security",
  "spring-validation",
  "mapstruct",
  "lombok",
  "flyway",
  "springdoc",
  // Spring Cloud
  "spring-kafka",
  "spring-amqp",
  "spring-cloud-gateway",
  "spring-cloud-config",
  "spring-cloud-eureka",
  "spring-cloud-openfeign",
  "spring-cloud-circuitbreaker",
  "spring-cloud-function",
  // Spring Web
  "spring-graphql",
  "spring-hateoas",
  // Spring Enterprise
  "spring-session",
  "spring-retry",
  "spring-ai",
  "spring-ldap",
  "spring-shell",
  "spring-statemachine",
  "spring-authorization-server",
  // Spring Observability
  "micrometer-tracing",
  // Rust
  "actix-web",
  "axum",
  "rocket",
  "warp",
  // Go
  "gin",
  "fiber",
  "echo",
  "chi",
  // Deno
  "fresh",
  "oak",
  // .NET/C#
  "aspnet-core",
  "entity-framework-core",
  "signalr",
  "blazor",
] as const;

export const backendDocs: DocsRecord = {
  // Node.js frameworks
  express: {
    basics: {
      local: "express/basics.md",
      url: "https://expressjs.com/en/guide/routing.html",
    },
    middleware: {
      local: "express/middleware.md",
      url: "https://expressjs.com/en/guide/using-middleware.html",
    },
  },

  nestjs: {
    modules: {
      local: "nestjs/modules.md",
      url: "https://docs.nestjs.com/modules",
    },
    controllers: {
      local: "nestjs/controllers.md",
      url: "https://docs.nestjs.com/controllers",
    },
    providers: {
      local: "nestjs/providers.md",
      url: "https://docs.nestjs.com/providers",
    },
    guards: {
      local: "nestjs/guards.md",
      url: "https://docs.nestjs.com/guards",
    },
    pipes: {
      local: "nestjs/pipes.md",
      url: "https://docs.nestjs.com/pipes",
    },
    interceptors: {
      local: "nestjs/interceptors.md",
      url: "https://docs.nestjs.com/interceptors",
    },
  },

  // fastify and hono were listed in BACKEND_TECHNOLOGIES with no record, so
  // every request for them errored: git mode found no KB directory and live
  // mode had no entry to read a url from. No KB content exists for either —
  // these entries make them live-only, which is how the index already treats
  // technologies the KB has not covered.
  fastify: {
    routes: {
      url: "https://fastify.dev/docs/latest/Reference/Routes/",
    },
    hooks: {
      url: "https://fastify.dev/docs/latest/Reference/Hooks/",
    },
    plugins: {
      url: "https://fastify.dev/docs/latest/Reference/Plugins/",
    },
    validation: {
      url: "https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/",
    },
    testing: {
      url: "https://fastify.dev/docs/latest/Guides/Testing/",
    },
  },

  hono: {
    routing: {
      url: "https://hono.dev/docs/api/routing",
    },
    context: {
      url: "https://hono.dev/docs/api/context",
    },
    middleware: {
      url: "https://hono.dev/docs/guides/middleware",
    },
    testing: {
      url: "https://hono.dev/docs/guides/testing",
    },
  },

  // Python frameworks
  fastapi: {
    basics: {
      local: "fastapi/basics.md",
      url: "https://fastapi.tiangolo.com/tutorial/",
    },
    database: {
      local: "fastapi/database.md",
      url: "https://fastapi.tiangolo.com/tutorial/sql-databases/",
    },
  },

  // django and flask: same ghost situation as fastify/hono above. The
  // /en/stable/ paths are live aliases, so they track releases.
  django: {
    routing: {
      url: "https://docs.djangoproject.com/en/stable/topics/http/urls/",
    },
    models: {
      url: "https://docs.djangoproject.com/en/stable/topics/db/models/",
    },
    templates: {
      url: "https://docs.djangoproject.com/en/stable/topics/templates/",
    },
    testing: {
      url: "https://docs.djangoproject.com/en/stable/topics/testing/",
    },
    deployment: {
      url: "https://docs.djangoproject.com/en/stable/howto/deployment/",
    },
  },

  // Flask has no dedicated routing page — routing, url_for and request
  // handling all live in Quickstart, so that is the topic key.
  flask: {
    quickstart: {
      url: "https://flask.palletsprojects.com/en/stable/quickstart/",
    },
    blueprints: {
      url: "https://flask.palletsprojects.com/en/stable/blueprints/",
    },
    templates: {
      url: "https://flask.palletsprojects.com/en/stable/templating/",
    },
    testing: {
      url: "https://flask.palletsprojects.com/en/stable/testing/",
    },
    deploying: {
      url: "https://flask.palletsprojects.com/en/stable/deploying/",
    },
  },

  // Spring Boot ecosystem
  "spring-boot": {
    basics: {
      local: "spring-boot/basics.md",
      url: "https://spring.io/guides/gs/spring-boot",
    },
    security: {
      local: "spring-boot/security.md",
      url: "https://spring.io/guides/gs/securing-web",
    },
    web: {
      local: "spring-boot/web.md",
      url: "https://docs.spring.io/spring-framework/reference/web.html",
    },
    profiles: {
      local: "spring-boot/profiles.md",
      url: "https://docs.spring.io/spring-boot/reference/features/profiles.html",
    },
    actuator: {
      local: "spring-boot/actuator.md",
      url: "https://docs.spring.io/spring-boot/reference/actuator/",
    },
    cache: {
      local: "spring-boot/cache.md",
      url: "https://docs.spring.io/spring-boot/reference/io/caching.html",
    },
    scheduling: {
      local: "spring-boot/scheduling.md",
      url: "https://docs.spring.io/spring-framework/reference/integration/scheduling.html",
    },
    events: {
      local: "spring-boot/events.md",
      url: "https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events",
    },
    aop: {
      local: "spring-boot/aop.md",
      url: "https://docs.spring.io/spring-framework/reference/core/aop.html",
    },
    webflux: {
      local: "spring-boot/webflux.md",
      url: "https://docs.spring.io/spring-framework/reference/web/webflux.html",
    },
    batch: {
      local: "spring-boot/batch.md",
      url: "https://docs.spring.io/spring-batch/reference/",
    },
    mail: {
      local: "spring-boot/mail.md",
      url: "https://docs.spring.io/spring-framework/reference/integration/email.html",
    },
    r2dbc: {
      local: "spring-boot/r2dbc.md",
      url: "https://docs.spring.io/spring-data/r2dbc/reference/",
    },
    websocket: {
      local: "spring-boot/websocket.md",
      url: "https://docs.spring.io/spring-framework/reference/web/websocket.html",
    },
    cloud: {
      local: "spring-boot/cloud.md",
      url: "https://spring.io/projects/spring-cloud",
    },
    integration: {
      local: "spring-boot/integration.md",
      url: "https://docs.spring.io/spring-integration/reference/",
    },
    modulith: {
      local: "spring-boot/modulith.md",
      url: "https://docs.spring.io/spring-modulith/reference/",
    },
  },

  "spring-data-jpa": {
    basics: {
      local: "spring-data-jpa/basics.md",
      url: "https://docs.spring.io/spring-data/jpa/reference/",
    },
  },

  "spring-security": {
    basics: {
      local: "spring-security/basics.md",
      url: "https://docs.spring.io/spring-security/reference/",
    },
  },

  "spring-validation": {
    basics: {
      local: "spring-validation/basics.md",
      url: "https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html",
    },
  },

  mapstruct: {
    basics: {
      local: "mapstruct/basics.md",
      url: "https://mapstruct.org/documentation/stable/reference/html/",
    },
    cheatsheet: {
      local: "mapstruct/quick-ref/cheatsheet.md",
      url: "https://mapstruct.org/documentation/stable/reference/html/",
    },
    "advanced-patterns": {
      local: "mapstruct/deep-docs/advanced-patterns.md",
      url: "https://mapstruct.org/documentation/stable/reference/html/#_advanced_mapping_options",
    },
    "spring-boot-integration": {
      local: "mapstruct/deep-docs/spring-boot-integration.md",
      url: "https://mapstruct.org/documentation/stable/reference/html/#using-dependency-injection",
    },
  },

  thymeleaf: {
    "email-templates": {
      local: "thymeleaf/deep-docs/email-templates.md",
      url: "https://www.thymeleaf.org/doc/articles/springmail.html",
    },
  },

  "apache-poi": {
    "excel-export-service": {
      local: "apache-poi/deep-docs/excel-export-service.md",
      url: "https://poi.apache.org/components/spreadsheet/quick-guide.html",
    },
  },

  lombok: {
    basics: {
      local: "lombok/basics.md",
      url: "https://projectlombok.org/features/",
    },
  },

  flyway: {
    basics: {
      local: "flyway/basics.md",
      url: "https://documentation.red-gate.com/fd",
    },
  },

  springdoc: {
    basics: {
      local: "springdoc/basics.md",
      url: "https://springdoc.org/",
    },
  },

  // Spring Cloud
  "spring-kafka": {
    basics: {
      local: "spring-kafka/basics.md",
      url: "https://docs.spring.io/spring-kafka/reference/",
    },
    producer: {
      local: "spring-kafka/producer.md",
      url: "https://docs.spring.io/spring-kafka/reference/kafka/sending-messages.html",
    },
    consumer: {
      local: "spring-kafka/consumer.md",
      url: "https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages.html",
    },
    "error-handling": {
      local: "spring-kafka/error-handling.md",
      url: "https://docs.spring.io/spring-kafka/reference/kafka/annotation-error-handling.html",
    },
  },

  "spring-amqp": {
    basics: {
      local: "spring-amqp/basics.md",
      url: "https://docs.spring.io/spring-amqp/reference/",
    },
    producer: {
      local: "spring-amqp/producer.md",
      url: "https://docs.spring.io/spring-amqp/reference/amqp/sending-messages.html",
    },
    consumer: {
      local: "spring-amqp/consumer.md",
      url: "https://docs.spring.io/spring-amqp/reference/amqp/receiving-messages.html",
    },
    exchanges: {
      local: "spring-amqp/exchanges.md",
      url: "https://docs.spring.io/spring-amqp/reference/amqp/broker-configuration.html",
    },
  },

  "spring-cloud-gateway": {
    basics: {
      local: "spring-cloud-gateway/basics.md",
      url: "https://docs.spring.io/spring-cloud-gateway/reference/",
    },
    routes: {
      local: "spring-cloud-gateway/routes.md",
      url: "https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway/configuring-route-predicate-factories-and-filter-factories.html",
    },
    filters: {
      local: "spring-cloud-gateway/filters.md",
      url: "https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway/gatewayfilter-factories.html",
    },
  },

  "spring-cloud-config": {
    basics: {
      local: "spring-cloud-config/basics.md",
      url: "https://docs.spring.io/spring-cloud-config/reference/",
    },
    server: {
      local: "spring-cloud-config/server.md",
      url: "https://docs.spring.io/spring-cloud-config/reference/server.html",
    },
    client: {
      local: "spring-cloud-config/client.md",
      url: "https://docs.spring.io/spring-cloud-config/reference/client.html",
    },
  },

  "spring-cloud-eureka": {
    basics: {
      local: "spring-cloud-eureka/basics.md",
      url: "https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html",
    },
    server: {
      local: "spring-cloud-eureka/server.md",
      url: "https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html#spring-cloud-eureka-server",
    },
    client: {
      local: "spring-cloud-eureka/client.md",
      url: "https://docs.spring.io/spring-cloud-netflix/reference/spring-cloud-netflix.html#service-discovery-eureka-clients",
    },
  },

  "spring-cloud-openfeign": {
    basics: {
      local: "spring-cloud-openfeign/basics.md",
      url: "https://docs.spring.io/spring-cloud-openfeign/reference/",
    },
    configuration: {
      local: "spring-cloud-openfeign/configuration.md",
      url: "https://docs.spring.io/spring-cloud-openfeign/reference/spring-cloud-openfeign.html#spring-cloud-feign-overriding-defaults",
    },
    "error-handling": {
      local: "spring-cloud-openfeign/error-handling.md",
      url: "https://docs.spring.io/spring-cloud-openfeign/reference/spring-cloud-openfeign.html#spring-cloud-feign-circuitbreaker-fallback",
    },
  },

  "spring-cloud-circuitbreaker": {
    basics: {
      local: "spring-cloud-circuitbreaker/basics.md",
      url: "https://docs.spring.io/spring-cloud-circuitbreaker/reference/",
    },
    resilience4j: {
      local: "spring-cloud-circuitbreaker/resilience4j.md",
      url: "https://resilience4j.readme.io/docs/getting-started-3",
    },
    patterns: {
      local: "spring-cloud-circuitbreaker/patterns.md",
      url: "https://resilience4j.readme.io/docs/circuitbreaker",
    },
  },

  "spring-cloud-function": {
    basics: {
      local: "spring-cloud-function/basics.md",
      url: "https://docs.spring.io/spring-cloud-function/reference/",
    },
    aws: {
      local: "spring-cloud-function/aws.md",
      url: "https://docs.spring.io/spring-cloud-function/reference/adapters/aws-intro.html",
    },
    azure: {
      local: "spring-cloud-function/azure.md",
      url: "https://docs.spring.io/spring-cloud-function/reference/adapters/azure-intro.html",
    },
  },

  // Spring Web
  "spring-graphql": {
    basics: {
      local: "spring-graphql/basics.md",
      url: "https://docs.spring.io/spring-graphql/reference/",
    },
    controllers: {
      local: "spring-graphql/controllers.md",
      url: "https://docs.spring.io/spring-graphql/reference/controllers.html",
    },
    "data-fetching": {
      local: "spring-graphql/data-fetching.md",
      url: "https://docs.spring.io/spring-graphql/reference/request-execution.html",
    },
  },

  "spring-hateoas": {
    basics: {
      local: "spring-hateoas/basics.md",
      url: "https://docs.spring.io/spring-hateoas/docs/current/reference/html/",
    },
    links: {
      local: "spring-hateoas/links.md",
      url: "https://docs.spring.io/spring-hateoas/docs/current/reference/html/#fundamentals.links",
    },
    models: {
      local: "spring-hateoas/models.md",
      url: "https://docs.spring.io/spring-hateoas/docs/current/reference/html/#fundamentals.representation-models",
    },
  },

  // Spring Enterprise
  "spring-session": {
    basics: {
      local: "spring-session/basics.md",
      url: "https://docs.spring.io/spring-session/reference/",
    },
    redis: {
      local: "spring-session/redis.md",
      url: "https://docs.spring.io/spring-session/reference/guides/boot-redis.html",
    },
    jdbc: {
      local: "spring-session/jdbc.md",
      url: "https://docs.spring.io/spring-session/reference/guides/boot-jdbc.html",
    },
  },

  "spring-retry": {
    basics: {
      local: "spring-retry/basics.md",
      url: "https://docs.spring.io/spring-retry/reference/",
    },
    annotations: {
      local: "spring-retry/annotations.md",
      url: "https://docs.spring.io/spring-retry/reference/api/retryoperations.html",
    },
    policies: {
      local: "spring-retry/policies.md",
      url: "https://docs.spring.io/spring-retry/reference/api/retrypolicy.html",
    },
  },

  "spring-ai": {
    basics: {
      local: "spring-ai/basics.md",
      url: "https://docs.spring.io/spring-ai/reference/",
    },
    chat: {
      local: "spring-ai/chat.md",
      url: "https://docs.spring.io/spring-ai/reference/api/chatclient.html",
    },
    embeddings: {
      local: "spring-ai/embeddings.md",
      url: "https://docs.spring.io/spring-ai/reference/api/embeddings.html",
    },
    rag: {
      local: "spring-ai/rag.md",
      url: "https://docs.spring.io/spring-ai/reference/api/vectordbs.html",
    },
  },

  "spring-ldap": {
    basics: {
      local: "spring-ldap/basics.md",
      url: "https://docs.spring.io/spring-ldap/reference/",
    },
    operations: {
      local: "spring-ldap/operations.md",
      url: "https://docs.spring.io/spring-ldap/reference/basic.html",
    },
    security: {
      local: "spring-ldap/security.md",
      url: "https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/ldap.html",
    },
  },

  "spring-shell": {
    basics: {
      local: "spring-shell/basics.md",
      url: "https://docs.spring.io/spring-shell/reference/",
    },
    commands: {
      local: "spring-shell/commands.md",
      url: "https://docs.spring.io/spring-shell/reference/commands.html",
    },
    components: {
      local: "spring-shell/components.md",
      url: "https://docs.spring.io/spring-shell/reference/components.html",
    },
  },

  "spring-statemachine": {
    basics: {
      local: "spring-statemachine/basics.md",
      url: "https://docs.spring.io/spring-statemachine/docs/current/reference/",
    },
    configuration: {
      local: "spring-statemachine/configuration.md",
      url: "https://docs.spring.io/spring-statemachine/docs/current/reference/#statemachine-config",
    },
    persistence: {
      local: "spring-statemachine/persistence.md",
      url: "https://docs.spring.io/spring-statemachine/docs/current/reference/#sm-persist",
    },
  },

  "spring-authorization-server": {
    basics: {
      local: "spring-authorization-server/basics.md",
      url: "https://docs.spring.io/spring-authorization-server/reference/",
    },
    configuration: {
      local: "spring-authorization-server/configuration.md",
      url: "https://docs.spring.io/spring-authorization-server/reference/getting-started.html",
    },
    "token-customization": {
      local: "spring-authorization-server/token-customization.md",
      url: "https://docs.spring.io/spring-authorization-server/reference/guides/how-to-custom-claims-authorities.html",
    },
  },

  // Spring Observability
  "micrometer-tracing": {
    basics: {
      local: "micrometer-tracing/basics.md",
      url: "https://micrometer.io/docs/tracing",
    },
    configuration: {
      local: "micrometer-tracing/configuration.md",
      url: "https://docs.spring.io/spring-boot/reference/actuator/tracing.html",
    },
    exporters: {
      local: "micrometer-tracing/exporters.md",
      url: "https://micrometer.io/docs/tracing#_supported_tracers",
    },
  },

  // Rust frameworks
  "actix-web": {
    routing: {
      url: "https://actix.rs/docs/url-dispatch",
    },
    extractors: {
      url: "https://actix.rs/docs/extractors",
    },
    middleware: {
      url: "https://actix.rs/docs/middleware",
    },
    state: {
      url: "https://actix.rs/docs/application#state",
    },
  },

  axum: {
    routing: {
      url: "https://docs.rs/axum/latest/axum/#routing",
    },
    handlers: {
      url: "https://docs.rs/axum/latest/axum/#handlers",
    },
    extractors: {
      url: "https://docs.rs/axum/latest/axum/#extractors",
    },
    state: {
      url: "https://docs.rs/axum/latest/axum/#sharing-state-with-handlers",
    },
  },

  rocket: {
    routing: {
      url: "https://rocket.rs/guide/v0.5/requests/",
    },
    guards: {
      url: "https://rocket.rs/guide/v0.5/requests/#request-guards",
    },
    fairings: {
      url: "https://rocket.rs/guide/v0.5/fairings/",
    },
    state: {
      url: "https://rocket.rs/guide/v0.5/state/",
    },
  },

  warp: {
    filters: {
      url: "https://docs.rs/warp/latest/warp/filters/",
    },
    routing: {
      url: "https://docs.rs/warp/latest/warp/#routing",
    },
    rejections: {
      url: "https://docs.rs/warp/latest/warp/reject/",
    },
  },

  // Go frameworks
  gin: {
    routing: {
      url: "https://gin-gonic.com/en/docs/",
    },
    middleware: {
      url: "https://gin-gonic.com/en/docs/middleware/using-middleware/",
    },
    binding: {
      url: "https://gin-gonic.com/en/docs/",
    },
  },

  fiber: {
    routing: {
      url: "https://docs.gofiber.io/guide/routing",
    },
    middleware: {
      url: "https://docs.gofiber.io/category/-middleware",
    },
    context: {
      url: "https://docs.gofiber.io/api/ctx",
    },
  },

  echo: {
    routing: {
      url: "https://echo.labstack.com/docs/routing",
    },
    middleware: {
      url: "https://echo.labstack.com/docs/category/middleware",
    },
    binding: {
      url: "https://echo.labstack.com/docs/binding",
    },
  },

  chi: {
    routing: {
      url: "https://go-chi.io/#/README",
    },
    middleware: {
      url: "https://go-chi.io/#/README?id=middleware",
    },
    patterns: {
      url: "https://go-chi.io/#/README?id=sub-routers",
    },
  },

  // Deno frameworks
  fresh: {
    islands: {
      url: "https://fresh.deno.dev/docs/concepts/islands",
    },
    routes: {
      url: "https://fresh.deno.dev/docs/concepts/routing",
    },
    handlers: {
      url: "https://fresh.deno.dev/docs/concepts/routing",
    },
    signals: {
      url: "https://fresh.deno.dev/docs/concepts/islands",
    },
  },

  oak: {
    routing: {
      url: "https://oakserver.github.io/oak/",
    },
    middleware: {
      url: "https://oakserver.github.io/oak/",
    },
    context: {
      url: "https://oakserver.github.io/oak/",
    },
  },

  // .NET/C#
  "aspnet-core": {
    controllers: {
      local: "aspnet-core/controllers.md",
      url: "https://learn.microsoft.com/aspnet/core/web-api/",
    },
    di: {
      local: "aspnet-core/di.md",
      url: "https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection",
    },
    middleware: {
      local: "aspnet-core/middleware.md",
      url: "https://learn.microsoft.com/aspnet/core/fundamentals/middleware/",
    },
    configuration: {
      local: "aspnet-core/configuration.md",
      url: "https://learn.microsoft.com/aspnet/core/fundamentals/configuration/",
    },
    "minimal-api": {
      local: "aspnet-core/minimal-api.md",
      url: "https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/overview",
    },
    security: {
      local: "aspnet-core/security.md",
      url: "https://learn.microsoft.com/aspnet/core/security/",
    },
    identity: {
      local: "aspnet-core/identity.md",
      url: "https://learn.microsoft.com/aspnet/core/security/authentication/identity",
    },
  },

  "entity-framework-core": {
    dbcontext: {
      local: "entity-framework-core/dbcontext.md",
      url: "https://learn.microsoft.com/ef/core/dbcontext-configuration/",
    },
    migrations: {
      local: "entity-framework-core/migrations.md",
      url: "https://learn.microsoft.com/ef/core/managing-schemas/migrations/",
    },
    queries: {
      local: "entity-framework-core/queries.md",
      url: "https://learn.microsoft.com/ef/core/querying/",
    },
    relationships: {
      local: "entity-framework-core/relationships.md",
      url: "https://learn.microsoft.com/ef/core/modeling/relationships/",
    },
    performance: {
      local: "entity-framework-core/performance.md",
      url: "https://learn.microsoft.com/ef/core/performance/",
    },
  },

  signalr: {
    hubs: {
      local: "signalr/hubs.md",
      url: "https://learn.microsoft.com/aspnet/core/signalr/hubs",
    },
    clients: {
      local: "signalr/clients.md",
      url: "https://learn.microsoft.com/aspnet/core/signalr/javascript-client",
    },
    streaming: {
      local: "signalr/streaming.md",
      url: "https://learn.microsoft.com/aspnet/core/signalr/streaming",
    },
  },

  blazor: {
    components: {
      local: "blazor/components.md",
      url: "https://learn.microsoft.com/aspnet/core/blazor/components/",
    },
    interop: {
      local: "blazor/interop.md",
      url: "https://learn.microsoft.com/aspnet/core/blazor/javascript-interoperability/",
    },
    "render-modes": {
      local: "blazor/render-modes.md",
      url: "https://learn.microsoft.com/aspnet/core/blazor/components/render-modes",
    },
  },
};
