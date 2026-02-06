---
name: java-logging
description: |
  Java logging with SLF4J facade, Logback, and Log4j2 implementations.
  Covers configuration, log levels, structured logging, async logging,
  and production best practices for Spring Boot applications.

  USE WHEN: user mentions "java logging", "spring boot logging", "slf4j setup",
  asks about "how to log in java", "logback vs log4j2", "java logging best practices"

  DO NOT USE FOR: Node.js logging - use `nodejs-logging` instead, Python logging - use `python-logging`,
  Kotlin-specific logging - similar but has nuances
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Java Logging

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Code                         │
│              (uses SLF4J API only)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SLF4J Facade                           │
│              (abstraction layer)                            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ Logback  │   │ Log4j2   │   │ java.util    │
        │          │   │          │   │ .logging     │
        └──────────┘   └──────────┘   └──────────────┘
```

**Rule**: Always code to SLF4J API. Implementation is a runtime dependency.

## SLF4J API Usage

### Basic Logging

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UserService {
    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    public User findUser(Long id) {
        log.debug("Finding user with id: {}", id);

        try {
            User user = repository.findById(id);
            log.info("User found: {}", user.getEmail());
            return user;
        } catch (Exception e) {
            log.error("Failed to find user with id: {}", id, e);
            throw e;
        }
    }
}
```

### With Lombok

```java
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class OrderService {
    public void processOrder(Order order) {
        log.info("Processing order: {}", order.getId());
    }
}
```

### Log Levels

| Level | Purpose | Example |
|-------|---------|---------|
| `TRACE` | Very detailed debugging | Loop iterations, variable values |
| `DEBUG` | Debugging information | Method entry/exit, query params |
| `INFO` | Business events | User login, order placed |
| `WARN` | Potential issues | Deprecated API used, retry attempt |
| `ERROR` | Errors requiring attention | Exception caught, operation failed |

```java
log.trace("Entering loop iteration {}", i);
log.debug("Query parameters: userId={}, status={}", userId, status);
log.info("Order {} placed successfully", orderId);
log.warn("Payment retry attempt {} of {}", attempt, maxRetries);
log.error("Failed to process payment for order {}", orderId, exception);
```

### Parameterized Messages (Best Practice)

```java
// GOOD - uses parameterized logging (efficient)
log.debug("Processing user {} with role {}", userId, role);

// BAD - string concatenation (always evaluated)
log.debug("Processing user " + userId + " with role " + role);

// For expensive operations, use isEnabled check
if (log.isDebugEnabled()) {
    log.debug("Complex data: {}", computeExpensiveDebugInfo());
}
```

## Logback Configuration

### Spring Boot (logback-spring.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- Include Spring Boot defaults -->
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <!-- Properties -->
    <property name="LOG_PATH" value="${LOG_PATH:-logs}"/>
    <property name="LOG_FILE" value="${LOG_FILE:-application}"/>

    <!-- Console Appender -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %highlight(%-5level) [%thread] %cyan(%logger{36}) - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- Rolling File Appender -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/${LOG_FILE}.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/${LOG_FILE}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
            <totalSizeCap>3GB</totalSizeCap>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n</pattern>
            <charset>UTF-8</charset>
        </encoder>
    </appender>

    <!-- JSON Appender for Production -->
    <appender name="JSON" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/${LOG_FILE}-json.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/${LOG_FILE}-json.%d{yyyy-MM-dd}.log.gz</fileNamePattern>
            <maxHistory>7</maxHistory>
        </rollingPolicy>
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <includeMdcKeyName>traceId</includeMdcKeyName>
            <includeMdcKeyName>userId</includeMdcKeyName>
        </encoder>
    </appender>

    <!-- Async Appender for Performance -->
    <appender name="ASYNC_FILE" class="ch.qos.logback.classic.AsyncAppender">
        <queueSize>512</queueSize>
        <discardingThreshold>0</discardingThreshold>
        <appender-ref ref="FILE"/>
    </appender>

    <!-- Logger Configuration -->
    <logger name="com.yourcompany" level="DEBUG"/>
    <logger name="org.springframework" level="INFO"/>
    <logger name="org.hibernate.SQL" level="DEBUG"/>
    <logger name="org.hibernate.type.descriptor.sql" level="TRACE"/>

    <!-- Root Logger -->
    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="ASYNC_FILE"/>
    </root>

    <!-- Profile-specific configuration -->
    <springProfile name="prod">
        <root level="INFO">
            <appender-ref ref="JSON"/>
        </root>
    </springProfile>
</configuration>
```

### application.yml Configuration

```yaml
logging:
  level:
    root: INFO
    com.yourcompany: DEBUG
    org.springframework.web: INFO
    org.hibernate.SQL: DEBUG
  pattern:
    console: "%d{HH:mm:ss.SSS} %highlight(%-5level) [%thread] %cyan(%logger{36}) - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n"
  file:
    name: logs/application.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30
