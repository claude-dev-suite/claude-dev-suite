# Spring Cloud Contract

## Overview

Spring Cloud Contract is a contract testing framework for the Spring ecosystem. Unlike Pact's consumer-driven approach, Spring Cloud Contract is provider-driven: the provider defines the contract, auto-generates tests to verify compliance, and publishes stubs that consumers use for integration testing. It supports HTTP and messaging contracts defined in Groovy DSL or YAML.

## Contract DSL

### Groovy DSL

```groovy
// contracts/product/shouldReturnProduct.groovy
import org.springframework.cloud.contract.spec.Contract

Contract.make {
    description "Should return product by ID"
    request {
        method GET()
        url "/products/123"
        headers {
            accept(applicationJson())
        }
    }
    response {
        status OK()
        headers {
            contentType(applicationJson())
        }
        body([
            id: "123",
            name: $(producer("Widget"), consumer(regex("[A-Za-z ]+")))  ,
            price: $(producer(9.99), consumer(regex("[0-9]+\\.[0-9]{2}"))),
            inStock: true,
            category: [
                id: $(producer("cat-1"), consumer(regex("cat-[a-z0-9]+"))),
                name: "Electronics"
            ]
        ])
    }
}
```

```groovy
// contracts/product/shouldCreateProduct.groovy
Contract.make {
    description "Should create a new product"
    request {
        method POST()
        url "/products"
        headers {
            contentType(applicationJson())
        }
        body([
            name: $(consumer(regex("[A-Za-z ]{2,100}")), producer("New Widget")),
            price: $(consumer(regex("[0-9]+\\.[0-9]{2}")), producer(19.99)),
            category: $(consumer(regex("[A-Za-z]+")), producer("Electronics"))
        ])
    }
    response {
        status CREATED()
        headers {
            contentType(applicationJson())
        }
        body([
            id: $(producer(regex("prod-[a-f0-9]+")), consumer("prod-abc123")),
            name: fromRequest().body('$.name'),
            price: fromRequest().body('$.price'),
            createdAt: $(producer(regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*")))
        ])
    }
}
```

### YAML DSL

```yaml
# contracts/product/shouldReturnProduct.yml
description: Should return product by ID
request:
  method: GET
  url: /products/123
  headers:
    Accept: application/json
response:
  status: 200
  headers:
    Content-Type: application/json
  body:
    id: "123"
    name: Widget
    price: 9.99
    inStock: true
    category:
      id: cat-1
      name: Electronics
  matchers:
    body:
      - path: $.id
        type: by_regex
        value: "[a-z0-9-]+"
      - path: $.name
        type: by_regex
        value: "[A-Za-z ]+"
      - path: $.price
        type: by_type
```

```yaml
# contracts/product/shouldReturn404ForMissing.yml
description: Should return 404 for non-existent product
request:
  method: GET
  url: /products/999
  headers:
    Accept: application/json
response:
  status: 404
  headers:
    Content-Type: application/json
  body:
    error: Product not found
    code: PRODUCT_NOT_FOUND
  matchers:
    body:
      - path: $.error
        type: by_type
      - path: $.code
        type: by_regex
        value: "[A-Z_]+"
```

## Producer Side

### Project Setup

```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-contract-verifier</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-contract-maven-plugin</artifactId>
            <version>4.1.0</version>
            <extensions>true</extensions>
            <configuration>
                <testFramework>JUNIT5</testFramework>
                <baseClassForTests>
                    com.example.product.BaseContractTest
                </baseClassForTests>
                <!-- Contract location -->
                <contractsDirectory>
                    ${project.basedir}/src/test/resources/contracts
                </contractsDirectory>
            </configuration>
        </plugin>
    </plugins>
</build>
```

### Base Test Class

```java
// The plugin generates test classes that extend this base class
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@AutoConfigureJsonTesters
public abstract class BaseContractTest {

    @Autowired
    private WebApplicationContext context;

    @MockBean
    private ProductRepository productRepository;

    @BeforeEach
    void setup() {
        RestAssuredMockMvc.webAppContextSetup(context);

        // Set up test data for contracts
        when(productRepository.findById("123"))
            .thenReturn(Optional.of(new Product("123", "Widget", 9.99, true,
                new Category("cat-1", "Electronics"))));

        when(productRepository.findById("999"))
            .thenReturn(Optional.empty());

        when(productRepository.save(any(Product.class)))
            .thenAnswer(inv -> {
                Product p = inv.getArgument(0);
                p.setId("prod-abc123");
                p.setCreatedAt(Instant.now());
                return p;
            });
    }
}
```

