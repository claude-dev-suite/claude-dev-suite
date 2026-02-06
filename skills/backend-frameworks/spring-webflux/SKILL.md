---
name: spring-webflux
description: |
  Spring WebFlux for reactive programming in Spring Boot 3.x. Covers Mono/Flux,
  reactive operators, WebClient, functional endpoints, R2DBC integration,
  reactive error handling, and testing. Use for non-blocking high-concurrency apps.

  USE WHEN: user mentions "spring webflux", "reactive Spring", "Mono", "Flux",
  "WebClient reactive", "functional endpoints", "R2DBC", "non-blocking",
  "StepVerifier", "reactive streams"

  DO NOT USE FOR: traditional blocking MVC - use `spring-web` skill,
  simple REST APIs - use `spring-rest` skill,
  batch processing - use `spring-batch` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring WebFlux

> **Full Reference**: See [advanced.md](advanced.md) for SSE with Sinks, Testing with StepVerifier, and Context Propagation patterns.

## Quick Start

```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/{id}")
    public Mono<UserResponse> getUser(@PathVariable Long id) {
        return userService.findById(id);
    }

    @GetMapping
    public Flux<UserResponse> getAllUsers() {
        return userService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<UserResponse> createUser(@RequestBody Mono<CreateUserRequest> request) {
        return request.flatMap(userService::create);
    }
}
```

---

## Mono & Flux Basics

### Mono (0 or 1 element)

```java
Mono<String> empty = Mono.empty();
Mono<String> just = Mono.just("Hello");
Mono<String> fromCallable = Mono.fromCallable(() -> expensiveOperation());
Mono<String> defer = Mono.defer(() -> Mono.just(dynamicValue()));
Mono<String> fromOptional = Mono.justOrEmpty(optionalValue);
Mono<String> fromFuture = Mono.fromFuture(completableFuture);
```

### Flux (0 to N elements)

```java
Flux<Integer> just = Flux.just(1, 2, 3);
Flux<Integer> fromIterable = Flux.fromIterable(List.of(1, 2, 3));
Flux<Integer> range = Flux.range(1, 10);
Flux<Long> interval = Flux.interval(Duration.ofSeconds(1));

Flux<Integer> generate = Flux.generate(
    () -> 0,
    (state, sink) -> {
        sink.next(state);
        if (state == 10) sink.complete();
        return state + 1;
    }
);
```

---

## Reactive Operators

### Transformation

```java
// map - transform each element
users.map(user -> new UserResponse(user.getId(), user.getName()));

// flatMap - async transformation (parallel)
users.flatMap(user -> orderRepository.findByUserId(user.getId()));

// flatMapSequential - maintains order
users.flatMapSequential(user -> orderRepository.findByUserId(user.getId()));

// concatMap - sequential, one at a time
users.concatMap(user -> orderRepository.findByUserId(user.getId()));

// switchMap - cancels previous when new arrives
searchTerms.switchMap(term -> searchService.search(term));
```

### Filtering

```java
// filter
users.filter(user -> user.getStatus() == Status.ACTIVE);

// filterWhen - async filter
users.filterWhen(user -> permissionService.canAccess(user.getId()));

// distinct / distinctUntilChanged
items.distinct();
values.distinctUntilChanged();

// take / skip
users.skip((long) page * size).take(size);
```

### Combining

```java
// zip - combine by position
Flux.zip(users, orders, UserWithOrders::new);

// merge - interleave from multiple sources
Flux.merge(source1, source2);

// concat - sequential
Flux.concat(first, second);

// zipWith on Mono
userRepository.findById(userId)
    .zipWith(profileRepository.findByUserId(userId))
    .map(tuple -> new UserWithProfile(tuple.getT1(), tuple.getT2()));
```

### Error Handling

```java
// onErrorReturn - default value on error
userRepository.findById(id).onErrorReturn(new User("default"));

// onErrorResume - fallback Publisher
primaryRepository.findById(id)
    .onErrorResume(e -> fallbackRepository.findById(id));

// onErrorResume with specific type
userRepository.findById(id)
    .onErrorResume(NotFoundException.class, e -> Mono.empty())
    .onErrorResume(TimeoutException.class, e -> cacheRepository.findById(id));

// onErrorMap - transform exception
userRepository.findById(id)
    .onErrorMap(DataAccessException.class,
        e -> new ServiceException("Database error", e));

// retryWhen - advanced retry
userRepository.findById(id)
    .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
        .filter(e -> e instanceof TransientException));
```

### Side Effects

```java
userRepository.findById(id)
    .doOnSubscribe(s -> log.info("Subscribed"))
    .doOnNext(user -> log.info("Found user: {}", user.getId()))
    .doOnError(e -> log.error("Error: {}", e.getMessage()))
    .doFinally(signalType -> log.info("Finally: {}", signalType));
```

