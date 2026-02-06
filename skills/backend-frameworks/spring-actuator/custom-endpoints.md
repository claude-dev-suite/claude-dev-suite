# Custom Endpoints & Security

## Custom Endpoints

```java
@Component
@Endpoint(id = "custom")
public class CustomEndpoint {

    private final Map<String, Feature> features = new ConcurrentHashMap<>();

    // GET /actuator/custom
    @ReadOperation
    public Map<String, Feature> getAll() {
        return Collections.unmodifiableMap(features);
    }

    // GET /actuator/custom/{name}
    @ReadOperation
    public Feature getFeature(@Selector String name) {
        return features.get(name);
    }

    // POST /actuator/custom
    @WriteOperation
    public void addFeature(@Selector String name, boolean enabled, String description) {
        features.put(name, new Feature(name, enabled, description));
    }

    // DELETE /actuator/custom/{name}
    @DeleteOperation
    public void deleteFeature(@Selector String name) {
        features.remove(name);
    }

    public record Feature(String name, boolean enabled, String description) {}
}

// Web-only endpoint
@Component
@WebEndpoint(id = "web-custom")
public class WebCustomEndpoint {

    @ReadOperation
    public WebEndpointResponse<Map<String, Object>> getData() {
        Map<String, Object> data = Map.of(
            "timestamp", Instant.now(),
            "data", "web-specific data"
        );
        return new WebEndpointResponse<>(data, 200);
    }
}

// Controller endpoint (full Spring MVC)
@Component
@RestControllerEndpoint(id = "controller-custom")
public class ControllerCustomEndpoint {

    @GetMapping("/")
    public ResponseEntity<String> index() {
        return ResponseEntity.ok("Controller Endpoint");
    }

    @GetMapping("/{id}")
    public ResponseEntity<String> getById(@PathVariable String id) {
        return ResponseEntity.ok("Item: " + id);
    }

    @PostMapping("/")
    public ResponseEntity<String> create(@RequestBody String body) {
        return ResponseEntity.status(HttpStatus.CREATED).body("Created");
    }
}
```

---

## Info Endpoint

```yaml
management:
  info:
    env:
      enabled: true
    build:
      enabled: true
    git:
      enabled: true
      mode: full
    java:
      enabled: true
    os:
      enabled: true

info:
  app:
    name: @project.name@
    description: @project.description@
    version: @project.version@
  contact:
    team: backend
    email: team@example.com
```

```java
@Component
public class CustomInfoContributor implements InfoContributor {

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("custom", Map.of(
            "startTime", Instant.now(),
            "features", getEnabledFeatures()
        ));

        builder.withDetail("runtime", Map.of(
            "processors", Runtime.getRuntime().availableProcessors(),
            "maxMemory", Runtime.getRuntime().maxMemory() / 1024 / 1024 + "MB"
        ));
    }

    private List<String> getEnabledFeatures() {
        return List.of("feature-a", "feature-b");
    }
}
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
                // Public endpoints
                .requestMatchers(EndpointRequest.to("health", "info")).permitAll()
                // Prometheus per scraping
                .requestMatchers(EndpointRequest.to("prometheus")).permitAll()
                // Admin only
                .requestMatchers(EndpointRequest.to("env", "beans", "configprops"))
                    .hasRole("ADMIN")
                // Authenticated per il resto
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults())
            .build();
    }
}
```

```yaml
# Separare porta management
management:
  server:
    port: 9090  # Porta separata per actuator
    address: 127.0.0.1  # Solo localhost
    ssl:
      enabled: true
```

---

## Logging Runtime Configuration

```java
// GET /actuator/loggers
// GET /actuator/loggers/com.myapp
// POST /actuator/loggers/com.myapp {"configuredLevel": "DEBUG"}

@RestController
@RequestMapping("/admin/logging")
@PreAuthorize("hasRole('ADMIN')")
public class LoggingController {

    private final LoggersEndpoint loggersEndpoint;

    @PostMapping("/level")
    public ResponseEntity<Void> setLogLevel(
            @RequestParam String logger,
            @RequestParam String level) {

        loggersEndpoint.configureLogLevel(logger, LogLevel.valueOf(level.toUpperCase()));
        return ResponseEntity.ok().build();
    }

    @GetMapping("/level/{logger}")
    public ResponseEntity<LoggersEndpoint.LoggerLevels> getLogLevel(
            @PathVariable String logger) {
        return ResponseEntity.ok(loggersEndpoint.loggerLevels(logger));
    }
}
```

---

## Testing

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ActuatorTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void healthEndpoint_shouldReturnUp() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
            "/actuator/health",
            Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("status")).isEqualTo("UP");
    }

    @Test
    void metricsEndpoint_shouldContainJvmMetrics() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
            "/actuator/metrics/jvm.memory.used",
            Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsKey("measurements");
    }

    @Test
    void customHealthIndicator_shouldBeIncluded() {
        ResponseEntity<Map> response = restTemplate.getForEntity(
            "/actuator/health",
            Map.class
        );

        Map<String, Object> components = (Map) response.getBody().get("components");
        assertThat(components).containsKey("externalService");
    }
}

// Test metrics
@SpringBootTest
class MetricsTest {

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private OrderService orderService;

    @Test
    void orderCreation_shouldIncrementCounter() {
        double before = meterRegistry.counter("orders.created").count();

        orderService.createOrder(new OrderRequest());

        double after = meterRegistry.counter("orders.created").count();
        assertThat(after).isEqualTo(before + 1);
    }
}
```
