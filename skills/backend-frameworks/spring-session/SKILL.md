---
name: spring-session
description: |
  Spring Session for distributed session management with Redis, JDBC, or Hazelcast.
  Covers session configuration, security integration, and session events.

  USE WHEN: user mentions "spring session", "distributed session", "session Redis",
  "session JDBC", "session cluster", "session management", "@SessionScope"

  DO NOT USE FOR: stateless JWT auth - use `jwt` skill,
  OAuth2 tokens - use `oauth2` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Session - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-session` for comprehensive documentation.

## Dependencies

```xml
<!-- Redis Backend -->
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>

<!-- JDBC Backend -->
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-jdbc</artifactId>
</dependency>

<!-- Hazelcast Backend -->
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-hazelcast</artifactId>
</dependency>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                            │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Instance 1  │   │   Instance 2  │   │   Instance 3  │
│   App Server  │   │   App Server  │   │   App Server  │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              ┌─────────────────────────┐
              │   Session Store         │
              │   (Redis/JDBC/Hazelcast)│
              └─────────────────────────┘
```

## Redis Configuration

### application.yml
```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      password: ${REDIS_PASSWORD:}

  session:
    store-type: redis
    timeout: 30m
    redis:
      namespace: spring:session
      flush-mode: on_save  # immediate or on_save
      cleanup-cron: "0 * * * * *"  # Every minute
```

### Java Configuration
```java
@Configuration
@EnableRedisHttpSession(
    maxInactiveIntervalInSeconds = 1800,  // 30 minutes
    redisNamespace = "myapp:session",
    flushMode = FlushMode.ON_SAVE
)
public class SessionConfig {

    @Bean
    public LettuceConnectionFactory connectionFactory() {
        return new LettuceConnectionFactory();
    }

    @Bean
    public RedisSerializer<Object> springSessionDefaultRedisSerializer() {
        return new GenericJackson2JsonRedisSerializer();
    }
}
```

## JDBC Configuration

### application.yml
```yaml
spring:
  session:
    store-type: jdbc
    timeout: 30m
    jdbc:
      initialize-schema: always  # always, embedded, never
      table-name: SPRING_SESSION
      cleanup-cron: "0 * * * * *"
```

### Schema
```sql
-- Auto-created with initialize-schema: always
-- Or create manually:

CREATE TABLE SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL,
    SESSION_ID CHAR(36) NOT NULL,
    CREATION_TIME BIGINT NOT NULL,
    LAST_ACCESS_TIME BIGINT NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME BIGINT NOT NULL,
    PRINCIPAL_NAME VARCHAR(100),
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36) NOT NULL,
    ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
    ATTRIBUTE_BYTES BYTEA NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID)
        REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);
```

## Session Usage

### Controller
```java
@RestController
@RequestMapping("/api")
public class SessionController {

    @GetMapping("/session/info")
    public Map<String, Object> getSessionInfo(HttpSession session) {
        return Map.of(
            "sessionId", session.getId(),
            "creationTime", new Date(session.getCreationTime()),
            "lastAccessedTime", new Date(session.getLastAccessedTime()),
            "maxInactiveInterval", session.getMaxInactiveInterval()
        );
    }

    @PostMapping("/session/attribute")
    public void setAttribute(
            HttpSession session,
            @RequestParam String key,
            @RequestParam String value) {
        session.setAttribute(key, value);
    }

    @GetMapping("/session/attribute/{key}")
    public String getAttribute(HttpSession session, @PathVariable String key) {
        return (String) session.getAttribute(key);
    }

    @DeleteMapping("/session/invalidate")
    public void invalidateSession(HttpSession session) {
        session.invalidate();
    }
}
```

### @SessionAttributes
```java
@Controller
@SessionAttributes("cart")
public class CartController {

    @ModelAttribute("cart")
    public Cart createCart() {
        return new Cart();
    }

    @PostMapping("/cart/add")
    public String addToCart(
            @ModelAttribute("cart") Cart cart,
            @RequestParam Long productId) {
        cart.addItem(productId);
        return "redirect:/cart";
    }

    @PostMapping("/cart/checkout")
    public String checkout(
            @ModelAttribute("cart") Cart cart,
            SessionStatus status) {
        orderService.createOrder(cart);
        status.setComplete();  // Remove from session
        return "redirect:/orders";
    }
}
```

### @SessionScope Bean
```java
@Component
@SessionScope
public class UserPreferences implements Serializable {

    private String theme = "light";
    private String language = "en";
    private int pageSize = 20;

    // getters and setters
}

@RestController
public class PreferencesController {

    @Autowired
    private UserPreferences preferences;  // Session-scoped

    @PutMapping("/preferences/theme")
    public void setTheme(@RequestParam String theme) {
        preferences.setTheme(theme);
    }
}
```

## Security Integration

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                .maximumSessions(1)  // One session per user
                .maxSessionsPreventsLogin(true)  // Prevent new login
                .sessionRegistry(sessionRegistry())
            )
            .logout(logout -> logout
                .invalidateHttpSession(true)
                .deleteCookies("SESSION")
            );
        return http.build();
    }

    @Bean
    public SpringSessionBackedSessionRegistry<?> sessionRegistry() {
        return new SpringSessionBackedSessionRegistry<>(sessionRepository);
    }
}
```

