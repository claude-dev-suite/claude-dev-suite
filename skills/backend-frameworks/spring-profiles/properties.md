# Property Sources & External Configuration

## Property Sources

### Precedence Order (from highest to lowest)

1. Command line arguments (`--server.port=8080`)
2. SPRING_APPLICATION_JSON
3. ServletConfig/ServletContext init parameters
4. JNDI attributes
5. Java System properties (`-Dserver.port=8080`)
6. OS environment variables (`SERVER_PORT=8080`)
7. Random values (`${random.uuid}`)
8. Profile-specific application-{profile}.yml/properties (outside jar)
9. Profile-specific application-{profile}.yml/properties (inside jar)
10. application.yml/properties (outside jar)
11. application.yml/properties (inside jar)
12. @PropertySource on @Configuration classes
13. Default properties (SpringApplication.setDefaultProperties)

### Custom Property Source

```java
@Configuration
@PropertySource("classpath:custom.properties")
@PropertySource(value = "file:/etc/myapp/config.properties", ignoreResourceNotFound = true)
public class PropertyConfig {}

// Property Source with profile
@Configuration
@PropertySource("classpath:config-${spring.profiles.active}.properties")
public class ProfilePropertyConfig {}

// YAML property source (requires custom factory)
@Configuration
@PropertySource(value = "classpath:custom.yml", factory = YamlPropertySourceFactory.class)
public class YamlConfig {}

public class YamlPropertySourceFactory implements PropertySourceFactory {
    @Override
    public PropertySource<?> createPropertySource(String name, EncodedResource resource) {
        YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
        factory.setResources(resource.getResource());
        Properties properties = factory.getObject();
        return new PropertiesPropertySource(
            resource.getResource().getFilename(),
            properties
        );
    }
}
```

### Environment Access

```java
@Component
@RequiredArgsConstructor
public class EnvironmentReader {

    private final Environment environment;

    public void readProperties() {
        // Single property
        String port = environment.getProperty("server.port");

        // With default
        String name = environment.getProperty("app.name", "DefaultApp");

        // Type conversion
        Integer timeout = environment.getProperty("app.timeout", Integer.class, 30);

        // Required property
        String required = environment.getRequiredProperty("app.secret");

        // Check profile
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            // Production logic
        }

        // Check property exists
        if (environment.containsProperty("feature.enabled")) {
            // Feature flag
        }
    }
}
```

---

## Profile-Specific Configuration Files

### File Structure

```
src/main/resources/
├── application.yml              # Common configuration
├── application-dev.yml          # Local development
├── application-test.yml         # Automated tests
├── application-staging.yml      # Staging
├── application-prod.yml         # Production
├── application-docker.yml       # Docker
└── application-kubernetes.yml   # Kubernetes
```

### application.yml (common)

```yaml
spring:
  application:
    name: my-service

app:
  name: ${spring.application.name}
  version: @project.version@

server:
  servlet:
    context-path: /api

logging:
  level:
    root: INFO
```

### application-dev.yml

```yaml
spring:
  config:
    activate:
      on-profile: dev

  datasource:
    url: jdbc:h2:mem:devdb
    driver-class-name: org.h2.Driver

  h2:
    console:
      enabled: true

  jpa:
    show-sql: true
    hibernate:
      ddl-auto: create-drop

logging:
  level:
    com.myapp: DEBUG
    org.springframework.web: DEBUG
    org.hibernate.SQL: DEBUG

server:
  port: 8080

app:
  security:
    jwt-secret: dev-secret-key-not-for-production
```

### application-prod.yml

```yaml
spring:
  config:
    activate:
      on-profile: prod

  datasource:
    url: ${DATABASE_URL}
    username: ${DATABASE_USER}
    password: ${DATABASE_PASSWORD}
    hikari:
      minimum-idle: 5
      maximum-pool-size: 20
      idle-timeout: 30000
      connection-timeout: 20000

  jpa:
    show-sql: false
    hibernate:
      ddl-auto: validate
    open-in-view: false

logging:
  level:
    root: WARN
    com.myapp: INFO

server:
  port: ${PORT:8080}
  compression:
    enabled: true
  tomcat:
    max-threads: 200

app:
  security:
    jwt-secret: ${JWT_SECRET}
    jwt-expiration: ${JWT_EXPIRATION:86400}
```

### application-kubernetes.yml

```yaml
spring:
  config:
    activate:
      on-profile: kubernetes

  datasource:
    url: jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true
      group:
        liveness:
          include: livenessState
        readiness:
          include: readinessState,db

server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

---

## External Configuration

### Configuration from Config Server

```yaml
# bootstrap.yml
spring:
  application:
    name: my-service
  cloud:
    config:
      uri: http://config-server:8888
      fail-fast: true
      retry:
        max-attempts: 10
        initial-interval: 1000
```

### Configuration from Kubernetes ConfigMap/Secret

```yaml
# application-kubernetes.yml
spring:
  config:
    import:
      - optional:configtree:/etc/config/
      - optional:configtree:/etc/secrets/
```

```yaml
# Kubernetes ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
data:
  APP_NAME: my-service
  LOG_LEVEL: INFO
---
# Kubernetes Secret
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secrets
type: Opaque
stringData:
  DB_PASSWORD: supersecret
  JWT_SECRET: jwt-secret-key
```

### Configuration from AWS Parameter Store

```yaml
spring:
  config:
    import: aws-parameterstore:/config/myapp/

aws:
  paramstore:
    enabled: true
    prefix: /config
    name: myapp
```

### Configuration from HashiCorp Vault

```yaml
spring:
  cloud:
    vault:
      uri: https://vault.example.com
      authentication: TOKEN
      token: ${VAULT_TOKEN}
      kv:
        enabled: true
        backend: secret
        default-context: my-app
```
