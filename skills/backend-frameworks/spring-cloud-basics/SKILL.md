---
name: spring-cloud-basics
description: |
  Spring Cloud patterns for microservices in Spring Boot 3.x.
  Covers Service Discovery, Config Server, API Gateway, Circuit Breaker,
  Load Balancing, and Distributed Tracing.

  USE WHEN: user mentions "spring cloud", "microservices architecture",
  "service discovery", "config server", "cloud native Spring"

  DO NOT USE FOR: specific components - use dedicated skills like
  `spring-cloud-gateway`, `spring-cloud-eureka`, `spring-cloud-config`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Basics

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│                    (Spring Cloud Gateway)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     Service Discovery                            │
│                    (Eureka / Consul)                             │
└──────────┬─────────────────┬─────────────────┬──────────────────┘
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  Service A  │   │  Service B  │   │  Service C  │
    │  (3 inst.)  │   │  (2 inst.)  │   │  (1 inst.)  │
    └─────────────┘   └─────────────┘   └─────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             ▼
                    ┌────────────────┐
                    │  Config Server │
                    └────────────────┘
```

---

## Quick Start - Eureka

### Server

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
server:
  port: 8761
eureka:
  client:
    register-with-eureka: false
    fetch-registry: false
```

### Client

```yaml
spring:
  application:
    name: product-service
eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka
  instance:
    prefer-ip-address: true
```

> **Full Reference**: See [service-discovery.md](service-discovery.md) for Eureka HA and Config Server.

---

## Quick Start - API Gateway

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: product-service
          uri: lb://product-service
          predicates:
            - Path=/api/products/**
          filters:
            - StripPrefix=0
```

> **Full Reference**: See [gateway.md](gateway.md) for custom filters and programmatic routes.

---

## Quick Start - Circuit Breaker

```java
@Service
public class ProductClient {

    @CircuitBreaker(name = "productService", fallbackMethod = "fallback")
    @Retry(name = "productService")
    public List<Product> getProducts() {
        return restClient.get()
            .uri("http://product-service/api/products")
            .retrieve()
            .body(new ParameterizedTypeReference<>() {});
    }

    private List<Product> fallback(Exception e) {
        return List.of();
    }
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      productService:
        sliding-window-size: 10
        failure-rate-threshold: 50
        wait-duration-in-open-state: 10s
```

> **Full Reference**: See [resilience.md](resilience.md) for Retry, Bulkhead, Rate Limiter, Feign.

---

## Service Communication Pattern

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final ProductClient productClient;
    private final InventoryClient inventoryClient;
    private final PaymentClient paymentClient;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        // 1. Verifica prodotti
        List<Product> products = request.items().stream()
            .map(item -> productClient.getProductById(item.productId()))
            .toList();

        // 2. Verifica inventario
        boolean available = inventoryClient.checkAvailability(request.items());
        if (!available) {
            throw new InsufficientInventoryException("Items not available");
        }

        // 3. Crea ordine
        Order order = Order.create(request.customerId(), products, request.items());
        order = orderRepository.save(order);

        // 4. Riserva inventario
        inventoryClient.reserveItems(order.getId(), request.items());

        // 5. Processa pagamento (con rollback)
        try {
            PaymentResult payment = paymentClient.processPayment(
                new PaymentRequest(order.getId(), order.getTotal())
            );
            order.setPaymentId(payment.paymentId());
            order.setStatus(OrderStatus.PAID);
        } catch (PaymentFailedException e) {
            inventoryClient.releaseReservation(order.getId());
            order.setStatus(OrderStatus.PAYMENT_FAILED);
            throw e;
        }

        return orderRepository.save(order);
    }
}
```

---

## Load Balancer

```java
@Configuration
public class LoadBalancerConfig {

    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}

// Usage: use service name instead of host
restClient.get()
    .uri("http://product-service/api/products")
    .retrieve()
    .body(new ParameterizedTypeReference<>() {});
```

---

## Distributed Tracing

```yaml
management:
  tracing:
    sampling:
      probability: 1.0
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans

logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use Service Discovery for all services | Hardcode service URLs |
| Implement Circuit Breaker with fallback | Ignore failures |
| Centralize config with Config Server | Duplicate configuration |
| Add distributed tracing | Miss observability |
| Use API Gateway as single entry point | Expose services directly |

---

## When NOT to Use This Skill

- **Single service** - Spring Cloud adds unnecessary complexity
- **Kubernetes native** - Use K8s service discovery, ConfigMaps
- **Simple deployments** - Overhead not justified
- **Specific components** - Use dedicated skills for deep dives

---

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| `No instances available` | Service not registered | Verify Eureka registration |
| `Connection refused` | Service down | Implement Circuit Breaker |
| `Timeout` | Service slow | Configure appropriate timeouts |
| `Config not loading` | Config server unreachable | Use `fail-fast: false` or fallback |
| Load balancing not working | Missing @LoadBalanced | Annotate RestClient builder |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Hardcoding service URLs | No discovery benefit | Use service names |
| No circuit breaker | Cascading failures | Add Resilience4j |
| Missing retry | Transient failures | Configure retry with backoff |
| No config refresh | Changes need redeploy | Use @RefreshScope |
| Synchronous everywhere | Tight coupling | Use async where appropriate |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Service not found | Check Eureka dashboard | Verify registration |
| Config not loading | Check config server logs | Verify path, profile |
| Circuit always open | Check failure threshold | Tune thresholds |
| Gateway routing fails | Check predicates | Verify route config |
| Load balancing not working | Check @LoadBalanced | Add annotation |

---

## Reference Files

| File | Content |
|------|---------|
| [service-discovery.md](service-discovery.md) | Eureka Server/Client, Config Server |
| [gateway.md](gateway.md) | API Gateway, Filters, Routes |
| [resilience.md](resilience.md) | Circuit Breaker, Retry, Feign, Testing |

---

## External Documentation

- [Spring Cloud](https://spring.io/projects/spring-cloud)
- [Spring Cloud Gateway](https://docs.spring.io/spring-cloud-gateway/reference/)
- [Resilience4j](https://resilience4j.readme.io/)
