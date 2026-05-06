---
name: rust-supply-chain
description: |
  Rust supply-chain & quality toolchain — cargo-deny (license + advisory + bans),
  cargo-audit (RustSec advisory DB), cargo-nextest (faster test runner with
  retry/parallel), cargo-tarpaulin / llvm-cov (code coverage), cargo-machete
  (unused deps), cargo-outdated (version gap detection), cargo-vet (third-party
  audit attestations). CI integration patterns and policies for production
  Rust apps.

  USE WHEN: user mentions "cargo-deny", "cargo-audit", "RustSec", "cargo-nextest",
  "cargo-tarpaulin", "llvm-cov rust", "cargo-machete", "cargo-outdated",
  "cargo-vet", "deny.toml", "rust supply chain"

  DO NOT USE FOR: Cross-compile mechanics - use `build-tools/rust-cross-compile`
  DO NOT USE FOR: Pure Rust language - use `languages/rust`
  DO NOT USE FOR: Kotlin/JS supply chain - use `quality/osv-scanner` (covers all)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rust Supply Chain & Quality Toolchain

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cargo-deny` or `rustsec`.

## Overview

Production Rust app needs:

| Tool | Concern |
|---|---|
| **cargo-deny** | License compliance, banned crates, advisory enforcement |
| **cargo-audit** | RustSec advisory DB lookup |
| **cargo-nextest** | Faster, more reliable test runner (parallel, retries) |
| **cargo-tarpaulin** / `llvm-cov` | Code coverage |
| **cargo-machete** | Detect unused dependencies |
| **cargo-outdated** | Find stale dependencies |
| **cargo-vet** | Mozilla-style audit attestations for transitive deps |
| **cargo-msrv** | Minimum supported Rust version detection |
| **cargo-binstall** | Install tools as binaries (faster than `cargo install`) |

For BHODL-style wallet apps: **all of these** in CI. No exceptions.

## Install

```bash
# Fast install via binstall (downloads pre-built binaries)
cargo install cargo-binstall
cargo binstall cargo-deny cargo-audit cargo-nextest cargo-tarpaulin \
    cargo-machete cargo-outdated cargo-vet cargo-msrv

# Or build from source (slower)
cargo install cargo-deny cargo-audit cargo-nextest cargo-tarpaulin \
    cargo-machete cargo-outdated cargo-vet
```

## cargo-deny — License + Bans + Advisories

`deny.toml` (project root):

```toml
[graph]
all-features = true
no-default-features = false

[advisories]
db-path = "~/.cargo/advisory-db"
db-urls = ["https://github.com/rustsec/advisory-db"]
yanked = "deny"                                           # fail on yanked crates
ignore = [
    # Allowed exceptions with rationale
    # "RUSTSEC-2024-XXXX",  # reason: not exploitable in our use
]

[licenses]
allow = [
    "MIT",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "Unicode-DFS-2016",                                   # for unicode-* crates
    "Zlib",
    "MPL-2.0",                                             # be careful, file-level copyleft
    "CC0-1.0",                                             # Bitcoin libs use this
    "Unlicense",                                           # public domain
    "0BSD",
]
confidence-threshold = 0.8

# Block GPL, AGPL — they'd virally infect a wallet codebase
# Reject by NOT listing them in `allow` (default deny)

[[licenses.exceptions]]
name = "ring"
allow = ["LicenseRef-ring"]                               # has its own license file

[bans]
multiple-versions = "warn"
deny = [
    { name = "openssl-sys", reason = "Use rustls instead" },
    { name = "native-tls", reason = "Use rustls instead" },
]
skip = [
    # Tolerate duplicates from common transitive deps
    { name = "syn", version = "1" },
    { name = "syn", version = "2" },
]
skip-tree = [
    # Don't trace into these for ban check
]

[sources]
unknown-registry = "deny"
unknown-git = "deny"
allow-registry = ["https://github.com/rust-lang/crates.io-index"]
allow-git = []                                             # no random git deps
```

```bash
# Run all checks
cargo deny check

# Specific category
cargo deny check licenses
cargo deny check advisories
cargo deny check bans
cargo deny check sources

# In CI (exit non-zero on issues)
cargo deny --log-level error check
```

For BHODL-type wallet: **deny GPL/AGPL hard** — they'd require open-sourcing the whole app under matching license.

## cargo-audit — Advisory DB Lookup

```bash
# Update advisory DB
cargo audit fetch

# Run audit
cargo audit

# JSON output
cargo audit --json | jq '.vulnerabilities'

# Allow some advisories with rationale
cargo audit --ignore RUSTSEC-2024-0001
```

`cargo-audit` is lighter-weight than `cargo deny check advisories` — use both: cargo-deny for policy enforcement, cargo-audit for quick scans.

## cargo-nextest — Faster Test Runner

```bash
# Drop-in replacement for `cargo test`
cargo nextest run

# Run specific tests
cargo nextest run wallet::tests::insert
cargo nextest run --package bdk-ffi

# With retry on flake
cargo nextest run --retries 2

# JUnit output for CI
cargo nextest run --profile ci

