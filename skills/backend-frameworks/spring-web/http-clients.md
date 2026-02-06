# HTTP Clients Reference

## RestClient (Spring 6.1+)

RestClient is the new synchronous HTTP client replacing RestTemplate. Fluent API, type-safe, modern.

### Configuration

```java
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient restClient(RestClient.Builder builder) {
        return builder
            .baseUrl("https://api.example.com")
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    // With authentication
    @Bean
    public RestClient authenticatedRestClient(RestClient.Builder builder) {
        return builder
            .baseUrl("https://api.example.com")
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + getToken())
            .requestInterceptor((request, body, execution) -> {
                if (isTokenExpired()) {
                    request.getHeaders().set(HttpHeaders.AUTHORIZATION, "Bearer " + refreshToken());
                }
                return execution.execute(request, body);
            })
            .build();
    }

    // With timeout - Spring Boot 3.2+ (recommended)
    @Bean
    public RestClient restClientWithTimeout(RestClient.Builder builder) {
        return builder
            .baseUrl("https://api.example.com")
            .connectTimeout(Duration.ofSeconds(5))
            .readTimeout(Duration.ofSeconds(30))
            .build();
    }

    // With timeout - using RequestFactory (pre-3.2)
    @Bean
    public RestClient restClientWithRequestFactory(RestClient.Builder builder) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        factory.setReadTimeout(Duration.ofSeconds(30));
        return builder
            .baseUrl("https://api.example.com")
            .requestFactory(factory)
            .build();
    }
}
```

### CRUD Operations

```java
@Service
@RequiredArgsConstructor
public class UserApiClient {

    private final RestClient restClient;

    // GET - Single resource
    public UserDto getUser(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .body(UserDto.class);
    }

    // GET - List with query params
    public List<UserDto> getUsers(String status, int page, int size) {
        return restClient.get()
            .uri(uriBuilder -> uriBuilder
                .path("/users")
                .queryParam("status", status)
                .queryParam("page", page)
                .queryParam("size", size)
                .build())
            .retrieve()
            .body(new ParameterizedTypeReference<List<UserDto>>() {});
    }

    // GET - With ResponseEntity for headers/status access
    public ResponseEntity<UserDto> getUserWithHeaders(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .toEntity(UserDto.class);
    }

    // POST - Create
    public UserDto createUser(CreateUserRequest request) {
        return restClient.post()
            .uri("/users")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(UserDto.class);
    }

    // PUT - Full update
    public UserDto updateUser(Long id, UpdateUserRequest request) {
        return restClient.put()
            .uri("/users/{id}", id)
            .body(request)
            .retrieve()
            .body(UserDto.class);
    }

    // PATCH - Partial update
    public UserDto patchUser(Long id, Map<String, Object> updates) {
        return restClient.patch()
            .uri("/users/{id}", id)
            .body(updates)
            .retrieve()
            .body(UserDto.class);
    }

    // DELETE
    public void deleteUser(Long id) {
        restClient.delete()
            .uri("/users/{id}", id)
            .retrieve()
            .toBodilessEntity();
    }
}
```

### Error Handling

```java
@Service
@RequiredArgsConstructor
public class RobustApiClient {

    private final RestClient restClient;

    // With status handler
    public UserDto getUserSafe(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                if (response.getStatusCode() == HttpStatus.NOT_FOUND) {
                    throw new ResourceNotFoundException("User not found: " + id);
                }
                throw new ClientException("Client error: " + response.getStatusCode());
            })
            .onStatus(HttpStatusCode::is5xxServerError, (request, response) -> {
                throw new ServerException("Server error: " + response.getStatusCode());
            })
            .body(UserDto.class);
    }

    // With Optional
    public Optional<UserDto> findUser(Long id) {
        try {
            return Optional.ofNullable(
                restClient.get()
                    .uri("/users/{id}", id)
                    .retrieve()
                    .body(UserDto.class)
            );
        } catch (RestClientResponseException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                return Optional.empty();
            }
            throw e;
        }
    }

    // Exchange for full control
    public UserDto getUserWithExchange(Long id) {
        return restClient.get()
            .uri("/users/{id}", id)
            .exchange((request, response) -> {
                if (response.getStatusCode().is2xxSuccessful()) {
                    return objectMapper.readValue(response.getBody(), UserDto.class);
                } else if (response.getStatusCode() == HttpStatus.NOT_FOUND) {
                    throw new ResourceNotFoundException("User not found");
                } else {
                    throw new ApiException("Unexpected status: " + response.getStatusCode());
                }
            });
    }
}
```

