# Testcontainers Kafka Quick Reference

## Container Variants

| Container Class | Image | Use Case |
|----------------|-------|----------|
| `KafkaContainer` | `apache/kafka-native:3.8.0` | Default — lightweight, fast startup |
| `ConfluentKafkaContainer` | `confluentinc/cp-kafka:7.6.0` | When Confluent-specific features needed |
| `KafkaContainer` | `confluentinc/cp-kafka:7.6.0` | Legacy approach (still works) |

## Dependencies

### Maven
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>kafka</artifactId>
    <scope>test</scope>
</dependency>
```

### Gradle
```kotlin
testImplementation("org.testcontainers:kafka")
```

### Node.js
```bash
npm install -D @testcontainers/kafka
```

### Python
```bash
pip install testcontainers[kafka]
```

## Java: KafkaContainer Setup

### Basic (KRaft mode — default)
```java
@Container
@ServiceConnection
static KafkaContainer kafka = new KafkaContainer(
    DockerImageName.parse("apache/kafka-native:3.8.0"));
```

### With KRaft Explicit
```java
static KafkaContainer kafka = new KafkaContainer(
    DockerImageName.parse("apache/kafka-native:3.8.0"))
    .withKraft();
```

### Multi-Broker Cluster
```java
static Network network = Network.newNetwork();

static KafkaContainer kafka1 = new KafkaContainer(
    DockerImageName.parse("apache/kafka-native:3.8.0"))
    .withNetwork(network)
    .withNetworkAliases("kafka1");

static KafkaContainer kafka2 = new KafkaContainer(
    DockerImageName.parse("apache/kafka-native:3.8.0"))
    .withNetwork(network)
    .withNetworkAliases("kafka2")
    .dependsOn(kafka1);
```

### Key Methods
```java
kafka.getBootstrapServers()  // e.g., "PLAINTEXT://localhost:32789"
kafka.getHost()              // Container host
kafka.getMappedPort(9093)    // Mapped port
```

## Spring Boot: @ServiceConnection
```java
@SpringBootTest
@Testcontainers
class KafkaIntegrationTest {

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("apache/kafka-native:3.8.0"));

    // spring.kafka.bootstrap-servers auto-configured
}
```

## Spring Boot: @DynamicPropertySource (pre-3.1)
```java
@DynamicPropertySource
static void kafkaProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
}
```

## Spring Boot: @TestConfiguration Bean
```java
@TestConfiguration(proxyBeanMethods = false)
class KafkaTestConfig {

    @Bean
    @ServiceConnection
    KafkaContainer kafkaContainer() {
        return new KafkaContainer(DockerImageName.parse("apache/kafka-native:3.8.0"));
    }
}

@SpringBootTest
@Import(KafkaTestConfig.class)
class KafkaTest { }
```

## Node.js Pattern
```typescript
import { KafkaContainer, StartedKafkaContainer } from "@testcontainers/kafka";

let container: StartedKafkaContainer;

beforeAll(async () => {
  container = await new KafkaContainer("apache/kafka-native:3.8.0").start();
  // container.getBootstrapServers() returns broker address
}, 60_000);

afterAll(async () => {
  await container.stop();
});
```

## Python Pattern
```python
from testcontainers.kafka import KafkaContainer

@pytest.fixture(scope="module")
def kafka():
    with KafkaContainer("confluentinc/cp-kafka:7.6.0") as container:
        yield container

def test_kafka(kafka):
    bootstrap = kafka.get_bootstrap_server()
```

## Go Pattern
```go
import "github.com/testcontainers/testcontainers-go/modules/kafka"

func TestKafka(t *testing.T) {
    ctx := context.Background()
    kafkaContainer, err := kafka.Run(ctx, "apache/kafka-native:3.8.0")
    require.NoError(t, err)
    defer kafkaContainer.Terminate(ctx)

    brokers, _ := kafkaContainer.Brokers(ctx)
}
```

## Reference
- [Testcontainers Kafka Module](https://java.testcontainers.org/modules/kafka/)
- [Testcontainers Node.js Kafka](https://node.testcontainers.org/modules/kafka/)
