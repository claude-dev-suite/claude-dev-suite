---
name: activemq
description: |
  Apache ActiveMQ message broker with JMS support. Covers queues, topics,
  message selectors, and Spring integration. Use for enterprise Java
  messaging and JMS-compliant applications.

  USE WHEN: user mentions "activemq", "jms", "artemis", "message selectors", "virtual topics", asks about "java messaging", "jms queues", "enterprise messaging", "spring jms"

  DO NOT USE FOR: event streaming - use `kafka` or `pulsar`; cloud-native - use `nats`; AWS-native - use `sqs`; Azure-native - use `azure-service-bus`; non-JMS preferred - use `rabbitmq` or `kafka`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Apache ActiveMQ Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `activemq` for comprehensive documentation.

## Quick Start (Docker)

```yaml
# docker-compose.yml
services:
  activemq:
    image: apache/activemq-artemis:latest
    ports:
      - "61616:61616" # AMQP/OpenWire
      - "8161:8161"   # Web Console
    environment:
      - ARTEMIS_USER=admin
      - ARTEMIS_PASSWORD=admin
    volumes:
      - activemq_data:/var/lib/artemis-instance

volumes:
  activemq_data:
```

```bash
docker-compose up -d
# Web Console: http://localhost:8161/console
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Queue** | Point-to-point messaging |
| **Topic** | Publish-subscribe messaging |
| **Selector** | SQL-like message filtering |
| **Durable Subscriber** | Persisted topic subscription |
| **Message Groups** | Ordered message processing |
| **Virtual Topic** | Queue semantics on topics |

## JMS Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ActiveMQ Broker                       │
│                                                         │
│   Queue (P2P)              Topic (Pub/Sub)             │
│   ┌─────────┐              ┌─────────┐                 │
│   │ Message │              │ Message │                 │
│   │  Queue  │──▶Consumer   │  Topic  │──▶Subscriber 1 │
│   └─────────┘              └─────────┘──▶Subscriber 2 │
│        ▲                        ▲                      │
│        │                        │                      │
│   Producer                  Publisher                  │
└─────────────────────────────────────────────────────────┘
```

## JMS Message Types

| Type | Description |
|------|-------------|
| `TextMessage` | String content |
| `BytesMessage` | Binary data |
| `MapMessage` | Key-value pairs |
| `ObjectMessage` | Serialized Java object |
| `StreamMessage` | Sequential data stream |

## Producer Patterns

### Java (Spring JMS)
```java
@Configuration
@EnableJms
public class JmsConfig {
    @Bean
    public ConnectionFactory connectionFactory() {
        ActiveMQConnectionFactory factory = new ActiveMQConnectionFactory();
        factory.setBrokerURL("tcp://localhost:61616");
        factory.setUserName("admin");
        factory.setPassword("admin");
        return factory;
    }

    @Bean
    public JmsTemplate jmsTemplate(ConnectionFactory connectionFactory) {
        JmsTemplate template = new JmsTemplate(connectionFactory);
        template.setDeliveryPersistent(true);
        template.setSessionAcknowledgeMode(Session.CLIENT_ACKNOWLEDGE);
        return template;
    }

    @Bean
    public JmsTemplate topicJmsTemplate(ConnectionFactory connectionFactory) {
        JmsTemplate template = new JmsTemplate(connectionFactory);
        template.setPubSubDomain(true);  // Enable topic mode
        return template;
    }
}

@Service
public class OrderProducer {
    @Autowired
    private JmsTemplate jmsTemplate;

    // Send to queue
    public void sendToQueue(Order order) {
        jmsTemplate.convertAndSend("orders.queue", order, message -> {
            message.setJMSCorrelationID(UUID.randomUUID().toString());
            message.setStringProperty("orderType", order.getType());
            message.setIntProperty("priority", order.getPriority());
            return message;
        });
    }

    // Send with reply
    public OrderResponse sendAndReceive(Order order) {
        return (OrderResponse) jmsTemplate.sendAndReceive("orders.queue",
            session -> {
                ObjectMessage msg = session.createObjectMessage(order);
                msg.setJMSReplyTo(session.createTemporaryQueue());
                return msg;
            });
    }
}

@Service
public class EventPublisher {
    @Autowired
    @Qualifier("topicJmsTemplate")
    private JmsTemplate topicTemplate;

    // Publish to topic
    public void publishEvent(OrderEvent event) {
        topicTemplate.convertAndSend("orders.events", event);
    }
}
```

