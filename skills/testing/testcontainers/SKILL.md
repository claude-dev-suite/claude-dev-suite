---
name: testcontainers
description: |
  Testcontainers for Docker-based integration testing in Java. Covers database
  containers, messaging systems, and Spring Boot @ServiceConnection.

  USE WHEN: user mentions "testcontainers", "docker test", "integration test", asks about "@ServiceConnection", "PostgreSQLContainer", "MongoDBContainer", "test database", "docker compose test"

  DO NOT USE FOR: Unit tests - use `junit`; REST API tests - use `rest-assured`; Tests without Docker - use H2 or embedded databases; Non-Java projects - check language-specific tools
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Testcontainers - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `testcontainers` for comprehensive documentation.

## When NOT to Use This Skill

- **Unit Tests** - Use `junit` with Mockito for fast isolated tests
- **REST API Tests Only** - Use `rest-assured` without containers if API is mocked
- **Environments Without Docker** - Use H2 or embedded databases
- **CI with Limited Resources** - Containers may be too heavy, use mocks
- **Non-Java Projects** - Check language-specific Testcontainers libraries

## Setup Base

### Maven Dependencies
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-testcontainers</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <scope>test</scope>
</dependency>
<!-- Database specific -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>mongodb</artifactId>
    <scope>test</scope>
</dependency>
```

### Gradle Dependencies
```kotlin
testImplementation("org.springframework.boot:spring-boot-testcontainers")
testImplementation("org.testcontainers:junit-jupiter")
testImplementation("org.testcontainers:postgresql")
testImplementation("org.testcontainers:mongodb")
```

## @ServiceConnection (Spring Boot 3.1+)

### Pattern Raccomandato
```java
@SpringBootTest
@Testcontainers
class MyIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void testWithDatabase() {
        // Connection auto-configured
    }
}
```

### Container Supportati

| Container | Maven Artifact | Connection Details |
|-----------|---------------|-------------------|
| PostgreSQLContainer | `postgresql` | JDBC + R2DBC |
| MySQLContainer | `mysql` | JDBC + R2DBC |
| MariaDBContainer | `mariadb` | JDBC + R2DBC |
| MongoDBContainer | `mongodb` | MongoConnectionDetails |
| KafkaContainer | `kafka` | KafkaConnectionDetails |
| RedisContainer | - | RedisConnectionDetails |
| RabbitMQContainer | `rabbitmq` | RabbitConnectionDetails |
| ElasticsearchContainer | `elasticsearch` | ElasticsearchConnectionDetails |
| CassandraContainer | `cassandra` | CassandraConnectionDetails |

### GenericContainer con @ServiceConnection
```java
@Container
@ServiceConnection(name = "redis")
static GenericContainer<?> redis =
    new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379);
```

## Lifecycle Management

### Static Container (Shared across tests - RECOMMENDED)
```java
@Testcontainers
class SharedContainerTest {

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void test1() { /* same container */ }

    @Test
    void test2() { /* same container */ }
}
```

### Spring Bean Container (Best lifecycle control)
```java
@TestConfiguration(proxyBeanMethods = false)
class TestContainersConfig {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>("postgres:16-alpine");
    }
}

@SpringBootTest
@Import(TestContainersConfig.class)
class ManagedContainerTest {
    // Container lifecycle managed by Spring
    // Started before beans, stopped after beans
}
```

### Container Reuse (Development)
```java
static PostgreSQLContainer<?> postgres =
    new PostgreSQLContainer<>("postgres:16-alpine")
        .withReuse(true);
```

Richiede in `~/.testcontainers.properties`:
```
testcontainers.reuse.enable=true
```

## Database Containers

### PostgreSQL
```java
@Container
@ServiceConnection
static PostgreSQLContainer<?> postgres =
    new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test")
        .withInitScript("init.sql");
```

### MongoDB
```java
@Container
@ServiceConnection
static MongoDBContainer mongo =
    new MongoDBContainer("mongo:7.0")
        .withSharding();
```

### MySQL
```java
@Container
@ServiceConnection
static MySQLContainer<?> mysql =
    new MySQLContainer<>("mysql:8.0")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");
```

## Messaging Containers

### Kafka
```java
@Container
@ServiceConnection
static KafkaContainer kafka =
    new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"))
        .withKraft();
```

### RabbitMQ
```java
@Container
@ServiceConnection
static RabbitMQContainer rabbitmq =
    new RabbitMQContainer("rabbitmq:3.12-management")
        .withExposedPorts(5672, 15672);
```

### Redis
```java
@Container
@ServiceConnection
static GenericContainer<?> redis =
    new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379);
