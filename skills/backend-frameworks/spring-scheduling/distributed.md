# Distributed Scheduling & Advanced Patterns

## ShedLock (Distributed Locking)

Per evitare esecuzioni multiple in ambiente clustered.

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
    <version>5.10.0</version>
</dependency>
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-jdbc-template</artifactId>
    <version>5.10.0</version>
</dependency>
```

```java
@Configuration
@EnableScheduling
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
            JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(new JdbcTemplate(dataSource))
                .usingDbTime()
                .build()
        );
    }
}
```

```sql
CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
```

```java
@Service
@Slf4j
public class DistributedScheduledTasks {

    @Scheduled(cron = "0 */10 * * * *")
    @SchedulerLock(
        name = "dataSync",
        lockAtMostFor = "10m",
        lockAtLeastFor = "5m"
    )
    public void syncData() {
        log.info("Data sync task running");
    }

    @Scheduled(cron = "0 0 2 * * *")
    @SchedulerLock(name = "dailyCleanup", lockAtMostFor = "1h")
    public void dailyCleanup() {
        log.info("Daily cleanup");
    }
}
```

### ShedLock con Redis

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-provider-redis-spring</artifactId>
    <version>5.10.0</version>
</dependency>
```

```java
@Bean
public LockProvider lockProvider(RedisConnectionFactory connectionFactory) {
    return new RedisLockProvider(connectionFactory, "myapp");
}
```

---

## Error Handling

```java
@Configuration
@EnableScheduling
public class SchedulerErrorHandlingConfig implements SchedulingConfigurer {

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(5);
        scheduler.setThreadNamePrefix("scheduled-");
        scheduler.setErrorHandler(new ScheduledTaskErrorHandler());
        scheduler.initialize();
        taskRegistrar.setTaskScheduler(scheduler);
    }
}

@Slf4j
public class ScheduledTaskErrorHandler implements ErrorHandler {

    private final MeterRegistry meterRegistry;

    @Override
    public void handleError(Throwable t) {
        log.error("Scheduled task failed", t);
        meterRegistry.counter("scheduled.task.errors",
            "exception", t.getClass().getSimpleName()
        ).increment();
    }
}
```

### Retry Pattern

```java
@Service
public class SpringRetryScheduledTask {

    @Scheduled(cron = "0 0 * * * *")
    @Retryable(
        retryFor = TransientException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2)
    )
    public void taskWithSpringRetry() {
        doWork();
    }

    @Recover
    public void recover(TransientException e) {
        log.error("Task failed after all retries", e);
    }
}
```

---

## Monitoring

```java
@Aspect
@Component
@RequiredArgsConstructor
public class ScheduledTaskMonitoringAspect {

    private final MeterRegistry meterRegistry;

    @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object monitorScheduledTask(ProceedingJoinPoint joinPoint) throws Throwable {
        String taskName = joinPoint.getSignature().getName();
        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            Object result = joinPoint.proceed();
            meterRegistry.counter("scheduled.task.executions",
                "task", taskName,
                "status", "success"
            ).increment();
            return result;
        } catch (Throwable t) {
            meterRegistry.counter("scheduled.task.executions",
                "task", taskName,
                "status", "failure",
                "exception", t.getClass().getSimpleName()
            ).increment();
            throw t;
        } finally {
            sample.stop(meterRegistry.timer("scheduled.task.time", "task", taskName));
        }
    }
}
```

---

## Dynamic Scheduling

```java
@Service
@RequiredArgsConstructor
public class DynamicSchedulerService {

    private final TaskScheduler taskScheduler;
    private final Map<String, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();

    public void scheduleTask(String taskId, Runnable task, String cronExpression) {
        cancelTask(taskId);
        ScheduledFuture<?> future = taskScheduler.schedule(
            task,
            new CronTrigger(cronExpression)
        );
        scheduledTasks.put(taskId, future);
    }

    public void scheduleTaskWithFixedRate(String taskId, Runnable task, Duration period) {
        cancelTask(taskId);
        ScheduledFuture<?> future = taskScheduler.scheduleAtFixedRate(
            task,
            Instant.now(),
            period
        );
        scheduledTasks.put(taskId, future);
    }

    public void cancelTask(String taskId) {
        ScheduledFuture<?> future = scheduledTasks.remove(taskId);
        if (future != null) {
            future.cancel(false);
        }
    }

    public Set<String> getActiveTaskIds() {
        return scheduledTasks.entrySet().stream()
            .filter(e -> !e.getValue().isCancelled())
            .map(Map.Entry::getKey)
            .collect(Collectors.toSet());
    }
}
```

---

## Testing

```java
@SpringBootTest
class ScheduledTaskTest {

    @Autowired
    private ScheduledTasks scheduledTasks;

    @MockBean
    private ExternalService externalService;

    @Test
    void scheduledTask_shouldExecute() {
        scheduledTasks.runEveryMinute();
        verify(externalService).process(any());
    }
}

// Test con Awaitility
@SpringBootTest
class ScheduledTaskIntegrationTest {

    @SpyBean
    private TaskRepository taskRepository;

    @Test
    void scheduledTask_shouldRunPeriodically() {
        await()
            .atMost(Duration.ofSeconds(70))
            .untilAsserted(() ->
                verify(taskRepository, atLeast(1)).processTask()
            );
    }
}

// Test async
@SpringBootTest
class AsyncServiceTest {

    @Autowired
    private AsyncService asyncService;

    @Test
    void asyncMethod_shouldComplete() throws Exception {
        CompletableFuture<Result> future = asyncService.processAsync(request);
        Result result = future.get(5, TimeUnit.SECONDS);
        assertThat(result.isSuccess()).isTrue();
    }
}
```
