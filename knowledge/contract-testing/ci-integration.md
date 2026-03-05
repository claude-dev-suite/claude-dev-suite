# Contract Testing CI Integration

## Overview

Contract testing delivers maximum value when integrated into CI/CD pipelines. The Pact Broker acts as the central registry for contracts, enabling automated verification, deployment safety checks, and cross-team coordination. This document covers Pact Broker setup, the `can-i-deploy` tool, webhook-triggered verification, and deployment pipeline integration.

## Pact Broker Setup

### Docker Compose (Self-Hosted)

```yaml
# docker-compose.yml
version: "3"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: pact
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: pact_broker
    volumes:
      - pact-db:/var/lib/postgresql/data

  pact-broker:
    image: pactfoundation/pact-broker:latest
    ports:
      - "9292:9292"
    environment:
      PACT_BROKER_DATABASE_URL: postgres://pact:${POSTGRES_PASSWORD}@postgres/pact_broker
      PACT_BROKER_BASIC_AUTH_USERNAME: ${PACT_BROKER_USERNAME}
      PACT_BROKER_BASIC_AUTH_PASSWORD: ${PACT_BROKER_PASSWORD}
      PACT_BROKER_BASE_URL: https://pact-broker.example.com
      PACT_BROKER_LOG_LEVEL: INFO
      PACT_BROKER_ALLOW_DANGEROUS_CONTRACT_MODIFICATION: "false"
    depends_on:
      - postgres

volumes:
  pact-db:
```

### PactFlow (SaaS)

PactFlow is the managed Pact Broker service with additional features like bi-directional contracts, OAS support, and team management.

```bash
# Set environment variables for PactFlow
export PACT_BROKER_BASE_URL=https://your-org.pactflow.io
export PACT_BROKER_TOKEN=your-read-write-token
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pact-broker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pact-broker
  template:
    metadata:
      labels:
        app: pact-broker
    spec:
      containers:
        - name: pact-broker
          image: pactfoundation/pact-broker:latest
          ports:
            - containerPort: 9292
          env:
            - name: PACT_BROKER_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: pact-broker-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /diagnostic/status/heartbeat
              port: 9292
            initialDelaySeconds: 10
          readinessProbe:
            httpGet:
              path: /diagnostic/status/heartbeat
              port: 9292
---
apiVersion: v1
kind: Service
metadata:
  name: pact-broker
spec:
  selector:
    app: pact-broker
  ports:
    - port: 80
      targetPort: 9292
```

## Can-I-Deploy Tool

`can-i-deploy` is the core safety check that determines whether a particular version of a service can be deployed to an environment based on its verified contracts.

### Basic Usage

```bash
# Can the consumer deploy to production?
npx pact-broker can-i-deploy \
  --pacticipant OrderService \
  --version $(git rev-parse HEAD) \
  --to-environment production \
  --broker-base-url $PACT_BROKER_BASE_URL \
  --broker-token $PACT_BROKER_TOKEN
```

### Output

```
Computer says yes \o/

CONSUMER        | C.VERSION | PROVIDER        | P.VERSION | SUCCESS?
OrderService    | abc123    | ProductService  | def456    | true
OrderService    | abc123    | PaymentService  | ghi789    | true

All required verification results are published and successful
```

### Matrix Query Options

```bash
# Check if consumer and provider versions are compatible
npx pact-broker can-i-deploy \
  --pacticipant OrderService \
  --version abc123 \
  --pacticipant ProductService \
  --version def456

# Check what is currently deployed
npx pact-broker can-i-deploy \
  --pacticipant OrderService \
  --version abc123 \
  --to-environment staging

# Dry run (do not fail CI)
npx pact-broker can-i-deploy \
  --pacticipant OrderService \
  --version abc123 \
  --to-environment production \
  --dry-run
```

### Record Deployment

After successful deployment, record it so other teams know what is in each environment.

```bash
# Record that this version is now deployed
npx pact-broker record-deployment \
  --pacticipant OrderService \
  --version $(git rev-parse HEAD) \
  --environment production

# Record release (for mobile apps or packages with multiple active versions)
npx pact-broker record-release \
  --pacticipant MobileApp \
  --version 2.1.0 \
  --environment production
```

## Versioning and Tagging

### Version Strategy

Use the Git SHA as the version for traceability.

```bash
# Publish with Git SHA and branch
npx pact-broker publish ./pacts \
  --consumer-app-version $(git rev-parse HEAD) \
  --branch $(git branch --show-current) \
  --broker-base-url $PACT_BROKER_BASE_URL \
  --broker-token $PACT_BROKER_TOKEN

# With build URL for traceability
npx pact-broker publish ./pacts \
  --consumer-app-version $(git rev-parse HEAD) \
  --branch $(git branch --show-current) \
  --build-url $CI_BUILD_URL \
  --broker-base-url $PACT_BROKER_BASE_URL
```

### Consumer Version Selectors

Tell the provider which consumer versions to verify against.

```javascript
// Provider verification configuration
const verifierOptions = {
  consumerVersionSelectors: [
    { mainBranch: true },          // Latest from main/master
    { deployedOrReleased: true },  // Currently in any environment
    { branch: 'feature-x' },      // Specific feature branch
    { matchingBranch: true },      // Same branch name as provider
  ],
};
```

```java
// JUnit 5 provider test
@PactBroker(
    consumerVersionSelectors = {
        @VersionSelector(mainBranch = true),
        @VersionSelector(deployedOrReleased = true),
        @VersionSelector(matchingBranch = true)
    }
)
```

