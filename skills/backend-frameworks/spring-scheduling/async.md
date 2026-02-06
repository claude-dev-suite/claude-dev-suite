# Async Configuration & Patterns

## Configuration Base

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    @Bean(name = "taskExecutor")
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("Async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return new CustomAsyncExceptionHandler();
    }
}

@Slf4j
public class CustomAsyncExceptionHandler implements AsyncUncaughtExceptionHandler {

    @Override
    public void handleUncaughtException(Throwable ex, Method method, Object... params) {
        log.error("Async exception in method: {} with params: {}",
            method.getName(), Arrays.toString(params), ex);
    }
}
```

---

## Multiple Executors

```java
@Configuration
@EnableAsync
public class MultipleExecutorsConfig {

    @Bean("emailExecutor")
    public Executor emailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("Email-");
        executor.initialize();
        return executor;
    }

    @Bean("reportExecutor")
    public Executor reportExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(3);
        executor.setQueueCapacity(10);
        executor.setThreadNamePrefix("Report-");
        executor.initialize();
        return executor;
    }

    @Bean("defaultExecutor")
    @Primary
    public Executor defaultExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("Default-");
        executor.initialize();
        return executor;
    }
}
```

---

## Async Methods

```java
@Service
@Slf4j
public class AsyncService {

    // Async void - fire and forget
    @Async
    public void sendEmailAsync(String to, String subject, String body) {
        log.info("Sending email to {} on thread {}", to, Thread.currentThread().getName());
        emailSender.send(to, subject, body);
    }

    // Async con risultato
    @Async
    public CompletableFuture<Report> generateReportAsync(ReportRequest request) {
        log.info("Generating report on thread {}", Thread.currentThread().getName());
        Report report = reportGenerator.generate(request);
        return CompletableFuture.completedFuture(report);
    }

    // Async con executor specifico
    @Async("reportExecutor")
    public CompletableFuture<Report> generateHeavyReport(ReportRequest request) {
        return CompletableFuture.completedFuture(reportGenerator.generateHeavy(request));
    }

    // Async con exception handling
    @Async
    public CompletableFuture<Result> processWithErrorHandling(Request request) {
        try {
            Result result = processor.process(request);
            return CompletableFuture.completedFuture(result);
        } catch (Exception e) {
            CompletableFuture<Result> future = new CompletableFuture<>();
            future.completeExceptionally(e);
            return future;
        }
    }
}
```

---

## Composing Async Operations

```java
@Service
@RequiredArgsConstructor
public class OrderProcessingService {

    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    private final ShippingService shippingService;
    private final NotificationService notificationService;

    public CompletableFuture<OrderResult> processOrderAsync(Order order) {
        // Parallel operations
        CompletableFuture<InventoryResult> inventoryFuture =
            inventoryService.checkAndReserveAsync(order);

        CompletableFuture<PaymentResult> paymentFuture =
            paymentService.processPaymentAsync(order);

        // Wait for both and combine
        return inventoryFuture
            .thenCombine(paymentFuture, (inventory, payment) -> {
                if (inventory.isSuccess() && payment.isSuccess()) {
                    return new OrderResult(true, "Order processed");
                }
                return new OrderResult(false, "Order failed");
            })
            .thenCompose(result -> {
                if (result.isSuccess()) {
                    return shippingService.scheduleShippingAsync(order)
                        .thenApply(shipping -> result);
                }
                return CompletableFuture.completedFuture(result);
            })
            .thenCompose(result -> {
                return notificationService.notifyCustomerAsync(order, result)
                    .thenApply(v -> result);
            })
            .exceptionally(ex -> {
                log.error("Order processing failed", ex);
                return new OrderResult(false, ex.getMessage());
            });
    }

    // Parallel processing of multiple items
    public CompletableFuture<List<ProcessResult>> processItemsAsync(List<Item> items) {
        List<CompletableFuture<ProcessResult>> futures = items.stream()
            .map(this::processItemAsync)
            .toList();

        return CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
            .thenApply(v -> futures.stream()
                .map(CompletableFuture::join)
                .toList());
    }

    @Async
    public CompletableFuture<ProcessResult> processItemAsync(Item item) {
        return CompletableFuture.completedFuture(processor.process(item));
    }
}
```

---

## Task Executor Configuration (Properties)

```yaml
spring:
  task:
    execution:
      pool:
        core-size: 5
        max-size: 10
        queue-capacity: 100
        keep-alive: 60s
      thread-name-prefix: task-
      shutdown:
        await-termination: true
        await-termination-period: 60s

    scheduling:
      pool:
        size: 3
      thread-name-prefix: scheduling-
      shutdown:
        await-termination: true
        await-termination-period: 30s
```
