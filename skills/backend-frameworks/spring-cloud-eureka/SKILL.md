---
name: spring-cloud-eureka
description: |
  Netflix Eureka for service discovery in Spring Cloud microservices.
  Covers Eureka Server, Eureka Client, registration, and health checks.

  USE WHEN: user mentions "eureka", "service discovery", "service registry",
  "@EnableEurekaServer", "@EnableDiscoveryClient", "eureka dashboard"

  DO NOT USE FOR: Kubernetes service discovery - use native K8s,
  Consul - use Consul-specific patterns
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Eureka - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-eureka` for comprehensive documentation.

## Eureka Server Setup

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```

### Main Application
```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

### application.yml (Server)
```yaml
server:
  port: 8761

spring:
  application:
    name: eureka-server

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false  # Don't register itself
    fetch-registry: false         # Don't fetch registry
    service-url:
      defaultZone: http://${eureka.instance.hostname}:${server.port}/eureka/
  server:
    enable-self-preservation: true
    eviction-interval-timer-in-ms: 5000
    renewal-percent-threshold: 0.85
```

### High Availability (Peer Replication)
```yaml
# eureka-server-1
server:
  port: 8761

eureka:
  instance:
    hostname: eureka1.mycompany.com
  client:
    register-with-eureka: true
    fetch-registry: true
    service-url:
      defaultZone: http://eureka2.mycompany.com:8762/eureka/,http://eureka3.mycompany.com:8763/eureka/

---
# eureka-server-2
server:
  port: 8762

eureka:
  instance:
    hostname: eureka2.mycompany.com
  client:
    service-url:
      defaultZone: http://eureka1.mycompany.com:8761/eureka/,http://eureka3.mycompany.com:8763/eureka/
```

## Eureka Client Setup

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

### application.yml (Client)
```yaml
spring:
  application:
    name: user-service

server:
  port: 8081

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
    registry-fetch-interval-seconds: 5
    initial-instance-info-replication-interval-seconds: 5
  instance:
    instance-id: ${spring.application.name}:${random.value}
    prefer-ip-address: true
    lease-renewal-interval-in-seconds: 10
    lease-expiration-duration-in-seconds: 30
    metadata-map:
      version: ${project.version:unknown}
      zone: zone-a
```

### Instance Health
```yaml
eureka:
  instance:
    health-check-url-path: /actuator/health
    status-page-url-path: /actuator/info
```

## Service Discovery

### Using DiscoveryClient
```java
@Service
@RequiredArgsConstructor
public class ServiceDiscoveryService {

    private final DiscoveryClient discoveryClient;

    public List<ServiceInstance> getInstances(String serviceName) {
        return discoveryClient.getInstances(serviceName);
    }

    public String getServiceUrl(String serviceName) {
        List<ServiceInstance> instances = discoveryClient.getInstances(serviceName);
        if (instances.isEmpty()) {
            throw new ServiceNotFoundException(serviceName);
        }
        // Simple random selection
        ServiceInstance instance = instances.get(
            ThreadLocalRandom.current().nextInt(instances.size()));
        return instance.getUri().toString();
    }

    public List<String> getAllServices() {
        return discoveryClient.getServices();
    }
}
```

### Using RestTemplate with LoadBalancer
```java
@Configuration
public class RestTemplateConfig {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}

@Service
@RequiredArgsConstructor
public class UserClient {

    private final RestTemplate restTemplate;

    public User getUser(Long id) {
        // Uses service name instead of hostname
        return restTemplate.getForObject(
            "http://USER-SERVICE/api/users/{id}",
            User.class, id);
    }
}
```

### Using WebClient with LoadBalancer
```java
@Configuration
public class WebClientConfig {

    @Bean
    @LoadBalanced
    public WebClient.Builder webClientBuilder() {
        return WebClient.builder();
    }
}

@Service
public class UserWebClient {

    private final WebClient webClient;

    public UserWebClient(WebClient.Builder builder) {
        this.webClient = builder.baseUrl("http://USER-SERVICE").build();
    }

    public Mono<User> getUser(Long id) {
        return webClient.get()
            .uri("/api/users/{id}", id)
            .retrieve()
            .bodyToMono(User.class);
    }
}
```

## Custom Load Balancer

```java
@Configuration
public class CustomLoadBalancerConfig {

    @Bean
    public ReactorLoadBalancer<ServiceInstance> customLoadBalancer(
            Environment environment,
            LoadBalancerClientFactory clientFactory) {

        String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);

        return new RoundRobinLoadBalancer(
            clientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class),
            name);
    }
}

// Apply to specific service
@LoadBalancerClient(name = "USER-SERVICE", configuration = CustomLoadBalancerConfig.class)
public class UserServiceConfig {
}
```

## Zone-Aware Routing

```yaml
# Service in zone-a
eureka:
  instance:
    metadata-map:
      zone: zone-a
  client:
    prefer-same-zone-eureka: true
    availability-zones:
      region1: zone-a,zone-b
    region: region1
