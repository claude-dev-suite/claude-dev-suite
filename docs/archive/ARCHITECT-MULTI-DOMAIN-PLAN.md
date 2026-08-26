# Architect Multi-Domain Plan

> **Status: ARCHIVED — implemented.** The architect agent carries the `systems/*` and
> `ai-systems/*` skill families today, and the install-time frontmatter transform of §4.2
> shipped. The banner below said "not yet implemented" while the document's own log
> recorded the work as done; it is kept for the analysis, not as a plan.
> The one item still open is the P2 knowledge-base fill for the thinner domains.
> **Author:** investigation 2026-06-01.
> **Scope:** make the `architect` agent competent across many architecture
> families (not just web/enterprise), by decoupling skills from the agent via
> dev-suite's *existing* lazy-loading infrastructure, plus filling the
> knowledge base for the missing domains.

This document consolidates the analysis behind broadening the `architect`
agent. It is the single source of truth for the work; implement in the phase
order of §8.

---

## 1. Problem statement

`agents/core/architect.md` is heavily biased toward web/enterprise-Java/cloud
architectures and cannot reason about lower-level or non-web systems.

Evidence (verified against the file):

- **Body patterns** are only: Monolith, Microservices, Serverless,
  Event-Driven, CQRS, Clean/Hexagonal — all distributed/web/enterprise.
- **18 static skills**, all web/enterprise: `spring-cloud-*` (gateway, config,
  eureka, openfeign, circuitbreaker), `spring-modulith`, `spring-graphql`,
  `spring-data-jpa`, `prisma`, `rest-api`, `graphql`, `docker`, `kubernetes`.
- The skill **catalog itself lacks** low-level/systems content:
  `skills/architecture` = `ddd, event-sourcing-cqrs, multitenancy`;
  `skills/network` = `arti, rustls`; `skills/real-time` = `socket-io, sse,
  webrtc`; `skills/infrastructure` = ops/devops, not system design.

