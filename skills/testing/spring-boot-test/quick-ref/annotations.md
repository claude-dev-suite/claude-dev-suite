# Spring Boot Test Annotations Quick Reference

## Full Context

```java
@SpringBootTest
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
```

## Slice Tests

| Annotation | Layer | Use Case |
|------------|-------|----------|
| `@WebMvcTest` | Controller | REST API tests |
| `@DataJpaTest` | Repository | JPA/Database tests |
| `@DataMongoTest` | MongoDB | MongoDB tests |
| `@JsonTest` | JSON | Serialization tests |
| `@RestClientTest` | Client | HTTP client tests |

## Mocking

```java
@MockBean     // Replace bean with mock
@SpyBean      // Wrap real bean
```

## Configuration

```java
@TestPropertySource(properties = "key=value")
@ActiveProfiles("test")
@Import(TestConfig.class)
```

## Security

```java
@WithMockUser(roles = "ADMIN")
@WithMockUser(username = "user", authorities = "READ")
```

## MockMvc

```java
mockMvc.perform(get("/api/users"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.name").value("John"));

mockMvc.perform(post("/api/users")
    .contentType(MediaType.APPLICATION_JSON)
    .content(jsonContent))
    .andExpect(status().isCreated());
```

## AssertJ

```java
assertThat(value).isEqualTo(expected);
assertThat(list).hasSize(3).contains(item);
assertThatThrownBy(() -> method()).isInstanceOf(Exception.class);
```
