# Micrometer Tracing Advanced Patterns

## Custom ObservationConvention

```java
public class OrderObservationConvention implements Observation.GlobalObservationConvention<OrderContext> {

    @Override
    public KeyValues getLowCardinalityKeyValues(OrderContext context) {
        return KeyValues.of(
            KeyValue.of("order.type", context.getOrderType()),
            KeyValue.of("order.status", context.getStatus())
        );
    }

    @Override
    public KeyValues getHighCardinalityKeyValues(OrderContext context) {
        return KeyValues.of(
            KeyValue.of("order.id", context.getOrderId()),
            KeyValue.of("customer.id", context.getCustomerId())
        );
    }

    @Override
    public String getName() {
        return "order.processing";
    }

    @Override
    public boolean supportsContext(Observation.Context context) {
        return context instanceof OrderContext;
    }
}

public class OrderContext extends Observation.Context {
    private String orderId;
    private String orderType;
    private String status;
    private String customerId;
    // getters and setters
}

// Registration
@Configuration
public class ObservationConfig {

    @Bean
    public ObservationRegistry observationRegistry() {
        ObservationRegistry registry = ObservationRegistry.create();
        registry.observationConfig()
            .observationConvention(new OrderObservationConvention());
        return registry;
    }
}
```

---

## Baggage Propagation

```java
@Service
public class BaggageService {

    private final Tracer tracer;
    private final BaggageManager baggageManager;

    public void processWithBaggage() {
        // Set baggage
        try (BaggageInScope baggage = baggageManager.createBaggage("user.id", "123")) {
            // Baggage propagates to downstream services
            callDownstreamService();
        }
    }

    public String getUserIdFromBaggage() {
        Baggage baggage = baggageManager.getBaggage("user.id");
        return baggage != null ? baggage.get() : null;
    }
}
```

### Configuration

```yaml
management:
  tracing:
    baggage:
      remote-fields:
        - user-id
        - correlation-id
      correlation:
        fields:
          - user-id
```

---

## Logging Integration

### Logback with TraceId/SpanId

```xml
<!-- logback-spring.xml -->
<configuration>
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>
                %d{yyyy-MM-dd HH:mm:ss.SSS} %5p [%X{traceId:-},%X{spanId:-}] %c{1} : %m%n
            </pattern>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
    </root>
</configuration>
```

### JSON Logging

```xml
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>traceId</includeMdcKeyName>
        <includeMdcKeyName>spanId</includeMdcKeyName>
    </encoder>
</appender>
```

---

## Metrics Integration

```java
@Service
@RequiredArgsConstructor
public class MetricsService {

    private final MeterRegistry meterRegistry;
    private final ObservationRegistry observationRegistry;

    // Counter
    public void countOrder(String type) {
        meterRegistry.counter("orders.created", "type", type).increment();
    }

    // Timer
    public void timeOperation(String name, Runnable operation) {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            operation.run();
        } finally {
            sample.stop(Timer.builder(name)
                .tag("status", "success")
                .register(meterRegistry));
        }
    }

    // Gauge
    @PostConstruct
    public void registerGauges() {
        Gauge.builder("orders.pending", orderRepository::countPendingOrders)
            .register(meterRegistry);
    }
}
```

---

## Async Tracing

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Autowired
    private Tracer tracer;

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setTaskDecorator(new ContextPropagatingTaskDecorator());
        executor.initialize();
        return executor;
    }
}

// Or use ContextExecutorService
@Bean
public ExecutorService tracedExecutor(Tracer tracer) {
    return ContextExecutorService.wrap(
        Executors.newFixedThreadPool(10),
        () -> tracer.currentTraceContext().context()
    );
}
```

---

## Testing

```java
@SpringBootTest
class OrderServiceTracingTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private TestObservationRegistry observationRegistry;

    @BeforeEach
    void setup() {
        observationRegistry.clear();
    }

    @Test
    void shouldCreateObservationForOrderProcessing() {
        orderService.processOrder(new OrderRequest("1", "standard"));

        TestObservationRegistryAssert.assertThat(observationRegistry)
            .hasObservationWithNameEqualTo("order.process")
            .that()
            .hasLowCardinalityKeyValue("order.type", "standard")
            .hasBeenStarted()
            .hasBeenStopped();
    }
}
```

---

## Custom Span Naming

```java
@Component
public class CustomSpanNamingConvention implements ServerRequestObservationConvention {

    @Override
    public String getName() {
        return "http.server.requests";
    }

    @Override
    public String getContextualName(ServerRequestObservationContext context) {
        return context.getCarrier().getMethod() + " " +
               context.getPathPattern();  // e.g., "GET /api/users/{id}"
    }

    @Override
    public KeyValues getLowCardinalityKeyValues(ServerRequestObservationContext context) {
        return KeyValues.of(
            KeyValue.of("method", context.getCarrier().getMethod()),
            KeyValue.of("uri", context.getPathPattern()),
            KeyValue.of("status", String.valueOf(context.getResponse().getStatus()))
        );
    }
}
```
