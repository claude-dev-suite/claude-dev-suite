---
name: license-compliance
description: |
  Open source license compliance and SPDX standards. Covers license types,
  compatibility, auditing with license-checker, and SBOM generation.

  USE WHEN: user mentions "license", "SPDX", "GPL", "MIT", "Apache", asks about "license compatibility", "license-checker", "copyleft", "proprietary compliance", "OSI approved"

  DO NOT USE FOR: dependency vulnerabilities - use `supply-chain`, security scanning - use `owasp-top-10`, secrets - use `secrets-management`
allowed-tools: Read, Grep, Glob
---
# License Compliance

## When NOT to Use This Skill
- **Security vulnerabilities** - Use `supply-chain` skill for dependency security
- **Code quality issues** - Use quality skills for linting/complexity
- **Secrets in dependencies** - Use `secrets-management` skill
- **Package integrity** - Use `supply-chain` for SBOM and verification

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spdx` for comprehensive documentation.

## Official References

| Resource | URL |
|----------|-----|
| SPDX License List | https://spdx.org/licenses/ |
| SPDX Specification | https://spdx.github.io/spdx-spec/ |
| OSI Approved Licenses | https://opensource.org/licenses/ |
| Choose a License | https://choosealicense.com/ |
| license-checker | https://www.npmjs.com/package/license-checker-rseidelsohn |

---

## License Categories

### By Permissiveness

| Category | Licenses | Commercial Use |
|----------|----------|----------------|
| **Public Domain** | Unlicense, CC0-1.0 | Unrestricted |
| **Permissive** | MIT, Apache-2.0, BSD-3-Clause, ISC | Allowed |
| **Weak Copyleft** | LGPL-3.0, MPL-2.0, EPL-2.0 | Allowed (with conditions) |
| **Strong Copyleft** | GPL-3.0, AGPL-3.0 | Must open source |
| **Network Copyleft** | AGPL-3.0, SSPL-1.0 | Network use triggers |

### Common SPDX Identifiers

| License | SPDX ID | OSI | FSF |
|---------|---------|-----|-----|
| MIT License | `MIT` | ✓ | ✓ |
| Apache 2.0 | `Apache-2.0` | ✓ | ✓ |
| BSD 3-Clause | `BSD-3-Clause` | ✓ | ✓ |
| ISC License | `ISC` | ✓ | ✓ |
| GPL 3.0 | `GPL-3.0-only` | ✓ | ✓ |
| GPL 3.0+ | `GPL-3.0-or-later` | ✓ | ✓ |
| LGPL 3.0 | `LGPL-3.0-only` | ✓ | ✓ |
| MPL 2.0 | `MPL-2.0` | ✓ | ✓ |
| AGPL 3.0 | `AGPL-3.0-only` | ✓ | ✓ |
| Unlicense | `Unlicense` | ✓ | ✓ |

---

## Compatibility Matrix

### Inbound → Outbound

| Your Project | Can Include |
|--------------|-------------|
| MIT | MIT, BSD, ISC, Unlicense, CC0 |
| Apache-2.0 | MIT, BSD, ISC, Apache-2.0, Unlicense |
| LGPL-3.0 | MIT, BSD, ISC, Apache-2.0, LGPL, GPL (as library) |
| GPL-3.0 | Most licenses (output must be GPL) |
| Proprietary | MIT, BSD, ISC, Apache-2.0 (check attribution) |

### Incompatibilities

| License A | Incompatible With |
|-----------|-------------------|
| GPL-2.0-only | Apache-2.0 (patent clause conflict) |
| GPL-3.0 | GPL-2.0-only |
| AGPL-3.0 | Proprietary SaaS (network clause) |
| SSPL-1.0 | Not OSI approved, restricted use |

---

## NPM License Auditing

### license-checker

```bash
# Install
npm install -g license-checker-rseidelsohn

# Basic scan
license-checker

# JSON output
license-checker --json > licenses.json

# Summary only
license-checker --summary

# Production only
license-checker --production

# Exclude dev dependencies
license-checker --production --json
```

### Allowlist Configuration

```bash
# Only allow specific licenses
license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC;0BSD"

# Fail on copyleft licenses
license-checker --failOn "GPL-3.0;AGPL-3.0;GPL-2.0"

# Exclude packages
license-checker --excludePackages "internal-pkg@1.0.0"
```

### @onebeyond/license-checker

```bash
npm install -g @onebeyond/license-checker

# Scan with allowlist
npx @onebeyond/license-checker scan --allowOnly MIT Apache-2.0 BSD-3-Clause

# Check SPDX compliance
npx @onebeyond/license-checker check "MIT OR Apache-2.0"
```

### license-compliance

```bash
npm install -g license-compliance

# Check compliance
license-compliance --production --allow "MIT;ISC;Apache-2.0"

# Generate report
license-compliance --report licenses.csv
```

---

## SBOM Generation

### CycloneDX

```bash
# Install
npm install -g @cyclonedx/cyclonedx-npm

# Generate SBOM
cyclonedx-npm --output-file sbom.json

# Specific format
cyclonedx-npm --output-format XML --output-file sbom.xml

