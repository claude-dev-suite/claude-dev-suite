# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **`cpp-expert` agent** under `agents/backend/` — modern C++ (C++17/20/23) generalist:
  RAII, move semantics, smart pointers, concepts, ranges, `std::expected`, `std::span`,
  coroutines, modules. CMake (presets, FetchContent, vcpkg/Conan), Google Test + Google Mock,
  clang-tidy / clang-format, and the sanitizer suite (ASan/UBSan/TSan/MSan). Designed to
  be useful as a standalone agent for any C++ work, and to be cross-loaded by other
  systems agents (e.g. `windows-driver-expert`).

- **5 supporting C++ skills**:
  - `skills/languages/cpp/SKILL.md` — modern C++ language and STL quick reference
  - `skills/build-tools/cmake/SKILL.md` — modern CMake (target-centric, presets, packaging)
  - `skills/testing/googletest/SKILL.md` — GTest + GMock (fixtures, parameterized,
    typed tests, mock interfaces, CMake `gtest_discover_tests`)
  - `skills/quality/cpp-quality/SKILL.md` — clang-tidy, clang-format, cppcheck, IWYU,
    CI integration
  - `skills/security/cpp-security/SKILL.md` — sanitizers, MSVC `/sdl` and `/guard:cf`,
    Linux/GCC hardening flags, CERT C++ patterns, fuzzing harness template

- **`windows-driver-expert` agent** under `agents/backend/` — Windows kernel and
  user-mode driver specialist (WDF / KMDF / UMDF). Covers HID stack and filter drivers
  (mouse / keyboard / touch / pen), Indirect Display Drivers (IDD) for virtual
  monitors with network streaming, IRP/IOCTL handling, IRQL discipline, the WDK
  toolchain, WinDbg with KDNET, Driver Verifier, Static Driver Verifier (SDV), WDK
  CodeQL queries, EV-cert + attestation signing, and HLK/WHQL submissions. Cross-loads
  the C++ skills and the new `windows/*` skills below.

- **6 new Windows driver skills** under `skills/windows/`:
  - `wdf-kmdf` — KMDF: DriverEntry, EvtDeviceAdd, IRPs, IOCTLs, queues, IRQL,
    pool allocation (`ExAllocatePool2`), WPP tracing, SAL annotations, PnP/Power
    callbacks, synchronization primitives
  - `wdf-umdf` — UMDF v2 in `WUDFHost.exe`: differences vs. KMDF, when to use it,
    INF entries, reflector, debugging, companion-driver patterns
  - `hid-input-filter` — HID stack architecture (Hidusb / HIDClass / Mouclass /
    Kbdclass), filter placement (upper vs. lower), internal IOCTLs
    (`IOCTL_HID_READ_REPORT` etc.), report-completion interception and
    suppression, inverted-call delivery to user mode, Virtual HID Framework (VHF)
    for input injection
  - `indirect-display` — IDD framework (`IddCx`): adapter / monitor lifecycle,
    EDID generation, swap-chain processing loop (`AcquireBuffer` →
    `FinishedProcessingFrame`), GPU-staying frame pipelines, NVENC / Quick Sync /
    AMF encoding, low-latency network transports (Rivermax, RIST/SRT, RDMA), HDR,
    multi-monitor, hardware cursor
  - `driver-debugging` — WinDbg / WinDbg-Preview, KDNET kernel debugging setup,
    Driver Verifier, Application Verifier (UMDF), `!analyze -v` flow, common
    bugcheck cheatsheet, `!irp` / `!devstack` / `!wdfkd.*` commands, kernel
    dump configuration, WPP/ETW trace decoding (`tracefmt`, `wpr`, WPA)
  - `driver-signing` — EV code-signing certificates, Microsoft Hardware Dev
    Center attestation signing vs. WHQL/HLK certification, INF compliance with
    `infverif`, test-signing for development, the build → catalog → sign →
    submit flow, dual-signing notes, `signtool verify /kp` validation

- **Documentation MCP — index entries for the new C++ and Windows-driver
  technologies**:
  - `cpp` registered under the `languages` category
  - `cmake` and `cpp-quality` registered under the `tooling` category
  - `googletest` registered under the `testing` category
  - `cpp-security` registered under the `security` category
  - New **`windows-drivers`** category file
    `mcp-servers/documentation/src/docs-index/windows-drivers.ts` registering
    `wdf-kmdf`, `wdf-umdf`, `hid-input-filter`, `indirect-display`,
    `driver-debugging`, and `driver-signing` with canonical upstream URLs
    (Microsoft Learn `windows-hardware/drivers/...` pages and
    `microsoft/Windows-driver-samples` samples). The new category is wired into
    `docs-index/index.ts` (`SUPPORTED_TECHNOLOGIES`, `docsIndex`,
    `CATEGORY_MAP`). Phase B markdown content under `windows-drivers/<area>/<topic>.md`
    in the external `claude-dev-suite/knowledge_base` repo to follow.

### Architectural decision

Two-agent split (cpp-expert + windows-driver-expert) instead of one combined agent:
the C++ generalist is genuinely useful on its own (anyone writing modern C++
benefits), and the Windows driver specialist legitimately needs domain-specific
behavioral steering (IRQL discipline, DDI rules, signing flow, kernel
constraints) that would dilute a generic C++ agent. They cross-reference each
other through shared `cpp` / `cmake` / `cpp-quality` / `cpp-security` skills,
keeping authoritative guidance in one place per topic.

---

## [1.6.0] - 2026-05-01

### Added

