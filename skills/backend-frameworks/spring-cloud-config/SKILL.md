---
name: spring-cloud-config
description: |
  Spring Cloud Config for centralized configuration management in microservices.
  Covers Config Server, Config Client, Git backend, and dynamic refresh.

  USE WHEN: user mentions "spring cloud config", "config server",
  "centralized configuration", "@RefreshScope", "externalized config"

  DO NOT USE FOR: simple properties files - use standard Spring Boot,
  secrets management - combine with Vault
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Config - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-config` for comprehensive documentation.

## Config Server Setup

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-config-server</artifactId>
</dependency>
```

### Main Application
```java
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

### application.yml (Server)
```yaml
server:
  port: 8888

spring:
  application:
    name: config-server

  cloud:
    config:
      server:
        git:
          uri: https://github.com/myorg/config-repo
          default-label: main
          search-paths: '{application}'
          clone-on-start: true
          timeout: 10
          # For private repos
          username: ${GIT_USERNAME}
          password: ${GIT_TOKEN}

        # Multiple repositories
        # git:
        #   uri: https://github.com/myorg/default-config
        #   repos:
        #     user-service:
        #       pattern: user-*
        #       uri: https://github.com/myorg/user-config

# Security
management:
  endpoints:
    web:
      exposure:
        include: health,refresh
```

### Native Filesystem Backend
```yaml
spring:
  profiles:
    active: native
  cloud:
    config:
      server:
        native:
          search-locations:
            - classpath:/config
            - file:///config-repo
```

## Config Client Setup

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-config</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

### application.yml (Client)
```yaml
spring:
  application:
    name: user-service
  config:
    import: optional:configserver:http://localhost:8888

  cloud:
    config:
      fail-fast: true
      retry:
        initial-interval: 1000
        max-interval: 2000
        max-attempts: 6
        multiplier: 1.1
      label: main  # Git branch

# For service discovery
# spring:
#   config:
#     import: optional:configserver:
#   cloud:
#     config:
#       discovery:
#         enabled: true
#         service-id: config-server
```

## Config Repository Structure

```
config-repo/
├── application.yml           # Shared by all apps
├── application-dev.yml       # Shared dev profile
├── application-prod.yml      # Shared prod profile
├── user-service.yml          # user-service defaults
├── user-service-dev.yml      # user-service dev
├── user-service-prod.yml     # user-service prod
├── order-service.yml
└── order-service-prod.yml
```

### Example: user-service.yml
```yaml
# Base configuration
server:
  port: 8081

app:
  name: User Service
  feature-flags:
    new-dashboard: false
    beta-features: false

database:
  pool-size: 10
  timeout: 5000
```

### Example: user-service-prod.yml
```yaml
# Production overrides
server:
  port: 80

app:
  feature-flags:
    new-dashboard: true

database:
  pool-size: 50
  timeout: 3000
```

## Accessing Configuration

### REST Endpoints
```bash
# Get configuration
GET http://localhost:8888/{application}/{profile}
GET http://localhost:8888/{application}/{profile}/{label}

# Examples
GET http://localhost:8888/user-service/default
GET http://localhost:8888/user-service/prod
GET http://localhost:8888/user-service/prod/main

# Get specific file
GET http://localhost:8888/{application}/{profile}/{label}/{filename}
```

## Dynamic Refresh

### Enable Refresh
```yaml
management:
  endpoints:
    web:
      exposure:
        include: refresh,health,info
```

### @RefreshScope
```java
@RestController
@RefreshScope
public class ConfigController {

    @Value("${app.feature-flags.new-dashboard}")
    private boolean newDashboard;

    @Value("${app.name}")
    private String appName;

    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        return Map.of(
            "appName", appName,
            "newDashboard", newDashboard
        );
    }
}

@Configuration
@RefreshScope
@ConfigurationProperties(prefix = "app")
public class AppConfig {
    private String name;
    private Map<String, Boolean> featureFlags;
    // getters, setters
}
```

### Trigger Refresh
```bash
# Single service
POST http://localhost:8081/actuator/refresh

