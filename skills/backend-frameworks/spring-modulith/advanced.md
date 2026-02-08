# Spring Modulith Advanced Patterns

## Event Externalization (Outbox Pattern)

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-events-api</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-events-jpa</artifactId>
</dependency>
```

```java
// Externalizable event (transactional outbox)
@Externalized("orders.created")  // Topic Kafka/RabbitMQ
public record OrderCreatedEvent(
    Long orderId,
    Long customerId,
    Money total,
    Instant createdAt
) {}

// Configuration for Kafka
@Configuration
public class EventExternalizationConfig {

    @Bean
    EventExternalizationConfiguration eventExternalizationConfiguration() {
        return EventExternalizationConfiguration.externalizing()
            .select(EventExternalizationConfiguration
                .annotatedAsExternalized())
            .mapping(OrderCreatedEvent.class, event ->
                // Custom routing key
                RoutingTarget.forTarget("orders")
                    .withKey(event.orderId().toString()))
            .build();
    }
}
```

```java
// Incomplete event publication (for retry)
@Component
@RequiredArgsConstructor
@Slf4j
public class EventPublicationRetry {

    private final IncompleteEventPublications publications;

    @Scheduled(fixedDelay = 60000)
    public void retryFailedPublications() {
        publications.resubmitIncompletePublications(
            event -> Duration.between(event.getPublicationDate(), Instant.now())
                .compareTo(Duration.ofMinutes(10)) > 0
        );
    }
}
```

---

## Module API Exposure Control

```java
// Expose only specific interfaces
// order/package-info.java
@ApplicationModule(
    type = Type.OPEN,  // Everyone can access public types
    displayName = "Order Management"
)
package com.example.ecommerce.order;

// Or expose explicitly
@NamedInterface("OrderAPI")
package com.example.ecommerce.order.api;

// order/api/OrderFacade.java (exposed interface)
public interface OrderFacade {
    OrderDto createOrder(CreateOrderRequest request);
    Optional<OrderDto> findById(Long id);
}

// order/internal/OrderFacadeImpl.java
@Service
class OrderFacadeImpl implements OrderFacade {
    // Implementation...
}
```

```java
// Named interfaces for granular control
@ApplicationModule(
    allowedDependencies = {
        "payment::PaymentAPI",      // Only the PaymentAPI interface
        "inventory"                  // The entire inventory module
    }
)
package com.example.ecommerce.order;
```

---

## Module Testing

```java
@ApplicationModuleTest
class OrderModuleTests {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PublishedEvents events;

    @Test
    void creatingOrderPublishesEvent() {
        CreateOrderRequest request = new CreateOrderRequest(
            1L,
            List.of(new OrderItemRequest(1L, 2))
        );

        Order order = orderService.createOrder(request);

        assertThat(order.getId()).isNotNull();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PENDING);

        // Verify published events
        assertThat(events.ofType(OrderCreatedEvent.class))
            .hasSize(1)
            .element(0)
            .extracting(OrderCreatedEvent::orderId)
            .isEqualTo(order.getId());
    }
}

// Module isolation test
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
class OrderModuleIsolationTests {

    @MockBean
    private PaymentService paymentService; // Mock dependencies

    @Autowired
    private OrderService orderService;

    @Test
    void orderCreation_withMockedPayment() {
        // Test with mock
    }
}
```

```java
// Complete scenario tests (saga)
@ApplicationModuleTest
class OrderPaymentScenarioTests {

    @Autowired
    private Scenario scenario;

    @Test
    void completeOrderFlow() {
        var orderId = 1L;
        var customerId = 100L;

        scenario.publish(new OrderCreatedEvent(orderId, Money.of(150)))
            .andWaitForEventOfType(PaymentInitiatedEvent.class)
            .matching(e -> e.orderId().equals(orderId))
            .toArriveAndVerify((event, result) -> {
                assertThat(event.amount()).isEqualTo(Money.of(150));
            });

        scenario.publish(new PaymentConfirmedEvent(orderId, "PAY-123"))
            .andWaitForEventOfType(OrderConfirmedEvent.class)
            .matching(e -> e.orderId().equals(orderId))
            .toArrive();
    }