- **10 engine-agnostic 2D game art skills** under `skills/gamedev/2d-art/`:
  - **`tile-design`** - autotiling math (Wang 4-bit, 16-bit, 47-tile, 256-tile blob), grid types (square/hex flat-top/hex pointy-top/staggered iso/true iso), terrain blending, transitional pieces, 9-slice rendering. Quick-refs: `wang-bitmask-table.md`, `blob-256-template.md`, `hex-flat-vs-pointy.md`.
  - **`pixel-art-fundamentals`** - resolution choice (160x144 GameBoy through 480x270 modern lo-fi), pixel-perfect display, anti-aliasing rules (selective AA on diagonals only), dithering (Bayer ordered, hand-placed checkerboard, when to dither vs not), outline philosophy (full / selective "selout" / inline / gradient), pixel hinting / sub-pixel rules, common mistakes (pillow shading, banding, jaggies, PSD-soft rendering). Quick-refs: `dithering-patterns.md`, `antialiasing-rules.md`.
  - **`palettes`** - color theory practical (warm/cool, complementary, analogous, triadic), restricted palettes ready-made (PICO-8, GameBoy DMG, DB16, DB32, AAP-64, Resurrect 64, NES, C64, Endesga 32, Sweetie 16), hue shifting (warm-cool ramps), color ramps (foliage, stone, skin, water, fire), palette swap conventions (character variants, faction colors, status effects, day/night), `.gpl/.pal/.ase/.json` formats, indexed mode workflow. Quick-refs: `lospec-recommended-palettes.md`, `hue-shift-recipes.md`.
  - **`seamless-textures`** - offset-and-paint trick, mirror techniques, repetition reduction (variant tiles + decoration overlays), transitional tiles (edge / corner / T-junction), normal map authoring (Sprite Lamp / Sprite DLight / Materialize / hand-paint), procedural + hand-pixel hybrid, specialized surfaces (roof / floor / wall / water / sky).
  - **`animation-frames`** - frame counts (idle 2-4f / walk 6-8f / run 6-8f / attack 4-6f), squash/stretch limits in pixel art, looping cycles, anticipation/impact/recovery beats, sub-pixel motion problem, sprite sheet layouts (Aseprite tags + JSON sidecar / TexturePacker / manual grid), per-frame easing. Quick-refs: `walk-cycle-keyframes.md`, `attack-anticipation.md`.
  - **`tools`** - Aseprite (de facto pixel art DCC), Tiled, LDtk, Tilesetter, Pixelorama, Spine / DragonBones (skeletal 2D), TexturePacker, Sprite Lamp / Sprite DLight (normal maps), PSD Importer / Aseprite Importer, Krita / Procreate / Photoshop. Quick-refs: `aseprite-shortcuts.md`, `ldtk-vs-tiled.md`, `aseprite-lua-scripting.md`.
  - **`lighting-art`** - workflow for Unity 2D Lights / Godot CanvasLight, normal map painting, sprite layer separation (diffuse / normal / emissive / mask), self-shadowing in pixel art, day/night palette swap vs realtime light mixing, glow / emissive layers, bloom interaction with pixel art.
  - **`vfx-2d`** - canonical frame patterns (smoke / fire / water / electricity / sparks / hit / explosion / heal), hitstop / hit pause durations, screen shake intensity curves and parameters, color flash, trail effects, procedural particles vs pre-baked frames, Vlambeer "Art of Screenshake" juice principles (squash / hitstop / flash / particles / shake / sound / trail / decal layering), decals.
  - **`environment-design`** - parallax planning (layer count, scroll-speed ratios, atmospheric perspective via palette desaturation), foreground/background composition, silhouette readability vs busy backgrounds, tile density and rhythm, environmental storytelling via tiles (worn paths, broken architecture, scorch marks), light direction consistency, mood palette mapping.
  - **`character-design`** - silhouette-first methodology with black-out test, character-to-tile size ratio, expressions in low resolution (eye / mouth pixel placement), anatomy shortcuts in pixel art, faction/role visual language (silhouette + palette identifying class), walk cycle conveying weight and attitude, player-vs-NPC distinction.

- **Documentation MCP - `gamedev-2d-art` category**: new file `mcp-servers/documentation/src/docs-index/gamedev-2d-art.ts` registering all 10 skills with canonical upstream links (Lospec, Aseprite docs, Vlambeer talk, Boris-the-Brave Wang tiles, Saint11 art tutorials, Unity URP 2D Lighting docs).

- **`unity-expert` agent updated**: cross-loads all 10 `gamedev/2d-art/*` skills in addition to the existing 20 Unity-specific gamedev skills. Skills are engine-agnostic - when future Godot/Phaser/etc. agents are added they will load the same 2D art skills.

### Architectural decision

The 10 new skills are engine-agnostic and live under `skills/gamedev/2d-art/`
(parallel to the existing `skills/gamedev/unity-*` engine-specific skills).
Cross-loading onto `unity-expert` today; ready to attach to a future
`godot-expert` / `phaser-expert` without duplication. No new agent created
because the knowledge is purely instructional (no behavioral steering or
context-isolation justifying a dedicated agent).

---

## [1.5.0] - 2026-04-30

### Added