# Response: changed properties
["app.feature-flags.new-dashboard", "app.name"]
```

## Spring Cloud Bus (Broadcast Refresh)

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-amqp</artifactId>
</dependency>
<!-- or Kafka -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-kafka</artifactId>
</dependency>
```

### Configuration
```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

management:
  endpoints:
    web:
      exposure:
        include: busrefresh
```

### Broadcast Refresh
```bash
# Refresh all instances
POST http://localhost:8888/actuator/busrefresh

# Refresh specific service
POST http://localhost:8888/actuator/busrefresh/user-service:**
```

## Encryption/Decryption

### Setup
```yaml
# Config Server
encrypt:
  key: ${ENCRYPT_KEY}  # Symmetric key

# Or asymmetric
encrypt:
  key-store:
    location: classpath:/server.jks
    password: ${KEYSTORE_PASSWORD}
    alias: configkey
```

### Encrypt Values
```bash
# Encrypt a value
POST http://localhost:8888/encrypt -d "mysecret"
# Returns: AQA...encrypted...

# Decrypt
POST http://localhost:8888/decrypt -d "AQA...encrypted..."
```

### Use in Config
```yaml
# In config repo
spring:
  datasource:
    password: '{cipher}AQA...encrypted...'

database:
  api-key: '{cipher}AQB...encrypted...'
```

## Health Check

```java
@Configuration
public class ConfigHealthConfig {

    @Bean
    public HealthIndicator configServerHealthIndicator(ConfigClientProperties props) {
        return () -> {
            try {
                // Check config server connectivity
                return Health.up()
                    .withDetail("configServer", props.getUri())
                    .build();
            } catch (Exception e) {
                return Health.down()
                    .withException(e)
                    .build();
            }
        };
    }
}
```

## Vault Backend

```yaml
spring:
  cloud:
    config:
      server:
        vault:
          host: localhost
          port: 8200
          scheme: https
          backend: secret
          default-key: application
          profile-separator: /
          kv-version: 2
          authentication: TOKEN
          token: ${VAULT_TOKEN}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use Git for version control | Store configs locally only |
| Encrypt sensitive values | Store passwords in plain text |
| Use profile-specific configs | Mix environments in one file |
| Enable fail-fast in production | Ignore config server failures |
| Use @RefreshScope sparingly | Refresh-scope everything |

## Production Checklist

- [ ] Config server highly available
- [ ] Git repo secured
- [ ] Sensitive values encrypted
- [ ] Retry configuration set
- [ ] fail-fast enabled
- [ ] Health checks configured
- [ ] Spring Cloud Bus for broadcast
- [ ] Actuator endpoints secured
- [ ] Label (branch) strategy defined
- [ ] Webhook for auto-refresh

## When NOT to Use This Skill

- **Single application** - Use standard Spring Boot properties
- **Kubernetes** - Use ConfigMaps, Secrets
- **Secrets only** - Use Vault, AWS Secrets Manager
- **Simple setup** - Overhead may not be justified

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Secrets in Git | Security vulnerability | Use encrypt or Vault |
| No fail-fast | App starts with wrong config | Enable spring.cloud.config.fail-fast |
| Missing @RefreshScope | Config changes need restart | Add annotation to beans |
| Polling config server | High load | Use webhook-based refresh |
| No backup config | Config server down = app down | Configure fallback |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Config not loading | Check config server logs | Verify profile, label |
| Refresh not working | Check @RefreshScope | Add annotation, POST /actuator/refresh |
| Wrong environment | Check spring.profiles.active | Set correct profile |
| Git auth failing | Check credentials | Configure correct auth |
| Encryption not working | Check encrypt.key | Set encryption key |

## Reference Documentation
- [Spring Cloud Config Reference](https://docs.spring.io/spring-cloud-config/reference/)
