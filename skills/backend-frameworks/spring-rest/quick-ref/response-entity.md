# ResponseEntity Quick Reference

> See [Spring REST SKILL](../SKILL.md) for core knowledge

## Status Codes

```java
// 200 OK
ResponseEntity.ok(body)
ResponseEntity.ok().body(body)

// 201 Created
URI location = ServletUriComponentsBuilder
    .fromCurrentRequest()
    .path("/{id}")
    .buildAndExpand(id)
    .toUri();
ResponseEntity.created(location).body(body)

// 204 No Content
ResponseEntity.noContent().build()

// 400 Bad Request
ResponseEntity.badRequest().body(error)

// 404 Not Found
ResponseEntity.notFound().build()

// 409 Conflict
ResponseEntity.status(HttpStatus.CONFLICT).body(error)

// 500 Internal Server Error
ResponseEntity.internalServerError().body(error)
```

## With Headers

```java
ResponseEntity.ok()
    .header("X-Custom-Header", "value")
    .header("X-Another-Header", "value2")
    .body(data);

// Cache headers
ResponseEntity.ok()
    .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS))
    .body(data);

ResponseEntity.ok()
    .cacheControl(CacheControl.noCache())
    .body(data);

// ETag
ResponseEntity.ok()
    .eTag(etag)
    .body(data);
```

## Optional Pattern

```java
@GetMapping("/{id}")
public ResponseEntity<UserDto> getUser(@PathVariable Long id) {
    return userService.findById(id)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.notFound().build());
}

// With custom error
@GetMapping("/{id}")
public ResponseEntity<?> getUser(@PathVariable Long id) {
    return userService.findById(id)
        .<ResponseEntity<?>>map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(new ErrorResponse("User not found")));
}
```

## Generic Builder

```java
ResponseEntity.status(HttpStatus.OK)
    .contentType(MediaType.APPLICATION_JSON)
    .headers(headers -> {
        headers.set("X-Custom", "value");
        headers.setCacheControl(CacheControl.maxAge(1, TimeUnit.HOURS));
    })
    .body(data);
```

## File Download

```java
@GetMapping("/download/{id}")
public ResponseEntity<Resource> downloadFile(@PathVariable Long id) {
    Resource file = fileService.getFile(id);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"" + file.getFilename() + "\"")
        .body(file);
}
```

## Conditional Responses

```java
@GetMapping("/{id}")
public ResponseEntity<UserDto> getUser(
        @PathVariable Long id,
        @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {

    UserDto user = userService.findById(id).orElseThrow();
    String etag = "\"" + user.getVersion() + "\"";

    if (etag.equals(ifNoneMatch)) {
        return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build();
    }

    return ResponseEntity.ok()
        .eTag(etag)
        .body(user);
}
```

## Common Patterns

```java
// Create with Location
@PostMapping
public ResponseEntity<UserDto> create(@Valid @RequestBody CreateUserDto dto) {
    UserDto created = userService.create(dto);
    URI location = ServletUriComponentsBuilder
        .fromCurrentRequest()
        .path("/{id}")
        .buildAndExpand(created.getId())
        .toUri();
    return ResponseEntity.created(location).body(created);
}

// Update (returns updated or 404)
@PutMapping("/{id}")
public ResponseEntity<UserDto> update(
        @PathVariable Long id,
        @Valid @RequestBody UpdateUserDto dto) {
    return userService.update(id, dto)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.notFound().build());
}

// Delete (always 204)
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable Long id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
}
```
