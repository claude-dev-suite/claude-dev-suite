---
name: contract-testing
description: |
  Contract testing for API consumers and providers. Pact framework,
  Spring Cloud Contract, consumer-driven contracts, provider verification,
  and contract broker setup.

  USE WHEN: user mentions "contract testing", "Pact", "consumer-driven contract",
  "Spring Cloud Contract", "API contract", "provider verification"

  DO NOT USE FOR: OpenAPI validation - use `openapi-contract`;
  integration testing - use integration test skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Contract Testing

## Pact (Consumer-Driven Contracts)

### Consumer Test (Node.js)

```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, eachLike, string, integer } = MatchersV3;

const provider = new PactV3({
  consumer: 'OrderService',
  provider: 'ProductService',
});

describe('Product API contract', () => {
  it('returns a product by ID', async () => {
    await provider
      .given('product 123 exists')
      .uponReceiving('a request for product 123')
      .withRequest({
        method: 'GET',
        path: '/api/products/123',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: like({
          id: string('123'),
          name: string('Widget'),
          price: integer(1999),
        }),
      })
      .executeTest(async (mockserver) => {
        const client = new ProductClient(mockserver.url);
        const product = await client.getProduct('123');
        expect(product.id).toBe('123');
        expect(product.name).toBeDefined();
      });
  });
});
```

### Provider Verification

```typescript
import { Verifier } from '@pact-foundation/pact';

describe('Product provider verification', () => {
  it('validates contracts', async () => {
    await new Verifier({
      providerBaseUrl: 'http://localhost:3000',
      pactUrls: ['./pacts/OrderService-ProductService.json'],
      // Or from broker:
      // pactBrokerUrl: 'https://pact-broker.example.com',
      // publishVerificationResult: true,
      // providerVersion: process.env.GIT_SHA,
      stateHandlers: {
        'product 123 exists': async () => {
          await db.product.create({ data: { id: '123', name: 'Widget', price: 1999 } });
        },
      },
    }).verifyProvider();
  });
});
```

## Spring Cloud Contract

### Contract Definition (Groovy DSL)

```groovy
// contracts/shouldReturnProduct.groovy
Contract.make {
    description "should return product by ID"
    request {
        method GET()
        url "/api/products/123"
        headers { contentType applicationJson() }
    }
    response {
        status OK()
        headers { contentType applicationJson() }
        body([
            id: "123",
            name: $(regex('[A-Za-z ]+')),
            price: $(regex('[0-9]+')),
        ])
    }
}
```

### Provider Base Test

```java
@SpringBootTest(webEnvironment = WebEnvironment.MOCK)
@AutoConfigureMockMvc
public abstract class ContractBaseTest {
    @Autowired MockMvc mockMvc;
    @MockBean ProductRepository productRepo;

    @BeforeEach
    void setup() {
        when(productRepo.findById("123"))
            .thenReturn(Optional.of(new Product("123", "Widget", 1999)));
        RestAssuredMockMvc.mockMvc(mockMvc);
    }
}
```

## Workflow

```
1. Consumer writes contract test → generates pact file
2. Pact file published to broker (or shared via file)
3. Provider runs verification against pact
4. Both sides deploy only when contracts pass
```

## Pact Broker

```bash
# Publish pact
npx pact-broker publish ./pacts \
  --consumer-app-version=$(git rev-parse HEAD) \
  --broker-base-url=https://pact-broker.example.com

# Can I Deploy?
npx pact-broker can-i-deploy \
  --pacticipant=OrderService \
  --version=$(git rev-parse HEAD) \
  --to-environment=production
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Testing implementation details | Test contract shape, not business logic |
| Over-specifying response fields | Use matchers (like, regex), not exact values |
| No state management | Define provider states for test data setup |
| Contracts not in CI | Run contract tests in CI/CD pipeline |
| Skipping provider verification | Both sides must run their tests |

## Production Checklist

- [ ] Consumer-driven contracts for all API dependencies
- [ ] Pact Broker (or equivalent) for contract sharing
- [ ] Provider verification in CI pipeline
- [ ] `can-i-deploy` check before deployment
- [ ] Provider states for test data setup
- [ ] Contract versioned with git SHA