The user's goal: have the architect **adapt its skills dynamically** to the
request (so context isn't statically bloated), and gain competence in
**low-level / systems / AI-integrated** architectures.

---

## 2. Platform mechanics (Claude Code) — verified

From the official docs ([Skills](https://code.claude.com/docs/en/skills),
[Subagents](https://code.claude.com/docs/en/sub-agents)):

- **Main thread:** skill *descriptions* are in context; the *body* loads only
  when used (progressive disclosure).
- **Subagents are different:** preloaded skills are **injected in full at
  startup**. Subagents **do not inherit** skills — they must be declared.
- Skills resolve **by directory name** under `.claude/skills/`.
- `disable-model-invocation: true` also prevents a skill from being preloaded
  into a subagent.

**Implication:** for a subagent like `architect`, native progressive
disclosure does *not* apply to its declared skills — they would be static,
heavy context. This **validates** the concern at the platform level, and is
exactly why dev-suite already built `skill-loader`.

---

## 3. What dev-suite ALREADY has (do not rebuild)

The dynamic/lazy skill system the user envisions is **largely already
implemented** (token-optimization roadmap, Phase 3, May 2026):

| Component | State | What it does |
|---|---|---|
| **`skill-loader` MCP** | ✅ exists | `list_skills` (category/search/pagination), `load_skill`, `load_quick_ref` over ~700 skills; 5-min cache; path-traversal safe |
| **Lazy mode** | ✅ default when `skill-loader` is installed | Splits an agent's skills into **core** (preloaded as `.claude/skills/<flat>/`) + **extended** (on-demand via MCP) |
| **Tiered frontmatter** | ✅ `core_skills:` / `extended_skills:` | Explicit tiering; legacy `skills:` caps the first **3** as core (`LEGACY_SKILLS_CORE_CAP`), the rest become extended |

**Key correction to the original premise:** `skill-loader` does **not** analyze
the prompt. **The model (Claude) is the selector** — it reads the index and
decides what to `load_skill`. A separate NLP "prompt classifier" would be
**redundant**, add latency and a failure point, and be less flexible than the
model's own judgment.

---

## 4. Current state of the architect — verified by P0 (2026-06-01)

P0 ran the **production install-time functions** (`parseAgentSkillsStructured`,
`flattenSkillName`) against `agents/core/architect.md` and cross-checked Claude
Code's documented subagent semantics.

1. **Preloaded skills are BROKEN (0 of 19 reach the architect).** The installer
   copies the agent **verbatim** (`installation.service.ts:796`), so the
   installed `.claude/agents/architect.md` keeps path-style entries like
   `best-practices/clean-code`. But Claude Code's native subagent `skills:`
   field expects the **directory name verbatim**, and dev-suite installs the
   skill under the **flattened** dir `best-practices-clean-code`
   (`flattenSkillName` turns `/` → `-`). **Probe result: 3/3 core skills
   mismatch their installed dir name.** Per the docs, a `skills:` entry that
   doesn't resolve is **silently skipped (debug-log warning only)** → the
   architect starts with **zero preloaded skills**.
   - Tiering observed: legacy `skills:` → **3 core** (best-practices/{token-optimization,clean-code,solid-principles}) + **16 extended** (all Spring Cloud / API / infra). None are preloaded due to the mismatch.
2. **Tool restriction is NOT applied — subagents inherit ALL tools (CONFIRMED
   live).** The frontmatter uses `allowed-tools:`, but Claude Code's subagent
   schema recognizes **`tools:`** (and `disallowedTools:`), *not* `allowed-tools`.
   **Live test:** a scratch subagent declaring `allowed-tools: Read` actually
   reported **~31 tools** (Write, Bash, WebSearch, Skill, MCP auth tools, …).
   So `allowed-tools` is **ignored** → `tools` treated as omitted → "inherits
   all tools". The architect's intended read-only 6-tool scope is a **no-op**.
   *(Silver lining: this means the architect CAN reach `Skill` + `skill-loader`
   at runtime — tool access is not the blocker; guidance + catalog are.)*
3. **`skill-loader` availability:** in a default install, lazy mode is on
   (`skill-loader` is `isDefault`), so `skill-loader` **is** added to `.mcp.json`
   (`installation.service.ts:281`). Combined with (2), the architect can likely
   *reach* `skill-loader` — but its **body never tells it to**, and the
   low-level/systems skills it would want **don't exist** in the catalog.

**Net (corrected):** the architect today runs **body-only** (no skills
preloaded — a real wiring bug, not just bloat), with **broader tool access than
its frontmatter implies**, and **no guidance + no catalog** to load non-web
domains. So the fix is both a **bug fix** (skill wiring) and a **capability**
expansion (de-bias + new domains).

### 4.1 Blast radius — this is fleet-wide, not architect-only
Quick scan of `agents/**/*.md`: **62 of 63** agents use `allowed-tools:` and
**0** use the native `tools:` field; only **4** grant `Skill`/`skill-loader`.
Both P0 issues therefore likely affect the **entire agent fleet**:
- **Skill preload mismatch** (path-style `skills:` vs flattened install dirs) →
  every legacy-frontmatter agent likely preloads **0** skills as a subagent.
- **`allowed-tools` is ignored — branch (b) CONFIRMED live.** A scratch
  subagent declaring `allowed-tools: Read` enumerated **~31 tools** (Write, Bash,
  WebSearch, Skill, MCP auth tools, …). So all 62 agents **silently inherit every
  tool** — their tool restrictions are a no-op. Real safety regression (e.g. the
  "read-only architect" can `Write`/`Bash`). **Fleet-wide P1 fix: migrate agent
  frontmatter from `allowed-tools:` to native `tools:`** (or enforce via
  `.claude/settings.json` permissions).

> **Live-test evidence (2026-06-01, Claude Code 2.1.158, scratch project):**
> - Skill skip: `[WARN] [Agent: arch-test] Warning: Skill 'best-practices/clean-code' specified in frontmatter was not found` — proves path-style names don't resolve against flattened install dirs (`best-practices-clean-code`).
> - Tool inheritance: a subagent with `allowed-tools: Read` reported ~31 tools — proves `allowed-tools` is not honored for subagents (native field is `tools:`).

### 4.2 Fleet-wide fix design (Option R — install-time transform) — ✅ IMPLEMENTED & e2e-VERIFIED (2026-06-01)

Decision (2026-06-01): fix both bugs at the **install boundary** by transforming
agent frontmatter when writing `.claude/agents/<id>.md`, leaving the 62 source
agents and dev-suite's parsers untouched.

**Status:** shipped on this branch. `toInstalledAgentContent` added to
`installation/file-operations.ts` (8 unit tests); wired into both
`installAgent` (eager) and `installAgentLazy` via a shared `installSkillFlat`
helper (skills now flat in both modes); full server suite green (1849 tests).
**Live e2e (Claude Code 2.1.158):** the transformed architect was restricted to
exactly its declared tools (Read/Grep/Glob/WebSearch/Skill + its MCP tools — no
longer ~31 inherited), preloaded its 3 core skills with **zero** "not found"
warnings, and connected to `documentation`/`api-explorer`/`skill-loader` at
runtime. CHANGELOG `[Unreleased]` + CLAUDE.md test list updated.

**Platform facts established by live tests (Claude Code 2.1.158):**
- `tools: Read` (native) **does** restrict a subagent to exactly that set.
- A subagent gets MCP access via the **`mcpServers:` frontmatter field** — proven
  by a subagent with `mcpServers: [documentation]` successfully *calling*
  `mcp__documentation__list_docs` (488 techs). The `mcp__x__*` wildcard in
  `tools:` **alone** did **not** grant access.
- Skills resolve by **top-level directory name** under `.claude/skills/`.

**Current install shapes (both wrong for Claude Code subagent resolution):**
- Lazy path: skills installed as **flat** dirs (`flattenSkillName`); agent copied
  verbatim (path-style `skills:`) → preload skip.
- Eager path (`installation.service.ts:724`): skills installed at **nested** paths
  (`.claude/skills/best-practices/clean-code/`); agent copied verbatim → also
  won't resolve as a top-level skill name.

**Transform spec — `toInstalledAgentContent(content, opts)`** (new util in
`installation/file-operations.ts`):
1. `allowed-tools: <csv>` → **`tools: <csv>`** (rename key; keep non-MCP tools +
   keep `mcp__server__*` entries in the allowlist).
2. Derive **`mcpServers:`** YAML list from the `mcp__<server>__*` entries (reuse
   the regex already in `agents.service.ts:274`) + add `skill-loader` in lazy
   mode. *(This is what actually grants MCP access.)*
3. Replace `skills:` / `core_skills:` / `extended_skills:` with a single
   **`skills:`** list of the **flat dir names** of the skills installed locally
   (core in lazy, all in eager). Omit if none.
4. Grant the **`Skill`** tool when runtime skill loading is intended (lazy).

**Install-path changes:**
- Unify skill install dirs to **flat** names in BOTH modes (eager path switches
  from nested copy to `flattenSkillName`, matching lazy).
- Replace the two `fs.copyFileSync(agentFile, destPath)` calls (eager ~702, lazy
  ~796) with read → `toInstalledAgentContent(...)` → write.

**Files:** `installation/file-operations.ts` (new util), `installation.service.ts`
(both `installAgent` + `installAgentLazy`), `installation.service.test.ts` (update
skill-path assertions nested→flat; add transform tests). Source agents, CLAUDE.md,
`agents.service.ts`, validators, generator: **unchanged** (they keep reading
source `allowed-tools`). Optional follow-up: update `agent-generation-prompts.ts`.

> Scope note: this B fix makes each agent's declared **core** skills actually
> preload + tool restrictions actually apply. The deeper "preload vs lazy runtime
> loading to minimize context" tuning and the architect body's *Domain routing*
> guidance are part **A** (architect multi-domain), layered on top.

---

## 5. Proposal triage — redundant vs. real

| Part of the request | Verdict |
|---|---|
| Build a system that "analyzes the prompt and loads skills" | 🔴 **Redundant** — the dynamic mechanism exists; the selector is already the LLM |
| Decouple agent ↔ skills to avoid static context bloat | 🟢 **Real & already supported** — but the architect isn't wired to it |
| Make the architect competent in low-level / systems / AI architectures | 🟢 **Real & missing** — a **content** problem (new skills + KB) + **body de-bias**, not new infrastructure |

**Real optimization verdict:** the win is *configuration + content*, not a new
engine. (a) wire the architect to `skill-loader`, (b) shrink the static
footprint, (c) instruct the body to do on-demand discovery, (d) populate the
missing domains. If injection happens today, slimming saves tens of K tokens
per spawn; if skills are orphaned, the bigger win is **capability/correctness**.

---

## 6. Architecture domain map

**Legend:** 🟢 covered · 🟡 partial / implementation-only · 🔴 absent

### 6.1 Already covered
- App / enterprise: Monolith, Microservices, Serverless, Event-Driven, CQRS,
  Hexagonal, DDD, Event-Sourcing, Multitenancy — 🟢 (the architect's strength).

### 6.2 Low-level / systems (pack `systems/`)
| Domain | State | Notes |
|---|---|---|
| OS / kernel (monolithic/microkernel/hybrid/unikernel, scheduler, memory mgmt, IPC, syscall/ABI, interrupts) | 🔴 | |
| Embedded / firmware / RTOS (FreeRTOS/Zephyr, RMS/EDF, WCET, priority inversion, power) | 🔴 | ties to `windows` driver skills only tangentially |
| Systems networking (kernel-bypass: DPDK/io_uring/eBPF/XDP, zero-copy, congestion control, C10M) | 🔴 | `network` = arti, rustls (libs) |
| Storage-engine internals (B-tree vs LSM, WAL, buffer pool, MVCC, fsync, compaction) | 🔴 | |
| Distributed systems / consensus (Raft/Paxos/BFT, quorum, clock sync, CAP/PACELC, gossip) | 🟡 | `bitcoin` is deep but **Bitcoin-specific**; generalize |
| Virtualization (hypervisor type 1/2, namespaces/cgroups, VMM) | 🔴 | |
| Hardware-aware design (cache hierarchy, SIMD, NUMA, GPU, lock-free/coherence) | 🔴 | |

### 6.3 AI-integrated systems (pack `ai-systems/`)
dev-suite is strong at the **app/data** layer, weak at the **system/hardware**
layer.

| Layer | State |
|---|---|
| App/data (RAG, embeddings 8, vector-stores 14, retrieval, langchain/anthropic) | 🟢 |
| Serving-ops (`rag-ops`: batch-inference, llm-gateway, multi-region, tei-triton-serving, cost-allocation) | 🟡 |
| Edge / on-device inference | 🔴 |
| Inference serving **topology** (vLLM/SGLang/TensorRT-LLM, Triton, KServe, Ray Serve; KV-cache; prefill-decode disaggregation) | 🔴 (only narrow tei-triton-serving) |
| AI hardware selection (GPU/TPU/NPU/FPGA, TOPS, memory bandwidth, cost/Watt) | 🔴 |
| Hybrid edge↔cloud (local-first + escalation, cascading) | 🔴 |
| Model gateway / routing (multi-provider, fallback, cost/latency) | 🟡 (`llm-gateway` is ops-level) |
| Agentic architecture (orchestration topologies, memory, tool layer, HITL) | 🟡 (partial via langchain) |

**Product spectrum (homemade → enterprise)** the architect should reason over:
- **Homemade:** RPi+Coral, mini-PC NPU, ESP32/MCU+NPU, llama.cpp/Ollama, TinyML
  → on-device single-node, quantized small LLMs (Llama 3.1 8B, Qwen2.5 7B).
- **Prosumer/SMB:** Jetson Orin/Thor, 1×GPU, Hailo-10H → client-server + local
  RAG, optional local-first + cloud fallback.
- **Startup/mid:** multi-GPU, vLLM/TGI/SGLang + model gateway (LiteLLM/Envoy AI
  GW) + agentic → multi-model serving + routing.
- **Enterprise:** KServe/Ray Serve on K8s (+KEDA/llm-d), Triton as production
  shell, eval/observability, fine-tuning pipelines → 3-layer (engine → serving
  → orchestration), prefill-decode disaggregation, multi-region, governance.

### 6.4 Additional families worth adding
| # | Family | State | Priority |
|---|---|---|---|
| 10 | **Data-intensive** (warehouse vs lakehouse, OLTP/OLAP, lambda/kappa, CDC, data mesh, batch vs streaming) | 🔴 (`data` = etl-pipelines only) | ⭐⭐⭐ |
| 12 | **System security architecture** (threat modeling, secure-by-design, zero-trust, TEE/enclaves, secure boot) | 🟡 (`security` app-level) | ⭐⭐⭐ |
| 11 | **Safety-critical / functional safety** (DO-178C, ISO 26262, IEC 62304, AUTOSAR, redundancy/TMR, formal methods) | 🔴 | ⭐⭐ |
| 13 | **HPC / parallel** (MPI, CUDA compute, simulation, supercomputing) | 🔴 | ⭐ |
| 14 | **Network / telecom** (SDN/NFV, 5G/RAN, CDN, mesh/P2P, protocol design) | 🔴 | ⭐ |
| 15 | **Compiler / language runtime / VM** (GC, JIT, bytecode VM, interpreters) | 🔴 | ⭐ |
| 16 | **Cyber-physical / ICS-SCADA** | 🟡 (`industrial`: PLC/DCS/ISA + `automation-architect` agent) | ⭐ (generalize) |
| 17 | **Distributed-ledger (general)** (PoW/PoS/BFT, L1/L2, rollups, state channels) | 🟡 (`bitcoin` deep but specific) | ⭐ (generalize) |
| 18 | **Game-engine architecture** (ECS, render pipeline, netcode, physics loop) | 🟡 (`gamedev`/`unity`-specific) | ⭐ (abstract) |

### 6.5 Out of scope (for now)
FPGA/ASIC/RTL chip design, quantum computing → niche/future. Do **not**
re-implement already-covered implementation skills (RAG, vector stores,
messaging, Windows drivers, Unity) — new skills live at the architect's
**decision** level (which topology / which trade-off), not implementation.

### 6.6 Recommended scope
Core new coverage: **all of §6.2** + **§6.3 AI-systems** + **#10 data-intensive**
+ **#12 system security**. Generalize: #16, #17, #18. Optional later: #11, #13,
#14, #15.

---

## 7. Proposed skill packs

New skill directories under `skills/` (dev-suite layout
`skills/{category}/{tech}/SKILL.md` + optional `quick-ref/`):

**`systems/`** — `os-kernel-architecture`, `embedded-rtos`,
`systems-networking`, `storage-engines`, `distributed-consensus`,
`virtualization`, `hardware-aware-design`, `data-intensive`,
`security-architecture` *(+ optional: `safety-critical`, `hpc`,
`network-telecom`, `compiler-runtime`)*

**`ai-systems/`** — `edge-inference`, `inference-serving-topology`,
`hybrid-edge-cloud`, `ai-hardware-selection`, `model-gateway-routing`,
`agentic-architecture`

Each SKILL.md stays at the **architect altitude** (decision drivers, options,
trade-offs, when-to-use), with deep material pushed to `quick-ref/` and the KB
(§8).

---

## 8. Knowledge-base filling — per dev-suite architecture

dev-suite's loose-coupling chain (from CLAUDE.md):

```
Agent frontmatter ──declares──▶ Skills (SKILL.md + quick-ref/)
                                   │ reference
                                   ▼
                         KB deep-dive articles  ◀──fetched on-demand (2h cache)
                         (REMOTE repo only)          by the `documentation` MCP
                                   ▲
                                   │ cataloged by
                         docs-index/ (in THIS repo)
```

### 8.1 Where content lives (critical rule)
KB **content** lives ONLY in the separate repo
`github.com/claude-dev-suite/knowledge_base`, under
`knowledge/{technology}/{topic}.md`. It must **never** be committed inside this
repo. The `documentation` MCP fetches it on demand. This repo only holds the
**catalog** (`docs-index/`).

### 8.2 The catalog wiring (this repo)
For each new domain category, add a `docs-index/{category}.ts` file following
the schema in `docs-index/types.ts`:

```ts
// docs-index/systems.ts  (template)
import type { DocsRecord } from "./types.js";

export const SYSTEMS_TECHNOLOGIES = [
  "os-kernel-architecture",
  "embedded-rtos",
  "systems-networking",
  "storage-engines",
  "distributed-consensus",
  "virtualization",
  "hardware-aware-design",
  "data-intensive",
  "security-architecture",
] as const;

export const systemsDocs: DocsRecord = {
  "os-kernel-architecture": {
    "microkernel-vs-monolithic": {
      local: "os-kernel-architecture/microkernel-vs-monolithic.md",
      url: "https://<authoritative-source>",
    },
    "scheduler-design": { local: "os-kernel-architecture/scheduler-design.md", url: "…" },
    "virtual-memory":   { local: "os-kernel-architecture/virtual-memory.md",   url: "…" },
    "ipc-mechanisms":   { local: "os-kernel-architecture/ipc-mechanisms.md",   url: "…" },
    "interrupt-handling": { local: "os-kernel-architecture/interrupt-handling.md", url: "…" },
  },
  // …storage-engines: { "btree-vs-lsm": {…}, wal: {…}, mvcc: {…}, compaction: {…} }
  // …distributed-consensus: { raft: {…}, paxos: {…}, bft: {…}, "quorum-replication": {…} }
};
```

Then wire it into `docs-index/index.ts` in **5 places** (the existing pattern):
1. `import { SYSTEMS_TECHNOLOGIES, systemsDocs } from "./systems.js";`
2. matching `export { … } from "./systems.js";`
3. add `...SYSTEMS_TECHNOLOGIES` to `SUPPORTED_TECHNOLOGIES`
4. add `...systemsDocs` to `docsIndex`
5. add `systems: SYSTEMS_TECHNOLOGIES` to `CATEGORY_MAP`

Repeat with `ai-systems.ts` / `AI_SYSTEMS_TECHNOLOGIES` / `aiSystemsDocs` /
`CATEGORY_MAP["ai-systems"]`.

> `docs-index.ts` is only a re-export aggregator; real entries go in the
> category file. The MCP `documentation` server then exposes them via
> `list_docs(category)`, `list_topics`, `fetch_docs(technology, topic)`,
> `search_docs` — which is exactly what the architect's *Knowledge Base
> Protocol* calls.

### 8.3 Authoring procedure (per CLAUDE.md, summarized)
1. `git clone https://github.com/claude-dev-suite/knowledge_base.git /tmp/kb`
   (a temp path **outside** this repo).
2. Add `knowledge/{technology}/{topic}.md` for each cataloged topic.
3. Add/extend the matching `docs-index/{category}.ts` entry in **this** repo and
   wire `index.ts` (§8.2).
4. `cd /tmp/kb && git add . && git commit -m "add systems docs" && git push`.
5. `rm -rf /tmp/kb` immediately.
6. Verify no `knowledge/` folder exists in this repo.

### 8.4 Skill ↔ KB linkage
Each new SKILL.md `quick-ref/` references its KB topics by
`(technology, topic)` so the architect can `fetch_docs(...)` for depth. The
SKILL.md body stays compact (architect altitude); the KB carries the
deep-dive narrative. This keeps the loose coupling: agent → skill → KB.

---

## 9. Implementation phases (sequencing matters)

> **Wire first, populate second.** No matter how many skills/KB docs we add, the
> architect can't load them until §9-P1 is done.

- **P0 — Empirical verification.** ✅ **DONE 2026-06-01** (see §4). Ran the
  production install-time parser + `flattenSkillName` against the architect and
  cross-checked Claude Code subagent docs. Findings: (1) **0/19 skills preload**
  (path-style `skills:` entries don't match flattened install dirs → silently
  skipped); (2) `allowed-tools` is not a recognized subagent field → architect
  **likely inherits all tools**; (3) `skill-loader` is in `.mcp.json` by default
  but the body never uses it. **Live debug-log check DONE (2026-06-01):** a
  scratch subagent reproduced both — the `Skill '…/…' was not found` skip warning
  **and** ~31 inherited tools despite `allowed-tools: Read`. Both issues are now
  empirically proven, not inferred.
- **Workstream B — install-time native transform.** ✅ **DONE 2026-06-01**
  (commit `ecf0d13`). See §4.2 — fixes the platform-mapping bugs so tool limits
  and skill preload take effect. This is the "wire first" prerequisite.
- **P1 — Architect de-bias.** ✅ **DONE 2026-06-01** (commit `2b879f9`). Body
  rewritten with the "Step 0 — Domain routing" protocol; frontmatter moved to a
  domain-agnostic `core_skills:` + on-demand `extended_skills:`. (`skill-loader`
  is added at install by B's lazy transform; not hardcoded in source allowed-tools
  to avoid a dangling MCP entry in eager installs.)
- **P2 — Skill packs.** ✅ **DONE 2026-06-01** — `systems/` (commit `995558f`,
  7 skills) and `ai-systems/` (commit `5f66a15`, 6 skills) created, wired into
  the architect's `extended_skills` (all 35 architect skills now resolve; fixed a
  pre-existing `databases/prisma`→`orm-odm/prisma` mis-reference). **KB fill
  (§8) — PENDING** (see P2-KB below). data-intensive / system-security skills —
  PENDING (next batch).
- **P2-KB — Knowledge-base fill.** 🟡 **PREPARED, AWAITING EXTERNAL PUSH
  (2026-06-01).** In-repo: `docs-index/systems.ts` + `docs-index/ai-systems.ts`
  created and wired into `index.ts` (5-point pattern), one canonical topic per
  technology (15 total); documentation MCP builds clean. KB content: 15
  deep-dive articles authored and **committed locally** in a `knowledge_base`
  clone *outside* this repo (commit not pushed). **Coupling:** the in-repo
  docs-index references these `local` paths, so the KB commit must be pushed to
  `knowledge_base` before/with merge, or `fetch_docs` 404s for the new topics.
  Push is outward-facing → awaiting go-ahead. (More topics per technology can be
  added later.)
- **P3 — Generalize verticals.** ✅ **DONE 2026-06-01.** Engine-agnostic skills
  extracted: `systems/distributed-ledger` (from `bitcoin/*`),
  `systems/cyber-physical` (from `industrial/*`),
  `systems/game-engine-architecture` (from `gamedev/unity-*`). Wired into the
  architect + docs-index + KB (pushed to `knowledge_base`).
- **P4 — Optional families** (#11, #13, #14, #15) as use cases emerge.

---

## 10. Sources

Platform: [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) ·
[Claude Code Skills](https://code.claude.com/docs/en/skills) ·
[Subagents guide](https://www.tembo.io/blog/claude-code-subagents) ·
[Equipping agents with Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

Systems/low-level: [OS kernel overview](https://www.sciencedirect.com/topics/computer-science/operating-system-kernel) ·
[Real-time systems](https://www.embeddedrelated.com/Documents/Real-Time_Systems__Architecture__Scheduling__and_Application.pdf) ·
[Composable OS kernel architectures](https://arxiv.org/pdf/2508.00604) ·
[DREMS-OS](https://arxiv.org/pdf/1710.00268)

AI systems: [Edge AI hardware 2026](https://www.stanfordtechreview.com/articles/edge-ai-hardware-and-on-device-inference-in-silicon-valley-2026) ·
[Best edge LLMs 2026](https://www.siliconflow.com/articles/en/best-LLMs-for-real-time-inference-on-edge) ·
[vLLM + Triton 2026](https://techbytes.app/posts/vllm-and-triton-for-llm-inference-deep-dive-2026/) ·
[vLLM vs Triton vs KServe](https://www.kubenatives.com/p/vllm-vs-triton-vs-kserve-kubernetes) ·
[Ray Serve architecture](https://docs.ray.io/en/latest/serve/llm/architecture/overview.html)
