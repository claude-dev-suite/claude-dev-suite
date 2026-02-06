---
name: spring-boot
description: |
  Spring Boot 3 Java framework with enterprise patterns. Covers REST controllers,
  services, repositories, JPA entities, MapStruct mappers, Lombok, JWT security,
  Flyway migrations, and global exception handling.

  USE WHEN: user mentions "Spring Boot", "REST API", "enterprise Java", asks about "controller patterns", "service layer", "repository", "DTO mapping", "JWT auth", "Flyway", "MapStruct"

  DO NOT USE FOR: Spring Data JPA (use `spring-data-jpa`), Spring Security (use `spring-security`), Spring WebFlux (use `spring-webflux`), Spring WebSocket (use `spring-websocket`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Boot 3 Enterprise Patterns

> **Full Reference**: See [production.md](production.md) for configuration profiles, health checks, logging, graceful shutdown, and caching.

## Controller with DTOs

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User management endpoints")
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<UserResponse>> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(userService.findAll(page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> update(
            @PathVariable Long id, @Valid @RequestBody UpdateUserRequest dto) {
        return ResponseEntity.ok(userService.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

## Service with MapStruct

```java
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public List<UserResponse> findAll(int page, int size) {
        return userRepository.findAll(PageRequest.of(page, size))
            .map(userMapper::toResponse).getContent();
    }

    @Override
    public UserResponse findById(Long id) {
        return userRepository.findById(id)
            .map(userMapper::toResponse)
            .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));
    }

    @Override
    @Transactional
    public UserResponse create(CreateUserRequest dto) {
        if (userRepository.existsByEmail(dto.getEmail())) {
            throw new BadRequestException("Email already registered");
        }
        User user = userMapper.toEntity(dto);
        user.setPassword(passwordEncoder.encode(dto.getPassword()));
        return userMapper.toResponse(userRepository.save(user));
    }
}
```

## MapStruct Mapper

```java
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface UserMapper {

    UserResponse toResponse(User user);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "password", ignore = true)
    User toEntity(CreateUserRequest dto);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateEntity(UpdateUserRequest dto, @MappingTarget User user);
}
```

## Entity with Lombok & Auditing

```java
@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role = UserRole.USER;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

## DTOs with Validation

```java
@Data
public class CreateUserRequest {
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100)
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;
}

@Data
@Builder
public class UserResponse {
    private Long id;
    private String name;
    private String email;
    private UserRole role;
    private LocalDateTime createdAt;
}
```

## Global Exception Handler

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse.of(ex.getMessage()));
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException ex) {
        return ResponseEntity.badRequest().body(ErrorResponse.of(ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = ex.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a));
        return ResponseEntity.badRequest().body(ErrorResponse.of("Validation failed", errors));
    }
}
```

## JWT Security Configuration

```java
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

## Flyway Migration

```sql
-- V1__create_users_table.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

## Key Annotations

| Annotation | Purpose |
|------------|---------|
| `@RestController` | REST controller |
| `@RequiredArgsConstructor` | Lombok constructor injection |
| `@Transactional` | Transaction management |
| `@Valid` | Bean validation |
| `@Mapper` | MapStruct mapper |
| `@EntityListeners` | JPA auditing |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Manual constructor injection | Verbose, error-prone | Use `@RequiredArgsConstructor` |
| Manual DTO mapping | Boilerplate code | Use MapStruct |
| Try-catch in every controller | Code duplication | Use `@ControllerAdvice` |
| Forget `@Transactional` | Data inconsistency | Always use for write operations |
| Manual schema changes | Migration chaos | Use Flyway or Liquibase |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| LazyInitializationException | Open-in-view disabled | Fetch data in transaction |
| 401 Unauthorized | Security misconfigured | Check SecurityFilterChain |
| Validation not working | Missing `@Valid` | Add `@Valid` on `@RequestBody` |
| Mapper not found | MapStruct not processed | Run `mvn compile` |
| Flyway migration fails | Checksum mismatch | Fix migration or use repair |

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot` for comprehensive documentation.

> **Note:** For JPA and Security, use dedicated skills `spring-data-jpa` and `spring-security`.
