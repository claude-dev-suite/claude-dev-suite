---
name: spring-validation
description: |
  Bean Validation (JSR-380) with Spring Boot. Covers request validation,
  custom validators, validation groups, and error handling.

  USE WHEN: user mentions "spring validation", "@Valid", "@NotNull", "@NotBlank",
  "bean validation", "request validation", "custom validator", "validation groups",
  "ConstraintValidator", "@Pattern"

  DO NOT USE FOR: business rule validation - use service layer,
  security validation - use `spring-security` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Validation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-validation` for comprehensive documentation.

## Jakarta vs Javax Namespace

**Spring Boot 3.x / Spring 6.x** uses **Jakarta EE 10** with `jakarta.validation` package:

```java
// Spring Boot 3.x - USE THIS
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;

// Spring Boot 2.x - OLD (do not use with Boot 3)
// import javax.validation.Valid;
// import javax.validation.constraints.NotBlank;
```

| Spring Boot | Jakarta EE | Package |
|-------------|-----------|---------|
| 3.x+ | 10 | `jakarta.validation.*` |
| 2.x | 8 | `javax.validation.*` |

---

## Request DTO Validation

```java
@Data
public class CreateUserRequest {

    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    @Pattern(
        regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).*$",
        message = "Password must contain uppercase, lowercase, and number"
    )
    private String password;

    @NotNull(message = "Birth date is required")
    @Past(message = "Birth date must be in the past")
    private LocalDate birthDate;

    @NotNull(message = "Role is required")
    private UserRole role;

    @Min(value = 0, message = "Age must be positive")
    @Max(value = 150, message = "Age must be less than 150")
    private Integer age;

    @DecimalMin(value = "0.0", message = "Salary must be positive")
    private BigDecimal salary;
}
```

## Controller with Validation

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(userService.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> update(
            @PathVariable @Positive Long id,
            @Valid @RequestBody UpdateUserRequest dto) {
        return ResponseEntity.ok(userService.update(id, dto));
    }

    // Validate query params
    @GetMapping
    public ResponseEntity<Page<UserResponse>> findAll(
            @RequestParam @Min(0) int page,
            @RequestParam @Min(1) @Max(100) int size) {
        return ResponseEntity.ok(userService.findAll(page, size));
    }
}
```

## Custom Validator

```java
// Annotation
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = UniqueEmailValidator.class)
@Documented
public @interface UniqueEmail {
    String message() default "Email already registered";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

// Validator
@Component
@RequiredArgsConstructor
public class UniqueEmailValidator implements ConstraintValidator<UniqueEmail, String> {

    private final UserRepository userRepository;

    @Override
    public boolean isValid(String email, ConstraintValidatorContext context) {
        if (email == null) return true; // @NotNull handles this
        return !userRepository.existsByEmail(email);
    }
}

// Usage
@Data
public class RegisterRequest {
    @NotBlank
    @Email
    @UniqueEmail
    private String email;
}
```

## Cross-Field Validation

```java
// Annotation
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PasswordMatchValidator.class)
public @interface PasswordMatch {
    String message() default "Passwords do not match";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

// Validator
public class PasswordMatchValidator
        implements ConstraintValidator<PasswordMatch, PasswordChangeRequest> {

    @Override
    public boolean isValid(PasswordChangeRequest dto, ConstraintValidatorContext context) {
        if (dto.getNewPassword() == null || dto.getConfirmPassword() == null) {
            return true;
        }
        return dto.getNewPassword().equals(dto.getConfirmPassword());
    }
}

// Usage
@Data
@PasswordMatch
public class PasswordChangeRequest {
    @NotBlank
    private String currentPassword;

    @NotBlank
    @Size(min = 8)
    private String newPassword;

    @NotBlank
    private String confirmPassword;
}
```

## Validation Groups