### Node.js (stompit)
```typescript
import stompit from 'stompit';

const connectOptions = {
  host: 'localhost',
  port: 61613,
  connectHeaders: {
    host: '/',
    login: 'admin',
    passcode: 'admin',
    'heart-beat': '5000,5000',
  },
};

stompit.connect(connectOptions, (error, client) => {
  if (error) {
    console.error('Connection error:', error);
    return;
  }

  const sendHeaders = {
    destination: '/queue/orders',
    'content-type': 'application/json',
    persistent: 'true',
    'correlation-id': uuidv4(),
  };

  const frame = client.send(sendHeaders);
  frame.write(JSON.stringify(order));
  frame.end();

  client.disconnect();
});
```

### Python (stomp.py)
```python
import stomp
import json

class OrderListener(stomp.ConnectionListener):
    def on_error(self, frame):
        print(f'Error: {frame.body}')

    def on_message(self, frame):
        print(f'Received: {frame.body}')

conn = stomp.Connection([('localhost', 61613)])
conn.set_listener('', OrderListener())
conn.connect('admin', 'admin', wait=True)

# Send to queue
conn.send(
    destination='/queue/orders',
    body=json.dumps(order),
    headers={
        'persistent': 'true',
        'content-type': 'application/json',
        'correlation-id': correlation_id,
    }
)

conn.disconnect()
```

## Consumer Patterns

### Java (Spring JMS)
```java
@Configuration
public class JmsListenerConfig {
    @Bean
    public DefaultJmsListenerContainerFactory jmsListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        DefaultJmsListenerContainerFactory factory = new DefaultJmsListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setConcurrency("3-10");
        factory.setSessionAcknowledgeMode(Session.CLIENT_ACKNOWLEDGE);
        factory.setErrorHandler(t -> log.error("JMS Error", t));
        return factory;
    }

    @Bean
    public DefaultJmsListenerContainerFactory topicListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        DefaultJmsListenerContainerFactory factory = new DefaultJmsListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setPubSubDomain(true);
        factory.setSubscriptionDurable(true);
        factory.setClientId("order-service");
        return factory;
    }
}

@Service
public class OrderConsumer {
    // Queue consumer
    @JmsListener(destination = "orders.queue", concurrency = "3-10")
    public void consumeQueue(
            @Payload Order order,
            @Header(JmsHeaders.CORRELATION_ID) String correlationId,
            @Header(name = "orderType", required = false) String orderType,
            Session session,
            Message message) throws JMSException {

        try {
            processOrder(order);
            message.acknowledge();
        } catch (Exception e) {
            session.recover();  // Redelivery
        }
    }

    // Queue consumer with selector
    @JmsListener(
        destination = "orders.queue",
        selector = "orderType = 'EXPRESS' AND priority > 5"
    )
    public void consumeExpressOrders(Order order) {
        processExpressOrder(order);
    }

    // Durable topic subscriber
    @JmsListener(
        destination = "orders.events",
        containerFactory = "topicListenerContainerFactory",
        subscription = "order-processor"
    )
    public void consumeTopic(OrderEvent event) {
        processEvent(event);
    }
}
```

### Request/Reply Pattern
```java
@Service
public class OrderService {
    @JmsListener(destination = "orders.request")
    @SendTo("orders.response")
    public OrderResponse processOrderRequest(Order order) {
        // Process and return response
        return new OrderResponse(order.getId(), "PROCESSED");
    }
}
```

### Node.js (stompit)
```typescript
stompit.connect(connectOptions, (error, client) => {
  const subscribeHeaders = {
    destination: '/queue/orders',
    ack: 'client-individual',
  };

  client.subscribe(subscribeHeaders, (error, message) => {
    if (error) {
      console.error('Subscribe error:', error);
      return;
    }

    message.readString('utf-8', (error, body) => {
      if (error) {
        client.nack(message);
        return;
      }

      try {
        const order = JSON.parse(body);
        processOrder(order);
        client.ack(message);
      } catch (e) {
        client.nack(message);
      }
    });
  });
});
```

## Message Groups

Ensures ordered processing by grouping related messages.

```java
// Producer
jmsTemplate.convertAndSend("orders.queue", order, message -> {
    message.setStringProperty("JMSXGroupID", order.getCustomerId());
    message.setIntProperty("JMSXGroupSeq", sequenceNumber);
    return message;
});

// Consumer receives messages in order per group
@JmsListener(destination = "orders.queue")
public void consume(Order order, @Header("JMSXGroupID") String groupId) {
    // Messages with same groupId processed in order
}
```

## Virtual Topics

Combine topic semantics with queue load balancing.

```
Publisher ──▶ VirtualTopic.Orders ──▶ Consumer.A.VirtualTopic.Orders (Consumer Group A)
                                  ──▶ Consumer.B.VirtualTopic.Orders (Consumer Group B)
```

