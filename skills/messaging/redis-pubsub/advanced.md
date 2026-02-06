# Redis Pub/Sub & Streams - Advanced Patterns

## Streams with Consumer Groups (Node.js)

```typescript
import Redis from 'ioredis';

const redis = new Redis({ host: 'localhost', port: 6379 });

// Producer - Add to stream
const messageId = await redis.xadd('orders-stream', '*',
  'orderId', order.id,
  'data', JSON.stringify(order),
  'timestamp', Date.now().toString(),
);
console.log(`Added message: ${messageId}`);

// Create consumer group
try {
  await redis.xgroup('CREATE', 'orders-stream', 'order-processors', '0', 'MKSTREAM');
} catch (e) {
  // Group already exists
}

// Consumer with group
async function consumeStream(consumerId: string) {
  while (true) {
    const results = await redis.xreadgroup(
      'GROUP', 'order-processors', consumerId,
      'COUNT', 10,
      'BLOCK', 5000,
      'STREAMS', 'orders-stream', '>'
    );

    if (!results) continue;

    for (const [stream, messages] of results) {
      for (const [id, fields] of messages) {
        try {
          const order = JSON.parse(fields[fields.indexOf('data') + 1]);
          await processOrder(order);

          // Acknowledge
          await redis.xack('orders-stream', 'order-processors', id);
        } catch (error) {
          console.error(`Failed to process ${id}:`, error);
          // Will be redelivered via XPENDING
        }
      }
    }
  }
}

// Claim pending messages (handle failures)
async function claimPending() {
  const pending = await redis.xpending(
    'orders-stream', 'order-processors',
    '-', '+', 100
  );

  for (const [id, consumer, idleTime, deliveryCount] of pending) {
    if (idleTime > 60000) { // Idle > 1 minute
      const claimed = await redis.xclaim(
        'orders-stream', 'order-processors', 'recovery-consumer',
        60000, id
      );
      // Process claimed messages
    }
  }
}
```

## Streams with Consumer Groups (Java)

```java
@Configuration
public class RedisStreamConfig {
    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>>
            streamMessageListenerContainer(RedisConnectionFactory connectionFactory) {

        StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
            StreamMessageListenerContainerOptions.builder()
                .pollTimeout(Duration.ofSeconds(5))
                .batchSize(10)
                .build();

        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
            StreamMessageListenerContainer.create(connectionFactory, options);

        // Create consumer group
        try {
            redisTemplate.opsForStream().createGroup("orders-stream", "order-processors");
        } catch (Exception e) {
            // Group exists
        }

        container.receive(
            Consumer.from("order-processors", "consumer-1"),
            StreamOffset.create("orders-stream", ReadOffset.lastConsumed()),
            new OrderStreamListener()
        );

        container.start();
        return container;
    }
}

@Component
public class OrderStreamListener implements StreamListener<String, MapRecord<String, String, String>> {
    @Autowired
    private StringRedisTemplate redisTemplate;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        try {
            String data = message.getValue().get("data");
            Order order = objectMapper.readValue(data, Order.class);
            processOrder(order);

            // Acknowledge
            redisTemplate.opsForStream().acknowledge("order-processors", message);
        } catch (Exception e) {
            log.error("Failed to process message", e);
            // Don't ack - will be redelivered
        }
    }
}

@Service
public class OrderStreamProducer {
    @Autowired
    private StringRedisTemplate redisTemplate;

    public String sendOrder(Order order) {
        Map<String, String> fields = Map.of(
            "orderId", order.getId(),
            "data", objectMapper.writeValueAsString(order),
            "timestamp", String.valueOf(System.currentTimeMillis())
        );

        RecordId recordId = redisTemplate.opsForStream()
            .add("orders-stream", fields);

        return recordId.getValue();
    }
}
```

## Streams with Consumer Groups (Python)

```python
import redis
import json
import time

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Producer
def send_order(order):
    message_id = r.xadd('orders-stream', {
        'orderId': order['id'],
        'data': json.dumps(order),
        'timestamp': str(int(time.time() * 1000))
    })
    return message_id

# Create consumer group
try:
    r.xgroup_create('orders-stream', 'order-processors', id='0', mkstream=True)
except redis.exceptions.ResponseError:
    pass  # Group exists

# Consumer
def consume_stream(consumer_id):
    while True:
        results = r.xreadgroup(
            'order-processors', consumer_id,
            {'orders-stream': '>'},
            count=10,
            block=5000
        )

        if not results:
            continue

        for stream, messages in results:
            for message_id, fields in messages:
                try:
                    order = json.loads(fields['data'])
                    process_order(order)
                    r.xack('orders-stream', 'order-processors', message_id)
                except Exception as e:
                    print(f"Failed: {e}")

# Claim pending
def claim_pending():
    pending = r.xpending_range('orders-stream', 'order-processors', '-', '+', 100)
    for entry in pending:
        if entry['time_since_delivered'] > 60000:
            claimed = r.xclaim('orders-stream', 'order-processors',
                             'recovery', 60000, entry['message_id'])
```

## Security Configuration

```conf
# redis.conf
requirepass your-strong-password
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command DEBUG ""

# TLS
tls-port 6380
tls-cert-file /path/to/redis.crt
tls-key-file /path/to/redis.key
tls-ca-cert-file /path/to/ca.crt
```

```typescript
// Client with TLS
const redis = new Redis({
  host: 'redis.example.com',
  port: 6380,
  password: 'your-strong-password',
  tls: {
    ca: fs.readFileSync('/path/to/ca.crt'),
  },
});
```

## High Availability (Sentinel)

```typescript
const redis = new Redis({
  sentinels: [
    { host: 'sentinel-1', port: 26379 },
    { host: 'sentinel-2', port: 26379 },
    { host: 'sentinel-3', port: 26379 },
  ],
  name: 'mymaster',
  password: 'password',
});
```

## Stream Management

```bash
# Trim stream to max length
XTRIM orders-stream MAXLEN ~ 1000000

# Trim by ID (remove old entries)
XTRIM orders-stream MINID ~ 1234567890123-0
```

```typescript
// Auto-trim on add
await redis.xadd('orders-stream', 'MAXLEN', '~', '1000000', '*',
  'data', JSON.stringify(order));
```

## Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Stream length | > 1000000 |
| Pending entries | > 10000 |
| Consumer lag | > 1000 |
| Memory usage | > 80% |
| Connected clients | > expected |
