---
name: osv-scanner
description: |
  OSV-Scanner — language-agnostic vulnerability scanner by Google, queries the
  OSV.dev database (aggregates RustSec, GHSA, PyPA, npm advisories, Go vulndb,
  etc.). Scans Cargo.lock, package-lock.json, pnpm-lock.yaml, Pipfile.lock,
  go.sum, Gradle dependency tree, container images, and Git submodules.
  Replaces multiple language-specific scanners with one tool. CI integration
  with SARIF output.

  USE WHEN: user mentions "osv-scanner", "osv.dev", "OSV scanner", "OSV database",
  "GHSA", "language-agnostic vuln scan", "supply chain vulnerability scan",
  "deps.dev", "Google OSV"

  DO NOT USE FOR: Rust-specific advisory enforcement (policy) - use `quality/rust-supply-chain`
  DO NOT USE FOR: Container scanning depth - use Trivy / Grype skills
  DO NOT USE FOR: Code SAST (CodeQL, Semgrep) - use security-specific skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OSV-Scanner — Cross-Language Vuln Scanner

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `osv-scanner` or `osv`.

## Why OSV

OSV (Open Source Vulnerabilities) is Google-led project with two parts:
1. **OSV.dev** — distributed vulnerability database aggregating from many sources
2. **OSV-Scanner** — CLI client that scans your project against OSV.dev

OSV.dev aggregates:
- **RustSec Advisory DB** (Rust crates)
- **GitHub Security Advisory (GHSA)** (npm, Maven, NuGet, etc.)
- **PyPA Advisory DB** (Python)
- **Go vulndb**
- **Android security bulletins**
- **Linux distro CVEs**
- **OSS-Fuzz findings**
- **Ruby Advisory DB**
- **Hex.pm (Erlang)**, **Pub.dev (Dart)**, **Packagist (PHP)**

Single source of truth, single tool. Replaces:
- `cargo audit` (still useful but redundant if you run osv-scanner)
- `npm audit` / `pnpm audit` / `yarn audit`
- `pip-audit`
- `govulncheck`
- `bundler-audit`

For polyglot projects (BHODL: Rust + Kotlin + Swift + JS tooling): **one scanner for all**.

## Install

```bash
# macOS
brew install osv-scanner

# Linux / Windows: download from GitHub releases
curl -L https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_amd64 \
    -o osv-scanner
chmod +x osv-scanner && sudo mv osv-scanner /usr/local/bin/

# Or via Go
go install github.com/google/osv-scanner/cmd/osv-scanner@latest

# Verify
osv-scanner --version
```

## Basic Usage

```bash
# Scan current directory (auto-detects all lockfiles)
osv-scanner -r .

# Specific lockfile
osv-scanner --lockfile=Cargo.lock
osv-scanner --lockfile=package-lock.json
osv-scanner --lockfile=pnpm-lock.yaml
osv-scanner --lockfile=requirements.txt
osv-scanner --lockfile=go.mod

# Scan SBOM (CycloneDX or SPDX)
osv-scanner --sbom=sbom.cdx.json
osv-scanner --sbom=sbom.spdx.json

# Container image (uses syft under the hood)
osv-scanner --docker=ghcr.io/bhodl/api:1.0.0
```

For multi-language projects:

```bash
osv-scanner -r . \
    --lockfile=Cargo.lock \
    --lockfile=apps/android/app/build.gradle.kts \
    --lockfile=tooling/package-lock.json
```

OSV-Scanner detects lockfile type automatically — `-r .` is usually enough.

## Output

```
Scanning dir .
Scanned <path>/Cargo.lock file and found 145 packages
Scanned <path>/package-lock.json file and found 873 packages

╭─────────────────────────────────────┬──────┬───────────────┬───────────────────────╮
│ OSV URL                             │ ECOS │ PACKAGE       │ VERSION               │
├─────────────────────────────────────┼──────┼───────────────┼───────────────────────┤
│ https://osv.dev/RUSTSEC-2024-0123   │ Crat │ openssl       │ 0.10.50               │
│   ↳ Severity: HIGH                  │      │               │  → fixed in 0.10.55   │
│   ↳ CVE-2024-12345                  │      │               │                       │
├─────────────────────────────────────┼──────┼───────────────┼───────────────────────┤
│ https://osv.dev/GHSA-1234-5678      │ npm  │ ws            │ 8.10.0                │
│   ↳ Severity: MEDIUM                │      │               │  → fixed in 8.17.1    │
╰─────────────────────────────────────┴──────┴───────────────┴───────────────────────╯
```

