# Testcontainers RabbitMQ Quick Reference

## Dependencies

### Maven
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>rabbitmq</artifactId>
    <scope>test</scope>
</dependency>
```

### Gradle
```kotlin
testImplementation("org.testcontainers:rabbitmq")
```

### Node.js
```bash
npm install -D @testcontainers/rabbitmq
```

### Python
```bash
pip install testcontainers[rabbitmq]
```

## Java: RabbitMQContainer Setup

### Basic
```java
@Container
@ServiceConnection
static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");
```

### Pre-Provisioned Topology
```java
static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management")
    .withExchange("orders.exchange", "direct")
    .withExchange("events.fanout", "fanout")
    .withQueue("orders.queue", false)           // non-durable
    .withQueue("events.queue")
    .withBinding("orders.exchange", "orders.queue",
        Map.of(), "orders.created", "queue")
    .withBinding("events.fanout", "events.queue");
```

### With Plugins
```java
static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management")
    .withPluginsEnabled("rabbitmq_shovel", "rabbitmq_shovel_management");
```

### With SSL
```java
static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management")
    .withSSL(
        MountableFile.forClasspathResource("/certs/server_key.pem"),
        MountableFile.forClasspathResource("/certs/server_cert.pem"),
        MountableFile.forClasspathResource("/certs/ca_cert.pem")
    );
```

### Key Methods
```java
rabbit.getAmqpUrl()         // "amqp://localhost:32789"
rabbit.getAmqpPort()        // Mapped AMQP port
rabbit.getHttpPort()        // Mapped management port (15672)
rabbit.getHttpUrl()         // "http://localhost:32790"
rabbit.getAdminUsername()   // "guest"
rabbit.getAdminPassword()   // "guest"
rabbit.getHost()            // Container host
```

## Spring Boot: @ServiceConnection
```java
@SpringBootTest
@Testcontainers
class RabbitIntegrationTest {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");

    // spring.rabbitmq.host, port, username, password auto-configured
}
```

## Spring Boot: @DynamicPropertySource (pre-3.1)
```java
@DynamicPropertySource
static void rabbitProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.rabbitmq.host", rabbit::getHost);
    registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
    registry.add("spring.rabbitmq.username", rabbit::getAdminUsername);
    registry.add("spring.rabbitmq.password", rabbit::getAdminPassword);
}
```

## Node.js Pattern
```typescript
import { RabbitMQContainer } from "@testcontainers/rabbitmq";

let container;

beforeAll(async () => {
  container = await new RabbitMQContainer("rabbitmq:3.13-management").start();
  const amqpUrl = container.getAmqpUrl();
  // Use amqpUrl for amqplib connection
}, 60_000);

afterAll(async () => {
  await container.stop();
});
```

## Python Pattern
```python
from testcontainers.rabbitmq import RabbitMqContainer

@pytest.fixture(scope="module")
def rabbitmq():
    with RabbitMqContainer("rabbitmq:3.13-management") as container:
        yield container

def test_rabbitmq(rabbitmq):
    host = rabbitmq.get_container_host_ip()
    port = rabbitmq.get_exposed_port(5672)
```

## Reference
- [Testcontainers RabbitMQ Module](https://java.testcontainers.org/modules/rabbitmq/)
- [Testcontainers Node.js RabbitMQ](https://node.testcontainers.org/modules/rabbitmq/)
