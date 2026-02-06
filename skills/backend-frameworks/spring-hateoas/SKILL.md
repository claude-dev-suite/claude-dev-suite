---
name: spring-hateoas
description: |
  Spring HATEOAS for building hypermedia-driven RESTful APIs.
  Covers EntityModel, CollectionModel, RepresentationModelAssembler, HAL, and affordances.

  USE WHEN: user mentions "HATEOAS", "hypermedia", "HAL", "EntityModel",
  "CollectionModel", "RepresentationModelAssembler", "Richardson Maturity Level 3"

  DO NOT USE FOR: simple REST APIs without hypermedia - use plain Spring MVC,
  GraphQL - use `spring-graphql` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring HATEOAS - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for affordances (HAL-FORMS), embedded resources, link relations, media types, and testing patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-hateoas` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-hateoas</artifactId>
</dependency>
```

## Core Concepts

```
Richardson Maturity Model:
Level 0: Plain Old XML/JSON (single endpoint)
Level 1: Resources (multiple endpoints)
Level 2: HTTP Verbs (GET, POST, PUT, DELETE)
Level 3: Hypermedia Controls (HATEOAS) ← This!
```

## EntityModel Wrapper

```java
@GetMapping("/users/{id}")
public EntityModel<User> getUser(@PathVariable Long id) {
    User user = userService.findById(id);

    return EntityModel.of(user,
        linkTo(methodOn(UserController.class).getUser(id)).withSelfRel(),
        linkTo(methodOn(UserController.class).getAllUsers()).withRel("users"),
        linkTo(methodOn(OrderController.class).getOrdersByUser(id)).withRel("orders")
    );
}
```

### Response Format (HAL)
```json
{
  "id": 1,
  "name": "John Doe",
  "_links": {
    "self": { "href": "http://localhost:8080/api/users/1" },
    "users": { "href": "http://localhost:8080/api/users" },
    "orders": { "href": "http://localhost:8080/api/users/1/orders" }
  }
}
```

## CollectionModel

```java
@GetMapping("/users")
public CollectionModel<EntityModel<User>> getAllUsers() {
    List<User> users = userService.findAll();

    List<EntityModel<User>> userModels = users.stream()
        .map(user -> EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel()
        ))
        .toList();

    return CollectionModel.of(userModels,
        linkTo(methodOn(UserController.class).getAllUsers()).withSelfRel()
    );
}
```

## RepresentationModelAssembler

```java
@Component
public class UserModelAssembler implements RepresentationModelAssembler<User, EntityModel<User>> {

    @Override
    public EntityModel<User> toModel(User user) {
        return EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel(),
            linkTo(methodOn(UserController.class).getAllUsers()).withRel("users")
        );
    }
}

// Usage
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;
    private final UserModelAssembler assembler;

    @GetMapping("/{id}")
    public EntityModel<User> getUser(@PathVariable Long id) {
        return assembler.toModel(userService.findById(id));
    }

    @GetMapping
    public CollectionModel<EntityModel<User>> getAllUsers() {
        return assembler.toCollectionModel(userService.findAll());
    }
}
```

## Pagination Support

```java
@GetMapping("/users")
public PagedModel<EntityModel<User>> getAllUsers(
        @PageableDefault(size = 20) Pageable pageable,
        PagedResourcesAssembler<User> pagedAssembler) {

    Page<User> users = userService.findAll(pageable);
    return pagedAssembler.toModel(users, userModelAssembler);
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use ModelAssembler pattern | Build links inline everywhere |
| Include self links always | Omit navigation links |
| Use standard IANA relations | Invent new relation names |
| Add conditional links for actions | Show all links regardless of state |

## When NOT to Use This Skill

- **Simple REST APIs** - If clients don't need hypermedia navigation
- **GraphQL APIs** - Use `spring-graphql` instead
- **Internal microservices** - Often unnecessary overhead

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Building links inline | Duplicated code everywhere | Use RepresentationModelAssembler |
| Missing self links | Clients can't identify resources | Always add withSelfRel() |
| Hardcoded URLs | Breaks on deployment | Use linkTo/methodOn builders |
| Inventing relations | Non-standard, hard to understand | Use IANA link relations |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Links not serialized | Check Accept header | Ensure HAL media type |
| NullPointerException in linkTo | Check controller method | Verify method signature matches |
| Wrong base URL | Check proxy config | Configure server.forward-headers-strategy |
| Pagination links missing | Check assembler | Use PagedResourcesAssembler |

## Production Checklist

- [ ] ModelAssemblers for all resources
- [ ] Self links on every resource
- [ ] Collection links from items
- [ ] Pagination with navigation links
- [ ] Conditional action links
- [ ] IANA link relations where possible

## Reference Documentation
- [Spring HATEOAS Reference](https://docs.spring.io/spring-hateoas/docs/current/reference/html/)
