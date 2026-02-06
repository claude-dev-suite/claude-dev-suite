---
name: rest-assured
description: |
  REST Assured Java library for testing REST APIs. Covers HTTP requests,
  JSON/XML validation, and Spring Boot integration.

  USE WHEN: user mentions "rest assured", "api test java", "rest api test", asks about "given when then", "RestAssured", "HTTP test", "JSON validation"

  DO NOT USE FOR: Unit tests - use `junit`; E2E browser tests - use Selenium; WebSocket testing - use dedicated tools; Non-Java projects - use language-specific HTTP clients
allowed-tools: Read, Grep, Glob, Write, Edit
---
# REST Assured - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rest-assured` for comprehensive documentation.

## When NOT to Use This Skill

- **Unit Tests** - Use `junit` with Mockito for isolated tests
- **E2E Browser Tests** - Use Selenium or Playwright
- **WebSocket Testing** - Use dedicated WebSocket testing tools
- **Non-Java Projects** - Use language-specific HTTP clients
- **GraphQL APIs** - Consider GraphQL-specific testing tools

## Pattern Essenziali

### GET Request
```java
given()
    .baseUri("http://localhost:8080")
    .contentType("application/json")
.when()
    .get("/api/v1/users/1")
.then()
    .statusCode(200)
    .body("name", equalTo("John"));
```

### POST Request
```java
given()
    .contentType("application/json")
    .body("""
        {"name": "John", "email": "john@example.com"}
        """)
.when()
    .post("/api/v1/users")
.then()
    .statusCode(201)
    .body("id", notNullValue());
```

### Spring Boot Integration
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserApiTest {
    @LocalServerPort
    private int port;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    void shouldGetUsers() {
        given()
        .when().get("/api/v1/users")
        .then().statusCode(200);
    }
}
```

### Authentication
```java
// Bearer Token
given().header("Authorization", "Bearer " + token)

// Basic Auth
given().auth().basic("user", "pass")
```

## Hamcrest Matchers Comuni
| Matcher | Uso |
|---------|-----|
| `equalTo(value)` | Exact match |
| `notNullValue()` | Not null |
| `hasSize(n)` | Collection size |
| `containsString(str)` | String contains |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Hardcoding base URI | Not portable across environments | Use RestAssured.baseURI or config |
| Not setting contentType | Request may fail or be misinterpreted | Always set contentType for POST/PUT |
| Ignoring status codes | Silent failures | Always assert status code |
| Not using path parameters | Hard to read, error-prone | Use {id} placeholders |
| Testing too much in one test | Hard to debug | One endpoint/scenario per test |
| No authentication testing | Security gaps | Test auth headers, tokens |
| Not validating response schema | API contract violations | Use JSON schema validation |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Connection refused" | Server not running | Start server, verify port |
| "Expected status 200 but was 500" | API error or wrong request | Check server logs, validate request body |
| "Cannot deserialize JSON" | Wrong content type or body format | Verify Content-Type header, check JSON |
| Authentication fails | Missing/wrong token | Check Authorization header |
| Timeout | Slow API or network issue | Increase timeout or investigate performance |
| "Path not found" | Wrong URL or method | Verify endpoint exists, check HTTP method |

## Reference Documentation
- [REST Assured Docs](https://rest-assured.io/)
