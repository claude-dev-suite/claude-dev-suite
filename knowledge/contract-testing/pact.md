# Pact Contract Testing

## Overview

Pact is the most widely adopted framework for consumer-driven contract testing. It enables teams to verify that services communicate correctly without requiring integrated environments. The consumer defines the expected interactions (a "pact"), and the provider verifies that it satisfies those expectations. Pact supports HTTP, messaging, and GraphQL interactions across JavaScript, Java, Python, Go, Ruby, .NET, and more.

## Core Concepts

### Consumer-Driven Contracts

The consumer (the service making the call) defines what it expects from the provider (the service responding). This inverts the traditional approach where the provider defines its API and consumers must adapt.

```
1. Consumer writes a test that defines expected request/response pairs
2. Pact generates a contract file (pact.json) from the test
3. Contract is shared with the provider (via Pact Broker or file)
4. Provider runs verification to confirm it satisfies the contract
```

### Pact File Structure

```json
{
  "consumer": { "name": "OrderService" },
  "provider": { "name": "ProductService" },
  "interactions": [
    {
      "description": "a request for product 123",
      "request": {
        "method": "GET",
        "path": "/products/123",
        "headers": { "Accept": "application/json" }
      },
      "response": {
        "status": 200,
        "headers": { "Content-Type": "application/json" },
        "body": {
          "id": "123",
          "name": "Widget",
          "price": 9.99,
          "inStock": true
        }
      }
    }
  ],
  "metadata": {
    "pactSpecification": { "version": "2.0.0" }
  }
}
```

## Pact JS -- Consumer Tests

### Installation

```bash
npm install --save-dev @pact-foundation/pact
```

### Writing Consumer Tests

```javascript
// order-service/tests/pact/product.consumer.test.js
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { ProductClient } from '../../src/clients/product-client.js';

const { like, eachLike, integer, decimal, boolean, string, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'OrderService',
  provider: 'ProductService',
  logLevel: 'warn',
});

describe('ProductService API', () => {
  describe('GET /products/:id', () => {
    it('returns product details', async () => {
      // Arrange: define the expected interaction
      provider
        .given('product 123 exists')
        .uponReceiving('a request for product 123')
        .withRequest({
          method: 'GET',
          path: '/products/123',
          headers: { Accept: 'application/json' },
        })
        .willRespondWith({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: string('123'),
            name: string('Widget'),
            price: decimal(9.99),
            inStock: boolean(true),
            category: like({
              id: string('cat-1'),
              name: string('Electronics'),
            }),
          },
        });

      // Act: execute the test against the mock provider
      await provider.executeTest(async (mockServer) => {
        const client = new ProductClient(mockServer.url);
        const product = await client.getProduct('123');

        // Assert: verify the client processes the response correctly
        expect(product.id).toBe('123');
        expect(product.name).toBe('Widget');
        expect(typeof product.price).toBe('number');
        expect(product.inStock).toBe(true);
      });
    });

    it('returns 404 when product does not exist', async () => {
      provider
        .given('product 999 does not exist')
        .uponReceiving('a request for non-existent product')
        .withRequest({
          method: 'GET',
          path: '/products/999',
          headers: { Accept: 'application/json' },
        })
        .willRespondWith({
          status: 404,
          body: {
            error: string('Product not found'),
            code: string('PRODUCT_NOT_FOUND'),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const client = new ProductClient(mockServer.url);
        await expect(client.getProduct('999')).rejects.toThrow('Product not found');
      });
    });
  });

  describe('POST /products', () => {
    it('creates a new product', async () => {
      provider
        .given('the product catalog is writable')
        .uponReceiving('a request to create a product')
        .withRequest({
          method: 'POST',
          path: '/products',
          headers: { 'Content-Type': 'application/json' },
          body: {
            name: 'New Widget',
            price: 19.99,
            category: 'Electronics',
          },
        })
        .willRespondWith({
          status: 201,
          body: {
            id: regex(/^prod-[a-f0-9]+$/, 'prod-abc123'),
            name: string('New Widget'),
            price: decimal(19.99),
            createdAt: regex(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
              '2025-01-15T10:30:00Z'
            ),
          },
        });

      await provider.executeTest(async (mockServer) => {
        const client = new ProductClient(mockServer.url);
        const created = await client.createProduct({
          name: 'New Widget',
          price: 19.99,
          category: 'Electronics',
        });

        expect(created.id).toMatch(/^prod-/);
        expect(created.name).toBe('New Widget');
      });
    });
  });
});
```

