---
name: logback
description: |
  Logback - flexible and powerful logging framework for Java and Spring Boot applications.
  Successor to Log4j with native SLF4J support, async logging, and automatic file rotation.

  USE WHEN: user mentions "logback", "spring boot logging", "java logging configuration",
  asks about "logback-spring.xml", "rolling file appender", "async logging in java"

  DO NOT USE FOR: SLF4J API usage - use `slf4j` instead, Log4j2 - use separate Log4j2 skill,
  Node.js logging - use `winston` or `pino` instead, Python logging - use `python-logging` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Logback - Quick Reference

## When to Use This Skill
- Configure logging in Spring Boot/Java applications
- File appender with rotation
- High-performance async logging

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `logback` for comprehensive documentation.

## Configuration

### logback-spring.xml (Spring Boot)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <property name="LOG_PATH" value="${LOG_PATH:-logs}"/>
    <property name="LOG_FILE" value="${LOG_FILE:-app}"/>

    <!-- Console Appender -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%clr(%d{yyyy-MM-dd HH:mm:ss.SSS}){faint} %clr(${LOG_LEVEL_PATTERN:-%5p}) %clr(${PID:- }){magenta} %clr(---){faint} %clr([%15.15t]){faint} %clr(%-40.40logger{39}){cyan} %clr(:){faint} %m%n${LOG_EXCEPTION_CONVERSION_WORD:-%wEx}</pattern>
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
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- Async Appender -->
    <appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
        <appender-ref ref="FILE"/>
        <queueSize>512</queueSize>
        <discardingThreshold>0</discardingThreshold>
    </appender>

    <!-- Logger Configuration -->
    <logger name="com.myapp" level="DEBUG"/>
    <logger name="org.springframework" level="INFO"/>
    <logger name="org.hibernate.SQL" level="DEBUG"/>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="ASYNC"/>
    </root>

    <!-- Profile-specific -->
    <springProfile name="prod">
        <root level="WARN">
            <appender-ref ref="ASYNC"/>
        </root>
    </springProfile>
</configuration>
```

### JSON Format (ELK Stack)
```xml
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>requestId</includeMdcKeyName>
        <includeMdcKeyName>userId</includeMdcKeyName>
    </encoder>
</appender>
```

## MDC Usage
```java
import org.slf4j.MDC;

MDC.put("requestId", UUID.randomUUID().toString());
MDC.put("userId", user.getId());
try {
    // Business logic
} finally {
    MDC.clear();
}
```

## When NOT to Use This Skill

- **SLF4J API questions**: Focus on API usage, not Logback implementation details
- **Log4j2 configuration**: Different XML structure and features
- **Application code logging**: Use SLF4J API, Logback is just the implementation
- **Non-Java projects**: Use language-appropriate logging frameworks
- **Simple console output**: System.out may be sufficient for basic scripts

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Synchronous file appender in high-traffic | Blocks application threads | Use `AsyncAppender` wrapper |
| No rolling policy | Logs fill disk space | Use `RollingFileAppender` with size/time policies |
| Logging to console in production | Performance overhead, lost logs | Use file appenders, ship to centralized logging |
| DEBUG level in production | Performance impact, disk usage | Use INFO or WARN in production profiles |
| Not clearing MDC | Memory leaks, wrong context in threads | Always clear MDC in finally block |
| Hardcoded log paths | Breaks across environments | Use properties: `${LOG_PATH}` |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Configuration not loaded | Wrong file name/location | Use `logback-spring.xml` in src/main/resources |
| Logs not rotating | Missing rolling policy | Add `SizeAndTimeBasedRollingPolicy` |
| Performance degradation | Synchronous appenders | Wrap with `AsyncAppender` |
| MDC values not appearing | Pattern missing MDC placeholders | Add `%X{key}` to pattern |
| Duplicate log entries | Logger additivity enabled | Set `additivity="false"` on logger |
| Profile-specific config ignored | Using logback.xml instead | Rename to `logback-spring.xml` for Spring profiles |
