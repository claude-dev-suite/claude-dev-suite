# HATEOAS Quick Reference

> See [Spring REST SKILL](../SKILL.md) for core knowledge

## Dependency

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-hateoas</artifactId>
</dependency>
```

## EntityModel (Single Resource)

```java
import static org.springframework.hateoas.server.mvc.WebMvcLinkBuilder.*;

@GetMapping("/{id}")
public EntityModel<UserDto> getUser(@PathVariable Long id) {
    UserDto user = userService.findById(id).orElseThrow();

    return EntityModel.of(user,
        linkTo(methodOn(UserController.class).getUser(id)).withSelfRel(),
        linkTo(methodOn(UserController.class).getUsers(0, 10)).withRel("users"),
        linkTo(methodOn(OrderController.class).getUserOrders(id)).withRel("orders"));
}
```

## CollectionModel (Multiple Resources)

```java
@GetMapping
public CollectionModel<EntityModel<UserDto>> getUsers(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size) {

    List<EntityModel<UserDto>> users = userService.findAll(page, size)
        .stream()
        .map(user -> EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel()))
        .toList();

    return CollectionModel.of(users,
        linkTo(methodOn(UserController.class).getUsers(page, size)).withSelfRel());
}
```

## RepresentationModelAssembler

```java
@Component
public class UserModelAssembler
        implements RepresentationModelAssembler<UserDto, EntityModel<UserDto>> {

    @Override
    public EntityModel<UserDto> toModel(UserDto user) {
        return EntityModel.of(user,
            linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel(),
            linkTo(methodOn(UserController.class).getUsers(0, 10)).withRel("users"));
    }
}

// Controller usage
@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserModelAssembler assembler;

    @GetMapping("/{id}")
    public EntityModel<UserDto> getUser(@PathVariable Long id) {
        UserDto user = userService.findById(id).orElseThrow();
        return assembler.toModel(user);
    }

    @GetMapping
    public CollectionModel<EntityModel<UserDto>> getUsers() {
        List<EntityModel<UserDto>> users = userService.findAll()
            .stream()
            .map(assembler::toModel)
            .toList();
        return CollectionModel.of(users,
            linkTo(methodOn(UserController.class).getUsers()).withSelfRel());
    }
}
```

## PagedResourcesAssembler

```java
@GetMapping
public PagedModel<EntityModel<UserDto>> getUsers(
        @PageableDefault(size = 10) Pageable pageable,
        PagedResourcesAssembler<UserDto> pagedAssembler) {

    Page<UserDto> users = userService.findAll(pageable);
    return pagedAssembler.toModel(users, assembler);
}
```

## Link Building

```java
// Self link
linkTo(methodOn(UserController.class).getUser(id)).withSelfRel()

// Named relation
linkTo(methodOn(UserController.class).getUsers(0, 10)).withRel("users")

// With query params
linkTo(methodOn(UserController.class).search("query")).withRel("search")

// Slash builder
linkTo(UserController.class).slash(id).withSelfRel()

// Affordances (actions)
linkTo(methodOn(UserController.class).getUser(id))
    .withSelfRel()
    .andAffordance(afford(methodOn(UserController.class).updateUser(id, null)))
    .andAffordance(afford(methodOn(UserController.class).deleteUser(id)))
```

## Response Format

```json
{
  "id": "123",
  "name": "John Doe",
  "email": "john@example.com",
  "_links": {
    "self": {
      "href": "http://localhost:8080/api/users/123"
    },
    "users": {
      "href": "http://localhost:8080/api/users?page=0&size=10"
    },
    "orders": {
      "href": "http://localhost:8080/api/users/123/orders"
    }
  }
}
```