```

```java
@Bean
public ServiceInstanceListSupplier zonePreferenceSupplier(
        ConfigurableApplicationContext context) {
    return ServiceInstanceListSupplier.builder()
        .withDiscoveryClient()
        .withZonePreference()
        .build(context);
}
```

## Health and Status

### Custom Status
```java
@Component
public class CustomHealthIndicator extends AbstractHealthIndicator {

    @Override
    protected void doHealthCheck(Health.Builder builder) {
        // Custom health logic
        if (isHealthy()) {
            builder.up().withDetail("custom", "OK");
        } else {
            builder.down().withDetail("custom", "FAILING");
        }
    }
}
```

### Force Status
```java
@Autowired
private ApplicationInfoManager applicationInfoManager;

public void setOutOfService() {
    applicationInfoManager.setInstanceStatus(InstanceStatus.OUT_OF_SERVICE);
}

public void setUp() {
    applicationInfoManager.setInstanceStatus(InstanceStatus.UP);
}
```

## REST Endpoints

```bash
# Eureka Server Dashboard
GET http://localhost:8761/

# Apps registered
GET http://localhost:8761/eureka/apps

# Specific app
GET http://localhost:8761/eureka/apps/{appName}

# Specific instance
GET http://localhost:8761/eureka/apps/{appName}/{instanceId}

# Instance status
PUT http://localhost:8761/eureka/apps/{appName}/{instanceId}/status?value=OUT_OF_SERVICE

# Delete instance
DELETE http://localhost:8761/eureka/apps/{appName}/{instanceId}
```

## Security

### Secure Eureka Server
```yaml
# application.yml
spring:
  security:
    user:
      name: eureka
      password: ${EUREKA_PASSWORD}
```

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.ignoringRequestMatchers("/eureka/**"))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated())
            .httpBasic(Customizer.withDefaults());
        return http.build();
    }
}
```

### Secure Client Connection
```yaml
eureka:
  client:
    service-url:
      defaultZone: http://eureka:${EUREKA_PASSWORD}@localhost:8761/eureka/
```

## Docker/Kubernetes

### Docker Compose
```yaml
services:
  eureka:
    image: myorg/eureka-server
    ports:
      - "8761:8761"
    environment:
      - EUREKA_INSTANCE_HOSTNAME=eureka
      - EUREKA_CLIENT_SERVICEURL_DEFAULTZONE=http://eureka:8761/eureka/

  user-service:
    image: myorg/user-service
    environment:
      - EUREKA_CLIENT_SERVICEURL_DEFAULTZONE=http://eureka:8761/eureka/
      - EUREKA_INSTANCE_PREFER_IP_ADDRESS=true
```

### Kubernetes (consider using K8s native discovery)
```yaml
eureka:
  instance:
    prefer-ip-address: true
    ip-address: ${POD_IP}
  client:
    service-url:
      defaultZone: http://eureka-server:8761/eureka/
```

## Best Practices

| Do | Don't |
|----|-------|
| Use prefer-ip-address in containers | Use hostname in dynamic environments |
| Configure HA with peer replication | Single Eureka server in production |
| Set proper lease intervals | Use default intervals in production |
| Use zone-aware routing | Ignore network topology |
| Enable self-preservation | Disable without understanding impact |

## Production Checklist

- [ ] Eureka HA configured (3+ nodes)
- [ ] Security enabled
- [ ] Proper lease intervals set
- [ ] Health check URL configured
- [ ] prefer-ip-address for containers
- [ ] Zone configuration if multi-DC
- [ ] Self-preservation tuned
- [ ] Monitoring/alerting setup
- [ ] Client retry configured
- [ ] Service instance metadata set

## When NOT to Use This Skill

- **Kubernetes** - Use K8s native service discovery
- **Consul preferred** - Use Consul for service discovery
- **Simple setup** - DNS-based discovery may suffice
- **Serverless** - Not applicable

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Single Eureka instance | Single point of failure | Deploy peer-aware cluster |
| No health checks | Unhealthy services listed | Enable health indicator |
| Wrong renewal interval | Late detection of down services | Tune heartbeat settings |
| Ignoring self-preservation | Services removed unexpectedly | Understand and tune |
| No secure registry | Unauthorized registrations | Add Spring Security |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Service not registering | Check Eureka dashboard | Verify eureka.client.serviceUrl |
| Service listed as DOWN | Check health endpoint | Fix health indicator |
| Stale registrations | Check lease settings | Reduce renewal interval |
| Self-preservation mode | Check network | Tune or disable if appropriate |
| Cannot connect to peers | Check peer URLs | Verify cluster configuration |

## Reference Documentation
- [Spring Cloud Netflix Reference](https://docs.spring.io/spring-cloud-netflix/reference/)
