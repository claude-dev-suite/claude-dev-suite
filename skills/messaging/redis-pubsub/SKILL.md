---
name: redis-pubsub
description: |
  Redis Pub/Sub and Streams for messaging. Covers publish/subscribe,
  streams with consumer groups, and real-time patterns. Use for
  lightweight messaging and real-time features.

  USE WHEN: user mentions "redis pub/sub", "redis streams", "real-time messaging", "lightweight messaging", "pattern subscriptions", asks about "fast messaging", "simple pub/sub", "event streams with redis"

  DO NOT USE FOR: guaranteed delivery - use `kafka`, `rabbitmq`, or `pulsar`; complex routing - use `rabbitmq`; high durability needs - use `kafka`; enterprise features - use `activemq`; cloud-native - use cloud providers
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Redis Pub/Sub & Streams Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Streams consumer groups (Node.js, Java, Python), pending message recovery, TLS configuration, and Sentinel setup.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `redis-pubsub` for comprehensive documentation.

## Quick Start (Docker)

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
```

## Core Concepts

| Feature | Pub/Sub | Streams |
|---------|---------|---------|
| Persistence | No | Yes |
| Consumer Groups | No | Yes |
| Message History | No | Yes |
| Delivery | Fire-and-forget | At-least-once |
| Use Case | Real-time broadcast | Event sourcing, queues |

## Pub/Sub (Node.js)

```typescript
import Redis from 'ioredis';

const publisher = new Redis({ host: 'localhost', port: 6379 });
const subscriber = new Redis({ host: 'localhost', port: 6379 });

// Subscriber
subscriber.subscribe('orders', 'notifications', (err, count) => {
  console.log(`Subscribed to ${count} channels`);
});

subscriber.on('message', (channel, message) => {
  const data = JSON.parse(message);
  console.log(`Received on ${channel}:`, data);
});

// Pattern subscription
subscriber.psubscribe('order.*');
subscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`Pattern ${pattern}, Channel ${channel}:`, message);
});

// Publisher
await publisher.publish('orders', JSON.stringify({
  orderId: '123',
  status: 'created',
}));
```

## Pub/Sub (Java - Spring)

```java
@Configuration
public class RedisPubSubConfig {
    @Bean
    public RedisMessageListenerContainer container(
            RedisConnectionFactory connectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(orderListener(), new ChannelTopic("orders"));
        container.addMessageListener(orderPatternListener(), new PatternTopic("order.*"));
        return container;
    }

    @Bean
    public MessageListener orderListener() {
        return (message, pattern) -> {
            String body = new String(message.getBody());
            Order order = objectMapper.readValue(body, Order.class);
            processOrder(order);
        };
    }
}

@Service
public class OrderPublisher {
    @Autowired
    private StringRedisTemplate redisTemplate;

    public void publishOrder(Order order) {
        redisTemplate.convertAndSend("orders",
            objectMapper.writeValueAsString(order));
    }
}
```

## Pub/Sub (Python)

```python
import redis
import json

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Subscriber (run in thread)
def subscriber():
    pubsub = r.pubsub()
    pubsub.subscribe('orders')
    pubsub.psubscribe('order.*')

    for message in pubsub.listen():
        if message['type'] in ('message', 'pmessage'):
            data = json.loads(message['data'])
            print(f"Received: {data}")

# Publisher
r.publish('orders', json.dumps({'orderId': '123', 'status': 'created'}))
```

## Stream Commands Reference

| Command | Description |
|---------|-------------|
| `XADD` | Add entry to stream |
| `XREAD` | Read entries |
| `XREADGROUP` | Read with consumer group |
| `XACK` | Acknowledge processing |
| `XPENDING` | List pending entries |
| `XCLAIM` | Claim pending entry |
| `XTRIM` | Trim stream size |

## When NOT to Use This Skill

- Guaranteed message delivery - Pub/Sub is fire-and-forget
- Complex routing patterns - RabbitMQ is better
- High-throughput event sourcing - Kafka provides better throughput
- Multi-datacenter replication - Kafka or Pulsar handle this better

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Pub/Sub for critical data | No persistence | Use Streams |
| No XTRIM on streams | Memory growth | Set MAXLEN or auto-trim |
| Single consumer group | Can't scale | Use consumer groups |
| No XPENDING monitoring | Lost messages | Monitor and claim pending |
| No ACK after processing | Premature consumption | ACK only after success |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages not received | No active subscribers | Pub/Sub requires active subscribers |
| Stream growing unbounded | No XTRIM | Add MAXLEN limit |
| High memory usage | Large stream | Trim streams |
| Pending messages growing | Consumer crashes | Implement XCLAIM recovery |
| Duplicate processing | Consumer group issue | Ensure unique consumer IDs |

## Production Checklist

- [ ] Authentication enabled
- [ ] TLS configured
- [ ] Sentinel/Cluster for HA
- [ ] Stream trimming configured
- [ ] Consumer group monitoring
- [ ] Pending message handling
- [ ] Memory limits set
- [ ] Persistence configured (AOF)

## Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Stream length | > 1000000 |
| Pending entries | > 10000 |
| Consumer lag | > 1000 |
| Memory usage | > 80% |

## Reference Documentation

Available topics: `basics`, `pubsub`, `streams`, `patterns`
