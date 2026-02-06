# Spring Retry Advanced Patterns

## RetryTemplate (Programmatic)

### Basic Template
```java
@Configuration
public class RetryConfig {

    @Bean
    public RetryTemplate retryTemplate() {
        return RetryTemplate.builder()
            .maxAttempts(3)
            .fixedBackoff(1000)
            .retryOn(ServiceException.class)
            .build();
    }
}

@Service
@RequiredArgsConstructor
public class OrderService {

    private final RetryTemplate retryTemplate;

    public Order createOrder(OrderRequest request) {
        return retryTemplate.execute(context -> {
            log.info("Attempt {} to create order", context.getRetryCount() + 1);
            return orderClient.create(request);
        });
    }
}
```

### With Recovery Callback
```java
public Order createOrderWithRecovery(OrderRequest request) {
    return retryTemplate.execute(
        context -> orderClient.create(request),
        context -> {
            log.error("All retries failed for order: {}", request.getId());
            return Order.pending(request);
        }
    );
}
```

### Custom RetryTemplate
```java
@Bean
public RetryTemplate customRetryTemplate() {
    RetryTemplate template = new RetryTemplate();

    // Retry policy
    Map<Class<? extends Throwable>, Boolean> retryableExceptions = new HashMap<>();
    retryableExceptions.put(ServiceException.class, true);
    retryableExceptions.put(TimeoutException.class, true);
    retryableExceptions.put(BusinessException.class, false);

    SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy(5, retryableExceptions);
    template.setRetryPolicy(retryPolicy);

    // Backoff policy
    ExponentialBackOffPolicy backOffPolicy = new ExponentialBackOffPolicy();
    backOffPolicy.setInitialInterval(500);
    backOffPolicy.setMultiplier(2.0);
    backOffPolicy.setMaxInterval(10000);
    template.setBackOffPolicy(backOffPolicy);

    return template;
}
```

## Retry Policies

### TimeoutRetryPolicy
```java
@Bean
public RetryTemplate timeoutRetryTemplate() {
    RetryTemplate template = new RetryTemplate();

    TimeoutRetryPolicy policy = new TimeoutRetryPolicy();
    policy.setTimeout(30000); // Retry for max 30 seconds
    template.setRetryPolicy(policy);

    return template;
}
```

### CompositeRetryPolicy
```java
@Bean
public RetryTemplate compositeRetryTemplate() {
    RetryTemplate template = new RetryTemplate();

    // Max 5 attempts AND within 30 seconds
    SimpleRetryPolicy simplePolicy = new SimpleRetryPolicy(5);
    TimeoutRetryPolicy timeoutPolicy = new TimeoutRetryPolicy();
    timeoutPolicy.setTimeout(30000);

    CompositeRetryPolicy compositePolicy = new CompositeRetryPolicy();
    compositePolicy.setPolicies(new RetryPolicy[] {simplePolicy, timeoutPolicy});
    compositePolicy.setOptimistic(false);  // All policies must allow retry

    template.setRetryPolicy(compositePolicy);
    return template;
}
```

### CircuitBreakerRetryPolicy
```java
@Bean
public RetryTemplate circuitBreakerRetryTemplate() {
    RetryTemplate template = new RetryTemplate();

    CircuitBreakerRetryPolicy circuitBreaker = new CircuitBreakerRetryPolicy(
        new SimpleRetryPolicy(3)
    );
    circuitBreaker.setOpenTimeout(5000);    // Stay open for 5 seconds
    circuitBreaker.setResetTimeout(20000);  // Reset after 20 seconds

    template.setRetryPolicy(circuitBreaker);
    return template;
}
```

## Retry Listeners

