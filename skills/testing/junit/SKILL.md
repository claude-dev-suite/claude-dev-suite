---
name: junit
description: |
  JUnit 5 testing framework with Mockito integration. Covers unit tests,
  mocking, and Spring Boot test integration.

  USE WHEN: user mentions "junit", "java test", "mockito", asks about "@Test", "@Mock", "@InjectMocks", "unit test java", "spring boot test"

  DO NOT USE FOR: Integration tests with containers - use `testcontainers`; REST API tests - use `rest-assured`; E2E tests - use Selenium; JavaScript/TypeScript - use `vitest` or `jest`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# JUnit 5 - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `junit` for comprehensive documentation.

## When NOT to Use This Skill

- **Integration Tests with Containers** - Use `testcontainers` for Docker-based tests
- **REST API Testing** - Use `rest-assured` for HTTP/REST testing
- **E2E Web Testing** - Use Selenium or Playwright
- **JavaScript/TypeScript** - Use `vitest` or `jest` for JS/TS
- **Database Integration Tests** - Combine with `spring-boot-integration` skill

## Essential Patterns

### Basic Test
```java
@Test
void shouldAddNumbers() {
    assertEquals(5, calculator.add(2, 3));
    assertThrows(ArithmeticException.class, () -> calculator.divide(10, 0));
}
```

### Mockito + Service Test
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    void shouldCreateUser() {
        when(userRepository.save(any())).thenReturn(user);

        UserResponse result = userService.create(request);

        assertNotNull(result);
        verify(userRepository, times(1)).save(any());
    }
}
```

### Spring Boot Test
```java
@SpringBootTest
@ActiveProfiles("test")
class UserServiceIntegrationTest {

    @Autowired
    private UserService userService;

    @MockBean
    private UserRepository userRepository;

    @Test
    void contextLoads() {
        assertNotNull(userService);
    }
}
```

### Controller Test
```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUsers() throws Exception {
        when(userService.findAll()).thenReturn(users);

        mockMvc.perform(get("/api/v1/users"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("John"));
    }
}
```

### Repository Test
```java
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldFindByEmail() {
        entityManager.persist(user);
        Optional<User> found = userRepository.findByEmail("john@email.com");
        assertTrue(found.isPresent());
    }
}
```

## Common Annotations
| Annotation | Usage |
|------------|-------|
| `@Test` | Test method |
| `@BeforeEach` | Setup before each test |
| `@Mock` | Creates mock |
| `@InjectMocks` | Injects mocks |
| `@SpringBootTest` | Integration test |
| `@WebMvcTest` | Controller test |
| `@DataJpaTest` | Repository test |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using @SpringBootTest for unit tests | Extremely slow | Use @ExtendWith(MockitoExtension.class) |
| Testing private methods | Coupled to implementation | Test through public API |
| No mock cleanup | Tests affect each other | Use @BeforeEach, Mockito.reset() |
| Hardcoded test data | Hard to maintain | Use test data builders or factories |
| Not verifying mock interactions | Silent failures | Use verify() to ensure methods called |
| Too many assertions per test | Hard to debug | One logical assertion per test |
| Ignoring @Disabled tests | Technical debt accumulates | Fix or remove disabled tests |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "NullPointerException in test" | Mock not injected | Check @Mock and @InjectMocks annotations |
| "Wanted but not invoked" | Method not called or wrong args | Verify method call, check argument matchers |
| Test takes too long | Using @SpringBootTest unnecessarily | Use Mockito for unit tests |
| "UnnecessaryStubbingException" | Mock setup but not used | Remove unused when() statements |
| Flaky test | Shared state or timing | Isolate setup, avoid Thread.sleep |
| "No tests found" | Wrong naming convention | Use test* prefix or @Test annotation |

## Reference Documentation
- [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/)
- [Mockito Documentation](https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html)