# Include dev dependencies
cyclonedx-npm --include-dev --output-file sbom.json
```

### SPDX

```bash
# Using Syft
syft . -o spdx-json > sbom-spdx.json

# Verify SBOM
syft validate sbom-spdx.json
```

### SBOM in package.json

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "license": "MIT",
  "licenses": [
    {
      "type": "MIT",
      "url": "https://opensource.org/licenses/MIT"
    }
  ]
}
```

---

## CI Integration

### GitHub Actions

```yaml
name: License Compliance

on: [push, pull_request]

jobs:
  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Check licenses
        run: |
          npx license-checker-rseidelsohn \
            --production \
            --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;BSD-2-Clause;ISC;0BSD;Unlicense;CC0-1.0" \
            --excludePrivatePackages

      - name: Generate SBOM
        run: |
          npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json
```

### Pre-commit Hook

```json
// package.json
{
  "scripts": {
    "license:check": "license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-3-Clause;ISC'",
    "preinstall": "npm run license:check || true"
  }
}
```

---

## License File Templates

### MIT License

```
MIT License

Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache 2.0 NOTICE

```
MyProject
Copyright [year] [owner]

This product includes software developed at
[Company Name] (https://www.example.com/).

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## Attribution Requirements

### By License Type

| License | Requirements |
|---------|--------------|
| MIT | Include copyright + license |
| Apache-2.0 | Include copyright + license + NOTICE if present |
| BSD-3-Clause | Include copyright + license |
| LGPL-3.0 | Provide source for modifications |
| GPL-3.0 | Provide complete source |

### Generating Attribution

```bash
# Generate NOTICES file
license-checker --production --customFormat '{"name": "", "version": "", "license": "", "repository": ""}' \
  | jq -r '.[] | "- \(.name)@\(.version) - \(.license)\n  \(.repository)\n"' \
  > NOTICES.md
```

### NOTICES.md Template

```markdown
# Third-Party Notices

This project includes the following third-party software:

## MIT License

### lodash (4.17.21)
- Repository: https://github.com/lodash/lodash
- Copyright (c) JS Foundation and other contributors

### axios (1.6.0)
- Repository: https://github.com/axios/axios
- Copyright (c) 2014-present Matt Zabriskie

## Apache-2.0 License

### typescript (5.3.0)
- Repository: https://github.com/microsoft/TypeScript
- Copyright (c) Microsoft Corporation
```

---

## Risk Assessment

### High Risk (Avoid in Proprietary)

| License | Risk | Mitigation |
|---------|------|------------|
| GPL-3.0 | Copyleft | Use LGPL version or alternatives |
| AGPL-3.0 | Network copyleft | Avoid in SaaS products |
| SSPL-1.0 | Service restriction | Use alternatives (MongoDB) |
| CPAL-1.0 | Attribution in UI | Check UI requirements |

### Medium Risk (Review Carefully)

| License | Risk | Mitigation |
|---------|------|------------|
| LGPL-3.0 | Dynamic linking | Ensure dynamic linking |
| MPL-2.0 | File-level copyleft | Keep modifications separate |
| EPL-2.0 | Patent grants | Review patent clauses |

### Low Risk (Generally Safe)

| License | Notes |
|---------|-------|
| MIT | Include license/copyright |
| Apache-2.0 | Include license + NOTICE |
| BSD-3-Clause | Include license/copyright |
| ISC | Include license/copyright |

---

## Checklist

### Initial Setup
- [ ] Choose appropriate license for project
- [ ] Add LICENSE file to repository
- [ ] Add license field to package.json
- [ ] Configure license-checker in CI

### Ongoing Compliance
- [ ] Audit new dependencies before adding
- [ ] Reject incompatible licenses in PR review
- [ ] Generate SBOM for releases
- [ ] Maintain NOTICES file
- [ ] Review license changes in updates

### Release
- [ ] License file included in distribution
- [ ] Third-party notices generated
- [ ] SBOM attached to release
- [ ] No copyleft violations

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not checking licenses before adding deps | Legal risk, copyleft violations | Use license-checker in CI |
| Using GPL in proprietary software | Must open source entire app | Use MIT/Apache or LGPL as library |
| No NOTICES file for attribution | Violates license terms | Generate NOTICES from dependencies |
| Ignoring license changes in updates | New version may have different license | Review license in Dependabot PRs |
| Using unlicensed packages | Unclear legal status | Only use packages with explicit licenses |
| Mixing GPL-2.0 and Apache-2.0 | Incompatible licenses | Choose compatible stack |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| license-checker fails on install | Missing package.json license field | Add `"license": "MIT"` to package.json |
| GPL dependency found in proprietary | Transitive dependency | Find alternative or use as separate service |
| Multiple licenses for same package | Dual-licensed | Choose compatible license (usually MIT/Apache) |
| SPDX validation fails | Invalid SPDX identifier | Use exact ID from spdx.org/licenses |
| License allowlist too strict | Blocks common licenses | Add ISC, 0BSD to allowlist |
| No license file in distribution | Missing LICENSE file | Copy LICENSE to dist/ in build |

## Related Skills

- [Supply Chain Security](../supply-chain/SKILL.md)
- [GitHub Actions](../../ci-cd/github-actions/SKILL.md)