```

## Messaging Container Test Patterns

> **Dedicated skills**: For comprehensive messaging test coverage, see `messaging-testing-kafka`, `messaging-testing-rabbitmq`, and `messaging-testing`.

### Kafka: Produce → Consume → Assert
```java
@SpringBootTest
@Testcontainers
class KafkaProduceConsumeTest {

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("apache/kafka-native:3.8.0"));

    @Autowired
    private KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldProcessOrderViaKafka() throws Exception {
        kafkaTemplate.send("orders", "key-1",
            new OrderEvent("123", "CREATED")).get(10, TimeUnit.SECONDS);

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() ->
                assertThat(orderRepository.findById("123")).isPresent());
    }
}
```

### RabbitMQ: Send → Listen → Assert
```java
@SpringBootTest
@Testcontainers
class RabbitProduceConsumeTest {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldProcessOrderViaRabbit() {
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("456", "CREATED"));

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() ->
                assertThat(orderRepository.findById("456")).isPresent());
    }
}
```

### Redis Pub/Sub: Publish → Subscribe → Assert
```java
@SpringBootTest
@Testcontainers
class RedisPubSubTest {

    @Container
    @ServiceConnection(name = "redis")
    static GenericContainer<?> redis =
        new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Test
    void shouldPublishAndReceiveMessage() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        List<String> received = new CopyOnWriteArrayList<>();

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisTemplate.getConnectionFactory());
        container.addMessageListener((message, pattern) -> {
            received.add(new String(message.getBody()));
            latch.countDown();
        }, new ChannelTopic("orders"));
        container.afterPropertiesSet();
        container.start();

        redisTemplate.convertAndSend("orders", "{\"orderId\":\"789\"}");

        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(received.get(0)).contains("789");
        container.stop();
    }
}
```

## Legacy Pattern (@DynamicPropertySource)

```java
@Testcontainers
@SpringBootTest
class LegacyTest {

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```

## Network & Compose

### Container Network
```java
@Testcontainers
class NetworkTest {

    static Network network = Network.newNetwork();

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16")
            .withNetwork(network)
            .withNetworkAliases("postgres");

    @Container
    static GenericContainer<?> app =
        new GenericContainer<>("myapp:latest")
            .withNetwork(network)
            .dependsOn(postgres)
            .withEnv("DATABASE_HOST", "postgres");
}
```

### Docker Compose
```java
@Testcontainers
class ComposeTest {

    @Container
    static DockerComposeContainer<?> compose =
        new DockerComposeContainer<>(new File("docker-compose-test.yml"))
            .withExposedService("postgres", 5432)
            .withExposedService("redis", 6379);

    @Test
    void test() {
        String host = compose.getServiceHost("postgres", 5432);
        int port = compose.getServicePort("postgres", 5432);
    }
}
```

## Wait Strategies

```java
new GenericContainer<>("custom-image")
    .waitingFor(Wait.forHttp("/health").forStatusCode(200))
    .waitingFor(Wait.forLogMessage(".*Started.*", 1))
    .waitingFor(Wait.forListeningPort())
    .withStartupTimeout(Duration.ofMinutes(2));
```

## Best Practices

| Do | Don't |
|----|-------|
| Use `static` containers | Create container per test method |
| Use `@ServiceConnection` | Manual property configuration |
| Use Spring Bean lifecycle | JUnit lifecycle for app-dependent containers |
| Enable container reuse in dev | Start fresh containers every run |
| Use specific image tags | Use `latest` tag |
| Share containers via base class | Duplicate container declarations |

## Common Issues

### Container not starting
```java
// Check Docker is running
// Check image exists
// Increase startup timeout
.withStartupTimeout(Duration.ofMinutes(5))
```

### Port conflicts
```java
// Always use exposed port mapping
container.getMappedPort(5432)
// Never hardcode ports
```

### Slow tests
```java
// Enable reuse
.withReuse(true)
// Use lighter images (-alpine)
new PostgreSQLContainer<>("postgres:16-alpine")
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Creating container per test method | Extremely slow | Use static containers shared across tests |
| Not using @ServiceConnection | Manual config duplication | Let Spring auto-configure from container |
| Using latest tag | Non-deterministic tests | Pin specific version (postgres:16-alpine) |
| No withReuse for local dev | Slow dev feedback loop | Enable reuse in ~/.testcontainers.properties |
| Hardcoded ports | Port conflicts | Use getMappedPort() for dynamic ports |
| Ignoring startup timeout | Tests hang | Set withStartupTimeout appropriately |
| Not cleaning up test data | Tests interfere with each other | Use @Transactional or manual cleanup |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Could not find image" | Docker not running or image unavailable | Start Docker, check image name |
| Container startup timeout | Image too large or slow startup | Increase timeout, use lighter images |
| Port already in use | Previous test didn't clean up | Use dynamic ports with getMappedPort() |
| Tests very slow | Starting containers every test | Use static containers |
| Connection refused | Using localhost instead of container host | Use container.getHost() and getMappedPort() |
| "@ServiceConnection not working" | Wrong Spring Boot version | Requires Spring Boot 3.1+, check version |

## Reference Documentation
- [Testcontainers Official Docs](https://testcontainers.com/)
- [Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
