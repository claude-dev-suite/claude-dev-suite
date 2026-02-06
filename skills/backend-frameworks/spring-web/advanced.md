# Advanced Spring Web Patterns

## Custom Argument Resolvers

```java
// Custom annotation
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
}

// Resolver
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class) &&
               UserPrincipal.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal) {
            return auth.getPrincipal();
        }
        throw new UnauthorizedException("User not authenticated");
    }
}

// Registration
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private CurrentUserArgumentResolver currentUserResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserResolver);
    }
}

// Usage
@GetMapping("/me")
public ResponseEntity<UserResponse> getCurrentUser(@CurrentUser UserPrincipal user) {
    return ResponseEntity.ok(userService.getProfile(user.getId()));
}
```

---

## HandlerInterceptors

### Logging Interceptor

```java
@Slf4j
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request,
                            HttpServletResponse response,
                            Object handler) {
        String requestId = UUID.randomUUID().toString();
        request.setAttribute("requestId", requestId);
        MDC.put("requestId", requestId);

        log.info("==> {} {} (requestId: {})",
            request.getMethod(), request.getRequestURI(), requestId);

        request.setAttribute("startTime", System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                               HttpServletResponse response,
                               Object handler, Exception ex) {
        long startTime = (Long) request.getAttribute("startTime");
        long duration = System.currentTimeMillis() - startTime;

        log.info("<== {} {} - {} ({} ms)",
            request.getMethod(), request.getRequestURI(),
            response.getStatus(), duration);

        MDC.clear();
    }
}
```

### Rate Limiting Interceptor

```java
@Component
@RequiredArgsConstructor
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitService rateLimitService;

    @Override
    public boolean preHandle(HttpServletRequest request,
                            HttpServletResponse response,
                            Object handler) throws Exception {

        String clientId = getClientIdentifier(request);

        if (!rateLimitService.isAllowed(clientId)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\": \"Rate limit exceeded\"}");
            return false;
        }

        return true;
    }

    private String getClientIdentifier(HttpServletRequest request) {
        String apiKey = request.getHeader("X-API-Key");
        return apiKey != null ? "api:" + apiKey : "ip:" + request.getRemoteAddr();
    }
}
```

### Registration

```java
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private RequestLoggingInterceptor loggingInterceptor;

    @Autowired
    private RateLimitInterceptor rateLimitInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loggingInterceptor)
            .addPathPatterns("/api/**");

        registry.addInterceptor(rateLimitInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/health", "/api/info");
    }
}
```

---

## Global Exception Handling

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // Business exceptions
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            ResourceNotFoundException ex, WebRequest request) {

        ErrorResponse error = ErrorResponse.builder()
            .status(HttpStatus.NOT_FOUND.value())
            .error("Not Found")
            .message(ex.getMessage())
            .path(((ServletWebRequest) request).getRequest().getRequestURI())
            .timestamp(LocalDateTime.now())
            .build();

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    // Validation errors
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException ex) {

        Map<String, List<String>> fieldErrors = ex.getBindingResult()
            .getFieldErrors().stream()
            .collect(Collectors.groupingBy(
                FieldError::getField,
                Collectors.mapping(FieldError::getDefaultMessage, Collectors.toList())
            ));

        ErrorResponse error = ErrorResponse.builder()
            .status(HttpStatus.BAD_REQUEST.value())
            .error("Validation Failed")
            .fieldErrors(fieldErrors)
            .timestamp(LocalDateTime.now())
            .build();

        return ResponseEntity.badRequest().body(error);
    }

    // External API errors
    @ExceptionHandler(RestClientResponseException.class)
    public ResponseEntity<ErrorResponse> handleRestClientError(
            RestClientResponseException ex) {

        log.error("External API error: {} - {}",
            ex.getStatusCode(), ex.getResponseBodyAsString());

        ErrorResponse error = ErrorResponse.builder()
            .status(HttpStatus.BAD_GATEWAY.value())
            .error("External Service Error")
            .message("Error communicating with external service")
            .timestamp(LocalDateTime.now())
            .build();

        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error);
    }

    // Catch-all
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);

        ErrorResponse error = ErrorResponse.builder()
            .status(HttpStatus.INTERNAL_SERVER_ERROR.value())
            .error("Internal Server Error")
            .message("An unexpected error occurred")
            .timestamp(LocalDateTime.now())
            .build();

        return ResponseEntity.internalServerError().body(error);
    }
}

@Data
@Builder
public class ErrorResponse {
    private int status;
    private String error;
    private String message;
    private String path;
    private LocalDateTime timestamp;
    private Map<String, List<String>> fieldErrors;
}
```

---

## Testing

### MockMvc Tests

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void getUser_shouldReturnUser() throws Exception {
        UserResponse user = new UserResponse(1L, "John", "john@example.com");
        when(userService.findById(1L)).thenReturn(user);

        mockMvc.perform(get("/api/v1/users/1")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.name").value("John"));
    }

    @Test
    void createUser_shouldReturnCreatedWithLocation() throws Exception {
        CreateUserRequest request = new CreateUserRequest("John", "john@example.com");
        UserResponse created = new UserResponse(1L, "John", "john@example.com");
        when(userService.create(any())).thenReturn(created);

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"));
    }

    @Test
    void createUser_withInvalidData_shouldReturn400() throws Exception {
        CreateUserRequest request = new CreateUserRequest("", "invalid-email");

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.name").exists());
    }
}
```

### RestClient Tests

```java
@SpringBootTest
class UserApiClientTest {

    @Autowired
    private UserApiClient userApiClient;

    private MockRestServiceServer mockServer;

    @BeforeEach
    void setup(@Autowired RestClient.Builder builder) {
        mockServer = MockRestServiceServer.bindTo(builder).build();
    }

    @Test
    void getUser_shouldReturnUser() {
        mockServer.expect(requestTo("/users/1"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(
                "{\"id\":1,\"name\":\"John\"}",
                MediaType.APPLICATION_JSON
            ));

        UserDto user = userApiClient.getUser(1L);

        assertThat(user.getId()).isEqualTo(1L);
        mockServer.verify();
    }
}
```
