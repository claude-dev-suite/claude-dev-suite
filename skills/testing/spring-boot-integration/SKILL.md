---
name: spring-boot-integration
description: |
  Spring Boot integration testing with Testcontainers, sliced tests, and full context.
  Covers real database testing, API integration, and end-to-end flows.

  USE WHEN: user mentions "spring integration test", "testcontainers spring", "full context test", asks about "@SpringBootTest webEnvironment", "integration test database", "API integration test"

  DO NOT USE FOR: Unit tests - use `junit`; Slice tests only - use `spring-boot-test`; REST client testing - use `rest-assured`; E2E browser tests - use Selenium
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Boot Integration Testing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot-test` for comprehensive documentation.

## When NOT to Use This Skill

- **Pure Unit Tests** - Use `junit` with Mockito for isolated tests
- **Slice Tests Only** - Use `spring-boot-test` for @WebMvcTest, @DataJpaTest
- **REST Client Testing** - Use `rest-assured` for HTTP/API testing
- **E2E Browser Tests** - Use Selenium or Playwright
- **Contract Testing** - Use Spring Cloud Contract

## Test Annotations

### Full Context
```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class FullIntegrationTest {
    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;
}
```

### Sliced Tests
```java
// Controller layer only
@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired MockMvc mockMvc;
    @MockBean UserService userService;
}

// Repository layer only
@DataJpaTest
class UserRepositoryTest {
    @Autowired TestEntityManager entityManager;
    @Autowired UserRepository repository;
}

// MongoDB layer only
@DataMongoTest
class ProductRepositoryTest {
    @Autowired MongoTemplate mongoTemplate;
}

// JSON serialization
@JsonTest
class UserJsonTest {
    @Autowired JacksonTester<User> json;
}
```

## MockMvc Patterns

### GET Request
```java
mockMvc.perform(get("/api/users/{id}", 1)
        .accept(MediaType.APPLICATION_JSON))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.name").value("John"))
    .andExpect(jsonPath("$.email").value("john@email.com"));
```

### POST Request
```java
mockMvc.perform(post("/api/users")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
            {"name": "John", "email": "john@email.com"}
            """))
    .andExpect(status().isCreated())
    .andExpect(header().exists("Location"))
    .andExpect(jsonPath("$.id").isNumber());
```

### With Authentication
```java
@WithMockUser(roles = "ADMIN")
@Test
void adminCanDeleteUser() throws Exception {
    mockMvc.perform(delete("/api/users/1"))
        .andExpect(status().isNoContent());
}

// Or with custom user
mockMvc.perform(get("/api/profile")
        .with(user("john").roles("USER")))
    .andExpect(status().isOk());
```

### Error Handling
```java
@Test
void shouldReturn404WhenNotFound() throws Exception {
    when(userService.findById(99L))
        .thenThrow(new ResourceNotFoundException("User not found"));

    mockMvc.perform(get("/api/users/99"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("User not found"));
}
```

## @DataJpaTest Patterns

### With Real Database
```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE) // Don't replace with H2
@Testcontainers
class UserRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private UserRepository repository;

    @Test
    void shouldFindByEmail() {
        repository.save(new User("John", "john@email.com"));

        Optional<User> found = repository.findByEmail("john@email.com");

        assertThat(found).isPresent();
    }

    @Test
    void shouldFindActiveUsers() {
        repository.save(User.builder().name("Active").active(true).build());
        repository.save(User.builder().name("Inactive").active(false).build());

        List<User> active = repository.findByActiveTrue();

        assertThat(active).hasSize(1);
    }
}
```

### Custom Queries
```java
@Test
void shouldExecuteCustomQuery() {
    repository.save(new User("John", "john@example.com"));
    repository.save(new User("Jane", "jane@example.com"));

    List<User> users = repository.findByEmailDomain("example.com");

    assertThat(users).hasSize(2);
}
```

## WebEnvironment Options

| Option | Server | Use Case |
|--------|--------|----------|
| `MOCK` | No | MockMvc testing |
| `RANDOM_PORT` | Yes, random port | Full integration |
| `DEFINED_PORT` | Yes, configured port | Specific port needed |
| `NONE` | No | Non-web testing |

## Test Properties

### Inline Properties
```java
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:test",
    "logging.level.org.springframework=DEBUG"
})
class TestWithProperties {
}
```

### Profile-based
```java
@SpringBootTest
@ActiveProfiles("test")
class TestWithProfile {
}
```

### application-test.yml
```yaml
spring:
  jpa:
    show-sql: true
    properties:
      hibernate:
        format_sql: true
  sql:
    init:
      mode: always
```

## Common Assertions

### Response Body
```java
.andExpect(jsonPath("$.name").value("John"))
.andExpect(jsonPath("$.items").isArray())
.andExpect(jsonPath("$.items", hasSize(3)))
.andExpect(jsonPath("$.items[0].name").value("Item 1"))
.andExpect(jsonPath("$.total").value(greaterThan(0)))
```

### Headers
```java
.andExpect(header().string("Content-Type", "application/json"))
.andExpect(header().exists("X-Custom-Header"))
```

### Status
```java
.andExpect(status().isOk())           // 200
.andExpect(status().isCreated())      // 201
.andExpect(status().isNoContent())    // 204
.andExpect(status().isBadRequest())   // 400
.andExpect(status().isUnauthorized()) // 401
.andExpect(status().isForbidden())    // 403
.andExpect(status().isNotFound())     // 404
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using @SpringBootTest for unit tests | Extremely slow | Use @ExtendWith(MockitoExtension.class) |
| Hardcoding ports | Port conflicts | Use webEnvironment = RANDOM_PORT |
| Using H2 for DB-specific features | False confidence | Use Testcontainers with real DB |
| No data cleanup between tests | Tests interfere | Use @Transactional or manual cleanup |
| Not using @ServiceConnection | Manual configuration | Let Spring auto-configure from container |
| Testing with production profile | Dangerous side effects | Use @ActiveProfiles("test") |
| Ignoring test execution time | Slow CI/CD | Optimize with slice tests, parallelize |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Tests very slow | Full context for everything | Use slice tests where possible |
| "Port already in use" | Hardcoded port | Use RANDOM_PORT |
| Flaky tests | Shared state or timing | Isolate data, use @Transactional |
| "Bean not found" | Wrong context configuration | Check @Import or component scan |
| Container won't start | Docker not running | Start Docker daemon |
| "Connection refused" | Wrong host/port | Use container.getHost(), getMappedPort() |

## Reference Documentation
- [Spring Boot Testing Reference](https://docs.spring.io/spring-boot/reference/testing/)