```

## Log4j2 Configuration

### log4j2-spring.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Properties>
        <Property name="LOG_PATH">logs</Property>
        <Property name="LOG_PATTERN">%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n</Property>
    </Properties>

    <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="${LOG_PATTERN}"/>
        </Console>

        <RollingFile name="File" fileName="${LOG_PATH}/app.log"
                     filePattern="${LOG_PATH}/app-%d{yyyy-MM-dd}-%i.log.gz">
            <PatternLayout pattern="${LOG_PATTERN}"/>
            <Policies>
                <SizeBasedTriggeringPolicy size="100MB"/>
                <TimeBasedTriggeringPolicy/>
            </Policies>
            <DefaultRolloverStrategy max="30"/>
        </RollingFile>

        <!-- Async for high performance -->
        <Async name="AsyncFile">
            <AppenderRef ref="File"/>
        </Async>
    </Appenders>

    <Loggers>
        <Logger name="com.yourcompany" level="debug"/>
        <Root level="info">
            <AppenderRef ref="Console"/>
            <AppenderRef ref="AsyncFile"/>
        </Root>
    </Loggers>
</Configuration>
```

## Structured Logging (JSON)

### Dependencies

```xml
<!-- For Logback -->
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

### MDC (Mapped Diagnostic Context)

```java
import org.slf4j.MDC;

@Component
public class RequestLoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) {
        try {
            MDC.put("traceId", generateTraceId());
            MDC.put("userId", getCurrentUserId());
            MDC.put("requestPath", ((HttpServletRequest) request).getRequestURI());

            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

### Structured Log Output

```java
import static net.logstash.logback.argument.StructuredArguments.*;

log.info("Order processed",
    kv("orderId", order.getId()),
    kv("customerId", order.getCustomerId()),
    kv("amount", order.getTotal()),
    kv("currency", "USD"));
```

Output:
```json
{
  "@timestamp": "2025-01-15T10:30:00.000Z",
  "level": "INFO",
  "logger": "com.example.OrderService",
  "message": "Order processed",
  "orderId": "ORD-12345",
  "customerId": "CUST-789",
  "amount": 99.99,
  "currency": "USD",
  "traceId": "abc123",
  "userId": "user456"
}
```

## Best Practices

### DO

- Use SLF4J API everywhere
- Use parameterized messages `log.info("User {}", userId)`
- Include correlation IDs (traceId, requestId)
- Log at appropriate levels
- Use async appenders in production
- Configure log rotation
- Use JSON format for log aggregation

### DON'T

- Don't use string concatenation in log messages
- Don't log sensitive data (passwords, tokens, PII)
- Don't log inside tight loops without level check
- Don't use System.out.println for logging
- Don't catch and swallow exceptions silently

### Security

```java
// BAD - logs sensitive data
log.info("User login: email={}, password={}", email, password);

// GOOD - mask sensitive data
log.info("User login: email={}", maskEmail(email));

// Helper
private String maskEmail(String email) {
    int atIndex = email.indexOf('@');
    if (atIndex > 2) {
        return email.substring(0, 2) + "***" + email.substring(atIndex);
    }
    return "***";
}
```

## When NOT to Use This Skill

- **SLF4J API-only questions**: Use `slf4j` skill for API usage patterns
- **Logback configuration details**: Use `logback` skill for XML config
- **Node.js/Python projects**: Use language-appropriate logging skills
- **Application code patterns**: Focus on SLF4J API, not implementation
- **Framework migration**: Consult migration-specific guides

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using System.out.println | No control, no persistence, no filtering | Use SLF4J logger |
| String concatenation in logs | Always evaluated, performance hit | Use parameterized logging: `log.info("User {}", id)` |
| Not using async appenders in production | Blocks application threads | Wrap with AsyncAppender |
| Logging without MDC in multi-threaded apps | Loses request context | Use MDC for correlation IDs |
| DEBUG level in production | Performance impact, disk usage | Use INFO or WARN in production |
| Not masking sensitive data | Security/compliance violation | Filter passwords, tokens, PII before logging |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| NoClassDefFoundError: StaticLoggerBinder | Missing SLF4J implementation | Add Logback or Log4j2 dependency |
| Multiple bindings warning | Multiple implementations on classpath | Keep only one: Logback OR Log4j2 |
| Logs not appearing | Wrong log level or missing config | Check logback.xml and log levels |
| Performance degradation | Synchronous appenders | Use AsyncAppender wrapper |
| Logs not rotating | Missing rolling policy | Configure RollingFileAppender |
| MDC values not showing | Pattern missing %X{key} | Add MDC placeholders to log pattern |

## Reference

- [Quick Reference: Log Levels](quick-ref/log-levels.md)
- [SLF4J Manual](https://www.slf4j.org/manual.html)
- [Logback Documentation](https://logback.qos.ch/documentation.html)
- [Log4j2 Documentation](https://logging.apache.org/log4j/2.x/)
