---
name: spring-amqp
description: |
  Spring AMQP for RabbitMQ integration with RabbitTemplate and @RabbitListener.
  Covers exchanges, queues, bindings, DLQ, and message conversion.

  USE WHEN: user mentions "spring amqp", "RabbitTemplate", "@RabbitListener",
  "RabbitMQ Spring", "AMQP", "message queue Spring Boot"

  DO NOT USE FOR: raw RabbitMQ - use `rabbitmq` skill,
  Kafka - use `spring-kafka` skill, generic messaging patterns - use `messaging-expert`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring AMQP (RabbitMQ) - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for exchange types (topic, fanout), consumer patterns (multi-method, request-reply), error handling, DLQ processing, and testing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rabbitmq` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
```

## Configuration

```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest
    listener:
      simple:
        acknowledge-mode: manual
        concurrency: 3
        max-concurrency: 10
        prefetch: 10
```

## Exchange, Queue, Binding Setup

```java
@Configuration
public class RabbitMQConfig {

    public static final String EXCHANGE = "orders.exchange";
    public static final String QUEUE = "orders.queue";
    public static final String ROUTING_KEY = "orders.created";

    @Bean
    public DirectExchange ordersExchange() {
        return new DirectExchange(EXCHANGE);
    }

    @Bean
    public Queue ordersQueue() {
        return QueueBuilder.durable(QUEUE)
            .withArgument("x-dead-letter-exchange", "orders.dlx")
            .withArgument("x-dead-letter-routing-key", "dead")
            .build();
    }

    @Bean
    public Binding ordersBinding() {
        return BindingBuilder.bind(ordersQueue()).to(ordersExchange()).with(ROUTING_KEY);
    }

    @Bean
    public Jackson2JsonMessageConverter messageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
```

## Producer

```java
@Service
@RequiredArgsConstructor
public class OrderProducer {

    private final RabbitTemplate rabbitTemplate;

    public void sendOrder(OrderEvent event) {
        rabbitTemplate.convertAndSend(EXCHANGE, ROUTING_KEY, event);
    }

    public void sendWithHeaders(OrderEvent event, String correlationId) {
        rabbitTemplate.convertAndSend(EXCHANGE, ROUTING_KEY, event, message -> {
            message.getMessageProperties().setCorrelationId(correlationId);
            message.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
            return message;
        });
    }
}
```

## Consumer

```java
@Service
public class OrderConsumer {

    @RabbitListener(queues = "orders.queue")
    public void consume(
            @Payload OrderEvent event,
            @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag,
            @Header(AmqpHeaders.CORRELATION_ID) String correlationId,
            Channel channel) throws IOException {

        try {
            processOrder(event);
            channel.basicAck(deliveryTag, false);
        } catch (Exception e) {
            channel.basicNack(deliveryTag, false, false); // Send to DLQ
        }
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use manual acknowledgment | Auto-ack without processing |
| Configure DLX/DLQ | Silently lose failed messages |
| Set message TTL | Keep messages forever |
| Use persistent delivery | Transient for important messages |
| Configure prefetch | Unbounded prefetch |

## When NOT to Use This Skill

- **Raw RabbitMQ** - Use `rabbitmq` skill for server configuration
- **Kafka integration** - Use `spring-kafka` skill
- **Generic messaging patterns** - Consult `messaging-expert`

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Auto-ack without processing | Message loss | Use manual acknowledgment |
| No DLQ configured | Lost failed messages | Configure dead letter exchange |
| Unbounded prefetch | Memory issues | Set appropriate prefetch count |
| Blocking in listener | Thread exhaustion | Use async processing |
| No retry policy | Temporary failures cause loss | Configure retry with backoff |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check RabbitMQ running | Verify host/port |
| Message not consumed | Check queue binding | Verify routing key |
| Messages in DLQ | Check x-death header | Fix processing error |
| Consumer not starting | Check @RabbitListener | Verify queue exists |
| Serialization error | Check message type | Configure Jackson converter |

## Production Checklist

- [ ] Connection factory configured
- [ ] Manual acknowledgment mode
- [ ] DLX/DLQ configured
- [ ] Retry policy set
- [ ] Message converter configured
- [ ] Publisher confirms enabled
- [ ] Prefetch count optimized
- [ ] Error handler implemented
- [ ] Message TTL set
- [ ] Monitoring enabled

## Reference Documentation
- [Spring AMQP Reference](https://docs.spring.io/spring-amqp/reference/)
