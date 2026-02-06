# Java Logging Quick Reference

## Log Levels (Priority Order)

```
ERROR > WARN > INFO > DEBUG > TRACE
```

| Level | When to Use |
|-------|-------------|
| ERROR | Errors requiring immediate attention |
| WARN  | Potential problems, degraded operation |
| INFO  | Business events, application lifecycle |
| DEBUG | Diagnostic info for developers |
| TRACE | Very detailed tracing |

## SLF4J Patterns

```java
// Basic logging
log.info("Message");
log.info("User {} logged in", userId);
log.error("Failed to process", exception);

// With Lombok
@Slf4j
public class MyClass { }
```

## Common Configuration (application.yml)

```yaml
logging:
  level:
    root: INFO
    com.yourcompany: DEBUG
    org.springframework: INFO
    org.hibernate.SQL: DEBUG
```

## MDC (Request Context)

```java
MDC.put("traceId", traceId);
MDC.put("userId", userId);
// ... logging includes these automatically
MDC.clear();
```

## Async Appender (Performance)

```xml
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <queueSize>512</queueSize>
    <appender-ref ref="FILE"/>
</appender>
```

## Rolling Policy

```xml
<rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
    <fileNamePattern>logs/app.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
    <maxFileSize>100MB</maxFileSize>
    <maxHistory>30</maxHistory>
    <totalSizeCap>3GB</totalSizeCap>
</rollingPolicy>
```
