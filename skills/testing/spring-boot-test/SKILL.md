---
name: spring-boot-test
description: |
  Spring Boot testing fundamentals including @SpringBootTest, slice tests,
  MockMvc, mocking with @MockBean, test configuration, and testing utilities.
  For integration tests with Testcontainers, see spring-boot-integration.

  USE WHEN: user mentions "spring boot test", "mockmvc", "@WebMvcTest", "@DataJpaTest", asks about "@SpringBootTest", "@MockBean", "spring test", "controller test", "repository test"

  DO NOT USE FOR: Unit tests - use `junit` with Mockito; Integration tests with real DB - use `spring-boot-integration`; REST API clients - use `rest-assured`; E2E tests - use Selenium
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Boot Testing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-boot-test` for comprehensive documentation.

## When NOT to Use This Skill

- **Pure Unit Tests** - Use `junit` with Mockito for faster tests without Spring context
- **Integration Tests with Real Database** - Use `spring-boot-integration` with Testcontainers
- **REST API Client Testing** - Use `rest-assured` for HTTP testing
- **E2E Web Testing** - Use Selenium or Playwright
- **Microservice Contract Testing** - Use Spring Cloud Contract

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

Includes: JUnit 5, Mockito, AssertJ, Hamcrest, JSONPath, Spring Test

## Test Annotations

### @SpringBootTest - Full Context

```java
@SpringBootTest
class ApplicationTest {
    @Autowired
    private UserService userService;

    @Test
    void contextLoads() {
        assertThat(userService).isNotNull();
    }
}

// With web environment
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class WebApplicationTest {
    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void healthCheck() {
        ResponseEntity<String> response = restTemplate
            .getForEntity("/actuator/health", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
```

### Slice Tests (Faster, Focused)

| Annotation | Layer | Auto-configured |
|------------|-------|-----------------|
| `@WebMvcTest` | Controllers | MockMvc, Jackson |
| `@DataJpaTest` | JPA Repositories | TestEntityManager, DataSource |
| `@DataMongoTest` | MongoDB | MongoTemplate |
| `@JsonTest` | JSON serialization | JacksonTester |
| `@RestClientTest` | REST clients | MockRestServiceServer |

```java
// Controller test - only loads web layer
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void getUser_ReturnsUser() throws Exception {
        when(userService.findById(1L))
            .thenReturn(Optional.of(new User(1L, "John")));

        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("John"));
    }
}

// Repository test - uses embedded database
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private UserRepository repository;

    @Test
    void findByEmail_ReturnsUser() {
        User user = new User("test@example.com", "Test User");
        entityManager.persistAndFlush(user);

        Optional<User> found = repository.findByEmail("test@example.com");

        assertThat(found).isPresent()
            .hasValueSatisfying(u -> assertThat(u.getName()).isEqualTo("Test User"));
    }
}
```

## MockMvc

### Basic Requests

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    // GET request
    @Test
    void getUsers() throws Exception {
        when(userService.findAll()).thenReturn(List.of(
            new User(1L, "Alice"),
            new User(2L, "Bob")
        ));

        mockMvc.perform(get("/api/users")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].name").value("Alice"));
    }

    // POST request with JSON body
    @Test
    void createUser() throws Exception {
        CreateUserRequest request = new CreateUserRequest("John", "john@example.com");
        User createdUser = new User(1L, "John", "john@example.com");

        when(userService.create(any())).thenReturn(createdUser);

        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                        "name": "John",
                        "email": "john@example.com"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"))
            .andExpect(jsonPath("$.id").value(1));
    }

    // PUT request
    @Test
    void updateUser() throws Exception {
        mockMvc.perform(put("/api/users/{id}", 1)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name": "Updated Name"}
                    """))
            .andExpect(status().isOk());

        verify(userService).update(eq(1L), any());
    }

    // DELETE request
    @Test
    void deleteUser() throws Exception {
        mockMvc.perform(delete("/api/users/{id}", 1))
            .andExpect(status().isNoContent());

        verify(userService).delete(1L);
    }
}
```

### With Authentication

```java
@WebMvcTest(AdminController.class)
@Import(SecurityConfig.class)
class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    // Using @WithMockUser
    @Test
    @WithMockUser(roles = "ADMIN")
    void adminEndpoint_WithAdminRole_Succeeds() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard"))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void adminEndpoint_WithUserRole_Forbidden() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard"))
            .andExpect(status().isForbidden());
    }

    // Using JWT token
    @Test
    void withJwtToken() throws Exception {
        String token = jwtTokenProvider.createToken("admin", List.of("ROLE_ADMIN"));

        mockMvc.perform(get("/api/admin/dashboard")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());
    }
}
```

## Mocking

### @MockBean

```java
@SpringBootTest
class OrderServiceTest {

    @Autowired
    private OrderService orderService;

    @MockBean  // Replaces bean in context with mock
    private PaymentGateway paymentGateway;

    @MockBean
    private InventoryService inventoryService;

    @Test
    void placeOrder_WhenPaymentSucceeds_CreatesOrder() {
        when(inventoryService.checkStock(any())).thenReturn(true);
        when(paymentGateway.charge(any())).thenReturn(PaymentResult.success());

        Order order = orderService.placeOrder(new OrderRequest(...));

        assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        verify(paymentGateway).charge(any());
    }

    @Test
    void placeOrder_WhenPaymentFails_ThrowsException() {
        when(paymentGateway.charge(any()))
            .thenThrow(new PaymentException("Card declined"));

        assertThatThrownBy(() -> orderService.placeOrder(new OrderRequest(...)))
            .isInstanceOf(PaymentException.class)
            .hasMessage("Card declined");
    }
}
```