- **5 Bitcoin / Lightning / L2 domain agents** under `agents/bitcoin/`:
  - **`bitcoin-protocol-expert`** (opus) — consensus, transactions, scripts (P2PK→P2TR+Tapscript), SegWit, Taproot (BIP340/341/342), PSBT (BIP174/370/371), descriptors (BIP380-385), Miniscript, P2P (BIP155/152/157/158/324), package relay (BIP331), TRUC v3 (BIP431), message signing (BIP137/322), proposals (CTV/APO/OP_VAULT/CAT/drivechains), cryptography (secp256k1, ECDSA, Schnorr, BIP32, MuSig2 BIP327, FROST, adaptor signatures, DLCs), metaprotocols (Ordinals, Inscriptions, BRC-20, Runes, Atomicals).
  - **`bitcoin-core-expert`** — bitcoin.conf, JSON-RPC, REST, ZMQ, indexes (txindex/blockfilter/coinstats), pruning, descriptors wallet, signet, P2P configuration, Tor/I2P/CJDNS, Guix reproducible builds, Bitcoin Knots, integration with Electrs/Fulcrum/Esplora/mempool.space/BTCPay, self-hosted node distros (Umbrel/Start9/RaspiBlitz/MyNode/Citadel).
  - **`lightning-expert`** (opus) — full BOLT specs, channel state machines, HTLC mechanics, onion routing (Sphinx), gossip, watchtowers, splicing, taproot channels; LND/CLN/LDK/Eclair/Greenlight/phoenixd; BOLT12 offers, LNURL, Lightning Address, LSP (BLIPs), WebLN, NWC (NIP-47), UMA; Loop/Pool/Lit, submarine swaps via Boltz; security (replacement cycling 2023, channel jamming, pinning, anchor outputs); multi-asset over LN (Taproot Assets v0.7, RGB-Lightning); consumer wallets matrix (Phoenix, Mutiny, Breez SDK, Zeus, Aqua, BlueWallet).
  - **`bitcoin-wallet-expert`** — HD wallets (BIP32/39/44/49/84/86), output descriptors, PSBT signing flows, multisig coordination (cross-vendor), time-locked vaults (CSV, OP_VAULT BIP345 proposal), coin selection (BnB / SRD / waste metric), fee estimation, RBF/CPFP, hardware wallet integration (Trezor, Ledger, Coldcard Mk4/Q, BitBox02, Jade, Foundation Passport, SeedSigner, Krux, Keystone, Specter DIY, HWI), privacy (CoinJoin Wabisabi/Whirlpool/JoinMarket, PayJoin BIP78, Silent Payments BIP352, BIP47 PayNyms), payment standards (BIP21, BIP329 labels, BIP85 entropy, SLIP-39 Shamir, SeedQR).
  - **`bitcoin-testing-expert`** — regtest, signet (incl. **Mutinynet** with 30-second blocks for fast LN dev), Polar (LN regtest GUI), Nigiri (full stack regtest with Esplora), Bitcoin Core's Python functional test framework, fuzzing (libFuzzer harnesses + cargo-fuzz on rust-bitcoin/bdk/secp256k1), property-based testing (proptest, hypothesis).

- **Bitcoin skills tree** under `skills/bitcoin/` covering protocol, cryptography, wallets, Bitcoin Core, Lightning (protocol + impl + app + security + consumer-wallets), L2 (statechains/Ark/Spark/Liquid/Taproot Assets/RGB/Counterparty/Stacks/Rootstock/Fedimint/Cashu/Citrea/Strata/BSquared/Bitlayer/Merlin/Botanix/BOB/Hemi/MAP/Babylon/BitVM/threshold-tBTC/drivechains-spacechains), metaprotocols (Ordinals/Inscriptions/BRC-20/Runes/Atomicals), privacy (CoinJoin/PayJoin/Silent Payments/stealth/Tor/BIP47/Dandelion/p2p-exchanges/atomic-swaps), mining (PoW/difficulty/Stratum V1/V2/pool architectures/decentralized pools/firmware), hardware (13 vendors + DIY signers + HWI + PSBT flows + multi-vendor multisig), infrastructure (Electrs/Fulcrum/Esplora/mempool.space/BTCPay/Specter/Sparrow/Electrum/BlueWallet/Caravan/node-distros), testing (regtest/signet/Polar/Nigiri/core-test-framework/fuzz/property-based), and libraries across Rust (rust-bitcoin, BDK, LDK, miniscript-rs, rust-secp256k1, rust-dlc), TypeScript/JS (bitcoinjs-lib, @scure/btc-signer, mempool.js, bcoin, bolt11), Python (python-bitcoinlib, embit, bitcoinlib, hdwallet, bdkpython), Go (btcd, btcsuite, lnd-go, tapd-go), JVM (bitcoinj, bdk-jvm), .NET (NBitcoin), C (libsecp256k1, libwally, libbitcoin). Quick-ref subdirectories on the densest topics (scripts opcodes / output-types / Tapscript, transactions sighash / serialization / malleability / RBF-CPFP / v3-TRUC, Taproot tweak / control-block / sighash-default / taptree, Schnorr pseudocode / batch-verify / pitfalls, MuSig2 protocol / key-agg / attacks, BOLT summary / feature bits, channel state-machine / commitment-tx / force-close).

- **Bitcoin detection in `detection.service.ts`**: new `BitcoinDetectionService` runs alongside language detection. Recognizes signals across `Cargo.toml` (bitcoin/bdk/ldk/miniscript/secp256k1/rust-dlc/taproot-assets/rgb), `package.json` (bitcoinjs-lib/@scure/btc-signer/mempool.js/bolt11/cashu-ts/NWC/WebLN/stacks/rsk), `requirements.txt`+`pyproject.toml` (python-bitcoinlib/embit/bdkpython/bitcoinlib/hdwallet/cashu/pyln-client), `go.mod` (btcd/lnd/tapd), `pom.xml`+`build.gradle` (bitcoinj/bdk-jvm/bdk-android), `.csproj` (NBitcoin/BTCPayServer), operational config files (bitcoin.conf/lnd.conf/eclair.conf/electrs.toml/fulcrum.conf/tapd.conf/arkd.conf/phoenix.conf), Docker compose images (lncm/bitcoind, lightninglabs/lnd, lightninglabs/tapd, elementsproject/lightningd, cashubtc/nutshell, fedimint/fedimintd, btcpayserver, getumbrel/electrs, mempool/backend, mempool/frontend, arkade/arkd, blockstream/esplora), and Ordinals/Runes assets (`inscriptions/`, `runes.json`, `ord.yaml`). New `STACK_TO_AGENTS` mappings route detected Bitcoin tags to the appropriate Bitcoin domain agents (and to language-experts for library-specific work).

- **Documentation MCP — `bitcoin` category** in `mcp-servers/documentation/src/docs-index/bitcoin.ts`: registers Bitcoin technologies under the `bitcoin` category with canonical upstream URLs and `local` paths under `bitcoin/<area>/<topic>/overview.md` for the external `claude-dev-suite/knowledge_base` repo (Phase B topic-deep articles to follow in a later release).

### Architectural decision

After research into agent-vs-skill efficiency in Claude Code (per official Anthropic docs), Bitcoin support is delivered as **5 domain-experts + ~170 skills** rather than per-language Bitcoin agents. Language-specific work routes through the existing language-experts (`rust-expert`, `typescript-expert`, etc.) with Bitcoin library skills loaded onto them via detection. This avoids duplicating language knowledge while preserving cross-language Bitcoin domain expertise (consensus, BOLT specs, hardware multisig coordination).

---

## [1.4.0] - 2026-04-28

