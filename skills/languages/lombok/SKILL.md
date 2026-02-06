---
name: lombok
description: |
  Project Lombok for reducing Java boilerplate. Covers annotations for getters,
  setters, constructors, builders, logging, and more. Based on production
  patterns from castellino and gestionale-presenze projects.

  USE WHEN: user mentions "lombok", "@Data", "@Builder", "@Slf4j", asks about
  "boilerplate reduction", "getters/setters", "@RequiredArgsConstructor", "@Value"

  DO NOT USE FOR: Java language features - use `java` skill instead
  DO NOT USE FOR: MapStruct integration - use `mapstruct` skill
  DO NOT USE FOR: Spring annotations - use `backend-spring-boot` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Project Lombok

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `lombok` for comprehensive documentation.

## Maven Configuration

```xml
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <version>1.18.34</version>
    <optional>true</optional>
</dependency>

<!-- For MapStruct compatibility -->
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok-mapstruct-binding</artifactId>
    <version>0.2.0</version>
</dependency>
```

## Common Annotations

### @Data (All-in-One)

```java
@Data
public class User {
    private Long id;
    private String name;
    private String email;
}

// Generates:
// - @Getter for all fields
// - @Setter for all non-final fields
// - @ToString
// - @EqualsAndHashCode
// - @RequiredArgsConstructor
```

### @Getter / @Setter

```java
public class User {
    @Getter @Setter
    private String name;

    @Getter // Read-only
    private final String email;

    @Setter(AccessLevel.PROTECTED)
    private String internalId;
}
```

### @NoArgsConstructor / @AllArgsConstructor / @RequiredArgsConstructor

```java
@NoArgsConstructor
@AllArgsConstructor
public class User {
    private Long id;
    private String name;
}

@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository; // Included in constructor
    private final UserMapper userMapper;         // Included in constructor
    private String cacheName;                    // NOT included
}
```

### @Builder

```java
@Data
@Builder
public class User {
    private Long id;
    private String name;
    private String email;
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;
}

// Usage
User user = User.builder()
    .name("John")
    .email("john@example.com")
    .build();

// With toBuilder for updates
User updated = user.toBuilder()
    .name("Jane")
    .build();
```

### @Value (Immutable)

```java
@Value
public class UserResponse {
    Long id;
    String name;
    String email;
    LocalDateTime createdAt;
}

// Generates:
// - All fields are private final
// - @AllArgsConstructor
// - @Getter (no setters)
// - @ToString
// - @EqualsAndHashCode
```

## Entity Pattern

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

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Exclude from toString/equals for performance
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;
}
```

## Service Pattern with Constructor Injection

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public UserResponse create(CreateUserRequest dto) {
        log.info("Creating user: {}", dto.getEmail());
        User user = userMapper.toEntity(dto);
        return userMapper.toResponse(userRepository.save(user));
    }
}
```

## Logging

```java
@Slf4j  // SLF4J logger
public class UserService {
    public void process() {
        log.info("Processing...");
        log.debug("Debug info: {}", data);
        log.error("Error occurred", exception);
    }
}

@Log4j2  // Log4j2 logger
@CommonsLog  // Apache Commons Logging
@JBossLog  // JBoss Logging
```

## DTO Pattern

```java
// Request DTO
@Data
public class CreateUserRequest {
    @NotBlank
    private String name;
    @Email
    private String email;
    @Size(min = 8)
    private String password;
}

// Response DTO (immutable)
@Value
@Builder
public class UserResponse {
    Long id;
    String name;
    String email;
    UserStatus status;
    LocalDateTime createdAt;
}
```

## @Cleanup

```java
public void readFile(String path) throws IOException {
    @Cleanup InputStream in = new FileInputStream(path);
    // in.close() called automatically
}
```

## @SneakyThrows

```java
@SneakyThrows  // Wraps checked exception
public String readConfig() {
    return Files.readString(Path.of("config.json"));
}
```

## @Synchronized

```java
public class Counter {
    @Synchronized
    public void increment() {
        // Thread-safe
    }
}
```

## @With (Immutable Updates)

```java
@Value
@With
public class Point {
    int x;
    int y;
}

Point p1 = new Point(1, 2);
Point p2 = p1.withX(5);  // Point(5, 2)
```

## Key Annotations

| Annotation | Purpose |
|------------|---------|
| `@Data` | Getter, Setter, ToString, Equals, Constructor |
| `@Value` | Immutable class |
| `@Builder` | Builder pattern |
| `@RequiredArgsConstructor` | Constructor for final fields |
| `@Slf4j` | Logger field |
| `@ToString.Exclude` | Exclude from toString |
| `@EqualsAndHashCode.Exclude` | Exclude from equals/hashCode |

---

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Java core language | `java` skill |
| MapStruct mapping | `mapstruct` skill |
| Spring annotations | `backend-spring-boot` skill |
| JPA entities complex logic | Manual implementation |
| Public API design | Explicit methods for clarity |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| @Data on JPA entities | toString/equals issues | Use @Getter/@Setter selectively |
| Not excluding lazy relations | LazyInitializationException | Use @ToString.Exclude |
| @EqualsAndHashCode on entities | Proxy issues | Use @EqualsAndHashCode(onlyExplicitlyIncluded = true) |
| @SneakyThrows everywhere | Hides exceptions | Use proper exception handling |
| @Builder without @Default | Null fields | Add @Builder.Default |
| @Value with mutable fields | Breaks immutability | Use only immutable types |
| Mixing @Data and manual methods | Confusing API | Be consistent |
| Not configuring in lombok.config | Inconsistent behavior | Use lombok.config file |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot find symbol" for getters | IDE not processing | Enable annotation processing |
| LazyInitializationException | toString on lazy relation | Add @ToString.Exclude |
| MapStruct not working | Wrong processor order | Lombok before MapStruct |
| Builder missing fields | No @Builder.Default | Add defaults or check config |
| StackOverflowError in equals | Circular reference | Exclude relation fields |
| IDE shows errors but compiles | IDE cache | Invalidate caches/restart |
| @Slf4j logger not found | SLF4J not in classpath | Add SLF4J dependency |
| Generated code not visible | delombok needed | Run delombok task |

---

## Reference Documentation
- [Lombok Documentation](https://projectlombok.org/features/)
- [Stable Features](https://projectlombok.org/features/all)
- [Configuration](https://projectlombok.org/features/configuration)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `lombok` for comprehensive documentation.
