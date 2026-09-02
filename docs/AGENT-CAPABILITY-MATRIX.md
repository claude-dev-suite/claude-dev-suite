# Agent Capability Matrix

Which MCP servers and skills each agent declares.

> **Generated file — do not edit by hand.** Rendered from the `core_skills`,
> `extended_skills` and `mcp_servers` frontmatter of every `agents/**/*.md` by
> `scripts/gen-capability-matrix.mjs`. Change an agent, then re-run it.

Skills load in two tiers: **core** skills are installed with the agent, **extended**
skills stay reachable on demand through the `skill-loader` MCP server. Every skill
path below resolves to a real `skills/<path>/SKILL.md` — the generator fails otherwise.

Agents: **67** across **15** categories.

## Agents by category

### Core

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **accessibility-expert** | sonnet | `documentation` | `accessibility/wcag` | 4 on demand |
| **architect** | sonnet | `api-explorer`, `documentation` | `best-practices/clean-code`, `best-practices/solid-principles`, `best-practices/token-optimization` | 37 on demand |
| **claude-code-extension-expert** | sonnet | _none_ | `claude-code-authoring/skill-authoring` | 4 on demand |
| **code-reviewer** | sonnet | `code-quality`, `documentation` | `security/owasp-top-10` | 9 on demand |
| **dashboard-refactor-expert** | sonnet | `code-quality`, `documentation` | `frontend-frameworks/react` | 8 on demand |
| **documentation-expert** | haiku | `documentation` | `documentation/jsdoc-tsdoc` | 4 on demand |
| **log-analyst** | haiku | `documentation`, `log-analyzer` | `logging/java` | 3 on demand |
| **nodejs-expert** | sonnet | `documentation`, `log-analyzer`, `performance-profiler` | `languages/nodejs` | 29 on demand |
| **performance-expert** | sonnet | `documentation`, `performance-profiler` | `profiling/nodejs` | 11 on demand |
| **python-expert** | sonnet | `documentation` | `languages/python` | 11 on demand |
| **typescript-expert** | sonnet | `code-quality`, `documentation` | `languages/typescript` | 12 on demand |

### Frontend

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **angular-expert** | sonnet | `documentation` | `frontend-frameworks/angular` | 11 on demand |
| **creative-frontend-expert** | sonnet | `documentation` | `animation/framer-motion`, `animation/gsap`, `styling/advanced-css-effects` | 3 on demand |
| **electron-expert** | sonnet | `documentation` | `desktop/electron`, `languages/typescript`, `build-tools/vite` | 2 on demand |
| **nextjs-expert** | sonnet | `documentation` | `meta-frameworks/nextjs` | 20 on demand |
| **react-expert** | sonnet | `documentation` | `frontend-frameworks/react`, `frontend-frameworks/react-hooks`, `languages/typescript` | 32 on demand |
| **svelte-expert** | sonnet | `documentation` | `frontend-frameworks/svelte`, `meta-frameworks/sveltekit`, `languages/typescript` | 4 on demand |
| **tauri-expert** | sonnet | `documentation` | `desktop/tauri` | 5 on demand |
| **ux-expert** | sonnet | `documentation` | `ux/visual-hierarchy`, `ux/interaction-design`, `ux/design-systems` | 7 on demand |
| **vue-expert** | sonnet | `documentation` | `frontend-frameworks/vue` | 8 on demand |

### Backend

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **cpp-expert** | sonnet | `code-quality`, `documentation` | `languages/cpp` | 4 on demand |
| **deno-expert** | sonnet | `documentation` | `languages/deno` | 5 on demand |
| **dotnet-expert** | sonnet | `api-tester`, `documentation` | `backend-frameworks/aspnet-core` | 25 on demand |
| **fastapi-expert** | sonnet | `api-tester`, `documentation` | `backend-frameworks/fastapi` | 17 on demand |
| **go-expert** | sonnet | `documentation` | `languages/go` | 11 on demand |
| **nestjs-expert** | sonnet | `api-tester`, `documentation` | `backend-frameworks/nestjs` | 24 on demand |
| **rust-expert** | sonnet | `documentation` | `languages/rust` | 15 on demand |
| **spring-boot-expert** | sonnet | `api-tester`, `documentation` | `backend-frameworks/spring-boot` | 87 on demand |
| **streamlit-expert** | sonnet | `documentation` | `backend-frameworks/streamlit` | 6 on demand |
| **windows-driver-expert** | opus | `documentation` | `languages/cpp`, `windows/wdf-kmdf`, `windows/driver-debugging` | 7 on demand |

### Database

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **mongodb-expert** | sonnet | `documentation` | `databases/mongodb`, `databases/spring-data-mongodb`, `backend-frameworks/spring-boot` | 2 on demand |
| **prisma-expert** | sonnet | `documentation` | `orm-odm/prisma` | 3 on demand |
| **sql-expert** | sonnet | `database-query`, `documentation` | `databases/sql-fundamentals` | 11 on demand |

### Testing

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **playwright-expert** | sonnet | `documentation` | `testing/playwright` | 4 on demand |
| **python-integration-test-expert** | sonnet | `database-query`, `documentation` | `testing/python-integration` | 11 on demand |
| **smoke-test-expert** | sonnet | `api-tester`, `database-query`, `docker-manager`, `documentation`, `log-analyzer` | `testing/smoke-test` | 3 on demand |
| **spring-boot-integration-test-expert** | sonnet | `documentation` | `testing/spring-boot-integration`, `testing/testcontainers`, `testing/junit` | 14 on demand |
| **vitest-expert** | sonnet | `documentation` | `testing/vitest` | 4 on demand |

### Cloud

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **cloud-expert** | sonnet | `documentation` | `cloud/aws` | 16 on demand |

