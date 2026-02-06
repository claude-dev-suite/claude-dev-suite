# ResponseEntity & Streaming Patterns

## ResponseEntity Patterns

### Complete Examples

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // GET - With custom headers
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
        UserResponse user = userService.findById(id);
        return ResponseEntity.ok()
            .header("X-User-Version", String.valueOf(user.getVersion()))
            .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS))
            .body(user);
    }

    // POST - Created with Location header
    @PostMapping
    public ResponseEntity<UserResponse> createUser(
            @Valid @RequestBody CreateUserRequest request,
            UriComponentsBuilder uriBuilder) {

        UserResponse created = userService.create(request);
        URI location = uriBuilder
            .path("/api/v1/users/{id}")
            .buildAndExpand(created.getId())
            .toUri();

        return ResponseEntity.created(location).body(created);
    }

    // PUT - With ETag for optimistic locking
    @PutMapping("/{id}")
    public ResponseEntity<UserResponse> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRequest request,
            @RequestHeader(value = "If-Match", required = false) String ifMatch) {

        UserResponse updated = userService.update(id, request, ifMatch);
        return ResponseEntity.ok()
            .eTag("\"" + updated.getVersion() + "\"")
            .body(updated);
    }

    // GET conditional with ETag
    @GetMapping("/{id}/conditional")
    public ResponseEntity<UserResponse> getUserConditional(
            @PathVariable Long id, WebRequest webRequest) {

        UserResponse user = userService.findById(id);
        String etag = "\"" + user.getVersion() + "\"";

        if (webRequest.checkNotModified(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
        }

        return ResponseEntity.ok().eTag(etag).body(user);
    }

    // DELETE - No Content
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // Accepted for async operations
    @PostMapping("/{id}/export")
    public ResponseEntity<Void> exportUser(
            @PathVariable Long id, UriComponentsBuilder uriBuilder) {

        String jobId = userService.startExportJob(id);
        URI statusLocation = uriBuilder
            .path("/api/v1/jobs/{jobId}")
            .buildAndExpand(jobId)
            .toUri();

        return ResponseEntity.accepted().location(statusLocation).build();
    }
}
```

### Response Wrapper Pattern

```java
@Data
@Builder
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private String message;
    private LocalDateTime timestamp;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
            .success(true)
            .data(data)
            .timestamp(LocalDateTime.now())
            .build();
    }

    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder()
            .success(false)
            .message(message)
            .timestamp(LocalDateTime.now())
            .build();
    }
}

@Data
@Builder
public class PageResponse<T> {
    private List<T> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;

    public static <T> PageResponse<T> of(Page<T> page) {
        return PageResponse.<T>builder()
            .content(page.getContent())
            .page(page.getNumber())
            .size(page.getSize())
            .totalElements(page.getTotalElements())
            .totalPages(page.getTotalPages())
            .build();
    }
}
```

---

## Content Negotiation

```java
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer
            .favorParameter(true)
            .parameterName("format")
            .defaultContentType(MediaType.APPLICATION_JSON)
            .mediaType("json", MediaType.APPLICATION_JSON)
            .mediaType("xml", MediaType.APPLICATION_XML)
            .mediaType("csv", new MediaType("text", "csv"));
    }

    @Override
    public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
        converters.add(new MappingJackson2HttpMessageConverter());
        converters.add(new MappingJackson2XmlHttpMessageConverter());
        converters.add(new CsvHttpMessageConverter());
    }
}

// Custom CSV Converter
public class CsvHttpMessageConverter extends AbstractHttpMessageConverter<List<?>> {

    public CsvHttpMessageConverter() {
        super(new MediaType("text", "csv"));
    }

    @Override
    protected boolean supports(Class<?> clazz) {
        return List.class.isAssignableFrom(clazz);
    }

    @Override
    protected void writeInternal(List<?> list, HttpOutputMessage outputMessage) throws IOException {
        try (OutputStreamWriter writer = new OutputStreamWriter(outputMessage.getBody())) {
            if (!list.isEmpty()) {
                CsvMapper mapper = new CsvMapper();
                CsvSchema schema = mapper.schemaFor(list.get(0).getClass()).withHeader();
                mapper.writer(schema).writeValue(writer, list);
            }
        }
    }
}

// Controller with multiple formats
@GetMapping(value = "/users", produces = {
    MediaType.APPLICATION_JSON_VALUE,
    MediaType.APPLICATION_XML_VALUE,
    "text/csv"
})
public List<UserReport> getUserReport() {
    return reportService.generateUserReport();
}
```

---

## Streaming Responses

```java
@RestController
@RequestMapping("/api/v1/stream")
public class StreamingController {

    // StreamingResponseBody for async responses
    @GetMapping("/large-data")
    public ResponseEntity<StreamingResponseBody> streamLargeData() {
        StreamingResponseBody stream = outputStream -> {
            try (Writer writer = new OutputStreamWriter(outputStream)) {
                for (int i = 0; i < 1000000; i++) {
                    writer.write("Line " + i + "\n");
                    if (i % 10000 == 0) writer.flush();
                }
            }
        };

        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_PLAIN)
            .body(stream);
    }

    // JSON streaming with Jackson
    @GetMapping(value = "/users-stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    public ResponseEntity<StreamingResponseBody> streamUsers() {
        StreamingResponseBody stream = outputStream -> {
            ObjectMapper mapper = new ObjectMapper();
            try (SequenceWriter writer = mapper.writer().writeValuesAsArray(outputStream)) {
                userRepository.findAllStream().forEach(user -> {
                    try { writer.write(user); }
                    catch (IOException e) { throw new RuntimeException(e); }
                });
            }
        };

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_NDJSON)
            .body(stream);
    }

    // Server-Sent Events
    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamEvents() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);

        executorService.execute(() -> {
            try {
                for (int i = 0; i < 100; i++) {
                    SseEmitter.SseEventBuilder event = SseEmitter.event()
                        .id(String.valueOf(i))
                        .name("update")
                        .data(new EventData("Event " + i, LocalDateTime.now()));

                    emitter.send(event);
                    Thread.sleep(1000);
                }
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
```
