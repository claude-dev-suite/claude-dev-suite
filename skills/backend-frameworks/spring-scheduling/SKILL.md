---
name: spring-scheduling
description: |
  Spring Scheduling and Async for Spring Boot 3.x. Covers @Scheduled, @Async,
  cron expressions, ThreadPoolTaskExecutor, task monitoring, distributed
  scheduling with ShedLock, and error handling.

  USE WHEN: user mentions "@Scheduled", "@Async", "cron expression Spring",
  "background jobs Spring", "async Spring Boot", "ThreadPoolTaskExecutor", "ShedLock"

  DO NOT USE FOR: complex batch jobs - use `spring-batch` skill,
  workflow orchestration - consider Temporal or Camunda,
  message-driven - use messaging skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Scheduling & Async

> **Full Reference**: See [async.md](async.md) for async configuration, multiple executors, and CompletableFuture patterns.
> **Full Reference**: See [distributed.md](distributed.md) for ShedLock, error handling, dynamic scheduling, and testing.

## Quick Start

```java
@SpringBootApplication
@EnableScheduling
@EnableAsync
public class Application {}

@Service
@Slf4j
public class ScheduledTasks {

    @Scheduled(fixedRate = 60000)  // Every minute
    public void runEveryMinute() {
        log.info("Task executed at {}", LocalDateTime.now());
    }

    @Async
    public CompletableFuture<String> asyncOperation() {
        return CompletableFuture.completedFuture("Done");
    }
}
```

---

## @Scheduled

### Fixed Rate vs Fixed Delay

```java
@Service
public class ScheduledTasks {

    // Fixed Rate: runs every 5s from start of previous
    @Scheduled(fixedRate = 5000)
    public void fixedRateTask() { }

    // Fixed Delay: runs 5s after previous completes
    @Scheduled(fixedDelay = 5000)
    public void fixedDelayTask() { }

    // Initial delay before first run
    @Scheduled(fixedRate = 5000, initialDelay = 10000)
    public void delayedStart() { }

    // Configurable via properties
    @Scheduled(fixedRateString = "${task.rate:5000}")
    public void configurableTask() { }

    // With TimeUnit
    @Scheduled(fixedRate = 1, timeUnit = TimeUnit.MINUTES)
    public void everyMinute() { }
}
```

### Cron Expressions

```java
@Service
public class CronTasks {

    // Daily at 2:00 AM
    @Scheduled(cron = "0 0 2 * * *")
    public void dailyAt2AM() { }

    // Every Monday at 9:00 AM
    @Scheduled(cron = "0 0 9 * * MON")
    public void everyMondayAt9AM() { }

    // Every 15 minutes during business hours (9-18)
    @Scheduled(cron = "0 */15 9-18 * * MON-FRI")
    public void businessHoursTask() { }

    // With timezone
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Rome")
    public void dailyAt9AMRome() { }

    // Disable with "-"
    @Scheduled(cron = "${task.cron:-}")
    public void optionalTask() { }
}
```

### Cron Expression Reference

```
┌───────────── second (0-59)
│ ┌───────────── minute (0-59)
│ │ ┌───────────── hour (0-23)
│ │ │ ┌───────────── day of month (1-31)
│ │ │ │ ┌───────────── month (1-12 or JAN-DEC)
│ │ │ │ │ ┌───────────── day of week (0-7 or SUN-SAT)
│ │ │ │ │ │
* * * * * *
```

| Expression | Description |
|------------|-------------|
| `0 0 * * * *` | Every hour |
| `0 */10 * * * *` | Every 10 minutes |
| `0 0 8-18 * * *` | Every hour from 8 AM to 6 PM |
| `0 0 9 * * MON-FRI` | 9 AM on weekdays |
| `0 0 0 1 * *` | First day of every month |

---

## @Async

### Basic Configuration

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
}
```

### Async Methods

```java
@Service
public class AsyncService {

    // Fire and forget
    @Async
    public void sendEmailAsync(String to, String subject, String body) {
        emailSender.send(to, subject, body);
    }

    // With result
    @Async
    public CompletableFuture<Report> generateReportAsync(ReportRequest request) {
        Report report = reportGenerator.generate(request);
        return CompletableFuture.completedFuture(report);
    }

    // With specific executor
    @Async("reportExecutor")
    public CompletableFuture<Report> generateHeavyReport(ReportRequest request) {
        return CompletableFuture.completedFuture(reportGenerator.generateHeavy(request));
    }
}
```

---

## Task Executor Configuration

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
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use ShedLock for clustered env | Allow duplicate executions |
| Configure error handler | Ignore task exceptions |
| Monitor execution time | Deploy without metrics |
| Use CompletableFuture for results | Use void async without handler |
| Configure graceful shutdown | Kill running tasks abruptly |

## Production Checklist

- [ ] @EnableScheduling and @EnableAsync configured
- [ ] Thread pool properly sized
- [ ] ShedLock for clustered environment
- [ ] Error handling implemented
- [ ] Metrics for monitoring
- [ ] Graceful shutdown configured
- [ ] Retry for transient failures

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Missing @EnableScheduling | Task doesn't run | Add annotation |
| Internal @Async call | Proxy bypassed | Use self-injection |
| Task overlap | Concurrent execution | Use fixed delay or ShedLock |
| Small thread pool | Thread starvation | Size pool appropriately |
| Void async without handler | Lost exceptions | Implement AsyncUncaughtExceptionHandler |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Task not executing | Check annotations | Add @EnableScheduling |
| Async not working | Check call site | Avoid internal calls |
| Task runs multiple times | Check cluster | Add ShedLock |
| Thread pool exhausted | Check pool config | Increase pool size |

## Reference Documentation
- [Task Execution and Scheduling](https://docs.spring.io/spring-framework/reference/integration/scheduling.html)
- [ShedLock](https://github.com/lukas-krecan/ShedLock)
