# AOP Use Case Patterns

## Performance Monitoring

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Timed {
    String value() default "";
    double warnThresholdMs() default 1000;
}

@Aspect
@Component
@RequiredArgsConstructor
public class PerformanceAspect {

    private final MeterRegistry meterRegistry;

    @Around("@annotation(timed)")
    public Object measureTime(ProceedingJoinPoint joinPoint, Timed timed) throws Throwable {
        String metricName = timed.value().isEmpty()
            ? joinPoint.getSignature().toShortString()
            : timed.value();

        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            return joinPoint.proceed();
        } finally {
            long duration = sample.stop(meterRegistry.timer("method.execution", "method", metricName));

            if (duration > timed.warnThresholdMs() * 1_000_000) {
                log.warn("Slow execution: {} took {}ms", metricName, duration / 1_000_000);
            }
        }
    }
}
```

---

## Retry Logic

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Retryable {
    int maxAttempts() default 3;
    long delay() default 1000;
    Class<? extends Exception>[] retryOn() default {Exception.class};
}

@Aspect
@Component
@Slf4j
public class RetryAspect {

    @Around("@annotation(retryable)")
    public Object retry(ProceedingJoinPoint joinPoint, Retryable retryable) throws Throwable {
        int attempts = 0;
        Exception lastException = null;

        while (attempts < retryable.maxAttempts()) {
            try {
                return joinPoint.proceed();
            } catch (Exception e) {
                if (!shouldRetry(e, retryable.retryOn())) {
                    throw e;
                }
                lastException = e;
                attempts++;
                log.warn("Attempt {} failed: {}", attempts, e.getMessage());

                if (attempts < retryable.maxAttempts()) {
                    Thread.sleep(retryable.delay());
                }
            }
        }
        throw new RuntimeException("Failed after " + attempts + " attempts", lastException);
    }
}

// Usage
@Retryable(maxAttempts = 3, delay = 2000, retryOn = {HttpTimeoutException.class})
public Response callExternalApi(Request request) {
    return httpClient.send(request);
}
```

---

## Audit Logging

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited {
    String action();
    String resourceType() default "";
}

@Aspect
@Component
@RequiredArgsConstructor
public class AuditAspect {

    private final AuditLogRepository auditLogRepository;

    @AfterReturning(pointcut = "@annotation(audited)", returning = "result")
    public void auditSuccess(JoinPoint joinPoint, Audited audited, Object result) {
        createAuditLog(joinPoint, audited, "SUCCESS", null, result);
    }

    @AfterThrowing(pointcut = "@annotation(audited)", throwing = "ex")
    public void auditFailure(JoinPoint joinPoint, Audited audited, Exception ex) {
        createAuditLog(joinPoint, audited, "FAILURE", ex.getMessage(), null);
    }

    private void createAuditLog(JoinPoint jp, Audited audited, String status, String error, Object result) {
        AuditLog log = AuditLog.builder()
            .action(audited.action())
            .resourceType(audited.resourceType())
            .status(status)
            .errorMessage(error)
            .timestamp(Instant.now())
            .build();
        auditLogRepository.save(log);
    }
}

// Usage
@Audited(action = "CREATE_ORDER", resourceType = "Order")
public Order createOrder(CreateOrderRequest request) {
    return orderRepository.save(new Order(request));
}
```

---

## Security Check

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPermission {
    String value();
}

@Aspect
@Component
@RequiredArgsConstructor
public class SecurityAspect {

    private final PermissionService permissionService;

    @Before("@annotation(requiresPermission)")
    public void checkPermission(JoinPoint joinPoint, RequiresPermission requiresPermission) {
        String permission = requiresPermission.value();
        String userId = SecurityContextHolder.getContext().getAuthentication().getName();

        if (!permissionService.hasPermission(userId, permission)) {
            throw new AccessDeniedException("User lacks permission: " + permission);
        }
    }
}

// Usage
@RequiresPermission("admin:users:write")
public void deleteUser(Long userId) {
    userRepository.deleteById(userId);
}
```

---

## Rate Limiting

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimited {
    int requests() default 100;
    int perSeconds() default 60;
    String key() default "";
}

@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {

    private final RateLimiterService rateLimiter;

    @Before("@annotation(rateLimited)")
    public void checkRateLimit(JoinPoint joinPoint, RateLimited rateLimited) {
        String key = resolveKey(joinPoint, rateLimited.key());

        if (!rateLimiter.tryAcquire(key, rateLimited.requests(), rateLimited.perSeconds())) {
            throw new RateLimitExceededException("Rate limit exceeded for: " + key);
        }
    }
}

// Usage
@RateLimited(requests = 10, perSeconds = 60, key = "#userId")
@GetMapping("/api/data/{userId}")
public Data getData(@PathVariable String userId) {
    return dataService.getData(userId);
}
```

---

## Testing Aspects

```java
@SpringBootTest
class AspectTest {

    @Autowired
    private UserService userService;

    @MockBean
    private AuditLogRepository auditLogRepository;

    @Test
    void auditAspect_shouldLogOnSuccess() {
        userService.createUser(new CreateUserRequest("test"));

        verify(auditLogRepository).save(argThat(log ->
            log.getAction().equals("CREATE_USER") &&
            log.getStatus().equals("SUCCESS")
        ));
    }

    @Test
    void auditAspect_shouldLogOnFailure() {
        assertThatThrownBy(() -> userService.createUser(null))
            .isInstanceOf(Exception.class);

        verify(auditLogRepository).save(argThat(log ->
            log.getStatus().equals("FAILURE")
        ));
    }
}
```