```java
@Component
@Slf4j
public class CustomRetryListener implements RetryListener {

    @Override
    public <T, E extends Throwable> boolean open(
            RetryContext context, RetryCallback<T, E> callback) {
        log.info("Starting retry operation");
        context.setAttribute("startTime", System.currentTimeMillis());
        return true;
    }

    @Override
    public <T, E extends Throwable> void close(
            RetryContext context, RetryCallback<T, E> callback, Throwable t) {
        long duration = System.currentTimeMillis() -
            (Long) context.getAttribute("startTime");
        log.info("Retry operation completed in {}ms after {} attempts",
            duration, context.getRetryCount());
    }

    @Override
    public <T, E extends Throwable> void onError(
            RetryContext context, RetryCallback<T, E> callback, Throwable t) {
        log.warn("Attempt {} failed with: {}",
            context.getRetryCount() + 1, t.getMessage());
    }

    @Override
    public <T, E extends Throwable> void onSuccess(
            RetryContext context, RetryCallback<T, E> callback, T result) {
        log.info("Operation succeeded on attempt {}", context.getRetryCount() + 1);
    }
}

@Bean
public RetryTemplate retryTemplateWithListener(CustomRetryListener listener) {
    RetryTemplate template = new RetryTemplate();
    template.registerListener(listener);
    return template;
}
```

## Stateful Retry

```java
@Service
public class StatefulRetryService {

    private final RetryTemplate retryTemplate;

    public void processWithState(String itemId) {
        retryTemplate.execute(
            context -> process(itemId),
            context -> handleFailure(itemId),
            new DefaultRetryState(itemId)  // State key for this operation
        );
    }
}
```

## Async Retry

```java
@Service
public class AsyncRetryService {

    @Async
    @Retryable(maxAttempts = 3, backoff = @Backoff(delay = 1000))
    public CompletableFuture<Result> asyncOperation(Request request) {
        return CompletableFuture.completedFuture(
            externalService.process(request)
        );
    }

    @Recover
    public CompletableFuture<Result> recoverAsync(Exception e, Request request) {
        return CompletableFuture.completedFuture(Result.fallback());
    }
}
```

## Testing

```java
@SpringBootTest
class RetryServiceTest {

    @Autowired
    private UserService userService;

    @MockBean
    private UserClient userClient;

    @Test
    void shouldRetryAndSucceed() {
        when(userClient.findById(1L))
            .thenThrow(new ServiceException("Fail 1"))
            .thenThrow(new ServiceException("Fail 2"))
            .thenReturn(new User(1L, "John"));

        User result = userService.getUser(1L);

        assertThat(result.getName()).isEqualTo("John");
        verify(userClient, times(3)).findById(1L);
    }

    @Test
    void shouldFallbackAfterMaxRetries() {
        when(userClient.findById(1L))
            .thenThrow(new ServiceException("Always fail"));

        User result = userService.getUser(1L);  // Should hit @Recover

        assertThat(result.getName()).isEqualTo("Unknown");
        verify(userClient, times(3)).findById(1L);
    }
}
```

## Configuration Properties

```yaml
app:
  retry:
    max-attempts: 3
    initial-interval: 1000
    multiplier: 2
    max-interval: 10000
```

```java
@Configuration
@ConfigurationProperties(prefix = "app.retry")
@Data
public class RetryProperties {
    private int maxAttempts = 3;
    private long initialInterval = 1000;
    private double multiplier = 2.0;
    private long maxInterval = 10000;
}

@Bean
public RetryTemplate retryTemplate(RetryProperties props) {
    return RetryTemplate.builder()
        .maxAttempts(props.getMaxAttempts())
        .exponentialBackoff(
            props.getInitialInterval(),
            props.getMultiplier(),
            props.getMaxInterval()
        )
        .build();
}
```

## RetryContext

```java
@Retryable(maxAttempts = 3)
public void operationWithContext(String param) {
    RetryContext context = RetrySynchronizationManager.getContext();

    int attempt = context.getRetryCount() + 1;
    log.info("Attempt {}/{} for param: {}", attempt, 3, param);

    Throwable lastError = context.getLastThrowable();
    context.setAttribute("startTime", System.currentTimeMillis());
}
```
