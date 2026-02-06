# Spring WebFlux Advanced Patterns

## Server-Sent Events

```java
@RestController
@RequestMapping("/api/events")
public class SSEController {

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamEvents() {
        return Flux.interval(Duration.ofSeconds(1))
            .map(sequence -> ServerSentEvent.<String>builder()
                .id(String.valueOf(sequence))
                .event("message")
                .data("Event #" + sequence)
                .build());
    }

    @GetMapping(value = "/notifications", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<Notification> streamNotifications(@RequestParam Long userId) {
        return notificationService.getNotificationsStream(userId);
    }
}

@Service
public class NotificationService {

    private final Sinks.Many<Notification> sink = Sinks.many().multicast().onBackpressureBuffer();

    public Flux<Notification> getNotificationsStream(Long userId) {
        return sink.asFlux()
            .filter(notification -> notification.getUserId().equals(userId));
    }

    public void sendNotification(Notification notification) {
        sink.tryEmitNext(notification);
    }
}
```

---

## Testing

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReactiveControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void getUser_shouldReturnUser() {
        webTestClient.get()
            .uri("/api/users/1")
            .exchange()
            .expectStatus().isOk()
            .expectBody(UserResponse.class)
            .value(user -> {
                assertThat(user.getId()).isEqualTo(1L);
            });
    }

    @Test
    void getAllUsers_shouldReturnFlux() {
        webTestClient.get()
            .uri("/api/users")
            .exchange()
            .expectStatus().isOk()
            .expectBodyList(UserResponse.class)
            .hasSize(3);
    }

    @Test
    void createUser_shouldReturnCreated() {
        CreateUserRequest request = new CreateUserRequest("test@example.com");

        webTestClient.post()
            .uri("/api/users")
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated()
            .expectHeader().exists("Location");
    }
}

// Test con StepVerifier
@SpringBootTest
class ReactiveServiceTest {

    @Autowired
    private UserService userService;

    @Test
    void findById_shouldReturnUser() {
        StepVerifier.create(userService.findById(1L))
            .expectNextMatches(user -> user.getId().equals(1L))
            .verifyComplete();
    }

    @Test
    void findAll_shouldReturnMultipleUsers() {
        StepVerifier.create(userService.findAll())
            .expectNextCount(3)
            .verifyComplete();
    }

    @Test
    void findById_shouldReturnEmpty_whenNotFound() {
        StepVerifier.create(userService.findById(999L))
            .verifyComplete();
    }

    @Test
    void findById_shouldError_onDatabaseFailure() {
        StepVerifier.create(userService.findById(-1L))
            .expectError(DataAccessException.class)
            .verify();
    }

    // Test con virtual time
    @Test
    void interval_shouldEmitValues() {
        StepVerifier.withVirtualTime(() -> Flux.interval(Duration.ofHours(1)).take(3))
            .thenAwait(Duration.ofHours(3))
            .expectNextCount(3)
            .verifyComplete();
    }
}
```

---

## Context Propagation

Context propagation is essential for tracing, MDC logging, and security context in reactive chains.

### Spring Boot 3.2+ Configuration

```yaml
# application.yml
spring:
  reactor:
    context-propagation: auto
```

### Manual Configuration (Reactor 3.5+)

```java
@Configuration
public class ReactorConfig {

    @PostConstruct
    public void enableContextPropagation() {
        Hooks.enableAutomaticContextPropagation();
    }
}
```

### Using Reactor Context

```java
@Service
@Slf4j
public class ContextAwareService {

    // Write to context
    public Mono<User> findUserWithContext(Long id) {
        return userRepository.findById(id)
            .contextWrite(Context.of("userId", id))
            .contextWrite(Context.of("operation", "findUser"));
    }

    // Read from context
    public Mono<User> processWithLogging(Long id) {
        return Mono.deferContextual(ctx -> {
            String traceId = ctx.getOrDefault("traceId", "unknown");
            log.info("Processing user {} with trace {}", id, traceId);
            return userRepository.findById(id);
        });
    }
}
```

### MDC Integration

```java
@Component
public class MdcContextLifter implements CoreSubscriber<Object> {

    public static <T> Mono<T> withMdc(Mono<T> mono) {
        return mono.contextWrite(ctx -> {
            Map<String, String> mdc = MDC.getCopyOfContextMap();
            return mdc != null ? ctx.put("mdc", mdc) : ctx;
        });
    }
}

// Usage with WebFilter
@Component
public class MdcWebFilter implements WebFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String traceId = UUID.randomUUID().toString();
        return chain.filter(exchange)
            .contextWrite(Context.of("traceId", traceId));
    }
}
```

### Micrometer Observation (Recommended)

```java
@Configuration
public class ObservationConfig {

    @Bean
    public ObservationRegistry observationRegistry() {
        return ObservationRegistry.create();
    }
}

@Service
@RequiredArgsConstructor
public class ObservedService {

    private final ObservationRegistry observationRegistry;

    public Mono<User> findUser(Long id) {
        return Mono.just(id)
            .flatMap(this::doFind)
            .tap(Micrometer.observation(observationRegistry));
    }
}
```
