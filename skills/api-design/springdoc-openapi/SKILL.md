---
name: springdoc-openapi
description: |
  Springdoc OpenAPI for API documentation in Spring Boot. Covers Swagger UI
  configuration, annotations, schema customization, and security documentation.
  Based on production patterns from castellino and gestionale-presenze projects.

  USE WHEN: user mentions "Springdoc", "Spring Boot OpenAPI", "Swagger in Spring",
  "@Operation", "@Schema", "Swagger UI Spring", asks about "Spring Boot API documentation",
  "Spring REST documentation", "OpenAPI in Java"

  DO NOT USE FOR: General OpenAPI specs - use `openapi` instead; GraphQL - use `graphql` instead;
  Non-Spring Boot projects; Frontend OpenAPI generation - use `openapi-codegen` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Springdoc OpenAPI (Swagger)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `springdoc-openapi` for comprehensive documentation.

## Maven Configuration

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.6.0</version>
</dependency>
```

## Application Configuration

```yaml
springdoc:
  api-docs:
    path: /v3/api-docs
    enabled: true
  swagger-ui:
    path: /swagger-ui.html
    enabled: true
    operationsSorter: method
    tagsSorter: alpha
    displayRequestDuration: true
    filter: true
  packages-to-scan: com.example.controller
  paths-to-match: /api/**
```

## OpenAPI Configuration

```java
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("My API")
                .version("1.0.0")
                .description("REST API Documentation")
                .contact(new Contact()
                    .name("API Support")
                    .email("support@example.com"))
                .license(new License()
                    .name("MIT")
                    .url("https://opensource.org/licenses/MIT")))
            .externalDocs(new ExternalDocumentation()
                .description("Wiki Documentation")
                .url("https://wiki.example.com"))
            .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
            .components(new Components()
                .addSecuritySchemes("bearerAuth",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("JWT token authentication")));
    }
}
```

## Controller Documentation

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User management endpoints")
public class UserController {

    private final UserService userService;

    @Operation(
        summary = "Get all users",
        description = "Returns a paginated list of all users"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Success",
            content = @Content(schema = @Schema(implementation = PageUserResponse.class))),
        @ApiResponse(responseCode = "401", description = "Unauthorized",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    @GetMapping
    public ResponseEntity<Page<UserResponse>> findAll(
            @Parameter(description = "Page number (0-indexed)")
            @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size")
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(userService.findAll(page, size));
    }

    @Operation(summary = "Get user by ID")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User found"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> findById(
            @Parameter(description = "User ID", required = true, example = "1")
            @PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @Operation(summary = "Create new user")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "User created"),
        @ApiResponse(responseCode = "400", description = "Invalid input")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<UserResponse> create(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                description = "User creation data",
                required = true,
                content = @Content(schema = @Schema(implementation = CreateUserRequest.class)))
            @Valid @RequestBody CreateUserRequest dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(userService.create(dto));
    }
}
```

## Schema Documentation

```java
@Data
@Schema(description = "User creation request")
public class CreateUserRequest {

    @Schema(
        description = "User's full name",
        example = "John Doe",
        minLength = 2,
        maxLength = 100,
        requiredMode = Schema.RequiredMode.REQUIRED
    )
    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    @Schema(
        description = "User's email address",
        example = "john.doe@example.com",
        format = "email",
        requiredMode = Schema.RequiredMode.REQUIRED
    )
    @NotBlank
    @Email
    private String email;

    @Schema(
        description = "User's password",
        example = "SecurePass123!",
        minLength = 8,
        requiredMode = Schema.RequiredMode.REQUIRED,
        accessMode = Schema.AccessMode.WRITE_ONLY
    )
    @NotBlank
    @Size(min = 8)
    private String password;

    @Schema(
        description = "User's role",
        example = "USER",
        defaultValue = "USER",
        allowableValues = {"ADMIN", "MANAGER", "USER"}
    )
    private UserRole role;
}

@Data
@Builder
@Schema(description = "User response")
public class UserResponse {

    @Schema(description = "User ID", example = "1")
    private Long id;

    @Schema(description = "User's name", example = "John Doe")
    private String name;

    @Schema(description = "User's email", example = "john@example.com")
    private String email;

    @Schema(description = "User's role", example = "USER")
    private UserRole role;

    @Schema(description = "Account status", example = "ACTIVE")
    private UserStatus status;

    @Schema(description = "Creation timestamp", example = "2024-01-15T10:30:00")
    private LocalDateTime createdAt;
}
```

## Enum Documentation

```java
@Schema(description = "User roles")
public enum UserRole {
    @Schema(description = "System administrator with full access")
    ADMIN,

    @Schema(description = "Department manager")
    MANAGER,

    @Schema(description = "Regular user")
    USER
}
```

## Security Documentation

```java
// Mark endpoint as public (no auth required)
@Operation(summary = "Login", security = {})
@PostMapping("/auth/login")
public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
    return ResponseEntity.ok(authService.login(request));
}

// Require specific roles in documentation
@Operation(
    summary = "Delete user",
    security = @SecurityRequirement(name = "bearerAuth")
)
@PreAuthorize("hasRole('ADMIN')")
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable Long id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
}
```

## Group APIs by Tag

```java
@Configuration
public class OpenApiConfig {

    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder()
            .group("public")
            .pathsToMatch("/api/v1/public/**")
            .build();
    }

    @Bean
    public GroupedOpenApi adminApi() {
        return GroupedOpenApi.builder()
            .group("admin")
            .pathsToMatch("/api/v1/admin/**")
            .build();
    }
}
```

## Hide Endpoints

```java
@Hidden  // Hide entire controller
@RestController
public class InternalController { }

// Hide specific endpoint
@Operation(hidden = true)
@GetMapping("/internal")
public void internal() { }
```

## Key Annotations

| Annotation | Purpose |
|------------|---------|
| `@Tag` | Group endpoints |
| `@Operation` | Describe endpoint |
| `@Parameter` | Document path/query param |
| `@Schema` | Document model/field |
| `@ApiResponse` | Document response |
| `@Hidden` | Hide from docs |
| `@SecurityRequirement` | Security scheme |

## When NOT to Use This Skill

- General OpenAPI specification writing (use `openapi` skill)
- GraphQL API documentation (use `graphql` skill)
- Non-Spring Boot Java projects
- Frontend OpenAPI client generation (use `openapi-codegen` skill)
- Node.js/TypeScript APIs (use `openapi` or framework-specific skills)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Missing @Operation on endpoints | Poor documentation, no descriptions | Add @Operation to all endpoints |
| No examples in @Schema | Hard to understand API | Add example values to all schemas |
| Exposing DTOs without @Schema | Missing field descriptions | Document all DTO fields with @Schema |
| Not hiding internal endpoints | Exposes implementation details | Use @Hidden for internal endpoints |
| Missing security requirements | Unclear auth requirements | Add @SecurityRequirement where needed |
| No error response documentation | Incomplete API contract | Document all 4xx/5xx responses |
| Using entity classes as API models | Leaks database structure | Create separate DTO classes |
| Hardcoding API info in code | Configuration not externalized | Use application.yml for API metadata |
| Missing @Parameter descriptions | Poor API usability | Document all path/query parameters |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Swagger UI not loading | Incorrect springdoc configuration | Check springdoc.swagger-ui.path in application.yml |
| Endpoints not showing | Controller not in scan path | Check springdoc.packages-to-scan |
| Schema missing fields | Field is private without getter | Add getters or use @Schema on field |
| Security not working in UI | Security scheme not configured | Add @SecurityScheme in config |
| Wrong base path in UI | Server URL not configured | Set servers in OpenAPI config |
| Type errors in generated schema | DTO field type not supported | Use @Schema to specify format |
| Circular reference errors | Self-referencing DTOs | Use @Schema(ref = "#/components/schemas/X") |
| Missing enum values | Enum not documented | Add @Schema to enum fields |
| 404 on /v3/api-docs | springdoc not enabled | Add springdoc dependency, check api-docs.enabled |

## Reference Documentation
- [Springdoc OpenAPI](https://springdoc.org/)
- [OpenAPI 3 Specification](https://swagger.io/specification/)
- [Swagger Annotations](https://github.com/swagger-api/swagger-core/wiki/Swagger-2.X---Annotations)
