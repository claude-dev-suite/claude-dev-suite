# Legal and Packaging Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/legal-packaging.md` for complete documentation.

## License Headers in Source Files

### SPDX Shorthand (Recommended)
```
// SPDX-License-Identifier: MIT
```

```
// SPDX-License-Identifier: Apache-2.0
```

### Apache 2.0 Full Header
```
// Copyright [year] [owner]
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
```

### MIT Header
```
// Copyright (c) [year] [owner]
// Licensed under the MIT License. See LICENSE file in the project root.
```

### GPL v3 Header
```
// Copyright (C) [year] [owner]
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
```

### Automated Header Insertion

```bash
# Node.js: use license-header-checker
npx license-header-checker -a ./header.txt src/ --fix

# Python: use insert-license
pip install insert-license
insert-license --license-filepath=./header.txt --comment-style="//" src/**/*.py

# Java: Maven license plugin
./mvnw license:format
```

**Maven License Plugin Configuration:**
```xml
<plugin>
  <groupId>com.mycila</groupId>
  <artifactId>license-maven-plugin</artifactId>
  <version>4.3</version>
  <configuration>
    <licenseSets>
      <licenseSet>
        <header>LICENSE_HEADER.txt</header>
        <includes>
          <include>src/**/*.java</include>
        </includes>
      </licenseSet>
    </licenseSets>
  </configuration>
</plugin>
```

## NOTICE File

### When Required
- **Apache 2.0**: NOTICE file is REQUIRED if you include third-party Apache-licensed code
- **Other licenses**: Optional but good practice for attribution

### Format
```
[Project Name]
Copyright [year] [owner]

This product includes software developed at
[Organization] (https://example.com/).

Third-party components:
---------------------------------------------------------------------------
[Component Name] - [License]
Copyright [year] [owner]
[URL]
---------------------------------------------------------------------------
[Component Name] - [License]
Copyright [year] [owner]
[URL]
```

### Example NOTICE
```
My Project
Copyright 2024 My Organization

This product includes software developed by:

Apache Commons Lang (Apache 2.0)
Copyright 2001-2024 The Apache Software Foundation
https://commons.apache.org/proper/commons-lang/

Lodash (MIT)
Copyright JS Foundation and other contributors
https://lodash.com/
```

## Third-Party License Compliance

### Tools

| Tool | Type | Languages | Free Tier |
|------|------|-----------|-----------|
| **FOSSA** | SaaS | All major | Yes (open source) |
| **license-checker** | CLI | Node.js | Yes |
| **pip-licenses** | CLI | Python | Yes |
| **go-licenses** | CLI | Go | Yes |
| **license-maven-plugin** | CLI | Java | Yes |
| **cargo-license** | CLI | Rust | Yes |

### license-checker (Node.js)
```bash
# Install
npm install -g license-checker

# Check all dependencies
license-checker --json > licenses.json

# Check for problematic licenses
license-checker --failOn "GPL-3.0;AGPL-3.0"

# Exclude dev dependencies
license-checker --production

# Generate CSV report
license-checker --csv --out licenses.csv

# Custom allow-list
license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD"
```

### pip-licenses (Python)
```bash
pip install pip-licenses
pip-licenses --format=json --output-file=licenses.json
pip-licenses --fail-on="GNU General Public License v3 (GPLv3)"
```

### GitHub Actions License Check
```yaml
name: License Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx license-checker --failOn "GPL-3.0;AGPL-3.0;SSPL-1.0"
```

## License Compatibility

### Common Compatibility Issues

| Scenario | Compatible? | Notes |
|----------|------------|-------|
| MIT code in Apache 2.0 project | Yes | Add attribution |
| Apache 2.0 code in MIT project | No | Patent clause incompatible |
| MIT code in GPL project | Yes | Result is GPL |
| GPL code in MIT project | No | Cannot relicense GPL as MIT |
| MPL 2.0 code in any project | Yes | MPL stays on modified files |
| LGPL library linked dynamically | Yes | No copyleft trigger |
| LGPL library linked statically | Conditional | Must allow relinking |

