# Consumer-Driven Contract Testing

## Overview

Consumer-driven contract testing is a methodology where the consumer of a service defines the contract that the provider must satisfy. This inverts the traditional provider-driven model and shifts the power to the team that depends on the API. The approach promotes loosely coupled services, independent deployability, and early detection of breaking changes.

## Consumer-Driven vs Provider-Driven

### Consumer-Driven

The consumer writes a test describing what it needs from the provider. The contract captures only the subset of the provider's API that the consumer actually uses.

```
Consumer defines:   "I need GET /products/123 to return {id, name, price}"
Provider verifies:  "Yes, I return those fields (and more)"
```

**Advantages**:
- Consumer only breaks when something it actually uses changes
- Provider can add fields, endpoints, and behaviors freely
- Each consumer's contract is minimal and focused
- Breaking changes are caught before they reach production

**Disadvantages**:
- Provider must verify against all consumers (N contracts)
- New consumers need to publish contracts before provider CI validates them
- Requires coordination tooling (Pact Broker)

### Provider-Driven

The provider publishes its API specification (OpenAPI, GraphQL schema). Consumers test against the published spec.

```
Provider publishes: "Here is my full API specification"
Consumer validates: "My client is compatible with the spec"
```

**Advantages**:
- Single source of truth for the API
- Provider controls the spec
- No Pact Broker needed

**Disadvantages**:
- Consumer tests against the full spec, not what it actually uses
- Provider spec changes can break consumers even if the consumer's subset is unchanged
- Harder to detect which consumers are affected by a change

### When to Choose Each

| Factor | Consumer-Driven | Provider-Driven |
|--------|----------------|-----------------|
| Many consumers with different needs | Preferred | Acceptable |
| Provider team owns all consumers | Either | Preferred |
| Cross-team integration | Preferred | Requires coordination |
| Rapidly evolving API | Preferred | Risky |
| Public/external API | Acceptable | Preferred |
| Microservices with independent deploy | Preferred | Acceptable |

## Bi-Directional Contracts

A hybrid approach where both consumer and provider contribute to the contract. The consumer publishes what it expects, and the provider publishes what it provides (typically as an OpenAPI spec). A broker (PactFlow) compares them to determine compatibility.

```
Consumer → publishes pact (what I need)
Provider → publishes OAS  (what I provide)
Broker   → compares: does the OAS satisfy the pact?
```

### PactFlow Bi-Directional

```bash
# Consumer side: publish pact as usual
npx pact-broker publish ./pacts \
  --consumer-app-version $(git rev-parse HEAD) \
  --broker-base-url $PACTFLOW_URL \
  --broker-token $PACTFLOW_TOKEN

# Provider side: publish OAS instead of running verification
npx pactflow publish-provider-contract \
  openapi.yaml \
  --provider ProductService \
  --provider-app-version $(git rev-parse HEAD) \
  --branch main \
  --content-type application/yaml \
  --verification-results ./test-results.json \
  --verification-results-content-type application/json \
  --verifier verifier \
  --broker-base-url $PACTFLOW_URL \
  --broker-token $PACTFLOW_TOKEN
```

**Advantages**:
- Provider does not need to run consumer pacts
- Provider's existing OAS testing is reused
- Faster CI for providers with many consumers

**Disadvantages**:
- Requires PactFlow (commercial)
- Less thorough than running actual provider verification
- OAS may not capture all behavioral contracts

## Contract Evolution and Backward Compatibility

### Safe Changes (Non-Breaking)

| Change | Why It's Safe |
|--------|---------------|
| Add new optional field to response | Consumers ignore unknown fields |
| Add new endpoint | No existing consumer uses it yet |
| Add new optional query parameter | Existing requests still work |
| Add new enum value (when consumer handles unknown) | Flexible consumers handle gracefully |
| Widen response type (e.g., string to string|null) | If consumer already handles null |

### Breaking Changes

| Change | Why It Breaks |
|--------|---------------|
| Remove response field that consumer reads | Consumer gets undefined/null |
| Rename response field | Consumer cannot find old name |
| Change field type (string to number) | Consumer's parsing fails |
| Remove endpoint | Consumer gets 404 |
| Add required request field | Existing consumer requests fail validation |
| Narrow response type (e.g., string|null to string) | May not break, but is risky |