### Auto-Generated Tests

When you run `mvn generate-test-sources`, the plugin generates test classes like:

```java
// Generated automatically - do not edit
public class ProductTest extends BaseContractTest {

    @Test
    public void validate_shouldReturnProduct() throws Exception {
        // given
        MockMvcRequestSpecification request = given()
            .header("Accept", "application/json");

        // when
        ResponseOptions response = given().spec(request)
            .get("/products/123");

        // then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.header("Content-Type")).matches("application/json.*");

        DocumentContext parsedJson = JsonPath.parse(response.getBody().asString());
        assertThatJson(parsedJson).field("['id']").isEqualTo("123");
        assertThatJson(parsedJson).field("['name']").matches("[A-Za-z ]+");
        assertThatJson(parsedJson).field("['price']").matches("[0-9]+\\.[0-9]{2}");
    }
}
```

### Package-Specific Base Classes

```xml
<configuration>
    <baseClassMappings>
        <baseClassMapping>
            <contractPackageRegex>.*product.*</contractPackageRegex>
            <baseClassFQN>com.example.BaseProductContractTest</baseClassFQN>
        </baseClassMapping>
        <baseClassMapping>
            <contractPackageRegex>.*order.*</contractPackageRegex>
            <baseClassFQN>com.example.BaseOrderContractTest</baseClassFQN>
        </baseClassMapping>
    </baseClassMappings>
</configuration>
```

## Consumer Side

### Using WireMock Stubs

When the producer publishes its artifact, it includes a `-stubs` JAR that contains WireMock mappings generated from the contracts.

```xml
<!-- Consumer pom.xml -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-contract-stub-runner</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@SpringBootTest
@AutoConfigureStubRunner(
    ids = "com.example:product-service:+:stubs:8090",
    stubsMode = StubRunnerProperties.StubsMode.LOCAL
)
class OrderServiceContractTest {

    @Autowired
    private ProductClient productClient; // Uses http://localhost:8090

    @Test
    void shouldFetchProduct() {
        Product product = productClient.getProduct("123");

        assertThat(product).isNotNull();
        assertThat(product.getId()).isEqualTo("123");
        assertThat(product.getName()).isNotBlank();
        assertThat(product.getPrice()).isPositive();
    }

    @Test
    void shouldHandle404() {
        assertThatThrownBy(() -> productClient.getProduct("999"))
            .isInstanceOf(ProductNotFoundException.class);
    }
}
```

### Stub Runner with Artifactory

```java
@AutoConfigureStubRunner(
    ids = "com.example:product-service",
    stubsMode = StubRunnerProperties.StubsMode.REMOTE,
    repositoryRoot = "https://artifactory.example.com/libs-release"
)
```

### Stub Runner with Git

```java
@AutoConfigureStubRunner(
    ids = "com.example:product-service",
    stubsMode = StubRunnerProperties.StubsMode.REMOTE,
    repositoryRoot = "git://https://github.com/example/contracts.git"
)
```

## Contract Inheritance

Share common patterns across contracts using base contracts.

```groovy
// contracts/common/authenticated.groovy
Contract.make {
    request {
        headers {
            header('Authorization', $(consumer(regex('Bearer [A-Za-z0-9\\-._~+/]+=*')),
                producer('Bearer test-token')))
        }
    }
}
```

```groovy
// contracts/product/shouldReturnProductForAuthUser.groovy
Contract.make {
    description "Authenticated user gets product"
    request {
        method GET()
        url "/products/123"
        headers {
            accept(applicationJson())
            header('Authorization', $(consumer(regex('Bearer [A-Za-z0-9\\-._~+/]+=*')),
                producer('Bearer test-token')))
        }
    }
    response {
        status OK()
        body([
            id: "123",
            name: "Widget"
        ])
    }
}
```

