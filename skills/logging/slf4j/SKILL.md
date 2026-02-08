---
name: slf4j
description: |
  SLF4J - Simple Logging Facade for Java. Standard logging API that abstracts underlying
  implementation (Logback, Log4j2). Provides parameterized logging and MDC support.

  USE WHEN: user mentions "slf4j", "java logging api", "parameterized logging",
  asks about "how to log in Java", "logger facade", "MDC in java", "logging best practices java"

  DO NOT USE FOR: Logback configuration - use `logback` instead, Log4j2 configuration - use Log4j2 skill,
  Node.js logging - use `winston` or `pino` instead, Python logging - use `python-logging` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SLF4J - Quick Reference

## When to Use This Skill
- Standard logging API for Java
- Integration with Logback, Log4j2
- Java logging best practices

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `slf4j` for comprehensive documentation.

## Essential Patterns

### Logger Declaration
```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UserService {
    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    // Or with Lombok
    // @Slf4j on class
}
```

### Logging Levels
```java
log.trace("Detailed debug info: {}", details);
log.debug("Debug info for development");
log.info("Normal operation: user {} logged in", userId);
log.warn("Potential problem: {} retries remaining", retries);
log.error("Error occurred: {}", message, exception);
```

### Parameterized Logging
```java
// Good - lazy evaluation
log.debug("Processing order {} for user {}", orderId, userId);

// Avoid - always evaluates
log.debug("Processing order " + orderId + " for user " + userId);

// Multiple parameters
log.info("User {} performed {} on resource {}", userId, action, resourceId);
```

### Exception Logging
```java
try {
    processOrder(order);
} catch (OrderException e) {
    // Exception is always last parameter
    log.error("Failed to process order {}: {}", order.getId(), e.getMessage(), e);
}
```

### MDC (Mapped Diagnostic Context)
```java
import org.slf4j.MDC;

// Set context
MDC.put("requestId", requestId);
MDC.put("userId", userId);

try {
    // All logs in this scope will include requestId and userId
    log.info("Processing request");
} finally {
    MDC.clear();
}
```

### Conditional Logging
```java
if (log.isDebugEnabled()) {
    log.debug("Expensive computation result: {}", expensiveMethod());
}

// Better with lambdas (SLF4J 2.0+)
log.atDebug().log(() -> "Result: " + expensiveMethod());
```

### Fluent API (SLF4J 2.0+)
```java
log.atInfo()
   .addKeyValue("orderId", orderId)
   .addKeyValue("amount", amount)
   .log("Order processed successfully");
```

## When NOT to Use This Skill

- **Logging framework configuration**: Use `logback` or Log4j2 skills for XML/config
- **Performance tuning**: Configuration-level optimization is in implementation skills
- **Transport/appender setup**: That's implementation-specific (Logback/Log4j2)
- **Non-Java projects**: Use language-appropriate logging APIs
- **Direct implementation usage**: Always code to SLF4J API, not Logback/Log4j2 directly

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| String concatenation in logs | Always evaluated, performance hit | Use parameterized logging: `log.info("User {}", id)` |
| Logging without level check for expensive ops | Wastes CPU even when disabled | Use `if (log.isDebugEnabled())` before expensive calls |
| Catching exceptions without logging | Silent failures, hard to debug | Always log with `log.error("msg", exception)` |
| Not using MDC for request context | Loses correlation across logs | Use `MDC.put()` with try-finally |
| Using wrong log level | Too much noise or missing issues | Follow conventions: ERROR=requires action, WARN=potential issue |
| Logging sensitive data | Security/compliance violation | Mask PII, passwords, tokens before logging |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| NoClassDefFoundError: StaticLoggerBinder | No SLF4J implementation on classpath | Add Logback or Log4j2 dependency |
| Multiple bindings warning | Multiple SLF4J implementations | Keep only one: Logback OR Log4j2 |
| Logs not appearing | Wrong log level | Check implementation config (logback.xml) |
| Parameters not replaced | Wrong placeholder syntax | Use `{}` not `%s` or other formats |
| MDC values empty | MDC cleared or wrong thread | Ensure MDC.put() before logging, clear in finally |
| Exception stack trace missing | Exception not last parameter | Put exception as last param: `log.error("msg", e)` |
