# Security and Compliance Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/security-compliance.md` for complete documentation.

## SECURITY.md Complete Policy Template

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x.x | Yes |
| 1.x.x | Critical fixes only |
| < 1.0 | No |

## Reporting

Please report security issues responsibly. **Do NOT open a public issue.**

### How to Report

1. **GitHub Security Advisories** (preferred):
   Navigate to [Security Advisories](https://github.com/ORG/REPO/security/advisories/new)
   and create a private advisory.

2. **Email**: security@example.com
   Encrypt with our PGP key if possible (see below).

### What to Include

- Type of issue (buffer overflow, injection, privilege escalation, etc.)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment

### PGP Key

\`\`\`
[Your PGP public key or link to keyserver]
\`\`\`

## Response Process

| Step | Timeline |
|------|----------|
| Acknowledgment | Within 48 hours |
| Triage and initial assessment | Within 1 week |
| Fix development and testing | 2-4 weeks |
| Pre-disclosure notification | 1 week before public disclosure |
| Public disclosure and patch release | After fix is available |

## Disclosure Policy

We follow [Coordinated Disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):

1. Reporter submits issue privately
2. We acknowledge and begin assessment
3. We develop and test a fix
4. We release the fix and publish an advisory
5. We credit the reporter (unless they prefer anonymity)

## Bug Bounty

[Optional: Describe bug bounty program or link to platform like HackerOne]

## Security Updates

Subscribe to security notifications:
- Watch this repository for "Security advisories"
- Follow our [RSS feed / mailing list]
```

## OpenSSF Scorecard

The OpenSSF Scorecard evaluates open source project health across 20 automated checks.

### All 20 Checks

| Check | What It Measures | Weight |
|-------|-----------------|--------|
| **Binary-Artifacts** | No checked-in binaries | Critical |
| **Branch-Protection** | Branch protection rules enabled | High |
| **CI-Tests** | CI tests run on PRs | High |
| **CII-Best-Practices** | OpenSSF Best Practices badge | Medium |
| **Code-Review** | PRs require review before merge | High |
| **Contributors** | Multiple organizations contributing | Low |
| **Dangerous-Workflow** | No dangerous patterns in CI | Critical |
| **Dependency-Update-Tool** | Dependabot/Renovate configured | High |
| **Fuzzing** | Fuzz testing (OSS-Fuzz, ClusterFuzzLite) | Medium |
| **License** | License file present and recognized | High |
| **Maintained** | Recent commits and issue responses | High |
| **Packaging** | Published through official channels | Medium |
| **Pinned-Dependencies** | CI dependencies use hashes, not tags | High |
| **SAST** | Static analysis tools configured | Medium |
| **Security-Policy** | SECURITY.md present | Medium |
| **Signed-Releases** | Releases are signed | High |
| **Token-Permissions** | Minimal token permissions in CI | High |
| **Vulnerabilities** | Known issues are addressed | High |
| **Webhooks** | Webhook tokens are secured | Low |
| **SBOM** | Software Bill of Materials generated | Medium |

### GitHub Actions Scorecard Workflow

```yaml
name: OpenSSF Scorecard

on:
  push:
    branches: [main]
  schedule:
    - cron: '30 1 * * 1'  # Weekly on Monday

permissions: read-all

jobs:
  analysis:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run Scorecard
        uses: ossf/scorecard-action@v2
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true

      - name: Upload to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

### Running Locally
```bash
# Install scorecard CLI
go install github.com/ossf/scorecard/v5/cmd/scorecard@latest

# Run against a repo
scorecard --repo=github.com/org/repo

# Run with specific checks
scorecard --repo=github.com/org/repo --checks=Branch-Protection,Code-Review
```

## OpenSSF Best Practices Badge

Three levels of compliance:

| Level | Requirements | Badge |
|-------|-------------|-------|
| **Passing** | 67 criteria (basics) | ![passing](https://img.shields.io/badge/openssf-passing-green) |
| **Silver** | Passing + 22 additional | ![silver](https://img.shields.io/badge/openssf-silver-lightgrey) |
| **Gold** | Silver + 24 additional | ![gold](https://img.shields.io/badge/openssf-gold-yellow) |

### Key Passing Criteria
- Project has a license (FLOSS)
- Project has a working build system
- Project has an automated test suite
- Project has a contribution guide
- Project has a security reporting process
- Project uses HTTPS for sites
- Project has at least one primary developer who understands secure coding

> Apply at: https://www.bestpractices.dev/en

## SBOM Generation

### What is an SBOM?
A Software Bill of Materials (SBOM) lists all components, libraries, and dependencies in your software.

### Formats

| Format | Maintained By | Best For |
|--------|--------------|----------|
| **CycloneDX** | OWASP | Application security, broad tooling |
| **SPDX** | Linux Foundation | License compliance, legal |
| **SWID** | ISO/IEC | Enterprise software inventory |

### Generate with Syft

```bash
# Install Syft
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# Generate SBOM from directory
syft dir:. -o cyclonedx-json > sbom.cdx.json
syft dir:. -o spdx-json > sbom.spdx.json

# Generate from container image
syft myimage:latest -o cyclonedx-json > sbom.cdx.json
```

### Generate with CycloneDX

```bash
# Node.js
npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json

# Python
pip install cyclonedx-bom
cyclonedx-py environment -o sbom.cdx.json

# Java/Maven
./mvnw org.cyclonedx:cyclonedx-maven-plugin:makeBom

# Go
go install github.com/CycloneDX/cyclonedx-gomod/cmd/cyclonedx-gomod@latest
cyclonedx-gomod mod -json -output sbom.cdx.json
```

### GitHub Actions SBOM Workflow
```yaml
name: SBOM

on:
  release:
    types: [published]

jobs:
  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: anchore/sbom-action@v0
        with:
          artifact-name: sbom.spdx.json
          output-file: sbom.spdx.json

      - uses: softprops/action-gh-release@v2
        with:
          files: sbom.spdx.json
```

## Supply Chain Security

### SLSA Framework (Supply-chain Levels for Software Artifacts)

| Level | Requirements | Description |
|-------|-------------|-------------|
| **SLSA 1** | Documentation of build process | Basic provenance |
| **SLSA 2** | Hosted build, signed provenance | Tamper resistance |
| **SLSA 3** | Hardened builds, non-falsifiable provenance | Full protection |

### Sigstore (Keyless Signing)

```bash
# Install cosign
go install github.com/sigstore/cosign/v2/cmd/cosign@latest

# Sign a container image (keyless, uses OIDC)
cosign sign myregistry.io/myimage:v1.0.0

# Verify a signature
cosign verify myregistry.io/myimage:v1.0.0

# Sign a blob (file)
cosign sign-blob --output-signature sig.txt myartifact.tar.gz

# Verify a blob
cosign verify-blob --signature sig.txt myartifact.tar.gz
```

### npm Provenance

```bash
# Publish with provenance (requires GitHub Actions OIDC)
npm publish --provenance

# In package.json
{
  "publishConfig": {
    "provenance": true
  }
}
```

**GitHub Actions for npm provenance:**
```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Required for provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## GitHub Security Features

| Feature | What It Does | How to Enable |
|---------|-------------|---------------|
| **Dependabot Alerts** | Alerts on known dependency issues | Settings > Security > Dependabot |
| **Dependabot Updates** | Auto-PRs for dependency updates | `.github/dependabot.yml` |
| **Code Scanning** | SAST via CodeQL or third-party | `.github/workflows/codeql.yml` |
| **Secret Scanning** | Detect committed secrets | Settings > Security > Secret scanning |
| **Private Reporting** | Private issue reporting | Settings > Security > Advisories |
| **Dependency Review** | Review deps in PRs | `actions/dependency-review-action` |

### Enable All Security Features
```bash
# Via GitHub API
gh api repos/{owner}/{repo} \
  --method PATCH \
  --field security_and_analysis[secret_scanning][status]=enabled \
  --field security_and_analysis[secret_scanning_push_protection][status]=enabled
```

## Security Advisories and CVE

### Creating a Security Advisory

1. Go to repository > Security > Advisories
2. Click "New draft security advisory"
3. Fill in:
   - Ecosystem (npm, pip, Maven, etc.)
   - Package name
   - Affected versions
   - Patched versions
   - Severity (CVSS score)
   - Description
4. Request a CVE ID (GitHub can assign one)
5. Collaborate on fix in private fork
6. Publish advisory when fix is released

### CVSS Severity Levels

| Score | Severity | Action |
|-------|----------|--------|
| 0.0 | None | Informational |
| 0.1 - 3.9 | Low | Fix in next release |
| 4.0 - 6.9 | Medium | Fix in current sprint |
| 7.0 - 8.9 | High | Fix within 1 week |
| 9.0 - 10.0 | Critical | Fix immediately |