### Added

- **`unity-expert` agent**: new deep-expertise agent for Unity 6 game development covering both 2D and 3D. Comprehensive coverage of: MonoBehaviour lifecycle, ScriptableObjects, GameObject/Component model, prefabs, serialization, coroutines, events; rendering pipelines (Built-in / URP / HDRP), Shader Graph, Volume framework, Renderer Features, GPU Resident Drawer, lighting; new Input System (`InputAction`, `InputActionAsset`, rebinding, multi-device), UI Toolkit (UXML/USS) and uGUI optimization; 3D physics (Rigidbody, Collider, Joints) and animation (Animator state machines, Animation Rigging, Humanoid retargeting); Addressables (AssetReference, labels, groups, build profiles, remote content, Cloud Content Delivery); performance tooling (Profiler, Frame Debugger, Memory Profiler, GC allocation hunting, object pooling, IL2CPP, Burst, batching, LOD); DOTS/ECS (Entities 1.x, Burst, Jobs, ISystem, baking); Netcode for GameObjects (NetworkVariable, RPCs, client-side prediction, lag compensation, Multiplay/Relay/Lobby); XR (XR Interaction Toolkit 3.x, AR Foundation, OpenXR, hand tracking); editor tooling (custom Inspectors, PropertyDrawers, EditorWindow, asset post-processors, headless `-batchmode -executeMethod` builds); Unity Test Framework (EditMode + PlayMode, performance tests); platform builds (IL2CPP vs Mono, Build Profiles, Android AAB + PAD, iOS Xcode post-processing, WebGL). **Dedicated 2D cluster** (deep): Sprite Renderer + Sprite Atlas v2 (master/variants, packing, tight mesh), 9-slice rendering, Sorting Layers / Order in Layer / Sorting Group, sprite import settings, Pixels Per Unit consistency, Pixel Perfect Camera; Tilemap (Grid + Tilemap, Rule Tiles, Animated Tiles, Tile Palette, Hexagonal/Isometric grids, Composite Collider 2D + Tilemap Collider 2D, procedural generation); 2D physics (Rigidbody2D body types, Collider2D shapes, joints, effectors, layer collision matrix, allocation-free queries); 2D Animation (frame-by-frame, skeletal bones + skinning + IK, PSD Importer, Aseprite Importer, Sprite Library / Resolver); 2D Lighting (URP 2D Renderer, Light 2D types, Shadow Casters 2D, Sprite Mask, Renderer2DData, normal-mapped sprites, blend styles); 2D cameras (Cinemachine 2D, Position Composer, Group Composer, Confiner 2D, Pixel Perfect integration, parallax, Cinemachine Impulse for screen shake); 2D gameplay (kinematic vs dynamic character controllers, **coyote time**, **jump buffer**, variable jump, wall slide / wall jump, dash, hitstop / juice, top-down 8-way movement). Ships with `agents/gamedev/unity-expert.md`.
- **20 Unity skills** under `skills/gamedev/`: 13 generic (`unity-core`, `unity-rendering`, `unity-input-ui`, `unity-physics-anim`, `unity-addressables`, `unity-performance`, `unity-dots`, `unity-netcode`, `unity-xr`, `unity-editor-tooling`, `unity-testing`, `unity-build-platforms`, `unity-best-practices`) + 7 dedicated 2D (`unity-2d-core`, `unity-2d-tilemap`, `unity-2d-physics`, `unity-2d-animation`, `unity-2d-lighting`, `unity-2d-cameras`, `unity-2d-gameplay`). Each skill ships frontmatter with `USE WHEN` / `DO NOT USE FOR`, code patterns, anti-patterns table, and production checklist.
- **Unity / 2D detection in `detection.service.ts`**: new `detectUnity()` runs **before** `detectDotnet()` so Unity-auto-generated `.csproj`/`.sln` files are no longer misclassified as ASP.NET. Detection signals: `ProjectSettings/ProjectVersion.txt` (definitive) + `Assets/` + `Packages/manifest.json`. Maps installed `com.unity.*` packages to `additionalTechnologies`: `unity-urp`, `unity-hdrp`, `unity-netcode`, `unity-dots`, `unity-ar`, `unity-xr`, `unity-addressables`, `unity-input-system`, `unity-cinemachine`, `unity-timeline`, `unity-localization`, plus a `unity-2d` flag whenever any `com.unity.2d.*` package is present. Sets `frontend.framework = 'unity'`, `runtime = 'csharp'`, and `projectType = 'game'`. New stack-to-agent mappings route Unity projects to `unity-expert`.
- **Knowledge base — Phase A overview stubs for 20 Unity skills**: registered the new `gamedev` category in `mcp-servers/documentation/src/docs-index/gamedev.ts`, with 20 entries pointing to per-skill `overview.md` stubs in the `claude-dev-suite/knowledge_base` repo. Each stub cross-references the canonical Unity Manual / package docs page and the matching dev-suite `SKILL.md`.
- **Knowledge base — Phase B topic articles for the 2D cluster (21)**: registered 21 additional topic entries in `gamedev.ts` (3 per dedicated 2D skill) and produced full deep-dive markdown for each. Articles: `unity-2d-core/{sprite-atlas-v2, sorting-layers-and-groups, pixel-perfect-camera}`, `unity-2d-tilemap/{rule-tiles, composite-collider-tilemap, procedural-tilemap-generation}`, `unity-2d-physics/{rigidbody2d-body-types, effectors-2d, contact-filters-and-allocation-free-queries}`, `unity-2d-animation/{skeletal-2d-animation, psd-importer-workflow, sprite-library-and-resolver}`, `unity-2d-lighting/{2d-lights-and-blend-styles, shadow-casters-2d, normal-mapped-sprites}`, `unity-2d-cameras/{cinemachine-2d-position-composer, confiner-2d, parallax-techniques}`, `unity-2d-gameplay/{coyote-time-and-jump-buffer, variable-jump-and-fall-gravity, dash-and-wall-jump}`. Each ships canonical-source link, ready-to-paste C# snippets, tuning ranges, and an anti-patterns table. Articles are bundled in `unity-kb-phase-b-2d.tar.gz` for push to the external `claude-dev-suite/knowledge_base` repo. Phase B for non-2D skills will follow in a later release.
- **`unity-2d-game` project template**: scaffolds a Unity 6 project with `_Project/` folder layout, asmdef-ready `Scripts/` root, sample `PlayerController2D.cs` (kinematic-style with coyote time + jump buffer + variable jump height + early-release detection), `CameraFollow2D.cs` starter, `.gitignore`, `.gitattributes` (Git LFS for `.psd` / `.fbx` / `.png` / `.wav` / `.aseprite` and Unity merge tool for `.unity` / `.prefab` / `.asset`), `.editorconfig`, and a templated `README.md` with placeholders for product / company / pixels-per-unit. `template.json` lists recommended packages: `com.unity.render-pipelines.universal`, `com.unity.inputsystem`, `com.unity.cinemachine`, `com.unity.2d.sprite`, `com.unity.2d.tilemap`, `com.unity.2d.tilemap.extras`, `com.unity.2d.animation`, `com.unity.2d.pixel-perfect`, `com.unity.test-framework`.
- **3 Unity automation recipes** in `automation-recipes.ts`: `unity-csharp-format` (Auto-format `.cs` files via dotnet format / CSharpier on Write/Edit), `unity-meta-check` (pre-commit guard for orphaned `.meta` files), `unity-no-binary-text` (pre-commit check that scenes / prefabs / assets are serialized as text — catches missing `Asset Serialization Mode = Force Text`).
- **README — Game Development Agents section**: new bullet under `What is Dev-Suite?` and a dedicated row in the Agents Reference table covering `unity-expert` and the 20 Unity skills. Stack detection bullet now lists Unity (2D, URP, HDRP, DOTS, Netcode, XR, Addressables, Cinemachine, Input System); auto-detection scan list now includes `ProjectSettings/ProjectVersion.txt` and `Packages/manifest.json`.
- **External MCP recommendation (not bundled)**: README and `unity-expert` agent recommend `CoplayDev/unity-mcp` (MIT) and `IvanMurzak/Unity-MCP` (Apache-2.0) as optional open-source MCP servers if the user wants Claude Code to drive the Unity Editor directly (scene / script / asset / profiler / build tools). Dev-suite does not bundle or require them — agents and skills work standalone.

