---
name: spring-websocket
description: |
  Spring WebSocket for real-time communication in Spring Boot 3.x. Covers STOMP
  over WebSocket, SockJS fallback, message brokers (simple and RabbitMQ/Redis),
  security, session handling, and testing. Use for chat, live notifications, and
  real-time updates.

  USE WHEN: user mentions "spring websocket", "STOMP", "SockJS", "real-time Spring",
  "@MessageMapping", "@SendTo", "WebSocket security", "message broker Spring",
  "chat application Spring", "live notifications"

  DO NOT USE FOR: REST APIs - use `spring-rest` skill,
  server-sent events only - use simpler SSE endpoints,
  NestJS WebSocket - use `nestjs-websocket` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring WebSocket

## Quick Start

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Prefix for messages from server to clients (subscribe)
        registry.enableSimpleBroker("/topic", "/queue");
        // Prefix for messages from clients to server
        registry.setApplicationDestinationPrefixes("/app");
        // Prefix for private messages to a specific user
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOrigins("http://localhost:3000")
            .withSockJS();  // Fallback for browsers without WebSocket
    }
}
```

---

## Message Controller

```java
@Controller
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;

    // Receives message and broadcasts to all subscribers of /topic/chat
    @MessageMapping("/chat.send")
    @SendTo("/topic/chat")
    public ChatMessage sendMessage(ChatMessage message, Principal principal) {
        message.setSender(principal.getName());
        message.setTimestamp(Instant.now());
        return message;
    }

    // Direct reply to the sender
    @MessageMapping("/chat.echo")
    @SendToUser("/queue/reply")
    public ChatMessage echoMessage(ChatMessage message) {
        message.setContent("Echo: " + message.getContent());
        return message;
    }

    // Programmatic send to a specific user
    @MessageMapping("/chat.private")
    public void sendPrivateMessage(PrivateMessage message, Principal principal) {
        message.setSender(principal.getName());
        messagingTemplate.convertAndSendToUser(
            message.getRecipient(),
            "/queue/private",
            message
        );
    }

    // Broadcast to all
    public void broadcastNotification(NotificationMessage notification) {
        messagingTemplate.convertAndSend("/topic/notifications", notification);
    }
}
```

```java
// DTOs
public record ChatMessage(
    String id, String sender, String content,
    Instant timestamp, MessageType type
) {}

public enum MessageType { CHAT, JOIN, LEAVE, TYPING }

public record PrivateMessage(
    String sender, String recipient, String content, Instant timestamp
) {}
```

---

## Event Handlers

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final OnlineUserService onlineUserService;

    @EventListener
    public void handleSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        Principal principal = accessor.getUser();

        if (principal != null) {
            String username = principal.getName();
            onlineUserService.userConnected(username, sessionId);
            messagingTemplate.convertAndSend("/topic/users.online",
                new UserStatusMessage(username, UserStatus.ONLINE));
        }
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();

        onlineUserService.findBySessionId(sessionId).ifPresent(username -> {
            onlineUserService.userDisconnected(sessionId);
            messagingTemplate.convertAndSend("/topic/users.online",
                new UserStatusMessage(username, UserStatus.OFFLINE));
        });
    }
}
```

> **Full Reference**: See [security.md](security.md) for complete security configuration and validation.

---

## Security Essentials

```java
@Configuration
@EnableWebSocketSecurity
public class WebSocketSecurityConfig {

    @Bean
    public AuthorizationManager<Message<?>> messageAuthorizationManager(
            MessageMatcherDelegatingAuthorizationManager.Builder messages) {
        return messages
            .nullDestMatcher().permitAll()
            .simpSubscribeDestMatchers("/topic/public/**").permitAll()
            .simpSubscribeDestMatchers("/topic/**", "/queue/**").authenticated()
            .simpDestMatchers("/app/**").authenticated()
            .anyMessage().authenticated()
            .build();
    }
}
```

