# GitHub Actions Common Actions Quick Reference

> **Knowledge Base:** Read `knowledge/github-actions/actions.md` for complete documentation.

## Checkout

```yaml
- uses: actions/checkout@v4

- uses: actions/checkout@v4
  with:
    ref: develop                    # Branch/tag/SHA
    fetch-depth: 0                  # Full history
    submodules: recursive           # Include submodules
    token: ${{ secrets.PAT }}       # For private repos
```

## Setup Languages

```yaml
# Node.js
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    node-version-file: '.nvmrc'     # Or use file
    cache: 'npm'                    # npm, yarn, pnpm
    registry-url: 'https://npm.pkg.github.com'

# Python
- uses: actions/setup-python@v5
  with:
    python-version: '3.11'
    cache: 'pip'

# Go
- uses: actions/setup-go@v5
  with:
    go-version: '1.21'
    cache: true

# Java
- uses: actions/setup-java@v4
  with:
    distribution: 'temurin'         # adopt, zulu, corretto
    java-version: '21'
    cache: 'maven'                  # maven, gradle

# .NET
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0.x'

# Rust
- uses: dtolnay/rust-toolchain@stable
  with:
    components: clippy, rustfmt
```

## Cache

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## Artifacts

```yaml
# Upload
- uses: actions/upload-artifact@v4
  with:
    name: my-artifact
    path: |
      dist/
      build/
    retention-days: 5
    if-no-files-found: error         # warn, ignore

# Download
- uses: actions/download-artifact@v4
  with:
    name: my-artifact
    path: artifacts/

# Download all artifacts
- uses: actions/download-artifact@v4
  with:
    path: all-artifacts/
```

## Docker

```yaml
# Login to registry
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

# Build and push
- uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ghcr.io/owner/repo:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max

# Setup Docker Buildx
- uses: docker/setup-buildx-action@v3
```

## GitHub Releases

```yaml
# Create release
- uses: softprops/action-gh-release@v1
  with:
    tag_name: ${{ github.ref_name }}
    files: |
      dist/*.zip
      dist/*.tar.gz
    generate_release_notes: true
```

## Pull Request

```yaml
# Create PR
- uses: peter-evans/create-pull-request@v6
  with:
    title: 'Update dependencies'
    body: 'Automated dependency update'
    branch: update-deps
    base: main

# Comment on PR
- uses: peter-evans/create-or-update-comment@v4
  with:
    issue-number: ${{ github.event.pull_request.number }}
    body: |
      ## Build Results
      - Status: ${{ job.status }}
```

## Deployment

```yaml
# Deploy to GitHub Pages
- uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./dist

# Deploy to Vercel
- uses: amondnet/vercel-action@v25
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.ORG_ID }}
    vercel-project-id: ${{ secrets.PROJECT_ID }}

# Deploy to AWS
- uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1
```

## Code Quality

```yaml
# ESLint
- uses: reviewdog/action-eslint@v1
  with:
    reporter: github-pr-review

# CodeQL Analysis
- uses: github/codeql-action/init@v3
  with:
    languages: javascript, typescript

- uses: github/codeql-action/analyze@v3

# SonarCloud
- uses: SonarSource/sonarcloud-github-action@master
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

## Notifications

```yaml
# Slack
- uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Deployment completed!"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

# Discord
- uses: sarisia/actions-status-discord@v1
  with:
    webhook: ${{ secrets.DISCORD_WEBHOOK }}
    status: ${{ job.status }}
```

## Complete CI/CD Example

```yaml
name: CI/CD

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
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
      - run: ./deploy.sh
```

**Official docs:** https://github.com/marketplace?type=actions