### Evolution Strategy

```javascript
// Step 1: Add new field alongside old field
// Response: { "name": "Widget", "productName": "Widget" }

// Step 2: Wait for all consumers to migrate to new field
// Verify via Pact Broker: which consumers still use "name"?

// Step 3: Mark old field as deprecated
// Response: { "name": "Widget", "productName": "Widget" }
// OpenAPI: name: { deprecated: true }

// Step 4: Remove old field after all consumers have migrated
// Verify via can-i-deploy that no consumer contract references "name"
```

### Versioned APIs for Breaking Changes

```java
// Option 1: URL versioning
@GetMapping("/v1/products/{id}")
public ProductV1 getProductV1(@PathVariable String id) { ... }

@GetMapping("/v2/products/{id}")
public ProductV2 getProductV2(@PathVariable String id) { ... }

// Option 2: Content negotiation
@GetMapping(value = "/products/{id}", produces = "application/vnd.example.v1+json")
public ProductV1 getProductV1(@PathVariable String id) { ... }

@GetMapping(value = "/products/{id}", produces = "application/vnd.example.v2+json")
public ProductV2 getProductV2(@PathVariable String id) { ... }
```

## Breaking Change Detection

### Automated Detection with Pact Broker

```bash
# Check if a provider change is safe
npx pact-broker can-i-deploy \
  --pacticipant ProductService \
  --version $(git rev-parse HEAD) \
  --to-environment production

# If a consumer pact fails verification, the output shows:
# CONSUMER        | C.VERSION | PROVIDER        | P.VERSION | SUCCESS?
# OrderService    | abc123    | ProductService  | def456    | false
#
# The verification for the pact between OrderService and ProductService failed
```

### Detecting Breaking Changes in CI

```yaml
# Provider CI: verify before merging to main
- name: Verify backward compatibility
  run: |
    npm run test:pact:provider

    # Check against all deployed consumers
    npx pact-broker can-i-deploy \
      --pacticipant ProductService \
      --version ${{ github.sha }} \
      --to-environment production \
      --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
      --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

- name: Notify if breaking change detected
  if: failure()
  run: |
    echo "Breaking change detected. The following consumers would be affected:"
    npx pact-broker can-i-deploy \
      --pacticipant ProductService \
      --version ${{ github.sha }} \
      --to-environment production \
      --output table 2>&1 || true
```

### Schema Diff Tools

```bash
# OpenAPI diff (for provider-driven contracts)
npx openapi-diff old-api.yaml new-api.yaml --fail-on-incompatible

# Output:
# Breaking changes:
#   DELETE /products/{id} - Endpoint removed
#   GET /products - Response field 'name' removed
```

## Contract Testing vs E2E Testing

### Comparison

| Aspect | Contract Testing | E2E Testing |
|--------|-----------------|-------------|
| Speed | Fast (seconds) | Slow (minutes) |
| Reliability | Deterministic | Flaky (network, data, timing) |
| Scope | Interface between two services | Full system behavior |
| Environment | Local, no dependencies | Requires all services running |
| Maintenance | Low (auto-generated from tests) | High (complex setup, teardown) |
| Confidence in integration | High for API shape | High for full flow |
| Cost to run | Low (unit test speed) | High (infrastructure needed) |
| Debugging | Easy (single interaction) | Hard (distributed tracing needed) |
| Coverage | Interface contracts | Business flows |

### When to Use Each

```
Contract Tests:
  ✓ API shape verification (request/response structure)
  ✓ Field type checking
  ✓ Error response format
  ✓ Consumer-provider compatibility
  ✗ Business flow validation
  ✗ Data consistency across services
  ✗ Performance under load

E2E Tests:
  ✓ Critical business flows (checkout, onboarding)
  ✓ Cross-service data consistency
  ✓ Integration with third-party services
  ✗ Every possible API interaction
  ✗ Every error scenario
  ✗ Rapid feedback (too slow for PR checks)
```

### Testing Pyramid with Contracts

```
        /  E2E Tests  \        Few, critical paths only
       / Contract Tests \      All service boundaries
      /  Integration Tests \   Database, cache, queue
     /     Unit Tests        \ Business logic, utilities
```

