---
name: spring-actuator
description: |
  Spring Boot Actuator for monitoring and management. Covers health indicators,
  metrics with Micrometer, Prometheus integration, custom endpoints,
  Kubernetes probes, and endpoint security.

  USE WHEN: user mentions "actuator", "health endpoint", "metrics", "prometheus",
  "micrometer", "kubernetes probes", "liveness", "readiness", "/health", "/metrics"

  DO NOT USE FOR: application profiling - use `spring-profiles` instead,
  distributed tracing - use `micrometer-tracing` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Boot Actuator

## Quick Start

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
  info:
    env:
      enabled: true

info:
  app:
    name: @project.name@
    version: @project.version@
```

---

## Endpoints Configuration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: "*"  # Dev: all
        # include: health,info,metrics,prometheus  # Prod
        exclude: shutdown,threaddump
      base-path: /actuator

  endpoint:
    health:
      enabled: true
      show-details: when_authorized
      show-components: when_authorized
    shutdown:
      enabled: false  # Dangerous in prod
```

### Available Endpoints

| Endpoint | Description | Default |
|----------|-------------|---------|
| `/health` | Health status | Enabled |
| `/info` | App info | Enabled |
| `/metrics` | Metrics | Enabled |
| `/prometheus` | Prometheus format | Enabled* |
| `/env` | Environment properties | Disabled |
| `/configprops` | Configuration properties | Disabled |
| `/beans` | All beans | Disabled |
| `/mappings` | Request mappings | Disabled |
| `/loggers` | Logger levels | Disabled |
| `/threaddump` | Thread dump | Disabled |
| `/shutdown` | Graceful shutdown | Disabled |

---

## Health Indicators

```yaml
management:
  health:
    db:
      enabled: true
    redis:
      enabled: true
    diskspace:
      enabled: true
      threshold: 10MB
```

### Custom Health Indicator

```java
@Component
public class ExternalServiceHealthIndicator implements HealthIndicator {

    private final RestClient restClient;

    @Override
    public Health health() {
        try {
            long startTime = System.currentTimeMillis();
            ResponseEntity<Void> response = restClient.get()
                .uri("/health")
                .retrieve()
                .toBodilessEntity();
            long responseTime = System.currentTimeMillis() - startTime;

            if (response.getStatusCode().is2xxSuccessful()) {
                return Health.up()
                    .withDetail("service", "external-api")
                    .withDetail("responseTime", responseTime + "ms")
                    .build();
            }
            return Health.down().build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}
```

> **Full Reference**: See [health.md](health.md) for composite indicators, health groups, and availability management.

---

## Kubernetes Probes

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
      group:
        liveness:
          include: livenessState
        readiness:
          include: readinessState,db,redis

  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
```

```yaml
# Kubernetes deployment
spec:
  containers:
    - name: app
      livenessProbe:
        httpGet:
          path: /actuator/health/liveness
          port: 8080
        initialDelaySeconds: 30
        periodSeconds: 10

      readinessProbe:
        httpGet:
          path: /actuator/health/readiness
          port: 8080
        initialDelaySeconds: 10
        periodSeconds: 5
```

> **Full Reference**: See [health.md](health.md) for availability state management and K8s probe configuration.

---

## Metrics with Micrometer

```yaml
management:
  metrics:
    enable:
      all: true
    tags:
      application: ${spring.application.name}
      environment: ${spring.profiles.active:default}
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

### Custom Metrics

```java
@Service
public class OrderService {

    private final MeterRegistry meterRegistry;
    private final Counter orderCounter;
    private final Timer orderProcessingTimer;

    public OrderService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.orderCounter = Counter.builder("orders.created")
            .description("Total orders created")
            .register(meterRegistry);
        this.orderProcessingTimer = Timer.builder("orders.processing.time")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(meterRegistry);
    }

    public Order createOrder(OrderRequest request) {
        return orderProcessingTimer.record(() -> {
            Order order = processOrder(request);
            orderCounter.increment();
            return order;
        });
    }
}
```

> **Full Reference**: See [metrics.md](metrics.md) for annotations, Prometheus config, and Grafana alerts.

---

## Prometheus Integration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: prometheus
  prometheus:
    metrics:
      export:
        enabled: true
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'spring-boot-app'
    metrics_path: '/actuator/prometheus'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8080']
```

---

## Security

```java
@Configuration
@EnableWebSecurity
public class ActuatorSecurityConfig {

    @Bean
    public SecurityFilterChain actuatorSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
            .securityMatcher(EndpointRequest.toAnyEndpoint())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(EndpointRequest.to("health", "info")).permitAll()
                .requestMatchers(EndpointRequest.to("prometheus")).permitAll()
                .requestMatchers(EndpointRequest.to("env", "beans")).hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults())
            .build();
    }
}
```

```yaml
# Separate management port
management:
  server:
    port: 9090
    address: 127.0.0.1
```

> **Full Reference**: See [custom-endpoints.md](custom-endpoints.md) for custom endpoints and testing.

---

## Best Practices

| Do | Don't |
|----|-------|
| Expose only necessary endpoints in prod | Expose all endpoints |
| Use health groups for K8s probes | Use single health endpoint |
| Configure metrics with consistent tags | Use high-cardinality tags |
| Implement custom health indicators | Rely only on built-in |
| Separate management port in production | Use same port as app |

---

## When NOT to Use This Skill

- **Application profiling** - Use `spring-profiles` for environment config
- **Distributed tracing** - Use `micrometer-tracing` for trace context
- **Log aggregation** - Use logging frameworks and ELK/Loki
- **APM tools** - Actuator complements Datadog, New Relic

---

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| Endpoints not exposed | Missing config | Add to `management.endpoints.web.exposure.include` |
| Health always UP | Indicators not configured | Verify dependencies in classpath |
| Metrics missing | Registry not configured | Add `micrometer-registry-prometheus` |
| Security bypass | Endpoints public | Configure security for actuator |
| Memory leak | High cardinality tags | Avoid userId, requestId as tags |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Exposing all endpoints in prod | Security risk | Limit to health, metrics, prometheus |
| High cardinality metric tags | Memory explosion | Use bounded tag values |
| No auth on sensitive endpoints | Information leak | Configure Spring Security |
| Ignoring health groups | Poor K8s integration | Use liveness/readiness groups |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Endpoints not exposed | Check config | Add to exposure.include |
| Health always DOWN | Check component | Fix failing indicator |
| Metrics missing | Check registry | Add Micrometer dependency |
| 401 on endpoints | Security blocking | Configure actuator security |
| Prometheus not scraping | Check path | Verify `/actuator/prometheus` |

---

## Production Checklist

- [ ] Health endpoints configured
- [ ] K8s probes (liveness, readiness) active
- [ ] Prometheus scraping configured
- [ ] Alert rules defined
- [ ] Security on sensitive endpoints
- [ ] Custom health indicators for external deps
- [ ] Business metrics implemented
- [ ] Grafana dashboard configured

---

## Reference Files

| File | Content |
|------|---------|
| [health.md](health.md) | Health Indicators, K8s Probes, Availability |
| [metrics.md](metrics.md) | Micrometer, Prometheus, Grafana Alerts |
| [custom-endpoints.md](custom-endpoints.md) | Custom Endpoints, Security, Testing |

---

## External Documentation

- [Spring Boot Actuator](https://docs.spring.io/spring-boot/reference/actuator/index.html)
- [Actuator Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Micrometer](https://micrometer.io/docs)
