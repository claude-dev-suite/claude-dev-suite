---
name: github-actions
description: |
  GitHub Actions CI/CD. Covers workflows, jobs, and deployment.
  Use for automating builds, tests, and deployments.

  USE WHEN: user mentions "github actions", "workflow", "ci/cd", ".github/workflows",
  "actions/checkout", "github workflow", asks about "automate tests", "deploy on push",
  "build pipeline", "ci pipeline", "continuous integration", "github automation"

  DO NOT USE FOR: GitLab CI/CD - different syntax and features,
  Jenkins pipelines - different tool,
  Container orchestration - use `docker` or `kubernetes` skills,
  Local builds - workflows run on GitHub runners
allowed-tools: Read, Grep, Glob, Write, Edit
---
# GitHub Actions Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `github-actions` for comprehensive documentation.

## Basic CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

## With Database

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/testdb

    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm test
```

## Deploy Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Matrix Strategy

```yaml
jobs:
  test:
    strategy:
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
```

## Reusable Workflows

```yaml
# .github/workflows/test.yml
on:
  workflow_call:

jobs:
  test:
    runs-on: ubuntu-latest
    steps: [...]

# Usage in another workflow
jobs:
  call-tests:
    uses: ./.github/workflows/test.yml
```

## When NOT to Use This Skill

Skip this skill when:
- Using GitLab CI/CD (.gitlab-ci.yml) - different syntax
- Using Jenkins, CircleCI, Travis CI - different platforms
- Setting up local development environments - use `docker-compose` skill
- Building Docker images only (no CI needed) - use `docker` skill
- Working with Bitbucket Pipelines - different platform

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No permission restrictions | Security risk, excessive access | Set minimal `permissions:` per job |
| Using action tags like `@v1` | Breaking changes on updates | Pin to SHA: `@60edb5dd545a775178f52524783378180af0d1f8` |
| Secrets in logs | Credential exposure | Never `echo` secrets, use `env:` only |
| No timeout set | Runaway jobs consuming minutes | Set `timeout-minutes: 15` on jobs |
| Caching nothing | Slow builds, wasted time | Cache dependencies with `actions/cache` |
| Running on every commit | Wasted CI minutes | Use `paths:` filters or `pull_request:` only |
| Hardcoded versions | Inconsistent environments | Use matrix strategy or env vars |
| No artifact retention limit | High storage costs | Set `retention-days: 7` on artifacts |
| Storing secrets in code | Security breach | Use GitHub Secrets, never commit |
| No branch protection | Bypassing CI checks | Require status checks in branch rules |

## Quick Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Workflow doesn't trigger | Wrong event, branch filter | Check `on:` triggers and branch names |
| Job fails silently | Script errors ignored | Don't use `|| true`, check exit codes |
| Cache never hits | Cache key changing | Use stable keys: `hashFiles('**/package-lock.json')` |
| "Resource not accessible" | Wrong permissions | Add required `permissions:` to job |
| Secrets not available in PR | Forks don't have access | Use `pull_request_target` (carefully) or skip secret steps |
| Artifact upload fails | Path doesn't exist | Check build output path, use `if: always()` |
| Matrix job failures | One config fails all | Use `fail-fast: false` to continue other jobs |
| Workflow takes too long | No caching, sequential jobs | Add caching, parallelize with `needs:` |
| "Context access might be invalid" | Wrong context syntax | Use `${{ }}` syntax, check context availability |
| Can't trigger another workflow | No token permission | Use PAT or `GITHUB_TOKEN` with write permissions |

## Production Readiness

### Security Best Practices

```yaml
# Secure workflow
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      # Pin actions to SHA for security
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8 # v4.0.2
        with:
          node-version: '20'

      # Use environment secrets
      - name: Deploy
        env:
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          # Never echo secrets
          ./deploy.sh
```

### Caching Strategy

```yaml
jobs:
  build:
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Custom caching
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.npm
            node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      # Turbo cache for monorepos
      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-
```

### Artifact Management

```yaml
jobs:
  build:
    steps:
      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ github.sha }}
          path: dist/
          retention-days: 7

  deploy:
    needs: build
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-${{ github.sha }}
          path: dist/
```

### Environment Protection

```yaml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment:
      name: production
      url: https://example.com
    concurrency:
      group: production-deploy
      cancel-in-progress: false
```

### Error Handling

```yaml
jobs:
  build:
    steps:
      - name: Run tests
        id: tests
        continue-on-error: true
        run: npm test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: coverage/

      - name: Check test status
        if: steps.tests.outcome == 'failure'
        run: |
          echo "Tests failed"
          exit 1

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "Build failed: ${{ github.repository }}"}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      development-dependencies:
        patterns:
          - "@types/*"
          - "eslint*"
          - "prettier*"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Release Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          generate_release_notes: true
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Build success rate | > 95% |
| Build duration | < 10min |
| Cache hit rate | > 80% |
| Deployment frequency | As needed |

### Checklist

- [ ] Minimal permissions declared
- [ ] Actions pinned to SHA
- [ ] Secrets not exposed in logs
- [ ] Caching configured
- [ ] Timeouts set
- [ ] Error notifications
- [ ] Environment protection rules
- [ ] Dependabot enabled
- [ ] Branch protection rules
- [ ] Concurrency controls

## Reference Documentation
- [Caching](quick-ref/caching.md)
- [Secrets](quick-ref/secrets.md)
