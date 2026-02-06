# GitHub Actions Workflows Quick Reference

> **Knowledge Base:** Read `knowledge/github-actions/workflows.md` for complete documentation.

## Basic Structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
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

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

## Triggers (on)

```yaml
on:
  # Push events
  push:
    branches:
      - main
      - 'release/**'
    tags:
      - 'v*'
    paths:
      - 'src/**'
      - '!**.md'

  # Pull request events
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

  # Manual trigger
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

  # Schedule (cron)
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

  # Other workflows
  workflow_call:
    inputs:
      config:
        required: true
        type: string

  # Release
  release:
    types: [published]
```

## Jobs

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test

  build:
    needs: test  # Run after test
    runs-on: ubuntu-latest
    steps:
      - run: npm run build

  deploy:
    needs: [test, build]  # Run after both
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - run: ./deploy.sh
```

## Matrix Strategy

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
        exclude:
          - os: macos-latest
            node: 18
        include:
          - os: ubuntu-latest
            node: 20
            experimental: true
      fail-fast: false  # Continue on failure

    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
```

## Environment Variables

```yaml
# Global env
env:
  NODE_ENV: production
  CI: true

jobs:
  build:
    env:
      DATABASE_URL: postgres://localhost/test

    steps:
      - name: Set dynamic env
        run: echo "VERSION=$(cat package.json | jq -r .version)" >> $GITHUB_ENV

      - name: Use env
        run: echo "Version is ${{ env.VERSION }}"
        env:
          STEP_VAR: value
```

## Secrets

```yaml
jobs:
  deploy:
    steps:
      - name: Deploy
        env:
          API_KEY: ${{ secrets.API_KEY }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        run: ./deploy.sh

      - name: Use GitHub token
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh pr comment --body "Deployed!"
```

## Outputs

```yaml
jobs:
  build:
    outputs:
      version: ${{ steps.version.outputs.value }}

    steps:
      - id: version
        run: echo "value=$(cat package.json | jq -r .version)" >> $GITHUB_OUTPUT

  deploy:
    needs: build
    steps:
      - run: echo "Deploying version ${{ needs.build.outputs.version }}"
```

## Caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-

# Or use setup action's built-in cache
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
```

## Artifacts

```yaml
- name: Build
  run: npm run build

- name: Upload artifact
  uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
    retention-days: 5

# In another job
- name: Download artifact
  uses: actions/download-artifact@v4
  with:
    name: dist
    path: dist/
```

## Conditional Execution

```yaml
steps:
  - name: Only on main
    if: github.ref == 'refs/heads/main'
    run: echo "On main branch"

  - name: Only on PR
    if: github.event_name == 'pull_request'
    run: echo "This is a PR"

  - name: On success
    if: success()
    run: echo "Previous steps succeeded"

  - name: On failure
    if: failure()
    run: echo "Previous steps failed"

  - name: Always run
    if: always()
    run: echo "Always runs"

  - name: Skip on fork
    if: github.repository == 'owner/repo'
    run: echo "Not a fork"
```

## Reusable Workflows

```yaml
# .github/workflows/reusable.yml
name: Reusable Workflow

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
    secrets:
      deploy_key:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh ${{ inputs.environment }}
        env:
          DEPLOY_KEY: ${{ secrets.deploy_key }}

# Usage in another workflow
jobs:
  deploy:
    uses: ./.github/workflows/reusable.yml
    with:
      environment: production
    secrets:
      deploy_key: ${{ secrets.DEPLOY_KEY }}
```

**Official docs:** https://docs.github.com/en/actions
