# Licensing Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/licensing.md` for complete documentation.

## License Comparison Table

| License | Type | Patent Grant | Copyleft | Compatible with GPL | SPDX ID |
|---------|------|-------------|----------|---------------------|---------|
| MIT | Permissive | No | No | Yes | `MIT` |
| Apache 2.0 | Permissive | Yes | No | Yes (GPLv3+) | `Apache-2.0` |
| BSD 2-Clause | Permissive | No | No | Yes | `BSD-2-Clause` |
| BSD 3-Clause | Permissive | No | No | Yes | `BSD-3-Clause` |
| ISC | Permissive | No | No | Yes | `ISC` |
| MPL 2.0 | Weak Copyleft | Yes | File-level | Yes | `MPL-2.0` |
| LGPL v2.1 | Weak Copyleft | No | Library-level | Yes | `LGPL-2.1-only` |
| LGPL v3 | Weak Copyleft | Yes | Library-level | Yes | `LGPL-3.0-only` |
| GPL v2 | Strong Copyleft | No | Full | N/A | `GPL-2.0-only` |
| GPL v3 | Strong Copyleft | Yes | Full | N/A | `GPL-3.0-only` |
| AGPL v3 | Network Copyleft | Yes | Full + Network | Yes | `AGPL-3.0-only` |
| Unlicense | Public Domain | No | No | Yes | `Unlicense` |
| 0BSD | Public Domain | No | No | Yes | `0BSD` |

## Decision Framework

```
What is your project?
|
+-- Library/Framework/Tool?
|   |
|   +-- Want maximum adoption? -> MIT or Apache 2.0
|   |   +-- Need patent protection? -> Apache 2.0
|   |   +-- Want simplicity? -> MIT
|   |
|   +-- Want derivatives to stay open? -> LGPL v3 or MPL 2.0
|       +-- Only modified files? -> MPL 2.0
|       +-- Entire linked library? -> LGPL v3
|
+-- Application/Service?
|   |
|   +-- Want all forks open? -> GPL v3
|   +-- Want SaaS forks open too? -> AGPL v3
|   +-- Do not care about forks? -> MIT or Apache 2.0
|
+-- Creative/Documentation?
    +-- Code samples -> MIT or Apache 2.0
    +-- Docs content -> CC BY 4.0 or CC BY-SA 4.0
```

## SPDX Identifiers

SPDX (Software Package Data Exchange) provides standardized license identifiers.

### In package.json (Node.js)
```json
{
  "license": "MIT"
}
```

### In Cargo.toml (Rust)
```toml
[package]
license = "MIT OR Apache-2.0"
```

### In pyproject.toml (Python)
```toml
[project]
license = {text = "MIT"}
classifiers = [
    "License :: OSI Approved :: MIT License",
]
```

### In pom.xml (Java/Maven)
```xml
<licenses>
  <license>
    <name>MIT License</name>
    <url>https://opensource.org/licenses/MIT</url>
    <distribution>repo</distribution>
  </license>
</licenses>
```

### SPDX Expression Syntax
```
MIT                          -- Single license
MIT OR Apache-2.0            -- Choice (either license)
MIT AND CC-BY-4.0            -- Both apply
GPL-3.0-only WITH Classpath-exception-2.0  -- License with exception
```

## CLA vs DCO

### Developer Certificate of Origin (DCO)
- Lightweight: contributor signs off each commit
- No legal agreement to sign
- Used by: Linux Kernel, CNCF projects, GitLab

```bash
# Add sign-off to commit
git commit -s -m "feat: add new feature"

# Result in commit message:
# feat: add new feature
#
# Signed-off-by: Your Name <your.email@example.com>
```

**GitHub Action for DCO enforcement:**
```yaml
name: DCO
on: [pull_request]
jobs:
  dco:
    runs-on: ubuntu-latest
    steps:
      - uses: timonwong/action-dco-check@v1
```

### Contributor License Agreement (CLA)
- Formal legal agreement
- Grants additional rights to project maintainers
- Used by: Apache Foundation, Google, Microsoft

**CLA Assistant (GitHub App):**
```yaml
# .github/workflows/cla.yml
name: CLA Assistant
on:
  issue_comment:
    types: [created]
  pull_request_target:
    types: [opened, synchronize]
jobs:
  cla:
    runs-on: ubuntu-latest
    steps:
      - uses: contributor-assistant/github-action@v2
        with:
          path-to-signatures: signatures/cla.json
          path-to-document: CLA.md
          branch: main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### When to Use Which

| Criteria | DCO | CLA |
|----------|-----|-----|
| Setup complexity | Low | High |
| Contributor friction | Low | Medium-High |
| Legal protection | Basic | Strong |
| Relicensing possible | No | Yes (if CLA allows) |
| Best for | Community projects | Corporate-backed projects |

## Dual Licensing

Dual licensing offers the code under two licenses:

| Model | Example | Use Case |
|-------|---------|----------|
| Open + Commercial | GPL + Commercial | MySQL, Qt |
| Permissive + Copyleft | MIT OR Apache-2.0 | Rust ecosystem |
| Source-Available | BSL 1.1 (converts to open) | HashiCorp, MariaDB |

### Source-Available Licenses (Not OSI-Approved)
- **BSL 1.1** (Business Source License) - Converts to open source after change date
- **SSPL** (Server Side Public License) - MongoDB, Elastic (controversial)
- **Elastic License 2.0** - Permissive but restricts managed services
- **FSL** (Functional Source License) - Converts to Apache 2.0 or MIT after 2 years

## License Compatibility Matrix

```
                Can use code FROM:
                MIT  Apache BSD  MPL  LGPL GPL  AGPL
Can use IN:
MIT             Yes  No     Yes  No   No   No   No
Apache 2.0      Yes  Yes    Yes  No   No   No   No
BSD             Yes  No     Yes  No   No   No   No
MPL 2.0         Yes  Yes    Yes  Yes  No   No   No
LGPL v3         Yes  Yes    Yes  Yes  Yes  No   No
GPL v3          Yes  Yes    Yes  Yes  Yes  Yes  No
AGPL v3         Yes  Yes    Yes  Yes  Yes  Yes  Yes
```

> **Rule of thumb**: Code flows "up" from permissive to copyleft, never "down".

## LICENSE File Templates

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

### Apache 2.0 (Header for LICENSE file)
```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION
   [Full text at: https://www.apache.org/licenses/LICENSE-2.0.txt]
```

> **Tip**: Use `gh repo create --license mit` or `gh repo create --license apache-2.0` to auto-generate LICENSE files.
