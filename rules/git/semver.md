---
id: semver
name: Semantic Versioning
description: Version bumps follow semver — PATCH for fixes, MINOR for features, MAJOR for breaking changes
category: git
recommended: true
---

# Semantic Versioning

Version format: `MAJOR.MINOR.PATCH`

| Bump | When | Resets |
|------|------|--------|
| PATCH `x.x.+1` | Bug fixes only, no new features | — |
| MINOR `x.+1.0` | New backwards-compatible feature or capability | PATCH → 0 |
| MAJOR `+1.0.0` | Breaking change — existing config/API no longer compatible | MINOR + PATCH → 0 |

**Rules:**
- Do NOT change version numbers in regular work commits
- Only bump the version in a dedicated release commit, together with the CHANGELOG update
- A MINOR bump always produces `x.N.0` — the PATCH counter resets (never skip to `x.N.2`)
- When in doubt between PATCH and MINOR: prefer MINOR if any new capability is visible to users
