# Spring Integration Adapters

## File Adapter

```java
@Configuration
public class FileIntegrationConfig {

    // File Inbound
    @Bean
    public IntegrationFlow fileInboundFlow() {
        return IntegrationFlow
            .from(Files.inboundAdapter(new File("/data/input"))
                    .patternFilter("*.csv")
                    .preventDuplicates(true)
                    .useWatchService(true),
                e -> e.poller(Pollers.fixedDelay(5000)))
            .transform(Files.toStringTransformer())
            .split(s -> s.delimiters("\n"))
            .filter(String.class, line -> !line.startsWith("#"))
            .transform(this::parseCsvLine)
            .handle("recordProcessor", "process")
            .get();
    }

    // File Outbound
    @Bean
    public IntegrationFlow fileOutboundFlow() {
        return IntegrationFlow
            .from("outputChannel")
            .transform(Transformers.toJson())
            .handle(Files.outboundAdapter(new File("/data/output"))
                .fileNameGenerator(m -> "output-" + m.getHeaders().get("id") + ".json")
                .autoCreateDirectory(true)
                .appendNewLine(true))
            .get();
    }

    // File with move after processing
    @Bean
    public IntegrationFlow fileWithMoveFlow() {
        return IntegrationFlow
            .from(Files.inboundAdapter(new File("/data/inbox"))
                    .patternFilter("*.xml"),
                e -> e.poller(Pollers.fixedDelay(1000)))
            .handle((payload, headers) -> {
                // Process file
                return payload;
            })
            .handle(Files.outboundGateway(new File("/data/processed"))
                .deleteSourceFiles(true))
            .get();
    }
}
```

---

## HTTP Adapter

```java
@Configuration
public class HttpIntegrationConfig {

    // HTTP Inbound (receives requests)
    @Bean
    public IntegrationFlow httpInboundFlow() {
        return IntegrationFlow
            .from(Http.inboundGateway("/api/orders")
                .requestMapping(r -> r.methods(HttpMethod.POST))
                .requestPayloadType(OrderRequest.class)
                .replyTimeout(5000))
            .transform(this::mapToOrder)
            .handle("orderService", "create")
            .transform(Transformers.toJson())
            .get();
    }

    // HTTP Outbound (sends requests)
    @Bean
    public IntegrationFlow httpOutboundFlow() {
        return IntegrationFlow
            .from("externalApiChannel")
            .handle(Http.outboundGateway("https://api.external.com/process")
                .httpMethod(HttpMethod.POST)
                .expectedResponseType(ApiResponse.class)
                .errorHandler(new DefaultResponseErrorHandler()))
            .get();
    }

    // HTTP with retry
    @Bean
    public IntegrationFlow httpWithRetryFlow() {
        return IntegrationFlow
            .from("webhookChannel")
            .handle(Http.outboundGateway(m ->
                    m.getHeaders().get("webhookUrl", String.class))
                .httpMethod(HttpMethod.POST)
                .expectedResponseType(String.class),
                e -> e.advice(retryAdvice()))
            .get();
    }

    @Bean
    public RequestHandlerRetryAdvice retryAdvice() {
        RequestHandlerRetryAdvice advice = new RequestHandlerRetryAdvice();
        RetryTemplate retryTemplate = RetryTemplate.builder()
            .maxAttempts(3)
            .exponentialBackoff(1000, 2, 10000)
            .retryOn(RestClientException.class)
            .build();
        advice.setRetryTemplate(retryTemplate);
        return advice;
    }
}
```

---

## Kafka Adapter

```xml
<dependency>
    <groupId>org.springframework.integration</groupId>
    <artifactId>spring-integration-kafka</artifactId>
</dependency>
```

