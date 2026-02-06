---
name: spring-profiles
description: |
  Configuration and profiles management in Spring Boot 3.x. Covers @Profile,
  @ConfigurationProperties, property sources, YAML/properties, external
  configuration, secrets management, and environment-specific beans.

  USE WHEN: user mentions "spring profiles", "@Profile", "@ConfigurationProperties",
  "environment configuration", "property sources", "profile groups", "conditional beans"

  DO NOT USE FOR: feature flags at runtime - consider feature flag libraries,
  Spring Cloud Config - use `spring-cloud-config` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Profiles & Configuration

## Quick Start

```java
@Configuration
@Profile("dev")
public class DevConfig {
    @Bean
    public DataSource dataSource() {
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .build();
    }
}

@Configuration
@Profile("prod")
public class ProdConfig {
    @Bean
    public DataSource dataSource() {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(System.getenv("DATABASE_URL"));
        return ds;
    }
}
```

---

## Profile Activation

```yaml
# 1. application.yml
spring:
  profiles:
    active: dev

# 2. Environment variable: SPRING_PROFILES_ACTIVE=prod
# 3. Command line: java -jar app.jar --spring.profiles.active=prod
# 4. JVM property: java -Dspring.profiles.active=prod -jar app.jar
```

### Profile Groups

```yaml
spring:
  profiles:
    active: production
    group:
      production:
        - prod
        - prod-db
        - prod-security
      development:
        - dev
        - dev-db
        - dev-tools
```

### Profile Expression

```java
@Profile("cloud & kubernetes")  // AND
@Profile("dev | test")          // OR
@Profile("!prod")               // NOT
@Profile("(dev | test) & !integration")  // Combined
```

---

## @ConfigurationProperties

```java
@ConfigurationProperties(prefix = "app")
@Validated
public class AppProperties {

    @NotBlank
    private String name;

    @NotNull
    private String version;

    private final Security security = new Security();

    @Validated
    public static class Security {
        @NotBlank
        private String jwtSecret;

        @Min(3600)
        private long jwtExpiration = 86400;

        @NotEmpty
        private List<String> allowedOrigins = new ArrayList<>();
    }

    // Getters and setters
}

// Abilitazione
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class AppConfig {}
```

```yaml
app:
  name: MyApplication
  version: 1.0.0
  security:
    jwt-secret: ${JWT_SECRET}
    jwt-expiration: 86400
    allowed-origins:
      - https://example.com
```

### Immutable Configuration (Record)

```java
@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(
    @NotBlank String host,
    @Min(1) @Max(65535) int port,
    String username,
    @DefaultValue("false") boolean starttls
) {}
```

> **Full Reference**: See [properties.md](properties.md) for Property Sources, External Configuration (Config Server, K8s, Vault).

---

## Conditional Beans

```java
@Bean
@ConditionalOnProperty(name = "feature.email.enabled", havingValue = "true")
public EmailService emailService() {
    return new RealEmailService();
}

@Bean
@Profile("dev")
public CacheManager devCacheManager() {
    return new ConcurrentMapCacheManager();
}

@Bean
@ConditionalOnMissingBean(UserService.class)
public UserService defaultUserService() {
    return new DefaultUserService();
}
```

> **Full Reference**: See [conditional.md](conditional.md) for Custom Conditions, Validation, Testing.

---

## Secrets Management

```yaml
spring:
  datasource:
    password: ${DB_PASSWORD}

app:
  security:
    jwt-secret: ${JWT_SECRET}
```

> **Full Reference**: See [secrets.md](secrets.md) for Jasypt Encryption, Vault Integration.

---

## Best Practices

| Do | Don't |
|----|-------|
| Use @ConfigurationProperties for structured config | Use @Value for complex config |
| Validate properties with Bean Validation | Skip validation |
| Use profile groups for complex environments | Duplicate configuration |
| Externalize all secrets | Commit secrets to repository |
| Use sensible default values | Require all properties |

---

## Production Checklist

- [ ] Secrets externalized (env vars, Vault)
- [ ] Profiles configured for each environment
- [ ] Validation enabled on all properties
- [ ] Default values for optional properties
- [ ] Profile groups for related config
- [ ] Configuration encrypted where needed

---

## When NOT to Use This Skill

- **Runtime feature flags** - Consider LaunchDarkly, Flipt
- **Centralized config** - Use `spring-cloud-config` skill
- **Secrets only** - Consider HashiCorp Vault directly

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Secrets in git | Security vulnerability | Use env vars or secrets manager |
| Wrong prefix | Properties not loaded | Verify prefix matches YAML |
| Missing @Validated | Validation ignored | Add @Validated annotation |
| @Value for complex config | Unmaintainable | Use @ConfigurationProperties |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Properties not loaded | Check prefix | Verify @ConfigurationProperties prefix |
| Profile not active | Check logs at startup | Set spring.profiles.active |
| Binding failed | Check type | Use correct types (Duration, etc.) |
| Env var not resolved | Check naming | Use UPPER_SNAKE_CASE |

---

## Reference Files

| File | Content |
|------|---------|
| [properties.md](properties.md) | Property Sources, External Configuration |
| [conditional.md](conditional.md) | Conditional Beans, Validation, Testing |
| [secrets.md](secrets.md) | Secrets Management, Encryption |

---

## External Documentation

- [Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html)
