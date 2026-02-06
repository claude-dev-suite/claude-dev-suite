# Spring GraphQL Advanced Patterns

## DataLoader (Manual Configuration)

```java
@Configuration
public class DataLoaderConfig {

    @Bean
    public BatchLoaderRegistry batchLoaderRegistry(AuthorRepository authorRepository) {
        return new BatchLoaderRegistry() {
            @Override
            public <K, V> DataLoaderOptions getOptions(String dataLoaderName) {
                return DataLoaderOptions.newOptions()
                    .setCachingEnabled(true)
                    .setBatchingEnabled(true);
            }
        };
    }
}

@Controller
public class BookControllerWithDataLoader {

    @SchemaMapping(typeName = "Book", field = "author")
    public CompletableFuture<Author> author(Book book, DataLoader<String, Author> authorLoader) {
        return authorLoader.load(book.getAuthorId());
    }
}
```

---

## Custom Scalars

```java
@Configuration
public class GraphQLScalarConfig {

    @Bean
    public RuntimeWiringConfigurer runtimeWiringConfigurer() {
        return builder -> builder
            .scalar(ExtendedScalars.DateTime)
            .scalar(ExtendedScalars.Date)
            .scalar(ExtendedScalars.Json)
            .scalar(customMoneyScalar());
    }

    private GraphQLScalarType customMoneyScalar() {
        return GraphQLScalarType.newScalar()
            .name("Money")
            .description("Money type with currency")
            .coercing(new Coercing<Money, String>() {
                @Override
                public String serialize(Object dataFetcherResult) {
                    return ((Money) dataFetcherResult).toString();
                }

                @Override
                public Money parseValue(Object input) {
                    return Money.parse((String) input);
                }

                @Override
                public Money parseLiteral(Object input) {
                    return Money.parse(((StringValue) input).getValue());
                }
            })
            .build();
    }
}
```

---

## Pagination Schema

```graphql
type Query {
    books(first: Int, after: String): BookConnection!
}

type BookConnection {
    edges: [BookEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
}

type BookEdge {
    node: Book!
    cursor: String!
}

type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
}
```

---

## Pagination Implementation

```java
@QueryMapping
public Connection<Book> books(
        @Argument Integer first,
        @Argument String after) {

    return ConnectionBuilder.<Book>forList(bookRepository.findAll())
        .first(first)
        .after(after)
        .build();
}
```

---

## GraphQL Testing

```java
@SpringBootTest
@AutoConfigureGraphQlTester
class BookControllerTest {

    @Autowired
    private GraphQlTester graphQlTester;

    @Test
    void shouldGetBookById() {
        graphQlTester.document("""
                query {
                    bookById(id: "1") {
                        id
                        title
                        author {
                            name
                        }
                    }
                }
                """)
            .execute()
            .path("bookById.title").entity(String.class).isEqualTo("Spring in Action")
            .path("bookById.author.name").entity(String.class).isEqualTo("Craig Walls");
    }

    @Test
    void shouldCreateBook() {
        graphQlTester.document("""
                mutation {
                    createBook(input: {
                        title: "New Book"
                        authorId: "1"
                    }) {
                        id
                        title
                    }
                }
                """)
            .execute()
            .path("createBook.id").hasValue()
            .path("createBook.title").entity(String.class).isEqualTo("New Book");
    }

    @Test
    void shouldHandleNotFound() {
        graphQlTester.document("""
                query {
                    bookById(id: "999") {
                        title
                    }
                }
                """)
            .execute()
            .errors()
            .expect(error -> error.getErrorType() == ErrorType.NOT_FOUND);
    }
}
```

---

## Subscription with Flux

```java
@Controller
public class BookSubscriptionController {

    private final Sinks.Many<Book> bookCreatedSink =
        Sinks.many().multicast().onBackpressureBuffer();

    @SubscriptionMapping
    public Flux<Book> bookCreated() {
        return bookCreatedSink.asFlux();
    }

    @SubscriptionMapping
    public Flux<Book> booksByGenre(@Argument String genre) {
        return bookCreatedSink.asFlux()
            .filter(book -> genre.equals(book.getGenre()));
    }

    public Sinks.Many<Book> getBookCreatedSink() {
        return bookCreatedSink;
    }
}
```

---

## Context and Principal Access

```java
@Controller
public class UserAwareController {

    @QueryMapping
    public List<Book> myBooks(@AuthenticationPrincipal User user) {
        return bookRepository.findByOwnerId(user.getId());
    }

    @MutationMapping
    public Book createBook(
            @Argument CreateBookInput input,
            @ContextValue String correlationId,
            GraphQLContext context) {

        User user = context.get("user");
        log.info("Creating book for user {} with correlationId {}",
            user.getId(), correlationId);
        return bookService.create(input, user);
    }
}
```
