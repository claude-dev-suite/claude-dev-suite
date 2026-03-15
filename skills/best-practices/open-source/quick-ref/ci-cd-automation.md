# CI/CD and Automation Quick Reference

> **Knowledge Base:** Read `knowledge/best-practices/open-source/ci-cd-automation.md` for complete documentation.

## GitHub Actions CI Workflow Template

### Multi-Version Matrix (Node.js)
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  coverage:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

### Multi-Version Matrix (Python)
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pip install -e ".[dev]"
      - run: ruff check .
      - run: pytest --cov
```

### Multi-Version Matrix (Java)
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        java-version: [17, 21]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: ${{ matrix.java-version }}
          cache: 'maven'
      - run: ./mvnw verify
```

## Release Automation

### Option 1: semantic-release

Best for: npm packages, fully automated releases.

```json
{
  "release": {
    "branches": ["main"],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      "@semantic-release/npm",
      "@semantic-release/github",
      ["@semantic-release/git", {
        "assets": ["CHANGELOG.md", "package.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }]
    ]
  }
}
```

**GitHub Actions workflow:**
```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm test
      - run: npm run build

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release
```

### Option 2: Release Please (Google)

Best for: monorepos, GitHub-native releases.

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          release-type: node

      - uses: actions/checkout@v4
        if: ${{ steps.release.outputs.release_created }}

      - uses: actions/setup-node@v4
        if: ${{ steps.release.outputs.release_created }}
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci
        if: ${{ steps.release.outputs.release_created }}

      - run: npm publish --provenance
        if: ${{ steps.release.outputs.release_created }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Option 3: Changesets

Best for: monorepos with manual changelog control.

```bash
# Install
npm install @changesets/cli -D
npx changeset init

# Add a changeset
npx changeset
# Follow prompts: select packages, bump type, summary

# Version and publish
npx changeset version
npx changeset publish
```

### Comparison

| Feature | semantic-release | Release Please | Changesets |
|---------|-----------------|---------------|------------|
| Automation | Fully automatic | PR-based | Manual trigger |
| Changelog | Auto-generated | Auto-generated | Developer-written |
| Monorepo | Plugin needed | Built-in | Built-in |
| npm publish | Built-in | Separate step | Built-in |
| Commit format | Requires Conventional | Requires Conventional | Free-form |
| Best for | Single packages | Google-style | Manual control |

## Dependency Updates

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm dependencies
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
      timezone: "America/New_York"
    open-pull-requests-limit: 10
    reviewers:
      - "org/maintainers"
    labels:
      - "dependencies"
    commit-message:
      prefix: "chore(deps):"
    groups:
      dev-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "patch"

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "github-actions"
    commit-message:
      prefix: "ci(deps):"

  # Docker
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"
```

### Renovate Configuration

```json5
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":automergeMinor",
    ":automergeDigest",
    "group:allNonMajor"
  ],
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true
    },
    {
      "matchDepTypes": ["devDependencies"],
      "automerge": true
    },
    {
      "groupName": "linters",
      "matchPackageNames": ["eslint", "prettier", "biome"],
      "matchPackagePatterns": ["^eslint-", "^@typescript-eslint/"]
    }
  ],
  "schedule": ["every weekend"],
  "prHourlyLimit": 5,
  "prConcurrentLimit": 10
}
```

### Dependabot vs Renovate

| Feature | Dependabot | Renovate |
|---------|-----------|----------|
| Hosting | GitHub-native | Self-hosted or Mend app |
| Config | YAML only | JSON/JSON5, more flexible |
| Grouping | Basic (v2) | Advanced |
| Auto-merge | Via Actions | Built-in |
| Monorepo | Limited | Excellent |
| Ecosystems | npm, pip, Maven, etc. | 60+ managers |
| Scheduling | Basic | Cron-like |
| Cost | Free | Free (open source) |

## Stale Issues Automation

```yaml
# .github/workflows/stale.yml
name: Stale Issues

on:
  schedule:
    - cron: '30 1 * * *'  # Daily at 1:30 AM

permissions:
  issues: write
  pull-requests: write

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v9
        with:
          stale-issue-message: >
            This issue has been automatically marked as stale because it has not had
            recent activity. It will be closed in 14 days if no further activity occurs.
          stale-pr-message: >
            This PR has been automatically marked as stale because it has not had
            recent activity. It will be closed in 14 days if no further activity occurs.
          stale-issue-label: 'stale'
          stale-pr-label: 'stale'
          days-before-stale: 60
          days-before-close: 14
          exempt-issue-labels: 'pinned,priority: critical,priority: high'
          exempt-pr-labels: 'pinned,priority: critical'
```

## Auto-Labeling Workflow

```yaml
# .github/workflows/labeler.yml
name: Labeler

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v5
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

```yaml
# .github/labeler.yml
documentation:
  - changed-files:
    - any-glob-to-any-file: ['docs/**', '*.md']

frontend:
  - changed-files:
    - any-glob-to-any-file: ['src/components/**', '*.tsx', '*.css']

backend:
  - changed-files:
    - any-glob-to-any-file: ['src/api/**', 'src/services/**']

tests:
  - changed-files:
    - any-glob-to-any-file: ['tests/**', '**/*.test.*', '**/*.spec.*']

infrastructure:
  - changed-files:
    - any-glob-to-any-file: ['.github/**', 'Dockerfile', 'docker-compose.*']

dependencies:
  - changed-files:
    - any-glob-to-any-file: ['package.json', 'package-lock.json', 'requirements.txt']
```

## Dependency Review Action

```yaml
# Add to CI workflow
- name: Dependency Review
  if: github.event_name == 'pull_request'
  uses: actions/dependency-review-action@v4
  with:
    fail-on-severity: moderate
    deny-licenses: GPL-3.0, AGPL-3.0
    comment-summary-in-pr: always
```

## CodeQL Analysis Workflow

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '15 4 * * 1'  # Weekly on Monday

permissions:
  security-events: write
  contents: read

jobs:
  analyze:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        language: ['javascript-typescript']
        # Add: 'java-kotlin', 'python', 'go', 'ruby', 'csharp'
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
```

## Semantic Versioning Guidelines

```
MAJOR.MINOR.PATCH

MAJOR - Breaking changes (incompatible API changes)
MINOR - New features (backwards compatible)
PATCH - Bug fixes (backwards compatible)
```

### Pre-release Versions
```
1.0.0-alpha.1    First alpha
1.0.0-beta.1     First beta
1.0.0-rc.1       Release candidate
1.0.0            Stable release
```

### Version Bump Rules

| Change | Example | Bump |
|--------|---------|------|
| Breaking API change | Remove endpoint | MAJOR |
| New feature | Add endpoint | MINOR |
| Bug fix | Fix response format | PATCH |
| Deprecation notice | Mark old API | MINOR |
| Internal refactor | No API change | PATCH |
| Documentation | Only docs | PATCH (or skip) |
| Dependencies | Security update | PATCH |

### Conventional Commits to SemVer Mapping

| Commit | SemVer Bump |
|--------|-------------|
| `fix:` | PATCH |
| `feat:` | MINOR |
| `feat!:` or `BREAKING CHANGE:` | MAJOR |
| `chore:`, `docs:`, `refactor:` | No bump (or PATCH) |