### Find Sessions by Principal
```java
@Service
@RequiredArgsConstructor
public class SessionManagementService {

    private final FindByIndexNameSessionRepository<?> sessionRepository;

    public Map<String, ?> findSessionsByUsername(String username) {
        return sessionRepository.findByPrincipalName(username);
    }

    public void invalidateUserSessions(String username) {
        Map<String, ?> sessions = sessionRepository.findByPrincipalName(username);
        sessions.keySet().forEach(sessionRepository::deleteById);
    }
}
```

## Custom Session Repository

```java
@Configuration
@EnableRedisHttpSession
public class CustomSessionConfig {

    @Bean
    public SessionRepositoryCustomizer<RedisIndexedSessionRepository> customizer() {
        return sessionRepository -> {
            sessionRepository.setDefaultMaxInactiveInterval(Duration.ofMinutes(30));
            sessionRepository.setRedisKeyNamespace("app:sessions");
        };
    }
}
```

## Session Events

```java
@Component
@Slf4j
public class SessionEventListener {

    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        log.info("Session created: {}", event.getSessionId());
    }

    @EventListener
    public void onSessionDeleted(SessionDeletedEvent event) {
        log.info("Session deleted: {}", event.getSessionId());
    }

    @EventListener
    public void onSessionExpired(SessionExpiredEvent event) {
        log.info("Session expired: {}", event.getSessionId());
    }
}
```

## Cookie Configuration

```java
@Configuration
public class CookieConfig {

    @Bean
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSIONID");
        serializer.setCookiePath("/");
        serializer.setDomainNamePattern("^.+?\\.(\\w+\\.[a-z]+)$");
        serializer.setSameSite("Strict");
        serializer.setUseSecureCookie(true);
        serializer.setUseHttpOnlyCookie(true);
        serializer.setCookieMaxAge(3600);  // 1 hour
        return serializer;
    }
}
```

## Header-Based Session (REST APIs)

```java
@Configuration
@EnableRedisHttpSession
public class HeaderSessionConfig {

    @Bean
    public HttpSessionIdResolver httpSessionIdResolver() {
        return HeaderHttpSessionIdResolver.xAuthToken();
        // Or custom header:
        // return new HeaderHttpSessionIdResolver("X-Session-Id");
    }
}

// Client sends: X-Auth-Token: <session-id>
```

## WebSocket Session

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new SessionChannelInterceptor());
    }
}

public class SessionChannelInterceptor implements ChannelInterceptor {

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            // Access session attributes
            Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        }
        return message;
    }
}
```

## Testing

```java
@SpringBootTest
@AutoConfigureMockMvc
class SessionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldMaintainSessionAcrossRequests() throws Exception {
        // First request - set attribute
        MvcResult result = mockMvc.perform(post("/api/session/attribute")
                .param("key", "user")
                .param("value", "john"))
            .andExpect(status().isOk())
            .andReturn();

        MockHttpSession session = (MockHttpSession) result.getRequest().getSession();

        // Second request - get attribute with same session
        mockMvc.perform(get("/api/session/attribute/user")
                .session(session))
            .andExpect(status().isOk())
            .andExpect(content().string("john"));
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use Redis for distributed sessions | Use in-memory sessions in cluster |
| Configure proper timeout | Infinite session timeout |
| Serialize session data properly | Store non-serializable objects |
| Clean up expired sessions | Let sessions accumulate |
| Secure session cookies | Use insecure cookies |

## Production Checklist

- [ ] Distributed store configured (Redis/JDBC)
- [ ] Session timeout set appropriately
- [ ] Cookie security (Secure, HttpOnly, SameSite)
- [ ] Cleanup cron configured
- [ ] Maximum sessions per user
- [ ] Session fixation protection
- [ ] Serialization configured (JSON)
- [ ] Monitoring session count
- [ ] Redis cluster for HA
- [ ] Session events logging

## When NOT to Use This Skill

- **Stateless JWT auth** - Use `jwt` or `spring-security` skills
- **OAuth2 tokens** - Use `oauth2` skill
- **Simple single-instance apps** - In-memory sessions suffice
- **REST APIs** - Consider stateless design

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| In-memory sessions in cluster | Session lost on failover | Use Redis/JDBC store |
| Infinite session timeout | Resource exhaustion | Set appropriate timeout |
| Non-serializable objects | Session save fails | Ensure Serializable |
| No cleanup cron | Sessions accumulate | Configure cleanup |
| Insecure cookies | Session hijacking | Use Secure, HttpOnly |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Session not persisted | Check store-type | Configure Redis/JDBC |
| Session lost between nodes | Check store connectivity | Verify Redis/DB connection |
| Serialization error | Check object types | Make objects Serializable |
| Cookie not sent | Check cookie config | Enable Secure for HTTPS |
| Session expires too fast | Check timeout | Increase session timeout |

## Reference Documentation
- [Spring Session Reference](https://docs.spring.io/spring-session/reference/)