### Matching Rules

```javascript
import { MatchersV3 } from '@pact-foundation/pact';

const {
  like,          // Match by type (any value of same type)
  eachLike,      // Array where each element matches the example
  string,        // Must be a string
  integer,       // Must be an integer
  decimal,       // Must be a decimal number
  boolean,       // Must be a boolean
  regex,         // Must match regex pattern
  datetime,      // Must match datetime format
  uuid,          // Must be a UUID
  fromProviderState, // Value from provider state
} = MatchersV3;

// Complex matching example
const body = {
  id: uuid(),
  name: string('Widget'),
  price: decimal(9.99),
  quantity: integer(42),
  available: boolean(true),
  tags: eachLike('electronics'),        // Array of strings
  metadata: like({                       // Object with matching structure
    createdBy: string('admin'),
    version: integer(1),
  }),
  updatedAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
  status: regex(/^(active|inactive|archived)$/, 'active'),
};
```

## Pact JS -- Provider Verification

```javascript
// product-service/tests/pact/provider.test.js
import { Verifier } from '@pact-foundation/pact';
import { app } from '../../src/app.js';

let server;

beforeAll(async () => {
  server = app.listen(0); // Random available port
});

afterAll(() => {
  server.close();
});

describe('ProductService Provider Verification', () => {
  it('satisfies all consumer contracts', async () => {
    const port = server.address().port;

    await new Verifier({
      providerBaseUrl: `http://localhost:${port}`,
      provider: 'ProductService',

      // Option 1: Local pact files
      pactUrls: ['./pacts/OrderService-ProductService.json'],

      // Option 2: Pact Broker
      // pactBrokerUrl: 'https://broker.example.com',
      // pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      // consumerVersionSelectors: [
      //   { mainBranch: true },
      //   { deployedOrReleased: true },
      // ],

      // Provider state setup
      stateHandlers: {
        'product 123 exists': async () => {
          await testDb.products.insert({
            id: '123',
            name: 'Widget',
            price: 9.99,
            inStock: true,
            category: { id: 'cat-1', name: 'Electronics' },
          });
        },
        'product 999 does not exist': async () => {
          await testDb.products.deleteById('999');
        },
        'the product catalog is writable': async () => {
          // No setup needed, catalog is always writable in test
        },
      },

      // Teardown after each interaction
      afterEach: async () => {
        await testDb.products.clear();
      },

      publishVerificationResult: process.env.CI === 'true',
      providerVersion: process.env.GIT_COMMIT,
      providerVersionBranch: process.env.GIT_BRANCH,

      logLevel: 'warn',
    }).verifyProvider();
  });
});
```

## Pact JVM (Java)

### Consumer Test (JUnit 5)

```java
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "ProductService", pactVersion = PactSpecVersion.V3)
class ProductClientPactTest {

    @Pact(consumer = "OrderService")
    V4Pact getProductPact(PactDslWithProvider builder) {
        return builder
            .given("product 123 exists")
            .uponReceiving("a request for product 123")
            .path("/products/123")
            .method("GET")
            .headers("Accept", "application/json")
            .willRespondWith()
            .status(200)
            .headers(Map.of("Content-Type", "application/json"))
            .body(new PactDslJsonBody()
                .stringType("id", "123")
                .stringType("name", "Widget")
                .decimalType("price", 9.99)
                .booleanType("inStock", true)
                .object("category")
                    .stringType("id", "cat-1")
                    .stringType("name", "Electronics")
                .closeObject())
            .toPact(V4Pact.class);
    }

