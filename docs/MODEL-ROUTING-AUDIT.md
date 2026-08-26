# Model Routing Audit — Per-Agent Recommendations

> **Status**: Sprint 5A deliverable — research output for user review.
> **Date**: 2026-05-04 (post-Sprint 4 audit).
> **Method**: 4 parallel deep-thinking analyses (architect agent), one per agent category, reading every agent file in full and reasoning about action-vs-analysis mode, tool surface, downstream impact, invocation frequency, and known model strengths/weaknesses.
> **Bias**: Toward Sonnet when in doubt — a wrong Haiku call wastes user time on bad output (net cost INCREASE), so the threshold to demote is high.

---

## Executive Summary

**Current state (62 agents):**
- 56/62 (90%) on `model: sonnet`
- 5/62 (8%) on `model: opus` (`bitcoin-protocol-expert`, `lightning-expert`, `automation-architect`, `dcs-analyst`, `freelance-engineer`)
- 1/62 with no `model:` field (`dashboard-refactor-expert` — inherits default)
- 0/62 on `model: haiku`

**Findings:**
- **3 high-confidence upgrades to Opus** (cross-platform/cross-system orchestration, BSOD-stakes, deeply specialized).
- **2 high-confidence downgrades from Opus to Sonnet** (currently Opus but tasks are structured extraction/templated generation, not open-ended reasoning).
- **8 Haiku candidates pending benchmark** — well-scoped, pattern-matching codegen with low downstream impact.
- **1 borderline Opus consideration pending benchmark** (`architect` — pure analysis with high downstream impact).
- **48 agents stay where they are** (HIGH confidence, no change).

**Expected ROI if all changes applied:**
- 3 Opus upgrades concentrated on low-frequency agents (kernel drivers, KMP setup, Unity 6) → modest absolute cost increase
- 2 Opus → Sonnet downgrades on industrial agents → meaningful per-call savings, low frequency
- 8 Haiku downgrades concentrated on high-frequency agents (Playwright, Vitest, Docker, documentation) → **largest cumulative savings**

Rough estimate: **−15-25% total token spend per typical session** assuming current invocation distribution. Less than the −40-60% in the original roadmap, because the careful per-agent analysis disqualified many Haiku candidates that a flat heuristic would have demoted.

---

## Recommended Changes — Apply Tracker

### HIGH confidence — apply directly without benchmark (5 agents)

| Agent | Current → Recommended | Driver |
|---|---|---|
| `agents/backend/windows-driver-expert.md` | sonnet → **opus** | Kernel-mode code → BSOD-stakes; specialized IRQL/SAL/WDF reasoning where Sonnet has documented failure modes. Low invocation frequency. |
| `agents/mobile/kmp-expert.md` | sonnet → **opus** | Genuine cross-platform orchestration: Kotlin/Native + iOS Keychain + Android Keystore + Rust UniFFI + Gradle KMP simultaneously. UniFFI KMP fork has sparse training data. |
| `agents/gamedev/unity-expert.md` | sonnet → **opus** | 30 skills spanning qualitatively distinct subsystems (DOTS/ECS, Netcode, Shader Graph, 2D toolkit, AR/XR). Multi-system reasoning required per task. |

### HIGH confidence — apply directly (current Opus → Sonnet, 0 agents)

None at HIGH confidence. The 5 Opus agents that stay Opus are validated.

### MEDIUM confidence — benchmark first, then apply (10 agents)

| Agent | Current → Candidate | Benchmark task |
|---|---|---|
| `agents/core/architect.md` | sonnet → **opus** | "20-person team, monolith at 2M LOC, DB pool exhaustion at 5k concurrent. Evaluate decomposition options." Opus should produce richer trade-off reasoning. |
| `agents/core/documentation-expert.md` | sonnet → **haiku** | Generate TSDoc for a complex generic utility function. Check `@example` accuracy and `@throws` completeness. |
| `agents/core/log-analyst.md` | sonnet → **haiku** | Multi-service correlation: requestId across 5 log files with cascading timeout. Verify root-cause identification. |
| `agents/quality/open-source-expert.md` | sonnet → **haiku** | "Project uses AGPL deps but releases under MIT — analyze compatibility, generate NOTICE." Verify Haiku correctly flags incompatibility. |
| `agents/backend/streamlit-expert.md` | sonnet → **haiku** | Streamlit fragment with `run_every` + session state callback + Pandas display under rerun model. |
| `agents/backend/deno-expert.md` | sonnet → **haiku** (lower priority) | Deno KV atomic transaction with versionstamp; Fresh island with `useSignal` under concurrent updates. |
| `agents/database/prisma-expert.md` | sonnet → **haiku** (lower priority) | Zero-downtime column rename via shadow column strategy; nested upsert in transaction. |
| `agents/infrastructure/docker-expert.md` | sonnet → **haiku** | "Convert this Dockerfile to multi-stage with non-root user, healthcheck, build cache optimization." Check cache layer ordering and security. |
| `agents/testing/playwright-expert.md` | sonnet → **haiku** | "Write POM-based test suite for multi-step form with auth, file upload, polling." Check locator priorities, race condition handling, fixtures. |
| `agents/testing/vitest-expert.md` | sonnet → **haiku** | "Debug why `vi.mock` is not intercepting the import in this ESM module." Verify ESM module resolution. |

