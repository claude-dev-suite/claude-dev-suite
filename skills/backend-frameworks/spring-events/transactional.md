# Transactional & Async Events

## @TransactionalEventListener

Per eseguire listener solo quando la transazione completa con successo.

```java
@Component
@Slf4j
public class TransactionalEventListeners {

    // Esegue DOPO il commit della transazione (default)
    @TransactionalEventListener
    public void handleAfterCommit(OrderCreatedEvent event) {
        log.info("Transaction committed, sending email for order: {}", event.orderId());
        emailService.sendOrderConfirmation(event.orderId());
    }

    // Esegue DOPO il commit - esplicito
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleAfterCommitExplicit(OrderCreatedEvent event) {
        // External API call - safe dopo commit
        externalService.notifyOrder(event);
    }

    // Esegue DOPO il rollback
    @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
    public void handleAfterRollback(OrderCreatedEvent event) {
        log.warn("Order creation rolled back: {}", event.orderId());
        alertService.notifyRollback(event);
    }

    // Esegue DOPO il completamento (commit o rollback)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
    public void handleAfterCompletion(OrderCreatedEvent event) {
        log.info("Transaction completed for order: {}", event.orderId());
    }

    // Esegue PRIMA del commit (nel contesto della transazione)
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void handleBeforeCommit(OrderCreatedEvent event) {
        // Ultimo check prima del commit
        validateOrderBeforeCommit(event);
    }

    // Fallback se non c'è transazione attiva
    @TransactionalEventListener(fallbackExecution = true)
    public void handleWithFallback(OrderCreatedEvent event) {
        // Esegue anche se non c'è transazione
    }
}
```

---

## Transactional Event Pattern

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        // 1. Create order in DB
        Order order = orderRepository.save(new Order(request));

        // 2. Publish event (sarà processato dopo commit)
        eventPublisher.publishEvent(new OrderCreatedEvent(
            order.getId(),
            order.getCustomerId(),
            order.getTotalAmount(),
            order.getCreatedAt()
        ));

        // 3. Return (transaction commits here)
        return order;
    }
}

@Component
@RequiredArgsConstructor
public class OrderCreatedEventHandler {

    private final EmailService emailService;
    private final InventoryService inventoryService;
    private final AnalyticsService analyticsService;

    // Email - dopo commit, non critico
    @TransactionalEventListener
    @Async
    public void sendConfirmationEmail(OrderCreatedEvent event) {
        emailService.sendOrderConfirmation(event.orderId(), event.customerId());
    }

    // Inventory - dopo commit, importante
    @TransactionalEventListener
    @Order(1)
    public void reserveInventory(OrderCreatedEvent event) {
        inventoryService.reserveForOrder(event.orderId());
    }

    // Analytics - dopo commit, non critico
    @TransactionalEventListener
    @Async
    public void trackOrder(OrderCreatedEvent event) {
        analyticsService.trackOrderCreated(event);
    }
}
```

---

## Async Events

```java
@Configuration
@EnableAsync
public class AsyncEventConfig {

    @Bean("eventExecutor")
    public Executor eventExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("event-");
        executor.initialize();
        return executor;
    }
}

@Component
@Slf4j
public class AsyncEventListeners {

    // Async event listener
    @Async("eventExecutor")
    @EventListener
    public void handleAsync(OrderCreatedEvent event) {
        log.info("Processing async on thread: {}", Thread.currentThread().getName());
        // Long running operation
    }

    // Async transactional (attenzione: transazione già committata)
    @Async
    @TransactionalEventListener
    public void handleAsyncTransactional(OrderCreatedEvent event) {
        // Safe - eseguito dopo commit in thread separato
    }
}
```

---

## Async Event con Error Handling

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class RobustAsyncEventListener {

    private final MeterRegistry meterRegistry;
    private final RetryTemplate retryTemplate;

    @Async
    @EventListener
    public void handleWithRetry(OrderCreatedEvent event) {
        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            retryTemplate.execute(context -> {
                processEvent(event);
                return null;
            });

            meterRegistry.counter("event.processed", "type", "OrderCreatedEvent", "status", "success")
                .increment();

        } catch (Exception e) {
            log.error("Failed to process event after retries", e);

            meterRegistry.counter("event.processed", "type", "OrderCreatedEvent", "status", "failure")
                .increment();

            // Store in dead letter queue
            deadLetterQueue.store(event, e);

        } finally {
            sample.stop(meterRegistry.timer("event.processing.time", "type", "OrderCreatedEvent"));
        }
    }

    @Bean
    public RetryTemplate retryTemplate() {
        return RetryTemplate.builder()
            .maxAttempts(3)
            .exponentialBackoff(1000, 2, 10000)
            .retryOn(TransientException.class)
            .build();
    }
}
```

---

## Application Lifecycle Events

```java
@Component
@Slf4j
public class ApplicationLifecycleListener {

    // Application context refreshed (beans loaded)
    @EventListener
    public void onContextRefreshed(ContextRefreshedEvent event) {
        log.info("Application context refreshed");
    }

    // Application started (ready to serve)
    @EventListener
    public void onApplicationStarted(ApplicationStartedEvent event) {
        log.info("Application started");
    }

    // Application ready (all runners executed)
    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        log.info("Application ready - warming up caches");
        cacheWarmupService.warmup();
    }

    // Application failed to start
    @EventListener
    public void onApplicationFailed(ApplicationFailedEvent event) {
        log.error("Application failed to start", event.getException());
    }

    // Context closed (shutdown)
    @EventListener
    public void onContextClosed(ContextClosedEvent event) {
        log.info("Application shutting down");
    }

    // Web server initialized
    @EventListener
    public void onWebServerInitialized(WebServerInitializedEvent event) {
        log.info("Web server started on port: {}", event.getWebServer().getPort());
    }
}
```

---

## Testing Transactional Events

```java
// Test transactional event
@SpringBootTest
@Transactional
class TransactionalEventTest {

    @Autowired
    private OrderService orderService;

    @SpyBean
    private OrderCreatedEventHandler eventHandler;

    @Test
    void shouldProcessAfterCommit() {
        orderService.createOrder(new CreateOrderRequest());

        // TransactionalEventListener non ancora eseguito (dentro transaction)
        verify(eventHandler, never()).sendConfirmationEmail(any());

        // Commit transaction
        TestTransaction.flagForCommit();
        TestTransaction.end();

        // Ora dovrebbe essere eseguito
        verify(eventHandler).sendConfirmationEmail(any());
    }
}
```
