# Spring AMQP Advanced Patterns

## Exchange Types

### Topic Exchange (Pub/Sub)
```java
@Bean
public TopicExchange topicExchange() {
    return new TopicExchange("events.topic");
}

@Bean
public Queue allEventsQueue() {
    return new Queue("events.all");
}

@Bean
public Queue orderEventsQueue() {
    return new Queue("events.orders");
}

@Bean
public Binding allEventsBinding() {
    return BindingBuilder
        .bind(allEventsQueue())
        .to(topicExchange())
        .with("#"); // All messages
}

@Bean
public Binding orderEventsBinding() {
    return BindingBuilder
        .bind(orderEventsQueue())
        .to(topicExchange())
        .with("orders.*"); // orders.created, orders.updated, etc.
}
```

### Fanout Exchange (Broadcast)
```java
@Bean
public FanoutExchange fanoutExchange() {
    return new FanoutExchange("notifications.fanout");
}

@Bean
public Binding fanoutBinding1() {
    return BindingBuilder.bind(queue1()).to(fanoutExchange());
}

@Bean
public Binding fanoutBinding2() {
    return BindingBuilder.bind(queue2()).to(fanoutExchange());
}
```

## Consumer Patterns

### Declarative Queue Setup
```java
@RabbitListener(bindings = @QueueBinding(
    value = @Queue(value = "payments.queue", durable = "true"),
    exchange = @Exchange(value = "payments.exchange", type = ExchangeTypes.DIRECT),
    key = "payments.process"
))
public void processPayment(PaymentEvent event, Channel channel,
        @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {
    try {
        handlePayment(event);
        channel.basicAck(tag, false);
    } catch (Exception e) {
        channel.basicNack(tag, false, false);
    }
}
```

### Request-Reply Pattern
```java
// Client
@Service
public class OrderClient {

    @Autowired
    private RabbitTemplate rabbitTemplate;

    public OrderResponse createOrder(OrderRequest request) {
        return (OrderResponse) rabbitTemplate.convertSendAndReceive(
            "orders.exchange",
            "orders.create",
            request
        );
    }
}

// Server
@RabbitListener(queues = "orders.create.queue")
public OrderResponse handleCreateOrder(OrderRequest request) {
    Order order = orderService.create(request);
    return new OrderResponse(order.getId(), "CREATED");
}
```

### Multi-Method Handler
```java
@RabbitListener(queues = "events.queue")
@Service
public class EventHandler {

    @RabbitHandler
    public void handleOrderCreated(OrderCreatedEvent event) {
        log.info("Order created: {}", event.getOrderId());
    }

    @RabbitHandler
    public void handleOrderUpdated(OrderUpdatedEvent event) {
        log.info("Order updated: {}", event.getOrderId());
    }

    @RabbitHandler(isDefault = true)
    public void handleDefault(Object event) {
        log.warn("Unknown event: {}", event.getClass());
    }
}
```

## Error Handling

### Custom Error Handler
```java
@Configuration
public class RabbitErrorConfig {

    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory,
            Jackson2JsonMessageConverter messageConverter) {

        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(messageConverter);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setErrorHandler(new ConditionalRejectingErrorHandler(
            new MyFatalExceptionStrategy()));

        return factory;
    }
}

public class MyFatalExceptionStrategy extends DefaultExceptionStrategy {
    @Override
    public boolean isFatal(Throwable t) {
        return t.getCause() instanceof ValidationException
            || t.getCause() instanceof JsonParseException;
    }
}
```

### Retry with Backoff
```java
@Bean
public RetryOperationsInterceptor retryInterceptor() {
    return RetryInterceptorBuilder.stateless()
        .maxAttempts(3)
        .backOffOptions(1000, 2.0, 10000)
        .recoverer(new RejectAndDontRequeueRecoverer())
        .build();
}

@Bean
public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
        ConnectionFactory connectionFactory) {
    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setConnectionFactory(connectionFactory);
    factory.setAdviceChain(retryInterceptor());
    return factory;
}
```

## DLQ Processing

```java
@RabbitListener(queues = "orders.dlq")
public void processDlq(
        @Payload OrderEvent event,
        @Header("x-death") List<Map<String, Object>> xDeath,
        Channel channel,
        @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {

    log.warn("DLQ message received: {}", event.getOrderId());

    if (xDeath != null) {
        Map<String, Object> death = xDeath.get(0);
        String reason = (String) death.get("reason");
        Long count = (Long) death.get("count");
        log.warn("Death reason: {}, count: {}", reason, count);
    }

    // Store for manual review
    failedOrderRepository.save(new FailedOrder(event));
    channel.basicAck(tag, false);
}
```

## Testing

### @RabbitListenerTest
```java
@SpringBootTest
@AutoConfigureTestRabbitListener
class OrderConsumerTest {

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private RabbitListenerTestHarness harness;

    @Test
    void shouldConsumeOrder() throws Exception {
        OrderEvent event = new OrderEvent("123", "CREATED");

        rabbitTemplate.convertAndSend("orders.exchange", "orders.created", event);

        InvocationData invocation = harness.getNextInvocationDataFor("orderConsumer", 5, TimeUnit.SECONDS);
        assertThat(invocation).isNotNull();
        assertThat(invocation.getArguments()[0]).isEqualTo(event);
    }
}
```

### Testcontainers
```java
@SpringBootTest
@Testcontainers
class RabbitIntegrationTest {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldSendAndReceiveOrder() {
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("123", "CREATED"));

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                Optional<Order> order = orderRepository.findById("123");
                assertThat(order).isPresent();
                assertThat(order.get().getStatus()).isEqualTo("CREATED");
            });
    }
}
```

> **Deep dive**: For @SpringRabbitTest harness patterns, TestRabbitTemplate, and Node.js/Python RabbitMQ testing, see the `messaging-testing-rabbitmq` skill.

## Producer with Confirmation

```java
@Service
@RequiredArgsConstructor
public class OrderProducer {

    private final RabbitTemplate rabbitTemplate;

    public void sendWithConfirmation(OrderEvent event) {
        CorrelationData correlationData = new CorrelationData(event.getOrderId());

        rabbitTemplate.convertAndSend(
            RabbitMQConfig.EXCHANGE,
            RabbitMQConfig.ROUTING_KEY,
            event,
            correlationData
        );

        correlationData.getFuture().whenComplete((confirm, ex) -> {
            if (ex != null || !confirm.isAck()) {
                log.error("Message not confirmed: {}", event.getOrderId());
            }
        });
    }

    public void sendWithHeaders(OrderEvent event, String correlationId) {
        rabbitTemplate.convertAndSend(
            RabbitMQConfig.EXCHANGE,
            RabbitMQConfig.ROUTING_KEY,
            event,
            message -> {
                message.getMessageProperties().setCorrelationId(correlationId);
                message.getMessageProperties().setHeader("source", "order-service");
                message.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                return message;
            }
        );
    }
}
```
