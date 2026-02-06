---
name: spring-rest
description: |
  Spring REST Controller patterns. Covers ResponseEntity, exception handling,
  validation, HATEOAS, content negotiation, and async controllers.

  USE WHEN: user mentions "spring rest", "@RestController", "ResponseEntity",
  "REST API Spring", "exception handling Spring", "@ControllerAdvice"

  DO NOT USE FOR: GraphQL - use `spring-graphql` skill,
  WebFlux reactive - use `spring-webflux` skill,
  HATEOAS deep dive - use `spring-hateoas` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Spring REST Core Knowledge

## Controller Basics

```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<UserDto>> getUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        List<UserDto> users = userService.findAll(page, size);
        return ResponseEntity.ok(users);
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserDto dto) {
        UserDto created = userService.create(dto);
        URI location = ServletUriComponentsBuilder
            .fromCurrentRequest()
            .path("/{id}")
            .buildAndExpand(created.getId())
            .toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserDto> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserDto dto) {
        return userService.update(id, dto)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

## ResponseEntity Patterns

```java
// 200 OK with body
return ResponseEntity.ok(data);
return ResponseEntity.ok().body(data);

// 201 Created with Location header
URI location = ServletUriComponentsBuilder
    .fromCurrentRequest()
    .path("/{id}")
    .buildAndExpand(id)
    .toUri();
return ResponseEntity.created(location).body(data);

// 204 No Content
return ResponseEntity.noContent().build();

// 400 Bad Request
return ResponseEntity.badRequest().body(error);

// 404 Not Found
return ResponseEntity.notFound().build();

// Custom status
return ResponseEntity.status(HttpStatus.CONFLICT).body(error);

// With headers
return ResponseEntity.ok()
    .header("X-Custom-Header", "value")
    .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS))
    .body(data);
```

---

## Global Exception Handling

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        log.warn("Resource not found: {}", ex.getMessage());
        ErrorResponse error = ErrorResponse.builder()
            .code("NOT_FOUND")
            .message(ex.getMessage())
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<FieldError> fieldErrors = ex.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(err -> new FieldError(err.getField(), err.getDefaultMessage()))
            .toList();

        ErrorResponse error = ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Validation failed")
            .errors(fieldErrors)
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.badRequest().body(error);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleConflict(DataIntegrityViolationException ex) {
        ErrorResponse error = ErrorResponse.builder()
            .code("CONFLICT")
            .message("Data integrity violation")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        ErrorResponse error = ErrorResponse.builder()
            .code("INTERNAL_ERROR")
            .message("An unexpected error occurred")
            .timestamp(Instant.now())
            .build();
        return ResponseEntity.internalServerError().body(error);
    }
}

@Data
@Builder
public class ErrorResponse {
    private String code;
    private String message;
    private List<FieldError> errors;
    private Instant timestamp;
}
```

---

## Validation

```java
// DTO with validation
@Data
public class CreateUserDto {
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be 2-100 characters")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotNull(message = "Role is required")
    private Role role;

    @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$", message = "Invalid phone number")
    private String phone;
}

// Controller with validation
@PostMapping
public ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserDto dto) {
    // Validation happens automatically
    return ResponseEntity.ok(userService.create(dto));
}

// Validation groups
public interface OnCreate {}
public interface OnUpdate {}

@Data
public class UserDto {
    @Null(groups = OnCreate.class)
    @NotNull(groups = OnUpdate.class)
    private Long id;

    @NotBlank(groups = {OnCreate.class, OnUpdate.class})
    private String name;
}

@PostMapping
public ResponseEntity<UserDto> create(
        @Validated(OnCreate.class) @RequestBody UserDto dto) {
    return ResponseEntity.ok(userService.create(dto));
}
```

---

## HATEOAS

```java
// Add dependency
// spring-boot-starter-hateoas

@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")
    public EntityModel<UserDto> getUser(@PathVariable Long id) {
        UserDto user = userService.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        return EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(id)).withSelfRel(),
            linkTo(methodOn(UserController.class).getUsers(0, 10)).withRel("users"),
            linkTo(methodOn(OrderController.class).getUserOrders(id)).withRel("orders")
        );
    }

    @GetMapping
    public CollectionModel<EntityModel<UserDto>> getUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        List<EntityModel<UserDto>> users = userService.findAll(page, size)
            .stream()
            .map(user -> EntityModel.of(user,
                linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel()))
            .toList();

        return CollectionModel.of(users,
            linkTo(methodOn(UserController.class).getUsers(page, size)).withSelfRel());
    }
}
```

### RepresentationModelAssembler