### Practical Split

```javascript
// CONTRACT TEST: Verify API shape
// "OrderService expects ProductService to return {id, name, price} for GET /products/:id"
provider
  .given('product 123 exists')
  .uponReceiving('get product')
  .withRequest({ method: 'GET', path: '/products/123' })
  .willRespondWith({
    status: 200,
    body: { id: string(), name: string(), price: decimal() },
  });

// E2E TEST: Verify business flow
// "User can complete a purchase from browse to checkout"
test('complete purchase flow', async () => {
  await loginAs('testuser');
  await browseTo('/products');
  await clickProduct('Widget');
  await clickAddToCart();
  await navigateTo('/checkout');
  await enterPaymentDetails(testCard);
  await clickPurchase();
  await expectOrderConfirmation();
});

// UNIT TEST: Verify business logic
// "Order total calculation applies discount and tax correctly"
test('order total with discount', () => {
  const order = new Order([
    { productId: '123', price: 100, quantity: 2 },
  ]);
  order.applyDiscount('SAVE10', 0.10);
  order.applyTax(0.08);
  expect(order.total).toBe(194.40);
});
```

## Implementing Consumer-Driven Contracts Across Teams

### Workflow

```
1. Consumer team identifies need for new endpoint or field
2. Consumer team writes Pact test and publishes contract
3. Pact Broker notifies provider team (webhook)
4. Provider team reviews the contract (pending pact)
5. Provider team implements or confirms support
6. Provider verification succeeds → pact is no longer pending
7. Both teams deploy independently using can-i-deploy
```

### Communication Pattern

```
Consumer PR → "We need field 'loyaltyPoints' on GET /users/:id"
                ↓
Pact published to broker (pending)
                ↓
Provider webhook triggers → provider team notified
                ↓
Provider reviews: "This field exists / we will add it"
                ↓
Provider CI verifies successfully → pact no longer pending
                ↓
Both teams use can-i-deploy → safe independent deployment
```

### Team Agreements

Define a team contract for contract testing adoption:

1. **Consumer responsibility**: Write contract tests for every provider interaction; publish pacts to broker from CI.
2. **Provider responsibility**: Verify all consumer pacts in CI; fix verification failures promptly; communicate planned breaking changes.
3. **Shared responsibility**: Review cross-team contract PRs; maintain Pact Broker; keep environments recorded.

## Anti-Patterns

1. **Using contract tests as E2E tests** - Contract tests verify interface shape, not business logic or data flow. Do not try to test multi-step workflows through contracts.
2. **Consumer specifying exact values** - The consumer should specify types and patterns, not exact values. Exact values make contracts brittle.
3. **Provider ignoring consumer contracts** - If the provider team treats contract failures as noise, the entire system loses value. Treat verification failures like test failures.
4. **One giant pact per consumer** - Split interactions into logical groups. A consumer may have separate pacts for different workflows.
5. **Not testing error scenarios** - Happy-path-only contracts miss critical integration issues. Test 404, 400, 500 responses.
6. **Skipping contract tests because E2E exists** - E2E tests are slow, flaky, and expensive. Contract tests provide faster, more reliable coverage of the same interface.
7. **Treating contracts as documentation** - Contracts are executable tests, not API documentation. Use OpenAPI for documentation, Pact for verification.

## Production Checklist

- [ ] Consumer-driven or bi-directional approach chosen based on team structure
- [ ] All service boundaries covered by contract tests
- [ ] Breaking change detection automated in CI (can-i-deploy)
- [ ] Contract evolution strategy documented (deprecation, versioning)
- [ ] Both happy path and error scenarios included in contracts
- [ ] Pending pacts enabled for new consumer onboarding
- [ ] E2E tests cover critical business flows only (not API shape)
- [ ] Team agreements documented for contract ownership and response times
- [ ] Pact Broker dashboard reviewed weekly for stale or failing contracts
- [ ] Schema diff tools integrated for provider-driven specs (OpenAPI)
- [ ] Contract test failures treated as build failures, not warnings
- [ ] Independent deployability verified: each service can deploy without coordinating with others
