# RabbitMQ Advanced Patterns

## Producer Patterns - Multi-Language

### Node.js (amqplib)
```typescript
import amqp from 'amqplib';

const connection = await amqp.connect('amqp://admin:admin@localhost:5672');
const channel = await connection.createChannel();

// Declare exchange
await channel.assertExchange('orders', 'topic', { durable: true });

// Publish message
channel.publish(
  'orders',                           // exchange
  'order.created',                    // routing key
  Buffer.from(JSON.stringify(order)),
  {
    persistent: true,                 // Survive broker restart
    contentType: 'application/json',
    headers: {
      'correlation-id': correlationId,
      'x-retry-count': 0,
    },
    messageId: uuidv4(),
    timestamp: Date.now(),
  }
);

// Confirm mode for reliability
const confirmChannel = await connection.createConfirmChannel();
await confirmChannel.assertExchange('orders', 'topic', { durable: true });

confirmChannel.publish('orders', 'order.created', Buffer.from(JSON.stringify(order)),
  { persistent: true },
  (err) => {
    if (err) console.error('Message nacked');
    else console.log('Message acked');
  }
);

await confirmChannel.waitForConfirms();
```

### Java (Spring AMQP)
```java
@Configuration
public class RabbitConfig {
    @Bean
    public TopicExchange orderExchange() {
        return new TopicExchange("orders");
    }

    @Bean
    public Queue orderCreatedQueue() {
        return QueueBuilder.durable("order.created.queue")
            .withArgument("x-dead-letter-exchange", "orders.dlx")
            .withArgument("x-dead-letter-routing-key", "order.created.dlq")
            .build();
    }

    @Bean
    public Binding orderCreatedBinding() {
        return BindingBuilder.bind(orderCreatedQueue())
            .to(orderExchange())
            .with("order.created");
    }
}

@Service
public class OrderProducer {
    @Autowired
    private RabbitTemplate rabbitTemplate;

    public void sendOrder(Order order) {
        rabbitTemplate.convertAndSend("orders", "order.created", order, message -> {
            message.getMessageProperties().setCorrelationId(UUID.randomUUID().toString());
            message.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
            return message;
        });
    }
}
```

### Python (pika)
```python
import pika
import json

credentials = pika.PlainCredentials('admin', 'admin')
connection = pika.BlockingConnection(
    pika.ConnectionParameters('localhost', 5672, '/', credentials)
)
channel = connection.channel()

channel.exchange_declare(exchange='orders', exchange_type='topic', durable=True)
channel.confirm_delivery()

try:
    channel.basic_publish(
        exchange='orders',
        routing_key='order.created',
        body=json.dumps(order),
        properties=pika.BasicProperties(
            delivery_mode=2,  # Persistent
            content_type='application/json',
            correlation_id=correlation_id,
        )
    )
except pika.exceptions.UnroutableError:
    print("Message was not routed")
finally:
    connection.close()
```

### Go (amqp091-go)
```go
package main

import (
    "encoding/json"
    amqp "github.com/rabbitmq/amqp091-go"
)

func main() {
    conn, _ := amqp.Dial("amqp://admin:admin@localhost:5672/")
    defer conn.Close()

    ch, _ := conn.Channel()
    defer ch.Close()

    ch.ExchangeDeclare("orders", "topic", true, false, false, false, nil)
    ch.Confirm(false)
    confirms := ch.NotifyPublish(make(chan amqp.Confirmation, 1))

    body, _ := json.Marshal(order)

    ch.Publish("orders", "order.created", false, false, amqp.Publishing{
        DeliveryMode:  amqp.Persistent,
        ContentType:   "application/json",
        Body:          body,
        CorrelationId: correlationId,
    })

    confirmed := <-confirms
    if !confirmed.Ack {
        log.Printf("Failed to publish message")
    }
}
```

## Consumer Patterns - Multi-Language

### Node.js Consumer
```typescript
const channel = await connection.createChannel();

await channel.assertQueue('order.created.queue', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'order.created.dlq',
  },
});

await channel.bindQueue('order.created.queue', 'orders', 'order.created');
await channel.prefetch(10);

channel.consume('order.created.queue', async (msg) => {
  if (!msg) return;

  try {
    const order = JSON.parse(msg.content.toString());
    await processOrder(order);
    channel.ack(msg);
  } catch (error) {
    const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;

    if (retryCount < 3) {
      channel.publish('orders', 'order.created', msg.content, {
        ...msg.properties,
        headers: { ...msg.properties.headers, 'x-retry-count': retryCount },
      });
      channel.ack(msg);
    } else {
      channel.nack(msg, false, false);
    }
  }
}, { noAck: false });
```

### Python Consumer
```python
channel.queue_declare(
    queue='order.created.queue',
    durable=True,
    arguments={
        'x-dead-letter-exchange': 'orders.dlx',
        'x-dead-letter-routing-key': 'order.created.dlq',
    }
)

channel.queue_bind(queue='order.created.queue', exchange='orders', routing_key='order.created')
channel.basic_qos(prefetch_count=10)

def callback(ch, method, properties, body):
    try:
        order = json.loads(body)
        process_order(order)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        retry_count = (properties.headers or {}).get('x-retry-count', 0) + 1
        if retry_count < 3:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        else:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

channel.basic_consume(queue='order.created.queue', on_message_callback=callback)
channel.start_consuming()
```

## Security Configuration

```ini
# rabbitmq.conf
listeners.ssl.default = 5671
ssl_options.cacertfile = /path/to/ca.pem
ssl_options.certfile = /path/to/server.pem
ssl_options.keyfile = /path/to/server-key.pem
ssl_options.verify = verify_peer
ssl_options.fail_if_no_peer_cert = true
```

```typescript
// Client with TLS
const connection = await amqp.connect({
  protocol: 'amqps',
  hostname: 'rabbitmq.example.com',
  port: 5671,
  username: 'user',
  password: 'password',
  vhost: '/production',
  ssl: {
    ca: [fs.readFileSync('/path/to/ca.pem')],
    cert: fs.readFileSync('/path/to/client.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),
  },
});
```

## High Availability

```ini
# rabbitmq.conf for clustering
cluster_formation.peer_discovery_backend = rabbit_peer_discovery_k8s
cluster_formation.k8s.host = kubernetes.default.svc.cluster.local
cluster_formation.k8s.address_type = hostname

# Quorum queues (recommended for HA)
queue_master_locator = min-masters
```

```typescript
// Declare quorum queue
await channel.assertQueue('orders.queue', {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    'x-delivery-limit': 3,
  },
});
```

## Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Queue depth | > 10000 messages |
| Consumer utilization | < 50% |
| Memory usage | > 80% |
| Disk space | > 80% |
| Connection count | > 1000 |
| Unacked messages | > 1000 |