### @SpyBean

```java
@SpringBootTest
class NotificationServiceTest {

    @Autowired
    private NotificationService notificationService;

    @SpyBean  // Wraps real bean, allows partial mocking
    private EmailSender emailSender;

    @Test
    void sendNotification_CallsEmailSender() {
        notificationService.notify(user, "Hello");

        verify(emailSender).send(eq(user.getEmail()), any());
    }

    @Test
    void sendNotification_WhenEmailFails_LogsError() {
        doThrow(new EmailException("SMTP error"))
            .when(emailSender).send(any(), any());

        // Method should handle exception gracefully
        assertThatCode(() -> notificationService.notify(user, "Hello"))
            .doesNotThrowAnyException();
    }
}
```

## Test Configuration

### Test Properties

```java
@SpringBootTest
@TestPropertySource(properties = {
    "app.feature.enabled=true",
    "app.external.url=http://localhost:8080"
})
class FeatureTest { }

// Or use test profile
@SpringBootTest
@ActiveProfiles("test")
class ProfileTest { }
```

### application-test.yml

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop

app:
  external:
    url: http://localhost:${wiremock.server.port}
```

### Custom Test Configuration

```java
@TestConfiguration
public class TestConfig {

    @Bean
    @Primary
    public Clock testClock() {
        return Clock.fixed(
            Instant.parse("2025-01-15T10:00:00Z"),
            ZoneId.of("UTC")
        );
    }

    @Bean
    @Primary
    public PaymentGateway testPaymentGateway() {
        return new FakePaymentGateway();
    }
}

@SpringBootTest
@Import(TestConfig.class)
class TimeBasedFeatureTest { }
```

## AssertJ Assertions

```java
// Basic assertions
assertThat(user.getName()).isEqualTo("John");
assertThat(user.getAge()).isGreaterThan(18);
assertThat(user.getEmail()).contains("@").endsWith(".com");

// Collection assertions
assertThat(users)
    .hasSize(3)
    .extracting(User::getName)
    .containsExactly("Alice", "Bob", "Charlie");

// Exception assertions
assertThatThrownBy(() -> service.process(null))
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessageContaining("null");

// Optional assertions
assertThat(repository.findById(1L))
    .isPresent()
    .hasValueSatisfying(user ->
        assertThat(user.getName()).isEqualTo("John")
    );

// Soft assertions (collect all failures)
SoftAssertions.assertSoftly(softly -> {
    softly.assertThat(user.getName()).isEqualTo("John");
    softly.assertThat(user.getEmail()).contains("@");
    softly.assertThat(user.getAge()).isPositive();
});
```

## Test Data Builders

```java
public class UserTestBuilder {
    private Long id = 1L;
    private String name = "Test User";
    private String email = "test@example.com";
    private UserRole role = UserRole.USER;

    public static UserTestBuilder aUser() {
        return new UserTestBuilder();
    }

    public UserTestBuilder withId(Long id) {
        this.id = id;
        return this;
    }

    public UserTestBuilder withName(String name) {
        this.name = name;
        return this;
    }

    public UserTestBuilder withEmail(String email) {
        this.email = email;
        return this;
    }

    public UserTestBuilder withRole(UserRole role) {
        this.role = role;
        return this;
    }

    public UserTestBuilder asAdmin() {
        this.role = UserRole.ADMIN;
        return this;
    }

    public User build() {
        return new User(id, name, email, role);
    }
}

// Usage
User admin = aUser().withName("Admin").asAdmin().build();
User regularUser = aUser().build();
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using @SpringBootTest for all tests | Extremely slow | Use slice tests (@WebMvcTest, @DataJpaTest) |
| Not using @MockBean | Testing real beans | Mock external dependencies |
| Hardcoding ports in tests | Port conflicts | Use @LocalServerPort with RANDOM_PORT |
| Testing private methods | Coupled to implementation | Test through controller/service API |
| Not isolating test data | Tests interfere | Use @Transactional or cleanup in @AfterEach |
| Ignoring @Sql scripts | Manual setup duplication | Use @Sql for test data setup |
| No test profiles | Polluting dev/prod config | Use @ActiveProfiles("test") |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Unable to find @SpringBootConfiguration" | Main class not found | Add @SpringBootTest(classes = App.class) |
| Test very slow | Using @SpringBootTest unnecessarily | Use slice tests (@WebMvcTest, etc.) |
| "No qualifying bean" | Missing @MockBean | Add @MockBean for dependencies |
| Port already in use | Hardcoded port | Use webEnvironment = RANDOM_PORT |
| "Could not autowire" | Bean not in test context | Check component scan or add @Import |
| Flaky test | Database state not reset | Use @Transactional or @DirtiesContext |

## Reference

- [Quick Reference: Annotations](quick-ref/annotations.md)
- [Spring Boot Testing Guide](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing)
- See also: `spring-boot-integration` for Testcontainers