Exit code:
- `0` — no vulnerabilities found
- `1` — vulnerabilities found
- `127` — error

## Output Formats

```bash
osv-scanner -r . --format=json > report.json
osv-scanner -r . --format=sarif > report.sarif       # GitHub Code Scanning
osv-scanner -r . --format=table                        # default
osv-scanner -r . --format=markdown
osv-scanner -r . --format=cyclonedx                    # SBOM-ish
```

## Configuration — `.osv-scanner.toml`

```toml
[[IgnoredVulns]]
id = "GHSA-xxxx-xxxx-xxxx"
ignoreUntil = 2026-12-31
reason = "Not exploitable in our use case (path X never reached)"

[[IgnoredVulns]]
id = "RUSTSEC-2024-0123"
reason = "Vulnerable code path is dev-only, not in release build"

[[PackageOverrides]]
name = "tokio"
version = "1.0.0"
license = { ignore = true }
```

Place at project root. OSV-Scanner reads automatically.

## Severity Levels

OSV uses CVSS scores:
- **CRITICAL** — 9.0-10.0 (immediate action)
- **HIGH** — 7.0-8.9 (urgent)
- **MEDIUM** — 4.0-6.9 (planned fix)
- **LOW** — 0.1-3.9 (acceptable risk)

For wallet apps: treat **HIGH** and **CRITICAL** as merge-blocking. **MEDIUM** as backlog item with rationale.

## CI Integration — GitHub Actions

### Quick scan on PR

```yaml
# .github/workflows/security.yml
name: Vulnerability scan

on: [push, pull_request]

jobs:
  osv-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@v1.9.0
        with:
          scan-args: |
            --recursive
            --skip-git
            ./
        # OR: direct CLI usage
```

### Direct CLI

```yaml
- name: Install OSV-Scanner
  run: |
    curl -L https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_amd64 \
        -o /usr/local/bin/osv-scanner
    chmod +x /usr/local/bin/osv-scanner

- name: Scan
  run: osv-scanner -r . --format=sarif --output=results.sarif

- name: Upload SARIF to GitHub Code Scanning
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### Weekly Scheduled Scan (Catches new CVEs in existing deps)

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'                   # Monday 6am UTC

jobs:
  weekly-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: main }
      - run: osv-scanner -r .
      - name: Open issue if vulns found
        if: failure()
        uses: peter-evans/create-issue-from-file@v5
        with:
          title: "OSV: weekly scan found vulnerabilities"
          content-filepath: results.json
          labels: security,vulnerability
```

## Comparison with Other Scanners

| Tool | Languages | Source | Use case |
|---|---|---|---|
| **OSV-Scanner** | All major | OSV.dev (aggregator) | Universal scanner |
| **cargo-audit** | Rust only | RustSec | Quick Rust check |
| **cargo-deny** | Rust only | RustSec + license + bans | Policy enforcement |
| **npm audit** | JS only | GHSA via npm registry | Built-in npm |
| **Snyk** | All major | Snyk DB (commercial) | Enterprise SaaS |
| **Trivy** | OS + langs + container | Multiple | Container-focused |
| **Dependabot** | All major | GHSA | GitHub-native auto-PRs |
| **Renovate** | All major | OSV + others | Dep updates with PRs |

For BHODL CI: **OSV-Scanner + cargo-deny + Renovate** = comprehensive coverage.

## OSV.dev API (Programmatic Access)

```bash
# Query single package
curl -X POST https://api.osv.dev/v1/query \
    -d '{"package": {"name": "tokio", "ecosystem": "crates.io"}, "version": "1.0.0"}'

# Get vulnerability details
curl https://api.osv.dev/v1/vulns/RUSTSEC-2024-0001

# Batch query
curl -X POST https://api.osv.dev/v1/querybatch \
    -d @batch.json
```

Useful for custom dashboards or integration with internal security tools.

## Wallet App Security Checklist

For BHODL-style production:

- [ ] OSV-Scanner runs on every PR
- [ ] OSV-Scanner runs weekly on `main` (catches new CVEs in unchanged deps)
- [ ] HIGH/CRITICAL block merge
- [ ] MEDIUM tracked as issue with rationale
- [ ] LOW logged but not blocking
- [ ] `cargo deny` for license + ban policies (Rust-specific)
- [ ] Renovate or Dependabot for auto-PR updates
- [ ] SBOM generated and signed (cosign)
- [ ] Vulnerability disclosure policy (`SECURITY.md`)
- [ ] Time-to-patch SLO (e.g., HIGH within 48h)