```java
@Configuration
public class KafkaIntegrationConfig {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    // Kafka Outbound
    @Bean
    public IntegrationFlow kafkaOutboundFlow() {
        return IntegrationFlow
            .from("orderEventChannel")
            .transform(Transformers.toJson())
            .handle(Kafka.outboundChannelAdapter(kafkaTemplate)
                .topic("orders")
                .messageKey(m -> m.getHeaders().get("orderId", String.class))
                .partitionId(m -> m.getHeaders().get("partition", Integer.class)))
            .get();
    }

    // Kafka Inbound
    @Bean
    public IntegrationFlow kafkaInboundFlow(ConsumerFactory<String, String> cf) {
        return IntegrationFlow
            .from(Kafka.messageDrivenChannelAdapter(cf,
                    KafkaMessageDrivenChannelAdapter.ListenerMode.record, "orders")
                .configureListenerContainer(c -> c
                    .ackMode(ContainerProperties.AckMode.MANUAL)
                    .concurrency(3)))
            .transform(Transformers.fromJson(OrderEvent.class))
            .handle("orderEventHandler", "handle")
            .get();
    }

    // Kafka with error handling
    @Bean
    public IntegrationFlow kafkaWithErrorHandling(ConsumerFactory<String, String> cf) {
        return IntegrationFlow
            .from(Kafka.messageDrivenChannelAdapter(cf, "orders")
                .configureListenerContainer(c -> c
                    .errorHandler(new SeekToCurrentErrorHandler(
                        new DeadLetterPublishingRecoverer(kafkaTemplate),
                        new FixedBackOff(1000, 3)))))
            .transform(Transformers.fromJson(OrderEvent.class))
            .handle("orderEventHandler", "handle")
            .get();
    }
}
```

---

## Error Handling

```java
@Configuration
public class ErrorHandlingConfig {

    // Global error channel
    @Bean
    public IntegrationFlow errorFlow() {
        return IntegrationFlow
            .from("errorChannel")
            .handle(message -> {
                MessagingException exception = (MessagingException) message.getPayload();
                Message<?> failedMessage = exception.getFailedMessage();
                Throwable cause = exception.getCause();

                log.error("Error processing message: {}", failedMessage, cause);

                errorRepository.save(new FailedMessage(
                    failedMessage.getPayload().toString(),
                    cause.getMessage(),
                    Instant.now()
                ));
            })
            .get();
    }

    // Error channel per specific flow
    @Bean
    public IntegrationFlow orderFlowWithErrorHandling() {
        return IntegrationFlow
            .from("orderChannel")
            .handle("orderProcessor", "process",
                e -> e.advice(expressionAdvice()))
            .get();
    }

    @Bean
    public ExpressionEvaluatingRequestHandlerAdvice expressionAdvice() {
        ExpressionEvaluatingRequestHandlerAdvice advice =
            new ExpressionEvaluatingRequestHandlerAdvice();
        advice.setSuccessChannelName("successChannel");
        advice.setFailureChannelName("failureChannel");
        advice.setOnFailureExpressionString("payload");
        advice.setTrapException(true);
        return advice;
    }

    // Retry advice
    @Bean
    public RequestHandlerRetryAdvice retryAdvice() {
        RequestHandlerRetryAdvice advice = new RequestHandlerRetryAdvice();

        RetryTemplate retryTemplate = RetryTemplate.builder()
            .maxAttempts(3)
            .exponentialBackoff(1000, 2.0, 10000)
            .retryOn(TransientException.class)
            .build();

        advice.setRetryTemplate(retryTemplate);
        advice.setRecoveryCallback(context -> {
            log.error("All retries exhausted for message: {}",
                context.getAttribute("message"));
            return null;
        });

        return advice;
    }
}
```

---

## Testing

```java
@SpringIntegrationTest
@SpringBootTest
class OrderIntegrationFlowTest {

    @Autowired
    private MockIntegrationContext mockIntegrationContext;

    @Autowired
    @Qualifier("orderChannel")
    private MessageChannel orderChannel;

    @Autowired
    @Qualifier("resultChannel")
    private QueueChannel resultChannel;

    @Test
    void orderFlow_shouldProcessOrder() {
        Order order = new Order(1L, new BigDecimal("100"), OrderType.STANDARD);

        orderChannel.send(MessageBuilder.withPayload(order).build());

        Message<?> result = resultChannel.receive(5000);

        assertThat(result).isNotNull();
        assertThat(result.getPayload())
            .isInstanceOf(OrderResult.class)
            .extracting("status")
            .isEqualTo("PROCESSED");
    }

    @Test
    void orderFlow_withMockedHandler() {
        mockIntegrationContext.substituteMessageHandlerFor(
            "externalServiceHandler",
            mockHandler -> mockHandler
                .handleNext(m -> MessageBuilder
                    .withPayload(new ExternalResponse("SUCCESS"))
                    .build()));

        Order order = new Order(1L, new BigDecimal("100"), OrderType.STANDARD);
        orderChannel.send(MessageBuilder.withPayload(order).build());

        Message<?> result = resultChannel.receive(5000);
        assertThat(result).isNotNull();
    }

    @AfterEach
    void tearDown() {
        mockIntegrationContext.resetBeans();
    }
}
```