## Messaging Contracts

Spring Cloud Contract supports contract testing for message-based communication (Kafka, RabbitMQ, etc.).

### Groovy Messaging Contract

```groovy
// contracts/messaging/shouldEmitOrderCreatedEvent.groovy
Contract.make {
    description "Should emit OrderCreated event when order is placed"
    label "order_created"
    input {
        triggeredBy("placeOrder()")
    }
    outputMessage {
        sentTo("orders")
        headers {
            header("contentType", applicationJson())
            header("eventType", "OrderCreated")
        }
        body([
            orderId: $(producer(regex("ord-[a-f0-9]+")), consumer("ord-abc123")),
            customerId: $(producer(regex("cust-[a-f0-9]+")), consumer("cust-xyz")),
            totalAmount: $(producer(regex("[0-9]+\\.[0-9]{2}")), consumer("99.99")),
            status: "CREATED",
            createdAt: $(producer(regex("\\d{4}-\\d{2}-\\d{2}T.*")))
        ])
    }
}
```

### Messaging Base Test

```java
@SpringBootTest
public abstract class BaseMessagingContractTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private MessageVerifierSender<Message<?>> sender;

    @Autowired
    private MessageVerifierReceiver<Message<?>> receiver;

    public void placeOrder() {
        orderService.placeOrder(new OrderRequest(
            "cust-xyz",
            List.of(new OrderItem("prod-123", 1)),
            "card"
        ));
    }
}
```

### YAML Messaging Contract

```yaml
description: Order created event
label: order_created
input:
  triggeredBy: placeOrder()
outputMessage:
  sentTo: orders
  headers:
    contentType: application/json
    eventType: OrderCreated
  body:
    orderId: "ord-abc123"
    customerId: "cust-xyz"
    totalAmount: "99.99"
    status: CREATED
  matchers:
    body:
      - path: $.orderId
        type: by_regex
        value: "ord-[a-f0-9]+"
      - path: $.totalAmount
        type: by_regex
        value: "[0-9]+\\.[0-9]{2}"
```

## Publishing Stubs

### Maven

```bash
# Generate stubs and install locally
mvn clean install

# Deploy to remote repository
mvn clean deploy
```

### Gradle

```groovy
plugins {
    id 'org.springframework.cloud.contract' version '4.1.0'
}

contracts {
    testFramework = TestFramework.JUNIT5
    baseClassForTests = 'com.example.BaseContractTest'
}

// Publish stubs to Maven repository
publishing {
    publications {
        stubs(MavenPublication) {
            artifact verifierStubsJar
        }
    }
}
```

## Anti-Patterns

1. **Contracts too tightly coupled to implementation** - Contracts should define the interface shape, not exact values. Use matchers (`regex`, `byType`) instead of literals.
2. **Not using base class mappings** - A single base class for all contracts leads to bloated setup. Use package-based mappings for clean separation.
3. **Testing business logic in contracts** - Contracts verify communication, not business rules. Keep contract tests focused on request/response shape.
4. **Ignoring stub runner in consumer tests** - Consumers should use the generated stubs, not hand-written mocks. This is the whole point of the framework.
5. **Not versioning contracts** - Contracts must evolve with the API. Use semantic versioning on the stubs artifact.
6. **Skipping messaging contracts** - If services communicate via events, test those contracts too, not just HTTP.
7. **Provider base class doing too much** - The base class should set up minimal state for the contract, not bootstrap the entire application.

## Production Checklist

- [ ] Contracts defined for all provider endpoints consumed by other services
- [ ] Matchers used for flexible value matching (regex, byType)
- [ ] Base test classes set up per contract group
- [ ] Auto-generated tests passing in provider CI
- [ ] Stubs published to artifact repository (Maven/Gradle)
- [ ] Consumers use @AutoConfigureStubRunner for integration tests
- [ ] Messaging contracts defined for event-driven interactions
- [ ] Contract evolution follows backward compatibility rules
- [ ] Stub Runner mode configured (LOCAL for dev, REMOTE for CI)
- [ ] Base class mappings configured for multi-domain APIs
- [ ] Contract changes reviewed in PR process (provider and consumer teams aligned)