### Infrastructure

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **devops-expert** | sonnet | `docker-manager`, `documentation` | `infrastructure/docker` | 26 on demand |
| **docker-expert** | haiku | `documentation` | `infrastructure/docker` | 4 on demand |
| **sysadmin-expert** | sonnet | `docker-manager`, `documentation` | `infrastructure/linux-server`, `infrastructure/nginx`, `infrastructure/systemd` | 55 on demand |

### Mobile

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **android-native-expert** | opus | `documentation` | `mobile/android-native` | 13 on demand |
| **ios-native-expert** | opus | `documentation` | `mobile/ios-native` | 8 on demand |
| **kmp-expert** | opus | `documentation` | `mobile/kotlin-multiplatform`, `languages/kotlin` | 19 on demand |
| **mobile-expert** | sonnet | `documentation` | `mobile/react-native` | 8 on demand |

### Data & AI

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **data-engineering-expert** | sonnet | `documentation` | `data-processing/pandas` | 5 on demand |
| **rag-expert** | sonnet | `documentation` | `rag/rag-architecture`, `rag/chunking-strategies`, `languages/python` | 94 on demand |

### Security

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **security-expert** | sonnet | `documentation`, `security-scanner` | `security/owasp-top-10` | 28 on demand |

### Quality

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **contract-validator** | sonnet | `code-quality`, `documentation` | `testing/contract-testing` | 3 on demand |
| **integration-validator-expert** | sonnet | `api-explorer`, `documentation` | `integration-validation/openapi-contract` | 16 on demand |
| **open-source-expert** | sonnet | `code-quality`, `documentation` | `security/license-compliance` | 5 on demand |
| **qa-expert** | sonnet | `code-quality`, `documentation` | `quality/common` | 18 on demand |
| **verification-runner** | _default_ | _none_ | _none_ | 12 on demand |

### Game Development

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **godot-csharp-expert** | sonnet | `documentation` | `languages/csharp`, `systems/game-engine-architecture` | 4 on demand |
| **sim-core-expert** | sonnet | `code-quality`, `documentation` | `languages/csharp` | 7 on demand |
| **unity-expert** | opus | `documentation` | `gamedev/unity-core`, `languages/csharp` | 31 on demand |

### Industrial Automation

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **automation-architect** | opus | _none_ | `industrial/bulk-engineering` | 6 on demand |
| **dcs-analyst** | sonnet | _none_ | `industrial/freelance-formats` | 2 on demand |
| **freelance-engineer** | sonnet | _none_ | `industrial/freelance-formats` | 2 on demand |
| **membrane-expert** | sonnet | `documentation` | `industrial/membrane-ro-fundamentals` | 5 on demand |

### Bitcoin / Lightning

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **bitcoin-core-expert** | sonnet | `documentation` | `bitcoin/core/rpc` | 16 on demand |
| **bitcoin-protocol-expert** | opus | `documentation` | `bitcoin/protocol/consensus` | 23 on demand |
| **bitcoin-testing-expert** | sonnet | `documentation` | `bitcoin/testing/regtest` | 10 on demand |
| **bitcoin-wallet-expert** | sonnet | `documentation` | `bitcoin/wallets/hd` | 35 on demand |
| **lightning-expert** | opus | `documentation` | `bitcoin/lightning/bolts` | 32 on demand |

### Messaging

| Agent | Model | MCP servers | Core skills | Extended |
|-------|-------|-------------|-------------|----------|
| **messaging-expert** | sonnet | `documentation` | `messaging/kafka` | 19 on demand |

## Extended skills per agent

Loaded on demand, not installed with the agent.

