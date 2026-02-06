# Async & Streaming Quick Reference

> See [Spring REST SKILL](../SKILL.md) for core knowledge

## Async Controllers

### CompletableFuture

```java
@GetMapping("/{id}")
public CompletableFuture<ResponseEntity<UserDto>> getUser(@PathVariable Long id) {
    return userService.findByIdAsync(id)
        .thenApply(user -> user
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build()));
}

@PostMapping
public CompletableFuture<ResponseEntity<UserDto>> create(@RequestBody CreateUserDto dto) {
    return userService.createAsync(dto)
        .thenApply(user -> {
            URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(user.getId())
                .toUri();
            return ResponseEntity.created(location).body(user);
        });
}
```

### DeferredResult

```java
@GetMapping("/deferred/{id}")
public DeferredResult<ResponseEntity<UserDto>> getDeferred(@PathVariable Long id) {
    DeferredResult<ResponseEntity<UserDto>> result = new DeferredResult<>(5000L);

    result.onTimeout(() -> result.setResult(
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build()));

    userService.findByIdAsync(id)
        .thenAccept(user -> result.setResult(
            user.map(ResponseEntity::ok)
               .orElse(ResponseEntity.notFound().build())));

    return result;
}
```

### Callable

```java
@GetMapping("/callable/{id}")
public Callable<ResponseEntity<UserDto>> getCallable(@PathVariable Long id) {
    return () -> userService.findById(id)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.notFound().build());
}
```

## Server-Sent Events (SSE)

```java
@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<String>> streamEvents() {
    return Flux.interval(Duration.ofSeconds(1))
        .map(seq -> ServerSentEvent.<String>builder()
            .id(String.valueOf(seq))
            .event("message")
            .data("Event " + seq)
            .build());
}

// With data objects
@GetMapping(value = "/notifications", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<Notification>> streamNotifications() {
    return notificationService.getNotifications()
        .map(notification -> ServerSentEvent.<Notification>builder()
            .event("notification")
            .data(notification)
            .build());
}
```

## Streaming Response

### StreamingResponseBody

```java
@GetMapping("/download/{id}")
public ResponseEntity<StreamingResponseBody> downloadFile(@PathVariable Long id) {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=file.csv")
        .body(outputStream -> {
            try (var writer = new OutputStreamWriter(outputStream)) {
                for (var record : dataService.streamRecords(id)) {
                    writer.write(record.toCsv() + "\n");
                    writer.flush();
                }
            }
        });
}
```

### InputStreamResource

```java
@GetMapping("/file/{id}")
public ResponseEntity<InputStreamResource> getFile(@PathVariable Long id) {
    InputStream inputStream = fileService.getFileStream(id);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .body(new InputStreamResource(inputStream));
}
```

## WebFlux (Reactive)

```java
@RestController
@RequestMapping("/api/users")
public class ReactiveUserController {

    @GetMapping("/{id}")
    public Mono<ResponseEntity<UserDto>> getUser(@PathVariable Long id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .defaultIfEmpty(ResponseEntity.notFound().build());
    }

    @GetMapping
    public Flux<UserDto> getUsers() {
        return userService.findAll();
    }

    @PostMapping
    public Mono<ResponseEntity<UserDto>> create(@RequestBody CreateUserDto dto) {
        return userService.create(dto)
            .map(user -> ResponseEntity.created(URI.create("/api/users/" + user.getId())).body(user));
    }
}
```

## Configuration

```java
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(100);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("async-");
        executor.initialize();
        return executor;
    }
}
```