```java
@Component
public class UserModelAssembler implements RepresentationModelAssembler<UserDto, EntityModel<UserDto>> {

    @Override
    public EntityModel<UserDto> toModel(UserDto user) {
        return EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel(),
            linkTo(methodOn(UserController.class).getUsers(0, 10)).withRel("users"));
    }
}

// Usage in controller
@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserModelAssembler assembler;

    @GetMapping("/{id}")
    public EntityModel<UserDto> getUser(@PathVariable Long id) {
        UserDto user = userService.findById(id).orElseThrow();
        return assembler.toModel(user);
    }
}
```

---

## Content Negotiation

```java
// Controller supporting multiple formats
@GetMapping(value = "/{id}", produces = {
    MediaType.APPLICATION_JSON_VALUE,
    MediaType.APPLICATION_XML_VALUE
})
public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
    return ResponseEntity.ok(userService.findById(id).orElseThrow());
}

// Configuration
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
            .favorParameter(true)
            .parameterName("format")
            .defaultContentType(MediaType.APPLICATION_JSON)
            .mediaType("json", MediaType.APPLICATION_JSON)
            .mediaType("xml", MediaType.APPLICATION_XML);
    }
}
```

---

## API Versioning

### URL Versioning

```java
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 { }

@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 { }
```

### Header Versioning

```java
@GetMapping(value = "/users", headers = "X-API-Version=1")
public List<UserV1Dto> getUsersV1() { }

@GetMapping(value = "/users", headers = "X-API-Version=2")
public List<UserV2Dto> getUsersV2() { }
```

### Media Type Versioning

```java
@GetMapping(value = "/users", produces = "application/vnd.company.v1+json")
public List<UserV1Dto> getUsersV1() { }

@GetMapping(value = "/users", produces = "application/vnd.company.v2+json")
public List<UserV2Dto> getUsersV2() { }
```

---

## Async Controllers

```java
@GetMapping("/async/{id}")
public CompletableFuture<ResponseEntity<UserDto>> getAsync(@PathVariable Long id) {
    return userService.findByIdAsync(id)
        .thenApply(user -> user
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build()));
}

@GetMapping("/deferred/{id}")
public DeferredResult<ResponseEntity<UserDto>> getDeferred(@PathVariable Long id) {
    DeferredResult<ResponseEntity<UserDto>> result = new DeferredResult<>();

    userService.findByIdAsync(id)
        .thenAccept(user -> result.setResult(
            user.map(ResponseEntity::ok)
               .orElse(ResponseEntity.notFound().build())));

    return result;
}

@GetMapping("/callable/{id}")
public Callable<ResponseEntity<UserDto>> getCallable(@PathVariable Long id) {
    return () -> userService.findById(id)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.notFound().build());
}
```

---

## Streaming Response

```java
// Server-Sent Events
@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<String>> streamEvents() {
    return Flux.interval(Duration.ofSeconds(1))
        .map(seq -> ServerSentEvent.<String>builder()
            .id(String.valueOf(seq))
            .event("message")
            .data("Event " + seq)
            .build());
}

// Large file download
@GetMapping("/download/{id}")
public ResponseEntity<StreamingResponseBody> downloadFile(@PathVariable Long id) {
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=file.csv")
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(outputStream -> {
            // Write data to outputStream
            fileService.writeToStream(id, outputStream);
        });
}
```

---

## Production Readiness

### Request/Response Logging

```java
@Component
public class LoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        long start = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString();
        MDC.put("requestId", requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - start;
            log.info("{} {} {} {}ms",
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                duration);
            MDC.clear();
        }
    }
}
```

### Checklist

- [ ] ResponseEntity for all responses
- [ ] Global exception handler
- [ ] Input validation with @Valid
- [ ] Proper HTTP status codes
- [ ] Location header for 201 Created
- [ ] HATEOAS links where appropriate
- [ ] Content negotiation configured
- [ ] API versioning strategy
- [ ] Request logging with timing
- [ ] Request ID tracking

## When NOT to Use This Skill

- **GraphQL APIs** - Use `spring-graphql` skill
- **Reactive/WebFlux** - Use `spring-webflux` skill
- **HATEOAS deep dive** - Use `spring-hateoas` skill
- **gRPC** - Use gRPC-specific patterns

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Returning entities | Tight coupling | Use DTOs |
| No exception handler | Inconsistent errors | Add @ControllerAdvice |
| Missing @Valid | No input validation | Add @Valid annotation |
| Wrong HTTP status | Confuses clients | Use proper status codes |
| Missing Location header | 201 incomplete | Add Location for POST |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| 415 Unsupported Media | Check Content-Type | Add produces/consumes |
| Validation not working | Check @Valid | Add @Valid to @RequestBody |
| Exception not caught | Check advice | Verify @RestControllerAdvice |
| Wrong JSON field names | Check serialization | Configure Jackson |
| CORS errors | Check CORS config | Add @CrossOrigin or config |

## Reference Documentation
- [Spring MVC Reference](https://docs.spring.io/spring-framework/reference/web/webmvc.html)