- **cpp-expert** (4) — `build-tools/cmake`, `testing/googletest`, `quality/cpp-quality`, `security/cpp-security`
- **deno-expert** (5) — `backend-frameworks/fresh`, `backend-frameworks/oak`, `api-design/rest-api`, `testing/deno-testing`, `backend-frameworks/hono`
- **dotnet-expert** (25) — `best-practices/token-optimization`, `backend-frameworks/aspnet-minimal-api`, `backend-frameworks/aspnet-middleware`, `backend-frameworks/aspnet-signalr`, `backend-frameworks/aspnet-blazor`, `backend-frameworks/aspnet-identity`, `backend-frameworks/aspnet-validation`, `orm-odm/entity-framework-core`, `languages/csharp`, `testing/xunit`, `testing/nunit`, `quality/dotnet-quality`, `security/dotnet-security`, `databases/postgresql`, `databases/sql-server`, `api-design/swagger-dotnet`, `best-practices/resilience-patterns`, `best-practices/caching-strategies`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `security/cors-security-headers`, `observability/error-tracking`, `infrastructure/health-checks`, `architecture/ddd`
- **fastapi-expert** (17) — `best-practices/token-optimization`, `languages/python`, `orm-odm/sqlalchemy`, `api-design/rest-api`, `api-design/openapi`, `testing/pytest`, `logging/structlog`, `security/api-security`, `real-time/sse`, `infrastructure/job-queues`, `infrastructure/cron-scheduling`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `security/cors-security-headers`, `observability/error-tracking`, `infrastructure/health-checks`
- **go-expert** (11) — `backend-frameworks/gin`, `backend-frameworks/fiber`, `backend-frameworks/echo`, `backend-frameworks/chi`, `api-design/rest-api`, `api-design/grpc`, `testing/go-testing`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `infrastructure/health-checks`
- **nestjs-expert** (24) — `best-practices/token-optimization`, `orm-odm/prisma`, `languages/typescript`, `api-design/rest-api`, `authentication/jwt`, `testing/vitest`, `logging/pino`, `logging/winston`, `api-integration/axios`, `security/api-security`, `real-time/socket-io`, `infrastructure/job-queues`, `best-practices/caching-strategies`, `email/email-sending`, `backend-frameworks/nestjs-websocket`, `api-integration/openapi-codegen`, `orm-odm/typeorm`, `validation/class-validator`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `security/cors-security-headers`, `observability/error-tracking`, `infrastructure/health-checks`
- **rust-expert** (15) — `backend-frameworks/actix-web`, `backend-frameworks/axum`, `backend-frameworks/rocket`, `backend-frameworks/warp`, `api-design/rest-api`, `testing/rust-testing`, `testing/proptest`, `network/rustls`, `network/arti`, `databases/rusqlite`, `data-processing/rust-decimal`, `quality/rust-supply-chain`, `quality/osv-scanner`, `observability/rust-tracing`, `build-tools/rust-cross-compile`
- **spring-boot-expert** (87) — `best-practices/token-optimization`, `backend-frameworks/spring-data-jpa`, `backend-frameworks/spring-security`, `backend-frameworks/spring-validation`, `backend-frameworks/spring-web`, `backend-frameworks/spring-profiles`, `backend-frameworks/spring-actuator`, `backend-frameworks/spring-cache`, `backend-frameworks/spring-scheduling`, `backend-frameworks/spring-events`, `backend-frameworks/spring-aop`, `backend-frameworks/spring-webflux`, `backend-frameworks/spring-batch`, `backend-frameworks/spring-mail`, `backend-frameworks/spring-websocket`, `backend-frameworks/spring-cloud-basics`, `backend-frameworks/spring-integration`, `backend-frameworks/spring-modulith`, `backend-frameworks/spring-kafka`, `backend-frameworks/spring-amqp`, `backend-frameworks/spring-cloud-gateway`, `backend-frameworks/spring-cloud-config`, `backend-frameworks/spring-cloud-eureka`, `backend-frameworks/spring-cloud-openfeign`, `backend-frameworks/spring-cloud-circuitbreaker`, `backend-frameworks/spring-graphql`, `backend-frameworks/spring-hateoas`, `backend-frameworks/micrometer-tracing`, `backend-frameworks/spring-session`, `backend-frameworks/spring-retry`, `backend-frameworks/spring-ai`, `backend-frameworks/spring-ldap`, `backend-frameworks/spring-shell`, `backend-frameworks/spring-statemachine`, `backend-frameworks/spring-authorization-server`, `backend-frameworks/spring-cloud-function`, `databases/spring-data-redis`, `databases/spring-data-elasticsearch`, `databases/spring-data-neo4j`, `databases/spring-data-jdbc`, `databases/flyway`, `databases/spring-r2dbc`, `databases/spring-data-mongodb`, `backend-frameworks/spring-rest`, `languages/lombok`, `languages/mapstruct`, `api-design/springdoc-openapi`, `databases/postgresql`, `testing/spring-boot-test`, `logging/logback`, `logging/slf4j`, `api-integration/openapi-generator`, `security/api-security`, `best-practices/resilience-patterns`, `best-practices/caching-strategies`, `best-practices/feature-flags`, `architecture/multitenancy`, `infrastructure/cron-scheduling`, `infrastructure/job-queues`, `security/rate-limiting`, `security/cryptography`, `security/audit-logging`, `security/gdpr`, `testing/load-testing`, `testing/contract-testing`, `email/email-sending`, `notifications/push-notifications`, `real-time/sse`, `api-design/grpc`, `cloud/aws`, `cloud/serverless`, `utilities/pdf-generation`, `utilities/data-export`, `backend-frameworks/thymeleaf`, `databases/elasticsearch`, `utilities/apache-poi`, `quality/jacoco`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `security/cors-security-headers`, `observability/error-tracking`, `infrastructure/health-checks`, `infrastructure/deployment-strategies`, `architecture/ddd`, `architecture/event-sourcing-cqrs`, `logging/java`
- **streamlit-expert** (6) — `best-practices/token-optimization`, `languages/python`, `data-processing/pandas`, `data-validation/pydantic`, `testing/pytest`, `best-practices/ruff`
- **windows-driver-expert** (7) — `windows/driver-signing`, `quality/cpp-quality`, `build-tools/cmake`, `security/cpp-security`, `windows/wdf-umdf`, `windows/hid-input-filter`, `windows/indirect-display`
- **bitcoin-core-expert** (16) — `bitcoin/core/operations`, `bitcoin/core/descriptors-wallet`, `bitcoin/core/indexes`, `bitcoin/core/zmq`, `bitcoin/core/rest-api`, `bitcoin/core/release-engineering`, `bitcoin/core/knots`, `bitcoin/protocol/p2p`, `bitcoin/protocol/descriptors`, `bitcoin/infrastructure/electrs`, `bitcoin/infrastructure/fulcrum`, `bitcoin/infrastructure/esplora`, `bitcoin/infrastructure/mempool-space`, `bitcoin/infrastructure/btcpay`, `bitcoin/infrastructure/specter-desktop`, `bitcoin/infrastructure/node-distros`
- **bitcoin-protocol-expert** (23) — `bitcoin/protocol/transactions`, `bitcoin/protocol/scripts`, `bitcoin/protocol/segwit`, `bitcoin/protocol/taproot`, `bitcoin/protocol/psbt`, `bitcoin/protocol/descriptors`, `bitcoin/protocol/miniscript`, `bitcoin/protocol/bips`, `bitcoin/protocol/p2p`, `bitcoin/protocol/package-relay`, `bitcoin/protocol/message-signing`, `bitcoin/protocol/proposals`, `bitcoin/cryptography/secp256k1`, `bitcoin/cryptography/ecdsa`, `bitcoin/cryptography/schnorr`, `bitcoin/cryptography/bip32`, `bitcoin/cryptography/musig2`, `bitcoin/cryptography/frost`, `bitcoin/cryptography/adaptor-sigs`, `bitcoin/cryptography/dlcs`, `bitcoin/metaprotocols/ordinals`, `bitcoin/metaprotocols/inscriptions`, `bitcoin/metaprotocols/runes`
- **bitcoin-testing-expert** (10) — `bitcoin/testing/signet`, `bitcoin/testing/polar`, `bitcoin/testing/nigiri`, `bitcoin/testing/core-test-framework`, `bitcoin/testing/fuzz`, `bitcoin/testing/property-based`, `bitcoin/core/rpc`, `bitcoin/core/operations`, `bitcoin/protocol/psbt`, `bitcoin/protocol/descriptors`
- **bitcoin-wallet-expert** (35) — `bitcoin/wallets/coin-selection`, `bitcoin/wallets/fee-estimation`, `bitcoin/wallets/rbf-cpfp`, `bitcoin/wallets/vaults`, `bitcoin/wallets/timelocks`, `bitcoin/wallets/uri-schemes`, `bitcoin/wallets/payment-codes`, `bitcoin/wallets/labels`, `bitcoin/wallets/entropy`, `bitcoin/wallets/backup`, `bitcoin/protocol/psbt`, `bitcoin/protocol/descriptors`, `bitcoin/protocol/miniscript`, `bitcoin/protocol/message-signing`, `bitcoin/cryptography/bip32`, `bitcoin/cryptography/musig2`, `bitcoin/hardware/trezor`, `bitcoin/hardware/ledger`, `bitcoin/hardware/coldcard`, `bitcoin/hardware/bitbox02`, `bitcoin/hardware/jade`, `bitcoin/hardware/passport`, `bitcoin/hardware/seedsigner`, `bitcoin/hardware/krux`, `bitcoin/hardware/keystone`, `bitcoin/hardware/specter-diy`, `bitcoin/hardware/hwi`, `bitcoin/hardware/psbt-flows`, `bitcoin/hardware/multi-vendor-multisig`, `bitcoin/privacy/coinjoin`, `bitcoin/privacy/payjoin`, `bitcoin/privacy/silent-payments`, `bitcoin/privacy/stealth`, `bitcoin/privacy/bip47-paynyms`, `bitcoin/privacy/atomic-swaps`
- **lightning-expert** (32) — `bitcoin/lightning/channels`, `bitcoin/lightning/htlcs`, `bitcoin/lightning/routing`, `bitcoin/lightning/onion`, `bitcoin/lightning/gossip`, `bitcoin/lightning/watchtowers`, `bitcoin/lightning/splicing`, `bitcoin/lightning/taproot-channels`, `bitcoin/lightning/lnd`, `bitcoin/lightning/cln`, `bitcoin/lightning/ldk`, `bitcoin/lightning/eclair`, `bitcoin/lightning/greenlight`, `bitcoin/lightning/phoenixd`, `bitcoin/lightning/bolt12`, `bitcoin/lightning/lnurl`, `bitcoin/lightning/lightning-address`, `bitcoin/lightning/lsp`, `bitcoin/lightning/webln`, `bitcoin/lightning/nwc`, `bitcoin/lightning/uma`, `bitcoin/lightning/trampoline`, `bitcoin/lightning/amp-mpp`, `bitcoin/lightning/keysend`, `bitcoin/lightning/loop-pool-lit`, `bitcoin/lightning/submarine-swaps`, `bitcoin/lightning/replacement-cycling`, `bitcoin/lightning/channel-jamming`, `bitcoin/lightning/pinning-attacks`, `bitcoin/lightning/consumer-wallets`, `bitcoin/l2/taproot-assets`, `bitcoin/l2/rgb`
- **cloud-expert** (16) — `best-practices/token-optimization`, `cloud/azure`, `cloud/gcp`, `cloud/serverless`, `file-storage/cloud-storage`, `infrastructure/terraform`, `best-practices/caching-strategies`, `best-practices/resilience-patterns`, `best-practices/feature-flags`, `architecture/multitenancy`, `security/secrets-management`, `security/iac-security`, `infrastructure/deployment-strategies`, `infrastructure/health-checks`, `infrastructure/api-gateway`, `infrastructure/service-mesh`
- **accessibility-expert** (4) — `accessibility/axe-core`, `testing/playwright`, `frontend-frameworks/react`, `quality/common`
- **architect** (37) — `best-practices/performance`, `best-practices/event-driven`, `architecture/ddd`, `architecture/event-sourcing-cqrs`, `architecture/multitenancy`, `api-design/rest-api`, `api-design/graphql`, `backend-frameworks/spring-cloud-basics`, `backend-frameworks/spring-modulith`, `backend-frameworks/spring-cloud-gateway`, `backend-frameworks/spring-cloud-config`, `backend-frameworks/spring-cloud-eureka`, `backend-frameworks/spring-cloud-openfeign`, `backend-frameworks/spring-cloud-circuitbreaker`, `backend-frameworks/spring-graphql`, `backend-frameworks/spring-data-jpa`, `infrastructure/docker`, `infrastructure/kubernetes`, `orm-odm/prisma`, `systems/os-kernel-architecture`, `systems/embedded-rtos`, `systems/systems-networking`, `systems/storage-engines`, `systems/distributed-consensus`, `systems/virtualization`, `systems/hardware-aware-design`, `systems/data-intensive`, `systems/security-architecture`, `systems/distributed-ledger`, `systems/cyber-physical`, `systems/game-engine-architecture`, `ai-systems/edge-inference`, `ai-systems/inference-serving-topology`, `ai-systems/hybrid-edge-cloud`, `ai-systems/ai-hardware-selection`, `ai-systems/model-gateway-routing`, `ai-systems/agentic-architecture`
- **claude-code-extension-expert** (4) — `claude-code-authoring/agent-authoring`, `claude-code-authoring/hook-authoring`, `claude-code-authoring/mcp-authoring`, `claude-code-authoring/plugin-authoring`
- **code-reviewer** (9) — `best-practices/token-optimization`, `best-practices/clean-code`, `best-practices/solid-principles`, `best-practices/git-workflow`, `best-practices/performance`, `security/owasp`, `quality/eslint`, `quality/typescript-eslint`, `frontend-frameworks/react`
- **dashboard-refactor-expert** (8) — `frontend-frameworks/react-hooks`, `frontend-frameworks/react-patterns`, `languages/typescript`, `testing/vitest`, `testing/playwright`, `styling/tailwindcss`, `desktop/electron`, `state-management/zustand`
- **documentation-expert** (4) — `documentation/jsdoc`, `languages/typescript`, `quality/common`, `api-design/openapi`
- **log-analyst** (3) — `best-practices/token-optimization`, `logging/nodejs`, `logging/python`
- **nodejs-expert** (29) — `languages/typescript`, `profiling/nodejs`, `best-practices/performance`, `infrastructure/docker`, `logging/pino`, `logging/winston`, `api-integration/axios`, `real-time/socket-io`, `real-time/sse`, `real-time/webrtc`, `infrastructure/job-queues`, `infrastructure/cron-scheduling`, `utilities/pdf-generation`, `utilities/data-export`, `backend-frameworks/express`, `backend-frameworks/fastify`, `languages/javascript`, `languages/bun`, `build-tools/pnpm`, `build-tools/webpack`, `databases/elasticsearch`, `api-design/webhooks`, `api-design/pagination`, `best-practices/error-handling`, `security/cors-security-headers`, `observability/error-tracking`, `infrastructure/health-checks`, `utilities/image-processing`, `logging/nodejs`
- **performance-expert** (11) — `best-practices/token-optimization`, `profiling/java`, `profiling/python`, `best-practices/performance`, `backend-frameworks/spring-actuator`, `backend-frameworks/micrometer-tracing`, `best-practices/caching-strategies`, `testing/load-testing`, `observability/opentelemetry`, `databases/postgresql`, `backend-frameworks/spring-data-jpa`
- **python-expert** (11) — `best-practices/token-optimization`, `infrastructure/python-packaging`, `best-practices/python-quality`, `testing/pytest`, `ai-integration/langchain`, `ai-integration/vector-databases`, `ai-integration/rag-patterns`, `data/etl-pipelines`, `backend-frameworks/django`, `backend-frameworks/flask`, `logging/python`
- **typescript-expert** (12) — `quality/eslint-biome`, `quality/eslint`, `quality/typescript-eslint`, `quality/common`, `best-practices/clean-code`, `documentation/jsdoc`, `validation/zod`, `best-practices/biome`, `build-tools/esbuild`, `frontend-frameworks/solid`, `languages/javascript`, `best-practices/solid-principles`
- **data-engineering-expert** (5) — `best-practices/token-optimization`, `data-validation/pydantic`, `languages/python`, `testing/pytest`, `best-practices/ruff`
- **rag-expert** (94) — `rag/rag-architecture`, `rag/chunking-strategies`, `rag/contextual-retrieval`, `rag/query-transformations`, `rag/advanced-retrieval`, `rag/hybrid-search`, `rag/reranking`, `rag/rag-evaluation`, `rag/agentic-rag`, `rag/conversational-rag`, `rag/streaming-rag`, `rag/self-querying-retriever`, `rag/personalization-rag`, `rag/time-aware-retrieval`, `rag/long-context-vs-rag`, `rag/tabular-rag`, `rag/feedback-loops`, `rag/graph-rag`, `rag/multimodal-rag`, `rag/rag-guardrails`, `rag/rag-caching`, `rag/rag-security`, `rag/rag-production`, `rag/rag-observability`, `rag/entity-resolution`, `rag/knowledge-graph-construction`, `rag/ontology-guided-retrieval`, `rag/ares-framework`, `rag/giskard-rag`, `rag/continuous-evaluation`, `rag/shadow-mode-deployment`, `rag/ingestion-orchestration`, `rag/cdc-streaming-ingestion`, `rag/domain-templates`, `retrieval/colbert-retrieval`, `retrieval/splade-deep`, `retrieval/bm25-tuning`, `retrieval/rank-gpt`, `retrieval/cross-encoder-training`, `embeddings/embedding-models`, `embeddings/multilingual-embeddings`, `embeddings/embedding-fine-tuning`, `embeddings/matryoshka-embeddings`, `embeddings/late-chunking`, `embeddings/drift-detection`, `embeddings/hard-negative-mining`, `embeddings/semantic-dedup`, `vector-stores/pgvector-advanced`, `vector-stores/qdrant-advanced`, `vector-stores/weaviate-advanced`, `vector-stores/elasticsearch-vectors`, `vector-stores/pinecone-advanced`, `vector-stores/milvus`, `vector-stores/redis-vector`, `vector-stores/lancedb`, `vector-stores/mongodb-atlas-vector`, `vector-stores/chromadb-advanced`, `vector-stores/opensearch-knn`, `vector-stores/vespa`, `vector-stores/ann-algorithms`, `vector-stores/vector-quantization`, `document-processing/pdf-extraction`, `document-processing/unstructured-io`, `document-processing/table-extraction`, `document-processing/ocr`, `document-processing/code-chunking`, `document-processing/web-scraping`, `document-processing/office-docs`, `document-processing/audio-transcription`, `document-processing/email-ingestion`, `document-processing/video-rag`, `document-processing/markdown-structured`, `rag-frameworks/llamaindex`, `rag-frameworks/haystack`, `rag-frameworks/dspy`, `rag-frameworks/langgraph-rag`, `rag-frameworks/ragatouille`, `rag-frameworks/r2r`, `rag-frameworks/canopy`, `rag-frameworks/txtai`, `ai-integration/rag-patterns`, `ai-integration/vector-databases`, `ai-integration/langchain`, `ai-integration/anthropic-python`, `rag-ops/tei-triton-serving`, `rag-ops/batch-inference`, `rag-ops/cost-allocation`, `rag-ops/multi-region`, `rag-ops/llm-gateway`, `data-validation/pydantic`, `best-practices/token-optimization`, `testing/pytest`, `logging/python`, `security/api-security`
- **mongodb-expert** (2) — `languages/java`, `infrastructure/docker`
- **prisma-expert** (3) — `databases/postgresql`, `databases/mysql`, `languages/typescript`
- **sql-expert** (11) — `best-practices/token-optimization`, `databases/sql-advanced`, `databases/plpgsql`, `databases/plsql`, `databases/tsql`, `databases/postgresql`, `databases/mysql`, `databases/oracle`, `databases/sqlserver`, `databases/migrations`, `databases/flyway`
- **angular-expert** (11) — `best-practices/token-optimization`, `frontend-frameworks/angular-routing`, `frontend-frameworks/angular-forms`, `frontend-frameworks/angular-http`, `frontend-frameworks/angular-testing`, `frontend-frameworks/angular-material`, `frontend-frameworks/angular-ssr`, `languages/typescript`, `state-management/ngrx`, `testing/vitest`, `internationalization/i18n`
- **creative-frontend-expert** (3) — `graphics/three-js`, `graphics/svg-animation`, `graphics/canvas-webgl`
- **electron-expert** (2) — `testing/vitest`, `testing/playwright`
- **nextjs-expert** (20) — `frontend-frameworks/react`, `languages/typescript`, `styling/tailwindcss`, `styling/shadcn-ui`, `state-management/tanstack-query`, `state-management/swr`, `orm-odm/prisma`, `testing/vitest`, `testing/playwright`, `api-integration/axios`, `internationalization/i18n`, `payments/stripe`, `api-design/trpc`, `authentication/nextauth`, `orm-odm/drizzle`, `validation/zod`, `best-practices/error-handling`, `observability/error-tracking`, `frontend-frameworks/pwa`, `api-design/graphql`
- **react-expert** (32) — `state-management/zustand`, `styling/tailwindcss`, `frontend-frameworks/react-19`, `frontend-frameworks/react-suspense`, `frontend-frameworks/react-patterns`, `frontend-frameworks/react-context`, `frontend-frameworks/react-performance`, `frontend-frameworks/react-concurrent`, `frontend-frameworks/react-router`, `frontend-frameworks/react-testing`, `frontend-frameworks/react-forms`, `frontend-frameworks/react-server-components`, `frontend-frameworks/react-hook-form`, `styling/shadcn-ui`, `state-management/tanstack-query`, `state-management/swr`, `testing/vitest`, `testing/testing-library`, `api-integration/axios`, `internationalization/i18n`, `ui-libraries/charting`, `api-integration/graphql-codegen`, `frontend-frameworks/react-api`, `frontend-frameworks/react-websocket`, `frontend-frameworks/tanstack-router`, `meta-frameworks/astro`, `meta-frameworks/remix`, `state-management/redux-toolkit`, `styling/radix-ui`, `validation/yup`, `best-practices/error-handling`, `frontend-frameworks/pwa`
- **svelte-expert** (4) — `styling/tailwindcss`, `testing/vitest`, `testing/playwright`, `ui-libraries/skeleton`
- **tauri-expert** (5) — `languages/typescript`, `build-tools/vite`, `frontend-frameworks/svelte`, `testing/vitest`, `testing/playwright`
- **ux-expert** (7) — `styling/tailwindcss`, `styling/shadcn-ui`, `styling/radix-ui`, `accessibility/wcag`, `ui-libraries/charting`, `best-practices/performance`, `quality/common`
- **vue-expert** (8) — `meta-frameworks/nuxt`, `languages/typescript`, `styling/tailwindcss`, `state-management/pinia`, `testing/vitest`, `testing/playwright`, `api-integration/axios`, `internationalization/i18n`
- **godot-csharp-expert** (4) — `testing/xunit`, `best-practices/clean-code`, `best-practices/performance`, `best-practices/token-optimization`
- **sim-core-expert** (7) — `testing/xunit`, `testing/contract-testing`, `systems/game-engine-architecture`, `architecture/event-sourcing-cqrs`, `best-practices/clean-code`, `best-practices/performance`, `best-practices/token-optimization`
- **unity-expert** (31) — `best-practices/token-optimization`, `gamedev/unity-rendering`, `gamedev/unity-input-ui`, `gamedev/unity-physics-anim`, `gamedev/unity-addressables`, `gamedev/unity-performance`, `gamedev/unity-dots`, `gamedev/unity-netcode`, `gamedev/unity-xr`, `gamedev/unity-editor-tooling`, `gamedev/unity-testing`, `gamedev/unity-build-platforms`, `gamedev/unity-best-practices`, `gamedev/unity-2d-core`, `gamedev/unity-2d-tilemap`, `gamedev/unity-2d-physics`, `gamedev/unity-2d-animation`, `gamedev/unity-2d-lighting`, `gamedev/unity-2d-cameras`, `gamedev/unity-2d-gameplay`, `gamedev/2d-art/tile-design`, `gamedev/2d-art/pixel-art-fundamentals`, `gamedev/2d-art/palettes`, `gamedev/2d-art/seamless-textures`, `gamedev/2d-art/animation-frames`, `gamedev/2d-art/tools`, `gamedev/2d-art/ai-art-tools`, `gamedev/2d-art/lighting-art`, `gamedev/2d-art/vfx-2d`, `gamedev/2d-art/environment-design`, `gamedev/2d-art/character-design`
- **automation-architect** (6) — `industrial/freelance-formats`, `industrial/isa-standards`, `industrial/dcs-platforms`, `industrial/iec61131`, `data-processing/pandas`, `data-validation/pydantic`
- **dcs-analyst** (2) — `industrial/isa-standards`, `industrial/dcs-platforms`
- **freelance-engineer** (2) — `industrial/isa-standards`, `industrial/bulk-engineering`
- **membrane-expert** (5) — `industrial/membrane-troubleshooting`, `industrial/membrane-economics-edi`, `industrial/membrane-pretreatment`, `industrial/membrane-nf`, `industrial/membrane-autopsy`
- **devops-expert** (26) — `best-practices/token-optimization`, `infrastructure/docker-compose`, `infrastructure/kubernetes`, `ci-cd/github-actions`, `databases/redis`, `backend-frameworks/spring-profiles`, `backend-frameworks/spring-actuator`, `backend-frameworks/spring-cloud-config`, `security/secrets-management`, `security/supply-chain`, `security/container-security`, `security/iac-security`, `infrastructure/terraform`, `cloud/aws`, `cloud/azure`, `cloud/gcp`, `cloud/serverless`, `best-practices/caching-strategies`, `build-tools/nx`, `build-tools/turborepo`, `observability/opentelemetry`, `observability/error-tracking`, `infrastructure/deployment-strategies`, `infrastructure/health-checks`, `infrastructure/api-gateway`, `infrastructure/service-mesh`
- **docker-expert** (4) — `infrastructure/docker-compose`, `infrastructure/kubernetes`, `ci-cd/github-actions`, `security/container-security`
- **sysadmin-expert** (55) — `infrastructure/nginx`, `infrastructure/ssl-tls`, `infrastructure/dns`, `infrastructure/caddy`, `infrastructure/traefik`, `infrastructure/load-balancer`, `infrastructure/waf`, `infrastructure/systemd`, `infrastructure/cron-scheduling`, `infrastructure/job-queues`, `infrastructure/firewall`, `infrastructure/server-hardening`, `security/secrets-management`, `security/cors-security-headers`, `security/api-security`, `security/rate-limiting`, `security/owasp-top-10`, `security/audit-logging`, `security/iac-security`, `security/container-security`, `security/supply-chain`, `security/cryptography`, `infrastructure/server-monitoring`, `observability/opentelemetry`, `observability/error-tracking`, `infrastructure/backup-recovery`, `infrastructure/wireguard`, `infrastructure/docker`, `infrastructure/docker-compose`, `infrastructure/kubernetes`, `infrastructure/terraform`, `cloud/aws`, `cloud/gcp`, `cloud/azure`, `cloud/serverless`, `databases/postgresql`, `databases/mysql`, `databases/mongodb`, `databases/elasticsearch`, `databases/redis`, `databases/migrations`, `databases/flyway`, `best-practices/token-optimization`, `infrastructure/server-performance`, `infrastructure/email-infrastructure`, `infrastructure/zero-downtime-deploy`, `infrastructure/deployment-strategies`, `infrastructure/health-checks`, `infrastructure/api-gateway`, `infrastructure/service-mesh`, `ci-cd/github-actions`, `file-storage/cloud-storage`, `best-practices/caching-strategies`, `best-practices/resilience-patterns`, `best-practices/feature-flags`
- **messaging-expert** (19) — `messaging/rabbitmq`, `messaging/activemq`, `messaging/sqs`, `messaging/redis-pubsub`, `messaging/nats`, `messaging/pulsar`, `messaging/azure-service-bus`, `messaging/google-pubsub`, `best-practices/event-driven`, `backend-frameworks/spring-boot`, `backend-frameworks/spring-integration`, `backend-frameworks/spring-kafka`, `backend-frameworks/spring-amqp`, `testing/messaging-testing-kafka`, `testing/messaging-testing-rabbitmq`, `testing/messaging-testing`, `testing/testcontainers`, `infrastructure/docker`, `infrastructure/kubernetes`
- **android-native-expert** (13) — `languages/kotlin`, `mobile/jetpack-compose`, `databases/sqlcipher`, `security/libsodium`, `security/age-encryption`, `testing/kotest`, `testing/turbine`, `testing/maestro`, `testing/compose-snapshot`, `security/sigstore-cosign`, `quality/kotlin-quality`, `quality/osv-scanner`, `observability/sentry-selfhosted`
- **ios-native-expert** (8) — `languages/swift`, `databases/sqlcipher`, `security/libsodium`, `security/age-encryption`, `testing/maestro`, `security/sigstore-cosign`, `quality/osv-scanner`, `observability/sentry-selfhosted`
- **kmp-expert** (19) — `languages/swift`, `languages/uniffi`, `languages/java-foreign`, `frontend-frameworks/compose-multiplatform`, `build-tools/gradle-kmp`, `build-tools/rust-cross-compile`, `testing/kotest`, `testing/turbine`, `testing/maestro`, `testing/compose-snapshot`, `testing/proptest`, `observability/rust-tracing`, `observability/sentry-selfhosted`, `infrastructure/reproducible-builds`, `security/sigstore-cosign`, `quality/rust-supply-chain`, `quality/kotlin-quality`, `quality/osv-scanner`, `documentation/docs-toolchain`
- **mobile-expert** (8) — `best-practices/token-optimization`, `mobile/flutter`, `mobile/expo`, `notifications/push-notifications`, `internationalization/i18n`, `authentication/webauthn`, `payments/stripe`, `file-storage/file-upload`
- **contract-validator** (3) — `best-practices/clean-code`, `best-practices/error-handling`, `best-practices/token-optimization`
- **integration-validator-expert** (16) — `integration-validation/type-generation`, `integration-validation/auth-flow-validation`, `integration-validation/error-contract`, `integration-validation/api-versioning`, `integration-validation/dto-sync-patterns`, `api-integration/type-safe-api`, `api-integration/http-clients`, `state-management/tanstack-query`, `state-management/pinia`, `frontend-frameworks/react`, `frontend-frameworks/vue`, `frontend-frameworks/angular`, `frontend-frameworks/svelte`, `meta-frameworks/nextjs`, `languages/typescript`, `best-practices/clean-code`
- **open-source-expert** (5) — `best-practices/open-source`, `best-practices/git-workflow`, `best-practices/clean-code`, `security/supply-chain`, `security/secrets-management`
- **qa-expert** (18) — `quality/sonarqube`, `best-practices/clean-code`, `quality/typescript-quality`, `quality/java-quality`, `quality/python-quality`, `quality/go-quality`, `quality/rust-quality`, `quality/dotnet-quality`, `quality/php-quality`, `quality/kotlin-quality`, `security/ai-code-security`, `testing/load-testing`, `testing/contract-testing`, `testing/jest`, `testing/vitest`, `testing/cypress`, `testing/playwright`, `quality/jacoco`
- **verification-runner** (12) — `testing/vitest`, `testing/jest`, `testing/pytest`, `testing/junit`, `testing/spring-boot-test`, `testing/go-testing`, `testing/rust-testing`, `testing/xunit`, `testing/deno-testing`, `quality/common`, `quality/eslint`, `ci-cd/github-actions`
- **security-expert** (28) — `best-practices/token-optimization`, `security/owasp`, `security/supply-chain`, `security/secrets-management`, `security/api-security`, `security/java-security`, `security/python-security`, `security/dotnet-security`, `security/go-security`, `security/rust-security`, `security/typescript-security`, `security/php-security`, `security/kotlin-security`, `security/ai-code-security`, `security/container-security`, `security/iac-security`, `authentication/jwt`, `authentication/oauth2`, `authentication/webauthn`, `backend-frameworks/spring-security`, `backend-frameworks/spring-session`, `best-practices/clean-code`, `security/rate-limiting`, `security/cryptography`, `security/audit-logging`, `security/gdpr`, `security/license-compliance`, `security/cors-security-headers`
- **playwright-expert** (4) — `languages/typescript`, `best-practices/clean-code`, `accessibility/axe-core`, `testing/cypress`
- **python-integration-test-expert** (11) — `testing/testcontainers-python`, `testing/pytest-django`, `testing/fastapi-testing`, `testing/factory-boy`, `testing/pytest`, `databases/postgresql`, `databases/mongodb`, `databases/redis`, `backend-frameworks/fastapi`, `backend-frameworks/django`, `languages/python`
- **smoke-test-expert** (3) — `testing/rest-assured`, `testing/testcontainers`, `best-practices/token-optimization`
- **spring-boot-integration-test-expert** (14) — `backend-frameworks/spring-boot`, `databases/postgresql`, `testing/rest-assured`, `backend-frameworks/spring-data-jpa`, `databases/mongodb`, `testing/messaging-testing-kafka`, `testing/messaging-testing-rabbitmq`, `testing/messaging-testing`, `backend-frameworks/spring-kafka`, `backend-frameworks/spring-amqp`, `logging/logback`, `logging/slf4j`, `testing/contract-testing`, `testing/load-testing`
- **vitest-expert** (4) — `testing/testing-library`, `languages/typescript`, `best-practices/clean-code`, `testing/jest`