    @Test
    @PactTestFor(pactMethod = "getProductPact")
    void getProduct(MockServer mockServer) {
        ProductClient client = new ProductClient(mockServer.getUrl());
        Product product = client.getProduct("123");

        assertThat(product.getId()).isEqualTo("123");
        assertThat(product.getName()).isEqualTo("Widget");
        assertThat(product.getPrice()).isEqualTo(9.99);
    }
}
```

### Provider Verification (JUnit 5)

```java
@Provider("ProductService")
@PactBroker(
    url = "${PACT_BROKER_URL}",
    authentication = @PactBrokerAuth(token = "${PACT_BROKER_TOKEN}"),
    consumerVersionSelectors = {
        @VersionSelector(mainBranch = true),
        @VersionSelector(deployedOrReleased = true)
    }
)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProductProviderPactTest {

    @LocalServerPort
    int port;

    @BeforeEach
    void setupProvider(PactVerificationContext context) {
        context.setTarget(new HttpTestTarget("localhost", port));
    }

    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void verifyPact(PactVerificationContext context) {
        context.verifyInteraction();
    }

    @State("product 123 exists")
    void product123Exists() {
        productRepository.save(new Product("123", "Widget", 9.99, true));
    }

    @State("product 999 does not exist")
    void product999Missing() {
        productRepository.deleteById("999");
    }
}
```

## Provider States

Provider states set up the test data that the interaction requires. They bridge the gap between what the consumer expects and what the provider needs to have in its database.

```javascript
// Consumer declares the state
provider
  .given('product 123 exists')
  .given('user is authenticated as admin')
  .uponReceiving('admin updates product price')
  .withRequest({ method: 'PUT', path: '/products/123', body: { price: 19.99 } })
  .willRespondWith({ status: 200 });

// Provider implements the state
stateHandlers: {
  'product 123 exists': async (params) => {
    await db.products.insert({ id: '123', name: 'Widget', price: 9.99 });
  },
  'user is authenticated as admin': async () => {
    // Set up auth context or mock authentication
  },
}
```

## Pact Broker

### Publishing Pacts

```bash
# Publish from consumer CI
npx pact-broker publish ./pacts \
  --consumer-app-version=$(git rev-parse HEAD) \
  --branch=$(git branch --show-current) \
  --broker-base-url=https://broker.example.com \
  --broker-token=$PACT_BROKER_TOKEN
```

### Can-I-Deploy

```bash
# Check if it's safe to deploy the consumer
npx pact-broker can-i-deploy \
  --pacticipant=OrderService \
  --version=$(git rev-parse HEAD) \
  --to-environment=production \
  --broker-base-url=https://broker.example.com \
  --broker-token=$PACT_BROKER_TOKEN
```

### Record Deployment

```bash
npx pact-broker record-deployment \
  --pacticipant=OrderService \
  --version=$(git rev-parse HEAD) \
  --environment=production \
  --broker-base-url=https://broker.example.com
```

## Anti-Patterns

1. **Testing provider implementation details** - Contracts should test the interface, not internal behavior. Do not assert on specific database states or error message wording that might change.
2. **Too many interactions in one pact** - Each interaction should test one specific scenario. Avoid creating a single pact with every possible API call.
3. **Not using matching rules** - Hardcoded values in contracts break when the provider returns different but valid data. Use `like()`, `regex()`, and type matchers.
4. **Skipping provider states** - Without proper state setup, provider verification tests are flaky or always fail.
5. **Consumer defining provider behavior** - The consumer should define what response it needs, not dictate how the provider implements it.
6. **Not publishing verification results** - Without publishing to Pact Broker, `can-i-deploy` cannot determine deployment safety.
7. **Testing through a gateway or proxy** - Contract tests should hit the provider directly, not through API gateways that may transform responses.

## Production Checklist

- [ ] Consumer tests written for all critical provider interactions
- [ ] Matching rules used instead of exact value matching
- [ ] Provider states set up for each required scenario
- [ ] Pact files published to Pact Broker from consumer CI
- [ ] Provider verification runs in provider CI
- [ ] Verification results published back to Pact Broker
- [ ] `can-i-deploy` integrated into deployment pipeline
- [ ] `record-deployment` called after successful deployments
- [ ] Consumer version selectors configured (mainBranch, deployedOrReleased)
- [ ] Error scenarios tested (404, 400, 500)
- [ ] Webhook configured to trigger provider verification when new pacts are published
- [ ] Team onboarding documentation includes Pact workflow
