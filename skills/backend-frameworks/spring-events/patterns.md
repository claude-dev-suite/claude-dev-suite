# Event-Driven Architecture Patterns

## Domain Events

```java
// Base domain event
public abstract class DomainEvent {
    private final String eventId;
    private final Instant occurredAt;
    private final String aggregateId;
    private final String aggregateType;

    protected DomainEvent(String aggregateId, String aggregateType) {
        this.eventId = UUID.randomUUID().toString();
        this.occurredAt = Instant.now();
        this.aggregateId = aggregateId;
        this.aggregateType = aggregateType;
    }

    // Getters
}

// Concrete domain events
public class OrderPlacedEvent extends DomainEvent {
    private final List<OrderItem> items;
    private final BigDecimal totalAmount;
    private final String customerId;

    public OrderPlacedEvent(String orderId, List<OrderItem> items,
                           BigDecimal totalAmount, String customerId) {
        super(orderId, "Order");
        this.items = items;
        this.totalAmount = totalAmount;
        this.customerId = customerId;
    }
}

public class OrderPaidEvent extends DomainEvent {
    private final String paymentId;
    private final BigDecimal amount;

    public OrderPaidEvent(String orderId, String paymentId, BigDecimal amount) {
        super(orderId, "Order");
        this.paymentId = paymentId;
        this.amount = amount;
    }
}
```

---

## Aggregate Root with Events

```java
@Entity
public class Order {

    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @OneToMany(cascade = CascadeType.ALL)
    private List<OrderItem> items;

    private BigDecimal totalAmount;

    @Transient
    private final List<DomainEvent> domainEvents = new ArrayList<>();

    // Factory method
    public static Order create(String customerId, List<OrderItem> items) {
        Order order = new Order();
        order.id = UUID.randomUUID().toString();
        order.items = items;
        order.totalAmount = calculateTotal(items);
        order.status = OrderStatus.PLACED;

        order.registerEvent(new OrderPlacedEvent(
            order.id, items, order.totalAmount, customerId
        ));

        return order;
    }

    public void pay(String paymentId) {
        if (status != OrderStatus.PLACED) {
            throw new IllegalStateException("Cannot pay order in status: " + status);
        }
        this.status = OrderStatus.PAID;
        registerEvent(new OrderPaidEvent(id, paymentId, totalAmount));
    }

    public void ship(String trackingNumber) {
        if (status != OrderStatus.PAID) {
            throw new IllegalStateException("Cannot ship unpaid order");
        }
        this.status = OrderStatus.SHIPPED;
        registerEvent(new OrderShippedEvent(id, trackingNumber));
    }

    private void registerEvent(DomainEvent event) {
        domainEvents.add(event);
    }

    public List<DomainEvent> getDomainEvents() {
        return Collections.unmodifiableList(domainEvents);
    }

    public void clearDomainEvents() {
        domainEvents.clear();
    }
}
```

---

## Domain Event Publisher

```java
@Component
@RequiredArgsConstructor
public class DomainEventPublisher {

    private final ApplicationEventPublisher applicationEventPublisher;

    public void publishEvents(List<DomainEvent> events) {
        events.forEach(applicationEventPublisher::publishEvent);
    }
}

// Repository che pubblica eventi automaticamente
@Repository
public class OrderRepositoryImpl implements OrderRepository {

    private final JpaOrderRepository jpaRepository;
    private final DomainEventPublisher eventPublisher;

    @Override
    @Transactional
    public Order save(Order order) {
        Order saved = jpaRepository.save(order);

        // Publish domain events after save
        eventPublisher.publishEvents(order.getDomainEvents());
        order.clearDomainEvents();

        return saved;
    }
}

// O con AOP
@Aspect
@Component
@RequiredArgsConstructor
public class DomainEventPublishingAspect {

    private final ApplicationEventPublisher eventPublisher;

    @AfterReturning(
        pointcut = "execution(* *..repository.*Repository.save(..))",
        returning = "entity"
    )
    public void publishDomainEvents(Object entity) {
        if (entity instanceof AggregateRoot aggregate) {
            aggregate.getDomainEvents().forEach(eventPublisher::publishEvent);
            aggregate.clearDomainEvents();
        }
    }
}
```

---

## Event Store Pattern

```java
@Entity
@Table(name = "event_store")
public class StoredEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String eventId;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String aggregateId;

    @Column(nullable = false)
    private String aggregateType;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String payload;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(nullable = false)
    private Instant storedAt;

    private boolean published;
}

@Repository
public interface EventStoreRepository extends JpaRepository<StoredEvent, Long> {

    List<StoredEvent> findByAggregateIdOrderByOccurredAt(String aggregateId);

    List<StoredEvent> findByPublishedFalseOrderByOccurredAt();
}

@Service
@RequiredArgsConstructor
public class EventStore {

    private final EventStoreRepository repository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void store(DomainEvent event) {
        StoredEvent storedEvent = new StoredEvent();
        storedEvent.setEventId(event.getEventId());
        storedEvent.setEventType(event.getClass().getSimpleName());
        storedEvent.setAggregateId(event.getAggregateId());
        storedEvent.setAggregateType(event.getAggregateType());
        storedEvent.setPayload(serialize(event));
        storedEvent.setOccurredAt(event.getOccurredAt());
        storedEvent.setStoredAt(Instant.now());
        storedEvent.setPublished(false);

        repository.save(storedEvent);
    }

    public List<DomainEvent> getEventsForAggregate(String aggregateId) {
        return repository.findByAggregateIdOrderByOccurredAt(aggregateId)
            .stream()
            .map(this::deserialize)
            .toList();
    }

    private String serialize(DomainEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize event", e);
        }
    }

    private DomainEvent deserialize(StoredEvent stored) {
        try {
            Class<?> eventClass = Class.forName(
                "com.example.events." + stored.getEventType()
            );
            return (DomainEvent) objectMapper.readValue(stored.getPayload(), eventClass);
        } catch (Exception e) {
            throw new RuntimeException("Failed to deserialize event", e);
        }
    }
}
```

---

## Testing Events

```java
@SpringBootTest
class EventTest {

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @MockBean
    private EmailService emailService;

    @Test
    void shouldTriggerEventListener() {
        // Publish event
        eventPublisher.publishEvent(new OrderCreatedEvent(1L, 100L, BigDecimal.TEN, Instant.now()));

        // Verify listener called
        verify(emailService).sendOrderConfirmation(1L, 100L);
    }
}

// Test con capture degli eventi
@SpringBootTest
class EventCaptureTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private ApplicationEvents applicationEvents;  // Spring Test

    @Test
    void createOrder_shouldPublishEvent() {
        orderService.createOrder(new CreateOrderRequest());

        // Verify event published
        assertThat(applicationEvents.stream(OrderCreatedEvent.class))
            .hasSize(1)
            .first()
            .satisfies(event -> {
                assertThat(event.orderId()).isNotNull();
                assertThat(event.totalAmount()).isPositive();
            });
    }
}
```
