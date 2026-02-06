---
name: open-source
description: |
  Open source readiness best practices. Covers licensing, documentation,
  community health, CI/CD, compliance, legal, and packaging.

  USE WHEN: user mentions "open source", "license", "LICENSE", "CONTRIBUTING", "CODE_OF_CONDUCT",
  "CHANGELOG", "open source readiness", "community health", "OSS compliance",
  "SPDX", "CLA", "DCO", "OpenSSF", "SBOM", "release automation", "npm publish",
  "make project open source", "prepare for open source"

  DO NOT USE FOR: Git workflow and branching - use git-workflow skill,
  Code quality and linting - use qa-expert agent,
  CI/CD pipeline design - use devops-expert agent
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Open Source Readiness - Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `git-workflow` for Git-specific documentation.

## When NOT to Use This Skill

This skill focuses on open source project setup and compliance. Do NOT use for:

- **Git commands and branching** - Use `git-workflow` skill
- **Code quality and static analysis** - Use `qa-expert` agent
- **CI/CD pipeline architecture** - Use `devops-expert` agent
- **Package development (library code)** - Use language-specific skills

## Essential Files Checklist

| File | Purpose | Priority |
|------|---------|----------|
| `LICENSE` | Legal terms for use and distribution | Required |
| `README.md` | Project overview, install, usage, badges | Required |
| `CONTRIBUTING.md` | How to contribute (setup, PR process, style) | Required |
| `CODE_OF_CONDUCT.md` | Community behavior expectations | Required |
| `SECURITY.md` | Responsible disclosure process | Required |
| `CHANGELOG.md` | Version history (Keep a Changelog) | Recommended |
| `GOVERNANCE.md` | Decision-making process | Recommended |
| `.github/CODEOWNERS` | Auto-assign reviewers by path | Recommended |
| `.github/FUNDING.yml` | Sponsorship links | Optional |
| `CITATION.cff` | Academic citation metadata | Optional |
| `NOTICE` | Third-party attributions (Apache 2.0) | Conditional |

## Quick Reference Guides

| Topic | Guide | Covers |
|-------|-------|--------|
| Licensing | [licensing.md](quick-ref/licensing.md) | License selection, SPDX, CLA/DCO, compatibility |
| Documentation | [documentation.md](quick-ref/documentation.md) | README, CONTRIBUTING, CHANGELOG, ADR templates |
| Community and Governance | [community-governance.md](quick-ref/community-governance.md) | Governance models, maintainer path, communication |
| Repository Setup | [repository-setup.md](quick-ref/repository-setup.md) | .github/, templates, CODEOWNERS, branch rules |
| CI/CD and Automation | [ci-cd-automation.md](quick-ref/ci-cd-automation.md) | GitHub Actions, releases, dependency updates |
| Compliance | [security-compliance.md](quick-ref/security-compliance.md) | OpenSSF Scorecard, SBOM, supply chain |
| Legal and Packaging | [legal-packaging.md](quick-ref/legal-packaging.md) | License headers, NOTICE, publishing, signing |
| Metrics and Inclusivity | [metrics-inclusivity.md](quick-ref/metrics-inclusivity.md) | CHAOSS metrics, inclusive language, badges |

## Decision Flowchart

```
Project needs open source setup?
 - Just starting? -> Run full Tier 1 setup
     - Choose license -> licensing.md
     - Create docs -> documentation.md
     - Setup repo -> repository-setup.md
     - Add CI -> ci-cd-automation.md
 - Already has basics? -> Run audit, fill gaps
     - Missing compliance files? -> security-compliance.md
     - No community docs? -> community-governance.md
     - No release process? -> ci-cd-automation.md
 - Publishing a package? -> legal-packaging.md
 - Growing community? -> community-governance.md + metrics-inclusivity.md
 - Compliance audit? -> security-compliance.md + legal-packaging.md
```

## License Quick Decision

| If you want... | Choose |
|-----------------|--------|
| Maximum freedom, simple | MIT |
| Patent protection included | Apache 2.0 |
| Copyleft (derivatives must be open) | GPL v3 |
| Copyleft for libraries only | LGPL v3 |
| File-level copyleft (compromise) | MPL 2.0 |
| Network copyleft (SaaS must share) | AGPL v3 |
| Public domain equivalent | Unlicense or 0BSD |

## Common Anti-Patterns

| Anti-Pattern | Why It Is Bad | Best Practice |
|--------------|---------------|---------------|
| No LICENSE file | Code is NOT open source without one | Always include LICENSE |
| LICENSE in README only | Not legally clear | Separate LICENSE file |
| No CONTRIBUTING.md | Contributors do not know how to help | Clear contribution guide |
| No CODE_OF_CONDUCT | Unwelcoming community signal | Adopt Contributor Covenant |
| Hardcoded secrets | Credential exposure risk | Use environment variables |
| No .gitignore | Accidental binary commits | Comprehensive .gitignore |
| No CI pipeline | Untested contributions | GitHub Actions CI |
| No issue templates | Low-quality bug reports | Structured YAML templates |
| Manual releases | Error-prone, inconsistent | Automated release pipeline |
| No SECURITY.md | Issues reported publicly | Private disclosure process |
