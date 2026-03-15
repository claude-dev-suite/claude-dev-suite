# Exception Handling Quick Reference

> See [Spring REST SKILL](../SKILL.md) for core knowledge

## Global Exception Handler

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        log.warn("Resource not found: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse.of("NOT_FOUND", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<FieldError> errors = ex.getBindingResult().getFieldErrors()
            .stream()
            .map(e -> new FieldError(e.getField(), e.getDefaultMessage()))
            .toList();
        return ResponseEntity.badRequest()
            .body(ErrorResponse.validation(errors));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleConflict(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ErrorResponse.of("CONFLICT", "Data integrity violation"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError()
            .body(ErrorResponse.of("INTERNAL_ERROR", "An unexpected error occurred"));
    }
}
```

## Error Response DTO

```java
@Data
@Builder
public class ErrorResponse {
    private String code;
    private String message;
    private List<FieldError> errors;
    private Instant timestamp;

    public static ErrorResponse of(String code, String message) {
        return ErrorResponse.builder()
            .code(code)
            .message(message)
            .timestamp(Instant.now())
            .build();
    }

    public static ErrorResponse validation(List<FieldError> errors) {
        return ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Validation failed")
            .errors(errors)
            .timestamp(Instant.now())
            .build();
    }
}

@Data
@AllArgsConstructor
public class FieldError {
    private String field;
    private String message;
}
```

## Custom Exceptions

```java
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }

    public static ResourceNotFoundException of(String resource, Long id) {
        return new ResourceNotFoundException(resource + " with id " + id + " not found");
    }
}

public class BusinessException extends RuntimeException {
    private final String code;

    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
```

## Validation Exceptions

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
    List<FieldError> errors = ex.getBindingResult().getFieldErrors()
        .stream()
        .map(e -> new FieldError(e.getField(), e.getDefaultMessage()))
        .toList();

    return ResponseEntity.badRequest()
        .body(ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Validation failed")
            .errors(errors)
            .timestamp(Instant.now())
            .build());
}

@ExceptionHandler(ConstraintViolationException.class)
public ResponseEntity<ErrorResponse> handleConstraint(ConstraintViolationException ex) {
    List<FieldError> errors = ex.getConstraintViolations()
        .stream()
        .map(v -> new FieldError(v.getPropertyPath().toString(), v.getMessage()))
        .toList();

    return ResponseEntity.badRequest()
        .body(ErrorResponse.builder()
            .code("VALIDATION_ERROR")
            .message("Constraint violation")
            .errors(errors)
            .timestamp(Instant.now())
            .build());
}
```

## HTTP Status Mapping

| Exception | Status | Code |
|-----------|--------|------|
| ResourceNotFoundException | 404 | NOT_FOUND |
| MethodArgumentNotValidException | 400 | VALIDATION_ERROR |
| DataIntegrityViolationException | 409 | CONFLICT |
| AccessDeniedException | 403 | FORBIDDEN |
| AuthenticationException | 401 | UNAUTHORIZED |
| Exception | 500 | INTERNAL_ERROR |

## Problem Details (RFC 7807)

```java
@ExceptionHandler(ResourceNotFoundException.class)
public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(
        HttpStatus.NOT_FOUND, ex.getMessage());
    problem.setTitle("Resource Not Found");
    problem.setProperty("code", "NOT_FOUND");
    return problem;
}
```