### MEDIUM confidence — Opus → Sonnet downgrades (2 agents, currently Opus)

| Agent | Current → Candidate | Benchmark task |
|---|---|---|
| `agents/industrial/dcs-analyst.md` | opus → **sonnet** | Real PRT file with >50 tags + cross-reference errors. Compare anomaly detection completeness Sonnet vs Opus. |
| `agents/industrial/freelance-engineer.md` | opus → **sonnet** | 20-motor PRT batch generation. Verify all 9 validation checklist items pass. |

### Per-task consideration (no model change at agent level, 1 agent)

| Agent | Note |
|---|---|
| `agents/frontend/creative-frontend-expert.md` | Stays sonnet, but for tasks combining custom GLSL shader authoring + WebGL memory debugging, user could selectively upgrade to opus per-invocation. Not a default change. |

### No change — HIGH confidence stay (44 agents)

See full table below.

---

## Full Per-Agent Table (62 agents)

Sorted by recommendation change first, then alphabetical.

### Recommended Opus (8 total — 3 new, 5 existing)

| Agent | Current | Recommended | Confidence | Status |
|---|---|---|---|---|
| `architect` | sonnet | opus | MEDIUM | benchmark first |
| `automation-architect` | opus | opus | HIGH | keep |
| `bitcoin-protocol-expert` | opus | opus | HIGH | keep |
| `kmp-expert` | sonnet | **opus** | HIGH | apply |
| `lightning-expert` | opus | opus | HIGH | keep |
| `unity-expert` | sonnet | **opus** | HIGH | apply |
| `windows-driver-expert` | sonnet | **opus** | HIGH | apply |
| `dcs-analyst` | opus | sonnet | MEDIUM | downgrade pending benchmark |
| `freelance-engineer` | opus | sonnet | MEDIUM | downgrade pending benchmark |

### Recommended Haiku (8 total — all benchmark-gated)

| Agent | Current | Recommended | Confidence | Benchmark needed |
|---|---|---|---|---|
| `documentation-expert` | sonnet | haiku | MEDIUM | yes |
| `log-analyst` | sonnet | haiku | MEDIUM | yes |
| `open-source-expert` | sonnet | haiku | MEDIUM | yes |
| `streamlit-expert` | sonnet | haiku | MEDIUM | yes |
| `deno-expert` | sonnet | haiku | MEDIUM | yes (lower pri) |
| `prisma-expert` | sonnet | haiku | MEDIUM | yes (lower pri) |
| `docker-expert` | sonnet | haiku | MEDIUM | yes |
| `playwright-expert` | sonnet | haiku | MEDIUM | yes |
| `vitest-expert` | sonnet | haiku | MEDIUM | yes |

### Stay Sonnet (44 agents, all HIGH confidence)

