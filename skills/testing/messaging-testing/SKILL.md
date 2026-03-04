---
name: messaging-testing
description: |
  Integration testing patterns for messaging brokers: Redis Pub/Sub, NATS, Pulsar,
  SQS, ActiveMQ, Azure Service Bus, and Google Pub/Sub. Container-based and
  emulator-based testing for Java, Node.js, and Python.

  USE WHEN: user mentions "messaging test", "redis pubsub test", "nats test",
  "pulsar test", "sqs test", "localstack test", "activemq test",
  "azure service bus test", "google pubsub test", "message queue test"

  DO NOT USE FOR: Kafka testing - use `messaging-testing-kafka`;
  RabbitMQ testing - use `messaging-testing-rabbitmq`;
  Generic testcontainers - use `testcontainers` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Messaging Integration Testing — Multi-Broker Reference

> **Dedicated skills**: For Kafka testing see `messaging-testing-kafka`. For RabbitMQ testing see `messaging-testing-rabbitmq`.

## Redis Pub/Sub

### Java: Testcontainers GenericContainer
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
    void shouldPublishAndReceive() {
        List<String> received = new CopyOnWriteArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);

        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisTemplate.getConnectionFactory());
        container.addMessageListener((message, pattern) -> {
            received.add(new String(message.getBody()));
            latch.countDown();
        }, new ChannelTopic("orders"));
        container.afterPropertiesSet();
        container.start();

        redisTemplate.convertAndSend("orders", "{\"orderId\":\"123\"}");

        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(received).hasSize(1);
        assertThat(received.get(0)).contains("123");

        container.stop();
    }
}
```

### Node.js: ioredis + Testcontainers
```typescript
import { GenericContainer } from "testcontainers";
import Redis from "ioredis";

let container, publisher, subscriber;

beforeAll(async () => {
  container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379).start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  publisher = new Redis(url);
  subscriber = new Redis(url);
}, 30_000);

afterAll(async () => {
  await publisher.quit();
  await subscriber.quit();
  await container.stop();
});

it("should pub/sub", async () => {
  const messages: string[] = [];
  await subscriber.subscribe("orders");
  subscriber.on("message", (ch, msg) => messages.push(msg));

  await publisher.publish("orders", JSON.stringify({ orderId: "123" }));
  await new Promise((r) => setTimeout(r, 500));

  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0]).orderId).toBe("123");
});
```

## NATS

### Java: Testcontainers
```java
@SpringBootTest
@Testcontainers
class NatsTest {

    @Container
    static GenericContainer<?> nats =
        new GenericContainer<>("nats:2.10-alpine").withExposedPorts(4222);

    @DynamicPropertySource
    static void natsProperties(DynamicPropertyRegistry registry) {
        registry.add("nats.url", () ->
            "nats://" + nats.getHost() + ":" + nats.getMappedPort(4222));
    }

    @Test
    void shouldPublishAndSubscribe() throws Exception {
        Connection nc = Nats.connect(
            "nats://" + nats.getHost() + ":" + nats.getMappedPort(4222));

        CompletableFuture<Message> future = new CompletableFuture<>();
        Dispatcher dispatcher = nc.createDispatcher(future::complete);
        dispatcher.subscribe("orders");

        nc.publish("orders", "{\"orderId\":\"123\"}".getBytes());

        Message msg = future.get(5, TimeUnit.SECONDS);
        assertThat(new String(msg.getData())).contains("123");
        nc.close();
    }
}
```

### Node.js: nats + Testcontainers
```typescript
import { GenericContainer } from "testcontainers";
import { connect, StringCodec } from "nats";

it("should pub/sub via NATS", async () => {
  const container = await new GenericContainer("nats:2.10-alpine")
    .withExposedPorts(4222).start();
  const nc = await connect({
    servers: `nats://${container.getHost()}:${container.getMappedPort(4222)}`,
  });
  const sc = StringCodec();

  const messages: string[] = [];
  const sub = nc.subscribe("orders");
  (async () => { for await (const msg of sub) messages.push(sc.decode(msg.data)); })();

  nc.publish("orders", sc.encode(JSON.stringify({ orderId: "123" })));
  await nc.flush();
  await new Promise((r) => setTimeout(r, 500));

  expect(messages).toHaveLength(1);
  await nc.close();
  await container.stop();
});
```

## Apache Pulsar

### Java: PulsarContainer + @ServiceConnection (Spring Boot 3.2+)
```java
@SpringBootTest
@Testcontainers
class PulsarTest {

    @Container
    @ServiceConnection
    static PulsarContainer pulsar = new PulsarContainer("apachepulsar/pulsar:3.2.0");

