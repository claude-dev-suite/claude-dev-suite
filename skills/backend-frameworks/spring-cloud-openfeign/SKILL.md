---
name: spring-cloud-openfeign
description: |
  Declarative HTTP client for microservices communication with Spring Cloud OpenFeign.
  Covers @FeignClient, error handling, interceptors, and circuit breaker integration.

  USE WHEN: user mentions "feign", "openfeign", "@FeignClient", "declarative HTTP client",
  "service-to-service communication", "microservices client"

  DO NOT USE FOR: external APIs - consider WebClient or RestClient,
  simple HTTP calls - use RestClient
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud OpenFeign - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-openfeign` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<!-- For load balancing -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

## Enable Feign Clients

```java
@SpringBootApplication
@EnableFeignClients
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}

// Or scan specific packages
@EnableFeignClients(basePackages = "com.example.clients")
```

## Basic Feign Client

```java
@FeignClient(name = "user-service")
public interface UserClient {

    @GetMapping("/api/users/{id}")
    UserResponse getUserById(@PathVariable("id") Long id);

    @GetMapping("/api/users")
    List<UserResponse> getAllUsers();

    @GetMapping("/api/users")
    List<UserResponse> getUsersByStatus(@RequestParam("status") String status);

    @PostMapping("/api/users")
    UserResponse createUser(@RequestBody CreateUserRequest request);

    @PutMapping("/api/users/{id}")
    UserResponse updateUser(@PathVariable("id") Long id, @RequestBody UpdateUserRequest request);

    @DeleteMapping("/api/users/{id}")
    void deleteUser(@PathVariable("id") Long id);
}
```

## Feign with URL (No Service Discovery)

```java
@FeignClient(name = "external-api", url = "${external.api.url}")
public interface ExternalApiClient {

    @GetMapping("/data")
    DataResponse getData(@RequestHeader("Authorization") String token);
}
```

## Configuration

### application.yml
```yaml
spring:
  cloud:
    openfeign:
      client:
        config:
          default:  # Apply to all clients
            connect-timeout: 5000
            read-timeout: 10000
            logger-level: BASIC

          user-service:  # Specific client
            connect-timeout: 3000
            read-timeout: 5000
            logger-level: FULL

      circuitbreaker:
        enabled: true

      micrometer:
        enabled: true

# Logging
logging:
  level:
    com.example.clients: DEBUG
```

### Java Configuration
```java
@Configuration
public class FeignConfig {

    @Bean
    public Logger.Level feignLoggerLevel() {
        return Logger.Level.FULL;  // NONE, BASIC, HEADERS, FULL
    }

    @Bean
    public ErrorDecoder errorDecoder() {
        return new CustomErrorDecoder();
    }

    @Bean
    public Retryer retryer() {
        return new Retryer.Default(100, 1000, 3);
    }

    @Bean
    public Request.Options options() {
        return new Request.Options(5, TimeUnit.SECONDS, 10, TimeUnit.SECONDS, true);
    }
}

// Apply to specific client
@FeignClient(name = "user-service", configuration = FeignConfig.class)
public interface UserClient { }
```

## Request/Response Interceptors

### Request Interceptor
```java
@Component
public class AuthRequestInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        // Add auth header to all requests
        String token = SecurityContextHolder.getContext()
            .getAuthentication().getCredentials().toString();
        template.header("Authorization", "Bearer " + token);

        // Add correlation ID
        template.header("X-Correlation-Id", MDC.get("correlationId"));
    }
}
```

### Client-Specific Interceptor
```java
@FeignClient(
    name = "payment-service",
    configuration = PaymentClientConfig.class
)
public interface PaymentClient { }

@Configuration
public class PaymentClientConfig {

    @Bean
    public RequestInterceptor paymentAuthInterceptor() {
        return template -> {
            template.header("X-Api-Key", apiKey);
        };
    }
}
```

## Error Handling

### Custom Error Decoder
```java
public class CustomErrorDecoder implements ErrorDecoder {

    private final ErrorDecoder defaultDecoder = new Default();

    @Override
    public Exception decode(String methodKey, Response response) {
        HttpStatus status = HttpStatus.valueOf(response.status());

        switch (status) {
            case NOT_FOUND:
                return new ResourceNotFoundException(
                    "Resource not found: " + methodKey);
            case BAD_REQUEST:
                return new BadRequestException(
                    "Bad request: " + getBody(response));
            case UNAUTHORIZED:
                return new UnauthorizedException("Unauthorized");
            case SERVICE_UNAVAILABLE:
                return new ServiceUnavailableException(
                    "Service unavailable");
            default:
                return defaultDecoder.decode(methodKey, response);
        }
    }