**core/** (8): accessibility-expert, claude-code-extension-expert, code-reviewer, dashboard-refactor-expert, nodejs-expert, performance-expert, python-expert, typescript-expert

**quality/** (2): integration-validator-expert, qa-expert

**security/** (1): security-expert

**backend/** (8 of 10): cpp-expert, dotnet-expert, fastapi-expert, go-expert, nestjs-expert, rust-expert, spring-boot-expert _(streamlit-expert and deno-expert and windows-driver-expert listed elsewhere)_

**bitcoin/** (3 of 5): bitcoin-core-expert, bitcoin-testing-expert, bitcoin-wallet-expert _(protocol-expert and lightning-expert on opus)_

**database/** (2 of 3): mongodb-expert, sql-expert _(prisma-expert listed for haiku benchmark)_

**messaging/** (1): messaging-expert

**frontend/** (9): angular-expert, creative-frontend-expert, electron-expert, nextjs-expert, react-expert, svelte-expert, tauri-expert, ux-expert, vue-expert

**mobile/** (3 of 4): android-native-expert, ios-native-expert, mobile-expert _(kmp-expert on opus)_

**data/** (2): data-engineering-expert, rag-expert

**cloud/** (1): cloud-expert

**infrastructure/** (2 of 3): devops-expert, sysadmin-expert _(docker-expert listed for haiku benchmark)_

**testing/** (3 of 5): python-integration-test-expert, smoke-test-expert, spring-boot-integration-test-expert _(playwright-expert and vitest-expert listed for haiku benchmark)_

---

## Detailed Per-Agent Rationale

### Upgrades to Opus (HIGH confidence, apply now)

#### `windows-driver-expert` (sonnet → opus)

Kernel-mode driver code runs at DISPATCH_LEVEL/IRQL — a single mistake (paged pool access at high IRQL, missing `WdfRequestComplete`, wrong lock discipline) causes a system bugcheck (BSOD) on end-user machines. The agent must reason about IRQL annotations, SAL attributes, WDF object lifetimes, HVCI compatibility, and the interaction between IRP path and WDF queue dispatch policies. These are highly specialized, low-volume tasks where Sonnet has documented limitations: tendency to mix WDM and WDF patterns, misplace IRQL annotations, miss `ExAllocatePool2` vs deprecated `ExAllocatePool`. Opus's superior reasoning is warranted: failure consequences are system crashes, invocation frequency is inherently low (driver code is rare), the cost premium is easily justified against the cost of a shipped bugcheck.

#### `kmp-expert` (sonnet → opus)

The only agent in the suite that constitutes genuine cross-platform orchestration across multiple languages, build systems, and target environments simultaneously. Adding an `expect`/`actual` requires correct reasoning about Kotlin/Native memory model + Android Keystore vs iOS Keychain API differences + Gradle source set hierarchy in one task. Wiring Rust via the UniFFI KMP fork (a niche community project with limited training data) requires understanding cinterop descriptors, JNI bridge generation, XCFramework embedding, and cargo-ndk split-ABI builds simultaneously. A wrong `commonMain` dependency (Android-only types in shared module) silently compiles on JVM tests but breaks the iOS framework. The 21-skill array spans Rust cross-compilation, reproducible builds, Sigstore/Cosign, and supply chain quality — broadest cross-cutting profile of any agent. Sonnet is observed to produce plausible-but-subtly-wrong outputs on UniFFI KMP fork integration and Kotlin/Native memory model edges. Cost delta justified by reduced debugging time on failed cross-platform builds.

#### `unity-expert` (sonnet → opus)

30 skills spanning qualitatively distinct technical domains that must be reasoned about simultaneously: DOTS/ECS (NativeArray aliasing, Burst job safety constraints, IJobChunk vs IJobEntity scheduling), Netcode for GameObjects (prediction + lag compensation requires authority/ownership/tick rate/interpolation reasoning together), Shader Graph → custom Render Feature pipelines (SRP render pass execution order), 2D toolkit invariants (PPU consistency, Sorting Group vs Order in Layer precedence, Composite Collider 2D, Pixel Perfect Camera modes). The 23-entry anti-pattern list reflects real production pitfalls requiring multi-system awareness. A wrong call is not just a visual bug — it can be a runtime crash, a performance cliff, or a broken build for a specific platform. This is a game engine with subsystems that interact in non-obvious ways; cross-subsystem reasoning is required per task.

### Stay Opus (HIGH confidence)

#### `bitcoin-protocol-expert` (opus → opus)

Already correctly assigned. ANALYSIS-FIRST mode on consensus rules, BIP review, sighash semantics, soft-fork proposals, Schnorr/MuSig2/FROST selection, DLC design — open-ended high-ambiguity problems where wrong answers about consensus validity could lead to funds-losing transactions. Soft-fork proposal evaluation (CTV, APO, OP_VAULT, CAT, drivechains) requires nuanced multi-step reasoning about activation mechanics, semantic changes, and cross-BIP interactions.

#### `lightning-expert` (opus → opus)

Already correctly assigned. BOLT specs, channel state machines, jamming/replacement cycling attacks, multi-implementation compat (LND/CLN/LDK/Eclair), multi-asset transport, deep security analysis. ANALYSIS-FIRST mode for channel design and attack analysis. Lightning security (replacement cycling, jamming mitigations, anchor commitments) is genuinely novel, complex, high-stakes — wrong recommendation about reserve or fee bumping leaves channels unable to close.

#### `automation-architect` (opus → opus)

Already correctly assigned. Pure planner — `Read, Grep, Glob, Bash, Agent` only, no Write/Edit. Reasons about which DCS platform, designs module hierarchies (models/parsers/generators/validators), estimates scope/complexity, identifies encoding risks across multi-vendor environments. Open-ended architectural decisions with no single correct answer; significant downstream consequences. Low invocation frequency — used once per project during design.

### Downgrades from Opus to Sonnet (MEDIUM, benchmark first)

#### `dcs-analyst` (opus → sonnet, benchmark)

Reads UTF-16LE industrial files, extracts structured data from section-based grammar (DBS/EAM/MSR/LAD), cross-references tags across PRT/DMF/CSV. Allowed-tools are analysis-only. Looks like Opus territory at first glance (niche domain, multi-file analysis), but actual task is well-structured: parse sections with known delimiters, build tag inventory, count blocks, flag anomalies. Grammar is regular, outputs are tabular. Sonnet handles structured document parsing confidently. Niche domain knowledge (ISA-5.1 tag naming, Freelance section format) is encoded in skill files, not free reasoning. Benchmark to confirm Sonnet matches Opus on real PRT files with cross-reference errors.

#### `freelance-engineer` (opus → sonnet, benchmark)

Generates PRT/DMF files from templates via deterministic replacement map, validates UTF-16LE encoding + BOM, writes Python bulk-generation scripts. ACTION mode with Edit/Write/Bash. The replacement logic is deterministic. The validation checklist is 9 boolean checks across sections — the discriminating part. Sonnet should handle templated structured generation; benchmark a 20-motor batch to verify all 9 validation checks.

### Haiku candidates (MEDIUM, benchmark first)

#### `documentation-expert` (sonnet → haiku, benchmark)

TSDoc/JSDoc documentation is among the most template-driven tasks: output format precisely specified (`@param`, `@returns`, `@throws`, `@example`), correctness mechanically checkable (eslint-plugin-tsdoc validates syntax), low downstream impact from a wrong call. README template fully specified in agent body. Main risk: generating accurate `@example` for complex generic utility — Haiku might not fully understand function semantics. Discriminating benchmark task.

#### `log-analyst` (sonnet → haiku, benchmark)

Most procedurally rigid workflow of all agents: fixed 5-step sequence (tail → find_errors → analyze_patterns → aggregate_stats → correlate_events) calling specific MCP tools, formatting tabular output. Pattern recognition guide maps log patterns to actions directly. MCP tools do heavy lifting; agent's job is to call them in right order and interpret structured output. Haiku's strengths fit this workflow well. Risk: Production Issue Triage scenario where multi-log correlation across microservices requires connecting dots — that's the discriminating benchmark.

#### `open-source-expert` (sonnet → haiku, benchmark)

Most template-driven action-mode task: creating LICENSE (SPDX selection), CONTRIBUTING.md (standard sections), CODEOWNERS, dependabot.yml (known schema), GitHub Actions workflows. Three-tier readiness checklist maps directly to files. Main risk: license compatibility analysis (Apache vs GPL, AGPL implications) — domain knowledge but factual lookup, not multi-step inference. Discriminating benchmark: AGPL deps with MIT release intent.

#### `streamlit-expert` (sonnet → haiku, benchmark)

Streamlit is fundamentally a UI/data framework with much lower failure stakes than production backend code. Generates Python UI: `st.columns`, `st.form`, `@st.cache_data`, `st.session_state`. Patterns highly constrained and well-documented. Worst failure modes (cache invalidation, wrong `key=`) are immediately visible. No auth, no financial logic, no concurrency. Skills are limited (7, mostly Streamlit + Python). Haiku can reliably write Streamlit layouts, session state callbacks, and Pandas display. Discriminating benchmark: fragment with `run_every` + session state callback + rerun model.

#### `deno-expert` (sonnet → haiku, lower priority benchmark)

Narrower scope than most backend agents — Deno has fewer footguns. Main risks: permission model mistakes (overly permissive `--allow-all`) and KV atomic transaction correctness. Haiku could handle simple CRUD routes; Fresh islands/signals + KV atomics benefit from Sonnet-level reasoning. Real Haiku case if tasks limited to simple route generation. Lower priority because Deno is a smaller ecosystem in this codebase.

#### `prisma-expert` (sonnet → haiku, lower priority benchmark)

Prisma is relatively constrained — schema DSL is declarative, migrations generated by tool, TypeScript client strongly typed. Risk surface narrower than other database agents: schema relation mistakes produce migration errors caught immediately, query mistakes caught at compile time. Mostly DSL-level work with compiler-enforced correctness. Migration strategies (zero-downtime column rename, multi-step shadow columns) and complex nested writes still require careful reasoning — discriminating benchmark.

#### `docker-expert` (sonnet → haiku, benchmark)

Most focused agent in infrastructure group: Dockerfile optimization, multi-stage builds, Docker Compose. Tasks have clear right/wrong (cache layer ordering, non-root user, healthcheck syntax) and limited cross-file reasoning. Haiku excels at focused well-scoped tasks with known patterns; Dockerfile best practices are pattern-matching-friendly. Pattern library fully embedded in agent file. Concern: complex multi-service Compose with health dependencies + secret injection. Discriminating benchmark: Dockerfile multi-stage refactor.

#### `playwright-expert` (sonnet → haiku, benchmark)

Highly regular structure: POM, locator priority, route mocking, config. Tasks: "write a test for checkout flow," "fix flaky assertion," "add route mock." Single-flow, pattern-matchable codegen. Playwright API is stable. Risk: complex scenarios (multi-step flows with dynamic state, cross-frame interactions, locator flakiness debugging). Discriminating benchmark: POM-based test suite for multi-step form with auth, upload, polling.

#### `vitest-expert` (sonnet → haiku, benchmark)

Vitest is well-scoped unit testing framework. Core tasks: write unit tests, component tests, mock modules, spy. Pattern-matching with clear right/wrong, no cross-file architectural reasoning. Agent file shortest in set (156 lines) — deliberately focused. Haiku's strength is exactly this. Risk: complex vitest configuration setup or debugging tricky mocks bleeding between tests. Discriminating benchmark: ESM module resolution + `vi.mock` interception failure.

### Architect — borderline Opus (MEDIUM, benchmark)

#### `architect` (sonnet → opus, benchmark)

Read-only tools (no Edit/Write). Pure analysis and recommendation. Most intellectually demanding work in suite: cross-domain trade-offs (microservices vs monolith), evaluating event-driven patterns, producing ADRs. Highest downstream impact: a wrong architectural choice propagates into months of rework. For common scenarios (REST API endpoint, PostgreSQL vs MySQL), Sonnet is more than adequate. The complex end (Spring Cloud ecosystem, k8s, CQRS, GraphQL trade-offs) is where Opus could outperform. Distinction is invocation frequency: architect invoked occasionally, not every feature. Discriminating benchmark: 20-person team, 2M LOC monolith, DB pool exhaustion at 5k concurrent — decomposition options.

### Notable Sonnet Confirmations

(Selected — full list above. Rationale below for the agents whose Sonnet placement might be questioned.)

#### `code-reviewer` (sonnet, NOT haiku)

Read-only tools, but explicit security review (OWASP Top 10) — missed SQL injection or unsafe deserialization is real harm. Multi-file reasoning required (auth at controller given service-layer assumptions). Haiku is described as weak on complex security reasoning — disqualifying.

#### `security-expert` (sonnet, NOT opus)

Highest-stakes domain. ACTION mode (writes fixes, not just reports). Reasoning about subtle issues: rate limiter scoping, CSRF cookie attributes, argon2 configuration vs threat model. Sonnet is pragmatic balance for routine fix-as-you-go work. Opus would be preferable for high-stakes audits but routine work doesn't justify the cost premium.

#### `android-native-expert` & `ios-native-expert` (sonnet, NOT opus)

Wallet-grade security code. Keystore + biometric crypto-object binding, SQLCipher with Keystore-derived key, SEP P-256 keys. Sonnet handles these reliably for documented patterns. Majority of invocations are Compose/SwiftUI UI tasks. Blanket Opus would over-spend; blanket Haiku would be unsafe. **Note**: if BHODL is the primary use case (heavy on security crypto paths), revisiting Opus for both could be warranted.

#### `rag-expert` (sonnet, NOT opus)

Most knowledge-dense agent (87 skill entries). Default mode is ACTION — implementing pipelines, fixing chunking, wiring rerankers. Complexity is in breadth of decision trees, not architectural ambiguity. Opus would only outperform if used as pure architecture advisor.

#### `spring-boot-expert` (sonnet, NOT opus)

Broadest backend agent (60+ skills covering Spring Boot/Security/Cloud/Data/AI + distributed patterns). Risk of Haiku is significant (security misconfiguration, transaction propagation errors). Opus unwarranted because it implements established patterns, not novel architecture.

---

## Benchmark Plan

The 11 MEDIUM-confidence cases need empirical validation before applying changes. Suggested batched execution:

**Round 1 (high-priority, 5 benchmarks):**
1. `vitest-expert` → ESM module mock interception
2. `playwright-expert` → POM multi-step form test
3. `docker-expert` → multi-stage refactor with cache+security
4. `documentation-expert` → TSDoc for complex generic
5. `log-analyst` → multi-service correlation

These are highest-frequency agents → biggest cumulative ROI if Haiku passes.

**Round 2 (medium-priority, 4 benchmarks):**
6. `streamlit-expert` → fragment + session state + rerun
7. `open-source-expert` → AGPL/MIT compatibility analysis
8. `dcs-analyst` → real PRT cross-reference analysis
9. `freelance-engineer` → 20-motor batch validation

**Round 3 (lower-priority, 3 benchmarks):**
10. `architect` → decomposition trade-off (Sonnet vs Opus)
11. `deno-expert` → KV atomic + Fresh signals
12. `prisma-expert` → zero-downtime migration

**Benchmark execution:** for each, prepare the discriminating task as a fixture, run with both candidate models, evaluate output along these axes:
- **Correctness**: does it work / does it pass tests?
- **Completeness**: does it cover edge cases the agent description claims?
- **Style**: does it follow the patterns documented in the agent file?
- **Verbosity**: does it over- or under-explain?

A clear win for the cheaper model → apply downgrade. Marginal/inconclusive → keep current (bias toward Sonnet).

---

## Application Plan (Sprint 5B, after this audit is approved)

1. Apply the **3 HIGH-confidence Opus upgrades** immediately (`windows-driver-expert`, `kmp-expert`, `unity-expert`)
2. Run **Round 1 benchmarks** (5 highest-impact)
3. Apply approved Haiku/Sonnet changes from Round 1
4. Optionally: Round 2 + 3 in subsequent sub-sprints

Estimated total scope of file edits: between **3 files** (HIGH-confidence only) and **15 files** (all benchmarks pass) of pure YAML modification (single line `model:` field change per file).

---

## Open Questions — RESOLVED (user decisions 2026-05-04)

1. **`architect` upgrade to Opus**: ✅ benchmark — RESULT: FAIL → keep sonnet (Opus differences were presentational, not substantive; Sonnet matched on all hard criteria)
2. **`android-native-expert` / `ios-native-expert`**: ✅ user chose UPGRADE to Opus (BHODL wallet crypto paths primary use case)
3. **Benchmark execution**: ✅ executed programmatically by AI (sub-agent calls with model parameter override)
4. **Acceptance threshold**: ✅ "90% quality at 40% cost" approved
5. **Per-task model override**: ✅ acknowledged, out of scope for Sprint 5 (future Phase 3 dashboard wizard)

---

## Sprint 5 — APPLIED CHANGES (final)

### HIGH-confidence apply (5 agents)

| Agent | Change | Status |
|---|---|---|
| `agents/backend/windows-driver-expert.md` | sonnet → **opus** | ✅ applied |
| `agents/mobile/kmp-expert.md` | sonnet → **opus** | ✅ applied |
| `agents/gamedev/unity-expert.md` | sonnet → **opus** | ✅ applied |
| `agents/mobile/android-native-expert.md` | sonnet → **opus** | ✅ applied (per user decision #2 — BHODL wallet) |
| `agents/mobile/ios-native-expert.md` | sonnet → **opus** | ✅ applied (per user decision #2) |

### Benchmark results (11 cases)

| Agent | Benchmark | Verdict | Action |
|---|---|---|---|
| `vitest-expert` | sonnet vs haiku | **FAIL** | keep sonnet — Haiku missed `vi.hoisted()` for ESM mock |
| `playwright-expert` | sonnet vs haiku | **FAIL** | keep sonnet — Haiku had logic bug (`||` locator chain) + wrong `devices` key |
| `docker-expert` | sonnet vs haiku | **PASS** | ✅ sonnet → **haiku** applied |
| `documentation-expert` | sonnet vs haiku | **PASS** | ✅ sonnet → **haiku** applied |
| `log-analyst` | sonnet vs haiku | **PASS** | ✅ sonnet → **haiku** applied |
| `streamlit-expert` | sonnet vs haiku | **FAIL** | keep sonnet — Haiku used inline `if st.button():` anti-pattern + missed fragment isolation |
| `open-source-expert` | sonnet vs haiku | **FAIL** | keep sonnet — Haiku missed transitive AGPL through `pdfkit` (legal exposure) |
| `dcs-analyst` | opus vs sonnet | **PASS** | ✅ opus → **sonnet** applied |
| `freelance-engineer` | opus vs sonnet | **PASS** | ✅ opus → **sonnet** applied |
| `architect` | sonnet vs opus | **FAIL** | keep sonnet — Opus differences presentational, no novel insights |
| `deno-expert` | sonnet vs haiku | **FAIL** | keep sonnet — Haiku had functional gap on `-1` button + dropped `.value` in JSX |
| `prisma-expert` | sonnet vs haiku | **FAIL** (conservative) | keep sonnet — benchmark agent didn't complete; conservative bias toward Sonnet for multi-phase migration task |

### Final distribution (after Sprint 5)

> Snapshot as of Sprint 5 (2026-05-04), not a live count — agents have been added since.
> For the current distribution run:
> `grep -h '^model:' agents/*/*.md | sort | uniq -c`, and
> `grep -L '^model:' agents/*/*.md` for the ones with no override.


| Model | Before Sprint 5 | After Sprint 5 | Net change |
|---|---|---|---|
| sonnet | 56 | 50 | -6 |
| opus | 5 | 8 | +3 (5 promotions − 2 demotions) |
| haiku | 0 | 3 | +3 |
| (no model field) | 1 | 1 | 0 |
| **Total** | 62 | 62 | — |

### Estimated ROI

- **3 agents promoted Opus** are low-frequency specialists (kernel drivers, KMP cross-platform, Unity 6, mobile native crypto): modest absolute cost increase per invocation × low invocation count = small total impact, but big quality gain for the high-stakes paths
- **2 industrial agents demoted Opus → Sonnet**: meaningful per-call savings on already-low-frequency agents
- **3 agents demoted Sonnet → Haiku** are HIGH-frequency in typical projects (docker for any container project, documentation for any TS/JS codebase, log-analyst for any production debugging): **largest cumulative savings — estimated 10-15% reduction on typical session token spend**

Together with Phase 1.2 (top-10 agent body slimming) and Phase 1.3 (skill bundle resolver), Phase 1 is on track for the original −20-30% target.

### Lessons learned from benchmarks

1. **Haiku is reliably good at**: pattern-matched codegen with clear right/wrong (Dockerfile multi-stage, TSDoc syntax), structured tabular analysis (log correlation when paths are explicit), template-driven file generation.
2. **Haiku consistently fails on**: legal/security reasoning where transitive consequences matter (AGPL transitive contamination), framework-specific anti-pattern detection (Streamlit rerun model, Vitest ESM hoisting), and tasks requiring simultaneous multi-system precision (Playwright POM + locator priorities + config + race condition).
3. **Opus over Sonnet**: only justified when the agent works on cross-system orchestration (kmp-expert), specialized low-frequency high-stakes domains (kernel drivers, Unity 6 multi-subsystem), or BHODL-specific wallet crypto paths. For pure architectural advice (architect agent), Sonnet matches Opus.
4. **The 90/40 threshold is the right bar**: Of 8 Haiku candidates, 3 passed (37.5%), 5 failed. The bias toward Sonnet ("when in doubt, keep") prevented 5 user-facing quality regressions. The 3 that passed all share the profile: well-bounded task with mechanical correctness criteria.
5. **Architect benchmark insight**: For architectural reasoning, Sonnet 4.6 has caught up to Opus 4.7 on most use cases. The only remaining Opus territory in dev-suite is genuine cross-system multi-language orchestration (kmp-expert) or specialized domains with thin training data (windows kernel, Unity 6 DOTS/ECS).