### Interceptors

```java
// Logging Interceptor
@Slf4j
public class LoggingInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(
            HttpRequest request,
            byte[] body,
            ClientHttpRequestExecution execution) throws IOException {

        logRequest(request, body);
        long startTime = System.currentTimeMillis();
        ClientHttpResponse response = execution.execute(request, body);
        long duration = System.currentTimeMillis() - startTime;
        logResponse(response, duration);
        return response;
    }

    private void logRequest(HttpRequest request, byte[] body) {
        log.debug("==> {} {}", request.getMethod(), request.getURI());
        if (body.length > 0) {
            log.debug("Body: {}", new String(body, StandardCharsets.UTF_8));
        }
    }

    private void logResponse(ClientHttpResponse response, long duration) throws IOException {
        log.debug("<== {} ({} ms)", response.getStatusCode(), duration);
    }
}

// Retry Interceptor
public class RetryInterceptor implements ClientHttpRequestInterceptor {

    private final int maxRetries;
    private final Duration retryDelay;

    @Override
    public ClientHttpResponse intercept(
            HttpRequest request, byte[] body,
            ClientHttpRequestExecution execution) throws IOException {

        IOException lastException = null;
        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                ClientHttpResponse response = execution.execute(request, body);
                if (response.getStatusCode().is5xxServerError() && attempt < maxRetries) {
                    Thread.sleep(retryDelay.toMillis());
                    continue;
                }
                return response;
            } catch (IOException e) {
                lastException = e;
                if (attempt < maxRetries) {
                    try { Thread.sleep(retryDelay.toMillis()); }
                    catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                }
            }
        }
        throw lastException;
    }
}
```

---

## WebClient (Reactive)

For non-blocking calls or WebFlux stack.

### Configuration

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient(WebClient.Builder builder) {
        return builder
            .baseUrl("https://api.example.com")
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .filter(logRequest())
            .filter(logResponse())
            .build();
    }

    // With connection pooling
    @Bean
    public WebClient webClientWithPool() {
        HttpClient httpClient = HttpClient.create()
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
            .responseTimeout(Duration.ofSeconds(30))
            .doOnConnected(conn -> conn
                .addHandlerLast(new ReadTimeoutHandler(30, TimeUnit.SECONDS))
                .addHandlerLast(new WriteTimeoutHandler(10, TimeUnit.SECONDS)));

        return WebClient.builder()
            .baseUrl("https://api.example.com")
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .build();
    }
}
```

### Blocking Usage in MVC

```java
@Service
@RequiredArgsConstructor
public class UserWebClient {

    private final WebClient webClient;

    // Blocking call in MVC context
    public UserDto getUser(Long id) {
        return webClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .bodyToMono(UserDto.class)
            .block();
    }

    // With timeout
    public UserDto getUserWithTimeout(Long id) {
        return webClient.get()
            .uri("/users/{id}", id)
            .retrieve()
            .bodyToMono(UserDto.class)
            .timeout(Duration.ofSeconds(5))
            .block();
    }

    // Parallel calls
    public AggregatedData getAggregatedData(Long userId) {
        Mono<UserDto> userMono = webClient.get()
            .uri("/users/{id}", userId)
            .retrieve()
            .bodyToMono(UserDto.class);

        Mono<List<OrderDto>> ordersMono = webClient.get()
            .uri("/users/{id}/orders", userId)
            .retrieve()
            .bodyToFlux(OrderDto.class)
            .collectList();

        return Mono.zip(userMono, ordersMono)
            .map(tuple -> new AggregatedData(tuple.getT1(), tuple.getT2()))
            .block();
    }
}
```
