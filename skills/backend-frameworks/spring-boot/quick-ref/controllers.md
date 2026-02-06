# Spring Boot Controllers

> **Knowledge Base:** Read `knowledge/spring-boot/basics.md` for complete documentation.

## REST Controller

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User management")
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<Page<UserResponse>> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id") String sortBy) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(sortBy));
        return ResponseEntity.ok(userService.findAll(pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<UserResponse> create(
            @Valid @RequestBody CreateUserRequest request) {
        UserResponse user = userService.create(request);
        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(user.getId())
                .toUri();
        return ResponseEntity.created(location).body(user);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRequest request) {
        return ResponseEntity.ok(userService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

## Request Mapping

```java
// HTTP Methods
@GetMapping
@PostMapping
@PutMapping
@PatchMapping
@DeleteMapping

// Path Variables
@GetMapping("/{id}")
public User findById(@PathVariable Long id) {}

@GetMapping("/{userId}/posts/{postId}")
public Post findPost(@PathVariable Long userId, @PathVariable Long postId) {}

// Query Parameters
@GetMapping
public List<User> search(
    @RequestParam String name,
    @RequestParam(required = false) String email,
    @RequestParam(defaultValue = "10") int limit) {}

// Request Body
@PostMapping
public User create(@RequestBody @Valid CreateUserRequest request) {}

// Request Headers
@GetMapping
public User getUser(@RequestHeader("Authorization") String token) {}
```

## Response Handling

```java
// Return entity directly (200 OK)
@GetMapping("/{id}")
public User findById(@PathVariable Long id) {
    return userService.findById(id);
}

// With ResponseEntity
@GetMapping("/{id}")
public ResponseEntity<User> findById(@PathVariable Long id) {
    return userService.findById(id)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.notFound().build());
}

// Custom status
@PostMapping
public ResponseEntity<User> create(@RequestBody User user) {
    User created = userService.create(user);
    return ResponseEntity
        .status(HttpStatus.CREATED)
        .header("X-Custom-Header", "value")
        .body(created);
}
```

## Validation

```java
@PostMapping
public ResponseEntity<User> create(@Valid @RequestBody CreateUserRequest request) {
    // Validation errors handled by @ControllerAdvice
}

// DTO
public class CreateUserRequest {
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100)
    private String name;

    @NotBlank
    @Email(message = "Invalid email")
    private String email;

    @NotBlank
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;
}
```

## OpenAPI Documentation

```java
@Operation(summary = "Get user by ID")
@ApiResponses({
    @ApiResponse(responseCode = "200", description = "User found"),
    @ApiResponse(responseCode = "404", description = "User not found")
})
@GetMapping("/{id}")
public ResponseEntity<UserResponse> findById(
        @Parameter(description = "User ID") @PathVariable Long id) {
    return ResponseEntity.ok(userService.findById(id));
}
```

## File Upload

```java
@PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public ResponseEntity<String> uploadFile(
        @RequestParam("file") MultipartFile file) {
    String filename = storageService.store(file);
    return ResponseEntity.ok(filename);
}
```

**Official docs:** https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html