### Best Practices
1. Keep a `THIRD-PARTY-LICENSES` file listing all dependencies and their licenses
2. Run license checks in CI to catch incompatible dependencies early
3. Prefer permissive licenses (MIT, Apache 2.0, BSD) for dependencies
4. If using GPL dependencies, ensure your project can be GPL-compatible

## Export Control Considerations

Some open source software is subject to export controls (particularly cryptographic software):

- **EAR (US)**: Export Administration Regulations
- **Wassenaar**: International arrangement on export controls
- Most open source cryptographic software is exempt under EAR Section 742.15(b)
- **Action**: Send notification to BIS (Bureau of Industry and Security) and NSA if publishing cryptographic source code

> **Note**: This is informational. Consult legal counsel for specific guidance.

## Trademark Policy

### Why It Matters
- Project name and logo may need trademark protection
- Prevents confusion about official vs. unofficial distributions
- Common in large projects (Linux, Kubernetes, Rust)

### Template Trademark Policy
```markdown
# Trademark Policy

"[Project Name]" and the [Project] logo are trademarks of [Organization].

## Permitted Uses
- Referring to the [Project] project in articles and documentation
- Using the name in package names when distributing unmodified code
- Using the name in talks and presentations about the project

## Restricted Uses (Require Permission)
- Using the name or logo in commercial products or services
- Using the name in a way that suggests endorsement
- Modified versions must not use the official name without distinction
```

## npm Publishing Configuration

### package.json for Publishing
```json
{
  "name": "@org/package-name",
  "version": "1.0.0",
  "description": "Package description",
  "license": "MIT",
  "author": "Name <email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/org/repo.git"
  },
  "homepage": "https://github.com/org/repo#readme",
  "bugs": {
    "url": "https://github.com/org/repo/issues"
  },
  "keywords": ["keyword1", "keyword2"],
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true,
    "registry": "https://registry.npmjs.org/"
  }
}
```

### .npmignore vs files Field
Prefer the `files` field in package.json (allowlist) over `.npmignore` (denylist):

```json
{
  "files": [
    "dist",
    "LICENSE",
    "README.md",
    "CHANGELOG.md"
  ]
}
```

### Verify Package Contents Before Publishing
```bash
# Dry run to see what would be published
npm pack --dry-run

# Create tarball to inspect
npm pack
tar -tzf package-name-1.0.0.tgz
```

## Container Image Publishing

### GitHub Container Registry (ghcr.io)
```yaml
name: Publish Container

on:
  release:
    types: [published]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```

### Image Signing with cosign
```yaml
      - name: Sign image
        uses: sigstore/cosign-installer@v3

      - name: Sign the image
        run: cosign sign ghcr.io/${{ github.repository }}:${{ github.ref_name }}
        env:
          COSIGN_EXPERIMENTAL: "true"
```

## CITATION.cff Template

```yaml
cff-version: 1.2.0
title: "Project Name"
message: "If you use this software, please cite it as below."
type: software
authors:
  - given-names: First
    family-names: Last
    email: email@example.com
    orcid: "https://orcid.org/0000-0000-0000-0000"
    affiliation: "Organization"
repository-code: "https://github.com/org/repo"
url: "https://docs.example.com"
license: MIT
version: 1.0.0
date-released: "2024-01-15"
keywords:
  - keyword1
  - keyword2
```

> GitHub automatically displays a "Cite this repository" button when CITATION.cff is present.

## FUNDING.yml Template

```yaml
# .github/FUNDING.yml
github: [username]
open_collective: project-name
ko_fi: username
patreon: username
custom: ["https://example.com/sponsor"]
```

Supported platforms:
- `github` - GitHub Sponsors
- `open_collective` - Open Collective
- `ko_fi` - Ko-fi
- `patreon` - Patreon
- `tidelift` - Tidelift
- `community_bridge` - LFX Mentorship
- `polar` - Polar
- `buy_me_a_coffee` - Buy Me a Coffee
- `custom` - Custom URLs (array)