```java
// Publisher sends to virtual topic
topicTemplate.convertAndSend("VirtualTopic.Orders", event);

// Consumer subscribes to virtual consumer queue
@JmsListener(destination = "Consumer.OrderProcessor.VirtualTopic.Orders")
public void consume(OrderEvent event) {
    // Load balanced within consumer group
}
```

## When NOT to Use This Skill

Use alternative messaging solutions when:
- Event streaming with replay - Kafka provides better event sourcing
- Ultra-high throughput - Kafka or Pulsar scale better
- Cloud-native microservices - NATS or cloud providers are simpler
- Non-Java environments primarily - RabbitMQ has better multi-language support
- Serverless architecture - Use cloud-native queues (SQS, Service Bus)
- Simple pub/sub - Redis or NATS may be sufficient
- Modern streaming patterns - Kafka Streams or Pulsar Functions

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Non-persistent delivery in production | Message loss on broker restart | Use persistent delivery mode |
| No DLQ configured | Poison messages loop forever | Configure dead letter queue |
| Auto-acknowledge mode | Message loss on consumer crash | Use client or transacted acknowledge |
| Large message payloads | Memory pressure, poor performance | Store in database/blob, send reference |
| Too many topics/queues | Management overhead | Use selectors or consolidate destinations |
| ObjectMessage serialization | Security risks, coupling | Use JSON/XML with TextMessage |
| No prefetch limit | Consumer overwhelmed | Configure prefetch based on processing time |
| Synchronous sends everywhere | Poor throughput | Use async sends for non-critical messages |
| No connection pooling | Too many connections | Use pooled connection factory |
| Default persistence adapter | Poor performance at scale | Use KahaDB or JDBC with tuning |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages piling up | Slow/dead consumers | Check consumer health and count |
| High memory usage | Too many messages in memory | Enable message cursor, reduce prefetch |
| Connection refused | Wrong URL or broker down | Verify broker URL and broker status |
| Messages not consumed | No active consumers | Start consumers, check subscriptions |
| Duplicate messages | Non-transacted consumers | Use transactions or implement idempotency |
| Store full | Message retention too long | Configure message TTL, purge old messages |
| Slow message delivery | Persistence bottleneck | Tune KahaDB, use faster disk |
| Selector not working | Wrong SQL syntax | Test selector syntax, check message properties |
| Client timeout | Slow network or broker overload | Increase socket timeout, scale broker |
| Durable subscriber not receiving | Subscription disconnected | Check client ID and subscription name |

## Production Readiness

### Security Configuration
```xml
<!-- broker.xml (Artemis) -->
<security-settings>
    <security-setting match="#">
        <permission type="createNonDurableQueue" roles="admin,user"/>
        <permission type="deleteNonDurableQueue" roles="admin,user"/>
        <permission type="createDurableQueue" roles="admin"/>
        <permission type="deleteDurableQueue" roles="admin"/>
        <permission type="consume" roles="admin,user"/>
        <permission type="send" roles="admin,user"/>
    </security-setting>
</security-settings>

<acceptors>
    <acceptor name="ssl">
        tcp://0.0.0.0:61617?sslEnabled=true;keyStorePath=/path/keystore.jks;keyStorePassword=password
    </acceptor>
</acceptors>
```

```java
// Client with SSL
ActiveMQConnectionFactory factory = new ActiveMQConnectionFactory();
factory.setBrokerURL("ssl://localhost:61617");
factory.setTrustStore("/path/truststore.jks");
factory.setTrustStorePassword("password");
```

### High Availability
```xml
<!-- Live-backup pair -->
<ha-policy>
    <replication>
        <master>
            <group-name>live-backup-group</group-name>
            <check-for-live-server>true</check-for-live-server>
        </master>
    </replication>
</ha-policy>
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Queue depth | > 10000 messages |
| Consumer count | < expected |
| Memory usage | > 80% |
| Store usage | > 80% |
| Dispatch rate | Anomaly detection |
| Enqueue rate | Anomaly detection |

### Checklist

- [ ] SSL/TLS enabled
- [ ] Authentication configured
- [ ] Authorization (JAAS) set up
- [ ] Dead letter queue configured
- [ ] Message expiration set
- [ ] Persistence enabled
- [ ] Clustering configured
- [ ] JMX monitoring enabled
- [ ] Disk usage alerts
- [ ] Backup procedures tested

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `activemq` for comprehensive documentation.

Available topics: `basics`, `destinations`, `producers`, `consumers`, `spring-integration`, `production`
