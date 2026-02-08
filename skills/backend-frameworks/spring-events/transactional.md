# Transactional & Async Events

## @TransactionalEventListener

To execute listeners only when the transaction completes successfully.

```java
@Component
@Slf4j
public class TransactionalEventListeners {

    // Executes AFTER the transaction commit (default)
    @TransactionalEventListener
    public void handleAfterCommit(OrderCreatedEvent event) {
        log.info("Transaction committed, sending email for order: {}", event.orderId());
        emailService.sendOrderConfirmation(event.orderId());
    }

    // Executes AFTER commit - explicit
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleAfterCommitExplicit(OrderCreatedEvent event) {
        // External API call - safe after commit
        externalService.notifyOrder(event);
    }

    // Executes AFTER rollback
    @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
    public void handleAfterRollback(OrderCreatedEvent event) {
        log.warn("Order creation rolled back: {}", event.orderId());
        alertService.notifyRollback(event);
    }

    // Executes AFTER completion (commit or rollback)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
    public void handleAfterCompletion(OrderCreatedEvent event) {
        log.info("Transaction completed for order: {}", event.orderId());
    }

    // Executes BEFORE commit (within the transaction context)
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void handleBeforeCommit(OrderCreatedEvent event) {
        // Final check before commit
        validateOrderBeforeCommit(event);
    }

    // Fallback if there is no active transaction
    @TransactionalEventListener(fallbackExecution = true)
    public void handleWithFallback(OrderCreatedEvent event) {
        // Executes even if there is no active transaction
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

        // 2. Publish event (will be processed after commit)
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

    // Email - after commit, not critical
    @TransactionalEventListener
    @Async
    public void sendConfirmationEmail(OrderCreatedEvent event) {
        emailService.sendOrderConfirmation(event.orderId(), event.customerId());
    }

    // Inventory - after commit, important
    @TransactionalEventListener
    @Order(1)
    public void reserveInventory(OrderCreatedEvent event) {
        inventoryService.reserveForOrder(event.orderId());
    }

    // Analytics - after commit, not critical
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

    // Async transactional (note: transaction already committed)
    @Async
    @TransactionalEventListener
    public void handleAsyncTransactional(OrderCreatedEvent event) {
        // Safe - executed after commit in a separate thread
    }
}
```

---

## Async Event with Error Handling

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
// Test for transactional events
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

        // TransactionalEventListener not yet executed (inside transaction)
        verify(eventHandler, never()).sendConfirmationEmail(any());

        // Commit transaction
        TestTransaction.flagForCommit();
        TestTransaction.end();

        // Now it should have been executed
        verify(eventHandler).sendConfirmationEmail(any());
    }
}
```