## MCP server to agents (reverse index)

| MCP server | Agents that declare it |
|------------|------------------------|
| **api-explorer** | `architect`, `integration-validator-expert` |
| **api-tester** | `dotnet-expert`, `fastapi-expert`, `nestjs-expert`, `spring-boot-expert`, `smoke-test-expert` |
| **code-quality** | `cpp-expert`, `code-reviewer`, `dashboard-refactor-expert`, `typescript-expert`, `sim-core-expert`, `contract-validator`, `open-source-expert`, `qa-expert` |
| **dashboard-bridge** | _no agent declares this server_ |
| **database-query** | `sql-expert`, `python-integration-test-expert`, `smoke-test-expert` |
| **docker-manager** | `devops-expert`, `sysadmin-expert`, `smoke-test-expert` |
| **documentation** | `cpp-expert`, `deno-expert`, `dotnet-expert`, `fastapi-expert`, `go-expert`, `nestjs-expert`, `rust-expert`, `spring-boot-expert`, `streamlit-expert`, `windows-driver-expert`, `bitcoin-core-expert`, `bitcoin-protocol-expert`, `bitcoin-testing-expert`, `bitcoin-wallet-expert`, `lightning-expert`, `cloud-expert`, `accessibility-expert`, `architect`, `code-reviewer`, `dashboard-refactor-expert`, `documentation-expert`, `log-analyst`, `nodejs-expert`, `performance-expert`, `python-expert`, `typescript-expert`, `data-engineering-expert`, `rag-expert`, `mongodb-expert`, `prisma-expert`, `sql-expert`, `angular-expert`, `creative-frontend-expert`, `electron-expert`, `nextjs-expert`, `react-expert`, `svelte-expert`, `tauri-expert`, `ux-expert`, `vue-expert`, `godot-csharp-expert`, `sim-core-expert`, `unity-expert`, `membrane-expert`, `devops-expert`, `docker-expert`, `sysadmin-expert`, `messaging-expert`, `android-native-expert`, `ios-native-expert`, `kmp-expert`, `mobile-expert`, `contract-validator`, `integration-validator-expert`, `open-source-expert`, `qa-expert`, `security-expert`, `playwright-expert`, `python-integration-test-expert`, `smoke-test-expert`, `spring-boot-integration-test-expert`, `vitest-expert` |
| **log-analyzer** | `log-analyst`, `nodejs-expert`, `smoke-test-expert` |
| **performance-profiler** | `nodejs-expert`, `performance-expert` |
| **security-scanner** | `security-expert` |
| **skill-loader** | _no agent declares this server_ |

MCP servers are never required: an agent that declares one still works without it,
losing only the tools that server provides.