---

## WebClient

### Configuration

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient(WebClient.Builder builder) {
        HttpClient httpClient = HttpClient.create()
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
            .responseTimeout(Duration.ofSeconds(30))
            .doOnConnected(conn -> conn
                .addHandlerLast(new ReadTimeoutHandler(30, TimeUnit.SECONDS))
                .addHandlerLast(new WriteTimeoutHandler(10, TimeUnit.SECONDS)));

        return builder
            .baseUrl("https://api.example.com")
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }
}
```

### Usage

```java
@Service
@RequiredArgsConstructor
public class ExternalApiService {

    private final WebClient webClient;

    public Mono<UserDto> getUser(Long id) {
        return webClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .bodyToMono(UserDto.class);
    }

    public Mono<UserDto> getUserSafe(Long id) {
        return webClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .onStatus(HttpStatusCode::is4xxClientError, response ->
                response.bodyToMono(ErrorResponse.class)
                    .flatMap(error -> Mono.error(new ClientException(error.getMessage()))))
            .onStatus(HttpStatusCode::is5xxServerError, response ->
                Mono.error(new ServerException("Server error")))
            .bodyToMono(UserDto.class);
    }

    // Parallel calls
    public Mono<AggregatedData> getAggregatedData(Long userId) {
        return Mono.zip(
            getUser(userId),
            getOrders(userId).collectList(),
            getProfile(userId)
        ).map(tuple -> new AggregatedData(tuple.getT1(), tuple.getT2(), tuple.getT3()));
    }
}
```

---

## Functional Endpoints

```java
@Configuration
public class RouterConfig {

    @Bean
    public RouterFunction<ServerResponse> userRoutes(UserHandler handler) {
        return RouterFunctions.route()
            .path("/api/users", builder -> builder
                .GET("", handler::getAll)
                .GET("/{id}", handler::getById)
                .POST("", handler::create)
                .PUT("/{id}", handler::update)
                .DELETE("/{id}", handler::delete)
            )
            .build();
    }
}

@Component
@RequiredArgsConstructor
public class UserHandler {

    private final UserService userService;

    public Mono<ServerResponse> getById(ServerRequest request) {
        Long id = Long.parseLong(request.pathVariable("id"));
        return userService.findById(id)
            .flatMap(user -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(user))
            .switchIfEmpty(ServerResponse.notFound().build());
    }

    public Mono<ServerResponse> create(ServerRequest request) {
        return request.bodyToMono(CreateUserRequest.class)
            .flatMap(userService::create)
            .flatMap(user -> ServerResponse.created(
                    URI.create("/api/users/" + user.getId()))
                .bodyValue(user));
    }
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Keep chain fully reactive | Use .block() in handlers |
| Use appropriate operators (flatMap vs concatMap) | Mix blocking and reactive |
| Handle errors with onError* operators | Ignore errors |
| Use StepVerifier for testing | Test with .block() |
| Propagate Context for MDC/security | Use ThreadLocal |

## Production Checklist

- [ ] Timeout configured on WebClient
- [ ] Error handling complete
- [ ] Retry logic for transient errors
- [ ] Backpressure strategy defined
- [ ] Context propagation for logging
- [ ] Reactive metrics
- [ ] Test with StepVerifier

## When NOT to Use This Skill

- **Traditional blocking apps** - Use `spring-web` skill
- **Simple CRUD APIs** - Use `spring-rest` skill
- **CPU-bound workloads** - Reactive doesn't help here
- **Team unfamiliar with reactive** - Learning curve is steep

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Nothing executes | Publisher not subscribed | Ensure subscribe/return from controller |
| Blocking call | .block() in reactive chain | Avoid block, use operators |
| Context lost | MDC not propagated | Use Context propagation |
| Memory leak | Infinite Flux without backpressure | Use backpressure operators |
| Cold vs Hot confusion | Publisher recreated every subscribe | Use .share() or .cache() |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Mono/Flux never completes | Check for missing subscribe | Return from controller |
| Context not available | Check propagation | Use Hooks.enableAutomaticContextPropagation() |
| Backpressure overflow | Check buffer size | Use onBackpressure* operators |
| Test times out | Check StepVerifier usage | Use virtual time for delays |
| Memory keeps growing | Check for leaks | Use .limitRate() or .take() |

## Reference Documentation

- [Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)
- [Project Reactor](https://projectreactor.io/docs/core/release/reference/)

## Related Skills

- `spring-r2dbc` - For reactive database access
- `spring-web` - For comparison with MVC
- `spring-websocket` - For reactive WebSocket