> **Full Reference**: See [security.md](security.md) for JWT auth, CSRF protection, and message validation.

---

## Session Attributes & Headers

```java
@Controller
public class ChatController {

    @MessageMapping("/chat.join")
    @SendTo("/topic/chat")
    public ChatMessage joinChat(
            @Payload JoinRequest request,
            @Header("simpSessionId") String sessionId,
            SimpMessageHeaderAccessor headerAccessor) {

        // Save attributes in the WebSocket session
        headerAccessor.getSessionAttributes().put("username", request.username());
        headerAccessor.getSessionAttributes().put("roomId", request.roomId());

        return new ChatMessage(null, request.username(),
            request.username() + " joined!", Instant.now(), MessageType.JOIN);
    }
}
```

---

## Error Handling

```java
@ControllerAdvice
public class WebSocketExceptionHandler {

    @MessageExceptionHandler
    @SendToUser("/queue/errors")
    public ErrorMessage handleException(Exception e) {
        return new ErrorMessage("ERROR", e.getMessage(), Instant.now());
    }

    @MessageExceptionHandler(AccessDeniedException.class)
    @SendToUser("/queue/errors")
    public ErrorMessage handleAccessDenied(AccessDeniedException e) {
        return new ErrorMessage("ACCESS_DENIED",
            "You don't have permission", Instant.now());
    }
}

public record ErrorMessage(String code, String message, Instant timestamp) {}
```

---

## Heartbeat Configuration

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue")
            .setHeartbeatValue(new long[]{10000, 10000})  // Server, Client in ms
            .setTaskScheduler(heartBeatScheduler());
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Bean
    public TaskScheduler heartBeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("ws-heartbeat-");
        scheduler.initialize();
        return scheduler;
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setMessageSizeLimit(128 * 1024)      // 128KB max message
            .setSendBufferSizeLimit(512 * 1024)       // 512KB send buffer
            .setSendTimeLimit(20 * 1000);             // 20s send timeout
    }
}
```

> **Full Reference**: See [brokers.md](brokers.md) for RabbitMQ and Redis external broker configuration.

---

## Best Practices

| Do | Don't |
|----|-------|
| Use STOMP + SockJS for cross-browser | Use raw WebSocket only |
| Implement heartbeat for disconnect detection | Rely on TCP keepalive |
| Use external broker (RabbitMQ) for scaling | Use simple broker in production |
| Validate payload before processing | Trust client input |
| Handle disconnections properly | Keep state in memory only |

---

## When NOT to Use This Skill

- **REST APIs** - Use `spring-rest` skill
- **Simple SSE** - Use SseEmitter endpoints
- **NestJS WebSocket** - Use `nestjs-websocket` skill
- **React client** - Use `react-websocket` skill for frontend

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Connection refused | Endpoint not configured | Verify registerStompEndpoints |
| 403 Forbidden | CORS not configured | Add setAllowedOrigins |
| No session | Principal null | Configure WebSocket authentication |
| Simple broker in prod | No horizontal scaling | Use RabbitMQ/Redis adapter |
| State in memory | Lost on restart | Use external session store |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check endpoint config | Verify registerStompEndpoints |
| 403 Forbidden | Check CORS | Add setAllowedOrigins |
| Principal is null | Check auth config | Implement AuthChannelInterceptor |
| Message too large | Check size limits | Increase setMessageSizeLimit |
| Heartbeat timeout | Check intervals | Configure heartbeat properly |

---

## Reference Files

| File | Content |
|------|---------|
| [brokers.md](brokers.md) | RabbitMQ, Redis external broker configuration |
| [security.md](security.md) | JWT Auth, CSRF, Message Validation |
| [advanced.md](advanced.md) | Low-level WebSocket, JS Client, Testing |

---

## External Documentation

- [Spring WebSocket](https://docs.spring.io/spring-framework/reference/web/websocket.html)
- [STOMP Protocol](https://stomp.github.io/)
