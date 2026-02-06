# Resilience Patterns

## Circuit Breaker (Resilience4j)

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
```

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      productService:
        register-health-indicator: true
        sliding-window-size: 10
        minimum-number-of-calls: 5
        permitted-number-of-calls-in-half-open-state: 3
        wait-duration-in-open-state: 10s
        failure-rate-threshold: 50
        slow-call-rate-threshold: 100
        slow-call-duration-threshold: 2s
        automatic-transition-from-open-to-half-open-enabled: true

  retry:
    instances:
      productService:
        max-attempts: 3
        wait-duration: 500ms
        retry-exceptions:
          - java.io.IOException
          - java.net.SocketTimeoutException
        ignore-exceptions:
          - com.example.BusinessException

  timelimiter:
    instances:
      productService:
        timeout-duration: 3s
        cancel-running-future: true

  bulkhead:
    instances:
      productService:
        max-concurrent-calls: 20
        max-wait-duration: 500ms

  ratelimiter:
    instances:
      productService:
        limit-for-period: 10
        limit-refresh-period: 1s
        timeout-duration: 500ms
```

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ProductClient {

    private final RestClient restClient;

    @CircuitBreaker(name = "productService", fallbackMethod = "getProductsFallback")
    @Retry(name = "productService")
    @TimeLimiter(name = "productService")
    public CompletableFuture<List<Product>> getProducts() {
        return CompletableFuture.supplyAsync(() ->
            restClient.get()
                .uri("http://product-service/api/products")
                .retrieve()
                .body(new ParameterizedTypeReference<>() {})
        );
    }

    private CompletableFuture<List<Product>> getProductsFallback(Exception e) {
        log.warn("Fallback triggered: {}", e.getMessage());
        return CompletableFuture.completedFuture(List.of());
    }
}
```

---

## Circuit Breaker Events

```java
@Component
@Slf4j
public class CircuitBreakerEventListener {

    @Autowired
    public void configureEventConsumers(CircuitBreakerRegistry registry) {
        registry.getAllCircuitBreakers().forEach(cb -> {
            cb.getEventPublisher()
                .onStateTransition(event ->
                    log.info("CB {} transitioned from {} to {}",
                        event.getCircuitBreakerName(),
                        event.getStateTransition().getFromState(),
                        event.getStateTransition().getToState()))
                .onFailureRateExceeded(event ->
                    log.warn("CB {} failure rate exceeded: {}",
                        event.getCircuitBreakerName(),
                        event.getFailureRate()));
        });
    }
}
```

---

## Load Balancer

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

```java
@Configuration
public class LoadBalancerConfig {

    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}

@Service
@RequiredArgsConstructor
public class ProductService {

    private final RestClient.Builder restClientBuilder;

    public List<Product> getProducts() {
        return restClientBuilder.build()
            .get()
            .uri("http://product-service/api/products")  // Nome servizio
            .retrieve()
            .body(new ParameterizedTypeReference<>() {});
    }
}
```

---

## OpenFeign Client

```java
@SpringBootApplication
@EnableFeignClients
public class OrderServiceApplication {}

@FeignClient(
    name = "product-service",
    fallback = ProductClientFallback.class,
    configuration = ProductClientConfig.class
)
public interface ProductClient {

    @GetMapping("/api/products")
    List<Product> getAllProducts();

    @GetMapping("/api/products/{id}")
    Product getProductById(@PathVariable Long id);

    @PostMapping("/api/products")
    Product createProduct(@RequestBody CreateProductRequest request);
}

@Component
public class ProductClientFallback implements ProductClient {

    @Override
    public List<Product> getAllProducts() {
        return Collections.emptyList();
    }

    @Override
    public Product getProductById(Long id) {
        return new Product(id, "Unavailable", BigDecimal.ZERO);
    }

    @Override
    public Product createProduct(CreateProductRequest request) {
        throw new ServiceUnavailableException("Service unavailable");
    }
}

public class ProductClientConfig {

    @Bean
    public RequestInterceptor requestInterceptor() {
        return template -> {
            template.header("X-Service-Name", "order-service");
            template.header("X-Request-Id", UUID.randomUUID().toString());
        };
    }

    @Bean
    public ErrorDecoder errorDecoder() {
        return (methodKey, response) -> {
            if (response.status() == 404) {
                return new ProductNotFoundException("Product not found");
            }
            return new RuntimeException("Error calling service");
        };
    }
}
```

```yaml
spring:
  cloud:
    openfeign:
      client:
        config:
          default:
            connectTimeout: 5000
            readTimeout: 10000
            loggerLevel: BASIC
          product-service:
            connectTimeout: 3000
            readTimeout: 5000
      circuitbreaker:
        enabled: true
```

---

## Distributed Tracing

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0  # 100% in dev
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans

logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

---

## Testing with WireMock

```java
@SpringBootTest
@AutoConfigureWireMock(port = 0)
class OrderServiceIntegrationTest {

    @Autowired
    private OrderService orderService;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("product-service.url", () -> "http://localhost:${wiremock.server.port}");
    }

    @Test
    void createOrder_shouldSucceed() {
        stubFor(get(urlPathEqualTo("/api/products/1"))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("""
                    {"id": 1, "name": "Product A", "price": 99.99}
                    """)));

        stubFor(post(urlPathEqualTo("/api/inventory/check"))
            .willReturn(aResponse()
                .withStatus(200)
                .withBody("true")));

        stubFor(post(urlPathEqualTo("/api/payments"))
            .willReturn(aResponse()
                .withStatus(200)
                .withBody("""
                    {"paymentId": "PAY-123", "status": "SUCCESS"}
                    """)));

        Order order = orderService.createOrder(request);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAID);
    }

    @Test
    void createOrder_whenPaymentFails_shouldRollback() {
        // Setup stubs...
        stubFor(post(urlPathEqualTo("/api/payments"))
            .willReturn(aResponse().withStatus(402)));

        stubFor(post(urlPathEqualTo("/api/inventory/release"))
            .willReturn(aResponse().withStatus(200)));

        assertThatThrownBy(() -> orderService.createOrder(request))
            .isInstanceOf(PaymentFailedException.class);

        verify(postRequestedFor(urlPathEqualTo("/api/inventory/release")));
    }
}
```