## Pending Pacts

Pending pacts allow new consumers to publish contracts without immediately breaking the provider's build. The provider is aware of the pending pact but verification failures are not treated as test failures until the pact is verified at least once.

```javascript
const verifierOptions = {
  enablePending: true,
  includeWipPactsSince: '2024-01-01',  // Include work-in-progress pacts
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true },
  ],
};
```

**Flow**:
1. New consumer publishes a pact for the first time (pending)
2. Provider CI runs verification -- pending pact failures do not break the build
3. Provider team sees the pending pact and implements support
4. Provider verifies successfully -- pact is no longer pending
5. Future verification failures now break the provider build

## WIP Pacts

Work-In-Progress (WIP) pacts are pacts that have been published but never successfully verified. They are automatically included in provider verification when `includeWipPactsSince` is set.

```javascript
const verifierOptions = {
  enablePending: true,
  includeWipPactsSince: '2024-06-01',  // Include WIP pacts since this date
};
```

## Webhook Triggers

Configure the Pact Broker to trigger provider verification when a consumer publishes a new pact.

### Pact Broker Webhook

```bash
# Create webhook via CLI
npx pact-broker create-webhook \
  https://api.github.com/repos/example/product-service/dispatches \
  --request POST \
  --header "Authorization: token ${GITHUB_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{"event_type":"pact_changed","client_payload":{"pact_url":"${pactbroker.pactUrl}"}}' \
  --consumer OrderService \
  --provider ProductService \
  --contract-content-changed \
  --broker-base-url $PACT_BROKER_BASE_URL
```

### GitHub Actions Webhook Handler

```yaml
# .github/workflows/pact-verification.yml
name: Pact Provider Verification
on:
  repository_dispatch:
    types: [pact_changed]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run provider verification
        env:
          PACT_BROKER_BASE_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
          PACT_URL: ${{ github.event.client_payload.pact_url }}
          GIT_COMMIT: ${{ github.sha }}
          GIT_BRANCH: main
        run: npm run test:pact:provider

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Pact verification failed for ProductService.\nTriggered by: ${{ github.event.client_payload.pact_url }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Deployment Pipeline Integration

### Complete Consumer Pipeline

```yaml
# .github/workflows/consumer-ci.yml
name: Consumer CI
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm test

      # Run consumer contract tests
      - name: Run Pact tests
        run: npm run test:pact:consumer

      # Publish pacts to broker
      - name: Publish pacts
        run: |
          npx pact-broker publish ./pacts \
            --consumer-app-version ${{ github.sha }} \
            --branch ${{ github.ref_name }} \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

  can-i-deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Can I deploy?
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant OrderService \
            --version ${{ github.sha }} \
            --to-environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

  deploy:
    needs: can-i-deploy
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: ./scripts/deploy.sh production

      - name: Record deployment
        run: |
          npx pact-broker record-deployment \
            --pacticipant OrderService \
            --version ${{ github.sha }} \
            --environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}
```

### Complete Provider Pipeline

```yaml
# .github/workflows/provider-ci.yml
name: Provider CI
on:
  push:
  repository_dispatch:
    types: [pact_changed]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm test

      # Verify consumer contracts
      - name: Run provider verification
        env:
          PACT_BROKER_BASE_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
          GIT_COMMIT: ${{ github.sha }}
          GIT_BRANCH: ${{ github.ref_name }}
        run: npm run test:pact:provider

  can-i-deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Can I deploy?
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant ProductService \
            --version ${{ github.sha }} \
            --to-environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

  deploy:
    needs: can-i-deploy
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy
        run: ./scripts/deploy.sh production

      - name: Record deployment
        run: |
          npx pact-broker record-deployment \
            --pacticipant ProductService \
            --version ${{ github.sha }} \
            --environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}
```

## Anti-Patterns

1. **Not using `can-i-deploy`** - Publishing contracts and verifying them is pointless if you do not gate deployments on the result.
2. **Not recording deployments** - Without `record-deployment`, `can-i-deploy` does not know what is running in each environment.
3. **Using tags instead of branches and environments** - Tags are deprecated in favor of branches (for development) and environments (for deployment). Use the modern API.
4. **Running provider verification only on push** - Provider verification must also run when consumers publish new pacts (via webhook).
5. **Sharing a single Pact Broker token** - Use separate read-only and read-write tokens. Consumer CI needs write access; dashboards need read-only.
6. **Not enabling pending pacts** - Without pending pacts, a new consumer immediately breaks the provider build before the provider has a chance to implement support.
7. **Manual contract file sharing** - Passing pact JSON files via email, Slack, or shared drives defeats automation. Always use Pact Broker.

## Production Checklist

- [ ] Pact Broker deployed and accessible to all teams
- [ ] Consumer CI publishes pacts with Git SHA version and branch
- [ ] Provider CI verifies pacts using `consumerVersionSelectors` (mainBranch, deployedOrReleased)
- [ ] Provider CI publishes verification results
- [ ] `can-i-deploy` gates every production deployment
- [ ] `record-deployment` called after every successful deployment
- [ ] Webhooks trigger provider verification on new pact publication
- [ ] Pending pacts enabled to support new consumer onboarding
- [ ] WIP pacts included for visibility into in-progress integrations
- [ ] Pact Broker authentication configured (tokens, not basic auth)
- [ ] Broker data backed up (PostgreSQL backup for self-hosted)
- [ ] Team access and permissions configured (read/write separation)
- [ ] Dashboard reviewed regularly for failed verifications and stale pacts
