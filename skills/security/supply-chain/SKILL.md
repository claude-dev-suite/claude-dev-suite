---
name: supply-chain
description: |
  Software supply chain security. Covers dependency management, SBOM generation,
  package integrity verification, and CI/CD security. OWASP A03:2025.

  USE WHEN: user mentions "supply chain", "dependencies", "npm audit", "SBOM", "vulnerable packages", asks about "dependency scanning", "lockfiles", "Dependabot", "typosquatting", "CI/CD security"

  DO NOT USE FOR: license compliance - use `license-compliance`, secrets - use `secrets-management`, general OWASP - use `owasp-top-10`
allowed-tools: Read, Grep, Glob
---

# Supply Chain Security

OWASP A03:2025 - Software Supply Chain Failures

## When NOT to Use This Skill
- **License compliance** - Use `license-compliance` skill for SPDX and license auditing
- **Secrets in dependencies** - Use `secrets-management` for credential issues
- **Application-level vulnerabilities** - Use `owasp-top-10` for code security
- **Git/GitHub operations** - Use Git skills for repository management

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `security` for comprehensive documentation.

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vulnerable dependencies | RCE, data breach | Regular audits, auto-updates |
| Typosquatting | Malicious code execution | Verify package names |
| Compromised packages | Backdoors, malware | Lockfiles, integrity checks |
| CI/CD pipeline attacks | Code injection, secrets theft | Least privilege, signed commits |

## Dependency Auditing

### Node.js
```bash
# Built-in audit
npm audit
npm audit fix
npm audit --json > audit.json

# Advanced scanning
npx snyk test
npx retire

# Auto-fix PRs
# Use Dependabot or Renovate
```

### Python
```bash
# pip-audit
pip-audit
pip-audit --output=json

# Safety
safety check
safety check -r requirements.txt

# pip install with hash verification
pip install --require-hashes -r requirements.txt
```

### Java
```bash
# OWASP Dependency Check
mvn dependency-check:check
./gradlew dependencyCheckAnalyze

# Snyk
snyk test --all-projects
```

## Lockfiles

Always commit and use lockfiles:

| Package Manager | Lockfile | Install Command |
|----------------|----------|-----------------|
| npm | package-lock.json | `npm ci` |
| yarn | yarn.lock | `yarn install --frozen-lockfile` |
| pnpm | pnpm-lock.yaml | `pnpm install --frozen-lockfile` |
| pip | requirements.txt (with hashes) | `pip install --require-hashes` |
| poetry | poetry.lock | `poetry install --no-root` |

```bash
# npm - use ci in CI/CD
npm ci  # NOT npm install

# Verify integrity
npm audit signatures
```

## SBOM Generation

Software Bill of Materials for transparency:

```bash
# CycloneDX format
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# SPDX format
npx spdx-sbom-generator

# Syft (multi-language)
syft . -o cyclonedx-json > sbom.json
```

## Package Integrity

### Subresource Integrity (SRI)
```html
<script src="https://cdn.example.com/lib.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/..."
  crossorigin="anonymous">
</script>
```

### npm package verification
```bash
# Verify signatures
npm audit signatures

# Disable postinstall scripts
npm config set ignore-scripts true

# Or per-install
npm install --ignore-scripts
```

## CI/CD Security

### GitHub Actions
```yaml
# Pin actions to SHA
- uses: actions/checkout@8ade135a41bc03ea155e62e844d188df1ea18608 # v4.1.0

# Minimal permissions
permissions:
  contents: read
  packages: write

# Signed commits requirement
# Enable in repo settings: "Require signed commits"
```

### Secrets in CI/CD
```yaml
# Never echo secrets
- run: |
    # Wrong
    echo ${{ secrets.API_KEY }}

    # Right - use as env var
    env:
      API_KEY: ${{ secrets.API_KEY }}
    run: ./deploy.sh
```

## Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: "development"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]
```

## Security Checklist

- [ ] All dependencies audited regularly
- [ ] Lockfiles committed and enforced
- [ ] CI/CD uses `npm ci` / frozen lockfile
- [ ] Dependabot/Renovate enabled
- [ ] SBOM generated for releases
- [ ] Package signatures verified
- [ ] Post-install scripts disabled in CI
- [ ] GitHub Actions pinned to SHA
- [ ] Minimal CI/CD permissions

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `npm install` in CI | Non-deterministic builds | Use `npm ci` with lockfiles |
| Not committing lockfiles | Inconsistent dependencies | Always commit package-lock.json |
| Ignoring audit warnings | Known vulnerabilities in prod | Fix or accept risk explicitly |
| Using wildcards in versions (^, ~) | Unexpected breaking changes | Pin exact versions for critical deps |
| Running postinstall scripts blindly | Malicious code execution | Use `--ignore-scripts` or audit first |
| No Dependabot/Renovate | Manual dependency updates | Enable automated PR creation |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| npm audit shows 100+ vulnerabilities | Transitive dependencies | Run `npm audit fix`, check for breaking changes |
| Lockfile conflicts in PR | Different npm versions | Use same npm version across team (in .nvmrc) |
| CI build fails after dependency update | Breaking change in minor version | Pin exact versions, test before merging |
| Package not found during install | Typosquatting or removed package | Verify package name on npmjs.com |
| SBOM generation fails | Missing dependencies | Run `npm ci` before generating SBOM |
| Dependabot PRs failing | Incompatible version | Review changelog, may need code changes |

## Related Skills
- [OWASP Top 10](../owasp-top-10/SKILL.md)
- [GitHub Actions](../../ci-cd/github-actions/SKILL.md)
- [License Compliance](../license-compliance/SKILL.md)