---

## [1.3.0] - 2026-04-18

### Added

- **`list_docs` tool for documentation MCP server**: new tool that returns a compact catalog of all available KB articles (`{ technology: [topics...] }`), optionally filtered by category (24 categories: frontend, backend, rag, retrieval, embeddings, vector-stores, document-processing, rag-frameworks, rag-ops, etc.). Enables agent-driven retrieval — agents call `list_docs()` to discover what knowledge is available, then `fetch_docs(technology, topic)` to retrieve specific articles. Server version bumped to 2.4.0.
- **Knowledge Base Protocol for all agents**: updated 46 agent files — replaced `mcp__documentation__fetch_docs` with `mcp__documentation__*` wildcard in frontmatter (access to all documentation tools), and replaced the old `## Documentation Loading Protocol` section with a concise `## Knowledge Base Protocol` that instructs agents to call `list_docs()` for KB discovery before fetching deep-dive articles.
- **Knowledge base stubs for rag-expert skills (Phase 1)**: registered 85 new technologies in the `documentation` MCP server index across 7 new category files (`rag.ts`, `retrieval.ts`, `embeddings.ts`, `vector-stores.ts`, `document-processing.ts`, `rag-frameworks.ts`, `rag-ops.ts`) totalling 283 supported technologies. Pushed matching 85 stub `overview.md` files to the `claude-dev-suite/knowledge_base` repo (one per skill), cross-referencing the corresponding `SKILL.md` cheat-sheet and upstream canonical docs. Phase 2+ will replace stubs with full tutorials, benchmarks, paper summaries, troubleshooting, and migration guides.
- **rag-expert agent**: new deep-expertise agent for Retrieval-Augmented Generation systems. Comprehensive knowledge base across the full RAG stack. **Architecture & retrieval**: naive → advanced → agentic RAG, Self-RAG/CRAG/Adaptive, chunking strategies (recursive, semantic, contextual, parent-child, proposition-based, late chunking), query transformations (HyDE, multi-query, RAG-fusion, step-back, sub-query decomposition, self-querying, routing), hybrid search + RRF, advanced retrieval (parent-document, small-to-big, RAPTOR, auto-merging). **Retrieval algorithms**: ColBERT, SPLADE, BM25 deep tuning, RankGPT, cross-encoder training, Cohere/Voyage/BGE/Jina reranking. **Conversational/specialized**: conversational RAG with memory, streaming with citations, personalization, time-aware retrieval, tabular (NL2SQL hybrid), long-context vs RAG, feedback loops. **Graph RAG**: Microsoft GraphRAG, HippoRAG, entity resolution, knowledge graph construction, ontology-guided retrieval. **Multimodal**: vision, tables, audio (Whisper/AssemblyAI/Deepgram), video (keyframe + transcript). **Embeddings**: OpenAI/Voyage/Cohere/BGE/E5/Jina/Nomic/mxbai, multilingual, Matryoshka, fine-tuning, hard-negative mining, drift detection, semantic dedup. **Vector stores**: pgvector, Qdrant, Weaviate, Pinecone, Milvus, Redis, LanceDB, MongoDB Atlas, ChromaDB, OpenSearch, Vespa, Elasticsearch, ANN algorithms, quantization. **Ingestion**: PDF/DOCX/PPTX/XLSX/EML/audio/video/markdown/web-scraping, Airflow/Prefect/Dagster orchestration, Debezium/Kafka CDC. **Evaluation**: RAGAS, DeepEval, TruLens, ARES, Giskard RAGET, continuous evaluation in CI, shadow-mode deployment. **Guardrails/security**: hallucination detection, forced citations, NeMo Guardrails, PII redaction (Presidio), multi-tenant isolation, GDPR, indirect prompt injection. **Ops/infra**: TEI/Triton GPU serving, batch inference (OpenAI/Anthropic batches), cost allocation, multi-region deployment, LLM gateways (Portkey/OpenRouter/LiteLLM). **Frameworks**: LangChain 0.3+, LlamaIndex 0.12+, Haystack 2.x, DSPy 2.5+, LangGraph, Ragatouille, R2R, Canopy, txtai. **Observability**: LangSmith, Langfuse, Arize Phoenix, Comet Opik, OpenTelemetry GenAI. Ships with new skill categories: `skills/rag/`, `skills/retrieval/`, `skills/embeddings/`, `skills/vector-stores/`, `skills/document-processing/`, `skills/rag-frameworks/`, `skills/rag-ops/`.
- **Native Android / Kotlin detection**: `detection.service.ts` now recognizes Android modules (`com.android.application` / `com.android.library` plugins, including `libs.versions.toml` aliases) and classifies them as `mobile` projects with `frontend.framework = 'android-native'` and `runtime = 'kotlin'`. Detects **Room** (mapped to `dbType: 'sqlite'`, `orm: 'room'`), **Jetpack Compose**, and Kotlin as additional technologies. Java/Spring detection is skipped on Android modules so they're no longer mislabeled as JVM backends. New stack-to-agent mappings route Android projects to `mobile-expert`.
- **Project Rules wizard step**: a new step 4 in the installation wizard lets users select behavioral rules for Claude Code agents. Rules are copied to `.claude/rules/` in the target project and tracked in `.dev-suite.json`. Five templates are bundled: Conventional Commits ⭐, Semantic Versioning ⭐, Branch Protection, Changelog Maintenance ⭐, README Accuracy ⭐ (starred = pre-selected as recommended).
- **Remember last project folder**: the splash screen now pre-fills the last successfully opened project path on startup. The path is persisted in `dev-suite-prefs.json` inside the Electron user-data directory and validated (existence check) before use.
- **sysadmin-expert agent**: new agent for production server configuration covering Nginx, Caddy, Traefik, SSL/TLS (Let's Encrypt), DNS, UFW/fail2ban, systemd, WireGuard VPN, Prometheus/Grafana monitoring, backup strategies, server hardening, email infrastructure (SPF/DKIM/DMARC), zero-downtime deployments, load balancing, and WAF. Ships with 17 new skill files under `skills/infrastructure/`.

---

## [1.2.2] - 2026-04-04

### Fixed

- **Project selector — WSL Linux paths**: `validateProjectPath` in the Electron main process now correctly handles Windows UNC paths (`\\wsl$\Ubuntu\...`, `\\wsl.localhost\Ubuntu\...`) — backslashes are no longer corrupted by the forward-slash normalization, and traversal checks skip the server+share prefix as required by the UNC spec.
- **Project selector — manual path input**: the path field in the splash screen is now editable; users can type or paste any path (including WSL UNC paths) directly without having to use the Browse dialog. A WSL example hint is shown below the field.
- **Project selector — window too small**: splash window enlarged from 400×340 to 520×400.
- **Agent selection — checkbox click doesn't toggle**: clicking the checkbox element inside an agent card was calling `onToggleAgent` twice (once from `Checkbox.onChange` and once from the bubbled `Card.onClick`), causing the selection to double-toggle and appear broken. Fixed by making the Checkbox `pointer-events-none` so the Card's single `onClick` handler is the only toggle trigger.
- **Workflow template dropdown**: secondary subtasks (`{testing}`, `qa-expert`) are now marked `optional: true` — workflows like *Frontend Feature*, *Backend Feature*, *Full Stack Feature*, *Bug Fix*, and *Code Review* are no longer grayed out when a testing/QA agent isn't installed. Compatible workflows with skipped optional agents show a hint in the dropdown (e.g. `"Frontend Feature (no testing)"`). Adds `skippedAgents` tracking to `ResolvedWorkflow`.
- **Files viewer — "cannot load file" on Markdown and other files**: Shiki syntax highlighter now has a top-level `try/catch`; if the dynamic import or highlighting fails (e.g. inside Electron's asar bundle), the file content is rendered as escaped plain text instead of showing an error.

---

## [1.1.2] - 2026-04-03

### Added

- **creative-frontend-expert** agent — advanced animation (Framer Motion, GSAP), Three.js/R3F, SVG animation, Canvas/WebGL, advanced CSS effects
- **6 New Skills** — `animation/framer-motion`, `animation/gsap`, `graphics/three-js`, `graphics/svg-animation`, `graphics/canvas-webgl`, `styling/advanced-css-effects`
- **Files viewer API** — new `files.routes.ts` with read-only project file browsing endpoints

### Fixed

- **MCP server preparation** (`/prepare-servers`): route was ignoring the `failed[]` return value and always responding `success: true` even when individual servers failed to build
- **Install error message**: `Step5Install` was swallowing the real backend error and showing a generic message; now surfaces the actual error from the response body
- **Electron packaged app**: `prepareServers()` was attempting `npm install` on the pre-built `resources/dev-suite/mcp-servers/` directory (no `node_modules`, potentially read-only), throwing "Failed to install MCP dependencies" before installation even started; now skips npm install when all requested server `dist/index.js` files already exist
- **MCP server `npm install`**: `installMcpServer()` invoked npm via `npm.cmd` which looks for `npm-cli.js` relative to itself — unreliable in Electron where the bundled node's `node_modules/npm/` may be stripped; now calls `npm-cli.js` directly via `process.execPath`, falling back to system npm
- **Orchestrator path validation**: projects outside the home directory or on a different drive (e.g. `D:\projects\...`) were rejected with "Path must be within allowed workspace directories"; fixed by adding `PROJECT_PATH` (set by Electron at launch) to allowed roots and making comparisons case-insensitive on Windows
- **TypeScript build errors** (pre-existing, blocked CI): `useEffect` TDZ in `LivePerformancePanel`, `useRef` React 19 regression in `useOrchestratorWebSocket`, `unknown`-typed `summary`/`st` in `OrchestratorPanel`

---

## [1.1.1] - 2026-03-15

### Added

- **Python Integration Testing** — Complete Python integration testing infrastructure
  - **1 New Agent**
    - `python-integration-test-expert` — pytest, testcontainers-python, pytest-django, FastAPI TestClient, factory_boy, Celery testing, respx/responses/pytest-httpserver HTTP mocking, Pact contract testing
  - **5 New Skills**
    - `testing/python-integration` — Test pyramid, conftest.py architecture, pytest markers, GitHub Actions CI/CD, pytest-xdist parallel execution
    - `testing/testcontainers-python` — All container modules (PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ), wait strategies, async support, Docker Compose
    - `testing/pytest-django` — All `@pytest.mark.django_db` options, fixtures (db, client, rf, settings, mailoutbox, django_assert_num_queries), DRF APIClient, async views, factory_boy integration
    - `testing/fastapi-testing` — TestClient, AsyncClient/anyio, dependency overrides, JWT auth, WebSocket, file upload, HTTP mocking (respx, responses, pytest-httpserver)
    - `testing/factory-boy` — All declarations (Faker, Sequence, SubFactory, RelatedFactory, Trait, post_generation, Maybe, Dict), DjangoModelFactory, SQLAlchemyModelFactory
  - **7 Quick-Refs** added to `skills/testing/pytest/quick-ref/`
    - `testcontainers-python.md`, `integration-patterns.md`, `sqlalchemy-fixtures.md`, `alembic-testing.md`, `redis-kafka-testing.md`, `pact-python.md`, `grpc-testing.md`
  - **15 Knowledge Base files** across 7 new directories
    - `testcontainers-python/` — basics, databases (SQLAlchemy 2.0 savepoint, Alembic, async), messaging (Kafka, RabbitMQ, Celery)
    - `pytest-django/` — basics (all fixtures), advanced (DRF, async views, factory_boy, signals, management commands, Django Channels)
    - `fastapi-testing/` — basics, async (AsyncClient, anyio, lifespan), http-mocking (respx, responses, pytest-httpserver)
    - `factory-boy/` — basics (all declarations), advanced (traits, pytest-factoryboy, complex chains)
    - `celery-testing/` — pytest plugin, all fixtures, chains/chords/groups, retry, signals, Django integration
    - `python-integration-testing/` — patterns (test pyramid, CI/CD, xdist), sqlalchemy (savepoint isolation), alembic (migration testing)
    - `pact-python/` — consumer-driven contract testing, all matchers, provider verification, Pact Broker, V3 message pacts
  - **docs-index** updated — 7 new technologies registered in `mcp-servers/documentation/src/docs-index/testing.ts`

### Fixed



- **CI/CD** — E2E workflow now installs server dependencies and builds frontend before running Playwright tests
- **CI/CD** — E2E workflow uses 6-way sharding to stay within timeout limits
- **E2E Fixture** — Fixed race condition where `mainPage` fixture could capture DevTools window instead of the app window
- **CI/CD** — CI workflow now installs server dependencies before TypeScript build
- **Security** — Fixed 13 ReDoS vulnerabilities in codegen spec parsers (OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN)
- **Security** — Fixed path-injection in `management.service.ts` `updateClaudeMd()` with `resolveProjectPath()` validation
- **Security** — Fixed path-injection in `code-review.routes.ts` with path containment check for file diffs

### Added

- **DriftWire / Industrial Automation Integration** — Full support for Python DCS/PLC engineering projects
  - **5 New Agents**
    - `streamlit-expert` — Streamlit UI specialist (session state, caching, forms, multipage, Docker, testing)
    - `data-engineering-expert` — pandas, openpyxl, lxml, bulk data pipelines, Excel/XML/CSV, UTF-16 file formats
    - `dcs-analyst` — ABB Freelance PRT/DMF/CSV file analysis, tag extraction, DCS reverse engineering (Opus model)
    - `freelance-engineer` — ABB Freelance engineering file generation, PRT/DMF bulk templating (Opus model)
    - `automation-architect` — DCS/PLC automation pipeline design, cross-platform (ABB, Siemens, Emerson, Honeywell) (Opus model)
  - **10 New Skills**
    - `backend-frameworks/streamlit` — Complete Streamlit reference (layout, widgets, caching, config, secrets, Docker)
    - `data-validation/pydantic` — Pydantic v2 (BaseModel, validators, Annotated types, pydantic-settings, serialization)
    - `data-processing/pandas` — pandas + openpyxl + lxml + UTF-16LE file handling, bulk generation patterns
    - `ai-integration/anthropic-python` — Anthropic Python SDK (messages, streaming, tool use, vision, async, Streamlit integration)
    - `best-practices/ruff` — Ruff linter/formatter (CLI, pyproject.toml config, rule sets, CI, pre-commit)
    - `industrial/freelance-formats` — ABB Freelance PRT/DMF/CSV format reference, section grammar, encoding rules
    - `industrial/isa-standards` — ISA-5.1 tag naming, ISA-88 batch, ISA-95 hierarchy, ISA-18.2 alarms, ISA-101 HMI
    - `industrial/dcs-platforms` — ABB Freelance, Siemens PCS7/TIA Portal, Emerson DeltaV, Honeywell Experion cross-platform reference
    - `industrial/iec61131` — IEC 61131-3 languages (LD/FBD/ST/IL/SFC), POUs, PLCopen, exchange formats
    - `industrial/bulk-engineering` — Bulk engineering pipeline, PRT templating, NAMUR NE 148, recommended tech stack
  - **Python detection extended** — `detection.service.ts` now detects `streamlit` as a backend framework and `ruff`, `pydantic`, `anthropic`, `openpyxl`, `pandas`, `lxml` as additional technologies from `requirements.txt`/`pyproject.toml`
  - **Detection constants** — `aiosqlite` added to `PYTHON_DB_RULES`; new `STACK_TO_AGENTS` mappings for `streamlit`, `pandas`, `openpyxl`, `lxml`, `pydantic`, `ruff`, `anthropic`
  - **2 New Registry Hooks** (`registry/features.json`)
    - `python-ruff-format-hook` — PostToolUse hook that runs `ruff format` + `ruff check --fix` on `.py` file saves
    - `pytest-smoke-hook` — SubagentStop hook triggering `qa-expert` with pytest after Python agent completions
  - **MCP metadata** — `database-query` server `detectedWhen` extended with `sqlite` and `sqlalchemy`

- **Code Generator** — Spec-driven code generation dashboard tab with 3-phase pipeline
  - Supports OpenAPI (JSON/YAML), AsyncAPI, TypeSpec, Protobuf, and BPMN spec formats
  - Deterministic code generation for 9 target languages/frameworks (TypeScript Express/Fastify/NestJS/Koa, Java Spring, Python FastAPI/Flask, Go Gin/Echo)
  - AI refinement phase using existing agents + dedicated `codegen-refinement` skill for naming, imports, error-handling adaptation
  - Convention scanner reads `.prettierrc`, `tsconfig.json`, ESLint config, and `package.json` to align generated code with project style
  - 5-step dashboard UI: Technology → Upload Spec → Configure → Preview → Generate
  - Drag-and-drop file upload with real-time spec validation
  - File browser with code preview and Accept All / Refine with Claude options
  - Backend: 8 REST endpoints with multer upload, Zod validation, rate limiting
  - New skill: `skills/codegen/codegen-refinement/SKILL.md`

---

## [1.1.0] - 2026-03-05

### Added

- **51 New Skills** covering AI, mobile, real-time, infrastructure, security, architecture, and production patterns
  - AI integration: `vector-databases`, `rag-patterns`, `etl-pipelines`
  - Mobile: `react-native`, `flutter`, `expo`
  - Real-time: `socket-io`, `sse`, `webrtc`
  - Infrastructure: `terraform`, `job-queues`, `cron-scheduling`, `api-gateway`, `health-checks`, `deployment-strategies`, `service-mesh`
  - Security: `rate-limiting`, `cryptography`, `audit-logging`, `gdpr`, `cors-security-headers`
  - Architecture: `ddd`, `event-sourcing-cqrs`, `multitenancy`
  - API design: `webhooks`, `pagination`, `grpc`
  - Testing: `load-testing`, `contract-testing`
  - Observability: `error-tracking`
  - Utilities: `pdf-generation`, `data-export`, `image-processing`, `charting`
  - Best practices: `resilience-patterns`, `caching-strategies`, `feature-flags`, `error-handling`
  - Other: `i18n`, `push-notifications`, `pwa`, `webauthn`, `stripe`
- **2 New Agents**
  - `mobile-expert` — React Native, Flutter, Expo, push notifications, payments
  - `cloud-expert` — AWS, Azure, GCP, Terraform, serverless, API gateway, service mesh
- **Comprehensive Agent-Skill Cross-Reference** — All 321 skills mapped to at least one agent, zero orphans, zero broken references. Extensive skill additions to 22 existing agents
- **Knowledge Base (Tier 1)** — 61 deep-dive documentation files across 13 technologies
  - Architecture: DDD (5 files), Event Sourcing/CQRS (5 files), Multitenancy (4 files)
  - AI: RAG Patterns (5 files), Vector Databases (5 files)
  - Security: Cryptography (5 files), GDPR (5 files)
  - Infrastructure: Terraform (5 files), Service Mesh (4 files)
  - Best Practices: Resilience Patterns (5 files), Caching Strategies (4 files)
  - Testing: Load Testing (5 files), Contract Testing (4 files)
- **Documentation MCP Server** — 3 new docs-index categories (architecture, ai, security) and updates to infrastructure, standards, testing indexes registering all 13 KB technologies
- **Messaging Integration Testing Skills** - Three new testing skills for message broker integration testing
  - `messaging-testing-kafka`, `messaging-testing-rabbitmq`, `messaging-testing` with quick-ref guides
  - Updated `testcontainers`, `spring-kafka`, and `spring-amqp` skills with test examples
- **Smoke Test Agent** - `smoke-test-expert` for post-implementation end-to-end verification with 7-phase pipeline and fix orchestration
- **New Component Discovery** - Surfaces agents/MCP servers added after initial installation with catalog snapshots
- **Angular/.NET Ecosystem** - `angular-expert` and `dotnet-expert` agents with 20+ new skills
- **Git Authentication Flow** - Dashboard Git panel detects auth errors and prompts `gh auth login`
- **Electron Performance** - Faster splash screen, lazy-loaded modules, NSIS installer

---

## [1.0.0] - 2026-02-06

### Initial Public Release

- **10 MCP Servers**: Documentation, Database Query, Docker Manager, API Tester, API Explorer, Log Analyzer, Performance Profiler, Code Quality, Security Scanner, Dashboard Bridge
- **34 Agents**: Core, Frontend, Backend, Testing, Database, Infrastructure, Messaging, Security experts (at release)
- **240+ Skills**: Framework-specific knowledge files with quick-reference guides (at release)
- **Web Dashboard**: React + TypeScript + Vite + TailwindCSS + Zustand frontend with Express TypeScript backend
- **Electron Desktop App**: Native desktop app with auto-updater and splash screen
- **Orchestrator**: WebSocket-based multi-agent task execution from dashboard
- **Code Review**: AI-powered code review with scope selection and multi-agent support
- **Git Integration**: Full Git operations panel with staging, commits, branches, and diff viewer
- **Templates**: Project scaffolding for React, Next.js, Spring Boot, Express, FastAPI, and more
- **Custom Agents**: Create and manage custom agents from the dashboard
- **Upgrade System**: Feature registry with upgrade detection and conflict resolution
- **Analytics**: Track knowledge base usage and agent performance

### Technical Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, Zustand
- **Backend**: Express 5, TypeScript, Zod validation
- **Desktop**: Electron with auto-updates
- **MCP Servers**: TypeScript, npm workspaces
- **Knowledge Base**: Git-based on-demand fetching for 137 technologies

---

## Summary

| Version | MCP Servers | Agents | Skills | KB Files | Tools |
|---------|-------------|--------|--------|----------|-------|
| 1.1.1   | 10          | 47     | 337+   | 76+      | 79    |
| 1.1.0   | 10          | 41     | 321    | 61       | 79    |
| 1.0.0   | 10          | 34     | 240+   | —        | 79    |
