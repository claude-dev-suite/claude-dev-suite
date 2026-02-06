# Spring HATEOAS Advanced Patterns

## Affordances (HAL-FORMS)

```java
@GetMapping("/{id}")
public EntityModel<User> getUser(@PathVariable Long id) {
    User user = userService.findById(id);

    Link selfLink = linkTo(methodOn(UserController.class).getUser(id)).withSelfRel()
        .andAffordance(afford(methodOn(UserController.class).updateUser(id, null)))
        .andAffordance(afford(methodOn(UserController.class).deleteUser(id)));

    return EntityModel.of(user, selfLink);
}

@PutMapping("/{id}")
public EntityModel<User> updateUser(@PathVariable Long id, @RequestBody User user) {
    return assembler.toModel(userService.update(id, user));
}

@DeleteMapping("/{id}")
public ResponseEntity<?> deleteUser(@PathVariable Long id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
}
```

### HAL-FORMS Response
```json
{
  "id": 1,
  "name": "John",
  "_links": {
    "self": { "href": "http://localhost:8080/api/users/1" }
  },
  "_templates": {
    "default": {
      "method": "PUT",
      "properties": [
        { "name": "name", "type": "text" },
        { "name": "email", "type": "email" }
      ]
    },
    "delete": {
      "method": "DELETE"
    }
  }
}
```

## Link Relations

### Standard Relations (IANA)
```java
// Standard link relations
Link selfLink = linkTo(...).withSelfRel();              // "self"
Link collectionLink = linkTo(...).withRel(IanaLinkRelations.COLLECTION);  // "collection"
Link itemLink = linkTo(...).withRel(IanaLinkRelations.ITEM);              // "item"
Link nextLink = linkTo(...).withRel(IanaLinkRelations.NEXT);              // "next"
Link prevLink = linkTo(...).withRel(IanaLinkRelations.PREV);              // "prev"
Link firstLink = linkTo(...).withRel(IanaLinkRelations.FIRST);            // "first"
Link lastLink = linkTo(...).withRel(IanaLinkRelations.LAST);              // "last"
```

### Custom Relations with Curies
```java
// Curied link relations (namespaced)
LinkRelation customRel = LinkRelation.of("ex:orders");

// In configuration
@Bean
public CurieProvider curieProvider() {
    return new DefaultCurieProvider("ex",
        UriTemplate.of("https://example.com/rels/{rel}"));
}
```

## Media Types Configuration

### application.yml
```yaml
spring:
  hateoas:
    use-hal-as-default-json-media-type: true
```

### Supported Media Types
```java
// HAL (default)
MediaTypes.HAL_JSON

// HAL-FORMS (with affordances)
MediaTypes.HAL_FORMS_JSON

// Collection+JSON
MediaTypes.COLLECTION_JSON

// UBER
MediaTypes.UBER_JSON
```

### Accept Header Negotiation
```java
@GetMapping(value = "/users/{id}", produces = {
    MediaTypes.HAL_JSON_VALUE,
    MediaTypes.HAL_FORMS_JSON_VALUE
})
public EntityModel<User> getUser(@PathVariable Long id) {
    // ...
}
```

## WebMvcLinkBuilder Patterns

```java
// Basic link building
Link link = linkTo(UserController.class).slash("users").slash(1).withSelfRel();

// Method-based (type-safe)
Link link = linkTo(methodOn(UserController.class).getUser(1L)).withSelfRel();

// With request parameters
Link link = linkTo(methodOn(UserController.class)
    .searchUsers("john", PageRequest.of(0, 20)))
    .withRel("search");

// Template variables
Link link = Link.of("/users/{id}")
    .withRel("user")
    .expand(Map.of("id", userId));
```

## Embedded Resources

```java
@GetMapping("/orders/{id}")
public RepresentationModel<?> getOrderWithDetails(@PathVariable Long id) {
    Order order = orderService.findById(id);
    User user = userService.findById(order.getUserId());
    List<OrderItem> items = orderItemService.findByOrderId(id);

    EntityModel<Order> orderModel = EntityModel.of(order,
        linkTo(methodOn(OrderController.class).getOrder(id)).withSelfRel()
    );

    EntityModel<User> userModel = EntityModel.of(user,
        linkTo(methodOn(UserController.class).getUser(user.getId())).withSelfRel()
    );

    CollectionModel<EntityModel<OrderItem>> itemModels =
        itemAssembler.toCollectionModel(items);

    return HalModelBuilder.halModelOf(orderModel)
        .embed(userModel, LinkRelation.of("user"))
        .embed(itemModels, LinkRelation.of("items"))
        .build();
}
```

### Embedded Response
```json
{
  "id": 1,
  "total": 99.99,
  "_embedded": {
    "user": {
      "id": 5,
      "name": "John",
      "_links": { "self": { "href": "/api/users/5" } }
    },
    "items": [...]
  },
  "_links": {
    "self": { "href": "/api/orders/1" }
  }
}
```

## Conditional Links

```java
@Component
public class OrderModelAssembler implements RepresentationModelAssembler<Order, EntityModel<Order>> {

    @Override
    public EntityModel<Order> toModel(Order order) {
        EntityModel<Order> model = EntityModel.of(order,
            linkTo(methodOn(OrderController.class).getOrder(order.getId())).withSelfRel()
        );

        // Conditional links based on state
        if (order.getStatus() == OrderStatus.IN_PROGRESS) {
            model.add(linkTo(methodOn(OrderController.class).cancelOrder(order.getId()))
                .withRel("cancel"));
        }

        if (order.getStatus() == OrderStatus.COMPLETED) {
            model.add(linkTo(methodOn(OrderController.class).refundOrder(order.getId()))
                .withRel("refund"));
        }

        if (order.getStatus() != OrderStatus.CANCELLED) {
            model.add(linkTo(methodOn(InvoiceController.class).getInvoice(order.getId()))
                .withRel("invoice"));
        }

        return model;
    }
}
```

## Testing

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUserWithLinks() throws Exception {
        User user = new User(1L, "John", "john@example.com");
        when(userService.findById(1L)).thenReturn(user);

        mockMvc.perform(get("/api/users/1")
                .accept(MediaTypes.HAL_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(1))
            .andExpect(jsonPath("$.name").value("John"))
            .andExpect(jsonPath("$._links.self.href").value(containsString("/users/1")))
            .andExpect(jsonPath("$._links.users.href").exists());
    }

    @Test
    void shouldReturnPagedUsers() throws Exception {
        Page<User> page = new PageImpl<>(List.of(
            new User(1L, "John", "john@example.com")
        ), PageRequest.of(0, 20), 1);

        when(userService.findAll(any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/users")
                .accept(MediaTypes.HAL_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$._embedded.userList").isArray())
            .andExpect(jsonPath("$.page.totalElements").value(1))
            .andExpect(jsonPath("$._links.self").exists());
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

### Paginated Response
```json
{
  "_embedded": {
    "userList": [...]
  },
  "_links": {
    "self": { "href": "http://localhost:8080/api/users?page=0&size=20" },
    "first": { "href": "http://localhost:8080/api/users?page=0&size=20" },
    "prev": { "href": "http://localhost:8080/api/users?page=0&size=20" },
    "next": { "href": "http://localhost:8080/api/users?page=2&size=20" },
    "last": { "href": "http://localhost:8080/api/users?page=5&size=20" }
  },
  "page": {
    "size": 20,
    "totalElements": 100,
    "totalPages": 5,
    "number": 1
  }
}
```