    @Autowired
    private PulsarTemplate<String> pulsarTemplate;

    @Test
    void shouldProduceAndConsume() throws Exception {
        pulsarTemplate.send("orders", "order-123");

        // Consumer verifies via listener or direct consumer API
        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                // Assert side effect of listener processing
            });
    }
}
```

### Dependencies
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>pulsar</artifactId>
    <scope>test</scope>
</dependency>
```

## Amazon SQS (LocalStack)

### Java: LocalStack + @DynamicPropertySource
```java
@SpringBootTest
@Testcontainers
class SqsTest {

    @Container
    static LocalStackContainer localstack = new LocalStackContainer(
        DockerImageName.parse("localstack/localstack:3.4"))
        .withServices(Service.SQS);

    @DynamicPropertySource
    static void sqsProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.cloud.aws.sqs.endpoint",
            () -> localstack.getEndpointOverride(Service.SQS).toString());
        registry.add("spring.cloud.aws.region.static", () -> localstack.getRegion());
        registry.add("spring.cloud.aws.credentials.access-key", localstack::getAccessKey);
        registry.add("spring.cloud.aws.credentials.secret-key", localstack::getSecretKey);
    }

    @BeforeAll
    static void createQueue() throws Exception {
        localstack.execInContainer("awslocal", "sqs", "create-queue",
            "--queue-name", "orders-queue");
    }

    @Autowired
    private SqsTemplate sqsTemplate;

    @Test
    void shouldSendAndReceive() {
        sqsTemplate.send("orders-queue", new OrderEvent("123", "CREATED"));

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                // Assert consumer processed the message
            });
    }
}
```

### Node.js: LocalStack + @aws-sdk
```typescript
import { LocalstackContainer } from "@testcontainers/localstack";
import { SQSClient, CreateQueueCommand, SendMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

it("should send and receive SQS message", async () => {
  const container = await new LocalstackContainer("localstack/localstack:3.4").start();
  const client = new SQSClient({
    endpoint: container.getConnectionUri(),
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });

  const { QueueUrl } = await client.send(
    new CreateQueueCommand({ QueueName: "test-queue" }));

  await client.send(new SendMessageCommand({
    QueueUrl, MessageBody: JSON.stringify({ orderId: "123" }),
  }));

  const { Messages } = await client.send(
    new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 5 }));

  expect(Messages).toHaveLength(1);
  expect(JSON.parse(Messages![0].Body!).orderId).toBe("123");
  await container.stop();
});
```

### Python: moto (Mock) or LocalStack
```python
import boto3
from moto import mock_aws

@mock_aws
def test_sqs_send_receive():
    sqs = boto3.client("sqs", region_name="us-east-1")
    queue = sqs.create_queue(QueueName="test-queue")
    queue_url = queue["QueueUrl"]

    sqs.send_message(QueueUrl=queue_url, MessageBody='{"orderId": "123"}')

    response = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=1)
    assert len(response["Messages"]) == 1
    assert "123" in response["Messages"][0]["Body"]
```

## ActiveMQ (Artemis)

### Java: EmbeddedActiveMQ (In-Process)
```java
@SpringBootTest
class ActiveMQTest {

    private static EmbeddedActiveMQ embeddedActiveMQ;

    @BeforeAll
    static void startBroker() throws Exception {
        Configuration config = new ConfigurationImpl()
            .setPersistenceEnabled(false)
            .setSecurityEnabled(false)
            .addAcceptorConfiguration("invm", "vm://0");
        embeddedActiveMQ = new EmbeddedActiveMQ().setConfiguration(config);
        embeddedActiveMQ.start();
    }

    @AfterAll
    static void stopBroker() throws Exception {
        embeddedActiveMQ.stop();
    }

    @Test
    void shouldSendAndReceive() {
        // Use JMS or Spring JmsTemplate to send/receive
    }
}
```

### Java: Testcontainers
```java
@Container
static GenericContainer<?> artemis =
    new GenericContainer<>("apache/activemq-artemis:2.33.0")
        .withExposedPorts(61616, 8161)
        .waitingFor(Wait.forLogMessage(".*AMQ241004.*", 1));

@DynamicPropertySource
static void jmsProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.artemis.broker-url", () ->
        "tcp://" + artemis.getHost() + ":" + artemis.getMappedPort(61616));
    registry.add("spring.artemis.user", () -> "artemis");
    registry.add("spring.artemis.password", () -> "artemis");
}
```

## Azure Service Bus

