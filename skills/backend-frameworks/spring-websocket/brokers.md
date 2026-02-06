# External Message Brokers

## RabbitMQ Broker

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-reactor-netty</artifactId>
</dependency>
```

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Usa RabbitMQ come broker esterno
        registry.enableStompBrokerRelay("/topic", "/queue")
            .setRelayHost("localhost")
            .setRelayPort(61613)  // STOMP port
            .setClientLogin("guest")
            .setClientPasscode("guest")
            .setSystemLogin("guest")
            .setSystemPasscode("guest")
            .setSystemHeartbeatSendInterval(10000)
            .setSystemHeartbeatReceiveInterval(10000);

        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }
}
```

---

## Redis Broker

Redis can be used as a message broker for WebSocket scaling using Redis Pub/Sub.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketRedisConfig implements WebSocketMessageBrokerConfigurer {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Simple broker for local, relay for Redis
        registry.enableSimpleBroker("/topic", "/queue")
            .setTaskScheduler(heartBeatScheduler());
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }
}

// Redis-backed broadcast service for multi-instance support
@Service
@RequiredArgsConstructor
@Slf4j
public class RedisWebSocketBroadcaster {

    private final RedisTemplate<String, String> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    private static final String BROADCAST_CHANNEL = "ws:broadcast";

    @PostConstruct
    public void subscribe() {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisTemplate.getConnectionFactory());
        container.addMessageListener(this::onMessage, new PatternTopic(BROADCAST_CHANNEL + ":*"));
        container.start();
    }

    public void broadcast(String destination, Object payload) {
        try {
            BroadcastMessage msg = new BroadcastMessage(destination, objectMapper.writeValueAsString(payload));
            redisTemplate.convertAndSend(BROADCAST_CHANNEL + ":" + destination, objectMapper.writeValueAsString(msg));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize broadcast message", e);
        }
    }

    private void onMessage(Message message, byte[] pattern) {
        try {
            BroadcastMessage msg = objectMapper.readValue(message.getBody(), BroadcastMessage.class);
            messagingTemplate.convertAndSend(msg.destination(), msg.payload());
        } catch (Exception e) {
            log.error("Failed to process broadcast message", e);
        }
    }

    record BroadcastMessage(String destination, String payload) {}
}
```

---

## Broker Selection Guide

| Broker | Use Case | Pros | Cons |
|--------|----------|------|------|
| Simple Broker | Development, single instance | No setup | No scaling |
| RabbitMQ | Production, STOMP native | Native STOMP support, reliable | Additional infra |
| Redis | Already using Redis | Reuses existing infra | Custom implementation |

### RabbitMQ STOMP Plugin

Enable STOMP plugin in RabbitMQ:

```bash
rabbitmq-plugins enable rabbitmq_stomp
```

Default STOMP port: 61613
