---
name: spring-graphql
description: |
  Spring for GraphQL - building GraphQL APIs with Spring Boot.
  Covers queries, mutations, subscriptions, @BatchMapping, DataLoader, and security.

  USE WHEN: user mentions "spring graphql", "@QueryMapping", "@MutationMapping",
  "@SubscriptionMapping", "@BatchMapping", "GraphQL Spring Boot", "N+1 GraphQL"

  DO NOT USE FOR: REST APIs - use standard Spring MVC,
  standalone GraphQL - use `graphql-java` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring for GraphQL - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for DataLoader configuration, custom scalars, pagination implementation, GraphQL testing patterns, and subscription controllers.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-graphql` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-graphql</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

## Configuration

```yaml
spring:
  graphql:
    graphiql:
      enabled: true
      path: /graphiql
    schema:
      locations: classpath:graphql/**/
    path: /graphql
    websocket:
      path: /graphql
```

## Schema Definition

```graphql
type Query {
    bookById(id: ID!): Book
    allBooks: [Book!]!
}

type Mutation {
    createBook(input: CreateBookInput!): Book!
}

type Book {
    id: ID!
    title: String!
    author: Author!
}

input CreateBookInput {
    title: String!
    authorId: ID!
}
```

## Query Controller

```java
@Controller
public class BookController {

    @QueryMapping
    public Book bookById(@Argument String id) {
        return bookRepository.findById(id).orElse(null);
    }

    @QueryMapping
    public List<Book> allBooks() {
        return bookRepository.findAll();
    }

    @SchemaMapping(typeName = "Book", field = "author")
    public Author author(Book book) {
        return authorRepository.findById(book.getAuthorId()).orElse(null);
    }
}
```

## Mutation Controller

```java
@Controller
public class BookMutationController {

    @MutationMapping
    public Book createBook(@Argument CreateBookInput input) {
        return bookService.create(input);
    }
}
```

## BatchMapping (Solve N+1)

```java
@Controller
public class OptimizedBookController {

    @BatchMapping
    public Map<Book, Author> author(List<Book> books) {
        List<String> authorIds = books.stream()
            .map(Book::getAuthorId)
            .distinct()
            .toList();

        Map<String, Author> authorsById = authorRepository.findAllById(authorIds)
            .stream()
            .collect(Collectors.toMap(Author::getId, a -> a));

        return books.stream()
            .collect(Collectors.toMap(
                book -> book,
                book -> authorsById.get(book.getAuthorId())
            ));
    }
}
```

## Input Validation

```java
@MutationMapping
public Book createBook(@Argument @Valid CreateBookInput input) {
    return bookService.create(input);
}

public record CreateBookInput(
    @NotBlank @Size(min = 1, max = 200) String title,
    @NotNull String authorId
) {}
```

## Error Handling

```java
@Component
public class CustomExceptionResolver extends DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable ex, DataFetchingEnvironment env) {
        if (ex instanceof BookNotFoundException) {
            return GraphqlErrorBuilder.newError(env)
                .errorType(ErrorType.NOT_FOUND)
                .message(ex.getMessage())
                .build();
        }
        return null;
    }
}
```

## Security

```java
@Controller
public class SecuredBookController {

    @QueryMapping
    @PreAuthorize("hasRole('USER')")
    public List<Book> allBooks() {
        return bookRepository.findAll();
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Book createBook(@Argument CreateBookInput input) {
        return bookService.create(input);
    }
}
```

## When NOT to Use This Skill

- **REST APIs** - Use standard Spring MVC controllers
- **Standalone GraphQL** - Use graphql-java directly
- **Simple CRUD** - May be overkill, consider REST
- **File uploads** - GraphQL isn't optimized for large binary data

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No @BatchMapping | N+1 queries on nested fields | Use @BatchMapping or DataLoader |
| Unbounded lists | Memory exhaustion | Implement pagination |
| Exposing entities | Schema tightly coupled to DB | Use DTOs/projections |
| No error handling | Stack traces exposed | Custom ExceptionResolver |
| GraphiQL in prod | Security risk | Disable in production |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| N+1 queries | Check SQL logs | Add @BatchMapping |
| Field not resolved | Check method name | Verify @SchemaMapping matches schema |
| Subscription not working | Check WebSocket config | Enable WebSocket support |
| Validation not applied | Check @Valid | Add @Validated to controller |
| Auth not working | Check security config | Add @PreAuthorize annotations |

## Best Practices

| Do | Don't |
|----|-------|
| Use @BatchMapping for N+1 | Fetch nested data individually |
| Define clear schema contracts | Over-expose internal models |
| Implement pagination | Return unbounded lists |
| Use input types for mutations | Use many scalar arguments |
| Add proper error handling | Expose stack traces |

## Production Checklist

- [ ] Schema well defined
- [ ] N+1 solved with BatchMapping
- [ ] Input validation enabled
- [ ] Error handling configured
- [ ] Security annotations applied
- [ ] Pagination implemented
- [ ] GraphiQL disabled in prod
- [ ] Query complexity limits
- [ ] Introspection controlled

## Reference Documentation

- [Spring for GraphQL Reference](https://docs.spring.io/spring-graphql/reference/)
