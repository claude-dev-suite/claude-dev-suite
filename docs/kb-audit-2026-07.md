# Knowledge Base Audit — 2026-07-16

Audit of the `documentation` MCP server's `docs-index` against the live knowledge_base
repo. Server default is **git-mode** (`KB_REPO_URL` → the KB repo).

## Summary

- Indexed (technology, topic) pairs: **1168**
- KB markdown files: **1382**
- Dead upstream URLs: **78** (10 fully-broken → FIXED §2; 68 source-link-only, KB-backed after fix #1)
- Index entries whose `local` KB file is missing: **174** (152 dir absent, 22 file renamed)
- Orphan KB files (authored but unindexed): **390**
- KB directories with no index entry at all: **24**
- Stale version manifests: **5** (see §5)

## 1. FIXED — git-mode now resolves paths from `local` ✅

Root cause: `fetch_docs`/`list_topics` rebuilt the KB path from the `{technology}/{topic}`
record keys, ignoring the index `local` field, so KB content stored elsewhere (e.g.
`bitcoin-consensus` → `bitcoin/protocol/consensus/overview.md`) was unreachable and
silently degraded to live HTML scraping.

Fix: new `src/kb-path.ts` (`resolveKbCoords`/`resolveKbDir`, traversal-guarded) derives the
KB directory + file from `local`, falling back to the key-derived path when absent.
Git-mode reachability rises from **468 → ~994 pairs (40% → 85%)**. Tests: `tests/kb-path.test.ts`.

## 2. Dead upstream URLs — FULLY-BROKEN — FIXED ✅

These 10 entries (Case-B techs with no KB content) had neither a valid `local`
file nor a live URL. All repointed to web-verified (HTTP 200) current pages:

| pair(s) | old URL | new URL |
|---|---|---|
| jwt:security, cryptography:signing | `…/JSON_Web_Token_for_Java_Cheat_Sheet.html` | `…/JSON_Web_Token_Cheat_Sheet.html` |
| echo:middleware | `echo.labstack.com/docs/middleware` | `echo.labstack.com/docs/category/middleware` |
| fresh:routes | `fresh.deno.dev/docs/concepts/routes` | `…/concepts/routing` |
| fresh:handlers | `…/concepts/handlers` | `…/concepts/routing` |
| fresh:signals | `…/concepts/state-management` | `…/concepts/islands` |
| gin:routing | `gin-gonic.com/docs/examples/` | `gin-gonic.com/en/docs/` |
| gin:binding | `…/examples/binding-and-validation/` | `gin-gonic.com/en/docs/` (examples index removed) |
| gin:middleware | `…/examples/custom-middleware/` | `…/en/docs/middleware/using-middleware/` |
| nx:executors | `nx.dev/extending-nx/recipes/local-executors` | `nx.dev/docs/extending-nx/local-executors` |
| nx:generators | `…/recipes/local-generators` | `nx.dev/docs/extending-nx/local-generators` |

> `logback:{appenders,configuration,layouts}` first probed as dead (000) but are
> alive on re-check (host throttled the parallel burst) — no change needed.
> `gin:{routing,binding}` land on the docs home because the old per-example pages
> were removed; ideal long-term fix is authoring KB content for these Case-B techs.

## 2b. Dead upstream URLs — source-link-only (KB serves content after fix #1)

These 68 URLs are dead but the topic is now served from the KB (git-mode); the URL is only a reference link to refresh.

- `https://bitcoinops.org/en/topics/pinning-attacks/` → lightning-pinning-attacks:overview
- `https://docs.arize.com/arize/machine-learning/machine-learning/how-arize-works/embeddings` → drift-detection:overview, drift-detection:metrics-guide, drift-detection:alerting
- `https://docs.atomicals.xyz/` → bitcoin-metaprotocols-atomicals:overview
- `https://docs.llamaindex.ai/en/stable/optimizing/advanced_retrieval/` → rag-patterns:advanced-patterns
- `https://docs.nvidia.com/video-technologies/video-codec-sdk/nvenc-video-encoder-api-prog-guide/` → indirect-display:nvenc
- `https://docs.pmnd.rs/zustand/getting-started/introduction` → zustand:basics
- `https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway/configuring-route-predicate-factories-and-filter-factories.html` → spring-cloud-gateway:routes
- `https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway/gatewayfilter-factories.html` → spring-cloud-gateway:filters
- `https://docs.spring.io/spring-data/elasticsearch/reference/elasticsearch/repositories.html` → spring-data-elasticsearch:repositories
- `https://docs.spring.io/spring-data/jdbc/reference/` → spring-data-jdbc:basics
- `https://docs.spring.io/spring-data/jdbc/reference/jdbc/domain-driven-design.html` → spring-data-jdbc:aggregates
- `https://docs.spring.io/spring-data/jdbc/reference/jdbc/entity-callbacks.html` → spring-data-jdbc:events
- `https://docs.spring.io/spring-data/jdbc/reference/jdbc/query-methods.html` → spring-data-jdbc:repositories
- `https://docs.spring.io/spring-data/jdbc/reference/jdbc/query-methods.html#jdbc.query-methods.at-query` → spring-data-jdbc:queries
- `https://docs.spring.io/spring-data/neo4j/reference/repositories/custom-queries.html` → spring-data-neo4j:cypher
- `https://docs.spring.io/spring-data/r2dbc/reference/` → spring-boot:r2dbc
- `https://docs.spring.io/spring-data/redis/reference/redis/redis-repositories.html` → spring-data-redis:repositories
- `https://docs.spring.io/spring-data/redis/reference/redis/support.html#redis:support:cache-abstraction` → spring-data-redis:cache
- `https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html` → spring-boot-test:mockmvc
- `https://docs.spring.io/spring-ldap/reference/basic.html` → spring-ldap:operations
- `https://docs.spring.io/spring-retry/reference/` → spring-retry:basics
- `https://docs.spring.io/spring-retry/reference/api/retryoperations.html` → spring-retry:annotations
- `https://docs.spring.io/spring-retry/reference/api/retrypolicy.html` → spring-retry:policies
- `https://docs.spring.io/spring-shell/reference/commands.html` → spring-shell:commands
- `https://docs.spring.io/spring-shell/reference/components.html` → spring-shell:components
- `https://docs.trychroma.com/getting-started` → vector-databases:chromadb
- `https://docs.trychroma.com/production/administration/migration` → chromadb-advanced:deployment
- `https://docs.unity3d.com/Manual/SecondaryTextures.html` → unity-2d-lighting:normal-mapped-sprites
- `https://docs.unity3d.com/Manual/SortingGroup.html` → unity-2d-core:sorting-layers-and-groups
- `https://docs.unity3d.com/Packages/com.unity.2d.animation@latest/manual/SkinningEditor.html` → unity-2d-animation:skeletal-2d-animation
- `https://docs.unity3d.com/Packages/com.unity.2d.animation@latest/manual/SpriteLibrary.html` → unity-2d-animation:sprite-library-and-resolver
- `https://docs.unity3d.com/Packages/com.unity.2d.tilemap.extras@latest/manual/RuleTile.html` → unity-2d-tilemap:rule-tiles
- `https://docs.unity3d.com/Packages/com.unity.cinemachine@latest/manual/CinemachineConfiner2D.html` → unity-2d-cameras:confiner-2d
- `https://docs.unity3d.com/Packages/com.unity.cinemachine@latest/manual/CinemachinePositionComposer.html` → unity-2d-cameras:cinemachine-2d-position-composer
- `https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DLightBlendStyles.html` → unity-2d-lighting:2d-lights-and-blend-styles
- `https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DLightProperties.html` → unity-2d-lighting:overview
- `https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DShadows.html` → unity-2d-lighting:shadow-casters-2d
- `https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2d-lighting.html` → gamedev-2d-art-lighting-art:overview
- `https://en.bitcoin.it/wiki/Stealth_address` → bitcoin-privacy-stealth:overview
- `https://github.com/langchain-ai/langchain/tree/master/templates` → domain-templates:overview, domain-templates:customer-support, domain-templates:legal-medical-financial
- `https://github.com/microsoft/Windows-driver-samples/tree/main/general/IndirectDisplay` → indirect-display:idd-sample
- `https://lancedb.github.io/lancedb/guides/storage/` → lancedb:deployment
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/wdfkd-debugger-extensions` → driver-debugging:wdfkd-extension
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/using-sal-annotations-to-reduce-c-cpp-code-defects` → wdf-kmdf:sal
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/display/edid-extension-blocks` → indirect-display:edid
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/getting-hid-reports` → hid-input-filter:report-descriptor
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/hid-class-driver` → hid-input-filter:hid-class-driver
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/architecture-of-umdf-version-2` → wdf-umdf:reflector
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/filter-drivers` → hid-input-filter:filter-drivers
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/how-to-enable-debugging-of-a-umdf-driver` → wdf-umdf:debugging
- `https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/using-the-framework-based-on-the-driver-type` → wdf-kmdf:overview
- `https://learn.unity.com/tutorial/2d-platformer-character-controller` → unity-2d-gameplay:overview, unity-2d-gameplay:coyote-time-and-jump-buffer, unity-2d-gameplay:dash-and-wall-jump
- `https://lightning.engineering/posts/2024-04-25-lit/` → lightning-loop-pool-lit:overview
- `https://micrometer.io/docs/tracing` → micrometer-tracing:basics
- `https://micrometer.io/docs/tracing#_supported_tracers` → micrometer-tracing:exporters
- `https://murch.one/wp-content/uploads/2024/07/erhardt2016coinselection.pdf` → bitcoin-coin-selection:overview
- `https://neo4j.com/blog/knowledge-graph-llm-fundamentals/` → knowledge-graph-construction:overview, knowledge-graph-construction:extraction-pipeline, knowledge-graph-construction:incremental-updates
- `https://r2r-docs.sciphi.ai/` → r2r:overview, r2r:getting-started, r2r:advanced
- `https://reactrouter.com/en/main` → react:router
- `https://www.boristhebrave.com/2021/05/14/wang-tiles-and-truchet-tiles-explained/` → gamedev-2d-art-tile-design:overview
- `https://www.freertos.org/implementation/a00004.html` → embedded-rtos:real-time-scheduling
- `https://www.lopp.net/lightning-wallet-comparison.html` → lightning-consumer-wallets:overview
- `https://www.pinecone.io/learn/production-rag/` → rag-production:overview, rag-production:indexing, rag-production:scaling
- `https://www.sbert.net/examples/training/cross-encoder/README.html` → cross-encoder-training:overview, cross-encoder-training:training-guide, cross-encoder-training:evaluation
- `https://www.skeleton.dev/components` → skeleton:components
- `https://www.spritelamp.com/` → gamedev-2d-art-seamless-textures:overview
- `https://www.unchained.com/multisig` → bitcoin-hardware-multi-vendor-multisig:overview
- `https://xunit.net/docs/assertions` → xunit:assertions

## 3. Index entries whose `local` KB file does not exist

### 3a. KB directory absent (152) — needs KB content, or repoint/remove the index entry

- **actix-web**: actix-web:routing, actix-web:extractors, actix-web:middleware, actix-web:state
- **axum**: axum:routing, axum:handlers, axum:extractors, axum:state
- **bun**: bun:basics, bun:runtime, bun:bundler, bun:test-runner, bun:sqlite
- **caddy**: caddy:caddyfile, caddy:automatic-https
- **chi**: chi:routing, chi:middleware, chi:patterns
- **class-validator**: class-validator:basics, class-validator:decorators, class-validator:custom-validation
- **clean-code**: clean-code:principles, clean-code:refactoring
- **cypress**: cypress:commands, cypress:patterns
- **deno**: deno:basics, deno:permissions, deno:std, deno:deploy, deno:kv
- **docker-compose**: docker-compose:services, docker-compose:commands
- **drizzle**: drizzle:schema, drizzle:queries
- **echo**: echo:routing, echo:middleware, echo:binding
- **elasticsearch**: elasticsearch:basics, elasticsearch:queries, elasticsearch:aggregations, elasticsearch:mapping, elasticsearch:nodejs-client
- **email**: email-infrastructure:dns-email-auth
- **esbuild**: esbuild:basics, esbuild:api, esbuild:plugins
- **fiber**: fiber:routing, fiber:middleware, fiber:context
- **fresh**: fresh:islands, fresh:routes, fresh:handlers, fresh:signals
- **gin**: gin:routing, gin:middleware, gin:binding
- **git-workflow**: git-workflow:commands, git-workflow:branching
- **go**: go:basics, go:concurrency, go:interfaces, go:modules, go:testing
- **graphql**: graphql:schema, graphql:resolvers
- **javascript**: javascript:modules, javascript:es6-features, javascript:async, javascript:esm-vs-cjs
- **jwt**: jwt:implementation, jwt:security
- **load-balancer**: load-balancer:haproxy
- **log4j2**: log4j2:configuration, log4j2:async, log4j2:appenders
- **logback**: logback:configuration, logback:appenders, logback:layouts
- **nextauth**: nextauth:setup, nextauth:callbacks
- **nx**: nx:basics, nx:configuration, nx:generators, nx:executors, nx:affected
- **oak**: oak:routing, oak:middleware, oak:context
- **oauth2**: oauth2:flows, oauth2:providers
- **openapi**: openapi:specification, openapi:tools
- **opentelemetry**: opentelemetry:basics, opentelemetry:nodejs-sdk, opentelemetry:java-sdk, opentelemetry:tracing, opentelemetry:metrics, opentelemetry:collector
- **performance**: performance:frontend, performance:backend
- **pino**: pino:basics, pino:transports, pino:child-loggers, pino:redact
- **pnpm**: pnpm:basics, pnpm:workspaces, pnpm:configuration, pnpm:filtering
- **redux-toolkit**: redux-toolkit:slices, redux-toolkit:rtk-query
- **rest-api**: rest-api:conventions, rest-api:error-handling
- **rocket**: rocket:routing, rocket:guards, rocket:fairings, rocket:state
- **rust**: rust:ownership, rust:async, rust:error-handling, rust:traits, rust:cargo
- **slf4j**: slf4j:basics, slf4j:mdc
- **structlog**: structlog:basics, structlog:processors, structlog:configuration
- **traefik**: traefik:docker-provider, traefik:middlewares
- **trpc**: trpc:routers, trpc:client
- **turborepo**: turborepo:basics, turborepo:configuration, turborepo:caching, turborepo:remote-cache
- **typeorm**: typeorm:entities, typeorm:queries
- **waf**: waf:modsecurity-crs, waf:cloudflare-waf
- **warp**: warp:filters, warp:routing, warp:rejections
- **webpack**: webpack:basics, webpack:configuration, webpack:loaders, webpack:plugins, webpack:optimization
- **winston**: winston:basics, winston:transports, winston:formats
- **yup**: yup:basics, yup:schemas, yup:validation

### 3b. File renamed in KB (22) — easy repoint of the index `local`/topic

- `tailwind/spacing.md` (tailwindcss:spacing) — dir has: customization.md, responsive.md, utilities.md
- `pinia/composables.md` (pinia:composables) — dir has: stores.md
- `nextjs/server-components.md` (nextjs:server-components) — dir has: app-router.md, caching.md, data-fetching.md, routing.md, server-actions.md
- `mongodb/queries.md` (mongodb:queries) — dir has: production.md
- `mongodb/indexes.md` (mongodb:indexes) — dir has: production.md
- `mongodb/aggregation.md` (mongodb:aggregation) — dir has: production.md
- `mysql/queries.md` (mysql:queries) — dir has: production.md
- `mysql/indexes.md` (mysql:indexes) — dir has: production.md
- `redis/commands.md` (redis:commands) — dir has: production.md
- `redis/patterns.md` (redis:patterns) — dir has: production.md
- `github-actions/actions.md` (github-actions:actions) — dir has: ci-cd-patterns.md, workflows.md
- `linux/performance-tuning.md` (server-performance:linux-performance-tuning) — dir has: initial-server-setup.md, ssh-hardening.md, systemd-complete-guide.md
- `linux/server-hardening.md` (server-hardening:cis-benchmark) — dir has: initial-server-setup.md, ssh-hardening.md, systemd-complete-guide.md
- `vite/basics.md` (vite:basics) — dir has: (subdirs only)
- `vite/config.md` (vite:config) — dir has: (subdirs only)
- `vite/env-variables.md` (vite:env-variables) — dir has: (subdirs only)
- `vite/build.md` (vite:build) — dir has: (subdirs only)
- `vite/plugins.md` (vite:plugins) — dir has: (subdirs only)
- `zod/basics.md` (zod:basics) — dir has: (subdirs only)
- `zod/schemas.md` (zod:schemas) — dir has: (subdirs only)
- `zod/validation.md` (zod:validation) — dir has: (subdirs only)
- `zod/transforms.md` (zod:transforms) — dir has: (subdirs only)

## 4. Orphan KB content (authored but not indexed → invisible to list_topics/fetch_docs)

390 orphan files. By directory:

- **bitcoin**: 300
- **gamedev**: 22
- **mcp-sdk**: 6
- **python**: 6
- **anthropic**: 5
- **pydantic**: 4
- **ruff**: 4
- **streamlit**: 4
- **abb-freelance**: 3
- **dcs-platforms**: 3
- **iec61131**: 3
- **isa-standards**: 3
- **mapstruct**: 3
- **bulk-engineering**: 2
- **jacoco**: 2
- **junit**: 2
- **radix-ui**: 2
- **sql-fundamentals**: 2
- **vite**: 2
- **zod**: 2
- **apache-poi**: 1
- **migrations**: 1
- **oracle**: 1
- **plpgsql**: 1
- **plsql**: 1
- **rest-assured**: 1
- **sqlserver**: 1
- **svelte**: 1
- **thymeleaf**: 1
- **tsql**: 1

### 4b. KB directories with zero index entries (24)

abb-freelance, anthropic, apache-poi, bulk-engineering, dcs-platforms, iec61131, isa-standards, jacoco, junit, mcp-sdk, migrations, oracle, plpgsql, plsql, pydantic, python, radix-ui, rest-assured, ruff, sql-fundamentals, sqlserver, streamlit, thymeleaf, tsql

## 5. Stale version manifests (web-verified 2026-07-16)

| tech | manifest `latest` | current stable | action |
|---|---|---|---|
| nestjs | 10 | **11** (v12 ~Q3 2026, not GA) | latest→11, supported [10,11] |
| prisma | 5 | **7** (Nov 2025) | latest→7, supported [6,7], eol [5] |
| nextjs | 15 | **16** (16.2, LTS) | latest→16, supported [14,15,16] |
| spring-boot | 3 | **4** (4.1, Jun 2026) | latest→4, supported [3,4] |
| typescript | 5 | **6** (6.0, Mar 2026; 7 at RC) | latest→6, supported [5,6] |

Correct (no change): react 19, svelte 5, tailwind 4, tanstack-query 5, tauri 2, vue 3, zustand 5.

> Manifests live in the **knowledge_base repo** (external). Not pushed: the active `gh`
> account is `mariepellegrino89`, not `claude-dev-suite`. Push after switching accounts.