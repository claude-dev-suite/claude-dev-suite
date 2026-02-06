---
name: spring-aop
description: |
  Spring AOP (Aspect-Oriented Programming) per Spring Boot 3.x. Copre @Aspect,
  pointcut expressions, @Around/@Before/@After advice, custom annotations,
  logging, security, caching, e transaction patterns. Usa per cross-cutting
  concerns.

  USE WHEN: user mentions "aspect", "AOP", "cross-cutting", "logging aspect", "pointcut", asks about "how to intercept methods", "apply logic to multiple methods", "@Around advice"

  DO NOT USE FOR: security configuration - use `spring-security` instead, transaction management - use `spring-data-jpa` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring AOP

> **Full Reference**: See [patterns.md](patterns.md) for Performance Monitoring, Retry Logic, Audit Logging, Security Check, Rate Limiting, and Testing patterns.

## Quick Start

```java
@SpringBootApplication
@EnableAspectJAutoProxy
public class Application {}

@Aspect
@Component
@Slf4j
public class LoggingAspect {

    @Around("execution(* com.example.service.*.*(..))")
    public Object logExecution(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = joinPoint.getSignature().toShortString();
        log.info("Executing: {}", method);

        long start = System.currentTimeMillis();
        Object result = joinPoint.proceed();
        long duration = System.currentTimeMillis() - start;

        log.info("Completed: {} in {} ms", method, duration);
        return result;
    }
}
```

---

## Pointcut Expressions

### Method Execution

```java
@Aspect
@Component
public class PointcutExamples {

    // All methods in a package
    @Pointcut("execution(* com.example.service.*.*(..))")
    public void serviceLayer() {}

    // Public methods
    @Pointcut("execution(public * *(..))")
    public void publicMethods() {}

    // Methods starting with "get"
    @Pointcut("execution(* get*(..))")
    public void getters() {}

    // Package and subpackages
    @Pointcut("execution(* com.example..*.*(..))")
    public void entireApplication() {}
}
```

### Annotation-Based

```java
@Aspect
@Component
public class AnnotationPointcuts {

    // Methods annotated with @Transactional
    @Pointcut("@annotation(org.springframework.transaction.annotation.Transactional)")
    public void transactionalMethods() {}

    // Classes annotated with @Service
    @Pointcut("@within(org.springframework.stereotype.Service)")
    public void serviceBeans() {}

    // With annotation binding
    @Around("@annotation(loggable)")
    public Object logWithAnnotation(ProceedingJoinPoint pjp, Loggable loggable) throws Throwable {
        String value = loggable.value();
        return pjp.proceed();
    }
}
```

### Combinations

```java
@Aspect
@Component
public class CombinedPointcuts {

    @Pointcut("execution(* com.example.service.*.*(..))")
    public void serviceLayer() {}

    @Pointcut("execution(* com.example.repository.*.*(..))")
    public void repositoryLayer() {}

    // AND
    @Pointcut("serviceLayer() && publicMethods()")
    public void publicServiceMethods() {}

    // OR
    @Pointcut("serviceLayer() || repositoryLayer()")
    public void dataLayer() {}

    // NOT
    @Pointcut("serviceLayer() && !execution(* get*(..))")
    public void nonGetterServiceMethods() {}
}
```

---

## Advice Types

### @Around

```java
@Aspect
@Component
public class AroundAdvice {

    @Around("execution(* com.example.service.*.*(..))")
    public Object aroundAdvice(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();

        log.info("Before: {} with args: {}", methodName, Arrays.toString(args));

        try {
            Object result = joinPoint.proceed();
            log.info("After returning: {} returned: {}", methodName, result);
            return result;
        } catch (Exception e) {
            log.error("After throwing: {} threw: {}", methodName, e.getMessage());
            throw e;
        }
    }

    // Modify arguments
    @Around("execution(* com.example.service.UserService.createUser(..))")
    public Object sanitizeInput(ProceedingJoinPoint joinPoint) throws Throwable {
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < args.length; i++) {
            if (args[i] instanceof String str) {
                args[i] = sanitize(str);
            }
        }
        return joinPoint.proceed(args);
    }
}
```

### @Before, @After, @AfterReturning, @AfterThrowing

```java
@Aspect
@Component
public class OtherAdvice {

    @Before("execution(* com.example.service.*.*(..))")
    public void logBefore(JoinPoint joinPoint) {
        log.info("Entering: {}", joinPoint.getSignature().toShortString());
    }

    @After("execution(* com.example.service.*.*(..))")
    public void logAfter(JoinPoint joinPoint) {
        log.info("Completed: {}", joinPoint.getSignature().toShortString());
    }

    @AfterReturning(pointcut = "execution(* com.example.service.UserService.createUser(..))", returning = "user")
    public void logCreatedUser(JoinPoint joinPoint, User user) {
        log.info("Created user: {}", user.getId());
    }

    @AfterThrowing(pointcut = "execution(* com.example.service.*.*(..))", throwing = "ex")
    public void logException(JoinPoint joinPoint, Exception ex) {
        log.error("Exception in {}: {}", joinPoint.getSignature().toShortString(), ex.getMessage());
    }
}
```

---

## Custom Annotations

```java
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface Loggable {
    String value() default "";
    boolean logArgs() default true;
    boolean logResult() default true;
    LogLevel level() default LogLevel.INFO;
}

@Aspect
@Component
@Slf4j
public class LoggableAspect {

    @Around("@annotation(loggable)")
    public Object logMethod(ProceedingJoinPoint joinPoint, Loggable loggable) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        String message = loggable.value().isEmpty() ? methodName : loggable.value();

        if (loggable.logArgs()) {
            log.info("Entering {} with args: {}", message, Arrays.toString(joinPoint.getArgs()));
        }

        long start = System.currentTimeMillis();
        Object result = joinPoint.proceed();

        if (loggable.logResult()) {
            log.info("Exiting {} with result: {} ({}ms)", message, result, System.currentTimeMillis() - start);
        }
        return result;
    }
}

// Usage
@Service
public class UserService {
    @Loggable(value = "Creating user", logResult = false)
    public User createUser(CreateUserRequest request) {
        return userRepository.save(new User(request));
    }
}
```

---

## Aspect Ordering

```java
@Aspect
@Component
@Order(1)  // Executes first
public class SecurityAspect { }

@Aspect
@Component
@Order(2)  // Executes second
public class LoggingAspect { }

@Aspect
@Component
@Order(3)  // Executes third
public class PerformanceAspect { }
```

---

## Best Practices

- Use specific pointcuts (not too broad)
- Order aspects with @Order
- Use custom annotations for clarity
- Avoid complex logic in aspects
- Monitor performance impact
- Test aspects in isolation
- Don't catch exceptions silently
- Don't modify shared state
- Don't use for core business logic

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| Aspect not applied | Bean not Spring-managed | Use @Component or @Bean |
| Self-invocation | Internal call bypasses proxy | Use self-injection |
| Wrong order | Aspects not ordered | Use @Order |
| Performance | Aspect too broad | Narrow pointcut |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Aspect not executing | Bean not Spring-managed | Ensure class has @Component |
| Self-invocation doesn't trigger | Internal call bypasses proxy | Use self-injection |
| Wrong execution order | Missing @Order | Add @Order with priority |
| Performance degradation | Pointcut too broad | Narrow scope, use custom annotations |

## Reference Documentation

- [Spring AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [AspectJ Pointcut Expressions](https://www.eclipse.org/aspectj/doc/released/progguide/semantics-pointcuts.html)