    @Test
    void orderCancelledOnPaymentFailure() {
        var orderId = 2L;

        scenario.publish(new PaymentFailedEvent(orderId, "Insufficient funds"))
            .andWaitForEventOfType(OrderCancelledEvent.class)
            .matching(e -> e.orderId().equals(orderId))
            .toArriveAndVerify((event, result) -> {
                assertThat(event.reason()).contains("payment");
            });
    }
}
```

---

## Architecture Verification

```java
@AnalyzeClasses(packages = "com.example.ecommerce")
class ModuleArchitectureTests {

    @Test
    void verifyModuleStructure() {
        ApplicationModules modules = ApplicationModules.of(EcommerceApplication.class);

        // Print module structure
        modules.forEach(System.out::println);

        // Verify no violations
        modules.verify();
    }

    @Test
    void verifyNoCircularDependencies() {
        ApplicationModules modules = ApplicationModules.of(EcommerceApplication.class);

        assertThat(modules.detectModuleCycles()).isEmpty();
    }

    @Test
    void generateDocumentation() throws IOException {
        ApplicationModules modules = ApplicationModules.of(EcommerceApplication.class);

        // Generate Asciidoc documentation
        new Documenter(modules)
            .writeModulesAsPlantUml()
            .writeIndividualModulesAsPlantUml()
            .writeModuleCanvases();
    }
}
```

```java
// Additional ArchUnit rules
@AnalyzeClasses(packages = "com.example.ecommerce")
class ArchitectureRulesTests {

    @ArchTest
    static final ArchRule internalPackagesShouldNotBeAccessedFromOutside =
        noClasses()
            .that().resideOutsideOfPackage("..order.internal..")
            .should().accessClassesThat().resideInAPackage("..order.internal..");

    @ArchTest
    static final ArchRule eventsShouldBeRecords =
        classes()
            .that().haveSimpleNameEndingWith("Event")
            .should().beRecords();

    @ArchTest
    static final ArchRule servicesShouldBeTransactional =
        classes()
            .that().areAnnotatedWith(Service.class)
            .and().resideInAPackage("..order..")
            .should().beAnnotatedWith(Transactional.class);
}
```

---

## Observability

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-observability</artifactId>
</dependency>
```

```java
@Configuration
public class ModulithObservabilityConfig {

    @Bean
    ApplicationModuleListener applicationModuleListener(
            ApplicationModules modules,
            MeterRegistry meterRegistry) {
        return new ObservedApplicationModuleArrangement(modules, meterRegistry);
    }
}
```

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: modulith
  modulith:
    # Exposes module info
    enabled: true
```

---

## Moments & Testing Time

```java
@Service
@RequiredArgsConstructor
public class OrderExpirationService {

    private final OrderRepository orderRepository;
    private final Moments moments;  // Abstraction over time

    @Scheduled(cron = "0 0 * * * *")  // Every hour
    public void expireStalePendingOrders() {
        Instant threshold = moments.now().minus(Duration.ofHours(24));

        orderRepository.findByStatusAndCreatedAtBefore(OrderStatus.PENDING, threshold)
            .forEach(order -> {
                order.expire();
                orderRepository.save(order);
            });
    }
}

// Test with time control
@ApplicationModuleTest
class OrderExpirationTests {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderExpirationService expirationService;

    @Autowired
    private Scenario scenario;

    @Test
    void staleOrdersAreExpired() {
        Order order = orderService.createOrder(request);

        // Advance time by 25 hours
        scenario.shift(Duration.ofHours(25));

        expirationService.expireStalePendingOrders();

        assertThat(orderService.findById(order.getId()))
            .map(Order::getStatus)
            .hasValue(OrderStatus.EXPIRED);
    }
}
```

---

## Gradual Decomposition

```java
// Step 1: Start with modules in the monolith
@ApplicationModule
package com.example.ecommerce.order;

// Step 2: Externalize events
@Externalized("orders")
public record OrderCreatedEvent(...) {}

// Step 3: When ready, extract the module
// - Create new Spring Boot service
// - Consume events from Kafka
// - Keep API compatible

// Consumer in the new microservice
@Component
public class OrderEventConsumer {

    @KafkaListener(topics = "orders")
    public void onOrderEvent(OrderCreatedEvent event) {
        // Handle in separate service
    }
}
```
