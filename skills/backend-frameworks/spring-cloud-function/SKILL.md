---
name: spring-cloud-function
description: |
  Spring Cloud Function for serverless and FaaS deployments.
  Covers function beans, AWS Lambda, Azure Functions, and GCP adapters.

  USE WHEN: user mentions "spring cloud function", "serverless Spring",
  "AWS Lambda Spring", "Azure Functions Spring", "FaaS", "function composition"

  DO NOT USE FOR: simple REST APIs - use standard controllers,
  complex workflows - consider Step Functions or similar
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Function - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-function` for comprehensive documentation.

## Dependencies

```xml
<!-- Core -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-function-web</artifactId>
</dependency>

<!-- AWS Lambda adapter -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-function-adapter-aws</artifactId>
</dependency>

<!-- Azure Functions adapter -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-function-adapter-azure</artifactId>
</dependency>

<!-- GCP Cloud Functions adapter -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-function-adapter-gcp</artifactId>
</dependency>
```

## Function Types

```
┌─────────────────────────────────────────────────────────────┐
│                   Function Types                            │
│                                                             │
│  Function<I, O>     Input → Processing → Output            │
│  Consumer<I>        Input → Processing (no output)         │
│  Supplier<O>        (no input) → Generate Output           │
│                                                             │
│  ┌───────┐    ┌──────────┐    ┌────────┐                   │
│  │ Input │───▶│ Function │───▶│ Output │                   │
│  └───────┘    └──────────┘    └────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Basic Functions

### Function (Input → Output)
```java
@Configuration
public class FunctionConfig {

    @Bean
    public Function<String, String> uppercase() {
        return value -> value.toUpperCase();
    }

    @Bean
    public Function<Person, Greeting> greet() {
        return person -> new Greeting("Hello, " + person.getName() + "!");
    }

    @Bean
    public Function<Flux<String>, Flux<String>> reactiveUppercase() {
        return flux -> flux.map(String::toUpperCase);
    }
}

public record Person(String name, int age) {}
public record Greeting(String message) {}
```

### Consumer (Input → void)
```java
@Bean
public Consumer<Order> processOrder() {
    return order -> {
        log.info("Processing order: {}", order.getId());
        orderService.process(order);
    };
}

@Bean
public Consumer<Flux<Event>> eventProcessor() {
    return events -> events
        .doOnNext(event -> log.info("Received event: {}", event))
        .subscribe(eventService::handle);
}
```

### Supplier (void → Output)
```java
@Bean
public Supplier<String> hello() {
    return () -> "Hello, World!";
}

@Bean
public Supplier<Flux<Long>> counter() {
    return () -> Flux.interval(Duration.ofSeconds(1));
}

@Bean
public Supplier<List<Product>> getProducts() {
    return () -> productRepository.findAll();
}
```

## Configuration

### application.yml
```yaml
spring:
  cloud:
    function:
      # Default function to invoke
      definition: uppercase

      # For multiple functions
      # definition: validate|process|notify

      # Routing based on header
      routing-expression: "headers['function-name']"

# Function-specific config
uppercase:
  prefix: "RESULT: "
```

## Function Composition

```java
// Compose functions
@Bean
public Function<String, String> validate() {
    return input -> {
        if (input == null || input.isEmpty()) {
            throw new IllegalArgumentException("Input cannot be empty");
        }
        return input;
    };
}

@Bean
public Function<String, String> sanitize() {
    return input -> input.trim().toLowerCase();
}

@Bean
public Function<String, String> process() {
    return input -> "Processed: " + input;
}

// Configuration to compose: validate|sanitize|process
// spring.cloud.function.definition=validate|sanitize|process
```

### Programmatic Composition
```java
@Bean
public Function<String, String> composedFunction(
        Function<String, String> validate,
        Function<String, String> sanitize,
        Function<String, String> process) {

    return validate.andThen(sanitize).andThen(process);
}
```

## HTTP Endpoints

```java
// Automatic HTTP endpoints when using spring-cloud-starter-function-web
// POST /uppercase   → invokes uppercase function
// POST /greet       → invokes greet function
// GET  /hello       → invokes hello supplier

// Example requests:
// curl -X POST localhost:8080/uppercase -d "hello" -H "Content-Type: text/plain"
// curl -X POST localhost:8080/greet -d '{"name":"John"}' -H "Content-Type: application/json"
// curl localhost:8080/hello
```

## AWS Lambda

### Handler Configuration
```yaml
# AWS Lambda handler
spring:
  cloud:
    function:
      definition: processEvent
```

### Lambda Handler Class
```java
public class LambdaHandler extends FunctionInvoker<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
}

@Bean
public Function<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> processEvent() {
    return request -> {
        String body = request.getBody();
        // Process request
        return APIGatewayProxyResponseEvent.builder()
            .statusCode(200)
            .body("Processed: " + body)
            .build();
    };
}
```

### SAM Template
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: org.springframework.cloud.function.adapter.aws.FunctionInvoker::handleRequest
      Runtime: java17
      CodeUri: target/my-function.jar
      MemorySize: 512
      Timeout: 30
      Environment:
        Variables:
          SPRING_CLOUD_FUNCTION_DEFINITION: processEvent
      Events:
        Api:
          Type: Api
          Properties:
            Path: /process
            Method: POST
```

## Azure Functions

### Host Configuration
```java
public class AzureHandler extends FunctionInvoker<HttpRequestMessage<String>, HttpResponseMessage> {
}

