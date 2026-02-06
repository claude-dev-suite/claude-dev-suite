# Service Discovery & Config

## Eureka Server

```xml
<!-- pom.xml - Eureka Server -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
# application.yml - Eureka Server
server:
  port: 8761

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false  # Non registra se stesso
    fetch-registry: false
  server:
    enable-self-preservation: false  # Disabilita in dev
    eviction-interval-timer-in-ms: 5000
```

---

## Eureka Client

```xml
<!-- pom.xml - Eureka Client -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

```yaml
# application.yml - Service
spring:
  application:
    name: product-service

server:
  port: ${PORT:8081}

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka
    registry-fetch-interval-seconds: 5
  instance:
    prefer-ip-address: true
    instance-id: ${spring.application.name}:${random.uuid}
    lease-renewal-interval-in-seconds: 10
    lease-expiration-duration-in-seconds: 30
```

```java
@SpringBootApplication
public class ProductServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProductServiceApplication.class, args);
    }
}

@RestController
@RequestMapping("/api/products")
public class ProductController {

    @Value("${server.port}")
    private String port;

    @GetMapping
    public List<Product> getProducts() {
        return List.of(
            new Product(1L, "Product A", BigDecimal.valueOf(99.99)),
            new Product(2L, "Product B", BigDecimal.valueOf(149.99))
        );
    }

    @GetMapping("/info")
    public Map<String, String> getInfo() {
        return Map.of("service", "product-service", "port", port);
    }
}
```

---

## Config Server

### Server Setup

```xml
<!-- pom.xml - Config Server -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-config-server</artifactId>
</dependency>
```

```java
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

```yaml
# application.yml - Config Server
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
          # Per repo privato
          username: ${GIT_USERNAME}
          password: ${GIT_TOKEN}
        # Oppure filesystem locale
        native:
          search-locations: file:./config-repo

  profiles:
    active: native  # o 'git' per repository
```

---

## Config Client

```xml
<!-- pom.xml - Config Client -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-config</artifactId>
</dependency>
```

```yaml
# application.yml - Client
spring:
  application:
    name: order-service
  config:
    import: optional:configserver:http://localhost:8888
  cloud:
    config:
      fail-fast: true
      retry:
        max-attempts: 5
        initial-interval: 1000

# Config repo structure:
# config-repo/
#   ├── application.yml          # Comuni a tutti
#   ├── order-service.yml        # Specifico
#   ├── order-service-dev.yml    # Per profilo dev
#   └── order-service-prod.yml   # Per profilo prod
```

```java
// Refresh dinamico delle configurazioni
@RestController
@RefreshScope  // Ricarica quando /actuator/refresh viene chiamato
@RequiredArgsConstructor
public class ConfigController {

    @Value("${app.feature.new-checkout:false}")
    private boolean newCheckoutEnabled;

    @Value("${app.pricing.discount-rate:0.0}")
    private double discountRate;

    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        return Map.of(
            "newCheckoutEnabled", newCheckoutEnabled,
            "discountRate", discountRate
        );
    }
}
```

---

## High Availability Eureka

```yaml
# eureka-server-1
server:
  port: 8761
eureka:
  instance:
    hostname: eureka1
  client:
    service-url:
      defaultZone: http://eureka2:8762/eureka,http://eureka3:8763/eureka

# eureka-server-2
server:
  port: 8762
eureka:
  instance:
    hostname: eureka2
  client:
    service-url:
      defaultZone: http://eureka1:8761/eureka,http://eureka3:8763/eureka
```