# List all tests without running
cargo nextest list
```

Configuration `.config/nextest.toml`:

```toml
[profile.default]
retries = 0
fail-fast = true
test-threads = "num-cpus"
slow-timeout = { period = "60s", terminate-after = 2 }

[profile.ci]
retries = 2
fail-fast = false
test-threads = 4
junit = { path = "target/nextest/junit.xml" }
status-level = "all"
final-status-level = "slow"
```

Why nextest:
- 2-3x faster than cargo test (better parallelism)
- Per-test process isolation (uncovers test pollution bugs)
- Retry support for flaky tests
- JUnit XML output for CI dashboards
- Better failure summaries

## cargo-tarpaulin (Linux) — Code Coverage

```bash
cargo install cargo-tarpaulin

# Run with coverage
cargo tarpaulin --workspace --out Xml --output-dir coverage

# HTML report
cargo tarpaulin --workspace --out Html --output-dir coverage
open coverage/tarpaulin-report.html

# Exclude generated code
cargo tarpaulin --exclude-files 'target/*' '*/build.rs'

# Per-test (slower but more accurate)
cargo tarpaulin --workspace --line --branch
```

For Linux only. For macOS/Windows use llvm-cov.

## llvm-cov (Cross-Platform) — Code Coverage

```bash
cargo install cargo-llvm-cov

cargo llvm-cov --workspace --html
cargo llvm-cov --workspace --lcov --output-path lcov.info     # for Codecov

# Combined with nextest
cargo llvm-cov nextest --workspace --lcov --output-path lcov.info
```

Works on macOS, Windows, Linux. **Recommended for cross-platform projects.**

## cargo-machete — Unused Deps

```bash
cargo install cargo-machete

cargo machete                                              # list unused
cargo machete --fix                                         # auto-remove

# Skip known false positives
# .cargo/machete.toml
# ignored = ["serde_derive"]
```

Removes dead deps → faster builds, smaller attack surface.

## cargo-outdated — Stale Deps

```bash
cargo install cargo-outdated

cargo outdated                                              # show outdated
cargo outdated --workspace --depth 1                        # direct deps only
cargo outdated --exit-code 1                                # CI: fail if outdated
```

Tip: don't blindly upgrade — check changelogs first, especially for crypto/network crates.

## cargo-vet — Audit Attestations

Mozilla-developed: each org curates a list of crate versions audited (by them or by trusted parties).

```bash
cargo install cargo-vet

cargo vet init
cargo vet                                                   # checks all deps audited
cargo vet inspect <crate> <version>                         # opens diff to inspect
cargo vet certify <crate> <version>                         # mark as audited
```

Exchange `audit.toml` between orgs to share trust. Used by Mozilla, Embark, Bytecode Alliance.

For BHODL: probably overkill for a single-team OSS project — but if scaling to a team or going commercial, adopt.

## cargo-msrv — Minimum Supported Rust Version

```bash
cargo install cargo-msrv

cargo msrv find                                             # find minimum version that compiles
cargo msrv verify                                            # verify advertised MSRV
```

Useful for libraries with users on older toolchains.

## CI Integration — GitHub Actions

```yaml
# .github/workflows/quality.yml
name: Quality

on: [push, pull_request]

env:
  CARGO_TERM_COLOR: always
  RUSTFLAGS: "-D warnings"

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - uses: Swatinem/rust-cache@v2

      - name: Format
        run: cargo fmt -- --check

      - name: Clippy
        run: cargo clippy --workspace --all-targets --all-features -- -D warnings

      - name: Install cargo-binstall
        uses: cargo-bins/cargo-binstall@main

      - name: Install audit tools
        run: cargo binstall -y cargo-deny cargo-audit cargo-machete

      - name: cargo-deny
        run: cargo deny --log-level error check

      - name: cargo-audit
        run: cargo audit

      - name: cargo-machete
        run: cargo machete

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2

      - name: Install nextest
        uses: taiki-e/install-action@nextest

      - name: Run tests
        run: cargo nextest run --workspace --profile ci

      - name: Upload JUnit
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: target/nextest/ci/junit.xml

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { components: llvm-tools-preview }
      - uses: Swatinem/rust-cache@v2

      - name: Install llvm-cov + nextest
        uses: taiki-e/install-action@v2
        with:
          tool: cargo-llvm-cov,cargo-nextest

      - name: Generate coverage
        run: cargo llvm-cov nextest --workspace --lcov --output-path lcov.info

      - uses: codecov/codecov-action@v4
        with:
          files: lcov.info
          token: ${{ secrets.CODECOV_TOKEN }}
```

## Per-Crate Configuration

### `Cargo.toml` Lints

```toml
[lints.rust]
unsafe_code = "forbid"                                     # disallow unsafe in this crate
missing_docs = "warn"

[lints.clippy]
all = "warn"
pedantic = "warn"
nursery = "warn"
cargo = "warn"