@FunctionName("process")
public HttpResponseMessage run(
        @HttpTrigger(
            name = "req",
            methods = {HttpMethod.POST},
            authLevel = AuthorizationLevel.ANONYMOUS
        ) HttpRequestMessage<String> request,
        ExecutionContext context) {

    return handleRequest(request, context);
}
```

## GCP Cloud Functions

```java
public class GcpHandler extends FunctionInvoker<String, String> {
}

// Deployment
// gcloud functions deploy myFunction \
//   --entry-point org.springframework.cloud.function.adapter.gcp.FunctionInvoker \
//   --runtime java17 \
//   --trigger-http \
//   --memory 512MB
```

## Message-Driven Functions

### With Spring Cloud Stream
```java
@Bean
public Function<Flux<Order>, Flux<OrderResult>> processOrders() {
    return orders -> orders
        .map(order -> {
            // Process order
            return new OrderResult(order.getId(), "PROCESSED");
        });
}
```

```yaml
spring:
  cloud:
    stream:
      bindings:
        processOrders-in-0:
          destination: orders
        processOrders-out-0:
          destination: order-results
    function:
      definition: processOrders
```

## Function Catalog

```java
@Autowired
private FunctionCatalog functionCatalog;

public void invokeDynamically(String functionName, Object input) {
    Function<Object, Object> function = functionCatalog.lookup(functionName);
    if (function != null) {
        Object result = function.apply(input);
        log.info("Result: {}", result);
    }
}
```

## Error Handling

```java
@Bean
public Function<Order, OrderResult> processOrder() {
    return order -> {
        try {
            validateOrder(order);
            return new OrderResult(order.getId(), "SUCCESS");
        } catch (ValidationException e) {
            return new OrderResult(order.getId(), "VALIDATION_ERROR: " + e.getMessage());
        } catch (Exception e) {
            log.error("Error processing order", e);
            throw new RuntimeException("Processing failed", e);
        }
    };
}

// Global error handler
@Bean
public Consumer<ErrorMessage> errorHandler() {
    return error -> {
        log.error("Function error: {}", error.getPayload().getMessage());
        alertService.sendAlert(error);
    };
}
```

## Testing

```java
@SpringBootTest
class FunctionTests {

    @Autowired
    private Function<String, String> uppercase;

    @Autowired
    private FunctionCatalog catalog;

    @Test
    void shouldUppercase() {
        String result = uppercase.apply("hello");
        assertThat(result).isEqualTo("HELLO");
    }

    @Test
    void shouldLookupFunction() {
        Function<String, String> fn = catalog.lookup("uppercase");
        assertThat(fn.apply("test")).isEqualTo("TEST");
    }

    @Test
    void shouldComposeFunction() {
        Function<String, String> composed = catalog.lookup("validate|sanitize|process");
        String result = composed.apply("  HELLO  ");
        assertThat(result).isEqualTo("Processed: hello");
    }
}

// Integration test with WebTestClient
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FunctionHttpTests {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void shouldInvokeViaHttp() {
        webTestClient.post()
            .uri("/uppercase")
            .contentType(MediaType.TEXT_PLAIN)
            .bodyValue("hello")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .isEqualTo("HELLO");
    }
}
```

## Native Image (GraalVM)

```xml
<dependency>
    <groupId>org.springframework.experimental</groupId>
    <artifactId>spring-native</artifactId>
</dependency>

<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <image>
            <builder>paketobuildpacks/builder:tiny</builder>
            <env>
                <BP_NATIVE_IMAGE>true</BP_NATIVE_IMAGE>
            </env>
        </image>
    </configuration>
</plugin>
```

## Best Practices

| Do | Don't |
|----|-------|
| Keep functions focused/small | Create monolithic functions |
| Use reactive types for streaming | Block on large datasets |
| Handle errors gracefully | Let exceptions propagate unhandled |
| Test functions in isolation | Skip unit tests |
| Configure appropriate timeouts | Ignore cold start impact |

## Production Checklist

- [ ] Function definition configured
- [ ] Error handling implemented
- [ ] Timeouts appropriate for platform
- [ ] Memory limits set
- [ ] Cold start optimized
- [ ] Logging configured
- [ ] Monitoring/tracing enabled
- [ ] Secrets management (not env vars)
- [ ] Native image if needed
- [ ] CI/CD pipeline for deployment

## When NOT to Use This Skill

- **REST APIs** - Use standard Spring MVC controllers
- **Complex workflows** - Use AWS Step Functions, Temporal
- **Long-running processes** - Not suitable for functions
- **Traditional deployment** - May not provide benefits

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Large function payload | Cold start, timeout | Keep functions small |
| State in function | Functions should be stateless | Use external storage |
| Hardcoded cloud config | Not portable | Use Spring Cloud abstractions |
| No timeout handling | Lambda timeout = error | Handle gracefully |
| Secrets in env vars | Security risk | Use secrets manager |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Function not found | Check function name | Verify spring.cloud.function.definition |
| Cold start slow | Check dependencies | Reduce classpath, use native |
| Timeout | Check execution time | Optimize or increase timeout |
| Memory error | Check Lambda config | Increase memory allocation |
| Routing not working | Check function catalog | Verify function names |

## Reference Documentation
- [Spring Cloud Function Reference](https://docs.spring.io/spring-cloud-function/reference/)