    private String getBody(Response response) {
        try {
            return Util.toString(response.body().asReader(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return "";
        }
    }
}
```

### Global Exception Handler
```java
@ControllerAdvice
public class FeignExceptionHandler {

    @ExceptionHandler(FeignException.class)
    public ResponseEntity<ErrorResponse> handleFeignException(FeignException e) {
        HttpStatus status = HttpStatus.valueOf(e.status());

        return ResponseEntity
            .status(status)
            .body(new ErrorResponse(
                status.value(),
                "Downstream service error",
                e.getMessage()
            ));
    }
}
```

## Fallback

### With Fallback Class
```java
@FeignClient(
    name = "user-service",
    fallback = UserClientFallback.class
)
public interface UserClient {
    @GetMapping("/api/users/{id}")
    UserResponse getUserById(@PathVariable Long id);
}

@Component
public class UserClientFallback implements UserClient {

    @Override
    public UserResponse getUserById(Long id) {
        return UserResponse.builder()
            .id(id)
            .name("Unknown User")
            .status("FALLBACK")
            .build();
    }
}
```

### With FallbackFactory (Access to Exception)
```java
@FeignClient(
    name = "user-service",
    fallbackFactory = UserClientFallbackFactory.class
)
public interface UserClient {
    @GetMapping("/api/users/{id}")
    UserResponse getUserById(@PathVariable Long id);
}

@Component
public class UserClientFallbackFactory implements FallbackFactory<UserClient> {

    @Override
    public UserClient create(Throwable cause) {
        return new UserClient() {
            @Override
            public UserResponse getUserById(Long id) {
                log.error("Fallback triggered for user {}: {}", id, cause.getMessage());

                if (cause instanceof FeignException.ServiceUnavailable) {
                    return UserResponse.cached(id);  // Return cached version
                }

                return UserResponse.unknown(id);
            }
        };
    }
}
```

## Circuit Breaker Integration

### With Resilience4j
```yaml
spring:
  cloud:
    openfeign:
      circuitbreaker:
        enabled: true

resilience4j:
  circuitbreaker:
    configs:
      default:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 10000
        permittedNumberOfCallsInHalfOpenState: 3
    instances:
      user-service:
        baseConfig: default
        failureRateThreshold: 30

  timelimiter:
    configs:
      default:
        timeoutDuration: 5s
```

## Headers and Parameters

```java
@FeignClient(name = "api-service")
public interface ApiClient {

    // Path variable
    @GetMapping("/items/{id}")
    Item getItem(@PathVariable("id") String id);

    // Query parameters
    @GetMapping("/items")
    List<Item> searchItems(
        @RequestParam("q") String query,
        @RequestParam(value = "page", defaultValue = "0") int page,
        @RequestParam(value = "size", defaultValue = "20") int size);

    // Headers
    @GetMapping("/secure/data")
    Data getData(
        @RequestHeader("Authorization") String auth,
        @RequestHeader("X-Request-Id") String requestId);

    // Request body
    @PostMapping("/items")
    Item createItem(@RequestBody CreateItemRequest request);

    // Form data
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    void uploadFile(@RequestPart("file") MultipartFile file);

    // Multiple parts
    @PostMapping(value = "/submit", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    void submitForm(@RequestBody Map<String, ?> formData);
}
```

## Query Map

```java
@FeignClient(name = "search-service")
public interface SearchClient {

    @GetMapping("/search")
    SearchResult search(@SpringQueryMap SearchCriteria criteria);
}

@Data
public class SearchCriteria {
    private String query;
    private Integer page;
    private Integer size;
    private String sortBy;
    private String sortOrder;
}

// Usage
SearchCriteria criteria = new SearchCriteria();
criteria.setQuery("test");
criteria.setPage(0);
criteria.setSize(20);
searchClient.search(criteria);
// Generates: /search?query=test&page=0&size=20
```

## Testing

### Mock with WireMock
```java
@SpringBootTest
@AutoConfigureWireMock(port = 0)
class UserClientTest {

    @Autowired
    private UserClient userClient;

    @Test
    void shouldGetUser() {
        stubFor(get(urlPathEqualTo("/api/users/1"))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("""
                    {"id": 1, "name": "John", "email": "john@example.com"}
                """)));

        UserResponse user = userClient.getUserById(1L);

        assertThat(user.getName()).isEqualTo("John");
    }

    @Test
    void shouldHandleError() {
        stubFor(get(urlPathEqualTo("/api/users/999"))
            .willReturn(aResponse().withStatus(404)));

        assertThatThrownBy(() -> userClient.getUserById(999L))
            .isInstanceOf(ResourceNotFoundException.class);
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use service discovery names | Hardcode URLs |
| Configure timeouts | Use infinite timeouts |
| Implement fallbacks | Let failures cascade |
| Use error decoders | Ignore error responses |
| Add request interceptors | Duplicate auth logic |

## Production Checklist

- [ ] Timeouts configured
- [ ] Circuit breaker enabled
- [ ] Fallbacks implemented
- [ ] Error decoder configured
- [ ] Logging level appropriate
- [ ] Auth interceptor added
- [ ] Retry policy set
- [ ] Metrics enabled
- [ ] Load balancer configured
- [ ] Connection pool tuned

## When NOT to Use This Skill

- **External APIs** - Consider WebClient, RestClient
- **Reactive** - Use WebClient instead
- **Simple calls** - RestClient may be simpler
- **File uploads** - May need custom config

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No timeout configured | Hanging requests | Set connectTimeout, readTimeout |
| Missing error decoder | Swallowed errors | Implement ErrorDecoder |
| No circuit breaker | Cascading failures | Integrate Resilience4j |
| Blocking thread | Thread exhaustion | Use async or circuit breaker |
| Hardcoded URLs | Not using discovery | Use service name |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Service not found | Check discovery | Verify Eureka registration |
| Timeout | Check timeout config | Increase or fix service |
| 404 on call | Check path | Verify @RequestMapping path |
| Serialization error | Check content type | Configure Jackson converter |
| Auth failing | Check interceptor | Add RequestInterceptor |

## Reference Documentation
- [Spring Cloud OpenFeign Reference](https://docs.spring.io/spring-cloud-openfeign/reference/)