### Emulator Container
```java
@Container
static GenericContainer<?> servicebus =
    new GenericContainer<>("mcr.microsoft.com/azure-messaging/servicebus-emulator:latest")
        .withExposedPorts(5672)
        .withEnv("ACCEPT_EULA", "Y")
        .withEnv("MSSQL_SA_PASSWORD", "StrongPassword1!")
        .waitingFor(Wait.forListeningPort());

@DynamicPropertySource
static void sbProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.cloud.azure.servicebus.connection-string", () ->
        "Endpoint=sb://" + servicebus.getHost() + ":" +
        servicebus.getMappedPort(5672) + ";SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=test");
}
```

### Node.js: Emulator + @azure/service-bus
```typescript
import { ServiceBusClient } from "@azure/service-bus";
import { GenericContainer } from "testcontainers";

// Start emulator container, then:
const client = new ServiceBusClient(connectionString);
const sender = client.createSender("test-queue");
await sender.sendMessages({ body: { orderId: "123" } });

const receiver = client.createReceiver("test-queue");
const [message] = await receiver.receiveMessages(1, { maxWaitTimeInMs: 5000 });
expect(message.body.orderId).toBe("123");
await receiver.completeMessage(message);
```

## Google Pub/Sub

### Emulator (gcloud)
```java
@Container
static GenericContainer<?> pubsub =
    new GenericContainer<>("gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators")
        .withExposedPorts(8085)
        .withCommand("gcloud", "beta", "emulators", "pubsub", "start",
            "--host-port=0.0.0.0:8085", "--project=test-project")
        .waitingFor(Wait.forLogMessage(".*Server started.*", 1));

@DynamicPropertySource
static void pubsubProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.cloud.gcp.pubsub.emulator-host", () ->
        pubsub.getHost() + ":" + pubsub.getMappedPort(8085));
    registry.add("spring.cloud.gcp.project-id", () -> "test-project");
}
```

### Node.js: Emulator + @google-cloud/pubsub
```typescript
import { PubSub } from "@google-cloud/pubsub";
import { GenericContainer } from "testcontainers";

const container = await new GenericContainer(
  "gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators")
  .withExposedPorts(8085)
  .withCommand("gcloud", "beta", "emulators", "pubsub", "start",
    "--host-port=0.0.0.0:8085", "--project=test-project")
  .start();

process.env.PUBSUB_EMULATOR_HOST =
  `${container.getHost()}:${container.getMappedPort(8085)}`;

const pubsub = new PubSub({ projectId: "test-project" });
const [topic] = await pubsub.createTopic("test-topic");
const [subscription] = await topic.createSubscription("test-sub");

await topic.publishMessage({ data: Buffer.from(JSON.stringify({ orderId: "123" })) });

const [messages] = await subscription.pull({ maxMessages: 1 });
expect(messages).toHaveLength(1);
expect(JSON.parse(messages[0].message.data.toString()).orderId).toBe("123");
```

### Python: Emulator + google-cloud-pubsub
```python
import os
from google.cloud import pubsub_v1

def test_pubsub(pubsub_container):
    os.environ["PUBSUB_EMULATOR_HOST"] = (
        f"{pubsub_container.get_container_host_ip()}:"
        f"{pubsub_container.get_exposed_port(8085)}"
    )
    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path("test-project", "test-topic")
    publisher.create_topic(request={"name": topic_path})

    future = publisher.publish(topic_path, b'{"orderId": "123"}')
    future.result(timeout=5)

    subscriber = pubsub_v1.SubscriberClient()
    sub_path = subscriber.subscription_path("test-project", "test-sub")
    subscriber.create_subscription(request={"name": sub_path, "topic": topic_path})

    response = subscriber.pull(request={"subscription": sub_path, "max_messages": 1})
    assert len(response.received_messages) == 1
```

## Cross-Broker Best Practices

| Do | Don't |
|----|-------|
| Use `static` containers shared across tests | Create container per test method |
| Use `@ServiceConnection` when available | Hardcode connection properties |
| Use `await()` or latches for async assertions | Use `Thread.sleep()` |
| Clean up resources in `@AfterAll` | Leave connections/containers open |
| Use emulators for cloud services in CI | Connect to real cloud services in tests |
| Pin specific image versions | Use `latest` tag |

## Reference Documentation
- [Testcontainers Modules](https://java.testcontainers.org/modules/)
- [LocalStack](https://docs.localstack.cloud/)
- [Google Pub/Sub Emulator](https://cloud.google.com/pubsub/docs/emulator)
- [Azure Service Bus Emulator](https://learn.microsoft.com/en-us/azure/service-bus-messaging/overview-emulator)

> **Cross-reference**: For Kafka testing see `messaging-testing-kafka`. For RabbitMQ testing see `messaging-testing-rabbitmq`. For generic Testcontainers patterns see `testcontainers` skill.
