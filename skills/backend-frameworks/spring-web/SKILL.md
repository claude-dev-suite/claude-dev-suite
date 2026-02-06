---
name: spring-web
description: |
  Spring Web MVC advanced for Spring Boot 3.x. Covers RestClient (Spring 6.1+),
  WebClient, ResponseEntity patterns, interceptors, content negotiation,
  file upload/download, streaming responses, and custom argument resolvers.

  USE WHEN: user mentions "spring web", "RestClient", "WebClient", "ResponseEntity",
  "HTTP client Spring", "file upload", "file download", "streaming response",
  "HandlerInterceptor", "content negotiation", "argument resolver"

  DO NOT USE FOR: reactive web stack - use `spring-webflux` skill,
  REST controller basics - use `spring-rest` skill,
  WebSocket - use `spring-websocket` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Web MVC Advanced

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-web` for comprehensive documentation.

## Quick Start

```java
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ApiController {

    private final RestClient restClient;

    @GetMapping("/proxy/{id}")
    public ResponseEntity<Resource> proxyRequest(@PathVariable Long id) {
        return restClient.get()
            .uri("/external/resource/{id}", id)
            .retrieve()
            .toEntity(Resource.class);
    }
}

@Configuration
public class RestClientConfig {

    @Bean
    public RestClient restClient(RestClient.Builder builder) {
        return builder
            .baseUrl("https://api.external.com")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .connectTimeout(Duration.ofSeconds(5))
            .readTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```

---

## RestClient Essentials (Spring 6.1+)

RestClient is the new synchronous HTTP client replacing RestTemplate.

```java
@Service
@RequiredArgsConstructor
public class UserApiClient {

    private final RestClient restClient;

    // GET
    public UserDto getUser(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .body(UserDto.class);
    }

    // POST
    public UserDto createUser(CreateUserRequest request) {
        return restClient.post()
            .uri("/users")
            .body(request)
            .retrieve()
            .body(UserDto.class);
    }

    // With error handling
    public UserDto getUserSafe(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                throw new ResourceNotFoundException("User not found: " + id);
            })
            .body(UserDto.class);
    }
}
```

> **Full Reference**: See [http-clients.md](http-clients.md) for complete RestClient and WebClient documentation.

---

## ResponseEntity Quick Patterns

```java
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    // Created with Location
    @PostMapping
    public ResponseEntity<UserResponse> create(
            @Valid @RequestBody CreateUserRequest req,
            UriComponentsBuilder uriBuilder) {

        UserResponse created = service.create(req);
        URI location = uriBuilder.path("/api/v1/users/{id}")
            .buildAndExpand(created.getId()).toUri();

        return ResponseEntity.created(location).body(created);
    }

    // With ETag
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> get(@PathVariable Long id) {
        UserResponse user = service.findById(id);
        return ResponseEntity.ok()
            .eTag("\"" + user.getVersion() + "\"")
            .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS))
            .body(user);
    }

    // No Content
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

> **Full Reference**: See [patterns.md](patterns.md) for ResponseEntity, Content Negotiation, and Streaming.

---

## File Upload/Download Quick Start

```java
// Upload
@PostMapping("/upload")
public ResponseEntity<FileResponse> upload(@RequestParam("file") MultipartFile file) {
    String fileName = storageService.store(file);
    return ResponseEntity.ok(new FileResponse(fileName, file.getSize()));
}

// Download
@GetMapping("/download/{fileName}")
public ResponseEntity<Resource> download(@PathVariable String fileName) {
    Resource resource = storageService.loadAsResource(fileName);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"" + fileName + "\"")
        .body(resource);
}
```

> **Full Reference**: See [file-handling.md](file-handling.md) for complete file operations.

---

## Interceptors Quick Start

```java
@Slf4j
@Component
public class LoggingInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request,
                            HttpServletResponse response, Object handler) {
        MDC.put("requestId", UUID.randomUUID().toString());
        request.setAttribute("startTime", System.currentTimeMillis());
        log.info("==> {} {}", request.getMethod(), request.getRequestURI());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                               HttpServletResponse response,
                               Object handler, Exception ex) {
        long duration = System.currentTimeMillis() -
            (Long) request.getAttribute("startTime");
        log.info("<== {} ({} ms)", response.getStatus(), duration);
        MDC.clear();
    }
}

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loggingInterceptor).addPathPatterns("/api/**");
    }
}
```

> **Full Reference**: See [advanced.md](advanced.md) for Interceptors, Argument Resolvers, Exception Handling, and Testing.

---

## Best Practices

| Do | Don't |
|----|-------|
| Use RestClient for sync calls (Spring 3.2+) | Use deprecated RestTemplate |
| Configure explicit timeouts | Rely on default timeouts |
| Implement retry with exponential backoff | Retry immediately without delay |
| Use interceptors for centralized logging | Log in each method |
| Wrap responses in ResponseEntity | Return raw objects |

---

## When NOT to Use This Skill

- **Reactive applications** - Use `spring-webflux` skill
- **Basic REST controllers** - Use `spring-rest` skill
- **WebSocket communication** - Use `spring-websocket` skill
- **GraphQL APIs** - Use `spring-graphql` skill

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Using RestTemplate | Deprecated, not type-safe | Use RestClient (sync) or WebClient (async) |
| No timeout configuration | Requests hang indefinitely | Configure connect/read timeout |
| Memory leak with streams | Stream not closed | Use try-with-resources |
| N+1 HTTP calls | Calls in loop | Use batch endpoints or parallel calls |
| Blocking in WebFlux | .block() in reactive stack | Keep chain reactive |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection timeout | Check network/firewall | Configure proper timeout values |
| SSL handshake fails | Check certificates | Configure SSLContext properly |
| Response not mapped | Check Content-Type | Configure message converters |
| Interceptor not called | Check registration | Verify interceptor order |
| File upload fails | Check size limits | Configure multipart settings |

---

## Reference Files

| File | Content |
|------|---------|
| [http-clients.md](http-clients.md) | RestClient, WebClient, Interceptors |
| [patterns.md](patterns.md) | ResponseEntity, Content Negotiation, Streaming |
| [file-handling.md](file-handling.md) | File Upload, Download, Storage Service |
| [advanced.md](advanced.md) | Argument Resolvers, HandlerInterceptors, Exception Handling, Testing |

---

## External Documentation

- [Spring Web MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html)
- [RestClient](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-restclient)
- [WebClient](https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html)