# Allow specific
module_name_repetitions = "allow"
must_use_candidate = "allow"
```

### `rustfmt.toml`

```toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
imports_granularity = "Module"
group_imports = "StdExternalCrate"
reorder_imports = true
use_field_init_shorthand = true
```

### `clippy.toml`

```toml
msrv = "1.85"
cognitive-complexity-threshold = 30
too-many-arguments-threshold = 8
type-complexity-threshold = 250
```

## Wallet App Quality Checklist

For BHODL-style production wallet, CI MUST enforce:

- [ ] `cargo fmt --check` — formatting consistent
- [ ] `cargo clippy -- -D warnings` — no clippy warnings
- [ ] `cargo deny check` — license + advisories + bans
- [ ] `cargo audit` — no known vulnerabilities
- [ ] `cargo machete` — no unused deps
- [ ] `cargo nextest run` — all tests pass
- [ ] `cargo llvm-cov` — coverage threshold (e.g., 80%)
- [ ] `cargo build --release --target <each-target>` — cross-compile works
- [ ] `cargo doc --no-deps` — docs build
- [ ] Reproducible build verification (see `infrastructure/reproducible-builds`)

For releases additionally:

- [ ] Sigstore signing (see `security/sigstore-cosign`)
- [ ] SBOM generation (`cargo sbom` or `syft`)
- [ ] Tag matches Cargo.toml version
- [ ] Changelog entry
- [ ] Reproducible build attestation

## License Strategy for Wallet Apps

Goal: ship under permissive license (MIT/Apache-2.0). Therefore deny anything more restrictive **transitively**:

| License | Action |
|---|---|
| MIT, Apache-2.0, BSD, ISC, Unlicense, CC0 | Allow |
| MPL-2.0 | Allow but be aware (file-level copyleft — modifications must be open) |
| LGPL | Allow if dynamically linked only (rare in Rust — assume static link → reject) |
| GPL-2.0, GPL-3.0 | **Reject** — would force whole app under GPL |
| AGPL | **Reject** — also affects network-served code |
| Custom / proprietary | Manually evaluate, usually reject |

`deny.toml` should explicitly omit GPL from `allow` list.

## SBOM Generation

```bash
cargo install cargo-sbom

cargo sbom --output-format spdx-json > sbom.spdx.json
cargo sbom --output-format cyclonedx-json > sbom.cyclonedx.json
```

Attach to release artifacts; sign with cosign (see `security/sigstore-cosign`).

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Skipping `cargo deny check` in CI | License/advisory drift goes unnoticed | Run on every PR |
| Using `cargo install` for every CI tool | Slow (compile from source) | Use `cargo-binstall` or `taiki-e/install-action` |
| `cargo audit ignore` without rationale | Accumulates muted advisories | Add comment explaining why each ignore is OK |
| Blindly upgrading deps via `cargo update` | Can introduce breaking change | Review changelogs, especially crypto |
| `cargo test` instead of `cargo nextest` | Slower, less robust | Switch to nextest |
| Coverage as goal in itself | Encourages low-quality tests | Coverage as floor (e.g., 80%), not target |
| `cargo deny` allowing `MPL-2.0` blindly | File-level copyleft — modifications you make to MPL files must be open | Allow only if you don't modify those files |
| Missing `multiple-versions = "warn"` in `bans` | Bloated dep tree | Always warn on duplicates |
| Allowing `unknown-git` source | Supply-chain risk via random forks | `unknown-git = "deny"` |
| No MSRV pin | Users on stable break | Set MSRV in `Cargo.toml`, verify with `cargo-msrv` |
| Static-linking GPL crate | Whole binary becomes GPL | `cargo deny` blocks |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cargo deny: license MPL-2.0 not allowed` | License not in allow list | Add to `allow`, or remove dep |
| `cargo audit: 1 vulnerability` | Transitive dep affected | `cargo update -p <vulnerable-crate>`, or `cargo audit ignore` w/ reason |
| `cargo nextest: process exited with signal 11` | Test binary segfault | Run with `--no-capture` for stderr; check unsafe code |
| Tarpaulin: `Failed to run tests` | Linux-only tool on macOS | Use `cargo llvm-cov` |
| Coverage report shows 0% | Tests didn't run or wrong instrumentation | Verify with `cargo llvm-cov nextest --workspace` |
| `cargo machete` flags `proc-macro` deps | Used at compile time only | Add to `[package.metadata.cargo-machete] ignored = [...]` |
| `cargo deny: Many duplicates` | Transitive version conflicts | `cargo tree --duplicates` to find; update or skip in deny.toml |
| Slow CI quality job | Tools install from source | Use `cargo-binstall` for pre-built binaries |
| `cargo audit fetch` fails | Network/proxy | Set `CARGO_AUDIT_DB_PATH` to pre-cached DB |
| `cargo deny: source unknown` | Git-sourced dep | Move to crates.io or whitelist URL in `[sources]` |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Cross-compile mechanics | `build-tools/rust-cross-compile` |
| Pure Rust language | `languages/rust` |
| Generic Rust testing | `testing/rust-testing` |
| Property-based testing | `testing/proptest` |
| Multi-language SBOM/vuln (Kotlin, JS, Python) | `quality/osv-scanner` |
| Sigstore signing | `security/sigstore-cosign` |
