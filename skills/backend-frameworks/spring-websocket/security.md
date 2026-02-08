# WebSocket Security

## Spring Security Integration

```java
@Configuration
@EnableWebSocketSecurity
public class WebSocketSecurityConfig {

    @Bean
    public AuthorizationManager<Message<?>> messageAuthorizationManager(
            MessageMatcherDelegatingAuthorizationManager.Builder messages) {
        return messages
            // Everyone can connect
            .nullDestMatcher().permitAll()
            // Subscription to public topics
            .simpSubscribeDestMatchers("/topic/public/**").permitAll()
            // Subscription to authenticated topics
            .simpSubscribeDestMatchers("/topic/**", "/queue/**").authenticated()
            // Private messages only for authenticated users
            .simpDestMatchers("/app/**").authenticated()
            // Any other message requires authentication
            .anyMessage().authenticated()
            .build();
    }
}
```

---

## JWT Authentication Interceptor

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new AuthChannelInterceptor());
    }
}

@Component
@RequiredArgsConstructor
public class AuthChannelInterceptor implements ChannelInterceptor {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor
            .getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String authHeader = accessor.getFirstNativeHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    Authentication auth = jwtTokenProvider.getAuthentication(token);
                    accessor.setUser(auth);
                    SecurityContextHolder.getContext().setAuthentication(auth);
                } catch (Exception e) {
                    throw new MessageDeliveryException("Invalid token");
                }
            }
        }

        return message;
    }
}
```

---

## CSRF Protection

WebSocket handshake is HTTP-based and requires CSRF protection.

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf
                // Use CookieCsrfTokenRepository for SPA clients
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                // WebSocket endpoint needs CSRF token
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
            )
            .build();
    }
}
```

```java
// STOMP client must send CSRF token on CONNECT
@Component
public class CsrfChannelInterceptor implements ChannelInterceptor {

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor
            .getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String csrfToken = accessor.getFirstNativeHeader("X-CSRF-TOKEN");
            // Validate token against session
            if (csrfToken == null || !isValidCsrfToken(csrfToken)) {
                throw new MessageDeliveryException("Invalid CSRF token");
            }
        }
        return message;
    }
}
```

```javascript
// JavaScript client - send CSRF token
const csrfToken = document.querySelector('meta[name="_csrf"]')?.content;

const client = new Client({
    webSocketFactory: () => new SockJS('/ws'),
    connectHeaders: {
        'X-CSRF-TOKEN': csrfToken
    }
});
```

---

## Message Validation

```java
@Controller
public class ChatController {

    @MessageMapping("/chat.send")
    @SendTo("/topic/chat")
    public ChatMessage sendMessage(@Valid @Payload ChatMessage message, Principal principal) {
        // The message is already validated
        return message.withSender(principal.getName());
    }
}

// DTO with validation
public record ChatMessage(
    String id,

    @Size(max = 50)
    String sender,

    @NotBlank
    @Size(max = 1000, message = "Message too long")
    String content,

    Instant timestamp,

    MessageType type
) {
    public ChatMessage withSender(String newSender) {
        return new ChatMessage(id, newSender, content, Instant.now(), type);
    }
}
```

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Autowired
    private Validator validator;

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new PayloadValidatorInterceptor(validator));
    }
}

public class PayloadValidatorInterceptor implements ChannelInterceptor {

    private final Validator validator;

    public PayloadValidatorInterceptor(Validator validator) {
        this.validator = validator;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        Object payload = message.getPayload();

        if (payload instanceof byte[]) {
            return message; // Skip raw bytes
        }

        Set<ConstraintViolation<Object>> violations = validator.validate(payload);
        if (!violations.isEmpty()) {
            String errors = violations.stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .collect(Collectors.joining(", "));
            throw new ValidationException("Validation failed: " + errors);
        }

        return message;
    }
}
```

---

## Security Checklist

- [ ] Enable `@EnableWebSocketSecurity`
- [ ] Configure destination matchers for auth
- [ ] Implement JWT/session auth interceptor
- [ ] Enable CSRF for handshake endpoint
- [ ] Validate all message payloads
- [ ] Rate-limit message sending
- [ ] Sanitize user input in messages