## Comparison with cargo-audit

OSV-Scanner can fully replace `cargo audit` for Rust:

```bash
# cargo audit
cargo audit                           # checks Cargo.lock against RustSec

# OSV-Scanner
osv-scanner --lockfile=Cargo.lock     # checks Cargo.lock against OSV.dev (which includes RustSec)
```

Both query the same advisories; OSV-Scanner adds:
- Cross-ecosystem scanning (one tool for Rust + JS + Python + Go + ...)
- Container scanning
- SBOM input
- Better SARIF output

For Rust-only projects: cargo-audit + cargo-deny is fine. For polyglot: prefer OSV-Scanner + cargo-deny.

## SBOM Generation Pairing

Generate SBOM for archival, then scan repeatedly:

```bash
# Rust SBOM
cargo sbom --output-format cyclonedx-json > rust-sbom.cdx.json

# Node SBOM
npx @cyclonedx/cyclonedx-npm --output-file js-sbom.cdx.json

# Container SBOM
syft ghcr.io/bhodl/api:1.0.0 -o cyclonedx-json > container-sbom.cdx.json

# Scan SBOMs (combine into one if possible)
osv-scanner --sbom=rust-sbom.cdx.json --sbom=js-sbom.cdx.json
```

Sign SBOMs with cosign (see `security/sigstore-cosign`).

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Running OSV-Scanner only on PR | New CVEs in stable deps go undetected | Schedule weekly scan on main |
| Ignoring HIGH severity vulns | Real exploit risk | Block merge or document waiver |
| Generic `--format=table` in CI | Hard to parse | Use SARIF or JSON for tooling |
| Vulnerability ignore without `reason` | Future maintainer can't audit | Always explain in `.osv-scanner.toml` |
| Single-shot scan (no schedule) | Silent decay | Weekly + per-PR |
| Trusting only OSV-Scanner | Some advisories slow to land | Pair with `cargo audit` for Rust |
| Lock files in `.gitignore` | Can't reproduce vulns | Always commit `Cargo.lock`, `package-lock.json`, etc. |
| Allow-listing entire crate | Loses future advisories | Pin to specific advisory ID |
| Running on host with old OSV-Scanner version | Outdated DB | Update tool weekly via dependabot or auto-update CI |
| Skipping non-prod deps from scan | dev tools also have CVEs | Scan both deps and dev-deps |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to scan package` | Lockfile format unsupported | Update OSV-Scanner version |
| Many false positives | Strict version match without context | Use `.osv-scanner.toml` to ignore with reason |
| Slow scan | Many lockfiles | Scan only changed lockfiles in PR |
| `lockfile not found` | Wrong path or repo layout | Specify with `--lockfile=path` |
| SARIF upload to GitHub fails | Permissions | Add `security-events: write` to workflow permissions |
| Different results local vs CI | Different OSV-Scanner version | Pin version in CI |
| Dep update breaks scan | Lockfile drift | Rerun `cargo update` etc. + commit |
| Container scan slow | Large image | Layer-by-layer scan with syft + osv-scanner |
| Reports vulns in transitive deps you can't fix | Upstream not updated | Document, escalate to upstream, or vendor + patch |
| `Cargo.lock` scan misses Rust nightly | Some advisories are nightly-only | Acceptable; use stable channel |

## Public OSV.dev Alternatives

| Source | Note |
|---|---|
| **deps.dev** (Google) | Same data as OSV.dev, web UI |
| **Snyk Vulnerability DB** | Commercial (Snyk acct), broader coverage including license |
| **NVD (NIST)** | Authoritative CVE source but slow + low-quality metadata |
| **GitHub Advisory Database** | Subset of OSV; useful for browsing |

For BHODL: stick with OSV.dev (free, comprehensive, fast).

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Rust-specific policy enforcement | `quality/rust-supply-chain` (cargo-deny) |
| Container deep scanning (OS packages) | Trivy / Grype |
| SAST (code-level vuln scan) | CodeQL, Semgrep, security-specific skills |
| Secret scanning | `truffleHog`, `git-secrets`, `gitleaks` |
| License compliance | `cargo deny check licenses`, FOSSA, license-checker |
| iOS/Android-specific vuln (CocoaPods, Maven) | OSV-Scanner DOES cover these |
