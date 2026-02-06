# Health Indicators

## Custom Health Indicator

```java
@Component
public class ExternalServiceHealthIndicator implements HealthIndicator {

    private final RestClient restClient;

    public ExternalServiceHealthIndicator(RestClient restClient) {
        this.restClient = restClient;
    }

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
            } else {
                return Health.down()
                    .withDetail("service", "external-api")
                    .withDetail("status", response.getStatusCode().value())
                    .build();
            }
        } catch (Exception e) {
            return Health.down()
                .withDetail("service", "external-api")
                .withDetail("error", e.getMessage())
                .build();
        }
    }
}

// Reactive Health Indicator
@Component
public class ReactiveExternalServiceHealthIndicator implements ReactiveHealthIndicator {

    private final WebClient webClient;

    @Override
    public Mono<Health> health() {
        return webClient.get()
            .uri("/health")
            .retrieve()
            .toBodilessEntity()
            .map(response -> Health.up()
                .withDetail("status", response.getStatusCode().value())
                .build())
            .onErrorResume(e -> Mono.just(Health.down()
                .withDetail("error", e.getMessage())
                .build()));
    }
}
```

---

## Composite Health Indicator

```java
@Component
public class DatabaseClusterHealthIndicator extends AbstractHealthIndicator {

    private final List<DataSource> dataSources;

    @Override
    protected void doHealthCheck(Health.Builder builder) {
        Map<String, Object> details = new LinkedHashMap<>();
        int healthyNodes = 0;

        for (int i = 0; i < dataSources.size(); i++) {
            String nodeName = "node-" + i;
            try (Connection conn = dataSources.get(i).getConnection()) {
                if (conn.isValid(5)) {
                    details.put(nodeName, "UP");
                    healthyNodes++;
                } else {
                    details.put(nodeName, "DOWN - Invalid connection");
                }
            } catch (SQLException e) {
                details.put(nodeName, "DOWN - " + e.getMessage());
            }
        }

        details.put("healthyNodes", healthyNodes + "/" + dataSources.size());

        if (healthyNodes == dataSources.size()) {
            builder.up().withDetails(details);
        } else if (healthyNodes > 0) {
            builder.status("DEGRADED").withDetails(details);
        } else {
            builder.down().withDetails(details);
        }
    }
}
```

---

## Health Groups

```yaml
management:
  endpoint:
    health:
      group:
        liveness:
          include: livenessState
          show-details: always
        readiness:
          include: readinessState,db,redis
          show-details: always
        external:
          include: externalService,paymentGateway
          show-details: when_authorized
```

```java
// Accesso programmatico ai gruppi
@RestController
@RequestMapping("/custom-health")
public class CustomHealthController {

    private final HealthEndpoint healthEndpoint;

    @GetMapping("/database")
    public HealthComponent databaseHealth() {
        return healthEndpoint.healthForPath("db");
    }

    @GetMapping("/readiness")
    public HealthComponent readinessHealth() {
        return healthEndpoint.healthForPath("readiness");
    }
}
```

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
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3

          startupProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 30  # 30 * 5s = 150s max startup
```

---

## Availability State Management

```java
@Component
@RequiredArgsConstructor
public class ApplicationAvailabilityManager {

    private final ApplicationEventPublisher eventPublisher;

    // Set application to not ready (maintenance mode)
    public void setNotReady(String reason) {
        AvailabilityChangeEvent.publish(
            eventPublisher,
            this,
            ReadinessState.REFUSING_TRAFFIC
        );
    }

    // Set application back to ready
    public void setReady() {
        AvailabilityChangeEvent.publish(
            eventPublisher,
            this,
            ReadinessState.ACCEPTING_TRAFFIC
        );
    }

    // Graceful shutdown preparation
    @PreDestroy
    public void prepareForShutdown() {
        AvailabilityChangeEvent.publish(
            eventPublisher,
            this,
            ReadinessState.REFUSING_TRAFFIC
        );
    }
}

// Listener per availability changes
@Component
@Slf4j
public class AvailabilityListener {

    @EventListener
    public void onAvailabilityChange(AvailabilityChangeEvent<?> event) {
        log.info("Availability changed: {} -> {}",
            event.getState().getClass().getSimpleName(),
            event.getState());
    }
}
```