```java
// Group interfaces
public interface OnCreate {}
public interface OnUpdate {}

// DTO with groups
@Data
public class UserRequest {

    @Null(groups = OnCreate.class, message = "ID must be null on create")
    @NotNull(groups = OnUpdate.class, message = "ID is required on update")
    private Long id;

    @NotBlank(groups = {OnCreate.class, OnUpdate.class})
    private String name;

    @NotBlank(groups = OnCreate.class)
    @Null(groups = OnUpdate.class, message = "Email cannot be changed")
    private String email;
}

// Controller
@PostMapping
public ResponseEntity<UserResponse> create(
        @Validated(OnCreate.class) @RequestBody UserRequest dto) {
    return ResponseEntity.status(HttpStatus.CREATED).body(userService.create(dto));
}

@PutMapping("/{id}")
public ResponseEntity<UserResponse> update(
        @PathVariable Long id,
        @Validated(OnUpdate.class) @RequestBody UserRequest dto) {
    return ResponseEntity.ok(userService.update(id, dto));
}
```

## Global Exception Handler

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(error ->
            errors.put(error.getField(), error.getDefaultMessage())
        );
        return ResponseEntity.badRequest()
            .body(ErrorResponse.builder()
                .message("Validation failed")
                .errors(errors)
                .timestamp(LocalDateTime.now())
                .build());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getConstraintViolations().forEach(violation -> {
            String field = violation.getPropertyPath().toString();
            errors.put(field, violation.getMessage());
        });
        return ResponseEntity.badRequest()
            .body(ErrorResponse.builder()
                .message("Validation failed")
                .errors(errors)
                .timestamp(LocalDateTime.now())
                .build());
    }

    // Spring 6.1+ / Spring Boot 3.2+ - Method parameter validation
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleMethodValidation(HandlerMethodValidationException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getAllValidationResults().forEach(result -> {
            result.getResolvableErrors().forEach(error -> {
                String field = error.getCodes() != null && error.getCodes().length > 0
                    ? error.getCodes()[0] : "unknown";
                errors.put(field, error.getDefaultMessage());
            });
        });
        return ResponseEntity.badRequest()
            .body(ErrorResponse.builder()
                .message("Validation failed")
                .errors(errors)
                .timestamp(LocalDateTime.now())
                .build());
    }
}

@Data
@Builder
public class ErrorResponse {
    private String message;
    private Map<String, String> errors;
    private LocalDateTime timestamp;
}
```

## Common Validation Annotations

| Annotation | Purpose |
|------------|---------|
| `@NotNull` | Not null |
| `@NotBlank` | Not null/empty/whitespace (String) |
| `@NotEmpty` | Not null/empty (Collection, String) |
| `@Size` | Size constraints |
| `@Min` / `@Max` | Numeric range |
| `@Email` | Email format |
| `@Pattern` | Regex pattern |
| `@Past` / `@Future` | Date constraints |
| `@Positive` / `@Negative` | Number sign |
| `@Valid` | Cascade validation |
| `@Validated` | With groups |

## Best Practices

| Do | Don't |
|----|-------|
| Use @Valid on @RequestBody | Skip validation on endpoints |
| Create custom validators for domain rules | Put regex in multiple places |
| Use validation groups for context | Create separate DTOs for each operation |
| Return structured error responses | Return raw exception messages |
| Validate early at API boundary | Validate deep in service layer |

## When NOT to Use This Skill

- **Business logic validation** - Use service layer with custom exceptions
- **Security checks** - Use Spring Security annotations
- **Database constraints** - Use JPA constraints additionally
- **External data validation** - Validate after mapping

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Validation in service layer | Duplicated validation | Use @Valid on controller |
| Missing @Valid annotation | Validation bypassed | Always add @Valid |
| Generic error messages | Poor UX | Use specific message attributes |
| Business logic in validators | Tight coupling | Keep validators simple |
| No global exception handler | Inconsistent errors | Add @ControllerAdvice |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Validation not triggered | Check @Valid presence | Add @Valid to parameter |
| Custom validator not called | Check @Constraint annotation | Verify validatedBy class |
| Groups not working | Check @Validated | Use @Validated not @Valid |
| Nested object not validated | Check @Valid on field | Add @Valid to nested field |
| ConstraintViolationException | Path params/query | Add @Validated on controller class |

## Reference Documentation
- [Bean Validation Reference](https://beanvalidation.org/2.0/spec/)
- [Spring Validation](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html)
- [Hibernate Validator](https://hibernate.org/validator/documentation/)
