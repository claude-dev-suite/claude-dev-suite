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
// Evento esternalizzabile (transactional outbox)
@Externalized("orders.created")  // Topic Kafka/RabbitMQ
public record OrderCreatedEvent(
    Long orderId,
    Long customerId,
    Money total,
    Instant createdAt
) {}

// Configuration per Kafka
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
// Incomplete event publication (per retry)
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
// Esponi solo interfacce specifiche
// order/package-info.java
@ApplicationModule(
    type = Type.OPEN,  // Tutti possono accedere ai tipi pubblici
    displayName = "Order Management"
)
package com.example.ecommerce.order;

// Oppure esponi esplicitamente
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
// Named interfaces per controllo granulare
@ApplicationModule(
    allowedDependencies = {
        "payment::PaymentAPI",      // Solo interfaccia PaymentAPI
        "inventory"                  // Tutto il modulo inventory
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

        // Verifica eventi pubblicati
        assertThat(events.ofType(OrderCreatedEvent.class))
            .hasSize(1)
            .element(0)
            .extracting(OrderCreatedEvent::orderId)
            .isEqualTo(order.getId());
    }
}

// Test isolamento modulo
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
class OrderModuleIsolationTests {

    @MockBean
    private PaymentService paymentService; // Mock dipendenze

    @Autowired
    private OrderService orderService;

    @Test
    void orderCreation_withMockedPayment() {
        // Test con mock
    }
}
```

```java
// Test scenario completi (saga)
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

        // Stampa struttura moduli
        modules.forEach(System.out::println);

        // Verifica nessuna violazione
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

        // Genera documentazione Asciidoc
        new Documenter(modules)
            .writeModulesAsPlantUml()
            .writeIndividualModulesAsPlantUml()
            .writeModuleCanvases();
    }
}
```

```java
// ArchUnit rules aggiuntive
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
    # Expone info sui moduli
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

// Test con controllo del tempo
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

        // Avanza il tempo di 25 ore
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
// Step 1: Inizia con moduli nel monolite
@ApplicationModule
package com.example.ecommerce.order;

// Step 2: Esternalizza eventi
@Externalized("orders")
public record OrderCreatedEvent(...) {}

// Step 3: Quando pronto, estrai il modulo
// - Crea nuovo servizio Spring Boot
// - Consuma eventi da Kafka
// - Mantieni API compatibile

// Consumer nel nuovo microservizio
@Component
public class OrderEventConsumer {

    @KafkaListener(topics = "orders")
    public void onOrderEvent(OrderCreatedEvent event) {
        // Handle in separate service
    }
}
```
